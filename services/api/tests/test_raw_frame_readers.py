"""Authorized raw metadata/bytes over synthetic ASGI uploads and MemoryStore.

No physical capture, image transformation, provider, DB or raw HTTP route is used.
"""

import asyncio
import base64
from concurrent.futures import CancelledError as FutureCancelledError
from contextlib import contextmanager
from copy import deepcopy
import json

import pytest

from services.api.domain import key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_process_context_reader import current_guard
from services.api.tests.test_raw_frame_ingress import (
    setup, registered, uploaded, raw_setup, rawcaptured, ingest,
)


def reader(c):
    return AuthorizedProcessContextReader(c.store, USER, current_guard(c))


def resolver(c):
    return AuthorizedImageResolver(c.store, USER, current_guard(c))


def refused(c, operation, status):
    before = documents(c)
    published = []
    with pytest.raises(DomainError) as error:
        published.append(operation())
    assert error.value.status == status
    assert not published and documents(c) == before


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def test_raw_ingress_metadata_and_bytes_preserve_unknown_clock_and_unapplied_orientation(rawcaptured):
    c = rawcaptured
    before = documents(c)
    result = reader(c).read_raw(["process-1"])
    assert set(result) == {"batch", "sources", "frames"}
    assert result["batch"]["records"] == c.batch["records"]
    assert result["batch"]["delivery_mode"] == "historical"
    assert result["sources"] == [c.descriptor] and result["frames"] == [c.raw_frame]
    assert result["frames"][0]["captured_at"] is None
    assert result["frames"][0]["orientation"] == {
        "system": "CGImagePropertyOrientation", "value": 2, "applied_to_pixels": False,
    }
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) == {
        "status": "available", "frame": c.raw_frame, "media_type": "image/png", "data": c.data,
    }
    assert result["batch"]["records"][0]["artifacts"] == [c.ref, c.ink_ref]
    assert documents(c) == before
    result["frames"][0]["timing"]["callback_clock"]["domain_id"] = "detached-change"
    result["batch"]["records"][0]["evidence"]["reason_quote"] = "detached-change"
    result["sources"][0]["source_timezone"] = "detached-change"
    assert reader(c).read_raw(["process-1"])["frames"] == [c.raw_frame]
    assert resolver(c)(c.raw_frame, max_bytes=len(c.data)) == {"status": "unavailable"}
    refused(c, lambda: reader(c)(["process-1"]), 409)


def test_metadata_reads_points_once_per_shared_frame_without_decoding_or_returning_blobs(rawcaptured, monkeypatch):
    c = rawcaptured
    second = record(c.batch, "second", 2, causal_parents=["process-1"])
    third = record(c.batch, "third", 3, causal_parents=["second"])
    ingest(c, {**c.batch, "records": [second, third]}, request_key="children")
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
        result = AuthorizedProcessContextReader(c.store, USER, guard).read_raw(["third", "second"])
    assert calls == [USER] and guards == [True, True]
    assert artifact_reads == [c.ref["artifact_id"]]
    assert result["batch"]["records"] == [third, second]
    assert result["frames"] == [c.raw_frame]
    assert "data_base64" not in canonical(result).decode()
    assert documents(c) == before


@pytest.mark.parametrize("ids", [[], ["process-1", "process-1"], [1], [f"r{i}" for i in range(101)]])
def test_raw_selection_validation_precedes_storage(rawcaptured, monkeypatch, ids):
    read = reader(rawcaptured)
    monkeypatch.setattr(rawcaptured.store, "transaction", lambda *a: pytest.fail("invalid input reached store"))
    with pytest.raises(DomainError) as error:
        read.read_raw(ids)
    assert error.value.status == 422


def test_raw_metadata_bound_is_complete_canonical_utf8_without_truncation(rawcaptured):
    c = rawcaptured
    result = reader(c).read_raw(["process-1"])
    length = len(canonical(result))
    assert reader(c).read_raw(["process-1"], max_metadata_bytes=length) == result
    refused(c, lambda: reader(c).read_raw(["process-1"], max_metadata_bytes=length - 1), 413)
    refused(c, lambda: reader(c).read_raw(["process-1"], max_metadata_bytes=True), 422)


def test_mixed_released_legacy_and_raw_records_are_refused_by_both_entrypoints(rawcaptured):
    c = rawcaptured
    frame = {**c.frame, "frame_id": "legacy-frame"}
    legacy_record = record(c.batch, "legacy-record", 2, frame_id=frame["frame_id"],
                           media_position=frame["media_position"])
    c.registry.ingest_frames(USER, {**c.batch, "records": [legacy_record]}, [frame], "legacy")
    refused(c, lambda: reader(c).read_raw(["process-1", "legacy-record"]), 409)
    refused(c, lambda: reader(c)(["legacy-record", "process-1"]), 409)


