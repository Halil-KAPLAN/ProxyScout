// Popup ve yönetici sayfasının ortak kodu: arka planla bağlantı, kategoriler, biçimlendirme.
import { t, getLang, errorText } from './i18n.js';

export { t, errorText };

export async function send(cmd, args = {}) {
  const r = await chrome.runtime.sendMessage({ cmd, ...args });
  if (!r?.ok) throw new Error(r?.error || 'Error');
  return r.data;
}

// Arka plandaki durumu canlı tutan depo. onChange({ full, changed, logs, sources }) çağrılır.
export function createStore(onChange) {
  const st = { proxies: new Map(), settings: {}, sources: [], active: {}, connecting: null, job: null, realIp: null, logs: [], control: '', ready: false };
  const connect = () => {
    const port = chrome.runtime.connect({ name: 'ui' });
    port.onMessage.addListener((msg) => {
      if (msg.type === 'full') {
        const { proxies, ...rest } = msg.state;
        Object.assign(st, rest, { proxies: new Map(proxies.map((p) => [p.id, p])), ready: true });
        onChange({ full: true, changed: true, logs: [] });
      } else if (msg.type === 'patch') {
        for (const p of msg.proxies) st.proxies.set(p.id, p);
        for (const id of msg.removed) st.proxies.delete(id);
        Object.assign(st, { job: msg.job, active: msg.active, connecting: msg.connecting, realIp: msg.realIp, sync: msg.sync });
        st.logs.push(...msg.logs);
        if (st.logs.length > 500) st.logs.splice(0, st.logs.length - 500);
        onChange({ full: false, changed: msg.proxies.length > 0 || msg.removed.length > 0, logs: msg.logs });
      } else if (msg.type === 'sources') {
        st.sources = msg.sources;
        onChange({ full: false, changed: false, logs: [], sources: true });
      }
    });
    // Servis çalışanı yeniden başlarsa bağlantıyı yenile.
    port.onDisconnect.addListener(() => setTimeout(connect, 500));
  };
  connect();
  return st;
}

export const CATEGORIES = [
  { id: 'all', icon: 'list', test: () => true },
  { id: 'new', icon: 'spark', hint: true, test: (p) => p.status === 'new' },
  { id: 'alive', icon: 'check', test: (p) => p.status === 'alive' },
  // Çalışanların alt grupları birbiriyle çakışmaz: her proxy tam olarak birinde yer alır.
  // "Yalnız HTTP" grupları HTTPS'i desteklemeyen ya da HTTPS testi yapılmamış proxy'leri içerir.
  { id: 'eliteSsl', parent: 'alive', hint: true, test: (p) => p.status === 'alive' && p.anon === 'elite' && p.ssl === true },
  { id: 'elite', parent: 'alive', hint: true, test: (p) => p.status === 'alive' && p.anon === 'elite' && p.ssl !== true },
  { id: 'ssl', parent: 'alive', hint: true, test: (p) => p.status === 'alive' && p.anon !== 'elite' && p.ssl === true },
  { id: 'anonymous', parent: 'alive', hint: true, test: (p) => p.status === 'alive' && p.anon === 'anonymous' && p.ssl !== true },
  { id: 'transparent', parent: 'alive', hint: true, test: (p) => p.status === 'alive' && p.anon === 'transparent' && p.ssl !== true },
  { id: 'dead', icon: 'x', test: (p) => p.status === 'dead' },
  { id: 'permanent', parent: 'dead', hint: true, test: (p, s) => p.status === 'dead' && (p.streak || 0) >= (s.permanentFails || 3) },
  { id: 'fav', icon: 'star', test: (p) => !!p.fav },
  { id: 'mine', icon: 'user', test: (p) => !!p.mine },
];

export const anonText = (a) => (a ? t('anon.' + a) : '');
export const statusText = (s) => t('status.' + s);
export const phaseText = (p) => t('phase.' + p);
export const logText = (l) => (l.key ? t(l.key, l.params) : l.msg || '');

// Bölge adları seçili dilde (Intl). Bayrak: bölge göstergesi harfleri; Windows'ta
// "Twemoji Country Flags" fontu (common.css) bunları bayrak olarak çizer.
const regionCache = {};
export function countryName(p) {
  if (!p.country) return '';
  const lang = getLang();
  try {
    regionCache[lang] ||= new Intl.DisplayNames([lang], { type: 'region' });
    return regionCache[lang].of(p.country) || p.countryName || p.country;
  } catch {
    return p.countryName || p.country;
  }
}

export function flag(cc) {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// "🇩🇪 Almanya" — isteğe bağlı şehir: "🇩🇪 Almanya, Frankfurt"
export function place(p, withCity = false) {
  if (!p.country) return '';
  const name = countryName(p);
  return `${flag(p.country)} ${name}${withCity && p.city ? ', ' + p.city : ''}`;
}

export function ago(ts) {
  if (!ts) return '—';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return t('ago.now'); // saniyeleri saymak yerine: sürekli değişen sayı göze batıyordu
  if (s < 3600) return t('ago.m', { n: Math.round(s / 60) });
  if (s < 86400) return t('ago.h', { n: Math.round(s / 3600) });
  return t('ago.d', { n: Math.round(s / 86400) });
}

export function latencyClass(ms) {
  if (ms == null) return '';
  return ms < 800 ? 'fast' : ms < 2500 ? 'mid' : 'slow';
}

export const addr = (p) => `${p.host}:${p.port}`;

export function uptime(p) {
  const n = (p.ok || 0) + (p.fail || 0);
  return n ? Math.round(((p.ok || 0) * 100) / n) : null;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function toast(msg, kind = 'info', ms = 3200) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

// Komut çalıştır; hata mesajı bir dil anahtarıysa çevrilerek gösterilir.
export async function run(cmd, args, okMsg) {
  try {
    const r = await send(cmd, args);
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok');
    return r;
  } catch (e) {
    toast(t(e.message), 'err');
    throw e;
  }
}

// Bağlan / bağlantıyı doğrula; sonucu bildirim olarak göster.
export async function connectWithFeedback(store, p, onState) {
  store.connecting = p.id;
  onState?.();
  try {
    const r = await send('connect', { id: p.id });
    if (r.superseded) return r;
    const sw = r.switchedTo && store.proxies.get(r.switchedTo);
    if (r.ok && sw) toast(t('toast.switched', { from: addr(p), to: addr(sw), ms: r.ms }), 'ok', 5000);
    else if (r.ok) toast(t('toast.connected', { addr: addr(p), ms: r.ms }), 'ok');
    else toast(t('toast.connectedNoResp', { addr: addr(p), err: errorText(r.error) }), 'err', 5000);
    return r;
  } catch (e) {
    toast(t(e.message), 'err');
  } finally {
    if (store.connecting === p.id) store.connecting = null;
    onState?.();
  }
}
