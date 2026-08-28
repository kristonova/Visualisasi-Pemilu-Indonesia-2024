"""Regression checks for the generated 2024 election and GIS artifacts.

The 2024 dataset is keyed by Kemendagri codes rather than by the opaque KPU
2019 tokens, so the checks here are stricter than their 2019 counterparts: a
node key must literally be the code the shapefile carries, otherwise the map
would silently render nothing.

Every number the browser can display is recomputed from the village chunks and
compared with both the district roll-up and the audit, so a builder that drops
or double counts a TPS fails here rather than in a screenshot.
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterator

from shapely.geometry import shape
from shapely.validation import explain_validity


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GIS = DATA / "gis2024"

# Slot order inside every emitted row, mirroring ``CONTESTS`` in the builder.
# DPR RI carries only the 18 national parties: numbers 18–23 are the Aceh local
# parties, which by law contest the DPRA and DPRK ballots but never DPR RI.
# DPRD Provinsi keeps all 24 columns because the DPRA paper does print the six
# local parties; outside Aceh those columns are legitimately zero.
CONTESTS = [
    ("pilpres", ["paslon-1", "paslon-2", "paslon-3"]),
    ("dpr", [f"partai-{number}" for number in [*range(1, 18), 24]]),
    ("dprdprov", [f"partai-{number}" for number in range(1, 25)]),
]
ACEH_PROVINCE = "11"
ACEH_LOCAL_COLUMNS = [f"partai-{number}" for number in range(18, 24)]
CONTEST_IDS = [contest_id for contest_id, _columns in CONTESTS]
STATS = [
    "total-pemilih",
    "total-pengguna",
    "suara-total",
    "suara-sah",
    "suara-tidak-sah",
    "tps",
    "validated-tps",
    "blank-tps",
    "outlier-vote-tps",
]
DOMESTIC_VILLAGE = re.compile(r"^\d{2}\.\d{2}\.\d{2}\.\d{4}$")
OVERSEAS_VILLAGE = re.compile(r"^99\.[0-9A-Z]{2}\.[0-9A-Z]{2}\.[0-9A-Z]{4}$")
OVERSEAS_PROVINCE = "99"

# Generous WGS84 envelope around the Indonesian archipelago.
INDONESIA_BOUNDS = (90.0, -15.0, 145.0, 10.0)
GEOMETRY_TYPES = {"Polygon", "MultiPolygon"}


def load(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def flatten(raw: dict[str, Any]) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """key -> name, key -> parent key, key -> level name."""

    assert raw["schema"] == 2
    assert raw.get("key_prefix") == "", (
        "kunci 2024 harus tanpa awalan supaya sama dengan kode Kemendagri"
    )
    assert raw["contests"] == CONTEST_IDS, (
        "2024 memuat Pilpres, DPR RI, dan DPRD Provinsi; DPRD Kab/Kota belum di-scrape"
    )
    names: dict[str, str] = {}
    parents: dict[str, str] = {}
    levels: dict[str, str] = {}

    def add(key: str, name: str, parent: str | None, level: str) -> None:
        assert key not in names, f"kunci ganda: {key}"
        assert isinstance(name, str) and name.strip(), f"{key}: nama kosong"
        names[key] = name
        levels[key] = level
        if parent is not None:
            parents[key] = parent

    for province in raw["prov"]:
        province_key = province["k"]
        add(province_key, province["n"], None, "province")
        for regency in province["kab"]:
            regency_key = f"{province_key}.{regency['k']}"
            add(regency_key, regency["n"], province_key, "regency")
            for district in regency["kec"]:
                district_key = f"{regency_key}.{district['k']}"
                add(district_key, district["n"], regency_key, "district")
                for village in district["kel"]:
                    village_key = f"{district_key}.{village['k']}"
                    add(village_key, village["n"], district_key, "village")
    return names, parents, levels


def coordinate_positions(value: Any) -> Iterator[tuple[float, ...]]:
    assert isinstance(value, list) and value, "array koordinat tidak boleh kosong"
    if isinstance(value[0], (int, float)):
        assert len(value) >= 2, "posisi GeoJSON harus mempunyai x dan y"
        assert all(type(item) in (int, float) for item in value), (
            "koordinat harus angka, bukan string atau null"
        )
        yield tuple(float(item) for item in value)
        return
    for item in value:
        yield from coordinate_positions(item)


def check_geometry(raw: Any, context: str) -> None:
    assert isinstance(raw, dict), f"{context}: geometry harus object"
    assert raw.get("type") in GEOMETRY_TYPES, (
        f"{context}: tipe geometry {raw.get('type')!r} tidak diizinkan"
    )
    count = 0
    for position in coordinate_positions(raw.get("coordinates")):
        count += 1
        assert all(math.isfinite(value) for value in position), (
            f"{context}: koordinat tidak berhingga"
        )
    assert count > 0, f"{context}: geometry tanpa koordinat"
    geometry = shape(raw)
    assert geometry.geom_type in GEOMETRY_TYPES, f"{context}: {geometry.geom_type}"
    assert not geometry.is_empty, f"{context}: geometry kosong"
    assert geometry.is_valid, f"{context}: tidak valid: {explain_validity(geometry)}"
    assert geometry.area > 0, f"{context}: polygon tanpa luas"
    west, south, east, north = INDONESIA_BOUNDS
    min_x, min_y, max_x, max_y = geometry.bounds
    assert west <= min_x <= max_x <= east, f"{context}: bujur di luar Indonesia"
    assert south <= min_y <= max_y <= north, f"{context}: lintang di luar Indonesia"


def check_election(names, parents, levels) -> dict[str, Any]:
    election = load(DATA / "election2024.json")
    audit = load(DATA / "audit2024.json")
    assert election["schema"] == audit["schema"] == 2
    assert [contest["id"] for contest in election["contests"]] == CONTEST_IDS
    for slot, (contest_id, columns) in enumerate(CONTESTS):
        assert election["contests"][slot]["vote_columns"] == columns, (
            f"{contest_id}: kolom suara tidak sepadan surat suara"
        )
        assert audit["contests"][contest_id]["vote_columns"] == columns, (
            f"{contest_id}: kolom suara pada audit tidak sepadan election2024.json"
        )
    assert election["stats"] == STATS

    village_keys = {key for key, level in levels.items() if level == "village"}
    district_keys = {key for key, level in levels.items() if level == "district"}
    province_keys = {key for key, level in levels.items() if level == "province"}
    for key in village_keys:
        assert DOMESTIC_VILLAGE.match(key) or OVERSEAS_VILLAGE.match(key), (
            f"kunci desa {key} bukan kode Kemendagri"
        )
        if not key.startswith(f"{OVERSEAS_PROVINCE}."):
            assert DOMESTIC_VILLAGE.match(key), f"{key}: kode dalam negeri harus numerik"

    # Every province chunk must exist and the union of their leaves must be
    # exactly the hierarchy's village set.
    chunk_dir = DATA / "election2024"
    stems = {path.stem for path in chunk_dir.glob("*.json")}
    assert stems == province_keys, (
        f"chunk hasil tidak sepadan dengan provinsi; hilang={sorted(province_keys - stems)[:5]}, "
        f"asing={sorted(stems - province_keys)[:5]}"
    )

    # Each contest is recomputed in its own slot: a village missing from one
    # ballot carries `null` there, which must stay distinct from a row of zeroes.
    seen: set[str] = set()
    district_totals: dict[str, list[list[list[int]] | None]] = {}
    national_votes = {contest_id: [0] * len(columns) for contest_id, columns in CONTESTS}
    national_stats = {contest_id: [0] * len(STATS) for contest_id, _columns in CONTESTS}
    contest_villages = {contest_id: 0 for contest_id, _columns in CONTESTS}
    # The one column rule that varies by province: the six Aceh local parties
    # are printed on the DPRA paper and nowhere else, so their columns must be
    # zero outside province 11 and carry votes inside it.
    dprdprov_columns = dict(CONTESTS)["dprdprov"]
    local_indexes = [dprdprov_columns.index(column) for column in ACEH_LOCAL_COLUMNS]
    local_votes = {"aceh": 0, "elsewhere": 0}
    for province_key in sorted(province_keys):
        chunk = load(chunk_dir / f"{province_key}.json")
        assert chunk["schema"] == 2
        for village_key, entries in chunk["leaf"].items():
            assert village_key not in seen, f"desa ganda pada chunk: {village_key}"
            seen.add(village_key)
            assert village_key in village_keys, f"desa asing pada chunk: {village_key}"
            assert village_key.startswith(f"{province_key}."), (
                f"{village_key} berada pada chunk provinsi {province_key}"
            )
            assert len(entries) == len(CONTESTS), (
                f"{village_key}: setiap desa harus punya satu slot per kontes"
            )
            assert any(entry is not None for entry in entries), (
                f"{village_key}: tidak ada satu pun kontes yang memuat baris"
            )
            district_key = parents[village_key]
            row = district_totals.setdefault(district_key, [None] * len(CONTESTS))
            for slot, (contest_id, columns) in enumerate(CONTESTS):
                entry = entries[slot]
                if entry is None:
                    continue
                contest_villages[contest_id] += 1
                votes, stats = entry
                assert len(votes) == len(columns) and len(stats) == len(STATS), (
                    f"{village_key}/{contest_id}: jumlah kolom salah"
                )
                assert all(isinstance(value, int) and value >= 0 for value in votes + stats), (
                    f"{village_key}/{contest_id}: nilai negatif atau bukan bilangan bulat"
                )
                assert stats[5] >= stats[7], (
                    f"{village_key}/{contest_id}: TPS kosong melebihi jumlah TPS"
                )
                assert stats[5] >= stats[6], (
                    f"{village_key}/{contest_id}: TPS tervalidasi melebihi jumlah TPS"
                )
                if contest_id == "dprdprov":
                    where = "aceh" if province_key == ACEH_PROVINCE else "elsewhere"
                    local_votes[where] += sum(votes[index] for index in local_indexes)
                target = row[slot]
                if target is None:
                    target = row[slot] = [[0] * len(columns), [0] * len(STATS)]
                for index, value in enumerate(votes):
                    target[0][index] += value
                    national_votes[contest_id][index] += value
                for index, value in enumerate(stats):
                    target[1][index] += value
                    national_stats[contest_id][index] += value
    assert seen == village_keys, "chunk hasil dan hierarki memuat desa berbeda"
    assert local_votes["elsewhere"] == 0, (
        "partai lokal Aceh tidak tercetak di luar Aceh, jadi kolom 18–23 wajib nol"
    )
    assert local_votes["aceh"] > 0, (
        "surat suara DPRA memuat partai lokal, jadi kolom 18–23 wajib berisi di Aceh"
    )

    assert set(election["kec"]) == district_keys, "roll-up kecamatan tidak sepadan hierarki"
    assert set(district_totals) == district_keys, "ada kecamatan tanpa desa"
    for district_key, row in district_totals.items():
        assert election["kec"][district_key] == row, (
            f"{district_key}: roll-up kecamatan bukan jumlah desanya"
        )

    counts = audit["counts"]
    assert counts["provinces"] == len(province_keys)
    assert counts["districts"] == len(district_keys)
    assert counts["villages"] == len(village_keys)

    for contest_id, columns in CONTESTS:
        block = audit["contests"][contest_id]
        raw_votes = block["raw_totals"]["votes"]
        assert [raw_votes[column] for column in columns] == national_votes[contest_id], (
            f"{contest_id}: total suara nasional tidak sama dengan audit"
        )
        audit_stats = block["validated_totals"]["stats"]
        assert [audit_stats[name] for name in STATS] == national_stats[contest_id], (
            f"{contest_id}: total statistik nasional tidak sama dengan audit"
        )
        assert block["counts"]["villages"] == contest_villages[contest_id], (
            f"{contest_id}: jumlah desa pada audit tidak sama dengan slot terisi"
        )
        assert block["counts"]["tps_rows"] == national_stats[contest_id][5], (
            f"{contest_id}: jumlah TPS harus sama dengan baris sumber"
        )

        summary = election["source_summary"][contest_id]
        assert summary["total_tps"] == national_stats[contest_id][5]
        assert summary["reported_tps"] == (
            national_stats[contest_id][5] - national_stats[contest_id][7]
        )
        assert summary["note"], "cakupan Sirekap yang tidak penuh wajib dinyatakan di UI"
        assert summary["anomalies"]["blank_result_row"] == national_stats[contest_id][7], (
            f"{contest_id}: TPS kosong pada audit harus sama dengan stat blank-tps"
        )
        assert summary["villages"] == contest_villages[contest_id]
    return {
        "votes": national_votes,
        "stats": national_stats,
        "villages": len(village_keys),
        "districts": len(district_keys),
    }


def check_gis(names, parents, levels) -> None:
    audit = load(GIS / "audit2024.json")
    assert audit["schema"] == 2
    by_level = {
        level: {key for key, value in levels.items() if value == level}
        for level in ("province", "regency", "district", "village")
    }
    for folder, expected in (
        ("kab", by_level["province"]),
        ("kec", by_level["regency"]),
        ("desa", by_level["district"]),
    ):
        directory = GIS / folder
        assert directory.is_dir(), f"folder GIS hilang: {directory}"
        stems = {path.stem for path in directory.glob("*.json")}
        assert stems == expected, (
            f"{folder}: berkas tidak sepadan hierarki; "
            f"hilang={sorted(expected - stems)[:5]}, asing={sorted(stems - expected)[:5]}"
        )

    feature_counts: Counter[str] = Counter()
    seen: dict[str, set[str]] = {level: set() for level in by_level}
    paths = [GIS / "provinsi.json"]
    for folder in ("kab", "kec", "desa"):
        paths.extend(sorted((GIS / folder).glob("*.json")))
    for path in paths:
        relative = path.relative_to(GIS).as_posix()
        data = load(path)
        assert data.get("type") == "FeatureCollection", f"{relative}: bukan FeatureCollection"
        if relative == "provinsi.json":
            level, file_parent = "province", None
        else:
            level = {"kab": "regency", "kec": "district", "desa": "village"}[path.parent.name]
            file_parent = path.stem
        local: set[str] = set()
        for index, row in enumerate(data["features"]):
            context = f"{relative} feature {index}"
            assert row.get("type") == "Feature", f"{context}: bukan Feature"
            properties = row.get("properties")
            assert isinstance(properties, dict), f"{context}: properties harus object"
            key = properties.get("key")
            assert isinstance(key, str) and key, f"{context}: properties.key hilang"
            assert key in names, f"{context}: key asing {key}"
            assert levels[key] == level, f"{context}: {key} bukan tingkat {level}"
            assert properties.get("level") == level, f"{context}: properties.level salah"
            assert properties.get("name") == names[key], f"{context}: nama tidak sepadan hierarki"
            if file_parent is not None:
                assert parents[key] == file_parent, (
                    f"{context}: {key} bukan anak dari {file_parent}"
                )
            assert key not in local, f"{context}: key ganda dalam satu berkas"
            local.add(key)
            seen[level].add(key)
            feature_counts[level] += 1
            check_geometry(row.get("geometry"), context)

    # The overseas province has no polygon anywhere, and Papua's 2022 split
    # left a handful of villages the July 2026 shapefile does not carry.
    assert seen["province"] == by_level["province"] - {OVERSEAS_PROVINCE}, (
        "setiap provinsi dalam negeri harus punya poligon"
    )
    overseas_regencies = {key for key in by_level["regency"] if key.startswith(f"{OVERSEAS_PROVINCE}.")}
    assert seen["regency"] == by_level["regency"] - overseas_regencies, (
        "setiap kabupaten/kota dalam negeri harus punya poligon"
    )
    assert len(seen["regency"]) == 514, "Indonesia memiliki 514 kabupaten/kota"
    assert len(seen["province"]) == 38, "Indonesia memiliki 38 provinsi pada 2024"

    # Desa luar negeri tidak pernah masuk pencocokan: provinsinya memang tidak
    # punya poligon, jadi ketiadaannya bukan kegagalan pencocokan dan tidak
    # dicatat pada `unmatched_villages`.
    overseas_villages = {
        key for key in by_level["village"] if key.startswith(f"{OVERSEAS_PROVINCE}.")
    }
    domestic_villages = by_level["village"] - overseas_villages
    assert seen["village"].isdisjoint(overseas_villages), (
        "desa luar negeri tidak boleh mempunyai poligon"
    )
    missing_villages = domestic_villages - seen["village"]
    assert set(audit["unmatched_villages"]) == missing_villages, (
        "daftar desa tanpa geometri pada audit harus sama dengan yang benar-benar hilang"
    )
    assert len(missing_villages) / len(domestic_villages) < 0.01, (
        f"terlalu banyak desa dalam negeri tanpa geometri: {len(missing_villages)}"
    )
    assert feature_counts["village"] == audit["counts"]["village_features"]
    assert feature_counts["district"] == audit["counts"]["district_features"]
    assert feature_counts["regency"] == audit["counts"]["regency_features"]
    assert feature_counts["province"] == audit["counts"]["province_features"]
    print(
        f"  GIS: {feature_counts['province']} provinsi · {feature_counts['regency']} kab/kota · "
        f"{feature_counts['district']} kecamatan · {feature_counts['village']} desa · "
        f"{len(missing_villages)} desa tanpa geometri"
    )


def main() -> None:
    names, parents, levels = flatten(load(DATA / "wilayah2024.json"))
    totals = check_election(names, parents, levels)
    print(f"  hasil: {totals['villages']} desa · {totals['districts']} kecamatan")
    for contest_id, _columns in CONTESTS:
        print(
            f"    {contest_id}: {totals['stats'][contest_id][5]} TPS · "
            f"{sum(totals['votes'][contest_id])} suara"
        )
    if "--skip-gis" not in sys.argv:
        check_gis(names, parents, levels)
    print("test_2024_artifacts.py: hierarki, hasil, audit, dan GeoJSON 2024 konsisten")


if __name__ == "__main__":
    main()
