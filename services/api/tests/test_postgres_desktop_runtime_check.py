"""Portable checks of the desktop runner's new ownership and child wiring.

All database, socket and process boundaries are replaced. These checks are not
PostgreSQL persistence, native capture or API-process restart evidence.
"""

from contextlib import contextmanager
from copy import deepcopy
import json
from types import SimpleNamespace
from unittest.mock import Mock, MagicMock

import psycopg
import pytest

from services.api.tests import postgres_desktop_runtime_check as desktop
from services.api.tests import postgres_http_check as supervisor
from services.api.tests import postgres_ingress_http_check as runner
from services.api.tests import test_postgres_ingress_http_check as guards


ACTOR = "lc-desktop-http-0123456789abcdef0123456789abcdef"
CHECKED_DSN = guards.CHECKED_DSN
isolated_environment_and_database = guards.isolated_environment_and_database


@pytest.fixture(autouse=True)
def no_external_boundaries(monkeypatch, isolated_environment_and_database):
    for owner, name in ((supervisor.socket, "socket"), (supervisor.subprocess, "Popen"),
                        (supervisor.httpx, "Client"), (supervisor, "_serve_app"),
                        (desktop, "PostgresStore"), (desktop, "create_local_capture_runtime"),
                        (desktop, "run_desktop_checks")):
        monkeypatch.setattr(owner, name, guards.forbidden)


def desktop_preflight(monkeypatch):
    calls = guards.successful_preflight(monkeypatch)

    def actor():
        calls.append("actor")
        return SimpleNamespace(hex=ACTOR.removeprefix("lc-desktop-http-"))

    monkeypatch.setattr(runner, "uuid4", actor)
    return calls


@pytest.mark.parametrize("dsn", [None, "dbname=lc_desktop_preview host=127.0.0.1",
                                 "dbname=lc_p0_test host=example.invalid"])
def test_desktop_target_refusal_precedes_actor_and_cleanup(monkeypatch, capsys, dsn):
    if dsn is not None:
        monkeypatch.setenv("LC_TEST_DATABASE_URL", dsn + " password=portable-secret-marker")
    for name in ("verify_test_database", "verify_migrations"):
        monkeypatch.setattr(runner, name, guards.forbidden)
    monkeypatch.setattr(desktop, "verify_pristine_actor", guards.forbidden)
    assert runner.main(desktop_runtime=True) == 2
    guards.closed_output(capsys, "BLOCKED")


@pytest.mark.parametrize("failure", ["database", "migrations"])
def test_desktop_failed_preflight_does_not_claim_actor(monkeypatch, capsys, failure):
    calls = guards.successful_preflight(monkeypatch, failure=failure)
    monkeypatch.setattr(desktop, "verify_pristine_actor", guards.forbidden)
    assert runner.main(desktop_runtime=True) == 2
    assert calls == ["target", "database"] + (["migrations"] if failure == "migrations" else [])
    guards.closed_output(capsys, "BLOCKED")


def test_collision_is_checked_read_only_and_never_claimed_for_cleanup(monkeypatch, capsys):
    calls = desktop_preflight(monkeypatch)

    @contextmanager
    def connect(dsn, **options):
        assert dsn == CHECKED_DSN and options["autocommit"] is True
        assert "default_transaction_read_only=on" in options["options"]

        def execute(query, params):
            assert " ".join(query.split()) == (
                "SELECT EXISTS (SELECT 1 FROM lc_backend.actors WHERE user_id = %s) "
                "OR EXISTS (SELECT 1 FROM lc_backend.documents WHERE user_id = %s)")
            assert params == (ACTOR, ACTOR)
            calls.append("pristine")
            return SimpleNamespace(fetchone=lambda: (True,))

        yield SimpleNamespace(execute=execute)

    monkeypatch.setattr(psycopg, "connect", connect)
    assert runner.main(desktop_runtime=True) == 2
    assert calls == ["target", "database", "migrations", "actor", "pristine"]
    guards.closed_output(capsys, "unique pristine desktop actor")


@pytest.mark.parametrize("outcome", ["unreaped", "cleanup_failure", "success"])
def test_desktop_dispatch_preserves_cleanup_ownership_and_pass_order(monkeypatch, capsys, outcome):
    calls = desktop_preflight(monkeypatch)

    def pristine(dsn, actor):
        assert (dsn, actor) == (CHECKED_DSN, ACTOR)
        calls.append("pristine")

    def run(dsn, actor):
        assert (dsn, actor) == (CHECKED_DSN, ACTOR)
        calls.append("desktop")
        if outcome == "unreaped":
            raise supervisor.OwnedProcessNotReaped(123456) from KeyboardInterrupt()
        return {"checks": ["synthetic portable desktop result"]}

    def cleanup(dsn, actors):
        assert (dsn, actors) == (CHECKED_DSN, [ACTOR])
        assert "PASS" not in capsys.readouterr().out
        calls.append("cleanup")
        if outcome == "cleanup_failure":
            raise RuntimeError("PRIVATE portable-secret-marker")

    monkeypatch.setattr(desktop, "verify_pristine_actor", pristine)
    monkeypatch.setattr(desktop, "run_desktop_checks", run)
    monkeypatch.setattr(runner, "cleanup", cleanup)
    assert runner.main(desktop_runtime=True) == (0 if outcome == "success" else 1)
    assert calls == ["target", "database", "migrations", "actor", "pristine", "desktop"] + (
        [] if outcome == "unreaped" else ["cleanup"])
    if outcome == "success":
        assert "PASS" in capsys.readouterr().out
    else:
        output = guards.closed_output(capsys, "FAILED")
        if outcome == "unreaped":
            assert ACTOR in output.err and "123456" in output.err and "cleanup withheld" in output.err


