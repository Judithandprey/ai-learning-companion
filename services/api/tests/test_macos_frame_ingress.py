"""Mac retained originals through the common actor transaction, no native run."""

import asyncio
import base64
from concurrent.futures import CancelledError
from contextlib import contextmanager
from copy import deepcopy
import json

import pytest

from packages.contracts.macos_frame import validate_binding
from packages.contracts.process_v2 import validate_ack
from services.api.control import ControlRegistry
from services.api.domain import key
from services.api.storage import _MemoryTransaction
from services.api.tests.test_control import CAPABILITIES, SCOPES, documents, resolve_stop_fact
from services.api.tests.macos_fixtures import (
    additional, denied, gap, ingest, ingest_request, macos_setup, macoscaptured,
    raw_setup, references, registered, retained_frame, setup, upload_frame, uploaded,
)


def test_dual_png_and_separate_editable_originals_commit_and_replay_exactly(macos_setup):
    c = macos_setup
    before = documents(c)
    inputs = deepcopy((c.batch, c.macos_frame))
    bindings = [{"contract_version": "0.2.2", "source": c.source, "kind": "screen_image", "artifact": ref}
                for ref in (c.ref, c.composed_ref)]
    validate_binding(c.batch, "process-1", c.macos_frame, c.descriptor, bindings)
    ack = ingest(c)
    refs = [c.ref, c.composed_ref, c.ink_ref]
    verified = {tuple(ref[name] for name in ("artifact_id", "sha256", "byte_length", "media_type")) for ref in refs}
    validate_ack(c.batch, ack, user_id=c.user, verified_artifacts=verified)
    assert ack["acknowledged"][0]["artifacts"] == [{**ref, "status": "verified"} for ref in refs]
    assert (c.batch, c.macos_frame) == inputs
    after = documents(c)
    assert after[("raw_capture_frame", c.macos_frame["frame_id"])] == c.macos_frame
    assert ("frame", c.macos_frame["frame_id"]) not in after
    assert c.data != c.composed_data
    for ref, data in ((c.ref, c.data), (c.composed_ref, c.composed_data), (c.ink_ref, c.ink_data)):
        original = after[("artifact", ref["artifact_id"])]
        assert original == before[("artifact", ref["artifact_id"])]
        assert base64.b64decode(original["data_base64"], validate=True) == data
    receipt_key = key("internal_macos_capture_frames", "macos-frames-1")
    assert json.loads(after[("capture_replay", receipt_key)]["response_json"]) == ack
    c.registry = ControlRegistry(c.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                 authorization_guard=lambda state: None, stop_fact_resolver=resolve_stop_fact)
    assert ingest(c) == ack
    assert documents(c) == after
    assert ingest(c, key="same-originals-new-key")["acknowledged"] == [
        {**record, "disposition": "duplicate"} for record in ack["acknowledged"]]


def test_all_seven_audited_native_frames_keep_every_actual_image_and_outcome(macos_setup):
    c = macos_setup
    frames, records = [], []
    for index in range(7):
        frame = retained_frame(c, index, frame_id=f"audited-frame-{index + 1}")
        upload_frame(c, frame)
        item, _ = additional(c, record_id=f"audited-record-{index + 1}", sequence=index + 1,
                             frame_id=frame["frame_id"])
        item["artifacts"] = references(frame) + [deepcopy(c.ink_ref)]
        frames.append(frame)
        records.append(item)
    batch = {**c.batch, "records": records}
    original = deepcopy((batch, frames))
    ack = ingest(c, batch, frames, "all-seven-audited")
    assert len(ack["acknowledged"]) == 7
    assert [frame["composition"]["kind"] for frame in frames] == ["composed"] * 6 + ["not_composed"]
    for frame in frames:
        assert documents(c)[("raw_capture_frame", frame["frame_id"])] == frame
    retained = documents(c)
    assert ingest(c, batch, frames, "all-seven-audited") == ack
    assert documents(c) == retained and (batch, frames) == original


