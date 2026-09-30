"""Independent in-process transport review; no listener/provider/native calls."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import pytest
from starlette.applications import Starlette
from starlette.routing import Mount

from services.api.app import create_app
from services.api.capture_app import create_capture_app
from services.api.ingress_app import create_ingress_app, DESKTOP_ROUTE, RAW_ROUTE
from services.api.tests.test_desktop_ingress_http import (
    CAPABILITIES, desktop_http, desktop_setup, raw_setup, setup, registered,
    uploaded, request, error, documents,
)


@pytest.mark.parametrize("factory", [create_ingress_app, create_capture_app])
@pytest.mark.parametrize("flag", [None, 1, "true"])
def test_truthy_or_omitted_type_is_not_opt_in(factory, flag):
    with pytest.raises(ValueError, match="enable_desktop_ingress must be a boolean"):
        factory(enable_desktop_ingress=flag)


@pytest.mark.parametrize("raw", [False, True])
@pytest.mark.parametrize("desktop", [False, True])
def test_openapi_merged_definitions_match_each_released_operation(raw, desktop):
    root = Path(__file__).resolve().parents[3] / "packages/contracts"
    legacy = json.loads((root / "capture_ingress/generated/openapi.json").read_text())
    app = create_ingress_app(enable_raw_ingress=raw, enable_desktop_ingress=desktop)
    schema = app.openapi()
    if not raw and not desktop:
        assert schema == legacy
    for selected, family, route in [(raw, "raw_capture_ingress", RAW_ROUTE),
                                    (desktop, "desktop_capture_ingress", DESKTOP_ROUTE)]:
        assert (route in schema["paths"]) is selected
        if not selected:
            continue
        original = json.loads((root / family / "generated/openapi.json").read_text())
        for name, value in original["components"]["schemas"].items():
            assert schema["components"]["schemas"][name] == value, name
        operation = schema["paths"][route]["post"]
        assert operation.get("security", schema["security"]) == original["paths"][route]["post"].get("security", original["security"])
        assert operation["requestBody"] == original["paths"][route]["post"]["requestBody"]
        assert operation["responses"] == original["paths"][route]["post"]["responses"]
        if desktop and route == DESKTOP_ROUTE:
            assert operation["parameters"] == [original["components"]["parameters"]["IdempotencyKey"]]


def test_factories_supply_neither_default_identity_nor_default_activation():
    for factory in (create_ingress_app, create_capture_app):
        error(request(factory(), "POST", DESKTOP_ROUTE), 404, "not_found", "0.2.4")
        error(request(factory(enable_desktop_ingress=True), "POST", DESKTOP_ROUTE,
                      token="control-token", request_key="synthetic"), 503, "unavailable")
    assert request(create_app(), "POST", DESKTOP_ROUTE).status_code == 404


@pytest.mark.parametrize("mounted", [False, True])
@pytest.mark.parametrize("extra,status,code", [
    ([("Content-Type", "application/json; charset=ascii")], 415, "unsupported_media_type"),
    ([("Content-Type", "application/json; another=1")], 415, "unsupported_media_type"),
    ([("Content-Encoding", "identity"), ("Content-Encoding", "identity")], 415, "unsupported_media_type"),
    ([("Content-Length", "2"), ("Content-Length", "2")], 422, "invalid_request"),
    ([("Content-Length", "2"), ("Transfer-Encoding", "chunked")], 422, "invalid_request"),
    ([("Content-Length", "1")], 422, "invalid_request"),
    ([("Content-Length", "-2")], 422, "invalid_request"),
    ([("Content-Length", "4194305")], 413, "payload_too_large"),
    ([("Idempotency-Key", "other")], 422, "invalid_request"),
])
def test_transport_negative_matrix_desktop_error_family(desktop_http, mounted, extra, status, code):
    c = desktop_http
    app = c.desktop_app
    prefix = "/mounted" if mounted else ""
    if mounted:
        app = Starlette(routes=[Mount(prefix, app=app)])
    headers = list(extra)
    if not any(k.lower() == "content-type" for k, _ in headers):
        headers.append(("Content-Type", "application/json"))
    before = documents(c)
    error(request(app, "POST", prefix + DESKTOP_ROUTE, content=b"{}", headers=headers,
                  request_key="transport"), status, code)
    assert documents(c) == before


@pytest.mark.parametrize("mounted", [False, True])
def test_authentication_refusal_consumes_no_request_body(desktop_http, mounted):
    c = desktop_http
    prefix = "/mounted" if mounted else ""
    app = Starlette(routes=[Mount(prefix, app=c.desktop_app)]) if mounted else c.desktop_app
    consumed = []

    def body():
        consumed.append(True)
        yield b"private malformed content"

    error(request(app, "POST", prefix + DESKTOP_ROUTE + "?bad=1", token=None,
                  chunks=body(), headers=[("Content-Type", "text/plain")]), 401, "unauthenticated")
    assert consumed == []


@pytest.mark.parametrize("mounted", [False, True])
def test_all_default_composed_control_and_ingress_paths_stay_separate(desktop_http, mounted):
    c = desktop_http
    app = create_capture_app(c.store, c.auth, capabilities=CAPABILITIES,
                             clock=lambda: c.instant[0], enable_desktop_ingress=True)
    prefix = "/nested/capture" if mounted else ""
    if mounted:
        app = Starlette(routes=[Mount("/nested", app=Starlette(routes=[Mount("/capture", app=app)]))])
    for route, version in [(DESKTOP_ROUTE, "0.2.8"), ("/v2/process/streams", "0.2.1"),
                           ("/v2/process/frames:batch", "0.2.4")]:
        response = request(app, "POST", prefix + route, token=None)
        assert response.status_code == 401
        assert response.json()["contract_version"] == version
    assert request(app, "GET", prefix + "/openapi.json").status_code == 404
