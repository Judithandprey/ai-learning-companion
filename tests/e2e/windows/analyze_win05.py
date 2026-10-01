#!/usr/bin/env python3
"""Checks one QA run of the 'parentwin05' scenario (tests/e2e/windows/run.mjs parentwin05 <out>): QA-WIN-05 at 476fd1f.

Usage: python3 analyze_win05.py <run out dir> [<evidence dir>]

The changed path only: a send that is out and not yet answered must be said as waiting at once (not after the app's own
60 s wait), the confirmed counts must stay what they were, a real answer must raise them, and a Stop during a pending
send must end without a live or stored claim. The accepted texts of this candidate are written out below; the frozen
86d2405 analyzer (analyze_fix.py) and its evidence are not used or changed. App reads are the app's own claims; they are
checked against its record, the WSL host watcher (which paused and resumed this run's own host) and the test database.
A check fails when a value it relies on is missing. Statuses: pass / fail / limit.

After the acceptance run one note was corrected (no condition and no status changed): the server check said "nothing of
it arrived" of the send given up at the Stop, which cannot be told when an earlier record stores the same bytes.
"""

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


CLOCK = 2.0       # tolerance between the Windows (runner, app) and WSL (watcher, database) clocks, seconds
PROMPT_S = 10.0   # "at once": the waiting status must follow the frame it sends within this (the old behaviour took about 182 s)
APP_WAIT_S = 60.0  # the app's own wait for one send (loopback-http.ts); everything here must happen inside it

results = load(os.path.join(RUN, "out", "results.json"))
values, steps, procs = results["values"], results["steps"], results["processes"]
as_list = lambda v: [] if v is None else (v if isinstance(v, list) else [v])
exists = lambda *p: os.path.exists(os.path.join(RUN, *p))
planned = load(os.path.join(RUN, "steps.json")) if exists("steps.json") else []
preflight = load(os.path.join(RUN, "preflight.json")) if exists("preflight.json") else {}
readback = load(os.path.join(RUN, "readback.json")) if exists("readback.json") else None
watch = [json.loads(l) for l in open(os.path.join(RUN, "host-watch.jsonl"), encoding="utf-8")] if exists("host-watch.jsonl") else []
final_coord = load(os.path.join(RUN, "capture-host", "coordination.json")) if exists("capture-host", "coordination.json") else None
coord = lambda label: load(os.path.join(RUN, "out", f"copy-{label}", "coordination.json")) if exists("out", f"copy-{label}", "coordination.json") else None
db_docs = (readback or {}).get("database", {}).get("documents", [])


def parsed(name):
    """A value the page returned as JSON text; None when the step never produced it."""
    v = values.get(name)
    return json.loads(v) if isinstance(v, str) else v


def step(pred):
    return next((s for s in steps if pred(s)), None)


def step_named(name):
    return step(lambda s: s.get("as") == name)


def at(name):
    """The time a named value was read: the read's own stamp, which must be its step's time."""
    r, s = parsed(name), step_named(name)
    if not isinstance(r, dict) or not r.get("at") or not s or abs(ts(r["at"]) - ts(s["at"])) > CLOCK:
        return None
    return ts(r["at"])


# ---------------------------------------------------------------- the accepted copy of this candidate (control.ts at 476fd1f)
H_OFF = "No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere."
H_SENT = ("Development mode: captured frames and ink are kept on this device and are also sent to a local test capture service on it. "
          "A record counts as stored only once that service confirms it; the counts are below. No AI is connected; nothing is sent to any AI.")
H_UNCONFIRMED = ("Development mode: captured frames and ink are kept on this device. Whether a local test capture service on it is storing them now is not confirmed; "
                 "its state, and the latest capture's counts, are below. No AI is connected; nothing is sent to any AI.")
H_NOT = ("Development mode: captured frames and ink are kept on this device. A local test capture service on it is not storing them now; "
         "its state, and the latest capture's counts, are below. No AI is connected; nothing is sent to any AI.")
EXTRA = (("unknown", "not known whether stored"), ("refused", "refused"), ("not_sent", "not sent (kept on this device)"), ("earlier_unknown", "earlier stream(s) whose end is not known"))


def state_words(l):
    return {"idle": "not connected yet (a connection is tried when you press Start)", "connecting": "connecting",
            "sending": "sending: waiting for the service to confirm" if l.get("awaiting") else "connected: frames are sent as they are kept",
            "stalled": "storage not confirmed now (the frames are kept on this device)", "offline": "offline (the frames are kept on this device)",
            "stopping": "stopping: nothing new is sent; the last send is waiting for the service to confirm" if l.get("awaiting") else "stopping: nothing new is sent",
            "stopped": "stopped", "not connected": "not connected (the frames stay on this device)"}.get(l.get("state"))


def link_line(l):
    parts = [f"{l.get('stored')} record(s) stored"] + [f"{l.get(k)} {w}" for k, w in EXTRA if (l.get(k) or 0) > 0]
    return f"Capture storage (development): {state_words(l)}. {'; '.join(parts)}.{' ' + l['detail'] + '.' if l.get('detail') else ''} AI: not connected."


