#!/usr/bin/env python3
"""Checks one QA run of a managed-subscription ASK scenario (tests/e2e/windows/run.mjs <scenario> <out>).

Usage: python3 analyze_sub.py <run out dir> [<evidence dir>] [--backend <the private exact-source Backend copy>]

  subcontrols  DETERMINISTIC CONTROLS with QA's stand-in bridge. No Codex, no ChatGPT, no sign-in, no allowance: every
               "answer" is text QA wrote. They show what the app does at its own boundary and are never real-model evidence.
  subselect    a probe with the stand-in bridge that asks nothing: can every selection be asked about?
  subcheck     the real connector, the user's "Check connection" press only; no sign-in and no question.
  subask       the ONE real image turn (docs/verification/qa/p0-13-subscription-ask-plan.md). A matcher pass on the answer
               is necessary, never sufficient: the full answer is kept for a person to read.

App reads are the app's own claims; they are checked against the files it kept (asks/<selection>.json, the exact PNG),
the stand-in's log or the connector's receipt, the picture's own pixels, the surface's own truth and the process watch.
A check fails when a value it relies on is missing. Statuses: pass / fail / limit (limit = not judged, not reached, or an
observation; never a pass). With --backend the prompt text is recomputed with that copy's prepare_subscription_ask and
compared with the connector's receipt.
"""
import base64
import glob
import hashlib
import json
import math
import os
import re
import statistics
import sys
from datetime import datetime

argv = sys.argv[1:]
BACKEND = None
if "--backend" in argv:
    at = argv.index("--backend")
    BACKEND = argv[at + 1]
    del argv[at:at + 2]
RUN = argv[0]
EVIDENCE = argv[1] if len(argv) > 1 else None
if EVIDENCE and any(os.path.exists(os.path.join(EVIDENCE, name)) for name in ("services", "apps", ".git")):
    raise SystemExit("the evidence folder is a source checkout: give a folder for evidence only")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import judge_surface_answer as judge  # noqa: E402

checks = []


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
jsonl = lambda *p: [json.loads(l) for l in open(os.path.join(RUN, *p), encoding="utf-8") if l.strip()] if exists(*p) else []
CLOCK = 2.0  # tolerance between the Windows clock (runner, app) and the WSL clock (bridge, watch), after the measured offset

results = load(os.path.join(RUN, "out", "results.json"))
values, steps, procs = results["values"], results["steps"], results["processes"]
planned = load(os.path.join(RUN, "steps.json")) if exists("steps.json") else []
run_info = load(os.path.join(RUN, "run.json")) if exists("run.json") else {}
SCENARIO = run_info.get("scenario")
SUB = run_info.get("subscription") or {}
circled = run_info.get("surface_circled_cards")
watch = jsonl("connector-watch.jsonl")
# The real connector as the lead released it: the project's Python, a private exact-source copy whose files are those of
# the named commit, the connector's own product state, no stand-in anywhere in the run.
REAL = bool(SUB.get("kind") == "real" and SUB.get("files_are_the_source_commits") is True and SUB.get("source") and not exists("bridge")
            and str(SUB.get("python", "")).endswith("/repo/.venv/bin/python") and str(SUB.get("state_dir", "")).startswith("the connector's default product state"))


def check(cid, status, observed, note=None):
    if SCENARIO in ("subcheck", "subask", "subrehearsal") and cid.startswith(("turn.", "check.")) and status == "pass" and not REAL:
        status, note = "limit", ("REHEARSAL WITH QA'S STAND-IN, no model: " if SCENARIO == "subrehearsal" else "NOT real-connector evidence (see run.real_connector). ") + (note or "")
    checks.append({"id": cid, "status": status, "observed": observed, **({"note": note} if note else {})})


def parsed(name):
    v = values.get(name)
    try:
        return json.loads(v) if isinstance(v, str) else v
    except ValueError:
        return None


def D(name):
    """A page read that must be an object: {} when it is missing or anything else."""
    v = parsed(name)
    return v if isinstance(v, dict) else {}


def step(pred):
    return next((s for s in steps if pred(s)), None)


# The runner's kind for a planned step (its own order of tests: a keys or osClick step also names a window).
KINDS = ("sleep", "eval", "waitEval", "stroke", "edgeStart", "consoleStart", "keys", "osClick", "window", "edgeFullscreen", "onTop", "cursorBack", "cursorOutside", "desktopShot",
         "snapshot", "targets", "closeApp", "endHungApp", "launchApp", "children", "hashTree", "copyTree")
planned_kind = lambda p: next((k for k in KINDS if k in p), None)
step_text = lambda p: " ".join(str(p.get(k, "")) for k in ("eval", "waitEval", "osClick", "keys"))


def presses(selector_text):
    """The runner steps (with their planned text) that clicked something: (step, planned)."""
    return [(s, p) for s, p in zip(steps, planned) if isinstance(p.get("eval"), str) and selector_text in p["eval"] and ".click()" in p["eval"]]


# ---------------------------------------------------------------- what the app kept: one record per selection
records = []
for path in sorted(glob.glob(os.path.join(RUN, "captures", "*", "asks", "*.json"))):
    try:
        rec = load(path)
    except ValueError:
        rec = None
    readable = isinstance(rec, dict) and isinstance(rec.get("image"), dict) and isinstance(rec.get("context"), dict)
    cap = os.path.basename(os.path.dirname(os.path.dirname(path)))
    png = os.path.join(os.path.dirname(path), os.path.basename(rec["image"].get("file") or "-")) if readable else None
    data = open(png, "rb").read() if png and os.path.isfile(png) else None
    records.append({"capture": cap, "file": os.path.basename(path), "readable": readable, "record": rec if readable else {"image": {}, "context": {}, "requests": []}, "png_bytes": data,
                    "png_ok": bool(readable and data) and sha(data) == rec["image"].get("sha256") == os.path.splitext(os.path.basename(png))[0] and len(data) == rec["image"].get("bytes")})
unreadable = [r["file"] for r in records if not r["readable"]]
requests = [dict(q, _selection=r["record"].get("selection_id"), _capture=r["capture"]) for r in records for q in as_list(r["record"].get("requests")) if isinstance(q, dict)]

# ---------------------------------------------------------------- run integrity (every scenario)
shots = [s for s in steps if s.get("kind") == "desktopShot"]
foreign = as_list((results.get("foreign") or {}).get("start")) + as_list((results.get("foreign") or {}).get("end")) + [f for s in shots for f in as_list(s.get("foreign"))]
looked = isinstance(results.get("foreign"), dict) and "start" in results["foreign"] and "end" in results["foreign"]
check("run.shared_desktop_quiet", "pass" if looked and not foreign else "fail", {"foreign_electron_seen": foreign, "looked_at_start_and_end": looked, "screenshots": len(shots)},
      "no other Electron app at start, at each screenshot and at the end (point-in-time)")
failed = [{"i": s["i"], "kind": s.get("kind"), "as": s.get("as"), "error": str(s.get("error"))[:400]} for s in steps if not s["ok"]]
wrong_kind = [{"i": s["i"], "ran_as": s.get("kind"), "planned": planned_kind(p)} for s, p in zip(steps, planned) if s.get("kind") != planned_kind(p) or s.get("as") not in (None, p.get("as"))]
ran_plan = len(planned) > 0 and [s["i"] for s in steps] == list(range(1, len(planned) + 1)) and not wrong_kind
check("run.completed", "pass" if not results.get("aborted") and not failed and as_list(results.get("errors")) == [] and ran_plan and not unreadable else "fail",
      {"aborted": str(results.get("aborted"))[:400] if results.get("aborted") else None, "failed_steps": failed, "steps_run": len(steps), "steps_planned": len(planned), "steps_not_run_as_planned": wrong_kind,
       "unreadable_selection_records": unreadable},
      "every planned step ran, in order, as the kind of step it was planned as; an optional wait that timed out counts as a failed step here")

