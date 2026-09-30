"""Candidate metadata only: no native capture, byte decoding, or authority proof."""

from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import validate as validate_v1
from packages.contracts.capture_frame import CONTRACT_VERSION, SCHEMA, validate, validate_binding
from packages.contracts.capture_frame.generate import outputs
from packages.contracts.capture_ingress import validate as validate_ingress
from packages.contracts.display_source import validate as validate_display, validate_display_record
from packages.contracts.original_artifact import (
    MAX_ARTIFACT_BYTES, validate as validate_original, validate_capture_frame,
)
from packages.contracts.process_v2 import validate as validate_process, validate_record_frame
from packages.contracts.process_v2.validation import SCHEMA as PROCESS_SCHEMA
from packages.contracts.tests.test_display_source import display, observation
from packages.contracts.validation import MAX_SAFE_INTEGER

ROOT = Path(__file__).parents[1]
ESTIMATE_BASIS = "session_wall_plus_callback_monotonic_delta"
CLOCK = {"domain_id": "callback-clock-1", "elapsed_ms": 1234, "uncertainty_ms": None}


@pytest.fixture
def proposal(display, observation):
    batch, record_id, old_frame = observation
    record = batch["records"][0]
    record.update(observed_at=None, media_position=None, clock=None)
    frame = {
        "contract_version": "0.2.5", "kind": "raw_capture_frame", "frame_id": old_frame["frame_id"],
        "source": deepcopy(record["source"]),
        **{field: batch[field] for field in ("device_id", "session_id", "stream_id")},
        "artifact": deepcopy(record["artifacts"][0]),
        "raw_width": 143, "raw_height": 89, "buffer_sequence": 97,
        "captured_at": None, "media_position": None,
        "timing": {"observed_at_estimate": None, "estimate_basis": None, "uncertainty_ms": None,
                   "callback_clock": None, "sample_pts_seconds": None},
        "orientation": {"system": "CGImagePropertyOrientation", "value": None,
                        "applied_to_pixels": False},
    }
    binding = {"contract_version": "0.2.2", "source": deepcopy(record["source"]),
               "kind": "screen_image", "artifact": deepcopy(frame["artifact"])}
    return batch, record_id, frame, display, binding


def set_field(value, path, replacement):
    for part in path[:-1]:
        value = value[part]
    value[path[-1]] = replacement


def test_unknowns_and_independent_buffer_sequence_are_preserved(proposal):
    original = deepcopy(proposal)
    batch, _, frame, _, _ = proposal
    assert CONTRACT_VERSION == "0.2.5"
    assert validate(frame) is None
    assert validate_binding(*proposal) is None
    assert frame["buffer_sequence"] != batch["records"][0]["sequence"]
    assert frame["captured_at"] is frame["media_position"] is None
    assert all(value is None for value in frame["timing"].values())
    assert proposal == original


@pytest.mark.parametrize("orientation", [None, 1, 2, 3, 4, 5, 6, 7, 8])
def test_all_raw_orientations_keep_pixels_dimensions_and_hash_unmodified(proposal, orientation):
    frame = proposal[2]
    frame["orientation"]["value"] = orientation
    original = deepcopy(proposal)
    assert validate_binding(*proposal) is None
    assert proposal == original
    assert (frame["raw_width"], frame["raw_height"]) == (143, 89)
    assert frame["orientation"]["applied_to_pixels"] is False


def test_unknown_orientation_is_distinct_from_declared_upright(proposal):
    unknown = proposal[2]
    upright = deepcopy(unknown)
    upright["orientation"]["value"] = 1
    validate(unknown)
    validate(upright)
    assert unknown != upright
    assert unknown["orientation"]["value"] is None


@pytest.mark.parametrize("with_estimate", [False, True])
@pytest.mark.parametrize("with_record_clock", [False, True])
def test_callback_estimate_does_not_become_capture_utc_or_course_time(
    proposal, with_estimate, with_record_clock,
):
    batch, _, frame, _, _ = proposal
    frame["timing"].update(callback_clock=deepcopy(CLOCK), sample_pts_seconds=-0.125)
    if with_estimate:
        frame["timing"].update(observed_at_estimate="2026-09-28T12:00:00.125Z", estimate_basis=ESTIMATE_BASIS)
    if with_record_clock:
        batch["records"][0]["clock"] = deepcopy(CLOCK)
    original = deepcopy(proposal)
    assert validate_binding(*proposal) is None
    assert proposal == original
    assert batch["records"][0]["observed_at"] is None
    assert batch["records"][0]["media_position"] is None
    assert frame["captured_at"] is None
    assert frame["timing"]["uncertainty_ms"] is None


