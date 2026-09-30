"""Present replay rows never become permission to reconstruct a committed ACK.

MemoryStore corruption is injected outside normal immutable-store operations.
The cases reuse actual common-writer entries and in-process HTTP where released;
they neither start services nor establish database/recovery-device evidence.
"""

from copy import deepcopy
import json

import pytest

from services.api.domain import key
from services.api.errors import DomainError
from services.api.ingress_app import create_ingress_app
from services.api.tests.test_control import USER, apply, command, documents, resolve_stop_fact
from services.api.tests.test_desktop_frame_ingress import desktop_setup
from services.api.tests.test_ingress_http import (
    CAPABILITIES, registered, request as http_request, setup, uploaded,
)
from services.api.tests.test_raw_frame_ingress import raw_setup
from services.api.tests.test_windows_frame_ingress import windows_setup


FAMILIES = ["generic", "legacy-internal", "raw-internal", "desktop-internal", "windows-internal",
            "legacy-http", "raw-http", "desktop-http", "windows-http"]
REQUEST_KEY = "capture-replay-presence"


@pytest.fixture(params=FAMILIES)
def replay_case(request):
    family = request.param
    variant = family.split("-")[0]
    fixture = {"generic": "setup", "legacy": "uploaded", "raw": "raw_setup",
               "desktop": "desktop_setup", "windows": "windows_setup"}[variant]
    c = request.getfixturevalue(fixture)
    c.replay_http_version = None
    if variant == "generic":
        batch = deepcopy(c.batch)
        batch["records"][0].update(frame_id=None, artifacts=[],
            source={field: c.core["SourceSnapshot"][field] for field in ("user_id", "source_id", "source_version")})
        c.replay_send = lambda: c.registry.capture.ingest(USER, batch, REQUEST_KEY)
        c.replay_batch = batch
        namespace = ("POST", "/v2/process/events:batch")
    else:
        c.replay_batch = c.batch
        frame = {"legacy": "frame", "raw": "raw_frame", "desktop": "desktop_frame", "windows": "windows_frame"}[variant]
        frames = [getattr(c, frame)]
        if family.endswith("-internal"):
            method = {"legacy": "ingest_frames", "raw": "ingest_raw_frames",
                      "desktop": "ingest_desktop_frames", "windows": "ingest_windows_frames"}[variant]
            c.replay_send = lambda: getattr(c.registry, method)(USER, c.batch, frames, REQUEST_KEY)
            namespace = ({"legacy": "internal_capture_frames", "raw": "internal_raw_capture_frames",
                          "desktop": "internal_desktop_capture_frames", "windows": "internal_windows_capture_frames"}[variant],)
        else:
            route = {"legacy": "/v2/process/frames:batch", "raw": "/v2/process/raw-frames:batch",
                     "desktop": "/v2/process/desktop-frames:batch", "windows": "/v2/process/windows-frames:batch"}[variant]
            c.replay_http_version = {"legacy": "0.2.4", "raw": "0.2.6", "desktop": "0.2.8", "windows": "0.2.10"}[variant]
            app = create_ingress_app(c.store, c.auth,
                capabilities=CAPABILITIES | {"process.raw-ingress.v0.2.6", "process.desktop-ingress.v0.2.8",
                                             "process.windows-ingress.v0.2.10"},
                stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0],
                enable_raw_ingress=True, enable_desktop_ingress=True, enable_windows_ingress=True)
            envelope = {"contract_version": c.replay_http_version, "batch": c.batch, "frames": frames}
            c.replay_send = lambda: http_request(app, "POST", route, body=envelope, request_key=REQUEST_KEY)
            namespace = ("POST", route)
    c.replay_identity = ("capture_replay", key(*namespace, REQUEST_KEY))
    return c


def success(c):
    result = c.replay_send()
    if c.replay_http_version is not None:
        assert result.status_code == 200, result.text
        return result.json()
    return result


def refused(c, status=503, code="unavailable"):
    before = documents(c)
    if c.replay_http_version is None:
        with pytest.raises(DomainError) as failure:
            c.replay_send()
        assert (failure.value.status, failure.value.code) == (status, code)
    else:
        response = c.replay_send()
        assert response.status_code == status, response.text
        assert response.json() == {"contract_version": c.replay_http_version,
                                   "error": code, "retryable": code == "unavailable"}
    assert documents(c) == before


