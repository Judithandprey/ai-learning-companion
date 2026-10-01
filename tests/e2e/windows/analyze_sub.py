#!/usr/bin/env python3
"""Checks one QA run of a managed-subscription ASK scenario (tests/e2e/windows/run.mjs subcontrols|subcheck|subask <out>).

Usage: python3 analyze_sub.py <run out dir> [<evidence dir>] [--backend <released Backend checkout>]

  subcontrols  DETERMINISTIC CONTROLS with QA's stand-in bridge. No Codex, no ChatGPT, no sign-in, no allowance: every
               "answer" is text QA wrote. They show what the app does at its own boundary and are never real-model evidence.
  subcheck     the real connector, the user's "Check connection" press only; no sign-in and no question.
  subask       the ONE real image turn (docs/verification/qa/p0-13-subscription-ask-plan.md). A matcher pass on the answer
               is necessary, never sufficient: the full answer is kept for a person to read.

App reads are the app's own claims; they are checked against the files it kept (asks/<selection>.json, the exact PNG),
the stand-in's log or the connector's receipt, the surface's own truth and the process watcher. A check fails when a
value it relies on is missing. Statuses: pass / fail / limit (limit = not judged, or an observation; never a pass).
With --backend the prompt text is recomputed with the released prepare_subscription_ask and compared with the receipt.
"""
import base64
import glob
import hashlib
import json
import math
import os
import re
import sys
from datetime import datetime

args = [a for a in sys.argv[1:] if not a.startswith("--")]
RUN = args[0]
EVIDENCE = args[1] if len(args) > 1 else None
BACKEND = sys.argv[sys.argv.index("--backend") + 1] if "--backend" in sys.argv else None
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import judge_surface_answer as judge  # noqa: E402

checks = []


def check(cid, status, observed, note=None):
    checks.append({"id": cid, "status": status, "observed": observed, **({"note": note} if note else {})})


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def ts(stamp):
    m = re.fullmatch(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)?", str(stamp).strip())
    if not m:
        raise ValueError(f"not an ISO stamp: {stamp}")
    zone = m.group(3) or "Z"
    return datetime.fromisoformat(m.group(1) + ("+00:00" if zone == "Z" else zone)).timestamp() + (float("0." + m.group(2)) if m.group(2) else 0.0)


sha = lambda b: hashlib.sha256(b).hexdigest()
exists = lambda *p: os.path.exists(os.path.join(RUN, *p))
as_list = lambda v: [] if v is None else (v if isinstance(v, list) else [v])
CLOCK = 2.0

results = load(os.path.join(RUN, "out", "results.json"))
values, steps, procs = results["values"], results["steps"], results["processes"]
planned = load(os.path.join(RUN, "steps.json")) if exists("steps.json") else []
run_info = load(os.path.join(RUN, "run.json")) if exists("run.json") else {}
SCENARIO = run_info.get("scenario")
circled = run_info.get("surface_circled_cards")
watch = [json.loads(l) for l in open(os.path.join(RUN, "connector-watch.jsonl"), encoding="utf-8")] if exists("connector-watch.jsonl") else []


def parsed(name):
    v = values.get(name)
    return json.loads(v) if isinstance(v, str) else v


def step(pred):
    return next((s for s in steps if pred(s)), None)


def step_named(name):
    return step(lambda s: s.get("as") == name)


def presses(selector_text):
    """The runner steps (with their planned text) that clicked something: (step, planned)."""
    return [(s, p) for s, p in zip(steps, planned) if isinstance(p.get("eval"), str) and selector_text in p["eval"] and ".click()" in p["eval"]]


# ---------------------------------------------------------------- what the app kept: one record per selection
records = []
for path in sorted(glob.glob(os.path.join(RUN, "captures", "*", "asks", "*.json"))):
    try:
        rec = load(path)
    except ValueError:
        rec = {"unreadable": os.path.basename(path)}
    cap = os.path.basename(os.path.dirname(os.path.dirname(path)))
    png = os.path.join(os.path.dirname(path), os.path.basename((rec.get("image") or {}).get("file") or "-"))
    data = open(png, "rb").read() if os.path.isfile(png) else None
    records.append({"capture": cap, "file": os.path.basename(path), "record": rec, "png_bytes": data,
                    "png_ok": bool(data) and sha(data) == (rec.get("image") or {}).get("sha256") == os.path.splitext(os.path.basename(png))[0] and len(data) == rec["image"].get("bytes")})
requests = [dict(q, _selection=r["record"].get("selection_id"), _capture=r["capture"], _image=(r["record"].get("image") or {}).get("sha256")) for r in records for q in as_list(r["record"].get("requests"))]
request_by_id = {q.get("request_id"): q for q in requests}

# ---------------------------------------------------------------- run integrity (every scenario)
shots = [s for s in steps if s.get("kind") == "desktopShot"]
foreign = as_list((results.get("foreign") or {}).get("start")) + as_list((results.get("foreign") or {}).get("end")) + [f for s in shots for f in as_list(s.get("foreign"))]
looked = isinstance(results.get("foreign"), dict) and "start" in results["foreign"] and "end" in results["foreign"]
check("run.shared_desktop_quiet", "pass" if looked and not foreign else "fail", {"foreign_electron_seen": foreign, "looked_at_start_and_end": looked, "screenshots": len(shots)},
      "no other Electron app at start, at each screenshot and at the end (point-in-time)")
failed = [{"i": s["i"], "kind": s.get("kind"), "as": s.get("as"), "error": s.get("error")} for s in steps if not s["ok"]]
ran_plan = len(planned) > 0 and [s["i"] for s in steps] == list(range(1, len(planned) + 1)) and all(s.get("kind") in p and s.get("as") in (None, p.get("as")) for s, p in zip(steps, planned))
check("run.completed", "pass" if not results.get("aborted") and not failed and as_list(results.get("errors")) == [] and ran_plan else "fail",
      {"aborted": results.get("aborted"), "failed_steps": failed, "steps_run": len(steps), "steps_planned": len(planned), "each_step_is_its_planned_step": ran_plan},
      "every planned step ran, in order; an optional wait that timed out counts as a failed step here")
