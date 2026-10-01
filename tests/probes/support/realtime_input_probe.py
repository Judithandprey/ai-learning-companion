#!/usr/bin/env python3
"""Blocked realtime candidate; default and self-test are offline.

Adopted source SHA-256:
d9a8320971e6c20ade82f34c6c77c47ed688378e1a69494a40fffe1456407f27.
The 0.158.0 WebSocket auth and internal delegation blockers prohibit live use,
independently of codec evidence or user flags. See
docs/verification/support/windows-realtime-protocol-preconditions.md.
The retained lifecycle is tested only with fake dependencies; it is not live-ready.
"""
import argparse
import asyncio
import base64
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import wave

sys.dont_write_bytecode = True
RATE = 24000
FRAMES = 2400
PRIMARY_TIMEOUT = 44
STOP_TIMEOUT = 4
CLOSE_TIMEOUT = 4
FACTORY_SHUTDOWN_TIMEOUT = 3
# Existing factory close() allows two shutdown waits: 44 + 4 + 4 + 6 = 58s.
NOMINAL_TIMEOUT = PRIMARY_TIMEOUT + STOP_TIMEOUT + CLOSE_TIMEOUT + 2 * FACTORY_SHUTDOWN_TIMEOUT
# Deliberate unresolved prerequisite. A command-line flag or model/voice list
# cannot establish this contract. Only fill this after reviewing authoritative
# source for the installed binary/build and confirming this exact serializer.
# Expected reviewed fields: build_commit, binary_sha256, source_url/path,
# source_sha256, code_location, encoding, sample_format, sample_rate, channels.
VERIFIED_WIRE_CONTRACT = None
# Reviewed Python files only, not a complete import closure: contracts also
# loads schema.json and installed jsonschema. Import-origin verification remains
# unresolved; the unconditional live gate precedes every project import.
SOURCE_HASHES = {
    "services/worker/connectors/chatgpt_rpc.py": "28d1f3102b5e1d1b5c8eb173748da168a16f19fc21eafbd275395c7c0dd7fdb3",
    "services/worker/connectors/chatgpt_launch.py": "b4c89171f025056062a091dab47ac6c3b3f372843da428a72b35f7d8eab49090",
    "services/worker/connectors/chatgpt_receipts.py": "cf3ec73ce51f83056d147b6a0997a5c3c245c9a7b2deae295f29ee9165a17cae",
    "packages/contracts/__init__.py": "65a772b67c6e6d266864a2cc80d44349492708100d529b8846d99cb1258c9e93",
    "packages/contracts/live_companion/__init__.py": "68226d193c3f7755b056ee05dcb590102e760686071ce55f6a44a51859b7e880",
    "packages/contracts/validation.py": "f3e2c3e7926865896a7dae6e56585b68cd72f84d498df9b6864f2fe613a1f254",
}
STARTUP = {"initialize", "initialized", "config/read", "configRequirements/read", "skills/list"}
PROMPT = ("This is a short transcription-only test. Listen to the supplied speech. "
          "Preserve the original languages and words. Do not translate, answer the speech, "
          "use tools, or delegate tasks. Do not infer missing words.")
PLAN = {
    "status": "blocked_not_executed",
    "route": "managed Codex 0.158.0 experimental thread realtime, text output",
    "steps": ["existing isolated factory and state lock", "initialize experimentalApi",
              "account/read refreshToken=false", "one ephemeral read-only backing thread",
              "one realtime/start, wait realtime/started", "paced appendAudio fixture only",
              "final USER transcript evidence", "realtime/stop + closed + owned child reaped"],
    "not_proven": ["account realtime entitlement", "PCM wire codec for installed version",
                   "complete local/data/third-party import closure",
                   "actual audio acceptance", "speech accuracy", "live microphone/system capture",
                   "direct realtime vision", "speaker attribution", "acoustic/emotion understanding"],
    "localAudio": "present in stable schema; current model catalog advertises text/image only; not used",
    "no_capture_no_playback": True,
    "live_blockers": ["managed_websocket_auth_not_supported", "internal_delegation_not_disabled"],
    "nominal_primary_and_cleanup_seconds": NOMINAL_TIMEOUT,
}


class Boundary(Exception):
    pass


