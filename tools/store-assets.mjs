// Mağaza görsellerini üretir (Chrome Web Store + Edge Add-ons):
//   store/screenshots/<tr|en>/0N-*.png   1280×800 ekran görüntüleri (başlıklı çerçeve)
//   store/screenshots/opera/<tr|en>/0N-*.png  aynıları 800×500 (Opera add-ons)
//   store/promo/small-440x280-<dil>.png  küçük tanıtım görseli
//   store/promo/marquee-1400x560-<dil>.png  büyük tanıtım görseli
// Eklenti gerçek bir Chrome'da çalıştırılır: listeler indirilip test edilir, bir proxy'ye bağlanılır.
// Kullanım: node tools/store-assets.mjs <puppeteer klasörü>
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ptDir = process.argv[2];
if (!ptDir) {
  console.error('Kullanım: node tools/store-assets.mjs <puppeteer klasörü>');
  process.exit(2);
}
const puppeteer = createRequire(path.join(ptDir, 'package.json'))('puppeteer');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'store');
const EXAMPLE_IP = '203.0.113.24'; // belgelendirme için ayrılmış örnek adres (gerçek IP gösterilmez)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (buf) => 'data:image/png;base64,' + Buffer.from(buf).toString('base64');

const TEXT = {
  tr: {
    list: ['Çalışan proxy\'leri bulur, test eder, ayıklar', 'Onlarca kaynaktan liste indirir; yalnızca HTTPS sitelerde gerçekten çalışanları sayar ve gruplara ayırır.'],
    popup: ['Tek tıkla bağlan, tek tıkla kapat', 'En iyi proxy\'ler en üstte — ülke, gizlilik, yanıt süresi ve açtığı sitelerle.'],
    sites: ['YouTube, Discord açılıyor mu?', 'Seçtiğin siteler en iyi proxy\'lerle denenir; hangisinin açıldığı ve ne kadar sürdüğü listede görünür. Kendi siteni de ekle.'],
    sources: ['Kaynakları ve türleri sen seç', '21 hazır kaynak; HTTP, SOCKS4, SOCKS5 seçimi ve kendi listelerini ekleme.'],
    sync: ['Listen tüm tarayıcılarında', 'Chrome senkronu ya da tek tıkla Google Drive: bulduğun proxy\'ler her cihazda hazır.'],
    tagline: 'Ücretsiz proxy\'leri bul, test et, tek tıkla bağlan',
  },
  en: {
    list: ['Finds, tests and sorts working proxies', 'Downloads lists from dozens of sources and counts only the proxies that really work on HTTPS sites, in clear groups.'],
    popup: ['Connect in one click, turn off in one click', 'The best proxies on top — with country, anonymity, response time and the sites they open.'],
    sites: ['Does it open YouTube or Discord?', 'The sites you pick are tried through the best proxies; the list shows which ones opened and how fast. Add your own sites too.'],
    sources: ['You choose the sources and types', '21 built-in sources; pick HTTP, SOCKS4, SOCKS5 and add your own lists.'],
    sync: ['Your list in every browser', 'Chrome sync or one-click Google Drive: the proxies you found are ready on every device.'],
    tagline: 'Find free proxies, test them, connect in one click',
  },
};

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], defaultViewport: { width: 1440, height: 900 } });
try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'), { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  await sleep(1500);
  const page = await browser.newPage();
  const url = (f) => `chrome-extension://${extId}/${f}`;
  const cmd = async (c, args = {}) => {
    for (let i = 0; ; i++) {
      try {
        return await page.evaluate(async (c, args) => {
          const r = await chrome.runtime.sendMessage({ cmd: c, ...args });
          if (!r.ok) throw new Error(r.error);
          return r.data;
        }, c, args);
      } catch (e) {
        if (i > 5 || !/context was destroyed|navigation/i.test(e.message)) throw e;
        await sleep(1000);
      }
    }
  };
  await page.goto(url('manager.html'));
  await sleep(800);

  // --- gerçek veri: indir, test et, bağlan
  await cmd('saveSettings', { settings: { lang: 'tr', concurrency: 150, timeout: 7000 } });
  const st = await cmd('state');
  const pick = { proxyscrape: ['http', 'socks5'], monosans: ['http', 'socks5'], sslproxies: ['http'] };
  await cmd('saveSources', { sources: st.sources.map((s) => ({ ...s, enabled: !!pick[s.id], types: pick[s.id] || s.types })) });
  await page.goto(url('manager.html'));
  await sleep(800);
  await cmd('download', {});
  const t0 = Date.now();
  while ((await cmd('state')).job) {
    if (Date.now() - t0 > 25 * 60000) throw new Error('test zaman aşımı'); // site testi dahil
    await sleep(4000);
  }
  const s = await cmd('state');
  const best = s.proxies.filter((p) => p.status === 'alive' && p.anon === 'elite' && p.ssl === true).sort((a, b) => (a.sslMs ?? 9e9) - (b.sslMs ?? 9e9));
  console.log(`test bitti: ${s.proxies.length} proxy, ${best.length} Elit+HTTPS`);
  for (const p of best.slice(0, 6)) if ((await cmd('connect', { id: p.id })).ok) break;
  for (const p of best.slice(1, 3)) await cmd('fav', { ids: [p.id], value: true });

  // Gerçek IP'yi örnek adresle değiştir (ekranda görünmesin).
  const mask = (pg) =>
    pg.evaluate((ip) => {
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3 && /\b\d{1,3}(\.\d{1,3}){3}\b/.test(c.textContent) && c.parentElement?.closest('#sideInfo')) c.textContent = ip;
          else if (c.nodeType === 1) walk(c);
        }
      };
      walk(document.body);
    }, EXAMPLE_IP);

  const raw = {};
  for (const lang of ['tr', 'en']) {
    await cmd('saveSettings', { settings: { lang } });
    await page.goto(url('manager.html'));
    await sleep(1500);
    await page.bringToFront();
    const shot = async (name, prep) => {
      await page.evaluate(prep);
      await sleep(700);
      await mask(page);
      raw[`${lang}-${name}`] = await page.screenshot();
    };
    await shot('list', () => document.querySelector('[data-cat=eliteSsl]').click());
    await shot('sites', () => {
      document.querySelector('[data-cat=alive]').click();
      const sel = document.querySelector('#fSite');
      sel.value = 'https://www.youtube.com/';
      sel.dispatchEvent(new Event('change'));
    });
    await page.evaluate(() => {
      const sel = document.querySelector('#fSite');
      sel.value = '';
      sel.dispatchEvent(new Event('change'));
    });
    await shot('sources', () => document.querySelector('[data-view=sources]').click());
    await shot('sync', () => {
      document.querySelector('[data-view=settings]').click();
      setTimeout(() => document.querySelector('.sync-box').scrollIntoView({ block: 'start' }), 50);
    });
    const pop = await browser.newPage();
    await pop.setViewport({ width: 380, height: 600, deviceScaleFactor: 2 });
    await pop.goto(url('popup.html'));
    await pop.bringToFront();
    await sleep(1500);
    const h = await pop.evaluate(() => Math.ceil(document.querySelector('.foot').getBoundingClientRect().bottom));
    raw[`${lang}-popup`] = await pop.screenshot({ clip: { x: 0, y: 0, width: 380, height: h } });
    await pop.close();
  }
  await cmd('setEnabled', { enabled: false });

  // --- çerçeveleme
  const logo = b64(readFileSync(path.join(OUT, 'logo-300.png')));
  const frame = await browser.newPage();
  const render = async (html, w, h, file) => {
    await frame.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await frame.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0}
      body{width:${w}px;height:${h}px;overflow:hidden;font-family:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;color:#e6edf3;
        background:radial-gradient(1200px 600px at 0% 0%,rgba(16,185,129,.35),transparent 60%),radial-gradient(900px 600px at 100% 100%,rgba(37,99,235,.45),transparent 60%),#0b1220}
      h1{font-weight:700;letter-spacing:-.02em}
      p{color:#a9b6c6}
      .shot{border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08);display:block}
      .brand{display:flex;align-items:center;gap:12px;font-weight:700}
    </style></head><body>${html}</body></html>`);
    await sleep(300);
    mkdirSync(path.dirname(file), { recursive: true });
    const png = await frame.screenshot();
    writeFileSync(file, png);
    console.log(path.relative(ROOT, file));
    return png;
  };
  // Opera add-ons 800×500 ister: aynı görsel küçültülür.
  const opera = (png, lang, name) =>
    render(`<img src="${b64(png)}" style="display:block;width:800px;height:500px">`, 800, 500, path.join(OUT, 'screenshots', 'opera', lang, name));

  for (const lang of ['tr', 'en']) {
    const T = TEXT[lang];
    const dir = path.join(OUT, 'screenshots', lang);
    const wide = async (key, n, title, sub) =>
      opera(await render(
        `<div style="padding:44px 56px 0">
           <div class="brand" style="font-size:18px;color:#9fb0c3;margin-bottom:14px"><img src="${logo}" width="30" height="30">ProxyScout</div>
           <h1 style="font-size:40px;line-height:1.15">${title}</h1>
           <p style="font-size:19px;margin-top:10px;max-width:1080px">${sub}</p>
         </div>
         <img class="shot" src="${b64(raw[`${lang}-${key}`])}" style="position:absolute;left:56px;top:228px;width:1168px">`,
        1280, 800, path.join(dir, `${n}-${key}.png`),
      ), lang, `${n}-${key}.png`);
    await wide('list', '01', ...T.list);
    const popPng = await render(
      `<div style="position:absolute;left:72px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center">
         <div class="brand" style="font-size:20px;color:#9fb0c3;margin-bottom:22px"><img src="${logo}" width="40" height="40">ProxyScout</div>
         <h1 style="font-size:50px;line-height:1.1">${T.popup[0]}</h1>
         <p style="font-size:22px;margin-top:18px;line-height:1.45">${T.popup[1]}</p>
       </div>
       <img class="shot" src="${b64(raw[`${lang}-popup`])}" style="position:absolute;right:110px;top:50%;transform:translateY(-50%);width:418px">`,
      1280, 800, path.join(dir, '02-popup.png'),
    );
    await opera(popPng, lang, '02-popup.png');
    await wide('sites', '03', ...T.sites);
    await wide('sources', '04', ...T.sources);
    await wide('sync', '05', ...T.sync);

    const promo = path.join(OUT, 'promo');
    await render(
      `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px">
         <img src="${logo}" width="96" height="96">
         <h1 style="font-size:40px;margin-top:12px">ProxyScout</h1>
         <p style="font-size:16px;margin-top:6px;color:#c7d2df">${T.tagline}</p>
       </div>`,
      440, 280, path.join(promo, `small-440x280-${lang}.png`),
    );
    await render(
      `<div style="position:absolute;left:80px;top:0;bottom:0;width:600px;display:flex;flex-direction:column;justify-content:center">
         <div class="brand" style="font-size:54px"><img src="${logo}" width="92" height="92">ProxyScout</div>
         <p style="font-size:25px;margin-top:22px;color:#c7d2df;line-height:1.35">${T.tagline}</p>
       </div>
       <img class="shot" src="${b64(raw[`${lang}-list`])}" style="position:absolute;left:720px;top:70px;width:860px">`,
      1400, 560, path.join(promo, `marquee-1400x560-${lang}.png`),
    );
  }
} finally {
  await browser.close();
}
