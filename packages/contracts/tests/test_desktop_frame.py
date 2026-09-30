"""Synthetic 0.2.7 metadata; no native fixture, pixels, authority or runtime proof."""

from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import validate as validate_v1
from packages.contracts import raw_capture_ingress
from packages.contracts.capture_frame import validate as validate_raw
from packages.contracts.capture_ingress import validate as validate_ingress
from packages.contracts.desktop_frame import (
    CONTRACT_VERSION, ESTIMATE_BASIS, MAX_UINT64, SCHEMA, validate, validate_binding,
)
from packages.contracts.desktop_frame.generate import outputs
from packages.contracts.display_source import validate_display_record
from packages.contracts.original_artifact import MAX_ARTIFACT_BYTES, validate_capture_frame
from packages.contracts.process_control import validate as validate_control
from packages.contracts.process_v2 import validate as validate_process, validate_record_frame
from packages.contracts.tests.test_capture_frame import CLOCK, display, observation, proposal, set_field
from packages.contracts.validation import MAX_SAFE_INTEGER


ROOT = Path(__file__).parents[1]


@pytest.fixture
def desktop(proposal):
    batch, record_id, raw, source, binding = proposal
    frame = {name: deepcopy(raw[name]) for name in (
        "kind", "frame_id", "source", "device_id", "session_id", "stream_id", "artifact",
        "raw_width", "raw_height", "captured_at", "media_position",
    )}
    frame.update(contract_version="0.2.7", callback_sequence=97, pixel_orientation=None,
                 pixels_transformed=False,
                 timing={"observed_at_estimate": None, "estimate_basis": None,
                         "uncertainty_ms": None, "callback_clock": None},
                 profile={
                     "kind": "macos_screencapturekit", "native_session_id": "synthetic-native-session",
                     "pixel_format": "BGRA", "encoding": "png; 8-bit RGBA; sRGB; lossless; native size; not rotated",
                     "display_at_start": {
                         "display_id": 42, "name": "SYNTHETIC metadata, not a device capture",
                         "frame_points": {"x": -1440.5, "y": -32.25, "width": 1440.5, "height": 900},
                         "point_pixel_scale": 2.0, "requested_width_pixels": 2881,
                         "requested_height_pixels": 1800, "rotation_degrees": 90.0, "is_main": False,
                         "scope": "whole display; no window excluded, so this app's windows are captured when visible; cursor shown; BGRA buffers requested in sRGB; no audio",
                     },
                     "host_clock": {
                         "basis": "mach_absolute_time_seconds", "session_started_wall_utc": "2026-09-30T12:00:00Z",
                         "session_started_seconds": 1000.125, "callback_seconds": 1001.375,
                         "display_time_ticks_decimal": None, "display_time_seconds": None,
                     },
                     "sample": {
                         "status": "complete", "presentation_time_seconds": -0.125,
                         "geometry_basis": "SCStreamFrameInfo_as_reported", "geometry_unit": None,
                         "content_rect": None, "content_scale": None, "scale_factor": None,
                         "dirty_rects": None,
                     },
                 })
    return batch, record_id, frame, source, binding


def assert_rejected_unchanged(values):
    original = deepcopy(values)
    with pytest.raises(ValidationError):
        validate_binding(*values)
    assert values == original


def test_unknown_geometry_orientation_and_requested_size_do_not_rewrite_delivered_pixels(desktop):
    original = deepcopy(desktop)
    frame = desktop[2]
    assert CONTRACT_VERSION == "0.2.7"
    assert validate(frame) is None and validate_binding(*desktop) is None
    assert desktop == original
    assert frame["captured_at"] is frame["media_position"] is frame["pixel_orientation"] is None
    assert frame["pixels_transformed"] is False
    assert frame["raw_width"] != frame["profile"]["display_at_start"]["requested_width_pixels"]
    assert frame["profile"]["display_at_start"]["rotation_degrees"] == 90
    assert frame["profile"]["native_session_id"] != frame["session_id"]


