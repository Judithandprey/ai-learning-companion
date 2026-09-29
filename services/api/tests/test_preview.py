"""Same-archive originals, atomic save, replay and lifecycle boundaries."""

import base64
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from types import SimpleNamespace

import pytest

from packages.contracts.document_preview import CONTRACT_VERSION, validate
from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.preview import DocumentPreview
from services.api.storage import MemoryStore, _MemoryTransaction

USER = "document-user"
DEVICE, SESSION = "preview-device", "preview-session"
NOW = "2026-09-28T00:00:00Z"
ORIGINAL = '\ufeff第一节\r\n<p>Vectors & λ</p>\nTrailing spaces  \n'.encode("utf-8")


def encoded(raw):
    return base64.b64encode(raw).decode()


def import_body(raw=ORIGINAL, *, version=1, source_id="course-notes"):
    return {"contract_version": CONTRACT_VERSION, "source_id": source_id, "source_version": version,
            "filename": "课程原文.txt", "content_base64": encoded(raw), "sha256": hashlib.sha256(raw).hexdigest(),
            "device_id": DEVICE, "session_id": SESSION, "source_timezone": "America/Los_Angeles", "project_id": None}


def save_body(*, note_id="saved-note", source_id="course-notes", version=1):
    dom = {"kind": "dom_snapshot/v1", "captured_at": NOW,
           "page": {"origin": "http://127.0.0.1:8765", "path": "/preview", "query_omitted": False},
           "document_version": str(version), "viewport": {"width": 900, "height": 600, "device_pixel_ratio": 1},
           "scroll": {"x": 0, "y": 30}, "selection": {"text": "Vectors & λ", "rect": {
               "x": 90, "y": 120, "width": 270, "height": 120}},
           "context_text": "第一节 <p>Vectors & λ</p>", "media": None, "pixels": "not_captured"}
    raw = json.dumps(dom, ensure_ascii=False, indent=2).encode()
    frame = {"user_id": USER, "source_id": source_id, "source_version": version, "frame_id": f"frame-{note_id}",
             "session_id": SESSION, "device_id": DEVICE, "captured_at": NOW, "source_timezone": "America/Los_Angeles",
             "media_position": None, "width": 900, "height": 600, "artifact_id": f"artifact-{note_id}",
             "content_hash": hashlib.sha256(raw).hexdigest(), "representation": "dom_snapshot"}
    selection = {k: frame[k] for k in ("user_id", "source_id", "source_version", "frame_id", "session_id", "device_id", "media_position")}
    selection.update(id=f"selection-{note_id}", bbox={"x": .1, "y": .2, "width": .3, "height": .2},
                     selected_text=dom["selection"]["text"], concept_candidates=[], input_mode="explicit_text_ask", created_at=NOW)
    return {"contract_version": CONTRACT_VERSION, "note_id": note_id, "frame": frame,
            "frame_bytes_base64": encoded(raw), "bridge_request": {"contract_version": "0.1.0",
                "request_id": f"bridge-{note_id}", "action": "selection.submit", "selection": selection},
            "request": {"user_id": USER, "request_id": f"request-{note_id}", "selection_id": selection["id"],
                        "project_id": None, "knowledge_profile_version": 1, "mode": "silent"},
            "title": "My original question", "request_text": "Why λ? 我想自己试试。", "user_note": "原想法\r\nNo generated answer."}


@pytest.fixture
def setup():
    store = MemoryStore()
    clock = lambda: datetime(2026, 9, 28, tzinfo=timezone.utc)
    archive = Archive(store, clock=clock)
    archive.set_authorization(USER)
    with store.transaction(USER) as tx:
        tx.put("device", DEVICE, {"user_id": USER, "id": DEVICE})
        tx.put("session", SESSION, {"user_id": USER, "id": SESSION, "live_capture": False})
    # Membership is a trusted bootstrap fact, not inferred from two existing IDs.
    with store.transaction(USER) as tx:
        tx.put("control_membership", key(DEVICE, SESSION), {"user_id": USER, "device_id": DEVICE,
            "session_id": SESSION, "active": True, "revision": 1})
    preview = DocumentPreview(store, lambda state: None, clock, device_id=DEVICE, session_id=SESSION)
    return SimpleNamespace(store=store, archive=archive, preview=preview)


