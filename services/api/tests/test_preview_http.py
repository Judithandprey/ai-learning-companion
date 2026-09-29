"""HTTP boundary checks; real PostgreSQL evidence uses postgres_preview_check."""

import asyncio
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from packages.contracts.document_preview import validate
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.domain import Archive
from services.api.preview_app import create_preview_app
from services.api.preview_local import PREVIEW_SCOPES, _bootstrap
from services.api.storage import MemoryStore
from services.api.tests.test_preview import USER, DEVICE, SESSION, import_body, save_body

NOW = datetime(2026, 9, 28, tzinfo=timezone.utc)


def request(app, method, path, *, token="secret-token", key="test-key", headers=None,
            peer="127.0.0.1", host="127.0.0.1:8174", **kwargs):
    async def run():
        supplied = list(headers or [])
        if token is not None:
            supplied.append(("Authorization", "Bearer " + token))
        if key is not None:
            supplied.append(("Idempotency-Key", key))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(peer, 5000)),
                                     base_url="http://" + host) as client:
            return await client.request(method, path, headers=supplied, **kwargs)
    result = asyncio.run(run())
    if result.status_code in {401, 403, 404, 409, 422, 503}:
        validate("PreviewError", result.json())
        assert "secret-token" not in result.text and "Why λ" not in result.text
    return result


@pytest.fixture
def configured():
    store = MemoryStore()
    _bootstrap(store, USER, DEVICE, SESSION)
    tokens = {
        "secret-token": Principal(USER, PREVIEW_SCOPES, NOW + timedelta(hours=1)),
        "expired": Principal(USER, PREVIEW_SCOPES, NOW),
        "foreign": Principal("other", PREVIEW_SCOPES, NOW + timedelta(hours=1)),
        "assistant": Principal(USER, PREVIEW_SCOPES, NOW + timedelta(hours=1), actor="assistant"),
        "read-only": Principal(USER, {"document-preview:read"}, NOW + timedelta(hours=1)),
    }
    auth = LocalTestAuthenticator(tokens)
    app = create_preview_app(store, auth, lambda: NOW, user_id=USER, device_id=DEVICE,
                             session_id=SESSION, allowed_origins=frozenset({"http://localhost:5173"}))
    return app, store, auth


def imported(configured):
    response = request(configured[0], "POST", "/preview/v1/documents", json=import_body())
    assert response.status_code == 200
    validate("ImportReceipt", response.json())


def test_document_flow_over_http(configured):
    app, store, _ = configured
    result = request(app, "GET", "/preview/v1/session")
    validate("SessionInfo", result.json())
    assert result.json()["user_id"] == USER
    imported(configured)
    body = save_body()
    result = request(app, "POST", "/preview/v1/saves", json=body)
    assert result.status_code == 200
    validate("SaveReceipt", result.json())
    assert result.json()["replayed"] is False
    retry = request(app, "POST", "/preview/v1/saves", json=body)
    assert retry.status_code == 200 and retry.json()["replayed"] is True
    reopened = request(app, "GET", "/preview/v1/saves/saved-note")
    validate("SavedPreview", reopened.json())
    assert reopened.json()["request"] == body["request"]
    assert reopened.json()["user_note"] == body["user_note"]
    assert reopened.headers["cache-control"] == "no-store"
    changed = {**body, "user_note": "changed"}
    assert request(app, "POST", "/preview/v1/saves", json=changed).status_code == 409
    Archive(store).delete_source(USER, "course-notes")
    assert request(app, "GET", "/preview/v1/saves/saved-note").status_code == 404
    assert request(app, "POST", "/preview/v1/saves", json=body).status_code == 404
    assert request(app, "POST", "/preview/v1/documents", json=import_body()).status_code == 404


@pytest.mark.parametrize("token,status", [(None, 401), ("bad", 401), ("expired", 401),
                                         ("foreign", 403), ("assistant", 403)])
def test_authentication_and_caller_rejection(configured, token, status):
    result = request(configured[0], "GET", "/preview/v1/session", token=token)
    assert result.status_code == status
    if status == 401:
        assert result.headers["www-authenticate"] == "Bearer"


