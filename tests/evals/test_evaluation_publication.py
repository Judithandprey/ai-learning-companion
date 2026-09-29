"""Source-protecting output publication; every destructive probe uses temp copies.

Scoring/restart computation is stubbed in publication-only tests using retained
results; these checks do not claim a new quality measurement. CLI rejection and
abrupt-exit probes execute the real runtime in copied layouts.
"""

from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace

import pytest

from services.learning import evaluate as evaluation
from services.learning.archive import FixtureArchive, canonical, digest
from services.learning.retrieval import RetrievalIndex
from test_memory import tiny_bundle

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests/fixtures/memory"


@pytest.fixture
def layout(tmp_path, monkeypatch):
    originals = tmp_path / "originals"
    shutil.copytree(FIXTURES, originals)
    monkeypatch.setattr(evaluation, "FIXTURES", originals)
    before = evaluation.hashes(originals)
    assert len(before) == 187
    output = tmp_path / "output"
    output.mkdir()
    return originals, output, before


@pytest.fixture
def publication_only(layout, monkeypatch):
    """Exercise actual publication without re-scoring the frozen 80 queries."""
    retained = json.loads((ROOT / "docs/verification/learning/p0-05-time-fix/report.json").read_text())
    monkeypatch.setattr(evaluation, "run_candidate", lambda index, queries, labels, metadata:
                        deepcopy(retained["candidates"]["lexical_metadata" if metadata else "lexical_only"]))
    signature = digest(canonical({}))
    monkeypatch.setattr(evaluation, "signatures", lambda *args: {})
    real_run = evaluation.subprocess.run
    monkeypatch.chdir(layout[1])

    def recovered_child(command, **kwargs):
        if command[:4] != [sys.executable, "-m", "services.learning.evaluate", "--restart-probe"]:
            return real_run(command, **kwargs)
        RetrievalIndex.load_or_rebuild(FixtureArchive.load(evaluation.FIXTURES), Path(command[-1]))
        return SimpleNamespace(stdout=json.dumps({"signature": signature}))

    monkeypatch.setattr(evaluation.subprocess, "run", recovered_child)


@pytest.mark.parametrize("name", evaluation.OUTPUT_FILES)
@pytest.mark.parametrize("kind", ["symlink", "hardlink"])
def test_each_output_link_preserves_originals(layout, publication_only, capsys, name, kind):
    originals, output, before = layout
    target = output / name
    original = originals / "records.json"
    if kind == "symlink":
        target.symlink_to(original)
        with pytest.raises(ValueError, match="cannot overwrite fixtures"):
            evaluation.evaluate(output)
        assert target.is_symlink()
        assert capsys.readouterr().out == ""
    else:
        os.link(original, target)
        evaluation.evaluate(output)
        receipt = json.loads(capsys.readouterr().out)
        assert receipt["status"] == "complete"
        assert receipt["preservation"]["file_hashes_unchanged"] is True
        assert not target.samefile(original)
    assert evaluation.hashes(originals) == before


def test_output_set_and_stdout_receipt_are_bound_to_one_run(layout, publication_only, capsys):
    originals, output, before = layout
    evaluation.evaluate(output)
    receipt = json.loads(capsys.readouterr().out)
    summary = json.loads((output / "summary.json").read_text())
    report = json.loads((output / "report.json").read_text())
    preflight = json.loads((output / "preflight.json").read_text())
    assert receipt["run_id"] == summary["run_id"] == report["run_id"] == preflight["run_id"]
    assert summary["status"] == "published_unverified"
    assert summary["preservation"]["file_hashes_unchanged"] is None
    assert report["preservation"]["file_hashes_unchanged"] is None
    assert receipt["status"] == "complete"
    assert receipt["summary_sha256"] == digest((output / "summary.json").read_bytes())
    for name, expected in receipt["artifact_hashes"].items():
        assert digest((output / name).read_bytes()) == expected
    assert receipt["preservation"]["file_hashes_unchanged"] is True
    assert evaluation.hashes(originals) == before


def test_rejected_destination_leaves_previous_artifacts_untouched(layout, capsys):
    originals, output, before = layout
    for name in evaluation.OUTPUT_FILES:
        if name == "failures.json":
            (output / name).symlink_to(originals / "records.json")
        else:
            (output / name).write_bytes(canonical({"run_id": "old", "status": "complete"}))
    old = evaluation.hashes(output)
    with pytest.raises(ValueError, match="cannot overwrite fixtures"):
        evaluation.evaluate(output)
    assert evaluation.hashes(output) == old
    assert evaluation.hashes(originals) == before
    assert capsys.readouterr().out == ""


