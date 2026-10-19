# Mağaza girişi metinleri / Store listing copy

Chrome Web Store ve Microsoft Edge Add-ons formlarına kopyalanacak metinler. Görseller bu klasörde:

| Dosya | Nerede kullanılır |
| --- | --- |
| `screenshots/tr/*.png`, `screenshots/en/*.png` (1280×800) | Ekran görüntüleri (CWS: en fazla 5, Edge: en fazla 10) |
| `promo/small-440x280-*.png` | CWS **Small promo tile** (zorunlu) · Edge **Small promotional tile** |
| `promo/marquee-1400x560-*.png` | CWS **Marquee promo tile** · Edge **Large promotional tile** (isteğe bağlı) |
| `logo-300.png` | Edge **Store logo** (300×300) |
| `../extension/icons/brand128.png` | CWS **Store icon** (128×128) |

Görselleri yeniden üretmek için: `node tools/store-assets.mjs <puppeteer klasörü>`

---

## Ortak bilgiler / Common fields

- **Ad / Name:** ProxyScout — Proxy Finder & Switcher (TR: ProxyScout — Proxy Bulucu ve Değiştirici)
- **Kategori / Category:** Chrome Web Store → *Tools* (Araçlar) · Edge → *Productivity*
- **Dil / Language:** English (varsayılan) + Türkçe (`_locales` ile otomatik)
- **Web sitesi / Homepage:** https://github.com/Halil-KAPLAN/ProxyScout
- **Destek / Support:** https://github.com/Halil-KAPLAN/ProxyScout/issues
- **Gizlilik politikası / Privacy policy:** https://github.com/Halil-KAPLAN/ProxyScout/blob/main/PRIVACY.md
- **Fiyat / Price:** Ücretsiz / Free · **Görünürlük / Visibility:** Public

---

## Türkçe

### Kısa açıklama (≤ 132 karakter — manifestten otomatik gelir)

> Ücretsiz proxy listelerini indirir, test eder, çalışanları ayıklar ve tek tıkla tarayıcı trafiğini seçtiğiniz proxy'ye yönlendirir.

### Ayrıntılı açıklama

```
ProxyScout, onlarca kaynaktan ücretsiz proxy listelerini indirir, her birini gerçekten test eder ve yalnızca çalışanları önünüze koyar. Listeden bir proxy'ye tıklayın; tüm tarayıcı trafiğiniz o proxy üzerinden geçsin. Tek tıkla kapatın, doğrudan bağlantıya dönün.

■ GERÇEKTEN ÇALIŞANLARI AYIKLAR
• 21 hazır kaynak (ProxyScrape, free-proxy-list.net, Spys.me, monosans, TheSpeedX…) — her kaynakta HTTP / SOCKS4 / SOCKS5 türlerini ayrı ayrı seçin, kendi liste adreslerinizi ekleyin.
• Her proxy önce HTTP, sonra iki ayrı HTTPS bağlantısıyla test edilir. Yalnızca küçük bir test sayfasını açabilen ama gerçek siteleri açamayan proxy'ler elenir.
• Yüzlerce proxy aynı anda test edilir; bağlanırken seçtiğiniz proxy yeniden doğrulanır.

■ GİZLİLİK DÜZEYİNE GÖRE KATEGORİLER
• Elit + HTTPS · Elit · HTTPS (elit değil) · Anonim · Şeffaf — her proxy tek bir grupta.
• Elit: ne IP'niz ne de proxy kullandığınız anlaşılır. Şeffaf: gerçek IP'nizi sızdırır (uyarıyla gösterilir).
• Ölüler ve kalıcı ölüler ayrı listede; tek tıkla temizleyin.

■ TEK TIKLA BAĞLAN
• Popup'tan ya da yönetici sayfasında çift tıklayarak bağlanın; tek anahtarla açıp kapatın.
• Araç çubuğu ikonu durumu gösterir: yeşil bağlı, turuncu bağlanıyor, kırmızı yanıt yok, gri kapalı.
• Otomatik geçiş: bağlı proxy ölürse en iyi çalışan proxy'ye kendiliğinden geçer.
• Yerel ağ adresleri ve sizin belirlediğiniz alan adları proxy'yi atlar.

■ ÜLKE, ŞEHİR VE BAYRAK
• Her proxy'nin ülkesi indirildiği anda bayrağıyla görünür (çevrimdışı veritabanı); çalışanların şehri ve servis sağlayıcısı da gösterilir.
• Ülkeye, türe ve gizlilik düzeyine göre filtreleyin; yanıt süresine göre sıralayın.

■ TÜM TARAYICILARINIZDA AYNI LİSTE
• Chrome senkronu: kurulum gerektirmez.
• Google Drive: "Google ile bağlan" deyin; liste Drive'ınızda yalnızca eklentinin erişebildiği gizli bir klasörde tutulur — Chrome, Edge, Brave… hepsinde aynı liste.

■ DİĞER
• Türkçe ve İngilizce arayüz (tarayıcı diline göre otomatik).
• Kendi proxy'lerinizi içe aktarın (kullanıcı adı/şifreli HTTP proxy'ler dahil), listeyi kopyalayın.
• Reklam yok, izleme yok, hesap gerekmez. Açık kaynak (GPL-3.0): https://github.com/Halil-KAPLAN/ProxyScout

⚠ ÖNEMLİ: Ücretsiz/açık proxy'ler üçüncü kişilerce işletilir ve güvenilir değildir. Bağlıyken şifrelenmemiş (http://) trafiğinizi görebilir veya değiştirebilirler; HTTPS sitelerin içeriği şifreli kalır. Şifre girdiğiniz ya da hassas işlem yaptığınız sitelerde ücretsiz proxy kullanmayın.
```

