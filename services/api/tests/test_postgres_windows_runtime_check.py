"""Portable Windows runner guards with all external boundaries replaced.

No configured DSN is read, and no database, socket, process or native capture is
used. These checks protect the separate opt-in durable acceptance run.
"""

from contextlib import contextmanager
from copy import deepcopy
from hashlib import sha256
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import psycopg
import pytest

from packages.contracts import windows_capture_ingress as wire
from services.api.tests import postgres_desktop_runtime_check as desktop
from services.api.tests import postgres_http_check as supervisor
from services.api.tests import postgres_ingress_http_check as runner
from services.api.tests import test_postgres_ingress_http_check as guards


ACTOR = "lc-windows-http-0123456789abcdef0123456789abcdef"
DESKTOP_ACTOR = "lc-desktop-http-0123456789abcdef0123456789abcdef"
CHECKED_DSN = guards.CHECKED_DSN
isolated_environment_and_database = guards.isolated_environment_and_database


@pytest.fixture(autouse=True)
def no_external_boundaries(monkeypatch, isolated_environment_and_database):
    for owner, name in ((supervisor.socket, "socket"), (supervisor.subprocess, "Popen"),
                        (supervisor.httpx, "Client"), (supervisor, "_serve_app"),
                        (desktop, "PostgresStore"), (desktop, "create_local_capture_runtime"),
                        (desktop, "run_desktop_checks")):
        monkeypatch.setattr(owner, name, guards.forbidden)


def windows_preflight(monkeypatch):
    calls = guards.successful_preflight(monkeypatch)

    def actor():
        calls.append("actor")
        return SimpleNamespace(hex=ACTOR.removeprefix("lc-windows-http-"))

    monkeypatch.setattr(runner, "uuid4", actor)
    return calls


@pytest.mark.parametrize("dsn", [None, "dbname=production host=127.0.0.1",
    "dbname=lc_desktop_preview host=127.0.0.1", "dbname=lc_p0_test host=example.invalid"])
def test_windows_target_refusal_precedes_actor_or_cleanup(monkeypatch, capsys, dsn):
    if dsn is not None:
        monkeypatch.setenv("LC_TEST_DATABASE_URL", dsn + " password=portable-secret-marker")
    for name in ("verify_test_database", "verify_migrations"):
        monkeypatch.setattr(runner, name, guards.forbidden)
    monkeypatch.setattr(desktop, "verify_pristine_actor", guards.forbidden)
    assert runner.main(windows_runtime=True) == 2
    guards.closed_output(capsys, "BLOCKED")


def test_two_runtime_modes_are_refused_before_preflight(monkeypatch, capsys):
    monkeypatch.setenv("LC_TEST_DATABASE_URL", guards.RAW_DSN)
    for name in ("dedicated_test_dsn", "verify_test_database", "verify_migrations"):
        monkeypatch.setattr(runner, name, guards.forbidden)
    assert runner.main(desktop_runtime=True, windows_runtime=True) == 2
    guards.closed_output(capsys, "BLOCKED")


def test_windows_actor_collision_is_read_only_and_does_not_grant_cleanup(monkeypatch, capsys):
    calls = windows_preflight(monkeypatch)

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
    assert runner.main(windows_runtime=True) == 2
    assert calls == ["target", "database", "migrations", "actor", "pristine"]
    guards.closed_output(capsys, "BLOCKED")


