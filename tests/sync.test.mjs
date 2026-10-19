// Senkronizasyon testleri: node --test tests/sync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, mergeSnapshot, packForChromeSync, unpackFromChromeSync, compress, decompress, SYNC_TOTAL_BYTES, SYNC_ITEM_BYTES } from '../extension/lib/sync.js';
import { createDriveClient, parseAuthRedirect, authUrl } from '../extension/lib/drive.js';

const NOW = Date.now();
const px = (o) => ({ type: 'http', host: '1.2.3.4', port: 80, status: 'alive', anon: 'elite', ssl: true, sslMs: 300, latency: 200, lastCheck: NOW - 60000, ok: 1, fail: 0, ...o, id: `${o.type || 'http'}://${o.host || '1.2.3.4'}:${o.port || 80}` });

function state(proxies, extra = {}) {
  return { proxies, settings: { lang: 'tr', concurrency: 100, driveClientId: 'secret-id' }, settingsTs: 10, sources: [{ id: 'monosans', enabled: true, types: ['http'], lastCount: 5 }, { id: 'c1', custom: true, name: 'Benim', feeds: [{ type: 'http', url: 'https://x/y' }], enabled: true, lastFetch: 1 }], sourcesTs: 10, device: 'devA', ...extra };
}

test('özet yalnızca değerli proxy\'leri içerir, cihaza özel ayar ve kaynak istatistikleri taşınmaz', () => {
  const list = [px({ host: '1.1.1.1' }), px({ host: '2.2.2.2', status: 'dead' }), px({ host: '3.3.3.3', status: 'dead', fav: true }), px({ host: '4.4.4.4', status: 'new', mine: true, user: 'u', pass: 'p' })];
  const snap = buildSnapshot(state(list), 100);
  assert.equal(snap.proxies.length, 3); // ölü ama favori/kendi olmayan 2.2.2.2 yok
  assert.equal(snap.settings.driveClientId, undefined);
  assert.equal(snap.sources[0].lastCount, undefined);
  assert.equal(snap.sources[1].lastFetch, undefined);
  assert.equal(snap.sources[1].feeds[0].url, 'https://x/y');
});

test('birleştirme: yeni proxy eklenir, daha yeni test sonucu ve favori kazanır', () => {
  const remote = buildSnapshot(state([px({ host: '9.9.9.9', fav: true, flagTs: NOW }), px({ host: '1.1.1.1', latency: 111, lastCheck: NOW, country: 'DE' }), px({ host: '5.5.5.5', latency: 999, lastCheck: NOW - 3600e3 })], { settingsTs: 50, sourcesTs: 5 }), 100);
  const local = {
    proxies: new Map([
      ['http://1.1.1.1:80', px({ host: '1.1.1.1', latency: 500, lastCheck: NOW - 600e3 })],
      ['http://5.5.5.5:80', px({ host: '5.5.5.5', latency: 50, lastCheck: NOW - 60e3, fav: true, flagTs: NOW - 1e3 })],
    ]),
    settings: { lang: 'en', driveClientId: 'mine' }, settingsTs: 20, sources: [], sourcesTs: 20,
  };
  const r = mergeSnapshot(local, remote);
  assert.deepEqual(r.added, ['http://9.9.9.9:80']);
  assert.ok(local.proxies.get('http://9.9.9.9:80').fav);
  assert.equal(local.proxies.get('http://1.1.1.1:80').latency, 111); // uzak daha yeni
  assert.equal(local.proxies.get('http://1.1.1.1:80').country, 'DE');
  assert.equal(local.proxies.get('http://5.5.5.5:80').latency, 50); // yerel daha yeni
  assert.equal(local.proxies.get('http://5.5.5.5:80').fav, true); // yereldeki favori daha yeni
  assert.ok(r.settings);
  assert.equal(local.settings.lang, 'tr');
  assert.equal(local.settings.driveClientId, 'mine'); // cihaza özel ayar korunur
  assert.ok(!r.sources); // uzaktaki kaynaklar daha eski
});

test('favoriden çıkarma da senkronize olur (son yazan kazanır)', () => {
  const remote = buildSnapshot(state([px({ host: '7.7.7.7', status: 'alive', fav: false, flagTs: NOW })]), 10);
  const local = { proxies: new Map([['http://7.7.7.7:80', px({ host: '7.7.7.7', fav: true, flagTs: NOW - 120e3 })]]), settings: {}, settingsTs: 99, sources: [], sourcesTs: 99 };
  mergeSnapshot(local, remote);
  assert.equal(local.proxies.get('http://7.7.7.7:80').fav, false);
});

test('sıkıştırma gidiş-dönüş ve chrome.storage.sync sınırlarına sığdırma', async () => {
  assert.deepEqual(await decompress(await compress({ a: [1, 'ğüş'] })), { a: [1, 'ğüş'] });
  const many = [];
  for (let i = 0; i < 6000; i++) many.push(px({ host: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, port: 1000 + (i % 50000), sslMs: i, latency: i, country: 'US', city: 'Ashburn' + (i % 97) }));
  const packed = await packForChromeSync(state(many), 6000);
  const total = Object.entries(packed.items).reduce((n, [k, v]) => n + k.length + JSON.stringify(v).length, 0);
  assert.ok(total <= SYNC_TOTAL_BYTES, `toplam ${total}`);
  for (const [k, v] of Object.entries(packed.items)) assert.ok(k.length + JSON.stringify(v).length <= 8192, k);
  assert.ok(packed.count > 300 && packed.count <= 6000, `sığan proxy: ${packed.count}`);
  const back = await unpackFromChromeSync(packed.items);
  assert.equal(back.proxies.length, packed.count);
  // En iyi (en düşük HTTPS süreli) proxy'ler önceliklidir.
  assert.equal(back.proxies[0][6], 0);
  assert.ok(SYNC_ITEM_BYTES < 8192);
});

