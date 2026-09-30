"""Synthetic raw PNG evidence only; no native capture, orientation or provider use."""

import asyncio
from concurrent.futures import CancelledError as FutureCancelledError, Future
from copy import deepcopy

from jsonschema import ValidationError
import pytest

from services.learning.archive import digest
from test_image_evidence import png
from test_process_context import available, compose, coverage, forbidden, metadata_size, supplied


def raw_supplied(data=None):
    data = (png(width=3, height=2, raw=b"\0" + bytes(range(9)) + b"\0" + bytes(range(9, 18)))
            if data is None else data)
    batch, sources, frames, _ = supplied(display=True, data=data)
    record, old = batch["records"][0], frames[0]
    record.update(observed_at=None, media_position=None, clock=None)
    frame = {
        "contract_version": "0.2.5", "kind": "raw_capture_frame", "frame_id": old["frame_id"],
        "source": deepcopy(record["source"]),
        **{name: batch[name] for name in ("device_id", "session_id", "stream_id")},
        "artifact": deepcopy(record["artifacts"][0]), "raw_width": 3, "raw_height": 2,
        "buffer_sequence": 97, "captured_at": None, "media_position": None,
        "timing": {"observed_at_estimate": None, "estimate_basis": None, "uncertainty_ms": None,
                   "callback_clock": None, "sample_pts_seconds": None},
        "orientation": {"system": "CGImagePropertyOrientation", "value": None, "applied_to_pixels": False},
    }
    return batch, sources, [frame], data


def changed(value, path, replacement):
    for name in path[:-1]:
        value = value[name]
    value[path[-1]] = replacement


@pytest.mark.parametrize("orientation", [None, 1, 2, 3, 4, 5, 6, 7, 8])
def test_exact_raw_descriptor_and_png_keep_all_orientations_unapplied(orientation):
    values = raw_supplied()
    frame = values[2][0]
    frame["orientation"]["value"] = orientation
    original, calls = deepcopy(values), []
    def resolve(descriptor, *, max_bytes):
        assert descriptor == frame and descriptor is not frame
        assert not {"width", "height", "content_hash", "representation", "user_id"} & descriptor.keys()
        calls.append(max_bytes)
        return available(values[3])(descriptor, max_bytes=max_bytes)
    result = compose(values, resolve)
    item = result["items"][0]
    assert item["frame"] == frame and item["record"] == values[0]["records"][0]
    assert item["pixel_orientation"] == "raw_unapplied"
    assert item["provider_image_alignment"] == "not_attested"
    assert item["image"] == {"status": "attached", "data": values[3], "media_type": "image/png",
                             "byte_length": len(values[3])}
    assert digest(item["image"]["data"]) == frame["artifact"]["sha256"]
    assert (item["frame"]["raw_width"], item["frame"]["raw_height"]) == (3, 2)
    assert frame["buffer_sequence"] != item["record"]["sequence"]
    assert calls == [4 * 1024 * 1024] and values == original
    assert result["live_status"] == result["provider_receipt"] == result["authorization_status"] == "not_attested"
    assert result["presentation_permission"] == "not_granted" and result["capture_completeness"] == "unknown"
    item["frame"]["orientation"]["value"] = 8 if orientation != 8 else 1
    assert values == original


@pytest.mark.parametrize("estimate,record_clock", [(False, False), (True, False), (False, True), (True, True)])
def test_callback_estimate_pts_and_clock_are_never_promoted_to_capture_or_course_time(estimate, record_clock):
    values = raw_supplied()
    frame, record = values[2][0], values[0]["records"][0]
    clock = {"domain_id": "callback-domain", "elapsed_ms": 1234, "uncertainty_ms": None}
    frame["timing"].update(callback_clock=clock, sample_pts_seconds=-0.125)
    if estimate:
        frame["timing"].update(observed_at_estimate="2026-09-29T23:59:59.123Z",
                               estimate_basis="session_wall_plus_callback_monotonic_delta")
    if record_clock:
        record["clock"] = deepcopy(clock)
    original = deepcopy(values)
    result = compose(values)
    assert result["items"][0]["frame"] == frame
    assert result["items"][0]["record"] == record
    assert frame["captured_at"] is frame["media_position"] is record["observed_at"] is record["media_position"] is None
    assert values == original


def test_operations_coverage_unknown_parents_and_ink_refs_remain_complete():
    values = raw_supplied()
    batch = values[0]
    operation = batch["records"][0]
    operation["evidence"].update(operation="ink_edit", reason_quote="Synthetic original reason 原话。",
                                before={"kind": "unknown", "reason": "not_observed"},
                                after={"kind": "artifact", "artifact_id": "editable-ink-ref"})
    operation["artifacts"].append({"artifact_id": "editable-ink-ref", "sha256": "b" * 64,
                                   "byte_length": 52, "media_type": "application/json"})
    gap = coverage(batch)
    batch["records"] = [gap, operation]
    result = compose(values)
    assert [item["record"] for item in result["items"]] == [gap, operation]
    assert result["items"][0]["parents"] == [{"record_id": "process-1", "status": "included"},
                                             {"record_id": "outside-batch", "status": "outside_context_unknown"}]
    assert result["items"][0]["image"] == {"status": "missing_frame"}
    assert result["non_frame_artifacts"] == "references_only"
    assert result["items"][1]["frame"] == values[2][0]


