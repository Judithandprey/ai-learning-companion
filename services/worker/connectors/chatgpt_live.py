"""Bounded live companion scheduling over the existing owned subscription child."""

import asyncio
from copy import deepcopy
from dataclasses import dataclass, field
import json
import time

from jsonschema import ValidationError

from packages.contracts import live_companion as wire
from .chatgpt_local import MAX_HISTORY, SHUTDOWN_SECONDS, SubscriptionBridge, identifier
from .chatgpt_rpc import RPCError


MAX_OUTPUT_BYTES = 1024 * 1024
_CODES = {
    "quota_exhausted": "allowance_exhausted", "usage_not_allowed": "ordinary_usage_not_allowed",
    "session_budget_exceeded": "budget_reached", "context_window_exceeded": "context_limit",
    "server_overloaded": "overloaded", "cancellation_uncertain": "interrupt_unconfirmed",
    "needs_auth": "unauthenticated", "incomplete_turn": "failed", "request_failed": "failed",
    "outcome_unknown": "failed", "timeout": "failed", "model_mismatch": "unsupported_model",
}


def _code(value):
    return value if value in wire.ERROR_CODES else _CODES.get(value, "unavailable")


def _prepare(turn):
    from services.learning.live_session import prepare_live_session_context
    return prepare_live_session_context(turn)


def _bind(prepared, text, **metadata):
    from services.learning.live_session import bind_live_session_response
    return bind_live_session_response(prepared, text, **metadata)


def _authorize(result, **metadata):
    from services.learning.live_session import authorize_live_presentation
    return authorize_live_presentation(result, **metadata)


def _proof(turn):
    value = deepcopy(turn)
    del value["image"]["png_base64"]
    return value


