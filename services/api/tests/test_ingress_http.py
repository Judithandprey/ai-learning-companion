"""Explicit ASGI ingress with synthetic control facts and project-authored PNG.

The production HTTP handlers and actor store are exercised without a listener,
database, physical capture, provider, foreground-app claim or preview replacement.
"""

import base64
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import pytest

from packages.contracts.capture_ingress import (
    CAPABILITY, MAX_METADATA_BODY_BYTES, MAX_UPLOAD_BODY_BYTES, validate,
    validate_original_read,
)
from packages.contracts.process_v2 import validate_ack
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.capture import CaptureArchive
from services.api.domain import key
from services.api.errors import DomainError
from services.api.ingress_app import create_ingress_app
from services.api.storage import MemoryStore, _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import (
    USER, apply, command, control_fixture, documents, resolve_stop_fact, stop_fact,
)
from services.api.tests.test_control_http import request
from services.api.tests.test_display_sources import reference
from services.api.tests.test_image_resolver import png


ROOT = Path(__file__).resolve().parents[3]
NOW = datetime(2026, 9, 29, 12, tzinfo=timezone.utc)
SOURCE = "http-display-source"
DISPLAY = "/v2/process/display-sources/" + SOURCE
ORIGINALS = "/v2/process/originals/"
FRAMES = "/v2/process/frames:batch"
SCOPES = frozenset({"sources:read", "sources:write", "process:control", "process:capture"})
CAPABILITIES = frozenset({CAPABILITY, "process.control.v0.2.1", "process.capture.v0.2"})


@pytest.fixture
def setup():
    c = control_fixture(MemoryStore(), USER)
    c.instant = [NOW]
    c.source = {"user_id": USER, "source_id": SOURCE, "source_version": 1}
    c.display = {"contract_version": "0.2.4", "source_id": SOURCE,
                 "stream_id": c.batch["stream_id"], "project_id": None, "source_timezone": "UTC"}
    c.data = png()
    c.ref = reference(c.data, "http-test-png", "image/png")
    c.ink_data = b'{"test_only":true,"editable_strokes":[[1,2],[3,4]]}\n'
    c.ink_ref = reference(c.ink_data, "http-test-editable-ink", "application/json")
    c.frame = {**c.core["Frame"], **c.source, "frame_id": "http-test-frame",
               "artifact_id": c.ref["artifact_id"], "content_hash": c.ref["sha256"],
               "width": 2, "height": 2, "representation": "screen_capture"}
    c.batch["records"][0].update(source=c.source, frame_id=c.frame["frame_id"],
                                artifacts=[c.ref, c.ink_ref], media_position=c.frame["media_position"])
    c.envelope = {"contract_version": "0.2.4", "batch": c.batch, "frames": [c.frame]}
    principal = Principal(USER, SCOPES, NOW + timedelta(hours=1))
    c.auth = LocalTestAuthenticator({
        "control-token": principal,
        "read-token": replace(principal, scopes=frozenset({"sources:read"})),
        "write-token": replace(principal, scopes=frozenset({"sources:write"})),
        "upload-token": replace(principal, scopes=frozenset({"sources:write", "process:capture"})),
        "capture-token": replace(principal, scopes=frozenset({"process:capture"})),
        "foreign-token": replace(principal, user_id="other-user"),
    })
    c.archive.set_authorization("other-user")
    c.app = app(c)
    return c


def app(c, *, capabilities=CAPABILITIES):
    return create_ingress_app(c.store, c.auth, capabilities=capabilities,
                              stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0])


def original_body(c, *, ink=False):
    return {"contract_version": "0.2.2", "source": c.source,
            "kind": "editable_ink" if ink else "screen_image", "artifact": c.ink_ref if ink else c.ref,
            "data_base64": base64.b64encode(c.ink_data if ink else c.data).decode("ascii")}


