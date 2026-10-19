// Uçtan uca test: eklentiyi Chrome for Testing'e yükler, birkaç kaynaktan liste indirir,
// test eder, arayüzden bir proxy'ye bağlanıp ("Bağlanıyor" göstergesiyle) çıkış IP'sinin
// değiştiğini doğrular; Türkçe ve İngilizce ekran görüntüleri alır.
// Kullanım: node tests/e2e.mjs <puppeteer klasörü> [ekran görüntüsü klasörü]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [ptDir, shotDir = '.'] = process.argv.slice(2);
const puppeteer = createRequire(path.join(ptDir, 'package.json'))('puppeteer');
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(shotDir, name) });

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [EXT],
  defaultViewport: { width: 1440, height: 860 },
});

try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'), { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log('eklenti yüklendi:', extId);
  await sleep(1500);
  const page = (await browser.pages()).find((p) => p.url().includes('manager.html')) || (await browser.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Sayfa dil değişince kendini yeniden yükleyebilir; bu durumda komutu tekrar dene.
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
  const openManager = async (hash = '') => {
    await page.goto(`chrome-extension://${extId}/manager.html${hash}`);
    await sleep(1200);
  };
  await openManager();

  const realIp = (await (await fetch('https://api.ipify.org')).text()).trim();
  console.log('gerçek IP:', realIp);

  // Türkçe arayüz; hızlı test için yalnızca birkaç küçük kaynak ve tür.
  await cmd('saveSettings', { settings: { lang: 'tr', concurrency: 150, timeout: 7000 } });
  const st = await cmd('state');
  const pick = { monosans: ['http', 'socks5'], sslproxies: ['http'], proxyscrape: ['http'] };
  await cmd('saveSources', { sources: st.sources.map((s) => ({ ...s, enabled: !!pick[s.id], types: pick[s.id] || s.types })) });
  await openManager();
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
    if (Date.now() - t0 > 8 * 60000) throw new Error('zaman aşımı');
  }

  const s = await cmd('state');
  const alive = s.proxies.filter((p) => p.status === 'alive');
  const by = (f) => alive.filter(f).length;
  console.log(`toplam=${s.proxies.length} çalışan=${alive.length} elit=${by((p) => p.anon === 'elite')} ssl=${by((p) => p.ssl === true)} ülkeli=${by((p) => p.country)} şehirli=${by((p) => p.city)}`);
  console.log('türler:', JSON.stringify(s.proxies.reduce((a, p) => ((a[p.type] = (a[p.type] || 0) + 1), a), {})));
  console.log('kaynak sonuçları:', s.sources.filter((x) => x.enabled).map((x) => `${x.id}=${x.lastCount}/${x.lastNew}${x.error ? ' HATA ' + x.error : ''}`).join(', '));

  // İndirilen her proxy'nin ülkesi test beklenmeden (çevrimdışı veritabanından) belli olmalı.
  const withCountry = s.proxies.filter((p) => p.country).length;
  console.log(`ülkesi bilinen: ${withCountry}/${s.proxies.length} (ölü/yeni dahil)`);

  // Gerçek fare çift tıklaması + bağlanınca sıranın değişmemesi.
  await page.evaluate(() => document.querySelector('[data-cat=alive]').click());
  await sleep(600);
  const order0 = await page.evaluate(() => [...document.querySelectorAll('.row')].map((r) => r.dataset.id));
  const target = await page.$('.row:nth-child(4) .addr');
  await target.click({ count: 2 });
  await sleep(250);
  const busy = await page.evaluate(() => !!document.querySelector('.row.connecting .spin'));
  await page.waitForFunction(() => !document.querySelector('.row.connecting'), { timeout: 30000 });
  await sleep(800);
  const order1 = await page.evaluate(() => [...document.querySelectorAll('.row')].map((r) => r.dataset.id));
  const act = (await cmd('state')).active;
  console.log(`çift tık: bağlanıyor=${busy}, bağlanan=${act.enabled && act.id === order0[3]}, sıra korundu=${JSON.stringify(order0) === JSON.stringify(order1)}`);
  await shot(page, 'tr-dblclick.png');
  await page.click('#toggleWrap .switch');
  await sleep(800);
  console.log('karttaki aç/kapa anahtarı →', (await cmd('state')).active.enabled ? 'HÂLÂ BAĞLI' : 'bağlantı kesildi');

  // En hızlı HTTPS destekli proxy'lere sırayla bağlan; gerçek sayfa trafiğinin proxy'den geçtiğini doğrula.
  const tab = await browser.newPage();
  await page.bringToFront();
  let passed = false;
  const cands = alive.filter((p) => p.ssl === true && p.anon !== 'transparent').sort((a, b) => a.latency - b.latency).slice(0, 6);
  for (const c of cands) {
    const r = await cmd('connect', { id: c.id });
    console.log('connect sonucu:', JSON.stringify(r));
    try {
      await tab.goto('https://api.ipify.org/?format=json', { timeout: 20000 });
      const ip = JSON.parse(await tab.evaluate(() => document.body.innerText)).ip;
      console.log(`bağlı ${c.id} (${c.country}) → sayfanın gördüğü IP: ${ip}`);
      if (ip && ip !== realIp) {
        passed = true;
        break;
      }
    } catch (e) {
      console.log(`bağlı ${c.id} → sayfa açılamadı: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(passed ? 'BAŞARILI: trafik proxy üzerinden geçiyor' : 'UYARI: hiçbir adayla doğrulanamadı');
  await page.bringToFront();
  await sleep(500);
  await shot(page, 'tr-connected.png');

  await page.evaluate(() => document.querySelector('[data-view=sources]').click());
  await sleep(500);
  await shot(page, 'tr-sources.png');

  const popup = await browser.newPage();
  await popup.setViewport({ width: 380, height: 600 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await sleep(1200);
  await popup.bringToFront();
  await sleep(500);
  await shot(popup, 'tr-popup.png');
  console.log('popup anahtar durumu:', await popup.evaluate(() => document.querySelector('#toggleWrap').dataset.state + ' / ' + document.querySelector('#toggle').checked));

  // İngilizceye geç.
  await cmd('saveSettings', { settings: { lang: 'en' } });
  await sleep(1500); // açık sayfalar kendini yeni dille yeniden yükler
  await page.bringToFront();
  await page.evaluate(() => document.querySelector('[data-cat=alive]')?.click());
  await sleep(600);
  await shot(page, 'en-manager.png');
  console.log('EN başlık:', await page.evaluate(() => document.querySelector('[data-cat=alive] span').innerText + ' | ' + document.querySelector('#btnDownload').innerText));
  await popup.reload();
  await sleep(1200);
  await shot(popup, 'en-popup.png');

  await cmd('setEnabled', { enabled: false });
  await sleep(500);
  await tab.goto('https://api.ipify.org/?format=json', { timeout: 20000 });
  const ipOff = JSON.parse(await tab.evaluate(() => document.body.innerText)).ip;
  console.log(`kapatıldı → IP: ${ipOff} ${ipOff === realIp ? '(gerçek IP, doğru)' : '(BEKLENMEYEN)'}`);
  console.log('sayfa hataları:', errors.length ? errors : 'yok');
} finally {
  await browser.close();
}
