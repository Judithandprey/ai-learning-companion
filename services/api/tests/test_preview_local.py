"""Local launcher/bootstrap checks with an explicit MemoryStore test double."""

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from psycopg.errors import UndefinedTable
import pytest

from services.api import preview_local
from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.storage import MemoryStore


TOKEN = "explicit-preview-test-secret-at-least-32-characters"
USER, DEVICE, SESSION = "preview-user", "preview-device", "preview-session"
NOW = datetime(2026, 9, 29, tzinfo=timezone.utc)
ENV = {"LC_ENABLE_DOCUMENT_PREVIEW": "1", "LC_DATABASE_URL": "postgresql://preview.invalid/test",
       "LC_PREVIEW_TOKEN": TOKEN, "LC_PREVIEW_USER_ID": USER,
       "LC_PREVIEW_DEVICE_ID": DEVICE, "LC_PREVIEW_SESSION_ID": SESSION}


@pytest.fixture
def configured(monkeypatch):
    for name, value in ENV.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("LC_PREVIEW_UI_ORIGIN", raising=False)
    store, dsns = MemoryStore(), []

    def test_store(dsn):
        dsns.append(dsn)
        return store

    monkeypatch.setattr(preview_local, "PostgresStore", test_store)
    monkeypatch.setattr(preview_local, "_utcnow", lambda: NOW)
    monkeypatch.setattr(preview_local, "create_preview_app", lambda store, authenticator, **identity:
                        SimpleNamespace(store=store, authenticator=authenticator, **identity))
    return store, dsns


@pytest.mark.parametrize("opt_in", [None, "", "0", "true"])
def test_opt_in_is_required_before_database_access(configured, monkeypatch, opt_in):
    if opt_in is None:
        monkeypatch.delenv("LC_ENABLE_DOCUMENT_PREVIEW")
    else:
        monkeypatch.setenv("LC_ENABLE_DOCUMENT_PREVIEW", opt_in)
    with pytest.raises(RuntimeError, match="explicit opt-in"):
        preview_local.create_local_preview_app()
    assert configured[1] == []
    assert configured[0]._documents == {}


@pytest.mark.parametrize("origin", [None, "", "http://127.0.0.1:5173",
                                   "http://localhost:8174", "http://[::1]:5173"])
def test_only_explicit_trusted_ui_origin_is_passed_to_app(configured, monkeypatch, origin):
    if origin is not None:
        monkeypatch.setenv("LC_PREVIEW_UI_ORIGIN", origin)
    app = preview_local.create_local_preview_app()
    assert app.allowed_origins == (frozenset({origin}) if origin else frozenset())


@pytest.mark.parametrize("origin", [
    "*", "null", " ", "http://course.example:5173", "http://0.0.0.0:5173",
    "https://localhost:5173", "http://localhost", "http://localhost:0",
    "http://localhost:65536", "http://localhost:abc", "http://localhost:5173/",
    "http://localhost:5173/document", "http://localhost:5173?token=private",
    "http://localhost:5173?", "http://localhost:5173#private", "http://localhost:5173#",
    "http://private@localhost:5173", "http://user:private@localhost:5173",
    "http://localhost:5173 http://127.0.0.1:5173", " http://localhost:5173",
    "http://localhost:5173\n", "http://local\thost:5173",
])
def test_invalid_ui_origin_is_redacted_and_rejected_before_database_access(configured, monkeypatch, origin):
    monkeypatch.setenv("LC_PREVIEW_UI_ORIGIN", origin)
    with pytest.raises(RuntimeError) as error:
        preview_local.create_local_preview_app()
    assert str(error.value) == "LC_PREVIEW_UI_ORIGIN must be an exact trusted HTTP loopback origin with port"
    assert configured[1] == []
    assert configured[0]._documents == {}


