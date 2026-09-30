"""Portable private-pipe host checks; no real DSN, native capture or provider.

Any live listener below belongs to a bounded synthetic child and is reaped in a
finally block. PostgreSQL and real desktop/runtime acceptance remain separate.
"""

from copy import deepcopy
from contextlib import contextmanager
from datetime import datetime, timezone
import http.client
import json
import os
from pathlib import Path
import queue
import re
import signal
import socket
import subprocess
import sys
import threading
import time

import pytest

from services.api import desktop_local as host
from services.api.capture_runtime import LOCAL_CAPABILITIES, LOCAL_SCOPES

ROOT = Path(__file__).resolve().parents[3]
TOKEN = "synthetic-desktop-host-token-" + "x" * 40
DSN = "postgresql://synthetic:DO-NOT-LOG-TEST-PASSWORD@127.0.0.1:1/never-open"
FORMAT = "lc-desktop-capture-host-v1"
FLAGS = ("enable_raw_ingress", "enable_desktop_ingress", "enable_windows_ingress", "enable_macos_ingress")


@pytest.fixture
def startup():
    registration = json.loads((ROOT / "packages/contracts/process_control/examples/stop.json").read_text())["registration"]
    return {"format": FORMAT, "port": 0, "database_dsn": DSN,
            "user_id": "synthetic-local-host-user", "device_id": registration["device_id"],
            "session_id": registration["session_id"], "producer_id": "synthetic-desktop-producer",
            "registration": registration, "token": TOKEN, "expires_at": "2099-01-02T03:04:05Z",
            "scopes": sorted(LOCAL_SCOPES), "capabilities": sorted(LOCAL_CAPABILITIES),
            "fresh_consent": False, "producer_profile": None, **{name: False for name in FLAGS}}


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"


def assert_redacted(output):
    if isinstance(output, bytes):
        output = output.decode("utf-8", "replace")
    assert TOKEN not in output and DSN not in output
    assert "DO-NOT-LOG-TEST-PASSWORD" not in output
    assert "Traceback" not in output


def test_exact_protocol_normalizes_only_expiry_and_authority_collections(startup):
    original = deepcopy(startup)
    value = host.parse_startup(encoded(startup))
    expected = {name: deepcopy(item) for name, item in startup.items() if name != "format"}
    expected.update(expires_at=datetime(2099, 1, 2, 3, 4, 5, tzinfo=timezone.utc),
                    scopes=frozenset(startup["scopes"]), capabilities=frozenset(startup["capabilities"]))
    assert value == expected
    assert value["fresh_consent"] is False
    assert all(value[name] is False for name in FLAGS)
    value["registration"]["stream_id"] = "detached-normalized-copy"
    assert startup == original


def test_every_key_is_required_and_unknown_host_or_authority_is_refused(startup):
    for name in startup:
        changed = deepcopy(startup)
        del changed[name]
        with pytest.raises(ValueError):
            host.parse_startup(encoded(changed))
    for name in ("host", "bind", "authority", "oauth", "environment", "stop_fact_resolver"):
        with pytest.raises(ValueError):
            host.parse_startup(encoded({**startup, name: "untrusted"}))


@pytest.mark.parametrize("field,value", [
    ("format", "other-host-v1"), ("port", True), ("port", 1.0), ("port", -1),
    ("port", 65536), ("port", "8175"), ("database_dsn", ""), ("database_dsn", None),
    ("database_dsn", "x" * 8193), ("user_id", ""), ("device_id", "other-device"),
    ("session_id", "other-session"), ("producer_id", None), ("token", "x" * 31),
    ("token", "x" * 4097), ("token", "x" * 32 + "\n"), ("token", "bearer token " * 4),
    ("expires_at", "2099-01-02T03:04:05"), ("expires_at", "2099-01-02T03:04:05+01:00"),
    ("expires_at", "2000-01-02T03:04:05Z"), ("expires_at", "2099-02-30T03:04:05Z"),
    ("scopes", ["process:control", "process:control"]), ("scopes", "process:control"),
    ("scopes", [True]), ("scopes", []), ("scopes", ["process:control", "account:admin"]),
    ("capabilities", ["process.control.v0.2.1", "process.control.v0.2.1"]),
    ("capabilities", {}), ("capabilities", ["process.control.v0.2.1", "invented"]),
    ("fresh_consent", 1), ("fresh_consent", "true"), ("producer_profile", "structured"),
])
def test_invalid_or_ambiguous_config_values_are_refused(startup, field, value):
    with pytest.raises(ValueError) as exc:
        host.parse_startup(encoded({**startup, field: value}))
    assert_redacted(str(exc.value))


