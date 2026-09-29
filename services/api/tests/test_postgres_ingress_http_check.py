"""Portable runner guards; all database and execution boundaries are replaced.

These tests neither read a configured DSN nor establish PostgreSQL/HTTP evidence.
"""

from contextlib import contextmanager
from hashlib import sha256
import sys
from types import SimpleNamespace

import psycopg
from psycopg.conninfo import conninfo_to_dict
import pytest

from services.api.tests import postgres_ingress_http_check as runner


RAW_DSN = "dbname=lc_p0_test host=127.0.0.1 password=portable-secret-marker"
CHECKED_DSN = "dbname=lc_p0_test host=127.0.0.1 connect_timeout=5 options='-c statement_timeout=15000'"
ACTOR = "lc-ingress-http-0123456789abcdef0123456789abcdef"


def forbidden(*args, **kwargs):
    pytest.fail("portable guard test reached an unmocked database or mutation boundary")


@pytest.fixture(autouse=True)
def isolated_environment_and_database(monkeypatch):
    for name in ("LC_TEST_DATABASE_URL", "PGSERVICE", "PGHOSTADDR", "PGPORT"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(psycopg, "connect", forbidden)
    monkeypatch.setattr(runner, "run_http_checks", forbidden)
    monkeypatch.setattr(runner, "cleanup", forbidden)
    monkeypatch.setattr(runner, "uuid4", forbidden)
    previous = object()
    active = [previous]

    def set_handler(signum, handler):
        assert signum == runner.signal.SIGTERM
        old, active[0] = active[0], handler
        return old

    monkeypatch.setattr(runner.signal, "signal", set_handler)
    yield
    assert active[0] is previous, "runner must restore the previous signal handler"


def successful_preflight(monkeypatch, *, failure=None):
    calls = []
    monkeypatch.setenv("LC_TEST_DATABASE_URL", RAW_DSN)

    def check(name, incoming, outgoing):
        def perform(value):
            assert value == incoming
            calls.append(name)
            if failure == name:
                raise RuntimeError("PRIVATE portable-secret-marker synthetic failure")
            return outgoing
        return perform

    monkeypatch.setattr(runner, "dedicated_test_dsn", check("target", RAW_DSN, CHECKED_DSN))
    monkeypatch.setattr(runner, "verify_test_database", check("database", CHECKED_DSN, "synthetic PostgreSQL"))
    monkeypatch.setattr(runner, "verify_migrations", check("migrations", CHECKED_DSN, ["0001", "0002"]))
    return calls


def actor_factory(monkeypatch, calls):
    def generate():
        calls.append("actor")
        return SimpleNamespace(hex=ACTOR.removeprefix("lc-ingress-http-"))
    monkeypatch.setattr(runner, "uuid4", generate)


def closed_output(capsys, expected):
    output = capsys.readouterr()
    combined = output.out + output.err
    assert expected in combined
    assert "PASS" not in combined
    assert "portable-secret-marker" not in combined
    assert "PRIVATE" not in combined
    return output


def test_absent_dsn_is_blocked_before_any_preflight_or_actor(monkeypatch, capsys):
    for name in ("dedicated_test_dsn", "verify_test_database", "verify_migrations"):
        monkeypatch.setattr(runner, name, forbidden)
    assert runner.main() == 2
    closed_output(capsys, "BLOCKED")


def test_disabled_assertions_are_blocked_before_any_database_or_actor(monkeypatch, capsys):
    monkeypatch.setenv("LC_TEST_DATABASE_URL", RAW_DSN)
    monkeypatch.setattr(runner, "sys", SimpleNamespace(flags=SimpleNamespace(optimize=1), stderr=sys.stderr))
    for name in ("dedicated_test_dsn", "verify_test_database", "verify_migrations"):
        monkeypatch.setattr(runner, name, forbidden)
    assert runner.main() == 2
    closed_output(capsys, "BLOCKED")


@pytest.mark.parametrize("dsn", ["dbname=production host=127.0.0.1",
                                 "dbname=lc_p0_test host=example.invalid"])
def test_non_dedicated_target_is_blocked_before_connection_or_cleanup(monkeypatch, capsys, dsn):
    monkeypatch.setenv("LC_TEST_DATABASE_URL", dsn + " password=portable-secret-marker")
    monkeypatch.setattr(runner, "verify_test_database", forbidden)
    monkeypatch.setattr(runner, "verify_migrations", forbidden)
    assert runner.main() == 2
    closed_output(capsys, "BLOCKED")


@pytest.mark.parametrize("failure,expected", [("database", ["target", "database"]),
    ("migrations", ["target", "database", "migrations"])])
def test_failed_read_only_preflight_never_creates_or_cleans_an_actor(monkeypatch, capsys, failure, expected):
    calls = successful_preflight(monkeypatch, failure=failure)
    assert runner.main() == 2
    assert calls == expected
    closed_output(capsys, "BLOCKED")


@pytest.mark.parametrize("failure", [RuntimeError, KeyboardInterrupt])
def test_runner_failure_still_cleans_exactly_its_unique_actor(monkeypatch, capsys, failure):
    calls = successful_preflight(monkeypatch)
    actor_factory(monkeypatch, calls)

    def run(dsn, actor):
        assert (dsn, actor) == (CHECKED_DSN, ACTOR)
        calls.append("run")
        raise failure("PRIVATE portable-secret-marker failed after actor write")

    def cleanup(dsn, actors):
        assert dsn == CHECKED_DSN and actors == [ACTOR]
        calls.append("cleanup")

    monkeypatch.setattr(runner, "run_http_checks", run)
    monkeypatch.setattr(runner, "cleanup", cleanup)
    assert runner.main() == 1
    assert calls == ["target", "database", "migrations", "actor", "run", "cleanup"]
    closed_output(capsys, "FAIL")


@pytest.mark.parametrize("run_fails", [False, True])
def test_cleanup_failure_cannot_report_pass_even_when_http_checks_succeed(monkeypatch, capsys, run_fails):
    calls = successful_preflight(monkeypatch)
    actor_factory(monkeypatch, calls)

    def run(dsn, actor):
        assert (dsn, actor) == (CHECKED_DSN, ACTOR)
        calls.append("run")
        if run_fails:
            raise RuntimeError("PRIVATE portable-secret-marker runner failure")
        return {"checks": ["synthetic portable result"]}

    def cleanup(dsn, actors):
        assert dsn == CHECKED_DSN and actors == [ACTOR]
        calls.append("cleanup")
        raise RuntimeError("PRIVATE portable-secret-marker cleanup failure")

    monkeypatch.setattr(runner, "run_http_checks", run)
    monkeypatch.setattr(runner, "cleanup", cleanup)
    assert runner.main() == 1
    assert calls == ["target", "database", "migrations", "actor", "run", "cleanup"]
    closed_output(capsys, "FAIL")


def test_success_is_reported_only_after_exact_actor_cleanup(monkeypatch, capsys):
    calls = successful_preflight(monkeypatch)
    actor_factory(monkeypatch, calls)

    def run(dsn, actor):
        assert (dsn, actor) == (CHECKED_DSN, ACTOR)
        calls.append("run")
        return {"checks": ["synthetic portable result"]}

    def cleanup(dsn, actors):
        assert dsn == CHECKED_DSN and actors == [ACTOR]
        output = capsys.readouterr()
        assert "PASS" not in output.out + output.err
        calls.append("cleanup")

    monkeypatch.setattr(runner, "run_http_checks", run)
    monkeypatch.setattr(runner, "cleanup", cleanup)
    assert runner.main() == 0
    assert calls == ["target", "database", "migrations", "actor", "run", "cleanup"]
    output = capsys.readouterr()
    assert "PASS" in output.out
    assert "synthetic portable result" in output.out
    assert "portable-secret-marker" not in output.out + output.err


def test_termination_handler_uses_normal_stack_unwinding():
    with pytest.raises(KeyboardInterrupt):
        runner._interrupt(runner.signal.SIGTERM, None)


@pytest.fixture
def migration_ledger(monkeypatch, tmp_path):
    contents = {"0002_second": b"-- synthetic second migration\nSELECT 2;\n",
                "0001_first": b"-- synthetic first migration\nSELECT 1;\n"}
    for version, data in contents.items():
        (tmp_path / (version + ".up.sql")).write_bytes(data)
    # A rollback file is not an applied forward migration or an extra version.
    (tmp_path / "0001_first.down.sql").write_text("-- synthetic rollback\n")
    monkeypatch.setattr(runner, "MIGRATIONS", tmp_path)
    return [(version, sha256(data).hexdigest()) for version, data in contents.items()]


def install_read_only_ledger(monkeypatch, rows, *, failure=False, tables=("lc_backend.actors", "lc_backend.documents")):
    activity = []

    class Connection:
        def execute(self, query, *args):
            normalized = " ".join(query.split()).rstrip(";").lower()
            assert args == ()
            if normalized == "select version, sha256 from lc_backend.schema_migrations":
                activity.append("read_ledger")
                if failure:
                    raise RuntimeError("synthetic unavailable migration ledger")
                return SimpleNamespace(fetchall=lambda: rows)
            assert normalized == "select to_regclass('lc_backend.actors'), to_regclass('lc_backend.documents')"
            activity.append("read_tables")
            return SimpleNamespace(fetchone=lambda: tables)

    @contextmanager
    def connect(dsn, **kwargs):
        assert dsn == CHECKED_DSN
        parameters = {**conninfo_to_dict(dsn), **kwargs}
        assert "default_transaction_read_only=on" in parameters.get("options", "")
        assert "statement_timeout=15000" in parameters["options"]
        activity.append("connect")
        try:
            yield Connection()
        finally:
            activity.append("closed")

    monkeypatch.setattr(psycopg, "connect", connect)
    return activity


def test_verified_migration_versions_are_sorted_and_checked_without_writes(monkeypatch, migration_ledger):
    activity = install_read_only_ledger(monkeypatch, migration_ledger)
    assert runner.verify_migrations(CHECKED_DSN) == ["0001_first", "0002_second"]
    assert activity == ["connect", "read_ledger", "read_tables", "closed"]


@pytest.mark.parametrize("failure", ["missing", "mismatch", "unknown", "unavailable", "tables"])
def test_migration_preflight_rejects_unready_ledger_without_applying_changes(monkeypatch, migration_ledger, failure):
    rows = list(migration_ledger)
    if failure == "missing":
        rows.pop()
    elif failure == "mismatch":
        rows[0] = (rows[0][0], "0" * 64)
    elif failure == "unknown":
        rows.append(("9999_unknown", "0" * 64))
    activity = install_read_only_ledger(monkeypatch, rows, failure=failure == "unavailable",
                                       tables=("lc_backend.actors", None) if failure == "tables" else ("actors", "documents"))
    with pytest.raises(RuntimeError):
        runner.verify_migrations(CHECKED_DSN)
    expected = ["connect", "read_ledger"]
    if failure != "unavailable":
        expected.append("read_tables")
    assert activity == expected + ["closed"]
