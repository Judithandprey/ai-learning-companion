#!/usr/bin/env python3
"""Checks one QA run of the 'parentfix' scenario (tests/e2e/windows/run.mjs parentfix <out>): the QA-WIN-03/04 retest.

Usage: python3 analyze_fix.py <run out dir> [<evidence dir>]

QA-WIN-03: every owned app process must end by itself after a close request (never ended by QA), and the same profile
must start again. QA-WIN-04: the header, the link line and the ASK card must follow what the link is doing, in every
state read. Inputs: the runner results, the app's coordination record and capture manifests, the WSL host watcher log
and the helper's read-only database readback (after every host exited). App reads are the app's own claims; they are
checked against its files, the Windows process facts, the watcher and the test database. Strokes are DevTools-injected
pen events (synthetic). Statuses: pass / fail / limit.

This is not the file that judged the run of 2026-10-01 (that one is in git at 6a3611e, with its hash in the run's
run.json). It was corrected afterwards: a check must fail when the evidence its note relies on is missing, names another
process, stream or artifact, is stamped at an impossible time, or shows wording outside the accepted copy. The accepted
header and link-line texts are therefore written out below (HEADERS, link_line). replay_analyze_fix.py replays the
committed evidence through this file and checks 121 such removals and falsifications; no Windows run was repeated.
"""

import glob
import json
import os
import re
import sys
from datetime import datetime

RUN = sys.argv[1]
EVIDENCE = sys.argv[2] if len(sys.argv) > 2 else None
checks = []


def check(cid, status, observed, note=None):
    checks.append({"id": cid, "status": status, "observed": observed, **({"note": note} if note else {})})


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def ts(stamp):
    """Seconds since the epoch from an ISO stamp with Z or an offset and any number of fraction digits (UTC-correct)."""
    m = re.fullmatch(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)?", str(stamp).strip())
    if not m:
        raise ValueError(f"not an ISO stamp: {stamp}")
    zone = m.group(3) or "Z"
    base = datetime.fromisoformat(m.group(1) + ("+00:00" if zone == "Z" else zone))
    return base.timestamp() + (float("0." + m.group(2)) if m.group(2) else 0.0)


SKEW = 0.5  # a host that a Start click starts appears after it; the two clocks differed by under 0.1 s at the pause and the resume
CLOCK = 2.0  # tolerance between the Windows (runner) and WSL (watcher, database) clocks, seconds
QUICK_MS = 5000  # nothing to stop: the app should be gone at once (the author measured about 0.2 s)
BOUND_MS = 30000  # a running session ends first, then the link's Stop is bounded at 20 s by the app

results = load(os.path.join(RUN, "out", "results.json"))
values, steps, procs = results["values"], results["steps"], results["processes"]
as_list = lambda v: [] if v is None else (v if isinstance(v, list) else [v])
exists = lambda *p: os.path.exists(os.path.join(RUN, *p))
preflight = load(os.path.join(RUN, "preflight.json"))
readback = load(os.path.join(RUN, "readback.json")) if exists("readback.json") else None
watch = [json.loads(l) for l in open(os.path.join(RUN, "host-watch.jsonl"), encoding="utf-8")] if exists("host-watch.jsonl") else []
final_coord = load(os.path.join(RUN, "capture-host", "coordination.json")) if exists("capture-host", "coordination.json") else None
coord = lambda label: load(os.path.join(RUN, "out", f"copy-{label}", "coordination.json")) if exists("out", f"copy-{label}", "coordination.json") else None
db_docs = (readback or {}).get("database", {}).get("documents", [])


def parsed(name):
    """A value the page returned as JSON text; None when the step never produced it (never an empty stand-in)."""
    v = values.get(name)
    return json.loads(v) if isinstance(v, str) else v


def step(pred):
    return next((s for s in steps if pred(s)), None)


def step_named(name):
    return step(lambda s: s.get("as") == name)


def manifest(cap):
    path = os.path.join(RUN, "captures", cap, "manifest.jsonl")
    return [json.loads(l) for l in open(path, encoding="utf-8")] if os.path.exists(path) else []


# ---------------------------------------------------------------- run integrity
planned = load(os.path.join(RUN, "steps.json")) if exists("steps.json") else []
foreign = as_list(results.get("foreign", {}).get("start")) + as_list(results.get("foreign", {}).get("end")) + \
    [f for s in steps if s.get("kind") == "desktopShot" for f in as_list(s.get("foreign"))]
shots = [s for s in steps if s.get("kind") == "desktopShot"]
looked = isinstance(results.get("foreign"), dict) and "start" in results["foreign"] and "end" in results["foreign"] and bool(shots) and len(shots) == sum(1 for p in planned if "desktopShot" in p) and all("foreign" in s for s in shots)
check("run.shared_desktop_quiet", "fail" if foreign or not looked else "pass", {"foreign_electron_seen": foreign, "looked_at_start_end_and_screenshots": looked, "screenshots": len(shots)},
      "no other Electron app at start, at each screenshot and at the end (point-in-time)")
failed = [{"i": s["i"], "kind": s.get("kind"), "as": s.get("as"), "error": s.get("error")} for s in steps if not s["ok"]]
check("run.completed", "pass" if not results.get("aborted") and not failed and results.get("errors") == [] and [s["i"] for s in steps] == list(range(1, len(planned) + 1))
      and all(s.get("kind") in p and s.get("as") in (None, p.get("as")) for s, p in zip(steps, planned)) else "fail",
      {"aborted": results.get("aborted"), "failed_steps": failed, "steps_run": len(steps), "steps_planned": len(planned)},
      "every planned step ran; an optional status wait that timed out counts as a failed step here")
cursor = [tuple(c) for c in [results.get("cursor", {}).get("start"), results.get("cursor", {}).get("end")] + [s.get("cursor") for s in steps if s.get("kind") == "desktopShot"] if c]
check("run.cursor_static", "pass" if cursor and len(set(cursor)) == 1 and len(cursor) == 2 + len(shots) else "limit", {"positions_px": sorted(set(cursor))})

# ---------------------------------------------------------------- hosts (WSL watcher) and the app processes
appear = [(ts(e["at"]), e["pid"]) for e in watch if e["event"] == "appear"]
exits = {e["pid"]: ts(e["at"]) for e in watch if e["event"] == "exit"}
hosts = [{"pid": pid, "appeared": t, "exited": exits.get(pid)} for t, pid in appear]
APPS = ["app", "app-idle", "app-main", "app-capturing", "app-after-capturing", "app-unavail", "app-unavail-capturing", "app-final"]
started = {k: ts(procs[k]["started_at"]) for k in APPS if k in procs}
exited = {k: ts(procs[k]["exited_at"]) for k in APPS if procs.get(k, {}).get("exited_at")}


def click_before(label):
    """The Start click: the step right before the running wait `label` (startSession = click, running, ...)."""
    i = (step_named(label) or {}).get("i")
    prior = step(lambda s: i is not None and s["i"] == i - 1)
    return ts(prior["at"]) if prior else None


watch_from = next((ts(e["at"]) for e in watch if e["event"] == "watch_start"), None)
watch_to = next((ts(e["at"]) for e in watch if e["event"] == "watch_end"), None)


def hosts_between(a, b):
    """Hosts that appeared from a up to strictly before b (the clock tolerance never counts a host that b itself starts).

    None unless the watcher ran over the whole window: an empty list is then an observation, never missing data.
    """
    if a is None or b is None or watch_from is None or watch_to is None or not (watch_from <= a and b <= watch_to + CLOCK):
        return None
    return [h for h in hosts if a - CLOCK <= h["appeared"] < b - CLOCK]


