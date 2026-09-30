"""Opt-in raw HTTP adapter, exercised with ASGI and retained synthetic originals.

These tests use the real handlers and MemoryStore without a listener, database,
device capture, provider request, live-screen coverage or external import claim.
"""

from concurrent.futures import CancelledError
from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta
import hashlib
import json

import pytest

from packages.contracts import raw_capture_ingress as wire
from services.api.domain import key
from services.api.ingress_app import create_ingress_app
from services.api.storage import _MemoryTransaction
from services.api.tests.test_control import USER, apply, command, documents, resolve_stop_fact, stop_fact
from services.api.tests.test_ingress_http import (
    CAPABILITIES as LEGACY_CAPABILITIES, DISPLAY, FRAMES, NOW, ORIGINALS,
    error as legacy_error, original_body, read_path, registered, request, setup,
    success as legacy_success, uploaded,
)
from services.api.tests.test_raw_frame_ingress import additional, raw_setup


RAW_FRAMES = "/v2/process/raw-frames:batch"
CAPABILITIES = LEGACY_CAPABILITIES | {wire.CAPABILITY}


def app(c, *, capabilities=CAPABILITIES, enabled=True):
    return create_ingress_app(c.store, c.auth, capabilities=capabilities,
                              stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0],
                              enable_raw_ingress=enabled)


@pytest.fixture
def raw_http(raw_setup):
    c = raw_setup
    c.raw_app = app(c)
    c.raw_envelope = {"contract_version": "0.2.6", "batch": c.batch, "frames": [c.raw_frame]}
    return c


def ingest(c, *, envelope=None, request_key="raw-http", **kwargs):
    return request(c.raw_app, "POST", RAW_FRAMES, request_key=request_key,
                   body=c.raw_envelope if envelope is None else envelope, **kwargs)


def success(c, response, envelope=None):
    assert response.status_code == 200, response.text
    ack = response.json()
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
                for ref in (c.ref, c.ink_ref)}
    wire.validate_ack(c.raw_envelope["batch"] if envelope is None else envelope["batch"], ack,
                      user_id=USER, verified_artifacts=verified)
    assert ack["contract_version"] == "0.2.0"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    return ack


def error(response, status, code):
    assert response.status_code == status, response.text
    assert response.json() == {"contract_version": "0.2.6", "error": code,
                               "retryable": code in {"unavailable", "dependency_missing"}}
    wire.validate("RawIngressError", response.json())
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"


def unchanged(c, operation, status, code):
    before = deepcopy(c.store._documents)
    error(operation(), status, code)
    assert c.store._documents == before


@pytest.fixture
def raw_captured(raw_http):
    raw_http.raw_ack = success(raw_http, ingest(raw_http))
    return raw_http


def two_frames(c):
    second, frame = additional(c)
    return {**c.raw_envelope, "batch": {**c.batch, "records": [c.batch["records"][0], second]},
            "frames": [c.raw_frame, frame]}


def test_raw_http_exact_roundtrip_and_reopened_replay_preserve_originals(raw_http):
    c = raw_http
    original = deepcopy(c.raw_envelope)
    before = documents(c)
    ack = success(c, ingest(c, token="capture-token"))
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert c.raw_envelope == original
    after = documents(c)
    assert after[("raw_capture_frame", c.raw_frame["frame_id"])] == original["frames"][0]
    assert ("frame", c.raw_frame["frame_id"]) not in after
    assert json.loads(after[("capture_record", "process-1")]["canonical_json"])["record"] == c.batch["records"][0]
    replay_key = key("POST", RAW_FRAMES, "raw-http")
    replay = after[("capture_replay", replay_key)]
    encoded = wire.canonical_request("RawFrameBatchRequest", original)
    assert replay["fingerprint"] == hashlib.sha256(encoded).hexdigest()
    assert json.loads(replay["response_json"]) == ack
    assert replay["source_ids"] == [c.source["source_id"]]
    assert ("capture_replay", key("internal_raw_capture_frames", "raw-http")) not in after
    for identity in [("artifact", c.ref["artifact_id"]), ("artifact", c.ink_ref["artifact_id"]),
                     ("session", c.batch["session_id"]), ("control_stream", c.batch["stream_id"])]:
        assert after[identity] == before[identity]
    c.raw_app = app(c)
    assert success(c, ingest(c)) == ack
    assert documents(c) == after
    assert legacy_success(request(c.raw_app, "GET", read_path(c)), "OriginalArtifactUpload") == original_body(c)
    assert c.registry.capture.read_record(USER, "process-1")["record"] == c.batch["records"][0]