def header_for(l):
    if l.get("mode") != "development":
        return H_OFF
    return H_SENT if l.get("state") == "sending" else H_UNCONFIRMED if l.get("state") == "stalled" or l.get("awaiting") else H_NOT


def affirms_storage(text):
    """Whether a text says frames are (being) stored now. The two accepted negations are not such a claim."""
    t = text.replace("is storing them now is not confirmed", "").replace("is not storing them now", "")
    return bool(re.search(r"\b(?:is|are)\b[^.;]*\bstor(?:ed|ing)\b", t, re.I) or re.search(r":\s*storing\b", t, re.I))


READS = ["n_off", "w_idle", "w_confirmed_now", "w_awaiting_now", "w_awaiting_10s", "w_acked_now", "w_before_pause2", "p_awaiting_now", "p_stop_latched", "p_stop_given_up_now", "p_stopped_now"]
rows, bad = {}, []
for name in READS:
    r = parsed(name)
    if not isinstance(r, dict) or at(name) is None:
        bad.append([name, "not read, or its time is not its step's time"])
        continue
    l, header, line = r.get("l") or {}, r.get("ai") or "", r.get("line") or ""
    rows[name] = {"read": name, "at": r["at"], **{k: l.get(k) for k in ("mode", "state", "awaiting", "storing", "stored", "unknown", "refused", "not_sent", "earlier_unknown", "sends_stopped", "detail")},
                  "header": header, "line": line}
    if header != header_for(l):
        bad.append([name, "the header is not the accepted text for this status"])
    if "No AI is connected" not in header:
        bad.append([name, "the header does not say no AI is connected"])
    if affirms_storage(header) or affirms_storage(line):
        bad.append([name, "the copy says frames are (being) stored"])
    if l.get("mode") == "development":
        if r.get("hidden") is not False or line != link_line(l) or not line.endswith(" AI: not connected."):
            bad.append([name, "the line is hidden, or is not the status written out, or does not say the AI is not connected"])
        if not isinstance(l.get("awaiting"), bool) or not isinstance(l.get("storing"), bool) or (l["storing"] and (l["awaiting"] or l.get("state") != "sending")):
            bad.append([name, "awaiting/storing are missing or contradict each other"])
    elif r.get("hidden") is not True or line:
        bad.append([name, "link off, but a link line is shown"])
g = lambda n: rows.get(n) or {}

# ---------------------------------------------------------------- run integrity
shots = [s for s in steps if s.get("kind") == "desktopShot"]
foreign = as_list((results.get("foreign") or {}).get("start")) + as_list((results.get("foreign") or {}).get("end")) + [f for s in shots for f in as_list(s.get("foreign"))]
looked = (isinstance(results.get("foreign"), dict) and "start" in results["foreign"] and "end" in results["foreign"] and len(shots) == sum(1 for p in planned if "desktopShot" in p) > 0
          and all("foreign" in s for s in shots))
check("run.shared_desktop_quiet", "pass" if looked and not foreign else "fail", {"foreign_electron_seen": foreign, "looked_at_start_end_and_screenshots": looked, "screenshots": len(shots)},
      "no other Electron app at start, at each screenshot and at the end (point-in-time)")
failed = [{"i": s["i"], "kind": s.get("kind"), "as": s.get("as"), "error": s.get("error")} for s in steps if not s["ok"]]
ran_plan = (len(planned) > 0 and [s["i"] for s in steps] == list(range(1, len(planned) + 1)) and all(s.get("kind") in p and s.get("as") in (None, p.get("as")) for s, p in zip(steps, planned)))
check("run.completed", "pass" if not results.get("aborted") and not failed and results.get("errors") == [] and ran_plan else "fail",
      {"aborted": results.get("aborted"), "failed_steps": failed, "steps_run": len(steps), "steps_planned": len(planned), "each_step_is_its_planned_step": ran_plan},
      "every planned step ran, in order; an optional status wait that timed out counts as a failed step here")
cursor = [tuple(c) for c in [(results.get("cursor") or {}).get("start"), (results.get("cursor") or {}).get("end")] + [s.get("cursor") for s in shots] if c]
check("run.cursor_static", "pass" if len(cursor) == 2 + len(shots) and len(set(cursor)) == 1 else "limit", {"positions_px": sorted(set(cursor)), "readings": len(cursor)})

