"""Explicit foreground subscription ASK IPC; the default connector stays off.

The trusted desktop supplies request/selection authority. Learning validates
originals and assembles/binds content; managed Codex alone owns authentication.
This module never resumes or retries an inference with an uncertain outcome.
"""

import asyncio
from dataclasses import dataclass
import json
import os
import queue
import signal
import stat
import sys
import threading
import time
import unicodedata


VERSION = "lc-subscription-ask/1"
LIVE_VERSION = "lc-subscription-live/1"
MAX_LINE_BYTES = 12 * 1024 * 1024
MAX_OUTPUT_BYTES = 256 * 1024
MAX_LIVE_OUTPUT_BYTES = 1024 * 1024
MAX_HISTORY = 4096
# Includes the inner child's 3s terminate + 3s kill/reap allowance.
SHUTDOWN_SECONDS = 8
# Let admitted operations publish their sanitized failure and finish receipts;
# this grace precedes the existing bounded owned-child shutdown.
TERMINAL_REPLY_SECONDS = 1
ERRORS = {
    "invalid_request": "The local request is invalid.",
    "busy": "Another request is still active.",
    "cancelled": "The request was cancelled; no answer will be displayed.",
    "session_stopped": "This capture session has stopped.",
    "unavailable": "The subscription connection is unavailable.",
    "unauthenticated": "Sign in with ChatGPT to continue.",
    "unsupported_model": "The selected model does not advertise image input.",
    "quota": "Subscription usage is currently unavailable.",
    "interrupt_unconfirmed": "The response was suppressed; remote interruption is unconfirmed.",
    "failed": "The request did not produce a completed answer; it was not retried.",
}
ERROR_CODES = {
    "payload_too_large": "invalid_request", "duplicate_request": "invalid_request",
    "not_found": "invalid_request", "unsupported": "invalid_request",
    "needs_auth": "unauthenticated", "quota_exhausted": "quota",
    # Version 1 has no precise quota/credit reasons. Do not mislabel transient
    # throttling, included-use denial or workspace controls as exhausted quota.
    "rate_limited": "failed", "session_budget_exceeded": "failed",
    "context_limit": "failed", "overloaded": "failed",
    "usage_not_allowed": "unavailable", "workspace_limit": "unavailable",
    "uncertain": "failed", "outcome_unknown": "failed", "request_failed": "failed",
    "incomplete_turn": "failed", "model_mismatch": "failed", "tool_activity": "failed",
    "cancellation_uncertain": "interrupt_unconfirmed", "login_not_found": "invalid_request",
    "login_failed": "failed", "timeout": "failed",
}


def public_code(code):
    return code if code in ERRORS else ERROR_CODES.get(code, "unavailable")


class LocalError(Exception):
    def __init__(self, code="invalid_request"):
        self.code = public_code(code)
        super().__init__(ERRORS[self.code])


def identifier(value):
    return (type(value) is str and 1 <= len(value) <= 128
            and all(unicodedata.category(char) not in {"Cc", "Cs"} for char in value))


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise LocalError()
        result[key] = value
    return result


def _nonfinite(_value):
    raise LocalError()


def parse_line(raw):
    if type(raw) is not bytes or len(raw) > MAX_LINE_BYTES:
        raise LocalError("payload_too_large")
    try:
        if not raw.endswith(b"\n") or raw.count(b"\n") != 1:
            raise LocalError()
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique, parse_constant=_nonfinite)
        json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        if type(value) is not dict:
            raise LocalError()
        return value
    except (ValueError, UnicodeError, RecursionError):
        raise LocalError() from None


def _prepare(request):
    try:
        from services.learning.subscription_ask import prepare_subscription_ask
    except ImportError:
        raise LocalError("learning_unavailable") from None
    return prepare_subscription_ask(request)


def _bind(prepared, text, **metadata):
    try:
        from services.learning.subscription_ask import bind_subscription_response
    except ImportError:
        raise LocalError("learning_unavailable") from None
    return bind_subscription_response(prepared, text, **metadata)


