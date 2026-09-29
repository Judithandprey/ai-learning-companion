"""HTTP-committed synthetic process evidence through the authorized context seam.

MemoryStore and in-process ASGI are not device, provider or PostgreSQL evidence.
"""

import asyncio
import base64
from concurrent.futures import CancelledError as FutureCancelledError, Future
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import timedelta
from hashlib import sha256
import json
from types import SimpleNamespace

import pytest

from packages.contracts.process_v2 import canonical_record, validate
from services.api.auth import LocalTestAuthenticator
from services.api.capture import CaptureArchive
from services.api.domain import fingerprint, key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import USER, apply, command, documents, registration, start
from services.api.tests.test_ingress_http import (
    SOURCE, captured, ingest, registered, setup, success, uploaded,
)
from services.learning.process_context import compose_process_context


LIMIT = 4 * 1024 * 1024


def current_guard(c, *, user_id=USER, token="read-token"):
    def guard(state):
        assert c.store._local.in_transaction
        principal = c.auth.authenticate(token, c.instant[0])
        if (principal.user_id != user_id or "sources:read" not in principal.scopes
                or state["generation"] != principal.authorization_generation):
            raise DomainError(403, "forbidden")
    return guard


def reader(c):
    return AuthorizedProcessContextReader(c.store, USER, current_guard(c))


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def refused(c, operation, status, code):
    before = documents(c)
    published = []
    with pytest.raises(DomainError) as exc:
        published.append(operation())
    assert (exc.value.status, exc.value.code) == (status, code)
    assert published == [] and documents(c) == before


def test_http_committed_png_and_ink_references_reach_unchanged_learning_composer(captured):
    c = captured
    before = documents(c)
    result = reader(c)(["process-1"])
    assert result == {
        "batch": {"contract_version": "0.2.0", "batch_id": "context-" + fingerprint([USER, ["process-1"]]),
                  **{k: c.batch[k] for k in ("device_id", "session_id", "stream_id")},
                  "delivery_mode": "historical", "records": c.batch["records"]},
        "sources": [c.descriptor], "frames": [c.frame],
    }
    validate("ProcessBatch", result["batch"])
    packet = compose_process_context(**result,
        resolver=AuthorizedImageResolver(c.store, USER, current_guard(c)), user_id=USER)
    item = packet["items"][0]
    assert item["record"] == c.batch["records"][0]
    assert item["source"] == c.descriptor and item["frame"] == c.frame
    assert item["image"] == {"status": "attached", "data": c.data,
                             "media_type": "image/png", "byte_length": len(c.data)}
    assert item["record"]["artifacts"] == [c.ref, c.ink_ref]
    assert packet["non_frame_artifacts"] == "references_only"
    assert packet["counts"] == {"supplied": 1, "included": 1, "omitted": 0}
    for field in ("authorization_status", "commit_status", "live_status", "provider_receipt"):
        assert packet[field] == "not_attested"
    assert packet["presentation_permission"] == "not_granted"
    assert packet["capture_completeness"] == "unknown"
    assert packet["ordering"] == "supplied_array_not_chronology"
    assert documents(c) == before


def test_requested_order_shared_frame_and_outside_parents_are_preserved_without_parent_reads(captured, monkeypatch):
    c = captured
    second = record(c.batch, "second", 2, causal_parents=["process-1"])
    second["evidence"]["reason_quote"] = "Synthetic test statement：保留原文。"
    third = record(c.batch, "third", 3, causal_parents=["second"])
    envelope = {**c.envelope, "batch": {**c.batch, "records": [second, third]}}
    success(ingest(c, envelope=envelope, request_key="children"), "ProcessBatchAck")
    reads = []
    original_get = _MemoryTransaction.get

    def selected_only(tx, kind, identifier):
        if kind == "capture_record":
            reads.append(identifier)
            assert identifier in {"third", "second"}, "outside parents must remain unknown"
        return original_get(tx, kind, identifier)

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "get", selected_only)
        result = reader(c)(["third", "second"])
    assert reads == ["third", "second"]
    assert result["batch"]["records"] == [third, second]
    assert result["sources"] == [c.descriptor] and result["frames"] == [c.frame]
    packet = compose_process_context(**result,
        resolver=AuthorizedImageResolver(c.store, USER, current_guard(c)), user_id=USER)
    assert packet["items"][0]["parents"] == [{"record_id": "second", "status": "included"}]
    assert packet["items"][1]["parents"] == [{"record_id": "process-1", "status": "outside_context_unknown"}]


