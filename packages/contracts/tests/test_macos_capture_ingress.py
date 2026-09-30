"""Pure Mac envelope checks using audited Swift synthetic metadata, not capture.

Archive bindings and ACK verification tuples below are declared test inputs;
these tests do not register producers, verify bytes or prove service commits.
"""

from copy import deepcopy
import hashlib
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import (
    capture_ingress, desktop_capture_ingress, raw_capture_ingress,
    windows_capture_ingress, macos_capture_ingress as wire,
    validate as validate_v1,
)
from packages.contracts.capture_frame import validate as validate_raw
from packages.contracts.desktop_frame import validate as validate_desktop
from packages.contracts.macos_frame import SCHEMA as MAC_SCHEMA, validate as validate_mac, validate_binding
from packages.contracts.macos_capture_ingress.generate import build_document, outputs
from packages.contracts.process_v2 import validate as validate_process
from packages.contracts.windows_frame import validate as validate_windows
from packages.contracts.tests.test_capture_frame import CLOCK, set_field
from packages.contracts.tests.test_macos_frame import bind, display, examples, mac, observation
from packages.contracts.tests.test_windows_capture_ingress import acknowledgment

NAME = "MacOSFrameBatchRequest"
ROOT = Path(__file__).parents[1]


def images(frame):
    return [frame["raw"]] + ([frame["composition"]["image"]]
                             if frame["composition"]["kind"] == "composed" else [])


def image_refs(frame):
    return list({image["artifact"]["artifact_id"]: deepcopy(image["artifact"])
                 for image in images(frame)}.values())


@pytest.fixture
def payload(mac):
    return {"contract_version": "0.2.12", "batch": deepcopy(mac[0]), "frames": [deepcopy(mac[2])]}


def append_frame(payload, frame):
    """Add a retained descriptor without rewriting its native or archive facts."""
    records = payload["batch"]["records"]
    record = deepcopy(records[0])
    ordinal = max(r["sequence"] for r in records) + 1
    record.update(record_id=f"mac-record-{ordinal}", sequence=ordinal,
                  frame_id=frame["frame_id"], artifacts=image_refs(frame))
    records.append(record)
    payload["frames"].append(frame)
    return record


def gap(payload, coverage="unknown"):
    record = deepcopy(payload["batch"]["records"][0])
    record.update(record_id="mac-gap", sequence=99, frame_id=None, artifacts=[],
                  observed_at=None, media_position=None, clock=None,
                  evidence={"kind": "coverage", "coverage": coverage,
                            "from_clock_ms": None, "through_clock_ms": None,
                            "missing_sequences": [], "limitations": ["unknown", "disconnected"]})
    return record


def rejected(payload):
    before = json.dumps(payload, sort_keys=True)
    with pytest.raises(ValidationError):
        wire.validate(NAME, payload)
    assert json.dumps(payload, sort_keys=True) == before


def raw_alias(frame, image, *, separate_id=True):
    """An explicit unknown-outcome second frame, with supplied PNG metadata."""
    other = deepcopy(frame)
    other.update(frame_id="other-mac-frame", callback_sequence=8,
                 composition={"kind": "unknown", "reason": "no_retained_outcome"})
    other["raw"] = deepcopy(image)
    other["raw"]["native_file"] = "frames/00000008.png"
    if separate_id:
        other["raw"]["artifact"]["artifact_id"] = "other-mac-image"
    return other


def test_all_seven_audited_descriptors_round_trip_without_metadata_loss(payload, observation, display):
    retained = examples()
    batch, _, first, source, _ = bind(retained[0], observation, display)
    payload.update(batch=batch, frames=[first])
    for frame in retained[1:]:
        append_frame(payload, frame)
    before = deepcopy(payload)
    wire.validate_frame_batch(payload, user_id=first["source"]["user_id"])
    for record, frame in zip(batch["records"], retained, strict=True):
        bindings = bind(frame, observation, display)[4]
        validate_binding(batch, record["record_id"], frame, source, bindings)
    assert wire.decode_request(NAME, wire.canonical_request(NAME, payload)) == before
    assert payload == before and payload["frames"] == retained
    assert len(retained) == 7
    assert [frame["composition"]["kind"] for frame in retained] == ["composed"] * 6 + ["not_composed"]
    # The existing source test audits producer-event provenance. These exact
    # descriptors retain its empty ink alias, later ink revisions and refusal.
    assert len(batch["records"][0]["artifacts"]) == 1
    assert len(batch["records"][2]["artifacts"]) == 2
    assert len(batch["records"][-1]["artifacts"]) == 1


