"""Portable supervisor/ownership checks; no database, socket or child is opened."""

from copy import deepcopy
import io
import json
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import psycopg
import pytest

from services.api.tests import postgres_desktop_local_check as runner


ACTOR = "lc-windows-http-0123456789abcdef0123456789abcdef"
DSN = "dbname=lc_p0_test host=127.0.0.1 password=portable-secret-marker"
CHECKED = "dbname=lc_p0_test host=127.0.0.1 connect_timeout=5 options='-c statement_timeout=15000'"
READY = {"format": runner.READY_FORMAT, "status": "ready",
         "origin": "http://127.0.0.1:45678", "start_status": "pending"}


def forbidden(*args, **kwargs):
    pytest.fail("portable guard reached an unmocked external boundary")


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    for name in ("LC_TEST_DATABASE_URL", "PGSERVICE", "PGHOSTADDR", "PGPORT"):
        monkeypatch.delenv(name, raising=False)
    for owner, name in ((psycopg, "connect"), (runner.subprocess, "Popen"),
                        (runner.httpx, "Client"), (runner, "run_host_checks"), (runner, "cleanup")):
        monkeypatch.setattr(owner, name, forbidden)
    monkeypatch.setattr(runner, "uuid4", lambda: SimpleNamespace(hex=ACTOR.removeprefix("lc-windows-http-")))
    previous, active = object(), []
    active.append(previous)

    def set_handler(signum, handler):
        assert signum == runner.signal.SIGTERM
        old, active[0] = active[0], handler
        return old

    monkeypatch.setattr(runner.signal, "signal", set_handler)
    yield
    assert active[0] is previous


def preflight(monkeypatch, failure=None):
    calls = []
    monkeypatch.setenv("LC_TEST_DATABASE_URL", DSN)

    def check(name, result):
        def perform(value, *args, **kwargs):
            assert value == (DSN if name == "target" else CHECKED)
            if name == "pristine":
                assert args == (ACTOR,) and kwargs == {"windows": True}
            calls.append(name)
            if failure == name:
                raise ValueError("PRIVATE portable-secret-marker")
            return result
        return perform

    for name, field, result in (("target", "dedicated_test_dsn", CHECKED),
                               ("database", "verify_test_database", "synthetic PostgreSQL"),
                               ("migrations", "verify_migrations", ["0001"]),
                               ("pristine", "verify_pristine_actor", None)):
        monkeypatch.setattr(runner, field, check(name, result))
    return calls


def closed_output(capsys, expected):
    output = capsys.readouterr()
    text = output.out + output.err
    assert expected in text
    assert "portable-secret-marker" not in text and "PRIVATE" not in text
    if expected != "PASS":
        assert "PASS " not in text
    return text


@pytest.mark.parametrize("dsn", [None, "dbname=lc_desktop_preview host=127.0.0.1",
                                 "dbname=lc_p0_test host=example.invalid"])
def test_missing_or_wrong_target_never_connects_or_cleans(monkeypatch, capsys, dsn):
    if dsn is not None:
        monkeypatch.setenv("LC_TEST_DATABASE_URL", dsn + " password=portable-secret-marker")
    for name in ("verify_test_database", "verify_migrations", "verify_pristine_actor"):
        monkeypatch.setattr(runner, name, forbidden)
    assert runner.main() == 2
    closed_output(capsys, "BLOCKED")


def test_disabled_assertions_never_reach_target(monkeypatch, capsys):
    monkeypatch.setenv("LC_TEST_DATABASE_URL", DSN)
    monkeypatch.setattr(runner, "sys", SimpleNamespace(flags=SimpleNamespace(optimize=1), stderr=sys.stderr))
    monkeypatch.setattr(runner, "dedicated_test_dsn", forbidden)
    assert runner.main() == 2
    closed_output(capsys, "BLOCKED")


@pytest.mark.parametrize("failure", ["database", "migrations", "pristine"])
def test_failed_preflight_or_actor_collision_never_claims_cleanup(monkeypatch, capsys, failure):
    calls = preflight(monkeypatch, failure=failure)
    assert runner.main() == 2
    assert calls == ["target", "database", "migrations", "pristine"][:
        ["target", "database", "migrations", "pristine"].index(failure) + 1]
    closed_output(capsys, "BLOCKED")


@pytest.mark.parametrize("outcome", ["success", "failure", "interrupt", "unreaped", "cleanup_failure"])
def test_cleanup_ownership_and_sanitized_results(monkeypatch, capsys, outcome):
    calls = preflight(monkeypatch)

    def run(dsn, actor):
        assert (dsn, actor) == (CHECKED, ACTOR)
        calls.append("run")
        if outcome == "unreaped":
            raise runner.OwnedProcessNotReaped(123456) from KeyboardInterrupt()
        if outcome in ("failure", "interrupt"):
            raise (RuntimeError if outcome == "failure" else KeyboardInterrupt)("PRIVATE portable-secret-marker")
        return {"synthetic": True}

    def cleanup(dsn, actors):
        assert (dsn, actors) == (CHECKED, [ACTOR])
        if outcome == "success":
            assert "PASS" not in capsys.readouterr().out
        calls.append("cleanup")
        if outcome == "cleanup_failure":
            raise RuntimeError("PRIVATE portable-secret-marker")

    monkeypatch.setattr(runner, "run_host_checks", run)
    monkeypatch.setattr(runner, "cleanup", cleanup)
    assert runner.main() == (0 if outcome == "success" else 1)
    assert calls == ["target", "database", "migrations", "pristine", "run"] + (
        [] if outcome == "unreaped" else ["cleanup"])
    output = closed_output(capsys, "PASS" if outcome == "success" else "FAILED")
    if outcome == "unreaped":
        assert ACTOR in output and "123456" in output and "retained" in output