def require_live_preconditions():
    # Deliberately unconditional. Neither a codec review, permission flag nor
    # listVoices result resolves these independently verified source blockers.
    # A future supported route requires a new reviewed code change.
    raise Boundary("live_blocked_managed_websocket_auth_and_internal_delegation")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_oracles(expected):
    if (not expected or len(expected) > 16
            or any(type(term) is not str or term != term.strip() or not term
                   or len(term) > 128 or sum(c.isalnum() for c in term) < 2
                   or term.casefold() in PROMPT.casefold()
                   for term in expected)):
        raise Boundary("invalid_fixture_oracle")
    return tuple(expected)


def oracle_matches(term, text):
    # Do not credit 'one' inside 'none' or 'seven' inside 'seventeen'.
    return re.search(r"(?<!\w)" + re.escape(term.casefold()) + r"(?!\w)", text.casefold()) is not None


def verify_source_files(repo):
    root = repo.resolve(strict=True)
    if any(name.split(".", 1)[0] in {"services", "packages"} for name in sys.modules):
        raise Boundary("project_modules_already_loaded")
    for name, expected in SOURCE_HASHES.items():
        path = root / name
        if path.resolve(strict=True) != path or not path.is_file() or digest(path.read_bytes()) != expected:
            raise Boundary("connector_import_source_changed")
        # Namespace ancestors must not acquire executable initializers or a
        # sibling module that shadows the reviewed package tree.
        for parent in path.relative_to(root).parents:
            if parent == Path("."):
                continue
            initial = parent / "__init__.py"
            if str(initial) not in SOURCE_HASHES and (root / initial).exists():
                raise Boundary("unexpected_package_initializer")
            if (root / parent).with_suffix(".py").exists():
                raise Boundary("unexpected_package_shadow")
    return root


def import_reviewed_connectors(repo):
    root = verify_source_files(repo)
    original_path = sys.path[:]
    try:
        # Preserve installed dependencies. These source checks alone do not
        # establish a complete import boundary; live execution stays blocked.
        sys.path.insert(0, str(root))
        from services.worker.connectors import chatgpt_rpc as rpc, chatgpt_launch as launch
        return rpc, launch
    finally:
        sys.path[:] = original_path


def read_fixture(path):
    # PCM representation is an explicitly selected candidate, not inferred from
    # sampleRate schema. Codec uncertainty does not resolve the live blockers.
    if path.stat().st_size > 600000:
        raise Boundary("fixture_too_large")
    with wave.open(str(path), "rb") as w:
        if (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getcomptype()) != (1, 2, RATE, "NONE"):
            raise Boundary("fixture_requires_mono_s16le_24000_wav")
        count = w.getnframes()
        if not RATE // 2 <= count <= RATE * 10:
            raise Boundary("fixture_requires_0.5_to_10_seconds")
        data = w.readframes(count)
        if len(data) != count * 2 or not any(data):
            raise Boundary("fixture_empty_truncated_or_all_zero")
    return data


