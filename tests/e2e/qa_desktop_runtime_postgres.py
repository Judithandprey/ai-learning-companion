"""Independent QA regression on the dedicated PostgreSQL desktop runtime (P0-13).

Run from the worktree with LC_TEST_DATABASE_URL supplied privately (never printed):
    python -m tests.e2e.qa_desktop_runtime_postgres

It reuses the Backend runner's main unchanged: dedicated local lc_p0_test and
read-only identity/migration-hash checks, a pristine unique actor, the owned
loopback API supervisor, and exact-actor cleanup only after every child exits.
No migration, database restart, preview database, provider or external account.
Identity, consent, native metadata and PNG/editable ink are synthetic test inputs.

The one QA scenario, chosen independently of the author's checks: in a restarted API
process, the source is deleted (R58) after the Learning resolver has already
returned the original bytes. Then deletion must hold at every boundary and survive a
third API process, whose token expiry is also checked at the HTTP and reader
boundaries.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
import secrets
import signal
import time

from packages.contracts import capture_ingress, desktop_capture_ingress, process_control
from services.api.domain import Archive, utc_now
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import PostgresStore
from services.api.tests import postgres_desktop_runtime_check as backend_runner
from services.api.tests.postgres_desktop_runtime_check import runtime_for_check, scenario
from services.api.tests.postgres_http_check import _api_process
from services.api.tests.postgres_ingress_http_check import _digest, _documents, main
from services.api.tests.test_capture_app import COLLECTION, ORIGINALS, original_body, original_path
from services.api.tests.test_desktop_ingress_http import DESKTOP_ROUTE
from services.learning.process_context import prepare_observation_window

EXPIRY_SECONDS = 20  # Third process token: long enough for its checks, then waited out.
TOMBSTONES = ("capture_tombstone", "frame_tombstone", "original_artifact_tombstone", "capture_artifact_tombstone")


def run_qa_regression(dsn, actor):
    c = scenario(actor)
    assert _documents(dsn, actor) == [], "target archive must start pristine"
    source_id = c.source["source_id"]
    gap_id = c.first_gap["batch"]["records"][0]["record_id"]
    record_id = c.batch["records"][0]["record_id"]
    originals = {ink: original_body(c, ink=ink) for ink in (False, True)}

    def config_for(fresh_consent, seconds):
        return {"app_kind": "desktop_runtime", "actor": actor, "registration": c.registration,
                "fresh_consent": fresh_consent, "token": secrets.token_hex(32),
                "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()}

    config = config_for(True, 3600)
    tokens = [config["token"]]
    evidence = {"actor": actor, "scenario": "QA: final-use source deletion after original resolution, "
                "deletion durability across a third API process, token expiry",
                "input": "synthetic consent, identity, native metadata and project-authored PNG/editable ink",
                "http": [], "processes": [], "groups": []}

    def request(client, label, method, path, *, status, code=None, body=None, request_key=None):
        headers = {"Authorization": "Bearer " + config["token"]}
        if request_key is not None:
            headers["Idempotency-Key"] = request_key
        response = client.request(method, path, headers=headers, **({"json": body} if body is not None else {}))
        check = {"check": label, "status": response.status_code}
        evidence["http"].append(check)
        print("CHECK " + json.dumps(check), flush=True)
        assert response.status_code == status, label + ": unexpected HTTP status"
        assert response.headers["cache-control"] == "no-store"
        value = response.json()
        if code is not None:
            assert value["error"] == code and value["retryable"] is (code == "unavailable"), label
            assert "data_base64" not in value, label + ": refusal carried original bytes"
        return value

    def submit(client, label, payload, request_key, *, status=200, code=None):
        value = request(client, label, "POST", DESKTOP_ROUTE, body=payload, request_key=request_key,
                        status=status, code=code)
        desktop_capture_ingress.validate("DesktopIngressError" if code else "ProcessBatchAck", value)
        return value

    def composer(on_resolved=None):
        """Current-authorized Learning window on fresh DB connections, as in the author's reader."""
        runtime = runtime_for_check(dsn, {**config, "fresh_consent": False})
        token = config["token"]

        def guard(state):
            principal = runtime.app.state.authenticator.authenticate(token, utc_now())
            if (principal != runtime.principal or "sources:read" not in principal.scopes
                    or state.get("generation") != principal.authorization_generation):
                raise DomainError(403, "forbidden")

        store = PostgresStore(dsn)
        reader = AuthorizedProcessContextReader(store, actor, guard).read_desktop
        resolve = AuthorizedImageResolver(store, actor, guard).resolve_desktop

        def resolver(frame, *, max_bytes):
            result = resolve(frame, max_bytes=max_bytes)
            if on_resolved is not None:
                on_resolved(result)
            return result
        return lambda ids: prepare_observation_window(ids, reader, resolver, user_id=actor)

    def refused_window(compose, ids, status, code):
        packets = []
        try:
            packets.append(compose(ids))
        except DomainError as error:
            assert (error.status, error.code) == (status, code)
        assert not packets, "Learning window returned after current access ended"

    @contextmanager
    def owned_process():
        with _api_process(dsn, config) as (client, process):
            item = {"pid": process.pid, "host": "127.0.0.1", "port": client.base_url.port,
                    "fresh_consent": config["fresh_consent"]}
            evidence["processes"].append(item)
            print("PROCESS " + json.dumps(item), flush=True)
            yield client, process
        item["returncode"] = process.returncode
        print("PROCESS_EXIT " + json.dumps(item), flush=True)
        assert process.returncode in (0, -signal.SIGTERM), "unexpected owned API exit"

    def deleted_everywhere(client, phase, compose):
        for ink, body in originals.items():
            artifact_id = body["artifact"]["artifact_id"]
            kind = "ink" if ink else "png"
            request(client, f"{phase}_get_{kind}", "GET", original_path(c, artifact_id), status=404, code="not_found")
            request(client, f"{phase}_reput_{kind}", "PUT", ORIGINALS + artifact_id, body=body,
                    status=404, code="not_found")
        submit(client, f"{phase}_replayed_frame", c.envelope, "desktop-frame", status=404, code="not_found")
        submit(client, f"{phase}_new_key_frame", c.envelope, "qa-new-key-" + phase, status=404, code="not_found")
        submit(client, f"{phase}_replayed_gap", c.first_gap, "desktop-gap", status=404, code="not_found")
        request(client, f"{phase}_reregister_display", "PUT", c.display_path, body=c.display,
                status=404, code="not_found")
        refused_window(compose, [gap_id, record_id], 404, "not_found")

    # Phase 1: pristine enrollment with explicit synthetic fresh consent; commit gap, PNG, ink, frame.
    with owned_process() as (client, first):
        assert request(client, "register", "POST", COLLECTION, body=c.registration,
                       request_key="desktop-registration", status=200)["state"] == "live"
        request(client, "display", "PUT", c.display_path, body=c.display, status=200)
        submit(client, "first_frameless_gap", c.first_gap, "desktop-gap")
        for ink, body in originals.items():
            request(client, "put_ink" if ink else "put_png", "PUT", ORIGINALS + body["artifact"]["artifact_id"],
                    body=body, status=200)
        ack = submit(client, "desktop_frame", c.envelope, "desktop-frame")
        baseline = composer()([gap_id, record_id])
        assert [item["image"]["status"] for item in baseline["items"]] == ["missing_frame", "attached"]
        assert baseline["items"][1]["image"]["data"] == c.data
        committed = _documents(dsn, actor)
        evidence["groups"].append("pristine enrollment; gap, PNG, editable ink and desktop frame committed")
    assert first.poll() is not None, "first process must exit before restart"

    # Phase 2: new API process and token, no fresh consent; delete the source after the
    # resolver has already returned the original bytes for the final Learning window.
    config = config_for(False, 3600)
    tokens.append(config["token"])
    with owned_process() as (client, second):
        assert second.pid != first.pid
        assert _documents(dsn, actor) == committed, "reopen without fresh consent changed the archive"
        assert submit(client, "replayed_frame_before_delete", c.envelope, "desktop-frame") == ack
        for ink, body in originals.items():
            value = request(client, "reopened_ink" if ink else "reopened_png", "GET",
                            original_path(c, body["artifact"]["artifact_id"]), status=200)
            assert capture_ingress.validate_original_read(
                value, source_id=source_id, source_version=1, artifact_id=body["artifact"]["artifact_id"],
                user_id=actor) == (c.ink_data if ink else c.data)
        assert composer()([gap_id, record_id]) == baseline
        resolved = []

        def delete_after_resolution(result):
            resolved.append(result["status"])
            assert result["status"] == "available" and result["data"] == c.data
            Archive(PostgresStore(dsn)).delete_source(actor, source_id)

        refused_window(composer(delete_after_resolution), [gap_id, record_id], 404, "not_found")
        assert resolved == ["available"], "deletion must follow an actual original resolution"
        deleted = _documents(dsn, actor)
        evidence["groups"].append("restarted PID: source deleted after the resolver returned PNG bytes; "
                                  "the whole Learning window is withheld")
        deleted_everywhere(client, "deleted", composer())
        assert _documents(dsn, actor) == deleted, "a refusal changed the deleted archive"
        stored = json.dumps([payload for _, _, payload in deleted])
        for body in originals.values():
            assert body["data_base64"] not in stored, "deleted original bytes remain stored"
        kinds = {(kind, key) for kind, key, _ in deleted}
        for kind, key in [("capture_tombstone", gap_id), ("capture_tombstone", record_id),
                          ("frame_tombstone", c.desktop_frame["frame_id"])] + [
                (kind, body["artifact"]["artifact_id"]) for body in originals.values()
                for kind in TOMBSTONES[2:]]:
            assert (kind, key) in kinds, f"missing {kind}"
        evidence["groups"].append("after deletion: originals, re-upload, replay, new key, gap, display "
                                  "re-registration and Learning all refuse; no stored bytes; tombstones")
    assert second.poll() is not None, "second process must exit before the third starts"

    # Phase 3: third API process with a short-lived token; deletion persists, then expiry ends access.
    config = config_for(False, EXPIRY_SECONDS)
    tokens.append(config["token"])
    expires_at = datetime.fromisoformat(config["expires_at"])
    with owned_process() as (client, third):
        assert third.pid not in {first.pid, second.pid}
        assert _documents(dsn, actor) == deleted, "restart resurrected or regranted deleted data"
        compose = composer()
        deleted_everywhere(client, "restarted", compose)
        assert request(client, "stream_before_expiry", "GET", c.stream_path, status=200)["state"] == "live"
        remaining = (expires_at - datetime.now(timezone.utc)).total_seconds()
        assert remaining > 1, "expiry reached before the pre-expiry checks finished"
        time.sleep(remaining + 1)
        body = request(client, "stream_after_expiry", "GET", c.stream_path, status=401, code="unauthenticated")
        process_control.validate("ControlError", body)
        submit(client, "replay_after_expiry", c.envelope, "desktop-frame", status=401, code="unauthenticated")
        refused_window(compose, [gap_id], 401, "unauthenticated")
        final = _documents(dsn, actor)
        assert final == deleted, "restart, refusals or expiry changed the archive"
        assert not any(token in json.dumps([p for _, _, p in final]) for token in tokens), "token persisted"
        evidence["groups"].append("third PID: deletion durable at every boundary; after token expiry HTTP "
                                  "and the reader refuse; no token persisted")
    assert third.poll() is not None, "third process must exit before cleanup"
    evidence["deleted_documents_sha256"] = _digest(deleted)
    evidence["document_kinds_after_delete"] = sorted({kind for kind, _, _ in deleted})
    return evidence


if __name__ == "__main__":
    # Reuse the Backend runner's preflight, pristine actor, supervision and cleanup
    # unchanged; only the scenario function is QA's.
    backend_runner.run_desktop_checks = run_qa_regression
    raise SystemExit(main(desktop_runtime=True))