# The surface was what was really on the screen, and each selected picture was the surface with the pen's rings.
on_top = [s for s in steps if s.get("kind") == "onTop"]
pictures = {k: parsed(k) for k in values if k.startswith("picture")}
truth0 = D("surface_truth")
colors = {c["index"]: c["color"] for c in truth0.get("cards", [])} if isinstance(truth0, dict) else {}
picture_planned = [p.get("as") for p in planned if str(p.get("as", "")).startswith("picture")]
picture_bad = {k: "not read" for k in picture_planned if not isinstance(pictures.get(k), dict)}
for k, pic in pictures.items():
    if isinstance(pic, dict) and not (pic.get("ok") is True and pic.get("ringed") == pic.get("rings_wanted") and set(pic["ringed"]) <= set(circled or [])
                                     and len(pic.get("cards", [])) == 12 and all(colors.get(c["index"]) == c["shape_color"] for c in pic["cards"])):
        picture_bad[k] = {"ok": pic.get("ok"), "ringed": pic.get("ringed"), "rings_wanted": pic.get("rings_wanted"), "colours_differ_at": [c["index"] for c in pic.get("cards", []) if colors.get(c["index"]) != c["shape_color"]]}
surface_ok = (len(on_top) >= 1 and all(s["ok"] and s.get("points", 0) >= 16 and as_list(s.get("covered")) == [] for s in on_top) and len(picture_planned) >= 1 and not picture_bad and len(colors) == 12
              and isinstance(circled, list) and len(set(circled)) == 2)
if any("onTop" in p for p in planned):
    check("run.surface_really_on_screen_and_in_each_selected_picture", "pass" if surface_ok else "fail",
          {"on_top_checks": [{k: s.get(k) for k in ("i", "ok", "points", "covered")} for s in on_top], "circled_cards": circled,
           "selected_pictures": {k: (pic and {x: pic.get(x) for x in ("ok", "size", "ringed", "rings_wanted", "gaps_white")}) for k, pic in pictures.items()}, "problems": picture_bad},
          "under 16 points of the grid the top window was QA's Edge window before the capture started; and every selected picture, read from its own pixels in the page, "
          "shows the twelve cards (grey ground, a shape of the truth's colour, dark digits, white between) with the pen's ring around exactly the cards the harness circled")

# Any planned step that could press Sign in / Cancel sign-in, call the sign-in API, or click or type on the control window.
SIGN_IN = re.compile(r"subLogin(Cancel)?\W{0,6}\.click|#subLogin|lc\W{0,4}subLogin|openExternal")
login_presses = [i + 1 for i, p in enumerate(planned) if SIGN_IN.search(step_text(p)) or (("osClick" in p or "keys" in p) and p.get("window") != "overlay")]
sub_events = parsed("sub_events") if isinstance(parsed("sub_events"), list) else None
sub_reads = [parsed(k) for k in values if re.match(r"^(f_|r_|a_)", k) and isinstance(parsed(k), dict) and isinstance(parsed(k).get("s"), dict)]
login_states = sorted({str(e.get("login")) for e in sub_events or [] if e.get("mode") == "managed"} | {str(r["s"].get("login")) for r in sub_reads})
no_login = login_presses == [] and len(planned) > 0 and login_states == ["none"]
if str(SCENARIO).startswith("sub"):
  check("qa.never_signs_in", "pass" if no_login and sub_events else "limit" if no_login else "fail",
        {"steps_that_could_sign_in": login_presses, "login_states_seen": login_states, "status_events": None if sub_events is None else len(sub_events), "status_reads": len(sub_reads)},
        "no planned step presses Sign in or Cancel sign-in or clicks or types in the control window, and every subscription status the app notified or returned has "
        "login 'none': this run started no sign-in and opened no browser" if no_login and sub_events else
        "no planned step can sign in and every status READ has login 'none', but the run ended before the app's status notifications were read: not complete" if no_login else None)


def self_exit(key):
    p = procs.get(key) or {}
    s = step(lambda s: s.get("kind") == "closeApp" and p.get("close_requested_at") and s.get("close_requested_at") == p.get("close_requested_at"))
    return bool(p.get("exited") is True and p.get("exit_code") == 0 and not p.get("killed") and not p.get("closed_in_finally") and s and s.get("exit_code") == 0)


def kids(name):
    """The app's direct child processes at a step, read on Windows (no clock is compared): their names, or None."""
    v = values.get(name)
    return [str(c.get("name")).lower() for c in as_list(v.get("children")) if isinstance(c, dict)] if isinstance(v, dict) and "children" in v else None


def release(app_key, expect_children):
    """The app ended by itself; every watched process (the connector or bridge, and its children) appeared and exited."""
    appear = [e for e in watch if e.get("event") == "appear"]
    gone = {(e["pid"], e.get("start_ticks")) for e in watch if e.get("event") == "exit"}
    end = next((e for e in watch if e.get("event") == "watch_end"), None)
    start = next((e for e in watch if e.get("event") == "watch_start"), None)
    left = [e["pid"] for e in appear if (e["pid"], e.get("start_ticks")) not in gone]
    wsl_left = [w for w in as_list(results.get("wsl_seen")) if w.get("running_at_end")]
    ok = (self_exit("app") and self_exit(app_key) and (procs.get("app") or {}).get("sub") == "" and bool(start) and start.get("already_there") == [] and bool(end) and end.get("remaining") == []
          and left == [] and len([e for e in appear if e.get("role") == "in_root"]) == expect_children and not [s for s in steps if s.get("kind") == "endHungApp"] and not wsl_left)
    check("release.app_and_connector_ended", "pass" if ok else "fail",
          {"apps": {k: {x: (procs.get(k) or {}).get(x) for x in ("pid", "sub", "close_via", "exited", "exit_code", "exit_ms", "killed", "closed_in_finally")} for k in ("app", app_key)},
           "watched": [{k: e.get(k) for k in ("event", "pid", "name", "role", "at")} for e in watch if e.get("event") in ("appear", "exit")], "expected_starts_in_the_connector_folder": expect_children,
           "there_before_the_run": (start or {}).get("already_there"), "left_at_watch_end": (end or {}).get("remaining"), "wsl_exe_seen_by_the_runner": as_list(results.get("wsl_seen"))},
          "both app processes ended by themselves with code 0; exactly the expected number of processes started in the connector's folder, and each of them and of their "
          "children exited; nothing ran there before; no wsl.exe child the runner saw was still running at the end" if ok or not (start or {}).get("already_there") else
          "the connector's folder was not private: processes were running in it before the run, so what the watch saw cannot be told apart")
    return ok


def card_picture_ok(read, rec):
    """The picture the card shows is, byte for byte, the PNG the app kept for that selection."""
    pic = (read or {}).get("picture") or {}
    return bool(rec and rec["png_ok"] and pic.get("png_sha256") == rec["record"]["image"]["sha256"] and pic.get("png_bytes") == len(rec["png_bytes"])
                and (pic.get("width"), pic.get("height")) == (rec["record"]["image"].get("width"), rec["record"]["image"].get("height")))


QUESTION = next((json.loads(m.group(1)) for p in planned if isinstance(p.get("eval"), str) for m in [re.search(r"q\.value = (\"(?:[^\"\\]|\\.)*\")", p["eval"])] if m), None)
LEVEL = next((m.group(1) for p in planned if isinstance(p.get("eval"), str) and "q.value = " in p["eval"] for m in [re.search(r"input\[name=\"assistance\"\]\[value=\"(\w+)\"\]", p["eval"])] if m), None)
ask_presses = presses("#askSubmit")