@pytest.mark.parametrize("name", evaluation.OUTPUT_FILES)
@pytest.mark.parametrize("when", ["before", "after"])
def test_failed_rerun_cannot_reuse_old_completion_marker(layout, publication_only, monkeypatch, capsys, name, when):
    originals, output, before = layout
    for filename in evaluation.OUTPUT_FILES:
        (output / filename).write_bytes(canonical({"run_id": "old", "status": "complete"}))
    write = evaluation.write_output

    def fail(path, value):
        if path.name == name and when == "before":
            raise OSError("injected publication failure")
        result = write(path, value)
        if path.name == name and when == "after":
            raise OSError("injected publication failure")
        return result

    monkeypatch.setattr(evaluation, "write_output", fail)
    with pytest.raises(OSError, match="injected publication"):
        evaluation.evaluate(output)
    assert not (output / "summary.json").exists()
    assert capsys.readouterr().out == ""
    assert evaluation.hashes(originals) == before


def test_final_write_is_included_in_preservation_check(layout, publication_only, monkeypatch, capsys):
    originals, output, before = layout
    write = evaluation.write_output

    def corrupt_copy_after_final_write(path, value):
        result = write(path, value)
        if path.name == "summary.json":
            # Intentionally mutate ONLY the copied original, never the repository.
            (originals / "README.md").write_text("injected concurrent modification")
        return result

    monkeypatch.setattr(evaluation, "write_output", corrupt_copy_after_final_write)
    with pytest.raises(AssertionError, match="changed during output publication"):
        evaluation.evaluate(output)
    assert evaluation.hashes(originals) != before
    assert not (output / "summary.json").exists()
    assert capsys.readouterr().out == ""


@pytest.mark.parametrize("stage", ["write", "fsync", "replace"])
def test_atomic_output_failure_preserves_previous_bytes(layout, monkeypatch, stage):
    originals, output, before = layout
    path = output / "report.json"
    path.write_bytes(b"previous valid artifact")

    def fail(*args, **kwargs):
        raise OSError("injected storage failure")

    if stage == "write":
        factory = evaluation.tempfile.NamedTemporaryFile

        def partial_stream(*args, **kwargs):
            stream = factory(*args, **kwargs)
            write = stream.write

            def partial(data):
                write(data[:4])
                fail()

            stream.write = partial
            return stream

        monkeypatch.setattr(evaluation.tempfile, "NamedTemporaryFile", partial_stream)
    else:
        monkeypatch.setattr(evaluation.os, stage, fail)
    with pytest.raises(OSError, match="injected storage"):
        evaluation.write_output(path, {"new": "artifact"})
    assert path.read_bytes() == b"previous valid artifact"
    assert sorted(p.name for p in output.iterdir()) == ["report.json"]
    assert evaluation.hashes(originals) == before


@pytest.mark.parametrize("name", ["labels.json", "queries.json", "manifest.json", "README.md"])
@pytest.mark.parametrize("destination", ["literal", "physical", "parent_alias"])
def test_metadata_symlink_destinations_are_protected(layout, tmp_path, name, destination):
    originals, output, before = layout
    external = tmp_path / "external"
    external.mkdir()
    physical = external / name
    (originals / name).rename(physical)
    (originals / name).symlink_to(physical)
    alias = tmp_path / "external-alias"
    alias.symlink_to(external, target_is_directory=True)
    path = {"literal": originals / name, "physical": physical, "parent_alias": alias / name}[destination]
    original_bytes = physical.read_bytes()
    with pytest.raises(ValueError, match="cannot overwrite fixtures"):
        evaluation.restart_probe(path)
    assert physical.read_bytes() == original_bytes
    assert evaluation.hashes(originals) == before


@pytest.mark.parametrize("new_file", [False, True])
def test_synthetic_directory_identity_alias_is_blocked(layout, tmp_path, monkeypatch, new_file):
    originals, output, before = layout
    alias = tmp_path / "synthetic-bind-or-case-alias"
    alias.mkdir()
    path = alias / ("new-index.json" if new_file else "records.json")
    if not new_file:
        shutil.copy(originals / "records.json", path)
    identify = evaluation.filesystem_identity
    monkeypatch.setattr(evaluation, "filesystem_identity", lambda p:
                        identify(originals) if p == alias else identify(p))
    with pytest.raises(ValueError, match="cannot overwrite fixtures"):
        evaluation.derived_path(path)
    assert evaluation.hashes(originals) == before


