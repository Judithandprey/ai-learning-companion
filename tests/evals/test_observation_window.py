"""Synthetic/test-only observation windows; no device, provider or live claim."""

import asyncio
import base64
from concurrent.futures import CancelledError as FutureCancelledError
from copy import deepcopy

import pytest

from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_process_context_reader import current_guard
from services.api.tests.test_ingress_http import ORIGINALS, request, success
from services.api.tests.test_raw_frame_ingress import (
    setup, registered, uploaded, raw_setup, rawcaptured, additional, ingest,
)
from services.learning.archive import digest
from services.learning.process_context import prepare_observation_window
from test_image_evidence import chunk, png
from test_process_context import metadata_size, supplied, coverage
from test_raw_process_context import raw_supplied


def selection(*, raw=True):
    batch, sources, frames, data = raw_supplied() if raw else supplied()
    batch["delivery_mode"] = "historical"
    first, frame = batch["records"][0], frames[0]
    # Third PNG changes only an ancillary comment: different bytes cannot prove
    # different visual meaning, let alone a learner's changed reasoning.
    changed = png(width=3 if raw else 2, height=2,
                  raw=(b"\0" + bytes(range(9)) + b"\0" + bytes(range(9, 18))) if raw else None,
                  extra=chunk(b"tEXt", b"Test\0Another synthetic encoding"))
    blobs = {}
    records, all_frames = [], []
    for i, blob in enumerate((data, data, changed), 1):
        item, current = deepcopy(first), deepcopy(frame)
        item.update(record_id=f"r{i}", sequence=i, frame_id=f"f{i}", causal_parents=[])
        item["evidence"]["reason_quote"] = f"Synthetic original {i} 原话。"
        ref = {"artifact_id": f"a{i}", "sha256": digest(blob),
               "byte_length": len(blob), "media_type": "image/png"}
        item["artifacts"] = [ref]
        current["frame_id"] = item["frame_id"]
        clock = {"domain_id": "one-clock", "elapsed_ms": i * 100, "uncertainty_ms": None}
        if raw:
            current["artifact"] = deepcopy(ref)
            current["timing"]["callback_clock"] = clock
            # Descriptor clock exists without duplicating it on the record.
            item["clock"] = None
        else:
            current.update(artifact_id=ref["artifact_id"], content_hash=ref["sha256"])
            item["clock"] = clock
        records.append(item)
        all_frames.append(current)
        blobs[current["frame_id"]] = blob
    batch["records"] = records
    return {"batch": batch, "sources": sources, "frames": all_frames}, blobs


def prepare(snapshot, blobs, *, ids=None, read=None, resolve=None, **limits):
    ids = [r["record_id"] for r in snapshot["batch"]["records"]] if ids is None else ids
    def reader(selected, **kwargs):
        assert selected == [r["record_id"] for r in snapshot["batch"]["records"]]
        return deepcopy(snapshot)
    def resolver(frame, *, max_bytes):
        return {"status": "available", "frame": frame, "media_type": "image/png",
                "data": blobs[frame["frame_id"]]}
    return prepare_observation_window(ids, reader if read is None else read,
        resolver if resolve is None else resolve, user_id=snapshot["sources"][0]["user_id"], **limits)


@pytest.mark.parametrize("raw", [True, False])
def test_adjacent_originals_no_deduplication_or_semantic_diagnosis(raw):
    snapshot, blobs = selection(raw=raw)
    before = deepcopy(snapshot)
    result = prepare(snapshot, blobs)
    assert [i["record"] for i in result["items"]] == snapshot["batch"]["records"]
    assert [i["frame"] for i in result["items"]] == snapshot["frames"]
    assert [i["image"]["data"] for i in result["items"]] == list(blobs.values())
    window = result["observation_window"]
    assert window["semantic_change"] == window["user_reasoning"] == "not_inferred"
    assert window["capture_chronology"] == window["capture_intervals"] == "unknown"
    assert window["adjacency"] == "requested_order_not_chronology"
    assert [p["retained_image_bytes"] for p in window["comparisons"]] == ["identical", "different"]
    for pair in window["comparisons"]:
        assert pair["source_reference"] == pair["source_snapshot"] == "identical"
        assert pair["clock_readings"] == {
            "status": "comparable_readings", "basis": "raw_callback_clock" if raw else "record_clock",
            "domain_id": "one-clock", "right_minus_left_ms": 100,
            "left_uncertainty_ms": None, "right_uncertainty_ms": None,
        }
    assert result["presentation_permission"] == "not_granted"
    assert result["live_status"] == result["provider_receipt"] == "not_attested"
    result["items"][0]["record"]["evidence"]["reason_quote"] = "Caller edit"
    assert snapshot == before


