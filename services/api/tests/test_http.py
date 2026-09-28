"""In-process HTTP evidence only: explicit fixtures, no provider or PostgreSQL claim."""

import asyncio
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from starlette.requests import Request

from packages.contracts.validation import validate
from services.api.app import create_app
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.domain import Archive
from services.api.storage import MemoryStore
from services.worker.core.jobs import Jobs


NOW = datetime(2026, 9, 28, tzinfo=timezone.utc)
EXAMPLES = Path(__file__).resolve().parents[3] / "packages/contracts/examples"
SCOPES = frozenset({"sources:read", "sources:write", "events:write", "notes:read", "notes:write", "usage:read", "jobs:cancel"})


def request(app, method, path, token="fixture-token", idempotency_key="auto", **kwargs):
    async def run():
        headers = dict(kwargs.pop("headers", {}))
        if idempotency_key is not None:
            headers.setdefault("Idempotency-Key", str(uuid4()) if idempotency_key == "auto" else idempotency_key)
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test") as client:
            return await client.request(method, path, headers=headers, **kwargs)
    return asyncio.run(run())


@pytest.fixture
def setup():
    store = MemoryStore()
    archive = Archive(store, clock=lambda: NOW)
    for user in ("fixture-user", "other-user"):
        archive.set_authorization(user)
    examples = json.loads((EXAMPLES / "core.json").read_text())
    archive.import_fixture("fixture-user", examples["SourceSnapshot"], examples["Frame"], (EXAMPLES / "frame.svg").read_bytes())
    auth = LocalTestAuthenticator({
        "fixture-token": Principal("fixture-user", SCOPES, NOW + timedelta(hours=1)),
        "assistant-token": Principal("fixture-user", SCOPES, NOW + timedelta(hours=1), actor="assistant"),
        "other-token": Principal("other-user", SCOPES, NOW + timedelta(hours=1)),
        "expired-token": Principal("fixture-user", SCOPES, NOW),
        "read-token": Principal("fixture-user", frozenset({"sources:read"}), NOW + timedelta(hours=1)),
    })
    return create_app(store, auth, clock=lambda: NOW), archive, auth, examples, store


def test_unconfigured_authentication_fails_closed():
    response = request(create_app(MemoryStore()), "GET", "/v1/usage")
    assert response.status_code == 503
    validate("ApiError", response.json())
    assert response.json()["code"] == "needs_auth"


def test_unconfigured_database_has_no_memory_fallback(monkeypatch):
    monkeypatch.delenv("LC_DATABASE_URL", raising=False)
    auth = LocalTestAuthenticator({"fixture-token": Principal("fixture-user", SCOPES, NOW + timedelta(hours=1))})
    app = create_app(authenticator=auth, clock=lambda: NOW)
    assert app.state.store is None
    assert request(app, "GET", "/v1/usage").status_code == 503


@pytest.mark.parametrize("token", [None, "unknown", "expired-token"])
def test_missing_unknown_or_expired_token(setup, token):
    response = request(setup[0], "GET", "/v1/usage", token=token)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_malformed_and_revoked_token(setup):
    app, _archive, auth, *_ = setup
    response = request(app, "GET", "/v1/usage", token=None, headers={"Authorization": "Basic fixture-token"})
    assert response.status_code == 401
    auth.revoke("fixture-token")
    assert request(app, "GET", "/v1/usage").status_code == 401


def test_insufficient_scope(setup):
    response = request(setup[0], "GET", "/v1/usage", token="read-token")
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_persisted_revocation_and_regrant_reject_old_credential(setup):
    app, archive, *_ = setup
    archive.set_authorization("fixture-user", enabled=False)
    assert request(app, "GET", "/v1/usage").status_code == 403
    archive.set_authorization("fixture-user", enabled=True)
    assert request(app, "GET", "/v1/usage").status_code == 403


def test_expiry_is_rechecked_inside_transaction():
    instant = [NOW]

    class ExpiringStore(MemoryStore):
        expire = False

        @contextmanager
        def transaction(self, user_id):
            with super().transaction(user_id) as tx:
                if self.expire:
                    instant[0] = NOW + timedelta(hours=2)
                yield tx

    store = ExpiringStore()
    Archive(store).set_authorization("fixture-user")
    auth = LocalTestAuthenticator({"fixture-token": Principal("fixture-user", SCOPES, NOW + timedelta(hours=1))})
    app = create_app(store, auth, clock=lambda: instant[0])
    store.expire = True
    assert request(app, "GET", "/v1/usage").status_code == 401