# =================================================================== subcontrols: the stand-in bridge
if SCENARIO == "subcontrols":
    log = jsonl("bridge", "bridge-log.jsonl")
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
    # The WSL clock (bridge, watch) against the Windows clock (app, runner), measured in this run: when the bridge logged
    # each question minus when the app recorded sending it (the transport's few tens of ms included).
    offsets = [ts(K[k]["ask"]["at"]) - ts(K[k]["request"]["submitted_at"]) for k in K]
    OFFSET = statistics.median(offsets) if offsets else None
    clock_ok = OFFSET is not None and abs(OFFSET) <= 1.0 and max(offsets) - min(offsets) <= 1.0
    wsl = lambda stamp: ts(stamp) - (OFFSET or 0.0)  # a WSL stamp on the Windows clock
    check("control.bridge_is_the_stand_in", "pass" if starts and all("SYNTHETIC" in str(e.get("label")) for e in starts) and all(e.get("stdin_fifo") is True for e in starts)
          and all(e.get("argv") == ["-m", "services.worker.connectors.chatgpt_local"] for e in starts) and SUB.get("kind") == "fake" else "fail",
          {"starts": [{k: e.get(k) for k in ("at", "launch_n", "argv", "stdin_fifo", "label")} for e in starts], "run": SUB},
          "DETERMINISTIC CONTROL: the app's connector was QA's stand-in, started by the app with the connector's own arguments over private pipes. No real configuration existed in this run")
    check("control.questions_align", "pass" if aligned and clock_ok else "fail",
          {"bridge_asks": len(asks), "scripted": len(scripted), "recorded_by_the_app": len(requests), "of_them_received_by_the_bridge": len(sent), "labels": len(labels), "ask_presses": len(ask_presses),
           "wsl_minus_windows_clock_s": {"median": OFFSET and round(OFFSET, 3), "min": offsets and round(min(offsets), 3), "max": offsets and round(max(offsets), 3)}},
          "each press that reached the bridge is one ask in its log, one scripted behaviour and one request the app recorded, in the same order; none was sent twice. "
          "The two clocks agree within 1 s (measured from those pairs); the time comparisons below use that measured offset")

    # -- off by default, and nothing before the user's Check
    off, nc = D("off"), D("f_not_checked")
    checks_pressed = presses("subCheck")
    t_check = ts(checks_pressed[0][0]["at"]) if checks_pressed else None
    k0 = D("k0_unchecked_ask")
    s0_record = [r for r in records if not as_list(r["record"].get("requests")) and r["record"].get("selected_at") and t_check and ts(r["record"]["selected_at"]) < t_check]
    watched = any(e.get("event") == "watch_start" and e.get("already_there") == [] for e in watch) and any(e.get("event") == "appear" for e in watch)
    k_before, k_unchecked, k_checked = kids("kids_not_checked"), kids("kids_unchecked"), kids("kids_checked")
    before_ok = ((off.get("s") is None or (off.get("s") or {}).get("mode") in (None, "off")) and (off.get("section") or {}).get("hidden") is True
                 and (nc.get("s") or {}).get("state") == "not_checked" and bool(starts) and t_check is not None and clock_ok and wsl(starts[0]["at"]) >= t_check - CLOCK
                 and str(k0.get("status", "")).startswith("Not sent") and "not been checked" in str(k0.get("status")) and k0.get("answer_shown") is False and len(s0_record) >= 1
                 and watched and not [e for e in watch if e.get("event") == "appear" and wsl(e["at"]) < t_check - CLOCK]
                 and k_before is not None and "wsl.exe" not in k_before and k_unchecked is not None and "wsl.exe" not in k_unchecked and k_checked is not None and k_checked.count("wsl.exe") == 1)
    check("control.off_by_default_and_nothing_before_check", "pass" if before_ok else "fail",
          {"without_configuration": {"status": off.get("s"), "section_hidden": (off.get("section") or {}).get("hidden")}, "configured_before_check": (nc.get("s") or {}).get("state"),
           "ask_before_check": k0.get("status"), "first_bridge_start_after_check_s": round(wsl(starts[0]["at"]) - t_check, 2) if starts and t_check else None,
           "selections_kept_without_a_question": len(s0_record), "app_children": {"before_check": k_before, "after_capture_ink_selection_and_ask_unchecked": k_unchecked, "after_check": k_checked}},
          "without the configuration there is no subscription section; with it, a capture, ink, a selection and an Ask before the user's Check start no connector (the app has "
          "no wsl.exe child, read on Windows; the watch sees no process), Ask says 'Not sent' and records no question; after the Check the app has exactly one wsl.exe child")
    si = D("f_signed_in")
    offered = [o[0] for o in as_list(si.get("options"))]
    account_ok = ((si.get("s") or {}).get("state") == "signed_in" and (si.get("s") or {}).get("plan") == "QA-SYNTHETIC" and offered == ["qa-synthetic-vision"]
                  and (si.get("s") or {}).get("model") == "qa-synthetic-vision" and "QA-SYNTHETIC" in str((si.get("state") or {}).get("text")) and (si.get("login") or {}).get("hidden") is True)
    check("control.check_reads_the_account_and_offers_picture_models_only", "pass" if account_ok else "fail",
          {"status": si.get("s") and {k: si["s"].get(k) for k in ("state", "plan", "model", "login")}, "state_text": (si.get("state") or {}).get("text"), "quota_text": (si.get("quota") or {}).get("text"), "models_offered": as_list(si.get("options"))},
          "after the press: the stand-in's account (plan label QA-SYNTHETIC) is shown; only the model that takes pictures is offered, the text-only one is not")

    # -- a selection that is not asked sends nothing
    sel, sel2 = D("k_selected"), D("k_selected_later")
    first_press = next((s for s, p in ask_presses if t_check is not None and ts(s["at"]) > t_check), None)
    METHODS = {"connection/read", "ask/cancel", "session/stop"}
    reqs = [e for e in log if e.get("event") == "request"]
    early = [e.get("method") for e in reqs if first_press and wsl(e["at"]) < ts(first_press["at"]) - CLOCK and e.get("method") != "connection/read"] + \
            [a["request_id"] for a in asks if first_press and wsl(a["at"]) < ts(first_press["at"]) - CLOCK]
    idle_ok = (bool(K) and clock_ok and sel.get("card_shown") is True and sel.get("badge") == "Selection · not sent to any AI" and sel2.get("badge") == sel.get("badge") and sel.get("answer_shown") is False
               and first_press is not None and early == [] and {e.get("method") for e in reqs} <= METHODS)
    check("control.selection_without_ask_sends_nothing", "pass" if idle_ok else "fail",
          {"badge": sel.get("badge"), "badge_4s_later": sel2.get("badge"), "card_text": sel.get("card_text"), "bridge_received_before_the_first_press_other_than_the_account_read": early,
           "methods_the_bridge_ever_received": sorted({str(e.get("method")) for e in reqs}) + (["ask/start"] if asks else [])},
          "signed in (stand-in), capturing, writing and selecting: the card says the selection is not sent to any AI, and before Ask was pressed the bridge received only the "
          "account read of the user's Check")

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
            and QUESTION is not None and k1["ask"]["question_sha256"] == sha(QUESTION.encode()) and k1["request"].get("question") == QUESTION and k1["ask"]["assistance"] == LEVEL == k1["request"].get("assistance")
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
            and outcome(k).get("status") == "refused" and outcome(k).get("code") == K[k]["script"]["code"] and "answer" not in outcome(k) and K[k]["request"].get("shown") is False
    r2 = (K.get("k2_tampered") or {}).get("read") or {}
    # Everything a card showed and everything the app kept (the texts of the k1/k13/k15 answers are the scripted ones).
    everything_shown_or_kept = json.dumps([r["record"] for r in records]) + json.dumps([parsed(k) for k in values if re.match(r"^k\d+", k) or k.startswith("f_")], default=str)
    STAND_IN_TEXT = re.compile(r"Picture \d+x\d+ px")  # the stand-in's own answer text when the script gives none (k2)
    unbound_ok = (bool(K) and r2.get("answer_shown") is False and "it is not shown" in str(r2.get("status")) and outcome("k2_tampered").get("status") == "refused" and outcome("k2_tampered").get("code") == "unbound"
                  and "answer" not in outcome("k2_tampered") and K["k2_tampered"]["request"].get("shown") is False and not STAND_IN_TEXT.search(everything_shown_or_kept)
                  and any(e.get("event") == "sent" and e.get("kind") == "answer" and e.get("id") == K["k2_tampered"]["ask"]["id"] for e in log))
    check("control.unbound_answer_is_not_shown", "pass" if unbound_ok else "fail",
          {"card_status": r2.get("status"), "record_outcome": outcome("k2_tampered"), "the_stand_ins_text_anywhere": bool(STAND_IN_TEXT.search(everything_shown_or_kept))},
          "the stand-in wrote an answer whose provenance names another picture: it is not shown, the record says refused (unbound) and holds no answer, and its text is "
          "nowhere on a card or in a record")
    check("control.refusals_say_fixed_text_and_are_not_resent", "pass" if refusals and all(refusals.values()) and aligned else "fail",
          {"each": refusals, "statuses": {k: ((K.get(k) or {}).get("read") or {}).get("status") for k in FIXED}},
          "each closed error code is shown as the app's own fixed sentence, recorded as refused, with no answer; the bridge received each question exactly once")

    # -- cancel: confirmed, unconfirmed, and a late answer that must never appear
    def cancel_sent(k):
        return bool(K) and any(e.get("event") == "request" and e.get("method") == "ask/cancel" and e.get("request_id") == K[k]["ask"]["request_id"] for e in log)

    def late_written(k):
        return bool(K) and any(e.get("event") == "sent" and e.get("kind") == "answer" and e.get("id") == K[k]["ask"]["id"] for e in log)
    c9, c10, c11 = [((K.get(k) or {}).get("read") or {}) for k in ("k9_cancel_confirmed", "k10_cancel_late_answer", "k11_cancel_unconfirmed")]
    cancel_ok = (bool(K) and all(cancel_sent(k) for k in ("k9_cancel_confirmed", "k10_cancel_late_answer", "k11_cancel_unconfirmed"))
                 and all(c.get("answer_shown") is False and c.get("badge") == "Selection · asked: no answer shown" for c in (c9, c10, c11))
                 and c9.get("status") == "Cancelled: no answer is shown." and outcome("k9_cancel_confirmed") == {"status": "cancelled", "uncertain": False}
                 and c10.get("status") == "Cancelled: no answer is shown." and outcome("k10_cancel_late_answer").get("status") == "cancelled" and "answer" not in outcome("k10_cancel_late_answer")
                 and "not confirmed" in str(c11.get("status")) and outcome("k11_cancel_unconfirmed") == {"status": "cancelled", "uncertain": True}
                 and late_written("k10_cancel_late_answer") and "LATE answer" not in everything_shown_or_kept)
    check("control.cancel_and_late_answer", "pass" if cancel_ok else "fail",
          {"confirmed": {"status": c9.get("status"), "record": outcome("k9_cancel_confirmed") if K else None},
           "late_answer": {"status": c10.get("status"), "record": outcome("k10_cancel_late_answer") if K else None, "bridge_wrote_a_late_answer": late_written("k10_cancel_late_answer")},
           "unconfirmed": {"status": c11.get("status"), "record": outcome("k11_cancel_unconfirmed") if K else None}, "late_text_anywhere": "LATE answer" in everything_shown_or_kept},
          "Cancel tells the bridge; a confirmed interruption is said plainly, an unconfirmed one is said as not confirmed, no answer box is shown, and an answer the bridge "
          "still wrote after the cancel appears nowhere: not on the card, not in the record")

    # -- Stop while a question is out; a later Start may ask again
    k12, k13 = K.get("k12_stop_in_flight", {}), K.get("k13_new_session", {})
    stop_req = next((e for e in log if e.get("event") == "request" and e.get("method") == "session/stop" and K and e.get("capture_session_id") == k12["ask"]["capture_session_id"]), None)
    stop_ok = (bool(K) and stop_req is not None and ts(stop_req["at"]) > ts(k12["ask"]["at"]) and outcome("k12_stop_in_flight").get("status") == "cancelled" and "answer" not in outcome("k12_stop_in_flight")
               and k12["request"].get("shown") is False and late_written("k12_stop_in_flight") and "LATE answer" not in everything_shown_or_kept
               and not [a for a in asks if a["capture_session_id"] == k12["ask"]["capture_session_id"] and ts(a["at"]) > ts(stop_req["at"])]
               and k13["ask"]["capture_session_id"] != k12["ask"]["capture_session_id"] and (k13.get("read") or {}).get("answer_shown") is True and (k13["read"] or {}).get("answer") == k13["script"]["text"])
    check("control.stop_in_flight_then_a_new_session", "pass" if stop_ok else "fail",
          {"stop_told_the_bridge": stop_req and {k: stop_req.get(k) for k in ("at", "capture_session_id")}, "record_of_the_question_out": outcome("k12_stop_in_flight") if K else None,
           "bridge_wrote_a_late_answer_after_the_stop": late_written("k12_stop_in_flight"),
           "new_session": K and {"capture_session_id_differs": k13["ask"]["capture_session_id"] != k12["ask"]["capture_session_id"], "answer_shown": (k13.get("read") or {}).get("answer_shown")}},
          "Stop with a question out tells the bridge to stop that capture session; the question is recorded as cancelled; the answer the bridge still wrote after the Stop is "
          "not kept or shown; nothing more is asked for that session; a later explicit Start is another session and can ask")

    # -- a line over the envelope's limit: the child is ended, the app starts none by itself; only the user's Check does
    f1, f2, rc = D("f_after_fault"), D("f_after_fault_later"), D("f_rechecked_now")
    t_recheck = ts(checks_pressed[1][0]["at"]) if len(checks_pressed) == 2 else None
    fault_sent = next((e for e in log if e.get("event") == "sent" and e.get("kind") == "fault"), None)
    roots = [e for e in watch if e.get("event") == "appear" and e.get("role") == "in_root"]
    k_fault, k_re = kids("kids_after_fault"), kids("kids_rechecked")
    fault_ok = bool(K) and (fault_sent is not None and t_recheck is not None and clock_ok and len(starts) == 2 and len(eofs) == 2 and wsl(eofs[0]["at"]) < t_recheck and wsl(starts[1]["at"]) >= t_recheck - CLOCK
                            and len(roots) == 2 and wsl(roots[1]["at"]) >= t_recheck - CLOCK and k_fault is not None and "wsl.exe" not in k_fault and k_re is not None and k_re.count("wsl.exe") == 1
                            and (f1.get("s") or {}).get("state") == "unavailable" and (f2.get("s") or {}).get("state") == "unavailable"
                            and (K["k14_fault"].get("read") or {}).get("answer_shown") is False and outcome("k14_fault").get("status") in ("uncertain", "refused") and "answer" not in outcome("k14_fault")
                            and K["k14_fault"]["request"].get("shown") is False and (rc.get("s") or {}).get("state") == "signed_in" and (K["k15_after_recheck"]["read"] or {}).get("answer_shown") is True)
    check("control.overlong_line_ends_the_child_and_none_is_started_without_the_user", "pass" if fault_ok else "fail",
          {"fault_written": fault_sent and fault_sent.get("at"), "bridge_starts": [e.get("at") for e in starts], "bridge_ends": [e.get("at") for e in eofs], "users_second_check_pressed_at": checks_pressed[1][0]["at"] if len(checks_pressed) == 2 else None,
           "status_6s_after": f1.get("s") and {k: f1["s"].get(k) for k in ("state", "detail", "asking")}, "status_12s_after": f2.get("s") and {k: f2["s"].get(k) for k in ("state", "detail", "asking")},
           "app_children": {"6s_after_the_fault": k_fault, "after_the_users_check": k_re}, "state_text_after": (f2.get("state") or {}).get("text"),
           "card": ((K.get("k14_fault") or {}).get("read") or {}).get("status"), "record": outcome("k14_fault") if K else None, "after_the_users_check": (rc.get("s") or {}).get("state")},
          "the bridge wrote `connection/changed`, left the app's re-read unanswered, wrote `connection/changed` again and then a 300 KiB line. The app ended that child (it has no "
          "wsl.exe child 6 s later), said the connection is not available, and started no other child for 12 s; the second bridge start came only after the user's own Check press")
    so, k17 = D("f_signed_out"), D("k17_not_signed_in")
    out_ok = (bool(K) and refusals.get("k16_unauthenticated") is True and (so.get("s") or {}).get("state") == "signed_out" and (so.get("login") or {}).get("hidden") is False
              and str(k17.get("status", "")).startswith("Not sent") and k17.get("answer_shown") is False and len(asks) == 16)
    check("control.unauthenticated_shows_signed_out_and_asks_no_more", "pass" if out_ok else "fail",
          {"card": ((K.get("k16_unauthenticated") or {}).get("read") or {}).get("status"), "control_state": (so.get("s") or {}).get("state"), "sign_in_button_shown": (so.get("login") or {}).get("hidden") is False,
           "next_ask": k17.get("status"), "bridge_asks_total": len(asks)},
          "an `unauthenticated` answer shows the fixed text, the control window says not signed in and offers Sign in (not pressed), and the next Ask is not sent")
    check("control.no_sign_in_request_reached_the_bridge", "pass" if reqs and {e.get("method") for e in reqs} <= METHODS else "fail",
          {"methods_seen": sorted({str(e.get("method")) for e in reqs})}, "the bridge was never asked to start or cancel a sign-in")
    release("app-fake", 2)

