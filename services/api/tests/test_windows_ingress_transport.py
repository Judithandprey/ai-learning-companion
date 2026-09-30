"""Strict opt-in Windows HTTP transport over synthetic in-process fixtures."""

import asyncio
from concurrent.futures import CancelledError
from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path

import httpx
import pytest
from starlette.applications import Starlette
from starlette.routing import Mount

from packages.contracts import desktop_capture_ingress, raw_capture_ingress
from packages.contracts import windows_capture_ingress as wire
from services.api.capture_app import create_capture_app
from services.api.control import ControlRegistry
from services.api.errors import DomainError
from services.api.ingress_app import DESKTOP_ROUTE, RAW_ROUTE, WINDOWS_ROUTE, _decode, create_ingress_app
from services.api.tests.test_control import documents, resolve_stop_fact
from services.api.tests.test_ingress_http import (
    DISPLAY, FRAMES, ORIGINALS, error as legacy_error, original_body, read_path, request,
)
from services.api.tests.test_windows_ingress_http import (
    CAPABILITIES, app, error, raw_setup, registered, setup, submit, success, unchanged,
    uploaded, windows_http, windows_setup,
)


@pytest.mark.parametrize("enabled", [None, 0, 1, "true", []])
def test_windows_flag_requires_an_explicit_boolean(enabled):
    with pytest.raises(ValueError, match="enable_windows_ingress must be a boolean"):
        create_ingress_app(enable_windows_ingress=enabled)


@pytest.mark.parametrize("enabled,raw,desktop", [
    (False, False, False), (False, True, True), (True, False, False), (True, True, True),
])
def test_windows_route_is_independent_and_default_absent(windows_http, enabled, raw, desktop):
    c = windows_http
    instance = app(c, enabled=enabled, raw=raw, desktop=desktop)
    paths = instance.openapi()["paths"]
    assert (WINDOWS_ROUTE in paths) == enabled
    assert (RAW_ROUTE in paths) == raw
    assert (DESKTOP_ROUTE in paths) == desktop
    assert WINDOWS_ROUTE not in c.app.openapi()["paths"]
    before = documents(c)
    response = request(instance, "POST", WINDOWS_ROUTE, token=None, body=c.windows_envelope)
    if enabled:
        error(response, 401, "unauthenticated")
        assert response.headers["www-authenticate"] == "Bearer"
    else:
        legacy_error(response, 404, "not_found")
    assert documents(c) == before


def test_opt_in_openapi_keeps_exact_windows_header_description(windows_http):
    c = windows_http
    root = Path(__file__).resolve().parents[3] / "packages/contracts"
    released = json.loads((root / "windows_capture_ingress/generated/openapi.json").read_text())
    legacy = json.loads((root / "capture_ingress/generated/openapi.json").read_text())
    schema = app(c, raw=True, desktop=True).openapi()
    operation = schema["paths"][WINDOWS_ROUTE]["post"]
    assert operation["parameters"] == [released["components"]["parameters"]["IdempotencyKey"]]
    assert "ordered 0.2.10 HTTP envelope" in operation["parameters"][0]["description"]
    assert operation["x-required-capabilities"] == [wire.CAPABILITY, "process.capture.v0.2"]
    assert schema["components"]["schemas"]["WindowsFrameBatchRequest"] == released["components"]["schemas"]["WindowsFrameBatchRequest"]
    assert schema["components"]["parameters"] == legacy["components"]["parameters"]
    assert c.windows_app.state.paid_executor_enabled is False


@pytest.mark.parametrize("factory", [create_ingress_app, create_capture_app], ids=["ingress", "composed"])
@pytest.mark.parametrize("depth", [0, 1, 2], ids=["root", "single-mount", "nested-mount"])
@pytest.mark.parametrize("enabled", [False, True])
def test_mounted_windows_error_version_tracks_only_the_enabled_route(windows_http, factory, depth, enabled):
    c = windows_http
    instance = factory(c.store, c.auth, capabilities=CAPABILITIES,
        stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0], enable_windows_ingress=enabled)
    prefix = ""
    if depth == 2:
        instance = Starlette(routes=[Mount("/nested", app=instance)])
        prefix = "/nested"
    if depth:
        instance = Starlette(routes=[Mount("/capture", app=instance)])
        prefix = "/capture" + prefix
    before = documents(c)
    response = request(instance, "POST", prefix + WINDOWS_ROUTE, token=None, content=b"{bad")
    if enabled:
        error(response, 401, "unauthenticated")
        response = request(instance, "POST", prefix + WINDOWS_ROUTE, request_key="mounted",
                           body={"contract_version": "9.9.9"})
        error(response, 422, "unsupported_version")
        response = request(instance, "POST", prefix + WINDOWS_ROUTE, request_key="mounted",
                           content=b"{bad", headers=[("Content-Type", "application/json")])
        error(response, 400, "invalid_json")
    else:
        legacy_error(response, 404, "not_found")
    assert documents(c) == before


