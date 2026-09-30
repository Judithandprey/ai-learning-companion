"""Explicit 0.2.7 readers over stored synthetic PNG/ink, without native capture."""

import asyncio
import base64
from concurrent.futures import CancelledError as FutureCancelledError
from contextlib import contextmanager
from copy import deepcopy

import pytest

from packages.contracts.desktop_frame import ESTIMATE_BASIS
from services.api.domain import key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_desktop_frame_ingress import (
    setup, registered, uploaded, raw_setup, desktop_setup, desktopcaptured,
    additional, desktop_ingest,
)
from services.api.tests.test_process_context_reader import current_guard
from services.api.tests.test_raw_frame_ingress import rawcaptured, ingest as raw_ingest
from services.api.tests.test_raw_frame_readers import canonical, reader, resolver, refused


def test_desktop_packet_and_png_preserve_exact_native_facts_and_unknowns(desktopcaptured):
    c = desktopcaptured
    before = documents(c)
    packet = reader(c).read_desktop(["process-1"])
    assert set(packet) == {"batch", "sources", "frames"}
    assert packet["batch"]["records"] == c.batch["records"]
    assert packet["batch"]["delivery_mode"] == "historical"
    assert packet["sources"] == [c.descriptor] and packet["frames"] == [c.desktop_frame]
    frame = packet["frames"][0]
    assert frame["profile"]["host_clock"]["display_time_ticks_decimal"] == "18446744073709551615"
    assert frame["profile"]["sample"]["dirty_rects"] == []
    assert frame["profile"]["sample"]["content_rect"] is None
    assert frame["captured_at"] is frame["media_position"] is frame["pixel_orientation"] is None
    assert frame["timing"]["callback_clock"] is None and frame["pixels_transformed"] is False
    assert frame["callback_sequence"] != packet["batch"]["records"][0]["sequence"]
    assert packet["batch"]["records"][0]["clock"] is None
    assert packet["batch"]["records"][0]["artifacts"] == [c.ref, c.ink_ref]
    image = resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data))
    assert image == {"status": "available", "frame": c.desktop_frame,
                     "media_type": "image/png", "data": c.data}
    assert documents(c) == before
    frame["profile"]["sample"]["dirty_rects"].append({"detached": True})
    image["frame"]["profile"]["native_session_id"] = "detached"
    packet["batch"]["records"][0]["evidence"]["reason_quote"] = "detached"
    packet["sources"][0]["source_timezone"] = "detached"
    assert reader(c).read_desktop(["process-1"])["frames"] == [c.desktop_frame]
    assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data))["frame"] == c.desktop_frame


def test_desktop_optional_estimate_and_native_sample_pts_remain_separate(desktop_setup):
    c = desktop_setup
    c.desktop_frame["timing"].update(
        observed_at_estimate="2026-09-30T12:00:07.250Z",
        estimate_basis=ESTIMATE_BASIS,
    )
    c.desktop_frame["profile"]["sample"]["presentation_time_seconds"] = -0.125
    desktop_ingest(c)
    frame = reader(c).read_desktop(["process-1"])["frames"][0]
    assert frame == c.desktop_frame
    assert frame["captured_at"] is frame["media_position"] is frame["timing"]["callback_clock"] is None
    assert resolver(c).resolve_desktop(frame, max_bytes=len(c.data))["data"] == c.data


