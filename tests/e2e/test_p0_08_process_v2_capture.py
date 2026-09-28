"""Independent QA regressions for the process capture 0.2.0 slice (main e63b28f).

Scope: version isolation and frozen 0.1.0, unknown kinds/fields, trusted-authority
comparisons and the stopped/revoked historical boundary, source/legacy-frame
binding, exact ACK partition and artifact preservation, immutable replay equality,
malformed UTF-8 and numerics. These are schema/helper checks only: they do not
exercise token authentication, database durability, stored parents, deletion,
providers, devices or any G7 acceptance. Confirmed gaps are strict xfail tests.
"""

import copy
import dataclasses
import json
import subprocess
from pathlib import Path

import pytest
from jsonschema import ValidationError

from packages.contracts import validate as validate_v1
from packages.contracts import process_v2
from packages.contracts.process_v2 import (
    CaptureAuthority, canonical_record, validate, validate_ack, validate_record_frame, validate_submission,
)

ROOT = Path(__file__).resolve().parents[2]
V2 = ROOT / "packages/contracts/process_v2"
EXAMPLES = json.loads((V2 / "examples/capture.json").read_text())
CORE = json.loads((ROOT / "packages/contracts/examples/core.json").read_text())
V1_BASELINE = "7fadd151c83118c22a4846bdb8b2622d47bb0df3"


def batch():
    return copy.deepcopy(EXAMPLES["ProcessBatch"])


def ack():
    return copy.deepcopy(EXAMPLES["ProcessBatchAck"])


def record(**changes):
    rec = copy.deepcopy(EXAMPLES["ProcessBatch"]["records"][0])
    rec.update(changes)
    return rec


def authority(**changes):
    base = dict(user_id="user-1", device_id="device-1", session_id="session-1", stream_id="capture-stream-1",
                scopes=frozenset({"process:capture"}), capabilities=frozenset({"process.capture.v0.2"}),
                source_versions=frozenset({("source-1", 1)}), attempts=frozenset(),
                transmission_allowed=True, live_capture_allowed=True, historical_through_sequence=None)
    base.update(changes)
    return CaptureAuthority(**base)


def rejects(fn, *args, **kwargs):
    with pytest.raises(ValidationError):
        fn(*args, **kwargs)


# --- Version isolation and frozen 0.1.0 ------------------------------------------

@pytest.mark.parametrize("path", [
    "packages/contracts/schema.json", "packages/contracts/validation.py",
    "packages/contracts/generated/contracts.ts", "packages/contracts/generated/openapi.json",
    "packages/contracts/examples/core.json", "packages/contracts/examples/http.json",
    "packages/contracts/__init__.py", "packages/contracts/HTTP.md", "packages/contracts/README.md",
    "packages/contracts/generate_types.py", "packages/contracts/generate_openapi.py",
])
def test_v1_contract_bytes_are_frozen_since_the_pre_v2_baseline(path):
    result = subprocess.run(["git", "-C", str(ROOT), "show", f"{V1_BASELINE}:{path}"], capture_output=True)
    assert result.returncode == 0, "pre-v2 baseline must be reachable from main"
    assert (ROOT / path).read_bytes() == result.stdout


def test_default_v1_validate_does_not_know_process_definitions():
    for name in ("ProcessBatch", "ProcessRecord", "ProcessBatchAck", "ProcessError"):
        with pytest.raises(ValueError):
            validate_v1(name, {})


def test_v2_rejects_v1_payloads_and_v1_rejects_v2_payloads():
    rejects(validate, "ProcessBatch", copy.deepcopy(CORE["EventBatch"]))
    rejects(validate_v1, "EventBatch", batch())


@pytest.mark.parametrize("mutate", [
    lambda b: b.update(contract_version="0.1.0"),
    lambda b: b.update(contract_version="0.3.0"),
    lambda b: b.update(extra_top_level=True),
    lambda b: b["records"][0].update(extra_record_field=1),
    lambda b: b["records"][0]["evidence"].update(extra_evidence_field=1),
    lambda b: b["records"][0]["evidence"].update(kind="diagnosis"),
    lambda b: b.update(delivery_mode="replay"),
])
def test_unknown_versions_kinds_and_fields_are_rejected(mutate):
    b = batch()
    mutate(b)
    rejects(validate, "ProcessBatch", b)