@pytest.mark.parametrize("change", [
    {"origin": "http://example.invalid:45678"}, {"origin": "http://127.0.0.1:8174"},
    {"origin": "http://127.0.0.1:4173"}, {"origin": "http://127.0.0.1:0"},
    {"origin": "http://127.0.0.1:65536"}, {"origin": "http://127.0.0.1:45678/secret"},
    {"start_status": "live"}, {"status": "failed"}, {"token": "portable-secret-marker"},
])
def test_readiness_cannot_redirect_to_other_hosts_or_preview(change):
    with pytest.raises(ValueError):
        runner._ready_record(json.dumps({**READY, **change}).encode() + b"\n")


@pytest.mark.parametrize("raw", [b"{}", b"{}\n{}\n", b"PRIVATE portable-secret-marker\n", b" " * 4097 + b"\n",
    b'{"format":"lc-desktop-capture-host-ready-v1","status":"ready","status":"ready",'
    b'"origin":"http://127.0.0.1:45678","start_status":"pending"}\n'])
def test_malformed_readiness_never_echoes_content(raw):
    with pytest.raises(ValueError) as error:
        runner._ready_record(raw)
    assert "PRIVATE" not in str(error.value) and "portable-secret-marker" not in str(error.value)


@pytest.mark.parametrize("shutdown", ["eof", "term"])
@pytest.mark.parametrize("failure", [False, True, "signal_exit"])
def test_supervised_child_uses_only_open_private_stdin_and_always_reaps(monkeypatch, shutdown, failure):
    config = {"fresh_consent": True, "token": "portable-secret-marker",
              "database_dsn": DSN, "registration": {"original": "unchanged"}}
    before = deepcopy(config)
    monkeypatch.setenv("LC_TEST_DATABASE_URL", DSN)
    monkeypatch.setenv("LC_DATABASE_URL", DSN)
    monkeypatch.setenv("LC_HTTP_CHECK_CONFIG", "portable-secret-marker")
    process = SimpleNamespace(pid=123456, returncode=None, stdin=io.BytesIO(), stdout=io.BytesIO(),
                              terminate=Mock(), kill=forbidden)
    process.poll = lambda: process.returncode
    waits = []

    def wait(*, timeout):
        waits.append(timeout)
        process.returncode = -runner.signal.SIGTERM if failure == "signal_exit" else 0

    process.wait = wait
    popen = Mock(return_value=process)
    client = MagicMock()
    client.__enter__.return_value = client
    connect = Mock(return_value=client)
    monkeypatch.setattr(runner.subprocess, "Popen", popen)
    monkeypatch.setattr(runner.httpx, "Client", connect)
    monkeypatch.setattr(runner, "_wait_ready", lambda child: deepcopy(READY))

    def run():
        with runner._host_process(config, shutdown=shutdown) as (connected, child, ready):
            assert connected is client and child is process and ready == READY
            assert not child.stdin.closed
            data = child.stdin.getvalue()
            assert data.endswith(b"\n") and data.count(b"\n") == 1
            assert json.loads(data) == before
            if failure is True:
                raise RuntimeError("synthetic body failure")

    if failure == "signal_exit":
        with pytest.raises(AssertionError, match="unexpected owned-host output or exit"):
            run()
    elif failure:
        with pytest.raises(RuntimeError, match="synthetic body failure"):
            run()
    else:
        run()
    args, options = popen.call_args.args[0], popen.call_args.kwargs
    assert args == [sys.executable, "-m", "services.api.desktop_local"]
    assert DSN not in repr(args) + repr(options["env"])
    assert "portable-secret-marker" not in repr(args) + repr(options["env"])
    assert options["stdin"] == options["stdout"] == runner.subprocess.PIPE
    assert options.get("start_new_session") is None and "pass_fds" not in options
    assert waits == [8, 5] and process.stdin.closed and process.stdout.closed
    assert process.returncode == (-runner.signal.SIGTERM if failure == "signal_exit" else 0)
    assert process.terminate.call_count == (shutdown == "term")
    connect.assert_called_once_with(base_url=READY["origin"], timeout=3, trust_env=False)
    assert config == before


def test_host_config_keeps_original_registration_and_only_requested_pixel_route():
    c = SimpleNamespace(registration={"device_id": "test-device", "session_id": "test-session",
                                     "stream_id": "test-stream", "membership_revision": 3,
                                     "authorization_generation": 7})
    config = runner._config(DSN, ACTOR, c)
    assert config["registration"] == c.registration and config["registration"] is not c.registration
    assert config["port"] == 0 and config["fresh_consent"] is True
    assert config["enable_windows_ingress"] is True and config["producer_profile"] == "desktop_pixels"
    assert not any(config[field] for field in ("enable_raw_ingress", "enable_desktop_ingress", "enable_macos_ingress"))
    assert set(config["capabilities"]) == runner.CAPABILITIES
    assert len(config["capabilities"]) == len(set(config["capabilities"]))
    assert config["expires_at"].endswith("Z")


def test_actual_runner_inputs_validate_without_target_database_or_child():
    from services.api.desktop_local import parse_startup

    c = runner.scenario(ACTOR, windows=True)
    c.batch["records"][0].update(sequence=1, causal_parents=[])
    config = runner._config(CHECKED, ACTOR, c)
    parsed = parse_startup(json.dumps(config).encode("utf-8") + b"\n")
    assert parsed["registration"] == c.registration
    assert parsed["database_dsn"] == CHECKED and parsed["capabilities"] == runner.CAPABILITIES
    runner.windows_capture_ingress.validate_frame_batch(c.envelope, user_id=ACTOR)
