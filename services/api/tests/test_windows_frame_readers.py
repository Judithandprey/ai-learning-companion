"""Explicit Windows reads over synthetic typed PNG/ink, without native capture."""

import asyncio
import base64
from concurrent.futures import CancelledError as FutureCancelledError
from contextlib import contextmanager
from copy import deepcopy

import pytest

from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_desktop_frame_ingress import desktopcaptured, desktop_setup
from services.api.tests.test_desktop_ingress_http import gap
from services.api.tests.test_process_context_reader import current_guard
from services.api.tests.test_raw_frame_ingress import rawcaptured
from services.api.tests.test_raw_frame_readers import canonical, reader, resolver, refused
from services.api.tests.test_windows_frame_ingress import (
    setup, registered, uploaded, raw_setup, windows_setup, ingest as windows_ingest,
)


@pytest.fixture
def windowscaptured(windows_setup):
    windows_setup.ack = windows_ingest(windows_setup)
    return windows_setup


def image(c, role="raw", *, frame=None, limit=None):
    return resolver(c).resolve_windows(
        c.windows_frame if frame is None else frame, image_role=role,
        max_bytes=max(len(c.data), len(c.composed_data)) if limit is None else limit,
    )


def test_windows_packet_and_explicit_images_preserve_complete_originals(windowscaptured):
    c = windowscaptured
    before = documents(c)
    packet = reader(c).read_windows(["process-1"])
    assert set(packet) == {"batch", "sources", "frames"}
    assert packet["batch"]["records"] == c.batch["records"]
    assert packet["batch"]["delivery_mode"] == "historical"
    assert packet["sources"] == [c.descriptor] and packet["frames"] == [c.windows_frame]
    frame = packet["frames"][0]
    assert frame["contract_version"] == "0.2.9"
    assert frame["captured_at"] is frame["media_position"] is frame["capture_latency_ms"] is None
    assert packet["batch"]["records"][0]["clock"] is None
    assert c.ink_ref in packet["batch"]["records"][0]["artifacts"]
    for role, data in (("raw", c.data), ("composed", c.composed_data)):
        resolved = image(c, role, limit=len(data))
        assert resolved == {"status": "available", "frame": c.windows_frame,
                            "image_role": role, "media_type": "image/png", "data": data}
        resolved["frame"]["profile"]["capture_session"] = "detached-result"
    frame["composed"]["transformation"] = "detached-result"
    packet["batch"]["records"][0]["evidence"]["limitations"].append("detached")
    assert reader(c).read_windows(["process-1"])["frames"] == [c.windows_frame]
    assert documents(c) == before


def test_metadata_checks_identity_once_and_never_decodes_originals(windowscaptured, monkeypatch):
    c = windowscaptured
    second = record(c.batch, "second", 2, causal_parents=["process-1"])
    third = record(c.batch, "third", 3, causal_parents=["second"])
    windows_ingest(c, {**c.batch, "records": [second, third]}, key="children")
    before, transactions, guards, artifact_reads, scans = documents(c), [], [], [], []
    actual_get, actual_transaction = _MemoryTransaction.get, c.store.transaction
    actual_scan = _MemoryTransaction.scan
    authorize = current_guard(c)

    def get(tx, kind, identifier):
        if kind == "capture_record":
            assert identifier in {"second", "third"}
        if kind == "artifact":
            artifact_reads.append(identifier)
        return actual_get(tx, kind, identifier)

    def denied(*args, **kwargs):
        pytest.fail("metadata reader attempted write/byte decoding")

    def scan(tx, kind):
        assert kind == "raw_capture_frame", "identity check scanned outside frame metadata"
        scans.append(kind)
        return actual_scan(tx, kind)

    def guard(state):
        guards.append(True)
        authorize(state)

    @contextmanager
    def transaction(actor):
        transactions.append(actor)
        with actual_transaction(actor) as tx:
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "get", get)
        patch.setattr(_MemoryTransaction, "scan", scan)
        for method in ("put", "delete"):
            patch.setattr(_MemoryTransaction, method, denied)
        patch.setattr(base64, "b64decode", denied)
        patch.setattr(c.store, "transaction", transaction)
        packet = AuthorizedProcessContextReader(c.store, USER, guard).read_windows(["third", "second"])
    assert transactions == [USER] and guards == [True, True]
    assert scans == ["raw_capture_frame"]
    assert artifact_reads == [c.ref["artifact_id"], c.composed_ref["artifact_id"]]
    assert packet["batch"]["records"] == [third, second]
    assert packet["frames"] == [c.windows_frame]
    assert "data_base64" not in canonical(packet).decode()
    assert documents(c) == before


