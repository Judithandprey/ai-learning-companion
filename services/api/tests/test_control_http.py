"""In-process HTTP control tests with explicit synthetic identity/start facts.

ASGITransport starts no listener, device, producer, database or provider. These
checks prove the opt-in HTTP boundary, not actual capture or physical stopping.
"""

import asyncio
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import httpx
import pytest

from packages.contracts.process_control import CAPABILITY, validate
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.control_app import MAX_CONTROL_BODY_BYTES, create_control_app
from services.api.errors import DomainError
from services.api.storage import MemoryStore, _MemoryTransaction
from services.api.tests.test_control import (
    USER, command, control_fixture, documents, registration, resolve_stop_fact, stop_fact,
)


ROOT = Path(__file__).resolve().parents[3]
NOW = datetime(2026, 9, 29, 12, tzinfo=timezone.utc)
COLLECTION = "/v2/process/streams"
STREAM = COLLECTION + "/stream-1"
COMMAND = STREAM + ":control"
CONTROL_CAPS = frozenset({CAPABILITY})


def request(app, method, path, *, token="control-token", request_key=None, headers=(), body=None,
            content=None, chunks=None):
    async def run():
        fields = list(headers)
        if token is not None:
            fields.append(("Authorization", f"Bearer {token}"))
        if request_key is not None:
            fields.append(("Idempotency-Key", request_key))
        options = {"headers": fields}
        if body is not None:
            options["json"] = body
        if content is not None:
            options["content"] = content
        if chunks is not None:
            async def stream():
                for chunk in chunks:
                    yield chunk
            options["content"] = stream()
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://control.test") as client:
            return await client.request(method, path, **options)

    return asyncio.run(run())


@pytest.fixture
def setup():
    c = control_fixture(MemoryStore(), USER, registered=False)
    c.archive.set_authorization("other-user")
    c.instant = [NOW]
    control = Principal(USER, frozenset({"process:control"}), NOW + timedelta(hours=1))
    c.auth = LocalTestAuthenticator({
        "control-token": control,
        "source-token": replace(control, scopes=frozenset({"sources:read", "process:capture"})),
        "foreign-token": replace(control, user_id="other-user"),
        "expired-token": replace(control, expires_at=NOW),
    })
    c.app = create_control_app(c.store, c.auth, capabilities=CONTROL_CAPS,
                               stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0])
    return c


def error(response, status, code):
    assert response.status_code == status
    assert response.json() == {"contract_version": "0.2.1", "error": code,
                               "retryable": code == "unavailable"}
    validate("ControlError", response.json())
    assert response.headers["cache-control"] == "no-store"
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"


def state(response, expected):
    assert response.status_code == 200
    validate("StreamState", response.json())
    assert response.json()["state"] == expected
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def grant(c, body=None, *, producer="screen"):
    c.registry.authorize_start(USER, body or c.registration, producer_id=producer)


def register(c, *, request_key="register-http", body=None):
    return request(c.app, "POST", COLLECTION, body=body or c.registration, request_key=request_key)


@pytest.fixture
def registered(setup):
    grant(setup)
    state(register(setup), "live")
    return setup


def test_http_lifecycle_requires_independent_start_and_replays_current_state(setup):
    c = setup
    before = documents(c)
    error(register(c), 403, "forbidden")
    assert documents(c) == before
    grant(c)
    live = state(register(c), "live")
    assert state(request(c.app, "GET", STREAM), "live") == live
    stop = command(c)
    stopped = state(request(c.app, "POST", COMMAND, body=stop, request_key="stop-http"), "stopped")
    assert stopped["revision"] == 2 and stopped["pre_stop_sequence"] is None
    assert state(register(c), "stopped") == stopped
    withdraw = command(c, "withdraw", revision=2)
    withdrawn = state(request(c.app, "POST", COMMAND, body=withdraw, request_key="withdraw-http"), "withdrawn")
    assert withdrawn["revision"] == 3
    assert state(register(c), "withdrawn") == withdrawn
    assert state(request(c.app, "POST", COMMAND, body=stop, request_key="stop-http"), "withdrawn") == withdrawn
    assert state(request(c.app, "GET", STREAM), "withdrawn") == withdrawn
    with c.store.transaction(USER) as tx:
        assert tx.scan("capture_record") == []
        assert tx.get("session", c.registration["session_id"])["live_capture"] is False


