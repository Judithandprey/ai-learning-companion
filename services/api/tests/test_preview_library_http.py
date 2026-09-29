"""Saved-library HTTP discovery, authorization, pagination and privacy boundaries."""

from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta

import pytest

from packages.contracts.document_preview import CONTRACT_VERSION, validate
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.domain import Archive, key
from services.api.preview_app import create_preview_app
from services.api.preview_local import _bootstrap
from services.api.tests.test_preview import DEVICE, SESSION, USER, import_body, save_body
from services.api.tests.test_preview_http import NOW, configured, request


PATH = "/preview/v1/saves"


def save(app, note_id="saved-note", *, source_id="course-notes", version=1,
         token="secret-token", user_id=USER):
    imported = request(app, "POST", "/preview/v1/documents", token=token,
                       key=f"import-{source_id}-{version}",
                       json=import_body(source_id=source_id, version=version))
    assert imported.status_code == 200
    body = save_body(note_id=note_id, source_id=source_id, version=version)
    for record in (body["frame"], body["bridge_request"]["selection"], body["request"]):
        record["user_id"] = user_id
    response = request(app, "POST", PATH, token=token, key=f"save-{note_id}", json=body)
    assert response.status_code == 200
    return body


def library(app, **kwargs):
    response = request(app, "GET", PATH, key=None, **kwargs)
    assert response.status_code == 200
    validate("SavedLibrary", response.json())
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    return response.json()


def test_empty_discovery_and_reopen_originals_with_read_scope(configured):
    app, store, _ = configured
    assert library(app, token="read-only") == {
        "contract_version": CONTRACT_VERSION, "items": [], "next_cursor": None,
    }
    body = save(app)
    before = deepcopy(store._documents)
    result = library(app, token="read-only")
    assert result == {"contract_version": CONTRACT_VERSION, "items": [{
        "note_id": body["note_id"], "title": body["title"],
        "filename": import_body()["filename"], "source_id": "course-notes",
        "source_version": 1, "created_at": "2026-09-28T00:00:00Z",
    }], "next_cursor": None}
    reopened = request(app, "GET", f"{PATH}/{result['items'][0]['note_id']}",
                       token="read-only", key=None)
    assert reopened.status_code == 200
    validate("SavedPreview", reopened.json())
    for field in ("request_text", "user_note", "frame_bytes_base64", "frame", "request"):
        assert reopened.json()[field] == body[field]
    assert reopened.json()["content_base64"] == import_body()["content_base64"]
    assert store._documents == before


def test_default_limit_and_maximum_limit_do_not_truncate_the_archive(configured):
    app, store, _ = configured
    for number in range(21):
        save(app, f"note-{number:02d}")
    before = deepcopy(store._documents)
    first = library(app)
    assert [item["note_id"] for item in first["items"]] == [
        f"note-{number:02d}" for number in range(20, 0, -1)
    ]
    assert isinstance(first["next_cursor"], str) and 0 < len(first["next_cursor"]) <= 512
    duplicate = request(app, "GET", PATH, params=[
        ("cursor", first["next_cursor"]), ("cursor", first["next_cursor"]),
    ])
    assert duplicate.status_code == 422
    last = library(app, params={"cursor": first["next_cursor"]})
    assert [item["note_id"] for item in last["items"]] == ["note-00"]
    assert last["next_cursor"] is None
    all_saved = library(app, params={"limit": "50"})
    assert len(all_saved["items"]) == 21 and all_saved["next_cursor"] is None
    assert store._documents == before


def test_cursor_survives_deleted_anchor_and_new_save_without_repeats(configured):
    _, store, auth = configured
    now = [NOW]
    app = create_preview_app(store, auth, lambda: now[0], user_id=USER,
                             device_id=DEVICE, session_id=SESSION)
    save(app, "note-z", source_id="oldest")
    now[0] += timedelta(minutes=1)
    save(app, "note-b", source_id="middle")
    save(app, "note-c", source_id="anchor")
    now[0] += timedelta(minutes=1)
    save(app, "note-a", source_id="newest")
    first = library(app, params={"limit": 2})
    assert [item["note_id"] for item in first["items"]] == ["note-a", "note-c"]
    assert first["next_cursor"]
    Archive(store).delete_source(USER, "anchor")
    now[0] += timedelta(minutes=1)
    save(app, "note-new", source_id="arrived-later")
    before = deepcopy(store._documents)
    tail = library(app, params={"limit": 2, "cursor": first["next_cursor"]})
    assert [item["note_id"] for item in tail["items"]] == ["note-b", "note-z"]
    assert tail["next_cursor"] is None
    assert request(app, "GET", f"{PATH}/note-c").status_code == 404
    assert store._documents == before


@pytest.mark.parametrize("query", [
    "limit=", "limit=0", "limit=51", "limit=-1", "limit=1.0", "limit=true",
    "limit=+1", "limit=%2B1", "limit=%201", "limit=1%20", "limit=01",
    "limit=%EF%BC%91", "limit=1&limit=2", "limit=1&limit=1", "limit=1&%6cimit=2",
    "cursor=", "cursor=not-a-cursor", "cursor=%00", "cursor=%FF",
    pytest.param("cursor=" + "a" * 513, id="oversized-cursor"),
    "cursor=a&cursor=b", "cursor=&cursor=",
    "offset=1", "user_id=other", "source_id=course-notes", "=value",
])
def test_strict_query_validation_never_writes_or_exposes_content(configured, query):
    app, store, _ = configured
    save(app)
    before = deepcopy(store._documents)
    response = request(app, "GET", PATH + "?" + query, key=None)
    assert response.status_code == 422
    assert response.json() == {"contract_version": CONTRACT_VERSION, "code": "invalid_request"}
    assert store._documents == before


