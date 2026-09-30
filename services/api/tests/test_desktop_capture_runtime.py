"""Synthetic local consent and desktop HTTP over an actually pristine target store.

The fixture assembles metadata in another store. No OS capture, durable database,
listener, provider, credential persistence or live-screen acceptance is implied.
"""

from copy import deepcopy
from datetime import timedelta
import json

import pytest

from packages.contracts import desktop_capture_ingress as wire
from services.api.capture_runtime import create_local_capture_runtime
from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.tests.test_capture_app import (
    NOW, ORIGINALS, RAW_FRAMES, ingress_error, ingress_success,
    original_body, original_path, request, state,
)
from services.api.tests.test_capture_runtime import (
    TOKEN, options, register, setup, stopped, uploaded,
)
from services.api.tests.test_desktop_frame_ingress import EXAMPLE, pixel_record
from services.api.tests.test_desktop_ingress_http import DESKTOP_ROUTE, error, gap


@pytest.fixture
def desktop(setup):
    c = setup
    assert c.store._documents == {}
    c.desktop_frame = json.loads(EXAMPLE.read_text())
    c.desktop_frame.update(frame_id=c.raw_frame["frame_id"], source=deepcopy(c.source),
                           artifact=deepcopy(c.ref), raw_width=2, raw_height=2,
                           **{name: c.batch[name] for name in ("device_id", "session_id", "stream_id")})
    c.batch["records"][0] = pixel_record(c.batch["records"][0])
    c.desktop_envelope = {"contract_version": "0.2.8", "batch": c.batch, "frames": [c.desktop_frame]}
    return c


def build(c, **changes):
    config = options(c)
    return create_local_capture_runtime(**{
        **config, "capabilities": config["capabilities"] | {wire.CAPABILITY},
        "enable_desktop_ingress": True, "fresh_consent": True,
        "producer_profile": "desktop_pixels", **changes,
    })


def submit(c, runtime, *, envelope=None, token=TOKEN, request_key="runtime-desktop"):
    return request(runtime.app, "POST", DESKTOP_ROUTE,
                   body=c.desktop_envelope if envelope is None else envelope,
                   request_key=request_key, token=token)


def accepted(c, response, envelope=None):
    assert response.status_code == 200, response.text
    payload = c.desktop_envelope if envelope is None else envelope
    refs = [ref for item in payload["batch"]["records"] for ref in item["artifacts"]]
    verified = {tuple(ref[name] for name in ("artifact_id", "sha256", "byte_length", "media_type")) for ref in refs}
    ack = response.json()
    wire.validate_ack(payload["batch"], ack, user_id=c.user, verified_artifacts=verified)
    assert response.headers["cache-control"] == "no-store"
    return ack


def gap_payload(c):
    return {**c.desktop_envelope, "batch": {**c.batch, "records": [gap(c)]}, "frames": []}


def register_display(c, runtime):
    state(register(c, runtime), "live")
    return ingress_success(request(runtime.app, "PUT", c.display_path, body=c.display, token=TOKEN),
                           "DisplaySourceSnapshot")


def test_pristine_desktop_factory_requires_consent_without_auto_registration(desktop):
    c = desktop
    with pytest.raises(DomainError) as exc:
        build(c, fresh_consent=False)
    assert (exc.value.status, exc.value.code) == (403, "forbidden")
    assert c.store._documents == {}
    runtime = build(c)
    assert runtime.start_status == "pending" and runtime.current_state is None
    assert runtime.registration == c.registration
    rows = deepcopy(c.store._documents)
    assert {kind for kind, _ in rows[c.user]} == {
        "authorization", "device", "session", "control_membership", "control_start"}
    assert TOKEN not in repr(runtime) and TOKEN not in repr(rows)
    reopened = build(c, fresh_consent=False)
    assert reopened.start_status == "pending" and reopened.current_state is None
    assert c.store._documents == rows
    state(register(c, reopened), "live")


def test_factory_registration_bytes_desktop_ack_and_rotated_token_reopen(desktop):
    c = desktop
    runtime = build(c)
    descriptor = uploaded(c, runtime)
    payload = deepcopy(c.desktop_envelope)
    payload["batch"]["records"].append(gap(c, sequence=2, parents=["process-1"]))
    ack = accepted(c, submit(c, runtime, envelope=payload), payload)
    assert ack["acknowledged"][0]["artifacts"] == [{**ref, "status": "verified"} for ref in (c.ref, c.ink_ref)]
    assert ack["acknowledged"][1]["artifacts"] == []
    before = deepcopy(c.store._documents)
    rotated = "synthetic-desktop-reopen-token-" + "y" * 32
    reopened = build(c, fresh_consent=False, token=rotated)
    assert reopened.start_status == "consumed" and reopened.current_state["state"] == "live"
    assert state(register(c, reopened, token=rotated), "live") == reopened.current_state
    assert accepted(c, submit(c, reopened, envelope=payload, token=rotated), payload) == ack
    error(submit(c, reopened, envelope=payload), 401, "unauthenticated")
    assert ingress_success(request(reopened.app, "GET", c.display_path, token=rotated), "DisplaySourceSnapshot") == descriptor
    for ink in (False, True):
        body = original_body(c, ink=ink)
        assert ingress_success(request(reopened.app, "GET", original_path(c, body["artifact"]["artifact_id"]),
                                       token=rotated), "OriginalArtifactUpload") == body
    assert c.store._documents == before
    assert TOKEN not in repr(before) and rotated not in repr(before) and rotated not in repr(reopened)
    assert before[c.user][("raw_capture_frame", c.desktop_frame["frame_id"])] == c.desktop_frame


