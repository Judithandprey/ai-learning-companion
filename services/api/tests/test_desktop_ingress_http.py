"""Opt-in desktop HTTP with actual test bytes and synthetic native metadata.

In-process ASGI/MemoryStore only: no listener, device, provider or screen claim.
"""

import base64
from concurrent.futures import CancelledError
from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta
import json

import pytest

from packages.contracts import desktop_capture_ingress as wire
from services.api.domain import key
from services.api.errors import DomainError
from services.api.ingress_app import create_ingress_app
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import (
    USER, apply, command, documents, registration, resolve_stop_fact, start, stop_fact,
)
from services.api.tests.test_desktop_frame_ingress import additional, desktop_setup, pixel_record
from services.api.tests.test_ingress_http import (
    CAPABILITIES as LEGACY_CAPABILITIES, DISPLAY, FRAMES, ORIGINALS, original_body,
    read_path, registered, request, setup, uploaded,
)
from services.api.tests.test_raw_frame_ingress import raw_setup


DESKTOP_ROUTE = "/v2/process/desktop-frames:batch"
CAPABILITIES = LEGACY_CAPABILITIES | {wire.CAPABILITY}


def app(c, *, capabilities=CAPABILITIES, enabled=True, raw=False):
    return create_ingress_app(c.store, c.auth, capabilities=capabilities,
                              stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0],
                              enable_desktop_ingress=enabled, enable_raw_ingress=raw)


def gap(c, *, record_id="desktop-gap-1", sequence=1, coverage="unknown", parents=()):
    return pixel_record(record(c.batch, record_id, sequence, frame_id=None,
                               artifacts=[], causal_parents=list(parents)), coverage=coverage)


@pytest.fixture
def desktop_http(desktop_setup):
    c = desktop_setup
    c.desktop_app = app(c)
    c.desktop_envelope = {"contract_version": "0.2.8", "batch": c.batch, "frames": [c.desktop_frame]}
    return c


@pytest.fixture
def desktop_gap_http(registered):
    """This display source has no uploaded original or frame when its gap arrives."""
    c = registered
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    c.desktop_app = app(c)
    c.desktop_envelope = {"contract_version": "0.2.8", "batch": {**c.batch, "records": [gap(c)]}, "frames": []}
    return c


def submit(c, *, envelope=None, request_key="desktop-http", **kwargs):
    return request(c.desktop_app, "POST", DESKTOP_ROUTE, request_key=request_key,
                   body=c.desktop_envelope if envelope is None else envelope, **kwargs)


def error(response, status, code, version="0.2.8"):
    assert response.status_code == status, response.text
    assert response.json() == {"contract_version": version, "error": code,
                               "retryable": code in {"unavailable", "dependency_missing"}}
    if version == "0.2.8":
        wire.validate("DesktopIngressError", response.json())
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"


def success(c, response, envelope=None):
    assert response.status_code == 200, response.text
    body = c.desktop_envelope if envelope is None else envelope
    refs = [ref for item in body["batch"]["records"] for ref in item["artifacts"]]
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type")) for ref in refs}
    ack = response.json()
    wire.validate_ack(body["batch"], ack, user_id=USER, verified_artifacts=verified)
    assert ack["contract_version"] == "0.2.0"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    return ack


def unchanged(c, action, status, code, version="0.2.8"):
    before = documents(c)
    error(action(), status, code, version)
    assert documents(c) == before


@pytest.mark.parametrize("mounted", [False, True])
def test_composed_factory_keeps_desktop_opt_in_and_error_version(desktop_http, mounted):
    from starlette.applications import Starlette
    from starlette.routing import Mount
    from services.api.capture_app import create_capture_app

    c = desktop_http
    prefix = "/capture" if mounted else ""
    for enabled in (False, True):
        instance = create_capture_app(c.store, c.auth, capabilities=CAPABILITIES,
            stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0],
            enable_desktop_ingress=enabled)
        if mounted:
            instance = Starlette(routes=[Mount(prefix, app=instance)])
        denied = request(instance, "POST", prefix + DESKTOP_ROUTE,
                         body=c.desktop_envelope, token=None)
        error(denied, 401 if enabled else 404,
              "unauthenticated" if enabled else "not_found", "0.2.8" if enabled else "0.2.4")
        if enabled:
            success(c, request(instance, "POST", prefix + DESKTOP_ROUTE,
                               body=c.desktop_envelope, request_key="composed-desktop"))


