"""Opt-in macOS HTTP with audited Swift PNGs and synthetic archive authority.

In-process ASGI/MemoryStore only, with no listener, device, provider or decoding
attestation. Strict transport and embedding-factory checks live in their suites.
"""

import asyncio
import base64
from concurrent.futures import CancelledError
from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta
import json

import pytest

from packages.contracts import macos_capture_ingress as wire
from services.api.domain import key as storage_key
from services.api.ingress_app import create_ingress_app
from services.api.storage import _MemoryTransaction
from services.api.tests.test_control import (
    USER, apply, command, documents, resolve_stop_fact, stop_fact,
)
from services.api.tests.test_desktop_ingress_http import gap
from services.api.tests.test_ingress_http import (
    CAPABILITIES as LEGACY_CAPABILITIES, read_path, request,
)
from services.api.tests.macos_fixtures import (
    additional, ingest as internal_ingest, raw_setup, registered, setup, uploaded, macos_setup,
    references, retained_frame, upload_frame,
)


MACOS_ROUTE = "/v2/process/macos-frames:batch"
CAPABILITIES = LEGACY_CAPABILITIES | {wire.CAPABILITY}


def app(c, *, capabilities=CAPABILITIES, enabled=True, raw=False, desktop=False, windows=False):
    return create_ingress_app(
        c.store, c.auth, capabilities=capabilities, stop_fact_resolver=resolve_stop_fact,
        clock=lambda: c.instant[0], enable_macos_ingress=enabled,
        enable_raw_ingress=raw, enable_desktop_ingress=desktop, enable_windows_ingress=windows,
    )


@pytest.fixture
def macos_http(macos_setup):
    c = macos_setup
    c.macos_app = app(c)
    c.macos_envelope = {"contract_version": "0.2.12", "batch": c.batch, "frames": [c.macos_frame]}
    return c


def submit(c, envelope=None, key="macos-http", **kwargs):
    return request(c.macos_app, "POST", MACOS_ROUTE, request_key=key,
                   body=c.macos_envelope if envelope is None else envelope, **kwargs)


def success(c, response, envelope=None):
    assert response.status_code == 200, response.text
    body = c.macos_envelope if envelope is None else envelope
    refs = [ref for item in body["batch"]["records"] for ref in item["artifacts"]]
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type")) for ref in refs}
    ack = response.json()
    wire.validate_ack(body["batch"], ack, user_id=USER, verified_artifacts=verified)
    assert ack["contract_version"] == "0.2.0"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    return ack


def error(response, status, code):
    assert response.status_code == status, response.text
    assert response.json() == {"contract_version": "0.2.12", "error": code,
                               "retryable": code in {"unavailable", "dependency_missing"}}
    wire.validate("MacOSIngressError", response.json())
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def unchanged(c, action, status, code):
    before = documents(c)
    error(action(), status, code)
    assert documents(c) == before


@pytest.fixture
def macos_gap_http(registered):
    c = registered
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    c.macos_app = app(c)
    c.macos_envelope = {"contract_version": "0.2.12", "batch": {**c.batch, "records": [gap(c)]}, "frames": []}
    return c


def test_http_pair_commits_exact_originals_and_ordered_receipt_in_one_transaction(macos_http, monkeypatch):
    c = macos_http
    original = deepcopy(c.macos_envelope)
    transaction, actors = c.store.transaction, []

    @contextmanager
    def counted(actor):
        actors.append(actor)
        with transaction(actor) as tx:
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", counted)
        ack = success(c, submit(c))
    assert actors == [USER]
    assert c.macos_envelope == original
    saved = documents(c)
    assert saved[("raw_capture_frame", c.macos_frame["frame_id"])] == c.macos_frame
    replay = saved[("capture_replay", storage_key("POST", MACOS_ROUTE, "macos-http"))]
    assert json.loads(replay["response_json"]) == ack
    assert ("capture_replay", storage_key("internal_macos_capture_frames", "macos-http")) not in saved
    c.macos_app = app(c)
    assert success(c, submit(c)) == ack
    assert documents(c) == saved
    for ref, data in ((c.ref, c.data), (c.composed_ref, c.composed_data), (c.ink_ref, c.ink_data)):
        response = request(c.macos_app, "GET", read_path(c, artifact_id=ref["artifact_id"]))
        assert response.status_code == 200
        assert response.json()["artifact"] == ref
        assert base64.b64decode(response.json()["data_base64"], validate=True) == data
    duplicate = success(c, submit(c, key="same-record-new-key"))
    assert duplicate["acknowledged"] == [{**r, "disposition": "duplicate"} for r in ack["acknowledged"]]


