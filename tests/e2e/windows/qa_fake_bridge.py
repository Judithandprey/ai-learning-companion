#!/usr/bin/env python3
"""QA stand-in for the subscription connector. SYNTHETIC: no Codex, no ChatGPT, no sign-in, no network, no allowance.

The Windows app starts its connector as `<launch.python> -m services.worker.connectors.chatgpt_local` in `<launch.cd>`.
For QA's deterministic controls the trusted configuration names THIS file as `launch.python` and a QA-owned folder as
`launch.cd`; the `-m <module>` arguments are ignored. It speaks the app-facing envelope `lc-subscription-ask/1`, one
JSON object per line on stdin/stdout, and does what `bridge-script.json` in its working folder says. Every "answer" is
text QA wrote, marked SYNTHETIC. It never reads or writes anything outside its working folder.

bridge-script.json:
  {"launches": [ {"connection": <connection/read result>, "asks": [<behaviour>, ...]}, ... ]}
The n-th start of the bridge in this folder uses launches[n] (the last one again when there are more starts). The k-th
`ask/start` of a launch does asks[k]; past the list the answer is the error `failed`. Behaviours:
  {"do": "answer", "text": "...", "delay_ms": 0}                 a completed answer bound to the request
  {"do": "answer", "tamper": "image_sha256", ...}                the same with another picture hash in its provenance
  {"do": "error", "code": "quota", "delay_ms": 0}                a closed error code
  {"do": "hold", "on_cancel": "cancelled"|"unconfirmed"|"late_answer", "on_stop": "cancelled"|"late_answer"}
       no reply until `ask/cancel` or `session/stop` arrives for it. Then the question ends as `cancelled`; the cancel's
       receipt is {cancelled:true, uncertain:false} ("unconfirmed": uncertain:true); the stop's receipt is {}. With
       "late_answer" a completed answer for that question is written AFTER the receipt, as a late child would.
  {"do": "fault", "changed_first": true}                         writes `connection/changed` (if asked) and then one line
       of 300 KiB, over the envelope's 256 KiB limit for a line from the connector (the app must end this child and must
       not start another by itself); nothing else is answered by this launch afterwards.
       With "during_read": true the long line comes while the app's own re-read is out: `connection/changed` is written,
       the `connection/read` it causes is left unanswered, `connection/changed` is written again, then the long line
  {"do": "silence"}                                              no reply at all, whatever comes later
  {"do": "exit", "code": 0, "delay_ms": 0}                       the process ends by itself, with that exit code, and
       answers nothing (see "ending by itself" below)
  {"do": "close_output"}                                         only its output is closed; it lives and keeps reading

More keys of a launch, for the paths corrected after QA-SUB-01..08. Every one is optional; a launch without them does
exactly what it did before they existed (one fixed read result; both sign-in methods answer the error `unavailable`;
`connection/changed` only inside `fault`; the process ends only at the end of its input, and then at once).

  "reads": [<behaviour>, ...]      the k-th `connection/read` of the launch does reads[k]; past the list it gives the
                                   normal result (the launch's "connection", or the default signed-in account):
      {"do": "result", "delay_ms": 0}                 the normal result; "connection": {...} gives another account for
                                                      this read only; "result": <any JSON> is written as it is (a
                                                      result of another shape)
      {"do": "error", "code": "busy", "delay_ms": 0}  an error with that code (any text: a code the app does not know too)
      {"do": "hold"}                                  no answer
      {"do": "exit", "code": 0} / {"do": "close_output"}

  "changed": <schedule> | [<schedule>, ...]      when `connection/changed` is written, beside `fault`:
      {"when": "with_read", "from_read": 0, "times": N}   in the SAME write as a read's answer, right after it
      {"when": "after_read", "delay_ms": 5, "from_read": 0, "times": N}   in a write of its own, delay_ms after a read's
                                                      answer was written
           both: for the reads from_read .. from_read+times-1 of the launch (every read from from_read on when "times"
           is left out), and only for a read that IS answered (a result or an error)
      {"when": "timer", "start_after_reads": 1, "delay_ms": 100, "every_ms": 50, "times": 1}   a burst of `times` events,
           the first one delay_ms after the answer that made start_after_reads answered reads, then one every every_ms
           (start_after_reads 0: counted from the start of the launch)

  "login_start": [<behaviour>, ...]   the k-th `connection/login/start`; past the list (and with no list) the error
                                      `unavailable`:
      {"do": "result", "address": "not_official"|"official", "auth_url": "...", "login_id": "...", "delay_ms": 0}
           result {login_id, auth_url}. login_id is "login-qa-<k+1>" unless given. Without "address" and "auth_url" the
           address is NOT official (https://qa-synthetic.invalid/...): the app refuses it and opens nothing.
           "official" gives https://chatgpt.com/qa-synthetic-not-a-sign-in. CAUTION: the app OPENS an official address
           in the user's browser. Use it only where the app's opener is a recorder (QA's offline tests), never on the
           shared display without the lead's release.
      {"do": "error", "code": "busy"}
      {"do": "malformed"}             a result of another shape: {"login_id": "", "auth_url": ...}; "result": <any JSON>
                                      is written as it is
      {"do": "hold"} / {"do": "exit", "code": 0} / {"do": "close_output"}

  "login_cancel": [<behaviour>, ...]  the k-th `connection/login/cancel`; past the list (and with no list) the error
                                      `unavailable`:
      {"do": "result"}                the acknowledgement {}; "result": <any JSON> is written as it is (another shape)
      {"do": "error", "code": "invalid_request"}
      {"do": "hold"} / {"do": "exit", "code": 0} / {"do": "close_output"}

  "completed": {"success": true|false, "error": null|"login_cancelled"|"...", "delay_ms": 0, "login_id": "..."}
       inside a login_start "result" or any login_cancel behaviour: the event `connection/login/completed {login_id,
       success, error}` is written for that sign-in (the started one; the one the cancel names), unless "login_id"
       gives another. In a login_start it comes delay_ms after the reply (0: in the same write, right after it). In a
       login_cancel it comes when the cancel arrives, BEFORE whatever the cancel itself is answered (with "hold": the
       event alone).

  "idle": {"do": "exit"|"close_output", "after_ms": 200, "code": 0}
       the launch does this once no request line has come for after_ms (counted from the last request; not before the
       first one).

  "at_eof": {"do": "linger", "ms": 500} | {"do": "stay", "ignore_term": false, "max_s": 120}
       what the launch does at the end of its input, where it would otherwise end at once (`eof` is logged first, as
       always). "linger": it ends by itself ms later, exit code 0, and logs `{"event": "ended_after_linger"}` right
       before. "stay": it does not end by itself: it ends when its process is ended (SIGTERM); with "ignore_term": true
       not then either (SIGTERM is ignored from the start of the launch), only when it is killed (SIGKILL). So that a
       run that breaks off leaves no process behind, a "stay" does end by itself max_s after the end of its input
       (120 s: far past any bound a check gives the app). Its output stays open the whole time.

Ending by itself. "exit" (on an ask, a read, a sign-in method, or idle) writes its own line `{"event": "exit", "on":
..., "code": ...}` to the log and then ends the process at once with that exit code; no `eof` line follows, because
`eof` is logged only at the end of its input. "close_output" logs `{"event": "output_closed", "on": ...}`: the app sees
the end of the connector's output while the process lives, still reads and logs every request, and answers none.

`bridge-log.jsonl` in the folder gets one line per start, request, written line and end, with sizes and hashes only
(no picture, no base64; the question as its length and sha256). A question that is not well-formed text (half of a
surrogate pair) is logged too: "question_well_formed": false, hashed as its code units' UTF-8 form.
"""
import base64
import hashlib
import json
import os
import signal
import sys
import threading
import time
import uuid
from datetime import datetime, timezone

