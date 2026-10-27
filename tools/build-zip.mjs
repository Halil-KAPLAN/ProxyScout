// Mağazalara yüklenecek paketleri üretir:
//   dist/proxyscout-<sürüm>.zip          — Chrome Web Store ve Edge Add-ons (Manifest V3)
//   dist/proxyscout-firefox-<sürüm>.zip  — Firefox Add-ons (Manifest V2, aynı kaynak dosyalar)
//   dist/proxyscout-opera-<sürüm>.zip    — Opera add-ons (Chrome paketi; yalnızca short_name düz metin)
//   dist/firefox/                        — Firefox paketinin açılmış hâli (about:debugging ve testler için)
// Kullanım: node tools/build-zip.mjs
// - manifest.json'daki "key" alanı çıkarılır (Chrome Web Store ve Edge bu alanı kabul etmez;
//   mağaza kendi eklenti kimliğini verir).
// - Firefox paketi MV2'dir: kalıcı arka plan sayfası sayesinde proxy.onRequest dinleyicisi hiç uyumaz,
//   bağlıyken trafik doğrudan çıkıp gerçek IP'yi sızdırmaz (MV3'ün askıya alınan arka planında bu garanti yok).
// - Bağımlılıksızdır (ZIP biçimi elle yazılır); dosya tarihleri sabit olduğu için aynı kaynaktan
//   her zaman aynı paket çıkar.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXT = join(ROOT, 'extension');
const DIST = join(ROOT, 'dist');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function zip(files) {
  const DOS_TIME = 0; // 00:00:00
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 dosya adları
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// Firefox eklenti kimliği. Mağazadaki eklentiyi bu kimlik belirler; değiştirilirse güncellemeler yeni bir eklenti sayılır.
export const GECKO_ID = 'proxyscout@halil-kaplan.github.io';

export const OPERA_SHORT_NAME = 'ProxyScout';
const GEO_BIN = 'data/ipv4-country.bin';
const GEO_JSON = 'data/ipv4-country.json';
export const operaManifest = (m) => ({ ...m, short_name: OPERA_SHORT_NAME });

// MV3 manifestinden Firefox (MV2) manifesti üretir.
export function firefoxManifest(m) {
  const permissions = m.permissions.filter((p) => p !== 'webRequestAuthProvider');
  permissions.splice(permissions.indexOf('webRequest') + 1, 0, 'webRequestBlocking');
  const out = {
    manifest_version: 2,
    name: m.name,
    short_name: m.short_name,
    version: m.version,
    description: m.description,
    default_locale: m.default_locale,
    homepage_url: m.homepage_url,
    permissions: [...permissions, ...(m.host_permissions || [])],
    background: { page: 'background.html', persistent: true },
    browser_action: m.action,
    options_ui: m.options_ui,
    icons: m.icons,
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        // 140: Firefox'un yerleşik veri toplama izni penceresi (data_collection_permissions) bu sürümde geldi.
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
          // Yalnızca senkron açıkken, kullanıcının eklediği özel proxy'lerin kullanıcı adı/şifresi (lib/platform.js).
          optional: ['authenticationInfo'],
        },
      },
      // Firefox for Android: data_collection_permissions 142'de geldi. Senkron Android'de yoktur (lib/platform.js).
      gecko_android: { strict_min_version: '142.0' },
    },
  };
  return out;
}

// Firefox'un MV2'sinde chrome.* Promise döndürmez; sayfalar modüllerden önce chrome → browser eşlemesini yükler
// (lib/firefox-shim.js). Bu dosya Chrome/Edge paketine konmaz.
const SHIM_TAG = '<script src="lib/firefox-shim.js"></script>';
const FIREFOX_BG_PAGE = `<!doctype html>\n<meta charset="utf-8">\n${SHIM_TAG}\n<script type="module" src="background.js"></script>\n`;

function withShim(name, data) {
  if (!/^(manager|popup)\.html$/.test(name)) return data;
  const html = data.toString('utf8');
  const out = html.replace(/(<script type="module")/, `${SHIM_TAG}\n  $1`);
  if (out === html) throw new Error(`${name}: modül betiği bulunamadı, Firefox eşlemesi eklenemedi`);
  return Buffer.from(out);
}

const json = (o) => Buffer.from(JSON.stringify(o, null, 2) + '\n');

function sourceFiles() {
  return walk(EXT)
    .map((p) => relative(EXT, p).split(sep).join('/'))
    .filter((name) => !/(^|\/)\.|\.DS_Store$|Thumbs\.db$/.test(name))
    .sort()
    .map((name) => ({ name, data: readFileSync(join(EXT, name)) }));
}

function writeZip(file, files, label) {
  const out = join(DIST, file);
  const buf = zip(files);
  writeFileSync(out, buf);
  console.log(`${relative(ROOT, out)} · ${label} · ${files.length} dosya · ${(buf.length / 1024).toFixed(0)} KB`);
  return relative(ROOT, out).split(sep).join('/');
}

export function build() {
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  delete manifest.key;
  const src = sourceFiles();
  mkdirSync(DIST, { recursive: true });

  const chromeFiles = src.filter((f) => f.name !== 'lib/firefox-shim.js').map((f) => (f.name === 'manifest.json' ? { name: f.name, data: json(manifest) } : f));
  const chromeZip = writeZip(`proxyscout-${manifest.version}.zip`, chromeFiles, 'Chrome/Edge');

  // Opera'nın yükleme doğrulayıcısı (1) short_name'deki __MSG_…__ yer tutucusunu çözmeden uzunluğunu ölçüp reddeder,
  // (2) izin listesinde olmayan .bin uzantısını kabul etmez. Opera paketinde kısa ad düz metindir ve ülke veritabanı
  // base64 olarak data/ipv4-country.json'dadır (lib/geoip.js ikisini de okur). Geri kalan her şey Chrome paketiyle aynıdır.
  const operaFiles = chromeFiles
    .map((f) => {
      if (f.name === 'manifest.json') return { name: f.name, data: json(operaManifest(manifest)) };
      if (f.name === GEO_BIN) return { name: GEO_JSON, data: Buffer.from(JSON.stringify({ base64: f.data.toString('base64') })) };
      return f;
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const operaZip = writeZip(`proxyscout-opera-${manifest.version}.zip`, operaFiles, 'Opera');

  const ffFiles = [
    ...src.map((f) => (f.name === 'manifest.json' ? { name: f.name, data: json(firefoxManifest(manifest)) } : { name: f.name, data: withShim(f.name, f.data) })),
    { name: 'background.html', data: Buffer.from(FIREFOX_BG_PAGE) },
  ].sort((a, b) => (a.name < b.name ? -1 : 1));
  const firefoxZip = writeZip(`proxyscout-firefox-${manifest.version}.zip`, ffFiles, 'Firefox');
  const ffDir = join(DIST, 'firefox');
  rmSync(ffDir, { recursive: true, force: true });
  for (const f of ffFiles) {
    mkdirSync(dirname(join(ffDir, f.name)), { recursive: true });
    writeFileSync(join(ffDir, f.name), f.data);
  }

  console.log(`sürüm ${manifest.version}`);
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `zip=${chromeZip}\nfirefox_zip=${firefoxZip}\nopera_zip=${operaZip}\nversion=${manifest.version}\n`, { flag: 'a' });
  }
  return { chromeZip, firefoxZip, operaZip, version: manifest.version };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) build();
