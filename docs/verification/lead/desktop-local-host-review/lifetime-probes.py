"""Bounded independent Linux lifetime interleavings on the exact exported host.

Uses MemoryStore and a synthetic pipe record only; no PostgreSQL or HTTP calls.
Run using the pinned root Python and the exported candidate as first argument.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time


def child(candidate, mode, folder):
    sys.path.insert(0, candidate)
    from services.api import desktop_local as host
    from services.api.capture_runtime import create_local_capture_runtime
    from services.api.storage import MemoryStore

    sys.argv = ["services.api.desktop_local"]
    root = Path(folder)
    data = {"mode": mode, "store_calls": 0, "factory_calls": 0}
    store = MemoryStore()
    snapshots = []
    lifetimes = []
    def save(**change):
        data.update(change)
        pending = root / "observation.next"
        pending.write_text(json.dumps(data))
        pending.replace(root / "observation.json")

    original_lifetime = host._Lifetime
    class Lifetime(original_lifetime):
        def __init__(self):
            super().__init__()
            lifetimes.append(self)
    host._Lifetime = Lifetime
    original_socket = socket.socket
    class BoundSocket(original_socket):
        def bind(self, address):
            result = super().bind(address)
            if address[0] == "127.0.0.1":
                save(bound_port=self.getsockname()[1], phase="bound")
                if mode in {"eof_during_bind", "extra_during_bind"}:
                    assert lifetimes[0].stop_requested.wait(5), "parent stop not observed"
                    save(stop_seen_at_bind=True)
            return result
    host.socket.socket = BoundSocket

    def postgres(_dsn):
        save(store_calls=data["store_calls"] + 1)
        return store
    def factory(**kwargs):
        save(factory_calls=data["factory_calls"] + 1)
        if mode == "startup_deadline_blocked_factory":
            save(phase="blocked_factory")
            threading.Event().wait()
        built = create_local_capture_runtime(**kwargs)
        snapshots.append(copy.deepcopy(store._documents))
        save(phase="provisioned", has_documents=bool(store._documents))
        if mode == "eof_after_provision":
            assert lifetimes[0].stop_requested.wait(5), "parent stop not observed"
        if mode == "closed_stdout":
            deadline = time.monotonic() + 5
            while not (root / "release").exists():
                assert time.monotonic() < deadline, "stdout-close handshake not released"
                time.sleep(.01)
        return built
    host.PostgresStore = postgres
    host.create_local_capture_runtime = factory
    host.STARTUP_TIMEOUT_SECONDS = 2
    host.SHUTDOWN_TIMEOUT_SECONDS = .8
    save(phase="initial")
    code = host.main()
    save(returncode=code, pristine=not store._documents,
         unchanged_after_factory=not snapshots or snapshots[-1] == store._documents,
         stop_seen=lifetimes[0].stop_requested.is_set(), finished=lifetimes[0].finished.is_set())
    raise SystemExit(code)


def run(candidate):
    sys.path.insert(0, candidate)
    from services.api.tests.test_desktop_local import startup, encoded, assert_redacted
    config = startup.__wrapped__()
    config["fresh_consent"] = True
    results = []
    for mode in ("eof_during_bind", "extra_during_bind", "eof_after_provision",
                 "closed_stdout", "sigint_after_ready", "startup_deadline_blocked_factory"):
        with tempfile.TemporaryDirectory(prefix="desktop-local-lifetime-case-") as folder:
            root = Path(folder)
            env = {key: value for key, value in os.environ.items()
                   if key not in {"LC_TEST_DATABASE_URL", "LC_DATABASE_URL", "LC_HTTP_CHECK_CONFIG"}}
            env["PYTHONDONTWRITEBYTECODE"] = "1"
            process = subprocess.Popen([sys.executable, "-u", __file__, "--child", candidate, mode, folder],
                cwd=candidate, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stdout_closed = False
            ready = b""
            started = time.monotonic()
            try:
                process.stdin.write(encoded(config))
                process.stdin.flush()
                expected = "bound" if mode in {"eof_during_bind", "extra_during_bind"} else "provisioned"
                if mode == "startup_deadline_blocked_factory":
                    expected = "blocked_factory"
                deadline = time.monotonic() + 6
                while True:
                    assert time.monotonic() < deadline, (mode, "observation timeout")
                    assert process.poll() is None, (mode, process.returncode, process.stderr.read())
                    path = root / "observation.json"
                    observation = json.loads(path.read_text()) if path.exists() else {}
                    if observation.get("phase") == expected:
                        break
                    time.sleep(.01)
                if mode in {"eof_during_bind", "eof_after_provision"}:
                    process.stdin.close()
                    process.stdin = None
                elif mode == "extra_during_bind":
                    process.stdin.write(config["token"].encode() + b"\n")
                    process.stdin.flush()
                elif mode == "closed_stdout":
                    process.stdout.close()
                    stdout_closed = True
                    (root / "release").touch()
                elif mode == "sigint_after_ready":
                    assert select.select([process.stdout], [], [], 5)[0], "no readiness"
                    ready = process.stdout.readline()
                    value = json.loads(ready)
                    assert value["start_status"] == "pending"
                    assert value["origin"] == f"http://127.0.0.1:{observation['bound_port']}"
                    process.send_signal(signal.SIGINT)
                process.wait(timeout=6)
                elapsed = time.monotonic() - started
                trailing = b"" if stdout_closed else process.stdout.read()
                stderr = process.stderr.read()
                observation = json.loads((root / "observation.json").read_text())
                assert_redacted(ready + trailing + stderr)
                assert trailing == b"", (mode, trailing)
                error = json.loads(stderr)["error"] if stderr else None
                expected_error = {"extra_during_bind": "unexpected_input", "closed_stdout": "unavailable",
                                  "startup_deadline_blocked_factory": "startup_timeout"}.get(mode)
                assert error == expected_error, (mode, error)
                assert process.returncode == (1 if expected_error else 0), (mode, process.returncode)
                if mode in {"eof_during_bind", "extra_during_bind"}:
                    assert observation["store_calls"] == observation["factory_calls"] == 0
                    assert observation["pristine"] and observation["stop_seen_at_bind"]
                elif mode == "startup_deadline_blocked_factory":
                    assert observation["store_calls"] == observation["factory_calls"] == 1
                    assert "finished" not in observation  # Independent watchdog forced os._exit.
                    assert elapsed < 5
                else:
                    assert observation["store_calls"] == observation["factory_calls"] == 1
                    assert observation["has_documents"] and not observation["pristine"]
                    assert observation["unchanged_after_factory"] and observation["finished"]
                port = observation["bound_port"]
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as released:
                    released.bind(("127.0.0.1", port))
                results.append({"probe": mode, "passed": True, "pid": process.pid,
                    "returncode": process.returncode, "elapsed_seconds": round(elapsed, 3),
                    "stdout_ready_count": int(bool(ready)), "error": error,
                    "bound_port_reusable": True, "observations": observation})
            finally:
                if process.stdin is not None:
                    try:
                        process.stdin.close()
                    except BrokenPipeError:
                        pass
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=2)
                if not stdout_closed:
                    process.stdout.close()
                process.stderr.close()
    evidence = {"candidate": "deec5f4c8e3439c4ef05521ac442554a81415dbf",
        "export": candidate, "interpreter": sys.executable, "platform": sys.platform,
        "tests": len(results), "passed": len(results),
        "limits": "Linux synthetic MemoryStore, own temporary child/socket only; no HTTP/DB/native/provider",
        "probe_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "results": results}
    Path("/tmp/desktop-local-deec-lifetime-probes.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    if sys.argv[1] == "--child":
        child(*sys.argv[2:])
    else:
        run(sys.argv[1])