def test_all_seven_audited_descriptors_cross_http_unchanged(macos_http):
    c = macos_http
    frames, records = [], []
    for index in range(7):
        item, _ = additional(c, record_id=f"audited-record-{index}", sequence=index + 1,
                             frame_id=f"audited-frame-{index}")
        frame = retained_frame(c, index, frame_id=item["frame_id"])
        upload_frame(c, frame)
        item["artifacts"] = references(frame) + [deepcopy(c.ink_ref)]
        frames.append(frame)
        records.append(item)
    envelope = {**c.macos_envelope, "batch": {**c.batch, "records": records}, "frames": frames}
    original = deepcopy(envelope)
    ack = success(c, submit(c, envelope), envelope)
    assert envelope == original
    saved = documents(c)
    for frame in frames:
        assert saved[("raw_capture_frame", frame["frame_id"])] == frame
    assert success(c, submit(c, envelope), envelope) == ack
    assert documents(c) == saved


def test_unknown_composition_stays_unknown_with_only_raw_image_receipt(macos_http):
    c = macos_http
    envelope = deepcopy(c.macos_envelope)
    unknown = {"kind": "unknown", "reason": "no_retained_outcome"}
    envelope["frames"][0]["composition"] = unknown
    envelope["batch"]["records"][0]["artifacts"] = [c.ref, c.ink_ref]
    ack = success(c, submit(c, envelope), envelope)
    assert ack["acknowledged"][0]["artifacts"] == [
        {**ref, "status": "verified"} for ref in (c.ref, c.ink_ref)]
    assert documents(c)[("raw_capture_frame", c.macos_frame["frame_id"])]["composition"] == unknown


@pytest.mark.parametrize("coverage", ["unknown", "unobserved", "partial"])
def test_first_http_gap_commits_without_pixels_or_manufactured_receipts(macos_gap_http, coverage):
    c = macos_gap_http
    c.macos_envelope["batch"]["records"][0]["evidence"]["coverage"] = coverage
    before = documents(c)
    assert ("artifact", c.ref["artifact_id"]) not in before
    ack = success(c, submit(c))
    assert ack["acknowledged"][0]["artifacts"] == []
    for kind in ("frame", "raw_capture_frame", "artifact", "capture_artifact_ref"):
        assert {k: v for k, v in documents(c).items() if k[0] == kind} == {k: v for k, v in before.items() if k[0] == kind}
    assert success(c, submit(c)) == ack


def test_gap_frame_and_later_gap_preserve_causal_history(macos_http):
    c = macos_http
    first = gap(c)
    observed, frame = additional(c, parents=[first["record_id"]])
    envelope = {**c.macos_envelope, "batch": {**c.batch, "records": [first, observed]}, "frames": [frame]}
    ack = success(c, submit(c, envelope), envelope)
    assert ack["acknowledged"][0]["artifacts"] == []
    later = gap(c, record_id="later-macos-gap", sequence=3, parents=[observed["record_id"]])
    final = {**envelope, "batch": {**c.batch, "records": [later]}, "frames": []}
    last = success(c, submit(c, final, "later-gap"), final)
    assert last["acknowledged"][0]["artifacts"] == []
    retained = documents(c)
    assert success(c, submit(c, envelope), envelope) == ack
    assert success(c, submit(c, final, "later-gap"), final) == last
    assert documents(c) == retained


@pytest.mark.parametrize("change", ["frames", "records", "artifacts", "evidence", "batch_id", "metadata"])
def test_http_replay_binds_whole_envelope_and_all_array_order(macos_http, change):
    c = macos_http
    item, frame = additional(c)
    envelope = {**c.macos_envelope, "batch": {**c.batch, "records": [c.batch["records"][0], item]},
                "frames": [c.macos_frame, frame]}
    ack = success(c, submit(c, envelope), envelope)
    reordered_members = dict(reversed(list(envelope.items())))
    assert success(c, submit(c, reordered_members), envelope) == ack
    changed = deepcopy(envelope)
    if change == "frames":
        changed["frames"].reverse()
    elif change == "records":
        changed["batch"]["records"].reverse()
    elif change == "artifacts":
        changed["batch"]["records"][0]["artifacts"].reverse()
    elif change == "evidence":
        changed["batch"]["records"][0]["evidence"]["limitations"].reverse()
    elif change == "batch_id":
        changed["batch"]["batch_id"] = "other-http-envelope"
    else:
        changed["frames"][0]["profile"]["sample"]["presentation_time_seconds"] += 1
    unchanged(c, lambda: submit(c, changed), 409, "idempotency_conflict")


