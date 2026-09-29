"""Saved discovery uses server originals, with deletion-stable bounded pages."""

import base64
from copy import deepcopy
from datetime import datetime
import json

import pytest

from packages.contracts.document_preview import CONTRACT_VERSION, validate
from services.api.domain import key
from services.api.preview import DocumentPreview
from services.api.tests.test_preview import (USER, DEVICE, SESSION, fail, import_body,
                                            save_body, seed, setup)


def save(setup, name, when="2026-09-28T00:00:00Z", *, source_id="course-notes"):
    setup.preview.archive.clock = lambda: datetime.fromisoformat(when.replace("Z", "+00:00"))
    body = save_body(note_id=name, source_id=source_id)
    body["title"] = "Original title " + name
    setup.preview.save(USER, body, "save-" + name)
    return body


def test_empty_and_server_only_discovery_reopen_keep_all_originals(setup):
    assert setup.preview.library(USER) == {"contract_version": CONTRACT_VERSION, "items": [], "next_cursor": None}
    seed(setup)
    body = save(setup, "note-1")
    before = deepcopy(setup.store._documents)
    restarted = DocumentPreview(setup.store, lambda state: None, device_id=DEVICE, session_id=SESSION)
    result = restarted.library(USER)  # No browser ID or cache supplied.
    validate("SavedLibrary", result)
    assert result["items"] == [{"note_id": "note-1", "title": body["title"], "filename": "课程原文.txt",
                                "source_id": "course-notes", "source_version": 1,
                                "created_at": "2026-09-28T00:00:00Z"}]
    reopened = restarted.read(USER, result["items"][0]["note_id"])
    assert reopened["user_note"] == body["user_note"] and reopened["request"] == body["request"]
    assert setup.store._documents == before


def test_ties_fractional_time_and_page_size_changes_do_not_duplicate(setup):
    seed(setup)
    for name, timestamp in (("z", "2026-09-28T00:00:00Z"), ("b", "2026-09-28T00:00:00.1Z"),
                            ("a", "2026-09-28T00:00:00.100000Z"), ("c", "2026-09-28T00:00:00.01Z")):
        save(setup, name, timestamp)
    first = setup.preview.library(USER, limit=1)
    assert [r["note_id"] for r in first["items"]] == ["b"]
    second = setup.preview.library(USER, limit=2, cursor=first["next_cursor"])
    assert [r["note_id"] for r in second["items"]] == ["a", "c"]
    third = setup.preview.library(USER, cursor=second["next_cursor"])
    assert [r["note_id"] for r in third["items"]] == ["z"] and third["next_cursor"] is None


def test_more_than_maximum_page_remains_discoverable(setup):
    seed(setup)
    expected = [f"note-{n:03}" for n in range(52)]
    for name in expected: save(setup, name)
    before = deepcopy(setup.store._documents)
    first = setup.preview.library(USER, limit=50)
    second = setup.preview.library(USER, limit=50, cursor=first["next_cursor"])
    found = [row["note_id"] for page in (first, second) for row in page["items"]]
    assert found == sorted(expected, reverse=True) and len(set(found)) == 52
    assert len(first["items"]) == 50 and len(second["items"]) == 2 and second["next_cursor"] is None
    assert setup.store._documents == before


def test_cursor_survives_anchor_source_deletion_and_newer_insert(setup):
    seed(setup)
    setup.preview.import_document(USER, import_body(source_id="another-source"), "other-source")
    save(setup, "z", source_id="another-source")
    for name in ("a", "b"): save(setup, name)
    first = setup.preview.library(USER, limit=1)
    setup.archive.delete_source(USER, "another-source")
    save(setup, "new", "2026-09-29T00:00:00Z")
    second = setup.preview.library(USER, cursor=first["next_cursor"])
    assert [row["note_id"] for row in second["items"]] == ["b", "a"]
    assert second["next_cursor"] is None


@pytest.mark.parametrize("hidden", ["source_revoked", "source_deleted", "note_revoked", "note_deleted", "tombstone"])
def test_explicit_unavailable_states_are_hidden(setup, hidden):
    seed(setup)
    save(setup, "hidden")
    with setup.store.transaction(USER) as tx:
        if hidden.startswith("source_"):
            row = tx.get("source", "course-notes")
            row[hidden.removeprefix("source_")] = True
            tx.put("source", "course-notes", row)
        elif hidden.startswith("note_"):
            row = tx.get("note", "hidden")
            row[hidden.removeprefix("note_")] = True
            tx.put("note", "hidden", row)
        else:
            tx.put("note_tombstone", "hidden", {"note_id": "hidden"})
    result = setup.preview.library(USER)
    assert result["items"] == [] and result["next_cursor"] is None


