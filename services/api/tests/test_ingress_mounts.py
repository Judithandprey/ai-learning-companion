"""Mounted ingress contract selection and cancellation over real ASGI handlers.

Synthetic stored originals and MemoryStore only; no listener or native capture.
"""

import asyncio
from concurrent.futures import CancelledError
from copy import deepcopy

import httpx
import pytest
from starlette.applications import Starlette
from starlette.routing import Mount

from services.api.storage import _MemoryTransaction
from services.api.tests.test_control import documents
from services.api.tests.test_desktop_frame_ingress import desktop_setup
from services.api.tests.test_desktop_ingress_http import (
    DESKTOP_ROUTE, desktop_http, error as desktop_error, success as desktop_success,
)
from services.api.tests.test_ingress_http import registered, request, setup, uploaded
from services.api.tests.test_raw_frame_ingress import raw_setup
from services.api.tests.test_raw_ingress_http import (
    RAW_FRAMES, raw_http, error as raw_error, success as raw_success,
)


@pytest.fixture(params=["raw", "desktop"])
def family(request):
    if request.param == "raw":
        c = request.getfixturevalue("raw_http")
        return c, c.raw_app, RAW_FRAMES, c.raw_envelope, raw_error, raw_success
    c = request.getfixturevalue("desktop_http")
    return c, c.desktop_app, DESKTOP_ROUTE, c.desktop_envelope, desktop_error, desktop_success


@pytest.fixture(params=[(), ("/capture",), ("/outer", "/inner")], ids=["root", "single", "nested"])
def mounted(request, family):
    c, app, route, envelope, error, success = family
    for prefix in reversed(request.param):
        app = Starlette(routes=[Mount(prefix, app=app)])
    return c, app, "".join(request.param) + route, envelope, error, success


@pytest.mark.parametrize("case,status,code", [
    ("auth", 401, "unauthenticated"), ("json", 400, "invalid_json"),
    ("version", 422, "unsupported_version"), ("shape", 422, "invalid_request"),
    ("method", 404, "not_found"),
])
def test_mounts_preserve_closed_contract_errors_and_precedence(mounted, case, status, code):
    c, app, path, envelope, error, _ = mounted
    before = documents(c)
    options = {"body": deepcopy(envelope), "request_key": "mounted-errors"}
    method = "POST"
    if case in {"auth", "json"}:
        options = {"content": b'{"contract_version":', "headers": [("Content-Type", "application/json")],
                   "request_key": "mounted-errors"}
        if case == "auth":
            options["token"] = None
    elif case == "version":
        options["body"]["frames"][0]["contract_version"] = "9.9.9"
        options["body"]["unexpected"] = True
    elif case == "shape":
        options["body"]["unexpected"] = True
    else:
        method = "GET"
    error(request(app, method, path, **options), status, code)
    assert documents(c) == before


def test_mounts_keep_unknown_service_failures_content_free(mounted, monkeypatch):
    c, app, path, envelope, error, _ = mounted
    before = documents(c)

    def unavailable(*args):
        raise RuntimeError("PRIVATE synthetic authenticator failure")

    monkeypatch.setattr(c.auth, "authenticate", unavailable)
    response = request(app, "POST", path, body=envelope, request_key="unavailable")
    error(response, 503, "unavailable")
    assert "PRIVATE" not in response.text and documents(c) == before


def test_mounts_propagate_application_cancellation_and_rollback_before_transport_500(mounted, monkeypatch):
    c, app, path, envelope, _, success = mounted
    before, original_put = documents(c), _MemoryTransaction.put
    cancellation = CancelledError("PRIVATE synthetic commit cancellation")
    attempts = []

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            attempts.append(True)
            raise cancellation

    async def propagate():
        # Observe the application exception itself. A transport-generated 500
        # with raise_app_exceptions=False would not prove propagation.
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
        async with httpx.AsyncClient(transport=transport, base_url="http://mounted.test") as client:
            return await client.post(path, json=envelope, headers={
                "Authorization": "Bearer capture-token", "Idempotency-Key": "mounted-cancel",
            })

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", put)
        published = []
        with pytest.raises(CancelledError) as caught:
            published.append(asyncio.run(propagate()))
        assert caught.value is cancellation and not published
        assert attempts == [True] and documents(c) == before

        # Separately show what a client suppressing app exceptions receives.
        response = request(app, "POST", path, body=envelope, request_key="mounted-cancel")
        assert response.status_code == 500
        assert "acknowledged" not in response.text and "PRIVATE" not in response.text
        assert attempts == [True, True] and documents(c) == before

    accepted = success(c, request(app, "POST", path, body=envelope, request_key="mounted-cancel"))
    assert accepted["acknowledged"][0]["disposition"] == "accepted"
