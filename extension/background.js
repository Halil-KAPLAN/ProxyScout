// ProxyScout arka plan servisi: liste indirme, proxy testi, proxy'ye bağlanma, otomatik geçiş.
// Kayıtlar ve hatalar dil anahtarı olarak tutulur; arayüz bunları seçili dilde gösterir (lib/messages.js).
import { IS_FIREFOX, HAS_BROWSER_SYNC, HAS_WEB_AUTH, authRedirectUrl, credsSyncAllowed } from './lib/platform.js';
import { DEFAULT_SOURCES, enabledTypes } from './lib/sources.js';
import { parseProxyList, parseManualList, proxyId } from './lib/parse.js';
import { buildPac, findProxy, toProxyInfo, directiveFor, checkMarker, directMarker, httpsCheckHost } from './lib/pac.js';
import { t, has, setLang, resolveLang } from './lib/i18n.js';
import { loadGeo } from './lib/geoip.js';
import { buildSnapshot, mergeSnapshot, packForChromeSync, unpackFromChromeSync, SYNC_PREFIX } from './lib/sync.js';
import { createDriveClient, authUrl, parseAuthRedirect, fetchEmail, BUILTIN_CLIENT_ID } from './lib/drive.js';

const DEFAULT_SETTINGS = {
  lang: 'auto',           // 'auto' | 'tr' | 'en'
  judgeUrl: 'http://httpbin.org/get',
  timeout: 8000,          // HTTP testi zaman aşımı (ms)
  concurrency: 100,       // aynı anda test edilen proxy sayısı
  sslTest: true,          // çalışan proxy'lerde HTTPS testi (iki ayrı HTTPS bağlantısı)
  sslTimeout: 10000,
  geo: true,              // çalışan proxy'lerin ülke/şehir bilgisini bul (ip-api.com)
  autoTestAfterDownload: true,
  maxPerSource: 0,        // 0 = sınırsız
  watchMinutes: 2,        // bağlı proxy'nin canlılık kontrol aralığı
  recheckMinutes: 0,      // çalışan proxy'leri periyodik yeniden test (0 = kapalı)
  bypass: ['<local>', 'localhost', '127.0.0.1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '*.local'],
  syncChrome: true,       // listeyi Chrome'un Google hesabı senkronuyla diğer cihazlara taşı
  driveClientId: '',      // Google Drive senkronu için OAuth istemci kimliği (cihaza özel)
};

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const PROXY_HEADER_RE = /^(via|x-forwarded-for|x-forwarded|forwarded|forwarded-for|x-real-ip|client-ip|x-client-ip|x-proxy-id|proxy-connection|x-proxy-connection|x-bluecoat-via|x-originating-ip|proxy-agent)$/i;
const PROXY_ENV_RE = /\b(HTTP_)?(VIA|X[-_]FORWARDED[-_]FOR|FORWARDED|X[-_]REAL[-_]IP|CLIENT[-_]IP|PROXY[-_]CONNECTION)\b/i;

const S = {
  proxies: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  sources: [],
  active: { enabled: false, id: null, autoSwitch: false, since: null },
  connecting: null,
  token: '',
  realIp: null,
  job: null,
  logs: [],
  control: 'controllable_by_this_extension',
  deviceId: '',
  settingsTs: 0,          // ayarların / kaynakların son değiştiği an (senkronda son yazan kazanır)
  sourcesTs: 0,
  sync: { chrome: {}, drive: {} },
};

const ports = new Set();
let ready = init();

// ---------------------------------------------------------------- başlangıç

async function init() {
  const d = await chrome.storage.local.get(['proxies', 'settings', 'sources', 'active', 'token', 'realIp', 'sync']);
  S.token = d.token || randomHex(16);
  if (!d.token) await chrome.storage.local.set({ token: S.token });
  S.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  setLang(resolveLang(S.settings.lang));
  S.sources = mergeSources(d.sources);
  S.active = { ...S.active, ...(d.active || {}) };
  S.realIp = d.realIp || null;
  for (const p of d.proxies || []) S.proxies.set(p.id, p);
  // Ülkesi bilinmeyen proxy'lere çevrimdışı veritabanından ülke ata (eski kayıtlar için).
  let filled = 0;
  for (const p of S.proxies.values()) if (!p.country && (await geoFill(p))) filled++;
  if (filled) scheduleSave();
  if (S.active.id && !S.proxies.has(S.active.id)) S.active = { ...S.active, enabled: false, id: null };
  const sy = d.sync || {};
  S.deviceId = sy.deviceId || randomHex(8);
  S.settingsTs = sy.settingsTs || 0;
  S.sourcesTs = sy.sourcesTs || 0;
  S.sync = { chrome: sy.chrome || {}, drive: sy.drive || {} };
  if (!sy.deviceId) await saveSyncState();
  await applyProxy({});
  await setupAlarms();
}

// Açılışta diğer cihazların kaydettiği listeyi al (init'i bekletmeden).
ready.then(() => syncPullAll()).catch(() => {});

// Kayıtlı kaynakları varsayılanlarla birleştir. Eski sürümün tür başına ayrı kaynakları
// (ör. "proxyscrape-http") yeni gruplu yapıya taşınmaz; kullanıcının eklediği kaynaklar korunur.
function mergeSources(stored) {
  const defs = DEFAULT_SOURCES.map((s) => ({ ...s }));
  if (!Array.isArray(stored)) return defs;
  const byId = new Map(stored.map((s) => [s.id, s]));
  const out = defs.map((d) => {
    const s = byId.get(d.id);
    if (!s) return d;
    const { enabled, types, lastFetch, lastCount, lastNew, error, failed } = s;
    return { ...d, enabled: enabled ?? d.enabled, types, lastFetch, lastCount, lastNew, error, failed };
  });
  const custom = stored
    .filter((s) => s.custom)
    .map((s) => (s.feeds ? s : { id: s.id, name: s.name, custom: true, enabled: s.enabled, feeds: [{ type: s.type || 'http', url: s.url }] }));
  return [...custom, ...out];
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
});

chrome.runtime.onStartup.addListener(() => ready);

// ---------------------------------------------------------------- yardımcılar

function randomHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Çevrimdışı IP → ülke veritabanından ülke kodunu yaz (indirme/içe aktarma anında, test beklemeden).
async function geoFill(p) {
  const cc = (await loadGeo()).lookup(p.host);
  if (!cc) return false;
  p.country = cc;
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.random().toString(36).slice(2, 10);
const fmt = (p) => `${p.host}:${p.port}`;

// Zaman aşımlı fetch; gövdeyi de aynı süre içinde okur. Çalışan işin "Durdur" komutuyla iptal edilebilir.
async function fetchText(url, ms, opts = {}) {
  const ctrl = new AbortController();
  const job = S.job;
  job?.ctrls.add(ctrl);
  const timer = setTimeout(() => ctrl.abort(), ms);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit', ...opts, signal: ctrl.signal });
    const text = res.type === 'opaqueredirect' ? '' : await res.text();
    return { res, text, ms: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(timer);
    job?.ctrls.delete(ctrl);
  }
}

// Ağ hatası → hata kodu (lib/messages.js içindeki "err.*").
function errCode(e) {
  if (e?.name === 'AbortError') return S.job?.cancelled ? 'cancelled' : 'timeout';
  return 'connect';
}

const errParam = (e) => (has(e?.message) ? '@' + e.message : e?.message || String(e));

async function runPool(items, limit, fn, job) {
  let i = 0;
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length && !job?.cancelled) await fn(items[i++]);
    }),
  );
}

// ---------------------------------------------------------------- arayüze yayın

const dirty = new Set();
let removed = [];
let pendingLogs = [];
let flushTimer = null;

function touch(p) {
  dirty.add(p.id);
  scheduleFlush();
}

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flush, 300);
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  updateBadge();
  const msg = {
    type: 'patch',
    proxies: [...dirty].map((id) => S.proxies.get(id)).filter(Boolean),
    removed,
    logs: pendingLogs,
    job: jobView(),
    active: S.active,
    connecting: S.connecting,
    realIp: S.realIp,
    sync: syncView(),
  };
  dirty.clear();
  removed = [];
  pendingLogs = [];
  for (const port of ports) port.postMessage(msg);
}

function broadcastFull() {
  dirty.clear();
  removed = [];
  pendingLogs = [];
  const msg = { type: 'full', state: fullState() };
  for (const port of ports) port.postMessage(msg);
  updateBadge();
}

function fullState() {
  return {
    proxies: [...S.proxies.values()],
    settings: S.settings,
    sources: S.sources,
    active: S.active,
    connecting: S.connecting,
    job: jobView(),
    realIp: S.realIp,
    logs: S.logs,
    control: S.control,
    sync: syncView(),
    defaults: { settings: DEFAULT_SETTINGS },
  };
}

function jobView() {
  if (!S.job) return null;
  const { ctrls, ...v } = S.job;
  return v;
}

// Kayıt satırı: metin değil, dil anahtarı + parametreler. "@" ile başlayan parametreler de çevrilir.
function log(level, key, params = {}) {
  const e = { t: Date.now(), level, key, params };
  S.logs.push(e);
  if (S.logs.length > 500) S.logs.splice(0, S.logs.length - 500);
  pendingLogs.push(e);
  scheduleFlush();
}

chrome.runtime.onConnect.addListener(async (port) => {
  if (port.name !== 'ui') return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  // Sayfa bağlantının canlı olduğunu yoklar (lib/ui.js createStore).
  port.onMessage.addListener((msg) => msg?.type === 'ping' && port.postMessage({ type: 'pong' }));
  await ready;
  port.postMessage({ type: 'full', state: fullState() });
});

// ---------------------------------------------------------------- kalıcı kayıt

let saveTimer = null;

function scheduleSave() {
  if (!saveTimer) saveTimer = setTimeout(saveNow, S.job ? 8000 : 1000);
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const arr = [];
  for (const p of S.proxies.values()) {
    const { checking, ...rest } = p;
    arr.push(rest);
  }
  await chrome.storage.local.set({ proxies: arr, realIp: S.realIp });
}

const saveActive = () => chrome.storage.local.set({ active: S.active });

// ---------------------------------------------------------------- proxy ayarı

let hostMap = {};
let warnedOtherExt = false;

// Firefox: PAC yerine her isteğe proxy.onRequest ile karar verilir; bu, PAC'e verilecek yapılandırmanın aynısıdır.
// null = eklenti proxy'ye karışmıyor (her şey doğrudan).
let ffProxy = null;

if (IS_FIREFOX) {
  // Kalıcı arka plan sayfasında üst düzeyde kaydedilir; tarayıcı açılırken gelen istekler init bitene kadar bekletilir,
  // böylece bağlı proxy varken açılıştaki istekler doğrudan çıkıp gerçek IP'yi sızdırmaz.
  chrome.proxy.onRequest.addListener(
    async (d) => {
      if (!/^(https?|wss?|ftp):/i.test(d.url)) return { type: 'direct' };
      await ready;
      if (!ffProxy) return { type: 'direct' };
      let host = '';
      try {
        host = new URL(d.url).hostname.replace(/^\[|\]$/g, '');
      } catch {}
      const info = toProxyInfo(findProxy(ffProxy, d.url, host));
      // Chrome'un aksine Firefox, SOCKS5 proxy'ler için kullanıcı adı/şifreyi destekler.
      const cred = info.type === 'socks' && ffProxy.socksAuth[info.host + ':' + info.port];
      if (cred) Object.assign(info, { username: cred.user, password: cred.pass });
      return info;
    },
    { urls: ['<all_urls>'] },
  );
}

async function applyProxy(newHostMap) {
  if (newHostMap) hostMap = newHostMap;
  const act = S.active.enabled && S.proxies.get(S.active.id);
  if (IS_FIREFOX) {
    S.control = 'controllable_by_this_extension';
    const socksAuth = {};
    for (const p of S.proxies.values()) if (p.user && p.type === 'socks5') socksAuth[p.host + ':' + p.port] = { user: p.user, pass: p.pass || '' };
    ffProxy = act || S.job ? { token: S.token, active: act ? directiveFor(act) : null, bypass: S.settings.bypass, hostMap, socksAuth } : null;
    updateBadge();
    return;
  }
  try {
    const cur = await chrome.proxy.settings.get({});
    S.control = cur.levelOfControl;
    if (!act && !S.job) {
      await chrome.proxy.settings.clear({ scope: 'regular' });
    } else {
      const data = buildPac({ token: S.token, active: act ? directiveFor(act) : null, bypass: S.settings.bypass, hostMap });
      await chrome.proxy.settings.set({ value: { mode: 'pac_script', pacScript: { data, mandatory: false } }, scope: 'regular' });
    }
  } catch (e) {
    log('err', 'log.applyFail', { err: e.message });
  }
  const other = S.control === 'controlled_by_other_extensions';
  if (other && !warnedOtherExt) log('err', 'log.otherExt');
  warnedOtherExt = other;
  updateBadge();
}

// Araç çubuğu ikonu bağlantı durumunu renkle gösterir:
// yeşil = bağlı, kırmızı = bağlı ama proxy yanıt vermiyor / koptu, turuncu = bağlanıyor, gri = kapalı.
let lastIcon = null;

function iconState() {
  if (S.connecting) return 'wait';
  const act = S.active.enabled && S.proxies.get(S.active.id);
  if (!act) return 'off';
  return S.active.failed || act.status === 'dead' ? 'bad' : 'on';
}

