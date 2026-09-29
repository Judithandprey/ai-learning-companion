"""Portable original-byte lifecycle checks; these do not prove device/DB durability."""

import base64
from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json
from types import SimpleNamespace

import pytest

from packages.contracts.original_artifact import (
    MAX_ARTIFACT_BYTES, decode_upload, validate_receipt,
)
from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts
from services.api.tests.test_source_deletion import (
    EXAMPLES, SOURCE_A, SOURCE_B, USER, setup as archive_setup,
)


DATA = b'{ "strokes": [{"points": [[1, 2], [3, 4]]}], "history": [] }\n'


def binding(data=DATA, artifact_id="original-ink", *, source_id=SOURCE_A,
            version=1, kind="editable_ink", media_type="application/json"):
    return {"contract_version": "0.2.2", "source": {
        "user_id": USER, "source_id": source_id, "source_version": version},
        "kind": kind, "artifact": {"artifact_id": artifact_id,
        "sha256": hashlib.sha256(data).hexdigest(), "byte_length": len(data),
        "media_type": media_type}}


@pytest.fixture
def setup(archive_setup):
    archive, store, bundles = archive_setup
    with store.transaction(USER) as tx:
        generation = tx.get("authorization", "state")["generation"]
    calls = []

    def guard(state):
        calls.append(deepcopy(state))
        if state["generation"] != generation:
            raise DomainError(403, "forbidden")

    return SimpleNamespace(archive=archive, store=store, bundles=bundles,
                           service=OriginalArtifacts(store, authorization_guard=guard),
                           guard=guard, calls=calls)


def put(setup, item=None, data=DATA, user_id=USER):
    item = item if item is not None else binding(data)
    return setup.service.put(user_id, item["source"], item["kind"], item["artifact"], data)


def read(setup, item=None, user_id=USER):
    item = item if item is not None else binding()
    return setup.service.read(user_id, item["source"], item["artifact"]["artifact_id"])


def fails(status, operation):
    with pytest.raises(DomainError) as error:
        operation()
    assert error.value.status == status


def state(setup):
    with setup.store.transaction(USER) as tx:
        return deepcopy(tx.documents)


def add_version(setup):
    bundle = setup.bundles[SOURCE_A]
    snapshot = {**bundle["snapshot"], "source_version": 2}
    frame = {**bundle["frame"], "source_version": 2, "frame_id": "frame-A-v2",
             "artifact_id": "frame-artifact-A-v2"}
    setup.archive.import_fixture(USER, snapshot, frame, (EXAMPLES / "frame.svg").read_bytes())
    event = {**bundle["event"], "source_version": 2, "frame_id": "frame-A-v2",
             "event_id": "event-A-v2", "device_sequence": 3}
    setup.archive.events(USER, {"contract_version": "0.1.0", "events": [event]})


def note(setup, source_id=SOURCE_A, artifact_id="original-ink"):
    value = deepcopy(setup.bundles[source_id]["note"])
    value.update(kind="handwritten", authorship="user", ink_blob_id=artifact_id,
                 blocks=[{"id": "mine", "layer": "user_original", "format": "text",
                          "content": "My original attempt"}])
    return value


@pytest.mark.parametrize("kind,media_type,data", [
    ("editable_ink", "application/json", DATA),
    ("screen_image", "image/png", b"\x89PNG\r\nsynthetic image bytes\x00"),
    ("screen_image", "image/jpeg", b"\xff\xd8synthetic image bytes\xff\xd9"),
])
def test_exact_original_bytes_receipt_replay_and_service_reconstruction(setup, kind, media_type, data):
    item = binding(data, kind=kind, media_type=media_type)
    request = deepcopy(item)
    before = state(setup)
    receipt = put(setup, item, data)
    assert receipt == {**item, "status": "bytes_committed"}
    validate_receipt(item, receipt)
    assert put(setup, item, data) == receipt
    restarted = OriginalArtifacts(setup.store, authorization_guard=setup.guard)
    upload = restarted.read(USER, item["source"], item["artifact"]["artifact_id"])
    assert upload == {**item, "data_base64": base64.b64encode(data).decode("ascii")}
    assert decode_upload(upload, user_id=USER) == data
    assert item == request
    assert len(setup.calls) == 3
    assert state(setup)[("session", setup.bundles[SOURCE_A]["frame"]["session_id"])] == before[
        ("session", setup.bundles[SOURCE_A]["frame"]["session_id"])]


