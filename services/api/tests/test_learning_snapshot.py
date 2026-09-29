"""Unit evidence for archive extraction; MemoryStore does not prove PostgreSQL.

The seed helper also accepts a production store for the separate real-DB runner.
"""

import base64
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import hashlib

import pytest

from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.storage import MemoryStore
from services.api.tests.postgres_check import _fixture


USER = "snapshot-unit-user"
SOURCE_IDS = ("linear-algebra", "second-course")
NOW = datetime(2026, 9, 29, tzinfo=timezone.utc)


def seed_snapshot_history(store, actor):
    """Seed valid raw history through existing controlled ingestion only."""
    archive, core = _fixture(store, actor)
    archive.clock = lambda: NOW
    source = core["SourceSnapshot"]
    frame = core["Frame"]
    with store.transaction(actor) as tx:
        original_bytes = base64.b64decode(tx.get("artifact", frame["artifact_id"])["data_base64"])
    sources = [deepcopy(source)]
    frames = [deepcopy(frame)]
    artifacts = {frame["artifact_id"]: original_bytes}
    for sid, version, artifact_id, raw in (
        (source["source_id"], 3, "history-binary-frame", b"\x00\xffraw frame\n"),
        ("second-course", 1, frame["artifact_id"], original_bytes),
    ):
        text = f"{actor}: {sid} version {version}\n原话 unchanged."
        snapshot = {**deepcopy(source), "source_id": sid, "source_version": version,
                    "text": text, "content_hash": hashlib.sha256(text.encode()).hexdigest()}
        saved_frame = {**frame, "source_id": sid, "source_version": version,
                       "frame_id": f"frame-{sid}-{version}", "artifact_id": artifact_id,
                       "content_hash": hashlib.sha256(raw).hexdigest()}
        archive.import_fixture(actor, snapshot, saved_frame, raw)
        sources.append(snapshot)
        frames.append(saved_frame)
        artifacts[artifact_id] = raw
    original = deepcopy(core["Observation"])
    original.update(text="先试 A; no reason observed.", confidence=0.35,
                    gap_flags=["missing_audio", "uncertain_transcript"])
    observations = [original]
    # Neither correction timestamps nor receipt time may rewrite the originals.
    for sequence, captured_at in ((2, original["captured_at"]), (3, "2026-09-27T23:00:00Z")):
        observations.append({**deepcopy(original), "event_id": f"correction-{sequence}",
                             "device_sequence": sequence, "source_version": 3,
                             "frame_id": frames[1]["frame_id"], "correction_of": original["event_id"],
                             "captured_at": captured_at, "text": f"更正 branch {sequence}"})
    for sequence, actor_kind in enumerate(("teacher", "assistant", "unknown"), 4):
        observations.append({**deepcopy(original), "event_id": f"second-{actor_kind}",
                             "device_sequence": sequence, "source_id": "second-course",
                             "frame_id": frames[2]["frame_id"], "actor": actor_kind,
                             "text": f"{actor_kind} exact words"})
    observations.append({**deepcopy(original), "event_id": "without-frame", "device_sequence": 7,
                         "frame_id": None, "media_position": None, "gap_flags": ["missing_frame"]})
    archive.events(actor, {"contract_version": "0.1.0", "events": observations})
    for event in observations:
        event["received_at"] = "2026-09-29T00:00:00Z"
    expected = {"sources": sources, "frames": frames, "observations": observations, "artifacts": artifacts}
    return archive, expected


def assert_snapshot_equal(actual, expected):
    """Compare exact originals without inventing an ordering requirement."""
    assert set(actual) == {"sources", "frames", "observations", "artifacts"}
    for collection, fields in (("sources", ("source_id", "source_version")),
                               ("frames", ("frame_id",)), ("observations", ("event_id",))):
        assert isinstance(actual[collection], list)
        order = lambda row: tuple(row[field] for field in fields)
        assert sorted(actual[collection], key=order) == sorted(expected[collection], key=order)
    assert actual["artifacts"] == expected["artifacts"]
    assert all(isinstance(raw, bytes) for raw in actual["artifacts"].values())


def assert_failure(status, code, operation):
    with pytest.raises(DomainError) as error:
        operation()
    assert (error.value.status, error.value.code) == (status, code)


