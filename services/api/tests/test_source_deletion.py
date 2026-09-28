"""Deletion must not erase another source's independent original note history."""

import base64
from contextlib import contextmanager
from copy import deepcopy
import json
from pathlib import Path

import pytest

from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.storage import MemoryStore


EXAMPLES = Path(__file__).resolve().parents[3] / "packages/contracts/examples"
USER = "fixture-user"
SOURCE_A = "linear-algebra"
SOURCE_B = "source-B"
KINDS = ("authorization", "source", "snapshot", "frame", "artifact", "event",
         "event_sequence", "event_tombstone", "note", "note_revision",
         "note_tombstone", "derived", "source_url", "registration_key", "http_replay")


@pytest.fixture
def setup():
    sample = json.loads((EXAMPLES / "core.json").read_text())
    store = MemoryStore()
    archive = Archive(store)
    archive.set_authorization(USER)
    bundles = {}
    for source_id, suffix, sequence in ((SOURCE_A, "A", 1), (SOURCE_B, "B", 2)):
        snapshot = {**sample["SourceSnapshot"], "source_id": source_id,
                    "original_url": f"https://example.invalid/{suffix}",
                    "canonical_url": f"https://example.invalid/{suffix}"}
        frame = {**sample["Frame"], "source_id": source_id, "frame_id": f"frame-{suffix}",
                 "artifact_id": f"frame-artifact-{suffix}"}
        event = {**sample["Observation"], "source_id": source_id, "frame_id": frame["frame_id"],
                 "event_id": f"event-{suffix}", "device_sequence": sequence}
        batch = {"contract_version": "0.1.0", "events": [event]}
        archive.import_fixture(USER, snapshot, frame, (EXAMPLES / "frame.svg").read_bytes())
        ack = archive.events(USER, batch, idempotency_key=f"events-{suffix}")
        note = deepcopy(sample["NoteRevision"])
        note.update(note_id=f"note-{suffix}", source_event_ids=[event["event_id"]])
        note["context_segments"] = [{**note["context_segments"][0], "source_id": source_id,
                                     "frame_id": frame["frame_id"],
                                     "source_event_ids": [event["event_id"]]}]
        bundles[source_id] = {"snapshot": snapshot, "frame": frame, "event": event,
                              "batch": batch, "ack": ack, "note": note, "suffix": suffix}
    with store.transaction(USER) as tx:
        for source_id, bundle in bundles.items():
            item = {"id": f"derived-{bundle['suffix']}",
                    "source_versions": [{"source_id": source_id, "source_version": 1}],
                    "text": "Rebuildable source explanation"}
            tx.put("derived", item["id"], item)
    return archive, store, bundles


def state(store):
    with store.transaction(USER) as tx:
        return {kind: tx.scan(kind) for kind in KINDS}


def handwritten(archive, bundle, ink_id):
    archive.import_ink(USER, ink_id, f"irreplaceable-strokes-{ink_id}".encode())
    note = deepcopy(bundle["note"])
    note.update(kind="handwritten", authorship="user", ink_blob_id=ink_id,
                blocks=[{"id": "mine", "layer": "user_original", "format": "text",
                         "content": f"My original notes on {bundle['suffix']}"}])
    return note


def assert_error(status, code, operation):
    with pytest.raises(DomainError) as error:
        operation()
    assert (error.value.status, error.value.code) == (status, code)


@pytest.mark.parametrize("include_context", [True, False], ids=["context-and-event", "event-only"])
def test_assistant_cross_source_supplement_cannot_erase_independent_original(setup, include_context):
    archive, store, bundles = setup
    original = handwritten(archive, bundles[SOURCE_B], "ink-B")
    note_id = original["note_id"]
    archive.put_note(USER, note_id, original, idempotency_key="original")
    supplement = deepcopy(original)
    supplement.update(base_revision=1, revision=2)
    supplement["source_event_ids"].append(bundles[SOURCE_A]["event"]["event_id"])
    if include_context:
        supplement["context_segments"].extend(bundles[SOURCE_A]["note"]["context_segments"])
    supplement["blocks"].append({"id": "extra", "layer": "ai_supplement", "format": "text",
                                 "content": "A related explanation from source A"})
    archive.put_note(USER, note_id, supplement, actor="assistant", idempotency_key="supplement")
    before = state(store)

    for _ in range(2):
        assert_error(409, "mixed_source_note_conflict", lambda: archive.delete_source(USER, SOURCE_A))
        assert state(store) == before
    assert archive.get_source(USER, SOURCE_A)["source_id"] == SOURCE_A
    assert archive.get_source(USER, SOURCE_B)["source_id"] == SOURCE_B
    assert archive.get_note(USER, note_id, 1) == original
    assert archive.get_note(USER, note_id) == supplement
    with store.transaction(USER) as tx:
        assert base64.b64decode(tx.get("artifact", "ink-B")["data_base64"]) == b"irreplaceable-strokes-ink-B"
        assert tx.get("note_tombstone", note_id) is None
    for revision, actor, replay_key in ((original, "user", "original"),
                                        (supplement, "assistant", "supplement")):
        replay = archive.put_note(USER, note_id, revision, actor=actor,
                                  idempotency_key=replay_key, return_receipt=True)
        assert replay["replayed"] and replay["note"] == revision
    assert archive.events(USER, bundles[SOURCE_A]["batch"], idempotency_key="events-A") == bundles[SOURCE_A]["ack"]


