"""Typed originals remain source-bound across the existing capture consumer."""

from copy import deepcopy
import hashlib
import json

import pytest

from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts
from services.api.storage import MemoryStore
from services.api.tests.test_capture import USER, add_source, capture_fixture, put_blob


@pytest.fixture
def context():
    fixture = capture_fixture(MemoryStore(), USER)
    fixture.originals = OriginalArtifacts(fixture.store, lambda state: None)
    fixture.data = b'{"strokes": [{"points": [[1,2], [3,4]]}]}\n'
    fixture.ref = {"artifact_id": "original-strokes", "media_type": "application/json",
                   "sha256": hashlib.sha256(fixture.data).hexdigest(), "byte_length": len(fixture.data)}
    fixture.source = deepcopy(fixture.batch["records"][0]["source"])
    fixture.batch["records"][0]["artifacts"] = [fixture.ref]
    return fixture


def put(c):
    return c.originals.put(USER, c.source, "editable_ink", c.ref, c.data)


def test_matching_typed_capture_is_verified_replayed_and_read(context):
    c = context
    put(c)
    ack = c.capture.ingest(USER, c.batch, "capture-original")
    assert ack["acknowledged"][0]["artifacts"][0]["status"] == "verified"
    assert c.capture.ingest(USER, c.batch, "capture-original") == ack
    assert c.capture.read_record(USER, c.batch["records"][0]["record_id"])["record"] == c.batch["records"][0]
    assert c.originals.read(USER, c.source, c.ref["artifact_id"])["source"] == c.source


def test_legacy_raw_record_read_remains_metadata_only(context):
    c = context
    put_blob(c, c.ref, c.data)
    c.capture.ingest(USER, c.batch, "legacy")
    c.store._documents[USER][("artifact", c.ref["artifact_id"])]["data_base64"] = "broken"
    assert c.capture.read_record(USER, c.batch["records"][0]["record_id"])["record"] == c.batch["records"][0]
    # This raw metadata read never grants a typed byte-read or verified ACK.
    with pytest.raises(DomainError):
        c.originals.read(USER, c.source, c.ref["artifact_id"])


def test_upload_then_different_source_cannot_adopt_typed_bytes(context):
    c = context
    other = add_source(c)
    put(c)
    batch = deepcopy(c.batch)
    batch["records"][0]["source"] = other
    with pytest.raises(DomainError) as exc:
        c.capture.ingest(USER, batch, "foreign-source")
    assert exc.value.status == 409
    with c.store.transaction(USER) as tx:
        assert tx.scan("capture_record") == []
        assert tx.scan("capture_replay") == []


def test_pending_capture_cannot_later_claim_typed_ownership(context):
    c = context
    ack = c.capture.ingest(USER, c.batch, "pending-original")
    assert ack["acknowledged"][0]["artifacts"][0]["status"] == "pending"
    with pytest.raises(DomainError) as exc:
        put(c)
    assert exc.value.status == 409
    with c.store.transaction(USER) as tx:
        assert tx.get("artifact", c.ref["artifact_id"]) is None


def test_capture_replay_and_read_recheck_typed_binding_and_bytes(context):
    c = context
    put(c)
    c.capture.ingest(USER, c.batch, "capture-original")
    # Deliberate storage corruption cannot be hidden behind an earlier ACK.
    c.store._documents[USER][("artifact", c.ref["artifact_id"])]["data_base64"] = "YQ=="
    for action in (
        lambda: c.capture.ingest(USER, c.batch, "capture-original"),
        lambda: c.capture.read_record(USER, c.batch["records"][0]["record_id"]),
    ):
        with pytest.raises(DomainError) as exc:
            action()
        assert exc.value.status == 503


def test_lost_binding_never_downgrades_typed_bytes_into_legacy(context):
    c = context
    other = add_source(c)
    put(c)
    del c.store._documents[USER][("artifact", c.ref["artifact_id"])]["original_binding"]
    batch = deepcopy(c.batch)
    batch["records"][0]["source"] = other
    before = deepcopy(c.store._documents[USER])
    for action in (
        lambda: c.originals.read(USER, c.source, c.ref["artifact_id"]),
        lambda: c.capture.ingest(USER, batch, "lost-binding"),
        lambda: c.archive.delete_source(USER, c.source["source_id"]),
    ):
        with pytest.raises(DomainError) as exc:
            action()
        assert exc.value.status == 503
        assert c.store._documents[USER] == before


def test_capture_and_pending_upload_delete_under_one_source_lifecycle(context):
    c = context
    put(c)
    c.capture.ingest(USER, c.batch, "capture-original")
    pending = {**c.ref, "artifact_id": "pending-unreferenced-original"}
    c.originals.put(USER, c.source, "editable_ink", pending, c.data)
    c.archive.delete_source(USER, c.source["source_id"])
    with c.store.transaction(USER) as tx:
        for artifact_id in (c.ref["artifact_id"], pending["artifact_id"]):
            assert tx.get("artifact", artifact_id) is None
            assert tx.get("original_artifact_tombstone", artifact_id) == {"artifact_id": artifact_id}
        assert tx.scan("capture_record") == []
        assert all(row.get("deleted") for row in tx.scan("capture_replay"))
    with pytest.raises(DomainError):
        c.capture.ingest(USER, c.batch, "capture-original")


@pytest.mark.parametrize("deleted_owner", [True, False])
def test_invalid_cross_source_references_make_deletion_atomic(context, deleted_owner):
    c = context
    other = add_source(c)
    put(c)
    c.capture.ingest(USER, c.batch, "capture-original")
    row = c.store._documents[USER][("capture_record", c.batch["records"][0]["record_id"])]
    canonical = json.loads(row["canonical_json"])
    canonical["record"]["source"] = other
    row["canonical_json"] = json.dumps(canonical)
    before = deepcopy(c.store._documents[USER])
    with pytest.raises(DomainError) as exc:
        c.archive.delete_source(USER, c.source["source_id"] if deleted_owner else other["source_id"])
    assert exc.value.status == 409
    assert c.store._documents[USER] == before