@pytest.mark.parametrize("rects", [None, [], [{"x": -2.25, "y": -3.5, "width": 0, "height": 1.25}]])
def test_absent_empty_and_reported_dirty_rectangles_remain_distinct(desktop, rects):
    sample = desktop[2]["profile"]["sample"]
    sample.update(dirty_rects=rects, content_rect={"x": -2.25, "y": -3.5, "width": 1.5, "height": 2.75},
                  content_scale=0.75, scale_factor=2.0)
    original = deepcopy(desktop)
    validate_binding(*desktop)
    assert desktop == original and sample["geometry_unit"] is None


@pytest.mark.parametrize("ticks", ["0", "9007199254740993", "18446744073709551614", "18446744073709551615"])
def test_native_uint64_ticks_roundtrip_as_exact_decimal_strings(desktop, ticks):
    frame = desktop[2]
    frame["profile"]["host_clock"].update(display_time_ticks_decimal=ticks, display_time_seconds=1000.875)
    before = deepcopy(frame)
    validate(frame)
    restored = json.loads(json.dumps(frame))
    assert restored == before and restored["profile"]["host_clock"]["display_time_ticks_decimal"] == ticks
    assert MAX_UINT64 == 2**64 - 1
    Draft202012Validator(SCHEMA).validate(restored)


@pytest.mark.parametrize("ticks", ["", "00", "01", "+1", "-1", "-0", "1.0", "1e3", " 1", "1 ",
                                    "1\n", "1\r\n", "18446744073709551616", "99999999999999999999", 1, 2**64 - 1])
def test_uint64_is_canonical_and_bounded_in_python_and_generated_schema(desktop, ticks):
    frame = desktop[2]
    frame["profile"]["host_clock"].update(display_time_ticks_decimal=ticks, display_time_seconds=1000.875)
    with pytest.raises(ValidationError):
        validate(frame)
    with pytest.raises(ValidationError):
        Draft202012Validator(SCHEMA).validate(frame)


@pytest.mark.parametrize("field", ["display_time_ticks_decimal", "display_time_seconds"])
def test_display_tick_and_seconds_unknowns_cannot_be_half_invented(desktop, field):
    clock = desktop[2]["profile"]["host_clock"]
    clock[field] = "12345" if field == "display_time_ticks_decimal" else 123.5
    assert_rejected_unchanged(desktop)


def test_callback_wall_estimate_uses_recorded_session_origin_not_sample_or_display_time(desktop):
    frame = desktop[2]
    frame["timing"].update(observed_at_estimate="2026-09-30T12:00:01.250Z", estimate_basis=ESTIMATE_BASIS)
    frame["profile"]["host_clock"].update(display_time_ticks_decimal="9876543210", display_time_seconds=123.75)
    frame["profile"]["sample"]["presentation_time_seconds"] = -200.125
    original = deepcopy(desktop)
    validate_binding(*desktop)
    assert desktop == original and desktop[0]["records"][0]["clock"] is None
    frame["timing"]["observed_at_estimate"] = "2026-09-30T12:00:01.251Z"
    assert_rejected_unchanged(desktop)


@pytest.mark.parametrize("origin,estimate", [
    ("2026-09-30T12:00:00Z", "2026-09-30T12:00:01.25Z"),
    ("2026-09-30T12:00:00.0Z", "2026-09-30T12:00:01.250000Z"),
    ("2026-09-30T12:00:00.250Z", "2026-09-30T12:00:01.5Z"),
])
def test_equivalent_fraction_formats_preserve_the_callback_estimate(desktop, origin, estimate):
    frame = desktop[2]
    frame["profile"]["host_clock"]["session_started_wall_utc"] = origin
    frame["timing"].update(observed_at_estimate=estimate, estimate_basis=ESTIMATE_BASIS)
    original = deepcopy(desktop)
    validate_binding(*desktop)
    assert desktop == original


