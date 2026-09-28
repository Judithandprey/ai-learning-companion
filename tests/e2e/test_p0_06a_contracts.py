"""P0-06A independent QA of contract 0.1.0 and its generated OpenAPI/TypeScript.

Written from README.md/HTTP.md promises, not from the implementation's own tests.
Passing tests reproduce invariants that hold. `xfail(strict=True)` tests record
confirmed gaps (IDs match docs/verification/qa/p0-06a-contract-acceptance.md);
they turn into failures when the gap is fixed so the marker gets removed.
These are contract-level checks only: no server, database, provider or device.
Run from the repository root: .venv/bin/python -m pytest -q tests/e2e
"""

import copy
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from openapi_spec_validator import validate as validate_openapi

from packages.contracts import CONTRACT_VERSION, validate, validate_selection_frame
from packages.contracts import generate_openapi, generate_types
from packages.contracts.validation import SCHEMA

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "packages" / "contracts"
CORE = json.loads((CONTRACTS / "examples" / "core.json").read_text())
HTTP = json.loads((CONTRACTS / "examples" / "http.json").read_text())
MAX_SAFE = 9007199254740991


def example(name):
    return copy.deepcopy(CORE.get(name) or HTTP[name])


def rejects(name, payload):
    with pytest.raises(ValidationError):
        validate(name, payload)


# --- Generated artifacts --------------------------------------------------------

def test_contract_version_and_generated_artifacts_are_current():
    assert CONTRACT_VERSION == "0.1.0"
    assert (CONTRACTS / "generated" / "contracts.ts").read_text() == generate_types.render()
    assert (CONTRACTS / "generated" / "openapi.json").read_text() == generate_openapi.render()
    assert generate_openapi.render() == generate_openapi.render()


def test_every_schema_definition_is_exported_to_typescript_and_openapi():
    ts = (CONTRACTS / "generated" / "contracts.ts").read_text()
    exported = set(re.findall(r"^export type (\w+) =", ts, re.MULTILINE))
    document = json.loads((CONTRACTS / "generated" / "openapi.json").read_text())
    assert exported == set(SCHEMA["$defs"])
    assert set(document["components"]["schemas"]) == set(SCHEMA["$defs"])
    assert "#/$defs/" not in json.dumps(document)


def openapi_validator(name):
    document = json.loads((CONTRACTS / "generated" / "openapi.json").read_text())
    schema = {"$schema": document["jsonSchemaDialect"], "components": document["components"], "$ref": f"#/components/schemas/{name}"}
    return Draft202012Validator(schema)


@pytest.mark.parametrize("name", sorted({**CORE, **HTTP}))
def test_examples_validate_against_published_openapi_components(name):
    validate_openapi(json.loads((CONTRACTS / "generated" / "openapi.json").read_text()))
    openapi_validator(name).validate(example(name))