# =================================================================== subselect: can every selection be asked about?
elif SCENARIO == "subselect":
    samples = (D("timeline")).get("samples") or []
    strokes = [s for s in steps if s.get("kind") == "stroke"]
    rows = []
    for n in range(len(strokes)):
        card = D(f"sel_{n}")
        frame = re.search(r"px of frame (\d+)", str(card.get("card_text")))
        nxt = next((s for s in samples if frame and s.get("seq") == int(frame.group(1)) + 1), None)
        rows.append({"n": n, "form_ready": f"ready_{n}" in values, "status": card.get("status"), "frame": frame and int(frame.group(1)),
                     "card_read_at": card.get("at"), "next_sample_at": nxt and nxt.get("sampled_at"),
                     "next_sample_after_card_read_s": round(ts(nxt["sampled_at"]) - ts(card["at"]), 3) if nxt and card.get("at") else None})
    refused = [r for r in rows if not r["form_ready"]]
    check("probe.every_selection_can_be_asked_about", "pass" if rows and not refused and len(rows) == len([p for p in planned if "stroke" in p]) else "fail",
          {"selections": len(rows), "form_ready": len(rows) - len(refused), "refused": refused, "all": rows, "records_kept": len(records), "questions_asked": len(requests)},
          "every selection got its question form" if rows and not refused else
          f"{len(refused)} of {len(rows)} selections of the same region, with a retained frame and valid ink, were refused by the app with the status shown; nothing was asked in this probe")
    release("app-fake", 1)