def test_desktop_metadata_uses_ordered_point_reads_without_scans_writes_or_blob_decode(desktopcaptured, monkeypatch):
    c = desktopcaptured
    second = record(c.batch, "second", 2, causal_parents=["process-1"])
    third = record(c.batch, "third", 3, causal_parents=["second"])
    desktop_ingest(c, {**c.batch, "records": [second, third]}, request_key="children")
    before, calls, guards, artifact_reads = documents(c), [], [], []
    actual_get, actual_transaction = _MemoryTransaction.get, c.store.transaction
    authorize = current_guard(c)

    def get(tx, kind, identifier):
        if kind == "capture_record":
            assert identifier in {"second", "third"}
        if kind == "artifact":
            artifact_reads.append(identifier)
        return actual_get(tx, kind, identifier)

    def denied(*args, **kwargs):
        pytest.fail("metadata reader attempted scan/write/byte decoding")

    def guard(state):
        guards.append(True)
        authorize(state)

    @contextmanager
    def transaction(actor):
        calls.append(actor)
        with actual_transaction(actor) as tx:
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "get", get)
        for method in ("scan", "put", "delete"):
            patch.setattr(_MemoryTransaction, method, denied)
        patch.setattr(base64, "b64decode", denied)
        patch.setattr(c.store, "transaction", transaction)
        packet = AuthorizedProcessContextReader(c.store, USER, guard).read_desktop(["third", "second"])
    assert calls == [USER] and guards == [True, True]
    assert artifact_reads == [c.ref["artifact_id"]]
    assert packet["batch"]["records"] == [third, second]
    assert packet["frames"] == [c.desktop_frame]
    assert "data_base64" not in canonical(packet).decode()
    assert documents(c) == before


def test_existing_readers_remain_closed_to_desktop(desktopcaptured):
    c = desktopcaptured
    refused(c, lambda: reader(c).read_raw(["process-1"]), 503)
    refused(c, lambda: reader(c)(["process-1"]), 409)
    assert resolver(c).resolve_raw(c.desktop_frame, max_bytes=len(c.data)) == {"status": "unavailable"}
    assert resolver(c)(c.desktop_frame, max_bytes=len(c.data)) == {"status": "unavailable"}


def test_desktop_entrypoints_remain_closed_to_raw_025(rawcaptured):
    c = rawcaptured
    refused(c, lambda: reader(c).read_desktop(["process-1"]), 503)
    assert resolver(c).resolve_desktop(c.raw_frame, max_bytes=len(c.data)) == {"status": "unavailable"}
    assert reader(c).read_raw(["process-1"])["frames"] == [c.raw_frame]
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data))["data"] == c.data


@pytest.mark.parametrize("family", ["raw", "legacy"])
def test_mixed_selection_is_refused_without_omitting_records(desktopcaptured, family):
    c = desktopcaptured
    if family == "raw":
        item, frame = additional(c, family="raw")
        raw_ingest(c, {**c.batch, "records": [item]}, [frame], "raw-sibling")
    else:
        frame = {**c.frame, "frame_id": "legacy-frame"}
        item = record(c.batch, "legacy-record", 2, frame_id=frame["frame_id"],
                      media_position=frame["media_position"])
        c.registry.ingest_frames(USER, {**c.batch, "records": [item]}, [frame], "legacy-sibling")
    ids = ["process-1", item["record_id"]]
    refused(c, lambda: reader(c).read_desktop(ids), 503 if family == "raw" else 409)
    refused(c, lambda: reader(c).read_desktop(list(reversed(ids))), 503 if family == "raw" else 409)


@pytest.mark.parametrize("ids", [[], ["process-1", "process-1"], [1], ("process-1",), [f"r{i}" for i in range(101)]])
def test_desktop_invalid_selection_precedes_storage(desktopcaptured, monkeypatch, ids):
    read = reader(desktopcaptured)
    monkeypatch.setattr(desktopcaptured.store, "transaction", lambda *a: pytest.fail("invalid selection reached store"))
    with pytest.raises(DomainError) as error:
        read.read_desktop(ids)
    assert error.value.status == 422


def test_desktop_metadata_budget_counts_complete_canonical_utf8(desktopcaptured):
    c = desktopcaptured
    packet = reader(c).read_desktop(["process-1"])
    size = len(canonical(packet))
    assert reader(c).read_desktop(["process-1"], max_metadata_bytes=size) == packet
    refused(c, lambda: reader(c).read_desktop(["process-1"], max_metadata_bytes=size - 1), 413)
    refused(c, lambda: reader(c).read_desktop(["process-1"], max_metadata_bytes=True), 422)
    refused(c, lambda: reader(c).read_desktop(["process-1"], max_metadata_bytes=4 * 1024 * 1024 + 1), 422)