def test_separate_revision_originals_survive_changes_to_the_current_answer(setup):
    first = binding()
    corrected_data = b'{"strokes":[],"history":["erase","undo","redo"]}'
    corrected = binding(corrected_data, "corrected-ink")
    put(setup, first)
    put(setup, corrected, corrected_data)
    assert decode_upload(read(setup, first), user_id=USER) == DATA
    assert decode_upload(read(setup, corrected), user_id=USER) == corrected_data


def test_note_revision_history_retains_each_original_after_erase_and_undo(setup):
    versions = [DATA, b'{"strokes":[]}', DATA]
    for revision, data in enumerate(versions, 1):
        item = binding(data, f"ink-revision-{revision}")
        put(setup, item, data)
        value = note(setup, artifact_id=item["artifact"]["artifact_id"])
        value.update(base_revision=revision - 1, revision=revision)
        setup.archive.put_note(USER, value["note_id"], value)
    restarted = OriginalArtifacts(setup.store, authorization_guard=setup.guard)
    for revision, data in enumerate(versions, 1):
        saved = setup.archive.get_note(USER, "note-A", revision)
        assert saved["ink_blob_id"] == f"ink-revision-{revision}"
        upload = restarted.read(USER, binding()["source"], saved["ink_blob_id"])
        assert decode_upload(upload, user_id=USER) == data


@pytest.mark.parametrize("change", ["bytes", "source", "version", "kind", "media"])
def test_reusing_an_id_with_changed_valid_binding_conflicts_without_replacement(setup, change):
    add_version(setup)
    initial = binding()
    put(setup, initial)
    changed, data = deepcopy(initial), DATA
    if change == "bytes":
        data = DATA + b" "
        changed = binding(data)
    elif change == "source":
        changed["source"]["source_id"] = SOURCE_B
    elif change == "version":
        changed["source"]["source_version"] = 2
    else:
        # Both the old and new requests remain contract-valid.
        if change == "media":
            initial = binding(kind="screen_image", media_type="image/png", artifact_id="image")
            put(setup, initial)
            changed = deepcopy(initial)
        changed.update(kind="screen_image")
        changed["artifact"]["media_type"] = "image/jpeg"
    before = state(setup)
    fails(409, lambda: put(setup, changed, data))
    assert state(setup) == before
    assert decode_upload(read(setup, initial), user_id=USER) == DATA


@pytest.mark.parametrize("change", ["kind", "media", "hash", "length", "empty", "oversize",
                                   "boolean_length", "mutable", "foreign_user", "extra"])
def test_invalid_bytes_or_contract_cannot_commit(setup, change):
    item, data = binding(), DATA
    if change == "kind":
        item["kind"] = "native_strokes"
    elif change == "media":
        item["artifact"]["media_type"] = "image/svg+xml"
    elif change == "hash":
        item["artifact"]["sha256"] = "0" * 64
    elif change in {"length", "empty", "oversize", "boolean_length"}:
        item["artifact"]["byte_length"] = {
            "length": len(DATA) + 1, "empty": 0,
            "oversize": MAX_ARTIFACT_BYTES + 1, "boolean_length": True}[change]
    elif change == "mutable":
        data = bytearray(DATA)
    elif change == "foreign_user":
        item["source"]["user_id"] = "another-user"
    else:
        item["artifact"]["trusted"] = True
    before = state(setup)
    fails(422, lambda: put(setup, item, data))
    assert state(setup) == before


@pytest.mark.parametrize("operation", ["put", "read"])
@pytest.mark.parametrize("condition,status", [
    ("unknown_source", 404), ("unknown_version", 404), ("registered_only", 404),
    ("revoked", 403), ("authorization_disabled", 403), ("authorization_changed", 403),
])
def test_current_auth_and_exact_source_version_are_required_even_on_replay(setup, operation, condition, status):
    item = binding()
    put(setup, item)
    if condition == "unknown_source":
        item["source"]["source_id"] = "absent"
    elif condition == "unknown_version":
        item["source"]["source_version"] = 999
    elif condition == "registered_only":
        registered, _ = setup.archive.register(USER, "https://example.invalid/pending", None, "pending")
        item["source"]["source_id"] = registered["source_id"]
    elif condition == "revoked":
        setup.archive.revoke_source(USER, SOURCE_A)
    else:
        setup.archive.set_authorization(USER, enabled=condition != "authorization_disabled")
    before = state(setup)
    fails(status, lambda: put(setup, item) if operation == "put" else read(setup, item))
    assert state(setup) == before


