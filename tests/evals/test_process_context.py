"""Project-authored synthetic supplied evidence, never actual capture or thought."""

from copy import deepcopy
from concurrent.futures import CancelledError as FutureCancelledError, Future
import asyncio
import json
from pathlib import Path

from jsonschema import ValidationError
import pytest

from services.learning.archive import canonical, digest
from services.learning.process_context import compose_process_context
from test_image_evidence import png

ROOT = Path(__file__).resolve().parents[2]
USER = "fixture-user"


def supplied(*, display=False, data=None):
    core = json.loads((ROOT / "packages/contracts/examples/core.json").read_text())
    batch = json.loads((ROOT / "packages/contracts/process_v2/examples/capture.json").read_text())["ProcessBatch"]
    data = png() if data is None else data
    source = core["SourceSnapshot"]
    frame = {**core["Frame"], "width": 2, "height": 2, "content_hash": digest(data),
             "representation": "screen_capture"}
    batch.update(device_id=frame["device_id"], session_id=frame["session_id"])
    ref = {"artifact_id": frame["artifact_id"], "sha256": digest(data),
           "byte_length": len(data), "media_type": "image/png"}
    record = batch["records"][0]
    record.update(source={k: source[k] for k in ("user_id", "source_id", "source_version")},
                  artifacts=[ref], frame_id=frame["frame_id"], media_position=frame["media_position"])
    if display:
        source = {**record["source"], "contract_version": "0.2.3", "type": "shared_display",
                  **{k: batch[k] for k in ("device_id", "session_id", "stream_id")},
                  "project_id": None, "created_at": "2026-09-28T00:00:00Z", "source_timezone": "UTC"}
    return batch, [source], [frame], data


def available(data):
    def resolve(frame, *, max_bytes):
        return {"status": "available", "frame": frame, "data": data, "media_type": "image/png"}
    return resolve


def forbidden(*args, **kwargs):
    pytest.fail("This item must not resolve any image bytes")


def compose(values, resolver=None, **kwargs):
    batch, sources, frames, data = values
    return compose_process_context(batch, sources, frames, available(data) if resolver is None else resolver,
                                   user_id=USER, **kwargs)


def metadata_size(packet):
    value = deepcopy(packet)
    for item in value["items"]:
        item["image"].pop("data", None)
    return len(canonical(value))


def coverage(batch, *, record_id="coverage", sequence=3, parents=("process-1", "outside-batch")):
    record = deepcopy(batch["records"][0])
    record.update(record_id=record_id, sequence=sequence, causal_parents=list(parents),
                  observed_at=None, clock=None, frame_id=None, artifacts=[], media_position=None,
                  evidence={"kind": "coverage", "coverage": "unknown", "from_clock_ms": None,
                            "through_clock_ms": None, "missing_sequences": [{"first": 2, "last": 2}],
                            "limitations": ["missing_events", "disconnected", "unknown"]})
    return record


@pytest.mark.parametrize("display", [False, True])
def test_whole_operation_coverage_exact_pixels_and_unknown_parent_preserved(display):
    values = supplied(display=display)
    batch, sources, frames, data = values
    operation = batch["records"][0]
    operation["evidence"]["reason_quote"] = "I compared the coordinate basis. 这是原话。"
    ink = {"artifact_id": "unresolved-ink", "sha256": "b" * 64, "byte_length": 90,
           "media_type": "application/json"}
    operation["artifacts"].append(ink)
    batch["records"] = [coverage(batch), operation]  # Input order is not sequence order.
    originals = deepcopy(values)
    result = compose(values)
    assert [item["record"] for item in result["items"]] == batch["records"]
    assert result["batch"] == {k: v for k, v in batch.items() if k != "records"}
    gap, image = result["items"]
    assert gap["parents"] == [{"record_id": "process-1", "status": "included"},
                              {"record_id": "outside-batch", "status": "outside_context_unknown"}]
    assert gap["image"] == {"status": "missing_frame"}
    assert image["image"] == {"status": "attached", "data": data, "media_type": "image/png", "byte_length": len(data)}
    assert image["source"] == sources[0] and image["frame"] == frames[0]
    assert result["non_frame_artifacts"] == "references_only"
    assert result["counts"] == {"supplied": 2, "included": 2, "omitted": 0}
    assert result["attached_bytes"] == len(data)
    assert values == originals
    for field in ("authorization_status", "commit_status", "live_status", "provider_receipt"):
        assert result[field] == "not_attested"
    assert result["presentation_permission"] == "not_granted"
    assert result["capture_completeness"] == "unknown"
    assert metadata_size(result) <= result["budget"]["max_metadata_bytes"]
    if display:
        assert not {"text", "content_hash", "original_url", "access_status"} & image["source"].keys()
    result["items"][1]["record"]["evidence"]["reason_quote"] = "changed output"
    result["items"][1]["source"]["project_id"] = "changed output"
    assert values == originals