def test_finite_stop_and_seal_require_independent_producer_fact(registered):
    c = registered
    finite = command(c, boundary=3)
    before = documents(c)
    error(request(c.app, "POST", COMMAND, body=finite, request_key="finite"), 409, "invalid_transition")
    assert documents(c) == before
    state(request(c.app, "POST", COMMAND, body=command(c), request_key="unknown-stop"), "stopped")
    seal = command(c, "seal_stop", revision=2, boundary=3)
    error(request(c.app, "POST", COMMAND, body=seal, request_key="seal"), 409, "invalid_transition")
    stop_fact(c, 3)
    sealed = state(request(c.app, "POST", COMMAND, body=seal, request_key="seal"), "stopped")
    assert sealed["pre_stop_sequence"] == 3 and sealed["revision"] == 3


def test_zero_boundary_is_valid_only_with_independent_zero_fact(registered):
    c = registered
    stop_fact(c, 0)
    response = request(c.app, "POST", COMMAND, body=command(c, boundary=0), request_key="empty-stop")
    assert state(response, "stopped")["pre_stop_sequence"] == 0


def test_exact_replay_precedes_cas_but_new_key_and_changed_body_conflict(registered):
    c = registered
    stop = command(c)
    state(request(c.app, "POST", COMMAND, body=stop, request_key="cas"), "stopped")
    before = documents(c)
    error(request(c.app, "POST", COMMAND, body=stop, request_key="fresh-key"), 409, "stale_revision")
    error(request(c.app, "POST", COMMAND, body=command(c, "withdraw", revision=2), request_key="cas"),
          409, "idempotency_conflict")
    error(register(c, body={**c.registration, "stream_id": "changed-id"}), 409, "idempotency_conflict")
    assert documents(c) == before


def test_mutation_keys_are_scoped_to_the_full_control_path(registered):
    c = registered
    other = registration(c, "other-stream")
    grant(c, other, producer="other-synthetic-producer")
    state(register(c, body=other, request_key="register-other"), "live")
    for stream_id in ("stream-1", "other-stream"):
        state(request(c.app, "POST", COLLECTION + "/" + stream_id + ":control",
                      body=command(c, stream_id=stream_id), request_key="same-command-key"), "stopped")


def test_identifier_ending_in_control_is_not_confused_with_command_route(setup):
    c = setup
    body = registration(c, "x:control")
    grant(c, body)
    state(register(c, body=body), "live")
    path = COLLECTION + "/x:control"
    response = request(c.app, "GET", path, headers=[("Origin", "https://untrusted.example.invalid")])
    assert state(response, "live")["stream_id"] == "x:control"
    assert "access-control-allow-origin" not in response.headers
    stopped = state(request(c.app, "POST", path + ":control",
                            body=command(c, stream_id="x:control"), request_key="colon-stop"), "stopped")
    assert stopped["stream_id"] == "x:control"
    assert state(request(c.app, "GET", path), "stopped") == stopped


@pytest.mark.parametrize("missing", ["auth", "store", "capabilities"])
def test_missing_explicit_runtime_configuration_is_unavailable(setup, missing):
    c = setup
    app = create_control_app(None if missing == "store" else c.store,
                             None if missing == "auth" else c.auth,
                             capabilities=None if missing == "capabilities" else CONTROL_CAPS,
                             clock=lambda: NOW)
    error(request(app, "GET", STREAM), 503, "unavailable")


@pytest.mark.parametrize("capabilities", [CAPABILITY, [CAPABILITY], {CAPABILITY: True}, frozenset({CAPABILITY, 1})])
def test_malformed_capability_configuration_never_confers_access(setup, capabilities):
    c = setup
    app = create_control_app(c.store, c.auth, capabilities=capabilities, clock=lambda: NOW)
    error(request(app, "GET", STREAM), 503, "unavailable")