@pytest.mark.parametrize("desktop_enabled,raw_enabled", [(False, False), (False, True), (True, False), (True, True)])
def test_explicit_flags_advertise_only_selected_routes(desktop_http, desktop_enabled, raw_enabled):
    c = desktop_http
    instance = app(c, enabled=desktop_enabled, raw=raw_enabled)
    paths = instance.openapi()["paths"]
    assert (DESKTOP_ROUTE in paths) == desktop_enabled
    assert ("/v2/process/raw-frames:batch" in paths) == raw_enabled
    before = documents(c)
    response = request(instance, "POST", DESKTOP_ROUTE, body=c.desktop_envelope, request_key="flags", token=None)
    error(response, 401 if desktop_enabled else 404, "unauthenticated" if desktop_enabled else "not_found",
          "0.2.8" if desktop_enabled else "0.2.4")
    assert documents(c) == before


def test_verified_http_commit_retains_exact_png_ink_metadata_and_one_transaction(desktop_http, monkeypatch):
    c = desktop_http
    original = deepcopy(c.desktop_envelope)
    transaction, entered = c.store.transaction, []

    @contextmanager
    def counted(actor):
        entered.append(actor)
        with transaction(actor) as tx:
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", counted)
        ack = success(c, submit(c))
    assert entered == [USER]
    assert c.desktop_envelope == original
    saved = documents(c)
    assert saved[("raw_capture_frame", c.desktop_frame["frame_id"])] == c.desktop_frame
    assert ("frame", c.desktop_frame["frame_id"]) not in saved
    assert json.loads(saved[("capture_record", "process-1")]["canonical_json"])["record"] == c.batch["records"][0]
    replay = saved[("capture_replay", key("POST", DESKTOP_ROUTE, "desktop-http"))]
    assert json.loads(replay["response_json"]) == ack
    assert ("capture_replay", key("internal_desktop_capture_frames", "desktop-http")) not in saved
    c.desktop_app = app(c)
    assert success(c, submit(c)) == ack
    assert documents(c) == saved
    for ref, expected in ((c.ref, c.data), (c.ink_ref, c.ink_data)):
        response = request(c.desktop_app, "GET", read_path(c, artifact_id=ref["artifact_id"]))
        assert response.status_code == 200
        body = response.json()
        assert body["contract_version"] == "0.2.2" and body["artifact"] == ref and body["source"] == c.source
        assert base64.b64decode(body["data_base64"], validate=True) == expected
    duplicate = success(c, submit(c, request_key="new-key"))
    assert duplicate["acknowledged"] == [{**receipt, "disposition": "duplicate"} for receipt in ack["acknowledged"]]


@pytest.mark.parametrize("coverage", ["unknown", "unobserved", "partial"])
def test_first_gap_commits_without_uploaded_pixels_or_manufactured_receipts(desktop_gap_http, coverage):
    c = desktop_gap_http
    item = c.desktop_envelope["batch"]["records"][0]
    item["evidence"]["coverage"] = coverage
    before = documents(c)
    assert ("artifact", c.ref["artifact_id"]) not in before
    ack = success(c, submit(c))
    assert ack["acknowledged"][0]["artifacts"] == []
    after = documents(c)
    for kind in ("frame", "raw_capture_frame", "artifact", "capture_artifact_ref"):
        assert {k: v for k, v in after.items() if k[0] == kind} == {k: v for k, v in before.items() if k[0] == kind}
    assert json.loads(after[("capture_record", item["record_id"])]["canonical_json"])["record"] == item
    slot_key = key(c.batch["device_id"], c.batch["stream_id"], 1)
    assert after[("capture_slot", slot_key)] == {"key": slot_key, "record_id": item["record_id"]}
    assert success(c, submit(c)) == ack
    assert documents(c) == after


