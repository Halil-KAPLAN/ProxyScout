# ProxyScout — Proxy Bulucu ve Değiştirici

[![Release](https://github.com/Halil-KAPLAN/ProxyScout/actions/workflows/release.yml/badge.svg)](https://github.com/Halil-KAPLAN/ProxyScout/actions/workflows/release.yml)
[![Sürüm](https://img.shields.io/github/v/release/Halil-KAPLAN/ProxyScout)](https://github.com/Halil-KAPLAN/ProxyScout/releases/latest)
[![Lisans: GPL-3.0](https://img.shields.io/badge/lisans-GPL--3.0-blue.svg)](LICENSE)

[English](README.md) · **Türkçe**

*Proxy Switcher* benzeri bir Chrome / Edge eklentisi. Ücretsiz proxy listelerini onlarca siteden
indirir, her proxy'yi gerçekten test eder (HTTP **ve** HTTPS), çalışanları **Elit + HTTPS / Elit /
Anonim / Şeffaf** gruplarına, çalışmayanları **Ölüler**e ayırır. Bir proxy'ye tıklayınca tüm tarayıcı
trafiği o proxy üzerinden geçer; tek anahtarla kapatılır.

![Çalışan proxy'ler, test edilmiş ve ayrılmış](store/screenshots/tr/01-list.png)

| | |
| --- | --- |
| ![Popup'tan tek tıkla bağlanma](store/screenshots/tr/02-popup.png) | ![Gizlilik düzeyine göre kategoriler](store/screenshots/tr/03-cats.png) |
| ![Kaynak ve tür seçimi](store/screenshots/tr/04-sources.png) | ![Tarayıcılar arası senkron](store/screenshots/tr/05-sync.png) |

## Kurulum

### Mağazalardan (önerilen)

| Tarayıcı | Bağlantı |
| --- | --- |
| Chrome, Brave, Opera, Vivaldi | **Chrome Web Store** — _yayın onayı bekleniyor_ <!-- CWS_LINK --> |
| Microsoft Edge | **Edge Add-ons** — _yayın onayı bekleniyor_ <!-- EDGE_LINK --> |
| Firefox (masaüstü, 140+) | **Firefox Add-ons** — _yayın onayı bekleniyor_ <!-- AMO_LINK --> |

### GitHub'dan (geliştirici modu)

1. [Son sürümün](https://github.com/Halil-KAPLAN/ProxyScout/releases/latest) `proxyscout-x.y.z.zip`
   dosyasını indirip bir klasöre açın (ya da depoyu klonlayıp `extension` klasörünü kullanın).
2. Chrome'da `chrome://extensions` (Edge'de `edge://extensions`) adresini açın.
3. Sağ üstten **Geliştirici modu**nu açın.
4. **Paketlenmemiş öğe yükle** → açtığınız klasörü (ya da `extension` klasörünü) seçin.
5. Araç çubuğundaki yapboz simgesinden ProxyScout'u sabitleyin.

İlk kurulumda yönetici sayfası otomatik açılır.

**Firefox (geçici, deneme için):** `npm run build` çalıştırın, `about:debugging#/runtime/this-firefox` →
**Geçici Eklenti Yükle…** → `dist/firefox/manifest.json` dosyasını seçin. Geçici eklentiler Firefox
kapanınca kaldırılır; kalıcı kurulum için Firefox Add-ons mağazasını kullanın.

## Özellikler

- **21 hazır liste kaynağı** (ProxyScrape, free-proxy-list.net, Spys.me, monosans, TheSpeedX…).
  Her kaynak tek satır; kaynak başına **HTTP / SOCKS4 / SOCKS5** seçin, kendi liste adreslerinizi
  ekleyin. Düz metin, HTML tablo ve `tür://ip:port` listeleri otomatik ayrıştırılır.
- **Gerçek test:** her proxy önce HTTP, sonra **iki ayrı HTTPS bağlantısıyla** test edilir. Küçük bir
  test sayfasını açıp gerçek siteleri açamayan proxy'ler elenir.
- **Çakışmayan gizlilik grupları:** Elit + HTTPS · Elit (yalnız HTTP) · HTTPS (elit değil) · Anonim ·
  Şeffaf. Her çalışan proxy tam olarak bir grupta.
- **Ülke, şehir ve bayrak:** her proxy'nin ülkesi indirildiği anda (çevrimdışı veritabanı), çalışanların
  şehri ve servis sağlayıcısı da.
- **Tek tıkla bağlanma:** popup'tan ya da yönetici sayfasında çift tıklayarak; **tek anahtarla** açıp
  kapatma. Araç çubuğu ikonu durumu gösterir: yeşil bağlı, turuncu bağlanıyor, kırmızı yanıt yok, gri kapalı.
- **Otomatik geçiş:** bağlı proxy ölürse en iyi çalışan proxy'ye geçer.
- **Senkron:** Chrome senkronu ya da Google Drive ile tüm tarayıcılarınızda aynı liste.
- Türkçe ve İngilizce arayüz (tarayıcı diline göre), koyu ve açık tema.
- Reklam yok, izleme yok, hesap gerekmez.

## Kullanım

| İşlem | Nerede |
| --- | --- |
| Listeleri indir ve test et | Popup veya yönetici → **Listeleri indir ve test et** |
| Proxy'ye bağlan | Popup'ta proxy'ye tıklayın, yönetici sayfasında satıra **çift tıklayın** veya **Bağlan**. Bağlantı doğrulanırken **Bağlanıyor** göstergesi çıkar; sonuç (gecikme ya da hata) bildirim olarak gösterilir |
| Proxy'yi aç / kapat | Tek anahtar: yönetici sayfasında bağlantı kartının içinde, popup'ta üstte. Rengi durumu gösterir; kapatmak bağlanmayı da iptal eder |
| Listeyi sırala | Sütun başlığına tıklayın ya da **Sırala**. Bağlanırken ve test sürerken liste yerinde kalır; test bitince yeniden sıralanır |
| Çalışanları / ölüleri yeniden tara | **Test et ▾** menüsü (seçilenler, görünenler, yeniler, çalışanlar, ölüler, hepsi) |
| Ölüleri temizle | **Sil ▾** → Kalıcı ölüleri / tüm ölüleri sil |
| Kendi proxy'lerinizi ekleyin | **İçe aktar** (`ip:port`, `socks5://ip:port`, `kullanıcı:şifre@ip:port`, `ip:port:kullanıcı:şifre`) |
| Kaynakları seçin | Sol menü → **Kaynaklar**: site başına aç/kapa ve **HTTP / SOCKS4 / SOCKS5** onay kutuları |
| Yeni liste sitesi ekleyin | **Kaynaklar** → URL ve tür girip **Kaynak ekle** |
| Dil | Sol alttaki **Dil** ya da **Ayarlar → Dil**: Türkçe, English veya *Otomatik* (varsayılan) |
| Otomatik geçiş | Bağlı proxy ölürse en iyi çalışan proxy'ye geçer |
| Çıkış IP'nizi görün | **IP'mi göster** |

Kısayollar (yönetici): çift tık = bağlan, `Enter` = seçiliye bağlan, `Del` = sil, `Ctrl+A` = tümünü seç,
`Shift/Ctrl+tık` = çoklu seçim.

## Kategoriler

Çalışan proxy'ler iki özelliğe göre ayrılır: **gizlilik düzeyi** ve **HTTPS desteği**. Gruplar
çakışmaz; toplamları "Çalışanlar" sayısına eşittir.

- **Elit + HTTPS** – En iyisi: her sitede çalışır, ne IP'niz ne de proxy kullandığınız anlaşılır.
- **Elit (yalnız HTTP)** – Elit, ama HTTPS sitelerde çalışmıyor (ya da HTTPS testi yapılmadı).
- **HTTPS (elit değil)** – HTTPS sitelerde çalışan anonim/şeffaf proxy'ler. HTTPS sitelerde bağlantı
  şifreli olduğundan IP'niz görünmez; `http://` sitelerde proxy (şeffafsa IP'niz) görünür.
- **Anonim (yalnız HTTP)** – IP'niz gizli ama proxy başlıkları (`Via`, `X-Forwarded-For`) gönderilir.
- **Şeffaf (yalnız HTTP)** – Gerçek IP'nizi sızdırır (gizlilik için kullanmayın).
- **Kalıcı ölü** – Art arda N kez başarısız oldu (Ayarlar'dan değiştirilebilir).

HTTPS sütunu HTTPS testinde ölçülen yanıt süresini gösterir. Popup "Elit+HTTPS" sekmesiyle açılır;
HTTPS'te çalışmayanlar "⚠ HTTPS sitelerde çalışmaz" uyarısıyla görünür.

## Nasıl çalışıyor?

Tarayıcı eklentileri ham TCP bağlantısı açamaz; testler tarayıcının kendi ağ katmanıyla yapılır:
eklenti tek bir **PAC betiği** kurar. Test isteği proxy'yi kurulum başına rastgele bir anahtarla
işaretlenmiş `TÜR~ip~port` olarak taşır ve PAC yalnızca o isteği o proxy'ye yönlendirir. Yüzlerce proxy
aynı anda, normal gezintiyi etkilemeden test edilir.

1. **HTTP testi** – `http://httpbin.org/get` proxy üzerinden istenir; dönen IP ve başlıklara göre
   çalışıp çalışmadığı, gizlilik düzeyi ve gecikmesi belirlenir. İçeriği değiştiren (reklam/sayfa
   enjekte eden) proxy'ler elenir.
2. **HTTPS testi** – Geçen her proxy (SOCKS dahil) üzerinden Cloudflare'e **iki ayrı** HTTPS bağlantısı
   açılır; ikisi de doğru çıkış IP'siyle dönmelidir, böylece kararsız proxy'ler elenir. Test adresi
   (`pxs…-<tür>-<ip>-<port>-….cloudflareaccess.com`) proxy'yi alan adında taşıdığından PAC değiştirilmeden
   tüm proxy'ler aynı anda test edilir. `tests/bench.mjs` ölçümü: testi geçen proxy'lerle gerçek siteler
   (Wikipedia, GitHub, Bing) **%83**, geçemeyenlerle **%7** oranında açıldı. Bağlanırken seçilen proxy
   HTTPS üzerinden yeniden doğrulanır; yanıt vermezse ve *Otomatik geçiş* açıksa sıradaki en iyi proxy denenir.
3. **Konum** – Her proxy'nin ülkesi eklentiye gömülü çevrimdışı IP → ülke veritabanından (DB-IP Lite)
   bulunur; bayraklar tüm proxy'lerde hemen görünür. Çalışanların şehri ve servis sağlayıcısı ip-api.com
   ile çıkış IP'sine göre sorgulanır. Windows bayrak emojilerini çizemediği için küçük bir bayrak fontu
   eklentiyle gelir.

Bağlıyken bütün trafik seçilen proxy'den geçer; proxy ölürse trafik doğrudan bağlantıya **düşmez**
(IP sızıntısı olmaz). Yerel ağ adresleri ve Ayarlar'daki istisna listesi doğrudan gider.

## Senkronizasyon (tüm tarayıcılarınızda aynı liste)

Bir tarayıcıda bulduğunuz liste diğer tarayıcılarınızda da görünür. **Ayarlar → Senkronizasyon**
bölümünden yönetilir.

**Ne taşınır?** Çalışan proxy'ler (test sonuçları ve ülkeleriyle), favoriler, kendi eklediğiniz
proxy'ler (kullanıcı adı/şifre dahil), kaynak seçimleri ve ayarlar. Binlerce ölü/test edilmemiş proxy
taşınmaz. Özet sıkıştırılır: 3.000 proxy ≈ 75 KB.

**Ne sıklıkla?** Her değişiklik ayrı yazılmaz: bir test bittiğinde ya da elle yapılan bir değişiklikten
(favori, içe aktarma, ayar, kaynak) 1 dakika sonra **tek seferde**, en fazla 2 dakikada bir. Yazmadan önce
uzaktaki daha yeni veri alınıp birleştirilir (alan bazında "son yazan kazanır"). Diğer cihazlar
değişikliği açılışta, Chrome senkronu geldiğinde ve 15 dakikada bir alır.

### Chrome senkronu (varsayılan, kurulum gerektirmez)

Chrome'a giriş yaptığınız Google hesabıyla (`chrome.storage.sync`) çalışır; aynı hesapla oturum açmış
tüm Chrome'larda liste kendiliğinden gelir. Yalnızca Chrome'lar arasında çalışır. Chrome'un senkron
ayarlarında **Uzantılar** açık olmalıdır.

### Google Drive senkronu (Chrome, Edge, Brave…)

Ayarlar → Senkronizasyon → **Google ile bağlan** → hesabınızı seçin. "…@gmail.com ile bağlı" yazar;
aynı hesapla bağlanan tüm tarayıcılarda liste aynıdır. Liste Drive'ınızda yalnızca bu eklentinin
erişebildiği gizli uygulama klasöründe tek dosyada tutulur (`drive.appdata`; diğer dosyalarınız
görülmez). Google erişim anahtarları 1 saat geçerlidir; eklenti bunları seçtiğiniz hesap için arka
planda sessizce yeniler.

### Geliştirici: Google girişini bir kez yapılandırma

> Bu depodaki `BUILTIN_CLIENT_ID` geliştiricinin kendi Google Cloud projesine aittir. Çatallayıp
> (fork) kendi sürümünüzü dağıtacaksanız aşağıdaki adımlarla kendi istemcinizi oluşturun.

Google, kayıtlı bir OAuth istemcisi olmadan hiçbir uygulamanın Drive'a erişmesine izin vermez.
Tampermonkey gibi eklentilerde bu istemciyi geliştirici bir kez oluşturup eklentiye gömer; ProxyScout'ta
da aynısı (~10 dk, bir kez):

1. <https://console.cloud.google.com> → **Yeni proje** (ör. "ProxyScout").
2. **API'ler ve Hizmetler → Kitaplık** → "Google Drive API" → **Etkinleştir**.
3. **Google Auth Platform → Branding / Audience**: uygulama adı **ProxyScout** (hesap seçme penceresinde
   "ProxyScout uygulamasına devam edin" diye görünür), destek e-postası, hedef kitle **Harici**.
   **Data Access**: `.../auth/drive.appdata`, `openid`, `.../auth/userinfo.email` (hepsi hassas olmayan).
4. **Clients → Create client** → tür **Web uygulaması** → **Yetkili yönlendirme URI'leri**:
   `https://<eklenti-kimliği>.chromiumapp.org/` (Ayarlar → Senkronizasyon → Gelişmiş'te **Kopyala** ile).
5. **İstemci kimliğini** (`…apps.googleusercontent.com`) `extension/lib/drive.js` içindeki
   `BUILTIN_CLIENT_ID` sabitine yazıp eklentiyi yenileyin. İstemci kimliği gizli değildir; istemci
   **gizli anahtarı** kullanılmaz ve eklentiye konmamalıdır.
6. Yayın durumu: **Test** modunda yalnızca listedeki test kullanıcıları (en fazla 100) giriş yapabilir.
   Herkes için **Uygulamayı yayınla** (Branding'e ana sayfa ve gizlilik politikası adresi gerekir);
   kapsamlar hassas olmadığından ayrıca doğrulama gerekmemeli.

Kullanıcılar kendi istemcilerini **Ayarlar → Senkronizasyon → Gelişmiş** bölümünden de girebilir.

### Eklenti kimliği hakkında

Senkronun çalışması için eklenti kimliği her bilgisayarda aynı olmalıdır; bu yüzden `manifest.json`
içinde sabit bir `key` vardır (geliştirme kimliği: `bbhjnmkfdcibcmeikpmpcobfkiajfklc`). Mağazalar kendi
kimliklerini verir ve `key` alanını kabul etmez — `npm run build` mağaza paketinden çıkarır. Eklentiyi
paketlemek için gereken özel anahtar (`extension-key.pem`) depoda **yoktur**; gizli tutun.

## Sınırlamalar

- Ücretsiz/açık proxy'ler güvenilir değildir: şifresiz (`http://`) trafiğinizi görebilir veya
  değiştirebilirler. Şifre girdiğiniz ya da hassas işlem yaptığınız sitelerde kullanmayın. HTTPS siteler
  uçtan uca şifreli kalır.
- Chrome/Edge, SOCKS5 proxy'lerde kullanıcı adı/şifreyi desteklemez (HTTP proxy'lerde destekler);
  Firefox ikisini de destekler.
- Desteklenen tarayıcılar: Chromium tabanlılar (Chrome, Edge, Brave, Opera, Vivaldi) ve Firefox 140+.
  Proxy ayarını aynı anda tek bir eklenti kontrol edebilir; başka bir proxy/VPN eklentisi varsa devre dışı bırakın.
- Firefox: kullanıcı adı/şifreli özel proxy eklediyseniz bu bilgiler, isteğe bağlı "kimlik doğrulama
  bilgisi" veri iznini verdikten sonra senkronlanır (Ayarlar → Senkronizasyon → **Şimdi senkronize et**).
  Firefox senkronu Mozilla hesabınızla çalışır ve yalnızca Firefox'lar arasındadır.
- Bağlıyken liste indirme (HTTPS kaynaklar) aktif proxy üzerinden yapılır.
- Şehir ve ISP yalnızca çalışan proxy'ler için sorgulanır (ip-api.com ücretsiz sürümü dakikada 15 toplu sorgu).
- Gömülü ülke veritabanı aylık güncellenir; yenilemek için `node tools/build-geo.mjs`.
- Senkronda silme işlemleri taşınmaz: bir cihazda silinen çalışan proxy başka cihazdan geri gelebilir
  (favoriden çıkarma ise taşınır).

## Yayın ve otomatik dağıtım

`main` dalına gelen her değişiklikte GitHub Actions testleri çalıştırır
([`.github/workflows/release.yml`](.github/workflows/release.yml)). `extension/manifest.json` içindeki
sürüm için henüz `vX.Y.Z` etiketi yoksa ayrıca:

1. mağaza paketleri üretilir (`npm run build` → Chrome/Edge için `dist/proxyscout-<sürüm>.zip`, Firefox
   için `dist/proxyscout-firefox-<sürüm>.zip`),
2. GitHub Release oluşturulur ve iki paket eklenir,
3. paketler **Chrome Web Store**, **Edge Add-ons** ve **Firefox Add-ons**'a yüklenip incelemeye gönderilir.

Bir düzeltmeyi yayınlamak için sürümü artırıp gönderin:

```
npm run bump            # 1.2.1 → 1.2.2  (minor / major / 1.3.0 de verilebilir)
git commit -am "Sürüm 1.2.2"
git push
```

Sürüm artırılmadan yapılan gönderimlerde yalnızca testler çalışır.

Mağaza gizli değerlerini hiçbir şey yüklemeden sınamak için: **Actions → Release → Run workflow →
"Yalnızca mağaza anahtarlarını sına"**.

### Bir kerelik mağaza kurulumu

Mağaza açıklamaları, izin gerekçeleri ve görseller (TR/EN): [`store/LISTING.md`](store/LISTING.md) ve
[`store/`](store) klasörü.

Her iki mağazada da **ilk sürüm panelden elle yüklenir** (`npm run build` ile üretilen ya da
[Releases](https://github.com/Halil-KAPLAN/ProxyScout/releases/latest) sayfasındaki zip); sonraki
sürümleri iş akışı gönderir. Gizli anahtarlar **Settings → Secrets and variables → Actions** altına
eklenir; anahtarı olmayan mağaza atlanır.

**Chrome Web Store** (tek seferlik 5 USD geliştirici kaydı, 2 adımlı doğrulama şart)

1. <https://chrome.google.com/webstore/devconsole> → **Yeni öğe** → zip'i yükleyin; mağaza girişi,
   ekran görüntüleri ve **Gizlilik** sekmesini doldurun (gizlilik politikası:
   `https://github.com/Halil-KAPLAN/ProxyScout/blob/main/PRIVACY.md`) → incelemeye gönderin.
2. Öğe kimliği → `CWS_EXTENSION_ID`, yayıncı kimliği (Hesap sayfası) → `CWS_PUBLISHER_ID`.
3. Google Cloud'da "Chrome Web Store API"yi etkinleştirip bir OAuth istemcisi (Web uygulaması,
   yönlendirme `https://developers.google.com/oauthplayground`) oluşturun → `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`.
4. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)'da kendi istemcinizle
   `https://www.googleapis.com/auth/chromewebstore` kapsamına yetki verin; **refresh token** → `CWS_REFRESH_TOKEN`.

**Microsoft Edge Add-ons** (ücretsiz)

1. <https://partner.microsoft.com/dashboard/microsoftedge> → **Yeni uzantı oluştur** → zip'i yükleyip
   bilgileri doldurun → gönderin.
2. Uzantının **Ürün kimliği** → `EDGE_PRODUCT_ID`.
3. **Publish API** → **API kimlik bilgileri oluştur** → `EDGE_CLIENT_ID`, `EDGE_API_KEY` (API anahtarlarının
   son kullanma tarihi vardır; yenilendiğinde gizli anahtarı güncelleyin).

**Firefox Add-ons** (ücretsiz)

1. <https://addons.mozilla.org/developers/> → **Submit a New Add-on** → *On this site* →
   `dist/proxyscout-firefox-<sürüm>.zip` yüklenir. Kaynak kod yüklemek gerekmez (kod küçültülmüş ya da
   paketlenmiş değildir). Mağaza bilgileri doldurulup gönderilir.
2. **Tools → Manage API Keys** → kimlik bilgisi üretin → JWT issuer → `AMO_JWT_ISSUER`, JWT secret →
   `AMO_JWT_SECRET`.
3. Firefox eklenti kimliği pakette sabittir (`proxyscout@halil-kaplan.github.io`); değiştirmeyin, yoksa
   güncellemeler yeni bir eklenti sayılır.

**Mağaza kimlikleri ve Google girişi:** Mağazalar eklentiye kendi kimliğini verir. Google Drive
senkronunun mağaza sürümlerinde çalışması için OAuth istemcisine (**Google Auth Platform → Clients →
ProxyScout Extension**) iki yönlendirme adresi daha ekleyin: `https://<chrome-mağaza-kimliği>.chromiumapp.org/`
ve `https://<edge-mağaza-kimliği>.chromiumapp.org/`. Firefox eklenti kimliğinden türeyen
`https://<hash>.extensions.allizom.org/` adresini kullanır; tam adres Ayarlar → Senkronizasyon'da görünür.
Mağazalar yayına girince "Kurulum" tablosundaki bağlantıları güncelleyin.

## Geliştirme

Derleme adımı yoktur; dosyaları düzenleyip `chrome://extensions` sayfasında eklentiyi yenilemeniz yeterli.
Klasör yapısı ve araçlar için [İngilizce README → Development](README.md#development) bölümüne bakın.

Firefox paketi aynı dosyalardan `npm run build` ile üretilir (`dist/firefox/`): Manifest V2 ve kalıcı
arka plan sayfası. Böylece `proxy.onRequest` dinleyicisi hiç uyumaz ve bağlıyken trafik proxy'yi atlayıp
gerçek IP'yi sızdıramaz.

```
npm test                 # birim testleri (node --test)
npm run build            # dist/proxyscout-<sürüm>.zip, dist/proxyscout-firefox-<sürüm>.zip, dist/firefox/
node tests/e2e.mjs <puppeteer klasörü> [ekran görüntüsü klasörü]
node tests/e2e-firefox.mjs <selenium-webdriver klasörü> [ekran görüntüsü klasörü] [firefox.exe]
```

## Gizlilik

ProxyScout'un sunucusu yoktur ve geliştiriciye hiçbir kişisel veri göndermez. Bkz. [PRIVACY.md](PRIVACY.md).

## Lisans

[GPL-3.0](LICENSE) © Halil KAPLAN

Üçüncü taraf veri ve varlıklar:

- IP → ülke verisi: [IP Geolocation by DB-IP](https://db-ip.com) — "IP to Country Lite", CC-BY 4.0.
- Bayrak fontu (`extension/fonts/TwemojiCountryFlags.woff2`):
  [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill) (MIT); bayrak
  çizimleri [Twemoji](https://github.com/twitter/twemoji) — CC-BY 4.0.
