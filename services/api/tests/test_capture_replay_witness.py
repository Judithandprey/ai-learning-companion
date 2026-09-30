"""QA-WIN0210-01: malformed gap receipts cannot erase producer restrictions.

All fixture identities/bytes are synthetic. Losing both profile markers and
damaging receipt rows explicitly bypasses normal storage writes; these are
retained-corruption checks, not a claim that HTTP clients can cause the state.
"""

from copy import deepcopy

import pytest

from services.api.capture import _stream_committed
from services.api.domain import key
from services.api.tests.test_control import USER, documents
from services.api.tests.test_desktop_ingress_http import gap
from services.api.tests.test_ingress_http import request as http_request
from services.api.tests.test_raw_frame_ingress import denied
from services.api.tests.test_windows_ingress_http import (
    CAPABILITIES, WINDOWS_ROUTE, app, raw_setup, registered, setup, submit, success,
    uploaded, windows_http, windows_setup,
)


def lose_profiles(c):
    for kind in ("control_start", "control_stream"):
        del c.store._documents[USER][(kind, c.batch["stream_id"])]["producer_profile"]


def prepare_old_entry(c, family):
    c.old_version = "0.2.6" if family == "raw" else "0.2.4"
    c.old_route = "/v2/process/raw-frames:batch" if family == "raw" else "/v2/process/frames:batch"
    c.old_frame = c.raw_frame if family == "raw" else c.frame
    c.old_submit = c.registry.ingest_raw_frame_request if family == "raw" else c.registry.ingest_frame_request
    c.windows_app = app(c, raw=True, capabilities=CAPABILITIES | {"process.raw-ingress.v0.2.6"})


def old_envelope(c, *, structured=False, record_id="honest-old", sequence=2):
    batch = deepcopy(c.structured_batch if structured else c.batch)
    batch["records"][0].update(record_id=record_id, sequence=sequence, causal_parents=[])
    if c.old_version == "0.2.4":
        batch["records"][0]["media_position"] = c.frame["media_position"]
    return {"contract_version": c.old_version, "batch": batch, "frames": [deepcopy(c.old_frame)]}


def old_request(c, body, request_key):
    return http_request(c.windows_app, "POST", c.old_route, body=body, request_key=request_key)


def refused(c, body, request_key, *, status=503, code="unavailable"):
    before = documents(c)
    response = old_request(c, body, request_key)
    assert response.status_code == status, response.text
    assert response.json() == {"contract_version": c.old_version, "error": code,
                               "retryable": code in {"unavailable", "dependency_missing"}}
    assert documents(c) == before
    # Also prove a deliberate domain refusal, not HTTP masking an unexpected
    # parser exception as the same unavailable response.
    denied(c, lambda: c.old_submit(USER, body, request_key), status, code)


@pytest.fixture(params=["raw", "legacy"])
def witness(request, windows_http):
    c = windows_http
    prepare_old_entry(c, request.param)
    envelope = {**c.windows_envelope, "batch": {**c.batch, "records": [gap(c)]}, "frames": []}
    success(c, submit(c, envelope, "witness-gap"), envelope)
    c.gap_receipt = ("capture_replay", key("POST", WINDOWS_ROUTE, "witness-gap"))
    c.cached_body = old_envelope(c)
    response = old_request(c, c.cached_body, "honest-old-key")
    assert response.status_code == 200, response.text
    c.cached_ack = response.json()
    assert old_request(c, c.cached_body, "honest-old-key").json() == c.cached_ack
    assert not any(kind == "raw_capture_frame" and row["contract_version"] in {"0.2.7", "0.2.9"}
                   for (kind, _), row in documents(c).items())
    lose_profiles(c)
    return c


def request_to_check(c, cached):
    return ((c.cached_body, "honest-old-key") if cached else
            (old_envelope(c, structured=True, record_id="fresh-structured", sequence=3), "fresh-structured-key"))


def damage_gap(c, damage):
    row = c.store._documents[USER][c.gap_receipt]
    if damage == "empty":
        c.store._documents[USER][c.gap_receipt] = {}
    elif damage == "deleted-integer":
        row["deleted"] = 1
    elif damage == "deleted-true-full-row":
        row["deleted"] = True
    elif damage == "bad-key":
        row["key"] = None
    else:
        assert damage == "malformed-ack"
        row["response_json"] = "{broken"


