import { initLang, applyI18n, num, locale } from './lib/i18n.js';
import {
  createStore, send, run, toast, t, errorText, CATEGORIES, anonText, statusText, phaseText, logText,
  countryName, flag, ago, latencyClass, addr, uptime, esc, connectWithFeedback,
} from './lib/ui.js';
import { icon } from './lib/icons.js';
import { formatProxy } from './lib/parse.js';
import { sourceTypes, enabledTypes, sourceHome } from './lib/sources.js';

const langSetting = await initLang();
applyI18n();

const $ = (s) => document.querySelector(s);
const ROW_H = 36;

const ui = {
  view: 'list',
  cat: 'all',
  search: '',
  type: '',
  country: '',
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
setBtn('#btnDownload', 'download', t('tb.download'));
setBtn('#btnTest', 'play', t('tb.test'));
$('#btnTest').insertAdjacentHTML('beforeend', icon('chevron'));
setBtn('#btnStop', 'stop', t('tb.stop'));
setBtn('#btnImport', 'upload', t('tb.import'));
setBtn('#btnCopy', 'copy', t('tb.copy'));
setBtn('#btnDelete', 'trash', t('tb.delete'));
setBtn('#btnMyIp', 'globe', t('myip'));
setBtn('#srcDownload', 'download', t('src.download'));
setBtn('#srcAdd button', 'plus', t('src.add'));
setBtn('#btnLog', 'terminal', t('log.btn'));
$('#driveConnect').innerHTML = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span>${esc(t('sync.google'))}</span>`;
setBtn('#syncNow', 'refresh', t('sync.now'));
const navSources = document.querySelector('[data-view=sources]');
const navSettings = document.querySelector('[data-view=settings]');
navSources.innerHTML = icon('source') + `<span>${t('nav.sources')}</span><span class="n" id="nSources"></span>`;
navSettings.innerHTML = icon('gear') + `<span>${t('nav.settings')}</span>`;

const LANG_OPTIONS = () => [['auto', t('set.langAuto')], ['tr', 'Türkçe'], ['en', 'English']];
for (const sel of [$('#langSelect'), $('#langQuick')]) {
  sel.innerHTML = LANG_OPTIONS().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  sel.value = langSetting;
}
$('#langQuick').addEventListener('change', async (e) => {
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
  { key: 'act', label: '' },
];
$('#thead').innerHTML = COLS.map((c) =>
  c.key === 'act'
    ? `<div class="act"><button class="btn ghost sm resort" id="btnResort" title="${esc(t('sort.resortTitle'))}">${icon('refresh')}<span>${esc(t('sort.resort'))}</span></button></div>`
    : `<div data-sort="${c.key}" title="${c.label ? esc(t('sort.title', { c: t(c.label) })) : ''}">${c.label ? esc(t(c.label)) : ''}</div>`,
).join('');
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
const nullLast = (a, b, f) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : f(a, b));
const collator = new Intl.Collator(locale());

const SORTS = {
  fav: (a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0),
  addr: (a, b) => ipNum(a.host) - ipNum(b.host) || a.port - b.port,
  type: (a, b) => a.type.localeCompare(b.type),
  status: (a, b) => statusRank(a) - statusRank(b) || nullLast(a.latency, b.latency, (x, y) => x - y),
  anon: (a, b) => nullLast(anonRank[a.anon], anonRank[b.anon], (x, y) => x - y),
  ssl: (a, b) => sslRank(a.ssl) - sslRank(b.ssl) || (a.sslMs ?? 1e9) - (b.sslMs ?? 1e9),
  latency: (a, b) => nullLast(a.latency, b.latency, (x, y) => x - y),
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
    if (q && !`${p.host}:${p.port} ${p.country || ''} ${countryName(p)} ${p.city || ''} ${p.isp || ''} ${p.type}`.toLocaleLowerCase(locale()).includes(q)) continue;
    out.push(p);
  }
  const f = SORTS[ui.sortKey] || SORTS.status;
  const cmp = (a, b) => f(a, b) * ui.sortDir || SORTS.status(a, b);
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
  for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'view-' + v;
  dataChanged();
}

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
  const st = p.checking ? `<span class="chip checking">${t('status.checking')}</span>` : `<span class="chip ${p.status}">${statusText(p.status)}</span>`;
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
    <div class="muted">${esc(sourceName(p.source))}</div>
    <div class="act">${btn}</div>
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

  const empty = $('#empty');
  empty.hidden = n > 0;
  if (!n) {
    const none = store.proxies.size === 0;
    empty.innerHTML = none
      ? `<b>${t('empty.none.title')}</b><span>${t('empty.none.text')}</span><button class="btn primary" id="emptyDl">${icon('download')}<span>${t('tb.download')}</span></button>`
      : `<b>${t('empty.filter.title')}</b><span>${t('empty.filter.text')}</span>`;
    $('#emptyDl')?.addEventListener('click', download);
  }
  for (const d of $('#thead').children) {
    d.classList.toggle('sorted', d.dataset.sort === ui.sortKey);
    d.classList.toggle('asc', ui.sortDir === -1);
  }
}

tbody.addEventListener('scroll', () => requestAnimationFrame(renderRows), { passive: true });
window.addEventListener('resize', () => requestAnimationFrame(renderRows));

$('#thead').addEventListener('click', (e) => {
  const k = e.target.closest('[data-sort]')?.dataset.sort;
  if (!k || k === 'act') return;
  if (ui.sortKey === k) ui.sortDir *= -1;
  else (ui.sortKey = k), (ui.sortDir = 1);
  resort();
  dataChanged();
});

rowsEl.addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const p = store.proxies.get(row.dataset.id);
  if (!p) return;
  if (e.target.closest('[data-fav]')) return void send('fav', { ids: [p.id], value: !p.fav });
  if (e.target.closest('[data-connect]')) return void toggleConnect(p);
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
  if (!row || e.button !== 0 || e.target.closest('button')) return;
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

// İçe aktarma
const dlg = $('#importDlg');
$('#btnImport').addEventListener('click', () => dlg.showModal());
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
$('#btnMyIp').addEventListener('click', async () => {
  const b = $('#btnMyIp');
  b.disabled = true;
  try {
    const r = await send('checkIp');
    const loc = r.countryCode ? ` — ${flag(r.countryCode)} ${countryName({ country: r.countryCode })}${r.city ? ', ' + r.city : ''}${r.isp ? ` (${r.isp})` : ''}` : '';
    toast(t('toast.myIp', { ip: r.ip, loc, ms: r.ms }), 'ok', 6000);
  } catch (e) {
    toast(t('toast.ipFail', { err: t(e.message) }), 'err');
  } finally {
    b.disabled = false;
  }
});

function renderHeader() {
  const a = store.active;
  const p = a.id && store.proxies.get(a.id);
  const cp = store.connecting && store.proxies.get(store.connecting);
  const on = !!(a.enabled && p);
  // Tek kontrol: bağlıyken ya da bağlanırken açık; kapatmak bağlantıyı keser (bağlanmayı da iptal eder).
  $('#mainToggle').checked = on || !!cp;
  $('#toggleLabel').textContent = t(on || cp ? 'toggle.on' : 'toggle.off');
  $('#autoSwitch').checked = !!a.autoSwitch;
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
    $('#connSub').textContent = [a.failed && t('conn.noResp', { err: errorText(a.failed) }), [countryName(p), p.city].filter(Boolean).join(', '), anonText(p.anon), p.ssl === true ? 'HTTPS ✓' : p.ssl === false ? 'HTTPS ✗' : '', p.latency != null && p.latency + ' ms', a.since && t('conn.since', { ago: ago(a.since) })]
      .filter(Boolean)
      .join(' · ');
  } else {
    $('#connTitle').textContent = t('conn.direct');
    $('#connSub').textContent = p ? t('conn.offLast', { addr: addr(p) }) : t('conn.offHint');
  }
  const warn = store.control === 'controlled_by_other_extensions' ? `<div style="color:var(--err)">${esc(t('side.otherExt'))}</div>` : '';
  $('#sideInfo').innerHTML = `${warn}${esc(t('side.realIp'))}: <span class="mono">${store.realIp || '—'}</span><br>${esc(t('side.hint'))}`;
}

function renderJob() {
  const j = store.job;
  $('#btnStop').hidden = !j;
  $('#btnDownload').disabled = !!j;
  $('#srcDownload').disabled = !!j;
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
  for (const p of store.proxies.values()) p.status === 'alive' ? alive++ : p.status === 'dead' && dead++;
  $('#counts').innerHTML = `<span>${t('counts.total')} <b>${num(store.proxies.size)}</b></span><span class="ok">${t('counts.alive')} <b>${num(alive)}</b></span><span class="bad">${t('counts.dead')} <b>${num(dead)}</b></span><span>${t('counts.visible')} <b>${num(ui.visible.length)}</b></span>${ui.selected.size ? `<span>${t('counts.selected')} <b>${num(ui.selected.size)}</b></span>` : ''}`;
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
      const res = s.error
        ? `<span class="e" title="${esc(errorText(s.error))}">${esc(t('src.error', { err: errorText(s.error) }))}</span>`
        : s.lastFetch
          ? `${esc(t('src.result', { n: num(s.lastCount), fresh: num(s.lastNew) }))}${s.failed ? ` <span class="w" title="${esc(t('src.error', { err: '' }))}">⚠ ${s.failed}</span>` : ''}`
          : `<span class="muted">${esc(t('src.never'))}</span>`;
      return `<div class="src-row ${s.enabled ? '' : 'off'}" data-i="${i}">
        <label class="switch"><input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''}><span></span></label>
        <div class="src-name"><b>${esc(s.name)}${s.custom ? ` <span class="tag">${esc(t('src.custom'))}</span>` : ''}</b>
          <a href="${esc(home)}" target="_blank" rel="noreferrer" title="${esc(s.feeds.map((f) => f.url).join('\n'))}">${esc(home.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></div>
        <div class="types">${types}</div>
        <div class="res">${res}<br><span class="muted">${s.lastFetch ? ago(s.lastFetch) : ''}</span></div>
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
  store.sources.unshift({ id: 'custom-' + Date.now().toString(36), name: f.name.value.trim(), feeds: [{ type: f.type.value, url: f.url.value.trim() }], enabled: true, custom: true });
  saveSources().then(() => f.reset());
});
$('#srcReset').addEventListener('click', () => {
  if (confirm(t('confirm.resetSources'))) run('resetSources', {}, t('toast.sourcesReset'));
});

// ---------------------------------------------------------------- ayarlar

function fillSettings() {
  const f = $('#settingsForm');
  for (const [k, v] of Object.entries(store.settings)) {
    const inp = f.elements[k];
    if (!inp) continue;
    if (inp.type === 'checkbox') inp.checked = !!v;
    else inp.value = Array.isArray(v) ? v.join('\n') : v;
  }
}

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
}

$('#copyRedirect').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('#redirectUri').textContent);
  toast(t('toast.copiedText'), 'ok');
});
$('#driveConnect').addEventListener('click', async () => {
  const id = $('#settingsForm').elements.driveClientId.value.trim();
  if (!id && !store.sync?.drive?.builtin) return toast(t('e.driveNoClient'), 'err');
  const b = $('#driveConnect');
  b.disabled = true;
  try {
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
  const b = $('#syncNow');
  b.disabled = true;
  try {
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