def self_exit(key):
    p = procs.get(key) or {}
    return bool(p.get("exited") is True and p.get("exit_code") == 0 and not p.get("killed") and not p.get("closed_in_finally") and not p.get("hung_after_close"))


def close_facts(key):
    p = procs.get(key) or {}
    s = step(lambda s: s.get("kind") == "closeApp" and p.get("close_requested_at") and s.get("close_requested_at") == p.get("close_requested_at")) or {}
    return {"pid": p.get("pid"), "link": p.get("link"), "via": p.get("close_via"), "close_requested_at": p.get("close_requested_at"), "exit_ms": p.get("exit_ms"),
            "exited": p.get("exited"), "exit_code": p.get("exit_code"), "exited_at": p.get("exited_at"), "killed": bool(p.get("killed")),
            "closed_in_finally": bool(p.get("closed_in_finally")), **({"wm_close_posted": s.get("posted")} if "posted" in s else {}),
            **({"second_wm_close": s.get("again")} if "again" in s else {}), **({"note": s.get("closeNote")} if s.get("closeNote") else {})}


def kids(label, key=None):
    """Child process names at a children step; None when that step produced nothing (so 'no wsl.exe' is never vacuous)."""
    v = values.get(label)
    names = None if v is None else [str(k["name"]).lower() for k in as_list(v.get("children"))]
    return names if names and "electron.exe" in names and (key is None or (v.get("app_pid") == (procs.get(key) or {}).get("pid")
                                                                         and 0 <= ts(procs[key]["close_requested_at"]) - ts(v["at"]) <= 10)) else None  # listed in the last steps before that close


def quit_check(cid, key, bound_ms, extra_ok, observed, note):
    f = close_facts(key)
    ok = self_exit(key) and f["exit_ms"] is not None and f["exit_ms"] <= bound_ms and extra_ok and bool(f["exited_at"] and f["close_requested_at"] and 0 <= (ts(f["exited_at"]) - ts(f["close_requested_at"])) * 1000 <= bound_ms)
    ok = ok and any(s.get("kind") == "closeApp" and s.get("close_requested_at") == f["close_requested_at"] and s.get("exited") is True and s.get("exit_code") == 0
                    and s.get("exit_ms") == f["exit_ms"] and s.get("via") == f["via"] for s in steps)
    check(cid, "pass" if ok else "fail", {"close": f, "bound_ms": bound_ms, **observed}, note)


# The streams of the record, in order: s1 (healthy, Stop), s2 (healthy, closed while capturing), s3 and s4 (unavailable).
streams = (final_coord or {}).get("streams", [])
st = lambda i: streams[i] if len(streams) > i else None
server_stream = lambda s: next((d.get("stream") for d in db_docs if d["kind"] == "control_stream" and s and d["key"] == s.get("stream_id")), None)
rb_stream = lambda s: next((x for x in (readback or {}).get("streams", []) if s and x["stream_id"] == s.get("stream_id")), None)
link = lambda name: (parsed(name) or {}).get("l") or {}

# ---------------------------------------------------------------- QA-WIN-03: one check per close
quit_check("quit.control_without_link", "app", QUICK_MS, link("n_off").get("mode") == "off" and (procs.get("app") or {}).get("link") == "",
           {"status": link("n_off")}, "control: the same app without the development link")

life = lambda key: hosts_between(started[key], exited[key] + CLOCK) if key in started and key in exited else None  # hosts while that app process lived
a_hosts = life("app-idle")
quit_check("quit.idle_native_close", "app-idle", QUICK_MS,
           link("a_idle").get("state") == "idle" and str((parsed("a_idle") or {}).get("session", "")).startswith("Not capturing") and kids("kids_a", "app-idle") is not None and "wsl.exe" not in kids("kids_a") and a_hosts == []
           and close_facts("app-idle").get("wm_close_posted") is True,
           {"status_before": link("a_idle"), "children_before": kids("kids_a"), "hosts_while_it_ran": a_hosts},
           "link configured, never started; WM_CLOSE posted to the control window (what its title-bar X sends): the app ends by itself")

s1, s2, s3, s4 = st(0), st(1), st(2), st(3)
within = lambda l, a, b: a is not None and b is not None and bool(l.get("at")) and a <= ts(l["at"]) <= b
req = lambda key: ts(procs[key]["close_requested_at"]) if (procs.get(key) or {}).get("close_requested_at") else None
by_user = lambda m, key: [str(l.get("reason", "")) for l in m if l.get("kind") == "ended"] == ["stopped by the user"] and all(within(l, started.get(key), req(key)) for l in m if l.get("kind") == "ended")
quit_check("quit.after_stop_page_close", "app-main", QUICK_MS,
           link("b_stopped_now").get("state") == "stopped" and bool(s1) and s1.get("final") == "stopped" and kids("kids_b_stopped", "app-main") is not None and "wsl.exe" not in kids("kids_b_stopped") and close_facts("app-main")["via"] == "page" and (server_stream(s1) or {}).get("state") == "stopped" and by_user(manifest((s1 or {}).get("capture_session") or "-"), "app-main"),
           {"status_before": link("b_stopped_now"), "stream_final": s1 and s1.get("final"), "children_before": kids("kids_b_stopped")},
           "after Start, storing and Stop on the healthy test service; the page's own close (the original QA-WIN-03 route): the app ends by itself")

# Closed while capturing (no Stop pressed): the session ends, the link's Stop is delivered, the host ends, the app exits.
cap2 = (s2 or {}).get("capture_session")
m2 = manifest(cap2) if cap2 else []
ended2 = [l for l in m2 if l.get("kind") == "ended"]
host2 = [h for h in hosts if click_before("s2") is not None and h["appeared"] >= click_before("s2") - CLOCK and ("app-capturing" not in exited or h["appeared"] <= exited["app-capturing"] + CLOCK)]
rb2, srv2 = rb_stream(s2), server_stream(s2)
committed2 = [j for j in (s2 or {}).get("jobs", []) if j.get("status") == "committed"]
ink_before_close, ink_after = parsed("c_ink_before_close"), parsed("d_ink")
ids = lambda v: sorted((x["id"], x.get("revision"), x.get("strokes")) for x in (v or {}).get("sessions", []))
by_close = lambda ended, key: len(ended) == 1 and str(ended[0].get("reason", "")).startswith("the app was closed") and within(ended[0], req(key), exited.get(key))  # the control window's own close handler ran
c_close = close_facts("app-capturing")
capturing_ok = (bool(s2) and s2.get("final") == "stopped" and s2.get("stops") and s2["stops"][-1].get("outcome") == "stopped" and by_close(ended2, "app-capturing")
                and c_close.get("wm_close_posted") is True
                and bool(srv2) and srv2.get("state") == "stopped" and len(host2) == 1 and host2[0]["exited"] is not None and host2[0]["exited"] >= ts(c_close["close_requested_at"]) - CLOCK
                and bool(rb2) and rb2["server_records"] == sum(j["records"] for j in committed2) and not rb2["mismatches"]
                and link("c_storing_now").get("storing") is True and ink_before_close is not None and ids(ink_before_close) == ids(ink_after))
