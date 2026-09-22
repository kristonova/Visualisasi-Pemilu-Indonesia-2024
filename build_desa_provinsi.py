"""Merge every province's village chunks into one lightly simplified layer.

The browser's "Batas: Desa" mode colours every village of a province at once.
Reading the per-district chunks for that would cost one request per district
(666 for Jawa Timur), so this step writes one file per province instead:

* ``<gis>/desaprov/<province>.json``   every village polygon of one province

It reads the village chunks that ``build_gis_2024.py`` / ``build_gis_data.py``
already installed rather than the shapefile, so it runs in seconds and serves
both years. Each polygon is simplified once more at
``PROVINCE_VILLAGE_TOLERANCE``: at province and regency zoom a village is only a
few pixels wide, while the district view keeps loading the full-detail chunks.

Output is staged next to the GIS folder and installed only after it verifies:
one file per hierarchy province, and each file holds exactly the villages of
that province's ``desa/`` chunks.

    python build_desa_provinsi.py --gis-dir data/gis2024 --hierarchy data/wilayah2024.json
    python build_desa_provinsi.py --gis-dir data/gis --hierarchy data/wilayah.json
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

import shapely
from shapely.geometry import shape

from build_gis_2024 import Hierarchy, collection, simplify_geometry, write_json

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_GIS = PROJECT_DIR / "data" / "gis2024"
DEFAULT_HIERARCHY = PROJECT_DIR / "data" / "wilayah2024.json"
FOLDER = "desaprov"

# Twice the village tolerance: Jawa Timur drops from 7.4 MB to about 5 MB
# while a regency view (~1 px per 0.001 degree) still shows no faceting.
PROVINCE_VILLAGE_TOLERANCE = 0.001


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def districts_of(hierarchy: Hierarchy, province_key: str) -> list[str]:
    return [
        district_key
        for regency_key in hierarchy.regencies_by_province.get(province_key, [])
        for district_key in hierarchy.districts_by_regency.get(regency_key, [])
    ]


def build(gis_dir: Path, hierarchy_path: Path) -> dict[str, Any]:
    started = time.time()
    hierarchy = Hierarchy(load_json(hierarchy_path))
    source_dir = gis_dir / "desa"
    if not source_dir.is_dir():
        raise SystemExit(f"village chunks not found: {source_dir}")

    stage = gis_dir.parent / (gis_dir.name + "_stage_" + FOLDER)
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)

    counters: Counter[str] = Counter()
    missing_chunks: list[str] = []
    source_keys: dict[str, set[str]] = {}
    for province_key in hierarchy.province_names:
        features: list[dict[str, Any]] = []
        keys: set[str] = set()
        for district_key in districts_of(hierarchy, province_key):
            path = source_dir / f"{district_key}.json"
            if not path.exists():
                # The 2019 layer writes no chunk at all for overseas districts;
                # the province still gets a (possibly empty) file so the
                # browser never meets a 404.
                missing_chunks.append(district_key)
                continue
            for row in load_json(path)["features"]:
                key = row["properties"]["key"]
                if key in keys:
                    raise SystemExit(f"{province_key}: duplicate village {key}")
                keys.add(key)
                simplified = simplify_geometry(shape(row["geometry"]), PROVINCE_VILLAGE_TOLERANCE, counters)
                if simplified is None:
                    # Never drop a village the district view can draw.
                    counters["kept_source_geometry"] += 1
                    geometry = row["geometry"]
                else:
                    geometry = json.loads(shapely.to_geojson(simplified))
                features.append({"type": "Feature", "properties": dict(row["properties"]), "geometry": geometry})
        source_keys[province_key] = keys
        write_json(stage / f"{province_key}.json", collection(features))
        counters["features"] += len(features)

    verify_stage(stage, hierarchy, source_keys)
    target = gis_dir / FOLDER
    if target.exists():
        shutil.rmtree(target)
    shutil.move(str(stage), str(target))

    sizes = {path.stem: path.stat().st_size for path in target.glob("*.json")}
    largest = max(sizes, key=sizes.get)
    summary = {
        "provinces": len(sizes),
        "features": counters.pop("features"),
        "megabytes": round(sum(sizes.values()) / 1048576, 1),
        "largest": f"{largest} ({sizes[largest] / 1048576:.2f} MB)",
        "tolerance": PROVINCE_VILLAGE_TOLERANCE,
        "missing_district_chunks": len(missing_chunks),
        "missing_chunk_provinces": sorted({key.split(".")[0] for key in missing_chunks}),
        "geometry_repairs": dict(sorted(counters.items())),
        "seconds": round(time.time() - started, 1),
    }
    print(f"installed {target}", file=sys.stderr)
    return summary


def verify_stage(stage: Path, hierarchy: Hierarchy, source_keys: dict[str, set[str]]) -> None:
    """One file per province, holding exactly that province's village chunks."""

    stems = {path.stem for path in stage.glob("*.json")}
    if stems != set(hierarchy.province_names):
        raise SystemExit(f"province files differ from hierarchy: {sorted(stems ^ set(hierarchy.province_names))[:5]}")
    for province_key, expected in source_keys.items():
        data = load_json(stage / f"{province_key}.json")
        if data.get("type") != "FeatureCollection":
            raise SystemExit(f"{province_key}.json is not a FeatureCollection")
        keys = [row["properties"]["key"] for row in data["features"]]
        if len(keys) != len(set(keys)) or set(keys) != expected:
            raise SystemExit(f"{province_key}.json does not match its village chunks")
        for key in keys:
            if key not in hierarchy.village_names or not key.startswith(province_key + "."):
                raise SystemExit(f"{province_key}.json: foreign village {key}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--gis-dir", type=Path, default=DEFAULT_GIS)
    parser.add_argument("--hierarchy", type=Path, default=DEFAULT_HIERARCHY)
    args = parser.parse_args()
    summary = build(args.gis_dir.resolve(), args.hierarchy.resolve())
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
