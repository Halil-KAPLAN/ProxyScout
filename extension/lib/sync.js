// Senkronizasyon özeti (snapshot): cihazlar arasında taşınan küçük, sıkıştırılmış durum.
// Binlerce ölü/yeni proxy taşınmaz (her cihaz yeniden indirebilir); yalnızca değerli kısım:
// çalışan proxy'ler (test sonuçlarıyla), favoriler, kullanıcının eklediği proxy'ler,
// kaynak seçimleri ve ayarlar. Birleştirme "son yazan kazanır" mantığıyla, alan bazında yapılır.

export const SNAPSHOT_VERSION = 1;

const TYPE_CODE = { http: 'h', socks4: '4', socks5: '5' };
const CODE_TYPE = { h: 'http', 4: 'socks4', 5: 'socks5' };
const ANON_CODE = { elite: 'e', anonymous: 'a', transparent: 't' };
const CODE_ANON = { e: 'elite', a: 'anonymous', t: 'transparent' };
const STATUS_CODE = { alive: 'a', dead: 'd', new: 'n' };
const CODE_STATUS = { a: 'alive', d: 'dead', n: 'new' };

// Cihaza özgü kalması gereken ayarlar (senkronize edilmez).
export const LOCAL_ONLY_SETTINGS = ['driveClientId'];

const priority = (p) => (p.fav || p.mine ? 0 : p.status === 'alive' && p.ssl === true ? 1 : p.status === 'alive' ? 2 : 3);
const score = (p) => p.sslMs ?? (p.latency != null ? p.latency + 1e5 : 1e9);

export function snapshotCandidates(proxies) {
  return [...proxies]
    .filter((p) => p.status === 'alive' || p.fav || p.mine)
    .sort((a, b) => priority(a) - priority(b) || score(a) - score(b));
}

// Proxy → kısa dizi. Zamanlar dakika cinsinden (boyut için).
function packProxy(p) {
  const min = (t) => (t ? Math.round(t / 60000) : 0);
  const row = [
    TYPE_CODE[p.type] || 'h', p.host, p.port, STATUS_CODE[p.status] || 'n', ANON_CODE[p.anon] || '',
    p.ssl === true ? 1 : p.ssl === false ? 0 : -1, p.sslMs ?? -1, p.latency ?? -1,
    p.country || '', p.city || '', min(p.lastCheck), p.ok || 0, p.fail || 0,
    (p.fav ? 1 : 0) | (p.mine ? 2 : 0), min(p.flagTs), p.source || '',
  ];
  if (p.user) row.push(p.user, p.pass || '');
  return row;
}

