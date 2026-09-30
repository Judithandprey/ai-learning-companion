"""QA-FINDING-NATIVE-01: committed exact raw HTTP replay is an integrity check.

Synthetic actor state is deliberately corrupted outside immutable-store APIs.
These ASGI checks establish classification and refusal, not native/DB evidence.
"""

from copy import deepcopy
import hashlib
import json

import pytest

from packages.contracts import raw_capture_ingress as wire
from services.api.domain import key
from services.api.errors import DomainError
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_ingress_http import (
    error as legacy_error, ingest as legacy_ingest, success as legacy_success,
)
from services.api.tests.test_raw_ingress_http import (
    RAW_FRAMES, error, ingest, raw_captured, raw_http, raw_setup, registered,
    setup, success, uploaded,
)


DIVERGENCES = ("frame_artifact_sha256", "artifact_ref_sha256", "slot_other_record",
               "record_reserialized", "binding_source_version")


def diverge(c, case):
    rows = c.store._documents[USER]
    if case == "frame_artifact_sha256":
        rows[("raw_capture_frame", c.raw_frame["frame_id"])]["artifact"]["sha256"] = "0" * 64
    elif case == "artifact_ref_sha256":
        rows[("capture_artifact_ref", c.ref["artifact_id"])]["sha256"] = "0" * 64
    elif case == "slot_other_record":
        rows[("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1))]["record_id"] = "other-record"
    elif case == "record_reserialized":
        row = rows[("capture_record", "process-1")]
        encoded = row["canonical_json"]
        row["canonical_json"] = json.dumps(json.loads(encoded))
        assert row["canonical_json"] != encoded
    else:
        assert case == "binding_source_version"
        rows[("artifact", c.ref["artifact_id"])]["original_binding"]["source"]["source_version"] = 2


def unchanged_error(c, status, code, *, envelope=None, request_key="raw-http"):
    original = deepcopy(c.raw_envelope if envelope is None else envelope)
    before = documents(c)
    response = ingest(c, envelope=envelope, request_key=request_key)
    # Check both nonmutation promises even when the response classification fails.
    assert documents(c) == before
    assert (c.raw_envelope if envelope is None else envelope) == original
    error(response, status, code)
    expected = {"contract_version": "0.2.6", "error": code,
                "retryable": code in {"unavailable", "dependency_missing"}}
    assert response.content == json.dumps(expected, separators=(",", ":")).encode()


@pytest.mark.parametrize("case", DIVERGENCES)
def test_exact_replay_over_divergent_retained_row_is_unavailable(raw_captured, case):
    c = raw_captured
    encoded = wire.canonical_request("RawFrameBatchRequest", c.raw_envelope)
    replay = documents(c)[("capture_replay", key("POST", RAW_FRAMES, "raw-http"))]
    assert replay["fingerprint"] == hashlib.sha256(encoded).hexdigest()
    assert json.loads(replay["response_json"]) == c.raw_ack
    original_request = deepcopy(c.raw_envelope)
    diverge(c, case)
    assert c.raw_envelope == original_request
    unchanged_error(c, 503, "unavailable")


def test_exact_replay_with_divergent_non_frame_ink_binding_is_unavailable(raw_captured):
    c = raw_captured
    assert c.ink_ref["artifact_id"] != c.raw_frame["artifact"]["artifact_id"]
    row = c.store._documents[USER][("artifact", c.ink_ref["artifact_id"])]
    row["original_binding"]["source"]["source_version"] = 2
    unchanged_error(c, 503, "unavailable")


def test_frame_tombstone_precedes_divergent_canonical_record(raw_captured):
    c = raw_captured
    diverge(c, "record_reserialized")
    c.store._documents[USER][("frame_tombstone", c.raw_frame["frame_id"])] = {
        "frame_id": c.raw_frame["frame_id"]}
    unchanged_error(c, 404, "not_found")


def test_legacy_http_exact_replay_keeps_existing_retained_conflict_classification(uploaded):
    c = uploaded
    legacy_success(legacy_ingest(c), "ProcessBatchAck")
    c.store._documents[USER][("capture_artifact_ref", c.ref["artifact_id"])]["sha256"] = "0" * 64
    before = documents(c)
    original_request = deepcopy(c.envelope)
    response = legacy_ingest(c)
    assert documents(c) == before
    assert c.envelope == original_request
    legacy_error(response, 409, "record_conflict")


def test_intact_exact_replay_and_new_key_duplicate_keep_committed_ack(raw_captured):
    c = raw_captured
    before = documents(c)
    original_request = deepcopy(c.raw_envelope)
    assert success(c, ingest(c)) == c.raw_ack
    assert documents(c) == before
    duplicate = success(c, ingest(c, request_key="new-key"))
    assert duplicate["acknowledged"] == [{**receipt, "disposition": "duplicate"}
                                        for receipt in c.raw_ack["acknowledged"]]
    after = documents(c)
    new_replay = ("capture_replay", key("POST", RAW_FRAMES, "new-key"))
    assert set(after) - set(before) == {new_replay}
    assert {identity: row for identity, row in after.items() if identity != new_replay} == before
    assert c.raw_envelope == original_request


@pytest.mark.parametrize("change", ["frame_metadata", "record_evidence", "artifact_hash", "occupied_sequence"])
def test_genuine_new_key_client_conflicts_remain_409(raw_captured, change):
    c = raw_captured
    envelope = deepcopy(c.raw_envelope)
    if change == "frame_metadata":
        envelope["frames"][0]["orientation"]["value"] = 1
    elif change == "record_evidence":
        envelope["batch"]["records"][0]["evidence"]["reason_quote"] = "Different client observation."
    elif change == "artifact_hash":
        envelope["frames"][0]["artifact"]["sha256"] = "0" * 64
        envelope["batch"]["records"][0]["artifacts"][0]["sha256"] = "0" * 64
    else:
        envelope["batch"]["records"][0]["record_id"] = "new-record-in-occupied-slot"
    wire.validate("RawFrameBatchRequest", envelope)
    unchanged_error(c, 409, "record_conflict", envelope=envelope, request_key="new-key")


@pytest.mark.parametrize("case", (None, *DIVERGENCES))
def test_same_key_changed_body_remains_idempotency_conflict(raw_captured, case):
    c = raw_captured
    if case is not None:
        diverge(c, case)
    envelope = deepcopy(c.raw_envelope)
    envelope["batch"]["batch_id"] = "changed-client-envelope"
    unchanged_error(c, 409, "idempotency_conflict", envelope=envelope)


@pytest.mark.parametrize("case,status,code", [
    ("frame_artifact_sha256", 409, "record_conflict"),
    ("binding_source_version", 422, "invalid_request"),
])
def test_internal_map_replay_keeps_its_existing_classification(raw_http, case, status, code):
    c = raw_http
    c.registry.ingest_raw_frames(USER, c.batch, [c.raw_frame], "internal-only")
    diverge(c, case)
    before = documents(c)
    original_request = deepcopy(c.raw_envelope)
    with pytest.raises(DomainError) as exc:
        c.registry.ingest_raw_frames(USER, c.batch, [c.raw_frame], "internal-only")
    assert (exc.value.status, exc.value.code) == (status, code)
    assert documents(c) == before
    assert c.raw_envelope == original_request


@pytest.mark.parametrize("fence,status,code", [
    ("stop", 409, "capture_stopped"), ("auth", 401, "unauthenticated"),
    ("source_revoke", 404, "not_found"), ("frame_tombstone", 404, "not_found"),
    ("replay_tombstone", 404, "not_found"),
])
def test_current_fences_precede_replay_integrity_classification(raw_captured, fence, status, code):
    c = raw_captured
    diverge(c, "frame_artifact_sha256")
    if fence == "stop":
        apply(c, command(c))
    elif fence == "auth":
        c.auth.revoke("control-token")
    elif fence == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif fence == "frame_tombstone":
        c.store._documents[USER][("frame_tombstone", c.raw_frame["frame_id"])] = {
            "frame_id": c.raw_frame["frame_id"]}
    else:
        replay_key = key("POST", RAW_FRAMES, "raw-http")
        c.store._documents[USER][("capture_replay", replay_key)] = {"key": replay_key, "deleted": True}
    unchanged_error(c, status, code)
