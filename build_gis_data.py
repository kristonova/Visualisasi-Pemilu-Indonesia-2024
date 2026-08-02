import os
import json
import shapefile
from collections import defaultdict

KEC_SHP_PATH = r"D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\GIS\SHP_Indonesia_kecamatan\INDONESIA_KEC.shp"
DESA_SHP_PATH = r"D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\GIS\SHP_Indonesia_desa\Indo_Desa_region.shp"

OUTPUT_GIS_DIR = r"data/gis"
KEC_DIR = os.path.join(OUTPUT_GIS_DIR, "kec")
DESA_DIR = os.path.join(OUTPUT_GIS_DIR, "desa")

os.makedirs(KEC_DIR, exist_ok=True)
os.makedirs(DESA_DIR, exist_ok=True)

def shape_to_geojson_geometry(shape):
    if shape.shapeType in (5, 15, 25):  # Polygon variants
        points = shape.points
        parts = list(shape.parts) + [len(points)]
        rings = []
        for i in range(len(parts) - 1):
            ring = [[round(pt[0], 5), round(pt[1], 5)] for pt in points[parts[i]:parts[i+1]]]
            if len(ring) >= 3:
                rings.append(ring)
        if not rings:
            return None
        if len(rings) == 1:
            return {"type": "Polygon", "coordinates": rings}
        else:
            return {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
    return None

def norm(s):
    if not s:
        return ""
    return str(s).strip().upper()

def safe_filename(name):
    return "".join([c for c in norm(name) if c.isalnum() or c in (" ", "_", "-")]).strip()

print("--- Step 1: Processing Kecamatan Shapefile into Modular Chunks ---")
sf_kec = shapefile.Reader(KEC_SHP_PATH)
fields_kec = [f[0] for f in sf_kec.fields[1:]]

kec_features_by_kab = defaultdict(list)

for i in range(len(sf_kec)):
    rec = dict(zip(fields_kec, sf_kec.record(i)))
    shape = sf_kec.shape(i)
    geom = shape_to_geojson_geometry(shape)
    if not geom:
        continue
    
    feature = {
        "type": "Feature",
        "properties": {
            "name": rec.get("Kecamatan", ""),
            "id_kec": str(rec.get("ID_Kec", "")),
            "kode_prop": str(rec.get("kode_prop", "")),
            "kode_kab": str(rec.get("kode_kab", ""))
        },
        "geometry": geom
    }
    kab_code = str(rec.get("kode_kab", "")).strip()
    kec_name = norm(rec.get("Kecamatan", ""))
    
    if kab_code:
        kec_features_by_kab[kab_code].append(feature)
    kec_features_by_kab[kec_name].append(feature)

kec_chunks_count = 0
for key_name, features in kec_features_by_kab.items():
    fname = safe_filename(key_name)
    if not fname:
        continue
    out_path = os.path.join(KEC_DIR, f"{fname}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False)
    kec_chunks_count += 1

print(f"Saved {kec_chunks_count} kecamatan chunk files in data/gis/kec/")

print("--- Step 2: Processing Desa Shapefile into Modular Chunks ---")
sf_desa = shapefile.Reader(DESA_SHP_PATH)
fields_desa = [f[0] for f in sf_desa.fields[1:]]

desa_features_by_kec = defaultdict(list)

for i in range(len(sf_desa)):
    if i % 15000 == 0 and i > 0:
        print(f"Processed {i} / {len(sf_desa)} desa features...")
    rec = dict(zip(fields_desa, sf_desa.record(i)))
    shape = sf_desa.shape(i)
    geom = shape_to_geojson_geometry(shape)
    if not geom:
        continue
    
    desa_name = rec.get("DESA", "")
    kec_name = norm(rec.get("KECAMATAN", ""))
    kab_name = norm(rec.get("KABUPATEN", ""))
    
    feature = {
        "type": "Feature",
        "properties": {
            "name": desa_name,
            "kec": kec_name,
            "kab": kab_name
        },
        "geometry": geom
    }
    
    desa_features_by_kec[kec_name].append(feature)
    # Also index by combined KAB_KEC for uniqueness
    if kab_name and kec_name:
        desa_features_by_kec[f"{kab_name}_{kec_name}"].append(feature)

desa_chunks_count = 0
for kec_key, features in desa_features_by_kec.items():
    fname = safe_filename(kec_key)
    if not fname:
        continue
    out_path = os.path.join(DESA_DIR, f"{fname}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False)
    desa_chunks_count += 1

print(f"Saved {desa_chunks_count} desa chunk files in data/gis/desa/")
print("Done!")
