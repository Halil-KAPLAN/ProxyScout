// Site testi: adres normalleştirme, liste ve yönlendirme (hostMap) testleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSiteUrl, siteList, siteInfo, DEFAULT_SITES, BUILTIN_SITES, shortMs, siteHost } from '../extension/lib/sites.js';
import { findProxy, buildPac } from '../extension/lib/pac.js';
import vm from 'node:vm';

test('site adresi normalleştirilir; geçersiz ve yerel adresler reddedilir', () => {
  assert.equal(normalizeSiteUrl('discord.com'), 'https://discord.com/');
  assert.equal(normalizeSiteUrl('  HTTPS://X.com/home '), 'https://x.com/home');
  assert.equal(normalizeSiteUrl('http://example.org'), 'http://example.org/');
  for (const bad of ['', 'localhost', 'http://192.168.1.1/', 'printer.local', 'not a url', 'https://']) assert.equal(normalizeSiteUrl(bad), null, bad);
});

test('varsayılan siteler ve kullanıcı siteleri listede doğru görünür', () => {
  assert.deepEqual(DEFAULT_SITES, ['https://www.youtube.com/', 'https://discord.com/', 'https://www.google.com/', 'https://www.instagram.com/', 'https://x.com/']);
  const list = siteList(['https://discord.com/', 'https://example.org/']);
  assert.equal(list.length, BUILTIN_SITES.length + 1);
  assert.equal(list.find((s) => s.url === 'https://discord.com/').enabled, true);
  assert.equal(list.find((s) => s.url === 'https://www.youtube.com/').enabled, false);
  const custom = list.find((s) => s.url === 'https://example.org/');
  assert.ok(custom.custom && custom.enabled);
  assert.equal(siteInfo('https://www.example.org/').short, 'EXA');
  assert.equal(shortMs(320), '320');
  assert.equal(shortMs(1450), '1.4s');
  assert.equal(shortMs(2000), '2s');
});

test('site testi yönlendirmesi: yalnızca listedeki alan adları seçilen proxy\'ye gider (PAC ve Firefox aynı karar)', () => {
  const urls = ['https://www.youtube.com/', 'https://discord.com/'];
  const cfg = { token: 'abcdef0123456789', active: 'PROXY 9.9.9.9:8080', bypass: ['<local>'], hostMap: Object.fromEntries(urls.map((u) => [siteHost(u), 'SOCKS5 1.2.3.4:1080'])) };
  const sandbox = { shExpMatch: (s, e) => new RegExp('^' + e.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(s) };
  vm.runInNewContext(buildPac(cfg), sandbox);
  const cases = [
    ['https://www.youtube.com/', 'www.youtube.com', 'SOCKS5 1.2.3.4:1080'],
    ['https://discord.com/', 'discord.com', 'SOCKS5 1.2.3.4:1080'],
    ['https://m.youtube.com/', 'm.youtube.com', 'PROXY 9.9.9.9:8080'], // listede olmayan alt alan adı etkilenmez
    ['https://example.org/', 'example.org', 'PROXY 9.9.9.9:8080'],
  ];
  for (const [url, host, want] of cases) {
    assert.equal(findProxy(cfg, url, host), want, url);
    assert.equal(sandbox.FindProxyForURL(url, host), want, 'PAC ' + url);
  }
});