def test_knowing_id_does_not_allow_reading_another_source_or_actor(setup):
    put(setup)
    other = binding(source_id=SOURCE_B)
    fails(409, lambda: read(setup, other))
    add_version(setup)
    fails(409, lambda: read(setup, binding(version=2)))
    setup.archive.set_authorization("another-user")
    other["source"]["user_id"] = "another-user"
    fails(404, lambda: read(setup, other, user_id="another-user"))


@pytest.mark.parametrize("missing_guard", [None, False, "guard"])
def test_construction_requires_callable_authorization_guard(setup, missing_guard):
    with pytest.raises((TypeError, ValueError)):
        OriginalArtifacts(setup.store, authorization_guard=missing_guard)


@pytest.mark.parametrize("reference_kind", ["legacy_bytes", "frame", "note", "capture_ref", "capture_record"])
def test_first_upload_cannot_claim_legacy_or_dangling_artifact_id(setup, reference_kind):
    item = binding()
    artifact_id = item["artifact"]["artifact_id"]
    if reference_kind in {"legacy_bytes", "note"}:
        setup.archive.import_ink(USER, artifact_id, DATA)
        if reference_kind == "note":
            value = note(setup)
            setup.archive.put_note(USER, value["note_id"], value)
            with setup.store.transaction(USER) as tx:
                tx.delete("artifact", artifact_id)
    elif reference_kind == "frame":
        artifact_id = setup.bundles[SOURCE_A]["frame"]["artifact_id"]
        item["artifact"]["artifact_id"] = artifact_id
        with setup.store.transaction(USER) as tx:
            tx.delete("artifact", artifact_id)
    else:
        with setup.store.transaction(USER) as tx:
            if reference_kind == "capture_ref":
                tx.put("capture_artifact_ref", artifact_id, item["artifact"])
            else:
                tx.put("capture_record", "pending-record", {"canonical_json": json.dumps({
                    "record": {"record_id": "pending-record", "source": item["source"],
                               "artifacts": [item["artifact"]]}}), "received_at": "2026-09-29T00:00:00Z"})
    before = state(setup)
    fails(409, lambda: put(setup, item))
    assert state(setup) == before


@pytest.mark.parametrize("change", ["base64", "noncanonical", "hash", "media", "length", "kind", "source", "user", "id"])
def test_corrupt_storage_never_returns_original_bytes_or_replay_success(setup, change):
    put(setup)
    # Explicit fault injection bypasses storage immutability, like disk/row damage.
    row = setup.store._documents[USER][("artifact", "original-ink")]
    if change == "base64":
        row["data_base64"] = "invalid-base64"
    elif change == "noncanonical":
        row["data_base64"] += "\n"
    elif change == "hash":
        row["content_hash"] = "0" * 64
    elif change == "media":
        row["media_type"] = "image/png"
    elif change == "length":
        row["byte_length"] = len(DATA) + 1
    elif change == "kind":
        row["kind"] = "frame"
    elif change == "source":
        row["original_binding"]["source"]["source_version"] = True
    elif change == "user":
        row["user_id"] = "someone-else"
    else:
        row["id"] = "different-id"
    fails(503, lambda: read(setup))
    fails(503, lambda: put(setup))


