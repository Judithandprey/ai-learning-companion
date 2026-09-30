"""Internal raw-frame ingress with synthetic authorized state and real test PNG.

MemoryStore and in-process ASGI setup establish no device capture, provider input,
HTTP raw-frame transport, or original-live-screen acceptance.
"""

from contextlib import contextmanager
from copy import deepcopy
import json

import pytest

from packages.contracts.capture_frame import validate_binding
from packages.contracts.process_v2 import validate_ack
from services.api.control import ControlRegistry
from services.api.domain import key
from services.api.errors import DomainError
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import (
    CAPABILITIES, SCOPES, USER, apply, command, documents, resolve_stop_fact, stop_fact,
)
from services.api.tests.test_ingress_http import (
    FRAMES, error as http_error, registered, request, setup, uploaded,
)


@pytest.fixture
def raw_setup(uploaded):
    """Upload typed PNG/ink through released HTTP; commit no legacy capture frame."""
    c = uploaded
    item = c.batch["records"][0]
    item.update(observed_at=None, media_position=None)
    c.raw_frame = {
        "contract_version": "0.2.5", "kind": "raw_capture_frame", "frame_id": c.frame["frame_id"],
        "source": deepcopy(c.source),
        **{field: c.batch[field] for field in ("device_id", "session_id", "stream_id")},
        "artifact": deepcopy(c.ref), "raw_width": 2, "raw_height": 2, "buffer_sequence": 97,
        "captured_at": None, "media_position": None,
        "timing": {"observed_at_estimate": "2026-09-29T12:00:00.100Z",
                   "estimate_basis": "session_wall_plus_callback_monotonic_delta",
                   "uncertainty_ms": None, "callback_clock": deepcopy(item["clock"]),
                   "sample_pts_seconds": -0.125},
        "orientation": {"system": "CGImagePropertyOrientation", "value": 2, "applied_to_pixels": False},
    }
    # Synthetic callback estimate; neither image-capture UTC nor a course playhead.
    return c


def ingest(c, batch=None, frames=None, request_key="raw-frames-1"):
    return c.registry.ingest_raw_frames(
        c.user, c.batch if batch is None else batch,
        [c.raw_frame] if frames is None else frames, request_key,
    )


@pytest.fixture
def rawcaptured(raw_setup):
    raw_setup.ack = ingest(raw_setup)
    return raw_setup


def denied(c, action, status, code=None):
    before = documents(c)
    with pytest.raises(DomainError) as exc:
        action()
    assert exc.value.status == status
    if code is not None:
        assert exc.value.code == code
    assert documents(c) == before
    return exc.value


def additional(c, *, record_id="raw-record-2", sequence=2, frame_id="raw-frame-2", parents=()):
    item = record(c.batch, record_id, sequence, frame_id=frame_id, causal_parents=list(parents))
    frame = deepcopy(c.raw_frame)
    frame.update(frame_id=frame_id, buffer_sequence=98)
    return item, frame


def test_raw_pixels_and_ink_commit_exact_metadata_and_verified_receipts(raw_setup):
    c = raw_setup
    inputs = deepcopy((c.batch, c.raw_frame))
    before = documents(c)
    binding = {"contract_version": "0.2.2", "source": c.source,
               "kind": "screen_image", "artifact": c.ref}
    assert validate_binding(c.batch, "process-1", c.raw_frame, c.descriptor, binding) is None
    ack = ingest(c)
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
                for ref in (c.ref, c.ink_ref)}
    validate_ack(c.batch, ack, user_id=USER, verified_artifacts=verified)
    assert ack["acknowledged"][0]["artifacts"] == [
        {**ref, "status": "verified"} for ref in (c.ref, c.ink_ref)]
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert (c.batch, c.raw_frame) == inputs
    with c.store.transaction(USER) as tx:
        assert tx.get("raw_capture_frame", c.raw_frame["frame_id"]) == c.raw_frame
        assert tx.get("frame", c.raw_frame["frame_id"]) is None
        assert tx.scan("event") == []
        for kind, identifier in (("session", c.batch["session_id"]), ("control_stream", c.batch["stream_id"]),
                                 ("artifact", c.ref["artifact_id"]), ("artifact", c.ink_ref["artifact_id"])):
            assert tx.get(kind, identifier) == before[(kind, identifier)]
        stored = tx.get("capture_record", "process-1")
        assert json.loads(stored["canonical_json"])["record"] == c.batch["records"][0]
        assert stored["received_at"] == ack["acknowledged"][0]["received_at"]
        replay = tx.get("capture_replay", key("internal_raw_capture_frames", "raw-frames-1"))
        assert json.loads(replay["response_json"]) == ack
        assert tx.get("capture_replay", key("internal_capture_frames", "raw-frames-1")) is None
    committed = documents(c)
    c.registry = ControlRegistry(c.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                 authorization_guard=lambda state: None, stop_fact_resolver=resolve_stop_fact)
    assert ingest(c) == ack
    assert documents(c) == committed