const BADGE_COLOR = { on: '#16a34a', bad: '#dc2626', wait: '#f59e0b', off: '#6b7280' };
// MV3'te chrome.action, Firefox'un MV2 paketinde browserAction.
const toolbarButton = IS_FIREFOX ? chrome.browserAction : chrome.action;

function updateBadge() {
  const act = S.active.enabled && S.proxies.get(S.active.id);
  const state = iconState();
  let text = '';
  let color = BADGE_COLOR[state];
  if (S.job) {
    text = S.job.total ? Math.floor((S.job.done * 100) / S.job.total) + '%' : '…';
    color = '#2563eb';
  } else if (state === 'wait') {
    text = '…';
  } else if (state === 'bad') {
    text = '!';
  } else if (act) {
    text = act.country || 'ON';
  }
  toolbarButton.setBadgeText({ text });
  toolbarButton.setBadgeBackgroundColor({ color });
  toolbarButton.setTitle({
    title: state === 'wait' ? t('title.wait') : state === 'bad' ? t('title.bad', { addr: fmt(act) }) : act ? t('title.on', { addr: fmt(act) }) : t('title.off'),
  });
  if (state !== lastIcon) {
    lastIcon = state;
    toolbarButton.setIcon({ path: { 16: `icons/${state}16.png`, 32: `icons/${state}32.png`, 48: `icons/${state}48.png` } });
  }
}

// Kullanıcı adı/şifreli (özel) proxy'ler için kimlik bilgisi sağla.
const authTries = new Map();
function proxyAuth(details) {
  if (!details.isProxy) return {};
  const n = (authTries.get(details.requestId) || 0) + 1;
  authTries.set(details.requestId, n);
  if (authTries.size > 500) authTries.clear();
  const { host, port } = details.challenger || {};
  const p = [...S.proxies.values()].find((x) => x.user && x.host === host && x.port === port);
  if (!p || n > 1) return { cancel: true };
  return { authCredentials: { username: p.user, password: p.pass } };
}
// Chrome: webRequestAuthProvider + asyncBlocking; Firefox: webRequestBlocking + blocking (değer döndürülür).
if (IS_FIREFOX) chrome.webRequest.onAuthRequired.addListener(proxyAuth, { urls: ['<all_urls>'] }, ['blocking']);
else chrome.webRequest.onAuthRequired.addListener((d, callback) => callback(proxyAuth(d)), { urls: ['<all_urls>'] }, ['asyncBlocking']);

// ---------------------------------------------------------------- işler

// label: iş adı dil anahtarı (ör. "job.download").
function startJob(label, fn) {
  if (S.job) throw new Error('e.jobRunning');
  S.job = { label, phase: 'start', total: 0, done: 0, alive: 0, dead: 0, cancelled: false, started: Date.now(), ctrls: new Set() };
  const ka = setInterval(() => chrome.runtime.getPlatformInfo(), 20000); // servis çalışanını uyanık tut
  scheduleFlush();
  (async () => {
    try {
      await applyProxy();
      await fn(S.job);
    } catch (e) {
      log('err', 'log.jobError', { label: '@' + label, err: errParam(e) });
    } finally {
      const j = S.job;
      S.job = null;
      clearInterval(ka);
      for (const p of S.proxies.values()) if (p.checking) { p.checking = false; touch(p); }
      await applyProxy({});
      await saveNow();
      log('info', j.cancelled ? 'log.jobStopped' : 'log.jobDone', { label: '@' + j.label, s: Math.round((Date.now() - j.started) / 1000) });
      flush();
      scheduleSyncPush();
    }
  })();
}

async function downloadSources(job, ids) {
  // Her kaynağın seçili türlerine ait listeleri (feed) tek tek indir.
  const tasks = [];
  for (const s of S.sources) {
    if (ids ? !ids.includes(s.id) : !s.enabled) continue;
    const types = enabledTypes(s);
    if (!types.length) continue;
    s.stat = { count: 0, fresh: 0, failed: 0, feeds: 0, error: null };
    for (const f of s.feeds) if (f.type === 'auto' || types.includes(f.type)) tasks.push({ s, f, types }), s.stat.feeds++;
  }
  job.phase = 'download';
  job.total = tasks.length;
  job.done = 0;
  const addedIds = [];
  log('info', 'log.dlStart', { n: tasks.length });
  const geo = await loadGeo();
  await runPool(tasks, 6, async ({ s, f, types }) => {
    const name = `${s.name} · ${f.type === 'auto' ? types.map((x) => x.toUpperCase()).join('/') : f.type.toUpperCase()}`;
    try {
      const { res, text } = await fetchText(f.url, 25000, { headers: { Accept: 'text/plain,text/html,*/*' } });
      if (!res.ok) throw Object.assign(new Error('http'), { code: 'http:' + res.status });
      let found = parseProxyList(text, f.type);
      if (f.type === 'auto') found = found.filter((p) => types.includes(p.type));
      if (S.settings.maxPerSource > 0) found = found.slice(0, S.settings.maxPerSource);
      let fresh = 0;
      for (const p of found) {
        const id = proxyId(p.type, p.host, p.port);
        if (S.proxies.has(id)) continue;
        const np = { id, ...p, status: 'new', source: s.id, added: Date.now(), ok: 0, fail: 0, streak: 0 };
        const cc = geo.lookup(p.host);
        if (cc) np.country = cc;
        S.proxies.set(id, np);
        touch(np);
        addedIds.push(id);
        fresh++;
      }
      s.stat.count += found.length;
      s.stat.fresh += fresh;
      log(found.length ? 'ok' : 'warn', 'log.dlFound', { name, n: found.length, fresh });
    } catch (e) {
      const code = e.code || errCode(e);
      s.stat.failed++;
      s.stat.error = code;
      log('err', 'log.dlFail', { name, err: '@err.' + code });
    }
    job.done++;
    scheduleFlush();
  }, job);
  for (const s of S.sources) {
    if (!s.stat) continue;
    const st = s.stat;
    delete s.stat;
    Object.assign(s, { lastFetch: Date.now(), lastCount: st.count, lastNew: st.fresh, failed: st.failed, error: st.failed === st.feeds ? st.error : null });
  }
  await chrome.storage.local.set({ sources: S.sources });
  for (const port of ports) port.postMessage({ type: 'sources', sources: S.sources });
  log('info', 'log.dlDone', { n: addedIds.length });
  scheduleSave();
  return addedIds;
}

async function getRealIp() {
  for (const u of ['http://httpbin.org/ip', 'http://ip-api.com/json/?fields=query']) {
    try {
      const sep = u.includes('?') ? '&' : '?';
      const { text } = await fetchText(u + sep + directMarker(S.token), 8000);
      const m = text.match(IPV4);
      if (m) return m[0];
    } catch {}
  }
  return null;
}

