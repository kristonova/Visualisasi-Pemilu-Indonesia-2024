"""Build the complete 2019 election dataset used by the static visualisation.

Two scrapes feed this build, joined on the official KPU wilayah IDs rather than
on names:

* the legacy KPU scrape supplies DPR, DPRD provinsi and DPRD kabupaten/kota, and
  is also the only source of DPT and pengguna hak pilih;
* the KawalPemilu per-province export supplies Pilpres, because the legacy batch
  only ever covered 15 of the 35 province groups.

Both address the same TPS, so the identity spine is the KPU wilayah tree; no
fuzzy matching, edit distance, or name normalisation happens anywhere.

Each source contains one row per TPS.  Raw numeric totals (including source
anomalies) are preserved in ``data/audit2019.json``.  Vote-option fields are
aggregated verbatim; participation metadata is aggregated only for rows whose
five rekap fields are internally consistent and within a documented per-TPS
bound.  Invalid source records are never silently repaired.

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
DEFAULT_PILPRES_DIR = Path(
    r"D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\json-kpu-2019\csv-per-provinsi"
)
DEFAULT_TREE_DIR = Path(
    r"D:\PROJECT\Scrapping Hasil Pemilu 2019 KPU\json-kpu-2019\full-tps-kawalpemilu"
)

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
    source: str = "legacy"


CONTESTS = (
    # Pilpres no longer reads the legacy scrape: that batch only covered 15 of
    # the 35 province groups.  The KawalPemilu per-province export covers 98.8%
    # of kecamatan on the identical KPU wilayah-ID space.  The legacy Pilpres
    # CSVs stay in the build purely as the donor for DPT/pengguna metadata,
    # which the newer export does not carry.
    Contest(
        "pilpres",
        "csv-per-provinsi",
        "*.csv",
        ("pemilih-1", "pemilih-2"),
        source="kawalpemilu",
    ),
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

LEGACY_CONTESTS = tuple(contest for contest in CONTESTS if contest.source == "legacy")

EXPECTED_HEADERS = {
    contest.id: (
        "id",
        *GEO_COLUMNS,
        "tps",
        "timestamp",
        *contest.vote_columns,
        *STAT_COLUMNS,
        *tuple(f"c1-{i}" for i in range(1, 7)),
    )
    for contest in LEGACY_CONTESTS
}

# Legacy Pilpres CSVs are still read, but only to recover DPT and pengguna
# hak pilih per TPS.  Their two vote columns are ignored.
LEGACY_PILPRES_FOLDER = "Pilpres RI"
LEGACY_PILPRES_PATTERN = "datakpu-*.csv"
LEGACY_PILPRES_HEADER = (
    "id",
    *GEO_COLUMNS,
    "tps",
    "timestamp",
    "pemilih-1",
    "pemilih-2",
    *STAT_COLUMNS,
    "c1-1",
    "c1-2",
)

# Header of the KawalPemilu per-province export.
PILPRES_HEADER = (
    "provinsi",
    "kabupaten",
    "kecamatan",
    "kelurahan",
    "id_wilayah",
    "id_tps",
    "pas1",
    "pas2",
    "sah",
    "tSah",
    "jum",
)
PILPRES_VOTE_SOURCE = ("pas1", "pas2")
# suara-total is the export's ``jum``; total-pemilih and total-pengguna have no
# counterpart in that source and are backfilled from the legacy scrape.
PILPRES_STAT_SOURCE = {
    "suara-sah": "sah",
    "suara-tidak-sah": "tSah",
    "suara-total": "jum",
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


@dataclass(frozen=True)
class KpuTree:
    """The official KPU 2019 wilayah tree, keyed by KPU wilayah IDs.

    ``concat_index`` maps the concatenation ``province+regency+district+village``
    back to its four codes.  The legacy scrape's ``id`` column is exactly that
    concatenation followed by the KPU TPS id, so this index turns those opaque
    ids back into official village codes without any name matching.
    """

    provinces: "OrderedDict[str, dict[str, Any]]"
    kel_to_district: dict[str, tuple[str, str, str]]
    kel_name: dict[str, str]
    concat_index: dict[str, tuple[tuple[str, str, str, str], ...]]
    district_name: dict[tuple[str, str, str], tuple[str, str, str]]
    files: list[dict[str, Any]]

    @property
    def village_count(self) -> int:
        return len(self.kel_name)

    @property
    def digest(self) -> str:
        return kpu_tree_digest(self.files)


def kpu_tree_digest(files: Iterable[dict[str, Any]]) -> str:
    """Hash the whole set of hierarchy node files into one reproducible digest.

    Storing 8,011 individual hashes would triple the audit for bytes nothing
    ever re-checks.  One digest over ``name:sha256`` lines detects any change to
    any node and can be recomputed from disk by the tests, so it is both smaller
    and better evidence.
    """

    lines = sorted(f"{item['path']}:{item['sha256']}" for item in files)
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def load_kpu_tree(tree_dir: Path) -> KpuTree:
    """Walk root -> province -> regency -> district of the KawalPemilu dump.

    Only the 8,011 node files down to kecamatan are read; every kecamatan node
    already lists its villages, so the 83k village files and their TPS payloads
    are never touched.
    """

    if not tree_dir.is_dir():
        raise FileNotFoundError(f"KPU tree directory not found: {tree_dir}")

    files: list[dict[str, Any]] = []

    def read_node(node_id: Any) -> dict[str, Any]:
        path = tree_dir / f"{node_id}.json"
        if not path.is_file():
            raise RuntimeError(f"Missing KPU tree node {path}")
        payload = path.read_bytes()
        files.append(
            {
                "path": path.name,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
        return json.loads(payload.decode("utf-8"))

    def child_pairs(node: dict[str, Any], where: str) -> list[tuple[str, str]]:
        pairs = []
        for child in node.get("children") or ():
            if not isinstance(child, list) or len(child) < 2:
                raise RuntimeError(f"Unexpected child shape under {where}: {child!r}")
            code = str(child[0]).strip()
            name = str(child[1]).strip()
            if not code or not name:
                raise RuntimeError(f"Blank child code/name under {where}: {child!r}")
            pairs.append((code, name))
        return pairs

    provinces: OrderedDict[str, dict[str, Any]] = OrderedDict()
    kel_to_district: dict[str, tuple[str, str, str]] = {}
    kel_name: dict[str, str] = {}
    concat_build: dict[str, list[tuple[str, str, str, str]]] = {}
    district_name: dict[tuple[str, str, str], tuple[str, str, str]] = {}

    root = read_node(0)
    for pcode, pname in child_pairs(root, "root"):
        province = {"k": pcode, "n": pname, "kab": OrderedDict()}
        provinces[pcode] = province
        for kcode, kname in child_pairs(read_node(pcode), f"province {pcode}"):
            regency = {"k": kcode, "n": kname, "kec": OrderedDict()}
            province["kab"][kcode] = regency
            for ccode, cname in child_pairs(read_node(kcode), f"regency {kcode}"):
                district = {"k": ccode, "n": cname, "kel": OrderedDict()}
                regency["kec"][ccode] = district
                district_name[(pcode, kcode, ccode)] = (pname, kname, cname)
                for lcode, lname in child_pairs(read_node(ccode), f"district {ccode}"):
                    if lcode in kel_name:
                        raise RuntimeError(f"Village code {lcode} appears twice in the KPU tree")
                    district["kel"][lcode] = lname
                    kel_name[lcode] = lname
                    kel_to_district[lcode] = (pcode, kcode, ccode)
                    concat_build.setdefault(pcode + kcode + ccode + lcode, []).append(
                        (pcode, kcode, ccode, lcode)
                    )

    regency_count = sum(len(province["kab"]) for province in provinces.values())
    district_count = len(district_name)
    if (len(provinces), regency_count, district_count) != (35, 644, 7331):
        raise RuntimeError(
            "KPU tree is not the 2019 hierarchy: "
            f"{len(provinces)} provinces, {regency_count} regencies, {district_count} districts"
        )

    return KpuTree(
        provinces=provinces,
        kel_to_district=kel_to_district,
        kel_name=kel_name,
        concat_index={key: tuple(value) for key, value in concat_build.items()},
        district_name=district_name,
        files=files,
    )


def reconcile_tree_with_reference(
    tree: KpuTree,
    geo_to_codes: dict[tuple[str, str, str], tuple[str, str, str]],
) -> None:
    """Fail the build unless dataprov-kec.csv and the KPU tree agree exactly.

    The two sources are independent (a CSV shipped with the legacy scrape versus
    the KawalPemilu node dump), so this is the guard that keeps the ID space
    from silently drifting.
    """

    tree_codes = set(tree.district_name)
    reference_codes = set(geo_to_codes.values())
    if tree_codes != reference_codes:
        only_tree = sorted(tree_codes - reference_codes)[:5]
        only_reference = sorted(reference_codes - tree_codes)[:5]
        raise RuntimeError(
            "KPU tree and dataprov-kec.csv disagree on district codes; "
            f"tree-only {only_tree}, reference-only {only_reference}"
        )


def resolve_legacy_leaf(
    record_id: str,
    district_codes: tuple[str, str, str] | None,
    kelurahan: str,
    tree: KpuTree,
) -> tuple[tuple[str, str, str, str] | None, bool]:
    """Decompose a legacy ``id`` into official KPU codes.

    ``1149217531776900003704`` is ``1``+``1492``+``1753``+``1776``+``900003704``:
    province, regency, district, village, then the KPU TPS id.  The parts are
    variable length, so every prefix is tested against the tree index.  Short
    codes can coincide with the leading digits of a longer one — ``12920``
    (Sumatera Barat) also reads as ``1``+``2``+``9``+``20`` in Aceh — which makes
    several prefixes look valid.  The kecamatan named on the same row already
    matched the reference hierarchy exactly, so it is the discriminator; the
    village name is only a last resort, and anything still ambiguous is rejected
    rather than guessed.  Returns ``(codes, was_ambiguous)``.
    """

    hits: list[tuple[str, str, str, str]] = []
    for length in range(4, len(record_id)):
        hits.extend(tree.concat_index.get(record_id[:length], ()))
    if not hits:
        return None, False
    if len(hits) == 1:
        return hits[0], False
    scoped = [codes for codes in hits if codes[:3] == district_codes]
    if len(scoped) == 1:
        return scoped[0], True
    wanted = clean_name(kelurahan)
    filtered = [
        codes for codes in (scoped or hits) if clean_name(tree.kel_name[codes[3]]) == wanted
    ]
    if len(filtered) == 1:
        return filtered[0], True
    return None, True


def contest_files(source_dir: Path, contest: Contest) -> list[Path]:
    return sorted((source_dir / contest.folder / "data").glob(contest.pattern))


def scan_contest(
    source_dir: Path,
    contest: Contest,
    contest_index: int,
    geo_to_codes: dict[tuple[str, str, str], tuple[str, str, str]],
    tree: KpuTree,
    leaf_results: dict[str, list[list[list[int]] | None]],
    leaf_display: dict[str, str],
    leaf_aliases: dict[str, set[str]],
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
    villages: set[str] = set()
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
                district_codes = geo_to_codes.get(district_geo)
                if district_codes is None:
                    anomaly_counts["unmatched_district"] += 1
                    rows_rejected += 1
                    per_file_rejected += 1
                    add_example("unmatched_district", path, line_number, row)
                    continue

                leaf_codes, was_ambiguous = resolve_legacy_leaf(
                    record_id, district_codes, row.get("kelurahan"), tree
                )
                if was_ambiguous:
                    anomaly_counts["ambiguous_leaf_id"] += 1
                if leaf_codes is None:
                    anomaly_counts["unresolved_leaf_id"] += 1
                    rows_rejected += 1
                    per_file_rejected += 1
                    add_example("unresolved_leaf_id", path, line_number, row)
                    continue
                if leaf_codes[:3] != district_codes:
                    # The id decoded to a village outside the kecamatan named on
                    # the same row.  Never reconcile that by preferring one side.
                    anomaly_counts["id_district_mismatch"] += 1
                    rows_rejected += 1
                    per_file_rejected += 1
                    add_example("id_district_mismatch", path, line_number, row)
                    continue
                village_code = leaf_codes[3]

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

                # Identity is the KPU village code plus the TPS label, not the
                # village name: two distinct villages in Merlung share a name
                # and used to collide here.
                natural_key = (village_code, clean_name(row.get("tps")))
                if natural_key in natural_keys:
                    anomaly_counts["duplicate_natural_tps_key"] += 1
                    add_example("duplicate_natural_tps_key", path, line_number, row)
                else:
                    natural_keys.add(natural_key)

                votes = [numeric_values[column] for column in contest.vote_columns]
                raw_stats = [numeric_values[column] for column in STAT_COLUMNS]
                # A value above 1,000 outside Papua and overseas is treated as a
                # likely concatenation artifact, while still remaining visible
                # in the raw audit.
                large_allowed = allows_large_tps(district_codes[0], tree)
                vote_outlier = not large_allowed and any(value > 1000 for value in votes)
                if vote_outlier:
                    anomaly_counts["outlier_vote_row"] += 1
                stats_valid = (
                    not blank_result
                    and all(value >= 0 for value in raw_stats)
                    and (large_allowed or all(value <= 1000 for value in raw_stats))
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

                contests_for_leaf = leaf_results.setdefault(
                    village_code, [None] * len(CONTESTS)
                )
                entry = contests_for_leaf[contest_index]
                if entry is None:
                    entry = empty_entry(len(contest.vote_columns))
                    contests_for_leaf[contest_index] = entry
                add_entry(entry, [votes, stats])
                leaf_display.setdefault(village_code, str(row["kelurahan"]).strip())
                source_name = clean_name(row.get("kelurahan"))
                if source_name != clean_name(tree.kel_name[village_code]):
                    leaf_aliases.setdefault(village_code, set()).add(source_name)

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

                province_groups.add(district_codes[0])
                regencies.add(district_codes[:2])
                districts.add(district_codes)
                villages.add(village_code)
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


def build_dpt_index(
    source_dir: Path,
    tree: KpuTree,
    geo_to_codes: dict[tuple[str, str, str], tuple[str, str, str]],
) -> tuple[dict[tuple[str, int], tuple[int, int]], dict[str, Any]]:
    """Index DPT and pengguna hak pilih from the legacy Pilpres scrape.

    The KawalPemilu export carries no registered-voter column, so turnout would
    disappear entirely without this.  Both sources address the same TPS, but the
    legacy one zero-pads the number (``TPS 01``) while the export does not
    (``1``); comparing the integer is what makes the join land.
    """

    files = sorted((source_dir / LEGACY_PILPRES_FOLDER / "data").glob(LEGACY_PILPRES_PATTERN))
    if not files:
        raise RuntimeError("No legacy Pilpres CSVs found for the DPT backfill")

    index: dict[tuple[str, int], tuple[int, int]] = {}
    file_audit: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()

    for path in files:
        with path.open("r", encoding="utf-8-sig", errors="strict", newline="") as handle:
            reader = csv.DictReader(handle)
            if tuple(reader.fieldnames or ()) != LEGACY_PILPRES_HEADER:
                raise RuntimeError(f"Unexpected legacy Pilpres header in {path}: {reader.fieldnames!r}")
            for row in reader:
                if not row or not any(value not in (None, "") for value in row.values()):
                    continue
                counts["rows_read"] += 1
                record_id = str(row.get("id") or "").strip()
                if not record_id or "\x00" in record_id:
                    counts["invalid_record"] += 1
                    continue
                district_codes = geo_to_codes.get(
                    tuple(clean_name(row.get(column)) for column in GEO_COLUMNS[:3])
                )
                leaf_codes, _ = resolve_legacy_leaf(
                    record_id, district_codes, row.get("kelurahan"), tree
                )
                if leaf_codes is None:
                    counts["unresolved_leaf_id"] += 1
                    continue
                digits = "".join(
                    character for character in str(row.get("tps") or "") if character.isdigit()
                )
                if not digits:
                    counts["unreadable_tps"] += 1
                    continue
                registered, bad_registered = parse_int(row.get("total-pemilih"))
                users, bad_users = parse_int(row.get("total-pengguna"))
                if bad_registered or bad_users or registered < 0 or users < 0:
                    counts["malformed_numeric"] += 1
                    continue
                key = (leaf_codes[3], int(digits))
                previous = index.get(key)
                if previous is not None:
                    # Two source rows claim the same TPS.  Keep neither value
                    # rather than pick a winner; the TPS then simply has no
                    # turnout metadata.
                    if previous != (registered, users):
                        counts["conflicting_duplicate"] += 1
                        index[key] = (-1, -1)
                    else:
                        counts["duplicate"] += 1
                    continue
                index[key] = (registered, users)
                counts["indexed"] += 1

        file_audit.append(
            {
                "path": path.relative_to(source_dir).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )

    poisoned = [key for key, value in index.items() if value == (-1, -1)]
    for key in poisoned:
        del index[key]
    counts["dropped_conflicting"] = len(poisoned)

    audit = {
        "role": "donor for total-pemilih and total-pengguna only",
        "source_pattern": f"{LEGACY_PILPRES_FOLDER}/data/{LEGACY_PILPRES_PATTERN}",
        "files": file_audit,
        "file_count": len(file_audit),
        "source_bytes": sum(item["bytes"] for item in file_audit),
        "tps_indexed": len(index),
        "counts": dict(sorted(counts.items())),
    }
    return index, audit


def allows_large_tps(province_code: str, tree: KpuTree) -> bool:
    """Papua's noken aggregation and overseas POS/KSK rows legitimately exceed
    an ordinary TPS-sized count; elsewhere such values are concatenation
    artifacts."""

    name = clean_name(tree.provinces[province_code]["n"]).lstrip("+ ")
    return name in {"PAPUA", "PAPUA BARAT", "LUAR NEGERI"}


def scan_pilpres(
    pilpres_dir: Path,
    contest: Contest,
    contest_index: int,
    tree: KpuTree,
    dpt_index: dict[tuple[str, int], tuple[int, int]],
    leaf_results: dict[str, list[list[list[int]] | None]],
    leaf_display: dict[str, str],
    leaf_aliases: dict[str, set[str]],
) -> dict[str, Any]:
    """Scan the KawalPemilu per-province export into the pilpres contest.

    Every row carries ``id_wilayah``, the official KPU village code, so the join
    to the hierarchy is exact and no name matching happens at any point.
    """

    files = sorted(pilpres_dir.glob(contest.pattern))
    if not files:
        raise RuntimeError(f"No source files found in {pilpres_dir}")

    file_audit: list[dict[str, Any]] = []
    natural_keys: set[tuple[str, int]] = set()
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
    villages: set[str] = set()
    dpt_matched = 0
    dpt_by_province: Counter[str] = Counter()
    rows_by_province: Counter[str] = Counter()
    rows_read = 0
    rows_included = 0
    rows_rejected = 0

    def add_example(reason: str, path: Path, line_number: int, row: dict[str, Any]) -> None:
        if len(examples) >= 30:
            return
        examples.append(
            {
                "reason": reason,
                "path": path.name,
                "line": line_number,
                "id_wilayah": preview(row.get("id_wilayah")),
                "region": [preview(row.get(column), 50) for column in GEO_COLUMNS],
            }
        )

    for path in files:
        per_file_read = 0
        per_file_included = 0
        per_file_rejected = 0
        with path.open("r", encoding="utf-8-sig", errors="strict", newline="") as handle:
            reader = csv.DictReader(handle)
            if tuple(reader.fieldnames or ()) != PILPRES_HEADER:
                raise RuntimeError(f"Unexpected header in {path}: {reader.fieldnames!r}")
            for line_number, row in enumerate(reader, 2):
                if not row or not any(value not in (None, "") for value in row.values()):
                    continue
                rows_read += 1
                per_file_read += 1

                village_code = str(row.get("id_wilayah") or "").strip()
                district_codes = tree.kel_to_district.get(village_code)
                if not village_code or district_codes is None:
                    anomaly_counts["unknown_village_id"] += 1
                    rows_rejected += 1
                    per_file_rejected += 1
                    add_example("unknown_village_id", path, line_number, row)
                    continue

                tps_text = str(row.get("id_tps") or "").strip()
                if not tps_text.isdigit():
                    anomaly_counts["unreadable_tps"] += 1
                    rows_rejected += 1
                    per_file_rejected += 1
                    add_example("unreadable_tps", path, line_number, row)
                    continue
                tps_number = int(tps_text)

                natural_key = (village_code, tps_number)
                if natural_key in natural_keys:
                    anomaly_counts["duplicate_natural_tps_key"] += 1
                    rows_rejected += 1
                    per_file_rejected += 1
                    add_example("duplicate_natural_tps_key", path, line_number, row)
                    continue
                natural_keys.add(natural_key)

                source_columns = (*PILPRES_VOTE_SOURCE, *PILPRES_STAT_SOURCE.values())
                blank_result = all(
                    not str(row.get(column) or "").strip() for column in source_columns
                )
                if blank_result:
                    anomaly_counts["blank_result_row"] += 1
                    if anomaly_counts["blank_result_row"] <= 3:
                        add_example("blank_result_row", path, line_number, row)

                numeric_values: dict[str, int] = {}
                malformed = False
                for column in source_columns:
                    value, bad = parse_int(row.get(column))
                    numeric_values[column] = value
                    if bad:
                        anomaly_counts["malformed_numeric"] += 1
                        malformed = True
                        add_example(f"malformed_numeric:{column}", path, line_number, row)
                    if value < 0:
                        field_negative[column] += 1
                    if value > 1000:
                        field_gt_1000[column] += 1
                    previous_maximum = field_maxima.get(column)
                    if previous_maximum is None or value > previous_maximum["value"]:
                        field_maxima[column] = {
                            "value": value,
                            "path": path.name,
                            "line": line_number,
                            "id_wilayah": village_code,
                            "region": [preview(row.get(item), 50) for item in GEO_COLUMNS],
                            "tps": tps_text,
                        }
                if malformed:
                    rows_rejected += 1
                    per_file_rejected += 1
                    continue

                registered, users = dpt_index.get(natural_key, (0, 0))
                has_dpt = natural_key in dpt_index
                if has_dpt:
                    dpt_matched += 1
                    dpt_by_province[district_codes[0]] += 1

                votes = [numeric_values[column] for column in PILPRES_VOTE_SOURCE]
                merged = {
                    "total-pemilih": registered,
                    "total-pengguna": users,
                    **{
                        target: numeric_values[column]
                        for target, column in PILPRES_STAT_SOURCE.items()
                    },
                }
                raw_stats = [merged[column] for column in STAT_COLUMNS]
                large_allowed = allows_large_tps(district_codes[0], tree)
                vote_outlier = not large_allowed and any(value > 1000 for value in votes)
                if vote_outlier:
                    anomaly_counts["outlier_vote_row"] += 1
                # Identical gate to the legacy contests: the five participation
                # fields only enter display totals when one record is internally
                # consistent.  Rows with no DPT donor therefore never contribute
                # turnout, which is exactly what "validated" has always meant.
                stats_valid = (
                    not blank_result
                    and has_dpt
                    and all(value >= 0 for value in raw_stats)
                    and (large_allowed or all(value <= 1000 for value in raw_stats))
                    and merged["suara-total"] == merged["suara-sah"] + merged["suara-tidak-sah"]
                    and merged["total-pengguna"] == merged["suara-total"]
                    and merged["total-pengguna"] <= merged["total-pemilih"]
                )
                if not stats_valid:
                    anomaly_counts["invalid_stats_row"] += 1
                if not has_dpt:
                    anomaly_counts["no_dpt_donor"] += 1
                stats = (raw_stats if stats_valid else [0] * len(STAT_COLUMNS)) + [
                    1,
                    int(stats_valid),
                    int(blank_result),
                    int(vote_outlier),
                ]
                if sum(votes) != merged["suara-sah"]:
                    anomaly_counts["option_sum_ne_suara_sah"] += 1
                if merged["suara-total"] != merged["suara-sah"] + merged["suara-tidak-sah"]:
                    anomaly_counts["suara_total_ne_sah_plus_tidak_sah"] += 1
                if has_dpt and merged["total-pengguna"] != merged["suara-total"]:
                    anomaly_counts["pengguna_ne_suara_total"] += 1

                contests_for_leaf = leaf_results.setdefault(
                    village_code, [None] * len(CONTESTS)
                )
                entry = contests_for_leaf[contest_index]
                if entry is None:
                    entry = empty_entry(len(contest.vote_columns))
                    contests_for_leaf[contest_index] = entry
                add_entry(entry, [votes, stats])
                leaf_display.setdefault(village_code, str(row["kelurahan"]).strip())
                source_name = clean_name(row.get("kelurahan"))
                if source_name != clean_name(tree.kel_name[village_code]):
                    leaf_aliases.setdefault(village_code, set()).add(source_name)

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

                province_groups.add(district_codes[0])
                regencies.add(district_codes[:2])
                districts.add(district_codes)
                villages.add(village_code)
                rows_by_province[district_codes[0]] += 1
                rows_included += 1
                per_file_included += 1

        file_audit.append(
            {
                "path": path.name,
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "rows": per_file_read,
                "included": per_file_included,
                "rejected": per_file_rejected,
            }
        )

    return {
        "source_pattern": f"csv-per-provinsi/{contest.pattern}",
        "source_kind": "kawalpemilu",
        "vote_columns": list(contest.vote_columns),
        "vote_source_columns": list(PILPRES_VOTE_SOURCE),
        "stat_source_columns": {
            "total-pemilih": "legacy scrape backfill",
            "total-pengguna": "legacy scrape backfill",
            **PILPRES_STAT_SOURCE,
        },
        "files": file_audit,
        "file_count": len(file_audit),
        "source_bytes": sum(item["bytes"] for item in file_audit),
        "rows_read": rows_read,
        "rows_included": rows_included,
        "rows_rejected": rows_rejected,
        "unique_ids": len(natural_keys),
        "coverage": {
            "province_groups": len(province_groups),
            "regencies": len(regencies),
            "districts": len(districts),
            "villages": len(villages),
        },
        "dpt_backfill": {
            "tps_matched": dpt_matched,
            "tps_without_donor": rows_included - dpt_matched,
            "by_province": {
                tree.provinces[code]["n"]: {
                    "matched": dpt_by_province.get(code, 0),
                    "rows": rows_by_province[code],
                }
                for code in sorted(rows_by_province, key=lambda item: -dpt_by_province.get(item, 0))
            },
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
    tree: KpuTree,
    hierarchy: dict[str, Any],
    leaf_display: dict[str, str],
    leaf_results: dict[str, list[list[list[int]] | None]],
) -> tuple[dict[str, Any], dict[str, str], dict[str, str]]:
    """Emit wilayah.json keyed by official KPU wilayah IDs at every level.

    The village token used to be its alphabetical position inside the kecamatan,
    which shifted whenever the source data changed and silently merged the two
    same-named villages in Merlung.  The KPU village code is stable and unique,
    so the emitted key is the same on every rebuild.

    Only the *keys* come from the KPU tree.  Display names stay on the names the
    result CSVs use, because those are what the GIS pipeline already matches
    geometry against, and because the tree carries spellings the scrape does not
    (``JOHAN PAHWALAN`` for ``JOHAN PAHLAWAN``).  Disagreements are recorded as
    audit aliases rather than silently preferred one way or the other.
    """

    provinces_out: list[dict[str, Any]] = []
    leaf_keys: dict[str, str] = {}
    district_to_province_key: dict[str, str] = {}
    reference_provinces = hierarchy["provinces"]

    for pcode, province in tree.provinces.items():
        reference_province = reference_provinces.get(pcode)
        if reference_province is None:
            raise RuntimeError(f"Province {pcode} missing from reference CSV")
        regencies_out = []
        for kcode, regency in province["kab"].items():
            reference_regency = reference_province["kab"].get(kcode)
            if reference_regency is None:
                raise RuntimeError(f"Regency {pcode}.{kcode} missing from reference CSV")
            districts_out = []
            for ccode, district in regency["kec"].items():
                reference_district = reference_regency["kec"].get(ccode)
                if reference_district is None:
                    raise RuntimeError(
                        f"District {pcode}.{kcode}.{ccode} missing from reference CSV"
                    )
                district_key = f"P{pcode}.{kcode}.{ccode}"
                district_to_province_key[district_key] = f"P{pcode}"
                leaf_rows = []
                names = {
                    lcode: leaf_display.get(lcode, lname)
                    for lcode, lname in district["kel"].items()
                    if lcode in leaf_results
                }
                # Sorted by name so the file stays byte-stable, but the key
                # itself no longer depends on that ordering.
                for lcode, lname in sorted(
                    names.items(), key=lambda item: (clean_name(item[1]), item[0])
                ):
                    leaf_keys[lcode] = f"{district_key}.{lcode}"
                    leaf_rows.append({"k": lcode, "n": lname})
                district_out = {"k": ccode, "n": reference_district["n"]}
                if leaf_rows:
                    district_out["kel"] = leaf_rows
                districts_out.append(district_out)
            regencies_out.append(
                {"k": kcode, "n": reference_regency["n"], "kec": districts_out}
            )
        provinces_out.append(
            {"k": pcode, "n": reference_province["n"], "kab": regencies_out}
        )

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
    leaf_results: dict[str, list[list[list[int]] | None]],
    tree: KpuTree,
) -> dict[str, list[list[list[int]] | None]]:
    district_results: dict[str, list[list[list[int]] | None]] = {}
    for village_code, contests_for_leaf in leaf_results.items():
        pcode, kcode, ccode = tree.kel_to_district[village_code]
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


def build(
    source_dir: Path,
    output_dir: Path,
    pilpres_dir: Path,
    tree_dir: Path,
) -> None:
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")
    if not pilpres_dir.is_dir():
        raise FileNotFoundError(f"Pilpres source directory not found: {pilpres_dir}")

    print("Loading KPU wilayah tree ...", flush=True)
    tree = load_kpu_tree(tree_dir)
    print(
        f"  {len(tree.provinces)} province groups, {len(tree.district_name):,} districts, "
        f"{tree.village_count:,} villages from {len(tree.files):,} node files",
        flush=True,
    )

    hierarchy, geo_to_codes, reference_audit = load_hierarchy(source_dir)
    reconcile_tree_with_reference(tree, geo_to_codes)
    support_audit = audit_support_files(source_dir)

    print("Indexing DPT donor rows ...", flush=True)
    dpt_index, dpt_audit = build_dpt_index(source_dir, tree, geo_to_codes)
    print(f"  {len(dpt_index):,} TPS carry registered-voter metadata", flush=True)

    leaf_results: dict[str, list[list[list[int]] | None]] = {}
    leaf_aliases: dict[str, set[str]] = {}
    # Village display names come from the legacy scrape wherever it has the
    # village, because that spelling is what the GIS pipeline already matches
    # geometry against.  The newer export only names villages it alone reaches.
    legacy_display: dict[str, str] = {}
    pilpres_display: dict[str, str] = {}
    contest_audits: dict[str, dict[str, Any]] = {}

    for contest_index, contest in enumerate(CONTESTS):
        print(f"Scanning {contest.id} ...", flush=True)
        if contest.source == "kawalpemilu":
            contest_audits[contest.id] = scan_pilpres(
                pilpres_dir,
                contest,
                contest_index,
                tree,
                dpt_index,
                leaf_results,
                pilpres_display,
                leaf_aliases,
            )
        else:
            contest_audits[contest.id] = scan_contest(
                source_dir,
                contest,
                contest_index,
                geo_to_codes,
                tree,
                leaf_results,
                legacy_display,
                leaf_aliases,
            )
        summary = contest_audits[contest.id]
        print(
            f"  {summary['file_count']} files, {summary['rows_included']:,} valid rows, "
            f"{summary['coverage']['districts']:,} districts",
            flush=True,
        )

    leaf_display = {**pilpres_display, **legacy_display}
    wilayah, leaf_keys, district_to_province_key = hierarchy_to_json(
        tree, hierarchy, leaf_display, leaf_results
    )
    district_results = aggregate_districts(leaf_results, tree)
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
    for village_code, results in leaf_results.items():
        leaf_key = leaf_keys[village_code]
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

    pilpres_index = next(
        index for index, contest in enumerate(CONTESTS) if contest.id == "pilpres"
    )
    pilpres_districts_seen = {
        leaf_keys[village_code].rsplit(".", 1)[0]
        for village_code, results in leaf_results.items()
        if results[pilpres_index] is not None
    }
    missing_pilpres = [
        {"key": f"P{pcode}.{kcode}.{ccode}", "name": " / ".join(names)}
        for (pcode, kcode, ccode), names in sorted(tree.district_name.items())
        if f"P{pcode}.{kcode}.{ccode}" not in pilpres_districts_seen
    ]

    audit = {
        "schema": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_directory": str(source_dir),
        "sources": {
            "legacy_kpu_scrape": {
                "root": str(source_dir),
                "role": "DPR, DPRD provinsi, DPRD kabupaten/kota results; DPT donor for pilpres",
            },
            "kawalpemilu_csv": {
                "root": str(pilpres_dir),
                "role": "pilpres results",
                "files": contest_audits["pilpres"]["file_count"],
                "bytes": contest_audits["pilpres"]["source_bytes"],
            },
            "kawalpemilu_tree": {
                "root": str(tree_dir),
                "role": "official KPU wilayah IDs used as the identity spine",
                "node_files": len(tree.files),
                "bytes": sum(item["bytes"] for item in tree.files),
                "provinces": len(tree.provinces),
                "districts": len(tree.district_name),
                "villages": tree.village_count,
                "tree_sha256": tree.digest,
            },
        },
        "reference_files": reference_audit,
        "support_files": support_audit,
        "dpt_backfill": dpt_audit,
        "contests": contest_audits,
        "name_aliases": {
            "note": "source spellings that differ from the canonical KPU village name",
            "count": len(leaf_aliases),
            "entries": {
                leaf_keys[village_code]: {
                    "canonical": tree.kel_name[village_code],
                    "source_names": sorted(names),
                }
                for village_code, names in sorted(leaf_aliases.items())
            },
        },
        "coverage_gap": {
            "note": (
                "kecamatan with no pilpres result at all; the KawalPemilu scrape of "
                "SITUNG never completed Papua's noken districts"
            ),
            "districts_total": len(tree.district_name),
            "districts_with_pilpres": len(pilpres_districts_seen),
            "districts_without_pilpres": len(missing_pilpres),
            "entries": missing_pilpres,
        },
        "totals": {
            "result_csv_files": sum(item["file_count"] for item in contest_audits.values()),
            "result_rows_read": sum(item["rows_read"] for item in contest_audits.values()),
            "result_rows_included": sum(item["rows_included"] for item in contest_audits.values()),
            "result_rows_rejected": sum(item["rows_rejected"] for item in contest_audits.values()),
            "support_csv_files": len(support_audit),
            "dpt_donor_csv_files": dpt_audit["file_count"],
            "all_csv_files": sum(item["file_count"] for item in contest_audits.values())
            + len(support_audit)
            + dpt_audit["file_count"],
            "all_csv_bytes": sum(item["source_bytes"] for item in contest_audits.values())
            + sum(item["bytes"] for item in support_audit)
            + dpt_audit["source_bytes"],
        },
        "hierarchy": {
            "province_groups": len(wilayah["prov"]),
            "domestic_provinces_2019": len(domestic_provinces),
            "regencies_and_overseas_units": len(all_regencies),
            "districts_and_overseas_units": len(all_districts),
            "villages_and_overseas_units": len(all_villages),
            "village_key": "official KPU wilayah id",
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
        "--pilpres-source",
        type=Path,
        default=DEFAULT_PILPRES_DIR,
        help="Folder containing the KawalPemilu per-province Pilpres CSVs",
    )
    parser.add_argument(
        "--tree-source",
        type=Path,
        default=DEFAULT_TREE_DIR,
        help="Folder containing the KPU wilayah node JSON dump",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_DIR / "data",
        help="Output data directory",
    )
    args = parser.parse_args()
    build(
        args.source.resolve(),
        args.output.resolve(),
        args.pilpres_source.resolve(),
        args.tree_source.resolve(),
    )


if __name__ == "__main__":
    main()
