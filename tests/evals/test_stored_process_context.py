"""Stored-context preparation over actual in-process HTTP/MemoryStore fixtures.

All inputs are project-authored synthetic data. No listener, database, provider,
device capture, account action or final presentation is exercised.
"""

import asyncio
from concurrent.futures import CancelledError as FutureCancelledError, Future
from copy import deepcopy
from datetime import timedelta

from jsonschema import ValidationError
import pytest

from services.api.capture import CaptureArchive
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.tests.test_capture import record
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_ingress_http import SOURCE, captured, ingest, registered, setup, success, uploaded
from services.api.tests.test_process_context_reader import current_guard
from services.learning.process_context import prepare_stored_process_context


def reader(c):
    return AuthorizedProcessContextReader(c.store, USER, current_guard(c))


def resolver(c):
    return AuthorizedImageResolver(c.store, USER, current_guard(c))


def prepare(c, ids=None, *, read=None, resolve=None, **limits):
    return prepare_stored_process_context(["process-1"] if ids is None else ids,
        reader(c) if read is None else read, resolver(c) if resolve is None else resolve,
        user_id=USER, **limits)


def add_frameless(c, *, long_reason=False):
    source = c.core["SourceSnapshot"]
    reference = {k: source[k] for k in ("user_id", "source_id", "source_version")}
    item = record(c.batch, "frameless", 2, source=reference, frame_id=None, artifacts=[], media_position=None)
    item["evidence"]["reason_quote"] = "Synthetic original explanation 汉字。" * (200 if long_reason else 1)
    CaptureArchive(c.store, c.registry.resolve_capture).ingest(
        USER, {**c.batch, "batch_id": "frameless-test", "records": [item]}, "frameless-test")
    return item


def test_http_stored_png_and_exact_originals_return_after_two_complete_reads(captured):
    c = captured
    before = documents(c)
    calls = []
    read = reader(c)
    def counted(ids, **kwargs):
        calls.append((ids.copy(), kwargs))
        return read(ids, **kwargs)
    packet = prepare(c, read=counted)
    assert calls == [(["process-1"], {"max_metadata_bytes": 4 * 1024 * 1024})] * 2
    item = packet["items"][0]
    assert item["record"] == c.batch["records"][0]
    assert item["source"] == c.descriptor and item["frame"] == c.frame
    assert item["image"] == {"status": "attached", "data": c.data, "media_type": "image/png", "byte_length": len(c.data)}
    assert item["record"]["artifacts"] == [c.ref, c.ink_ref]
    assert packet["batch"] == {k: v for k, v in read(["process-1"])["batch"].items() if k != "records"}
    assert packet["counts"] == {"supplied": 1, "included": 1, "omitted": 0}
    assert packet["non_frame_artifacts"] == "references_only"
    for field in ("authorization_status", "commit_status", "live_status", "provider_receipt"):
        assert packet[field] == "not_attested"
    assert packet["presentation_permission"] == "not_granted" and packet["capture_completeness"] == "unknown"
    assert documents(c) == before
    packet["items"][0]["record"]["evidence"]["reason_quote"] = "changed returned value"
    packet["items"][0]["source"]["source_timezone"] = "changed returned value"
    packet["items"][0]["frame"]["width"] = 123
    assert documents(c) == before
    assert prepare(c)["items"][0]["record"] == c.batch["records"][0]


@pytest.mark.parametrize("fence,status", [
    ("source_revoke", 403), ("source_delete", 404), ("account_revoke", 403),
    ("account_removed", 403), ("token_expiry", 401), ("token_revoke", 401), ("corrupt_record", 503),
])
def test_change_after_authorized_byte_read_withholds_the_entire_packet(captured, fence, status):
    c = captured
    read, resolve = reader(c), resolver(c)
    reads, images, published = [], [], []
    def counted(ids, **kwargs):
        reads.append(ids.copy())
        return read(ids, **kwargs)
    def mutate_after_bytes(frame, **kwargs):
        result = resolve(frame, **kwargs)
        assert result["status"] == "available"
        images.append(result["data"])
        if fence == "source_revoke":
            c.archive.revoke_source(USER, SOURCE)
        elif fence == "source_delete":
            c.archive.delete_source(USER, SOURCE)
        elif fence == "account_revoke":
            c.archive.set_authorization(USER, False)
        elif fence == "account_removed":
            # Simulated removal of this isolated MemoryStore actor's data. No
            # account-delete API exists here and none is being claimed/tested.
            c.store._documents[USER].clear()
        elif fence == "token_expiry":
            c.instant[0] += timedelta(hours=2)
        elif fence == "token_revoke":
            c.auth.revoke("read-token")
        else:
            c.store._documents[USER][("capture_record", "process-1")]["canonical_json"] = "PRIVATE corrupt data"
        return result
    with pytest.raises(DomainError) as error:
        published.append(prepare(c, read=counted, resolve=mutate_after_bytes))
    assert error.value.status == status
    assert reads == [["process-1"], ["process-1"]] and images == [c.data]
    assert published == []


