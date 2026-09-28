"""Executable context boundaries over unchanged synthetic v0.1 source records."""

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

import pytest

from services.learning.archive import FixtureArchive, canonical
from services.learning.context import assemble_context
from services.learning.evaluate import FIXTURES, hashes
from services.learning.retrieval import RetrievalIndex
from test_memory import tiny_bundle

USER = "synthetic-learner"
QUERY = {"text": "basis physical arrow", "actor": "user", "project_id": "algebra"}


def assemble(archive, query=None, **kwargs):
    return assemble_context(archive, RetrievalIndex(archive), QUERY if query is None else query,
                            user_id=kwargs.pop("user_id", USER), **kwargs)


def by_id(packet):
    return {item["evidence"]["event_id"]: item for item in packet["items"]}


@pytest.fixture(scope="module")
def archive():
    return FixtureArchive.load(FIXTURES)


def test_current_default_history_explicit_and_originals_unmodified(archive):
    index = RetrievalIndex(archive)
    original = index.search(QUERY, user_id=USER)
    before = hashes(FIXTURES)
    current = assemble_context(archive, index, QUERY, user_id=USER)
    rows = by_id(current)
    assert current["query"]["mode"] == "current"
    assert rows["e-02-u"]["origin"] == "correction_neighbor"
    assert rows["e-02-u"]["snapshot_status"] == "historical"
    assert rows["e-02-u"]["superseded_by_correction"]
    assert rows["e-02-c"]["snapshot_status"] == "current_candidate"
    assert rows["e-02-c"]["evidence"]["correction_of"] == "e-02-u"
    history = assemble(archive, {**QUERY, "mode": "history"})
    assert by_id(history)["e-02-u"]["origin"] == "retrieval"
    assert index.search(QUERY, user_id=USER) == original
    assert "mode" not in QUERY
    assert hashes(FIXTURES) == before and len(before) == 187


def test_current_time_filter_is_not_as_of_and_future_relation_is_explicit():
    archive = FixtureArchive(*tiny_bundle())
    query = {**QUERY, "before": "2025-01-03T00:00:00.5Z"}
    packet = assemble(archive, query)
    assert packet["items"] == []
    assert packet["retrieval"]["status"] == "not_found"
    assert packet["temporal_semantics"] == "snapshot_current_not_as_of"
    historical = by_id(assemble(archive, {**query, "mode": "history"}))
    original = historical["e-02-u"]
    assert original["snapshot_status"] == "historical"
    assert original["correction_relations"] == [{"direction": "corrected_by", "availability": "filtered_or_unavailable",
                                                 "reason": "outside_capture_time_filter"}]
    assert "e-02-c" not in historical
    later = by_id(assemble(archive, {**QUERY, "after": "2025-01-03T00:00:00.5Z"}))
    assert "e-02-u" not in later
    assert later["e-02-c"]["correction_resolution"] == "unknown_filtered_relation"


@pytest.mark.parametrize("bound,included", [
    ("2025-01-03T00:00:00.123456789012345678901Z", False),
    ("2025-01-03T00:00:00.123456789012345678902Z", True),
])
def test_exact_fractional_time_controls_hit_and_neighbor_expansion(bound, included):
    sources, frames, events, artifacts = tiny_bundle()
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    correction["captured_at"] = "2025-01-03T00:00:00.123456789012345678901Z"
    correction["received_at"] = "2026-01-03T00:00:00Z"
    archive = FixtureArchive(sources, frames, events, artifacts)
    rows = by_id(assemble(archive, {**QUERY, "before": bound}))
    assert ("e-02-c" in rows) is included
    if included:
        assert rows["e-02-c"]["evidence"]["captured_at"] == correction["captured_at"]
        assert rows["e-02-c"]["evidence"]["received_at"] == correction["received_at"]
        assert rows["e-02-c"]["evidence"]["frame"]["captured_at"] != correction["captured_at"]