def test_reader_returns_detached_nested_values_and_does_not_change_selection(captured):
    c = captured
    selected = ["process-1"]
    result = reader(c)(selected)
    original = deepcopy(result)
    result["batch"]["records"][0]["evidence"]["reason_quote"] = "changed detached value"
    result["sources"][0]["source_timezone"] = "changed detached value"
    result["frames"][0]["width"] = 100
    assert selected == ["process-1"]
    assert reader(c)(selected) == original


def test_reader_uses_one_actor_transaction_only_point_metadata_reads_and_no_writes(captured, monkeypatch):
    c = captured
    before = documents(c)
    calls, guards = [], []
    original_transaction, original_get = c.store.transaction, _MemoryTransaction.get
    guard = current_guard(c)

    @contextmanager
    def counted(actor):
        calls.append(actor)
        with original_transaction(actor) as tx:
            yield tx

    def authorized(state):
        guards.append(True)
        guard(state)

    def metadata_only(tx, kind, identifier):
        assert kind != "artifact", "original bytes belong to the separately authorized image resolver"
        return original_get(tx, kind, identifier)

    def forbidden(*args, **kwargs):
        pytest.fail("read-only bounded metadata reader attempted a scan or write")

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", counted)
        patch.setattr(_MemoryTransaction, "get", metadata_only)
        for name in ("scan", "put", "delete"):
            patch.setattr(_MemoryTransaction, name, forbidden)
        result = AuthorizedProcessContextReader(c.store, USER, authorized)(["process-1"])
    assert result["batch"]["records"] == c.batch["records"]
    assert calls == [USER] and guards == [True, True]
    assert documents(c) == before


@pytest.mark.parametrize("ids", [None, "process-1", ("process-1",), [], ["process-1", "process-1"],
    [1], ["bad/identifier"], [f"record-{i}" for i in range(101)]])
def test_invalid_record_selection_fails_before_storage(captured, monkeypatch, ids):
    c = captured
    read = reader(c)
    monkeypatch.setattr(c.store, "transaction", lambda *a: pytest.fail("invalid selection reached storage"))
    with pytest.raises(DomainError) as exc:
        read(ids)
    assert (exc.value.status, exc.value.code) == (422, "invalid_request")


@pytest.mark.parametrize("limit", [None, 0, -1, True, 1.5, LIMIT + 1])
def test_invalid_metadata_limit_fails_before_storage(captured, monkeypatch, limit):
    c = captured
    read = reader(c)
    monkeypatch.setattr(c.store, "transaction", lambda *a: pytest.fail("invalid limit reached storage"))
    with pytest.raises(DomainError) as exc:
        read(["process-1"], max_metadata_bytes=limit)
    assert (exc.value.status, exc.value.code) == (422, "invalid_request")


@pytest.mark.parametrize("guard", [None, False, "current"])
def test_constructor_requires_a_current_callable_guard(captured, guard):
    with pytest.raises(ValueError):
        AuthorizedProcessContextReader(captured.store, USER, guard)


def test_exact_canonical_metadata_boundary_is_inclusive_without_partial_results(captured):
    c = captured
    result = reader(c)(["process-1"])
    size = len(canonical(result))
    assert reader(c)(["process-1"], max_metadata_bytes=size) == result
    refused(c, lambda: reader(c)(["process-1"], max_metadata_bytes=size - 1), 413, "payload_too_large")


@pytest.mark.parametrize("excess", [0, 1])
def test_complete_legacy_utf8_context_at_four_mib_is_inclusive_without_truncation(setup, monkeypatch, excess):
    c = setup
    source = {**c.core["SourceSnapshot"], "source_id": "large-synthetic-legacy", "text": "",
              "content_hash": sha256(b"").hexdigest()}
    reference = {k: source[k] for k in ("user_id", "source_id", "source_version")}
    legacy_record = record(c.batch, "legacy-limit", 1, source=reference, frame_id=None, artifacts=[])
    batch = {**c.batch, "records": [legacy_record]}
    expected = {"batch": {**batch, "delivery_mode": "historical",
                          "batch_id": "context-" + fingerprint([USER, ["legacy-limit"]])},
                "sources": [source], "frames": []}
    available = LIMIT + excess - len(canonical(expected))
    source["text"] = "汉" * (available // 3) + "x" * (available % 3)
    source["content_hash"] = sha256(source["text"].encode("utf-8")).hexdigest()
    assert len(canonical(expected)) == LIMIT + excess
    frame = {**c.core["Frame"], "source_id": source["source_id"],
             "frame_id": "large-legacy-fixture-frame", "artifact_id": "large-legacy-fixture-bytes"}
    original = c.store._documents[USER][("artifact", c.core["Frame"]["artifact_id"])]
    c.archive.import_fixture(USER, source, frame, base64.b64decode(original["data_base64"]))
    CaptureArchive(c.store, c.registry.resolve_capture).ingest(USER, batch, "legacy-limit")
    before = documents(c)

    def no_scan(*args, **kwargs):
        pytest.fail("context size check cannot scan the archive")

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "scan", no_scan)
        if excess:
            refused(c, lambda: reader(c)(["legacy-limit"]), 413, "payload_too_large")
        else:
            result = reader(c)(["legacy-limit"])
            assert result == expected
            assert result["sources"][0]["text"] == source["text"]
    assert documents(c) == before


