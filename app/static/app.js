/* Calendar & Tasks — front end.
   No build step, no framework, no CDN: the whole app must work offline from a
   single container.  The same file drives the full page and the compact
   dashboard embed; `document.body.classList.contains('compact')` is the only
   difference, plus a few features the embed hides (.full-only).

   Recurring-edit model mirrors Google Calendar: touching a recurring
   occurrence asks "only this / this and following / all", and the server
   stores exceptions keyed by the ORIGINAL occurrence date (occ_date). */
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const pad = (n) => String(n).padStart(2, '0');

/* ── i18n ─────────────────────────────────────────────────────────────── */
const STR = {
  tr: {
    today: 'Bugün', day: 'Gün', day3: '3 gün', week: 'Hafta', day7: '7 gün',
    month: 'Ay', agenda: 'Ajanda', add: 'Ekle', clearTime: 'Saati kaldır (tüm güne çevir)',
    allday: 'tüm gün', tasks: 'Görevler', newTask: 'Görev ekle…',
    noTasks: 'görev yok', event: 'Etkinlik', task: 'Görev',
    title: 'Başlık', starts: 'Başlangıç', ends: 'Bitiş', allDayField: 'Tüm gün',
    notes: 'Not', location: 'Yer', calendar: 'Takvim', list: 'Liste',
    repeat: 'Tekrar', until: 'Bitiş tarihi', due: 'Tarih', time: 'Saat',
    save: 'Kaydet', cancel: 'İptal', del: 'Sil', duplicate: 'Çoğalt',
    none: 'yok', daily: 'Her gün', weekly: 'Her hafta', monthly: 'Her ay', yearly: 'Her yıl',
    every: 'her', evUnit: { daily: 'günde bir', weekly: 'haftada bir', monthly: 'ayda bir', yearly: 'yılda bir' },
    subscribe: 'Telefona ekle', close: 'Kapat', settings: 'Ayarlar',
    subHelp: 'Ayarlar → Takvim → Hesap ekle → Abone olunan takvim → adresi yapıştır. Salt-okunur, hesap/parola gerekmez.',
    dows: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
    dowsMin: ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'],
    months: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz',
      'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
    overdue: 'gecikmiş', tomorrow: 'yarın',
    create: 'Yeni', kindEvent: 'Etkinlik', kindTask: 'Görev',
    tabOpen: 'Açık', tabDone: 'Bitenler', completed: 'Tamamlandı',
    noDone: 'tamamlanan görev yok', reopen: 'Geri al',
    createdAt: 'oluşturuldu', doneAt: 'tamamlandı',
    scopeEditTitle: 'Tekrarlayan etkinliği düzenle', scopeDelTitle: 'Tekrarlayan etkinliği sil',
    scopeOne: 'Yalnız bu etkinlik', scopeFollowing: 'Bu ve sonraki etkinlikler',
    scopeAll: 'Tüm etkinlikler', ok: 'Tamam',
    color: 'Renk', colorCal: 'Takvim rengi', reminder: 'Hatırlatma',
    remNone: 'Hatırlatma ekle…',
    remLabels: { 0: 'Başlangıçta', 5: '5 dk önce', 10: '10 dk önce', 15: '15 dk önce',
      30: '30 dk önce', 60: '1 saat önce', 120: '2 saat önce', 1440: '1 gün önce',
      2880: '2 gün önce', 10080: '1 hafta önce' },
    onDays: 'Günler', undo: 'Geri al', moved: 'taşındı', resized: 'süresi değişti',
    deleted: 'silindi', search: 'Ara', searchPh: 'Etkinlik ve görevlerde ara…',
    noResults: 'sonuç yok', zoomIn: 'Yakınlaştır', zoomOut: 'Uzaklaştır',
    tz2: 'İkinci saat dilimi', tz2Off: 'Kapalı', feeds: 'Takvim abonelik adresleri',
    noEvents: 'etkinlik yok', dragCreateHint: 'Yeni etkinlik',
    savedOne: 'Yalnız bu etkinlik güncellendi', savedFollowing: 'Bu ve sonrakiler güncellendi',
    weekOf: 'haftası', editBtn: 'Düzenle',
    hideDoneTip: 'Biten görevleri takvimde gizle/göster',
    projected: 'gelecek tekrar (tamamlama sıradaki tekrarda)',
    taskScopeTitle: 'Rutin görevi taşı', taskScopeOne: 'Yalnız bu görev',
    taskScopeAll: 'Bütün rutin (seri)', moveDlg: 'Pencereyi sürükleyerek taşı',
    taskDelTitle: 'Rutin görevi sil', taskDelOne: 'Yalnız bu tekrar (sıradakine atla)',
    taskDelAll: 'Bu ve sonraki tekrarlar (rutin biter)',
    skippedOne: 'Bu tekrar atlandı', tabTrash: 'Silinenler',
    trashEmpty: 'son 24 saatte silinen yok', trashInfo: 'Silinenler 24 saat saklanır, sonra kalıcı silinir',
    restoreBtn: 'Geri al',
    tzLocal: 'Yerel (otomatik)', tz1: 'Birinci saat dilimi',
    tzCollapse: 'İkinci dilimi daralt', tzExpand: 'İkinci dilimi göster',
    importTitle: "Google'dan içe aktar",
    importIcs: 'Takvim (.ics dosyaları)', importTasks: 'Görevler (Takeout .json)',
    importIcsHelp: 'Google Takvim → Ayarlar → Dışa ve içe aktar → Dışa aktar (zip içindeki .ics dosyalarını seç — birden çok seçilebilir)',
    importTasksHelp: 'takeout.google.com → yalnız Tasks → JSON dosyasını seç',
    importDone: 'içe aktarıldı', importFail: 'içe aktarma başarısız',
  },
  en: {
    today: 'Today', day: 'Day', day3: '3 days', week: 'Week', day7: '7 days',
    month: 'Month', agenda: 'Schedule', add: 'Add', clearTime: 'Clear time (make all-day)',
    allday: 'all-day', tasks: 'Tasks', newTask: 'Add a task…',
    noTasks: 'no tasks', event: 'Event', task: 'Task',
    title: 'Title', starts: 'Starts', ends: 'Ends', allDayField: 'All day',
    notes: 'Notes', location: 'Location', calendar: 'Calendar', list: 'List',
    repeat: 'Repeat', until: 'Until', due: 'Date', time: 'Time',
    save: 'Save', cancel: 'Cancel', del: 'Delete', duplicate: 'Duplicate',
    none: 'none', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
    every: 'every', evUnit: { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' },
    subscribe: 'Add to phone', close: 'Close', settings: 'Settings',
    subHelp: 'Settings → Calendar → Add Account → Add Subscribed Calendar → paste the URL. Read-only, no account needed.',
    dows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    dowsMin: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'],
    overdue: 'overdue', tomorrow: 'tomorrow',
    create: 'New', kindEvent: 'Event', kindTask: 'Task',
    tabOpen: 'Open', tabDone: 'Completed', completed: 'Completed',
    noDone: 'no completed tasks', reopen: 'Reopen',
    createdAt: 'created', doneAt: 'completed',
    scopeEditTitle: 'Edit recurring event', scopeDelTitle: 'Delete recurring event',
    scopeOne: 'This event', scopeFollowing: 'This and following events',
    scopeAll: 'All events', ok: 'OK',
    color: 'Color', colorCal: 'Calendar color', reminder: 'Reminder',
    remNone: 'Add reminder…',
    remLabels: { 0: 'At start', 5: '5 min before', 10: '10 min before', 15: '15 min before',
      30: '30 min before', 60: '1 hour before', 120: '2 hours before', 1440: '1 day before',
      2880: '2 days before', 10080: '1 week before' },
    onDays: 'On days', undo: 'Undo', moved: 'moved', resized: 'resized',
    deleted: 'deleted', search: 'Search', searchPh: 'Search events & tasks…',
    noResults: 'no results', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    tz2: 'Second time zone', tz2Off: 'Off', feeds: 'Calendar feed URLs',
    noEvents: 'no events', dragCreateHint: 'New event',
    savedOne: 'Only this event updated', savedFollowing: 'This and following updated',
    weekOf: 'week of', editBtn: 'Edit',
    hideDoneTip: 'Hide/show completed tasks on the calendar',
    projected: 'upcoming repeat (complete the current one)',
    taskScopeTitle: 'Move routine task', taskScopeOne: 'Only this task',
    taskScopeAll: 'The whole routine', moveDlg: 'Drag to move this window',
    taskDelTitle: 'Delete routine task', taskDelOne: 'Only this repeat (skip to next)',
    taskDelAll: 'This and following repeats (ends the routine)',
    skippedOne: 'This repeat was skipped', tabTrash: 'Deleted',
    trashEmpty: 'nothing deleted in the last 24h', trashInfo: 'Deleted items are kept for 24 hours',
    restoreBtn: 'Restore',
    tzLocal: 'Local (automatic)', tz1: 'Primary time zone',
    tzCollapse: 'Collapse second zone', tzExpand: 'Show second zone',
    importTitle: 'Import from Google',
    importIcs: 'Calendar (.ics files)', importTasks: 'Tasks (Takeout .json)',
    importIcsHelp: 'Google Calendar → Settings → Import & export → Export (pick the .ics files from the zip — multiple allowed)',
    importTasksHelp: 'takeout.google.com → Tasks only → pick the JSON file',
    importDone: 'imported', importFail: 'import failed',
  },
};
let T = STR.tr;

/* Google-Calendar-adjacent event palette. First entry = "calendar color". */
const PALETTE = ['#5b9dff', '#33b679', '#8e24aa', '#e67c73', '#f6bf26',
  '#f4511e', '#039be5', '#7986cb', '#0b8043', '#d50000', '#616161', '#e46fb0'];
const REM_CHOICES = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];

/* ── state ────────────────────────────────────────────────────────────── */
const S = {
  anchor: new Date(),          // any date inside the shown range
  view: 'week',                // day | 3day | week | 7day | month | agenda
  firstWeekday: 0,
  compact: document.body.classList.contains('compact'),
  data: { events: [], tasks: [], start: null, end: null, today: null },
  lists: [], calendars: [], allTasks: [], doneTasks: [], taskTab: 'open',
  tz1: null,                   // primary hour column timezone (null = browser local)
  tz2: null,                   // second timezone gutter (IANA name) or null
  tz2Gizli: false,             // ikinci dilim ayarda dursun ama olukta daralt
  hideDone: false,             // hide completed tasks on the calendar itself
  alldayOpen: false,           // all-day strip expanded?
  preview: null,               // pinned create-preview: {segs:[{date,from,to}]}
};

/* Implicit Enter submission clicks the FIRST submit button in the form —
   which used to be Cancel, so Enter closed dialogs without saving. A hidden
   "ok" button at the top of every form makes Save the default. */
const GHOST_OK = '<button value="ok" class="ghost-ok" tabindex="-1" aria-hidden="true"></button>';
const LS = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { } },
  del: (k) => { try { localStorage.removeItem(k); } catch { } },
};
const LSK = (k) => `caltask-${k}-${S.compact ? 'panel' : 'tam'}`;

/* ── date helpers (local, no libraries) ───────────────────────────────── */
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const startOfWeek = (d, fw) => addDays(d, -(((d.getDay() + 6) % 7) - fw + 7) % 7);
const minutesOf = (s) => { const t = s.slice(11, 16); return t ? (+t.slice(0, 2)) * 60 + (+t.slice(3, 5)) : 0; };
const snap15 = (m) => Math.max(0, Math.min(1425, Math.round(m / 15) * 15));
const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const dtStr = (dateS, mins) => `${dateS} ${hm(mins)}`;

function viewDef() {
  return {
    day: { days: 1, snap: false }, '3day': { days: 3, snap: false },
    week: { days: 7, snap: true }, '7day': { days: 7, snap: false },
    month: { days: 42, snap: false }, agenda: { days: 30, snap: false },
  }[S.view] || { days: 7, snap: true };
}
function rangeStart() {
  if (S.view === 'month') return startOfWeek(new Date(S.anchor.getFullYear(), S.anchor.getMonth(), 1), S.firstWeekday);
  if (viewDef().snap) return startOfWeek(S.anchor, S.firstWeekday);
  return new Date(S.anchor);
}
const rangeDays = () => viewDef().days;

/* ── data ─────────────────────────────────────────────────────────────── */
async function api(path, opts) {
  const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (!r.ok) throw new Error(`${r.status}`);
  return r.status === 204 ? null : r.json();
}

async function load() {
  const start = iso(rangeStart());
  const [range, lists, cals, tasks, all] = await Promise.all([
    api(`api/range?start=${start}&days=${rangeDays()}`),
    api('api/lists'), api('api/calendars'), api('api/tasks'),
    api('api/tasks?include_done=1'),
  ]);
  S.data = range; S.lists = lists; S.calendars = cals; S.allTasks = tasks;
  S.doneTasks = all.filter((t) => t.done);
  render();
}

/* ── rendering ────────────────────────────────────────────────────────── */
function titleText() {
  const s = parseISO(S.data.start), e = parseISO(S.data.end);
  if (S.view === 'day') return `${s.getDate()} ${T.months[s.getMonth()]} ${s.getFullYear()}`;
  if (S.view === 'month') return `${T.months[S.anchor.getMonth()]} ${S.anchor.getFullYear()}`;
  const sameMonth = s.getMonth() === e.getMonth();
  return sameMonth
    ? `${s.getDate()}–${e.getDate()} ${T.months[s.getMonth()]} ${s.getFullYear()}`
    : `${s.getDate()} ${T.months[s.getMonth()]} – ${e.getDate()} ${T.months[e.getMonth()]} ${e.getFullYear()}`;
}

function render() {
  $('#title').textContent = titleText();
  const vs = $('#viewsel');
  if (vs) vs.value = S.view;
  if (S.view === 'month') renderMonth();
  else if (S.view === 'agenda') renderAgenda();
  else renderTimeGrid();
  renderTasks();
}

