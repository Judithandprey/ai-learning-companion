"""Runner preflight tests; these do not claim PostgreSQL execution."""

from contextlib import contextmanager

import psycopg
from psycopg.conninfo import conninfo_to_dict
import pytest

from services.api.tests import postgres_check as runner


@pytest.fixture(autouse=True)
def isolated_connection_environment(monkeypatch):
    for name in ("PGSERVICE", "PGHOSTADDR", "PGPORT", "LC_TEST_DATABASE_URL"):
        monkeypatch.delenv(name, raising=False)


@pytest.mark.parametrize("dsn", [
    "dbname=production host=127.0.0.1", "host=127.0.0.1", "dbname=lc_p0_test",
    "dbname=lc_p0_test host=example.invalid", "dbname=lc_p0_test host=127.0.0.1,::1",
    "dbname=lc_p0_test host=127.0.0.1 hostaddr=192.0.2.1",
    "dbname=lc_p0_test host=127.0.0.1 service=production",
    "dbname=lc_p0_test host=127.0.0.1 port=5432,5433",
    "postgresql://127.0.0.1/production", "not a valid connection string",
])
def test_rejected_target_never_connects_migrates_or_cleans(monkeypatch, capsys, dsn):
    def forbidden(*args, **kwargs):
        pytest.fail("rejected DSN reached a database or mutation path")

    monkeypatch.setenv("LC_TEST_DATABASE_URL", dsn + " password=secret-marker")
    for name in ("migrate", "run_storage_checks", "cleanup"):
        monkeypatch.setattr(runner, name, forbidden)
    monkeypatch.setattr(psycopg, "connect", forbidden)
    assert runner.main() == 2
    output = capsys.readouterr()
    assert "dedicated local lc_p0_test validation failed" in output.err
    assert "secret-marker" not in output.err + output.out


@pytest.mark.parametrize("variable", ["PGSERVICE", "PGHOSTADDR"])
def test_inherited_indirect_target_is_rejected(monkeypatch, variable):
    monkeypatch.setenv(variable, "indirect-target")
    with pytest.raises(ValueError):
        runner.dedicated_test_dsn("dbname=lc_p0_test host=127.0.0.1")


@pytest.mark.parametrize("host", ["127.0.0.1", "::1", "localhost", "/tmp/test-socket"])
def test_explicit_local_target_has_bounded_test_connections(monkeypatch, host):
    monkeypatch.setenv("PGHOST", "example.invalid")
    monkeypatch.setenv("PGDATABASE", "production")
    monkeypatch.setenv("PGOPTIONS", "-c statement_timeout=0")
    params = conninfo_to_dict(runner.dedicated_test_dsn(f"dbname=lc_p0_test host={host}"))
    assert params["dbname"] == "lc_p0_test" and params["host"] == host
    assert params["connect_timeout"] == "5"
    assert "statement_timeout=15000" in params["options"]
    assert "lock_timeout=10000" in params["options"]


@pytest.mark.parametrize("database,address", [("production", "127.0.0.1"), ("lc_p0_test", "192.0.2.1")])
def test_actual_target_mismatch_is_read_only_and_never_cleans(monkeypatch, capsys, database, address):
    class Connection:
        def execute(self, query):
            assert query.startswith("SELECT current_database()")
            return self

        def fetchone(self):
            return database, address, "test-version"

    @contextmanager
    def connect(dsn, **kwargs):
        assert kwargs["autocommit"] is True
        assert "default_transaction_read_only=on" in kwargs["options"]
        yield Connection()

    def forbidden(*args, **kwargs):
        pytest.fail("mismatched actual target reached a mutation path")

    monkeypatch.setenv("LC_TEST_DATABASE_URL", "dbname=lc_p0_test host=127.0.0.1")
    monkeypatch.setattr(psycopg, "connect", connect)
    monkeypatch.setattr(runner, "run_storage_checks", forbidden)
    monkeypatch.setattr(runner, "cleanup", forbidden)
    assert runner.main() == 2
    assert "BLOCKED" in capsys.readouterr().err


def test_missing_dsn_is_blocked_without_cleanup(monkeypatch, capsys):
    monkeypatch.setattr(runner, "cleanup", lambda *args: pytest.fail("unexpected cleanup"))
    assert runner.main() == 2
    assert "LC_TEST_DATABASE_URL is absent" in capsys.readouterr().err
