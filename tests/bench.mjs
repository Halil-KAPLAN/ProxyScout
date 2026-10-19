// Gerçek site karşılaştırması: listeleri indirip test eder, sonra
//   A) gerçek site testini GEÇEN proxy'ler (HTTPS ✓) ile
//   B) HTTP testini geçip gerçek site testinde KALAN proxy'ler ile
// gerçek siteleri tarayıcıda açmayı dener ve başarı oranlarını karşılaştırır.
// Kullanım: node tests/bench.mjs <puppeteer klasörü> [grup başına proxy sayısı]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [ptDir, perGroup = '8'] = process.argv.slice(2);
const N = +perGroup;
const puppeteer = createRequire(path.join(ptDir, 'package.json'))('puppeteer');
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension');
const SITES = ['https://www.wikipedia.org/', 'https://github.com/', 'https://www.bing.com/'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT] });
try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'), { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  await sleep(1500);
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`);
  const cmd = (c, args = {}) =>
    page.evaluate(async (c, args) => {
      const r = await chrome.runtime.sendMessage({ cmd: c, ...args });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    }, c, args);

  const st = await cmd('state');
  const pick = { monosans: ['http', 'socks5'], sslproxies: ['http'], proxyscrape: ['http', 'socks5'] };
  await cmd('saveSources', { sources: st.sources.map((s) => ({ ...s, enabled: !!pick[s.id], types: pick[s.id] || s.types })) });
  await cmd('saveSettings', { settings: { concurrency: 150, timeout: 7000, geo: false } });
  await cmd('download', {});
  const t0 = Date.now();
  for (;;) {
    await sleep(5000);
    const j = (await cmd('state')).job;
    if (!j) break;
    if (Date.now() - t0 > 15 * 60000) throw new Error('zaman aşımı');
  }
  const s = await cmd('state');
  const alive = s.proxies.filter((p) => p.status === 'alive');
  const pass = alive.filter((p) => p.ssl === true).sort((a, b) => a.latency - b.latency);
  const fail = alive.filter((p) => p.ssl === false).sort((a, b) => a.latency - b.latency);
  const errs = fail.reduce((m, p) => ((m[p.sslError] = (m[p.sslError] || 0) + 1), m), {});
  console.log(`test süresi ${Math.round((Date.now() - t0) / 1000)} sn · çalışan(HTTP)=${alive.length} · gerçek testi geçen=${pass.length} · kalan=${fail.length} ${JSON.stringify(errs)}`);

  const tab = await browser.newPage();
  async function tryGroup(name, list) {
    let ok = 0, total = 0;
    for (const p of list.slice(0, N)) {
      await cmd('connect', { id: p.id });
      const res = [];
      for (const url of SITES) {
        total++;
        try {
          const r = await tab.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
          const good = r && r.status() < 400;
          if (good) ok++;
          res.push(good ? '✓' : r ? r.status() : '✗');
        } catch {
          res.push('✗');
        }
      }
      console.log(`  ${name} ${p.type.padEnd(6)} ${(p.host + ':' + p.port).padEnd(22)} ${String(p.latency).padStart(5)} ms ${p.sslMs != null ? ('https ' + p.sslMs + 'ms').padStart(13) : '             '}  ${res.join(' ')}`);
    }
    await cmd('setEnabled', { enabled: false });
    return { ok, total };
  }
  const a = await tryGroup('GEÇEN', pass);
  const b = await tryGroup('KALAN', fail);
  const pct = (x) => (x.total ? Math.round((x.ok * 100) / x.total) : 0);
  console.log(`\nSONUÇ — siteleri açabilme oranı: gerçek testi geçenler %${pct(a)} (${a.ok}/${a.total}), kalanlar %${pct(b)} (${b.ok}/${b.total})`);
} finally {
  await browser.close();
}
