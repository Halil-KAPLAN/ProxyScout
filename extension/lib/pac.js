// PAC betiği üretimi.
//
// Eklentiler ham TCP soketi açamaz; proxy'leri test etmenin tek yolu tarayıcının
// kendi ağ katmanını kullanmaktır. Bunun için tek bir PAC betiği kurulur:
//  * URL'de "__pxc<token>=TÜR~host~port" işareti olan HTTP istekleri o proxy'ye gider.
//    (Chrome HTTP isteklerinde PAC'e tam URL'yi verir, böylece yüzlerce proxy
//    aynı anda, PAC'i hiç değiştirmeden test edilebilir.)
//  * "__pxd<token>" işareti olan istekler daima DIRECT gider (gerçek IP, ülke sorgusu).
//  * HTTPS'de PAC yalnızca host adını gördüğü için SSL testi "hostMap" ile yapılır.
//  * "pxa<token>-…" ile başlayan alan adları daima aktif proxy'ye gider (bağlantı doğrulaması; "yalnızca bu siteler"
//    açıkken bile proxy'nin çıkış IP'si okunabilsin diye).
//  * Geri kalan tüm trafik aktif proxy'ye (ya da DIRECT'e) gider; "yalnızca bu siteler" (only) listesi varsa
//    yalnızca listedeki alan adları proxy'ye, diğerleri doğrudan gider.
// token rastgele üretilir; böylece web sayfaları bu işaretleri kötüye kullanamaz.

export function directiveFor(p) {
  const hp = p.host + ':' + p.port;
  if (p.type === 'socks5') return 'SOCKS5 ' + hp;
  if (p.type === 'socks4') return 'SOCKS ' + hp;
  return 'PROXY ' + hp;
}

const DIR_TOKEN = { http: 'PROXY', socks4: 'SOCKS', socks5: 'SOCKS5' };

export function checkMarker(token, p) {
  return `__pxc${token}=${DIR_TOKEN[p.type] || 'PROXY'}~${p.host}~${p.port}`;
}

// HTTPS testi için alan adı. *.cloudflareaccess.com her alt alan adı için geçerli sertifikayla
// /cdn-cgi/trace yanıtı (görünen IP dahil) döndürür. PAC HTTPS'de yalnızca alan adını gördüğünden
// proxy bilgisi alan adının içine yazılır; böylece tüm proxy'ler aynı anda, PAC'ı değiştirmeden
// HTTPS üzerinden test edilir. Yalnızca IPv4 adresli proxy'ler için.
export const HTTPS_CHECK_DOMAIN = 'cloudflareaccess.com';
const HOST_TYPE = { http: 'h', socks4: '4', socks5: '5' };

export function httpsCheckHost(token, p, nonce) {
  return `pxs${token.slice(0, 10)}-${HOST_TYPE[p.type] || 'h'}-${p.host.replace(/\./g, '-')}-${p.port}-${nonce}.${HTTPS_CHECK_DOMAIN}`;
}

// Aktif proxy üzerinden çıkış IP'sini okumak için alan adı (Cloudflare trace; bkz. HTTPS_CHECK_DOMAIN).
export function activeCheckHost(token, nonce) {
  return `pxa${token.slice(0, 10)}-${nonce}.${HTTPS_CHECK_DOMAIN}`;
}

// "Yalnızca bu siteler" girişini alan adına indirir: "https://www.YouTube.com/watch" → "youtube.com"
// (baştaki "www." atılır; düz alan adı alt alan adlarını zaten kapsar).
// Joker (*.ornek.com), CIDR (10.0.0.0/8) ve <local> olduğu gibi kalır.
export function cleanSiteEntry(x) {
  x = String(x || '').trim();
  if (!x || x === '<local>' || /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(x)) return x;
  return x.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^\.+|\.+$/g, '').replace(/^www\./i, '').toLowerCase();
}

export function directMarker(token) {
  return `__pxd${token}=1`;
}

// PAC ortamındaki shExpMatch: * herhangi bir dizi, ? tek karakter, tam eşleşme.
export function shExpMatch(str, exp) {
  const re = exp.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + re + '$', 'i').test(str);
}

// buildPac'teki FindProxyForURL ile aynı karar, düz JS olarak (Firefox'un proxy.onRequest'i için).
// Dönüş değeri PAC yönergesidir: "DIRECT", "PROXY h:p", "SOCKS h:p" ya da "SOCKS5 h:p".
// İkisinin aynı kararı verdiği tests/logic.test.mjs'de denetlenir.
const CHECK_RE = /^(PROXY|SOCKS|SOCKS5)~([A-Za-z0-9.-]+)~(\d{1,5})/;
const HOST_RE = /^pxs[0-9a-f]+-(h|4|5)-(\d+)-(\d+)-(\d+)-(\d+)-(\d{1,5})-[a-z0-9]+\.cloudflareaccess\.com$/;
const ipToNum = (ip) => ip.split('.').reduce((n, x) => n * 256 + +x, 0);

// Listede eşleşme. wide: düz bir alan adı (joker içermeyen) alt alan adlarını da kapsar ("ornek.com" → "www.ornek.com").
function bypassed(host, bypass, wide = false) {
  for (const b of bypass) {
    if (b === '<local>') {
      if (host.indexOf('.') === -1) return true;
      continue;
    }
    const c = b.indexOf('/');
    if (c !== -1) {
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) continue;
      const bits = +b.substring(c + 1);
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if (((ipToNum(host) & mask) >>> 0) === ((ipToNum(b.substring(0, c)) & mask) >>> 0)) return true;
      continue;
    }
    if (wide && !/[*?]/.test(b)) {
      const d = b.toLowerCase();
      const h = host.toLowerCase();
      if (h === d || h.slice(-d.length - 1) === '.' + d) return true;
      continue;
    }
    if (shExpMatch(host, b)) return true;
  }
  return false;
}