def test_explicit_empty_capabilities_fail_with_released_capability_error(setup):
    c = setup
    app = create_control_app(c.store, c.auth, capabilities=frozenset(), clock=lambda: NOW)
    error(request(app, "GET", STREAM), 403, "capability_required")


@pytest.mark.parametrize("method,path", [("POST", COLLECTION), ("GET", STREAM), ("POST", COMMAND)])
def test_control_scope_is_required_on_every_endpoint(setup, method, path):
    c = setup
    payload = c.registration if path == COLLECTION else command(c) if method == "POST" else None
    before = documents(c)
    error(request(c.app, method, path, token="source-token", body=payload, request_key="scope"), 403, "forbidden")
    assert documents(c) == before


@pytest.mark.parametrize("token", [None, "missing-token", "expired-token"])
def test_missing_invalid_and_expired_tokens_have_content_free_401(setup, token):
    error(request(setup.app, "GET", STREAM, token=token), 401, "unauthenticated")


@pytest.mark.parametrize("headers", [
    [("Authorization", "Basic control-token")], [("Authorization", "Bearer")],
    [("Authorization", "Bearer control-token extra")], [("Authorization", "Bearer control-token,")],
    [("Authorization", "Bearer control-token"), ("authorization", "Bearer control-token")],
])
def test_malformed_or_duplicate_bearer_headers_are_rejected(setup, headers):
    error(request(setup.app, "GET", STREAM, token=None, headers=headers), 401, "unauthenticated")


def test_authentication_precedes_body_consumption(setup):
    consumed = []

    def chunks():
        consumed.append(True)
        yield b"private invalid input"

    error(request(setup.app, "POST", COLLECTION, token="missing-token", request_key="auth-first",
                  headers=[("Content-Type", "application/json")], chunks=chunks()), 401, "unauthenticated")
    assert consumed == []


@pytest.mark.parametrize("fence", ["token", "authorization", "generation", "membership"])
def test_read_and_cached_registration_recheck_current_revocation(registered, fence):
    c = registered
    if fence == "token":
        c.auth.revoke("control-token")
    elif fence == "authorization":
        c.archive.set_authorization(USER, False)
    elif fence == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    else:
        c.registry.set_membership(USER, c.registration["device_id"], c.registration["session_id"],
                                  active=False, expected_revision=1)
    before = documents(c)
    expected = (401, "unauthenticated") if fence == "token" else (403, "forbidden")
    error(request(c.app, "GET", STREAM), *expected)
    error(register(c), *expected)
    assert documents(c) == before


def test_token_expiry_is_rechecked_after_entering_actor_transaction(setup, monkeypatch):
    c = setup
    grant(c)
    before = documents(c)
    original = c.store.transaction

    @contextmanager
    def expire(actor):
        with original(actor) as tx:
            c.instant[0] = NOW + timedelta(hours=2)
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", expire)
        error(register(c), 401, "unauthenticated")
    assert documents(c) == before


def test_changed_valid_principal_is_not_trusted_inside_transaction(setup):
    c = setup
    grant(c)
    principal = c.auth.authenticate("control-token", NOW)

    class ChangingIdentity:
        calls = 0

        def authenticate(self, token, now):
            self.calls += 1
            return principal if self.calls == 1 else replace(principal, scopes=principal.scopes | {"sources:read"})

    auth = ChangingIdentity()
    app = create_control_app(c.store, auth, capabilities=CONTROL_CAPS, clock=lambda: NOW)
    before = documents(c)
    error(request(app, "POST", COLLECTION, body=c.registration, request_key="changing-principal"),
          401, "unauthenticated")
    assert auth.calls >= 2 and documents(c) == before