@pytest.mark.parametrize("damage", [
    "missing_raw", "dual_kind", "frame_stream", "frame_time", "frame_orientation",
    "source_missing", "snapshot_missing", "historical_generation", "pin", "original_missing",
    "original_source", "original_version", "original_alias",
])
def test_corrupt_retained_raw_metadata_never_publishes_a_partial_packet(rawcaptured, damage):
    c = rawcaptured
    actor = c.store._documents[USER]
    raw_key = ("raw_capture_frame", c.raw_frame["frame_id"])
    original_key = ("artifact", c.ref["artifact_id"])
    if damage == "missing_raw":
        del actor[raw_key]
    elif damage == "dual_kind":
        actor[("frame", c.raw_frame["frame_id"])] = deepcopy(c.frame)
    elif damage == "frame_stream":
        actor[raw_key]["stream_id"] = "different-stream"
    elif damage == "frame_time":
        actor[raw_key]["captured_at"] = "2026-09-29T12:00:00Z"
    elif damage == "frame_orientation":
        actor[raw_key]["orientation"]["applied_to_pixels"] = True
    elif damage == "source_missing":
        del actor[("source", c.source["source_id"])]
    elif damage == "snapshot_missing":
        del actor[("snapshot", key(c.source["source_id"], 1))]
    elif damage == "historical_generation":
        actor[("capture_binding", c.batch["stream_id"])]["authorization_generation"] += 1
    elif damage == "pin":
        actor[("capture_artifact_ref", c.ref["artifact_id"])]["byte_length"] += 1
    elif damage == "original_missing":
        del actor[original_key]
    elif damage == "original_source":
        actor[original_key]["original_binding"]["source"]["source_version"] = 2
    elif damage == "original_version":
        actor[original_key]["original_binding"]["contract_version"] = "9.9.9"
    else:
        actor[original_key]["byte_length"] += 1
    refused(c, lambda: reader(c).read_raw(["process-1"]), 503)
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data))["status"] != "available"


@pytest.mark.parametrize("kind,identifier", [
    ("frame_tombstone", "frame"), ("original_artifact_tombstone", "artifact"),
    ("capture_artifact_tombstone", "artifact"),
])
def test_raw_tombstones_withhold_retained_metadata_and_bytes(rawcaptured, kind, identifier):
    c = rawcaptured
    ident = c.raw_frame["frame_id"] if identifier == "frame" else c.ref["artifact_id"]
    c.store._documents[USER][(kind, ident)] = {"id": ident}
    refused(c, lambda: reader(c).read_raw(["process-1"]), 404)
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) == {"status": "missing"}


def test_raw_byte_resolver_requires_exact_descriptor_and_preserves_bytes_under_bound(rawcaptured):
    c = rawcaptured
    changed = deepcopy(c.raw_frame)
    changed["orientation"]["value"] = 1
    assert resolver(c).resolve_raw(changed, max_bytes=len(c.data)) == {"status": "unavailable"}
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data) - 1) == {"status": "byte_limit"}
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data))["data"] == c.data
    encoded = base64.b64encode(c.data).decode("ascii")
    c.store._documents[USER][("artifact", c.ref["artifact_id"])]["data_base64"] = "!" + encoded[1:]
    # Metadata is not a byte verification receipt; resolving the bytes still fails.
    assert reader(c).read_raw(["process-1"])["frames"] == [c.raw_frame]
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) == {"status": "unavailable"}


@pytest.mark.parametrize("action", ["stop", "withdraw"])
def test_raw_historical_reads_remain_available_after_scoped_stop(rawcaptured, action):
    c = rawcaptured
    expected = reader(c).read_raw(["process-1"])
    apply(c, command(c, action))
    assert reader(c).read_raw(["process-1"]) == expected
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data))["data"] == c.data


def test_current_regrant_keeps_exact_historical_raw_generation_binding(rawcaptured):
    c = rawcaptured
    expected = reader(c).read_raw(["process-1"])
    historical_generation = c.store._documents[USER][("capture_binding", c.batch["stream_id"])]["authorization_generation"]
    c.archive.set_authorization(USER, False)
    state = c.archive.set_authorization(USER, True)
    assert state["generation"] != historical_generation
    refused(c, lambda: reader(c).read_raw(["process-1"]), 403)

    def fresh_guard(current):
        assert c.store._local.in_transaction
        if current["generation"] != state["generation"]:
            raise DomainError(403, "stale_generation")

    assert AuthorizedProcessContextReader(c.store, USER, fresh_guard).read_raw(["process-1"]) == expected
    assert AuthorizedImageResolver(c.store, USER, fresh_guard).resolve_raw(
        c.raw_frame, max_bytes=len(c.data))["data"] == c.data
    assert c.store._documents[USER][("capture_binding", c.batch["stream_id"])]["authorization_generation"] == historical_generation


