"""Adversarial local contract checks, not durable storage or device evidence.

Authority snapshots and verified-blob tuples below are test inputs. Their use does
not authenticate a caller, prove a committed transaction, or verify real bytes.
"""

import copy
from dataclasses import replace
import hashlib
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from openapi_spec_validator import validate as validate_openapi

from packages.contracts import validate as validate_v1
from packages.contracts.process_v2 import (
    CaptureAuthority, canonical_record, validate, validate_ack, validate_submission,
)
from packages.contracts.process_v2.validation import SCHEMA

ROOT = Path(__file__).resolve().parents[1]
V2 = ROOT / "process_v2"
SAFE = 2**53 - 1

# Independently calculated from git show 7fdebd87e93b0e863beeef932565b5a3af2dc446:path.
# These constants deliberately do not derive from the current worktree or HEAD.
# QA-14 explicitly hardens validation.py without changing the v1 wire shapes;
# only its pin advances from fa91408753f048b673ccf129e5151fd4ae5ca26ad36519e89b38ea0649b61817.
LEGACY_SHA256 = {
    "schema.json": "befd60fb968fc976eeba8f38f182e10d9a45145b48f03cbe1c27d4bfbb4d93ff",
    "validation.py": "f3e2c3e7926865896a7dae6e56585b68cd72f84d498df9b6864f2fe613a1f254",
    "generate_types.py": "cb8bac0f8895a8f54c5e6f0fe8f6454c46b673e389aaf55bdb61416e55c900f9",
    "generate_openapi.py": "8ea3f7586ca9b0bf00cd9783a6b993d2a3da674619017941071a24fcaf87a50e",
    "generated/contracts.ts": "c9fb706b0b764a0ba9acf06e057aeb1642487d8e44306bd434982353917d9db4",
    "generated/openapi.json": "3599c325b6e1623f867ea63f8668c74c5f72b9dd9aa7dba20f3b3a4e5b42906e",
}