@pytest.mark.parametrize("token,status", [
    (None, 401), ("bad", 401), ("expired", 401), ("foreign", 403), ("assistant", 403),
])
def test_library_checks_auth_before_returning_saved_summaries(configured, token, status):
    app, _, _ = configured
    save(app)
    response = request(app, "GET", PATH, token=token, key=None)
    assert response.status_code == status
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"


def test_write_scope_and_duplicate_authorization_cannot_read_library(configured):
    app, store, _ = configured
    save(app)
    auth = LocalTestAuthenticator({
        "write-only": Principal(USER, {"document-preview:write"}, NOW + timedelta(hours=1)),
    })
    write_app = create_preview_app(store, auth, lambda: NOW, user_id=USER,
                                   device_id=DEVICE, session_id=SESSION)
    assert request(write_app, "GET", PATH, token="write-only").status_code == 403
    assert request(app, "GET", PATH,
                   headers=[("Authorization", "Bearer secret-token")]).status_code == 401


def test_account_revocation_regrant_and_token_revocation_fence_discovery(configured):
    app, store, auth = configured
    save(app)
    Archive(store).set_authorization(USER, enabled=False)
    assert request(app, "GET", PATH).status_code == 403
    Archive(store).set_authorization(USER, enabled=True)
    assert request(app, "GET", PATH).status_code == 403
    auth.revoke("secret-token")
    assert request(app, "GET", PATH).status_code == 401


@pytest.mark.parametrize("kind,field,value", [
    ("device", "revoked", True), ("session", "revoked", True),
    ("control_membership", "active", False),
])
def test_current_device_session_and_membership_fence_discovery(configured, kind, field, value):
    app, store, _ = configured
    save(app)
    identity = {"device": DEVICE, "session": SESSION,
                "control_membership": key(DEVICE, SESSION)}[kind]
    with store.transaction(USER) as tx:
        tx.put(kind, identity, {**tx.get(kind, identity), field: value})
    assert request(app, "GET", PATH).status_code == 403


def test_expiry_rechecked_after_library_actor_lock(configured, monkeypatch):
    app, store, auth = configured
    save(app)
    now = [NOW]
    app = create_preview_app(store, auth, lambda: now[0], user_id=USER,
                             device_id=DEVICE, session_id=SESSION)
    original = store.transaction

    @contextmanager
    def delayed_transaction(user_id):
        with original(user_id) as tx:
            now[0] += timedelta(hours=2)
            yield tx

    before = deepcopy(store._documents)
    monkeypatch.setattr(store, "transaction", delayed_transaction)
    assert request(app, "GET", PATH).status_code == 401
    assert store._documents == before


def test_deleted_and_revoked_sources_are_absent_even_from_next_page(configured):
    app, store, _ = configured
    for note_id in ("note-a", "note-b", "note-c", "note-d"):
        save(app, note_id, source_id=f"source-{note_id}")
    first = library(app, params={"limit": 1})
    assert first["items"][0]["note_id"] == "note-d"
    Archive(store).delete_source(USER, "source-note-c")
    Archive(store).revoke_source(USER, "source-note-b")
    before = deepcopy(store._documents)
    tail = library(app, params={"limit": 1, "cursor": first["next_cursor"]})
    assert [item["note_id"] for item in tail["items"]] == ["note-a"]
    assert tail["next_cursor"] is None
    assert [item["note_id"] for item in library(app)["items"]] == ["note-d", "note-a"]
    assert request(app, "GET", f"{PATH}/note-b").status_code == 403
    assert request(app, "GET", f"{PATH}/note-c").status_code == 404
    assert store._documents == before


def test_users_with_identical_note_ids_have_isolated_discovery_and_reopen(configured):
    app, store, auth = configured
    own = save(app, "shared-note", source_id="own-source")
    _bootstrap(store, "other", DEVICE, SESSION)
    other_app = create_preview_app(store, auth, lambda: NOW, user_id="other",
                                   device_id=DEVICE, session_id=SESSION)
    save(other_app, "shared-note", source_id="foreign-source", token="foreign", user_id="other")
    save(other_app, "foreign-only", source_id="foreign-source", token="foreign", user_id="other")
    own_list = library(app)
    assert [(row["note_id"], row["source_id"]) for row in own_list["items"]] == [
        ("shared-note", "own-source"),
    ]
    foreign_list = library(other_app, token="foreign")
    assert {row["note_id"] for row in foreign_list["items"]} == {"shared-note", "foreign-only"}
    assert {row["source_id"] for row in foreign_list["items"]} == {"foreign-source"}
    foreign_page = library(other_app, token="foreign", params={"limit": 1})
    assert foreign_page["next_cursor"]
    rejected = request(app, "GET", PATH, params={"cursor": foreign_page["next_cursor"]})
    assert rejected.status_code == 422
    assert rejected.json() == {"contract_version": CONTRACT_VERSION, "code": "invalid_request"}
    assert request(app, "GET", f"{PATH}/foreign-only").status_code == 404
    reopened = request(app, "GET", f"{PATH}/shared-note")
    assert reopened.status_code == 200
    assert reopened.json()["frame"] == own["frame"]


def test_unconfigured_library_is_unavailable():
    assert request(create_preview_app(), "GET", PATH).status_code == 503
