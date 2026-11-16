(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const DATA = window.SCHOOLS || [];
  let SECURE = window.SCHOOL_SECURE && window.SCHOOL_SECURE.build === (window.SCHOOL_META || {}).build ? window.SCHOOL_SECURE : null;
  let admin = false, adminKey = null, editor = false;  // admin: personal data unlocked; editor: database owner (Firebase)
  let editorData = { deputies: {} };
  const META = window.SCHOOL_META || {};
  const byId = new Map(DATA.map(s => [s.id, s]));
  const PAGE = 24;
  const fmt = n => Number(n).toLocaleString('en-US');
  // Arabic counted nouns: 1 / 2 / 3-10 / 11+
  const pl = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : (n >= 3 && n <= 10) ? `${fmt(n)} ${few}` : `${fmt(n)} ${many}`;
  const schoolsN = n => pl(n, 'مدرسة واحدة', 'مدرستان', 'مدارس', 'مدرسة');
  const resultsN = (n, adj) => pl(n, `نتيجة واحدة ${adj[0]}`, `نتيجتان ${adj[1]}`, `نتائج ${adj[2]}`, `نتيجة ${adj[0]}`);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STAGES = ['المرحلة الابتدائية', 'المرحلة المتوسطة', 'المرحلة الثانوية'];
  const STAGE_SHORT = { 'المرحلة الابتدائية': 'ابتدائية', 'المرحلة المتوسطة': 'متوسطة', 'المرحلة الثانوية': 'ثانوية' };
  const SECTORS = ['قطاع الشمال', 'قطاع الجنوب', 'قطاع الشرق', 'قطاع الغرب'];
  const GOV_ORDER = ['مكة المكرمة', 'الجموم', 'بحرة', 'الليث', 'القنفذة', 'العرضيات', 'أضم', 'غير محدد'];
  const GENDERS = ['بنين', 'بنات'];
  const TYPE_ORDER = ['تعليم عام', 'تربية خاصة', 'تحفيظ القرآن الكريم', 'تعليم الكبار', 'معاهد الجامعة الإسلامية'];
  const ord = (list, v) => { const i = list.indexOf(v); return i < 0 ? 99 : i; };
  const areaLabel = s => s.sector ? s.sector + ' بمكة' : s.gov;
  const areaRow = s => s.sector ? s.sector : (s.gov === 'مكة المكرمة' ? 'مكة المكرمة (قطاع غير محدد)' : s.gov);
  const AREA_ROWS = [...SECTORS, 'مكة المكرمة (قطاع غير محدد)', ...GOV_ORDER.slice(1)];
  const managerTitle = s => s.gender === 'بنات' ? 'مديرة المدرسة' : 'مدير المدرسة';

  // default order: area, stage, name
  const sortKey = new Map(DATA.map(s => [s.id, [ord(GOV_ORDER, s.gov), s.sector ? ord(SECTORS, s.sector) : 9, ord(STAGES, s.stage)]]));
  const defaultSort = (a, b) => {
    const x = sortKey.get(a.id), y = sortKey.get(b.id);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.name.localeCompare(b.name, 'ar');
  };
  const SORTED = DATA.slice().sort(defaultSort);
  const groupSize = new Map();
  for (const s of DATA) if (s.group) groupSize.set(s.group, (groupSize.get(s.group) || 0) + 1);

  const state = { q: '', mode: 'all', expanded: false, area: '', stage: '', gender: '', type: '', group: 0, shown: PAGE, weak: false };
  let index = null, hits = new Map(), current = [], strongCount = 0, weakCount = 0;

  function getIndex() {
    if (!index) index = SchoolSearch.index(DATA.map(s => ({
      id: s.id, name: s.name, code: s.code, manager: s.manager, stage: s.stage, gender: s.gender,
      sector: s.sector, region: s.gov, town: s.town, type: s.type, office: s.office,
      ...(admin ? { identity: s.identity, phone: s.phone, email: s.email } : {}),
      ...(editor && deputyOf(s).name ? { manager: s.manager + ' ' + deputyOf(s).name } : {})
    })));
    return index;
  }

  /* ---------- filters ---------- */
  const count = (rows, fn) => { const m = new Map(); for (const r of rows) { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); } return m; };
  function fillSelect(id, values, counts) {
    const el = $(id);
    for (const v of values) if (counts.get(v)) el.add(new Option(`${v} (${fmt(counts.get(v))})`, v));
  }
  function buildFilters() {
    const govs = count(DATA, s => s.gov), secs = count(DATA, s => s.sector);
    const area = $('area');
    const mk = document.createElement('optgroup'); mk.label = 'مكة المكرمة';
    mk.appendChild(new Option(`مكة المكرمة: جميع القطاعات (${fmt(govs.get('مكة المكرمة') || 0)})`, 'gov:مكة المكرمة'));
    for (const s of SECTORS) if (secs.get(s)) mk.appendChild(new Option(`${s} (${fmt(secs.get(s))})`, 'sector:' + s));
    area.appendChild(mk);
    const og = document.createElement('optgroup'); og.label = 'المحافظات';
    for (const g of GOV_ORDER.slice(1)) if (govs.get(g)) og.appendChild(new Option(`${g} (${fmt(govs.get(g))})`, 'gov:' + g));
    area.appendChild(og);
    fillSelect('stage', STAGES, count(DATA, s => s.stage));
    fillSelect('gender', GENDERS, count(DATA, s => s.gender));
    fillSelect('type', TYPE_ORDER, count(DATA, s => s.type));
  }
  function passes(s) {
    if (state.area) {
      const [k, v] = state.area.split(':');
      if (k === 'gov' ? s.gov !== v : s.sector !== v) return false;
    }
    return (!state.stage || s.stage === state.stage) && (!state.gender || s.gender === state.gender) && (!state.type || s.type === state.type);
  }
  const hasFilters = () => !!(state.area || state.stage || state.gender || state.type);
  function filterText() {
    const parts = [];
    if (state.area) parts.push(state.area.split(':')[1]);
    if (state.stage) parts.push(state.stage);
    if (state.gender) parts.push(state.gender);
    if (state.type) parts.push(state.type);
    return parts.join(' · ');
  }

  /* ---------- stats ---------- */
  const STAT_DEFS = [
    { label: 'إجمالي المدارس', cls: 'total', n: () => DATA.length, apply: () => resetAll(), on: () => !hasFilters() && !state.q && !state.group },
    { label: 'مدارس البنين', n: () => DATA.filter(s => s.gender === 'بنين').length, key: 'gender', val: 'بنين' },
    { label: 'مدارس البنات', n: () => DATA.filter(s => s.gender === 'بنات').length, key: 'gender', val: 'بنات' },
    ...STAGES.map(st => ({ label: STAGE_SHORT[st], n: () => DATA.filter(s => s.stage === st).length, key: 'stage', val: st }))
  ];
  function renderStats() {
    $('stats').innerHTML = STAT_DEFS.map((d, i) => {
      const on = d.on ? d.on() : state[d.key] === d.val;
      return `<button type="button" class="stat ${d.cls || ''}" data-stat="${i}" aria-pressed="${on}"><b>${fmt(d.n())}</b><span>${esc(d.label)}</span></button>`;
    }).join('');
  }
  $('stats').addEventListener('click', e => {
    const b = e.target.closest('[data-stat]'); if (!b) return;
    const d = STAT_DEFS[+b.dataset.stat];
    if (d.apply) { d.apply(); return; }
    state[d.key] = state[d.key] === d.val ? '' : d.val; state.group = 0;
    syncControls(); update();
  });

  /* ---------- search + render ---------- */
  function compute() {
    hits = new Map(); strongCount = weakCount = 0;
    if (state.group) { current = SORTED.filter(s => s.group === state.group); return; }
    const q = state.q.trim();
    if (q && SchoolSearch.norm(q)) {
      const res = SchoolSearch.search(getIndex(), q, { expanded: state.expanded, mode: state.mode });
      const strong = [], weak = [];
      for (const h of res) {
        const s = byId.get(h.s.id); if (!s || !passes(s)) continue;
        hits.set(s.id, h); (h.category === 'possible' ? weak : strong).push(s);
      }
      strongCount = strong.length; weakCount = weak.length;
      // possible matches are shown on request when there are direct matches, otherwise they are the answer
      current = strong.length ? (state.weak ? strong.concat(weak) : strong) : weak;
    } else current = SORTED.filter(passes);
  }

  const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>';
  const dd = v => v ? esc(v) : '<span class="none">غير مسجّل</span>';
  const NONE = '<span class="none">غير مسجّل</span>';
  const digits = v => String(v || '').replace(/\D/g, '');
  function localPhone(v) {
    let d = digits(v); if (!d) return '';
    if (d.startsWith('00966')) d = d.slice(5); else if (d.startsWith('966')) d = d.slice(3);
    return d.startsWith('0') ? d : '0' + d;
  }
  const intlPhone = v => { const l = localPhone(v); return l ? '966' + l.slice(1) : ''; };
  const ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 001.8-1.3 2.2 2.2 0 00.1-1.3c0-.1-.2-.2-.5-.3z"/></svg>';
  const ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z"/></svg>';
  const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
  function contactBlock(s) {
    if (!admin) return '';
    const f = s.gender === 'بنات', ph = localPhone(s.phone), wa = intlPhone(s.phone);
    const item = (label, html, wide) => `<div class="detail${wide ? ' wide' : ''}"><dt>${label}</dt><dd>${html}</dd></div>`;
    let rows = item(f ? 'هوية المديرة' : 'هوية المدير', s.identity ? `<span class="ltr">${esc(s.identity)}</span>` : NONE)
      + item(f ? 'جوال المديرة' : 'جوال المدير', ph ? `<a href="tel:${ph}">${ph}</a>` : NONE)
      + item('البريد الإلكتروني', s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : NONE, true);
    if (editor) {
      const dp = deputyOf(s), dph = localPhone(dp.phone);
      rows += `<div class="detail wide dep-title"><dt>${f ? 'الوكيلة' : 'الوكيل'} · للمسؤول فقط</dt></div>`
        + item('اسم الوكيل/ة', dp.name ? esc(dp.name) : NONE)
        + item('رقم الوكيل/ة', dph ? `<a href="tel:${dph}">${dph}</a>` : NONE)
        + item('هوية الوكيل/ة', dp.identity ? `<span class="ltr">${esc(dp.identity)}</span>` : NONE);
    }
    const links = (wa ? `<a class="wa" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ICON_WA}واتساب</a><a href="tel:${ph}">${ICON_PHONE}اتصال</a>` : '')
      + (s.email ? `<a href="mailto:${esc(s.email)}">${ICON_MAIL}بريد</a>` : '');
    return `<div class="contact"><div class="contact-title">${ICON_LOCK}بيانات الإدارة</div><dl class="details">${rows}</dl>${links ? `<div class="links">${links}</div>` : ''}</div>`;
  }
  const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
  const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 018 0"/></svg>';
  function card(s) {
    const h = hits.get(s.id);
    const why = h && h.category !== 'exact' && h.reason ? `<div class="why ${h.category === 'possible' ? 'possible' : ''}">${esc(h.reason)}</div>` : '';
    let g = '';
    if (s.group && !state.group) {
      const others = groupSize.get(s.group) - 1, f = s.gender === 'بنات';
      const what = others === 1 ? 'مدرسة أخرى' : others === 2 ? 'مدرستين أخريين' : `${fmt(others)} مدارس أخرى`;
      g = `<button type="button" class="group-link" data-group="${s.group}">${f ? 'تديرها المديرة نفسها' : 'يديرها المدير نفسه'} مع ${what}: اعرضها</button>`;
    }
    return `<article class="school" data-gender="${esc(s.gender)}">
<div class="school-head"><h2>${esc(s.name)}</h2><span class="tag">${esc(s.gender)}</span></div>
<div class="code">الرقم الوزاري <b>${esc(s.code)}</b><button type="button" class="copy" data-copy="${esc(s.code)}" aria-label="نسخ الرقم الوزاري ${esc(s.code)}" title="نسخ">${COPY_ICON}</button></div>
${why}
<dl class="details">
<div class="detail"><dt>القطاع / المحافظة</dt><dd>${dd(areaLabel(s))}</dd></div>
<div class="detail"><dt>المدينة / القرية</dt><dd>${dd(s.town)}</dd></div>
<div class="detail"><dt>المرحلة</dt><dd>${dd(s.stage)}</dd></div>
<div class="detail"><dt>نوع التعليم</dt><dd>${dd(s.type)}</dd></div>
<div class="detail"><dt>مكتب التعليم</dt><dd>${dd(s.office)}</dd></div>
<div class="detail"><dt>السلطة</dt><dd>${dd(s.authority)}</dd></div>
<div class="detail wide"><dt>${managerTitle(s)}</dt><dd>${dd(s.manager)}</dd></div>
</dl>${contactBlock(s)}${g}<button type="button" class="view-all" data-view="${s.id}">${ICON_EYE}عرض جميع البيانات</button>${editor ? `<div class="edit-row"><button type="button" class="ebtn" data-edit="${s.id}">${ICON_EDIT}تعديل</button><button type="button" class="ebtn del" data-del="${s.id}">${ICON_DEL}حذف</button></div>` : ''}</article>`;
  }

  function render() {
    const total = current.length, q = state.q.trim();
    let head;
    if (state.group) head = `<b>${schoolsN(total)}</b> ${total === 2 ? 'يديرهما' : 'يديرها'} ${current[0] && current[0].gender === 'بنات' ? 'مديرة واحدة' : 'مدير واحد'}`;
    else if (q) {
      const within = hasFilters() ? ' · ضمن: ' + esc(filterText()) : '';
      if (!total) head = `لا توجد نتائج لـ«${esc(q)}»`;
      else if (!strongCount) head = `لم نجد تطابقًا مباشرًا لـ«${esc(q)}»<small>هذه أقرب الاحتمالات: ${resultsN(total, ['محتملة', 'محتملتان', 'محتملة'])}، مرتبة من الأقرب${within}</small>`;
      else head = `<b>${resultsN(strongCount, ['مطابقة', 'مطابقتان', 'مطابقة'])}</b> لـ«${esc(q)}»<small>${weakCount ? `ومعها ${resultsN(weakCount, ['محتملة أضعف', 'محتملتان أضعف', 'محتملة أضعف'])}${state.weak ? '، معروضة بعدها' : ''}` : 'مرتبة من الأقرب إلى بحثك'}${within}</small>`;
    }
    else head = `<b>${schoolsN(total)}</b>${hasFilters() ? `<small>${esc(filterText())}</small>` : '<small>جميع مدارس الدليل</small>'}`;
    $('count').innerHTML = head;
    if (!total) {
      const tips = q ? (state.expanded ? 'جرّب كلمة مميزة من الاسم، أو امسح التصفية.' : 'جرّب كلمة مميزة من الاسم، أو فعّل «بحث موسّع»، أو امسح التصفية.') : 'امسح التصفية لعرض كل المدارس.';
      $('results').innerHTML = `<div class="empty"><b>لم نجد مدرسة مطابقة</b>${tips}</div>`;
    } else {
      const shown = current.slice(0, state.shown);
      $('results').innerHTML = shown.map((s, i) => (state.weak && strongCount && i === strongCount ? `<div class="divider">نتائج محتملة أضعف (${fmt(weakCount)})</div>` : '') + card(s)).join('');
    }
    const showWeak = !state.group && strongCount && weakCount && !state.weak;
    $('weak-wrap').hidden = !showWeak;
    if (showWeak) $('show-weak').textContent = `عرض النتائج المحتملة الأضعف (${fmt(weakCount)})`;
    $('more-wrap').hidden = total <= state.shown;
    $('more').textContent = `عرض المزيد (المتبقي: ${schoolsN(Math.max(total - state.shown, 0))})`;
    const gb = $('group-banner');
    if (state.group) {
      const first = current[0];
      $('group-text').textContent = first ? `مدارس ${first.gender === 'بنات' ? 'المديرة' : 'المدير'}: ${first.manager}` : '';
      gb.hidden = false;
    } else gb.hidden = true;
    renderStats();
    for (const id of ['area', 'stage', 'gender', 'type']) $(id).classList.toggle('active', !!state[id]);
    $('clear-q').hidden = !state.q;
  }

  function update(keepShown) {
    if (!keepShown) { state.shown = PAGE; state.weak = false; }
    compute(); render(); saveUrl();
  }

  /* ---------- URL state ---------- */
  let urlTimer = null;
  function saveUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const p = new URLSearchParams();
      if (state.q) p.set('q', state.q);
      if (state.mode !== 'all') p.set('mode', state.mode);
      if (state.expanded) p.set('x', '1');
      for (const k of ['area', 'stage', 'gender', 'type']) if (state[k]) p.set(k, state[k]);
      if (state.group) p.set('g', state.group);
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }, 300);
  }
  function loadUrl() {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    state.mode = ['all', 'name', 'code'].includes(p.get('mode')) ? p.get('mode') : 'all';
    state.expanded = p.get('x') === '1';
    for (const k of ['area', 'stage', 'gender', 'type']) {
      const v = p.get(k) || '';
      state[k] = [...$(k).options].some(o => o.value === v) ? v : '';
    }
    state.group = groupSize.has(+p.get('g')) ? +p.get('g') : 0;
  }
  function syncControls() {
    $('q').value = state.q;
    document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
    $('expanded').checked = state.expanded;
    for (const k of ['area', 'stage', 'gender', 'type']) $(k).value = state[k];
    updateModeText();
  }
  function resetAll() {
    Object.assign(state, { q: '', area: '', stage: '', gender: '', type: '', group: 0 });
    syncControls(); update();
  }

  const MODE_TEXT = {
    all: ['البحث الذكي في المدارس', 'اسم المدرسة أو رقمها أو اسم المدير', 'يتجاهل الهمزات والتاء المربوطة والتشكيل، ويفهم الأعداد المكتوبة بالحروف مثل «الثالثة والعشرون»، ويصحح الكتابة إذا كانت لوحة المفاتيح على الإنجليزية.'],
    name: ['البحث باسم المدرسة', 'اكتب اسم المدرسة أو كلمات منه، حتى مع خطأ إملائي', 'يبحث في أسماء المدارس فقط، مع اختلاف الكتابة وترتيب الكلمات والأعداد المكتوبة بالحروف.'],
    code: ['البحث بالرقم الوزاري', 'اكتب الرقم الوزاري كاملًا أو جزءًا منه', 'يقبل الأرقام العربية والإنجليزية، والأرقام القريبة تظهر كاحتمالات للمراجعة.']
  };
  function updateModeText() {
    const t = MODE_TEXT[state.mode];
    $('q-label').textContent = t[0];
    $('q').placeholder = admin && state.mode === 'all' ? 'اسم المدرسة أو رقمها أو اسم المدير أو هويته أو جواله' : t[1];
    $('search-help').textContent = admin && state.mode === 'all' ? t[2] + ' ويبحث أيضًا برقم هوية المدير وجواله وبريده.' : t[2];
    $('q').setAttribute('inputmode', state.mode === 'code' ? 'numeric' : 'search');
  }

  /* ---------- events ---------- */
  let qTimer = null;
  $('q').addEventListener('input', () => {
    state.q = $('q').value; state.group = 0; $('clear-q').hidden = !state.q;
    clearTimeout(qTimer); qTimer = setTimeout(() => update(), 180);
  });
  function submit() {
    clearTimeout(qTimer); state.q = $('q').value; state.group = 0; update();
    if (matchMedia('(max-width:700px)').matches) { $('q').blur(); $('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  $('go').addEventListener('click', submit);
  $('clear-q').addEventListener('click', () => { state.q = ''; $('q').value = ''; update(); $('q').focus(); });
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => { state.mode = r.value; updateModeText(); update(); }));
  $('expanded').addEventListener('change', () => { state.expanded = $('expanded').checked; update(); });
  for (const k of ['area', 'stage', 'gender', 'type']) $(k).addEventListener('change', () => { state[k] = $(k).value; state.group = 0; update(); });
  $('reset').addEventListener('click', () => { Object.assign(state, { area: '', stage: '', gender: '', type: '', group: 0 }); syncControls(); update(); });
  $('more').addEventListener('click', () => { state.shown += PAGE; render(); });
  $('show-weak').addEventListener('click', () => { state.weak = true; compute(); state.shown = Math.max(state.shown, strongCount + PAGE); render(); });
  $('results').addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) { copyText(c.dataset.copy).then(() => toast('نُسخ الرقم الوزاري ' + c.dataset.copy)); return; }
    const v = e.target.closest('[data-view]');
    if (v) { openDetails(+v.dataset.view); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openEditor(+ed.dataset.edit); return; }
    const dl = e.target.closest('[data-del]');
    if (dl) { askDelete(+dl.dataset.del); return; }
    const g = e.target.closest('[data-group]');
    if (g) { state.group = +g.dataset.group; update(); $('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  $('group-close').addEventListener('click', () => { state.group = 0; update(); });
  $('share').addEventListener('click', () => { saveUrl(); setTimeout(() => copyText(location.href).then(() => toast('نُسخ رابط البحث الحالي')), 320); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); $('q').focus(); }
  });

  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
    return Promise.resolve(fallbackCopy(t));
  }
  function fallbackCopy(t) {
    const a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } a.remove();
  }
  let toastTimer = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

  /* ---------- reports ---------- */
  function tables(rows) {
    const T = [];
    const by = (fn) => count(rows, fn);
    // area x stage x gender
    const areaRows = AREA_ROWS.filter(a => rows.some(s => areaRow(s) === a));
    const cell = (a, f) => rows.filter(s => areaRow(s) === a && f(s)).length;
    T.push({
      title: 'حسب القطاع والمحافظة', wide: true,
      head: ['القطاع / المحافظة', 'ابتدائية', 'متوسطة', 'ثانوية', 'بنين', 'بنات', 'الإجمالي'],
      rows: areaRows.map(a => [a, ...STAGES.map(st => cell(a, s => s.stage === st)), ...GENDERS.map(g => cell(a, s => s.gender === g)), cell(a, () => true)]),
      total: ['الإجمالي', ...STAGES.map(st => rows.filter(s => s.stage === st).length), ...GENDERS.map(g => rows.filter(s => s.gender === g).length), rows.length]
    });
    const sg = (list, key) => list.filter(v => rows.some(s => s[key] === v)).map(v => [v, ...GENDERS.map(g => rows.filter(s => s[key] === v && s.gender === g).length), rows.filter(s => s[key] === v).length]);
    const gtot = ['الإجمالي', ...GENDERS.map(g => rows.filter(s => s.gender === g).length), rows.length];
    T.push({ title: 'حسب المرحلة والجنس', head: ['المرحلة', 'بنين', 'بنات', 'الإجمالي'], rows: sg(STAGES, 'stage'), total: gtot });
    T.push({ title: 'حسب نوع التعليم والجنس', head: ['نوع التعليم', 'بنين', 'بنات', 'الإجمالي'], rows: sg(TYPE_ORDER, 'type'), total: gtot });
    const offices = [...by(s => s.office)].sort((a, b) => b[1] - a[1]);
    T.push({ title: 'حسب مكتب التعليم', head: ['مكتب التعليم', 'العدد'], rows: offices.map(([k, v]) => [k, v]), total: ['الإجمالي', rows.length], bars: true });
    // managers
    const mgr = new Map();
    for (const s of rows) { const k = s.group ? 'g' + s.group : 'i' + s.id; mgr.set(k, (mgr.get(k) || 0) + 1); }
    const dist = [0, 0, 0, 0];
    for (const v of mgr.values()) dist[Math.min(v, 4) - 1]++;
    T.push({
      title: 'المديرون والمديرات حسب عدد المدارس', head: ['يدير', 'عدد المديرين والمديرات'],
      rows: [['مدرسة واحدة', dist[0]], ['مدرستين', dist[1]], ['3 مدارس', dist[2]], ['4 مدارس فأكثر', dist[3]]].filter(r => r[1]),
      total: ['إجمالي المديرين والمديرات', mgr.size], bars: true
    });
    return { T, managers: mgr.size };
  }

  function reportMeta(scope) {
    const now = new Date();
    const g = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'long', timeStyle: 'short' }).format(now);
    let h = '';
    try { h = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'long' }).format(now); } catch (e) { /* ignore */ }
    const lines = ['مدير إدارة الإدارة المدرسية: د. سعيد الحربي', `النطاق: ${scope === 'all' ? 'جميع المدارس' : 'النتائج الحالية'}`];
    if (scope !== 'all') {
      if (state.group) lines.push('مدارس مدير واحد');
      if (state.q.trim()) lines.push(`نص البحث: «${state.q.trim()}»`);
      if (hasFilters()) lines.push(`التصفية: ${filterText()}`);
    }
    lines.push(`تاريخ البيانات: ${META.date || '—'}`);
    lines.push(`أُعدّ في: ${g}${h ? ' (' + h + ')' : ''}`);
    return lines;
  }

  function reportHtml(scope) {
    const rows = scope === 'all' ? DATA : current;
    const { T, managers } = tables(rows);
    const kpi = (n, l) => `<div class="kpi"><b>${fmt(n)}</b><span>${l}</span></div>`;
    const tbl = t => {
      const last = r => r[r.length - 1];
      const gi = t.head.indexOf('بنين'), gj = t.head.indexOf('بنات'), split = gi > 0 && gj > 0;
      const max = Math.max(...t.rows.map(last), 1);
      const sw = h => h === 'بنين' ? '<i class="sw b"></i>' : h === 'بنات' ? '<i class="sw g"></i>' : '';
      const bar = r => {
        if (split) {
          const b = r[gi], g = r[gj];
          return `<span class="gbar" style="width:${Math.max(Math.round(last(r) / max * 100), 2)}%">${b ? `<i class="b" style="flex:${b}" title="بنين: ${fmt(b)}"></i>` : ''}${g ? `<i class="g" style="flex:${g}" title="بنات: ${fmt(g)}"></i>` : ''}</span>`;
        }
        return t.bars ? `<span class="bar" style="width:${Math.round(last(r) / max * 100)}%"></span>` : '';
      };
      const legend = split ? '<span class="legend"><span><i class="sw b"></i>بنين</span><span><i class="sw g"></i>بنات</span></span>' : '';
      return `<section class="rsec ${t.wide ? 'wide' : ''}"><h4>${esc(t.title)}${legend}</h4><table><thead><tr>${t.head.map((h, i) => `<th class="${i ? 'n' : ''}">${sw(h)}${esc(h)}</th>`).join('')}</tr></thead><tbody>${
        t.rows.map(r => `<tr>${r.map((c, i) => i ? `<td class="n">${fmt(c)}</td>` : `<td>${esc(c)}${bar(r)}</td>`).join('')}</tr>`).join('')
      }<tr class="total">${t.total.map((c, i) => i ? `<td class="n">${fmt(c)}</td>` : `<td>${esc(c)}</td>`).join('')}</tr></tbody></table></section>`;
    };
    return `<div class="report"><h2>تقرير أعداد مدارس منطقة مكة المكرمة</h2><div class="meta">${reportMeta(scope).map(esc).join('<br>')}</div>
<div class="kpis">${kpi(rows.length, 'إجمالي المدارس')}${kpi(rows.filter(s => s.gender === 'بنين').length, 'مدارس البنين')}${kpi(rows.filter(s => s.gender === 'بنات').length, 'مدارس البنات')}${kpi(managers, 'مديرون ومديرات')}</div>
<div class="rgrid">${T.map(tbl).join('')}</div></div>`;
  }
  function renderReport() { $('report-body').innerHTML = reportHtml($('report-scope').value); }
  $('open-report').addEventListener('click', () => {
    $('report-scope').value = (state.q.trim() || hasFilters() || state.group) ? 'results' : 'all';
    renderReport(); $('report-dialog').showModal();
  });
  $('report-scope').addEventListener('change', renderReport);
  $('print-report').addEventListener('click', () => { $('print-area').innerHTML = '<div class="print-banner"><img src="ministry-header.png" alt=""></div>' + reportHtml($('report-scope').value); window.print(); });

  /* ---------- Excel ---------- */
  function loadExcel() {
    if (window.ExcelJS) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/exceljs.min.js';
      s.onload = () => res(); s.onerror = () => rej(new Error('تعذّر تحميل أداة Excel. تحقق من الاتصال ثم أعد المحاولة.'));
      document.head.appendChild(s);
    });
  }
  const NAVY = 'FF173F67', SOFT = 'FFEDF2F6';
  function styleHead(row) {
    row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
    row.height = 24;
  }
  function addStatsSheet(wb, rows, scope) {
    const ws = wb.addWorksheet('الإحصاءات', { views: [{ rightToLeft: true }] });
    ws.columns = [{ width: 34 }, ...Array(6).fill({ width: 13 })];
    const t1 = ws.addRow(['تقرير أعداد مدارس منطقة مكة المكرمة']); t1.font = { bold: true, size: 14, color: { argb: NAVY } };
    for (const l of reportMeta(scope)) ws.addRow([l]).font = { color: { argb: 'FF5B6E80' } };
    ws.addRow([]);
    for (const t of tables(rows).T) {
      const tr = ws.addRow([t.title]); tr.font = { bold: true, size: 12, color: { argb: NAVY } };
      styleHead(ws.addRow(t.head));
      for (const r of t.rows) ws.addRow(r).eachCell((c, i) => { if (i > 1) c.alignment = { horizontal: 'center' }; });
      const tot = ws.addRow(t.total);
      tot.eachCell((c, i) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; if (i > 1) c.alignment = { horizontal: 'center' }; });
      ws.addRow([]);
    }
  }
  const ADMIN_COLS = [
    ['هوية المدير / المديرة', 14, s => s.identity], ['جوال المدير / المديرة', 14, s => localPhone(s.phone)],
    ['البريد الإلكتروني', 32, s => s.email]
  ];
  const DEPUTY_COLS = [['اسم الوكيل/ة', 28, s => deputyOf(s).name || ''], ['رقم الوكيل/ة', 14, s => localPhone(deputyOf(s).phone)], ['هوية الوكيل/ة', 14, s => deputyOf(s).identity || '']];
  const COLS = [
    ['م', 6, (s, i) => i + 1], ['الرقم الوزاري', 14, s => s.code], ['اسم المدرسة', 46, s => s.name], ['المرحلة', 18, s => s.stage],
    ['الجنس', 9, s => s.gender], ['نوع التعليم', 20, s => s.type], ['مكتب التعليم', 18, s => s.office],
    ['المحافظة', 14, s => s.gov], ['القطاع', 13, s => s.sector], ['المدينة / القرية', 30, s => s.town],
    ['المنطقة الإدارية', 14, s => s.region], ['السلطة', 9, s => s.authority], ['مدير / مديرة المدرسة', 34, s => s.manager]
  ];
  async function saveWorkbook(wb, name) {
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function newBook() { const wb = new ExcelJS.Workbook(); wb.creator = 'دليل مدارس منطقة مكة المكرمة'; wb.created = new Date(); return wb; }

  function openExport() {
    $('export-results-count').textContent = `${schoolsN(current.length)}${state.q.trim() ? ' من نتائج البحث' : ''}${hasFilters() ? ' · ' + filterText() : ''}`;
    $('export-all-count').textContent = schoolsN(DATA.length);
    document.querySelector(`input[name="export-scope"][value="${(state.q.trim() || hasFilters() || state.group) ? 'results' : 'all'}"]`).checked = true;
    $('export-error').textContent = '';
    $('export-dialog').showModal();
  }
  $('open-export').addEventListener('click', openExport);
  $('download-excel').addEventListener('click', async () => {
    const btn = $('download-excel'), scope = document.querySelector('input[name="export-scope"]:checked').value;
    const rows = scope === 'all' ? SORTED : current.slice();
    if (!rows.length) { $('export-error').textContent = 'لا توجد مدارس في النتائج الحالية.'; return; }
    btn.disabled = true; btn.textContent = 'جارٍ تجهيز الملف…'; $('export-error').textContent = '';
    try {
      await loadExcel();
      const wb = newBook();
      const ws = wb.addWorksheet('المدارس', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
      const cols = COLS.concat(admin ? ADMIN_COLS : [], editor ? DEPUTY_COLS : []);
      ws.columns = cols.map(([h, w]) => ({ header: h, width: w }));
      styleHead(ws.getRow(1));
      rows.forEach((s, i) => {
        const r = ws.addRow(cols.map(c => c[2](s, i) ?? ''));
        r.getCell(2).numFmt = '@'; r.getCell(1).alignment = { horizontal: 'center' };
        if (admin) for (let c = COLS.length + 1; c <= cols.length; c++) r.getCell(c).numFmt = '@';
      });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      addStatsSheet(wb, rows, scope);
      await saveWorkbook(wb, scope === 'all' ? 'دليل-مدارس-مكة-المكرمة-1448.xlsx' : 'مدارس-مكة-المكرمة-نتائج-البحث.xlsx');
      $('export-dialog').close(); toast(`نُزّل ملف Excel: ${schoolsN(rows.length)}`);
    } catch (e) { $('export-error').textContent = e.message || 'تعذّر إنشاء الملف.'; }
    finally { btn.disabled = false; btn.textContent = 'تنزيل ملف Excel'; }
  });
  $('report-excel').addEventListener('click', async () => {
    const btn = $('report-excel'), scope = $('report-scope').value;
    btn.disabled = true;
    try {
      await loadExcel(); const wb = newBook();
      addStatsSheet(wb, scope === 'all' ? DATA : current, scope);
      await saveWorkbook(wb, 'تقرير-أعداد-مدارس-مكة-المكرمة.xlsx'); toast('نُزّل التقرير');
    } catch (e) { toast(e.message || 'تعذّر إنشاء الملف'); }
    finally { btn.disabled = false; }
  });

  /* ---------- all data of one school, every column of the Excel sheet ---------- */
  let detailsId = null, pendingDetails = null;
  const PHONE_RE = /جوال|الهاتف|رقم الوكيل/;
  function deputyOf(s) { return (editor && editorData.deputies && editorData.deputies[depKey(s.code)]) || {}; }
  const depKey = c => String(c || '').trim().toUpperCase().replace(/[.#$\[\]\/]/g, '_');
  function detailRows(s) {
    const pub = META.cols || [], sec = META.secretCols || [], order = META.order || pub;
    const out = [];
    for (const h of order) {
      const pi = pub.indexOf(h);
      if (pi >= 0) { out.push({ h, v: (s.raw || [])[pi] || '' }); continue; }
      const si = sec.indexOf(h);
      if (si >= 0) out.push(admin ? { h, v: (s.rawSecret || [])[si] || '', sec: true } : { h, locked: true });
    }
    if (editor) { const dp = deputyOf(s); out.push({ h: 'اسم الوكيل/ة', v: dp.name || '', dep: true }, { h: 'رقم الوكيل/ة', v: dp.phone || '', dep: true }, { h: 'هوية الوكيل/ة', v: dp.identity || '', dep: true }); }
    return out;
  }
  function valueHtml(h, v) {
    if (!v) return '<span class="none">فارغ في الملف</span>';
    if (PHONE_RE.test(h)) { const l = localPhone(v); return `<a class="ltr" href="tel:${l}">${esc(l)}</a>`; }
    if (/البريد/.test(h)) return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    if (/هوية|الرقم الوزاري/.test(h)) return `<span class="ltr">${esc(v)}</span>`;
    return esc(v);
  }
  function openDetails(id) {
    const s = byId.get(id); if (!s) return;
    detailsId = id;
    $('details-title').textContent = s.name;
    const rows = detailRows(s);
    const locked = rows.some(r => r.locked);
    let html = rows.map(r => r.locked
      ? `<tr class="locked"><th>${esc(r.h)}</th><td>${ICON_LOCK.replace('<svg', '<svg width="14" height="14"')} تظهر بعد دخول الإدارة</td></tr>`
      : `<tr class="${r.sec ? 'sec' : r.dep ? 'dep' : ''}"><th>${esc(r.h)}</th><td>${valueHtml(r.h, r.v)}</td></tr>`).join('');
    html += `<tr class="group"><td colspan="2">إضافات الدليل (ليست في ملف Excel)</td></tr>`
      + `<tr class="extra"><th>القطاع / المحافظة</th><td>${esc(areaLabel(s))}</td></tr>`
      + (s.group ? `<tr class="extra"><th>مدارس المدير نفسه</th><td>${schoolsN(groupSize.get(s.group))}</td></tr>` : '');
    $('details-table').innerHTML = html;
    $('details-login').hidden = !locked || !canCrypto();
    $('details-edit').hidden = $('details-del').hidden = !editor;
    if (!$('details-dialog').open) $('details-dialog').showModal();
  }
  /* printable card: header, all data, director and signature */
  const bannerSrc = () => (document.querySelector('.ministry img') || {}).getAttribute?.('src') || 'ministry-header.png';
  function nowDates() {
    const now = new Date();
    const g = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'long' }).format(now);
    let h = ''; try { h = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'long' }).format(now); } catch (e) { /* ignore */ }
    return h ? `${h} الموافق ${g}` : g;
  }
  const hijriSpace = t => String(t).replace(/(\d)\s*هـ/g, '$1 هـ');
  function printValue(h, v) {
    if (!v) return '<span class="none">—</span>';
    if (PHONE_RE.test(h)) return `<span class="ltr">${esc(localPhone(v))}</span>`;
    if (/هوية|البريد|الرقم الوزاري/.test(h)) return `<span class="ltr">${esc(v)}</span>`;
    return esc(v);
  }
  function schoolCardHtml(s) {
    const rows = detailRows(s).filter(r => !r.locked && r.h !== 'اسم المدرسة' && r.h !== 'الرقم الوزاري');
    const deps = rows.filter(r => r.dep);
    const isMgr = r => !r.dep && (r.sec || /مدير/.test(r.h));
    const school = rows.filter(r => !isMgr(r) && !r.dep).concat([{ h: 'القطاع / المحافظة', v: areaLabel(s) }]);
    const mgr = rows.filter(isMgr);
    const cell = r => `<th>${esc(r.h)}</th><td>${printValue(r.h, r.v)}</td>`;
    const pairs = list => { let out = ''; for (let i = 0; i < list.length; i += 2) out += `<tr>${cell(list[i])}${list[i + 1] ? cell(list[i + 1]) : '<th></th><td></td>'}</tr>`; return out; };
    const wideRow = r => `<tr><th>${esc(r.h)}</th><td colspan="3">${printValue(r.h, r.v)}</td></tr>`;
    const by = h => mgr.find(r => r.h === h);
    let mgrRows = '';
    const name = mgr.find(r => /اسم مدير/.test(r.h)); if (name) mgrRows += wideRow(name);
    mgrRows += pairs(['هوية مدير المدرسة', 'جوال مدير المدرسة'].map(by).filter(Boolean));
    const mail = mgr.find(r => /البريد/.test(r.h)); if (mail) mgrRows += wideRow(mail);
    const rest = mgr.filter(r => r !== name && r !== mail && !['هوية مدير المدرسة', 'جوال مدير المدرسة'].includes(r.h));
    mgrRows += pairs(rest);
    const f = s.gender === 'بنات';
    return `<div class="sp">
<div class="sp-banner"><img src="${bannerSrc()}" alt="وزارة التعليم - الإدارة العامة للتعليم بمنطقة مكة المكرمة - إدارة الإدارة المدرسية"></div>
<div class="sp-head"><div><h1>بطاقة بيانات مدرسة</h1><p>الإدارة العامة للتعليم بمنطقة مكة المكرمة · إدارة الإدارة المدرسية</p></div>
<div class="sp-dates">تاريخ البيانات: <b>${esc(hijriSpace(META.date || '—'))}</b><br>تاريخ الطباعة: <b>${esc(nowDates())}</b></div></div>
<div class="sp-school${f ? ' f' : ''}"><div class="sp-name">${esc(s.name)}</div>
<div class="sp-tags"><span>الرقم الوزاري: <b class="ltr">${esc(s.code)}</b></span><span>${esc(s.gender)}</span><span>${esc(s.stage)}</span><span>${esc(s.type)}</span></div></div>
<table class="sp-table"><tbody>
<tr class="sec-title"><td colspan="4">بيانات المدرسة</td></tr>${pairs(school)}
<tr class="sec-title"><td colspan="4">بيانات ${f ? 'مديرة' : 'مدير'} المدرسة</td></tr>${mgrRows}
${deps.length && deps.some(r => r.v) ? `<tr class="sec-title"><td colspan="4">بيانات ${f ? 'الوكيلة' : 'الوكيل'}</td></tr>${wideRow(deps[0])}${pairs(deps.slice(1))}` : ''}
</tbody></table>
<div class="sp-sign"><div class="sp-sign-box"><span>مدير إدارة الإدارة المدرسية</span><b>د. سعيد الحربي</b><div class="sp-line">التوقيع: ..................................................</div></div></div>
</div>`;
  }
  $('details-print').addEventListener('click', () => {
    const s = byId.get(detailsId); if (!s) return;
    $('print-area').innerHTML = schoolCardHtml(s);
    const img = $('print-area').querySelector('img');
    const go = () => window.print();
    if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
  });
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[data-src="${src}"]`)) return res();
      const el = document.createElement('script'); el.src = src; el.dataset.src = src;
      el.onload = () => res(); el.onerror = () => rej(new Error('تعذّر تحميل أداة PDF. تحقق من الاتصال ثم أعد المحاولة.'));
      document.head.appendChild(el);
    });
  }
  $('details-pdf').addEventListener('click', async () => {
    const s = byId.get(detailsId); if (!s) return;
    const btn = $('details-pdf'), label = btn.innerHTML; btn.disabled = true; btn.textContent = 'جارٍ تجهيز الملف…';
    let stage = null;
    try {
      await Promise.all([loadScript('vendor/html2canvas.min.js'), loadScript('vendor/jspdf.umd.min.js')]);
      stage = document.createElement('div'); stage.id = 'pdf-stage'; stage.innerHTML = schoolCardHtml(s); document.body.appendChild(stage);
      await Promise.all([...stage.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const canvas = await html2canvas(stage, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = 210, ph = 297, margin = 0;
      let w = pw - margin * 2, h = canvas.height * w / canvas.width;
      if (h > ph) { h = ph; w = canvas.width * h / canvas.height; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - w) / 2, margin, w, h);
      pdf.setProperties({ title: s.name });
      pdf.save(`بطاقة-مدرسة-${s.code}.pdf`);
      toast('حُفظ ملف PDF');
    } catch (e) { toast(e.message || 'تعذّر إنشاء ملف PDF'); }
    finally { if (stage) stage.remove(); btn.disabled = false; btn.innerHTML = label; }
  });

  $('details-copy').addEventListener('click', () => {
    const s = byId.get(detailsId); if (!s) return;
    const text = [s.name, ...detailRows(s).filter(r => !r.locked).map(r => `${r.h}: ${PHONE_RE.test(r.h) ? localPhone(r.v) : (r.v || '—')}`), `القطاع / المحافظة: ${areaLabel(s)}`].join('\n');
    copyText(text).then(() => toast('نُسخت بيانات المدرسة'));
  });
  $('details-login').addEventListener('click', () => {
    pendingDetails = detailsId; $('details-dialog').close();
    $('login-error').textContent = ''; $('pw').value = ''; $('login-dialog').showModal(); $('pw').focus();
  });

  /* ---------- admin login (personal data is AES-GCM encrypted in secure.js) ---------- */
  const KEY_NAME = 'makkah-schools-admin-key';
  const b64d = v => Uint8Array.from(atob(v), c => c.charCodeAt(0));
  const b64e = buf => { let x = ''; for (const b of new Uint8Array(buf)) x += String.fromCharCode(b); return btoa(x); };
  const canCrypto = () => !!(SECURE && window.crypto && crypto.subtle);
  async function deriveKey(pw) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(SECURE.salt), iterations: SECURE.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function decryptWith(key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(SECURE.iv) }, key, b64d(SECURE.ct));
    const obj = JSON.parse(new TextDecoder().decode(pt));
    if (obj.build !== SECURE.build) throw new Error('build');
    return obj.rows;
  }
  function applySecret(rows) {
    for (const [id, v] of Object.entries(rows)) { const s = byId.get(+id); if (s) Object.assign(s, v); }
    admin = true; index = null; adminUI(); updateModeText(); update(true);
  }
  function clearKey() { try { localStorage.removeItem(KEY_NAME); sessionStorage.removeItem(KEY_NAME); } catch (e) { /* ignore */ } }
  async function storeKey(key, remember) {
    try {
      clearKey();
      const val = JSON.stringify({ build: SECURE.build, k: b64e(await crypto.subtle.exportKey('raw', key)) });
      (remember ? localStorage : sessionStorage).setItem(KEY_NAME, val);
    } catch (e) { /* storage unavailable: stays unlocked for this visit only */ }
  }
  async function autoUnlock() {
    let val = null;
    try { val = localStorage.getItem(KEY_NAME) || sessionStorage.getItem(KEY_NAME); } catch (e) { return; }
    if (!val) return;
    try {
      const o = JSON.parse(val);
      const key = await crypto.subtle.importKey('raw', b64d(o.k), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      applySecret(await decryptWith(key)); adminKey = key;
    } catch (e) { clearKey(); }
  }
  function adminUI() {
    const b = $('admin-btn');
    b.hidden = !canCrypto();
    b.classList.toggle('on', admin);
    $('admin-label').textContent = admin ? 'الإدارة · خروج' : 'دخول الإدارة';
    $('add-school').hidden = !editor;
    $('owner-label').textContent = editor ? 'المسؤول · خروج' : 'المسؤول';
    $('owner-btn').classList.toggle('on', editor);
    b.setAttribute('aria-label', admin ? 'الخروج من وضع الإدارة' : 'دخول الإدارة لعرض بيانات المديرين');
    $('export-note').textContent = admin
      ? 'يحتوي الملف على ورقة المدارس بكل بياناتها، ومنها هوية المدير وجواله وبريده، وورقة للإحصاءات. احفظه في مكان آمن.'
      : 'يحتوي الملف على ورقة المدارس بكل بياناتها، وورقة للإحصاءات. لا يتضمن أرقام الهويات ولا الجوالات ولا البريد إلا بعد دخول الإدارة.';
  }
  $('login-dialog').addEventListener('close', () => {
    if (linkResolve) { const r = linkResolve; linkResolve = null; r(null); }
    $('login-title').textContent = 'دخول الإدارة';
    $('login-note').textContent = 'بعد الدخول تظهر لكل مدرسة هوية المدير وجواله وبريده، ويمكن البحث بها وتصديرها إلى Excel.';
  });
  $('admin-btn').addEventListener('click', () => {
    if (admin) { clearKey(); dropSession(); location.reload(); return; }
    $('login-error').textContent = ''; $('pw').value = ''; $('login-dialog').showModal(); $('pw').focus();
  });
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('pw').value; if (!pw) return;
    const go = $('login-go'); go.disabled = true; go.textContent = 'جارٍ التحقق…'; $('login-error').textContent = '';
    try {
      const key = await deriveKey(pw);
      const rows = await decryptWith(key);
      await storeKey(key, $('remember').checked);
      adminKey = key;
      if (linkResolve) { const r = linkResolve; linkResolve = null; $('login-dialog').close(); applySecret(rows); r(key); return; }
      $('login-dialog').close(); applySecret(rows);
      toast('تم الدخول: تظهر الآن بيانات المديرين في كل بطاقة');
      if (pendingDetails !== null) { openDetails(pendingDetails); pendingDetails = null; }
    } catch (err) { $('login-error').textContent = 'كلمة المرور غير صحيحة.'; $('pw').select(); }
    finally { go.disabled = false; go.textContent = 'دخول'; }
  });

  /* ---------- editing: add / edit / delete schools, saved as a commit to the site's GitHub repository ---------- */
  const REPO = { owner: 'makkah-schools', repo: 'makkah-schools.github.io', branch: 'main' };
  const TOKEN_NAME = 'makkah-schools-gh-token';  // old per-device key: removed, the key now lives in the owner's Firebase data
  try { localStorage.removeItem(TOKEN_NAME); } catch (e) { /* ignore */ }
  const HISTORY_URL = `https://github.com/${REPO.owner}/${REPO.repo}/commits/${REPO.branch}/data.js`;
  const getToken = () => editorData.github_token || '';

  // same normalisation as tools/prepare.py, so edited rows look like imported ones
  const nAr = x => String(x || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^ء-ي0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function cleanText(x) {
    x = String(x || '').replace(/ـ/g, '').replace(/[A-Za-z]/g, '').replace(/[_.]+/g, ' ')
      .replace(/\s*[-–—]+\s*/g, ' - ').replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim().replace(/^[ \-\/،,]+|[ \-\/،,]+$/g, '');
    x = x.replace(/^مدينة\s+/, '').replace(/مك[ةه]\s*ال\s*مكرم[ةه]|مك[ةه]المكرم[ةه]|مك[ةه] المكرم[ةه]/g, 'مكة المكرمة')
      .replace(/^مك[ةه](?=$| )(?! المكرمة)/, 'مكة المكرمة').replace('االليث', 'الليث').replace('الفنفذة', 'القنفذة');
    return x === 'اظم' ? 'أضم' : x;
  }
  function stageOf(v) {
    const t = nAr(v);
    if (t.includes('ابتدائ')) return 'المرحلة الابتدائية';
    if (t.includes('متوسط')) return 'المرحلة المتوسطة';
    if (t.includes('ثانوي')) return 'المرحلة الثانوية';
    return cleanText(v);
  }
  function typeOf(v) {
    const t = nAr(v);
    if (t.includes('تحفيظ')) return 'تحفيظ القرآن الكريم';
    if (t.includes('تربيه خاص')) return 'تربية خاصة';
    if (t.includes('الكبار')) return 'تعليم الكبار';
    if (t.includes('جامع')) return 'معاهد الجامعة الإسلامية';
    if (t.includes('تعليم عام')) return 'تعليم عام';
    return cleanText(v);
  }
  function officeOf(v) {
    const t = nAr(v);
    if (t.includes('اعاق')) return 'ذوي الإعاقة';
    if (t.includes('موهوب')) return 'الموهوبين';
    return stageOf(v);
  }
  const phoneStore = v => { const d = digits(v); if (!d) return ''; const l = localPhone(d); return '966' + l.slice(1); };

  const FIELD_KIND = {
    'م': { type: 'number' }, 'الرقم الوزاري': { req: true, ltr: true }, 'اسم المدرسة': { req: true, wide: true },
    'المرحلة': { req: true, select: true }, 'جنس المدرسة': { req: true, select: true },
    'هوية مدير المدرسة': { ltr: true, sec: true, inputmode: 'numeric' }, 'جوال مدير المدرسة': { ltr: true, sec: true, inputmode: 'tel' },
    'البريد الإلكتروني لمدير المدرسة': { ltr: true, sec: true, type: 'email', wide: true }, 'اسم مدير المدرسة': { wide: true, sec: true },
    'اسم الوكيل/ة': { wide: true, dep: true }, 'رقم الوكيل/ة': { ltr: true, dep: true, inputmode: 'tel' }, 'هوية الوكيل/ة': { ltr: true, dep: true, inputmode: 'numeric' }
  };
  const isMgrCol = h => (META.secretCols || []).includes(h) || h === 'اسم مدير المدرسة';
  function distinctRaw(h) {
    const i = (META.cols || []).indexOf(h); if (i < 0) return [];
    return [...count(DATA, s => (s.raw || [])[i] || '')].filter(([v]) => v).sort((a, b) => b[1] - a[1]).map(([v]) => v);
  }
  function areaOptions(sel) {
    const opt = (v, l) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`;
    return `<optgroup label="مكة المكرمة">${SECTORS.map(x => opt('sector:' + x, x)).join('')}${opt('gov:مكة المكرمة', 'مكة المكرمة (قطاع غير محدد)')}</optgroup>`
      + `<optgroup label="المحافظات">${GOV_ORDER.slice(1).map(g => opt('gov:' + g, g)).join('')}</optgroup>`;
  }
  let editId = null, editOrig = {};
  function fieldHtml(h, value) {
    const k = FIELD_KIND[h] || {}, id = 'ef-' + (META.order || []).indexOf(h);
    const attrs = `id="${id}" name="${esc(h)}"${k.req ? ' required' : ''}${k.ltr ? ' dir="ltr"' : ''}${k.inputmode ? ` inputmode="${k.inputmode}"` : ''}`;
    let input;
    if (k.select) {
      const vals = distinctRaw(h); if (value && !vals.includes(value)) vals.unshift(value);
      input = `<select ${attrs}><option value="">اختر…</option>${vals.map(v => `<option${v === value ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    } else {
      const list = ['المدينة/القرية', 'المنطقة الإدارية', 'السلطة', 'مكتب التعليم', 'نوع التعليم'].includes(h) ? `dl-${id}` : '';
      input = `<input ${attrs} type="${k.type || 'text'}" value="${esc(value)}" autocomplete="off"${list ? ` list="${list}"` : ''}>`
        + (list ? `<datalist id="${list}">${distinctRaw(h).slice(0, 300).map(v => `<option value="${esc(v)}">`).join('')}</datalist>` : '');
    }
    return `<div class="ef${k.wide ? ' wide' : ''}"><label for="${id}">${esc(h)}${k.req ? ' <span class="req">*</span>' : ''}</label>${input}</div>`;
  }
  async function ensureToken() {
    if (getToken()) return true;
    return new Promise(res => { tokenResolve = res; openTokenDialog(); });
  }
  async function openEditor(id) {
    if (!editor || !adminKey) { toast('هذه العملية للمسؤول فقط'); return; }
    if (!(await ensureToken())) return;
    if (migrationP) await migrationP;
    editId = id;
    const s = id === null ? null : byId.get(id);
    const val = h => {
      if (!s) return h === 'المنطقة الإدارية' ? 'مكة المكرمة' : h === 'السلطة' ? 'حكومي' : '';
      const pi = (META.cols || []).indexOf(h); if (pi >= 0) return (s.raw || [])[pi] || '';
      const si = (META.secretCols || []).indexOf(h); return si >= 0 ? (s.rawSecret || [])[si] || '' : '';
    };
    const PREF = ['الرقم الوزاري', 'اسم المدرسة', 'المرحلة', 'جنس المدرسة', 'نوع التعليم', 'مكتب التعليم', 'المدينة/القرية', 'المنطقة الإدارية', 'السلطة',
      'اسم مدير المدرسة', 'هوية مدير المدرسة', 'جوال مدير المدرسة', 'البريد الإلكتروني لمدير المدرسة'];
    const all = (META.order || []).filter(h => h !== 'م');
    const order = PREF.filter(h => all.includes(h)).concat(all.filter(h => !PREF.includes(h)));
    const schoolF = order.filter(h => !isMgrCol(h)), mgrF = order.filter(isMgrCol);
    const area = s ? (s.sector ? 'sector:' + s.sector : 'gov:' + s.gov) : 'gov:غير محدد';
    editOrig = { __area: area }; for (const h of META.order || []) editOrig[h] = val(h);
    const dp = s ? deputyOf(s) : {};
    editOrig['اسم الوكيل/ة'] = dp.name || ''; editOrig['رقم الوكيل/ة'] = dp.phone ? localPhone(dp.phone) : ''; editOrig['هوية الوكيل/ة'] = dp.identity || '';
    $('edit-title').textContent = s ? `تعديل: ${s.name}` : 'إضافة مدرسة جديدة';
    const areaField = `<div class="ef"><label for="ef-area">القطاع / المحافظة <span class="req">*</span></label><select id="ef-area" name="__area">${areaOptions(area)}</select></div>`;
    const at = Math.max(schoolF.indexOf('مكتب التعليم'), 0) + 1;
    const schoolHtml = schoolF.map(h => fieldHtml(h, val(h)));
    schoolHtml.splice(at, 0, areaField);
    $('edit-fields').innerHTML = `<h4 class="ef-sec">بيانات المدرسة</h4><div class="ef-grid">${schoolHtml.join('')}</div>`
      + `<h4 class="ef-sec">بيانات المدير أو المديرة</h4><div class="ef-grid">${mgrF.map(h => fieldHtml(h, val(h))).join('')}</div>`
      + `<h4 class="ef-sec">بيانات الوكيل/ة <small>تظهر للمسؤول فقط</small></h4><div class="ef-grid">${['اسم الوكيل/ة', 'رقم الوكيل/ة', 'هوية الوكيل/ة'].map(h => fieldHtml(h, editOrig[h])).join('')}</div>`;
    $('edit-error').textContent = '';
    $('edit-save').textContent = s ? 'حفظ التعديل' : 'إضافة المدرسة';
    if ($('details-dialog').open) $('details-dialog').close();
    $('edit-dialog').showModal();
    const first = $('edit-fields').querySelector('input,select'); if (first) first.focus();
  }
  function readForm() {
    const vals = {}, errs = [];
    $('edit-fields').querySelectorAll('[name]').forEach(el => { vals[el.name] = el.value.trim(); });
    for (const [h, k] of Object.entries(FIELD_KIND)) if (k.req && (META.order || []).includes(h) && !vals[h]) errs.push(`«${h}» مطلوب`);
    for (const h of ['هوية مدير المدرسة', 'هوية الوكيل/ة']) { const v = vals[h]; if (v && !/^\d{10}$/.test(digits(v))) errs.push(`«${h}» يجب أن يكون 10 أرقام`); }
    for (const h of ['جوال مدير المدرسة', 'رقم الوكيل/ة']) { const v = vals[h]; if (v && !/^0?5\d{8}$/.test(localPhone(v))) errs.push(`«${h}» يجب أن يكون رقم جوال مثل 05xxxxxxxx`); }
    const em = vals['البريد الإلكتروني لمدير المدرسة'];
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) errs.push('البريد الإلكتروني غير صحيح');
    return { vals, errs };
  }
  function buildRow(vals, id, prevRaw, prevSecRaw) {
    const g = h => (vals[h] ?? '').trim();
    if (vals['هوية مدير المدرسة']) vals['هوية مدير المدرسة'] = digits(vals['هوية مدير المدرسة']);
    for (const h of ['جوال مدير المدرسة']) if (vals[h]) vals[h] = phoneStore(vals[h]);
    const raw = (META.cols || []).map((h, i) => h in vals ? g(h) : (prevRaw || [])[i] || '');
    const rawSecret = (META.secretCols || []).map((h, i) => h in vals ? g(h) : (prevSecRaw || [])[i] || '');
    const [k, v] = (vals.__area || 'gov:غير محدد').split(':');
    const row = {
      id, code: g('الرقم الوزاري'), name: g('اسم المدرسة').replace(/\s+/g, ' '), stage: stageOf(g('المرحلة')), gender: g('جنس المدرسة'),
      type: typeOf(g('نوع التعليم')), office: officeOf(g('مكتب التعليم')), town: cleanText(g('المدينة/القرية')),
      authority: cleanText(g('السلطة')), region: cleanText(g('المنطقة الإدارية')), manager: g('اسم مدير المدرسة').replace(/\s+/g, ' '),
      raw, gov: k === 'sector' ? 'مكة المكرمة' : v, sector: k === 'sector' ? v : ''
    };
    const sec = { identity: g('هوية مدير المدرسة'), phone: g('جوال مدير المدرسة'), email: g('البريد الإلكتروني لمدير المدرسة') };
    for (const x of Object.keys(sec)) if (!sec[x]) delete sec[x];
    sec.rawSecret = rawSecret;
    return { row, sec };
  }
  const sameCode = (a, b) => String(a).trim().toUpperCase() === String(b).trim().toUpperCase();

  // ---- GitHub: read the current files, apply the change, write one commit with all three files ----
  class GhError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  async function gh(path, opts = {}) {
    const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}${path}`, {
      method: opts.method || 'GET', body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + getToken(), Accept: opts.raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }
    });
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).message || ''; } catch (e) { /* ignore */ }
      if (r.status === 401) throw new GhError(401, 'مفتاح GitHub غير صالح أو انتهت مدته. أدخل مفتاحًا جديدًا.');
      if (r.status === 403 || r.status === 404) throw new GhError(r.status, 'مفتاح GitHub لا يملك صلاحية الكتابة على مستودع الموقع. تأكد من اختيار المستودع وصلاحية Contents: Read and write.');
      throw new GhError(r.status, m || ('خطأ من GitHub: ' + r.status));
    }
    return opts.raw ? r.text() : r.json();
  }
  const pick = (txt, name) => { const m = txt.match(new RegExp('^window\\.' + name + '=(.*);\\s*$', 'm')); if (!m) throw new Error('ملف البيانات بصيغة غير متوقعة'); return JSON.parse(m[1]); };
  async function sha8(text) { const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8); }
  const randHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
  function regroup(schools, rows) {
    const by = new Map();
    for (const s of schools.slice().sort((a, b) => a.id - b.id)) { const idn = (rows[s.id] || {}).identity; if (idn) { if (!by.has(idn)) by.set(idn, []); by.get(idn).push(s.id); } }
    const gid = new Map(); let n = 0;
    for (const ids of [...by.values()].sort((a, b) => a[0] - b[0])) if (ids.length > 1) { n++; for (const i of ids) gid.set(i, n); }
    for (const s of schools) { if (gid.has(s.id)) s.group = gid.get(s.id); else delete s.group; }
  }
  function todayHijri() {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).replace(/\s*هـ$/, '') + 'هـ'; }
    catch (e) { return META.date; }
  }
  async function commitChange(apply, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await gh(`/git/ref/heads/${REPO.branch}`), head = ref.object.sha;
      const commit = await gh(`/git/commits/${head}`);
      const q = `?ref=${head}`;
      const [dataTxt, secTxt, idxTxt] = await Promise.all(['data.js', 'secure.js', 'index.html'].map(f => gh(`/contents/${f}${q}`, { raw: true })));
      const meta = pick(dataTxt, 'SCHOOL_META'), schools = pick(dataTxt, 'SCHOOLS'), sec = pick(secTxt, 'SCHOOL_SECURE');
      if (sec.salt !== SECURE.salt) throw new Error('تغيّرت كلمة مرور الإدارة على الموقع. حدّث الصفحة وادخل من جديد.');
      let plain;
      try { plain = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(sec.iv) }, adminKey, b64d(sec.ct)))); }
      catch (e) { throw new Error('تعذّر فك البيانات المشفّرة على الموقع. حدّث الصفحة وادخل من جديد.'); }
      const rows = plain.rows;
      apply(schools, rows, meta);
      regroup(schools, rows);
      Object.assign(meta, { build: randHex(6), count: schools.length, date: todayHijri(), updated: new Date().toISOString() });
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, adminKey, new TextEncoder().encode(JSON.stringify({ build: meta.build, rows })));
      const newSec = { v: 1, build: meta.build, iter: sec.iter, salt: sec.salt, iv: b64e(iv), ct: b64e(ct) };
      const dataOut = 'window.SCHOOL_META=' + JSON.stringify(meta) + ';\nwindow.SCHOOLS=' + JSON.stringify(schools) + ';\n';
      const secOut = 'window.SCHOOL_SECURE=' + JSON.stringify(newSec) + ';\n';
      const idxOut = idxTxt.replace(/data\.js\?v=[0-9a-f]+/, 'data.js?v=' + await sha8(dataOut)).replace(/secure\.js\?v=[0-9a-f]+/, 'secure.js?v=' + await sha8(secOut));
      const files = [['data.js', dataOut], ['secure.js', secOut], ['index.html', idxOut]];
      const blobs = [];
      for (const [, content] of files) blobs.push(await gh('/git/blobs', { method: 'POST', body: { content, encoding: 'utf-8' } }));
      const tree = await gh('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: files.map(([path], i) => ({ path, mode: '100644', type: 'blob', sha: blobs[i].sha })) } });
      const nc = await gh('/git/commits', { method: 'POST', body: { message, tree: tree.sha, parents: [head] } });
      try { await gh(`/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: { sha: nc.sha, force: false } }); }
      catch (e) { if (e.status === 422 && attempt < 2) continue; throw e; } // someone saved meanwhile: redo on top of it
      return { meta, schools, rows, newSec };
    }
    throw new Error('تعذّر الحفظ بسبب تعديلات متزامنة. أعد المحاولة.');
  }
  // load the saved result into the page without reloading
  function reloadData({ meta, schools, rows, newSec }) {
    Object.assign(META, meta); SECURE = newSec; window.SCHOOL_SECURE = newSec;
    DATA.length = 0;
    for (const s of schools) { DATA.push(Object.assign(s, rows[s.id] || {})); }
    byId.clear(); sortKey.clear(); groupSize.clear();
    for (const s of DATA) {
      byId.set(s.id, s);
      sortKey.set(s.id, [ord(GOV_ORDER, s.gov), s.sector ? ord(SECTORS, s.sector) : 9, ord(STAGES, s.stage)]);
      if (s.group) groupSize.set(s.group, (groupSize.get(s.group) || 0) + 1);
    }
    SORTED.splice(0, SORTED.length, ...DATA.slice().sort(defaultSort));
    const keep = { area: $('area').value, stage: $('stage').value, gender: $('gender').value, type: $('type').value };
    $('area').innerHTML = '<option value="">جميع القطاعات والمحافظات</option>';
    $('stage').innerHTML = '<option value="">جميع المراحل</option>';
    $('gender').innerHTML = '<option value="">بنين وبنات</option>';
    $('type').innerHTML = '<option value="">جميع الأنواع</option>';
    buildFilters();
    for (const k of Object.keys(keep)) { $(k).value = keep[k]; if ($(k).value !== keep[k]) state[k] = ''; }
    if (state.group && !groupSize.has(state.group)) state.group = 0;
    $('data-date').textContent = META.date || '—';
    index = null; update(true);
  }
  async function saving(btn, errEl, work) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; errEl.textContent = '';
    try { await work(); return true; }
    catch (e) {
      errEl.textContent = e.message || 'تعذّر الحفظ';
      return false;
    } finally { btn.disabled = false; btn.textContent = label; }
  }
  // generic confirmation window: موافق runs the action and keeps the window open until it finishes
  let confirmRun = null;
  function confirmBox({ title, html, note = '', danger = false, onOk }) {
    $('confirm-title').textContent = title; $('confirm-text').innerHTML = html;
    $('confirm-note').innerHTML = note; $('confirm-note').hidden = !note;
    $('confirm-error').textContent = '';
    const go = $('confirm-go'); go.textContent = 'موافق'; go.classList.toggle('danger', danger); go.classList.toggle('primary', !danger);
    confirmRun = onOk; $('confirm-dialog').showModal(); go.focus();
  }
  $('confirm-go').addEventListener('click', async () => {
    if (!confirmRun) return;
    const ok = await saving($('confirm-go'), $('confirm-error'), confirmRun);
    if (ok) { confirmRun = null; $('confirm-dialog').close(); } else if (!getToken()) openTokenDialog();
  });
  const areaText = v => { const [k, x] = String(v || '').split(':'); return k === 'sector' ? x + ' بمكة' : x === 'مكة المكرمة' ? 'مكة المكرمة (قطاع غير محدد)' : (x || '—'); };
  function changesOf(vals) {
    const out = [];
    for (const [h, v] of Object.entries(vals)) {
      if (h === '__area') { if (v !== editOrig.__area) out.push(['القطاع / المحافظة', areaText(editOrig.__area), areaText(v)]); continue; }
      const old = String(editOrig[h] ?? '').trim();
      const same = PHONE_RE.test(h) ? localPhone(old) === localPhone(v) : /هوية/.test(h) ? digits(old) === digits(v) : old === v;
      if (!same) out.push([h, PHONE_RE.test(h) ? localPhone(old) : old, PHONE_RE.test(h) ? localPhone(v) : v]);
    }
    return out;
  }
  $('edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const { vals, errs } = readForm();
    if (errs.length) { $('edit-error').textContent = errs.join('، '); return; }
    const isNew = editId === null, oldName = isNew ? '' : (byId.get(editId) || {}).name;
    const doSave = async () => {
      if (!(await ensureToken())) throw new Error('يلزم مفتاح الحفظ لإتمام العملية.');
      let savedId = editId;
      const res = await commitChange((schools, rows) => {
        if (schools.some(x => sameCode(x.code, vals['الرقم الوزاري']) && x.id !== editId)) throw new Error(`الرقم الوزاري ${vals['الرقم الوزاري']} مسجّل لمدرسة أخرى.`);
        if (isNew) {
          savedId = schools.reduce((m, x) => Math.max(m, x.id), -1) + 1;
          const mi = (META.cols || []).indexOf('م');
          if (mi >= 0) vals['م'] = String(schools.reduce((m, x) => Math.max(m, parseInt((x.raw || [])[mi], 10) || 0), 0) + 1);
          const { row, sec } = buildRow(vals, savedId);
          schools.push(row); rows[savedId] = sec;
        } else {
          const i = schools.findIndex(x => x.id === editId);
          if (i < 0) throw new Error('هذه المدرسة حُذفت من الموقع. حدّث الصفحة.');
          const { row, sec } = buildRow(vals, editId, schools[i].raw, (rows[editId] || {}).rawSecret);
          schools[i] = row; rows[editId] = sec;
        }
      }, isNew ? `إضافة مدرسة: ${vals['اسم المدرسة']} (${vals['الرقم الوزاري']})` : `تعديل مدرسة: ${oldName} (${vals['الرقم الوزاري']})`);
      const oldCode = isNew ? '' : (byId.get(editId) || {}).code;
      await saveDeputy(oldCode, vals['الرقم الوزاري'], { name: vals['اسم الوكيل/ة'], phone: vals['رقم الوكيل/ة'] ? phoneStore(vals['رقم الوكيل/ة']) : '', identity: digits(vals['هوية الوكيل/ة']) });
      reloadData(res);
      $('edit-dialog').close();
      toast(isNew ? 'أُضيفت المدرسة، وتظهر للجميع خلال دقائق' : 'حُفظ التعديل، ويظهر للجميع خلال دقائق');
      if (isNew) { state.q = vals['الرقم الوزاري']; state.mode = 'code'; syncControls(); update(); }
    };
    if (isNew) {
      const ok = await saving($('edit-save'), $('edit-error'), doSave);
      if (!ok && !getToken()) openTokenDialog();
      return;
    }
    const diff = changesOf(vals);
    if (!diff.length) { $('edit-error').textContent = 'لم تغيّر أي بيانات.'; return; }
    $('edit-error').textContent = '';
    confirmBox({
      title: 'تأكيد التعديل',
      html: `<p>هل تريد حفظ ${diff.length === 1 ? 'هذا التعديل' : 'هذه التعديلات'} على <b>${esc(oldName)}</b>؟</p><table class="diff"><thead><tr><th>البيان</th><th>قبل</th><th>بعد</th></tr></thead><tbody>${
        diff.map(([h, a, b]) => `<tr><td>${esc(h)}</td><td class="old">${a ? esc(a) : '—'}</td><td class="new">${b ? esc(b) : '—'}</td></tr>`).join('')}</tbody></table>`,
      note: 'يظهر التعديل لجميع المستخدمين خلال دقائق، ويبقى في سجل التعديلات.',
      onOk: doSave
    });
  });

  async function askDelete(id) {
    if (!editor || !adminKey) { toast('هذه العملية للمسؤول فقط'); return; }
    const s = byId.get(id); if (!s) return;
    if ($('details-dialog').open) $('details-dialog').close();
    confirmBox({
      title: 'تأكيد الحذف', danger: true,
      html: `<p>هل تريد حذف <b>${esc(s.name)}</b> (الرقم الوزاري <span dir="ltr">${esc(s.code)}</span>) من الدليل؟</p>`,
      note: `تُحذف المدرسة لجميع المستخدمين، ويمكن استرجاعها لاحقًا من <a href="${HISTORY_URL}" target="_blank" rel="noopener">سجل التعديلات</a>.`,
      onOk: async () => {
        if (!(await ensureToken())) throw new Error('يلزم مفتاح الحفظ لإتمام العملية.');
        const res = await commitChange((schools, rows) => {
          const i = schools.findIndex(x => x.id === id);
          if (i < 0) throw new Error('هذه المدرسة حُذفت من قبل. حدّث الصفحة.');
          schools.splice(i, 1); delete rows[id];
        }, `حذف مدرسة: ${s.name} (${s.code})`);
        await saveDeputy(s.code, '', {});
        reloadData(res);
        toast('حُذفت المدرسة، ويمكن استرجاعها من سجل التعديلات');
      }
    });
  }
  $('add-school').addEventListener('click', () => openEditor(null));
  $('details-edit').addEventListener('click', () => openEditor(detailsId));
  $('details-del').addEventListener('click', () => askDelete(detailsId));

  // ---- GitHub key: kept in the owner's Firebase data, so it works on every device after the owner signs in ----
  let tokenResolve = null;
  function openTokenDialog() {
    if (!editor) { toast('هذه العملية للمسؤول فقط'); return; }
    $('gh-token').value = ''; $('token-error').textContent = '';
    $('token-state').textContent = getToken() ? 'يوجد مفتاح محفوظ في حساب المسؤول. أدخل مفتاحًا جديدًا لاستبداله.' : 'لا يوجد مفتاح محفوظ في حساب المسؤول بعد.';
    $('token-clear').hidden = !getToken();
    $('token-dialog').showModal();
  }
  $('token-dialog').addEventListener('close', () => { if (tokenResolve) { const r = tokenResolve; tokenResolve = null; r(!!getToken()); } });
  $('token-form').addEventListener('submit', async e => {
    e.preventDefault();
    const t = $('gh-token').value.trim(); if (!t) return;
    const old = getToken(); editorData.github_token = t;
    const btn = $('token-save'); btn.disabled = true; btn.textContent = 'جارٍ التحقق…'; $('token-error').textContent = '';
    try {
      const repo = await gh('');
      if (repo.permissions && repo.permissions.push === false) throw new Error('المفتاح يقرأ المستودع لكنه لا يملك صلاحية الكتابة.');
      await gh(`/git/ref/heads/${REPO.branch}`);
      await rtdb('/github_token', 'PUT', t);
      btn.textContent = 'جارٍ تجهيز البيانات…';
      await migrateDeputies();
      $('token-dialog').close(); toast('حُفظ مفتاح GitHub في حساب المسؤول');
    } catch (err) { editorData.github_token = old; $('token-error').textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'حفظ المفتاح'; }
  });
  $('token-clear').addEventListener('click', async () => {
    try { await rtdb('/github_token', 'DELETE'); editorData.github_token = ''; $('token-dialog').close(); toast('حُذف مفتاح GitHub من حساب المسؤول'); }
    catch (e) { $('token-error').textContent = e.message; }
  });
  $('open-token').addEventListener('click', () => { $('edit-dialog').close(); openTokenDialog(); });

  /* ---------- database owner: Firebase sign-in (wra003@hotmail.com only) ---------- */
  const FB = {
    key: 'AIzaSyC6wEGujd2sMdmvxw20F73FcoVywFaDtB0',
    db: 'https://makkah-schools-default-rtdb.europe-west1.firebasedatabase.app',
    email: 'wra003@hotmail.com'
  };
  const SESSION_NAME = 'makkah-schools-owner';
  let session = null;  // { idToken, refreshToken, exp }
  const FB_ERRORS = {
    INVALID_LOGIN_CREDENTIALS: 'كلمة المرور غير صحيحة، أو لم يُنشأ حساب المسؤول بعد.',
    INVALID_PASSWORD: 'كلمة المرور غير صحيحة.', EMAIL_NOT_FOUND: 'لم يُنشأ حساب المسؤول بعد.',
    USER_DISABLED: 'حساب المسؤول موقوف.', TOO_MANY_ATTEMPTS_TRY_LATER: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
    PASSWORD_LOGIN_DISABLED: 'الدخول بكلمة المرور غير مفعّل في Firebase.'
  };
  async function fbPost(url, body, form) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body) : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const code = String((j.error && j.error.message) || r.status).split(' ')[0]; throw new Error(FB_ERRORS[code] || ('تعذّر الاتصال بخدمة الدخول: ' + code)); }
    return j;
  }
  function keepSession(s, remember) {
    session = s;
    try {
      localStorage.removeItem(SESSION_NAME); sessionStorage.removeItem(SESSION_NAME);
      (remember ? localStorage : sessionStorage).setItem(SESSION_NAME, JSON.stringify({ r: s.refreshToken }));
    } catch (e) { /* storage unavailable */ }
  }
  function dropSession() { session = null; try { localStorage.removeItem(SESSION_NAME); sessionStorage.removeItem(SESSION_NAME); } catch (e) { /* ignore */ } }
  async function idToken() {
    if (!session) throw new Error('انتهت جلسة المسؤول. ادخل من جديد.');
    if (Date.now() > session.exp - 60000) {
      const j = await fbPost(`https://securetoken.googleapis.com/v1/token?key=${FB.key}`, { grant_type: 'refresh_token', refresh_token: session.refreshToken }, true);
      session = { idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 };
    }
    return session.idToken;
  }
  async function rtdb(path, method = 'GET', body) {
    const r = await fetch(`${FB.db}/editor${path}.json?auth=${encodeURIComponent(await idToken())}`, { method, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'لا تملك صلاحية المسؤول على هذه البيانات.' : 'تعذّر الاتصال بقاعدة بيانات المسؤول.');
    return r.json();
  }
  async function saveDeputy(oldCode, newCode, dep) {
    const clean = {}; for (const k of ['name', 'phone', 'identity']) if (dep[k]) clean[k] = String(dep[k]).trim();
    const oldK = oldCode ? depKey(oldCode) : '', newK = newCode ? depKey(newCode) : '';
    if (oldK && oldK !== newK) { await rtdb(`/deputies/${encodeURIComponent(oldK)}`, 'DELETE'); delete editorData.deputies[oldK]; }
    if (!newK) return;
    if (Object.keys(clean).length) { await rtdb(`/deputies/${encodeURIComponent(newK)}`, 'PUT', clean); editorData.deputies[newK] = clean; }
    else if (editorData.deputies[newK]) { await rtdb(`/deputies/${encodeURIComponent(newK)}`, 'DELETE'); delete editorData.deputies[newK]; }
  }
  // the old «المكلفة / الهاتف» values (kept encrypted until now) move once to the owner's deputy data
  let migrationP = null;
  function migrateDeputies() {
    if (migrationP) return migrationP;
    if (!editor || !adminKey || !getToken()) return Promise.resolve();
    const pending = DATA.filter(s => s.pendingDeputy);
    if (!pending.length) return Promise.resolve();
    migrationP = (async () => {
      try {
        for (const s of pending) if (!editorData.deputies[depKey(s.code)]) await saveDeputy('', s.code, s.pendingDeputy);
        const res = await commitChange((schools, rows) => { for (const k of Object.keys(rows)) delete rows[k].pendingDeputy; }, 'نقل بيانات «المكلفة» إلى بيانات الوكيل/ة الخاصة بالمسؤول');
        reloadData(res); toast('نُقلت بيانات «المكلفة» إلى بيانات الوكيل/ة');
      } catch (e) { console.warn('deputy migration', e); }
    })().finally(() => { migrationP = null; });
    return migrationP;
  }
  async function linkViewKey() {
    // the owner links the viewing password once; its key is kept in the owner's Firebase data
    return new Promise(res => {
      linkResolve = res;
      $('login-title').textContent = 'ربط كلمة مرور الاطلاع';
      $('login-note').textContent = 'أدخل كلمة مرور الاطلاع مرة واحدة لتُربط بحساب المسؤول، فتظهر بيانات المديرين تلقائيًا بعد كل دخول.';
      $('login-error').textContent = ''; $('pw').value = ''; $('login-dialog').showModal(); $('pw').focus();
    });
  }
  let linkResolve = null;
  async function enterOwnerMode(data) {
    editorData = { deputies: {}, ...(data || {}) };
    if (!editorData.deputies) editorData.deputies = {};
    let key = null;
    if (editorData.aes_key) {
      try { key = await crypto.subtle.importKey('raw', b64d(editorData.aes_key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); applySecret(await decryptWith(key)); adminKey = key; }
      catch (e) { key = null; }
    }
    if (!key && adminKey && admin) {
      try { const raw = await crypto.subtle.exportKey('raw', adminKey); await rtdb('/aes_key', 'PUT', b64e(raw)); editorData.aes_key = b64e(raw); key = adminKey; } catch (e) { /* key not exportable: ask below */ }
    }
    if (!key) {
      const k = await linkViewKey();
      if (!k) { toast('دخلت كمسؤول، لكن تعديل البيانات يحتاج ربط كلمة مرور الاطلاع'); }
      else { await rtdb('/aes_key', 'PUT', b64e(await crypto.subtle.exportKey('raw', k))); editorData.aes_key = 'set'; }
    }
    editor = true; index = null; adminUI(); updateModeText(); update(true);
    migrateDeputies();
  }
  async function resumeOwner() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(SESSION_NAME) || sessionStorage.getItem(SESSION_NAME) || 'null'); } catch (e) { stored = null; }
    if (!stored || !stored.r) return;
    try {
      session = { idToken: '', refreshToken: stored.r, exp: 0 };
      await idToken();
      await enterOwnerMode(await rtdb(''));
    } catch (e) { dropSession(); }
  }
  function openOwnerDialog() {
    $('owner-error').textContent = ''; $('owner-msg').textContent = ''; $('owner-pw').value = '';
    $('owner-dialog').showModal(); $('owner-pw').focus();
  }
  $('owner-btn').addEventListener('click', () => {
    if (editor) { dropSession(); location.reload(); return; }
    openOwnerDialog();
  });
  $('owner-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('owner-pw').value; if (!pw) return;
    const go = $('owner-go'); go.disabled = true; go.textContent = 'جارٍ الدخول…'; $('owner-error').textContent = ''; $('owner-msg').textContent = '';
    try {
      const j = await fbPost(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB.key}`, { email: FB.email, password: pw, returnSecureToken: true });
      if (String(j.email || '').toLowerCase() !== FB.email) throw new Error('هذا الحساب لا يملك صلاحية المسؤول.');
      keepSession({ idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 }, $('owner-remember').checked);
      const data = await rtdb('');
      $('owner-dialog').close();
      await enterOwnerMode(data);
      toast('تم دخول المسؤول: تظهر أزرار الإضافة والتعديل والحذف وبيانات الوكلاء');
    } catch (err) { dropSession(); $('owner-error').textContent = err.message; $('owner-pw').select(); }
    finally { go.disabled = false; go.textContent = 'دخول'; }
  });
  $('owner-forgot').addEventListener('click', async () => {
    const b = $('owner-forgot'); b.disabled = true; $('owner-error').textContent = ''; $('owner-msg').textContent = 'جارٍ الإرسال…';
    try {
      await fbPost(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FB.key}`, { requestType: 'PASSWORD_RESET', email: FB.email });
      $('owner-msg').textContent = `أُرسل رابط تعيين كلمة مرور جديدة إلى ${FB.email}. افتح البريد (وراجع الرسائل غير المرغوب فيها) واتبع الرابط.`;
    } catch (err) { $('owner-msg').textContent = ''; $('owner-error').textContent = err.message; }
    finally { b.disabled = false; }
  });
  document.querySelectorAll('.history-link').forEach(a => { a.href = HISTORY_URL; });

  /* ---------- charts page: dashboard + custom chart, PDF/PNG download ---------- */
  const CH = {
    boys: '#2a78c2', girls: '#2f9e6e', single: '#173f67', other: '#9aa5b1', grid: '#edf0f2', ink: '#0a2744', muted: '#5b6e80',
    stage: { 'المرحلة الابتدائية': '#6250d6', 'المرحلة المتوسطة': '#eb6834', 'المرحلة الثانوية': '#a8336f' },
    cat: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6']
  };
  const DIMS = {
    area: { label: 'القطاع والمحافظة', order: AREA_ROWS, key: s => areaRow(s) },
    gov: { label: 'المحافظة', order: GOV_ORDER, key: s => s.gov },
    stage: { label: 'المرحلة', order: STAGES, key: s => s.stage, ordinal: true, short: v => STAGE_SHORT[v] || v },
    gender: { label: 'الجنس', order: GENDERS, key: s => s.gender },
    type: { label: 'نوع التعليم', order: TYPE_ORDER, key: s => s.type },
    office: { label: 'مكتب التعليم', order: null, key: s => s.office },
    mgr: { label: 'المديرون حسب عدد المدارس', order: ['مدرسة واحدة', 'مدرستان', '3 مدارس', '4 مدارس فأكثر'], ordinal: true, managers: true }
  };
  const SHAPES = { bar: 'أعمدة', hbar: 'أعمدة أفقية', donut: 'دائرة', line: 'خطوط', pct: 'نسب مئوية' };
  const chState = { view: 'dash', scope: 'all', dim: 'area', split: 'gender', shape: 'hbar' };
  let charts = [];

  const chRows = () => chState.scope === 'all' ? DATA : current;
  function managerCounts(rows) {
    const m = new Map();
    for (const s of rows) { const k = s.group ? 'g' + s.group : 'i' + s.id; m.set(k, (m.get(k) || 0) + 1); }
    const d = [0, 0, 0, 0]; for (const v of m.values()) d[Math.min(v, 4) - 1]++;
    return d;
  }
  // builds {labels, series[], unit} for a dimension, optionally split by gender or stage
  function dataset(rows, dim, split) {
    const D = DIMS[dim];
    if (D.managers) return { labels: D.order, series: [{ label: 'عدد المديرين والمديرات', color: CH.single, data: managerCounts(rows) }], unit: 'مدير' };
    let cats = D.order ? D.order.filter(c => rows.some(s => D.key(s) === c)) : [...count(rows, D.key)].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const lbl = c => D.short ? D.short(c) : c;
    if (!split || split === dim) {
      return { labels: cats.map(lbl), series: [{ label: 'عدد المدارس', color: CH.single, data: cats.map(c => rows.filter(s => D.key(s) === c).length) }], unit: 'مدرسة' };
    }
    const S = DIMS[split];
    const groups = S.order.filter(g => rows.some(s => S.key(s) === g));
    const color = g => split === 'gender' ? (g === 'بنين' ? CH.boys : CH.girls) : CH.stage[g];
    return {
      labels: cats.map(lbl),
      series: groups.map(g => ({ label: S.short ? S.short(g) : g, color: color(g), data: cats.map(c => rows.filter(s => D.key(s) === c && S.key(s) === g).length) })),
      unit: 'مدرسة'
    };
  }

  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart, args, opts) {
      if (!opts || !opts.mode) return;
      const { ctx } = chart, horiz = chart.options.indexAxis === 'y', metas = chart.getSortedVisibleDatasetMetas();
      ctx.save(); ctx.font = '600 12px "Plex Arabic", Tahoma, sans-serif'; ctx.fillStyle = CH.ink;
      const put = (el, text) => {
        if (horiz) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(text, el.x - 6, el.y); }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(text, el.x, el.y - 5); }
      };
      if (opts.mode === 'each') {
        for (const m of metas) m.data.forEach((el, i) => { const v = chart.data.datasets[m.index].data[i]; if (v) put(el, fmt(v)); });
      } else if (opts.mode === 'total') {
        chart.data.labels.forEach((_, i) => {
          let total = 0, el = null;
          for (const m of metas) { const v = chart.data.datasets[m.index].data[i] || 0; total += v; if (v) el = m.data[i]; }
          if (el && total) put(el, fmt(total));
        });
      }
      ctx.restore();
    }
  };
  const centerTotal = {
    id: 'centerTotal',
    afterDraw(chart, args, opts) {
      if (!opts || !opts.text) return;
      const m = chart.getDatasetMeta(0); if (!m.data.length) return;
      const { x, y } = m.data[0], { ctx } = chart;
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = CH.ink; ctx.font = '800 26px "Plex Arabic", Tahoma, sans-serif'; ctx.fillText(opts.text, x, y - 9);
      ctx.fillStyle = CH.muted; ctx.font = '500 13px "Plex Arabic", Tahoma, sans-serif'; ctx.fillText(opts.sub || '', x, y + 16);
      ctx.restore();
    }
  };

  function buildChart(canvas, d, shape, opt = {}) {
    const multi = d.series.length > 1;
    const base = {
      responsive: true, maintainAspectRatio: false, devicePixelRatio: 2, animation: { duration: 350 }, locale: 'en-US',
      layout: { padding: { top: 8, left: 8, right: 8, bottom: 4 } },
      plugins: {
        legend: { display: multi, rtl: true, position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 12, boxHeight: 12, padding: 14, color: CH.ink, font: { size: 13, weight: '600' } } },
        tooltip: { rtl: true, textDirection: 'rtl', titleAlign: 'right', bodyAlign: 'right', padding: 10, cornerRadius: 8, titleFont: { size: 13, weight: '700' }, bodyFont: { size: 13 } },
        valueLabels: {}, centerTotal: {}
      }
    };
    let type = 'bar', data, options = base;
    const catAxis = { reverse: true, grid: { display: false }, ticks: { color: CH.ink, font: { size: 12.5 }, autoSkip: false, maxRotation: 50 } };
    const valAxis = { beginAtZero: true, grid: { color: CH.grid }, border: { display: false }, ticks: { precision: 0, color: CH.muted } };
    if (shape === 'donut') {
      type = 'doughnut';
      const totals = d.labels.map((_, i) => d.series.reduce((a, s) => a + (s.data[i] || 0), 0));
      let items = d.labels.map((l, i) => ({ l, v: totals[i] })).filter(x => x.v);
      if (d.series.length === 1 && d.series[0].label === 'عدد المدارس' && opt.genderColors) items = items.map(x => ({ ...x, c: x.l === 'بنين' ? CH.boys : CH.girls }));
      if (items.length > 8) { const keep = items.slice().sort((a, b) => b.v - a.v).slice(0, 7); const restV = items.filter(x => !keep.includes(x)).reduce((a, x) => a + x.v, 0); items = items.filter(x => keep.includes(x)); items.push({ l: 'أخرى', v: restV, c: CH.other }); }
      const total = items.reduce((a, x) => a + x.v, 0);
      const stageCol = l => Object.entries(CH.stage).find(([k]) => (STAGE_SHORT[k] || k) === l)?.[1];
      data = { labels: items.map(x => x.l), datasets: [{ data: items.map(x => x.v), backgroundColor: items.map((x, i) => x.c || stageCol(x.l) || CH.cat[i % CH.cat.length]), borderColor: '#fff', borderWidth: 2, hoverOffset: 6 }] };
      options = { ...base, cutout: '58%', plugins: { ...base.plugins,
        legend: { ...base.plugins.legend, display: true, position: opt.compact ? 'bottom' : 'right', align: 'center',
          labels: { ...base.plugins.legend.labels, generateLabels: ch => ch.data.labels.map((l, i) => ({ text: `${l}  ${fmt(ch.data.datasets[0].data[i])} (${Math.round(ch.data.datasets[0].data[i] / total * 1000) / 10}%)`, fillStyle: ch.data.datasets[0].backgroundColor[i], strokeStyle: '#fff', lineWidth: 0, pointStyle: 'rectRounded', hidden: !ch.getDataVisibility(i), index: i, fontColor: CH.ink })) } },
        tooltip: { ...base.plugins.tooltip, callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)} (${Math.round(c.raw / total * 1000) / 10}%)` } },
        centerTotal: { text: fmt(total), sub: d.unit === 'مدير' ? 'مدير ومديرة' : 'مدرسة' } } };
    } else if (shape === 'line') {
      type = 'line';
      data = { labels: d.labels, datasets: d.series.map(s => ({ label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color, borderWidth: 2, pointRadius: 5, pointHoverRadius: 7, pointBorderColor: '#fff', pointBorderWidth: 2, tension: 0 })) };
      options = { ...base, layout: { padding: { top: 24, left: 12, right: 12, bottom: 4 } }, scales: { x: { ...catAxis, offset: true }, y: { ...valAxis, position: 'right' } },
        interaction: { mode: 'index', intersect: false },
        plugins: { ...base.plugins, valueLabels: { mode: multi ? '' : 'each' }, tooltip: { ...base.plugins.tooltip, callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } } };
    } else {
      const horiz = shape === 'hbar' || shape === 'pct';
      const pct = shape === 'pct', stacked = multi && (opt.stacked !== false || pct);
      const totals = d.labels.map((_, i) => d.series.reduce((a, s) => a + (s.data[i] || 0), 0));
      data = { labels: d.labels, datasets: d.series.map((s, si) => ({
        label: s.label, raw: s.data, data: pct ? s.data.map((v, i) => totals[i] ? Math.round(v / totals[i] * 1000) / 10 : 0) : s.data,
        backgroundColor: s.color, borderColor: '#fff', borderWidth: stacked ? 1.5 : 0, borderSkipped: false,
        borderRadius: stacked ? (si === d.series.length - 1 ? 4 : 0) : 4,
        maxBarThickness: horiz ? 26 : 46, categoryPercentage: 0.72, barPercentage: multi && !stacked ? 0.92 : 0.86 })) };
      const vAxis = { ...valAxis, stacked, ...(pct ? { max: 100, ticks: { ...valAxis.ticks, callback: v => v + '%' } } : {}) };
      const cAxis = { ...catAxis, stacked };
      options = { ...base, indexAxis: horiz ? 'y' : 'x',
        layout: { padding: horiz ? { top: 4, left: pct ? 8 : 46, right: 8, bottom: 4 } : { top: 24, left: 8, right: 8, bottom: 4 } },
        scales: horiz ? { x: { ...vAxis, reverse: true }, y: { ...cAxis, reverse: false, position: 'right', ticks: { ...cAxis.ticks, maxRotation: 0 } } } : { x: cAxis, y: { ...vAxis, position: 'right' } },
        plugins: { ...base.plugins,
          valueLabels: { mode: pct ? '' : (stacked || !multi ? 'total' : 'each') },
          tooltip: { ...base.plugins.tooltip, callbacks: {
            label: c => pct ? ` ${c.dataset.label}: ${c.raw}% (${fmt(c.dataset.raw[c.dataIndex])})` : ` ${c.dataset.label}: ${fmt(c.raw)}`,
            footer: items => (stacked && !pct && items.length) ? `الإجمالي: ${fmt(totals[items[0].dataIndex])}` : ''
          } } } };
      if (stacked || pct) options.interaction = { mode: 'index', intersect: false };
    }
    const chart = new Chart(canvas, { type, data, options, plugins: [valueLabels, centerTotal] });
    charts.push(chart);
    return chart;
  }

  const chCard = (id, title, sub, h, wide) => `<section class="ch-card${wide ? ' wide' : ''}" data-chart="${id}"><h4>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h4><div class="ch-canvas" style="height:${h}px"><canvas id="cv-${id}" role="img" aria-label="${esc(title)}"></canvas></div></section>`;
  function destroyCharts() { charts.forEach(c => c.destroy()); charts = []; }

  const DASH = [
    { id: 'd1', title: 'المدارس حسب القطاع والمحافظة', sub: 'بنين وبنات', dim: 'area', split: 'gender', shape: 'hbar', h: 470, wide: true },
    { id: 'd2', title: 'المدارس حسب المرحلة', dim: 'stage', split: '', shape: 'donut', h: 300 },
    { id: 'd3', title: 'المرحلة والجنس', dim: 'stage', split: 'gender', shape: 'bar', h: 300, opt: { stacked: false } },
    { id: 'd4', title: 'المحافظة والمرحلة', sub: 'مكة المكرمة بجميع قطاعاتها', dim: 'gov', split: 'stage', shape: 'hbar', h: 360, wide: true },
    { id: 'd5', title: 'نوع التعليم والجنس', dim: 'type', split: 'gender', shape: 'hbar', h: 300 },
    { id: 'd6', title: 'مكتب التعليم', dim: 'office', split: '', shape: 'hbar', h: 300 },
    { id: 'd7', title: 'المديرون والمديرات حسب عدد المدارس', sub: 'كم مدرسة يدير كل مدير أو مديرة', dim: 'mgr', split: '', shape: 'bar', h: 300 },
    { id: 'd8', title: 'نسبة البنين والبنات في كل مرحلة', dim: 'stage', split: 'gender', shape: 'pct', h: 300 }
  ];
  function scopeText() {
    if (chState.scope === 'all') return 'جميع المدارس';
    const p = ['النتائج الحالية'];
    if (state.q.trim()) p.push(`البحث: «${state.q.trim()}»`);
    if (hasFilters()) p.push(filterText());
    return p.join(' · ');
  }
  function renderDash() {
    const rows = chRows();
    const boys = rows.filter(s => s.gender === 'بنين').length, girls = rows.length - boys;
    const mgrs = managerCounts(rows).reduce((a, b) => a + b, 0);
    const kpi = (n, l, c) => `<div class="kpi"${c ? ` style="--k:${c}"` : ''}><b>${fmt(n)}</b><span>${l}</span></div>`;
    $('ch-dash').innerHTML = `<div class="kpis ch-kpis" data-block>${kpi(rows.length, 'إجمالي المدارس')}${kpi(boys, '<i class="sw b"></i>مدارس البنين')}${kpi(girls, '<i class="sw g"></i>مدارس البنات')}${kpi(mgrs, 'مديرون ومديرات')}</div>`
      + DASH.map(c => chCard(c.id, c.title, c.sub, c.h, c.wide)).join('');
    for (const c of DASH) buildChart($('cv-' + c.id), dataset(rows, c.dim, c.split), c.shape, { ...(c.opt || {}), compact: true });
  }
  function customNote() {
    const notes = [];
    if (chState.shape === 'line' && !DIMS[chState.dim].ordinal) notes.push('الخطوط تناسب البيانات المرتبة مثل المراحل؛ هنا تُقرأ كل نقطة وحدها.');
    if (chState.shape === 'donut' && chState.split) notes.push('الدائرة تعرض الإجمالي لكل فئة دون تقسيم.');
    if (chState.shape === 'donut' && chState.dim === 'area') notes.push('جُمعت قطاعات مكة المكرمة في الدائرة لتبقى واضحة، واختر «أعمدة» لعرض كل قطاع.');
    if (chState.shape === 'pct' && (!chState.split || chState.split === chState.dim)) notes.push('النسب المئوية تحتاج تقسيمًا، فقُسّمت حسب الجنس.');
    if (DIMS[chState.dim].managers && chState.split) notes.push('لا يُقسَّم المديرون حسب الجنس أو المرحلة.');
    if (chState.split === chState.dim) notes.push('اختر تقسيمًا مختلفًا عن البيان نفسه.');
    return notes.join(' ');
  }
  function renderCustom() {
    const rows = chRows(), D = DIMS[chState.dim];
    let split = D.managers ? '' : chState.split;
    if (split === chState.dim) split = '';
    if (chState.shape === 'pct' && !split) split = chState.dim === 'gender' ? 'stage' : 'gender';
    if (chState.shape === 'donut') split = '';
    // a donut stays readable with few slices: Makkah's sectors are merged into the governorate
    const dimUsed = chState.shape === 'donut' && chState.dim === 'area' ? 'gov' : chState.dim;
    const d = dataset(rows, dimUsed, split);
    const title = `${D.managers ? D.label : 'المدارس حسب ' + D.label}${split ? ' و' + DIMS[split].label : ''}`;
    const h = chState.shape === 'donut' ? 420 : Math.max(380, (chState.shape === 'hbar' || chState.shape === 'pct') ? d.labels.length * 38 + 90 : 420);
    const totals = d.labels.map((_, i) => d.series.reduce((a, s) => a + (s.data[i] || 0), 0));
    const grand = totals.reduce((a, b) => a + b, 0);
    const table = `<table class="ch-table"><thead><tr><th>${esc(D.label)}</th>${d.series.length > 1 ? d.series.map(s => `<th class="n"><i class="sw" style="background:${s.color}"></i>${esc(s.label)}</th>`).join('') : ''}<th class="n">${d.unit === 'مدير' ? 'العدد' : 'عدد المدارس'}</th><th class="n">النسبة</th></tr></thead><tbody>`
      + d.labels.map((l, i) => `<tr><td>${esc(l)}</td>${d.series.length > 1 ? d.series.map(s => `<td class="n">${fmt(s.data[i])}</td>`).join('') : ''}<td class="n">${fmt(totals[i])}</td><td class="n">${grand ? Math.round(totals[i] / grand * 1000) / 10 : 0}%</td></tr>`).join('')
      + `<tr class="total"><td>الإجمالي</td>${d.series.length > 1 ? d.series.map(s => `<td class="n">${fmt(s.data.reduce((a, b) => a + b, 0))}</td>`).join('') : ''}<td class="n">${fmt(grand)}</td><td class="n">100%</td></tr></tbody></table>`;
    $('ch-custom').innerHTML = chCard('c1', title, SHAPES[chState.shape], h, true).replace('</section>', `<div class="ch-table-wrap">${table}</div></section>`);
    buildChart($('cv-c1'), d, chState.shape, { stacked: chState.shape === 'bar' ? false : true, genderColors: chState.dim === 'gender' });
    $('ch-note').textContent = customNote();
  }
  function renderCharts() {
    destroyCharts();
    $('ch-dash').hidden = chState.view !== 'dash'; $('ch-custom').hidden = chState.view !== 'custom'; $('ch-controls').hidden = chState.view !== 'custom';
    $('ch-note').textContent = '';
    $('ch-scope-text').textContent = scopeText();
    document.querySelectorAll('#charts-dialog [data-view]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === chState.view));
    document.querySelectorAll('#charts-dialog input[name="ch-shape"]').forEach(r => { r.checked = r.value === chState.shape; });
    if (chState.view === 'dash') renderDash(); else renderCustom();
  }
  async function openCharts() {
    const btn = $('open-charts'); btn.disabled = true;
    try {
      await loadScript('vendor/chart.umd.min.js');
      Chart.defaults.font.family = '"Plex Arabic","Segoe UI",Tahoma,Arial,sans-serif';
      Chart.defaults.font.size = 13; Chart.defaults.color = CH.muted;
      chState.scope = (state.q.trim() || hasFilters() || state.group) ? 'results' : 'all';
      $('ch-scope').value = chState.scope;
      $('charts-dialog').showModal();
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      renderCharts();
    } catch (e) { toast(e.message || 'تعذّر فتح الرسوم البيانية'); }
    finally { btn.disabled = false; }
  }
  $('open-charts').addEventListener('click', openCharts);
  $('charts-dialog').addEventListener('close', destroyCharts);
  document.querySelectorAll('#charts-dialog [data-view]').forEach(b => b.addEventListener('click', () => { chState.view = b.dataset.view; renderCharts(); }));
  $('ch-scope').addEventListener('change', () => { chState.scope = $('ch-scope').value; renderCharts(); });
  $('ch-dim').addEventListener('change', () => { chState.dim = $('ch-dim').value; renderCharts(); });
  $('ch-split').addEventListener('change', () => { chState.split = $('ch-split').value; renderCharts(); });
  document.querySelectorAll('#charts-dialog input[name="ch-shape"]').forEach(r => r.addEventListener('change', () => { chState.shape = r.value; renderCharts(); }));

  // export: page images built from the charts (canvas -> image), header on every page
  function exportBlocks() {
    const root = chState.view === 'dash' ? $('ch-dash') : $('ch-custom');
    return [...root.children].map(el => {
      const c = el.cloneNode(true);
      c.querySelectorAll('canvas').forEach(cv => {
        const ch = charts.find(x => x.canvas.id === cv.id);
        const box = cv.parentElement, wide = el.classList.contains('wide');
        // redraw at the size it will have on the A4 page so text keeps its real size
        const w = wide ? 698 : 333, h = Math.round(parseInt(box.style.height, 10) * (wide ? 0.82 : 0.9));
        const img = document.createElement('img');
        if (ch) { ch.resize(w, h); img.src = ch.toBase64Image('image/png', 1); ch.resize(); }
        img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'contain'; img.style.display = 'block';
        box.style.height = h + 'px';
        cv.replaceWith(img);
      });
      return c;
    });
  }
  function exportTitle() {
    if (chState.view === 'dash') return 'لوحة الرسوم البيانية لمدارس منطقة مكة المكرمة';
    const h = $('ch-custom').querySelector('h4'); return h ? h.firstChild.textContent : 'رسم بياني';
  }
  function pageShell(first, pageNo) {
    const p = document.createElement('div'); p.className = 'ch-page';
    p.innerHTML = (first
      ? `<div class="sp-banner"><img src="${bannerSrc()}" alt=""></div><div class="ch-page-head"><h1>${esc(exportTitle())}</h1><p>مدير إدارة الإدارة المدرسية: د. سعيد الحربي · النطاق: ${esc(scopeText())}<br>تاريخ البيانات: ${esc(hijriSpace(META.date || '—'))} · تاريخ الإعداد: ${esc(nowDates())}</p></div>`
      : `<div class="ch-page-head small"><b>${esc(exportTitle())}</b><span>صفحة ${pageNo}</span></div>`)
      + '<div class="ch-page-grid"></div>';
    return p;
  }
  async function renderPages(paginate) {
    await Promise.all([loadScript('vendor/html2canvas.min.js'), loadScript('vendor/jspdf.umd.min.js')]);
    const stage = document.createElement('div'); stage.id = 'pdf-stage'; stage.className = 'ch-export'; document.body.appendChild(stage);
    const blocks = exportBlocks(), pages = [];
    let page = pageShell(true, 1); stage.appendChild(page); pages.push(page);
    const PAGE_H = 1123;
    for (const b of blocks) {
      const grid = page.querySelector('.ch-page-grid'); grid.appendChild(b);
      await new Promise(r => requestAnimationFrame(r));
      if (paginate && page.scrollHeight > PAGE_H && grid.children.length > 1) {
        b.remove(); page = pageShell(false, pages.length + 1); stage.appendChild(page); pages.push(page);
        page.querySelector('.ch-page-grid').appendChild(b);
      }
    }
    await Promise.all([...stage.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvases = [];
    for (const p of pages) canvases.push(await html2canvas(p, { scale: 2, backgroundColor: '#ffffff', logging: false }));
    stage.remove();
    return canvases;
  }
  async function busy(btn, fn) {
    const label = btn.innerHTML; btn.disabled = true; btn.textContent = 'جارٍ التجهيز…';
    try { await fn(); } catch (e) { toast(e.message || 'تعذّر إنشاء الملف'); }
    finally { btn.disabled = false; btn.innerHTML = label; }
  }
  const fileBase = () => chState.view === 'dash' ? 'رسوم-بيانية-مدارس-مكة' : 'رسم-بياني-' + DIMS[chState.dim].label.replace(/\s+/g, '-');
  $('ch-pdf').addEventListener('click', () => busy($('ch-pdf'), async () => {
    const pages = await renderPages(true);
    const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pages.forEach((cv, i) => {
      if (i) pdf.addPage();
      let w = 210, h = cv.height * w / cv.width; if (h > 297) { h = 297; w = cv.width * h / cv.height; }
      pdf.addImage(cv.toDataURL('image/jpeg', 0.93), 'JPEG', (210 - w) / 2, 0, w, h);
    });
    pdf.save(fileBase() + '.pdf'); toast('حُفظ ملف PDF');
  }));
  $('ch-png').addEventListener('click', () => busy($('ch-png'), async () => {
    const [cv] = await renderPages(false);
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = fileBase() + '.png'; document.body.appendChild(a); a.click(); a.remove();
    toast('حُفظت الصورة');
  }));

  /* ---------- dialogs ---------- */
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  });

  /* ---------- today's date (Hijri + Gregorian) and time, Riyadh time ---------- */
  function tickToday() {
    const now = new Date(), tz = { timeZone: 'Asia/Riyadh' };
    const fmt2 = (loc, o) => { try { return new Intl.DateTimeFormat(loc, { ...tz, ...o }).format(now); } catch (e) { return ''; } };
    const day = fmt2('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long' });
    const hij = fmt2('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*هـ$/, '');
    const greg = fmt2('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
    const time = fmt2('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true });
    $('today-hijri').textContent = `${day} ${hij} هـ`;
    $('today-greg').textContent = `${greg} م`;
    $('today-time').textContent = time;
    setTimeout(tickToday, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
  }
  tickToday();

  /* ---------- start ---------- */
  $('data-date').textContent = META.date || '—';
  buildFilters();
  loadUrl();
  adminUI();
  syncControls();
  update(true);
  if (canCrypto()) autoUnlock().then(resumeOwner);
})();