@pytest.fixture
def batch():
    first = {
        "record_id": "record-1", "sequence": 1,
        "source": {"user_id": "user-1", "source_id": "source-1", "source_version": 1},
        "scope": {"kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 1},
        "observed_at": "2026-09-28T00:00:01Z",
        "clock": {"domain_id": "clock-1", "elapsed_ms": 100, "uncertainty_ms": None},
        "media_position": 1.25, "frame_id": None, "surface": "web_dom", "method": "structured",
        "causal_parents": [], "artifacts": [],
        "evidence": {
            "kind": "operation", "operation": "select", "observed_actor": "user",
            "actor_basis": "trusted_input_event", "reason_quote": None,
            "before": {"kind": "choices", "selected_option_ids": []},
            "after": {"kind": "choices", "selected_option_ids": ["option-B"]},
        },
    }
    second = copy.deepcopy(first)
    second.update(
        record_id="record-3", sequence=3, scope={"kind": "provisional_session"},
        observed_at=None, surface="external_app", method="visual", causal_parents=["record-1"],
        artifacts=[{"artifact_id": "pixels-1", "sha256": "a" * 64, "byte_length": 17, "media_type": "image/png"}],
        evidence={
            "kind": "operation", "operation": "visible_change", "observed_actor": "unknown",
            "actor_basis": "visual_observation", "reason_quote": None,
            "before": {"kind": "unknown", "reason": "not_observed"},
            "after": {"kind": "artifact", "artifact_id": "pixels-1"},
        },
    )
    return {
        "contract_version": "0.2.0", "batch_id": "batch-1", "device_id": "device-1",
        "session_id": "session-1", "stream_id": "stream-1", "delivery_mode": "live",
        "records": [first, second],
    }


@pytest.fixture
def authority():
    return CaptureAuthority(
        user_id="user-1", device_id="device-1", session_id="session-1", stream_id="stream-1",
        scopes=frozenset({"process:capture"}), capabilities=frozenset({"process.capture.v0.2"}),
        source_versions=frozenset({("source-1", 1)}), attempts=frozenset({("problem-1", "attempt-1", 1)}),
        transmission_allowed=True, live_capture_allowed=True, historical_through_sequence=None,
    )


def receipt_for(batch):
    return {
        "contract_version": "0.2.0", "user_id": "user-1",
        **{key: batch[key] for key in ("batch_id", "device_id", "session_id", "stream_id")},
        "acknowledged": [
            {"record_id": r["record_id"], "sequence": r["sequence"], "disposition": "accepted",
             "received_at": "2026-09-28T00:00:05Z", "envelope": "committed",
             "artifacts": [{**a, "status": "pending"} for a in r["artifacts"]]}
            for r in batch["records"]
        ],
    }


def change(payload, path, value):
    for key in path[:-1]:
        payload = payload[key]
    payload[path[-1]] = value


def coverage_record(batch):
    record = copy.deepcopy(batch["records"][1])
    record.update(record_id="coverage-4", sequence=4, artifacts=[], causal_parents=["record-3"])
    record["evidence"] = {
        "kind": "coverage", "coverage": "partial", "from_clock_ms": 0, "through_clock_ms": 100,
        "missing_sequences": [{"first": 2, "last": 2}], "limitations": ["missing_events"],
    }
    return record


@pytest.mark.parametrize("path,digest", LEGACY_SHA256.items())
def test_legacy_bytes_remain_frozen(path, digest):
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest


def test_legacy_examples_still_validate_and_versions_are_explicit(batch):
    for filename in ("core.json", "http.json"):
        for name, example in json.loads((ROOT / "examples" / filename).read_text()).items():
            validate_v1(name, example)
    with pytest.raises(ValueError):
        validate_v1("ProcessBatch", batch)
    with pytest.raises(ValidationError):
        validate_v1("EventBatch", batch)
    with pytest.raises(ValidationError):
        validate_v1("Observation", batch["records"][0])
    old = json.loads((ROOT / "examples" / "core.json").read_text())["EventBatch"]
    with pytest.raises(ValidationError):
        validate("ProcessBatch", old)


def test_resolved_schema_and_generated_http_are_consistent():
    from packages.contracts.process_v2.generate import build_document, render_openapi, render_types

    Draft202012Validator.check_schema(SCHEMA)
    document = build_document()
    validate_openapi(document)
    assert (V2 / "generated" / "contracts.ts").read_text() == render_types()
    assert (V2 / "generated" / "openapi.json").read_text() == render_openapi()
    assert set(document["paths"]) == {"/v2/process/events:batch"}
    operation = document["paths"]["/v2/process/events:batch"]["post"]
    assert operation["x-required-scope"] == "process:capture"
    assert operation["x-required-capability"] == "process.capture.v0.2"
    assert document["security"] == [{"BearerAuth": []}]


def test_published_capture_examples_have_exact_pending_ack():
    examples = json.loads((V2 / "examples" / "capture.json").read_text())
    for name, payload in examples.items():
        validate(name, payload)
    payload = examples["ProcessBatch"]
    validate_ack(payload, examples["ProcessBatchAck"], user_id=payload["records"][0]["source"]["user_id"])


def test_valid_mixed_records_preserve_inputs_and_unknowns(batch, authority):
    original = copy.deepcopy(batch)
    validate_submission(batch, authority)
    for record in batch["records"]:
        validate("ProcessRecord", record)
    validate_ack(batch, receipt_for(batch), user_id="user-1")
    assert batch == original


@pytest.mark.parametrize("path,value", [
    (("contract_version",), "0.1.0"), (("contract_version",), "0.3.0"),
    (("delivery_mode",), "replay_and_restart"), (("token",), "page-supplied"),
    (("records", 0, "help_permission"), "solution"),
    (("records", 0, "source", "actor"), "user"),
    (("records", 0, "scope", "kind"), "diagnosis"),
    (("records", 0, "evidence", "kind"), "assistance"),
    (("records", 0, "evidence", "observed_actor"), "teacher"),
    (("records", 0, "evidence", "before", "kind"), "full_history"),
    (("records", 0, "evidence", "after", "submit"), True),
    (("records", 0, "observed_at"), "2026-02-30T00:00:00Z"),
    (("records", 0, "observed_at"), "2026-09-28T00:00:00+00:00"),
])
def test_unknown_authority_fields_kinds_and_versions_fail_closed(batch, path, value):
    change(batch, path, value)
    with pytest.raises(ValidationError):
        validate("ProcessBatch", batch)


@pytest.mark.parametrize("value", [True, 0, -1, SAFE + 1])
def test_sequences_are_safe_positive_integers(batch, value):
    batch["records"][0]["sequence"] = value
    with pytest.raises(ValidationError):
        validate("ProcessBatch", batch)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf"), json.loads("1e400"), 10**400, SAFE + 1])
def test_number_fields_reject_nonfinite_and_unsafe_integer_literals(batch, value):
    batch["records"][0]["media_position"] = value
    with pytest.raises(ValidationError):
        validate("ProcessBatch", batch)


def test_numeric_boundaries_and_nested_guard(batch):
    batch["records"][1]["sequence"] = SAFE
    batch["records"][0]["media_position"] = SAFE
    batch["records"][1]["artifacts"][0]["byte_length"] = SAFE
    validate("ProcessBatch", batch)
    batch["records"][1]["artifacts"][0]["byte_length"] = SAFE + 1
    with pytest.raises(ValidationError, match="safe integer"):
        validate("ProcessBatch", batch)


@pytest.mark.parametrize("text", ["\ud800", "\udfff", "before\ud800after"])
def test_lone_surrogates_are_validation_errors_before_replay_encoding(batch, text):
    batch["records"][0]["evidence"]["reason_quote"] = text
    with pytest.raises(ValidationError):
        validate("ProcessBatch", batch)
    with pytest.raises(ValidationError):
        canonical_record(batch, "record-1")


def test_chinese_and_emoji_source_words_survive_canonical_replay(batch):
    words = "保留原话：先别告诉我答案 📝"
    batch["records"][0]["evidence"]["reason_quote"] = words
    validate("ProcessBatch", batch)
    encoded = canonical_record(batch, "record-1")
    assert words.encode("utf-8") in encoded
    assert json.loads(encoded)["record"]["evidence"]["reason_quote"] == words


@pytest.mark.parametrize("code,retryable,allowed", [
    ("unavailable", True, True), ("dependency_missing", True, True),
    ("unavailable", False, True), ("record_conflict", False, True),
    ("forbidden", True, False), ("capture_stopped", True, False),
    ("idempotency_conflict", True, False), ("unsupported_version", True, False),
])
def test_process_errors_do_not_retry_authorization_or_immutable_conflicts(code, retryable, allowed):
    error = {"contract_version": "0.2.0", "error": code, "request_id": "request-1", "retryable": retryable}
    if allowed:
        validate("ProcessError", error)
    else:
        with pytest.raises(ValidationError):
            validate("ProcessError", error)


@pytest.mark.parametrize("field,value", [
    ("user_id", "foreign-user"), ("device_id", "foreign-device"),
    ("session_id", "foreign-session"), ("stream_id", "foreign-stream"),
    ("scopes", frozenset({"notes:write"})), ("capabilities", frozenset()),
    ("source_versions", frozenset()), ("source_versions", frozenset({("source-1", 2)})),
    ("attempts", frozenset({("problem-1", "attempt-1", 2)})),
    ("attempts", frozenset({("problem-2", "attempt-1", 1)})),
])
def test_submission_requires_exact_trusted_authority(batch, authority, field, value):
    with pytest.raises(ValidationError):
        validate_submission(batch, replace(authority, **{field: value}))


def test_every_record_is_checked_against_source_authority(batch, authority):
    batch["records"][1]["source"]["user_id"] = "foreign-user"
    with pytest.raises(ValidationError, match="Source"):
        validate_submission(batch, authority)


@pytest.mark.parametrize("mode", ["live", "historical"])
def test_revoked_transmission_also_blocks_historical_replay(batch, authority, mode):
    batch["delivery_mode"] = mode
    with pytest.raises(ValidationError, match="Transmission"):
        validate_submission(batch, replace(authority, transmission_allowed=False))


def test_scoped_stop_preserves_only_authorized_pre_stop_history(batch, authority):
    stopped = replace(authority, live_capture_allowed=False, historical_through_sequence=3)
    with pytest.raises(ValidationError, match="stopped"):
        validate_submission(batch, stopped)
    batch["delivery_mode"] = "historical"
    validate_submission(batch, stopped)
    for boundary in (None, 2):
        with pytest.raises(ValidationError, match="pre-stop"):
            validate_submission(batch, replace(stopped, historical_through_sequence=boundary))
    # Another independently authorized stream remains usable; this is a snapshot check only.
    batch.update(stream_id="stream-2", delivery_mode="live")
    validate_submission(batch, replace(authority, stream_id="stream-2"))


@pytest.mark.parametrize("actor", ["user", "ai"])
def test_site_feedback_cannot_be_promoted_to_learner_or_ai_work(batch, actor):
    batch["records"][0]["evidence"].update(operation="site_feedback", observed_actor=actor)
    with pytest.raises(ValidationError, match="Website feedback"):
        validate("ProcessBatch", batch)


def test_observed_site_feedback_and_ai_action_are_facts_not_grants(batch):
    evidence = batch["records"][0]["evidence"]
    evidence.update(operation="site_feedback", observed_actor="website", actor_basis="script_observation")
    validate("ProcessBatch", batch)
    evidence.update(operation="select", observed_actor="ai")
    validate("ProcessBatch", batch)
    evidence["submission_authorized"] = True
    with pytest.raises(ValidationError):
        validate("ProcessBatch", batch)


@pytest.mark.parametrize("operation", ["select", "text_edit", "ink_edit", "erase", "undo", "redo"])
def test_pixels_do_not_establish_internal_operations(batch, operation):
    batch["records"][1]["evidence"]["operation"] = operation
    with pytest.raises(ValidationError, match="Pixels"):
        validate("ProcessBatch", batch)


def test_actor_and_visual_provenance_do_not_gain_certainty(batch):
    batch["records"][0]["evidence"]["actor_basis"] = "unknown"
    with pytest.raises(ValidationError, match="Unknown actor"):
        validate("ProcessBatch", batch)
    batch["records"][0]["evidence"]["observed_actor"] = "unknown"
    validate("ProcessBatch", batch)
    batch["records"][1]["evidence"]["actor_basis"] = "trusted_input_event"
    with pytest.raises(ValidationError, match="Visual-only"):
        validate("ProcessBatch", batch)


def test_batch_rejects_duplicate_identity_sequence_and_local_cycles(batch):
    for field in ("record_id", "sequence"):
        invalid = copy.deepcopy(batch)
        invalid["records"][1][field] = invalid["records"][0][field]
        with pytest.raises(ValidationError, match="Duplicate"):
            validate("ProcessBatch", invalid)
    batch["records"][0]["causal_parents"] = ["record-3"]
    with pytest.raises(ValidationError, match="precede"):
        validate("ProcessBatch", batch)
    batch["records"][0]["causal_parents"] = ["record-1"]
    with pytest.raises(ValidationError, match="itself"):
        validate("ProcessBatch", batch)


def test_arrival_order_is_not_causality_and_external_refs_need_service_resolution(batch):
    batch["records"].reverse()
    batch["records"][1]["causal_parents"] = ["earlier-external-record"]
    validate("ProcessBatch", batch)  # Local validity is not evidence that the external subject exists.


def test_artifact_state_must_resolve_and_immutable_ref_cannot_conflict(batch):
    invalid = copy.deepcopy(batch)
    invalid["records"][1]["artifacts"] = []
    with pytest.raises(ValidationError, match="immutable reference"):
        validate("ProcessBatch", invalid)
    artifact = copy.deepcopy(batch["records"][1]["artifacts"][0])
    batch["records"][0]["artifacts"] = [artifact]
    validate("ProcessBatch", batch)
    artifact["sha256"] = "b" * 64
    with pytest.raises(ValidationError, match="Conflicting"):
        validate("ProcessBatch", batch)


def test_coverage_records_preserve_explicit_sequence_gaps(batch):
    batch["records"].append(coverage_record(batch))
    validate("ProcessBatch", batch)
    batch["records"][-1]["evidence"]["missing_sequences"] = [{"first": 1, "last": 2}]
    with pytest.raises(ValidationError, match="missing sequence"):
        validate("ProcessBatch", batch)


def test_coverage_can_preserve_unknown_clock_without_fabricating_precision(batch):
    record = coverage_record(batch)
    record["clock"] = None
    record["evidence"].update(from_clock_ms=None, through_clock_ms=None)
    validate("ProcessRecord", record)


@pytest.mark.parametrize("field,value", [
    ("from_clock_ms", None), ("from_clock_ms", 101), ("through_clock_ms", 101),
    ("coverage", "observed_samples"), ("limitations", ["sample_only"]),
    ("missing_sequences", [{"first": 3, "last": 2}]),
    ("missing_sequences", [{"first": 4, "last": 4}]),
    ("missing_sequences", [{"first": 1, "last": 2}, {"first": 2, "last": 3}]),
])
def test_coverage_cannot_invent_an_ordered_complete_capture(batch, field, value):
    record = coverage_record(batch)
    record["evidence"][field] = value
    with pytest.raises(ValidationError):
        validate("ProcessRecord", record)


@pytest.mark.parametrize("field", ["batch_id", "device_id", "session_id", "stream_id", "user_id"])
def test_ack_cannot_rebind_batch_or_owner(batch, field):
    ack = receipt_for(batch)
    ack[field] = "foreign"
    with pytest.raises(ValidationError, match="ACK"):
        validate_ack(batch, ack, user_id="user-1")


@pytest.mark.parametrize("mutation", ["missing_record", "extra_record", "wrong_sequence", "duplicate_record", "missing_artifact", "extra_artifact", "changed_artifact", "uncommitted"])
def test_ack_is_exact_per_record_and_artifact_not_a_high_water_mark(batch, mutation):
    ack = receipt_for(batch)
    rows = ack["acknowledged"]
    if mutation == "missing_record":
        rows.pop(0)
    elif mutation == "extra_record":
        rows.append({**rows[0], "record_id": "unsent-record", "sequence": 2})
    elif mutation == "wrong_sequence":
        rows[0]["sequence"] = 2
    elif mutation == "duplicate_record":
        rows.append(copy.deepcopy(rows[0]))
    elif mutation == "missing_artifact":
        rows[1]["artifacts"] = []
    elif mutation == "extra_artifact":
        rows[0]["artifacts"] = copy.deepcopy(rows[1]["artifacts"])
    elif mutation == "changed_artifact":
        rows[1]["artifacts"][0]["sha256"] = "b" * 64
    else:
        rows[0]["envelope"] = "pending"
    with pytest.raises(ValidationError):
        validate_ack(batch, ack, user_id="user-1")


def test_pending_artifact_is_not_verified_by_an_envelope_ack(batch):
    ack = receipt_for(batch)
    validate_ack(batch, ack, user_id="user-1")
    artifact = ack["acknowledged"][1]["artifacts"][0]
    artifact["status"] = "verified"
    identity = (artifact["artifact_id"], artifact["sha256"], artifact["byte_length"], artifact["media_type"])
    with pytest.raises(ValidationError, match="independently verified"):
        validate_ack(batch, ack, user_id="user-1")
    for index, wrong in enumerate(("other-id", "b" * 64, 18, "image/jpeg")):
        wrong_identity = (*identity[:index], wrong, *identity[index + 1:])
        with pytest.raises(ValidationError, match="independently verified"):
            validate_ack(batch, ack, user_id="user-1", verified_artifacts=frozenset({wrong_identity}))
    ack["acknowledged"].reverse()
    ack["acknowledged"][0]["disposition"] = "duplicate"
    validate_ack(batch, ack, user_id="user-1", verified_artifacts=frozenset({identity}))


def test_replay_canonical_equality_excludes_transport_but_keeps_captured_facts(batch):
    original = canonical_record(batch, "record-1")
    replay = json.loads(json.dumps(batch, sort_keys=True))
    replay.update(batch_id="resend-2", delivery_mode="historical")
    replay["records"].reverse()
    assert canonical_record(replay, "record-1") == original
    with pytest.raises(ValueError, match="not in batch"):
        canonical_record(batch, "never-submitted")


@pytest.mark.parametrize("path,value", [
    (("device_id",), "device-2"), (("session_id",), "session-2"), (("stream_id",), "stream-2"),
    (("records", 0, "source", "source_version"), 2),
    (("records", 0, "scope", "relation_revision"), 2),
    (("records", 0, "frame_id"), "other-frame"),
    (("records", 0, "media_position"), 1.5),
    (("records", 0, "evidence", "after", "selected_option_ids"), ["option-C"]),
    (("records", 0, "evidence", "reason_quote"), "I changed my mind"),
])
def test_changed_replay_payload_is_not_equal(batch, path, value):
    original = canonical_record(batch, "record-1")
    change(batch, path, value)
    assert canonical_record(batch, "record-1") != original


@pytest.fixture
def framed_capture(batch):
    """A real v1 fixture object/fixture bytes, never a real-device capture claim."""
    frame = json.loads((ROOT / "examples" / "core.json").read_text())["Frame"]
    pixels = (ROOT / "examples" / "frame.svg").read_bytes()
    assert hashlib.sha256(pixels).hexdigest() == frame["content_hash"]
    record = batch["records"][1]
    record.update(
        source={key: frame[key] for key in ("user_id", "source_id", "source_version")},
        frame_id=frame["frame_id"], media_position=frame["media_position"],
        artifacts=[{"artifact_id": frame["artifact_id"], "sha256": frame["content_hash"],
                    "byte_length": len(pixels), "media_type": "image/svg+xml"}],
    )
    record["evidence"]["after"]["artifact_id"] = frame["artifact_id"]
    batch.update(device_id=frame["device_id"], session_id=frame["session_id"], records=[record])
    return batch, frame


def test_synthetic_v1_frame_binds_to_exact_record_without_claiming_freshness(framed_capture):
    from packages.contracts.process_v2 import validate_record_frame

    batch, frame = framed_capture
    original = copy.deepcopy((batch, frame))
    validate_v1("Frame", frame)
    validate_record_frame(batch, "record-3", frame)
    assert (batch, frame) == original
    # Historical source identity is meaningful even when no observed timestamp is known.
    batch["delivery_mode"] = "historical"
    assert batch["records"][0]["observed_at"] is None
    validate_record_frame(batch, "record-3", frame)


@pytest.mark.parametrize("field,value", [
    ("frame_id", "other-frame"), ("user_id", "other-user"),
    ("source_id", "other-source"), ("source_version", 2),
    ("device_id", "other-device"), ("session_id", "other-session"),
    ("media_position", 12.75), ("media_position", None),
    ("artifact_id", "other-artifact"), ("content_hash", "b" * 64),
])
def test_frame_binding_rejects_each_individually_valid_foreign_identity(framed_capture, field, value):
    from packages.contracts.process_v2 import validate_record_frame

    batch, frame = framed_capture
    frame[field] = value
    validate_v1("Frame", frame)  # Failure must come from binding, not malformed v1 input.
    with pytest.raises(ValidationError):
        validate_record_frame(batch, "record-3", frame)


def test_null_frame_reference_is_honest_unknown_not_a_binding(framed_capture):
    from packages.contracts.process_v2 import validate_record_frame

    batch, frame = framed_capture
    batch["records"][0]["frame_id"] = None
    validate("ProcessBatch", batch)
    with pytest.raises(ValidationError):
        validate_record_frame(batch, "record-3", frame)
    del batch["records"][0]["frame_id"]
    with pytest.raises(ValidationError):
        validate("ProcessBatch", batch)


def test_frame_binding_requires_supplied_frame_and_record(framed_capture):
    from packages.contracts.process_v2 import validate_record_frame

    batch, _ = framed_capture
    with pytest.raises(ValidationError):
        validate_record_frame(batch, "record-3", None)
    with pytest.raises((ValidationError, ValueError)):
        validate_record_frame(batch, "not-submitted", framed_capture[1])


def test_frame_binding_requires_explicit_artifact_reference(framed_capture):
    from packages.contracts.process_v2 import validate_record_frame

    batch, frame = framed_capture
    # Leave a valid text observation; matching frame_id alone must not attest its artifact.
    record = batch["records"][0]
    record["evidence"]["after"] = {"kind": "text", "text": "Visible formula"}
    record["artifacts"] = []
    validate("ProcessBatch", batch)
    with pytest.raises(ValidationError):
        validate_record_frame(batch, "record-3", frame)