# Any planned step that could press Sign in / Cancel sign-in, call the sign-in API, or click or type on the control window.
SIGN_IN = re.compile(r"subLogin(Cancel)?['\"]?\)?\s*\.click|#subLogin|lc\.subLogin|openExternal")
login_presses = [i + 1 for i, p in enumerate(planned) if SIGN_IN.search(json.dumps(p)) or (("osClick" in p or "keys" in p) and p.get("window") != "overlay")]
sub_events = parsed("sub_events") if isinstance(parsed("sub_events"), list) else None
sub_reads = [parsed(k) for k in values if re.match(r"^(f_|r_|a_)", k) and isinstance(parsed(k), dict) and isinstance(parsed(k).get("s"), dict)]
login_states = sorted({str(e.get("login")) for e in sub_events or [] if e.get("mode") == "managed"} | {str(r["s"].get("login")) for r in sub_reads})
no_login = login_presses == [] and len(planned) > 0 and sub_events is not None and len(sub_events) > 0 and login_states == ["none"]
check("qa.never_signs_in", "pass" if no_login else "fail", {"steps_that_could_sign_in": login_presses, "login_states_seen": login_states, "status_events": len(sub_events or []), "status_reads": len(sub_reads)},
      "no planned step presses Sign in or Cancel sign-in or clicks or types in the control window, and every subscription status the app notified or returned has "
      "login 'none': this run started no sign-in and opened no browser")


def self_exit(key):
    p = procs.get(key) or {}
    s = step(lambda s: s.get("kind") == "closeApp" and p.get("close_requested_at") and s.get("close_requested_at") == p.get("close_requested_at"))
    return bool(p.get("exited") is True and p.get("exit_code") == 0 and not p.get("killed") and not p.get("closed_in_finally") and s and s.get("exit_code") == 0)


def release(app_key, expect_children):
    """The app ended by itself; every watched process (the connector or bridge, and its children) appeared and exited."""
    appear = [e for e in watch if e.get("event") == "appear"]
    gone = {(e["pid"], e.get("start_ticks")) for e in watch if e.get("event") == "exit"}
    end = next((e for e in watch if e.get("event") == "watch_end"), None)
    start = next((e for e in watch if e.get("event") == "watch_start"), None)
    left = [e["pid"] for e in appear if (e["pid"], e.get("start_ticks")) not in gone]
    ok = (self_exit("app") and self_exit(app_key) and (procs.get("app") or {}).get("sub") == "" and bool(start) and start.get("already_there") == [] and bool(end) and end.get("remaining") == []
          and left == [] and len([e for e in appear if e.get("role") == "in_root"]) >= expect_children and not [s for s in steps if s.get("kind") == "endHungApp"])
    check("release.app_and_connector_ended", "pass" if ok else "fail",
          {"apps": {k: {x: (procs.get(k) or {}).get(x) for x in ("pid", "sub", "close_via", "exited", "exit_code", "exit_ms", "killed")} for k in ("app", app_key)},
           "watched": [{k: e.get(k) for k in ("event", "pid", "name", "role", "at")} for e in watch if e.get("event") in ("appear", "exit")], "left_at_watch_end": (end or {}).get("remaining")},
          "both app processes ended by themselves with code 0; every process started in the connector's folder, and each of its children, exited; nothing was there before")
    return ok


def card_picture_ok(read, rec):
    """The picture the card shows is, byte for byte, the PNG the app kept for that selection."""
    pic = (read or {}).get("picture") or {}
    return bool(rec and rec["png_ok"] and pic.get("png_sha256") == rec["record"]["image"]["sha256"] and pic.get("png_bytes") == len(rec["png_bytes"])
                and (pic.get("width"), pic.get("height")) == (rec["record"]["image"].get("width"), rec["record"]["image"].get("height")))


QUESTION = next((json.loads(m.group(1)) for p in planned if isinstance(p.get("eval"), str) for m in [re.search(r"q\.value = (\"(?:[^\"\\]|\\.)*\")", p["eval"])] if m), None)
ask_presses = presses("#askSubmit")

