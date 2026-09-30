"""Real ingress HTTP restart acceptance on an already migrated lc_p0_test only.

Run with LC_TEST_DATABASE_URL set privately:
    python -m services.api.tests.postgres_ingress_http_check

Two supervised ephemeral loopback API children share one unique synthetic actor.
No migration, database restart, default app activation or external provider runs.
"""

from copy import deepcopy
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
import secrets
import signal
import sys
import traceback
from uuid import uuid4

from packages.contracts.capture_ingress import validate, validate_original_read
from packages.contracts.process_v2 import validate_ack
from services.api.migrations import MIGRATIONS
from services.api.storage import PostgresStore
from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database
from services.api.tests.postgres_http_check import OwnedProcessNotReaped, _api_process
from services.api.tests.test_control import apply, command, control_fixture
from services.api.tests.test_display_sources import reference
from services.api.tests.test_image_resolver import png
from services.api.tests.test_ingress_http import DISPLAY, FRAMES, ORIGINALS, SOURCE, original_body, read_path


def _readonly(dsn):
    import psycopg
    from psycopg.conninfo import conninfo_to_dict

    return psycopg.connect(dsn, autocommit=True, options=(
        conninfo_to_dict(dsn)["options"] + " -c default_transaction_read_only=on"))


def verify_migrations(dsn):
    """Require the matching installed schema; never apply or repair migrations."""
    expected = {path.name.removesuffix(".up.sql"): sha256(path.read_bytes()).hexdigest()
                for path in MIGRATIONS.glob("*.up.sql")}
    with _readonly(dsn) as connection:
        applied = dict(connection.execute("SELECT version, sha256 FROM lc_backend.schema_migrations").fetchall())
        tables = connection.execute(
            "SELECT to_regclass('lc_backend.actors'), to_regclass('lc_backend.documents')"
        ).fetchone()
    if not expected or applied != expected or not all(tables):
        raise RuntimeError("matching existing migrations required")
    return sorted(applied)


def _documents(dsn, actor):
    with _readonly(dsn) as connection:
        return connection.execute(
            "SELECT kind, doc_key, payload FROM lc_backend.documents WHERE user_id = %s ORDER BY kind, doc_key",
            (actor,),
        ).fetchall()


