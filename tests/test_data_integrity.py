"""Regression checks for the generated 2019 election artifacts."""

from __future__ import annotations

import json
import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def load(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def empty_entry(vote_count: int, stat_count: int):
    return [[0] * vote_count, [0] * stat_count]


def add_entry(target, source):
    for index, value in enumerate(source[0]):
        target[0][index] += value
    for index, value in enumerate(source[1]):
        target[1][index] += value


def main() -> None:
    wilayah = load(DATA / "wilayah.json")
    election = load(DATA / "election2019.json")
    audit = load(DATA / "audit2019.json")

    assert wilayah["schema"] == election["schema"] == audit["schema"] == 2
    contest_ids = [contest["id"] for contest in election["contests"]]
    assert contest_ids == ["pilpres", "dpr", "dprdprov", "dprdkab"]
    assert wilayah["contests"] == contest_ids
    assert election["stats"] == [
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
    assert election["contests"][1]["vote_columns"] == [
        "pkb",
        "gerinda",
        "pdip",
        "golkar",
        "nasdem",
        "garuda",
        "berkarya",
        "pks",
        "perindo",
        "ppp",
        "psi",
        "pan",
        "hanura",
        "demokrat",
        "pa",
        "sira",
        "pda",
        "pna",
        "pbb",
        "pkpi",
    ]

    expected = {
        "pilpres": (342, 499_325, 320, 3_414, 42_455),
        "dpr": (138, 35_537, 5_771, 1_211, 10_528),
        "dprdprov": (734, 813_336, 79_093, 7_331, 83_528),
        "dprdkab": (733, 813_332, 119_589, 7_330, 83_527),
    }
    expected_suffixes = {
        "pilpres": set(range(1, 343)),
        "dpr": set(range(612, 750)),
        "dprdprov": set(range(0, 734)),
        "dprdkab": set(range(0, 733)),
    }
    for contest_id, (files, rows, blank, districts, villages) in expected.items():
        item = audit["contests"][contest_id]
        assert item["file_count"] == files
        assert item["rows_included"] == rows
        assert item["unique_ids"] == rows
        assert item["anomalies"]["blank_result_row"] == blank
        assert item["coverage"]["districts"] == districts
        assert item["coverage"]["villages"] == villages
        assert len(item["files"]) == files
        assert len({file["path"] for file in item["files"]}) == files
        assert all(len(file["sha256"]) == 64 for file in item["files"])
        suffixes = {
            int(re.search(r"-(\d+)\.csv$", file["path"]).group(1))
            for file in item["files"]
        }
        assert suffixes == expected_suffixes[contest_id]
        assert item["source_totals"]["votes"] == item["output_totals"]["votes"]
        assert item["validated_totals"]["stats"] == item["output_totals"]["stats"]

    assert audit["contests"]["pilpres"]["source_totals"]["votes"] == {
        "pemilih-1": 49_860_728,
        "pemilih-2": 44_510_144,
    }
    assert audit["contests"]["dpr"]["source_totals"]["votes"] == {
        "pkb": 502_556, "gerinda": 483_553, "pdip": 982_258,
        "golkar": 505_717, "nasdem": 991_234, "garuda": 57_771,
        "berkarya": 110_641, "pks": 266_622, "perindo": 184_431,
        "ppp": 121_664, "psi": 151_242, "pan": 481_929,
        "hanura": 188_492, "demokrat": 494_378, "pa": 0, "sira": 0,
        "pda": 0, "pna": 0, "pbb": 32_156, "pkpi": 35_195,
    }
    assert audit["contests"]["dprdprov"]["source_totals"]["votes"] == {
        "pkb": 12_697_005, "gerinda": 14_655_023, "pdip": 23_288_077,
        "golkar": 14_038_869, "nasdem": 8_818_823, "garuda": 755_857,
        "berkarya": 2_618_182, "pks": 10_170_611, "perindo": 3_398_342,
        "ppp": 5_890_291, "psi": 2_007_066, "pan": 8_176_837,
        "hanura": 3_309_021, "demokrat": 10_015_591, "pa": 537_811,
        "sira": 38_078, "pda": 85_169, "pna": 174_238,
        "pbb": 1_399_356, "pkpi": 695_074,
    }
    assert audit["contests"]["dprdkab"]["source_totals"]["votes"] == {
        "pkb": 13_041_194, "gerinda": 13_689_024, "pdip": 20_774_984,
        "golkar": 15_304_720, "nasdem": 9_763_472, "garuda": 673_838,
        "berkarya": 2_294_887, "pks": 9_119_505, "perindo": 3_445_143,
        "ppp": 7_192_488, "psi": 1_343_916, "pan": 8_465_117,
        "hanura": 4_556_285, "demokrat": 10_056_426, "pa": 459_218,
        "sira": 39_922, "pda": 85_573, "pna": 199_686,
        "pbb": 1_790_510, "pkpi": 1_039_131,
    }
    dpr_zero_files = {
        int(re.search(r"-(\d+)\.csv$", file["path"]).group(1))
        for file in audit["contests"]["dpr"]["files"]
        if file["rows"] == 0
    }
    assert dpr_zero_files == set(range(734, 750))

    assert audit["totals"]["result_csv_files"] == 1_947
    assert audit["totals"]["result_rows_read"] == 2_161_531
    assert audit["totals"]["result_rows_included"] == 2_161_530
    assert audit["totals"]["result_rows_rejected"] == 1
    assert audit["totals"]["support_csv_files"] == 7
    assert audit["totals"]["all_csv_files"] == 1_954
    assert audit["totals"]["all_csv_bytes"] == 1_068_772_711
    assert audit["contests"]["pilpres"]["anomalies"]["invalid_record"] == 1
    assert {
        contest_id: audit["contests"][contest_id]["output_totals"]["stats"]["outlier-vote-tps"]
        for contest_id in contest_ids
    } == {"pilpres": 0, "dpr": 1, "dprdprov": 56, "dprdkab": 31}
    assert len({item["sha256"] for item in audit["reference_files"]}) == 1
    assert len(audit["support_files"]) == 7
    assert len({item["path"] for item in audit["support_files"]}) == 7

    for output_name in ("wilayah.json", "election2019.json"):
        output_path = DATA / output_name
        output_audit = audit["outputs"][output_name]
        assert output_path.stat().st_size == output_audit["bytes"]
        assert sha256_file(output_path) == output_audit["sha256"]

    # When the original scrape is available, independently reconcile every
    # physical CSV against the builder inventory instead of trusting only the
    # hashes embedded in the generated audit.
    source_root = Path(audit["source_directory"])
    if source_root.is_dir():
        inventoried = {
            item["path"]: item
            for contest in audit["contests"].values()
            for item in contest["files"]
        }
        inventoried.update({item["path"]: item for item in audit["support_files"]})
        physical = {
            path.relative_to(source_root).as_posix(): path
            for path in source_root.rglob("*.csv")
        }
        assert len(inventoried) == 1_954
        assert physical.keys() == inventoried.keys()
        for relative, path in physical.items():
            expected_file = inventoried[relative]
            assert path.stat().st_size == expected_file["bytes"], relative
            assert sha256_file(path) == expected_file["sha256"], relative

    provinces = wilayah["prov"]
    regencies = [regency for province in provinces for regency in province["kab"]]
    districts = [district for regency in regencies for district in regency["kec"]]
    villages = [village for district in districts for village in district.get("kel", [])]
    assert len(provinces) == 35
    assert sum(not province["n"].startswith("+") for province in provinces) == 34
    assert len(regencies) == 644
    assert len(districts) == 7_331
    assert len(villages) == 83_528
    assert len(election["kec"]) == 7_331

    hierarchy_leaf_keys = set()
    for province in provinces:
        for regency in province["kab"]:
            for district in regency["kec"]:
                district_key = f"P{province['k']}.{regency['k']}.{district['k']}"
                for village in district.get("kel", []):
                    hierarchy_leaf_keys.add(f"{district_key}.{village['k']}")
    assert len(hierarchy_leaf_keys) == 83_528

    chunk_paths = sorted((DATA / "election2019").glob("P*.json"))
    assert len(chunk_paths) == 35
    assert sum(path.stat().st_size for path in chunk_paths) == audit["outputs"][
        "province_chunks"
    ]["bytes"]
    seen_leaf_keys = set()
    district_rollup = {}
    for path in chunk_paths:
        chunk = load(path)
        assert chunk["schema"] == 2
        for leaf_key, contest_entries in chunk["leaf"].items():
            assert leaf_key in hierarchy_leaf_keys
            assert leaf_key not in seen_leaf_keys
            seen_leaf_keys.add(leaf_key)
            district_key = leaf_key.rsplit(".", 1)[0]
            target_entries = district_rollup.setdefault(
                district_key, [None] * len(election["contests"])
            )
            for contest_index, entry in enumerate(contest_entries):
                if entry is None:
                    continue
                stats = entry[1]
                assert stats[1] <= stats[0], (
                    f"{leaf_key}: pengguna tervalidasi melebihi pemilih"
                )
                assert stats[6] + stats[7] <= stats[5]
                assert stats[8] <= stats[5]
                target = target_entries[contest_index]
                if target is None:
                    target = empty_entry(len(entry[0]), len(entry[1]))
                    target_entries[contest_index] = target
                add_entry(target, entry)
    assert seen_leaf_keys == hierarchy_leaf_keys
    assert district_rollup == election["kec"]

    # The only DPRD-kabupaten gap is the four-row Harare batch that exists in
    # DPRD-provinsi.  The leaf remains selectable and is explicitly missing in
    # just that contest rather than receiving synthetic values.
    harare = []
    for province in provinces:
        if province["n"].upper().lstrip("+ ") != "LUAR NEGERI":
            continue
        for regency in province["kab"]:
            if regency["n"].upper() != "ZIMBABWE":
                continue
            for district in regency["kec"]:
                if district["n"].upper() == "HARARE":
                    prefix = f"P{province['k']}.{regency['k']}.{district['k']}."
                    harare.extend(key for key in seen_leaf_keys if key.startswith(prefix))
    assert len(harare) == 1
    harare_chunk = load(DATA / "election2019" / f"P{harare[0].split('.')[0][1:]}.json")
    harare_entries = harare_chunk["leaf"][harare[0]]
    assert harare_entries[2] is not None
    assert harare_entries[2][1][5] == 4
    assert harare_entries[3] is None

    print("test_data_integrity.py: all generated election checks passed")


if __name__ == "__main__":
    main()