@pytest.mark.parametrize("pts", [None, -1.5, 0, 0.125, 1e100])
def test_sample_pts_is_a_finite_sample_timestamp_not_a_playhead(proposal, pts):
    frame = proposal[2]
    frame["timing"]["sample_pts_seconds"] = pts
    original = deepcopy(frame)
    assert validate(frame) is None
    assert frame == original
    assert frame["media_position"] is None


@pytest.mark.parametrize("path,value", [
    (("contract_version",), "0.2.4"), (("kind",), "Frame"), (("frame_id",), ""),
    (("device_id",), None), (("session_id",), False), (("stream_id",), ""),
    (("source", "source_version"), True), (("source", "source_version"), 0),
    (("source", "user_id"), ""), (("source", "source_id"), ""),
    (("raw_width",), 0), (("raw_width",), True), (("raw_width",), MAX_SAFE_INTEGER + 1),
    (("raw_height",), -1), (("raw_height",), False), (("raw_height",), 1.5),
    (("buffer_sequence",), 0), (("buffer_sequence",), True),
    (("buffer_sequence",), MAX_SAFE_INTEGER + 1),
    (("captured_at",), "2026-09-29T12:00:00Z"), (("media_position",), 0),
    (("artifact", "byte_length"), 0), (("artifact", "byte_length"), True),
    (("artifact", "byte_length"), MAX_ARTIFACT_BYTES + 1),
    (("artifact", "media_type"), "image/jpeg"), (("artifact", "sha256"), "not-a-hash"),
    (("orientation", "system"), "degrees"), (("orientation", "value"), 0),
    (("orientation", "value"), 9), (("orientation", "value"), True),
    (("orientation", "value"), 1.5), (("orientation", "applied_to_pixels"), True),
    (("orientation", "applied_to_pixels"), 0),
    (("timing", "uncertainty_ms"), 0), (("timing", "sample_pts_seconds"), True),
    (("timing", "sample_pts_seconds"), "1.25"), (("timing", "sample_pts_seconds"), float("nan")),
    (("timing", "sample_pts_seconds"), float("inf")),
    (("timing", "sample_pts_seconds"), float("-inf")),
])
def test_invalid_raw_metadata_rejected(proposal, path, value):
    frame = proposal[2]
    set_field(frame, path, value)
    with pytest.raises(ValidationError):
        validate(frame)


def test_declared_safe_integer_and_png_limits_are_inclusive(proposal):
    frame = proposal[2]
    frame.update(raw_width=MAX_SAFE_INTEGER, raw_height=1, buffer_sequence=MAX_SAFE_INTEGER)
    for length in (1, MAX_ARTIFACT_BYTES):
        frame["artifact"]["byte_length"] = length
        proposal[0]["records"][0]["artifacts"][0]["byte_length"] = length
        proposal[4]["artifact"]["byte_length"] = length
        assert validate_binding(*proposal) is None
    # Declared dimensions do not attest that any stored PNG has these dimensions.


@pytest.mark.parametrize("change", [
    "missing_basis", "missing_clock", "basis_without_estimate", "other_basis",
    "invalid_date", "non_utc", "known_error", "boolean_elapsed", "negative_elapsed", "empty_domain",
])
def test_timing_never_upgrades_an_estimate_or_unknown_error(proposal, change):
    timing = proposal[2]["timing"]
    timing.update(observed_at_estimate="2026-09-28T12:00:00Z", estimate_basis=ESTIMATE_BASIS,
                  callback_clock=deepcopy(CLOCK))
    if change == "missing_basis":
        timing["estimate_basis"] = None
    elif change == "missing_clock":
        timing["callback_clock"] = None
    elif change == "basis_without_estimate":
        timing["observed_at_estimate"] = None
    elif change == "other_basis":
        timing["estimate_basis"] = "exact_pixel_capture"
    elif change == "invalid_date":
        timing["observed_at_estimate"] = "2026-02-30T12:00:00Z"
    elif change == "non_utc":
        timing["observed_at_estimate"] = "2026-09-28T12:00:00+01:00"
    elif change == "known_error":
        timing["callback_clock"]["uncertainty_ms"] = 0
    elif change == "boolean_elapsed":
        timing["callback_clock"]["elapsed_ms"] = True
    elif change == "negative_elapsed":
        timing["callback_clock"]["elapsed_ms"] = -1
    else:
        timing["callback_clock"]["domain_id"] = ""
    with pytest.raises(ValidationError):
        validate(proposal[2])


