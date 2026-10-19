// İki tarayıcılı senkron testi: A'da liste kurulup senkronize edilir; chrome.storage.sync içeriği
// (Google hesabının taşıyacağı veri) boş bir B tarayıcısına verilir ve B'de aynı liste görünmelidir.
// Kullanım: node tests/sync-e2e.mjs <puppeteer klasörü> [ekran görüntüsü klasörü]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [ptDir, shotDir = '.'] = process.argv.slice(2);
const puppeteer = createRequire(path.join(ptDir, 'package.json'))('puppeteer');
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => (console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`), ok || failed++);

async function open() {
  const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], defaultViewport: { width: 1440, height: 860 } });
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'), { timeout: 15000 });
  const id = new URL(sw.url()).host;
  await sleep(1500);
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${id}/manager.html`);
  await sleep(800);
  // Dil değişince sayfa kendini yeniden yükler; bu durumda komutu tekrar dene.
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
  return { browser, page, id, cmd };
}

// --- A tarayıcısı
const A = await open();
await A.cmd('saveSettings', { settings: { lang: 'tr' } });
await A.cmd('import', { text: '103.237.102.191:11111\nsocks5://31.77.19.92:443\nuser:pw@8.8.4.4:3128\n9.9.9.9:80', type: 'http', test: false });
await A.cmd('fav', { ids: ['socks5://31.77.19.92:443'], value: true });
await A.cmd('saveSettings', { settings: { concurrency: 77 } });
const stA = await A.cmd('state');
await A.cmd('saveSources', { sources: stA.sources.map((s) => (s.id === 'spys' ? { ...s, enabled: false } : s.id === 'monosans' ? { ...s, types: ['socks5'] } : s)) });
const syncA = await A.cmd('syncNow');
const items = await A.page.evaluate(() => chrome.storage.sync.get(null));
const meta = items.pxs_meta;
check('A: Chrome senkronuna yazıldı', meta?.count === 4 && meta.parts >= 1, `meta=${JSON.stringify(meta)} hata=${syncA.chrome.error || 'yok'}`);
const bytes = Object.entries(items).reduce((n, [k, v]) => n + k.length + JSON.stringify(v).length, 0);
check('A: kota içinde', bytes < 100 * 1024, `${bytes} bayt`);
await A.browser.close();

// --- B tarayıcısı (boş profil)
const B = await open();
check('Eklenti kimliği her iki tarayıcıda aynı', A.id === B.id, B.id);
const before = await B.cmd('state');
check('B: başlangıçta liste boş', before.proxies.length === 0);
// Google hesabının senkron verisini teslim etmesini taklit et.
await B.page.evaluate((items) => chrome.storage.sync.set(items), items);
await sleep(2500);
const after = await B.cmd('state');
const ids = after.proxies.map((p) => p.id).sort();
check('B: dört proxy geldi', ids.length === 4, ids.join(', '));
check('B: favori geldi', after.proxies.find((p) => p.id === 'socks5://31.77.19.92:443')?.fav === true);
check('B: kendi proxy işareti ve kimlik bilgisi geldi', after.proxies.every((p) => p.mine) && after.proxies.find((p) => p.host === '8.8.4.4')?.user === 'user');
check('B: ülke bilgisi var', after.proxies.every((p) => p.country), after.proxies.map((p) => p.country).join(','));
check('B: ayar geldi (eşzamanlı test = 77, dil = tr)', after.settings.concurrency === 77 && after.settings.lang === 'tr');
check('B: kaynak seçimleri geldi', after.sources.find((s) => s.id === 'spys')?.enabled === false && JSON.stringify(after.sources.find((s) => s.id === 'monosans')?.types) === '["socks5"]');
check('B: alım kaydı', !!after.sync.chrome.lastPull, `lastPull=${after.sync.chrome.lastPull}`);
await B.page.reload();
await sleep(1500);
const rows = await B.page.evaluate(() => document.querySelectorAll('.row').length);
check('B: yönetici sayfasında listede görünüyor', rows === 4, `${rows} satır`);
await B.page.evaluate(() => document.querySelector('[data-view=settings]').click());
await sleep(500);
await B.page.evaluate(() => document.querySelector('.sync-box').scrollIntoView());
await sleep(300);
await B.page.screenshot({ path: path.join(shotDir, 'sync-settings.png') });

// B'de değişiklik → kendi cihaz kimliğiyle yazar; A'nın yazdığını ezmeden birleştirir.
await B.cmd('fav', { ids: ['http://9.9.9.9:80'], value: true });
await B.cmd('syncNow');
const itemsB = await B.page.evaluate(() => chrome.storage.sync.get(null));
check('B: kendi değişikliğini senkrona yazdı', itemsB.pxs_meta.device !== meta.device && itemsB.pxs_meta.count === 4);
await B.browser.close();
console.log(failed ? `\n${failed} kontrol BAŞARISIZ` : '\nTüm kontroller geçti');
process.exit(failed ? 1 : 0);