def replace_stored(store, actor, kind, record_key, changes=None):
    """Deliberately corrupt/delete a stored record to test a read boundary."""
    with store.transaction(actor) as tx:
        record = tx.get(kind, record_key)
        assert record is not None
        tx.delete(kind, record_key)
        if changes is not None:
            tx.put(kind, record_key, {**record, **changes})


@pytest.fixture
def setup():
    store = MemoryStore()
    archive, expected = seed_snapshot_history(store, USER)
    return archive, store, expected


def test_unit_exact_multisource_multiversion_corrections_and_binary_artifacts(setup):
    archive, _, expected = setup
    assert_snapshot_equal(archive.export_learning_snapshot(USER, list(SOURCE_IDS)), expected)
    assert_snapshot_equal(archive.export_learning_snapshot(USER, tuple(reversed(SOURCE_IDS))), expected)


def test_unit_same_ids_are_scoped_to_each_authenticated_owner(setup):
    archive, store, expected = setup
    other, other_expected = seed_snapshot_history(store, "other-owner")
    assert_snapshot_equal(archive.export_learning_snapshot(USER, SOURCE_IDS), expected)
    assert_snapshot_equal(other.export_learning_snapshot("other-owner", SOURCE_IDS), other_expected)
    assert expected["sources"][1]["text"] != other_expected["sources"][1]["text"]
    archive.set_authorization("empty-owner")
    assert_failure(404, "source_not_found", lambda: archive.export_learning_snapshot("empty-owner", SOURCE_IDS))


def test_unit_explicit_selection_excludes_other_records(setup):
    archive, store, expected = setup
    first = SOURCE_IDS[0]
    with store.transaction(USER) as tx:
        for kind in ("note", "note_revision", "help", "capture_record", "capture_binding",
                     "capture_slot", "capture_artifact_ref"):
            tx.put(kind, "excluded", {"source_id": first, "secret": "not an archive original"})
        tx.put("artifact", "not-referenced", {"secret": "not exported"})
    selected = {name: [r for r in rows if r["source_id"] == first]
                for name, rows in expected.items() if name != "artifacts"}
    selected["artifacts"] = expected["artifacts"]
    assert_snapshot_equal(archive.export_learning_snapshot(USER, [first]), selected)


def test_unit_does_not_limit_history_to_recent_events(setup):
    archive, _, expected = setup
    events = [{**deepcopy(expected["observations"][0]), "event_id": f"history-{i}",
               "device_sequence": i, "text": f"exact history {i}"} for i in range(8, 265)]
    for start in range(0, len(events), 100):
        archive.events(USER, {"contract_version": "0.1.0", "events": events[start:start + 100]})
    expected["observations"].extend(events)
    assert_snapshot_equal(archive.export_learning_snapshot(USER, SOURCE_IDS), expected)


@pytest.mark.parametrize("selector", [None, "linear-algebra", b"linear-algebra", [], (),
                                     set(SOURCE_IDS), {"linear-algebra": True},
                                     ["linear-algebra", "linear-algebra"], [""], ["bad/id"],
                                     ["x" * 129], [None], [True], [1], [["linear-algebra"]]])
def test_unit_selector_requires_nonempty_distinct_identifiers(setup, selector):
    archive, _, _ = setup
    assert_failure(422, "invalid_contract", lambda: archive.export_learning_snapshot(USER, selector))


@pytest.mark.parametrize("actor", [None, "", "bad/user", True])
def test_unit_actor_identifier_is_checked(setup, actor):
    archive, _, _ = setup
    assert_failure(422, "invalid_contract", lambda: archive.export_learning_snapshot(actor, SOURCE_IDS))


@pytest.mark.parametrize("gate,status,code", [("absent", 404, "source_not_found"),
                                             ("deleted", 404, "source_not_found"),
                                             ("foreign", 404, "source_not_found"),
                                             ("wrong_id", 404, "source_not_found"),
                                             ("revoked", 403, "source_revoked"),
                                             ("authorization", 403, "authorization_revoked")])
