import { initLang, applyI18n, num, locale } from './lib/i18n.js';
import {
  createStore, send, run, toast, t, errorText, CATEGORIES, anonText, statusText, phaseText, logText,
  countryName, flag, ago, latencyClass, addr, uptime, esc, connectWithFeedback, isUsable, isHttpOnly,
} from './lib/ui.js';
import { icon } from './lib/icons.js';
import { formatProxy } from './lib/parse.js';
import { cleanSiteEntry } from './lib/pac.js';
import { sourceTypes, enabledTypes, sourceHome } from './lib/sources.js';
import { siteInfo, siteList, normalizeSiteUrl, shortMs } from './lib/sites.js';
import { IS_FIREFOX, credsSyncAllowed, requestCredsSync, storeReviewUrl } from './lib/platform.js';

const langSetting = await initLang();
if (IS_FIREFOX) document.querySelector('[data-i18n="set.syncChrome"]')?.setAttribute('data-i18n', 'set.syncFirefox');
applyI18n();

const $ = (s) => document.querySelector(s);
const ROW_H = 36;

const ui = {
  view: 'list',
  cat: 'all',
  search: '',
  type: '',
  country: '',
  site: '', // site filtresi: yalnızca bu siteyi açan proxy'ler
  sortKey: 'status',
  sortDir: 1,
  selected: new Set(),
  anchor: null,
  visible: [],
  order: null, // id → sıra; null ise bir sonraki hesaplamada yeniden sıralanır
  logOpen: false,
};

// Liste yalnızca kullanıcı istediğinde (sütun başlığı, kategori/filtre değişimi, "Yeniden sırala")
// ya da bir test bittiğinde yeniden sıralanır; bağlanma vb. sırasında satırlar yerinde kalır.
const resort = () => (ui.order = null);
let hadJob = false;

const store = createStore(({ full, changed, logs, sources }) => {
  // Dil başka bir sayfadan değiştirildiyse sayfayı yeni dille yeniden yükle.
  if (full && (store.settings.lang || 'auto') !== langSetting) return location.reload();
  if (full) renderSources(), fillSettings(), renderLog(true);
  else if (sources) renderSources();
  else if (logs.length) renderLog(false, logs);
  if (full || (hadJob && !store.job)) resort();
  hadJob = !!store.job;
  if (changed || !ui.order) dataChanged();
  else requestAnimationFrame(renderRows); // bağlanma durumu gibi satır görünümünü etkileyen değişiklikler
  renderHeader();
  renderJob();
  renderSync();
});

// ---------------------------------------------------------------- statik metinler ve ikonlar

function setBtn(sel, ic, text) {
  const b = typeof sel === 'string' ? $(sel) : sel;
  b.innerHTML = icon(ic) + `<span>${esc(text)}</span>`;
}
// Dar ekranda kısa etiket ("İndir ve test et") görünür.
$('#btnDownload').innerHTML = icon('download') + `<span class="l-long">${esc(t('tb.download'))}</span><span class="l-short">${esc(t('pop.dl'))}</span>`;
setBtn('#btnTest', 'play', t('tb.test'));
$('#btnTest').insertAdjacentHTML('beforeend', icon('chevron'));
setBtn('#btnStop', 'stop', t('tb.stop'));
setBtn('#btnImport', 'upload', t('tb.import'));
setBtn('#btnImportM', 'upload', t('tb.import'));
setBtn('#btnCopy', 'copy', t('tb.copy'));
setBtn('#btnDelete', 'trash', t('tb.delete'));
setBtn('#btnMyIp', 'globe', t('myip'));
setBtn('#srcDownload', 'download', t('src.download'));
setBtn('#srcStop', 'stop', t('tb.stop'));
setBtn('#siteAddBtn', 'plus', t('set.siteAdd'));
setBtn('#srcAdd button', 'plus', t('src.add'));
setBtn('#btnLog', 'terminal', t('log.btn'));
$('#driveConnect').innerHTML = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span>${esc(t('sync.google'))}</span>`;
setBtn('#syncNow', 'refresh', t('sync.now'));
const navSources = document.querySelector('[data-view=sources]');
const navSettings = document.querySelector('[data-view=settings]');
navSources.innerHTML = icon('source') + `<span>${t('nav.sources')}</span><span class="n" id="nSources"></span>`;
navSettings.innerHTML = icon('gear') + `<span>${t('nav.settings')}</span>`;
$('#btnMobileSettings').innerHTML = icon('gear');
$('#appVersion').textContent = t('set.version', { v: chrome.runtime.getManifest().version });
$('#rateLink').href = storeReviewUrl();

// Değerlendirme notu: hiçbir pencere ya da bildirim açmaz. Eklenti en az 3 gündür kullanılıyor ve 10 kez başarıyla
// bağlanılmışsa kenar çubuğunun altında tek satır, sönük bir bağlantı görünür. Tıklanınca ya da × ile bir daha çıkmaz.
// (Ayarlar'daki "Mağazada değerlendir" bağlantısı ise hep oradadır.)
chrome.storage.local.get(['rateConnects', 'rateFirst', 'rateDone']).then((d) => {
  if (d.rateDone || (d.rateConnects || 0) < 10 || !d.rateFirst || Date.now() - d.rateFirst < 3 * 864e5) return;
  const el = $('#rateNote');
  el.innerHTML = `<a href="${esc(storeReviewUrl())}" target="_blank" rel="noreferrer">${esc(t('rate.note'))}</a><button type="button" class="x" title="${esc(t('rate.hide'))}" aria-label="${esc(t('rate.hide'))}">×</button>`;
  el.hidden = false;
  el.addEventListener('click', (e) => {
    if (!e.target.closest('a, .x')) return;
    chrome.storage.local.set({ rateDone: true }).catch(() => {});
    el.hidden = true;
  });
}).catch(() => {});

const LANG_OPTIONS = () => [['auto', t('set.langAuto')], ['tr', 'Türkçe'], ['en', 'English']];
$('#langSelect').innerHTML = LANG_OPTIONS().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
$('#langSelect').value = langSetting;
// Dil seçimi Ayarlar'da; değiştirilince Kaydet beklemeden uygulanır.
$('#langSelect').addEventListener('change', async (e) => {
  await run('saveSettings', { settings: { lang: e.target.value } });
  location.reload();
});

const COLS = [
  { key: 'fav', label: '' },
  { key: 'addr', label: 'col.addr' },
  { key: 'type', label: 'col.type' },
  { key: 'status', label: 'col.status' },
  { key: 'anon', label: 'col.anon' },
  { key: 'ssl', label: 'col.ssl' },
  { key: 'latency', label: 'col.latency' },
  { key: 'country', label: 'col.country' },
  { key: 'uptime', label: 'col.uptime' },
  { key: 'lastCheck', label: 'col.lastCheck' },
  { key: 'source', label: 'col.source' },
  { key: 'sites', label: 'col.sites' },
  { key: 'act', label: '' },
];
$('#thead').innerHTML = COLS.map((c) =>
  c.key === 'act'
    ? `<div class="act"><button class="btn ghost sm resort" id="btnResort" title="${esc(t('sort.resortTitle'))}">${icon('refresh')}<span>${esc(t('sort.resort'))}</span></button></div>`
    : `<div data-sort="${c.key}" title="${c.label ? esc(t('sort.title', { c: t(c.label) })) : ''}"><span class="hl">${c.label ? esc(t(c.label)) : ''}</span>${['type', 'country', 'sites'].includes(c.key) ? `<span class="hf">${icon('filter')}</span>` : ''}</div>`,
).join('');

// Dar ekranda tür, ülke ve site filtreleri sütun başlıklarındaki filtre düğmesine taşınır: düğmeye dokunmak seçim
// listesini açar (seçim kutusu düğmenin üstünde görünmez durur), başlığın kendisi sıralar. Geniş ekranda araç çubuğuna döner.
const narrow = matchMedia('(max-width: 760px)');
const HEAD_FILTERS = [
  ['type', '#fType'],
  ['country', '#fCountry'],
  ['sites', '#fSite'],
];
const headCell = (k) => $(`#thead [data-sort="${k}"]`);
function placeFilters() {
  for (const [k, sel] of HEAD_FILTERS) (narrow.matches ? headCell(k).querySelector('.hf') : $('#tbFilters')).append($(sel));
  renderHeadFilters();
}
narrow.addEventListener('change', placeFilters);

