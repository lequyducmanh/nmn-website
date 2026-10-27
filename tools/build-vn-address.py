"""Tạo assets/data/vn-units.json và vn-old-wards.json.
Cách dùng:
  git clone --depth 1 https://github.com/ThangLeQuoc/vietnamese-provinces-database.git /tmp/vnp
  git clone --depth 1 https://github.com/quangtam/vietnam-address-database.git /tmp/vadb
  python3 tools/build-vn-address.py /tmp/vnp /tmp/vadb assets/data
Sau đó tăng VER trong assets/js/vn-address.js.
"""
import json, unicodedata, re, collections, sys
def norm(s):
    s = unicodedata.normalize('NFD', s or '').replace('đ','d').replace('Đ','D')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', s)).strip()
def strip_unit(s): return re.sub(r'^(thanh pho|tinh|phuong|xa|dac khu|thi tran|quan|huyen|thi xa)\s+', '', norm(s))
T = json.load(open(sys.argv[1] + '/json/full_json_generated_data_vn_units.json'))
meta = json.load(open(sys.argv[1] + '/json/vn_provinces_metadata.json'))
coll = lambda w: strip_unit(w['FullName'])
prov = []; code2prov = {}; byname = collections.defaultdict(list)
for p in T:
    wards = sorted(p['Wards'], key=lambda w: (norm(w['Name']).split(' ')[0].isdigit(), norm(w['Name'])))
    prov.append([p['Code'], p['FullName'], [[w['Code'], w['FullName']] for w in wards]])
    for w in p['Wards']:
        code2prov[w['Code']] = p['Code']; byname[(p['Code'], strip_unit(w['FullName']))].append(w['Code'])
prov.sort(key=lambda p: norm(p[1].replace('Thành phố ','').replace('Tỉnh ','')))
pname = {p['Code']: strip_unit(p['FullName']) for p in T}
D = json.load(open(sys.argv[2] + '/address.json'))
M = [t for t in D if t.get('name') == 'ward_mappings'][0]['data']
dists = []; didx = {}; rows = []; unresolved = []
for m in M:
    c = m['new_ward_code']
    if c not in code2prov:
        np = strip_unit(m['new_province_name']); cand = [pc for pc, n in pname.items() if n == np]
        hits = [x for pc in cand for x in byname.get((pc, strip_unit(m['new_ward_name'])), [])]
        if len(hits) == 1: c = hits[0]
        else: unresolved.append(m); continue
    k = (m['old_district_name'] or '') + '|' + (m['old_province_name'] or '')
    if k not in didx: didx[k] = len(dists); dists.append(k)
    rows.append([m['old_ward_name'], didx[k], c])
rows = [list(r) for r in {tuple(r) for r in rows}]
rows.sort(key=lambda r: (r[1], norm(r[0]), r[2], r[0]))
print('units', len(prov), sum(len(p[2]) for p in prov), 'map rows', len(rows), 'unresolved', len(unresolved), file=sys.stderr)
for u in unresolved[:5]: print('  ', u['old_ward_name'], u['old_district_name'], '->', u['new_ward_name'], u['new_province_name'], file=sys.stderr)
out = sys.argv[3] if len(sys.argv) > 3 else 'assets/data'; import os; os.makedirs(out, exist_ok=True)
# bí danh: tên tỉnh cũ đã sáp nhập (>=30 phường/xã cũ chuyển vào)
cnt = collections.Counter()
for r in rows:
    op = re.sub(r'^(Thành phố|Tỉnh)\s+', '', dists[r[1]].split('|')[1]).strip()
    if op: cnt[(code2prov[r[2]], op)] += 1
for p in prov:
    me = re.sub(r'^(Thành phố|Tỉnh)\s+', '', p[1])
    p.append(sorted(op for (pc, op), n in cnt.items() if pc == p[0] and n >= 30 and op != me and op != 'Thừa Thiên Huế'))
json.dump({'v': meta['DatasetVersion'], 'decree': meta['LatestDecree'], 'at': meta['GeneratedAt'][:10],
           'src': 'github.com/ThangLeQuoc/vietnamese-provinces-database (MIT)', 'p': prov},
          open(out + '/vn-units.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump({'src': 'github.com/quangtam/vietnam-address-database (MIT)', 'd': dists, 'm': rows},
          open(out + '/vn-old-wards.json', 'w'), ensure_ascii=False, separators=(',', ':'))