def test_shipped_envelope_retains_exact_audited_descriptor_provenance(observation, display):
    folder = ROOT / "macos_capture_ingress/examples"
    payload = json.loads((folder / "retained-batch.json").read_text())
    provenance = json.loads((folder / "provenance.json").read_text())
    project = ROOT.parents[1]
    descriptor_bytes = (project / provenance["descriptor_path"]).read_bytes()
    native = json.loads((project / provenance["native_provenance_path"]).read_text())
    assert hashlib.sha256(descriptor_bytes).hexdigest() == provenance["descriptor_sha256"]
    assert payload["frames"] == json.loads(descriptor_bytes) == examples()
    assert native["fixture_commit"] == provenance["native_fixture_commit"]
    assert provenance["frame_contract_version"] == "0.2.11"
    assert (provenance["frame_count"], provenance["composed_count"], provenance["not_composed_count"]) == (7, 6, 1)
    before = deepcopy(payload)
    wire.validate_frame_batch(payload, user_id=payload["frames"][0]["source"]["user_id"])
    for record, frame in zip(payload["batch"]["records"], payload["frames"], strict=True):
        _, _, _, source, bindings = bind(frame, observation, display)
        validate_binding(payload["batch"], record["record_id"], frame, source, bindings)
        assert record["method"] == "visual" and record["surface"] == "external_app"
    assert wire.decode_request(NAME, wire.canonical_request(NAME, payload)) == before
    assert payload == before


