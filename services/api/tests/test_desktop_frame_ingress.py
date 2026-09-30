"""Explicit internal desktop metadata with stored test PNG/ink; no native capture."""

import base64
from concurrent.futures import CancelledError
from contextlib import contextmanager
from copy import deepcopy
import json
from pathlib import Path

import pytest

from packages.contracts.desktop_frame import validate_binding
from packages.contracts.process_v2 import validate_ack
from services.api.control import ControlRegistry
from services.api.domain import key
from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import (
    CAPABILITIES, SCOPES, USER, apply, command, documents, resolve_stop_fact, stop_fact,
)
from services.api.tests.test_ingress_http import registered, request, setup, uploaded
from services.api.tests.test_raw_frame_ingress import denied, ingest as raw_ingest, raw_setup


EXAMPLE = Path(__file__).resolve().parents[3] / "packages/contracts/desktop_frame/examples/macos-synthetic.json"


@pytest.fixture
def desktop_setup(raw_setup):
    """Existing typed HTTP uploads, no committed frame, synthetic 0.2.7 profile."""
    c = raw_setup
    c.desktop_frame = json.loads(EXAMPLE.read_text())
    c.desktop_frame.update(
        frame_id=c.raw_frame["frame_id"], source=deepcopy(c.source), artifact=deepcopy(c.ref),
        raw_width=2, raw_height=2,
        **{field: c.batch[field] for field in ("device_id", "session_id", "stream_id")},
    )
    c.batch["records"][0]["clock"] = None
    c.raw_frame["timing"].update(callback_clock=None, observed_at_estimate=None, estimate_basis=None)
    return c


def desktop_ingest(c, batch=None, frames=None, request_key="desktop-frames-1"):
    return c.registry.ingest_desktop_frames(
        c.user, c.batch if batch is None else batch,
        [c.desktop_frame] if frames is None else frames, request_key,
    )


@pytest.fixture
def desktopcaptured(desktop_setup):
    desktop_setup.ack = desktop_ingest(desktop_setup)
    return desktop_setup


def additional(c, *, record_id="desktop-record-2", sequence=2,
               frame_id="desktop-frame-2", parents=(), family="desktop"):
    item = record(c.batch, record_id, sequence, frame_id=frame_id, causal_parents=list(parents))
    frame = deepcopy(c.desktop_frame if family == "desktop" else c.raw_frame)
    frame["frame_id"] = frame_id
    if family == "desktop":
        frame["callback_sequence"] += 1
    else:
        frame["timing"]["callback_clock"] = None
    return item, frame


def test_exact_metadata_original_bytes_and_verified_receipt_survive_retry(desktop_setup):
    c = desktop_setup
    original = deepcopy((c.batch, c.desktop_frame))
    before = documents(c)
    binding = {"contract_version": "0.2.2", "source": c.source, "kind": "screen_image", "artifact": c.ref}
    validate_binding(c.batch, "process-1", c.desktop_frame, c.descriptor, binding)
    ack = desktop_ingest(c)
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
                for ref in (c.ref, c.ink_ref)}
    validate_ack(c.batch, ack, user_id=USER, verified_artifacts=verified)
    assert ack["acknowledged"][0]["artifacts"] == [{**ref, "status": "verified"} for ref in (c.ref, c.ink_ref)]
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert (c.batch, c.desktop_frame) == original
    after = documents(c)
    assert after[("raw_capture_frame", c.desktop_frame["frame_id"])] == c.desktop_frame
    assert ("frame", c.desktop_frame["frame_id"]) not in after
    stored = after[("capture_record", "process-1")]
    assert json.loads(stored["canonical_json"])["record"] == c.batch["records"][0]
    assert stored["received_at"] == ack["acknowledged"][0]["received_at"]
    for ref, data in ((c.ref, c.data), (c.ink_ref, c.ink_data)):
        row = after[("artifact", ref["artifact_id"])]
        assert row == before[("artifact", ref["artifact_id"])]
        assert base64.b64decode(row["data_base64"], validate=True) == data
    replay_id = ("capture_replay", key("internal_desktop_capture_frames", "desktop-frames-1"))
    assert json.loads(after[replay_id]["response_json"]) == ack
    assert ("capture_replay", key("internal_raw_capture_frames", "desktop-frames-1")) not in after
    c.registry = ControlRegistry(c.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                 authorization_guard=lambda state: None, stop_fact_resolver=resolve_stop_fact)
    assert desktop_ingest(c) == ack
    assert documents(c) == after
    duplicate = desktop_ingest(c, request_key="new-key-same-record")
    assert duplicate["acknowledged"] == [{**receipt, "disposition": "duplicate"} for receipt in ack["acknowledged"]]
    assert documents(c)[("raw_capture_frame", c.desktop_frame["frame_id"])] == c.desktop_frame