@pytest.mark.parametrize("failure_call", [1, 2], ids=["before-lock", "transactional-reauth"])
def test_authenticator_outage_remains_retryable_unavailable_without_consuming_grant(setup, failure_call):
    c = setup
    grant(c)

    class UnavailableIdentity:
        calls = 0

        def authenticate(self, token, now):
            self.calls += 1
            if self.calls == failure_call:
                raise DomainError(503, "private_synthetic_identity_provider_unavailable")
            return c.auth.authenticate(token, now)

    auth = UnavailableIdentity()
    app = create_control_app(c.store, auth, capabilities=CONTROL_CAPS, clock=lambda: NOW)
    before = documents(c)
    error(request(app, "POST", COLLECTION, body=c.registration, request_key="identity-outage"),
          503, "unavailable")
    assert auth.calls == failure_call and documents(c) == before
    with c.store.transaction(USER) as tx:
        assert tx.get("control_start", c.registration["stream_id"])["status"] == "pending"
        assert tx.scan("control_stream") == tx.scan("control_replay") == []


def test_absent_foreign_deleted_and_path_body_mismatch_are_indistinguishable(registered):
    c = registered
    missing = request(c.app, "GET", COLLECTION + "/missing-stream")
    foreign = request(c.app, "GET", STREAM, token="foreign-token")
    mismatch = request(c.app, "POST", COLLECTION + "/missing-stream:control", body=command(c), request_key="mismatch")
    for response in (missing, foreign, mismatch):
        error(response, 404, "not_found")
    c.store._documents[USER][("control_stream", "stream-1")] = {"deleted": True}
    deleted = request(c.app, "GET", STREAM)
    error(deleted, 404, "not_found")
    assert missing.json() == foreign.json() == mismatch.json() == deleted.json()


@pytest.mark.parametrize("request_key,headers", [
    (None, []), ("", []), ("x" * 129, []), ("contains space", []),
    ("one", [("Idempotency-Key", "two")]),
])
def test_mutation_requires_one_valid_bounded_idempotency_key(setup, request_key, headers):
    c = setup
    grant(c)
    before = documents(c)
    error(request(c.app, "POST", COLLECTION, body=c.registration, request_key=request_key, headers=headers),
          422, "invalid_request")
    assert documents(c) == before


@pytest.mark.parametrize("change,code", [
    ({"contract_version": "0.2.0"}, "unsupported_version"),
    ({"trusted_start": True}, "invalid_request"), ({"membership_revision": True}, "invalid_request"),
])
def test_unknown_versions_fields_and_boolean_revisions_are_rejected(setup, change, code):
    c = setup
    grant(c)
    before = documents(c)
    error(register(c, body={**c.registration, **change}), 422, code)
    assert documents(c) == before


@pytest.mark.parametrize("content,headers", [
    (b"{", [("Content-Type", "application/json")]),
    (b"\xff", [("Content-Type", "application/json")]),
    (b"[]", [("Content-Type", "application/json")]),
    (b"{}", []), (b"{}", [("Content-Type", "text/plain")]),
    (b"{}", [("Content-Type", "application/json"), ("Content-Type", "application/json")]),
    (b"{}", [("Content-Type", "application/json"), ("Content-Length", "2"), ("Content-Length", "2")]),
])
def test_malformed_json_and_ambiguous_or_missing_entity_headers_are_rejected(setup, content, headers):
    c = setup
    before = documents(c)
    error(request(c.app, "POST", COLLECTION, content=content, headers=headers, request_key="bad-body"),
          422, "invalid_request")
    assert documents(c) == before


def test_duplicate_json_keys_are_not_silently_overwritten(setup):
    c = setup
    raw = json.dumps(c.registration)[:-1] + ', "stream_id": "other"}'
    error(request(c.app, "POST", COLLECTION, content=raw.encode(), request_key="duplicate-json",
                  headers=[("Content-Type", "application/json")]), 422, "invalid_request")


@pytest.mark.parametrize("method,path", [("POST", COLLECTION), ("GET", STREAM), ("POST", COMMAND)])
def test_undeclared_query_parameters_are_rejected(setup, method, path):
    c = setup
    payload = c.registration if path == COLLECTION else command(c) if method == "POST" else None
    error(request(c.app, method, path + "?trusted=true", body=payload, request_key="query"),
          422, "invalid_request")