# ---------------------------------------------------------------- the one host of this run (WSL watcher) and the app process
appear = [(ts(e["at"]), e["pid"]) for e in watch if e.get("event") == "appear"]
exits = {e["pid"]: ts(e["at"]) for e in watch if e.get("event") == "exit"}
hosts = [{"pid": pid, "appeared": t, "exited": exits.get(pid)} for t, pid in appear]
watch_start = next((e for e in watch if e.get("event") == "watch_start"), None)
watch_end = next((e for e in watch if e.get("event") == "watch_end"), None)
app = procs.get("app-win05") or {}
t_app = ts(app["started_at"]) if app.get("started_at") else None
t_exit = ts(app["exited_at"]) if app.get("exited_at") else None
i_s1 = (step_named("s1") or {}).get("i")
click_start = step(lambda s: i_s1 is not None and s["i"] == i_s1 - 1)  # startSession = click, running, ...
t_click = ts(click_start["at"]) if click_start else None
stop_click = step(lambda s: s.get("kind") == "eval" and (step_named("p_stop_latched") or {}).get("i") == s["i"] + 1)
t_stop_click = ts(stop_click["at"]) if stop_click else None
watched = bool(watch_start and watch_end and t_app is not None and t_exit is not None and ts(watch_start["at"]) <= t_app and t_exit <= ts(watch_end["at"]) + CLOCK)
session_host = hosts[0] if watched and len(hosts) == 1 and t_click is not None and t_click - 0.5 <= hosts[0]["appeared"] <= t_click + 30 else None
pauses = [e for e in watch if e.get("event") == "paused"]
resumes = [e for e in watch if e.get("event") == "resumed"]
pause_steps = [s for s in steps if s.get("kind") == "hostPause"]
resume_steps = [s for s in steps if s.get("kind") == "hostResume"]


def own_pause(i):
    """The i-th pause and resume: exactly the session host, stopped then continued, at the runner's own two steps."""
    if session_host is None or len(pauses) != 2 or len(resumes) != 2 or len(pause_steps) != 2 or len(resume_steps) != 2:
        return None
    p, r, ps, rs = pauses[i], resumes[i], pause_steps[i], resume_steps[i]
    ph, rh = as_list(p.get("hosts")), as_list(r.get("hosts"))
    ok = (len(ph) == 1 and ph[0].get("pid") == session_host["pid"] and ph[0].get("state_after") == "T" and len(rh) == 1 and rh[0].get("pid") == session_host["pid"]
          and rh[0].get("continued") is True and not rh[0].get("gone") and rh[0].get("state_after") in ("R", "S", "D", "I") and r.get("reason") == "the request was removed"
          and ps.get("hosts") == 1 and bool(ps.get("answered_at")) and bool(rs.get("answered_at"))
          and abs(ts(p["at"]) - ts(ps["answered_at"])) <= CLOCK and abs(ts(r["at"]) - ts(rs["answered_at"])) <= CLOCK and ts(p["at"]) < ts(r["at"]))
    # paused/resumed: the watcher's stamps (WSL clock). paused_win/resume_asked_win/resumed_win: the runner's stamps, on the
    # clock of the app's reads. The watcher answers a pause only after its SIGSTOP and continues only after the request is gone.
    return {"paused": ts(p["at"]), "resumed": ts(r["at"]), "paused_win": ts(ps["answered_at"]), "resume_asked_win": ts(rs["at"]), "resumed_win": ts(rs["answered_at"])} if ok else None


pause1, pause2 = own_pause(0), own_pause(1)
fault_ok = (pause1 is not None and pause2 is not None and pause1["resumed"] < pause2["paused"] and watch_start.get("already_there") == []
            and session_host["exited"] is not None and session_host["exited"] > pause2["resumed"])
check("fault.only_this_runs_host_paused_twice_and_resumed", "pass" if fault_ok else "fail",
      {"session_host": session_host, "hosts_seen": hosts, "paused": pauses, "resumed": resumes, "already_in_the_copy_at_watch_start": (watch_start or {}).get("already_there"),
       "paused_for_s": [round(p["resumed"] - p["paused"], 1) if p else None for p in (pause1, pause2)]},
      "the run had exactly one host (its working folder is this run's private Backend copy); twice it alone was stopped (state T) and continued, at the runner's "
      "own steps; it stayed the same process, so each later answer came from the same service, not from a new host")

# ---------------------------------------------------------------- the record and the status events
streams = (final_coord or {}).get("streams", [])
s1 = streams[0] if len(streams) == 1 else None
events = parsed("w_events") if isinstance(parsed("w_events"), list) else []
ev = [dict(e, t=ts(e["qa_at"])) for e in events if isinstance(e, dict) and e.get("qa_at") and e.get("mode") == "development"]
jobs_at = lambda label: [j for s in (coord(label) or {}).get("streams", []) if s1 and s.get("stream_id") == s1.get("stream_id") for j in s.get("jobs", [])]
open_jobs = lambda label: [[j.get("key"), j.get("status"), j.get("records")] for j in jobs_at(label) if j.get("status") != "committed"]
stored_at = lambda label: sum(j.get("records", 0) for j in jobs_at(label) if j.get("status") == "committed") if coord(label) else None
manifest_path = os.path.join(RUN, "captures", (s1 or {}).get("capture_session") or "-", "manifest.jsonl")
manifest = [json.loads(l) for l in open(manifest_path, encoding="utf-8")] if os.path.exists(manifest_path) else []
kinds = [l.get("kind") for l in manifest]
all_jobs = (s1 or {}).get("jobs", [])
last_planned = max([j.get("through") for j in all_jobs if isinstance(j.get("through"), int)] or [0])  # manifest line number of the last line any job carries
frames_only = (len(all_jobs) >= 3 and all(j.get("from") == j.get("through") and j.get("records") == 1 for j in all_jobs) and [j.get("from") for j in all_jobs] == list(range(2, last_planned + 1))
               and len(manifest) >= last_planned and kinds[0] == "header" and all(k == "retained" for k in kinds[1:last_planned]))