def test_synthetic_external_metadata_parent_identity_alias_is_blocked(layout, tmp_path, monkeypatch):
    originals, output, before = layout
    external = tmp_path / "external"
    alias = tmp_path / "synthetic-parent-alias"
    external.mkdir()
    alias.mkdir()
    physical = external / "labels.json"
    (originals / "labels.json").rename(physical)
    (originals / "labels.json").symlink_to(physical)
    target = alias / "LABELS.JSON"
    os.link(physical, target)  # Real file identity; simulated parent identity only.
    identify = evaluation.filesystem_identity
    monkeypatch.setattr(evaluation, "filesystem_identity", lambda p:
                        identify(external) if p == alias else identify(p))
    with pytest.raises(ValueError, match="cannot overwrite fixtures"):
        evaluation.derived_path(target)
    assert evaluation.hashes(originals) == before


def test_outside_hard_link_cache_replacement_keeps_original(layout):
    originals, output, before = layout
    cache = output / "index.json"
    os.link(originals / "records.json", cache)
    assert evaluation.derived_path(cache) == cache
    archive = FixtureArchive(*tiny_bundle())
    rebuilt = RetrievalIndex.load_or_rebuild(archive, cache)
    assert RetrievalIndex.load(archive, cache).payload == rebuilt.payload
    assert not cache.samefile(originals / "records.json")
    assert evaluation.hashes(originals) == before


@pytest.mark.parametrize("kind", ["fifo", "directory"])
@pytest.mark.parametrize("method", ["load", "load_or_rebuild", "save"])
def test_library_nonregular_snapshots_fail_without_open(tmp_path, monkeypatch, kind, method):
    path = tmp_path / "index.json"
    os.mkfifo(path) if kind == "fifo" else path.mkdir()
    archive = FixtureArchive(*tiny_bundle())

    def unexpected_open(*args, **kwargs):
        pytest.fail("Nonregular snapshot reached read_text (a FIFO would block)")

    monkeypatch.setattr(Path, "read_text", unexpected_open)
    with pytest.raises(OSError, match="must be a regular file"):
        if method == "save":
            RetrievalIndex(archive).save(path)
        else:
            getattr(RetrievalIndex, method)(archive, path)


@pytest.fixture
def cli_layout(layout, tmp_path):
    originals, output, before = layout
    project = tmp_path / "project"
    for relative in ("services/learning", "packages/contracts"):
        shutil.copytree(ROOT / relative, project / relative, ignore=shutil.ignore_patterns("__pycache__"))
    alias = project / "tests/fixtures/memory"
    alias.parent.mkdir(parents=True)
    alias.symlink_to(originals, target_is_directory=True)
    return project, originals, output, before


def cli(project, *args):
    return subprocess.run([sys.executable, "-B", "-m", "services.learning.evaluate", *map(str, args)],
                          cwd=project, capture_output=True, text=True, timeout=15)


@pytest.mark.parametrize("name", evaluation.OUTPUT_FILES)
def test_cli_symlink_output_is_rejected_before_publication(cli_layout, name):
    project, originals, output, before = cli_layout
    (output / name).symlink_to(originals / "records.json")
    result = cli(project, "--output", output)
    assert result.returncode == 1 and "cannot overwrite fixtures" in result.stderr
    assert result.stdout == ""
    assert evaluation.hashes(originals) == before


@pytest.mark.parametrize("option,name", [("--restart-probe", "index.json"),
                                         *[("--output", name) for name in evaluation.OUTPUT_FILES]])
def test_cli_fifo_fails_promptly(cli_layout, option, name):
    project, originals, output, before = cli_layout
    target = output / name
    os.mkfifo(target)
    result = cli(project, option, target if option == "--restart-probe" else output)
    assert result.returncode == 1 and "must be regular" in result.stderr
    assert result.stdout == ""
    assert evaluation.hashes(originals) == before


@pytest.mark.parametrize("after_write", [False, True])
def test_process_exit_during_new_preflight_cannot_leave_old_summary(cli_layout, after_write):
    project, originals, output, before = cli_layout
    for name in evaluation.OUTPUT_FILES:
        (output / name).write_bytes(canonical({"run_id": "old", "status": "complete"}))
    result = subprocess.run([sys.executable, "-B", "-c", """
import os, sys
from pathlib import Path
from services.learning import evaluate as e
write = e.write_output
def stop(path, value):
    if sys.argv[2] == 'True':
        write(path, value)
    os._exit(73)
e.write_output = stop
e.evaluate(Path(sys.argv[1]))
""", str(output), str(after_write)], cwd=project, capture_output=True, text=True, timeout=15)
    assert result.returncode == 73, result.stderr
    assert not (output / "summary.json").exists()
    assert result.stdout == ""
    assert evaluation.hashes(originals) == before


