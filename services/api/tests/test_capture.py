"""Synthetic internal capture checks; MemoryStore is not PostgreSQL evidence."""

import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
from types import SimpleNamespace

import pytest

from packages.contracts.process_v2 import CaptureAuthority, canonical_record, validate_ack
from services.api.capture import CaptureArchive
from services.api.domain import key
from services.api.errors import DomainError
from services.api.storage import MemoryStore
from services.api.tests.postgres_check import _fixture


ROOT = Path(__file__).resolve().parents[3]
USER = "capture-fixture-user"
NOW = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)


def control(store, stream_id, *, user_id=USER, **changes):
    with store.transaction(user_id) as tx:
        state = tx.get("fixture_control", stream_id)
        state.update(changes)
        tx.put("fixture_control", stream_id, state)


def capture_fixture(store, actor):
    """Explicit synthetic registered context, reusable with either storage adapter."""
    archive, core = _fixture(store, actor)
    batch = json.loads((ROOT / "packages/contracts/process_v2/examples/capture.json").read_text())["ProcessBatch"]
    batch.update(device_id=core["Frame"]["device_id"], session_id=core["Frame"]["session_id"], delivery_mode="live")
    batch["records"][0]["source"] = {
        name: core["SourceSnapshot"][name] for name in ("user_id", "source_id", "source_version")
    }
    # Keep the example's pending image distinct from the existing v1 frame.
    batch["records"][0]["artifacts"][0]["artifact_id"] = "pending-image"
    state = {
        "user_id": actor,
        "device_id": batch["device_id"],
        "session_id": batch["session_id"],
        "stream_id": batch["stream_id"],
        "scopes": ["process:capture"],
        "capabilities": ["process.capture.v0.2"],
        "source_versions": [[core["SourceSnapshot"]["source_id"], 1]],
        "attempts": [],
        "transmission_allowed": True,
        "live_capture_allowed": True,
        "historical_through_sequence": None,
        "registered": True,
    }
    with store.transaction(actor) as tx:
        state["authorization_generation"] = tx.get("authorization", "state")["generation"]
        tx.put("fixture_control", batch["stream_id"], state)
        session = tx.get("session", batch["session_id"])
        session["live_capture"] = True
        tx.put("session", session["id"], session)
    calls = []

    def resolver(tx, user_id, stream_id):
        # Reading through tx proves the callback runs while its transaction is open.
        state = tx.get("fixture_control", stream_id)
        calls.append((user_id, stream_id))
        if state is None or not state["registered"] or state["user_id"] != user_id:
            return None
        if state["authorization_generation"] != tx.get("authorization", "state")["generation"]:
            raise DomainError(403, "forbidden")
        return CaptureAuthority(
            **{name: state[name] for name in (
                "user_id", "device_id", "session_id", "stream_id", "transmission_allowed",
                "live_capture_allowed", "historical_through_sequence",
            )},
            scopes=frozenset(state["scopes"]), capabilities=frozenset(state["capabilities"]),
            source_versions=frozenset(tuple(item) for item in state["source_versions"]),
            attempts=frozenset(tuple(item) for item in state["attempts"]),
        )

    instant = [NOW]
    capture = CaptureArchive(store, resolver, clock=lambda: instant[0])
    return SimpleNamespace(user=actor, store=store, archive=archive, core=core, batch=batch, capture=capture,
                           resolver=resolver, calls=calls, instant=instant)


@pytest.fixture
def setup():
    return capture_fixture(MemoryStore(), USER)


def fails(status, code, action):
    with pytest.raises(DomainError) as error:
        action()
    assert (error.value.status, error.value.code) == (status, code)
    return error.value


def record(batch, record_id, sequence, **changes):
    value = deepcopy(batch["records"][0])
    value.update(record_id=record_id, sequence=sequence, **changes)
    return value


def submit(setup, batch=None, request_key="request-1"):
    return setup.capture.ingest(USER, batch or setup.batch, request_key)


def stored(setup):
    with setup.store.transaction(USER) as tx:
        return deepcopy(tx.documents)


def add_source(setup, source_id="second-source"):
    snapshot = {**setup.core["SourceSnapshot"], "source_id": source_id}
    frame = {**setup.core["Frame"], "source_id": source_id, "frame_id": source_id + "-frame"}
    setup.archive.import_fixture(USER, snapshot, frame, (ROOT / "packages/contracts/examples/frame.svg").read_bytes())
    control(setup.store, setup.batch["stream_id"], source_versions=[
        [setup.core["SourceSnapshot"]["source_id"], 1], [source_id, 1],
    ])
    return {name: snapshot[name] for name in ("user_id", "source_id", "source_version")}


