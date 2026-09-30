"""Explicit MacOS runtime over pristine MemoryStore and in-process HTTP.

Synthetic consent/producer facts and audited Swift PNGs; no listener, database, native
capture, provider, credential persistence or device-acceptance claim.
"""

import base64
from copy import deepcopy
from itertools import product

import pytest

from packages.contracts import macos_capture_ingress as wire
from services.api.capture_app import create_capture_app
from services.api.capture_runtime import create_local_capture_runtime
from services.api.errors import DomainError
from services.api.ingress_app import WINDOWS_ROUTE
from services.api.storage import MemoryStore
from services.api.tests.test_capture_app import (
    COLLECTION, ORIGINALS, RAW_FRAMES, control_error, ingress_error, ingress_success,
    original_body, original_path, request, state,
)
from services.api.tests.test_capture_runtime import (
    TOKEN, options, register, stopped, uploaded as upload_raw_and_ink,
)
from services.api.tests.test_desktop_ingress_http import DESKTOP_ROUTE, error as route_error, gap
from services.api.tests.macos_fixtures import (
    raw_setup, registered, setup, uploaded, macos_setup,
)
from services.api.tests.test_macos_ingress_http import MACOS_ROUTE, error, success


@pytest.fixture
def macos(macos_setup):
    # Build valid metadata elsewhere, then give the actual runtime a fresh store.
    c = macos_setup
    c.store = MemoryStore()
    del c.registry, c.archive
    c.display_path = "/v2/process/display-sources/" + c.source["source_id"]
    c.stream_path = COLLECTION + "/" + c.registration["stream_id"]
    c.macos_envelope = {"contract_version": "0.2.12", "batch": c.batch, "frames": [c.macos_frame]}
    return c


def build(c, **changes):
    config = options(c)
    return create_local_capture_runtime(**{
        **config, "capabilities": config["capabilities"] | {wire.CAPABILITY},
        "enable_macos_ingress": True, "fresh_consent": True,
        "producer_profile": "desktop_pixels", **changes,
    })


def submit(c, runtime, *, envelope=None, token=TOKEN):
    return request(runtime.app, "POST", MACOS_ROUTE, request_key="runtime-macos",
                   body=c.macos_envelope if envelope is None else envelope, token=token)


def upload(c, runtime):
    descriptor = upload_raw_and_ink(c, runtime)
    body = {"contract_version": "0.2.2", "source": c.source, "kind": "screen_image",
            "artifact": c.composed_ref, "data_base64": base64.b64encode(c.composed_data).decode("ascii")}
    ingress_success(request(runtime.app, "PUT", ORIGINALS + c.composed_ref["artifact_id"],
                            body=body, token=TOKEN), "OriginalArtifactReceipt")
    return descriptor


def test_macos_runtime_consent_profile_and_pending_reopen_do_not_start_capture(macos):
    c = macos
    with pytest.raises(DomainError) as exc:
        build(c, fresh_consent=False)
    assert (exc.value.status, exc.value.code) == (403, "forbidden")
    assert c.store._documents == {}
    runtime = build(c)
    assert runtime.start_status == "pending" and runtime.current_state is None
    before = deepcopy(c.store._documents)
    rows = before[c.user]
    assert {kind for kind, _ in rows} == {
        "authorization", "device", "session", "control_membership", "control_start"}
    assert rows[("control_start", c.registration["stream_id"])]["producer_profile"] == "desktop_pixels"
    assert rows[("session", c.registration["session_id"])]["live_capture"] is False
    reopened = build(c, fresh_consent=False)
    assert reopened.start_status == "pending" and reopened.current_state is None
    assert c.store._documents == before
    assert TOKEN not in repr(runtime) and TOKEN not in repr(before)
    assert runtime.app.state.paid_executor_enabled is False


