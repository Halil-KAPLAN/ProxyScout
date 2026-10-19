// Firefox uçtan uca testi: dist/firefox paketini (node tools/build-zip.mjs) gerçek Firefox'a geçici eklenti
// olarak yükler ve şunları doğrular:
//  1. Yerel, kullanıcı adı/şifreli bir HTTP proxy'ye bağlanınca sayfa trafiği o proxy'den geçer ve eklenti
//     proxy kimlik doğrulamasını yapar (webRequest.onAuthRequired, "blocking").
//     Aynısı kullanıcı adı/şifreli yerel bir SOCKS5 proxy için (alan adı proxy'de çözülür, DNS sızmaz).
//  2. Ölü bir proxy'ye bağlıyken sayfalar açılmaz; Firefox doğrudan bağlantıya düşüp gerçek IP'yi sızdırmaz.
//  3. Gerçek listeler indirilip test edilir, çalışan bir proxy'ye bağlanınca çıkış IP'si değişir, kapatınca geri gelir.
//  4. Yönetici ve popup sayfaları hatasız açılır (ekran görüntüleri).
// Sürücü: Selenium + geckodriver. Firefox, otomasyonun moz-extension:// adreslerine gitmesine izin vermez; bu yüzden
// eklentinin kurulumda kendisinin açtığı yönetici sekmesi kullanılır, diğer eklenti sayfaları o sayfanın içinden açılır.
// Kullanım: node tests/e2e-firefox.mjs <selenium-webdriver kurulu klasör> [ekran görüntüsü klasörü] [firefox.exe]
import { createRequire } from 'node:module';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [selDir, shotDir = '.', ffPath = 'C:/Program Files/Mozilla Firefox/firefox.exe'] = process.argv.slice(2);
const req = createRequire(path.join(selDir, 'package.json'));
const { Builder } = req('selenium-webdriver');
const firefox = req('selenium-webdriver/firefox');
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/firefox');
const GECKO_ID = 'proxyscout@halil-kaplan.github.io';
const UUID = '6f3a2b1c-0d4e-4f5a-9b8c-7d6e5f4a3b2c'; // moz-extension:// adresini sabitlemek için
const BASE = `moz-extension://${UUID}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'GEÇTİ' : 'KALDI'} · ${name}${info ? ' · ' + info : ''}`);
};

