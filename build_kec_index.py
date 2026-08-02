import json, os, glob, re

def norm(s):
    return re.sub(r'[^A-Z]+', ' ', s.upper()).strip()

def strip_kab(s):
    return re.sub(r'^(KABUPATEN|KAB|KOTA ADMINISTRASI|KOTA ADM|KOTA)\s+', '', norm(s)).strip()

# For each BPS kec file, extract kecamatan names
bps_info = {}
for f in sorted(glob.glob('data/gis/kec/[0-9]*.json')):
    code = os.path.basename(f).replace('.json','')
    if len(code) > 4:
        continue
    with open(f, 'r') as fh:
        d = json.load(fh)
    kec_names = set()
    for feat in d['features']:
        kn = norm(feat['properties'].get('name', ''))
        if kn:
            kec_names.add(kn)
    bps_info[code] = kec_names

print(f'{len(bps_info)} BPS kab codes in kec chunks')

# Load wilayah
with open('data/wilayah.json', 'r', encoding='utf-8') as f:
    wil = json.load(f)

# For each KPU kabupaten, find the BPS code with highest overlap ratio
# Allow multiple KPU kab to map to same BPS code (pemekaran)
index = {}
matched = 0
for prov in wil['prov']:
    for kab in prov['kab']:
        kab_norm = strip_kab(kab['n'])
        kec_names_kpu = set(norm(c['n']) for c in kab['kec'])
        if not kec_names_kpu:
            continue

        best_code = None
        best_overlap = 0
        best_ratio = 0
        for bps_code, gis_names in bps_info.items():
            overlap = len(kec_names_kpu & gis_names)
            if overlap == 0:
                continue
            # Ratio = how many KPU kecamatan found in this GIS file
            ratio = overlap / len(kec_names_kpu)
            if ratio > best_ratio or (ratio == best_ratio and overlap > best_overlap):
                best_ratio = ratio
                best_overlap = overlap
                best_code = bps_code

        if best_code and best_overlap >= 2:
            index[kab_norm] = best_code
            matched += 1

print(f'Matched {matched} kabupaten')

# Verify
verify = ['ACEH BARAT', 'ACEH BARAT DAYA', 'ACEH SINGKIL', 'BANDUNG', 'JAKARTA PUSAT',
          'SURABAYA', 'SEMARANG', 'BOGOR', 'MALANG', 'SURAKARTA']
for name in verify:
    code = index.get(name, 'NOT FOUND')
    if code != 'NOT FOUND':
        gis_names = bps_info[code]
        # Find the kab in wilayah
        for prov in wil['prov']:
            for kab in prov['kab']:
                if strip_kab(kab['n']) == name:
                    kpu_names = set(norm(c['n']) for c in kab['kec'])
                    overlap = len(kpu_names & gis_names)
                    print(f'  {name} -> {code} ({overlap}/{len(kpu_names)} kec matched)')
                    break
    else:
        print(f'  {name} -> NOT FOUND')

with open('data/gis/kec_index.json', 'w') as f:
    json.dump(index, f, ensure_ascii=False)
print(f'Saved data/gis/kec_index.json ({len(index)} entries)')
