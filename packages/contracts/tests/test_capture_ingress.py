"""Pure 0.2.4 transport checks, not HTTP/DB/producer/provider acceptance."""

import base64
from copy import deepcopy
import hashlib
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import original_artifact
from packages.contracts.capture_ingress import (
    CAPABILITY, MAX_METADATA_BODY_BYTES, MAX_UPLOAD_BODY_BYTES, SCHEMA,
    canonical_request, decode_request, validate, validate_frame_batch,
    validate_original_read, validate_registration, validate_upload,
)
from packages.contracts.capture_ingress.generate import build_document, outputs
from packages.contracts.display_source import SCHEMA as DISPLAY_SCHEMA, validate_display_record
from packages.contracts.process_v2 import validate_ack
from packages.contracts.process_v2.validation import SCHEMA as PROCESS_SCHEMA
from packages.contracts.validation import SCHEMA as LEGACY_SCHEMA

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = json.loads((ROOT / "capture_ingress/examples.json").read_text())


def example(name="FrameBatchRequest"):
    return deepcopy(EXAMPLES[name])


@pytest.mark.parametrize("name", list(EXAMPLES))
def test_examples_preserve_nested_released_versions(name):
    value = example(name)
    original = deepcopy(value)
    validate(name, value)
    assert value == original
    if name in {"FrameBatchRequest", "DisplaySourceRegistration", "OriginalArtifactUpload"}:
        assert decode_request(name, canonical_request(name, value)) == value


def test_real_binding_helpers_and_existing_verified_ack_compose():
    request = example()
    source = request["batch"]["records"][0]["source"]
    frame = request["frames"][0]
    validate_registration(example("DisplaySourceRegistration"), source_id=source["source_id"])
    validate_frame_batch(request, user_id=source["user_id"])
    validate_display_record(example("DisplaySourceSnapshot"), request["batch"], "process-1", frame)
    upload = example("OriginalArtifactUpload")
    data = validate_upload(upload, artifact_id=frame["artifact_id"], user_id=source["user_id"])
    assert data == base64.b64decode(upload["data_base64"])
    assert validate_original_read(upload, **source, artifact_id=frame["artifact_id"]) == data
    ref = upload["artifact"]
    verified = frozenset({tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))})
    validate_ack(request["batch"], example("ProcessBatchAck"), user_id=source["user_id"], verified_artifacts=verified)
    with pytest.raises(ValidationError):
        validate_ack(request["batch"], example("ProcessBatchAck"), user_id=source["user_id"])


@pytest.mark.parametrize("name,field", [
    ("DisplaySourceRegistration", "producer_id"), ("DisplaySourceRegistration", "user_id"),
    ("DisplaySourceRegistration", "authorization_generation"), ("DisplaySourceRegistration", "capability"),
    ("DisplaySourceRegistration", "created_at"), ("FrameBatchRequest", "authority"),
    ("FrameBatchRequest", "producer_id"), ("OriginalArtifactUpload", "live_capture_allowed"),
])
def test_no_request_can_carry_a_grant_or_extra_authority(name, field):
    value = example(name)
    value[field] = "client-assertion"
    with pytest.raises(ValidationError):
        validate(name, value)


@pytest.mark.parametrize("path,value", [
    (("contract_version",), "0.2.0"), (("batch", "contract_version"), "0.2.4"),
    (("frames",), []), (("frames", 0, "source_version"), True),
    (("frames", 0, "source_id"), "another-source"), (("frames", 0, "user_id"), "another-user"),
    (("frames", 0, "device_id"), "another-device"), (("frames", 0, "session_id"), "another-session"),
    (("frames", 0, "media_position"), 1), (("frames", 0, "artifact_id"), "another-artifact"),
    (("frames", 0, "content_hash"), "f" * 64), (("frames", 0, "representation"), "dom_snapshot"),
    (("batch", "records", 0, "artifacts", 0, "media_type"), "application/json"),
    (("batch", "records", 0, "artifacts", 0, "byte_length"), 0),
    (("batch", "records", 0, "artifacts", 0, "byte_length"), original_artifact.MAX_ARTIFACT_BYTES + 1),
])
def test_invalid_frame_original_composition_is_rejected(path, value):
    request = example()
    target = request
    for field in path[:-1]:
        target = target[field]
    target[path[-1]] = value
    with pytest.raises(ValidationError):
        validate("FrameBatchRequest", request)


@pytest.mark.parametrize("change", ["duplicate", "extra", "missing"])
def test_frames_uniquely_exhaust_every_named_id(change):
    request = example()
    if change == "missing":
        request["batch"]["records"][0]["frame_id"] = "absent-frame"
    else:
        frame = deepcopy(request["frames"][0])
        if change == "extra":
            frame["frame_id"] = "unreferenced-frame"
        request["frames"].append(frame)
    with pytest.raises(ValidationError):
        validate("FrameBatchRequest", request)