def test_internal_frame_map_order_does_not_replace_ordered_http_receipt(macos_http):
    c = macos_http
    item, frame = additional(c)
    batch = {**c.batch, "records": [c.batch["records"][0], item]}
    frames = [c.macos_frame, frame]
    ack = internal_ingest(c, batch, frames, "shared-key")
    assert internal_ingest(c, batch, list(reversed(frames)), "shared-key") == ack
    envelope = {**c.macos_envelope, "batch": batch, "frames": frames}
    http = success(c, submit(c, envelope, "shared-key"), envelope)
    assert all(r["disposition"] == "duplicate" for r in http["acknowledged"])
    unchanged(c, lambda: submit(c, {**envelope, "frames": list(reversed(frames))}, "shared-key"),
              409, "idempotency_conflict")


@pytest.mark.parametrize("claim", ["foreign-owner", "wrong-stream", "record-without-composed", "unknown-source", "attempt"])
def test_request_labels_cannot_supply_missing_identity_or_authority(macos_http, claim):
    c = macos_http
    envelope = deepcopy(c.macos_envelope)
    item, frame = envelope["batch"]["records"][0], envelope["frames"][0]
    status, code = 422, "invalid_request"
    if claim == "foreign-owner":
        item["source"]["user_id"] = frame["source"]["user_id"] = "other-user"
        status, code = 404, "not_found"
    elif claim == "wrong-stream":
        frame["stream_id"] = "other-stream"
    elif claim == "record-without-composed":
        item["artifacts"] = [c.ref, c.ink_ref]
    elif claim == "unknown-source":
        item["source"]["source_id"] = frame["source"]["source_id"] = "unknown-display"
        status, code = 404, "not_found"
    else:
        item["scope"] = {"kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 1}
        status, code = 409, "dependency_missing"
    unchanged(c, lambda: submit(c, envelope), status, code)


@pytest.mark.parametrize("cached", [False, True])
@pytest.mark.parametrize("fence,status,code", [
    ("stop", 409, "capture_stopped"), ("withdraw", 403, "forbidden"),
    ("source_revoke", 404, "not_found"), ("delete", 404, "not_found"),
    ("generation", 403, "forbidden"), ("membership", 403, "forbidden"),
    ("token", 401, "unauthenticated"), ("profile", 403, "forbidden"),
])
def test_current_fences_precede_new_and_cached_http_success(macos_http, cached, fence, status, code):
    c = macos_http
    if cached:
        success(c, submit(c))
    if fence in {"stop", "withdraw"}:
        apply(c, command(c, fence))
    elif fence == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif fence == "delete":
        c.archive.delete_source(USER, c.source["source_id"])
    elif fence == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    elif fence == "membership":
        c.registry.set_membership(USER, c.batch["device_id"], c.batch["session_id"], active=False, expected_revision=1)
    elif fence == "token":
        c.auth.revoke("control-token")
    else:
        for kind in ("control_start", "control_stream"):
            del c.store._documents[USER][(kind, c.batch["stream_id"])]["producer_profile"]
    unchanged(c, lambda: submit(c), status, code)


@pytest.mark.parametrize("cached", [False, True])
@pytest.mark.parametrize("role", ["raw", "composed", "ink"])
@pytest.mark.parametrize("damage", ["missing", "substituted"])
def test_every_original_is_checked_before_new_or_cached_http_ack(macos_http, cached, role, damage):
    c = macos_http
    if cached:
        success(c, submit(c))
    ref = {"raw": c.ref, "composed": c.composed_ref, "ink": c.ink_ref}[role]
    identity = ("artifact", ref["artifact_id"])
    if damage == "missing":
        del c.store._documents[USER][identity]
    else:
        data = c.composed_data if role == "raw" else c.data
        c.store._documents[USER][identity]["data_base64"] = base64.b64encode(data).decode("ascii")
    status, code = 503, "unavailable"
    if damage == "missing" and not cached:
        status, code = (409, "dependency_missing") if role == "ink" else (404, "not_found")
    unchanged(c, lambda: submit(c), status, code)


@pytest.mark.parametrize("variant", ["frame", "gap"])
def test_historical_http_retention_needs_sealed_stop_and_never_restarts(macos_http, variant):
    c = macos_http
    historical = deepcopy(c.macos_envelope)
    if variant == "gap":
        historical.update(batch={**c.batch, "records": [gap(c)]}, frames=[])
    historical["batch"]["delivery_mode"] = "historical"
    apply(c, command(c))
    unchanged(c, lambda: submit(c, historical), 409, "capture_stopped")
    stop_fact(c, 1)
    stopped = apply(c, command(c, "seal_stop", revision=2, boundary=1), "seal")
    ack = success(c, submit(c, historical), historical)
    assert success(c, submit(c, historical), historical) == ack
    assert c.registry.read(USER, c.batch["stream_id"]) == stopped
    assert documents(c)[("session", c.batch["session_id"])]["live_capture"] is False
    later, frame = additional(c)
    after_stop = {**historical, "batch": {**historical["batch"], "records": [later]}, "frames": [frame]}
    unchanged(c, lambda: submit(c, after_stop, "after-stop-boundary"), 409, "capture_stopped")


@pytest.mark.parametrize("failure,variant", [
    ("raw_capture_frame", "frame"), ("capture_record", "gap"),
    ("capture_replay", "frame"), ("commit", "gap"),
])
@pytest.mark.parametrize("failure_type", [RuntimeError, CancelledError, asyncio.CancelledError],
                         ids=["write-failure", "future-cancellation", "asyncio-cancellation"])
def test_late_failure_or_cancellation_rolls_back_ack_and_all_writes(macos_http, monkeypatch, failure, variant, failure_type):
    c = macos_http
    if variant == "gap":
        c.macos_envelope.update(batch={**c.batch, "records": [gap(c)]}, frames=[])
    before = documents(c)
    original_put, transaction = _MemoryTransaction.put, c.store.transaction
    failures = []

    def fail():
        failures.append(failure)
        raise failure_type("PRIVATE MacOS transaction failure")

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == failure:
            fail()

    @contextmanager
    def failed_commit(actor):
        with transaction(actor) as tx:
            yield tx
            fail()

    with monkeypatch.context() as patch:
        if failure == "commit":
            patch.setattr(c.store, "transaction", failed_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", put)
        if failure_type is not RuntimeError:
            # Cancellation delivered within the transaction becomes a failed
            # response in this ASGI middleware; it must never expose an ACK.
            response = submit(c)
            assert response.status_code >= 500
            assert "acknowledged" not in response.text and "PRIVATE" not in response.text
        else:
            error(submit(c), 503, "unavailable")
    assert failures == [failure]
    assert documents(c) == before
    assert success(c, submit(c))["acknowledged"][0]["disposition"] == "accepted"


def test_token_expiry_inside_actor_lock_precedes_cached_gap_ack(macos_gap_http, monkeypatch):
    c = macos_gap_http
    success(c, submit(c))
    transaction = c.store.transaction

    @contextmanager
    def expire(actor):
        with transaction(actor) as tx:
            c.instant[0] += timedelta(hours=2)
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", expire)
        unchanged(c, lambda: submit(c), 401, "unauthenticated")


@pytest.mark.parametrize("cached", [False, True])
def test_final_token_recheck_withholds_staged_or_cached_http_success(macos_http, monkeypatch, cached):
    c = macos_http
    if cached:
        success(c, submit(c))
    original_put, original_get = _MemoryTransaction.put, _MemoryTransaction.get
    seen = []

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            seen.append("staged")
            c.auth.revoke("control-token")

    def get(tx, kind, identifier):
        value = original_get(tx, kind, identifier)
        if cached and kind == "capture_replay" and value is not None:
            seen.append("cached")
            c.auth.revoke("control-token")
        return value

    monkeypatch.setattr(_MemoryTransaction, "put", put)
    monkeypatch.setattr(_MemoryTransaction, "get", get)
    unchanged(c, lambda: submit(c), 401, "unauthenticated")
    assert seen == ["cached" if cached else "staged"]