check("run.every_job_is_one_retained_frame", "pass" if frames_only else "limit",
      {"manifest_line_kinds": kinds, "jobs": [[j.get("key"), j.get("from"), j.get("through"), j.get("records")] for j in all_jobs], "lines_no_job_carries": kinds[last_planned:]},
      "the checks below read one job as one retained frame: every job is one record, and its manifest line is a retained frame. A coverage line inside the jobs (a gap, "
      "a frame not retained) would be a job too; the dependent checks are then 'limit', not judged. Lines after the last job were never sent")


def frame_time(job_key):
    """When the frame a one-record job sends was sampled: the job bN-N carries manifest line N (the header is line 1)."""
    m = re.search(r"\.b(\d+)-(\d+)$", str(job_key))
    line = manifest[int(m.group(1)) - 1] if m and m.group(1) == m.group(2) and 1 <= int(m.group(1)) - 1 < len(manifest) else None
    return ts(line["sampled_at"]) if line and line.get("kind") == "retained" and line.get("sampled_at") else None


def verdict(ok, own_ready, why_not):
    """pass, or fail when the check's own evidence was there and wrong; 'limit' (not judged) when what it builds on is missing."""
    return ("pass", None) if ok else ("fail", None) if own_ready else ("limit", "not judged: " + why_not)


# ---------------------------------------------------------------- 0. before: no link, idle, then confirmed records
off, idle, conf = g("n_off"), g("w_idle"), g("w_confirmed_now")
S = conf.get("stored")
kids_idle = values.get("kids_w_idle")
names_idle = [str(k.get("name")).lower() for k in as_list((kids_idle or {}).get("children"))] if isinstance(kids_idle, dict) else None
before_start = [h for h in hosts if t_app is not None and t_click is not None and h["appeared"] < t_click - 0.5] if watched else None
base_ok = (off.get("mode") == "off" and idle.get("state") == "idle" and idle.get("storing") is False and idle.get("awaiting") is False and idle.get("stored") == 0
           and names_idle is not None and "electron.exe" in names_idle and "wsl.exe" not in names_idle and kids_idle.get("app_pid") == app.get("pid") and before_start == [])
check("before.link_off_then_idle_no_host", "pass" if base_ok else "fail",
      {"no_link": off, "idle": idle, "children_before_start": names_idle, "hosts_before_the_start_click": before_start},
      "without the link: no link line; with it and before Start: 'not connected yet', nothing stored, no host and no wsl.exe child")
conf_ok = (isinstance(S, int) and S >= 2 and conf.get("state") == "sending" and conf.get("awaiting") is False and conf.get("storing") is True and conf.get("unknown") == 0 and conf.get("not_sent") == 0
           and conf.get("refused") == 0 and conf.get("header") == H_SENT and stored_at("coord-confirmed") == S and open_jobs("coord-confirmed") == []
           and pause1 is not None and at("w_confirmed_now") is not None and at("w_confirmed_now") < pause1["paused_win"])
check("confirmed.records_before_the_pause", "pass" if conf_ok else "fail",
      {"status": conf, "committed_records_in_the_record": stored_at("coord-confirmed"), "jobs_not_committed": open_jobs("coord-confirmed")},
      "before the pause: connected, no send out, at least 2 records confirmed, nothing unknown; the record holds exactly those as committed; the header says frames "
      "are sent and that a record counts as stored only once the service confirms it")

# ---------------------------------------------------------------- 1. a pending send is said as waiting at once; confirmed counts stay
aw, aw10 = g("w_awaiting_now"), g("w_awaiting_10s")
pending1 = open_jobs("coord-awaiting")
t_frame1 = frame_time(pending1[0][0]) if len(pending1) == 1 else None
first_aw = next((e for e in ev if pause1 and t_frame1 is not None and e["t"] >= t_frame1 and e.get("awaiting") is True), None)  # the app's own clock for both
delay1 = round(first_aw["t"] - t_frame1, 2) if first_aw and t_frame1 is not None else None
in_pause1 = lambda n: pause1 is not None and at(n) is not None and pause1["paused_win"] <= at(n) <= pause1["resume_asked_win"]
pending_shape = lambda r, stored: (r.get("state") == "sending" and r.get("awaiting") is True and r.get("storing") is False and r.get("stored") == stored and r.get("unknown") == 1
                                   and r.get("not_sent") == 0 and r.get("refused") == 0 and r.get("sends_stopped") is False and r.get("header") == H_SENT
                                   and "sending: waiting for the service to confirm" in r.get("line", "") and f"{stored} record(s) stored; 1 not known whether stored" in r.get("line", ""))
