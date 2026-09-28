"""Consequential provenance/lifecycle checks, separate from retrieval scores."""

from copy import deepcopy
import json
from pathlib import Path

import pytest

from services.learning.archive import FixtureArchive, digest, identity
from services.learning.retrieval import RetrievalIndex

ROOT = Path(__file__).resolve().parents[1] / "fixtures/memory"


@pytest.fixture(scope="module")
def archive():
    return FixtureArchive.load(ROOT)


@pytest.fixture(scope="module")
def index(archive):
    return RetrievalIndex(archive)


def tiny_bundle():
    all_records = json.loads((ROOT / "records.json").read_text())
    sources = [s for s in all_records["sources"] if s["source_id"] == "e-source-02"]
    frames = [f for f in all_records["frames"] if f["source_id"] == "e-source-02"]
    events = [e for e in all_records["observations"] if e["source_id"] == "e-source-02"]
    manifest = json.loads((ROOT / "manifest.json").read_text())
    artifacts = {f["artifact_id"]: (ROOT / manifest["artifacts"][f["artifact_id"]]).read_bytes() for f in frames}
    return sources, frames, events, artifacts


def test_same_topic_different_course_actor_version_is_not_success(index):
    result = index.search({"text": "bridge resistor", "actor": "teacher", "project_id": "circuits", "source_version": 1}, user_id="synthetic-learner")
    assert result["hits"]
    assert all(h["actor"] == "teacher" and h["project_id"] == "circuits" and h["source_version"] == 1 for h in result["hits"])
    assert any(h["event_id"] == "e-04-t" for h in result["hits"])
    assert identity(result["hits"][0]) != {**identity(result["hits"][0]), "source_version": 2}


def test_correction_keeps_original_but_excludes_it_from_current(index):
    query = {"text": "basis physical arrow", "project_id": "algebra", "actor": "user", "before": "2025-02-15T00:00:00Z"}
    history = index.search({**query, "mode": "history"}, user_id="synthetic-learner")["hits"]
    current = index.search({**query, "mode": "current"}, user_id="synthetic-learner")["hits"]
    assert {"e-02-u", "e-02-c"} <= {h["event_id"] for h in history}
    assert "e-02-u" not in {h["event_id"] for h in current}
    assert next(h for h in current if h["event_id"] == "e-02-c")["correction_of"] == "e-02-u"


def test_changed_source_version_does_not_rebind_old_evidence(index):
    old = index.archive.evidence(("synthetic-learner", "e-04-u"))
    new = index.archive.evidence(("synthetic-learner", "e-25-u"))
    assert old["source_id"] == new["source_id"] and old["source_version"] == 1 and new["source_version"] == 2
    assert old["frame_id"] != new["frame_id"] and old["source_hash"] != new["source_hash"]
    hits = index.search({"text": "bridge resistor", "mode": "current"}, user_id="synthetic-learner")["hits"]
    assert not any(h["source_id"] == "e-source-04" and h["source_version"] == 1 for h in hits)


def test_missing_media_does_not_create_frame_or_audio_claim(index):
    event = index.archive.evidence(("synthetic-learner", "e-22-u"))
    assert event["frame"] is None and event["frame_id"] is None and event["gap_flags"] == ["missing_frame"]
    event = index.archive.evidence(("synthetic-learner", "e-23-t"))
    assert "missing_audio" in event["gap_flags"]


def test_unknown_query_reports_not_found_not_never_said(index):
    result = index.search({"text": "zznonexistentzz"}, user_id="synthetic-learner")
    assert result == {"status": "not_found", "hits": []}


def test_user_scope_cannot_be_overridden(index):
    assert not index.search({"text": "basis"}, user_id="another-user")["hits"]
    with pytest.raises(ValueError):
        index.search({"text": "basis", "user_id": "synthetic-learner"}, user_id="another-user")


