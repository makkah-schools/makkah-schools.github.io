(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const DATA = window.SCHOOLS || [];
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
      sector: s.sector, region: s.gov, town: s.town, type: s.type, office: s.office
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
    { label: 'إجمالي المدارس', cls: 'total', n: DATA.length, apply: () => resetAll(), on: () => !hasFilters() && !state.q && !state.group },
    { label: 'مدارس البنين', n: DATA.filter(s => s.gender === 'بنين').length, key: 'gender', val: 'بنين' },
    { label: 'مدارس البنات', n: DATA.filter(s => s.gender === 'بنات').length, key: 'gender', val: 'بنات' },
    ...STAGES.map(st => ({ label: STAGE_SHORT[st], n: DATA.filter(s => s.stage === st).length, key: 'stage', val: st }))
  ];
  function renderStats() {
    $('stats').innerHTML = STAT_DEFS.map((d, i) => {
      const on = d.on ? d.on() : state[d.key] === d.val;
      return `<button type="button" class="stat ${d.cls || ''}" data-stat="${i}" aria-pressed="${on}"><b>${fmt(d.n)}</b><span>${esc(d.label)}</span></button>`;
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
</dl>${g}</article>`;
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
    $('q-label').textContent = t[0]; $('q').placeholder = t[1]; $('search-help').textContent = t[2];
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
    const lines = [`النطاق: ${scope === 'all' ? 'جميع المدارس' : 'النتائج الحالية'}`];
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
      const max = t.bars ? Math.max(...t.rows.map(r => r[r.length - 1]), 1) : 0;
      return `<section class="rsec ${t.wide ? 'wide' : ''}"><h4>${esc(t.title)}</h4><table><thead><tr>${t.head.map((h, i) => `<th class="${i ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${
        t.rows.map(r => `<tr>${r.map((c, i) => i ? `<td class="n">${fmt(c)}</td>` : `<td>${esc(c)}${t.bars ? `<span class="bar" style="width:${Math.round(r[r.length - 1] / max * 100)}%"></span>` : ''}</td>`).join('')}</tr>`).join('')
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
  $('print-report').addEventListener('click', () => { $('print-area').innerHTML = reportHtml($('report-scope').value); window.print(); });

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
      ws.columns = COLS.map(([h, w]) => ({ header: h, width: w }));
      styleHead(ws.getRow(1));
      rows.forEach((s, i) => { const r = ws.addRow(COLS.map(c => c[2](s, i) ?? '')); r.getCell(2).numFmt = '@'; r.getCell(1).alignment = { horizontal: 'center' }; });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };
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

  /* ---------- dialogs ---------- */
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  });

  /* ---------- start ---------- */
  $('data-date').textContent = META.date || '—';
  if (META.title) $('source-title').textContent = META.title;
  buildFilters();
  loadUrl();
  syncControls();
  update(true);
})();