@pytest.mark.parametrize("damage", [
    "dual_kind", "frame_stream", "future_version", "native_ticks", "capture_clock",
    "source_missing", "snapshot_missing", "historical_generation", "pin",
    "original_missing", "original_source", "original_alias",
])
def test_desktop_corrupt_retained_metadata_withholds_complete_selection(desktopcaptured, damage):
    c = desktopcaptured
    actor = c.store._documents[USER]
    frame = actor[("raw_capture_frame", c.desktop_frame["frame_id"])]
    artifact_key = ("artifact", c.ref["artifact_id"])
    if damage == "dual_kind":
        actor[("frame", c.desktop_frame["frame_id"])] = deepcopy(c.frame)
    elif damage == "frame_stream":
        frame["stream_id"] = "other-stream"
    elif damage == "future_version":
        frame["contract_version"] = "0.2.8"
    elif damage == "native_ticks":
        frame["profile"]["host_clock"]["display_time_ticks_decimal"] = "18446744073709551616"
    elif damage == "capture_clock":
        frame["captured_at"] = "2026-09-30T12:00:07.250Z"
    elif damage == "source_missing":
        del actor[("source", c.source["source_id"])]
    elif damage == "snapshot_missing":
        del actor[("snapshot", key(c.source["source_id"], 1))]
    elif damage == "historical_generation":
        actor[("capture_binding", c.batch["stream_id"])]["authorization_generation"] += 1
    elif damage == "pin":
        actor[("capture_artifact_ref", c.ref["artifact_id"])]["byte_length"] += 1
    elif damage == "original_missing":
        del actor[artifact_key]
    elif damage == "original_source":
        actor[artifact_key]["original_binding"]["source"]["source_version"] = 2
    else:
        actor[artifact_key]["byte_length"] += 1
    refused(c, lambda: reader(c).read_desktop(["process-1"]), 503)
    assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data))["status"] != "available"


@pytest.mark.parametrize("kind", ["frame_tombstone", "original_artifact_tombstone", "capture_artifact_tombstone"])
def test_desktop_tombstones_withhold_metadata_and_bytes(desktopcaptured, kind):
    c = desktopcaptured
    identifier = c.desktop_frame["frame_id"] if kind == "frame_tombstone" else c.ref["artifact_id"]
    c.store._documents[USER][(kind, identifier)] = {}
    refused(c, lambda: reader(c).read_desktop(["process-1"]), 404)
    assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data)) == {"status": "missing"}


def test_desktop_png_resolution_requires_exact_descriptor_canonical_bytes_and_bound(desktopcaptured):
    c = desktopcaptured
    changed = deepcopy(c.desktop_frame)
    changed["callback_sequence"] += 1
    assert resolver(c).resolve_desktop(changed, max_bytes=len(c.data)) == {"status": "unavailable"}
    assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data) - 1) == {"status": "byte_limit"}
    assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data))["data"] == c.data
    original = c.store._documents[USER][("artifact", c.ref["artifact_id"])]
    original["data_base64"] = "!" + original["data_base64"][1:]
    assert reader(c).read_desktop(["process-1"])["frames"] == [c.desktop_frame]
    assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data)) == {"status": "unavailable"}


@pytest.mark.parametrize("action", ["stop", "withdraw"])
def test_desktop_history_remains_readable_after_stop(desktopcaptured, action):
    c = desktopcaptured
    expected = reader(c).read_desktop(["process-1"])
    apply(c, command(c, action))
    assert reader(c).read_desktop(["process-1"]) == expected
    assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data))["data"] == c.data