quit_check("quit.while_capturing_bounded_stop", "app-capturing", BOUND_MS, capturing_ok,
           {"status_before": link("c_storing_now"), "manifest_ended": ended2, "stream": s2 and {"final": s2.get("final"), "stops": [{"key": x.get("key"), "outcome": x.get("outcome")} for x in s2.get("stops", [])],
                                                                                              "notes": s2.get("notes"), "jobs": [j.get("status") for j in s2.get("jobs", [])]},
            "server_stream": srv2, "server_records": rb2 and rb2["server_records"], "server_mismatches": rb2 and rb2["mismatches"],
            "host": host2, "host_exit_after_app_exit_s": round(host2[0]["exited"] - exited["app-capturing"], 2) if host2 and host2[0]["exited"] and "app-capturing" in exited else None,
            "saved_ink_before_close": ids(ink_before_close), "saved_ink_after_relaunch": ids(ink_after)},
           "WM_CLOSE to the control window while capturing and storing (no Stop pressed)"
           + (", and a second WM_CLOSE accepted by the same window right behind it" if isinstance(c_close.get("second_wm_close"), dict) and c_close["second_wm_close"].get("posted") is True
              else " (the second WM_CLOSE was not accepted: the window was already gone)")
           + ": the app ends the session itself ('the app was closed'), the stream is stopped on the service, the host ends and the app exits by itself "
           "within the bound; the ink written is saved")

quit_check("quit.relaunched_idle_page_close", "app-after-capturing", QUICK_MS, link("d_relaunched").get("state") == "stopped" and str((parsed("d_relaunched") or {}).get("session", "")).startswith("Not capturing") and close_facts("app-after-capturing")["via"] == "page" and kids("kids_d", "app-after-capturing") is not None and "wsl.exe" not in kids("kids_d"),
           {"status_before": link("d_relaunched")}, "relaunched after the close while capturing, not started again; the page's own close (the original QA-WIN-03 route): the app ends by itself")

e_ok = (link("e_stopped_now").get("state") == "stopped" and link("e_fail_now").get("state") == "not connected" and bool(s3) and s3.get("registered") is False and (s3.get("grant"), s3.get("final")) == ("requested_unknown", None))
quit_check("quit.unavailable_after_stop", "app-unavail", QUICK_MS, e_ok and close_facts("app-unavail").get("wm_close_posted") is True and by_user(manifest((s3 or {}).get("capture_session") or "-"), "app-unavail"),
           {"status_while_capturing": link("e_fail_now"), "status_before_close": link("e_stopped_now"), "stream": s3 and {k: s3.get(k) for k in ("grant", "registered", "final", "notes")}},
           "the test service unavailable; Start, write, ASK, Stop, then WM_CLOSE: the app ends by itself")

cap4 = (s4 or {}).get("capture_session")
ended4 = [l for l in manifest(cap4) if l.get("kind") == "ended"] if cap4 else []
f_ok = (link("f_fail_now").get("state") == "not connected" and bool(s4) and s4.get("registered") is False and by_close(ended4, "app-unavail-capturing")
        and close_facts("app-unavail-capturing").get("wm_close_posted") is True)
quit_check("quit.unavailable_while_capturing", "app-unavail-capturing", BOUND_MS, f_ok,
           {"status_before": link("f_fail_now"), "manifest_ended": ended4, "stream": s4 and {k: s4.get(k) for k in ("grant", "registered", "final", "notes")}},
           "the test service unavailable; WM_CLOSE while capturing (no Stop pressed): the app ends the session itself and exits by itself")

quit_check("quit.final_relaunch_close", "app-final", QUICK_MS, len(streams) == 4 and str((parsed("g_relaunched") or {}).get("session", "")).startswith("Not capturing") and kids("kids_g", "app-final") is not None and "wsl.exe" not in kids("kids_g"), {"status_before": link("g_relaunched")}, "the last relaunch, closed without a Start")

# ---------------------------------------------------------------- relaunch of the same profile without ending the previous app
launches = [s for s in steps if s.get("kind") == "launchApp"]
ended_by_qa = [s["i"] for s in steps if s.get("kind") == "endHungApp"] + [k for k, v in procs.items() if isinstance(v, dict) and (v.get("killed") or v.get("hung_after_close") or v.get("closed_in_finally"))]
reached = []
for s in launches:
    nxt = step(lambda x, i=s["i"]: x["i"] > i and x.get("kind") == "waitEval")  # waitDisplays: the new control page listed the displays
    key = next((k for k, v in procs.items() if isinstance(v, dict) and v.get("pid") == s.get("pid")), None)
    prev = s.get("previous") or {}
    reached.append({"launched": key, "pid": s.get("pid"), "ok": s["ok"], "control_page_ready": bool(nxt and nxt["ok"]), "previous": prev,
                    "gap_after_previous_exit_s": round(started[key] - exited[prev.get("key")], 2) if key in started and prev.get("key") in exited else None})
relaunch_ok = (len(launches) == 7 and not ended_by_qa and [(r["previous"].get("key"), r["previous"].get("pid"), r["launched"]) for r in reached] == [(a, (procs.get(a) or {}).get("pid"), b) for a, b in zip(APPS, APPS[1:])] and all(r["ok"] and r["control_page_ready"] and r["previous"].get("exit_code") == 0 and r["previous"].get("killed") is False
                                                             and r["pid"] != r["previous"].get("pid") and r["gap_after_previous_exit_s"] is not None and r["gap_after_previous_exit_s"] >= 0 for r in reached))
check("relaunch.same_profile_without_kill", "pass" if relaunch_ok else "fail", {"launches": reached, "ended_by_qa": ended_by_qa},
      "seven relaunches of the same user-data folder, each after the previous process ended by itself with code 0; each new control page came up")

# What each relaunch shows of the record, and that no host starts before a Start when every earlier stream is closed.
b_stop, c_re, d_re = link("b_stopped_now"), link("c_relaunched"), link("d_relaunched")
pre_start = {"app-main": hosts_between(started.get("app-main"), click_before("s1")), "app-capturing": hosts_between(started.get("app-capturing"), click_before("s2")),
             "app-after-capturing": life("app-after-capturing")}
stored2 = sum(j["records"] for j in committed2)
state_ok = (c_re.get("state") == "stopped" and c_re.get("stored") == b_stop.get("stored") and c_re.get("storing") is False and c_re.get("unknown") == 0 and c_re.get("not_sent") == 0 and d_re.get("not_sent") == 0
            and bool(ids(parsed("d_ink"))) and set(ids(parsed("d_ink"))) <= set(ids(parsed("g_ink")))
            and d_re.get("state") == "stopped" and d_re.get("stored") == stored2 and d_re.get("unknown") == 0 and d_re.get("storing") is False
            and all(v == [] for v in pre_start.values()) and ids(parsed("c_ink")) == ids(parsed("b_ink")) and parsed("b_ink") is not None
            and not [h for n in ("s1", "s2") for h in hosts if click_before(n) is not None and click_before(n) - CLOCK <= h["appeared"] < click_before(n) - SKEW]
            and all((parsed(n) or {}).get("unreadable") == 0 for n in ("b_ink", "c_ink", "d_ink", "g_ink"))
            and all(k in started and bool((parsed(n) or {}).get("at")) and ts(parsed(n)["at"]) >= started[k] for k, n in (("app-capturing", "c_relaunched"), ("app-after-capturing", "d_relaunched"))))
check("relaunch.record_and_ink_kept_no_host_before_start", "pass" if state_ok else "fail",
      {"after_stop": b_stop, "relaunched_after_stop": c_re, "relaunched_after_close_while_capturing": d_re, "stream2_committed_records": stored2,
       "hosts_before_a_start": pre_start, "saved_ink_before": ids(parsed("b_ink")), "saved_ink_after_relaunch": ids(parsed("c_ink"))},
      "each relaunch reads the stopped stream and its counts from the record, starts no host before a Start, and lists the same saved ink")

