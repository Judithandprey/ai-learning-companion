"""Current Mac metadata and original reads over audited synthetic PNGs.

No native capture, provider, listener or durable database is exercised here.
"""

import asyncio
import base64
from concurrent.futures import CancelledError as FutureCancelledError
from contextlib import contextmanager
from copy import deepcopy

import pytest

from packages.contracts.macos_frame import RAW_ALIAS_LIMIT
from services.api.domain import key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import _MemoryTransaction
from services.api.tests.macos_fixtures import (
    macos_setup, setup, registered, uploaded, raw_setup, ingest, gap,
)
from services.api.tests.test_capture import record
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_process_context_reader import current_guard
from services.api.tests.test_raw_frame_readers import canonical, reader, resolver, refused
from services.api.tests.test_windows_frame_ingress import windows_setup, windowscaptured


@pytest.fixture
def macoscaptured(macos_setup):
    macos_setup.ack = ingest(macos_setup)
    return macos_setup


def image(c, role="raw", *, frame=None, limit=None):
    return resolver(c).resolve_macos(
        c.macos_frame if frame is None else frame, image_role=role,
        max_bytes=max(len(c.data), len(c.composed_data)) if limit is None else limit,
    )


def test_exact_metadata_and_explicit_png_roles_preserve_independent_ink(macoscaptured):
    c = macoscaptured
    before = documents(c)
    packet = reader(c).read_macos(["process-1"])
    assert set(packet) == {"batch", "sources", "frames"}
    assert packet["batch"]["records"] == c.batch["records"]
    assert packet["batch"]["delivery_mode"] == "historical"
    assert packet["sources"] == [c.descriptor] and packet["frames"] == [c.macos_frame]
    assert c.ink_ref in packet["batch"]["records"][0]["artifacts"]
    assert packet["batch"]["records"][0]["clock"] is None
    assert all(packet["frames"][0][field] is None for field in
               ("captured_at", "media_position", "pixel_orientation", "capture_latency_ms"))
    for role, data in (("raw", c.data), ("composed", c.composed_data)):
        resolved = image(c, role, limit=len(data))
        assert resolved == {"status": "available", "frame": c.macos_frame,
                            "image_role": role, "media_type": "image/png", "data": data}
        resolved["frame"]["profile"]["native_session_id"] = "detached-result"
    packet["frames"][0]["composition"]["ink"]["limits"].append("detached-result")
    assert reader(c).read_macos(["process-1"])["frames"] == [c.macos_frame]
    assert documents(c) == before


def test_metadata_scans_each_retained_frame_kind_once_without_decoding_or_writing(macoscaptured, monkeypatch):
    c = macoscaptured
    children = [record(c.batch, "second", 2, causal_parents=["process-1"]),
                record(c.batch, "third", 3, causal_parents=["second"])]
    ingest(c, {**c.batch, "records": children}, key="children")
    before, reads, scans, guards = documents(c), [], [], []
    actual_get, actual_scan = _MemoryTransaction.get, _MemoryTransaction.scan
    authorize = current_guard(c)

    def get(tx, kind, identifier):
        if kind == "capture_record":
            assert identifier in {"second", "third"}
        if kind == "artifact":
            reads.append(identifier)
        return actual_get(tx, kind, identifier)

    def scan(tx, kind):
        assert kind in {"frame", "raw_capture_frame"}
        scans.append(kind)
        return actual_scan(tx, kind)

    def denied(*args, **kwargs):
        pytest.fail("metadata reader attempted write or byte decoding")

    def guard(state):
        guards.append(True)
        authorize(state)

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "get", get)
        patch.setattr(_MemoryTransaction, "scan", scan)
        patch.setattr(base64, "b64decode", denied)
        for method in ("put", "delete"):
            patch.setattr(_MemoryTransaction, method, denied)
        packet = AuthorizedProcessContextReader(c.store, USER, guard).read_macos(["third", "second"])
    assert guards == [True, True] and scans == ["frame", "raw_capture_frame"]
    assert reads == [c.ref["artifact_id"], c.composed_ref["artifact_id"]]
    assert packet["batch"]["records"] == list(reversed(children))
    assert packet["frames"] == [c.macos_frame] and b"data_base64" not in canonical(packet)
    assert documents(c) == before


def test_explicit_version_dispatch_keeps_all_old_readers_closed(macoscaptured):
    c = macoscaptured
    for read in (reader(c).read_raw, reader(c).read_desktop, reader(c).read_windows):
        refused(c, lambda: read(["process-1"]), 503)
    refused(c, lambda: reader(c)(["process-1"]), 409)
    for resolve in (resolver(c), resolver(c).resolve_raw, resolver(c).resolve_desktop):
        assert resolve(c.macos_frame, max_bytes=len(c.data)) == {"status": "unavailable"}
    assert resolver(c).resolve_windows(c.macos_frame, image_role="raw", max_bytes=len(c.data)) == {
        "status": "unavailable"}


