"""Legal legacy export shapes; synthetic TEST DATA, no actual user capture."""

from copy import deepcopy

import pytest

from services.learning.archive import ArchiveSnapshot, FixtureArchive, canonical
from services.learning.context import assemble_context
from services.learning.retrieval import RetrievalIndex
from test_memory import tiny_bundle

USER = "synthetic-learner"


def exported():
    sources, frames, observations, artifacts = tiny_bundle()
    return dict(sources=sources, frames=frames, observations=observations, artifacts=artifacts)


@pytest.mark.parametrize("captured_at", ["2025-01-03T00:00:00Z", "2025-01-02T23:00:00Z", "2025-01-03T01:00:00Z"])
@pytest.mark.parametrize("gap_flags", [[], ["missing_frame"]])
def test_legal_export_clocks_and_null_frame_survive_exactly(captured_at, gap_flags):
    supplied = exported()
    original = next(e for e in supplied["observations"] if e["event_id"] == "e-02-u")
    correction = next(e for e in supplied["observations"] if e["event_id"] == "e-02-c")
    original.update(frame_id=None, gap_flags=gap_flags)
    correction["captured_at"] = captured_at
    before = deepcopy(supplied)
    archive = ArchiveSnapshot(**supplied, user_id=USER)
    index = RetrievalIndex(archive)
    assert list(archive.events.values()) == before["observations"]
    for mode in ("current", "history"):
        packet = assemble_context(archive, index, {"text": "basis", "actor": "user", "mode": mode}, user_id=USER)
        rows = {item["evidence"]["event_id"]: item for item in packet["items"]}
        assert set(rows) == {"e-02-u", "e-02-c"}
        assert rows["e-02-u"]["evidence"]["frame"] is None
        assert rows["e-02-u"]["evidence"]["gap_flags"] == gap_flags
        assert "frame" in rows["e-02-u"]["unknown_fields"]
        assert rows["e-02-c"]["evidence"]["captured_at"] == captured_at
        assert rows["e-02-u"]["snapshot_status"] == "historical"
        assert rows["e-02-c"]["correction_resolution"] == "links_only_not_confirmation"
        assert packet["interpretation"]["cross_device_order"] == "unknown"
    assert supplied == before


@pytest.mark.parametrize("damage", ["self_cycle", "two_cycle", "missing_parent", "foreign_parent", "wrong_actor", "wrong_source"])
def test_graph_reference_and_ownership_fail_closed(damage):
    supplied = exported()
    original = next(e for e in supplied["observations"] if e["event_id"] == "e-02-u")
    correction = next(e for e in supplied["observations"] if e["event_id"] == "e-02-c")
    if damage == "self_cycle":
        correction["correction_of"] = correction["event_id"]
    elif damage == "two_cycle":
        original["correction_of"] = correction["event_id"]
    elif damage == "missing_parent":
        correction["correction_of"] = "absent"
    elif damage == "foreign_parent":
        original["user_id"] = "foreign-test-owner"
    elif damage == "wrong_actor":
        correction["actor"] = "teacher"
    else:
        source = deepcopy(supplied["sources"][0])
        source["source_id"] = "different-test-source"
        supplied["sources"].append(source)
        correction.update(source_id=source["source_id"], frame_id=None, gap_flags=[])
    before = deepcopy(supplied)
    with pytest.raises(ValueError):
        ArchiveSnapshot(**supplied, user_id=USER)
    assert supplied == before


def test_reverse_clock_chain_is_acyclic_and_keeps_competing_branches():
    supplied = exported()
    original = next(e for e in supplied["observations"] if e["event_id"] == "e-02-u")
    correction = next(e for e in supplied["observations"] if e["event_id"] == "e-02-c")
    correction["captured_at"] = "2025-01-02T23:00:00Z"
    supplied["observations"].append({**correction, "event_id": "branch", "device_sequence": 99})
    supplied["observations"].append({**correction, "event_id": "descendant", "device_sequence": 100,
                                     "correction_of": correction["event_id"], "captured_at": "2025-01-02T22:00:00Z"})
    archive = ArchiveSnapshot(**supplied, user_id=USER)
    packet = assemble_context(archive, RetrievalIndex(archive), {"text": "basis", "actor": "user"}, user_id=USER)
    assert all(i["correction_resolution"] == "competing_branches_unresolved" for i in packet["items"])
    assert archive.events[(USER, original["event_id"])]["captured_at"] == original["captured_at"]


@pytest.mark.parametrize("damage", ["null_frame_without_gap", "equal_clock", "backdated_clock"])
def test_fixture_only_conventions_are_not_relaxed(damage):
    supplied = exported()
    if damage == "null_frame_without_gap":
        supplied["observations"][0].update(frame_id=None, gap_flags=[])
    else:
        correction = next(e for e in supplied["observations"] if e["correction_of"] is not None)
        correction["captured_at"] = "2025-01-03T00:00:00Z" if damage == "equal_clock" else "2025-01-02T23:00:00Z"
    with pytest.raises(ValueError, match="Absent frame|correction ownership/order"):
        FixtureArchive(**supplied)
