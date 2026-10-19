# ProxyScout — Proxy Bulucu ve Değiştirici (Chrome / Edge eklentisi)

[![Release](https://github.com/Halil-KAPLAN/ProxyScout/actions/workflows/release.yml/badge.svg)](https://github.com/Halil-KAPLAN/ProxyScout/actions/workflows/release.yml)
[![Sürüm](https://img.shields.io/github/v/release/Halil-KAPLAN/ProxyScout)](https://github.com/Halil-KAPLAN/ProxyScout/releases/latest)
[![Lisans: GPL-3.0](https://img.shields.io/badge/lisans-GPL--3.0-blue.svg)](LICENSE)

Proxy Switcher benzeri bir tarayıcı eklentisi. Ücretsiz proxy listelerini onlarca siteden indirir,
hepsini test eder, çalışanları **Elit + HTTPS / Elit / Anonim / Şeffaf** gibi kategorilere,
çalışmayanları **Ölüler / Kalıcı ölü** kategorisine ayırır. Listeden bir proxy'ye tıklayınca tüm
tarayıcı trafiği o proxy üzerinden geçer; tek tıkla kapatıp açabilirsiniz.

## Kurulum

### Mağazalardan (önerilen)

| Tarayıcı | Bağlantı |
| --- | --- |
| Chrome, Brave, Opera, Vivaldi | **Chrome Web Store** — _yayın onayı bekleniyor_ <!-- CWS_LINK --> |
| Microsoft Edge | **Edge Add-ons** — _yayın onayı bekleniyor_ <!-- EDGE_LINK --> |

### GitHub'dan (geliştirici modu)

1. [Son sürümün](https://github.com/Halil-KAPLAN/ProxyScout/releases/latest) `proxyscout-x.y.z.zip`
   dosyasını indirip bir klasöre açın (ya da depoyu klonlayıp `extension` klasörünü kullanın).
2. Chrome'da `chrome://extensions` (Edge'de `edge://extensions`) adresini açın.
3. Sağ üstten **Geliştirici modu**nu açın.
4. **Paketlenmemiş öğe yükle** → açtığınız klasörü (ya da `extension` klasörünü) seçin.
5. Araç çubuğundaki yapboz simgesinden ProxyScout'u sabitleyin.

İlk kurulumda yönetici sayfası otomatik açılır.

## Kullanım

| İşlem | Nerede |
| --- | --- |
| Listeleri indir ve test et | Popup veya yönetici → **Listeleri indir ve test et** |
| Proxy'ye bağlan | Popup'ta proxy'ye tıklayın, yönetici sayfasında satıra **çift tıklayın** veya **Bağlan**. Bağlantı doğrulanırken satırda ve üst çubukta dönen bir **Bağlanıyor** göstergesi çıkar; sonuç (gecikme ya da hata) bildirim olarak gösterilir |
| Proxy'yi aç / kapat | Tek bir anahtar: yönetici sayfasında bağlantı kartının içinde, popup'ta üstte. Rengi durumu gösterir (yeşil bağlı, turuncu bağlanıyor, kırmızı yanıt yok); kapatmak bağlanmayı da iptal eder |
| Listeyi sırala | Sütun başlığına tıklayın ya da sağdaki **Sırala** düğmesine basın. Bağlanırken ve test sürerken liste yerinde kalır; test bitince yeniden sıralanır |
| Çalışanları / ölüleri yeniden tara | **Test et ▾** menüsü (seçilenler, görünenler, yeniler, çalışanlar, ölüler, hepsi) |
| Ölüleri temizle | **Sil ▾** → Kalıcı ölüleri / tüm ölüleri sil |
| Kendi proxy'lerinizi ekleyin | **İçe aktar** (`ip:port`, `socks5://ip:port`, `kullanıcı:şifre@ip:port`, `ip:port:kullanıcı:şifre`) |
| Kaynakları seçin | Sol menü → **Kaynaklar**: her site tek satırdır; aç/kapa anahtarı ve **HTTP / SOCKS4 / SOCKS5** onay kutularıyla hangi türlerin indirileceğini seçin |
| Yeni liste sitesi ekleyin | **Kaynaklar** → URL ve tür girip **Kaynak ekle** |
| Dil | Sol alttaki **Dil** seçimi veya **Ayarlar → Dil**: Türkçe, English ya da *Otomatik* (tarayıcının dili; varsayılan) |
| Otomatik geçiş | Bağlı proxy ölürse en iyi çalışan proxy'ye kendiliğinden geçer (Proxy Switcher'daki *Auto Switch*) |
| Çıkış IP'nizi görün | **IP'mi göster** |

Kısayollar (yönetici): çift tık = bağlan, `Enter` = seçiliye bağlan, `Del` = sil, `Ctrl+A` = tümünü seç, `Shift/Ctrl+tık` = çoklu seçim.

## Kategoriler

Çalışan proxy'ler iki özelliğe göre ayrılır: **gizlilik düzeyi** ve **HTTPS desteği**. Alt
kategoriler birbiriyle çakışmaz; her proxy tam olarak birinde yer alır ve toplamları
"Çalışanlar" sayısına eşittir.

- **Elit + HTTPS** – En iyisi: her sitede çalışır, ne IP'niz ne de proxy kullandığınız anlaşılır.
- **Elit (yalnız HTTP)** – Elit, ama HTTPS sitelerde çalışmıyor (ya da HTTPS testi yapılmadı).
- **HTTPS (elit değil)** – HTTPS sitelerde çalışan anonim/şeffaf proxy'ler. HTTPS sitelerde
  bağlantı şifreli olduğundan IP'niz görünmez; `http://` sitelerde proxy (şeffafsa IP'niz) görünür.
- **Anonim (yalnız HTTP)** – IP'niz gizli ama proxy başlıkları (`Via`, `X-Forwarded-For`) gönderilir.
- **Şeffaf (yalnız HTTP)** – Gerçek IP'nizi sızdırır (gizlilik için kullanmayın).
- **Kalıcı ölü** – Art arda N kez başarısız oldu (Ayarlar'dan değiştirilebilir).

"HTTPS" içeren gruplar yalnızca **gerçek site testini** geçen proxy'leri içerir (aşağıya bakın);
tablodaki HTTPS sütunu bu testte ölçülen yanıt süresini gösterir. Popup varsayılan olarak
"Elit+HTTPS" sekmesiyle açılır; HTTPS'te çalışmayanlar "⚠ HTTPS sitelerde çalışmaz" uyarısıyla görünür.

## Nasıl çalışıyor?

Tarayıcı eklentileri ham TCP bağlantısı açamaz. Bu yüzden testler tarayıcının kendi ağ katmanıyla
yapılır: eklenti tek bir **PAC betiği** kurar. Test isteğinin URL'sinde rastgele bir anahtarla
işaretlenmiş `TÜR~ip~port` bilgisi bulunur ve PAC o isteği yalnızca o proxy'ye yönlendirir. Böylece
yüzlerce proxy aynı anda, normal gezintinizi etkilemeden test edilir.

1. **HTTP testi** – `http://httpbin.org/get` proxy üzerinden istenir; yanıttaki IP ve başlıklara
   göre çalışıyor mu, gizlilik düzeyi nedir, gecikme ne kadar belirlenir. İçeriği değiştiren
   (reklam/sayfa enjekte eden) proxy'ler elenir.
2. **HTTPS testi** – HTTP testini geçen her proxy (SOCKS dahil) üzerinden Cloudflare'e **iki ayrı**
   HTTPS bağlantısı açılır; ikisi de doğru çıkış IP'siyle dönmelidir. Bir an çalışıp bir an düşen
   kararsız proxy'ler böylece elenir. Test adresi (`pxs…-<tür>-<ip>-<port>-….cloudflareaccess.com`)
   proxy bilgisini alan adında taşıdığı için PAC hiç değiştirilmeden tüm proxy'ler aynı anda test
   edilir. Ölçüm (`tests/bench.mjs`): bu testi geçen proxy'lerle gerçek siteler (Wikipedia, GitHub,
   Bing) **%83**, geçemeyenlerle **%7** oranında açıldı. Bağlanırken seçilen proxy HTTPS üzerinden
   yeniden doğrulanır; yanıt vermezse ve *Otomatik geçiş* açıksa sıradaki en iyi proxy denenir.
3. **Konum** – Her proxy'nin ülkesi indirildiği anda eklentiye gömülü çevrimdışı IP → ülke
   veritabanından (DB-IP Lite) bulunur; test beklemeden, ölü ve yeni proxy'ler dahil hepsi
   bayrağıyla görünür. Çalışan proxy'lerin şehri ve servis sağlayıcısı ayrıca ip-api.com ile
   sorgulanır (bu sorgu çıkış IP'sine göre yapıldığından ülke daha kesin olur). Windows bayrak
   emojilerini çizemediği için eklenti küçük bir bayrak fontu içerir.

Bağlıyken bütün trafik seçilen proxy'den geçer; proxy ölürse trafik doğrudan bağlantıya
**düşmez** (IP sızıntısı olmaz). Yerel ağ adresleri ve Ayarlar'daki istisna listesi doğrudan gider.

## Senkronizasyon (tüm tarayıcılarınızda aynı liste)

Bir tarayıcıda bulduğunuz liste diğer tarayıcılarınızda da görünür; her birinde yeniden liste
aramanız gerekmez. **Ayarlar → Senkronizasyon** bölümünden yönetilir.

**Ne taşınır?** Çalışan proxy'ler (test sonuçları ve ülkeleriyle), favoriler, kendi eklediğiniz
proxy'ler (kullanıcı adı/şifre dahil), kaynak seçimleri ve ayarlar. Binlerce ölü/test edilmemiş
proxy taşınmaz; onlar her cihazda yeniden indirilebilir. Özet sıkıştırılır: 3.000 proxy ≈ 75 KB.

**Ne sıklıkla?** Her IP değişikliği ayrı ayrı yazılmaz. Bir test bittiğinde ya da elle yapılan bir
değişiklikten (favori, içe aktarma, ayar, kaynak) 1 dakika sonra **tek seferde**, en fazla 2
dakikada bir yazılır; günde birkaç düzine yazma, iki yöntemin sınırlarının da çok altındadır.
Yazmadan önce uzaktaki daha yeni veri alınır ve birleştirilir (alan bazında "son yazan kazanır").
Diğer cihazlar değişikliği açılışta, Chrome senkronu geldiğinde ve 15 dakikada bir alır.

### Chrome senkronu (varsayılan, kurulum gerektirmez)

Chrome'a giriş yaptığınız Google hesabıyla (`chrome.storage.sync`) çalışır. Aynı hesapla
oturum açmış tüm Chrome'larda — farklı bilgisayarlar dahil — liste kendiliğinden gelir.
Yalnızca Chrome'lar arasında çalışır (Edge kendi hesabıyla kendi arasında senkronize olur).
Chrome'un senkron ayarlarında **Uzantılar** açık olmalıdır.

### Google Drive senkronu (Chrome, Edge, Brave… hepsinde)

**Kullanıcı için:** Ayarlar → Senkronizasyon → **Google ile bağlan** → açılan pencerede Google
hesabınızı seçin. Hepsi bu. Bağlandıktan sonra "…@gmail.com ile bağlı" yazar; aynı hesapla
bağlanan tüm tarayıcılarda liste aynıdır. Liste Drive'ınızda görünmeyen, yalnızca bu eklentinin
erişebildiği gizli uygulama klasöründe tek bir dosyada tutulur (`drive.appdata` izni; diğer
dosyalarınız görülmez). Google erişim anahtarları 1 saat geçerlidir; eklenti bunları seçtiğiniz
hesap için arka planda sessizce yeniler.

### Geliştirici: Google girişini bir kez yapılandırma

> Bu depodaki `BUILTIN_CLIENT_ID` geliştiricinin kendi Google Cloud projesine aittir. Çatallayıp
> (fork) kendi sürümünüzü dağıtacaksanız aşağıdaki adımlarla kendi istemcinizi oluşturun.

## Yayın ve otomatik dağıtım

`main` dalına gelen her değişiklikte GitHub Actions testleri çalıştırır
([`.github/workflows/release.yml`](.github/workflows/release.yml)). `extension/manifest.json`
içindeki sürüm için henüz bir `v1.2.3` etiketi yoksa ayrıca:

1. mağaza paketi üretilir (`npm run build` → `dist/proxyscout-<sürüm>.zip`; manifestteki `key`
   alanı mağazalar kabul etmediği için pakette çıkarılır),
2. GitHub Release oluşturulur ve paket eklenir,
3. paket **Chrome Web Store**'a ve **Edge Add-ons**'a yüklenip incelemeye gönderilir.

Yeni bir düzeltmeyi yayınlamak için sürümü artırıp gönderin:

```
npm run bump            # 1.2.0 → 1.2.1  (minor / major / 1.3.0 de verilebilir)
git commit -am "Sürüm 1.2.1"
git push
```

Sürüm artırılmadan yapılan gönderimlerde yalnızca testler çalışır; mağazalara yükleme yapılmaz.

### Bir kerelik mağaza kurulumu

Her iki mağazada da **ilk sürüm panelden elle yüklenir** (`npm run build` ile üretilen zip);
sonraki sürümleri iş akışı otomatik gönderir. Gerekli gizli anahtarlar GitHub'da
**Settings → Secrets and variables → Actions** altına eklenir. Anahtarlar yoksa o mağaza atlanır.

**Chrome Web Store** (tek seferlik 5 USD geliştirici kaydı, Google hesabında 2 adımlı doğrulama şart)

1. <https://chrome.google.com/webstore/devconsole> → **Yeni öğe** → zip'i yükleyin; mağaza girişi,
   ekran görüntüleri ve **Gizlilik** sekmesini doldurun (gizlilik politikası:
   `https://github.com/Halil-KAPLAN/ProxyScout/blob/main/PRIVACY.md`) → incelemeye gönderin.
2. Panodaki **öğe kimliği** → `CWS_EXTENSION_ID`, **yayıncı kimliği** (Hesap sayfası) → `CWS_PUBLISHER_ID`.
3. Google Cloud'da "Chrome Web Store API"yi etkinleştirip bir OAuth istemcisi (Web uygulaması,
   yönlendirme: `https://developers.google.com/oauthplayground`) oluşturun →
   `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`.
4. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)'da kendi istemcinizi seçip
   `https://www.googleapis.com/auth/chromewebstore` kapsamıyla yetki verin; çıkan
   **refresh token** → `CWS_REFRESH_TOKEN`.

**Microsoft Edge Add-ons** (ücretsiz)

1. <https://partner.microsoft.com/dashboard/microsoftedge> → **Yeni uzantı oluştur** → zip'i yükleyip
   bilgileri doldurun → gönderin.
2. Uzantının **Ürün kimliği** → `EDGE_PRODUCT_ID`.
3. **Publish API** sayfasında **API kimlik bilgileri oluştur** → `EDGE_CLIENT_ID`, `EDGE_API_KEY`
   (API anahtarlarının bir son kullanma tarihi vardır; yenilendiğinde gizli anahtarı güncelleyin).

**Mağaza kimlikleri ve Google girişi:** Mağazalar eklentiye kendi kimliğini verir. Google Drive
senkronunun mağaza sürümlerinde de çalışması için Google Cloud'daki OAuth istemcisine
(**Google Auth Platform → Clients → ProxyScout Extension**) iki yönlendirme adresi daha ekleyin:
`https://<chrome-mağaza-kimliği>.chromiumapp.org/` ve `https://<edge-mağaza-kimliği>.chromiumapp.org/`.
Mağazalar yayına girdiğinde yukarıdaki "Kurulum" tablosundaki bağlantıları güncelleyin.