function classify(text, latency) {
  let ips = [];
  let proxyHeaders = false;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (json && typeof json === 'object' && typeof json.origin === 'string') {
    ips = json.origin.split(',').map((x) => x.trim()).filter(Boolean);
    proxyHeaders = Object.keys(json.headers || {}).some((h) => PROXY_HEADER_RE.test(h));
  } else if (text.length < 4000 && !/<html|<script/i.test(text)) {
    ips = text.match(IPV4) || [];
    proxyHeaders = PROXY_ENV_RE.test(text);
  } else {
    return { ok: false, error: 'modified' };
  }
  if (!ips.length) return { ok: false, error: 'invalid' };
  const real = S.realIp;
  if (real && ips.length === 1 && ips[0] === real && !proxyHeaders) return { ok: false, error: 'direct' };
  const leaks = real && text.includes(real);
  const anon = leaks ? 'transparent' : proxyHeaders || ips.length > 1 ? 'anonymous' : 'elite';
  return { ok: true, latency, anon, exitIp: ips[ips.length - 1] };
}

async function checkHttp(p) {
  const judge = S.settings.judgeUrl;
  const url = `${judge}${judge.includes('?') ? '&' : '?'}${checkMarker(S.token, p)}&_=${rnd()}`;
  try {
    const { res, text, ms } = await fetchText(url, S.settings.timeout, { redirect: 'manual' });
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return { ok: false, error: 'redirect' };
    if (res.status === 407) return { ok: false, error: 'auth' };
    if (!res.ok) return { ok: false, error: 'http:' + res.status };
    return classify(text, ms);
  } catch (e) {
    return { ok: false, error: errCode(e) };
  }
}

function applyResult(p, r) {
  p.lastCheck = Date.now();
  if (r.ok) {
    if (p.status !== 'alive') p.ssl = null;
    Object.assign(p, { status: 'alive', anon: r.anon, latency: r.latency, exitIp: r.exitIp, error: null, streak: 0 });
    p.ok = (p.ok || 0) + 1;
  } else {
    Object.assign(p, { status: 'dead', latency: null, error: r.error });
    p.fail = (p.fail || 0) + 1;
    p.streak = (p.streak || 0) + 1;
  }
  touch(p);
}

async function testProxies(job, ids) {
  const list = ids.map((id) => S.proxies.get(id)).filter(Boolean);
  if (!list.length) return log('warn', 'log.noTarget');
  job.phase = 'prepare';
  S.realIp = (await getRealIp()) || S.realIp;
  if (!S.realIp) log('warn', 'log.noRealIp');
  else log('info', 'log.realIp', { ip: S.realIp, n: list.length });

  job.phase = 'http';
  job.total = list.length;
  job.done = job.alive = job.dead = 0;
  for (const p of list) { p.checking = true; touch(p); }
  await runPool(list, S.settings.concurrency, async (p) => {
    const r = await checkHttp(p);
    if (job.cancelled) return;
    p.checking = false;
    applyResult(p, r);
    job.done++;
    if (r.ok) {
      job.alive++;
      log('ok', 'log.alive', { addr: fmt(p), type: p.type.toUpperCase(), anon: '@anon.' + r.anon, ms: r.latency });
    } else {
      job.dead++;
    }
    scheduleSave();
  }, job);

  const alive = list.filter((p) => p.status === 'alive');
  if (S.settings.sslTest && !job.cancelled) {
    if (alive.length) await sslPhase(job, alive);
  } else {
    // Gerçek test kapalıysa SOCKS proxy'leri (her protokolü taşıdıkları için) HTTPS destekli say.
    for (const p of alive) if (p.type !== 'http' && p.ssl == null) (p.ssl = true), touch(p);
  }
  if (S.settings.geo && !job.cancelled) await geoPhase(job, alive);
  // Sonuçta "çalışan" yalnızca gerçekten kullanılabilenlerdir; HTTPS testini geçemeyenler (yalnız HTTP) sayılmaz.
  job.alive = alive.filter((p) => p.ssl !== false).length;
  log('info', 'log.result', { alive: job.alive, dead: job.dead });
}

// HTTPS testi. Yalnızca HTTP üzerinden küçük bir yanıt döndürebilen proxy'ler gerçek sitelerde
// çoğu zaman çalışmaz. HTTP testini geçen her proxy (SOCKS dahil) üzerinden Cloudflare'e iki AYRI
// HTTPS bağlantısı açılır (her biri yeni alan adı → yeni tünel); ikisi de doğru çıkış IP'siyle
// dönmelidir. Bir an çalışıp bir an düşen kararsız proxy'ler böylece elenir. Alan adı proxy
// bilgisini taşıdığı için (bkz. lib/pac.js) tüm proxy'ler PAC değiştirilmeden aynı anda test edilir.
// Son adımda gerçek bir sayfa yükü taşınır (aşağıda): küçük yanıtları geçirip sayfaları açamayan
// yavaş proxy'ler de elenir.
async function httpsCheck(p) {
  let ms = 0;
  for (let n = 0; n < 2; n++) {
    try {
      const { res, text, ms: t } = await fetchText(`https://${httpsCheckHost(S.token, p, rnd())}/cdn-cgi/trace`, S.settings.sslTimeout);
      if (!res.ok) return { ok: false, error: 'http:' + res.status };
      const ip = (/^ip=(.+)$/m.exec(text) || [])[1];
      if (!ip) return { ok: false, error: 'invalid' };
      if (ip === S.realIp) return { ok: false, error: 'direct' };
      ms = t;
    } catch (e) {
      return { ok: false, error: errCode(e) };
    }
  }
  const load = await loadCheck(p);
  return load.ok ? { ok: true, ms, kbps: load.kbps } : load;
}

// Sayfa yükü testi. Ölçüm (2026-10, Firefox ve Chrome): yalnızca küçük HTTPS yanıtlarını geçen proxy'lerin
// çoğu Wikipedia'yı açtı ama GitHub gibi ağır sayfaları 20 sn'de yükleyemedi. Bu yüzden aynı test adresinden
// önbellekli büyük bir dosyanın ilk LOAD_BYTES baytı, HTTPS zaman aşımı içinde inmelidir.
// Dosya Cloudflare Access'in uygulama başlatıcısıdır ve her alt alan adında aynıdır; adı (sürümle değişir)
// test adresinin ana sayfasından okunur. Bulunamazsa bu adım atlanır.
const LOAD_BYTES = 256 * 1024;
let loadAsset = null;