# =================================================================== subcontrols: the stand-in bridge
if SCENARIO == "subcontrols":
    log = [json.loads(l) for l in open(os.path.join(RUN, "bridge", "bridge-log.jsonl"), encoding="utf-8")] if exists("bridge", "bridge-log.jsonl") else []
    starts = [e for e in log if e.get("event") == "start"]
    eofs = [e for e in log if e.get("event") == "eof"]
    asks = [e for e in log if e.get("event") == "ask"]
    script = load(os.path.join(RUN, "bridge", "bridge-script.json")) if exists("bridge", "bridge-script.json") else {"launches": []}
    scripted = [b for l in script.get("launches", []) for b in l.get("asks", [])]
    labels = ["k1_answered", "k2_tampered", "k3_quota", "k4_busy", "k5_unsupported_model", "k6_invalid_request", "k7_failed", "k8_unavailable", "k9_cancel_confirmed",
              "k10_cancel_late_answer", "k11_cancel_unconfirmed", "k12_stop_in_flight", "k13_new_session", "k14_fault", "k15_after_recheck", "k16_unauthenticated"]
    # The n-th question the bridge received is the n-th scripted one, and the n-th the app recorded as sent to it.
    sent = [q for q in sorted([q for q in requests if q.get("submitted_at")], key=lambda q: ts(q["submitted_at"])) if q.get("request_id") in {a.get("request_id") for a in asks}]
    aligned = (len(asks) == len(labels) == len(scripted) == len(sent) == len(requests) and [a["request_id"] for a in asks] == [q["request_id"] for q in sent]
               and len({a["request_id"] for a in asks}) == len(asks) and [a.get("behaviour") for a in asks] == [b.get("do") for b in scripted])
    K = {label: {"ask": asks[i], "request": sent[i], "read": parsed(label), "script": scripted[i]} for i, label in enumerate(labels)} if aligned else {}
    check("control.bridge_is_the_stand_in", "pass" if starts and all("SYNTHETIC" in str(e.get("label")) for e in starts) and all(e.get("stdin_fifo") is True for e in starts)
          and all(e.get("argv") == ["-m", "services.worker.connectors.chatgpt_local"] for e in starts) and (run_info.get("subscription") or {}).get("kind") == "fake" else "fail",
          {"starts": [{k: e.get(k) for k in ("at", "launch_n", "argv", "stdin_fifo", "label")} for e in starts], "run": run_info.get("subscription")},
          "DETERMINISTIC CONTROL: the app's connector was QA's stand-in, started by the app with the connector's own arguments over private pipes. No real configuration existed in this run")
    check("control.questions_align", "pass" if aligned else "fail", {"bridge_asks": len(asks), "scripted": len(scripted), "recorded_by_the_app": len(requests), "of_them_received_by_the_bridge": len(sent), "labels": len(labels), "ask_presses": len(ask_presses)},
          "each press that reached the bridge is one ask in its log, one scripted behaviour and one request the app recorded, in the same order; none was sent twice")

    # -- off by default, and nothing before the user's Check
    off, nc = parsed("off") or {}, parsed("f_not_checked") or {}
    first_check = presses("subCheck")
    t_check = ts(first_check[0][0]["at"]) if first_check else None
    k0 = parsed("k0_unchecked_ask") or {}
    s0_record = [r for r in records if not as_list(r["record"].get("requests")) and r["record"].get("selected_at") and t_check and ts(r["record"]["selected_at"]) < t_check]
    before_ok = ((off.get("s") is None or (off.get("s") or {}).get("mode") in (None, "off")) and (off.get("section") or {}).get("hidden") is True
                 and (nc.get("s") or {}).get("state") == "not_checked" and bool(starts) and t_check is not None and ts(starts[0]["at"]) >= t_check - CLOCK
                 and str(k0.get("status", "")).startswith("Not sent") and "not been checked" in str(k0.get("status")) and k0.get("answer_shown") is False and len(s0_record) >= 1
                 and not [e for e in watch if e.get("event") == "appear" and ts(e["at"]) < t_check - CLOCK])
    check("control.off_by_default_and_nothing_before_check", "pass" if before_ok else "fail",
          {"without_configuration": {"status": off.get("s"), "section_hidden": (off.get("section") or {}).get("hidden")}, "configured_before_check": (nc.get("s") or {}).get("state"),
           "ask_before_check": k0.get("status"), "first_bridge_start_after_check_s": round(ts(starts[0]["at"]) - t_check, 2) if starts and t_check else None,
           "selections_kept_without_a_question": len(s0_record)},
          "without the configuration there is no subscription section; with it, a capture, ink and a selection before the user's Check start no connector, and Ask says "
          "'Not sent' and records no question")
    si = parsed("f_signed_in") or {}
    offered = [o[0] for o in as_list(si.get("options"))]
    account_ok = ((si.get("s") or {}).get("state") == "signed_in" and (si.get("s") or {}).get("plan") == "QA-SYNTHETIC" and offered == ["qa-synthetic-vision"]
                  and (si.get("s") or {}).get("model") == "qa-synthetic-vision" and "QA-SYNTHETIC" in str((si.get("state") or {}).get("text")) and (si.get("login") or {}).get("hidden") is True)
    check("control.check_reads_the_account_and_offers_picture_models_only", "pass" if account_ok else "fail",
          {"status": si.get("s") and {k: si["s"].get(k) for k in ("state", "plan", "model", "login")}, "state_text": (si.get("state") or {}).get("text"), "quota_text": (si.get("quota") or {}).get("text"), "models_offered": as_list(si.get("options"))},
          "after the press: the stand-in's account (plan label QA-SYNTHETIC) is shown; only the model that takes pictures is offered, the text-only one is not")

    # -- a selection that is not asked sends nothing
    sel, sel2 = parsed("k_selected") or {}, parsed("k_selected_later") or {}
    first_real_press = next((s for s, p in ask_presses if K and ts(s["at"]) <= ts(K["k1_answered"]["ask"]["at"]) + CLOCK and ts(s["at"]) > (t_check or 0)), None)
    idle_ok = (bool(K) and sel.get("card_shown") is True and sel.get("badge") == "Selection · not sent to any AI" and sel2.get("badge") == sel.get("badge") and sel.get("answer_shown") is False
               and first_real_press is not None and not [a for a in asks if ts(a["at"]) < ts(first_real_press["at"]) - CLOCK])
    check("control.selection_without_ask_sends_nothing", "pass" if idle_ok else "fail",
          {"badge": sel.get("badge"), "badge_4s_later": sel2.get("badge"), "card_text": sel.get("card_text"), "bridge_asks_before_the_first_press": [a["request_id"] for a in asks if first_real_press and ts(a["at"]) < ts(first_real_press["at"]) - CLOCK]},
          "signed in (stand-in), capturing, writing and selecting: the card says the selection is not sent to any AI, and the bridge received no question before Ask was pressed")

    def rec_of(k):
        return next((r for r in records if K and r["record"].get("selection_id") == K[k]["request"]["_selection"]), None)

    def outcome(k):
        return (K[k]["request"].get("outcome") or {}) if K else {}

    # -- an answer is shown, bound to the exact picture and question
    k1 = K.get("k1_answered", {})
    r1 = k1.get("read") or {}
    a_ok = (bool(K) and r1.get("answer_shown") is True and r1.get("answer") == k1["script"]["text"] and "SYNTHETIC" in r1["answer"] and r1.get("badge") == "Selection · answered by ChatGPT below"
            and r1.get("answer_child_elements") == 0 and outcome("k1_answered").get("status") == "answered" and outcome("k1_answered")["answer"].get("text") == r1["answer"]
            and k1["request"].get("shown") is True and card_picture_ok(r1, rec_of("k1_answered")) and k1["ask"]["image"]["sha256"] == rec_of("k1_answered")["record"]["image"]["sha256"]
            and k1["ask"]["image"]["bytes_hash_to_sha256"] is True and k1["ask"]["image"]["png_bytes"] == len(rec_of("k1_answered")["png_bytes"])
            and QUESTION is not None and k1["ask"]["question_sha256"] == sha(QUESTION.encode()) and k1["request"].get("question") == QUESTION and k1["ask"]["assistance"] == "explain"
            and k1["ask"]["model"] == "qa-synthetic-vision")
    check("control.answer_shown_for_the_exact_picture_and_question", "pass" if a_ok else "fail",
          {"card": {k: r1.get(k) for k in ("badge", "status", "answer", "picture")}, "record": k1.get("request") and {k: k1["request"].get(k) for k in ("request_id", "assistance", "model", "outcome", "shown")},
           "bridge_received": k1.get("ask") and {k: k1["ask"].get(k) for k in ("request_id", "model", "assistance", "question_chars", "image")}},
          "DETERMINISTIC CONTROL (the answer is QA's own SYNTHETIC text): the stand-in received the exact PNG the app kept and the card shows, with QA's question and the chosen "
          "level; its answer is shown as plain text on that card and recorded as shown")

    # -- an answer not bound to the request, refusals, and nothing sent twice
    FIXED = {"k3_quota": "the subscription's usage limit was reached", "k4_busy": "another question is still being answered", "k5_unsupported_model": "the chosen model does not take pictures",
             "k6_invalid_request": "the connector refused the request as malformed", "k7_failed": "ChatGPT did not complete an answer",
             "k8_unavailable": "the connector, or the official Codex app server it runs, is not available", "k16_unauthenticated": "ChatGPT is not signed in (sign in from the control window)"}
    refusals = {}
    for k, reason in FIXED.items():
        r = (K.get(k) or {}).get("read") or {}
        refusals[k] = bool(K) and r.get("answer_shown") is False and r.get("status") == f"No answer: {reason}. It was not sent again." and r.get("badge") == "Selection · asked: no answer shown" \
            and outcome(k).get("status") == "refused" and outcome(k).get("code") == K[k]["script"]["code"] and "answer" not in outcome(k)
    r2 = (K.get("k2_tampered") or {}).get("read") or {}
    unbound_ok = bool(K) and r2.get("answer_shown") is False and "it is not shown" in str(r2.get("status")) and outcome("k2_tampered").get("status") == "refused" and outcome("k2_tampered").get("code") == "unbound"
    check("control.unbound_answer_is_not_shown", "pass" if unbound_ok else "fail", {"card_status": r2.get("status"), "record_outcome": outcome("k2_tampered")},
          "an answer whose provenance names another picture is not shown and not kept")
    check("control.refusals_say_fixed_text_and_are_not_resent", "pass" if refusals and all(refusals.values()) and aligned else "fail",
          {"each": refusals, "statuses": {k: ((K.get(k) or {}).get("read") or {}).get("status") for k in FIXED}},
          "each closed error code is shown as the app's own fixed sentence, recorded as refused, with no answer; the bridge received each question exactly once")

    # -- cancel: confirmed, unconfirmed, and a late answer that must never appear
    def cancel_sent(k):
        return bool(K) and any(e.get("event") == "request" and e.get("method") == "ask/cancel" and e.get("request_id") == K[k]["ask"]["request_id"] for e in log)
    c9, c10, c11 = [((K.get(k) or {}).get("read") or {}) for k in ("k9_cancel_confirmed", "k10_cancel_late_answer", "k11_cancel_unconfirmed")]
    everything_shown_or_kept = json.dumps([r["record"] for r in records]) + json.dumps([parsed(k) for k in values if re.match(r"^k\d+", k) or k.startswith("f_")], default=str)
    cancel_ok = (bool(K) and all(cancel_sent(k) for k in ("k9_cancel_confirmed", "k10_cancel_late_answer", "k11_cancel_unconfirmed"))
                 and c9.get("status") == "Cancelled: no answer is shown." and outcome("k9_cancel_confirmed") == {"status": "cancelled", "uncertain": False}
                 and c10.get("status") == "Cancelled: no answer is shown." and c10.get("answer_shown") is False and outcome("k10_cancel_late_answer").get("status") == "cancelled"
                 and "not confirmed" in str(c11.get("status")) and outcome("k11_cancel_unconfirmed") == {"status": "cancelled", "uncertain": True}
                 and any(e.get("event") == "sent" and e.get("kind") == "answer" and e.get("id") == K["k10_cancel_late_answer"]["ask"]["id"] for e in log)
                 and "LATE answer" not in everything_shown_or_kept)
    check("control.cancel_and_late_answer", "pass" if cancel_ok else "fail",
          {"confirmed": {"status": c9.get("status"), "record": outcome("k9_cancel_confirmed") if K else None}, "late_answer": {"status": c10.get("status"), "record": outcome("k10_cancel_late_answer") if K else None,
           "bridge_wrote_a_late_answer": bool(K) and any(e.get("event") == "sent" and e.get("kind") == "answer" and e.get("id") == K["k10_cancel_late_answer"]["ask"]["id"] for e in log)},
           "unconfirmed": {"status": c11.get("status"), "record": outcome("k11_cancel_unconfirmed") if K else None}, "late_text_anywhere": "LATE answer" in everything_shown_or_kept},
          "Cancel tells the bridge; a confirmed interruption is said plainly, an unconfirmed one is said as not confirmed, and an answer the bridge still wrote after the "
          "cancel appears nowhere: not on the card, not in the record")

    # -- Stop while a question is out; a later Start may ask again
    k12, k13 = K.get("k12_stop_in_flight", {}), K.get("k13_new_session", {})
    stop_req = next((e for e in log if e.get("event") == "request" and e.get("method") == "session/stop" and K and e.get("capture_session_id") == k12["ask"]["capture_session_id"]), None)
    stop_ok = (bool(K) and stop_req is not None and ts(stop_req["at"]) > ts(k12["ask"]["at"]) and outcome("k12_stop_in_flight").get("status") == "cancelled" and "answer" not in outcome("k12_stop_in_flight")
               and not [a for a in asks if a["capture_session_id"] == k12["ask"]["capture_session_id"] and ts(a["at"]) > ts(stop_req["at"])]
               and k13["ask"]["capture_session_id"] != k12["ask"]["capture_session_id"] and (k13.get("read") or {}).get("answer_shown") is True and (k13["read"] or {}).get("answer") == k13["script"]["text"])
    check("control.stop_in_flight_then_a_new_session", "pass" if stop_ok else "fail",
          {"stop_told_the_bridge": stop_req and {k: stop_req.get(k) for k in ("at", "capture_session_id")}, "record_of_the_question_out": outcome("k12_stop_in_flight") if K else None,
           "new_session": K and {"capture_session_id_differs": k13["ask"]["capture_session_id"] != k12["ask"]["capture_session_id"], "answer_shown": (k13.get("read") or {}).get("answer_shown")}},
          "Stop with a question out tells the bridge to stop that capture session; the question is recorded as cancelled, the late answer is not kept, nothing more is asked "
          "for that session; a later explicit Start is another session and can ask")

    # -- a line over the envelope's limit: the child is ended, the app starts none by itself; only the user's Check does
    f1, f2, rc = parsed("f_after_fault") or {}, parsed("f_after_fault_later") or {}, parsed("f_rechecked_now") or {}
    checks_pressed = presses("subCheck")
    t_recheck = ts(checks_pressed[1][0]["at"]) if len(checks_pressed) == 2 else None
    fault_sent = next((e for e in log if e.get("event") == "sent" and e.get("kind") == "fault"), None)
    roots = [e for e in watch if e.get("event") == "appear" and e.get("role") == "in_root"]
    fault_ok = (bool(K) and fault_sent is not None and t_recheck is not None and len(starts) == 2 and len(eofs) == 2 and ts(eofs[0]["at"]) < t_recheck and ts(starts[1]["at"]) >= t_recheck - CLOCK
                and len(roots) == 2 and ts(roots[1]["at"]) >= t_recheck - CLOCK
                and (f1.get("s") or {}).get("state") == "unavailable" and (f2.get("s") or {}).get("state") == "unavailable"
                and ((K["k14_fault"].get("read") or {}).get("answer_shown") is False) and outcome("k14_fault").get("status") in ("uncertain", "refused")
                and (rc.get("s") or {}).get("state") == "signed_in" and (K["k15_after_recheck"]["read"] or {}).get("answer_shown") is True) if K else False
    check("control.overlong_line_ends_the_child_and_none_is_started_without_the_user", "pass" if fault_ok else "fail",
          {"fault_written": fault_sent and fault_sent.get("at"), "bridge_starts": [e.get("at") for e in starts], "bridge_ends": [e.get("at") for e in eofs], "users_second_check_pressed_at": checks_pressed[1][0]["at"] if len(checks_pressed) == 2 else None,
           "status_6s_after": f1.get("s") and {k: f1["s"].get(k) for k in ("state", "detail", "asking")}, "status_12s_after": f2.get("s") and {k: f2["s"].get(k) for k in ("state", "detail", "asking")},
           "card": ((K.get("k14_fault") or {}).get("read") or {}).get("status"), "record": outcome("k14_fault") if K else None, "after_the_users_check": (rc.get("s") or {}).get("state")},
          "the bridge wrote `connection/changed`, left the app's re-read unanswered, wrote `connection/changed` again and then a 300 KiB line. The app ended that child, said "
          "the connection is not available, and started no other child for 12 s; the second bridge start came only after the user's own Check press")
    so, k17 = parsed("f_signed_out") or {}, parsed("k17_not_signed_in") or {}
    out_ok = (bool(K) and refusals.get("k16_unauthenticated") is True and (so.get("s") or {}).get("state") == "signed_out" and (so.get("login") or {}).get("hidden") is False
              and str(k17.get("status", "")).startswith("Not sent") and len(asks) == 16)
    check("control.unauthenticated_shows_signed_out_and_asks_no_more", "pass" if out_ok else "fail",
          {"card": ((K.get("k16_unauthenticated") or {}).get("read") or {}).get("status"), "control_state": (so.get("s") or {}).get("state"), "sign_in_button_shown": (so.get("login") or {}).get("hidden") is False,
           "next_ask": k17.get("status"), "bridge_asks_total": len(asks)},
          "an `unauthenticated` answer shows the fixed text, the control window says not signed in and offers Sign in (not pressed), and the next Ask is not sent")
    check("control.no_sign_in_request_reached_the_bridge", "pass" if log and not [e for e in log if str(e.get("method", "")).startswith("connection/login")] else "fail",
          {"methods_seen": sorted({str(e.get("method")) for e in log if e.get("event") == "request"})}, "the bridge was never asked to start or cancel a sign-in")
    release("app-fake", 2)