def test_unknown_raw_timing_and_direction_remain_unknown(raw_setup):
    c = raw_setup
    c.raw_frame["timing"] = dict.fromkeys(c.raw_frame["timing"])
    c.raw_frame["orientation"]["value"] = None
    c.batch["records"][0]["clock"] = None
    original = deepcopy(c.raw_frame)
    ingest(c)
    with c.store.transaction(USER) as tx:
        assert tx.get("raw_capture_frame", c.raw_frame["frame_id"]) == original


def test_frame_map_order_and_existing_record_new_key_preserve_replay(raw_setup):
    c = raw_setup
    second, frame = additional(c, parents=["process-1"])
    batch = {**c.batch, "records": [c.batch["records"][0], second]}
    ack = ingest(c, batch, [c.raw_frame, frame])
    before = documents(c)
    assert ingest(c, batch, (frame, c.raw_frame)) == ack
    assert documents(c) == before
    duplicate = ingest(c, batch, [frame, c.raw_frame], "another-key")
    assert duplicate["acknowledged"] == [{**r, "disposition": "duplicate"} for r in ack["acknowledged"]]
    shared = {**c.batch, "batch_id": "shared-frame", "records": [record(c.batch, "shared-record", 3)]}
    assert ingest(c, shared, request_key="shared-frame")["acknowledged"][0]["disposition"] == "accepted"


@pytest.mark.parametrize("change", ["batch_id", "record_order", "record_body", "orientation", "estimate", "buffer_sequence"])
def test_same_key_binds_complete_batch_and_raw_metadata(raw_setup, change):
    c = raw_setup
    second, frame = additional(c)
    batch = {**c.batch, "records": [c.batch["records"][0], second]}
    frames = [c.raw_frame, frame]
    ingest(c, batch, frames)
    changed_batch, changed_frames = deepcopy((batch, frames))
    if change == "batch_id":
        changed_batch["batch_id"] = "different-envelope"
    elif change == "record_order":
        changed_batch["records"].reverse()
    elif change == "record_body":
        changed_batch["records"][0]["evidence"]["reason_quote"] = "Changed synthetic observation."
    elif change == "orientation":
        changed_frames[0]["orientation"]["value"] = 1
    elif change == "estimate":
        changed_frames[0]["timing"]["observed_at_estimate"] = "2026-09-29T12:00:01Z"
    else:
        changed_frames[0]["buffer_sequence"] += 1
    denied(c, lambda: ingest(c, changed_batch, changed_frames), 409, "idempotency_conflict")


@pytest.mark.parametrize("shape", ["none", "empty", "dict", "duplicate", "extra", "omitted", "too_many"])
def test_explicit_frame_list_has_exact_unique_bounded_ids(raw_setup, shape):
    c = raw_setup
    frames = {"none": None, "empty": [], "dict": {c.raw_frame["frame_id"]: c.raw_frame},
              "duplicate": [c.raw_frame, deepcopy(c.raw_frame)],
              "extra": [c.raw_frame, {**c.raw_frame, "frame_id": "unreferenced"}],
              "omitted": [{**c.raw_frame, "frame_id": "missing-reference"}],
              "too_many": [{**c.raw_frame, "frame_id": f"frame-{i}"} for i in range(101)]}[shape]
    denied(c, lambda: c.registry.ingest_raw_frames(USER, c.batch, frames, "invalid-list"), 422, "invalid_request")