def read_path(c, *, source_id=SOURCE, version="1", artifact_id=None):
    return f"/v2/process/sources/{source_id}/versions/{version}/originals/{artifact_id or c.ref['artifact_id']}"


def success(response, schema):
    assert response.status_code == 200, response.text
    validate(schema, response.json())
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def error(response, status, code):
    assert response.status_code == status, response.text
    assert response.json() == {"contract_version": "0.2.4", "error": code,
                               "retryable": code in {"unavailable", "dependency_missing"}}
    validate("IngressError", response.json())
    assert response.headers["cache-control"] == "no-store"


def unchanged(c, operation, status, code):
    before = documents(c)
    error(operation(), status, code)
    assert documents(c) == before


def register(c):
    return request(c.app, "PUT", DISPLAY, body=c.display)


def upload(c, *, ink=False):
    body = original_body(c, ink=ink)
    return request(c.app, "PUT", ORIGINALS + body["artifact"]["artifact_id"], body=body)


def ingest(c, *, envelope=None, request_key="http-frames"):
    return request(c.app, "POST", FRAMES, body=c.envelope if envelope is None else envelope,
                   request_key=request_key)


@pytest.fixture
def registered(setup):
    setup.descriptor = success(register(setup), "DisplaySourceSnapshot")
    return setup


@pytest.fixture
def uploaded(registered):
    success(upload(registered), "OriginalArtifactReceipt")
    success(upload(registered, ink=True), "OriginalArtifactReceipt")
    return registered


@pytest.fixture
def captured(uploaded):
    uploaded.ack = success(ingest(uploaded), "ProcessBatchAck")
    return uploaded


def test_complete_http_registration_original_read_and_atomic_frames_preserve_exact_versions(captured):
    c = captured
    assert c.descriptor == {"contract_version": "0.2.3", **c.source, "type": "shared_display",
                           "device_id": c.batch["device_id"], "session_id": c.batch["session_id"],
                           "stream_id": c.batch["stream_id"], "project_id": None,
                           "source_timezone": "UTC", "created_at": "2026-09-29T12:00:00Z"}
    assert success(register(c), "DisplaySourceSnapshot") == c.descriptor
    assert success(request(c.app, "GET", DISPLAY), "DisplaySourceSnapshot") == c.descriptor
    for ink in (False, True):
        body = original_body(c, ink=ink)
        receipt = success(upload(c, ink=ink), "OriginalArtifactReceipt")
        assert receipt == {**{k: v for k, v in body.items() if k != "data_base64"}, "status": "bytes_committed"}
        result = success(request(c.app, "GET", read_path(c, artifact_id=body["artifact"]["artifact_id"])),
                         "OriginalArtifactUpload")
        assert result == body
        assert validate_original_read(result, source_id=SOURCE, source_version=1,
            artifact_id=body["artifact"]["artifact_id"], user_id=USER) == (c.ink_data if ink else c.data)
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
                for ref in (c.ref, c.ink_ref)}
    validate_ack(c.batch, c.ack, user_id=USER, verified_artifacts=verified)
    assert all(r["status"] == "verified" for r in c.ack["acknowledged"][0]["artifacts"])
    before = documents(c)
    c.app = app(c)
    assert success(ingest(c), "ProcessBatchAck") == c.ack
    assert documents(c) == before
    assert c.registry.capture.read_record(USER, "process-1")["record"] == c.batch["records"][0]
    with c.store.transaction(USER) as tx:
        assert tx.get("frame", c.frame["frame_id"]) == c.frame
        assert tx.scan("event") == []
        assert tx.get("session", c.batch["session_id"])["live_capture"] is False


def test_ungranted_stream_and_foreign_caller_cannot_register_or_create_grants(setup):
    c = setup
    for token, body in (("control-token", {**c.display, "stream_id": "ungranted"}),
                        ("foreign-token", c.display)):
        before = deepcopy(c.store._documents)
        error(request(c.app, "PUT", DISPLAY, body=body, token=token), 404, "not_found")
        assert c.store._documents == before