def test_frameless_source_revoke_requires_second_read_even_without_byte_callbacks(captured):
    c = captured
    original = add_frameless(c)
    read, reads, published = reader(c), [], []
    def revoke_after_snapshot(ids, **kwargs):
        reads.append(ids.copy())
        snapshot = read(ids, **kwargs)
        assert snapshot["batch"]["records"] == [original]
        if len(reads) == 1:
            c.archive.revoke_source(USER, original["source"]["source_id"])
        return snapshot
    def no_image(*args, **kwargs):
        pytest.fail("Frameless context must not read image bytes")
    with pytest.raises(DomainError) as error:
        published.append(prepare(c, ["frameless"], read=revoke_after_snapshot, resolve=no_image))
    assert error.value.status == 403 and published == []
    assert reads == [["frameless"], ["frameless"]]


def test_budget_omitted_source_still_belongs_to_final_complete_selection(captured):
    c = captured
    original = add_frameless(c, long_reason=True)
    ids = ["process-1", "frameless"]
    control = prepare(c, ids, max_metadata_bytes=4000)
    assert control["counts"] == {"supplied": 2, "included": 1, "omitted": 1}
    assert control["items"][0]["record"]["record_id"] == "process-1"
    read, resolve, reads, published = reader(c), resolver(c), [], []
    def counted(selected, **kwargs):
        reads.append(selected.copy())
        return read(selected, **kwargs)
    def revoke_omitted_source(frame, **kwargs):
        result = resolve(frame, **kwargs)
        c.archive.revoke_source(USER, original["source"]["source_id"])
        return result
    with pytest.raises(DomainError) as error:
        published.append(prepare(c, ids, read=counted, resolve=revoke_omitted_source, max_metadata_bytes=4000))
    assert error.value.status == 403 and published == []
    assert reads == [ids, ids]


@pytest.mark.parametrize("change", ["reason", "clock", "source", "frame", "missing", "extra", "nan"])
def test_changed_or_corrupt_final_snapshot_cannot_publish_partial_packet(captured, change):
    c = captured
    read, calls, published = reader(c), [], []
    def changed(ids, **kwargs):
        calls.append(ids.copy())
        result = read(ids, **kwargs)
        if len(calls) == 2:
            if change == "reason":
                result["batch"]["records"][0]["evidence"]["reason_quote"] = "changed reason"
            elif change == "clock":
                result["batch"]["records"][0]["clock"] = None
            elif change == "source":
                result["sources"][0]["source_timezone"] = "Europe/London"
            elif change == "frame":
                result["frames"][0]["width"] += 1
            elif change == "missing":
                result = None
            elif change == "extra":
                result["permission"] = "granted"
            else:
                result["frames"][0]["width"] = float("nan")
        return result
    with pytest.raises(ValueError):
        published.append(prepare(c, read=changed))
    assert published == [] and calls == [["process-1"], ["process-1"]]


def test_final_canonical_match_allows_mapping_order_but_not_selection_reordering(captured):
    c = captured
    second = record(c.batch, "second", 2, causal_parents=["process-1"])
    third = record(c.batch, "third", 3, causal_parents=["second"], observed_at=None, clock=None)
    success(ingest(c, envelope={**c.envelope, "batch": {**c.batch, "records": [second, third]}},
                   request_key="stored-context-children"), "ProcessBatchAck")
    ids = ["third", "second"]
    read = reader(c)
    def reversed_keys(selected, **kwargs):
        result = read(selected, **kwargs)
        return dict(reversed(list(result.items())))
    packet = prepare(c, ids, read=reversed_keys)
    assert [i["record"] for i in packet["items"]] == [third, second]
    assert packet["items"][0]["parents"] == [{"record_id": "second", "status": "included"}]
    assert packet["items"][1]["parents"] == [{"record_id": "process-1", "status": "outside_context_unknown"}]
    assert packet["ordering"] == "supplied_array_not_chronology"
    def wrong_selection(selected, **kwargs):
        return read(list(reversed(selected)), **kwargs)
    with pytest.raises(ValueError, match="complete ordered selection"):
        prepare(c, ids, read=wrong_selection)


def test_mutating_requested_ids_and_reader_aliases_cannot_change_frozen_comparison(captured):
    c = captured
    ids, calls, returned = ["process-1"], [], []
    read = reader(c)
    def mutate_arguments(selected, **kwargs):
        calls.append(selected.copy())
        result = read(selected, **kwargs)
        returned.append(result)
        selected.clear()  # Reader cannot retarget the frozen second selection.
        ids[:] = ["foreign-id"]  # Later caller mutation also cannot retarget it.
        return result
    packet = prepare(c, ids, read=mutate_arguments)
    assert calls == [["process-1"], ["process-1"]]
    assert packet["items"][0]["record"] == c.batch["records"][0]
    returned[0]["sources"][0]["project_id"] = "mutated cached reply"
    returned[1]["batch"]["records"][0]["evidence"]["reason_quote"] = "mutated final reply"
    assert packet["items"][0]["source"] == c.descriptor
    assert packet["items"][0]["record"] == c.batch["records"][0]