@pytest.mark.parametrize("change", ["frame_order", "record_order", "artifact_order", "orientation", "batch_id"])
def test_http_replay_binds_complete_ordered_wrapper(raw_http, change):
    c = raw_http
    envelope = two_frames(c)
    ack = success(c, ingest(c, envelope=envelope), envelope)
    assert success(c, ingest(c, envelope=dict(reversed(list(envelope.items())))), envelope) == ack
    changed = deepcopy(envelope)
    if change == "frame_order":
        changed["frames"].reverse()
    elif change == "record_order":
        changed["batch"]["records"].reverse()
    elif change == "artifact_order":
        changed["batch"]["records"][0]["artifacts"].reverse()
    elif change == "orientation":
        changed["frames"][0]["orientation"]["value"] = 1
    else:
        changed["batch"]["batch_id"] = "changed-envelope"
    unchanged(c, lambda: ingest(c, envelope=changed), 409, "idempotency_conflict")


def test_internal_map_replay_and_http_ordered_replay_have_separate_namespaces(raw_http):
    c = raw_http
    envelope = two_frames(c)
    ack = c.registry.ingest_raw_frames(USER, envelope["batch"], envelope["frames"], "raw-http")
    assert c.registry.ingest_raw_frames(USER, envelope["batch"], list(reversed(envelope["frames"])),
                                        "raw-http") == ack
    http_ack = success(c, ingest(c, envelope=envelope), envelope)
    assert http_ack["acknowledged"] == [{**receipt, "disposition": "duplicate"}
                                        for receipt in ack["acknowledged"]]
    assert success(c, ingest(c, envelope=envelope), envelope) == http_ack
    changed = {**envelope, "frames": list(reversed(envelope["frames"]))}
    unchanged(c, lambda: ingest(c, envelope=changed), 409, "idempotency_conflict")
    rows = documents(c)
    assert ("capture_replay", key("internal_raw_capture_frames", "raw-http")) in rows
    assert ("capture_replay", key("POST", RAW_FRAMES, "raw-http")) in rows


def test_route_requires_explicit_opt_in_and_separate_capabilities(raw_http):
    c = raw_http
    for disabled in (c.app, app(c, enabled=False)):
        assert RAW_FRAMES not in disabled.openapi()["paths"]
        legacy_error(request(disabled, "POST", RAW_FRAMES, body=c.raw_envelope, request_key="disabled"),
                     404, "not_found")
    assert RAW_FRAMES in c.raw_app.openapi()["paths"]
    for caps in (LEGACY_CAPABILITIES, frozenset({wire.CAPABILITY})):
        c.raw_app = app(c, capabilities=caps)
        unchanged(c, lambda: ingest(c), 403, "capability_required")
    c.raw_app = app(c, capabilities=frozenset({wire.CAPABILITY, "process.capture.v0.2"}))
    success(c, ingest(c, token="capture-token"))
    legacy_error(request(c.raw_app, "GET", DISPLAY), 403, "capability_required")
    legacy_error(request(c.raw_app, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c)),
                 403, "capability_required")


@pytest.mark.parametrize("authorization", [None, "Basic control-token", "Bearer", "Bearer\tcontrol-token", "Bearer control-token extra"])
def test_strict_bearer_syntax_precedes_body_consumption(raw_http, authorization):
    c = raw_http
    consumed = []

    def chunks():
        consumed.append(True)
        yield b"PRIVATE invalid body"

    headers = [] if authorization is None else [("Authorization", authorization)]
    unchanged(c, lambda: request(c.raw_app, "POST", RAW_FRAMES, token=None, headers=headers, chunks=chunks()),
              401, "unauthenticated")
    assert consumed == []


def test_duplicate_bearer_and_insufficient_scope_are_rejected(raw_http):
    c = raw_http
    unchanged(c, lambda: ingest(c, headers=[("Authorization", "Bearer control-token")]), 401, "unauthenticated")
    unchanged(c, lambda: ingest(c, token="read-token"), 403, "forbidden")
    unchanged(c, lambda: ingest(c, token="foreign-token"), 404, "not_found")


@pytest.mark.parametrize("fence,status,code", [
    ("expiry", 401, "unauthenticated"), ("generation", 403, "forbidden"),
    ("stop", 409, "capture_stopped"), ("withdraw", 403, "forbidden"),
    ("delete", 404, "not_found"), ("source_revoke", 404, "not_found"),
])
def test_cached_http_success_rechecks_current_lifecycle(raw_captured, fence, status, code):
    c = raw_captured
    if fence == "expiry":
        c.instant[0] = NOW + timedelta(hours=2)
    elif fence == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    elif fence in {"stop", "withdraw"}:
        apply(c, command(c, fence))
    elif fence == "delete":
        c.archive.delete_source(USER, c.source["source_id"])
    else:
        c.archive.revoke_source(USER, c.source["source_id"])
    unchanged(c, lambda: ingest(c), status, code)