test('Drive istemcisi: oluşturur, okur, günceller; 401\'de anahtarı yeniler', async () => {
  const files = new Map();
  let tokenCalls = 0, expired = true;
  const fake = async (url, opts = {}) => {
    const u = new URL(url);
    const auth = opts.headers?.Authorization;
    if (expired && auth === 'Bearer t1') return new Response('', { status: 401 });
    if (u.pathname === '/drive/v3/files' && !opts.method) {
      return Response.json({ files: [...files.entries()].map(([id, f]) => ({ id, modifiedTime: f.t })) });
    }
    if (u.pathname.startsWith('/drive/v3/files/') && u.searchParams.get('alt') === 'media') return new Response(files.get(u.pathname.split('/').pop()).body);
    if (u.pathname === '/upload/drive/v3/files' && opts.method === 'POST') {
      assert.match(opts.headers['Content-Type'], /multipart\/related/);
      assert.match(opts.body, /"parents":\["appDataFolder"\]/);
      const body = opts.body.split('\r\n\r\n')[2].split('\r\n--')[0];
      files.set('f1', { body, t: '1' });
      return Response.json({ id: 'f1' });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files/') && opts.method === 'PATCH') {
      files.set(u.pathname.split('/').pop(), { body: opts.body, t: '2' });
      return Response.json({});
    }
    return new Response('?', { status: 404 });
  };
  const client = createDriveClient({
    fetchImpl: fake,
    getToken: async (force) => {
      tokenCalls++;
      if (force) expired = false;
      return expired ? 't1' : 't2';
    },
  });
  assert.equal(await client.read(), null);
  const id = await client.write({ v: 1, n: 1 });
  assert.equal(id, 'f1');
  assert.deepEqual((await client.read()).data, { v: 1, n: 1 });
  await client.write({ v: 1, n: 2 }, id);
  assert.deepEqual((await client.read()).data, { v: 1, n: 2 });
  assert.ok(tokenCalls >= 2);
});

test('OAuth yönlendirme ayrıştırma', () => {
  const r = parseAuthRedirect('https://abc.chromiumapp.org/#access_token=ya29.x&token_type=Bearer&expires_in=3599');
  assert.equal(r.token, 'ya29.x');
  assert.ok(r.exp > Date.now() + 3500e3);
  assert.throws(() => parseAuthRedirect('https://abc.chromiumapp.org/#error=interaction_required'), /interaction_required/);
  const u = new URL(authUrl({ clientId: 'cid', redirectUri: 'https://abc.chromiumapp.org/', interactive: false }));
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.appdata openid email');
  assert.equal(u.searchParams.get('prompt'), 'none');
});

test('Drive izni verilmeden geçilirse açık hata verir; izin ekranı her bağlanmada gösterilir', () => {
  assert.throws(() => parseAuthRedirect('https://x.chromiumapp.org/#access_token=a&expires_in=3599&scope=email%20openid'), /e\.driveScopeMissing/);
  const ok = parseAuthRedirect('https://x.chromiumapp.org/#access_token=a&expires_in=3599&scope=email%20https://www.googleapis.com/auth/drive.appdata');
  assert.equal(ok.token, 'a');
  const u = new URL(authUrl({ clientId: 'c', redirectUri: 'https://x.chromiumapp.org/', interactive: true }));
  assert.match(u.searchParams.get('prompt'), /consent/);
});

test('senkron girişi doğrulanır: kötü niyetli/bozuk satırlar ve ayarlar alınmaz', () => {
  const snap = {
    v: 1, ts: Date.now(), device: 'x', settingsTs: 99, sourcesTs: 99,
    settings: { concurrency: 50, judgeUrl: 123, evil: 'x', bypass: ['<local>', 7] },
    sources: [{ id: 'c9', custom: true, name: 'k', feeds: [{ type: 'http', url: 'javascript:alert(1)' }] }, { id: 'ok', custom: true, name: 'iyi', feeds: [{ type: 'socks5', url: 'https://ornek.com/l.txt' }] }],
    proxies: [
      ['h', '1.2.3.4', 80, 'a', 'e', 1, 100, 50, 'TR', 'İstanbul', 1, 1, 0, 0, 0, 's'],
      ['h', '"><img src=x onerror=alert(1)>', 80, 'a'],
      ['h', '5.6.7.8', 99999, 'a'],
      ['x', '5.6.7.8', 80, 'a'],
      ['5', '9.9.9.9', 1080, 'a', 'e', 1, 'abc', {}, '"><b>', 'c'.repeat(500), 1, 'x', 0, 0, 0, 's'],
      'bozuk',
    ],
  };
  const local = { proxies: new Map(), settings: { concurrency: 100, judgeUrl: 'http://a', bypass: ['<local>'] }, settingsTs: 1, sources: [], sourcesTs: 1 };
  const r = mergeSnapshot(local, snap);
  assert.deepEqual(r.added.sort(), ['http://1.2.3.4:80', 'socks5://9.9.9.9:1080']);
  const p = local.proxies.get('socks5://9.9.9.9:1080');
  assert.equal(p.country, undefined);
  assert.equal(p.sslMs, null);
  assert.equal(p.latency, null);
  assert.ok(p.city.length <= 80);
  assert.equal(local.settings.concurrency, 50);
  assert.equal(local.settings.judgeUrl, 'http://a'); // tür uymuyor → alınmadı
  assert.equal(local.settings.evil, undefined); // bilinmeyen ayar
  assert.deepEqual(local.settings.bypass, ['<local>']); // dizi içinde sayı → alınmadı
  assert.deepEqual(local.sources.map((s) => s.id), ['ok']); // javascript: adresli kaynak atıldı
});