def blob_reference(data=b"editable original ink", artifact_id="capture-ink"):
    return {"artifact_id": artifact_id, "sha256": hashlib.sha256(data).hexdigest(),
            "byte_length": len(data), "media_type": "application/json"}


def put_blob(setup, ref, data=b"editable original ink", **changes):
    value = {"user_id": USER, "id": ref["artifact_id"], "kind": "capture",
             "content_hash": hashlib.sha256(data).hexdigest(),
             "data_base64": base64.b64encode(data).decode(), "media_type": ref["media_type"]}
    value.update(changes)
    with setup.store.transaction(USER) as tx:
        tx.put("artifact", ref["artifact_id"], value)


def test_exact_ack_readback_and_fresh_service_instance(setup):
    original = deepcopy(setup.batch)
    ack = submit(setup)
    validate_ack(original, ack, user_id=USER)
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert ack["acknowledged"][0]["artifacts"][0]["status"] == "pending"
    expected = {name: original[name] for name in ("device_id", "session_id", "stream_id")}
    expected.update(record=original["records"][0], received_at="2026-09-28T12:00:00Z")
    restarted = CaptureArchive(setup.store, setup.resolver)
    assert restarted.read_record(USER, "process-1") == expected
    assert setup.batch == original


def test_cached_request_and_new_batch_preserve_original_received_at(setup):
    first = submit(setup)
    setup.instant[0] += timedelta(days=3)
    assert submit(setup) == first
    assert setup.calls == [(USER, setup.batch["stream_id"])] * 2
    retry = {**setup.batch, "batch_id": "new-batch", "delivery_mode": "historical"}
    ack = submit(setup, retry, "new-request")
    validate_ack(retry, ack, user_id=USER)
    assert ack["acknowledged"][0]["disposition"] == "duplicate"
    assert ack["acknowledged"][0]["received_at"] == first["acknowledged"][0]["received_at"]


@pytest.mark.parametrize("field,value", [("batch_id", "different-batch"), ("delivery_mode", "historical")])
def test_request_key_binds_entire_envelope(setup, field, value):
    submit(setup)
    fails(409, "idempotency_conflict", lambda: submit(setup, {**setup.batch, field: value}))


def test_record_and_slot_conflicts_roll_back_mixed_batch_and_replay(setup):
    submit(setup)
    before = stored(setup)
    new = record(setup.batch, "new-record", 2)
    collision = record(setup.batch, "occupied-slot", 1)
    batch = {**setup.batch, "batch_id": "mixed", "records": [new, collision]}
    fails(409, "record_conflict", lambda: submit(setup, batch, "mixed"))
    assert stored(setup) == before
    changed = deepcopy(setup.batch)
    changed["records"][0]["evidence"]["after"]["selected_option_ids"] = ["D"]
    fails(409, "idempotency_conflict", lambda: submit(setup, changed))
    fails(409, "record_conflict", lambda: submit(setup, changed, "changed-original"))
    assert stored(setup) == before
    assert submit(setup, {**batch, "records": [new]}, "mixed")["acknowledged"][0]["disposition"] == "accepted"


def test_out_of_order_records_and_parent_links_have_exact_ack(setup):
    first = record(setup.batch, "first", 2, observed_at="2030-01-01T00:00:00Z")
    second = record(setup.batch, "second", 5, causal_parents=["first"], observed_at=None)
    third = record(setup.batch, "third", 8, causal_parents=["second"], clock=None)
    batch = {**setup.batch, "records": [third, first, second]}
    ack = submit(setup, batch)
    validate_ack(batch, ack, user_id=USER)
    assert {(r["record_id"], r["sequence"]) for r in ack["acknowledged"]} == {
        ("first", 2), ("second", 5), ("third", 8),
    }
    assert setup.capture.read_record(USER, "second")["record"] == second


def test_v1_event_identity_and_sequence_are_a_separate_namespace(setup):
    setup.archive.events(USER, setup.core["EventBatch"])
    event = setup.core["EventBatch"]["events"][0]
    batch = {**setup.batch, "records": [record(setup.batch, event["event_id"], event["device_sequence"])]}
    assert submit(setup, batch)["acknowledged"][0]["disposition"] == "accepted"
    with setup.store.transaction(USER) as tx:
        assert tx.get("event", event["event_id"])["text"] == event["text"]