def test_unit_all_requested_sources_pass_current_gates_before_any_result(setup, gate, status, code):
    archive, store, _ = setup
    selected = list(SOURCE_IDS)
    if gate == "absent":
        selected.append("absent-source")
    elif gate == "deleted":
        archive.delete_source(USER, SOURCE_IDS[1])
    elif gate == "foreign":
        replace_stored(store, USER, "source", SOURCE_IDS[1], {"user_id": "other-owner"})
    elif gate == "wrong_id":
        replace_stored(store, USER, "source", SOURCE_IDS[1], {"source_id": "wrong-head-id"})
    elif gate == "revoked":
        archive.revoke_source(USER, SOURCE_IDS[1])
    else:
        archive.set_authorization(USER, False)
    before = deepcopy(store._documents)
    assert_failure(status, code, lambda: archive.export_learning_snapshot(USER, selected))
    assert store._documents == before


def test_unit_registration_without_content_does_not_become_empty_snapshot(setup):
    archive, _, _ = setup
    registered, _ = archive.register(USER, "https://example.invalid/no-content", None, "register-only")
    assert_failure(404, "reference_not_found", lambda: archive.export_learning_snapshot(
        USER, [SOURCE_IDS[0], registered["source_id"]]))


def test_unit_deleted_source_is_not_resurrected_by_export_or_late_fixture(setup):
    archive, store, expected = setup
    archive.delete_source(USER, SOURCE_IDS[0])
    before = deepcopy(store._documents)
    assert_failure(404, "source_not_found", lambda: archive.export_learning_snapshot(USER, SOURCE_IDS))
    assert_failure(404, "source_not_found", lambda: archive.import_fixture(
        USER, expected["sources"][0], expected["frames"][0], expected["artifacts"]["fixture-frame-svg"]))
    assert store._documents == before


class TracedStore:
    def __init__(self, store):
        self.store = store
        self.active = False
        self.actors = []

    @contextmanager
    def transaction(self, actor):
        assert not self.active
        self.actors.append(actor)
        with self.store.transaction(actor) as tx:
            self.active = True
            try:
                yield tx
            finally:
                self.active = False


def test_unit_authorization_guard_and_all_reads_use_one_actor_transaction(setup):
    _, store, expected = setup
    traced = TracedStore(store)
    calls = []

    def guard(state):
        assert traced.active
        calls.append(deepcopy(state))

    archive = Archive(traced, authorization_guard=guard)
    assert_snapshot_equal(archive.export_learning_snapshot(USER, SOURCE_IDS), expected)
    assert traced.actors == [USER]
    assert len(calls) == 1 and calls[0]["enabled"] is True


def test_unit_stale_authorization_guard_failure_is_preserved(setup):
    _, store, _ = setup
    traced = TracedStore(store)

    def guard(_state):
        assert traced.active
        raise DomainError(403, "generation_changed")

    archive = Archive(traced, authorization_guard=guard)
    assert_failure(403, "generation_changed", lambda: archive.export_learning_snapshot(USER, SOURCE_IDS))
    assert traced.actors == [USER]


def test_unit_results_are_detached_and_do_not_write_or_resume_capture(setup):
    archive, store, expected = setup
    before = deepcopy(store._documents)
    exported = archive.export_learning_snapshot(USER, SOURCE_IDS)
    exported["sources"][0]["provenance"]["attribution"] = "mutated"
    exported["frames"][0]["captured_at"] = "2030-01-01T00:00:00Z"
    exported["observations"][0]["gap_flags"].append("stale_frame")
    exported["artifacts"].clear()
    exported["sources"].clear()
    assert store._documents == before
    assert_snapshot_equal(archive.export_learning_snapshot(USER, SOURCE_IDS), expected)
    with store.transaction(USER) as tx:
        assert all(record["live_capture"] is False for record in tx.scan("session"))