@pytest.mark.parametrize("flag", FLAGS)
@pytest.mark.parametrize("value", [0, 1, None, "false"])
def test_each_ingress_gate_is_an_explicit_boolean(startup, flag, value):
    with pytest.raises(ValueError):
        host.parse_startup(encoded({**startup, flag: value}))


@pytest.mark.parametrize("flag,capability", [
    ("enable_raw_ingress", "process.raw-ingress.v0.2.6"),
    ("enable_desktop_ingress", "process.desktop-ingress.v0.2.8"),
    ("enable_windows_ingress", "process.windows-ingress.v0.2.10"),
    ("enable_macos_ingress", "process.macos-ingress.v0.2.12"),
])
def test_enabled_ingress_requires_exact_capability_capture_scope_and_pixel_profile(startup, flag, capability):
    startup.update(producer_profile="desktop_pixels", **{flag: True})
    assert host.parse_startup(encoded(startup))[flag] is True
    for collection, omitted in (("capabilities", capability), ("capabilities", "process.capture.v0.2"),
                                ("scopes", "process:capture")):
        changed = deepcopy(startup)
        changed[collection].remove(omitted)
        with pytest.raises(ValueError):
            host.parse_startup(encoded(changed))
    if flag != "enable_raw_ingress":
        with pytest.raises(ValueError):
            host.parse_startup(encoded({**startup, "producer_profile": None}))


@pytest.mark.parametrize("change", ["version", "pin", "extra", "continuity"])
def test_registration_remains_exact_released_control_contract(startup, change):
    registration = startup["registration"]
    if change == "version":
        registration["contract_version"] = "0.2.12"
    elif change == "pin":
        registration["membership_revision"] = True
    elif change == "extra":
        registration["fresh_consent"] = True
    else:
        registration["continuity"] = {"kind": "restart"}
    with pytest.raises(ValueError):
        host.parse_startup(encoded(startup))


@pytest.mark.parametrize("location", ["outer", "registration"])
def test_duplicate_members_are_rejected_even_if_last_value_is_valid(startup, location):
    raw = encoded(startup)
    key, value = (b'"port"', b"0") if location == "outer" else (b'"membership_revision"', b"1")
    duplicate = raw.replace(key + b":" + value, key + b":" + value + b"," + key + b":" + value)
    assert json.loads(duplicate) == startup
    with pytest.raises(ValueError):
        host.parse_startup(duplicate)


@pytest.mark.parametrize("raw", [b"", b"\n", b"{}", b"{}\n\n", b"null\n", b"[]\n", b"\xff\n",
                                 b'{"x":NaN}\n', b'{"x":Infinity}\n', b'{"x":-Infinity}\n'])
def test_config_is_one_finite_utf8_json_object_with_one_final_lf(raw):
    with pytest.raises(ValueError):
        host.parse_startup(raw)


def test_byte_limit_includes_lf_and_does_not_accept_mutable_or_text_input(startup):
    raw = encoded(startup)
    exact = b" " * (65536 - len(raw)) + raw
    assert host.parse_startup(exact)["port"] == 0
    for bad in (b" " + exact, bytearray(raw), raw.decode("utf-8"), raw[:-1], raw + b"extra"):
        with pytest.raises(ValueError):
            host.parse_startup(bad)


@pytest.mark.parametrize("port", [0, 1, 65535])
def test_numeric_port_range_does_not_choose_an_interface(startup, port):
    result = host.parse_startup(encoded({**startup, "port": port}))
    assert result["port"] == port and "host" not in result


