// Çevrimdışı IPv4 → ülke kodu araması (veri: DB-IP "IP to Country Lite", CC-BY 4.0).
// Dosya biçimi (little-endian), tools/build-geo.mjs üretir:
//   "PSG1" | tarih (8 bayt ASCII, ör. "2026-10") | N (u32) | M (u32) |
//   M × 2 bayt ülke kodu (4'e hizalı) | N × u32 aralık başlangıcı | N × u8 ülke indeksi
// Ardışık aynı ülkeli aralıklar birleştirilmiştir; indeks 255 = bilinmiyor/ayrılmış.

export function parseGeo(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== 'PSG1') throw new Error('geo: bad file');
  const date = String.fromCharCode(...new Uint8Array(buf, 4, 8)).replace(/\0+$/, '');
  const n = dv.getUint32(12, true);
  const m = dv.getUint32(16, true);
  let off = 20;
  const codes = [];
  for (let i = 0; i < m; i++) codes.push(String.fromCharCode(dv.getUint8(off + i * 2), dv.getUint8(off + i * 2 + 1)));
  off += Math.ceil((m * 2) / 4) * 4;
  const starts = new Uint32Array(buf.slice(off, off + n * 4));
  const idx = new Uint8Array(buf, off + n * 4, n);

  function lookup(ip) {
    const p = String(ip).split('.');
    if (p.length !== 4) return null;
    const v = ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + +p[3];
    if (!Number.isFinite(v)) return null;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (starts[mid] <= v) lo = mid;
      else hi = mid - 1;
    }
    const c = idx[lo];
    return c === 255 ? null : codes[c];
  }
  return { lookup, date, size: n };
}

let cached;
export function loadGeo() {
  cached ||= fetch(chrome.runtime.getURL('data/ipv4-country.bin'))
    .then((r) => r.arrayBuffer())
    .then(parseGeo)
    .catch(() => ({ lookup: () => null, date: '', size: 0 }));
  return cached;
}
