"""Build the runtime artifacts for the 2024 presidential election.

Source of record is the KPU Sirekap scrape in ``data_pilpres/<prov>/<kab>.json``
produced by https://github.com/… scrapping-pemilu-2024.  Every village is keyed
by its Kemendagri (PUM) code, so the emitted node keys are literally
``11.01.01.2015`` and join to the Kemendagri village shapefile without any name
matching.  That is the whole reason the 2024 tree does not reuse the opaque KPU
2019 tokens: the 2019 hierarchy carries no Kemendagri code at all.

Outputs, mirroring the schema 2 contract already used by the 2019 artifacts:

* ``data/wilayah2024.json``      hierarchy (prov → kab → kec → kel)
* ``data/election2024.json``     contests, stat names, district roll-up, audit
* ``data/election2024/<prov>.json``  village level results, one chunk per province
* ``data/audit2024.json``        per-file inventory and anomaly evidence

The writer is transactional: everything is staged next to the destination and
moved into place only after the whole build succeeds.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_SOURCE = Path(r"D:\PROJECT\scrapping-pemilu-2024")
DEFAULT_OUTPUT = PROJECT_DIR / "data"
DEFAULT_SHP = (
    PROJECT_DIR
    / "SHP GIS"
    / "[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_"
    / "[LapakGIS.com]_BATAS_DESAKEL_AR_EDISI_JULI_2026_.dbf"
)

SCHEMA = 2
CONTEST_ID = "pilpres"

# KPU option ids for the three 2024 presidential tickets, in ballot order.  The
# ids are the raw keys of the Sirekap ``chart`` object; the columns are the
# stable names the browser reads.
PASLON = (
    ("100025", "paslon-1"),
    ("100026", "paslon-2"),
    ("100027", "paslon-3"),
)
VOTE_COLUMNS = tuple(column for _id, column in PASLON)

# Field names inside the Sirekap ``administrasi`` block, mapped to the same five
# stat columns the 2019 artifacts already use so the browser code is shared.
# ``total-pemilih`` is the DPT and ``total-pengguna`` counts DPT + DPTb + DPK
# voters, which is why turnout above 100% is possible and is not an anomaly.
STAT_SOURCE = (
    ("total-pemilih", "pemilih_dpt_j"),
    ("total-pengguna", "pengguna_total_j"),
    ("suara-total", "suara_total"),
    ("suara-sah", "suara_sah"),
    ("suara-tidak-sah", "suara_tidak_sah"),
)
STAT_COLUMNS = tuple(name for name, _field in STAT_SOURCE)
OUTPUT_STAT_COLUMNS = (
    *STAT_COLUMNS,
    "tps",
    "validated-tps",
    "blank-tps",
    "outlier-vote-tps",
)

# Papua's noken aggregation and the overseas POS/KSK ballots legitimately exceed
# an ordinary TPS-sized count; elsewhere a value above 1,000 is an OCR artifact.
LARGE_TPS_PROVINCES = frozenset({"91", "92", "93", "94", "95", "96", "99"})
OVERSEAS_PROVINCE = "99"

NOTE = (
    "Sumber Sirekap hanya menerbitkan angka hasil untuk sebagian TPS: KPU "
    "menghentikan penayangan konversi angka pada Maret 2024 dan menyisakan "
    "citra formulir C1 saja untuk sisanya. Angka pada dashboard ini adalah "
    "penjumlahan TPS yang masih memuat angka, bukan hasil resmi nasional."
)


# ── small helpers ────────────────────────────────────────────────────────────
def clean_name(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value if value is not None else ""))
    return re.sub(r"\s+", " ", text).strip()


def title_name(value: Any) -> str:
    return clean_name(value).upper()


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


def as_int(value: Any) -> tuple[int, bool]:
    """Return ``(value, missing)``.  Anything that is not a finite number is
    reported as missing rather than silently folded into a zero."""

    if isinstance(value, bool) or value is None:
        return 0, True
    if isinstance(value, int):
        return value, False
    if isinstance(value, float):
        return int(value), False
    text = str(value).strip()
    if not text:
        return 0, True
    try:
        return int(text), False
    except ValueError:
        return 0, True


def split_code(code: str) -> tuple[str, str, str, str] | None:
    """``11.01.01.2015`` segments of a ten-character KPU village code.

    Overseas codes such as ``99AA010001`` are not numeric but follow the same
    2/2/2/4 layout, so the slicing is shared."""

    text = str(code).strip()
    if len(text) != 10:
        return None
    return text[:2], text[2:4], text[4:6], text[6:]


def dotted(segments: Iterable[str]) -> str:
    return ".".join(segments)


# ── name sources ─────────────────────────────────────────────────────────────
def load_province_names(source_root: Path) -> dict[str, str]:
    path = source_root / "master_data" / "wilayah_provinsi.json"
    names: dict[str, str] = {}
    if not path.exists():
        return names
    with path.open("r", encoding="utf-8") as handle:
        for row in json.load(handle):
            code = clean_name(row.get("kode"))
            name = title_name(row.get("nama"))
            # The KPU master spells one province "P A P U A"; no other entry is
            # a run of single letters, so collapsing them is unambiguous.
            tokens = name.split()
            if len(tokens) > 1 and all(len(token) == 1 for token in tokens):
                name = "".join(tokens)
            if code:
                names[code] = name
    return names


def load_shapefile_names(dbf_path: Path) -> tuple[dict[str, str], dict[str, str]]:
    """Regency and district names keyed by dotted Kemendagri code.

    The village shapefile is the only local artifact that carries the 2024/2026
    Kemendagri names for every regency and district, including the six Papua
    provinces created in 2022."""

    regencies: dict[str, str] = {}
    districts: dict[str, str] = {}
    if not dbf_path.exists():
        return regencies, districts
    try:
        import shapefile  # type: ignore
    except ImportError:  # pragma: no cover - dependency is declared
        return regencies, districts
    with shapefile.Reader(dbf=str(dbf_path)) as reader:
        fields = [field[0] for field in reader.fields[1:]]
        index = {name: position for position, name in enumerate(fields)}
        for record in reader.iterRecords():
            code = clean_name(record[index["KDEPUM"]])
            if not code:
                continue
            parts = code.split(".")
            if len(parts) != 4:
                continue
            regency = ".".join(parts[:2])
            district = ".".join(parts[:3])
            regencies.setdefault(regency, title_name(record[index["WADMKK"]]))
            districts.setdefault(district, title_name(record[index["WADMKC"]]))
    return {k: v for k, v in regencies.items() if v}, {k: v for k, v in districts.items() if v}


# ── source scan ──────────────────────────────────────────────────────────────
class Scan:
    def __init__(self) -> None:
        self.village_votes: dict[str, list[int]] = {}
        self.village_stats: dict[str, list[int]] = {}
        self.village_name: dict[str, str] = {}
        self.anomalies: Counter[str] = Counter()
        self.examples: list[dict[str, Any]] = []
        self.files: list[dict[str, Any]] = []
        self.raw_vote_totals = [0] * len(VOTE_COLUMNS)
        self.raw_stat_totals = [0] * len(OUTPUT_STAT_COLUMNS)
        self.validated_stat_totals = [0] * len(OUTPUT_STAT_COLUMNS)
        self.rows = 0
        self.rejected = 0
        self.tps_codes_seen: set[str] = set()

    def add_example(self, kind: str, path: Path, payload: Any) -> None:
        if len(self.examples) >= 30:
            return
        self.examples.append(
            {"kind": kind, "file": path.name, "payload": json.dumps(payload, ensure_ascii=False)[:400]}
        )


def scan_source(pilpres_dir: Path) -> Scan:
    scan = Scan()
    files = sorted(
        path for path in pilpres_dir.rglob("*.json") if path.parent != pilpres_dir
    )
    if not files:
        raise SystemExit(f"No regency JSON found under {pilpres_dir}")
    for path in files:
        province_folder = path.parent.name
        regency_stem = path.stem
        rows_in_file = 0
        rejected_in_file = 0
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            scan.anomalies["file_not_object"] += 1
            scan.add_example("file_not_object", path, type(payload).__name__)
            continue
        for village_code, village in payload.items():
            segments = split_code(village_code)
            if segments is None:
                scan.anomalies["malformed_village_code"] += 1
                scan.add_example("malformed_village_code", path, village_code)
                continue
            if segments[0] != province_folder:
                scan.anomalies["province_folder_mismatch"] += 1
            if village_code[:4] != regency_stem:
                scan.anomalies["regency_file_mismatch"] += 1
            if village_code in scan.village_votes:
                scan.anomalies["duplicate_village"] += 1
                scan.add_example("duplicate_village", path, village_code)
            scan.village_name.setdefault(village_code, title_name(village.get("kel_name")))
            votes = scan.village_votes.setdefault(village_code, [0] * len(VOTE_COLUMNS))
            stats = scan.village_stats.setdefault(village_code, [0] * len(OUTPUT_STAT_COLUMNS))

            large_allowed = segments[0] in LARGE_TPS_PROVINCES
            results = village.get("tps_results")
            if not isinstance(results, list):
                scan.anomalies["tps_results_missing"] += 1
                continue
            declared = village.get("total_tps")
            if isinstance(declared, int) and declared != len(results):
                scan.anomalies["tps_count_mismatch"] += 1
            for record in results:
                scan.rows += 1
                rows_in_file += 1
                if not isinstance(record, dict):
                    scan.anomalies["tps_row_not_object"] += 1
                    scan.rejected += 1
                    rejected_in_file += 1
                    continue
                tps_code = clean_name(record.get("tps_code"))
                if tps_code:
                    if tps_code in scan.tps_codes_seen:
                        scan.anomalies["duplicate_tps_code"] += 1
                        scan.add_example("duplicate_tps_code", path, tps_code)
                    else:
                        scan.tps_codes_seen.add(tps_code)
                detail = record.get("detail")
                if not isinstance(detail, dict):
                    scan.anomalies["detail_missing"] += 1
                    scan.rejected += 1
                    rejected_in_file += 1
                    continue

                chart = detail.get("chart")
                raw_votes: list[int] = []
                votes_present = False
                for option_id, _column in PASLON:
                    value, missing = as_int(chart.get(option_id) if isinstance(chart, dict) else None)
                    if not missing:
                        votes_present = True
                    if value < 0:
                        scan.anomalies["negative_vote"] += 1
                    raw_votes.append(value)
                blank_votes = not votes_present
                if blank_votes:
                    scan.anomalies["blank_result_row"] += 1

                administrasi = detail.get("administrasi")
                raw_stats: list[int] = []
                stats_complete = isinstance(administrasi, dict)
                for _name, field in STAT_SOURCE:
                    value, missing = as_int(
                        administrasi.get(field) if isinstance(administrasi, dict) else None
                    )
                    if missing:
                        stats_complete = False
                    raw_stats.append(value)
                if not isinstance(administrasi, dict):
                    scan.anomalies["administrasi_missing_row"] += 1
                elif not stats_complete:
                    scan.anomalies["administrasi_partial_row"] += 1

                by_name = dict(zip(STAT_COLUMNS, raw_stats))
                vote_outlier = not large_allowed and any(value > 1000 for value in raw_votes)
                if vote_outlier:
                    scan.anomalies["outlier_vote_row"] += 1
                # The 2019 rule set minus its ``pengguna <= pemilih`` clause:
                # in 2024 the DPTb and DPK voters counted in ``pengguna_total_j``
                # are by definition absent from the DPT, so that inequality is
                # not a consistency error.  It is reported instead of enforced.
                stats_valid = (
                    stats_complete
                    and all(value >= 0 for value in raw_stats)
                    and (large_allowed or all(value <= 1000 for value in raw_stats))
                    and by_name["suara-total"]
                    == by_name["suara-sah"] + by_name["suara-tidak-sah"]
                    and by_name["total-pengguna"] == by_name["suara-total"]
                )
                if stats_complete and not stats_valid:
                    scan.anomalies["invalid_stats_row"] += 1
                if stats_complete:
                    if by_name["suara-total"] != by_name["suara-sah"] + by_name["suara-tidak-sah"]:
                        scan.anomalies["suara_total_ne_sah_plus_tidak_sah"] += 1
                    if by_name["total-pengguna"] != by_name["suara-total"]:
                        scan.anomalies["pengguna_ne_suara_total"] += 1
                    if by_name["total-pengguna"] > by_name["total-pemilih"]:
                        scan.anomalies["pengguna_gt_pemilih"] += 1
                    if not blank_votes and sum(raw_votes) != by_name["suara-sah"]:
                        scan.anomalies["option_sum_ne_suara_sah"] += 1

                counters = [1, int(stats_valid), int(blank_votes), int(vote_outlier)]
                # Corrupt metadata never reaches the turnout totals, exactly as
                # in the 2019 builder; the raw numbers survive in the audit.
                kept_stats = (raw_stats if stats_valid else [0] * len(STAT_COLUMNS)) + counters
                for index, value in enumerate(raw_votes):
                    votes[index] += value
                    scan.raw_vote_totals[index] += value
                for index, value in enumerate(kept_stats):
                    stats[index] += value
                    scan.validated_stat_totals[index] += value
                for index, value in enumerate(raw_stats + counters):
                    scan.raw_stat_totals[index] += value
        scan.files.append(
            {
                "path": path.relative_to(pilpres_dir).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "rows": rows_in_file,
                "rejected": rejected_in_file,
            }
        )
    return scan


# ── hierarchy ────────────────────────────────────────────────────────────────
def build_hierarchy(
    scan: Scan,
    province_names: dict[str, str],
    regency_names: dict[str, str],
    district_names: dict[str, str],
) -> tuple[list[dict[str, Any]], Counter[str]]:
    fallbacks: Counter[str] = Counter()
    provinces: dict[str, dict[str, dict[str, dict[str, str]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(dict))
    )
    for code in sorted(scan.village_votes):
        province, regency, district, village = split_code(code)  # type: ignore[misc]
        provinces[province][regency][district][village] = scan.village_name.get(code, "")

    tree: list[dict[str, Any]] = []
    for province_code in sorted(provinces):
        province_name = province_names.get(province_code)
        if not province_name:
            fallbacks["province_name"] += 1
            province_name = f"PROVINSI {province_code}"
        regency_nodes: list[dict[str, Any]] = []
        for regency_code in sorted(provinces[province_code]):
            regency_key = dotted((province_code, regency_code))
            districts = provinces[province_code][regency_code]
            regency_name = regency_names.get(regency_key)
            if not regency_name and province_code == OVERSEAS_PROVINCE:
                # Every overseas "regency" is exactly one PPLN city; its single
                # village name is the only real label the source carries.
                names = [
                    name
                    for district in districts.values()
                    for name in district.values()
                    if name
                ]
                regency_name = names[0] if len(set(names)) == 1 else ""
                if regency_name:
                    fallbacks["regency_name_from_village"] += 1
            if not regency_name:
                fallbacks["regency_name"] += 1
                regency_name = f"WILAYAH {regency_key}"
            district_nodes: list[dict[str, Any]] = []
            for district_code in sorted(districts):
                district_key = dotted((province_code, regency_code, district_code))
                villages = districts[district_code]
                district_name = district_names.get(district_key)
                if not district_name and province_code == OVERSEAS_PROVINCE:
                    names = [name for name in villages.values() if name]
                    district_name = names[0] if len(set(names)) == 1 else ""
                    if district_name:
                        fallbacks["district_name_from_village"] += 1
                if not district_name:
                    fallbacks["district_name"] += 1
                    district_name = f"KECAMATAN {district_key}"
                village_nodes = []
                for village_code in sorted(
                    villages, key=lambda item: (villages[item] or "", item)
                ):
                    name = villages[village_code]
                    if not name:
                        fallbacks["village_name"] += 1
                        name = f"DESA {district_key}.{village_code}"
                    village_nodes.append({"k": village_code, "n": name})
                district_nodes.append(
                    {"k": district_code, "n": district_name, "kel": village_nodes}
                )
            district_nodes.sort(key=lambda node: (node["n"], node["k"]))
            regency_nodes.append({"k": regency_code, "n": regency_name, "kec": district_nodes})
        regency_nodes.sort(key=lambda node: (node["n"], node["k"]))
        tree.append({"k": province_code, "n": province_name, "kab": regency_nodes})
    tree.sort(key=lambda node: (node["n"], node["k"]))
    return tree, fallbacks


# ── emit ─────────────────────────────────────────────────────────────────────
def village_entry(votes: list[int], stats: list[int]) -> list[list[int]]:
    return [votes, stats]


def build(source_root: Path, output_dir: Path, dbf_path: Path) -> dict[str, Any]:
    pilpres_dir = source_root / "data_pilpres"
    if not pilpres_dir.is_dir():
        raise SystemExit(f"Missing source directory: {pilpres_dir}")
    print(f"Reading {pilpres_dir} …", file=sys.stderr)
    scan = scan_source(pilpres_dir)
    print(
        f"  {len(scan.files)} files · {scan.rows:,} TPS rows · "
        f"{len(scan.village_votes):,} villages",
        file=sys.stderr,
    )

    province_names = load_province_names(source_root)
    regency_names, district_names = load_shapefile_names(dbf_path)
    print(
        f"  names: {len(province_names)} provinces · {len(regency_names)} regencies · "
        f"{len(district_names)} districts",
        file=sys.stderr,
    )
    tree, fallbacks = build_hierarchy(scan, province_names, regency_names, district_names)

    district_totals: dict[str, list[list[int]]] = {}
    province_leaves: dict[str, dict[str, list[list[int]]]] = defaultdict(dict)
    for code, votes in scan.village_votes.items():
        province, regency, district, village = split_code(code)  # type: ignore[misc]
        stats = scan.village_stats[code]
        village_key = dotted((province, regency, district, village))
        province_leaves[province][village_key] = [village_entry(votes, stats)]
        district_key = dotted((province, regency, district))
        target = district_totals.setdefault(
            district_key, [[0] * len(VOTE_COLUMNS), [0] * len(OUTPUT_STAT_COLUMNS)]
        )
        for index, value in enumerate(votes):
            target[0][index] += value
        for index, value in enumerate(stats):
            target[1][index] += value

    counts = {
        "provinces": len(tree),
        "regencies": sum(len(province["kab"]) for province in tree),
        "districts": sum(
            len(regency["kec"]) for province in tree for regency in province["kab"]
        ),
        "villages": len(scan.village_votes),
        "tps_rows": scan.rows,
    }

    audit = {
        "schema": SCHEMA,
        "generator": Path(__file__).name,
        "source_dir": str(pilpres_dir),
        "counts": counts,
        "raw_totals": {
            "votes": dict(zip(VOTE_COLUMNS, scan.raw_vote_totals)),
            "stats": dict(zip(OUTPUT_STAT_COLUMNS, scan.raw_stat_totals)),
        },
        # Vote counts are never gated by the metadata check, so the validated
        # vote totals are the raw ones by construction; only the five
        # participation stats differ between the two blocks.
        "validated_totals": {
            "votes": dict(zip(VOTE_COLUMNS, scan.raw_vote_totals)),
            "stats": dict(zip(OUTPUT_STAT_COLUMNS, scan.validated_stat_totals)),
        },
        "anomalies": dict(sorted(scan.anomalies.items())),
        "name_fallbacks": dict(sorted(fallbacks.items())),
        "examples": scan.examples,
        "files": scan.files,
        "note": NOTE,
    }

    reported_tps = scan.validated_stat_totals[5] - scan.validated_stat_totals[7]
    source_summary = {
        CONTEST_ID: {
            "files": len(scan.files),
            "rows": scan.rows,
            "districts": counts["districts"],
            "villages": counts["villages"],
            "reported_tps": reported_tps,
            "total_tps": scan.validated_stat_totals[5],
            "anomalies": dict(sorted(scan.anomalies.items())),
            "note": NOTE,
        }
    }

    election = {
        "schema": SCHEMA,
        "contests": [{"id": CONTEST_ID, "vote_columns": list(VOTE_COLUMNS)}],
        "stats": list(OUTPUT_STAT_COLUMNS),
        "kec": {key: [value] for key, value in sorted(district_totals.items())},
        "source_summary": source_summary,
    }
    wilayah = {
        "schema": SCHEMA,
        "key_prefix": "",
        "contests": [CONTEST_ID],
        "prov": tree,
    }

    stage = output_dir / "_stage2024"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    write_json(stage / "wilayah2024.json", wilayah)
    write_json(stage / "election2024.json", election)
    write_json(stage / "audit2024.json", audit)
    for province_code, leaves in sorted(province_leaves.items()):
        write_json(
            stage / "election2024" / f"{province_code}.json",
            {"schema": SCHEMA, "leaf": dict(sorted(leaves.items()))},
        )

    verify_stage(stage, election, wilayah)

    destination_leaf = output_dir / "election2024"
    if destination_leaf.exists():
        shutil.rmtree(destination_leaf)
    shutil.move(str(stage / "election2024"), str(destination_leaf))
    for name in ("wilayah2024.json", "election2024.json", "audit2024.json"):
        os.replace(stage / name, output_dir / name)
    shutil.rmtree(stage)

    print(
        "  wrote wilayah2024.json, election2024.json, audit2024.json and "
        f"{len(province_leaves)} province chunks",
        file=sys.stderr,
    )
    return audit


def verify_stage(stage: Path, election: dict[str, Any], wilayah: dict[str, Any]) -> None:
    """Re-read the staged artifacts and prove the district roll-up equals the
    sum of the village chunks before anything is installed."""

    with (stage / "election2024.json").open("r", encoding="utf-8") as handle:
        emitted = json.load(handle)
    districts = emitted["kec"]
    rebuilt: dict[str, list[list[int]]] = {}
    village_keys: set[str] = set()
    for chunk_path in sorted((stage / "election2024").glob("*.json")):
        with chunk_path.open("r", encoding="utf-8") as handle:
            chunk = json.load(handle)
        if chunk.get("schema") != SCHEMA:
            raise SystemExit(f"{chunk_path.name}: unsupported chunk schema")
        for village_key, entries in chunk["leaf"].items():
            if village_key in village_keys:
                raise SystemExit(f"duplicate village key {village_key}")
            village_keys.add(village_key)
            district_key = village_key.rsplit(".", 1)[0]
            target = rebuilt.setdefault(
                district_key, [[0] * len(VOTE_COLUMNS), [0] * len(OUTPUT_STAT_COLUMNS)]
            )
            for index, value in enumerate(entries[0][0]):
                target[0][index] += value
            for index, value in enumerate(entries[0][1]):
                target[1][index] += value
    if set(rebuilt) != set(districts):
        raise SystemExit("district roll-up and village chunks cover different districts")
    for key, entry in rebuilt.items():
        if districts[key][0] != entry:
            raise SystemExit(f"district roll-up mismatch at {key}")

    tree_villages = {
        dotted((province["k"], regency["k"], district["k"], village["k"]))
        for province in wilayah["prov"]
        for regency in province["kab"]
        for district in regency["kec"]
        for village in district["kel"]
    }
    if tree_villages != village_keys:
        raise SystemExit("hierarchy and result chunks disagree about the village set")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE,
                        help="scrapping-pemilu-2024 repository root")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT,
                        help="data directory of this project")
    parser.add_argument("--names-dbf", type=Path, default=DEFAULT_SHP,
                        help="village shapefile DBF used for regency/district names")
    args = parser.parse_args()
    audit = build(args.source.resolve(), args.output.resolve(), args.names_dbf.resolve())
    votes = audit["raw_totals"]["votes"]
    total = sum(votes.values())
    print(json.dumps(audit["counts"], indent=2))
    print("votes:", json.dumps(votes), "total:", f"{total:,}")
    print("anomalies:", json.dumps(audit["anomalies"], indent=2))
    print("name fallbacks:", json.dumps(audit["name_fallbacks"], indent=2))


if __name__ == "__main__":
    main()