def test_registration_idempotency_does_not_claim_fetched_content(setup):
    app = setup[0]
    payload = {"original_url": "https://example.invalid/new-course", "project_id": None}
    headers = {"Idempotency-Key": "source-request-1"}
    first = request(app, "POST", "/v1/sources", json=payload, headers=headers)
    second = request(app, "POST", "/v1/sources", json=payload, headers=headers)
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json() == second.json()
    validate("SourceRegistrationResult", first.json())
    value = first.json()["source"]
    assert value["current_version"] is None
    assert value["access_status"] != "ready"
    source_id = value["source_id"]
    assert request(app, "GET", f"/v1/sources/{source_id}").json() == {"source": value, "snapshot_versions": []}
    assert request(app, "GET", f"/v1/sources/{source_id}/versions/1").status_code == 404
    assert request(app, "GET", f"/v1/sources/{source_id}", token="other-token").status_code == 404
    payload["original_url"] = "https://example.invalid/different-course"
    assert request(app, "POST", "/v1/sources", json=payload, headers=headers).status_code == 409


def test_registration_rejects_missing_key_unknown_fields_and_non_json(setup):
    app = setup[0]
    payload = {"original_url": "https://example.invalid/course", "project_id": None}
    assert request(app, "POST", "/v1/sources", json=payload, idempotency_key=None).status_code == 422
    payload["user_id"] = "other-user"
    assert request(app, "POST", "/v1/sources", json=payload, headers={"Idempotency-Key": "key"}).status_code == 422
    assert request(app, "POST", "/v1/events:batch", content=b"{").status_code == 422