def test_mixed_gap_and_frame_commit_and_replay_all_originals(desktop_http):
    c = desktop_http
    missing = gap(c)
    observed = deepcopy(c.batch["records"][0])
    observed.update(sequence=2, causal_parents=[missing["record_id"]])
    envelope = {**c.desktop_envelope, "batch": {**c.batch, "records": [missing, observed]}}
    ack = success(c, submit(c, envelope=envelope), envelope)
    assert [entry["record_id"] for entry in ack["acknowledged"]] == [missing["record_id"], observed["record_id"]]
    assert ack["acknowledged"][0]["artifacts"] == []
    assert all(a["status"] == "verified" for a in ack["acknowledged"][1]["artifacts"])
    before = documents(c)
    assert success(c, submit(c, envelope=envelope), envelope) == ack
    assert documents(c) == before


@pytest.mark.parametrize("change", ["frame_order", "record_order", "batch_id", "profile", "gap"])
def test_http_key_binds_complete_ordered_envelope(desktop_http, change):
    c = desktop_http
    item, frame = additional(c)
    envelope = {**c.desktop_envelope, "batch": {**c.batch, "records": [c.batch["records"][0], item]},
                "frames": [c.desktop_frame, frame]}
    ack = success(c, submit(c, envelope=envelope), envelope)
    assert success(c, submit(c, envelope=dict(reversed(list(envelope.items())))), envelope) == ack
    changed = deepcopy(envelope)
    if change == "frame_order":
        changed["frames"].reverse()
    elif change == "record_order":
        changed["batch"]["records"].reverse()
    elif change == "batch_id":
        changed["batch"]["batch_id"] = "changed-batch"
    elif change == "profile":
        changed["frames"][0]["profile"]["sample"]["dirty_rects"] = None
    else:
        changed["batch"]["records"].append(gap(c, sequence=3))
    unchanged(c, lambda: submit(c, envelope=changed), 409, "idempotency_conflict")


@pytest.mark.parametrize("route,version", [(FRAMES, "0.2.4"), ("/v2/process/raw-frames:batch", "0.2.6")])
def test_released_routes_refuse_desktop_envelope_and_frame(desktop_http, route, version):
    c = desktop_http
    instance = app(c, raw=True, capabilities=CAPABILITIES | {"process.raw-ingress.v0.2.6"})
    unchanged(c, lambda: request(instance, "POST", route, body=c.desktop_envelope, request_key="wrong-route"),
              422, "unsupported_version", version)
    adapted = {**c.desktop_envelope, "contract_version": version}
    unchanged(c, lambda: request(instance, "POST", route, body=adapted, request_key="no-downgrade"),
              422, "unsupported_version" if version == "0.2.6" else "invalid_request", version)


@pytest.mark.parametrize("case", ["missing_desktop", "missing_capture", "scope", "duplicate_auth", "expired"])
def test_current_authority_precedes_invalid_transport(desktop_http, case):
    c = desktop_http
    instance, token, headers = c.desktop_app, "control-token", []
    status, code = 403, "capability_required"
    if case.startswith("missing_"):
        removed = wire.CAPABILITY if case == "missing_desktop" else "process.capture.v0.2"
        instance = app(c, capabilities=CAPABILITIES - {removed})
    elif case == "scope":
        token, code = "write-token", "forbidden"
    elif case == "duplicate_auth":
        headers = [("Authorization", "Bearer control-token")]
        status, code = 401, "unauthenticated"
    else:
        c.instant[0] += timedelta(hours=2)
        status, code = 401, "unauthenticated"
    unchanged(c, lambda: request(instance, "POST", DESKTOP_ROUTE + "?unknown=1", token=token,
                                 headers=headers, content=b"{broken"), status, code)


def test_desktop_capability_does_not_grant_registration_or_original_routes(desktop_http):
    c = desktop_http
    instance = app(c, capabilities=frozenset({wire.CAPABILITY, "process.capture.v0.2"}))
    success(c, request(instance, "POST", DESKTOP_ROUTE, body=c.desktop_envelope, request_key="desktop-only"))
    for method, path, body in (("PUT", DISPLAY, c.display),
                               ("PUT", ORIGINALS + c.ref["artifact_id"], original_body(c)),
                               ("GET", read_path(c), None)):
        unchanged(c, lambda: request(instance, method, path, body=body), 403, "capability_required", "0.2.4")