@dataclass
class _Ask:
    rpc_id: str
    request_id: str
    session_id: str
    cancelled: asyncio.Event
    task: asyncio.Task | None = None
    provider_started: bool = False
    retired: bool = False


class SubscriptionBridge:
    def __init__(self, client, *, emit, prepare=_prepare, bind=_bind, ready=None):
        self.client, self._emit, self.prepare, self.bind = client, emit, prepare, bind
        self.ready = ready
        self.active = None
        self.stopped_sessions, self.request_ids, self.rpc_ids = set(), set(), set()
        self.tasks = set()
        self.closed = self.login_starting = False
        self.exhausted = asyncio.Event()
        self.login_id = None
        self.login_events = []
        client.on_event = self.on_event

    def error(self, rpc_id, code):
        code = public_code(code)
        self.emit({"id": rpc_id, "error": {"code": code, "message": ERRORS[code]}})

    def emit(self, value):
        try:
            encode_line(value)
        except (ValueError, TypeError, UnicodeError, RecursionError, LocalError):
            code = "unavailable"
            value = {"id": value.get("id"), "error": {"code": code, "message": ERRORS[code]}}
        self._emit(value)

    async def _ready(self):
        if self.ready is not None:
            await asyncio.shield(self.ready)

    def _spawn(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    def _retire(self):
        self.exhausted.set()
        if self.active is not None and not self.active.cancelled.is_set():
            self.active.retired = True
            self.active.cancelled.set()

    async def handle(self, message):
        """Set fences in input order; provider latency never blocks Stop/cancel."""
        rpc_id = message.get("id") if type(message) is dict else None
        safe_id = rpc_id if identifier(rpc_id) else None
        try:
            if (type(message) is not dict or set(message) != {"version", "id", "method", "params"}
                    or message["version"] != VERSION or safe_id is None
                    or type(message["method"]) is not str or type(message["params"]) is not dict):
                raise LocalError()
            if self.closed:
                raise LocalError("unavailable")
            if rpc_id in self.rpc_ids:
                raise LocalError("duplicate_request")
            method, params = message["method"], message["params"]
            if self.exhausted.is_set() or len(self.rpc_ids) >= MAX_HISTORY:
                self.exhausted.set()
                if method not in {"ask/cancel", "session/stop", "connection/login/cancel"}:
                    raise LocalError("resource_limit")
            else:
                self.rpc_ids.add(rpc_id)
            if len(self.tasks) >= 32 and method not in {"ask/cancel", "session/stop"}:
                raise LocalError("busy")
            if method in {"connection/read", "connection/login/start"}:
                if params:
                    raise LocalError()
                if method.endswith("start"):
                    if self.login_id or self.login_starting or self.active:
                        raise LocalError("busy")
                    self.login_starting = True
                self._spawn(self._connection(rpc_id, method))
            elif method == "connection/login/cancel":
                if set(params) != {"login_id"} or not identifier(params["login_id"]):
                    raise LocalError()
                if params["login_id"] != self.login_id:
                    raise LocalError("not_found")
                self._spawn(self._cancel_login(rpc_id, params["login_id"]))
            elif method == "ask/start":
                self._start_ask(rpc_id, params)
            elif method == "ask/cancel":
                if set(params) != {"request_id"} or not identifier(params["request_id"]):
                    raise LocalError()
                active = self.active
                if active is None or active.request_id != params["request_id"]:
                    self.emit({"id": rpc_id, "result": {"cancelled": False, "uncertain": False}})
                    return
                active.cancelled.set()
                self._spawn(self._interrupt(rpc_id, False, active))
            elif method == "session/stop":
                if set(params) != {"capture_session_id"} or not identifier(params["capture_session_id"]):
                    raise LocalError()
                session = params["capture_session_id"]
                self.stopped_sessions.add(session)
                active = self.active
                if active is not None and active.session_id == session:
                    active.cancelled.set()
                else:
                    active = None
                self._spawn(self._interrupt(rpc_id, True, active))
            else:
                raise LocalError("unsupported")
        except LocalError as exc:
            self.error(safe_id, exc.code)
        finally:
            if self.exhausted.is_set():
                self._retire()

    def _start_ask(self, rpc_id, params):
        if (set(params) != {"request", "model"} or type(params["request"]) is not dict
                or type(params["model"]) is not str or not 1 <= len(params["model"]) <= 256):
            raise LocalError()
        request = params["request"]
        request_id = request.get("request_id")
        context = request.get("context")
        session = context.get("capture_session_id") if type(context) is dict else None
        if not identifier(request_id) or not identifier(session):
            raise LocalError()
        if session in self.stopped_sessions:
            raise LocalError("session_stopped")
        if self.exhausted.is_set():
            raise LocalError("resource_limit")
        if request_id in self.request_ids:
            raise LocalError("duplicate_request")
        if self.active is not None or self.login_id or self.login_starting:
            raise LocalError("busy")
        self.request_ids.add(request_id)
        begin = getattr(self.client, "begin_request", None)
        if begin is not None:
            try:
                begin(request_id)
            except Exception:
                raise LocalError("unavailable") from None
        active = _Ask(rpc_id, request_id, session, asyncio.Event())
        self.active = active
        active.task = self._spawn(self._ask(active, request, params["model"]))

    def _cancelled(self, active):
        return self.closed or active.cancelled.is_set() or active.session_id in self.stopped_sessions

    def _unfinished_outcome(self, active):
        if not active.retired and (active.cancelled.is_set() or active.session_id in self.stopped_sessions):
            return "cancelled"
        submission = getattr(self.client, "request_submission", lambda: "unknown")()
        if not active.provider_started or submission == "not_submitted":
            return "not_submitted"
        if active.retired:
            return "uncertain"
        failure = getattr(self.client, "request_failure", lambda: None)()
        return getattr(failure, "outcome", None) or "uncertain"

    async def _ask(self, active, request, model):
        started = time.monotonic()
        outcome = "not_submitted"
        try:
            if self._cancelled(active):
                raise LocalError("cancelled")
            try:
                prepared = self.prepare(request)
            except (ValueError, TypeError, KeyError, RecursionError):
                raise LocalError() from None
            if self._cancelled(active):
                raise LocalError("cancelled")
            await self._ready()
            if self._cancelled(active):
                raise LocalError("cancelled")
            active.provider_started = True
            outcome = "uncertain"
            answer = await self.client.ask(prepared["text"], prepared["image_bytes"],
                                           model=model, cancelled=active.cancelled)
            if self.client.terminal.is_set():
                raise LocalError("unavailable")
            if self._cancelled(active):
                raise LocalError("cancelled")
            result = self.bind(prepared, answer["text"], model=answer["model"], auth_mode="chatgpt",
                               latency_ms=max(0, int((time.monotonic() - started) * 1000)),
                               thread_id=answer["thread_id"], turn_id=answer["turn_id"])
            if self._cancelled(active):
                raise LocalError("cancelled")
            if self.client.terminal.is_set():
                raise LocalError("unavailable")
            finish = getattr(self.client, "finish_request", None)
            if finish is not None:
                finish("completed")
            if self.client.terminal.is_set():
                raise LocalError("unavailable")
            outcome = "completed"
            self.emit({"id": active.rpc_id, "result": result})
        except asyncio.CancelledError:
            outcome = self._unfinished_outcome(active) if self.client.terminal.is_set() or active.retired else "cancelled"
            if not self.closed and not self.client.terminal.is_set() and not active.retired:
                self.error(active.rpc_id, "cancelled")
        except Exception as exc:
            if not active.retired and (active.cancelled.is_set() or active.session_id in self.stopped_sessions):
                outcome = "cancelled"
            elif active.retired or self.client.terminal.is_set():
                outcome = self._unfinished_outcome(active)
            elif getattr(exc, "outcome", None) is not None:
                outcome = exc.outcome
            elif getattr(exc, "code", None) not in {"outcome_unknown", "uncertain", "timeout"} and active.provider_started:
                outcome = "failed"
            if outcome == "uncertain":
                self.exhausted.set()
            # On an unusable transport, EOF carries the unknown send outcome
            # to the desktop. A normal error reply would claim a known refusal.
            if not self.closed and outcome != "uncertain" and (not self.client.terminal.is_set()
                    or getattr(exc, "outcome", None) == "failed"):
                self.error(active.rpc_id, "unavailable" if active.retired else "cancelled" if self._cancelled(active)
                           else getattr(exc, "code", "unavailable"))
        finally:
            finish = getattr(self.client, "finish_request", None)
            if finish is not None and outcome != "completed":
                try:
                    finish(outcome)
                except Exception:
                    # Failure receipts cannot expose private data or grant an
                    # answer. The failing writer also fences future submissions.
                    self._retire()
            if self.active is active:
                self.active = None

    async def _interrupt(self, rpc_id, stopping, active):
        # Do not interrupt a later request if the scheduled cancellation runs
        # after its original request has already finished.
        confirmed = active is None or (self.active is not active and not active.provider_started)
        if active is not None and self.active is active:
            try:
                async with asyncio.timeout(SHUTDOWN_SECONDS):
                    confirmed = await self.client.interrupt()
            except Exception:
                confirmed = False
        if not self.closed:
            if stopping and not confirmed:
                self.error(rpc_id, "interrupt_unconfirmed")
            else:
                self.emit({"id": rpc_id, "result": {} if stopping else {
                    "cancelled": active is not None, "uncertain": confirmed is not True}})

    async def _connection(self, rpc_id, method):
        try:
            await self._ready()
            if method == "connection/read":
                result = await self.client.connection_read()
            else:
                result = await self.client.login_start()
                self.login_id = result["login_id"]
            if not self.closed:
                self.emit({"id": rpc_id, "result": result})
        except Exception as exc:
            if not self.closed:
                self.error(rpc_id, getattr(exc, "code", "unavailable"))
        finally:
            if method == "connection/login/start":
                self.login_starting = False
                events, self.login_events = self.login_events, []
                for event in events:
                    self.on_event("connection/login/completed", event)

    async def _cancel_login(self, rpc_id, login_id):
        try:
            await self._ready()
            await self.client.login_cancel(login_id)
            if not self.closed:
                self.emit({"id": rpc_id, "result": {}})
        except Exception as exc:
            if not self.closed:
                self.error(rpc_id, getattr(exc, "code", "unavailable"))

    def on_event(self, method, params):
        if self.closed:
            return
        if method == "connection/changed":
            self.emit({"method": method, "params": {}})
        elif method == "connection/login/completed" and type(params) is dict:
            if self.login_starting:
                if len(self.login_events) < 2:
                    self.login_events.append(params)
                return
            if params.get("login_id") != self.login_id or self.login_id is None:
                return
            event = {"login_id": self.login_id, "success": params.get("success") is True,
                     "error": None if params.get("success") is True else
                     "login_cancelled" if params.get("error") == "login_cancelled" else "login_failed"}
            self.login_id = None
            self.emit({"method": method, "params": event})

    async def close(self, *, terminal_failure=False):
        if self.closed:
            return
        if terminal_failure and self.active is not None:
            failure = getattr(self.client, "request_failure", lambda: None)()
            if self._unfinished_outcome(self.active) == "failed" and failure is not None:
                self.error(self.active.rpc_id, failure.code)
        self.closed = True
        if self.active is not None and not terminal_failure:
            self.active.cancelled.set()
        for task in tuple(self.tasks):
            task.cancel()
        async with asyncio.timeout(SHUTDOWN_SECONDS):
            try:
                await self.client.close()
            finally:
                if self.tasks:
                    await asyncio.gather(*tuple(self.tasks), return_exceptions=True)
                if self.active is not None:
                    # EOF can cancel a reserved task before its coroutine first
                    # runs, so its own finally block has not recorded closure.
                    finish = getattr(self.client, "finish_request", None)
                    if finish is not None:
                        finish(self._unfinished_outcome(self.active))
                    self.active = None


async def run_stream(read_line, emit, client, *, prepare=_prepare, bind=_bind, select_version=None):
    """Pin one protocol on its first envelope; EOF closes only the owned client."""
    ready = asyncio.create_task(client.start())
    terminal = asyncio.create_task(client.terminal.wait())
    bridge = None
    reading = None
    retirement = None
    terminal_failure = False
    try:
        while True:
            reading = asyncio.create_task(read_line())
            done, _ = await asyncio.wait((reading, terminal, *([retirement] if retirement else [])),
                                         return_when=asyncio.FIRST_COMPLETED)
            if terminal in done or client.terminal.is_set() or (bridge is not None and bridge.exhausted.is_set()):
                terminal_failure = True
                # A permanently unusable inner client must also end its outer
                # pipe. A later explicit user Check can create a new owner;
                # this stream never replaces the child or replays an ASK.
                reading.cancel()
                await asyncio.gather(reading, return_exceptions=True)
                reading = None
                await asyncio.wait({ready, *(bridge.tasks if bridge else ())}, timeout=TERMINAL_REPLY_SECONDS)
                break
            raw = reading.result()
            reading = None
            if not raw:
                break
            try:
                message = parse_line(raw)
            except LocalError as exc:
                if bridge is not None:
                    bridge.error(None, exc.code)
                else:
                    emit({"id": None, "error": {"code": exc.code, "message": ERRORS[exc.code]}})
                break
            if bridge is None:
                version = message.get("version")
                if version == LIVE_VERSION:
                    from .chatgpt_live import LiveSubscriptionBridge
                    bridge = LiveSubscriptionBridge(client, emit=emit, ready=ready)
                elif version == VERSION:
                    bridge = SubscriptionBridge(client, emit=emit, prepare=prepare, bind=bind, ready=ready)
                else:
                    emit({"id": message.get("id") if identifier(message.get("id")) else None,
                          "error": {"code": "invalid_request", "message": ERRORS["invalid_request"]}})
                    break
                if select_version is not None:
                    select_version(version)
                retirement = asyncio.create_task(bridge.exhausted.wait())
            await bridge.handle(message)
            await asyncio.sleep(0)
    finally:
        waiting = [terminal] + ([reading] if reading is not None else []) + ([retirement] if retirement else [])
        for task in waiting:
            task.cancel()
        await asyncio.gather(*waiting, return_exceptions=True)
        ready.cancel()
        try:
            if bridge is not None:
                await bridge.close(terminal_failure=terminal_failure)
            else:
                async with asyncio.timeout(SHUTDOWN_SECONDS):
                    await client.close()
        finally:
            await asyncio.gather(ready, return_exceptions=True)


def encode_line(value, *, max_bytes=MAX_OUTPUT_BYTES):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8") + b"\n"
    if len(raw) > max_bytes:
        raise LocalError("unavailable")
    return raw


class _Pipes:
    """Bounded pipe adapters keep blocked parent I/O off the lifecycle loop.

    The two I/O threads belong to this foreground process; neither runs provider
    work. Closing/overflowing either pipe ends the foreground owner and child.
    """

    def __init__(self, loop):
        self.loop = loop
        self.version = None
        self.output_limit = MAX_OUTPUT_BYTES
        self.incoming = asyncio.Queue(maxsize=2)
        self.outgoing = queue.Queue(maxsize=8)
        self.failed = asyncio.Event()
        self.closed = threading.Event()
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.writer = threading.Thread(target=self._write, daemon=True)
        self.reader.start()
        self.writer.start()

    def _fail(self):
        if not self.closed.is_set():
            try:
                self.loop.call_soon_threadsafe(self.failed.set)
            except RuntimeError:
                pass

    def _read(self):
        try:
            pending = bytearray()
            while not self.closed.is_set():
                chunk = os.read(sys.stdin.fileno(), 65536)
                pending.extend(chunk)
                while True:
                    newline = pending.find(b"\n")
                    if newline < 0 and chunk and len(pending) <= MAX_LINE_BYTES:
                        break
                    length = min(newline + 1 if newline >= 0 else len(pending), MAX_LINE_BYTES + 1)
                    raw = bytes(pending[:length])
                    del pending[:length]
                    future = asyncio.run_coroutine_threadsafe(self.incoming.put(raw), self.loop)
                    future.result()
                    if not raw or len(raw) > MAX_LINE_BYTES:
                        return
                    if not pending and chunk:
                        break
                if not chunk:
                    break
        except Exception:
            self._fail()

    def _write(self):
        try:
            while True:
                raw = self.outgoing.get()
                try:
                    if raw is None:
                        return
                    # Use the unbuffered binary stream: a dead parent cannot
                    # leave Python's shutdown waiting for a buffered-I/O lock.
                    target = getattr(sys.stdout.buffer, "raw", sys.stdout.buffer)
                    view = memoryview(raw)
                    while view:
                        count = target.write(view)
                        if not count:
                            raise BrokenPipeError()
                        view = view[count:]
                finally:
                    self.outgoing.task_done()
        except Exception:
            self._fail()

    def select_version(self, version):
        if version not in (VERSION, LIVE_VERSION) or self.version not in (None, version):
            raise LocalError()
        self.version = version
        self.output_limit = MAX_LIVE_OUTPUT_BYTES if version == LIVE_VERSION else MAX_OUTPUT_BYTES

    def emit(self, value):
        try:
            self.outgoing.put_nowait(encode_line(value, max_bytes=self.output_limit))
        except (queue.Full, LocalError):
            self.failed.set()

    async def close(self):
        # A non-reading parent cannot extend provider lifetime or keep us alive.
        deadline = time.monotonic() + 0.2
        while self.outgoing.unfinished_tasks and time.monotonic() < deadline and not self.failed.is_set():
            await asyncio.sleep(0.005)
        self.closed.set()
        try:
            self.outgoing.put_nowait(None)
        except queue.Full:
            pass


async def _main():
    from .chatgpt_launch import create_client

    loop = asyncio.get_running_loop()
    pipes = _Pipes(loop)
    for name in ("SIGINT", "SIGTERM"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), lambda *_args: loop.call_soon_threadsafe(pipes.failed.set))
    runner = failure = None
    try:
        try:
            async with create_client() as client:
                runner = asyncio.create_task(run_stream(pipes.incoming.get, pipes.emit, client,
                                                       select_version=pipes.select_version))
                failure = asyncio.create_task(pipes.failed.wait())
                await asyncio.wait((runner, failure), return_when=asyncio.FIRST_COMPLETED)
                if not runner.done():
                    runner.cancel()
                await asyncio.gather(runner, return_exceptions=True)
        except Exception:
            # Never emit an unsolicited startup record or raw launch exception.
            # If launch failed, answer the first valid handshake with a closed
            # error so the desktop can explain its missing local prerequisite.
            if runner is None:
                read = asyncio.create_task(pipes.incoming.get())
                failure = asyncio.create_task(pipes.failed.wait())
                try:
                    done, _ = await asyncio.wait((read, failure), return_when=asyncio.FIRST_COMPLETED)
                    if read in done and read.result():
                        value = parse_line(read.result())
                        rpc_id = value.get("id")
                        error = ({"code": "unavailable", "submission": "not_submitted"}
                                 if value.get("version") == LIVE_VERSION else
                                 {"code": "unavailable", "message": ERRORS["unavailable"]})
                        pipes.emit({"id": rpc_id if identifier(rpc_id) else None, "error": error})
                except LocalError:
                    pass
                finally:
                    read.cancel()
                    await asyncio.gather(read, return_exceptions=True)
    finally:
        if failure is not None:
            failure.cancel()
            await asyncio.gather(failure, return_exceptions=True)
        await pipes.close()


def main():
    # Only private pipes are supported. Renderer JSON cannot alter child argv,
    # credentials, state paths or the independently verified isolation policy.
    try:
        if len(sys.argv) != 1 or not all(stat.S_ISFIFO(os.fstat(stream.fileno()).st_mode)
                                        for stream in (sys.stdin, sys.stdout)):
            return 2
    except (OSError, ValueError):
        return 2
    try:
        asyncio.run(_main())
    except (KeyboardInterrupt, BrokenPipeError):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