def test_unicode_nul_and_negative_zero_are_not_normalized(setup):
    item = setup.batch["records"][0]
    item["media_position"] = -0.0
    item["evidence"].update(operation="text_edit", before={"kind": "unknown", "reason": "not_observed"},
                            after={"kind": "text", "text": "原文\x00e\u0301 ≠ é"}, reason_quote="先试\x00再改")
    submit(setup)
    saved = setup.capture.read_record(USER, item["record_id"])
    assert saved["record"] == item
    assert math.copysign(1, saved["record"]["media_position"]) == -1
    with setup.store.transaction(USER) as tx:
        original = tx.get("capture_record", item["record_id"])
        assert original["canonical_json"].encode() == canonical_record(setup.batch, item["record_id"])
        assert "\\u0000" in original["canonical_json"]
        assert "\x00" not in json.dumps(original)
    changed = deepcopy(setup.batch)
    changed["records"][0]["media_position"] = 0.0
    fails(409, "record_conflict", lambda: submit(setup, changed, "positive-zero"))


def test_coverage_gap_survives_late_arrival_as_an_original(setup):
    gap = record(setup.batch, "gap", 3)
    gap["evidence"] = {"kind": "coverage", "coverage": "partial", "from_clock_ms": None,
                       "through_clock_ms": None, "missing_sequences": [{"first": 1, "last": 2}],
                       "limitations": ["missing_events", "disconnected"]}
    submit(setup, {**setup.batch, "records": [gap]})
    submit(setup, {**setup.batch, "batch_id": "late", "records": [record(setup.batch, "late", 1)]}, "late")
    assert setup.capture.read_record(USER, "gap")["record"] == gap


@pytest.mark.parametrize("field,value,code,status", [
    ("scopes", [], "forbidden", 403),
    ("capabilities", [], "capability_required", 403),
    ("transmission_allowed", False, "forbidden", 403),
    ("live_capture_allowed", False, "capture_stopped", 409),
    ("source_versions", [], "not_found", 404),
])
def test_current_resolved_authority_fences_cached_success(setup, field, value, code, status):
    submit(setup)
    control(setup.store, setup.batch["stream_id"], **{field: value})
    before = stored(setup)
    fails(status, code, lambda: submit(setup))
    assert len(setup.calls) == 2
    assert stored(setup) == before


def test_unregistered_stream_never_auto_registers_from_request(setup):
    with setup.store.transaction(USER) as tx:
        tx.delete("fixture_control", setup.batch["stream_id"])
    before = stored(setup)
    fails(404, "not_found", lambda: submit(setup))
    assert stored(setup) == before


@pytest.mark.parametrize("subject", ["device", "session", "source", "snapshot"])
def test_stale_trusted_snapshot_cannot_override_missing_owned_subject(setup, subject):
    identifiers = {"device": setup.batch["device_id"], "session": setup.batch["session_id"],
                   "source": setup.core["SourceSnapshot"]["source_id"],
                   "snapshot": key(setup.core["SourceSnapshot"]["source_id"], 1)}
    with setup.store.transaction(USER) as tx:
        tx.delete(subject, identifiers[subject])
    fails(404, "not_found", lambda: submit(setup))
    with setup.store.transaction(USER) as tx:
        assert tx.scan("capture_record") == []


def test_authorization_revoke_regrant_does_not_revalidate_old_stream(setup):
    submit(setup)
    setup.archive.set_authorization(USER, False)
    fails(403, "forbidden", lambda: submit(setup))
    setup.archive.set_authorization(USER)
    fails(403, "forbidden", lambda: submit(setup))
    with setup.store.transaction(USER) as tx:
        generation = tx.get("authorization", "state")["generation"]
    # Even a resolver refreshed to the new grant cannot reuse an old incarnation.
    control(setup.store, setup.batch["stream_id"], authorization_generation=generation)
    fails(403, "forbidden", lambda: submit(setup))
    fails(403, "forbidden", lambda: submit(setup, request_key="fresh-request"))


def test_authorization_guard_runs_before_cached_success(setup):
    submit(setup)
    seen = []

    def guard(state):
        seen.append(state)
        raise DomainError(403, "forbidden")

    capture = CaptureArchive(setup.store, setup.resolver, authorization_guard=guard)
    fails(403, "forbidden", lambda: capture.ingest(USER, setup.batch, "request-1"))
    assert len(seen) == 1