// Filtre seçiliyse başlıkta sütun adı yerine seçilen değer görünür.
function renderHeadFilters() {
  const value = { type: ui.type.toUpperCase(), country: ui.country && flag(ui.country), sites: ui.site && siteInfo(ui.site).short };
  for (const [k] of HEAD_FILTERS) {
    const on = narrow.matches && !!value[k];
    headCell(k).querySelector('.hl').textContent = on ? value[k] : t(COLS.find((c) => c.key === k).label);
    headCell(k).classList.toggle('filtered', on);
  }
}
placeFilters();

// Yana kayan alanlarda devamı olan kenarı işaretler (CSS soluklaşma ve ok gösterir).
const scrollers = ['.side', '.toolbar', '#tbody'].map((s) => $(s));
function updateScrollHints() {
  for (const el of scrollers) {
    el.classList.toggle('more-l', el.scrollLeft > 2);
    el.classList.toggle('more-r', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }
}
for (const el of scrollers) el.addEventListener('scroll', updateScrollHints, { passive: true });
new ResizeObserver(updateScrollHints).observe(document.body);

$('#btnResort').addEventListener('click', (e) => {
  e.stopPropagation();
  resort();
  dataChanged();
});

// ---------------------------------------------------------------- filtreleme ve sıralama

const ipNum = (h) => {
  const p = h.split('.');
  return p.length === 4 ? ((+p[0] * 256 + +p[1]) * 256 + +p[2]) * 256 + +p[3] : 0;
};
const statusRank = (p) => (p.checking ? 1 : { alive: 0, new: 2, dead: 3 }[p.status] ?? 4);
const anonRank = { elite: 0, anonymous: 1, transparent: 2 };
const sslRank = (v) => (v === true ? 0 : v === false ? 2 : 1);
// Boş değerler ±Infinity döner; computeVisible bunları sıralama yönüyle çevirmez, böylece ters sırada da en sonda kalırlar.
const nullLast = (a, b, f) => (a == null && b == null ? 0 : a == null ? Infinity : b == null ? -Infinity : f(a, b));
const collator = new Intl.Collator(locale());

const SORTS = {
  fav: (a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0),
  addr: (a, b) => ipNum(a.host) - ipNum(b.host) || a.port - b.port,
  type: (a, b) => a.type.localeCompare(b.type),
  status: (a, b) => statusRank(a) - statusRank(b) || nullLast(a.latency, b.latency, (x, y) => x - y),
  anon: (a, b) => nullLast(anonRank[a.anon], anonRank[b.anon], (x, y) => x - y),
  ssl: (a, b) => sslRank(a.ssl) - sslRank(b.ssl) || (a.sslMs ?? 1e9) - (b.sslMs ?? 1e9),
  latency: (a, b) => nullLast(a.latency, b.latency, (x, y) => x - y),
  // Site filtresi seçiliyse o sitedeki süreye, değilse açılan site sayısına (eşitse ortalama süreye) göre.
  sites: (a, b) => (ui.site ? siteMs(a, ui.site) - siteMs(b, ui.site) : siteScore(b) - siteScore(a)),
  country: (a, b) => nullLast(a.country, b.country, () => collator.compare(countryName(a), countryName(b))),
  uptime: (a, b) => nullLast(uptime(a), uptime(b), (x, y) => y - x),
  lastCheck: (a, b) => (b.lastCheck || 0) - (a.lastCheck || 0),
  source: (a, b) => (a.source || '').localeCompare(b.source || ''),
};

function computeVisible() {
  const cat = CATEGORIES.find((c) => c.id === ui.cat) || CATEGORIES[0];
  const q = ui.search.trim().toLocaleLowerCase(locale());
  const out = [];
  for (const p of store.proxies.values()) {
    if (!cat.test(p, store.settings)) continue;
    if (ui.type && p.type !== ui.type) continue;
    if (ui.country && p.country !== ui.country) continue;
    if (ui.site && !p.sites?.[ui.site]?.ok) continue;
    if (q && !`${p.host}:${p.port} ${p.country || ''} ${countryName(p)} ${p.city || ''} ${p.isp || ''} ${p.type}`.toLocaleLowerCase(locale()).includes(q)) continue;
    out.push(p);
  }
  const f = SORTS[ui.sortKey] || SORTS.status;
  const cmp = (a, b) => {
    const r = f(a, b);
    return (Number.isFinite(r) ? r * ui.sortDir : r) || SORTS.status(a, b);
  };
  if (!ui.order) out.sort(cmp);
  else {
    // Önceki sırayı koru; listeye yeni girenler sıralı biçimde sona eklenir.
    const o = ui.order;
    out.sort((a, b) => (o.has(a.id) && o.has(b.id) ? o.get(a.id) - o.get(b.id) : o.has(a.id) ? -1 : o.has(b.id) ? 1 : cmp(a, b)));
  }
  ui.order = new Map(out.map((p, i) => [p.id, i]));
  ui.visible = out;
}

let pending = false;
function dataChanged() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    computeVisible();
    renderCats();
    renderCountries();
    renderRows();
    renderCounts();
    renderHeadFilters();
    updateScrollHints();
  });
}

// ---------------------------------------------------------------- kenar çubuğu

function renderCats() {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  for (const p of store.proxies.values()) for (const c of CATEGORIES) if (c.test(p, store.settings)) counts[c.id]++;
  $('#cats').innerHTML = CATEGORIES.map(
    (c) => `<a href="#" class="cat c-${c.id} ${c.parent ? 'sub' : ''} ${ui.view === 'list' && ui.cat === c.id ? 'active' : ''}" data-cat="${c.id}" title="${c.hint ? esc(t('cat.' + c.id + '.hint')) : ''}">
      ${c.parent ? '' : icon(c.icon)}<span>${esc(t('cat.' + c.id))}</span><span class="n">${num(counts[c.id])}</span></a>`,
  ).join('');
  // "Benim proxy'lerim"de öne çıkan eylem içe aktarmadır: renkli düğme İndir'den İçe aktar'a geçer
  // (dar ekranda araç çubuğunda gizli olan İçe aktar burada görünür).
  const mine = ui.view === 'list' && ui.cat === 'mine';
  document.body.classList.toggle('cat-mine', mine);
  $('#btnImport').classList.toggle('primary', mine);
  $('#btnDownload').classList.toggle('primary', !mine);
  $('#nSources').textContent = store.sources.filter((s) => s.enabled).length + '/' + store.sources.length;
  navSources.classList.toggle('active', ui.view === 'sources');
  navSettings.classList.toggle('active', ui.view === 'settings');
}

$('.side').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  if (a.dataset.cat) {
    ui.cat = a.dataset.cat;
    ui.selected.clear();
    resort();
    showView('list');
    $('#tbody').scrollTop = 0;
  } else showView(a.dataset.view);
});

function showView(v) {
  ui.view = v;
  document.body.dataset.view = v;
  for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'view-' + v;
  for (const b of document.querySelectorAll('#mTabs [data-mview]')) b.classList.toggle('on', b.dataset.mview === v);
  if (v === 'list' && store.ready) sitesWidth(enabledSites());
  dataChanged();
}

// Dar ekran: çark Ayarlar'ı açar (ayarlardayken listeye döner); üstteki sekmeler Ayarlar ile Kaynaklar arasında geçer.
const inSettings = () => ui.view === 'settings' || ui.view === 'sources';
$('#btnMobileSettings').addEventListener('click', () => showView(inSettings() ? 'list' : 'settings'));
$('#brand').addEventListener('click', (e) => {
  e.preventDefault();
  showView('list');
});
$('#mTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mview]');
  if (b) showView(b.dataset.mview);
});

