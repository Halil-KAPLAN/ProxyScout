// Yalnızca Firefox paketinde, sayfanın modüllerinden önce klasik betik olarak yüklenir (tools/build-zip.mjs ekler).
// Firefox'un Manifest V2'sinde chrome.* API'leri Promise döndürmez (geri çağırma ister); aynı API'lerin Promise
// döndüren hâli browser.* altındadır. Kodun geri kalanı "await chrome.…" kullandığı için chrome, browser'a eşlenir.
if (typeof browser !== 'undefined' && globalThis.chrome !== browser) {
  Object.defineProperty(globalThis, 'chrome', { value: browser, configurable: true, writable: true });
}
