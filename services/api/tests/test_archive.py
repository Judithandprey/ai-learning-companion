import base64
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import pytest

from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.storage import MemoryStore


ROOT = Path(__file__).resolve().parents[3]
EXAMPLES = ROOT / "packages/contracts/examples"
USER = "fixture-user"


@pytest.fixture
def setup():
    sample = json.loads((EXAMPLES / "core.json").read_text())
    store = MemoryStore()
    archive = Archive(store, clock=lambda: datetime(2026, 9, 28, tzinfo=timezone.utc))
    archive.set_authorization(USER)
    archive.import_fixture(USER, sample["SourceSnapshot"], sample["Frame"], (EXAMPLES / "frame.svg").read_bytes())
    return archive, store, sample


def fails(code, fn):
    with pytest.raises(DomainError) as error:
        fn()
    assert error.value.code == code


def test_registration_is_not_content_and_query_parameters_distinct(setup):
    archive, _, _ = setup
    a, created = archive.register(USER, "https://example.invalid/video?v=1", None, "key-1")
    assert created and a["access_status"] == "registered" and a["current_version"] is None
    b, created = archive.register(USER, "https://example.invalid/video?v=1", None, "key-2")
    assert not created and b == a
    c, _ = archive.register(USER, "https://example.invalid/video?v=2", None, "key-3")
    assert c["source_id"] != a["source_id"]
    fails("idempotency_conflict", lambda: archive.register(USER, "https://example.invalid/changed", None, "key-1"))
    fails("reference_not_found", lambda: archive.get_snapshot(USER, a["source_id"], 1))


@pytest.mark.parametrize("url", ["file:///etc/passwd", "https://secret:password@example.invalid", "https://", "http://["])
def test_invalid_registration_urls(setup, url):
    archive, _, _ = setup
    fails("invalid_url", lambda: archive.register(USER, url, None, "key"))


def test_snapshot_hash_immutability_and_old_versions(setup):
    archive, _, sample = setup
    old = sample["SourceSnapshot"]
    frame = sample["Frame"]
    bad = deepcopy(old)
    bad["text"] += "changed"
    fails("hash_mismatch", lambda: archive.import_fixture(USER, bad, frame, (EXAMPLES / "frame.svg").read_bytes()))
    bad["content_hash"] = hashlib.sha256(bad["text"].encode()).hexdigest()
    fails("immutable_conflict", lambda: archive.import_fixture(USER, bad, frame, (EXAMPLES / "frame.svg").read_bytes()))
    new_frame = {**frame, "source_version": 2, "frame_id": "frame-v2"}
    new = {**bad, "source_version": 2}
    archive.import_fixture(USER, new, new_frame, (EXAMPLES / "frame.svg").read_bytes())
    assert archive.get_source(USER, old["source_id"])["current_version"] == 2
    assert archive.get_snapshot(USER, old["source_id"], 1) == old
    assert archive.get_snapshot(USER, old["source_id"], 2) == new


def test_identity_and_all_related_records_isolated(setup):
    archive, _, sample = setup
    archive.set_authorization("other-user")
    fails("source_not_found", lambda: archive.get_snapshot("other-user", "linear-algebra", 1))
    fails("identity_mismatch", lambda: archive.events("other-user", sample["EventBatch"]))
    fails("reference_not_found", lambda: archive.register("other-user", "https://example.invalid", "robotics", "key"))
    bad = deepcopy(sample["EventBatch"])
    bad["events"][0]["device_id"] = "not-enrolled"
    fails("reference_not_found", lambda: archive.events(USER, bad))


def test_event_exact_replay_and_sequence_order_independent(setup):
    archive, store, sample = setup
    first = sample["EventBatch"]
    assert archive.events(USER, first)["acknowledged"][0]["status"] == "accepted"
    replay = deepcopy(first)
    replay["events"][0]["received_at"] = "2030-01-01T00:00:00Z"
    assert archive.events(USER, replay)["acknowledged"][0]["status"] == "duplicate"
    with store.transaction(USER) as tx:
        assert tx.get("event", "event-1")["received_at"] == "2026-09-28T00:00:00Z"
    events = [{**first["events"][0], "event_id": f"event-{i}", "device_sequence": i} for i in (8, 2, 5)]
    result = archive.events(USER, {"contract_version": "0.1.0", "events": events})
    assert [r["device_sequence"] for r in result["acknowledged"]] == [8, 2, 5]


def test_mixed_batch_rolls_back_whole_and_content_conflict(setup):
    archive, store, sample = setup
    first = sample["EventBatch"]
    archive.events(USER, first)
    valid = {**first["events"][0], "event_id": "second", "device_sequence": 2}
    reused = {**valid, "event_id": "third", "device_sequence": 1}
    fails("sequence_conflict", lambda: archive.events(USER, {"contract_version": "0.1.0", "events": [valid, reused]}))
    with store.transaction(USER) as tx:
        assert tx.get("event", "second") is None
    fails("event_conflict", lambda: archive.events(USER, {"contract_version": "0.1.0", "events": [{**first["events"][0], "text": "changed"}]}))