def test_unknown_operation_null_frame_and_wall_clock_disagreement_do_not_infer_reason():
    values = supplied()
    record = values[0]["records"][0]
    record.update(frame_id=None, observed_at=None, clock=None, media_position=None,
                  evidence={"kind": "operation", "operation": "visible_change", "observed_actor": "unknown",
                            "actor_basis": "unknown", "before": {"kind": "unknown", "reason": "not_observed"},
                            "after": {"kind": "unknown", "reason": "ambiguous"}, "reason_quote": None})
    values[2].clear()
    assert compose(values, forbidden)["items"][0]["record"] == record
    values = supplied()
    record = values[0]["records"][0]
    later = deepcopy(record)
    later.update(record_id="later-sequence", sequence=2, causal_parents=[record["record_id"]],
                 observed_at="2020-01-01T00:00:00Z", clock={"domain_id": "other", "elapsed_ms": 0, "uncertainty_ms": None})
    values[0]["records"] = [later, record]
    result = compose(values)
    assert [r["record"] for r in result["items"]] == [later, record]


@pytest.mark.parametrize("target,field,value", [
    ("frame", "user_id", "foreign"), ("frame", "source_id", "foreign"),
    ("frame", "source_version", 2), ("frame", "device_id", "foreign"),
    ("frame", "session_id", "foreign"), ("frame", "media_position", 88),
    ("frame", "content_hash", "0" * 64), ("frame", "artifact_id", "foreign"),
    ("frame", "width", True), ("source", "user_id", "foreign"),
    ("source", "source_version", 2), ("source", "text", "changed original"),
    ("batch", "contract_version", "0.1.0"), ("batch", "batch_id", None),
    ("batch", "delivery_mode", "inferred"),
    ("record", "scope", {"kind": "attempt", "problem_id": "p", "attempt_id": "a", "relation_revision": 1}),
])
def test_mismatched_or_unsupported_metadata_rejected_before_resolution(target, field, value):
    values = supplied()
    objects = {"frame": values[2][0], "source": values[1][0], "batch": values[0], "record": values[0]["records"][0]}
    objects[target][field] = value
    with pytest.raises((ValueError, ValidationError)):
        compose(values, forbidden)


@pytest.mark.parametrize("field", ["device_id", "session_id", "stream_id"])
@pytest.mark.parametrize("has_frame", [False, True])
def test_display_incarnation_checked_even_with_null_frame(field, has_frame):
    values = supplied(display=True)
    values[1][0][field] = "wrong-incarnation"
    if not has_frame:
        values[0]["records"][0]["frame_id"] = None
        values[2].clear()
    with pytest.raises((ValueError, ValidationError)):
        compose(values, forbidden)


def test_all_records_validated_even_when_budget_would_omit_them():
    values = supplied()
    last = coverage(values[0])
    last["scope"] = {"kind": "attempt", "problem_id": "p", "attempt_id": "a", "relation_revision": 1}
    values[0]["records"].append(last)
    with pytest.raises(ValueError, match="Attempt"):
        compose(values, forbidden, max_metadata_bytes=1000)


@pytest.mark.parametrize("kind", ["duplicate_source", "extra_source", "missing_source", "duplicate_frame", "extra_frame",
                                  "conflicting_artifact", "cross_source_artifact", "missing_state_artifact"])