def _digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def run_http_checks(dsn, actor):
    c = control_fixture(PostgresStore(dsn), actor)
    c.source = {"user_id": actor, "source_id": SOURCE, "source_version": 1}
    c.display = {"contract_version": "0.2.4", "source_id": SOURCE, "stream_id": c.batch["stream_id"],
                 "project_id": None, "source_timezone": "UTC"}
    c.data = png()
    c.ref = reference(c.data, "http-test-png", "image/png")
    c.ink_data = b'{"test_only":true,"editable_strokes":[[1,2],[3,4]]}\n'
    c.ink_ref = reference(c.ink_data, "http-test-editable-ink", "application/json")
    c.frame = {**c.core["Frame"], **c.source, "frame_id": "http-test-frame",
               "artifact_id": c.ref["artifact_id"], "content_hash": c.ref["sha256"],
               "width": 2, "height": 2, "representation": "screen_capture"}
    c.batch["records"][0].update(source=c.source, frame_id=c.frame["frame_id"],
                                artifacts=[c.ref, c.ink_ref], media_position=c.frame["media_position"])
    envelope = {"contract_version": "0.2.4", "batch": c.batch, "frames": [c.frame]}
    with c.store.transaction(actor) as tx:
        generation = tx.get("authorization", "state")["generation"]
    now = datetime.now(timezone.utc)
    credentials = {
        name: {"token": secrets.token_hex(32), "expires_at": (
            now + (timedelta(seconds=-1) if name == "expired" else timedelta(hours=1))
        ).isoformat()}
        for name in ("user", "expired", "revoked")
    }
    config = {"actor": actor, "generation": generation, "credentials": credentials,
              "app_kind": "capture_ingress"}
    evidence = {"actor": actor, "source": c.source, "artifacts": [c.ref, c.ink_ref],
                "envelope_sha256": _digest(envelope), "http": [], "processes": []}

    def request(client, label, method, path, *, body=None, schema=None, status=200,
                code=None, token=None, request_key=None):
        headers = {"Authorization": "Bearer " + (token or credentials["user"]["token"])}
        if request_key:
            headers["Idempotency-Key"] = request_key
        response = client.request(method, path, headers=headers, **({"json": body} if body is not None else {}))
        result = {"check": label, "status": response.status_code}
        evidence["http"].append(result)
        # Safe progress remains observable if a later assertion fails. Never emit
        # response bodies, token values, connection details or exception strings.
        print("CHECK " + json.dumps(result), flush=True)
        assert response.status_code == status, "unexpected HTTP status"
        assert response.headers["cache-control"] == "no-store"
        value = response.json()
        if code:
            validate("IngressError", value)
            assert value == {"contract_version": "0.2.4", "error": code,
                             "retryable": code in {"unavailable", "dependency_missing"}}
            if status == 401:
                assert response.headers["www-authenticate"] == "Bearer"
        else:
            validate(schema, value)
        return value

    def read_originals(client, phase):
        for ink in (False, True):
            body = original_body(c, ink=ink)
            artifact_id = body["artifact"]["artifact_id"]
            value = request(client, phase + ("_ink" if ink else "_png"), "GET",
                            read_path(c, artifact_id=artifact_id), schema="OriginalArtifactUpload")
            assert value == body
            assert validate_original_read(value, source_id=SOURCE, source_version=1,
                artifact_id=artifact_id, user_id=actor) == (c.ink_data if ink else c.data)

    @contextmanager
    def owned_process():
        with _api_process(dsn, config) as (client, process):
            item = {"pid": process.pid, "host": "127.0.0.1", "port": client.base_url.port}
            evidence["processes"].append(item)
            print("PROCESS " + json.dumps(item), flush=True)
            yield client, process
        item["returncode"] = process.returncode
        print("PROCESS_EXIT " + json.dumps(item), flush=True)
        # Do not replace a reaping failure or interruption from the supervisor.
        # Uvicorn restores and re-raises SIGTERM after graceful shutdown;
        # forced SIGKILL or any unexpected exit must never pass acceptance.
        assert process.returncode in (0, -signal.SIGTERM), "unexpected owned API exit"

    with owned_process() as (client, first):
        descriptor = request(client, "register", "PUT", DISPLAY, body=c.display, schema="DisplaySourceSnapshot")
        assert all(descriptor[k] == value for k, value in c.source.items())
        for ink in (False, True):
            body = original_body(c, ink=ink)
            receipt = request(client, "put_ink" if ink else "put_png", "PUT",
                ORIGINALS + body["artifact"]["artifact_id"], body=body, schema="OriginalArtifactReceipt")
            assert receipt == {**{k: v for k, v in body.items() if k != "data_base64"}, "status": "bytes_committed"}
        ack = request(client, "commit_frames", "POST", FRAMES, body=envelope,
                      request_key="real-http-frames", schema="ProcessBatchAck")
        verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
                    for ref in (c.ref, c.ink_ref)}
        validate_ack(c.batch, ack, user_id=actor, verified_artifacts=verified)
        assert all(a["status"] == "verified" for row in ack["acknowledged"] for a in row["artifacts"])
        read_originals(client, "before_restart")
        before_restart = _documents(dsn, actor)
    assert first.poll() is not None, "first API process must exit before restart"
    evidence["first_exited_before_restart"] = True

    with owned_process() as (client, second):
        assert second.pid != first.pid, "restart requires a fresh API process"
        assert request(client, "restart_display", "GET", DISPLAY, schema="DisplaySourceSnapshot") == descriptor
        read_originals(client, "restart")
        assert request(client, "restart_ack", "POST", FRAMES, body=envelope,
                       request_key="real-http-frames", schema="ProcessBatchAck") == ack
        assert _documents(dsn, actor) == before_restart
        evidence["restart_documents_sha256"] = _digest(before_restart)
        evidence["ack_sha256"] = _digest(ack)
        evidence["descriptor_sha256"] = _digest(descriptor)
        with c.store.transaction(actor) as tx:
            assert tx.get("frame", c.frame["frame_id"]) == c.frame
        assert c.registry.capture.read_record(actor, c.batch["records"][0]["record_id"])["record"] == c.batch["records"][0]

        changed = deepcopy(envelope)
        changed["frames"][0]["width"] = 3
        before = _documents(dsn, actor)
        request(client, "changed_envelope", "POST", FRAMES, body=changed, request_key="real-http-frames",
                status=409, code="idempotency_conflict")
        assert _documents(dsn, actor) == before
        for name in ("invalid", "expired", "revoked"):
            token = "unknown-test-token" if name == "invalid" else credentials[name]["token"]
            request(client, name + "_read", "GET", read_path(c), token=token, status=401, code="unauthenticated")
            request(client, name + "_replay", "POST", FRAMES, body=envelope, request_key="real-http-frames",
                    token=token, status=401, code="unauthenticated")
        assert _documents(dsn, actor) == before

        # Existing trusted internal control hook, not a new public Stop endpoint.
        stopped = apply(c, command(c))
        assert stopped["state"] == "stopped"
        before = _documents(dsn, actor)
        assert request(client, "stopped_display", "GET", DISPLAY, schema="DisplaySourceSnapshot") == descriptor
        read_originals(client, "stopped_history")
        body = original_body(c)
        request(client, "stopped_original_retry", "PUT", ORIGINALS + c.ref["artifact_id"], body=body,
                status=403, code="forbidden")
        new_body = deepcopy(body)
        new_body["artifact"]["artifact_id"] = "new-after-stop"
        request(client, "stopped_new_original", "PUT", ORIGINALS + "new-after-stop", body=new_body,
                status=403, code="forbidden")
        request(client, "stopped_live_replay", "POST", FRAMES, body=envelope, request_key="real-http-frames",
                status=409, code="capture_stopped")
        assert _documents(dsn, actor) == before

        c.archive.revoke_source(actor, SOURCE)
        before = _documents(dsn, actor)
        for ref in (c.ref, c.ink_ref):
            request(client, "source_revoked_" + ref["artifact_id"], "GET", read_path(c, artifact_id=ref["artifact_id"]),
                    status=403, code="forbidden")
        assert _documents(dsn, actor) == before

        c.archive.set_authorization(actor, False)
        before = _documents(dsn, actor)
        request(client, "account_revoked_read", "GET", DISPLAY, status=403, code="forbidden")
        request(client, "account_revoked_replay", "POST", FRAMES, body=envelope, request_key="real-http-frames",
                status=403, code="forbidden")
        assert _documents(dsn, actor) == before
    assert second.poll() is not None, "second API process must exit before cleanup"
    evidence["refusals_leave_documents_unchanged"] = True
    return evidence