# =================================================================== subcheck: the real connector, no question
elif SCENARIO == "subcheck":
    check("run.real_connector", "pass" if REAL else "fail", {k: SUB.get(k) for k in ("kind", "python", "state_dir", "codex_bin", "source", "files_are_the_source_commits", "connector_files_sha256", "wsl")},
          "the app's connector was the released one: the project's Python running a private exact-source copy whose five files are the named commit's, with the connector's own product state")
    nc, st, card, typed = D("r_not_checked"), D("r_state"), D("r_card"), D("r_typed")
    s = st.get("s") or {}
    pressed = presses("subCheck")
    appeared = [e for e in watch if e.get("event") == "appear"]
    state = s.get("state")
    k_before, k_after = kids("kids_not_checked"), kids("kids_checked")
    watched = any(e.get("event") == "watch_start" and e.get("already_there") == [] for e in watch)
    check_ok = ((nc.get("s") or {}).get("state") == "not_checked" and len(pressed) == 1 and pressed[0][0]["ok"] and watched and any(e.get("role") == "in_root" for e in appeared)
                and k_before is not None and "wsl.exe" not in k_before and k_after is not None and k_after.count("wsl.exe") == 1 and state in ("signed_in", "signed_out", "unknown", "unavailable"))
    sign_in_offered = (st.get("login") or {}).get("hidden") is False
    told = check_ok and ((state == "signed_in" and not sign_in_offered) or (state == "signed_out" and sign_in_offered))
    check("check.connection_read_on_the_users_press", "pass" if told else "limit" if check_ok else "fail",
          {"before": (nc.get("s") or {}).get("state"), "after": {k: s.get(k) for k in ("state", "plan", "model", "login", "detail")}, "state_text": (st.get("state") or {}).get("text"), "quota_text": (st.get("quota") or {}).get("text"),
           "models": [{k: m.get(k) for k in ("id", "label", "image_input", "default")} for m in as_list(s.get("models"))], "models_offered": as_list(st.get("options")),
           "sign_in_button_shown": sign_in_offered, "app_children": {"before_the_press": k_before, "after_the_press": k_after},
           "connector_processes": [{k: e.get(k) for k in ("name", "role", "at")} for e in appeared]},
          {"signed_in": "the connector started only on the press (the app had no wsl.exe child before it, one after) and reports a managed ChatGPT sign-in. This is the account "
                        "state the official Codex app server reports; it does not show that a model answers",
           "signed_out": "the connector started only on the press (the app had no wsl.exe child before it, one after) and reports NOT signed in: the official 'Sign in with "
                         "ChatGPT' button is shown. Signing in is the user's own browser step; QA did not press it"}.get(state, "") if told else
          f"the connector started on the press, but the state is '{state}' (or the Sign in button does not fit it): see the detail" if check_ok else None)
    rec = records[0] if len(records) == 1 and records[0]["readable"] else None
    form_ok = (card.get("card_shown") is True and card.get("form_shown") is True and card.get("badge") == "Selection · not sent to any AI" and card.get("answer_shown") is False and card_picture_ok(card, rec)
               and rec is not None and as_list(rec["record"].get("requests")) == [] and ask_presses == [] and requests == [])
    receipts = load(os.path.join(RUN, "receipts-found.json")) if exists("receipts-found.json") else {}
    check("check.card_form_on_a_real_selection_nothing_asked", "pass" if form_ok else "fail",
          {"card": {k: card.get(k) for k in ("badge", "card_text", "question", "assistance", "form_shown", "picture")}, "record_requests": rec and as_list(rec["record"].get("requests")), "ask_presses_planned": len(ask_presses),
           "request_ids_recorded_by_the_app": receipts.get("request_ids")},
          "the selection of the surface with the two circles shows the question form; the picture is the PNG the app kept; the run has no Ask press and the app recorded no "
          "request (receipts are looked up only by recorded request ids, so none was looked up)")
    clicked = step(lambda s: s.get("kind") == "osClick") or {}
    keys = [s for s in steps if s.get("kind") == "keys"]
    key1, key2 = (keys + [{}, {}])[:2]
    typed2, focus1, focus2 = D("r_typed_raised"), D("r_focus_after_click"), D("r_focus_raised")
    user_ok = (clicked.get("clicked") is True and clicked.get("foreground_after") is True and key1.get("sent") is True and focus1.get("active") is True
               and "4207 1935" in str(typed.get("value")) and typed.get("value") != card.get("question"))
    forced_ok = key2.get("sent") is True and typed2.get("value") == "7781 20"
    check("check.question_box_takes_typed_text_after_a_click", "pass" if user_ok else "fail" if clicked.get("clicked") is True or not clicked else "limit",
          {"os_click": {k: clicked.get(k) for k in ("point_px", "pointer_still_there", "window_at_point_is_ours", "clicked", "foreground_before", "foreground_after", "error")}, "focus_after_click": focus1,
           "keys": {k: key1.get(k) for k in ("window_found", "is_foreground", "sent", "sent_chars", "still_foreground")}, "question_before": card.get("question"), "question_after": typed.get("value"),
           "text_that_was_there_is_kept_whole": str(card.get("question")) in str(typed.get("value"))},
          "one OS mouse click on the question box gave the overlay the keyboard, and OS keystrokes then typed into it (synthetic OS input, not a physical mouse or keyboard)"
          + ("" if str(card.get("question")) in str(typed.get("value")) else ". The text that was in the box did not stay whole (see question_after); why is not determined: the system's only "
             "input method is Microsoft Pinyin and the app has no handler on the box. Not judged") if user_ok else
          "the click step did not run" if not clicked else
          "one OS mouse click was made on the question box and the text typed after it is NOT in the box: a user cannot type a question this way" if clicked.get("clicked") is True else
          "no click was made (the window under the point was not the app's overlay, or the pointer had moved): typing after a click is NOT shown")
    check("check.question_box_takes_typed_text_when_qa_raises_the_overlay", "pass" if forced_ok else "limit",
          {"focus": focus2, "keys": {k: key2.get(k) for k in ("window_found", "is_foreground", "sent", "sent_chars", "still_foreground")}, "question_after": typed2.get("value")},
          "DIAGNOSTIC, not a user path: after QA itself brings the overlay to the foreground and focuses the box, the keys replace the selected text" if forced_ok else
          "DIAGNOSTIC: the overlay did not take the keys even when QA raised it (or it could not be raised: nothing was typed anywhere)" if key2 else "DIAGNOSTIC: the keys step did not run")
    release("app-real", 1)

