"""Retained desktop coverage without invented pixels; synthetic actor store."""

from copy import deepcopy
import json

import pytest

from services.api.domain import key
from services.api.errors import DomainError
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_desktop_frame_ingress import additional, desktop_ingest
from services.api.tests.test_desktop_ingress_http import (
    DESKTOP_ROUTE, desktop_http, desktop_gap_http, desktop_setup, gap,
    raw_setup, registered, setup, submit, success, unchanged, uploaded,
)
from services.api.tests.test_process_context_reader import reader, refused
from services.api.tests.test_raw_frame_ingress import ingest as raw_ingest


@pytest.mark.parametrize("coverage", ["partial", "unobserved", "unknown"])
def test_first_gap_is_readable_without_any_original_or_frame(desktop_gap_http, coverage):
    c = desktop_gap_http
    item = c.desktop_envelope["batch"]["records"][0]
    item["evidence"]["coverage"] = coverage
    success(c, submit(c))
    before = documents(c)
    packet = reader(c).read_desktop([item["record_id"]])
    assert packet["frames"] == [] and packet["sources"] == [c.descriptor]
    assert packet["batch"]["records"] == [item]
    assert packet["batch"]["delivery_mode"] == "historical"
    assert packet["batch"]["records"][0]["clock"] is None
    assert not any(kind == "raw_capture_frame" for kind, _ in before)
    assert ("artifact", c.ref["artifact_id"]) not in before
    assert ("artifact", c.ink_ref["artifact_id"]) not in before
    packet["batch"]["records"][0]["evidence"]["limitations"].append("detached")
    assert reader(c).read_desktop([item["record_id"]])["batch"]["records"] == [item]
    assert documents(c) == before
    refused(c, lambda: reader(c)([item["record_id"]]), 503, "unavailable")
    refused(c, lambda: reader(c).read_raw([item["record_id"]]), 503, "unavailable")


@pytest.mark.parametrize("missing", ["capture_record", "capture_slot", "capture_binding", "source", "snapshot"])
@pytest.mark.parametrize("new_key", [False, True])
def test_first_gap_missing_inventory_cannot_be_repaired_by_retry(desktop_gap_http, missing, new_key):
    c = desktop_gap_http
    success(c, submit(c))
    identifier = {
        "capture_record": "desktop-gap-1",
        "capture_slot": key(c.batch["device_id"], c.batch["stream_id"], 1),
        "capture_binding": c.batch["stream_id"], "source": c.source["source_id"],
        "snapshot": key(c.source["source_id"], c.source["source_version"]),
    }[missing]
    del c.store._documents[USER][(missing, identifier)]
    unchanged(c, lambda: submit(c, request_key="new-gap-key" if new_key else "desktop-http"),
              503, "unavailable")
    assert (missing, identifier) not in documents(c)