@pytest.mark.parametrize("clock_mode", ["reverse", "equal", "domain", "missing"])
def test_clock_readings_are_not_capture_order_or_intervals(clock_mode):
    snapshot, blobs = selection()
    timing = snapshot["frames"][1]["timing"]
    if clock_mode == "missing":
        timing["callback_clock"] = None
    elif clock_mode == "domain":
        timing["callback_clock"]["domain_id"] = "another-domain"
    else:
        timing["callback_clock"]["elapsed_ms"] = 50 if clock_mode == "reverse" else 100
    # A plausible UTC estimate/PTS cannot rescue a missing/different clock.
    timing["sample_pts_seconds"] = 9999
    result = prepare(snapshot, blobs)["observation_window"]
    comparison = result["comparisons"][0]["clock_readings"]
    if clock_mode in ("missing", "domain"):
        assert comparison == {"status": "unknown", "reason": "missing_clock" if clock_mode == "missing" else "different_clock_domain"}
    else:
        assert comparison["right_minus_left_ms"] == (-50 if clock_mode == "reverse" else 0)
        assert comparison["right_uncertainty_ms"] is None
    assert result["capture_chronology"] == result["capture_intervals"] == "unknown"


@pytest.mark.parametrize("change", ["source_id", "source_version"])
def test_mixed_source_facts_are_independent_of_identical_image_bytes(change):
    snapshot, blobs = selection(raw=False)
    source = deepcopy(snapshot["sources"][0])
    source[change] = "another-source" if change == "source_id" else source[change] + 1
    snapshot["sources"].append(source)
    second = snapshot["batch"]["records"][1]
    second["source"][change] = source[change]
    snapshot["frames"][1][change] = source[change]
    result = prepare(snapshot, blobs)
    pair = result["observation_window"]["comparisons"][0]
    assert pair["source_reference"] == pair["source_snapshot"] == "different"
    assert pair["retained_image_bytes"] == "identical"
    assert result["items"][1]["source"] == source


def test_selection_order_and_gap_records_are_preserved_without_bridging():
    snapshot, blobs = selection()
    batch = snapshot["batch"]
    gap = coverage(batch, record_id="gap", sequence=5, parents=("r2", "unselected-parent"))
    gap["evidence"]["missing_sequences"] = [{"first": 4, "last": 4}]
    batch["records"] = [batch["records"][2], gap, *batch["records"][:2]]
    result = prepare(snapshot, blobs)
    assert [i["record"] for i in result["items"]] == batch["records"]
    assert result["items"][1]["image"] == {"status": "missing_frame"}
    assert result["items"][1]["parents"][-1]["status"] == "outside_context_unknown"
    pairs = result["observation_window"]["comparisons"]
    assert [(p["left_record_id"], p["right_record_id"]) for p in pairs] == [("r3", "gap"), ("gap", "r1"), ("r1", "r2")]
    assert [p["retained_image_bytes"] for p in pairs] == ["unknown", "unknown", "identical"]


@pytest.mark.parametrize("status", ["missing", "revoked", "unavailable", "byte_limit"])
def test_unavailable_or_limited_original_retains_record_and_unknown_comparison(status):
    snapshot, blobs = selection()
    def resolver(frame, **kwargs):
        if frame["frame_id"] == "f2":
            return {"status": status}
        return {"status": "available", "frame": frame, "media_type": "image/png", "data": blobs[frame["frame_id"]]}
    result = prepare(snapshot, blobs, resolve=resolver)
    assert result["counts"] == {"supplied": 3, "included": 3, "omitted": 0}
    assert result["items"][1]["image"]["status"] == status
    assert all(p["retained_image_bytes"] == "unknown" for p in result["observation_window"]["comparisons"])