# Hosts the unavailable configuration starts at a relaunch for the earlier never-confirmed streams (the app's reconcile).
unavail_before_start = {"app-unavail": hosts_between(started.get("app-unavail"), click_before("s3")), "app-unavail-capturing": hosts_between(started.get("app-unavail-capturing"), click_before("s4")),
                        "app-final": life("app-final")}
seen_before_start = sum(len(v or []) for v in unavail_before_start.values())
check("relaunch.unavailable_hosts_before_a_start_observed", "fail" if any(v is None for v in unavail_before_start.values()) or not all(h.get("exited") and h["exited"] >= h["appeared"] for v in unavail_before_start.values() for h in v) else "limit",
      {"hosts_before_a_start": unavail_before_start, "status": {k: parsed(n) and {"l": parsed(n).get("l"), "line": parsed(n).get("line")} for k, n in (("app-unavail", "e_idle"), ("app-unavail-capturing", "f_relaunched"), ("app-final", "g_relaunched"))}},
      (f"observation, not judged: {seen_before_start} host(s) appeared after a relaunch and before any Start while earlier streams were never confirmed; each ended"
       if seen_before_start else "observation: the watcher (0.2 s poll) saw no host between a relaunch and a Start with the unavailable configuration; a host living under 0.2 s can be missed"))

# ---------------------------------------------------------------- originals stay as they were through closes, relaunches and the fault
order = [s["as"] for s in steps if s.get("kind") == "hashTree" and s.get("as")]
original = lambda rel: bool(re.match(r"^(captures/[^/]+/(frames/[0-9a-f]{64}\.png|ink/[0-9a-f]{64}\.json)|ink/context/[0-9a-f]{64}\.png)$", rel))  # never the app's *.tmp
first, changed, vanished, misnamed = {}, [], [], []
for label in order:
    tree = values.get(label) or {}
    for rel, f in tree.items():
        if not original(rel):
            continue
        if f == "vanished":
            vanished.append([label, rel])
            continue
        if os.path.splitext(os.path.basename(rel))[0] != f["sha256"]:
            misnamed.append([label, rel])
        if rel in first and first[rel] != (f["sha256"], f["bytes"]):
            changed.append([label, rel])
        first.setdefault(rel, (f["sha256"], f["bytes"]))
    for rel in first:
        full = (label.endswith(("-closed", "-recovered", "-stopped", "-relaunched", "-before-close", "-before-pause")) or label == "h_final")  # checkpoints that hash frames too
        if rel not in tree and (full or "/frames/" not in rel):
            vanished.append([label, rel])
manifests_grow = True
sizes = {}
for label in order:
    for rel, f in (values.get(label) or {}).items():
        if rel.endswith("manifest.jsonl") and f != "vanished":
            if rel in sizes and (f["bytes"] < sizes[rel][0] or (f["bytes"] == sizes[rel][0] and f["sha256"] != sizes[rel][1])):
                manifests_grow = False
            sizes[rel] = (f["bytes"], f["sha256"])
    if any((values.get(label) or {}).get(rel, "vanished") == "vanished" for rel in sizes):
        manifests_grow = False
check("originals.kept_through_closes_and_fault", "pass" if first and not changed and not vanished and not misnamed and manifests_grow and len(order) == sum(1 for p in planned if "hashTree" in p) > 0
      and order == [p.get("as") for p in planned if "hashTree" in p] and all(isinstance(values.get(l), dict) and values[l] for l in order) else "fail",
      {"checkpoints": len(order), "originals": len(first), "changed": changed, "vanished": vanished, "name_is_not_sha256": misnamed, "manifests_only_grow": manifests_grow},
      "at every planned checkpoint: each retained frame, ink original and context picture keeps its bytes (= its name) from first sight on; manifests only grow")

# ---------------------------------------------------------------- QA-WIN-04: header, link line, ASK card
STORING_CLAIM = re.compile(r"are also being stored|also stored|are being stored|is storing them", re.I)
NOT_STORED_CLAIM = re.compile(r"\bnot (?:be |been )?stored\b|n't (?:be |been )?stored|nothing was stored|\bfail(?:ed|s|ure)?\b|\blost\b", re.I)
STATE_WORDS = {"idle": "not connected yet (a connection is tried when you press Start)", "connecting": "connecting", "sending": "storing", "stalled": "not storing now (the frames are kept on this device)",
               "offline": "offline (the frames are kept on this device)", "stopping": "stopping: nothing new is sent", "stopped": "stopped", "not connected": "not connected (the frames stay on this device)",
               "ended by the service": "ended by the service", "reconciling": "checking earlier streams"}
EXTRA = (("unknown", "not known whether stored"), ("refused", "refused"), ("not_sent", "not sent (kept on this device)"), ("earlier_unknown", "earlier stream(s) whose end is not known"))


def link_line(l):
    """The link line as the app writes it from its status (apps/windows/src/renderer/control.ts, showLink)."""
    parts = [f"{l.get('stored')} record(s) stored"] + [f"{l.get(k)} {w}" for k, w in EXTRA if (l.get(k) or 0) > 0]
    return f"Capture storage (development): {STATE_WORDS.get(l.get('state'), l.get('state'))}. {'; '.join(parts)}.{' ' + l['detail'] + '.' if l.get('detail') else ''} AI: not connected."


HEADERS = {"off": "No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere.",
           "stopped": "Development mode: captured frames and ink are kept on this device. Further sends to the local test capture service on it have stopped; what the latest capture sent before is counted below. No AI is connected; nothing is sent to any AI.",
           True: "Development mode: captured frames and ink are kept on this device and are also being stored in a local test capture service on it; the counts are below. No AI is connected; nothing is sent to any AI.",
           False: "Development mode: captured frames and ink are kept on this device. A local test capture service on it is not storing them now; its state, and the latest capture's counts, are below. No AI is connected; nothing is sent to any AI."}
READS = ["n_off", "a_idle", "b_idle", "b_storing_now", "b_before_pause", "b_paused_8s", "b_stalled_now", "b_recovered_now", "b_pre_stop_now", "b_stopped_now", "c_relaunched",
         "c_storing_now", "d_relaunched", "e_idle", "e_fail_now", "e_with_card", "e_stopped_now", "f_relaunched", "f_fail_now", "g_relaunched"]
rows, bad = [], []
for name in READS:
    r = parsed(name)
    if r is None:
        bad.append([name, "not read"])
        continue
    l, header, line = r.get("l") or {}, r.get("ai") or "", r.get("line") or ""
    claims = bool(STORING_CLAIM.search(header))
    count = re.search(r"(\d+) record\(s\) stored", line)
    row = {"read": name, "at": r.get("at"), "mode": l.get("mode"), "state": l.get("state"), "storing": l.get("storing"), "stored": l.get("stored"), "unknown": l.get("unknown"),
           "not_sent": l.get("not_sent"), "earlier_unknown": l.get("earlier_unknown"), "detail": l.get("detail"), "header_says_storing": claims, "header": header, "line": line}
    rows.append(row)
    if not r.get("at") or not step_named(name) or abs(ts(r["at"]) - ts(step_named(name)["at"])) > CLOCK:
        bad.append([name, "the read's own time is not its step's time"])
    if "No AI is connected" not in header:
        bad.append([name, "the header does not say no AI is connected"])
    if header != HEADERS["off" if l.get("mode") != "development" else "stopped" if l.get("sends_stopped") else l.get("storing") is True]:
        bad.append([name, "the header is not the app's text for this link state"])
    if l.get("mode") == "development":
        if claims != (l.get("storing") is True):
            bad.append([name, "the header's storage claim differs from the link's storing flag"])
        if l.get("storing") is True and l.get("state") != "sending":
            bad.append([name, "storing is said in a state other than sending"])
        if not count or int(count.group(1)) != l.get("stored"):
            bad.append([name, "the line's stored count differs from the status"])
        if "AI: not connected" not in line:
            bad.append([name, "the line does not say the AI is not connected"])
        if NOT_STORED_CLAIM.search(header + " " + line):
            bad.append([name, "the copy asserts that something was not stored"])
        if r.get("hidden") is not False:
            bad.append([name, "the link line is hidden"])
        if line != link_line(l):
            bad.append([name, "the line is not the link status written out"])
        if l.get("storing") is not True and "not storing them now" not in header:
            bad.append([name, "the header does not say the service is not storing now"])
        if (": storing." in line) != (l.get("storing") is True):
            bad.append([name, "the line's state word differs from the link's storing flag"])
        unk = re.search(r"(\d+) not known whether stored", line)
        if (int(unk.group(1)) if unk else 0) != l.get("unknown"):
            bad.append([name, "the line's unknown count differs from the status"])
    elif claims or not r.get("hidden"):
        bad.append([name, "link off, but a storage claim or a link line is shown"])
