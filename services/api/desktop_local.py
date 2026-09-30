"""Foreground loopback host for one trusted desktop parent's private pipe.

This process hosts the existing archive/control runtime. Exiting does not issue
a control Stop, stop an OS producer, or attest live capture or provider receipt.
The parent retains the registration and reconciles uncertain writes on restart.
"""

import asyncio
from contextlib import nullcontext
from datetime import datetime, timezone
import json
import logging
import os
import re
import signal
import socket
import stat
import sys
import threading
import time
import warnings

import uvicorn

from packages.contracts import validate as validate_core
from packages.contracts.process_control import validate as validate_control
from services.api.capture_runtime import (
    LOCAL_CAPABILITIES, LOCAL_SCOPES, create_local_capture_runtime,
)
from services.api.control_app import _unique_object
from services.api.control_app import _error as _control_error
from services.api.ingress_app import (
    DESKTOP_ROUTE, MACOS_ROUTE, RAW_ROUTE, WINDOWS_ROUTE, _error, _nonfinite,
    desktop_wire, macos_wire, raw_wire, windows_wire, wire,
)
from services.api.storage import PostgresStore


MAX_STARTUP_BYTES = 65536
STARTUP_TIMEOUT_SECONDS = 10.0
SHUTDOWN_TIMEOUT_SECONDS = 5.0
STARTUP_FORMAT = "lc-desktop-capture-host-v1"
READY_FORMAT = "lc-desktop-capture-host-ready-v1"
ERROR_FORMAT = "lc-desktop-capture-host-error-v1"
_FLAGS = ("enable_raw_ingress", "enable_desktop_ingress",
          "enable_windows_ingress", "enable_macos_ingress")
_KEYS = frozenset({"format", "port", "database_dsn", "user_id", "device_id", "session_id",
                   "producer_id", "registration", "token", "expires_at", "scopes", "capabilities",
                   "fresh_consent", "producer_profile", *_FLAGS})


