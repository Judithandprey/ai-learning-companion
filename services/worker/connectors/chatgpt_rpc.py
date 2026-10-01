"""Private, bounded Codex App Server 0.158 JSONL client.

The owner supplies a verified isolated launch, including an explicit environment
and product-owned managed-login home. This module never reads credentials,
inherits an environment, retries inference, or executes a server tool request.
Protocol source: https://learn.chatgpt.com/docs/app-server and the installed
0.158.0 generated schemas. Event refusal is defense in depth, not tool isolation.
"""

import asyncio
import base64
from datetime import datetime, timezone
from hashlib import sha256
import inspect
import json
import math
import re
from urllib.parse import urlsplit


MAX_LINE_BYTES = 12 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARS = 32000
MAX_PROMPT_CHARS = 65536
MAX_TURN_EVENTS = 4096
# Engineering receive allowance, not a provider guarantee: 24 MiB for 32k
# one-character JSONL deltas (768 framing bytes each), plus 8 MiB for reasoning
# and metadata. All received bytes count, including empty/foreign notifications.
MAX_TURN_WIRE_BYTES = 32 * 1024 * 1024
_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}\Z")
_PLANS = frozenset(("free", "go", "plus", "pro", "prolite", "promax", "team",
    "self_serve_business_prolite", "self_serve_business_usage_based", "business",
    "ent26", "enterprise_cbp_automation", "enterprise_cbp_usage_based",
    "enterprise", "edu", "edu_plus", "edu_pro", "unknown"))
_ITEM_TYPES = frozenset(("userMessage", "hookPrompt", "agentMessage", "functionCallOutput", "plan",
    "reasoning", "commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall",
    "subAgentActivity", "webSearch", "imageView", "sleep", "imageGeneration", "enteredReviewMode",
    "exitedReviewMode", "contextCompaction"))
_MESSAGES = {
    "unavailable": "The managed connection is unavailable.",
    "protocol_error": "The managed connection returned an invalid response.",
    "request_failed": "The managed request failed.",
    "timeout": "The managed request timed out.",
    "outcome_unknown": "The request outcome is unknown; it was not retried.",
    "cancelled": "The request was cancelled.",
    "cancellation_uncertain": "The response was suppressed; interruption is unconfirmed.",
    "isolation_unverified": "Tool-free execution has not been verified.",
    "unauthenticated": "Managed ChatGPT login is required.",
    "unsupported_model": "The selected model does not advertise image input.",
    "model_mismatch": "The managed connection changed the selected model.",
    "tool_activity": "Tool activity is not permitted for this request.",
    "incomplete_turn": "The managed turn did not produce a completed answer.",
    "quota_exhausted": "The subscription reports an unavailable usage allowance.",
    "busy": "Another managed request is in progress.",
    "invalid_request": "The managed request is invalid.",
    "login_not_found": "This connection has no matching pending login.",
    "login_failed": "Managed login could not be started.",
    "closed": "The managed connection is closed.",
}


class RPCError(Exception):
    """Only fixed codes/messages may cross the desktop bridge."""

    def __init__(self, code):
        self.code = code if code in _MESSAGES else "unavailable"
        self.message = _MESSAGES[self.code]
        super().__init__(self.message)


def _identifier(value):
    if type(value) is not str or _IDENTIFIER.fullmatch(value) is None:
        raise RPCError("protocol_error")
    return value


def _object(value):
    if type(value) is not dict:
        raise RPCError("protocol_error")
    return value