pending_ready = conf_ok and frames_only and len(pending1) == 1 and pending1[0][2] == 1 and t_frame1 is not None
pending_ok = (pending_ready and pending1[0][1] == "sending" and stored_at("coord-awaiting") == S and pause1["paused_win"] <= t_frame1
              and first_aw is not None and first_aw.get("state") == "sending" and first_aw.get("storing") is False and first_aw.get("stored") == S and first_aw.get("unknown") == 1
              and delay1 is not None and 0 <= delay1 <= PROMPT_S and in_pause1("w_awaiting_now") and pending_shape(aw, S)
              # every status from the first waiting one to the read: still waiting, nothing more stored, nothing said stored
              and not any(e.get("awaiting") is not True or e.get("storing") is not False or e.get("stored") != S or e.get("unknown") != 1 or e.get("state") != "sending"
                          for e in ev if first_aw["t"] <= e["t"] <= at("w_awaiting_now")))
v = verdict(pending_ok, pending_ready, "no confirmed baseline, a manifest line that is not a frame, or not exactly one one-record job open at the read")
check("pending.said_as_waiting_at_once_counts_kept", v[0],
      {"pending_job_in_the_record": pending1, "frame_sampled_to_waiting_status_s": delay1, "pause_to_waiting_status_s": round(first_aw["t"] - pause1["paused"], 2) if first_aw and pause1 else None,
       "first_waiting_status": first_aw and {k: first_aw.get(k) for k in ("qa_at", "state", "awaiting", "storing", "stored", "unknown")}, "read_at_once": aw, "confirmed_before": S},
      v[1] or (f"with the host paused, the next frame's send is said as 'waiting for the service to confirm' within {PROMPT_S:.0f} s of that frame (the 86d2405 build said "
               "'storing' for about 182 s): no storing flag, the confirmed count unchanged, the pending record counted as not known whether stored, and no text says frames "
               "are being stored. The header is the same 'sent ... counts as stored only once that service confirms it' text as with nothing pending; the line carries the waiting"))
later_ok = (pending_ok and in_pause1("w_awaiting_10s") and pending_shape(aw10, S) and at("w_awaiting_10s") - first_aw["t"] >= 9 and pause1["resume_asked_win"] - first_aw["t"] < APP_WAIT_S - 5
            and not any(e.get("awaiting") is not True or e.get("storing") is not False or e.get("stored") != S or e.get("unknown") != 1 or e.get("state") != "sending"
                        for e in ev if first_aw["t"] <= e["t"] <= at("w_awaiting_10s")))
v = verdict(later_ok, pending_ok, "the waiting status was not established")
check("pending.still_waiting_10s_later_inside_the_apps_wait", v[0],
      {"read_10s_later": aw10, "seconds_after_the_first_waiting_status": round(at("w_awaiting_10s") - first_aw["t"], 1) if first_aw and at("w_awaiting_10s") else None,
       "waiting_status_to_resume_request_s": round(pause1["resume_asked_win"] - first_aw["t"], 1) if first_aw and pause1 else None,
       "statuses_from_the_first_waiting_one_to_this_read": sum(1 for e in ev if first_aw and at("w_awaiting_10s") and first_aw["t"] <= e["t"] <= at("w_awaiting_10s"))},
      v[1] or ("10 s later, still paused: the same waiting status and the same counts, and no status in between said anything else; the host was resumed before the "
               "app's own 60 s wait for that send ended, so nothing here is the old timeout"))

# ---------------------------------------------------------------- 2. the real answer raises the confirmed count
acked = g("w_acked_now")
first_ack = next((e for e in ev if pause1 and e["t"] >= pause1["resume_asked_win"] and e.get("stored") == (S or 0) + 1), None)
job1 = next((j for j in jobs_at("coord-acked") if len(pending1) == 1 and j.get("key") == pending1[0][0]), None)
receipts = {json.loads(d["key"])[-1]: ts(d["created_at"]) for d in db_docs if d.get("kind") == "capture_replay"}
receipt1 = receipts.get(pending1[0][0]) if len(pending1) == 1 else None
ack_ok = (later_ok and acked.get("state") == "sending" and acked.get("awaiting") is False and acked.get("storing") is True and acked.get("unknown") == 0
          and acked.get("stored") == stored_at("coord-acked") and acked.get("stored") >= S + 1 and open_jobs("coord-acked") == []
          and acked.get("not_sent") == 0 and acked.get("header") == H_SENT and "connected: frames are sent as they are kept" in acked.get("line", "")
          and first_ack is not None and first_ack["t"] - pause1["resume_asked_win"] <= 10 and first_ack["t"] - first_aw["t"] < APP_WAIT_S
          and job1 is not None and job1.get("status") == "committed" and bool(job1.get("ack_sha256")) and at("w_acked_now") is not None and at("w_acked_now") >= pause1["resumed_win"]
          and receipt1 is not None and receipt1 >= pause1["resumed"] - 0.5  # the receipt and the watcher's resume are on the same (WSL) clock
          and not any(e.get("state") == "stalled" or (e.get("stored") != S and e["t"] < first_ack["t"]) for e in ev if first_aw["t"] <= e["t"] <= at("w_acked_now")))
