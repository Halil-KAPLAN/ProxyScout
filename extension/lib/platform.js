// Tarayıcı farkları. Chrome/Edge paketi Manifest V3 (servis çalışanı, chrome.proxy.settings + PAC),
// Firefox paketi Manifest V2'dir (kalıcı arka plan sayfası, proxy.onRequest). Firefox paketi
// tools/build-zip.mjs ile üretilir.
//
// Firefox'ta da `chrome` ad alanı vardır; ayırt etmek için yalnızca Firefox'ta bulunan
// browser.runtime.getBrowserInfo kullanılır.
export const IS_FIREFOX = typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';

// Mobil tarayıcı (Firefox for Android). Arayüz dar ekran düzenine geçer.
export const IS_ANDROID = /\bAndroid\b/.test(navigator.userAgent);

// Opera, Chromium tabanlı olsa da bazı API'leri sunmaz (help.opera.com/en/extensions/apis): storage.sync yoktur,
// identity'de yalnızca launchWebAuthFlow vardır. Bu yüzden ikisi de varlık kontrolüyle kullanılır.
// Firefox for Android'de storage.sync vardır ama Mozilla hesabıyla eşitlenmez; senkron seçeneği gösterilmez.
export const HAS_BROWSER_SYNC = !!chrome.storage?.sync && !(IS_FIREFOX && IS_ANDROID);

// Google Drive girişi identity.launchWebAuthFlow ister; Firefox for Android'de bu API yoktur.
export const HAS_WEB_AUTH = typeof chrome.identity?.launchWebAuthFlow === 'function';

// identity.getRedirectURL yoksa Chromium'un aynı adresi (https://<eklenti kimliği>.chromiumapp.org/) kullanılır.
export const authRedirectUrl = () => chrome.identity?.getRedirectURL?.() || `https://${chrome.runtime.id}.chromiumapp.org/`;

// Firefox yeni eklentilerden veri toplama beyanı ister (browser_specific_settings.gecko.data_collection_permissions).
// ProxyScout'un dışarı gönderdiği tek kişisel veri, kullanıcının eklediği özel proxy'lerin kullanıcı adı/şifresidir
// (senkron açıksa). Bu yüzden Firefox'ta "authenticationInfo" isteğe bağlıdır: izin verilmedikçe senkrona şifre yazılmaz.
export const CREDS_PERMISSION = { data_collection: ['authenticationInfo'] };

// Firefox'un veri toplama izinlerini bilip bilmediği (Firefox 140+). Bilmiyorsa (eski sürüm) ya da tarayıcı
// Chrome/Edge ise şifreler eskisi gibi senkronlanır.
async function supportsDataCollection() {
  if (!IS_FIREFOX) return false;
  try {
    const all = await browser.permissions.getAll();
    return 'data_collection' in all;
  } catch {
    return false;
  }
}

export async function credsSyncAllowed() {
  if (!(await supportsDataCollection())) return true;
  try {
    return await browser.permissions.contains(CREDS_PERMISSION);
  } catch {
    return false;
  }
}

// Kullanıcı bir düğmeye bastığında (eklenti sayfasında) ilk iş olarak, araya await koymadan çağrılmalıdır:
// Firefox izin penceresini yalnızca kullanıcı etkileşimi sürerken açar.
export function requestCredsSync() {
  if (!IS_FIREFOX) return Promise.resolve(true);
  return browser.permissions.request(CREDS_PERMISSION).catch(async () => !(await supportsDataCollection()));
}