def test_one_hundred_frames_are_allowed_and_utf8_metadata_above_four_mib_is_refused(raw_setup):
    c = raw_setup
    pairs = [additional(c, record_id=f"raw-count-record-{i}", sequence=i, frame_id=f"raw-count-frame-{i}")
             for i in range(1, 101)]
    batch = {**c.batch, "records": [item for item, _ in pairs]}
    frames = [frame for _, frame in pairs]
    oversized = deepcopy(batch)
    for item in oversized["records"]:
        item["evidence"]["after"] = {"kind": "text", "text": "界" * 15000}
    assert len(json.dumps({"batch": oversized, "frames": frames}, ensure_ascii=False).encode()) > 4 * 1024 * 1024
    denied(c, lambda: ingest(c, oversized, frames), 413, "payload_too_large")
    assert len(ingest(c, batch, frames)["acknowledged"]) == 100


@pytest.mark.parametrize("path,value", [
    (("source", "user_id"), "foreign-user"), (("source", "source_id"), "other-source"),
    (("source", "source_version"), 2), (("device_id",), "other-device"),
    (("session_id",), "other-session"), (("stream_id",), "other-stream"),
    (("artifact", "sha256"), "b" * 64), (("artifact", "byte_length"), 1),
    (("artifact", "media_type"), "image/jpeg"), (("raw_width",), True),
    (("captured_at",), "2026-09-29T12:00:00Z"), (("media_position",), 0),
    (("orientation", "applied_to_pixels"), True), (("timing", "uncertainty_ms"), 0),
])
def test_raw_metadata_must_match_released_source_record_and_original(raw_setup, path, value):
    c = raw_setup
    frame = deepcopy(c.raw_frame)
    parent = frame
    for field in path[:-1]:
        parent = parent[field]
    parent[path[-1]] = value
    denied(c, lambda: ingest(c, frames=[frame]), 422)


@pytest.mark.parametrize("field,value", [
    ("observed_at", "2026-09-29T12:00:00Z"), ("media_position", 0),
    ("clock", {"domain_id": "other-clock", "elapsed_ms": 100, "uncertainty_ms": None}),
])
def test_callback_metadata_cannot_be_promoted_to_record_time(raw_setup, field, value):
    c = raw_setup
    batch = deepcopy(c.batch)
    batch["records"][0][field] = value
    denied(c, lambda: ingest(c, batch), 422)


