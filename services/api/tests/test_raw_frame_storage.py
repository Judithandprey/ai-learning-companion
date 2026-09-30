"""Raw/legacy identity and erasure boundaries in the existing actor archive.

These are synthetic MemoryStore checks; migration execution has its own DB run.
"""

from copy import deepcopy
import json

import pytest

from packages.contracts.capture_frame import validate
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts
from services.api.storage import ImmutableDocumentError, MemoryStore
from services.api.tests.test_control import documents
from services.api.tests.test_raw_frame_ingress import raw_setup, registered, setup, uploaded


def insert_raw(c, frame=None):
    frame = c.raw_frame if frame is None else frame
    validate(frame)
    with c.store.transaction(c.user) as tx:
        Archive._immutable(tx, "raw_capture_frame", frame["frame_id"], frame)


def denied(c, operation, status, code):
    before = documents(c)
    with pytest.raises(DomainError) as error:
        operation()
    assert (error.value.status, error.value.code) == (status, code)
    assert documents(c) == before


@pytest.mark.parametrize("first,second", [("frame", "raw_capture_frame"), ("raw_capture_frame", "frame")])
@pytest.mark.parametrize("direct", [False, True])
def test_frame_ids_are_one_namespace_for_domain_and_direct_storage(first, second, direct):
    store = MemoryStore()
    with store.transaction("owner") as tx:
        Archive._immutable(tx, first, "one-frame", {"frame_id": "one-frame"})
    before = deepcopy(store._documents)
    error = ImmutableDocumentError if direct else DomainError
    with pytest.raises(error) as caught:
        with store.transaction("owner") as tx:
            tx.put("head", "must-rollback", {})
            if direct:
                tx.put(second, "one-frame", {"frame_id": "one-frame"})
            else:
                Archive._immutable(tx, second, "one-frame", {"frame_id": "one-frame"})
    if not direct:
        assert (caught.value.status, caught.value.code) == (409, "frame_identity_conflict")
    assert store._documents == before
    with store.transaction("other-owner") as tx:
        Archive._immutable(tx, second, "one-frame", {"frame_id": "one-frame"})


@pytest.mark.parametrize("kind", ["frame", "raw_capture_frame"])
@pytest.mark.parametrize("direct", [False, True])
@pytest.mark.parametrize("retained", [False, True])
def test_common_frame_tombstone_refuses_new_and_replayed_writes(kind, direct, retained):
    store = MemoryStore()
    value = {"frame_id": "erased"}
    with store.transaction("owner") as tx:
        if retained:
            tx.put(kind, "erased", value)
        tx.put("frame_tombstone", "erased", {"frame_id": "erased"})
    before = deepcopy(store._documents)
    error = ImmutableDocumentError if direct else DomainError
    with pytest.raises(error) as caught:
        with store.transaction("owner") as tx:
            if direct:
                tx.put(kind, "erased", value)
            else:
                Archive._immutable(tx, kind, "erased", value)
    if not direct:
        assert (caught.value.status, caught.value.code) == (404, "frame_not_found")
    assert store._documents == before


def test_raw_metadata_exact_replay_is_immutable_and_detached(raw_setup):
    c = raw_setup
    original = deepcopy(c.raw_frame)
    insert_raw(c)
    insert_raw(c)
    c.raw_frame["orientation"]["value"] = 8
    denied(c, lambda: insert_raw(c), 409, "immutable_conflict")
    with c.store.transaction(c.user) as tx:
        saved = tx.get("raw_capture_frame", original["frame_id"])
        assert saved == original
        saved["timing"]["sample_pts_seconds"] = 999
        assert tx.get("raw_capture_frame", original["frame_id"]) == original
        assert tx.get("frame", original["frame_id"]) is None


def test_separate_raw_kind_does_not_change_unrelated_legacy_export(raw_setup):
    c = raw_setup
    selected = [c.core["SourceSnapshot"]["source_id"]]
    before = c.archive.export_learning_snapshot(c.user, selected)
    insert_raw(c)
    assert c.archive.export_learning_snapshot(c.user, selected) == before


def test_delete_finds_raw_frame_without_capture_record_and_preserves_other_source(raw_setup):
    c = raw_setup
    insert_raw(c)
    with c.store.transaction(c.user) as tx:
        assert tx.scan("capture_record") == []
        legacy_frame = tx.get("frame", c.core["Frame"]["frame_id"])
        legacy_artifact = tx.get("artifact", legacy_frame["artifact_id"])
    c.archive.delete_source(c.user, c.source["source_id"])
    with c.store.transaction(c.user) as tx:
        assert tx.get("raw_capture_frame", c.raw_frame["frame_id"]) is None
        assert tx.get("frame_tombstone", c.raw_frame["frame_id"]) == {"frame_id": c.raw_frame["frame_id"]}
        for reference in (c.ref, c.ink_ref):
            assert tx.get("artifact", reference["artifact_id"]) is None
            assert tx.get("original_artifact_tombstone", reference["artifact_id"]) is not None
        assert tx.get("frame", legacy_frame["frame_id"]) == legacy_frame
        assert tx.get("artifact", legacy_frame["artifact_id"]) == legacy_artifact
    after = documents(c)
    c.archive.delete_source(c.user, c.source["source_id"])
    assert documents(c) == after
    denied(c, lambda: insert_raw(c), 404, "frame_not_found")


