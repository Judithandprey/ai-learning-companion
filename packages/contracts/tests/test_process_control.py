"""Synthetic control checks; trusted snapshots are inputs, not DB/auth/device proof."""

from copy import deepcopy
from dataclasses import replace
import hashlib
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from openapi_spec_validator import validate as validate_openapi

from packages.contracts import validate as validate_v1
from packages.contracts.process_v2 import validate as validate_capture, validate_submission
from packages.contracts.process_control import (
    CAPABILITY, ControlAuthority, capture_authority, register_stream, transition_stream, validate,
)
from packages.contracts.process_control.validation import SCHEMA
from packages.contracts.process_control.generate import build_document, outputs

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def authority():
    return ControlAuthority("owner", "ipad", "lesson", 3, 4, True, True,
                            frozenset({"process:control", "process:capture"}),
                            frozenset({CAPABILITY, "process.capture.v0.2"}), start_stream_id="stream-1")


@pytest.fixture
def registration():
    return {"contract_version": "0.2.1", "device_id": "ipad", "session_id": "lesson",
            "stream_id": "stream-1", "continuity": {"kind": "initial"},
            "authorization_generation": 3, "membership_revision": 4}


def command(state, kind, boundary=None):
    action = {"kind": kind}
    if kind != "withdraw":
        action["pre_stop_sequence"] = boundary
    return {**{k: state[k] for k in ("contract_version", "device_id", "session_id", "stream_id")},
            "expected_revision": state["revision"], "action": action}


def batch(state, sequence, mode):
    record = {"record_id": "record-1", "sequence": sequence,
        "source": {"user_id": "owner", "source_id": "course", "source_version": 1},
        "scope": {"kind": "provisional_session"}, "observed_at": None, "clock": None,
        "media_position": None, "frame_id": None, "surface": "external_app", "method": "visual",
        "causal_parents": [], "artifacts": [], "evidence": {
            "kind": "operation", "operation": "visible_change", "observed_actor": "unknown",
            "actor_basis": "unknown", "reason_quote": None,
            "before": {"kind": "unknown", "reason": "not_observed"},
            "after": {"kind": "unknown", "reason": "not_observed"}}}
    return {"contract_version": "0.2.0", "batch_id": "batch-1", "delivery_mode": mode,
            **{k: state[k] for k in ("device_id", "session_id", "stream_id")}, "records": [record]}


def submit(state, authority, sequence, mode):
    resolved = capture_authority(state, authority, source_versions={("course", 1)})
    return validate_submission(batch(state, sequence, mode), resolved)


def test_local_lifecycle_preserves_versions_and_never_resumes(authority, registration):
    original = deepcopy(registration)
    live = register_stream(registration, authority)
    assert registration == original and live["revision"] == 1
    submit(live, authority, 1, "live")
    stopped = transition_stream(live, command(live, "stop"), authority, committed_through_sequence=0)
    assert live["state"] == "live" and stopped["revision"] == 2
    for mode in ("live", "historical"):
        with pytest.raises(ValidationError):
            submit(stopped, authority, 1, mode)
    sealed = transition_stream(stopped, command(stopped, "seal_stop", 7), authority,
                               verified_pre_stop_sequence=7, committed_through_sequence=5)
    submit(sealed, authority, 7, "historical")
    for sequence, mode in ((8, "historical"), (1, "live")):
        with pytest.raises(ValidationError):
            submit(sealed, authority, sequence, mode)
    withdrawn = transition_stream(sealed, command(sealed, "withdraw"), authority, committed_through_sequence=0)
    assert withdrawn["revision"] == 4 and withdrawn["pre_stop_sequence"] is None
    for mode in ("historical", "live"):
        with pytest.raises(ValidationError):
            submit(withdrawn, authority, 1, mode)
    with pytest.raises(ValidationError):
        transition_stream(withdrawn, command(withdrawn, "withdraw"), authority, committed_through_sequence=0)


@pytest.mark.parametrize("mutation", ["user_id", "device_id", "session_id", "authorization_generation", "membership_revision", "membership_active", "scopes", "capabilities"])
def test_current_fences_prevent_mapping_stale_state(authority, registration, mutation):
    live = register_stream(registration, authority)
    changed = {"user_id": "other", "device_id": "other", "session_id": "other",
               "authorization_generation": 4, "membership_revision": 5, "membership_active": False,
               "scopes": frozenset(), "capabilities": frozenset()}
    revoked = replace(authority, **{mutation: changed[mutation]})
    with pytest.raises(ValidationError):
        capture_authority(live, revoked, source_versions={("course", 1)})
    with pytest.raises(ValidationError):
        transition_stream(live, command(live, "stop"), revoked, committed_through_sequence=0)


@pytest.mark.parametrize("value", [False, None, 1, "true"])
def test_start_requires_actual_trusted_boolean(authority, registration, value):
    with pytest.raises(ValidationError):
        register_stream(registration, replace(authority, capture_start_authorized=value))