def test_absence_commits_good_replay_is_exact_and_empty_row_cannot_rebuild_ack(replay_case):
    c = replay_case
    assert c.replay_identity not in documents(c)
    ack = success(c)
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    committed = documents(c)
    assert json.loads(committed[c.replay_identity]["response_json"]) == ack
    assert success(c) == ack
    assert documents(c) == committed
    c.store._documents[USER][c.replay_identity] = {}
    refused(c)


def corrupt_receipt(c, damage):
    row = c.store._documents[USER][c.replay_identity]
    if damage == "non-object":
        c.store._documents[USER][c.replay_identity] = []
    elif damage == "wrong-key":
        row["key"] = "other-request-key"
    elif damage == "missing-fingerprint":
        del row["fingerprint"]
    elif damage == "invalid-fingerprint":
        row["fingerprint"] = "g" * 64
    elif damage == "response-type":
        row["response_json"] = {}
    elif damage == "malformed-response":
        row["response_json"] = "{"
    elif damage == "invalid-ack":
        row["response_json"] = "{}"
    elif damage == "source-type":
        row["source_ids"] = "display-source"
    elif damage == "invalid-source":
        row["source_ids"] = ["\0"]
    elif damage == "empty-sources":
        row["source_ids"] = []
    elif damage == "duplicate-sources":
        row["source_ids"] *= 2
    elif damage == "unordered-sources":
        row["source_ids"] = ["z-source", "a-source"]
    elif damage == "missing-deleted":
        del row["deleted"]
    elif damage == "nonboolean-deleted":
        row["deleted"] = 0
    elif damage == "invalid-erasure-shape":
        row["deleted"] = True
    else:
        assert damage == "extra-field"
        row["unknown"] = "unexpected"


@pytest.mark.parametrize("replay_case", ["windows-http"], indirect=True)
@pytest.mark.parametrize("damage", [
    "non-object", "wrong-key", "missing-fingerprint", "invalid-fingerprint",
    "response-type", "malformed-response", "invalid-ack", "source-type", "invalid-source",
    "empty-sources", "duplicate-sources", "unordered-sources", "missing-deleted",
    "nonboolean-deleted", "invalid-erasure-shape", "extra-field",
])
def test_present_malformed_active_receipt_is_unavailable_without_mutation(replay_case, damage):
    c = replay_case
    success(c)
    corrupt_receipt(c, damage)
    refused(c)


@pytest.mark.parametrize("replay_case", ["generic"], indirect=True)
@pytest.mark.parametrize("damage", ["wrong-key", "missing-deleted", "malformed-response"])
def test_generic_entry_uses_same_present_receipt_shape_guard(replay_case, damage):
    c = replay_case
    success(c)
    corrupt_receipt(c, damage)
    refused(c)


@pytest.mark.parametrize("replay_case", ["generic", "windows-http"], indirect=True)
def test_exact_intentional_erasure_marker_remains_not_found(replay_case):
    c = replay_case
    success(c)
    # This is precisely the shape delete_capture_source emits, not a corrupt ACK.
    c.store._documents[USER][c.replay_identity] = {"key": c.replay_identity[1], "deleted": True}
    refused(c, 404, "not_found")


@pytest.mark.parametrize("replay_case", ["generic", "windows-http"], indirect=True)
@pytest.mark.parametrize("fence", ["authorization", "stop"])
def test_current_authorization_and_stop_precede_corrupt_receipt(replay_case, fence):
    c = replay_case
    success(c)
    c.store._documents[USER][c.replay_identity] = {}
    if fence == "stop":
        apply(c, command(c))
        status, code = 409, "capture_stopped"
    else:
        if c.replay_http_version:
            c.auth.revoke("control-token")
        else:
            def expired(state):
                raise DomainError(401, "unauthenticated")
            c.registry.capture.archive.authorization_guard = expired
        status, code = 401, "unauthenticated"
    refused(c, status, code)


@pytest.mark.parametrize("replay_case", ["generic", "windows-http"], indirect=True)
@pytest.mark.parametrize("corrupt", [False, True], ids=["valid-receipt", "malformed-ack"])
def test_changed_request_stays_conflict_unless_stored_ack_is_malformed(replay_case, corrupt):
    c = replay_case
    success(c)
    if corrupt:
        corrupt_receipt(c, "invalid-ack")
    c.replay_batch["batch_id"] = "different-request-envelope"
    refused(c, 503 if corrupt else 409, "unavailable" if corrupt else "idempotency_conflict")
