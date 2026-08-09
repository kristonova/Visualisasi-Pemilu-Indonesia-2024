"""Build GeoJSON boundaries aligned to the KPU 2019 hierarchy.

The source collection does not contain one authoritative polygon snapshot for
17 April 2019.  This builder therefore uses the KPU election hierarchy as the
identity spine and selects geometry conservatively, in this order:

* Kemendagri 2018 semester-I regency/district archives, with provinces
  dissolved from their 2019 regency children;
* Kemendagri 2020 semester-I village GeoPackage (2017 spatial base joined to
  2020 names);
* June 2023 repository regency/district shapefiles only for unresolved targets;
* the March 2020 BIG village layer, then the May 2023 one, each only after a
  safe code bridge back to the 2017/2020 historical geometry has been attempted
  and its UUPP is not newer than 2019 (or is explicitly unavailable).

Names are matched only by exact canonical form, compact form, documented
aliases, or a one-to-one village name within the same regency.  There is no
edit-distance/fuzzy fallback.  Ambiguous identities remain explicitly
unmatched and the frontend renders its non-spatial grid instead.

Outputs
-------
data/gis/provinsi.json
data/gis/kab/<provinceKey>.json
data/gis/kec/<regencyKey>.json
data/gis/desa/<districtKey>.json
data/gis/audit2019.json

All directory outputs are built in staging and installed transactionally.
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import math
import os
import re
import shutil
import tempfile
import time
import unicodedata
import uuid
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

from pyogrio import raw as ogr_raw
import shapely


PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_SOURCE_DIR = PROJECT_DIR / "SHP GIS"
DEFAULT_HIERARCHY = PROJECT_DIR / "data" / "wilayah.json"
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "data" / "gis"

HISTORIC_ROOT = Path("batas-administrasi-indonesia") / "2020"
HISTORIC_KAB_ZIP = HISTORIC_ROOT / "Batas Kabupaten SHP.zip"
HISTORIC_KEC_ZIP = HISTORIC_ROOT / "Batas Kecamatan SHP.zip"
HISTORIC_DESA_PARTS = (
    HISTORIC_ROOT
    / "batas_desa_gpkg"
    / "Kemendagri-2020semester1-BatasDesa.zip.*"
)
# The same BIG village programme as the 2023 layer below, but the March 2020
# extract.  It is nested: the split parts rebuild a ZIP that contains one ZIP.
HISTORIC_BIG_DESA_PARTS = (
    HISTORIC_ROOT / "batas_desa_shp" / "Batas Desa SHP_2.zip.*"
)
MODERN_ROOT = Path("batas-administrasi-indonesia")
MODERN_KAB_SHP = MODERN_ROOT / "Kab_Kota" / "Kab_Kota.shp"
MODERN_KEC_SHP = MODERN_ROOT / "Kecamatan" / "Kecamatan.shp"
MODERN_DESA_SHP = (
    Path("BATAS WILAYAH KELURAHAN-DESA 10K from www.indonesia-geospasial.com")
    / "Batas_Wilayah_KelurahanDesa_10K_AR.shp"
)

GPKG_PREFIX_2017 = "giskemendagri.gisadmin.Desa_Spasial_22092017."
GPKG_PREFIX_2020 = "giskemendagri.gisadmin.rekap_kel202001."
GPKG_COLUMNS = {
    "province": GPKG_PREFIX_2020 + "nama_prop_siak",
    "regency": GPKG_PREFIX_2020 + "nama_kab_siak",
    "district": GPKG_PREFIX_2020 + "nama_kec_siak",
    "village": GPKG_PREFIX_2020 + "nama_kel_siak",
    "code": GPKG_PREFIX_2020 + "kode_desa_spatial",
}

# Both BIG village snapshots publish the same schema.
BIG_DESA_COLUMNS = {
    "province": "WADMPR",
    "regency": "WADMKK",
    "district": "WADMKC",
    "village": "WADMKD",
    "code": "KDEPUM",
    "legal_basis": "UUPP",
}

# BIG snapshots supply identity for the historical code bridge and are the
# polygon of last resort.  Order is oldest first: the 2020 extract is closer to
# the 2019 election than the 2023 one.
MODERN_VILLAGE_SOURCES = ("desa2020big", "desa2023")

PROVINCE_ALIASES = {
    "DI YOGYAKARTA": "DAERAH ISTIMEWA YOGYAKARTA",
    "D I YOGYAKARTA": "DAERAH ISTIMEWA YOGYAKARTA",
    "YOGYAKARTA": "DAERAH ISTIMEWA YOGYAKARTA",
    "DAERAH KHUSUS IBUKOTA JAKARTA": "DKI JAKARTA",
    "KEP BANGKA BELITUNG": "KEPULAUAN BANGKA BELITUNG",
    "BANGKA BELITUNG": "KEPULAUAN BANGKA BELITUNG",
    "PAPUA SELATAN": "PAPUA",
    "PAPUA TENGAH": "PAPUA",
    "PAPUA PEGUNUNGAN": "PAPUA",
    "PAPUA BARAT DAYA": "PAPUA BARAT",
}

# Source canonical name -> KPU 2019 canonical name.  These are documented
# historical spellings/renamings, not similarity guesses.
REGENCY_ALIASES = {
    "KOTA PADANG SIDIMPUAN": "KOTA PADANG SIDEMPUAN",
    "MAMUJU UTARA": "PASANGKAYU",
    "KEP SIAU TAGULANDANG BIARO": "KEPULAUAN SIAU TAGULANDANG BIARO",
    "KEPULAUAN SIAU TAGULANDANG BIARO": "KEPULAUAN SIAU TAGULANDANG BIARO",
    "TOBA": "TOBA SAMOSIR",
    "ADMINISTRASI KEPULAUAN SERIBU": "KEPULAUAN SERIBU",
    "KEPULAUAN SERIBU": "KEPULAUAN SERIBU",
    "POHUWATO": "PAHUWATO",
    "KEPULAUAN TANIMBAR": "MALUKU TENGGARA BARAT",
    "PANGKAJENE KEPULAUAN": "PANGKAJENE DAN KEPULAUAN",
    "PAREPARE": "PARE PARE",
    "TOLI TOLI": "TOLITOLI",
    "LUBUK LINGGAU": "LUBUKLINGGAU",
    "PANGKAL PINANG": "PANGKALPINANG",
    "TANJUNG PINANG": "TANJUNGPINANG",
    "MUKO MUKO": "MUKOMUKO",
    "FAK FAK": "FAKFAK",
}

DISTRICT_ALIASES = {
    "PANYABUNGAN": "PANYABUNGAN KOTA",
    "SUMBEREJO": "SUMBERREJO",
    "KOTA KUDUS": "KUDUS",
    "LAMBA LEDA SELATAN": "POCO RANAKA",
    "PULAU GOROM": "PULAU GORONG",
    "LAMBA LEDA TIMUR": "POCO RANAKA TIMUR",
    "LAUT TAWAR": "LUT TAWAR",
}

# Source spelling -> KPU spelling, scoped to one resolved KPU regency so a
# typo that is a legitimate district name elsewhere cannot be rewritten.
SCOPED_DISTRICT_ALIASES = {
    ("P1.1492", "JOHAN PAHWALAN"): "JOHAN PAHLAWAN",
    ("P1.2", "PASI RAJA"): "PASIE RAJA",
    ("P1.6166", "JANGKA BUAYA"): "JANGKA BUYA",
    ("P6728.9835", "BERAMPU"): "BRAMPU",
    ("P6728.9835", "SILIMA PUNGGA PUNGGA"): "SILIMA PUNGGA PUNGA",
    ("P6728.11247", "SIANJAR MULA MULA"): "SIANJUR MULA MULA",
    ("P20802.21265", "KOTA ARGA MAKMUR"): "ARGA MAKMUR",
    ("P32676.32986", "BATURRADEN"): "BATURADEN",
    ("P42385.50532", "PALENGGAAN"): "PALENGA AN",
    ("P42385.45561", "PEJARAKAN"): "PAJARAKAN",
    ("P60371.61846", "BANUA LIMA"): "BENUA LIMA",
    ("P74716.74717", "BOLIYOHUTO"): "BULIYOHUTO",
    ("P78203.79019", "MAMBIOMAN BAPAI"): "NAMBIOMAN BAPAI",
    ("P78203.80851", "BOGABAIDA"): "BOGOBAIDA",
    ("P81877.928081", "MINYAMBAOUW"): "MINYAMBOUW",
    ("P1.5286", "SETIA BHAKTI"): "SETIA BAKTI",
    ("P12920.13010", "IX KOTO SUNGAI LASI"): "IX KOTO SEI LASI",
    ("P17404.17895", "BELIDA DARAT"): "BELINDA DARAT",
    ("P32676.33603", "PURWANEGARA"): "PURWONEGORO",
    ("P51578.51913", "CIGEMLONG"): "CIGEMBLONG",
    ("P69268.69962", "PALANGGA"): "PALLANGGA",
    ("P69268.72007", "LIMBONG"): "RONGKONG",
}


@dataclass(frozen=True)
class Region:
    key: str
    name: str
    level: str
    parent_key: str | None


@dataclass(frozen=True)
class VectorSource:
    id: str
    path: Path
    vintage: str
    columns: dict[str, str]
    public_paths: tuple[Path, ...]


@dataclass(frozen=True)
class SourceRow:
    source_id: str
    fid: int
    province: str
    regency: str
    district: str
    village: str
    code: str
    legal_basis: str


@dataclass(frozen=True)
class MatchRef:
    source_id: str
    fid: int
    method: str
    source_name: str


@dataclass
class Hierarchy:
    provinces: list[Region]
    regencies: list[Region]
    districts: list[Region]
    villages: list[Region]
    regencies_by_province: dict[str, list[Region]]
    districts_by_regency: dict[str, list[Region]]
    villages_by_district: dict[str, list[Region]]
    villages_by_regency: dict[str, list[Region]]
    province_by_key: dict[str, Region]
    regency_by_key: dict[str, Region]
    district_by_key: dict[str, Region]
    village_by_key: dict[str, Region]


def canonical(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", errors="ignore").decode("ascii").upper()
    text = text.replace("&", " DAN ")
    text = re.sub(r"\bKOTA\s+ADMINISTRASI\b", "ADMINISTRASI", text)
    text = re.sub(r"\bADM(?:INISTRASI)?\.?\s+KEP(?:ULAUAN)?\.?\b", "ADMINISTRASI KEPULAUAN", text)
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return " ".join(text.split())


def compact(value: Any) -> str:
    return canonical(value).replace(" ", "")


def canonical_province(value: Any) -> str:
    name = canonical(value)
    return PROVINCE_ALIASES.get(name, name)


def canonical_regency(value: Any) -> str:
    name = canonical(value)
    return REGENCY_ALIASES.get(name, name)


def canonical_district(value: Any) -> str:
    name = canonical(value)
    return DISTRICT_ALIASES.get(name, name)


def unique_index(regions: Iterable[Region], normalizer=canonical) -> dict[str, Region | None]:
    index: dict[str, Region | None] = {}
    for region in regions:
        key = normalizer(region.name)
        if key in index:
            index[key] = None
        else:
            index[key] = region
    return index


def resolve_region(
    value: Any,
    regions: Sequence[Region],
    normalizer=canonical,
) -> tuple[Region | None, str | None]:
    source_raw = canonical(value)
    source = normalizer(value)
    exact = unique_index(regions, normalizer).get(source)
    if exact is not None:
        return exact, "alias" if source != source_raw else "exact"
    compact_index = unique_index(regions, lambda region_name: compact(normalizer(region_name)))
    hit = compact_index.get(compact(source))
    return (hit, "compact") if hit is not None else (None, None)


def load_hierarchy(path: Path) -> Hierarchy:
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    if raw.get("schema") != 2:
        raise RuntimeError(f"Unsupported hierarchy schema: {raw.get('schema')!r}")

    provinces: list[Region] = []
    regencies: list[Region] = []
    districts: list[Region] = []
    villages: list[Region] = []
    regencies_by_province: dict[str, list[Region]] = defaultdict(list)
    districts_by_regency: dict[str, list[Region]] = defaultdict(list)
    villages_by_district: dict[str, list[Region]] = defaultdict(list)
    villages_by_regency: dict[str, list[Region]] = defaultdict(list)

    for province in raw["prov"]:
        if canonical(province["n"]).startswith("LUAR NEGERI") or str(province["n"]).lstrip().startswith("+"):
            continue
        pkey = f"P{province['k']}"
        pregion = Region(pkey, province["n"], "province", None)
        provinces.append(pregion)
        for regency in province["kab"]:
            kkey = f"{pkey}.{regency['k']}"
            kregion = Region(kkey, regency["n"], "regency", pkey)
            regencies.append(kregion)
            regencies_by_province[pkey].append(kregion)
            for district in regency["kec"]:
                ckey = f"{kkey}.{district['k']}"
                cregion = Region(ckey, district["n"], "district", kkey)
                districts.append(cregion)
                districts_by_regency[kkey].append(cregion)
                for village in district.get("kel", []):
                    lkey = f"{ckey}.{village['k']}"
                    lregion = Region(lkey, village["n"], "village", ckey)
                    villages.append(lregion)
                    villages_by_district[ckey].append(lregion)
                    villages_by_regency[kkey].append(lregion)

    return Hierarchy(
        provinces=provinces,
        regencies=regencies,
        districts=districts,
        villages=villages,
        regencies_by_province=dict(regencies_by_province),
        districts_by_regency=dict(districts_by_regency),
        villages_by_district=dict(villages_by_district),
        villages_by_regency=dict(villages_by_regency),
        province_by_key={region.key: region for region in provinces},
        regency_by_key={region.key: region for region in regencies},
        district_by_key={region.key: region for region in districts},
        village_by_key={region.key: region for region in villages},
    )


def safe_extract(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    destination_root = destination.resolve()
    with zipfile.ZipFile(archive) as handle:
        for member in handle.infolist():
            target = (destination / member.filename).resolve()
            if destination_root not in target.parents and target != destination_root:
                raise RuntimeError(f"Unsafe archive member: {member.filename}")
        handle.extractall(destination)


def combine_parts(parts: Sequence[Path], output: Path) -> None:
    if not parts:
        raise FileNotFoundError("No split GeoPackage ZIP parts found")
    with output.open("wb") as destination:
        for part in parts:
            with part.open("rb") as source:
                shutil.copyfileobj(source, destination, length=1024 * 1024)


def split_parts(source_root: Path, pattern: Path) -> list[Path]:
    return sorted(Path(hit) for hit in glob.glob(str(source_root / pattern)))


def only_file(directory: Path, pattern: str) -> Path:
    hits = list(directory.rglob(pattern))
    if len(hits) != 1:
        raise RuntimeError(f"Expected one {pattern} in {directory}, found {len(hits)}")
    return hits[0]


def prepare_sources(source_root: Path, temporary: Path) -> dict[str, VectorSource]:
    paths = {
        "kab_zip": source_root / HISTORIC_KAB_ZIP,
        "kec_zip": source_root / HISTORIC_KEC_ZIP,
        "modern_kab": source_root / MODERN_KAB_SHP,
        "modern_kec": source_root / MODERN_KEC_SHP,
        "modern_desa": source_root / MODERN_DESA_SHP,
    }
    for label, path in paths.items():
        if not path.exists():
            raise FileNotFoundError(f"Missing GIS source {label}: {path}")

    historic_kab_dir = temporary / "kab2018"
    historic_kec_dir = temporary / "kec2018"
    safe_extract(paths["kab_zip"], historic_kab_dir)
    safe_extract(paths["kec_zip"], historic_kec_dir)

    parts = split_parts(source_root, HISTORIC_DESA_PARTS)
    combined_zip = temporary / "desa2020.zip"
    combine_parts(parts, combined_zip)
    historic_desa_dir = temporary / "desa2020"
    safe_extract(combined_zip, historic_desa_dir)

    big_parts = split_parts(source_root, HISTORIC_BIG_DESA_PARTS)
    combined_big_zip = temporary / "desa2020big-outer.zip"
    combine_parts(big_parts, combined_big_zip)
    big_outer_dir = temporary / "desa2020big-outer"
    safe_extract(combined_big_zip, big_outer_dir)
    big_desa_dir = temporary / "desa2020big"
    safe_extract(only_file(big_outer_dir, "*.zip"), big_desa_dir)

    common_2018 = {
        "province": "Provinsi",
        "regency": "Kab_Kota",
        "district": "",
        "village": "",
        "code": "Kode_Kab",
    }
    sources = {
        "kab2018": VectorSource(
            "kab2018",
            only_file(historic_kab_dir, "*.shp"),
            "Kemendagri 2018 semester I",
            common_2018,
            (HISTORIC_KAB_ZIP,),
        ),
        "kec2018": VectorSource(
            "kec2018",
            only_file(historic_kec_dir, "*.shp"),
            "Kemendagri 2018 semester I",
            {
                "province": "Provinsi",
                "regency": "Kab_Kota",
                "district": "Kecamatan",
                "village": "",
                "code": "Kode_Kec",
            },
            (HISTORIC_KEC_ZIP,),
        ),
        "desa2020": VectorSource(
            "desa2020",
            only_file(historic_desa_dir, "*.gpkg"),
            "Kemendagri 2020 semester I (spatial base 2017)",
            GPKG_COLUMNS,
            tuple(part.relative_to(source_root) for part in parts),
        ),
        "desa2020big": VectorSource(
            "desa2020big",
            only_file(big_desa_dir, "*.shp"),
            "BIG village boundary snapshot March 2020 with per-feature UUPP",
            BIG_DESA_COLUMNS,
            tuple(part.relative_to(source_root) for part in big_parts),
        ),
        "kab2023": VectorSource(
            "kab2023",
            paths["modern_kab"],
            "repository snapshot June 2023",
            {
                "province": "PROVINSI",
                "regency": "KAB_KOTA",
                "district": "",
                "village": "",
                "code": "KODE_KK",
            },
            (MODERN_KAB_SHP,),
        ),
        "kec2023": VectorSource(
            "kec2023",
            paths["modern_kec"],
            "repository snapshot June 2023",
            {
                "province": "PROVINSI",
                "regency": "KAB_KOTA",
                "district": "KECAMATAN",
                "village": "",
                "code": "KODE_KEC",
            },
            (MODERN_KEC_SHP,),
        ),
        "desa2023": VectorSource(
            "desa2023",
            paths["modern_desa"],
            "BIG village boundary snapshot May 2023 with per-feature UUPP",
            BIG_DESA_COLUMNS,
            (MODERN_DESA_SHP,),
        ),
    }
    return sources


def read_rows(source: VectorSource) -> list[SourceRow]:
    columns = [name for name in source.columns.values() if name]
    metadata, fids, _geometry, arrays = ogr_raw.read(
        source.path,
        columns=columns,
        read_geometry=False,
        return_fids=True,
    )
    values = dict(zip(metadata["fields"], arrays))
    rows: list[SourceRow] = []
    for index, fid in enumerate(fids):
        def field(role: str) -> str:
            column = source.columns.get(role, "")
            return str(values[column][index] or "").strip() if column else ""

        rows.append(
            SourceRow(
                source_id=source.id,
                fid=int(fid),
                province=field("province"),
                regency=field("regency"),
                district=field("district"),
                village=field("village"),
                code=field("code"),
                legal_basis=field("legal_basis"),
            )
        )
    return rows


def inspect_spatial_sources(sources: dict[str, VectorSource]) -> dict[str, dict[str, str]]:
    """Read and enforce the spatial contract used by emitted GeoJSON."""

    result: dict[str, dict[str, str]] = {}
    for source_id, source in sources.items():
        metadata, *_ = ogr_raw.read(
            source.path,
            columns=[],
            read_geometry=True,
            max_features=1,
        )
        crs = str(metadata.get("crs") or "")
        geometry_type = str(metadata.get("geometry_type") or "")
        if crs != "EPSG:4326":
            raise RuntimeError(
                f"{source_id} uses {crs or 'an unknown CRS'}; "
                "the builder only emits untransformed EPSG:4326 coordinates"
            )
        if not geometry_type.startswith(("Polygon", "MultiPolygon")):
            raise RuntimeError(f"{source_id} is not a polygon layer: {geometry_type}")
        result[source_id] = {
            "crs": crs,
            "geometry_type": geometry_type,
            "encoding": str(metadata.get("encoding") or ""),
        }
    return result


def resolve_parent(
    row: SourceRow,
    hierarchy: Hierarchy,
) -> tuple[Region | None, Region | None, Region | None, list[str]]:
    methods: list[str] = []
    province, method = resolve_region(row.province, hierarchy.provinces, canonical_province)
    if province is None:
        return None, None, None, methods
    methods.append(method or "exact")
    regency, method = resolve_region(
        row.regency,
        hierarchy.regencies_by_province.get(province.key, []),
        canonical_regency,
    )
    if regency is None:
        return province, None, None, methods
    methods.append(method or "exact")
    if not row.district:
        return province, regency, None, methods
    scoped_alias = SCOPED_DISTRICT_ALIASES.get(
        (regency.key, canonical(row.district))
    )
    if scoped_alias is not None:
        district, _method = resolve_region(
            scoped_alias,
            hierarchy.districts_by_regency.get(regency.key, []),
            canonical,
        )
        method = "alias" if district is not None else None
    else:
        district, method = resolve_region(
            row.district,
            hierarchy.districts_by_regency.get(regency.key, []),
            canonical_district,
        )
    if district is not None:
        methods.append(method or "exact")
    return province, regency, district, methods


def match_admin_level(
    source_order: Sequence[str],
    catalogs: dict[str, list[SourceRow]],
    hierarchy: Hierarchy,
    level: str,
) -> tuple[dict[str, list[MatchRef]], dict[str, Any]]:
    matches: dict[str, list[MatchRef]] = {}
    counts: Counter[str] = Counter()
    source_unresolved: Counter[str] = Counter()
    for source_id in source_order:
        candidates: dict[str, list[tuple[SourceRow, str]]] = defaultdict(list)
        for row in catalogs[source_id]:
            province, regency, district, methods = resolve_parent(row, hierarchy)
            target = regency if level == "regency" else district
            if target is None:
                source_unresolved[source_id] += 1
                continue
            method = "alias" if "alias" in methods else ("compact" if "compact" in methods else "exact")
            candidates[target.key].append((row, method))
        for target_key, rows in candidates.items():
            if target_key in matches:
                continue
            # Multiple polygon records carrying the same resolved identity are
            # retained as parts and dissolved, rather than one overwriting the
            # other.
            method = "alias" if any(item[1] == "alias" for item in rows) else (
                "compact" if any(item[1] == "compact" for item in rows) else "exact"
            )
            matches[target_key] = [
                MatchRef(source_id, row.fid, method, row.regency if level == "regency" else row.district)
                for row, _ in rows
            ]
            counts[f"{source_id}:{method}"] += 1

    expected = hierarchy.regencies if level == "regency" else hierarchy.districts
    missing = [region.key for region in expected if region.key not in matches]
    return matches, {
        "matched": len(matches),
        "expected": len(expected),
        "unmatched": len(missing),
        "unmatched_keys": missing,
        "by_source_method": dict(sorted(counts.items())),
        "source_rows_unresolved": dict(sorted(source_unresolved.items())),
    }


def leaf_lookup(regions: Sequence[Region], compact_mode: bool = False) -> dict[str, Region | None]:
    return unique_index(regions, compact if compact_mode else canonical)


def match_villages(
    source_order: Sequence[str],
    catalogs: dict[str, list[SourceRow]],
    hierarchy: Hierarchy,
) -> tuple[dict[str, MatchRef], dict[str, Any]]:
    matches: dict[str, MatchRef] = {}
    used: set[tuple[str, int]] = set()
    blocked: set[tuple[str, int]] = set()
    counts: Counter[str] = Counter()
    ambiguities: Counter[str] = Counter()
    unresolved_parent: Counter[str] = Counter()

    for source_id in source_order:
        rows = catalogs[source_id]
        resolved: list[tuple[SourceRow, Region, Region | None]] = []
        for row in rows:
            _province, regency, district, _methods = resolve_parent(row, hierarchy)
            if regency is None or not canonical(row.village):
                unresolved_parent[source_id] += 1
                continue
            resolved.append((row, regency, district))

        # Full hierarchy, exact village name.  Both source identity and target
        # identity must be unique; competing rows are deliberately rejected.
        for compact_mode, method in ((False, "full_exact"), (True, "full_compact")):
            candidate_rows: dict[str, list[SourceRow]] = defaultdict(list)
            for row, _regency, district in resolved:
                identity = (source_id, row.fid)
                if district is None or identity in used or identity in blocked:
                    continue
                lookup = leaf_lookup(
                    hierarchy.villages_by_district.get(district.key, []),
                    compact_mode,
                )
                key = compact(row.village) if compact_mode else canonical(row.village)
                target = lookup.get(key)
                if target is not None:
                    if target.key in matches:
                        # This source feature describes a target already
                        # supplied by a higher-priority dataset.  It must not
                        # be recycled onto a different same-named target by
                        # the regency-only fallback below.
                        blocked.add(identity)
                    else:
                        candidate_rows[target.key].append(row)
            for target_key, candidates in candidate_rows.items():
                if len(candidates) != 1:
                    ambiguities[f"{source_id}:{method}"] += 1
                    blocked.update((source_id, row.fid) for row in candidates)
                    continue
                row = candidates[0]
                matches[target_key] = MatchRef(source_id, row.fid, method, row.village)
                used.add((source_id, row.fid))
                counts[f"{source_id}:{method}"] += 1

        # Conservative fallback for renamed/split district labels: a village
        # name must be unique on both sides within the already resolved
        # regency.  This never crosses a regency boundary.
        for compact_mode, method in ((False, "regency_unique_exact"), (True, "regency_unique_compact")):
            source_groups: dict[tuple[str, str], list[SourceRow]] = defaultdict(list)
            for row, regency, _district in resolved:
                # As with the target side, cardinality is global within the
                # resolved regency.  A source name must not become "unique"
                # merely because its same-named sibling was consumed earlier.
                name = compact(row.village) if compact_mode else canonical(row.village)
                source_groups[(regency.key, name)].append(row)
            target_groups: dict[tuple[str, str], list[Region]] = defaultdict(list)
            for regency in hierarchy.regencies:
                for target in hierarchy.villages_by_regency.get(regency.key, []):
                    # Uniqueness is evaluated against every KPU child in the
                    # regency.  Excluding already-matched siblings would make
                    # a duplicated name appear spuriously unique in the
                    # residual set and could attach geometry to the wrong ID.
                    name = compact(target.name) if compact_mode else canonical(target.name)
                    target_groups[(regency.key, name)].append(target)
            for identity, source_candidates in source_groups.items():
                target_candidates = target_groups.get(identity, [])
                if len(source_candidates) != 1 or len(target_candidates) != 1:
                    if target_candidates:
                        ambiguities[f"{source_id}:{method}"] += 1
                        blocked.update((source_id, row.fid) for row in source_candidates)
                    continue
                row = source_candidates[0]
                target = target_candidates[0]
                if (
                    target.key in matches
                    or (source_id, row.fid) in used
                    or (source_id, row.fid) in blocked
                ):
                    continue
                matches[target.key] = MatchRef(source_id, row.fid, method, row.village)
                used.add((source_id, row.fid))
                counts[f"{source_id}:{method}"] += 1

    missing = [region.key for region in hierarchy.villages if region.key not in matches]
    return matches, {
        "matched": len(matches),
        "expected": len(hierarchy.villages),
        "unmatched": len(missing),
        "unmatched_keys": missing,
        "by_source_method": dict(sorted(counts.items())),
        "ambiguous_groups_rejected": dict(sorted(ambiguities.items())),
        "source_rows_without_safe_parent": dict(sorted(unresolved_parent.items())),
    }


MODERN_VILLAGE_CODE = re.compile(r"^\d{2}\.\d{2}\.\d{2}\.\d{4}$")


def uupp_year(value: str) -> int | None:
    years = [int(year) for year in re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)", value)]
    return max(years) if years else None


def prefer_historic_village_geometry(
    matches: dict[str, MatchRef],
    audit: dict[str, Any],
    catalogs: dict[str, list[SourceRow]],
    hierarchy: Hierarchy,
) -> tuple[dict[str, MatchRef], dict[str, Any]]:
    """Bridge safe modern identity matches back to unique historical codes.

    The modern layer resolves spelling/parent changes, but its polygon is not
    automatically preferred.  A strict official-code bridge is accepted only
    when the dotted modern code is unique among selected fallbacks, the
    normalized historical code is unique, and that historical feature is not
    already assigned to another KPU target.
    """

    modern_by_fid = {
        (source_id, row.fid): row
        for source_id in MODERN_VILLAGE_SOURCES
        for row in catalogs[source_id]
    }
    historic_by_code: dict[str, list[SourceRow]] = defaultdict(list)
    for row in catalogs["desa2020"]:
        code = re.sub(r"\D", "", row.code)
        if len(code) == 10:
            historic_by_code[code].append(row)

    # Code uniqueness is evaluated inside one snapshot: the same village legally
    # carries the same code in both BIG extracts, so a cross-layer count would
    # reject every bridge.
    global_modern_codes: dict[str, Counter[str]] = {
        source_id: Counter(
            row.code
            for row in catalogs[source_id]
            if MODERN_VILLAGE_CODE.fullmatch(row.code)
        )
        for source_id in MODERN_VILLAGE_SOURCES
    }
    selected_modern_codes: dict[str, Counter[str]] = {
        source_id: Counter() for source_id in MODERN_VILLAGE_SOURCES
    }
    for ref in matches.values():
        if ref.source_id not in MODERN_VILLAGE_SOURCES:
            continue
        row = modern_by_fid[(ref.source_id, ref.fid)]
        if MODERN_VILLAGE_CODE.fullmatch(row.code):
            selected_modern_codes[ref.source_id][row.code] += 1

    updated = dict(matches)
    used_historic = {
        ref.fid for ref in updated.values() if ref.source_id == "desa2020"
    }
    blocked: Counter[str] = Counter()
    bridged_keys: list[str] = []
    crosswalk_changes: list[dict[str, Any]] = []
    for target_key, ref in matches.items():
        if ref.source_id not in MODERN_VILLAGE_SOURCES:
            continue
        modern = modern_by_fid[(ref.source_id, ref.fid)]
        if not MODERN_VILLAGE_CODE.fullmatch(modern.code):
            blocked["invalid_modern_code"] += 1
            continue
        if selected_modern_codes[ref.source_id][modern.code] != 1:
            blocked["nonunique_selected_modern_code"] += 1
            continue
        if global_modern_codes[ref.source_id][modern.code] != 1:
            blocked["nonunique_global_modern_code"] += 1
            continue
        normalized_code = re.sub(r"\D", "", modern.code)
        candidates = historic_by_code.get(normalized_code, [])
        if len(candidates) != 1:
            blocked["missing_or_nonunique_historic_code"] += 1
            continue
        historic = candidates[0]
        if historic.fid in used_historic:
            blocked["historic_feature_already_used"] += 1
            continue
        _modern_province, modern_regency, modern_district, _ = resolve_parent(
            modern, hierarchy
        )
        _historic_province, historic_regency, historic_district, _ = resolve_parent(
            historic, hierarchy
        )
        target_regency_key = target_key.rsplit(".", 2)[0]
        if modern_regency is None or modern_regency.key != target_regency_key:
            blocked["modern_parent_regency_mismatch"] += 1
            continue
        if historic_regency is None or historic_regency.key != target_regency_key:
            blocked["historic_parent_regency_mismatch"] += 1
            continue
        target = hierarchy.village_by_key[target_key]
        target_district_key = target.parent_key
        if historic_district is None or historic_district.key != target_district_key:
            crosswalk_changes.append(
                {
                    "target_key": target_key,
                    "target_name": target.name,
                    "target_district_key": target_district_key,
                    "historic_name": historic.village,
                    "historic_district_key": (
                        historic_district.key if historic_district is not None else None
                    ),
                    "modern_name": modern.village,
                    "modern_district_key": (
                        modern_district.key if modern_district is not None else None
                    ),
                    "official_code": modern.code,
                }
            )
        updated[target_key] = MatchRef(
            "desa2020",
            historic.fid,
            "historic_code_bridge",
            historic.village,
        )
        used_historic.add(historic.fid)
        bridged_keys.append(target_key)

    retained_modern: list[tuple[str, str, SourceRow]] = [
        (target_key, ref.source_id, modern_by_fid[(ref.source_id, ref.fid)])
        for target_key, ref in updated.items()
        if ref.source_id in MODERN_VILLAGE_SOURCES
    ]
    pre_2019: list[str] = []
    unknown: list[str] = []
    post_2019: list[str] = []
    by_source: dict[str, Counter[str]] = {
        source_id: Counter() for source_id in MODERN_VILLAGE_SOURCES
    }
    for target_key, source_id, row in retained_modern:
        year = uupp_year(row.legal_basis)
        if year is None:
            unknown.append(target_key)
            by_source[source_id]["uupp_year_unknown"] += 1
        elif year <= 2019:
            pre_2019.append(target_key)
            by_source[source_id]["uupp_year_lte_2019"] += 1
        else:
            post_2019.append(target_key)
            by_source[source_id]["uupp_year_after_2019"] += 1
    if post_2019:
        raise RuntimeError(
            f"Refusing {len(post_2019)} modern village fallbacks with UUPP after 2019"
        )

    counts = Counter(
        f"{ref.source_id}:{ref.method}" for ref in updated.values()
    )
    audit = dict(audit)
    audit["by_source_method"] = dict(sorted(counts.items()))
    audit["historic_code_bridge"] = {
        "bridged": len(bridged_keys),
        "method": (
            "globally unique dotted KDEPUM to unique digits-only "
            "kode_desa_spatial; same KPU regency and no source feature reuse"
        ),
        "geometry_vintage": "Kemendagri 2017 spatial base / 2020 name join",
        "same_kpu_regency_required": True,
        "renamed_or_reparented_crosswalks": sorted(
            crosswalk_changes, key=lambda item: item["target_key"]
        ),
        "blocked": dict(sorted(blocked.items())),
    }
    audit["modern_fallback_vintage"] = {
        "selected_features": len(retained_modern),
        "source_snapshots": {
            "desa2020big": "2020-03-26",
            "desa2023": "2023-05-28",
        },
        "by_source": {
            source_id: dict(sorted(counts.items()))
            for source_id, counts in by_source.items()
        },
        "uupp_year_lte_2019": len(pre_2019),
        "uupp_year_unknown": len(unknown),
        "uupp_year_after_2019": len(post_2019),
        "unknown_year_keys": sorted(unknown),
        "limitation": (
            "UUPP describes the feature's legal/source reference, not a "
            "guaranteed polygon survey date; unknown years remain explicit."
        ),
    }
    return updated, audit


def polygon_parts(geometry: Any) -> Iterator[Any]:
    if geometry is None or geometry.is_empty:
        return
    if geometry.geom_type == "Polygon":
        yield geometry
    elif geometry.geom_type == "MultiPolygon":
        yield from geometry.geoms
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from polygon_parts(part)


def clean_geometry(geometry: Any, tolerance: float, counters: Counter[str]) -> Any | None:
    if geometry is None or geometry.is_empty:
        counters["empty_source"] += 1
        return None
    geometry = shapely.force_2d(geometry)
    if not shapely.is_valid(geometry):
        counters["repaired_invalid"] += 1
        geometry = shapely.make_valid(geometry)
    parts = list(polygon_parts(geometry))
    if not parts:
        counters["non_polygon_after_repair"] += 1
        return None
    geometry = parts[0] if len(parts) == 1 else shapely.union_all(parts, grid_size=0.0000001)
    repaired_original = geometry
    geometry = shapely.simplify(geometry, tolerance, preserve_topology=True)
    if geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        counters["simplify_collapse_fallback"] += 1
        geometry = repaired_original
    if not shapely.is_valid(geometry):
        counters["repaired_after_simplify"] += 1
        geometry = shapely.make_valid(geometry)
        parts = list(polygon_parts(geometry))
        if not parts:
            counters["simplify_repair_fallback"] += 1
            geometry = repaired_original
        else:
            geometry = parts[0] if len(parts) == 1 else shapely.union_all(parts)
    try:
        geometry = shapely.set_precision(geometry, 0.00001, mode="valid_output")
    except shapely.errors.GEOSException:
        # A handful of source unions contain coincident rings for which GEOS
        # reports a side-location conflict only while snapping precision.
        # Preserve the repaired unsnapped polygon instead of dropping the
        # administrative unit.
        counters["precision_snap_skipped"] += 1
        geometry = repaired_original
    if geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        counters["precision_collapse_fallback"] += 1
        geometry = repaired_original
    if not shapely.is_valid(geometry):
        geometry = shapely.make_valid(geometry)
        parts = list(polygon_parts(geometry))
        geometry = parts[0] if len(parts) == 1 else shapely.union_all(parts, grid_size=0.0000001)
    if geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        counters["invalid_output"] += 1
        return None
    return geometry


def load_geometries(
    refs: Iterable[MatchRef],
    sources: dict[str, VectorSource],
) -> dict[tuple[str, int], Any]:
    grouped: dict[str, set[int]] = defaultdict(set)
    for ref in refs:
        grouped[ref.source_id].add(ref.fid)
    output: dict[tuple[str, int], Any] = {}
    for source_id, fid_set in grouped.items():
        fids = sorted(fid_set)
        if not fids:
            continue
        _metadata, returned_fids, wkbs, _arrays = ogr_raw.read(
            sources[source_id].path,
            columns=[],
            read_geometry=True,
            force_2d=True,
            fids=fids,
            return_fids=True,
        )
        geometries = shapely.from_wkb(wkbs, on_invalid="ignore")
        for fid, geometry in zip(returned_fids, geometries):
            output[(source_id, int(fid))] = geometry
    return output


def union_refs(
    refs: Sequence[MatchRef],
    loaded: dict[tuple[str, int], Any],
    tolerance: float,
    counters: Counter[str],
) -> Any | None:
    parts = [loaded.get((ref.source_id, ref.fid)) for ref in refs]
    parts = [part for part in parts if part is not None and not part.is_empty]
    if not parts:
        return None
    geometry = parts[0] if len(parts) == 1 else shapely.union_all(parts, grid_size=0.0000001)
    return clean_geometry(geometry, tolerance, counters)


def geometry_json(geometry: Any) -> dict[str, Any]:
    return json.loads(shapely.to_geojson(geometry))


def feature(region: Region, geometry: Any, source: str, method: str) -> dict[str, Any]:
    return {
        "type": "Feature",
        "properties": {
            "key": region.key,
            "name": region.name,
            "level": region.level,
            "source": source,
            "match": method,
        },
        "geometry": geometry_json(geometry),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    os.replace(temporary, path)


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def chunks(values: Sequence[Any], size: int) -> Iterator[Sequence[Any]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def materialize(
    stage: Path,
    hierarchy: Hierarchy,
    sources: dict[str, VectorSource],
    regency_matches: dict[str, list[MatchRef]],
    district_matches: dict[str, list[MatchRef]],
    village_matches: dict[str, MatchRef],
) -> dict[str, Any]:
    geometry_counts: Counter[str] = Counter()
    output_counts: Counter[str] = Counter()
    output_source_counts: Counter[str] = Counter()
    output_village_keys: set[str] = set()
    output_bounds = [math.inf, math.inf, -math.inf, -math.inf]
    validated_features = 0

    def render_feature(
        region: Region,
        geometry: Any,
        source_id: str,
        method: str,
    ) -> dict[str, Any]:
        nonlocal validated_features
        if (
            geometry is None
            or geometry.is_empty
            or geometry.geom_type not in {"Polygon", "MultiPolygon"}
            or not shapely.is_valid(geometry)
        ):
            raise RuntimeError(f"Invalid output geometry for {region.key}")
        min_x, min_y, max_x, max_y = geometry.bounds
        if not all(math.isfinite(value) for value in (min_x, min_y, max_x, max_y)):
            raise RuntimeError(f"Non-finite output bounds for {region.key}")
        output_bounds[0] = min(output_bounds[0], min_x)
        output_bounds[1] = min(output_bounds[1], min_y)
        output_bounds[2] = max(output_bounds[2], max_x)
        output_bounds[3] = max(output_bounds[3], max_y)
        validated_features += 1
        return feature(region, geometry, source_id, method)

    # Regency geometry is small enough to load once.  Province geometry is a
    # dissolve of those exact 2019 regency targets, avoiding a post-2019 Papua
    # province split.
    regency_refs = [ref for refs in regency_matches.values() for ref in refs]
    loaded_regencies = load_geometries(regency_refs, sources)
    regency_geometries: dict[str, Any] = {}
    for region in hierarchy.regencies:
        refs = regency_matches.get(region.key, [])
        geometry = union_refs(refs, loaded_regencies, 0.0012, geometry_counts)
        if geometry is not None:
            regency_geometries[region.key] = geometry
    del loaded_regencies

    for province in hierarchy.provinces:
        features: list[dict[str, Any]] = []
        for region in hierarchy.regencies_by_province.get(province.key, []):
            geometry = regency_geometries.get(region.key)
            refs = regency_matches.get(region.key, [])
            if geometry is None or not refs:
                continue
            source_ids = sorted({ref.source_id for ref in refs})
            method = "parts_union" if len(refs) > 1 else refs[0].method
            features.append(render_feature(region, geometry, "+".join(source_ids), method))
            output_counts["regency_features"] += 1
            output_source_counts[f"regency:{'+'.join(source_ids)}"] += 1
        write_json(stage / "kab" / f"{province.key}.json", collection(features))
        output_counts["regency_files"] += 1

    province_features: list[dict[str, Any]] = []
    for province in hierarchy.provinces:
        parts = [
            regency_geometries[region.key]
            for region in hierarchy.regencies_by_province.get(province.key, [])
            if region.key in regency_geometries
        ]
        if not parts:
            continue
        geometry = clean_geometry(
            shapely.union_all(parts, grid_size=0.0000001),
            0.0025,
            geometry_counts,
        )
        if geometry is None:
            continue
        province_features.append(
            render_feature(province, geometry, "derived-kabupaten-2019", "union")
        )
        output_counts["province_features"] += 1
    write_json(stage / "provinsi.json", collection(province_features))

    # Villages are read in district batches so the 80k historical geometries
    # never need to live in memory at once.
    derived_districts: dict[str, Any] = {}
    for district_batch in chunks(hierarchy.districts, 60):
        refs = [
            village_matches[village.key]
            for district in district_batch
            for village in hierarchy.villages_by_district.get(district.key, [])
            if village.key in village_matches
        ]
        loaded = load_geometries(refs, sources)
        for district in district_batch:
            features: list[dict[str, Any]] = []
            child_geometries: list[Any] = []
            children = hierarchy.villages_by_district.get(district.key, [])
            for village in children:
                ref = village_matches.get(village.key)
                if ref is None:
                    continue
                source_geometry = loaded.get((ref.source_id, ref.fid))
                geometry = clean_geometry(source_geometry, 0.0005, geometry_counts)
                if geometry is None:
                    continue
                features.append(render_feature(village, geometry, ref.source_id, ref.method))
                child_geometries.append(geometry)
                output_village_keys.add(village.key)
                output_counts["village_features"] += 1
                output_source_counts[f"village:{ref.source_id}:{ref.method}"] += 1
            write_json(stage / "desa" / f"{district.key}.json", collection(features))
            output_counts["village_files"] += 1
            if children and len(child_geometries) == len(children):
                derived = clean_geometry(
                    shapely.union_all(child_geometries, grid_size=0.0000001),
                    0.0007,
                    geometry_counts,
                )
                if derived is not None:
                    derived_districts[district.key] = derived
        del loaded

    # Direct historical/modern district boundaries are preferred.  A union of
    # village polygons is used only when every KPU child has a safe match.
    district_refs = [ref for refs in district_matches.values() for ref in refs]
    loaded_districts = load_geometries(district_refs, sources)
    district_geometries: dict[str, tuple[Any, str, str]] = {}
    for district in hierarchy.districts:
        refs = district_matches.get(district.key, [])
        geometry = union_refs(refs, loaded_districts, 0.0007, geometry_counts)
        if geometry is not None and refs:
            source_ids = "+".join(sorted({ref.source_id for ref in refs}))
            method = "parts_union" if len(refs) > 1 else refs[0].method
            district_geometries[district.key] = (geometry, source_ids, method)
        elif district.key in derived_districts:
            district_geometries[district.key] = (
                derived_districts[district.key],
                "derived-complete-villages",
                "union",
            )
    del loaded_districts

    for regency in hierarchy.regencies:
        features = []
        for district in hierarchy.districts_by_regency.get(regency.key, []):
            item = district_geometries.get(district.key)
            if item is None:
                continue
            geometry, source_id, method = item
            features.append(render_feature(district, geometry, source_id, method))
            output_counts["district_features"] += 1
            output_source_counts[f"district:{source_id}"] += 1
        write_json(stage / "kec" / f"{regency.key}.json", collection(features))
        output_counts["district_files"] += 1

    output_counts["district_derived_complete_villages"] = sum(
        source_id == "derived-complete-villages"
        for _, source_id, _ in district_geometries.values()
    )
    return {
        "counts": dict(sorted(output_counts.items())),
        "by_source_method": dict(sorted(output_source_counts.items())),
        "geometry_repairs": dict(sorted(geometry_counts.items())),
        "spatial_contract": {
            "crs": "EPSG:4326",
            "geometry_types": ["Polygon", "MultiPolygon"],
            "bbox": [round(value, 6) for value in output_bounds],
            "features_validated": validated_features,
            "invalid_output_geometries": 0,
        },
        "unmatched_after_geometry": {
            "regencies": [region.key for region in hierarchy.regencies if region.key not in regency_geometries],
            "districts": [region.key for region in hierarchy.districts if region.key not in district_geometries],
            "villages": [region.key for region in hierarchy.villages if region.key not in output_village_keys],
        },
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_inventory(source_root: Path, sources: dict[str, VectorSource]) -> list[dict[str, Any]]:
    public_paths: set[Path] = set()
    for source in sources.values():
        public_paths.update(source.public_paths)
        if source.id.endswith("2023"):
            base = source_root / source.public_paths[0]
            for suffix in (".shp", ".shx", ".dbf", ".prj", ".cpg", ".shp.xml"):
                candidate = base.with_suffix(suffix)
                if candidate.exists():
                    public_paths.add(candidate.relative_to(source_root))
    inventory = []
    for relative in sorted(public_paths, key=lambda value: value.as_posix()):
        path = source_root / relative
        if not path.is_file():
            continue
        inventory.append(
            {
                "path": relative.as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )
    return inventory


def tree_metrics(stage: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    files = sorted(
        path for path in stage.rglob("*.json")
        if path.name != "audit2019.json"
    )
    total = 0
    for path in files:
        relative = path.relative_to(stage).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                total += len(block)
                digest.update(block)
    return {"json_files": len(files), "bytes": total, "tree_sha256": digest.hexdigest()}


def install_transaction(stage: Path, output: Path) -> None:
    """Install a staged build without renaming live output directories.

    Windows keeps directory handles open while Explorer, an editor, or the
    development web server is browsing a directory.  Renaming ``kab``/``kec``
    /``desa`` therefore fails even though replacing their individual JSON
    files is safe.  Keep the public directories in place, replace each file
    atomically, and retain enough state to roll every replacement back if any
    one file is locked.
    """
    output.mkdir(parents=True, exist_ok=True)
    build_root = output / "_build"
    directory_names = ("kab", "kec", "desa")
    file_names = ("provinsi.json", "audit2019.json")
    obsolete_names = ("prov", "kecamatan.json", "kec_index.json")

    staged_files = {
        path.relative_to(stage)
        for path in stage.rglob("*")
        if path.is_file()
    }
    expected_roots = {*directory_names, *file_names}
    unexpected = sorted(
        rel.as_posix()
        for rel in staged_files
        if rel.parts[0] not in expected_roots or rel.suffix.lower() != ".json"
    )
    if unexpected:
        raise RuntimeError(f"Unexpected staged output files: {unexpected[:5]}")
    for name in file_names:
        if Path(name) not in staged_files:
            raise RuntimeError(f"Missing staged output file: {name}")

    transaction = build_root / f"backup-{uuid.uuid4().hex}"
    transaction.mkdir(parents=True)
    backup_root = transaction / "files"

    # Publish leaf collections before their parents. audit2019.json is the
    # commit marker and must be replaced last.
    install_priority = {"desa": 0, "kec": 1, "kab": 2, "provinsi.json": 3}
    install_order = sorted(
        (rel for rel in staged_files if rel != Path("audit2019.json")),
        key=lambda rel: (install_priority[rel.parts[0]], rel.as_posix()),
    )
    installed: list[tuple[Path, Path | None]] = []
    removed: list[tuple[Path, Path]] = []
    success = False
    rollback_complete = False

    def atomic_copy_replace(source: Path, target: Path) -> None:
        """Copy through a sibling so the published file inherits live ACLs."""
        temporary = target.with_name(f".{target.name}.install-{uuid.uuid4().hex}.tmp")
        try:
            with source.open("rb") as reader, temporary.open("xb") as writer:
                shutil.copyfileobj(reader, writer, length=1024 * 1024)
                writer.flush()
                os.fsync(writer.fileno())
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    def install_file(rel: Path) -> None:
        source = stage / rel
        target = output / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        backup: Path | None = None
        if target.exists():
            if not target.is_file():
                raise RuntimeError(f"Output target is not a file: {target}")
            backup = backup_root / "replaced" / rel
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup)
        atomic_copy_replace(source, target)
        installed.append((target, backup))

    try:
        for rel in install_order:
            install_file(rel)

        desired = staged_files
        stale_targets: list[Path] = []
        for name in directory_names:
            live_directory = output / name
            if live_directory.exists():
                stale_targets.extend(
                    path
                    for path in live_directory.rglob("*")
                    if path.is_file() and path.relative_to(output) not in desired
                )
        for name in obsolete_names:
            obsolete = output / name
            if obsolete.is_file():
                stale_targets.append(obsolete)
            elif obsolete.is_dir():
                stale_targets.extend(path for path in obsolete.rglob("*") if path.is_file())

        for target in sorted(stale_targets, key=lambda path: path.as_posix()):
            rel = target.relative_to(output)
            backup = backup_root / "removed" / rel
            backup.parent.mkdir(parents=True, exist_ok=True)
            os.replace(target, backup)
            removed.append((target, backup))

        # Remove now-empty obsolete directories from the leaves upward.  The
        # three live data directories are intentionally retained.
        for name in obsolete_names:
            obsolete = output / name
            if not obsolete.is_dir():
                continue
            directories = [path for path in obsolete.rglob("*") if path.is_dir()]
            for directory in sorted(directories, key=lambda path: len(path.parts), reverse=True):
                directory.rmdir()
            obsolete.rmdir()

        install_file(Path("audit2019.json"))
        success = True
    except Exception as install_error:
        rollback_errors: list[str] = []
        for target, backup in reversed(installed):
            try:
                if backup is not None and backup.exists():
                    atomic_copy_replace(backup, target)
                else:
                    target.unlink(missing_ok=True)
            except Exception as error:  # pragma: no cover - catastrophic OS lock
                rollback_errors.append(f"{target}: {error}")
        for target, backup in reversed(removed):
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                if backup.exists():
                    atomic_copy_replace(backup, target)
            except Exception as error:  # pragma: no cover - catastrophic OS lock
                rollback_errors.append(f"{target}: {error}")
        rollback_complete = not rollback_errors
        if rollback_errors:
            raise RuntimeError(
                "GIS installation failed and rollback was incomplete; backups "
                f"remain at {transaction}: {rollback_errors[:3]}"
            ) from install_error
        raise
    finally:
        if transaction.exists() and (success or rollback_complete):
            # Cleanup happens after the audit commit marker is public.  A
            # transient antivirus/indexer lock must not turn a committed build
            # into a false failure and trigger a retry with missing stage data.
            safe_marker = build_root / f".{transaction.name}.safe-to-delete"
            try:
                safe_marker.write_text("committed-or-rolled-back\n", encoding="ascii")
                shutil.rmtree(transaction)
                safe_marker.unlink(missing_ok=True)
            except OSError as error:
                print(
                    f"Warning: safe transaction cleanup deferred: {transaction} ({error})",
                    flush=True,
                )


def build(
    source_root: Path,
    hierarchy_path: Path,
    output: Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    hierarchy = load_hierarchy(hierarchy_path)
    if (len(hierarchy.provinces), len(hierarchy.regencies), len(hierarchy.districts), len(hierarchy.villages)) != (
        34,
        514,
        7201,
        83398,
    ):
        raise RuntimeError("Unexpected domestic KPU hierarchy counts")

    build_root = output / "_build"
    build_root.mkdir(parents=True, exist_ok=True)
    # A killed build can leave extracted multi-gigabyte sources behind.  Only
    # remove directories created by this builder and only inside _build.
    for stale in list(build_root.iterdir()):
        if stale.is_file() and stale.name.startswith(".backup-") and stale.name.endswith(
            ".safe-to-delete"
        ):
            transaction_name = stale.name[1 : -len(".safe-to-delete")]
            if not (build_root / transaction_name).exists():
                stale.unlink()
            continue
        if not stale.is_dir() or not stale.name.startswith(("sources-", "stage-", "backup-")):
            continue
        if stale.resolve().parent != build_root.resolve():
            raise RuntimeError(f"Refusing to clean unsafe build path: {stale}")
        if stale.name.startswith("backup-"):
            safe_marker = build_root / f".{stale.name}.safe-to-delete"
            if not safe_marker.is_file():
                raise RuntimeError(
                    "Unresolved GIS installation backup requires manual review: "
                    f"{stale}"
                )
        shutil.rmtree(stale)
        if stale.name.startswith("backup-"):
            safe_marker.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix="sources-", dir=build_root) as temporary_name:
        sources = prepare_sources(source_root, Path(temporary_name))
        spatial_sources = inspect_spatial_sources(sources)
        print("Reading source attributes ...", flush=True)
        catalogs = {source_id: read_rows(source) for source_id, source in sources.items()}
        source_feature_counts = {
            source_id: len(rows) for source_id, rows in catalogs.items()
        }

        # The 2020 BIG extract exists in this build only for its proximity to
        # 2019, so a feature created by a later law is not eligible at all --
        # neither as a polygon nor as an identity for the code bridge.  The
        # 2023 layer keeps its own retention-time gate instead, because it is
        # also the last-resort identity resolver.
        eligible_big_2020: list[SourceRow] = []
        rejected_big_2020 = 0
        for row in catalogs["desa2020big"]:
            year = uupp_year(row.legal_basis)
            if year is not None and year > 2019:
                rejected_big_2020 += 1
                continue
            eligible_big_2020.append(row)
        catalogs["desa2020big"] = eligible_big_2020

        regency_matches, regency_audit = match_admin_level(
            ("kab2018", "kab2023"), catalogs, hierarchy, "regency"
        )
        district_matches, district_audit = match_admin_level(
            ("kec2018", "kec2023"), catalogs, hierarchy, "district"
        )
        village_matches, village_audit = match_villages(
            ("desa2020", *MODERN_VILLAGE_SOURCES), catalogs, hierarchy
        )
        village_audit["uupp_ineligible_source_rows"] = {
            "desa2020big": rejected_big_2020
        }
        village_matches, village_audit = prefer_historic_village_geometry(
            village_matches, village_audit, catalogs, hierarchy
        )
        print(
            f"Matches: {len(regency_matches):,}/514 regencies, "
            f"{len(district_matches):,}/7,201 districts, "
            f"{len(village_matches):,}/83,398 villages",
            flush=True,
        )

        audit: dict[str, Any] = {
            "schema": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "methodology": {
                "identity_spine": "KPU 2019 hierarchy from data/wilayah.json",
                "claim": "historically aligned reconstruction; not a single official election-day snapshot",
                "source_priority": [
                    "Kemendagri 2018 semester I regency/district; provinces dissolved from regencies",
                    "Kemendagri 2020 semester I village GPKG",
                    "strict official-code bridge from modern identity to 2017/2020 village geometry",
                    "June 2023 repository regency/district shapefiles as unmatched-only fallback",
                    "March 2020 BIG village polygons, source rows with UUPP >2019 dropped",
                    "May 2023 BIG village polygons only with UUPP <=2019 or unknown",
                ],
                "match_method_rules": [
                    "exact",
                    "documented_alias",
                    "compact_unique",
                    "village_name_unique_across_all_KPU_children_within_regency",
                    "unique_official_village_code_bridge",
                ],
                "fuzzy_matching": False,
                "output_crs": "EPSG:4326 (all sources asserted before build)",
                "province_geometry": "dissolved from matched 2019 regency children",
                "overseas": "130 +Luar Negeri units are intentionally non-spatial",
            },
            "identity_spine_input": {
                "path": str(hierarchy_path.resolve()),
                "bytes": hierarchy_path.stat().st_size,
                "sha256": sha256_file(hierarchy_path),
            },
            "hierarchy": {
                "provinces": len(hierarchy.provinces),
                "regencies": len(hierarchy.regencies),
                "districts": len(hierarchy.districts),
                "villages": len(hierarchy.villages),
            },
            "source_features": {
                source_id: {
                    "features": source_feature_counts[source_id],
                    "eligible_rows": len(catalogs[source_id]),
                    "vintage": source.vintage,
                    **spatial_sources[source_id],
                }
                for source_id, source in sources.items()
            },
            "matching": {
                "regencies": regency_audit,
                "districts": district_audit,
                "villages": village_audit,
            },
        }
        if dry_run:
            print(json.dumps(audit, ensure_ascii=False, indent=2))
            return audit

        stage = Path(tempfile.mkdtemp(prefix="stage-", dir=build_root))
        try:
            print("Building staged GeoJSON ...", flush=True)
            audit["geometry_output"] = materialize(
                stage,
                hierarchy,
                sources,
                regency_matches,
                district_matches,
                village_matches,
            )
            print("Hashing selected source files and staged outputs ...", flush=True)
            audit["source_files"] = source_inventory(source_root, sources)
            audit["outputs"] = tree_metrics(stage)
            write_json(stage / "audit2019.json", audit)
            for attempt in range(6):
                try:
                    install_transaction(stage, output)
                    break
                except PermissionError:
                    if attempt == 5:
                        raise
                    delay = 2 * (attempt + 1)
                    print(
                        f"Output directory is temporarily locked; retrying "
                        f"transaction in {delay}s ...",
                        flush=True,
                    )
                    time.sleep(delay)
        finally:
            if stage.exists():
                shutil.rmtree(stage)

    print(
        f"Installed {audit['outputs']['json_files']:,} GeoJSON files "
        f"({audit['outputs']['bytes']:,} bytes) in {output}",
        flush=True,
    )
    return audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help="Folder containing the local SHP GIS collection",
    )
    parser.add_argument(
        "--hierarchy",
        type=Path,
        default=DEFAULT_HIERARCHY,
        help="Schema-2 KPU hierarchy JSON",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Output data/gis directory",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Audit identity matches without reading or writing geometry",
    )
    args = parser.parse_args()
    build(
        args.source.resolve(),
        args.hierarchy.resolve(),
        args.output.resolve(),
        args.dry_run,
    )


if __name__ == "__main__":
    main()