@pytest.mark.parametrize("part,value", [
    ("origin", "2026-09-30T12:00:00.0000Z"),
    ("origin", "2026-09-30T12:00:00Z\n"),
    ("estimate", "2026-09-30T12:00:01.0000009Z"),
    ("estimate", "2026-09-30T12:00:01.0000000Z"),
    ("estimate", "2026-09-30T12:00:01Z\n"),
])
def test_utc_precision_or_trailing_data_cannot_be_silently_truncated(desktop, part, value):
    frame = desktop[2]
    frame["profile"]["host_clock"]["callback_seconds"] = 1001.125
    frame["timing"].update(observed_at_estimate="2026-09-30T12:00:01Z", estimate_basis=ESTIMATE_BASIS)
    if part == "origin":
        frame["profile"]["host_clock"]["session_started_wall_utc"] = value
    else:
        frame["timing"]["observed_at_estimate"] = value
    assert_rejected_unchanged(desktop)
    with pytest.raises(ValidationError):
        Draft202012Validator(SCHEMA).validate(frame)


@pytest.mark.parametrize("path,value", [
    (("timing", "estimate_basis"), ESTIMATE_BASIS),
    (("timing", "observed_at_estimate"), "2026-09-30T12:00:01.250Z"),
    (("timing", "uncertainty_ms"), 0), (("timing", "callback_clock"), CLOCK),
    (("profile", "host_clock", "callback_seconds"), 1000.0),
    (("profile", "host_clock", "session_started_wall_utc"), "2026-02-30T12:00:00Z"),
    (("profile", "host_clock", "basis"), "course_playhead"),
    (("captured_at",), "2026-09-30T12:00:01.250Z"), (("media_position",), 0),
])
def test_unknown_time_cannot_be_promoted_to_capture_or_course_facts(desktop, path, value):
    set_field(desktop[2], path, value)
    assert_rejected_unchanged(desktop)


@pytest.mark.parametrize("field,value", [
    ("observed_at", "2026-09-30T12:00:01.250Z"), ("media_position", 0.125), ("clock", CLOCK),
])
def test_selected_process_record_cannot_invent_a_clock_domain_or_capture_time(desktop, field, value):
    desktop[0]["records"][0][field] = deepcopy(value)
    validate_process("ProcessBatch", desktop[0])
    assert_rejected_unchanged(desktop)


def test_callback_and_process_sequences_and_sample_pts_have_independent_meaning(desktop):
    frame = desktop[2]
    assert frame["callback_sequence"] != desktop[0]["records"][0]["sequence"]
    for ordinal, pts in ((100, 8.5), (101, -0.5), (98, None)):
        frame["callback_sequence"] = ordinal
        frame["profile"]["sample"]["presentation_time_seconds"] = pts
        original = deepcopy(desktop)
        validate_binding(*desktop)
        assert desktop == original


@pytest.mark.parametrize("path,value", [
    (("callback_sequence",), 0), (("callback_sequence",), True), (("callback_sequence",), MAX_SAFE_INTEGER + 1),
    (("profile", "display_at_start", "display_id"), 2**32),
    (("profile", "display_at_start", "frame_points", "width"), -1),
    (("profile", "sample", "content_scale"), 0), (("profile", "sample", "scale_factor"), -0.5),
    (("profile", "sample", "geometry_unit"), "pixels"), (("pixel_orientation",), 1),
    (("pixels_transformed",), True), (("profile", "sample", "status"), "idle"),
    (("profile", "pixel_format"), "BGRA8"), (("profile", "pixel_format"), "BG\u0100A"),
    (("profile", "kind"), "windows_desktop"),
    (("profile", "host_clock", "callback_seconds"), MAX_SAFE_INTEGER + 1),
    (("profile", "sample", "presentation_time_seconds"), float("nan")),
    (("profile", "host_clock", "callback_seconds"), float("inf")),
    (("profile", "display_at_start", "rotation_degrees"), float("-inf")),
])
def test_invalid_native_numbers_units_or_pixel_claims_reject(desktop, path, value):
    set_field(desktop[2], path, value)
    with pytest.raises(ValidationError):
        validate(desktop[2])