@pytest.mark.parametrize("operation", ["metadata", "bytes"])
def test_raw_guard_runs_after_transaction_lock_before_metadata_reads(rawcaptured, monkeypatch, operation):
    c = rawcaptured
    transaction, get = c.store.transaction, _MemoryTransaction.get

    @contextmanager
    def revoked(actor):
        with transaction(actor) as tx:
            c.auth.revoke("read-token")
            yield tx

    def authorization_only(tx, kind, identifier):
        assert kind == "authorization", "revoked caller reached retained metadata"
        return get(tx, kind, identifier)

    monkeypatch.setattr(c.store, "transaction", revoked)
    monkeypatch.setattr(_MemoryTransaction, "get", authorization_only)
    if operation == "metadata":
        with pytest.raises(DomainError) as error:
            reader(c).read_raw(["process-1"])
        assert error.value.status == 401
    else:
        assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) == {"status": "revoked"}


@pytest.mark.parametrize("action,status,image_status", [
    ("source_revoke", 403, "revoked"), ("source_delete", 404, "missing"),
    ("account_revoke", 403, "revoked"),
])
def test_raw_current_revocation_and_deletion_withhold_history(rawcaptured, action, status, image_status):
    c = rawcaptured
    if action == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif action == "source_delete":
        c.archive.delete_source(USER, c.source["source_id"])
    else:
        c.archive.set_authorization(USER, False)
    refused(c, lambda: reader(c).read_raw(["process-1"]), status)
    assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) == {"status": image_status}


@pytest.mark.parametrize("operation", ["metadata", "bytes"])
def test_raw_final_guard_withholds_result_after_token_revoked_during_read(rawcaptured, monkeypatch, operation):
    c = rawcaptured
    get = _MemoryTransaction.get

    def revoke(tx, kind, identifier):
        result = get(tx, kind, identifier)
        if kind == "artifact":
            c.auth.revoke("read-token")
        return result

    monkeypatch.setattr(_MemoryTransaction, "get", revoke)
    if operation == "metadata":
        refused(c, lambda: reader(c).read_raw(["process-1"]), 401)
    else:
        assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) == {"status": "revoked"}


@pytest.mark.parametrize("operation", ["metadata", "bytes"])
@pytest.mark.parametrize("error_type", [FutureCancelledError, asyncio.CancelledError])
@pytest.mark.parametrize("stage", ["guard", "exit"])
def test_raw_cancellation_propagates_without_partial_publication(rawcaptured, monkeypatch, operation, error_type, stage):
    c = rawcaptured
    before = documents(c)
    error = error_type("test cancellation")

    def cancelled(state):
        raise error

    if stage == "exit":
        transaction = c.store.transaction

        @contextmanager
        def failed(actor):
            with transaction(actor) as tx:
                yield tx
                raise error

        monkeypatch.setattr(c.store, "transaction", failed)
    guard = cancelled if stage == "guard" else current_guard(c)
    published = []
    with pytest.raises(error_type) as caught:
        if operation == "metadata":
            published.append(AuthorizedProcessContextReader(c.store, USER, guard).read_raw(["process-1"]))
        else:
            published.append(AuthorizedImageResolver(c.store, USER, guard).resolve_raw(c.raw_frame, max_bytes=len(c.data)))
    assert caught.value is error and not published
    assert c.store._documents[USER] == before


@pytest.mark.parametrize("operation", ["metadata", "bytes"])
def test_raw_transaction_exit_failure_does_not_return_success(rawcaptured, monkeypatch, operation):
    c = rawcaptured
    transaction = c.store.transaction

    @contextmanager
    def failed(actor):
        with transaction(actor) as tx:
            yield tx
            raise RuntimeError("PRIVATE test-only transaction failure")

    monkeypatch.setattr(c.store, "transaction", failed)
    if operation == "metadata":
        with pytest.raises(DomainError) as error:
            reader(c).read_raw(["process-1"])
        assert (error.value.status, error.value.code) == (503, "unavailable")
    else:
        assert resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) == {"status": "unavailable"}