async function loadCheck(p) {
  const host = () => httpsCheckHost(S.token, p, rnd());
  try {
    if (!loadAsset) {
      const { res, text } = await fetchText(`https://${host()}/`, S.settings.sslTimeout);
      const m = res.ok && /src="(\/assets\/[^"]+\.js)"/.exec(text);
      if (!m) return { ok: true, kbps: null };
      loadAsset = m[1];
    }
    const { res, text, ms } = await fetchText(`https://${host()}${loadAsset}`, S.settings.sslTimeout, { headers: { Range: `bytes=0-${LOAD_BYTES - 1}` } });
    if (res.status === 404) {
      loadAsset = null; // dosya adı değişmiş; bir sonraki proxy yeniden okur
      return { ok: true, kbps: null };
    }
    if (!res.ok || text.length < LOAD_BYTES * 0.9) return { ok: false, error: 'slow' };
    return { ok: true, kbps: Math.round(text.length / 1024 / Math.max(ms / 1000, 0.001)) };
  } catch (e) {
    const code = errCode(e);
    return { ok: false, error: code === 'timeout' ? 'slow' : code };
  }
}

const IPV4_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;

async function sslPhase(job, list) {
  job.phase = 'ssl';
  job.total = list.length;
  job.done = 0;
  log('info', 'log.sslStart', { n: list.length });
  await runPool(list, S.settings.concurrency, async (p) => {
    if (!IPV4_HOST.test(p.host)) return void job.done++; // alan adlı proxy: HTTPS durumu bilinmiyor
    p.checking = true;
    touch(p);
    const r = await httpsCheck(p);
    if (job.cancelled) return;
    p.ssl = r.ok;
    p.sslError = r.ok ? null : r.error;
    p.sslMs = r.ok ? r.ms : null;
    p.kbps = r.ok ? r.kbps ?? null : null;
    delete p.speed;
    p.checking = false;
    job.done++;
    touch(p);
    if (r.ok) log('ok', 'log.sslOk', { addr: fmt(p), ms: r.ms });
  }, job);
}

const GEO_FIELDS = 'status,countryCode,country,city,isp,query';

function applyGeo(p, g) {
  if (!/^[A-Z]{2}$/.test(g.countryCode || '')) return;
  p.country = g.countryCode;
  p.countryName = String(g.country || '').slice(0, 80);
  p.city = String(g.city || '').slice(0, 80);
  p.isp = String(g.isp || '').slice(0, 120);
  touch(p);
}

async function geoPhase(job, list) {
  const need = list.filter((p) => p.status === 'alive' && (!p.country || p.city === undefined));
  if (!need.length) return;
  job.phase = 'geo';
  job.total = need.length;
  job.done = 0;
  for (let i = 0; i < need.length && !job.cancelled; i += 100) {
    const chunk = need.slice(i, i + 100);
    const ips = [...new Set(chunk.map((p) => p.exitIp || p.host))];
    try {
      const { text } = await fetchText(`http://ip-api.com/batch?fields=${GEO_FIELDS}&${directMarker(S.token)}`, 15000, {
        method: 'POST',
        body: JSON.stringify(ips),
      });
      const map = new Map(JSON.parse(text).filter((x) => x.status === 'success').map((x) => [x.query, x]));
      for (const p of chunk) {
        const g = map.get(p.exitIp || p.host);
        if (g) applyGeo(p, g);
      }
    } catch (e) {
      log('warn', 'log.geoFail', { err: '@err.' + errCode(e) });
    }
    job.done += chunk.length;
    if (i + 100 < need.length) await sleep(4200); // ip-api: dakikada 15 istek
  }
}

async function geoOne(ip) {
  try {
    const g = JSON.parse((await fetchText(`http://ip-api.com/json/${ip}?fields=${GEO_FIELDS}&${directMarker(S.token)}`, 8000)).text);
    return g.status === 'success' ? g : null;
  } catch {
    return null;
  }
}

function idsFor(filter) {
  const all = [...S.proxies.values()];
  const pick = {
    all: () => all,
    new: () => all.filter((p) => p.status === 'new'),
    alive: () => all.filter((p) => p.status === 'alive'),
    dead: () => all.filter((p) => p.status === 'dead'),
  }[filter];
  return (pick ? pick() : []).map((p) => p.id);
}

// ---------------------------------------------------------------- bağlantı

// Otomatik seçim ve geçiş için en iyi adaylar: önce gerçek site testini geçenler (elit, sonra hızlı),
// hiç yoksa HTTPS durumu bilinmeyenler. Gerçek testte başarısız olanlar hiç seçilmez.
function pickBest(exclude = new Set()) {
  const rank = { elite: 0, anonymous: 1, transparent: 2 };
  const alive = [...S.proxies.values()].filter((p) => p.status === 'alive' && !exclude.has(p.id));
  const verified = alive.filter((p) => p.ssl === true);
  return (verified.length ? verified : alive.filter((p) => p.ssl == null)).sort(
    (a, b) => rank[a.anon] - rank[b.anon] || (a.sslMs ?? 1e9) - (b.sslMs ?? 1e9) || a.latency - b.latency,
  );
}

// Etkin rota üzerinden (işaretçisiz) gerçek HTTPS istekleriyle bağlantıyı doğrula: çıkış IP'si okunur ve
// sıradan bir site de açılmalıdır. Bazı proxy'ler yalnızca birkaç adrese izin verir (IP servisleri açılır,
// diğer siteler açılmaz); ölçümde bunlar yalnız IP kontrolüyle "bağlandı" görünüyordu.
async function verifyRoute() {
  const one = (u) =>
    fetchText(`${u}?_=${rnd()}`, 12000).then((r) => {
      const ip = r.res.ok && (r.text.match(IPV4) || []).pop();
      if (!ip) throw new Error('invalid');
      return { ip, ms: r.ms };
    });
  const site = () =>
    fetchText(`https://www.wikipedia.org/?_=${rnd()}`, 12000).then((r) => {
      if (!r.res.ok || r.text.length < 5000) throw new Error('invalid');
    });
  try {
    const [r] = await Promise.all([Promise.any([one('https://api.ipify.org/'), one('https://icanhazip.com/')]), site().catch((e) => Promise.reject({ errors: [e] }))]);
    if (S.realIp && r.ip === S.realIp) return { ok: false, error: 'direct' };
    return { ok: true, ...r };
  } catch (e) {
    const errs = e.errors || [];
    return { ok: false, error: errs.some((x) => x?.message === 'invalid') ? 'invalid' : errs.some((x) => x?.name === 'AbortError') ? 'timeout' : 'connect' };
  }
}

let connectSeq = 0;