def test_hundred_committed_records_are_accepted_without_changing_their_order(uploaded):
    c = uploaded
    records = [record(c.batch, f"record-{i}", i + 1) for i in range(100)]
    success(ingest(c, envelope={**c.envelope, "batch": {**c.batch, "records": records}}), "ProcessBatchAck")
    ids = [r["record_id"] for r in reversed(records)]
    before = documents(c)
    result = reader(c)(ids)
    assert result["batch"]["records"] == list(reversed(records))
    assert result["sources"] == [c.descriptor] and result["frames"] == [c.frame]
    assert documents(c) == before


def test_missing_selected_record_cannot_publish_the_existing_subset(captured):
    c = captured
    refused(c, lambda: reader(c)(["process-1", "absent"]), 404, "not_found")


def test_foreign_actor_cannot_read_known_record_ids(captured):
    c = captured
    before = deepcopy(c.store._documents)
    read = AuthorizedProcessContextReader(c.store, "other-user",
        current_guard(c, user_id="other-user", token="foreign-token"))
    with pytest.raises(DomainError) as exc:
        read(["process-1"])
    assert (exc.value.status, exc.value.code) == (404, "not_found")
    assert c.store._documents == before


@pytest.mark.parametrize("kind", ["capture_tombstone", "frame_tombstone", "original_artifact_tombstone"])
def test_retained_payload_cannot_override_a_deletion_tombstone(captured, kind):
    c = captured
    identifier, field = {"capture_tombstone": ("process-1", "record_id"),
        "frame_tombstone": (c.frame["frame_id"], "frame_id"),
        "original_artifact_tombstone": (c.ink_ref["artifact_id"], "artifact_id")}[kind]
    with c.store.transaction(USER) as tx:
        tx.put(kind, identifier, {field: identifier})
    refused(c, lambda: reader(c)(["process-1"]), 404, "not_found")


def test_previously_read_context_is_not_future_authority_for_image_bytes(captured):
    c = captured
    result = reader(c)(["process-1"])
    c.archive.revoke_source(USER, SOURCE)
    before = documents(c)
    packet = compose_process_context(**result,
        resolver=AuthorizedImageResolver(c.store, USER, current_guard(c)), user_id=USER)
    assert packet["items"][0]["image"] == {"status": "revoked"}
    assert packet["authorization_status"] == "not_attested"
    assert packet["provider_receipt"] == "not_attested" and packet["presentation_permission"] == "not_granted"
    assert documents(c) == before
    refused(c, lambda: reader(c)(["process-1"]), 403, "forbidden")


def test_legitimate_records_from_distinct_streams_cannot_form_one_context(captured):
    c = captured
    other = registration(c, "other-stream")
    start(c, other, producer="other-synthetic-producer", request_key="other-start")
    batch = deepcopy(c.batch)
    batch["stream_id"] = other["stream_id"]
    batch["records"] = [record(batch, "other-record", 1,
        source={k: c.core["SourceSnapshot"][k] for k in ("user_id", "source_id", "source_version")},
        frame_id=None, artifacts=[])]
    CaptureArchive(c.store, c.registry.resolve_capture).ingest(USER, batch, "other-record")
    legacy = reader(c)(["other-record"])
    assert legacy["sources"] == [c.core["SourceSnapshot"]] and legacy["frames"] == []
    refused(c, lambda: reader(c)(["process-1", "other-record"]), 409, "dependency_missing")


def test_stored_attempt_scope_requires_unreleased_relation_boundary(captured):
    c = captured
    batch = deepcopy(c.batch)
    batch["records"][0]["scope"] = {"kind": "attempt", "problem_id": "p", "attempt_id": "a", "relation_revision": 1}
    # Synthetic historical storage state; the current HTTP ingress cannot grant
    # this unsupported scope and is not changed to manufacture its authority.
    c.store._documents[USER][("capture_record", "process-1")]["canonical_json"] = canonical_record(batch, "process-1").decode()
    refused(c, lambda: reader(c)(["process-1"]), 409, "dependency_missing")