@pytest.mark.parametrize("path,value", [
    (("source", "user_id"), "foreign"), (("source", "source_id"), "other-source"),
    (("source", "source_version"), 2), (("device_id",), "other-device"),
    (("session_id",), "other-session"), (("stream_id",), "other-stream"),
    (("frame_id",), "unreferenced"), (("contract_version",), "0.2.4"), (("kind",), "Frame"),
    (("artifact", "sha256"), "0" * 64), (("artifact", "byte_length"), 42),
    (("artifact", "artifact_id"), "other-artifact"), (("artifact", "media_type"), "image/jpeg"),
    (("raw_width",), True), (("raw_height",), 0), (("buffer_sequence",), False),
    (("captured_at",), "2026-09-29T00:00:00Z"), (("media_position",), 0),
    (("orientation", "value"), True), (("orientation", "value"), 0), (("orientation", "value"), 9),
    (("orientation", "applied_to_pixels"), True), (("orientation", "system"), "assumed_upright"),
    (("timing", "uncertainty_ms"), 0), (("timing", "observed_at_estimate"), "2026-09-29T00:00:00Z"),
    (("timing", "sample_pts_seconds"), float("nan")),
])
def test_malformed_or_cross_bound_raw_descriptor_fails_before_resolution(path, value):
    values = raw_supplied()
    changed(values[2][0], path, value)
    with pytest.raises((ValueError, ValidationError)):
        compose(values, forbidden, max_metadata_bytes=1000)


@pytest.mark.parametrize("path,value", [
    (("observed_at",), "2026-09-29T00:00:00Z"), (("media_position",), 0),
    (("clock",), {"domain_id": "unbound-clock", "elapsed_ms": 0, "uncertainty_ms": None}),
    (("scope",), {"kind": "attempt", "problem_id": "p", "attempt_id": "a", "relation_revision": 1}),
    (("artifacts", 0, "sha256"), "f" * 64), (("artifacts", 0, "media_type"), "image/jpeg"),
])
def test_raw_record_binding_and_attempt_boundary_remain_strict(path, value):
    values = raw_supplied()
    changed(values[0]["records"][0], path, value)
    with pytest.raises((ValueError, ValidationError)):
        compose(values, forbidden)


def test_all_bindings_checked_before_any_bytes_even_for_later_budget_omission():
    values = raw_supplied()
    second = deepcopy(values[0]["records"][0])
    second.update(record_id="later", sequence=2, frame_id="later-frame",
                  clock={"domain_id": "not-the-callback-clock", "elapsed_ms": 1, "uncertainty_ms": None})
    values[0]["records"].append(second)
    values[2].append({**deepcopy(values[2][0]), "frame_id": "later-frame"})
    with pytest.raises(ValidationError):
        compose(values, forbidden, max_metadata_bytes=1000)


@pytest.mark.parametrize("ambiguity", ["legacy_source", "duplicate_raw", "duplicate_legacy", "legacy_fields", "missing_kind"])
def test_no_downgrade_or_ambiguous_frame_identity(ambiguity):
    values = raw_supplied()
    if ambiguity == "legacy_source":
        values[1][0] = supplied()[1][0]
    elif ambiguity == "duplicate_raw":
        values[2].append(deepcopy(values[2][0]))
    elif ambiguity == "duplicate_legacy":
        values[2].append(supplied(display=True, data=values[3])[2][0])
    elif ambiguity == "legacy_fields":
        values[2][0].update(width=3, height=2, content_hash=values[2][0]["artifact"]["sha256"])
    else:
        del values[2][0]["kind"]
    with pytest.raises((ValueError, ValidationError)):
        compose(values, forbidden)


@pytest.mark.parametrize("path,value", [(("orientation", "value"), 6), (("captured_at",), "2026-09-29T00:00:00Z"),
    (("timing", "sample_pts_seconds"), 1), (("raw_width",), 2), (("artifact", "byte_length"), 55)])
def test_returned_descriptor_must_match_all_original_raw_fields(path, value):
    values = raw_supplied()
    original = deepcopy(values)
    def resolve(frame, **kwargs):
        changed(frame, path, value)
        return available(values[3])(frame, **kwargs)
    assert compose(values, resolve)["items"][0]["image"] == {"status": "frame_mismatch"}
    assert values == original


@pytest.mark.parametrize("data,status", [
    (b"OCR text is not an image", "invalid_image"), (png(width=3)[:-1], "invalid_image"),
    (png(width=3)[:-5] + b"X" + png(width=3)[-4:], "invalid_image"),
    (png(width=3, raw=b"\0"), "invalid_image"), (png(width=3, interlace=1), "unsupported_image_variant"),
    (png(width=3, depth=16), "unsupported_image_variant"), (png(width=2, height=3), "dimension_mismatch"),
])
def test_hash_matching_png_still_needs_raw_dimensions_crc_and_static_supported_pixels(data, status):
    values = raw_supplied(data)
    values[2][0]["orientation"]["value"] = 6
    assert compose(values)["items"][0]["image"] == {"status": status}
    assert values[3] == data