# =================================================================== subask: the one real image turn
elif SCENARIO in ("subask", "subrehearsal"):
    APP = "app-real" if SCENARIO == "subask" else "app-fake"
    check("run.real_connector", "pass" if REAL else "limit" if SCENARIO == "subrehearsal" and SUB.get("kind") == "fake" and exists("bridge") else "fail", {k: SUB.get(k) for k in ("kind", "python", "state_dir", "codex_bin", "source", "files_are_the_source_commits", "connector_files_sha256", "wsl", "allocation", "ask_pressed")},
          "the app's connector was the released one: the project's Python running a private exact-source copy whose five files are the named commit's, with the connector's own product state" if REAL else
          "REHEARSAL: the same steps as the real turn, with QA's stand-in bridge instead of the connector. No Codex, no ChatGPT, no allowance; nothing here is real-model evidence" if SCENARIO == "subrehearsal" else None)
    st, before, ready, after = D("a_state"), D("a_card"), D("a_ready"), D("a_after")
    s = st.get("s") or {}
    press = ask_presses[0][0] if len(ask_presses) == 1 else None      # the runner's entry of the one press, if it ran
    rec = records[0] if len(records) == 1 and records[0]["readable"] else None
    R = rec["record"] if rec else {"image": {}, "context": {}}
    q = requests[0] if len(requests) == 1 else None
    ctx = R.get("context") or {}
    out = (q or {}).get("outcome") or {}
    answer = (out.get("answer") or {}).get("text") if out.get("status") == "answered" else None
    not_reached = press is None and not requests
    NOT_REACHED = "NOT REACHED: the run stopped before Ask was pressed; no question was asked and no attempt was used"

    # -- the connection the question went to
    model_ok = s.get("state") == "signed_in" and isinstance(s.get("model"), str) and any(m.get("id") == s["model"] and m.get("image_input") is True for m in as_list(s.get("models")))
    gate = D("a_ready_state")
    stand_in = s.get("plan") == "QA-SYNTHETIC"
    signed = model_ok and gate.get("state") == "signed_in" and gate.get("model") == s.get("model") and not stand_in
    last_state = next((r["s"].get("state") for r in reversed(sub_reads)), None)
    check("turn.signed_in_with_a_picture_model", "pass" if signed else "limit" if not_reached or (stand_in and SCENARIO == "subrehearsal") else "fail",
          {"state": s.get("state"), "plan": s.get("plan"), "model": s.get("model"), "quota_text": (st.get("quota") or {}).get("text"), "at_the_press": gate,
           "models": [{k: m.get(k) for k in ("id", "image_input", "default")} for m in as_list(s.get("models"))]},
          "the product's own state reported a managed ChatGPT sign-in and a chosen model that takes pictures, after the user's Check and again at the press (the sign-in was "
          "the user's; QA pressed only Check connection)" if signed else
          "REHEARSAL: the account is the stand-in's (plan label QA-SYNTHETIC), not a sign-in" if stand_in and SCENARIO == "subrehearsal" else
          f"{NOT_REACHED}. The last subscription state the app returned was '{last_state}'" if not_reached else "Ask was pressed although the state read does not show a real sign-in with a picture model")

    # -- the surface: random, pixels only, unchanged up to the press, the whole display, pointer outside
    pre = [parsed(n) for n in ("surface_truth", "surface_truth_circled", "surface_truth_at_ask")]
    truth = pre[0] if all(isinstance(t, dict) for t in pre) and len({json.dumps(t.get("cards"), sort_keys=True) for t in pre}) == 1 and len({t.get("generated_at") for t in pre}) == 1 else None
    cursor_checks = [s_ for s_, p in zip(steps, planned) if s_.get("kind") == "cursorOutside" and (press is None or s_["i"] < press["i"])]
    surface_ok = (truth is not None and all(t.get("full_screen") is True and t.get("fits") is True and (t.get("dom_text") or "").strip() == "" and t.get("url_has_query") is False for t in pre)
                  and len(truth["cards"]) == 12 and len({c["number"] for c in truth["cards"]}) == 12 and isinstance(circled, list) and len(set(circled)) == 2
                  and len(cursor_checks) >= 3 and all(c["ok"] for c in cursor_checks))
    check("turn.surface_is_random_pixels_on_the_whole_display", "pass" if surface_ok else "fail",
          {"cards": truth and [{k: c[k] for k in ("index", "number", "shape", "color")} for c in truth["cards"]], "circled_cards": circled, "generated_at": truth and truth.get("generated_at"),
           "dom_text": [t and t.get("dom_text") for t in pre], "title": truth and truth.get("title"), "cursor_px": [c.get("cursor") for c in cursor_checks]},
          "twelve random cards drawn on a canvas that filled the display; the page's text, title and URL hold none of it; the same cards before Start, before the selection "
          "and at the press; the mouse pointer outside the selected region each time it was read before the press")
    late = parsed("surface_truth_after")
    late_ok = truth is not None and isinstance(late, dict) and late.get("cards") == truth["cards"] and late.get("generated_at") == truth["generated_at"] and late.get("full_screen") is True
    check("turn.surface_unchanged_after_the_answer", "limit" if not_reached else "pass" if late_ok else "fail", {"read": isinstance(late, dict), "full_screen": isinstance(late, dict) and late.get("full_screen")},
          NOT_REACHED if not_reached else "the page still showed the same cards, full screen, after the question ended" if late_ok else "the page's truth after the question is missing or differs")

    # -- exactly one question, with the exact picture and ink
    ink_file = os.path.join(RUN, "captures", (rec or {}).get("capture", "-"), "ink", f"{ctx.get('ink_sha256')}.json")
    ink_bytes = open(ink_file, "rb").read() if os.path.isfile(ink_file) else None
    try:
        ink_doc = json.loads(ink_bytes) if ink_bytes else {}
    except ValueError:
        ink_doc = {}
    ink = ink_doc.get("ink") if isinstance(ink_doc.get("ink"), dict) else {}
    visible = len(as_list(ink.get("visible"))) if ink else None
    f = ctx
    b = (ctx.get("display") or {}).get("bounds") or {}
    rd, rp = ctx.get("region_dip") or {}, ctx.get("region_px") or {}
    try:
        sx, sy = f["frame_width"] / b["width"], f["frame_height"] / b["height"]
        want_px = {"x": math.floor(rd["x"] * sx), "y": math.floor(rd["y"] * sy)}
        want_px["width"] = min(f["frame_width"], math.ceil((rd["x"] + rd["width"]) * sx)) - want_px["x"]
        want_px["height"] = min(f["frame_height"], math.ceil((rd["y"] + rd["height"]) * sy)) - want_px["y"]
    except (KeyError, TypeError, ZeroDivisionError):
        want_px = None
    card_gate = D("a_ready_card")
    one_ok = (rec is not None and q is not None and press is not None and press["ok"] and rec["png_ok"] and card_picture_ok(ready, rec) and card_picture_ok(after, rec)
              and QUESTION is not None and q.get("question") == QUESTION and LEVEL is not None and q.get("assistance") == LEVEL == SUB.get("assistance") and q.get("model") == s.get("model")
              and card_gate.get("question_is_qas") is True and card_gate.get("assistance") == LEVEL
              and (R["image"].get("width"), R["image"].get("height")) == (rp.get("width"), rp.get("height")) and want_px is not None and rp == want_px
              and rd.get("x", 99) <= 40 and rd.get("y", 99) <= 90 and rd.get("x", 0) + rd.get("width", 0) >= 860 and rd.get("y", 0) + rd.get("height", 0) >= 580
              and ink_bytes is not None and sha(ink_bytes) == ctx.get("ink_sha256") and visible == 2 and ctx.get("ink_revision") == ink.get("revision")
              and ctx.get("source_url") is None and ctx.get("source_version") is None and ctx.get("media_position") is None)
    check("turn.one_question_with_the_exact_picture_and_ink", "limit" if not_reached else "pass" if one_ok else "fail",
          {"ask_presses_run": 0 if press is None else 1, "selections_kept": len(records), "questions_recorded": len(requests), "question": q and q.get("question"), "assistance": q and q.get("assistance"), "model": q and q.get("model"),
           "picture": rec and {"sha256": R["image"].get("sha256"), "bytes": R["image"].get("bytes"), "width": R["image"].get("width"), "height": R["image"].get("height"), "file_is_those_bytes": rec["png_ok"]},
           "card_picture_before_and_after": [ready.get("picture"), after.get("picture")], "context": ctx, "region_px_by_the_adrs_rule": want_px,
           "ink_original": {"sha256_is_its_bytes": bool(ink_bytes) and sha(ink_bytes) == ctx.get("ink_sha256"), "visible_strokes": visible, "revision": ink.get("revision")}},
          NOT_REACHED if not_reached else
          "Ask was pressed once. The app kept one selection and one question: QA's question, the chosen level, the chosen model; the picture file is the bytes of its hash and "
          "is the picture on the card before and after; its size is the selected region in frame pixels by the ADR's rule, and the region holds the whole grid; the ink "
          "document named by the request is kept with exactly the two circles; URL, version and media position are null")

    # -- the connector's own receipt: official image input, one turn, no tool
    found = (load(os.path.join(RUN, "receipts-found.json")) if exists("receipts-found.json") else {}).get("found", [])
    mine = [x for x in found if q and x.get("request_id") == q.get("request_id")]
    receipt = load(os.path.join(RUN, "receipts", mine[0]["launch"], mine[0]["file"])) if len(mine) == 1 else None
    prompt, prompt_error = None, None
    if BACKEND and rec and q and rec["png_ok"]:
        sys.path.insert(0, os.path.realpath(BACKEND))
        try:
            from services.learning.subscription_ask import prepare_subscription_ask
            prompt = prepare_subscription_ask({"request_id": q["request_id"], "question": q["question"], "assistance": q["assistance"],
                                               "image": {"png_base64": base64.b64encode(rec["png_bytes"]).decode(), "sha256": R["image"]["sha256"], "width": R["image"]["width"], "height": R["image"]["height"]}, "context": ctx})["text"]
        except Exception as error:  # reported, never hidden
            prompt_error = f"{type(error).__name__}: {str(error)[:200]}"
    backend_is_the_copy = bool(BACKEND) and all(os.path.isfile(os.path.join(BACKEND, name)) and sha(open(os.path.join(BACKEND, name), "rb").read()) == digest
                                                 for name, digest in (SUB.get("connector_files_sha256") or {"-": ""}).items())
    produced = as_list((receipt or {}).get("produced_item_types"))
    ans = out.get("answer") or {}
    # Bound: the receipt is of this request and of exactly these input bytes. Completed: what it says of the turn.
    bound = (receipt is not None and rec is not None and rec["png_ok"] and receipt.get("request_id") == q.get("request_id") and receipt.get("input_types") == ["text", "image"]
             and receipt.get("image_sha256") == R["image"].get("sha256") and receipt.get("image_bytes") == len(rec["png_bytes"])
             and prompt is not None and backend_is_the_copy and receipt.get("text_sha256") == sha(prompt.encode()) and receipt.get("text_bytes") == len(prompt.encode()))
    completed = (receipt is not None and receipt.get("submission") == "acknowledged" and receipt.get("terminal_status") == "completed" and receipt.get("outcome") == "completed"
                 and receipt.get("thread_start_count") == 1 and receipt.get("turn_start_count") == 1 and set(produced) <= {"userMessage", "agentMessage", "reasoning"} and "agentMessage" in produced
                 and receipt.get("actual_model") == q.get("model") == ans.get("model") and receipt.get("thread_id") == ans.get("thread_id") and receipt.get("turn_id") == ans.get("turn_id")
                 and bool(receipt.get("thread_id")) and bool(receipt.get("turn_id")))
    shown_receipt = receipt and {k: receipt.get(k) for k in ("format", "input_types", "text_bytes", "text_sha256", "image_bytes", "image_sha256", "submission", "terminal_status", "outcome", "produced_item_types",
                                                              "thread_start_count", "turn_start_count", "actual_model", "codex_version", "codex_sha256", "explicit_bin_override")}
    check("turn.connector_receipt_official_image_input_one_turn_no_tool",
          "limit" if not_reached or receipt is None or prompt is None or not backend_is_the_copy or (bound and not completed and out.get("status") != "answered") else "pass" if bound and completed else "fail",
          {"receipt": shown_receipt, "receipts_for_this_request": len(mine), "bound_to_the_kept_request": bound, "completed_one_turn_no_tool": completed,
           "prompt_recomputed": prompt is not None, "prompt_error": prompt_error, "prompt_sha256": prompt and sha(prompt.encode()), "prompt_bytes": prompt and len(prompt.encode()),
           "backend_given_is_the_runs_copy": backend_is_the_copy},
          NOT_REACHED if not_reached else
          "the connector's own receipt for this request: the turn's input was one text item and one image item whose bytes are the kept PNG; the text is, byte for byte, the "
          "prompt the released prepare_subscription_ask builds from the kept request; one thread and one turn were started; the turn completed; it produced only the user "
          "message, reasoning and the assistant's message (no command, tool, approval or web item); the model is the chosen one" if bound and completed else
          "NOT SHOWN: no receipt for this request, or the prompt could not be recomputed with the run's own Backend copy (give --backend). The app's own record alone does "
          "not show what entered the turn" if receipt is None or prompt is None or not backend_is_the_copy else
          f"the receipt is of this request and these exact input bytes; the turn did not complete: submission '{receipt.get('submission')}', terminal status "
          f"'{receipt.get('terminal_status')}', outcome '{receipt.get('outcome')}'. This is what the allowance ledger needs: it is reported, not judged" if bound and out.get("status") != "answered" else
          "the receipt does not fit the kept request or the shown answer: see bound_to_the_kept_request and completed_one_turn_no_tool")

    # -- no leak of the truth into anything but the picture
    own_numbers = re.compile(r"Region [\d.,×x ]+DIP on .*? = [\d×x ]+ px of frame \d+ \(captured [^)]*\), with your ink revision \d+")  # the app's own sizes and counts on the card
    texts = {"question": (q or {}).get("question") or "", "card_text_before": own_numbers.sub(" ", before.get("card_text") or ""), "card_status_before": ready.get("status") or "", "page_title": (truth or {}).get("title") or "",
             "page_dom_text": " ".join((t or {}).get("dom_text") or "" for t in pre), "picture_file_name": (R.get("image") or {}).get("file") or "", "selection_record_file": (rec or {}).get("file") or "",
             "prompt_text": prompt or "", "receipt": json.dumps(receipt or {}), "context": json.dumps(ctx)}
    hits = judge.leaks(truth, texts) if truth else None
    NUMERIC_FIELDS = {"context", "receipt"}  # named numeric fields (sizes, counts, sequences): a hit there is listed, it does not void

    def numbers_in(v):
        if isinstance(v, bool):
            return set()
        if isinstance(v, (int, float)):
            return {int(v)}
        return set().union(*[numbers_in(x) for x in (v.values() if isinstance(v, dict) else v)]) if isinstance(v, (dict, list)) and v else set()
    sizes = numbers_in(ctx) | numbers_in(R.get("image") or {})
    # The prompt carries the request's context and picture size as JSON: a card number equal to one of those sizes is that size.
    voiding = {k: [n for n in v if not (k == "prompt_text" and n in sizes)] for k, v in (hits or {}).items() if k not in NUMERIC_FIELDS}
    voiding = {k: v for k, v in voiding.items() if v}
    prompt_is_the_one_sent = prompt is not None and receipt is not None and receipt.get("text_sha256") == sha(prompt.encode())
    check("turn.no_leak_of_the_truth", "limit" if not_reached else "fail" if hits is None or voiding else "pass" if prompt_is_the_one_sent else "limit",
          {"searched": sorted(texts), "hits_that_void": voiding, "hits_in_numeric_fields": {k: v for k, v in (hits or {}).items() if k in NUMERIC_FIELDS or k == "prompt_text"}, "prompt_text_is_the_one_the_receipt_hashes": prompt_is_the_one_sent},
          NOT_REACHED if not_reached else
          "no card number is in the question, the card's own text, the page's text or title, a file name, or the prompt text that the connector's receipt hashes as the text sent "
          "with the picture" if prompt_is_the_one_sent and hits is not None and not voiding else
          "no leak in the texts searched, but the prompt text searched is not shown to be the one sent (no receipt, or its text hash differs): not complete" if hits is not None and not voiding else
          "a card number is in a text other than the picture: the turn cannot show that the model read the pixels")

    # -- the outcome, on the same card
    shown_ok = (out.get("status") == "answered" and q.get("shown") is True and isinstance(answer, str) and after.get("answer_shown") is True and after.get("answer") == answer and after.get("answer_child_elements") == 0
                and after.get("badge") == "Selection · answered by ChatGPT below" and str(after.get("status", "")).startswith(f"Answered by ChatGPT ({ans.get('model')}) in ")
                and after.get("card_text") == before.get("card_text") and isinstance(ans.get("latency_ms"), (int, float)) and bool(ans.get("thread_id")) and bool(ans.get("turn_id"))
                and after.get("save_shown") is False)
    how = f"{out.get('status')} ({out.get('code') or out.get('reason') or ('uncertain' if out.get('uncertain') else '')})"
    check("turn.completed_answer_shown_on_the_same_card", "pass" if shown_ok else "limit" if not_reached or out.get("status") in ("refused", "uncertain", "cancelled") or (press is not None and q is None) else "fail",
          {"record_outcome": {k: v for k, v in out.items() if k != "answer"} | ({"answer": {k: ans.get(k) for k in ("model", "latency_ms", "thread_id", "turn_id")}} if ans else {}),
           "shown": q and q.get("shown"), "card": {k: after.get(k) for k in ("badge", "status", "card_text", "answer_shown", "save_shown")}, "submitted_at": q and q.get("submitted_at"), "ended_at": q and q.get("ended_at")},
          NOT_REACHED if not_reached else
          "the official turn completed; the answer is on the card of that selection, as plain text, under the selection's own unchanged text, with the model and the time it took; "
          "the record holds the same text, marked shown" if shown_ok else
          f"Ask was pressed and the app recorded NO request: the card said '{after.get('status')}'. Nothing was sent; the press is spent and is not repeated" if press is not None and q is None else
          f"NOT an answered turn: the question ended as {how}. It is reported as that, not judged, and not asked again" if out.get("status") in ("refused", "uncertain", "cancelled") else
          "the record says answered, but what the card shows does not fit it")

    # -- the answer itself, by the rule fixed before the call
    verdict = judge.judge(truth, circled, answer) if truth and isinstance(circled, list) and isinstance(answer, str) else None
    check("turn.answer_names_the_circled_cards", "pass" if verdict and verdict["pass"] else "limit" if not verdict or verdict["outcome"] == "held" or SCENARIO == "subrehearsal" else "fail",
          {"verdict": verdict, "answer_verbatim": answer},
          NOT_REACHED if not_reached else
          "REHEARSAL: the text is the stand-in's own SYNTHETIC sentence, which names no card by design; nothing is judged" if SCENARIO == "subrehearsal" and not (verdict and verdict["pass"]) else
          "MATCHER PASS, pending the reading of the full answer by QA and the lead: the answer names exactly the two circled cards" if verdict and verdict["pass"] else
          "HELD: the numbers match but the answer negates, refuses or hedges; a person must read it. Not a pass" if verdict and verdict["outcome"] == "held" else
          "both numbers are named, but a stated shape or colour does not match the card: read the answer" if verdict and verdict["outcome"] == "contradicted" else
          f"the answer does not name exactly the two circled cards ({verdict['outcome']})" if verdict else "no answer to judge")
    text = before.get("card_text") or ""
    js = lambda v: math.floor(v + 0.5)  # Math.round, as the card's text is made
    try:
        prov_ok = (f"= {rp['width']}×{rp['height']} px of frame {ctx['frame_seq']} (" in text and f"ink revision {ctx['ink_revision']} drawn" in text
                   and f"Region {js(rd['x'])},{js(rd['y'])} {js(rd['width'])}×{js(rd['height'])} DIP" in text)
    except (KeyError, TypeError):
        prov_ok = False
    check("turn.provenance_on_the_card", "limit" if not_reached else "pass" if prov_ok else "fail",
          {"card_text": text, "frame_seq": ctx.get("frame_seq"), "frame_captured_at": ctx.get("frame_captured_at"), "ink_revision": ctx.get("ink_revision"), "region_dip": rd, "region_px": rp},
          NOT_REACHED if not_reached else "the card's own text names the region (DIP and frame pixels), the frame and the ink revision of the request that was sent" if prov_ok else
          "the card's text does not name the request's region, frame and ink revision")
    release(APP, 1)