v = verdict(ack_ok, later_ok, "the send was not shown waiting until the resume")
check("ack.real_answer_raises_the_confirmed_count", v[0],
      {"after_the_answer": acked, "resume_request_to_confirmed_status_s": round(first_ack["t"] - pause1["resume_asked_win"], 2) if first_ack and pause1 else None,
       "waiting_status_to_confirmed_status_s": round(first_ack["t"] - first_aw["t"], 2) if first_ack and first_aw else None,
       "job_in_the_record": job1 and {k: job1.get(k) for k in ("key", "status", "records")}, "server_receipt_after_the_resume_s": round(receipt1 - pause1["resumed"], 2) if receipt1 and pause1 else None},
      v[1] or ("once the same host answers: no send out, the confirmed count is one higher, nothing unknown; the record holds the job as committed with its "
               "acknowledgement, and the server's own receipt for it was created after the resume. Answered inside the app's 60 s wait for one try: no timeout and no "
               "'not confirmed' (stalled) status in between"))

# ---------------------------------------------------------------- 3. Stop during a pending send
before2, paw, latched, given, stopped = g("w_before_pause2"), g("p_awaiting_now"), g("p_stop_latched"), g("p_stop_given_up_now"), g("p_stopped_now")
S2 = before2.get("stored")
in_pause2 = lambda n: pause2 is not None and at(n) is not None and pause2["paused_win"] <= at(n) <= pause2["resume_asked_win"]
pending2 = open_jobs("coord-stop-given-up")
after_click = [e for e in ev if t_stop_click is not None and e["t"] >= t_stop_click]
first_given = next((e for e in after_click if e.get("state") == "stopping" and e.get("awaiting") is False), None)
final_job = next((j for j in (s1 or {}).get("jobs", []) if len(pending2) == 1 and j.get("key") == pending2[0][0]), None)
stop_ready = (ack_ok and isinstance(S2, int) and S2 >= S + 1 and before2.get("state") == "sending" and before2.get("awaiting") is False and before2.get("unknown") == 0
              and in_pause2("p_awaiting_now") and pending_shape(paw, S2) and t_stop_click is not None)  # a send really was pending when Stop was pressed
stop_ok = (stop_ready
           and in_pause2("p_stop_latched") and t_stop_click is not None and 0 <= at("p_stop_latched") - t_stop_click <= CLOCK
           and latched.get("state") == "stopping" and latched.get("awaiting") is True and latched.get("storing") is False and latched.get("stored") == S2 and latched.get("unknown") == 1
           and latched.get("header") == H_UNCONFIRMED and "stopping: nothing new is sent; the last send is waiting for the service to confirm" in latched.get("line", "")
           and in_pause2("p_stop_given_up_now") and given.get("state") == "stopping" and given.get("awaiting") is False and given.get("storing") is False and given.get("stored") == S2
           and given.get("unknown") == 1 and given.get("header") == H_NOT and "1 not known whether stored" in given.get("line", "")
           and first_given is not None and 3 <= first_given["t"] - t_stop_click <= 10
           and len(pending2) == 1 and pending2[0][1] == "unknown" and pending2[0][2] == 1
           and at("p_stopped_now") is not None and at("p_stopped_now") >= pause2["resumed_win"] and stopped.get("state") == "stopped" and stopped.get("awaiting") is False and stopped.get("storing") is False
           and stopped.get("stored") == S2 and stopped.get("unknown") == 1 and stopped.get("not_sent") == 0 and stopped.get("header") == H_NOT
           and f"{S2} record(s) stored; 1 not known whether stored" in stopped.get("line", "")
           and bool(after_click) and not any(e.get("storing") is True or e.get("state") in ("sending", "connecting") or e.get("stored") != S2 for e in after_click)
           and final_job is not None and final_job.get("status") == "unknown")
v = verdict(stop_ok, stop_ready, "no send was shown pending when Stop was pressed, or an earlier check did not pass; this behaviour was not exercised")
check("stop.during_a_pending_send_ends_unconfirmed_not_live", v[0],
      {"before": {k: before2.get(k) for k in ("state", "awaiting", "stored", "unknown")}, "pending": paw, "right_after_the_stop_click": latched,
       "click_to_read_s": round(at("p_stop_latched") - t_stop_click, 2) if at("p_stop_latched") and t_stop_click else None,
       "after_the_apps_own_wait": given, "click_to_giving_up_s": round(first_given["t"] - t_stop_click, 2) if first_given and t_stop_click else None,
       "job_in_the_record_then": pending2, "after_the_resume": stopped, "job_in_the_final_record": final_job and {k: final_job.get(k) for k in ("key", "status", "records", "in_doubt", "stuck")},
       "states_after_the_click": [[e.get("state"), e.get("awaiting"), e.get("storing"), e.get("stored"), e.get("unknown")] for e in after_click]},
      v[1] or ("Stop pressed while a send was out (host paused): at once 'stopping ... the last send is waiting for the service to confirm' under the 'not confirmed' "
               "header; after the app's own 5 s wait the send is given up and stays 'not known whether stored'; after the host answers again the stream stops with the "
               "same confirmed count and 1 not known. From the click on, no status says sending, storing or a higher stored count"))