// Senkron verisi başka bir cihazdan / Drive'dan gelir: eklentiye alınmadan önce her alan doğrulanır.
const HOST_RE = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/i;
const num = (v) => (Number.isFinite(v) ? v : -1);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function unpackProxy(r) {
  if (!Array.isArray(r)) return null;
  const [t, host, port, st, an, ssl, sslMs, lat, country, city, lc, ok, fail, flags, fts, source, user, pass] = r;
  if (!(t in CODE_TYPE) || typeof host !== 'string' || !HOST_RE.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const type = CODE_TYPE[t];
  const p = {
    id: `${type}://${host}:${port}`, type, host, port,
    status: CODE_STATUS[st] || 'new', anon: CODE_ANON[an] || undefined,
    ssl: ssl === 1 ? true : ssl === 0 ? false : null,
    sslMs: num(sslMs) >= 0 ? sslMs : null, latency: num(lat) >= 0 ? lat : null,
    country: typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : undefined,
    city: str(city, 80) || undefined,
    lastCheck: num(lc) > 0 ? lc * 60000 : 0, ok: Math.max(0, num(ok)), fail: Math.max(0, num(fail)),
    fav: !!(num(flags) & 1), mine: !!(num(flags) & 2), flagTs: num(fts) > 0 ? fts * 60000 : 0,
    source: str(source, 40) || 'sync',
  };
  if (typeof user === 'string' && user) Object.assign(p, { user: str(user, 256), pass: str(pass, 256) });
  return p;
}

const SOURCE_STATS = ['lastFetch', 'lastCount', 'lastNew', 'error', 'failed', 'stat'];

export function buildSnapshot({ proxies, settings, settingsTs, sources, sourcesTs, device }, maxProxies) {
  const list = snapshotCandidates(proxies).slice(0, maxProxies);
  const s = { ...settings };
  for (const k of LOCAL_ONLY_SETTINGS) delete s[k];
  return {
    v: SNAPSHOT_VERSION,
    ts: Date.now(),
    device,
    settings: s,
    settingsTs: settingsTs || 0,
    // Varsayılan kaynaklar için yalnızca seçimler; kullanıcı kaynakları tam olarak.
    sources: sources.map((x) => {
      if (x.custom) {
        const c = { ...x };
        for (const k of SOURCE_STATS) delete c[k];
        return c;
      }
      return { id: x.id, enabled: x.enabled, types: x.types };
    }),
    sourcesTs: sourcesTs || 0,
    proxies: list.map(packProxy),
  };
}

const TEST_FIELDS = ['status', 'anon', 'ssl', 'sslMs', 'latency', 'lastCheck', 'ok', 'fail', 'country', 'city'];

// Uzak özeti yerel duruma uygular. local = { proxies: Map, settings, settingsTs, sources, sourcesTs }.
// Dönüş: { added, updated, settings: bool, sources: bool } — değişen yerel nesneler yerinde güncellenir.
export function mergeSnapshot(local, snap) {
  const res = { added: [], updated: [], settings: false, sources: false };
  if (!snap || snap.v !== SNAPSHOT_VERSION) return res;
  for (const row of Array.isArray(snap.proxies) ? snap.proxies : []) {
    const r = unpackProxy(row);
    if (!r) continue; // geçersiz satır
    const l = local.proxies.get(r.id);
    if (!l) {
      local.proxies.set(r.id, { ...r, added: Date.now(), streak: 0 });
      res.added.push(r.id);
      continue;
    }
    let changed = false;
    if ((r.lastCheck || 0) > (l.lastCheck || 0)) {
      for (const k of TEST_FIELDS) if (r[k] !== undefined) l[k] = r[k];
      if (r.status === 'alive') (l.error = null), (l.streak = 0);
      changed = true;
    }
    if ((r.flagTs || 0) > (l.flagTs || 0)) {
      Object.assign(l, { fav: r.fav, mine: r.mine, flagTs: r.flagTs });
      changed = true;
    }
    if (r.user && !l.user) Object.assign(l, { user: r.user, pass: r.pass }), (changed = true);
    if (changed) res.updated.push(r.id);
  }
  if ((snap.settingsTs || 0) > (local.settingsTs || 0) && snap.settings && typeof snap.settings === 'object') {
    // Yalnızca bilinen ayarlar, yereldekiyle aynı türdeyse alınır.
    const incoming = {};
    for (const [k, v] of Object.entries(snap.settings)) {
      if (LOCAL_ONLY_SETTINGS.includes(k) || !(k in local.settings)) continue;
      const lv = local.settings[k];
      if (Array.isArray(lv) ? Array.isArray(v) && v.every((x) => typeof x === 'string') : typeof v === typeof lv) incoming[k] = v;
    }
    local.settings = { ...local.settings, ...incoming };
    local.settingsTs = snap.settingsTs;
    res.settings = true;
  }
  if ((snap.sourcesTs || 0) > (local.sourcesTs || 0) && Array.isArray(snap.sources)) {
    const byId = new Map(local.sources.map((s) => [s.id, s]));
    const out = [];
    for (const rs of snap.sources) {
      if (!validSource(rs)) continue;
      const ls = byId.get(rs.id);
      if (rs.custom) out.push(ls ? { ...ls, ...rs } : rs);
      else if (ls) out.push({ ...ls, enabled: rs.enabled, types: rs.types });
      byId.delete(rs.id);
    }
    for (const ls of byId.values()) if (!ls.custom) out.push(ls); // uzakta olmayan varsayılanlar korunur
    local.sources = out;
    local.sourcesTs = snap.sourcesTs;
    res.sources = true;
  }
  return res;
}

const TYPES = ['http', 'socks4', 'socks5', 'auto'];
function validSource(s) {
  if (!s || typeof s.id !== 'string' || s.id.length > 64) return false;
  if (s.types !== undefined && !(Array.isArray(s.types) && s.types.every((t) => TYPES.includes(t)))) return false;
  if (!s.custom) return true;
  return (
    typeof s.name === 'string' && s.name.length <= 100 &&
    Array.isArray(s.feeds) && s.feeds.length > 0 && s.feeds.length <= 10 &&
    s.feeds.every((f) => f && TYPES.includes(f.type) && typeof f.url === 'string' && /^https?:\/\//i.test(f.url) && f.url.length < 2048)
  );
}

// ---------------------------------------------------------------- sıkıştırma ve parçalama

async function streamBytes(stream) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function compress(obj) {
  const input = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64(await streamBytes(input));
}

export async function decompress(b64) {
  const input = new Blob([fromBase64(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(await streamBytes(input)));
}

// chrome.storage.sync sınırları: öğe başına 8 KB, toplam 100 KB.
export const SYNC_ITEM_BYTES = 7900;
export const SYNC_TOTAL_BYTES = 96000;
export const SYNC_PREFIX = 'pxs_';

export function chunk(str, size = SYNC_ITEM_BYTES) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

// Özeti chrome.storage.sync'e sığacak şekilde (gerekirse proxy sayısını azaltarak) paketler.
// Dönüş: { items: { pxs_meta, pxs_0.. }, count, bytes }
export async function packForChromeSync(state, maxProxies = 2000) {
  let n = maxProxies;
  for (;;) {
    const snap = buildSnapshot(state, n);
    const data = await compress(snap);
    if (data.length <= SYNC_TOTAL_BYTES - 500 || n <= 50) {
      const parts = chunk(data);
      const items = { [SYNC_PREFIX + 'meta']: { ts: snap.ts, device: snap.device, parts: parts.length, count: snap.proxies.length } };
      parts.forEach((p, i) => (items[SYNC_PREFIX + i] = p));
      return { items, count: snap.proxies.length, bytes: data.length, ts: snap.ts };
    }
    n = Math.floor(n * 0.75);
  }
}

export async function unpackFromChromeSync(all) {
  const meta = all[SYNC_PREFIX + 'meta'];
  if (!meta?.parts) return null;
  let data = '';
  for (let i = 0; i < meta.parts; i++) {
    const part = all[SYNC_PREFIX + i];
    if (typeof part !== 'string') return null; // yazım yarıda kalmış olabilir
    data += part;
  }
  return decompress(data);
}