def test_frame_provenance_and_correction_preserve_original(setup):
    archive, store, sample = setup
    event = sample["EventBatch"]["events"][0]
    invalid = {**event, "media_position": 500}
    fails("event_frame_mismatch", lambda: archive.events(USER, {"contract_version": "0.1.0", "events": [invalid]}))
    archive.events(USER, sample["EventBatch"])
    correction = {**event, "event_id": "correction", "device_sequence": 2, "correction_of": event["event_id"], "text": "I understand now."}
    archive.events(USER, {"contract_version": "0.1.0", "events": [correction]})
    with store.transaction(USER) as tx:
        assert tx.get("event", "event-1")["text"] == event["text"]
        assert tx.get("event", "correction")["correction_of"] == "event-1"
        assert tx.get("session", "session-1")["live_capture"] is False


def test_note_cas_history_and_retry(setup):
    archive, _, sample = setup
    archive.events(USER, sample["EventBatch"])
    note = sample["NoteRevision"]
    assert archive.put_note(USER, note["note_id"], note, actor="assistant") == note
    assert archive.put_note(USER, note["note_id"], note, actor="assistant") == note
    update = {**note, "base_revision": 1, "revision": 2, "title": "A new title"}
    archive.put_note(USER, note["note_id"], update)
    assert archive.get_note(USER, note["note_id"], 1) == note
    assert archive.get_note(USER, note["note_id"]) == update
    fails("note_revision_conflict", lambda: archive.put_note(USER, note["note_id"], {**update, "title": "lost write"}))


def test_concurrent_note_updates_one_wins(setup):
    archive, _, sample = setup
    archive.events(USER, sample["EventBatch"])
    note = sample["NoteRevision"]
    archive.put_note(USER, note["note_id"], note)
    def update(i):
        try:
            archive.put_note(USER, note["note_id"], {**note, "base_revision": 1, "revision": 2, "title": str(i)})
            return "saved"
        except DomainError as error:
            return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(update, (1, 2))) == ["note_revision_conflict", "saved"]


def test_original_ink_protected_from_assistant_and_user_revisions_preserved(setup):
    archive, store, sample = setup
    archive.events(USER, sample["EventBatch"])
    ink = b"original-pencil-strokes"
    archive.import_ink(USER, "ink-1", ink)
    note = {**sample["NoteRevision"], "kind": "handwritten", "authorship": "user", "ink_blob_id": "ink-1",
            "blocks": [{"id": "mine", "layer": "user_original", "format": "text", "content": "My derivation"}]}
    archive.put_note(USER, note["note_id"], note)
    supplemented = deepcopy(note)
    supplemented.update(base_revision=1, revision=2)
    supplemented["blocks"].append({"id": "ai", "layer": "ai_supplement", "format": "text", "content": "Recall the original basis."})
    archive.put_note(USER, note["note_id"], supplemented, actor="assistant")
    overwrite = deepcopy(supplemented)
    overwrite.update(base_revision=2, revision=3)
    overwrite["blocks"][0]["content"] = "AI replaced handwriting"
    fails("original_protected", lambda: archive.put_note(USER, note["note_id"], overwrite, actor="assistant"))
    archive.put_note(USER, note["note_id"], overwrite, actor="user")
    assert archive.get_note(USER, note["note_id"], 1) == note
    with store.transaction(USER) as tx:
        assert base64.b64decode(tx.get("artifact", "ink-1")["data_base64"]) == ink


def test_invalid_note_references_never_persist(setup):
    archive, store, sample = setup
    archive.events(USER, sample["EventBatch"])
    note = deepcopy(sample["NoteRevision"])
    note["context_segments"][0]["media_position"] = 111
    fails("note_frame_mismatch", lambda: archive.put_note(USER, note["note_id"], note))
    with store.transaction(USER) as tx:
        assert tx.scan("note") == []


def test_deletion_erases_linked_originals_and_cannot_reimport_same_ids(setup):
    archive, store, sample = setup
    archive.events(USER, sample["EventBatch"])
    note = sample["NoteRevision"]
    archive.put_note(USER, note["note_id"], note)
    archive.delete_source(USER, "linear-algebra")
    archive.delete_source(USER, "linear-algebra")
    with store.transaction(USER) as tx:
        for kind in ("snapshot", "frame", "event", "note_revision", "artifact"):
            assert tx.scan(kind) == []
        assert tx.get("source", "linear-algebra")["deleted"]
        assert tx.get("note_tombstone", note["note_id"])
    fails("source_not_found", lambda: archive.import_fixture(USER, sample["SourceSnapshot"], sample["Frame"], (EXAMPLES / "frame.svg").read_bytes()))
    fails("event_deleted", lambda: archive.events(USER, sample["EventBatch"]))
    fails("note_deleted", lambda: archive.put_note(USER, note["note_id"], note))


def test_revoke_and_transaction_guard_fail_closed(setup):
    archive, store, _ = setup
    stale = Archive(store, authorization_guard=lambda state: (_ for _ in ()).throw(DomainError(403, "generation_changed")))
    fails("generation_changed", lambda: stale.get_source(USER, "linear-algebra"))
    archive.revoke_source(USER, "linear-algebra")
    fails("source_revoked", lambda: archive.get_snapshot(USER, "linear-algebra", 1))
    archive.set_authorization(USER, False)
    fails("authorization_revoked", lambda: archive.register(USER, "https://example.invalid", None, "key"))