@pytest.mark.parametrize("target", ["outer", "batch", "later_frame"])
def test_unknown_explicit_versions_precede_generic_shape_errors(desktop_http, target):
    c = desktop_http
    envelope = deepcopy(c.desktop_envelope)
    envelope["frames"].append({"contract_version": "0.2.7"})
    node = {"outer": envelope, "batch": envelope["batch"], "later_frame": envelope["frames"][1]}[target]
    node["contract_version"] = "9.9.9"
    envelope["unreleased_extra"] = True
    unchanged(c, lambda: submit(c, envelope=envelope), 422, "unsupported_version")


@pytest.mark.parametrize("content,status,code", [
    (b'{"contract_version":"9.9.9","contract_version":"0.2.8"}', 400, "invalid_json"),
    (b'{"contract_version":"9.9.9","x":NaN}', 400, "invalid_json"),
    (b'\xff', 400, "invalid_json"), (b'{"x":9007199254740992}', 422, "invalid_request"),
    (b'[' * 80 + b']' * 80, 422, "invalid_request"),
])
def test_strict_json_is_not_normalized_before_version_checks(desktop_http, content, status, code):
    c = desktop_http
    unchanged(c, lambda: request(c.desktop_app, "POST", DESKTOP_ROUTE, content=content,
                                 headers=[("Content-Type", "application/json")], request_key="json"), status, code)


@pytest.mark.parametrize("case,status,code", [
    ("missing_key", 422, "invalid_request"), ("duplicate_key", 422, "invalid_request"),
    ("duplicate_type", 422, "invalid_request"), ("encoding", 415, "unsupported_media_type"),
    ("length", 422, "invalid_request"), ("query", 422, "invalid_request"),
])
def test_header_and_query_syntax_precedes_body_version(desktop_http, case, status, code):
    c = desktop_http
    headers = {"duplicate_key": [("Idempotency-Key", "second")],
               "duplicate_type": [("Content-Type", "application/json"), ("Content-Type", "application/json")],
               "encoding": [("Content-Encoding", "gzip")], "length": [("Content-Length", "wrong")]}.get(case, [])
    path = DESKTOP_ROUTE + ("?unknown=1" if case == "query" else "")
    unchanged(c, lambda: request(c.desktop_app, "POST", path, body={"contract_version": "9.9.9"},
                                 headers=headers, request_key=None if case == "missing_key" else "syntax"), status, code)


def test_raw_body_limit_stops_stream_before_decode_and_includes_whitespace(desktop_gap_http):
    c = desktop_gap_http
    consumed = []

    def chunks():
        for index in range(7):
            consumed.append(index)
            yield b" " * (1024 * 1024)

    unchanged(c, lambda: request(c.desktop_app, "POST", DESKTOP_ROUTE, chunks=chunks(), request_key="limit",
                                 headers=[("Content-Type", "application/json")]), 413, "payload_too_large")
    assert consumed == list(range(5))
    encoded = wire.canonical_request("DesktopFrameBatchRequest", c.desktop_envelope)
    padded = encoded + b" " * (wire.MAX_METADATA_BODY_BYTES - len(encoded))
    success(c, request(c.desktop_app, "POST", DESKTOP_ROUTE, content=padded, request_key="limit",
                       headers=[("Content-Type", "Application/JSON; Charset=UTF-8")]))


@pytest.mark.parametrize("variant", ["gap", "frame"])
@pytest.mark.parametrize("fence,status", [("stop", 409), ("withdraw", 403), ("source_revoke", 404),
                                         ("delete", 404), ("generation", 403), ("token_revoke", 401)])
def test_cached_gap_or_frame_ack_never_bypasses_current_fences(desktop_http, variant, fence, status):
    c = desktop_http
    if variant == "gap":
        c.desktop_envelope = {**c.desktop_envelope, "batch": {**c.batch, "records": [gap(c)]}, "frames": []}
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
    else:
        c.auth.revoke("control-token")
    code = {401: "unauthenticated", 403: "forbidden", 404: "not_found", 409: "capture_stopped"}[status]
    unchanged(c, lambda: submit(c), status, code)