@pytest.mark.parametrize("outcome", ["not_composed", "unknown"])
def test_raw_only_outcomes_preserve_reason_and_independent_editable_ink(payload, observation, display, outcome):
    frame = examples()[-1]
    if outcome == "unknown":
        frame["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
    batch, _, frame, _, _ = bind(frame, observation, display)
    ink = {"artifact_id": "editable-ink-original", "sha256": "a" * 64,
           "byte_length": 42, "media_type": "application/json"}
    batch["records"][0]["artifacts"].append(ink)
    payload.update(batch=batch, frames=[frame])
    before = deepcopy(payload)
    assert wire.decode_request(NAME, wire.canonical_request(NAME, payload)) == before
    assert frame["composition"]["kind"] == outcome
    assert payload == before


@pytest.mark.parametrize("distinct_id", [False, True])
def test_empty_ink_raw_alias_requires_each_distinct_archive_reference(observation, display, distinct_id):
    frame = examples()[0]
    if distinct_id:
        frame["composition"]["image"]["artifact"]["artifact_id"] = "raw-alias-original"
    batch, record_id, frame, source, bindings = bind(frame, observation, display)
    payload = {"contract_version": "0.2.12", "batch": batch, "frames": [frame]}
    wire.validate(NAME, payload)
    validate_binding(batch, record_id, frame, source, bindings)
    assert len(bindings) == len(batch["records"][0]["artifacts"]) == (2 if distinct_id else 1)
    batch["records"][0]["artifacts"].pop()
    rejected(payload)


@pytest.mark.parametrize("role", [0, 1], ids=["raw", "composed"])
@pytest.mark.parametrize("change", ["missing", "id", "hash", "length", "media_type"])
def test_every_selected_record_retains_each_complete_png_reference(payload, role, change):
    second = deepcopy(payload["batch"]["records"][0])
    second.update(record_id="same-frame-second-record", sequence=2)
    payload["batch"]["records"].append(second)
    wire.validate(NAME, payload)
    refs = second["artifacts"]
    if change == "missing":
        refs.pop(role)
    else:
        field, value = {"id": ("artifact_id", "other"), "hash": ("sha256", "f" * 64),
                        "length": ("byte_length", 1), "media_type": ("media_type", "image/jpeg")}[change]
        refs[role][field] = value
    rejected(payload)


@pytest.mark.parametrize("change", ["missing", "extra", "foreign_owner", "wrong_role"])
def test_envelope_validation_does_not_replace_stored_original_binding(mac, payload, change):
    wire.validate(NAME, payload)
    if change == "missing":
        mac[4].pop()
    elif change == "extra":
        mac[4].append(deepcopy(mac[4][0]))
    elif change == "foreign_owner":
        mac[4][1]["source"]["user_id"] = "foreign-owner"
    else:
        mac[4][1]["kind"] = "editable_ink"
    with pytest.raises(ValidationError):
        validate_binding(*mac)


@pytest.mark.parametrize("coverage", ["unknown", "partial", "unobserved"])
def test_explicit_frameless_coverage_keeps_unknown_clocks_and_owner(payload, coverage):
    item = gap(payload, coverage)
    payload["batch"]["records"].append(item)
    wire.validate(NAME, payload)
    payload.update(frames=[], batch={**payload["batch"], "records": [item]})
    before = deepcopy(payload)
    wire.validate_frame_batch(payload, user_id=item["source"]["user_id"])
    assert wire.decode_request(NAME, wire.canonical_request(NAME, payload)) == before
    assert payload == before
    with pytest.raises(ValidationError):
        wire.validate_frame_batch(payload, user_id="foreign-owner")


@pytest.mark.parametrize("promotion", ["observed", "operation", "artifacts", "utc", "media", "clock"])
def test_gap_cannot_be_promoted_to_observed_or_invented_evidence(payload, promotion):
    item = gap(payload)
    original = payload["batch"]["records"][0]
    if promotion == "observed":
        item["evidence"]["coverage"] = "observed_samples"
    elif promotion == "operation":
        item["evidence"] = deepcopy(original["evidence"])
    elif promotion == "artifacts":
        item["artifacts"] = deepcopy(original["artifacts"])
    else:
        field, value = {"utc": ("observed_at", "2026-09-30T12:00:00Z"),
                        "media": ("media_position", 3), "clock": ("clock", CLOCK)}[promotion]
        item[field] = deepcopy(value)
    payload.update(frames=[], batch={**payload["batch"], "records": [item]})
    validate_process("ProcessBatch", payload["batch"])
    rejected(payload)


@pytest.mark.parametrize("field,value", [("user_id", "other"), ("source_id", "other"), ("source_version", 2)])
def test_exact_frame_source_binding(payload, field, value):
    payload["frames"][0]["source"][field] = value
    validate_mac(payload["frames"][0])
    rejected(payload)


@pytest.mark.parametrize("field", ["device_id", "session_id", "stream_id"])
def test_exact_capture_incarnation(payload, field):
    payload["frames"][0][field] = "foreign-incarnation"
    validate_mac(payload["frames"][0])
    rejected(payload)


def test_framed_owner_check_does_not_grant_structured_producer_authority(payload):
    # The generic Process vocabulary is intentionally preserved. A trusted
    # runtime must separately enforce which producer can submit this evidence.
    assert payload["batch"]["records"][0]["method"] == "structured"
    before = deepcopy(payload)
    wire.validate_frame_batch(payload, user_id=payload["frames"][0]["source"]["user_id"])
    with pytest.raises(ValidationError):
        wire.validate_frame_batch(payload, user_id="another-principal")
    assert payload == before


@pytest.mark.parametrize("field,value", [("observed_at", "2026-09-30T12:00:00Z"),
                                        ("media_position", 3), ("clock", CLOCK)])
def test_native_clock_facts_cannot_invent_process_time(payload, field, value):
    payload["batch"]["records"][0][field] = deepcopy(value)
    validate_process("ProcessBatch", payload["batch"])
    rejected(payload)


@pytest.mark.parametrize("change", ["missing", "extra", "duplicate", "renamed"])
def test_frames_uniquely_exhaust_selected_record_frame_ids(payload, change):
    if change == "missing":
        payload["frames"] = []
    elif change == "renamed":
        payload["batch"]["records"][0]["frame_id"] = "absent-frame"
    else:
        frame = deepcopy(payload["frames"][0])
        if change == "extra":
            frame["frame_id"] = "unselected-frame"
        payload["frames"].append(frame)
    rejected(payload)


@pytest.mark.parametrize("role", [0, 1], ids=["raw-to-raw", "composed-to-raw"])
@pytest.mark.parametrize("separate_id", [False, True], ids=["same-artifact", "same-hash"])
def test_cross_frame_image_aliases_allow_distinct_native_paths(payload, role, separate_id):
    other = raw_alias(payload["frames"][0], images(payload["frames"][0])[role], separate_id=separate_id)
    append_frame(payload, other)
    before = deepcopy(payload)
    wire.validate(NAME, payload)
    assert payload == before


@pytest.mark.parametrize("role", [0, 1], ids=["raw-to-raw", "composed-to-raw"])
@pytest.mark.parametrize("identity,fact", [("artifact", "width"), ("hash", "height"), ("hash", "length")])
def test_individually_valid_frames_cannot_contradict_one_image_identity(payload, role, identity, fact):
    other = raw_alias(payload["frames"][0], images(payload["frames"][0])[role], separate_id=identity == "hash")
    if fact == "length":
        other["raw"]["artifact"]["byte_length"] += 1
    else:
        other["raw"][fact] += 1
    append_frame(payload, other)
    for frame in payload["frames"]:
        validate_mac(frame)
    validate_process("ProcessBatch", payload["batch"])
    # Structural schema cannot decide cross-frame immutable image facts.
    Draft202012Validator(wire.SCHEMA).validate(payload)
    rejected(payload)


@pytest.mark.parametrize("different_session", [False, True])
def test_native_filename_identity_is_scoped_to_native_session(payload, different_session):
    frame = payload["frames"][0]
    other = raw_alias(frame, frame["raw"])
    other.update(callback_sequence=frame["callback_sequence"])
    other["raw"]["native_file"] = frame["raw"]["native_file"]
    other["raw"]["artifact"]["sha256"] = "b" * 64
    if different_session:
        other["profile"]["native_session_id"] = "a-different-native-session"
    append_frame(payload, other)
    validate_mac(other)
    validate_process("ProcessBatch", payload["batch"])
    if different_session:
        wire.validate(NAME, payload)
    else:
        rejected(payload)


def test_distinct_hashes_do_not_hide_same_composed_native_file_conflict(payload):
    original = payload["frames"][0]
    other = deepcopy(original)
    other["frame_id"] = "second-composed-frame"
    other["composition"]["image"]["artifact"].update(artifact_id="other-composed-image", sha256="c" * 64)
    append_frame(payload, other)
    validate_mac(other)
    validate_process("ProcessBatch", payload["batch"])
    rejected(payload)


@pytest.mark.parametrize("change", ["duplicate_record", "duplicate_sequence", "future_parent", "missing_present_sequence"])
def test_existing_process_batch_semantics_remain_active(payload, change):
    other = raw_alias(payload["frames"][0], payload["frames"][0]["raw"])
    record = append_frame(payload, other)
    first = payload["batch"]["records"][0]
    if change == "duplicate_record":
        record["record_id"] = first["record_id"]
    elif change == "duplicate_sequence":
        record["sequence"] = first["sequence"]
    elif change == "future_parent":
        first["causal_parents"] = [record["record_id"]]
    else:
        item = gap(payload)
        item["evidence"]["missing_sequences"] = [{"first": 1, "last": 1}]
        item["evidence"]["limitations"].append("missing_events")
        payload["batch"]["records"].append(item)
    rejected(payload)


def test_ordered_replay_keeps_frames_records_refs_strokes_limits_and_evidence(payload):
    other = raw_alias(payload["frames"][0], payload["frames"][0]["raw"])
    append_frame(payload, other)
    item = gap(payload)
    item["causal_parents"] = [r["record_id"] for r in payload["batch"]["records"]]
    payload["batch"]["records"].append(item)
    ink = payload["frames"][0]["composition"]["ink"]
    ink["limits"].extend(["additional unknown A", "additional unknown B"])
    before = deepcopy(payload)
    canonical = wire.canonical_request(NAME, payload)
    reordered = json.loads(json.dumps(payload, sort_keys=True))
    assert wire.canonical_request(NAME, reordered) == canonical
    paths = [("frames",), ("batch", "records"), ("batch", "records", 0, "artifacts"),
             ("frames", 0, "composition", "ink", "strokes"),
             ("batch", "records", 2, "causal_parents"),
             ("batch", "records", 2, "evidence", "limitations")]
    for path in paths:
        changed = deepcopy(payload)
        target = changed
        for key in path:
            target = target[key]
        target.reverse()
        assert wire.canonical_request(NAME, changed) != canonical
    changed = deepcopy(payload)
    limits = changed["frames"][0]["composition"]["ink"]["limits"]
    limits[-2:] = reversed(limits[-2:])
    assert wire.canonical_request(NAME, changed) != canonical
    for replacement in ([], [{"x": 0, "y": 0, "width": 1, "height": 1}]):
        changed = deepcopy(payload)
        changed["frames"][0]["profile"]["sample"]["dirty_rects"] = replacement
        assert wire.canonical_request(NAME, changed) != canonical
    assert payload == before


@pytest.mark.parametrize("field,token", [("callback_sequence", "3"), ("callback_sequence", "3.0"),
                                        ("callback_sequence", "3e0"), ("revision", "2.0"), ("revision", "2e0")])
def test_released_integral_json_numbers_remain_valid_without_coercion(payload, field, token):
    path = ("frames", 0, field) if field == "callback_sequence" else ("frames", 0, "composition", "ink", field)
    set_field(payload, path, json.loads(token))
    before = json.dumps(payload, sort_keys=True)
    Draft202012Validator(wire.SCHEMA).validate(payload)
    wire.validate(NAME, payload)
    raw = json.dumps(payload).replace(f'"{field}": {json.dumps(json.loads(token))}', f'"{field}": {token}')
    decoded = wire.decode_request(NAME, raw.encode())
    assert json.dumps(decoded, sort_keys=True) == before
    assert json.dumps(payload, sort_keys=True) == before


@pytest.mark.parametrize("token", ["3.5", "3.0000000000000004", "true", "false", "9007199254740992"])
def test_fractional_boolean_and_unsafe_callback_ordinals_are_not_coerced(payload, token):
    payload["frames"][0]["callback_sequence"] = json.loads(token)
    rejected(payload)


@pytest.mark.parametrize("bad", [b'{"contract_version":"0.2.12","contract_version":"0.2.12"}',
                                  b'{"frames":[{"x":1,"x":2}]}', b'{"x":NaN}', b'{"x":Infinity}',
                                  b'{"x":-Infinity}', b'\xff', b'{', b'[' * 80 + b']' * 80])
def test_strict_json_decoder_rejects_ambiguous_or_nonfinite_input(bad):
    with pytest.raises(ValidationError):
        wire.decode_request(NAME, bad)


@pytest.mark.parametrize("nested", [False, True])
def test_duplicate_members_are_rejected_even_if_last_value_would_be_a_valid_request(payload, nested):
    encoded = json.dumps(payload)
    key, value = ("callback_sequence", "3") if nested else ("contract_version", '"0.2.12"')
    duplicated = encoded.replace(f'"{key}": {value}', f'"{key}": {value}, "{key}": {value}', 1)
    assert json.loads(duplicated) == payload
    with pytest.raises(ValidationError):
        wire.decode_request(NAME, duplicated.encode())


def test_raw_body_bound_and_immutable_utf8_bytes(payload):
    encoded = wire.canonical_request(NAME, payload)
    limit = wire.body_limit(NAME)
    assert limit == 4 * 1024 * 1024
    assert wire.decode_request(NAME, b" " * (limit - len(encoded)) + encoded) == payload
    for data in (b" " * (limit + 1), bytearray(encoded), encoded.decode()):
        with pytest.raises(ValidationError):
            wire.decode_request(NAME, data)


def test_canonical_size_bound_also_applies_after_short_numeric_json_decodes(payload):
    first = payload["frames"][0]
    first["profile"]["sample"]["dirty_rects"] = "RECTANGLES"
    for i in range(1, 60):
        other = deepcopy(first)
        other["frame_id"] = f"frame-{i}"
        append_frame(payload, other)
    rects = "[" + ",".join(['{"x":1e12,"y":1e12,"width":1e12,"height":1e12}'] * 1024) + "]"
    raw = json.dumps(payload, separators=(",", ":")).replace('"RECTANGLES"', rects).encode()
    assert len(raw) < wire.body_limit(NAME)
    canonical_size = len(json.dumps(json.loads(raw), ensure_ascii=False, separators=(",", ":")).encode())
    assert canonical_size > wire.body_limit(NAME)
    with pytest.raises(ValidationError, match="bounded transport size"):
        wire.decode_request(NAME, raw)


def test_record_and_frame_ceilings_are_exact(payload):
    for i in range(1, 100):
        frame = deepcopy(payload["frames"][0])
        frame["frame_id"] = f"frame-{i}"
        append_frame(payload, frame)
    wire.validate(NAME, payload)
    before = deepcopy(payload)
    payload["frames"].append(deepcopy(payload["frames"][0]))
    rejected(payload)
    payload = before
    payload["batch"]["records"].append({**deepcopy(payload["batch"]["records"][0]),
                                          "record_id": "overflow-record", "sequence": 101})
    rejected(payload)
    payload.update(frames=[], batch={**payload["batch"], "records": []})
    rejected(payload)


@pytest.mark.parametrize("target", ["envelope", "batch", "frame", "profile", "composition"])
def test_closed_objects_cannot_smuggle_live_or_disclosure_authority(payload, target):
    frame = payload["frames"][0]
    objects = {"envelope": payload, "batch": payload["batch"], "frame": frame,
               "profile": frame["profile"], "composition": frame["composition"]}
    objects[target]["live_capture_allowed"] = True
    rejected(payload)


@pytest.mark.parametrize("where,version", [("envelope", "0.2.11"), ("envelope", "0.2.10"),
                                          ("batch", "0.1.0"), ("frame", "0.2.12")])
def test_nested_versions_are_explicit_without_upgrading_old_formats(payload, where, version):
    {"envelope": payload, "batch": payload["batch"], "frame": payload["frames"][0]}[where]["contract_version"] = version
    rejected(payload)


@pytest.mark.parametrize("field", ["contract_version", "batch", "frames"])
def test_required_outer_members_are_never_defaulted(payload, field):
    del payload[field]
    rejected(payload)


def test_prior_envelope_families_reject_mac_even_under_their_own_outer_version(payload):
    for old, name, version in [(capture_ingress, "FrameBatchRequest", "0.2.4"),
                                (raw_capture_ingress, "RawFrameBatchRequest", "0.2.6"),
                                (desktop_capture_ingress, "DesktopFrameBatchRequest", "0.2.8"),
                                (windows_capture_ingress, "WindowsFrameBatchRequest", "0.2.10")]:
        before = deepcopy(payload)
        with pytest.raises(ValidationError):
            old.validate(name, payload)
        changed = deepcopy(payload)
        changed["contract_version"] = version
        with pytest.raises(ValidationError):
            old.validate(name, changed)
        rejected(changed)
        assert payload == before


@pytest.mark.parametrize("reader", ["v1", "process", "raw", "desktop", "windows", "mac"])
def test_descriptor_readers_do_not_accept_an_ingress_envelope(payload, reader):
    calls = {"v1": lambda: validate_v1("Frame", payload),
             "process": lambda: validate_process("ProcessBatch", payload),
             "raw": lambda: validate_raw(payload), "desktop": lambda: validate_desktop(payload),
             "windows": lambda: validate_windows(payload), "mac": lambda: validate_mac(payload)}
    before = deepcopy(payload)
    with pytest.raises(ValidationError):
        calls[reader]()
    assert payload == before


def test_named_entry_points_refuse_non_request_names(payload):
    with pytest.raises(ValueError):
        wire.validate("UnknownRequest", payload)
    with pytest.raises(ValueError):
        wire.body_limit("MacRetainedFrame")
    with pytest.raises(ValueError):
        wire.canonical_request("MacRetainedFrame", payload["frames"][0])


def test_ack_requires_declared_verified_tuples_for_both_pngs_ink_and_gap(payload):
    record = payload["batch"]["records"][0]
    record["artifacts"].append({"artifact_id": "editable-original", "sha256": "a" * 64,
                                "byte_length": 42, "media_type": "application/json"})
    payload["batch"]["records"].append(gap(payload))
    wire.validate(NAME, payload)
    batch = payload["batch"]
    ack = acknowledgment(batch)
    verified = frozenset(tuple(a[field] for field in ("artifact_id", "sha256", "byte_length", "media_type"))
                         for r in batch["records"] for a in r["artifacts"])
    before = deepcopy((batch, ack))
    wire.validate_ack(batch, ack, user_id=ack["user_id"], verified_artifacts=verified)
    assert (batch, ack) == before
    assert ack["acknowledged"][1]["artifacts"] == []
    with pytest.raises(ValidationError):
        wire.validate_ack(batch, ack, user_id=ack["user_id"])
    with pytest.raises(ValidationError):
        wire.validate_ack(batch, ack, user_id="foreign-owner", verified_artifacts=verified)
    for index in range(3):
        changed = deepcopy(ack)
        changed["acknowledged"][0]["artifacts"][index]["status"] = "pending"
        with pytest.raises(ValidationError):
            wire.validate_ack(batch, changed, user_id=ack["user_id"], verified_artifacts=verified)
    changed = deepcopy(ack)
    changed["acknowledged"].pop()
    with pytest.raises(ValidationError):
        wire.validate_ack(batch, changed, user_id=ack["user_id"], verified_artifacts=verified)


@pytest.mark.parametrize("code", sorted({c for codes in wire.ERROR_CODES.values() for c in codes}))
def test_content_free_error_codes_and_retry_permissions(code):
    error = {"contract_version": "0.2.12", "error": code, "retryable": False}
    wire.validate("MacOSIngressError", error)
    error["retryable"] = True
    if code in {"unavailable", "dependency_missing"}:
        wire.validate("MacOSIngressError", error)
    else:
        with pytest.raises(ValidationError):
            wire.validate("MacOSIngressError", error)


def test_errors_cannot_include_content_or_prior_version():
    error = {"contract_version": "0.2.12", "error": "invalid_request", "retryable": False}
    for changed in ({**error, "detail": "original source content"}, {**error, "contract_version": "0.2.10"},
                    {**error, "error": "exception_text"}):
        with pytest.raises(ValidationError):
            wire.validate("MacOSIngressError", changed)


def test_generated_schema_types_and_openapi_remain_deterministic_and_isolated():
    Draft202012Validator.check_schema(wire.SCHEMA)
    generated = outputs()
    assert generated == outputs()
    assert set(generated) == {"schema.json", "contracts.ts", "openapi.json"}
    for name, content in generated.items():
        assert (ROOT / "macos_capture_ingress/generated" / name).read_text() == content
    schema = json.loads(generated["schema.json"])
    assert schema["$ref"] == "#/$defs/MacOSFrameBatchRequest"
    for name, definition in MAC_SCHEMA["$defs"].items():
        assert schema["$defs"][name] == definition
        assert wire.SCHEMA["$defs"][name] is not definition
    assert wire.CONTRACT_VERSION == "0.2.12"
    assert wire.CAPABILITY == "process.macos-ingress.v0.2.12"
    assert 'export type MacOSFrameBatchRequest' in generated["contracts.ts"]
    assert 'export type MacRetainedFrame' in generated["contracts.ts"]
    assert 'readonly' in generated["contracts.ts"]
    api = build_document()
    assert json.loads(generated["openapi.json"]) == api
    assert set(api["paths"]) == {"/v2/process/macos-frames:batch"}
    operation = api["paths"]["/v2/process/macos-frames:batch"]["post"]
    assert operation["x-required-capabilities"] == [wire.CAPABILITY, "process.capture.v0.2"]
    assert operation["x-required-scopes"] == ["process:capture"]
    assert operation["x-max-body-bytes"] == 4 * 1024 * 1024
    assert operation["requestBody"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/MacOSFrameBatchRequest"}
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/ProcessBatchAck"}
    assert set(operation["responses"]) == {"200", *wire.ERROR_CODES}
    assert wire.ERROR_CODES == windows_capture_ingress.ERROR_CODES