@pytest.mark.parametrize("outcome", ["unreaped", "cleanup-failure", "success"])
def test_windows_dispatch_preserves_exact_actor_cleanup_ownership(monkeypatch, capsys, outcome):
    calls = windows_preflight(monkeypatch)

    def pristine(dsn, actor, *, windows=False):
        assert (dsn, actor, windows) == (CHECKED_DSN, ACTOR, True)
        calls.append("pristine")

    def run(dsn, actor):
        assert (dsn, actor) == (CHECKED_DSN, ACTOR)
        calls.append("windows")
        if outcome == "unreaped":
            raise supervisor.OwnedProcessNotReaped(123456) from KeyboardInterrupt()
        return {"checks": ["synthetic portable Windows result"]}

    def cleanup(dsn, actors):
        assert (dsn, actors) == (CHECKED_DSN, [ACTOR])
        assert "PASS" not in capsys.readouterr().out
        calls.append("cleanup")
        if outcome == "cleanup-failure":
            raise RuntimeError("PRIVATE portable-secret-marker")

    monkeypatch.setattr(desktop, "verify_pristine_actor", pristine)
    monkeypatch.setattr(desktop, "run_windows_checks", run)
    monkeypatch.setattr(runner, "cleanup", cleanup)
    assert runner.main(windows_runtime=True) == (0 if outcome == "success" else 1)
    assert calls == ["target", "database", "migrations", "actor", "pristine", "windows"] + (
        [] if outcome == "unreaped" else ["cleanup"])
    if outcome == "success":
        assert "PASS" in capsys.readouterr().out
    else:
        output = guards.closed_output(capsys, "FAILED")
        if outcome == "unreaped":
            assert ACTOR in output.err and "123456" in output.err and "cleanup withheld" in output.err


@pytest.mark.parametrize("actor,windows", [(DESKTOP_ACTOR, True), (ACTOR, False),
    ("lc-windows-http-not-a-uuid", True), ("lc-windows-http-" + "A" * 32, True)])
def test_actor_namespace_cannot_cross_runtime_modes(actor, windows):
    with pytest.raises(ValueError):
        desktop._actor(actor, windows=windows)


@pytest.mark.parametrize("app_kind,actor", [("desktop_runtime", ACTOR), ("windows_runtime", DESKTOP_ACTOR),
                                          ("unrecognized_runtime", ACTOR)])
def test_child_rejects_wrong_app_kind_or_actor_before_store_creation(app_kind, actor):
    with pytest.raises(ValueError):
        desktop.runtime_for_check("synthetic input", {"app_kind": app_kind, "actor": actor, "fresh_consent": False})


@pytest.mark.parametrize("fresh", [True, False])
def test_windows_child_preserves_exact_consent_pins_and_explicit_capability(monkeypatch, fresh):
    config = {"app_kind": "windows_runtime", "actor": ACTOR, "fresh_consent": fresh,
              "registration": {"device_id": "synthetic-device", "session_id": "synthetic-session",
                               "stream_id": "synthetic-stream", "authorization_generation": 7,
                               "membership_revision": 9},
              "token": "portable-synthetic-token", "expires_at": "2030-01-01T00:00:00+00:00"}
    before, calls, store = deepcopy(config), [], object()
    monkeypatch.setattr(desktop, "dedicated_test_dsn", lambda value: CHECKED_DSN)
    for name in ("verify_test_database", "verify_migrations", "verify_pristine_actor"):
        def checked(dsn, *args, windows=False, label=name):
            assert dsn == CHECKED_DSN
            assert args == ((ACTOR,) if label == "verify_pristine_actor" else ())
            assert windows is (label == "verify_pristine_actor")
            calls.append(label)
        monkeypatch.setattr(desktop, name, checked)
    monkeypatch.setattr(desktop, "PostgresStore", lambda dsn: store if dsn == CHECKED_DSN else guards.forbidden())

    def build(**kwargs):
        assert kwargs["store"] is store and kwargs["user_id"] == ACTOR
        assert kwargs["registration"] == before["registration"]
        assert kwargs["fresh_consent"] is fresh
        assert kwargs["enable_windows_ingress"] is True and kwargs["enable_desktop_ingress"] is False
        assert kwargs.get("enable_raw_ingress", False) is False
        assert kwargs["capabilities"] == frozenset({"process.control.v0.2.1", "process.capture.v0.2",
                                                  "process.ingress.v0.2.4", wire.CAPABILITY})
        assert kwargs["producer_id"] == "synthetic-windows-postgres"
        assert kwargs["producer_profile"] == "desktop_pixels"
        assert kwargs["token"] == config["token"]
        calls.append("build")
        return SimpleNamespace(start_status="pending" if fresh else "consumed",
                               app=SimpleNamespace(state=SimpleNamespace(paid_executor_enabled=False)))

    monkeypatch.setattr(desktop, "create_local_capture_runtime", build)
    desktop.runtime_for_check("synthetic input", config)
    assert calls == ["verify_test_database", "verify_migrations"] + (
        ["verify_pristine_actor"] if fresh else []) + ["build"]
    assert config == before