@pytest.mark.parametrize("witness", ["slot", "receipt"])
def test_gap_only_witness_prevents_recreating_stream_binding(desktop_gap_http, witness):
    c = desktop_gap_http
    success(c, submit(c))
    rows = c.store._documents[USER]
    del rows[("capture_binding", c.batch["stream_id"])]
    del rows[("capture_record", "desktop-gap-1")]
    if witness == "slot":
        del rows[("capture_replay", key("POST", DESKTOP_ROUTE, "desktop-http"))]
    else:
        del rows[("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1))]
    envelope = deepcopy(c.desktop_envelope)
    envelope["batch"]["records"] = [gap(c, record_id="new-gap", sequence=2)]
    unchanged(c, lambda: submit(c, envelope=envelope, request_key="fresh-after-loss"), 503, "unavailable")


@pytest.mark.parametrize("child_family", ["desktop", "raw", "gap"])
def test_retained_gap_is_valid_ancestor_for_known_typed_paths(desktop_http, child_family):
    c = desktop_http
    parent = gap(c)
    envelope = {"contract_version": "0.2.8", "batch": {**c.batch, "records": [parent]}, "frames": []}
    success(c, submit(c, envelope=envelope), envelope)
    before = documents(c)
    if child_family == "gap":
        child = gap(c, record_id="child-gap", sequence=2, parents=[parent["record_id"]])
        next_envelope = {**envelope, "batch": {**c.batch, "records": [child]}}
        ack = success(c, submit(c, envelope=next_envelope, request_key="child-gap"), next_envelope)
        assert reader(c).read_desktop([child["record_id"], parent["record_id"]])["frames"] == []
    else:
        child, frame = additional(c, family=child_family, parents=[parent["record_id"]])
        call = desktop_ingest if child_family == "desktop" else raw_ingest
        ack = call(c, {**c.batch, "records": [child]}, [frame], "child-frame")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert documents(c)[("capture_record", parent["record_id"])] == before[("capture_record", parent["record_id"])]


@pytest.mark.parametrize("damage", ["observed_coverage", "invented_clock", "source_identity", "generation", "slot"])
def test_corrupt_retained_gap_withholds_read_and_child_commit(desktop_http, damage):
    c = desktop_http
    parent = gap(c)
    envelope = {"contract_version": "0.2.8", "batch": {**c.batch, "records": [parent]}, "frames": []}
    success(c, submit(c, envelope=envelope), envelope)
    rows = c.store._documents[USER]
    stored = rows[("capture_record", parent["record_id"])]
    original = json.loads(stored["canonical_json"])
    if damage == "observed_coverage":
        original["record"]["evidence"]["coverage"] = "observed_samples"
    elif damage == "invented_clock":
        original["record"]["observed_at"] = "2026-09-30T12:00:00Z"
    elif damage == "source_identity":
        original["session_id"] = "other-session"
    elif damage == "generation":
        rows[("capture_binding", c.batch["stream_id"])]["authorization_generation"] += 1
    else:
        del rows[("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1))]
    # Canonical serialization keeps the corruption focused on semantic binding.
    stored["canonical_json"] = json.dumps(original, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    refused(c, lambda: reader(c).read_desktop([parent["record_id"]]), 503, "unavailable")
    item, frame = additional(c, parents=[parent["record_id"]])
    before = documents(c)
    with pytest.raises(DomainError):
        desktop_ingest(c, {**c.batch, "records": [item]}, [frame], "child-corrupt-gap")
    assert documents(c) == before


def test_gap_history_survives_stop_but_not_revocation_or_deletion(desktop_gap_http):
    c = desktop_gap_http
    success(c, submit(c))
    expected = reader(c).read_desktop(["desktop-gap-1"])
    apply(c, command(c, "stop"))
    assert reader(c).read_desktop(["desktop-gap-1"]) == expected
    c.archive.revoke_source(USER, c.source["source_id"])
    refused(c, lambda: reader(c).read_desktop(["desktop-gap-1"]), 403, "forbidden")
    c.archive.delete_source(USER, c.source["source_id"])
    refused(c, lambda: reader(c).read_desktop(["desktop-gap-1"]), 404, "not_found")
    # The previously stopped live stream is checked before source lookup.
    unchanged(c, lambda: submit(c), 409, "capture_stopped")


def test_gap_as_erased_parent_cannot_be_recreated_by_descendant(desktop_http):
    c = desktop_http
    parent = gap(c)
    envelope = {"contract_version": "0.2.8", "batch": {**c.batch, "records": [parent]}, "frames": []}
    success(c, submit(c, envelope=envelope), envelope)
    item, frame = additional(c, parents=[parent["record_id"]])
    desktop_ingest(c, {**c.batch, "records": [item]}, [frame], "gap-child")
    rows = c.store._documents[USER]
    for identity in [("capture_record", parent["record_id"]),
                     ("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 1)),
                     ("capture_replay", key("POST", DESKTOP_ROUTE, "desktop-http"))]:
        del rows[identity]
    # The child's causal-parent reference is the only retained record witness.
    changed = deepcopy(envelope)
    changed["batch"]["records"][0]["sequence"] = 3
    unchanged(c, lambda: submit(c, envelope=changed, request_key="repair-gap"), 503, "unavailable")