def test_complete_identity_and_artifact_relations_rejected(kind):
    values = supplied()
    batch, sources, frames, _ = values
    if kind == "duplicate_source":
        sources.append(deepcopy(sources[0]))
    elif kind == "extra_source":
        sources.append({**sources[0], "source_version": 2})
    elif kind == "missing_source":
        sources.clear()
    elif kind == "duplicate_frame":
        frames.append(deepcopy(frames[0]))
    elif kind == "extra_frame":
        frames.append({**frames[0], "frame_id": "extra"})
    elif kind == "missing_state_artifact":
        batch["records"][0]["evidence"]["before"] = {"kind": "artifact", "artifact_id": "unknown"}
    else:
        second = deepcopy(batch["records"][0])
        second.update(record_id="second", sequence=2, frame_id=None)
        batch["records"].append(second)
        if kind == "conflicting_artifact":
            second["artifacts"][0]["byte_length"] += 1
        else:
            second["source"]["source_version"] = 2
            sources.append({**sources[0], "source_version": 2})
    with pytest.raises((ValueError, ValidationError)):
        compose(values, forbidden)


def test_source_versions_stay_distinct_without_latest_or_correction_inference():
    values = supplied()
    batch, sources, _, _ = values
    old = batch["records"][0]
    new = deepcopy(old)
    new.update(record_id="changed-source", sequence=2, frame_id=None, artifacts=[])
    new["source"]["source_version"] = 2
    text = "Independent revised source wording; synthetic test only."
    sources.append({**sources[0], "source_version": 2, "text": text, "content_hash": digest(text.encode())})
    batch["records"].append(new)
    result = compose(values)
    assert [r["source"]["source_version"] for r in result["items"]] == [1, 2]
    assert [r["record"] for r in result["items"]] == [old, new]


def test_budget_omits_whole_items_without_resolving_or_clipping_them():
    values = supplied()
    batch = values[0]
    batch["records"][0]["evidence"]["reason_quote"] = "Long original 用户说明 " * 150
    batch["records"].append(coverage(batch))
    original = deepcopy(values)
    result = compose(values, forbidden, max_metadata_bytes=4000)
    assert result["counts"] == {"supplied": 2, "included": 1, "omitted": 1}
    assert result["items"][0]["record"] == batch["records"][1]
    assert all(p["status"] == "outside_context_unknown" for p in result["items"][0]["parents"])
    assert metadata_size(result) <= 4000
    assert values == original
    empty = compose(values, forbidden, max_metadata_bytes=1000)
    assert empty["counts"] == {"supplied": 2, "included": 0, "omitted": 2}
    assert metadata_size(empty) <= 1000
    with pytest.raises(ValueError, match="empty envelope"):
        compose(values, forbidden, max_metadata_bytes=20)


@pytest.mark.parametrize("limit,value", [("max_metadata_bytes", True), ("max_metadata_bytes", 4 * 1024 * 1024 + 1),
    ("max_image_bytes", 0), ("max_image_bytes", 16 * 1024 * 1024 + 1),
    ("max_total_bytes", 64 * 1024 * 1024 + 1), ("max_pixels", 16_000_001)])
def test_invalid_limits_fail_before_resolution(limit, value):
    with pytest.raises(ValueError):
        compose(supplied(), forbidden, **{limit: value})


@pytest.mark.parametrize("status", ["missing", "revoked", "unavailable", "unobservable", "byte_limit"])
def test_negative_resolver_status_keeps_reference_without_data(status):
    values = supplied()
    result = compose(values, lambda *a, **k: {"status": status, "data": b"must not escape"})
    assert result["items"][0]["image"] == {"status": status}
    assert result["items"][0]["frame"] == values[2][0]
    assert result["attached_bytes"] == 0


@pytest.mark.parametrize("error,status", [(FileNotFoundError("sensitive"), "missing"),
    (PermissionError("sensitive"), "revoked"), (OSError("sensitive"), "resolver_failed"),
    (RuntimeError("sensitive"), "resolver_failed")])