let lastCountryKey = null;
function renderCountries() {
  const m = new Map();
  for (const p of store.proxies.values()) if (p.country) m.set(p.country, (m.get(p.country) || 0) + 1);
  const key = [...m].map(([k, n]) => k + n).join();
  if (key === lastCountryKey) return;
  lastCountryKey = key;
  const sel = $('#fCountry');
  const list = [...m].sort((a, b) => collator.compare(countryName({ country: a[0] }), countryName({ country: b[0] })));
  sel.innerHTML = `<option value="">${esc(t('filter.allCountries'))}</option>` + list.map(([c, n]) => `<option value="${esc(c)}">${flag(c)} ${esc(countryName({ country: c }))} (${n})</option>`).join('');
  sel.value = ui.country;
}

// ---------------------------------------------------------------- tablo (sanal kaydırma)

const tbody = $('#tbody');
let lastRowsHtml = '';
const rowsEl = $('#rows');
const sourceName = (id) => (id === 'manual' ? t('src.manual') : store.sources.find((s) => s.id === id)?.name || id || '');

function rowHtml(p, i) {
  const isActive = store.active.id === p.id && store.active.enabled;
  const isConnecting = store.connecting === p.id;
  const st = p.checking
    ? `<span class="chip checking">${t('status.checking')}</span>`
    : isHttpOnly(p)
      ? `<span class="chip httponly" title="${esc(t('cat.httpOnly.hint'))}">${t('status.httpOnly')}</span>`
      : `<span class="chip ${p.status}">${statusText(p.status)}</span>`;
  const up = uptime(p);
  const ssl =
    p.status !== 'alive' ? ''
    : p.ssl === true ? `<span class="ssl-yes" title="${esc(t('row.sslMs'))}">✓ ${p.sslMs != null ? p.sslMs + ' ms' : ''}</span>`
    : p.ssl === false ? `<span class="ssl-no">${t('ssl.no')}</span>`
    : '<span class="ssl-no">?</span>';
  const title = p.error ? t('row.lastErr', { err: errorText(p.error) }) : p.sslError && p.ssl === false ? t('row.httpsErr', { err: errorText(p.sslError) }) : '';
  const geoTitle = [p.city, p.isp].filter(Boolean).join(' · ');
  const btn = isConnecting
    ? `<button class="btn sm connect-btn busy" disabled><span class="spin"></span>${t('row.connecting')}</button>`
    : isActive
      ? `<span class="chip ${store.active.failed ? 'dead' : 'alive'} plain connected-tag" title="${esc(t('toggle.title'))}">${t('row.connected')}</span>`
      : `<button class="btn sm connect-btn" data-connect>${t('row.connect')}</button>`;
  // Ölülere taşı: zaten ölüyse, bağlıysa ya da bağlanılıyorsa gösterilmez.
  const deadBtn = p.status === 'dead' || isActive || isConnecting ? ''
    : `<button class="btn sm dead-btn" data-dead title="${esc(t('row.markDead'))}" aria-label="${esc(t('row.markDead'))}">${icon('x')}</button>`;
  return `<div class="row ${ui.selected.has(p.id) ? 'sel' : ''} ${isActive ? 'active' : ''} ${isConnecting ? 'connecting' : ''}" data-i="${i}" data-id="${esc(p.id)}" style="top:${i * ROW_H}px" title="${esc(title)}">
    <div><button class="fav ${p.fav ? 'on' : ''}" data-fav title="${t('row.fav')}">${icon('star')}</button></div>
    <div class="addr">${esc(addr(p))}${p.user ? `<span class="lock" title="${t('row.auth')}">🔒</span>` : ''}</div>
    <div><span class="tag ${p.type}">${p.type.toUpperCase()}</span></div>
    <div>${st}</div>
    <div>${p.status === 'alive' ? anonText(p.anon) : p.status === 'dead' ? `<span class="err">${esc(errorText(p.error))}</span>` : ''}</div>
    <div>${ssl}</div>
    <div class="lat ${latencyClass(p.latency)}">${p.latency != null ? p.latency + ' ms' : ''}</div>
    <div title="${esc(geoTitle)}">${p.country ? `<span class="flag">${flag(p.country)}</span>${esc(countryName(p))}${p.city ? `<span class="city">, ${esc(p.city)}</span>` : ''}` : ''}</div>
    <div>${up == null ? '' : `<span class="upbar"><i><b style="width:${up}%"></b></i>${up}%</span>`}</div>
    <div class="muted">${p.lastCheck ? ago(p.lastCheck) : '—'}</div>
    <div class="muted" title="${esc(sourceName(p.source))}">${esc(sourceName(p.source))}</div>
    <div class="sites"><div class="sl">${sitesHtml(p)}</div></div>
    <div class="act">${btn}${deadBtn}</div>
  </div>`;
}

function renderRows() {
  if (ui.view !== 'list') return;
  const n = ui.visible.length;
  $('#spacer').style.height = n * ROW_H + 'px';
  const top = tbody.scrollTop;
  const h = tbody.clientHeight || 600;
  const from = Math.max(0, Math.floor(top / ROW_H) - 8);
  const to = Math.min(n, Math.ceil((top + h) / ROW_H) + 8);
  let html = '';
  for (let i = from; i < to; i++) html += rowHtml(ui.visible[i], i);
  // Değişmeyen satırları yeniden çizme: aksi halde iki tıklama arasında DOM yenilenip çift tıklama kaçabilir.
  if (html !== lastRowsHtml) rowsEl.innerHTML = lastRowsHtml = html;
  updateSiteCells();

  const empty = $('#empty');
  empty.hidden = n > 0;
  if (!n) {
    const none = store.proxies.size === 0;
    // "Benim proxy'lerim" hiç dolmadıysa nasıl ekleneceğini göster (filtre yüzünden boşsa değil).
    const noMine = ui.cat === 'mine' && ![...store.proxies.values()].some((p) => p.mine);
    empty.innerHTML = noMine
      ? `<b>${t('empty.mine.title')}</b><span>${t('empty.mine.text')}</span><div class="empty-btns"><button class="btn primary" id="emptyImp">${icon('upload')}<span>${t('tb.import')}</span></button><button class="btn" id="emptyList">${icon('source')}<span>${t('imp.listBtn')}</span></button></div>`
      : none
        ? `<b>${t('empty.none.title')}</b><span>${t('empty.none.text')}</span><button class="btn primary" id="emptyDl">${icon('download')}<span>${t('tb.download')}</span></button>`
        : `<b>${t('empty.filter.title')}</b><span>${t('empty.filter.text')}</span>`;
    $('#emptyDl')?.addEventListener('click', download);
    $('#emptyImp')?.addEventListener('click', () => $('#importDlg').showModal());
    $('#emptyList')?.addEventListener('click', goAddMineList);
  }
  for (const d of $('#thead').children) {
    d.classList.toggle('sorted', d.dataset.sort === ui.sortKey);
    d.classList.toggle('asc', ui.sortDir === -1);
  }
}

tbody.addEventListener('scroll', () => requestAnimationFrame(renderRows), { passive: true });
window.addEventListener('resize', () => requestAnimationFrame(renderRows));

$('#thead').addEventListener('click', (e) => {
  if (e.target.closest('select')) return; // dar ekranda başlıktaki filtre
  const k = e.target.closest('[data-sort]')?.dataset.sort;
  if (!k || k === 'act') return;
  // Başlığa her tıklama: sütunun sırası → ters sıra → varsayılan sıra (durum, sonra gecikme).
  if (ui.sortKey !== k) (ui.sortKey = k), (ui.sortDir = 1);
  else if (ui.sortDir === 1) ui.sortDir = -1;
  else (ui.sortKey = 'status'), (ui.sortDir = 1);
  resort();
  dataChanged();
});

// Siteler hücresi sığmazsa yana kayar: fareyle sürükleyerek, Shift+tekerlekle ya da kenardaki oka tıklayarak;
// dokunmatikte parmakla. Satırlar yeniden çizilince konum kaybolmasın diye proxy başına saklanır.
const sitesX = new Map();
function siteHint(sl) {
  const over = sl.scrollWidth > sl.clientWidth + 1;
  const c = sl.parentElement.classList;
  c.toggle('ovf', over);
  c.toggle('more-l', over && sl.scrollLeft > 1);
  c.toggle('more-r', over && sl.scrollLeft + sl.clientWidth < sl.scrollWidth - 1);
}
function updateSiteCells() {
  for (const sl of rowsEl.querySelectorAll('.sl')) {
    const x = sitesX.get(sl.closest('.row').dataset.id);
    if (x != null && sl.scrollLeft !== x) sl.scrollLeft = x;
    siteHint(sl);
  }
}
rowsEl.addEventListener(
  'scroll',
  (e) => {
    const sl = e.target;
    if (!sl.classList?.contains('sl')) return;
    sitesX.set(sl.closest('.row').dataset.id, sl.scrollLeft);
    siteHint(sl);
  },
  { capture: true, passive: true },
);