@pytest.mark.parametrize("kind,record_key,changes", [
    ("snapshot", key("linear-algebra", 1), {"text": "source text hash no longer matches"}),
    ("snapshot", key("linear-algebra", 1), {"user_id": "foreign-owner"}),
    ("snapshot", key("linear-algebra", 1), {"source_version": 2}),
    ("snapshot", key("linear-algebra", 1), {"source_timezone": "invalid/zone"}),
    ("snapshot", key("linear-algebra", 3), None),
    ("source", "linear-algebra", {"current_version": 99}),
    ("frame", "frame-1", {"user_id": "foreign-owner"}),
    ("frame", "frame-1", {"frame_id": "wrong-frame-key"}),
    ("frame", "frame-1", {"source_version": 2}),
    ("frame", "frame-1", {"source_id": "ghost-source"}),
    ("frame", "frame-1", {"device_id": "unknown-device"}),
    ("frame", "frame-1", {"session_id": "unknown-session"}),
    ("frame", "frame-1", {"content_hash": "0" * 64}),
    ("frame", "frame-1", None),
    ("artifact", "fixture-frame-svg", None),
    ("artifact", "fixture-frame-svg", {"user_id": "foreign-owner"}),
    ("artifact", "fixture-frame-svg", {"id": "wrong-artifact-key"}),
    ("artifact", "fixture-frame-svg", {"kind": "ink"}),
    ("artifact", "fixture-frame-svg", {"data_base64": "!not-base64!"}),
    ("artifact", "fixture-frame-svg", {"data_base64": ""}),
    ("artifact", "fixture-frame-svg", {"data_base64": None}),
    ("artifact", "fixture-frame-svg", {"data_base64": base64.b64encode(b"wrong bytes").decode()}),
    ("artifact", "fixture-frame-svg", {"content_hash": "0" * 64}),
    ("event", "event-1", {"event_id": "wrong-event-key"}),
    ("event", "event-1", {"user_id": "foreign-owner"}),
    ("event", "event-1", {"source_version": 2}),
    ("event", "without-frame", {"source_id": "ghost-source"}),
    ("event", "event-1", {"frame_id": "unknown-frame"}),
    ("event", "event-1", {"media_position": 999}),
    ("event", "event-1", {"device_id": "unknown-device"}),
    ("event", "event-1", {"session_id": "unknown-session"}),
    ("event", "event-1", {"confidence": 2}),
    ("event", "correction-2", {"correction_of": "absent-event"}),
    ("event", "correction-2", {"correction_of": "correction-2"}),
    ("event", "correction-2", {"correction_of": "second-teacher"}),
    ("event", "correction-2", {"actor": "teacher"}),
    ("device", "device-ipad", None),
    ("device", "device-ipad", {"user_id": "foreign-owner"}),
    ("device", "device-ipad", {"id": "wrong-device-key"}),
    ("session", "session-1", None),
    ("session", "session-1", {"user_id": "foreign-owner"}),
    ("session", "session-1", {"id": "wrong-session-key"}),
    ("event_sequence", key("device-ipad", 1), None),
    ("event_sequence", key("device-ipad", 1), {"event_id": "wrong-event"}),
    ("event_sequence", key("device-ipad", 1), {"key": "wrong-sequence-key"}),
])
def test_unit_stored_integrity_failure_rejects_entire_requested_snapshot(setup, kind, record_key, changes):
    archive, store, _ = setup
    replace_stored(store, USER, kind, record_key, changes)
    before = deepcopy(store._documents)
    assert_failure(503, "unavailable", lambda: archive.export_learning_snapshot(USER, SOURCE_IDS))
    assert store._documents == before


def test_unit_correction_cycle_is_not_exported_as_history(setup):
    archive, store, _ = setup
    replace_stored(store, USER, "event", "event-1", {"correction_of": "correction-2"})
    assert_failure(503, "unavailable", lambda: archive.export_learning_snapshot(USER, SOURCE_IDS))


def test_unit_unreferenced_frame_cannot_be_silently_dropped_by_corrupt_source_identity(setup):
    archive, store, expected = setup
    extra_frame = {**expected["frames"][0], "frame_id": "no-event-refers-to-this-frame"}
    archive.import_fixture(USER, expected["sources"][0], extra_frame,
                           expected["artifacts"][extra_frame["artifact_id"]])
    replace_stored(store, USER, "frame", extra_frame["frame_id"], {"source_id": "ghost-source"})
    assert_failure(503, "unavailable", lambda: archive.export_learning_snapshot(USER, SOURCE_IDS))


@pytest.mark.parametrize("lifecycle", ["revoked", "deleted"])
def test_unit_unrequested_unavailable_source_does_not_block_selected_source(setup, lifecycle):
    archive, _, expected = setup
    if lifecycle == "revoked":
        archive.revoke_source(USER, SOURCE_IDS[1])
    else:
        archive.delete_source(USER, SOURCE_IDS[1])
    selected = {name: [r for r in rows if r["source_id"] == SOURCE_IDS[0]]
                for name, rows in expected.items() if name != "artifacts"}
    selected["artifacts"] = expected["artifacts"]
    assert_snapshot_equal(archive.export_learning_snapshot(USER, [SOURCE_IDS[0]]), selected)