@pytest.mark.parametrize("cached", [False, True], ids=["fresh-structured", "cached-honest"])
@pytest.mark.parametrize("damage", ["empty", "deleted-integer", "deleted-true-full-row", "bad-key", "malformed-ack"])
def test_damaged_gap_witness_cannot_enable_older_ingress(witness, cached, damage):
    c = witness
    damage_gap(c, damage)
    refused(c, *request_to_check(c, cached))


@pytest.mark.parametrize("cached", [False, True], ids=["fresh-structured", "cached-honest"])
def test_intact_gap_witness_preserves_pixels_only_admission(witness, cached):
    c = witness
    refused(c, *request_to_check(c, cached), status=403, code="forbidden")


@pytest.mark.parametrize("cached", [False, True], ids=["fresh-structured", "cached-honest"])
def test_exact_erasure_marker_is_skipped_without_inventing_a_new_witness(witness, cached):
    c = witness
    # Exact output shape of the existing deletion writer. Other originals stay
    # intact solely to isolate classifier semantics, not to simulate deletion.
    c.store._documents[USER][c.gap_receipt] = {"key": c.gap_receipt[1], "deleted": True}
    body, request_key = request_to_check(c, cached)
    before = documents(c)
    response = old_request(c, body, request_key)
    assert response.status_code == 200, response.text
    if cached:
        assert response.json() == c.cached_ack
        assert documents(c) == before
    else:
        assert response.json()["acknowledged"][0]["disposition"] == "accepted"
        retained = documents(c)
        assert old_request(c, body, request_key).json() == response.json()
        assert documents(c) == retained


@pytest.mark.parametrize("family", ["raw", "legacy"])
def test_genuinely_unmarked_old_client_keeps_valid_structured_capture(raw_setup, family):
    c = raw_setup
    c.structured_batch = deepcopy(c.batch)
    prepare_old_entry(c, family)
    assert all("producer_profile" not in documents(c)[(kind, c.batch["stream_id"])]
               for kind in ("control_start", "control_stream"))
    body = old_envelope(c, structured=True, record_id="unmarked-old", sequence=1)
    response = old_request(c, body, "unmarked-old-key")
    assert response.status_code == 200, response.text
    assert response.json()["acknowledged"][0]["disposition"] == "accepted"
    before = documents(c)
    assert old_request(c, body, "unmarked-old-key").json() == response.json()
    assert documents(c) == before


@pytest.mark.parametrize("witness", ["raw"], indirect=True)
@pytest.mark.parametrize("scan", ["stream", "missing-parent", "missing-artifact-pin"])
@pytest.mark.parametrize("erased", [False, True], ids=["malformed-full-true", "exact-erasure"])
def test_sibling_receipt_scans_share_same_erasure_classification(witness, scan, erased):
    c = witness
    if erased:
        c.store._documents[USER][c.gap_receipt] = {"key": c.gap_receipt[1], "deleted": True}
    else:
        damage_gap(c, "deleted-true-full-row")
    if scan == "missing-parent":
        body, request_key = request_to_check(c, False)
        body["batch"]["records"][0]["causal_parents"] = ["unknown-parent"]
        refused(c, body, request_key, status=409 if erased else 503,
                code="dependency_missing" if erased else "unavailable")
        return
    # Isolate the existing receipt fallback by explicitly removing its earlier
    # record/slot/frame/pin witnesses. No extra negative witness is introduced.
    rows = c.store._documents[USER]
    for identity in list(rows):
        if identity[0] in {"capture_record", "capture_slot", "raw_capture_frame", "capture_artifact_ref"}:
            del rows[identity]
        elif identity[0] == "capture_replay" and identity != c.gap_receipt:
            del rows[identity]

    def inspect():
        with c.store.transaction(USER) as tx:
            if scan == "stream":
                return _stream_committed(tx, c.batch["stream_id"])
            return c.registry.capture._artifact(tx, USER, c.source, c.ref, require_typed=True)

    if erased:
        before = documents(c)
        expected = False if scan == "stream" else {**c.ref, "status": "verified"}
        assert inspect() == expected
        assert documents(c) == before
    else:
        denied(c, inspect, 503, "unavailable")