def test_first_gap_without_pixels_survives_factory_recreation_and_later_pixels(desktop):
    c = desktop
    runtime = build(c)
    register_display(c, runtime)
    payload = gap_payload(c)
    ack = accepted(c, submit(c, runtime, envelope=payload), payload)
    assert ack["acknowledged"][0]["artifacts"] == []
    assert not any(kind in {"artifact", "frame", "raw_capture_frame"} for kind, _ in c.store._documents[c.user])
    before = deepcopy(c.store._documents)
    reopened = build(c, fresh_consent=False)
    assert accepted(c, submit(c, reopened, envelope=payload), payload) == ack
    assert c.store._documents == before
    uploaded(c, reopened)
    later = deepcopy(c.desktop_envelope)
    later["batch"]["records"][0].update(sequence=2, causal_parents=[payload["batch"]["records"][0]["record_id"]])
    accepted(c, submit(c, reopened, envelope=later, request_key="pixels-after-gap"), later)
    gap_id = payload["batch"]["records"][0]["record_id"]
    assert c.store._documents[c.user][("capture_record", gap_id)] == before[c.user][("capture_record", gap_id)]


@pytest.mark.parametrize("action", ["stop", "withdraw"])
def test_stopped_or_withdrawn_runtime_reopens_current_grant_without_live_desktop_ack(desktop, action):
    c = desktop
    runtime = build(c)
    uploaded(c, runtime)
    accepted(c, submit(c, runtime))
    terminal = stopped(c, runtime, action)
    before = deepcopy(c.store._documents)
    for consent in (False, True):
        reopened = build(c, fresh_consent=consent)
        assert reopened.start_status == "consumed" and reopened.current_state == terminal
        assert state(register(c, reopened), terminal["state"]) == terminal
        status, code = (409, "capture_stopped") if action == "stop" else (403, "forbidden")
        error(submit(c, reopened), status, code)
        error(submit(c, reopened, envelope=gap_payload(c), request_key="late-gap"), status, code)
        ingress_error(request(reopened.app, "PUT", ORIGINALS + c.ref["artifact_id"],
                              body=original_body(c), token=TOKEN), 403, "forbidden")
        assert ingress_success(request(reopened.app, "GET", original_path(c), token=TOKEN),
                               "OriginalArtifactUpload") == original_body(c)
    assert c.store._documents == before


@pytest.mark.parametrize("fence", ["source_revoke", "source_delete", "account_revoke", "token_revoke", "expiry"])
def test_runtime_current_fences_refuse_cached_desktop_success(desktop, fence):
    c = desktop
    runtime = build(c)
    uploaded(c, runtime)
    accepted(c, submit(c, runtime))
    archive = Archive(c.store)
    if fence == "source_revoke":
        archive.revoke_source(c.user, c.source["source_id"])
    elif fence == "source_delete":
        archive.delete_source(c.user, c.source["source_id"])
    elif fence == "account_revoke":
        archive.set_authorization(c.user, False)
    elif fence == "token_revoke":
        runtime.app.state.authenticator.revoke(TOKEN)
    else:
        c.instant[0] = NOW + timedelta(hours=2)
    before = deepcopy(c.store._documents)
    status, code = ((404, "not_found") if fence.startswith("source_") else
                    (403, "forbidden") if fence == "account_revoke" else (401, "unauthenticated"))
    error(submit(c, runtime), status, code)
    if fence.startswith("source_"):
        reopened = build(c, fresh_consent=False)
        error(submit(c, reopened), status, code)
    elif fence == "account_revoke":
        with pytest.raises(DomainError):
            build(c, fresh_consent=False)
    assert c.store._documents == before