def test_control_only_authority_is_not_implicitly_expanded(startup):
    startup.update(scopes=["process:control"], capabilities=["process.control.v0.2.1"])
    result = host.parse_startup(encoded(startup))
    assert result["scopes"] == frozenset({"process:control"})
    assert result["capabilities"] == frozenset({"process.control.v0.2.1"})
    assert result["fresh_consent"] is False and result["producer_profile"] is None


def run_cli(data, *arguments, stdin_file=None):
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    # These explicitly synthetic environment assertions must never become setup.
    env.update(LC_DATABASE_URL=DSN, LC_CAPTURE_TOKEN=TOKEN, UVICORN_HOST="0.0.0.0")
    return subprocess.run([sys.executable, "-m", "services.api.desktop_local", *arguments],
                          input=data if stdin_file is None else None, stdin=stdin_file,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, env=env, timeout=8)


@pytest.mark.parametrize("data", [b"not-json\n", b"{}\n", b"\xff\n", b"x" * 65537 + b"\n"],
                         ids=["malformed-json", "missing-fields", "invalid-utf8", "oversized"])
def test_real_cli_refuses_bad_startup_without_readiness_or_secrets(data):
    result = run_cli(data)
    assert result.returncode != 0
    assert result.stdout == b""
    assert_redacted(result.stdout + result.stderr)


@pytest.mark.parametrize("arguments", [("--help",), ("--port", "0"), ("--host", "0.0.0.0")])
def test_real_cli_accepts_no_arguments_or_environment_configuration(startup, arguments):
    result = run_cli(encoded(startup), *arguments)
    assert result.returncode != 0
    assert result.stdout == b""
    assert_redacted(result.stdout + result.stderr)


def test_regular_file_stdin_is_refused_before_database_or_listener(startup, tmp_path):
    path = tmp_path / "synthetic-config.json"
    path.write_bytes(encoded(startup))
    with path.open("rb") as stream:
        result = run_cli(None, stdin_file=stream)
    assert result.returncode != 0 and result.stdout == b""
    assert_redacted(result.stdout + result.stderr)


def _memory_host_child():
    """Test-only bootstrap; main still owns its private pipe, socket and lifetime.

    The report contains only synthetic test observations, never token/DSN bytes.
    No production configuration is sourced from these test harness variables.
    """
    from dataclasses import replace
    from services.api.capture_runtime import create_local_capture_runtime
    from services.api.control import ControlRegistry
    from services.api.storage import MemoryStore

    mode = os.environ["LC_TEST_HOST_MODE"]
    path = Path(os.environ["LC_TEST_HOST_REPORT"])
    store = MemoryStore()
    report = {"store_calls": 0, "runtime_calls": 0}
    retained = []

    def save():
        path.write_text(json.dumps(report))

    def postgres(dsn):
        report.update(store_calls=report["store_calls"] + 1, exact_dsn=dsn == DSN)
        save()
        if mode == "store-error":
            raise RuntimeError(TOKEN + DSN)
        return store

    def runtime(**kwargs):
        report.update(runtime_calls=report["runtime_calls"] + 1,
                      fresh_consent=kwargs["fresh_consent"], producer_profile=kwargs["producer_profile"],
                      flags={name: kwargs[name] for name in FLAGS}, exact_token=kwargs["token"] == TOKEN,
                      scopes=sorted(kwargs["scopes"]), capabilities=sorted(kwargs["capabilities"]),
                      registration=deepcopy(kwargs["registration"]))
        save()
        if mode == "runtime-error":
            raise RuntimeError(TOKEN + DSN)
        if mode == "hang-runtime":
            threading.Event().wait()
        if mode == "reopen-consumed":
            # Explicit fixture construction precedes the observed False reopen;
            # it is not implicit consent supplied by the host implementation.
            create_local_capture_runtime(**{**kwargs, "fresh_consent": True})
            registry = ControlRegistry(store, scopes=kwargs["scopes"], capabilities=kwargs["capabilities"],
                                       authorization_guard=lambda state: None)
            registry.register(kwargs["user_id"], kwargs["registration"], "test-consume-grant")
        built = create_local_capture_runtime(**kwargs)
        retained.append(deepcopy(store._documents))
        if mode == "hang-request":
            async def blocked_app(scope, receive, send):
                report.update(request_entered=True, unchanged_before_request=store._documents == retained[-1])
                save()
                # Model synchronous database work that blocks the ASGI thread.
                threading.Event().wait()

            built = replace(built, app=blocked_app)
        return built

    original_config = host.uvicorn.Config

    def server_config(*args, **kwargs):
        report["server"] = {name: kwargs[name] for name in (
            "host", "port", "workers", "proxy_headers", "forwarded_allow_ips", "access_log")}
        save()
        return original_config(*args, **kwargs)

    host.PostgresStore = postgres
    host.create_local_capture_runtime = runtime
    host.uvicorn.Config = server_config
    host.STARTUP_TIMEOUT_SECONDS = 3
    host.SHUTDOWN_TIMEOUT_SECONDS = 1
    save()
    result = host.main()
    report.update(unchanged_after_factory=not retained or store._documents == retained[-1],
                  pristine=store._documents == {}, exit_code=result)
    save()
    raise SystemExit(result)