def test_resolver_failures_are_explicit_gaps_without_error_detail(error, status):
    values = supplied()
    second = deepcopy(values[0]["records"][0])
    second.update(record_id="second", sequence=2)
    values[0]["records"].append(second)
    calls = []
    def resolve(frame, **kwargs):
        calls.append(frame["frame_id"])
        if len(calls) == 1:
            raise error
        return available(values[3])(frame, **kwargs)
    result = compose(values, resolve)
    assert result["items"][0]["image"] == {"status": status}
    assert result["items"][1]["image"]["data"] == values[3]
    assert len(calls) == 2


@pytest.mark.parametrize("reply", [None, {"status": "imaginary"}, {"status": []}])
def test_malformed_resolver_result_becomes_gap(reply):
    assert compose(supplied(), lambda *a, **k: reply)["items"][0]["image"] == {"status": "resolver_failed"}


@pytest.mark.parametrize("error_type", [FutureCancelledError, asyncio.CancelledError, KeyboardInterrupt, SystemExit])
def test_cancellation_stops_before_later_resolver_calls(error_type):
    values = supplied()
    second = deepcopy(values[0]["records"][0])
    second.update(record_id="second", sequence=2)
    values[0]["records"].append(second)
    originals = deepcopy(values)
    future = Future()
    assert future.cancel()
    calls = []
    def resolve(frame, **kwargs):
        calls.append(frame["frame_id"])
        if error_type is FutureCancelledError:
            return future.result()  # Actual cancelled synchronous Future, no executor/thread.
        raise error_type("stop composition")
    with pytest.raises(error_type):
        compose(values, resolve)
    assert calls == [values[2][0]["frame_id"]]
    assert values == originals


@pytest.mark.parametrize("data,status", [(b"OCR is not an image", "invalid_image"),
    (png()[:-1], "invalid_image"), (png(raw=b"\0"), "invalid_image"),
    (png(width=3), "dimension_mismatch"), (png(interlace=1), "unsupported_image_variant")])
def test_hash_matching_but_invalid_or_unsupported_images_are_gaps(data, status):
    assert compose(supplied(data=data))["items"][0]["image"] == {"status": status}


def test_missing_frame_dom_and_blocked_source_do_not_resolve():
    values = supplied()
    values[2].clear()
    assert compose(values, forbidden)["items"][0]["image"] == {"status": "missing_frame"}
    values = supplied()
    values[2][0]["representation"] = "dom_snapshot"
    assert compose(values, forbidden)["items"][0]["image"] == {"status": "unobservable_pixels"}
    values = supplied()
    values[1][0]["access_status"] = "needs_auth"
    assert compose(values, forbidden)["items"][0]["image"] == {"status": "source_unavailable"}


def test_byte_pixel_and_artifact_metadata_limits_do_not_attach_invalid_bytes():
    values = supplied()
    size = len(values[3])
    assert compose(values, forbidden, max_image_bytes=size - 1)["items"][0]["image"] == {"status": "byte_limit"}
    assert compose(values, max_pixels=3)["items"][0]["image"] == {"status": "pixel_limit"}
    values[0]["records"][0]["artifacts"][0]["byte_length"] -= 1
    assert compose(values)["items"][0]["image"] == {"status": "artifact_mismatch"}
    values[0]["records"][0]["artifacts"][0]["media_type"] = "image/jpeg"
    assert compose(values, forbidden)["items"][0]["image"] == {"status": "unsupported_media_type"}
    values = supplied()
    second = deepcopy(values[0]["records"][0])
    second.update(record_id="second", sequence=2)
    values[0]["records"].append(second)
    calls = []
    def resolve(frame, *, max_bytes):
        calls.append(max_bytes)
        return available(values[3])(frame, max_bytes=max_bytes)
    result = compose(values, resolve, max_total_bytes=size)
    assert [i["image"]["status"] for i in result["items"]] == ["attached", "byte_limit"]
    assert calls == [size] and result["attached_bytes"] == size