check("copy.header_and_line_follow_the_link_state", "pass" if not bad and len(rows) == len(READS) else "fail", {"problems": bad, "reads": rows},
      "in all reads: the header says frames are being stored exactly when the link reports storing (state 'storing' only); the line's count is the status count; "
      "nothing asserts that a send was not stored; no AI is connected")

by = {r["read"]: r for r in rows}
g = lambda n: by.get(n, {})
expect = [
    ("idle", ["a_idle", "b_idle"], lambda r: r["state"] == "idle" and r["storing"] is False and "not connected yet" in r["line"] and "not storing them now" in r["header"]),
    ("storing", ["b_storing_now", "c_storing_now"], lambda r: r["state"] == "sending" and r["storing"] is True and ": storing." in r["line"] and r["stored"] >= 2 and r["unknown"] == 0),
    ("stopped", ["b_stopped_now", "c_relaunched", "d_relaunched"], lambda r: r["state"] == "stopped" and r["storing"] is False and ": stopped." in r["line"] and "not storing them now" in r["header"]),
    ("unavailable", ["e_fail_now", "e_with_card", "f_fail_now"], lambda r: r["state"] == "not connected" and r["storing"] is False and r["stored"] == 0 and "not connected (the frames stay on this device)" in r["line"]
     and "0 record(s) stored" in r["line"] and "without READY" in (r["detail"] or "") and "without READY" in r["line"] and "not storing them now" in r["header"]),
    ("unavailable_after_stop", ["e_stopped_now"], lambda r: r["state"] == "stopped" and r["storing"] is False and r["stored"] == 0 and "never confirmed registered" in (r["detail"] or "") and "never confirmed registered" in r["line"]),
]
states = {name: {n: (bool(g(n)) and bool(test(g(n)))) for n in reads} for name, reads, test in expect}
check("copy.each_state_reads_as_expected", "pass" if all(all(v.values()) for v in states.values()) else "fail",
      {"matches": states, "lines": {n: g(n).get("line") for _, reads, _ in expect for n in reads}},
      "idle: not connected yet; storing: counts; stopped; unavailable: not connected, 0 stored, the reason; after Stop while unavailable: the registration is not known")

# The lost reply: this run's own host paused (no answer to one send), then resumed.
paused = [e for e in watch if e["event"] == "paused"]
resumed = [e for e in watch if e["event"] == "resumed"]
host1 = [h for h in hosts if click_before("s1") is not None and h["appeared"] >= click_before("s1") - CLOCK and h["appeared"] <= ts(step_named("b_stopped")["at"]) + CLOCK] if step_named("b_stopped") else []
t_pause, t_resume = (ts(paused[0]["at"]) if paused else None), (ts(resumed[0]["at"]) if resumed else None)
t_stop1 = ts(step_named("b_stopped")["at"]) if step_named("b_stopped") else None
new_hosts_in_pause = [h for h in hosts if t_pause and t_stop1 and t_pause <= h["appeared"] <= t_stop1 + CLOCK]
# Exactly one host on each side, by PID: the session's host was stopped (state T), and that same PID was continued (it
# was still there and no longer stopped). An event that names no host, or another PID, establishes nothing.
session_pid = host1[0]["pid"] if len(host1) == 1 else None
paused_hosts = as_list(paused[0].get("hosts")) if len(paused) == 1 else []
resumed_hosts = as_list(resumed[0].get("hosts")) if len(resumed) == 1 else []
paused_ok = (session_pid is not None and len(paused_hosts) == 1 and paused_hosts[0].get("pid") == session_pid and paused_hosts[0].get("state_after") == "T")
resumed_ok = (session_pid is not None and len(resumed_hosts) == 1 and resumed_hosts[0].get("pid") == session_pid and resumed_hosts[0].get("continued") is True
              and not resumed_hosts[0].get("gone") and resumed_hosts[0].get("state_after") in ("R", "S", "D", "I"))
fault_ok = (len(paused) == 1 and len(resumed) == 1 and resumed[0].get("reason") == "the request was removed" and paused_ok and resumed_ok
            and t_pause is not None and t_resume is not None and t_pause < t_resume
            and not new_hosts_in_pause and t_stop1 is not None and host1[0]["exited"] is not None and host1[0]["exited"] > t_resume and host1[0]["exited"] >= t_stop1 - CLOCK
            and (step(lambda s: s.get("kind") == "hostPause") or {}).get("hosts") == 1
            and next((e for e in watch if e["event"] == "watch_start"), {}).get("already_there") == []
            and all(k and abs(t - ts(k["answered_at"])) <= CLOCK for t, k in ((t_pause, step(lambda s: s.get("kind") == "hostPause")), (t_resume, step(lambda s: s.get("kind") == "hostResume")))))
check("fault.only_this_runs_host_paused_and_resumed", "pass" if fault_ok else "fail",
      {"paused": paused, "resumed": resumed, "paused_for_s": round(t_resume - t_pause, 1) if t_pause and t_resume else None, "session_host": host1, "paused_is_the_session_host": paused_ok, "resumed_is_the_same_host_and_running": resumed_ok, "other_hosts_from_pause_to_stop": new_hosts_in_pause, "already_in_the_copy_at_watch_start": next((e for e in watch if e["event"] == "watch_start"), {}).get("already_there")},
      "exactly the session's one host (its working folder is this run's private Backend copy) was stopped and continued; it stayed the same process, so the "
      "recovery is a later answer from the same service, not a reconnect")

before, wait8, stalled, recovered = g("b_before_pause"), g("b_paused_8s"), g("b_stalled_now"), g("b_recovered_now")
t_change = ts(step(lambda s: s.get("kind") == "hostPause")["at"]) if step(lambda s: s.get("kind") == "hostPause") else None
t_stalled = ts(parsed("b_stalled")["at"]) if parsed("b_stalled") else None
res_step = step(lambda s: s.get("kind") == "hostResume")
t_res_step = ts(res_step["at"]) if res_step else None
t_res_answer = ts(res_step["answered_at"]) if res_step and res_step.get("answered_at") else None
stalled_ok = (stalled.get("state") == "stalled" and stalled.get("storing") is False and (stalled.get("unknown") or 0) >= 1 and "stored" in wait8 and stalled.get("stored") == wait8.get("stored")
              and wait8.get("stored", -1) >= before.get("stored", 0) and t_stalled is not None and abs(t_stalled - ts(stalled["at"])) <= CLOCK
              and "not storing now (the frames are kept on this device)" in stalled.get("line", "") and "not known whether stored" in stalled.get("line", "")
              and "not confirmed" in (stalled.get("detail") or "") and "not storing them now" in stalled.get("header", "") and not NOT_STORED_CLAIM.search(stalled.get("line", "") + " " + (stalled.get("detail") or "") + " " + stalled.get("header", ""))
              and "tried again" in (stalled.get("detail") or "") and f"{stalled.get('unknown')} not known whether stored" in stalled.get("line", "")
              and t_change is not None and t_res_step is not None and t_change < ts(stalled["at"]) < t_res_step and fault_ok
              and [j.get("status") for s in (coord("coord-stalled") or {}).get("streams", []) for j in s.get("jobs", []) if j.get("status") != "committed"] == ["unknown"] * (stalled.get("unknown") or 0))
