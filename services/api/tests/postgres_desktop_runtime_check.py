"""Dedicated PostgreSQL + owned API restart for the released desktop runtime.

Run: python -m services.api.tests.postgres_desktop_runtime_check
LC_TEST_DATABASE_URL is supplied privately. Reuses the ingress runner's preflight,
supervisor and exact-actor cleanup; never migrates or restarts the database.
Consent, identity, native metadata and PNG/editable ink are synthetic test inputs.
"""

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import re
import secrets
import signal

from packages.contracts import capture_ingress, desktop_capture_ingress, process_control
from services.api.capture_runtime import create_local_capture_runtime
from services.api.domain import Archive, utc_now
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import MemoryStore, PostgresStore
from services.api.tests.postgres_check import dedicated_test_dsn, verify_test_database
from services.api.tests.postgres_http_check import _api_process
from services.api.tests.postgres_ingress_http_check import (
    _digest, _documents, _readonly, main, verify_migrations,
)
from services.api.tests.test_capture_app import (
    COLLECTION, ORIGINALS, SCOPES, context, original_body, original_path,
)
from services.api.tests.test_control import command, resolve_stop_fact
from services.api.tests.test_desktop_frame_ingress import EXAMPLE, pixel_record
from services.api.tests.test_desktop_ingress_http import DESKTOP_ROUTE, gap
from services.learning.process_context import prepare_observation_window


CAPABILITIES = frozenset({"process.control.v0.2.1", "process.capture.v0.2",
                          "process.ingress.v0.2.4", "process.desktop-ingress.v0.2.8"})


def _actor(actor):
    if type(actor) is not str or re.fullmatch(r"lc-desktop-http-[0-9a-f]{32}", actor) is None:
        raise ValueError("unique desktop test actor required")


def verify_pristine_actor(dsn, actor):
    """A collision is not cleanup ownership; never open a mutating store here."""
    _actor(actor)
    with _readonly(dsn) as connection:
        exists = connection.execute(
            "SELECT EXISTS (SELECT 1 FROM lc_backend.actors WHERE user_id = %s) "
            "OR EXISTS (SELECT 1 FROM lc_backend.documents WHERE user_id = %s)",
            (actor, actor),
        ).fetchone()[0]
    if exists:
        raise ValueError("test actor already exists")


def runtime_for_check(dsn, config):
    """Test child/reader wiring, not a production or public bootstrap."""
    _actor(config["actor"])
    if type(config["fresh_consent"]) is not bool:
        raise ValueError("explicit synthetic consent flag required")
    dsn = dedicated_test_dsn(dsn)
    verify_test_database(dsn)
    verify_migrations(dsn)
    if config["fresh_consent"]:
        verify_pristine_actor(dsn, config["actor"])
    registration = config["registration"]
    runtime = create_local_capture_runtime(
        store=PostgresStore(dsn), user_id=config["actor"],
        device_id=registration["device_id"], session_id=registration["session_id"],
        producer_id="synthetic-desktop-postgres", registration=registration,
        token=config["token"], expires_at=datetime.fromisoformat(config["expires_at"]),
        scopes=SCOPES, capabilities=CAPABILITIES, fresh_consent=config["fresh_consent"],
        enable_desktop_ingress=True, producer_profile="desktop_pixels", stop_fact_resolver=resolve_stop_fact,
    )
    assert runtime.start_status == ("pending" if config["fresh_consent"] else "consumed")
    assert runtime.app.state.paid_executor_enabled is False
    return runtime


def scenario(actor):
    # Fixture writes happen only in this separate scratch store. The target DB is
    # never seeded with control_fixture or granted an unconditional guard.
    c = context(MemoryStore(), actor)
    del c.store, c.archive, c.registry
    c.desktop_frame = json.loads(EXAMPLE.read_text())
    c.desktop_frame.update(frame_id=c.raw_frame["frame_id"], source=deepcopy(c.source),
                           artifact=deepcopy(c.ref), raw_width=2, raw_height=2,
                           **{name: c.batch[name] for name in ("device_id", "session_id", "stream_id")})
    c.batch["records"][0] = pixel_record(c.batch["records"][0])
    c.batch["records"][0].update(sequence=2, causal_parents=["desktop-gap-1"])
    c.envelope = {"contract_version": "0.2.8", "batch": c.batch, "frames": [c.desktop_frame]}
    c.first_gap = {"contract_version": "0.2.8", "batch": {**c.batch, "records": [gap(c)]}, "frames": []}
    return c


