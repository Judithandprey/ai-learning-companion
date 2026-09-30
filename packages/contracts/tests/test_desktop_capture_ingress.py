"""Pure synthetic transport checks; no handler, stored-byte or device claim."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import capture_ingress, raw_capture_ingress
from packages.contracts import desktop_capture_ingress as wire
from packages.contracts.desktop_capture_ingress.generate import outputs, build_document
from packages.contracts.desktop_frame import validate_binding
from packages.contracts.process_v2 import validate as validate_process
from packages.contracts.tests.test_desktop_frame import desktop, display, observation, proposal

NAME = "DesktopFrameBatchRequest"


@pytest.fixture
def payload(desktop):
    batch, _, frame, _, _ = desktop
    return {"contract_version": "0.2.8", "batch": deepcopy(batch), "frames": [deepcopy(frame)]}


def gap(payload, coverage="unknown"):
    record = deepcopy(payload["batch"]["records"][0])
    record.update(record_id="gap", sequence=2, frame_id=None, artifacts=[],
                  evidence={"kind": "coverage", "coverage": coverage,
                            "from_clock_ms": None, "through_clock_ms": None,
                            "missing_sequences": [], "limitations": ["unknown"]})
    return record


def two_frames(payload):
    frame = deepcopy(payload["frames"][0])
    record = deepcopy(payload["batch"]["records"][0])
    frame["frame_id"] = "second-frame"
    record.update(record_id="second-record", sequence=2, frame_id=frame["frame_id"])
    payload["frames"].append(frame)
    payload["batch"]["records"].append(record)
    return payload


def test_complete_desktop_profile_and_exact_binding_are_preserved(payload, desktop):
    original = deepcopy(payload)
    wire.validate_frame_batch(payload, user_id=desktop[3]["user_id"])
    validate_binding(*desktop)
    assert payload == original
    assert wire.decode_request(NAME, wire.canonical_request(NAME, payload)) == original
    with pytest.raises(ValidationError):
        wire.validate_frame_batch(payload, user_id="foreign-owner")


@pytest.mark.parametrize("coverage", ["unknown", "partial", "unobserved"])
@pytest.mark.parametrize("mixed", [False, True])
def test_gap_before_any_pixels_and_mixed_gap_never_manufacture_frame(payload, coverage, mixed):
    item = gap(payload, coverage)
    payload["batch"]["records"] = payload["batch"]["records"] + [item] if mixed else [item]
    if not mixed:
        payload["frames"] = []
    original = deepcopy(payload)
    wire.validate_frame_batch(payload, user_id=item["source"]["user_id"])
    assert payload == original and item["frame_id"] is None


@pytest.mark.parametrize("change", ["observed", "operation", "artifact", "clock", "utc", "media"])
def test_frameless_evidence_cannot_claim_pixels_operations_or_invented_clocks(payload, change):
    item = gap(payload)
    if change == "observed": item["evidence"]["coverage"] = "observed_samples"
    elif change == "operation": item["evidence"] = deepcopy(payload["batch"]["records"][0]["evidence"])
    elif change == "artifact": item["artifacts"] = deepcopy(payload["batch"]["records"][0]["artifacts"])
    elif change == "clock": item["clock"] = {"domain_id": "invented", "elapsed_ms": 0, "uncertainty_ms": None}
    elif change == "utc": item["observed_at"] = "2026-09-30T10:00:00Z"
    else: item["media_position"] = 1
    payload["batch"]["records"].append(item)
    validate_process("ProcessBatch", payload["batch"])
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


@pytest.mark.parametrize("change", ["duplicate", "extra", "missing", "foreign_source", "device", "artifact"])
def test_unique_membership_and_cross_bindings_are_checked(payload, change):
    if change == "duplicate": payload["frames"].append(deepcopy(payload["frames"][0]))
    elif change == "extra":
        extra = deepcopy(payload["frames"][0]); extra["frame_id"] = "unreferenced"; payload["frames"].append(extra)
    elif change == "missing": payload["frames"] = []
    elif change == "foreign_source": payload["frames"][0]["source"]["source_id"] = "foreign"
    elif change == "device": payload["frames"][0]["device_id"] = "different"
    else: payload["frames"][0]["artifact"]["byte_length"] += 1
    original = deepcopy(payload)
    with pytest.raises(ValidationError): wire.validate(NAME, payload)
    assert payload == original


@pytest.mark.parametrize("change", ["future_parent", "present_gap", "duplicate_sequence"])
def test_complete_batch_semantics_apply_to_mixed_and_gap_records(payload, change):
    item = gap(payload)
    first = payload["batch"]["records"][0]
    payload["batch"]["records"].append(item)
    if change == "future_parent": first["causal_parents"] = [item["record_id"]]
    elif change == "duplicate_sequence": item["sequence"] = first["sequence"]
    else:
        item["evidence"].update(missing_sequences=[{"first": 1, "last": 1}], limitations=["missing_events"])
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


def test_native_cross_field_checks_are_not_replaced_by_generated_shape(payload):
    frame = payload["frames"][0]
    frame["timing"].update(observed_at_estimate="2026-09-30T12:00:01.251Z",
                           estimate_basis="session_wall_plus_callback_monotonic_delta")
    Draft202012Validator(wire.SCHEMA).validate(payload)
    with pytest.raises(ValidationError): wire.validate(NAME, payload)
    with pytest.raises(ValidationError): wire.validate("DesktopFrame", frame)


def test_replay_equality_keeps_array_order_profile_and_gap_information(payload):
    two_frames(payload)
    original = deepcopy(payload)
    canonical = wire.canonical_request(NAME, payload)
    assert wire.canonical_request(NAME, dict(reversed(list(payload.items())))) == canonical
    for field in ("frames", "records"):
        modified = deepcopy(payload)
        (modified["frames"] if field == "frames" else modified["batch"]["records"]).reverse()
        assert wire.canonical_request(NAME, modified) != canonical
    modified = deepcopy(payload)
    modified["frames"][0]["profile"]["sample"]["dirty_rects"] = []
    assert wire.canonical_request(NAME, modified) != canonical
    modified["batch"]["records"].append({**gap(payload), "sequence": 3})
    assert wire.canonical_request(NAME, modified) != canonical
    assert payload == original


@pytest.mark.parametrize("bad", [b'{"contract_version":"0.2.8","contract_version":"0.2.8"}',
                                  b'{"x":NaN}', b'{"x":Infinity}', b'\xff', b'{',
                                  b'{"x":9007199254740992}', b'[' * 80 + b']' * 80])
def test_strict_decoder_rejects_ambiguous_nonfinite_or_unbounded_json(bad):
    with pytest.raises(ValidationError): wire.decode_request(NAME, bad)


def test_raw_and_canonical_body_ceilings_and_immutable_bytes(payload):
    encoded = wire.canonical_request(NAME, payload)
    limit = wire.body_limit(NAME)
    assert wire.decode_request(NAME, b" " * (limit - len(encoded)) + encoded) == payload
    for data in (b" " * (limit + 1), bytearray(encoded), encoded.decode()):
        with pytest.raises(ValidationError): wire.decode_request(NAME, data)
    payload["extra"] = "x" * limit
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


def test_new_and_old_envelopes_remain_explicitly_separate(payload):
    for old, name, version in ((capture_ingress, "FrameBatchRequest", "0.2.4"),
                                (raw_capture_ingress, "RawFrameBatchRequest", "0.2.6")):
        with pytest.raises(ValidationError): old.validate(name, payload)
        changed = deepcopy(payload); changed["contract_version"] = version
        with pytest.raises(ValidationError): wire.validate(NAME, changed)
        with pytest.raises(ValidationError): old.validate(name, changed)
    for field in ("contract_version", "frames", "batch"):
        changed = deepcopy(payload); del changed[field]
        with pytest.raises(ValidationError): wire.validate(NAME, changed)
    for location in (payload, payload["frames"][0], payload["batch"]):
        prior = location["contract_version"]
        location["contract_version"] = "unreleased"
        with pytest.raises(ValidationError): wire.validate(NAME, payload)
        location["contract_version"] = prior


def test_frame_and_record_ceilings_and_multiple_references_are_preserved(payload):
    record = payload["batch"]["records"][0]
    payload["batch"]["records"] = [{**deepcopy(record), "record_id": f"r-{i}", "sequence": i + 1} for i in range(100)]
    wire.validate(NAME, payload)
    payload["batch"]["records"].append({**deepcopy(record), "record_id": "r-101", "sequence": 101})
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


@pytest.mark.parametrize("code", sorted({c for values in wire.ERROR_CODES.values() for c in values}))
def test_content_free_errors_and_retry_permissions(code):
    error = {"contract_version": "0.2.8", "error": code, "retryable": False}
    wire.validate("DesktopIngressError", error)
    error["retryable"] = True
    if code in {"unavailable", "dependency_missing"}: wire.validate("DesktopIngressError", error)
    else:
        with pytest.raises(ValidationError): wire.validate("DesktopIngressError", error)


def test_gap_ack_has_exact_correspondence_without_fake_artifact_receipts(payload):
    item = gap(payload)
    batch = {**payload["batch"], "records": [item]}
    ack = {"contract_version": "0.2.0", "batch_id": batch["batch_id"], "user_id": item["source"]["user_id"],
           "device_id": batch["device_id"], "session_id": batch["session_id"], "stream_id": batch["stream_id"],
           "acknowledged": [{"record_id": item["record_id"], "sequence": item["sequence"],
                             "disposition": "accepted", "received_at": "2026-09-30T10:00:00Z",
                             "envelope": "committed", "artifacts": []}]}
    wire.validate_ack(batch, ack, user_id=item["source"]["user_id"])
    ack["acknowledged"][0]["record_id"] = "not-this-gap"
    with pytest.raises(ValidationError): wire.validate_ack(batch, ack, user_id=item["source"]["user_id"])


def test_generated_outputs_and_separate_opt_in_route():
    Draft202012Validator.check_schema(wire.SCHEMA)
    root = Path(__file__).parents[1] / "desktop_capture_ingress/generated"
    for name, text in outputs().items(): assert (root / name).read_text() == text
    api = build_document()
    assert set(api["paths"]) == {"/v2/process/desktop-frames:batch"}
    operation = api["paths"]["/v2/process/desktop-frames:batch"]["post"]
    assert operation["x-required-capabilities"] == [wire.CAPABILITY, "process.capture.v0.2"]
    assert operation["x-max-body-bytes"] == 4 * 1024 * 1024
    assert wire.CAPABILITY != raw_capture_ingress.CAPABILITY
