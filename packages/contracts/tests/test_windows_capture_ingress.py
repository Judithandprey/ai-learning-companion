"""Released Windows facts with synthetic archive/HTTP bindings, not device acceptance."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import capture_ingress, raw_capture_ingress, desktop_capture_ingress
from packages.contracts import validate as validate_v1
from packages.contracts.capture_frame import validate as validate_raw
from packages.contracts.desktop_frame import validate as validate_desktop
from packages.contracts.display_source import validate as validate_display
from packages.contracts.original_artifact import validate as validate_original
from packages.contracts.process_control import validate as validate_control
from packages.contracts import windows_capture_ingress as wire
from packages.contracts.windows_capture_ingress.generate import outputs, build_document
from packages.contracts.windows_frame import validate_binding
from packages.contracts.process_v2 import validate as validate_process
from packages.contracts.windows_frame import validate as validate_windows
from packages.contracts.tests.test_windows_frame import windows, display, observation, retained_examples, bind_example

NAME = "WindowsFrameBatchRequest"


@pytest.fixture
def payload(windows):
    batch, _, frame, _, _ = windows
    return {"contract_version": "0.2.10", "batch": deepcopy(batch), "frames": [deepcopy(frame)]}


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


def test_complete_windows_profile_and_exact_binding_are_preserved(payload, windows):
    original = deepcopy(payload)
    wire.validate_frame_batch(payload, user_id=windows[3]["user_id"])
    validate_binding(*windows)
    assert payload == original
    assert wire.decode_request(NAME, wire.canonical_request(NAME, payload)) == original
    with pytest.raises(ValidationError):
        wire.validate_frame_batch(payload, user_id="foreign-owner")


@pytest.mark.parametrize("index", range(5))
def test_actual_released_examples_keep_raw_composed_aliases_and_native_unknowns(index, observation, display):
    values = bind_example(retained_examples()[index], observation, display)
    batch, _, frame, _, _ = values
    value = {"contract_version": wire.CONTRACT_VERSION, "batch": batch, "frames": [frame]}
    before = deepcopy(value)
    wire.validate_frame_batch(value, user_id=frame["source"]["user_id"])
    validate_binding(*values)  # Synthetic retained facts, not a storage lookup.
    assert wire.decode_request(NAME, wire.canonical_request(NAME, value)) == before
    assert frame["profile"]["sample"]["gap_ms"] is None
    if frame["raw"] == frame["composed"]["image"]:
        assert len(batch["records"][0]["artifacts"]) == 1


def test_raw_only_and_generic_structured_records_preserve_separate_editable_original(payload):
    frame = payload["frames"][0]
    record = payload["batch"]["records"][0]
    frame["composed"] = None
    ink = {"artifact_id": "editable-user-ink", "sha256": "e" * 64,
           "byte_length": 42, "media_type": "application/json"}
    record["artifacts"] = [ink, deepcopy(frame["raw"]["artifact"])]
    assert (record["surface"], record["method"]) == ("web_dom", "structured")
    before = deepcopy(payload)
    wire.validate(NAME, payload)
    assert payload == before  # Current pixel-only admission is Backend's duty.


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


@pytest.mark.parametrize("field", ["user_id", "source_id", "source_version"])
def test_record_source_owner_and_version_must_all_match(payload, field):
    payload["batch"]["records"][0]["source"][field] = 2 if field == "source_version" else "foreign"
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


@pytest.mark.parametrize("field", ["session_id", "stream_id"])
def test_every_capture_incarnation_dimension_matches(payload, field):
    payload["frames"][0][field] = "another-incarnation"
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


def test_gap_owner_is_checked_even_without_a_frame(payload):
    item = gap(payload)
    payload.update(frames=[])
    payload["batch"]["records"] = [item]
    wire.validate(NAME, payload)
    with pytest.raises(ValidationError): wire.validate_frame_batch(payload, user_id="foreign-owner")


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
    else: payload["frames"][0]["raw"]["artifact"]["byte_length"] += 1
    original = deepcopy(payload)
    with pytest.raises(ValidationError): wire.validate(NAME, payload)
    assert payload == original


@pytest.mark.parametrize("image", ["raw", "composed"])
@pytest.mark.parametrize("change", ["absent", "id", "sha256", "byte_length", "media_type"])
def test_every_complete_image_reference_belongs_to_every_selected_record(payload, image, change):
    frame = payload["frames"][0]
    picture = frame["raw"] if image == "raw" else frame["composed"]["image"]
    first = payload["batch"]["records"][0]
    selected = deepcopy(first)
    selected.update(record_id="second-reference", sequence=2)
    ref = next(a for a in selected["artifacts"] if a["artifact_id"] == picture["artifact"]["artifact_id"])
    if change == "absent": selected["artifacts"].remove(ref)
    elif change == "id": ref["artifact_id"] = "substituted-original"
    elif change == "sha256": ref["sha256"] = "b" * 64
    elif change == "byte_length": ref["byte_length"] += 1
    else: ref["media_type"] = "image/jpeg"
    payload["batch"]["records"].append(selected)
    before = deepcopy(payload)
    with pytest.raises(ValidationError): wire.validate(NAME, payload)
    assert payload == before


@pytest.mark.parametrize("field,value", [
    ("observed_at", "2026-09-30T12:00:00Z"), ("media_position", 0),
    ("clock", {"domain_id": "invented", "elapsed_ms": 0, "uncertainty_ms": None}),
])
def test_framed_local_times_cannot_become_capture_utc_playhead_or_process_clock(payload, field, value):
    payload["batch"]["records"][0][field] = value
    validate_process("ProcessBatch", payload["batch"])
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


@pytest.mark.parametrize("change", ["future_parent", "present_gap", "duplicate_sequence", "duplicate_record"])
def test_complete_batch_semantics_apply_to_mixed_and_gap_records(payload, change):
    item = gap(payload)
    first = payload["batch"]["records"][0]
    payload["batch"]["records"].append(item)
    if change == "future_parent": first["causal_parents"] = [item["record_id"]]
    elif change == "duplicate_sequence": item["sequence"] = first["sequence"]
    elif change == "duplicate_record": item["record_id"] = first["record_id"]
    else:
        item["evidence"].update(missing_sequences=[{"first": 1, "last": 1}], limitations=["missing_events"])
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


def test_native_cross_field_checks_are_not_replaced_by_generated_shape(payload):
    frame = payload["frames"][0]
    frame["composed"]["visible_strokes"] += 1
    Draft202012Validator(wire.SCHEMA).validate(payload)
    with pytest.raises(ValidationError): wire.validate(NAME, payload)
    with pytest.raises(ValidationError): wire.validate("WindowsFrame", frame)


@pytest.mark.parametrize("aliases", [False, True])
@pytest.mark.parametrize("field", ["width", "height", "pixels_sha256"])
def test_same_image_facts_stay_consistent_across_frames_and_artifact_aliases(payload, aliases, field):
    two_frames(payload)
    frame = payload["frames"][1]
    if aliases:
        for image in (frame["raw"], frame["composed"]["image"]):
            image["artifact"]["artifact_id"] += "-alias"
        payload["batch"]["records"][1]["artifacts"] = [
            deepcopy(frame["raw"]["artifact"]), deepcopy(frame["composed"]["image"]["artifact"])]
    wire.validate(NAME, payload)  # Reusing exact PNG facts is valid.
    for image in (frame["raw"], frame["composed"]["image"]):
        image[field] = "b" * 64 if field == "pixels_sha256" else image[field] + 1
    validate_windows(frame)  # Each descriptor alone is internally consistent.
    validate_process("ProcessBatch", payload["batch"])
    with pytest.raises(ValidationError, match="contradictory facts across Windows frames"):
        wire.validate(NAME, payload)


def test_unknown_gap_separate_rounded_clocks_and_held_frame_ordinal_survive(payload):
    sample = payload["frames"][0]["profile"]["sample"]
    sample.update(sample_seq=20, frame_seq=5, monotonic_ms=1000, presentation_ms=981,
                  frame_age_ms=20, state="gap", gap_ms=None,
                  sampled_at="2025-01-01T00:00:00Z", taken_at="2026-01-01T00:00:00Z")
    before = deepcopy(payload)
    wire.validate(NAME, payload)
    assert payload == before
    sample.update(presented_frames=0, presentation_ms=None, frame_age_ms=None)
    wire.validate(NAME, payload)


def test_replay_equality_keeps_array_order_profile_and_gap_information(payload):
    two_frames(payload)
    original = deepcopy(payload)
    canonical = wire.canonical_request(NAME, payload)
    assert wire.canonical_request(NAME, dict(reversed(list(payload.items())))) == canonical
    for field in ("frames", "records", "artifacts"):
        modified = deepcopy(payload)
        target = (modified["frames"] if field == "frames" else modified["batch"]["records"]
                  if field == "records" else modified["batch"]["records"][0]["artifacts"])
        target.reverse()
        assert wire.canonical_request(NAME, modified) != canonical
    modified = deepcopy(payload)
    modified["frames"][0]["profile"]["sample"].update(state="gap", gap_ms=1000)
    assert wire.canonical_request(NAME, modified) != canonical
    modified["batch"]["records"].append({**gap(payload), "sequence": 3})
    assert wire.canonical_request(NAME, modified) != canonical
    assert payload == original


def test_replay_equality_preserves_causal_evidence_order(payload):
    two_frames(payload)
    record = gap(payload)
    record.update(sequence=3, causal_parents=[r["record_id"] for r in payload["batch"]["records"]])
    payload["batch"]["records"].append(record)
    original = wire.canonical_request(NAME, payload)
    record["causal_parents"].reverse()
    assert wire.canonical_request(NAME, payload) != original


@pytest.mark.parametrize("bad", [b'{"contract_version":"0.2.10","contract_version":"0.2.10"}',
                                  b'{"nested":{"x":1,"x":2}}', b'{"x":-Infinity}',
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


def test_canonical_ceiling_is_checked_after_decoding_shorter_numeric_json(payload):
    # Short exponent spellings decode to integral floats whose canonical JSON
    # spelling is longer. Both representations still need their own size check.
    two_frames(payload)
    for _ in range(98):
        frame = deepcopy(payload["frames"][0])
        record = deepcopy(payload["batch"]["records"][0])
        frame["frame_id"] = f"frame-{len(payload['frames'])}"
        record.update(record_id=f"record-{len(payload['frames'])}", sequence=len(payload["frames"]) + 1,
                      frame_id=frame["frame_id"])
        payload["frames"].append(frame)
        payload["batch"]["records"].append(record)
    wire.validate(NAME, payload)  # The 100-frame boundary itself is valid.
    for frame in payload["frames"]:
        frame["profile"]["sample"].update(sample_seq=5_000_000_000_000,
                                            deferred_samples_not_retained="__DEFERRED_ARRAY__")
    exponents = "[" + ",".join(f"{i}e9" for i in range(1, 4001)) + "]"
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace(
        '"__DEFERRED_ARRAY__"', exponents).encode()
    assert len(raw) < wire.body_limit(NAME)
    with pytest.raises(ValidationError, match="bounded transport size"):
        wire.decode_request(NAME, raw)


def test_new_and_old_envelopes_remain_explicitly_separate(payload):
    for old, name, version in ((capture_ingress, "FrameBatchRequest", "0.2.4"),
                                (raw_capture_ingress, "RawFrameBatchRequest", "0.2.6"),
                                (desktop_capture_ingress, "DesktopFrameBatchRequest", "0.2.8")):
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
    with pytest.raises(ValidationError): validate_windows(payload)


@pytest.mark.parametrize("reader", ["v1", "process", "control", "original", "display", "raw", "desktop"])
def test_prior_descriptor_and_record_families_reject_the_http_envelope(payload, reader):
    calls = {"v1": lambda: validate_v1("Frame", payload),
             "process": lambda: validate_process("ProcessBatch", payload),
             "control": lambda: validate_control("StreamRegistration", payload),
             "original": lambda: validate_original("OriginalArtifactBinding", payload),
             "display": lambda: validate_display(payload),
             "raw": lambda: validate_raw(payload), "desktop": lambda: validate_desktop(payload)}
    before = deepcopy(payload)
    with pytest.raises(ValidationError): calls[reader]()
    assert payload == before


@pytest.mark.parametrize("target", ["envelope", "batch", "frame"])
def test_closed_request_objects_cannot_carry_unreleased_authority(payload, target):
    place = {"envelope": payload, "batch": payload["batch"], "frame": payload["frames"][0]}[target]
    place["live_capture_allowed"] = True
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


def test_named_helpers_refuse_unknown_definitions_and_non_request_body_names(payload):
    with pytest.raises(ValueError): wire.validate("UnreleasedRequest", payload)
    with pytest.raises(ValueError): wire.body_limit("WindowsFrame")
    with pytest.raises(ValueError): wire.canonical_request("WindowsFrame", payload["frames"][0])


def test_frame_and_record_ceilings_and_multiple_references_are_preserved(payload):
    record = payload["batch"]["records"][0]
    payload["batch"]["records"] = [{**deepcopy(record), "record_id": f"r-{i}", "sequence": i + 1} for i in range(100)]
    wire.validate(NAME, payload)
    payload["batch"]["records"].append({**deepcopy(record), "record_id": "r-101", "sequence": 101})
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


def test_empty_records_and_excess_frames_are_rejected(payload):
    payload["batch"]["records"] = []
    payload["frames"] = []
    with pytest.raises(ValidationError): wire.validate(NAME, payload)
    payload["frames"] = [deepcopy(retained_examples()[0]) for _ in range(101)]
    with pytest.raises(ValidationError): wire.validate(NAME, payload)


@pytest.mark.parametrize("code", sorted({c for values in wire.ERROR_CODES.values() for c in values}))
def test_content_free_errors_and_retry_permissions(code):
    error = {"contract_version": "0.2.10", "error": code, "retryable": False}
    wire.validate("WindowsIngressError", error)
    error["retryable"] = True
    if code in {"unavailable", "dependency_missing"}: wire.validate("WindowsIngressError", error)
    else:
        with pytest.raises(ValidationError): wire.validate("WindowsIngressError", error)


def test_error_objects_are_closed_versioned_and_content_free():
    error = {"contract_version": "0.2.10", "error": "invalid_request", "retryable": False}
    for changed in ({**error, "detail": "original content"}, {**error, "contract_version": "0.2.8"},
                    {**error, "error": "arbitrary_exception"}):
        with pytest.raises(ValidationError): wire.validate("WindowsIngressError", changed)


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


def acknowledgment(batch):
    return {"contract_version": "0.2.0", "batch_id": batch["batch_id"],
            "user_id": batch["records"][0]["source"]["user_id"],
            **{key: batch[key] for key in ("device_id", "session_id", "stream_id")},
            "acknowledged": [{"record_id": record["record_id"], "sequence": record["sequence"],
                              "disposition": "accepted", "received_at": "2026-09-30T12:00:00Z",
                              "envelope": "committed", "artifacts": [
                                  {**artifact, "status": "verified"} for artifact in record["artifacts"]]}
                             for record in batch["records"]]}


def test_verified_only_ack_covers_both_pngs_separate_ink_and_gap(payload):
    batch = payload["batch"]
    batch["records"][0]["artifacts"].append({"artifact_id": "original-editable-ink", "sha256": "b" * 64,
                                             "byte_length": 17, "media_type": "application/json"})
    batch["records"].append(gap(payload))
    wire.validate(NAME, payload)
    ack = acknowledgment(batch)
    verified = frozenset(tuple(a[key] for key in ("artifact_id", "sha256", "byte_length", "media_type"))
                         for r in batch["records"] for a in r["artifacts"])
    before = deepcopy((batch, ack))
    wire.validate_ack(batch, ack, user_id=ack["user_id"], verified_artifacts=verified)
    assert (batch, ack) == before
    assert len(ack["acknowledged"][0]["artifacts"]) == 3
    assert ack["acknowledged"][1]["artifacts"] == []
    with pytest.raises(ValidationError): wire.validate_ack(batch, ack, user_id=ack["user_id"])
    with pytest.raises(ValidationError): wire.validate_ack(batch, ack, user_id="foreign-owner", verified_artifacts=verified)
    for index in range(3):
        for change in ("pending", "absent", "changed"):
            modified = deepcopy(ack)
            refs = modified["acknowledged"][0]["artifacts"]
            if change == "pending": refs[index]["status"] = "pending"
            elif change == "absent": refs.pop(index)
            else: refs[index]["byte_length"] += 1
            with pytest.raises(ValidationError):
                wire.validate_ack(batch, modified, user_id=ack["user_id"], verified_artifacts=verified)
    changed = deepcopy(ack)
    changed["acknowledged"].pop()
    with pytest.raises(ValidationError):
        wire.validate_ack(batch, changed, user_id=ack["user_id"], verified_artifacts=verified)


def test_generated_outputs_and_separate_opt_in_route():
    Draft202012Validator.check_schema(wire.SCHEMA)
    root = Path(__file__).parents[1] / "windows_capture_ingress/generated"
    for name, text in outputs().items(): assert (root / name).read_text() == text
    api = build_document()
    assert set(api["paths"]) == {"/v2/process/windows-frames:batch"}
    operation = api["paths"]["/v2/process/windows-frames:batch"]["post"]
    assert operation["x-required-capabilities"] == [wire.CAPABILITY, "process.capture.v0.2"]
    assert operation["x-max-body-bytes"] == 4 * 1024 * 1024
    assert wire.CAPABILITY != raw_capture_ingress.CAPABILITY
    assert operation["x-required-scopes"] == ["process:capture"]
    assert operation["requestBody"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/WindowsFrameBatchRequest"}
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/ProcessBatchAck"}
    assert set(operation["responses"]) == {"200", *wire.ERROR_CODES}
    assert wire.ERROR_CODES == raw_capture_ingress.ERROR_CODES == desktop_capture_ingress.ERROR_CODES
    for name, shape in wire.SCHEMA["$defs"].items():
        if name in wire.PROCESS_SCHEMA["$defs"]:
            assert shape == wire.PROCESS_SCHEMA["$defs"][name]
    assert "unsupported outer 0.2.10, batch 0.2.0 and frame 0.2.9" in operation["description"]
    assert "STORED" in operation["description"]
