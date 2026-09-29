"""Synthetic PNG/original -> atomic control-backed frame ingress -> byte read.

Sources, producer facts and pixels here are explicitly synthetic test data.
MemoryStore checks do not establish device capture, PostgreSQL, provider receipt,
Learning context export, or the original-live-screen acceptance gates.
"""

import base64
from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json

import pytest

from services.api.control import ControlRegistry
from services.api.capture import CaptureArchive
from services.api.domain import checked, key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.original_artifacts import OriginalArtifacts
from services.api.storage import MemoryStore, _MemoryTransaction
from services.api.tests.test_capture import fails, record
from services.api.tests.test_control import (
    CAPABILITIES, SCOPES, USER, apply, command, control_fixture, documents,
    registration, resolve_stop_fact, start, stop_fact,
)
from services.api.tests.test_image_resolver import png


@pytest.fixture
def setup():
    c = control_fixture(MemoryStore(), USER)
    c.data = png()
    c.source = {"user_id": USER, "source_id": "simulated-ingested-web-source", "source_version": 1}
    c.snapshot = {**deepcopy(c.core["SourceSnapshot"]), **c.source, "type": "web",
                  "provenance": {"origin": "user_authorized", "consent_scope": "learning",
                      "attribution": "SYNTHETIC TEST DATA simulating already-authorized ingestion; no capture",
                      "license": "project-test-fixture"}}
    # Test-only source precondition. No production source ingestion is claimed;
    # import_fixture retains its synthetic-only gate and is not repurposed.
    checked("SourceSnapshot", c.snapshot)
    with c.store.transaction(USER) as tx:
        source = tx.get("source", c.core["SourceSnapshot"]["source_id"])
        source.update(source_id=c.source["source_id"], type="web")
        tx.put("source", c.source["source_id"], source)
        tx.put("snapshot", key(c.source["source_id"], 1), c.snapshot)
    c.originals = OriginalArtifacts(c.store, lambda state: None)
    c.ref = {"artifact_id": "synthetic-test-png", "media_type": "image/png",
             "sha256": hashlib.sha256(c.data).hexdigest(), "byte_length": len(c.data)}
    c.frame = {**c.core["Frame"], **c.source, "frame_id": "synthetic-screen-test-frame",
               "artifact_id": c.ref["artifact_id"], "content_hash": c.ref["sha256"],
               "width": 2, "height": 2, "representation": "screen_capture"}
    c.batch["records"][0].update(source=c.source, frame_id=c.frame["frame_id"], artifacts=[c.ref],
                                media_position=c.frame["media_position"])
    c.originals.put(USER, c.source, "screen_image", c.ref, c.data)
    return c


def ingest(c, batch=None, frames=None, request_key="frames-1"):
    return c.registry.ingest_frames(c.user, c.batch if batch is None else batch,
                                   [c.frame] if frames is None else frames, request_key)


def add_ink(c):
    data = b'{"test_only":true,"strokes":[{"points":[[1,2],[3,4]]}]}\n'
    ref = {"artifact_id": "synthetic-editable-ink", "media_type": "application/json",
           "sha256": hashlib.sha256(data).hexdigest(), "byte_length": len(data)}
    c.originals.put(USER, c.source, "editable_ink", ref, data)
    c.batch["records"][0]["artifacts"].append(ref)
    return ref, data


def additional(c, *, sequence=2, frame_id="second-synthetic-frame"):
    frame = {**c.frame, "frame_id": frame_id}
    item = record(c.batch, "second-record", sequence, frame_id=frame_id)
    return item, frame


def denied(c, action, status=None):
    before = documents(c)
    with pytest.raises(DomainError) as error:
        action()
    if status is not None:
        assert error.value.status == status
    assert documents(c) == before
    return error.value


