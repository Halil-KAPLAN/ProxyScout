// Site testi: test sırasında çalışan proxy'lerin bu sitelere gerçekten ulaşıp ulaşmadığı ve ne kadar sürede
// yanıt aldığı ölçülür (arka plan: background.js sitesPhase). Kullanıcının seçtiği siteler ayarlarda URL listesi
// olarak tutulur (settings.sites); böylece senkronla diğer tarayıcılara da taşınır. Hazır siteler aşağıdadır,
// listede olmayan her URL kullanıcının eklediği sitedir.

export const BUILTIN_SITES = [
  { url: 'https://www.youtube.com/', name: 'YouTube', short: 'YT', on: true },
  { url: 'https://discord.com/', name: 'Discord', short: 'DC', on: true },
  { url: 'https://www.google.com/', name: 'Google', short: 'G', on: true },
  { url: 'https://www.instagram.com/', name: 'Instagram', short: 'IG', on: true },
  { url: 'https://x.com/', name: 'X (Twitter)', short: 'X', on: true },
  { url: 'https://www.netflix.com/', name: 'Netflix', short: 'NF' },
  { url: 'https://chatgpt.com/', name: 'ChatGPT', short: 'GPT' },
  { url: 'https://open.spotify.com/', name: 'Spotify', short: 'SP' },
  { url: 'https://web.whatsapp.com/', name: 'WhatsApp Web', short: 'WA' },
  { url: 'https://web.telegram.org/', name: 'Telegram Web', short: 'TG' },
  { url: 'https://www.twitch.tv/', name: 'Twitch', short: 'TW' },
  { url: 'https://www.reddit.com/', name: 'Reddit', short: 'RD' },
  { url: 'https://www.tiktok.com/', name: 'TikTok', short: 'TT' },
  { url: 'https://www.wikipedia.org/', name: 'Wikipedia', short: 'W' },
];

export const DEFAULT_SITES = BUILTIN_SITES.filter((s) => s.on).map((s) => s.url);

// Kullanıcının yazdığı adresi test edilebilir bir URL'ye çevirir ("discord.com", "https://x.com/home" …).
// Geçersizse null. Yerel/özel adresler kabul edilmez (proxy üzerinden anlamsız).
export function normalizeSiteUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || /^(localhost|.*\.local)$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  return u.origin.toLowerCase() + (u.pathname || '/') + u.search;
}

export const siteHost = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

// URL'nin görünen adı ve kısa etiketi (tabloda "YT 320" gibi).
export function siteInfo(url) {
  const b = BUILTIN_SITES.find((s) => s.url === url);
  if (b) return b;
  const host = siteHost(url).replace(/^www\./, '');
  const base = host.split('.')[0] || host;
  return { url, name: host, short: base.slice(0, 3).toUpperCase(), custom: true };
}

// Ayarlar ekranı için: hazır siteler (açık/kapalı) ve kullanıcının eklediği siteler (hep açık).
export function siteList(enabled = []) {
  const on = new Set(enabled);
  return [
    ...BUILTIN_SITES.map((s) => ({ ...s, enabled: on.has(s.url) })),
    ...enabled.filter((u) => !BUILTIN_SITES.some((s) => s.url === u)).map((u) => ({ ...siteInfo(u), enabled: true })),
  ];
}

// Ölçülen süreyi kısa yazar: 320 → "320", 1450 → "1.4s".
export const shortMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1).replace(/\.0$/, '') + 's' : String(ms));
