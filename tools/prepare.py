"""Builds site/data.js from the Makkah schools spreadsheet.
Usage: python3 tools/prepare.py <schools.xlsx> [tools/sectors-makkah.json] [data.js]
Personal fields (national ID, mobile, e-mail, assigned person, phone) are never written out."""
import sys, re, json, collections, hashlib, openpyxl

import os
here = os.path.dirname(os.path.abspath(__file__))
xlsx = sys.argv[1]
sectors_json = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, 'sectors-makkah.json')
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, '..', 'data.js')

def n(x):
    x = str(x or '')
    x = re.sub('[ً-ٰٟـ]', '', x)
    x = re.sub('[أإآٱ]', 'ا', x).replace('ة', 'ه').replace('ى', 'ي')
    x = re.sub(r'[^ء-ي0-9 ]', ' ', x)
    return re.sub(r'\s+', ' ', x).strip()

def clean(x):
    x = str(x or '').replace('ـ', '')
    x = re.sub(r'[A-Za-z]', '', x)
    x = re.sub(r'[_.]+', ' ', x)
    x = re.sub(r'\s*[-–—]+\s*', ' - ', x)
    x = re.sub(r'\s*/\s*', ' / ', x)
    x = re.sub(r'\s+', ' ', x).strip(' -/،,')
    x = re.sub(r'^مدينة\s+', '', x)
    x = re.sub(r'مك[ةه]\s*ال\s*مكرم[ةه]|مك[ةه]المكرم[ةه]|مك[ةه] المكرم[ةه]', 'مكة المكرمة', x)
    x = re.sub(r'^مك[ةه](?=$| )(?! المكرمة)', 'مكة المكرمة', x)
    x = x.replace('االليث', 'الليث').replace('الفنفذة', 'القنفذة')
    x = re.sub(r'^اظم$', 'أضم', x)
    return x

# ---------- read spreadsheet ----------
ws = openpyxl.load_workbook(xlsx, read_only=True).worksheets[0]
rows = list(ws.iter_rows(values_only=True))
hdr_i = next(i for i, r in enumerate(rows) if r and 'الرقم الوزاري' in [str(c or '').strip() for c in r])
hdr = [str(c or '').strip() for c in rows[hdr_i]]
col = {h: i for i, h in enumerate(hdr) if h}
title = next((str(c) for r in rows[:hdr_i] for c in r if c), '')
recs = [r for r in rows[hdr_i + 1:] if r and r[col['الرقم الوزاري']]]

STAGE = {'ابتدائ': 'المرحلة الابتدائية', 'متوسط': 'المرحلة المتوسطة', 'ثانوي': 'المرحلة الثانوية'}
def stage(v):
    for k, s in STAGE.items():
        if k in n(v).replace('ي', 'ي'): return s
    return clean(v)
def etype(v):
    t = n(v)
    if 'تحفيظ' in t: return 'تحفيظ القرآن الكريم'
    if 'تربيه خاص' in t: return 'تربية خاصة'
    if 'الكبار' in t: return 'تعليم الكبار'
    if 'جامع' in t: return 'معاهد الجامعة الإسلامية'
    if 'تعليم عام' in t: return 'تعليم عام'
    return clean(v)
def office(v):
    t = n(v)
    if 'اعاق' in t: return 'ذوي الإعاقة'
    if 'موهوب' in t: return 'الموهوبين'
    return stage(v)

# ---------- Makkah city sectors (from the Makkah schools guide; ministry numbers already corrected) ----------
guide = json.load(open(sectors_json, encoding='utf-8'))
def sector_of(s):
    t = n(s)
    for k, v in [('الشمال', 'قطاع الشمال'), ('الجنوب', 'قطاع الجنوب'), ('الشرق', 'قطاع الشرق'), ('الغرب', 'قطاع الغرب'), ('بحره', 'بحرة'), ('الجموم', 'الجموم')]:
        if k in t: return v
    return ''
by_rev = {str(x['code']).strip(): sector_of(x['sector']) for x in guide}
by_name = collections.defaultdict(set)
for x in guide: by_name[(n(x['name']), x['gender'])].add(sector_of(x['sector']))