check("copy.lost_reply_is_unconfirmed_not_failed", "pass" if stalled_ok else "fail",
      {"before_the_pause": {k: before.get(k) for k in ("state", "storing", "stored", "unknown")}, "8_s_into_the_pause": {k: wait8.get(k) for k in ("state", "storing", "stored", "unknown")}, "stalled": stalled, "seconds_from_pause_to_stalled": round(t_stalled - t_change, 1) if t_stalled and t_change else None},
      "after the send got no answer: 'not storing now', the stored count unchanged, the record counted as 'not known whether stored', the detail says storage is not confirmed and that it is tried again")
recovered_ok = (recovered.get("state") == "sending" and recovered.get("storing") is True and recovered.get("unknown") == 0 and recovered.get("not_sent") == 0
                and recovered.get("stored", 0) >= (stalled.get("stored") or 0) + (stalled.get("unknown") or 0) and stalled_ok and recovered.get("header_says_storing") is True and ": storing." in recovered.get("line", "") and "not known whether stored" not in recovered.get("line", "")
                and t_res_answer is not None and ts(recovered["at"]) > t_res_answer)
check("copy.later_answer_restores_storing", "pass" if recovered_ok else "fail",
      {"stalled": {k: stalled.get(k) for k in ("state", "storing", "stored", "unknown")}, "recovered": recovered,
       "seconds_from_resume_to_storing": round(ts(parsed("b_recovered")["at"]) - ts(step(lambda s: s.get("kind") == "hostResume")["answered_at"]), 1) if parsed("b_recovered") and step(lambda s: s.get("kind") == "hostResume") else None},
      "once the same host answers again: 'storing', nothing unknown, and the earlier unknown record(s) are now counted as stored")
rec8 = coord("coord-paused-8s")
waiting8 = [[j.get("key"), j.get("status")] for s in (rec8 or {}).get("streams", []) for j in s.get("jobs", []) if j.get("status") == "sending"
            and s.get("stream_id") == (s1 or {}).get("stream_id") and not s.get("final") and sum(x.get("records", 0) for x in s.get("jobs", []) if x.get("status") == "committed") == g("b_paused_8s").get("stored")]
to_stalled = round(t_stalled - t_change, 1) if t_stalled and t_change else None
in_pause8 = bool(wait8.get("at")) and bool(step_named("b_paused_8s")) and abs(ts(wait8["at"]) - ts(step_named("b_paused_8s")["at"])) <= CLOCK and t_change is not None and t_res_step is not None and t_change < ts(wait8["at"]) < t_res_step
said8 = wait8.get("header_says_storing") is True or ": storing." in wait8.get("line", "")
if wait8.get("storing") is True and said8 and in_pause8 and waiting8 and stalled_ok and wait8.get("stored") == before.get("stored") and to_stalled is not None and to_stalled > 0:
    lag = ("limit", f"observation, not judged here: 8 s into the pause the record held a send still out and the app still said 'storing' (its stored count unchanged); "
                    f"it said 'not storing now' {to_stalled} s after the pause")
elif wait8.get("storing") is False and not said8 and in_pause8:
    lag = ("pass", "8 s into the pause the app no longer said 'storing'")
else:
    lag = ("limit", "not established: the read 8 s into the pause could not be matched with a send that was out, or the later 'not storing now' was not seen (see the observed values)")
check("copy.says_storing_while_a_send_waits", lag[0],
      {"8_s_into_the_pause": {k: wait8.get(k) for k in ("state", "storing", "stored", "unknown", "header_says_storing", "line")}, "jobs_out_in_the_record_then": waiting8,
       "seconds_until_the_app_said_not_storing": to_stalled}, lag[1])

# The server holds each record once, and the app's final counts equal what the server holds.
rb1, srv1 = rb_stream(s1), server_stream(s1)
committed1 = [j for j in (s1 or {}).get("jobs", []) if j.get("status") == "committed"]
server_artifacts = {d["artifact"].get("id"): d["artifact"].get("sha256") for d in db_docs if d["kind"] == "artifact" and isinstance(d.get("artifact"), dict)}


def ink_evidence(stream, rb):
    """The ink-original comparisons of one stream against what had to be compared. Returns (problems, expected, compared).

    Expected, per committed job: the ink originals the app's record names for it, which must be exactly the ink originals
    the server's own records of that job name. Each must be compared exactly once in that job (none missing, repeated or
    unrelated), with server bytes = local bytes = the sha256 in the artifact's name = the artifact the server stores.
    A job whose records name no ink original needs none, and must have none.
    """
    problems, expected_n, compared_n = [], 0, 0
    if not stream or not rb:
        return ["no record or no readback of this stream"], 0, 0
    is_ink = lambda a: isinstance(a, str) and ".ink." in a
    records = [d["record"] for d in db_docs if d["kind"] == "capture_record" and isinstance(d.get("record"), dict) and d["record"].get("stream_id") == stream.get("stream_id")]
    plan = {j.get("key"): j for j in stream.get("jobs", []) if j.get("status") == "committed"}
    read = [j.get("key") for j in rb.get("jobs", [])]
    if sorted(read) != sorted(plan):
        problems.append(["the readback's jobs are not exactly the record's committed jobs", sorted(set(read) ^ set(plan)) or "repeated"])
    covered, seen_records = 0, []
    for key, job in plan.items():
        of_job = [r for r in records if isinstance(r.get("sequence"), int) and job.get("from") <= r["sequence"] <= job.get("through")]
        covered += len(of_job)
        seen_records.extend(id(r) for r in of_job)
        want = sorted({a for a in job.get("originals") or [] if is_ink(a)})
        on_server = sorted({a for r in of_job for a in r.get("artifacts") or [] if is_ink(a)})
        if len(of_job) != job.get("records") or want != on_server or sorted(set(job.get("originals") or [])) != sorted({a for r in of_job for a in r.get("artifacts") or []}):
            problems.append([key, "the record and the server's records name different ink originals", {"record": want, "server": on_server, "server_records": len(of_job)}])
        expected_n += len(want)
        got = [o for j in rb.get("jobs", []) if j.get("key") == key for o in as_list(j.get("ink_originals"))]
        compared_n += len(got)
        names = sorted(str(o.get("artifact_id")) for o in got)
        if names != want:
            problems.append([key, "ink comparisons missing, repeated or unrelated", {"expected": want, "compared": names}])
        for o in got:
            name = str(o.get("artifact_id"))
            sha = name.rsplit(".ink.", 1)[1] if ".ink." in name else None
            if not (sha and re.fullmatch(r"[0-9a-f]{64}", sha) and o.get("server_sha256") == o.get("local_sha256") == sha == server_artifacts.get(name)):
                problems.append([key, "ink bytes are not shown equal", {"artifact": name, "server": o.get("server_sha256"), "local": o.get("local_sha256"), "stored_artifact": server_artifacts.get(name)}])
    if len(set(seen_records)) != len(seen_records) or covered != len(records) or len(records) != rb.get("server_records") or rb.get("records_read") != rb.get("server_records"):
        problems.append(["the server's records of this stream are not all covered by the jobs and read back", {"server": len(records), "in_jobs": covered, "read": rb.get("records_read")}])
    if not all(j.get("server_receipt") is True for j in rb.get("jobs", [])) or sorted(plan) != sorted(json.loads(d["key"])[-1] for d in db_docs if d["kind"] == "capture_replay" and json.loads(d["key"])[-1].startswith(str(stream.get("source_id")) + ".")):
        problems.append(["a committed job has no receipt on the server"])
    if not all(server_artifacts.get(a) == str(a).rsplit(".", 1)[-1] for r in records for a in r.get("artifacts") or []):
        problems.append(["a record names an artifact the server does not store under its hash"])
    # Pictures: the readback counts its raw/composed comparisons; every server frame has at least its raw picture.
    with_frame = sum(1 for r in records if r.get("frame_id"))
    if not isinstance(rb.get("frames_compared"), int) or rb["frames_compared"] < max(with_frame, 1):
        problems.append(["fewer picture comparisons than the server holds frames", {"frames_on_server": with_frame, "compared": rb.get("frames_compared")}])
    return problems, expected_n, compared_n


