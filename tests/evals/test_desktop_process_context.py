"""Synthetic injected 0.2.7 adapters only; no native or Backend desktop receipt."""

import asyncio
from concurrent.futures import CancelledError as FutureCancelledError
from copy import deepcopy
import json
from pathlib import Path

from jsonschema import ValidationError
import pytest

from services.learning.archive import digest
from services.learning.process_context import prepare_observation_window, prepare_stored_process_context
from test_image_evidence import png
from test_process_context import available, compose, coverage, forbidden, metadata_size
from test_raw_process_context import raw_supplied, changed


def desktop_supplied(data=None):
    """Project-authored PNG and pure example metadata, never native-emitted facts."""
    data = png(width=4, height=2, color=6,
               raw=b"\0" + bytes(range(16)) + b"\0" + bytes(range(16, 32))) if data is None else data
    batch, sources, _, _ = raw_supplied(data)
    record = batch["records"][0]
    path = Path(__file__).resolve().parents[2] / "packages/contracts/desktop_frame/examples/macos-synthetic.json"
    frame = json.loads(path.read_text())
    frame.update(frame_id=record["frame_id"], source=deepcopy(record["source"]),
                 artifact=deepcopy(record["artifacts"][0]),
                 **{key: batch[key] for key in ("device_id", "session_id", "stream_id")})
    return batch, sources, [frame], data


def stored(values, *, function=prepare_observation_window, read=None, resolve=None, **limits):
    """This reader is deliberately synthetic, not an authorization implementation."""
    batch, sources, frames, data = values
    snapshot = {"batch": {**deepcopy(batch), "delivery_mode": "historical"},
                "sources": deepcopy(sources), "frames": deepcopy(frames)}
    def reader(ids, *, max_metadata_bytes):
        assert ids == [r["record_id"] for r in batch["records"]]
        assert max_metadata_bytes == 4 * 1024 * 1024
        return deepcopy(snapshot)
    return function([r["record_id"] for r in batch["records"]], reader if read is None else read,
        available(data) if resolve is None else resolve, user_id=sources[0]["user_id"], **limits)


@pytest.mark.parametrize("rotation", [0, 90, 180, 270, -90, 45.25])
def test_exact_descriptor_png_and_native_geometry_never_rotate_or_become_legacy(rotation):
    values = desktop_supplied()
    frame = values[2][0]
    frame["profile"]["display_at_start"]["rotation_degrees"] = rotation
    before, calls = deepcopy(values), []
    def resolver(descriptor, *, max_bytes):
        assert descriptor == frame and descriptor is not frame
        assert "width" not in descriptor and "orientation" not in descriptor
        calls.append(max_bytes)
        return available(values[3])(descriptor, max_bytes=max_bytes)
    result = compose(values, resolver)
    item = result["items"][0]
    assert item["frame"] == frame and item["record"] == values[0]["records"][0]
    assert item["image"]["data"] == values[3] and item["image"]["status"] == "attached"
    assert (frame["raw_width"], frame["raw_height"]) == (4, 2)
    assert frame["pixel_orientation"] is None and frame["pixels_transformed"] is False
    assert frame["profile"]["display_at_start"]["requested_width_pixels"] == 2880
    assert frame["profile"]["display_at_start"]["frame_points"]["x"] == -1440
    assert item["pixel_orientation"] == "raw_unapplied" and item["provider_image_alignment"] == "not_attested"
    assert result["presentation_permission"] == "not_granted"
    assert result["live_status"] == result["provider_receipt"] == "not_attested"
    assert calls == [4 * 1024 * 1024] and values == before


@pytest.mark.parametrize("unknown", [True, False])
def test_native_double_uint64_and_unknown_geometry_are_retained_without_clock_conversion(unknown):
    values = desktop_supplied()
    frame = values[2][0]
    host, sample = frame["profile"]["host_clock"], frame["profile"]["sample"]
    host.update(session_started_seconds=100.125, callback_seconds=107.625)
    if unknown:
        host.update(display_time_ticks_decimal=None, display_time_seconds=None)
        sample.update(presentation_time_seconds=None, dirty_rects=None)
    else:
        frame["timing"].update(observed_at_estimate="2026-09-30T12:00:07.750Z",
                               estimate_basis="session_wall_plus_callback_monotonic_delta")
        sample.update(presentation_time_seconds=-0.125, content_scale=1.25, scale_factor=2.5,
                      content_rect={"x": -10.25, "y": 5.5, "width": 100.125, "height": 0},
                      dirty_rects=[{"x": 99999, "y": -999, "width": 0, "height": 1}])
    before = deepcopy(values)
    item = stored(values)["items"][0]
    assert item["frame"] == frame and values == before
    assert frame["timing"]["callback_clock"] is frame["captured_at"] is frame["media_position"] is None
    assert item["record"]["clock"] is item["record"]["observed_at"] is item["record"]["media_position"] is None
    assert host["display_time_ticks_decimal"] == (None if unknown else "18446744073709551615")
    assert sample["geometry_unit"] is None