@pytest.mark.parametrize("boundary", [None, 0])
def test_unknown_or_exceeded_stop_boundary_rejects_historical_replay(setup, boundary):
    batch = {**setup.batch, "delivery_mode": "historical"}
    submit(setup, batch)
    control(setup.store, batch["stream_id"], live_capture_allowed=False, historical_through_sequence=boundary)
    fails(409, "capture_stopped", lambda: submit(setup, batch))


def test_retained_pre_stop_history_does_not_restart_live_capture(setup):
    submit(setup)
    control(setup.store, setup.batch["stream_id"], live_capture_allowed=False, historical_through_sequence=2)
    with setup.store.transaction(USER) as tx:
        session = tx.get("session", setup.batch["session_id"])
        session["live_capture"] = False
        tx.put("session", session["id"], session)
    fails(409, "capture_stopped", lambda: submit(setup))
    batch = {**setup.batch, "delivery_mode": "historical", "records": [record(setup.batch, "offline", 2)]}
    assert submit(setup, batch, "offline")["acknowledged"][0]["disposition"] == "accepted"
    assert setup.capture.read_record(USER, "process-1")["record"] == setup.batch["records"][0]
    with setup.store.transaction(USER) as tx:
        assert tx.get("session", setup.batch["session_id"])["live_capture"] is False
    control(setup.store, setup.batch["stream_id"], transmission_allowed=False)
    fails(403, "forbidden", lambda: submit(setup, batch, "offline"))


def test_attempt_scope_requires_real_relation_registration(setup):
    setup.batch["records"][0]["scope"] = {
        "kind": "attempt", "problem_id": "problem", "attempt_id": "attempt", "relation_revision": 1,
    }
    control(setup.store, setup.batch["stream_id"], attempts=[["problem", "attempt", 1]])
    fails(409, "dependency_missing", lambda: submit(setup))


def test_pending_blob_becomes_verified_without_rewriting_prior_ack(setup):
    ref = blob_reference()
    setup.batch["records"][0]["artifacts"] = [ref]
    pending = submit(setup)
    assert pending["acknowledged"][0]["artifacts"][0]["status"] == "pending"
    put_blob(setup, ref)
    assert submit(setup) == pending
    batch = {**setup.batch, "batch_id": "after-upload"}
    ack = submit(setup, batch, "after-upload")
    validate_ack(batch, ack, user_id=USER, verified_artifacts=frozenset({tuple(ref.values())}))
    assert ack["acknowledged"][0]["disposition"] == "duplicate"
    assert ack["acknowledged"][0]["artifacts"][0]["status"] == "verified"
    assert ack["acknowledged"][0]["received_at"] == pending["acknowledged"][0]["received_at"]


@pytest.mark.parametrize("change", ["bytes", "hash", "length", "media_type"])
def test_artifact_bytes_digest_size_and_independent_media_type_are_checked(setup, change):
    ref = blob_reference()
    setup.batch["records"][0]["artifacts"] = [ref]
    if change == "length":
        ref["byte_length"] += 1
    kwargs = {
        "bytes": {"data_base64": base64.b64encode(b"wrong bytes").decode()},
        "hash": {"content_hash": "f" * 64},
        "length": {},
        "media_type": {"media_type": "image/png"},
    }[change]
    put_blob(setup, ref, **kwargs)
    before = stored(setup)
    status, code = (503, "unavailable") if change in {"bytes", "hash"} else (409, "record_conflict")
    fails(status, code, lambda: submit(setup))
    assert stored(setup) == before


def test_cross_owner_artifact_and_record_read_do_not_leak(setup):
    ref = blob_reference()
    setup.batch["records"][0]["artifacts"] = [ref]
    put_blob(setup, ref, user_id="other-user")
    fails(404, "not_found", lambda: submit(setup))
    setup.archive.set_authorization("other-user")
    fails(404, "not_found", lambda: setup.capture.read_record("other-user", "process-1"))


def frame_batch(setup):
    batch = deepcopy(setup.batch)
    frame = setup.core["Frame"]
    data = (ROOT / "packages/contracts/examples/frame.svg").read_bytes()
    batch["records"][0].update(frame_id=frame["frame_id"], media_position=frame["media_position"], artifacts=[{
        "artifact_id": frame["artifact_id"], "sha256": frame["content_hash"],
        "byte_length": len(data), "media_type": "image/svg+xml",
    }])
    return batch