def chunk(raw):
    if not 0 < len(raw) <= FRAMES * 2 or len(raw) % 2:
        raise Boundary("invalid_pcm_chunk")
    return {"data": base64.b64encode(raw).decode("ascii"), "sampleRate": RATE,
            "numChannels": 1, "samplesPerChannel": len(raw) // 2}


def error_category(text):
    text = str(text).lower()
    for category, words in [
        ("authorization_or_rollout", ("unauthorized", "forbidden", "401", "403", "not enabled", "not allowed")),
        ("quota_or_rate_limit", ("quota", "rate limit", "usage limit", "429")),
        ("unsupported_or_bad_input", ("unsupported", "invalid", "400", "not found")),
        ("transport_unavailable", ("connection", "timeout", "503")),
    ]:
        if any(word in text for word in words):
            return category
    return "realtime_error_unclassified"


class Observe:
    def __init__(self, expected):
        self.thread = None
        self.ready = asyncio.Event()
        self.done = asyncio.Event()
        self.closed = asyncio.Event()
        self.expected = validate_oracles(expected)
        self.finals = []
        self.events = Counter()
        self.failure = None
        self.error_hint = None
        self.stopping = False
        self.version = None
        self.session = None
        self.input_started = False
        self.input_complete = False
        self.late_transcripts = 0
        self.close_reason = None

    def fail(self, reason):
        self.failure = self.failure or reason

    def complete_input(self):
        self.input_complete = True
        self.check_terms()

    def check_terms(self):
        # This establishes only fixture-term evidence, not completion or
        # accuracy of an entire provider response or transcription.
        text = " ".join(self.finals)
        if self.input_complete and text and all(oracle_matches(term, text) for term in self.expected):
            self.done.set()

    def feed(self, method, params):
        self.events[method] += 1
        if sum(self.events.values()) > 2000:
            raise Boundary("event_limit")
        if type(params) is not dict:
            raise Boundary("invalid_notification")
        item = params.get("item", {})
        if type(item) is not dict:
            raise Boundary("invalid_realtime_item")
        # Observe child-wide inference witnesses before ANY thread filter.
        # Detection is after the fact and cannot prevent internal delegation.
        if method == "turn/started":
            self.fail("unexpected_backing_turn")
            return
        if method in {"item/started", "item/completed"} or (
            method in {"thread/realtime/item/started", "thread/realtime/item/completed"}
            and item.get("type") == "bemItemPromoted"
        ):
            self.fail("unexpected_backing_item")
            return
        is_final = method == "thread/realtime/transcript/done" or (
            method == "thread/realtime/item/completed" and item.get("type") == "transcriptSegment")
        if params.get("threadId") != self.thread or self.thread is None:
            if method == "thread/realtime/started" or is_final:
                self.fail("foreign_realtime_evidence")
            return
        if method == "thread/realtime/started":
            if self.ready.is_set() or self.stopping or self.closed.is_set():
                self.fail("repeated_or_late_startup")
                return
            if params.get("version") != "v2":
                self.fail("invalid_realtime_version")
                return
            self.version = params["version"]
            self.session = params.get("realtimeSessionId")
            self.ready.set()
        elif method == "thread/realtime/error":
            self.fail("realtime_error")
            self.error_hint = error_category(params.get("message"))
        elif method == "thread/realtime/closed":
            if self.closed.is_set():
                self.fail("repeated_close")
            self.close_reason = params.get("reason")
            self.closed.set()
            if not self.stopping:
                self.fail("closed_before_stop")
            elif self.close_reason != "requested":
                self.fail("unclean_realtime_close")
        elif method == "thread/realtime/transcript/done":
            self.final(params.get("role"), params.get("text"))
        elif method == "thread/realtime/item/completed":
            if self.session is not None and item.get("realtimeSessionId") != self.session:
                self.fail("foreign_realtime_session")
                return
            if item.get("type") == "transcriptSegment":
                self.final(item.get("role"), item.get("text"))
            elif item.get("type") == "realtimeSessionClosed" and item.get("outcome") == "failed":
                self.fail("realtime_session_failed")
        elif method == "thread/realtime/outputAudio/delta":
            self.fail("unexpected_audio_output")
        elif method == "error":
            self.fail("backing_thread_error")

    def final(self, role, text):
        if role != "user":
            return
        if self.stopping or self.closed.is_set():
            self.late_transcripts += 1
            return
        if not self.ready.is_set() or not self.input_started:
            self.fail("transcript_before_input")
            return
        if type(text) is not str or len(text) > 8192:
            raise Boundary("invalid_transcript")
        if text.strip() and text not in self.finals:
            self.finals.append(text)
            if sum(map(len, self.finals)) > 16384:
                raise Boundary("transcript_limit")
            self.check_terms()

    def evidence(self):
        text = " ".join(self.finals)
        return {"startup_event": self.ready.is_set(), "realtime_version": self.version,
                "user_final_transcript": bool(text), "transcript_sha256": digest(text.encode()) if text else None,
                "transcript_characters": len(text), "fixture_terms_checked": len(self.expected),
                "fixture_terms_matched": [oracle_matches(term, text) for term in self.expected],
                "input_complete": self.input_complete, "late_transcripts_discarded": self.late_transcripts,
                "evidence_limit": "fixture terms in user transcript segments; not complete-response or recognition-quality acceptance",
                "closed_event": self.closed.is_set(), "close_reason": self.close_reason, "failure": self.failure,
                "provider_error_diagnostic": ({"hint": self.error_hint,
                    "basis": "heuristic_message_substring", "confirmed": False} if self.error_hint else None),
                "events": dict(self.events)}


class WireGuard:
    def __init__(self, client, observer, thread_params):
        self.client, self.original, self.observer = client, client._send, observer
        self.phase = "startup"
        self.counts = Counter()
        self.thread_params = thread_params

    async def __call__(self, msg, **kwargs):
        method, p = msg.get("method"), msg.get("params")
        if method is None and msg.get("error") == {"code": -32601, "message": "Server requests are disabled."} and set(msg) == {"id", "error"}:
            return await self.original(msg, **kwargs)
        allowed = False
        limit = 1
        if self.phase == "startup":
            allowed = method in STARTUP
            if method == "initialize":
                allowed &= p == {"clientInfo": {"name": "learning_companion", "version": "0.1.0"},
                                "capabilities": {"experimentalApi": True, "explicitGatewayOauth": True}}
            elif method == "initialized": allowed &= p == {}
            elif method == "config/read": allowed &= p == {"includeLayers": True, "cwd": self.client.cwd}
            elif method == "configRequirements/read": allowed &= p is None
            elif method == "skills/list": allowed &= p == {"cwds": [self.client.cwd], "forceReload": True}
        elif method == "account/read": allowed = p == {"refreshToken": False}
        elif method == "thread/start": allowed = p == self.thread_params
        elif method == "thread/realtime/start": allowed = p == self.start_params()
        elif method == "thread/realtime/appendAudio":
            limit = 112
            allowed = (self.observer.ready.is_set() and not self.observer.stopping
                       and not self.observer.input_complete and not self.observer.failure)
            allowed &= isinstance(p, dict) and set(p) == {"threadId", "audio"} and p["threadId"] == self.observer.thread
            if allowed:
                a = p["audio"]
                try:
                    raw = base64.b64decode(a["data"], validate=True)
                    allowed &= a == chunk(raw)
                except Exception:
                    allowed = False
        elif method == "thread/realtime/stop":
            allowed = (p == {"threadId": self.observer.thread} and self.observer.thread is not None
                       and self.observer.stopping and self.counts["thread/realtime/start"] == 1)
        if not allowed or self.counts[method] >= limit:
            raise Boundary("outbound_boundary_refused")
        self.counts[method] += 1
        if method == "thread/realtime/appendAudio":
            self.observer.input_started = True
        return await self.original(msg, **kwargs)

    def start_params(self):
        return {"threadId": self.observer.thread, "outputModality": "text", "version": "v2",
                "transport": {"type": "websocket"}, "includeStartupContext": False,
                "clientManagedHandoffs": True, "flushTranscriptTailOnSessionEnd": False,
                "prompt": PROMPT}


async def wait_event(event, observer, client, seconds):
    async with asyncio.timeout(seconds):
        while True:
            if observer.failure:
                raise Boundary(observer.failure)
            if client._fatal or client.terminal.is_set():
                raise Boundary("managed_child_failed")
            if event.is_set():
                return
            await asyncio.sleep(0.05)


async def run_live(args, pcm, rpc, launch):
    require_live_preconditions()
    observer = Observe(args.expect)
    report = {"status": "not_passed", "mode": "live_fixture", "fixture_sha256": digest(pcm),
              "fixture_seconds": len(pcm) / 2 / RATE, "format_evidence": VERIFIED_WIRE_CONTRACT,
              "candidate_encoding": "PCM16LE mono 24000 Hz; not exact-build verified",
              "scope": "single generated speech fixture; no microphone, playback, screen, or product acceptance"}
    client = guard = None
    stop_ack = False
    previous_env = {key: os.environ.get(key) for key in
                    ("LC_SUBSCRIPTION_STATE_DIR", "LC_SUBSCRIPTION_CODEX_BIN")}
    try:
        launch._check_state(args.state_dir)
        os.environ["LC_SUBSCRIPTION_STATE_DIR"] = str(args.state_dir)
        os.environ["LC_SUBSCRIPTION_CODEX_BIN"] = str(args.codex_bin)
        async with launch.create_client() as client:
            if client.shutdown_timeout > FACTORY_SHUTDOWN_TIMEOUT:
                raise Boundary("factory_cleanup_bound_changed")
            thread_params = {"model": args.model, "modelProvider": client.expected_provider,
                             "allowProviderModelFallback": False, "cwd": client.cwd,
                             "ephemeral": True, "sandbox": "read-only", "approvalPolicy": "never",
                             "dynamicTools": [], "environments": []}
            guard = WireGuard(client, observer, thread_params)
            client._send = guard
            original_notification = client._notification
            async def notified(method, params):
                await original_notification(method, params)
                if method == "account/updated" and params.get("authMode") != "chatgpt":
                    observer.fail("auth_changed")
                observer.feed(method, params)
                if observer.failure:
                    client._fail("audio_probe_failed")
            client._notification = notified
            try:
                async with asyncio.timeout(PRIMARY_TIMEOUT):
                    await client.start()
                    if not client.isolation_verified:
                        raise Boundary("isolation_unverified")
                    guard.phase = "probe"
                    account = await client._account()
                    if account["auth_mode"] != "chatgpt":
                        raise Boundary("needs_auth")
                    started = await client._rpc("thread/start", thread_params)
                    thread = started.get("thread", {})
                    if (started.get("model") != args.model or started.get("modelProvider") != client.expected_provider
                        or started.get("cwd") != client.cwd or started.get("instructionSources") != []
                        or started.get("approvalPolicy") != "never" or thread.get("ephemeral") is not True
                        or started.get("sandbox") != {"type": "readOnly", "networkAccess": False}
                        or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", str(thread.get("id", "")))):
                        raise Boundary("thread_isolation_or_model_mismatch")
                    observer.thread = thread["id"]
                    await client._rpc("thread/realtime/start", guard.start_params())
                    await wait_event(observer.ready, observer, client, 12)
                    # A short explicit silence tail lets server VAD end the part;
                    # there is no commit/flush RPC in this installed surface.
                    data = pcm + bytes(RATE * 2)
                    for offset in range(0, len(data), FRAMES * 2):
                        if observer.failure or client._fatal:
                            raise Boundary(observer.failure or "managed_child_failed")
                        raw = data[offset:offset + FRAMES * 2]
                        await client._rpc("thread/realtime/appendAudio", {"threadId": observer.thread, "audio": chunk(raw)})
                        await asyncio.sleep(len(raw) / 2 / RATE)
                    observer.complete_input()
                    await wait_event(observer.done, observer, client, 15)
            finally:
                observer.stopping = True
                if guard.counts["thread/realtime/start"] and client._fatal is None and not client._closed:
                    try:
                        await asyncio.wait_for(client._rpc("thread/realtime/stop", {"threadId": observer.thread}), STOP_TIMEOUT)
                        stop_ack = True
                        await wait_event(observer.closed, observer, client, CLOSE_TIMEOUT)
                    except Exception:
                        observer.failure = observer.failure or "stop_or_close_unconfirmed"
    except TimeoutError:
        observer.failure = observer.failure or "deadline_or_vad_timeout"
    except Boundary as e:
        observer.failure = observer.failure or str(e)
    except rpc.RPCError as e:
        observer.failure = observer.failure or (e.code if e.code in {"busy", "unavailable", "request_failed", "timeout", "isolation_unverified", "protocol_error"} else "managed_rpc_failed")
    except Exception:
        observer.failure = observer.failure or "probe_failed"
    finally:
        for key, value in previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        if client and client._fatal is not None:
            observer.fail("managed_child_failed")
        if client and (not client._closed or not client._process or client._process.returncode is None):
            observer.fail("owned_child_cleanup_unconfirmed")
        report.update(observer.evidence())
        report["methods"] = dict(guard.counts) if guard else {}
        report["stop_acknowledged"] = stop_ack
        report["owned_child_reaped"] = bool(client and client._process and client._process.returncode is not None)
        report["client_fatal"] = bool(client and client._fatal is not None)
        report["client_closed"] = bool(client and client._closed)
        report["nominal_primary_and_cleanup_seconds"] = NOMINAL_TIMEOUT
        if args.retain_fixture_transcript:
            report["fixture_transcript"] = observer.finals
        if (not observer.failure and observer.ready.is_set() and observer.done.is_set()
            and observer.input_complete and observer.close_reason == "requested"
            and observer.closed.is_set() and stop_ack and report["owned_child_reaped"]
            and report["client_closed"] and not report["client_fatal"]
            and args.expect and all(report["fixture_terms_matched"])):
            report["status"] = "fixture_transport_and_terms_passed"
    return report


async def self_test():
    o = Observe(["seven", "matrix"])
    o.thread = "fake-thread"
    class Sink:
        cwd = "/synthetic"
        async def _send(self, message, **kwargs): pass
    guard = WireGuard(Sink(), o, {"synthetic": True})
    guard.phase = "probe"
    for m in ["turn/start", "thread/realtime/appendText", "thread/realtime/appendSpeech", "account/login/start", "config/value/write"]:
        try:
            await guard({"method": m, "params": {}})
            raise AssertionError("forbidden wire request accepted")
        except Boundary: pass
    p = {"threadId": o.thread, "audio": chunk(b"\x01\x00" * 240)}
    try:
        await guard({"method": "thread/realtime/appendAudio", "params": p})
        raise AssertionError("append before ready")
    except Boundary: pass
    o.feed("thread/realtime/started", {"threadId": o.thread, "version": "v2"})
    assert not o.evidence()["user_final_transcript"]
    await guard({"method": "thread/realtime/appendAudio", "params": p})
    o.feed("thread/realtime/transcript/done", {"threadId": o.thread, "role": "assistant", "text": "seven matrix"})
    assert not o.done.is_set()
    o.feed("thread/realtime/transcript/done", {"threadId": o.thread, "role": "user", "text": "seven matrix"})
    assert not o.done.is_set()
    o.complete_input()
    assert o.done.is_set()
    assert all(o.evidence()["fixture_terms_matched"])
    o.stopping = True
    guard.counts["thread/realtime/start"] = 1
    await guard({"method": "thread/realtime/stop", "params": {"threadId": o.thread}})
    try:
        await guard({"method": "thread/realtime/stop", "params": {"threadId": o.thread}})
        raise AssertionError("repeated stop accepted")
    except Boundary: pass
    o.feed("thread/realtime/closed", {"threadId": o.thread, "reason": "requested"})
    assert o.closed.is_set() and not o.failure
    assert error_category("403 SYNTHETIC_SECRET") == "authorization_or_rollout"
    return {"status": "offline_self_test_passed", "no_child_no_network_no_audio_device": True,
            "checks": ["wire whitelist", "ready before append", "startup is not transcription", "assistant is not input transcript", "fixture terms", "stop once", "closed event", "sanitized error category"]}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--live", action="store_true")
    p.add_argument("--repo", type=Path, default=Path("/home/agentsdock/Projects/learning-companion/repo"))
    p.add_argument("--state-dir", type=Path)
    p.add_argument("--codex-bin", type=Path, default=Path("/home/agentsdock/.local/bin/codex"))
    p.add_argument("--model", help="actual catalog backing model; NOT the realtime model")
    p.add_argument("--wav", type=Path, help="explicitly provided GENERATED mono PCM16LE 24 kHz WAV, max 10 seconds")
    p.add_argument("--expect", action="append", default=[], help="fixture oracle term; never sent to the model")
    p.add_argument("--permit-subscription-test", action="store_true", help="lead released this one actual potentially billable test")
    p.add_argument("--retain-fixture-transcript", action="store_true")
    p.add_argument("--output", type=Path)
    args = p.parse_args()
    if not args.live and not args.self_test:
        print(json.dumps(PLAN, indent=2))
        return 0
    if args.live:
        # First live action, before path checks, fixture reads, state, attempts,
        # project imports, account operations or any child construction.
        require_live_preconditions()
    if args.output is None or args.output.exists():
        p.error("Use --output with a new filename; evidence is never overwritten")
    claim = args.output.with_name(args.output.name + ".attempt.json")
    if args.live and claim.exists():
        p.error("This attempt is already claimed; outcome may be unknown. Do not retry or delete the claim to bypass it.")
    if args.output.resolve().is_relative_to(args.repo.resolve()):
        p.error("Evidence must be outside the owner repository")
    if args.self_test:
        report = asyncio.run(self_test())
    else:
        if not (args.permit_subscription_test and args.state_dir and args.state_dir.is_absolute()
                and args.wav and args.model and args.expect):
            p.error("Live requires explicit release, existing state, model, generated WAV, and expected terms")
        validate_oracles(args.expect)
        verify_source_files(args.repo)
        pcm = read_fixture(args.wav)
        # Durable once-only intent BEFORE importing/starting any managed client.
        # A crash can mean submission happened; the claim remains authoritative
        # even when no final receipt exists. Never remove it automatically.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with claim.open("x", encoding="utf-8") as f:
            json.dump({"state": "claimed_outcome_unknown_until_final_receipt",
                       "created_at": datetime.now(timezone.utc).isoformat(),
                       "probe_sha256": digest(Path(__file__).read_bytes()),
                       "fixture_sha256": digest(pcm),
                       "automatic_retry_forbidden": True}, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        rpc, launch = import_reviewed_connectors(args.repo)
        report = asyncio.run(run_live(args, pcm, rpc, launch))
    report["created_at"] = datetime.now(timezone.utc).isoformat()
    report["probe_sha256"] = digest(Path(__file__).read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["status"] in ("offline_self_test_passed", "fixture_transport_and_terms_passed") else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Boundary as error:
        print("Probe refused: " + str(error) + "; no automatic retry.", file=sys.stderr)
        raise SystemExit(2)
    except (OSError, wave.Error):
        print("Probe refused: fixture/configuration/output invalid; no automatic retry.", file=sys.stderr)
        raise SystemExit(2)