def test_restart_is_fresh_same_producer_and_gap_unknown(authority, registration):
    old = register_stream(registration, authority)
    closed = transition_stream(old, command(old, "stop", 0), authority, verified_pre_stop_sequence=0, committed_through_sequence=0)
    for mode in ("historical", "live"):
        with pytest.raises(ValidationError):
            submit(closed, authority, 1, mode)
    restart = {**registration, "stream_id": "stream-2", "continuity": {
        "kind": "restart", "previous_stream_id": "stream-1", "gap": "unknown"}}
    new_authority = replace(authority, authorization_generation=4, start_stream_id="stream-2")
    restart["authorization_generation"] = 4
    new = register_stream(restart, new_authority, predecessor=closed)
    assert new["revision"] == 1 and new["authorization_generation"] == 4
    for predecessor in (None, old, {**closed, "device_id": "other"}, {**closed, "user_id": "other"}):
        with pytest.raises(ValidationError):
            register_stream(restart, new_authority, predecessor=predecessor)
    with pytest.raises(ValidationError):
        register_stream({**restart, "stream_id": "stream-1"}, new_authority, predecessor=closed)
    with pytest.raises(ValidationError):
        register_stream(registration, authority, predecessor=closed)


@pytest.mark.parametrize("boundary,verified,floor", [(5, None, 0), (5, 6, 0), (1, True, 0), (4, 4, 5), (1, 1, True), (1, 1, -1)])
def test_boundary_requires_independent_fact_and_committed_floor(authority, registration, boundary, verified, floor):
    live = register_stream(registration, authority)
    with pytest.raises(ValidationError):
        transition_stream(live, command(live, "stop", boundary), authority,
                          verified_pre_stop_sequence=verified, committed_through_sequence=floor)
    assert live["state"] == "live"


@pytest.mark.parametrize("change", [{"authorization_generation": 4}, {"membership_revision": 5},
                                  {"start_stream_id": "other"}, {"start_stream_id": None}])
def test_delayed_uncommitted_start_cannot_inherit_new_permission(authority, registration, change):
    with pytest.raises(ValidationError):
        register_stream(registration, replace(authority, **change))


def test_cas_seal_and_revision_overflow_reject_without_mutating(authority, registration):
    live = register_stream(registration, authority)
    known = transition_stream(live, command(live, "stop", 5), authority, verified_pre_stop_sequence=5, committed_through_sequence=0)
    for request in (command(live, "withdraw"), command(known, "seal_stop", 6), command(known, "stop", 6)):
        with pytest.raises(ValidationError):
            transition_stream(known, request, authority, verified_pre_stop_sequence=6, committed_through_sequence=0)
    live["revision"] = 2**53 - 1
    with pytest.raises(ValidationError):
        transition_stream(live, command(live, "withdraw"), authority, committed_through_sequence=0)
    assert live["revision"] == 2**53 - 1


@pytest.mark.parametrize("field,value", [("contract_version", "0.2.0"), ("stream_id", "x\n"), ("capture_start_authorized", True), ("pre_stop_sequence", 10)])
def test_wire_rejects_old_version_or_injected_authority(registration, field, value):
    with pytest.raises(ValidationError):
        validate("StreamRegistration", {**registration, field: value})


def test_no_unconditional_retry_or_live_boundary(authority, registration):
    for code in ("forbidden", "stale_revision", "invalid_transition"):
        with pytest.raises(ValidationError):
            validate("ControlError", {"contract_version": "0.2.1", "error": code, "retryable": True})
    state = register_stream(registration, authority)
    with pytest.raises(ValidationError):
        validate("StreamState", {**state, "pre_stop_sequence": 99})
    for validate_old in (validate_v1, validate_capture):
        with pytest.raises(ValueError):
            validate_old("StreamRegistration", registration)


def test_schema_generation_and_openapi_obligations():
    Draft202012Validator.check_schema(SCHEMA)
    document = build_document()
    validate_openapi(document)
    assert document["security"] == [{"BearerAuth": []}]
    for path, methods in document["paths"].items():
        for method, operation in methods.items():
            assert operation["x-required-capability"] == CAPABILITY
            assert operation["x-required-scope"] == "process:control"
            assert set(operation["responses"]) == {"200", "401", "403", "404", "409", "422", "503"}
            if method == "post":
                assert {"$ref": "#/components/parameters/IdempotencyKey"} in operation["parameters"]
    for name, expected in outputs().items():
        assert (ROOT / "process_control/generated" / name).read_text() == expected


def test_checked_example_and_malformed_json_fail_closed():
    example = json.loads((ROOT / "process_control/examples/stop.json").read_text())
    for name, value in example.items():
        if name == "evidence_kind":
            continue
        kind = "StreamRegistration" if name == "registration" else "StreamCommand" if name.endswith("command") else "StreamState"
        validate(kind, value)
    malformed = [float("nan"), "\ud800", {"unexpected": 2**53}]
    deep = []
    for _ in range(80):
        deep = [deep]
    cyclic = []
    cyclic.append(cyclic)
    for value in [*malformed, deep, cyclic]:
        with pytest.raises(ValidationError):
            validate("StreamRegistration", value)


def test_compatibility_artifacts_remain_frozen():
    # Independently read from committed fc079e9, not computed from current files.
    pins = json.loads((Path(__file__).parent / "fixtures/process-control-compatibility.json").read_text())
    for path, expected in pins.items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, path