// Proxy'ye bağlan: ayarı hemen uygula, ardından bağlantıyı doğrula (arayüz bu sürede "Bağlanıyor" gösterir).
async function connect(id, { verify = true } = {}) {
  const p = S.proxies.get(id);
  if (!p) throw new Error('e.notFound');
  const seq = ++connectSeq;
  S.connecting = id;
  flush();
  try {
    S.active = { ...S.active, enabled: true, id, since: Date.now(), failed: null };
    await saveActive();
    await applyProxy();
    const base = { addr: fmt(p), type: p.type.toUpperCase() };
    if (!verify) {
      log('ok', 'log.connected', { ...base, country: p.country || '', ms: p.latency ?? '?' });
      return { ok: true, ms: p.latency };
    }
    log('info', 'log.connecting', base);
    const r = await verifyRoute();
    if (seq !== connectSeq) return { ...r, superseded: true };
    S.active = { ...S.active, failed: r.ok ? null : r.error };
    saveActive();
    if (r.ok) {
      Object.assign(p, { latency: r.ms, sslMs: r.ms, lastCheck: Date.now(), status: 'alive', error: null, streak: 0, exitIp: r.ip });
      p.ssl = true; // HTTPS üzerinden doğrulandı
      if (!p.country || p.city === undefined) {
        const g = await geoOne(r.ip);
        if (g) applyGeo(p, g);
      }
      touch(p);
      scheduleSave();
      log('ok', 'log.connected', { ...base, country: p.country || '', ms: r.ms });
    } else {
      log('err', 'log.connectedNoResp', { addr: base.addr, err: '@err.' + r.error });
    }
    return r;
  } finally {
    if (seq === connectSeq) S.connecting = null;
    flush();
  }
}

async function setEnabled(enabled) {
  if (enabled && !S.proxies.has(S.active.id)) {
    const best = pickBest()[0];
    if (!best) throw new Error('e.noAlive');
    return connect(best.id);
  }
  if (enabled) return connect(S.active.id);
  connectSeq++;
  S.connecting = null;
  S.active = { ...S.active, enabled: false };
  await saveActive();
  await applyProxy();
  log('info', 'log.disabled');
  flush();
  return { ok: true };
}

// Bağlı proxy'yi kontrol et; ölmüşse ve Otomatik Geçiş açıksa en iyi çalışana geç.
let watching = false;
async function watchActive() {
  if (watching || S.job || S.connecting || !S.active.enabled) return;
  const p = S.proxies.get(S.active.id);
  if (!p) return;
  watching = true;
  try {
    const r = await checkHttp(p);
    applyResult(p, r);
    S.active = { ...S.active, failed: r.ok ? null : r.error };
    if (r.ok) return;
    log('err', 'log.watchFail', { addr: fmt(p), err: '@err.' + r.error });
    if (!S.active.autoSwitch) return;
    const tried = new Set([p.id]);
    for (const c of pickBest(tried).slice(0, 8)) {
      tried.add(c.id);
      const rc = await checkHttp(c);
      applyResult(c, rc);
      if (rc.ok) {
        log('info', 'log.autoSwitch', { from: fmt(p), to: fmt(c) });
        await connect(c.id, { verify: false });
        return;
      }
    }
    log('err', 'log.autoSwitchNone');
  } finally {
    watching = false;
    scheduleSave();
  }
}

let errDebounce = null;
chrome.proxy[IS_FIREFOX ? 'onError' : 'onProxyError'].addListener(() => {
  if (S.job || S.connecting || !S.active.enabled || errDebounce) return;
  errDebounce = setTimeout(() => {
    errDebounce = null;
    watchActive();
  }, 5000);
});

async function setupAlarms() {
  await chrome.alarms.create('syncPull', { periodInMinutes: 15 });
  await chrome.alarms.create('watch', { periodInMinutes: Math.max(1, +S.settings.watchMinutes || 2) });
  if (+S.settings.recheckMinutes > 0) await chrome.alarms.create('recheck', { periodInMinutes: Math.max(5, +S.settings.recheckMinutes) });
  else await chrome.alarms.clear('recheck');
}

chrome.alarms.onAlarm.addListener(async (a) => {
  await ready;
  if (a.name === 'watch') watchActive();
  if (a.name === 'syncPush') syncPushAll();
  if (a.name === 'syncPull') syncPullAll();
  if (a.name === 'recheck' && !S.job) {
    const ids = idsFor('alive');
    if (ids.length) startJob('job.recheck', (job) => testProxies(job, ids));
  }
});

// ---------------------------------------------------------------- senkronizasyon
//
// Değerli kısım (çalışan proxy'ler, favoriler, kullanıcının proxy'leri, kaynak seçimleri, ayarlar)
// küçük bir özet olarak (lib/sync.js) iki yere yazılabilir:
//  * chrome.storage.sync — Chrome'un Google hesabı senkronu; kurulum gerektirmez (100 KB sınırı).
//  * Google Drive appDataFolder — Chrome, Edge, Brave… arasında; kullanıcı OAuth istemcisi girer.
// Her değişiklik yazılmaz: gönderim bir test bittiğinde ya da elle yapılan değişikliklerden
// 1 dakika sonra, en fazla 2 dakikada bir, tek seferde yapılır. Göndermeden önce uzaktaki daha
// yeni veri alınıp birleştirilir. Alma: açılışta, başka cihaz Chrome senkronuna yazınca ve 15 dk'da bir.

const PUSH_DELAY = 60 * 1000;
const PUSH_MIN_GAP = 2 * 60 * 1000;
const DRIVE_MAX_PROXIES = 5000;

const saveSyncState = () =>
  chrome.storage.local.set({ sync: { deviceId: S.deviceId, settingsTs: S.settingsTs, sourcesTs: S.sourcesTs, chrome: S.sync.chrome, drive: S.sync.drive } });

function syncView() {
  return {
    chrome: { ...S.sync.chrome, enabled: !!S.settings.syncChrome && HAS_BROWSER_SYNC, available: HAS_BROWSER_SYNC },
    drive: { ...S.sync.drive, configured: !!driveClientId(), builtin: !!BUILTIN_CLIENT_ID, available: HAS_WEB_AUTH },
    redirectUri: authRedirectUrl(),
    extensionId: chrome.runtime.id,
  };
}

function syncTargets() {
  return { chrome: !!S.settings.syncChrome && HAS_BROWSER_SYNC, drive: !!S.sync.drive.connected };
}

function scheduleSyncPush() {
  const tg = syncTargets();
  if (!tg.chrome && !tg.drive) return;
  const last = Math.max(S.sync.chrome.lastPush || 0, S.sync.drive.lastPush || 0);
  chrome.alarms.create('syncPush', { when: Math.max(Date.now() + PUSH_DELAY, last + PUSH_MIN_GAP) });
}