@pytest.mark.parametrize("action,status,image_status", [
    ("source_revoke", 403, "revoked"), ("source_delete", 404, "missing"),
    ("account_revoke", 403, "revoked"),
])
def test_desktop_current_revocation_or_deletion_withholds_history(desktopcaptured, action, status, image_status):
    c = desktopcaptured
    if action == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif action == "source_delete":
        c.archive.delete_source(USER, c.source["source_id"])
    else:
        c.archive.set_authorization(USER, False)
    refused(c, lambda: reader(c).read_desktop(["process-1"]), status)
    assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data)) == {"status": image_status}


def test_desktop_regrant_uses_current_guard_and_retains_historical_generation(desktopcaptured):
    c = desktopcaptured
    expected = reader(c).read_desktop(["process-1"])
    retained = deepcopy(c.store._documents[USER][("capture_binding", c.batch["stream_id"])])
    c.archive.set_authorization(USER, False)
    state = c.archive.set_authorization(USER, True)
    assert state["generation"] != retained["authorization_generation"]
    refused(c, lambda: reader(c).read_desktop(["process-1"]), 403)

    def fresh_guard(current):
        assert c.store._local.in_transaction
        if current["generation"] != state["generation"]:
            raise DomainError(403, "stale_generation")

    assert AuthorizedProcessContextReader(c.store, USER, fresh_guard).read_desktop(["process-1"]) == expected
    assert AuthorizedImageResolver(c.store, USER, fresh_guard).resolve_desktop(
        c.desktop_frame, max_bytes=len(c.data))["data"] == c.data
    assert c.store._documents[USER][("capture_binding", c.batch["stream_id"])] == retained


@pytest.mark.parametrize("operation", ["metadata", "bytes"])
@pytest.mark.parametrize("stage", ["locked", "final"])
def test_desktop_current_guard_before_and_after_retained_reads(desktopcaptured, monkeypatch, operation, stage):
    c = desktopcaptured
    transaction, get = c.store.transaction, _MemoryTransaction.get

    @contextmanager
    def locked(actor):
        with transaction(actor) as tx:
            c.auth.revoke("read-token")
            yield tx

    def guarded_get(tx, kind, identifier):
        if stage == "locked":
            assert kind == "authorization", "revoked caller reached retained metadata"
        result = get(tx, kind, identifier)
        if stage == "final" and kind == "artifact":
            c.auth.revoke("read-token")
        return result

    if stage == "locked":
        monkeypatch.setattr(c.store, "transaction", locked)
    monkeypatch.setattr(_MemoryTransaction, "get", guarded_get)
    if operation == "metadata":
        with pytest.raises(DomainError) as error:
            reader(c).read_desktop(["process-1"])
        assert error.value.status == 401
    else:
        assert resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data)) == {"status": "revoked"}


@pytest.mark.parametrize("operation", ["metadata", "bytes"])
@pytest.mark.parametrize("error_type", [FutureCancelledError, asyncio.CancelledError, RuntimeError])
def test_desktop_transaction_exit_failure_withholds_result_and_propagates_cancellation(desktopcaptured, monkeypatch, operation, error_type):
    c = desktopcaptured
    before, transaction = documents(c), c.store.transaction
    error = error_type("PRIVATE synthetic transaction exit")

    @contextmanager
    def failed(actor):
        with transaction(actor) as tx:
            yield tx
            raise error

    monkeypatch.setattr(c.store, "transaction", failed)

    def read():
        if operation == "metadata":
            return reader(c).read_desktop(["process-1"])
        return resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data))

    if error_type is RuntimeError:
        if operation == "metadata":
            with pytest.raises(DomainError) as caught:
                read()
            assert (caught.value.status, caught.value.code) == (503, "unavailable")
        else:
            assert read() == {"status": "unavailable"}
    else:
        published = []
        with pytest.raises(error_type) as caught:
            published.append(read())
        assert caught.value is error and not published
    assert c.store._documents[USER] == before
