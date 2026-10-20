// Basit çeviri katmanı. Dil: ayarlardaki "lang" ('auto' | 'tr' | 'en');
// 'auto' tarayıcının arayüz dilini kullanır (Türkçe değilse İngilizce).
import { MESSAGES } from './messages.js';

export const LANGS = ['tr', 'en'];
let lang = 'en';

export function resolveLang(setting) {
  if (LANGS.includes(setting)) return setting;
  let ui = 'en';
  try {
    ui = chrome.i18n.getUILanguage?.() || navigator.language || 'en'; // Opera getUILanguage sunmayabilir
  } catch {}
  ui = ui.toLowerCase().split(/[-_]/)[0];
  return LANGS.includes(ui) ? ui : 'en';
}

export function setLang(l) {
  lang = LANGS.includes(l) ? l : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const getLang = () => lang;
export const locale = () => (lang === 'tr' ? 'tr-TR' : 'en-US');
export const num = (n) => (n ?? 0).toLocaleString(locale());

// Parametre değeri "@anahtar" ise o da çevrilir (ör. "@anon.elite", "@err.timeout", "@job.download").
function param(v) {
  if (typeof v !== 'string' || v[0] !== '@') return v ?? '';
  const ref = v.slice(1);
  return ref.startsWith('err.') ? errorText(ref.slice(4)) : t(ref);
}

export function t(key, params = {}) {
  const m = MESSAGES[lang]?.[key] ?? MESSAGES.en[key];
  if (m == null) return key;
  const p = {};
  for (const k in params) p[k] = param(params[k]);
  return typeof m === 'function' ? m(p) : m.replace(/\{(\w+)\}/g, (_, k) => p[k] ?? '');
}

export const has = (key) => key in MESSAGES.en;

// Proxy hata kodu → metin. Eski sürümlerden kalan düz metinler olduğu gibi gösterilir.
export function errorText(code) {
  if (!code) return '';
  const h = /^http:(\d+)$/.exec(code);
  if (h) return t('err.http', { code: h[1] });
  return has('err.' + code) ? t('err.' + code) : code;
}

// HTML içindeki data-i18n* öznitelikli öğeleri çevir.
export function applyI18n(root = document) {
  for (const e of root.querySelectorAll('[data-i18n]')) e.textContent = t(e.dataset.i18n);
  for (const e of root.querySelectorAll('[data-i18n-html]')) e.innerHTML = t(e.dataset.i18nHtml);
  for (const e of root.querySelectorAll('[data-i18n-ph]')) e.placeholder = t(e.dataset.i18nPh);
  for (const e of root.querySelectorAll('[data-i18n-title]')) e.title = t(e.dataset.i18nTitle);
}

// Arayüz sayfaları için: kayıtlı dil ayarını okuyup uygula.
export async function initLang() {
  let setting = 'auto';
  try {
    setting = (await chrome.storage.local.get('settings')).settings?.lang || 'auto';
  } catch {}
  setLang(resolveLang(setting));
  return setting;
}
