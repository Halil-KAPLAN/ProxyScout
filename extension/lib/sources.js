// Varsayılan proxy listesi kaynakları. Her site tek bir kaynaktır; sitenin sunduğu
// türler (HTTP / SOCKS4 / SOCKS5) "feeds" altında listelenir ve arayüzde onay kutusuyla seçilir.
// feed türü "auto" ise satırdaki önek/sütun türü belirler ve sonuç seçili türlere göre süzülür.
// Çok büyük listeler (10 bin+) varsayılan olarak kapalı; Kaynaklar ekranından açılabilir.

const PS = 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=ipport&format=text&protocol=';
const GH = 'https://raw.githubusercontent.com/';

const src = (id, name, feeds, opts = {}) => ({
  id,
  name,
  feeds: feeds.map(([type, url]) => ({ type, url })),
  enabled: opts.enabled ?? true,
  ...(opts.autoTypes ? { autoTypes: opts.autoTypes } : {}),
});

export const DEFAULT_SOURCES = [
  src('proxyscrape', 'ProxyScrape', [['http', PS + 'http'], ['socks4', PS + 'socks4'], ['socks5', PS + 'socks5']]),
  src('fpl', 'free-proxy-list.net', [['http', 'https://free-proxy-list.net/'], ['http', 'https://free-proxy-list.net/anonymous-proxy.html']]),
  src('sslproxies', 'sslproxies.org', [['http', 'https://www.sslproxies.org/']]),
  src('usproxy', 'us-proxy.org', [['http', 'https://www.us-proxy.org/']]),
  src('socksproxynet', 'socks-proxy.net', [['auto', 'https://www.socks-proxy.net/']], { autoTypes: ['socks4', 'socks5'] }),
  src('spys', 'Spys.me', [['http', 'https://spys.me/proxy.txt'], ['socks5', 'https://spys.me/socks.txt']]),
  src('monosans', 'monosans/proxy-list', [
    ['http', GH + 'monosans/proxy-list/main/proxies/http.txt'],
    ['socks4', GH + 'monosans/proxy-list/main/proxies/socks4.txt'],
    ['socks5', GH + 'monosans/proxy-list/main/proxies/socks5.txt'],
  ]),
  src('vakhov', 'vakhov/fresh-proxy-list', [
    ['http', GH + 'vakhov/fresh-proxy-list/master/http.txt'],
    ['socks4', GH + 'vakhov/fresh-proxy-list/master/socks4.txt'],
    ['socks5', GH + 'vakhov/fresh-proxy-list/master/socks5.txt'],
  ]),
  src('zaeem20', 'Zaeem20/FREE_PROXIES_LIST', [
    ['http', GH + 'Zaeem20/FREE_PROXIES_LIST/master/http.txt'],
    ['socks4', GH + 'Zaeem20/FREE_PROXIES_LIST/master/socks4.txt'],
    ['socks5', GH + 'Zaeem20/FREE_PROXIES_LIST/master/socks5.txt'],
  ]),
  src('hideipme', 'hideip.me', [
    ['http', GH + 'zloi-user/hideip.me/main/http.txt'],
    ['socks4', GH + 'zloi-user/hideip.me/main/socks4.txt'],
    ['socks5', GH + 'zloi-user/hideip.me/main/socks5.txt'],
  ]),
  src('roosterkid', 'roosterkid/openproxylist', [
    ['http', GH + 'roosterkid/openproxylist/main/HTTPS_RAW.txt'],
    ['socks4', GH + 'roosterkid/openproxylist/main/SOCKS4_RAW.txt'],
    ['socks5', GH + 'roosterkid/openproxylist/main/SOCKS5_RAW.txt'],
  ]),
  src('mmpx12', 'mmpx12/proxy-list', [
    ['http', GH + 'mmpx12/proxy-list/master/http.txt'],
    ['socks4', GH + 'mmpx12/proxy-list/master/socks4.txt'],
    ['socks5', GH + 'mmpx12/proxy-list/master/socks5.txt'],
  ]),
  src('clarketm', 'clarketm/proxy-list', [['http', GH + 'clarketm/proxy-list/master/proxy-list-raw.txt']]),
  src('proxyspace', 'proxyspace.pro', [['http', 'https://proxyspace.pro/http.txt'], ['socks4', 'https://proxyspace.pro/socks4.txt'], ['socks5', 'https://proxyspace.pro/socks5.txt']], { enabled: false }),
  src('speedx', 'TheSpeedX/PROXY-List', [
    ['http', GH + 'TheSpeedX/PROXY-List/master/http.txt'],
    ['socks4', GH + 'TheSpeedX/PROXY-List/master/socks4.txt'],
    ['socks5', GH + 'TheSpeedX/PROXY-List/master/socks5.txt'],
  ], { enabled: false }),
  src('dpangestuw', 'dpangestuw/Free-Proxy', [
    ['http', GH + 'dpangestuw/Free-Proxy/main/http_proxies.txt'],
    ['socks4', GH + 'dpangestuw/Free-Proxy/main/socks4_proxies.txt'],
    ['socks5', GH + 'dpangestuw/Free-Proxy/main/socks5_proxies.txt'],
  ], { enabled: false }),
  src('openproxylist', 'openproxylist.xyz', [
    ['http', 'https://api.openproxylist.xyz/http.txt'],
    ['socks4', 'https://api.openproxylist.xyz/socks4.txt'],
    ['socks5', 'https://api.openproxylist.xyz/socks5.txt'],
  ], { enabled: false }),
  src('sunny9577', 'sunny9577/proxy-scraper', [['http', GH + 'sunny9577/proxy-scraper/master/proxies.txt']], { enabled: false }),
  src('proxifly', 'proxifly (çok büyük / very large)', [
    ['http', GH + 'proxifly/free-proxy-list/main/proxies/protocols/http/data.txt'],
    ['socks4', GH + 'proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt'],
    ['socks5', GH + 'proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt'],
  ], { enabled: false }),
  src('hookzof', 'hookzof/socks5_list (çok büyük / very large)', [['socks5', GH + 'hookzof/socks5_list/master/proxy.txt']], { enabled: false }),
  src('murongpig', 'MuRongPIG/Proxy-Master (çok büyük / very large)', [
    ['http', GH + 'MuRongPIG/Proxy-Master/main/http.txt'],
    ['socks4', GH + 'MuRongPIG/Proxy-Master/main/socks4.txt'],
    ['socks5', GH + 'MuRongPIG/Proxy-Master/main/socks5.txt'],
  ], { enabled: false }),
];

export const ALL_TYPES = ['http', 'socks4', 'socks5'];

// Kaynağın sunduğu türler.
export function sourceTypes(s) {
  const out = new Set();
  for (const f of s.feeds || []) {
    if (f.type === 'auto') (s.autoTypes || ALL_TYPES).forEach((t) => out.add(t));
    else out.add(f.type);
  }
  return ALL_TYPES.filter((t) => out.has(t));
}

// Kaynakta kullanıcının seçtiği türler (seçim yoksa hepsi).
export const enabledTypes = (s) => {
  const avail = sourceTypes(s);
  return Array.isArray(s.types) ? avail.filter((t) => s.types.includes(t)) : avail;
};

// Ekranda gösterilecek kısa adres: GitHub ham dosyaları için depo adresi, diğerleri için alan adı.
export function sourceHome(s) {
  const u = new URL(s.feeds[0].url);
  if (u.hostname === 'raw.githubusercontent.com') {
    const [, user, repo] = u.pathname.split('/');
    return `https://github.com/${user}/${repo}`;
  }
  return u.origin + '/';
}