def two_records(*, same_frame=False):
    request = example()
    second = deepcopy(request["batch"]["records"][0])
    second.update(record_id="process-2", sequence=2, causal_parents=["process-1"])
    if not same_frame:
        frame = deepcopy(request["frames"][0])
        frame["frame_id"] = second["frame_id"] = "ingress-frame-2"
        request["frames"].append(frame)
    request["batch"]["records"].append(second)
    return request


def test_legitimate_same_frame_reuse_and_mixed_frameless_source_remain_representable():
    request = two_records(same_frame=True)
    validate("FrameBatchRequest", request)
    request["batch"]["records"][1].update(frame_id=None, artifacts=[])
    validate("FrameBatchRequest", request)
    # The SourceRef does not identify a source family; the current Backend must
    # still reject this if its stored descriptor is shared_display.
    with pytest.raises(ValidationError):
        validate_frame_batch(request, user_id="another-user")


def test_http_equality_preserves_entire_envelope_and_array_order():
    request = two_records()
    original = canonical_request("FrameBatchRequest", request)
    assert canonical_request("FrameBatchRequest", dict(reversed(list(request.items())))) == original
    for change in ("frame_order", "record_order", "batch_id", "delivery_mode"):
        changed = deepcopy(request)
        if change == "frame_order":
            changed["frames"].reverse()
        elif change == "record_order":
            changed["batch"]["records"].reverse()
        elif change == "batch_id":
            changed["batch"]["batch_id"] = "different-envelope"
        else:
            changed["batch"]["delivery_mode"] = "live"
        assert canonical_request("FrameBatchRequest", changed) != original
    assert request == two_records()


def test_member_binding_keeps_whole_batch_causality_and_artifact_conflict_checks():
    request = two_records()
    original = deepcopy(request)
    validate("FrameBatchRequest", request)
    assert request == original
    changed = deepcopy(request)
    changed["batch"]["records"][0]["causal_parents"] = ["process-2"]
    with pytest.raises(ValidationError):
        validate("FrameBatchRequest", changed)
    changed = deepcopy(request)
    changed["batch"]["records"][1]["artifacts"][0]["byte_length"] += 1
    with pytest.raises(ValidationError):
        validate("FrameBatchRequest", changed)


@pytest.mark.parametrize("field,value", [("artifact_id", "another-artifact"), ("user_id", "another-user")])
def test_original_put_checks_trusted_owner_and_path(field, value):
    args = {"artifact_id": "ingress-image-1", "user_id": "user-1", field: value}
    with pytest.raises(ValidationError):
        validate_upload(example("OriginalArtifactUpload"), **args)


@pytest.mark.parametrize("field,value", [
    ("source_id", "other-source"), ("source_version", 2), ("source_version", True),
    ("artifact_id", "other-original"), ("user_id", "other-user"),
])
def test_original_get_checks_every_path_identity(field, value):
    args = {"user_id": "user-1", "source_id": "source-1", "source_version": 1,
            "artifact_id": "ingress-image-1", field: value}
    with pytest.raises(ValidationError):
        validate_original_read(example("OriginalArtifactUpload"), **args)


@pytest.mark.parametrize("change", ["base64", "padding", "hash", "length", "owner_version"])
def test_original_integrity_is_not_a_shape_only_check(change):
    upload = example("OriginalArtifactUpload")
    if change == "base64":
        upload["data_base64"] = "!!!!"
    elif change == "padding":
        upload["data_base64"] += "="
    elif change == "hash":
        upload["artifact"]["sha256"] = "0" * 64
    elif change == "length":
        upload["artifact"]["byte_length"] += 1
    else:
        upload["source"]["source_version"] = False
    with pytest.raises(ValidationError):
        validate("OriginalArtifactUpload", upload)


def test_registration_requires_exact_source_project_timezone_and_version():
    with pytest.raises(ValidationError):
        validate_registration(example("DisplaySourceRegistration"), source_id="other-source")
    for field, value in (("project_id", False), ("source_timezone", "nowhere/unknown"), ("contract_version", "0.2.3")):
        payload = example("DisplaySourceRegistration")
        payload[field] = value
        with pytest.raises(ValidationError):
            validate("DisplaySourceRegistration", payload)
    payload = example("DisplaySourceRegistration")
    del payload["project_id"]
    with pytest.raises(ValidationError):
        validate("DisplaySourceRegistration", payload)


@pytest.mark.parametrize("data", [b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}',
                                  b'\xff', b'{', b'[]', b'null', b'"\\ud800"'])