def test_real_second_user_is_isolated():
    sources, frames, events, artifacts = tiny_bundle()
    other_sources, other_frames, other_events = deepcopy((sources, frames, events))
    for record in other_sources + other_frames + other_events:
        record["user_id"] = "other-user"
    archive = FixtureArchive(sources + other_sources, frames + other_frames, events + other_events, artifacts)
    hits = RetrievalIndex(archive).search({"text": "basis arrow"}, user_id="other-user")["hits"]
    assert hits and all(h["user_id"] == "other-user" for h in hits)


@pytest.mark.parametrize("mutation", ["source_bytes", "artifact_bytes", "frame_owner", "frame_version", "correction_order", "correction_actor", "duplicate_sequence"])
def test_invalid_originals_fail_closed(mutation):
    sources, frames, events, artifacts = tiny_bundle()
    if mutation == "source_bytes":
        sources[0]["text"] += " altered"
    elif mutation == "artifact_bytes":
        artifacts[frames[0]["artifact_id"]] += b"altered"
    elif mutation == "frame_owner":
        frames[0]["user_id"] = "foreign-user"
    elif mutation == "frame_version":
        events[0]["source_version"] = 2
    elif mutation == "correction_order":
        events[2]["captured_at"] = events[1]["captured_at"]
    elif mutation == "correction_actor":
        events[2]["actor"] = "assistant"
    else:
        events[1]["device_sequence"] = events[0]["device_sequence"]
    with pytest.raises((ValueError, KeyError)):
        FixtureArchive(sources, frames, events, artifacts)


def test_reloaded_index_rejects_changed_and_deleted_originals(tmp_path):
    sources, frames, events, artifacts = tiny_bundle()
    archive = FixtureArchive(sources, frames, events, artifacts)
    path = tmp_path / "index.json"
    RetrievalIndex(archive).save(path)
    events[0]["text"] += " Updated observation."
    changed = FixtureArchive(sources, frames, events, artifacts)
    with pytest.raises(ValueError, match="Stale"):
        RetrievalIndex.load(changed, path)
    deleted = FixtureArchive([], [], [], {})
    with pytest.raises(ValueError, match="Stale"):
        RetrievalIndex.load(deleted, path)
    assert RetrievalIndex(deleted).search({"text": "basis"}, user_id="synthetic-learner")["hits"] == []


def test_manifest_detects_tampered_file_and_path_escape(tmp_path):
    (tmp_path / "records.json").write_text("{}")
    manifest = {"files": {"records.json": digest(b"different")}}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="hash mismatch"):
        FixtureArchive.load(tmp_path)
    manifest["files"] = {"../escape": digest(b"ignored")}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="leaves root"):
        FixtureArchive.load(tmp_path)


def test_labels_are_full_evidence_anchors(archive):
    queries = json.loads((ROOT / "queries.json").read_text())
    labels = json.loads((ROOT / "labels.json").read_text())
    assert len(queries) == len(labels) == 80
    for item in queries:
        assert "required" not in item["query"]
        for target in labels[item["id"]]["required"]:
            assert target == identity(archive.events[(target["user_id"], target["event_id"])])


def test_mastery_evidence_is_not_inferred_from_exposure(index):
    examples = {scene: index.archive.evidence(("synthetic-learner", f"e-{scene}-u"))["text"] for scene in ("27", "28", "29", "30")}
    assert "calendar" in examples["27"]
    assert "without attempting" in examples["28"]
    assert "feel" in examples["29"]
    assert "without hints" in examples["30"]
    assert "mastery" not in index.archive.evidence(("synthetic-learner", "e-29-u"))