def test_old_readers_stay_closed_to_windows(windowscaptured):
    c = windowscaptured
    for read in (reader(c).read_raw, reader(c).read_desktop):
        refused(c, lambda: read(["process-1"]), 503)
    refused(c, lambda: reader(c)(["process-1"]), 409)
    for resolve in (resolver(c), resolver(c).resolve_raw, resolver(c).resolve_desktop):
        assert resolve(c.windows_frame, max_bytes=len(c.data)) == {"status": "unavailable"}


@pytest.mark.parametrize("fixture,field", [("rawcaptured", "raw_frame"), ("desktopcaptured", "desktop_frame")])
def test_windows_readers_stay_closed_to_older_raw_families(request, fixture, field):
    c = request.getfixturevalue(fixture)
    refused(c, lambda: reader(c).read_windows(["process-1"]), 503)
    assert resolver(c).resolve_windows(getattr(c, field), image_role="raw", max_bytes=len(c.data)) == {
        "status": "unavailable"}


@pytest.mark.parametrize("ids", [[], ["process-1", "process-1"], [1], ("process-1",)])
def test_invalid_selection_precedes_storage(windowscaptured, monkeypatch, ids):
    read = reader(windowscaptured)
    monkeypatch.setattr(windowscaptured.store, "transaction", lambda *a: pytest.fail("invalid IDs reached store"))
    with pytest.raises(DomainError) as error:
        read.read_windows(ids)
    assert error.value.status == 422


@pytest.mark.parametrize("role", [None, True, 1, [], "RAW", "Composed", "composed ", "editable_ink"])
def test_only_literal_image_roles_are_accepted(windowscaptured, monkeypatch, role):
    c = windowscaptured
    resolve = resolver(c)
    monkeypatch.setattr(c.store, "transaction", lambda *a: pytest.fail("invalid role reached store"))
    assert resolve.resolve_windows(c.windows_frame, image_role=role, max_bytes=len(c.data)) == {
        "status": "unavailable"}


def test_missing_composition_is_unobservable_and_never_raw_fallback(windows_setup):
    c = windows_setup
    c.windows_frame["composed"] = None
    windows_ingest(c)
    assert reader(c).read_windows(["process-1"])["frames"] == [c.windows_frame]
    assert image(c, "raw")["data"] == c.data
    assert image(c, "composed") == {"status": "unobservable"}


def test_shared_image_artifact_keeps_explicit_roles(windows_setup):
    c = windows_setup
    c.windows_frame["composed"]["image"] = deepcopy(c.windows_frame["raw"])
    c.batch["records"][0]["artifacts"] = [c.ref, c.ink_ref]
    windows_ingest(c)
    assert reader(c).read_windows(["process-1"])["frames"] == [c.windows_frame]
    for role in ("raw", "composed"):
        assert image(c, role) == {"status": "available", "frame": c.windows_frame,
                                  "image_role": role, "media_type": "image/png", "data": c.data}


def test_display_gaps_remain_exact_without_invented_frames(windows_setup):
    c = windows_setup
    item = gap(c)
    windows_ingest(c, {**c.batch, "records": [item]}, [], key="gap-only")
    packet = reader(c).read_windows([item["record_id"]])
    assert packet["batch"]["records"] == [item] and packet["frames"] == []
    assert packet["batch"]["delivery_mode"] == "historical"


def test_metadata_budget_counts_complete_utf8_packet(windowscaptured):
    c = windowscaptured
    packet = reader(c).read_windows(["process-1"])
    size = len(canonical(packet))
    assert reader(c).read_windows(["process-1"], max_metadata_bytes=size) == packet
    refused(c, lambda: reader(c).read_windows(["process-1"], max_metadata_bytes=size - 1), 413)
    refused(c, lambda: reader(c).read_windows(["process-1"], max_metadata_bytes=True), 422)


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("damage", ["pin", "missing", "original_source", "alias", "kind"])
def test_each_declared_image_binding_is_checked_for_metadata_and_either_role(windowscaptured, role, damage):
    c = windowscaptured
    actor = c.store._documents[USER]
    ref = c.ref if role == "raw" else c.composed_ref
    artifact_key = ("artifact", ref["artifact_id"])
    if damage == "pin":
        actor[("capture_artifact_ref", ref["artifact_id"])]["byte_length"] += 1
    elif damage == "missing":
        del actor[artifact_key]
    elif damage == "original_source":
        actor[artifact_key]["original_binding"]["source"]["source_version"] = 2
    elif damage == "kind":
        actor[artifact_key]["original_binding"]["kind"] = "editable_ink"
    else:
        actor[artifact_key]["byte_length"] += 1
    refused(c, lambda: reader(c).read_windows(["process-1"]), 503)
    for selected_role in ("raw", "composed"):
        assert image(c, selected_role)["status"] != "available"


