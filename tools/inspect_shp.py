"""Print a compact schema and record preview for one or more shapefiles."""

from __future__ import annotations

import argparse
from pathlib import Path

import shapefile


def inspect(shp_path: Path, limit: int) -> None:
    print(f"=== Inspecting {shp_path} ===")
    with shapefile.Reader(str(shp_path)) as source:
        fields = [field[0] for field in source.fields[1:]]
        print("Fields:", fields)
        print("Total records:", len(source))
        for index in range(min(limit, len(source))):
            record = source.record(index)
            print(f"Record {index}:", dict(zip(fields, record)))
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path, help="Shapefile paths")
    parser.add_argument("--limit", type=int, default=5, help="Records per file")
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("--limit must be non-negative")
    for path in args.paths:
        inspect(path.resolve(), args.limit)


if __name__ == "__main__":
    main()
