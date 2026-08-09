"""Legacy name/code index builder; retained for historical reproducibility only."""

import glob
import json
import os
import re


# Shapefile sumber memakai kode wilayah induk/lama untuk sejumlah provinsi
# hasil pemekaran. Karena itu nilainya berupa satu atau beberapa prefix yang
# benar-benar tersedia pada data/gis/kec, bukan selalu kode BPS modern.
SHAPEFILE_PROVINCE_CODES = {
    "ACEH": ("11",),
    "SUMATERA UTARA": ("12",),
    "SUMATERA BARAT": ("13",),
    "RIAU": ("14",),
    "JAMBI": ("15",),
    "SUMATERA SELATAN": ("16",),
    "BENGKULU": ("17",),
    "LAMPUNG": ("18",),
    "KEPULAUAN BANGKA BELITUNG": ("16",),
    "KEPULAUAN RIAU": ("14",),
    "DKI JAKARTA": ("31",),
    "JAWA BARAT": ("32",),
    "JAWA TENGAH": ("33",),
    "DAERAH ISTIMEWA YOGYAKARTA": ("34",),
    "JAWA TIMUR": ("35",),
    "BANTEN": ("32",),
    "BALI": ("51",),
    "NUSA TENGGARA BARAT": ("52",),
    "NUSA TENGGARA TIMUR": ("53",),
    "KALIMANTAN BARAT": ("61",),
    "KALIMANTAN TENGAH": ("62",),
    "KALIMANTAN SELATAN": ("63",),
    "KALIMANTAN TIMUR": ("64",),
    "KALIMANTAN UTARA": ("64",),
    "SULAWESI UTARA": ("71",),
    "SULAWESI TENGAH": ("72",),
    "SULAWESI SELATAN": ("73",),
    "SULAWESI TENGGARA": ("74",),
    "GORONTALO": ("71",),
    "SULAWESI BARAT": ("73",),
    "MALUKU": ("81",),
    "MALUKU UTARA": ("81",),
    "PAPUA BARAT": ("82",),
    "PAPUA": ("82", "85"),
}


def norm(value):
    return re.sub(r"[^A-Z]+", " ", str(value).upper()).strip()


def norm_kec(value):
    return re.sub(r"^(KECAMATAN|KEC)\s+", "", norm(value)).strip()


def region_norm(value):
    """Samakan normalisasi key dengan fungsi norm() pada app.js."""
    value = re.sub(
        r"DAERAH ISTIMEWA|DAERAH KHUSUS IBUKOTA|PROVINSI|^DKI |^DI ",
        " ",
        str(value).upper(),
    )
    return re.sub(r"[^A-Z]+", " ", value).strip()


def region_key(province_name, regency_name):
    # Nama kabupaten dipertahankan utuh, termasuk awalan KOTA, agar pasangan
    # seperti BANDUNG dan KOTA BANDUNG tidak bertabrakan.
    return f"{region_norm(province_name)}|{region_norm(regency_name)}"


# Untuk setiap file kode BPS, ambil himpunan nama kecamatannya.
bps_info = {}
for path in sorted(glob.glob("data/gis/kec/[0-9]*.json")):
    code = os.path.splitext(os.path.basename(path))[0]
    if not re.fullmatch(r"\d{4}", code):
        continue
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    kec_names = {
        norm_kec(feature.get("properties", {}).get("name", ""))
        for feature in data.get("features", [])
    }
    kec_names.discard("")
    bps_info[code] = kec_names

print(f"{len(bps_info)} BPS kab codes in kec chunks")

with open("data/wilayah.json", "r", encoding="utf-8") as handle:
    wilayah = json.load(handle)

# Cari potongan GIS dengan irisan nama kecamatan terbesar, tetapi hanya di
# provinsi yang sama. Beberapa daerah pemekaran memang dapat memakai satu
# potongan lama yang sama; key region-aware tetap membuat pilihannya eksplisit.
index = {}
matched = 0
domestic_total = 0
for province in wilayah["prov"]:
    province_name = province["n"].lstrip("+ ").upper()
    province_codes = SHAPEFILE_PROVINCE_CODES.get(province_name)
    if not province_codes:
        continue

    for regency in province["kab"]:
        domestic_total += 1
        kpu_names = {norm_kec(kec["n"]) for kec in regency["kec"]}
        if not kpu_names:
            continue

        best_code = None
        best_overlap = 0
        best_ratio = 0
        for bps_code, gis_names in bps_info.items():
            if not bps_code.startswith(province_codes):
                continue
            overlap = len(kpu_names & gis_names)
            if not overlap:
                continue
            ratio = overlap / len(kpu_names)
            if ratio > best_ratio or (ratio == best_ratio and overlap > best_overlap):
                best_ratio = ratio
                best_overlap = overlap
                best_code = bps_code

        if best_code and best_overlap >= 2:
            index[region_key(province_name, regency["n"])] = best_code
            matched += 1

print(f"Matched {matched}/{domestic_total} domestic kabupaten/kota")

verify = [
    ("DAERAH ISTIMEWA YOGYAKARTA", "BANTUL"),
    ("DAERAH ISTIMEWA YOGYAKARTA", "GUNUNGKIDUL"),
    ("DAERAH ISTIMEWA YOGYAKARTA", "KOTA YOGYAKARTA"),
    ("DAERAH ISTIMEWA YOGYAKARTA", "KULON PROGO"),
    ("DAERAH ISTIMEWA YOGYAKARTA", "SLEMAN"),
    ("JAWA BARAT", "BANDUNG"),
    ("JAWA BARAT", "KOTA BANDUNG"),
]
for province_name, regency_name in verify:
    key = region_key(province_name, regency_name)
    print(f"  {key} -> {index.get(key, 'NOT FOUND')}")

with open("data/gis/kec_index.json", "w", encoding="utf-8") as handle:
    json.dump(index, handle, ensure_ascii=False, sort_keys=True)
    handle.write("\n")
print(f"Saved data/gis/kec_index.json ({len(index)} entries)")