def test_every_object_is_closed_and_every_field_required(proposal):
    frame = proposal[2]
    frame["timing"]["callback_clock"] = deepcopy(CLOCK)
    for path in ((), ("source",), ("artifact",), ("timing",), ("orientation",),
                 ("timing", "callback_clock")):
        target = frame
        for part in path:
            target = target[part]
        for field in target:
            changed = deepcopy(frame)
            parent = changed
            for part in path:
                parent = parent[part]
            del parent[field]
            with pytest.raises(ValidationError):
                validate(changed)
        changed = deepcopy(frame)
        set_field(changed, (*path, "unreleased_claim"), True)
        with pytest.raises(ValidationError):
            validate(changed)


@pytest.mark.parametrize("claim", ["live_capture_allowed", "coverage", "presentation_permission", "text", "app_id"])
def test_descriptor_cannot_carry_authority_or_invented_observations(proposal, claim):
    proposal[2][claim] = "client-assertion"
    with pytest.raises(ValidationError):
        validate(proposal[2])


@pytest.mark.parametrize("change", ["surrogate", "non_json", "deep_nesting"])
def test_non_utf8_non_json_and_excessive_nesting_fail_closed(proposal, change):
    frame = proposal[2]
    if change == "surrogate":
        frame["frame_id"] = "invalid-\ud800"
    elif change == "non_json":
        frame["timing"]["sample_pts_seconds"] = object()
    else:
        value = None
        for _ in range(70):
            value = [value]
        frame["timing"]["sample_pts_seconds"] = value
    with pytest.raises(ValidationError):
        validate(frame)


@pytest.mark.parametrize("target", ["frame", "record", "source", "binding"])
@pytest.mark.parametrize("field,value", [
    ("user_id", "other-user"), ("source_id", "other-source"), ("source_version", 2),
])
def test_individually_valid_identity_must_match_every_binding(proposal, target, field, value):
    batch, _, frame, source, binding = proposal
    refs = {"frame": frame["source"], "record": batch["records"][0]["source"],
            "source": source, "binding": binding["source"]}
    refs[target][field] = value
    validate(frame)
    validate_process("ProcessBatch", batch)
    validate_display(source)
    validate_original("OriginalArtifactBinding", binding)
    original = deepcopy(proposal)
    with pytest.raises(ValidationError):
        validate_binding(*proposal)
    assert proposal == original


@pytest.mark.parametrize("index", [0, 2, 3], ids=["batch", "frame", "source"])
@pytest.mark.parametrize("field", ["device_id", "session_id", "stream_id"])
def test_capture_incarnation_cannot_be_substituted(proposal, index, field):
    proposal[index][field] = "another-incarnation"
    original = deepcopy(proposal)
    with pytest.raises(ValidationError):
        validate_binding(*proposal)
    assert proposal == original


@pytest.mark.parametrize("target", ["record", "binding"])
@pytest.mark.parametrize("field,value", [
    ("artifact_id", "other-image"), ("sha256", "b" * 64),
    ("byte_length", 101), ("media_type", "image/jpeg"),
])
def test_complete_artifact_reference_is_required(proposal, target, field, value):
    batch, _, _, _, binding = proposal
    artifact = binding["artifact"] if target == "binding" else batch["records"][0]["artifacts"][0]
    artifact[field] = value
    validate_process("ProcessBatch", batch)
    validate_original("OriginalArtifactBinding", binding)
    original = deepcopy(proposal)
    with pytest.raises(ValidationError):
        validate_binding(*proposal)
    assert proposal == original


@pytest.mark.parametrize("change", ["frame_id", "null_frame", "missing_artifact", "wrong_kind"])
def test_requested_frame_and_screen_original_cannot_be_inferred(proposal, change):
    record = proposal[0]["records"][0]
    if change == "frame_id":
        record["frame_id"] = "other-frame"
    elif change == "null_frame":
        record["frame_id"] = None
    elif change == "missing_artifact":
        record["artifacts"] = []
    else:
        proposal[4].update(kind="editable_ink")
        proposal[4]["artifact"]["media_type"] = "application/json"
        validate_original("OriginalArtifactBinding", proposal[4])
    with pytest.raises(ValidationError):
        validate_binding(*proposal)


@pytest.mark.parametrize("record_id", [None, True, "", "not-in-batch"])
def test_record_selection_is_explicit_and_valid(proposal, record_id):
    batch, _, frame, source, binding = proposal
    with pytest.raises(ValidationError):
        validate_binding(batch, record_id, frame, source, binding)


