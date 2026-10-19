// Mağazalara yüklenecek paketi üretir: dist/proxyscout-<sürüm>.zip
// Kullanım: node tools/build-zip.mjs
// - manifest.json'daki "key" alanı çıkarılır (Chrome Web Store ve Edge bu alanı kabul etmez;
//   mağaza kendi eklenti kimliğini verir).
// - Bağımlılıksızdır (ZIP biçimi elle yazılır); dosya tarihleri sabit olduğu için aynı kaynaktan
//   her zaman aynı paket çıkar.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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

const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
delete manifest.key;
const files = walk(EXT)
  .map((p) => relative(EXT, p).split(sep).join('/'))
  .filter((name) => !/(^|\/)\.|\.DS_Store$|Thumbs\.db$/.test(name))
  .sort()
  .map((name) => ({ name, data: name === 'manifest.json' ? Buffer.from(JSON.stringify(manifest, null, 2) + '\n') : readFileSync(join(EXT, name)) }));

mkdirSync(DIST, { recursive: true });
const out = join(DIST, `proxyscout-${manifest.version}.zip`);
const buf = zip(files);
writeFileSync(out, buf);
console.log(`${relative(ROOT, out)} · ${files.length} dosya · ${(buf.length / 1024).toFixed(0)} KB · sürüm ${manifest.version}`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `zip=${relative(ROOT, out).split(sep).join('/')}\nversion=${manifest.version}\n`, { flag: 'a' });