@pytest.mark.parametrize("replay", [False, True])
def test_token_invalidated_before_transaction_exit_withholds_ack(raw_http, monkeypatch, replay):
    c = raw_http
    if replay:
        success(c, ingest(c))
    before = documents(c)
    original_get, original_put = _MemoryTransaction.get, _MemoryTransaction.put
    invalidated = []

    def get(tx, kind, identifier):
        value = original_get(tx, kind, identifier)
        if replay and kind == "capture_replay" and value is not None:
            c.auth.revoke("control-token")
            invalidated.append(True)
        return value

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            c.auth.revoke("control-token")
            invalidated.append(True)

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "get", get)
        patch.setattr(_MemoryTransaction, "put", put)
        error(ingest(c), 401, "unauthenticated")
    assert invalidated
    assert documents(c) == before


def test_sealed_historical_http_capture_preserves_stop_and_refuses_later_records(raw_http):
    c = raw_http
    stop_fact(c, 1)
    stopped = apply(c, command(c, boundary=1))
    historical = {**c.raw_envelope, "batch": {**c.batch, "delivery_mode": "historical"}}
    ack = success(c, ingest(c, envelope=historical), historical)
    assert success(c, ingest(c, envelope=historical), historical) == ack
    assert c.registry.read(USER, c.batch["stream_id"]) == stopped
    unchanged(c, lambda: ingest(c, request_key="live-after-stop"), 409, "capture_stopped")
    item, frame = additional(c)
    late = {**historical, "batch": {**historical["batch"], "records": [item]}, "frames": [frame]}
    unchanged(c, lambda: ingest(c, envelope=late, request_key="after-boundary"), 409, "capture_stopped")
    legacy_error(request(c.raw_app, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c)),
                 403, "forbidden")


@pytest.mark.parametrize("version_target", ["outer", "batch", "frame", "later_frame"])
def test_explicit_unsupported_versions_precede_other_shape_errors(raw_http, version_target):
    c = raw_http
    envelope = deepcopy(two_frames(c))
    target = {"outer": envelope, "batch": envelope["batch"], "frame": envelope["frames"][0],
              "later_frame": envelope["frames"][1]}[version_target]
    target["contract_version"] = "9.9.9"
    envelope["unknown"] = "PRIVATE extra content"
    unchanged(c, lambda: ingest(c, envelope=envelope), 422, "unsupported_version")


@pytest.mark.parametrize("content", [b'{"contract_version":"0.2.6","contract_version":"0.2.6"}',
                                     b'{"value":NaN}', b"\xff", b"{"])
def test_strict_json_errors_use_raw_error_version(raw_http, content):
    c = raw_http
    unchanged(c, lambda: request(c.raw_app, "POST", RAW_FRAMES, request_key="invalid-json", content=content,
                                headers=[("Content-Type", "application/json")]), 400, "invalid_json")


@pytest.mark.parametrize("case,status,code", [
    ("missing_version", 422, "invalid_request"), ("missing_key", 422, "invalid_request"),
    ("duplicate_key", 422, "invalid_request"), ("query", 422, "invalid_request"),
    ("duplicate_type", 422, "invalid_request"), ("wrong_length", 422, "invalid_request"),
    ("encoding", 415, "unsupported_media_type"), ("media_parameter", 415, "unsupported_media_type"),
])
def test_raw_transport_rejects_ambiguous_headers_and_shape(raw_http, case, status, code):
    c = raw_http
    envelope = deepcopy(c.raw_envelope)
    if case == "missing_version":
        del envelope["frames"][0]["contract_version"]
    headers = {"duplicate_key": [("Idempotency-Key", "other")],
               "duplicate_type": [("Content-Type", "application/json"), ("Content-Type", "application/json")],
               "wrong_length": [("Content-Length", "1")], "encoding": [("Content-Encoding", "gzip")],
               "media_parameter": [("Content-Type", "application/json; profile=raw")]}.get(case, [])
    path = RAW_FRAMES + "?unexpected=1&unexpected=2" if case == "query" else RAW_FRAMES
    unchanged(c, lambda: request(c.raw_app, "POST", path, body=envelope, headers=headers,
                                request_key=None if case == "missing_key" else "transport"), status, code)


