from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_gis_data


FILES = (
    Path("provinsi.json"),
    Path("audit2019.json"),
    Path("kab/P1.json"),
    Path("kec/P1.1.json"),
    Path("desa/P1.1.1.json"),
)


def write_tree(root: Path, prefix: str) -> None:
    for rel in FILES:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{prefix}:{rel.as_posix()}", encoding="utf-8")


def assert_tree(root: Path, prefix: str) -> None:
    for rel in FILES:
        assert (root / rel).read_text(encoding="utf-8") == f"{prefix}:{rel.as_posix()}"


def test_successful_install() -> None:
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        output = root / "output"
        stage = root / "stage"
        write_tree(output, "old")
        write_tree(stage, "new")
        (output / "desa/stale.json").write_text("stale", encoding="utf-8")
        (output / "kecamatan.json").write_text("obsolete", encoding="utf-8")

        build_gis_data.install_transaction(stage, output)

        assert_tree(output, "new")
        assert not (output / "desa/stale.json").exists()
        assert not (output / "kecamatan.json").exists()
        assert not any((output / "_build").iterdir())


def test_failed_install_rolls_back() -> None:
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        output = root / "output"
        stage = root / "stage"
        write_tree(output, "old")
        write_tree(stage, "new")
        real_replace = os.replace
        failed_once = False

        def fail_one_replace(source, target):
            nonlocal failed_once
            if Path(target) == output / "kec/P1.1.json" and not failed_once:
                failed_once = True
                raise PermissionError("simulated lock")
            return real_replace(source, target)

        build_gis_data.os.replace = fail_one_replace
        try:
            try:
                build_gis_data.install_transaction(stage, output)
            except PermissionError as error:
                assert str(error) == "simulated lock"
            else:  # pragma: no cover - guards the fault injection itself
                raise AssertionError("The simulated lock did not fire")
        finally:
            build_gis_data.os.replace = real_replace

        assert_tree(output, "old")
        assert_tree(stage, "new")
        assert not any((output / "_build").iterdir())


if __name__ == "__main__":
    test_successful_install()
    test_failed_install_rolls_back()
    print("GIS install transaction: success and rollback passed")
