"""One opt-in ASGI entry point over existing control and original-record routes.

Membership, start grants, producer stop facts and pixels are explicitly synthetic.
No listener, database, device/provider activation or live-screen claim is made.
"""

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import timedelta
import json

import pytest

from packages.contracts import raw_capture_ingress as raw_wire
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.capture_app import create_capture_app
from services.api.domain import key
from services.api.storage import MemoryStore
from services.api.tests.test_control import command, control_fixture, documents, resolve_stop_fact, stop_fact
from services.api.tests.test_control_http import (
    COLLECTION, error as control_error, request, state,
)
from services.api.tests.test_display_sources import reference
from services.api.tests.test_image_resolver import png
from services.api.tests.test_ingress_http import (
    NOW, ORIGINALS, SCOPES, error as ingress_error, original_body,
    success as ingress_success,
)
from services.api.tests.test_raw_ingress_http import CAPABILITIES, RAW_FRAMES, error as raw_error


USER = "composed-capture-user"
OTHER = "unrelated-capture-user"
REQUEST_KEY = "same-key-on-distinct-paths"


def context(store, actor):
    # Neither membership nor a stream/start grant exists after this helper.
    c = control_fixture(store, actor, membership=False, registered=False)
    c.source = {"user_id": actor, "source_id": "composed-display", "source_version": 1}
    c.display_path = "/v2/process/display-sources/" + c.source["source_id"]
    c.stream_path = COLLECTION + "/" + c.registration["stream_id"]
    c.display = {"contract_version": "0.2.4", "source_id": c.source["source_id"],
                 "stream_id": c.registration["stream_id"], "project_id": None, "source_timezone": "UTC"}
    c.data = png()
    c.ref = reference(c.data, "composed-png", "image/png")
    c.ink_data = b'{"test_only":true,"editable_strokes":[[1,2],[3,4]]}\n'
    c.ink_ref = reference(c.ink_data, "composed-ink", "application/json")
    item = c.batch["records"][0]
    item.update(source=c.source, artifacts=[c.ref, c.ink_ref], frame_id="composed-raw-frame",
                observed_at=None, media_position=None)
    c.raw_frame = {
        "contract_version": "0.2.5", "kind": "raw_capture_frame", "frame_id": item["frame_id"],
        "source": deepcopy(c.source),
        **{field: c.batch[field] for field in ("device_id", "session_id", "stream_id")},
        "artifact": deepcopy(c.ref), "raw_width": 2, "raw_height": 2, "buffer_sequence": 97,
        "captured_at": None, "media_position": None,
        "timing": {"observed_at_estimate": None, "estimate_basis": None, "uncertainty_ms": None,
                   "callback_clock": deepcopy(item["clock"]), "sample_pts_seconds": -0.125},
        "orientation": {"system": "CGImagePropertyOrientation", "value": 2, "applied_to_pixels": False},
    }
    c.raw_envelope = {"contract_version": "0.2.6", "batch": c.batch, "frames": [c.raw_frame]}
    return c


@pytest.fixture
def setup():
    c = context(MemoryStore(), USER)
    c.instant = [NOW]
    principal = Principal(USER, SCOPES, NOW + timedelta(hours=1))
    c.auth = LocalTestAuthenticator({
        "control-token": principal,
        "control-only": replace(principal, scopes=frozenset({"process:control"})),
        "capture-only": replace(principal, scopes=frozenset({"process:capture"})),
        "read-only": replace(principal, scopes=frozenset({"sources:read"})),
        "expired-token": replace(principal, expires_at=NOW),
        "other-token": replace(principal, user_id=OTHER),
    })
    c.app = app(c)
    return c


def app(c, *, capabilities=CAPABILITIES, enable_raw_ingress=True):
    return create_capture_app(c.store, c.auth, capabilities=capabilities,
                              clock=lambda: c.instant[0], stop_fact_resolver=resolve_stop_fact,
                              enable_raw_ingress=enable_raw_ingress)


def stream_registration(c, **kwargs):
    return request(c.app, "POST", COLLECTION, body=c.registration, request_key=REQUEST_KEY, **kwargs)


def original_path(c, artifact_id=None):
    return (f"/v2/process/sources/{c.source['source_id']}/versions/1/originals/"
            f"{artifact_id or c.ref['artifact_id']}")


def provision(c):
    """Trusted setup remains outside the public app and its factory."""
    c.registry.set_membership(c.user, c.registration["device_id"], c.registration["session_id"],
                              active=True, expected_revision=0)
    c.registry.authorize_start(c.user, c.registration, producer_id="synthetic-screen")


def register_and_upload(c, *, token="control-token"):
    provision(c)
    c.live = state(stream_registration(c, token=token), "live")
    c.descriptor = ingress_success(request(c.app, "PUT", c.display_path, body=c.display, token=token),
                                   "DisplaySourceSnapshot")
    for ink in (False, True):
        body = original_body(c, ink=ink)
        receipt = ingress_success(request(c.app, "PUT", ORIGINALS + body["artifact"]["artifact_id"],
                                           body=body, token=token), "OriginalArtifactReceipt")
        assert receipt == {**{k: v for k, v in body.items() if k != "data_base64"}, "status": "bytes_committed"}