def run_desktop_checks(dsn, actor):
    c = scenario(actor)
    assert _documents(dsn, actor) == [], "target archive must start pristine"
    config = {"app_kind": "desktop_runtime", "actor": actor, "registration": c.registration,
              "fresh_consent": True, "token": secrets.token_hex(32),
              "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}
    first_token = config["token"]
    evidence = {"actor": actor, "source": c.source, "artifacts": [c.ref, c.ink_ref],
                "input": "synthetic consent, identity, native metadata and project-authored PNG/editable ink",
                "http": [], "processes": [], "groups": []}

    def request(client, label, method, path, *, body=None, schema=None, status=200,
                code=None, request_key=None, token=None, family=capture_ingress):
        headers = {"Authorization": "Bearer " + (config["token"] if token is None else token)}
        if request_key is not None:
            headers["Idempotency-Key"] = request_key
        response = client.request(method, path, headers=headers, **({"json": body} if body is not None else {}))
        check = {"check": label, "status": response.status_code}
        evidence["http"].append(check)
        print("CHECK " + json.dumps(check), flush=True)
        assert response.status_code == status, label + ": unexpected HTTP status"
        assert response.headers["cache-control"] == "no-store"
        value = response.json()
        if code:
            family.validate(schema, value)
            assert value["error"] == code
            assert value["retryable"] is (code in {"unavailable", "dependency_missing"})
            if status == 401:
                assert response.headers["www-authenticate"] == "Bearer"
        elif schema:
            family.validate(schema, value)
        return value

    def submit(client, label, payload, request_key, *, status=200, code=None, token=None):
        ack = request(client, label, "POST", DESKTOP_ROUTE, body=payload,
                      request_key=request_key, status=status, code=code, token=token,
                      schema="DesktopIngressError" if code else None, family=desktop_capture_ingress)
        if code is None:
            refs = [ref for item in payload["batch"]["records"] for ref in item["artifacts"]]
            verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type")) for ref in refs}
            desktop_capture_ingress.validate_ack(payload["batch"], ack, user_id=actor, verified_artifacts=verified)
        return ack

    def register(client, label):
        return request(client, label, "POST", COLLECTION, body=c.registration,
                       request_key="desktop-registration", schema="StreamState", family=process_control)

    def read_originals(client, phase):
        for ink in (False, True):
            body = original_body(c, ink=ink)
            artifact_id = body["artifact"]["artifact_id"]
            value = request(client, phase + ("_ink" if ink else "_png"), "GET",
                            original_path(c, artifact_id), schema="OriginalArtifactUpload")
            assert value == body
            assert capture_ingress.validate_original_read(value, source_id=c.source["source_id"],
                source_version=1, artifact_id=artifact_id, user_id=actor) == (c.ink_data if ink else c.data)

    def context_reader():
        runtime = runtime_for_check(dsn, {**config, "fresh_consent": False})
        token = config["token"]

        def guard(state):
            principal = runtime.app.state.authenticator.authenticate(token, utc_now())
            if (principal != runtime.principal or principal.user_id != actor
                    or "sources:read" not in principal.scopes
                    or state.get("generation") != principal.authorization_generation):
                raise DomainError(403, "forbidden")

        # Independent fresh database connections, with current auth on every read.
        store = PostgresStore(dsn)
        reader = AuthorizedProcessContextReader(store, actor, guard).read_desktop
        resolver = AuthorizedImageResolver(store, actor, guard).resolve_desktop
        return lambda ids: prepare_observation_window(ids, reader, resolver, user_id=actor)

    @contextmanager
    def owned_process():
        with _api_process(dsn, config) as (client, process):
            item = {"pid": process.pid, "host": "127.0.0.1", "port": client.base_url.port,
                    "fresh_consent": config["fresh_consent"]}
            evidence["processes"].append(item)
            print("PROCESS " + json.dumps(item), flush=True)
            yield client, process
        # Do not mask an unconfirmed reaping exception with fallible exit logging.
        item["returncode"] = process.returncode
        print("PROCESS_EXIT " + json.dumps(item), flush=True)
        assert process.returncode in (0, -signal.SIGTERM), "unexpected owned API exit"

    gap_id = c.first_gap["batch"]["records"][0]["record_id"]
    record_id = c.batch["records"][0]["record_id"]
    with owned_process() as (client, first):
        pending = _documents(dsn, actor)
        assert {kind for kind, _, _ in pending} == {
            "authorization", "device", "session", "control_membership", "control_start"}
        assert register(client, "register")["state"] == "live"
        descriptor = request(client, "display", "PUT", c.display_path, body=c.display, schema="DisplaySourceSnapshot")
        first_ack = submit(client, "first_frameless_gap", c.first_gap, "desktop-gap")
        assert first_ack["acknowledged"][0]["artifacts"] == []
        assert not any(kind in {"artifact", "frame", "raw_capture_frame"} for kind, _, _ in _documents(dsn, actor))
        compose = context_reader()
        gap_packet = compose([gap_id])
        assert gap_packet["items"][0]["frame"] is None
        assert gap_packet["items"][0]["image"] == {"status": "missing_frame"}
        assert gap_packet["attached_bytes"] == 0
        evidence["groups"].append("pristine runtime, HTTP registration and retained first gap without fabricated pixels")
        for ink in (False, True):
            body = original_body(c, ink=ink)
            receipt = request(client, "put_ink" if ink else "put_png", "PUT",
                ORIGINALS + body["artifact"]["artifact_id"], body=body, schema="OriginalArtifactReceipt")
            assert receipt == {**{k: v for k, v in body.items() if k != "data_base64"}, "status": "bytes_committed"}
        ack = submit(client, "desktop_frame", c.envelope, "desktop-frame")
        read_originals(client, "saved")
        packet = compose([gap_id, record_id])
        assert packet["counts"] == {"supplied": 2, "included": 2, "omitted": 0}
        assert [item["image"]["status"] for item in packet["items"]] == ["missing_frame", "attached"]
        assert packet["items"][1]["image"]["data"] == c.data
        assert [item["record"] for item in packet["items"]] == [c.first_gap["batch"]["records"][0], c.batch["records"][0]]
        assert packet["items"][1]["frame"] == c.desktop_frame
        assert all(item["source"] == descriptor for item in packet["items"])
        assert packet["non_frame_artifacts"] == "references_only"
        assert packet["provider_receipt"] == "not_attested" and packet["presentation_permission"] == "not_granted"
        assert packet["observation_window"]["capture_chronology"] == "unknown"
        before_restart = _documents(dsn, actor)
        evidence["groups"].append("exact PNG/ink originals, desktop source/clock metadata and authorized Learning composition")
    assert first.poll() is not None, "first process must exit before restart"
    evidence["first_exited_before_restart"] = True
    config = {**config, "fresh_consent": False, "token": secrets.token_hex(32)}

    with owned_process() as (client, second):
        assert second.pid != first.pid, "restart must use a new API process"
        assert _documents(dsn, actor) == before_restart, "reopen changed stored grant or archive"
        compose = context_reader()
        assert register(client, "replayed_registration")["state"] == "live"
        assert request(client, "reopened_display", "GET", c.display_path, schema="DisplaySourceSnapshot") == descriptor
        read_originals(client, "reopened")
        assert submit(client, "replayed_gap", c.first_gap, "desktop-gap") == first_ack
        assert submit(client, "replayed_frame", c.envelope, "desktop-frame") == ack
        assert compose([gap_id]) == gap_packet
        assert compose([gap_id, record_id]) == packet
        assert _documents(dsn, actor) == before_restart
        evidence["restart_documents_sha256"] = _digest(before_restart)
        evidence["descriptor_sha256"] = _digest(descriptor)
        evidence["frame_sha256"] = _digest(c.desktop_frame)
        evidence["acks_sha256"] = _digest([first_ack, ack])
        evidence["groups"].append("new API PID with no fresh consent retains exact grants/originals/gaps/context and replay ACKs")

        altered = deepcopy(c.envelope)
        altered["frames"][0]["raw_width"] = 3
        submit(client, "changed_envelope", altered, "desktop-frame", status=409, code="idempotency_conflict")
        submit(client, "old_process_token", c.envelope, "desktop-frame", token=first_token,
               status=401, code="unauthenticated")
        assert _documents(dsn, actor) == before_restart
        stopped = request(client, "stop", "POST", c.stream_path + ":control", body=command(c),
                          request_key="desktop-stop", schema="StreamState", family=process_control)
        assert stopped["state"] == "stopped"
        before_stop_reads = _documents(dsn, actor)
        assert runtime_for_check(dsn, config).current_state == stopped
        assert register(client, "stopped_registration") == stopped
        submit(client, "stopped_exact_retry", c.envelope, "desktop-frame", status=409, code="capture_stopped")
        next_gap = deepcopy(c.first_gap)
        next_gap["batch"]["records"][0].update(record_id="new-after-stop", sequence=3, causal_parents=[record_id])
        submit(client, "stopped_new_live", next_gap, "after-stop", status=409, code="capture_stopped")
        read_originals(client, "stopped_history")
        assert compose([gap_id, record_id]) == packet
        assert _documents(dsn, actor) == before_stop_reads
        evidence["groups"].append("changed replay and old token refused; Stop retains history and refuses retry/new live without regrant")

        Archive(PostgresStore(dsn)).set_authorization(actor, False)
        revoked = _documents(dsn, actor)
        request(client, "revoked_original", "GET", original_path(c), status=403, code="forbidden", schema="IngressError")
        submit(client, "revoked_replay", c.envelope, "desktop-frame", status=403, code="forbidden")
        try:
            compose([gap_id, record_id])
        except DomainError as error:
            assert (error.status, error.code) == (403, "forbidden")
        else:
            raise AssertionError("revoked actor obtained learning context")
        assert _documents(dsn, actor) == revoked
        assert first_token not in repr(revoked) and config["token"] not in repr(revoked)
        evidence["groups"].append("current account revocation refuses original/replay/context without mutation; no token persisted")
    assert second.poll() is not None, "second process must exit before cleanup"
    evidence["png_sha256"] = sha256(c.data).hexdigest()
    evidence["editable_ink_sha256"] = sha256(c.ink_data).hexdigest()
    return evidence


if __name__ == "__main__":
    raise SystemExit(main(desktop_runtime=True))
