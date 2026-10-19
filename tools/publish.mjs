// Paketi mağazaya yükler ve incelemeye gönderir.
// Kullanım: node tools/publish.mjs <chrome|edge> <paket.zip>
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

async function chrome(zip) {
  const need = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID'];
  if (missing(need).length) return console.log(`Chrome Web Store atlandı (eksik: ${missing(need).join(', ')})`);
  const tok = await check(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.CWS_CLIENT_ID, client_secret: env.CWS_CLIENT_SECRET, refresh_token: env.CWS_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    }),
    'Erişim anahtarı',
  );
  const auth = { Authorization: `Bearer ${tok.access_token}` };
  const item = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;
  const base = 'https://chromewebstore.googleapis.com';

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

async function edge(zip) {
  const need = ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'];
  if (missing(need).length) return console.log(`Edge Add-ons atlandı (eksik: ${missing(need).join(', ')})`);
  const base = `https://api.addons.microsoftedge.microsoft.com/v1/products/${env.EDGE_PRODUCT_ID}/submissions`;
  const headers = { Authorization: `ApiKey ${env.EDGE_API_KEY}`, 'X-ClientID': env.EDGE_CLIENT_ID };
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
  console.error('Kullanım: node tools/publish.mjs <chrome|edge> <paket.zip>');
  process.exit(2);
}
const zip = readFileSync(zipPath);
await (store === 'chrome' ? chrome(zip) : edge(zip)).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