@pytest.mark.parametrize("fresh", [True, False])
def test_child_runtime_forwards_original_pins_and_explicit_consent(monkeypatch, fresh):
    config = {"actor": ACTOR, "fresh_consent": fresh, "registration": {
        "device_id": "synthetic-device", "session_id": "synthetic-session",
        "stream_id": "synthetic-stream", "authorization_generation": 7, "membership_revision": 9},
        "token": "portable-synthetic-token", "expires_at": "2030-01-01T00:00:00+00:00"}
    before, calls, store = deepcopy(config), [], object()
    monkeypatch.setattr(desktop, "dedicated_test_dsn", lambda value: CHECKED_DSN)
    for name in ("verify_test_database", "verify_migrations", "verify_pristine_actor"):
        def checked(dsn, *args, label=name):
            assert dsn == CHECKED_DSN
            assert args == ((ACTOR,) if label == "verify_pristine_actor" else ())
            calls.append(label)
        monkeypatch.setattr(desktop, name, checked)
    monkeypatch.setattr(desktop, "PostgresStore", lambda dsn: store if dsn == CHECKED_DSN else guards.forbidden())

    def build(**kwargs):
        assert kwargs["store"] is store
        assert kwargs["user_id"] == ACTOR
        assert kwargs["registration"] == before["registration"]
        assert kwargs["fresh_consent"] is fresh and kwargs["enable_desktop_ingress"] is True
        assert "enable_raw_ingress" not in kwargs
        assert kwargs["token"] == config["token"]
        calls.append("build")
        return SimpleNamespace(start_status="pending" if fresh else "consumed",
            app=SimpleNamespace(state=SimpleNamespace(paid_executor_enabled=False)))

    monkeypatch.setattr(desktop, "create_local_capture_runtime", build)
    desktop.runtime_for_check("synthetic input", config)
    assert calls == ["verify_test_database", "verify_migrations"] + (
        ["verify_pristine_actor"] if fresh else []) + ["build"]
    assert config == before


def test_child_dispatch_keeps_reopen_consent_false(monkeypatch):
    config = {"app_kind": "desktop_runtime", "actor": ACTOR, "fresh_consent": False}
    monkeypatch.setenv("LC_ENABLE_LOCAL_TEST_AUTH", "1")
    monkeypatch.setenv("LC_TEST_DATABASE_URL", CHECKED_DSN)
    monkeypatch.setenv("LC_HTTP_CHECK_CONFIG", json.dumps(config))
    app = object()

    def runtime(dsn, incoming):
        assert dsn == CHECKED_DSN and incoming == config and incoming["fresh_consent"] is False
        return SimpleNamespace(app=app)

    serve = Mock()
    monkeypatch.setattr(desktop, "runtime_for_check", runtime)
    monkeypatch.setattr(supervisor, "_serve_app", serve)
    supervisor._serve()
    serve.assert_called_once_with(app)


@pytest.mark.parametrize("status,version,accepted", [(401, "0.2.1", True),
    (200, "0.2.1", False), (401, "0.2.4", False)])
def test_supervisor_requires_exact_unauthenticated_control_readiness(monkeypatch, status, version, accepted):
    config = {"app_kind": "desktop_runtime", "actor": ACTOR, "fresh_consent": False,
              "registration": {"stream_id": "synthetic-stream"}}
    listener = MagicMock()
    listener.__enter__.return_value = listener
    listener.getsockname.return_value = ("127.0.0.1", 45678)
    listener.fileno.return_value = 7
    client = MagicMock()
    client.__enter__.return_value = client
    client.get.return_value = SimpleNamespace(status_code=status, json=lambda: {
        "contract_version": version, "error": "unauthenticated", "retryable": False})
    process = SimpleNamespace(pid=123456, returncode=None, terminate=Mock(), kill=guards.forbidden)
    process.poll = lambda: process.returncode

    def wait(*, timeout):
        assert timeout == 5
        process.returncode = 0

    process.wait = wait
    popen, connect = Mock(return_value=process), Mock(return_value=client)
    monkeypatch.setattr(supervisor.socket, "socket", lambda: listener)
    monkeypatch.setattr(supervisor.subprocess, "Popen", popen)
    monkeypatch.setattr(supervisor.httpx, "Client", connect)
    ticks = iter([0, 0, 20])
    monkeypatch.setattr(supervisor.time, "monotonic", lambda: next(ticks))
    monkeypatch.setattr(supervisor.time, "sleep", lambda duration: None)
    entered = []

    def run():
        with supervisor._api_process(CHECKED_DSN, config) as pair:
            entered.append(pair)

    if accepted:
        run()
        assert entered == [(client, process)]
    else:
        with pytest.raises(AssertionError, match="readiness timed out"):
            run()
        assert entered == []
    assert process.returncode == 0
    process.terminate.assert_called_once_with()
    listener.bind.assert_called_once_with(("127.0.0.1", 0))
    client.get.assert_called_once_with("/v2/process/streams/synthetic-stream")
    connect.assert_called_once_with(base_url="http://127.0.0.1:45678", timeout=2, trust_env=False)
    assert popen.call_args.kwargs["pass_fds"] == (7,)
    assert json.loads(popen.call_args.kwargs["env"]["LC_HTTP_CHECK_CONFIG"]) == config
    assert CHECKED_DSN not in repr(popen.call_args.args)