def test_gap_historical_upload_needs_sealed_stop_boundary_and_never_restarts(desktop_gap_http):
    c = desktop_gap_http
    apply(c, command(c))
    historical = deepcopy(c.desktop_envelope)
    historical["batch"]["delivery_mode"] = "historical"
    unchanged(c, lambda: submit(c, envelope=historical), 409, "capture_stopped")
    stop_fact(c, 1)
    stopped = apply(c, command(c, "seal_stop", revision=2, boundary=1), "seal")
    ack = success(c, submit(c, envelope=historical), historical)
    assert ack["acknowledged"][0]["artifacts"] == []
    assert success(c, submit(c, envelope=historical), historical) == ack
    assert c.registry.read(USER, c.batch["stream_id"]) == stopped
    assert documents(c)[("session", c.batch["session_id"])]["live_capture"] is False
    later = {**historical, "batch": {**historical["batch"], "records": [gap(c, record_id="later-gap", sequence=2)]}}
    unchanged(c, lambda: submit(c, envelope=later, request_key="outside-stop"), 409, "capture_stopped")
    unchanged(c, lambda: submit(c, request_key="live-after-stop"), 409, "capture_stopped")


def test_frameless_gap_cannot_borrow_another_registered_stream_source(desktop_gap_http):
    c = desktop_gap_http
    other = registration(c, "other-screen-stream")
    start(c, other, producer="second-screen", request_key="other-screen-start")
    source = c.registry.register_display_source(USER, "other-screen-source", other["stream_id"])
    envelope = deepcopy(c.desktop_envelope)
    envelope["batch"]["records"][0]["source"] = {name: source[name] for name in ("user_id", "source_id", "source_version")}
    wire.validate_frame_batch(envelope, user_id=USER)
    unchanged(c, lambda: submit(c, envelope=envelope), 422, "invalid_request")


@pytest.mark.parametrize("claim", ["artifact", "operation", "clock", "observed"])
def test_frameless_gap_rejects_invented_observation_or_original(desktop_gap_http, claim):
    c = desktop_gap_http
    envelope = deepcopy(c.desktop_envelope)
    item = envelope["batch"]["records"][0]
    if claim == "artifact":
        item["artifacts"] = [c.ref]
    elif claim == "operation":
        item["evidence"] = deepcopy(c.batch["records"][0]["evidence"])
    elif claim == "clock":
        item["clock"] = {"domain_id": "invented", "elapsed_ms": 0, "uncertainty_ms": None}
    else:
        item["evidence"]["coverage"] = "observed_samples"
    unchanged(c, lambda: submit(c, envelope=envelope), 422, "invalid_request")


def test_gap_only_remains_unavailable_through_old_internal_desktop_entry(desktop_gap_http):
    c = desktop_gap_http
    before = documents(c)
    with pytest.raises(DomainError) as exc:
        c.registry.ingest_desktop_frames(USER, c.desktop_envelope["batch"], [], "not-http")
    assert (exc.value.status, exc.value.code) == (422, "invalid_request")
    assert documents(c) == before
    success(c, submit(c))