def test_metadata_scope_does_not_supply_missing_attempt_authority(raw_setup):
    c = raw_setup
    c.batch["records"][0]["scope"] = {
        "kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 1}
    denied(c, lambda: ingest(c), 409, "dependency_missing")


@pytest.mark.parametrize("failure_kind", ["raw_capture_frame", "capture_record", "capture_replay", "commit"])
def test_staged_writes_and_failed_commit_roll_back_before_same_key_retry(raw_setup, monkeypatch, failure_kind):
    c = raw_setup
    before = documents(c)
    original_put, original_transaction = _MemoryTransaction.put, c.store.transaction
    failures = []

    def fail_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == failure_kind:
            failures.append(kind)
            raise RuntimeError("synthetic raw ingress failure")

    @contextmanager
    def fail_commit(actor):
        with original_transaction(actor) as tx:
            yield tx
            failures.append("commit")
            raise RuntimeError("synthetic raw ingress failure")

    with monkeypatch.context() as patch:
        if failure_kind == "commit":
            patch.setattr(c.store, "transaction", fail_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", fail_write)
        with pytest.raises(RuntimeError, match="synthetic raw ingress failure"):
            ingest(c)
    assert failures == [failure_kind]
    assert documents(c) == before
    assert ingest(c)["acknowledged"][0]["disposition"] == "accepted"


def test_later_frame_conflict_cannot_commit_earlier_valid_frame(rawcaptured):
    c = rawcaptured
    first, first_frame = additional(c)
    changed_original = deepcopy(c.raw_frame)
    changed_original["orientation"]["value"] = 1
    batch = {**c.batch, "batch_id": "mixed-conflict", "records": [first, c.batch["records"][0]]}
    denied(c, lambda: ingest(c, batch, [first_frame, changed_original], "mixed-conflict"), 409)


def test_authority_resolution_and_writes_share_one_actor_transaction(raw_setup, monkeypatch):
    c = raw_setup
    original_transaction, original_resolver = c.store.transaction, c.registry.capture.resolve
    transactions, resolutions = [], []

    @contextmanager
    def counted(actor):
        with original_transaction(actor) as tx:
            transactions.append((actor, tx))
            yield tx

    def resolve(tx, user_id, stream_id):
        resolutions.append(tx)
        return original_resolver(tx, user_id, stream_id)

    monkeypatch.setattr(c.store, "transaction", counted)
    monkeypatch.setattr(c.registry.capture, "resolve", resolve)
    ingest(c)
    assert len(transactions) == 1 and transactions[0][0] == USER
    assert resolutions == [transactions[0][1]]


@pytest.mark.parametrize("replay", [False, True])
def test_guard_invalidated_inside_transaction_withholds_ack_and_staged_writes(raw_setup, monkeypatch, replay):
    c = raw_setup
    if replay:
        ingest(c)
    original_put, original_get = _MemoryTransaction.put, _MemoryTransaction.get
    invalidated, guarded = [], []

    def observe_put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            invalidated.append("staged-receipt")

    def observe_get(tx, kind, identifier):
        value = original_get(tx, kind, identifier)
        if replay and kind == "capture_replay" and value is not None:
            invalidated.append("read-cached-receipt")
        return value

    def current_guard(state):
        if invalidated:
            guarded.append(True)
            raise DomainError(401, "unauthenticated")

    c.registry.capture.archive.authorization_guard = current_guard
    monkeypatch.setattr(_MemoryTransaction, "put", observe_put)
    monkeypatch.setattr(_MemoryTransaction, "get", observe_get)
    denied(c, lambda: ingest(c), 401, "unauthenticated")
    assert invalidated and guarded


def test_foreign_actor_and_unregistered_stream_do_not_gain_capture_permission(raw_setup):
    c = raw_setup
    before = deepcopy(c.store._documents)
    with pytest.raises(DomainError) as exc:
        c.registry.ingest_raw_frames("other-user", c.batch, [c.raw_frame], "foreign")
    assert exc.value.status == 404
    assert c.store._documents == before
    batch, frame = deepcopy((c.batch, c.raw_frame))
    batch["stream_id"] = frame["stream_id"] = "unregistered-stream"
    denied(c, lambda: ingest(c, batch, [frame]), 404)


@pytest.mark.parametrize("replay", [False, True])
@pytest.mark.parametrize("fence,status", [
    ("guard", 401), ("scope", 403), ("capability", 403), ("membership", 403),
    ("generation", 403), ("withdraw", 403), ("stop", 409), ("producer_stop", 409), ("source_revoke", 404),
])
def test_current_control_authority_is_rechecked_even_for_cached_success(raw_setup, replay, fence, status):
    c = raw_setup
    if replay:
        ingest(c)
    if fence == "guard":
        def expired(state):
            raise DomainError(401, "unauthenticated")
        c.registry.capture.archive.authorization_guard = expired
    elif fence == "scope":
        c.registry.scopes -= {"process:capture"}
    elif fence == "capability":
        c.registry.capabilities -= {"process.capture.v0.2"}
    elif fence == "membership":
        c.registry.set_membership(USER, c.batch["device_id"], c.batch["session_id"], active=False, expected_revision=1)
    elif fence == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    elif fence in {"withdraw", "stop"}:
        apply(c, command(c, fence))
    elif fence == "producer_stop":
        stop_fact(c, 1)
    else:
        c.archive.revoke_source(USER, c.source["source_id"])
    denied(c, lambda: ingest(c), status)


def test_sealed_historical_upload_preserves_stop_and_raw_unknowns(raw_setup):
    c = raw_setup
    apply(c, command(c))
    historical = {**c.batch, "delivery_mode": "historical"}
    denied(c, lambda: ingest(c, historical), 409, "capture_stopped")
    stop_fact(c, 1)
    stopped = apply(c, command(c, "seal_stop", revision=2, boundary=1), "seal")
    ack = ingest(c, historical)
    assert ingest(c, historical) == ack
    assert c.registry.read(USER, c.batch["stream_id"]) == stopped
    with c.store.transaction(USER) as tx:
        assert tx.get("raw_capture_frame", c.raw_frame["frame_id"]) == c.raw_frame
        assert tx.get("session", c.batch["session_id"])["live_capture"] is False
    later, later_frame = additional(c)
    denied(c, lambda: ingest(c, {**historical, "records": [later]}, [later_frame], "too-late"), 409, "capture_stopped")
    denied(c, lambda: ingest(c, request_key="live-after-stop"), 409, "capture_stopped")


@pytest.mark.parametrize("kind", [
    "raw_capture_frame", "artifact", "capture_record", "capture_slot", "capture_binding", "capture_artifact_ref",
])
def test_replay_never_restores_missing_committed_data(rawcaptured, kind):
    c = rawcaptured
    identities = {"raw_capture_frame": c.raw_frame["frame_id"], "artifact": c.ref["artifact_id"],
                  "capture_record": "process-1",
                  "capture_slot": key(c.batch["device_id"], c.batch["stream_id"], 1),
                  "capture_binding": c.batch["stream_id"], "capture_artifact_ref": c.ink_ref["artifact_id"]}
    del c.store._documents[USER][(kind, identities[kind])]
    denied(c, lambda: ingest(c), 503)


@pytest.mark.parametrize("target", ["screen", "ink"])
@pytest.mark.parametrize("corruption", ["bytes", "binding_version", "lost_binding"])
def test_cached_receipt_requires_all_current_typed_originals(rawcaptured, target, corruption):
    c = rawcaptured
    ref = c.ref if target == "screen" else c.ink_ref
    row = c.store._documents[USER][("artifact", ref["artifact_id"])]
    if corruption == "bytes":
        row["data_base64"] = "YQ=="
    elif corruption == "binding_version":
        row["original_binding"]["contract_version"] = "9.9.9"
    else:
        del row["original_binding"]
    denied(c, lambda: ingest(c), 503)


@pytest.mark.parametrize("corruption", ["invalid_json", "invalid_shape", "pending_artifact"])
def test_cached_ack_must_remain_valid_and_verified(rawcaptured, corruption):
    c = rawcaptured
    replay = c.store._documents[USER][("capture_replay", key("internal_raw_capture_frames", "raw-frames-1"))]
    ack = deepcopy(c.ack)
    if corruption == "invalid_json":
        replay["response_json"] = "{"
    else:
        if corruption == "invalid_shape":
            del ack["acknowledged"][0]["record_id"]
        else:
            ack["acknowledged"][0]["artifacts"][0]["status"] = "pending"
        replay["response_json"] = json.dumps(ack)
    denied(c, lambda: ingest(c), 503)


def test_corrupt_retained_raw_descriptor_is_unavailable(rawcaptured):
    c = rawcaptured
    del c.store._documents[USER][("raw_capture_frame", c.raw_frame["frame_id"])]["timing"]
    denied(c, lambda: ingest(c), 503)


@pytest.mark.parametrize("witness", ["slot", "ack"])
def test_new_key_and_sequence_cannot_restore_record_witnessed_by_slot_or_ack(rawcaptured, witness):
    c = rawcaptured
    del c.store._documents[USER][("capture_record", "process-1")]
    if witness == "ack":
        del c.store._documents[USER][("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1))]
    else:
        del c.store._documents[USER][("capture_replay", key("internal_raw_capture_frames", "raw-frames-1"))]
    changed = deepcopy(c.batch)
    changed["records"][0]["sequence"] = 2
    denied(c, lambda: ingest(c, changed, request_key="new-key"), 503)


def test_surviving_child_witnesses_a_lost_parent_without_slot_or_receipt(raw_setup):
    c = raw_setup
    child, child_frame = additional(c, parents=["process-1"])
    batch = {**c.batch, "records": [c.batch["records"][0], child]}
    ingest(c, batch, [c.raw_frame, child_frame])
    for identity in (("capture_record", "process-1"),
                     ("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1)),
                     ("capture_replay", key("internal_raw_capture_frames", "raw-frames-1"))):
        del c.store._documents[USER][identity]
    changed = record(c.batch, "process-1", 3)
    changed["evidence"]["reason_quote"] = "Changed parent after loss."
    denied(c, lambda: ingest(c, {**c.batch, "records": [changed]}, request_key="new-parent"), 503)


@pytest.mark.parametrize("parent", [False, True])
def test_new_record_cannot_resurrect_lost_raw_frame(rawcaptured, parent):
    c = rawcaptured
    del c.store._documents[USER][("raw_capture_frame", c.raw_frame["frame_id"])]
    child = record(c.batch, "later-record", 2, causal_parents=["process-1"] if parent else [])
    denied(c, lambda: ingest(c, {**c.batch, "records": [child]}, request_key="new-record"), 503)


@pytest.mark.parametrize("corruption", ["record_json", "record_shape", "frame", "ink"])
def test_stored_parent_metadata_and_originals_are_rechecked(rawcaptured, corruption):
    c = rawcaptured
    if corruption == "record_json":
        c.store._documents[USER][("capture_record", "process-1")]["canonical_json"] = "{"
    elif corruption == "record_shape":
        row = c.store._documents[USER][("capture_record", "process-1")]
        decoded = json.loads(row["canonical_json"])
        del decoded["record"]["source"]
        row["canonical_json"] = json.dumps(decoded)
    elif corruption == "frame":
        del c.store._documents[USER][("raw_capture_frame", c.raw_frame["frame_id"])]["timing"]
    else:
        c.store._documents[USER][("artifact", c.ink_ref["artifact_id"])]["data_base64"] = "YQ=="
    child, frame = additional(c, parents=["process-1"])
    child["artifacts"] = [deepcopy(c.ref)]
    denied(c, lambda: ingest(c, {**c.batch, "records": [child]}, [frame], "child"), 503)


@pytest.mark.parametrize("child_family", ["raw", "legacy"])
def test_retained_raw_parent_allows_valid_new_raw_and_legacy_children(rawcaptured, child_family):
    c = rawcaptured
    parent_identity = ("capture_record", "process-1")
    before = documents(c)
    child, frame = additional(c, parents=["process-1"])
    batch = {**c.batch, "batch_id": "valid-continuation", "records": [child]}
    if child_family == "legacy":
        frame = {**deepcopy(c.frame), "frame_id": child["frame_id"]}
        child["media_position"] = frame["media_position"]
        ack = c.registry.ingest_frames(USER, batch, [frame], "valid-legacy-child")
        frame_kind = "frame"
    else:
        ack = ingest(c, batch, [frame], "valid-raw-child")
        frame_kind = "raw_capture_frame"
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert all(ref["status"] == "verified" for ref in ack["acknowledged"][0]["artifacts"])
    after = documents(c)
    assert after[parent_identity] == before[parent_identity]
    assert after[("raw_capture_frame", c.raw_frame["frame_id"])] == c.raw_frame
    assert after[(frame_kind, frame["frame_id"])] == frame
    assert json.loads(after[("capture_record", child["record_id"])]["canonical_json"])["record"] == child
    for identity in [("capture_binding", c.batch["stream_id"]),
                     *(("capture_artifact_ref", ref["artifact_id"]) for ref in (c.ref, c.ink_ref))]:
        assert after[identity] == before[identity]


@pytest.mark.parametrize("child_family", ["raw", "legacy"])
@pytest.mark.parametrize("missing_kind", ["capture_binding", "capture_artifact_ref", "capture_slot"])
def test_missing_ancestor_inventory_cannot_be_restored_by_either_child_ingress(
    rawcaptured, child_family, missing_kind,
):
    c = rawcaptured
    identifier = {"capture_binding": c.batch["stream_id"],
                  "capture_artifact_ref": c.ink_ref["artifact_id"],
                  "capture_slot": key(c.batch["device_id"], c.batch["stream_id"], 1)}[missing_kind]
    del c.store._documents[USER][(missing_kind, identifier)]
    child, frame = additional(c, parents=["process-1"])
    batch = {**c.batch, "batch_id": "child-with-lost-parent-inventory", "records": [child]}
    if child_family == "legacy":
        frame = {**deepcopy(c.frame), "frame_id": child["frame_id"]}
        child["media_position"] = frame["media_position"]
        action = lambda: c.registry.ingest_frames(USER, batch, [frame], "legacy-child")
    else:
        action = lambda: ingest(c, batch, [frame], "raw-child")
    denied(c, action, 503, "unavailable")
    assert (missing_kind, identifier) not in c.store._documents[USER]


@pytest.mark.parametrize("writer_family", ["raw", "legacy"])
def test_new_record_without_parent_cannot_recreate_a_committed_artifact_pin(rawcaptured, writer_family):
    c = rawcaptured
    artifact_id = c.ink_ref["artifact_id"]
    del c.store._documents[USER][("capture_artifact_ref", artifact_id)]
    item, frame = additional(c)
    assert item["causal_parents"] == []
    batch = {**c.batch, "batch_id": "unrelated-new-record", "records": [item]}
    if writer_family == "legacy":
        frame = {**deepcopy(c.frame), "frame_id": item["frame_id"]}
        item["media_position"] = frame["media_position"]
        action = lambda: c.registry.ingest_frames(USER, batch, [frame], "legacy-without-parent")
    else:
        action = lambda: ingest(c, batch, [frame], "raw-without-parent")
    denied(c, action, 503, "unavailable")
    assert ("capture_artifact_ref", artifact_id) not in c.store._documents[USER]


@pytest.mark.parametrize("writer_family", ["raw", "legacy"])
@pytest.mark.parametrize("witness", ["raw_frame", "ack"])
def test_isolated_original_witness_prevents_pin_recreation_by_either_writer(
    rawcaptured, writer_family, witness,
):
    c = rawcaptured
    lost_pin = ("capture_artifact_ref", c.ref["artifact_id"])
    raw_identity = ("raw_capture_frame", c.raw_frame["frame_id"])
    ack_identity = ("capture_replay", key("internal_raw_capture_frames", "raw-frames-1"))
    for identity in [lost_pin, ("capture_record", "process-1"),
                     ("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1)),
                     ack_identity if witness == "raw_frame" else raw_identity]:
        del c.store._documents[USER][identity]
    assert (raw_identity if witness == "raw_frame" else ack_identity) in c.store._documents[USER]
    item, frame = additional(c)
    assert item["causal_parents"] == []
    batch = {**c.batch, "batch_id": "new-record-with-lost-pin", "records": [item]}
    if writer_family == "legacy":
        frame = {**deepcopy(c.frame), "frame_id": item["frame_id"]}
        item["media_position"] = frame["media_position"]
        action = lambda: c.registry.ingest_frames(USER, batch, [frame], "legacy-new-pin")
    else:
        action = lambda: ingest(c, batch, [frame], "raw-new-pin")
    denied(c, action, 503, "unavailable")
    assert lost_pin not in c.store._documents[USER]


@pytest.mark.parametrize("writer_family", ["raw", "legacy"])
@pytest.mark.parametrize("witness", ["raw_frame", "slot", "ack"])
def test_isolated_stream_witness_prevents_binding_recreation_by_either_writer(
    rawcaptured, writer_family, witness,
):
    c = rawcaptured
    rows = {"raw_frame": ("raw_capture_frame", c.raw_frame["frame_id"]),
            "slot": ("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1)),
            "ack": ("capture_replay", key("internal_raw_capture_frames", "raw-frames-1"))}
    for identity in [("capture_binding", c.batch["stream_id"]), ("capture_record", "process-1"),
                     *(identity for name, identity in rows.items() if name != witness)]:
        del c.store._documents[USER][identity]
    assert rows[witness] in c.store._documents[USER]
    item, frame = additional(c)
    assert item["causal_parents"] == []
    batch = {**c.batch, "batch_id": "new-stream-record", "records": [item]}
    if writer_family == "legacy":
        frame = {**deepcopy(c.frame), "frame_id": item["frame_id"]}
        item["media_position"] = frame["media_position"]
        action = lambda: c.registry.ingest_frames(USER, batch, [frame], "legacy-new-stream-record")
    else:
        action = lambda: ingest(c, batch, [frame], "raw-new-stream-record")
    denied(c, action, 503, "unavailable")
    assert ("capture_binding", c.batch["stream_id"]) not in c.store._documents[USER]


@pytest.mark.parametrize("corruption", ["empty", "foreign", "duplicate"])
def test_cached_dependency_source_ids_must_match_resolved_sources(rawcaptured, corruption):
    c = rawcaptured
    replay = c.store._documents[USER][("capture_replay", key("internal_raw_capture_frames", "raw-frames-1"))]
    replay["source_ids"] = {"empty": [], "foreign": ["unrelated-source"],
                            "duplicate": [c.source["source_id"], c.source["source_id"]]}[corruption]
    denied(c, lambda: ingest(c), 503, "unavailable")


@pytest.mark.parametrize("corruption", ["invalid_json", "invalid_shape"])
def test_malformed_ack_inventory_during_missing_parent_traversal_is_sanitized(rawcaptured, corruption):
    c = rawcaptured
    replay = c.store._documents[USER][("capture_replay", key("internal_raw_capture_frames", "raw-frames-1"))]
    if corruption == "invalid_json":
        replay["response_json"] = "{"
    else:
        ack = deepcopy(c.ack)
        del ack["acknowledged"][0]["record_id"]
        replay["response_json"] = json.dumps(ack)
    child, frame = additional(c, parents=["never-recorded-parent"])
    denied(c, lambda: ingest(c, {**c.batch, "batch_id": "missing-parent", "records": [child]},
                            [frame], "missing-parent"), 503, "unavailable")


@pytest.mark.parametrize("witness", ["raw_frame", "ack"])
def test_isolated_committed_witness_prevents_missing_original_recreation(rawcaptured, witness):
    c = rawcaptured
    removed = [("artifact", c.ref["artifact_id"]), ("capture_record", "process-1"),
               ("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1)),
               ("capture_artifact_ref", c.ref["artifact_id"])]
    removed.append(("raw_capture_frame", c.raw_frame["frame_id"]) if witness == "ack" else
                   ("capture_replay", key("internal_raw_capture_frames", "raw-frames-1")))
    for identity in removed:
        del c.store._documents[USER][identity]
    next_record = record(c.batch, "fresh-record", 2)
    denied(c, lambda: ingest(c, {**c.batch, "records": [next_record]}, request_key="fresh-key"), 503)


def test_new_internal_path_does_not_enable_existing_http_or_default_capture(raw_setup):
    c = raw_setup
    before = documents(c)
    response = request(c.app, "POST", FRAMES,
                       body={"contract_version": "0.2.4", "batch": c.batch, "frames": [c.raw_frame]})
    http_error(response, 422, "invalid_request")
    assert documents(c) == before
    assert c.registry.capture.allow_artifact_references is False
    denied(c, lambda: c.registry.capture.ingest(USER, c.batch, "default"), 409)
    denied(c, lambda: c.registry.ingest_frames(USER, c.batch, [c.raw_frame], "legacy-internal"), 422)
    ingest(c)
    assert c.registry.capture.allow_artifact_references is False
