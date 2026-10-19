// Firefox uyarlaması testleri: PAC kararının JS sürümü, ProxyInfo çevirisi ve Firefox manifesti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildPac, findProxy, toProxyInfo, shExpMatch, checkMarker, directMarker, directiveFor, httpsCheckHost } from '../extension/lib/pac.js';
import { firefoxManifest, GECKO_ID } from '../tools/build-zip.mjs';

// Chrome'un PAC'ini ve Firefox'un findProxy'sini aynı girdilerle çalıştırıp sonuçları karşılaştırır.
function both(cfg) {
  const ctx = { shExpMatch };
  vm.createContext(ctx);
  vm.runInContext(buildPac(cfg), ctx);
  return (url) => {
    const host = new URL(url).hostname;
    return [ctx.FindProxyForURL(url, host), findProxy(cfg, url, host)];
  };
}

test('findProxy, PAC betiğiyle her durumda aynı kararı verir', () => {
  const T = 'abcdef0123456789';
  const ph = { type: 'http', host: '1.2.3.4', port: 8080 };
  const p5 = { type: 'socks5', host: '5.6.7.8', port: 1080 };
  const p4 = { type: 'socks4', host: '9.9.9.9', port: 4145 };
  const urls = [
    `http://httpbin.org/get?${checkMarker(T, p5)}&_=x`,
    `http://httpbin.org/get?${checkMarker(T, p4)}`,
    `http://httpbin.org/get?${checkMarker(T, ph)}`,
    `http://httpbin.org/get?__pxc${T}=BOZUK`,
    `http://httpbin.org/ip?${directMarker(T)}`,
    `https://${httpsCheckHost(T, ph, 'n1')}/cdn-cgi/trace`,
    `https://${httpsCheckHost(T, p5, 'n2')}/cdn-cgi/trace`,
    `https://${httpsCheckHost(T, p4, 'n3')}/cdn-cgi/trace`,
    `https://pxs${T.slice(0, 10)}-h-bozuk.cloudflareaccess.com/`,
    `https://${httpsCheckHost('ffffffffffffffff', ph, 'a')}/`,
    'http://evil.com/?__pxcWRONG=PROXY~6.6.6.6~80',
    'https://api.ipify.org/',
    'https://example.com/path?q=1',
    'http://router/',
    'http://localhost:3000/',
    'http://192.168.1.10/',
    'http://192.169.1.10/',
    'http://10.20.30.40/',
    'https://git.corp.lan/',
    'https://corp.lan/',
  ];
  const cfgs = [
    { token: T, active: directiveFor(ph), bypass: ['<local>', 'localhost', '192.168.0.0/16', '10.0.0.0/8', '*.corp.lan'], hostMap: { 'api.ipify.org': 'PROXY 7.7.7.7:80' } },
    { token: T, active: directiveFor(p5), bypass: [] },
    { token: T, active: null, bypass: ['<local>'] },
    { token: T },
  ];
  for (const cfg of cfgs) {
    const run = both(cfg);
    for (const u of urls) {
      const [pac, js] = run(u);
      assert.equal(js, pac, `${u} (active=${cfg.active})`);
    }
  }
});

test('toProxyInfo: PAC yönergesi → Firefox ProxyInfo', () => {
  assert.deepEqual(toProxyInfo('PROXY 1.2.3.4:8080'), { type: 'http', host: '1.2.3.4', port: 8080 });
  assert.deepEqual(toProxyInfo('SOCKS5 5.6.7.8:1080'), { type: 'socks', host: '5.6.7.8', port: 1080, proxyDNS: true });
  assert.deepEqual(toProxyInfo('SOCKS 9.9.9.9:4145'), { type: 'socks4', host: '9.9.9.9', port: 4145 });
  assert.deepEqual(toProxyInfo('PROXY proxy.example.com:3128'), { type: 'http', host: 'proxy.example.com', port: 3128 });
  assert.deepEqual(toProxyInfo('DIRECT'), { type: 'direct' });
  assert.deepEqual(toProxyInfo(''), { type: 'direct' });
});

test('shExpMatch: * ve ? joker karakterleri, tam eşleşme', () => {
  assert.ok(shExpMatch('a.corp.lan', '*.corp.lan'));
  assert.ok(!shExpMatch('corp.lan', '*.corp.lan'));
  assert.ok(shExpMatch('host1', 'host?'));
  assert.ok(!shExpMatch('host12', 'host?'));
  assert.ok(shExpMatch('x.local', '*.local'));
  assert.ok(!shExpMatch('evil.com', 'evil.c'));
});

test('Firefox manifesti: MV2, kalıcı arka plan, Firefox izinleri, kimlik ve veri beyanı', () => {
  const src = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const m = firefoxManifest(src);
  assert.equal(m.manifest_version, 2);
  assert.deepEqual(m.background, { page: 'background.html', persistent: true });
  assert.equal(m.version, src.version);
  assert.ok(m.permissions.includes('webRequestBlocking'));
  assert.ok(!m.permissions.includes('webRequestAuthProvider'));
  assert.ok(m.permissions.includes('<all_urls>'));
  for (const p of src.permissions.filter((p) => p !== 'webRequestAuthProvider')) assert.ok(m.permissions.includes(p), p);
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.action, undefined);
  assert.deepEqual(m.browser_action, src.action);
  assert.equal(m.key, undefined);
  assert.equal(m.minimum_chrome_version, undefined);
  const g = m.browser_specific_settings.gecko;
  assert.equal(g.id, GECKO_ID);
  assert.deepEqual(g.data_collection_permissions, { required: ['none'], optional: ['authenticationInfo'] });
  assert.ok(+g.strict_min_version.split('.')[0] >= 140);
});