let siteDrag = null;
let skipClick = false;
const siteCell = (id) => rowsEl.querySelector(`.row[data-id="${CSS.escape(id)}"] .sl`);
rowsEl.addEventListener('pointerdown', (e) => {
  const cell = e.target.closest('.sites.ovf');
  if (!cell || e.pointerType !== 'mouse' || e.button !== 0) return;
  siteDrag = { id: cell.parentElement.dataset.id, x: e.clientX, left: cell.firstElementChild.scrollLeft, moved: false };
});
document.addEventListener('pointermove', (e) => {
  if (!siteDrag) return;
  const dx = e.clientX - siteDrag.x;
  if (!siteDrag.moved && Math.abs(dx) < 4) return;
  siteDrag.moved = true;
  document.body.classList.add('grabbing');
  const sl = siteCell(siteDrag.id); // test sürerken satır yeniden çizilmiş olabilir
  if (sl) sl.scrollLeft = siteDrag.left - dx;
});
document.addEventListener('pointerup', () => {
  if (!siteDrag) return;
  if (siteDrag.moved) {
    skipClick = true; // sürükleme satırı seçmesin
    setTimeout(() => (skipClick = false));
    lastDown = { id: null, t: 0 }; // iki hızlı sürükleme çift tık sayılıp bağlanmasın
  }
  siteDrag = null;
  document.body.classList.remove('grabbing');
});
// Kenardaki ‹ › oka tıklamak hücreyi bir sayfa kaydırır.
function siteArrow(e) {
  const cell = e.target.closest('.sites.ovf');
  if (!cell) return 0;
  const r = cell.getBoundingClientRect();
  return cell.classList.contains('more-r') && e.clientX > r.right - 22 ? 1 : cell.classList.contains('more-l') && e.clientX < r.left + 22 ? -1 : 0;
}
function siteArrowClick(e) {
  const dir = siteArrow(e);
  if (dir) e.target.closest('.sites').firstElementChild.scrollBy({ left: dir * (e.target.closest('.sites').clientWidth - 40), behavior: 'smooth' });
  return !!dir;
}

rowsEl.addEventListener('click', (e) => {
  if (skipClick || siteArrowClick(e)) return;
  const row = e.target.closest('.row');
  if (!row) return;
  const p = store.proxies.get(row.dataset.id);
  if (!p) return;
  if (e.target.closest('[data-fav]')) return void send('fav', { ids: [p.id], value: !p.fav });
  if (e.target.closest('[data-connect]')) return void toggleConnect(p);
  if (e.target.closest('[data-dead]')) {
    // Satır çoklu seçimin parçasıysa tüm seçili satırlar taşınır.
    const ids = ui.selected.has(p.id) ? [...ui.selected] : [p.id];
    return void run('markDead', { ids }, (n) => t('toast.markedDead', { n: num(n) }));
  }
  const i = +row.dataset.i;
  if (e.shiftKey && ui.anchor != null) {
    const [a, b] = [Math.min(ui.anchor, i), Math.max(ui.anchor, i)];
    if (!e.ctrlKey) ui.selected.clear();
    for (let k = a; k <= b; k++) ui.selected.add(ui.visible[k].id);
  } else if (e.ctrlKey || e.metaKey) {
    ui.selected.has(p.id) ? ui.selected.delete(p.id) : ui.selected.add(p.id);
    ui.anchor = i;
  } else {
    ui.selected = new Set([p.id]);
    ui.anchor = i;
  }
  renderRows();
  renderCounts();
});

// Çift tık = bağlan. Tarayıcının dblclick olayı iki tıklama arasında satır yeniden çizilirse
// tetiklenmeyebildiği için, aynı satıra 450 ms içinde ikinci basışı kendimiz algılıyoruz.
let lastDown = { id: null, t: 0 };
rowsEl.addEventListener('mousedown', (e) => {
  const row = e.target.closest('.row');
  if (!row || e.button !== 0 || e.target.closest('button') || siteArrow(e)) return;
  const now = performance.now();
  if (lastDown.id === row.dataset.id && now - lastDown.t < 450) {
    lastDown = { id: null, t: 0 };
    e.preventDefault(); // metin seçimini engelle
    const p = store.proxies.get(row.dataset.id);
    if (p) connectTo(p);
  } else lastDown = { id: row.dataset.id, t: now };
});

const refreshConnState = () => (renderRows(), renderHeader());

function connectTo(p) {
  if (store.connecting === p.id) return;
  if (p.status === 'dead') toast(t('toast.connectDead'), 'err');
  connectWithFeedback(store, p, refreshConnState);
}

// Satırdaki düğme yalnızca bağlanır; bağlantıyı kesmek için tek kontrol üstteki anahtardır.
function toggleConnect(p) {
  if (!(store.active.id === p.id && store.active.enabled)) connectTo(p);
}

document.addEventListener('keydown', (e) => {
  if (ui.view !== 'list' || e.target.closest('input, textarea, select, dialog')) return;
  if (e.key === 'Delete' && ui.selected.size) deleteMode('selected');
  else if (e.key === 'Enter' && ui.selected.size === 1) connectTo(store.proxies.get([...ui.selected][0]));
  else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    ui.selected = new Set(ui.visible.map((p) => p.id));
    renderRows();
    renderCounts();
  } else if (e.key === 'Escape') {
    ui.selected.clear();
    renderRows();
    renderCounts();
  }
});

// ---------------------------------------------------------------- araç çubuğu

for (const b of document.querySelectorAll('[data-menu]')) {
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = document.getElementById(b.dataset.menu);
    const open = !m.classList.contains('open');
    closeMenus();
    m.classList.toggle('open', open);
  });
}
const closeMenus = () => document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
document.addEventListener('click', closeMenus);

function download() {
  run('download', {}, t('toast.downloading')).catch(() => {});
}
$('#btnDownload').addEventListener('click', download);
$('#srcDownload').addEventListener('click', download);
$('#btnStop').addEventListener('click', () => run('stop'));
$('#srcStop').addEventListener('click', () => run('stop'));

$('#menuTest').addEventListener('click', (e) => {
  const what = e.target.closest('[data-test]')?.dataset.test;
  if (!what) return;
  if (what === 'selected' || what === 'visible') {
    const ids = what === 'selected' ? [...ui.selected] : ui.visible.map((p) => p.id);
    if (!ids.length) return toast(t(what === 'selected' ? 'toast.selectFirst' : 'toast.noVisible'), 'err');
    run('test', { ids }, t('toast.testing', { n: num(ids.length) })).catch(() => {});
  } else run('test', { filter: what }, t('toast.testStarted')).catch(() => {});
});