def fail(status, operation, code=None):
    with pytest.raises(DomainError) as caught:
        operation()
    assert caught.value.status == status
    if code:
        assert caught.value.code == code


def seed(setup, body=None):
    return setup.preview.import_document(USER, body or import_body(), "import")


def saved(setup):
    seed(setup)
    return setup.preview.save(USER, save_body(), "save")


def inventory(setup):
    return deepcopy(setup.store._documents)


def test_exact_import_save_read_and_new_service_preserve_one_archive(setup):
    imported = seed(setup)
    assert imported["persistence"] == "server_committed" and not imported["replayed"]
    assert imported["source"]["text"].encode() == ORIGINAL
    assert imported["source"]["provenance"]["origin"] == "user_authorized"
    assert imported["source"]["provenance"]["consent_scope"] == "learning"
    assert USER in imported["source"]["provenance"]["attribution"]
    body = save_body()
    receipt = setup.preview.save(USER, body, "save")
    assert receipt["ai_status"] == "provider_unavailable" and not receipt["replayed"]
    reopened = DocumentPreview(setup.store, lambda state: None, device_id=DEVICE, session_id=SESSION).read(USER, body["note_id"])
    validate("SavedPreview", reopened)
    assert base64.b64decode(reopened["content_base64"]) == ORIGINAL
    assert reopened["frame_bytes_base64"] == body["frame_bytes_base64"]
    for name in ("frame", "bridge_request", "request", "request_text", "user_note"):
        assert reopened[name] == body[name]
    assert reopened["note"] == setup.archive.get_note(USER, body["note_id"])
    assert reopened["source"] == setup.archive.get_snapshot(USER, "course-notes", 1)
    assert reopened["note"]["authorship"] == "user"
    assert {b["layer"] for b in reopened["note"]["blocks"]} == {"user_original"}
    with setup.store.transaction(USER) as tx:
        assert tx.get("session", SESSION)["live_capture"] is False
        assert len(tx.scan("snapshot")) == len(tx.scan("event")) == len(tx.scan("note_revision")) == 1
        assert tx.scan("capture_binding") == tx.scan("capture_record") == tx.scan("capture_artifact_ref") == []


def test_ask_confirmation_and_earlier_frozen_frame_keep_distinct_timestamps(setup):
    seed(setup)
    body = save_body()
    confirmed = "2026-09-28T00:05:00Z"
    body["bridge_request"]["selection"]["created_at"] = confirmed
    setup.preview.save(USER, body, "later-ask")
    result = setup.preview.read(USER, body["note_id"])
    assert result["observation"]["captured_at"] == confirmed
    assert result["frame"]["captured_at"] == NOW


def test_versions_replay_old_original_and_old_save_after_note_head_advances(setup):
    saved(setup)
    old = setup.preview.read(USER, "saved-note")
    seed(setup)  # The same key replays.
    assert setup.preview.import_document(USER, import_body(), "new-import-key")["replayed"]
    second = import_body(b"Revised source\n", version=2)
    setup.preview.import_document(USER, second, "version-2")
    revision = deepcopy(old["note"])
    revision.update(revision=2, base_revision=1, title="Later user revision")
    setup.archive.put_note(USER, "saved-note", revision)
    assert setup.preview.save(USER, save_body(), "new-save-key")["replayed"]
    assert setup.preview.read(USER, "saved-note") == old
    assert setup.archive.get_source(USER, "course-notes")["current_version"] == 2
    assert setup.archive.get_note(USER, "saved-note")["revision"] == 2


@pytest.mark.parametrize("version", [2, 3])
def test_first_import_cannot_skip_versions(setup, version):
    before = inventory(setup)
    fail(409, lambda: seed(setup, import_body(version=version)), "source_version_conflict")
    assert inventory(setup) == before


def test_changed_original_same_version_or_replay_key_is_conflict(setup):
    seed(setup)
    before = inventory(setup)
    for request_key in ("import", "another"):
        fail(409, lambda: setup.preview.import_document(USER, import_body(b"changed"), request_key), "idempotency_conflict")
    fail(409, lambda: setup.preview.import_document(USER, import_body(version=3), "skip"), "source_version_conflict")
    assert inventory(setup) == before