def test_windows_child_dispatch_keeps_reopen_consent_false(monkeypatch):
    config = {"app_kind": "windows_runtime", "actor": ACTOR, "fresh_consent": False}
    monkeypatch.setenv("LC_ENABLE_LOCAL_TEST_AUTH", "1")
    monkeypatch.setenv("LC_TEST_DATABASE_URL", CHECKED_DSN)
    monkeypatch.setenv("LC_HTTP_CHECK_CONFIG", json.dumps(config))
    app, serve = object(), Mock()

    def runtime(dsn, incoming):
        assert dsn == CHECKED_DSN and incoming == config and incoming["fresh_consent"] is False
        return SimpleNamespace(app=app)

    monkeypatch.setattr(desktop, "runtime_for_check", runtime)
    monkeypatch.setattr(supervisor, "_serve_app", serve)
    supervisor._serve()
    serve.assert_called_once_with(app)


@pytest.mark.parametrize("status,version,accepted", [(401, "0.2.1", True),
    (200, "0.2.1", False), (401, "0.2.10", False)])
def test_windows_supervisor_requires_control_readiness_before_entering(monkeypatch, status, version, accepted):
    config = {"app_kind": "windows_runtime", "actor": ACTOR, "fresh_consent": False,
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


def test_windows_check_reuses_existing_supervised_runner(monkeypatch):
    result = {"portable": True}
    shared = Mock(return_value=result)
    monkeypatch.setattr(desktop, "run_desktop_checks", shared)
    assert desktop.run_windows_checks(CHECKED_DSN, ACTOR) is result
    shared.assert_called_once_with(CHECKED_DSN, ACTOR, windows=True)


def test_windows_scenario_has_two_distinct_originals_editable_ink_and_first_gap():
    c = desktop.scenario(ACTOR, windows=True)
    wire.validate_frame_batch(c.envelope, user_id=ACTOR)
    wire.validate_frame_batch(c.first_gap, user_id=ACTOR)
    assert c.envelope["contract_version"] == c.first_gap["contract_version"] == "0.2.10"
    frame = c.envelope["frames"][0]
    assert frame["contract_version"] == "0.2.9" and frame["profile"]["kind"] == "windows_electron"
    assert frame["raw"]["artifact"] == c.ref
    assert frame["composed"]["image"]["artifact"] == c.composed_ref
    assert c.data != c.composed_data
    assert len({frame["raw"]["artifact"]["artifact_id"], frame["composed"]["image"]["artifact"]["artifact_id"]}) == 2
    for ref, data in ((c.ref, c.data), (c.composed_ref, c.composed_data), (c.ink_ref, c.ink_data)):
        assert ref["sha256"] == sha256(data).hexdigest() and ref["byte_length"] == len(data)
    assert c.data.startswith(b"\x89PNG\r\n\x1a\n") and c.composed_data.startswith(b"\x89PNG\r\n\x1a\n")
    assert c.ink_ref["artifact_id"] not in {c.ref["artifact_id"], c.composed_ref["artifact_id"]}
    record = c.envelope["batch"]["records"][0]
    assert record["artifacts"] == [c.ref, c.composed_ref, c.ink_ref]
    assert all(record[name] is None for name in ("clock", "observed_at", "media_position"))
    gap = c.first_gap["batch"]["records"][0]
    assert gap["frame_id"] is None and gap["artifacts"] == [] and c.first_gap["frames"] == []
    assert gap["evidence"]["kind"] == "coverage" and gap["evidence"]["coverage"] in {"unknown", "unobserved", "partial"}
    assert record["causal_parents"] == [gap["record_id"]]
    assert record["sequence"] > gap["sequence"]
    assert not any(hasattr(c, name) for name in ("store", "archive", "registry"))