def capture(c, *, token="control-token"):
    response = request(c.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY, token=token)
    assert response.status_code == 200, response.text
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
                for ref in (c.ref, c.ink_ref)}
    raw_wire.validate_ack(c.batch, response.json(), user_id=c.user, verified_artifacts=verified)
    assert response.headers["cache-control"] == "no-store"
    return response.json()


@pytest.fixture
def captured(setup):
    register_and_upload(setup)
    setup.ack = capture(setup)
    return setup


def test_factory_does_not_provision_membership_or_start_authority(setup):
    c = setup
    before = documents(c)
    assert not any(kind in {"control_membership", "control_start", "control_stream"} for kind, _ in before)
    c.app = app(c)
    assert documents(c) == before
    control_error(stream_registration(c), 404, "not_found")
    assert documents(c) == before
    c.registry.set_membership(USER, c.registration["device_id"], c.registration["session_id"],
                              active=True, expected_revision=0)
    before = documents(c)
    control_error(stream_registration(c), 403, "forbidden")
    assert documents(c) == before
    c.registry.authorize_start(USER, c.registration, producer_id="synthetic-screen")
    state(stream_registration(c), "live")


def test_same_app_registration_upload_raw_stop_and_retained_history(setup, monkeypatch):
    c = setup
    provision(c)
    original_transaction = c.store.transaction
    entries = []

    @contextmanager
    def counted(actor):
        entries.append(actor)
        with original_transaction(actor) as tx:
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", counted)
        state(stream_registration(c), "live")
        descriptor = ingress_success(request(c.app, "PUT", c.display_path, body=c.display), "DisplaySourceSnapshot")
        for ink in (False, True):
            body = original_body(c, ink=ink)
            ingress_success(request(c.app, "PUT", ORIGINALS + body["artifact"]["artifact_id"], body=body),
                            "OriginalArtifactReceipt")
        ack = capture(c)
    assert entries == [USER] * 5  # Existing child transactions; no wrapper transaction.
    stored = documents(c)
    assert stored[("raw_capture_frame", c.raw_frame["frame_id"])] == c.raw_frame
    assert json.loads(stored[("capture_record", "process-1")]["canonical_json"])["record"] == c.batch["records"][0]
    assert capture(c) == ack
    assert documents(c) == stored
    stop_fact(c, 1)
    stopped = state(request(c.app, "POST", c.stream_path + ":control", body=command(c, boundary=1),
                            request_key=REQUEST_KEY), "stopped")
    assert stopped["pre_stop_sequence"] == 1
    assert state(request(c.app, "GET", c.stream_path), "stopped") == stopped
    assert state(stream_registration(c), "stopped") == stopped
    before = documents(c)
    raw_error(request(c.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY),
              409, "capture_stopped")
    ingress_error(request(c.app, "PUT", c.display_path, body=c.display), 403, "forbidden")
    for ink in (False, True):
        body = original_body(c, ink=ink)
        path = original_path(c, body["artifact"]["artifact_id"])
        assert ingress_success(request(c.app, "GET", path, token="read-only"), "OriginalArtifactUpload") == body
        ingress_error(request(c.app, "PUT", ORIGINALS + body["artifact"]["artifact_id"], body=body),
                      403, "forbidden")
    assert ingress_success(request(c.app, "GET", c.display_path, token="read-only"), "DisplaySourceSnapshot") == descriptor
    assert documents(c) == before
    assert before[("capture_replay", key("POST", RAW_FRAMES, REQUEST_KEY))]["deleted"] is False
    assert before[("session", c.batch["session_id"])]["live_capture"] is False


def test_source_revocation_preserves_other_authorized_source_history(captured):
    c = captured
    other_source = {**c.source, "source_id": "separate-history"}
    other_display = {**c.display, "source_id": other_source["source_id"]}
    other_display_path = "/v2/process/display-sources/" + other_source["source_id"]
    descriptor = ingress_success(request(c.app, "PUT", other_display_path, body=other_display), "DisplaySourceSnapshot")
    original = {**original_body(c), "source": other_source, "artifact": {**c.ref, "artifact_id": "separate-png"}}
    ingress_success(request(c.app, "PUT", ORIGINALS + "separate-png", body=original), "OriginalArtifactReceipt")
    c.archive.revoke_source(USER, c.source["source_id"])
    before = documents(c)
    raw_error(request(c.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY), 404, "not_found")
    ingress_error(request(c.app, "GET", original_path(c)), 403, "forbidden")
    path = "/v2/process/sources/separate-history/versions/1/originals/separate-png"
    assert ingress_success(request(c.app, "GET", path, token="read-only"), "OriginalArtifactUpload") == original
    assert ingress_success(request(c.app, "GET", other_display_path), "DisplaySourceSnapshot") == descriptor
    assert documents(c) == before