def test_legacy_frame_without_independent_media_type_is_pending(setup):
    batch = frame_batch(setup)
    ack = submit(setup, batch)
    validate_ack(batch, ack, user_id=USER)
    assert ack["acknowledged"][0]["artifacts"][0]["status"] == "pending"
    assert setup.capture.read_record(USER, "process-1")["record"] == batch["records"][0]


@pytest.mark.parametrize("change", ["hash", "media_position", "device"])
def test_named_legacy_frame_binding_is_exact(setup, change):
    batch = frame_batch(setup)
    if change == "hash":
        batch["records"][0]["artifacts"][0]["sha256"] = "f" * 64
    elif change == "media_position":
        batch["records"][0]["media_position"] += 1
    else:
        batch["device_id"] = "other-device"
        with setup.store.transaction(USER) as tx:
            tx.put("device", "other-device", {"user_id": USER, "id": "other-device"})
        control(setup.store, batch["stream_id"], device_id="other-device")
    fails(422, "invalid_request", lambda: submit(setup, batch))


def test_missing_parent_rejects_entire_batch_then_retry_can_resolve(setup):
    child = record(setup.batch, "child", 2, causal_parents=["parent"])
    batch = {**setup.batch, "records": [child]}
    before = stored(setup)
    fails(409, "dependency_missing", lambda: submit(setup, batch))
    assert stored(setup) == before
    submit(setup, {**setup.batch, "records": [record(setup.batch, "parent", 1)]}, "parent")
    assert submit(setup, batch)["acknowledged"][0]["disposition"] == "accepted"


@pytest.mark.parametrize("parents", [["self"], ["later"]])
def test_self_or_forward_same_stream_causality_is_invalid(setup, parents):
    first = record(setup.batch, "self", 1, causal_parents=parents)
    later = record(setup.batch, "later", 2)
    fails(422, "invalid_request", lambda: submit(setup, {**setup.batch, "records": [first, later]}))


def test_cross_source_parents_require_current_source_authorization(setup):
    other = add_source(setup)
    submit(setup)
    child = record(setup.batch, "child", 2, source=other, causal_parents=["process-1"])
    batch = {**setup.batch, "batch_id": "cross-source", "records": [child]}
    assert submit(setup, batch, "cross-source")["acknowledged"][0]["disposition"] == "accepted"
    assert setup.capture.read_record(USER, "child")["record"] == child
    setup.archive.revoke_source(USER, setup.core["SourceSnapshot"]["source_id"])
    fails(403, "forbidden", lambda: submit(setup, batch, "cross-source"))
    fails(403, "forbidden", lambda: setup.capture.read_record(USER, "process-1"))
    # Reading the unrelated original exposes parent IDs, never parent content.
    assert setup.capture.read_record(USER, "child")["record"] == child


def test_deleted_parent_cannot_be_resurrected_through_other_source(setup):
    other = add_source(setup)
    submit(setup)
    setup.archive.delete_source(USER, setup.core["SourceSnapshot"]["source_id"])
    child = record(setup.batch, "child", 2, source=other, causal_parents=["process-1"])
    fails(404, "not_found", lambda: submit(setup, {**setup.batch, "records": [child]}, "child"))


def test_source_deletion_scrubs_capture_content_and_replays_preserving_other_originals(setup):
    other = add_source(setup)
    sensitive = "erased-original-only"
    first = setup.batch["records"][0]
    first["evidence"]["reason_quote"] = sensitive
    ref = blob_reference(data=sensitive.encode(), artifact_id="deleted-blob")
    first["artifacts"] = [ref]
    put_blob(setup, ref, data=sensitive.encode())
    submit(setup)
    unrelated = record(setup.batch, "unrelated", 2, source=other, artifacts=[])
    unrelated["evidence"]["reason_quote"] = "unrelated original"
    submit(setup, {**setup.batch, "records": [unrelated]}, "unrelated")
    setup.archive.delete_source(USER, first["source"]["source_id"])
    fails(404, "not_found", lambda: submit(setup))
    fails(404, "not_found", lambda: setup.capture.read_record(USER, first["record_id"]))
    assert setup.capture.read_record(USER, "unrelated")["record"] == unrelated
    with setup.store.transaction(USER) as tx:
        assert tx.get("capture_record", "process-1") is None
        assert tx.get("artifact", "deleted-blob") is None
        for kind in ("capture_record", "capture_replay", "capture_artifact_ref"):
            assert sensitive not in json.dumps(tx.scan(kind))
            assert ref["sha256"] not in json.dumps(tx.scan(kind))
        for receipt in tx.scan("capture_replay"):
            if receipt.get("deleted"):
                assert "fingerprint" not in receipt and "response" not in receipt
    rebound = record(setup.batch, "process-1", 3, source=other, artifacts=[])
    rebound["evidence"]["reason_quote"] = None
    fails(404, "not_found", lambda: submit(setup, {**setup.batch, "records": [rebound]}, "rebound"))