VERSION = "lc-subscription-ask/1"
LABEL = "SYNTHETIC (QA fake bridge: no model, no ChatGPT)"
DEFAULT_CONNECTION = {
    "auth": {"state": "signed_in", "mode": "chatgpt", "plan": "QA-SYNTHETIC"}, "rate_limits": None,
    "models": [{"id": "qa-synthetic-vision", "label": "QA synthetic (no model)", "image_input": True, "default": True},
               {"id": "qa-synthetic-text", "label": "QA synthetic text only", "image_input": False, "default": False}],
}
CHANGED = {"method": "connection/changed", "params": {}}
OFFICIAL_ADDRESS = "https://chatgpt.com/qa-synthetic-not-a-sign-in"            # the app opens such an address: see CAUTION
NOT_OFFICIAL_ADDRESS = "https://qa-synthetic.invalid/not-an-official-address"   # the app refuses it and opens nothing


class Bridge:
    def __init__(self, folder, out):
        self.folder, self.out = folder, out
        self.lock = threading.Lock()
        self.launch_id = uuid.uuid4().hex
        self.n_ask = 0
        self.n_read = 0           # `connection/read` received
        self.read_answers = 0     # of them answered (a result or an error)
        self.n_login_start = 0
        self.n_login_cancel = 0
        self.held = {}        # request_id -> (rpc id, behaviour, request, model)
        self.faulted = False
        self.fault_on_read = False
        self.muted = False        # its output is closed ("close_output"): nothing more is written
        self.idle_timer = None
        self.log_path = os.path.join(folder, "bridge-log.jsonl")
        counter = os.path.join(folder, "bridge-launches")
        try:
            with open(counter, encoding="utf-8") as f:
                self.launch_n = int(f.read().strip() or 0)
        except (OSError, ValueError):
            self.launch_n = 0
        with open(counter, "w", encoding="utf-8") as f:
            f.write(str(self.launch_n + 1))
        try:
            with open(os.path.join(folder, "bridge-script.json"), encoding="utf-8") as f:
                launches = json.load(f).get("launches") or [{}]
        except (OSError, ValueError):
            launches = [{}]
        self.script = launches[min(self.launch_n, len(launches) - 1)]
        changed = self.script.get("changed") or []
        self.changed = [changed] if isinstance(changed, dict) else changed
        at_eof = self.script.get("at_eof")
        self.at_eof = at_eof if isinstance(at_eof, dict) else {}
        if self.at_eof.get("do") == "stay" and self.at_eof.get("ignore_term"):
            signal.signal(signal.SIGTERM, signal.SIG_IGN)   # before the `start` line: ignored whenever it comes
        self.log({"event": "start", "launch": self.launch_id, "launch_n": self.launch_n, "pid": os.getpid(), "argv": sys.argv[1:],
                  "stdin_fifo": os.path.exists("/proc/self/fd/0") and os.stat(0).st_mode & 0o170000 == 0o010000, "label": LABEL})
        self.bursts()

    def log(self, entry, locked=False):
        entry = {"at": datetime.now(timezone.utc).isoformat(), **entry}
        if locked:   # the caller holds the lock: the line is in the log before what it does next
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
            return
        with self.lock:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")

    def write(self, obj, kind, also=()):
        """One line of the envelope. `also`: more (object, kind) lines in the SAME write, after it."""
        if self.faulted or self.muted:
            return
        lines = [(obj, kind), *also]
        with self.lock:
            if self.muted:
                return
            self.out.write("".join(json.dumps(o, separators=(",", ":")) + "\n" for o, _ in lines))
            self.out.flush()
        for o, k in lines:
            entry = {"event": "sent", "kind": k, "id": o.get("id"), "method": o.get("method"), "error": (o.get("error") or {}).get("code"),
                     "result_keys": sorted(o["result"]) if isinstance(o.get("result"), dict) else None}
            if o.get("method") and o.get("params"):
                entry["params"] = o["params"]   # of an event only: a sign-in's synthetic id and how it is said to have ended
            self.log(entry)

    def error(self, rid, code, also=()):
        self.write({"id": rid, "error": {"code": code, "message": f"{LABEL}: {code}"}}, "error", also)

    def answer(self, rid, request, model, behaviour):
        image = request["image"]
        provenance = {"request_id": request["request_id"], "question": request["question"], "assistance": request["assistance"],
                      "image": {"sha256": image["sha256"], "width": image["width"], "height": image["height"]}, "context": request["context"]}
        if behaviour.get("tamper") == "image_sha256":
            provenance["image"]["sha256"] = "0" * 64
        text = behaviour.get("text") or f"{LABEL}. Picture {image['width']}x{image['height']} px, assistance {request['assistance']}."
        self.write({"id": rid, "result": {"request_id": request["request_id"], "text": text, "provenance": provenance, "model": model, "auth_mode": "chatgpt",
                                          "latency_ms": int(behaviour.get("latency_ms", 7)), "thread_id": "thread-qa-synthetic", "turn_id": f"turn-qa-synthetic-{self.n_ask}",
                                          "kind": "generated_assistance"}}, "answer")

    def later(self, ms, fn):
        if ms:
            t = threading.Timer(ms / 1000.0, fn)
            t.daemon = True
            t.start()
        else:
            fn()

    # ---- ending by itself --------------------------------------------------------------------------------------
    def exit(self, behaviour, on):
        """The process ends by itself: its own line in the log first, then gone at once (no `eof`)."""
        code = int(behaviour.get("code", 0))
        self.log({"event": "exit", "launch": self.launch_id, "on": on, "code": code, "held_at_exit": sorted(self.held)})
        os._exit(code)

    def close_output(self, on):
        """Only the output ends (the reader sees its end); the process lives, reads and logs, and writes nothing more."""
        with self.lock:
            if self.muted:
                return
            self.muted = True
            self.out.flush()
            # Logged first, under the same lock: whatever the reader does on seeing the end is logged after this line.
            self.log({"event": "output_closed", "launch": self.launch_id, "on": on}, locked=True)
            null = os.open(os.devnull, os.O_WRONLY)
            os.dup2(null, self.out.fileno())   # the pipe's writing end is closed; a later write of Python's own goes nowhere
            os.close(null)

    def ended(self, behaviour, on):
        """Does a behaviour that ends something or answers nothing; says whether it was one."""
        do = behaviour.get("do")
        if do == "exit":
            self.later(behaviour.get("delay_ms", 0), lambda: self.exit(behaviour, on))
        elif do == "close_output":
            self.close_output(on)
        return do in ("exit", "close_output", "hold")

    def end_of_input(self):
        """What the launch's "at_eof" says to do after the end of its input (already logged as `eof`)."""
        do = self.at_eof.get("do")
        if do == "linger":
            time.sleep(self.at_eof.get("ms", 500) / 1000.0)
            self.log({"event": "ended_after_linger", "launch": self.launch_id})
        elif do == "stay":
            time.sleep(self.at_eof.get("max_s", 120))   # ended from outside long before; see "at_eof"
            self.log({"event": "ended_after_max_stay", "launch": self.launch_id})

    def idle(self):
        """(Re)starts the wait of the launch's "idle" behaviour: it counts from the last request."""
        idle = self.script.get("idle")
        if not isinstance(idle, dict) or self.muted:
            return
        if self.idle_timer:
            self.idle_timer.cancel()
        self.idle_timer = threading.Timer(idle.get("after_ms", 200) / 1000.0, lambda: self.ended(idle, "idle"))
        self.idle_timer.daemon = True
        self.idle_timer.start()

    # ---- `connection/changed` on a schedule ----------------------------------------------------------------------
    def bursts(self):
        """Starts every "timer" schedule whose count of answered reads is reached just now."""
        for s in self.changed:
            if s.get("when") == "timer" and s.get("start_after_reads", 1) == self.read_answers:
                for i in range(int(s.get("times", 1))):
                    self.later(s.get("delay_ms", 100) + i * s.get("every_ms", 50) or 1, lambda: self.write(CHANGED, "event"))

    def changed_for(self, k, when):
        return [s for s in self.changed if s.get("when") == when and s.get("from_read", 0) <= k and ("times" not in s or k < s.get("from_read", 0) + s["times"])]

    # ---- the account read ----------------------------------------------------------------------------------------
    def read(self, rid):
        k = self.n_read
        self.n_read += 1
        reads = self.script.get("reads") or []
        behaviour = reads[k] if k < len(reads) else {"do": "result"}
        if self.ended(behaviour, "read"):
            return
        def reply():
            also = [(CHANGED, "event") for _ in self.changed_for(k, "with_read")]
            if behaviour.get("do") == "error":
                self.error(rid, behaviour.get("code", "failed"), also)
            else:
                result = behaviour["result"] if "result" in behaviour else behaviour.get("connection") or self.script.get("connection") or DEFAULT_CONNECTION
                self.write({"id": rid, "result": result}, "connection", also)
            self.read_answers += 1
            for s in self.changed_for(k, "after_read"):
                self.later(s.get("delay_ms", 5), lambda: self.write(CHANGED, "event"))
            self.bursts()
        self.later(behaviour.get("delay_ms", 0), reply)

    # ---- the sign-in methods (scripted; nothing is ever signed in, and this file opens nothing) ------------------
    def completed(self, spec, login_id, also_of=None):
        """The event `connection/login/completed` a behaviour asks for. `also_of`: collected for the reply's own write."""
        if not isinstance(spec, dict):
            return
        event = ({"method": "connection/login/completed", "params": {"login_id": spec.get("login_id") or login_id, "success": spec.get("success") is True, "error": spec.get("error")}}, "login_completed")
        if also_of is not None and not spec.get("delay_ms"):
            also_of.append(event)
        else:
            self.later(spec.get("delay_ms", 0), lambda: self.write(*event))

    def login_start(self, rid):
        k = self.n_login_start
        self.n_login_start += 1
        starts = self.script.get("login_start") or []
        behaviour = starts[k] if k < len(starts) else {"do": "error", "code": "unavailable"}   # as before: never a sign-in, never an address
        if self.ended(behaviour, "login_start"):
            return
        def reply():
            do = behaviour.get("do", "result")
            if do == "error":
                return self.error(rid, behaviour.get("code", "failed"))
            login_id = behaviour.get("login_id") or f"login-qa-{k + 1}"
            address = behaviour.get("auth_url") or (OFFICIAL_ADDRESS if behaviour.get("address") == "official" else NOT_OFFICIAL_ADDRESS)
            if do == "malformed":
                return self.write({"id": rid, "result": behaviour["result"] if "result" in behaviour else {"login_id": "", "auth_url": address}}, "login_start_malformed")
            also = []
            self.completed(behaviour.get("completed"), login_id, also)
            self.write({"id": rid, "result": {"login_id": login_id, "auth_url": address}}, "login_start", also)
        self.later(behaviour.get("delay_ms", 0), reply)

    def login_cancel(self, rid, params):
        k = self.n_login_cancel
        self.n_login_cancel += 1
        cancels = self.script.get("login_cancel") or []
        behaviour = cancels[k] if k < len(cancels) else {"do": "error", "code": "unavailable"}
        self.completed(behaviour.get("completed"), params.get("login_id"))
        if self.ended(behaviour, "login_cancel"):
            return
        def reply():
            if behaviour.get("do", "result") == "error":
                return self.error(rid, behaviour.get("code", "failed"))
            self.write({"id": rid, "result": behaviour["result"] if "result" in behaviour else {}}, "login_cancel_receipt")
        self.later(behaviour.get("delay_ms", 0), reply)

    # ---- a question ----------------------------------------------------------------------------------------------
    def ask(self, rid, params):
        request, model = params.get("request") or {}, params.get("model")
        image = request.get("image") or {}
        try:
            png = base64.b64decode(image.get("png_base64") or "", validate=True)
        except ValueError:
            png = b""
        asks = self.script.get("asks") or []
        behaviour = asks[self.n_ask] if self.n_ask < len(asks) else {"do": "error", "code": "failed"}
        # The question is logged whatever it holds: half of a surrogate pair cannot be encoded as UTF-8 text, and a
        # stand-in that died there would log no ask at all for exactly the question that should never have arrived.
        question = request.get("question") if isinstance(request.get("question"), str) else ""
        well_formed = True
        try:
            question.encode("utf-8")
        except UnicodeEncodeError:
            well_formed = False
        self.log({"event": "ask", "n": self.n_ask, "id": rid, "request_id": request.get("request_id"), "model": model, "assistance": request.get("assistance"),
                  "question_chars": len(question), "question_sha256": hashlib.sha256(question.encode("utf-8", "surrogatepass")).hexdigest(), "question_well_formed": well_formed,
                  "image": {"sha256": image.get("sha256"), "width": image.get("width"), "height": image.get("height"), "png_bytes": len(png),
                            "bytes_hash_to_sha256": hashlib.sha256(png).hexdigest() == image.get("sha256"), "is_png": png[:8] == b"\x89PNG\r\n\x1a\n"},
                  "capture_session_id": (request.get("context") or {}).get("capture_session_id"), "context_keys": sorted(request.get("context") or {}),
                  "request_keys": sorted(request), "behaviour": behaviour.get("do")})
        self.n_ask += 1
        do = behaviour.get("do")
        if do == "answer":
            self.later(behaviour.get("delay_ms", 0), lambda: self.answer(rid, request, model, behaviour))
        elif do == "hold":
            self.held[request.get("request_id")] = (rid, behaviour, request, model)
        elif do == "fault" and behaviour.get("during_read"):
            self.fault_on_read = True
            self.write(CHANGED, "event")
        elif do == "fault":
            if behaviour.get("changed_first"):
                self.write(CHANGED, "event")
            self.overlong()
        elif do == "silence":
            self.faulted = True
        elif do in ("exit", "close_output"):
            self.ended(behaviour, "ask")
        else:
            self.later(behaviour.get("delay_ms", 0), lambda: self.error(rid, behaviour.get("code", "failed")))

    def overlong(self):
        if True:
            with self.lock:
                self.out.write("x" * (300 * 1024) + "\n")  # not a line of the envelope: longer than its limit
                self.out.flush()
            self.log({"event": "sent", "kind": "fault", "bytes": 300 * 1024})
            self.faulted = True

    def end_held(self, request_id, how):
        rid, behaviour, request, model = self.held.pop(request_id)
        self.error(rid, "cancelled")
        return behaviour.get(how), (rid, request, model, behaviour)

    def handle(self, m):
        rid, method, params = m.get("id"), m.get("method"), m.get("params") or {}
        if method != "ask/start":
            self.log({"event": "request", "id": rid, "method": method, "params_keys": sorted(params), "request_id": params.get("request_id"),
                      "capture_session_id": params.get("capture_session_id")})
        if m.get("version") != VERSION or not isinstance(rid, str):
            return self.error(rid if isinstance(rid, str) else None, "invalid_request")
        if method == "connection/read" and self.fault_on_read:
            self.write(CHANGED, "event")
            return self.overlong()
        if method == "connection/read":
            return self.read(rid)
        if method == "ask/start":
            return self.ask(rid, params)
        if method == "ask/cancel":
            target = params.get("request_id")
            if target not in self.held:
                return self.write({"id": rid, "result": {"cancelled": False, "uncertain": False}}, "cancel_receipt")
            mode, late = self.end_held(target, "on_cancel")
            self.write({"id": rid, "result": {"cancelled": True, "uncertain": mode == "unconfirmed"}}, "cancel_receipt")
            if mode == "late_answer":
                self.later(300, lambda: self.answer(late[0], late[1], late[2], {"text": f"{LABEL}. LATE answer after a cancel: this text must never be shown."}))
            return None
        if method == "session/stop":
            session = params.get("capture_session_id")
            lates = []
            for request_id in [r for r, h in self.held.items() if (h[2].get("context") or {}).get("capture_session_id") == session]:
                mode, late = self.end_held(request_id, "on_stop")
                if mode == "late_answer":
                    lates.append(late)
            self.write({"id": rid, "result": {}}, "stop_receipt")
            for late in lates:
                self.later(300, lambda late=late: self.answer(late[0], late[1], late[2], {"text": f"{LABEL}. LATE answer after a Stop: this text must never be shown."}))
            return None
        if method == "connection/login/start":
            return self.login_start(rid)
        if method == "connection/login/cancel":
            return self.login_cancel(rid, params)
        return self.error(rid, "invalid_request")