@contextmanager
def memory_child(startup, tmp_path, *, mode="normal", raw=None):
    path = tmp_path / "host-observations.json"
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "LC_TEST_HOST_MODE": mode,
           "LC_TEST_HOST_REPORT": str(path), "UVICORN_HOST": "0.0.0.0",
           "LC_DATABASE_URL": "environment-must-not-replace-private-record"}
    command = [sys.executable, "-u", "-c",
               "from services.api.tests.test_desktop_local import _memory_host_child; _memory_host_child()"]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, cwd=ROOT, env=env)
    try:
        process.stdin.write(encoded(startup) if raw is None else raw)
        process.stdin.flush()
        yield process, path
    finally:
        if process.stdin is not None:
            try:
                process.stdin.close()
            except BrokenPipeError:
                pass
            process.stdin = None
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        process.stdout.close()
        process.stderr.close()


def readiness(process):
    result = queue.Queue()
    thread = threading.Thread(target=lambda: result.put(process.stdout.readline()), daemon=True)
    thread.start()
    raw = result.get(timeout=6)
    assert raw.endswith(b"\n"), raw
    value = json.loads(raw)
    assert set(value) == {"format", "status", "origin", "start_status"}
    assert value["format"] == "lc-desktop-capture-host-ready-v1" and value["status"] == "ready"
    match = re.fullmatch(r"http://127\.0\.0\.1:([1-9][0-9]{0,4})", value["origin"])
    assert match is not None and 0 < int(match[1]) <= 65535
    assert value["start_status"] in {"pending", "consumed"}
    assert_redacted(raw)
    return value, int(match[1])


def finish(process, *, close_input=True):
    if close_input and process.stdin is not None:
        process.stdin.close()
        process.stdin = None
    process.wait(timeout=6)
    stdout, stderr = process.communicate(timeout=2)
    assert stdout == b"", "only one stdout readiness record is allowed"
    assert_redacted(stderr)
    assert b"GET " not in stderr
    return process.returncode, stderr


def get(port, headers=None, *, path="/not-a-capture-route"):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("GET", path, headers=headers or {})
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        connection.close()


