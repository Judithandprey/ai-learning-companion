"""Independent QA retest of QA-WIN0210-01 (malformed receipt witness) at main b19930b (Backend 7d19e09 as f7ef3ac).

Reuses the runtime rig, request builders and the autouse crash spy of test_p0_13_windows_ingress_qa.py (whose six
original malformed_gap cases, intact-witness refusals and erasure/removal controls stay the mandatory regressions).
This file adds the other malformed receipt shapes the correction states it refuses, deliberate-erasure and genuine
unmarked controls, the breadth of fail-closed refusal, and the lead-declared key-semantics residual.
All receipt damage is SYNTHETIC retained damage that no HTTP route or writer can produce.
"""

from copy import deepcopy

import pytest

from services.api.domain import key
from test_p0_13_windows_ingress_qa import (  # noqa: F401  (crashes and witness_rig are fixtures used by pytest)
    GAP_RECEIPT, RAW, SOURCE, USER, WINDOWS, DowngradeAccepted, Rig, chain, crashes, raw_body, refused, witness_rig,
)


def damage_gap_receipt(rig, damage):
    row = rig.store._documents[USER][GAP_RECEIPT]
    if damage == "key_empty":
        row["key"] = ""
    elif damage == "key_not_string":
        row["key"] = 7
    elif damage == "key_missing":
        del row["key"]
    elif damage == "deleted_string":
        row["deleted"] = "yes"
    elif damage == "deleted_none":
        row["deleted"] = None
    elif damage == "deleted_missing":
        del row["deleted"]
    elif damage == "extra_member":
        row["note"] = "qa"
    elif damage == "fingerprint_bad":
        row["fingerprint"] = "F" * 64
    elif damage == "ack_not_json":
        row["response_json"] = "{broken"
    elif damage == "ack_wrong_shape":
        row["response_json"] = '{"contract_version": "0.2.0"}'
    elif damage == "source_ids_duplicate":
        row["source_ids"] = [SOURCE, SOURCE]
    elif damage == "erasure_with_empty_key":
        rig.store._documents[USER][GAP_RECEIPT] = {"key": "", "deleted": True}
    else:
        raise AssertionError(damage)


DAMAGES = ["key_empty", "key_not_string", "key_missing", "deleted_string", "deleted_none", "deleted_missing", "extra_member",
           "fingerprint_bad", "ack_not_json", "ack_wrong_shape", "source_ids_duplicate", "erasure_with_empty_key"]


@pytest.mark.parametrize("request_kind", ["fresh", "cached"])
@pytest.mark.parametrize("damage", DAMAGES)
def test_other_malformed_witness_shapes_refuse_503_deliberately(witness_rig, damage, request_kind):
    """With both producer markers lost, any malformed Windows gap receipt fails closed: exactly 503 unavailable,
    no mutation, and (crash spy) a deliberate DomainError rather than the response boundary masking an exception."""
    rig = witness_rig
    damage_gap_receipt(rig, damage)
    if request_kind == "fresh":  # a structured claim that the pixels-only stream must never admit
        refused(rig, raw_body(rig, "structured"), "qa-raw-key", 503, "unavailable", path=RAW, version="0.2.6")
    else:
        refused(rig, rig.cached_raw, "qa-raw-cached-key", 503, "unavailable", path=RAW, version="0.2.6")


@pytest.mark.parametrize("request_kind", ["fresh", "cached"])
def test_exact_erasure_of_the_gap_receipt_is_not_corruption(witness_rig, request_kind):
    """Control: the writer's exact erasure shape {key, deleted:true} is intentional erasure, classified as such (no
    503). Like removing the receipt row, it then leaves no Windows-use witness (a further synthetic fault on top of
    the lost markers), so the older-family request is served; this is the documented erasure semantics."""
    rig = witness_rig
    rig.store._documents[USER][GAP_RECEIPT] = {"key": GAP_RECEIPT[1], "deleted": True}
    if request_kind == "fresh":
        response = rig.post(raw_body(rig, "structured"), "qa-raw-key", RAW)
        assert response.status_code == 200 and response.json()["acknowledged"][0]["disposition"] == "accepted", response.text
    else:
        before = rig.documents()
        response = rig.post(rig.cached_raw, "qa-raw-cached-key", RAW)
        assert response.status_code == 200 and response.json() == rig.cached_ack, response.text
        assert rig.documents() == before