KW = [('مكة المكرمة', r'مك[ه]'), ('الجموم', r'جموم'), ('بحرة', r'بحره'), ('الليث', r'الليث'),
      ('القنفذة', r'قنفذ|المظيلف|(^| )حلي($| )|دوقه|(^| )القوز($| )'), ('أضم', r'اضم|اظم'), ('العرضيات', r'العرضي')]
def kw(t):
    for gv, p in KW:
        if re.search(p, t): return gv
    return ''

schools, gov, sector, via = [], {}, {}, collections.Counter()
for i, r in enumerate(recs):
    code = str(r[col['الرقم الوزاري']]).strip()
    name = re.sub(r'\s+', ' ', str(r[col['اسم المدرسة']] or '')).strip()
    gender = str(r[col['جنس المدرسة']] or '').strip()
    s = {'id': i, 'code': code, 'name': name,
         'stage': stage(r[col['المرحلة']]), 'gender': gender,
         'type': etype(r[col['نوع التعليم']]), 'office': office(r[col['مكتب التعليم']]),
         'town': clean(r[col['المدينة/القرية']]), 'authority': clean(r[col['السلطة']]),
         'region': clean(r[col['المنطقة الإدارية']]),
         'manager': re.sub(r'\s+', ' ', str(r[col['اسم مدير المدرسة']] or '')).strip(),
         '_mid': str(r[col['هوية مدير المدرسة']] or '').strip()}
    sec = by_rev.get(code, '')
    if sec: via['guide-number'] += 1
    else:
        cands = by_name.get((n(name), gender), set()) - {''}
        if len(cands) == 1: sec = cands.pop(); via['guide-name'] += 1
    if sec in ('قطاع الشمال', 'قطاع الجنوب', 'قطاع الشرق', 'قطاع الغرب'):
        sector[i] = sec; gov[i] = 'مكة المكرمة'
    elif sec in ('الجموم', 'بحرة'):
        gov[i] = sec
    else:
        gv = kw(n(s['town'])) or kw(n(name))
        if gv: gov[i] = gv; via['keyword'] += 1
    schools.append(s)

# propagate governorate through identical towns and shared principals
for _ in range(4):
    bt, bm = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter)
    for i, gv in gov.items():
        if n(schools[i]['town']): bt[n(schools[i]['town'])][gv] += 1
        if schools[i]['_mid']: bm[schools[i]['_mid']][gv] += 1
    added = 0
    for s in schools:
        i = s['id']
        if i in gov: continue
        for c in (bt.get(n(s['town'])), bm.get(s['_mid'])):
            if c and len(c) == 1:
                gov[i] = next(iter(c)); added += 1; via['propagated'] += 1; break
    if not added: break

# principals with several schools -> opaque group number (no ID leaves this script)
groups = collections.defaultdict(list)
for s in schools:
    if s['_mid']: groups[s['_mid']].append(s['id'])
gid, gno = {}, 0
for mid, ids in sorted(groups.items(), key=lambda kv: kv[1][0]):
    if len(ids) > 1:
        gno += 1
        for i in ids: gid[i] = gno

out_rows = []
for s in schools:
    i = s.pop('id'); s.pop('_mid')
    row = {'id': i, **s, 'gov': gov.get(i, 'غير محدد'), 'sector': sector.get(i, '')}
    if i in gid: row['group'] = gid[i]
    out_rows.append(row)

m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', xlsx)
HM = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة']
date = f'{int(m.group(3))} {HM[int(m.group(2)) - 1]} {m.group(1)}هـ' if m else ''
meta = {'title': title, 'date': date, 'count': len(out_rows)}
with open(out, 'w', encoding='utf-8') as f:
    f.write('window.SCHOOL_META=' + json.dumps(meta, ensure_ascii=False) + ';\n')
    f.write('window.SCHOOLS=' + json.dumps(out_rows, ensure_ascii=False, separators=(',', ':')) + ';\n')

print('schools', len(out_rows), 'groups', gno, dict(via))
print('gov', collections.Counter(r['gov'] for r in out_rows).most_common())
print('sector', collections.Counter(r['sector'] for r in out_rows).most_common())
print('type', collections.Counter(r['type'] for r in out_rows).most_common())
print('office', collections.Counter(r['office'] for r in out_rows).most_common())
print('stage', collections.Counter(r['stage'] for r in out_rows).most_common())
print('towns', len({r['town'] for r in out_rows}), collections.Counter(r['town'] for r in out_rows).most_common(12))
print(meta)