def test_metadata_is_all_or_nothing_including_comparisons_but_image_limits_are_gaps():
    snapshot, blobs = selection()
    result = prepare(snapshot, blobs)
    length = metadata_size(result)
    bounded = prepare(snapshot, blobs, max_metadata_bytes=length)
    assert bounded["items"] == result["items"]
    assert bounded["observation_window"] == result["observation_window"]
    length = metadata_size(bounded)  # The serialized budget value itself has a size.
    with pytest.raises(ValueError, match="comparison metadata"):
        prepare(snapshot, blobs, max_metadata_bytes=length - 1)
    with pytest.raises(ValueError, match="omit requested records"):
        prepare(snapshot, blobs, max_metadata_bytes=2000)
    limited = prepare(snapshot, blobs, max_total_bytes=len(blobs["f1"]))
    assert limited["counts"]["omitted"] == 0
    assert [i["image"]["status"] for i in limited["items"]] == ["attached", "byte_limit", "byte_limit"]
    assert all(p["retained_image_bytes"] == "unknown" for p in limited["observation_window"]["comparisons"])


@pytest.mark.parametrize("stage", ["reader", "resolver", "recheck"])
@pytest.mark.parametrize("error", [FutureCancelledError, asyncio.CancelledError])
def test_cancellation_never_returns_a_partial_window(stage, error):
    snapshot, blobs = selection()
    calls = []
    def reader(ids, **kwargs):
        calls.append(ids)
        if stage == "reader" or (stage == "recheck" and len(calls) == 2):
            raise error()
        return deepcopy(snapshot)
    def resolver(frame, **kwargs):
        if stage == "resolver":
            raise error()
        return {"status": "available", "frame": frame, "media_type": "image/png", "data": blobs[frame["frame_id"]]}
    with pytest.raises(error):
        prepare(snapshot, blobs, read=reader, resolve=resolver)


def actual_prepare(c, ids, **limits):
    guard = current_guard(c)
    return prepare_observation_window(ids,
        AuthorizedProcessContextReader(c.store, USER, guard).read_raw,
        AuthorizedImageResolver(c.store, USER, guard).resolve_raw, user_id=USER, **limits)


@pytest.mark.parametrize("action", [None, "stop", "withdraw"])
def test_actual_stored_raw_selection_after_stop_keeps_pixels_ink_and_no_live_grant(rawcaptured, action):
    c = rawcaptured
    second, frame = additional(c, parents=("process-1",))
    ingest(c, {**c.batch, "records": [second]}, [frame], request_key="window-second")
    if action:
        apply(c, command(c, action))
    before = documents(c)
    result = actual_prepare(c, [second["record_id"], "process-1"])
    assert [i["record"] for i in result["items"]] == [second, c.batch["records"][0]]
    assert [i["image"]["data"] for i in result["items"]] == [c.data, c.data]
    assert result["items"][0]["record"]["artifacts"] == [c.ref, c.ink_ref]
    assert result["batch"]["delivery_mode"] == "historical"
    assert result["live_status"] == result["provider_receipt"] == "not_attested"
    assert result["presentation_permission"] == "not_granted"
    assert result["observation_window"]["comparisons"][0]["retained_image_bytes"] == "identical"
    assert documents(c) == before


def test_actual_uploaded_changed_original_is_returned_without_replacing_earlier_pixels(rawcaptured):
    c = rawcaptured
    new_data = png(raw=b"\0" + b"\xff" * 6 + b"\0" + b"\x00" * 6)
    ref = {"artifact_id": "changed-original", "sha256": digest(new_data),
           "byte_length": len(new_data), "media_type": "image/png"}
    success(request(c.app, "PUT", ORIGINALS + ref["artifact_id"], body={
        "contract_version": "0.2.2", "source": c.source, "kind": "screen_image",
        "artifact": ref, "data_base64": base64.b64encode(new_data).decode("ascii"),
    }), "OriginalArtifactReceipt")
    second, frame = additional(c, parents=("process-1",))
    second["artifacts"] = [ref, c.ink_ref]
    frame["artifact"] = deepcopy(ref)
    ingest(c, {**c.batch, "records": [second]}, [frame], request_key="changed-window")
    before = documents(c)
    result = actual_prepare(c, ["process-1", second["record_id"]])
    assert [i["image"]["data"] for i in result["items"]] == [c.data, new_data]
    assert result["observation_window"]["comparisons"][0]["retained_image_bytes"] == "different"
    assert result["observation_window"]["user_reasoning"] == "not_inferred"
    assert documents(c) == before