@pytest.mark.parametrize("source_id", [SOURCE_A, SOURCE_B])
def test_cross_source_dependency_in_old_revision_also_blocks_deletion(setup, source_id):
    archive, store, bundles = setup
    original = handwritten(archive, bundles[SOURCE_B], "original-ink-B")
    archive.put_note(USER, original["note_id"], original, idempotency_key="old-B")
    # A user may explicitly change all context in a new revision; history still
    # belongs to B even though no individual revision has mixed source references.
    replacement = handwritten(archive, bundles[SOURCE_A], "new-ink-A")
    replacement.update(note_id=original["note_id"], base_revision=1, revision=2)
    archive.put_note(USER, original["note_id"], replacement, idempotency_key="new-A")
    before = state(store)

    assert_error(409, "mixed_source_note_conflict", lambda: archive.delete_source(USER, source_id))
    assert state(store) == before
    assert archive.get_note(USER, original["note_id"], 1) == original
    assert archive.get_note(USER, original["note_id"], 2) == replacement


def test_single_source_delete_erases_history_and_replays_but_preserves_other_notes(setup):
    archive, store, bundles = setup
    original = handwritten(archive, bundles[SOURCE_A], "ink-A")
    other = handwritten(archive, bundles[SOURCE_B], "shared-ink")
    archive.put_note(USER, original["note_id"], original, idempotency_key="A-original")
    archive.put_note(USER, other["note_id"], other, idempotency_key="B-original")
    current = {**original, "base_revision": 1, "revision": 2, "ink_blob_id": "shared-ink"}
    archive.put_note(USER, original["note_id"], current, idempotency_key="A-current")

    archive.delete_source(USER, SOURCE_A)
    after = state(store)
    archive.delete_source(USER, SOURCE_A)
    assert state(store) == after
    assert archive.get_note(USER, other["note_id"]) == other
    with store.transaction(USER) as tx:
        assert tx.get("source", SOURCE_A)["deleted"] is True
        assert tx.get("note_revision", key(original["note_id"], 1)) is None
        assert tx.get("note_revision", key(original["note_id"], 2)) is None
        assert tx.get("artifact", "ink-A") is None
        assert tx.get("artifact", "frame-artifact-A") is None
        assert tx.get("artifact", "frame-artifact-B") is not None
        assert base64.b64decode(tx.get("artifact", "shared-ink")["data_base64"]) == b"irreplaceable-strokes-shared-ink"
        assert tx.get("derived", "derived-A") is None
        assert tx.get("derived", "derived-B") is not None
        deleted_replays = [r for r in tx.scan("http_replay") if r.get("deleted")]
        assert len(deleted_replays) == 3
        assert all("response" not in r for r in deleted_replays)
    assert_error(404, "source_not_found", lambda: archive.get_snapshot(USER, SOURCE_A, 1))
    for revision, replay_key in ((original, "A-original"), (current, "A-current")):
        assert_error(404, "reference_not_found",
                     lambda: archive.get_note(USER, original["note_id"], revision["revision"]))
        assert_error(410, "note_deleted", lambda: archive.put_note(
            USER, original["note_id"], revision, idempotency_key=replay_key))
    assert_error(410, "request_deleted", lambda: archive.events(
        USER, bundles[SOURCE_A]["batch"], idempotency_key="events-A"))
    assert_error(409, "event_deleted", lambda: archive.events(USER, bundles[SOURCE_A]["batch"]))
    assert archive.events(USER, bundles[SOURCE_B]["batch"], idempotency_key="events-B") == bundles[SOURCE_B]["ack"]
    replay = archive.put_note(USER, other["note_id"], other, idempotency_key="B-original", return_receipt=True)
    assert replay["replayed"] and replay["note"] == other


def test_failed_source_delete_rolls_back_originals_tombstones_and_replay_scrubbing(setup, monkeypatch):
    archive, store, bundles = setup
    original = handwritten(archive, bundles[SOURCE_A], "ink-A")
    archive.put_note(USER, original["note_id"], original, idempotency_key="original")
    before = state(store)
    real_transaction = store.transaction

    @contextmanager
    def failing_transaction(user_id):
        with real_transaction(user_id) as tx:
            real_delete = tx.delete

            def fail_after_artifact_delete(kind, record_key):
                real_delete(kind, record_key)
                if kind == "artifact":
                    raise RuntimeError("injected deletion failure")

            tx.delete = fail_after_artifact_delete
            yield tx

    with monkeypatch.context() as patch:
        patch.setattr(store, "transaction", failing_transaction)
        with pytest.raises(RuntimeError, match="injected deletion failure"):
            archive.delete_source(USER, SOURCE_A)
    assert state(store) == before
    assert archive.get_note(USER, original["note_id"]) == original
    assert archive.events(USER, bundles[SOURCE_A]["batch"], idempotency_key="events-A") == bundles[SOURCE_A]["ack"]
    archive.delete_source(USER, SOURCE_A)
    assert_error(404, "source_not_found", lambda: archive.get_source(USER, SOURCE_A))