def test_uploaded_png_and_editable_ink_commit_exact_frames_records_and_verified_ack(setup):
    c = setup
    ink, ink_data = add_ink(c)
    request = deepcopy((c.batch, c.frame))
    before = documents(c)
    ack = ingest(c)
    receipt = ack["acknowledged"][0]
    assert receipt["disposition"] == "accepted" and receipt["envelope"] == "committed"
    assert receipt["artifacts"] == [{**ref, "status": "verified"} for ref in (c.ref, ink)]
    assert (c.batch, c.frame) == request
    saved = c.registry.capture.read_record(USER, "process-1")
    assert saved["record"] == c.batch["records"][0]
    assert saved["received_at"] == receipt["received_at"]
    with c.store.transaction(USER) as tx:
        assert tx.get("frame", c.frame["frame_id"]) == c.frame
        assert tx.scan("event") == []
        assert tx.get("snapshot", key(c.source["source_id"], 1)) == c.snapshot
        assert tx.get("session", c.frame["session_id"]) == before[("session", c.frame["session_id"])]
    resolver = AuthorizedImageResolver(c.store, USER, lambda state: None)
    assert resolver(c.frame, max_bytes=len(c.data)) == {
        "status": "available", "frame": c.frame, "media_type": "image/png", "data": c.data,
    }
    assert base64.b64decode(c.originals.read(USER, c.source, ink["artifact_id"])["data_base64"]) == ink_data
    c.registry = ControlRegistry(c.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                 authorization_guard=lambda state: None,
                                 stop_fact_resolver=resolve_stop_fact)
    assert ingest(c) == ack
    assert c.registry.capture.read_record(USER, "process-1") == saved


def test_existing_frame_and_frame_list_order_do_not_change_exact_replay(setup):
    c = setup
    second, frame = additional(c)
    batch = {**c.batch, "records": [c.batch["records"][0], second]}
    ack = ingest(c, batch, [c.frame, frame])
    assert ingest(c, batch, (frame, c.frame)) == ack
    later = {**c.batch, "batch_id": "later", "records": [record(c.batch, "later", 3)]}
    assert ingest(c, later, request_key="later")["acknowledged"][0]["disposition"] == "accepted"
    with c.store.transaction(USER) as tx:
        assert tx.get("frame", c.frame["frame_id"]) == c.frame


@pytest.mark.parametrize("change", ["batch", "record", "frame"])
def test_replay_key_binds_complete_batch_and_complete_frame_map(setup, change):
    c = setup
    ingest(c)
    batch, frame = deepcopy(c.batch), deepcopy(c.frame)
    if change == "batch":
        batch["batch_id"] = "changed"
    elif change == "record":
        batch["records"][0]["evidence"]["reason_quote"] = "A different synthetic reason."
    else:
        frame["width"] = 3
    error = denied(c, lambda: ingest(c, batch, [frame]), 409)
    assert error.code == "idempotency_conflict"


@pytest.mark.parametrize("shape", ["none", "empty", "dict", "duplicate", "extra", "omitted"])
def test_frames_must_be_a_nonempty_exact_set_of_complete_unique_proposals(setup, shape):
    c = setup
    frames = {"none": None, "empty": [], "dict": {c.frame["frame_id"]: c.frame},
              "duplicate": [c.frame, deepcopy(c.frame)],
              "extra": [c.frame, {**c.frame, "frame_id": "unreferenced"}],
              "omitted": [{**c.frame, "frame_id": "wrong-frame"}]}[shape]
    denied(c, lambda: c.registry.ingest_frames(USER, c.batch, frames, "invalid"), 422)


@pytest.mark.parametrize("field,value", [
    ("user_id", "other-user"), ("source_id", "other-source"), ("source_version", 2),
    ("source_version", True), ("device_id", "other-device"), ("session_id", "other-session"),
    ("media_position", 20), ("content_hash", "0" * 64), ("representation", "synthetic_fixture"),
    ("representation", "dom_snapshot"), ("width", 0), ("captured_at", "not-a-time"),
    ("undeclared_capture_claim", True),
])
def test_complete_released_frame_binding_is_validated_atomically(setup, field, value):
    denied(setup, lambda: ingest(setup, frames=[{**setup.frame, field: value}]), 422)


def test_missing_frame_property_is_rejected_before_any_archive_write(setup):
    frame = deepcopy(setup.frame)
    del frame["captured_at"]
    denied(setup, lambda: ingest(setup, frames=[frame]), 422)