/* "the wall clock in `tz` when it is `h` o'clock here" — display-only. */
function tzHour(dayDate, h, tz) {
  try {
    const local = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), h, 0, 0);
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(local);
  } catch { return ''; }
}
function tz2Hour(dayDate, h) { return tzHour(dayDate, h, S.tz2); }
/* "GMT+3"-style label (offsets read better than city names in 44px) */
function tzOffsetLabel(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    const v = (parts.find((p) => p.type === 'timeZoneName') || {}).value || '';
    return v === 'GMT' ? 'GMT+0' : v;
  } catch { return tz || ''; }
}

/* time grid (day / 3day / week / 7day) — the Google-Calendar-style view */
function renderTimeGrid() {
  const days = rangeDays(), start = parseISO(S.data.start);
  const today = S.data.today;
  const wrap = $('#gridwrap');
  // Re-rendering the SAME view+range (completing a task, moving a block)
  // must not jump back to the current hour — keep the scroll position.
  const scrollKey = `${S.view}|${S.data.start}`;
  const oldScroll = wrap.querySelector('.scroll');
  const keepTop = (oldScroll && S._scrollKey === scrollKey) ? oldScroll.scrollTop : null;
  S._scrollKey = scrollKey;
  wrap.innerHTML = '';
  wrap.style.setProperty('--cols', days);
  const tz2Aktif = !!S.tz2 && !S.tz2Gizli;
  wrap.classList.toggle('tz2on', tz2Aktif);

  // headers
  const head = el('div', 'grid-head');
  const corner = el('div', 'corner');
  const tz1ad = S.tz1 || Intl.DateTimeFormat().resolvedOptions().timeZone;
  // The corner itself is clickable: one click collapses the two-timezone
  // gutter to a single column, another click brings it back. (A separate
  // arrow button crowded the labels out.)
  if (S.tz2) {
    if (tz2Aktif) {
      corner.innerHTML = `<span class="tzl" title="${esc(S.tz2)}">${esc(tzOffsetLabel(S.tz2))}</span>`
        + `<span class="tzl" title="${esc(tz1ad)}">${esc(tzOffsetLabel(S.tz1))}</span>`;
      corner.title = T.tzCollapse;
    } else {
      corner.innerHTML = `<span class="tzl" title="${esc(tz1ad)}">${esc(tzOffsetLabel(S.tz1))}</span>`;
      corner.title = T.tzExpand;
    }
    corner.classList.add('tzclick');
    corner.onclick = () => {
      S.tz2Gizli = !S.tz2Gizli;
      LS.set(LSK('tz2-gizli'), S.tz2Gizli ? '1' : '');
      render();
    };
  } else if (S.tz1) {
    corner.innerHTML = `<span class="tzl" title="${esc(tz1ad)}">${esc(tzOffsetLabel(S.tz1))}</span>`;
  }
  head.appendChild(corner);
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const h = el('div', 'dayhead' + (iso(d) === today ? ' is-today' : ''));
    // Single line: "MON 17" — two stacked lines wasted header height.
    h.innerHTML = `<span class="dow">${T.dows[(d.getDay() + 6) % 7]}</span>`
      + `<span class="dnum">${d.getDate()}</span>`;
    h.onclick = () => { S.anchor = d; S.view = 'day'; load(); };
    head.appendChild(h);
  }
  wrap.appendChild(head);

  // all-day strip: all-day events + dated tasks (what Google Calendar does).
  // Timed tasks live in the grid at their hour, not here. The strip is a
  // SINGLE collapsed row by default; clicking the label expands it.
  const ad = el('div', 'allday' + (S.alldayOpen ? '' : ' kapali'));
  ad.style.setProperty('--cols', days);
  const lbl = el('div', 'lbl');
  lbl.textContent = S.alldayOpen ? '▾' : '▸';   // just the fold arrow
  lbl.title = T.allday;
  lbl.onclick = () => {
    S.alldayOpen = !S.alldayOpen;
    LS.set(LSK('allday-acik'), S.alldayOpen ? '1' : '');
    render();
  };
  ad.appendChild(lbl);
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i), key = iso(d);
    const cell = el('div', 'cell');
    cell.dataset.date = key;
    S.data.events.filter((e) => e.all_day && key >= e.starts_at.slice(0, 10) && key <= e.ends_at.slice(0, 10))
      .forEach((e) => cell.appendChild(chip(e)));
    S.data.tasks.filter((t) => t.due_date === key && !t.due_time && !(S.hideDone && t.done))
      .forEach((t) => cell.appendChild(taskChip(t)));
    // Tüm gün şeridi de tıklanabilir (16 Ağu, kullanıcı isteği): boş yerine
    // tıklayınca o güne tüm-gün etkinlik ya da tarihli görev eklenir.
    cell.onclick = (ev) => { if (ev.target === cell) openCreate({ date: key, allDay: true }); };
    cell.title = T.create;
    ad.appendChild(cell);
  }
  wrap.appendChild(ad);

  // hour grid
  const scroll = el('div', 'scroll');
  const grid = el('div', 'grid');
  grid.id = 'timegrid';
  grid.style.setProperty('--cols', days);
  const hours = el('div', 'hours zoomable');
  hours.title = '↕ drag to zoom';
  for (let h = 0; h < 24; h++) {
    const x = el('div', 'h');
    const t1 = !h ? '' : (S.tz1 ? tzHour(start, h, S.tz1) : `${pad(h)}:00`);
    if (tz2Aktif) {
      x.innerHTML = `<span class="t2">${h ? tz2Hour(start, h) : ''}</span><span class="t1">${t1}</span>`;
    } else {
      x.textContent = t1;
    }
    hours.appendChild(x);
  }
  // Dragging the hour gutter vertically zooms. While dragging only the CSS
  // variable changes (every position derives from it, so the grid scales
  // live); the value is persisted and re-rendered on release.
  hours.addEventListener('pointerdown', (ev) => {
    const h0 = currentHourH(), y0 = ev.clientY;
    let oynadi = false;
    hours.setPointerCapture && ev.pointerId !== undefined && hours.setPointerCapture(ev.pointerId);
    const mv = (e2) => {
      const dy = e2.clientY - y0;
      if (!oynadi && Math.abs(dy) < 3) return;
      oynadi = true;
      document.documentElement.style.setProperty('--hour-h', gutterZoom(h0, dy) + 'px');
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (oynadi) { applyHourH(currentHourH()); render(); }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    ev.preventDefault();
  });
  grid.appendChild(hours);

  for (let i = 0; i < days; i++) {
    const d = addDays(start, i), key = iso(d);
    const dow = (d.getDay() + 6) % 7;
    const col = el('div', 'daycol' + (key === today ? ' is-today' : '') + (dow > 4 ? ' is-weekend' : ''));
    col.dataset.date = key;
    col.dataset.col = i;
    for (let h = 0; h < 24; h++) col.appendChild(el('div', 'slot'));
    // Multi-day TIMED events render one segment per day column (what
    // Google does): first day start→24:00, middle days full, last day
    // 00:00→end. Moving grabs the first segment, resizing the last.
    const items = [];
    for (const e of S.data.events) {
      if (e.all_day) continue;
      if (e.starts_at.slice(0, 10) > key || e.ends_at.slice(0, 10) < key) continue;
      const basta = e.starts_at.slice(0, 10) === key;
      const sonda = e.ends_at.slice(0, 10) === key;
      const s = basta ? minutesOf(e.starts_at) : 0;
      const x = sonda ? Math.max(s + 20, minutesOf(e.ends_at) || 1440) : 1440;
      items.push({ s, x, make: () => eventNode(e, { basta, sonda }) });
    }
    // Timed tasks sit in the grid at their hour as a 30-minute block.
    for (const t of S.data.tasks) {
      if (t.due_date !== key || !t.due_time) continue;
      if (S.hideDone && t.done) continue;
      const m = (+t.due_time.slice(0, 2)) * 60 + (+t.due_time.slice(3, 5));
      items.push({ s: m, x: m + 30, make: () => taskGridNode(t) });
    }
    layoutDay(col, items);
    if (key === today) {
      const line = el('div', 'nowline');
      line.id = 'nowline';
      const now = new Date();
      line.style.top = `calc(var(--hour-h) * ${(now.getHours() * 60 + now.getMinutes()) / 60})`;
      col.appendChild(line);
    }
    // While the create dialog is open the selected range stays pinned on
    // the grid (click-created slots included), until the dialog closes.
    if (S.preview) {
      const coklu = S.preview.segs.length > 1;
      S.preview.segs.forEach((sg, si) => {
        if (sg.date !== key) return;
        const son = si === S.preview.segs.length - 1;
        // End label anchors to the BOTTOM of the box, next to the actual
        // end line — no scrolling to the top of the day to read it.
        const b = el('div', 'dragsel pinned' + (coklu && son ? ' endlbl' : ''));
        b.style.top = `calc(var(--hour-h) * ${sg.from / 60})`;
        b.style.height = `calc(var(--hour-h) * ${Math.max(0.25, (sg.to - sg.from) / 60)})`;
        b.textContent = !coklu ? `${hm(sg.from)} – ${hm(sg.to)}`
          : si === 0 ? `${hm(sg.from)} →`
          : son ? `→ ${hm(sg.to)}` : '';
        col.appendChild(b);
      });
    }
    // drag-to-create on the empty parts of the column
    col.addEventListener('pointerdown', (ev) => dragCreateStart(ev, col, key));
    grid.appendChild(col);
  }
  scroll.appendChild(grid);
  wrap.appendChild(scroll);

  // open on the current hour, like every calendar app does — but restore
  // the previous position when only the content changed
  requestAnimationFrame(() => {
    if (keepTop != null) { scroll.scrollTop = keepTop; return; }
    const hourH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour-h')) || 44;
    const h = new Date().getHours();
    scroll.scrollTop = Math.max(0, (h - (S.compact ? 1 : 2)) * hourH);
  });
}

/* side-by-side packing for overlapping items ({s, x, make} triples) */
function layoutDay(col, list) {
  const items = [...list].sort((a, b) => a.s - b.s || b.x - a.x);

  const clusters = [];
  let cur = [];
  let curEnd = -1;
  for (const it of items) {
    if (cur.length && it.s >= curEnd) { clusters.push(cur); cur = []; curEnd = -1; }
    cur.push(it); curEnd = Math.max(curEnd, it.x);
  }
  if (cur.length) clusters.push(cur);

  for (const cl of clusters) {
    const cols = [];
    for (const it of cl) {
      let idx = cols.findIndex((endAt) => it.s >= endAt);
      if (idx === -1) { idx = cols.length; cols.push(0); }
      cols[idx] = it.x;
      it.col = idx;
    }
    const n = cols.length;
    for (const it of cl) {
      const node = it.make();
      // Tall boxes may wrap the title to two lines; tiny boxes hide the
      // time row entirely.
      node.classList.toggle('coksatir', (it.x - it.s) >= 75);
      node.classList.toggle('kucuk', (it.x - it.s) < 45);
      node.style.top = `calc(var(--hour-h) * ${it.s / 60})`;
      node.style.height = `calc(var(--hour-h) * ${(it.x - it.s) / 60} - 2px)`;
      node.style.left = `calc(${(it.col / n) * 100}% + 2px)`;
      node.style.width = `calc(${100 / n}% - 4px)`;
      node.style.right = 'auto';
      col.appendChild(node);
    }
  }
}

function paintColors(n, e) {
  n.style.borderLeftColor = e.color || 'var(--accent)';
  n.style.background = `color-mix(in srgb, ${e.color || '#5b9dff'} 18%, transparent)`;
}

function eventNode(e, seg) {
  seg = seg || { basta: true, sonda: true };
  const n = el('div', 'ev' + (seg.basta ? '' : ' devam'));
  paintColors(n, e);
  const t = el('span', 't');
  t.textContent = (seg.basta ? (e.recurring ? '⟳ ' : '') : '↰ ') + e.title;
  n.appendChild(t);
  if (seg.basta) {
    const w = el('span', 'w');
    w.textContent = `${e.starts_at.slice(11, 16)} – ${e.ends_at.slice(11, 16)}`;
    n.appendChild(w);
  }
  n.title = `${e.title}\n${e.starts_at.slice(11, 16)}–${e.ends_at.slice(11, 16)}` +
    (e.location ? `\n${e.location}` : '') + (e.notes ? `\n\n${e.notes}` : '');
  if (seg.basta) {
    // Move from the first segment; the resize handle only makes sense on
    // the LAST one.
    const rs = el('div', 'rs');
    if (seg.sonda) n.appendChild(rs);
    attachEventDrag(n, e, rs);
  } else {
    // Continuation segment: click opens the card; the last one can be
    // resized from its bottom edge.
    n.onclick = (ev) => { ev.stopPropagation(); openEventCard(e); };
    if (seg.sonda) {
      const rs = el('div', 'rs');
      n.appendChild(rs);
      attachResizeOnly(rs, e);
    }
  }
  return n;
}

function chip(e) {
  const n = el('div', 'ev chip');
  paintColors(n, e);
  n.textContent = (e.recurring ? '⟳ ' : '') + e.title;
  n.title = e.title + (e.notes ? `\n\n${e.notes}` : '');
  attachChipDrag(n, e);
  return n;
}

/* Task chip: the circle completes, the body opens the detail card —
   tapping a task must not accidentally mark it done. */
async function deleteTaskFlow(t) {
  if (t.repeat && t.due_date) {
    const scope = await scopeDialog('taskdel', ['one', 'all']);
    if (!scope) return false;
    if (scope === 'one') {
      await api(`api/tasks/${t.id}/skip`, { method: 'POST' });
      toast(T.skippedOne);
      load(); return true;
    }
  }
  await api(`api/tasks/${t.id}`, { method: 'DELETE' });
  toast(`“${t.title}” ${T.deleted}`, async () => {
    await api('api/trash/restore', { method: 'POST', body: JSON.stringify({ kind: 'task', id: t.id }) });
    load();
  });
  load(); return true;
}