ink1, ink2 = ink_evidence(s1, rb_stream(s1)), ink_evidence(s2, rb_stream(s2))
open_jobs = [[s.get("stream_id"), j.get("key"), j.get("status")] for s in streams for j in s.get("jobs", []) if j.get("status") != "committed"]
record_ids = [d["record"].get("record_id") for d in db_docs if d["kind"] == "capture_record"]
counts_ok = (bool(rb1) and bool(rb2) and rb1["server_records"] == sum(j["records"] for j in committed1) == b_stop.get("stored") and b_stop.get("unknown") == 0 and b_stop.get("not_sent") == 0
             and rb2["server_records"] == stored2 and rb1["mismatches"] == [] and rb2["mismatches"] == [] and d_re.get("stored") == stored2 and d_re.get("unknown") == 0 and d_re.get("not_sent") == 0
             and readback["database"].get("by_kind") == {k: sum(1 for d in db_docs if d["kind"] == k) for k in {d["kind"] for d in db_docs}}
             and all((rb_stream(s) or {}).get("server_records") == 0 and (rb_stream(s) or {}).get("mismatches") == [] for s in (s3, s4))
             and len(server_artifacts) == sum(1 for d in db_docs if d["kind"] == "artifact")
             and rb1["frames_compared"] > 0 and rb2["frames_compared"] > 0
             and not open_jobs and len(record_ids) == len(set(record_ids)) == rb1["server_records"] + rb2["server_records"] and bool(srv1) and srv1.get("state") == "stopped"
             and not ink1[0] and not ink2[0] and ink1[1] == ink1[2] and ink2[1] == ink2[2]
             and bool(s3) and bool(s4) and bool(s3.get("stream_id")) and bool(s4.get("stream_id")) and len(streams) == 4
             and bool(s3.get("source_id")) and bool(s4.get("source_id"))
             and "app-unavail" in started and all(ts(d["created_at"]) < started["app-unavail"] for d in db_docs)
             and bool(readback.get("at")) and bool(exited) and ts(readback["at"]) >= max(exited.values()) - CLOCK and len(readback.get("streams", [])) == len(streams)
             and all(s.get("planned_through") == max([j.get("through") for j in s.get("jobs", [])] or [0]) for s in streams)
             and sorted(d["key"] for d in db_docs if d["kind"] == "raw_capture_frame") == sorted(str(d["record"].get("frame_id")) for d in db_docs if d["kind"] == "capture_record")
             and sorted(json.loads(d["key"])[1:] for d in db_docs if d["kind"] == "capture_slot") == sorted([d["record"].get("stream_id"), d["record"].get("sequence")] for d in db_docs if d["kind"] == "capture_record")
             and sum(j.get("records", 0) for s in streams for j in s.get("jobs", []) if j.get("status") == "committed") == len(record_ids)
             and not [d for d in db_docs if any(x in json.dumps(d) for x in (s3["stream_id"], s4["stream_id"], s3["source_id"], s4["source_id"]))])
check("counts.final_counts_equal_the_server_once_each", "pass" if counts_ok else "fail",
      {"stream1": {"status_stored": b_stop.get("stored"), "committed_records": sum(j["records"] for j in committed1), "server_records": rb1 and rb1["server_records"], "server_stream": srv1,
                   "frames_compared": rb1 and rb1["frames_compared"], "mismatches": rb1 and rb1["mismatches"]},
       "stream2": {"status_stored_after_relaunch": d_re.get("stored"), "committed_records": stored2, "server_records": rb2 and rb2["server_records"], "server_stream": srv2,
                   "frames_compared": rb2 and rb2["frames_compared"], "mismatches": rb2 and rb2["mismatches"]},
       "ink_originals": {"stream1": {"expected": ink1[1], "compared": ink1[2], "problems": ink1[0]}, "stream2": {"expected": ink2[1], "compared": ink2[2], "problems": ink2[0]}},
       "jobs_not_committed": open_jobs, "server_capture_records": len(record_ids), "distinct": len(set(record_ids)),
       "unavailable_streams_on_server": [d["key"] for d in db_docs if d["kind"] == "control_stream" and d["key"] in {(s3 or {}).get("stream_id"), (s4 or {}).get("stream_id")}]},
      "the server holds every record exactly once and the app's stored counts equal the server's; in both streams every ink original that the record and the "
      "server's records name for a job is compared exactly once, with server bytes = local bytes = its name = the stored artifact; the readback reports no "
      "raw/composed picture mismatch over at least one comparison per server frame; the unavailable streams left nothing on the server")

# The ASK card: conditional wording in every state, and one open card unchanged through the fault and its recovery.
CARDS = ["card_open", "card_paused", "card_stalled", "card_recovered", "card_unavail"]
cards = {n: parsed(n) for n in CARDS}
first_line = lambda c: (c or {}).get("text", "").split("\n")[0]
card_bad = []
for n, c in cards.items():
    if c is None:
        card_bad.append([n, "not read"])
        continue
    t = first_line(c)
    if c.get("shown") is not True:
        card_bad.append([n, "the card is not shown"])
    if not c.get("at") or not step_named(n) or abs(ts(c["at"]) - ts(step_named(n)["at"])) > CLOCK:
        card_bad.append([n, "the card read's own time is not its step's time"])
    if not t.startswith("No AI is connected: this selection was not sent to any AI."):
        card_bad.append([n, "the card does not say no AI is connected"])
    if not c.get("text") or "".join((c.get("card_all_text") or "").split()) != "".join(("×Selection · no AI connected" + c["text"]).split()):
        card_bad.append([n, "the whole card text was not read, or is not the title and this text"])
    if STORING_CLAIM.search(c.get("card_all_text", "")) or re.search(r"\bstored\b", c.get("card_all_text", ""), re.I):
        card_bad.append([n, "the card asserts that frames are stored"])
    if "may also store" not in t or "only while it is connected and answering" not in t:
        card_bad.append([n, "the card's storage sentence is not conditional"])
    if "No AI is connected" not in (c.get("hint") or ""):
        card_bad.append([n, "the hint does not say no AI is connected"])