@pytest.mark.parametrize("opening,closing", [(b"[", b"]"), (b'{"x":', b"}")])
def test_json_decoder_depth_failure_is_invalid_request(setup, monkeypatch, opening, closing):
    app, _archive, _auth, _examples, store = setup
    raw = opening * 3000 + b"0" + closing * 3000
    with store.transaction("fixture-user") as state:
        before = deepcopy(state.documents)

    async def depth_limited_json(request):
        # Reproduce a decoder depth failure independently of the interpreter's
        # JSON scanner limits; the nested bytes still traverse the real ASGI body.
        assert await request.body() == raw
        raise RecursionError("fixture decoder depth exceeded")

    monkeypatch.setattr(Request, "json", depth_limited_json)
    response = request(app, "POST", "/v1/events:batch", content=raw,
                       headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    validate("ApiError", response.json())
    assert response.json()["code"] == "invalid_request"
    assert "fixture decoder" not in response.text
    with store.transaction("fixture-user") as state:
        assert state.documents == before


def test_validation_recursion_bug_is_not_a_json_decode_error(setup, monkeypatch):
    def broken_validation(_contract, _value):
        raise RecursionError("fixture validation bug")

    monkeypatch.setattr("services.api.app.validate", broken_validation)
    with pytest.raises(RecursionError, match="fixture validation bug"):
        request(setup[0], "POST", "/v1/events:batch", json={})


def test_request_read_failure_is_not_invalid_json(setup, monkeypatch):
    async def broken_json(_request):
        raise RuntimeError("fixture request read failure")

    monkeypatch.setattr(Request, "json", broken_json)
    with pytest.raises(RuntimeError, match="fixture request read failure"):
        request(setup[0], "POST", "/v1/events:batch", json={})


def test_snapshot_exact_readback_and_cross_user_isolation(setup):
    app, _archive, _auth, examples, _store = setup
    response = request(app, "GET", "/v1/sources/linear-algebra/versions/1")
    assert response.status_code == 200
    assert response.json() == examples["SourceSnapshot"]
    assert request(app, "GET", "/v1/sources/linear-algebra/versions/1", token="other-token").status_code == 404
    assert request(app, "GET", "/v1/sources/linear-algebra/versions/0").status_code == 422


def test_batch_ack_retry_and_identity_spoofing(setup):
    app, _archive, _auth, examples, _store = setup
    payload = deepcopy(examples["EventBatch"])
    first = request(app, "POST", "/v1/events:batch", json=payload)
    assert first.status_code == 200
    validate("EventBatchAck", first.json())
    repeated = request(app, "POST", "/v1/events:batch", json=payload)
    assert repeated.status_code == 200
    validate("EventBatchAck", repeated.json())
    assert [a["event_id"] for a in repeated.json()["acknowledged"]] == ["event-1"]
    assert repeated.json()["acknowledged"][0]["status"] == "duplicate"
    payload["events"][0]["user_id"] = "other-user"
    assert request(app, "POST", "/v1/events:batch", json=payload).status_code == 403
    payload["events"][0]["user_id"] = "fixture-user"
    payload["events"][0]["text"] = "Changed original"
    assert request(app, "POST", "/v1/events:batch", json=payload).status_code == 409


def test_mixed_batch_is_atomic(setup):
    app, _archive, _auth, examples, _store = setup
    good = deepcopy(examples["Observation"])
    bad = deepcopy(good)
    bad.update(event_id="event-2", device_sequence=2, source_id="missing-source")
    assert request(app, "POST", "/v1/events:batch", json={"contract_version": "0.1.0", "events": [good, bad]}).status_code == 404
    retry = request(app, "POST", "/v1/events:batch", json={"contract_version": "0.1.0", "events": [good]})
    assert retry.status_code == 200
    assert retry.json()["acknowledged"][0]["status"] == "accepted"


def test_note_cas_history_and_authenticated_actor(setup):
    app, _archive, _auth, examples, _store = setup
    assert request(app, "POST", "/v1/events:batch", json=examples["EventBatch"]).status_code == 200
    note = deepcopy(examples["NoteRevision"])
    first = request(app, "PUT", "/v1/notes/note-1", token="assistant-token", json=note)
    assert first.status_code == 201
    validate("NoteWriteResult", first.json())
    assert first.json()["note"] == note
    assert first.json()["persistence"] == "server_committed"
    second = deepcopy(note)
    second.update(revision=2, base_revision=1, title="Updated title")
    assert request(app, "PUT", "/v1/notes/note-1", token="assistant-token", json=second).status_code == 200
    conflict = deepcopy(second)
    conflict["title"] = "Conflicting stale draft"
    assert request(app, "PUT", "/v1/notes/note-1", token="assistant-token", json=conflict).status_code == 409
    assert request(app, "GET", "/v1/notes/note-1?revision=1").json() == note
    assert request(app, "GET", "/v1/notes/note-1").json() == second
    assert request(app, "GET", "/v1/notes/note-1", token="other-token").status_code == 404
    assert request(app, "GET", "/v1/notes/note-1?revision=0").status_code == 422
    spoof = deepcopy(second)
    spoof.update(revision=3, base_revision=2, user_id="other-user")
    assert request(app, "PUT", "/v1/notes/note-1", token="assistant-token", json=spoof).status_code == 403


def test_usage_and_job_cancel_use_authenticated_owner(setup):
    app, _archive, _auth, _examples, store = setup
    usage = request(app, "GET", "/v1/usage")
    assert usage.status_code == 200
    validate("UsageResult", usage.json())
    assert usage.json()["monthly_limit_fen"] == 100000
    assert usage.json()["remaining_fen"] == 100000
    assert usage.json()["currency"] == "CNY"
    assert usage.json()["paid_executor_enabled"] is False
    job = Jobs(store).enqueue("fixture-user", "job-1", "rebuild_index", [
        {"user_id": "fixture-user", "source_id": "linear-algebra", "source_version": 1},
    ], "job-key-1")
    assert job["state"] == "queued"
    assert request(app, "POST", "/v1/jobs/job-1/cancel", token="other-token").status_code == 404
    cancelled = request(app, "POST", "/v1/jobs/job-1/cancel")
    assert cancelled.status_code == 200
    validate("JobCancelResult", cancelled.json())
    assert cancelled.json()["state"] == "cancelled"
    assert cancelled.json()["cancel_requested"] is True
    assert request(app, "POST", "/v1/jobs/job-1/cancel").json() == cancelled.json()


def test_invalid_payload_and_identifiers_do_not_echo_secrets(setup):
    app = setup[0]
    secret = "sensitive-fixture-never-echo"
    response = request(app, "POST", "/v1/events:batch", content=("{\"secret\": \"" + secret).encode())
    assert response.status_code == 422
    assert secret not in response.text
    assert "fixture-token" not in response.text
    assert "Traceback" not in response.text
    validate("ApiError", response.json())
    assert response.json()["code"] == "invalid_request"
    for path in ["/v1/sources/%00", "/v1/notes/%00", "/v1/sources/linear-algebra/versions/9007199254740992"]:
        assert request(app, "GET", path).status_code == 422
    assert request(app, "POST", "/v1/jobs/%00/cancel").status_code == 422


@pytest.mark.parametrize("error_class", ["OperationalError", "UndefinedTable"])
def test_database_outage_is_sanitized(setup, error_class):
    import psycopg
    error_type = getattr(psycopg, error_class, None) or getattr(psycopg.errors, error_class)

    class UnavailableStore:
        @contextmanager
        def transaction(self, _user_id):
            raise error_type("postgres://sensitive-password@example.invalid/db")
            yield  # Make this a context manager with no real connection.

    app = create_app(UnavailableStore(), setup[2], clock=lambda: NOW)
    response = request(app, "GET", "/v1/usage")
    assert response.status_code == 503
    validate("ApiError", response.json())
    assert response.json()["code"] == "internal_error"
    assert "sensitive-password" not in response.text


def test_required_idempotency_keys_and_empty_cancellation_body(setup):
    app, _archive, _auth, examples, _store = setup
    for method, path, payload in [("POST", "/v1/events:batch", examples["EventBatch"]),
                                  ("PUT", "/v1/notes/note-1", examples["NoteRevision"])]:
        response = request(app, method, path, json=payload, idempotency_key=None)
        assert response.status_code == 422
        validate("ApiError", response.json())
    assert request(app, "POST", "/v1/jobs/missing/cancel", json={"user_id": "other-user"}).status_code == 422


def test_event_batch_key_replays_original_ack_and_rejects_changed_input(setup):
    app, _archive, _auth, examples, _store = setup
    first = request(app, "POST", "/v1/events:batch", json=examples["EventBatch"], idempotency_key="batch-key")
    replay = request(app, "POST", "/v1/events:batch", json=examples["EventBatch"], idempotency_key="batch-key")
    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json()
    assert replay.json()["acknowledged"][0]["status"] == "accepted"
    changed = deepcopy(examples["EventBatch"])
    changed["events"][0]["text"] = "Changed request"
    assert request(app, "POST", "/v1/events:batch", json=changed, idempotency_key="batch-key").status_code == 409


def test_note_key_replays_original_after_newer_revision_and_delete_rejects_cache(setup):
    app, archive, _auth, examples, _store = setup
    assert request(app, "POST", "/v1/events:batch", json=examples["EventBatch"]).status_code == 200
    note = deepcopy(examples["NoteRevision"])
    first = request(app, "PUT", "/v1/notes/note-1", json=note, idempotency_key="note-key")
    assert first.status_code == 201
    newer = deepcopy(note)
    newer.update(revision=2, base_revision=1, title="Newer")
    assert request(app, "PUT", "/v1/notes/note-1", json=newer).status_code == 200
    replay = request(app, "PUT", "/v1/notes/note-1", json=note, idempotency_key="note-key")
    assert replay.status_code == 200
    assert replay.json()["note"] == note
    assert replay.json()["replayed"] is True
    assert request(app, "GET", "/v1/notes/note-1").json() == newer
    archive.delete_source("fixture-user", "linear-algebra")
    deleted = request(app, "PUT", "/v1/notes/note-1", json=note, idempotency_key="note-key")
    assert deleted.status_code in {404, 409}
    assert "Change of basis" not in deleted.text


def test_served_openapi_is_the_owner_contract(setup):
    expected = json.loads((EXAMPLES.parent / "generated/openapi.json").read_text())
    assert request(setup[0], "GET", "/openapi.json", token=None).json() == expected


def test_assistant_actor_cannot_overwrite_user_original_even_with_user_authorship(setup):
    app, archive, _auth, examples, _store = setup
    assert request(app, "POST", "/v1/events:batch", json=examples["EventBatch"]).status_code == 200
    archive.import_ink("fixture-user", "ink-original", b"synthetic-pencil-strokes")
    note = deepcopy(examples["NoteRevision"])
    note.update(kind="handwritten", authorship="user", ink_blob_id="ink-original")
    note["blocks"] = [{"id": "original-block", "layer": "user_original", "format": "text", "content": "My original derivation"}]
    assert request(app, "PUT", "/v1/notes/note-1", json=note).status_code == 201
    changed = deepcopy(note)
    changed.update(revision=2, base_revision=1)
    changed["blocks"][0]["content"] = "Assistant replacement"
    rejected = request(app, "PUT", "/v1/notes/note-1", token="assistant-token", json=changed)
    assert rejected.status_code == 403
    assert request(app, "GET", "/v1/notes/note-1").json() == note
    supplement = deepcopy(note)
    supplement.update(revision=2, base_revision=1)
    supplement["blocks"].append({"id": "supplement", "layer": "ai_supplement", "format": "text", "content": "Brief related formula"})
    response = request(app, "PUT", "/v1/notes/note-1", token="assistant-token", json=supplement)
    assert response.status_code == 200
    assert response.json()["note"]["ink_blob_id"] == "ink-original"
    assert response.json()["note"]["blocks"][0] == note["blocks"][0]


def test_all_wire_successes_validate_and_do_not_create_provider_connections(setup):
    app, _archive, _auth, examples, _store = setup
    source = request(app, "GET", "/v1/sources/linear-algebra")
    validate("SourceReadResult", source.json())
    assert source.json()["snapshot_versions"] == [1]
    snapshot = request(app, "GET", "/v1/sources/linear-algebra/versions/1")
    validate("SourceSnapshot", snapshot.json())
    usage = request(app, "GET", "/v1/usage?budget_month=2099-01")
    validate("UsageResult", usage.json())
    assert usage.json()["budget_month"] == "2026-09"
    assert usage.json()["pricing_status"] == "unknown"
    assert usage.json()["paid_executor_enabled"] is False
