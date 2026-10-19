// Ayrıştırıcı ve PAC betiği testleri: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseProxyList, parseManualList } from '../extension/lib/parse.js';
import { buildPac, checkMarker, directMarker, directiveFor } from '../extension/lib/pac.js';

test('düz liste, önekler ve hatalı satırlar', () => {
  const txt = '1.2.3.4:8080\n5.6.7.8:3128:Indonesia\nsocks5://9.9.9.9:1080\n999.1.1.1:80\n0.0.0.0:80\n1.2.3.4:8080\n10.0.0.1 8000\n';
  const r = parseProxyList(txt, 'http');
  assert.deepEqual(r.map((p) => `${p.type}://${p.host}:${p.port}`), ['http://1.2.3.4:8080', 'http://5.6.7.8:3128', 'http://9.9.9.9:1080', 'http://10.0.0.1:8000']);
  const auto = parseProxyList('http://1.1.1.1:80\nsocks5://2.2.2.2:1080\nsocks4://3.3.3.3:4145', 'auto');
  assert.deepEqual(auto.map((p) => p.type), ['http', 'socks5', 'socks4']);
});

test('HTML tablo (free-proxy-list / socks-proxy.net)', () => {
  const html = `<table><tr><td>1.2.3.4</td><td>8080</td><td>US</td></tr>
    <tr><td>5.6.7.8</td><td>1080</td><td>DE</td><td>Socks5</td></tr>
    <tr><td>9.8.7.6</td><td>4145</td><td>FR</td><td>Socks4</td></tr></table>`;
  assert.deepEqual(parseProxyList(html, 'http').map((p) => p.host + ':' + p.port), ['1.2.3.4:8080', '5.6.7.8:1080', '9.8.7.6:4145']);
  assert.deepEqual(parseProxyList(html, 'auto').map((p) => p.type + ' ' + p.host), ['http 1.2.3.4', 'socks5 5.6.7.8', 'socks4 9.8.7.6']);
});

test('spys.me biçimi', () => {
  const t = 'Proxy list | ...\n\n1.2.3.4:8080 US-H-S + \n5.6.7.8:80 DE-N! -\n';
  assert.equal(parseProxyList(t, 'http').length, 2);
});

test('elle içe aktarma biçimleri', () => {
  const r = parseManualList('user:pa@ss@1.2.3.4:8080\n5.6.7.8:3128:bob:secret\nsocks5://proxy.example.com:1080\n# yorum\nbozuk', 'http');
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { type: 'http', host: '1.2.3.4', port: 8080, user: 'user', pass: 'pa@ss' });
  assert.deepEqual(r[1], { type: 'http', host: '5.6.7.8', port: 3128, user: 'bob', pass: 'secret' });
  assert.equal(r[2].type, 'socks5');
});

function pacFn(opts) {
  const ctx = {
    shExpMatch: (s, p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(s),
  };
  vm.createContext(ctx);
  vm.runInContext(buildPac(opts), ctx);
  return (url) => ctx.FindProxyForURL(url, new URL(url).hostname);
}

test('PAC: test işaretçisi, doğrudan işaretçi, aktif proxy, bypass, hostMap', () => {
  const T = 'abc123';
  const p5 = { type: 'socks5', host: '5.6.7.8', port: 1080 };
  const p4 = { type: 'socks4', host: '9.9.9.9', port: 4145 };
  const ph = { type: 'http', host: '1.2.3.4', port: 8080 };
  const F = pacFn({ token: T, active: directiveFor(ph), bypass: ['<local>', '192.168.0.0/16', '*.corp.lan'], hostMap: { 'api.ipify.org': 'PROXY 7.7.7.7:80' } });
  assert.equal(F(`http://httpbin.org/get?${checkMarker(T, p5)}&_=x`), 'SOCKS5 5.6.7.8:1080');
  assert.equal(F(`http://httpbin.org/get?${checkMarker(T, p4)}`), 'SOCKS 9.9.9.9:4145');
  assert.equal(F(`http://httpbin.org/get?${checkMarker(T, ph)}`), 'PROXY 1.2.3.4:8080');
  assert.equal(F(`http://httpbin.org/ip?${directMarker(T)}`), 'DIRECT');
  assert.equal(F('https://api.ipify.org/'), 'PROXY 7.7.7.7:80');
  assert.equal(F('https://example.com/'), 'PROXY 1.2.3.4:8080');
  assert.equal(F('http://router/'), 'DIRECT');
  assert.equal(F('http://192.168.1.10/'), 'DIRECT');
  assert.equal(F('http://192.169.1.10/'), 'PROXY 1.2.3.4:8080');
  assert.equal(F('https://git.corp.lan/'), 'DIRECT');
  // Yanlış token'lı işaretçi bir web sayfası tarafından kötüye kullanılamaz.
  assert.equal(F('http://evil.com/?__pxcWRONG=PROXY~6.6.6.6~80'), 'PROXY 1.2.3.4:8080');
  // Aktif proxy yoksa her şey doğrudan.
  const D = pacFn({ token: T });
  assert.equal(D('https://example.com/'), 'DIRECT');
  assert.equal(D(`http://httpbin.org/get?${checkMarker(T, ph)}`), 'PROXY 1.2.3.4:8080');
});

test('çevrimdışı IP → ülke veritabanı', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseGeo } = await import('../extension/lib/geoip.js');
  const b = readFileSync(new URL('../extension/data/ipv4-country.bin', import.meta.url));
  const g = parseGeo(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  assert.equal(g.lookup('8.8.8.8'), 'US');
  assert.equal(g.lookup('1.1.1.1'), 'AU');
  assert.equal(g.lookup('1.0.1.5'), 'CN');
  assert.equal(g.lookup('10.0.0.1'), null); // özel ağ
  assert.equal(g.lookup('255.255.255.255'), null);
  assert.equal(g.lookup('proxy.example.com'), null);
  assert.ok(g.size > 100000);
});

test('PAC: HTTPS test alan adı proxy bilgisini taşır', async () => {
  const { httpsCheckHost } = await import('../extension/lib/pac.js');
  const T = 'abcdef0123456789';
  const F = pacFn({ token: T, active: 'PROXY 9.9.9.9:1' });
  const hostOf = (p) => httpsCheckHost(T, p, 'x1y2');
  const run = (p) => F(`https://${hostOf(p)}/cdn-cgi/trace`);
  assert.equal(run({ type: 'http', host: '157.230.11.83', port: 3128 }), 'PROXY 157.230.11.83:3128');
  assert.equal(run({ type: 'socks5', host: '31.77.19.92', port: 443 }), 'SOCKS5 31.77.19.92:443');
  assert.equal(run({ type: 'socks4', host: '1.2.3.4', port: 4145 }), 'SOCKS 1.2.3.4:4145');
  assert.ok(hostOf({ type: 'http', host: '255.255.255.255', port: 65535 }).split('.')[0].length <= 63);
  // Başka bir token ile üretilen ad bu kurulumda yönlendirilmez (aktif proxy'ye gider).
  assert.equal(F(`https://${httpsCheckHost('ffffffffffffffff', { type: 'http', host: '6.6.6.6', port: 80 }, 'a')}/`), 'PROXY 9.9.9.9:1');
});
