// Firefox for Android testleri: manifest, platform algılama ve senkron seçenekleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firefoxManifest } from '../tools/build-zip.mjs';

const src = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

test('Firefox manifesti Android sürümünü belirtir (veri toplama izinleri 142+)', () => {
  const m = firefoxManifest(src);
  assert.equal(m.browser_specific_settings.gecko_android.strict_min_version, '142.0');
  assert.ok(m.browser_specific_settings.gecko.data_collection_permissions);
});

// platform.js değerlerini içe aktarıldığı anda okur; her senaryo için tarayıcı ortamı taklit edilip modül
// ayrı bir sorgu dizesiyle yeniden yüklenir.
let n = 0;
async function platformIn({ ua, firefox, identity, sync = true }) {
  const api = {
    runtime: { id: 'x', ...(firefox ? { getBrowserInfo() {} } : {}) },
    storage: sync ? { sync: {}, local: {} } : { local: {} },
    ...(identity ? { identity: { launchWebAuthFlow() {}, getRedirectURL: () => 'https://r/' } } : {}),
  };
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua }, configurable: true });
  globalThis.chrome = api;
  if (firefox) globalThis.browser = api;
  try {
    return await import(`../extension/lib/platform.js?case=${n++}`);
  } finally {
    Object.defineProperty(globalThis, 'navigator', saved);
    delete globalThis.chrome;
    delete globalThis.browser;
  }
}

const FX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0';
const FX_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0';

test('Firefox for Android: tarayıcı senkronu ve Google girişi kapalı, mobil düzen açık', async () => {
  const p = await platformIn({ ua: FX_ANDROID, firefox: true, identity: false });
  assert.equal(p.IS_ANDROID, true);
  assert.equal(p.HAS_BROWSER_SYNC, false);
  assert.equal(p.HAS_WEB_AUTH, false);
});

test('Firefox masaüstü: iki senkron yöntemi de açık', async () => {
  const p = await platformIn({ ua: FX_DESKTOP, firefox: true, identity: true });
  assert.equal(p.IS_ANDROID, false);
  assert.equal(p.HAS_BROWSER_SYNC, true);
  assert.equal(p.HAS_WEB_AUTH, true);
});

test('Opera: tarayıcı senkronu yok, Google girişi var', async () => {
  const p = await platformIn({ ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140 OPR/125', firefox: false, identity: true, sync: false });
  assert.equal(p.HAS_BROWSER_SYNC, false);
  assert.equal(p.HAS_WEB_AUTH, true);
});
