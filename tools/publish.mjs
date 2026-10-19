// Paketi mağazaya yükler ve incelemeye gönderir.
// Kullanım: node tools/publish.mjs <chrome|edge|firefox> <paket.zip>
//           node tools/publish.mjs <chrome|edge|firefox> --check   (yalnızca anahtarları sınar, hiçbir şey yüklemez)
//
// Chrome Web Store (API v2) ortam değişkenleri:
//   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN  — chromewebstore kapsamlı OAuth istemcisi
//   CWS_PUBLISHER_ID, CWS_EXTENSION_ID                   — Geliştirici Panosu'ndan
// Microsoft Edge Add-ons (API v1.1) ortam değişkenleri:
//   EDGE_PRODUCT_ID, EDGE_CLIENT_ID, EDGE_API_KEY        — Partner Center → Publish API
// Firefox Add-ons (AMO API v5) ortam değişkenleri:
//   AMO_JWT_ISSUER, AMO_JWT_SECRET                       — addons.mozilla.org → Developer Hub → Manage API Keys
//   (Firefox paketi: dist/proxyscout-firefox-<sürüm>.zip; eklenti kimliği manifestteki gecko.id)
//
// Gerekli değişkenler yoksa mağaza atlanır (çıkış kodu 0), böylece mağaza hesapları açılmadan da
// GitHub iş akışı çalışır. İlk sürüm her iki mağazada da panelden elle yüklenmelidir.
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';

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
const AMO_VARS = ['AMO_JWT_ISSUER', 'AMO_JWT_SECRET'];

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

// --- Firefox Add-ons (addons.mozilla.org)
const AMO = 'https://addons.mozilla.org/api/v5';
const b64url = (b) => Buffer.from(b).toString('base64url');

// AMO her istek için kısa ömürlü (en fazla 5 dk), HS256 imzalı bir JWT ister.
function amoAuth() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: env.AMO_JWT_ISSUER, jti: randomUUID(), iat: now, exp: now + 240 }));
  const sig = createHmac('sha256', env.AMO_JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return { Authorization: `JWT ${head}.${body}.${sig}` };
}

// Zip içindeki manifestten eklenti kimliğini ve sürümü okumak yerine kaynak manifestten üretilen Firefox manifesti kullanılır.
async function amoAddonId() {
  const { firefoxManifest } = await import('./build-zip.mjs');
  const src = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  return firefoxManifest(src).browser_specific_settings.gecko.id;
}

// Profil yalnızca geçerli bir JWT ile okunabilir; eklenti de bu hesaba aitse sayfası okunur.
async function firefoxCheck() {
  if (missing(AMO_VARS).length) throw new Error(`Firefox Add-ons: eksik gizli değerler: ${missing(AMO_VARS).join(', ')}`);
  const me = await check(await fetch(`${AMO}/accounts/profile/`, { headers: amoAuth() }), 'Firefox Add-ons hesabı (AMO_JWT_ISSUER / AMO_JWT_SECRET)');
  console.log(`Firefox Add-ons: kimlik kabul edildi (AMO_JWT_ISSUER, AMO_JWT_SECRET doğru) → hesap: ${me.name || me.username || me.id}`);
  const id = await amoAddonId();
  const res = await fetch(`${AMO}/addons/addon/${encodeURIComponent(id)}/`, { headers: amoAuth() });
  const a = await res.json().catch(() => ({}));
  if (res.ok) console.log(`Firefox Add-ons: eklenti bulundu → ${id} · durum: ${a.status} · sürüm: ${a.current_version?.version || '-'}`);
  else console.log(`Firefox Add-ons: ${id} henüz yok ya da bu hesaba ait değil (HTTP ${res.status}); ilk sürüm panelden yüklenmeli.`);
}

async function firefox(zip) {
  if (missing(AMO_VARS).length) return console.log(`Firefox Add-ons atlandı (eksik: ${missing(AMO_VARS).join(', ')})`);
  const id = await amoAddonId();
  const form = new FormData();
  form.append('upload', new Blob([zip], { type: 'application/zip' }), 'proxyscout-firefox.zip');
  form.append('channel', 'listed');
  let up = await check(await fetch(`${AMO}/addons/upload/`, { method: 'POST', headers: amoAuth(), body: form }), 'Firefox yükleme');
  for (let i = 0; i < 60 && !up.processed; i++) {
    await sleep(5000);
    up = await check(await fetch(`${AMO}/addons/upload/${up.uuid}/`, { headers: amoAuth() }), 'Firefox doğrulama');
  }
  const v = up.validation || {};
  console.log(`Firefox doğrulama: geçerli=${up.valid} · hata=${v.errors ?? '?'} · uyarı=${v.warnings ?? '?'}`);
  if (!up.processed) throw new Error('Firefox doğrulaması zaman aşımına uğradı');
  if (!up.valid) throw new Error('Firefox paketi doğrulanamadı: ' + JSON.stringify((v.messages || []).filter((m) => m.type === 'error').slice(0, 5)));
  const ver = await check(
    await fetch(`${AMO}/addons/addon/${encodeURIComponent(id)}/versions/`, {
      method: 'POST',
      headers: { ...amoAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload: up.uuid, approval_notes: `ProxyScout ${env.VERSION || ''} — otomatik yayın (GitHub Actions). Kaynak: https://github.com/Halil-KAPLAN/ProxyScout` }),
    }),
    'Firefox sürümü',
  );
  console.log(`Firefox Add-ons: ${ver.version} incelemeye gönderildi.`);
}

const STORES = { chrome: [chrome, chromeCheck], edge: [edge, edgeCheck], firefox: [firefox, firefoxCheck] };
if (!STORES[store] || !zipPath) {
  console.error('Kullanım: node tools/publish.mjs <chrome|edge|firefox> <paket.zip|--check>');
  process.exit(2);
}
const [publishFn, checkFn] = STORES[store];
const run = zipPath === '--check' ? checkFn() : publishFn(readFileSync(zipPath));
await run.catch((e) => {
  console.error(e.message);
  process.exit(1);
});