@pytest.mark.parametrize("blocked_by", ["source_unavailable", "outside_project_id_filter", "outside_source_version_filter"])
def test_correction_expansion_checks_access_and_metadata_before_evidence(monkeypatch, blocked_by):
    sources, frames, events, artifacts = tiny_bundle()
    newer = deepcopy(sources[0])
    newer["source_version"] = 2
    if blocked_by == "source_unavailable":
        sources[0]["access_status"] = "needs_auth"
    elif blocked_by == "outside_project_id_filter":
        newer["project_id"] = "other-course"
    sources.append(newer)
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    correction.update(source_version=2, frame_id=None, gap_flags=["missing_frame"])
    archive = FixtureArchive(sources, frames, events, artifacts)
    query = {**QUERY, "project_id": newer["project_id"]}
    if blocked_by == "outside_source_version_filter":
        query["source_version"] = 2
    calls = []
    accessor = archive.evidence

    def checked(key):
        assert key[1] != "e-02-u", "Blocked ancestor reached the raw evidence accessor"
        calls.append(key)
        return accessor(key)

    monkeypatch.setattr(archive, "evidence", checked)
    rows = by_id(assemble(archive, query))
    assert set(rows) == {"e-02-c"} and calls
    assert rows["e-02-c"]["correction_relations"] == [
        {"direction": "corrects", "availability": "filtered_or_unavailable", "reason": blocked_by}]
    assert rows["e-02-c"]["evidence"]["frame"] is None


def test_competing_corrections_and_descendants_never_choose_a_timestamp_winner():
    sources, frames, events, artifacts = tiny_bundle()
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    branch = {**correction, "event_id": "branch", "device_sequence": 99,
              "captured_at": "2025-01-03T02:00:00Z", "text": "Another basis arrow correction."}
    descendant = {**correction, "event_id": "descendant", "device_sequence": 100,
                  "correction_of": correction["event_id"], "captured_at": "2025-01-03T03:00:00Z"}
    events.extend([branch, descendant])
    archive = FixtureArchive(sources, frames, events, artifacts)
    rows = by_id(assemble(archive))
    assert set(rows) == {"e-02-u", "e-02-c", "branch", "descendant"}
    assert all(r["correction_resolution"] == "competing_branches_unresolved" for r in rows.values())
    assert rows["e-02-c"]["snapshot_status"] == "historical"
    assert rows["branch"]["snapshot_status"] == rows["descendant"]["snapshot_status"] == "current_candidate"
    assert all(r["correction_reason"] is None for r in rows.values())


def test_unavailable_correction_child_is_explicit_without_reading_its_evidence(monkeypatch):
    sources, frames, events, artifacts = tiny_bundle()
    unavailable = {**sources[0], "source_version": 2, "access_status": "temporarily_unavailable"}
    sources.append(unavailable)
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    correction.update(source_version=2, frame_id=None, gap_flags=["missing_frame"])
    archive = FixtureArchive(sources, frames, events, artifacts)
    accessor = archive.evidence

    def checked(key):
        assert key[1] != "e-02-c"
        return accessor(key)

    monkeypatch.setattr(archive, "evidence", checked)
    rows = by_id(assemble(archive, {**QUERY, "mode": "history"}))
    assert set(rows) == {"e-02-u"}
    assert rows["e-02-u"]["correction_relations"] == [
        {"direction": "corrected_by", "availability": "filtered_or_unavailable", "reason": "source_unavailable"}]
    assert rows["e-02-u"]["snapshot_status"] == "historical"
    assert rows["e-02-u"]["correction_resolution"] == "unknown_filtered_relation"
    assert not assemble(archive)["items"]  # Unavailable latest source does not revive its predecessor.


def test_two_users_and_teacher_user_assistant_are_separate():
    sources, frames, events, artifacts = tiny_bundle()
    other_sources, other_frames, other_events = deepcopy((sources, frames, events))
    for record in other_sources + other_frames + other_events:
        record["user_id"] = "other-user"
    archive = FixtureArchive(sources + other_sources, frames + other_frames, events + other_events, artifacts)
    for user in (USER, "other-user"):
        for actor in ("user", "teacher", "assistant"):
            packet = assemble(archive, {**QUERY, "actor": actor}, user_id=user)
            assert packet["items"]
            assert all(item["evidence"]["user_id"] == user and item["evidence"]["actor"] == actor
                       for item in packet["items"])
    with pytest.raises(ValueError, match="Unsupported"):
        assemble(archive, {**QUERY, "user_id": "other-user"})