@pytest.mark.parametrize(("prior_suffix", "correction_suffix", "valid"), [
    ("Z", ".500Z", True),
    (".500Z", "Z", False),
    ("Z", ".000Z", False),
    (".000Z", "Z", False),
    (".0Z", ".000Z", False),
    (".1234561Z", ".1234562Z", True),
    (".1234562Z", ".1234561Z", False),
    (".123456789012345678901Z", ".123456789012345678902Z", True),
    (".12345678901234567890100Z", ".123456789012345678901Z", False),
    ("Z", "." + "0" * 5000 + "1Z", True),
])
def test_correction_order_uses_exact_instant(prior_suffix, correction_suffix, valid):
    sources, frames, events, artifacts = tiny_bundle()
    original = next(e for e in events if e["event_id"] == "e-02-u")
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    original["captured_at"] = "2025-01-03T00:00:00" + prior_suffix
    correction["captured_at"] = "2025-01-03T00:00:00" + correction_suffix
    if valid:
        archive = FixtureArchive(sources, frames, events, artifacts)
        # Parsing for comparisons must not normalize/rewrite original records.
        assert archive.evidence(("synthetic-learner", "e-02-c"))["captured_at"] == correction["captured_at"]
    else:
        with pytest.raises(ValueError, match="correction"):
            FixtureArchive(sources, frames, events, artifacts)


@pytest.mark.parametrize("event_suffix", ["Z", ".0Z", ".000Z"])
@pytest.mark.parametrize("bound_suffix", ["Z", ".0Z", ".000Z"])
@pytest.mark.parametrize(("boundary", "included"), [("after", True), ("before", False)])
def test_equivalent_second_boundary_is_inclusive_after_exclusive_before(event_suffix, bound_suffix, boundary, included):
    sources, frames, events, artifacts = tiny_bundle()
    original = next(e for e in events if e["event_id"] == "e-02-u")
    original["captured_at"] = "2025-01-03T00:00:00" + event_suffix
    index = RetrievalIndex(FixtureArchive(sources, frames, events, artifacts))
    result = index.search({"text": "basis", "actor": "user", boundary: "2025-01-03T00:00:00" + bound_suffix},
                          user_id="synthetic-learner")
    assert ("e-02-u" in {h["event_id"] for h in result["hits"]}) is included


@pytest.mark.parametrize(("event_time", "bound", "before_included"), [
    ("2025-01-03T00:00:00Z", "2025-01-03T00:00:00.500Z", True),
    ("2025-01-03T00:00:00.500Z", "2025-01-03T00:00:00Z", False),
    ("2025-01-03T00:00:00.1234561Z", "2025-01-03T00:00:00.1234562Z", True),
    ("2025-01-03T00:00:00.1234562Z", "2025-01-03T00:00:00.1234561Z", False),
    ("2025-01-03T00:00:00.123456789012345678901Z", "2025-01-03T00:00:00.123456789012345678902Z", True),
    ("2025-01-03T00:00:00.123456789012345678901Z", "2025-01-03T00:00:00.12345678901234567890100Z", False),
    ("2025-01-03T00:00:00Z", "2025-01-03T00:00:00." + "0" * 5000 + "1Z", True),
    ("2025-01-03T00:00:00." + "0" * 5000 + "1Z", "2025-01-03T00:00:00Z", False),
    ("2025-01-03t00:00:00.5Z", "2025-01-03T00:00:00.500Z", False),
    ("2025-01-02T23:59:59.999999999Z", "2025-01-03T00:00:00Z", True),
])
def test_fractional_and_calendar_boundaries_are_exact(event_time, bound, before_included):
    sources, frames, events, artifacts = tiny_bundle()
    original = next(e for e in events if e["event_id"] == "e-02-u")
    original["captured_at"] = event_time
    index = RetrievalIndex(FixtureArchive(sources, frames, events, artifacts))
    for boundary, included in (("before", before_included), ("after", not before_included)):
        result = index.search({"text": "basis", "actor": "user", boundary: bound}, user_id="synthetic-learner")
        assert ("e-02-u" in {h["event_id"] for h in result["hits"]}) is included


def test_original_fixture_is_retrievable_before_fractional_second(index):
    query = {"text": "basis", "actor": "user", "project_id": "algebra", "before": "2025-01-03T00:00:00.500Z"}
    assert "e-02-u" in {h["event_id"] for h in index.search(query, user_id="synthetic-learner")["hits"]}