---

## English

### Short description (≤ 132 characters — comes from the manifest)

> Downloads free proxy lists, tests them over HTTP and HTTPS and routes your browser through a working proxy in one click.

### Detailed description

```
ProxyScout downloads free proxy lists from dozens of sources, really tests every proxy and shows you only the ones that work. Click a proxy and all your browser traffic goes through it. One click to turn it off and go back to a direct connection.

■ KEEPS ONLY THE PROXIES THAT REALLY WORK
• 21 built-in sources (ProxyScrape, free-proxy-list.net, Spys.me, monosans, TheSpeedX…) — pick HTTP / SOCKS4 / SOCKS5 per source and add your own list URLs.
• Every proxy is tested over HTTP, then with two separate HTTPS connections. Proxies that can load a tiny test page but fail on real websites are filtered out.
• Hundreds of proxies are tested in parallel; the proxy you pick is verified again when you connect.

■ SORTED BY ANONYMITY LEVEL
• Elite + HTTPS · Elite · HTTPS (not elite) · Anonymous · Transparent — each proxy in exactly one group.
• Elite: neither your IP nor the fact that you use a proxy is revealed. Transparent: leaks your real IP (clearly marked).
• Dead and permanently dead proxies are kept separately; clean them up in one click.

■ ONE-CLICK CONNECT
• Connect from the popup or by double-clicking in the manager; one switch turns it on and off.
• The toolbar icon shows the state: green connected, amber connecting, red not responding, grey off.
• Auto switch: if the connected proxy dies, ProxyScout switches to the best working one.
• Local network addresses and domains you choose bypass the proxy.

■ COUNTRY, CITY AND FLAGS
• Every proxy shows its country flag as soon as it is downloaded (offline database); working ones also show city and ISP.
• Filter by country, type and anonymity; sort by response time.

■ THE SAME LIST IN ALL YOUR BROWSERS
• Chrome sync: no setup needed.
• Google Drive: click "Sign in with Google"; the list is kept in a hidden app folder in your Drive that only the extension can access — the same list in Chrome, Edge, Brave…

■ MORE
• English and Turkish interface (follows your browser language).
• Import your own proxies (including HTTP proxies with username/password) and copy lists.
• No ads, no tracking, no account required. Open source (GPL-3.0): https://github.com/Halil-KAPLAN/ProxyScout

⚠ IMPORTANT: Free/public proxies are run by third parties and are not trustworthy. While connected they can see or modify unencrypted (http://) traffic; the content of HTTPS sites stays encrypted. Do not use free proxies for logins or sensitive tasks.
```

---

## İnceleme formu / Review form answers

### Tek amaç / Single purpose

> ProxyScout finds working free proxy servers (downloads public proxy lists, tests them) and lets the user route the browser's traffic through a selected proxy, or turn the proxy off.

### İzin gerekçeleri / Permission justifications

| İzin / Permission | Gerekçe / Justification |
| --- | --- |
| `proxy` | Core feature: applies the user-selected proxy to the browser (PAC script) and turns it off again. Also used to route individual test requests to the proxy being tested. |
| `storage`, `unlimitedStorage` | Stores the proxy list (thousands of entries), test results, favorites and settings locally. |
| `alarms` | Periodically checks whether the connected proxy still works (auto switch) and schedules sync. |
| `webRequest`, `webRequestAuthProvider` | Supplies the username/password of private HTTP proxies the user adds when the proxy asks for authentication (`onAuthRequired`). Requests are not read, logged or modified. |
| `identity` | Optional Google Drive sync: `launchWebAuthFlow` to let the user sign in with Google (scope: `drive.appdata` + email). |
| Host permission `<all_urls>` | Downloads proxy lists from any list website the user enables or adds, and sends test requests through the proxies (test endpoints: httpbin.org, Cloudflare, ip-api.com, ipify). The extension does not inject scripts into or read the content of web pages. |

### Uzaktan kod / Remote code

> No. All code is included in the package. The PAC script is generated locally by the extension.

### Veri kullanımı / Data usage (Chrome Web Store → Privacy practices)

İşaretlenecekler / Check:
- **Authentication information** — usernames/passwords of private proxies the user adds (stored locally; included in the user's own sync storage if sync is on).
- **Personally identifiable information** — only the e-mail address of the Google account, shown as "Connected as …", when the user turns on Google Drive sync.

Hepsini onaylayın / Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Edge — sertifikasyon notu / Notes for certification

```
No account or login is needed. To test: open the extension popup → "Download & test" (takes 1–3 minutes), then click any proxy in the "Elite+HTTPS" tab to connect; use the switch at the top to turn it off. The full manager opens with the "Manager" button. Google Drive sync (Settings → Sync → Sign in with Google) is optional. Source code: https://github.com/Halil-KAPLAN/ProxyScout
```
