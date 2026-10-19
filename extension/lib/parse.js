// Proxy listesi ayrıştırma ve proxy yardımcıları (arka plan ve arayüz ortak kullanır).

export const TYPES = ['http', 'socks4', 'socks5'];

export function normalizeType(t, fallback = 'http') {
  if (!t) return fallback;
  t = String(t).toLowerCase();
  if (t === 'http' || t === 'https') return 'http';
  if (t === 'socks4' || t === 'socks4a') return 'socks4';
  if (t === 'socks5' || t === 'socks5h' || t === 'socks') return 'socks5';
  return fallback;
}

export const proxyId = (type, host, port) => `${type}://${host}:${port}`;

function validIp(ip) {
  const parts = ip.split('.');
  return parts.length === 4 && parts.every((x) => x.length <= 3 && +x <= 255) && ip !== '0.0.0.0';
}

function validPort(p) {
  p = +p;
  return Number.isInteger(p) && p > 0 && p < 65536;
}

// Her türlü metinden (düz liste, HTML tablo, "socks5://ip:port", "ip:port:ülke") IPv4:port çiftlerini çıkarır.
const LIST_RE = /(?:\b(https?|socks4a?|socks5h?|socks):\/\/)?(?:([^\s:@\/<>"']+):([^\s@\/<>"']+)@)?\b((?:\d{1,3}\.){3}\d{1,3})(?:\s*:\s*|\s*<\/td>\s*<td[^>]*>\s*|[ \t]+)(\d{2,5})\b/gi;

export function parseProxyList(text, sourceType = 'http') {
  const auto = sourceType === 'auto';
  const fallback = auto ? 'http' : normalizeType(sourceType);
  // "auto" + HTML tablo (ör. socks-proxy.net): türü satırdaki "Socks4/Socks5" sütunundan al.
  if (auto && /<tr[\s>]/i.test(text)) {
    const out = new Map();
    for (const row of text.split(/<tr[\s>]/i)) {
      const v = /\bsocks\s*(4|5)\b/i.exec(row.replace(/<[^>]+>/g, ' '));
      for (const p of parseProxyList(row, v ? 'socks' + v[1] : 'http')) out.set(proxyId(p.type, p.host, p.port), p);
    }
    return [...out.values()];
  }
  const out = new Map();
  LIST_RE.lastIndex = 0;
  let m;
  while ((m = LIST_RE.exec(text))) {
    const [, scheme, user, pass, host, port] = m;
    if (!validIp(host) || !validPort(port)) continue;
    const type = scheme && auto ? normalizeType(scheme, fallback) : fallback;
    const id = proxyId(type, host, +port);
    if (!out.has(id)) {
      const p = { type, host, port: +port };
      if (user && pass) Object.assign(p, { user: decodeURIComponent(user), pass: decodeURIComponent(pass) });
      out.set(id, p);
    }
  }
  return [...out.values()];
}

// Kullanıcının elle yapıştırdığı satırlar: alan adları ve "ip:port:kullanıcı:şifre" biçimini de destekler.
export function parseManualList(text, defaultType = 'http') {
  const out = new Map();
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    let type = normalizeType(defaultType);
    const sm = /^([a-z0-9]+):\/\//i.exec(line);
    if (sm) {
      type = normalizeType(sm[1], type);
      line = line.slice(sm[0].length);
    }
    let user, pass, host, port;
    const at = line.lastIndexOf('@');
    if (at !== -1) {
      [user, pass] = line.slice(0, at).split(':');
      [host, port] = line.slice(at + 1).split(':');
    } else {
      const parts = line.split(/[:\s]+/);
      [host, port, user, pass] = parts;
    }
    port = parseInt(port, 10);
    if (!host || !/^[a-z0-9.-]+$/i.test(host) || !validPort(port)) continue;
    const p = { type, host, port };
    if (user && pass) Object.assign(p, { user, pass });
    out.set(proxyId(type, host, port), p);
  }
  return [...out.values()];
}

export function formatProxy(p, withScheme = false) {
  const auth = p.user ? `${p.user}:${p.pass}@` : '';
  return (withScheme ? p.type + '://' : '') + auth + p.host + ':' + p.port;
}