@pytest.mark.parametrize("kind,role", [
    ("frame_tombstone", "frame"),
    ("original_artifact_tombstone", "raw"), ("capture_artifact_tombstone", "raw"),
    ("original_artifact_tombstone", "composed"), ("capture_artifact_tombstone", "composed"),
])
def test_tombstones_withhold_complete_frame(windowscaptured, kind, role):
    c = windowscaptured
    identifier = (c.windows_frame["frame_id"] if role == "frame" else
                  (c.ref if role == "raw" else c.composed_ref)["artifact_id"])
    c.store._documents[USER][(kind, identifier)] = {}
    refused(c, lambda: reader(c).read_windows(["process-1"]), 404)
    assert image(c, "raw") == image(c, "composed") == {"status": "missing"}


@pytest.mark.parametrize("role", ["raw", "composed"])
def test_png_bytes_are_selected_exact_bounded_and_hash_checked(windowscaptured, role):
    c = windowscaptured
    data, ref = (c.data, c.ref) if role == "raw" else (c.composed_data, c.composed_ref)
    changed = deepcopy(c.windows_frame)
    changed["composed"]["transformation"] += " changed"
    assert image(c, role, frame=changed) == {"status": "unavailable"}
    assert image(c, role, limit=len(data) - 1) == {"status": "byte_limit"}
    assert image(c, role, limit=len(data))["data"] == data
    original = c.store._documents[USER][("artifact", ref["artifact_id"])]
    original["data_base64"] = base64.b64encode(data[:-1] + bytes([data[-1] ^ 1])).decode("ascii")
    assert reader(c).read_windows(["process-1"])["frames"] == [c.windows_frame]
    assert image(c, role) == {"status": "unavailable"}


@pytest.mark.parametrize("action", ["stop", "withdraw"])
def test_stopped_history_stays_readable_without_restarting_capture(windowscaptured, action):
    c = windowscaptured
    expected = reader(c).read_windows(["process-1"])
    apply(c, command(c, action))
    before = documents(c)
    assert reader(c).read_windows(["process-1"]) == expected
    assert image(c, "raw")["data"] == c.data
    assert image(c, "composed")["data"] == c.composed_data
    assert documents(c) == before


@pytest.mark.parametrize("action,status,image_status", [
    ("source_revoke", 403, "revoked"), ("source_delete", 404, "missing"),
    ("account_revoke", 403, "revoked"),
])
def test_current_revocation_or_deletion_withholds_history(windowscaptured, action, status, image_status):
    c = windowscaptured
    if action == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif action == "source_delete":
        c.archive.delete_source(USER, c.source["source_id"])
    else:
        c.archive.set_authorization(USER, False)
    refused(c, lambda: reader(c).read_windows(["process-1"]), status)
    assert image(c, "raw") == image(c, "composed") == {"status": image_status}


@pytest.mark.parametrize("operation", ["metadata", "raw", "composed"])
@pytest.mark.parametrize("stage", ["locked", "final"])
def test_current_guard_before_and_after_retained_reads(windowscaptured, monkeypatch, operation, stage):
    c = windowscaptured
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
            reader(c).read_windows(["process-1"])
        assert error.value.status == 401
    else:
        assert image(c, operation) == {"status": "revoked"}


@pytest.mark.parametrize("operation", ["metadata", "raw", "composed"])
@pytest.mark.parametrize("error_type", [FutureCancelledError, asyncio.CancelledError, RuntimeError])
def test_transaction_exit_failure_never_publishes_partial_results(windowscaptured, monkeypatch, operation, error_type):
    c = windowscaptured
    before, transaction = documents(c), c.store.transaction
    error = error_type("PRIVATE synthetic transaction exit")

    @contextmanager
    def failed(actor):
        with transaction(actor) as tx:
            yield tx
            raise error

    monkeypatch.setattr(c.store, "transaction", failed)

    def read():
        return reader(c).read_windows(["process-1"]) if operation == "metadata" else image(c, operation)

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