@pytest.mark.parametrize("mode,status,consent", [("normal", "pending", True), ("reopen-consumed", "consumed", False)])
def test_real_child_ready_forwards_exact_consent_and_gates_then_eof_preserves_state(startup, tmp_path, mode, status, consent):
    startup.update(fresh_consent=consent, producer_profile="desktop_pixels",
                   enable_raw_ingress=True, enable_macos_ingress=True)
    with memory_child(startup, tmp_path, mode=mode) as (process, path):
        ready, port = readiness(process)
        assert ready["start_status"] == status
        assert get(port)[0] == 404
        for route, version in (("raw", "0.2.6"), ("desktop", "0.2.4"),
                               ("windows", "0.2.4"), ("macos", "0.2.12")):
            code, _, body = get(port, {"Origin": "null"}, path=f"/v2/process/{route}-frames:batch")
            assert code == 403 and json.loads(body)["contract_version"] == version
        assert finish(process) == (0, b"")
        report = json.loads(path.read_text())
        assert report["fresh_consent"] is consent
        assert report["flags"] == {name: startup[name] for name in FLAGS}
        assert report["scopes"] == startup["scopes"] and report["capabilities"] == startup["capabilities"]
        assert report["registration"] == startup["registration"]
        assert report["exact_token"] is report["exact_dsn"] is True
        assert report["store_calls"] == report["runtime_calls"] == 1
        assert report["unchanged_after_factory"] is True
        assert report["server"] == {"host": "127.0.0.1", "port": port, "workers": 1,
                                    "proxy_headers": False, "forwarded_allow_ips": "", "access_log": False}
    with pytest.raises(OSError):
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            pass


def test_real_child_rejects_browser_and_foreign_host_headers_without_cors(startup, tmp_path):
    startup.update(fresh_consent=True, producer_profile="desktop_pixels", **{name: True for name in FLAGS})
    with memory_child(startup, tmp_path) as (process, path):
        _, port = readiness(process)
        for headers in ({"Host": f"localhost:{port}"}, {"Host": "foreign.invalid"},
                        {"Origin": "null"}, {"Origin": "https://example.invalid"}, {"Sec-Fetch-Mode": "cors"}):
            status, response_headers, body = get(port, headers)
            assert status == 403
            assert json.loads(body) == {"contract_version": "0.2.4", "error": "forbidden", "retryable": False}
            assert response_headers["cache-control"] == "no-store"
            assert response_headers["x-content-type-options"] == "nosniff"
            assert not any(name.lower().startswith("access-control-") for name in response_headers)
        assert get(port, {"X-Forwarded-Host": "foreign.invalid", "X-Forwarded-For": "203.0.113.7"})[0] == 404
        for route, version in (("/v2/process/streams", "0.2.1"), ("/v2/process/streams/owned", "0.2.1"),
                               ("/v2/process/raw-frames:batch", "0.2.6"),
                               ("/v2/process/desktop-frames:batch", "0.2.8"),
                               ("/v2/process/windows-frames:batch", "0.2.10"),
                               ("/v2/process/macos-frames:batch", "0.2.12")):
            status, _, body = get(port, {"Host": "foreign.invalid"}, path=route)
            assert status == 403
            assert json.loads(body) == {"contract_version": version, "error": "forbidden", "retryable": False}
        assert finish(process) == (0, b"")
        assert json.loads(path.read_text())["unchanged_after_factory"] is True


@pytest.mark.parametrize("reason", ["extra-input", "signal"])
def test_real_child_extra_input_or_sigterm_reaps_only_its_own_host(startup, tmp_path, reason):
    if reason == "signal" and os.name != "posix":
        pytest.skip("POSIX SIGTERM handler; Windows process termination is separate")
    startup["fresh_consent"] = True
    with memory_child(startup, tmp_path) as (process, path):
        readiness(process)
        if reason == "extra-input":
            process.stdin.write(b"unexpected")
            process.stdin.flush()
        else:
            process.send_signal(signal.SIGTERM)
        result, stderr = finish(process, close_input=False)
        if reason == "signal":
            assert result == 0 and stderr == b""
        else:
            assert result != 0
            assert json.loads(stderr)["error"] == "unexpected_input"
        assert json.loads(path.read_text())["unchanged_after_factory"] is True


def test_occupied_port_refuses_before_store_factory_or_consent(startup, tmp_path):
    startup["fresh_consent"] = True
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
        occupied.bind(("127.0.0.1", 0))
        occupied.listen(1)
        startup["port"] = occupied.getsockname()[1]
        with memory_child(startup, tmp_path) as (process, path):
            result, stderr = finish(process, close_input=False)
            assert result != 0 and json.loads(stderr)["error"] == "unavailable"
            report = json.loads(path.read_text())
            assert report["store_calls"] == report["runtime_calls"] == 0
            assert report["pristine"] is True
        assert occupied.getsockname()[1] == startup["port"]