@pytest.mark.parametrize("target", ["screen", "extra_ink"])
@pytest.mark.parametrize("failure", ["absent", "legacy", "corrupt_bytes", "foreign_source", "foreign_owner", "lost_binding"])
@pytest.mark.parametrize("replay", [False, True])
def test_every_reference_requires_current_owned_source_bound_typed_bytes(setup, target, failure, replay):
    c = setup
    ref, data = add_ink(c) if target == "extra_ink" else (c.ref, c.data)
    if replay:
        ingest(c)
    identity = ("artifact", ref["artifact_id"])
    row = c.store._documents[USER][identity]
    if failure == "absent":
        del c.store._documents[USER][identity]
    elif failure == "legacy":
        c.store._documents[USER][identity] = {
            "user_id": USER, "id": ref["artifact_id"], "kind": "capture",
            "content_hash": ref["sha256"], "media_type": ref["media_type"],
            "data_base64": base64.b64encode(data).decode(),
        }
    elif failure == "corrupt_bytes":
        row["data_base64"] = "YQ=="
    elif failure == "foreign_source":
        row["original_binding"]["source"]["source_id"] = "other-source"
    elif failure == "foreign_owner":
        row["user_id"] = "other-user"
    else:
        del row["original_binding"]
    error = denied(c, lambda: ingest(c))
    assert error.status in {404, 409, 422, 503}


def test_additional_record_without_frame_still_requires_all_its_originals(setup):
    c = setup
    ref, _ = add_ink(c)
    c.batch["records"][0]["artifacts"] = [c.ref]
    second = record(c.batch, "ink-only", 2, frame_id=None, artifacts=[ref])
    batch = {**c.batch, "records": [c.batch["records"][0], second]}
    del c.store._documents[USER][("artifact", ref["artifact_id"])]
    denied(c, lambda: ingest(c, batch), 409)


@pytest.mark.parametrize("change,status", [
    ("guard", 401), ("scope", 403), ("capability", 403), ("membership", 403),
    ("generation", 403), ("withdraw", 403), ("stop", 409), ("producer_stop", 409),
    ("revoked_source", 404), ("deleted_source", 404), ("missing_device", 404),
])
@pytest.mark.parametrize("replay", [False, True])
def test_current_authority_fences_new_writes_and_previously_successful_replay(setup, change, status, replay):
    c = setup
    if replay:
        ingest(c)
    if change == "guard":
        def expired(state):
            raise DomainError(401, "unauthenticated")
        c.registry.capture.archive.authorization_guard = expired
    elif change == "scope":
        c.registry.scopes -= {"process:capture"}
    elif change == "capability":
        c.registry.capabilities -= {"process.capture.v0.2"}
    elif change == "membership":
        c.registry.set_membership(USER, c.frame["device_id"], c.frame["session_id"],
                                  active=False, expected_revision=1)
    elif change == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    elif change in {"stop", "withdraw"}:
        apply(c, command(c, change))
    elif change == "producer_stop":
        stop_fact(c, 1)
    elif change == "revoked_source":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif change == "deleted_source":
        c.archive.delete_source(USER, c.source["source_id"])
    else:
        del c.store._documents[USER][("device", c.frame["device_id"])]
    denied(c, lambda: ingest(c), status)


def test_sealed_historical_backfill_keeps_stream_stopped_and_original_timestamps(setup):
    c = setup
    apply(c, command(c))
    historical = {**c.batch, "delivery_mode": "historical"}
    denied(c, lambda: ingest(c, historical), 409)
    stop_fact(c, 1)
    state = apply(c, command(c, "seal_stop", revision=2, boundary=1), "seal")
    ack = ingest(c, historical)
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert ingest(c, historical) == ack
    assert c.registry.read(USER, c.batch["stream_id"]) == state
    with c.store.transaction(USER) as tx:
        assert tx.get("frame", c.frame["frame_id"])["captured_at"] == c.frame["captured_at"]
        assert tx.get("session", c.frame["session_id"])["live_capture"] is False
    second, frame = additional(c)
    too_late = {**historical, "records": [second]}
    denied(c, lambda: ingest(c, too_late, [frame], "late"), 409)
    denied(c, lambda: ingest(c, request_key="live-after-stop"), 409)


@pytest.mark.parametrize("conflict", ["record", "slot", "frame", "record_tombstone", "frame_tombstone"])
def test_conflicting_mixed_batch_never_leaks_partial_frame_or_ack(setup, conflict):
    c = setup
    if conflict in {"record", "slot", "frame"}:
        ingest(c)
    first, frame = additional(c)
    bad = deepcopy(c.batch["records"][0])
    proposal = deepcopy(c.frame)
    if conflict == "record":
        bad["evidence"]["reason_quote"] = "Changed original."
    elif conflict == "slot":
        bad["record_id"] = "collision"
    elif conflict == "frame":
        proposal["width"] = 4
    else:
        kind = "capture_tombstone" if conflict == "record_tombstone" else "frame_tombstone"
        identifier = bad["record_id"] if conflict == "record_tombstone" else proposal["frame_id"]
        c.store._documents[USER][(kind, identifier)] = {"record_id" if kind == "capture_tombstone" else "frame_id": identifier}
    batch = {**c.batch, "batch_id": "mixed", "records": [first, bad]}
    denied(c, lambda: ingest(c, batch, [frame, proposal], "mixed"),
           404 if conflict.endswith("tombstone") else 409)