def test_shared_retained_kind_does_not_dispatch_windows_as_macos(windowscaptured):
    c = windowscaptured
    refused(c, lambda: reader(c).read_macos(["process-1"]), 503)
    assert resolver(c).resolve_macos(c.windows_frame, image_role="raw", max_bytes=len(c.data)) == {
        "status": "unavailable"}


@pytest.mark.parametrize("outcome", ["unknown", "not_composed"])
def test_absent_composition_retains_its_outcome_and_never_uses_raw(macos_setup, outcome):
    c = macos_setup
    c.macos_frame["composition"] = ({"kind": "unknown", "reason": "no_retained_outcome"}
        if outcome == "unknown" else {"kind": "not_composed", "reason": "refused",
            "callback_sequence": c.macos_frame["callback_sequence"], "host_seconds": 108,
            "detail": "Synthetic refusal; no composed original retained."})
    c.batch["records"][0]["artifacts"] = [c.ref, c.ink_ref]
    ingest(c)
    assert reader(c).read_macos(["process-1"])["frames"] == [c.macos_frame]
    assert image(c, "raw")["data"] == c.data
    assert image(c, "composed") == {"status": "unobservable"}


def test_raw_alias_keeps_both_explicit_roles(macos_setup):
    c = macos_setup
    composition = c.macos_frame["composition"]
    composition["image"] = deepcopy(c.macos_frame["raw"])
    composition["ink"]["strokes"] = []
    composition["ink"]["limits"].append(RAW_ALIAS_LIMIT)
    c.batch["records"][0]["artifacts"] = [c.ref, c.ink_ref]
    ingest(c)
    for role in ("raw", "composed"):
        assert image(c, role) == {"status": "available", "frame": c.macos_frame,
                                 "image_role": role, "media_type": "image/png", "data": c.data}


def test_explicit_gap_and_metadata_ceiling_are_preserved(macos_setup):
    c = macos_setup
    item = gap(c)
    ingest(c, {**c.batch, "records": [item]}, [], key="gap-only")
    packet = reader(c).read_macos([item["record_id"]])
    assert packet["batch"]["records"] == [item] and packet["frames"] == []
    size = len(canonical(packet))
    assert reader(c).read_macos([item["record_id"]], max_metadata_bytes=size) == packet
    refused(c, lambda: reader(c).read_macos([item["record_id"]], max_metadata_bytes=size - 1), 413)


@pytest.mark.parametrize("role", [None, True, [], "RAW", "editable_ink"])
def test_invalid_role_never_reaches_storage(macoscaptured, monkeypatch, role):
    c = macoscaptured
    monkeypatch.setattr(c.store, "transaction", lambda *args: pytest.fail("invalid role reached store"))
    assert image(c, role) == {"status": "unavailable"}


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("damage", ["pin", "missing", "source", "alias", "kind"])
def test_both_original_bindings_are_required_for_either_image_role(macoscaptured, role, damage):
    c = macoscaptured
    actor = c.store._documents[USER]
    ref = c.ref if role == "raw" else c.composed_ref
    original_key = ("artifact", ref["artifact_id"])
    if damage == "missing":
        del actor[original_key]
    elif damage == "pin":
        actor[("capture_artifact_ref", ref["artifact_id"])]["byte_length"] += 1
    elif damage == "source":
        actor[original_key]["original_binding"]["source"]["source_version"] = 2
    elif damage == "kind":
        actor[original_key]["original_binding"]["kind"] = "editable_ink"
    else:
        actor[original_key]["byte_length"] += 1
    refused(c, lambda: reader(c).read_macos(["process-1"]), 503)
    assert image(c, "raw")["status"] != "available"
    assert image(c, "composed")["status"] != "available"


@pytest.mark.parametrize("damage", ["source", "snapshot", "generation", "device", "session", "frame_source"])
def test_current_source_and_capture_identity_are_required(macoscaptured, damage):
    c = macoscaptured
    actor = c.store._documents[USER]
    if damage == "source":
        del actor[("source", c.source["source_id"])]
    elif damage == "snapshot":
        del actor[("snapshot", key(c.source["source_id"], 1))]
    elif damage == "generation":
        actor[("capture_binding", c.batch["stream_id"])]["authorization_generation"] += 1
    elif damage == "frame_source":
        actor[("raw_capture_frame", c.macos_frame["frame_id"])]["source"]["source_version"] = 2
    else:
        actor[(damage, c.batch[damage + "_id"])]["user_id"] = "foreign-owner"
    refused(c, lambda: reader(c).read_macos(["process-1"]), 404 if damage in ("device", "session") else 503)
    assert image(c)["status"] != "available"


