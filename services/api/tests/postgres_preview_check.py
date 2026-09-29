"""Finite real PostgreSQL/HTTP acceptance for the trusted document preview.

Run: python -m services.api.tests.postgres_preview_check
LC_TEST_DATABASE_URL must explicitly target local lc_p0_test. Only this run's
unique actor is removed. Every owned API child is terminated and waited before
cleanup. No fixture import, paid provider, real device, or DB-server restart is
claimed. Child output and connection/credential diagnostics are suppressed.
"""

import base64
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
from uuid import uuid4

import httpx

from packages.contracts.document_preview import validate
from services.api.domain import Archive, key
from services.api.migrations import migrate
from services.api.storage import PostgresStore
from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database
from services.api.tests.postgres_http_check import _originals

ROOT = Path(__file__).resolve().parents[3]


def _serve():
    """Positive processes use the actual launcher factory; auth-only probe is explicit."""
    import uvicorn
    from services.api.auth import LocalTestAuthenticator, Principal
    from services.api.preview_app import create_preview_app
    from services.api.preview_local import PREVIEW_SCOPES, create_local_preview_app

    config = json.loads(os.environ["LC_PREVIEW_CHECK_CONFIG"])
    if config["mode"] == "local":
        app = create_local_preview_app()
    elif config["mode"] == "auth_probe":
        # Do not bootstrap a revoked identity. Bind both test credentials to the
        # pre-revocation generation, just as the previous actual launcher did.
        now = datetime.now(timezone.utc)
        auth = LocalTestAuthenticator({
            config[name]: Principal(config["actor"], PREVIEW_SCOPES,
                now + timedelta(hours=1) if name == "token" else now - timedelta(seconds=1),
                authorization_generation=config["generation"])
            for name in ("token", "expired_token")
        })
        app = create_preview_app(PostgresStore(os.environ["LC_DATABASE_URL"]), auth,
                                user_id=config["actor"], device_id=config["device_id"],
                                session_id=config["session_id"])
    else:
        raise RuntimeError("Unknown preview acceptance process mode")
    with socket.socket(fileno=int(os.environ["LC_PREVIEW_CHECK_FD"])) as listener:
        if listener.getsockname()[0] != "127.0.0.1":
            raise RuntimeError("Preview acceptance requires loopback")
        uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", log_level="critical",
            access_log=False, lifespan="off", timeout_graceful_shutdown=2,
            proxy_headers=False)).run(sockets=[listener])


@contextmanager
def _preview_process(dsn, config):
    """Finite foreground child ownership, mirroring the existing HTTP runner."""
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        environment = {**os.environ, "LC_ENABLE_DOCUMENT_PREVIEW": "1", "LC_DATABASE_URL": dsn,
            "LC_PREVIEW_TOKEN": config["token"], "LC_PREVIEW_USER_ID": config["actor"],
            "LC_PREVIEW_DEVICE_ID": config["device_id"], "LC_PREVIEW_SESSION_ID": config["session_id"],
            "LC_PREVIEW_CHECK_CONFIG": json.dumps(config), "LC_PREVIEW_CHECK_FD": str(listener.fileno())}
        process = subprocess.Popen([sys.executable, "-m", "services.api.tests.postgres_preview_check", "--serve"],
            cwd=ROOT, env=environment, pass_fds=(listener.fileno(),), stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{listener.getsockname()[1]}",
                              timeout=5, trust_env=False) as client:
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise AssertionError("owned preview child exited before readiness")
                    try:
                        if client.get("/openapi.json").status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    time.sleep(.05)
                else:
                    raise AssertionError("owned preview child readiness timed out")
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
    assert response.status_code == status, "unexpected preview HTTP status"
    assert response.headers["cache-control"] == "no-store"
    value = response.json()
    if status >= 400:
        validate("PreviewError", value)
        if status == 401:
            assert response.headers["www-authenticate"] == "Bearer"
    elif contract:
        validate(contract, value)
    return value