def test_foreign_raw_reference_prevents_erasing_owned_original(raw_setup):
    c = raw_setup
    insert_raw(c)
    foreign = deepcopy(c.raw_frame)
    foreign.update(frame_id="foreign-raw-frame")
    foreign["source"]["source_id"] = c.core["SourceSnapshot"]["source_id"]
    insert_raw(c, foreign)
    denied(c, lambda: c.archive.delete_source(c.user, c.source["source_id"]),
           409, "original_source_conflict")


def test_surviving_raw_descriptor_fences_deleted_original_id_when_bytes_are_missing(raw_setup):
    c = raw_setup
    insert_raw(c)
    with c.store.transaction(c.user) as tx:
        tx.delete("artifact", c.ref["artifact_id"])
        assert tx.scan("capture_record") == []
        assert tx.scan("capture_artifact_ref") == []
    c.archive.delete_source(c.user, c.source["source_id"])
    with c.store.transaction(c.user) as tx:
        assert tx.get("original_artifact_tombstone", c.ref["artifact_id"]) == {
            "artifact_id": c.ref["artifact_id"]}
        with pytest.raises(DomainError) as error:
            Archive._immutable(tx, "artifact", c.ref["artifact_id"], {"id": c.ref["artifact_id"]})
        assert (error.value.status, error.value.code) == (404, "original_not_found")


def test_raw_frame_cannot_erase_typed_bytes_owned_by_another_source(raw_setup):
    c = raw_setup
    foreign_source = {field: c.core["SourceSnapshot"][field]
                      for field in ("user_id", "source_id", "source_version")}
    foreign_ref = {**c.ref, "artifact_id": "foreign-original-png"}
    OriginalArtifacts(c.store, lambda state: None).put(
        c.user, foreign_source, "screen_image", foreign_ref, c.data)
    frame = {**c.raw_frame, "artifact": foreign_ref}
    insert_raw(c, frame)
    denied(c, lambda: c.archive.delete_source(c.user, c.source["source_id"]),
           409, "original_source_conflict")


def test_capture_record_of_another_source_cannot_delete_raw_frame(raw_setup):
    c = raw_setup
    insert_raw(c)
    foreign_source = c.core["SourceSnapshot"]["source_id"]
    record = {**deepcopy(c.batch["records"][0]), "record_id": "misbound-record",
              "source": {**c.source, "source_id": foreign_source}}
    envelope = {field: c.batch[field] for field in ("device_id", "session_id", "stream_id")}
    envelope["record"] = record
    with c.store.transaction(c.user) as tx:
        tx.put("capture_record", record["record_id"],
               {"canonical_json": json.dumps(envelope), "received_at": "2026-09-29T12:00:00Z"})
    denied(c, lambda: c.archive.delete_source(c.user, foreign_source),
           409, "mixed_source_frame_conflict")


@pytest.mark.parametrize("delete_raw_source", [False, True])
def test_preexisting_cross_kind_foreign_collision_blocks_either_source_deletion(raw_setup, delete_raw_source):
    c = raw_setup
    raw = deepcopy(c.raw_frame)
    raw["frame_id"] = c.core["Frame"]["frame_id"]
    validate(raw)
    # Intentional impossible-store corruption: production put rejects this.
    c.store._documents[c.user][("raw_capture_frame", raw["frame_id"])] = raw
    source_id = c.source["source_id"] if delete_raw_source else c.core["SourceSnapshot"]["source_id"]
    denied(c, lambda: c.archive.delete_source(c.user, source_id), 409, "mixed_source_frame_conflict")


@pytest.mark.parametrize("change", ["owner", "key", "schema"])
def test_unclassifiable_raw_frame_fails_deletion_without_partial_erasure(raw_setup, change):
    c = raw_setup
    raw = deepcopy(c.raw_frame)
    record_key = raw["frame_id"]
    if change == "owner":
        raw["source"]["user_id"] = "other-owner"
    elif change == "key":
        record_key = "wrong-stored-key"
    else:
        raw["captured_at"] = "2026-09-29T12:00:00Z"
    with c.store.transaction(c.user) as tx:
        tx.put("raw_capture_frame", record_key, raw)
    denied(c, lambda: c.archive.delete_source(c.user, c.source["source_id"]), 503, "unavailable")