def _pairs(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError("duplicate key")
        result[name] = value
    return result


def _invalid_constant(_):
    raise ValueError("nonfinite number")


def _finite_float(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("nonfinite number")
    return value


class ChatGPTAppServer:
    def __init__(self, command, *, cwd, env, on_event=None, rpc_timeout=15,
                 turn_timeout=120, shutdown_timeout=3, isolation_verified=False,
                 verify_config=None, on_receipt=None, expected_provider="openai"):
        if (not isinstance(command, (list, tuple)) or not command
                or any(type(part) is not str or not part or "\0" in part for part in command)
                or type(cwd) is not str or not cwd or type(env) is not dict
                or any(type(k) is not str or type(v) is not str for k, v in env.items())
                or type(isolation_verified) is not bool
                or (on_event is not None and not callable(on_event))
                or (verify_config is not None and not callable(verify_config))
                or (on_receipt is not None and (not callable(on_receipt) or inspect.iscoroutinefunction(on_receipt)))
                or type(expected_provider) is not str or _IDENTIFIER.fullmatch(expected_provider) is None
                or any(type(t) not in (int, float) or not math.isfinite(t) or not 0 < t <= 600
                       for t in (rpc_timeout, turn_timeout, shutdown_timeout))):
            raise RPCError("invalid_request")
        self.command, self.cwd, self.env = tuple(command), cwd, env.copy()
        self.on_event = on_event
        self.verify_config = verify_config
        self.on_receipt = on_receipt
        self.expected_provider = expected_provider
        self._receipt = None
        self._thread_start_count = self._turn_start_count = 0
        # A supplied launch verifier always wins over the synthetic-test gate.
        self.isolation_verified = isolation_verified if verify_config is None else False
        self.rpc_timeout, self.turn_timeout, self.shutdown_timeout = rpc_timeout, turn_timeout, shutdown_timeout
        self._process = self._reader = None
        self._write_lock = asyncio.Lock()
        self._close_lock = asyncio.Lock()
        self._interrupt_lock = asyncio.Lock()
        self._pending, self._next_id = {}, 0
        self._started = self._closed = False
        # Unusable is distinct from reaped; the owner still awaits close().
        self.terminal = asyncio.Event()
        self._fatal = None
        self._active = None
        self._login_id = None
        self._login_starting = False
        self._early_login = {}
        self._observed_auth_mode = "unobserved"

    async def start(self):
        if self._process is not None or self._closed:
            raise RPCError("closed" if self._closed else "busy")
        try:
            self._process = await asyncio.create_subprocess_exec(
                *self.command, cwd=self.cwd, env=self.env,
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL, limit=MAX_LINE_BYTES + 1)
            self._reader = asyncio.create_task(self._read_loop())
            result = await self._rpc("initialize", {
                "clientInfo": {"name": "learning_companion", "version": "0.1.0"},
                "capabilities": {"experimentalApi": True, "explicitGatewayOauth": True}})
            _object(result)
            await self._send({"method": "initialized", "params": {}})
            await self._verify_isolation()
            self._started = True
        except asyncio.CancelledError:
            await self.close()
            raise
        except Exception:
            await self.close()
            raise RPCError("unavailable") from None

    async def _verify_isolation(self):
        if self.verify_config is None:
            return
        self.isolation_verified = False
        try:
            # Official configuration, requirements and discovered skills stay
            # in memory only. Recheck before each thread after possible changes.
            config = await self._rpc("config/read", {"includeLayers": True, "cwd": self.cwd})
            requirements = await self._rpc("configRequirements/read", None)
            skills = await self._rpc("skills/list", {"cwds": [self.cwd], "forceReload": True})
            verified = self.verify_config(config, requirements, skills)
            if inspect.isawaitable(verified):
                verified = await asyncio.wait_for(verified, self.rpc_timeout)
            if verified is not True or self._fatal is not None or self._closed:
                raise RPCError("isolation_unverified")
            self.isolation_verified = True
        except asyncio.CancelledError:
            self._fail("isolation_unverified")
            raise
        except Exception:
            self._fail("isolation_unverified")
            raise RPCError("isolation_unverified") from None

    def begin_request(self, request_id):
        if (type(request_id) is not str or not 1 <= len(request_id) <= 128
                or any(ord(c) < 32 or ord(c) == 127 or 0xD800 <= ord(c) <= 0xDFFF for c in request_id)):
            raise RPCError("invalid_request")
        if self._active is not None:
            raise RPCError("busy")
        self._receipt = {"request_id": request_id, "input_types": [], "text_bytes": None,
            "text_sha256": None, "image_bytes": None, "image_sha256": None,
            "submission": "not_submitted", "terminal_status": None, "outcome": "pending",
            "produced_item_types": [], "thread_start_count": self._thread_start_count,
            "turn_start_count": self._turn_start_count, "actual_model": None, "thread_id": None, "turn_id": None}
        self._record(self._receipt)

    def finish_request(self, outcome):
        if outcome not in ("completed", "cancelled", "failed", "not_submitted", "uncertain"):
            raise RPCError("invalid_request")
        self._record(self._receipt, outcome=outcome)

    def _record(self, receipt, **facts):
        if receipt is None or receipt is not self._receipt:
            return
        receipt.update(facts, thread_start_count=self._thread_start_count, turn_start_count=self._turn_start_count)
        if self.on_receipt is not None:
            detached = {k: v.copy() if type(v) is list else v for k, v in receipt.items()}
            try:
                result = self.on_receipt(detached)
                if inspect.isawaitable(result):
                    if inspect.iscoroutine(result):
                        result.close()
                    raise RPCError("unavailable")
            except Exception:
                self._fail("unavailable")
                raise RPCError("unavailable") from None

    async def _send(self, message, *, before_send=None):
        if self._closed or self._fatal is not None or self._process is None:
            raise RPCError(self._fatal or "closed")
        method = message.get("method")
        receipt = self._active.get("receipt") if self._active is not None else None
        sending = False
        try:
            encoded = json.dumps(message, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode() + b"\n"
            if len(encoded) > MAX_LINE_BYTES:
                raise RPCError("invalid_request")
            async with self._write_lock:
                if before_send is not None:
                    before_send()
                if method == "turn/start":
                    # Persist conservative send intent before publishing bytes:
                    # a crash after write must not leave a definitive no-send
                    # receipt. Callback failure here prevents stdin.write.
                    self._record(receipt, submission="uncertain")
                sending = True
                self._process.stdin.write(encoded)
                if method == "thread/start":
                    self._thread_start_count += 1
                elif method == "turn/start":
                    self._turn_start_count += 1
                await asyncio.wait_for(self._process.stdin.drain(), self.rpc_timeout)
                if method in ("thread/start", "turn/start"):
                    self._record(receipt, **({"submission": "written"} if method == "turn/start" else {}))
        except asyncio.CancelledError:
            if sending and method == "turn/start":
                self._record(receipt, submission="uncertain")
            raise
        except RPCError:
            raise
        except Exception:
            if sending and method == "turn/start":
                self._record(receipt, submission="uncertain")
            self._fail("unavailable")
            raise RPCError("unavailable") from None

    async def _rpc(self, method, params, *, before_send=None):
        if len(self._pending) >= 16:
            raise RPCError("busy")
        self._next_id += 1
        request_id = self._next_id
        future = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        try:
            await self._send({"id": request_id, "method": method, "params": params}, before_send=before_send)
            return await asyncio.wait_for(future, self.rpc_timeout)
        except TimeoutError:
            self._fail("timeout")
            raise RPCError("outcome_unknown" if method == "turn/start" else "timeout") from None
        finally:
            self._pending.pop(request_id, None)
            if not future.done():
                future.cancel()
            elif not future.cancelled():
                future.exception()  # Retrieve failures even when write/cancellation won the race.

    def _fail(self, code):
        self._fatal = self._fatal or code
        self.terminal.set()
        for future in self._pending.values():
            if not future.done():
                future.set_exception(RPCError(self._fatal))
        if self._active is not None and not self._active["done"].done():
            self._active["done"].set_result({"failure": self._fatal})
        # A broken protocol/tool boundary cannot safely keep running. This is
        # only the child created by this instance; close() also reaps it.
        if self._process is not None and self._process.returncode is None:
            try:
                self._process.kill()
            except ProcessLookupError:
                pass

    async def _read_loop(self):
        try:
            lines_since_yield = bytes_since_yield = 0
            while not self._closed and self._fatal is None:
                line = await self._process.stdout.readline()
                if not line:
                    if not self._closed:
                        self._fail("unavailable")
                    return
                if len(line) > MAX_LINE_BYTES or not line.endswith(b"\n"):
                    raise RPCError("protocol_error")
                if self._active is not None:
                    self._active["wire_bytes"] += len(line)
                    if self._active["wire_bytes"] > MAX_TURN_WIRE_BYTES:
                        raise RPCError("protocol_error")
                message = _object(json.loads(line.decode("utf-8"), object_pairs_hook=_pairs,
                                             parse_constant=_invalid_constant, parse_float=_finite_float))
                if "method" in message:
                    if type(message["method"]) is not str:
                        raise RPCError("protocol_error")
                    if "id" in message:
                        await self._send({"id": message["id"], "error": {
                            "code": -32601, "message": "Server requests are disabled."}})
                        self._fail("tool_activity")
                        return
                    await self._notification(message["method"], _object(message.get("params", {})))
                else:
                    request_id = message.get("id")
                    if (type(request_id) is not int or not 1 <= request_id <= self._next_id
                            or ("result" in message) == ("error" in message)):
                        raise RPCError("protocol_error")
                    future = self._pending.get(request_id)
                    if future is not None and not future.done():
                        if "error" in message:
                            future.set_exception(RPCError("request_failed"))
                        else:
                            future.set_result(_object(message["result"]))
                lines_since_yield += 1
                bytes_since_yield += len(line)
                if lines_since_yield >= 64 or bytes_since_yield >= 256 * 1024:
                    # readline() can return immediately from buffered input.
                    # Let deadlines, cancellation and parent cleanup run even
                    # during a flood, including outside an active ask.
                    lines_since_yield = bytes_since_yield = 0
                    await asyncio.sleep(0)
        except asyncio.CancelledError:
            raise
        except Exception:
            self._fail("protocol_error")

    async def _emit(self, method, params):
        if self.on_event is not None:
            result = self.on_event(method, params)
            if inspect.isawaitable(result):
                await asyncio.wait_for(result, self.rpc_timeout)

    async def _login_completed(self, params):
        login_id = params.get("loginId")
        if type(login_id) is not str or type(params.get("success")) is not bool:
            return
        safe = {"login_id": _identifier(login_id), "success": params["success"],
                "error": None if params["success"] else _MESSAGES["login_failed"]}
        if login_id == self._login_id:
            self._login_id = None
            if params["success"]:
                self._observed_auth_mode = "chatgpt"
            await self._emit("connection/login/completed", safe)
        elif self._login_starting:
            if len(self._early_login) >= 8:
                raise RPCError("protocol_error")
            self._early_login[login_id] = safe

    async def _notification(self, method, params):
        if method == "account/login/completed":
            await self._login_completed(params)
            return
        if method == "account/updated":
            self._observed_auth_mode = params.get("authMode")
            if self._active is not None and self._observed_auth_mode != "chatgpt":
                self._fail("unauthenticated")
            await self._emit("connection/changed", {})
            return
        # Tool activity anywhere in our private child violates this launch's
        # contract, even if it names an unexpected helper thread.
        if (method.startswith(("hook/", "item/command", "item/fileChange", "item/mcp", "item/tool/"))
                or method in ("turn/diff/updated", "turn/plan/updated")):
            self._fail("tool_activity")
            return
        if method == "model/rerouted":
            if self._active is not None:
                self._record(self._active["receipt"], actual_model=_identifier(params.get("toModel")))
            self._fail("model_mismatch")
            return
        if (method in ("item/started", "item/completed")
                and _object(params.get("item")).get("type") not in ("userMessage", "agentMessage", "reasoning")):
            if self._active is not None:
                self._record_item_type(self._active, params["item"].get("type"))
            self._fail("tool_activity")
            return
        active = self._active
        if active is None:
            return
        if params.get("threadId") != active["thread_id"] or active["thread_id"] is None:
            return
        if method in ("turn/started", "turn/completed", "item/started", "item/completed"):
            active["events"] += 1
            if active["events"] > MAX_TURN_EVENTS:
                raise RPCError("protocol_error")
        if method in ("turn/started", "turn/completed"):
            turn = _object(params.get("turn"))
            turn_id = _identifier(turn.get("id"))
            if not active["submitted"]:
                raise RPCError("protocol_error")
            if active["turn_id"] is not None and turn_id != active["turn_id"]:
                raise RPCError("protocol_error")
            active["turn_id"] = turn_id
            self._record(active["receipt"], turn_id=turn_id)
            active["known"].set()
            if method == "turn/completed":
                if turn.get("status") not in ("completed", "failed", "interrupted"):
                    raise RPCError("protocol_error")
                self._record(active["receipt"], terminal_status=turn["status"])
                items = turn.get("items")
                if type(items) is not list or len(items) > MAX_TURN_EVENTS:
                    raise RPCError("protocol_error")
                view = turn.get("itemsView", "full")
                if view not in ("full", "summary", "notLoaded"):
                    raise RPCError("protocol_error")
                for item in items:
                    self._item(active, item, completed=view == "full")
                if not active["done"].done():
                    active["done"].set_result(turn)
        elif method in ("item/started", "item/completed"):
            turn_id = _identifier(params.get("turnId"))
            if not active["submitted"] or (active["turn_id"] is not None and turn_id != active["turn_id"]):
                raise RPCError("protocol_error")
            active["turn_id"] = turn_id
            active["known"].set()
            self._item(active, params.get("item"), completed=method == "item/completed")
        elif method == "error":
            error = params.get("error", {})
            code = error.get("codexErrorInfo") if type(error) is dict else None
            self._fail("quota_exhausted" if code in ("usageLimitExceeded", "rateLimitExceeded")
                       else "unauthenticated" if code == "unauthorized" else "incomplete_turn")

    def _item(self, active, item, *, completed):
        item = _object(item)
        kind = item.get("type")
        self._record_item_type(active, kind)
        if kind not in ("userMessage", "agentMessage", "reasoning"):
            self._fail("tool_activity")
            return
        if kind == "agentMessage" and completed:
            item_id = _identifier(item.get("id"))
            text, phase = item.get("text"), item.get("phase")
            if type(text) is not str or len(text) > MAX_TEXT_CHARS or phase not in (None, "commentary", "final_answer"):
                raise RPCError("protocol_error")
            value = (phase, text)
            if item_id in active["messages"] and active["messages"][item_id] != value:
                raise RPCError("protocol_error")
            active["messages"][item_id] = value
            if sum(len(row[1]) for row in active["messages"].values()) > MAX_TEXT_CHARS:
                raise RPCError("protocol_error")

    def _record_item_type(self, active, kind):
        receipt = active["receipt"]
        if receipt is not None and type(kind) is str and kind in _ITEM_TYPES:
            types = receipt["produced_item_types"]
            if kind not in types:
                self._record(receipt, produced_item_types=[*types, kind])

    def _ready(self):
        if not self._started or self._closed or self._fatal:
            raise RPCError(self._fatal or "closed")

    async def _account(self):
        result = await self._rpc("account/read", {"refreshToken": False})
        account = result.get("account")
        if account is None:
            return {"auth_mode": None, "auth_status": "needs_auth", "plan": None}
        account = _object(account)
        if account.get("type") != "chatgpt" or self._observed_auth_mode not in ("unobserved", "chatgpt"):
            return {"auth_mode": None, "auth_status": "unsupported", "plan": None}
        plan = account.get("planType")
        return {"auth_mode": "chatgpt", "auth_status": "authenticated",
                "plan": plan if type(plan) is str and plan in _PLANS else "unknown"}

    async def _models(self):
        models, cursor, seen = [], None, set()
        for _ in range(8):
            result = await self._rpc("model/list", {"cursor": cursor, "limit": 100, "includeHidden": False})
            rows = result.get("data")
            if type(rows) is not list or len(rows) > 100:
                raise RPCError("protocol_error")
            for row in rows:
                row = _object(row)
                modalities = row.get("inputModalities", [])
                label = row.get("displayName")
                if (type(modalities) is not list or any(v not in ("text", "image", "audio") for v in modalities)
                        or type(label) is not str or not 0 < len(label) <= 128
                        or type(row.get("isDefault")) is not bool):
                    raise RPCError("protocol_error")
                models.append({"id": _identifier(row.get("id")), "model": _identifier(row.get("model")),
                               "display_name": label, "input_modalities": modalities.copy(),
                               "is_default": row["isDefault"]})
                if len(models) > 256:
                    raise RPCError("protocol_error")
            cursor = result.get("nextCursor")
            if cursor is None:
                return models
            if type(cursor) is not str or not 0 < len(cursor) <= 4096 or cursor in seen:
                raise RPCError("protocol_error")
            seen.add(cursor)
        raise RPCError("protocol_error")

    @staticmethod
    def _window(window):
        if window is None:
            return None
        window = _object(window)
        result = {}
        for field, target in (("usedPercent", "used_percent"), ("windowDurationMins", "window_duration_mins"),
                              ("resetsAt", "resets_at")):
            value = window.get(field)
            if (value is None and field == "usedPercent") or (value is not None and
                    (type(value) is not int or value < 0 or value > 2**63 - 1)):
                raise RPCError("protocol_error")
            result[target] = value
        return result

    async def _quota(self):
        quota = {"available": False, "ordinary_usage_allowed": None, "windows": []}
        try:
            result = await self._rpc("account/rateLimits/read", {})
            snapshots = result.get("rateLimitsByLimitId")
            if snapshots is None:
                snapshots = {None: _object(result.get("rateLimits"))}
            if type(snapshots) is not dict or len(snapshots) > 100:
                raise RPCError("protocol_error")
            windows = []
            for limit_id, snapshot in snapshots.items():
                snapshot = _object(snapshot)
                limit_id = snapshot.get("limitId", limit_id)
                windows.append({"limit_id": _identifier(limit_id) if limit_id is not None else None,
                                "primary": self._window(snapshot.get("primary")),
                                "secondary": self._window(snapshot.get("secondary"))})
            allowed = result.get("ordinaryUsageAllowed")
            if allowed is not None and type(allowed) is not bool:
                raise RPCError("protocol_error")
            return {"available": True, "ordinary_usage_allowed": allowed, "windows": windows}
        except RPCError as error:
            if error.code != "request_failed":
                raise
        return quota

    async def connection_read(self):
        self._ready()
        account = await self._account()
        models = await self._models()
        quota = await self._quota() if account["auth_mode"] == "chatgpt" else {"available": False}
        limits = None
        if quota["available"]:
            limits = []
            for snapshot in quota["windows"]:
                for role in ("primary", "secondary"):
                    window = snapshot[role]
                    if window is not None:
                        try:
                            reset = (None if window["resets_at"] is None else
                                     datetime.fromtimestamp(window["resets_at"], timezone.utc).isoformat().replace("+00:00", "Z"))
                        except (ValueError, OverflowError, OSError):
                            raise RPCError("protocol_error") from None
                        limits.append({"label": f"{snapshot['limit_id']}/{role}" if snapshot["limit_id"] else role,
                                       "used_percent": window["used_percent"], "resets_at": reset})
        return {"auth": {"state": {"authenticated": "signed_in", "needs_auth": "signed_out",
                                    "unsupported": "unknown"}[account["auth_status"]],
                         "mode": account["auth_mode"], "plan": account["plan"]},
                "rate_limits": limits,
                "models": [{"id": row["model"], "label": row["display_name"],
                            "image_input": "image" in row["input_modalities"], "default": row["is_default"]}
                           for row in models]}

    async def login_start(self):
        self._ready()
        if self._login_starting or self._login_id is not None or self._active is not None:
            raise RPCError("busy")
        self._login_starting = True
        try:
            result = await self._rpc("account/login/start", {"type": "chatgpt"})
            if result.get("type") != "chatgpt":
                raise RPCError("login_failed")
            login_id, url = _identifier(result.get("loginId")), result.get("authUrl")
            if type(url) is not str or len(url) > 16384 or any(ord(c) < 32 or ord(c) == 127 for c in url):
                raise RPCError("login_failed")
            parsed = urlsplit(url)
            host = parsed.hostname or ""
            if (parsed.scheme != "https" or not any(host == domain or host.endswith("." + domain)
                    for domain in ("openai.com", "chatgpt.com"))
                    or parsed.username is not None or parsed.password is not None or parsed.port not in (None, 443)):
                raise RPCError("login_failed")
            self._login_id = login_id
            early = self._early_login.get(login_id)
            if early is not None:
                self._login_id = None
                if early["success"]:
                    self._observed_auth_mode = "chatgpt"
                await self._emit("connection/login/completed", early)
            return {"login_id": login_id, "auth_url": url}
        except (ValueError, TypeError):
            raise RPCError("login_failed") from None
        finally:
            self._login_starting = False
            self._early_login.clear()

    async def login_cancel(self, login_id):
        self._ready()
        if type(login_id) is not str or login_id != self._login_id:
            raise RPCError("login_not_found")
        result = await self._rpc("account/login/cancel", {"loginId": login_id})
        if result.get("status") not in ("canceled", "notFound"):
            raise RPCError("protocol_error")
        if self._login_id == login_id:
            self._login_id = None
            await self._emit("connection/login/completed", {
                "login_id": login_id, "success": False, "error": "login_cancelled"})
        return {}

    @staticmethod
    def _check_cancelled(active):
        if active["cancelled"].is_set():
            raise RPCError("cancelled")

    async def ask(self, text, image_bytes, *, model, cancelled):
        self._ready()
        if not self.isolation_verified:
            raise RPCError("isolation_unverified")
        if self._active is not None or self._login_starting or self._login_id is not None:
            raise RPCError("busy")
        if (type(text) is not str or not 0 < len(text) <= MAX_PROMPT_CHARS
                or type(image_bytes) is not bytes or not 8 <= len(image_bytes) <= MAX_IMAGE_BYTES
                or not image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
                or type(model) is not str or _IDENTIFIER.fullmatch(model) is None
                or not isinstance(cancelled, asyncio.Event)):
            raise RPCError("invalid_request")
        active = {"thread_id": None, "turn_id": None, "submitted": False, "cancelled": cancelled,
                  "known": asyncio.Event(), "done": asyncio.get_running_loop().create_future(),
                  "messages": {}, "events": 0, "wire_bytes": 0, "receipt": self._receipt}
        self._active = active
        cancel_wait = None
        try:
            self._check_cancelled(active)
            try:
                text_bytes = text.encode("utf-8")
            except UnicodeError:
                raise RPCError("invalid_request") from None
            self._record(active["receipt"], input_types=["text", "image"], text_bytes=len(text_bytes),
                         text_sha256=sha256(text_bytes).hexdigest(), image_bytes=len(image_bytes),
                         image_sha256=sha256(image_bytes).hexdigest())
            account = await self._account()
            if account["auth_mode"] != "chatgpt":
                raise RPCError("unauthenticated")
            models = await self._models()
            if not any(row["model"] == model and "image" in row["input_modalities"] for row in models):
                raise RPCError("unsupported_model")
            if (await self._quota())["ordinary_usage_allowed"] is False:
                raise RPCError("quota_exhausted")
            self._check_cancelled(active)
            await self._verify_isolation()
            self._check_cancelled(active)
            started = await self._rpc("thread/start", {
                "model": model, "modelProvider": self.expected_provider,
                "allowProviderModelFallback": False, "cwd": self.cwd,
                "ephemeral": True, "sandbox": "read-only", "approvalPolicy": "never",
                "dynamicTools": [], "environments": []})
            actual_model = _identifier(started.get("model"))
            thread = _object(started.get("thread"))
            active["thread_id"] = _identifier(thread.get("id"))
            self._record(active["receipt"], actual_model=actual_model, thread_id=active["thread_id"])
            if actual_model != model or started.get("modelProvider") != self.expected_provider:
                raise RPCError("model_mismatch")
            sandbox = started.get("sandbox")
            if (started.get("instructionSources") != [] or started.get("cwd") != self.cwd
                    or started.get("approvalPolicy") != "never"
                    or type(sandbox) is not dict or set(sandbox) != {"type", "networkAccess"}
                    or sandbox["type"] != "readOnly" or sandbox["networkAccess"] is not False
                    or thread.get("ephemeral") is not True):
                raise RPCError("isolation_unverified")
            self._check_cancelled(active)
            def submitting():
                # The write lock may itself yield. Fence at the actual write,
                # with no await between this check and publishing prompt bytes.
                self._check_cancelled(active)
                active["submitted"] = True

            result = await self._rpc("turn/start", {
                "threadId": active["thread_id"], "model": model,
                "input": [{"type": "text", "text": text}, {"type": "image",
                    "url": "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii")}],
                "environments": [], "approvalPolicy": "never"}, before_send=submitting)
            turn_id = _identifier(_object(result.get("turn")).get("id"))
            if active["turn_id"] is not None and active["turn_id"] != turn_id:
                raise RPCError("protocol_error")
            active["turn_id"] = turn_id
            self._record(active["receipt"], submission="acknowledged", turn_id=turn_id)
            active["known"].set()
            cancel_wait = asyncio.create_task(cancelled.wait())
            done, _ = await asyncio.wait((active["done"], cancel_wait), timeout=self.turn_timeout,
                                         return_when=asyncio.FIRST_COMPLETED)
            if cancelled.is_set():
                confirmed = await self._interrupt_request(active)
                raise RPCError("cancelled" if confirmed else "cancellation_uncertain")
            if not done:
                await self._interrupt_request(active)
                raise RPCError("outcome_unknown")
            turn = active["done"].result()
            if "failure" in turn:
                raise RPCError(turn["failure"])
            if turn.get("status") != "completed" or turn.get("error") is not None:
                error = turn.get("error")
                info = error.get("codexErrorInfo") if type(error) is dict else None
                if info in ("usageLimitExceeded", "rateLimitExceeded"):
                    raise RPCError("quota_exhausted")
                if info == "unauthorized":
                    raise RPCError("unauthenticated")
                raise RPCError("incomplete_turn")
            messages = list(active["messages"].values())
            final = [value for phase, value in messages if phase == "final_answer"]
            if not final:
                final = [value for phase, value in messages if phase is None]
            answer = "\n".join(final)
            if not answer.strip() or len(answer) > MAX_TEXT_CHARS:
                raise RPCError("incomplete_turn")
            self._check_cancelled(active)
            self._ready()
            return {"text": answer, "model": model, "thread_id": active["thread_id"], "turn_id": turn_id}
        except asyncio.CancelledError:
            await self._interrupt_request(active)
            raise
        except RPCError:
            if active["submitted"] and not active["done"].done():
                await self._interrupt_request(active)
            raise
        finally:
            if cancel_wait is not None:
                cancel_wait.cancel()
                await asyncio.gather(cancel_wait, return_exceptions=True)
            self._active = None
            if self._fatal is not None:
                await self.close()

    async def interrupt(self):
        active = self._active
        if active is not None:
            active["cancelled"].set()
        return await self._interrupt_request(active)

    async def _interrupt_request(self, active):
        # Pin the request before waiting for another cancellation's RPC. The
        # previous ask may finish while the lock is held; never target its heir.
        # Internal cleanup must not turn timeout/failure into user cancellation.
        async with self._interrupt_lock:
            return await self._interrupt(active)

    async def _interrupt(self, active):
        if active is None:
            return True
        if not active["submitted"]:
            return True
        try:
            async with asyncio.timeout(self.shutdown_timeout):
                await active["known"].wait()
                if not active["done"].done():
                    await self._rpc("turn/interrupt", {"threadId": active["thread_id"], "turnId": active["turn_id"]})
                turn = await asyncio.shield(active["done"])
                return turn.get("status") == "interrupted"
        except (RPCError, TimeoutError):
            self._fail("outcome_unknown")
            await self.close()
            return False

    async def close(self):
        self._closed = True
        self.terminal.set()
        async with self._close_lock:
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(RPCError("closed"))
            if self._active is not None:
                if not self._active["done"].done():
                    self._active["done"].set_result({"failure": "closed"})
            process = self._process
            if process is not None:
                if process.stdin is not None:
                    process.stdin.close()
                if process.returncode is None:
                    try:
                        process.terminate()
                    except ProcessLookupError:
                        pass
                try:
                    await asyncio.wait_for(process.wait(), self.shutdown_timeout)
                except TimeoutError:
                    try:
                        process.kill()
                    except ProcessLookupError:
                        pass
                    await asyncio.wait_for(process.wait(), self.shutdown_timeout)
            if self._reader is not None and self._reader is not asyncio.current_task():
                self._reader.cancel()
                await asyncio.gather(self._reader, return_exceptions=True)