@pytest.mark.parametrize("missing", ["source", "snapshot", "frame", "binding", "slot", "artifact_ref"])
def test_missing_referenced_committed_metadata_never_yields_partial_context(captured, missing):
    c = captured
    identities = {"source": ("source", SOURCE), "snapshot": ("snapshot", key(SOURCE, 1)),
                  "frame": ("frame", c.frame["frame_id"]), "binding": ("capture_binding", c.batch["stream_id"]),
                  "artifact_ref": ("capture_artifact_ref", c.ink_ref["artifact_id"])}
    if missing == "slot":
        identity = next(k for k in c.store._documents[USER] if k[0] == "capture_slot")
    else:
        identity = identities[missing]
    del c.store._documents[USER][identity]
    refused(c, lambda: reader(c)(["process-1"]), 503, "unavailable")


@pytest.mark.parametrize("corrupt", ["record_json", "received_at", "snapshot", "frame", "binding", "slot", "artifact_ref"])
def test_corrupt_retained_metadata_never_becomes_a_valid_snapshot(captured, corrupt):
    c = captured
    actor = c.store._documents[USER]
    if corrupt in {"record_json", "received_at"}:
        actor[("capture_record", "process-1")]["canonical_json" if corrupt == "record_json" else "received_at"] = "PRIVATE malformed"
    elif corrupt == "snapshot":
        actor[("snapshot", key(SOURCE, 1))]["contract_version"] = "9.9.9"
    elif corrupt == "frame":
        actor[("frame", c.frame["frame_id"])]["width"] = True
    elif corrupt == "binding":
        actor[("capture_binding", c.batch["stream_id"])]["user_id"] = "other-user"
    elif corrupt == "slot":
        identity = next(k for k in actor if k[0] == "capture_slot")
        actor[identity]["record_id"] = "different-record"
    else:
        actor[("capture_artifact_ref", c.ink_ref["artifact_id"])]["byte_length"] += 1
    refused(c, lambda: reader(c)(["process-1"]), 503, "unavailable")


@pytest.mark.parametrize("fence", ["stop", "withdraw"])
def test_scoped_capture_stop_preserves_authorized_historical_context(captured, fence):
    c = captured
    expected = reader(c)(["process-1"])
    apply(c, command(c, fence))
    before = documents(c)
    assert reader(c)(["process-1"]) == expected
    assert expected["batch"]["delivery_mode"] == "historical"
    assert documents(c) == before


def test_capture_generation_must_match_independent_retained_display_authorization(captured):
    c = captured
    stream = c.batch["stream_id"]
    actor = c.store._documents[USER]
    assert actor[("source", SOURCE)]["authorization_generation"] == 1
    assert actor[("control_stream", stream)]["state"]["authorization_generation"] == 1
    assert actor[("control_start", stream)]["authorization_generation"] == 1
    actor[("capture_binding", stream)]["authorization_generation"] = 11
    refused(c, lambda: reader(c)(["process-1"]), 503, "unavailable")


def test_current_account_regrant_does_not_replace_historical_capture_generation(captured):
    c = captured
    expected = reader(c)(["process-1"])
    old_principal = c.auth.authenticate("read-token", c.instant[0])
    c.archive.set_authorization(USER, False)
    current = c.archive.set_authorization(USER)
    assert current["generation"] > old_principal.authorization_generation
    c.auth = LocalTestAuthenticator({"read-token": replace(old_principal,
        authorization_generation=current["generation"])})
    stream = c.batch["stream_id"]
    with c.store.transaction(USER) as tx:
        assert tx.get("capture_binding", stream)["authorization_generation"] == 1
        assert tx.get("source", SOURCE)["authorization_generation"] == 1
        assert tx.get("control_stream", stream)["state"]["authorization_generation"] == 1
        assert tx.get("control_start", stream)["authorization_generation"] == 1
    before = documents(c)
    assert reader(c)(["process-1"]) == expected
    assert expected["batch"]["delivery_mode"] == "historical"
    assert documents(c) == before


@pytest.mark.parametrize("fence,status", [("source_revoke", 403), ("source_delete", 404),
                                         ("account_revoke", 403), ("generation", 403)])
def test_current_revocation_deletion_and_stale_generation_withhold_context(captured, fence, status):
    c = captured
    if fence == "source_revoke":
        c.archive.revoke_source(USER, SOURCE)
    elif fence == "source_delete":
        c.archive.delete_source(USER, SOURCE)
    else:
        c.archive.set_authorization(USER, False)
        if fence == "generation":
            c.archive.set_authorization(USER)
    refused(c, lambda: reader(c)(["process-1"]), status, "not_found" if status == 404 else "forbidden")