def test_valid_metadata_change_in_final_read_withholds_the_whole_window():
    snapshot, blobs = selection()
    calls, published = [], []
    def reader(ids, **kwargs):
        calls.append(ids.copy())
        result = deepcopy(snapshot)
        if len(calls) == 2:
            result["batch"]["records"][-1]["evidence"]["reason_quote"] = "Changed original reason"
        return result
    with pytest.raises(ValueError, match="Stored metadata changed"):
        published.append(prepare(snapshot, blobs, read=reader))
    assert calls == [["r1", "r2", "r3"]] * 2 and not published


def test_selected_ids_are_frozen_and_attempt_scopes_are_not_silently_downgraded():
    snapshot, blobs = selection()
    ids, calls = ["r1", "r2", "r3"], []
    def reader(selected, **kwargs):
        calls.append(selected.copy())
        ids[:] = ["different-request"]
        selected.clear()
        return deepcopy(snapshot)
    result = prepare(snapshot, blobs, ids=ids, read=reader)
    assert calls == [["r1", "r2", "r3"]] * 2
    assert [i["record"]["record_id"] for i in result["items"]] == ["r1", "r2", "r3"]
    snapshot["batch"]["records"][1]["scope"] = {
        "kind": "attempt", "problem_id": "p", "attempt_id": "a", "relation_revision": 1}
    with pytest.raises(ValueError, match="Attempt scopes"):
        prepare(snapshot, blobs, resolve=lambda *a, **kw: pytest.fail("No bytes before scope check"))


@pytest.mark.parametrize("fence,status", [("revoke", 403), ("delete", 404), ("metadata", 503)])
def test_actual_permission_or_source_change_during_bytes_withholds_all(rawcaptured, fence, status):
    c, reads, published = rawcaptured, [], []
    read = AuthorizedProcessContextReader(c.store, USER, current_guard(c)).read_raw
    resolve = AuthorizedImageResolver(c.store, USER, current_guard(c)).resolve_raw
    def reader(ids, **kwargs):
        reads.append(ids.copy())
        return read(ids, **kwargs)
    def resolver(frame, **kwargs):
        result = resolve(frame, **kwargs)
        assert result["status"] == "available"
        if fence == "revoke":
            c.archive.revoke_source(USER, c.source["source_id"])
        elif fence == "delete":
            c.archive.delete_source(USER, c.source["source_id"])
        else:
            c.store._documents[USER][("capture_record", "process-1")]["canonical_json"] = "invalid"
        return result
    with pytest.raises(DomainError) as error:
        published.append(prepare_observation_window(["process-1"], reader, resolver, user_id=USER))
    assert error.value.status == status and not published
    assert reads == [["process-1"], ["process-1"]]


@pytest.mark.parametrize("damage", ["missing_blob", "deleted_original", "deleted_source"])
def test_actual_missing_bytes_are_gap_but_deleted_originals_reject_selection(rawcaptured, damage):
    c = rawcaptured
    if damage == "missing_blob":
        c.store._documents[USER][("artifact", c.ref["artifact_id"])].pop("data_base64")
        result = actual_prepare(c, ["process-1"])
        assert result["items"][0]["image"]["status"] == "unavailable"
        assert result["counts"]["included"] == 1
    else:
        if damage == "deleted_original":
            c.store._documents[USER][("original_artifact_tombstone", c.ref["artifact_id"])] = {"deleted": True}
        else:
            c.archive.delete_source(USER, c.source["source_id"])
        with pytest.raises(DomainError) as error:
            actual_prepare(c, ["process-1"])
        assert error.value.status == 404
