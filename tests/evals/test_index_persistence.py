"""Derived-cache failures must never become source evidence or destroy old snapshots."""

from copy import deepcopy
import errno
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

from services.learning import retrieval
from services.learning.archive import FixtureArchive, canonical
from services.learning.evaluate import FIXTURES, hashes, restart_probe, signatures
from services.learning.retrieval import InvalidIndexError, RetrievalIndex
from test_memory import tiny_bundle


@pytest.fixture(scope="module")
def archive():
    return FixtureArchive.load(FIXTURES)


@pytest.fixture(scope="module")
def payload(archive):
    return RetrievalIndex(archive).payload


DAMAGE = [
    "null", "array", "truncated", "utf8", "duplicate_member", "missing_field", "extra_field",
    "version", "fingerprint", "docs_null", "docs_object", "doc_null", "doc_extra",
    "key_nested", "key_short", "key_wrong", "duplicate_event", "missing_event",
    "counts_array", "count_zero", "count_negative", "count_bool", "count_float", "count_nan",
    "length_bool", "length_float", "length_negative", "length_mismatch",
    "plausible_wrong_terms", "plausible_wrong_frequency",
]


def damaged_bytes(payload, damage):
    if damage == "null":
        return b"null"
    if damage == "array":
        return b"[]"
    if damage == "truncated":
        return canonical(payload)[:100]
    if damage == "utf8":
        return b'"\xff"'
    if damage == "duplicate_member":
        return canonical(payload).replace(b'"docs":', b'"docs":[],"docs":', 1)
    data = deepcopy(payload)
    doc = data["docs"][0]
    term = next(iter(doc["counts"]))
    if damage == "missing_field":
        del data["docs"]
    elif damage == "extra_field":
        data["unexpected"] = None
    elif damage in ("version", "fingerprint"):
        data["version" if damage == "version" else "archive_fingerprint"] = "wrong"
    elif damage in ("docs_null", "docs_object"):
        data["docs"] = None if damage == "docs_null" else {}
    elif damage == "doc_null":
        data["docs"][0] = None
    elif damage == "doc_extra":
        doc["extra"] = "untrusted"
    elif damage.startswith("key_"):
        doc["key"] = {"key_nested": [[], {}], "key_short": [], "key_wrong": ["other-user", "made-up"]}[damage]
    elif damage == "duplicate_event":
        data["docs"].append(deepcopy(doc))
    elif damage == "missing_event":
        data["docs"].pop()
    elif damage == "counts_array":
        doc["counts"] = []
    elif damage.startswith("count_"):
        doc["counts"][term] = {"count_zero": 0, "count_negative": -1, "count_bool": True,
                               "count_float": float(doc["counts"][term]), "count_nan": float("nan")}[damage]
    elif damage.startswith("length_"):
        doc["length"] = {"length_bool": True, "length_float": float(doc["length"]),
                         "length_negative": -1, "length_mismatch": doc["length"] + 1}[damage]
    elif damage == "plausible_wrong_terms":
        doc["counts"]["inventedterm"] = doc["counts"].pop(term)
    elif damage == "plausible_wrong_frequency":
        doc["counts"][term] += 1
        doc["length"] += 1
    else:
        raise AssertionError(damage)
    return json.dumps(data).encode()


@pytest.mark.parametrize("damage", DAMAGE)
def test_reject_and_rebuild_bad_snapshot(archive, payload, tmp_path, damage):
    path = tmp_path / "index.json"
    damaged = damaged_bytes(payload, damage)
    path.write_bytes(damaged)
    with pytest.raises(InvalidIndexError):
        RetrievalIndex.load(archive, path)
    assert path.read_bytes() == damaged  # Strict load never writes.
    recovered = RetrievalIndex.load_or_rebuild(archive, path)
    assert recovered.payload == payload
    assert path.read_bytes() == canonical(payload) + b"\n"
    assert RetrievalIndex.load(archive, path).payload == payload
    assert list(tmp_path.iterdir()) == [path]


