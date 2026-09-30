"""One foreground desktop_local acceptance on already migrated lc_p0_test.

Run python -m services.api.tests.postgres_desktop_local_check with the dedicated
LC_TEST_DATABASE_URL supplied privately. Only a fresh unique actor is owned.
The host receives one private JSON line on an open stdin pipe, never arguments
or environment credentials. No migration, database restart or native capture.
"""

import base64
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
import re
import secrets
import selectors
import signal
import subprocess
import sys
import tempfile
import time
import traceback
from uuid import uuid4

import httpx

from packages.contracts import capture_ingress, process_control, windows_capture_ingress
from services.api.desktop_local import _unique_object
from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database
from services.api.tests.postgres_desktop_runtime_check import scenario, verify_pristine_actor
from services.api.tests.postgres_http_check import ROOT, OwnedProcessNotReaped, _reap_owned_process
from services.api.tests.postgres_ingress_http_check import _digest, _documents, _interrupt, verify_migrations
from services.api.tests.test_capture_app import COLLECTION, ORIGINALS, SCOPES, original_body, original_path
from services.api.tests.test_control import command
from services.api.tests.test_windows_ingress_http import WINDOWS_ROUTE


CAPABILITIES = frozenset({"process.control.v0.2.1", "process.capture.v0.2",
                          "process.ingress.v0.2.4", windows_capture_ingress.CAPABILITY})
READY_FORMAT = "lc-desktop-capture-host-ready-v1"


def _ready_record(data):
    """Validate a bounded content-free receipt before opening any HTTP client."""
    if type(data) is not bytes or len(data) > 4096 or not data.endswith(b"\n") or data.count(b"\n") != 1:
        raise ValueError("invalid owned-host readiness")
    try:
        value = json.loads(data, object_pairs_hook=_unique_object)
    except (ValueError, UnicodeError):
        raise ValueError("invalid owned-host readiness") from None
    if (type(value) is not dict or set(value) != {"format", "status", "origin", "start_status"}
            or value["format"] != READY_FORMAT or value["status"] != "ready"
            or value["start_status"] not in ("pending", "consumed")
            or type(value["origin"]) is not str):
        raise ValueError("invalid owned-host readiness")
    match = re.fullmatch(r"http://127\.0\.0\.1:([0-9]{1,5})", value["origin"])
    if match is None or not 1 <= int(match[1]) <= 65535 or int(match[1]) in (4173, 8174):
        raise ValueError("owned host must use an isolated ephemeral loopback port")
    return value


def _wait_ready(process):
    deadline, data = time.monotonic() + 15, b""
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("owned host exited before readiness")
            if not selector.select(max(0, deadline - time.monotonic())):
                break
            chunk = os.read(process.stdout.fileno(), 4097 - len(data))
            if not chunk:
                raise RuntimeError("owned host closed readiness pipe")
            data += chunk
            if len(data) > 4096 or b"\n" in data:
                return _ready_record(data)
    raise RuntimeError("owned host readiness timed out")


@contextmanager
def _host_process(config, *, shutdown):
    """Supervise the real executable; always confirm its exit before DB cleanup."""
    if shutdown not in ("eof", "term"):
        raise ValueError("explicit host shutdown mode required")
    environment = {name: value for name, value in os.environ.items()
                   if name not in {"LC_TEST_DATABASE_URL", "LC_DATABASE_URL", "LC_HTTP_CHECK_CONFIG"}}
    # Private automatically removed diagnostics avoid pipe backpressure. Never
    # print them, even on failure; a successful host must emit no diagnostics.
    with tempfile.TemporaryFile() as diagnostics:
        process = subprocess.Popen(
            [sys.executable, "-m", "services.api.desktop_local"], cwd=ROOT, env=environment,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=diagnostics,
        )
        try:
            process.stdin.write(json.dumps(config, allow_nan=False, separators=(",", ":")).encode("utf-8") + b"\n")
            process.stdin.flush()  # Keep the pipe open for the complete host lifetime.
            ready = _wait_ready(process)
            expected = "pending" if config["fresh_consent"] else "consumed"
            if ready["start_status"] != expected:
                raise AssertionError("unexpected host start status")
            with httpx.Client(base_url=ready["origin"], timeout=3, trust_env=False) as client:
                yield client, process, ready
        finally:
            try:
                if process.poll() is None:
                    if shutdown == "eof":
                        process.stdin.close()
                    else:
                        process.terminate()
                    process.wait(timeout=8)
            finally:
                # Reuse bounded reaping and its cleanup-ownership failure.
                _reap_owned_process(process)
                process.stdin.close()
                trailing = process.stdout.read(4097)
                process.stdout.close()
            diagnostics.seek(0)
            if trailing or diagnostics.read(4097) or process.returncode != 0:
                raise AssertionError("unexpected owned-host output or exit")