$('#menuCopy').addEventListener('click', async (e) => {
  const what = e.target.closest('[data-copy]')?.dataset.copy;
  if (!what) return;
  // Dosyaya kaydet: her satır "tür://kullanıcı:şifre@ip:port"; İçe aktar ile aynen geri yüklenir.
  if (what.startsWith('file-')) {
    const list = what === 'file-mine' ? [...store.proxies.values()].filter((p) => p.mine) : ui.visible;
    if (!list.length) return toast(t(what === 'file-mine' ? 'toast.noMine' : 'toast.noCopy'), 'err');
    const blob = new Blob([list.map((p) => formatProxy(p, true)).join('\n') + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `proxyscout-${what === 'file-mine' ? 'my-proxies' : 'proxies'}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return toast(t('toast.saved', { n: num(list.length) }), 'ok');
  }
  const list = what === 'selected' ? ui.visible.filter((p) => ui.selected.has(p.id)) : ui.visible;
  if (!list.length) return toast(t('toast.noCopy'), 'err');
  await navigator.clipboard.writeText(list.map((p) => formatProxy(p, what === 'visible-scheme')).join('\n'));
  toast(t('toast.copied', { n: num(list.length) }), 'ok');
});

$('#menuDelete').addEventListener('click', (e) => {
  const what = e.target.closest('[data-del]')?.dataset.del;
  if (what) deleteMode(what);
});

async function deleteMode(what) {
  if (what === 'selected') {
    if (!ui.selected.size) return toast(t('toast.selectFirst'), 'err');
    const n = await run('delete', { ids: [...ui.selected] });
    ui.selected.clear();
    return toast(t('toast.deleted', { n: num(n) }), 'ok');
  }
  if (what === 'all' && !confirm(t('confirm.deleteAll'))) return;
  run('purge', { mode: what }, (n) => t('toast.deleted', { n: num(n) }));
}

$('#search').addEventListener('input', (e) => ((ui.search = e.target.value), resort(), dataChanged()));
$('#fType').addEventListener('change', (e) => ((ui.type = e.target.value), resort(), dataChanged()));
$('#fCountry').addEventListener('change', (e) => ((ui.country = e.target.value), resort(), dataChanged()));
$('#fSite').addEventListener('change', (e) => {
  ui.site = e.target.value;
  if (ui.site) (ui.sortKey = 'sites'), (ui.sortDir = 1);
  resort();
  dataChanged();
});

// İçe aktarma
const dlg = $('#importDlg');
$('#btnImport').addEventListener('click', () => dlg.showModal());
$('#btnImportM').addEventListener('click', () => dlg.showModal());
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'ok') return;
  const f = $('#importForm');
  const text = f.text.value;
  if (!text.trim()) return;
  run('import', { text, type: f.type.value, test: f.test.checked }, (n) => t('toast.imported', { n: num(n) })).then(() => (f.text.value = ''));
});

// ---------------------------------------------------------------- üst çubuk

$('#mainToggle').addEventListener('change', async (e) => {
  const on = e.target.checked;
  try {
    const r = await send('setEnabled', { enabled: on });
    if (!on) toast(t('toast.disconnected'), 'ok');
    else {
      const p = store.proxies.get(store.active.id);
      if (r?.ok) toast(t('toast.connected', { addr: p ? addr(p) : '', ms: r.ms }), 'ok');
      else if (r) toast(t('toast.connectedNoResp', { addr: p ? addr(p) : '', err: errorText(r.error) }), 'err', 5000);
    }
  } catch (err) {
    e.target.checked = !on;
    toast(t(err.message), 'err');
  }
});
$('#autoSwitch').addEventListener('change', (e) => run('setAutoSwitch', { value: e.target.checked }));
$('#autoSwitchM').addEventListener('change', (e) => run('setAutoSwitch', { value: e.target.checked }));
// ---------------------------------------------------------------- gizlilik kontrolü ("IP'mi göster")
// Çıkış IP'si, WebRTC ve DNS sızıntısı tek pencerede. WebRTC için bir STUN sunucusuna sorulur: dönen genel IP
// proxy'ninkinden farklıysa site de aynı yolla gerçek IP'yi görebilir.

// İsteğe bağlı "privacy" izni (WebRTC koruması). Tarayıcı izin penceresini yalnızca kullanıcı etkileşimi
// sürerken açtığı için tıklama/değişim olayında ilk iş olarak, araya await koymadan çağrılmalıdır.
const askPrivacy = () => chrome.permissions?.request?.({ permissions: ['privacy'] }).catch(() => false) ?? Promise.resolve(false);

async function webrtcIps(timeout = 4000) {
  if (typeof RTCPeerConnection === 'undefined') return null;
  const ips = new Set();
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.createDataChannel('leak');
    const done = new Promise((res) => {
      const timer = setTimeout(res, timeout);
      pc.onicecandidate = (e) => {
        const c = e.candidate?.candidate;
        if (!c) return clearTimeout(timer), res();
        // Adayın adres alanı (5. sütun): IPv6 adres de sızıntıdır; ".local" (mDNS) adları gerçek IP değildir.
        const addr = / typ srflx/.test(c) && c.split(' ')[4];
        if (addr && !addr.endsWith('.local')) ips.add(addr);
      };
    });
    await pc.setLocalDescription(await pc.createOffer());
    await done;
  } catch {
    return null;
  } finally {
    pc?.close();
  }
  return [...ips];
}

// Tarayıcının WebRTC ayarı proxy'den geçmeyen UDP'yi kapatıyor mu? (WebRTC koruması ya da başka bir eklenti/ayar.)
// Chrome bu ayarı eklentinin kendi sayfalarına uygulamaz: buradaki deneme gerçek IP'yi yine görür, web siteleri görmez.
// Bu yüzden ayar etkinse sonuç ayardan okunur. "privacy" izni yoksa chrome.privacy de yoktur → null.
async function webrtcBlocked() {
  const pol = chrome.privacy?.network?.webRTCIPHandlingPolicy;
  if (!pol) return null;
  try {
    const d = await pol.get({});
    return d.value === 'disable_non_proxied_udp';
  } catch {
    return null;
  }
}

const leakDlg = $('#leakDlg');
async function leakCheck() {
  const body = $('#leakBody');
  const again = $('#leakAgain');
  const p = store.active.enabled && store.proxies.get(store.active.id);
  const on = !!p;
  const line = (cls, title, html, extra = '') => `<div class="leak-row ${cls}"><b>${esc(title)}</b><div>${html}</div>${extra}</div>`;
  body.innerHTML = line('wait', t('leak.exit'), esc(t('leak.checking')));
  again.disabled = true;
  const blocked = on && (await webrtcBlocked());
  const [ipr, rtc] = await Promise.all([send('checkIp', { real: true }).catch((e) => ({ error: e.message })), blocked ? [] : webrtcIps()]);
  const rows = [];
  if (ipr.error) rows.push(line('bad', t('leak.exit'), esc(t('toast.ipFail', { err: t(ipr.error) }))));
  else {
    const loc = ipr.countryCode ? ` — ${flag(ipr.countryCode)} ${esc(countryName({ country: ipr.countryCode }))}${ipr.city ? ', ' + esc(ipr.city) : ''}` : '';
    const leaked = on && ipr.realIp && ipr.ip === ipr.realIp;
    const note = !on ? 'leak.off' : leaked ? 'leak.notProxied' : 'leak.exitOk';
    rows.push(line(!on || leaked ? 'bad' : 'ok', t('leak.exit'), `<span class="mono">${esc(ipr.ip)}</span>${loc} · ${num(ipr.ms)} ms<small>${esc(t(note))}</small>`));
  }
  if (blocked) rows.push(line('ok', t('leak.webrtc'), esc(t('leak.webrtcProtected'))));
  else if (rtc == null) rows.push(line('ok', t('leak.webrtc'), esc(t('leak.webrtcNone'))));
  else if (!on) rows.push(line('muted', t('leak.webrtc'), esc(t('leak.webrtcOff'))));
  else {
    // Proxy'ninkinden farklı ya da gerçek IP'yle aynı her genel IP sızıntıdır.
    const seen = rtc.filter((ip) => ip !== ipr.ip || ip === ipr.realIp);
    rows.push(
      seen.length
        ? line('bad', t('leak.webrtc'), esc(t('leak.webrtcLeak', { ip: seen.join(', ') })),
          store.settings.webrtcProtect ? '' : `<button type="button" class="btn sm primary" id="leakProtect">${esc(t('leak.protect'))}</button>`)
        : line('ok', t('leak.webrtc'), esc(t('leak.webrtcOk'))),
    );
  }
  rows.push(!on ? line('muted', t('leak.dns'), esc(t('leak.dnsOff')))
    : p.type === 'socks4' ? line('bad', t('leak.dns'), esc(t('leak.dnsSocks4')))
    : line('ok', t('leak.dns'), esc(t('leak.dnsOk'))));
  body.innerHTML = rows.join('');
  again.disabled = false;
}
$('#btnMyIp').addEventListener('click', () => {
  leakDlg.showModal();
  leakCheck();
});
$('#leakAgain').addEventListener('click', leakCheck);
$('#leakBody').addEventListener('click', async (e) => {
  if (!e.target.closest('#leakProtect')) return;
  if (!(await askPrivacy())) return toast(t('toast.permDenied'), 'err');
  await run('saveSettings', { settings: { webrtcProtect: true } }, t('toast.webrtcOn'));
  $('#settingsForm').elements.webrtcProtect.checked = true;
  setTimeout(leakCheck, 300);
});

function renderHeader() {
  const a = store.active;
  const p = a.id && store.proxies.get(a.id);
  const cp = store.connecting && store.proxies.get(store.connecting);
  const on = !!(a.enabled && p);
  // Tek kontrol: bağlıyken ya da bağlanırken açık; kapatmak bağlantıyı keser (bağlanmayı da iptal eder).
  $('#mainToggle').checked = on || !!cp;
  $('#toggleLabel').textContent = t(on || cp ? 'toggle.on' : 'toggle.off');
  $('#autoSwitch').checked = $('#autoSwitchM').checked = !!a.autoSwitch;
  const conn = $('#conn');
  conn.classList.toggle('connecting', !!cp);
  const bad = on && (a.failed || p.status === 'dead');
  conn.classList.toggle('on', !cp && on && !bad);
  conn.classList.toggle('bad', !cp && bad);
  if (cp) {
    $('#connTitle').innerHTML = `<span class="spin"></span> ${esc(t('conn.connecting'))} ${esc(addr(cp))}`;
    $('#connSub').textContent = t('conn.connectingSub');
  } else if (on) {
    $('#connTitle').innerHTML = `${p.country ? `<span class="flag">${flag(p.country)}</span>` : ''}${p.type.toUpperCase()} ${esc(addr(p))}`;
    const only = store.settings.routeOnly && store.settings.onlySites?.length;
    $('#connSub').textContent = [a.failed && t('conn.noResp', { err: errorText(a.failed) }), only && t('conn.onlySites', { n: only }), [countryName(p), p.city].filter(Boolean).join(', '), anonText(p.anon), p.ssl === true ? 'HTTPS ✓' : p.ssl === false ? 'HTTPS ✗' : '', p.latency != null && p.latency + ' ms', a.since && t('conn.since', { ago: ago(a.since) })]
      .filter(Boolean)
      .join(' · ');
  } else {
    $('#connTitle').textContent = t('conn.direct');
    $('#connSub').textContent = p ? t('conn.offLast', { addr: addr(p) }) : t(matchMedia('(hover: none)').matches ? 'conn.offHintTouch' : 'conn.offHint');
  }
  const warn = store.control === 'controlled_by_other_extensions' ? `<div style="color:var(--err)">${esc(t('side.otherExt'))}</div>` : '';
  const key = toggleKey ? `<br>${esc(t('side.toggleKey', { key: toggleKey }))}` : '';
  $('#sideInfo').innerHTML = `${warn}${esc(t('side.realIp'))}: <span class="mono">${store.realIp || '—'}</span><br>${esc(t('side.hint'))}${key}`;
}

// Aç/kapat kısayolu (kullanıcı tarayıcının kısayol ayarlarından değiştirmiş ya da kaldırmış olabilir).
let toggleKey = '';
chrome.commands?.getAll?.().then((all) => {
  toggleKey = all.find((c) => c.name === 'toggle-proxy')?.shortcut || '';
  if (toggleKey) renderHeader();
}).catch(() => {});

function renderJob() {
  const j = store.job;
  document.body.classList.toggle('job-on', !!j); // dar ekranda alt çubuk iş sürerken ilerlemeyi, yoksa sayıları gösterir
  $('#btnStop').hidden = !j;
  requestAnimationFrame(updateScrollHints); // "Durdur" araç çubuğunu genişletebilir
  $('#btnDownload').disabled = !!j;
  // Kaynaklar sayfasında da indirme/test sürerken "İndir" yerine "Durdur" görünür.
  $('#srcDownload').hidden = !!j;
  $('#srcStop').hidden = !j;
  $('#btnTest').disabled = !!j;
  if (!j) {
    $('#jobText').textContent = t('job.ready');
    $('#jobBar').style.width = '0';
    return;
  }
  const pct = j.total ? Math.round((j.done * 100) / j.total) : 0;
  let s = `${t(j.label)} — ${phaseText(j.phase)}`;
  if (j.total) s += ` · ${num(j.done)} / ${num(j.total)}`;
  if (j.phase === 'http' || j.phase === 'ssl' || j.phase === 'geo') s += ' · ' + t('job.counts', { alive: num(j.alive), dead: num(j.dead) });
  $('#jobText').textContent = s;
  $('#jobBar').style.width = pct + '%';
}

function renderCounts() {
  let alive = 0, dead = 0;
  for (const p of store.proxies.values()) isUsable(p) ? alive++ : p.status === 'dead' && dead++;
  $('#counts').innerHTML = `<span class="total">${t('counts.total')} <b>${num(store.proxies.size)}</b></span><span class="ok">${t('counts.alive')} <b>${num(alive)}</b></span><span class="bad">${t('counts.dead')} <b>${num(dead)}</b></span><span>${t('counts.visible')} <b>${num(ui.visible.length)}</b></span>${ui.selected.size ? `<span>${t('counts.selected')} <b>${num(ui.selected.size)}</b></span>` : ''}`;
}

// ---------------------------------------------------------------- kayıt paneli

$('#btnLog').addEventListener('click', () => {
  ui.logOpen = !ui.logOpen;
  $('#log').hidden = !ui.logOpen;
  renderLog(true);
  requestAnimationFrame(renderRows);
});

const logLine = (l) => `<div class="${l.level}"><time>${new Date(l.t).toLocaleTimeString(locale())}</time>${esc(logText(l))}</div>`;
function renderLog(full, add = []) {
  const box = $('#log');
  if (!ui.logOpen) return;
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  if (full) box.innerHTML = store.logs.slice(-300).map(logLine).join('');
  else box.insertAdjacentHTML('beforeend', add.map(logLine).join(''));
  while (box.childElementCount > 400) box.firstElementChild.remove();
  if (stick || full) box.scrollTop = box.scrollHeight;
}

// ---------------------------------------------------------------- kaynaklar

function renderSources() {
  const rows = store.sources
    .map((s, i) => {
      const avail = sourceTypes(s);
      const on = enabledTypes(s);
      const home = sourceHome(s);
      const types = avail
        .map((tp) => `<label class="tchk ${on.includes(tp) ? 'on' : ''} ${tp}"><input type="checkbox" data-type="${tp}" ${on.includes(tp) ? 'checked' : ''}>${tp.toUpperCase()}</label>`)
        .join('');
      const result = s.mine
        ? t('src.mineResult', { n: num(s.lastCount), fresh: num(s.lastNew), removed: num(s.lastRemoved || 0) })
        : t('src.result', { n: num(s.lastCount), fresh: num(s.lastNew) });
      const res = s.error
        ? `<span class="e" title="${esc(errorText(s.error))}">${esc(t('src.error', { err: errorText(s.error) }))}</span>`
        : s.lastFetch
          ? `${esc(result)}${s.failed ? ` <span class="w" title="${esc(t('src.error', { err: '' }))}">⚠ ${s.failed}</span>` : ''}`
          : `<span class="muted">${esc(t('src.never'))}</span>`;
      const when = [s.lastFetch && ago(s.lastFetch), s.mine && s.enabled && t('src.mineAuto')].filter(Boolean).join(' · ');
      // Kendi eklenen kaynaklarda "Benim proxy'lerim" sonradan da açılıp kapatılabilir.
      const mineCtl = s.custom
        ? `<label class="mine-toggle ${s.mine ? 'on' : ''}" title="${esc(t('src.mineCheckTitle'))}"><input type="checkbox" data-k="mine" ${s.mine ? 'checked' : ''}>${icon('user')}<span>${esc(t(s.mine ? 'src.mineTag' : 'src.mineToggle'))}</span></label>`
        : '';
      return `<div class="src-row ${s.enabled ? '' : 'off'} ${s.mine ? 'mine' : ''}" data-i="${i}">
        <label class="switch"><input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''}><span></span></label>
        <div class="src-name"><b>${esc(s.name)}${s.custom && !s.mine ? ` <span class="tag">${esc(t('src.custom'))}</span>` : ''}</b>
          <a href="${esc(home)}" target="_blank" rel="noreferrer" title="${esc(s.feeds.map((f) => f.url).join('\n'))}">${esc(home.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>${mineCtl}</div>
        <div class="types">${types}</div>
        <div class="res">${res}<br><span class="muted">${esc(when)}</span></div>
        <div>${s.custom ? `<button class="btn sm danger" data-del>${esc(t('src.delete'))}</button>` : ''}</div>
      </div>`;
    })
    .join('');
  $('#srcTable').innerHTML =
    `<div class="src-row head"><div>${t('src.col.enabled')}</div><div>${t('src.col.name')}</div><div>${t('src.col.type')}</div><div>${t('src.col.result')}</div><div></div></div>` + rows;
  renderCats();
}

function saveSources() {
  return run('saveSources', { sources: store.sources });
}

$('#srcTable').addEventListener('change', (e) => {
  const row = e.target.closest('.src-row');
  if (!row) return;
  const s = store.sources[+row.dataset.i];
  if (e.target.dataset.k === 'enabled') {
    s.enabled = e.target.checked;
  } else if (e.target.dataset.k === 'mine') {
    s.mine = e.target.checked;
    if (s.mine) s.enabled = true;
  } else if (e.target.dataset.type) {
    const checked = [...row.querySelectorAll('[data-type]')].filter((x) => x.checked).map((x) => x.dataset.type);
    s.types = checked;
    // Hiç tür seçili değilse kaynağı kapat; bir tür seçilince yeniden aç.
    if (!checked.length) s.enabled = false;
    else if (e.target.checked) s.enabled = true;
  } else return;
  saveSources();
});
$('#srcTable').addEventListener('click', (e) => {
  if (!e.target.closest('[data-del]')) return;
  const i = +e.target.closest('.src-row').dataset.i;
  store.sources.splice(i, 1);
  saveSources();
});
$('#srcAdd').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const mine = f.mine.checked;
  store.sources.unshift({ id: 'custom-' + Date.now().toString(36), name: f.name.value.trim(), feeds: [{ type: f.type.value, url: f.url.value.trim() }], enabled: true, custom: true, ...(mine ? { mine: true } : {}) });
  saveSources().then(() => {
    f.reset();
    if (mine) toast(t('src.mineAdded'), 'ok', 5000);
  });
});
$('#mineInfoIcon').innerHTML = icon('user');
$('#impListBtn').addEventListener('click', goAddMineList);

// Benim proxy'lerim'e liste adresi eklemek için Kaynaklar'a git: form "Benim proxy'lerim" seçili olarak açılır.
function goAddMineList() {
  if ($('#importDlg').open) $('#importDlg').close();
  showView('sources');
  const f = $('#srcAdd');
  f.mine.checked = true;
  $('#mineInfo').classList.add('flash');
  setTimeout(() => $('#mineInfo').classList.remove('flash'), 1600);
  f.scrollIntoView({ block: 'center' });
  f.name.focus();
}
$('#srcReset').addEventListener('click', () => {
  if (confirm(t('confirm.resetSources'))) run('resetSources', {}, t('toast.sourcesReset'));
});

// ---------------------------------------------------------------- ayarlar

// ---------------------------------------------------------------- site testi

const enabledSites = () => store.settings.sites || [];
const siteMs = (p, u) => (p.sites?.[u]?.ok ? p.sites[u].ms : 1e9);
function siteScore(p) {
  const r = enabledSites().map((u) => p.sites?.[u]).filter(Boolean);
  const ok = r.filter((x) => x.ok);
  return ok.length * 1e5 - (ok.length ? ok.reduce((n, x) => n + x.ms, 0) / ok.length : 0);
}

// Tablodaki "Siteler" hücresi: her etkin site için kısa ad + süre ya da — (X sitesinin kısa adı ✗ ile karışmasın); ayrıntı üzerine gelince.
function sitesHtml(p) {
  if (!p.sites) return '';
  return enabledSites()
    .filter((u) => p.sites[u])
    .map((u) => {
      const r = p.sites[u];
      const i = siteInfo(u);
      const tip = `${i.name}: ${r.ok ? r.ms + ' ms' : errorText(r.err)}`;
      return `<span class="site ${r.ok ? latencyClass(r.ms) || 'ok' : 'bad'}" title="${esc(tip)}">${esc(i.short)} ${r.ok ? shortMs(r.ms) : '—'}</span>`;
    })
    .join('');
}

function renderSiteFilter() {
  const sel = $('#fSite');
  const urls = enabledSites();
  if (ui.site && !urls.includes(ui.site)) ui.site = '';
  sel.innerHTML = `<option value="">${esc(t('filter.allSites'))}</option>` + urls.map((u) => `<option value="${esc(u)}">${esc(t('filter.worksOn', { site: siteInfo(u).name }))}</option>`).join('');
  sel.value = ui.site;
  sel.hidden = !store.settings.siteTest || !urls.length;
  sitesWidth(urls);
}

// Siteler sütunu en fazla, açık sitelerin rozetleri ("FAN 9.9s") yan yana sığacak kadar genişler; daha dar
// kalırsa hücre yana kayar. Sınır: çok sayıda site eklense de sütun ekranı kaplamasın.
function sitesWidth(urls) {
  const probe = document.createElement('div');
  probe.className = 'row';
  probe.style.cssText = 'position:absolute;visibility:hidden;display:block;width:auto';
  probe.innerHTML = `<div class="sites"><div class="sl" style="display:inline-flex">${urls.map((u) => `<span class="site">${esc(siteInfo(u).short)} 9.9s</span>`).join('')}</div></div>`;
  $('#rows').append(probe);
  const w = Math.ceil(probe.querySelector('.sl').getBoundingClientRect().width);
  probe.remove();
  if (!w && urls.length) return; // liste görünümü gizliyken ölçülemez; showView('list') yeniden ölçer
  $('#tbody').style.setProperty('--sites-w', Math.min(Math.max(w, 70), 440) + 'px');
}

function renderSiteSettings() {
  $('#siteList').innerHTML = siteList(enabledSites())
    .map(
      (s) => `<label class="site-chip ${s.enabled ? 'on' : ''}" data-url="${esc(s.url)}" title="${esc(s.url + (s.enabled ? ' · ' + t('set.siteDrag') : ''))}">
        ${s.enabled ? `<span class="grip">${icon('grip')}</span>` : ''}<input type="checkbox" data-site="${esc(s.url)}" ${s.enabled ? 'checked' : ''} /><b>${esc(s.short)}</b> ${esc(s.name)}
        ${s.custom ? `<button type="button" class="x" data-site-del="${esc(s.url)}" title="${esc(t('set.siteDelete'))}">×</button>` : ''}
      </label>`,
    )
    .join('');
}

const saveSites = (sites) => run('saveSettings', { settings: { sites } });
$('#siteList').addEventListener('change', (e) => {
  const u = e.target.dataset.site;
  if (!u) return;
  const cur = enabledSites().filter((x) => x !== u);
  saveSites(e.target.checked ? [...cur, u] : cur);
});
$('#siteList').addEventListener('click', (e) => {
  const u = e.target.closest('[data-site-del]')?.dataset.siteDel;
  if (!u) return;
  e.preventDefault();
  saveSites(enabledSites().filter((x) => x !== u));
});
// Açık siteler sürüklenerek sıralanır (fareyle çipin her yerinden, dokunmatikte ⠿ tutamacından; sayfa kaydırması bozulmasın).
// Bu sıra tablodaki Siteler sütununda ve açılır penceredeki satırda da kullanılır.
let chipDrag = null;
$('#siteList').addEventListener('pointerdown', (e) => {
  const chip = e.target.closest('.site-chip.on');
  if (!chip || e.button !== 0 || e.target.closest('.x')) return;
  if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) return;
  chipDrag = { chip, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
});
document.addEventListener('pointermove', (e) => {
  const d = chipDrag;
  if (!d || e.pointerId !== d.id) return;
  if (!d.moved) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    d.chip.classList.add('dragging');
    document.body.classList.add('grabbing');
  }
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.site-chip.on');
  if (!over || over === d.chip) return;
  const r = over.getBoundingClientRect();
  over[e.clientX > r.left + r.width / 2 ? 'after' : 'before'](d.chip);
});
function endChipDrag(e) {
  const d = chipDrag;
  if (!d || e.pointerId !== d.id) return;
  chipDrag = null;
  if (!d.moved) return;
  d.chip.classList.remove('dragging');
  document.body.classList.remove('grabbing');
  // Bırakınca gelen tıklama kutuyu açıp kapatmasın.
  const stop = (ev) => (ev.preventDefault(), ev.stopPropagation());
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }));
  const order = [...$('#siteList').querySelectorAll('.site-chip.on')].map((c) => c.dataset.url);
  if (order.join() !== enabledSites().join()) saveSites(order);
}
document.addEventListener('pointerup', endChipDrag);
document.addEventListener('pointercancel', endChipDrag);
function addSite() {
  const u = normalizeSiteUrl($('#siteAddUrl').value);
  if (!u) return toast(t('toast.siteInvalid'), 'err');
  if (!enabledSites().includes(u)) saveSites([...enabledSites(), u]);
  $('#siteAddUrl').value = '';
}
$('#siteAddBtn').addEventListener('click', addSite);
$('#siteAddUrl').addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), addSite()));

function fillSettings() {
  renderSiteSettings();
  renderSiteFilter();
  const f = $('#settingsForm');
  for (const [k, v] of Object.entries(store.settings)) {
    const inp = f.elements[k];
    if (!inp) continue;
    if (inp.type === 'checkbox') inp.checked = !!v;
    else inp.value = Array.isArray(v) ? v.join('\n') : v;
  }
  $('#onlySitesRow').hidden = !f.elements.routeOnly.checked;
}
$('#routeOnly').addEventListener('change', (e) => ($('#onlySitesRow').hidden = !e.target.checked));

// WebRTC korumasını açmak tarayıcıdan bir kez izin ister; verilmezse anahtar kapalı kalır.
$('#settingsForm').elements.webrtcProtect.addEventListener('change', async (e) => {
  if (e.target.checked && !(await askPrivacy())) {
    e.target.checked = false;
    toast(t('toast.permDenied'), 'err');
  }
});

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const s = {};
  for (const k of Object.keys(store.settings)) {
    const inp = f.elements[k];
    if (!inp) continue;
    if (inp.type === 'checkbox') s[k] = inp.checked;
    else if (inp.type === 'number') s[k] = +inp.value;
    else if (k === 'bypass') s[k] = inp.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    else if (k === 'onlySites') s[k] = [...new Set(inp.value.split(/\r?\n/).map(cleanSiteEntry).filter(Boolean))];
    else s[k] = inp.value.trim();
  }
  if (!/^http:\/\//i.test(s.judgeUrl)) return toast(t('toast.judgeHttp'), 'err');
  await run('saveSettings', { settings: s }, t('toast.settingsSaved'));
  if (s.lang !== langSetting) location.reload();
});

// ---------------------------------------------------------------- senkronizasyon

function syncLine(s, on, onText, offText) {
  if (!on) return `<span class="muted">${esc(offText)}</span>`;
  const parts = [`<b class="ok">${esc(onText)}</b>`];
  if (s.lastPush) parts.push(esc(t('sync.lastPush', { ago: ago(s.lastPush), n: num(s.count || 0) })));
  if (s.lastPull) parts.push(esc(t('sync.lastPull', { ago: ago(s.lastPull) })));
  if (!s.lastPush && !s.lastPull) parts.push(`<span class="muted">${esc(t('sync.never'))}</span>`);
  let html = parts.join(' · ');
  if (s.error) html += `<div class="err">⚠ ${esc(t(s.error))}</div>`;
  return html;
}

function renderSync() {
  const sy = store.sync;
  if (!sy) return;
  // Tarayıcı senkronu olmayan tarayıcılarda (Opera) seçenek gizlenir; Google Drive senkronu kalır.
  // Firefox for Android'de ikisi de yoktur: bölümde yalnızca bir not görünür.
  const noBrowserSync = sy.chrome.available === false;
  const noDrive = sy.drive.available === false;
  for (const el of document.querySelectorAll('.sync-box .drive-part')) el.hidden = noDrive;
  $('#syncDesc').hidden = noBrowserSync && noDrive;
  $('#syncUnavailable').hidden = !(noBrowserSync && noDrive);
  $('#syncActions').hidden = noBrowserSync && noDrive;
  $('#settingsForm').elements.syncChrome.closest('label').hidden = noBrowserSync;
  $('#syncChromeStatus').hidden = noBrowserSync;
  $('#syncChromeStatus').innerHTML = syncLine(sy.chrome, sy.chrome.enabled, t('sync.on'), t('sync.off'));
  const d = sy.drive;
  $('#driveConnect').hidden = !!d.connected && !d.error; // hata varken yeniden bağlanabilsin
  $('#driveConnect').disabled = !d.configured;
  $('#driveAccount').hidden = !d.connected;
  $('#driveAccount').innerHTML = d.connected ? `<span class="ok">✓</span> ${esc(t('sync.as', { email: d.email || 'Google' }))}` : '';
  $('#driveDisconnect').hidden = !d.connected;
  $('#syncDriveStatus').innerHTML = d.connected
    ? syncLine(d, true, t('sync.connected'), '')
    : d.configured
      ? `<span class="muted">${esc(t('sync.googleHint'))}</span>`
      : `<span class="warn">${esc(t('sync.notConfigured'))}</span>`;
  if (!d.configured) $('#driveAdvanced').open = true;
  $('#redirectUri').textContent = sy.redirectUri;
  $('#syncNow').disabled = !(sy.chrome.enabled || sy.drive.connected);
  renderCredsNote();
}

// Firefox: "kimlik doğrulama bilgisi" veri izni verilmediyse özel proxy şifreleri senkrona yazılmaz; kullanıcıya söyle.
const hasCredProxies = () => [...store.proxies.values()].some((p) => p.user);
async function renderCredsNote() {
  const el = $('#syncCredsNote');
  const sy = store.sync;
  const show = IS_FIREFOX && (sy.chrome.enabled || sy.drive.connected) && hasCredProxies() && !(await credsSyncAllowed());
  el.hidden = !show;
  el.textContent = show ? t('sync.noCreds') : '';
}

// Senkron düğmelerine basılınca, şifreli proxy varsa Firefox'un veri iznini iste (kullanıcı etkileşimi içinde, ilk iş olarak).
function askCredsIfNeeded() {
  if (!IS_FIREFOX || !hasCredProxies()) return Promise.resolve();
  return requestCredsSync().then(renderCredsNote);
}

$('#copyRedirect').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('#redirectUri').textContent);
  toast(t('toast.copiedText'), 'ok');
});
$('#driveConnect').addEventListener('click', async () => {
  const creds = askCredsIfNeeded();
  const id = $('#settingsForm').elements.driveClientId.value.trim();
  if (!id && !store.sync?.drive?.builtin) return toast(t('e.driveNoClient'), 'err');
  const b = $('#driveConnect');
  b.disabled = true;
  try {
    await creds;
    if (id !== (store.settings.driveClientId || '')) await send('saveSettings', { settings: { driveClientId: id } });
    const r = await run('driveConnect');
    toast(t('sync.as', { email: r.drive.email || 'Google' }), 'ok');
  } catch {
  } finally {
    b.disabled = false;
  }
});
$('#driveDisconnect').addEventListener('click', () => run('driveDisconnect'));
$('#syncNow').addEventListener('click', async () => {
  const creds = askCredsIfNeeded();
  const b = $('#syncNow');
  b.disabled = true;
  try {
    await creds;
    const r = await run('syncNow');
    const err = r.chrome.error || r.drive.error;
    toast(err ? t(err) : t('toast.syncDone'), err ? 'err' : 'ok');
  } catch {
  } finally {
    b.disabled = false;
  }
});

// Sayfa açılışında URL ile görünüm seçimi (ör. manager.html#sources)
if (location.hash === '#sources' || location.hash === '#settings') showView(location.hash.slice(1));
setInterval(() => store.ready && (renderHeader(), ui.view === 'list' && renderRows()), 30000);