// withCreds = false: kendi eklenen proxy'lerin kullanıcı adı/şifresi senkrona yazılmaz
// (Firefox'ta kullanıcı "kimlik doğrulama bilgisi" veri iznini vermediyse).
const withoutCreds = ({ user, pass, ...p }) => p;
const localSyncState = (withCreds = true) => ({
  proxies: withCreds ? [...S.proxies.values()] : [...S.proxies.values()].map(withoutCreds),
  settings: S.settings,
  settingsTs: S.settingsTs,
  sources: S.sources,
  sourcesTs: S.sourcesTs,
  device: S.deviceId,
});

// Uzak özeti yerel duruma birleştir.
async function applyRemote(snap, from) {
  const local = { proxies: S.proxies, settings: S.settings, settingsTs: S.settingsTs, sources: S.sources, sourcesTs: S.sourcesTs };
  const r = mergeSnapshot(local, snap);
  for (const id of [...r.added, ...r.updated]) {
    const p = S.proxies.get(id);
    if (!p.country) await geoFill(p);
    touch(p);
  }
  if (r.settings) {
    S.settings = local.settings;
    S.settingsTs = local.settingsTs;
    setLang(resolveLang(S.settings.lang));
    await chrome.storage.local.set({ settings: S.settings });
    await setupAlarms();
    await applyProxy();
  }
  if (r.sources) {
    S.sources = local.sources;
    S.sourcesTs = local.sourcesTs;
    await chrome.storage.local.set({ sources: S.sources });
  }
  if (r.added.length || r.updated.length || r.settings || r.sources) {
    log('ok', 'log.syncPulled', { target: from, added: r.added.length, updated: r.updated.length });
    scheduleSave();
    broadcastFull();
  }
  return r;
}

// --- Chrome senkronu (Firefox'ta Firefox Sync; aynı chrome.storage.sync API'si)

const BROWSER_SYNC = IS_FIREFOX ? 'Firefox' : 'Chrome';

async function chromePull() {
  const all = await chrome.storage.sync.get(null);
  const meta = all[SYNC_PREFIX + 'meta'];
  S.sync.chrome.lastCheck = Date.now();
  if (!meta || meta.device === S.deviceId || meta.ts <= (S.sync.chrome.seenTs || 0)) return false;
  const snap = await unpackFromChromeSync(all);
  if (!snap) return false;
  await applyRemote(snap, BROWSER_SYNC);
  Object.assign(S.sync.chrome, { seenTs: meta.ts, lastPull: Date.now() });
  return true;
}

async function chromePush() {
  await chromePull();
  const { items, count, bytes, ts } = await packForChromeSync(localSyncState(await credsSyncAllowed()));
  const stale = Object.keys(await chrome.storage.sync.get(null)).filter((k) => k.startsWith(SYNC_PREFIX) && !(k in items));
  await chrome.storage.sync.set(items); // tek yazma işlemi
  if (stale.length) await chrome.storage.sync.remove(stale);
  Object.assign(S.sync.chrome, { lastPush: Date.now(), seenTs: ts, count, bytes, error: null });
  log('ok', 'log.syncPushed', { target: BROWSER_SYNC, n: count });
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync' || !changes[SYNC_PREFIX + 'meta']) return;
  await ready;
  const meta = changes[SYNC_PREFIX + 'meta'].newValue;
  if (!meta || meta.device === S.deviceId || !S.settings.syncChrome) return;
  try {
    await chromePull();
    await saveSyncState();
    flush();
  } catch (e) {
    S.sync.chrome.error = e.message;
  }
});

// --- Google Drive senkronu

let driveToken = null;

// Kullanıcının kendi istemcisi (Ayarlar → Gelişmiş) yoksa eklentiye gömülü olan kullanılır.
const driveClientId = () => (S.settings.driveClientId || '').trim() || BUILTIN_CLIENT_ID;

async function getDriveToken(force = false, interactive = false) {
  if (!force && driveToken?.exp > Date.now() + 60000) return driveToken.token;
  if (!force && !driveToken) {
    const { driveToken: saved } = await chrome.storage.session.get('driveToken');
    if (saved?.exp > Date.now() + 60000) return (driveToken = saved).token;
  }
  const clientId = driveClientId();
  if (!clientId) throw new Error('e.driveNoClient');
  let resp;
  try {
    const url = authUrl({ clientId, redirectUri: authRedirectUrl(), interactive, loginHint: S.sync.drive.email });
    resp = await chrome.identity.launchWebAuthFlow({ url, interactive });
  } catch (e) {
    throw new Error(interactive ? 'e.driveAuthFailed' : 'e.driveReauth');
  }
  driveToken = parseAuthRedirect(resp); // Drive izni verilmediyse e.driveScopeMissing fırlatır
  await chrome.storage.session.set({ driveToken });
  return driveToken.token;
}

const drive = createDriveClient({ getToken: (force) => getDriveToken(force) });

async function drivePull() {
  const f = await drive.read();
  S.sync.drive.lastCheck = Date.now();
  if (!f) return false;
  S.sync.drive.fileId = f.id;
  const snap = f.data;
  if (!snap || snap.device === S.deviceId || snap.ts <= (S.sync.drive.seenTs || 0)) return false;
  await applyRemote(snap, 'Google Drive');
  Object.assign(S.sync.drive, { seenTs: snap.ts, lastPull: Date.now() });
  return true;
}

async function drivePush() {
  await drivePull();
  const snap = buildSnapshot(localSyncState(await credsSyncAllowed()), DRIVE_MAX_PROXIES);
  S.sync.drive.fileId = await drive.write(snap, S.sync.drive.fileId);
  Object.assign(S.sync.drive, { lastPush: Date.now(), seenTs: snap.ts, count: snap.proxies.length, error: null });
  log('ok', 'log.syncPushed', { target: 'Google Drive', n: snap.proxies.length });
}

// --- ortak

let syncBusy = false;

async function runSync(kind) {
  if (syncBusy) return;
  syncBusy = true;
  const tg = syncTargets();
  const steps = [
    tg.chrome && ['chrome', kind === 'push' ? chromePush : chromePull, 'Chrome'],
    tg.drive && ['drive', kind === 'push' ? drivePush : drivePull, 'Google Drive'],
  ].filter(Boolean);
  try {
    for (const [key, fn, label] of steps) {
      try {
        await fn();
        S.sync[key].error = null;
      } catch (e) {
        S.sync[key].error = e.message;
        log('err', 'log.syncFail', { target: label, err: errParam(e) });
      }
    }
  } finally {
    syncBusy = false;
    await saveSyncState();
    flush();
  }
}

const syncPushAll = () => runSync('push');
const syncPullAll = () => runSync('pull');

// ---------------------------------------------------------------- komutlar