@pytest.mark.parametrize("outcome", ["raw_alias", "not_composed", "unknown"])
def test_alias_refusal_and_absent_composition_do_not_invent_images(macos_setup, outcome):
    c = macos_setup
    frame = retained_frame(c, 0 if outcome == "raw_alias" else 6)
    if outcome == "unknown":
        frame["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
    upload_frame(c, frame)
    c.batch["records"][0]["artifacts"] = references(frame) + [c.ink_ref]
    ack = ingest(c, frames=[frame])
    assert len(ack["acknowledged"][0]["artifacts"]) == 2
    assert documents(c)[("raw_capture_frame", frame["frame_id"])] == frame
    assert ingest(c, frames=[frame]) == ack


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("damage", ["missing", "substituted", "binding"])
@pytest.mark.parametrize("cached", [False, True])
def test_both_images_need_exact_typed_bytes_for_new_and_cached_ingress(macos_setup, role, damage, cached):
    c = macos_setup
    if cached:
        ingest(c)
    ref = c.ref if role == "raw" else c.composed_ref
    identity = ("artifact", ref["artifact_id"])
    rows = c.store._documents[c.user]
    if damage == "missing":
        del rows[identity]
    elif damage == "binding":
        rows[identity]["original_binding"]["kind"] = "editable_ink"
    else:
        other = c.composed_data if role == "raw" else c.data
        rows[identity]["data_base64"] = base64.b64encode(other).decode("ascii")
    denied(c, lambda: ingest(c), 404 if damage == "missing" and not cached else 503)


@pytest.mark.parametrize("field,value", [("user_id", "other"), ("source_id", "other"), ("source_version", 2)])
def test_frame_source_must_match_exact_archive_source(macos_setup, field, value):
    c = macos_setup
    frame = deepcopy(c.macos_frame)
    frame["source"][field] = value
    denied(c, lambda: ingest(c, frames=[frame]), 422, "invalid_request")


@pytest.mark.parametrize("field", ["device_id", "session_id", "stream_id"])
def test_capture_incarnation_is_not_native_session_label(macos_setup, field):
    c = macos_setup
    frame = deepcopy(c.macos_frame)
    frame[field] = "foreign-incarnation"
    denied(c, lambda: ingest(c, frames=[frame]), 422, "invalid_request")


@pytest.mark.parametrize("coverage", ["unknown", "partial", "unobserved"])
def test_first_gap_needs_no_original_and_keeps_explicit_coverage(registered, coverage):
    c = registered
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    batch = {**c.batch, "records": [gap(c, coverage=coverage)]}
    ack = ingest(c, batch, [], "first-gap")
    assert ack["acknowledged"][0]["artifacts"] == []
    assert ingest(c, batch, [], "first-gap") == ack
    assert not any(kind in {"raw_capture_frame", "capture_artifact_ref"} for kind, _ in documents(c))


def test_gap_parent_is_preserved_when_later_audited_pixels_arrive(macos_setup):
    c = macos_setup
    item = gap(c)
    ingest(c, {**c.batch, "records": [item]}, [], "gap-before-pixels")
    child, frame = additional(c, parents=[item["record_id"]])
    ack = ingest(c, {**c.batch, "records": [child]}, [frame], "after-gap")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert json.loads(documents(c)[("capture_record", child["record_id"])]["canonical_json"])["record"] == child


def test_internal_frame_map_order_and_http_full_envelope_order_keep_distinct_receipts(macos_setup):
    c = macos_setup
    item, frame = additional(c, parents=["process-1"])
    batch = {**c.batch, "records": [c.batch["records"][0], item]}
    frames = [c.macos_frame, frame]
    ack = ingest(c, batch, frames)
    assert ingest(c, batch, list(reversed(frames))) == ack
    envelope = {"contract_version": "0.2.12", "batch": batch, "frames": frames}
    http_ack = ingest_request(c, envelope, "ordered-http")
    assert all(row["disposition"] == "duplicate" for row in http_ack["acknowledged"])
    retained = documents(c)
    assert ingest_request(c, envelope, "ordered-http") == http_ack
    assert documents(c) == retained
    changed = {**envelope, "frames": list(reversed(frames))}
    denied(c, lambda: ingest_request(c, changed, "ordered-http"), 409, "idempotency_conflict")
    assert ("capture_replay", key("POST", "/v2/process/macos-frames:batch", "ordered-http")) in retained


def test_late_frame_failure_does_not_commit_earlier_valid_record(macos_setup):
    c = macos_setup
    item, frame = additional(c)
    frame["composition"]["image"]["artifact"]["artifact_id"] = "missing-original"
    item["artifacts"] = references(frame) + [c.ink_ref]
    batch = {**c.batch, "records": [c.batch["records"][0], item]}
    denied(c, lambda: ingest(c, batch, [c.macos_frame, frame]), 404)


@pytest.mark.parametrize("failure", [RuntimeError, CancelledError, asyncio.CancelledError])
def test_staged_write_failure_or_cancellation_rolls_back_whole_http_envelope(macos_setup, monkeypatch, failure):
    c = macos_setup
    before = documents(c)
    original_put = _MemoryTransaction.put
    reached = []

    def fail_after_receipt(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            reached.append(identifier)
            raise failure("synthetic receipt-stage failure")

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", fail_after_receipt)
        with pytest.raises(failure):
            ingest_request(c)
    assert reached == [key("POST", "/v2/process/macos-frames:batch", "macos-http-1")]
    assert documents(c) == before
    assert ingest_request(c)["acknowledged"][0]["disposition"] == "accepted"


def test_commit_failure_withholds_ack_and_no_record_or_receipt_remains(macos_setup, monkeypatch):
    c = macos_setup
    before = documents(c)
    transaction = c.store.transaction

    @contextmanager
    def fail_commit(actor):
        with transaction(actor) as tx:
            yield tx
            raise RuntimeError("synthetic commit refusal")

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", fail_commit)
        with pytest.raises(RuntimeError, match="synthetic commit refusal"):
            ingest(c)
    assert documents(c) == before


@pytest.mark.parametrize("missing", ["raw_capture_frame", "capture_record", "capture_slot", "capture_binding", "capture_artifact_ref"])
def test_committed_witness_loss_cannot_be_reconstructed_by_exact_retry(macoscaptured, missing):
    c = macoscaptured
    identities = {"raw_capture_frame": (missing, c.macos_frame["frame_id"]),
                  "capture_record": (missing, "process-1"),
                  "capture_slot": (missing, key(c.batch["device_id"], c.batch["stream_id"], 1)),
                  "capture_binding": (missing, c.batch["stream_id"]),
                  "capture_artifact_ref": (missing, c.composed_ref["artifact_id"])}
    del c.store._documents[c.user][identities[missing]]
    denied(c, lambda: ingest(c), 503, "unavailable")


@pytest.mark.parametrize("damage", ["missing", "corrupt"])
def test_editable_ink_is_an_independent_required_original_on_replay(macoscaptured, damage):
    c = macoscaptured
    identity = ("artifact", c.ink_ref["artifact_id"])
    if damage == "missing":
        del c.store._documents[c.user][identity]
    else:
        c.store._documents[c.user][identity]["data_base64"] = "YQ=="
    denied(c, lambda: ingest(c), 503)


@pytest.mark.parametrize("missing", ["source", "snapshot"])
def test_lost_source_state_is_not_recreated_from_mac_history(macoscaptured, missing):
    c = macoscaptured
    identifier = c.source["source_id"] if missing == "source" else key(c.source["source_id"], c.source["source_version"])
    del c.store._documents[c.user][(missing, identifier)]
    denied(c, lambda: ingest(c), 503)


def test_reserved_sequence_cannot_be_reassigned_to_another_mac_record(macoscaptured):
    c = macoscaptured
    item, frame = additional(c, sequence=1)
    denied(c, lambda: ingest(c, {**c.batch, "records": [item]}, [frame], "occupied-slot"),
           409, "record_conflict")


@pytest.mark.parametrize("first", ["raw", "legacy"])
def test_old_and_mac_frame_namespaces_cannot_share_one_frame_identity(macos_setup, first):
    c = macos_setup
    if first == "raw":
        c.registry.ingest_raw_frames(c.user, c.batch, [c.raw_frame], "old-first")
    else:
        batch = deepcopy(c.batch)
        batch["records"][0]["media_position"] = c.frame["media_position"]
        c.registry.ingest_frames(c.user, batch, [c.frame], "old-first")
    denied(c, lambda: ingest(c), 409, "record_conflict" if first == "raw" else "frame_identity_conflict")


@pytest.mark.parametrize("damage", ["empty", "invalid_ack", "full_deleted", "wrong_key"])
def test_present_corrupt_receipt_is_unavailable_and_never_rebuilt(macoscaptured, damage):
    c = macoscaptured
    identity = ("capture_replay", key("internal_macos_capture_frames", "macos-frames-1"))
    row = c.store._documents[c.user][identity]
    if damage == "empty":
        c.store._documents[c.user][identity] = {}
    elif damage == "invalid_ack":
        row["response_json"] = "{}"
    elif damage == "full_deleted":
        row["deleted"] = True
    else:
        row["key"] = "not-the-request"
    denied(c, lambda: ingest(c), 503, "unavailable")


@pytest.mark.parametrize("damage", ["unknown_version", "absent_composition", "lost_slot"])
def test_retained_ancestor_is_rechecked_before_accepting_child(macoscaptured, damage):
    c = macoscaptured
    rows = c.store._documents[c.user]
    retained = rows[("raw_capture_frame", c.macos_frame["frame_id"])]
    if damage == "unknown_version":
        retained["contract_version"] = "0.2.99"
    elif damage == "absent_composition":
        del retained["composition"]
    else:
        del rows[("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1))]
    child, frame = additional(c, parents=["process-1"])
    denied(c, lambda: ingest(c, {**c.batch, "records": [child]}, [frame], "child"), 503, "unavailable")


def test_known_raw_parent_remains_usable_without_upgrading_its_descriptor(macos_setup):
    c = macos_setup
    c.registry.ingest_raw_frames(c.user, c.batch, [c.raw_frame], "old-parent")
    child, frame = additional(c, parents=["process-1"])
    assert ingest(c, {**c.batch, "records": [child]}, [frame], "mac-child")["acknowledged"][0]["disposition"] == "accepted"
    assert documents(c)[("raw_capture_frame", c.raw_frame["frame_id"])] == c.raw_frame


@pytest.mark.parametrize("entry", ["ingest_frames", "ingest_raw_frames", "ingest_desktop_frames", "ingest_windows_frames"])
def test_old_internal_entrypoints_do_not_consume_mac_descriptors(macos_setup, entry):
    c = macos_setup
    denied(c, lambda: getattr(c.registry, entry)(c.user, c.batch, [c.macos_frame], "misrouted"), 422)