def _interrupt(_signum, _frame):
    raise KeyboardInterrupt


def main(*, desktop_runtime=False):
    configured = os.environ.get("LC_TEST_DATABASE_URL")
    if not configured or sys.flags.optimize:
        print("BLOCKED: dedicated DSN and enabled assertions required", file=sys.stderr)
        return 2
    try:
        dsn = dedicated_test_dsn(configured)
        version = verify_test_database(dsn)
        migrations = verify_migrations(dsn)
    except Exception as exc:
        print("BLOCKED: dedicated already-migrated lc_p0_test required (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2
    run = run_http_checks
    if desktop_runtime:
        from services.api.tests.postgres_desktop_runtime_check import run_desktop_checks, verify_pristine_actor
        run = run_desktop_checks
    actor = ("lc-desktop-http-" if desktop_runtime else "lc-ingress-http-") + uuid4().hex
    if desktop_runtime:
        try:
            verify_pristine_actor(dsn, actor)
        except Exception as exc:
            print("BLOCKED: unique pristine desktop actor required (" + type(exc).__name__ + ")", file=sys.stderr)
            return 2
    passed = False
    cleanup_allowed = True
    previous = signal.signal(signal.SIGTERM, _interrupt)
    try:
        try:
            evidence = run(dsn, actor)
            passed = True
        except (Exception, KeyboardInterrupt) as exc:
            if isinstance(exc, OwnedProcessNotReaped):
                cleanup_allowed = False
                print(f"FAILED: owned API PID {exc.pid} exit unconfirmed; actor {actor} retained; "
                      "cleanup withheld pending ownership reconciliation; "
                      f"interrupted={isinstance(exc.__cause__, KeyboardInterrupt)}", file=sys.stderr)
            last = traceback.extract_tb(exc.__traceback__)[-1]
            print(f"FAILED: ingress HTTP check ({type(exc).__name__}, {last.name}:{last.lineno})", file=sys.stderr)
        finally:
            if cleanup_allowed:
                try:
                    cleanup(dsn, [actor])
                except (Exception, KeyboardInterrupt):
                    passed = False
                    print("FAILED: unique ingress HTTP actor cleanup incomplete", file=sys.stderr)
    finally:
        signal.signal(signal.SIGTERM, previous)
    if passed:
        print("PASS " + json.dumps({**evidence, "postgresql": version, "migrations": migrations,
                                     "cleanup": "own actor only, completed"}, sort_keys=True))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