@pytest.mark.parametrize("query", [{"text": "basis", "mode": "as_of"}, {"text": "basis", "made_up": True}])
def test_invalid_queries_remain_rejected(archive, query):
    with pytest.raises(ValueError):
        assemble(archive, query)


@pytest.mark.parametrize("kwargs", [{"user_id": ""}, {"user_id": None}, {"max_bytes": True},
                                  {"max_bytes": 1}, {"max_bytes": -1}, {"top_k": True}, {"top_k": 101}])
def test_scope_and_transport_parameters_are_explicit(archive, kwargs):
    with pytest.raises(ValueError):
        assemble(archive, **kwargs)


def test_source_versions_frames_and_verbatim_provenance(archive):
    query = {"text": "bridge resistor", "mode": "history", "project_id": "circuits", "actor": "user"}
    rows = by_id(assemble(archive, query))
    assert {"e-04-u", "e-25-u"} <= set(rows)
    for item in rows.values():
        evidence = item["evidence"]
        event = archive.events[(USER, evidence["event_id"])]
        source = archive.sources[(USER, event["source_id"], event["source_version"])]
        assert evidence["text"] == event["text"]
        assert evidence["source_hash"] == source["content_hash"]
        assert evidence["original_url"] == source["original_url"]
        assert evidence["provenance"] == source["provenance"]
        assert evidence["frame"]["source_version"] == event["source_version"]
        assert evidence["frame"]["content_hash"] == archive.frames[(USER, event["frame_id"])]["content_hash"]
    assert rows["e-04-u"]["older_source_version"]
    assert rows["e-04-u"]["snapshot_status"] == "historical"
    assert rows["e-04-u"]["evidence"]["frame_id"] != rows["e-25-u"]["evidence"]["frame_id"]


def test_unknown_confidence_time_actor_and_missing_media_are_preserved():
    sources, frames, events, artifacts = tiny_bundle()
    teacher = events[0]
    teacher.update(actor="unknown", confidence=0, frame_id=None, media_position=None,
                   gap_flags=["missing_frame", "missing_audio", "uncertain_transcript"])
    packet = assemble(FixtureArchive(sources, frames, events, artifacts), {"text": "basis", "actor": "unknown"})
    evidence = packet["items"][0]["evidence"]
    assert evidence["confidence"] == 0
    assert evidence["frame"] is evidence["media_position"] is evidence["received_at"] is None
    assert evidence["gap_flags"] == teacher["gap_flags"]
    assert set(packet["items"][0]["unknown_fields"]) == {"frame", "media_position", "received_at", "actor"}
    assert packet["interpretation"]["capture_completeness"] == "unknown"


def test_no_hit_and_ambiguity_remain_retrieval_outcomes():
    sources, frames, events, artifacts = tiny_bundle()
    twin = {**events[0], "event_id": "twin", "device_sequence": 99}
    events.append(twin)
    archive = FixtureArchive(sources, frames, events, artifacts)
    assert assemble(archive, {"text": "basis", "actor": "teacher"})["retrieval"]["status"] == "ambiguous"
    absent = assemble(archive, {"text": "zznonexistentzz"})
    assert absent["retrieval"]["status"] == "not_found" and absent["items"] == []
    assert absent["retrieval"]["total_candidate_count"] is None
    assert absent["interpretation"]["no_hits"] == "not_found_does_not_mean_never_happened"