function removeIds(ids) {
  let n = 0;
  for (const id of ids) {
    if (S.proxies.delete(id)) {
      removed.push(id);
      n++;
    }
    if (id === S.active.id) S.active = { ...S.active, enabled: false, id: null };
  }
  saveActive();
  applyProxy();
  scheduleSave();
  scheduleFlush();
  return n;
}

const handlers = {
  state: () => fullState(),

  download: ({ ids, test }) =>
    startJob('job.download', async (job) => {
      const added = await downloadSources(job, ids);
      const autoTest = test ?? S.settings.autoTestAfterDownload;
      if (autoTest && !job.cancelled) {
        job.label = 'job.downloadTest';
        await testProxies(job, idsFor('new'));
      } else if (!added.length) log('info', 'log.noNew');
    }),

  test: ({ ids, filter }) => {
    const list = ids || idsFor(filter || 'all');
    const label = { new: 'job.testNew', alive: 'job.testAlive', dead: 'job.testDead' }[filter] || 'job.test';
    return startJob(label, (job) => testProxies(job, list));
  },

  stop: () => {
    if (!S.job) return;
    S.job.cancelled = true;
    for (const c of S.job.ctrls) c.abort();
    log('warn', 'log.stopping');
  },

  // Seçilen proxy doğrulamada yanıt vermezse ve Otomatik geçiş açıksa sıradaki en iyi adaylar denenir.
  connect: async ({ id }) => {
    const r = await connect(id);
    if (r.ok || r.superseded || !S.active.autoSwitch) return r;
    const tried = new Set([id]);
    for (const c of pickBest(tried).slice(0, 4)) {
      tried.add(c.id);
      const rc = await connect(c.id);
      if (rc.superseded) return rc;
      if (rc.ok) {
        log('info', 'log.autoSwitch', { from: fmt(S.proxies.get(id) || { host: '?', port: '' }), to: fmt(c) });
        return { ...rc, switchedTo: c.id };
      }
    }
    return r;
  },
  setEnabled: ({ enabled }) => setEnabled(enabled),
  setAutoSwitch: async ({ value }) => {
    S.active = { ...S.active, autoSwitch: !!value };
    await saveActive();
    log('info', value ? 'log.autoSwitchOn' : 'log.autoSwitchOff');
    flush();
  },

  delete: ({ ids }) => removeIds(ids),
  purge: ({ mode }) => {
    const ids = [...S.proxies.values()]
      .filter((p) => (mode === 'all' ? p.id !== S.active.id : p.status === 'dead'))
      .map((p) => p.id);
    const n = removeIds(ids);
    log('info', 'log.deleted', { n });
    broadcastFull();
    return n;
  },

  fav: ({ ids, value }) => {
    for (const id of ids) {
      const p = S.proxies.get(id);
      if (p) {
        p.fav = !!value;
        p.flagTs = Date.now();
        touch(p);
      }
    }
    scheduleSave();
    scheduleSyncPush();
  },

  import: async ({ text, type, test }) => {
    const list = parseManualList(text, type);
    const ids = [];
    for (const p of list) {
      const id = proxyId(p.type, p.host, p.port);
      const old = S.proxies.get(id);
      if (old) {
        if (p.user) Object.assign(old, { user: p.user, pass: p.pass });
        old.mine = true;
        old.flagTs = Date.now();
        touch(old);
      } else {
        const np = { id, ...p, status: 'new', source: 'manual', mine: true, flagTs: Date.now(), added: Date.now(), ok: 0, fail: 0, streak: 0 };
        await geoFill(np);
        S.proxies.set(id, np);
        touch(np);
      }
      ids.push(id);
    }
    scheduleSave();
    scheduleSyncPush();
    log('info', 'log.imported', { n: list.length });
    if (test && ids.length && !S.job) startJob('job.import', (job) => testProxies(job, ids));
    return ids.length;
  },

  saveSettings: async ({ settings }) => {
    S.settings = { ...S.settings, ...settings };
    S.settingsTs = Date.now();
    setLang(resolveLang(S.settings.lang));
    await chrome.storage.local.set({ settings: S.settings });
    await saveSyncState();
    scheduleSyncPush();
    await setupAlarms();
    await applyProxy();
    broadcastFull();
  },

  saveSources: async ({ sources }) => {
    S.sources = sources;
    S.sourcesTs = Date.now();
    await chrome.storage.local.set({ sources });
    await saveSyncState();
    scheduleSyncPush();
    broadcastFull();
  },

  resetSources: async () => {
    S.sources = DEFAULT_SOURCES.map((s) => ({ ...s }));
    S.sourcesTs = Date.now();
    await chrome.storage.local.set({ sources: S.sources });
    await saveSyncState();
    scheduleSyncPush();
    broadcastFull();
  },

  // Senkronizasyon komutları
  syncNow: async () => {
    await syncPushAll();
    return syncView();
  },
  driveConnect: async () => {
    let token;
    try {
      token = await getDriveToken(true, true);
    } catch (e) {
      // Drive izni verilmeden geçildiyse bağlı sayma; kullanıcı yeniden bağlanıp kutuyu işaretlemeli.
      S.sync.drive = { ...S.sync.drive, connected: false, error: e.message };
      await saveSyncState();
      flush();
      throw e;
    }
    const email = await fetchEmail(token).catch(() => '');
    S.sync.drive = { ...S.sync.drive, connected: true, email, error: null };
    await saveSyncState();
    log('ok', 'log.driveConnected', { email: email || '?' });
    await syncPushAll(); // önce uzaktakini alır, sonra birleşik listeyi yazar
    return syncView();
  },
  driveDisconnect: async () => {
    const tok = driveToken?.token;
    driveToken = null;
    await chrome.storage.session.remove('driveToken');
    if (tok) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(tok), { method: 'POST' }).catch(() => {});
    S.sync.drive = {};
    await saveSyncState();
    log('info', 'log.driveDisconnected');
    flush();
    return syncView();
  },

  // Şu anki çıkış IP'sini (aktif proxy üzerinden) ve konumunu göster.
  checkIp: async () => {
    let ip, ms;
    for (const u of ['https://api.ipify.org/', 'https://icanhazip.com/', 'http://httpbin.org/ip', 'https://ifconfig.me/ip']) {
      try {
        const r = await fetchText(`${u}?_=${rnd()}`, 10000);
        ip = r.res.ok && (r.text.match(IPV4) || []).pop();
        ms = r.ms;
        if (ip) break;
      } catch {}
    }
    if (!ip) throw new Error('e.ipFailed');
    return { ip, ms, ...((await geoOne(ip)) || {}) };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    await ready;
    const h = handlers[msg?.cmd];
    if (!h) throw new Error('e.unknownCmd');
    return h(msg);
  })().then(
    (data) => sendResponse({ ok: true, data }),
    (e) => sendResponse({ ok: false, error: e.message || String(e) }),
  );
  return true;
});
