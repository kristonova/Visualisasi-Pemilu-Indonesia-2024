"""Regression checks for the generated, hierarchy-keyed GIS artifacts."""

from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, Iterator

from shapely.geometry import shape
from shapely.validation import explain_validity


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GIS = DATA / "gis"

# Generous WGS84 envelope around the Indonesian archipelago.  This catches a
# wrong CRS or an unrelated overseas polygon without clipping legitimate small
# islands near the national extremes.
INDONESIA_BOUNDS = (90.0, -15.0, 145.0, 10.0)
GEOMETRY_TYPES = {"Polygon", "MultiPolygon"}


def canonical(value: str) -> str:
    text = unicodedata.normalize("NFKD", value)
    text = text.encode("ascii", errors="ignore").decode("ascii").upper()
    text = text.replace("&", " DAN ")
    text = re.sub(r"\bKOTA\s+ADMINISTRASI\b", "ADMINISTRASI", text)
    text = re.sub(
        r"\bADM(?:INISTRASI)?\.?\s+KEP(?:ULAUAN)?\.?\b",
        "ADMINISTRASI KEPULAUAN",
        text,
    )
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return " ".join(text.split())


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def hierarchy() -> tuple[
    dict[str, str],
    dict[str, str],
    dict[str, str],
]:
    """Return domestic key->name, key->parent, and key->level mappings."""

    raw = load_json(DATA / "wilayah.json")
    assert raw["schema"] == 2
    assert len(raw["prov"]) == 35, "hierarki harus memuat 34 provinsi dan +Luar Negeri"

    names: dict[str, str] = {}
    parents: dict[str, str] = {}
    levels: dict[str, str] = {}

    for province in raw["prov"]:
        if str(province["n"]).startswith("+"):
            continue
        province_key = f"P{province['k']}"
        names[province_key] = str(province["n"])
        levels[province_key] = "province"
        for regency in province["kab"]:
            regency_key = f"{province_key}.{regency['k']}"
            names[regency_key] = str(regency["n"])
            parents[regency_key] = province_key
            levels[regency_key] = "regency"
            for district in regency["kec"]:
                district_key = f"{regency_key}.{district['k']}"
                names[district_key] = str(district["n"])
                parents[district_key] = regency_key
                levels[district_key] = "district"
                for village in district.get("kel", []):
                    village_key = f"{district_key}.{village['k']}"
                    names[village_key] = str(village["n"])
                    parents[village_key] = district_key
                    levels[village_key] = "village"

    expected_counts = {
        "province": 34,
        "regency": 514,
        "district": 7_201,
        "village": 83_399,
    }
    actual_counts = {
        level: sum(value == level for value in levels.values())
        for level in expected_counts
    }
    assert actual_counts == expected_counts
    assert len(names) == sum(expected_counts.values())
    assert set(names) == set(levels)
    assert set(parents) == set(names) - {
        key for key, level in levels.items() if level == "province"
    }
    return names, parents, levels


def coordinate_positions(value: Any) -> Iterator[tuple[float, ...]]:
    """Yield every coordinate position without allocating a flattened copy."""

    assert isinstance(value, list) and value, "array koordinat tidak boleh kosong"
    if type(value[0]) in (int, float):
        assert len(value) >= 2, "posisi GeoJSON harus mempunyai x dan y"
        assert all(type(item) in (int, float) for item in value), (
            "setiap ordinat harus berupa angka JSON"
        )
        yield tuple(float(item) for item in value)
        return
    for child in value:
        yield from coordinate_positions(child)


def validate_geometry(raw: Any, context: str) -> tuple[float, float, float, float]:
    assert isinstance(raw, dict), f"{context}: geometry harus object"
    assert raw.get("type") in GEOMETRY_TYPES, (
        f"{context}: tipe geometry tidak didukung: {raw.get('type')!r}"
    )
    positions = coordinate_positions(raw.get("coordinates"))
    coordinate_count = 0
    for position in positions:
        coordinate_count += 1
        assert all(math.isfinite(value) for value in position), (
            f"{context}: koordinat non-finite"
        )
    assert coordinate_count > 0, f"{context}: geometry tanpa koordinat"

    geometry = shape(raw)
    assert geometry.geom_type in GEOMETRY_TYPES, (
        f"{context}: Shapely membaca {geometry.geom_type}"
    )
    assert not geometry.is_empty, f"{context}: geometry kosong"
    assert geometry.is_valid, f"{context}: geometry tidak valid: {explain_validity(geometry)}"
    assert geometry.area > 0, f"{context}: polygon tidak mempunyai luas"

    min_x, min_y, max_x, max_y = geometry.bounds
    west, south, east, north = INDONESIA_BOUNDS
    assert all(math.isfinite(value) for value in geometry.bounds), (
        f"{context}: bbox non-finite"
    )
    assert west <= min_x <= max_x <= east, (
        f"{context}: bujur di luar bbox Indonesia: {geometry.bounds}"
    )
    assert south <= min_y <= max_y <= north, (
        f"{context}: lintang di luar bbox Indonesia: {geometry.bounds}"
    )
    return geometry.bounds