def test_same_store_macos_reopen_preserves_both_originals_and_exact_http_ack(macos):
    c = macos
    runtime = build(c)
    descriptor = upload(c, runtime)
    ack = success(c, submit(c, runtime))
    assert ack["acknowledged"][0]["artifacts"] == [
        {**ref, "status": "verified"} for ref in (c.ref, c.composed_ref, c.ink_ref)]
    before = deepcopy(c.store._documents)
    rotated = "synthetic-macos-reopen-token-" + "z" * 32
    reopened = build(c, fresh_consent=False, token=rotated)
    assert reopened.start_status == "consumed" and reopened.current_state["state"] == "live"
    assert state(register(c, reopened, token=rotated), "live") == reopened.current_state
    assert success(c, submit(c, reopened, token=rotated)) == ack
    error(submit(c, reopened), 401, "unauthenticated")
    assert ingress_success(request(reopened.app, "GET", c.display_path, token=rotated),
                           "DisplaySourceSnapshot") == descriptor
    for ref, data in ((c.ref, c.data), (c.composed_ref, c.composed_data), (c.ink_ref, c.ink_data)):
        result = ingress_success(request(reopened.app, "GET", original_path(c, ref["artifact_id"]),
                                         token=rotated), "OriginalArtifactUpload")
        assert result["artifact"] == ref
        assert base64.b64decode(result["data_base64"], validate=True) == data
    assert c.store._documents == before
    assert before[c.user][("raw_capture_frame", c.macos_frame["frame_id"])] == c.macos_frame
    assert TOKEN not in repr(before) and rotated not in repr(before) and rotated not in repr(reopened)


def test_first_gap_only_runtime_reopen_keeps_profile_without_manufactured_images(macos):
    c = macos
    runtime = build(c)
    state(register(c, runtime), "live")
    ingress_success(request(runtime.app, "PUT", c.display_path, body=c.display, token=TOKEN),
                    "DisplaySourceSnapshot")
    payload = {**c.macos_envelope, "batch": {**c.batch, "records": [gap(c)]}, "frames": []}
    ack = success(c, submit(c, runtime, envelope=payload), payload)
    assert ack["acknowledged"][0]["artifacts"] == []
    before = deepcopy(c.store._documents)
    assert not any(kind in {"artifact", "frame", "raw_capture_frame"} for kind, _ in before[c.user])
    reopened = build(c, fresh_consent=False)
    assert success(c, submit(c, reopened, envelope=payload), payload) == ack
    assert c.store._documents == before


@pytest.mark.parametrize("action", ["stop", "withdraw"])
def test_terminal_macos_runtime_reopen_cannot_restore_capture_or_cached_success(macos, action):
    c = macos
    runtime = build(c)
    upload(c, runtime)
    success(c, submit(c, runtime))
    terminal = stopped(c, runtime, action)
    before = deepcopy(c.store._documents)
    for consent in (False, True):
        reopened = build(c, fresh_consent=consent)
        assert reopened.current_state == terminal
        assert state(register(c, reopened), terminal["state"]) == terminal
        status, code = (409, "capture_stopped") if action == "stop" else (403, "forbidden")
        error(submit(c, reopened), status, code)
        ingress_error(request(reopened.app, "PUT", ORIGINALS + c.ref["artifact_id"],
                              body=original_body(c), token=TOKEN), 403, "forbidden")
        ingress_success(request(reopened.app, "GET", original_path(c, c.composed_ref["artifact_id"]),
                                token=TOKEN), "OriginalArtifactUpload")
    assert c.store._documents == before


@pytest.mark.parametrize("macos_enabled,windows_enabled,desktop_enabled,raw_enabled", list(product([False, True], repeat=4)))
def test_capture_family_flags_are_independent(macos, macos_enabled, windows_enabled, desktop_enabled, raw_enabled):
    c = macos
    runtime = build(c, enable_macos_ingress=macos_enabled, enable_desktop_ingress=desktop_enabled,
                    enable_raw_ingress=raw_enabled, enable_windows_ingress=windows_enabled,
                    capabilities=options(c)["capabilities"] | {wire.CAPABILITY, "process.desktop-ingress.v0.2.8",
                                                              "process.windows-ingress.v0.2.10"})
    before = deepcopy(c.store._documents)
    for route, enabled, version in ((MACOS_ROUTE, macos_enabled, "0.2.12"),
                                    (WINDOWS_ROUTE, windows_enabled, "0.2.10"),
                                    (DESKTOP_ROUTE, desktop_enabled, "0.2.8"), (RAW_FRAMES, raw_enabled, "0.2.6")):
        response = request(runtime.app, "POST", route, body={}, request_key="flags", token=TOKEN)
        route_error(response, 422 if enabled else 404, "invalid_request" if enabled else "not_found",
                    version if enabled else "0.2.4")
    assert c.store._documents == before