def test_internal_frame_order_is_irrelevant_but_record_order_and_metadata_are_bound(desktop_setup):
    c = desktop_setup
    item, frame = additional(c, parents=["process-1"])
    batch = {**c.batch, "records": [c.batch["records"][0], item]}
    frames = [c.desktop_frame, frame]
    ack = desktop_ingest(c, batch, frames)
    before = documents(c)
    assert desktop_ingest(c, batch, list(reversed(frames))) == ack
    assert documents(c) == before
    changed = deepcopy(frames)
    changed[0]["profile"]["sample"]["presentation_time_seconds"] = -0.125
    denied(c, lambda: desktop_ingest(c, batch, changed), 409, "idempotency_conflict")
    denied(c, lambda: desktop_ingest(c, {**batch, "records": list(reversed(batch["records"]))}, frames),
           409, "idempotency_conflict")
    denied(c, lambda: desktop_ingest(c, batch, changed, "changed-metadata-new-key"), 409, "record_conflict")


@pytest.mark.parametrize("retained", [False, True])
@pytest.mark.parametrize("entry", ["raw_internal", "legacy_internal", "raw_http", "legacy_http", "desktop_with_raw"])
def test_version_selection_does_not_widen_released_ingress(desktop_setup, entry, retained):
    c = desktop_setup
    if retained:
        desktop_ingest(c)
    if entry == "raw_internal":
        denied(c, lambda: raw_ingest(c, frames=[c.desktop_frame]), 422)
    elif entry == "legacy_internal":
        denied(c, lambda: c.registry.ingest_frames(USER, c.batch, [c.desktop_frame], "wrong-version"), 422)
    elif entry == "desktop_with_raw":
        denied(c, lambda: desktop_ingest(c, frames=[c.raw_frame]), 422)
    else:
        from services.api.tests.test_raw_ingress_http import app, RAW_FRAMES
        from services.api.tests.test_ingress_http import FRAMES
        raw = entry == "raw_http"
        version = "0.2.6" if raw else "0.2.4"
        before = documents(c)
        response = request(app(c) if raw else c.app, "POST", RAW_FRAMES if raw else FRAMES,
                           body={"contract_version": version, "batch": c.batch, "frames": [c.desktop_frame]},
                           request_key="desktop-through-old-http")
        assert response.status_code == 422
        assert response.json() == {"contract_version": version,
                                   "error": "unsupported_version" if raw else "invalid_request", "retryable": False}
        assert documents(c) == before