function cbxEl(done, onToggle) {
  const c = el('span', 'cbx' + (done ? ' on' : ''));
  c.setAttribute('role', 'checkbox');
  c.setAttribute('aria-checked', String(!!done));
  let d0 = null;
  c.addEventListener('pointerdown', (ev) => { d0 = { x: ev.clientX, y: ev.clientY }; ev.stopPropagation(); });
  c.addEventListener('click', (ev) => {
    ev.stopPropagation();
    // A drag that STARTED on the circle must not count as a click:
    // accidentally completing a yearly routine hides it for a whole year
    // (it rolls forward) — that is how a birthday task once "vanished".
    if (d0 && Math.hypot(ev.clientX - d0.x, ev.clientY - d0.y) >= 6) { d0 = null; return; }
    d0 = null;
    onToggle && onToggle();
  });
  return c;
}

/* One completion path for chips and grid blocks. Completing a REPEATING task
   rolls it forward server-side; that jump is silent and easy to regret, so
   it gets an Undo toast that restores the previous due date. */
async function toggleTask(t) {
  const oldDue = t.due_date;
  const res = await api(`api/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ title: t.title, done: !t.done }) });
  if (res && res.status === 'rolled' && res.due_date) {
    const d = res.due_date;
    toast(`\u2713 \u201C${t.title}\u201D \u2192 ${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`, async () => {
      await api(`api/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ due_date: oldDue }) });
      load();
    });
  }
  load();
}

function taskChip(t) {
  if (t.projected) {
    const p = el('div', 'ev chip task proj');
    p.appendChild(el('span', 'cbx off'));
    const ct = el('span', 'ct'); ct.textContent = t.title;
    p.appendChild(ct);
    p.title = `${t.title} · ${T.projected}`;
    p.onclick = (ev) => { ev.stopPropagation(); openTaskCard(t); };
    return p;
  }
  const n = el('div', 'ev chip task' + (t.done ? ' done' : ''));
  const cb = cbxEl(t.done, () => toggleTask(t));
  cb.title = T.completed;
  const tt = el('span', 'ct'); tt.textContent = t.title;
  n.append(cb, tt);
  n.title = t.title + (t.due_time ? ` · ${t.due_time}` : '');
  attachTaskChipDrag(n, t);
  return n;
}

/* Timed-task grid block (30 min): circle completes, body opens the card,
   dragging changes both day and time. */
function taskGridNode(t) {
  if (t.projected) {
    const p = el('div', 'ev taskev proj');
    p.appendChild(el('span', 'cbx off'));
    const tt = el('span', 't'); tt.textContent = t.title;
    p.appendChild(tt);
    p.title = `${t.title} · ${T.projected}`;
    p.onclick = (ev) => { ev.stopPropagation(); openTaskCard(t); };
    return p;
  }
  const n = el('div', 'ev taskev' + (t.done ? ' done' : ''));
  const cb = cbxEl(t.done, () => toggleTask(t));
  cb.title = T.completed;
  const tt = el('span', 't'); tt.textContent = t.title;
  n.append(cb, tt);
  n.title = `${t.title} · ${t.due_time}`;
  attachTaskGridDrag(n, t);
  return n;
}

/* month view */
function renderMonth() {
  const wrap = $('#gridwrap');
  const scrollKey = `${S.view}|${S.data.start}`;
  const oldScroll = wrap.querySelector('.scroll');
  const keepTop = (oldScroll && S._scrollKey === scrollKey) ? oldScroll.scrollTop : null;
  S._scrollKey = scrollKey;
  wrap.innerHTML = '';
  wrap.style.setProperty('--cols', 7);
  wrap.classList.remove('tz2on');
  const start = parseISO(S.data.start), today = S.data.today;
  const head = el('div', 'grid-head');
  head.style.gridTemplateColumns = 'repeat(7,1fr)';
  for (let i = 0; i < 7; i++) {
    const h = el('div', 'dayhead');
    h.innerHTML = `<div class="dow">${T.dows[(i + S.firstWeekday) % 7]}</div>`;
    head.appendChild(h);
  }
  wrap.appendChild(head);

  const scroll = el('div', 'scroll');
  const g = el('div', 'monthgrid');
  g.style.display = 'grid';
  g.style.gridTemplateColumns = 'repeat(7,1fr)';
  g.style.gridAutoRows = 'minmax(72px,1fr)';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), key = iso(d);
    if (i >= 35 && d.getMonth() !== S.anchor.getMonth()) break;
    const cell = el('div', 'daycol mcell' + (key === today ? ' is-today' : ''));
    cell.dataset.date = key;
    cell.style.opacity = d.getMonth() === S.anchor.getMonth() ? '1' : '.42';
    const num = el('div', 'mnum');
    num.textContent = d.getDate();
    cell.appendChild(num);
    S.data.events.filter((e) => key >= e.starts_at.slice(0, 10) && key <= e.ends_at.slice(0, 10))
      .slice(0, 3).forEach((e) => cell.appendChild(chip(e)));
    S.data.tasks.filter((t) => t.due_date === key && !(S.hideDone && t.done)).slice(0, 2)
      .forEach((t) => cell.appendChild(taskChip(t)));
    cell.onclick = (ev) => { if (ev.target === cell || ev.target === num) { S.anchor = d; S.view = 'day'; load(); } };
    g.appendChild(cell);
  }
  scroll.appendChild(g);
  wrap.appendChild(scroll);
  if (keepTop != null) requestAnimationFrame(() => { scroll.scrollTop = keepTop; });
}

/* agenda / schedule view: a readable list of the next 30 days */
function renderAgenda() {
  const wrap = $('#gridwrap');
  const scrollKey = `${S.view}|${S.data.start}`;
  const oldScroll = wrap.querySelector('.scroll');
  const keepTop = (oldScroll && S._scrollKey === scrollKey) ? oldScroll.scrollTop : null;
  S._scrollKey = scrollKey;
  wrap.innerHTML = '';
  wrap.classList.remove('tz2on');
  const scroll = el('div', 'scroll agenda');
  const start = parseISO(S.data.start);
  let any = false;
  for (let i = 0; i < rangeDays(); i++) {
    const d = addDays(start, i), key = iso(d);
    const evs = S.data.events.filter((e) => e.all_day
      ? (key >= e.starts_at.slice(0, 10) && key <= e.ends_at.slice(0, 10))
      : e.starts_at.slice(0, 10) === key);
    const tds = S.data.tasks.filter((t) => t.due_date === key && !(S.hideDone && t.done));
    if (!evs.length && !tds.length) continue;
    any = true;
    const day = el('div', 'aday' + (key === S.data.today ? ' is-today' : ''));
    const h = el('div', 'ahead');
    h.innerHTML = `<span class="adnum">${d.getDate()}</span>`
      + `<span class="adname">${T.dows[(d.getDay() + 6) % 7]}, ${T.months[d.getMonth()]}</span>`;
    day.appendChild(h);
    const listEl = el('div', 'alist');
    for (const e of evs.sort((a, b) => (a.all_day ? -1 : 1) - (b.all_day ? -1 : 1) || a.starts_at.localeCompare(b.starts_at))) {
      const row = el('div', 'arow');
      const dot = el('span', 'adot'); dot.style.background = e.color || 'var(--accent)';
      const when = el('span', 'awhen');
      when.textContent = e.all_day ? T.allday : `${e.starts_at.slice(11, 16)} – ${e.ends_at.slice(11, 16)}`;
      const ttl = el('span', 'attl'); ttl.textContent = (e.recurring ? '⟳ ' : '') + e.title;
      row.append(dot, when, ttl);
      row.onclick = () => openEventCard(e);
      listEl.appendChild(row);
    }
    for (const t of tds) {
      const row = el('div', 'arow task' + (t.done ? ' done' : ''));
      const dot = el('span', 'adot'); dot.style.background = 'var(--ok)';
      const when = el('span', 'awhen'); when.textContent = t.due_time || '';
      const ttl = el('span', 'attl'); ttl.textContent = t.title;
      row.append(dot, when, ttl);
      row.onclick = () => openTaskCard(t);
      listEl.appendChild(row);
    }
    day.appendChild(listEl);
    scroll.appendChild(day);
  }
  if (!any) {
    const p = el('div', 'aempty'); p.textContent = T.noEvents; scroll.appendChild(p);
  }
  wrap.appendChild(scroll);
  if (keepTop != null) requestAnimationFrame(() => { scroll.scrollTop = keepTop; });
}

/* ── drag & drop engine ───────────────────────────────────────────────── */
/* Geometry of the visible time grid; everything the drop math needs. */
function gridGeom() {
  const grid = $('#timegrid');
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  const hours = grid.querySelector('.hours').getBoundingClientRect();
  const days = rangeDays();
  const colW = (rect.width - hours.width) / days;
  const hourH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour-h')) || 44;
  return { rect, gutterW: hours.width, colW, days, hourH, start: parseISO(S.data.start) };
}
/* Pure drop math (also unit-tested): pointer position -> day index + minutes. */
function dropPoint(geom, clientX, clientY) {
  const day = Math.max(0, Math.min(geom.days - 1,
    Math.floor((clientX - geom.rect.left - geom.gutterW) / geom.colW)));
  const mins = snap15(((clientY - geom.rect.top) / geom.hourH) * 60);
  return { day, mins };
}

const DRAG_MIN_PX = 4;

/* Cross-range drag: holding the pointer at the grid's left/right edge shifts
   the drop target one full view-range back/forward (a week in week view).
   The grid is deliberately NOT rebuilt mid-drag — pointer capture dies with
   the dragged node — so the shift accumulates on a floating badge and the
   view follows the item after the drop. */
const _edge = { dir: 0, shift: 0, timer: null, badge: null };
function edgeLabel() {
  const days = S.data.days;
  const s0 = addDays(parseISO(S.data.start), _edge.shift * days);
  const e0 = addDays(s0, days - 1);
  const ay = T.months;
  const txt = days === 1 ? `${s0.getDate()} ${ay[s0.getMonth()]}`
    : s0.getMonth() === e0.getMonth() ? `${s0.getDate()}\u2013${e0.getDate()} ${ay[s0.getMonth()]}`
    : `${s0.getDate()} ${ay[s0.getMonth()]} \u2013 ${e0.getDate()} ${ay[e0.getMonth()]}`;
  return (_edge.shift > 0 ? '\u2192 ' : '\u2190 ') + txt;
}
function edgeTrack(clientX, clientY) {
  if (S.view === 'month' || S.view === 'agenda') return;
  const wrap = $('#gridwrap'); if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  const dir = clientX < r.left + 36 ? -1 : clientX > r.right - 36 ? 1 : 0;
  if (dir === _edge.dir) return;             // zone unchanged: keep the timer
  clearInterval(_edge.timer); _edge.timer = null;
  _edge.dir = dir;
  if (!dir) return;
  _edge.timer = setInterval(() => {
    _edge.shift += _edge.dir;
    if (!_edge.badge) { _edge.badge = el('div', 'edgebadge'); document.body.appendChild(_edge.badge); }
    const b = _edge.badge;
    b.textContent = edgeLabel();
    b.style.left = `${_edge.dir > 0 ? r.right - 10 : r.left + 10}px`;
    b.style.transform = _edge.dir > 0 ? 'translateX(-100%)' : '';
    b.style.top = `${Math.max(r.top + 8, Math.min(clientY, r.bottom - 40))}px`;
    b.hidden = _edge.shift === 0;
  }, 550);
}
function edgeTake() {
  clearInterval(_edge.timer);
  const shift = _edge.shift;
  if (_edge.badge) { _edge.badge.remove(); _edge.badge = null; }
  _edge.dir = 0; _edge.shift = 0; _edge.timer = null;
  return shift;
}
function edgeFollow(shift) {   // after a shifted drop, the view follows the item
  if (shift) S.anchor = addDays(S.anchor, shift * S.data.days);
}

/* Move / resize for timed events in the grid. */
function attachEventDrag(node, e, resizeHandle) {
  let mode = null, startX = 0, startY = 0, moved = false, geom = null;
  let origCol = 0, startMin = 0, endMin = 0;

  const down = (m) => (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    mode = m; moved = false;
    startX = ev.clientX; startY = ev.clientY;
    geom = gridGeom();
    if (!geom) { mode = null; return; }
    origCol = Math.round((iso(parseISO(e.starts_at)) === e.starts_at.slice(0, 10)
      ? (parseISO(e.starts_at.slice(0, 10)) - geom.start) / 86400000 : 0));
    origCol = Math.max(0, Math.min(geom.days - 1, Math.round((parseISO(e.starts_at.slice(0, 10)) - geom.start) / 86400000)));
    startMin = minutesOf(e.starts_at);
    endMin = Math.max(startMin + 15, minutesOf(e.ends_at) || 1440);
    node.setPointerCapture && ev.pointerId !== undefined && node.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
    if (m === 'resize') ev.preventDefault();
  };
  const move = (ev) => {
    if (!mode) return;
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_MIN_PX) return;
    moved = true;
    document.body.classList.add('dragging');
    const p = dropPoint(geom, ev.clientX, ev.clientY);
    if (mode === 'move') {
      const dMin = snap15(startMin + ((ev.clientY - startY) / geom.hourH) * 60) - startMin;
      const dDay = p.day - origCol;
      node.style.transform = `translate(${dDay * geom.colW}px, ${(dMin / 60) * geom.hourH}px)`;
      node.classList.add('drag');
      node.dataset.preview = dtStr('', Math.max(0, startMin + dMin)).trim();
      edgeTrack(ev.clientX, ev.clientY);
    } else {
      const newEnd = Math.max(startMin + 15, p.mins);
      node.style.height = `calc(var(--hour-h) * ${(newEnd - startMin) / 60} - 2px)`;
      node.classList.add('drag');
    }
  };
  const up = async (ev) => {
    const wasMode = mode, wasMoved = moved;
    mode = null;
    document.body.classList.remove('dragging');
    node.classList.remove('drag');
    node.style.transform = '';
    if (!wasMode) return;
    if (!wasMoved) {          // it was a click, not a drag
      if (wasMode === 'move') { openEventCard(e); }   // read-only card first
      return;
    }
    const shift = edgeTake();
    const p = dropPoint(geom, ev.clientX, ev.clientY);
    if (wasMode === 'move') {
      const dMin = snap15(startMin + ((ev.clientY - startY) / geom.hourH) * 60) - startMin;
      const dDay = p.day - origCol + shift * S.data.days;
      if (!dMin && !dDay) { render(); return; }
      edgeFollow(shift);
      const newDate = iso(addDays(parseISO(e.starts_at.slice(0, 10)), dDay));
      const ns = Math.max(0, Math.min(1425, startMin + dMin));
      await commitEventTimeChange(e, dtStr(newDate, ns), dtStr(newDate, Math.min(1439, ns + (endMin - startMin))), T.moved);
    } else {
      const newEnd = Math.max(startMin + 15, p.mins);
      if (newEnd === endMin) { render(); return; }
      await commitEventTimeChange(e, e.starts_at, dtStr(e.starts_at.slice(0, 10), Math.min(1439, newEnd)), T.resized);
    }
  };
  node.addEventListener('pointerdown', down('move'));
  resizeHandle.addEventListener('pointerdown', down('resize'));
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', () => { mode = null; node.classList.remove('drag'); node.style.transform = ''; document.body.classList.remove('dragging'); edgeTake(); });
}

