import os
import glob
import json
import pandas as pd

SCRAPED_DIR = r"D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\scrapping KPU"
PILPRES_DATA_DIR = os.path.join(SCRAPED_DIR, "Pilpres RI", "data")
DPRRI_DATA_DIR = os.path.join(SCRAPED_DIR, "Pileg DPR RI", "data")
DATAPROV_KEC_PATH = os.path.join(SCRAPED_DIR, "Pilpres RI", "dataprov-kec.csv")

OUTPUT_JSON_PATH = r"data/wilayah.json"
OUTPUT_ELECTION_2019_PATH = r"data/election2019.json"

print("--- Step 1: Loading dataprov-kec.csv ---")
df_hierarchy = pd.read_csv(DATAPROV_KEC_PATH)
print(f"Loaded {len(df_hierarchy)} kecamatan rows from hierarchy.")

print("--- Step 2: Processing Pilpres RI CSV files ---")
pilpres_files = glob.glob(os.path.join(PILPRES_DATA_DIR, "datakpu-*.csv"))
print(f"Found {len(pilpres_files)} Pilpres CSV files.")

pilpres_records = []
for f in pilpres_files:
    try:
        df = pd.read_csv(f, usecols=[
            'provinsi', 'kabupaten', 'kecamatan', 'kelurahan',
            'pemilih-1', 'pemilih-2', 'total-pemilih', 'total-pengguna', 'suara-sah', 'suara-tidak-sah'
        ], low_memory=False)
        pilpres_records.append(df)
    except Exception as e:
        print(f"Error reading {f}: {e}")

if pilpres_records:
    df_pilpres = pd.concat(pilpres_records, ignore_index=True)
    # Ensure numeric types
    num_cols = ['pemilih-1', 'pemilih-2', 'total-pemilih', 'total-pengguna', 'suara-sah', 'suara-tidak-sah']
    for c in num_cols:
        df_pilpres[c] = pd.to_numeric(df_pilpres[c], errors='coerce').fillna(0).astype(int)

    # Group by hierarchy
    pilpres_grouped = df_pilpres.groupby(['provinsi', 'kabupaten', 'kecamatan', 'kelurahan']).agg(
        j19=('pemilih-1', 'sum'),
        p19=('pemilih-2', 'sum'),
        dpt=('total-pemilih', 'sum'),
        guna=('total-pengguna', 'sum'),
        sah=('suara-sah', 'sum'),
        tsah=('suara-tidak-sah', 'sum'),
        tps=('pemilih-1', 'count')
    ).reset_index()
    print(f"Aggregated {len(pilpres_grouped)} kelurahan records for Pilpres.")
else:
    pilpres_grouped = pd.DataFrame()

print("--- Step 3: Processing Pileg DPR RI CSV files ---")
dprri_files = glob.glob(os.path.join(DPRRI_DATA_DIR, "datakpu-dprri-*.csv"))
print(f"Found {len(dprri_files)} DPR RI CSV files.")

party_cols = [
    'pkb', 'gerinda', 'pdip', 'golkar', 'nasdem', 'garuda', 'berkarya', 'pks',
    'perindo', 'ppp', 'psi', 'pan', 'hanura', 'demokrat', 'pa', 'sira', 'pda', 'pna', 'pbb', 'pkpi'
]

dprri_records = []
for f in dprri_files:
    try:
        df = pd.read_csv(f, low_memory=False)
        cols_to_use = ['provinsi', 'kabupaten', 'kecamatan', 'kelurahan'] + [c for c in party_cols if c in df.columns]
        df = df[cols_to_use]
        dprri_records.append(df)
    except Exception as e:
        print(f"Error reading {f}: {e}")

if dprri_records:
    df_dprri = pd.concat(dprri_records, ignore_index=True)
    existing_party_cols = [c for c in party_cols if c in df_dprri.columns]
    for c in existing_party_cols:
        df_dprri[c] = pd.to_numeric(df_dprri[c], errors='coerce').fillna(0).astype(int)
    
    dprri_grouped = df_dprri.groupby(['provinsi', 'kabupaten', 'kecamatan']).agg(
        {c: 'sum' for c in existing_party_cols}
    ).reset_index()
    print(f"Aggregated {len(dprri_grouped)} kecamatan records for DPR RI.")
else:
    dprri_grouped = pd.DataFrame()

print("--- Step 4: Building Hierarchy JSON (data/wilayah.json) ---")