def test_composite_keys_do_not_alias():
    assert key("a:b", "c") != key("a", "b:c")


def test_http_replay_is_original_result_and_lifecycle_fenced(setup):
    archive, store, sample = setup
    registration, _ = archive.register(USER, "https://example.invalid/new", None, "same", return_receipt=True)
    sid = registration["source"]["source_id"]
    with store.transaction(USER) as tx:
        head = tx.get("source", sid)
        head["access_status"] = "temporarily_unavailable"
        tx.put("source", sid, head)
    replay, created = archive.register(USER, "https://example.invalid/new", None, "same", return_receipt=True)
    assert not created and replay == registration
    first_ack = archive.events(USER, sample["EventBatch"], idempotency_key="batch-1")
    retry = deepcopy(sample["EventBatch"])
    retry["events"][0]["received_at"] = "2030-01-01T00:00:00Z"
    assert archive.events(USER, retry, idempotency_key="batch-1") == first_ack
    assert archive.events(USER, retry, idempotency_key="batch-2")["acknowledged"][0]["status"] == "duplicate"
    note = sample["NoteRevision"]
    first = archive.put_note(USER, note["note_id"], note, idempotency_key="note-1", return_receipt=True)
    archive.put_note(USER, note["note_id"], {**note, "base_revision": 1, "revision": 2, "title": "new"}, idempotency_key="note-2")
    replay = archive.put_note(USER, note["note_id"], note, idempotency_key="note-1", return_receipt=True)
    assert not first["replayed"] and replay["replayed"] and replay["note"] == note
    assert archive.get_note(USER, note["note_id"])["revision"] == 2
    archive.delete_source(USER, sample["SourceSnapshot"]["source_id"])
    fails("request_deleted", lambda: archive.events(USER, sample["EventBatch"], idempotency_key="batch-1"))
    fails("note_deleted", lambda: archive.put_note(USER, note["note_id"], note, idempotency_key="note-1"))
    with store.transaction(USER) as tx:
        assert all("response" not in r for r in tx.scan("http_replay") if r.get("deleted"))
    archive.delete_source(USER, sid)
    fails("request_deleted", lambda: archive.register(USER, "https://example.invalid/new", None, "same"))


def test_http_key_cannot_suppress_mutated_batch_or_note(setup):
    archive, _, sample = setup
    archive.events(USER, sample["EventBatch"], idempotency_key="key")
    mutated = deepcopy(sample["EventBatch"])
    mutated["events"][0]["text"] = "mutated"
    fails("idempotency_conflict", lambda: archive.events(USER, mutated, idempotency_key="key"))
    note = sample["NoteRevision"]
    archive.put_note(USER, note["note_id"], note, idempotency_key="key")
    fails("idempotency_conflict", lambda: archive.put_note(USER, note["note_id"], {**note, "title": "mutated"}, idempotency_key="key"))


def test_source_wire_result_validates_owner_contract(setup):
    from packages.contracts import validate
    archive, _, _ = setup
    result = archive.read_source(USER, "linear-algebra")
    validate("SourceReadResult", result)
    assert result["snapshot_versions"] == [1]
    result, _ = archive.register(USER, "https://example.invalid", None, "registered", return_receipt=True)
    validate("SourceRegistrationResult", result)


def test_erased_event_id_cannot_be_reassigned_to_another_source(setup):
    archive, _, sample = setup
    archive.events(USER, sample["EventBatch"])
    source = {**sample["SourceSnapshot"], "source_id": "source-two"}
    frame = {**sample["Frame"], "source_id": "source-two", "frame_id": "frame-two"}
    archive.import_fixture(USER, source, frame, (EXAMPLES / "frame.svg").read_bytes())
    archive.delete_source(USER, "linear-algebra")
    event = {**sample["Observation"], "source_id": "source-two", "frame_id": "frame-two", "device_sequence": 9}
    fails("event_deleted", lambda: archive.events(USER, {"contract_version": "0.1.0", "events": [event]}))


def test_note_get_rechecks_extra_evidence_sources(setup):
    archive, _, sample = setup
    archive.events(USER, sample["EventBatch"])
    source = {**sample["SourceSnapshot"], "source_id": "discussion-source"}
    frame = {**sample["Frame"], "source_id": "discussion-source", "frame_id": "discussion-frame"}
    archive.import_fixture(USER, source, frame, (EXAMPLES / "frame.svg").read_bytes())
    event = {**sample["Observation"], "source_id": "discussion-source", "frame_id": "discussion-frame",
             "event_id": "discussion-event", "device_sequence": 2}
    archive.events(USER, {"contract_version": "0.1.0", "events": [event]})
    note = deepcopy(sample["NoteRevision"])
    note["source_event_ids"].append("discussion-event")
    archive.put_note(USER, note["note_id"], note)
    archive.revoke_source(USER, "discussion-source")
    fails("source_revoked", lambda: archive.get_note(USER, note["note_id"]))