def test_revocation_and_regrant_never_replay_old_auth(configured):
    app, store, auth = configured
    imported(configured)
    Archive(store).set_authorization(USER, enabled=False)
    assert request(app, "POST", "/preview/v1/documents", json=import_body()).status_code == 403
    Archive(store).set_authorization(USER, enabled=True)
    assert request(app, "GET", "/preview/v1/session").status_code == 403
    auth.revoke("secret-token")
    assert request(app, "GET", "/preview/v1/session").status_code == 401


def test_expiry_rechecked_after_actor_lock_acquisition():
    now = [NOW]
    class AdvancingStore(MemoryStore):
        advance = False
        @contextmanager
        def transaction(self, user):
            with super().transaction(user) as tx:
                if self.advance:
                    now[0] += timedelta(hours=2)
                yield tx
    store = AdvancingStore()
    _bootstrap(store, USER, DEVICE, SESSION)
    auth = LocalTestAuthenticator({"secret-token": Principal(USER, PREVIEW_SCOPES, NOW + timedelta(hours=1))})
    app = create_preview_app(store, auth, lambda: now[0], user_id=USER, device_id=DEVICE, session_id=SESSION)
    store.advance = True
    assert request(app, "POST", "/preview/v1/documents", json=import_body()).status_code == 401
    assert not any(k[1] == "snapshot" for k in store._documents)


@pytest.mark.parametrize("option", [{}, {"store": MemoryStore()}, {"user_id": USER, "device_id": DEVICE, "session_id": SESSION}])
def test_default_preview_is_fail_closed(option):
    assert request(create_preview_app(**option), "GET", "/preview/v1/session").status_code == 503


@pytest.mark.parametrize("extra", [
    {"peer": "203.0.113.2"}, {"host": "attacker.example"},
    {"headers": [("Origin", "https://course.example")]},
    {"headers": [("Origin", "null")]},
    {"headers": [("Origin", "http://localhost:5173"), ("Origin", "http://evil.invalid")]},
    {"headers": [("Host", "localhost:8174"), ("Host", "attacker.invalid")]},
])
def test_request_origin_host_and_peer_are_restricted(configured, extra):
    assert request(configured[0], "GET", "/preview/v1/session", **extra).status_code == 403


def test_only_explicit_trusted_ui_origin_has_cors(configured):
    app, _, _ = configured
    response = request(app, "GET", "/preview/v1/session", headers=[("Origin", "http://localhost:5173")])
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    preflight = request(app, "OPTIONS", "/preview/v1/documents", token=None, key=None,
                        headers=[("Origin", "http://localhost:5173"),
                                 ("Access-Control-Request-Method", "POST"),
                                 ("Access-Control-Request-Headers", "authorization,content-type,idempotency-key")])
    assert preflight.status_code == 200


@pytest.mark.parametrize("origin", ["*", "https://course.example", "http://127.0.0.1:5000/", "http://localhost", "http://x@localhost:5000"])
def test_untrusted_origin_configuration_rejected(origin):
    with pytest.raises(ValueError): create_preview_app(allowed_origins=frozenset({origin}))


@pytest.mark.parametrize("extra", [
    {"key": None}, {"key": "invalid key"},
    {"headers": [("Idempotency-Key", "second")]},
    {"json": {**import_body(), "sha256": "0" * 64}},
    {"json": {**import_body(), "filename": "\x00"}},
    {"content": b'{"a":1,"a":2}', "headers": [("Content-Type", "application/json")]},
    {"content": b'\xff', "headers": [("Content-Type", "application/json")]},
    {"content": b'x' * (4 * 1024 * 1024 + 1), "headers": [("Content-Type", "application/json")]},
    {"content": b'{}', "headers": [("Content-Type", "text/plain")]},
])
def test_bad_input_has_no_partial_writes(configured, extra):
    app, store, _ = configured
    before = deepcopy(store._documents)
    options = {} if "content" in extra else {"json": import_body()}
    assert request(app, "POST", "/preview/v1/documents", **{**options, **extra}).status_code == 422
    assert store._documents == before


def test_scope_and_duplicate_auth_fail(configured):
    app = configured[0]
    assert request(app, "POST", "/preview/v1/documents", token="read-only", json=import_body()).status_code == 403
    assert request(app, "GET", "/preview/v1/session", headers=[("Authorization", "Bearer secret-token")]).status_code == 401