def _config(dsn, actor, c):
    return {
        "format": "lc-desktop-capture-host-v1", "port": 0, "database_dsn": dsn,
        "user_id": actor, "device_id": c.registration["device_id"],
        "session_id": c.registration["session_id"], "producer_id": "synthetic-desktop-local-check",
        "registration": deepcopy(c.registration), "token": secrets.token_hex(32),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat().replace("+00:00", "Z"),
        "scopes": sorted(SCOPES), "capabilities": sorted(CAPABILITIES),
        "fresh_consent": True, "producer_profile": "desktop_pixels",
        "enable_raw_ingress": False, "enable_desktop_ingress": False,
        "enable_windows_ingress": True, "enable_macos_ingress": False,
    }


def run_host_checks(dsn, actor):
    """One synthetic Windows frame, exact originals/ACK and restrictive restarts."""
    c = scenario(actor, windows=True)
    # The earlier runner includes a separate first-gap campaign. This host check
    # needs only one existing valid frame record, not a repeated archive suite.
    c.batch["records"][0].update(sequence=1, causal_parents=[])
    assert _documents(dsn, actor) == [], "test actor must start pristine"
    config = _config(dsn, actor, c)
    tokens = [config["token"]]
    originals = [
        ("raw", original_body(c), c.data),
        ("composed", {"contract_version": "0.2.2", "source": c.source, "kind": "screen_image",
                      "artifact": c.composed_ref,
                      "data_base64": base64.b64encode(c.composed_data).decode("ascii")}, c.composed_data),
        ("ink", original_body(c, ink=True), c.ink_data),
    ]
    evidence = {"actor": actor, "input": "synthetic consent/identity, Windows metadata and project-authored PNG/ink",
                "contract_version": "0.2.10", "http": [], "processes": [], "groups": []}

    def request(client, label, method, path, *, body=None, schema=None, status=200,
                code=None, request_key=None, token=None, family=capture_ingress):
        headers = {"Authorization": "Bearer " + (config["token"] if token is None else token)}
        if request_key is not None:
            headers["Idempotency-Key"] = request_key
        response = client.request(method, path, headers=headers, **({"json": body} if body is not None else {}))
        result = {"check": label, "status": response.status_code}
        evidence["http"].append(result)
        print("CHECK " + json.dumps(result), flush=True)
        assert response.status_code == status, "unexpected HTTP status"
        assert response.headers["cache-control"] == "no-store"
        assert all(token not in response.text for token in tokens), "credential appeared in HTTP output"
        value = response.json()
        if code is not None:
            family.validate(schema, value)
            assert value["error"] == code
            assert value["retryable"] is (code in {"unavailable", "dependency_missing"})
            if status == 401:
                assert response.headers["www-authenticate"] == "Bearer"
        elif schema:
            family.validate(schema, value)
        return value

    def register(client, label):
        return request(client, label, "POST", COLLECTION, body=c.registration,
                       request_key="host-registration", schema="StreamState", family=process_control)

    def state(client, label):
        return request(client, label, "GET", c.stream_path, schema="StreamState", family=process_control)

    def submit(client, label, *, status=200, code=None, token=None):
        value = request(client, label, "POST", WINDOWS_ROUTE, body=c.envelope,
                        request_key="host-frame", status=status, code=code, token=token,
                        schema="WindowsIngressError" if code else None, family=windows_capture_ingress)
        if code is None:
            verified = {tuple(body["artifact"][name] for name in
                              ("artifact_id", "sha256", "byte_length", "media_type"))
                        for _, body, _ in originals}
            windows_capture_ingress.validate_ack(c.batch, value, user_id=actor, verified_artifacts=verified)
        return value

    def read_originals(client, phase):
        for role, body, data in originals:
            artifact_id = body["artifact"]["artifact_id"]
            value = request(client, phase + "_" + role, "GET", original_path(c, artifact_id),
                            schema="OriginalArtifactUpload")
            assert value == body
            assert capture_ingress.validate_original_read(value, source_id=c.source["source_id"],
                source_version=1, artifact_id=artifact_id, user_id=actor) == data

    def restart():
        config.update(fresh_consent=False, token=secrets.token_hex(32))
        tokens.append(config["token"])

    @contextmanager
    def owned(shutdown):
        with _host_process(config, shutdown=shutdown) as (client, process, ready):
            item = {"pid": process.pid, "origin": ready["origin"], "start_status": ready["start_status"],
                    "fresh_consent": config["fresh_consent"], "shutdown": shutdown}
            assert all(old["pid"] != process.pid for old in evidence["processes"])
            evidence["processes"].append(item)
            yield client
        assert process.poll() is not None
        item["returncode"] = process.returncode
        print("PROCESS_EXIT " + json.dumps(item), flush=True)

    with owned("eof") as client:
        pending = _documents(dsn, actor)
        assert {kind for kind, _, _ in pending} == {
            "authorization", "device", "session", "control_membership", "control_start"}
        live = register(client, "register")
        assert live["state"] == "live" and state(client, "current_live") == live
        descriptor = request(client, "source_put", "PUT", c.display_path, body=c.display,
                             schema="DisplaySourceSnapshot")
        assert all(descriptor[name] == value for name, value in c.source.items())
        for role, body, _ in originals:
            receipt = request(client, "put_" + role, "PUT", ORIGINALS + body["artifact"]["artifact_id"],
                              body=body, schema="OriginalArtifactReceipt")
            assert receipt == {**{name: value for name, value in body.items() if name != "data_base64"},
                               "status": "bytes_committed"}
        ack = submit(client, "frame_commit")
        assert submit(client, "exact_retry") == ack
        read_originals(client, "saved")
        saved = _documents(dsn, actor)
        archive = {(kind, identity): row for kind, identity, row in saved}
        assert archive[("raw_capture_frame", c.windows_frame["frame_id"])] == c.windows_frame
        assert json.loads(archive[("capture_record", c.batch["records"][0]["record_id"])]["canonical_json"])["record"] == c.batch["records"][0]
        submit(client, "wrong_auth", token="synthetic-unknown-credential", status=401, code="unauthenticated")
        assert _documents(dsn, actor) == saved
    evidence["groups"].append("private stdin executable, pending registration, exact HTTP PNG/ink/frame/ACK and EOF shutdown")

    restart()
    with owned("term") as client:
        assert _documents(dsn, actor) == saved, "reopen rewrote retained state"
        assert register(client, "registration_replay") == live
        assert state(client, "reopened_live") == live
        assert request(client, "source_reopened", "GET", c.display_path, schema="DisplaySourceSnapshot") == descriptor
        read_originals(client, "reopened")
        assert submit(client, "reopened_exact_ack") == ack
        submit(client, "old_token", token=tokens[0], status=401, code="unauthenticated")
        assert _documents(dsn, actor) == saved
        stopped = request(client, "stop", "POST", c.stream_path + ":control", body=command(c),
                          request_key="host-stop", schema="StreamState", family=process_control)
        assert stopped["state"] == "stopped" and stopped["pre_stop_sequence"] is None
        submit(client, "stopped_retry", status=409, code="capture_stopped")
        stopped_documents = _documents(dsn, actor)
    evidence["groups"].append("rotated-token false-consent reopen preserves exact originals/ACK; HTTP Stop and TERM shutdown")

    restart()
    with owned("eof") as client:
        assert _documents(dsn, actor) == stopped_documents
        assert state(client, "reopened_stopped") == register(client, "stopped_registration") == stopped
        submit(client, "reopened_stop_refusal", status=409, code="capture_stopped")
        read_originals(client, "stopped_originals")
        assert _documents(dsn, actor) == stopped_documents
        withdrawn = request(client, "withdraw", "POST", c.stream_path + ":control",
                            body=command(c, "withdraw", revision=stopped["revision"]),
                            request_key="host-withdraw", schema="StreamState", family=process_control)
        assert withdrawn["state"] == "withdrawn"
        submit(client, "withdrawn_retry", status=403, code="forbidden")
        withdrawn_documents = _documents(dsn, actor)
    evidence["groups"].append("Stop survives host restart with unknown physical boundary; authorized originals remain readable")

    restart()
    with owned("term") as client:
        assert _documents(dsn, actor) == withdrawn_documents
        assert state(client, "reopened_withdrawn") == register(client, "withdrawn_registration") == withdrawn
        submit(client, "reopened_withdraw_refusal", status=403, code="forbidden")
        historical = deepcopy(c.envelope)
        historical["batch"]["delivery_mode"] = "historical"
        request(client, "withdrawn_historical_refusal", "POST", WINDOWS_ROUTE, body=historical,
                request_key="withdrawn-historical", status=403, code="forbidden",
                schema="WindowsIngressError", family=windows_capture_ingress)
        read_originals(client, "withdrawn_originals")
        final = _documents(dsn, actor)
        assert final == withdrawn_documents
        assert all(token not in repr(final) for token in tokens), "credential persisted in actor documents"
        assert dsn not in repr(final), "connection configuration persisted in actor documents"
    evidence["groups"].append("withdraw survives restart and refuses live/historical transmission without deleting originals")
    evidence.update(envelope_sha256=_digest(c.envelope), frame_sha256=_digest(c.windows_frame),
                    ack_sha256=_digest(ack), original_refs=[body["artifact"] for _, body, _ in originals],
                    saved_documents_sha256=_digest(saved), final_documents_sha256=_digest(final),
                    credentials_in_args_env_or_output=False, all_owned_children_reaped=True,
                    physical_stop="not_attested", native_capture="not_exercised", provider="not_activated")
    return evidence


