# ProxyScout — Gizlilik Politikası / Privacy Policy

_Son güncelleme / Last updated: 19.10.2026 (Firefox)_

## Türkçe

ProxyScout, ücretsiz proxy listelerini indirip test eden ve tarayıcı trafiğini kullanıcının seçtiği
proxy'ye yönlendiren bir tarayıcı eklentisidir. Geliştiricinin hiçbir sunucusu yoktur; eklenti
**hiçbir kişisel veriyi geliştiriciye göndermez, satmaz veya paylaşmaz**, reklam ya da analiz
(izleme) aracı içermez.

**Cihazınızda saklananlar** (`chrome.storage.local`): proxy listesi ve test sonuçları, favoriler,
eklediğiniz proxy'ler (kullanıcı adı/şifre dahil), kaynak seçimleri ve ayarlar.

**Eklentinin bağlandığı üçüncü taraflar** (yalnızca işlevin gerektirdiği ölçüde):

| Hizmet | Amaç | Gönderilen |
| --- | --- | --- |
| Proxy listesi siteleri (Kaynaklar ekranındaki adresler) | Liste indirme | Standart HTTP isteği |
| httpbin.org, Cloudflare (`*.cloudflareaccess.com/cdn-cgi/trace`) | Proxy'nin çalışıp çalışmadığını ve gizlilik düzeyini test etme | Test isteği (proxy üzerinden) |
| ip-api.com | Çalışan proxy'lerin ülke/şehir bilgisi | Proxy'lerin IP adresleri |
| api.ipify.org, icanhazip.com | "IP'mi göster" ve bağlantı doğrulama | Standart HTTP isteği |
| Seçtiğiniz proxy sunucusu | Siz bağlandığınızda tarayıcı trafiğiniz bu sunucudan geçer | Gezinme trafiği |
| Google (yalnızca senkronizasyonu açarsanız) | Listeyi cihazlarınız arasında taşımak | Aşağıya bakın |

**Senkronizasyon (isteğe bağlı):**
- _Chrome senkronu_: Özet (çalışan proxy'ler, favoriler, kendi proxy'leriniz, kaynak seçimleri,
  ayarlar), Chrome'a giriş yaptığınız Google hesabının senkron alanında (`chrome.storage.sync`)
  saklanır. Ayarlar'dan kapatılabilir. Firefox'ta aynı özet, Firefox'a giriş yaptığınız Mozilla
  hesabının senkron alanında (Firefox Sync) tutulur.
- _Firefox'ta özel proxy şifreleri_: Kendi eklediğiniz proxy'lerin kullanıcı adı/şifresi, yalnızca
  Firefox'un isteğe bağlı "kimlik doğrulama bilgisi" veri iznini verirseniz senkrona yazılır; izin
  vermezseniz şifreler yalnızca bu cihazda kalır.
- _Google Drive_: "Google ile bağlan" derseniz aynı özet, Google Drive'ınızda yalnızca bu
  eklentinin erişebildiği gizli uygulama klasöründe (`drive.appdata`) tek bir dosya olarak tutulur.
  Eklenti yalnızca bu klasöre ve hesabınızın e-posta adresine (hangi hesapla bağlı olduğunuzu
  göstermek için) erişir; Drive'daki diğer dosyalarınızı göremez. Erişim anahtarı yalnızca tarayıcı
  oturumu boyunca bellekte tutulur. "Bağlantıyı kaldır" ile izin geri alınır; ayrıca
  <https://myaccount.google.com/permissions> adresinden de kaldırabilirsiniz.
- Google kullanıcı verilerinin kullanımı [Google API Hizmetleri Kullanıcı Verileri Politikası](https://developers.google.com/terms/api-services-user-data-policy)'na,
  Sınırlı Kullanım (Limited Use) koşulları dahil, uygundur: veriler yalnızca senkronizasyon için
  kullanılır, aktarılmaz, reklam için kullanılmaz ve insanlar tarafından okunmaz.

**Önemli uyarı:** Ücretsiz/açık proxy'ler üçüncü kişilerce işletilir. Bir proxy'ye bağlandığınızda
şifrelenmemiş (http://) trafiğinizi görebilir veya değiştirebilir; HTTPS sitelerin içeriği şifreli
kalır ancak hangi sitelere bağlandığınızı görebilir. Hassas işlemler için ücretsiz proxy kullanmayın.

**Veri silme:** Eklentiyi kaldırmak yerel verileri siler. Senkron verisi için Ayarlar →
Senkronizasyon'dan Chrome senkronunu kapatın / Google Drive bağlantısını kaldırın.

**İletişim:** <https://github.com/Halil-KAPLAN/ProxyScout/issues>

## English

ProxyScout is a browser extension that downloads free proxy lists, tests them and routes browser
traffic through the proxy the user selects. The developer runs no servers; the extension **does not
send, sell or share any personal data with the developer** and contains no ads or analytics.

**Stored on your device** (`chrome.storage.local`): the proxy list and test results, favorites, proxies
you add (including username/password), source choices and settings.

**Third parties contacted** (only as needed for the features): proxy list websites (to download lists);
httpbin.org and Cloudflare (`*.cloudflareaccess.com/cdn-cgi/trace`) to test proxies; ip-api.com
(proxy IP addresses, to look up country/city); api.ipify.org / icanhazip.com ("Show my IP" and
connection checks); the proxy server you choose (your browsing traffic goes through it while
connected); Google, only if you turn on sync.

**Sync (optional):** With _Chrome sync_ a summary (working proxies, favorites, your proxies, source
choices, settings) is stored in the sync storage of the Google account you are signed in to Chrome
with (in Firefox: Firefox Sync, with your Mozilla account). In Firefox, the usernames/passwords of
proxies you added are written to sync only if you grant Firefox's optional "authentication
information" data permission; otherwise they stay on this device. With _Google Drive_ the same summary is stored as one file in a hidden app folder that only this
extension can access (`drive.appdata`); the extension also reads your account e-mail to show which
account is connected, and cannot see your other Drive files. The access token is kept in memory for
the browser session only. Use of Google user data complies with the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements: the data is used only for sync, is not transferred, is not used
for advertising and is not read by humans. You can revoke access with "Disconnect" or at
<https://myaccount.google.com/permissions>.

**Important:** Free/public proxies are operated by third parties. While connected, a proxy can see or
modify unencrypted (http://) traffic and can see which sites you connect to over HTTPS.

**Deleting data:** Uninstalling the extension removes local data. Turn off Chrome sync / disconnect
Google Drive in Settings → Sync to stop syncing.

**Contact:** <https://github.com/Halil-KAPLAN/ProxyScout/issues>