def serve(folder, stdin, stdout):
    bridge = Bridge(folder, stdout)
    for raw in stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            m = json.loads(line)
        except ValueError:
            bridge.error(None, "invalid_request")
            continue
        if isinstance(m, dict):
            bridge.handle(m)
            bridge.idle()
    time.sleep(0.05)
    bridge.log({"event": "eof", "launch": bridge.launch_id, "held_at_eof": sorted(bridge.held)})
    bridge.end_of_input()


def self_test():
    """Runs this file as a child over real pipes in a temp folder and checks every behaviour's wire shape."""
    import subprocess
    import tempfile
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    def request(n, session="cap-1", question="q?"):
        return {"request_id": f"ask-x.{n}", "question": question, "assistance": "explain",
                "image": {"png_base64": base64.b64encode(png).decode(), "sha256": hashlib.sha256(png).hexdigest(), "width": 1, "height": 1},
                "context": {"capture_session_id": session, "frame_seq": 1}}
    bad = []
    checks = [0]
    def expect(name, got, test):
        checks[0] += 1
        try:
            ok = test(got)
        except Exception as error:  # a line of another shape than the check reads is a failed check, not a crash
            ok, got = False, [got, repr(error)]
        if not ok:
            bad.append([name, got])

    class Child:
        """One start of this file over real pipes in `folder`, as the app starts its connector."""
        def __init__(self, folder):
            self.p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "-m", "services.worker.connectors.chatgpt_local"], cwd=folder, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            self.n = 0
        def send(self, method, params):
            self.n += 1
            self.p.stdin.write(json.dumps({"version": VERSION, "id": f"r{self.n}", "method": method, "params": params}) + "\n")
            self.p.stdin.flush()
            return f"r{self.n}"
        def read(self):
            return json.loads(self.p.stdout.readline())
        def end(self, code=0):
            """The end of its input (if it still takes any); what it still wrote, and its exit code."""
            try:
                self.p.stdin.close()
            except OSError:
                pass
            rest = self.p.stdout.read()
            return rest, self.p.wait(5) == code

    def script_in(folder, script):
        with open(os.path.join(folder, "bridge-script.json"), "w", encoding="utf-8") as f:
            json.dump(script, f)
    def log_of(folder):
        with open(os.path.join(folder, "bridge-log.jsonl"), encoding="utf-8") as f:
            return [json.loads(l) for l in f]
    def changed(m):
        return m == {"method": "connection/changed", "params": {}}

    # ---- the behaviours of the display controls, unchanged ------------------------------------------------------
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script_in(folder, {"launches": [{"asks": [{"do": "answer", "text": "A1"}, {"do": "answer", "tamper": "image_sha256"}, {"do": "error", "code": "quota"},
                                                   {"do": "hold", "on_cancel": "cancelled"}, {"do": "hold", "on_cancel": "unconfirmed"}, {"do": "hold", "on_cancel": "late_answer"},
                                                   {"do": "hold", "on_stop": "late_answer"}, {"do": "fault", "changed_first": True}]}]})
        c = Child(folder)
        send, read, p = c.send, c.read, c.p
        send("connection/read", {})
        expect("connection", read(), lambda m: m["result"]["auth"] == {"state": "signed_in", "mode": "chatgpt", "plan": "QA-SYNTHETIC"} and [x["image_input"] for x in m["result"]["models"]] == [True, False])
        rid = send("ask/start", {"request": request(1), "model": "qa-synthetic-vision"})
        expect("answer", read(), lambda m: m["id"] == rid and m["result"]["text"] == "A1" and m["result"]["provenance"] == {k: request(1)[k] for k in ("request_id", "question", "assistance")} | {"image": {k: request(1)["image"][k] for k in ("sha256", "width", "height")}, "context": request(1)["context"]}
               and m["result"]["auth_mode"] == "chatgpt" and m["result"]["model"] == "qa-synthetic-vision")
        send("ask/start", {"request": request(2), "model": "m"})
        expect("tampered", read(), lambda m: m["result"]["provenance"]["image"]["sha256"] == "0" * 64)
        send("ask/start", {"request": request(3), "model": "m"})
        expect("quota", read(), lambda m: m["error"]["code"] == "quota")
        a = send("ask/start", {"request": request(4), "model": "m"})
        c4 = send("ask/cancel", {"request_id": "ask-x.4"})
        expect("cancelled ask", read(), lambda m: m["id"] == a and m["error"]["code"] == "cancelled")
        expect("cancel receipt", read(), lambda m: m["id"] == c4 and m["result"] == {"cancelled": True, "uncertain": False})
        send("ask/start", {"request": request(5), "model": "m"})
        send("ask/cancel", {"request_id": "ask-x.5"})
        read()
        expect("unconfirmed receipt", read(), lambda m: m["result"] == {"cancelled": True, "uncertain": True})
        a = send("ask/start", {"request": request(6), "model": "m"})
        send("ask/cancel", {"request_id": "ask-x.6"})
        read(), read()
        expect("late answer after cancel", read(), lambda m: m["id"] == a and "LATE" in m["result"]["text"])
        a = send("ask/start", {"request": request(7, "cap-2"), "model": "m"})
        s = send("session/stop", {"capture_session_id": "cap-2"})
        expect("stopped ask", read(), lambda m: m["id"] == a and m["error"]["code"] == "cancelled")
        expect("stop receipt", read(), lambda m: m["id"] == s and m["result"] == {})
        expect("late answer after stop", read(), lambda m: m["id"] == a and "LATE" in m["result"]["text"])
        send("ask/cancel", {"request_id": "nothing-out"})
        expect("cancel of nothing", read(), lambda m: m["result"] == {"cancelled": False, "uncertain": False})
        send("ask/start", {"request": request(8), "model": "m"})
        expect("changed event", read(), changed)
        expect("fault line", p.stdout.readline(), lambda line: len(line) == 300 * 1024 + 1 and set(line.strip()) == {"x"})
        send("connection/read", {})   # after the fault nothing is answered
        p.stdin.close()
        rest = p.stdout.read()
        expect("silent after the fault", rest, lambda r: r == "")
        expect("exit", p.wait(5), lambda code: code == 0)
        log = log_of(folder)
        asks = [e for e in log if e["event"] == "ask"]
        expect("log", log, lambda l: l[0]["event"] == "start" and l[0]["stdin_fifo"] is True and l[-1]["event"] == "eof" and len(asks) == 8
               and all(e["image"]["bytes_hash_to_sha256"] and e["image"]["is_png"] for e in asks) and "png_base64" not in json.dumps(l) and "q?" not in json.dumps(l))

    # ---- a launch with none of the newer keys: the sign-in methods answer `unavailable`, every read the one result ----
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script_in(folder, {"launches": [{"asks": []}]})
        c = Child(folder)
        a = c.send("connection/login/start", {})
        expect("no script: sign-in start is unavailable", c.read(), lambda m: m["id"] == a and m["error"]["code"] == "unavailable")
        a = c.send("connection/login/cancel", {"login_id": "x"})
        expect("no script: sign-in cancel is unavailable", c.read(), lambda m: m["id"] == a and m["error"]["code"] == "unavailable")
        c.send("connection/read", {}), c.send("connection/read", {})
        expect("no script: every read is the one result, nothing between", [c.read(), c.read()], lambda two: all(m["result"] == DEFAULT_CONNECTION for m in two))
        expect("no script: ends at the end of its input", c.end(), lambda r: r == ("", True))
        expect("no script: no line of a newer kind in the log", log_of(folder), lambda l: [e["event"] for e in l] == ["start", "request", "sent", "request", "sent", "request", "sent", "request", "sent", "eof"])

    # ---- scripted reads, `connection/changed` with and after a read's answer, and a burst on a timer ------------------
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        signed_out = {"auth": {"state": "signed_out", "mode": None, "plan": None}, "rate_limits": None, "models": []}
        script_in(folder, {"launches": [{"reads": [{"do": "result"}, {"do": "error", "code": "busy"}, {"do": "error", "code": "qa-not-a-code"}, {"do": "hold"},
                                                    {"do": "result", "result": {"something": "else"}}, {"do": "result", "connection": signed_out}],
                                         "changed": [{"when": "with_read", "times": 2}, {"when": "after_read", "delay_ms": 20, "from_read": 4, "times": 1},
                                                     {"when": "timer", "start_after_reads": 5, "delay_ms": 30, "every_ms": 10, "times": 3}]}]})
        c = Child(folder)
        a = c.send("connection/read", {})
        expect("read 0: the result, then changed", [c.read(), c.read()], lambda two: two[0]["id"] == a and two[0]["result"] == DEFAULT_CONNECTION and changed(two[1]))
        a = c.send("connection/read", {})
        expect("read 1: error busy, then changed", [c.read(), c.read()], lambda two: two[0]["id"] == a and two[0]["error"]["code"] == "busy" and changed(two[1]))
        a = c.send("connection/read", {})
        expect("read 2: a code of its own, and no changed (times 2)", c.read(), lambda m: m["id"] == a and m["error"]["code"] == "qa-not-a-code")
        c.send("connection/read", {})   # read 3 is held: the next line written is read 4's
        a = c.send("connection/read", {})
        expect("read 3 held; read 4: a result of another shape", c.read(), lambda m: m["id"] == a and m["result"] == {"something": "else"})
        expect("read 4: changed shortly after its answer", c.read(), changed)
        a = c.send("connection/read", {})
        expect("read 5: another account for this read only", c.read(), lambda m: m["id"] == a and m["result"] == signed_out)
        expect("a burst of 3 after the fifth answered read", [c.read(), c.read(), c.read()], lambda three: all(changed(m) for m in three))
        a = c.send("connection/read", {})
        expect("read 6, past the list: the normal result and nothing after", c.read(), lambda m: m["id"] == a and m["result"] == DEFAULT_CONNECTION)
        expect("scripted reads: ends at the end of its input", c.end(), lambda r: r == ("", True))
        log = log_of(folder)
        sent = [e for e in log if e["event"] == "sent"]
        # (A line is logged after it is written, and the timed "changed" lines come from another thread: the ORDER of the
        # lines was read from the pipe above; of the log, the answers' order and the number of events are checked.)
        kinds = [e["kind"] for e in sent]
        expect("scripted reads: the log", log, lambda l: len([e for e in l if e["event"] == "request" and e["method"] == "connection/read"]) == 7
               and [k for k in kinds if k != "event"] == ["connection", "error", "error", "connection", "connection", "connection"] and kinds.count("event") == 6 and l[-1]["event"] == "eof")

    # ---- the sign-in methods, scripted ---------------------------------------------------------------------------------
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script_in(folder, {"launches": [{"login_start": [{"do": "result"}, {"do": "result", "address": "official", "login_id": "L2"}, {"do": "error", "code": "busy"}, {"do": "malformed"},
                                                          {"do": "result", "address": "official", "completed": {"success": False, "error": "login_cancelled"}},
                                                          {"do": "result", "address": "official", "completed": {"success": True, "delay_ms": 20}}, {"do": "hold"}],
                                         "login_cancel": [{"do": "result"}, {"do": "error", "code": "invalid_request"}, {"do": "result", "result": {"cancelled": True}},
                                                          {"do": "hold", "completed": {"success": True, "error": None}}, {"do": "error", "code": "failed", "completed": {"success": False, "error": "qa"}}]}]})
        c = Child(folder)
        a = c.send("connection/login/start", {})
        expect("start 0: an address that is not official (the default)", c.read(), lambda m: m["id"] == a and m["result"] == {"login_id": "login-qa-1", "auth_url": NOT_OFFICIAL_ADDRESS})
        a = c.send("connection/login/start", {})
        expect("start 1: an official address, its own id", c.read(), lambda m: m["id"] == a and m["result"] == {"login_id": "L2", "auth_url": "https://chatgpt.com/qa-synthetic-not-a-sign-in"})
        a = c.send("connection/login/start", {})
        expect("start 2: error busy", c.read(), lambda m: m["id"] == a and m["error"]["code"] == "busy")
        a = c.send("connection/login/start", {})
        expect("start 3: a result of another shape", c.read(), lambda m: m["id"] == a and m["result"] == {"login_id": "", "auth_url": NOT_OFFICIAL_ADDRESS})
        a = c.send("connection/login/start", {})
        expect("start 4: completed (not a success) right after its reply", [c.read(), c.read()], lambda two: two[0]["id"] == a and two[0]["result"]["login_id"] == "login-qa-5"
               and two[1] == {"method": "connection/login/completed", "params": {"login_id": "login-qa-5", "success": False, "error": "login_cancelled"}})
        a = c.send("connection/login/start", {})
        expect("start 5: completed (success) a little later", [c.read(), c.read()], lambda two: two[0]["id"] == a
               and two[1] == {"method": "connection/login/completed", "params": {"login_id": "login-qa-6", "success": True, "error": None}})
        c.send("connection/login/start", {})   # start 6 is held: the next line written is the cancel's
        a = c.send("connection/login/cancel", {"login_id": "L2"})
        expect("start 6 held; cancel 0: acknowledged {}", c.read(), lambda m: m == {"id": a, "result": {}})
        a = c.send("connection/login/cancel", {"login_id": "L2"})
        expect("cancel 1: error invalid_request", c.read(), lambda m: m["id"] == a and m["error"]["code"] == "invalid_request")
        a = c.send("connection/login/cancel", {"login_id": "L2"})
        expect("cancel 2: another shape", c.read(), lambda m: m == {"id": a, "result": {"cancelled": True}})
        c.send("connection/login/cancel", {"login_id": "L9"})
        expect("cancel 3: held, with the completion of the sign-in it names", c.read(), lambda m: m == {"method": "connection/login/completed", "params": {"login_id": "L9", "success": True, "error": None}})
        a = c.send("connection/login/cancel", {"login_id": "L9"})
        expect("cancel 4: the completion first, then its error", [c.read(), c.read()], lambda two: two[0]["params"] == {"login_id": "L9", "success": False, "error": "qa"} and two[1]["id"] == a and two[1]["error"]["code"] == "failed")
        a = c.send("connection/login/cancel", {"login_id": "L9"})
        expect("cancel 5, past the list: unavailable", c.read(), lambda m: m["id"] == a and m["error"]["code"] == "unavailable")
        expect("sign-in script: ends at the end of its input", c.end(), lambda r: r == ("", True))
        expect("sign-in script: the log names each completion", [e.get("params") for e in log_of(folder) if e.get("kind") == "login_completed"],
               lambda ps: [(x["login_id"], x["success"], x["error"]) for x in ps] == [("login-qa-5", False, "login_cancelled"), ("login-qa-6", True, None), ("L9", True, None), ("L9", False, "qa")])

    # ---- ending by itself: on an ask, on a read, on a sign-in method, idle; and only its output closed ---------------
    def ends(name, launch, steps, on, code):
        with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
            script_in(folder, {"launches": [launch]})
            c = Child(folder)
            for method, params in steps:
                c.send(method, params)
            out = c.p.stdout.read()   # until the end of its output: it ended by itself, its input is still open
            expect(f"exit {name}: its exit code, with its input still open", c.p.wait(5), lambda got: got == code)
            log = log_of(folder)
            expect(f"exit {name}: logged as its own event, last, and no eof", log, lambda l: l[-1]["event"] == "exit" and l[-1]["on"] == on and l[-1]["code"] == code and not [e for e in l if e["event"] == "eof"])
            c.p.stdin.close()
            return out, log
    out, log = ends("on an ask", {"asks": [{"do": "exit", "code": 3}]}, [("connection/read", {}), ("ask/start", {"request": request(1), "model": "m"})], "ask", 3)
    expect("exit on an ask: the read was answered, the ask logged and not answered", [out.count("\n"), [e["event"] for e in log]], lambda r: r == [1, ["start", "request", "sent", "ask", "exit"]])
    out, log = ends("on a read", {"reads": [{"do": "result"}, {"do": "exit"}]}, [("connection/read", {}), ("connection/read", {})], "read", 0)
    expect("exit on a read: only the first read was answered", out.count("\n"), lambda n: n == 1)
    ends("on a sign-in start", {"login_start": [{"do": "exit", "code": 1}]}, [("connection/login/start", {})], "login_start", 1)
    ends("on a sign-in cancel", {"login_cancel": [{"do": "exit", "code": 2}]}, [("connection/login/cancel", {"login_id": "x"})], "login_cancel", 2)
    out, log = ends("idle", {"idle": {"do": "exit", "after_ms": 60, "code": 4}}, [("connection/read", {})], "idle", 4)
    expect("exit idle: the read was answered first", out.count("\n"), lambda n: n == 1)
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script_in(folder, {"launches": [{"reads": [{"do": "result"}, {"do": "close_output"}]}]})
        c = Child(folder)
        c.send("connection/read", {}), c.send("connection/read", {})
        expect("output closed: the reader sees the end of the output after the one answer", c.p.stdout.read().count("\n"), lambda n: n == 1)
        expect("output closed: the process lives", c.p.poll(), lambda code: code is None)
        c.send("connection/read", {})
        expect("output closed: it ends at the end of its input, exit code 0", c.end(), lambda r: r == ("", True))
        expect("output closed: later requests are still read and logged, none answered", [e["event"] for e in log_of(folder)],
               lambda events: events == ["start", "request", "sent", "request", "output_closed", "request", "eof"])

    # ---- the end of its input: lingering, staying, staying through SIGTERM ---------------------------------------------
    def logged(folder, event):
        """Waits (5 s at most) until the log holds a line of that event."""
        by = time.monotonic() + 5
        while time.monotonic() < by:
            try:
                if [e for e in log_of(folder) if e["event"] == event]:
                    return True
            except (OSError, ValueError):   # no log yet, or a line still being written
                pass
            time.sleep(0.01)
        return False
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script_in(folder, {"launches": [{"at_eof": {"do": "linger", "ms": 300}}]})
        c = Child(folder)
        c.send("connection/read", {})
        c.read()
        closed = time.monotonic()
        rest, code_0 = c.end()
        expect("at_eof linger: it ends by itself with exit code 0, no sooner than its time after the end of its input", [rest, code_0, time.monotonic() - closed], lambda r: r[:2] == ["", True] and r[2] >= 0.3)
        expect("at_eof linger: `eof` is logged first, then its own end", [e["event"] for e in log_of(folder)], lambda events: events == ["start", "request", "sent", "eof", "ended_after_linger"])
    for ignore_term in (False, True):
        with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
            name = "at_eof stay, ignore_term" if ignore_term else "at_eof stay"
            script_in(folder, {"launches": [{"at_eof": {"do": "stay", "ignore_term": ignore_term}}]})
            c = Child(folder)
            c.send("connection/read", {})
            c.read()
            c.p.stdin.close()
            expect(f"{name}: the end of its input is logged", logged(folder, "eof"), lambda ok: ok)
            time.sleep(0.2)
            expect(f"{name}: it lives on after the end of its input", c.p.poll(), lambda code: code is None)
            c.p.terminate()
            if ignore_term:
                time.sleep(0.3)
                expect(f"{name}: it lives on after SIGTERM", c.p.poll(), lambda code: code is None)
                c.p.kill()
            expect(f"{name}: it ended only when ended from outside, by that signal", c.p.wait(5), lambda code: code == -(signal.SIGKILL if ignore_term else signal.SIGTERM))
            expect(f"{name}: its output stayed open and empty, and nothing follows `eof` in its log", [c.p.stdout.read(), [e["event"] for e in log_of(folder)]], lambda r: r == ["", ["start", "request", "sent", "eof"]])

    # ---- three timing properties the checks rely on --------------------------------------------------------------------
    # Each is checked from the side that cannot fail by a busy machine: a lower bound on a time, or what ONE read of the
    # pipe gives while this reader was already waiting for it. (So a slow machine can hide a fault here, never make one.)
    def at(entry):
        return datetime.fromisoformat(entry["at"]).timestamp()
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script_in(folder, {"launches": [{"changed": [{"when": "with_read", "times": 1}, {"when": "after_read", "delay_ms": 300, "from_read": 1, "times": 1}]}]})
        p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "-m", "services.worker.connectors.chatgpt_local"], cwd=folder, stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
        def raw(rid):
            p.stdin.write((json.dumps({"version": VERSION, "id": rid, "method": "connection/read", "params": {}}) + "\n").encode())
            return time.monotonic()
        def chunk():
            return [json.loads(l) for l in os.read(p.stdout.fileno(), 65536).decode().splitlines()]
        raw("r1")
        expect("with_read: the answer and `connection/changed` are ONE write (one read of the pipe gives both lines, in that order)", chunk(), lambda ms: len(ms) == 2 and ms[0]["id"] == "r1" and changed(ms[1]))
        asked = raw("r2")
        first, second, waited = chunk(), chunk(), time.monotonic() - asked
        expect("after_read: the answer comes alone, then `connection/changed` in a write of its own, no sooner than delay_ms after the request", [first, second, waited],
               lambda r: len(r[0]) == 1 and r[0][0]["id"] == "r2" and len(r[1]) == 1 and changed(r[1][0]) and r[2] >= 0.3)
        p.stdin.close()
        expect("after_read: nothing more is written, and it ends at the end of its input", [p.stdout.read(), p.wait(5)], lambda r: r == [b"", 0])
        sent = [e for e in log_of(folder) if e["event"] == "sent"]
        expect("after_read: by the stand-in's own log, `connection/changed` was written at least delay_ms after the answer", sent,
               lambda l: [e["kind"] for e in l] == ["connection", "event", "connection", "event"] and at(l[3]) - at(l[2]) >= 0.3)
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script_in(folder, {"launches": [{"idle": {"do": "exit", "after_ms": 600, "code": 5}}]})
        c = Child(folder)
        expect("idle: the launch has started", logged(folder, "start"), lambda ok: ok)
        time.sleep(0.8)
        alive = c.p.poll() is None
        expect("idle: not armed before the first request (it lives 0.8 s after its start, with after_ms 600)", alive, lambda ok: ok)
        if alive:   # (one that ended already takes no request: the check above has failed, and that is all there is to say)
            a = c.send("connection/read", {})
            one = c.read()
            time.sleep(0.1)
            b = c.send("connection/read", {})
            two = c.read()
            expect("idle: both requests were answered, then it ended by itself with its code", [one["id"], two["id"], c.p.stdout.read(), c.p.wait(5)], lambda r: r == [a, b, "", 5])
            log = log_of(folder)
            asked = [e for e in log if e["event"] == "request"]
            expect("idle: counted from the LAST request (its end is logged at least after_ms after the second request, which came 0.1 s after the first)", log,
                   lambda l: l[-1]["event"] == "exit" and l[-1]["on"] == "idle" and len(asked) == 2 and at(l[-1]) - at(asked[1]) >= 0.6 and at(asked[1]) - at(asked[0]) >= 0.1)
            c.p.stdin.close()

    # ---- a question that is not well-formed text is logged, answered, and the process lives --------------------------
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script_in(folder, {"launches": [{"asks": [{"do": "answer", "text": "A1"}, {"do": "answer", "text": "A2"}]}]})
        c = Child(folder)
        lone = "What is \ud83d this?"
        a = c.send("ask/start", {"request": request(1, question=lone), "model": "m"})
        expect("lone surrogate: answered, bound to the question as it came", c.read(), lambda m: m["id"] == a and m["result"]["provenance"]["question"] == lone)
        whole = "这道题 \U0001F600 é"
        a = c.send("ask/start", {"request": request(2, question=whole), "model": "m"})
        expect("well-formed text after it: answered by the same process", c.read(), lambda m: m["id"] == a and m["result"]["provenance"]["question"] == whole)
        expect("lone surrogate: ends at the end of its input, exit code 0", c.end(), lambda r: r == ("", True))
        asks = [e for e in log_of(folder) if e["event"] == "ask"]
        expect("lone surrogate: both asks are in the log", [(e["question_chars"], e["question_well_formed"], e["question_sha256"]) for e in asks],
               lambda r: r == [(len(lone), False, hashlib.sha256(lone.encode("utf-8", "surrogatepass")).hexdigest()), (len(whole), True, hashlib.sha256(whole.encode()).hexdigest())])
    print(json.dumps({"checks": checks[0], "failed": bad}, indent=1))
    return 1 if bad else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        raise SystemExit(self_test())
    serve(os.getcwd(), sys.stdin, sys.stdout)