@pytest.mark.parametrize("failure_kind", ["frame", "capture_record", "capture_replay", "commit"])
def test_failed_transaction_cannot_return_ack_or_leave_partial_frame(setup, monkeypatch, failure_kind):
    c = setup
    before = documents(c)
    original_put, original_transaction = _MemoryTransaction.put, c.store.transaction

    def fail_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == failure_kind:
            raise RuntimeError("synthetic failed write")

    @contextmanager
    def fail_commit(actor):
        with original_transaction(actor) as tx:
            yield tx
            raise RuntimeError("synthetic failed commit")

    with monkeypatch.context() as patch:
        if failure_kind == "commit":
            patch.setattr(c.store, "transaction", fail_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", fail_write)
        with pytest.raises(RuntimeError, match="synthetic failed"):
            ingest(c)
    assert documents(c) == before
    assert ingest(c)["acknowledged"][0]["disposition"] == "accepted"


def test_current_authority_frames_and_capture_are_checked_under_one_actor_transaction(setup, monkeypatch):
    c = setup
    original_transaction, original_resolver = c.store.transaction, c.registry.capture.resolve
    transactions, resolution = [], []

    @contextmanager
    def counted(actor):
        with original_transaction(actor) as tx:
            transactions.append((actor, tx))
            yield tx

    def current(tx, user_id, stream_id):
        resolution.append(tx)
        return original_resolver(tx, user_id, stream_id)

    monkeypatch.setattr(c.store, "transaction", counted)
    monkeypatch.setattr(c.registry.capture, "resolve", current)
    ingest(c)
    assert len(transactions) == 1 and transactions[0][0] == USER
    assert resolution == [transactions[0][1]]


@pytest.mark.parametrize("missing_frame", [False, True])
def test_deleted_frame_identity_cannot_be_reassigned_through_fixture_import(setup, missing_frame):
    c = setup
    ingest(c)
    if missing_frame:
        del c.store._documents[USER][("frame", c.frame["frame_id"])]
    c.archive.delete_source(USER, c.source["source_id"])
    with c.store.transaction(USER) as tx:
        assert tx.get("frame", c.frame["frame_id"]) is None
        assert tx.get("frame_tombstone", c.frame["frame_id"]) == {"frame_id": c.frame["frame_id"]}
        assert tx.get("original_artifact_tombstone", c.ref["artifact_id"]) == {"artifact_id": c.ref["artifact_id"]}
        assert tx.scan("capture_record") == []
        assert all(row["deleted"] for row in tx.scan("capture_replay"))
    source = {**c.core["SourceSnapshot"], "source_id": "fresh-synthetic-source"}
    frame = {**c.frame, "source_id": source["source_id"], "artifact_id": "fresh-synthetic-original",
             "representation": "synthetic_fixture"}
    denied(c, lambda: c.archive.import_fixture(USER, source, frame, c.data), 404)


@pytest.mark.parametrize("missing", ["source", "snapshot"])
def test_ingress_does_not_register_or_fabricate_unknown_sources(setup, missing):
    c = setup
    identity = (missing, c.source["source_id"] if missing == "source" else key(c.source["source_id"], 1))
    del c.store._documents[USER][identity]
    denied(c, lambda: ingest(c), 404)


def test_new_entry_does_not_enable_default_capture_or_weaken_fixture_only_import(setup):
    c = setup
    assert c.registry.capture.allow_artifact_references is False
    fails(409, "dependency_missing", lambda: c.registry.capture.ingest(USER, c.batch, "default"))
    denied(c, lambda: c.archive.import_fixture(USER, c.core["SourceSnapshot"], c.frame, c.data), 422)
    ingest(c)
    assert c.registry.capture.allow_artifact_references is False
    fails(409, "dependency_missing", lambda: c.registry.capture.ingest(USER, c.batch, "default"))


@pytest.mark.parametrize("kind", ["frame", "artifact", "capture_record", "capture_slot"])
def test_cached_success_never_recreates_a_missing_committed_original(setup, kind):
    c = setup
    ingest(c)
    identities = {"frame": c.frame["frame_id"], "artifact": c.ref["artifact_id"],
                  "capture_record": "process-1"}
    identifier = (identities[kind] if kind != "capture_slot" else
                  next(key[1] for key in c.store._documents[USER] if key[0] == kind))
    del c.store._documents[USER][(kind, identifier)]
    denied(c, lambda: ingest(c))


@pytest.mark.parametrize("witness", ["slot_and_replay", "slot_only", "replay_only"])
@pytest.mark.parametrize("sequence", [1, 2])
@pytest.mark.parametrize("other_stream", [False, True])
def test_new_key_cannot_restore_missing_record_witnessed_by_committed_slot_or_receipt(
        setup, witness, sequence, other_stream):
    c = setup
    ingest(c)
    if witness == "replay_only":
        # Keep a later unrelated receipt too: the older ACK still witnesses the
        # lost ID and must not be hidden by a newer success for the shared frame.
        later = {**c.batch, "batch_id": "later", "records": [record(c.batch, "later-record", 3)]}
        ingest(c, later, request_key="later-receipt")
    batch = deepcopy(c.batch)
    batch["batch_id"] = "retry-after-loss"
    batch["records"][0]["sequence"] = sequence
    if other_stream:
        body = registration(c, "another-valid-stream")
        start(c, body, producer="another-synthetic-producer", request_key="register-another")
        batch["stream_id"] = body["stream_id"]
    del c.store._documents[USER][("capture_record", "process-1")]
    slot_id = key(c.batch["device_id"], c.batch["stream_id"], 1)
    if witness == "replay_only":
        del c.store._documents[USER][("capture_slot", slot_id)]
    elif witness == "slot_only":
        replay_ids = [identity for identity in c.store._documents[USER] if identity[0] == "capture_replay"]
        for identity in replay_ids:
            del c.store._documents[USER][identity]
    with c.store.transaction(USER) as tx:
        assert tx.get("capture_record", "process-1") is None
        assert (tx.get("capture_slot", slot_id) is not None) == (witness != "replay_only")
        receipts = [json.loads(row["response_json"]) for row in tx.scan("capture_replay")]
        witnessed_ids = {item["record_id"] for ack in receipts for item in ack["acknowledged"]}
        assert ("process-1" in witnessed_ids) == (witness != "slot_only")
        if witness == "replay_only":
            assert len(receipts) == 2 and "later-record" in witnessed_ids
    denied(c, lambda: ingest(c, batch, request_key="new-key-after-loss"), 503)


def test_existing_record_new_key_and_new_record_shared_frame_remain_valid(setup):
    c = setup
    first = ingest(c)
    duplicate = ingest(c, request_key="exact-original-new-key")
    assert duplicate["acknowledged"] == [
        {**first["acknowledged"][0], "disposition": "duplicate"},
    ]
    second = record(c.batch, "new-record-sharing-frame", 2)
    batch = {**c.batch, "batch_id": "new-record-batch", "records": [second]}
    assert ingest(c, batch, request_key="shared-frame")["acknowledged"][0]["disposition"] == "accepted"
    assert c.registry.capture.read_record(USER, "process-1")["record"] == c.batch["records"][0]
    assert c.registry.capture.read_record(USER, second["record_id"])["record"] == second
    with c.store.transaction(USER) as tx:
        assert tx.get("frame", c.frame["frame_id"]) == c.frame


def test_committed_child_prevents_changed_missing_parent_from_being_recreated(setup):
    c = setup
    child, frame = additional(c)
    child["causal_parents"] = ["process-1"]
    original = {**c.batch, "records": [c.batch["records"][0], child]}
    # Both nodes are new in this first batch; its parent link must remain valid.
    ack = ingest(c, original, [c.frame, frame])
    assert [item["disposition"] for item in ack["acknowledged"]] == ["accepted", "accepted"]
    del c.store._documents[USER][("capture_record", "process-1")]
    del c.store._documents[USER][("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1))]
    for identity in list(c.store._documents[USER]):
        if identity[0] == "capture_replay":
            del c.store._documents[USER][identity]
    changed = record(c.batch, "process-1", 3)
    changed["evidence"]["reason_quote"] = "A changed synthetic parent original."
    assert changed["causal_parents"] == []
    batch = {**c.batch, "batch_id": "parent-after-loss", "records": [changed]}
    denied(c, lambda: ingest(c, batch, request_key="new-parent-key"), 503)


@pytest.mark.parametrize("receipt_state", ["invalid_json", "invalid_ack", "deleted"])
def test_new_record_receipt_scan_rejects_corruption_but_skips_erasure_tombstones(setup, receipt_state):
    c = setup
    ack = ingest(c)
    replay_key = "unrelated-old-receipt"
    with c.store.transaction(USER) as tx:
        replay = {**tx.scan("capture_replay")[0], "key": replay_key}
        if receipt_state == "invalid_json":
            replay["response_json"] = "{"
        elif receipt_state == "invalid_ack":
            del ack["acknowledged"][0]["record_id"]
            replay["response_json"] = json.dumps(ack)
        else:
            replay = {"key": replay_key, "deleted": True}
        tx.put("capture_replay", replay_key, replay)
    batch = {**c.batch, "records": [record(c.batch, "new-record", 2)]}
    if receipt_state == "deleted":
        assert ingest(c, batch, request_key="new-record")["acknowledged"][0]["disposition"] == "accepted"
    else:
        denied(c, lambda: ingest(c, batch, request_key="new-record"), 503)


@pytest.mark.parametrize("causal_parent", [False, True])
def test_new_record_cannot_resurrect_missing_frame_with_new_key_or_sequence(setup, causal_parent):
    c = setup
    ingest(c)
    del c.store._documents[USER][("frame", c.frame["frame_id"])]
    second = record(c.batch, "new-record", 2, causal_parents=["process-1"] if causal_parent else [])
    batch = {**c.batch, "batch_id": "new-batch", "records": [second]}
    denied(c, lambda: ingest(c, batch, request_key="new-key"), 404 if causal_parent else 503)


@pytest.mark.parametrize("field,value", [
    ("snapshot_type", "synthetic"), ("source_type", "synthetic"),
    ("origin", "synthetic"), ("consent_scope", "test_only"),
])
def test_synthetic_source_metadata_cannot_satisfy_production_ingress_precondition(setup, field, value):
    c = setup
    snapshot = c.store._documents[USER][("snapshot", key(c.source["source_id"], 1))]
    if field == "snapshot_type":
        snapshot["type"] = value
    elif field == "source_type":
        c.store._documents[USER][("source", c.source["source_id"])]["type"] = value
    else:
        snapshot["provenance"][field] = value
    denied(c, lambda: ingest(c), 409)


@pytest.mark.parametrize("field,value", [
    ("access_status", "registered"), ("content_hash", "0" * 64), ("source_version", 2),
])
def test_unready_or_inconsistent_source_snapshot_cannot_receive_frames(setup, field, value):
    c = setup
    c.store._documents[USER][("snapshot", key(c.source["source_id"], 1))][field] = value
    denied(c, lambda: ingest(c))


def test_a_typed_child_cannot_adopt_an_untyped_stored_ancestor_original(setup):
    c = setup
    ref, data = add_ink(c)
    parent = record(c.batch, "legacy-parent", 1, frame_id=None, artifacts=[ref])
    c.store._documents[USER][("artifact", ref["artifact_id"])] = {
        "user_id": USER, "id": ref["artifact_id"], "kind": "capture",
        "content_hash": ref["sha256"], "media_type": ref["media_type"],
        "data_base64": base64.b64encode(data).decode(),
    }
    legacy = CaptureArchive(c.store, c.registry.resolve_capture, authorization_guard=lambda state: None)
    legacy.ingest(USER, {**c.batch, "records": [parent]}, "legacy-parent")
    child = record(c.batch, "typed-child", 2, artifacts=[c.ref], causal_parents=["legacy-parent"])
    denied(c, lambda: ingest(c, {**c.batch, "records": [child]}), 409)


def test_new_source_head_does_not_rebind_older_frame_source_version(setup):
    c = setup
    source = {**c.snapshot, "source_version": 2, "text": "Another SYNTHETIC TEST DATA source revision."}
    source["content_hash"] = hashlib.sha256(source["text"].encode()).hexdigest()
    with c.store.transaction(USER) as tx:
        tx.put("snapshot", key(c.source["source_id"], 2), source)
        current = tx.get("source", c.source["source_id"])
        current["current_version"] = 2
        tx.put("source", c.source["source_id"], current)
    ingest(c)
    result = AuthorizedImageResolver(c.store, USER, lambda state: None)(c.frame, max_bytes=len(c.data))
    assert result["status"] == "available" and result["frame"]["source_version"] == 1
    assert c.registry.capture.read_record(USER, "process-1")["record"]["source"] == c.source