def test_generated_artifacts_are_current():
    result = subprocess.run([str(ROOT / ".venv/bin/python"), "-m", "packages.contracts.process_v2.generate", "--check"],
                            cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_importing_v2_does_not_mutate_the_v1_schema():
    from packages.contracts import validation as v1
    before = json.dumps(v1.SCHEMA, sort_keys=True)
    import importlib
    importlib.reload(process_v2.validation)
    assert json.dumps(v1.SCHEMA, sort_keys=True) == before
    assert "ProcessBatch" not in v1.SCHEMA["$defs"]


# --- Trusted authority and stopped/revoked boundary ------------------------------

def test_example_batch_passes_with_a_matching_authority():
    validate_submission(batch(), authority())


@pytest.mark.parametrize("changes", [
    dict(scopes=frozenset()), dict(capabilities=frozenset()), dict(device_id="device-2"),
    dict(session_id="session-2"), dict(stream_id="capture-stream-2"), dict(user_id="user-2"),
    dict(source_versions=frozenset({("source-1", 2)})), dict(transmission_allowed=False),
])
def test_authority_mismatch_or_withdrawal_rejects(changes):
    rejects(validate_submission, batch(), authority(**changes))


def test_stopped_live_delivery_rejects_and_historical_honours_pre_stop_boundary():
    live = batch()
    live["delivery_mode"] = "live"
    rejects(validate_submission, live, authority(live_capture_allowed=False, historical_through_sequence=5))
    stopped = authority(live_capture_allowed=False, historical_through_sequence=1)
    validate_submission(batch(), stopped)  # sequence 1 <= boundary 1
    later = batch()
    later["records"][0]["sequence"] = 2
    rejects(validate_submission, later, stopped)
    rejects(validate_submission, batch(), authority(live_capture_allowed=False, historical_through_sequence=None))


def test_withdrawn_transmission_denies_historical_replay_too():
    rejects(validate_submission, batch(), authority(transmission_allowed=False, live_capture_allowed=False,
                                                     historical_through_sequence=10))


def test_attempt_scope_must_match_a_current_relation_revision():
    b = batch()
    b["records"][0]["scope"] = {"kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 2}
    validate_submission(b, authority(attempts=frozenset({("problem-1", "attempt-1", 2)})))
    rejects(validate_submission, b, authority(attempts=frozenset({("problem-1", "attempt-1", 1)})))


# --- Source / legacy frame binding --------------------------------------------------

def frame_bound():
    b = batch()
    frame = copy.deepcopy(CORE["Frame"])
    frame.update(user_id="user-1", source_id="source-1", source_version=1, device_id="device-1", session_id="session-1",
                 frame_id="frame-legacy-1", artifact_id="frame-1", content_hash="a" * 64, media_position=None)
    b["records"][0]["frame_id"] = "frame-legacy-1"
    return b, frame


def test_record_frame_binding_accepts_the_exact_frame():
    b, frame = frame_bound()
    validate_record_frame(b, "process-1", frame)


@pytest.mark.parametrize("field,value", [
    ("frame_id", "frame-other"), ("user_id", "user-2"), ("source_id", "source-2"), ("source_version", 2),
    ("device_id", "device-2"), ("session_id", "session-2"), ("media_position", 12.5), ("content_hash", "b" * 64),
    ("artifact_id", "frame-missing"),
])
def test_record_frame_binding_rejects_each_mismatch(field, value):
    b, frame = frame_bound()
    frame[field] = value
    rejects(validate_record_frame, b, "process-1", frame)


# --- Exact ACK partition and artifact preservation -------------------------------

def test_example_ack_matches_with_pending_artifact():
    validate_ack(batch(), ack(), user_id="user-1")


def test_ack_cannot_drop_duplicate_or_add_records():
    a = ack()
    a["acknowledged"] = []
    rejects(validate_ack, batch(), a, user_id="user-1")
    a = ack()
    a["acknowledged"].append(copy.deepcopy(a["acknowledged"][0]))
    rejects(validate_ack, batch(), a, user_id="user-1")
    a = ack()
    extra = copy.deepcopy(a["acknowledged"][0])
    extra.update(record_id="process-2", sequence=2)
    a["acknowledged"].append(extra)
    rejects(validate_ack, batch(), a, user_id="user-1")


def test_verified_needs_independent_blob_identity_with_matching_size_and_type():
    a = ack()
    art = a["acknowledged"][0]["artifacts"][0]
    art["status"] = "verified"
    rejects(validate_ack, batch(), a, user_id="user-1")
    identity = (art["artifact_id"], art["sha256"], art["byte_length"], art["media_type"])
    validate_ack(batch(), a, user_id="user-1", verified_artifacts=frozenset({identity}))
    wrong_size = (art["artifact_id"], art["sha256"], art["byte_length"] + 1, art["media_type"])
    rejects(validate_ack, batch(), a, user_id="user-1", verified_artifacts=frozenset({wrong_size}))


@pytest.mark.parametrize("field,value", [("sha256", "b" * 64), ("byte_length", 1), ("media_type", "image/jpeg")])
def test_ack_cannot_change_an_immutable_artifact_reference(field, value):
    a = ack()
    a["acknowledged"][0]["artifacts"][0][field] = value
    rejects(validate_ack, batch(), a, user_id="user-1")


def test_ack_owner_and_stream_must_match():
    rejects(validate_ack, batch(), ack(), user_id="user-2")
    for key, value in (("batch_id", "batch-2"), ("device_id", "d2"), ("session_id", "s2"), ("stream_id", "x2")):
        a = ack()
        a[key] = value
        rejects(validate_ack, batch(), a, user_id="user-1")


# --- Immutable replay equality, UTF-8 and numerics -------------------------------

def test_canonical_bytes_ignore_transport_fields_and_key_order():
    a, b = batch(), batch()
    b["batch_id"] = "batch-9"
    b["delivery_mode"] = "live"
    b["records"][0] = dict(reversed(list(b["records"][0].items())))
    assert canonical_record(a, "process-1") == canonical_record(b, "process-1")


@pytest.mark.parametrize("mutate", [
    lambda b: b["records"][0]["source"].update(user_id="user-2"),
    lambda b: b.update(device_id="device-2"),
    lambda b: b.update(stream_id="capture-stream-2"),
    lambda b: b["records"][0]["evidence"]["after"].update(selected_option_ids=["C", "D"]),
])
def test_canonical_bytes_change_with_immutable_content(mutate):
    a, b = batch(), batch()
    mutate(b)
    assert canonical_record(a, "process-1") != canonical_record(b, "process-1")


def test_canonical_bytes_keep_text_and_unicode_forms_exactly():
    import unicodedata
    a, b = batch(), batch()
    nfc, nfd = unicodedata.normalize("NFC", "café λ"), unicodedata.normalize("NFD", "café λ")
    assert nfc != nfd
    for target, text in ((a, nfc), (b, nfd)):
        target["records"][0]["evidence"]["reason_quote"] = text
        validate("ProcessBatch", target)
    assert canonical_record(a, "process-1") != canonical_record(b, "process-1")
    assert nfc.encode("utf-8") in canonical_record(a, "process-1")


@pytest.mark.parametrize("value", [float("nan"), float("inf"), 2 ** 53, "\ud800"])
def test_non_finite_unsafe_or_non_utf8_values_are_rejected(value):
    b = batch()
    b["records"][0]["clock"]["elapsed_ms"] = value if not isinstance(value, str) else 1
    if isinstance(value, str):
        b["batch_id"] = value
    rejects(validate, "ProcessBatch", b)


# --- Confirmed gaps (strict xfail; IDs in docs/verification/qa/p0-08-process-v2-capture.md) ---

def gap(qid, reason):
    return pytest.mark.xfail(strict=True, reason=f"{qid}: {reason}")


def nested_text_body(template_json, needle, depth):
    """A JSON body json.loads accepts (~2 bytes per level) with a nested array in a text field."""
    return template_json.replace(needle, needle.split(": ")[0] + ": " + "[" * depth + "]" * depth)


def outcome(fn, *args):
    try:
        fn(*args)
    except ValidationError:
        return "rejected"
    except RecursionError:
        return "RecursionError"  # recorded outside the handler to keep the report short
    return "accepted"


V1_TEXT = '"text": "I confuse left and right multiplication."'
V2_QUOTE = '"reason_quote": null'


@pytest.mark.parametrize("depth", [20000])
def test_mid_depth_nesting_below_the_window_is_rejected_cleanly(depth):
    v1 = json.loads(nested_text_body(json.dumps(CORE["EventBatch"]), V1_TEXT, depth))
    v2 = json.loads(nested_text_body(json.dumps(EXAMPLES["ProcessBatch"]), V2_QUOTE, depth))
    assert outcome(validate_v1, "EventBatch", v1) == "rejected"
    assert outcome(validate, "ProcessBatch", v2) == "rejected"


@gap("QA-14", "v1 validate raises a bare RecursionError for a ~100 KB body nested ~52000 levels in a text field")
def test_v1_validate_rejects_52000_level_nesting_cleanly():
    payload = json.loads(nested_text_body(json.dumps(CORE["EventBatch"]), V1_TEXT, 52000))
    assert outcome(validate_v1, "EventBatch", payload) == "rejected"


@gap("QA-14", "process_v2.validate raises a bare RecursionError for the same body shape")
def test_v2_validate_rejects_52000_level_nesting_cleanly():
    payload = json.loads(nested_text_body(json.dumps(EXAMPLES["ProcessBatch"]), V2_QUOTE, 52000))
    assert outcome(validate, "ProcessBatch", payload) == "rejected"


@gap("QA-14", "authenticated POST /v1/events:batch propagates RecursionError (500) instead of 422")
def test_v1_events_endpoint_rejects_52000_level_nesting_with_422():
    import asyncio
    from datetime import datetime, timedelta, timezone

    httpx = pytest.importorskip("httpx")
    from services.api.app import create_app
    from services.api.auth import LocalTestAuthenticator, Principal
    from services.api.domain import Archive
    from services.api.storage import MemoryStore

    now = datetime(2026, 9, 28, tzinfo=timezone.utc)
    store = MemoryStore()
    Archive(store, clock=lambda: now).set_authorization("fixture-user")
    auth = LocalTestAuthenticator({"t": Principal("fixture-user", frozenset({"events:write"}), now + timedelta(hours=1))})
    app = create_app(store, auth, clock=lambda: now)
    body = nested_text_body(json.dumps(CORE["EventBatch"]), V1_TEXT, 52000)

    async def post():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test") as client:
            return await client.post("/v1/events:batch", content=body, headers={
                "Authorization": "Bearer t", "Idempotency-Key": "qa-14", "Content-Type": "application/json"})

    try:
        status = asyncio.run(post()).status_code
    except RecursionError:
        status = "RecursionError"
    assert status == 422


@gap("QA-P08-01", "one ProcessBatch may bind the same legacy frame_id with contradictory source/media/artifact")
def test_batch_rejects_contradictory_bindings_of_one_frame():
    b = batch()
    first = b["records"][0]
    first["frame_id"] = "frame-legacy-1"
    second = copy.deepcopy(first)
    second.update(record_id="process-2", sequence=2, media_position=30.0)
    second["artifacts"] = [dict(first["artifacts"][0], artifact_id="frame-2", sha256="c" * 64)]
    b["records"].append(second)
    rejects(validate, "ProcessBatch", b)


@gap("QA-P08-02", "standalone ProcessBatchAck accepts one artifact_id with conflicting immutable references")
def test_standalone_ack_rejects_conflicting_artifact_references():
    a = ack()
    receipt = a["acknowledged"][0]
    other = copy.deepcopy(receipt)
    other.update(record_id="process-2", sequence=2)
    other["artifacts"][0].update(sha256="b" * 64, byte_length=99999)
    a["acknowledged"].append(other)
    rejects(validate, "ProcessBatchAck", a)