@pytest.mark.parametrize("path,value", [
    (("contract_version",), "0.2.5"), (("contract_version",), "0.2.6"),
    (("contract_version",), "0.2.8"), (("kind",), "unknown"),
    (("source", "user_id"), "foreign"), (("source", "source_id"), "different"),
    (("source", "source_version"), 2), (("device_id",), "different"),
    (("session_id",), "different"), (("stream_id",), "different"),
    (("artifact", "sha256"), "0" * 64), (("artifact", "byte_length"), 1),
    (("profile", "kind"), "windows"), (("profile", "host_clock", "callback_seconds"), float("nan")),
    (("profile", "host_clock", "display_time_ticks_decimal"), 18446744073709551615),
    (("profile", "host_clock", "display_time_ticks_decimal"), "018446744073709551615"),
    (("profile", "host_clock", "display_time_seconds"), None),
    (("pixel_orientation",), 90), (("pixels_transformed",), True),
    (("timing", "observed_at_estimate"), "2026-09-30T12:00:07.250Z"),
    (("timing", "callback_clock"), {"domain_id": "invented", "elapsed_ms": 7000, "uncertainty_ms": None}),
])
def test_invalid_or_foreign_desktop_is_rejected_before_any_bytes_even_if_budget_omits_it(path, value):
    values = desktop_supplied()
    changed(values[2][0], path, value)
    with pytest.raises((ValidationError, ValueError)):
        compose(values, forbidden, max_metadata_bytes=1000)


@pytest.mark.parametrize("field", ["contract_version", "kind", "profile", "pixel_orientation"])
def test_missing_required_version_profile_or_unknown_field_never_downgrades(field):
    values = desktop_supplied()
    del values[2][0][field]
    with pytest.raises((ValidationError, ValueError)):
        compose(values, forbidden)
    values = desktop_supplied()
    values[2][0]["assumed_upright"] = True
    with pytest.raises(ValidationError):
        compose(values, forbidden)


@pytest.mark.parametrize("field,value", [
    ("observed_at", "2026-09-30T12:00:07.250Z"), ("media_position", 7),
    ("clock", {"domain_id": "invented", "elapsed_ms": 7000, "uncertainty_ms": None}),
    ("scope", {"kind": "attempt", "problem_id": "p", "attempt_id": "a", "relation_revision": 1}),
])
def test_record_binding_cannot_invent_capture_time_or_attempt_authority(field, value):
    values = desktop_supplied()
    values[0]["records"][0][field] = value
    with pytest.raises((ValidationError, ValueError)):
        compose(values, forbidden)


def test_existing_png_pipeline_checks_actual_dimensions_crc_hash_type_and_all_limits():
    values = desktop_supplied()
    size = len(values[3])
    assert compose(values, available(b"different"))["items"][0]["image"]["status"] == "hash_mismatch"
    assert compose(values, available(bytearray(values[3])))["items"][0]["image"]["status"] == "invalid_image_bytes"
    assert compose(values, forbidden, max_image_bytes=size - 1)["items"][0]["image"]["status"] == "byte_limit"
    assert compose(values, max_pixels=7)["items"][0]["image"]["status"] == "pixel_limit"
    values[2][0].update(raw_width=2, raw_height=4)
    assert compose(values)["items"][0]["image"]["status"] == "dimension_mismatch"
    corrupt = values[3][:-1] + bytes([values[3][-1] ^ 1])
    assert compose(desktop_supplied(corrupt))["items"][0]["image"]["status"] == "invalid_image"
    values = desktop_supplied()
    values[2][0]["artifact"]["byte_length"] -= 1
    values[0]["records"][0]["artifacts"][0]["byte_length"] -= 1
    assert compose(values)["items"][0]["image"]["status"] == "artifact_mismatch"


def test_resolver_cannot_replace_original_profile_or_orientation_with_same_png():
    values = desktop_supplied()
    def replaced(frame, **kwargs):
        frame["profile"]["display_at_start"]["rotation_degrees"] = 0
        return available(values[3])(frame, **kwargs)
    assert compose(values, replaced)["items"][0]["image"]["status"] == "frame_mismatch"
    assert values[2][0]["profile"]["display_at_start"]["rotation_degrees"] == 90


@pytest.mark.parametrize("status", ["missing", "revoked", "unavailable", "unobservable", "byte_limit"])
def test_explicit_original_gaps_never_fall_back_to_stale_bytes(status):
    values = desktop_supplied()
    result = stored(values, resolve=lambda *a, **k: {"status": status, "data": values[3]})
    assert result["items"][0]["image"] == {"status": status}
    assert result["items"][0]["frame"] == values[2][0]