@pytest.mark.parametrize("authorization", [
    None, "Basic control-token", "Bearer", "Bearer\tcontrol-token", "Bearer control-token extra",
])
def test_bearer_syntax_is_checked_before_body_consumption(windows_http, authorization):
    c, consumed = windows_http, []

    def chunks():
        consumed.append(True)
        yield b"PRIVATE malformed body"

    headers = [] if authorization is None else [("Authorization", authorization)]
    unchanged(c, lambda: request(c.windows_app, "POST", WINDOWS_ROUTE + "?invalid=1",
                                 token=None, headers=headers, chunks=chunks()), 401, "unauthenticated")
    assert consumed == []


@pytest.mark.parametrize("case", ["missing_windows", "missing_capture", "scope", "duplicate_auth", "expired"])
def test_current_authority_precedes_invalid_headers_query_and_body(windows_http, case):
    c = windows_http
    instance, token, headers = c.windows_app, "control-token", []
    status, code = 403, "capability_required"
    if case.startswith("missing_"):
        removed = wire.CAPABILITY if case == "missing_windows" else "process.capture.v0.2"
        instance = app(c, capabilities=CAPABILITIES - {removed})
    elif case == "scope":
        token, code = "write-token", "forbidden"
    elif case == "duplicate_auth":
        headers = [("Authorization", "Bearer control-token")]
        status, code = 401, "unauthenticated"
    else:
        c.instant[0] += timedelta(hours=2)
        status, code = 401, "unauthenticated"
    unchanged(c, lambda: request(instance, "POST", WINDOWS_ROUTE + "?invalid=1", token=token,
                                 headers=headers, content=b"{broken"), status, code)


def test_windows_capability_does_not_imply_original_or_registration_authority(windows_http):
    c = windows_http
    instance = app(c, capabilities=frozenset({wire.CAPABILITY, "process.capture.v0.2"}))
    success(c, request(instance, "POST", WINDOWS_ROUTE, body=c.windows_envelope,
                       token="capture-token", request_key="windows-only"))
    before = documents(c)
    for method, path, body in (("PUT", DISPLAY, c.display),
                               ("PUT", ORIGINALS + c.ref["artifact_id"], original_body(c)),
                               ("GET", read_path(c), None)):
        legacy_error(request(instance, method, path, body=body), 403, "capability_required")
    assert documents(c) == before


@pytest.mark.parametrize("target", ["outer", "batch", "first_frame", "later_frame"])
def test_explicit_unsupported_versions_precede_other_shape_failures(windows_http, target):
    c = windows_http
    envelope = deepcopy(c.windows_envelope)
    envelope["frames"].append({"contract_version": "0.2.9"})
    node = {"outer": envelope, "batch": envelope["batch"],
            "first_frame": envelope["frames"][0], "later_frame": envelope["frames"][1]}[target]
    node["contract_version"] = "9.9.9"
    envelope["unexpected"] = True
    unchanged(c, lambda: submit(c, envelope=envelope), 422, "unsupported_version")


@pytest.mark.parametrize("target", ["outer", "batch", "frame"])
def test_missing_versions_are_shape_errors(windows_http, target):
    c = windows_http
    envelope = deepcopy(c.windows_envelope)
    node = {"outer": envelope, "batch": envelope["batch"], "frame": envelope["frames"][0]}[target]
    del node["contract_version"]
    unchanged(c, lambda: submit(c, envelope=envelope), 422, "invalid_request")