# =================================================================== subcheck: the real connector, no question
elif SCENARIO == "subcheck":
    nc, st, card, typed, focus = parsed("r_not_checked") or {}, parsed("r_state") or {}, parsed("r_card") or {}, parsed("r_typed") or {}, parsed("r_focus_raised") or {}
    s = st.get("s") or {}
    pressed = presses("subCheck")
    t_check = ts(pressed[0][0]["at"]) if pressed else None
    early = [e for e in watch if e.get("event") == "appear" and t_check and ts(e["at"]) < t_check - CLOCK]
    appeared = [e for e in watch if e.get("event") == "appear"]
    state = s.get("state")
    check_ok = ((nc.get("s") or {}).get("state") == "not_checked" and t_check is not None and early == [] and any(e.get("role") == "in_root" for e in appeared) and state in ("signed_in", "signed_out", "unknown", "unavailable"))
    check("check.connection_read_on_the_users_press", "pass" if check_ok and state in ("signed_in", "signed_out") else "limit" if check_ok else "fail",
          {"before": (nc.get("s") or {}).get("state"), "after": {k: s.get(k) for k in ("state", "plan", "model", "login", "detail")}, "state_text": (st.get("state") or {}).get("text"), "quota_text": (st.get("quota") or {}).get("text"),
           "models": [{k: m.get(k) for k in ("id", "label", "image_input", "default")} for m in as_list(s.get("models"))], "models_offered": as_list(st.get("options")),
           "sign_in_offered": (st.get("login") or {}).get("hidden") is False, "connector_processes": [{k: e.get(k) for k in ("name", "role", "at")} for e in appeared], "started_before_the_press": early},
          {"signed_in": "the connector started only on the press and reports a managed ChatGPT sign-in. This is the account state Codex reports; it does not show that a model answers",
           "signed_out": "the connector started only on the press and reports NOT signed in: the official Sign in button is offered. Signing in is the user's own browser step; QA did not press it"}.get(
               state, f"the connector started on the press, but the state is '{state}': see the detail"))
    rec = records[0] if len(records) == 1 else None
    form_ok = (card.get("card_shown") is True and card.get("form_shown") is True and card.get("badge") == "Selection · not sent to any AI" and card.get("answer_shown") is False and card_picture_ok(card, rec)
               and rec is not None and as_list(rec["record"].get("requests")) == [] and ask_presses == [] and requests == [])
    check("check.card_form_on_a_real_selection_nothing_asked", "pass" if form_ok else "fail",
          {"card": {k: card.get(k) for k in ("badge", "card_text", "question", "assistance", "form_shown", "picture")}, "record_requests": rec and as_list(rec["record"].get("requests")), "ask_presses": len(ask_presses)},
          "the selection of the surface with the two circles shows the question form; the picture is the PNG the app kept; no question was asked in this run")
    clicked = step(lambda s: s.get("kind") == "osClick") or {}
    keys = [s for s in steps if s.get("kind") == "keys"]
    key1, key2 = (keys + [{}, {}])[:2]
    typed2, focus1 = parsed("r_typed_raised") or {}, parsed("r_focus_after_click") or {}
    user_ok = (clicked.get("clicked") is True and clicked.get("foreground_after") is True and key1.get("sent") is True and focus1.get("active") is True
               and "QA typed check 42" in str(typed.get("value")) and typed.get("value") != card.get("question"))
    forced_ok = key2.get("sent") is True and typed2.get("value") == "QA second 7"
    check("check.question_box_takes_typed_text_after_a_click", "pass" if user_ok else "fail" if clicked.get("clicked") is True else "limit",
          {"os_click": {k: clicked.get(k) for k in ("point_px", "window_at_point_is_ours", "clicked", "foreground_before", "foreground_after", "error")}, "focus_after_click": focus1,
           "keys": {k: key1.get(k) for k in ("window_found", "is_foreground", "sent", "still_foreground")}, "question_before": card.get("question"), "question_after": typed.get("value"), "active_after": typed.get("active")},
          "one OS mouse click on the question box gave the overlay the keyboard, and OS keystrokes then typed into it (synthetic OS input, not a physical mouse or keyboard)" if user_ok else
          "one OS mouse click was made on the question box and the text typed after it is NOT in the box: a user cannot type a question this way" if clicked.get("clicked") is True else
          "no click was made (the window under the point was not the app's, or the box was not shown): typing after a click is NOT shown")
    check("check.question_box_takes_typed_text_when_qa_raises_the_overlay", "pass" if forced_ok else "limit",
          {"focus": focus, "keys": {k: key2.get(k) for k in ("window_found", "is_foreground", "sent", "still_foreground")}, "question_after": typed2.get("value"), "active_after": typed2.get("active")},
          "DIAGNOSTIC, not a user path: after QA itself brings the overlay to the foreground and focuses the box, the keys replace the selected text" if forced_ok else
          "DIAGNOSTIC: the overlay did not take the keys even when QA raised it (or it could not be raised: nothing was typed anywhere)")
    receipts = load(os.path.join(RUN, "receipts-found.json")) if exists("receipts-found.json") else None
    check("check.no_question_and_no_receipt", "pass" if receipts is not None and receipts.get("found") == [] and receipts.get("request_ids") == [] else "fail", {"receipts": receipts},
          "this run made no request, and no receipt of a request exists for it")
    release("app-real", 1)