@pytest.mark.parametrize("raw", [b"\xff", b"a\x00b", b"x" * (2 * 1024 * 1024 + 1)])
def test_invalid_document_bytes_fail_before_any_write(setup, raw):
    before = inventory(setup)
    fail(422, lambda: seed(setup, import_body(raw)))
    assert inventory(setup) == before


@pytest.mark.parametrize("change", [
    {"sha256": "0" * 64}, {"source_version": True}, {"filename": "nul\x00file"},
    {"content_base64": "%%%"}, {"filename": "bad\ud800"}, {"provenance": {"origin": "synthetic"}},
])
def test_document_import_rejects_invalid_contracts(setup, change):
    before = inventory(setup)
    fail(422, lambda: seed(setup, {**import_body(), **change}))
    assert inventory(setup) == before


def test_binding_and_membership_rechecked_before_replay_and_reads(setup):
    saved(setup)
    assert setup.preview.session(USER)["membership_revision"] == 1
    with setup.store.transaction(USER) as tx:
        tx.delete("control_membership", key(DEVICE, SESSION))
    before = inventory(setup)
    for operation in (lambda: seed(setup), lambda: setup.preview.save(USER, save_body(), "save"),
                      lambda: setup.preview.read(USER, "saved-note"), lambda: setup.preview.session(USER)):
        fail(403, operation)
    assert inventory(setup) == before


def test_own_device_and_session_are_not_proof_of_their_membership(setup):
    with setup.store.transaction(USER) as tx:
        tx.put("session", "unbound-session", {"user_id": USER, "id": "unbound-session", "live_capture": False})
    preview = DocumentPreview(setup.store, lambda state: None, device_id=DEVICE, session_id="unbound-session")
    fail(403, lambda: preview.import_document(USER, {**import_body(), "session_id": "unbound-session"}, "unbound"))
    fail(403, lambda: seed(setup, {**import_body(), "device_id": "other-device"}))


def test_expired_guard_current_generation_and_cross_user_access(setup):
    saved(setup)
    def expired(state):
        raise DomainError(401, "unauthenticated")
    setup.preview.archive.authorization_guard = expired
    for operation in (lambda: seed(setup), lambda: setup.preview.read(USER, "saved-note"),
                      lambda: setup.preview.save(USER, save_body(), "save")):
        fail(401, operation)
    setup.preview.archive.authorization_guard = lambda state: None
    setup.archive.set_authorization(USER, False)
    fail(403, lambda: setup.preview.read(USER, "saved-note"))
    setup.archive.set_authorization("other-user")
    fail(403, lambda: setup.preview.read("other-user", "saved-note"))


@pytest.mark.parametrize("guard", [None, True, "authenticated"])
def test_guard_is_required(guard):
    with pytest.raises(ValueError):
        DocumentPreview(MemoryStore(), guard, device_id=DEVICE, session_id=SESSION)


def test_changed_save_body_rejected_under_same_and_new_key(setup):
    saved(setup)
    before = inventory(setup)
    for request_key in ("save", "other-key"):
        fail(409, lambda: setup.preview.save(USER, {**save_body(), "user_note": "changed"}, request_key), "idempotency_conflict")
    assert inventory(setup) == before


@pytest.mark.parametrize("field", ["frame", "selection", "request", "bytes", "project", "note_nul"])
def test_mismatched_save_does_not_partially_write(setup, field):
    seed(setup)
    body = save_body()
    if field == "frame":
        body["frame"]["content_hash"] = "0" * 64
    elif field == "selection":
        body["bridge_request"]["selection"]["source_version"] = 2
    elif field == "request":
        body["request"]["selection_id"] = "unrelated"
    elif field == "bytes":
        body["frame_bytes_base64"] = encoded(b"not-json")
        body["frame"]["content_hash"] = hashlib.sha256(b"not-json").hexdigest()
    elif field == "project":
        body["request"]["project_id"] = "another-project"
    else:
        body["user_note"] = "nul\x00"
    before = inventory(setup)
    fail(422, lambda: setup.preview.save(USER, body, "bad"))
    assert inventory(setup) == before