def test_streamed_raw_size_stops_before_decoding_and_exact_limit_is_accepted(raw_http):
    c = raw_http
    consumed = []

    def chunks():
        for index in range(7):
            consumed.append(index)
            yield b" " * (1024 * 1024)

    unchanged(c, lambda: request(c.raw_app, "POST", RAW_FRAMES, request_key="limit", chunks=chunks(),
              headers=[("Content-Type", "application/json")]), 413, "payload_too_large")
    assert consumed == list(range(5))
    encoded = wire.canonical_request("RawFrameBatchRequest", c.raw_envelope)
    padded = encoded + b" " * (wire.MAX_METADATA_BODY_BYTES - len(encoded))
    success(c, request(c.raw_app, "POST", RAW_FRAMES, request_key="limit", content=padded,
                       headers=[("Content-Type", "Application/JSON; Charset=UTF-8")]))


@pytest.mark.parametrize("scope", ["attempt", "frameless_display"])
def test_valid_wire_shape_does_not_invent_backend_authority(raw_http, scope):
    c = raw_http
    envelope = deepcopy(c.raw_envelope)
    if scope == "attempt":
        envelope["batch"]["records"][0]["scope"] = {
            "kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 1}
        code = "dependency_missing"
    else:
        item, _ = additional(c)
        item["frame_id"] = None
        envelope["batch"]["records"].append(item)
        code = "unsupported_source"
    wire.validate("RawFrameBatchRequest", envelope)
    unchanged(c, lambda: ingest(c, envelope=envelope), 409, code)


@pytest.mark.parametrize("kind", ["raw_capture_frame", "capture_record", "capture_slot", "capture_binding", "capture_artifact_ref"])
def test_http_replay_never_reconstructs_lost_committed_witnesses(raw_captured, kind):
    c = raw_captured
    identifier = {"raw_capture_frame": c.raw_frame["frame_id"], "capture_record": "process-1",
                  "capture_slot": key(c.batch["device_id"], c.batch["stream_id"], 1),
                  "capture_binding": c.batch["stream_id"], "capture_artifact_ref": c.ink_ref["artifact_id"]}[kind]
    del c.store._documents[USER][(kind, identifier)]
    unchanged(c, lambda: ingest(c), 503, "unavailable")


@pytest.mark.parametrize("corruption", ["raw_version", "screen_bytes", "ink_binding", "ack_pending", "ack_json", "cache_sources"])
def test_corrupt_retained_raw_evidence_is_sanitized_not_repaired(raw_captured, corruption):
    c = raw_captured
    rows = c.store._documents[USER]
    replay = rows[("capture_replay", key("POST", RAW_FRAMES, "raw-http"))]
    if corruption == "raw_version":
        rows[("raw_capture_frame", c.raw_frame["frame_id"])]["contract_version"] = "9.9.9"
    elif corruption == "screen_bytes":
        rows[("artifact", c.ref["artifact_id"])]["data_base64"] = "UFJJVkFURQ=="
    elif corruption == "ink_binding":
        del rows[("artifact", c.ink_ref["artifact_id"])]["original_binding"]
    elif corruption == "ack_pending":
        ack = deepcopy(c.raw_ack)
        ack["acknowledged"][0]["artifacts"][0]["status"] = "pending"
        replay["response_json"] = json.dumps(ack)
    elif corruption == "ack_json":
        replay["response_json"] = "PRIVATE invalid retained JSON"
    else:
        replay["source_ids"] = []
    unchanged(c, lambda: ingest(c), 503, "unavailable")


def test_new_http_key_cannot_resurrect_a_lost_frame(raw_captured):
    c = raw_captured
    del c.store._documents[USER][("raw_capture_frame", c.raw_frame["frame_id"])]
    item, _ = additional(c, frame_id=c.raw_frame["frame_id"])
    envelope = {**c.raw_envelope, "batch": {**c.batch, "records": [item]}}
    unchanged(c, lambda: ingest(c, envelope=envelope, request_key="new-record"), 503, "unavailable")


@pytest.mark.parametrize("family", ["raw", "legacy"])
def test_frame_identity_conflict_is_409_and_cannot_partially_commit(raw_http, family):
    c = raw_http
    if family == "legacy":
        legacy = deepcopy(c.envelope)
        legacy["batch"]["records"][0]["media_position"] = c.frame["media_position"]
        legacy_success(request(c.raw_app, "POST", FRAMES, body=legacy, request_key="legacy-first"), "ProcessBatchAck")
    else:
        success(c, ingest(c))
    item, frame = additional(c)
    changed_original = deepcopy(c.raw_frame)
    changed_original["orientation"]["value"] = 1
    envelope = {**c.raw_envelope, "batch": {**c.batch, "records": [item, c.batch["records"][0]]},
                "frames": [frame, changed_original]}
    unchanged(c, lambda: ingest(c, envelope=envelope, request_key="mixed-conflict"), 409, "record_conflict")


@pytest.mark.parametrize("failure", ["guard", "raw_capture_frame", "capture_replay", "commit"])
@pytest.mark.parametrize("cancelled", [False, True])
def test_late_failure_or_cancellation_withholds_ack_and_allows_clean_retry(raw_http, monkeypatch, failure, cancelled):
    c = raw_http
    before = documents(c)
    original_put, original_transaction = _MemoryTransaction.put, c.store.transaction
    original_authenticate = c.auth.authenticate
    failures, authentications = [], []

    def fail():
        failures.append(failure)
        raise (CancelledError if cancelled else RuntimeError)("PRIVATE injected transaction failure")

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == failure:
            fail()

    def authenticate(token, now):
        authentications.append(True)
        if len(authentications) > 1:
            fail()
        return original_authenticate(token, now)

    @contextmanager
    def transaction(actor):
        with original_transaction(actor) as tx:
            yield tx
            fail()

    with monkeypatch.context() as patch:
        if failure == "guard":
            patch.setattr(c.auth, "authenticate", authenticate)
        elif failure == "commit":
            patch.setattr(c.store, "transaction", transaction)
        else:
            patch.setattr(_MemoryTransaction, "put", put)
        response = ingest(c)
        if cancelled:
            assert response.status_code >= 500
            assert "acknowledged" not in response.text
            assert "PRIVATE" not in response.text
        else:
            error(response, 503, "unavailable")
    assert failures == [failure]
    assert documents(c) == before
    assert success(c, ingest(c))["acknowledged"][0]["disposition"] == "accepted"


def test_expiry_between_http_authentication_and_actor_transaction_refuses_replay(raw_captured, monkeypatch):
    c = raw_captured
    before = documents(c)
    original_transaction = c.store.transaction

    @contextmanager
    def expire(actor):
        with original_transaction(actor) as tx:
            c.instant[0] = NOW + timedelta(hours=2)
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", expire)
        error(ingest(c), 401, "unauthenticated")
    assert documents(c) == before


@pytest.mark.parametrize("enabled", [False, True])
def test_legacy_frame_collision_keeps_released_closed_error(raw_captured, enabled):
    c = raw_captured
    legacy = deepcopy(c.envelope)
    legacy["batch"]["records"][0]["media_position"] = c.frame["media_position"]
    before = documents(c)
    legacy_error(request(app(c, enabled=enabled), "POST", FRAMES, body=legacy, request_key="legacy-collision"),
                 503, "unavailable")
    assert documents(c) == before


@pytest.mark.parametrize("enabled", [False, True])
def test_legacy_cancellation_keeps_released_closed_error_and_rolls_back(raw_http, monkeypatch, enabled):
    c = raw_http
    legacy = deepcopy(c.envelope)
    legacy["batch"]["records"][0]["media_position"] = c.frame["media_position"]
    before = documents(c)
    original_put = _MemoryTransaction.put
    cancelled = []

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            cancelled.append(True)
            raise CancelledError("PRIVATE legacy cancellation")

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", put)
        legacy_error(request(app(c, enabled=enabled), "POST", FRAMES, body=legacy, request_key="legacy-cancel"),
                     503, "unavailable")
    assert cancelled == [True]
    assert documents(c) == before


def test_enabled_factory_preserves_legacy_responses_and_refuses_raw_downgrade(raw_http):
    c = raw_http
    assert legacy_success(request(c.raw_app, "GET", DISPLAY), "DisplaySourceSnapshot") == c.descriptor
    legacy_success(request(c.raw_app, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c)),
                   "OriginalArtifactReceipt")
    legacy_error(request(c.raw_app, "POST", FRAMES, body=c.raw_envelope, request_key="wrong-route"),
                 422, "unsupported_version")
    legacy_error(request(c.raw_app, "POST", FRAMES, body={**c.raw_envelope, "contract_version": "0.2.4"},
                         request_key="no-coercion"), 422, "invalid_request")
    legacy = deepcopy(c.envelope)
    legacy["batch"]["records"][0]["media_position"] = c.frame["media_position"]
    ack = legacy_success(request(c.raw_app, "POST", FRAMES, body=legacy, request_key="legacy"), "ProcessBatchAck")
    assert ack["contract_version"] == "0.2.0"
    assert documents(c)[("frame", c.frame["frame_id"])] == c.frame
    assert ("raw_capture_frame", c.frame["frame_id"]) not in documents(c)