# Indexing pilpres by (prov, kab, kec, kel)
pilpres_map = {}
if not pilpres_grouped.empty:
    for _, row in pilpres_grouped.iterrows():
        key = (str(row['provinsi']).upper().strip(),
               str(row['kabupaten']).upper().strip(),
               str(row['kecamatan']).upper().strip(),
               str(row['kelurahan']).upper().strip())
        pilpres_map[key] = [
            int(row['j19']),
            int(row['p19']),
            int(row['dpt']),
            int(row['guna']),
            int(row['sah']),
            int(row['tsah']),
            int(row['tps'])
        ]

# Indexing hierarchy
prov_dict = {}

for _, row in df_hierarchy.iterrows():
    kprov = str(row['kodeprov'])
    nprov = str(row['namaprov']).strip()
    kkab = str(row['kodekab'])
    nkab = str(row['namakab']).strip()
    kkec = str(row['kodekec'])
    nkec = str(row['namakec']).strip()

    if kprov not in prov_dict:
        prov_dict[kprov] = {"k": kprov, "n": nprov, "kab_dict": {}}
    
    kab_dict = prov_dict[kprov]["kab_dict"]
    if kkab not in kab_dict:
        kab_dict[kkab] = {"k": kkab, "n": nkab, "kec_dict": {}}
    
    kec_dict = kab_dict[kkab]["kec_dict"]
    if kkec not in kec_dict:
        kec_dict[kkec] = {"k": kkec, "n": nkec, "kel_list": []}

# Fill kelurahan data into hierarchy
for (prov_name, kab_name, kec_name, kel_name), d_val in pilpres_map.items():
    # Find matching kec in hierarchy or add if present
    for kprov, pdata in prov_dict.items():
        if pdata["n"] == prov_name:
            for kkab, kdata in pdata["kab_dict"].items():
                if kdata["n"] == kab_name:
                    for kkec, cdata in kdata["kec_dict"].items():
                        if cdata["n"] == kec_name:
                            cdata["kel_list"].append({"n": kel_name, "d": d_val})

# Convert dict structure to array structure matching app.js expectations
prov_list = []
for kprov, pdata in prov_dict.items():
    kab_list = []
    for kkab, kdata in pdata["kab_dict"].items():
        kec_list = []
        for kkec, cdata in kdata["kec_dict"].items():
            kec_obj = {"k": cdata["k"], "n": cdata["n"]}
            if cdata["kel_list"]:
                kec_obj["kel"] = cdata["kel_list"]
            kec_list.append(kec_obj)
        kab_list.append({"k": kdata["k"], "n": kdata["n"], "kec": kec_list})
    prov_list.append({"k": pdata["k"], "n": pdata["n"], "kab": kab_list})

wilayah_json = {"prov": prov_list}

os.makedirs("data", exist_ok=True)
with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(wilayah_json, f, ensure_ascii=False)

print(f"Successfully generated {OUTPUT_JSON_PATH} with size {os.path.getsize(OUTPUT_JSON_PATH)} bytes.")

print("--- Step 5: Building Election 2019 Data (data/election2019.json) ---")
# Build election2019.json containing exact DPR RI party votes per kecamatan key P{kprov}.{kkab}.{kkec}
dprri_kec_votes = {}
if not dprri_grouped.empty:
    for _, row in dprri_grouped.iterrows():
        p_name = str(row['provinsi']).upper().strip()
        k_name = str(row['kabupaten']).upper().strip()
        c_name = str(row['kecamatan']).upper().strip()
        
        # Match with hierarchy key
        found_key = None
        for kprov, pdata in prov_dict.items():
            if pdata["n"] == p_name:
                for kkab, kdata in pdata["kab_dict"].items():
                    if kdata["n"] == k_name:
                        for kkec, cdata in kdata["kec_dict"].items():
                            if cdata["n"] == c_name:
                                found_key = f"P{kprov}.P{kprov}.{kkab}.P{kprov}.{kkab}.{kkec}"
                                # Format expected by app.js: P1.P1.1492.P1.1492.1672
                                key_str = f"P{kprov}.P{kprov}.{kkab}.{kkec}"
                                break
        if not found_key:
            continue

        votes = [int(row[c]) if c in row else 0 for c in party_cols]
        dprri_kec_votes[c_name] = votes

with open(OUTPUT_ELECTION_2019_PATH, "w", encoding="utf-8") as f:
    json.dump({"dprri": dprri_kec_votes}, f, ensure_ascii=False)

print(f"Successfully generated {OUTPUT_ELECTION_2019_PATH}.")
print("Done!")