@dataclass
class _Session:
    start: dict
    deadline: float
    limit: int
    interval: float
    active: bool = False
    stopped: bool = False
    submissions: int = 0
    interrupting: int = 0
    last_observation: float | None = None
    latest: dict | None = None
    timer: asyncio.Task | None = None

    @property
    def observation_limit(self):
        # Keep a fixed 20% (rounded up) of the finite allowance available for
        # explicit focus/follow-ups. This is scheduling, not provider quota.
        return self.limit - max(1, (self.limit + 4) // 5)


@dataclass
class _Turn:
    rpc_id: str
    turn: dict
    session: _Session
    prepared: dict
    cancelled: asyncio.Event = field(default_factory=asyncio.Event)
    reason: str | None = None
    task: asyncio.Task | None = None
    reserved: bool = False
    receipt_started: bool = False
    provider_started: bool = False
    user_cancelled: bool = False


class LiveSubscriptionBridge(SubscriptionBridge):
    """One provider request, one replaceable pending turn, and no automatic retry.

    The active Turn remains authorized across unrelated newer observations.
    Accepted explicit intent and permission changes fence it. Caller changes
    without an accepted Turn require immediate interrupt/Stop; the desktop
    must also revalidate the original request before actual display or speech.
    """

    def __init__(self, client, *, emit, prepare=_prepare, bind=_bind,
                 authorize=_authorize, ready=None, clock=time.monotonic):
        super().__init__(client, emit=emit, prepare=prepare, bind=bind, ready=ready)
        self.authorize, self.clock = authorize, clock
        self.session = self.pending = self.wake = None
        self.session_ids = set()

    def error(self, rpc_id, code, submission="not_submitted"):
        self.emit({"id": rpc_id, "error": {"code": _code(code), "submission": submission}})

    def emit(self, value, *, submission="not_submitted"):
        if self.closed:
            return
        try:
            self._check_output(value)
        except (ValueError, TypeError, UnicodeError, RecursionError):
            value = {"id": value.get("id"), "error": {"code": "context_limit", "submission": submission}}
        self._emit(value)

    @staticmethod
    def _check_output(value):
        encoded = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode() + b"\n"
        if len(encoded) > MAX_OUTPUT_BYTES:
            raise ValueError("Live output exceeds bound")

    async def handle(self, message):
        rpc_id = message.get("id") if type(message) is dict else None
        rpc_id = rpc_id if identifier(rpc_id) else None
        try:
            checked = wire.validate_request(message)
            if self.closed or self.client.terminal.is_set():
                raise RPCError("unavailable")
            if rpc_id in self.rpc_ids:
                raise RPCError("invalid_request")
            method, params = checked["method"], checked["params"]
            if self.exhausted.is_set() or len(self.rpc_ids) >= MAX_HISTORY:
                self.exhausted.set()
                if method in ("companion/interrupt", "companion/stop"):
                    self._control(rpc_id, params, stopping=method == "companion/stop")
                    return
                if method == "connection/login/cancel" and params["login_id"] == self.login_id:
                    self._spawn(self._cancel_login(rpc_id, params["login_id"]))
                    return
                raise RPCError("unavailable")
            self.rpc_ids.add(rpc_id)
            if method in ("companion/interrupt", "companion/stop"):
                self._control(rpc_id, params, stopping=method == "companion/stop")
            elif len(self.tasks) >= 32:
                raise RPCError("busy")
            elif method == "companion/start":
                self._begin_session(rpc_id, params)
            elif method == "companion/turn":
                self._accept(rpc_id, params)
            elif method in ("connection/read", "connection/login/start"):
                if method == "connection/login/start":
                    if self.login_id or self.login_starting or (self.session is not None and not self.session.stopped):
                        raise RPCError("busy")
                    self.login_starting = True
                self._spawn(self._connection(rpc_id, method))
            elif method == "connection/login/cancel":
                if params["login_id"] != self.login_id:
                    raise RPCError("login_not_found")
                self._spawn(self._cancel_login(rpc_id, params["login_id"]))
        except (ValidationError, ValueError, TypeError, KeyError, RecursionError):
            self.error(rpc_id, "invalid_request")
        except RPCError as exc:
            self.error(rpc_id, exc.code)
        finally:
            if self.exhausted.is_set():
                self._retire()

    def _retire(self):
        self.exhausted.set()
        if self.session is not None and not self.session.stopped:
            self._stop_session(self.session, "unavailable")

    async def _connection(self, rpc_id, method):
        if method != "connection/read":
            return await super()._connection(rpc_id, method)
        try:
            await self._ready()
            result = wire.validate("Connection", await self.client.connection_read_live())
            self.emit({"id": rpc_id, "result": result})
        except Exception as exc:
            self.error(rpc_id, getattr(exc, "code", "unavailable"))

    def _begin_session(self, rpc_id, params):
        if params["session_id"] in self.session_ids:
            raise RPCError("session_stopped")
        if (self.active is not None or self.pending is not None or self.login_id or self.login_starting
                or (self.session is not None and not self.session.stopped)):
            raise RPCError("busy")
        if params["permissions"]["microphone"] or params["permissions"]["system_audio"]:
            raise RPCError("unavailable")
        policy = params["policy"]
        session = _Session(params, self.clock() + policy["max_session_ms"] / 1000,
                           policy["max_submissions"], policy["min_observation_interval_ms"] / 1000)
        self.session_ids.add(params["session_id"])
        self.session = session
        session.timer = self._spawn(self._deadline(session))
        self._spawn(self._start(rpc_id, session))

    async def _start(self, rpc_id, session):
        try:
            await self._ready()
            status = wire.validate("Connection", await self.client.connection_read_live())
            self._session_current(session)
            if status["auth"]["state"] != "signed_in" or status["auth"]["mode"] != "chatgpt":
                raise RPCError("unauthenticated")
            if not any(row["id"] == session.start["model"] and row["image_input"] for row in status["models"]):
                raise RPCError("unsupported_model")
            session.active = True
            self.emit({"id": rpc_id, "result": {"session_id": session.start["session_id"],
                "epoch": session.start["epoch"], "remaining_submissions": session.limit,
                "expires_in_ms": max(0, int((session.deadline - self.clock()) * 1000))}})
        except Exception as exc:
            self._stop_session(session, _code(getattr(exc, "code", "unavailable")))
            self.error(rpc_id, getattr(exc, "code", "unavailable"))

    def _session_current(self, session):
        if self.closed or self.client.terminal.is_set():
            raise RPCError("unavailable")
        if session is not self.session or session.stopped:
            raise RPCError("session_stopped")
        if self.clock() >= session.deadline:
            self._stop_session(session, "budget_reached")
            raise RPCError("budget_reached")

    async def _deadline(self, session):
        while not session.stopped:
            await asyncio.sleep(max(0, session.deadline - self.clock()))
            if self.clock() >= session.deadline:
                self._stop_session(session, "budget_reached")

    def _accept(self, rpc_id, turn):
        session = self.session
        if session is None:
            raise RPCError("session_stopped")
        self._session_current(session)
        if not session.active:
            raise RPCError("busy")
        if (turn["session_id"] != session.start["session_id"] or turn["epoch"] != session.start["epoch"]
                or turn["context"]["capture_session_id"] != session.start["capture_session_id"]):
            raise RPCError("stale_context")
        if turn["request_id"] in self.request_ids:
            raise RPCError("invalid_request")
        previous = session.latest
        if previous is not None:
            before, now = previous["context"]["frame_seq"], turn["context"]["frame_seq"]
            if (turn["permission_revision"] < previous["permission_revision"] or now < before
                    or (now == before and (turn["context"] != previous["context"] or turn["image"] != previous["image"]))):
                raise RPCError("stale_context")
        withdrawal = turn["trigger"] != "observation" and (turn["allowed_assistance"] == "none" or turn["presentation"] == "none")
        if not withdrawal and self.pending is not None and self.pending.turn["trigger"] != "observation":
            raise RPCError("busy")
        limit = session.observation_limit if turn["trigger"] == "observation" else session.limit
        if not withdrawal and session.submissions >= limit:
            raise RPCError("budget_reached")
        try:
            prepared = self.prepare(deepcopy(turn))
        except (ValueError, TypeError, KeyError, ValidationError, RecursionError):
            raise RPCError("invalid_request") from None
        self._session_current(session)
        self.request_ids.add(turn["request_id"])
        session.latest = turn
        if withdrawal:
            self._drop_pending("cancelled")
            self._fence_active("stale_context")
            self.error(rpc_id, "cancelled")
            return
        if previous is not None and (turn["permission_revision"] > previous["permission_revision"]
                                     or turn["trigger"] != "observation"):
            self._fence_active("stale_context")
        self._drop_pending("stale_context")
        self.pending = _Turn(rpc_id, turn, session, prepared)
        self._schedule()

    def _drop_pending(self, code):
        if self.pending is not None:
            job, self.pending = self.pending, None
            self.error(job.rpc_id, code)
        if self.wake is not None and self.wake is not asyncio.current_task():
            self.wake.cancel()
            self.wake = None

    def _schedule(self):
        if self.closed or self.active is not None or self.pending is None:
            return
        job, session = self.pending, self.pending.session
        if session.interrupting:
            return
        if session.stopped or self.client.terminal.is_set():
            self._drop_pending("session_stopped")
            return
        if job.turn["trigger"] == "observation" and session.last_observation is not None:
            delay = session.last_observation + session.interval - self.clock()
            if delay > 0:
                if self.wake is None:
                    self.wake = self._spawn(self._wait_observation(delay))
                return
        self.pending = None
        self.active = job
        job.task = self._spawn(self._run(job))

    async def _wait_observation(self, delay):
        try:
            await asyncio.sleep(delay)
        finally:
            if self.wake is asyncio.current_task():
                self.wake = None
        self._schedule()

    def _current_state(self, job):
        return {"active": self.active is job and not self.closed and job.session is self.session
                and job.session.active and not job.session.stopped and self.clock() < job.session.deadline
                and job.session.latest["permission_revision"] == job.turn["permission_revision"],
                "cancelled": job.cancelled.is_set(), "provenance": _proof(job.turn)}

    def _guard(self, job, method=None):
        if job.reason:
            raise RPCError(job.reason)
        self._session_current(job.session)
        if job.cancelled.is_set():
            raise RPCError("cancelled")
        if (self.active is not job
                or job.session.latest["permission_revision"] != job.turn["permission_revision"]
                or _proof(job.turn) != job.prepared["provenance"]):
            raise RPCError("stale_context")
        if not job.reserved:
            limit = job.session.observation_limit if job.turn["trigger"] == "observation" else job.session.limit
            if job.session.submissions >= limit:
                raise RPCError("budget_reached")
            if (method is not None and job.turn["trigger"] == "observation" and job.session.last_observation is not None
                    and self.clock() < job.session.last_observation + job.session.interval):
                raise RPCError("budget_reached")
        if method == "turn/start" and not job.reserved:
            job.reserved = True
            job.session.submissions += 1
            if job.turn["trigger"] == "observation":
                job.session.last_observation = self.clock()

    def _submission(self, job):
        if not job.provider_started:
            return "not_submitted"
        value = self.client.request_submission()
        return value if value in ("not_submitted", "submitted", "unknown") else "unknown"

    async def _run(self, job):
        started, outcome = self.clock(), "not_submitted"
        try:
            self._guard(job)
            prepared = job.prepared
            self.client.begin_request(job.turn["request_id"])
            job.receipt_started = True
            job.provider_started = True
            answer = await self.client.ask(prepared["text"], prepared["image_bytes"], model=job.session.start["model"],
                cancelled=job.cancelled, send_guard=lambda method: self._guard(job, method))
            self._guard(job)
            if answer["model"] != job.session.start["model"]:
                raise RPCError("model_mismatch")
            try:
                result = self.bind(prepared, answer["text"], current_state=self._current_state(job),
                    model=answer["model"], auth_mode="chatgpt", latency_ms=max(0, int((self.clock() - started) * 1000)),
                    thread_id=answer["thread_id"], turn_id=answer["turn_id"])
                wire.validate("Result", result)
                if job.turn["trigger"] != "observation":
                    self.authorize(result, current_state=self._current_state(job),
                                   channel="audio" if job.turn["presentation"] == "spoken" else "text")
            except (ValueError, TypeError, KeyError, ValidationError, RecursionError):
                raise RPCError("stale_context") from None
            self._guard(job)
            try:
                self._check_output({"id": job.rpc_id, "result": result})
            except (ValueError, TypeError, UnicodeError, RecursionError):
                raise RPCError("context_limit") from None
            self.client.finish_request("completed")
            self._guard(job)
            outcome = "completed"
            self.emit({"id": job.rpc_id, "result": result}, submission=self._submission(job))
        except asyncio.CancelledError:
            failure = getattr(self.client, "request_failure", lambda: None)()
            outcome = ("cancelled" if job.user_cancelled else "not_submitted" if self._submission(job) == "not_submitted"
                       else "uncertain" if self.exhausted.is_set() else getattr(failure, "outcome", None) or "uncertain")
            if not self.closed:
                self.error(job.rpc_id, job.reason or getattr(failure, "code", "unavailable"), self._submission(job))
        except Exception as exc:
            failure = _code(getattr(exc, "code", "unavailable"))
            code = job.reason or failure
            submission = self._submission(job)
            outcome = ("cancelled" if job.user_cancelled else "not_submitted" if submission == "not_submitted"
                       else "uncertain" if self.exhausted.is_set() else getattr(exc, "outcome", None) or
                       ("uncertain" if submission == "unknown" or getattr(exc, "code", None) in
                        ("outcome_unknown", "timeout", "cancellation_uncertain") else "failed"))
            if job.provider_started and (submission == "unknown"
                    or failure not in ("cancelled", "stale_context", "session_stopped")):
                self._stop_session(job.session, failure)
            self.error(job.rpc_id, code, submission)
        finally:
            if job.receipt_started and outcome != "completed":
                try:
                    self.client.finish_request(outcome)
                except Exception:
                    self._stop_session(job.session, "unavailable")
            if self.active is job:
                self.active = None
            self._schedule()

    def _fence_active(self, reason, *, interrupt=True):
        job = self.active
        if job is not None:
            # A failed interruption does not replace the user's existing Stop
            # or cancellation reason; its uncertainty is reported separately.
            if not job.user_cancelled and (reason != "interrupt_unconfirmed" or job.reason is None):
                job.reason = reason
            job.user_cancelled = job.user_cancelled or reason in ("cancelled", "session_stopped")
            job.cancelled.set()
            if interrupt:
                job.session.interrupting += 1
                self._spawn(self._settle_interrupt(job))

    def _stop_session(self, session, code, *, interrupt=True):
        session.active, session.stopped = False, True
        if session.timer is not None and session.timer is not asyncio.current_task():
            session.timer.cancel()
        if session is self.session:
            self._drop_pending(code)
            if self.active is not None and self.active.session is session:
                self._fence_active(code, interrupt=interrupt)

    def _control(self, rpc_id, params, *, stopping):
        session = self.session
        if session is None or params["session_id"] != session.start["session_id"] or params["epoch"] != session.start["epoch"]:
            self.emit({"id": rpc_id, "result": {"cancelled": False, "uncertain": False}})
            return
        request_id = None if stopping else params["request_id"]
        job = self.active if self.active is not None and (request_id is None or self.active.turn["request_id"] == request_id) else None
        pending = self.pending is not None and (request_id is None or self.pending.turn["request_id"] == request_id)
        cancelled = job is not None or pending
        if stopping:
            self._stop_session(session, "session_stopped", interrupt=False)
        elif job is not None or pending or request_id is None:
            if pending or request_id is None:
                self._drop_pending("cancelled")
            if job is not None:
                job.reason = "cancelled"
                job.user_cancelled = True
                job.cancelled.set()
        if job is not None:
            job.session.interrupting += 1
        self._spawn(self._control_reply(rpc_id, job, cancelled))

    async def _interrupt_job(self, job):
        if self.active is not job:
            return not job.reserved
        try:
            async with asyncio.timeout(SHUTDOWN_SECONDS):
                return await self.client.interrupt() is True
        except Exception:
            return False

    async def _control_reply(self, rpc_id, job, cancelled):
        confirmed = True if job is None else await self._settle_interrupt(job)
        self.emit({"id": rpc_id, "result": {"cancelled": cancelled, "uncertain": not confirmed}})

    async def _settle_interrupt(self, job):
        try:
            confirmed = await self._interrupt_job(job)
            if not confirmed:
                self._stop_session(job.session, "interrupt_unconfirmed", interrupt=False)
            return confirmed
        finally:
            job.session.interrupting -= 1
            self._schedule()

    async def close(self, *, terminal_failure=False):
        if self.closed:
            return
        if terminal_failure and self.active is not None:
            job = self.active
            failure = getattr(self.client, "request_failure", lambda: None)()
            self.error(job.rpc_id, job.reason or getattr(failure, "code", "unavailable"), self._submission(job))
        self.closed = True
        if self.session is not None:
            self.session.active, self.session.stopped = False, True
        self.pending = None
        job = self.active
        if job is not None and not terminal_failure:
            job.reason = "cancelled"
            job.user_cancelled = True
            job.cancelled.set()
        tasks = tuple(self.tasks)
        for task in tasks:
            task.cancel()
        async with asyncio.timeout(SHUTDOWN_SECONDS):
            try:
                await self.client.close()
            finally:
                await asyncio.gather(*tasks, return_exceptions=True)
                self.active = None