@pytest.mark.parametrize("root_alias", [False, True])
def test_inventory_ignores_only_root_relative_cache_parts(tmp_path, root_alias):
    root = tmp_path / "__pycache__" / "source"
    root.mkdir(parents=True)
    (root / "original.txt").write_bytes(b"original")
    (root / "__pycache__").mkdir()
    (root / "__pycache__" / "ignored.pyc").write_bytes(b"derived")
    if root_alias:
        alias = tmp_path / "alias"
        alias.symlink_to(root, target_is_directory=True)
        root = alias
    assert evaluation.hashes(root, required=True) == {"original.txt": digest(b"original")}


@pytest.mark.parametrize("kind", ["missing", "empty", "only_cache"])
def test_required_inventory_cannot_pass_vacuously(tmp_path, kind):
    root = tmp_path / "inventory"
    if kind != "missing":
        root.mkdir()
    if kind == "only_cache":
        (root / "__pycache__").mkdir()
        (root / "__pycache__" / "derived.pyc").write_bytes(b"cache")
    assert evaluation.hashes(root) == {}
    with pytest.raises(ValueError, match="Required file inventory is empty"):
        evaluation.hashes(root, required=True)


@pytest.mark.parametrize("inventory", ["fixtures", "implementation"])
def test_empty_required_inventory_prevents_publication(layout, monkeypatch, capsys, tmp_path, inventory):
    originals, output, before = layout
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(evaluation, "FIXTURES" if inventory == "fixtures" else "ROOT", empty)
    (output / "summary.json").write_bytes(b"previous summary")
    with pytest.raises(ValueError, match="Required file inventory is empty"):
        evaluation.evaluate(output)
    assert not list(output.iterdir())
    assert capsys.readouterr().out == ""
    assert evaluation.hashes(originals) == before


def test_empty_final_inventory_cannot_issue_receipt(layout, publication_only, monkeypatch, capsys):
    originals, output, before = layout
    moved = originals.with_name("moved-originals")
    write = evaluation.write_output

    def move_copy_after_summary(path, value):
        result = write(path, value)
        if path.name == "summary.json":
            originals.rename(moved)  # Only temporary copied source bytes, all retained.
        return result

    monkeypatch.setattr(evaluation, "write_output", move_copy_after_summary)
    with pytest.raises(ValueError, match="Required file inventory is empty"):
        evaluation.evaluate(output)
    assert not (output / "summary.json").exists()
    assert capsys.readouterr().out == ""
    assert evaluation.hashes(moved) == before


@pytest.mark.parametrize("cycle", [False, True])
def test_inventory_and_guard_reject_internal_directory_links(layout, tmp_path, cycle):
    originals, output, before = layout
    external = tmp_path / "external"
    external.mkdir()
    (external / "notes.json").write_bytes(b"retained external metadata")
    nested = originals / "nested"
    nested.mkdir()
    (nested / "alias").symlink_to(originals if cycle else external, target_is_directory=True)
    with pytest.raises(ValueError, match="Directory symlinks inside"):
        evaluation.hashes(originals, required=True)
    with pytest.raises(ValueError, match="Directory symlinks inside"):
        evaluation.restart_probe(external / "notes.json")
    assert (external / "notes.json").read_bytes() == b"retained external metadata"
    assert all(digest((originals / name).read_bytes()) == sha for name, sha in before.items())
    assert not list(output.iterdir())


@pytest.mark.parametrize("option", ["--restart-probe", "--output"])
def test_cli_rejects_originals_behind_nested_directory_links(cli_layout, tmp_path, option):
    project, originals, output, before = cli_layout
    linked, physical = tmp_path / "linked", tmp_path / "physical"
    linked.mkdir()
    physical.mkdir()
    note = physical / "notes.json"
    note.write_bytes(b"original reachable metadata")
    (linked / "notes.json").symlink_to(note)
    (linked / "inner").symlink_to(output, target_is_directory=True)
    (originals / "extra").symlink_to(linked, target_is_directory=True)
    for name in evaluation.OUTPUT_FILES:
        (output / name).write_bytes(b"previous output")
    result = cli(project, option, note if option == "--restart-probe" else output)
    assert result.returncode == 1 and "Directory symlinks inside" in result.stderr
    assert result.stdout == ""
    assert note.read_bytes() == b"original reachable metadata"
    assert all((output / name).read_bytes() == b"previous output" for name in evaluation.OUTPUT_FILES)
    assert all(digest((originals / name).read_bytes()) == sha for name, sha in before.items())