@pytest.mark.parametrize("existing", ["artifact", "capture_artifact_ref", "capture_artifact_tombstone", "frame"])
def test_preview_never_adopts_preexisting_artifacts_frames_or_capture_pins(setup, existing):
    seed(setup)
    body = save_body()
    identity = body["frame"]["frame_id"] if existing == "frame" else body["frame"]["artifact_id"]
    with setup.store.transaction(USER) as tx:
        tx.put(existing, identity, {"id": identity})
    before = inventory(setup)
    fail(409, lambda: setup.preview.save(USER, body, "conflict"), "artifact_conflict")
    assert inventory(setup) == before


def test_all_save_writes_rollback_after_precommit_failure(setup, monkeypatch):
    seed(setup)
    before = inventory(setup)
    original = _MemoryTransaction.put
    def broken(tx, kind, identifier, value):
        original(tx, kind, identifier, value)
        if kind == "http_replay":
            raise RuntimeError("injected precommit failure")
    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", broken)
        with pytest.raises(RuntimeError, match="precommit"):
            setup.preview.save(USER, save_body(), "save")
    assert inventory(setup) == before
    assert not setup.preview.save(USER, save_body(), "save")["replayed"]


def test_concurrent_saves_allocate_durable_device_sequences_and_replay_once(setup):
    seed(setup)
    with ThreadPoolExecutor(max_workers=4) as pool:
        receipts = list(pool.map(lambda n: setup.preview.save(USER, save_body(note_id=f"note-{n // 2}"), f"save-{n}"), range(8)))
    assert sum(not r["replayed"] for r in receipts) == 4
    with setup.store.transaction(USER) as tx:
        assert sorted(r["device_sequence"] for r in tx.scan("event")) == [1, 2, 3, 4]
        assert len(tx.scan("note_revision")) == 4
    setup.archive.delete_source(USER, "course-notes")
    setup.preview.import_document(USER, import_body(source_id="new-source"), "new-import")
    setup.preview.save(USER, save_body(note_id="later", source_id="new-source"), "later")
    assert setup.preview.read(USER, "later")["observation"]["device_sequence"] == 5


@pytest.mark.parametrize("kind", ["snapshot", "preview_import", "frame", "artifact", "event", "note_revision", "event_sequence"])
def test_missing_original_or_metadata_never_returns_cached_success(setup, kind):
    saved(setup)
    view = setup.preview.read(USER, "saved-note")
    identities = {"snapshot": key("course-notes", 1), "preview_import": key("course-notes", 1),
        "frame": view["frame"]["frame_id"], "artifact": view["frame"]["artifact_id"],
        "event": view["observation"]["event_id"], "note_revision": key("saved-note", 1),
        "event_sequence": key(DEVICE, view["observation"]["device_sequence"])}
    with setup.store.transaction(USER) as tx:
        tx.delete(kind, identities[kind])
    fail(503, lambda: setup.preview.read(USER, "saved-note"), "unavailable")
    fail(503, lambda: setup.preview.save(USER, save_body(), "save"), "unavailable")


@pytest.mark.parametrize("kind", ["snapshot", "artifact", "event", "note_revision"])
def test_corrupted_original_fails_closed(setup, kind):
    saved(setup)
    view = setup.preview.read(USER, "saved-note")
    identifiers = {"snapshot": key("course-notes", 1), "artifact": view["frame"]["artifact_id"],
                   "event": view["observation"]["event_id"], "note_revision": key("saved-note", 1)}
    with setup.store.transaction(USER) as tx:
        record = tx.get(kind, identifiers[kind])
        if kind == "artifact":
            record["data_base64"] = encoded(b"corrupted")
        elif kind == "note_revision":
            record["blocks"][0]["content"] = "rewritten original"
        else:
            record["text"] = "rewritten original"
        tx.delete(kind, identifiers[kind])
        tx.put(kind, identifiers[kind], record)
    fail(503, lambda: setup.preview.read(USER, "saved-note"), "unavailable")