@pytest.mark.parametrize("role", ["raw", "composed"])
def test_png_byte_limit_exact_detached_descriptor_and_lost_bytes(macoscaptured, role):
    c = macoscaptured
    data, ref = (c.data, c.ref) if role == "raw" else (c.composed_data, c.composed_ref)
    changed = deepcopy(c.macos_frame)
    changed["profile"]["sample"]["dirty_rects"] = []
    assert image(c, role, frame=changed) == {"status": "unavailable"}
    assert image(c, role, limit=len(data) - 1) == {"status": "byte_limit"}
    assert image(c, role, limit=len(data))["data"] == data
    c.store._documents[USER][("artifact", ref["artifact_id"])]["data_base64"] = base64.b64encode(
        data[:-1] + bytes([data[-1] ^ 1])).decode("ascii")
    assert reader(c).read_macos(["process-1"])["frames"] == [c.macos_frame]
    assert image(c, role) == {"status": "unavailable"}


@pytest.mark.parametrize("identity", ["artifact", "hash", "native_file", "unknown_version"])
def test_unselected_retained_contradiction_blocks_metadata_and_both_roles(macoscaptured, identity):
    c = macoscaptured
    sibling = deepcopy(c.macos_frame)
    sibling["frame_id"] = "corrupt-unselected"
    sibling["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
    if identity == "unknown_version":
        sibling["contract_version"] = "0.2.99"
    elif identity == "native_file":
        sibling["raw"]["artifact"].update(artifact_id="different-original", sha256="f" * 64)
    else:
        sibling["profile"]["native_session_id"] = "different-native-session"
        sibling["raw"]["width"] += 1
        if identity == "hash":
            sibling["raw"]["artifact"]["artifact_id"] = "different-original"
    c.store._documents[USER][("raw_capture_frame", sibling["frame_id"])] = sibling
    refused(c, lambda: reader(c).read_macos(["process-1"]), 503)
    assert image(c, "raw") == image(c, "composed") == {"status": "unavailable"}


@pytest.mark.parametrize("target", ["frame", "raw", "composed"])
def test_present_empty_tombstones_withhold_complete_descriptor(macoscaptured, target):
    c = macoscaptured
    if target == "frame":
        identity = ("frame_tombstone", c.macos_frame["frame_id"])
    else:
        identity = ("original_artifact_tombstone",
                    (c.ref if target == "raw" else c.composed_ref)["artifact_id"])
    c.store._documents[USER][identity] = {}
    refused(c, lambda: reader(c).read_macos(["process-1"]), 404)
    assert image(c, "raw") == image(c, "composed") == {"status": "missing"}


@pytest.mark.parametrize("action,status,image_status", [
    ("source_revoke", 403, "revoked"), ("source_delete", 404, "missing"),
    ("account_revoke", 403, "revoked"),
])
def test_revocation_or_deletion_withholds_history(macoscaptured, action, status, image_status):
    c = macoscaptured
    if action == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif action == "source_delete":
        c.archive.delete_source(USER, c.source["source_id"])
    else:
        c.archive.set_authorization(USER, False)
    refused(c, lambda: reader(c).read_macos(["process-1"]), status)
    assert image(c, "raw") == image(c, "composed") == {"status": image_status}


def test_stop_preserves_historical_read_without_restarting_capture(macoscaptured):
    c = macoscaptured
    expected = reader(c).read_macos(["process-1"])
    apply(c, command(c, "stop"))
    before = documents(c)
    assert reader(c).read_macos(["process-1"]) == expected
    assert image(c)["data"] == c.data and image(c, "composed")["data"] == c.composed_data
    assert documents(c) == before


@pytest.mark.parametrize("operation", ["metadata", "raw", "composed"])
@pytest.mark.parametrize("stage", ["locked", "final"])
def test_current_guard_checks_before_and_after_reads(macoscaptured, monkeypatch, operation, stage):
    c = macoscaptured
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
            reader(c).read_macos(["process-1"])
        assert error.value.status == 401
    else:
        assert image(c, operation) == {"status": "revoked"}


@pytest.mark.parametrize("operation", ["metadata", "raw", "composed"])
@pytest.mark.parametrize("error_type", [FutureCancelledError, asyncio.CancelledError, RuntimeError])
def test_transaction_exit_cancellation_or_failure_never_publishes(macoscaptured, monkeypatch, operation, error_type):
    c = macoscaptured
    before, transaction = documents(c), c.store.transaction
    failure = error_type("PRIVATE test-only failure")

    @contextmanager
    def failed(actor):
        with transaction(actor) as tx:
            yield tx
            raise failure

    monkeypatch.setattr(c.store, "transaction", failed)

    def read():
        return reader(c).read_macos(["process-1"]) if operation == "metadata" else image(c, operation)

    if error_type is RuntimeError:
        if operation == "metadata":
            with pytest.raises(DomainError) as error:
                read()
            assert (error.value.status, error.value.code) == (503, "unavailable")
        else:
            assert read() == {"status": "unavailable"}
    else:
        published = []
        with pytest.raises(error_type) as error:
            published.append(read())
        assert error.value is failure and not published
    assert c.store._documents[USER] == before