@pytest.mark.parametrize("failure_kind", ["raw_capture_frame", "capture_record", "capture_replay", "commit"])
def test_staged_frame_and_receipt_failures_roll_back_then_retry(desktop_setup, monkeypatch, failure_kind):
    c = desktop_setup
    before = documents(c)
    original_put, transaction = _MemoryTransaction.put, c.store.transaction
    failures = []

    def fail_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == failure_kind:
            failures.append(kind)
            raise RuntimeError("synthetic desktop write failure")

    @contextmanager
    def fail_commit(actor):
        with transaction(actor) as tx:
            yield tx
            failures.append("commit")
            raise RuntimeError("synthetic desktop write failure")

    with monkeypatch.context() as patch:
        if failure_kind == "commit":
            patch.setattr(c.store, "transaction", fail_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", fail_write)
        with pytest.raises(RuntimeError, match="synthetic desktop write failure"):
            desktop_ingest(c)
    assert failures == [failure_kind]
    assert documents(c) == before
    assert desktop_ingest(c)["acknowledged"][0]["disposition"] == "accepted"


def test_conflicting_later_frame_does_not_commit_an_earlier_valid_frame(desktopcaptured):
    c = desktopcaptured
    item, frame = additional(c)
    changed = deepcopy(c.desktop_frame)
    changed["callback_sequence"] += 1
    batch = {**c.batch, "records": [item, c.batch["records"][0]]}
    denied(c, lambda: desktop_ingest(c, batch, [frame, changed], "partial-conflict"), 409, "record_conflict")
    assert ("raw_capture_frame", frame["frame_id"]) not in documents(c)


@pytest.mark.parametrize("first_family", ["desktop", "raw", "legacy"])
def test_frame_id_is_immutable_across_all_families(desktop_setup, first_family):
    c = desktop_setup
    if first_family == "desktop":
        desktop_ingest(c)
        denied(c, lambda: raw_ingest(c), 409, "record_conflict")
    elif first_family == "raw":
        raw_ingest(c)
        denied(c, lambda: desktop_ingest(c), 409, "record_conflict")
    else:
        legacy_batch = deepcopy(c.batch)
        legacy_batch["records"][0]["media_position"] = c.frame["media_position"]
        c.registry.ingest_frames(USER, legacy_batch, [c.frame], "legacy-first")
        denied(c, lambda: desktop_ingest(c), 409, "frame_identity_conflict")


@pytest.mark.parametrize("replay", [False, True])
@pytest.mark.parametrize("fence,status", [
    ("stop", 409), ("withdraw", 403), ("source_revoke", 404), ("delete", 404),
    ("generation", 403), ("membership", 403), ("guard", 401),
])
def test_current_lifecycle_fences_precede_new_or_cached_desktop_ingress(desktop_setup, replay, fence, status):
    c = desktop_setup
    if replay:
        desktop_ingest(c)
    if fence in {"stop", "withdraw"}:
        apply(c, command(c, fence))
    elif fence == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif fence == "delete":
        c.archive.delete_source(USER, c.source["source_id"])
    elif fence == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    elif fence == "membership":
        c.registry.set_membership(USER, c.batch["device_id"], c.batch["session_id"], active=False, expected_revision=1)
    else:
        def expired(state):
            raise DomainError(401, "unauthenticated")
        c.registry.capture.archive.authorization_guard = expired
    denied(c, lambda: desktop_ingest(c), status)


def test_sealed_historical_ingress_keeps_stop_and_does_not_claim_live_capture(desktop_setup):
    c = desktop_setup
    apply(c, command(c))
    batch = {**c.batch, "delivery_mode": "historical"}
    denied(c, lambda: desktop_ingest(c, batch), 409, "capture_stopped")
    stop_fact(c, 1)
    stopped = apply(c, command(c, "seal_stop", revision=2, boundary=1), "seal")
    ack = desktop_ingest(c, batch)
    assert desktop_ingest(c, batch) == ack
    assert c.registry.read(USER, c.batch["stream_id"]) == stopped
    assert documents(c)[("session", c.batch["session_id"])]["live_capture"] is False
    later, frame = additional(c)
    denied(c, lambda: desktop_ingest(c, {**batch, "records": [later]}, [frame], "after-stop-boundary"),
           409, "capture_stopped")
    denied(c, lambda: desktop_ingest(c, request_key="live-after-stop"), 409, "capture_stopped")


@pytest.mark.parametrize("missing", ["raw_capture_frame", "artifact", "capture_record", "capture_slot",
                                     "capture_binding", "capture_artifact_ref"])
def test_lost_committed_original_or_witness_is_not_restored(desktopcaptured, missing):
    c = desktopcaptured
    identifier = {"raw_capture_frame": c.desktop_frame["frame_id"], "artifact": c.ref["artifact_id"],
                  "capture_record": "process-1", "capture_slot": key(c.batch["device_id"], c.batch["stream_id"], 1),
                  "capture_binding": c.batch["stream_id"], "capture_artifact_ref": c.ink_ref["artifact_id"]}[missing]
    del c.store._documents[USER][(missing, identifier)]
    denied(c, lambda: desktop_ingest(c), 503, "original_unavailable" if missing == "artifact" else "unavailable")
    assert (missing, identifier) not in documents(c)


@pytest.mark.parametrize("corrupt", ["unknown_version", "missing_profile", "changed_metadata", "bytes", "ink_binding", "ack"])
def test_exact_replay_diagnoses_corrupt_retained_facts_as_unavailable(desktopcaptured, corrupt):
    c = desktopcaptured
    rows = c.store._documents[USER]
    if corrupt in {"unknown_version", "missing_profile", "changed_metadata"}:
        frame = rows[("raw_capture_frame", c.desktop_frame["frame_id"])]
        if corrupt == "unknown_version":
            frame["contract_version"] = "0.2.99"
        elif corrupt == "missing_profile":
            del frame["profile"]
        else:
            frame["callback_sequence"] += 1
    elif corrupt == "bytes":
        rows[("artifact", c.ref["artifact_id"])]["data_base64"] = "YQ=="
    elif corrupt == "ink_binding":
        rows[("artifact", c.ink_ref["artifact_id"])]["original_binding"]["source"]["source_version"] = 2
    else:
        rows[("capture_replay", key("internal_desktop_capture_frames", "desktop-frames-1"))]["response_json"] = "{"
    denied(c, lambda: desktop_ingest(c), 503, "original_unavailable" if corrupt == "bytes" else "unavailable")


@pytest.mark.parametrize("parent_family", ["desktop", "raw"])
def test_cross_version_ancestor_and_deletion_share_original_store(desktop_setup, parent_family):
    c = desktop_setup
    parent_ingest = desktop_ingest if parent_family == "desktop" else raw_ingest
    parent_frame = c.desktop_frame if parent_family == "desktop" else c.raw_frame
    parent_ingest(c)
    child_family = "raw" if parent_family == "desktop" else "desktop"
    child, frame = additional(c, family=child_family, parents=["process-1"])
    batch = {**c.batch, "records": [child]}
    child_ingest = raw_ingest if child_family == "raw" else desktop_ingest
    ack = child_ingest(c, batch, [frame], "cross-version-child")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert child_ingest(c, batch, [frame], "cross-version-child") == ack
    before = documents(c)
    for descriptor in (parent_frame, frame):
        assert before[("raw_capture_frame", descriptor["frame_id"])] == descriptor
    legacy_identity = ("frame", c.core["Frame"]["frame_id"])
    c.archive.delete_source(USER, c.source["source_id"])
    after = documents(c)
    assert after[legacy_identity] == before[legacy_identity]
    for descriptor in (parent_frame, frame):
        assert ("raw_capture_frame", descriptor["frame_id"]) not in after
        assert after[("frame_tombstone", descriptor["frame_id"])] == {"frame_id": descriptor["frame_id"]}
    for ref in (c.ref, c.ink_ref):
        assert ("artifact", ref["artifact_id"]) not in after
        assert after[("original_artifact_tombstone", ref["artifact_id"])] == {"artifact_id": ref["artifact_id"]}
    for record_id in ("process-1", child["record_id"]):
        assert ("capture_record", record_id) not in after
        assert after[("capture_tombstone", record_id)] == {"record_id": record_id}
    denied(c, lambda: parent_ingest(c), 404)
    denied(c, lambda: child_ingest(c, batch, [frame], "cross-version-child"), 404)


@pytest.mark.parametrize("action", ["ancestor", "delete"])
def test_unknown_retained_family_fails_closed_without_partial_work(desktopcaptured, action):
    c = desktopcaptured
    c.store._documents[USER][("raw_capture_frame", c.desktop_frame["frame_id"])]["contract_version"] = "0.2.99"
    if action == "delete":
        denied(c, lambda: c.archive.delete_source(USER, c.source["source_id"]), 503, "unavailable")
    else:
        item, frame = additional(c, parents=["process-1"])
        denied(c, lambda: desktop_ingest(c, {**c.batch, "records": [item]}, [frame], "unknown-parent"),
               503, "unavailable")


@pytest.mark.parametrize("replay", [False, True])
def test_final_guard_withholds_new_or_cached_ack_without_writes(desktop_setup, monkeypatch, replay):
    c = desktop_setup
    if replay:
        desktop_ingest(c)
    original_get, original_put = _MemoryTransaction.get, _MemoryTransaction.put
    seen = []

    def observed_get(tx, kind, identifier):
        value = original_get(tx, kind, identifier)
        if replay and kind == "capture_replay" and value is not None:
            seen.append("cached")
        return value

    def observed_put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            seen.append("staged")

    def guard(state):
        if seen:
            raise DomainError(401, "unauthenticated")

    c.registry.capture.archive.authorization_guard = guard
    monkeypatch.setattr(_MemoryTransaction, "get", observed_get)
    monkeypatch.setattr(_MemoryTransaction, "put", observed_put)
    denied(c, lambda: desktop_ingest(c), 401, "unauthenticated")
    assert seen == ["cached" if replay else "staged"]


def test_cancellation_after_staged_receipt_rolls_back_all_writes(desktop_setup, monkeypatch):
    c = desktop_setup
    before = documents(c)
    original_put = _MemoryTransaction.put
    seen = []

    def cancelled(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            seen.append(kind)
            raise CancelledError()

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", cancelled)
        with pytest.raises(CancelledError):
            desktop_ingest(c)
    assert seen == ["capture_replay"]
    assert documents(c) == before
    assert desktop_ingest(c)["acknowledged"][0]["disposition"] == "accepted"


@pytest.mark.parametrize("witness", ["frame", "slot", "receipt"])
def test_isolated_desktop_witness_cannot_recreate_lost_stream_binding(desktopcaptured, witness):
    c = desktopcaptured
    identities = {
        "frame": ("raw_capture_frame", c.desktop_frame["frame_id"]),
        "slot": ("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1)),
        "receipt": ("capture_replay", key("internal_desktop_capture_frames", "desktop-frames-1")),
    }
    rows = c.store._documents[USER]
    for identity in [("capture_binding", c.batch["stream_id"]), ("capture_record", "process-1"),
                     *(identity for name, identity in identities.items() if name != witness)]:
        del rows[identity]
    item, frame = additional(c)
    denied(c, lambda: desktop_ingest(c, {**c.batch, "records": [item]}, [frame], "no-binding-repair"),
           503, "unavailable")
    assert ("capture_binding", c.batch["stream_id"]) not in documents(c)


@pytest.mark.parametrize("witness", ["frame", "receipt"])
def test_isolated_desktop_original_witness_prevents_lost_bytes_repair(desktopcaptured, witness):
    c = desktopcaptured
    frame_id = ("raw_capture_frame", c.desktop_frame["frame_id"])
    receipt_id = ("capture_replay", key("internal_desktop_capture_frames", "desktop-frames-1"))
    rows = c.store._documents[USER]
    for identity in [("artifact", c.ref["artifact_id"]), ("capture_record", "process-1"),
                     ("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1)),
                     ("capture_artifact_ref", c.ref["artifact_id"]),
                     receipt_id if witness == "frame" else frame_id]:
        del rows[identity]
    item, frame = additional(c)
    denied(c, lambda: desktop_ingest(c, {**c.batch, "records": [item]}, [frame], "no-original-repair"),
           503, "original_unavailable")
    assert ("artifact", c.ref["artifact_id"]) not in documents(c)


def test_frame_count_and_complete_utf8_metadata_budget_remain_bounded(desktop_setup):
    c = desktop_setup
    pairs = [additional(c, record_id=f"bounded-record-{i}", sequence=i, frame_id=f"bounded-frame-{i}")
             for i in range(1, 101)]
    batch = {**c.batch, "records": [item for item, _ in pairs]}
    frames = [frame for _, frame in pairs]
    denied(c, lambda: desktop_ingest(c, batch, frames + [{**frames[-1], "frame_id": "excess-frame"}]),
           422, "invalid_request")
    oversized = deepcopy(batch)
    for item in oversized["records"]:
        item["evidence"]["after"] = {"kind": "text", "text": "界" * 15000}
    assert len(json.dumps({"batch": oversized, "frames": frames}, ensure_ascii=False).encode()) > 4 * 1024 * 1024
    denied(c, lambda: desktop_ingest(c, oversized, frames), 413, "payload_too_large")
    assert len(desktop_ingest(c, batch, frames)["acknowledged"]) == 100


@pytest.mark.parametrize("parent_family", ["desktop", "raw"])
def test_erasing_parent_source_preserves_other_source_child_originals(desktop_setup, parent_family):
    c = desktop_setup
    (desktop_ingest if parent_family == "desktop" else raw_ingest)(c)
    descriptor = c.registry.register_display_source(USER, "child-display-source", c.batch["stream_id"])
    child_source = {name: descriptor[name] for name in ("user_id", "source_id", "source_version")}
    originals = OriginalArtifacts(c.store, lambda state: None, display_authority_resolver=c.registry.resolve_capture)
    refs = []
    for kind, reference, data in (("screen_image", c.ref, c.data), ("editable_ink", c.ink_ref, c.ink_data)):
        ref = {**reference, "artifact_id": "child-" + reference["artifact_id"]}
        originals.put(USER, child_source, kind, ref, data)
        refs.append(ref)
    child_family = "raw" if parent_family == "desktop" else "desktop"
    child, frame = additional(c, family=child_family, parents=["process-1"])
    child.update(source=deepcopy(child_source), artifacts=deepcopy(refs))
    frame.update(source=deepcopy(child_source), artifact=deepcopy(refs[0]))
    batch = {**c.batch, "records": [child]}
    submit = raw_ingest if child_family == "raw" else desktop_ingest
    assert submit(c, batch, [frame], "other-source-child")["acknowledged"][0]["disposition"] == "accepted"
    before = documents(c)
    c.archive.delete_source(USER, c.source["source_id"])
    after = documents(c)
    for identity in [("source", child_source["source_id"]), ("raw_capture_frame", frame["frame_id"]),
                     ("capture_record", child["record_id"]),
                     *(("artifact", ref["artifact_id"]) for ref in refs)]:
        assert after[identity] == before[identity]
    assert ("raw_capture_frame", c.desktop_frame["frame_id"]) not in after
    assert after[("capture_tombstone", "process-1")] == {"record_id": "process-1"}
    for request_key in ("other-source-child", "new-key-erased-ancestor"):
        denied(c, lambda: submit(c, batch, [frame], request_key), 404, "not_found")