def test_wrong_returned_frame_hash_mutable_bytes_and_caller_mutation_are_rejected():
    values = supplied()
    def mutate_frame(frame, **kwargs):
        frame["source_version"] = 2
        return available(values[3])(frame, **kwargs)
    original = deepcopy(values)
    assert compose(values, mutate_frame)["items"][0]["image"] == {"status": "frame_mismatch"}
    assert values == original
    assert compose(values, available(b"wrong"))["items"][0]["image"] == {"status": "hash_mismatch"}
    assert compose(values, available(bytearray(values[3])))["items"][0]["image"] == {"status": "invalid_image_bytes"}
    def mutate_input(frame, **kwargs):
        values[0]["records"][0]["evidence"]["reason_quote"] = "Changed while reading"
        return available(values[3])(frame, **kwargs)
    with pytest.raises(ValueError, match="changed during composition"):
        compose(values, mutate_input)


@pytest.mark.parametrize("operation", ["text_edit", "ink_edit", "erase", "undo", "redo", "site_feedback"])
def test_mixed_operation_originals_and_opaque_ink_are_preserved(operation):
    values = supplied()
    record = values[0]["records"][0]
    record.update(surface="original_screen_overlay", method="mixed")
    record["artifacts"].append({"artifact_id": "original-editable-ink", "sha256": "c" * 64,
                                "byte_length": 123, "media_type": "application/json"})
    record["evidence"].update(operation=operation,
        before={"kind": "text", "text": "x² + y²"},
        after={"kind": "artifact", "artifact_id": "original-editable-ink"},
        reason_quote=None, observed_actor="website" if operation == "site_feedback" else "user")
    result = compose(values)
    assert result["items"][0]["record"] == record
    assert result["non_frame_artifacts"] == "references_only"
    assert result["items"][0]["image"]["data"] == values[3]


def test_large_declared_original_and_oversized_resolver_return_do_not_escape_byte_ceiling():
    values = supplied()
    values[0]["records"][0]["artifacts"][0]["byte_length"] = 20 * 1024 * 1024
    assert compose(values, forbidden)["items"][0]["image"] == {"status": "byte_limit"}
    values = supplied()
    assert compose(values, available(values[3] + b"extra"), max_image_bytes=len(values[3]))["items"][0]["image"] == {
        "status": "byte_limit"}


def test_actual_memory_store_ingest_and_authorized_resolver_with_supplied_batch():
    # All records/pixels are synthetic/test_only; the existing fixture ingress is
    # used as such. No production screen ingress, database or capture is claimed.
    from services.api.image_resolver import AuthorizedImageResolver
    from services.api.storage import MemoryStore
    from services.api.tests.test_capture import capture_fixture, stored
    setup = capture_fixture(MemoryStore(), USER)
    source = setup.core["SourceSnapshot"]
    data = png()
    frame = {**setup.core["Frame"], "frame_id": "synthetic-composition-frame",
             "artifact_id": "synthetic-composition-png", "width": 2, "height": 2, "content_hash": digest(data)}
    setup.archive.import_fixture(USER, source, frame, data)
    batch = setup.batch
    batch["records"][0].update(frame_id=frame["frame_id"], media_position=frame["media_position"], artifacts=[{
        "artifact_id": frame["artifact_id"], "sha256": digest(data), "byte_length": len(data), "media_type": "image/png"}])
    supplied_batch = deepcopy(batch)  # Actual ingress batch, not reconstructed from stored envelopes.
    ack = setup.capture.ingest(USER, batch, "synthetic-context-composition")
    assert ack["acknowledged"][0]["envelope"] == "committed"
    assert setup.capture.read_record(USER, "process-1")["record"] == supplied_batch["records"][0]
    originals = stored(setup)
    resolver = AuthorizedImageResolver(setup.store, USER, lambda state: None)
    result = compose_process_context(supplied_batch, [source], [frame], resolver, user_id=USER)
    assert result["items"][0]["image"]["data"] == data
    assert result["items"][0]["record"] == supplied_batch["records"][0]
    assert result["commit_status"] == result["authorization_status"] == "not_attested"
    assert result["live_status"] == result["provider_receipt"] == "not_attested"
    assert stored(setup) == originals
    assert source["provenance"]["origin"] == "synthetic" and source["provenance"]["consent_scope"] == "test_only"