# =================================================================== subask: the one real image turn
elif SCENARIO == "subask":
    st, before, ready, after = parsed("a_state") or {}, parsed("a_card") or {}, parsed("a_ready") or {}, parsed("a_after") or {}
    s = st.get("s") or {}
    truths = [parsed(n) for n in ("surface_truth", "surface_truth_circled", "surface_truth_at_ask", "surface_truth_after")]
    truth = truths[0] if all(truths) and len({json.dumps(t.get("cards"), sort_keys=True) for t in truths}) == 1 and len({t.get("generated_at") for t in truths}) == 1 else None
    rec = records[0] if len(records) == 1 else None
    R = rec["record"] if rec else {}
    q = requests[0] if len(requests) == 1 else None
    ctx = R.get("context") or {}
    out = (q or {}).get("outcome") or {}
    answer = (out.get("answer") or {}).get("text") if out.get("status") == "answered" else None

    # -- the connection the question went to
    model_ok = s.get("state") == "signed_in" and isinstance(s.get("model"), str) and any(m.get("id") == s["model"] and m.get("image_input") is True for m in as_list(s.get("models")))
    check("turn.signed_in_with_a_picture_model", "pass" if model_ok else "fail", {"state": s.get("state"), "plan": s.get("plan"), "model": s.get("model"), "quota_text": (st.get("quota") or {}).get("text"),
          "models": [{k: m.get(k) for k in ("id", "image_input", "default")} for m in as_list(s.get("models"))]},
          "the product's own state reported a managed ChatGPT sign-in and a chosen model that takes pictures (the sign-in was the user's; QA pressed only Check connection)")

    # -- the surface: random, pixels only, unchanged, the whole display, pointer outside
    cursor_checks = [s_ for s_ in steps if s_.get("kind") == "cursorOutside"]
    surface_ok = (truth is not None and all(t.get("full_screen") is True and t.get("fits") is True and (t.get("dom_text") or "").strip() == "" and t.get("url_has_query") is False for t in truths)
                  and len(truth["cards"]) == 12 and len({c["number"] for c in truth["cards"]}) == 12 and isinstance(circled, list) and len(circled) == 2 and len(set(circled)) == 2
                  and len(cursor_checks) >= 2 and all(c["ok"] for c in cursor_checks[:2]))
    check("turn.surface_is_random_pixels_on_the_whole_display", "pass" if surface_ok else "fail",
          {"cards": truth and [{k: c[k] for k in ("index", "number", "shape", "color")} for c in truth["cards"]], "circled_cards": circled, "generated_at": truth and truth.get("generated_at"),
           "dom_text": [t and t.get("dom_text") for t in truths], "title": truth and truth.get("title"), "cursor_px": [c.get("cursor") for c in cursor_checks]},
          "twelve random cards drawn on a canvas that filled the display; the page's text, title and URL hold none of it; the same cards before Start, before ASK, at the "
          "press and after the answer; the mouse pointer outside the selected region")

    # -- exactly one question, with the exact picture and ink
    ink_file = os.path.join(RUN, "captures", (rec or {}).get("capture", "-"), "ink", f"{ctx.get('ink_sha256')}.json")
    ink_bytes = open(ink_file, "rb").read() if os.path.isfile(ink_file) else None
    ink_doc = json.loads(ink_bytes) if ink_bytes else {}
    visible = len((ink_doc.get("ink") or {}).get("visible") or []) if isinstance(ink_doc.get("ink"), dict) else None
    b, f = (ctx.get("display") or {}).get("bounds") or {}, ctx
    rd, rp = ctx.get("region_dip") or {}, ctx.get("region_px") or {}
    try:
        sx, sy = f["frame_width"] / b["width"], f["frame_height"] / b["height"]
        want_px = {"x": math.floor(rd["x"] * sx), "y": math.floor(rd["y"] * sy)}
        want_px["width"] = min(f["frame_width"], math.ceil((rd["x"] + rd["width"]) * sx)) - want_px["x"]
        want_px["height"] = min(f["frame_height"], math.ceil((rd["y"] + rd["height"]) * sy)) - want_px["y"]
    except (KeyError, TypeError, ZeroDivisionError):
        want_px = None
    one_ok = (rec is not None and q is not None and len(ask_presses) == 1 and ask_presses[0][0]["ok"] and rec["png_ok"] and card_picture_ok(ready, rec) and card_picture_ok(after, rec)
              and QUESTION is not None and q.get("question") == QUESTION and q.get("assistance") == "explain" and q.get("model") == s.get("model")
              and (R["image"].get("width"), R["image"].get("height")) == (rp.get("width"), rp.get("height")) and want_px is not None and rp == want_px
              and rd.get("x", 99) <= 40 and rd.get("y", 99) <= 90 and rd.get("x", 0) + rd.get("width", 0) >= 860 and rd.get("y", 0) + rd.get("height", 0) >= 580
              and ink_bytes is not None and sha(ink_bytes) == ctx.get("ink_sha256") and visible == 2 and ctx.get("ink_revision") == (ink_doc.get("ink") or {}).get("revision", ink_doc.get("revision"))
              and ctx.get("source_url") is None and ctx.get("source_version") is None and ctx.get("media_position") is None)
    check("turn.one_question_with_the_exact_picture_and_ink", "pass" if one_ok else "fail",
          {"ask_presses": len(ask_presses), "selections_kept": len(records), "questions_recorded": len(requests), "question": q and q.get("question"), "assistance": q and q.get("assistance"), "model": q and q.get("model"),
           "picture": rec and {"sha256": R["image"].get("sha256"), "bytes": R["image"].get("bytes"), "width": R["image"].get("width"), "height": R["image"].get("height"), "file_is_those_bytes": rec["png_ok"]},
           "card_picture_before_and_after": [ready.get("picture"), after.get("picture")], "context": ctx, "region_px_by_the_adrs_rule": want_px,
           "ink_original": {"sha256_is_its_bytes": bool(ink_bytes) and sha(ink_bytes) == ctx.get("ink_sha256"), "visible_strokes": visible}},
          "Ask was pressed once. The app kept one selection and one question: QA's question, level 'explain', the chosen model; the picture file is the bytes of its hash and "
          "is the picture on the card before and after; its size is the selected region in frame pixels by the ADR's rule, and the region holds the whole grid; the ink "
          "document named by the request is kept with exactly the two circles; URL, version and media position are null")

    # -- the connector's own receipt: official image input, one turn, no tool
    found = (load(os.path.join(RUN, "receipts-found.json")) if exists("receipts-found.json") else {}).get("found", [])
    mine = [x for x in found if q and x.get("request_id") == q.get("request_id")]
    receipt = load(os.path.join(RUN, "receipts", mine[0]["launch"], mine[0]["file"])) if len(mine) == 1 else None
    prompt, prompt_error = None, None
    if BACKEND and rec and q and rec["png_bytes"]:
        sys.path.insert(0, os.path.realpath(BACKEND))
        try:
            from services.learning.subscription_ask import prepare_subscription_ask
            prepared = prepare_subscription_ask({"request_id": q["request_id"], "question": q["question"], "assistance": q["assistance"],
                                                 "image": {"png_base64": base64.b64encode(rec["png_bytes"]).decode(), "sha256": R["image"]["sha256"], "width": R["image"]["width"], "height": R["image"]["height"]}, "context": ctx})
            prompt = prepared["text"]
        except Exception as error:  # reported, never hidden
            prompt_error = type(error).__name__
    TOOLISH = re.compile(r"command|exec|shell|tool|approval|web|search|mcp|patch|file|browser|computer", re.I)
    produced = as_list((receipt or {}).get("produced_item_types"))
    receipt_ok = (receipt is not None and receipt.get("request_id") == q.get("request_id") and receipt.get("input_types") == ["text", "image"] and receipt.get("image_sha256") == R["image"]["sha256"]
                  and receipt.get("image_bytes") == len(rec["png_bytes"]) and receipt.get("submission") == "acknowledged" and receipt.get("terminal_status") == "completed" and receipt.get("outcome") == "completed"
                  and receipt.get("thread_start_count") == 1 and receipt.get("turn_start_count") == 1 and len(produced) >= 1 and not [t for t in produced if TOOLISH.search(str(t))]
                  and receipt.get("actual_model") == (out.get("answer") or {}).get("model") and receipt.get("thread_id") == (out.get("answer") or {}).get("thread_id") and receipt.get("turn_id") == (out.get("answer") or {}).get("turn_id")
                  and prompt is not None and receipt.get("text_sha256") == sha(prompt.encode()) and receipt.get("text_bytes") == len(prompt.encode()))
    check("turn.connector_receipt_official_image_input_one_turn_no_tool", "pass" if receipt_ok else "limit" if receipt is None or prompt is None else "fail",
          {"receipt": receipt and {k: receipt.get(k) for k in ("format", "input_types", "text_bytes", "text_sha256", "image_bytes", "image_sha256", "submission", "terminal_status", "outcome", "produced_item_types",
                                                              "thread_start_count", "turn_start_count", "actual_model", "codex_version", "codex_sha256", "explicit_bin_override")},
           "receipts_for_this_request": len(mine), "prompt_recomputed": prompt is not None, "prompt_error": prompt_error, "prompt_sha256": prompt and sha(prompt.encode()), "prompt_bytes": prompt and len(prompt.encode())},
          "the connector's own receipt for this request: the turn's input was one text item and one image item whose bytes are the kept PNG; the text is, byte for byte, the "
          "prompt the released prepare_subscription_ask builds from the kept request; one thread and one turn were started; the turn completed; it produced no command, tool, "
          "approval or web item" if receipt_ok else
          "NOT SHOWN: no receipt for this request, or the prompt could not be recomputed (give --backend). The app's own record alone does not show what entered the turn" if receipt is None or prompt is None else
          "the receipt does not match the kept request")

    # -- no leak of the truth into anything but the picture
    texts = {"question": (q or {}).get("question") or "", "card_text_before": before.get("card_text") or "", "card_status_before": ready.get("status") or "", "page_title": (truth or {}).get("title") or "",
             "page_dom_text": " ".join((t or {}).get("dom_text") or "" for t in truths), "picture_file_name": (R.get("image") or {}).get("file") or "", "selection_record_file": (rec or {}).get("file") or "",
             "prompt_text": prompt or "", "receipt": json.dumps(receipt or {}), "context": json.dumps(ctx)}
    hits = judge.leaks(truth, texts) if truth else None
    NUMERIC_FIELDS = {"context", "receipt"}  # named numeric fields (sizes, counts, sequences): a hit there is listed, it does not void

    def numbers_in(v):
        return {v} if isinstance(v, int) and not isinstance(v, bool) else set().union(*[numbers_in(x) for x in (v.values() if isinstance(v, dict) else v)]) if isinstance(v, (dict, list)) and v else set()
    sizes = numbers_in(ctx) | numbers_in(R.get("image") or {})
    # The prompt carries the request's context and picture size as JSON: a card number equal to one of those sizes is that size.
    voiding = {k: [n for n in v if not (k == "prompt_text" and n in sizes)] for k, v in (hits or {}).items() if k not in NUMERIC_FIELDS}
    voiding = {k: v for k, v in voiding.items() if v}
    check("turn.no_leak_of_the_truth", "pass" if hits is not None and not voiding and prompt is not None else "limit" if hits is not None and not voiding else "fail",
          {"searched": sorted(texts), "hits_that_void": voiding, "hits_in_numeric_fields": {k: v for k, v in (hits or {}).items() if k in NUMERIC_FIELDS or k == "prompt_text"}, "prompt_text_searched": prompt is not None},
          "no card number is in the question, the card's own text, the page's text or title, a file name, or the prompt text sent with the picture" if prompt is not None else
          "no leak in the texts searched, but the prompt text was not recomputed (give --backend): not complete")

    # -- the outcome, on the same card
    shown_ok = (out.get("status") == "answered" and q.get("shown") is True and isinstance(answer, str) and after.get("answer_shown") is True and after.get("answer") == answer and after.get("answer_child_elements") == 0
                and after.get("badge") == "Selection · answered by ChatGPT below" and str(after.get("status", "")).startswith(f"Answered by ChatGPT ({out['answer'].get('model')}) in ")
                and after.get("card_text") == before.get("card_text") and isinstance(out["answer"].get("latency_ms"), int) and bool(out["answer"].get("thread_id")) and bool(out["answer"].get("turn_id"))
                and after.get("save_shown") is False)
    check("turn.completed_answer_shown_on_the_same_card", "pass" if shown_ok else "limit" if out.get("status") in ("refused", "uncertain", "cancelled") else "fail",
          {"record_outcome": {k: v for k, v in out.items() if k != "answer"} | ({"answer": {k: out["answer"].get(k) for k in ("model", "latency_ms", "thread_id", "turn_id")}} if out.get("answer") else {}),
           "shown": q and q.get("shown"), "card": {k: after.get(k) for k in ("badge", "status", "card_text", "answer_shown", "save_shown")}, "submitted_at": q and q.get("submitted_at"), "ended_at": q and q.get("ended_at")},
          "the official turn completed; the answer is on the card of that selection, as plain text, under the selection's own unchanged text, with the model and the time it took; "
          "the record holds the same text, marked shown" if shown_ok else f"NOT an answered turn: the question ended as {out.get('status')} ({out.get('code') or out.get('reason') or ''}). It is reported as that, not judged, and not asked again")

    # -- the answer itself, by the rule fixed before the call
    verdict = judge.judge(truth, circled, answer) if truth and isinstance(circled, list) and isinstance(answer, str) else None
    check("turn.answer_names_the_circled_cards", "pass" if verdict and verdict["pass"] else "limit" if verdict and verdict["outcome"] == "held" else "fail" if verdict else "limit",
          {"verdict": verdict, "answer_verbatim": answer},
          "MATCHER PASS, pending the reading of the full answer by QA and the lead: the answer names exactly the two circled cards" if verdict and verdict["pass"] else
          "HELD: the numbers match but the answer negates, refuses or hedges; a person must read it. Not a pass" if verdict and verdict["outcome"] == "held" else
          "the answer does not name exactly the two circled cards" if verdict else "no answer to judge")
    check("turn.provenance_on_the_card", "pass" if before.get("card_text") and str(ctx.get("frame_seq")) in before["card_text"] and str(ctx.get("ink_revision")) in before["card_text"] else "limit",
          {"card_text": before.get("card_text"), "frame_seq": ctx.get("frame_seq"), "frame_captured_at": ctx.get("frame_captured_at"), "ink_revision": ctx.get("ink_revision"), "region_dip": rd},
          "the card's own text names the region, the frame and the ink revision of the request")
    release("app-real", 1)