@pytest.mark.parametrize("kind,record", [
    ("source", "course-notes"), ("snapshot", key("course-notes", 1)),
    ("preview_import", key("course-notes", 1)), ("frame", "frame-corrupt"),
    ("artifact", "artifact-corrupt"), ("note", "corrupt"), ("note_revision", key("corrupt", 1)),
])
def test_missing_visible_original_fails_closed_even_outside_requested_page(setup, kind, record):
    seed(setup)
    save(setup, "newest", "2026-09-29T00:00:00Z")
    save(setup, "corrupt")
    # Deliberate corruption of this isolated test double, not a deletion request.
    setup.store._documents[USER].pop((kind, record))
    fail(503, lambda: setup.preview.library(USER, limit=1))


@pytest.mark.parametrize("kind,record,field,value", [
    ("source", "course-notes", "user_id", "another-user"),
    ("source", "course-notes", "revoked", "false"),
    ("preview_save", "note", "note_id", "wrong-key"),
    ("preview_save", "note", "source_version", 2),
    ("preview_import", key("course-notes", 1), "filename", None),
    ("note_revision", key("note", 1), "title", "forged but valid title"),
    ("note_revision", key("note", 1), "created_at", "yesterday"),
    ("note", "note", "deleted", "false"),
])
def test_corrupt_metadata_is_not_a_plausible_library_item(setup, kind, record, field, value):
    seed(setup)
    save(setup, "note")
    setup.store._documents[USER][(kind, record)][field] = value
    fail(503, lambda: setup.preview.library(USER))


@pytest.mark.parametrize("limit", [True, False, None, 0, -1, 51, 2.5, "20"])
def test_invalid_domain_limits(setup, limit):
    fail(422, lambda: setup.preview.library(USER, limit=limit))


@pytest.mark.parametrize("cursor", ["", "!", "a" * 513, "YQ", "bnVsbA", "W10", "AA", 1,
    base64.urlsafe_b64encode(json.dumps([1, USER, "not-a-time", "note"]).encode()).decode().rstrip("="),
    base64.urlsafe_b64encode(json.dumps([True, USER, "2026-09-28T00:00:00Z", "note"]).encode()).decode().rstrip("="),
])
def test_malformed_cursor_is_not_an_empty_page(setup, cursor):
    fail(422, lambda: setup.preview.library(USER, cursor=cursor))


def test_cursor_is_account_bound_and_contains_only_ordering_position(setup):
    seed(setup)
    for name in ("a", "b"): save(setup, name)
    cursor = setup.preview.library(USER, limit=1)["next_cursor"]
    boundary = setup.preview._library_boundary(USER, cursor)
    assert boundary[-1] == "b" and len(cursor) <= 512
    fail(422, lambda: setup.preview._library_boundary("another-user", cursor))
    fail(422, lambda: setup.preview._library_boundary(USER, cursor + "="))


def test_library_keeps_original_revision_when_note_head_advances(setup):
    seed(setup)
    save(setup, "note")
    original = setup.archive.get_note(USER, "note")
    next_revision = {**original, "base_revision": 1, "revision": 2, "title": "Later title"}
    setup.archive.put_note(USER, "note", next_revision)
    result = setup.preview.library(USER)
    assert result["items"][0]["title"] == original["title"]
    assert setup.preview.read(USER, "note")["note"] == original


def test_missing_saved_link_is_not_a_successful_empty_archive(setup):
    seed(setup)
    save(setup, "note")
    setup.store._documents[USER].pop(("preview_save", "note"))
    # The durable commit receipt still proves a saved note exists.
    fail(503, lambda: setup.preview.library(USER))


def test_valid_but_contradictory_creation_time_is_corruption(setup):
    seed(setup)
    save(setup, "note")
    setup.store._documents[USER][("note_revision", key("note", 1))]["created_at"] = "2026-09-29T00:00:00Z"
    fail(503, lambda: setup.preview.library(USER))
