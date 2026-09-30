"""Opt-in Windows HTTP domain flow; real test bytes, synthetic native facts.

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

from packages.contracts import windows_capture_ingress as wire
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
from services.api.tests.test_windows_frame_ingress import (
    EXAMPLES, additional, ingest as internal_ingest, raw_setup, registered, setup, uploaded, windows_setup,
)
from services.api.tests.test_windows_image_identity import contradict, second_frame


WINDOWS_ROUTE = "/v2/process/windows-frames:batch"
CAPABILITIES = LEGACY_CAPABILITIES | {wire.CAPABILITY}


def app(c, *, capabilities=CAPABILITIES, enabled=True, raw=False, desktop=False):
    return create_ingress_app(
        c.store, c.auth, capabilities=capabilities, stop_fact_resolver=resolve_stop_fact,
        clock=lambda: c.instant[0], enable_windows_ingress=enabled,
        enable_raw_ingress=raw, enable_desktop_ingress=desktop,
    )


@pytest.fixture
def windows_http(windows_setup):
    c = windows_setup
    c.windows_app = app(c)
    c.windows_envelope = {"contract_version": "0.2.10", "batch": c.batch, "frames": [c.windows_frame]}
    return c


def submit(c, envelope=None, key="windows-http", **kwargs):
    return request(c.windows_app, "POST", WINDOWS_ROUTE, request_key=key,
                   body=c.windows_envelope if envelope is None else envelope, **kwargs)


def success(c, response, envelope=None):
    assert response.status_code == 200, response.text
    body = c.windows_envelope if envelope is None else envelope
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
    assert response.json() == {"contract_version": "0.2.10", "error": code,
                               "retryable": code in {"unavailable", "dependency_missing"}}
    wire.validate("WindowsIngressError", response.json())
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def unchanged(c, action, status, code):
    before = documents(c)
    error(action(), status, code)
    assert documents(c) == before


@pytest.fixture
def windows_gap_http(registered):
    c = registered
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    c.windows_app = app(c)
    c.windows_envelope = {"contract_version": "0.2.10", "batch": {**c.batch, "records": [gap(c)]}, "frames": []}
    return c


def test_http_pair_commits_exact_originals_and_ordered_receipt_in_one_transaction(windows_http, monkeypatch):
    c = windows_http
    original = deepcopy(c.windows_envelope)
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
    assert c.windows_envelope == original
    saved = documents(c)
    assert saved[("raw_capture_frame", c.windows_frame["frame_id"])] == c.windows_frame
    replay = saved[("capture_replay", storage_key("POST", WINDOWS_ROUTE, "windows-http"))]
    assert json.loads(replay["response_json"]) == ack
    assert ("capture_replay", storage_key("internal_windows_capture_frames", "windows-http")) not in saved
    c.windows_app = app(c)
    assert success(c, submit(c)) == ack
    assert documents(c) == saved
    for ref, data in ((c.ref, c.data), (c.composed_ref, c.composed_data), (c.ink_ref, c.ink_data)):
        response = request(c.windows_app, "GET", read_path(c, artifact_id=ref["artifact_id"]))
        assert response.status_code == 200
        assert response.json()["artifact"] == ref
        assert base64.b64decode(response.json()["data_base64"], validate=True) == data
    duplicate = success(c, submit(c, key="same-record-new-key"))
    assert duplicate["acknowledged"] == [{**r, "disposition": "duplicate"} for r in ack["acknowledged"]]


@pytest.mark.parametrize("variant", ["raw-only", "shared-original", "byte-alias"])
def test_raw_only_and_shared_png_aliases_preserve_editable_ink(windows_http, variant):
    c = windows_http
    frame = c.windows_frame
    refs = [c.ref, c.ink_ref]
    if variant == "raw-only":
        frame["composed"] = None
    else:
        frame["composed"]["image"] = deepcopy(frame["raw"])
        if variant == "byte-alias":
            _, aliased = second_frame(c, alias=True)
            frame["composed"]["image"] = aliased["raw"]
            refs.insert(1, aliased["raw"]["artifact"])
    c.batch["records"][0]["artifacts"] = refs
    ack = success(c, submit(c))
    assert ack["acknowledged"][0]["artifacts"] == [{**ref, "status": "verified"} for ref in refs]
    assert documents(c)[("raw_capture_frame", frame["frame_id"])] == frame
    assert success(c, submit(c)) == ack


@pytest.mark.parametrize("coverage", ["unknown", "unobserved", "partial"])
def test_first_http_gap_commits_without_pixels_or_manufactured_receipts(windows_gap_http, coverage):
    c = windows_gap_http
    c.windows_envelope["batch"]["records"][0]["evidence"]["coverage"] = coverage
    before = documents(c)
    assert ("artifact", c.ref["artifact_id"]) not in before
    ack = success(c, submit(c))
    assert ack["acknowledged"][0]["artifacts"] == []
    for kind in ("frame", "raw_capture_frame", "artifact", "capture_artifact_ref"):
        assert {k: v for k, v in documents(c).items() if k[0] == kind} == {k: v for k, v in before.items() if k[0] == kind}
    assert success(c, submit(c)) == ack


def test_gap_frame_and_later_gap_preserve_causal_history(windows_http):
    c = windows_http
    first = gap(c)
    observed, frame = additional(c, parents=[first["record_id"]])
    envelope = {**c.windows_envelope, "batch": {**c.batch, "records": [first, observed]}, "frames": [frame]}
    ack = success(c, submit(c, envelope), envelope)
    assert ack["acknowledged"][0]["artifacts"] == []
    later = gap(c, record_id="later-windows-gap", sequence=3, parents=[observed["record_id"]])
    final = {**envelope, "batch": {**c.batch, "records": [later]}, "frames": []}
    last = success(c, submit(c, final, "later-gap"), final)
    assert last["acknowledged"][0]["artifacts"] == []
    retained = documents(c)
    assert success(c, submit(c, envelope), envelope) == ack
    assert success(c, submit(c, final, "later-gap"), final) == last
    assert documents(c) == retained


@pytest.mark.parametrize("change", ["frames", "records", "artifacts", "evidence", "batch_id", "metadata"])
def test_http_replay_binds_whole_envelope_and_all_array_order(windows_http, change):
    c = windows_http
    item, frame = additional(c)
    envelope = {**c.windows_envelope, "batch": {**c.batch, "records": [c.batch["records"][0], item]},
                "frames": [c.windows_frame, frame]}
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
        changed["frames"][0]["composed"]["ink_revision"] += 1
    unchanged(c, lambda: submit(c, changed), 409, "idempotency_conflict")


def test_internal_frame_map_order_does_not_replace_ordered_http_receipt(windows_http):
    c = windows_http
    item, frame = additional(c)
    batch = {**c.batch, "records": [c.batch["records"][0], item]}
    frames = [c.windows_frame, frame]
    ack = internal_ingest(c, batch, frames, "shared-key")
    assert internal_ingest(c, batch, list(reversed(frames)), "shared-key") == ack
    envelope = {**c.windows_envelope, "batch": batch, "frames": frames}
    http = success(c, submit(c, envelope, "shared-key"), envelope)
    assert all(r["disposition"] == "duplicate" for r in http["acknowledged"])
    unchanged(c, lambda: submit(c, {**envelope, "frames": list(reversed(frames))}, "shared-key"),
              409, "idempotency_conflict")


@pytest.mark.parametrize("claim", ["foreign-owner", "wrong-stream", "record-without-composed", "unknown-source", "attempt"])
def test_request_labels_cannot_supply_missing_identity_or_authority(windows_http, claim):
    c = windows_http
    envelope = deepcopy(c.windows_envelope)
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
def test_current_fences_precede_new_and_cached_http_success(windows_http, cached, fence, status, code):
    c = windows_http
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
def test_every_original_is_checked_before_new_or_cached_http_ack(windows_http, cached, role, damage):
    c = windows_http
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
def test_historical_http_retention_needs_sealed_stop_and_never_restarts(windows_http, variant):
    c = windows_http
    historical = deepcopy(c.windows_envelope)
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


@pytest.mark.parametrize("alias", [False, True])
@pytest.mark.parametrize("separate", [False, True])
def test_cross_frame_image_identity_conflicts_are_refused_over_http(windows_http, alias, separate):
    c = windows_http
    item, frame = second_frame(c, alias=alias, swap_roles=True)
    contradict(frame, "composed", "pixels_sha256")
    if separate:
        success(c, submit(c))
        envelope = {**c.windows_envelope, "batch": {**c.batch, "records": [item]}, "frames": [frame]}
        status, code = 409, "record_conflict"
    else:
        envelope = {**c.windows_envelope, "batch": {**c.batch, "records": [c.batch["records"][0], item]},
                    "frames": [c.windows_frame, frame]}
        status, code = 422, "invalid_request"
    unchanged(c, lambda: submit(c, envelope, "conflicting-image"), status, code)


@pytest.mark.parametrize("failure,variant", [
    ("raw_capture_frame", "frame"), ("capture_record", "gap"),
    ("capture_replay", "frame"), ("commit", "gap"),
])
@pytest.mark.parametrize("failure_type", [RuntimeError, CancelledError, asyncio.CancelledError],
                         ids=["write-failure", "future-cancellation", "asyncio-cancellation"])
def test_late_failure_or_cancellation_rolls_back_ack_and_all_writes(windows_http, monkeypatch, failure, variant, failure_type):
    c = windows_http
    if variant == "gap":
        c.windows_envelope.update(batch={**c.batch, "records": [gap(c)]}, frames=[])
    before = documents(c)
    original_put, transaction = _MemoryTransaction.put, c.store.transaction
    failures = []

    def fail():
        failures.append(failure)
        raise failure_type("PRIVATE Windows transaction failure")

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


def test_token_expiry_inside_actor_lock_precedes_cached_gap_ack(windows_gap_http, monkeypatch):
    c = windows_gap_http
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
def test_final_token_recheck_withholds_staged_or_cached_http_success(windows_http, monkeypatch, cached):
    c = windows_http
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


@pytest.mark.parametrize("family", ["generic", "legacy", "raw", "desktop"])
@pytest.mark.parametrize("cached", [False, True])
def test_http_gap_receipt_prevents_profile_loss_fallback_on_older_entries(windows_http, family, cached):
    c = windows_http
    c.windows_app = app(c, raw=True, desktop=True,
                        capabilities=CAPABILITIES | {"process.raw-ingress.v0.2.6", "process.desktop-ingress.v0.2.8"})
    batch = deepcopy(c.structured_batch)
    if family == "generic":
        batch["records"][0].update(frame_id=None, artifacts=[],
            source={name: c.core["SourceSnapshot"][name] for name in ("user_id", "source_id", "source_version")})
        action = lambda: c.registry.capture.ingest(USER, batch, "old-cached-request")
    elif family == "legacy":
        batch["records"][0]["media_position"] = c.frame["media_position"]
        route, version, frames = "/v2/process/frames:batch", "0.2.4", [c.frame]
    elif family == "raw":
        route, version, frames = "/v2/process/raw-frames:batch", "0.2.6", [c.raw_frame]
    else:
        frame = json.loads((EXAMPLES.parents[2] / "desktop_frame/examples/macos-synthetic.json").read_text())
        frame.update(frame_id=c.raw_frame["frame_id"], source=deepcopy(c.source), artifact=deepcopy(c.ref),
                     raw_width=2, raw_height=2,
                     **{name: c.batch[name] for name in ("device_id", "session_id", "stream_id")})
        batch = deepcopy(c.batch)
        route, version, frames = "/v2/process/desktop-frames:batch", "0.2.8", [frame]
    if family != "generic":
        action = lambda: request(c.windows_app, "POST", route, request_key="old-cached-request",
                                 body={"contract_version": version, "batch": batch, "frames": frames})
    if cached:
        if family != "desktop":
            for kind in ("control_start", "control_stream"):
                del c.store._documents[USER][(kind, c.batch["stream_id"])]["producer_profile"]
        initial = action()
        if family != "generic":
            assert initial.status_code == 200, initial.text
            initial = initial.json()
        assert initial["acknowledged"][0]["disposition"] == "accepted"
        c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    item = gap(c, sequence=2 if cached else 1)
    envelope = {**c.windows_envelope, "batch": {**c.batch, "records": [item]}, "frames": []}
    success(c, submit(c, envelope), envelope)
    for kind in ("control_start", "control_stream"):
        del c.store._documents[USER][(kind, c.batch["stream_id"])]["producer_profile"]
    if not cached:
        batch["records"][0].update(record_id="new-old-family-fallback", sequence=2)
    if family == "generic":
        from services.api.tests.test_raw_frame_ingress import denied
        denied(c, action, 403, "forbidden")
    else:
        before = documents(c)
        response = action()
        assert response.status_code == 403, response.text
        assert response.json() == {"contract_version": version, "error": "forbidden", "retryable": False}
        assert documents(c) == before