@pytest.mark.parametrize("name,value", [
    ("LC_DATABASE_URL", None), ("LC_DATABASE_URL", " "),
    ("LC_PREVIEW_TOKEN", None), ("LC_PREVIEW_TOKEN", "x" * 31),
    ("LC_PREVIEW_TOKEN", "x" * 32 + " "), ("LC_PREVIEW_TOKEN", "x" * 32 + "\n"),
    ("LC_PREVIEW_TOKEN", "x" * 32 + "密"),
    *[(name, value) for name in ("LC_PREVIEW_USER_ID", "LC_PREVIEW_DEVICE_ID", "LC_PREVIEW_SESSION_ID")
      for value in (None, "", "bad identifier", "x" * 129, "user\n")],
])
def test_invalid_configuration_never_touches_database(configured, monkeypatch, name, value):
    if value is None:
        monkeypatch.delenv(name)
    else:
        monkeypatch.setenv(name, value)
    with pytest.raises(RuntimeError, match=name) as error:
        preview_local.create_local_preview_app()
    assert TOKEN not in str(error.value)
    assert ENV["LC_DATABASE_URL"] not in str(error.value)
    assert configured[1] == []
    assert configured[0]._documents == {}


def test_bootstrap_creates_exact_membership_without_capture_or_synthetic_import(configured, monkeypatch):
    monkeypatch.setenv("LC_IMPORT_SYNTHETIC_FIXTURE", "1")
    app = preview_local.create_local_preview_app()
    store = configured[0]
    assert app.store is store
    assert (app.user_id, app.device_id, app.session_id) == (USER, DEVICE, SESSION)
    assert configured[1] == [ENV["LC_DATABASE_URL"]]
    with store.transaction(USER) as tx:
        assert tx.get("authorization", "state") == {"enabled": True, "generation": 1}
        assert tx.get("device", DEVICE) == {"user_id": USER, "id": DEVICE}
        assert tx.get("session", SESSION) == {"user_id": USER, "id": SESSION, "live_capture": False}
        assert tx.get("control_membership", key(DEVICE, SESSION)) == {
            "user_id": USER, "device_id": DEVICE, "session_id": SESSION, "active": True, "revision": 1}
        assert tx.scan("source") == []
        assert tx.scan("frame") == []
        assert tx.scan("control_start") == []
        assert tx.scan("control_stream") == []


def test_restart_preserves_membership_generation_and_all_existing_records(configured, monkeypatch):
    store = configured[0]
    preview_local.create_local_preview_app()
    with store.transaction(USER) as tx:
        tx.put("authorization", "state", {"enabled": True, "generation": 8})
        member = tx.get("control_membership", key(DEVICE, SESSION))
        tx.put("control_membership", key(DEVICE, SESSION), {**member, "revision": 12})
        tx.put("source", "existing-source", {"original": "保留 <markup>"})
    before = deepcopy(store._documents)
    replacement = "replacement-local-preview-secret-32-characters"
    monkeypatch.setenv("LC_PREVIEW_TOKEN", replacement)
    app = preview_local.create_local_preview_app()
    assert store._documents == before
    principal = app.authenticator.authenticate(replacement, NOW)
    assert principal.user_id == USER
    assert principal.actor == "user"
    assert principal.authorization_generation == 8
    assert principal.expires_at == NOW + timedelta(hours=1)
    assert principal.scopes == frozenset({"document-preview:read", "document-preview:write"})
    with pytest.raises(DomainError, match="invalid_token"):
        app.authenticator.authenticate(TOKEN, NOW)
    with pytest.raises(DomainError, match="expired_token"):
        app.authenticator.authenticate(replacement, NOW + timedelta(hours=1))


def test_restart_with_new_secret_cannot_reenable_revoked_account(configured, monkeypatch):
    store = configured[0]
    preview_local.create_local_preview_app()
    Archive(store).set_authorization(USER, enabled=False)
    before = deepcopy(store._documents)
    monkeypatch.setenv("LC_PREVIEW_TOKEN", "a-fresh-secret-does-not-grant-new-consent")
    with pytest.raises(RuntimeError, match="cannot re-enable"):
        preview_local.create_local_preview_app()
    assert store._documents == before


