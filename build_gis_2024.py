"""Build the 2024 GeoJSON layers from the Kemendagri village shapefile.

Unlike the 2019 pipeline, this build needs no name matching at the regency or
district level: the 2024 KPU village codes *are* Kemendagri codes, so the join
is ``KDEPUM`` with its dots removed against the ten character village code.
Higher levels are dissolved from the shapefile's own code prefixes, which keeps
regency and province outlines gapless even where the election tree and the
shapefile disagree about an individual village.

Dissolve order matters and is the reason this file exists rather than a flag on
``build_gis_data.py``: villages are unioned **before** they are simplified.
Simplifying first and unioning afterwards leaves a sliver behind every shared
edge, because two neighbours no longer agree on the vertices between them — it
inflated the province layer to 291k rings and 25 MB before this was fixed.

Outputs, mirroring the 2019 layout so the browser only has to swap a folder:

* ``data/gis2024/provinsi.json``
* ``data/gis2024/kab/<province>.json``     regencies of one province
* ``data/gis2024/kec/<regency>.json``      districts of one regency
* ``data/gis2024/desa/<district>.json``    villages of one district
* ``data/gis2024/audit2024.json``          match evidence and repair counters

Everything is staged and installed only after the whole build validates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterator, Sequence

import shapefile
import shapely
from pyogrio import raw as ogr_raw

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_SHP = (
    PROJECT_DIR
    / "SHP GIS"
    / "[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_"
    / "[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_.shp"
)
DEFAULT_HIERARCHY = PROJECT_DIR / "data" / "wilayah2024.json"
DEFAULT_OUTPUT = PROJECT_DIR / "data" / "gis2024"

# Same ladder of tolerances the 2019 build uses, so both years carry a
# comparable amount of coastline detail at every zoom level.
VILLAGE_TOLERANCE = 0.0005
DISTRICT_TOLERANCE = 0.0007
REGENCY_TOLERANCE = 0.0012
PROVINCE_TOLERANCE = 0.0025
GRID = 0.0000001

UNDEFINED_AREA = "Area Tidak Terdefinisi"
LEVEL_NAMES = {1: "province", 2: "regency", 3: "district", 4: "village"}


# ── helpers ──────────────────────────────────────────────────────────────────
def clean_name(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value if value is not None else ""))
    return re.sub(r"\s+", " ", text).strip()


def canonical(value: Any) -> str:
    text = unicodedata.normalize("NFKD", clean_name(value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]+", "", text.upper())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    os.replace(temporary, path)


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def polygon_parts(geometry: Any) -> Iterator[Any]:
    if geometry is None or geometry.is_empty:
        return
    if geometry.geom_type == "Polygon":
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from polygon_parts(part)


def repair(geometry: Any, counters: Counter[str]) -> Any | None:
    """Force 2D, make valid, and keep only the polygonal parts.

    No simplification happens here: everything that feeds a dissolve must keep
    the source vertices so shared edges stay bit-identical between neighbours."""

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
    return parts[0] if len(parts) == 1 else shapely.union_all(parts, grid_size=GRID)


def union_raw(parts: Sequence[Any]) -> Any | None:
    usable = [part for part in parts if part is not None and not part.is_empty]
    if not usable:
        return None
    return usable[0] if len(usable) == 1 else shapely.union_all(usable, grid_size=GRID)


def simplify_geometry(geometry: Any, tolerance: float, counters: Counter[str]) -> Any | None:
    """Simplify and precision-snap one already repaired geometry.

    Every fallback keeps the repaired input rather than dropping an
    administrative unit, matching ``build_gis_data.clean_geometry``."""

    if geometry is None or geometry.is_empty:
        counters["empty_source"] += 1
        return None
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
        counters["precision_snap_skipped"] += 1
        geometry = repaired_original
    if geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        counters["precision_collapse_fallback"] += 1
        geometry = repaired_original
    if not shapely.is_valid(geometry):
        geometry = shapely.make_valid(geometry)
        parts = list(polygon_parts(geometry))
        if not parts:
            counters["invalid_output"] += 1
            return None
        geometry = parts[0] if len(parts) == 1 else shapely.union_all(parts, grid_size=GRID)
    if geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        counters["invalid_output"] += 1
        return None
    return geometry


# ── inputs ───────────────────────────────────────────────────────────────────
class Hierarchy:
    """The election tree flattened into the keys the browser will ask for."""

    def __init__(self, raw: dict[str, Any]) -> None:
        if raw.get("schema") != 2:
            raise SystemExit("wilayah2024.json must be schema 2")
        self.prefix = raw.get("key_prefix", "P")
        self.province_names: dict[str, str] = {}
        self.regency_names: dict[str, str] = {}
        self.district_names: dict[str, str] = {}
        self.village_names: dict[str, str] = {}
        self.regencies_by_province: dict[str, list[str]] = defaultdict(list)
        self.districts_by_regency: dict[str, list[str]] = defaultdict(list)
        self.villages_by_district: dict[str, list[str]] = defaultdict(list)
        for province in raw.get("prov", []):
            province_key = f"{self.prefix}{province['k']}"
            self.province_names[province_key] = province["n"]
            for regency in province.get("kab", []):
                regency_key = f"{province_key}.{regency['k']}"
                self.regency_names[regency_key] = regency["n"]
                self.regencies_by_province[province_key].append(regency_key)
                for district in regency.get("kec", []):
                    district_key = f"{regency_key}.{district['k']}"
                    self.district_names[district_key] = district["n"]
                    self.districts_by_regency[regency_key].append(district_key)
                    for village in district.get("kel", []):
                        village_key = f"{district_key}.{village['k']}"
                        self.village_names[village_key] = village["n"]
                        self.villages_by_district[district_key].append(village_key)


def read_shapefile_index(shp_path: Path) -> tuple[dict[str, list[int]], dict[int, str], Counter[str]]:
    """``{village code: [fid]}`` plus ``{fid: NAMOBJ}`` for the whole layer.

    Features without a Kemendagri code are the shapefile's 967 "Area Tidak
    Terdefinisi" islets — 116 km² of the 1.89 million km² total.  They are not
    administrative units and are excluded from every level."""

    counters: Counter[str] = Counter()
    by_code: dict[str, list[int]] = defaultdict(list)
    names: dict[int, str] = {}
    dbf = shp_path.with_suffix(".dbf")
    with shapefile.Reader(dbf=str(dbf)) as reader:
        fields = [field[0] for field in reader.fields[1:]]
        index = {name: position for position, name in enumerate(fields)}
        for fid, record in enumerate(reader.iterRecords()):
            code = clean_name(record[index["KDEPUM"]])
            name = clean_name(record[index["NAMOBJ"]])
            counters["features"] += 1
            if not code:
                counters["skipped_no_code"] += 1
                if name == UNDEFINED_AREA:
                    counters["skipped_undefined_area"] += 1
                continue
            parts = code.split(".")
            if len(parts) != 4 or any(not part for part in parts):
                counters["skipped_malformed_code"] += 1
                continue
            by_code[code].append(fid)
            names[fid] = name
    counters["distinct_codes"] = len(by_code)
    counters["multi_part_codes"] = sum(1 for fids in by_code.values() if len(fids) > 1)
    return dict(by_code), names, counters


def read_geometries(shp_path: Path, fids: Sequence[int]) -> dict[int, Any]:
    if not fids:
        return {}
    _meta, returned, wkbs, _arrays = ogr_raw.read(
        str(shp_path),
        columns=[],
        read_geometry=True,
        force_2d=True,
        fids=sorted(fids),
        return_fids=True,
    )
    geometries = shapely.from_wkb(wkbs, on_invalid="ignore")
    return {int(fid): geometry for fid, geometry in zip(returned, geometries)}


def feature(key: str, name: str, level: int, geometry: Any, source: str, match: str) -> dict[str, Any]:
    return {
        "type": "Feature",
        "properties": {
            "key": key,
            "name": name,
            "level": LEVEL_NAMES[level],
            "source": source,
            "match": match,
        },
        "geometry": json.loads(shapely.to_geojson(geometry)),
    }


# ── build ────────────────────────────────────────────────────────────────────
def build(shp_path: Path, hierarchy_path: Path, output_dir: Path) -> dict[str, Any]:
    started = time.time()
    with hierarchy_path.open("r", encoding="utf-8") as handle:
        hierarchy = Hierarchy(json.load(handle))
    if hierarchy.prefix:
        # The whole join is "node key == Kemendagri code"; a prefix would break
        # it silently and produce an empty map instead of an error.
        raise SystemExit("wilayah2024.json must declare an empty key_prefix")
    print(
        f"hierarchy: {len(hierarchy.province_names)} provinces · "
        f"{len(hierarchy.regency_names)} regencies · {len(hierarchy.district_names)} districts · "
        f"{len(hierarchy.village_names)} villages",
        file=sys.stderr,
    )
    by_code, shp_names, source_counters = read_shapefile_index(shp_path)
    print(
        f"shapefile: {source_counters['features']} features · "
        f"{source_counters['distinct_codes']} coded villages · "
        f"{source_counters['skipped_no_code']} without a code",
        file=sys.stderr,
    )

    fids_by_shp_district: dict[str, list[int]] = defaultdict(list)
    shp_districts_by_regency: dict[str, list[str]] = defaultdict(list)
    fids_by_shp_regency: dict[str, list[int]] = defaultdict(list)
    for code, fids in by_code.items():
        district_key = code.rsplit(".", 1)[0]
        regency_key = district_key.rsplit(".", 1)[0]
        if district_key not in fids_by_shp_district:
            shp_districts_by_regency[regency_key].append(district_key)
        fids_by_shp_district[district_key].extend(fids)
        fids_by_shp_regency[regency_key].extend(fids)

    geometry_counters: Counter[str] = Counter()
    match_counters: Counter[str] = Counter()
    output_counters: Counter[str] = Counter()
    bounds = [math.inf, math.inf, -math.inf, -math.inf]
    validated = 0
    unmatched_villages: list[str] = []
    recovered_villages: list[str] = []

    stage = output_dir.parent / (output_dir.name + "_stage")
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)

    def emit(key: str, name: str, level: int, geometry: Any, source: str, match: str) -> dict[str, Any]:
        nonlocal validated
        if (
            geometry is None
            or geometry.is_empty
            or geometry.geom_type not in {"Polygon", "MultiPolygon"}
            or not shapely.is_valid(geometry)
        ):
            raise RuntimeError(f"invalid output geometry for {key}")
        min_x, min_y, max_x, max_y = geometry.bounds
        if not all(math.isfinite(value) for value in (min_x, min_y, max_x, max_y)):
            raise RuntimeError(f"non-finite bounds for {key}")
        bounds[0] = min(bounds[0], min_x)
        bounds[1] = min(bounds[1], min_y)
        bounds[2] = max(bounds[2], max_x)
        bounds[3] = max(bounds[3], max_y)
        validated += 1
        return feature(key, name, level, geometry, source, match)

    def assign_villages(regency_key: str, repaired: dict[int, Any]) -> dict[str, tuple[int, str]]:
        """Direct code match first, then a scoped name fallback: same regency,
        identical canonical village name, exactly one free candidate."""

        assigned: dict[str, tuple[int, str]] = {}
        used: set[int] = set()
        pending: list[str] = []
        for district_key in hierarchy.districts_by_regency.get(regency_key, []):
            for village_key in hierarchy.villages_by_district.get(district_key, []):
                fids = by_code.get(village_key)
                if fids:
                    assigned[village_key] = (fids[0], "code")
                    used.update(fids)
                    match_counters["village_by_code"] += 1
                else:
                    pending.append(village_key)
        if not pending:
            return assigned
        name_index: dict[str, list[int]] = defaultdict(list)
        for fid in repaired:
            name_index[canonical(shp_names.get(fid))].append(fid)
        for village_key in pending:
            candidates = [
                fid
                for fid in name_index.get(canonical(hierarchy.village_names[village_key]), [])
                if fid not in used
            ]
            if len(candidates) == 1:
                assigned[village_key] = (candidates[0], "name_in_regency")
                used.add(candidates[0])
                match_counters["village_by_name"] += 1
                recovered_villages.append(village_key)
            else:
                match_counters["village_unmatched"] += 1
                if len(candidates) > 1:
                    match_counters["village_name_ambiguous"] += 1
                unmatched_villages.append(village_key)
        return assigned

    province_features: list[dict[str, Any]] = []
    total_regencies = len(hierarchy.regency_names)
    done_regencies = 0
    for province_key in sorted(hierarchy.province_names):
        regency_features: list[dict[str, Any]] = []
        province_parts: list[Any] = []
        for regency_key in hierarchy.regencies_by_province.get(province_key, []):
            done_regencies += 1
            district_keys = hierarchy.districts_by_regency.get(regency_key, [])
            fids = fids_by_shp_regency.get(regency_key, [])
            if not fids:
                # Overseas PPLN regencies have no polygon anywhere; the browser
                # falls back to its grid view for them.
                match_counters["regency_without_geometry"] += 1
                for district_key in district_keys:
                    write_json(stage / "desa" / f"{district_key}.json", collection([]))
                    output_counters["village_files"] += 1
                write_json(stage / "kec" / f"{regency_key}.json", collection([]))
                output_counters["district_files"] += 1
                continue

            repaired: dict[int, Any] = {}
            for fid, geometry in read_geometries(shp_path, fids).items():
                cleaned = repair(geometry, geometry_counters)
                if cleaned is not None:
                    repaired[fid] = cleaned
            assigned = assign_villages(regency_key, repaired)

            # Unsimplified district unions: exact, so a later union of them
            # cancels every shared edge instead of leaving slivers.
            raw_districts: dict[str, Any] = {}
            for district_key in shp_districts_by_regency.get(regency_key, []):
                union = union_raw(
                    [repaired[fid] for fid in fids_by_shp_district[district_key] if fid in repaired]
                )
                if union is not None:
                    raw_districts[district_key] = union

            district_features: list[dict[str, Any]] = []
            for district_key in district_keys:
                features: list[dict[str, Any]] = []
                for village_key in hierarchy.villages_by_district.get(district_key, []):
                    item = assigned.get(village_key)
                    if item is None:
                        continue
                    geometry = repaired.get(item[0])
                    simplified = simplify_geometry(geometry, VILLAGE_TOLERANCE, geometry_counters)
                    if simplified is None:
                        match_counters["village_geometry_dropped"] += 1
                        continue
                    features.append(
                        emit(
                            village_key,
                            hierarchy.village_names[village_key],
                            4,
                            simplified,
                            "desakel-2026",
                            item[1],
                        )
                    )
                    output_counters["village_features"] += 1
                write_json(stage / "desa" / f"{district_key}.json", collection(features))
                output_counters["village_files"] += 1

                # A district the shapefile knows by code keeps the shapefile's
                # own partition; one it does not know falls back to whatever
                # villages were matched into it.
                if district_key in raw_districts:
                    source_geometry, method = raw_districts[district_key], "code_prefix"
                else:
                    source_geometry = union_raw(
                        [
                            repaired[assigned[village_key][0]]
                            for village_key in hierarchy.villages_by_district.get(district_key, [])
                            if village_key in assigned and assigned[village_key][0] in repaired
                        ]
                    )
                    method = "matched_villages"
                simplified = simplify_geometry(source_geometry, DISTRICT_TOLERANCE, geometry_counters)
                if simplified is None:
                    match_counters["district_without_geometry"] += 1
                    continue
                district_features.append(
                    emit(
                        district_key,
                        hierarchy.district_names[district_key],
                        3,
                        simplified,
                        "desakel-2026",
                        method,
                    )
                )
                match_counters[f"district_{method}"] += 1
                output_counters["district_features"] += 1
            write_json(stage / "kec" / f"{regency_key}.json", collection(district_features))
            output_counters["district_files"] += 1

            regency_raw = union_raw(list(raw_districts.values()))
            del repaired, raw_districts
            simplified = simplify_geometry(regency_raw, REGENCY_TOLERANCE, geometry_counters)
            if simplified is None:
                match_counters["regency_dissolve_failed"] += 1
                continue
            regency_features.append(
                emit(
                    regency_key,
                    hierarchy.regency_names[regency_key],
                    2,
                    simplified,
                    "desakel-2026",
                    "dissolved_villages",
                )
            )
            output_counters["regency_features"] += 1
            province_parts.append(regency_raw)
        write_json(stage / "kab" / f"{province_key}.json", collection(regency_features))
        output_counters["regency_files"] += 1

        province_raw = union_raw(province_parts)
        del province_parts
        simplified = simplify_geometry(province_raw, PROVINCE_TOLERANCE, geometry_counters)
        del province_raw
        if simplified is None:
            match_counters["province_without_geometry"] += 1
        else:
            province_features.append(
                emit(
                    province_key,
                    hierarchy.province_names[province_key],
                    1,
                    simplified,
                    "desakel-2026",
                    "dissolved_regencies",
                )
            )
            output_counters["province_features"] += 1
        print(
            f"  {province_key} {hierarchy.province_names[province_key]} · "
            f"{done_regencies}/{total_regencies} regencies ({time.time() - started:.0f}s)",
            file=sys.stderr,
        )
    write_json(stage / "provinsi.json", collection(province_features))

    audit = {
        "schema": 2,
        "generator": Path(__file__).name,
        "source": {
            "path": str(shp_path),
            "shp_bytes": shp_path.stat().st_size,
            "dbf_sha256": sha256_file(shp_path.with_suffix(".dbf")),
            "counts": dict(sorted(source_counters.items())),
        },
        "hierarchy": {
            "provinces": len(hierarchy.province_names),
            "regencies": len(hierarchy.regency_names),
            "districts": len(hierarchy.district_names),
            "villages": len(hierarchy.village_names),
        },
        "matching": dict(sorted(match_counters.items())),
        "counts": dict(sorted(output_counters.items())),
        "geometry_repairs": dict(sorted(geometry_counters.items())),
        "spatial_contract": {
            "crs": "EPSG:4326",
            "geometry_types": ["Polygon", "MultiPolygon"],
            "bbox": [round(value, 6) for value in bounds],
            "features_validated": validated,
            "invalid_output_geometries": 0,
        },
        "tolerances": {
            "village": VILLAGE_TOLERANCE,
            "district": DISTRICT_TOLERANCE,
            "regency": REGENCY_TOLERANCE,
            "province": PROVINCE_TOLERANCE,
        },
        "unmatched_villages": sorted(unmatched_villages),
        "recovered_villages": sorted(recovered_villages),
        "seconds": round(time.time() - started, 1),
    }
    write_json(stage / "audit2024.json", audit)

    verify_stage(stage, hierarchy)
    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.move(str(stage), str(output_dir))
    print(f"installed {output_dir} in {audit['seconds']}s", file=sys.stderr)
    return audit


def verify_stage(stage: Path, hierarchy: Hierarchy) -> None:
    """Every district must have a village chunk, every regency a district
    chunk, and every emitted key must exist in the election hierarchy."""

    provinces = json.loads((stage / "provinsi.json").read_text(encoding="utf-8"))
    if provinces["type"] != "FeatureCollection":
        raise SystemExit("provinsi.json is not a FeatureCollection")
    for row in provinces["features"]:
        if row["properties"]["key"] not in hierarchy.province_names:
            raise SystemExit(f"unknown province key {row['properties']['key']}")
    for province_key in hierarchy.province_names:
        path = stage / "kab" / f"{province_key}.json"
        if not path.exists():
            raise SystemExit(f"missing regency chunk for {province_key}")
        for row in json.loads(path.read_text(encoding="utf-8"))["features"]:
            if row["properties"]["key"] not in hierarchy.regency_names:
                raise SystemExit(f"unknown regency key {row['properties']['key']}")
    for regency_key in hierarchy.regency_names:
        path = stage / "kec" / f"{regency_key}.json"
        if not path.exists():
            raise SystemExit(f"missing district chunk for {regency_key}")
        for row in json.loads(path.read_text(encoding="utf-8"))["features"]:
            if row["properties"]["key"] not in hierarchy.district_names:
                raise SystemExit(f"unknown district key {row['properties']['key']}")
    for district_key in hierarchy.district_names:
        path = stage / "desa" / f"{district_key}.json"
        if not path.exists():
            raise SystemExit(f"missing village chunk for {district_key}")
        for row in json.loads(path.read_text(encoding="utf-8"))["features"]:
            if row["properties"]["key"] not in hierarchy.village_names:
                raise SystemExit(f"unknown village key {row['properties']['key']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shapefile", type=Path, default=DEFAULT_SHP)
    parser.add_argument("--hierarchy", type=Path, default=DEFAULT_HIERARCHY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    audit = build(args.shapefile.resolve(), args.hierarchy.resolve(), args.output.resolve())
    print(json.dumps({key: audit[key] for key in ("hierarchy", "matching", "counts")}, indent=2))
    print("repairs:", json.dumps(audit["geometry_repairs"], indent=2))
    print("unmatched villages:", len(audit["unmatched_villages"]))


if __name__ == "__main__":
    main()