def test_utf8_budget_is_deterministic_and_omits_whole_quotes():
    sources, frames, events, artifacts = tiny_bundle()
    events[0]["text"] = "Basis 基底 λ 👩🏽‍🔬 e\u0301 — original words. " * 40
    archive = FixtureArchive(sources, frames, events, artifacts)
    query = {"text": "basis", "actor": "teacher"}
    full = assemble(archive, query, max_bytes=100000)
    exact = len(canonical(full))
    for _ in range(3):
        full["budget"]["max_bytes"] = exact
        exact = len(canonical(full))
    full = assemble(archive, query, max_bytes=exact)
    assert len(canonical(full)) == exact
    assert full["items"][0]["evidence"]["text"] == events[0]["text"]
    limited = assemble(archive, query, max_bytes=exact - 1)
    assert limited["items"] == []
    assert limited["budget"]["omitted_retrieval_items"] == 1
    assert limited["budget"]["status"] == "limited"
    assert len(canonical(limited)) <= exact - 1
    assert limited == assemble(archive, query, max_bytes=exact - 1)
    assert not assemble(archive, query, max_bytes=len(canonical(full).decode("utf-8")))["items"]
    assert archive.events[(USER, events[0]["event_id"])]["text"] == events[0]["text"]


def test_budget_reports_neighbor_omissions_without_inventing_candidate_totals():
    archive = FixtureArchive(*tiny_bundle())
    full = assemble(archive)
    limited = assemble(archive, max_bytes=len(canonical(full)) - 100)
    assert limited["budget"]["omitted_correction_items"] == 1
    assert limited["budget"]["omitted_retrieval_items"] == 0
    assert limited["retrieval"]["total_candidate_count"] is None
    assert full["items"][0]["evidence"] == limited["items"][0]["evidence"]


def test_output_mutation_does_not_modify_archive_or_later_packets(archive):
    packet = assemble(archive)
    expected = deepcopy(packet)
    packet["items"][0]["evidence"]["text"] = "rewritten"
    packet["items"][0]["evidence"]["frame"]["content_hash"] = "wrong"
    packet["query"]["text"] = "different"
    assert assemble(archive) == expected


def test_stale_index_correction_deletion_and_mutated_archive_are_rejected():
    sources, frames, events, artifacts = tiny_bundle()
    original = FixtureArchive(sources, frames, events, artifacts)
    index = RetrievalIndex(original)
    packet = assemble_context(original, index, QUERY, user_id=USER)
    events[1]["text"] += " Changed test-only snapshot."
    changed = FixtureArchive(sources, frames, events, artifacts)
    deleted = FixtureArchive([], [], [], {})
    for archive in (changed, deleted):
        with pytest.raises(ValueError, match="snapshots differ"):
            assemble_context(archive, index, QUERY, user_id=USER)
        fresh = assemble(archive)
        assert fresh["archive_fingerprint"] != packet["archive_fingerprint"]
    assert assemble(deleted)["items"] == []
    original.events.pop((USER, "e-02-u"))
    with pytest.raises(ValueError, match="mutated"):
        assemble_context(original, index, QUERY, user_id=USER)


def test_snapshot_change_during_rehydration_fails_closed(monkeypatch):
    archive = FixtureArchive(*tiny_bundle())
    accessor = archive.evidence

    def changed(key):
        evidence = accessor(key)
        archive.events[key]["text"] += " mutation"
        return evidence

    monkeypatch.setattr(archive, "evidence", changed)
    with pytest.raises(ValueError, match="mutated"):
        assemble(archive)


def test_fresh_process_reassembly_equals_packet_after_saved_index_restart(archive, tmp_path):
    path = tmp_path / "index.json"
    RetrievalIndex(archive).save(path)
    expected = assemble(archive)
    child = subprocess.run([sys.executable, "-c", """
import sys
from pathlib import Path
from services.learning.archive import FixtureArchive, canonical
from services.learning.context import assemble_context
from services.learning.evaluate import FIXTURES
from services.learning.retrieval import RetrievalIndex
archive = FixtureArchive.load(FIXTURES)
index = RetrievalIndex.load(archive, Path(sys.argv[1]))
packet = assemble_context(archive, index, {'text':'basis physical arrow','actor':'user','project_id':'algebra'}, user_id='synthetic-learner')
sys.stdout.buffer.write(canonical(packet))
""", str(path)], cwd=FIXTURES.parents[2], capture_output=True, check=True, timeout=30)
    assert child.stdout == canonical(expected)