def test_roundtrip_missing_rebuild_and_all_originals_preserved(archive, payload, tmp_path):
    before = hashes(FIXTURES)
    assert len(before) == 187
    queries = json.loads((FIXTURES / "queries.json").read_text())
    expected = RetrievalIndex(archive)
    ranked = signatures(expected, queries)
    path = tmp_path / "index.json"
    expected.save(path)
    saved = path.read_bytes()
    assert signatures(RetrievalIndex.load(FixtureArchive.load(FIXTURES), path), queries) == ranked
    # A valid snapshot is loaded without another write, even on the recovery path.
    modified = path.stat().st_mtime_ns
    assert RetrievalIndex.load_or_rebuild(archive, path).payload == payload
    assert path.stat().st_mtime_ns == modified
    path.unlink()
    assert restart_probe(path)["signature"]  # Exercise the actual CLI recovery function.
    assert path.read_bytes() == saved
    assert signatures(RetrievalIndex.load(archive, path), queries) == ranked
    assert hashes(FIXTURES) == before


def old_and_new():
    sources, frames, events, artifacts = tiny_bundle()
    old = FixtureArchive(sources, frames, events, artifacts)
    events[0]["text"] += " Additional synthetic observation content."
    new = FixtureArchive(sources, frames, events, artifacts)
    return old, new


@pytest.mark.parametrize("stage", ["create", "write", "flush", "fsync", "replace", "interrupt"])
def test_failed_update_preserves_previous_valid_snapshot(tmp_path, monkeypatch, stage):
    old, new = old_and_new()
    path = tmp_path / "index.json"
    RetrievalIndex(old).save(path)
    saved = path.read_bytes()
    error = KeyboardInterrupt if stage == "interrupt" else OSError

    def fail(*args, **kwargs):
        if stage == "interrupt":
            raise KeyboardInterrupt("injected before publication")
        raise OSError(errno.ENOSPC, "injected persistence failure")

    with monkeypatch.context() as patch:
        if stage in ("write", "flush"):
            factory = retrieval.tempfile.NamedTemporaryFile

            def failing_stream(*args, **kwargs):
                stream = factory(*args, **kwargs)
                if stage == "write":
                    write = stream.write

                    def partial_write(data):
                        write(data[:50])
                        fail()

                    stream.write = partial_write
                else:
                    stream.flush = fail
                return stream

            patch.setattr(retrieval.tempfile, "NamedTemporaryFile", failing_stream)
        elif stage == "create":
            patch.setattr(retrieval.tempfile, "NamedTemporaryFile", fail)
        else:
            patch.setattr(retrieval.os, "fsync" if stage == "fsync" else "replace", fail)
        with pytest.raises(error):
            RetrievalIndex(new).save(path)
    assert path.read_bytes() == saved
    assert RetrievalIndex.load(old, path).payload == RetrievalIndex(old).payload
    with pytest.raises(InvalidIndexError):
        RetrievalIndex.load(new, path)
    assert list(tmp_path.iterdir()) == [path]
    # Retry is deterministic and advances only the derived snapshot.
    RetrievalIndex(new).save(path)
    assert path.read_bytes() != saved
    assert RetrievalIndex.load(new, path).payload == RetrievalIndex(new).payload


@pytest.mark.parametrize("after_replace", [False, True])
def test_abrupt_exit_at_publication_boundary(tmp_path, after_replace):
    old, new = old_and_new()
    path = tmp_path / "index.json"
    RetrievalIndex(old).save(path)
    child = subprocess.run([sys.executable, "-c", """
import os, sys
from pathlib import Path
from services.learning import retrieval
from services.learning.retrieval import RetrievalIndex
from tests.evals.test_index_persistence import old_and_new
_, new = old_and_new()
replace = os.replace
def interrupted(source, destination):
    if sys.argv[2] == 'True':
        replace(source, destination)
    os._exit(73)
retrieval.os.replace = interrupted
RetrievalIndex(new).save(Path(sys.argv[1]))
""", str(path), str(after_replace)], capture_output=True, text=True,
        env={**os.environ, "PYTHONPATH": str(Path(__file__).parent)}, timeout=30)
    assert child.returncode == 73, child.stderr
    authoritative = new if after_replace else old
    assert path.read_bytes() == canonical(RetrievalIndex(authoritative).payload) + b"\n"
    assert RetrievalIndex.load(authoritative, path).payload == RetrievalIndex(authoritative).payload
    leftovers = list(tmp_path.glob(".index.json.*.tmp"))
    assert len(leftovers) == (0 if after_replace else 1)
    # Orphaned complete/partial temp files are not candidates for loading/promotion.
    if leftovers:
        leftovers[0].write_bytes(b'{"incomplete":')
    path.unlink()
    recovered = RetrievalIndex.load_or_rebuild(new, path)
    assert recovered.payload == RetrievalIndex(new).payload
    assert list(tmp_path.glob(".index.json.*.tmp")) == leftovers


