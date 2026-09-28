"""Loopback HTTP acceptance with owned API processes and a real PostgreSQL store.

Called by postgres_check after migration. The caller owns the unique synthetic
actor and its cleanup. Fixture/ink ingestion and authorization changes use the
existing local administrative hooks; event and note writes use real v0.1 HTTP.
No provider, production authenticator, device or PostgreSQL-server restart is
tested here. Child output is suppressed because database errors can contain DSNs.
"""

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time

import httpx

from packages.contracts.validation import validate
from services.api.storage import IMMUTABLE_KINDS, PostgresStore


ROOT = Path(__file__).resolve().parents[3]


def _serve() -> None:
    """Test-only child entry point; never seeds data or restores authorization."""
    import uvicorn

    from services.api.app import create_app
    from services.api.auth import LocalTestAuthenticator, Principal
    from services.api.local import LOCAL_SCOPES

    if os.environ.get("LC_ENABLE_LOCAL_TEST_AUTH") != "1":
        raise RuntimeError("HTTP acceptance requires explicit local-test opt-in")
    config = json.loads(os.environ["LC_HTTP_CHECK_CONFIG"])
    credentials = {
        value["token"]: Principal(
            config["actor"], LOCAL_SCOPES, datetime.fromisoformat(value["expires_at"]),
            actor="assistant" if name == "assistant" else "user",
            authorization_generation=config["generation"],
        )
        for name, value in config["credentials"].items()
    }
    auth = LocalTestAuthenticator(credentials)
    auth.revoke(config["credentials"]["revoked"]["token"])
    app = create_app(PostgresStore(os.environ["LC_TEST_DATABASE_URL"]), auth)
    listener = socket.socket(fileno=int(os.environ["LC_HTTP_CHECK_FD"]))
    with listener:
        if listener.getsockname()[0] != "127.0.0.1":
            raise RuntimeError("HTTP acceptance only permits loopback")
        server = uvicorn.Server(uvicorn.Config(
            app, host="127.0.0.1", log_level="critical", access_log=False,
            lifespan="off", timeout_graceful_shutdown=2, proxy_headers=False,
        ))
        server.run(sockets=[listener])


@contextmanager
def _api_process(dsn: str, config: dict):
    """Keep an ephemeral listener and one owned child under bounded supervision."""
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        environment = {
            **os.environ,
            "LC_ENABLE_LOCAL_TEST_AUTH": "1",
            "LC_TEST_DATABASE_URL": dsn,
            "LC_HTTP_CHECK_CONFIG": json.dumps(config),
            "LC_HTTP_CHECK_FD": str(listener.fileno()),
        }
        process = subprocess.Popen(
            [sys.executable, "-m", "services.api.tests.postgres_http_check"],
            cwd=ROOT, env=environment, pass_fds=(listener.fileno(),),
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=2, trust_env=False) as client:
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise AssertionError("owned HTTP acceptance process exited before readiness")
                    try:
                        ready = client.get("/openapi.json")
                        if ready.status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    time.sleep(0.05)
                else:
                    raise AssertionError("owned HTTP acceptance process readiness timed out")
                yield client, process
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def _request(client, method, path, token, status, *, payload=None, request_key=None, contract=None):
    headers = {"Authorization": "Bearer " + token}
    if request_key is not None:
        headers["Idempotency-Key"] = request_key
    response = client.request(method, path, headers=headers, json=payload)
    assert response.status_code == status, f"{method} {path}: expected {status}, got {response.status_code}"
    value = response.json()
    if status >= 400:
        validate("ApiError", value)
        if status == 401:
            assert response.headers["www-authenticate"] == "Bearer"
    elif contract:
        validate(contract, value)
    return value


def _originals(store, actor):
    with store.transaction(actor) as tx:
        return {kind: tx.scan(kind) for kind in sorted(IMMUTABLE_KINDS)}