def test_shared_blob_survives_deletion_of_only_one_referencing_source(setup):
    other = add_source(setup)
    ref = blob_reference()
    put_blob(setup, ref)
    setup.batch["records"][0]["artifacts"] = [ref]
    submit(setup)
    survivor = record(setup.batch, "survivor", 2, source=other)
    submit(setup, {**setup.batch, "records": [survivor]}, "survivor")
    setup.archive.delete_source(USER, setup.core["SourceSnapshot"]["source_id"])
    assert setup.capture.read_record(USER, "survivor")["record"] == survivor
    with setup.store.transaction(USER) as tx:
        assert base64.b64decode(tx.get("artifact", ref["artifact_id"])["data_base64"]) == b"editable original ink"


def test_internal_archive_does_not_advertise_or_install_v2_http(setup):
    from services.api.app import create_app
    from services.api.tests.test_http import request

    app = create_app(setup.store)
    assert request(app, "POST", "/v2/process/events:batch", json=setup.batch).status_code == 404
    schema = request(app, "GET", "/openapi.json", token=None).json()
    assert schema == json.loads((ROOT / "packages/contracts/generated/openapi.json").read_text())
    assert "/v2/process/events:batch" not in schema["paths"]
    assert "process.capture.v0.2" not in json.dumps(schema)


def test_integral_float_version_resolves_same_source_without_rewriting_original(setup):
    setup.batch["records"][0]["source"]["source_version"] = 1.0
    submit(setup)
    version = setup.capture.read_record(USER, "process-1")["record"]["source"]["source_version"]
    assert type(version) is float and version == 1.0


def test_integral_float_sequence_cannot_bypass_occupied_slot(setup):
    submit(setup)
    collision = record(setup.batch, "numeric-slot-alias", 1.0)
    fails(409, "record_conflict", lambda: submit(setup, {**setup.batch, "records": [collision]}, "alias"))


def test_equal_numeric_artifact_metadata_does_not_rewrite_reference(setup):
    ref = blob_reference(b"x")
    setup.batch["records"][0]["artifacts"] = [ref]
    put_blob(setup, ref, b"x")
    submit(setup)
    second = record(setup.batch, "float-byte-length", 2)
    second["artifacts"][0]["byte_length"] = 1.0
    ack = submit(setup, {**setup.batch, "records": [second]}, "float-length")
    assert ack["acknowledged"][0]["artifacts"][0]["status"] == "verified"
    saved = setup.capture.read_record(USER, "float-byte-length")["record"]
    assert type(saved["artifacts"][0]["byte_length"]) is float
    with setup.store.transaction(USER) as tx:
        assert type(tx.get("capture_artifact_ref", ref["artifact_id"])["byte_length"]) is int


@pytest.mark.parametrize("failure", ["missing", "mime-unavailable"])
def test_cached_verified_receipt_requires_current_verified_blob(setup, failure):
    ref = blob_reference()
    setup.batch["records"][0]["artifacts"] = [ref]
    put_blob(setup, ref)
    assert submit(setup)["acknowledged"][0]["artifacts"][0]["status"] == "verified"
    with setup.store.transaction(USER) as tx:
        blob = tx.get("artifact", ref["artifact_id"])
        tx.delete("artifact", ref["artifact_id"])
        if failure == "mime-unavailable":
            del blob["media_type"]
            tx.put("artifact", ref["artifact_id"], blob)
    fails(503, "unavailable", lambda: submit(setup))
    # A fresh receipt can truthfully report remaining metadata without claiming bytes.
    ack = submit(setup, request_key="fresh-after-loss")
    assert ack["acknowledged"][0]["artifacts"][0]["status"] == "pending"


