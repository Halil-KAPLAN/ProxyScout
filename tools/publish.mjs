// Paketi mağazaya yükler ve incelemeye gönderir.
// Kullanım: node tools/publish.mjs <chrome|edge> <paket.zip>
//           node tools/publish.mjs <chrome|edge> --check   (yalnızca anahtarları sınar, hiçbir şey yüklemez)
//
// Chrome Web Store (API v2) ortam değişkenleri:
//   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN  — chromewebstore kapsamlı OAuth istemcisi
//   CWS_PUBLISHER_ID, CWS_EXTENSION_ID                   — Geliştirici Panosu'ndan
// Microsoft Edge Add-ons (API v1.1) ortam değişkenleri:
//   EDGE_PRODUCT_ID, EDGE_CLIENT_ID, EDGE_API_KEY        — Partner Center → Publish API
//
// Gerekli değişkenler yoksa mağaza atlanır (çıkış kodu 0), böylece mağaza hesapları açılmadan da
// GitHub iş akışı çalışır. İlk sürüm her iki mağazada da panelden elle yüklenmelidir.
import { readFileSync } from 'node:fs';

const [store, zipPath] = process.argv.slice(2);
const env = process.env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const missing = (names) => names.filter((n) => !env[n]);

async function check(res, what) {
  const body = await res.text();
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${body.slice(0, 800)}`);
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return { raw: body };
  }
}

const CWS_VARS = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID'];
const EDGE_VARS = ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'];

async function chromeAuth() {
  const tok = await check(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.CWS_CLIENT_ID, client_secret: env.CWS_CLIENT_SECRET, refresh_token: env.CWS_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    }),
    'Erişim anahtarı',
  );
  return {
    auth: { Authorization: `Bearer ${tok.access_token}` },
    item: `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`,
    base: 'https://chromewebstore.googleapis.com',
  };
}

// Erişim anahtarı alınabiliyor ve öğe okunabiliyorsa istemci, refresh token ve kimlikler doğrudur.
async function chromeCheck() {
  if (missing(CWS_VARS).length) throw new Error(`Chrome Web Store: eksik gizli değerler: ${missing(CWS_VARS).join(', ')}`);
  const { auth, item, base } = await chromeAuth();
  console.log('Chrome Web Store: erişim anahtarı alındı (CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN doğru).');
  const st = await check(await fetch(`${base}/v2/${item}:fetchStatus`, { headers: auth }), 'Öğe durumu (CWS_PUBLISHER_ID / CWS_EXTENSION_ID)');
  console.log('Chrome Web Store: öğe okundu (CWS_PUBLISHER_ID, CWS_EXTENSION_ID doğru) →', JSON.stringify(st));
}

async function chrome(zip) {
  if (missing(CWS_VARS).length) return console.log(`Chrome Web Store atlandı (eksik: ${missing(CWS_VARS).join(', ')})`);
  const { auth, item, base } = await chromeAuth();

  let up = await check(await fetch(`${base}/upload/v2/${item}:upload`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/zip' }, body: zip }), 'Yükleme');
  console.log('Yükleme yanıtı:', JSON.stringify(up));
  for (let i = 0; i < 30 && /PROGRESS/i.test(JSON.stringify(up.uploadState || '')); i++) {
    await sleep(5000);
    up = await check(await fetch(`${base}/v2/${item}:fetchStatus`, { headers: auth }), 'Durum');
    console.log('Durum:', JSON.stringify(up));
  }
  if (/FAIL/i.test(JSON.stringify(up.uploadState || '')) || up.itemError?.length) throw new Error('Chrome yüklemesi başarısız: ' + JSON.stringify(up));

  const pub = await check(await fetch(`${base}/v2/${item}:publish`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' }), 'Yayın');
  console.log('Chrome Web Store: incelemeye gönderildi →', JSON.stringify(pub));
}

const edgeBase = () => `https://api.addons.microsoftedge.microsoft.com/v1/products/${env.EDGE_PRODUCT_ID}/submissions`;
const edgeHeaders = () => ({ Authorization: `ApiKey ${env.EDGE_API_KEY}`, 'X-ClientID': env.EDGE_CLIENT_ID });

// Edge API'de salt okunur bir uç nokta yok; var olmayan bir işlemin durumu sorulur.
// 401/403 anahtarın ya da istemci kimliğinin yanlış olduğunu, başka her yanıt kimliğin kabul edildiğini gösterir.
async function edgeCheck() {
  if (missing(EDGE_VARS).length) throw new Error(`Edge Add-ons: eksik gizli değerler: ${missing(EDGE_VARS).join(', ')}`);
  const res = await fetch(`${edgeBase()}/draft/package/operations/00000000-0000-0000-0000-000000000000`, { headers: edgeHeaders() });
  const body = (await res.text()).slice(0, 300);
  if (res.status === 401 || res.status === 403) throw new Error(`Edge Add-ons: kimlik reddedildi (HTTP ${res.status}). EDGE_CLIENT_ID / EDGE_API_KEY yanlış ya da süresi dolmuş. ${body}`);
  console.log(`Edge Add-ons: kimlik kabul edildi (EDGE_CLIENT_ID, EDGE_API_KEY doğru). Deneme sorgusu HTTP ${res.status}: ${body}`);
}

async function edge(zip) {
  if (missing(EDGE_VARS).length) return console.log(`Edge Add-ons atlandı (eksik: ${missing(EDGE_VARS).join(', ')})`);
  const base = edgeBase();
  const headers = edgeHeaders();
  const opId = (res) => (res.headers.get('location') || '').split('/').filter(Boolean).pop();

  async function wait(url, what) {
    for (let i = 0; i < 60; i++) {
      const st = await check(await fetch(url, { headers }), what);
      if (st.status && st.status !== 'InProgress') {
        console.log(`${what}:`, JSON.stringify(st));
        if (st.status !== 'Succeeded') throw new Error(`${what} başarısız: ${JSON.stringify(st)}`);
        return st;
      }
      await sleep(5000);
    }
    throw new Error(`${what}: zaman aşımı`);
  }

  const up = await fetch(`${base}/draft/package`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip });
  await check(up, 'Edge yükleme');
  await wait(`${base}/draft/package/operations/${opId(up)}`, 'Edge paket durumu');

  const pub = await fetch(base, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: `ProxyScout ${process.env.VERSION || ''} — otomatik yayın (GitHub Actions)` }),
  });
  await check(pub, 'Edge yayın');
  await wait(`${base}/operations/${opId(pub)}`, 'Edge yayın durumu');
  console.log('Edge Add-ons: incelemeye gönderildi.');
}

if (!['chrome', 'edge'].includes(store) || !zipPath) {
  console.error('Kullanım: node tools/publish.mjs <chrome|edge> <paket.zip|--check>');
  process.exit(2);
}
const run =
  zipPath === '--check'
    ? store === 'chrome' ? chromeCheck() : edgeCheck()
    : store === 'chrome' ? chrome(readFileSync(zipPath)) : edge(readFileSync(zipPath));
await run.catch((e) => {
  console.error(e.message);
  process.exit(1);
});