def test_display_registration_resolves_consumed_producer_in_one_actor_transaction(setup, monkeypatch):
    c = setup
    original_transaction = c.store.transaction
    transactions = []
    grant = deepcopy(c.store._documents[USER][("control_start", c.batch["stream_id"])])

    @contextmanager
    def observed_transaction(actor):
        transactions.append(actor)
        with original_transaction(actor) as tx:
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", observed_transaction)
        descriptor = success(register(c), "DisplaySourceSnapshot")
    assert transactions == [USER]
    assert "producer_id" not in c.display and "producer_id" not in descriptor
    with c.store.transaction(USER) as tx:
        assert tx.get("control_start", c.batch["stream_id"]) == grant
        assert tx.get("source", SOURCE)["producer_id"] == grant["producer_id"]


@pytest.mark.parametrize("failure", ["missing", "pending", "different_producer"])
def test_missing_or_corrupt_consumed_grant_cannot_register_a_display_source(setup, failure):
    c = setup
    grant_key = ("control_start", c.batch["stream_id"])
    if failure == "missing":
        del c.store._documents[USER][grant_key]
    elif failure == "pending":
        c.store._documents[USER][grant_key]["status"] = "pending"
    else:
        c.store._documents[USER][grant_key]["producer_id"] = "different-producer"
    unchanged(c, lambda: register(c), 503, "unavailable")


@pytest.mark.parametrize("change", ["frame_order", "record_order", "frame_geometry", "batch_id"])
def test_http_key_binds_complete_envelope_including_array_order(uploaded, change):
    c = uploaded
    second = record(c.batch, "second-record", 2, frame_id="second-frame")
    frame = {**c.frame, "frame_id": "second-frame"}
    envelope = {**c.envelope, "batch": {**c.batch, "records": [c.batch["records"][0], second]},
                "frames": [c.frame, frame]}
    ack = success(ingest(c, envelope=envelope), "ProcessBatchAck")
    # Object member order is semantically irrelevant, unlike JSON array order.
    reordered_object = dict(reversed(list(envelope.items())))
    assert success(ingest(c, envelope=reordered_object), "ProcessBatchAck") == ack
    changed = deepcopy(envelope)
    if change == "frame_order":
        changed["frames"].reverse()
    elif change == "record_order":
        changed["batch"]["records"].reverse()
    elif change == "frame_geometry":
        changed["frames"][0]["width"] += 1
    else:
        changed["batch"]["batch_id"] = "changed-batch"
    unchanged(c, lambda: ingest(c, envelope=changed), 409, "idempotency_conflict")


def test_source_and_original_ids_conflict_without_replacing_committed_content(captured):
    c = captured
    changed_source = {**c.display, "source_timezone": "America/Los_Angeles"}
    unchanged(c, lambda: request(c.app, "PUT", DISPLAY, body=changed_source), 409, "source_identity_conflict")
    changed = original_body(c, ink=True)
    data = c.ink_data + b" "
    changed.update(artifact=reference(data, c.ink_ref["artifact_id"], "application/json"),
                   data_base64=base64.b64encode(data).decode())
    unchanged(c, lambda: request(c.app, "PUT", ORIGINALS + c.ink_ref["artifact_id"], body=changed),
              409, "record_conflict")


@pytest.mark.parametrize("fence", ["stop", "withdraw"])
def test_scoped_capture_stop_fences_mutations_but_history_needs_only_read_and_ingress(captured, fence):
    c = captured
    apply(c, command(c, fence))
    unchanged(c, lambda: register(c), 403, "forbidden")
    unchanged(c, lambda: upload(c), 403, "forbidden")
    unchanged(c, lambda: ingest(c), 409 if fence == "stop" else 403,
              "capture_stopped" if fence == "stop" else "forbidden")
    reader = app(c, capabilities=frozenset({CAPABILITY}))
    assert success(request(reader, "GET", DISPLAY, token="read-token"), "DisplaySourceSnapshot") == c.descriptor
    assert success(request(reader, "GET", read_path(c), token="read-token"), "OriginalArtifactUpload") == original_body(c)