@pytest.mark.parametrize("mode", ["store-error", "runtime-error"])
def test_initialization_failure_never_reports_ready_or_leaks_exception(startup, tmp_path, mode):
    startup["fresh_consent"] = True
    with memory_child(startup, tmp_path, mode=mode) as (process, path):
        result, stderr = finish(process, close_input=False)
        assert result != 0 and json.loads(stderr)["error"] == "unavailable"
        report = json.loads(path.read_text())
        assert report["pristine"] is True and report["store_calls"] == 1
        assert report["runtime_calls"] == (0 if mode == "store-error" else 1)


def test_false_consent_on_pristine_store_is_forwarded_and_cannot_mint_grant(startup, tmp_path):
    with memory_child(startup, tmp_path) as (process, path):
        result, stderr = finish(process, close_input=False)
        assert result != 0 and json.loads(stderr)["error"] == "unavailable"
        report = json.loads(path.read_text())
        assert report["runtime_calls"] == 1 and report["fresh_consent"] is False
        assert report["pristine"] is True


def test_bad_startup_never_calls_store_or_runtime_even_if_parent_stays_open(startup, tmp_path):
    with memory_child(startup, tmp_path, raw=b"invalid-json\n") as (process, path):
        result, stderr = finish(process, close_input=False)
        assert result != 0 and json.loads(stderr)["error"] == "invalid_startup"
        report = json.loads(path.read_text())
        assert report["store_calls"] == report["runtime_calls"] == 0


def test_parent_loss_bounds_a_blocked_factory_without_claiming_clean_shutdown(startup, tmp_path):
    startup["fresh_consent"] = True
    with memory_child(startup, tmp_path, mode="hang-runtime") as (process, path):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                if json.loads(path.read_text()).get("runtime_calls") == 1:
                    break
            except (FileNotFoundError, json.JSONDecodeError):
                pass
            time.sleep(0.02)
        else:
            pytest.fail("controlled factory never reached its blocked boundary")
        result, stderr = finish(process)
        assert result != 0
        assert json.loads(stderr)["error"] == "shutdown_timeout"


def test_incomplete_record_times_out_without_store_or_readiness(startup, tmp_path):
    with memory_child(startup, tmp_path, raw=encoded(startup)[:-1]) as (process, path):
        result, stderr = finish(process, close_input=False)
        assert result != 0
        assert json.loads(stderr)["error"] == "startup_timeout"
        report = json.loads(path.read_text())
        assert report["store_calls"] == report["runtime_calls"] == 0


def test_parent_loss_bounds_a_synchronous_request_block_after_ready(startup, tmp_path):
    startup["fresh_consent"] = True
    with memory_child(startup, tmp_path, mode="hang-request") as (process, path):
        _, port = readiness(process)
        outcomes = queue.Queue()

        def request():
            try:
                outcomes.put(get(port))
            except (OSError, http.client.HTTPException) as exc:
                outcomes.put(type(exc))

        thread = threading.Thread(target=request, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                try:
                    report = json.loads(path.read_text())
                    if report.get("request_entered"):
                        break
                except json.JSONDecodeError:
                    pass
                time.sleep(0.02)
            else:
                pytest.fail("controlled request never reached its blocked boundary")
            assert report["unchanged_before_request"] is True
            result, stderr = finish(process)
            assert result != 0 and json.loads(stderr)["error"] == "shutdown_timeout"
            assert isinstance(outcomes.get(timeout=3), type), "blocked request must not receive a successful response"
        finally:
            thread.join(timeout=3)
            assert not thread.is_alive()


def test_pipe_read_error_has_fixed_classification_without_exception_disclosure(monkeypatch):
    def failed_read(_fd, _limit):
        raise OSError(TOKEN + DSN)

    monkeypatch.setattr(host.os, "read", failed_read)
    lifetime = host._Lifetime()
    lifetime.read_parent(42)
    assert lifetime.stop_requested.is_set()
    assert lifetime.error == "parent_input_lost"
    assert lifetime.raw is None and not lifetime.input_ready.is_set()