@pytest.mark.parametrize("change", ["observed_at", "media_position", "clock_domain", "clock_elapsed", "clock_error", "no_callback"])
def test_selected_record_cannot_promote_time_or_change_callback_clock(proposal, change):
    record, timing = proposal[0]["records"][0], proposal[2]["timing"]
    record["clock"] = deepcopy(CLOCK)
    timing["callback_clock"] = deepcopy(CLOCK)
    if change == "observed_at":
        record["observed_at"] = "2026-09-28T12:00:00Z"
    elif change == "media_position":
        record["media_position"] = 0
    elif change == "clock_domain":
        record["clock"]["domain_id"] = "another-clock"
    elif change == "clock_elapsed":
        record["clock"]["elapsed_ms"] += 1
    elif change == "clock_error":
        record["clock"]["uncertainty_ms"] = 0
    else:
        timing["callback_clock"] = None
    validate_process("ProcessBatch", proposal[0])
    original = deepcopy(proposal)
    with pytest.raises(ValidationError):
        validate_binding(*proposal)
    assert proposal == original


def test_existing_attempt_scope_and_separate_ink_survive_without_an_authority_claim(proposal):
    record = proposal[0]["records"][0]
    record["scope"] = {"kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 3}
    record["artifacts"].insert(0, {"artifact_id": "editable-original-ink", "sha256": "c" * 64,
                                   "byte_length": 42, "media_type": "application/json"})
    original = deepcopy(proposal)
    assert validate_binding(*proposal) is None
    assert proposal == original
    # Supplied relation and extra ink still need independent service-side authority/binding.


@pytest.mark.parametrize("change", ["duplicate_record", "duplicate_sequence", "future_parent", "conflicting_artifact", "visual_internal_operation"])
def test_selected_binding_keeps_whole_batch_process_invariants(proposal, change):
    batch = proposal[0]
    first = batch["records"][0]
    second = deepcopy(first)
    second.update(record_id="process-2", sequence=2, causal_parents=[first["record_id"]])
    batch["records"].append(second)
    assert validate_binding(*proposal) is None
    if change == "duplicate_record":
        second["record_id"] = first["record_id"]
    elif change == "duplicate_sequence":
        second["sequence"] = first["sequence"]
    elif change == "future_parent":
        first["causal_parents"] = [second["record_id"]]
    elif change == "conflicting_artifact":
        second["artifacts"][0]["byte_length"] += 1
    else:
        second["method"] = "visual"
    original = deepcopy(proposal)
    with pytest.raises(ValidationError):
        validate_binding(*proposal)
    assert proposal == original


@pytest.mark.parametrize("component", [0, 3, 4], ids=["process_batch", "display_source", "original_binding"])
def test_nested_released_contract_versions_are_not_coerced(proposal, component):
    proposal[component]["contract_version"] = CONTRACT_VERSION
    with pytest.raises(ValidationError):
        validate_binding(*proposal)


@pytest.mark.parametrize("reader", ["v1", "process_v2", "original_artifact", "display_source", "capture_ingress"])
def test_existing_readers_reject_candidate_without_implicit_conversion(proposal, reader):
    batch, record_id, frame, source, binding = proposal
    original = deepcopy(proposal)
    with pytest.raises(ValidationError):
        if reader == "v1":
            validate_v1("Frame", frame)
        elif reader == "process_v2":
            validate_record_frame(batch, record_id, frame)
        elif reader == "original_artifact":
            validate_capture_frame(batch, record_id, frame, binding)
        elif reader == "display_source":
            validate_display_record(source, batch, record_id, frame)
        else:
            validate_ingress("FrameBatchRequest", {"contract_version": "0.2.4", "batch": batch, "frames": [frame]})
    assert proposal == original


def test_legacy_frame_is_not_a_raw_descriptor(observation):
    old_frame = observation[2]
    validate_v1("Frame", old_frame)
    with pytest.raises(ValidationError):
        validate(old_frame)


def test_generated_outputs_match_and_reuse_existing_identity_primitives():
    Draft202012Validator.check_schema(SCHEMA)
    for name in ("Identifier", "UtcTimestamp", "SourceRef"):
        assert SCHEMA["$defs"][name] == PROCESS_SCHEMA["$defs"][name]
        assert SCHEMA["$defs"][name] is not PROCESS_SCHEMA["$defs"][name]
    generated = outputs()
    assert set(generated) == {"schema.json", "contracts.ts"}
    for name, expected in generated.items():
        assert (ROOT / "capture_frame/generated" / name).read_text() == expected
    assert json.loads(generated["schema.json"]) == SCHEMA