def test_declared_artifact_and_callback_bounds_are_inclusive(desktop):
    batch, _, frame, _, binding = desktop
    frame["callback_sequence"] = MAX_SAFE_INTEGER
    frame["profile"]["display_at_start"]["display_id"] = 2**32 - 1
    for length in (1, MAX_ARTIFACT_BYTES):
        for ref in (frame["artifact"], binding["artifact"], batch["records"][0]["artifacts"][0]):
            ref["byte_length"] = length
        validate_binding(*desktop)
    # These declarations do not prove that bytes exist or match their claimed size.


def test_fourcc_retains_four_native_byte_scalars_even_when_not_ascii(desktop):
    frame = desktop[2]
    frame["profile"]["pixel_format"] = "\u0000\u007f\u0080\u00ff"
    original = deepcopy(desktop)
    validate_binding(*desktop)
    assert desktop == original
    Draft202012Validator(SCHEMA).validate(json.loads(json.dumps(frame)))


def test_all_profile_objects_are_closed_and_fields_are_required(desktop):
    frame = desktop[2]
    frame["profile"]["sample"]["content_rect"] = {"x": 0, "y": 0, "width": 0, "height": 0}
    for path in ((), ("source",), ("artifact",), ("timing",), ("profile",),
                 ("profile", "display_at_start"), ("profile", "display_at_start", "frame_points"),
                 ("profile", "host_clock"), ("profile", "sample"), ("profile", "sample", "content_rect")):
        target = frame
        for name in path:
            target = target[name]
        for omitted in target:
            changed = deepcopy(frame)
            parent = changed
            for name in path:
                parent = parent[name]
            del parent[omitted]
            with pytest.raises(ValidationError):
                validate(changed)
        changed = deepcopy(frame)
        set_field(changed, (*path, "unreleased_claim"), True)
        with pytest.raises(ValidationError):
            validate(changed)


@pytest.mark.parametrize("target,field,value", [
    (target, field, value) for target in ("frame", "record", "source", "binding")
    for field, value in (("user_id", "other-owner"), ("source_id", "other-source"), ("source_version", 2))
])
def test_exact_source_owner_and_version_bind_every_component(desktop, target, field, value):
    batch, _, frame, source, binding = desktop
    refs = {"frame": frame["source"], "record": batch["records"][0]["source"],
            "source": source, "binding": binding["source"]}
    refs[target][field] = value
    assert_rejected_unchanged(desktop)


@pytest.mark.parametrize("index", [0, 2, 3], ids=["batch", "frame", "source"])
@pytest.mark.parametrize("field", ["device_id", "session_id", "stream_id"])
def test_desktop_incarnation_cannot_be_substituted(desktop, index, field):
    desktop[index][field] = "other-incarnation"
    assert_rejected_unchanged(desktop)


@pytest.mark.parametrize("target", ["record", "binding"])
@pytest.mark.parametrize("field,value", [("artifact_id", "other-image"), ("sha256", "f" * 64),
                                         ("byte_length", 101), ("media_type", "image/jpeg")])
def test_complete_png_reference_cannot_be_substituted(desktop, target, field, value):
    ref = desktop[4]["artifact"] if target == "binding" else desktop[0]["records"][0]["artifacts"][0]
    ref[field] = value
    assert_rejected_unchanged(desktop)


@pytest.mark.parametrize("change", ["missing_id", "null_frame", "different_frame", "missing_artifact", "wrong_kind"])
def test_selected_record_and_screen_binding_are_explicit(desktop, change):
    batch, record_id, frame, source, binding = desktop
    if change == "missing_id":
        desktop = (batch, "not-in-batch", frame, source, binding)
    elif change == "null_frame":
        batch["records"][0]["frame_id"] = None
    elif change == "different_frame":
        batch["records"][0]["frame_id"] = "another-frame"
    elif change == "missing_artifact":
        batch["records"][0]["artifacts"] = []
    else:
        binding.update(kind="editable_ink")
        binding["artifact"]["media_type"] = "application/json"
    assert_rejected_unchanged(desktop)


