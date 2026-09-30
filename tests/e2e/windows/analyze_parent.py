#!/usr/bin/env python3
"""Checks one QA run of the 'parent' scenario (tests/e2e/windows/run.mjs parent <out>) at c4c84a5.

Usage: python3 analyze_parent.py <run out dir> [<evidence dir>]

Inputs: the runner results, the app's copied coordination record and captures, the WSL host watcher log, the helper's
preflight and its read-only database readback (qa_parent_db.py readback, run after every host exited). App reads are
the app's own claims; they are checked against its files, the Windows child-process listing, the WSL host watcher and
the test database. Strokes are DevTools-injected pen events (synthetic). Statuses: pass / fail / limit / blocked.
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


CLOCK = 2.0  # tolerance between the Windows (runner) and WSL (watcher, database) clocks, seconds


results = load(os.path.join(RUN, "out", "results.json"))
values, steps = results["values"], results["steps"]
parsed = lambda k: json.loads(values[k]) if isinstance(values.get(k), str) else values.get(k)
as_list = lambda v: [] if v is None else (v if isinstance(v, list) else [v])
preflight = load(os.path.join(RUN, "preflight.json"))
readback = load(os.path.join(RUN, "readback.json")) if os.path.exists(os.path.join(RUN, "readback.json")) else None
watch = [json.loads(l) for l in open(os.path.join(RUN, "host-watch.jsonl"), encoding="utf-8")] if os.path.exists(os.path.join(RUN, "host-watch.jsonl")) else []
coord = lambda label: load(os.path.join(RUN, "out", f"copy-{label}", "coordination.json")) if os.path.exists(os.path.join(RUN, "out", f"copy-{label}", "coordination.json")) else None
final_coord = load(os.path.join(RUN, "capture-host", "coordination.json"))
actor = preflight["actor"]["user_id"]
step_at = {s.get("as"): s["at"] for s in steps if s.get("as")}
procs = results["processes"]


def step_time(pred):
    return next((ts(s["at"]) for s in steps if pred(s)), None)


def kids(label):
    return [k["name"] for k in as_list((values.get(label) or {}).get("children"))]


def snap(label):
    files = sorted(glob.glob(os.path.join(RUN, "out", f"snap-{label}", "*.json")))
    return [load(f) for f in files]


def manifest(cap):
    path = os.path.join(RUN, "captures", cap, "manifest.jsonl")
    return [json.loads(l) for l in open(path, encoding="utf-8")] if os.path.exists(path) else []


# ---------------------------------------------------------------- run integrity
foreign = as_list(results.get("foreign", {}).get("start")) + as_list(results.get("foreign", {}).get("end")) + \
    [f for s in steps if s.get("kind") == "desktopShot" for f in as_list(s.get("foreign"))]
contaminated = bool(foreign)
check("run.shared_desktop_quiet", "fail" if contaminated else "pass", {"foreign_electron_seen": foreign},
      "no other Electron app at start, at each screenshot and at the end (point-in-time)")
failed = [(s["i"], s.get("kind"), s.get("as"), s.get("error")) for s in steps if not s["ok"]]
check("run.completed", "pass" if not results.get("aborted") and not failed else ("limit" if not results.get("aborted") else "fail"),
      {"aborted": results.get("aborted"), "failed_steps": failed}, "optional status waits that timed out are listed, not hidden")
cursor = [tuple(c) for c in [results.get("cursor", {}).get("start"), results.get("cursor", {}).get("end")] + [s.get("cursor") for s in steps if s.get("kind") == "desktopShot"] if c]
check("run.cursor_static", "pass" if cursor and len(set(cursor)) == 1 else "limit", {"positions_px": sorted(set(cursor))})

# ---------------------------------------------------------------- host lifetime (WSL watcher) and Windows children
appear = [(ts(e["at"]), e["pid"]) for e in watch if e["event"] == "appear"]
exits = {e["pid"]: ts(e["at"]) for e in watch if e["event"] == "exit"}
hosts = [{"pid": pid, "appeared": t, "exited": exits.get(pid)} for t, pid in appear]
t_link_launch = ts(procs["app-link"]["started_at"])
t_s1 = step_time(lambda s: s.get("as") == "s1")
t_stop1 = step_time(lambda s: s.get("as") == "stopped1")
t_close1 = ts(procs["app-link"]["exited_at"]) if procs.get("app-link", {}).get("exited_at") else None
t_relaunch = ts(procs["app-relaunch"]["started_at"])
t_s2 = step_time(lambda s: s.get("as") == "s2")
t_close2 = ts(procs["app-relaunch"]["exited_at"]) if procs.get("app-relaunch", {}).get("exited_at") else None
t_fail = ts(procs["app-fail"]["started_at"])
t_s3 = step_time(lambda s: s.get("as") == "s3")
in_window = lambda a, b: [h for h in hosts if a - CLOCK <= h["appeared"] <= b + CLOCK] if a is not None and b is not None else None
# Hosts that appeared strictly before a moment (with the clock tolerance on the safe side: never counting a host that a
# step at that moment itself started).
before = lambda a, t: [h for h in hosts if a - CLOCK <= h["appeared"] < t - CLOCK] if a is not None and t is not None else None


def click_before(label):
    """The Start click: the step right before the running wait `label` (startSession = click, running, ...)."""
    i = next((s["i"] for s in steps if s.get("as") == label), None)
    prior = next((s for s in steps if i is not None and s["i"] == i - 1), None)
    return ts(prior["at"]) if prior else None

# ---------------------------------------------------------------- 1. default off, then explicitly enabled; nothing before Start
off, off_run, idle = parsed("link_off"), parsed("link_off_running"), parsed("link_idle")
off_ok = (off["l"]["mode"] == "off" and off["hidden"] and off_run["l"]["mode"] == "off" and "nothing is sent anywhere" in off["ai"]
          and not [k for k in (values.get("h_off0") or {}) if k.startswith("capture-host")] and not [k for k in (values.get("h_off1") or {}) if k.startswith("capture-host")]
          and "wsl.exe" not in kids("kids_off0") + kids("kids_off1") and not [h for h in hosts if h["appeared"] < t_link_launch])
s0_caps = sorted({k.split("/")[1] for k in (values.get("h_off1") or {}) if k.startswith("captures/") and k.endswith("manifest.jsonl")})
s0_retained = sum(1 for cap in s0_caps for line in manifest(cap) if line.get("kind") == "retained")
check("link.default_off_local_only", "pass" if off_ok and s0_retained > 0 else "fail",
      {"status": off["l"], "link_line_hidden": off["hidden"], "header": off["ai"], "status_while_capturing": off_run["l"],
       "capture_host_folder": False, "wsl_children": [], "hosts_before_link_launch": [h for h in hosts if h["appeared"] < t_link_launch],
       "local_retained_frames_in_default_session": s0_retained},
      "without the development configuration: link off, default header, capture retained locally, no host and no link record")
seed = values.get("seed") or {}
pre = values.get("h_pre-start") or {}
db_docs = (readback or {}).get("database", {}).get("documents", [])
before_start = [d for d in db_docs if t_s1 and ts(d["created_at"]) < t_s1 - CLOCK]
check("link.enabled_nothing_before_start", "pass" if (idle["l"]["mode"] == "development" and idle["l"]["state"] == "idle" and idle["l"]["stored"] == 0
      and (pre.get("capture-host/coordination.json") or {}).get("sha256") == seed.get("sha256") and "wsl.exe" not in kids("kids_pre")
      and not before(t_link_launch, click_before("s1")) and preflight.get("pristine") and not before_start) else "fail",
      {"status": idle["l"], "header": idle["ai"], "record_is_seed": (pre.get("capture-host/coordination.json") or {}).get("sha256") == seed.get("sha256"),
       "wsl_children": kids("kids_pre"), "hosts_before_start": before(t_link_launch, click_before("s1")),
       "database_documents_before_start": len(before_start), "actor_pristine_at_preflight": preflight.get("pristine")},
      "with the development configuration, before Start: idle, the QA-seeded record untouched, no host, no grant and no documents")

# ---------------------------------------------------------------- 2. Start, automatic retained frames, local test service storage
streams = final_coord["streams"]
st1 = streams[0] if streams else None
rb = {s["stream_id"]: s for s in (readback or {}).get("streams", [])}
cap1 = None
if st1:
    cands = [c for c in sorted({k.split("/")[1] for k in (values.get("h_stopped1") or {}) if k.startswith("captures/") and k.endswith("manifest.jsonl")}) if c not in s0_caps]
    cap1 = cands[0] if cands else None
m1 = manifest(cap1) if cap1 else []
retained1 = [l for l in m1 if l.get("kind") == "retained"]
retained_times = [ts(l["sampled_at"]) for l in retained1]
# Each change's window runs from the step that made it to the app read after it (never into the next change).
def window_for(label, action_pred):
    view = next((s for s in steps if s.get("as") == f"app_{label}"), None)
    act = next((s for s in reversed([x for x in steps if view and x["i"] < view["i"]]) if action_pred(s)), None)
    return (ts(act["at"]), ts(view["at"])) if act and view else (None, None)
change_actions = {
    "c1-panel": lambda s: s.get("kind") == "eval" and s.get("target") == "edge",
    "c2-console": lambda s: s.get("kind") == "window" and s.get("window") == "console",
    "c3-scroll": lambda s: s.get("kind") == "eval" and s.get("target") == "edge",
    "c4-back": lambda s: s.get("kind") == "eval" and s.get("target") == "edge",
}
per_change = {}
for label, pred in change_actions.items():
    a, b = window_for(label, pred)
    per_change[label] = sum(1 for t in retained_times if a is not None and a - CLOCK <= t <= b + CLOCK)
distinct_raw = len({l["raw"]["sha256"] for l in retained1 if ts(l["sampled_at"]) <= (step_time(lambda s: s.get("as") == "app_c4-back") or 0)})
jobs1 = st1["jobs"] if st1 else []
committed1 = sum(j["records"] for j in jobs1 if j["status"] == "committed")
rb1 = rb.get(st1["stream_id"]) if st1 else None
records1 = [d for d in db_docs if d["kind"] == "capture_record" and d.get("record", {}).get("source", {}).get("source_id") == (st1 or {}).get("source_id")]
by_sample = {l["sample_seq"]: l for l in retained1}
latency = sorted(ts(d["created_at"]) - ts(by_sample[int(d["record"]["frame_id"].rsplit(".f", 1)[1])]["sampled_at"]) for d in records1
                 if d["record"].get("frame_id") and int(d["record"]["frame_id"].rsplit(".f", 1)[1]) in by_sample)
gaps = {k: sum(1 for l in m1 if l.get("kind") == k) for k in ("gap", "not_retained", "refused", "unfinished", "ended")}
ok_store = (st1 and parsed("link_sending") and "wsl.exe" in kids("kids_s1") and in_window(t_s1 - 1, t_stop1 or t_s1) and len(retained1) >= 5
            and distinct_raw >= 4 and all(v >= 1 for v in per_change.values()) and rb1 and committed1 > 0 and rb1["server_records"] >= committed1
            and rb1["frames_compared"] > 0 and not rb1["mismatches"] and sum(len(j["ink_originals"]) for j in rb1["jobs"]) >= 1
            and all(o["server_sha256"] == o["local_sha256"] for j in rb1["jobs"] for o in j["ink_originals"]))
check("storage.start_automatic_frames_and_server_originals", "blocked" if contaminated else ("pass" if ok_store else "fail"),
      {"stream": {k: (st1 or {}).get(k) for k in ("stream_id", "source_id", "grant", "final", "planned_through")},
       "registration_continuity": ((st1 or {}).get("registration") or {}).get("continuity"), "wsl_children_at_start": kids("kids_s1"),
       "hosts_during_session": in_window(t_s1 - 1, t_stop1 or t_s1), "retained_frames": len(retained1), "retained_per_change_window": per_change,
       "distinct_raw_frames_through_changes": distinct_raw, "manifest_events": gaps, "jobs": [{k: j[k] for k in ("key", "status", "records")} for j in jobs1],
       "records_committed_by_app": committed1, "server_records": (rb1 or {}).get("server_records"), "server_frames_compared_raw_and_composed": (rb1 or {}).get("frames_compared"),
       "server_mismatches": (rb1 or {}).get("mismatches"), "ink_originals_compared": sum(len(j["ink_originals"]) for j in (rb1 or {}).get("jobs", [])),
       "sample_to_server_latency_s": {"n": len(latency), "min": round(latency[0], 2), "median": round(latency[len(latency) // 2], 2), "max": round(latency[-1], 2)} if latency else None},
      "explicit Start on the visible course (no import, no region selection); every change produced retained whole-display frames without any selection; "
      "the local test service holds records for what the app counts as stored, and its raw PNG, composed PNG and editable ink bytes equal the local originals (sha256)")

# ---------------------------------------------------------------- 3. ink loop on the linked session
H = {k: (snap(k) or [None])[-1] for k in ("write", "erase", "undo", "redo", "ask-done", "continued", "stopped1", "reopened2", "reopen-edit", "stopped2")}
ops = lambda d: [h["op"] for h in d["ink"]["history"]] if d else None
want = {"write": ["add"] * 3}
want["erase"] = want["write"] + ["erase"]
want["undo"] = want["erase"] + ["undo"]
want["redo"] = want["undo"] + ["redo"]
want["ask-done"] = want["redo"]
want["continued"] = want["redo"] + ["add"]
card = parsed("askCard") or {}
ov = lambda k: parsed(f"ov_{k}") or {}
no_card_after_strokes = all(not ov(k).get("card") for k in ("write", "erase", "undo", "redo", "continued"))
loop_ok = (all(ops(H[k]) == want[k] for k in want) and card.get("revision") == 6 and "No AI is connected" in card.get("text", "")
           and ov("ask_finished").get("mode") == "WRITE" and ov("ask_cancelled").get("mode") == "WRITE" and no_card_after_strokes
           and "AI: not connected" in (parsed("link_pre_stop_now") or {}).get("line", ""))
check("ink.loop_on_linked_session", "pass" if loop_ok else "fail",
      {"history": {k: ops(H[k]) for k in want}, "ask_card": card.get("text", "")[:260], "modes_after_ask": [ov("ask_finished").get("mode"), ov("ask_cancelled").get("mode")],
       "card_after_plain_strokes": not no_card_after_strokes, "link_line": (parsed("link_pre_stop_now") or {}).get("line")},
      "WRITE, partial erase, undo, redo, ASK finish and cancel back to WRITE, continue: exact history; no stroke produced an answer; no AI is stated")
order = [s["as"] for s in steps if s.get("kind") == "hashTree"]
first, changed = {}, []
for k in order:
    for rel, meta in (values.get(k) or {}).items():
        if meta == "vanished" or not re.match(r"^captures/[^/]+/(ink/[0-9a-f]{64}\.json|frames/[0-9a-f]{64}\.png)$", rel):
            continue
        if rel in first and first[rel] != meta["sha256"]:
            changed.append((k, rel))
        first.setdefault(rel, meta["sha256"])
check("originals.immutable_locally", "pass" if first and not changed else "fail", {"checkpoints": len(order), "originals": len(first), "changed": changed[:10]},
      "every retained frame PNG and frame-bound ink original keeps its bytes from first sight through Stop, relaunch, reopen and the failure")

# ---------------------------------------------------------------- 4. Stop
latched, stopped1, ls1 = parsed("link_stop_latched") or {}, parsed("stopped1") or {}, parsed("link_stopped1") or {}
events1 = parsed("link_events1") or []
states1 = [e["state"] for e in events1 if e.get("mode") == "development"]
db_stream1 = next((d.get("stream") for d in db_docs if d["kind"] == "control_stream" and d["key"] == (st1 or {}).get("stream_id")), None)
host1 = [h for h in in_window(t_s1 - 1, t_stop1 or t_s1)]
host1_exit = [h for h in host1 if h["exited"] and t_close1 and h["exited"] <= t_close1]
# The first retained frame is wire sequence 2 (job b2-2 carries it), so planned_through - 1 frames were planned.
unplanned1 = max(0, len(retained1) - max(0, (st1 or {}).get("planned_through", 0) - 1))
stop_ok = (st1 and latched.get("l", {}).get("state") in ("stopping", "stopped") and "stopping" in states1 and ls1.get("l", {}).get("state") == "stopped"
           and st1["final"] == "stopped" and st1["stops"] and st1["stops"][0]["outcome"] == "stopped" and db_stream1 and db_stream1["state"] == "stopped"
           and db_stream1["pre_stop_sequence"] is None and "wsl.exe" not in kids("kids_stopped1") and host1 and len(host1_exit) == len(host1)
           and any("host ended" in n for n in st1["notes"]))
check("stop.latch_host_end_and_server_state", "pass" if stop_ok else "fail",
      {"status_right_after_click": latched.get("l"), "status_sequence": states1, "ended": stopped1.get("ended"), "final_status": ls1.get("l"),
       "stops": st1 and st1["stops"], "server_stream": db_stream1, "notes": st1 and st1["notes"], "hosts": host1, "wsl_children_after": kids("kids_stopped1"),
       "retained_frames_never_planned": unplanned1,
       "counts": {"stored": ls1.get("l", {}).get("stored"), "unknown": ls1.get("l", {}).get("unknown"), "not_sent": ls1.get("l", {}).get("not_sent")}},
      "Stop latches at once ('stopping'), the server stream is stopped with a null pre-Stop sequence (not invented), the host gets EOF and its "
      "Linux process exits (watcher), and local lines retained after the latch stay local and are not labelled stored")

# ---------------------------------------------------------------- 5. relaunch: read/control-only recovery, reopen, continue
rel = parsed("link_relaunched") or {}
st2 = streams[1] if len(streams) > 1 else None
docs_between = [d for d in db_docs if t_close1 and t_s2 and t_close1 - CLOCK <= ts(d["created_at"]) < t_s2 - CLOCK]
rb2 = rb.get(st2["stream_id"]) if st2 else None
reopen_ok = (rel.get("l", {}).get("state") == "stopped" and rel["l"].get("earlier_unknown") == 0 and not before(t_relaunch, click_before("s2"))
             and "wsl.exe" not in kids("kids_relaunch") and not docs_between and (parsed("kept_relaunched") or {}).get("hidden") is True
             and st2 and (st2["registration"]["continuity"] or {}).get("kind") == "restart" and st2["registration"]["continuity"].get("previous_stream_id") == st1["stream_id"]
             and H["reopened2"] and H["stopped1"] and H["reopened2"]["id"] == H["stopped1"]["id"] and H["reopened2"]["ink"] == H["stopped1"]["ink"]
             and ops(H["reopen-edit"]) == ops(H["stopped1"]) + ["add"] and H["reopen-edit"]["forked_from"] is None
             and rb2 and rb2["server_records"] > 0 and not rb2["mismatches"] and st2["final"] == "stopped")
check("relaunch.recovery_reopen_continue", "pass" if reopen_ok else "fail",
      {"status_after_relaunch": rel.get("l"), "hosts_between_relaunch_and_start": before(t_relaunch, click_before("s2")),
       "start2_click_to_host": round(next((h["appeared"] for h in hosts if h["appeared"] >= click_before("s2") - CLOCK), 0) - click_before("s2"), 2) if click_before("s2") else None,
       "wsl_children": kids("kids_relaunch"),
       "server_documents_created_between_close_and_next_start": len(docs_between), "stream2_continuity": st2 and st2["registration"]["continuity"],
       "stream2_grant": st2 and st2["grant"], "reopened_same_document": bool(H["reopened2"] and H["stopped1"] and H["reopened2"]["ink"] == H["stopped1"]["ink"]),
       "history_after_edit": ops(H["reopen-edit"]), "stream2_server_records": (rb2 or {}).get("server_records"), "stream2_mismatches": (rb2 or {}).get("mismatches")},
      "after closing and relaunching the same profile: no host, no replay and no fresh grant until the next explicit Start; that Start is a new "
      "stream continuing the previous one; the saved original reopens byte-for-byte and editing continues in the same document. The previous "
      "process had to be ended by its owned PID (QA-WIN-03), so this is not a clean own-app exit")

# ---------------------------------------------------------------- 6. controlled failure: test service unavailable
fail_idle, lf, lf_now, lf_ask = parsed("link_fail_idle") or {}, parsed("link_fail") or {}, parsed("link_fail_now") or {}, parsed("link_fail_after_ask") or {}
ask_fail = parsed("askFail") or {}
st3 = streams[2] if len(streams) > 2 else None
docs_after_fail = [d for d in db_docs if ts(d["created_at"]) >= t_fail - CLOCK]
fail_hosts = in_window(t_fail, ts(procs["app-fail"].get("exited_at") or step_at.get("timeline3", "2100-01-01T00:00:00")))
caps_fail = sorted({k.split("/")[1] for k in (values.get("h_fail") or {}) if k.startswith("captures/") and k.endswith("manifest.jsonl")} -
                   {k.split("/")[1] for k in (values.get("h_after-close2") or {}) if k.startswith("captures/") and k.endswith("manifest.jsonl")})
local_fail = sum(1 for cap in caps_fail for l in manifest(cap) if l.get("kind") == "retained")
earlier_ids = {d["id"] for d in snap("stopped2")}
fail_doc = next((d for d in snap("fail-write") if d["id"] not in earlier_ids), None)  # the failure session's own new document
fail_ok = (st3 and not docs_after_fail and local_fail > 0 and fail_doc and lf_now.get("l", {}).get("stored") == 0 and lf_now["l"]["state"] != "sending"
           and fail_hosts and all(h["exited"] for h in fail_hosts))
check("failure.service_unavailable_local_kept_nothing_sent", "blocked" if contaminated else ("pass" if fail_ok else "fail"),
      {"status_before_start": fail_idle.get("l"), "status_after_start": (lf or {}).get("l"), "status_later": lf_now.get("l"), "link_line": lf_now.get("line"),
       "stream3": st3 and {k: st3[k] for k in ("grant", "final", "registered", "planned_through", "notes")}, "hosts": fail_hosts,
       "server_documents_created_after_failure_launch": len(docs_after_fail), "local_retained_frames": local_fail,
       "local_ink_saved": bool(fail_doc), "status_after_stop": (parsed("link_fail_stopped") or {}).get("l")},
      "the same host pointed at a test service that does not exist: it ends without READY; capture and ink stay local; nothing reaches the "
      "database; counts do not claim storage (healthy control: the earlier linked sessions)")
claims_storage = ("also stored in a local test capture service" in ask_fail.get("text", ""), "also stored in a local test capture service" in lf_now.get("ai", ""))
check("failure.ui_does_not_claim_storage", "fail" if any(claims_storage) else "pass",
      {"ask_card": ask_fail.get("text", "")[:260], "header": lf_now.get("ai"), "claims": {"ask_card": claims_storage[0], "header": claims_storage[1]},
       "status": lf_now.get("l")},
      "while the test service is unavailable (status not sending, nothing stored), the ASK card and the header must not say frames are also stored")

# ---------------------------------------------------------------- QA-WIN-03: the linked app does not exit after its window closes
apps = {k: v for k, v in procs.items() if k.startswith("app")}
hung = {k: values.get(n) for k, n in (("app-link", "hung1"), ("app-relaunch", "hung2"), ("app-fail", "hung3")) if values.get(n)}
self_exit = {k: bool(v.get("exited") and v.get("exit_code") == 0 and not v.get("killed")) for k, v in apps.items()}
check("quit.linked_app_exits_after_close", "pass" if all(self_exit.values()) else "fail",
      {"self_exit_code_0": self_exit, "hung_after_close": {k: {x: (v or {}).get(x) for x in ("was_running", "pages_left", "children", "ended")} for k, v in hung.items()},
       "control_without_link": {k: procs["app"].get(k) for k in ("exited", "exit_code", "killed")}},
      "closing the control window must end the app process by itself; with the development link configured it stayed alive with no page "
      "until QA ended that owned PID (the app without the link exits at once)")

# ---------------------------------------------------------------- 7. release

wsl_left = [w for w in as_list(results.get("wsl_seen")) if w.get("running_at_end")]
remaining = next((e.get("remaining") for e in reversed(watch) if e["event"] == "watch_end"), None)
watch_started = next((ts(e["at"]) for e in watch if e["event"] == "watch_start"), None)
ended_all = all(v.get("exited") or (v.get("killed") and (hung.get(k) or {}).get("ended")) for k, v in apps.items())
check("release.owned_processes_ended", "pass" if ended_all and not wsl_left and remaining == [] and watch_started is not None and watch_started <= t_link_launch else "fail",
      {"apps": {k: {x: v.get(x) for x in ("pid", "exited", "exit_code", "killed")} for k, v in apps.items()}, "wsl_exe_seen": as_list(results.get("wsl_seen")),
       "hosts_remaining_at_watch_end": remaining, "hosts_seen": len(hosts)},
      "every owned app process ended (by itself, or by QA ending that PID after QA-WIN-03), no wsl.exe child and no host of this run remains")
check("database.readback_read_only", "pass" if readback and readback.get("database_unchanged_by_readback") and readback["database"]["actor_row"] else "fail",
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

    big = {"timeline1", "timeline2", "timeline3", "askCard", "askFail"} | {k for k in values if k.startswith("h_")}
    write("summary.json", {"counts": counts, "checks": checks})
    write("runner-results.json", dict(results, values={k: v for k, v in values.items() if k not in big}))
    write("hash-checkpoints.json", {k: values[k] for k in order if k in values})
    write("coordination-final.json", final_coord)
    write("host-watch.json", watch)
    write("preflight.json", {k: v for k, v in preflight.items()})
    if readback:
        write("database-readback.json", readback)
    write("steps.json", load(os.path.join(RUN, "steps.json")))
    write("run.json", load(os.path.join(RUN, "run.json")))
