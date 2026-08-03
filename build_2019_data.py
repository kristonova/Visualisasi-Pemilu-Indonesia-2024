"""Build the complete 2019 election dataset used by the static visualisation.

The source scrape contains one row per TPS.  Raw numeric totals (including
source anomalies) are preserved in ``data/audit2019.json``.  Vote-option fields
are aggregated verbatim; participation metadata is aggregated only for rows
whose five rekap fields are internally consistent and within a documented
per-TPS bound.  Invalid source records are never silently repaired.

Outputs
-------
``data/wilayah.json``
    Complete KPU 2019 hierarchy, including every village found in any result
    CSV.
``data/election2019.json``
    Compact per-kecamatan aggregates for fast application start-up.
``data/election2019/P<province-code>.json``
    Exact per-village aggregates, loaded lazily by the browser.
``data/audit2019.json``
    Reproducible inventory, source hashes, coverage, totals, and anomalies.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from collections import Counter, OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_SOURCE_DIR = Path(r"D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\scrapping KPU")

PARTY_COLUMNS = (
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
)

GEO_COLUMNS = ("provinsi", "kabupaten", "kecamatan", "kelurahan")
STAT_COLUMNS = (
    "total-pemilih",
    "total-pengguna",
    "suara-total",
    "suara-sah",
    "suara-tidak-sah",
)
OUTPUT_STAT_COLUMNS = (
    *STAT_COLUMNS,
    "tps",
    "validated-tps",
    "blank-tps",
    "outlier-vote-tps",
)


@dataclass(frozen=True)
class Contest:
    id: str
    folder: str
    pattern: str
    vote_columns: tuple[str, ...]


CONTESTS = (
    Contest("pilpres", "Pilpres RI", "datakpu-*.csv", ("pemilih-1", "pemilih-2")),
    Contest("dpr", "Pileg DPR RI", "datakpu-dprri-*.csv", PARTY_COLUMNS),
    Contest(
        "dprdprov",
        "Pileg DPRD Provinsi",
        "datakpu-dprdprov-*.csv",
        PARTY_COLUMNS,
    ),
    Contest(
        "dprdkab",
        "Pileg DPRD KabKot",
        "datakpu-dprdkab-*.csv",
        PARTY_COLUMNS,
    ),
)

EXPECTED_HEADERS = {
    contest.id: (
        "id",
        *GEO_COLUMNS,
        "tps",
        "timestamp",
        *contest.vote_columns,
        *STAT_COLUMNS,
        *(('c1-1', 'c1-2') if contest.id == "pilpres" else tuple(f"c1-{i}" for i in range(1, 7))),
    )
    for contest in CONTESTS
}


def clean_name(value: Any) -> str:
    """Return the exact comparison form used for KPU administrative names."""

    return " ".join(str(value or "").strip().upper().split())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def json_bytes(data: Any) -> bytes:
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    return text.encode("utf-8")


def write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(json_bytes(data))
    os.replace(temporary, path)


def parse_int(value: Any) -> tuple[int, bool]:
    text = str(value or "").strip()
    if not text:
        return 0, False
    try:
        return int(text), False
    except ValueError:
        try:
            number = float(text)
            return int(number), number != int(number)
        except ValueError:
            return 0, True


def empty_entry(vote_count: int) -> list[list[int]]:
    return [[0] * vote_count, [0] * len(OUTPUT_STAT_COLUMNS)]


def add_entry(target: list[list[int]], source: list[list[int]]) -> None:
    for index, value in enumerate(source[0]):
        target[0][index] += value
    for index, value in enumerate(source[1]):
        target[1][index] += value


def total_entries(entries: Iterable[list[list[int]] | None], vote_count: int) -> list[list[int]]:
    total = empty_entry(vote_count)
    for entry in entries:
        if entry is not None:
            add_entry(total, entry)
    return total


def preview(value: Any, limit: int = 80) -> str:
    escaped = str(value or "").encode("unicode_escape", errors="backslashreplace").decode("ascii")
    return escaped[:limit] + ("..." if len(escaped) > limit else "")


def reference_paths(source_dir: Path) -> list[Path]:
    return sorted(source_dir.glob("*/dataprov-kec.csv"))


def audit_support_files(source_dir: Path) -> list[dict[str, Any]]:
    """Inventory all non-result CSVs (four hierarchy + three province lists)."""

    items = []
    for path in sorted(source_dir.glob("*/*.csv")):
        with path.open("r", encoding="utf-8-sig", errors="strict", newline="") as handle:
            reader = csv.reader(handle)
            header = next(reader, [])
            rows = sum(1 for row in reader if any(cell.strip() for cell in row))
        items.append(
            {
                "path": path.relative_to(source_dir).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "header": header,
                "rows": rows,
            }
        )
    if len(items) != 7:
        raise RuntimeError(f"Expected seven support CSVs, found {len(items)}")
    return items


def load_hierarchy(source_dir: Path) -> tuple[dict[str, Any], dict[tuple[str, str, str], tuple[str, str, str]], list[dict[str, Any]]]:
    paths = reference_paths(source_dir)
    if len(paths) != 4:
        raise RuntimeError(f"Expected four dataprov-kec.csv files, found {len(paths)}")

    reference_audit = []
    hashes = set()
    for path in paths:
        digest = sha256_file(path)
        hashes.add(digest)
        reference_audit.append(
            {
                "path": path.relative_to(source_dir).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": digest,
            }
        )
    if len(hashes) != 1:
        raise RuntimeError("The four dataprov-kec.csv reference files are not identical")

    provinces: OrderedDict[str, dict[str, Any]] = OrderedDict()
    geo_to_codes: dict[tuple[str, str, str], tuple[str, str, str]] = {}
    source_path = paths[0]
    with source_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        expected = ("kodeprov", "namaprov", "kodekab", "namakab", "kodekec", "namakec")
        if tuple(reader.fieldnames or ()) != expected:
            raise RuntimeError(f"Unexpected hierarchy header in {source_path}")
        for line_number, row in enumerate(reader, 2):
            pcode = str(row["kodeprov"]).strip()
            kcode = str(row["kodekab"]).strip()
            ccode = str(row["kodekec"]).strip()
            pdisplay = str(row["namaprov"]).strip()
            kdisplay = str(row["namakab"]).strip()
            cdisplay = str(row["namakec"]).strip()
            geo = (clean_name(pdisplay), clean_name(kdisplay), clean_name(cdisplay))
            if not all((*geo, pcode, kcode, ccode)):
                raise RuntimeError(f"Blank hierarchy field at {source_path}:{line_number}")

            codes = (pcode, kcode, ccode)
            previous = geo_to_codes.setdefault(geo, codes)
            if previous != codes:
                raise RuntimeError(f"Hierarchy name collision for {geo}: {previous} vs {codes}")

            province = provinces.setdefault(
                pcode,
                {"k": pcode, "n": pdisplay, "kab": OrderedDict()},
            )
            if clean_name(province["n"]) != geo[0]:
                raise RuntimeError(f"Province code {pcode} has conflicting names")
            regency = province["kab"].setdefault(
                kcode,
                {"k": kcode, "n": kdisplay, "kec": OrderedDict()},
            )
            if clean_name(regency["n"]) != geo[1]:
                raise RuntimeError(f"Regency code {kcode} has conflicting names")
            district = regency["kec"].setdefault(
                ccode,
                {"k": ccode, "n": cdisplay},
            )
            if clean_name(district["n"]) != geo[2]:
                raise RuntimeError(f"District code {ccode} has conflicting names")

    hierarchy = {"provinces": provinces}
    return hierarchy, geo_to_codes, reference_audit


def contest_files(source_dir: Path, contest: Contest) -> list[Path]:
    return sorted((source_dir / contest.folder / "data").glob(contest.pattern))


def scan_contest(
    source_dir: Path,
    contest: Contest,
    contest_index: int,
    geo_to_codes: dict[tuple[str, str, str], tuple[str, str, str]],
    leaf_results: dict[tuple[str, str, str, str], list[list[list[int]] | None]],
    leaf_display: dict[tuple[str, str, str, str], str],
) -> dict[str, Any]:
    files = contest_files(source_dir, contest)
    if not files:
        raise RuntimeError(f"No source files found for {contest.id}")

    file_audit: list[dict[str, Any]] = []
    seen_ids: dict[str, tuple[str, ...]] = {}
    natural_keys: set[tuple[str, ...]] = set()
    anomaly_counts: Counter[str] = Counter()
    field_gt_1000: Counter[str] = Counter()
    field_negative: Counter[str] = Counter()
    field_maxima: dict[str, dict[str, Any]] = {}
    source_vote_totals = [0] * len(contest.vote_columns)
    source_stat_totals = [0] * len(OUTPUT_STAT_COLUMNS)
    validated_stat_totals = [0] * len(OUTPUT_STAT_COLUMNS)
    examples: list[dict[str, Any]] = []
    province_groups: set[str] = set()
    regencies: set[tuple[str, str]] = set()
    districts: set[tuple[str, str, str]] = set()
    villages: set[tuple[str, str, str, str]] = set()
    rows_read = 0
    rows_included = 0
    rows_rejected = 0

    def add_example(reason: str, path: Path, line_number: int, row: dict[str, Any]) -> None:
        if len(examples) >= 30:
            return
        examples.append(
            {
                "reason": reason,
                "path": path.relative_to(source_dir).as_posix(),
                "line": line_number,
                "id": preview(row.get("id")),
                "region": [preview(row.get(column), 50) for column in GEO_COLUMNS],
            }
        )

    for path in files:
        per_file_read = 0
        per_file_included = 0
        per_file_rejected = 0
        with path.open("r", encoding="utf-8-sig", errors="strict", newline="") as handle:
            reader = csv.DictReader(handle)
            if tuple(reader.fieldnames or ()) != EXPECTED_HEADERS[contest.id]:
                raise RuntimeError(
                    f"Unexpected header in {path}: {reader.fieldnames!r}"
                )
            for line_number, row in enumerate(reader, 2):
                if not row or not any(value not in (None, "") for value in row.values()):
                    continue
                rows_read += 1
                per_file_read += 1
                record_id = str(row.get("id") or "").strip()
                geo = tuple(clean_name(row.get(column)) for column in GEO_COLUMNS)
                if (
                    not record_id
                    or "\x00" in record_id
                    or not all(geo)
                    or any("\x00" in value for value in geo)
                ):
                    anomaly_counts["invalid_record"] += 1
                    rows_rejected += 1
                    per_file_rejected += 1
                    add_example("invalid_record", path, line_number, row)
                    continue

                district_geo = geo[:3]
                if district_geo not in geo_to_codes:
                    anomaly_counts["unmatched_district"] += 1
                    rows_rejected += 1
                    per_file_rejected += 1
                    add_example("unmatched_district", path, line_number, row)
                    continue

                result_columns = (*contest.vote_columns, *STAT_COLUMNS)
                blank_result = all(not str(row.get(column) or "").strip() for column in result_columns)
                if blank_result:
                    # The scraper emitted a valid TPS/geography row but no
                    # numeric result at all.  Keep it (so every source row is
                    # represented) while making the distinction explicit in
                    # the audit instead of treating it as an observed 0-0.
                    anomaly_counts["blank_result_row"] += 1
                    if anomaly_counts["blank_result_row"] <= 3:
                        add_example("blank_result_row", path, line_number, row)

                numeric_values: dict[str, int] = {}
                malformed = False
                for column in result_columns:
                    value, bad = parse_int(row.get(column))
                    numeric_values[column] = value
                    if bad:
                        anomaly_counts["malformed_numeric"] += 1
                        malformed = True
                        if len(examples) < 30:
                            add_example(f"malformed_numeric:{column}", path, line_number, row)
                    if value < 0:
                        field_negative[column] += 1
                    if value > 1000:
                        field_gt_1000[column] += 1
                    previous_maximum = field_maxima.get(column)
                    if previous_maximum is None or value > previous_maximum["value"]:
                        field_maxima[column] = {
                            "value": value,
                            "path": path.relative_to(source_dir).as_posix(),
                            "line": line_number,
                            "id": preview(row.get("id")),
                            "region": [preview(row.get(item), 50) for item in GEO_COLUMNS],
                            "tps": preview(row.get("tps"), 30),
                        }
                if malformed:
                    rows_rejected += 1
                    per_file_rejected += 1
                    continue

                signature = (
                    *geo,
                    clean_name(row.get("tps")),
                    *(str(numeric_values[column]) for column in (*contest.vote_columns, *STAT_COLUMNS)),
                )
                previous = seen_ids.get(record_id)
                if previous is not None:
                    anomaly_counts["duplicate_id"] += 1
                    if previous != signature:
                        anomaly_counts["conflicting_duplicate_id"] += 1
                        add_example("conflicting_duplicate_id", path, line_number, row)
                    rows_rejected += 1
                    per_file_rejected += 1
                    continue
                seen_ids[record_id] = signature

                natural_key = (*geo, clean_name(row.get("tps")))
                if natural_key in natural_keys:
                    anomaly_counts["duplicate_natural_tps_key"] += 1
                    add_example("duplicate_natural_tps_key", path, line_number, row)
                else:
                    natural_keys.add(natural_key)

                votes = [numeric_values[column] for column in contest.vote_columns]
                raw_stats = [numeric_values[column] for column in STAT_COLUMNS]
                # Papua's noken aggregation and overseas POS/KSK rows can
                # legitimately exceed an ordinary TPS-sized count.  Elsewhere
                # a value above 1,000 is treated as a likely concatenation
                # artifact, while still remaining visible in the raw audit.
                allows_large_tps = geo[0] in {"PAPUA", "PAPUA BARAT", "+LUAR NEGERI"}
                vote_outlier = not allows_large_tps and any(value > 1000 for value in votes)
                if vote_outlier:
                    anomaly_counts["outlier_vote_row"] += 1
                stats_valid = (
                    not blank_result
                    and all(value >= 0 for value in raw_stats)
                    and (allows_large_tps or all(value <= 1000 for value in raw_stats))
                    and numeric_values["suara-total"]
                    == numeric_values["suara-sah"] + numeric_values["suara-tidak-sah"]
                    and numeric_values["total-pengguna"] == numeric_values["suara-total"]
                    and numeric_values["total-pengguna"] <= numeric_values["total-pemilih"]
                )
                if not stats_valid:
                    anomaly_counts["invalid_stats_row"] += 1
                # Keep the TPS itself in coverage, but never let a corrupt
                # concatenated value (for example 305151154 invalid votes)
                # distort turnout.  Raw values remain in the audit totals.
                stats = (raw_stats if stats_valid else [0] * len(STAT_COLUMNS)) + [
                    1,
                    int(stats_valid),
                    int(blank_result),
                    int(vote_outlier),
                ]
                option_sum = sum(votes)
                if option_sum != numeric_values["suara-sah"]:
                    anomaly_counts["option_sum_ne_suara_sah"] += 1
                if numeric_values["suara-total"] != (
                    numeric_values["suara-sah"] + numeric_values["suara-tidak-sah"]
                ):
                    anomaly_counts["suara_total_ne_sah_plus_tidak_sah"] += 1
                if numeric_values["total-pengguna"] != numeric_values["suara-total"]:
                    anomaly_counts["pengguna_ne_suara_total"] += 1

                leaf_geo = geo
                contests_for_leaf = leaf_results.setdefault(
                    leaf_geo, [None] * len(CONTESTS)
                )
                entry = contests_for_leaf[contest_index]
                if entry is None:
                    entry = empty_entry(len(contest.vote_columns))
                    contests_for_leaf[contest_index] = entry
                add_entry(entry, [votes, stats])
                leaf_display.setdefault(leaf_geo, str(row["kelurahan"]).strip())

                for index, value in enumerate(votes):
                    source_vote_totals[index] += value
                raw_stats_with_counts = raw_stats + [
                    1,
                    int(stats_valid),
                    int(blank_result),
                    int(vote_outlier),
                ]
                for index, value in enumerate(raw_stats_with_counts):
                    source_stat_totals[index] += value
                for index, value in enumerate(stats):
                    validated_stat_totals[index] += value

                province_groups.add(geo[0])
                regencies.add(geo[:2])
                districts.add(geo[:3])
                villages.add(geo)
                rows_included += 1
                per_file_included += 1

        file_audit.append(
            {
                "path": path.relative_to(source_dir).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "rows": per_file_read,
                "included": per_file_included,
                "rejected": per_file_rejected,
            }
        )

    return {
        "source_pattern": f"{contest.folder}/data/{contest.pattern}",
        "vote_columns": list(contest.vote_columns),
        "files": file_audit,
        "file_count": len(file_audit),
        "source_bytes": sum(item["bytes"] for item in file_audit),
        "rows_read": rows_read,
        "rows_included": rows_included,
        "rows_rejected": rows_rejected,
        "unique_ids": len(seen_ids),
        "coverage": {
            "province_groups": len(province_groups),
            "regencies": len(regencies),
            "districts": len(districts),
            "villages": len(villages),
        },
        "source_totals": {
            "votes": dict(zip(contest.vote_columns, source_vote_totals)),
            "stats": dict(zip(OUTPUT_STAT_COLUMNS, source_stat_totals)),
        },
        "validated_totals": {
            "stats": dict(zip(OUTPUT_STAT_COLUMNS, validated_stat_totals)),
        },
        "anomalies": {
            **dict(sorted(anomaly_counts.items())),
            "values_gt_1000": dict(sorted(field_gt_1000.items())),
            "negative_values": dict(sorted(field_negative.items())),
            "max_values": dict(sorted(field_maxima.items())),
            "examples": examples,
        },
    }


def hierarchy_to_json(
    hierarchy: dict[str, Any],
    geo_to_codes: dict[tuple[str, str, str], tuple[str, str, str]],
    leaf_results: dict[tuple[str, str, str, str], list[list[list[int]] | None]],
    leaf_display: dict[tuple[str, str, str, str], str],
) -> tuple[dict[str, Any], dict[tuple[str, str, str, str], str], dict[str, str]]:
    leaves_by_district: dict[tuple[str, str, str], set[tuple[str, str, str, str]]] = {}
    for leaf_geo in leaf_results:
        leaves_by_district.setdefault(leaf_geo[:3], set()).add(leaf_geo)

    provinces_out: list[dict[str, Any]] = []
    leaf_keys: dict[tuple[str, str, str, str], str] = {}
    district_to_province_key: dict[str, str] = {}

    for pcode, province in hierarchy["provinces"].items():
        regencies_out = []
        for kcode, regency in province["kab"].items():
            districts_out = []
            for ccode, district in regency["kec"].items():
                district_geo = (
                    clean_name(province["n"]),
                    clean_name(regency["n"]),
                    clean_name(district["n"]),
                )
                expected_codes = geo_to_codes[district_geo]
                if expected_codes != (pcode, kcode, ccode):
                    raise RuntimeError(f"Internal hierarchy mismatch for {district_geo}")
                district_key = f"P{pcode}.{kcode}.{ccode}"
                district_to_province_key[district_key] = f"P{pcode}"
                leaf_rows = []
                district_leaves = sorted(
                    leaves_by_district.get(district_geo, ()), key=lambda value: value[3]
                )
                for index, leaf_geo in enumerate(district_leaves):
                    token = str(index)
                    full_key = f"{district_key}.{token}"
                    leaf_keys[leaf_geo] = full_key
                    leaf_rows.append(
                        {"k": token, "n": leaf_display.get(leaf_geo, leaf_geo[3])}
                    )
                district_out = {"k": ccode, "n": district["n"]}
                if leaf_rows:
                    district_out["kel"] = leaf_rows
                districts_out.append(district_out)
            regencies_out.append({"k": kcode, "n": regency["n"], "kec": districts_out})
        provinces_out.append({"k": pcode, "n": province["n"], "kab": regencies_out})

    if len(leaf_keys) != len(leaf_results):
        missing = set(leaf_results) - set(leaf_keys)
        raise RuntimeError(f"Not every result village entered the hierarchy: {len(missing)} missing")

    output = {
        "schema": 2,
        "contests": [contest.id for contest in CONTESTS],
        "prov": provinces_out,
    }
    return output, leaf_keys, district_to_province_key


def aggregate_districts(
    leaf_results: dict[tuple[str, str, str, str], list[list[list[int]] | None]],
    geo_to_codes: dict[tuple[str, str, str], tuple[str, str, str]],
) -> dict[str, list[list[list[int]] | None]]:
    district_results: dict[str, list[list[list[int]] | None]] = {}
    for leaf_geo, contests_for_leaf in leaf_results.items():
        pcode, kcode, ccode = geo_to_codes[leaf_geo[:3]]
        district_key = f"P{pcode}.{kcode}.{ccode}"
        target_contests = district_results.setdefault(
            district_key, [None] * len(CONTESTS)
        )
        for contest_index, entry in enumerate(contests_for_leaf):
            if entry is None:
                continue
            target = target_contests[contest_index]
            if target is None:
                target = empty_entry(len(CONTESTS[contest_index].vote_columns))
                target_contests[contest_index] = target
            add_entry(target, entry)
    return district_results


def verify_totals(
    district_results: dict[str, list[list[list[int]] | None]],
    contest_audits: dict[str, dict[str, Any]],
) -> None:
    for contest_index, contest in enumerate(CONTESTS):
        output_total = total_entries(
            (entries[contest_index] for entries in district_results.values()),
            len(contest.vote_columns),
        )
        expected_votes = list(contest_audits[contest.id]["source_totals"]["votes"].values())
        expected_stats = list(contest_audits[contest.id]["validated_totals"]["stats"].values())
        if output_total[0] != expected_votes or output_total[1] != expected_stats:
            raise RuntimeError(f"Output totals differ from source for {contest.id}")
        contest_audits[contest.id]["output_totals"] = {
            "votes": dict(zip(contest.vote_columns, output_total[0])),
            "stats": dict(zip(OUTPUT_STAT_COLUMNS, output_total[1])),
        }


def build(source_dir: Path, output_dir: Path) -> None:
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")

    hierarchy, geo_to_codes, reference_audit = load_hierarchy(source_dir)
    support_audit = audit_support_files(source_dir)
    leaf_results: dict[
        tuple[str, str, str, str], list[list[list[int]] | None]
    ] = {}
    leaf_display: dict[tuple[str, str, str, str], str] = {}
    contest_audits: dict[str, dict[str, Any]] = {}

    for contest_index, contest in enumerate(CONTESTS):
        print(f"Scanning {contest.id} ...", flush=True)
        contest_audits[contest.id] = scan_contest(
            source_dir,
            contest,
            contest_index,
            geo_to_codes,
            leaf_results,
            leaf_display,
        )
        summary = contest_audits[contest.id]
        print(
            f"  {summary['file_count']} files, {summary['rows_included']:,} valid rows, "
            f"{summary['coverage']['districts']:,} districts",
            flush=True,
        )

    wilayah, leaf_keys, district_to_province_key = hierarchy_to_json(
        hierarchy, geo_to_codes, leaf_results, leaf_display
    )
    district_results = aggregate_districts(leaf_results, geo_to_codes)
    verify_totals(district_results, contest_audits)

    output_dir.mkdir(parents=True, exist_ok=True)
    wilayah_path = output_dir / "wilayah.json"
    election_path = output_dir / "election2019.json"
    result_dir = output_dir / "election2019"
    audit_path = output_dir / "audit2019.json"

    main_election = {
        "schema": 2,
        "contests": [
            {"id": contest.id, "vote_columns": list(contest.vote_columns)}
            for contest in CONTESTS
        ],
        "stats": list(OUTPUT_STAT_COLUMNS),
        "kec": district_results,
        "source_summary": {
            contest.id: {
                "files": contest_audits[contest.id]["file_count"],
                "rows": contest_audits[contest.id]["rows_included"],
                "districts": contest_audits[contest.id]["coverage"]["districts"],
                "villages": contest_audits[contest.id]["coverage"]["villages"],
                "anomalies": {
                    key: value
                    for key, value in contest_audits[contest.id]["anomalies"].items()
                    if key not in {"examples", "values_gt_1000", "negative_values", "max_values"}
                },
            }
            for contest in CONTESTS
        },
    }

    province_leaf_results: dict[str, dict[str, Any]] = {}
    for leaf_geo, results in leaf_results.items():
        leaf_key = leaf_keys[leaf_geo]
        district_key = leaf_key.rsplit(".", 1)[0]
        province_key = district_to_province_key[district_key]
        province_leaf_results.setdefault(province_key, {})[leaf_key] = results

    write_json_atomic(wilayah_path, wilayah)
    write_json_atomic(election_path, main_election)
    result_dir.mkdir(parents=True, exist_ok=True)
    expected_chunk_names = {f"{province_key}.json" for province_key in province_leaf_results}
    for stale_path in result_dir.glob("*.json"):
        if stale_path.name not in expected_chunk_names:
            stale_path.unlink()
    for province_key, results in province_leaf_results.items():
        write_json_atomic(
            result_dir / f"{province_key}.json",
            {"schema": 2, "leaf": results},
        )

    domestic_provinces = [
        province for province in wilayah["prov"] if not clean_name(province["n"]).startswith("+")
    ]
    all_regencies = [regency for province in wilayah["prov"] for regency in province["kab"]]
    all_districts = [district for regency in all_regencies for district in regency["kec"]]
    all_villages = [village for district in all_districts for village in district.get("kel", [])]

    audit = {
        "schema": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_directory": str(source_dir),
        "reference_files": reference_audit,
        "support_files": support_audit,
        "contests": contest_audits,
        "totals": {
            "result_csv_files": sum(item["file_count"] for item in contest_audits.values()),
            "result_rows_read": sum(item["rows_read"] for item in contest_audits.values()),
            "result_rows_included": sum(item["rows_included"] for item in contest_audits.values()),
            "result_rows_rejected": sum(item["rows_rejected"] for item in contest_audits.values()),
            "support_csv_files": len(support_audit),
            "all_csv_files": sum(item["file_count"] for item in contest_audits.values()) + len(support_audit),
            "all_csv_bytes": sum(item["source_bytes"] for item in contest_audits.values())
            + sum(item["bytes"] for item in support_audit),
        },
        "hierarchy": {
            "province_groups": len(wilayah["prov"]),
            "domestic_provinces_2019": len(domestic_provinces),
            "regencies_and_overseas_units": len(all_regencies),
            "districts_and_overseas_units": len(all_districts),
            "villages_and_overseas_units": len(all_villages),
        },
        "outputs": {
            "wilayah.json": {
                "bytes": wilayah_path.stat().st_size,
                "sha256": sha256_file(wilayah_path),
            },
            "election2019.json": {
                "bytes": election_path.stat().st_size,
                "sha256": sha256_file(election_path),
            },
            "province_chunks": {
                "files": len(province_leaf_results),
                "villages": len(leaf_results),
                "bytes": sum(path.stat().st_size for path in result_dir.glob("*.json")),
            },
        },
    }
    write_json_atomic(audit_path, audit)

    print(f"Wrote {wilayah_path} ({wilayah_path.stat().st_size:,} bytes)")
    print(f"Wrote {election_path} ({election_path.stat().st_size:,} bytes)")
    print(
        f"Wrote {len(province_leaf_results)} province result chunks for "
        f"{len(leaf_results):,} villages"
    )
    print(f"Wrote {audit_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help="Root folder containing the four 2019 scrape folders",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_DIR / "data",
        help="Output data directory",
    )
    args = parser.parse_args()
    build(args.source.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