def test_strict_json_never_repairs_malformed_input(data):
    with pytest.raises(ValidationError):
        decode_request("FrameBatchRequest", data)


def test_body_bounds_and_unsafe_or_deep_values():
    assert MAX_METADATA_BODY_BYTES == 4_194_304
    assert MAX_UPLOAD_BODY_BYTES == 48_933_548
    assert MAX_UPLOAD_BODY_BYTES > original_artifact.MAX_BASE64_LENGTH + len(json.dumps(example("OriginalArtifactUpload")))
    with pytest.raises(ValidationError):
        decode_request("FrameBatchRequest", b" " * (MAX_METADATA_BODY_BYTES + 1))
    for bad in (float("nan"), float("inf"), 2**54, "\ud800"):
        request = example()
        request["frames"][0]["width"] = bad
        with pytest.raises(ValidationError):
            validate("FrameBatchRequest", request)
    nested = []
    for _ in range(65):
        nested = [nested]
    with pytest.raises(ValidationError):
        validate("FrameBatchRequest", nested)


def test_only_bounded_errors_allow_retry_and_never_echo_content():
    for code in ("forbidden", "capture_stopped", "record_conflict", "payload_too_large"):
        with pytest.raises(ValidationError):
            validate("IngressError", {"contract_version": "0.2.4", "error": code, "retryable": True})
    for code in ("unavailable", "dependency_missing"):
        validate("IngressError", {"contract_version": "0.2.4", "error": code, "retryable": True})
    error = example("IngressError")
    error["message"] = "original source text"
    with pytest.raises(ValidationError):
        validate("IngressError", error)


def test_generated_complete_refs_versions_scopes_and_idempotency():
    Draft202012Validator.check_schema(SCHEMA)
    document = build_document()
    definitions = document["components"]["schemas"]

    def refs(value):
        if isinstance(value, dict):
            if "$ref" in value:
                prefix, name = value["$ref"].rsplit("/", 1)
                assert name in (definitions if prefix == "#/components/schemas" else document["components"]["parameters"])
            for item in value.values():
                refs(item)
        elif isinstance(value, list):
            for item in value:
                refs(item)

    refs(document)
    display = document["paths"]["/v2/process/display-sources/{source_id}"]
    assert display["put"]["x-required-scopes"] == ["sources:write", "process:control", "process:capture"]
    assert display["get"]["x-required-capabilities"] == [CAPABILITY]
    assert display["get"]["x-required-scopes"] == ["sources:read"]
    frames = document["paths"]["/v2/process/frames:batch"]["post"]
    assert frames["parameters"] == [{"$ref": "#/components/parameters/IdempotencyKey"}]
    assert frames["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/ProcessBatchAck")
    assert "process.capture.v0.2" in frames["x-required-capabilities"]
    assert document["security"] == [{"BearerAuth": []}]
    for name, content in outputs().items():
        assert (ROOT / "capture_ingress/generated" / name).read_text() == content


def test_existing_definitions_are_copied_without_modification():
    for name, shape in PROCESS_SCHEMA["$defs"].items():
        assert SCHEMA["$defs"][name] == shape
        assert SCHEMA["$defs"][name] is not shape
    assert SCHEMA["$defs"]["Frame"] == LEGACY_SCHEMA["$defs"]["Frame"]
    assert SCHEMA["$defs"]["DisplaySourceSnapshot"] == DISPLAY_SCHEMA["$defs"]["DisplaySourceSnapshot"]
    for name in ("OriginalArtifactUpload", "OriginalArtifactReceipt", "OriginalArtifactBinding"):
        assert SCHEMA["$defs"][name] == original_artifact.SCHEMA["$defs"][name]


def test_released_generated_bytes_stay_frozen():
    pins = {
        "v1": "84f5ba5f12b9abf903816cb655cb5e5c54034c8ef6ec8856a27535cb6f164853",
        "process_v2": "6a847792c062620a3429166878a5a5c418acb3507746f5eb75400397d0a58f9d",
        "process_control": "e399f3ed34dc3a1fbedba303809acc2c85aedb4be814bff6f79f4add3f44ab53",
        "original_artifact": "48f529f5fae4789a75dbf8d3de89a2f6f0954ccc2598582b3a526812bded10a9",
        "display_source": "5f8ef24cb746b2bf67b40e74a8709a46daab33df57e9e159e62b54ee66f7cd7a",
    }
    for family, expected in pins.items():
        folder = ROOT / ("" if family == "v1" else family) / "generated"
        digest = hashlib.sha256()
        for path in sorted(folder.iterdir()):
            if path.is_file():
                digest.update(path.name.encode() + b"\0" + path.read_bytes())
        assert digest.hexdigest() == expected, family
