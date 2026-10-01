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
`bridge-log.jsonl` in the folder gets one line per start, request, written line and end, with sizes and hashes only
(no picture, no base64; the question as its length and sha256).
"""
import base64
import hashlib
import json
import os
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


class Bridge:
    def __init__(self, folder, out):
        self.folder, self.out = folder, out
        self.lock = threading.Lock()
        self.launch_id = uuid.uuid4().hex
        self.n_ask = 0
        self.held = {}        # request_id -> (rpc id, behaviour, request, model)
        self.faulted = False
        self.fault_on_read = False
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
        self.log({"event": "start", "launch": self.launch_id, "launch_n": self.launch_n, "pid": os.getpid(), "argv": sys.argv[1:],
                  "stdin_fifo": os.path.exists("/proc/self/fd/0") and os.stat(0).st_mode & 0o170000 == 0o010000, "label": LABEL})

    def log(self, entry):
        entry = {"at": datetime.now(timezone.utc).isoformat(), **entry}
        with self.lock:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")

    def write(self, obj, kind):
        if self.faulted:
            return
        line = json.dumps(obj, separators=(",", ":"))
        with self.lock:
            self.out.write(line + "\n")
            self.out.flush()
        self.log({"event": "sent", "kind": kind, "id": obj.get("id"), "method": obj.get("method"), "error": (obj.get("error") or {}).get("code"),
                  "result_keys": sorted(obj["result"]) if isinstance(obj.get("result"), dict) else None})

    def error(self, rid, code):
        self.write({"id": rid, "error": {"code": code, "message": f"{LABEL}: {code}"}}, "error")

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

    def ask(self, rid, params):
        request, model = params.get("request") or {}, params.get("model")
        image = request.get("image") or {}
        try:
            png = base64.b64decode(image.get("png_base64") or "", validate=True)
        except ValueError:
            png = b""
        asks = self.script.get("asks") or []
        behaviour = asks[self.n_ask] if self.n_ask < len(asks) else {"do": "error", "code": "failed"}
        self.log({"event": "ask", "n": self.n_ask, "id": rid, "request_id": request.get("request_id"), "model": model, "assistance": request.get("assistance"),
                  "question_chars": len(request.get("question") or ""), "question_sha256": hashlib.sha256((request.get("question") or "").encode()).hexdigest(),
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
            self.write({"method": "connection/changed", "params": {}}, "event")
        elif do == "fault":
            if behaviour.get("changed_first"):
                self.write({"method": "connection/changed", "params": {}}, "event")
            self.overlong()
        elif do == "silence":
            self.faulted = True
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
            self.write({"method": "connection/changed", "params": {}}, "event")
            return self.overlong()
        if method == "connection/read":
            return self.write({"id": rid, "result": self.script.get("connection") or DEFAULT_CONNECTION}, "connection")
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
        if method in ("connection/login/start", "connection/login/cancel"):
            return self.error(rid, "unavailable")  # the stand-in never starts a sign-in and never gives an address to open
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
    time.sleep(0.05)
    bridge.log({"event": "eof", "launch": bridge.launch_id, "held_at_eof": sorted(bridge.held)})


def self_test():
    """Runs this file as a child over real pipes in a temp folder and checks every behaviour's wire shape."""
    import subprocess
    import tempfile
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    def request(n, session="cap-1"):
        return {"request_id": f"ask-x.{n}", "question": "q?", "assistance": "explain",
                "image": {"png_base64": base64.b64encode(png).decode(), "sha256": hashlib.sha256(png).hexdigest(), "width": 1, "height": 1},
                "context": {"capture_session_id": session, "frame_seq": 1}}
    bad = []
    with tempfile.TemporaryDirectory(prefix="qa-bridge-") as folder:
        script = {"launches": [{"asks": [{"do": "answer", "text": "A1"}, {"do": "answer", "tamper": "image_sha256"}, {"do": "error", "code": "quota"},
                                         {"do": "hold", "on_cancel": "cancelled"}, {"do": "hold", "on_cancel": "unconfirmed"}, {"do": "hold", "on_cancel": "late_answer"},
                                         {"do": "hold", "on_stop": "late_answer"}, {"do": "fault", "changed_first": True}]}]}
        with open(os.path.join(folder, "bridge-script.json"), "w", encoding="utf-8") as f:
            json.dump(script, f)
        p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "-m", "services.worker.connectors.chatgpt_local"], cwd=folder, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        n = [0]
        def send(method, params):
            n[0] += 1
            p.stdin.write(json.dumps({"version": VERSION, "id": f"r{n[0]}", "method": method, "params": params}) + "\n")
            p.stdin.flush()
            return f"r{n[0]}"
        def read():
            return json.loads(p.stdout.readline())
        def expect(name, got, test):
            if not test(got):
                bad.append([name, got])
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
        c = send("ask/cancel", {"request_id": "ask-x.4"})
        expect("cancelled ask", read(), lambda m: m["id"] == a and m["error"]["code"] == "cancelled")
        expect("cancel receipt", read(), lambda m: m["id"] == c and m["result"] == {"cancelled": True, "uncertain": False})
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
        c = send("ask/cancel", {"request_id": "nothing-out"})
        expect("cancel of nothing", read(), lambda m: m["result"] == {"cancelled": False, "uncertain": False})
        send("ask/start", {"request": request(8), "model": "m"})
        expect("changed event", read(), lambda m: m == {"method": "connection/changed", "params": {}})
        expect("fault line", p.stdout.readline(), lambda line: len(line) == 300 * 1024 + 1 and set(line.strip()) == {"x"})
        send("connection/read", {})   # after the fault nothing is answered
        p.stdin.close()
        rest = p.stdout.read()
        expect("silent after the fault", rest, lambda r: r == "")
        expect("exit", p.wait(5), lambda code: code == 0)
        log = [json.loads(l) for l in open(os.path.join(folder, "bridge-log.jsonl"), encoding="utf-8")]
        asks = [e for e in log if e["event"] == "ask"]
        expect("log", log, lambda l: l[0]["event"] == "start" and l[0]["stdin_fifo"] is True and l[-1]["event"] == "eof" and len(asks) == 8
               and all(e["image"]["bytes_hash_to_sha256"] and e["image"]["is_png"] for e in asks) and "png_base64" not in json.dumps(l) and "q?" not in json.dumps(l))
    print(json.dumps({"checks": 17, "failed": bad}, indent=1))
    return 1 if bad else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        raise SystemExit(self_test())
    serve(os.getcwd(), sys.stdin, sys.stdout)