def test_source_deletion_erases_preview_content_and_never_resurrects_replays(setup):
    saved(setup)
    setup.archive.delete_source(USER, "course-notes")
    with setup.store.transaction(USER) as tx:
        for kind in ("snapshot", "frame", "artifact", "event", "note", "note_revision", "preview_import", "preview_save"):
            assert tx.scan(kind) == []
        assert tx.scan("event_sequence")
        for replay in tx.scan("http_replay"):
            assert set(replay) == {"key", "deleted", "source_ids"}
            assert replay["deleted"] and replay["source_ids"] == []
    fail(404, lambda: seed(setup))
    fail(404, lambda: setup.preview.save(USER, save_body(), "save"))
    fail(410, lambda: setup.preview.read(USER, "saved-note"))
    fail(404, lambda: setup.preview.import_document(USER, import_body(version=2), "resurrect"))


def test_source_revocation_fences_reads_imports_and_cached_saves(setup):
    saved(setup)
    setup.archive.revoke_source(USER, "course-notes")
    for operation in (lambda: seed(setup), lambda: setup.preview.read(USER, "saved-note"),
                      lambda: setup.preview.save(USER, save_body(), "save")):
        fail(403, operation, "source_revoked")


@pytest.mark.parametrize("kind,field,value", [
    ("device", "revoked", True), ("session", "revoked", True),
    ("control_membership", "deleted", True), ("control_membership", "active", False),
    ("control_membership", "session_id", "other-session"),
])
def test_current_lifecycle_restrictions_fence_exact_replay(setup, kind, field, value):
    saved(setup)
    identifier = {"device": DEVICE, "session": SESSION, "control_membership": key(DEVICE, SESSION)}[kind]
    with setup.store.transaction(USER) as tx:
        row = tx.get(kind, identifier)
        tx.put(kind, identifier, {**row, field: value})
    fail(403, lambda: setup.preview.save(USER, save_body(), "save"))
    fail(403, lambda: setup.preview.read(USER, "saved-note"))


def test_import_rollback_leaves_no_partial_snapshot_or_ack(setup, monkeypatch):
    before = inventory(setup)
    original = _MemoryTransaction.put
    def broken(tx, kind, identifier, value):
        original(tx, kind, identifier, value)
        if kind == "http_replay":
            raise RuntimeError("injected import failure")
    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", broken)
        with pytest.raises(RuntimeError, match="import failure"):
            seed(setup)
    assert inventory(setup) == before
    assert seed(setup)["replayed"] is False


def test_frame_cannot_relabel_imported_source_timezone(setup):
    seed(setup)
    body = save_body()
    body["frame"]["source_timezone"] = "UTC"
    before = inventory(setup)
    fail(422, lambda: setup.preview.save(USER, body, "timezone"), "source_timezone_mismatch")
    assert inventory(setup) == before


def test_missing_artifact_cannot_be_adopted_through_another_frame_reference(setup):
    seed(setup)
    body = save_body()
    with setup.store.transaction(USER) as tx:
        tx.put("frame", "orphan-frame", {**body["frame"], "frame_id": "orphan-frame"})
    fail(409, lambda: setup.preview.save(USER, body, "adopt"), "artifact_conflict")


@pytest.mark.parametrize("kind", ["source", "preview_save", "note"])
def test_missing_saved_links_are_storage_failures_not_absent_history(setup, kind):
    saved(setup)
    with setup.store.transaction(USER) as tx:
        tx.delete(kind, "course-notes" if kind == "source" else "saved-note")
    fail(503, lambda: setup.preview.read(USER, "saved-note"), "unavailable")


def test_empty_user_strings_preserved_without_fabricated_help(setup):
    seed(setup)
    body = {**save_body(), "request_text": "", "user_note": ""}
    setup.preview.save(USER, body, "empty-text")
    view = setup.preview.read(USER, body["note_id"])
    assert view["request_text"] == view["user_note"] == ""
    assert view["observation"]["text"] == ""
    assert view["note"]["blocks"][0]["content"] == ""
    assert view["ai_status"] == "provider_unavailable"


def test_preview_sequence_allocation_respects_existing_v1_event_slots(setup):
    saved(setup)
    event = setup.preview.read(USER, "saved-note")["observation"]
    event.update(event_id="legacy-event", device_sequence=30, text="Another actual input", received_at=None)
    setup.archive.events(USER, {"contract_version": "0.1.0", "events": [event]})
    setup.preview.save(USER, save_body(note_id="after-legacy"), "after-legacy")
    assert setup.preview.read(USER, "after-legacy")["observation"]["device_sequence"] == 31