def test_unit_valid_unframed_observation_is_not_given_new_gap_requirements(setup):
    archive, _, expected = setup
    event = {**deepcopy(expected["observations"][-1]), "event_id": "no-frame-no-gap", "device_sequence": 8,
             "gap_flags": [], "text": "Valid raw v0.1 observation without a frame."}
    archive.events(USER, {"contract_version": "0.1.0", "events": [event]})
    expected["observations"].append(event)
    assert_snapshot_equal(archive.export_learning_snapshot(USER, SOURCE_IDS), expected)


@pytest.mark.parametrize("kind,record_key", [("snapshot", key("linear-algebra", 1)),
                                           ("frame", "frame-1"), ("event", "event-1")])
def test_unit_duplicate_intrinsic_record_identity_cannot_duplicate_evidence(setup, kind, record_key):
    archive, store, _ = setup
    with store.transaction(USER) as tx:
        tx.put(kind, "alias-to-existing-id", tx.get(kind, record_key))
    assert_failure(503, "unavailable", lambda: archive.export_learning_snapshot(USER, SOURCE_IDS))


@pytest.mark.parametrize("selected", [SOURCE_IDS, [SOURCE_IDS[0]], [SOURCE_IDS[1]]])
def test_unit_dangling_sequence_receipt_rejects_missing_leaf_even_outside_selection(setup, selected):
    archive, store, _ = setup
    replace_stored(store, USER, "event", "second-unknown")
    before = deepcopy(store._documents)
    assert_failure(503, "unavailable", lambda: archive.export_learning_snapshot(USER, selected))
    assert store._documents == before


@pytest.mark.parametrize("fault", ["wrong-tombstone", "live-tombstone", "wrong-receipt-event",
                                    "wrong-key", "alias-key", "duplicate-event", "invalid-slot"])
def test_unit_reverse_sequence_inventory_rejects_mismatched_identities(setup, fault):
    archive, store, _ = setup
    with store.transaction(USER) as tx:
        receipt_key = key("device-ipad", 6)
        receipt = tx.get("event_sequence", receipt_key)
        assert receipt["event_id"] == "second-unknown"
        if fault in {"wrong-tombstone", "live-tombstone"}:
            if fault == "wrong-tombstone":
                tx.delete("event", "second-unknown")
            tx.put("event_tombstone", "second-unknown", {
                "event_id": "wrong-event" if fault == "wrong-tombstone" else "second-unknown"})
        elif fault == "wrong-receipt-event":
            tx.put("event_sequence", receipt_key, {**receipt, "event_id": "second-teacher"})
        elif fault == "wrong-key":
            tx.put("event_sequence", receipt_key, {**receipt, "key": key("device-ipad", 99)})
        elif fault == "alias-key":
            tx.put("event_sequence", "alias", receipt)
        else:
            wrong_key = key("device-ipad", 99 if fault == "duplicate-event" else True)
            tx.put("event_sequence", wrong_key, {**receipt, "key": wrong_key})
    assert_failure(503, "unavailable", lambda: archive.export_learning_snapshot(USER, [SOURCE_IDS[0]]))


def test_unit_explicit_deletion_retains_valid_receipts_and_exports_unrelated_originals(setup):
    archive, store, expected = setup
    archive.delete_source(USER, SOURCE_IDS[1])
    with store.transaction(USER) as tx:
        for event in expected["observations"]:
            if event["source_id"] == SOURCE_IDS[1]:
                assert tx.get("event", event["event_id"]) is None
                assert tx.get("event_sequence", key(event["device_id"], event["device_sequence"]))["event_id"] == event["event_id"]
                assert tx.get("event_tombstone", event["event_id"]) == {"event_id": event["event_id"]}
    result = archive.export_learning_snapshot(USER, [SOURCE_IDS[0]])
    assert {e["event_id"] for e in result["observations"]} == {
        e["event_id"] for e in expected["observations"] if e["source_id"] == SOURCE_IDS[0]}