def _requests(config):
    examples = json.loads((ROOT / "packages/contracts/document_preview/examples.json").read_text())
    document, save = deepcopy(examples["DocumentImport"]), deepcopy(examples["DocumentSave"])
    raw = ("\ufeffActual local document\r\n矩阵与 café — α²\r\n<script>literal source text</script>\n"
           + "Complete original paragraph retained beyond the DOM excerpt.\r\n" * 200).encode("utf-8")
    document.update(source_id="document-" + uuid4().hex, filename="课程原文.txt",
                    device_id=config["device_id"], session_id=config["session_id"],
                    content_base64=base64.b64encode(raw).decode(), sha256=hashlib.sha256(raw).hexdigest())
    save["note_id"] = "note-" + uuid4().hex
    for row in (save["frame"], save["bridge_request"]["selection"]):
        row.update(user_id=config["actor"], device_id=config["device_id"], session_id=config["session_id"],
                   source_id=document["source_id"], source_version=document["source_version"])
    save["request"]["user_id"] = config["actor"]
    save.update(request_text="Why this matrix? 我想先自己试试。\r\n", user_note="原想法: keep my steps.\r\n  α² ≠ α\n")
    dom = json.loads(base64.b64decode(save["frame_bytes_base64"]))
    dom["context_text"] = "矩阵与 café — α²"
    frame_bytes = json.dumps(dom, ensure_ascii=False, indent=2).encode("utf-8")
    save["frame_bytes_base64"] = base64.b64encode(frame_bytes).decode()
    save["frame"]["content_hash"] = hashlib.sha256(frame_bytes).hexdigest()
    validate("DocumentImport", document)
    validate("DocumentSave", save)
    assert len(raw) > len(frame_bytes) and len(raw) > len(dom["context_text"].encode())
    return document, save, raw, frame_bytes