same_wording = len({re.sub(r"\d+", "#", c.get("text", "")) for c in cards.values() if c}) == 1
card_states = [(g("b_before_pause").get("state"), g("b_before_pause").get("storing")), (wait8.get("state"), wait8.get("storing")), (stalled.get("state"), stalled.get("storing")),
               (recovered.get("state"), recovered.get("storing")), (g("e_with_card").get("state"), g("e_with_card").get("storing"))]
states_ok = card_states == [("sending", True), ("sending", True), ("stalled", False), ("sending", True), ("not connected", False)]
check("copy.ask_card_conditional_in_every_state", "pass" if not card_bad and same_wording and states_ok and len({re.sub(r"\d+", "#", (c or {}).get("hint") or "") for c in cards.values()}) == 1 else "fail",
      {"problems": card_bad, "same_first_line_in_all_states": same_wording, "first_line": first_line(cards.get("card_open")),
       "link_state_at_each_read": {"card_open": g("b_before_pause").get("state"), "card_paused": wait8.get("state"), "card_stalled": stalled.get("state"),
                                   "card_recovered": recovered.get("state"), "card_unavail": g("e_with_card").get("state")}},
      "storing, waiting, not storing, storing again, and unavailable: the card says no AI is connected and that the test service MAY also store frames only "
      "while connected and answering; it never says they are stored")
through = [cards.get(n) for n in ("card_open", "card_paused", "card_stalled", "card_recovered")]
closed, cont = parsed("ov_b_card_closed"), parsed("saved_b-continued")
ink_file = lambda label: {k: v["sha256"] for k, v in (values.get(label) or {}).items() if re.match(r"^ink/[^/]+\.json$|^ink/context/[0-9a-f]{64}\.png$", k) and v != "vanished"}
intact_ok = (all(through) and len({(c["text"], c.get("card_all_text"), c["crop_sha256"], c["crop_chars"], c["revision"], c["mode"], c["shown"], c["crop_is_png"]) for c in through}) == 1 and through[0]["crop_is_png"] and through[0]["shown"] is True
             and t_change is not None and t_stalled is not None and t_res_answer is not None and parsed("b_recovered") is not None
             and ts(through[0]["at"]) < t_change < ts(through[1]["at"]) < t_stalled <= ts(through[2]["at"]) < t_res_answer < ts(parsed("b_recovered")["at"]) <= ts(through[3]["at"])
             and any(re.match(r"^ink/[^/]+\.json$", k) for k in ink_file("h_b-before-pause")) and any(k.startswith("ink/context/") for k in ink_file("h_b-before-pause")) and through[0]["crop_chars"] > 1000
             and bool(closed) and closed.get("card") is False and closed.get("mode") == "WRITE" and bool(cont) and cont["doc"]["revision"] == through[0]["revision"] + 1 and cont["doc"].get("id") == (s1 or {}).get("capture_session") and (cont["doc"].get("history") or [])[-1:] == ["add"]
             and bool(ink_file("h_b-before-pause")) and ink_file("h_b-before-pause") == ink_file("h_b-recovered"))
check("card.open_card_unchanged_through_fault_and_recovery", "pass" if intact_ok else "fail",
      {"reads": [c and {k: c.get(k) for k in ("at", "shown", "mode", "revision", "crop_sha256", "crop_chars", "crop_is_png")} for c in through],
       "same_text": len({c["text"] for c in through if c}) == 1, "after_close": closed and {k: closed.get(k) for k in ("mode", "card")},
       "ink_revision_after_writing_on": cont and cont["doc"]["revision"], "saved_ink_and_context_files_unchanged": ink_file("h_b-before-pause") == ink_file("h_b-recovered")},
      "one card left open from before the pause until after the recovery: the same text, the same selected picture (hashed in the page) and the same ink revision; "
      "closing it returns to WRITE and the next stroke is revision + 1; the saved ink and its context pictures are unchanged")

# ---------------------------------------------------------------- release
wsl_left = [w for w in as_list(results.get("wsl_seen")) if w.get("running_at_end")]
remaining = next((e.get("remaining") for e in reversed(watch) if e["event"] == "watch_end"), None)
watch_started = next((ts(e["at"]) for e in watch if e["event"] == "watch_start"), None)
all_self = {k: self_exit(k) for k in APPS}
wsl_seen = as_list(results.get("wsl_seen"))
wsl_kids = {k.get("pid") for v in values.values() if isinstance(v, dict) for k in as_list(v.get("children")) if isinstance(k, dict) and k.get("name") == "wsl.exe"}
seen_ok = (len(host1) == 1 and len(host2) == 1 and len(wsl_seen) >= 1 and all(isinstance(w, dict) and w.get("running_at_end") is False for w in wsl_seen)
           and wsl_kids <= {w.get("pid") for w in wsl_seen if isinstance(w, dict)} and watch_to is not None and all(t <= watch_to + CLOCK for t in exited.values()))  # "none left" needs something seen
check("release.owned_processes_ended_by_themselves", "pass" if all(all_self.values()) and seen_ok and not wsl_left and remaining == [] and watch_started is not None and "app-idle" in started
      and watch_started <= started["app-idle"] and all(h["exited"] is not None and h["exited"] >= h["appeared"] for h in hosts) else "fail",
      {"apps": {k: {x: (procs.get(k) or {}).get(x) for x in ("pid", "exited", "exit_code", "exit_ms", "killed")} for k in APPS}, "wsl_exe_seen": as_list(results.get("wsl_seen")),
       "hosts_seen": len(hosts), "both_session_hosts_and_a_wsl_child_were_seen": seen_ok, "hosts_remaining_at_watch_end": remaining},
      "all eight app processes ended by themselves with code 0; no wsl.exe child and no host of this run remains")
check("database.readback_read_only", "pass" if readback and readback.get("database_unchanged_by_readback") is True and readback["database"].get("actor_row") is True and readback.get("actor") == ((final_coord or {}).get("actor") or {}).get("user_id") else "fail",
      {"by_kind": (readback or {}).get("database", {}).get("by_kind"), "unchanged": (readback or {}).get("database_unchanged_by_readback")})

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
        for pattern in (r"C:\\+Users\\+[^\\\"]+", r"C:/Users/[^/\"]+", r"/mnt/c/Users/[^/\"]+"):
            text = re.sub(pattern, "<home>", text)
        if re.search(r"Users(\\+|/)(?!<)", text.replace("<home>", "")) or re.search(r"dbname=|password|database_dsn|\"token\"", text):
            raise SystemExit("a profile path or secret-like text survived redaction")
        return text + "\n"

    def write(name, value):
        with open(os.path.join(EVIDENCE, name), "w", encoding="utf-8") as f:
            f.write(redact(value))

    big = {k for k in values if k.startswith("h_") or k.endswith("_timeline")}
    write("summary.json", {"counts": counts, "checks": checks})
    write("runner-results.json", dict(results, values={k: v for k, v in values.items() if k not in big}))
    write("hash-checkpoints.json", {k: values[k] for k in order if k in values})
    if final_coord:
        write("coordination-final.json", final_coord)
    for label in ("coord-paused-8s", "coord-stalled"):
        if coord(label):
            write(f"coordination-{label[6:]}.json", coord(label))
    write("manifest-ends.json", {cap: [l for l in manifest(cap) if l.get("kind") in ("header", "ended")] for cap in sorted(os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(RUN, "captures", "*", "manifest.jsonl")))})
    write("host-watch.json", watch)
    write("preflight.json", preflight)
    if readback:
        write("database-readback.json", readback)
    write("steps.json", planned)
    write("run.json", load(os.path.join(RUN, "run.json")))