def test_get_does_not_accept_hidden_request_body(registered):
    error(request(registered.app, "GET", STREAM, content=b"{}",
                  headers=[("Content-Type", "application/json")]), 422, "invalid_request")


@pytest.mark.parametrize("encoding", ["known_length", "chunked", "lying_length"])
def test_actual_body_bytes_are_bounded_with_known_missing_or_false_length(setup, encoding):
    c = setup
    grant(c)
    assert MAX_CONTROL_BODY_BYTES == 16384
    raw = json.dumps(c.registration).encode()
    oversized = raw + b" " * (MAX_CONTROL_BODY_BYTES + 1 - len(raw))
    options = ({"content": oversized} if encoding == "known_length" else
               {"chunks": [oversized[:100], oversized[100:]]})
    headers = [("Content-Type", "application/json")]
    if encoding == "lying_length":
        headers.append(("Content-Length", "1"))
    before = documents(c)
    error(request(c.app, "POST", COLLECTION, request_key="oversized",
                  headers=headers, **options),
          422, "invalid_request")
    assert documents(c) == before


def test_exact_body_and_idempotency_limits_are_accepted(setup):
    c = setup
    grant(c)
    raw = json.dumps(c.registration).encode()
    content = raw + b" " * (MAX_CONTROL_BODY_BYTES - len(raw))
    state(request(c.app, "POST", COLLECTION, content=content, request_key="k" * 128,
                  headers=[("Content-Type", "application/json")]), "live")


@pytest.mark.parametrize("operation", ["register", "command", "commit"])
def test_failed_writes_or_commit_return_content_free_unavailable_without_partial_state(setup, monkeypatch, operation):
    c = setup
    grant(c)
    if operation == "command":
        state(register(c), "live")
    before = documents(c)
    original_put, original_transaction = _MemoryTransaction.put, c.store.transaction

    def failed_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "control_replay":
            raise RuntimeError("PRIVATE synthetic transaction diagnostic with control-token")

    @contextmanager
    def failed_commit(actor):
        with original_transaction(actor) as tx:
            yield tx
            raise RuntimeError("PRIVATE synthetic commit diagnostic")

    with monkeypatch.context() as patch:
        if operation == "commit":
            patch.setattr(c.store, "transaction", failed_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", failed_write)
        response = (request(c.app, "POST", COMMAND, body=command(c), request_key="failed")
                    if operation == "command" else register(c))
        error(response, 503, "unavailable")
    assert documents(c) == before


def test_failed_stop_fact_keeps_unknown_stop_available(registered):
    c = registered

    def unavailable(tx, user_id, stream_id):
        raise RuntimeError("PRIVATE producer details")

    app = create_control_app(c.store, c.auth, capabilities=CONTROL_CAPS,
                             stop_fact_resolver=unavailable, clock=lambda: NOW)
    before = documents(c)
    error(request(app, "POST", COMMAND, body=command(c, boundary=1), request_key="stop-failed"), 503, "unavailable")
    assert documents(c) == before
    state(request(app, "POST", COMMAND, body=command(c), request_key="stop-unknown"), "stopped")


def test_opt_in_routes_do_not_add_grant_capture_or_default_v1_endpoints(setup):
    from services.api import control_app
    from services.api.app import create_app

    c = setup
    expected = json.loads((ROOT / "packages/contracts/process_control/generated/openapi.json").read_text())
    assert request(c.app, "GET", "/openapi.json", token=None).json() == expected
    assert not hasattr(control_app, "app")
    for path in (COLLECTION + ":authorize", "/v2/process/events:batch", "/v2/display/sources", "/docs"):
        assert request(c.app, "POST" if path != "/docs" else "GET", path).status_code == 404
    v1 = create_app(c.store, c.auth, clock=lambda: NOW)
    expected_v1 = json.loads((ROOT / "packages/contracts/generated/openapi.json").read_text())
    assert request(v1, "GET", "/openapi.json", token=None).json() == expected_v1
    for method, path in (("POST", COLLECTION), ("GET", STREAM), ("POST", COMMAND)):
        assert request(v1, method, path, body=c.registration if method == "POST" else None).status_code == 404
