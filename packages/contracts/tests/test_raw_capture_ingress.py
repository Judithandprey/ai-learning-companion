"""Synthetic candidate HTTP metadata, never a server/device/transaction receipt."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import capture_frame, capture_ingress, raw_capture_ingress as wire
from packages.contracts import validate as validate_legacy
from packages.contracts.process_v2 import validate as validate_process, validate_ack as validate_process_ack
from packages.contracts.process_v2.validation import SCHEMA as PROCESS_SCHEMA
from packages.contracts.raw_capture_ingress.generate import build_document, outputs
from packages.contracts.validation import FORMATS, MAX_SAFE_INTEGER

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = json.loads((ROOT / "capture_ingress/examples.json").read_text())
NAME = "RawFrameBatchRequest"
CLOCK = {"domain_id": "callback-clock", "elapsed_ms": 1234, "uncertainty_ms": None}


def request_value(*, count=1, same_frame=False):
    value = deepcopy(EXAMPLES["FrameBatchRequest"])
    value["contract_version"] = "0.2.6"
    batch, record = value["batch"], value["batch"]["records"][0]
    record.update(observed_at=None, clock=None, media_position=None)
    frame = {
        "contract_version": "0.2.5", "kind": "raw_capture_frame", "frame_id": record["frame_id"],
        "source": deepcopy(record["source"]),
        **{key: batch[key] for key in ("device_id", "session_id", "stream_id")},
        "artifact": deepcopy(record["artifacts"][0]),
        "raw_width": 143, "raw_height": 89, "buffer_sequence": 97,
        "captured_at": None, "media_position": None,
        "timing": {"observed_at_estimate": None, "estimate_basis": None, "uncertainty_ms": None,
                   "callback_clock": None, "sample_pts_seconds": None},
        "orientation": {"system": "CGImagePropertyOrientation", "value": None, "applied_to_pixels": False},
    }
    value["frames"] = [frame]
    for number in range(2, count + 1):
        other = deepcopy(record)
        other.update(record_id=f"process-{number}", sequence=number,
                     causal_parents=[f"process-{number - 1}"])
        if not same_frame:
            other_frame = deepcopy(frame)
            other_frame["frame_id"] = other["frame_id"] = f"ingress-frame-{number}"
            value["frames"].append(other_frame)
        batch["records"].append(other)
    return value


def set_field(value, path, replacement):
    for key in path[:-1]:
        value = value[key]
    value[path[-1]] = replacement


def supplied_binding(value):
    """Explicit synthetic retained facts, supplied only to the real 0.2.5 helper."""
    upload = EXAMPLES["OriginalArtifactUpload"]
    binding = {key: deepcopy(upload[key]) for key in ("contract_version", "source", "artifact", "kind")}
    return (value["batch"], value["batch"]["records"][0]["record_id"], value["frames"][0],
            deepcopy(EXAMPLES["DisplaySourceSnapshot"]), binding)


@pytest.mark.parametrize("orientation", [None, *range(1, 9)])
def test_all_orientations_round_trip_without_mutation_or_pixel_changes(orientation):
    value = request_value()
    value["frames"][0]["orientation"]["value"] = orientation
    original = deepcopy(value)
    wire.validate_frame_batch(value, user_id="user-1")
    capture_frame.validate_binding(*supplied_binding(value))
    encoded = wire.canonical_request(NAME, value)
    assert wire.decode_request(NAME, encoded) == original == value
    assert (value["frames"][0]["raw_width"], value["frames"][0]["raw_height"]) == (143, 89)
    assert value["frames"][0]["buffer_sequence"] != value["batch"]["records"][0]["sequence"]


@pytest.mark.parametrize("with_estimate", [False, True])
@pytest.mark.parametrize("with_record_clock", [False, True])
@pytest.mark.parametrize("pts", [None, -0.125, 0, 1234.5])
def test_unknown_capture_utc_and_course_time_remain_distinct(with_estimate, with_record_clock, pts):
    value = request_value()
    frame, record = value["frames"][0], value["batch"]["records"][0]
    frame["timing"].update(callback_clock=deepcopy(CLOCK), sample_pts_seconds=pts)
    if with_estimate:
        frame["timing"].update(observed_at_estimate="2026-09-28T12:00:00.125Z",
                               estimate_basis="session_wall_plus_callback_monotonic_delta")
    if with_record_clock:
        record["clock"] = deepcopy(CLOCK)
    before = deepcopy(value)
    wire.validate(NAME, value)
    capture_frame.validate_binding(*supplied_binding(value))
    assert value == before
    assert frame["captured_at"] is record["observed_at"] is record["media_position"] is None
    assert frame["timing"]["uncertainty_ms"] is None


@pytest.mark.parametrize("path,replacement", [
    (("frames", 0, "source", "user_id"), "other-user"),
    (("frames", 0, "source", "source_id"), "other-source"),
    (("frames", 0, "source", "source_version"), 2),
    (("batch", "records", 0, "source", "user_id"), "other-user"),
    (("batch", "records", 0, "source", "source_id"), "other-source"),
    (("batch", "records", 0, "source", "source_version"), 2),
    *[((target, key), "other-incarnation") for target in ("batch",)
      for key in ("device_id", "session_id", "stream_id")],
    *[(("frames", 0, key), "other-incarnation") for key in ("device_id", "session_id", "stream_id")],
    *[(("frames", 0, "artifact", key), replacement) for key, replacement in (
        ("artifact_id", "another-original"), ("sha256", "f" * 64), ("byte_length", 99))],
    *[(("batch", "records", 0, "artifacts", 0, key), replacement) for key, replacement in (
        ("artifact_id", "another-original"), ("sha256", "f" * 64), ("byte_length", 99), ("media_type", "image/jpeg"))],
    (("batch", "records", 0, "artifacts"), []),
    (("batch", "records", 0, "observed_at"), "2026-09-28T12:00:00Z"),
    (("batch", "records", 0, "media_position"), 0),
    (("batch", "records", 0, "clock", "domain_id"), "another-clock"),
    (("batch", "records", 0, "clock", "elapsed_ms"), 1235),
    (("batch", "records", 0, "clock", "uncertainty_ms"), 0),
    (("frames", 0, "timing", "callback_clock"), None),
])
def test_local_binding_rejection_agrees_with_actual_025_helper(path, replacement):
    value = request_value()
    value["frames"][0]["timing"]["callback_clock"] = deepcopy(CLOCK)
    value["batch"]["records"][0]["clock"] = deepcopy(CLOCK)
    set_field(value, path, replacement)
    original = deepcopy(value)
    with pytest.raises(ValidationError):
        wire.validate(NAME, value)
    with pytest.raises(ValidationError):
        capture_frame.validate_binding(*supplied_binding(value))
    assert value == original


def test_pure_membership_does_not_manufacture_or_claim_retained_authority():
    value = request_value()
    for owner in (value["frames"][0]["source"], value["batch"]["records"][0]["source"]):
        owner["source_id"] = "consistent-but-not-retained"
    wire.validate(NAME, value)
    with pytest.raises(ValidationError):
        capture_frame.validate_binding(*supplied_binding(value))
    with pytest.raises(ValidationError):
        wire.validate_frame_batch(value, user_id="other-user")


@pytest.mark.parametrize("path,replacement", [
    (("contract_version",), "0.2.4"), (("batch", "contract_version"), "0.2.6"),
    (("frames", 0, "contract_version"), "0.2.6"), (("frames", 0, "kind"), "Frame"),
    (("frames", 0, "captured_at"), "2026-09-28T12:00:00Z"), (("frames", 0, "media_position"), 0),
    (("frames", 0, "raw_width"), 0), (("frames", 0, "raw_height"), True),
    (("frames", 0, "buffer_sequence"), MAX_SAFE_INTEGER + 1),
    (("frames", 0, "source", "source_version"), True),
    (("frames", 0, "artifact", "byte_length"), 0),
    (("frames", 0, "artifact", "byte_length"), 32 * 1024 * 1024 + 1),
    (("frames", 0, "artifact", "media_type"), "image/jpeg"),
    (("frames", 0, "orientation", "value"), 0), (("frames", 0, "orientation", "value"), 9),
    (("frames", 0, "orientation", "value"), True),
    (("frames", 0, "orientation", "applied_to_pixels"), True),
    (("frames", 0, "timing", "observed_at_estimate"), "2026-09-28T12:00:00Z"),
    (("frames", 0, "timing", "estimate_basis"), "session_wall_plus_callback_monotonic_delta"),
    (("frames", 0, "timing", "uncertainty_ms"), 0),
    (("frames", 0, "timing", "sample_pts_seconds"), True),
    (("frames", 0, "timing", "sample_pts_seconds"), float("nan")),
    (("frames", 0, "timing", "sample_pts_seconds"), float("inf")),
    (("frames", 0, "timing", "sample_pts_seconds"), float("-inf")),
])
def test_malformed_versions_and_raw_shapes_fail_closed(path, replacement):
    value = request_value()
    set_field(value, path, replacement)
    with pytest.raises(ValidationError):
        wire.validate(NAME, value)


def test_every_wrapper_and_raw_field_is_required_and_objects_are_closed():
    value = request_value()
    value["frames"][0]["timing"]["callback_clock"] = deepcopy(CLOCK)
    for path in ((), ("frames", 0), ("frames", 0, "source"), ("frames", 0, "artifact"),
                 ("frames", 0, "orientation"), ("frames", 0, "timing"),
                 ("frames", 0, "timing", "callback_clock")):
        parent = value
        for key in path:
            parent = parent[key]
        for field in parent:
            changed = deepcopy(value)
            target = changed
            for key in path:
                target = target[key]
            del target[field]
            with pytest.raises(ValidationError):
                wire.validate(NAME, changed)
        changed = deepcopy(value)
        set_field(changed, (*path, "authority"), True)
        with pytest.raises(ValidationError):
            wire.validate(NAME, changed)


@pytest.mark.parametrize("change", ["empty", "duplicate", "extra", "missing"])
def test_frames_exactly_exhaust_named_ids(change):
    value = request_value()
    if change == "empty":
        value["frames"] = []
    elif change == "missing":
        value["batch"]["records"][0]["frame_id"] = "missing-frame"
    else:
        extra = deepcopy(value["frames"][0])
        if change == "extra":
            extra["frame_id"] = "unreferenced-frame"
        value["frames"].append(extra)
    with pytest.raises(ValidationError):
        wire.validate(NAME, value)


def test_whole_batch_checked_once_and_frame_limit_is_inclusive():
    value = request_value(count=100)
    with patch.object(wire, "validate_process", wraps=validate_process) as checked:
        wire.validate(NAME, value)
    assert [call.args[0] for call in checked.call_args_list] == ["ProcessBatch"]
    with pytest.raises(ValidationError):
        wire.validate(NAME, request_value(count=101))


def test_shared_frames_frameless_members_attempts_and_extra_references_are_not_rewritten():
    value = request_value(count=2, same_frame=True)
    wire.validate(NAME, value)
    second = value["batch"]["records"][1]
    second.update(frame_id=None, artifacts=[], scope={"kind": "attempt", "problem_id": "problem-1",
                                                   "attempt_id": "attempt-1", "relation_revision": 2})
    value["batch"]["records"][0]["artifacts"].append({"artifact_id": "separate-editable-ink",
        "sha256": "c" * 64, "byte_length": 42, "media_type": "application/json"})
    original = deepcopy(value)
    wire.validate(NAME, value)
    assert value == original
    # Stored shared-display source/attempt authority is not supplied here. The
    # Backend still rejects unsupported_source/dependency_missing respectively.
    second["source"]["user_id"] = "another-user"
    with pytest.raises(ValidationError):
        wire.validate_frame_batch(value, user_id="user-1")


def test_observed_gap_remains_explicit_without_manufacturing_missing_frames():
    value = request_value(count=2)
    second = value["batch"]["records"][1]
    second.update(sequence=3, evidence={"kind": "coverage", "coverage": "partial",
        "from_clock_ms": None, "through_clock_ms": None,
        "missing_sequences": [{"first": 2, "last": 2}], "limitations": ["missing_events"]})
    original = deepcopy(value)
    wire.validate(NAME, value)
    assert value == original
    assert len(value["frames"]) == 2


@pytest.mark.parametrize("change", ["future_parent", "artifact_conflict", "duplicate_record",
                                   "duplicate_sequence", "present_gap"])
def test_complete_batch_causality_gaps_and_artifact_conflicts_are_preserved(change):
    value = request_value(count=2)
    first, second = value["batch"]["records"]
    if change == "future_parent":
        first["causal_parents"] = [second["record_id"]]
    elif change == "artifact_conflict":
        second["artifacts"][0]["byte_length"] += 1
        value["frames"][1]["artifact"]["byte_length"] += 1
    elif change == "duplicate_record":
        second["record_id"] = first["record_id"]
    elif change == "duplicate_sequence":
        second["sequence"] = first["sequence"]
    else:
        second["evidence"] = {"kind": "coverage", "coverage": "partial",
            "from_clock_ms": None, "through_clock_ms": None,
            "missing_sequences": [{"first": 1, "last": 1}], "limitations": ["missing_events"]}
    # Each negative has valid wire shapes: only complete batch semantics reject.
    Draft202012Validator(wire.SCHEMA, format_checker=FORMATS).validate(value)
    with pytest.raises(ValidationError):
        wire.validate(NAME, value)


def test_ordered_http_envelope_includes_all_fields_and_preserves_input():
    value = request_value(count=2)
    value["batch"]["records"][0]["artifacts"].append({"artifact_id": "ink",
        "sha256": "c" * 64, "byte_length": 42, "media_type": "application/json"})
    original = deepcopy(value)
    encoded = wire.canonical_request(NAME, value)
    assert wire.canonical_request(NAME, dict(reversed(list(value.items())))) == encoded
    for change in ("frame_order", "record_order", "artifact_order", "batch_id", "delivery_mode", "raw_orientation"):
        changed = deepcopy(value)
        if change == "frame_order":
            changed["frames"].reverse()
        elif change == "record_order":
            changed["batch"]["records"].reverse()
        elif change == "artifact_order":
            changed["batch"]["records"][0]["artifacts"].reverse()
        elif change == "batch_id":
            changed["batch"]["batch_id"] = "another-envelope"
        elif change == "delivery_mode":
            changed["batch"]["delivery_mode"] = "live"
        else:
            changed["frames"][0]["orientation"]["value"] = 1
        assert wire.canonical_request(NAME, changed) != encoded
    assert value == original


@pytest.mark.parametrize("data", [b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}',
    b'{"x":-Infinity}', b'{"x":1e400}', b'\xff', b'{', b'[]', b'null', b'"\\ud800"',
    b'[' * 70 + b'0' + b']' * 70, bytearray(b'{}'), memoryview(b'{}'), '{}'])
def test_strict_immutable_json_rejects_malformed_or_nonfinite_input(data):
    with pytest.raises(ValidationError):
        wire.decode_request(NAME, data)


def test_duplicate_nested_members_and_unsafe_integer_wire_values_fail():
    encoded = wire.canonical_request(NAME, request_value())
    for changed in (encoded.replace(b'"raw_width":143', b'"raw_width":143,"raw_width":144'),
                    encoded.replace(b'"raw_width":143', b'"raw_width":9007199254740993')):
        with pytest.raises(ValidationError):
            wire.decode_request(NAME, changed)


def test_raw_and_canonical_metadata_limits_and_non_json_values():
    encoded = wire.canonical_request(NAME, request_value())
    limit = wire.MAX_METADATA_BODY_BYTES
    assert limit == wire.body_limit(NAME) == 4_194_304
    assert wire.decode_request(NAME, encoded + b' ' * (limit - len(encoded))) == request_value()
    with pytest.raises(ValidationError):
        wire.decode_request(NAME, encoded + b' ' * (limit + 1 - len(encoded)))
    value = request_value(count=43, same_frame=True)
    for record in value["batch"]["records"]:
        record["evidence"]["before"] = {"kind": "text", "text": "x" * 100_000}
    Draft202012Validator(wire.SCHEMA, format_checker=FORMATS).validate(value)
    with pytest.raises(ValidationError, match="bounded transport size"):
        wire.validate(NAME, value)
    for bad in (object(), "\ud800", 2**54):
        changed = request_value()
        changed["frames"][0]["timing"]["sample_pts_seconds"] = bad
        with pytest.raises(ValidationError):
            wire.validate(NAME, changed)


def test_ack_uses_declared_synthetic_verified_refs_without_claiming_commit():
    batch = request_value()["batch"]
    ack = deepcopy(EXAMPLES["ProcessBatchAck"])
    ref = EXAMPLES["OriginalArtifactUpload"]["artifact"]
    verified = frozenset({tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))})
    original = deepcopy((batch, ack))
    wire.validate_ack(batch, ack, user_id="user-1", verified_artifacts=verified)
    assert (batch, ack) == original
    with pytest.raises(ValidationError):
        wire.validate_ack(batch, ack, user_id="user-1")
    ack["acknowledged"][0]["artifacts"][0]["status"] = "pending"
    validate_process_ack(batch, ack, user_id="user-1")
    with pytest.raises(ValidationError):
        wire.validate_ack(batch, ack, user_id="user-1", verified_artifacts=verified)


@pytest.mark.parametrize("code", [code for codes in capture_ingress.ERROR_CODES.values() for code in codes])
def test_closed_errors_reuse_codes_and_restrict_retries(code):
    error = {"contract_version": "0.2.6", "error": code, "retryable": False}
    wire.validate("RawIngressError", error)
    error["retryable"] = True
    if code in {"unavailable", "dependency_missing"}:
        wire.validate("RawIngressError", error)
    else:
        with pytest.raises(ValidationError):
            wire.validate("RawIngressError", error)
    error.update(retryable=False, message="original private content")
    with pytest.raises(ValidationError):
        wire.validate("RawIngressError", error)


@pytest.mark.parametrize("error", [
    {"contract_version": "0.2.4", "error": "unavailable", "retryable": True},
    {"contract_version": "0.2.6", "error": "arbitrary_internal_failure", "retryable": False},
    {"contract_version": "0.2.6", "error": "unavailable"},
    {"contract_version": "0.2.6", "error": "unavailable", "retryable": "yes"},
])
def test_error_version_and_members_remain_closed(error):
    with pytest.raises(ValidationError):
        wire.validate("RawIngressError", error)


def test_old_reader_rejects_raw_shape_and_new_wrapper_without_fallback():
    value = request_value()
    with pytest.raises(ValidationError):
        capture_ingress.validate("FrameBatchRequest", value)
    value["contract_version"] = "0.2.4"
    with pytest.raises(ValidationError):
        capture_ingress.validate("FrameBatchRequest", value)
    with pytest.raises(ValidationError):
        validate_legacy("Frame", value["frames"][0])
    old = deepcopy(EXAMPLES["FrameBatchRequest"])
    old["contract_version"] = "0.2.6"
    with pytest.raises(ValidationError):
        wire.validate(NAME, old)


def test_generated_schema_types_openapi_and_released_definitions_match():
    Draft202012Validator.check_schema(wire.SCHEMA)
    Draft202012Validator(wire.SCHEMA, format_checker=FORMATS).validate(request_value())
    for schema in (PROCESS_SCHEMA, capture_frame.SCHEMA):
        for name, shape in schema["$defs"].items():
            assert wire.SCHEMA["$defs"][name] == shape
            assert wire.SCHEMA["$defs"][name] is not shape
    assert wire.ERROR_CODES == capture_ingress.ERROR_CODES
    assert set(outputs()) == {"schema.json", "contracts.ts", "openapi.json"}
    for name, content in outputs().items():
        assert (ROOT / "raw_capture_ingress/generated" / name).read_text() == content
    document = build_document()
    assert document["info"]["version"] == "0.2.6"
    assert set(document["paths"]) == {"/v2/process/raw-frames:batch"}
    operation = document["paths"]["/v2/process/raw-frames:batch"]["post"]
    assert operation["x-required-scopes"] == ["process:capture"]
    assert operation["x-required-capabilities"] == [wire.CAPABILITY, "process.capture.v0.2"]
    assert operation["x-max-body-bytes"] == wire.MAX_METADATA_BODY_BYTES
    assert operation["parameters"] == [{"$ref": "#/components/parameters/IdempotencyKey"}]
    assert operation["requestBody"] == {"required": True, "content": {"application/json": {
        "schema": {"$ref": "#/components/schemas/RawFrameBatchRequest"}}}}
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ProcessBatchAck"}
    assert set(operation["responses"]) == {"200", *wire.ERROR_CODES}
    assert document["security"] == [{"BearerAuth": []}]
    parameter = document["components"]["parameters"]["IdempotencyKey"]
    assert (parameter["name"], parameter["in"], parameter["required"]) == ("Idempotency-Key", "header", True)
    for key in ("", "contains space", "key\n", "key\r", "x" * 129, None, 1):
        with pytest.raises(ValidationError):
            wire.validate("IdempotencyKey", key)
    wire.validate("IdempotencyKey", "raw-request-1")
    schemas = document["components"]["schemas"]
    def check_refs(value):
        if isinstance(value, dict):
            if "$ref" in value:
                prefix, name = value["$ref"].rsplit("/", 1)
                assert prefix in {"#/components/schemas", "#/components/parameters"}
                assert name in (schemas if prefix.endswith("schemas") else document["components"]["parameters"])
            for nested in value.values():
                check_refs(nested)
        elif isinstance(value, list):
            for nested in value:
                check_refs(nested)
    check_refs(document)


def test_released_generated_bytes_010_through_025_stay_frozen():
    pins = {
        "v1": "84f5ba5f12b9abf903816cb655cb5e5c54034c8ef6ec8856a27535cb6f164853",
        "process_v2": "6a847792c062620a3429166878a5a5c418acb3507746f5eb75400397d0a58f9d",
        "process_control": "e399f3ed34dc3a1fbedba303809acc2c85aedb4be814bff6f79f4add3f44ab53",
        "original_artifact": "48f529f5fae4789a75dbf8d3de89a2f6f0954ccc2598582b3a526812bded10a9",
        "display_source": "5f8ef24cb746b2bf67b40e74a8709a46daab33df57e9e159e62b54ee66f7cd7a",
        "capture_ingress": "6df57409a444ddee06e0cd259e20c9502b1ea47042c135e46ee3b662ccc90bfb",
        "capture_frame": "e53896e21f901dffd3d8b3aa86676156878b1f483f5d2759c9f37f9b2cb544e2",
    }
    for family, expected in pins.items():
        folder = ROOT / ("" if family == "v1" else family) / "generated"
        digest = hashlib.sha256()
        for path in sorted(folder.iterdir()):
            if path.is_file():
                digest.update(path.name.encode() + b"\0" + path.read_bytes())
        assert digest.hexdigest() == expected, family