def test_recovery_uses_changed_and_deleted_archive(tmp_path):
    old, new = old_and_new()
    path = tmp_path / "index.json"
    RetrievalIndex(old).save(path)
    assert RetrievalIndex.load_or_rebuild(new, path).payload == RetrievalIndex(new).payload
    deleted = FixtureArchive([], [], [], {})
    recovered = RetrievalIndex.load_or_rebuild(deleted, path)
    assert recovered.search({"text": "basis"}, user_id="synthetic-learner")["hits"] == []
    assert recovered.payload["docs"] == []
    assert RetrievalIndex.load(deleted, path).payload == recovered.payload


def test_storage_errors_are_not_reported_as_recovered(archive, tmp_path, monkeypatch):
    path = tmp_path / "index.json"
    path.write_bytes(b"truncated")
    with monkeypatch.context() as patch:
        def fail(*args, **kwargs):
            raise PermissionError("injected")
        patch.setattr(retrieval.os, "replace", fail)
        with pytest.raises(PermissionError):
            RetrievalIndex.load_or_rebuild(archive, path)
    assert path.read_bytes() == b"truncated"
    assert list(tmp_path.iterdir()) == [path]
    with monkeypatch.context() as patch:
        patch.setattr(Path, "read_text", fail)
        with pytest.raises(PermissionError):
            RetrievalIndex.load_or_rebuild(archive, path)


def test_invalid_in_memory_update_does_not_replace_valid_snapshot(archive, tmp_path):
    path = tmp_path / "index.json"
    index = RetrievalIndex(archive)
    index.save(path)
    saved = path.read_bytes()
    index.payload["docs"][0]["length"] = -1
    with pytest.raises(InvalidIndexError):
        index.save(path)
    assert path.read_bytes() == saved
    assert list(tmp_path.iterdir()) == [path]


@pytest.mark.parametrize("alias", [False, True])
def test_restart_probe_cannot_replace_an_original(tmp_path, alias):
    before = hashes(FIXTURES)
    path = FIXTURES / "records.json"
    if alias:
        link = tmp_path / "source-link"
        link.symlink_to(path)
        path = link
    with pytest.raises(ValueError, match="cannot overwrite fixtures"):
        restart_probe(path)
    assert hashes(FIXTURES) == before


@pytest.mark.parametrize("option", ["--restart-probe", "--output"])
@pytest.mark.parametrize("destination", ["alias", "physical", "inside", "outside"])
def test_cli_protects_relocated_fixture_root(tmp_path, option, destination):
    # Run the real module in an isolated layout; never relocate the frozen corpus.
    project = tmp_path / "project"
    for relative in ("services/learning", "packages/contracts"):
        shutil.copytree(FIXTURES.parents[2] / relative, project / relative,
                        ignore=shutil.ignore_patterns("__pycache__"))
    originals = tmp_path / "relocated-originals"
    shutil.copytree(FIXTURES, originals)
    alias = project / "tests/fixtures/memory"
    alias.parent.mkdir(parents=True)
    alias.symlink_to(originals, target_is_directory=True)
    before = hashes(originals)
    assert len(before) == 187
    if destination == "outside":
        # A sibling with the same name prefix must remain a valid derived location.
        target = tmp_path / "relocated-originals-derived"
    elif destination == "inside":
        target = alias / "new-derived"
    else:
        target = alias if destination == "alias" else originals
        if option == "--restart-probe":
            target /= "records.json"
    child = subprocess.run([sys.executable, "-m", "services.learning.evaluate", option, str(target)],
                           cwd=project, env={**os.environ, "PYTHONPATH": str(project)},
                           capture_output=True, text=True, timeout=30)
    if destination == "outside":
        assert child.returncode == 0, child.stderr
        assert target.exists()
        result = json.loads(child.stdout)
        if option == "--restart-probe":
            assert result["signature"]
        else:
            assert result["preservation"]["file_hashes_unchanged"]
    else:
        assert child.returncode != 0, "CLI must refuse original-archive destinations"
        assert "Derived output cannot overwrite fixtures" in child.stderr
    assert hashes(originals) == before
    assert hashes(FIXTURES) == before
