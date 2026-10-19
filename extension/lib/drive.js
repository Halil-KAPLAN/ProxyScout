// Google Drive "appDataFolder" istemcisi: özet, kullanıcının Drive'ında görünmeyen, yalnızca bu
// uygulamanın erişebildiği gizli klasörde tek bir JSON dosyası olarak tutulur.
// Kimlik doğrulama chrome.identity.launchWebAuthFlow ile (Chrome, Edge, Brave… hepsinde çalışır);
// yalnızca "drive.appdata" izni istenir, kullanıcının diğer dosyalarına erişilmez.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// Eklentiye gömülü OAuth istemci kimliği (Tampermonkey'deki gibi: kullanıcı yalnızca "Google ile
// bağlan"a basıp hesabını seçer). Geliştirici bir kez Google Cloud'da oluşturur — README →
// "Geliştirici: Google girişini bir kez yapılandırma". Gizli değildir; eklenti kodunda durabilir.
// Kullanıcı Ayarlar → Gelişmiş bölümünden kendi istemcisini de girebilir.
export const BUILTIN_CLIENT_ID = '122027948343-nbruiiir5ifq2n081dvs6n417dlu6u64.apps.googleusercontent.com';
const SCOPES = `${DRIVE_SCOPE} openid email`;
export const DRIVE_FILE = 'proxyscout-sync.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

// interactive: Google'ın hesap seçme penceresi açılır (ilk seferde izin ekranı da).
// Sessiz yenilemede loginHint, birden fazla Google hesabı olanlarda doğru hesabın seçilmesini sağlar.
export function authUrl({ clientId, redirectUri, interactive, loginHint }) {
  const q = {
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: SCOPES,
    include_granted_scopes: 'true',
    // İzin ekranını her bağlanmada göster: Google izinleri ayrı onay kutularıyla sorar; ekran
    // atlanırsa daha önce işaretlenmemiş Drive izni bir daha verilemez.
    prompt: interactive ? 'select_account consent' : 'none',
  };
  if (loginHint) q.login_hint = loginHint;
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(q);
}

export async function fetchEmail(token, fetchImpl = fetch) {
  const res = await fetchImpl('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? (await res.json()).email || '' : '';
}

// launchWebAuthFlow'un döndürdüğü yönlendirme adresinden erişim anahtarını çıkarır.
export function parseAuthRedirect(url) {
  const h = new URLSearchParams(new URL(url).hash.slice(1));
  const err = h.get('error') || new URL(url).searchParams.get('error');
  if (err) throw new Error('drive:' + err);
  const token = h.get('access_token');
  if (!token) throw new Error('drive:no_token');
  // Kullanıcı izin ekranında Drive kutusunu işaretlemediyse anahtar Drive'a erişemez.
  const scope = h.get('scope');
  if (scope && !scope.split(' ').includes(DRIVE_SCOPE)) throw new Error('e.driveScopeMissing');
  return { token, exp: Date.now() + (+h.get('expires_in') || 3600) * 1000 };
}

export function createDriveClient({ getToken, fetchImpl = fetch }) {
  async function call(url, opts = {}, retry = true) {
    const token = await getToken();
    const res = await fetchImpl(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401 && retry) {
      await getToken(true); // anahtar süresi dolmuş: yenile ve bir kez daha dene
      return call(url, opts, false);
    }
    if (res.status === 403 && /insufficient/i.test(await res.clone().text())) throw new Error('e.driveScopeMissing');
    if (!res.ok) throw new Error(`drive:http_${res.status}`);
    return res;
  }

  async function find() {
    const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${DRIVE_FILE}'`, fields: 'files(id,modifiedTime)', pageSize: '10' });
    const { files = [] } = await (await call(`${API}?${q}`)).json();
    return files[0] || null;
  }

  return {
    find,
    // Dosya yoksa null döner.
    async read() {
      const f = await find();
      if (!f) return null;
      const data = await (await call(`${API}/${f.id}?alt=media`)).json();
      return { id: f.id, modifiedTime: f.modifiedTime, data };
    },
    async write(data, id) {
      const body = JSON.stringify(data);
      if (id) {
        await call(`${UPLOAD}/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
        return id;
      }
      const boundary = 'pxs' + Math.random().toString(36).slice(2);
      const meta = JSON.stringify({ name: DRIVE_FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
      const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const res = await call(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
      return (await res.json()).id;
    },
  };
}