/* Resize-only handle: the bottom edge of a multi-day event's LAST segment. */
function attachResizeOnly(handle, e) {
  handle.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    const geom = gridGeom();
    const col = handle.closest('.daycol');
    if (!geom || !col) return;
    const dayKey = col.dataset.date;
    handle.setPointerCapture && ev.pointerId !== undefined && handle.setPointerCapture(ev.pointerId);
    ev.stopPropagation(); ev.preventDefault();
    let son = null;
    const mv = (e2) => {
      son = Math.max(15, dropPoint(geom, e2.clientX, e2.clientY).mins);
      document.body.classList.add('dragging');
    };
    const up = async () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      if (son === null) return;
      await commitEventTimeChange(e, e.starts_at, dtStr(dayKey, Math.min(1439, son)), T.resized);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
}

/* All-day event chips + month cells: horizontal day-to-day drag. */
function attachChipDrag(n, e) {
  let down = null, moved = false;
  n.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    down = { x: ev.clientX, y: ev.clientY }; moved = false;
    n.setPointerCapture && ev.pointerId !== undefined && n.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
  });
  n.addEventListener('pointermove', (ev) => {
    if (!down) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) >= DRAG_MIN_PX) {
      moved = true; n.classList.add('drag'); document.body.classList.add('dragging');
      markDropCell(ev.clientX, ev.clientY);
      edgeTrack(ev.clientX, ev.clientY);
    }
  });
  n.addEventListener('pointerup', async (ev) => {
    const wasMoved = moved; const wasDown = down;
    down = null; moved = false;
    n.classList.remove('drag'); document.body.classList.remove('dragging');
    const shift = edgeTake();
    let target = clearDropCell();
    if (!wasDown) return;
    if (!wasMoved) { openEventCard(e); return; }
    if (target && shift) target = iso(addDays(parseISO(target), shift * S.data.days));
    if (!target || target === e.starts_at.slice(0, 10)) { render(); return; }
    edgeFollow(shift);
    const delta = Math.round((parseISO(target) - parseISO(e.starts_at.slice(0, 10))) / 86400000);
    const s = e.all_day ? target : dtStr(target, minutesOf(e.starts_at));
    const endDate = iso(addDays(parseISO(e.ends_at.slice(0, 10)), delta));
    const en = e.all_day ? endDate : dtStr(endDate, minutesOf(e.ends_at));
    await commitEventTimeChange(e, s, en, T.moved);
  });
  n.addEventListener('pointercancel', () => { down = null; moved = false; n.classList.remove('drag'); document.body.classList.remove('dragging'); clearDropCell(); edgeTake(); });
}

function attachTaskChipDrag(n, t) {
  let down = null, moved = false;
  n.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    down = { x: ev.clientX, y: ev.clientY }; moved = false;
    n.setPointerCapture && ev.pointerId !== undefined && n.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
  });
  n.addEventListener('pointermove', (ev) => {
    if (!down) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) >= DRAG_MIN_PX) {
      moved = true; n.classList.add('drag'); document.body.classList.add('dragging');
      markDropCell(ev.clientX, ev.clientY);
      edgeTrack(ev.clientX, ev.clientY);
    }
  });
  n.addEventListener('pointerup', async (ev) => {
    const wasMoved = moved; const wasDown = down;
    down = null; moved = false;
    n.classList.remove('drag'); document.body.classList.remove('dragging');
    const shift = edgeTake();
    let target = clearDropCell();
    if (!wasDown) return;
    if (!wasMoved) { openTaskCard(t); return; }   // body = card; circle completes
    if (target && shift) target = iso(addDays(parseISO(target), shift * S.data.days));
    if (!target || target === t.due_date) { render(); return; }
    edgeFollow(shift);
    // Routine task: ask whether to move only this repeat or the whole series.
    let scope = 'all';
    if (t.repeat) {
      scope = await scopeDialog('taskmove', ['one', 'all']);
      if (!scope) { render(); return; }
    }
    if (scope === 'one') {
      await api(`api/tasks/${t.id}/detach`, { method: 'POST', body: JSON.stringify({ due_date: target }) });
      toast(T.savedOne);
      load(); return;
    }
    const old = t.due_date;
    await api(`api/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ due_date: target }) });
    toast(`“${t.title}” → ${target.slice(8, 10)}.${target.slice(5, 7)}`, async () => {
      await api(`api/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ due_date: old }) });
      load();
    });
    load();
  });
  n.addEventListener('pointercancel', () => { down = null; moved = false; n.classList.remove('drag'); document.body.classList.remove('dragging'); clearDropCell(); edgeTake(); });
}

/* Drag a timed-task block on the grid: day and time change together. */
function attachTaskGridDrag(n, t) {
  let down = null, moved = false, geom = null;
  n.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    down = { x: ev.clientX, y: ev.clientY }; moved = false;
    geom = gridGeom();
    n.setPointerCapture && ev.pointerId !== undefined && n.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
  });
  n.addEventListener('pointermove', (ev) => {
    if (!down || !geom) return;
    if (!moved && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < DRAG_MIN_PX) return;
    moved = true;
    n.classList.add('drag'); document.body.classList.add('dragging');
    const p = dropPoint(geom, ev.clientX, ev.clientY);
    const origCol = Math.max(0, Math.round((parseISO(t.due_date) - geom.start) / 86400000));
    const m0 = (+t.due_time.slice(0, 2)) * 60 + (+t.due_time.slice(3, 5));
    n.style.transform = `translate(${(p.day - origCol) * geom.colW}px, ${((p.mins - m0) / 60) * geom.hourH}px)`;
    // Hovering the ALL-DAY strip while dragging: dropping there clears the time
    const ust = document.elementFromPoint(ev.clientX, ev.clientY);
    const serit = ust && ust.closest('.allday');
    document.querySelectorAll('.allday').forEach((a) => a.classList.toggle('droptarget', !!serit));
    edgeTrack(ev.clientX, ev.clientY);
  });
  n.addEventListener('pointerup', async (ev) => {
    const wasMoved = moved; const wasDown = down;
    down = null; moved = false;
    n.classList.remove('drag'); n.style.transform = '';
    document.body.classList.remove('dragging');
    const shift = edgeTake();
    document.querySelectorAll('.allday.droptarget').forEach((a) => a.classList.remove('droptarget'));
    if (!wasDown) return;
    if (!wasMoved) { openTaskCard(t); return; }
    const p = dropPoint(geom, ev.clientX, ev.clientY);
    const newDate = iso(addDays(geom.start, p.day + shift * S.data.days));
    const ust = document.elementFromPoint(ev.clientX, ev.clientY);
    const tumGune = !!(ust && ust.closest('.allday'));   // dropped on the strip → all-day
    const newTime = tumGune ? '' : hm(p.mins);
    if (newDate === t.due_date && newTime === (t.due_time || '')) { render(); return; }
    edgeFollow(shift);
    let scope = 'all';
    if (t.repeat) {
      scope = await scopeDialog('taskmove', ['one', 'all']);
      if (!scope) { render(); return; }
    }
    if (scope === 'one') {
      await api(`api/tasks/${t.id}/detach`, { method: 'POST', body: JSON.stringify({ due_date: newDate, due_time: newTime }) });
      toast(T.savedOne);
      load(); return;
    }
    const old = { due_date: t.due_date, due_time: t.due_time };
    await api(`api/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ due_date: newDate, due_time: newTime }) });
    toast(`“${t.title}” ${T.moved}`, async () => {
      await api(`api/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify(old) });
      load();
    });
    load();
  });
  n.addEventListener('pointercancel', () => { down = null; moved = false; n.classList.remove('drag'); n.style.transform = ''; document.body.classList.remove('dragging'); edgeTake(); });
}

let _dropCell = null;
function markDropCell(x, y) {
  const under = document.elementFromPoint(x, y);
  const cell = under && under.closest('[data-date]');
  if (_dropCell && _dropCell !== cell) _dropCell.classList.remove('droptarget');
  _dropCell = cell || null;
  if (_dropCell) _dropCell.classList.add('droptarget');
}
function clearDropCell() {
  const key = _dropCell ? _dropCell.dataset.date : null;
  if (_dropCell) _dropCell.classList.remove('droptarget');
  _dropCell = null;
  return key;
}

/* Day segments covered by a drag: first day start→24:00, middle days full,
   LAST day 00:00→the actual end time (the preview must not flood the whole
   final day). Reverse drags are normalized to chronological order. */
function spanSegments(startCol, m0, endCol, endM) {
  if (endCol === startCol) {
    const a = Math.min(m0, endM), b = Math.max(m0 + 15, Math.max(m0, endM));
    return [{ col: startCol, from: a, to: b }];
  }
  const ileri = endCol > startCol;
  const colA = ileri ? startCol : endCol;
  const colB = ileri ? endCol : startCol;
  const mA = ileri ? m0 : endM;
  const mB = Math.max(15, ileri ? endM : m0);
  const out = [];
  for (let c = colA; c <= colB; c++) {
    out.push({ col: c, from: c === colA ? mA : 0, to: c === colB ? mB : 1440 });
  }
  return out;
}

/* Drag on empty grid space = select a time range and create (Google gesture).
   Horizontal drags work too: extending into another day's column proposes
   a MULTI-DAY event, with a real per-day segment preview. */