def run_http_checks(dsn: str, actor: str) -> list[str]:
    """Exercise durable HTTP persistence; requires an already migrated test DB."""
    from services.api.tests.postgres_check import _fixture

    store = PostgresStore(dsn)
    archive, core = _fixture(store, actor)
    archive.import_ink(actor, "http-original-ink", b"project-authored synthetic ink bytes")
    with store.transaction(actor) as tx:
        generation = tx.get("authorization", "state")["generation"]
    now = datetime.now(timezone.utc)
    credentials = {
        name: {"token": secrets.token_hex(32), "expires_at": (
            now + (timedelta(seconds=-1) if name == "expired" else timedelta(hours=1))
        ).isoformat()}
        for name in ("user", "assistant", "expired", "revoked")
    }
    config = {"actor": actor, "generation": generation, "credentials": credentials}
    token = credentials["user"]["token"]
    assistant = credentials["assistant"]["token"]
    batch = deepcopy(core["EventBatch"])
    correction = deepcopy(batch["events"][0])
    correction.update(event_id="http-correction", device_sequence=2,
                      correction_of=correction["event_id"], text="The original confusion concerned right multiplication.")
    batch["events"].append(correction)
    note = deepcopy(core["NoteRevision"])
    note.update(kind="handwritten", authorship="user", ink_blob_id="http-original-ink")
    note["blocks"] = [{"id": "user-derivation", "layer": "user_original", "format": "text",
                       "content": "My original derivation: coordinates change; the vector does not."}]
    newer = deepcopy(note)
    newer.update(revision=2, base_revision=1)
    newer["blocks"].append(deepcopy(core["NoteRevision"]["blocks"][0]))
    source_path = "/v1/sources/" + core["SourceSnapshot"]["source_id"]
    note_path = "/v1/notes/" + note["note_id"]

    with _api_process(dsn, config) as (client, first):
        source = _request(client, "GET", source_path, token, 200, contract="SourceReadResult")
        assert source["snapshot_versions"] == [1]
        assert _request(client, "GET", source_path + "/versions/1", token, 200,
                        contract="SourceSnapshot") == core["SourceSnapshot"]
        ack = _request(client, "POST", "/v1/events:batch", token, 200, payload=batch,
                       request_key="http-events", contract="EventBatchAck")
        assert ack["acknowledged"] == [
            {"event_id": event["event_id"], "device_id": event["device_id"],
             "device_sequence": event["device_sequence"], "status": "accepted"}
            for event in batch["events"]
        ]
        saved = _request(client, "PUT", note_path, token, 201, payload=note,
                         request_key="http-note-1", contract="NoteWriteResult")
        assert saved == {"note": note, "persistence": "server_committed", "replayed": False}
        supplemented = _request(client, "PUT", note_path, assistant, 200, payload=newer,
                                request_key="http-note-2", contract="NoteWriteResult")
        assert supplemented == {"note": newer, "persistence": "server_committed", "replayed": False}
        for name in ("expired", "revoked"):
            bad_token = credentials[name]["token"]
            _request(client, "GET", note_path, bad_token, 401)
            _request(client, "POST", "/v1/events:batch", bad_token, 401,
                     payload=batch, request_key="http-events")
        before_restart = _originals(store, actor)
    assert first.poll() is not None, "first API process must exit before restart"

    with _api_process(dsn, config) as (client, second):
        assert second.pid != first.pid, "restart must create a new API process"
        assert _request(client, "GET", source_path, token, 200, contract="SourceReadResult") == source
        assert _request(client, "GET", source_path + "/versions/1", token, 200,
                        contract="SourceSnapshot") == core["SourceSnapshot"]
        assert _request(client, "GET", note_path, token, 200, contract="NoteRevision") == newer
        assert _request(client, "GET", note_path + "?revision=1", token, 200, contract="NoteRevision") == note
        assert _request(client, "POST", "/v1/events:batch", token, 200, payload=batch,
                        request_key="http-events", contract="EventBatchAck") == ack
        duplicates = _request(client, "POST", "/v1/events:batch", token, 200, payload=batch,
                              request_key="http-events-new-key", contract="EventBatchAck")
        assert duplicates["acknowledged"] == [dict(item, status="duplicate") for item in ack["acknowledged"]]
        replay = _request(client, "PUT", note_path, token, 200, payload=note,
                          request_key="http-note-1", contract="NoteWriteResult")
        assert replay == dict(saved, replayed=True)
        changed_batch = deepcopy(batch)
        changed_batch["events"][0]["text"] = "Attempted replacement of the original"
        for request_key in ("http-events", "http-conflicting-event"):
            _request(client, "POST", "/v1/events:batch", token, 409,
                     payload=changed_batch, request_key=request_key)
        changed_note = deepcopy(newer)
        changed_note["title"] = "Conflicting revision"
        _request(client, "PUT", note_path, token, 409, payload=changed_note, request_key="http-conflicting-note")
        changed_note.update(revision=3, base_revision=2)
        changed_note["blocks"][0]["content"] = "Attempted assistant replacement"
        _request(client, "PUT", note_path, assistant, 403,
                 payload=changed_note, request_key="http-original-protection")
        assert _request(client, "GET", note_path, token, 200, contract="NoteRevision") == newer
        assert _originals(store, actor) == before_restart
        revoked_state = archive.set_authorization(actor, False)
        _request(client, "GET", note_path, token, 403)
        _request(client, "PUT", note_path, token, 403, payload=note, request_key="http-note-1")
    assert second.poll() is not None, "second API process must exit before revocation restart"

    with _api_process(dsn, config) as (client, third):
        assert third.pid not in (first.pid, second.pid)
        _request(client, "GET", source_path, token, 403)
        _request(client, "GET", note_path, token, 403)
        _request(client, "POST", "/v1/events:batch", token, 403, payload=batch, request_key="http-events")
        _request(client, "PUT", note_path, token, 403, payload=note, request_key="http-note-1")
        with store.transaction(actor) as tx:
            assert tx.get("authorization", "state") == revoked_state
        archive.set_authorization(actor, True)
        _request(client, "GET", note_path, token, 403)
        assert _originals(store, actor) == before_restart
        with store.transaction(actor) as tx:
            assert tx.get("session", core["Frame"]["session_id"])["live_capture"] is False
    assert third.poll() is not None
    return [
        "real HTTP event/correction and note CAS writes commit to PostgreSQL with separate original/AI layers",
        "terminated API process and new API process preserve exact source/version, note history and original bytes",
        "post-restart HTTP idempotency receipts, duplicate events and conflict rejection preserve immutable originals",
        "HTTP expired/revoked tokens reject access; persisted revocation survives API restart and stale regrant",
        "all owned HTTP processes terminated and waited; historical fixture never activates live capture",
    ]


if __name__ == "__main__":
    _serve()