def test_token_expiry_under_actor_lock_is_rechecked_before_metadata_read(captured, monkeypatch):
    c = captured
    original_transaction = c.store.transaction
    before = documents(c)

    @contextmanager
    def expired(actor):
        with original_transaction(actor) as tx:
            c.instant[0] += timedelta(hours=2)
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", expired)
        with pytest.raises(DomainError) as exc:
            reader(c)(["process-1"])
    assert (exc.value.status, exc.value.code) == (401, "unauthenticated")
    assert documents(c) == before


def test_token_revoked_during_reads_is_rechecked_before_return(captured, monkeypatch):
    c = captured
    before = documents(c)
    original_get = _MemoryTransaction.get

    def revoke_after_frame(tx, kind, identifier):
        result = original_get(tx, kind, identifier)
        if kind == "frame":
            c.auth.revoke("read-token")
        return result

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "get", revoke_after_frame)
        with pytest.raises(DomainError) as exc:
            reader(c)(["process-1"])
    assert (exc.value.status, exc.value.code) == (401, "unauthenticated")
    assert documents(c) == before


def test_failed_transaction_exit_publishes_no_detached_context(captured, monkeypatch):
    c = captured
    before = documents(c)
    original_transaction = c.store.transaction
    published = []

    @contextmanager
    def failed_exit(actor):
        with original_transaction(actor) as tx:
            yield tx
            raise RuntimeError("PRIVATE synthetic read transaction failure")

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", failed_exit)
        with pytest.raises(DomainError) as exc:
            published.append(reader(c)(["process-1"]))
    assert (exc.value.status, exc.value.code) == (503, "unavailable")
    assert published == [] and documents(c) == before


@pytest.mark.parametrize("guard_call", [1, 2])
def test_cancelled_future_guard_propagates_without_publishing_context(captured, guard_call):
    c = captured
    before = documents(c)
    future = Future()
    assert future.cancel()
    calls, published = [], []
    authorize = current_guard(c)

    def guard(state):
        authorize(state)
        calls.append(True)
        if len(calls) == guard_call:
            future.result()

    with pytest.raises(FutureCancelledError):
        published.append(AuthorizedProcessContextReader(c.store, USER, guard)(["process-1"]))
    assert len(calls) == guard_call
    assert published == [] and documents(c) == before


@pytest.mark.parametrize("phase", ["enter", "read", "exit"])
def test_cancelled_future_transaction_propagates_without_partial_context(captured, monkeypatch, phase):
    c = captured
    before = documents(c)
    original_transaction = c.store.transaction
    future = Future()
    assert future.cancel()
    published, reached = [], []

    def cancel():
        reached.append(phase)
        future.result()

    @contextmanager
    def cancelled_transaction(actor):
        if phase == "enter":
            cancel()
        with original_transaction(actor) as tx:
            def get(kind, identity):
                value = tx.get(kind, identity)
                if phase == "read" and kind == "frame":
                    cancel()
                return value

            yield SimpleNamespace(get=get)
            if phase == "exit":
                cancel()

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", cancelled_transaction)
        with pytest.raises(FutureCancelledError):
            published.append(reader(c)(["process-1"]))
    assert reached == [phase] and published == []
    assert documents(c) == before


@pytest.mark.parametrize("exception_type", [asyncio.CancelledError, KeyboardInterrupt])
def test_final_guard_base_exceptions_propagate_unchanged(captured, exception_type):
    c = captured
    before = documents(c)
    exception = exception_type("synthetic cancellation")
    authorize = current_guard(c)
    calls, published = [], []

    def guard(state):
        authorize(state)
        calls.append(True)
        if len(calls) == 2:
            raise exception

    with pytest.raises(exception_type) as exc:
        published.append(AuthorizedProcessContextReader(c.store, USER, guard)(["process-1"]))
    assert exc.value is exception and len(calls) == 2
    assert published == [] and documents(c) == before


def test_resolver_future_cancellation_propagates_through_composer_after_valid_metadata_read(captured):
    c = captured
    before = documents(c)
    metadata = reader(c)(["process-1"])
    assert metadata["batch"]["records"] == c.batch["records"]
    future = Future()
    assert future.cancel()
    authorize = current_guard(c)
    published = []

    def cancelled_image_guard(state):
        authorize(state)
        future.result()

    resolver = AuthorizedImageResolver(c.store, USER, cancelled_image_guard)
    with pytest.raises(FutureCancelledError):
        published.append(compose_process_context(**metadata, resolver=resolver, user_id=USER))
    assert published == [] and documents(c) == before