def test_known_stopped_boundary_accepts_only_preexisting_bounded_historical_batch(uploaded):
    c = uploaded
    stop_fact(c, 1)
    stopped = apply(c, command(c, boundary=1))
    historical = deepcopy(c.envelope)
    historical["batch"]["delivery_mode"] = "historical"
    ack = success(ingest(c, envelope=historical), "ProcessBatchAck")
    assert success(ingest(c, envelope=historical), "ProcessBatchAck") == ack
    assert c.registry.read(USER, c.batch["stream_id"]) == stopped
    too_late = deepcopy(historical)
    too_late["batch"]["records"][0].update(record_id="too-late", sequence=2)
    unchanged(c, lambda: ingest(c, envelope=too_late, request_key="too-late"), 409, "capture_stopped")
    unchanged(c, lambda: upload(c), 403, "forbidden")


@pytest.mark.parametrize("fence", ["revoke", "delete", "membership", "account_generation"])
def test_current_access_fences_previously_successful_http_replay(captured, fence):
    c = captured
    if fence == "revoke":
        c.archive.revoke_source(USER, SOURCE)
    elif fence == "delete":
        c.archive.delete_source(USER, SOURCE)
    elif fence == "membership":
        c.registry.set_membership(USER, c.batch["device_id"], c.batch["session_id"], active=False, expected_revision=1)
    else:
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    unchanged(c, lambda: ingest(c), 404 if fence in {"revoke", "delete"} else 403,
              "not_found" if fence in {"revoke", "delete"} else "forbidden")
    if fence in {"revoke", "delete"}:
        unchanged(c, lambda: request(c.app, "GET", read_path(c)), 403 if fence == "revoke" else 404,
                  "forbidden" if fence == "revoke" else "not_found")


@pytest.mark.parametrize("missing", ["frame", "record", "original", "editable_ink"])
def test_missing_committed_evidence_cannot_be_restored_by_http_cached_ack(captured, missing):
    c = captured
    kind, identifier = {"frame": ("frame", c.frame["frame_id"]), "record": ("capture_record", "process-1"),
                        "original": ("artifact", c.ref["artifact_id"]),
                        "editable_ink": ("artifact", c.ink_ref["artifact_id"])}[missing]
    del c.store._documents[USER][(kind, identifier)]
    unchanged(c, lambda: ingest(c), 503, "unavailable")


def test_original_get_distinguishes_unknown_identity_from_lost_retained_bytes(captured):
    c = captured
    unchanged(c, lambda: request(c.app, "GET", read_path(c, artifact_id="never-committed")),
              404, "not_found")
    del c.store._documents[USER][("artifact", c.ref["artifact_id"])]
    unchanged(c, lambda: request(c.app, "GET", read_path(c)), 503, "unavailable")


@pytest.mark.parametrize("missing", ["source", "snapshot"])
def test_missing_committed_source_head_or_snapshot_is_not_fresh_absence(captured, missing):
    c = captured
    identifier = SOURCE if missing == "source" else key(SOURCE, 1)
    del c.store._documents[USER][(missing, identifier)]
    unchanged(c, lambda: request(c.app, "GET", DISPLAY), 503, "unavailable")
    unchanged(c, lambda: request(c.app, "GET", read_path(c)), 503, "unavailable")
    unchanged(c, lambda: upload(c), 503, "unavailable")
    unchanged(c, lambda: ingest(c), 503, "unavailable")
    # Re-registering a lost source head is an immutable identity conflict; an
    # existing head's missing committed snapshot is instead damaged storage.
    unchanged(c, lambda: register(c), 409 if missing == "source" else 503,
              "source_identity_conflict" if missing == "source" else "unavailable")


