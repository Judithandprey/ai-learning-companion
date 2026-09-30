"""Composition boundary checks; no database, listener or device is started."""

import asyncio
from concurrent.futures import CancelledError as FutureCancelledError
from datetime import timedelta

import httpx
import pytest

from services.api.capture_app import create_capture_app
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.control_app import create_control_app
from services.api.ingress_app import RAW_ROUTE, create_ingress_app
from services.api.storage import MemoryStore
from services.api.tests.test_control_http import NOW, request


@pytest.mark.parametrize("method,path,version", [
    ("GET", "/v2/process/streams", "0.2.1"),
    ("PUT", "/v2/process/streams/x", "0.2.1"),
    ("POST", "/v2/process/streams/x:control", "0.2.1"),
    ("GET", "/v2/process/streams/x:control", "0.2.1"),
    ("POST", "/v2/process/streams/x:control:control", "0.2.1"),
    ("GET", "/v2/process/display-sources/x", "0.2.4"),
    ("POST", "/v2/process/originals/x", "0.2.4"),
    ("DELETE", "/v2/process/sources/x/versions/1/originals/y", "0.2.4"),
    ("GET", "/v2/process/frames:batch", "0.2.4"),
    ("GET", RAW_ROUTE, "0.2.6"),
    ("OPTIONS", RAW_ROUTE, "0.2.6"),
    ("POST", RAW_ROUTE + "?unexpected=yes", "0.2.6"),
    ("POST", RAW_ROUTE + "/", "0.2.4"),
    ("POST", "/v2/process/streams/", "0.2.4"),
    ("GET", "/v2/process/streams/x/unknown", "0.2.4"),
    ("GET", "/docs", "0.2.4"),
    ("GET", "/", "0.2.4"),
])
def test_composed_dispatch_preserves_child_closed_refusals(method, path, version):
    composed = create_capture_app(enable_raw_ingress=True)
    child = (create_control_app() if version == "0.2.1"
             else create_ingress_app(enable_raw_ingress=True))
    expected = request(child, method, path)
    actual = request(composed, method, path)
    assert actual.status_code == expected.status_code
    assert actual.content == expected.content
    assert actual.json()["contract_version"] == version
    assert dict(actual.headers) == dict(expected.headers)
    assert "location" not in actual.headers


@pytest.mark.parametrize("method", ["GET", "HEAD", "POST", "PUT", "OPTIONS", "ARBITRARY"])
def test_composed_app_exposes_no_partial_or_overwritten_schema(method):
    app = create_capture_app(enable_raw_ingress=True)
    response = request(app, method, "/openapi.json")
    assert response.status_code == 404
    if method != "HEAD":
        assert response.json() == {"contract_version": "0.2.4", "error": "not_found", "retryable": False}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert not hasattr(app, "openapi")
    # Suppression is local to composition; released factories are untouched.
    assert request(create_control_app(), "GET", "/openapi.json").status_code == 200
    assert request(create_ingress_app(), "GET", "/openapi.json").status_code == 200


class UnavailableAuthenticator:
    def __init__(self, failure):
        self.failure = failure

    def authenticate(self, token, now):
        raise self.failure("synthetic private failure")


@pytest.mark.parametrize("path,version", [
    ("/v2/process/streams", "0.2.1"),
    ("/v2/process/frames:batch", "0.2.4"),
    (RAW_ROUTE, "0.2.6"),
])
@pytest.mark.parametrize("failure", [RuntimeError, FutureCancelledError, asyncio.CancelledError])
def test_child_failure_and_cancellation_semantics_survive_composition(path, version, failure):
    store = MemoryStore()
    options = dict(capabilities=frozenset())
    auth = UnavailableAuthenticator(failure)
    composed = create_capture_app(store, auth, enable_raw_ingress=True, **options)
    child = (create_control_app(store, auth, **options) if version == "0.2.1"
             else create_ingress_app(store, auth, enable_raw_ingress=True, **options))

    async def call(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="https://synthetic.test") as client:
            return await client.post(path, headers={"Authorization": "Bearer test-token"})

    # Raising asyncio cancellation inside the child's synchronous authenticator
    # already becomes a closed 503 at its task-group boundary. Real outer-request
    # cancellation is exercised separately below, not equated to this injection.
    propagates = failure is FutureCancelledError and version == "0.2.6"
    for app in (child, composed):
        if propagates:
            with pytest.raises(failure):
                asyncio.run(call(app))
        else:
            result = asyncio.run(call(app))
            assert result.status_code == 503
            assert result.json() == {"contract_version": version, "error": "unavailable", "retryable": True}
            assert "synthetic private failure" not in result.text
    assert store._documents == {}


def test_request_task_cancellation_during_body_read_is_not_swallowed():
    async def run():
        store = MemoryStore()
        auth = LocalTestAuthenticator({"token": Principal(
            "actor", frozenset({"process:capture"}), NOW + timedelta(hours=1))})
        options = dict(capabilities=frozenset({"process.raw-ingress.v0.2.6", "process.capture.v0.2"}),
                       clock=lambda: NOW, enable_raw_ingress=True)
        for app in (create_ingress_app(store, auth, **options), create_capture_app(store, auth, **options)):
            reading = asyncio.Event()
            block = asyncio.Event()

            async def content():
                yield b'{'
                reading.set()
                await block.wait()
                yield b'}'

            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                         base_url="https://synthetic.test") as client:
                task = asyncio.create_task(client.post(RAW_ROUTE, content=content(), headers={
                    "Authorization": "Bearer token", "Content-Type": "application/json",
                    "Idempotency-Key": "cancelled-body"}))
                try:
                    await asyncio.wait_for(reading.wait(), timeout=2)
                    task.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await task
                finally:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            assert store._documents == {}

    asyncio.run(run())


def test_construction_only_passes_trusted_objects_and_does_not_read_authority():
    class NoStoreAccess:
        def transaction(self, *args):
            raise AssertionError("Factory must not access or provision state")

    def no_clock_or_fact(*args):
        raise AssertionError("Factory must not resolve current authority")

    store = NoStoreAccess()
    auth = UnavailableAuthenticator(AssertionError)
    app = create_capture_app(store, auth, capabilities=frozenset(),
                             clock=no_clock_or_fact, stop_fact_resolver=no_clock_or_fact)
    assert app.state.store is store
    assert app.state.authenticator is auth
    assert app.state.paid_executor_enabled is False
    assert app.router.redirect_slashes is False
    result = request(app, "POST", RAW_ROUTE)
    assert result.status_code == 404
    assert result.json()["contract_version"] == "0.2.4"