def parse_startup(raw: bytes) -> dict:
    """Validate one complete private record; retain every registration field.

    The result keeps port/database_dsn for this host, converts the two authority
    arrays to frozensets and expiry to UTC datetime, and omits only format.
    No store, environment configuration, socket or credential output is used.
    """
    try:
        if (type(raw) is not bytes or not 1 <= len(raw) <= MAX_STARTUP_BYTES
                or not raw.endswith(b"\n") or raw.count(b"\n") != 1):
            raise ValueError
        body = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object,
                          parse_constant=_nonfinite)
        json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
        if type(body) is not dict or body.keys() != _KEYS or body["format"] != STARTUP_FORMAT:
            raise ValueError
        if type(body["port"]) is not int or not 0 <= body["port"] <= 65535:
            raise ValueError
        dsn = body["database_dsn"]
        if type(dsn) is not str or not dsn.strip() or len(dsn) > 8192:
            raise ValueError
        for name in ("user_id", "device_id", "session_id", "producer_id"):
            validate_control("Identifier", body[name])
        validate_control("StreamRegistration", body["registration"])
        if any(body["registration"][name] != body[name] for name in ("device_id", "session_id")):
            raise ValueError
        token = body["token"]
        if (type(token) is not str or not 32 <= len(token) <= 4096
                or re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", token) is None):
            raise ValueError
        validate_core("UtcTimestamp", body["expires_at"])
        expiry = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
        if expiry <= datetime.now(timezone.utc):
            raise ValueError
        for name, allowed, required in (
            ("scopes", LOCAL_SCOPES, "process:control"),
            ("capabilities", LOCAL_CAPABILITIES, "process.control.v0.2.1"),
        ):
            values = body[name]
            if (type(values) is not list or any(type(value) is not str for value in values)
                    or len(set(values)) != len(values) or not set(values) <= allowed or required not in values):
                raise ValueError
            body[name] = frozenset(values)
        if any(type(body[name]) is not bool for name in ("fresh_consent", *_FLAGS)):
            raise ValueError
        if body["producer_profile"] not in (None, "desktop_pixels"):
            raise ValueError
        for flag, capability in zip(_FLAGS, ("process.raw-ingress.v0.2.6", "process.desktop-ingress.v0.2.8",
                                            "process.windows-ingress.v0.2.10", "process.macos-ingress.v0.2.12")):
            if body[flag] and (capability not in body["capabilities"]
                              or "process.capture.v0.2" not in body["capabilities"]
                              or "process:capture" not in body["scopes"]):
                raise ValueError
        if any(body[flag] for flag in _FLAGS[1:]) and body["producer_profile"] != "desktop_pixels":
            raise ValueError
        body["expires_at"] = expiry
        del body["format"]
        return body
    except Exception:
        # Even a validator exception may contain the complete secret-bearing
        # input. The CLI and the parser expose only this fixed classification.
        raise ValueError("invalid_startup") from None


def _report(error):
    data = json.dumps({"format": ERROR_FORMAT, "error": error}, separators=(",", ":")).encode() + b"\n"
    try:
        os.write(sys.stderr.fileno(), data)
    except (OSError, ValueError):
        pass


class _Lifetime:
    """One process lifetime, including a bound when synchronous DB work blocks."""

    def __init__(self):
        self.stop_requested = threading.Event()
        self.finished = threading.Event()
        self.ready = threading.Event()
        self.input_ready = threading.Event()
        self.raw = None
        self.error = None

    def stop(self, error=None):
        if self.error is None and error is not None:
            self.error = error
        self.stop_requested.set()

    def read_parent(self, fd):
        data = bytearray()
        try:
            while not self.finished.is_set():
                chunk = os.read(fd, 4096)
                if not chunk:
                    self.stop("invalid_startup" if self.raw is None else None)
                    return
                if self.raw is not None:
                    self.stop("unexpected_input")
                    return
                data.extend(chunk)
                if len(data) > MAX_STARTUP_BYTES:
                    self.stop("invalid_startup")
                    return
                if b"\n" in data:
                    if data.index(b"\n") != len(data) - 1:
                        self.stop("unexpected_input")
                        return
                    self.raw = bytes(data)
                    self.input_ready.set()
        except Exception:
            self.stop("parent_input_lost")

    def watchdog(self):
        startup_deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
        shutdown_deadline = None
        while not self.finished.wait(0.05):
            now = time.monotonic()
            if not self.ready.is_set() and now >= startup_deadline:
                self.stop("startup_timeout")
            if self.stop_requested.is_set():
                if shutdown_deadline is None:
                    shutdown_deadline = now + SHUTDOWN_TIMEOUT_SECONDS
                if now >= shutdown_deadline and not self.finished.is_set():
                    _report(self.error or "shutdown_timeout")
                    # Only this foreground child is terminated. In-flight writes
                    # may need reconciliation; this is never a successful Stop.
                    os._exit(1)


class _ParentOnly:
    def __init__(self, app, port, enabled_ingress=()):
        self.app = app
        self.host = f"127.0.0.1:{port}".encode("ascii")
        self.contracts = {route: contract for flag, route, contract in (
            ("enable_raw_ingress", RAW_ROUTE, raw_wire),
            ("enable_desktop_ingress", DESKTOP_ROUTE, desktop_wire),
            ("enable_windows_ingress", WINDOWS_ROUTE, windows_wire),
            ("enable_macos_ingress", MACOS_ROUTE, macos_wire),
        ) if flag in enabled_ingress}

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = [(name.lower(), value) for name, value in scope["headers"]]
            hosts = [value for name, value in headers if name == b"host"]
            if (hosts != [self.host]
                    or any(name == b"origin" or name.startswith(b"sec-fetch-") for name, _ in headers)):
                path = scope["path"]
                if path == "/v2/process/streams" or re.fullmatch(r"/v2/process/streams/[^/]+", path):
                    response = _control_error(403, "forbidden")
                else:
                    response = _error(403, "forbidden", contract=self.contracts.get(path, wire))
                response.headers["Cache-Control"] = "no-store"
                response.headers["X-Content-Type-Options"] = "nosniff"
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


async def serve(runtime, sock, lifetime, *, enabled_ingress=()):
    """Run the bound server in this foreground task, without extra workers."""
    port = sock.getsockname()[1]

    class Server(uvicorn.Server):
        def capture_signals(self):
            # Main's handlers also cover synchronous initialization and DB waits.
            return nullcontext()

        async def startup(self, sockets=None):
            if lifetime.stop_requested.is_set():
                self.should_exit = True
                return
            await super().startup(sockets=sockets)
            if lifetime.stop_requested.is_set():
                self.should_exit = True
                return
            if not self.started or runtime.start_status not in {"pending", "consumed"}:
                raise RuntimeError("unavailable")
            ready = {"format": READY_FORMAT, "status": "ready", "origin": f"http://127.0.0.1:{port}",
                     "start_status": runtime.start_status}
            # The only stdout record; bounded independently of private input.
            os.write(sys.stdout.fileno(), json.dumps(ready, separators=(",", ":")).encode() + b"\n")
            lifetime.ready.set()

    config = uvicorn.Config(_ParentOnly(runtime.app, port, enabled_ingress), host="127.0.0.1", port=port,
                            workers=1, loop="asyncio", http="h11", ws="none", lifespan="off",
                            interface="asgi3", proxy_headers=False, forwarded_allow_ips="",
                            access_log=False, log_config=None, log_level="critical", server_header=False,
                            timeout_graceful_shutdown=SHUTDOWN_TIMEOUT_SECONDS / 2)
    server = Server(config)

    async def stop_when_parent_leaves():
        while not lifetime.stop_requested.is_set():
            await asyncio.sleep(0.05)
        server.should_exit = True

    monitor = asyncio.create_task(stop_when_parent_leaves())
    try:
        await server.serve(sockets=[sock])
    finally:
        monitor.cancel()
        await asyncio.gather(monitor, return_exceptions=True)


def main() -> int:
    lifetime = _Lifetime()
    sock = None
    handlers = {}
    logging_level = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            if sys.argv[1:]:
                raise ValueError("invalid_startup")
            fd = sys.stdin.fileno()
            if not stat.S_ISFIFO(os.fstat(fd).st_mode):
                raise ValueError("invalid_startup")
            for sig in (signal.SIGINT, signal.SIGTERM):
                handlers[sig] = signal.signal(sig, lambda _sig, _frame: lifetime.stop())
            threading.Thread(target=lifetime.watchdog, daemon=True).start()
            threading.Thread(target=lifetime.read_parent, args=(fd,), daemon=True).start()
            while not lifetime.input_ready.wait(0.05):
                if lifetime.stop_requested.is_set():
                    break
            # A complete malformed record is still an error if EOF or SIGTERM
            # immediately follows it. Stopping never authorizes provisioning.
            if lifetime.raw is not None:
                config = parse_startup(lifetime.raw)
            if not lifetime.stop_requested.is_set():
                port, dsn = config.pop("port"), config.pop("database_dsn")
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                    sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                # Reserve the exact numeric address before a possible durable
                # consent grant. No connections are accepted until ASGI startup.
                sock.bind(("127.0.0.1", port))
                if not lifetime.stop_requested.is_set():
                    runtime = create_local_capture_runtime(store=PostgresStore(dsn), **config)
                    if not lifetime.stop_requested.is_set():
                        enabled = tuple(flag for flag in _FLAGS if config[flag])
                        asyncio.run(serve(runtime, sock, lifetime, enabled_ingress=enabled))
    except ValueError:
        lifetime.stop("invalid_startup")
    except (Exception, SystemExit):
        lifetime.stop("unavailable")
    finally:
        if sock is not None:
            try:
                sock.close()
            except OSError:
                lifetime.stop("unavailable")
        lifetime.finished.set()
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
        logging.disable(logging_level)
    if lifetime.error is not None:
        _report(lifetime.error)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