def test_original_requests_for_never_issued_source_version_are_not_found(captured):
    c = captured
    unchanged(c, lambda: request(c.app, "GET", read_path(c, version="2")), 404, "not_found")
    body = original_body(c)
    body["source"] = {**c.source, "source_version": 2}
    unchanged(c, lambda: request(c.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=body),
              404, "not_found")


def test_registered_legacy_source_without_ingestion_has_no_snapshot_to_upload_against(setup):
    c = setup
    source, _ = c.archive.register(USER, "https://synthetic-http-test.invalid/pending", None, "pending-source")
    assert source["current_version"] is None
    body = original_body(c)
    body["source"] = {**c.source, "source_id": source["source_id"]}
    unchanged(c, lambda: request(c.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=body),
              404, "not_found")


def test_unsupported_stored_original_version_is_service_corruption_not_request_error(captured):
    c = captured
    c.store._documents[USER][("artifact", c.ref["artifact_id"])]["original_binding"]["contract_version"] = "9.9.9"
    unchanged(c, lambda: request(c.app, "GET", read_path(c)), 503, "unavailable")
    unchanged(c, lambda: ingest(c), 503, "unavailable")


def test_legacy_pending_receipt_never_claims_bytes_existed_or_transfers_artifact_identity(setup):
    c = setup
    legacy_source = {k: c.core["SourceSnapshot"][k] for k in ("user_id", "source_id", "source_version")}
    legacy_batch = deepcopy(c.batch)
    legacy_batch["records"][0].update(source=legacy_source, frame_id=None, artifacts=[c.ref])
    # Exercise the unchanged metadata-only capture seam with synthetic legacy
    # provenance. Its pending receipt is explicitly not an original-byte commit.
    legacy = CaptureArchive(c.store, c.registry.resolve_capture)
    ack = legacy.ingest(USER, legacy_batch, "legacy-pending-original")
    assert ack["acknowledged"][0]["artifacts"] == [{**c.ref, "status": "pending"}]
    body = {**original_body(c), "source": legacy_source}
    unchanged(c, lambda: request(c.app, "GET", read_path(c, source_id=legacy_source["source_id"])),
              404, "not_found")
    unchanged(c, lambda: request(c.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=body),
              409, "record_conflict")


def test_surviving_http_ack_prevents_read_or_put_reconstruction_of_missing_original(captured):
    c = captured
    actor = c.store._documents[USER]
    for document_key in list(actor):
        if document_key[0] in {"frame", "capture_record", "capture_artifact_ref"}:
            del actor[document_key]
    del actor[("artifact", c.ref["artifact_id"])]
    with c.store.transaction(USER) as tx:
        receipts = [json.loads(row["response_json"]) for row in tx.scan("capture_replay")]
        assert any(a["artifact_id"] == c.ref["artifact_id"] for ack in receipts
                   for receipt in ack["acknowledged"] for a in receipt["artifacts"])
    unchanged(c, lambda: request(c.app, "GET", read_path(c)), 503, "unavailable")
    unchanged(c, lambda: upload(c), 503, "unavailable")


def test_foreign_caller_cannot_read_or_replay_any_existing_ingress_identity(captured):
    c = captured
    operations = [("PUT", DISPLAY, c.display), ("GET", DISPLAY, None),
                  ("PUT", ORIGINALS + c.ref["artifact_id"], original_body(c)),
                  ("GET", read_path(c), None), ("POST", FRAMES, c.envelope)]
    before = deepcopy(c.store._documents)
    for method, path, body in operations:
        error(request(c.app, method, path, body=body, token="foreign-token", request_key="http-frames"),
              404, "not_found")
        assert c.store._documents == before


def test_pending_extra_original_is_not_a_verified_or_partial_http_ack(registered):
    c = registered
    success(upload(c), "OriginalArtifactReceipt")
    unchanged(c, lambda: ingest(c), 409, "dependency_missing")
    success(upload(c, ink=True), "OriginalArtifactReceipt")
    success(ingest(c), "ProcessBatchAck")