def public_paths() -> list[Path]:
    paths = [GIS / "provinsi.json"]
    paths.extend(sorted((GIS / "kab").glob("*.json")))
    paths.extend(sorted((GIS / "kec").glob("*.json")))
    paths.extend(sorted((GIS / "desa").glob("*.json")))
    return sorted(paths)


def main() -> None:
    names, parents, levels = hierarchy()
    expected_by_level = {
        level: {key for key, value in levels.items() if value == level}
        for level in ("province", "regency", "district", "village")
    }
    village_name_counts = Counter(
        (parents[key].rsplit(".", 1)[0], canonical(names[key]))
        for key in expected_by_level["village"]
    )
    village_compact_counts = Counter(
        (parent, name.replace(" ", ""))
        for (parent, name), count in village_name_counts.items()
        for _ in range(count)
    )

    assert (GIS / "provinsi.json").is_file()
    assert (GIS / "audit2019.json").is_file()
    assert not (GIS / "kecamatan.json").exists(), "GeoJSON monolitik lama harus dihapus"
    assert not (GIS / "kec_index.json").exists(), "indeks fuzzy/nama lama harus dihapus"
    assert not (GIS / "prov").exists(), "folder prov lama harus dihapus"

    expected_files = {
        "kab": expected_by_level["province"],
        "kec": expected_by_level["regency"],
        "desa": expected_by_level["district"],
    }
    for folder, expected_stems in expected_files.items():
        directory = GIS / folder
        assert directory.is_dir(), f"folder GIS hilang: {directory}"
        paths = sorted(directory.glob("*.json"))
        actual_stems = {path.stem for path in paths}
        assert len(paths) == len(actual_stems), f"{folder}: nama file duplikat"
        assert actual_stems == expected_stems, (
            f"{folder}: file tidak sama dengan parent hierarchy; "
            f"hilang={sorted(expected_stems - actual_stems)[:5]}, "
            f"asing={sorted(actual_stems - expected_stems)[:5]}"
        )

    assert len(expected_files["kab"]) == 34
    assert len(expected_files["kec"]) == 514
    assert len(expected_files["desa"]) == 7_201

    seen: dict[str, set[str]] = {
        level: set() for level in ("province", "regency", "district", "village")
    }
    feature_counts = {level: 0 for level in seen}
    digest = hashlib.sha256()
    byte_count = 0
    computed_bounds = [math.inf, math.inf, -math.inf, -math.inf]

    for path in public_paths():
        relative = path.relative_to(GIS).as_posix()
        encoded_relative = relative.encode("utf-8")
        payload = path.read_bytes()
        digest.update(len(encoded_relative).to_bytes(4, "big"))
        digest.update(encoded_relative)
        digest.update(payload)
        byte_count += len(payload)
        data = json.loads(payload)
        assert data.get("type") == "FeatureCollection", (
            f"{relative}: bukan FeatureCollection"
        )
        features = data.get("features")
        assert isinstance(features, list), f"{relative}: features harus array"

        if relative == "provinsi.json":
            expected_level = "province"
            file_parent = None
        else:
            folder = path.parent.name
            expected_level = {"kab": "regency", "kec": "district", "desa": "village"}[folder]
            file_parent = path.stem

        for index, feature in enumerate(features):
            context = f"{relative} feature {index}"
            assert isinstance(feature, dict) and feature.get("type") == "Feature", (
                f"{context}: bukan Feature"
            )
            properties = feature.get("properties")
            assert isinstance(properties, dict), f"{context}: properties harus object"
            key = properties.get("key")
            assert isinstance(key, str) and key, f"{context}: properties.key hilang"
            assert key in names, f"{context}: key asing {key}"
            assert levels[key] == expected_level, (
                f"{context}: level key {levels[key]} bukan {expected_level}"
            )
            assert properties.get("level") == expected_level, (
                f"{context}: properties.level salah"
            )
            assert properties.get("name") == names[key], (
                f"{context}: nama bukan nama hierarchy untuk {key}"
            )
            match_method = properties.get("match")
            if expected_level == "village" and match_method == "regency_unique_exact":
                assert village_name_counts[(parents[key].rsplit(".", 1)[0], canonical(names[key]))] == 1
            if expected_level == "village" and match_method == "regency_unique_compact":
                regency_key = parents[key].rsplit(".", 1)[0]
                assert village_compact_counts[(regency_key, canonical(names[key]).replace(" ", ""))] == 1
            if file_parent is not None:
                assert parents[key] == file_parent, (
                    f"{context}: parent {parents[key]} tidak sama dengan file {file_parent}"
                )
            assert key not in seen[expected_level], (
                f"{context}: key duplikat {key}"
            )
            seen[expected_level].add(key)
            feature_counts[expected_level] += 1
            min_x, min_y, max_x, max_y = validate_geometry(
                feature.get("geometry"), f"{context} ({key})"
            )
            computed_bounds[0] = min(computed_bounds[0], min_x)
            computed_bounds[1] = min(computed_bounds[1], min_y)
            computed_bounds[2] = max(computed_bounds[2], max_x)
            computed_bounds[3] = max(computed_bounds[3], max_y)

    assert seen["province"] == expected_by_level["province"]
    assert seen["regency"] == expected_by_level["regency"]
    assert seen["district"] == expected_by_level["district"]

    audit = load_json(GIS / "audit2019.json")
    assert audit.get("schema") == 1
    identity_spine = audit.get("identity_spine_input", {})
    hierarchy_path = DATA / "wilayah.json"
    assert identity_spine.get("bytes") == hierarchy_path.stat().st_size
    assert identity_spine.get("sha256") == hashlib.sha256(
        hierarchy_path.read_bytes()
    ).hexdigest()
    # 83,399 rather than 83,398: village keys are official KPU wilayah ids, so
    # the two same-named villages in Merlung are two nodes instead of one.
    assert audit.get("hierarchy") == {
        "provinces": 34,
        "regencies": 514,
        "districts": 7_201,
        "villages": 83_399,
    }
    geometry_audit = audit.get("geometry_output")
    assert isinstance(geometry_audit, dict), "audit geometry_output hilang"
    source_features = audit.get("source_features", {})
    assert len(source_features) == 7
    assert all(item.get("crs") == "EPSG:4326" for item in source_features.values())
    assert all(
        str(item.get("geometry_type", "")).startswith(("Polygon", "MultiPolygon"))
        for item in source_features.values()
    )
    assert not any(
        item.get("path", "").endswith("Batas Provinsi SHP.zip")
        for item in audit.get("source_files", [])
    )
    spatial_contract = geometry_audit.get("spatial_contract", {})
    assert spatial_contract.get("crs") == "EPSG:4326"
    assert spatial_contract.get("geometry_types") == ["Polygon", "MultiPolygon"]
    assert spatial_contract.get("features_validated") == sum(feature_counts.values())
    assert spatial_contract.get("invalid_output_geometries") == 0
    assert spatial_contract.get("bbox") == [round(value, 6) for value in computed_bounds]
    village_matching = audit.get("matching", {}).get("villages", {})

    # The March 2020 BIG extract only supplies village identity and polygons;
    # its rows whose UUPP postdates 2019 are dropped before matching.
    assert source_features["desa2020big"]["features"] == 117_182
    assert source_features["desa2020big"]["eligible_rows"] == 117_166
    assert village_matching.get("uupp_ineligible_source_rows") == {"desa2020big": 16}

    assert village_matching.get("matched") == 81_046
    assert village_matching.get("unmatched") == 2_353
    assert village_matching.get("historic_code_bridge", {}).get("bridged") == 1_034
    modern_vintage = village_matching.get("modern_fallback_vintage", {})
    assert modern_vintage.get("selected_features") == 185
    assert modern_vintage.get("uupp_year_lte_2019") == 178
    assert modern_vintage.get("uupp_year_unknown") == 7
    assert modern_vintage.get("uupp_year_after_2019") == 0
    # Every retained modern polygon is accounted for by snapshot, and the older
    # 2020 extract must carry the majority of them.
    assert modern_vintage.get("by_source") == {
        "desa2020big": {"uupp_year_lte_2019": 130, "uupp_year_unknown": 1},
        "desa2023": {"uupp_year_lte_2019": 48, "uupp_year_unknown": 6},
    }
    assert sum(
        count
        for counts in modern_vintage["by_source"].values()
        for count in counts.values()
    ) == modern_vintage["selected_features"]
    counts = geometry_audit.get("counts", {})
    assert counts.get("province_features") == feature_counts["province"]
    assert counts.get("regency_features") == feature_counts["regency"]
    assert counts.get("district_features") == feature_counts["district"]
    assert counts.get("village_features") == feature_counts["village"]
    assert counts.get("regency_files") == 34
    assert counts.get("district_files") == 514
    assert counts.get("village_files") == 7_201
    assert counts.get("district_features") == 7_201
    assert feature_counts["village"] == 81_046

    unmatched = geometry_audit.get("unmatched_after_geometry")
    assert isinstance(unmatched, dict), "audit unmatched_after_geometry hilang"
    for audit_name, level in (
        ("regencies", "regency"),
        ("districts", "district"),
        ("villages", "village"),
    ):
        raw_keys = unmatched.get(audit_name)
        assert isinstance(raw_keys, list), f"audit unmatched {audit_name} harus array"
        audit_keys = set(raw_keys)
        assert len(audit_keys) == len(raw_keys), f"audit unmatched {audit_name} duplikat"
        actual_missing = expected_by_level[level] - seen[level]
        assert audit_keys == actual_missing, (
            f"audit unmatched {audit_name} tidak sama dengan key output yang hilang; "
            f"audit-only={sorted(audit_keys - actual_missing)[:5]}, "
            f"output-only={sorted(actual_missing - audit_keys)[:5]}"
        )

    outputs = audit.get("outputs", {})
    assert outputs.get("json_files") == len(public_paths())
    assert outputs.get("bytes") == byte_count
    assert outputs.get("tree_sha256") == digest.hexdigest()

    print(
        "test_gis_integrity.py: hierarchy keys, files, audit, and all "
        f"{sum(feature_counts.values()):,} geometries passed"
    )


if __name__ == "__main__":
    main()
