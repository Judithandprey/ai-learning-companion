"""Factory behavior with explicitly monkeypatched storage, not real DB evidence."""

import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import httpx
import pytest
from psycopg.errors import UndefinedTable

from services.api import local
from services.api.domain import Archive
from services.api.storage import MemoryStore


TOKEN = "synthetic-test-token-32-characters-minimum"
NOW = datetime(2026, 9, 28, tzinfo=timezone.utc)


@pytest.fixture
def local_store(monkeypatch):
    for name in ("LC_ENABLE_LOCAL_TEST_AUTH", "LC_DATABASE_URL", "LC_LOCAL_TEST_TOKEN", "LC_IMPORT_SYNTHETIC_FIXTURE"):
        monkeypatch.delenv(name, raising=False)
    store = MemoryStore()
    seen_dsns = []

    def explicit_test_store(dsn):
        seen_dsns.append(dsn)
        return store

    monkeypatch.setattr(local, "PostgresStore", explicit_test_store)
    return store, seen_dsns


def configure(monkeypatch):
    monkeypatch.setenv("LC_ENABLE_LOCAL_TEST_AUTH", "1")
    monkeypatch.setenv("LC_DATABASE_URL", "postgresql://synthetic.invalid/local_test")
    monkeypatch.setenv("LC_LOCAL_TEST_TOKEN", TOKEN)


def get(app, path):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8173") as client:
            return await client.get(path, headers={"Authorization": f"Bearer {TOKEN}"})
    return asyncio.run(run())


@pytest.mark.parametrize("opt_in", [None, "", "0", "true"])
def test_factory_requires_exact_opt_in_before_touching_database(local_store, monkeypatch, opt_in):
    configure(monkeypatch)
    if opt_in is None:
        monkeypatch.delenv("LC_ENABLE_LOCAL_TEST_AUTH")
    else:
        monkeypatch.setenv("LC_ENABLE_LOCAL_TEST_AUTH", opt_in)
    with pytest.raises(RuntimeError, match="explicit opt-in"):
        local.create_local_app()
    assert local_store[1] == []


@pytest.mark.parametrize("name,value", [
    ("LC_DATABASE_URL", None), ("LC_DATABASE_URL", ""), ("LC_DATABASE_URL", "   "),
    ("LC_LOCAL_TEST_TOKEN", None), ("LC_LOCAL_TEST_TOKEN", ""),
    ("LC_LOCAL_TEST_TOKEN", "x" * 31), ("LC_LOCAL_TEST_TOKEN", "x" * 31 + " "),
    ("LC_LOCAL_TEST_TOKEN", "x" * 31 + "\n"), ("LC_LOCAL_TEST_TOKEN", "x" * 31 + "密"),
])
def test_factory_rejects_missing_or_invalid_config_without_writes(local_store, monkeypatch, name, value):
    configure(monkeypatch)
    if value is None:
        monkeypatch.delenv(name)
    else:
        monkeypatch.setenv(name, value)
    with pytest.raises(RuntimeError) as error:
        local.create_local_app()
    assert name in str(error.value)
    assert TOKEN not in str(error.value)
    assert local_store[1] == []
    assert local_store[0]._documents == {}


def test_factory_does_not_import_fixture_by_default_and_preserves_generation(local_store, monkeypatch):
    configure(monkeypatch)
    first = local.create_local_app()
    assert first.state.store is local_store[0]
    assert get(first, "/v1/sources/linear-algebra").status_code == 404
    assert get(first, "/v1/usage").status_code == 200
    second = local.create_local_app()
    with local_store[0].transaction(local.LOCAL_USER) as tx:
        assert tx.get("authorization", "state") == {"enabled": True, "generation": 1}
        assert tx.scan("source") == []
    assert second.state.authenticator.authenticate(TOKEN, datetime.now(timezone.utc)).authorization_generation == 1


def test_factory_never_reenables_revoked_identity(local_store, monkeypatch):
    configure(monkeypatch)
    archive = Archive(local_store[0])
    original = archive.set_authorization(local.LOCAL_USER, enabled=False)
    with pytest.raises(RuntimeError, match="cannot re-enable"):
        local.create_local_app()
    with local_store[0].transaction(local.LOCAL_USER) as tx:
        assert tx.get("authorization", "state") == original
        assert tx.scan("source") == []


def test_factory_uses_existing_generation_and_one_hour_expiry(local_store, monkeypatch):
    configure(monkeypatch)
    monkeypatch.setattr(local, "_utcnow", lambda: NOW)
    with local_store[0].transaction(local.LOCAL_USER) as tx:
        tx.put("authorization", "state", {"enabled": True, "generation": 8})
    app = local.create_local_app()
    principal = app.state.authenticator.authenticate(TOKEN, NOW)
    assert principal.user_id == "fixture-user"
    assert principal.actor == "user"
    assert principal.authorization_generation == 8
    assert principal.expires_at == NOW + timedelta(hours=1)
    assert principal.scopes == local.LOCAL_SCOPES


def test_factory_imports_only_explicit_synthetic_fixture_and_reads_after_restart(local_store, monkeypatch):
    configure(monkeypatch)
    monkeypatch.setenv("LC_IMPORT_SYNTHETIC_FIXTURE", "1")
    first = local.create_local_app()
    source = get(first, "/v1/sources/linear-algebra")
    assert source.status_code == 200
    assert source.json()["source"]["type"] == "synthetic"
    assert source.json()["snapshot_versions"] == [1]
    monkeypatch.delenv("LC_IMPORT_SYNTHETIC_FIXTURE")
    restarted = local.create_local_app()
    snapshot = get(restarted, "/v1/sources/linear-algebra/versions/1")
    fixture = Path(__file__).resolve().parents[3] / "packages/contracts/examples/core.json"
    assert snapshot.json() == json.loads(fixture.read_text())["SourceSnapshot"]
    with local_store[0].transaction(local.LOCAL_USER) as tx:
        assert tx.get("session", "session-1")["live_capture"] is False
        assert tx.get("authorization", "state")["generation"] == 1


def test_factory_redacts_database_errors_and_does_not_migrate(local_store, monkeypatch):
    configure(monkeypatch)

    class MissingSchemaStore:
        @contextmanager
        def transaction(self, _user_id):
            raise UndefinedTable("postgresql://sensitive-password@example.invalid/private")
            yield

    monkeypatch.setattr(local, "PostgresStore", lambda _dsn: MissingSchemaStore())
    with pytest.raises(RuntimeError) as error:
        local.create_local_app()
    assert "migration" in str(error.value)
    assert "sensitive-password" not in str(error.value)
    assert TOKEN not in str(error.value)
