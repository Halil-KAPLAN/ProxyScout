// Çeviri ve kaynak yapısı testleri: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MESSAGES } from '../extension/lib/messages.js';
import { t, setLang, errorText } from '../extension/lib/i18n.js';
import { DEFAULT_SOURCES, sourceTypes, enabledTypes, sourceHome } from '../extension/lib/sources.js';

const EXT = new URL('../extension/', import.meta.url);
const read = (f) => readFileSync(new URL(f, EXT), 'utf8');

test('TR ve EN aynı anahtarlara sahip', () => {
  const tr = Object.keys(MESSAGES.tr).sort();
  const en = Object.keys(MESSAGES.en).sort();
  assert.deepEqual(tr.filter((k) => !en.includes(k)), [], 'EN\'de eksik');
  assert.deepEqual(en.filter((k) => !tr.includes(k)), [], 'TR\'de eksik');
});

test('koddaki tüm anahtarlar sözlükte var', () => {
  const keys = new Set();
  const files = ['background.js', 'manager.js', 'popup.js', 'manager.html', 'popup.html', ...readdirSync(new URL('lib/', EXT)).map((f) => 'lib/' + f)];
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/\bt\('([a-zA-Z.]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/data-i18n(?:-html|-ph|-title)?="([a-zA-Z.]+)"/g)) keys.add(m[1]);
    for (const m of src.matchAll(/\blog\('\w+', '([a-zA-Z.]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/new Error\('([a-z]\.[a-zA-Z]+)'\)/g)) keys.add(m[1]);
    for (const m of src.matchAll(/'(job\.[a-zA-Z]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/label: '((?:col|src)\.[a-zA-Z.]+)'/g)) keys.add(m[1]);
  }
  // Dinamik olarak birleştirilen anahtarlar ('cat.' + id gibi).
  for (const k of [...keys]) if (k.endsWith('.')) keys.delete(k);
  for (const id of ['all', 'new', 'alive', 'eliteSsl', 'ssl', 'sslUnknown', 'httpOnly', 'dead', 'fav', 'mine']) keys.add('cat.' + id);
  for (const id of ['new', 'eliteSsl', 'ssl', 'sslUnknown', 'httpOnly']) keys.add(`cat.${id}.hint`);
  keys.add('status.httpOnly');
  for (const a of ['elite', 'anonymous', 'transparent']) keys.add('anon.' + a);
  for (const s of ['new', 'alive', 'dead']) keys.add('status.' + s);
  for (const p of ['start', 'download', 'prepare', 'http', 'ssl', 'sites', 'geo']) keys.add('phase.' + p);
  for (const e of ['timeout', 'connect', 'cancelled', 'redirect', 'auth', 'invalid', 'modified', 'direct', 'slow']) keys.add('err.' + e);
  const missing = [...keys].filter((k) => !(k in MESSAGES.en));
  assert.deepEqual(missing, []);
  assert.ok(keys.size > 100, `beklenenden az anahtar bulundu: ${keys.size}`);
});

test('t(): parametreler, iç içe çeviri ve hata kodları', () => {
  setLang('tr');
  assert.equal(t('log.alive', { addr: '1.2.3.4:80', type: 'HTTP', anon: '@anon.elite', ms: 120 }), '1.2.3.4:80 [HTTP] çalışıyor — Elit, 120 ms');
  assert.equal(t('log.dlFail', { name: 'X', err: '@err.http:404' }), 'X: indirilemedi (HTTP 404).');
  assert.equal(errorText('timeout'), 'Zaman aşımı');
  assert.equal(errorText('Eski düz metin'), 'Eski düz metin');
  setLang('en');
  assert.equal(t('log.jobDone', { label: '@job.download', s: 5 }), 'List download finished (5s).');
  assert.equal(t('olmayan.anahtar'), 'olmayan.anahtar');
});

test('kaynaklar: site başına tek kaynak, türler seçilebilir', () => {
  const ids = DEFAULT_SOURCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'kaynak id\'leri benzersiz olmalı');
  const ps = DEFAULT_SOURCES.find((s) => s.id === 'proxyscrape');
  assert.deepEqual(sourceTypes(ps), ['http', 'socks4', 'socks5']);
  assert.deepEqual(enabledTypes({ ...ps, types: ['socks5'] }), ['socks5']);
  assert.deepEqual(sourceTypes(DEFAULT_SOURCES.find((s) => s.id === 'socksproxynet')), ['socks4', 'socks5']);
  assert.equal(sourceHome(DEFAULT_SOURCES.find((s) => s.id === 'monosans')), 'https://github.com/monosans/proxy-list');
  for (const s of DEFAULT_SOURCES) assert.ok(sourceTypes(s).length, s.id);
});

test('ilk kurulumda yalnızca en iyi üç kaynak açık (~500 proxy)', () => {
  assert.deepEqual(DEFAULT_SOURCES.filter((s) => s.enabled).map((s) => s.id), ['fpl', 'sslproxies', 'roosterkid']);
  assert.ok(DEFAULT_SOURCES.length >= 20, 'diğer kaynaklar listede kalır, kullanıcı açabilir');
});

test('dar ekran: Ayarlar ve Kaynaklar çark düğmesinden açılır, sürüm Ayarlar\'da görünür', () => {
  const html = read('manager.html');
  for (const id of ['btnMobileSettings', 'mTabs', 'appVersion']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /data-mview="settings"/);
  assert.match(html, /data-mview="sources"/);
  const css = read('manager.css');
  assert.match(css, /\.side-settings \{ display: none; \}/);
});

test('Kaynaklar sayfası: indirme sürerken Durdur düğmesi ve HTTPS açıklaması', () => {
  const html = read('manager.html');
  assert.ok(html.includes('id="srcStop"'));
  assert.ok(html.includes('data-i18n="src.httpsNote"'));
  const js = read('manager.js');
  assert.match(js, /\$\('#srcStop'\)\.addEventListener\('click', \(\) => run\('stop'\)\)/);
  assert.match(js, /\$\('#srcStop'\)\.hidden = !j;/);
});

test('manifest yerelleştirmesi', () => {
  const m = JSON.parse(read('manifest.json'));
  for (const l of ['en', 'tr']) {
    const msgs = JSON.parse(read(`_locales/${l}/messages.json`));
    for (const k of ['extName', 'extShort', 'extDesc']) assert.ok(msgs[k]?.message, `${l}.${k}`);
  }
  assert.equal(m.default_locale, 'en');
});

test('çalışanların alt kategorileri çakışmaz, toplamı çalışanlara eşittir; yalnız HTTP olanlar çalışan sayılmaz', async () => {
  const { CATEGORIES } = await import('../extension/lib/ui.js');
  const cat = (id) => CATEGORIES.find((c) => c.id === id);
  const subs = CATEGORIES.filter((c) => c.parent === 'alive');
  for (const anon of ['elite', 'anonymous', 'transparent'])
    for (const ssl of [true, false, null, undefined]) {
      const p = { status: 'alive', anon, ssl };
      const hits = subs.filter((c) => c.test(p, {})).map((c) => c.id);
      // HTTPS testini geçemeyen (ssl === false) hiçbir çalışan grubunda değildir, yalnızca "Yalnız HTTP"dadır.
      assert.equal(hits.length, ssl === false ? 0 : 1, `${anon}/${ssl} → ${hits}`);
      assert.equal(cat('alive').test(p, {}), ssl !== false);
      assert.equal(cat('httpOnly').test(p, {}), ssl === false);
    }
  const best = { status: 'alive', anon: 'elite', ssl: true };
  assert.deepEqual(subs.filter((c) => c.test(best, {})).map((c) => c.id), ['eliteSsl']);
  assert.equal(cat('httpOnly').parent, undefined, 'Yalnız HTTP, Çalışanlar grubunun altında değil');
});