@pytest.mark.parametrize("corruption", ["frame_missing", "original_missing", "ink_bytes", "version", "slot", "cache_sources"])
def test_http_exact_replay_refuses_lost_or_corrupt_committed_facts(desktop_http, corruption):
    c = desktop_http
    success(c, submit(c))
    rows = c.store._documents[USER]
    if corruption == "frame_missing":
        del rows[("raw_capture_frame", c.desktop_frame["frame_id"])]
    elif corruption == "original_missing":
        del rows[("artifact", c.ref["artifact_id"])]
    elif corruption == "ink_bytes":
        rows[("artifact", c.ink_ref["artifact_id"])]["data_base64"] = "UFJJVkFURQ=="
    elif corruption == "version":
        rows[("raw_capture_frame", c.desktop_frame["frame_id"])]["contract_version"] = "9.9.9"
    elif corruption == "slot":
        rows[("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1))]["record_id"] = "corrupt-slot"
    else:
        rows[("capture_replay", key("POST", DESKTOP_ROUTE, "desktop-http"))]["source_ids"] = []
    unchanged(c, lambda: submit(c), 503, "unavailable")


@pytest.mark.parametrize("failure,variant", [("capture_record", "gap"), ("raw_capture_frame", "frame"),
                                            ("capture_replay", "frame"), ("commit", "gap")])
@pytest.mark.parametrize("cancelled", [False, True])
def test_failed_transaction_has_no_partial_ack_or_gap_and_clean_retry(desktop_http, monkeypatch, failure, variant, cancelled):
    c = desktop_http
    if variant == "gap":
        c.desktop_envelope = {**c.desktop_envelope, "batch": {**c.batch, "records": [gap(c)]}, "frames": []}
    before = documents(c)
    original_put, transaction = _MemoryTransaction.put, c.store.transaction
    raised = []

    def fail():
        raised.append(failure)
        raise (CancelledError if cancelled else RuntimeError)("PRIVATE synthetic desktop failure")

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == failure:
            fail()

    @contextmanager
    def fail_commit(actor):
        with transaction(actor) as tx:
            yield tx
            fail()

    with monkeypatch.context() as patch:
        if failure == "commit":
            patch.setattr(c.store, "transaction", fail_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", put)
        response = submit(c)
        if cancelled:
            assert response.status_code >= 500
            assert "acknowledged" not in response.text and "PRIVATE" not in response.text
        else:
            error(response, 503, "unavailable")
    assert raised == [failure]
    assert documents(c) == before
    assert success(c, submit(c))["acknowledged"][0]["disposition"] == "accepted"


def test_token_expiry_under_actor_lock_precedes_cached_gap_ack(desktop_gap_http, monkeypatch):
    c = desktop_gap_http
    success(c, submit(c))
    before = documents(c)
    transaction = c.store.transaction

    @contextmanager
    def expire(actor):
        with transaction(actor) as tx:
            c.instant[0] += timedelta(hours=2)
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", expire)
        error(submit(c), 401, "unauthenticated")
    assert documents(c) == before


def test_retained_gap_frame_and_gap_ancestors_continue_through_http(desktop_http):
    c = desktop_http
    missing = gap(c)
    initial = {**c.desktop_envelope, "batch": {**c.batch, "records": [missing]}, "frames": []}
    success(c, submit(c, envelope=initial), initial)
    parent_row = deepcopy(documents(c)[("capture_record", missing["record_id"])])
    child, frame = additional(c, parents=[missing["record_id"]])
    observed = {**c.desktop_envelope, "batch": {**c.batch, "records": [child]}, "frames": [frame]}
    success(c, submit(c, envelope=observed, request_key="frame-after-gap"), observed)
    later = gap(c, record_id="gap-after-frame", sequence=3, parents=[child["record_id"]])
    final = {**c.desktop_envelope, "batch": {**c.batch, "records": [later]}, "frames": []}
    ack = success(c, submit(c, envelope=final, request_key="gap-after-frame"), final)
    assert ack["acknowledged"][0]["artifacts"] == []
    before = documents(c)
    assert before[("capture_record", missing["record_id"])] == parent_row
    assert before[("raw_capture_frame", frame["frame_id"])] == frame
    assert success(c, submit(c, envelope=final, request_key="gap-after-frame"), final) == ack
    assert documents(c) == before


def test_legacy_frame_id_collision_is_closed_409_without_rebinding(desktop_http):
    c = desktop_http
    envelope = deepcopy(c.desktop_envelope)
    retained_id = c.core["Frame"]["frame_id"]
    envelope["frames"][0]["frame_id"] = retained_id
    envelope["batch"]["records"][0]["frame_id"] = retained_id
    unchanged(c, lambda: submit(c, envelope=envelope), 409, "record_conflict")


@pytest.mark.parametrize("method,path,version", [
    ("GET", DESKTOP_ROUTE, "0.2.8"), ("POST", DESKTOP_ROUTE + "/", "0.2.4"),
    ("POST", "/unowned-desktop-path", "0.2.4"),
])
def test_wrong_methods_and_unowned_paths_remain_closed(desktop_http, method, path, version):
    c = desktop_http
    unchanged(c, lambda: request(c.desktop_app, method, path, body=c.desktop_envelope, request_key="wrong-path"),
              404, "not_found", version)