def test_omitted_macos_flag_is_off_even_with_explicit_capability(macos):
    c = macos
    config = options(c)
    config["capabilities"] |= {wire.CAPABILITY}
    runtime = create_local_capture_runtime(**config, fresh_consent=True, producer_profile="desktop_pixels")
    ingress_error(submit(c, runtime), 404, "not_found")
    app = create_capture_app(c.store, runtime.app.state.authenticator, capabilities=config["capabilities"])
    ingress_error(request(app, "POST", MACOS_ROUTE, body=c.macos_envelope,
                          request_key="off", token=TOKEN), 404, "not_found")


@pytest.mark.parametrize("invalid", [None, 0, 1, "true"])
@pytest.mark.parametrize("factory", ["runtime", "composition"])
def test_macos_flag_is_strict_boolean_before_any_transaction(macos, monkeypatch, invalid, factory):
    c = macos

    def forbidden_transaction(actor):
        raise AssertionError("malformed MacOS gate reached storage")

    monkeypatch.setattr(c.store, "transaction", forbidden_transaction)
    with pytest.raises(ValueError):
        if factory == "runtime":
            build(c, enable_macos_ingress=invalid)
        else:
            create_capture_app(c.store, enable_macos_ingress=invalid)
    assert c.store._documents == {}


@pytest.mark.parametrize("missing", ["macos_capability", "capture_capability", "capture_scope", "profile", "wrong_profile"])
def test_macos_runtime_requires_explicit_authority_and_pixel_profile_before_writes(macos, monkeypatch, missing):
    c = macos
    config = options(c)
    changes = {"capabilities": config["capabilities"] | {wire.CAPABILITY}}
    if missing == "capture_scope":
        changes["scopes"] = config["scopes"] - {"process:capture"}
    elif missing in {"profile", "wrong_profile"}:
        changes["producer_profile"] = None if missing == "profile" else "macos_electron"
    else:
        changes["capabilities"] -= {wire.CAPABILITY if missing == "macos_capability" else "process.capture.v0.2"}

    def forbidden_transaction(actor):
        raise AssertionError("ungranted MacOS authority reached storage")

    monkeypatch.setattr(c.store, "transaction", forbidden_transaction)
    with pytest.raises(ValueError):
        build(c, **changes)
    assert c.store._documents == {}


def test_macos_runtime_does_not_grant_original_upload_authority(macos):
    c = macos
    runtime = build(c, scopes=frozenset({"process:control", "process:capture"}),
                    capabilities=frozenset({"process.control.v0.2.1", "process.capture.v0.2", wire.CAPABILITY}))
    state(register(c, runtime), "live")
    before = deepcopy(c.store._documents)
    ingress_error(request(runtime.app, "PUT", c.display_path, body=c.display, token=TOKEN), 403, "forbidden")
    ingress_error(request(runtime.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c),
                          token=TOKEN), 403, "forbidden")
    error(submit(c, runtime), 404, "not_found")
    assert c.store._documents == before


def test_composed_macos_capability_does_not_imply_control_or_original_capability(macos):
    c = macos
    runtime = build(c)
    upload(c, runtime)
    ack = success(c, submit(c, runtime))
    before = deepcopy(c.store._documents)
    app = create_capture_app(c.store, runtime.app.state.authenticator, clock=lambda: c.instant[0],
                             capabilities=frozenset({"process.capture.v0.2", wire.CAPABILITY}),
                             enable_macos_ingress=True)
    response = request(app, "POST", MACOS_ROUTE, body=c.macos_envelope,
                       request_key="runtime-macos", token=TOKEN)
    assert success(c, response) == ack
    control_error(request(app, "GET", c.stream_path, token=TOKEN), 403, "capability_required")
    ingress_error(request(app, "GET", original_path(c), token=TOKEN), 403, "capability_required")
    assert c.store._documents == before
