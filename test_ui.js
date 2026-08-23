/* Arayuz sinamalari: gercek index.html + app.js, jsdom uzerinde, API taklit edilerek.
   Odak: 6 gorunum (gun/3g/hafta/7g/ay/ajanda), yakinlastirma, ikinci saat dilimi
   sutunu, surukle-birak matematigi (dropPoint/snap15 saf fonksiyonlari), kapsam
   penceresi (yalniz bu / bu ve sonrakiler / tumu), renk paleti, hatirlatici
   cipleri, BYDAY gun secici, arama ve gorev paneli. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const KOK = path.join(__dirname, 'app/static');
const HTML = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
const JS = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');

const BUGUN = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ekle = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const PZT = ekle(BUGUN, -((BUGUN.getDay() + 6) % 7));

let gecti = 0, kaldi = 0;
function bekle(ad, kosul, ipucu) {
  if (kosul) { gecti++; console.log('  ✓ ' + ad); }
  else { kaldi++; console.log('  ✗ ' + ad + (ipucu ? '\n      → ' + ipucu : '')); }
}

function veri(baslangic, gun) {
  const g = (n) => iso(ekle(baslangic, n));
  const olay = (id, extra) => Object.assign({
    id, occ_date: g(0), title: 'E' + id, all_day: false,
    starts_at: `${g(0)} 10:00`, ends_at: `${g(0)} 11:00`,
    color: '#5b9dff', own_color: null, reminders: '', recurring: false,
    repeat: '', repeat_every: 1, repeat_days: '', repeat_until: null,
    notes: null, location: null, is_override: false, series_start: `${g(0)} 10:00`,
  }, extra);
  return {
    start: iso(baslangic), end: g((gun || 7) - 1), days: gun || 7, today: iso(BUGUN),
    events: [
      // Carsamba 10:00-11:30 ve 10:30-12:00 -> UST USTE, yan yana durmali
      olay(1, { title: 'Toplantı A', occ_date: g(2), starts_at: `${g(2)} 10:00`, ends_at: `${g(2)} 11:30` }),
      olay(2, { title: 'Toplantı B', occ_date: g(2), starts_at: `${g(2)} 10:30`, ends_at: `${g(2)} 12:00`, color: '#e0a83a' }),
      // Pazartesi tekrarlayan
      olay(3, { title: 'Spor', occ_date: g(0), starts_at: `${g(0)} 08:00`, ends_at: `${g(0)} 09:00`, color: '#3fbf7f', recurring: true, repeat: 'weekly' }),
      // Cuma tum gun
      olay(4, { title: 'Tatil', occ_date: g(4), all_day: true, starts_at: `${g(4)} 00:00`, ends_at: `${g(4)} 00:00` }),
      // Carsamba 22:00 -> Persembe 10:00 (COK GUNLU saatli — parcali cizilmeli)
      olay(5, { title: 'Gece nöbeti', occ_date: g(2), starts_at: `${g(2)} 22:00`, ends_at: `${g(3)} 10:00`, color: '#8e24aa' }),
    ],
    tasks: [
      { id: 9, title: 'rclone check', due_date: g(2), due_time: null, done: 0, list_id: 1, parent_id: null, repeat: '' },
      { id: 12, title: 'saatli is', due_date: g(2), due_time: '14:00', done: 0, list_id: 1, parent_id: null, repeat: '' },
      { id: 13, title: 'biten is', due_date: g(3), due_time: null, done: 1, list_id: 1, parent_id: null, repeat: '' },
      { id: 14, title: 'rutin is', due_date: g(4), due_time: null, done: 0, list_id: 1, parent_id: null, repeat: 'weekly', projected: true },
    ],
  };
}

async function kur(opts) {
  const dom = new JSDOM(HTML, { url: 'http://pi.local:8090/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  $$dialogShim(w);
  w.requestAnimationFrame = (fn) => fn();

  const cagrilar = [];
  const govdeler = [];
  w.fetch = (u, o) => {
    cagrilar.push(String(u));
    if (o && o.body) govdeler.push({ url: String(u), method: o.method, body: JSON.parse(o.body) });
    const j = (v) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(v) });
    const s = String(u);
    if (s.includes('api/config')) return j({ lang: 'tr', first_weekday: 0, today: iso(BUGUN) });
    if (s.includes('api/lists')) return j([{ id: 1, name: 'Personal', color: '#3fbf7f', position: 0 }]);
    if (s.includes('api/calendars')) return j([{ id: 1, name: 'Kişisel', color: '#5b9dff', visible: 1 }]);
    if (s.includes('api/search')) return j({
      events: [{ id: 3, title: 'Spor', starts_at: `${iso(PZT)} 08:00`, ends_at: `${iso(PZT)} 09:00`, all_day: 0, repeat: 'weekly', location: null }],
      tasks: [{ id: 9, title: 'rclone check', due_date: iso(ekle(PZT, 2)), due_time: null, done: 0, list_id: 1 }],
    });
    if (s.includes('api/tasks?include_done')) return j([
      { id: 9, title: 'rclone check', due_date: iso(ekle(PZT, 2)), due_time: null, done: 0, list_id: 1, parent_id: null, repeat: '' },
      { id: 10, title: 'Alt iş', due_date: null, due_time: null, done: 0, list_id: 1, parent_id: 9, repeat: '' },
      { id: 11, title: 'İkinci üst', due_date: null, due_time: null, done: 0, list_id: 1, parent_id: null, repeat: '' },
    ]);
    if (s.includes('api/trash/restore') || s.includes('/skip')) return j({});
    if (s.includes('api/trash')) return j({
      events: [{ id: 77, title: 'Silinen maç', starts_at: `${iso(PZT)} 20:00`, all_day: 0, deleted_at: '2026-08-17 03:00' }],
      tasks: [{ id: 78, title: 'Silinen iş', due_date: iso(PZT), due_time: null, deleted_at: '2026-08-17 03:10' }],
    });
    if (s.includes('api/tasks')) return j([
      { id: 9, title: 'rclone check', due_date: iso(ekle(PZT, 2)), due_time: null, done: 0, list_id: 1, parent_id: null, repeat: '' },
      { id: 10, title: 'Alt iş', due_date: null, due_time: null, done: 0, list_id: 1, parent_id: 9, repeat: '' },
      { id: 11, title: 'Rutin üst', due_date: iso(ekle(PZT, 1)), due_time: null, done: 0, list_id: 1, parent_id: null, repeat: 'weekly', repeat_days: '1' },
    ]);
    if (s.includes('api/range')) {
      const m = s.match(/start=(\d{4}-\d{2}-\d{2})/);
      const gm = s.match(/days=(\d+)/);
      const bas = m ? new Date(m[1] + 'T00:00:00') : PZT;
      return j(veri(bas, gm ? +gm[1] : 7));
    }
    return j({});
  };
  w.eval(JS);
  await new Promise((r) => setTimeout(r, 40));
  return { w, d: w.document, cagrilar, govdeler, tk: w.__caltask };
}
function $$dialogShim(w) {
  for (const dlg of w.document.querySelectorAll('dialog')) shimDlg(dlg);
  const orig = w.document.createElement.bind(w.document);
  w.document.createElement = (t) => { const e = orig(t); if (t === 'dialog') shimDlg(e); return e; };
  function shimDlg(dlg) {
    if (!dlg.showModal) dlg.showModal = function () { this.setAttribute('open', ''); };
    if (!dlg.show) dlg.show = function () { this.setAttribute('open', ''); };
    if (!dlg.close) dlg.close = function () { this.removeAttribute('open'); if (this.onclose) this.onclose(); };
  }
}
const sub = (w, form, value) => form.onsubmit({ submitter: { value }, preventDefault() {} });

(async () => {
  console.log('\n── haftalık ızgara çizimi ──');
  {
    const { d } = await kur();
    bekle('7 gün sütunu çizildi', d.querySelectorAll('.daycol').length === 7, d.querySelectorAll('.daycol').length);
    bekle('7 gün başlığı', d.querySelectorAll('.dayhead').length === 7);
    bekle('24 saat etiketi', d.querySelectorAll('.hours .h').length === 24);
    bekle('başlıkta tarih var', /\d/.test(d.querySelector('#title').textContent));
    bekle('bugün sütunu işaretli (tam 1)', d.querySelectorAll('.daycol.is-today').length === 1);
    bekle('şu an çizgisi yalnız bugünde', d.querySelectorAll('.nowline').length === 1);
    bekle('gün sütunları data-date taşıyor', d.querySelectorAll('.daycol[data-date]').length === 7);
  }

  console.log('\n── üst üste binen etkinlikler yan yana ──');
  {
    const { d } = await kur();
    const carsamba = d.querySelectorAll('.daycol')[2];
    const toplantilar = [...carsamba.querySelectorAll('.ev')].filter((e) => e.textContent.includes('Toplantı'));
    bekle('çarşambada 2 çakışan toplantı', toplantilar.length === 2, toplantilar.map((e) => e.textContent));
    bekle('genişlik yarıya bölündü', toplantilar.map((e) => e.style.width).every((w) => w.includes('50%')));
    bekle('farklı sütunlara yerleşti', new Set(toplantilar.map((e) => e.style.left)).size === 2);
    bekle('süreye göre yükseklik', toplantilar[0].style.height.includes('1.5'), toplantilar[0].style.height);
    bekle('tek günlük etkinlikte boyutlandırma tutamağı (.rs)', toplantilar.every((e) => e.querySelector('.rs')));
    bekle('saatte BİTİŞ de yazıyor (10:00 – 11:30)',
      toplantilar[0].querySelector('.w').textContent.includes('–'),
      toplantilar[0].querySelector('.w').textContent);
    bekle('90 dk kutu iki satıra izinli (.coksatir)', toplantilar.every((e) => e.classList.contains('coksatir')));
  }

  console.log('\n── çok günlü etkinlik parçalı çiziliyor ──');
  {
    const { d } = await kur();
    const car = d.querySelectorAll('.daycol')[2], per = d.querySelectorAll('.daycol')[3];
    const p1 = [...car.querySelectorAll('.ev')].find((e) => e.textContent.includes('Gece nöbeti'));
    const p2 = [...per.querySelectorAll('.ev')].find((e) => e.textContent.includes('Gece nöbeti'));
    bekle('ilk parça çarşambada', !!p1);
    bekle('devam parçası perşembede (kesik kenar)', p2 && p2.classList.contains('devam'), p2 && p2.className);
    bekle('ilk parçada tutamak yok (bitiş o günde değil)', p1 && !p1.querySelector('.rs'));
    bekle('son parçada tutamak var', p2 && !!p2.querySelector('.rs'));
  }

  console.log('\n── saatli görev ızgarada, biten-gizle düğmesi ──');
  {
    const { d, w } = await kur();
    const car = d.querySelectorAll('.daycol')[2];
    const tg = car.querySelector('.ev.taskev');
    bekle('saatli görev 14:00 civarında ızgarada', tg && tg.textContent.includes('saatli is'), tg && tg.textContent);
    bekle('saatli görevin kutucuğu ayrı (.cbx)', tg && !!tg.querySelector('.cbx'));
    bekle('saatli görev şeritte DEĞİL', ![...d.querySelectorAll('.allday .cell')].some((c) => c.textContent.includes('saatli is')));
    const per = d.querySelectorAll('.allday .cell')[3];
    bekle('biten görev başta görünür', per.textContent.includes('biten is'));
    d.querySelector('#toggledone').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 20));
    bekle('düğmeyle biten görev takvimden gizlendi',
      ![...d.querySelectorAll('.allday .cell')].some((c) => c.textContent.includes('biten is')));
    bekle('tercih kaydedildi', w.localStorage.getItem('caltask-bitenleri-gizle-tam') === '1');
  }

  console.log('\n── rutin görev projeksiyonu + oluk zoom yönü ──');
  {
    const { d, tk } = await kur();
    const cuma = d.querySelectorAll('.allday .cell')[4];
    const proj = cuma.querySelector('.ev.task.proj');
    bekle('projeksiyon çipi soluk sınıfla çizildi', !!proj, cuma.innerHTML.slice(0, 120));
    bekle('projeksiyonda İÇİ BOŞ daire var (tıklanmaz)', proj && proj.querySelector('.cbx.off') !== null);
    bekle('projeksiyon işaretsiz (17 Ağu: rutin işareti istenmedi)', proj && !proj.textContent.includes('⟳'), proj && proj.textContent);
    bekle('zoom yönü: AŞAĞI sürükle = uzaklaş', tk.gutterZoom(44, 30) < 44, tk.gutterZoom(44, 30));
    bekle('zoom yönü: YUKARI sürükle = yakınlaş', tk.gutterZoom(44, -30) > 44);
    bekle('zoom sınırları 18-88', tk.gutterZoom(44, 900) === 18 && tk.gutterZoom(44, -900) === 88);
  }

  console.log('\n── sabit oluşturma önizlemesi (pencere kapanana dek) ──');
  {
    const { d, tk } = await kur();
    tk.S.preview = { segs: [{ date: iso(PZT), from: 600, to: 630 }] };
    tk.render();
    const pin = d.querySelectorAll('.daycol')[0].querySelector('.dragsel.pinned');
    bekle('önizleme kutusu çizildi', !!pin, d.querySelectorAll('.daycol')[0].innerHTML.slice(0, 80));
    bekle('saat etiketi doğru', pin && pin.textContent.includes('10:00'));
    // cok gunlu sabit onizleme: uclarda bas/bitis etiketleri
    tk.S.preview = { segs: [
      { date: iso(PZT), from: 600, to: 1440 },
      { date: iso(ekle(PZT, 1)), from: 0, to: 1440 },
      { date: iso(ekle(PZT, 2)), from: 0, to: 480 },
    ] };
    tk.render();
    const p0 = d.querySelectorAll('.daycol')[0].querySelector('.dragsel.pinned');
    const p2 = d.querySelectorAll('.daycol')[2].querySelector('.dragsel.pinned');
    bekle('çok günlü: ilk kutuda başlangıç →', p0 && p0.textContent === '10:00 →', p0 && p0.textContent);
    bekle('çok günlü: son kutuda → BİTİŞ yazıyor', p2 && p2.textContent === '→ 08:00', p2 && p2.textContent);
    bekle('bitiş etiketi kutunun ALTINDA (endlbl)', p2 && p2.classList.contains('endlbl'), p2 && p2.className);
    tk.S.preview = { segs: [{ date: iso(PZT), from: 600, to: 630 }] };
    tk.render();
    bekle('yeniden çizimde hayatta kalıyor', (tk.render(), !!d.querySelectorAll('.daycol')[0].querySelector('.dragsel.pinned')));
    tk.openCreate({ date: iso(PZT), time: '10:00' });
    d.querySelector('#dlg').close();
    await new Promise((r) => setTimeout(r, 20));
    bekle('pencere kapanınca önizleme silindi', tk.S.preview === null
      && !d.querySelectorAll('.daycol')[0].querySelector('.dragsel.pinned'));
  }

  console.log('\n── gizli "her" alanı yer kaplamıyor + arama genişliği (CSS) ──');
  {
    const CSS = fs.readFileSync(path.join(KOK, 'style.css'), 'utf8');
    bekle('label.f[hidden] kuralı var', CSS.includes('label.f[hidden]') && CSS.includes('display:none!important'));
    bekle('arama kutusu genişletildi', CSS.includes('.searchwrap input{width:280px}'));
    bekle('odakta büyüme yok', CSS.includes('.searchwrap input:focus{width:280px}'));
  }

  console.log('\n── çok günlü sürükleme önizlemesi: son günde GERÇEK bitiş ──');
  {
    const { tk } = await kur();
    let sg = tk.spanSegments(2, 600, 4, 480);
    bekle('ileri: ilk gün 10:00→24:00', sg[0].col === 2 && sg[0].from === 600 && sg[0].to === 1440, JSON.stringify(sg));
    bekle('ileri: ara gün tam', sg[1].col === 3 && sg[1].from === 0 && sg[1].to === 1440);
    bekle('ileri: SON GÜN 00:00→08:00 (günün tamamı değil)', sg[2].col === 4 && sg[2].from === 0 && sg[2].to === 480);
    sg = tk.spanSegments(4, 480, 2, 600);
    bekle('ters sürükleme kronolojiye çevriliyor',
      sg[0].col === 2 && sg[0].from === 600 && sg[2].col === 4 && sg[2].to === 480, JSON.stringify(sg));
    sg = tk.spanSegments(1, 300, 1, 420);
    bekle('tek gün aynı davranış', sg.length === 1 && sg[0].from === 300 && sg[0].to === 420);
  }

  console.log('\n── tüm gün şeridi: tek satır + aç/kapa ──');
  {
    const { d, w } = await kur();
    bekle('şerit varsayılan kapalı (tek satır)', d.querySelector('.allday').classList.contains('kapali'));
    bekle('etikette ▸ işareti', d.querySelector('.allday .lbl').textContent.includes('▸'));
    bekle('"tüm gün" yazısı kalktı (yalnız ok)', !d.querySelector('.allday .lbl').textContent.includes('gün'));
    d.querySelector('.allday .lbl').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 20));
    bekle('etikete tıklayınca açıldı', !d.querySelector('.allday').classList.contains('kapali'));
  }

  console.log('\n── tüm gün şeridi + görev çipi ──');
  {
    const { d } = await kur();
    const hucreler = d.querySelectorAll('.allday .cell');
    bekle('7 tüm gün hücresi', hucreler.length === 7);
    bekle('hücreler data-date taşıyor (çip sürüklemenin hedefi)',
      [...hucreler].every((c) => c.dataset.date));
    bekle('cuma tüm gün etkinliği', hucreler[4].textContent.includes('Tatil'));
    bekle('çarşamba görev çipi', hucreler[2].textContent.includes('rclone check'));
    const cip = hucreler[2].querySelector('.ev.task');
    bekle('çipte kutucuk ayrı öğe (.cbx)', cip && !!cip.querySelector('.cbx'));
  }

  console.log('\n── görünümler: 3 gün · 7 gün (kayan) · ay · ajanda · gün ──');
  {
    const { d, w, tk, cagrilar } = await kur();
    const vs = d.querySelector('#viewsel');
    bekle('görünüm seçici AÇILIR MENÜ ve 6 seçenekli', vs && vs.tagName === 'SELECT' && vs.options.length === 6,
      vs && vs.options.length);

    vs.value = '3day'; vs.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 40));
    bekle('3 gün görünümü 3 sütun', d.querySelectorAll('.daycol').length === 3);
    let istek = cagrilar.filter((u) => u.includes('api/range')).pop();
    bekle('3 gün BUGÜNDEN başlıyor (kayan)', istek.includes(`start=${iso(BUGUN)}`) && istek.includes('days=3'), istek);

    // kayan 7 gün: carsambaya git, hafta baslangicina ZORLANMAMALI
    tk.S.anchor = ekle(PZT, 2);
    vs.value = '7day'; vs.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 40));
    istek = cagrilar.filter((u) => u.includes('api/range')).pop();
    bekle('7 gün çarşambadan başlıyor (pazartesiye çekilmedi)',
      istek.includes(`start=${iso(ekle(PZT, 2))}`) && istek.includes('days=7'), istek);
    bekle('7 sütun çizildi', d.querySelectorAll('.daycol').length === 7);

    vs.value = 'month'; vs.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 40));
    bekle('ay görünümü hücre üretti', d.querySelectorAll('.daycol').length > 20);
    bekle('ay hücreleri data-date taşıyor (sürükleme hedefi)',
      d.querySelectorAll('.daycol[data-date]').length > 20);

    vs.value = 'agenda'; vs.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 40));
    bekle('ajanda satırları çizildi', d.querySelectorAll('.arow').length >= 1);
    bekle('ajandada saat aralığı yazıyor', /\d{2}:\d{2} – \d{2}:\d{2}/.test(d.querySelector('.alist').textContent),
      d.querySelector('.alist') && d.querySelector('.alist').textContent);

    vs.value = 'day'; vs.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 40));
    bekle('gün görünümü tek sütun', d.querySelectorAll('.dayhead').length === 1);
    bekle('görünüm tercihi hatırlanıyor (localStorage)',
      w.localStorage.getItem('caltask-view-tam') === 'day', w.localStorage.getItem('caltask-view-tam'));
  }

  console.log('\n── yakınlaştırma (saat yüksekliği) ──');
  {
    const { d, w, tk } = await kur();
    tk.applyHourH(44);
    d.querySelector('#zoomin').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 20));
    const v1 = w.document.documentElement.style.getPropertyValue('--hour-h');
    bekle('+ ile saat yüksekliği arttı', v1 === '52px', v1);
    d.querySelector('#zoomout').dispatchEvent(new w.Event('click'));
    d.querySelector('#zoomout').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 20));
    bekle('- ile azaldı', w.document.documentElement.style.getPropertyValue('--hour-h') === '36px');
    bekle('alt sınır 18px (bütün gün sığar)', tk.applyHourH(1) === 18);
    bekle('tercih kaydedildi', w.localStorage.getItem('caltask-hour-h-tam') === '18');
  }

  console.log('\n── ikinci saat dilimi sütunu ──');
  {
    const { d, tk, w } = await kur();
    tk.S.tz2 = 'Europe/Istanbul';
    tk.render();
    bekle('köşede iki dilim etiketi', d.querySelectorAll('.grid-head .corner .tzl').length === 2);
    const tzl = [...d.querySelectorAll('.grid-head .corner .tzl')].map((x) => x.textContent);
    bekle('etiketler GMT+X biçiminde (17 Ağu: şehir adı istenmedi)',
      /^GMT[+-]\d/.test(tzl[0]) && /^GMT[+-]\d/.test(tzl[1]), tzl.join('|'));
    bekle('tzOffsetLabel İstanbul GMT+3', tk.tzOffsetLabel('Europe/Istanbul') === 'GMT+3',
      tk.tzOffsetLabel('Europe/Istanbul'));
    // birinci sutun da secilebilir: tz1 = Tokyo -> saatler kayar
    tk.S.tz1 = 'Asia/Tokyo';
    tk.render();
    const t1ler = [...d.querySelectorAll('.hours .h .t1')].map((x) => x.textContent);
    bekle('birinci sütun seçilen dilime göre yazılıyor',
      /^\d{2}:\d{2}$/.test(t1ler[5]) && t1ler[5] !== '05:00', t1ler[5]);
    tk.S.tz1 = null;
    bekle('saat oluğu çift sütunlu', d.querySelectorAll('.hours .h .t2').length === 24);
    const yerel = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const beklenen = tk.tz2Hour(BUGUN, 9);
    bekle('ikinci dilim saati Intl ile hesaplanıyor', /^\d{2}:\d{2}$/.test(beklenen), beklenen);
    // KÖŞE tıklanır: bir tık teke düşürür, bir tık ikiye çıkarır (ok düğmesi yok)
    const kose = d.querySelector('.grid-head .corner');
    bekle('köşe tıklanır ve etiketler tam okunur',
      kose.classList.contains('tzclick') && !kose.querySelector('.tzbtn')
      && kose.querySelectorAll('.tzl').length === 2);
    kose.onclick();
    await new Promise((r) => setTimeout(r, 20));
    bekle('bir tık: tek sütun, ayar DURUYOR',
      d.querySelectorAll('.hours .h .t2').length === 0 && tk.S.tz2 === 'Europe/Istanbul');
    bekle('tercih kaydedildi', w.localStorage.getItem('caltask-tz2-gizli-tam') === '1');
    d.querySelector('.grid-head .corner').onclick();
    await new Promise((r) => setTimeout(r, 20));
    bekle('bir tık daha: iki sütun geri', d.querySelectorAll('.hours .h .t2').length === 24);
    const CSStz = fs.readFileSync(path.join(KOK, 'style.css'), 'utf8');
    bekle('tek etiket tam genişlik (G… kırpması yok)', CSStz.includes('.tzl:only-child{max-width:100%}'));
    bekle('hafta sonu gölgesi yok (tüm günler aynı renk)', !CSStz.includes('is-weekend{background'));

    tk.S.tz2 = null;
    tk.render();
    bekle('kapatınca tek sütuna dönüyor', d.querySelectorAll('.hours .h .t2').length === 0);
  }

  console.log('\n── sürükle-bırak matematiği (saf fonksiyonlar) ──');
  {
    const { tk } = await kur();
    bekle('snap15: 07 -> 0', tk.snap15(7) === 0);
    bekle('snap15: 08 -> 15', tk.snap15(8) === 15);
    bekle('snap15: 1439 -> 1425 (gün taşmaz)', tk.snap15(1439) === 1425);
    const geom = { rect: { left: 50, top: 100 }, gutterW: 44, colW: 100, days: 7, hourH: 44 };
    let p = tk.dropPoint(geom, 50 + 44 + 250, 100 + 44 * 10.5);
    bekle('x -> 3. sütun (0 tabanlı 2)', p.day === 2, p.day);
    bekle('y -> 10:30', p.mins === 630, p.mins);
    p = tk.dropPoint(geom, 0, 100);
    bekle('sol taşma 0. güne kilitlenir', p.day === 0);
    p = tk.dropPoint(geom, 5000, 100);
    bekle('sağ taşma son güne kilitlenir', p.day === 6);
  }

  console.log('\n── tıklama: önce DETAY KARTI, Düzenle ile form (16 Ağu isteği) ──');
  {
    const { d, w } = await kur();
    const ev = d.querySelectorAll('.daycol')[0].querySelector('.ev');
    ev.dispatchEvent(new w.Event('pointerdown'));
    ev.dispatchEvent(new w.Event('pointerup'));
    await new Promise((r) => setTimeout(r, 20));
    const dlg = d.querySelector('#dlg');
    bekle('etkinliğe tıklayınca KART açıldı', dlg.hasAttribute('open') && dlg.querySelector('#cardform') !== null);
    bekle('kartta başlık + saat var', dlg.textContent.includes('Spor') && /\d{2}:\d{2}/.test(dlg.textContent));
    bekle('kart eylemleri başlığın sağında SALT EMOJİ (🗑 ✕ ✏️)',
      dlg.querySelector('.kart-ust .kart-eylem') !== null
      && dlg.querySelector('.kart-eylem button[value="del"]').textContent === '🗑'
      && dlg.querySelector('.kart-eylem button[value="cancel"]').textContent === '✕'
      && dlg.querySelector('.kart-eylem button[value="ok"]').textContent === '✏️'
      && !dlg.textContent.includes('Düzenle'));
    bekle('kartta eski menu çubuğu YOK', dlg.querySelector('#cardform menu') === null);
    bekle('tarih + tekrar TEK meta satırında', dlg.querySelector('.kart-meta') !== null);
    bekle('kartta düzenleme alanı YOK (önce oku)', dlg.querySelector('#f-title') === null);
    sub(w, dlg.querySelector('#cardform'), 'ok');
    await new Promise((r) => setTimeout(r, 20));
    bekle('Düzenle → düzenleme formu açıldı', d.querySelector('#f-title') !== null);
    bekle('formda Çoğalt düğmesi var', d.querySelector('#dlg').textContent.includes('Çoğalt'));
    bekle('formda renk paleti var', d.querySelectorAll('#dlg .pal').length >= 12);
    bekle('formda hatırlatıcı seçici var', d.querySelector('#dlg .remsel') !== null);
    bekle('Enter varsayılanı Kaydet (ghost-ok ilk düğme)',
      d.querySelector('#dlgform button').value === 'ok');
  }

  console.log('\n── kapsam penceresi (yalnız bu / bu ve sonrakiler / tümü) ──');
  {
    const { d, w, tk } = await kur();
    const soz = tk.scopeDialog('edit');
    await new Promise((r) => setTimeout(r, 20));
    const sd = d.querySelector('#scopedlg');
    bekle('kapsam penceresi açıldı', sd && sd.hasAttribute('open'));
    bekle('üç seçenek var', sd.querySelectorAll('input[name=scope]').length === 3);
    bekle('metinler doğru', sd.textContent.includes('Yalnız bu') && sd.textContent.includes('sonraki') && sd.textContent.includes('Tüm'));
    sd.querySelector('input[value=following]').checked = true;
    sub(w, sd.querySelector('form'), 'ok');
    bekle('seçim promise ile dönüyor', (await soz) === 'following');

    const sozT = tk.scopeDialog('taskmove', ['one', 'all']);
    await new Promise((r) => setTimeout(r, 20));
    const sdT = d.querySelector('#scopedlg');
    bekle('görev-taşıma kapsamı: iki seçenek + doğru metin',
      sdT.querySelectorAll('input[name=scope]').length === 2
      && sdT.textContent.includes('Yalnız bu görev') && sdT.textContent.includes('Bütün rutin'),
      sdT.textContent.slice(0, 120));
    sub(w, sdT.querySelector('form'), 'cancel');
    await sozT;

    const soz2 = tk.scopeDialog('delete', ['all', 'following']);
    await new Promise((r) => setTimeout(r, 20));
    bekle('kural değişince iki seçenek', d.querySelectorAll('#scopedlg input[name=scope]').length === 2);
    sub(w, d.querySelector('#scopedlg form'), 'cancel');
    bekle('vazgeçince null', (await soz2) === null);
  }

  console.log('\n── tekrarlayan etkinlikte Sil → kapsam sorusu ──');
  {
    const { d, w, cagrilar } = await kur();
    const spor = d.querySelectorAll('.daycol')[0].querySelector('.ev');   // tekrarlayan
    spor.dispatchEvent(new w.Event('pointerdown'));
    spor.dispatchEvent(new w.Event('pointerup'));
    await new Promise((r) => setTimeout(r, 20));
    const form = d.querySelector('#cardform');
    sub(w, form, 'del');
    await new Promise((r) => setTimeout(r, 20));
    const sd = d.querySelector('#scopedlg');
    bekle('silmeden önce kapsam soruluyor', sd && sd.hasAttribute('open'));
    sd.querySelector('input[value=one]').checked = true;
    sub(w, sd.querySelector('form'), 'ok');
    await new Promise((r) => setTimeout(r, 30));
    const silme = cagrilar.filter((u) => u.includes('api/events/3')).pop();
    bekle('scope=one + occ_date ile silindi',
      silme && silme.includes('scope=one') && silme.includes('occ_date='), silme);
  }

  console.log('\n── yeni kayıt penceresi: BYDAY + tekrar aralığı + taşınabilir ──');
  {
    const { d, w, tk } = await kur();
    tk.openCreate({ date: iso(PZT), time: '09:00' });
    await new Promise((r) => setTimeout(r, 20));
    const dlg = d.querySelector('#dlg');
    bekle('tür seçici var (Etkinlik|Görev)', dlg.querySelectorAll('.kind').length === 2);
    bekle('tür düğmeleri yalnız emoji (yazı yok)',
      [...dlg.querySelectorAll('.kind')].every((b) => !/[A-Za-zĞğ]/.test(b.textContent)),
      [...dlg.querySelectorAll('.kind')].map((b) => b.textContent).join('|'));
    bekle('"Yeni" başlığı kalktı', dlg.querySelector('h3') === null);
    bekle('başlık + tür aynı satırda (.titlerow)',
      dlg.querySelector('.titlerow .kinds') !== null && dlg.querySelector('.titlerow #c-title') !== null);
    bekle('"Tüm gün" başlık satırında YAZIYLA duruyor (16 Ağu: emoji istenmedi)',
      dlg.querySelector('.chk.ico #c-allday') !== null
      && dlg.querySelector('.titlerow').textContent.includes('Tüm gün'));
    bekle('pencere taşınabilir (movable + grip)',
      dlg.classList.contains('movable') && dlg.querySelector('.dlg-grip') !== null);
    // gorev tarafinda haftalik gun cipleri
    dlg.querySelectorAll('.kind')[1].onclick();
    const trep = dlg.querySelector('#c-trepeat');
    trep.value = 'weekly';
    trep.dispatchEvent(new w.Event('change'));
    bekle('görevde haftalık gün çipleri açıldı', dlg.querySelector('#c-tdays-slot').hidden === false);
    bekle('görev gün çipleri 7 adet', dlg.querySelectorAll('#c-tdays .byday').length === 7);
    dlg.querySelectorAll('.kind')[0].onclick();
    bekle('gün çipleri başta gizli', dlg.querySelector('#c-days-slot').hidden === true);
    const rep = dlg.querySelector('#c-repeat');
    rep.value = 'weekly';
    rep.dispatchEvent(new w.Event('change'));
    bekle('haftalık seçince gün çipleri açıldı', dlg.querySelector('#c-days-slot').hidden === false);
    bekle('7 gün çipi', dlg.querySelectorAll('#c-days .byday').length === 7);
    bekle('başlangıç günü önceden seçili', dlg.querySelector('#c-days .byday[data-d="0"]').classList.contains('sel'));
    bekle('"her N" alanı açıldı', dlg.querySelector('.rpt-every').hidden === false);
  }

  console.log('\n── yeni görev: "Tüm gün" görevde de çalışır (mobil hata, 21 Ağu) ──');
  {
    const { d, w, tk, govdeler } = await kur();
    tk.openCreate({ date: iso(PZT), time: '09:00' });
    await new Promise((r) => setTimeout(r, 20));
    const dlg = d.querySelector('#dlg');
    // gorev turune gec — kutu artik gizlenmemeli
    dlg.querySelectorAll('.kind')[1].onclick();
    const chk = dlg.querySelector('#c-allday');
    bekle('"Tüm gün" kutusu görev türünde de görünür',
      chk.closest('label').hidden !== true && !chk.closest('label').dataset.for);
    const saatInp = dlg.querySelector('#c-time');
    bekle('saat alanı önceden dolu (09:00)', saatInp.value === '09:00');
    bekle('saat yanında ✕ (saat-sil) düğmesi var', dlg.querySelector('#c-time-sil') !== null);
    chk.checked = true;
    chk.onchange();
    bekle('"Tüm gün" işaretlenince saat temizlendi + kilitlendi',
      saatInp.value === '' && saatInp.disabled === true);
    dlg.querySelector('#c-title').value = 'Tüm gün görev';
    sub(w, d.querySelector('#dlgform'), 'ok');
    await new Promise((r) => setTimeout(r, 30));
    const g = govdeler.filter((x) => x.url.includes('api/tasks') && x.method === 'POST').pop();
    bekle('POST due_time=null gitti (saat sızmadı)', g && g.body.due_time === null,
      g && JSON.stringify(g.body));
    bekle('POST due_date yerinde', g && g.body.due_date === iso(PZT));
  }

  {
    const { d, w, tk, govdeler } = await kur();
    tk.openCreate({ date: iso(PZT), time: '09:00' });
    await new Promise((r) => setTimeout(r, 20));
    const dlg = d.querySelector('#dlg');
    dlg.querySelectorAll('.kind')[1].onclick();
    // ✕ ile saat silme: isaret kutusuna dokunmadan tum gune cevirir
    dlg.querySelector('#c-time-sil').onclick();
    bekle('✕ saat alanını boşalttı', dlg.querySelector('#c-time').value === '');
    dlg.querySelector('#c-title').value = 'X ile tüm gün';
    sub(w, d.querySelector('#dlgform'), 'ok');
    await new Promise((r) => setTimeout(r, 30));
    const g = govdeler.filter((x) => x.url.includes('api/tasks') && x.method === 'POST').pop();
    bekle('✕ sonrası POST due_time=null', g && g.body.due_time === null);
    // isaret kutusu geri acilinca saat geri gelir (etkinlik davranisiyla ayni)
    tk.openCreate({ date: iso(PZT), time: '09:00' });
    await new Promise((r) => setTimeout(r, 20));
    const dlg2 = d.querySelector('#dlg');
    dlg2.querySelectorAll('.kind')[1].onclick();
    const chk2 = dlg2.querySelector('#c-allday');
    chk2.checked = true; chk2.onchange();
    chk2.checked = false; chk2.onchange();
    const t2 = dlg2.querySelector('#c-time');
    bekle('işaret kaldırılınca saat geri dolar + açılır', t2.value === '09:00' && t2.disabled === false);
    // etkinlik tarafi bozulmadi: tarih tipine gecis hala calisiyor
    chk2.checked = true; chk2.onchange();
    bekle('etkinlik başlangıcı date tipine geçti', dlg2.querySelector('#c-start').type === 'date');
  }

  console.log('\n── arama ──');
  {
    const { d, w } = await kur();
    const inp = d.querySelector('#search');
    inp.value = 'spor';
    inp.dispatchEvent(new w.Event('input'));
    await new Promise((r) => setTimeout(r, 320));
    const box = d.querySelector('#searchresults');
    bekle('sonuç kutusu açıldı', box.hidden === false);
    bekle('etkinlik sonucu listelendi', box.textContent.includes('Spor'));
    bekle('görev sonucu listelendi', box.textContent.includes('rclone check'));
  }

  console.log('\n── görev paneli: sıralama + sekme menüsü + Silinenler ──');
  {
    const { d, w } = await kur();
    bekle('liste başlığı basıldı', d.querySelector('#tasksbody').textContent.includes('Personal'));
    bekle('alt görev girintili', d.querySelectorAll('#tasksbody .task.sub').length === 1);
    const adlar = [...d.querySelectorAll('#tasksbody .task:not(.sub) .ttl')].map((x) => x.textContent);
    bekle('zamana göre sıralı: Salı rutini önce, tarihsiz sonda',
      adlar[0] === 'Rutin üst' && adlar[adlar.length - 1] !== 'Rutin üst',
      adlar.join(' | '));
    bekle('tarihli+tüm-gün satır sürüklenebilir',
      [...d.querySelectorAll('#tasksbody .task:not(.sub)')].some((r) => r.draggable === true));
    const sek = d.querySelector('#tasktabsel');
    bekle('görev sekmeleri AÇILIR MENÜ (3 seçenek)', sek && sek.tagName === 'SELECT' && sek.options.length === 3);

    // rutin gorevi silme: kapsam sorusu
    const rutinSatir = [...d.querySelectorAll('#tasksbody .task:not(.sub)')].find((r) => r.textContent.includes('Rutin üst'));
    rutinSatir.querySelector('.x').onclick();
    await new Promise((r) => setTimeout(r, 20));
    const sd = d.querySelector('#scopedlg');
    bekle('rutin görevi silerken kapsam soruluyor', sd && sd.hasAttribute('open'));
    bekle('seçenek metni: yalnız bu tekrar', sd.textContent.includes('Yalnız bu tekrar'));
    bekle('seçenek metni: bu ve sonraki tekrarlar', sd.textContent.includes('Bu ve sonraki tekrarlar'));
    sub(w, sd.querySelector('form'), 'cancel');
    await new Promise((r) => setTimeout(r, 10));

    // Silinenler gorunumu
    sek.value = 'trash';
    sek.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 40));
    const govde = d.querySelector('#tasksbody');
    bekle('Silinenler listelendi (etkinlik + görev)',
      govde.textContent.includes('Silinen maç') && govde.textContent.includes('Silinen iş'),
      govde.textContent.slice(0, 120));
    bekle('her satırda Geri al düğmesi', govde.querySelectorAll('.trow .gr').length === 2);
    bekle('24 saat notu görünür', govde.textContent.includes('24 saat'));
  }

  console.log('\n── ileri / geri / bugün ──');
  {
    const { d, w } = await kur();
    const ilk = d.querySelector('#title').textContent;
    d.querySelector('#next').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 30));
    bekle('ileri gidince başlık değişti', d.querySelector('#title').textContent !== ilk);
    d.querySelector('#prev').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 30));
    bekle('geri gelince döndü', d.querySelector('#title').textContent === ilk);
    d.querySelector('#next').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 30));
    d.querySelector('#today').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 30));
    bekle('"Bugün" bu haftaya döndürüyor', d.querySelector('#title').textContent === ilk);
  }

  console.log('\n── ayarlar: içe aktarma + yuvarlak kutular ──');
  {
    const { d, w } = await kur();
    d.querySelector('#settingsbtn').dispatchEvent(new w.Event('click'));
    await new Promise((r) => setTimeout(r, 20));
    const dlg = d.querySelector('#dlg');
    bekle('iki saat dilimi seçici', dlg.querySelector('#s-tz1') !== null && dlg.querySelector('#s-tz2') !== null);
    bekle('.ics içe aktarma girişi var (çoklu)', dlg.querySelector('#s-imp-ics') !== null
      && dlg.querySelector('#s-imp-ics').multiple === true);
    bekle('Tasks JSON girişi var', dlg.querySelector('#s-imp-tasks') !== null);
    const CSS3 = fs.readFileSync(path.join(KOK, 'style.css'), 'utf8');
    bekle('görev kutuları DAİRE (checkbox + cbx)',
      CSS3.includes('.task input[type=checkbox]{appearance:none') && CSS3.includes('border-radius:50%'));
    bekle('kutu kalınlığı 2px', CSS3.includes('border:2px solid var(--muted);border-radius:50%'));
    d.querySelector('#dlg').close();
    await new Promise((r) => setTimeout(r, 10));
    const cip = d.querySelector('#tasksbody') && d.querySelector('.allday .cell .ev.task .cbx');
    bekle('çip kutusu artık glif değil öğe', !cip || cip.textContent === '', cip && cip.textContent);
  }

  console.log('\n── panel (kompakt) sürümü ──');
  {
    const PANEL = fs.readFileSync(path.join(KOK, 'panel.html'), 'utf8');
    bekle('panel gövdesi compact sınıflı', PANEL.includes('class="compact"'));
    bekle('panelde görünüm menüsü var',
      PANEL.includes('id="viewsel"') && PANEL.includes('value="agenda"'));
    bekle('panelde biten-gizle düğmesi var', PANEL.includes('id="toggledone"'));
    bekle('panel bar sarabiliyor (taşma yok)', PANEL.includes('flex-wrap:wrap'));
    const damga = (m) => { const t = m.match(/app\.js\?v=(\d+)/); return t ? t[1] : null; };
    bekle('panel bir surum damgasi tasiyor', damga(PANEL) !== null);
    const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
    bekle('panel ile tam surum ayni damgada', damga(PANEL) === damga(INDEX));
    bekle('PWA metalari var (tam ekran ana-ekran uygulamasi)',
      INDEX.includes('apple-mobile-web-app-capable') && INDEX.includes('apple-touch-icon'));
    bekle('dokunma ikonu dosyasi uretildi', fs.existsSync(path.join(KOK, 'icon.png')));
    const CSS2 = fs.readFileSync(path.join(KOK, 'style.css'), 'utf8');
    bekle('telefonda gorunum secici GIZLENMIYOR artik',
      !CSS2.includes('.views{display:none}\n}') && CSS2.includes('@media (max-width:700px)'));
    bekle('tam surumde app.js ve style.css damgalari esit',
          damga(INDEX) !== null && INDEX.includes(`style.css?v=${damga(INDEX)}`));
    bekle('saat oluğu sürüklenebilir işaretli', JS.includes("'hours zoomable'"));

    // 17 Agu duzeltmeleri
    bekle('panelde zoom dugmeleri YOK (kullanici istegi)',
      !PANEL.includes('id="zoomin"') && !PANEL.includes('id="zoomout"'));
    bekle('tam surumde zoom dugmeleri duruyor', INDEX.includes('id="zoomin"'));
    bekle('gorev seridi geri ama sol koseler KARE (yay/daire yanilsamasi yok)',
      CSS2.includes('.ev.task{border-left:3px solid var(--ok);border-top-left-radius:2px') &&
      CSS2.includes('.ev.taskev{border-left:3px solid var(--ok);border-top-left-radius:2px'));
    bekle('gorev yazisi dikeyde ortali', CSS2.match(/\.ev\.taskev\{[^}]*align-items:center/));
    bekle('suruklerken dar blok tam sutuna genisler',
      CSS2.includes('.daycol .ev.drag{left:2px !important'));
    bekle('kenar sayfalamasi dort isleyicide de bagli',
      (JS.match(/edgeTrack\(ev\.clientX/g) || []).length >= 4 && JS.includes('function edgeTake'));
    bekle('ayni gorunumde yeniden cizim scrollu korur', JS.includes('S._scrollKey'));
    bekle('tekrarlayan tamamlamada geri-al var', JS.includes("status === 'rolled'"));
    bekle('daire uzerinde baslayan surukleme tik sayilmaz',
      JS.includes('cbxEl(t.done, () => toggleTask(t))') && JS.includes('d0.x') );

    // 17 Agu tur 2
    bekle('arama buyutec dugmesi var (iki surumde de)',
      INDEX.includes('id="searchbtn"') && PANEL.includes('id="searchbtn"'));
    bekle('arama kutusu kapaliyken gizli (CSS)',
      CSS2.includes('.searchwrap:not(.acik) input'));
    bekle("'/' kisayolu aramayi ACAR", JS.includes("searchOpen(); ev.preventDefault()"));
    bekle('baska yildaki gorevlerde yil etiketi', JS.includes("txt += ` ${d.getFullYear()}`"));

    // 17 Agu tur 3
    bekle('+ dugmesi yazisiz (yalniz +)', JS.includes("$('#addbtn').textContent = '+'"));
    bekle('surukleme metin secimini kapatir (CSS)',
      CSS2.includes('body.dragging,body.dragging *{user-select:none !important'));
    bekle('saatli gorev tum-gun seridine birakilabilir',
      JS.includes("ust.closest('.allday')") || JS.includes("ust && ust.closest('.allday')"));
    bekle('formda saat-sil dugmesi', JS.includes('t-time-sil') && CSS2.includes('.timeclear'));
    bekle('acik tum-gun seridinde tavan yok (tam surum)',
      !CSS2.includes('max-height:66px') && CSS2.includes('body.compact .allday:not(.kapali){max-height:10rem'));

    // 17 Agu tur 4: tamamlanan tekrar Bitenler'e kayit birakir
    bekle('geri-al bitmis kopyayi KALICI siler',
      JS.includes('res.done_id') && JS.includes('?hard=1'));
    bekle('kenar cubugu kutusu da geri-al yolundan gecer (toggleTask)',
      JS.includes('if (cb.checked && !t.done) { await toggleTask(t); return; }'));

    // 17 Agu tur 5: detay karti yeniden tasarimi
    bekle('gorev kartinda meta TEK satir (tarih·liste·tekrar birlesik)',
      JS.includes(".filter(Boolean).join(' · ')"));
    bekle('gorev tekrari da repeatText ile yazilir (Her gun / gun listesi)',
      JS.includes('⟳ ${esc(repeatText(t))}'));
    bekle('Tamamlandi sag altta (kart-son) + bitis saati etikette',
      JS.includes('kart-son') && JS.includes('kart-donesaat') && CSS2.includes('.kart-son{display:flex;justify-content:flex-end'));
    bekle('kart eylem stilleri var, eski buyuk-aciklama kurali kalkti',
      CSS2.includes('.kart-eylem button') && !CSS2.includes('kart-not-buyuk') && !JS.includes('kart-not-buyuk'));
    bekle('kart isaretlemesi de geri-al yolundan gecer',
      JS.includes('if (ev2.target.checked && !t.done) { await toggleTask(t); return; }'));

    // 17 Agu tur 6: kart tiklanan ogeye YAPISIK acilir (Google gibi)
    bekle('anchorCard var ve showModal SONRASI cagriliyor',
      JS.includes('function anchorCard(dlg, ref)')
      && JS.includes('dlg.showModal();\n  anchorCard(dlg, ref);'));
    bekle('sag tarafa sigmazsa SOLA gecer', JS.includes('x = r.left - 10 - c.width'));
    bekle('dar ekranda ortali modal kalir', JS.includes("window.innerWidth < 600) return"));
    bekle('pop CSS: sabit konum + saydam fon',
      CSS2.includes('#dlg.pop{position:fixed;margin:0') && CSS2.includes('#dlg.pop::backdrop{background:transparent}'));
    bekle('disari tiklayinca kapanir (yalniz backdrop/padding hedefi)',
      JS.includes('if (ev.target !== dlg) return;'));
    bekle('eylem dugmeleri yukseldi', CSS2.includes('padding:6px 10px;font-size:15px'));
    bekle('tum kart cagrilari referans gecirir',
      !JS.includes('openTaskCard(t);') && !JS.includes('openEventCard(e);'));

    // 17 Agu tur 7: bugun sutununda soluk zemin YOK, isaret gun rozeti
    bekle('bugun sutununa zemin tonu verilmiyor', !CSS2.includes('.daycol.is-today{background'));
    bekle('ay gorunumunde bugun rozeti var', CSS2.includes('.mcell.is-today .mnum{background:var(--accent)'));
  }

  console.log('\n── rutin görev düzenleme: kapsam sorusu + seri TAŞINMAZ ──');
  {
    // 17 Agu tur 8: projeksiyonun tarihini seriye YAZMAK gecmis tekrarlari
    // siliyordu — form artik yalniz degisen alanlari gonderir ve sorar.
    const rutin = () => ({ id: 21, title: 'Akşam Rutini', due_date: iso(ekle(BUGUN, 5)),
      due_time: '21:00', done: 0, list_id: 1, parent_id: null, repeat: 'daily',
      repeat_days: '', notes: 'eski not', projected: true, series_due_date: iso(BUGUN) });
    const { d, w, tk, govdeler } = await kur();
    tk.openTask(rutin());
    await new Promise((r) => setTimeout(r, 20));
    bekle('düzenleme formunun gri kartında açıklama YOK', !d.querySelector('#dlg .kart-not'));
    bekle('açıklama kutusu büyüdü (6 satır)', d.querySelector('#t-notes').rows === 6);
    d.querySelector('#t-notes').value = 'yeni not';
    sub(w, d.querySelector('#dlgform'), 'ok');
    await new Promise((r) => setTimeout(r, 20));
    const sd = d.querySelector('#scopedlg');
    bekle('açıklama değişince kapsam soruldu',
      sd && sd.hasAttribute('open') && sd.textContent.includes('Rutin görevi düzenle'),
      sd && sd.textContent.slice(0, 80));
    sd.querySelector('input[value=all]').checked = true;
    sub(w, sd.querySelector('form'), 'ok');
    await new Promise((r) => setTimeout(r, 20));
    const p = govdeler.find((g) => g.url.includes('api/tasks/21') && g.method === 'PATCH');
    bekle('Bütün rutin → PATCH yalnız değişen alanı taşıyor', p && p.body.notes === 'yeni not', p);
    bekle('due_date GÖNDERİLMEDİ (geçmiş tekrarlar yerinde)', p && !('due_date' in p.body), p);
  }
  {
    const { d, w, tk, govdeler } = await kur();
    const t = { id: 21, title: 'Akşam Rutini', due_date: iso(ekle(BUGUN, 5)),
      due_time: '21:00', done: 0, list_id: 1, parent_id: null, repeat: 'daily',
      repeat_days: '', notes: 'eski not', projected: true, series_due_date: iso(BUGUN) };
    tk.openTask(t);
    await new Promise((r) => setTimeout(r, 20));
    d.querySelector('#t-notes').value = 'sadece bugün';
    sub(w, d.querySelector('#dlgform'), 'ok');
    await new Promise((r) => setTimeout(r, 20));
    const sd = d.querySelector('#scopedlg');
    sub(w, sd.querySelector('form'), 'ok');   // ilk seçenek: Yalnız bu görev
    await new Promise((r) => setTimeout(r, 20));
    const p = govdeler.find((g) => g.url.includes('/detach'));
    bekle('Yalnız bu → detach + occ_date (seriye dokunulmaz)',
      p && p.body.occ_date === t.due_date && p.body.notes === 'sadece bugün', p);
    bekle('silmede skip HANGİ tekrarın silindiğini söylüyor',
      JS.includes("api/tasks/${t.id}/skip") && JS.includes('occ_date: t.due_date'));
  }

  console.log('\n── TELEFON: dokunuş modeli (uzun basış / dokunuş / kaydırma ayrımı) ──');
  {
    // fare: bos yere tiklamak ESKISI GIBI olustur penceresini acar
    const { d, w } = await kur();
    const col = d.querySelectorAll('.daycol')[1];
    const pd = new w.Event('pointerdown', { bubbles: true });
    pd.clientX = 300; pd.clientY = 200; pd.button = 0;
    col.dispatchEvent(pd);
    const pu = new w.Event('pointerup'); pu.clientX = 300; pu.clientY = 200;
    w.dispatchEvent(pu);
    await new Promise((r) => setTimeout(r, 20));
    bekle('fare: boş yere tık → oluştur penceresi açılır (masaüstü değişmedi)',
      d.querySelector('#dlg').hasAttribute('open') && d.querySelector('#c-title') !== null);
    d.querySelector('#dlg').close();
  }
  {
    // dokunmatik: bos yere DUZ DOKUNUS hicbir sey acmaz (+ ya da uzun basis)
    const { d, w } = await kur();
    const col = d.querySelectorAll('.daycol')[1];
    const pd = new w.Event('pointerdown', { bubbles: true });
    pd.clientX = 300; pd.clientY = 200; pd.button = 0; pd.pointerType = 'touch';
    col.dispatchEvent(pd);
    const pu = new w.Event('pointerup'); pu.clientX = 300; pu.clientY = 200; pu.pointerType = 'touch';
    w.dispatchEvent(pu);
    await new Promise((r) => setTimeout(r, 20));
    bekle('dokunuş: boş yere düz dokunuş HİÇBİR ŞEY açmaz',
      !d.querySelector('#dlg').hasAttribute('open'));
  }
  {
    // SIZINTI REGRESYONU: kaydirma pointercancel'la biterse dinleyiciler
    // kalkmali — bir SONRAKI dokunusun pointerup'i olustur penceresi ACMAMALI
    // ("hangi tusa bassam ekle gibi davraniyor"un kok nedeni buydu)
    const { d, w } = await kur();
    const col = d.querySelectorAll('.daycol')[1];
    const pd = new w.Event('pointerdown', { bubbles: true });
    pd.clientX = 300; pd.clientY = 200; pd.button = 0; pd.pointerType = 'touch';
    col.dispatchEvent(pd);
    const pc = new w.Event('pointercancel'); pc.pointerType = 'touch';
    w.dispatchEvent(pc);
    const pu = new w.Event('pointerup'); pu.clientX = 40; pu.clientY = 40; pu.pointerType = 'touch';
    w.dispatchEvent(pu);
    await new Promise((r) => setTimeout(r, 20));
    bekle('kaydırma iptalinden SONRAKİ dokunuş pencere açmaz (dinleyici sızıntısı kapandı)',
      !d.querySelector('#dlg').hasAttribute('open'));
    bekle('iptal sonrası dragging sınıfı kalmadı', !d.body.classList.contains('dragging'));
  }
  {
    // dokunmatik: UZUN BASIS bos yerde olustur penceresini acar (secim kutusuyla)
    const { d, w, tk } = await kur();
    const col = d.querySelectorAll('.daycol')[1];
    const pd = new w.Event('pointerdown', { bubbles: true });
    pd.clientX = 300; pd.clientY = 200; pd.button = 0; pd.pointerType = 'touch';
    col.dispatchEvent(pd);
    await new Promise((r) => setTimeout(r, 450));   // > LONG_PRESS_MS
    const pu = new w.Event('pointerup'); pu.clientX = 300; pu.clientY = 200; pu.pointerType = 'touch';
    w.dispatchEvent(pu);
    await new Promise((r) => setTimeout(r, 20));
    bekle('dokunuş: uzun basış → oluştur penceresi açıldı',
      d.querySelector('#dlg').hasAttribute('open') && d.querySelector('#c-title') !== null);
    bekle('uzun basış önizlemesi sabitlendi', tk.S.preview !== null);
    d.querySelector('#dlg').close();
  }
  {
    // dokunmatik: etkinlige DUZ DOKUNUS karti acar; erken hareket surukleme baslatmaz
    const { d, w } = await kur();
    const ev1 = d.querySelectorAll('.daycol')[0].querySelector('.ev');
    let pd = new w.Event('pointerdown'); pd.clientX = 100; pd.clientY = 100; pd.button = 0; pd.pointerType = 'touch';
    ev1.dispatchEvent(pd);
    let pu = new w.Event('pointerup'); pu.clientX = 100; pu.clientY = 100; pu.pointerType = 'touch';
    ev1.dispatchEvent(pu);
    await new Promise((r) => setTimeout(r, 20));
    bekle('dokunuş: etkinliğe dokununca KART açılır',
      d.querySelector('#dlg').hasAttribute('open') && d.querySelector('#cardform') !== null);
    d.querySelector('#dlg').close();
    await new Promise((r) => setTimeout(r, 10));
    // erken hareket = kaydirma: mod iptal, kart da acilmaz
    const ev2 = d.querySelectorAll('.daycol')[0].querySelector('.ev');
    pd = new w.Event('pointerdown'); pd.clientX = 100; pd.clientY = 100; pd.button = 0; pd.pointerType = 'touch';
    ev2.dispatchEvent(pd);
    const pm = new w.Event('pointermove'); pm.clientX = 100; pm.clientY = 140; pm.pointerType = 'touch';
    ev2.dispatchEvent(pm);
    pu = new w.Event('pointerup'); pu.clientX = 100; pu.clientY = 160; pu.pointerType = 'touch';
    ev2.dispatchEvent(pu);
    await new Promise((r) => setTimeout(r, 450));
    bekle('dokunuş: uzun basıştan ÖNCE hareket = kaydırma, sürükleme/kart yok',
      !d.querySelector('#dlg').hasAttribute('open') && !ev2.classList.contains('armed'));
  }
  {
    // yatay kaydirma (swipe) gorunumu cevirir
    const { d, w, cagrilar } = await kur();
    const onceki = cagrilar.filter((u) => u.includes('api/range')).pop();
    const col = d.querySelectorAll('.daycol')[3];
    const pd = new w.Event('pointerdown', { bubbles: true });
    pd.clientX = 320; pd.clientY = 300; pd.button = 0; pd.pointerType = 'touch';
    col.dispatchEvent(pd);
    // pointerup gercekte elemandan document'e kopurur (window'a degil dispatch)
    const pu = new w.Event('pointerup', { bubbles: true });
    pu.clientX = 120; pu.clientY = 310; pu.pointerType = 'touch';
    col.dispatchEvent(pu);
    await new Promise((r) => setTimeout(r, 40));
    const sonraki = cagrilar.filter((u) => u.includes('api/range')).pop();
    bekle('sola kaydırma → SONRAKİ haftaya geçti', sonraki !== onceki
      && sonraki.includes(`start=${iso(ekle(PZT, 7))}`), sonraki);
    bekle('kaydırma pencere açmadı', !d.querySelector('#dlg').hasAttribute('open'));
  }
  {
    const { tk } = await kur();
    bekle('swipeIntent: hızlı yatay hareket kaydırmadır', tk.swipeIntent(-120, 20, 300) === true);
    bekle('swipeIntent: dikey baskın hareket kaydırma DEĞİL', tk.swipeIntent(-80, 70, 300) === false);
    bekle('swipeIntent: kısa hareket kaydırma değil', tk.swipeIntent(-40, 5, 300) === false);
    bekle('swipeIntent: yavaş hareket kaydırma değil', tk.swipeIntent(-120, 5, 900) === false);
    bekle('pinchScale: parmaklar açılınca saat büyür', tk.pinchScale(44, 100, 200) === 88);
    bekle('pinchScale: parmaklar kapanınca küçülür ve 18\'de durur', tk.pinchScale(44, 200, 50) === 18);
    bekle('pinchScale: oran korunur', tk.pinchScale(40, 100, 150) === 60);
  }
  {
    const CSSM = fs.readFileSync(path.join(KOK, 'style.css'), 'utf8');
    bekle('ızgara dikey kaydırmayı tarayıcıya bırakır (touch-action:pan-y)',
      CSSM.includes('.scroll{touch-action:pan-y') && CSSM.includes('.daycol,.mcell,.allday .cell'));
    bekle('telefonda pencereler ALT SAYFA (bottom sheet)', CSSM.includes('#dlg.sheet{position:fixed;left:0;right:0;bottom:0'));
    bekle('telefonda + düğmesi FAB (başparmak menzili)', CSSM.includes('body:not(.compact) .add{position:fixed'));
    bekle('telefonda girişler 16px (iOS odak zumu biter)', CSSM.includes('select.tabs{font-size:16px}'));
    bekle('çekmece perdesi stili var (#scrim)', CSSM.includes('#scrim{position:fixed;inset:0'));
    bekle('kaba işaretçide parmak boyu hedefler (pointer:coarse)', CSSM.includes('@media (pointer:coarse)'));
    bekle('uzun basış görsel geri bildirimi (.ev.armed)', CSSM.includes('.ev.armed{transform:scale'));
    bekle('telefonda arama geri geldi (tam genişlik kaplama)',
      CSSM.includes('.searchwrap.acik input{position:fixed'));
    bekle('boyutlandırma tutamağı dokunmada büyük', CSSM.includes('.ev .rs{height:18px'));
    bekle('bildirim FAB\'ın üstünde', CSSM.includes('#toast{bottom:calc(88px'));
    bekle('dokunuşta mavi vurgu yok', CSSM.includes('-webkit-tap-highlight-color:transparent'));
    bekle('sürükleme sırasında kaydırma bastırılır (touchmove engeli)',
      JS.includes("document.addEventListener('touchmove'") && JS.includes('_touchDragging) ev.preventDefault()'));
    bekle('oluşturma sürüklemesi pointercancel dinliyor',
      JS.includes("window.addEventListener('pointercancel', iptal)"));
    bekle('telefonda oluşturma penceresi alt sayfaya döner (makeMovable kapısı)',
      JS.includes('window.innerWidth <= PHONE_W) { sheetCard(dlg); return; }'));
    bekle('görev çekmecesi perdesi JS\'te', JS.includes("s.id = 'scrim'"));
    bekle('iki parmak pinch zoom bağlı', JS.includes('function pinchTick') && JS.includes('_tp.size === 2'));
  }

  // 23 Agu — tamamlama bildirimleri: rutin "tamamlandi · siradaki", duz gorev de bildirim verir
  {
    const { d, w, govdeler } = await kur();
    const ilkFetch = w.fetch;
    w.fetch = (u, o) => {
      const s = String(u);
      if (o && o.method === 'PATCH' && s.includes('api/tasks/11') && JSON.parse(o.body).done === true)
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'rolled', due_date: iso(ekle(PZT, 8)), done_id: 901 }) });
      return ilkFetch(u, o);
    };
    // cekmecedeki satirlar: id 9 duz gorev, id 11 haftalik rutin
    const cb11 = d.querySelector('.task[data-id="11"] input[type=checkbox]');
    bekle('rutin gorevin kutusu cekmecede var', !!cb11);
    cb11.checked = true; cb11.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 30));
    let toastEl = d.querySelector('#toast');
    const d8 = iso(ekle(PZT, 8));
    bekle('rutin tamamlaninca bildirim "tamamlandi · siradaki GG.AA" (tasindi DEGIL)',
      toastEl && toastEl.classList.contains('show') && toastEl.textContent.includes('tamamlandı') &&
      toastEl.textContent.includes(`sıradaki ${d8.slice(8, 10)}.${d8.slice(5, 7)}`) && !toastEl.textContent.includes('taşındı'),
      toastEl && toastEl.textContent);
    bekle('rutin bildiriminde Geri al var', toastEl && !!toastEl.querySelector('button'));

    const cb9 = d.querySelector('.task[data-id="9"] input[type=checkbox]');
    cb9.checked = true; cb9.dispatchEvent(new w.Event('change'));
    await new Promise((r) => setTimeout(r, 30));
    toastEl = d.querySelector('#toast');
    bekle('duz gorev tamamlaninca da bildirim: "✓ “rclone check” tamamlandı" (eski bildirim ezildi)',
      toastEl && toastEl.textContent.startsWith('✓ “rclone check” tamamlandı') && !toastEl.textContent.includes('sıradaki'),
      toastEl && toastEl.textContent);
    const p9 = govdeler.find((g) => g.url.includes('api/tasks/9') && g.method === 'PATCH');
    bekle('duz gorev PATCH done:true gitti', p9 && p9.body.done === true, p9);
    // Geri al → done:false PATCH
    govdeler.length = 0;
    toastEl.querySelector('button').click();
    await new Promise((r) => setTimeout(r, 30));
    const geri = govdeler.find((g) => g.url.includes('api/tasks/9') && g.method === 'PATCH');
    bekle('duz gorevde Geri al → done:false', geri && geri.body.done === false, geri);
    const IDX2 = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8'), PNL2 = fs.readFileSync(path.join(KOK, 'panel.html'), 'utf8');
    const dmg = (s) => (s.match(/\?v=(\d+)/g) || []);
    bekle('sürüm damgaları eşit ve 2+2 (index+panel, css+js)',
      dmg(IDX2).length === 2 && dmg(PNL2).length === 2 && new Set([...dmg(IDX2), ...dmg(PNL2)]).size === 1, [dmg(IDX2), dmg(PNL2)]);
  }

  console.log(`\n═══ ${gecti} geçti · ${kaldi} kaldı ═══\n`);
  process.exit(kaldi ? 1 : 0);
})();