function dragCreateStart(ev, col, key) {
  if (ev.button !== undefined && ev.button !== 0) return;
  if (ev.target.closest('.ev')) return;      // event drags handle themselves
  const geom = gridGeom();
  if (!geom) return;
  const startCol = +col.dataset.col;
  const m0 = snap15(((ev.clientY - geom.rect.top) / geom.hourH) * 60);
  let selBoxes = [], endM = m0 + 30, endCol = startCol, movedFar = false;
  const startY = ev.clientY, startX = ev.clientX;
  const grid = $('#timegrid');

  const temizle = () => { selBoxes.forEach((b) => b.remove()); selBoxes = []; };
  const boya = () => {
    document.body.classList.add('dragging');
    temizle();
    const segs = spanSegments(startCol, m0, endCol, endM);
    for (const sg of segs) {
      const colEl = grid.querySelector(`.daycol[data-col="${sg.col}"]`);
      if (!colEl) continue;
      const b = el('div', 'dragsel');
      b.style.top = `calc(var(--hour-h) * ${sg.from / 60})`;
      b.style.height = `calc(var(--hour-h) * ${Math.max(0.25, (sg.to - sg.from) / 60)})`;
      colEl.appendChild(b);
      selBoxes.push(b);
    }
    if (!selBoxes.length) return;
    if (segs.length === 1) {
      selBoxes[0].textContent = `${hm(segs[0].from)} – ${hm(segs[0].to)}`;
    } else {
      // The box under the cursor carries the FULL range; the end boxes get
      // start/end hints, so the end time is always readable.
      const tam = `${hm(segs[0].from)} → ${hm(segs[segs.length - 1].to)} (${segs.length}g)`;
      segs.forEach((sg, si) => {
        const son = si === segs.length - 1;
        selBoxes[si].textContent = sg.col === endCol ? tam
          : si === 0 ? `${hm(sg.from)} →`
          : son ? `→ ${hm(sg.to)}` : '';
        // bitis etiketi bitis cizgisinin YANINDA dursun (kutu 00:00'dan basliyor)
        selBoxes[si].classList.toggle('endlbl', son && sg.from === 0);
      });
    }
  };
  const move = (e2) => {
    if (!movedFar && Math.abs(e2.clientY - startY) < 6 && Math.abs(e2.clientX - startX) < 6) return;
    movedFar = true;
    const p = dropPoint(geom, e2.clientX, e2.clientY);
    endCol = p.day;
    endM = endCol === startCol ? Math.max(m0 + 15, p.mins) : Math.max(15, p.mins);
    boya();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('dragging');
    temizle();
    const sabitle = (segs) => {
      S.preview = { segs };
      render();                 // paint the pinned preview (cleared on close)
    };
    if (movedFar) {
      const segs = spanSegments(startCol, m0, endCol, endM)
        .map((sg) => ({ date: iso(addDays(geom.start, sg.col)), from: sg.from, to: sg.to }));
      sabitle(segs);
      if (endCol !== startCol) {
        const a = Math.min(startCol, endCol), b = Math.max(startCol, endCol);
        const d1 = iso(addDays(geom.start, a)), d2 = iso(addDays(geom.start, b));
        openCreate(startCol <= endCol
          ? { date: d1, time: hm(m0), endDate: d2, endTime: hm(endM) }
          : { date: d1, time: hm(endM), endDate: d2, endTime: hm(m0) });
      } else {
        openCreate({ date: key, time: hm(Math.min(m0, endM)), endTime: hm(Math.max(m0 + 15, endM)) });
      }
    } else {
      // plain click: half-hour slot under the cursor, previewed as well
      const half = Math.floor(m0 / 30) * 30;
      sabitle([{ date: key, from: half, to: half + 30 }]);
      openCreate({ date: key, time: hm(half) });
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/* Commit a drag-driven time change, asking scope for recurring events. */
async function commitEventTimeChange(e, newStart, newEnd, verb) {
  let scope = 'all';
  if (e.recurring) {
    scope = await scopeDialog('edit');
    if (!scope) { render(); return; }
  }
  const q = scope === 'all' && !e.recurring ? '' : `?scope=${scope}&occ_date=${e.occ_date}`;
  const body = { starts_at: newStart, ends_at: newEnd };
  if (e.all_day !== undefined && !e.all_day && e.recurring && scope === 'one') body.all_day = false;
  await api(`api/events/${e.id}${q}`, { method: 'PATCH', body: JSON.stringify(body) });

  const msg = `“${e.title}” ${verb}`;
  if (!e.recurring || scope === 'all') {
    const oldS = e.starts_at, oldE = e.ends_at;
    toast(msg, async () => {
      const q2 = e.recurring ? `?scope=all&occ_date=${newStart.slice(0, 10)}` : '';
      await api(`api/events/${e.id}${q2}`, { method: 'PATCH', body: JSON.stringify({ starts_at: oldS, ends_at: oldE }) });
      load();
    });
  } else {
    toast(scope === 'one' ? T.savedOne : T.savedFollowing);
  }
  load();
}

/* ── undo toast ───────────────────────────────────────────────────────── */
let _toastTimer = null;
function toast(msg, undoFn) {
  let bar = $('#toast');
  if (!bar) { bar = el('div'); bar.id = 'toast'; document.body.appendChild(bar); }
  bar.innerHTML = '';
  const span = el('span'); span.textContent = msg; bar.appendChild(span);
  if (undoFn) {
    const b = el('button'); b.textContent = T.undo;
    b.onclick = () => { bar.classList.remove('show'); undoFn(); };
    bar.appendChild(b);
  }
  bar.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => bar.classList.remove('show'), 6000);
}

/* ── scope dialog (only this / following / all) ───────────────────────── */
function scopeDialog(mode, allowed) {
  const opts = allowed || ['one', 'following', 'all'];
  const L = mode === 'taskmove'
    ? { baslik: T.taskScopeTitle, one: T.taskScopeOne, all: T.taskScopeAll, following: '' }
    : mode === 'taskdel'
    ? { baslik: T.taskDelTitle, one: T.taskDelOne, all: T.taskDelAll, following: '' }
    : { baslik: mode === 'delete' ? T.scopeDelTitle : T.scopeEditTitle,
        one: T.scopeOne, following: T.scopeFollowing, all: T.scopeAll };
  return new Promise((resolve) => {
    const dlg = $('#scopedlg') || (() => {
      const d = el('dialog'); d.id = 'scopedlg'; document.body.appendChild(d); return d;
    })();
    dlg.innerHTML = `
      <form method="dialog" class="scopeform">
        ${GHOST_OK}
        <h3>${L.baslik}</h3>
        ${opts.map((o, i) => `
          <label class="scopeopt"><input type="radio" name="scope" value="${o}" ${i === 0 ? 'checked' : ''}>
          ${L[o]}</label>`).join('')}
        <menu>
          <button value="cancel" formnovalidate>${T.cancel}</button>
          <button value="ok" class="primary">${T.ok}</button>
        </menu>
      </form>`;
    dlg.onclose = () => resolve(null);
    $('form', dlg).onsubmit = (ev) => {
      const act = ev.submitter && ev.submitter.value;
      dlg.onclose = null;
      if (act === 'ok') resolve($('input[name=scope]:checked', dlg).value);
      else resolve(null);
      dlg.close();
      ev.preventDefault();
    };
    dlg.showModal();
  });
}

/* ── tasks pane ───────────────────────────────────────────────────────── */
function dueLabel(t) {
  if (!t.due_date) return '';
  const today = S.data.today;
  let cls = '', txt = '';
  const d = parseISO(t.due_date);
  if (t.due_date < today) { cls = 'late'; txt = T.overdue; }
  else if (t.due_date === today) { cls = 'today'; txt = T.today; }
  else if (t.due_date === iso(addDays(parseISO(today), 1))) txt = T.tomorrow;
  else {
    txt = `${d.getDate()} ${T.months[d.getMonth()].slice(0, 3)}`;
    // A due date in another year without the year reads as this year's date
    if (String(d.getFullYear()) !== today.slice(0, 4)) txt += ` ${d.getFullYear()}`;
  }
  return `<span class="due ${cls}">${txt}${t.due_time ? ' · ' + t.due_time : ''}</span>`;
}

async function renderTrash(body) {
  body.innerHTML = `<div class="thint">${T.trashInfo}</div>`;
  const r = await api('api/trash').catch(() => null);
  if (!r) return;
  const ogeler = [
    ...r.events.map((e2) => ({ kind: 'event', id: e2.id, ad: e2.title,
      alt: (e2.starts_at || '').slice(0, 16), ts: e2.deleted_at })),
    ...r.tasks.map((t2) => ({ kind: 'task', id: t2.id, ad: t2.title,
      alt: [t2.due_date, t2.due_time].filter(Boolean).join(' '), ts: t2.deleted_at })),
  ].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  if (!ogeler.length) {
    const p = el('div', 'task'); p.style.color = 'var(--faint)'; p.style.fontSize = '12px';
    p.textContent = T.trashEmpty; body.appendChild(p); return;
  }
  for (const o of ogeler) {
    const row = el('div', 'trow');
    const ic = el('span'); ic.textContent = o.kind === 'event' ? '🗓' : '○';
    const tx2 = el('div', 'txt');
    const ttl = el('span', 'ttl'); ttl.textContent = o.ad; tx2.appendChild(ttl);
    if (o.alt) tx2.insertAdjacentHTML('beforeend', `<span class="due">${esc(o.alt)}</span>`);
    const g = el('button', 'gr'); g.textContent = T.restoreBtn;
    g.onclick = async () => {
      await api('api/trash/restore', { method: 'POST', body: JSON.stringify({ kind: o.kind, id: o.id }) });
      load();
      renderTasks();
    };
    row.append(ic, tx2, g);
    body.appendChild(row);
  }
}

/* Sidebar order: chronological top-down — dated tasks first (within a day
   the all-day ones sit on top and can be reordered by hand among
   themselves; timed ones sort by time), dateless tasks at the bottom. */
function taskCmp(a, b) {
  const ad = a.due_date || '9999-12-31', bd = b.due_date || '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.due_time || '', bt = b.due_time || '';
  if ((at === '') !== (bt === '')) return at === '' ? -1 : 1;
  if (at !== bt) return at < bt ? -1 : 1;
  return (a.position - b.position) || (a.id - b.id);
}

function renderTasks() {
  const body = $('#tasksbody');
  if (!body) return;
  const sek = $('#tasktabsel');
  if (sek) sek.value = S.taskTab;
  body.innerHTML = '';
  if (S.taskTab === 'trash') { renderTrash(body); return; }

  // Completed tab: finished tasks don't vanish — they live here, newest
  // first, and can be reopened.
  if (S.taskTab === 'done') {
    const bitenler = [...S.doneTasks].sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
    if (!bitenler.length) {
      const p = el('div', 'task'); p.style.color = 'var(--faint)'; p.style.fontSize = '12px';
      p.textContent = T.noDone; body.appendChild(p); return;
    }
    for (const t of bitenler) body.appendChild(taskRow(t, false));
    return;
  }

  const byParent = {};
  S.allTasks.forEach((t) => { (byParent[t.parent_id || 0] ||= []).push(t); });

  for (const list of S.lists) {
    const top = (byParent[0] || []).filter((t) => t.list_id === list.id).sort(taskCmp);
    const d = el('details', 'tlist');
    d.open = true;
    d.dataset.list = list.id;
    const sum = el('summary');
    sum.innerHTML = `<span class="dot" style="background:${list.color}"></span>${esc(list.name)}<span class="n">${top.length}</span>`;
    d.appendChild(sum);
    if (!top.length) {
      const p = el('div', 'task'); p.style.color = 'var(--faint)'; p.style.fontSize = '12px';
      p.textContent = T.noTasks; d.appendChild(p);
    }
    for (const t of top) {
      d.appendChild(taskRow(t));
      (byParent[t.id] || []).forEach((sb) => d.appendChild(taskRow(sb, true)));
    }
    const nt = el('div', 'newtask');
    const inp = el('input');
    inp.placeholder = T.newTask;
    inp.onkeydown = async (ev) => {
      if (ev.key !== 'Enter' || !inp.value.trim()) return;
      await api('api/tasks', { method: 'POST', body: JSON.stringify({ title: inp.value.trim(), list_id: list.id }) });
      inp.value = ''; load();
    };
    nt.appendChild(inp);
    d.appendChild(nt);
    body.appendChild(d);
  }
}

/* Sidebar reorder: plain HTML5 drag & drop on top-level rows (desktop). */
let _dragTask = null;
function taskRow(t, isSub) {
  const row = el('div', 'task' + (isSub ? ' sub' : '') + (t.done ? ' done' : ''));
  row.dataset.id = t.id;
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!t.done;
  cb.onchange = async () => {
    await api(`api/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ title: t.title, done: cb.checked }) });
    load();
  };
  const txt = el('div', 'txt');
  const ttl = el('span', 'ttl'); ttl.textContent = t.title;
  txt.appendChild(ttl);
  if (t.due_date) txt.insertAdjacentHTML('beforeend', dueLabel(t));
  txt.onclick = () => openTaskCard(t);
  const x = el('button', 'x'); x.textContent = '✕'; x.title = T.del;
  x.onclick = () => deleteTaskFlow(t);
  row.append(cb, txt, x);

  if (!isSub && !t.done && S.taskTab === 'open' && !t.due_time) {
    row.draggable = true;
    row.addEventListener('dragstart', (ev) => {
      _dragTask = t; row.classList.add('drag');
      ev.dataTransfer && ev.dataTransfer.setData('text/plain', String(t.id));
    });
    row.addEventListener('dragend', () => { _dragTask = null; row.classList.remove('drag'); $$('.task.over').forEach((r) => r.classList.remove('over')); });
    row.addEventListener('dragover', (ev) => {
      if (!_dragTask || _dragTask.id === t.id) return;
      // yalniz AYNI GUNUN tum-gun gorevleri kendi aralarinda siralanir
      if ((_dragTask.due_date || '') !== (t.due_date || '') || _dragTask.due_time || t.due_time) return;
      ev.preventDefault(); row.classList.add('over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('over'));
    row.addEventListener('drop', async (ev) => {
      ev.preventDefault(); row.classList.remove('over');
      if (!_dragTask || _dragTask.id === t.id) return;
      const box = row.closest('details');
      const listId = +box.dataset.list;
      const ids = $$('.task:not(.sub)', box).map((r) => +r.dataset.id).filter((id) => id !== _dragTask.id);
      const at = ids.indexOf(t.id);
      ids.splice(at + (ev.offsetY > row.offsetHeight / 2 ? 1 : 0), 0, _dragTask.id);
      await api('api/tasks/reorder', { method: 'POST', body: JSON.stringify({ list_id: listId, ids }) });
      load();
    });
  }
  return row;
}

/* ── dialogs ──────────────────────────────────────────────────────────── */
function repeatOptions(sel) {
  return ['', 'daily', 'weekly', 'monthly', 'yearly']
    .map((v) => `<option value="${v}"${v === sel ? ' selected' : ''}>${v ? T[v] : T.none}</option>`).join('');
}

function colorRow(id, current) {
  return `<div class="f">${T.color}<div class="palette" id="${id}">
    <button type="button" class="pal cal${!current ? ' sel' : ''}" data-c="" title="${T.colorCal}"></button>
    ${PALETTE.map((c) => `<button type="button" class="pal${current === c ? ' sel' : ''}"
      data-c="${c}" style="background:${c}"></button>`).join('')}
  </div></div>`;
}
function wireColorRow(dlg, id) {
  const box = $(`#${id}`, dlg);
  box.onclick = (ev) => {
    const b = ev.target.closest('.pal');
    if (!b) return;
    $$('.pal', box).forEach((x) => x.classList.toggle('sel', x === b));
  };
}
const pickedColor = (dlg, id) => ($(`#${id} .pal.sel`, dlg) || {}).dataset?.c || '';

function reminderRow(id, current) {
  const mins = (current || '').split(',').filter((x) => x !== '');
  return `<div class="f">${T.reminder}<div class="rems" id="${id}" data-v="${mins.join(',')}">
    <span class="remchips"></span>
    <select class="remsel">
      <option value="">${T.remNone}</option>
      ${REM_CHOICES.map((m) => `<option value="${m}">${T.remLabels[m]}</option>`).join('')}
    </select>
  </div></div>`;
}
function wireReminderRow(dlg, id) {
  const box = $(`#${id}`, dlg);
  const paint = () => {
    const v = box.dataset.v ? box.dataset.v.split(',') : [];
    $('.remchips', box).innerHTML = v.map((m) =>
      `<button type="button" class="remchip" data-m="${m}">${T.remLabels[m] || `${m} dk`} ✕</button>`).join('');
  };
  paint();
  box.onclick = (ev) => {
    const b = ev.target.closest('.remchip');
    if (!b) return;
    box.dataset.v = box.dataset.v.split(',').filter((m) => m !== b.dataset.m).join(',');
    paint();
  };
  $('.remsel', box).onchange = (ev) => {
    const m = ev.target.value;
    if (m !== '' && !box.dataset.v.split(',').includes(m)) {
      box.dataset.v = box.dataset.v ? `${box.dataset.v},${m}` : m;
    }
    ev.target.value = '';
    paint();
  };
}
const pickedReminders = (dlg, id) => $(`#${id}`, dlg).dataset.v || '';

function daysRow(id, current, startDow) {
  const sel = (current || '').split(',').filter((x) => x !== '').map(Number);
  const eff = sel.length ? sel : [startDow];
  return `<div class="f bydays-wrap" id="${id}-wrap">${T.onDays}<div class="bydays" id="${id}">
    ${T.dows.map((d, i) => `<button type="button" class="byday${eff.includes(i) ? ' sel' : ''}" data-d="${i}">${d}</button>`).join('')}
  </div></div>`;
}
function wireDaysRow(dlg, id) {
  const box = $(`#${id}`, dlg);
  box.onclick = (ev) => {
    const b = ev.target.closest('.byday');
    if (!b) return;
    box.dataset.touched = '1';
    const sel = $$('.byday.sel', box);
    if (b.classList.contains('sel') && sel.length === 1) return;   // keep at least one
    b.classList.toggle('sel');
  };
}
const pickedDays = (dlg, id) => $$(`#${id} .byday.sel`, dlg).map((b) => b.dataset.d).join(',');

/* The create dialog is NON-modal and draggable, so the calendar stays
   visible behind it. Other dialogs remain modal — they reset the position
   and class before opening. */
function resetDlg(dlg) {
  dlg.classList.remove('movable');
  dlg.style.left = dlg.style.top = '';
}
function makeMovable(dlg, grip) {
  dlg.classList.add('movable');
  const key = LSK('dlg-pos');
  const kayit = (LS.get(key, '') || '').split(',');
  let x = +kayit[0], y = +kayit[1];
  if (!isFinite(x) || !isFinite(y)) { x = Math.max(8, window.innerWidth - 470); y = 64; }
  const kistir = () => {
    x = Math.max(4, Math.min(x, window.innerWidth - 140));
    y = Math.max(4, Math.min(y, window.innerHeight - 90));
  };
  kistir();
  dlg.style.left = x + 'px'; dlg.style.top = y + 'px';
  grip.addEventListener('pointerdown', (ev) => {
    const sx = ev.clientX - x, sy = ev.clientY - y;
    grip.setPointerCapture && ev.pointerId !== undefined && grip.setPointerCapture(ev.pointerId);
    const mv = (e2) => { x = e2.clientX - sx; y = e2.clientY - sy; kistir(); dlg.style.left = x + 'px'; dlg.style.top = y + 'px'; };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      LS.set(key, `${Math.round(x)},${Math.round(y)}`);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    ev.preventDefault();
  });
}

/* One dialog, two modes: Event | Task. Every empty click on the grid lands
   here; the kind switch at the top swaps the field set, so adding a task is
   exactly as easy as adding an event. */
function openCreate(preset) {
  const dlg = $('#dlg');
  const p = preset || {};
  const gun = p.date || S.data.today;
  const saat = p.time || `${pad(new Date().getHours())}:00`;
  const tumGun = !!p.allDay;
  const bitis = p.endTime || `${pad((+saat.slice(0, 2) + 1) % 24)}:${saat.slice(3, 5)}`;
  const bitisGun = p.endDate || gun;      // multi-day drags provide endDate
  const startDow = (parseISO(gun).getDay() + 6) % 7;

  dlg.innerHTML = `
    <form method="dialog" id="dlgform">
      ${GHOST_OK}
      <div class="dlg-grip" title="${T.moveDlg}">⠿</div>
      <div class="titlerow">
        <div class="kinds mini" role="tablist">
          <button type="button" class="kind" data-kind="event" aria-selected="true" title="${T.kindEvent}">🗓</button>
          <button type="button" class="kind" data-kind="task" aria-selected="false" title="${T.kindTask}">☑</button>
        </div>
        <input id="c-title" required autofocus placeholder="${T.title}">
        <label class="chk ico" data-for="event"><input type="checkbox" id="c-allday" ${tumGun ? 'checked' : ''}>${T.allDayField}</label>
      </div>

      <div data-for="event">
        <div class="row">
          <label class="f">${T.starts}<input id="c-start" type="${tumGun ? 'date' : 'datetime-local'}" value="${tumGun ? gun : `${gun}T${saat}`}"></label>
          <label class="f">${T.ends}<input id="c-end" type="${tumGun ? 'date' : 'datetime-local'}" value="${tumGun ? bitisGun : `${bitisGun}T${bitis}`}"></label>
        </div>
        <div class="row">
          <label class="f">${T.repeat}<select id="c-repeat">${repeatOptions('')}</select></label>
          <label class="f rpt-every" hidden>${T.every}<input id="c-every" type="number" min="1" max="99" value="1"></label>
          <label class="f">${T.location}<input id="c-loc"></label>
        </div>
        <div id="c-days-slot" hidden>${daysRow('c-days', '', startDow)}</div>
        <div class="row">
          ${colorRow('c-color', '')}
          ${reminderRow('c-rem', '')}
        </div>
      </div>

      <div data-for="task" hidden>
        <div class="row">
          <label class="f">${T.due}<input id="c-date" type="date" value="${gun}"></label>
          <label class="f">${T.time}<input id="c-time" type="time" value="${tumGun ? '' : saat}"></label>
        </div>
        <div class="row">
          <label class="f">${T.list}<select id="c-list">${S.lists.map((l) =>
    `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>
          <label class="f">${T.repeat}<select id="c-trepeat">${repeatOptions('')}</select></label>
        </div>
        <div id="c-tdays-slot" hidden>${daysRow('c-tdays', '', startDow)}</div>
      </div>

      <label class="f">${T.notes}<textarea id="c-notes" rows="2"></textarea></label>
      <menu>
        <button value="cancel" formnovalidate>${T.cancel}</button>
        <button value="ok" class="primary">${T.save}</button>
      </menu>
    </form>`;

  let tur = 'event';
  $$('.kind', dlg).forEach((b) => {
    b.onclick = () => {
      tur = b.dataset.kind;
      $$('.kind', dlg).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('[data-for]', dlg).forEach((g) => { g.hidden = g.dataset.for !== tur; });
      $('#c-title', dlg).focus();
    };
  });
  wireColorRow(dlg, 'c-color');
  wireReminderRow(dlg, 'c-rem');
  wireDaysRow(dlg, 'c-days');
  wireDaysRow(dlg, 'c-tdays');

  const repSel = $('#c-repeat', dlg);
  repSel.onchange = () => {
    $('#c-days-slot', dlg).hidden = repSel.value !== 'weekly';
    $('.rpt-every', dlg).hidden = !repSel.value;
  };
  const trepSel = $('#c-trepeat', dlg);
  trepSel.onchange = () => {
    $('#c-tdays-slot', dlg).hidden = trepSel.value !== 'weekly';
  };

  const allday = $('#c-allday', dlg);
  allday.onchange = () => {
    const t = allday.checked ? 'date' : 'datetime-local';
    ['#c-start', '#c-end'].forEach((sel) => {
      const inp = $(sel, dlg);
      const v = inp.value;
      inp.type = t;
      inp.value = allday.checked ? v.slice(0, 10) : (v.length <= 10 ? `${v}T${saat}` : v);
    });
  };

  $('#dlgform', dlg).onsubmit = async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    const baslik = $('#c-title', dlg).value.trim();
    if (!baslik) return;
    const notlar = $('#c-notes', dlg).value.trim() || null;

    if (tur === 'task') {
      const trep = trepSel.value;
      let tgunler = trep === 'weekly' ? pickedDays(dlg, 'c-tdays') : '';
      if (trep === 'weekly' && !$('#c-tdays', dlg).dataset.touched) {
        const dd = $('#c-date', dlg).value;
        tgunler = dd ? String((parseISO(dd).getDay() + 6) % 7) : tgunler;
      }
      await api('api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: baslik, notes: notlar,
          due_date: $('#c-date', dlg).value || null,
          due_time: $('#c-time', dlg).value || null,
          list_id: +$('#c-list', dlg).value || null,
          repeat: trep,
          repeat_days: tgunler,
        }),
      });
    } else {
      const rep = repSel.value;
      const basVal = $('#c-start', dlg).value.replace('T', ' ');
      let gunler = rep === 'weekly' ? pickedDays(dlg, 'c-days') : '';
      if (rep === 'weekly' && !$('#c-days', dlg).dataset.touched) {
        gunler = String((parseISO(basVal.slice(0, 10)).getDay() + 6) % 7);
      }
      await api('api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: baslik, notes: notlar,
          all_day: allday.checked,
          starts_at: basVal,
          ends_at: $('#c-end', dlg).value.replace('T', ' '),
          repeat: rep,
          repeat_every: +$('#c-every', dlg).value || 1,
          repeat_days: gunler,
          location: $('#c-loc', dlg).value.trim() || null,
          calendar_id: (S.calendars[0] || {}).id || null,
          color: pickedColor(dlg, 'c-color') || null,
          reminders: pickedReminders(dlg, 'c-rem'),
        }),
      });
    }
    dlg.close(); load();
  };
  // NON-modal: the calendar behind stays visible and clickable; the window
  // moves by its ⠿ grip and remembers its position.
  dlg.onclose = () => {
    dlg.onclose = null;
    if (S.preview) { S.preview = null; render(); }
  };
  const grip = $('.dlg-grip', dlg);
  makeMovable(dlg, grip);
  dlg.show();
  const ti = $('#c-title', dlg);
  if (ti) ti.focus();
}

function openEvent(e, presetStart) {
  const dlg = $('#dlg');
  resetDlg(dlg);
  const isNew = !e;
  const start = e ? e.starts_at : (presetStart || `${S.data.today} 09:00`);
  const end = e ? e.ends_at : `${start.slice(0, 10)} ${pad((+start.slice(11, 13) + 1) % 24)}:${start.slice(14, 16)}`;
  const startDow = (parseISO(start.slice(0, 10)).getDay() + 6) % 7;
  const rep = e ? e.repeat : '';
  dlg.innerHTML = `
    <form method="dialog" id="dlgform">
      ${GHOST_OK}
      <h3>${T.event}${e && e.recurring ? ' <span class="rpthint">⟳</span>' : ''}</h3>
      <label class="f">${T.title}<input id="f-title" required value="${esc(e ? e.title : '')}"></label>
      <label class="chk"><input type="checkbox" id="f-allday" ${e && e.all_day ? 'checked' : ''}> ${T.allDayField}</label>
      <div class="row">
        <label class="f">${T.starts}<input id="f-start" value="${start.replace(' ', 'T')}" type="datetime-local"></label>
        <label class="f">${T.ends}<input id="f-end" value="${end.replace(' ', 'T')}" type="datetime-local"></label>
      </div>
      <div class="row">
        <label class="f">${T.repeat}<select id="f-repeat">${repeatOptions(rep)}</select></label>
        <label class="f rpt-every" ${rep ? '' : 'hidden'}>${T.every}<input id="f-every" type="number" min="1" max="99" value="${e ? e.repeat_every || 1 : 1}"></label>
        <label class="f">${T.until}<input id="f-until" type="date" value="${e && e.repeat_until ? e.repeat_until : ''}"></label>
      </div>
      <div id="f-days-slot" ${rep === 'weekly' ? '' : 'hidden'}>${daysRow('f-days', e ? e.repeat_days : '', startDow)}</div>
      <label class="f">${T.location}<input id="f-loc" value="${esc(e ? e.location || '' : '')}"></label>
      <div class="row">
        ${colorRow('f-color', e ? (e.own_color || '') : '')}
        ${reminderRow('f-rem', e ? e.reminders || '' : '')}
      </div>
      <label class="f">${T.notes}<textarea id="f-notes" rows="2">${esc(e ? e.notes || '' : '')}</textarea></label>
      <menu>
        ${isNew ? '' : `<button value="del" class="danger" formnovalidate>${T.del}</button>`}
        ${isNew ? '' : `<button value="dup" formnovalidate>${T.duplicate}</button>`}
        <button value="cancel" formnovalidate>${T.cancel}</button>
        <button value="ok" class="primary">${T.save}</button>
      </menu>
    </form>`;
  wireColorRow(dlg, 'f-color');
  wireReminderRow(dlg, 'f-rem');
  wireDaysRow(dlg, 'f-days');
  const repSel = $('#f-repeat', dlg);
  repSel.onchange = () => {
    $('#f-days-slot', dlg).hidden = repSel.value !== 'weekly';
    $('.rpt-every', dlg).hidden = !repSel.value;
  };
  const allday = $('#f-allday', dlg);
  const syncType = () => {
    const t = allday.checked ? 'date' : 'datetime-local';
    ['#f-start', '#f-end'].forEach((s) => {
      const inp = $(s, dlg);
      const v = inp.value;
      inp.type = t;
      inp.value = allday.checked ? v.slice(0, 10) : (v.length <= 10 ? v + 'T09:00' : v);
    });
  };
  allday.onchange = syncType;
  if (e && e.all_day) syncType();

  $('#dlgform', dlg).onsubmit = async (ev) => {
    const action = ev.submitter && ev.submitter.value;
    if (action === 'cancel') return;
    ev.preventDefault();

    if (action === 'del') {
      let scope = 'all';
      if (e.recurring) {
        dlg.close();
        scope = await scopeDialog('delete');
        if (!scope) { return; }
      } else {
        dlg.close();
      }
      const q = e.recurring ? `?scope=${scope}&occ_date=${e.occ_date}` : '';
      await api(`api/events/${e.id}${q}`, { method: 'DELETE' });
      if (scope === 'all') {
        toast(`“${e.title}” ${T.deleted}`, async () => {
          await api('api/trash/restore', { method: 'POST', body: JSON.stringify({ kind: 'event', id: e.id }) });
          load();
        });
      } else toast(`“${e.title}” ${T.deleted}`);
      load(); return;
    }
    if (action === 'dup') {
      await api('api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: e.title, notes: e.notes, location: e.location,
          all_day: e.all_day, starts_at: e.starts_at, ends_at: e.ends_at,
          repeat: e.repeat, repeat_every: e.repeat_every, repeat_days: e.repeat_days,
          repeat_until: e.repeat_until, color: e.own_color, reminders: e.reminders,
          calendar_id: (S.calendars[0] || {}).id || null,
        }),
      });
      dlg.close(); load(); return;
    }

    const repNow = repSel.value;
    const basVal = $('#f-start', dlg).value.replace('T', ' ');
    let gunlerE = repNow === 'weekly' ? pickedDays(dlg, 'f-days') : '';
    if (repNow === 'weekly' && !$('#f-days', dlg).dataset.touched && !(e && e.repeat_days)) {
      gunlerE = String((parseISO(basVal.slice(0, 10)).getDay() + 6) % 7);
    }
    const body = {
      title: $('#f-title', dlg).value.trim(),
      all_day: allday.checked,
      starts_at: basVal,
      ends_at: $('#f-end', dlg).value.replace('T', ' '),
      repeat: repNow,
      repeat_every: +$('#f-every', dlg).value || 1,
      repeat_days: gunlerE,
      repeat_until: $('#f-until', dlg).value || '',
      location: $('#f-loc', dlg).value.trim() || '',
      notes: $('#f-notes', dlg).value.trim() || '',
      color: pickedColor(dlg, 'f-color') || '',
      reminders: pickedReminders(dlg, 'f-rem'),
      calendar_id: (S.calendars[0] || {}).id || null,
    };
    if (!body.title) return;

    if (!e) {
      await api('api/events', { method: 'POST', body: JSON.stringify(body) });
      dlg.close(); load(); return;
    }

    let scope = 'all', q = '';
    if (e.recurring) {
      const ruleChanged = repNow !== e.repeat
        || (+$('#f-every', dlg).value || 1) !== (e.repeat_every || 1)
        || (repNow === 'weekly' && pickedDays(dlg, 'f-days') !== (e.repeat_days || ''))
        || ($('#f-until', dlg).value || '') !== (e.repeat_until || '');
      dlg.close();
      // When the rule itself changed, "only this" is meaningless — Google
      // offers the same reduced pair.
      scope = await scopeDialog('edit', ruleChanged ? ['all', 'following'] : undefined);
      if (!scope) return;
      q = `?scope=${scope}&occ_date=${e.occ_date}`;
      if (scope === 'one') {
        // Send only the fields that changed: unset fields keep following
        // the series, so a later "edit all" still reaches them.
        const diff = {};
        if (body.title !== e.title) diff.title = body.title;
        if (body.starts_at !== e.starts_at) { diff.starts_at = body.starts_at; diff.ends_at = body.ends_at; }
        else if (body.ends_at !== e.ends_at) { diff.starts_at = body.starts_at; diff.ends_at = body.ends_at; }
        if (body.notes !== (e.notes || '')) diff.notes = body.notes;
        if (body.location !== (e.location || '')) diff.location = body.location;
        if (body.color !== (e.own_color || '')) diff.color = body.color;
        if (body.reminders !== (e.reminders || '')) diff.reminders = body.reminders;
        if (!Object.keys(diff).length) { load(); return; }
        await api(`api/events/${e.id}${q}`, { method: 'PATCH', body: JSON.stringify(diff) });
        toast(T.savedOne); load(); return;
      }
    } else {
      dlg.close();
    }
    await api(`api/events/${e.id}${q || (e.recurring ? `?scope=all&occ_date=${e.occ_date}` : '')}`,
      { method: 'PATCH', body: JSON.stringify(body) });
    if (scope === 'following') toast(T.savedFollowing);
    load();
  };
  dlg.showModal();
}

function openTask(t) {
  const dlg = $('#dlg');
  resetDlg(dlg);
  const liste = (S.lists.find((l) => l.id === t.list_id) || {});
  // Readable summary card on top (like Google Calendar's), edit form below.
  const ozet = [
    t.due_date ? `${parseISO(t.due_date).getDate()} ${T.months[parseISO(t.due_date).getMonth()]}`
      + (t.due_time ? ` · ${t.due_time}` : '') : null,
    liste.name || null,
    t.repeat ? `⟳ ${T[t.repeat] || t.repeat}` : null,
    t.done ? `✓ ${T.completed}${t.done_at ? ' · ' + t.done_at : ''}` : null,
  ].filter(Boolean).join('  ·  ');

  dlg.innerHTML = `
    <form method="dialog" id="dlgform">
      ${GHOST_OK}
      <div class="kart">
        <div class="kart-ust"><span class="kart-nokta" style="background:${liste.color || 'var(--ok)'}"></span>
          <b>${esc(t.title)}</b></div>
        ${ozet ? `<div class="kart-alt">${esc(ozet)}</div>` : ''}
        ${t.notes ? `<div class="kart-not">${esc(t.notes)}</div>` : ''}
      </div>
      <label class="chk"><input type="checkbox" id="t-done" ${t.done ? 'checked' : ''}> ${T.completed}</label>
      <label class="f">${T.title}<input id="t-title" required value="${esc(t.title)}"></label>
      <div class="row">
        <label class="f">${T.due}<input id="t-date" type="date" value="${t.due_date || ''}"></label>
        <label class="f">${T.time}<span class="timewrap"><input id="t-time" type="time" value="${t.due_time || ''}"><button type="button" class="timeclear" id="t-time-sil" title="${T.clearTime}">✕</button></span></label>
      </div>
      <div class="row">
        <label class="f">${T.list}<select id="t-list">${S.lists.map((l) =>
    `<option value="${l.id}"${l.id === t.list_id ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        <label class="f">${T.repeat}<select id="t-repeat">${repeatOptions(t.repeat || '')}</select></label>
      </div>
      <div id="t-days-slot" ${t.repeat === 'weekly' ? '' : 'hidden'}>${daysRow('t-days', t.repeat_days || '', t.due_date ? (parseISO(t.due_date).getDay() + 6) % 7 : 0)}</div>
      <label class="f">${T.notes}<textarea id="t-notes" rows="3">${esc(t.notes || '')}</textarea></label>
      <menu>
        <button value="del" class="danger" formnovalidate>${T.del}</button>
        <button value="cancel" formnovalidate>${T.cancel}</button>
        <button value="ok" class="primary">${T.save}</button>
      </menu>
    </form>`;

  wireDaysRow(dlg, 't-days');
  const trep2 = $('#t-repeat', dlg);
  trep2.onchange = () => { $('#t-days-slot', dlg).hidden = trep2.value !== 'weekly'; };

  const saatSil = $('#t-time-sil', dlg);
  if (saatSil) saatSil.onclick = () => { $('#t-time', dlg).value = ''; };
  $('#dlgform', dlg).onsubmit = async (ev) => {
    const action = ev.submitter && ev.submitter.value;
    if (action === 'cancel') return;
    ev.preventDefault();
    if (action === 'del') { dlg.close(); await deleteTaskFlow(t); return; }
    const bitti = $('#t-done', dlg).checked;
    // Completing a repeating task rolls it forward server-side; save the
    // other fields first, then send the status change separately.
    await api(`api/tasks/${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: $('#t-title', dlg).value.trim(),
        due_date: $('#t-date', dlg).value || '',
        due_time: $('#t-time', dlg).value || '',
        repeat: $('#t-repeat', dlg).value,
        repeat_days: $('#t-repeat', dlg).value === 'weekly' ? pickedDays(dlg, 't-days') : '',
        list_id: +$('#t-list', dlg).value,
        notes: $('#t-notes', dlg).value.trim() || '',
      }),
    });
    if (bitti !== !!t.done) {
      await api(`api/tasks/${t.id}`, {
        method: 'PATCH', body: JSON.stringify({ title: $('#t-title', dlg).value.trim(), done: bitti }),
      });
    }
    dlg.close(); load();
  };
  dlg.showModal();
}


/* ── detail cards: click → read first; Edit → the form ── */
function cardWhen(e) {
  const d1 = parseISO(e.starts_at.slice(0, 10)), d2 = parseISO(e.ends_at.slice(0, 10));
  const g1 = `${d1.getDate()} ${T.months[d1.getMonth()]}`;
  const g2 = `${d2.getDate()} ${T.months[d2.getMonth()]}`;
  if (e.all_day) return g1 === g2 ? `${g1} · ${T.allday}` : `${g1} → ${g2} · ${T.allday}`;
  const s1 = e.starts_at.slice(11, 16), s2 = e.ends_at.slice(11, 16);
  return g1 === g2 ? `${g1} · ${s1} – ${s2}` : `${g1} ${s1} → ${g2} ${s2}`;
}
function repeatText(e) {
  if (!e.repeat) return '';
  let t = T[e.repeat] || e.repeat;
  if ((e.repeat_every || 1) > 1) t = `${T.every} ${e.repeat_every} ${T.evUnit[e.repeat] || ''}`;
  if (e.repeat === 'weekly' && e.repeat_days) {
    t += ' · ' + e.repeat_days.split(',').map((d) => T.dows[+d]).join(', ');
  }
  if (e.repeat_until) t += ` · ${T.until.toLowerCase()}: ${e.repeat_until}`;
  return t;
}
function openEventCard(e) {
  const dlg = $('#dlg');
  resetDlg(dlg);
  const satirlar = [
    `<div class="kart-alt">🕐 ${esc(cardWhen(e))}</div>`,
    e.repeat ? `<div class="kart-alt">⟳ ${esc(repeatText(e))}${e.is_override ? ' · ★' : ''}</div>` : '',
    e.location ? `<div class="kart-alt">📍 ${esc(e.location)}</div>` : '',
    e.reminders ? `<div class="kart-alt">🔔 ${e.reminders.split(',').map((m) => T.remLabels[m] || m + ' dk').join(', ')}</div>` : '',
    e.notes ? `<div class="kart-not">${esc(e.notes)}</div>` : '',
  ].join('');
  dlg.innerHTML = `
    <form method="dialog" id="cardform">
      ${GHOST_OK}
      <div class="kart">
        <div class="kart-ust"><span class="kart-nokta" style="background:${e.color || 'var(--accent)'}"></span>
          <b>${esc(e.title)}</b></div>
        ${satirlar}
      </div>
      <menu>
        <button value="del" class="danger" formnovalidate>${T.del}</button>
        <button value="cancel" formnovalidate>${T.close}</button>
        <button value="ok" class="primary">✏️ ${T.editBtn}</button>
      </menu>
    </form>`;
  $('#cardform', dlg).onsubmit = async (ev) => {
    const action = (ev.submitter && ev.submitter.value) || 'ok';
    ev.preventDefault();
    if (action === 'cancel') { dlg.close(); return; }
    if (action === 'del') {
      let scope = 'all';
      dlg.close();
      if (e.recurring) {
        scope = await scopeDialog('delete');
        if (!scope) return;
      }
      const q = e.recurring ? `?scope=${scope}&occ_date=${e.occ_date}` : '';
      await api(`api/events/${e.id}${q}`, { method: 'DELETE' });
      if (scope === 'all') {
        toast(`“${e.title}” ${T.deleted}`, async () => {
          await api('api/trash/restore', { method: 'POST', body: JSON.stringify({ kind: 'event', id: e.id }) });
          load();
        });
      } else toast(`“${e.title}” ${T.deleted}`);
      load(); return;
    }
    dlg.close();
    openEvent(e);
  };
  dlg.showModal();
}
function openTaskCard(t) {
  const dlg = $('#dlg');
  resetDlg(dlg);
  const liste = (S.lists.find((l) => l.id === t.list_id) || {});
  // Description first and as large as possible; meta lines below.
  const satirlar = [
    t.notes ? `<div class="kart-not kart-not-buyuk">${esc(t.notes)}</div>` : '',
    t.due_date ? `<div class="kart-alt">🕐 ${parseISO(t.due_date).getDate()} ${T.months[parseISO(t.due_date).getMonth()]}${t.due_time ? ' · ' + t.due_time : ''}</div>` : '',
    liste.name ? `<div class="kart-alt">📋 ${esc(liste.name)}</div>` : '',
    t.repeat ? `<div class="kart-alt">⟳ ${T[t.repeat] || t.repeat}</div>` : '',
    t.done ? `<div class="kart-alt">✓ ${T.completed}${t.done_at ? ' · ' + t.done_at : ''}</div>` : '',
  ].join('');
  dlg.innerHTML = `
    <form method="dialog" id="cardform">
      ${GHOST_OK}
      <div class="kart">
        <div class="kart-ust"><span class="kart-nokta" style="background:${liste.color || 'var(--ok)'}"></span>
          <b>${esc(t.title)}</b></div>
        ${satirlar}
        ${t.projected ? `<div class="kart-alt">⟳ ${T.projected}</div>` : ''}
      </div>
      ${t.projected ? '' : `<label class="chk"><input type="checkbox" id="k-done" ${t.done ? 'checked' : ''}> ${T.completed}</label>`}
      <menu>
        <button value="del" class="danger" formnovalidate>${T.del}</button>
        <button value="cancel" formnovalidate>${T.close}</button>
        <button value="ok" class="primary">✏️ ${T.editBtn}</button>
      </menu>
    </form>`;
  const kd = $('#k-done', dlg);
  if (kd) kd.onchange = async (ev2) => {
    await api(`api/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ title: t.title, done: ev2.target.checked }) });
    dlg.close(); load();
  };
  $('#cardform', dlg).onsubmit = async (ev) => {
    const action = (ev.submitter && ev.submitter.value) || 'ok';
    ev.preventDefault();
    if (action === 'cancel') { dlg.close(); return; }
    if (action === 'del') {
      dlg.close();
      await deleteTaskFlow(t);
      return;
    }
    dlg.close();
    openTask(t);
  };
  dlg.showModal();
}

/* ── settings (second timezone + feed URLs) ───────────────────────────── */
function openSettings() {
  const dlg = $('#dlg');
  resetDlg(dlg);
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = ['Europe/Istanbul', 'Europe/Berlin', 'UTC']; }
  const base = location.origin + location.pathname.replace(/panel$/, '').replace(/\/$/, '');
  dlg.innerHTML = `
    <form method="dialog" id="dlgform">
      ${GHOST_OK}
      <h3>${T.settings}</h3>
      <label class="f">${T.tz1}
        <select id="s-tz1">
          <option value="">${T.tzLocal}</option>
          ${zones.map((z) => `<option value="${z}"${z === S.tz1 ? ' selected' : ''}>${z}</option>`).join('')}
        </select>
      </label>
      <label class="f">${T.tz2}
        <select id="s-tz2">
          <option value="">${T.tz2Off}</option>
          ${zones.map((z) => `<option value="${z}"${z === S.tz2 ? ' selected' : ''}>${z}</option>`).join('')}
        </select>
      </label>
      <div class="f">${T.feeds}
        <div class="feeds">
          🗓 <code>${esc(base)}/calendar.ics</code><br>
          ☑ <code>${esc(base)}/tasks.ics</code>
          <div class="hint">${T.subHelp}</div>
        </div>
      </div>
      <div class="f">${T.importTitle}
        <label class="impbtn">🗓 ${T.importIcs}<input type="file" id="s-imp-ics" accept=".ics,text/calendar" multiple hidden></label>
        <div class="hint">${T.importIcsHelp}</div>
        <label class="impbtn">☑ ${T.importTasks}<input type="file" id="s-imp-tasks" accept=".json,application/json" hidden></label>
        <div class="hint">${T.importTasksHelp}</div>
      </div>
      <menu>
        <button value="cancel" formnovalidate>${T.cancel}</button>
        <button value="ok" class="primary">${T.save}</button>
      </menu>
    </form>`;
  $('#s-imp-ics', dlg).onchange = async (ev) => {
    let toplam = { added: 0, updated: 0, overrides: 0 }, notlar = [];
    try {
      for (const f of ev.target.files) {
        const metin = await f.text();
        const r = await api('api/import/ics', { method: 'POST', body: JSON.stringify({ ics: metin }) });
        toplam.added += r.added; toplam.updated += r.updated; toplam.overrides += r.overrides;
        notlar.push(...(r.notes || []));
      }
      toast(`🗓 ${toplam.added}+${toplam.updated} ${T.importDone}` + (notlar.length ? ` · ${notlar.length} not` : ''));
      if (notlar.length) console.warn('import notes:', notlar);
      load();
    } catch (e) { toast(`${T.importFail}: ${e.message}`); }
    ev.target.value = '';
  };
  $('#s-imp-tasks', dlg).onchange = async (ev) => {
    try {
      const f = ev.target.files[0];
      if (!f) return;
      const veri = JSON.parse(await f.text());
      const r = await api('api/import/gtasks', { method: 'POST', body: JSON.stringify({ data: veri }) });
      toast(`☑ ${r.added}+${r.updated} ${T.importDone} (${r.lists} yeni liste)`);
      load();
    } catch (e) { toast(`${T.importFail}: ${e.message}`); }
    ev.target.value = '';
  };
  $('#dlgform', dlg).onsubmit = (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    const v1 = $('#s-tz1', dlg).value || null;
    const v = $('#s-tz2', dlg).value || null;
    S.tz1 = v1;
    S.tz2 = v;
    if (v1) LS.set(LSK('tz1'), v1); else LS.del(LSK('tz1'));
    if (v) LS.set(LSK('tz2'), v); else LS.del(LSK('tz2'));
    render();
  };
  dlg.showModal();
}

/* ── search ───────────────────────────────────────────────────────────── */
function searchOpen() {
  const w = $('.searchwrap'); if (!w) return;
  w.classList.add('acik');
  const i = $('#search'); if (i) i.focus();
}
function searchClose() {
  const w = $('.searchwrap'); if (!w) return;
  w.classList.remove('acik');
}

function wireSearch() {
  const inp = $('#search');
  const box = $('#searchresults');
  if (!inp || !box) return;
  const btn = $('#searchbtn');
  if (btn) btn.onclick = () => {
    if ($('.searchwrap').classList.contains('acik')) { searchClose(); }
    else searchOpen();
  };
  // Collapse back to the icon when focus leaves an empty box (a small delay
  // lets clicks on the result list land first).
  inp.addEventListener('blur', () => {
    setTimeout(() => {
      if (!inp.value.trim() && document.activeElement !== inp) searchClose();
    }, 180);
  });
  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { inp.value = ''; box.hidden = true; box.innerHTML = ''; searchClose(); }
  });
  let timer = null;
  const hide = () => { box.hidden = true; box.innerHTML = ''; };
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    const q = inp.value.trim();
    if (q.length < 2) { hide(); return; }
    timer = setTimeout(async () => {
      const r = await api(`api/search?q=${encodeURIComponent(q)}`).catch(() => null);
      if (!r) return;
      box.innerHTML = '';
      const mk = (icon, title, sub, fn) => {
        const row = el('button', 'sres');
        row.type = 'button';
        row.innerHTML = `<span>${icon}</span><span class="st">${esc(title)}</span><span class="ss">${esc(sub)}</span>`;
        row.onclick = () => { hide(); inp.value = ''; fn(); };
        box.appendChild(row);
      };
      for (const e of r.events.slice(0, 8)) {
        mk(e.repeat ? '⟳' : '🗓', e.title, e.starts_at.slice(0, 16), () => {
          S.anchor = parseISO(e.starts_at.slice(0, 10));
          if (S.view === 'month' || S.view === 'agenda') S.view = 'week';
          load();
        });
      }
      for (const t of r.tasks.slice(0, 8)) {
        mk(t.done ? '☑' : '☐', t.title, t.due_date || '', () => {
          const full = [...S.allTasks, ...S.doneTasks].find((x) => x.id === t.id) || t;
          openTask(full);
        });
      }
      if (!r.events.length && !r.tasks.length) {
        const p = el('div', 'sres none'); p.textContent = T.noResults; box.appendChild(p);
      }
      box.hidden = false;
    }, 220);
  });
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { hide(); inp.blur(); } });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.searchwrap')) hide(); });
}