@pytest.mark.parametrize("provenance", ["other_source", "other_version", "no_provenance", "mixed_sources"])
def test_note_cannot_attach_typed_ink_to_a_different_or_missing_source(setup, provenance):
    add_version(setup)
    put(setup)
    value = note(setup, SOURCE_B if provenance == "other_source" else SOURCE_A)
    if provenance == "other_version":
        value["source_event_ids"] = ["event-A-v2"]
        value["context_segments"][0].update(source_version=2, frame_id="frame-A-v2",
                                           source_event_ids=["event-A-v2"])
    elif provenance == "no_provenance":
        value.update(source_event_ids=[], context_segments=[])
    elif provenance == "mixed_sources":
        value["source_event_ids"].append(setup.bundles[SOURCE_B]["event"]["event_id"])
    before = state(setup)
    # v0.1 already rejects empty provenance; other cases exercise typed binding.
    fails(422 if provenance == "no_provenance" else 409,
          lambda: setup.archive.put_note(USER, value["note_id"], value))
    assert state(setup) == before


@pytest.mark.parametrize("replay_key", [None, "saved-note"])
def test_matching_note_and_replay_validate_current_typed_original(setup, replay_key):
    put(setup)
    value = note(setup)
    setup.archive.put_note(USER, value["note_id"], value, idempotency_key=replay_key)
    receipt = setup.archive.put_note(USER, value["note_id"], value, idempotency_key=replay_key,
                                     return_receipt=True)
    assert receipt["replayed"] and receipt["note"] == value
    setup.store._documents[USER][("artifact", "original-ink")]["data_base64"] = "broken"
    fails(503, lambda: setup.archive.put_note(USER, value["note_id"], value,
                                            idempotency_key=replay_key))
    fails(503, lambda: setup.archive.get_note(USER, value["note_id"]))


def test_legacy_note_metadata_read_and_cached_replay_keep_existing_semantics(setup):
    setup.archive.import_ink(USER, "legacy-ink", DATA)
    value = note(setup, artifact_id="legacy-ink")
    setup.archive.put_note(USER, value["note_id"], value, idempotency_key="legacy-note")
    with setup.store.transaction(USER) as tx:
        tx.delete("artifact", "legacy-ink")
    assert setup.archive.get_note(USER, value["note_id"]) == value
    assert setup.archive.put_note(USER, value["note_id"], value, idempotency_key="legacy-note") == value
    fails(404, lambda: setup.archive.put_note(USER, value["note_id"], value))


def test_source_delete_erases_pending_originals_preserves_other_source_and_fences_legacy_ingress(setup):
    pending_ink = binding()
    pending_image = binding(artifact_id="pending-image", kind="screen_image", media_type="image/png")
    independent = binding(artifact_id="independent-ink", source_id=SOURCE_B)
    for item in (pending_ink, pending_image, independent):
        put(setup, item)
    setup.archive.import_ink(USER, "independent-legacy", DATA)
    setup.archive.delete_source(USER, SOURCE_A)
    after = state(setup)
    setup.archive.delete_source(USER, SOURCE_A)
    assert state(setup) == after
    assert decode_upload(read(setup, independent), user_id=USER) == DATA
    for item in (pending_ink, pending_image):
        artifact_id = item["artifact"]["artifact_id"]
        assert ("artifact", artifact_id) not in after
        assert after[("original_artifact_tombstone", artifact_id)] == {"artifact_id": artifact_id}
        fails(404, lambda: read(setup, item))
        fails(404, lambda: put(setup, item))
        rebound = deepcopy(item)
        rebound["source"]["source_id"] = SOURCE_B
        fails(404, lambda: put(setup, rebound))
        fails(404, lambda: setup.archive.import_ink(USER, artifact_id, DATA))
    assert ("artifact", "independent-legacy") in after


@pytest.mark.parametrize("operation", ["put", "delete"])
def test_failed_transaction_cannot_publish_a_receipt_or_lose_originals(setup, monkeypatch, operation):
    if operation == "delete":
        put(setup)
    before = state(setup)
    real_transaction = setup.store.transaction

    @contextmanager
    def fail_commit(user_id):
        with real_transaction(user_id) as tx:
            yield tx
            raise RuntimeError("injected transaction failure")

    with monkeypatch.context() as patch:
        patch.setattr(setup.store, "transaction", fail_commit)
        with pytest.raises(RuntimeError, match="injected transaction failure"):
            if operation == "put":
                put(setup)
            else:
                setup.archive.delete_source(USER, SOURCE_A)
    assert state(setup) == before
    receipt = put(setup)
    validate_receipt(binding(), receipt)
    assert decode_upload(read(setup), user_id=USER) == DATA