export function findProxy({ token, active = null, bypass = [], hostMap = {}, only = null }, url, host) {
  const i = url.indexOf('__pxc' + token + '=');
  if (i !== -1) {
    const m = CHECK_RE.exec(url.substring(i + token.length + 6));
    return m ? m[1] + ' ' + m[2] + ':' + m[3] : 'PROXY 0.0.0.0:9';
  }
  if (host.indexOf('pxs' + token.substring(0, 10) + '-') === 0) {
    const h = HOST_RE.exec(host);
    return h ? (h[1] === 'h' ? 'PROXY ' : h[1] === '4' ? 'SOCKS ' : 'SOCKS5 ') + h[2] + '.' + h[3] + '.' + h[4] + '.' + h[5] + ':' + h[6] : 'PROXY 0.0.0.0:9';
  }
  if (url.indexOf('__pxd' + token) !== -1) return 'DIRECT';
  if (Object.prototype.hasOwnProperty.call(hostMap, host)) return hostMap[host];
  if (!active || active === 'DIRECT') return 'DIRECT';
  if (host.indexOf('pxa' + token.substring(0, 10) + '-') === 0) return active;
  if (bypassed(host, bypass)) return 'DIRECT';
  if (only && only.length && !bypassed(host, only, true)) return 'DIRECT';
  return active;
}

// PAC yönergesini Firefox proxy.onRequest'in beklediği ProxyInfo nesnesine çevirir.
// SOCKS5'te alan adı da proxy üzerinden çözülür (gerçek DNS sızmasın diye).
export function toProxyInfo(directive) {
  const m = /^(PROXY|SOCKS5|SOCKS)\s+([^\s:]+):(\d+)$/.exec(directive || '');
  if (!m) return { type: 'direct' };
  const [, kind, host, port] = m;
  if (kind === 'SOCKS5') return { type: 'socks', host, port: +port, proxyDNS: true };
  if (kind === 'SOCKS') return { type: 'socks4', host, port: +port };
  return { type: 'http', host, port: +port };
}

export function buildPac({ token, active = null, bypass = [], hostMap = {}, only = null }) {
  return `var T=${JSON.stringify(token)};
var ONLY=${JSON.stringify(only && only.length ? only : null)};
var HA='pxa'+T.substring(0,10)+'-';
var ACTIVE=${JSON.stringify(active || 'DIRECT')};
var HOSTMAP=${JSON.stringify(hostMap)};
var BYPASS=${JSON.stringify(bypass)};
var CHECK_RE=/^(PROXY|SOCKS|SOCKS5)~([A-Za-z0-9.\\-]+)~(\\d{1,5})/;
var HS='pxs'+T.substring(0,10)+'-';
var HOST_RE=/^pxs[0-9a-f]+-(h|4|5)-(\\d+)-(\\d+)-(\\d+)-(\\d+)-(\\d{1,5})-[a-z0-9]+\\.cloudflareaccess\\.com$/;
function ipToNum(ip){var p=ip.split('.');return ((+p[0])*16777216)+((+p[1])*65536)+((+p[2])*256)+(+p[3]);}
function bypassed(host,list,wide){
  for(var i=0;i<list.length;i++){
    var b=list[i];
    if(b==='<local>'){ if(host.indexOf('.')===-1) return true; continue; }
    var c=b.indexOf('/');
    if(c!==-1){
      if(!/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(host)) continue;
      var bits=+b.substring(c+1), net=ipToNum(b.substring(0,c));
      var mask=bits===0?0:(0xFFFFFFFF<<(32-bits))>>>0;
      if(((ipToNum(host)&mask)>>>0)===((net&mask)>>>0)) return true;
      continue;
    }
    if(wide && !/[*?]/.test(b)){
      var d=b.toLowerCase(), hl=host.toLowerCase();
      if(hl===d || hl.slice(-d.length-1)==='.'+d) return true;
      continue;
    }
    if(shExpMatch(host,b)) return true;
  }
  return false;
}
function FindProxyForURL(url,host){
  var i=url.indexOf('__pxc'+T+'=');
  if(i!==-1){
    var m=CHECK_RE.exec(url.substring(i+T.length+6));
    return m ? m[1]+' '+m[2]+':'+m[3] : 'PROXY 0.0.0.0:9';
  }
  if(host.indexOf(HS)===0){
    var h=HOST_RE.exec(host);
    return h ? (h[1]==='h'?'PROXY ':h[1]==='4'?'SOCKS ':'SOCKS5 ')+h[2]+'.'+h[3]+'.'+h[4]+'.'+h[5]+':'+h[6] : 'PROXY 0.0.0.0:9';
  }
  if(url.indexOf('__pxd'+T)!==-1) return 'DIRECT';
  if(HOSTMAP.hasOwnProperty(host)) return HOSTMAP[host];
  if(ACTIVE==='DIRECT') return 'DIRECT';
  if(host.indexOf(HA)===0) return ACTIVE;
  if(bypassed(host,BYPASS,false)) return 'DIRECT';
  if(ONLY && !bypassed(host,ONLY,true)) return 'DIRECT';
  return ACTIVE;
}`;
}