@pytest.mark.parametrize("operation", ["source_write", "original_write", "frame_write", "ack_write",
                                      "source_commit", "original_commit", "batch_commit"])
def test_stage_or_commit_failure_rolls_back_and_same_identity_retry_succeeds(setup, monkeypatch, operation):
    c = setup
    if not operation.startswith("source"):
        success(register(c), "DisplaySourceSnapshot")
    if operation.startswith(("frame", "ack", "batch")):
        success(upload(c), "OriginalArtifactReceipt")
        success(upload(c, ink=True), "OriginalArtifactReceipt")
    if operation.startswith("source"):
        action, schema = lambda: register(c), "DisplaySourceSnapshot"
    elif operation.startswith("original"):
        action, schema = lambda: upload(c), "OriginalArtifactReceipt"
    else:
        action, schema = lambda: ingest(c), "ProcessBatchAck"
    before = documents(c)
    original_put, original_transaction = _MemoryTransaction.put, c.store.transaction
    target = {"source_write": "source", "original_write": "artifact", "frame_write": "frame",
              "ack_write": "capture_replay"}.get(operation)

    def failed_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == target:
            raise RuntimeError("PRIVATE synthetic ingress write failure")

    @contextmanager
    def failed_commit(actor):
        with original_transaction(actor) as tx:
            yield tx
            raise RuntimeError("PRIVATE synthetic ingress commit failure")

    with monkeypatch.context() as patch:
        if operation.endswith("commit"):
            patch.setattr(c.store, "transaction", failed_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", failed_write)
        error(action(), 503, "unavailable")
    assert documents(c) == before
    success(action(), schema)


@pytest.mark.parametrize("operation", ["register", "original", "frames"])
def test_explicit_unsupported_versions_precede_generic_shape_failures(setup, operation):
    c = setup
    if operation == "register":
        path, method, body = DISPLAY, "PUT", deepcopy(c.display)
    elif operation == "original":
        path, method, body = ORIGINALS + c.ref["artifact_id"], "PUT", original_body(c)
    else:
        path, method, body = FRAMES, "POST", deepcopy(c.envelope)
    body["contract_version"] = "9.9.9"
    body["unexpected"] = "private data"
    unchanged(c, lambda: request(c.app, method, path, body=body, request_key="invalid-version"),
              422, "unsupported_version")


def test_nested_batch_version_is_not_reinterpreted_as_outer_ingress_version(setup):
    c = setup
    envelope = deepcopy(c.envelope)
    envelope["batch"]["contract_version"] = "0.2.4"
    unchanged(c, lambda: ingest(c, envelope=envelope), 422, "unsupported_version")


@pytest.mark.parametrize("case", ["source_path", "artifact_path", "owner", "producer_field", "extra_frame"])
def test_path_owner_and_closed_wire_shape_checks_reject_before_mutation(setup, case):
    c = setup
    method, path, body = "PUT", DISPLAY, deepcopy(c.display)
    if case == "source_path":
        body["source_id"] = "different-source"
    elif case == "producer_field":
        body["producer_id"] = "screen"
    elif case in {"artifact_path", "owner"}:
        body = original_body(c)
        path = ORIGINALS + ("different-artifact" if case == "artifact_path" else c.ref["artifact_id"])
        if case == "owner":
            body["source"] = {**c.source, "user_id": "other-user"}
    else:
        method, path, body = "POST", FRAMES, deepcopy(c.envelope)
        body["frames"].append({**c.frame, "frame_id": "unreferenced-frame"})
    # Foreign identity is deliberately indistinguishable from an absent one.
    status, code = (404, "not_found") if case == "owner" else (422, "invalid_request")
    unchanged(c, lambda: request(c.app, method, path, body=body, request_key="closed-shape"), status, code)


@pytest.mark.parametrize("version", ["0", "01", "+1", "1.0", "9007199254740992"])
def test_original_version_path_is_canonical_positive_safe_decimal(setup, version):
    c = setup
    unchanged(c, lambda: request(c.app, "GET", read_path(c, version=version)), 422, "invalid_request")


@pytest.mark.parametrize("payload", [b"{", b"\xff", b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}'])
def test_malformed_nonfinite_duplicate_or_non_utf8_json_has_closed_400(setup, payload):
    c = setup
    unchanged(c, lambda: request(c.app, "PUT", DISPLAY, content=payload,
              headers=[("Content-Type", "application/json")]), 400, "invalid_json")


@pytest.mark.parametrize("headers", [[], [("Content-Type", "text/plain")],
    [("Content-Type", "application/json; charset=latin-1")],
    [("Content-Type", "application/json"), ("Content-Encoding", "gzip")]])
def test_non_json_or_non_identity_transport_has_closed_415(setup, headers):
    c = setup
    unchanged(c, lambda: request(c.app, "PUT", DISPLAY, content=json.dumps(c.display).encode(), headers=headers),
              415, "unsupported_media_type")


@pytest.mark.parametrize("case", ["missing_key", "duplicate_key", "long_key", "query", "get_body", "duplicate_type"])
def test_undeclared_or_ambiguous_transport_parameters_are_rejected(setup, case):
    c = setup
    method, path, body, headers, request_key = "POST", FRAMES, c.envelope, [], "request"
    if case == "missing_key":
        request_key = None
    elif case == "duplicate_key":
        headers = [("Idempotency-Key", "second")]
    elif case == "long_key":
        request_key = "x" * 129
    elif case == "query":
        method, path, body = "GET", DISPLAY + "?version=1&version=1", None
    elif case == "get_body":
        method, path, body = "GET", DISPLAY, {"hidden": True}
    else:
        method, path, body = "PUT", DISPLAY, c.display
        headers = [("Content-Type", "application/json"), ("Content-Type", "application/json")]
    unchanged(c, lambda: request(c.app, method, path, body=body, headers=headers, request_key=request_key),
              422, "invalid_request")


@pytest.mark.parametrize("route", ["source", "frames", "original"])
def test_streamed_raw_limits_stop_reading_before_json_or_original_decoding(setup, route):
    c = setup
    path = DISPLAY if route == "source" else FRAMES if route == "frames" else ORIGINALS + c.ref["artifact_id"]
    method = "POST" if route == "frames" else "PUT"
    limit = MAX_UPLOAD_BODY_BYTES if route == "original" else MAX_METADATA_BODY_BYTES
    consumed = []

    def chunks():
        chunk = b" " * (1024 * 1024)
        for index in range(limit // len(chunk) + 3):
            consumed.append(index)
            yield chunk

    unchanged(c, lambda: request(c.app, method, path, chunks=chunks(), request_key="limit",
              headers=[("Content-Type", "application/json")]), 413, "payload_too_large")
    assert len(consumed) == limit // (1024 * 1024) + 1


def test_exact_metadata_raw_limit_preserves_valid_registration(setup):
    c = setup
    raw = json.dumps(c.display).encode()
    padded = raw + b" " * (MAX_METADATA_BODY_BYTES - len(raw))
    success(request(c.app, "PUT", DISPLAY, content=padded, headers=[("Content-Type", "application/json")]),
            "DisplaySourceSnapshot")


@pytest.mark.parametrize("token,status,code", [(None, 401, "unauthenticated"),
    ("missing-token", 401, "unauthenticated"), ("read-token", 403, "forbidden")])
def test_authentication_and_scope_precede_body_consumption(setup, token, status, code):
    c = setup
    consumed = []

    def chunks():
        consumed.append(True)
        yield b"private malformed input"

    unchanged(c, lambda: request(c.app, "PUT", DISPLAY, token=token, chunks=chunks(),
              headers=[("Content-Type", "application/json")]), status, code)
    assert consumed == []


def test_display_original_put_requires_current_capture_scope_and_capability(registered):
    c = registered
    unchanged(c, lambda: request(c.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c),
                                token="write-token"), 403, "forbidden")
    narrow = app(c, capabilities=frozenset({CAPABILITY}))
    error(request(narrow, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c)),
          403, "capability_required")


def test_originals_and_frames_require_only_their_released_scopes_after_registration(registered):
    c = registered
    narrow = app(c, capabilities=frozenset({CAPABILITY, "process.capture.v0.2"}))
    for ink in (False, True):
        body = original_body(c, ink=ink)
        success(request(narrow, "PUT", ORIGINALS + body["artifact"]["artifact_id"], body=body,
                        token="upload-token"), "OriginalArtifactReceipt")
    success(request(narrow, "POST", FRAMES, body=c.envelope, request_key="minimal-scopes",
                    token="capture-token"), "ProcessBatchAck")


@pytest.mark.parametrize("operation", ["source", "original", "frames", "read"])
def test_token_expiry_is_rechecked_inside_actor_transaction(captured, monkeypatch, operation):
    c = captured
    before = documents(c)
    original_transaction = c.store.transaction

    @contextmanager
    def expire(actor):
        with original_transaction(actor) as tx:
            c.instant[0] = NOW + timedelta(hours=2)
            yield tx

    action = {"source": lambda: register(c), "original": lambda: upload(c),
              "frames": lambda: ingest(c), "read": lambda: request(c.app, "GET", read_path(c))}[operation]
    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", expire)
        error(action(), 401, "unauthenticated")
    assert documents(c) == before


@pytest.mark.parametrize("during_transaction", [False, True])
def test_authenticator_outage_is_content_free_unavailable_before_and_inside_transaction(setup, during_transaction):
    c = setup
    principal = c.auth.authenticate("control-token", NOW)

    class Outage:
        calls = 0

        def authenticate(self, token, now):
            self.calls += 1
            if not during_transaction or self.calls > 1:
                raise DomainError(503, "PRIVATE synthetic authentication outage")
            return principal

    c.auth = Outage()
    c.app = app(c)
    unchanged(c, lambda: register(c), 503, "unavailable")
    assert c.auth.calls == (2 if during_transaction else 1)


def test_duplicate_bearer_headers_never_select_a_caller(setup):
    c = setup
    unchanged(c, lambda: request(c.app, "GET", DISPLAY,
                                headers=[("Authorization", "Bearer foreign-token")]),
              401, "unauthenticated")


@pytest.mark.parametrize("missing", ["auth", "store", "capabilities"])
def test_missing_runtime_dependency_is_unavailable_not_default_activation(setup, missing):
    c = setup
    configured = create_ingress_app(None if missing == "store" else c.store,
        None if missing == "auth" else c.auth, capabilities=None if missing == "capabilities" else CAPABILITIES,
        clock=lambda: NOW)
    error(request(configured, "GET", DISPLAY), 503, "unavailable")


def test_opt_in_surface_exposes_exact_contract_and_no_start_grant_or_default_routes(setup):
    from services.api import ingress_app
    from services.api.app import create_app

    c = setup
    expected = json.loads((ROOT / "packages/contracts/capture_ingress/generated/openapi.json").read_text())
    assert request(c.app, "GET", "/openapi.json", token=None).json() == expected
    assert not hasattr(ingress_app, "app")
    assert request(c.app, "POST", "/v2/process/streams", body=c.registration).status_code == 404
    default = create_app(c.store, c.auth, clock=lambda: NOW)
    for method, path in (("PUT", DISPLAY), ("GET", DISPLAY), ("PUT", ORIGINALS + c.ref["artifact_id"]),
                         ("GET", read_path(c)), ("POST", FRAMES)):
        assert request(default, method, path).status_code == 404