def test_account_revocation_does_not_cross_actor_or_reenable_old_streams(captured):
    c = captured
    other = context(c.store, OTHER)
    other.app = c.app
    register_and_upload(other, token="other-token")
    other_ack = capture(other, token="other-token")
    other_before = documents(other)
    c.archive.set_authorization(USER, False)
    before = documents(c)
    control_error(request(c.app, "GET", c.stream_path), 403, "forbidden")
    ingress_error(request(c.app, "GET", original_path(c)), 403, "forbidden")
    raw_error(request(c.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY), 403, "forbidden")
    assert capture(other, token="other-token") == other_ack
    assert ingress_success(request(c.app, "GET", original_path(other), token="other-token"),
                           "OriginalArtifactUpload") == original_body(other)
    assert documents(c) == before and documents(other) == other_before
    c.archive.set_authorization(USER)
    before = documents(c)
    control_error(stream_registration(c), 403, "forbidden")
    raw_error(request(c.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY), 403, "forbidden")
    assert documents(c) == before


@pytest.mark.parametrize("missing,family", [
    ("process.control.v0.2.1", "control"), ("process.ingress.v0.2.4", "original"),
    ("process.raw-ingress.v0.2.6", "raw"), ("process.capture.v0.2", "raw"),
])
def test_capabilities_remain_separate_across_composed_children(captured, missing, family):
    c = captured
    c.app = app(c, capabilities=CAPABILITIES - {missing})
    before = documents(c)
    if family == "control":
        control_error(request(c.app, "GET", c.stream_path), 403, "capability_required")
        assert capture(c) == c.ack
    elif family == "original":
        ingress_error(request(c.app, "GET", original_path(c)), 403, "capability_required")
        assert capture(c) == c.ack
    else:
        raw_error(request(c.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY),
                  403, "capability_required")
        state(request(c.app, "GET", c.stream_path), "live")
        ingress_success(request(c.app, "GET", original_path(c)), "OriginalArtifactUpload")
    assert documents(c) == before


@pytest.mark.parametrize("family,token", [
    ("control", "capture-only"), ("raw", "control-only"),
    ("original", "control-only"), ("display", "capture-only"),
])
def test_one_family_scope_cannot_authorize_another(captured, family, token):
    c = captured
    before = documents(c)
    if family == "control":
        control_error(request(c.app, "GET", c.stream_path, token=token), 403, "forbidden")
    elif family == "raw":
        raw_error(request(c.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY, token=token),
                  403, "forbidden")
    elif family == "original":
        ingress_error(request(c.app, "GET", original_path(c), token=token), 403, "forbidden")
    else:
        ingress_error(request(c.app, "PUT", c.display_path, body=c.display, token=token), 403, "forbidden")
    assert documents(c) == before


@pytest.mark.parametrize("family", ["control", "original", "raw"])
def test_expired_token_preserves_each_child_error_contract(captured, family):
    c = captured
    before = documents(c)
    if family == "control":
        control_error(request(c.app, "GET", c.stream_path, token="expired-token"), 401, "unauthenticated")
    elif family == "original":
        ingress_error(request(c.app, "GET", original_path(c), token="expired-token"), 401, "unauthenticated")
    else:
        raw_error(request(c.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY,
                          token="expired-token"), 401, "unauthenticated")
    assert documents(c) == before


@pytest.mark.parametrize("family", ["control", "original", "raw"])
def test_query_validation_stays_in_the_owning_child(captured, family):
    c = captured
    before = documents(c)
    if family == "control":
        control_error(request(c.app, "GET", c.stream_path + "?unexpected=1"), 422, "invalid_request")
    elif family == "original":
        ingress_error(request(c.app, "GET", original_path(c) + "?unexpected=1"), 422, "invalid_request")
    else:
        raw_error(request(c.app, "POST", RAW_FRAMES + "?unexpected=1", body=c.raw_envelope,
                          request_key=REQUEST_KEY), 422, "invalid_request")
    assert documents(c) == before


def test_default_raw_absence_and_unowned_paths_keep_legacy_closed_errors(setup):
    c = setup
    before = documents(c)
    default = create_capture_app(c.store, c.auth, capabilities=CAPABILITIES,
                                  stop_fact_resolver=resolve_stop_fact, clock=lambda: NOW)
    ingress_error(request(default, "POST", RAW_FRAMES, body=c.raw_envelope, request_key=REQUEST_KEY),
                  404, "not_found")
    ingress_error(request(c.app, "POST", "/unowned-path", body={"private": "content"}), 404, "not_found")
    control_error(request(c.app, "PUT", c.stream_path), 404, "not_found")
    raw_error(request(c.app, "GET", RAW_FRAMES), 404, "not_found")
    assert documents(c) == before