def run_preview_checks(dsn, actor):
    """Requires a verified dedicated DB; return evidence only after every check."""
    store = PostgresStore(dsn)
    archive = Archive(store)
    config = {"mode": "local", "actor": actor, "device_id": "device-" + uuid4().hex,
              "session_id": "session-" + uuid4().hex, "token": secrets.token_urlsafe(48),
              "expired_token": secrets.token_urlsafe(48)}
    document, save, original_bytes, frame_bytes = _requests(config)
    token = config["token"]
    note_path = "/preview/v1/saves/" + save["note_id"]

    with _preview_process(dsn, config) as (client, first):
        session = _request(client, "GET", "/preview/v1/session", token, 200, contract="SessionInfo")
        assert session["user_id"] == actor and session["device_id"] == config["device_id"]
        assert session["session_id"] == config["session_id"] and session["membership_revision"] == 1
        config["generation"] = session["authorization_generation"]
        imported = _request(client, "POST", "/preview/v1/documents", token, 200,
                            payload=document, request_key="import", contract="ImportReceipt")
        assert not imported["replayed"] and imported["persistence"] == "server_committed"
        assert imported["source"]["text"].encode("utf-8") == original_bytes
        assert imported["source"]["provenance"]["origin"] == "user_authorized"
        assert imported["source"]["provenance"]["consent_scope"] == "learning"
        receipt = _request(client, "POST", "/preview/v1/saves", token, 200,
                           payload=save, request_key="save", contract="SaveReceipt")
        assert receipt["persistence"] == "server_committed" and not receipt["replayed"]
        assert receipt["ai_status"] == "provider_unavailable"
        view = _request(client, "GET", note_path, token, 200, contract="SavedPreview")
        assert base64.b64decode(view["content_base64"]) == original_bytes
        assert base64.b64decode(view["frame_bytes_base64"]) == frame_bytes
        assert view["source"] == imported["source"]
        for field in ("frame", "bridge_request", "request", "request_text", "user_note"):
            assert view[field] == save[field]
        assert view["observation"]["actor"] == "user" and view["note"]["authorship"] == "user"
        assert {b["layer"] for b in view["note"]["blocks"]} == {"user_original"}
        before_restart = _originals(store, actor)
    assert first.poll() is not None, "first API child must exit before restart"

    with _preview_process(dsn, config) as (client, second):
        assert second.pid != first.pid
        assert _request(client, "GET", "/preview/v1/session", token, 200, contract="SessionInfo") == session
        assert _request(client, "GET", note_path, token, 200, contract="SavedPreview") == view
        for request_key in ("import", "import-new-key"):
            replay = _request(client, "POST", "/preview/v1/documents", token, 200,
                              payload=document, request_key=request_key, contract="ImportReceipt")
            assert replay == {**imported, "replayed": True}
        for request_key in ("save", "save-new-key"):
            replay = _request(client, "POST", "/preview/v1/saves", token, 200,
                              payload=save, request_key=request_key, contract="SaveReceipt")
            assert replay == {**receipt, "replayed": True}
        for request_key in ("save", "save-changed"):
            _request(client, "POST", "/preview/v1/saves", token, 409,
                     payload={**save, "user_note": "attempted replacement"}, request_key=request_key)
        _request(client, "POST", "/preview/v1/documents", token, 422,
                 payload={**document, "sha256": "0" * 64}, request_key="bad-hash")
        _request(client, "POST", "/preview/v1/documents", token, 403,
                 payload={**document, "device_id": "unowned-device"}, request_key="bad-identity")
        wrong_identity = deepcopy(save)
        for row in (wrong_identity["frame"], wrong_identity["bridge_request"]["selection"], wrong_identity["request"]):
            row["user_id"] = "unowned-user"
        _request(client, "POST", "/preview/v1/saves", token, 403,
                 payload=wrong_identity, request_key="bad-save-identity")
        assert _originals(store, actor) == before_restart
        with store.transaction(actor) as tx:
            assert len(tx.scan("snapshot")) == len(tx.scan("frame")) == len(tx.scan("artifact")) == 1
            assert len(tx.scan("event")) == len(tx.scan("event_sequence")) == len(tx.scan("note_revision")) == 1
            assert tx.scan("capture_record") == tx.scan("capture_binding") == []
            assert tx.get("session", config["session_id"])["live_capture"] is False
            assert tx.get("control_membership", key(config["device_id"], config["session_id"]))["active"] is True
        archive.delete_source(actor, document["source_id"])
        _request(client, "GET", note_path, token, 404)
        _request(client, "POST", "/preview/v1/documents", token, 404, payload=document, request_key="import")
        _request(client, "POST", "/preview/v1/documents", token, 404,
                 payload={**document, "source_version": 2}, request_key="cannot-resurrect")
        _request(client, "POST", "/preview/v1/saves", token, 404, payload=save, request_key="save")
        with store.transaction(actor) as tx:
            for kind in ("snapshot", "frame", "artifact", "event", "note", "note_revision", "preview_import", "preview_save"):
                assert tx.scan(kind) == []
            assert tx.scan("event_sequence")
            for row in tx.scan("http_replay"):
                assert set(row) == {"key", "deleted", "source_ids"} and row["deleted"] and row["source_ids"] == []
        revoked = archive.set_authorization(actor, False)
        _request(client, "GET", "/preview/v1/session", token, 403)
        _request(client, "POST", "/preview/v1/saves", token, 403, payload=save, request_key="save")
    assert second.poll() is not None

    with _preview_process(dsn, {**config, "mode": "auth_probe"}) as (client, third):
        assert third.pid not in {first.pid, second.pid}
        _request(client, "GET", "/preview/v1/session", config["expired_token"], 401)
        _request(client, "POST", "/preview/v1/saves", config["expired_token"], 401,
                 payload=save, request_key="save")
        _request(client, "GET", "/preview/v1/session", token, 403)
        _request(client, "GET", note_path, token, 403)
        _request(client, "POST", "/preview/v1/documents", token, 403, payload=document, request_key="import")
        with store.transaction(actor) as tx:
            assert tx.get("authorization", "state") == revoked
            assert tx.get("source", document["source_id"])["deleted"] is True
            assert tx.scan("snapshot") == tx.scan("preview_save") == []
    assert third.poll() is not None
    return [
        "actual preview_local bootstrap and HTTP import retain complete non-fixture BOM/CRLF/Unicode source bytes",
        "HTTP save atomically persists DOM frame, actual requests, user observation and original note without AI output",
        "terminated API and new preview_local process recover exact original, frame bytes, selection, requests and saved revision",
        "same/new-key exact retries add no originals; changed body 409, bad hash 422 and wrong identity 403 preserve originals",
        "source deletion erases preview/original content, leaves opaque receipts and rejects retries/version resurrection",
        "expired credentials return 401; persisted authorization revocation returns 403 before and after API restart",
        "all three owned API children terminated and waited; capture remained off and only the unique test actor is cleaned",
    ]


def main():
    dsn = os.environ.get("LC_TEST_DATABASE_URL")
    if not dsn:
        print("BLOCKED: LC_TEST_DATABASE_URL absent; real PostgreSQL preview unverified", file=sys.stderr)
        return 2
    try:
        dsn = dedicated_test_dsn(dsn)
        version = verify_test_database(dsn)
    except Exception as exc:
        print("BLOCKED: dedicated local lc_p0_test validation failed (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2
    actor = "backend-preview-" + uuid4().hex
    cleanup_ok, evidence = True, None
    try:
        migrate(dsn)
        evidence = run_preview_checks(dsn, actor)
    except Exception as exc:
        print("FAILED: real PostgreSQL document preview acceptance (" + type(exc).__name__ + ")", file=sys.stderr)
    finally:
        try:
            cleanup(dsn, [actor])
        except Exception:
            cleanup_ok = False
            print("FAILED: unique preview actor cleanup incomplete", file=sys.stderr)
    if evidence is None or not cleanup_ok:
        return 1
    for item in evidence:
        print("PASS: " + item)
    print("PostgreSQL version: " + version)
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--serve"]:
        _serve()
    else:
        raise SystemExit(main())