@pytest.mark.parametrize("same_native_session", [True, False])
def test_multi_observation_host_facts_never_become_a_comparable_process_clock(same_native_session):
    values = desktop_supplied()
    batch, _, frames, _ = values
    second, frame = deepcopy(batch["records"][0]), deepcopy(frames[0])
    second.update(record_id="second", sequence=2, frame_id="second-frame")
    frame.update(frame_id="second-frame", callback_sequence=25)
    frame["profile"]["host_clock"]["callback_seconds"] = 108.123456
    frame["profile"]["sample"]["presentation_time_seconds"] = -1.25
    if not same_native_session:
        frame["profile"]["native_session_id"] = "another-native-session"
    frames.append(frame)
    batch["records"] = [second, batch["records"][0]]
    original = deepcopy(values)
    result = stored(values)
    comparison = result["observation_window"]["comparisons"][0]
    assert comparison["clock_readings"] == {"status": "unknown", "reason": "no_process_capture_clock"}
    assert comparison["retained_image_bytes"] == "identical"
    assert result["observation_window"]["semantic_change"] == "not_inferred"
    assert [i["record"] for i in result["items"]] == batch["records"]
    assert [i["frame"] for i in result["items"]] == [frame, frames[0]] and values == original
    limited = stored(values, max_total_bytes=len(values[3]))
    assert [i["image"]["status"] for i in limited["items"]] == ["attached", "byte_limit"]
    assert limited["observation_window"]["comparisons"][0]["retained_image_bytes"] == "unknown"


def test_original_coverage_ink_and_metadata_budget_keep_unknowns_or_withhold_window():
    values = desktop_supplied()
    batch = values[0]
    batch["records"][0]["artifacts"].append({"artifact_id": "editable-ink", "sha256": "a" * 64,
                                            "byte_length": 52, "media_type": "application/json"})
    gap = coverage(batch)
    batch["records"].append(gap)
    result = stored(values)
    assert result["items"][0]["record"] == batch["records"][0]
    assert result["items"][1]["record"] == gap
    assert result["items"][1]["image"] == {"status": "missing_frame"}
    assert result["observation_window"]["comparisons"][0]["retained_image_bytes"] == "unknown"
    assert result["capture_completeness"] == "unknown" and result["non_frame_artifacts"] == "references_only"
    for limit in (1000, 2000, 4000):
        bounded = compose(values, max_metadata_bytes=limit)
        assert metadata_size(bounded) <= limit
    with pytest.raises(ValueError, match="withheld"):
        stored(values, max_metadata_bytes=2000)


@pytest.mark.parametrize("function", [prepare_stored_process_context, prepare_observation_window])
@pytest.mark.parametrize("change", ["deny_first", "deny_final", "source", "native_metadata"])
def test_synthetic_current_reader_recheck_withholds_changed_or_denied_whole_selection(function, change):
    values, calls, published = desktop_supplied(), [], []
    def reader(ids, **kwargs):
        calls.append(ids.copy())
        if change == "deny_first" or (len(calls) == 2 and change == "deny_final"):
            raise PermissionError("Synthetic current access denied")
        batch, sources, frames, _ = deepcopy(values)
        batch["delivery_mode"] = "historical"
        if len(calls) == 2:
            if change == "source":
                sources[0]["source_timezone"] = "Europe/London"
            elif change == "native_metadata":
                frames[0]["profile"]["native_session_id"] = "changed-session"
        return {"batch": batch, "sources": sources, "frames": frames}
    with pytest.raises(PermissionError if change.startswith("deny") else ValueError):
        published.append(stored(values, function=function, read=reader))
    assert not published
    assert calls == [["process-1"]] * (1 if change == "deny_first" else 2)


@pytest.mark.parametrize("stage", ["read", "bytes", "recheck"])
@pytest.mark.parametrize("exception", [FutureCancelledError, asyncio.CancelledError])
def test_desktop_cancellation_withholds_the_entire_window(stage, exception):
    values, calls = desktop_supplied(), []
    def reader(ids, **kwargs):
        calls.append(ids.copy())
        if stage == "read" or (stage == "recheck" and len(calls) == 2):
            raise exception()
        batch, sources, frames, _ = deepcopy(values)
        batch["delivery_mode"] = "historical"
        return {"batch": batch, "sources": sources, "frames": frames}
    def resolver(frame, **kwargs):
        if stage == "bytes":
            raise exception()
        return available(values[3])(frame, **kwargs)
    with pytest.raises(exception):
        stored(values, read=reader, resolve=resolver)