# ---------------------------------------------------------------- the server against what the app said
rb = next((x for x in (readback or {}).get("streams", []) if s1 and x.get("stream_id") == s1.get("stream_id")), None)
srv = next((d.get("stream") for d in db_docs if d.get("kind") == "control_stream" and s1 and d.get("key") == s1.get("stream_id")), None)
records = [d["record"] for d in db_docs if d.get("kind") == "capture_record" and isinstance(d.get("record"), dict)]
server_artifacts = {d["artifact"].get("id"): d["artifact"].get("sha256") for d in db_docs if d.get("kind") == "artifact" and isinstance(d.get("artifact"), dict)}
committed = [j for j in (s1 or {}).get("jobs", []) if j.get("status") == "committed"]
problems = []
if not (s1 and rb and srv):
    problems.append("no record, readback or server stream")
else:
    if not all(r.get("stream_id") == s1["stream_id"] for r in records) or len({r.get("record_id") for r in records}) != len(records):
        problems.append("a server record is of another stream, or is there twice")
    if sorted(j.get("key") for j in rb.get("jobs", [])) != sorted(j.get("key") for j in s1.get("jobs", [])):
        problems.append("the readback's jobs are not the record's jobs")
    seen = []
    for job in committed:
        of_job = [r for r in records if isinstance(r.get("sequence"), int) and job.get("from") <= r["sequence"] <= job.get("through")]
        seen += [r.get("record_id") for r in of_job]
        named = sorted({a for r in of_job for a in r.get("artifacts") or []})
        if len(of_job) != job.get("records") or sorted(set(job.get("originals") or [])) != named or not named:
            problems.append([job.get("key"), "the record and the server's records name different originals"])
        if not all(server_artifacts.get(a) == str(a).rsplit(".", 1)[-1] for a in named):
            problems.append([job.get("key"), "an original is not stored on the server under its hash"])
        got = [o for j in rb.get("jobs", []) if j.get("key") == job.get("key") for o in as_list(j.get("ink_originals"))]
        if sorted(str(o.get("artifact_id")) for o in got) != [a for a in named if ".ink." in a] or not all(
                o.get("server_sha256") == o.get("local_sha256") == str(o.get("artifact_id")).rsplit(".ink.", 1)[-1] for o in got):
            problems.append([job.get("key"), "its ink originals are not each compared once with equal bytes"])
        if receipts.get(job.get("key")) is None or next((j.get("server_receipt") for j in rb["jobs"] if j.get("key") == job.get("key")), None) is not True:
            problems.append([job.get("key"), "no server receipt"])
    if sorted(seen) != sorted(r.get("record_id") for r in records):
        problems.append("the server's records are not exactly those of the committed jobs")
    if rb.get("mismatches") != [] or rb.get("records_read") != len(records) or rb.get("server_records") != len(records) or not isinstance(rb.get("frames_compared"), int) \
            or rb["frames_compared"] < sum(1 for r in records if r.get("frame_id")) or rb["frames_compared"] < 1:
        problems.append("picture mismatches, or not every server record was read back and compared")
named_on_server = {a for r in records for a in r.get("artifacts") or []}
unnamed = sorted(a for a in server_artifacts if a not in named_on_server)  # originals the server stores that no record names
given_up_original = (final_job or {}).get("in_doubt")
# Whether that upload arrived can only be told when no stored record already names the same bytes (the same picture
# shown twice has one content address).
arrival = ("cannot be told: an earlier record already stores an original with the same bytes" if given_up_original in named_on_server
           else "its first original did arrive after the resume" if unnamed else "nothing of it arrived")
server_ok = (stop_ok and not problems and unnamed in ([], [given_up_original]) and len(records) == S2 == sum(j.get("records", 0) for j in committed) == stopped.get("stored") and srv.get("state") == "stopped" and s1.get("final") == "stopped"
             and len(s1.get("stops") or []) >= 1 and s1["stops"][-1].get("outcome") == "stopped" and receipts.get(pending2[0][0]) is None
             and readback.get("at") and t_exit is not None and ts(readback["at"]) >= t_exit - CLOCK and session_host is not None and session_host["exited"] is not None)