def test_changed_pending_artifact_reference_is_atomic_conflict(setup):
    submit(setup)
    second = record(setup.batch, "different-artifact-reference", 2)
    second["artifacts"][0]["media_type"] = "image/jpeg"
    before = stored(setup)
    fails(409, "record_conflict", lambda: submit(setup, {**setup.batch, "records": [second]}, "different-ref"))
    assert stored(setup) == before


@pytest.mark.parametrize("field,value", [
    ("sha256", "f" * 64), ("media_type", "image/jpeg"), ("byte_length", 257),
])
def test_conflicting_artifact_references_in_one_batch_leave_storage_unchanged(setup, field, value):
    first = record(setup.batch, "first-new-record", 1)
    second = record(setup.batch, "second-new-record", 2)
    second["artifacts"][0][field] = value
    batch = {**setup.batch, "records": [first, second]}
    before = stored(setup)
    fails(422, "invalid_request", lambda: submit(setup, batch))
    assert stored(setup) == before


def test_stored_parent_forward_link_and_cycle_are_rejected(setup):
    later = record(setup.batch, "later", 3)
    submit(setup, {**setup.batch, "records": [later]})
    earlier = record(setup.batch, "earlier", 2, causal_parents=["later"])
    fails(422, "invalid_request", lambda: submit(setup, {**setup.batch, "records": [earlier]}, "forward"))
    # Both local edges create an explicit cycle, irrespective of submitted order.
    a = record(setup.batch, "a", 4, causal_parents=["b"])
    b = record(setup.batch, "b", 5, causal_parents=["a"])
    fails(422, "invalid_request", lambda: submit(setup, {**setup.batch, "records": [b, a]}, "cycle"))


def test_cross_stream_parent_sequence_is_independent_and_stored_cycle_rejects(setup):
    submit(setup)
    with setup.store.transaction(USER) as tx:
        state = tx.get("fixture_control", setup.batch["stream_id"])
        state["stream_id"] = "second-stream"
        tx.put("fixture_control", state["stream_id"], state)
    child = record(setup.batch, "other-stream-child", 1, causal_parents=["process-1"])
    batch = {**setup.batch, "stream_id": "second-stream", "records": [child]}
    assert submit(setup, batch, "second-stream")["acknowledged"][0]["disposition"] == "accepted"
    original = deepcopy(setup.batch)
    original["records"][0]["causal_parents"] = [child["record_id"]]
    fails(422, "invalid_request", lambda: submit(setup, original, "stored-cycle"))
    assert setup.capture.read_record(USER, "process-1")["record"] == setup.batch["records"][0]


def test_other_actor_cannot_read_an_existing_owned_original(setup):
    submit(setup)
    setup.archive.set_authorization("other-user")
    fails(404, "not_found", lambda: setup.capture.read_record("other-user", "process-1"))
    assert setup.capture.read_record(USER, "process-1")["record"] == setup.batch["records"][0]


@pytest.mark.parametrize("field,value", [("live_capture_allowed", None), ("historical_through_sequence", True)])
def test_unknown_stop_facts_cannot_become_permissive(setup, field, value):
    control(setup.store, setup.batch["stream_id"], live_capture_allowed=False,
            historical_through_sequence=1)
    control(setup.store, setup.batch["stream_id"], **{field: value})
    fails(409, "capture_stopped", lambda: submit(setup, {**setup.batch, "delivery_mode": "historical"}))


def test_foreign_source_claim_is_indistinguishable_from_absent_source(setup):
    setup.batch["records"][0]["source"]["user_id"] = "other-user"
    fails(404, "not_found", lambda: submit(setup))


def test_unknown_version_kind_and_recursive_payload_fail_closed(setup):
    fails(422, "unsupported_version", lambda: submit(setup, {**setup.batch, "contract_version": "9.0.0"}))
    invalid = deepcopy(setup.batch)
    invalid["records"][0]["evidence"]["kind"] = "inferred_reasoning"
    fails(422, "invalid_request", lambda: submit(setup, invalid))
    recursive = deepcopy(setup.batch)
    recursive["records"][0]["evidence"]["after"] = recursive
    fails(422, "invalid_request", lambda: submit(setup, recursive))


def test_missing_authority_resolver_is_unavailable(setup):
    capture = CaptureArchive(setup.store)
    fails(503, "unavailable", lambda: capture.ingest(USER, setup.batch, "no-resolver"))