def test_typescript_type_expectations_compile():
    tsc = ROOT / "node_modules" / ".bin" / "tsc"
    if not tsc.exists() or not shutil.which("node"):
        pytest.skip("Node/TypeScript not installed; run npm ci --ignore-scripts with Node 24.21.0 on PATH")
    result = subprocess.run([str(tsc), "--noEmit", "-p", str(ROOT / "tests" / "e2e" / "tsconfig.json")], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


# --- HTTP.md table versus generated OpenAPI ------------------------------------

EXPECTED_OPERATIONS = {
    ("post", "/v1/sources"): ("registerSource", "SourceRegistrationRequest", "SourceRegistrationResult", "sources:write", True, True),
    ("get", "/v1/sources/{source_id}"): ("getSource", None, "SourceReadResult", "sources:read", False, False),
    ("get", "/v1/sources/{source_id}/versions/{source_version}"): ("getSourceSnapshot", None, "SourceSnapshot", "sources:read", False, False),
    ("post", "/v1/events:batch"): ("ingestEventBatch", "EventBatch", "EventBatchAck", "events:write", True, False),
    ("get", "/v1/notes/{note_id}"): ("getNote", None, "NoteRevision", "notes:read", False, False),
    ("put", "/v1/notes/{note_id}"): ("putNote", "NoteRevision", "NoteWriteResult", "notes:write", True, True),
    ("post", "/v1/jobs/{job_id}/cancel"): ("cancelJob", None, "JobCancelResult", "jobs:cancel", False, False),
    ("get", "/v1/usage"): ("getUsage", None, "UsageResult", "usage:read", False, False),
}


def test_http_md_table_matches_generated_operations():
    table = (CONTRACTS / "HTTP.md").read_text()
    documented = {(m.lower(), p) for m, p in re.findall(r"^\| (GET|POST|PUT|DELETE|PATCH) `([^`]+)`", table, re.MULTILINE)}
    document = generate_openapi.build_document()
    generated = {(method, path) for path, item in document["paths"].items() for method in item if method != "parameters"}
    assert documented == generated == set(EXPECTED_OPERATIONS)
    for (method, path), (op_id, request, result, scope, idempotent, created) in EXPECTED_OPERATIONS.items():
        operation = document["paths"][path][method]
        assert operation["operationId"] == op_id
        assert operation["x-required-scope"] == scope
        assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {"$ref": f"#/components/schemas/{result}"}
        assert ("201" in operation["responses"]) == created
        body = operation.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        assert body == ({"$ref": f"#/components/schemas/{request}"} if request else None)
        has_key = {"$ref": "#/components/parameters/IdempotencyKey"} in operation.get("parameters", [])
        assert has_key == idempotent


def test_path_integers_are_js_safe_and_idempotency_header_is_required():
    document = generate_openapi.build_document()
    version = document["paths"]["/v1/sources/{source_id}/versions/{source_version}"]["parameters"][1]["schema"]
    revision = document["paths"]["/v1/notes/{note_id}"]["get"]["parameters"][0]["schema"]
    for schema in (version, revision):
        assert schema == {"type": "integer", "minimum": 1, "maximum": MAX_SAFE}
    header = document["components"]["parameters"]["IdempotencyKey"]
    assert header["in"] == "header" and header["required"] is True
    assert header["schema"] == {"$ref": "#/components/schemas/IdempotencyKey"}


# --- Source / frame / device / identity binding --------------------------------

@pytest.mark.parametrize("field,value", [
    ("user_id", "other-user"), ("source_id", "other-source"), ("source_version", 2),
    ("frame_id", "frame-2"), ("session_id", "other-session"), ("device_id", "device-iphone"),
    ("media_position", None), ("media_position", 12.6),
])
def test_selection_cannot_be_rebound_to_another_frame_context(field, value):
    selection, frame = example("Selection"), example("Frame")
    validate_selection_frame(selection, frame)
    frame[field] = value
    with pytest.raises(ValidationError, match="mismatch"):
        validate_selection_frame(selection, frame)


def test_bridge_selection_geometry_is_checked_inside_nested_payload():
    payload = example("BridgeRequest")
    payload["selection"]["polygon"] = [{"x": 0.1, "y": 0.2}, {"x": 0.4, "y": 0.2}, {"x": 0.4, "y": 0.4}]
    validate("BridgeRequest", payload)
    payload["selection"]["polygon"][2] = {"x": 0.45, "y": 0.4}
    rejects("BridgeRequest", payload)
    payload = example("BridgeRequest")
    payload["selection"]["bbox"].update(y=0.9, height=0.2)
    rejects("BridgeRequest", payload)


# --- Finite and JavaScript-safe numbers -----------------------------------------

@pytest.mark.parametrize("name,path", [
    ("Frame", ["media_position"]), ("Selection", ["bbox", "x"]), ("Observation", ["confidence"]),
    ("NoteRevision", ["context_segments", 0, "media_position"]),
])
@pytest.mark.parametrize("value", [float("nan"), float("inf"), json.loads("-1e400")])
def test_nonfinite_values_rejected_in_nested_number_fields(name, path, value):
    payload = example(name) if name != "Observation" else example("EventBatch")["events"][0]
    target = payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    rejects(name, payload)


@pytest.mark.parametrize("name,field", [
    ("Frame", "source_version"), ("Frame", "width"), ("NoteRevision", "revision"),
    ("BudgetReservation", "estimated_max_fen"), ("UsageResult", "monthly_limit_fen"),
])
def test_integers_above_max_safe_integer_rejected(name, field):
    payload = example(name)
    payload[field] = MAX_SAFE + 1
    rejects(name, payload)


def test_nullable_integer_branches_keep_js_safe_bound():
    record = example("SourceRecord")
    record.update(access_status="ready", current_version=MAX_SAFE + 1)
    rejects("SourceRecord", record)
    usage = example("UsageResult")
    usage["subscriptions"][0].update(quota_status="known", remaining_units=MAX_SAFE + 1)
    rejects("UsageResult", usage)


def test_booleans_are_not_integers():
    note = example("NoteRevision")
    note.update(revision=True, base_revision=False)
    rejects("NoteRevision", note)


# --- Notes: user originals, ink and revision rules ------------------------------

def handwritten_note():
    note = example("NoteRevision")
    note.update(kind="handwritten", authorship="user", ink_blob_id="ink-1",
                blocks=[{"id": "block-ink", "layer": "user_original", "format": "image", "content": "ink-1 preview"}])
    return note


def test_handwritten_note_requires_original_ink_and_user_authorship():
    validate("NoteRevision", handwritten_note())
    for change in ({"ink_blob_id": None}, {"authorship": "assistant"}):
        note = handwritten_note()
        note.update(change)
        rejects("NoteRevision", note)


@pytest.mark.parametrize("revision,base,ok", [(1, 0, True), (2, 1, True), (2, 0, False), (1, 1, False), (0, 0, False)])
def test_revision_must_follow_its_compare_and_swap_base(revision, base, ok):
    note = handwritten_note()
    note.update(revision=revision, base_revision=base)
    if ok:
        validate("NoteRevision", note)
    else:
        rejects("NoteRevision", note)


def test_note_evidence_must_cover_every_context_segment():
    note = handwritten_note()
    note["context_segments"].append({"source_id": "linear-algebra", "source_version": 1, "frame_id": "frame-2", "media_position": 30.0, "source_event_ids": ["event-2"]})
    rejects("NoteRevision", note)
    note["source_event_ids"].append("event-2")
    validate("NoteRevision", note)


def test_write_result_cannot_report_non_server_persistence():
    result = {"note": handwritten_note(), "persistence": "server_committed", "replayed": False}
    validate("NoteWriteResult", result)
    for value in ("local_only", "queued", "mock"):
        rejects("NoteWriteResult", {**result, "persistence": value})


# --- Source registration versus fetch; URL and header values -------------------

@pytest.mark.parametrize("url", [
    "https://example.invalid/course?video=2&unit=1#t=12", "HTTPS://Example.invalid/a",
    "http://[2001:db8::1]:8080/x", "https://example.invalid:443/",
])
def test_registration_accepts_and_preserves_http_urls(url):
    payload = {"original_url": url, "project_id": None}
    validate("SourceRegistrationRequest", payload)
    assert payload["original_url"] == url


@pytest.mark.parametrize("url", [
    "http://@example.invalid/", "http://:@example.invalid/", "https://user@example.invalid/",
    "ftp://example.invalid/", "data:text/html,x", "ws://example.invalid/", "http:example.invalid",
    "http://[2001:db8::1/", "https://example.invalid:99999/", "https://example.invalid/a b",
    "https://example.invalid/\u007f", "", "https://example.invalid/" + "a" * 8192,
])
def test_registration_rejects_malformed_credential_or_non_http_urls(url):
    rejects("SourceRegistrationRequest", {"original_url": url, "project_id": None})


@pytest.mark.parametrize("key,ok", [
    ("retry-1", True), ("a" * 128, True), ("a:b.c_d-e", True), ("", False), ("a" * 129, False),
    ("-leading", False), ("has space", False), ("abc\r\nX-Injected: 1", False), ("clé", False), ("abc\n", False),
])
def test_idempotency_key_header_values(key, ok):
    if ok:
        validate("IdempotencyKey", key)
    else:
        rejects("IdempotencyKey", key)


def test_registered_record_is_not_a_fetched_snapshot():
    record = example("SourceRecord")
    validate("SourceRecord", record)
    rejects("SourceRecord", {**record, "current_version": 1})
    for status in ("fetched", "parsed", "indexed", "ready"):
        rejects("SourceRecord", {**record, "access_status": status})
    # Reauthentication may retain an older archived snapshot.
    validate("SourceRecord", {**record, "access_status": "needs_auth", "current_version": 3})
    validate("SourceRecord", {**record, "access_status": "needs_auth"})


def test_registration_request_cannot_claim_identity_or_synthetic_type():
    base = {"original_url": "https://example.invalid/a", "project_id": None}
    rejects("SourceRegistrationRequest", {**base, "user_id": "someone-else"})
    rejects("SourceRegistrationRequest", {**base, "type": "synthetic"})
    rejects("SourceRegistrationRequest", {"original_url": "https://example.invalid/a"})


# --- Budget, unknown quota and cancellation ------------------------------------

@pytest.mark.parametrize("actual,reserved,remaining,ok", [
    (250, 50, 99700, True), (100000, 0, 0, True), (99990, 20, 0, True), (100010, 10, 0, True),
    (99990, 20, -10, False), (250, 50, 99750, False), (0, 0, 100001, False),
])
def test_remaining_budget_includes_reservations_and_floors_at_zero(actual, reserved, remaining, ok):
    usage = example("UsageResult")
    usage.update(actual_fen=actual, reserved_fen=reserved, remaining_fen=remaining)
    if ok:
        validate("UsageResult", usage)
    else:
        rejects("UsageResult", usage)


@pytest.mark.parametrize("status,units,ok", [
    ("unknown", None, True), ("unknown", 0, False), ("known", None, False), ("known", 0, True),
    ("exhausted", 0, True), ("exhausted", None, False), ("exhausted", 5, False),
])
def test_subscription_quota_never_invents_a_balance(status, units, ok):
    usage = example("UsageResult")
    usage["subscriptions"][0].update(quota_status=status, remaining_units=units)
    if ok:
        validate("UsageResult", usage)
    else:
        rejects("UsageResult", usage)


def test_usage_fixes_currency_timezone_and_disables_paid_execution():
    for change in ({"currency": "USD"}, {"budget_timezone": "UTC"}, {"paid_executor_enabled": True}, {"budget_month": "2026-13"}):
        rejects("UsageResult", {**example("UsageResult"), **change})


def test_reservation_money_is_integer_fen_and_settlement_is_explicit():
    reservation = example("BudgetReservation")
    validate("BudgetReservation", reservation)
    rejects("BudgetReservation", {**reservation, "state": "settled"})
    validate("BudgetReservation", {**reservation, "state": "settled", "actual_fen": reservation["estimated_max_fen"] + 1})
    rejects("BudgetReservation", {**reservation, "state": "released", "actual_fen": 0})
    rejects("BudgetReservation", {**reservation, "estimated_max_fen": 1.5})


@pytest.mark.parametrize("state,requested,ok", [
    ("cancelling", True, True), ("cancelled", True, True), ("completed", True, True),
    ("failed", True, True), ("cancelling", False, False), ("cancelled", False, False),
])
def test_cancel_result_states_are_truthful(state, requested, ok):
    payload = {"job_id": "job-1", "state": state, "cancel_requested": requested}
    if ok:
        validate("JobCancelResult", payload)
    else:
        rejects("JobCancelResult", payload)


# --- Confirmed gaps (strict xfail) ---------------------------------------------
# Each test asserts the documented rule. It fails today; when the owner fixes the
# gap, strict xfail reports XPASS as a failure so the marker is removed.

def gap(qid, reason):
    return pytest.mark.xfail(strict=True, reason=f"{qid}: {reason}")


def test_media_position_integer_literal_must_be_finite_for_javascript():
    frame = example("Frame")
    frame["media_position"] = json.loads("1" + "0" * 400)
    rejects("Frame", frame)


def test_overlong_timezone_is_a_validation_error_not_a_crash():
    batch = example("EventBatch")
    batch["events"][0]["source_timezone"] = "Z" * 256
    rejects("EventBatch", batch)


@gap("QA-03", "SourceSnapshot URLs use format uri, weaker than HttpUrl")
@pytest.mark.parametrize("field,url", [("original_url", "javascript:alert(1)"), ("canonical_url", "https://user:pw@example.invalid/")])
def test_snapshot_urls_follow_registration_url_rules(field, url):
    snapshot = example("SourceSnapshot")
    snapshot[field] = url
    rejects("SourceSnapshot", snapshot)


@gap("QA-04", "a newly created registration can claim fetched content")
def test_new_registration_result_cannot_claim_fetched_version():
    result = example("SourceRegistrationResult")
    result["source"].update(access_status="ready", current_version=1)
    assert result["already_exists"] is False
    rejects("SourceRegistrationResult", result)


@gap("QA-05", "synthetic provenance can claim learning consent or a user-authorized origin")
@pytest.mark.parametrize("change", [
    {"provenance": {"consent_scope": "learning"}},
    {"type": "synthetic", "provenance": {"origin": "user_authorized"}},
])
def test_synthetic_data_stays_test_only(change):
    snapshot = example("SourceSnapshot")
    snapshot["provenance"].update(change.pop("provenance"))
    snapshot.update(change)
    rejects("SourceSnapshot", snapshot)


@gap("QA-06", "one EventBatch may reuse an event_id with other content or reuse a device sequence")
@pytest.mark.parametrize("change", [{"device_sequence": 2, "text": "changed"}, {"event_id": "event-2", "text": "other"}])
def test_single_batch_cannot_contain_conflicting_event_identities(change):
    batch = example("EventBatch")
    batch["events"].append({**batch["events"][0], **change})
    rejects("EventBatch", batch)


@gap("QA-07", "EventBatchAck can report one event as both accepted and duplicate")
def test_ack_is_exact_per_event():
    ack = {"contract_version": "0.1.0", "acknowledged": [
        {"event_id": "event-1", "device_id": "device-ipad", "device_sequence": 1, "status": status}
        for status in ("accepted", "duplicate")]}
    rejects("EventBatchAck", ack)


@gap("QA-08", "frame_id and gap_flags can contradict each other")
@pytest.mark.parametrize("frame_id,flags", [("frame-1", ["missing_frame"]), (None, ["stale_frame"])])
def test_observation_capture_gap_matches_frame_reference(frame_id, flags):
    event = example("EventBatch")["events"][0]
    event.update(frame_id=frame_id, gap_flags=flags)
    rejects("Observation", event)


@gap("QA-09", "ContextSegment.frame_id is non-nullable, so missing capture needs an invented frame id")
def test_note_can_record_missing_frame_honestly():
    note = example("NoteRevision")
    note["context_segments"][0]["frame_id"] = None
    validate("NoteRevision", note)


@gap("QA-10", "CapabilityResult status can contradict its own checks and evidence")
def test_capability_pass_requires_matching_check_and_evidence():
    record = {"gate": "G1", "capability": "Pencil ASK on iPad Safari", "status": "device_pass", "environment": "", "evidence": [],
              "limitation": "", "fallback": "", "checks": {"documentation": "pass", "implementation": "not_tested", "compilation": "not_tested",
                                                          "automated": "not_tested", "provider": "not_applicable", "device": "fail"}}
    rejects("CapabilityResult", record)


@gap("QA-11", "Python \\d accepts non-ASCII digits in budget_month; ECMA-262 patterns do not")
def test_budget_month_uses_ascii_digits_only():
    usage = example("UsageResult")
    usage["budget_month"] = "２０２６-09"
    rejects("UsageResult", usage)


# --- Re-test of the QA-01/QA-02 fixes at 7367c2c --------------------------------

@pytest.mark.parametrize("literal,ok", [
    ("9007199254740991", True), ("9007199254740992", False), ("1" + "0" * 400, False),
    ("1e300", True), ("-0.0", True), ("9007199254740991.0", True),
])
def test_safe_integer_guard_keeps_valid_numbers(literal, ok):
    frame = example("Frame")
    frame["media_position"] = json.loads(literal)
    if ok:
        validate("Frame", frame)
    else:
        rejects("Frame", frame)


def test_large_numbers_inside_strings_are_untouched():
    batch = example("EventBatch")
    batch["events"][0]["text"] = "12345678901234567890123"
    validate("EventBatch", batch)


@pytest.mark.parametrize("zone,ok", [
    ("Etc/GMT+5", True), ("America/Argentina/Buenos_Aires", True), ("Z" * 255, False), ("Z" * 5000, False),
    ("America", False), ("UTC\x00", False), ("/etc/passwd", False),
])
def test_timezone_names_after_oserror_fix(zone, ok):
    batch = example("EventBatch")
    batch["events"][0]["source_timezone"] = zone
    if ok:
        validate("EventBatch", batch)
    else:
        rejects("EventBatch", batch)


def nested_frame_text(depth):
    return json.dumps(example("Frame"))[:-1] + ', "extra": ' + '{"k": ' * depth + "1" + "}" * depth + "}"


def test_moderately_nested_unknown_field_is_a_validation_error():
    rejects("Frame", json.loads(nested_frame_text(900)))


# QA-12: retain the independent regression after replacing the recursive guard.
def test_deeply_nested_payload_is_a_validation_error_not_a_crash():
    # Build the Python input without relying on a particular JSON decoder's
    # nesting limit. The HTTP regression below separately tests raw JSON.
    payload = example("Frame")
    nested = 1
    for _ in range(3000):
        nested = {"k": nested}
    payload["extra"] = nested
    outcome = "accepted"
    try:
        validate("Frame", payload)
    except ValidationError:
        outcome = "rejected"
    except RecursionError:
        outcome = "RecursionError"  # fail outside the handler: a chained 1000-frame traceback takes ~10 s to report
    assert outcome == "rejected"


def test_backend_rejects_deeply_nested_body_with_422():
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
    auth = LocalTestAuthenticator({"token": Principal("fixture-user", frozenset({"sources:write"}), now + timedelta(hours=1))})
    app = create_app(store, auth, clock=lambda: now)
    body = '{"original_url": "https://example.invalid/a", "project_id": null, "extra": ' + '{"k": ' * 3000 + "1" + "}" * 3000 + "}"

    async def post():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test") as client:
            return await client.post("/v1/sources", content=body, headers={
                "Authorization": "Bearer token", "Idempotency-Key": "qa-12", "Content-Type": "application/json"})

    try:
        status = asyncio.run(post()).status_code
    except RecursionError:
        status = "RecursionError"  # see above: keep the deep traceback out of the report
    assert status == 422