@pytest.mark.parametrize("variant", ["gap", "frame"])
@pytest.mark.parametrize("missing", ["source", "snapshot"])
def test_same_store_reopen_cannot_repair_source_loss_witnessed_by_committed_desktop_record(desktop, variant, missing):
    c = desktop
    runtime = build(c)
    if variant == "gap":
        register_display(c, runtime)
        c.desktop_envelope = gap_payload(c)
    else:
        uploaded(c, runtime)
    accepted(c, submit(c, runtime))
    identifier = c.source["source_id"] if missing == "source" else key(c.source["source_id"], 1)
    del c.store._documents[c.user][(missing, identifier)]
    before = deepcopy(c.store._documents)
    reopened = build(c, fresh_consent=False)
    error(submit(c, reopened), 503, "unavailable")
    # Missing heads hit the released immutable-ID refusal; missing current
    # snapshots are unavailable. Neither permits reconstructing a source.
    status, code = (409, "source_identity_conflict") if missing == "source" else (503, "unavailable")
    ingress_error(request(reopened.app, "PUT", c.display_path, body=c.display, token=TOKEN), status, code)
    assert c.store._documents == before


@pytest.mark.parametrize("desktop_enabled,raw_enabled", [(False, False), (False, True), (True, False), (True, True)])
def test_factory_flags_are_independent_and_false_never_activates_desktop(desktop, desktop_enabled, raw_enabled):
    c = desktop
    runtime = build(c, enable_desktop_ingress=desktop_enabled, enable_raw_ingress=raw_enabled)
    before = deepcopy(c.store._documents)
    for route, enabled, version in ((DESKTOP_ROUTE, desktop_enabled, "0.2.8"), (RAW_FRAMES, raw_enabled, "0.2.6")):
        response = request(runtime.app, "POST", route, body={}, request_key="flags", token=TOKEN)
        error(response, 422 if enabled else 404, "invalid_request" if enabled else "not_found",
              version if enabled else "0.2.4")
    assert c.store._documents == before


def test_omitted_flag_stays_off_even_when_desktop_capability_is_supplied(desktop):
    c = desktop
    config = options(c)
    config["capabilities"] |= {wire.CAPABILITY}
    runtime = create_local_capture_runtime(**config, fresh_consent=True, producer_profile="desktop_pixels")
    error(submit(c, runtime), 404, "not_found", "0.2.4")


def test_desktop_enabled_runtime_does_not_expand_original_upload_permissions(desktop):
    c = desktop
    runtime = build(c, scopes=frozenset({"process:control", "process:capture"}),
                    capabilities=frozenset({"process.control.v0.2.1", "process.capture.v0.2", wire.CAPABILITY}))
    state(register(c, runtime), "live")
    before = deepcopy(c.store._documents)
    ingress_error(request(runtime.app, "PUT", c.display_path, body=c.display, token=TOKEN), 403, "forbidden")
    ingress_error(request(runtime.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c), token=TOKEN),
                  403, "forbidden")
    error(submit(c, runtime, envelope=gap_payload(c)), 404, "not_found")
    assert c.store._documents == before


@pytest.mark.parametrize("invalid", [None, 0, 1, "true"])
def test_desktop_flag_requires_a_boolean_before_mutation(desktop, monkeypatch, invalid):
    c = desktop

    def unexpected_transaction(actor):
        raise AssertionError("malformed desktop gate reached storage")

    monkeypatch.setattr(c.store, "transaction", unexpected_transaction)
    with pytest.raises(ValueError):
        build(c, enable_desktop_ingress=invalid)
    assert c.store._documents == {}


@pytest.mark.parametrize("missing", ["desktop_capability", "capture_capability", "capture_scope"])
def test_desktop_activation_requires_explicit_capture_authority_before_mutation(desktop, monkeypatch, missing):
    c = desktop
    config = options(c)
    changes = {"capabilities": config["capabilities"] | {wire.CAPABILITY}}
    if missing == "capture_scope":
        changes["scopes"] = config["scopes"] - {"process:capture"}
    else:
        changes["capabilities"] -= {wire.CAPABILITY if missing == "desktop_capability" else "process.capture.v0.2"}

    def unexpected_transaction(actor):
        raise AssertionError("ungranted desktop capability reached storage")

    monkeypatch.setattr(c.store, "transaction", unexpected_transaction)
    with pytest.raises(ValueError):
        build(c, **changes)
    assert c.store._documents == {}


@pytest.mark.parametrize("pin", ["authorization_generation", "membership_revision"])
def test_desktop_factory_preserves_pins_and_refuses_stale_reopen(desktop, pin):
    c = desktop
    runtime = build(c)
    uploaded(c, runtime)
    rows = c.store._documents[c.user]
    identity = (("authorization", "state") if pin == "authorization_generation" else
                ("control_membership", key(c.registration["device_id"], c.registration["session_id"])))
    rows[identity]["generation" if pin == "authorization_generation" else "revision"] += 1
    before = deepcopy(c.store._documents)
    error(submit(c, runtime), 403, "forbidden")
    for consent in (False, True):
        with pytest.raises(DomainError):
            build(c, fresh_consent=consent)
    assert c.registration[pin] == 1 and c.store._documents == before