// --- Yerel, kimlik doğrulamalı HTTP proxy (HTTP iletme + CONNECT tüneli)
const AUTH = 'Basic ' + Buffer.from('tester:s3cret').toString('base64');
const seen = { authed: 0, rejected: 0, hosts: new Set() };
const proxy = http.createServer((rq, res) => {
  if (rq.headers['proxy-authorization'] !== AUTH) {
    seen.rejected++;
    res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="t"' });
    return res.end();
  }
  seen.authed++;
  const u = new URL(rq.url);
  seen.hosts.add(u.host);
  const headers = { ...rq.headers };
  delete headers['proxy-authorization'];
  const up = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: rq.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => res.destroy());
  rq.pipe(up);
});
proxy.on('connect', (rq, sock, head) => {
  if (rq.headers['proxy-authorization'] !== AUTH) {
    seen.rejected++;
    sock.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="t"\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  seen.authed++;
  seen.hosts.add(rq.url);
  const [h, p] = rq.url.split(':');
  const up = net.connect(+p || 443, h, () => {
    sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    up.write(head);
    up.pipe(sock);
    sock.pipe(up);
  });
  up.on('error', () => sock.destroy());
  sock.on('error', () => up.destroy());
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
const PROXY_PORT = proxy.address().port;

// --- Yerel, kullanıcı adı/şifreli SOCKS5 proxy (RFC 1928 + RFC 1929; yalnızca CONNECT)
const socksSeen = { authed: 0, rejected: 0, hosts: new Set() };
const socks = net.createServer((c) => {
  c.once('data', (hello) => {
    if (hello[0] !== 5 || !hello.subarray(2, 2 + hello[1]).includes(2)) return c.end(Buffer.from([5, 0xff]));
    c.write(Buffer.from([5, 2])); // kullanıcı adı/şifre yöntemi
    c.once('data', (a) => {
      const ul = a[1];
      const user = a.subarray(2, 2 + ul).toString();
      const pass = a.subarray(3 + ul, 3 + ul + a[2 + ul]).toString();
      if (user !== 'sockuser' || pass !== 'sockpass') {
        socksSeen.rejected++;
        return c.end(Buffer.from([1, 1]));
      }
      socksSeen.authed++;
      c.write(Buffer.from([1, 0]));
      c.once('data', (r) => {
        let host;
        let i = 4;
        if (r[3] === 1) (host = [...r.subarray(4, 8)].join('.')), (i = 8);
        else if (r[3] === 3) (host = r.subarray(5, 5 + r[4]).toString()), (i = 5 + r[4]);
        else return c.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
        const port = r.readUInt16BE(i);
        socksSeen.hosts.add(`${host}:${port}`);
        const up = net.connect(port, host, () => {
          c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          up.pipe(c);
          c.pipe(up);
        });
        up.on('error', () => c.destroy());
        c.on('error', () => up.destroy());
      });
    });
  });
});
await new Promise((r) => socks.listen(0, '127.0.0.1', r));
const SOCKS_PORT = socks.address().port;
// Ölü proxy: bir portu açıp hemen kapatarak dinlenmeyen bir port bul.
const DEAD_PORT = await new Promise((r) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});

const opts = new firefox.Options()
  .addArguments('-headless')
  .setBinary(ffPath)
  .setPreference('extensions.webextensions.uuids', JSON.stringify({ [GECKO_ID]: UUID }));
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(opts).build();
const shot = async (name) => writeFileSync(path.join(shotDir, name), await driver.takeScreenshot(), 'base64');

try {
  await driver.manage().window().setRect({ width: 1440, height: 900 });
  await driver.manage().setTimeouts({ script: 120000, pageLoad: 30000 });
  const id = await driver.installAddon(EXT, true);
  check("eklenti Firefox'a yüklendi", id === GECKO_ID, id);

  // Kurulumda eklentinin açtığı yönetici sekmesini bul.
  let mgr = null;
  for (let i = 0; i < 20 && !mgr; i++) {
    await sleep(500);
    for (const h of await driver.getAllWindowHandles()) {
      await driver.switchTo().window(h);
      if ((await driver.getCurrentUrl()).startsWith(BASE + '/manager.html')) mgr = h;
    }
  }
  check('kurulumda yönetici sayfası açıldı (arka plan çalışıyor)', !!mgr);
  if (!mgr) throw new Error('yönetici sekmesi yok');
  const toMgr = () => driver.switchTo().window(mgr);

  const errors = [];
  const trackErrors = () =>
    driver.executeScript(
      "window.__errs = window.__errs || []; addEventListener('error', (e) => __errs.push(String(e.message))); addEventListener('unhandledrejection', (e) => __errs.push(String((e.reason && e.reason.message) || e.reason)));",
    );
  const collectErrors = async () => errors.push(...((await driver.executeScript('return window.__errs || []')) || []));
  const cmd = async (c, args = {}) => {
    await toMgr();
    for (let i = 0; ; i++) {
      try {
        const r = await driver.executeAsyncScript(
          'const done = arguments[arguments.length - 1]; chrome.runtime.sendMessage(Object.assign({ cmd: arguments[0] }, arguments[1])).then((r) => done(r), (e) => done({ ok: false, error: String(e.message) }));',
          c,
          args,
        );
        if (!r?.ok) throw new Error(r?.error || 'yanıt yok');
        return r.data;
      } catch (e) {
        if (i > 5 || !/unload|navigat|discard|context|stale|no such/i.test(e.message)) throw e;
        await sleep(1000);
      }
    }
  };
  // Eklenti sayfaları yalnızca eklentinin kendi sayfasından açılabilir.
  const openExt = async (file) => {
    await toMgr();
    await collectErrors().catch(() => {});
    await driver.executeScript('location.href = arguments[0]', file);
    await sleep(1800);
    await trackErrors();
  };
  await trackErrors();
  const st0 = await cmd('state');
  check('arka plan yanıt veriyor', !!st0 && Array.isArray(st0.proxies));

  const realIp = (await (await fetch('https://api.ipify.org')).text()).trim();
  console.log('gerçek IP:', realIp);
  await driver.switchTo().newWindow('tab');
  const tab = await driver.getWindowHandle();
  const pageIp = async () => {
    await driver.switchTo().window(tab);
    await driver.manage().setTimeouts({ script: 120000, pageLoad: 20000 });
    try {
      // Düz metin: Firefox JSON yanıtlarını kendi JSON görüntüleyicisinde gösterir.
      await driver.get('https://api.ipify.org/');
      const txt = (await driver.executeScript('return document.body ? document.body.innerText : ""')).trim();
      if (!/^[0-9a-f.:]+$/i.test(txt)) throw new Error('IP değil: ' + txt.slice(0, 60));
      return txt;
    } finally {
      await driver.manage().setTimeouts({ script: 120000, pageLoad: 30000 });
    }
  };

  // 1) Şifreli yerel proxy
  await cmd('saveSettings', { settings: { lang: 'tr', concurrency: 150, timeout: 7000 } });
  await openExt('manager.html');
  await cmd('import', { text: `tester:s3cret@127.0.0.1:${PROXY_PORT}`, type: 'http', test: false });
  const local = (await cmd('state')).proxies.find((p) => p.port === PROXY_PORT);
  check('şifreli proxy içe aktarıldı', !!local?.user);
  const r1 = await cmd('connect', { id: local.id });
  console.log('connect (yerel):', JSON.stringify(r1));
  seen.hosts.clear();
  const authed0 = seen.authed;
  let ipViaLocal = null;
  try {
    ipViaLocal = await pageIp();
  } catch (e) {
    console.log('sayfa açılamadı:', e.message.split('\n')[0]);
  }
  check("trafik yerel proxy'den geçti", seen.hosts.has('api.ipify.org:443'), [...seen.hosts].join(','));
  check('proxy kimlik doğrulaması yapıldı', seen.authed > authed0 && !!ipViaLocal, `yetkili=${seen.authed - authed0} reddedilen=${seen.rejected}`);

  // 1b) Şifreli SOCKS5 (Firefox'a özgü; Chrome SOCKS5'te kimlik doğrulamayı desteklemez)
  await cmd('import', { text: `socks5://sockuser:sockpass@127.0.0.1:${SOCKS_PORT}`, type: 'socks5', test: false });
  const sp = (await cmd('state')).proxies.find((p) => p.port === SOCKS_PORT);
  await cmd('connect', { id: sp.id }).catch((e) => console.log('connect (socks5):', e.message));
  socksSeen.hosts.clear();
  let ipViaSocks = null;
  try {
    ipViaSocks = await pageIp();
  } catch (e) {
    console.log('socks5 ile sayfa açılamadı:', e.message.split('\n')[0]);
  }
  // proxyDNS: alan adı istemcide değil proxy'de çözülmeli (DNS sızıntısı yok).
  check("şifreli SOCKS5 proxy'den geçti (alan adı proxy'de çözüldü)", socksSeen.hosts.has('api.ipify.org:443') && !!ipViaSocks, `yetkili=${socksSeen.authed} reddedilen=${socksSeen.rejected} hedefler=${[...socksSeen.hosts].join(',')}`);
  await cmd('setEnabled', { enabled: false });
  await cmd('delete', { ids: [sp.id] });

  // 2) Ölü proxy → sızıntı yok
  await cmd('import', { text: `127.0.0.1:${DEAD_PORT}`, type: 'http', test: false });
  const dead = (await cmd('state')).proxies.find((p) => p.port === DEAD_PORT);
  await cmd('setAutoSwitch', { value: false }).catch(() => {});
  await cmd('connect', { id: dead.id }).catch((e) => console.log('connect (ölü):', e.message));
  const a = (await cmd('state')).active;
  if (!a.enabled || a.id !== dead.id) await cmd('setEnabled', { enabled: true }).catch(() => {});
  console.log('ölü proxy etkin:', JSON.stringify((await cmd('state')).active));
  let leaked = null;
  try {
    leaked = await pageIp();
  } catch (e) {
    console.log('ölü proxy ile sayfa açılmadı (beklenen):', e.message.split('\n')[0]);
  }
  check("ölü proxy'deyken gerçek IP sızmadı", leaked !== realIp, leaked ? `sayfa açıldı, IP=${leaked}` : 'sayfa açılmadı');
  await cmd('setEnabled', { enabled: false });
  await cmd('delete', { ids: [local.id, dead.id] });

  // 3) Gerçek listeler
  const st = await cmd('state');
  const pick = { monosans: ['http', 'socks5'], sslproxies: ['http'], proxyscrape: ['http'] };
  await cmd('saveSources', { sources: st.sources.map((s) => ({ ...s, enabled: !!pick[s.id], types: pick[s.id] || s.types })) });
  await cmd('download', {});
  const t0 = Date.now();
  let last = '';
  for (;;) {
    await sleep(3000);
    const j = (await cmd('state')).job;
    const line = j ? `${j.phase} ${j.done}/${j.total} çalışan=${j.alive} ölü=${j.dead}` : 'bitti';
    if (line !== last && (!j || j.phase !== last.split(' ')[0])) console.log(`[${Math.round((Date.now() - t0) / 1000)}s]`, line);
    last = line;
    if (!j) break;
    if (Date.now() - t0 > 10 * 60000) throw new Error('zaman aşımı');
  }
  const s = await cmd('state');
  const alive = s.proxies.filter((p) => p.status === 'alive');
  const by = (f) => alive.filter(f).length;
  console.log(`toplam=${s.proxies.length} çalışan=${alive.length} elit=${by((p) => p.anon === 'elite')} ssl=${by((p) => p.ssl === true)} ülkeli=${by((p) => p.country)} şehirli=${by((p) => p.city)}`);
  check('listeler indirildi ve test edildi', s.proxies.length > 100 && alive.length > 0, `toplam=${s.proxies.length} çalışan=${alive.length}`);
  check('HTTPS testi çalışıyor', by((p) => p.ssl === true) > 0, `ssl=${by((p) => p.ssl === true)}`);
  check('ülke bilgisi geliyor', s.proxies.filter((p) => p.country).length > s.proxies.length * 0.9);

  let passed = false;
  const cands = alive.filter((p) => p.ssl === true && p.anon !== 'transparent').sort((x, y) => x.latency - y.latency).slice(0, 6);
  for (const c of cands) {
    const r = await cmd('connect', { id: c.id });
    try {
      const ip = await pageIp();
      console.log(`bağlı ${c.id} (${c.country}) → sayfanın gördüğü IP: ${ip}`, JSON.stringify(r));
      if (ip && ip !== realIp) {
        passed = true;
        break;
      }
    } catch (e) {
      console.log(`bağlı ${c.id} → sayfa açılamadı: ${e.message.split('\n')[0]}`);
    }
  }
  check("çalışan proxy'ye bağlanınca çıkış IP'si değişti", passed);

  await openExt('manager.html');
  await driver.executeScript("document.querySelector('[data-cat=alive]')?.click()");
  await sleep(800);
  await shot('ff-tr-connected.png');

  await openExt('popup.html');
  const popupState = await driver.executeScript("const w = document.querySelector('#toggleWrap'); return w ? w.dataset.state : null");
  await driver.manage().window().setRect({ width: 420, height: 700 });
  await sleep(400);
  await shot('ff-tr-popup.png');
  await driver.manage().window().setRect({ width: 1440, height: 900 });
  check('popup açıldı', !!popupState, String(popupState));

  await cmd('saveSettings', { settings: { lang: 'en' } });
  await sleep(1500);
  await openExt('manager.html#settings');
  await driver.executeScript("document.querySelector('[data-view=settings]')?.click()");
  await sleep(800);
  await shot('ff-en-settings.png');
  const syncLabel = await driver.executeScript('return document.querySelector(\'[data-i18n="set.syncFirefox"]\')?.innerText || ""');
  check('Firefox senkron etiketi gösteriliyor', /Firefox sync/.test(syncLabel), syncLabel.slice(0, 40));
  const redirect = await driver.executeScript("return document.querySelector('#redirectUri')?.textContent || ''");
  console.log('Google yönlendirme adresi (Firefox):', redirect);
  check('Firefox yönlendirme adresi üretildi', /^https:\/\/[0-9a-f]+\.extensions\.allizom\.org\/$/.test(redirect));

  await cmd('setEnabled', { enabled: false });
  await sleep(500);
  const ipOff = await pageIp();
  check("kapatınca gerçek IP'ye dönüldü", ipOff === realIp, ipOff);

  const logs = (await cmd('state')).logs || [];
  const errLogs = logs.filter((l) => l.level === 'err' && /applyFail|otherExt/.test(l.key || ''));
  check('proxy ayarı hatası yok', errLogs.length === 0, JSON.stringify(errLogs.slice(0, 3)));
  await toMgr();
  await collectErrors();
  check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
} finally {
  await driver.quit();
  proxy.close();
  socks.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSONUÇ: ${results.length - failed.length}/${results.length} geçti${failed.length ? ' · KALANLAR: ' + failed.map((f) => f.name).join('; ') : ''}`);
  process.exitCode = failed.length ? 1 : 0;
}
