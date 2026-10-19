// DB-IP "IP to Country Lite" CSV'sinden eklentinin çevrimdışı ülke veritabanını üretir.
// Kullanım: node tools/build-geo.mjs [dbip-country-lite-YYYY-MM.csv.gz]
// Dosya verilmezse bu ayın (yoksa geçen ayın) dosyası indirilir.
// Lisans: DB-IP Lite, CC-BY 4.0 — https://db-ip.com (atıf README'de).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

async function download() {
  const now = new Date();
  for (let back = 0; back < 3; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const res = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${ym}.csv.gz`);
    if (res.ok) return { gz: Buffer.from(await res.arrayBuffer()), ym };
  }
  throw new Error('DB-IP dosyası indirilemedi');
}

const arg = process.argv[2];
const { gz, ym } = arg ? { gz: readFileSync(arg), ym: (/(\d{4}-\d{2})/.exec(arg) || [, 'unknown'])[1] } : await download();
const csv = gunzipSync(gz).toString('utf8');

const ipNum = (s) => s.split('.').reduce((a, x) => a * 256 + +x, 0);
const codes = [];
const codeIdx = new Map();
const starts = [];
const idx = [];
let prevEnd = -1;
for (const line of csv.split('\n')) {
  const [a, b, cc] = line.trim().split(',');
  if (!cc || a.includes(':')) continue; // yalnızca IPv4
  const s = ipNum(a);
  const e = ipNum(b);
  const known = /^[A-Z]{2}$/.test(cc) && cc !== 'ZZ';
  let ci = 255;
  if (known) {
    if (!codeIdx.has(cc)) codeIdx.set(cc, codes.push(cc) - 1);
    ci = codeIdx.get(cc);
  }
  if (s > prevEnd + 1) starts.push(prevEnd + 1), idx.push(255); // boşluk
  if (idx.length && idx[idx.length - 1] === ci) {
    prevEnd = e; // önceki aralıkla birleştir
    continue;
  }
  starts.push(s);
  idx.push(ci);
  prevEnd = e;
}
if (codes.length > 254) throw new Error('ülke sayısı fazla');

const m = codes.length;
const ccBytes = Math.ceil((m * 2) / 4) * 4;
const n = starts.length;
const buf = Buffer.alloc(20 + ccBytes + n * 4 + n);
buf.write('PSG1', 0, 'ascii');
buf.write(ym.padEnd(8, '\0'), 4, 'ascii');
buf.writeUInt32LE(n, 12);
buf.writeUInt32LE(m, 16);
codes.forEach((c, i) => buf.write(c, 20 + i * 2, 'ascii'));
let off = 20 + ccBytes;
for (const s of starts) (buf.writeUInt32LE(s >>> 0, off), (off += 4));
for (const c of idx) buf[off++] = c;

const out = new URL('../extension/data/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('ipv4-country.bin', out), buf);
console.log(`ipv4-country.bin: ${ym}, ${n} aralık, ${m} ülke, ${(buf.length / 1024).toFixed(0)} KB`);