@pytest.mark.parametrize("content,status,code", [
    (b'{"contract_version":"9.9.9","contract_version":"0.2.10"}', 400, "invalid_json"),
    (b'{"contract_version":"9.9.9","batch":{"x":1,"x":2}}', 400, "invalid_json"),
    (b'{"contract_version":"9.9.9","x":NaN}', 400, "invalid_json"),
    (b'{"contract_version":"9.9.9","x":Infinity}', 400, "invalid_json"),
    (b'{"contract_version":"9.9.9","x":1e999}', 400, "invalid_json"),
    (b'{"contract_version":"9.9.9",', 400, "invalid_json"),
    (b'\xff', 400, "invalid_json"), (b'{"x":"\\ud800"}', 400, "invalid_json"),
    (b'{"x":9007199254740992}', 422, "invalid_request"),
    (b'[' * 80 + b']' * 80, 422, "invalid_request"),
])
def test_strict_json_errors_precede_version_and_shape_errors(windows_http, content, status, code):
    c = windows_http
    unchanged(c, lambda: request(c.windows_app, "POST", WINDOWS_ROUTE, content=content,
                                 headers=[("Content-Type", "application/json")], request_key="json"), status, code)


@pytest.mark.parametrize("case,status,code", [
    ("missing_key", 422, "invalid_request"), ("duplicate_key", 422, "invalid_request"),
    ("invalid_key", 422, "invalid_request"), ("query", 422, "invalid_request"),
    ("missing_type", 415, "unsupported_media_type"), ("wrong_type", 415, "unsupported_media_type"),
    ("extra_type_parameter", 415, "unsupported_media_type"), ("duplicate_type", 422, "invalid_request"),
    ("encoding", 415, "unsupported_media_type"), ("duplicate_encoding", 415, "unsupported_media_type"),
    ("duplicate_length", 422, "invalid_request"), ("invalid_length", 422, "invalid_request"),
    ("negative_length", 422, "invalid_request"), ("transfer_length", 422, "invalid_request"),
    ("mismatched_length", 422, "invalid_request"), ("huge_length", 413, "payload_too_large"),
])
def test_header_and_query_validation_precedes_body_version(windows_http, case, status, code):
    c = windows_http
    headers = {
        "duplicate_key": [("Idempotency-Key", "second")],
        "wrong_type": [("Content-Type", "text/plain")],
        "extra_type_parameter": [("Content-Type", "application/json; other=value")],
        "duplicate_type": [("Content-Type", "application/json"), ("Content-Type", "application/json")],
        "encoding": [("Content-Encoding", "gzip")],
        "duplicate_encoding": [("Content-Encoding", "identity"), ("Content-Encoding", "identity")],
        "duplicate_length": [("Content-Length", "1"), ("Content-Length", "1")],
        "invalid_length": [("Content-Length", "not-decimal")],
        "negative_length": [("Content-Length", "-1")],
        "transfer_length": [("Content-Length", "1"), ("Transfer-Encoding", "chunked")],
        "mismatched_length": [("Content-Length", "1")],
        "huge_length": [("Content-Length", "9" * 5000)],
    }.get(case, [])
    if case not in {"missing_type", "wrong_type", "extra_type_parameter", "duplicate_type"}:
        headers.append(("Content-Type", "application/json"))
    request_key = None if case == "missing_key" else " bad key " if case == "invalid_key" else "syntax"
    path = WINDOWS_ROUTE + ("?unknown=1" if case == "query" else "")
    unchanged(c, lambda: request(c.windows_app, "POST", path, content=b'{"contract_version":"9.9.9"}',
                                 headers=headers, request_key=request_key), status, code)


def test_raw_size_limit_stops_stream_before_decode_and_accepts_exact_limit(windows_http):
    c, consumed = windows_http, []

    def chunks():
        for index in range(7):
            consumed.append(index)
            yield b" " * (1024 * 1024)

    unchanged(c, lambda: request(c.windows_app, "POST", WINDOWS_ROUTE, chunks=chunks(), request_key="limit",
                                 headers=[("Content-Type", "application/json")]), 413, "payload_too_large")
    assert consumed == list(range(5))
    encoded = wire.canonical_request("WindowsFrameBatchRequest", c.windows_envelope)
    padded = encoded + b" " * (wire.MAX_METADATA_BODY_BYTES - len(encoded))
    success(c, request(c.windows_app, "POST", WINDOWS_ROUTE, content=padded, request_key="limit",
                       headers=[("Content-Type", "Application/JSON; Charset=UTF-8"),
                                ("Content-Encoding", "IDENTITY")]))


