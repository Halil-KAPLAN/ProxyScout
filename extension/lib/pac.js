// PAC betiği üretimi.
//
// Eklentiler ham TCP soketi açamaz; proxy'leri test etmenin tek yolu tarayıcının
// kendi ağ katmanını kullanmaktır. Bunun için tek bir PAC betiği kurulur:
//  * URL'de "__pxc<token>=TÜR~host~port" işareti olan HTTP istekleri o proxy'ye gider.
//    (Chrome HTTP isteklerinde PAC'e tam URL'yi verir, böylece yüzlerce proxy
//    aynı anda, PAC'i hiç değiştirmeden test edilebilir.)
//  * "__pxd<token>" işareti olan istekler daima DIRECT gider (gerçek IP, ülke sorgusu).
//  * HTTPS'de PAC yalnızca host adını gördüğü için SSL testi "hostMap" ile yapılır.
//  * Geri kalan tüm trafik aktif proxy'ye (ya da DIRECT'e) gider.
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

export function directMarker(token) {
  return `__pxd${token}=1`;
}

export function buildPac({ token, active = null, bypass = [], hostMap = {} }) {
  return `var T=${JSON.stringify(token)};
var ACTIVE=${JSON.stringify(active || 'DIRECT')};
var HOSTMAP=${JSON.stringify(hostMap)};
var BYPASS=${JSON.stringify(bypass)};
var CHECK_RE=/^(PROXY|SOCKS|SOCKS5)~([A-Za-z0-9.\\-]+)~(\\d{1,5})/;
var HS='pxs'+T.substring(0,10)+'-';
var HOST_RE=/^pxs[0-9a-f]+-(h|4|5)-(\\d+)-(\\d+)-(\\d+)-(\\d+)-(\\d{1,5})-[a-z0-9]+\\.cloudflareaccess\\.com$/;
function ipToNum(ip){var p=ip.split('.');return ((+p[0])*16777216)+((+p[1])*65536)+((+p[2])*256)+(+p[3]);}
function bypassed(host){
  for(var i=0;i<BYPASS.length;i++){
    var b=BYPASS[i];
    if(b==='<local>'){ if(host.indexOf('.')===-1) return true; continue; }
    var c=b.indexOf('/');
    if(c!==-1){
      if(!/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(host)) continue;
      var bits=+b.substring(c+1), net=ipToNum(b.substring(0,c));
      var mask=bits===0?0:(0xFFFFFFFF<<(32-bits))>>>0;
      if(((ipToNum(host)&mask)>>>0)===((net&mask)>>>0)) return true;
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
  if(ACTIVE==='DIRECT' || bypassed(host)) return 'DIRECT';
  return ACTIVE;
}`;
}