def test_selected_record_can_be_later_and_retains_attempt_scope_and_separate_ink(desktop):
    batch, record_id, *_ = desktop
    selected = batch["records"][0]
    selected["scope"] = {"kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 3}
    selected["artifacts"].insert(0, {"artifact_id": "editable-ink", "sha256": "a" * 64,
                                       "byte_length": 10, "media_type": "application/json"})
    unrelated = deepcopy(selected)
    unrelated.update(record_id="another-record", sequence=2, frame_id=None, clock=deepcopy(CLOCK))
    batch["records"].insert(0, unrelated)
    assert batch["records"][0]["record_id"] != record_id
    original = deepcopy(desktop)
    validate_binding(*desktop)
    assert desktop == original


@pytest.mark.parametrize("change", ["duplicate_id", "duplicate_sequence", "future_parent", "artifact_conflict", "batch_limit", "dirty_rect_limit"])
def test_full_process_batch_and_metadata_limits_remain_enforced(desktop, change):
    batch, _, frame, *_ = desktop
    first = batch["records"][0]
    second = deepcopy(first)
    second.update(record_id="second-record", sequence=2, causal_parents=[first["record_id"]])
    batch["records"].append(second)
    validate_binding(*desktop)
    if change == "duplicate_id":
        second["record_id"] = first["record_id"]
    elif change == "duplicate_sequence":
        second["sequence"] = first["sequence"]
    elif change == "future_parent":
        first["causal_parents"] = [second["record_id"]]
    elif change == "artifact_conflict":
        second["artifacts"][0]["sha256"] = "b" * 64
    elif change == "batch_limit":
        batch["records"] = [{**deepcopy(first), "record_id": f"record-{i}", "sequence": i + 1} for i in range(101)]
    else:
        frame["profile"]["sample"]["dirty_rects"] = [{"x": 0, "y": 0, "width": 0, "height": 0}] * 4097
    assert_rejected_unchanged(desktop)


@pytest.mark.parametrize("reader", ["v1", "process", "control", "original", "display", "ingress", "raw", "raw_ingress"])
def test_legacy_01_through_026_readers_reject_desktop_without_conversion(desktop, reader):
    batch, record_id, frame, source, binding = desktop
    calls = {
        "v1": lambda: validate_v1("Frame", frame),
        "process": lambda: validate_record_frame(batch, record_id, frame),
        "control": lambda: validate_control("StreamRegistration", frame),
        "original": lambda: validate_capture_frame(batch, record_id, frame, binding),
        "display": lambda: validate_display_record(source, batch, record_id, frame),
        "ingress": lambda: validate_ingress("FrameBatchRequest", {"contract_version": "0.2.4", "batch": batch, "frames": [frame]}),
        "raw": lambda: validate_raw(frame),
        "raw_ingress": lambda: raw_capture_ingress.validate("RawFrameBatchRequest", {"contract_version": "0.2.6", "batch": batch, "frames": [frame]}),
    }
    original = deepcopy(desktop)
    with pytest.raises(ValidationError):
        calls[reader]()
    assert desktop == original


def test_generated_outputs_are_current_and_uint64_stays_a_typescript_string():
    Draft202012Validator.check_schema(SCHEMA)
    generated = outputs()
    assert set(generated) == {"schema.json", "contracts.ts"}
    for name, content in generated.items():
        assert (ROOT / "desktop_frame/generated" / name).read_text() == content
    assert json.loads(generated["schema.json"]) == SCHEMA
    assert "export type UInt64Decimal = string;" in generated["contracts.ts"]


def test_documented_example_preserves_explicit_synthetic_scope():
    frame = json.loads((ROOT / "desktop_frame/examples/macos-synthetic.json").read_text())
    original = deepcopy(frame)
    assert frame["profile"]["display_at_start"]["scope"] == "synthetic fixture; not a captured display"
    validate(frame)
    assert frame == original