# =================================================================== surfacecheck: the surface alone, no link and no connection
elif SCENARIO == "surfacecheck":
    reads = [parsed(n) for n in ("surface_truth", "surface_truth_running", "surface_truth_before_ask")]
    same = all(isinstance(t, dict) for t in reads) and len({json.dumps(t.get("cards"), sort_keys=True) for t in reads}) == 1 and len({t.get("generated_at") for t in reads}) == 1
    card, link = D("card"), D("link_off")
    dry_ok = (same and all(t.get("full_screen") is True and t.get("fits") is True and (t.get("dom_text") or "").strip() == "" and t.get("url_has_query") is False for t in reads)
              and card.get("shown") is True and "No AI is connected" in str(card.get("text")) and link.get("l") is None and self_exit("app") and not exists("bridge") and not exists("receipts")
              and not SUB and not watch)
    check("surface.dry_check_without_any_connection", "pass" if dry_ok else "fail",
          {"truth_reads_equal": same, "viewport": reads[0].get("viewport") if isinstance(reads[0], dict) else None, "dom_text": [isinstance(t, dict) and t.get("dom_text") for t in reads],
           "card_text": card.get("text"), "capture_link": link.get("l"), "app": {x: (procs.get("app") or {}).get(x) for x in ("exited", "exit_code", "exit_ms", "killed", "closed_in_finally")}},
          "QA's surface filled the 1280×800 display at scale 2 with the same twelve cards at every read and no text outside the pixels; the pen circled two cards and the "
          "ASK selection showed a local card that says no AI is connected; no capture link and no subscription connection existed in this run; the app ended by itself")
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
    PATHS = (r"(?i)[A-Z]:\\+Users\\+[^\\\"/]+", r"(?i)[A-Z]:/Users/[^/\"\\]+", r"/mnt/[a-z]/Users/[^/\"\\]+", r"(?i)\\+home\\+[^\\\"/]+", r"/home/[^/\"\\]+")
    # Refused outright if any of these is still in the text: a profile folder, a credential-like key (also inside a nested
    # JSON string), an address or e-mail, a sign-in page, or picture or other long base64 data.
    REFUSE = (r"(?i)Users(\\+|/)(?!<)", r"dbname=", r"\\*\"(password|token|id_token|access_token|refresh_token|cookie|authorization)\\*\"\s*:", r"auth\.json", r"Bearer\s+\S",
              r"[\w.+-]+@[\w-]+\.[A-Za-z]{2,}", r"https?://[^\"\s\\]*(openai|chatgpt)\.com", r"data:image/[a-z+.-]+;base64,[A-Za-z0-9+/]{16}", r"[A-Za-z0-9+/]{200,}")

    def redact(value):
        text = json.dumps(value, ensure_ascii=False, indent=1)
        for pattern in PATHS:
            text = re.sub(pattern, "<home>", text)
        for pattern in REFUSE:
            hit = re.search(pattern, text.replace("<home>", ""))
            if hit:
                raise SystemExit(f"evidence refused: a profile path, picture data or secret-like text survived redaction (pattern {REFUSE.index(pattern)})")
        return text + "\n"

    big = {k for k in values if k.startswith("h_") or k in ("timeline", "askCard")}

    def short(name):
        """A card read without its long change log (the last 6 changes are kept, with their count)."""
        v = parsed(name)
        if isinstance(v, dict) and isinstance(v.get("log"), list) and len(v["log"]) > 6:
            return dict(v, log=v["log"][-6:], log_changes=len(v["log"]))
        return values[name]
    files = {"summary.json": {"scenario": SCENARIO, "counts": counts, "checks": checks},
             "runner-results.json": dict(results, values={k: short(k) for k in values if k not in big}),
             "hash-checkpoints.json": {k: values[k] for k in values if k.startswith("h_")},
             "selection-records.json": [{"capture": r["capture"], "file": r["file"], "png_is_its_hash": r["png_ok"], "record": r["record"]} for r in records],
             "connector-watch.json": watch, "steps.json": planned, "run.json": run_info}
    if exists("bridge", "bridge-log.jsonl"):
        files["bridge-log.json"] = jsonl("bridge", "bridge-log.jsonl")
        files["bridge-script.json"] = load(os.path.join(RUN, "bridge", "bridge-script.json"))
    if exists("receipts-found.json"):
        found = load(os.path.join(RUN, "receipts-found.json"))
        files["receipts.json"] = {"found": found, "receipts": [load(os.path.join(RUN, "receipts", x["launch"], x["file"])) for x in found.get("found", [])]}
    texts = {name: redact(value) for name, value in files.items()}  # all redacted first: a refusal leaves no half-written file
    for name, text in texts.items():
        with open(os.path.join(EVIDENCE, name), "w", encoding="utf-8") as f:
            f.write(text)
    print(f"evidence: {len(texts)} files")