@pytest.mark.parametrize("kind,record_id,changes", [
    ("device", DEVICE, {"deleted": True}), ("device", DEVICE, {"user_id": "other"}),
    ("device", DEVICE, {"id": "different-device"}), ("device", DEVICE, {"revoked": True}),
    ("session", SESSION, {"deleted": True}), ("session", SESSION, {"user_id": "other"}),
    ("session", SESSION, {"id": "different-session"}),
    ("control_membership", key(DEVICE, SESSION), {"active": False}),
    ("control_membership", key(DEVICE, SESSION), {"active": 1}),
    ("control_membership", key(DEVICE, SESSION), {"user_id": "other"}),
    ("control_membership", key(DEVICE, SESSION), {"device_id": "different-device"}),
    ("control_membership", key(DEVICE, SESSION), {"session_id": "different-session"}),
    ("control_membership", key(DEVICE, SESSION), {"revision": True}),
    ("control_membership", key(DEVICE, SESSION), {"revision": 0}),
    ("control_membership", key(DEVICE, SESSION), {"revision": 9007199254740992}),
    ("control_membership", key(DEVICE, SESSION), {"deleted": True}),
    ("authorization", "state", {"enabled": 1}),
    ("authorization", "state", {"generation": True}),
    ("authorization", "state", {"generation": 0}),
    ("authorization", "state", {"generation": 9007199254740992}),
])
def test_bootstrap_never_repairs_revoked_deleted_mismatched_or_invalid_identity(configured, kind, record_id, changes):
    store = configured[0]
    preview_local.create_local_preview_app()
    with store.transaction(USER) as tx:
        tx.put(kind, record_id, {**tx.get(kind, record_id), **changes})
    before = deepcopy(store._documents)
    with pytest.raises(RuntimeError):
        preview_local.create_local_preview_app()
    assert store._documents == before


def test_bootstrap_failure_rolls_back_new_ownership_rows(configured):
    store = configured[0]
    with store.transaction(USER) as tx:
        tx.put("control_membership", key(DEVICE, SESSION), {
            "user_id": USER, "device_id": DEVICE, "session_id": SESSION, "active": False, "revision": 2})
    before = deepcopy(store._documents)
    with pytest.raises(RuntimeError, match="membership"):
        preview_local.create_local_preview_app()
    assert store._documents == before


def test_startup_redacts_database_errors_and_does_not_migrate(configured, monkeypatch):
    class MissingSchemaStore:
        @contextmanager
        def transaction(self, _user_id):
            raise UndefinedTable("postgresql://sensitive-password@example.invalid/private")
            yield

    monkeypatch.setattr(preview_local, "PostgresStore", lambda _dsn: MissingSchemaStore())
    with pytest.raises(RuntimeError, match="migrations") as error:
        preview_local.create_local_preview_app()
    assert "sensitive-password" not in str(error.value)
    assert TOKEN not in str(error.value)


@pytest.mark.parametrize("arguments,port", [([], 8174), (["--port", "8291"], 8291)])
def test_foreground_cli_binds_only_loopback_and_ignores_proxy_headers(monkeypatch, arguments, port):
    app, calls = object(), []
    monkeypatch.setattr(preview_local, "create_local_preview_app", lambda: app)
    monkeypatch.setattr(preview_local.uvicorn, "run", lambda *args, **kwargs: calls.append((args, kwargs)))
    monkeypatch.setenv("UVICORN_HOST", "0.0.0.0")
    preview_local.main(arguments)
    assert calls == [((app,), {"host": "127.0.0.1", "port": port, "proxy_headers": False, "access_log": False})]


@pytest.mark.parametrize("arguments", [["--host", "0.0.0.0"], ["--port", "0"], ["--port", "65536"]])
def test_invalid_listener_arguments_reject_before_startup(monkeypatch, arguments):
    calls = []
    monkeypatch.setattr(preview_local, "create_local_preview_app", lambda: calls.append("startup"))
    with pytest.raises(SystemExit) as error:
        preview_local.main(arguments)
    assert error.value.code == 2
    assert calls == []


def test_cli_configuration_failure_is_redacted_without_traceback(configured, monkeypatch, capsys):
    monkeypatch.delenv("LC_ENABLE_DOCUMENT_PREVIEW")
    with pytest.raises(SystemExit) as error:
        preview_local.main([])
    assert error.value.code == 2
    captured = capsys.readouterr()
    assert "explicit opt-in" in captured.err
    assert "Traceback" not in captured.err
    assert TOKEN not in captured.err + captured.out
    assert ENV["LC_DATABASE_URL"] not in captured.err + captured.out