def test_genuine_unmarked_generic_capture_is_unaffected():
    """A never-Windows, unmarked generic stream with valid receipts and an intentional erasure row keeps accepting
    structured raw capture: fresh, exact replay (same ACK, no writes) and a further fresh batch."""
    rig = Rig(raw_ingress=True)
    rig.open(profile=None, windows=False)
    rig.start()
    first_body = raw_body(rig, "structured", "qa-generic-1", 1)
    first_body["batch"]["records"][0]["causal_parents"] = []
    first = rig.post(first_body, "qa-generic-1-key", RAW)
    assert first.status_code == 200 and first.json()["acknowledged"][0]["disposition"] == "accepted", first.text
    before = rig.documents()
    again = rig.post(first_body, "qa-generic-1-key", RAW)
    assert again.status_code == 200 and again.json() == first.json() and rig.documents() == before
    erased = key("POST", RAW, "qa-some-erased-key")
    rig.store._documents[USER][("capture_replay", erased)] = {"key": erased, "deleted": True}  # SYNTHETIC writer-shaped erasure
    second_body = raw_body(rig, "structured", "qa-generic-2", 2)
    second_body["batch"]["records"][0]["causal_parents"] = ["qa-generic-1"]
    second = rig.post(second_body, "qa-generic-2-key", RAW)
    assert second.status_code == 200 and second.json()["acknowledged"][0]["disposition"] == "accepted", second.text
    stored = rig.documents()[("capture_record", "qa-generic-2")]
    assert '"web_dom"' in stored["canonical_json"] and '"structured"' in stored["canonical_json"]


def test_unrelated_malformed_receipt_fails_fresh_capture_closed(chain):
    """Breadth of fail-closed refusal: a malformed receipt row anywhere in the actor's retained receipts (here a
    truthy-deleted full row under an unrelated key) refuses a fresh Windows batch on the marked stream with 503 and
    no writes, while the valid exact receipt of the committed batch still replays its original ACK."""
    rig = chain
    other = key("POST", RAW, "qa-unrelated-key")
    row = deepcopy(rig.store._documents[USER][("capture_replay", key("POST", WINDOWS, "qa-chain-key"))])
    rig.store._documents[USER][("capture_replay", other)] = {**row, "key": other, "deleted": 1}  # SYNTHETIC
    f = rig.frame("qa-f-new", "raw1", sample=11)
    refused(rig, rig.envelope("qa-new", [rig.record("qa-new", 6, f, parents=["qa-distinct"])], [f]), "qa-new-key", 503, "unavailable")
    before = rig.documents()
    replay = rig.post(rig.body, "qa-chain-key")
    assert replay.status_code == 200 and replay.json() == rig.ack and rig.documents() == before


@pytest.mark.xfail(raises=DowngradeAccepted, strict=True, reason=(
    "lead-declared residual of QA-WIN0210-01: key semantics are not validated; a well-formed receipt whose key was "
    "rewritten into a non-witness namespace no longer witnesses Windows use"))
def test_key_rewritten_into_another_namespace_residual(witness_rig):
    rig = witness_rig
    row = rig.store._documents[USER].pop(GAP_RECEIPT)
    moved = key("POST", RAW, "qa-gap-key")
    rig.store._documents[USER][("capture_replay", moved)] = {**row, "key": moved}  # SYNTHETIC well-formed but misfiled
    before = rig.documents()
    response = rig.post(raw_body(rig, "structured"), "qa-raw-key", RAW)
    if response.status_code == 200:
        raise DowngradeAccepted(f"200, store changed: {rig.documents() != before}")
    assert response.status_code in (403, 503) and rig.documents() == before
