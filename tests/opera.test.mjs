// Opera paketi testleri: düz metin short_name ve base64 JSON ülke veritabanı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { operaManifest, OPERA_SHORT_NAME } from '../tools/build-zip.mjs';
import { parseGeo, geoFromJson } from '../extension/lib/geoip.js';

test('Opera manifesti: short_name düz metin, geri kalan Chrome manifestiyle aynı', () => {
  const src = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const m = operaManifest(src);
  assert.equal(m.short_name, OPERA_SHORT_NAME);
  assert.ok(!/__MSG_/.test(m.short_name));
  assert.ok(m.short_name.length <= 12);
  assert.deepEqual({ ...m, short_name: src.short_name }, src);
});

test('Ülke veritabanı base64 JSON olarak da aynı sonucu verir (Opera paketi)', () => {
  const bin = readFileSync(new URL('../extension/data/ipv4-country.bin', import.meta.url));
  const fromBin = parseGeo(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));
  const fromJson = parseGeo(geoFromJson(JSON.parse(JSON.stringify({ base64: bin.toString('base64') }))));
  for (const ip of ['8.8.8.8', '1.1.1.1', '1.0.1.5', '10.0.0.1', '193.35.200.234']) assert.equal(fromJson.lookup(ip), fromBin.lookup(ip), ip);
  assert.equal(fromJson.size, fromBin.size);
  assert.equal(fromJson.date, fromBin.date);
});
