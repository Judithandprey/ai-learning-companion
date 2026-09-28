"""Independent QA checks of Learning's derived-index source protection (main 7b36cca).

Each test copies the runtime modules and all original fixture files into a
temporary directory, points `tests/fixtures/memory` at the copied originals
through a directory symlink, and runs the real `python -m services.learning.evaluate`
CLI there. The repository's real fixtures are never touched. Local filesystem and
process-exit behavior only: directory fsync, power loss, distributed filesystems
and concurrent writers are out of scope (and not claimed by the owner).
"""

import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests/fixtures/memory"


def inventory(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob("*")) if p.is_file()}


@pytest.fixture
def layout(tmp_path):
    case, originals = tmp_path / "case", tmp_path / "originals" / "memory"
    (case / "tests" / "fixtures").mkdir(parents=True)
    for name in ("services", "packages"):
        shutil.copytree(ROOT / name, case / name, ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(ROOT / "pyproject.toml", case / "pyproject.toml")
    shutil.copytree(FIXTURES, originals)
    (case / "tests" / "fixtures" / "memory").symlink_to(originals, target_is_directory=True)
    before = inventory(originals)
    assert len(before) == 187
    return case, originals, before


def run(case, *args):
    return subprocess.run([sys.executable, "-B", "-m", "services.learning.evaluate", *map(str, args)],
                          cwd=case, capture_output=True, text=True, timeout=600)


@pytest.mark.parametrize("target", ["alias", "physical", "new_inside"])
def test_restart_probe_into_the_symlinked_fixture_root_is_rejected(layout, target):
    case, originals, before = layout
    path = {"alias": "tests/fixtures/memory/records.json", "physical": originals / "records.json",
            "new_inside": "tests/fixtures/memory/new-index.json"}[target]
    result = run(case, "--restart-probe", path)
    assert result.returncode == 1 and "Derived output cannot overwrite fixtures" in result.stderr
    assert inventory(originals) == before


def test_restart_probe_outside_control_succeeds(layout, tmp_path):
    case, originals, before = layout
    (tmp_path / "outside").mkdir()
    result = run(case, "--restart-probe", tmp_path / "outside" / "index.json")
    assert result.returncode == 0 and '"signature"' in result.stdout
    assert inventory(originals) == before


def test_restart_probe_hard_link_to_an_original_is_replaced_not_written_through(layout, tmp_path):
    case, originals, before = layout
    link = tmp_path / "index.json"
    os.link(originals / "records.json", link)
    result = run(case, "--restart-probe", link)
    assert result.returncode == 0
    assert inventory(originals) == before  # os.replace swaps the name; the original inode keeps its bytes


@pytest.mark.parametrize("kind", ["symlink", "hardlink"])
@pytest.mark.xfail(strict=True, reason="QA-L05-01: evaluate writes report/summary/failures/preflight through a pre-existing link in an allowed --output directory, overwrites an original and exits 0")
def test_output_directory_file_links_cannot_overwrite_originals(layout, tmp_path, kind):
    case, originals, before = layout
    out = tmp_path / "out"
    out.mkdir()
    name = "report.json" if kind == "symlink" else "summary.json"
    (out / name).symlink_to(originals / "records.json") if kind == "symlink" else os.link(originals / "records.json", out / name)
    result = run(case, "--output", out)
    assert inventory(originals) == before, f"exit {result.returncode}; original records.json overwritten"