@pytest.mark.parametrize("status", ["missing", "revoked", "unavailable", "unobservable", "byte_limit"])
def test_raw_byte_gaps_are_not_filled_or_oriented(status):
    values = raw_supplied()
    result = compose(values, lambda *a, **k: {"status": status, "data": b"do not attach"})
    item = result["items"][0]
    assert item["image"] == {"status": status} and item["frame"] == values[2][0]
    assert item["pixel_orientation"] == "raw_unapplied" and item["provider_image_alignment"] == "not_attested"


def test_raw_image_hash_length_type_byte_and_pixel_limits():
    values = raw_supplied()
    size = len(values[3])
    assert compose(values, available(b"different"))["items"][0]["image"] == {"status": "hash_mismatch"}
    assert compose(values, available(bytearray(values[3])))["items"][0]["image"] == {"status": "invalid_image_bytes"}
    def jpeg(frame, **kwargs):
        return {**available(values[3])(frame, **kwargs), "media_type": "image/jpeg"}
    assert compose(values, jpeg)["items"][0]["image"] == {"status": "unsupported_media_type"}
    assert compose(values, forbidden, max_image_bytes=size - 1)["items"][0]["image"] == {"status": "byte_limit"}
    assert compose(values, max_pixels=5)["items"][0]["image"] == {"status": "pixel_limit"}
    # Keep proposed frame/process reference binding valid while the claimed length
    # disagrees with the exact returned original bytes.
    values[2][0]["artifact"]["byte_length"] -= 1
    values[0]["records"][0]["artifacts"][0]["byte_length"] -= 1
    assert compose(values)["items"][0]["image"] == {"status": "artifact_mismatch"}


def test_raw_orientation_labels_count_toward_whole_item_metadata_and_total_image_budget():
    values = raw_supplied()
    calls = []
    def resolve(frame, **kwargs):
        calls.append(kwargs["max_bytes"])
        return available(values[3])(frame, **kwargs)
    for limit in (1000, 2000, 3000, 4000):
        calls.clear()
        result = compose(values, resolve, max_metadata_bytes=limit)
        assert metadata_size(result) <= limit
        assert len(calls) == result["counts"]["included"]
        assert result["counts"]["included"] + result["counts"]["omitted"] == 1
        if result["items"]:
            assert result["items"][0]["frame"] == values[2][0]
    second = deepcopy(values[0]["records"][0])
    second.update(record_id="second", sequence=2)
    values[0]["records"].append(second)
    calls.clear()
    result = compose(values, resolve, max_total_bytes=len(values[3]))
    assert [i["image"]["status"] for i in result["items"]] == ["attached", "byte_limit"]
    assert calls == [len(values[3])] and result["attached_bytes"] == len(values[3])


@pytest.mark.parametrize("error_type", [FutureCancelledError, asyncio.CancelledError])
def test_raw_cancellation_stops_before_next_resolver(error_type):
    values = raw_supplied()
    second = deepcopy(values[0]["records"][0])
    second.update(record_id="second", sequence=2)
    values[0]["records"].append(second)
    calls, future = [], Future()
    assert future.cancel()
    def resolve(frame, **kwargs):
        calls.append(frame)
        if error_type is FutureCancelledError:
            return future.result()
        raise error_type()
    with pytest.raises(error_type):
        compose(values, resolve)
    assert len(calls) == 1


def test_raw_input_mutation_rejects_and_ordinary_resolver_failure_stays_a_gap():
    values = raw_supplied()
    def failed(*args, **kwargs):
        raise OSError("private resolver failure")
    assert compose(values, failed)["items"][0]["image"] == {"status": "resolver_failed"}
    def mutate(frame, **kwargs):
        values[2][0]["timing"]["sample_pts_seconds"] = 42
        return available(values[3])(frame, **kwargs)
    with pytest.raises(ValueError, match="changed during composition"):
        compose(values, mutate)


def test_legacy_frame_can_coexist_without_raw_orientation_or_time_reinterpretation():
    values = raw_supplied()
    batch = values[0]
    legacy_batch, _, legacy_frames, _ = supplied(display=True, data=values[3])
    legacy = legacy_frames[0]
    legacy.update(frame_id="legacy-frame", width=3)
    legacy_record = legacy_batch["records"][0]
    legacy_record.update(record_id="legacy-record", sequence=2, frame_id=legacy["frame_id"])
    batch["records"].append(legacy_record)
    values[2].append(legacy)
    result = compose(values)
    raw_item, legacy_item = result["items"]
    assert raw_item["frame"]["captured_at"] is None
    assert legacy_item["frame"] == legacy and legacy_item["record"] == legacy_record
    assert "pixel_orientation" not in legacy_item and "provider_image_alignment" not in legacy_item
    assert all(i["image"]["data"] == values[3] for i in result["items"])