/* ── zoom (hour height) ───────────────────────────────────────────────── */
/* Gutter drag direction: drag DOWN = zoom out (hours shrink),
   drag UP = zoom in. */
function gutterZoom(h0, dy) {
  return Math.max(18, Math.min(88, h0 - dy / 3));
}
function applyHourH(px) {
  const v = Math.max(18, Math.min(88, px));
  document.documentElement.style.setProperty('--hour-h', v + 'px');
  LS.set(LSK('hour-h'), v);
  return v;
}
function currentHourH() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour-h')) || 44;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ── wiring ───────────────────────────────────────────────────────────── */
function step(dir) {
  if (S.view === 'month') S.anchor = addMonths(S.anchor, dir);
  else S.anchor = addDays(S.anchor, dir * rangeDays());
  load();
}
function setView(v) {
  S.view = v;
  LS.set(LSK('view'), v);
  load();
}

(async function boot() {
  const cfg = await api('api/config').catch(() => ({ lang: 'en', first_weekday: 0 }));
  T = STR[cfg.lang] || STR.en;
  S.firstWeekday = cfg.first_weekday || 0;
  S.tz1 = LS.get(LSK('tz1'), null);
  S.tz2 = LS.get(LSK('tz2'), null);
  S.tz2Gizli = LS.get(LSK('tz2-gizli'), '') === '1';
  S.hideDone = LS.get(LSK('bitenleri-gizle'), '') === '1';
  S.alldayOpen = LS.get(LSK('allday-acik'), '') === '1';
  // The compact embed can switch views too — the preference is stored
  // under a SEPARATE key per flavor (LSK handles that). First open on a
  // phone defaults to the 3-day view; 7 columns don't fit.
  const saved = LS.get(LSK('view'), null);
  if (['day', '3day', 'week', '7day', 'month', 'agenda'].includes(saved)) S.view = saved;
  else S.view = (!S.compact && window.innerWidth < 700) ? '3day' : 'week';
  // On phones the task drawer starts CLOSED (it overlaid the grid)
  if (!S.compact && window.innerWidth < 900) { const p = $('#tasks'); if (p) p.hidden = true; }
  const savedH = parseInt(LS.get(LSK('hour-h'), ''), 10);
  if (savedH) applyHourH(savedH);

  $('#prev').onclick = () => step(-1);
  $('#next').onclick = () => step(1);
  $('#today').onclick = () => { S.anchor = new Date(); load(); };
  $('#today').textContent = T.today;
  $('#addbtn').textContent = '+';   // label lives in the tooltip — the bar is tight
  $('#addbtn').title = T.add;
  $('#addbtn').onclick = () => openCreate({ date: S.data.today, time: `${pad(new Date().getHours())}:00` });
  const vs = $('#viewsel');
  if (vs) {
    const ad = { day: T.day, '3day': T.day3, week: T.week, '7day': T.day7, month: T.month, agenda: T.agenda };
    [...vs.options].forEach((o) => { o.textContent = ad[o.value] || o.value; });
    vs.value = S.view;
    vs.onchange = () => setView(vs.value);
  }
  const zi = $('#zoomin'), zo = $('#zoomout');
  if (zi) { zi.title = T.zoomIn; zi.onclick = () => { applyHourH(currentHourH() + 8); render(); } }
  if (zo) { zo.title = T.zoomOut; zo.onclick = () => { applyHourH(currentHourH() - 8); render(); } }
  const st = $('#settingsbtn');
  if (st) { st.title = T.settings; st.onclick = openSettings; }
  const td = $('#toggledone');
  if (td) {
    const boya = () => { td.setAttribute('aria-pressed', String(S.hideDone)); td.title = T.hideDoneTip; };
    boya();
    td.onclick = () => {
      S.hideDone = !S.hideDone;
      LS.set(LSK('bitenleri-gizle'), S.hideDone ? '1' : '');
      boya(); render();
    };
  }
  const si = $('#search');
  if (si) si.placeholder = T.searchPh;
  wireSearch();

  const tt = $('#taskstoggle');
  if (tt) tt.onclick = () => { const p = $('#tasks'); p.hidden = !p.hidden; };
  const th = $('#tasksheading');
  if (th) th.textContent = T.tasks;

  // Task pane tabs are a dropdown: Open | Completed | Deleted
  const sek = $('#tasktabsel');
  if (sek) {
    const ad = { open: T.tabOpen, done: T.tabDone, trash: T.tabTrash };
    [...sek.options].forEach((o) => { o.textContent = ad[o.value] || o.value; });
    sek.value = S.taskTab;
    sek.onchange = () => { S.taskTab = sek.value; renderTasks(); };
  }

  // Drag-resize the task pane. The width lives in localStorage; the
  // compact embed and the full page use SEPARATE keys because their
  // space needs differ.
  const tut = $('#tasksresize');
  if (tut) {
    const anahtar = S.compact ? 'tasks-w-compact' : 'tasks-w-full';
    const uygula = (px) => {
      const v = Math.max(150, Math.min(px, Math.round(window.innerWidth * 0.7)));
      document.documentElement.style.setProperty('--tasks-w', v + 'px');
      return v;
    };
    const kayitli = parseInt(LS.get(anahtar, ''), 10);
    if (kayitli) uygula(kayitli);

    let suruklu = false;
    const bas = (ev) => {
      suruklu = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      ev.preventDefault();
    };
    const hareket = (ev) => {
      if (!suruklu) return;
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX);
      uygula(window.innerWidth - x);
    };
    const bitir = () => {
      if (!suruklu) return;
      suruklu = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      const v = getComputedStyle(document.documentElement).getPropertyValue('--tasks-w').trim();
      if (v.endsWith('px')) LS.set(anahtar, parseInt(v, 10));
    };
    tut.addEventListener('mousedown', bas);
    tut.addEventListener('touchstart', bas, { passive: false });
    window.addEventListener('mousemove', hareket);
    window.addEventListener('touchmove', hareket, { passive: false });
    window.addEventListener('mouseup', bitir);
    window.addEventListener('touchend', bitir);
    // double click = back to the default width
    tut.addEventListener('dblclick', () => {
      document.documentElement.style.removeProperty('--tasks-w');
      LS.del(anahtar);
    });
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $('#dlg').open) { $('#dlg').close(); return; }
    if (ev.target.matches('input,textarea,select')) return;
    if ($('#dlg').open || ($('#scopedlg') && $('#scopedlg').open)) return;
    const views = { d: 'day', 1: 'day', x: '3day', 3: '3day', w: 'week', 7: '7day', m: 'month', a: 'agenda' };
    if (ev.key === 'ArrowLeft') step(-1);
    else if (ev.key === 'ArrowRight') step(1);
    else if (ev.key === 't') { S.anchor = new Date(); load(); }
    else if (ev.key === 'c') openCreate({ date: S.data.today, time: `${pad(new Date().getHours())}:00` });
    else if (ev.key === '/') { searchOpen(); ev.preventDefault(); }
    else if (views[ev.key] && !S.compact) setView(views[ev.key]);
  });

  // keep the "now" line honest without a full reload
  setInterval(() => {
    const line = $('#nowline');
    if (!line) return;
    const now = new Date();
    line.style.top = `calc(var(--hour-h) * ${(now.getHours() * 60 + now.getMinutes()) / 60})`;
  }, 60000);

  await load();
  // Keep the embed fresh without a reload; cheap because the range call is small.
  setInterval(load, S.compact ? 120000 : 300000);
})();

/* test hooks (jsdom) — not used by the app itself */
window.__caltask = { S, load, render, snap15, dropPoint, gutterZoom, spanSegments, tzOffsetLabel, tzHour, openCreate, openEvent, openTask, openEventCard, openTaskCard, scopeDialog, tz2Hour, applyHourH };