else:
    check("run.scenario", "fail", {"scenario": SCENARIO}, "not a subscription scenario")


counts = {}
for c in checks:
    counts[c["status"]] = counts.get(c["status"], 0) + 1
for c in checks:
    print(f"{c['status']:7} {c['id']}")
print(counts)

if EVIDENCE:
    os.makedirs(EVIDENCE, exist_ok=True)

    def redact(value):
        text = json.dumps(value, ensure_ascii=False, indent=1)
        for pattern in (r"C:\\+Users\\+[^\\\"]+", r"C:/Users/[^/\"]+", r"/mnt/c/Users/[^/\"]+", r"/home/[^/\"]+"):
            text = re.sub(pattern, "<home>", text)
        if re.search(r"Users(\\+|/)(?!<)", text.replace("<home>", "")) or re.search(r"dbname=|password|\"token\"|access_token|refresh_token|auth\.json|data:image", text):
            raise SystemExit("a profile path, picture data or secret-like text survived redaction")
        return text + "\n"

    def write(name, value):
        with open(os.path.join(EVIDENCE, name), "w", encoding="utf-8") as f:
            f.write(redact(value))

    big = {k for k in values if k.startswith("h_") or k == "timeline" or k == "askCard"}
    write("summary.json", {"scenario": SCENARIO, "counts": counts, "checks": checks})
    write("runner-results.json", dict(results, values={k: v for k, v in values.items() if k not in big}))
    write("hash-checkpoints.json", {k: values[k] for k in values if k.startswith("h_")})
    write("selection-records.json", [{"capture": r["capture"], "file": r["file"], "png_is_its_hash": r["png_ok"], "record": r["record"]} for r in records])
    write("connector-watch.json", watch)
    write("steps.json", planned)
    write("run.json", run_info)
    if exists("bridge", "bridge-log.jsonl"):
        write("bridge-log.json", [json.loads(l) for l in open(os.path.join(RUN, "bridge", "bridge-log.jsonl"), encoding="utf-8")])
        write("bridge-script.json", load(os.path.join(RUN, "bridge", "bridge-script.json")))
    if exists("receipts-found.json"):
        found = load(os.path.join(RUN, "receipts-found.json"))
        write("receipts.json", {"found": found, "receipts": [load(os.path.join(RUN, "receipts", x["launch"], x["file"])) for x in found.get("found", [])]})
