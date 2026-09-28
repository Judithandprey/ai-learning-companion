import copy
import json
import re
from pathlib import Path

import pytest
from jsonschema import ValidationError
from openapi_spec_validator import validate as validate_openapi

from packages.contracts import validate
from packages.contracts.generate_openapi import build_document, render, rewrite_refs
from packages.contracts.validation import SCHEMA

ROOT = Path(__file__).parents[1]
EXAMPLES = json.loads((ROOT / "examples" / "http.json").read_text())


def test_openapi_standard_and_generated_artifact():
    document = build_document()
    validate_openapi(document)
    assert (ROOT / "generated" / "openapi.json").read_text() == render()
    assert document["components"]["schemas"] == rewrite_refs(SCHEMA["$defs"])


@pytest.mark.parametrize("name", EXAMPLES)
def test_http_examples_validate(name):
    validate(name, EXAMPLES[name])


@pytest.mark.parametrize("name,value", [
    ("IdempotencyKey", "retry-1\n"),
    ("IdempotencyKey", "a" * 128 + "\n"),
    ("Identifier", "source-1\n"),
    ("Identifier", "source-1\r\n"),
])
def test_header_keys_and_identifiers_have_no_trailing_control_chars(name, value):
    with pytest.raises(ValidationError):
        validate(name, value)


def test_registration_minimal_request_and_paid_calls_disabled():
    validate("SourceRegistrationRequest", {"original_url":"https://example.invalid/a", "project_id":None})
    usage = copy.deepcopy(EXAMPLES["UsageResult"])
    usage["paid_executor_enabled"] = True
    with pytest.raises(ValidationError):
        validate("UsageResult", usage)


@pytest.mark.parametrize("url", [
    "javascript:alert(1)", "file:///etc/passwd", "https:///no-host",
    "https://username:password@example.invalid/", "https://example.invalid:65536/",
    "https://example.invalid/\npath", "https://example.invalid\\@other.invalid/",
])
def test_registration_rejects_non_http_or_credential_urls(url):
    payload = copy.deepcopy(EXAMPLES["SourceRegistrationRequest"])
    payload["original_url"] = url
    with pytest.raises(ValidationError):
        validate("SourceRegistrationRequest", payload)


def test_registration_preserves_url_and_does_not_accept_a_claimed_identity():
    payload = copy.deepcopy(EXAMPLES["SourceRegistrationRequest"])
    original = "https://example.invalid/course?video=2&unit=1#theorem"
    payload["original_url"] = original
    validate("SourceRegistrationRequest", payload)
    assert payload["original_url"] == original
    payload["user_id"] = "someone-else"
    with pytest.raises(ValidationError):
        validate("SourceRegistrationRequest", payload)


def test_registration_cannot_claim_fetched_contents():
    record = copy.deepcopy(EXAMPLES["SourceRecord"])
    record["current_version"] = 1
    with pytest.raises(ValidationError, match="Registration"):
        validate("SourceRecord", record)
    record["current_version"] = None
    record["access_status"] = "ready"
    with pytest.raises(ValidationError, match="snapshot version"):
        validate("SourceRecord", record)


def test_current_source_version_is_available_for_readback():
    payload = copy.deepcopy(EXAMPLES["SourceReadResult"])
    payload["source"].update(access_status="ready", current_version=2)
    payload["snapshot_versions"] = [1]
    with pytest.raises(ValidationError, match="retrievable"):
        validate("SourceReadResult", payload)
    payload["snapshot_versions"].append(2)
    validate("SourceReadResult", payload)


def test_usage_cannot_ignore_reserved_money_or_invent_quota():
    payload = copy.deepcopy(EXAMPLES["UsageResult"])
    payload["remaining_fen"] += payload["reserved_fen"]
    with pytest.raises(ValidationError, match="reservations"):
        validate("UsageResult", payload)
    payload = copy.deepcopy(EXAMPLES["UsageResult"])
    payload["subscriptions"][0]["remaining_units"] = 100
    with pytest.raises(ValidationError, match="unknown balance"):
        validate("UsageResult", payload)


def test_usage_reports_actual_overage_without_fake_negative_balance():
    payload = copy.deepcopy(EXAMPLES["UsageResult"])
    payload.update(actual_fen=100010, reserved_fen=10, remaining_fen=0)
    validate("UsageResult", payload)


def test_requesting_cancel_does_not_imply_executor_stopped():
    payload = copy.deepcopy(EXAMPLES["JobCancelResult"])
    validate("JobCancelResult", payload)
    assert payload["state"] == "cancelling"
    payload["cancel_requested"] = False
    with pytest.raises(ValidationError, match="recorded request"):
        validate("JobCancelResult", payload)


def test_each_operation_is_authenticated_and_resolves_all_path_parameters():
    document = build_document()
    assert document["security"] == [{"BearerAuth": []}]
    scopes = set(SCHEMA["$defs"]["AuthorizationContext"]["properties"]["scopes"]["items"]["enum"])
    seen = set()
    for path, item in document["paths"].items():
        path_parameters = {parameter["name"] for parameter in item.get("parameters", [])}
        assert set(re.findall(r"\{([^}]+)\}", path)) == path_parameters
        for method, operation in item.items():
            if method == "parameters":
                continue
            assert operation.get("security", document["security"]) != []
            assert operation["x-required-scope"] in scopes
            assert operation["operationId"] not in seen
            seen.add(operation["operationId"])
            for code in ("401", "403", "404", "409", "422", "503"):
                assert operation["responses"][code]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/ApiError"}
            if method in {"post", "put"} and not path.endswith("/cancel"):
                assert {"$ref": "#/components/parameters/IdempotencyKey"} in operation["parameters"]
