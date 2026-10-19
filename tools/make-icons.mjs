// Eklenti ikonlarını (PNG) bağımlılıksız üretir: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../extension/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

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
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Durum renkleri (sol üst → sağ alt degrade). Araç çubuğu ikonu bağlantı durumuna göre değişir:
// on = bağlı (yeşil), bad = bağlı ama proxy yanıt vermiyor / koptu (kırmızı),
// wait = bağlanıyor (turuncu), off = kapalı (gri). brand = mağaza/sayfa ikonu.
const VARIANTS = {
  brand: [[16, 185, 129], [37, 99, 235]],
  on: [[34, 197, 94], [21, 128, 61]],
  bad: [[248, 113, 113], [185, 28, 28]],
  wait: [[251, 191, 36], [217, 119, 6]],
  off: [[148, 156, 168], [75, 85, 99]],
};

// Koordinatlar 0..1 aralığında. Yuvarlatılmış kare zemin + beyaz küre (halka, ekvator, meridyen).
function shade(x, y, [c1, c2]) {
  const r = 0.22;
  const qx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const qy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  if (Math.hypot(qx, qy) > r) return null;
  const bg = mix(c1, c2, (x + y) / 2);
  const dx = x - 0.5, dy = y - 0.5, d = Math.hypot(dx, dy);
  const R = 0.3, w = 0.055;
  const ring = Math.abs(d - R) < w / 2;
  const inside = d < R;
  const equator = inside && Math.abs(dy) < w / 2.4;
  const ex = dx / 0.13, ey = dy / R; // meridyen elipsi
  const merid = inside && Math.abs(Math.hypot(ex, ey) - 1) < (w / 2.4) / 0.13;
  const dot = Math.hypot(x - 0.76, y - 0.76) < 0.1;
  if (dot) return [255, 255, 255];
  if (Math.hypot(x - 0.76, y - 0.76) < 0.14) return bg;
  if (ring || equator || merid) return [255, 255, 255];
  return bg;
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Mağaza logosu (Edge: 300×300) yalnızca marka renginde, store/ klasörüne.
const STORE = new URL('../store/', import.meta.url);
mkdirSync(STORE, { recursive: true });
const jobs = Object.entries(VARIANTS).flatMap(([name, colors]) => [16, 32, 48, 128].map((size) => [name, colors, size, OUT]));
jobs.push(['logo-300', VARIANTS.brand, 300, STORE]);
for (const [name, colors, size, dir] of jobs) {
  {
    const buf = Buffer.alloc(size * size * 4);
    const ss = 4;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const acc = [0, 0, 0, 0];
        for (let sy = 0; sy < ss; sy++)
          for (let sx = 0; sx < ss; sx++) {
            const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, colors);
            if (c) { acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 1; }
          }
        const i = (y * size + x) * 4;
        if (acc[3]) {
          buf[i] = acc[0] / acc[3]; buf[i + 1] = acc[1] / acc[3]; buf[i + 2] = acc[2] / acc[3];
          buf[i + 3] = Math.round((acc[3] / (ss * ss)) * 255);
        }
      }
    writeFileSync(new URL(dir === STORE ? `${name}.png` : `${name}${size}.png`, dir), png(size, buf));
  }
}
console.log('ikonlar üretildi:', Object.keys(VARIANTS).join(', '));
