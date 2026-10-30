import { initLang, applyI18n, locale } from './lib/i18n.js';
import { createStore, send, run, toast, t, CATEGORIES, errorText, anonText, phaseText, countryName, flag, latencyClass, addr, ago, esc, connectWithFeedback } from './lib/ui.js';
import { icon } from './lib/icons.js';
import { IS_ANDROID } from './lib/platform.js';
import { siteInfo, shortMs } from './lib/sites.js';

if (IS_ANDROID) document.documentElement.classList.add('mobile');

const langSetting = await initLang();
applyI18n();

const $ = (s) => document.querySelector(s);
let savedTab = null;
try {
  savedTab = localStorage.getItem('popupTab');
} catch {}
const ui = { filter: savedTab || 'eliteSsl', country: '', order: null };
if (!['alive', 'eliteSsl', 'ssl', 'fav'].includes(ui.filter)) ui.filter = 'eliteSsl'; // eski "Elit (yalnız HTTP)" sekmesi kaldırıldı
for (const x of document.querySelectorAll('#tabs button')) x.classList.toggle('on', x.dataset.f === ui.filter);
// Liste açılışta, sekme/ülke değişince ve test bitince sıralanır; bağlanırken yerinde kalır.
const resort = () => (ui.order = null);
let hadJob = false;

$('#dl').innerHTML = icon('download') + `<span>${esc(t('pop.dl'))}</span>`;
$('#recheck').innerHTML = icon('refresh');
$('#manager').innerHTML = icon('external') + `<span>${esc(t('pop.manager'))}</span>`;

const store = createStore(({ full }) => {
  if (full && (store.settings.lang || 'auto') !== langSetting) return location.reload();
  if (full || (hadJob && !store.job)) resort();
  hadJob = !!store.job;
  render();
});

// Sekmeler yönetici sayfasındaki kategorilerle aynı tanımları kullanır (Elit ve HTTPS çakışmaz).
const FILTERS = Object.fromEntries(['alive', 'eliteSsl', 'ssl', 'fav'].map((id) => [id, CATEGORIES.find((c) => c.id === id).test]));

let raf = 0;
function render() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    renderCard();
    renderJob();
    renderList();
  });
}

const loc = (p) => [countryName(p), p.city].filter(Boolean).join(', ');

function renderCard() {
  const a = store.active;
  const p = a.id && store.proxies.get(a.id);
  const cp = store.connecting && store.proxies.get(store.connecting);
  const on = !!(a.enabled && p);
  $('#toggle').checked = on || !!cp;
  $('#auto').checked = !!a.autoSwitch;
  const card = $('#card');
  card.classList.toggle('connecting', !!cp);
  const bad = on && (a.failed || p.status === 'dead');
  card.classList.toggle('on', !cp && on && !bad);
  card.classList.toggle('bad', !cp && bad);
  $('#toggleWrap').dataset.state = cp ? 'wait' : bad ? 'bad' : on ? 'on' : 'off';
  if (cp) {
    $('#cTitle').innerHTML = `<span class="spin"></span> ${esc(addr(cp))}`;
    $('#cSub').textContent = t('conn.connecting') + ' ' + t('conn.connectingSub').toLocaleLowerCase(locale());
  } else if (on) {
    $('#cTitle').innerHTML = `${p.country ? `<span class="flag">${flag(p.country)}</span>` : ''}${p.type.toUpperCase()} ${esc(addr(p))}`;
    $('#cSub').textContent = [a.failed && t('conn.noResp', { err: errorText(a.failed) }), loc(p), anonText(p.anon), p.ssl === true && 'HTTPS ✓', p.latency != null && p.latency + ' ms', a.since && ago(a.since)].filter(Boolean).join(' · ');
  } else {
    $('#cTitle').textContent = t('conn.direct');
    $('#cSub').textContent = p ? t('pop.offLast', { addr: addr(p) }) : t('conn.off');
  }
}

function renderJob() {
  const j = store.job;
  $('#job').hidden = !j;
  $('#dl').disabled = !!j;
  $('#recheck').disabled = !!j;
  if (!j) return;
  let s = phaseText(j.phase);
  if (j.total) s += ` ${j.done}/${j.total}`;
  if (j.alive) s += ' · ' + t('job.counts', { alive: j.alive, dead: j.dead });
  $('#jobText').textContent = s;
  $('#jobBar').style.width = (j.total ? Math.round((j.done * 100) / j.total) : 0) + '%';
}