def main():
    configured = os.environ.get("LC_TEST_DATABASE_URL")
    if not configured or sys.flags.optimize:
        print("BLOCKED: dedicated DSN and enabled assertions required", file=sys.stderr)
        return 2
    actor = "lc-windows-http-" + uuid4().hex
    try:
        dsn = dedicated_test_dsn(configured)
        version = verify_test_database(dsn)
        migrations = verify_migrations(dsn)
        verify_pristine_actor(dsn, actor, windows=True)
    except Exception as error:
        print("BLOCKED: dedicated migrated database and pristine actor required (" + type(error).__name__ + ")",
              file=sys.stderr)
        return 2
    passed, cleanup_allowed = False, True
    previous = signal.signal(signal.SIGTERM, _interrupt)
    try:
        try:
            evidence = run_host_checks(dsn, actor)
            passed = True
        except (Exception, KeyboardInterrupt) as error:
            if isinstance(error, OwnedProcessNotReaped):
                cleanup_allowed = False
                print(f"FAILED: owned host PID {error.pid} exit unconfirmed; actor {actor} retained", file=sys.stderr)
            last = traceback.extract_tb(error.__traceback__)[-1]
            print(f"FAILED: desktop local check ({type(error).__name__}, {last.name}:{last.lineno})", file=sys.stderr)
        finally:
            if cleanup_allowed:
                try:
                    cleanup(dsn, [actor])
                except (Exception, KeyboardInterrupt):
                    passed = False
                    print("FAILED: unique owned actor cleanup incomplete", file=sys.stderr)
    finally:
        signal.signal(signal.SIGTERM, previous)
    if passed:
        print("PASS " + json.dumps({**evidence, "postgresql": version, "migrations": migrations,
                                     "cleanup": "own actor only, completed"}, sort_keys=True))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