def test_mutated_shared_reader_reply_cannot_rewrite_the_original_comparison(captured):
    c = captured
    shared = reader(c)(["process-1"])
    reads, published = [], []
    def aliased(ids, **kwargs):
        reads.append(ids.copy())
        return shared
    def mutate_snapshot(frame, **kwargs):
        shared["batch"]["records"][0]["evidence"]["reason_quote"] = "different explanation"
        return resolver(c)(frame, **kwargs)
    with pytest.raises(ValueError, match="metadata changed"):
        published.append(prepare(c, read=aliased, resolve=mutate_snapshot))
    assert reads == [["process-1"], ["process-1"]] and published == []


def test_missing_original_image_is_a_gap_when_metadata_is_still_authorized(captured):
    c = captured
    # Simulate unavailable blob content without a source/record deletion. A real
    # tombstone or revoked metadata is covered by the complete-read failure cases.
    del c.store._documents[USER][("artifact", c.ref["artifact_id"])]
    before = documents(c)
    result = prepare(c)
    assert result["items"][0]["image"] == {"status": "missing"}
    assert result["items"][0]["record"] == c.batch["records"][0]
    assert result["attached_bytes"] == 0 and documents(c) == before


@pytest.mark.parametrize("change", ["missing_frames", "missing_record", "extra_field", "live_envelope"])
def test_incomplete_or_wrong_initial_reader_result_stops_before_image_reads(captured, change):
    c = captured
    calls = []
    def wrong(ids, **kwargs):
        calls.append(ids.copy())
        result = reader(c)(ids, **kwargs)
        if change == "missing_frames":
            del result["frames"]
        elif change == "missing_record":
            result["batch"]["records"] = []
        elif change == "extra_field":
            result["permission"] = "granted"
        else:
            result["batch"]["delivery_mode"] = "live"
        return result
    def forbidden(*args, **kwargs):
        pytest.fail("Invalid initial metadata cannot resolve images")
    with pytest.raises((ValueError, ValidationError)):
        prepare(c, read=wrong, resolve=forbidden)
    assert calls == [["process-1"]]


@pytest.mark.parametrize("stage", ["initial_read", "resolve", "final_read"])
@pytest.mark.parametrize("error_type", [FutureCancelledError, asyncio.CancelledError])
def test_cancellation_propagates_without_retry_or_further_work(captured, stage, error_type):
    c = captured
    read, resolve, calls = reader(c), resolver(c), []
    future = Future()
    assert future.cancel()
    def cancel():
        if error_type is FutureCancelledError:
            return future.result()
        raise error_type()
    def selected(ids, **kwargs):
        phase = "final_read" if calls else "initial_read"
        calls.append(phase)
        if phase == stage:
            cancel()
        return read(ids, **kwargs)
    def image(frame, **kwargs):
        calls.append("resolve")
        if stage == "resolve":
            cancel()
        return resolve(frame, **kwargs)
    with pytest.raises(error_type):
        prepare(c, read=selected, resolve=image)
    assert calls == {"initial_read": ["initial_read"], "resolve": ["initial_read", "resolve"],
                     "final_read": ["initial_read", "resolve", "final_read"]}[stage]


def test_actual_adapter_resolver_cancellation_with_valid_reader_withholds_packet(captured):
    """Integration dependency: Backend must expose cancellation from its guard."""
    c = captured
    future = Future()
    assert future.cancel()
    def cancelled_guard(state):
        return future.result()
    read, reads, published = reader(c), [], []
    def counted(ids, **kwargs):
        reads.append(ids.copy())
        return read(ids, **kwargs)  # Separate, still-valid current authorization.
    with pytest.raises(FutureCancelledError):
        published.append(prepare(c, read=counted,
            resolve=AuthorizedImageResolver(c.store, USER, cancelled_guard)))
    assert published == [] and reads == [["process-1"]]


@pytest.mark.parametrize("fence", ["stop", "withdraw"])
def test_authorized_historical_stop_context_keeps_all_non_attestation_flags(captured, fence):
    c = captured
    apply(c, command(c, fence))
    before = documents(c)
    result = prepare(c)
    assert result["batch"]["delivery_mode"] == "historical"
    assert result["items"][0]["image"]["data"] == c.data
    assert result["live_status"] == "not_attested" and result["presentation_permission"] == "not_granted"
    assert documents(c) == before


@pytest.mark.parametrize("ids", [None, [], (), "process-1", [True], ["process-1", "process-1"], ["p"] * 101])
def test_invalid_selection_never_reads_metadata_or_bytes(ids):
    def forbidden(*args, **kwargs):
        pytest.fail("Invalid selection must fail before any reader/resolver")
    with pytest.raises((ValueError, ValidationError)):
        prepare_stored_process_context(ids, forbidden, forbidden, user_id=USER)