let lastCountries = null;
function renderList() {
  const f = FILTERS[ui.filter];
  const all = [...store.proxies.values()].filter(f);
  const coll = new Intl.Collator(locale());
  const cs = [...new Set(all.map((p) => p.country).filter(Boolean))].sort((a, b) => coll.compare(countryName({ country: a }), countryName({ country: b })));
  if (cs.join() !== lastCountries) {
    lastCountries = cs.join();
    $('#country').innerHTML = `<option value="">${esc(t('filter.allCountries'))}</option>` + cs.map((c) => `<option value="${esc(c)}">${flag(c)} ${esc(countryName({ country: c }))}</option>`).join('');
    $('#country').value = cs.includes(ui.country) ? ui.country : '';
  }
  // Gezinmeyi asıl belirleyen HTTPS süresi: varsa ona, yoksa HTTP gecikmesine göre sırala.
  const ms = (p) => p.sslMs ?? (p.latency != null ? p.latency + 1e6 : 1e9);
  const byLatency = (a, b) => ms(a) - ms(b);
  const o = ui.order;
  const list = all
    .filter((p) => !ui.country || p.country === ui.country)
    .sort(o ? (a, b) => (o.has(a.id) && o.has(b.id) ? o.get(a.id) - o.get(b.id) : o.has(a.id) ? -1 : o.has(b.id) ? 1 : byLatency(a, b)) : byLatency)
    .slice(0, 100);
  ui.order = new Map(list.map((p, i) => [p.id, i]));
  const box = $('#list');
  if (!store.ready) return;
  if (!list.length) {
    box.innerHTML = `<div class="empty">${store.proxies.size ? esc(t('pop.emptyFilter')) : t('pop.emptyNone')}</div>`;
    return;
  }
  const act = store.active.enabled ? store.active.id : null;
  box.innerHTML = list
    .map((p) => {
      const busy = store.connecting === p.id;
      return `<div class="item ${p.id === act ? 'active' : ''} ${busy ? 'busy' : ''}" data-id="${esc(p.id)}" title="${esc(t('pop.itemTitle'))}">
        <span class="a">${p.country ? `<span class="flag">${flag(p.country)}</span>` : ''}${esc(addr(p))}</span>
        <span class="lat ${busy ? '' : latencyClass(p.sslMs ?? p.latency)}">${busy ? '<span class="spin"></span>' : (p.sslMs ?? p.latency) != null ? (p.sslMs ?? p.latency) + ' ms' : ''}</span>
        <span class="m">${esc([p.type.toUpperCase(), loc(p), anonText(p.anon)].filter(Boolean).join(' · '))} · ${
          p.ssl === true ? `<span class="ok">HTTPS ✓</span>` : `<span class="warn" title="${esc(t('pop.httpOnlyHint'))}">${esc(t('pop.httpOnly'))}</span>`
        }</span>${sitesLine(p)}
      </div>`;
    })
    .join('');
}

// Site testi sonuçları: "YT 320 · DC ✗" (yalnızca ayarlarda açık siteler).
function sitesLine(p) {
  if (!p.sites || !store.settings.siteTest) return '';
  const parts = (store.settings.sites || [])
    .filter((u) => p.sites[u])
    .map((u) => {
      const r = p.sites[u];
      return `<span class="${r.ok ? 'ok' : 'bad'}" title="${esc(siteInfo(u).name)}">${esc(siteInfo(u).short)} ${r.ok ? shortMs(r.ms) : '✗'}</span>`;
    });
  return parts.length ? `<span class="m sites">${parts.join(' · ')}</span>` : '';
}

$('#list').addEventListener('click', (e) => {
  const id = e.target.closest('.item')?.dataset.id;
  const p = id && store.proxies.get(id);
  if (!p || store.connecting === id) return;
  if (store.active.enabled && store.active.id === id) run('setEnabled', { enabled: false }, t('toast.disconnected'));
  else connectWithFeedback(store, p, render);
});

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  ui.filter = b.dataset.f;
  try {
    localStorage.setItem('popupTab', ui.filter);
  } catch {}
  resort();
  for (const x of $('#tabs').children) x.classList.toggle('on', x === b);
  render();
});
$('#country').addEventListener('change', (e) => ((ui.country = e.target.value), resort(), render()));

$('#toggle').addEventListener('change', async (e) => {
  const on = e.target.checked;
  try {
    const r = await send('setEnabled', { enabled: on });
    if (on && r && !r.ok) toast(t('toast.connectedNoResp', { addr: '', err: errorText(r.error) }), 'err', 5000);
  } catch (err) {
    e.target.checked = !on;
    toast(t(err.message), 'err');
  }
});
$('#auto').addEventListener('change', (e) => run('setAutoSwitch', { value: e.target.checked }));
$('#dl').addEventListener('click', () => run('download', {}, t('toast.downloading')).catch(() => {}));
$('#recheck').addEventListener('click', () => run('test', { filter: 'alive' }, t('toast.recheck')).catch(() => {}));
$('#stop').addEventListener('click', () => run('stop'));
// Android'de popup tam ekran bir sayfadır; yönetici arkasında açılır, bu yüzden popup kapatılır.
$('#manager').addEventListener('click', () => chrome.runtime.openOptionsPage().then(() => IS_ANDROID && window.close()));
$('#ipBtn').addEventListener('click', async () => {
  const out = $('#ipOut');
  out.hidden = false;
  out.textContent = t('pop.checking');
  try {
    const r = await send('checkIp');
    const where = r.countryCode ? ` · ${flag(r.countryCode)} ${countryName({ country: r.countryCode })}${r.city ? ', ' + r.city : ''}` : '';
    out.textContent = t('pop.exitIp', { ip: r.ip, loc: where, ms: r.ms });
  } catch (e) {
    out.textContent = t('pop.ipFail', { err: t(e.message) });
  }
});