v = verdict(server_ok, stop_ok, "the Stop during a pending send was not established")
check("server.holds_exactly_what_the_app_called_stored", v[0],
      {"app_final": {k: stopped.get(k) for k in ("stored", "unknown", "not_sent")}, "committed_records_in_the_record": sum(j.get("records", 0) for j in committed), "server_records": len(records),
       "server_stream": srv, "stream_final": s1 and s1.get("final"), "stops": s1 and [{"key": x.get("key"), "outcome": x.get("outcome")} for x in s1.get("stops", [])],
       "record_given_up_at_stop_has_a_server_receipt": bool(len(pending2) == 1 and receipts.get(pending2[0][0])), "originals_on_server_that_no_record_names": unnamed,
       "the_given_up_sends_original_in_doubt": given_up_original, "whether_the_given_up_upload_arrived": arrival, "frames_compared": rb and rb.get("frames_compared"), "problems": problems},
      v[1] or ("after every host exited: the server holds exactly the records the app counted as stored, each once, with a receipt and equal bytes; the stream is stopped on "
               "the server. Of the send given up at the Stop there is no record and no receipt, and the app never counted it as stored. Whether its upload "
               "reached the server: " + arrival))

# ---------------------------------------------------------------- copy, no AI, exit, release, read-only
check("copy.every_read_is_the_accepted_text_without_a_storage_claim", "pass" if not bad and len(rows) == len(READS) else "fail", {"problems": bad, "reads": list(rows.values())},
      "all 11 reads: the header and the line are this candidate's texts for the status shown, the line's counts are the status counts, and no text says frames are "
      "(being) stored")
ov = parsed("ov_w_overlay") or {}
no_ai = (len(rows) == len(READS) and all("No AI is connected" in r["header"] for r in rows.values()) and all(r["line"].endswith(" AI: not connected.") for n, r in rows.items() if n != "n_off")
         and "No AI is connected" in str(ov.get("hint")))
check("no_ai.said_everywhere", "pass" if no_ai else "fail", {"overlay_hint": ov.get("hint"), "reads": len(rows)},
      "every header says no AI is connected, every link line ends 'AI: not connected.', and the overlay's hint says no AI is connected")


def self_exit(key):
    p = procs.get(key) or {}
    s = step(lambda s: s.get("kind") == "closeApp" and p.get("close_requested_at") and s.get("close_requested_at") == p.get("close_requested_at"))
    return bool(p.get("exited") is True and p.get("exit_code") == 0 and not p.get("killed") and not p.get("closed_in_finally") and not p.get("hung_after_close") and s and s.get("exit_code") == 0
                and isinstance(p.get("exit_ms"), int) and p["exit_ms"] <= 5000 and p.get("exited_at") and 0 <= (ts(p["exited_at"]) - ts(p["close_requested_at"])) * 1000 <= 5000)


wsl_seen = as_list(results.get("wsl_seen"))
wsl_listed = {k.get("pid") for v in values.values() if isinstance(v, dict) for k in as_list(v.get("children")) if isinstance(k, dict) and str(k.get("name")).lower() == "wsl.exe"}
release_ok = (self_exit("app") and self_exit("app-win05") and (procs.get("app") or {}).get("link") == "" and app.get("link") == "main" and app.get("close_via") == "wm_close"
              and not [s for s in steps if s.get("kind") == "endHungApp"] and watched and watch_end.get("remaining") == [] and len(hosts) == 1 and hosts[0]["exited"] is not None
              and hosts[0]["exited"] >= hosts[0]["appeared"] and len(wsl_seen) >= 1 and all(isinstance(w, dict) and w.get("running_at_end") is False for w in wsl_seen)
              and wsl_listed <= {w.get("pid") for w in wsl_seen if isinstance(w, dict)})
check("release.app_exited_by_itself_nothing_left", "pass" if release_ok else "fail",
      {"apps": {k: {x: (procs.get(k) or {}).get(x) for x in ("pid", "link", "close_via", "exited", "exit_code", "exit_ms", "killed")} for k in ("app", "app-win05")},
       "wsl_exe_seen": wsl_seen, "hosts_seen": len(hosts), "hosts_remaining_at_watch_end": (watch_end or {}).get("remaining")},
      "both app processes ended by themselves with code 0 after their close request; the one host exited; no wsl.exe child that was listed is left")
readonly_ok = (bool(readback) and readback.get("database_unchanged_by_readback") is True and readback["database"].get("actor_row") is True
               and readback.get("actor") == ((final_coord or {}).get("actor") or {}).get("user_id") == (preflight.get("actor") or {}).get("user_id")
               and readback["database"].get("by_kind") == {k: sum(1 for d in db_docs if d["kind"] == k) for k in {d["kind"] for d in db_docs}})
check("database.readback_read_only_of_this_actor", "pass" if readonly_ok else "fail",
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
    write("hash-checkpoints.json", {k: values[k] for k in values if k.startswith("h_")})
    for label in ("coord-confirmed", "coord-awaiting", "coord-acked", "coord-stop-given-up"):
        if coord(label):
            write(f"coordination-{label[6:]}.json", coord(label))
    if final_coord:
        write("coordination-final.json", final_coord)
    write("manifest-lines.json", [{k: l.get(k) for k in ("kind", "frame_seq", "reason", "sampled_at", "taken_at", "at", "started_at") if k in l} for l in manifest])
    write("host-watch.json", watch)
    write("preflight.json", preflight)
    if readback:
        write("database-readback.json", readback)
    write("steps.json", planned)
    write("run.json", load(os.path.join(RUN, "run.json")))