def test_canonical_size_failure_uses_shape_error_not_raw_oversize(windows_http, monkeypatch):
    envelope = deepcopy(windows_http.windows_envelope)
    envelope["frames"][0]["profile"]["sample"]["change_from_previous_sample"] = 1e-7
    canonical = wire.canonical_request("WindowsFrameBatchRequest", envelope)
    encoded = canonical.replace(b"1e-07", b"1e-7")
    assert len(encoded) < len(canonical)
    monkeypatch.setattr(wire, "MAX_METADATA_BODY_BYTES", len(encoded))
    with pytest.raises(DomainError) as caught:
        _decode("WindowsFrameBatchRequest", encoded, contract=wire)
    assert (caught.value.status, caught.value.code) == (422, "invalid_request")


@pytest.mark.parametrize("route,version", [(FRAMES, "0.2.4"), (RAW_ROUTE, "0.2.6"), (DESKTOP_ROUTE, "0.2.8")])
def test_old_routes_remain_closed_to_windows_even_when_all_enabled(windows_http, route, version):
    c = windows_http
    caps = CAPABILITIES | {raw_capture_ingress.CAPABILITY, desktop_capture_ingress.CAPABILITY}
    instance = app(c, raw=True, desktop=True, capabilities=caps)
    before = documents(c)
    for envelope in (c.windows_envelope, {**c.windows_envelope, "contract_version": version}):
        response = request(instance, "POST", route, body=envelope, request_key="no-downgrade")
        assert response.status_code == 422
        assert response.json() == {"contract_version": version,
            "error": "invalid_request" if version == "0.2.4" and envelope["contract_version"] == version else "unsupported_version",
            "retryable": False}
    assert documents(c) == before


@pytest.mark.parametrize("method,path,version", [
    ("GET", WINDOWS_ROUTE, "0.2.10"), ("POST", WINDOWS_ROUTE + "/", "0.2.4"),
    ("POST", "/unowned-windows-path", "0.2.4"),
])
def test_wrong_method_and_unowned_path_use_closed_routing_errors(windows_http, method, path, version):
    c = windows_http
    before = documents(c)
    response = request(c.windows_app, method, path, body=c.windows_envelope, request_key="routing")
    assert response.status_code == 404
    assert response.json() == {"contract_version": version, "error": "not_found", "retryable": False}
    assert documents(c) == before


@pytest.mark.parametrize("mounted", [False, True])
def test_windows_cancellation_propagates_without_a_wire_success(windows_http, monkeypatch, mounted):
    c = windows_http
    before = documents(c)
    failure = CancelledError("PRIVATE cancelled request")

    def cancelled(*args, **kwargs):
        raise failure

    monkeypatch.setattr(ControlRegistry, "ingest_windows_frame_request", cancelled)
    instance = Starlette(routes=[Mount("/capture", app=c.windows_app)]) if mounted else c.windows_app
    path = ("/capture" if mounted else "") + WINDOWS_ROUTE

    async def run():
        transport = httpx.ASGITransport(app=instance, raise_app_exceptions=True)
        async with httpx.AsyncClient(transport=transport, base_url="http://windows.test") as client:
            return await client.post(path, json=c.windows_envelope,
                headers={"Authorization": "Bearer capture-token", "Idempotency-Key": "cancelled"})

    with pytest.raises(CancelledError) as caught:
        asyncio.run(run())
    assert caught.value is failure
    assert documents(c) == before


@pytest.mark.parametrize("factory", [create_ingress_app, create_capture_app], ids=["ingress", "composed"])
def test_windows_request_task_cancellation_during_body_read(windows_http, factory):
    c = windows_http
    instance = factory(c.store, c.auth, capabilities=CAPABILITIES,
        stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0], enable_windows_ingress=True)
    before = documents(c)

    async def run():
        reading, blocked = asyncio.Event(), asyncio.Event()

        async def content():
            yield b"{"
            reading.set()
            await blocked.wait()
            yield b"}"

        transport = httpx.ASGITransport(app=instance, raise_app_exceptions=True)
        async with httpx.AsyncClient(transport=transport, base_url="http://windows.test") as client:
            task = asyncio.create_task(client.post(WINDOWS_ROUTE, content=content(), headers={
                "Authorization": "Bearer capture-token", "Content-Type": "application/json",
                "Idempotency-Key": "cancelled-body"}))
            try:
                await asyncio.wait_for(reading.wait(), timeout=2)
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
            finally:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())
    assert documents(c) == before
