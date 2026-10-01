#!/usr/bin/env python3
"""Pure replay and negative checks of analyze_fix.py on the committed, sanitized evidence of one 'parentfix' run.

Usage: python3 replay_analyze_fix.py <evidence dir> [--analyzer <analyze_fix.py>] [--out <json>] [--summary <json>] [--no-assert]

Nothing is run on Windows, no service or database is contacted: the analyzer's inputs are rebuilt in a temporary
folder from the committed evidence files, and the analyzer is run on that copy. Then one piece of evidence at a time is
removed or falsified in a fresh copy (a mutation) and the analyzer is run again: each mutation must turn its check to
'fail'. The baseline must keep the committed result. With --no-assert the statuses are only recorded (used to show
what an earlier analyzer accepted). The committed evidence is never written.
"""
import argparse
import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FAULT, COUNTS = "fault.only_this_runs_host_paused_and_resumed", "counts.final_counts_equal_the_server_once_each"


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def rebuild(evidence):
    """The analyzer's inputs as one dict of relative path -> JSON value (or list of JSON lines), from the evidence files."""
    results = load(os.path.join(evidence, "runner-results.json"))
    results["values"] = {**results["values"], **load(os.path.join(evidence, "hash-checkpoints.json"))}
    run = {"out/results.json": results, "steps.json": load(os.path.join(evidence, "steps.json")), "run.json": load(os.path.join(evidence, "run.json")),
           "preflight.json": load(os.path.join(evidence, "preflight.json")), "readback.json": load(os.path.join(evidence, "database-readback.json")),
           "host-watch.jsonl": load(os.path.join(evidence, "host-watch.json")), "capture-host/coordination.json": load(os.path.join(evidence, "coordination-final.json"))}
    for name in ("paused-8s", "stalled"):
        run[f"out/copy-coord-{name}/coordination.json"] = load(os.path.join(evidence, f"coordination-{name}.json"))
    for cap, lines in load(os.path.join(evidence, "manifest-ends.json")).items():
        run[f"captures/{cap}/manifest.jsonl"] = lines
    return run


def write(run, root):
    for rel, value in run.items():
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            if rel.endswith(".jsonl"):
                f.writelines(json.dumps(line) + "\n" for line in value)
            else:
                json.dump(value, f)


def analyze(run, analyzer):
    with tempfile.TemporaryDirectory(prefix="qa-replay-") as tmp:
        write(run, os.path.join(tmp, "run"))
        done = subprocess.run([sys.executable, analyzer, os.path.join(tmp, "run"), os.path.join(tmp, "ev")], capture_output=True, text=True, timeout=120)
        summary = os.path.join(tmp, "ev", "summary.json")
        if done.returncode != 0 or not os.path.exists(summary):
            return {"error": (done.stderr or done.stdout).strip().splitlines()[-1:] or ["no summary"]}
        return load(summary)


# ---- mutations: each takes the rebuilt inputs and removes or falsifies one piece of evidence ---------------------------
def event(run, name):
    return next(e for e in run["host-watch.jsonl"] if e["event"] == name)


def stream(run, i):
    return run["readback.json"]["streams"][i]


def first_ink(run, i=0):
    return next(j for j in stream(run, i)["jobs"] if j["ink_originals"])


def no_resumed_host(run):
    event(run, "resumed")["hosts"] = []


def resumed_other_pid(run):
    event(run, "resumed")["hosts"][0]["pid"] += 1


def resumed_not_continued(run):
    event(run, "resumed")["hosts"][0]["continued"] = False


def resumed_still_stopped(run):
    event(run, "resumed")["hosts"][0]["state_after"] = "T"


def no_resumed_event(run):
    run["host-watch.jsonl"] = [e for e in run["host-watch.jsonl"] if e["event"] != "resumed"]


def no_paused_host(run):
    event(run, "paused")["hosts"] = []


def paused_other_pid(run):
    event(run, "paused")["hosts"][0]["pid"] += 1


def paused_and_resumed_other_pid(run):
    event(run, "paused")["hosts"][0]["pid"] += 1
    event(run, "resumed")["hosts"][0]["pid"] += 1


def no_ink_comparisons(run):
    for s in run["readback.json"]["streams"]:
        for j in s["jobs"]:
            j["ink_originals"] = []


def no_ink_comparisons_stream2(run):
    for j in stream(run, 1)["jobs"]:
        j["ink_originals"] = []


def one_ink_comparison_missing(run):
    first_ink(run)["ink_originals"].pop()


def ink_server_hash_differs(run):
    o = first_ink(run)["ink_originals"][0]
    o["server_sha256"] = "0" * 64


def ink_both_hashes_wrong_but_equal(run):
    o = first_ink(run)["ink_originals"][0]
    o["server_sha256"] = o["local_sha256"] = "0" * 64


def ink_comparison_repeated(run):
    j = first_ink(run)
    j["ink_originals"].append(copy.deepcopy(j["ink_originals"][0]))


def ink_comparison_unrelated(run):
    other = first_ink(run, 1)["ink_originals"][0]
    first_ink(run, 0)["ink_originals"][0] = copy.deepcopy(other)  # a real, self-consistent comparison of the other stream


def stored_ink_artifact_differs(run):
    name = first_ink(run)["ink_originals"][0]["artifact_id"]
    doc = next(d for d in run["readback.json"]["database"]["documents"] if d["kind"] == "artifact" and d["artifact"]["id"] == name)
    doc["artifact"]["sha256"] = "0" * 64


def server_record_without_its_ink(run):
    sid = stream(run, 0)["stream_id"]
    rec = next(d["record"] for d in run["readback.json"]["database"]["documents"] if d["kind"] == "capture_record" and d["record"]["stream_id"] == sid)
    rec["artifacts"] = [a for a in rec["artifacts"] if ".ink." not in a]


def readback_job_repeated(run):
    stream(run, 0)["jobs"].append(copy.deepcopy(stream(run, 0)["jobs"][0]))


def readback_job_missing(run):
    stream(run, 0)["jobs"].pop()


def fewer_pictures_than_frames(run):
    stream(run, 0)["frames_compared"] = 4  # the server holds 5 frames for this stream


def picture_mismatch(run):
    stream(run, 1)["mismatches"] = [{"frame": "qa-negative-control", "role": "raw", "status": "available", "local": True}]


def no_wsl_child_seen(run):
    run["out/results.json"]["wsl_seen"] = []


def wsl_child_left(run):
    run["out/results.json"]["wsl_seen"][0]["running_at_end"] = True


def no_desktop_look_recorded(run):
    del run["out/results.json"]["foreign"]


def foreign_electron_seen(run):
    run["out/results.json"]["foreign"]["end"] = [{"pid": 1, "stage": "lc-other"}]


def unavailable_streams_not_in_record(run):
    run["capture-host/coordination.json"]["streams"] = run["capture-host/coordination.json"]["streams"][:2]


def record_on_server_for_unavailable_stream(run):
    sid = run["capture-host/coordination.json"]["streams"][2]["stream_id"]
    run["readback.json"]["database"]["documents"].append({"kind": "control_stream", "key": sid, "created_at": "2026-10-01T02:29:04+00:00", "digest": "0" * 64, "stream": {"state": "live"}})


QUIET, RELEASE = "run.shared_desktop_quiet", "release.owned_processes_ended_by_themselves"


# ---- falsifications found by the mutation hunt on the corrected analyzer (each survived before its condition was added) --
def edit(name, change):
    """A mutation of one page value that the runner stored as JSON text."""
    def apply(run):
        values = run["out/results.json"]["values"]
        value = json.loads(values[name])
        change(value)
        values[name] = json.dumps(value)
    return apply


def setk(key, value, sub=None):
    return lambda r: (r[sub] if sub else r).__setitem__(key, value)


def swap(key, old, new):
    def change(r):
        assert old in r[key], (key, old)
        r[key] = r[key].replace(old, new)
    return change


def both(*mutations):
    return lambda run: [m(run) for m in mutations] and None


def results(run):
    return run["out/results.json"]


def watch_event(name, **match):
    return lambda run: next(e for e in run["host-watch.jsonl"] if e["event"] == name and all(e.get(k) == v for k, v in match.items()))


def stalled_detail_without_retry(r):
    cut = "; the same record(s) are tried again"
    assert cut in r["l"]["detail"] and cut in r["line"]
    r["l"]["detail"], r["line"] = r["l"]["detail"].replace(cut, ""), r["line"].replace(cut, "")


def healthy_wording_after_unavailable_stop(r):
    old = r["l"]["detail"]
    r["l"]["detail"], r["line"] = "stream stopped", r["line"].replace(old, "stream stopped")


def job_range_covers_a_record_twice(run):
    job = next(j for j in run["capture-host/coordination.json"]["streams"][0]["jobs"] if j["key"].endswith(".b5-5"))
    job["from"] = job["through"] = 4


def other_kind_of_document_for_unavailable_stream(run):
    sid = run["capture-host/coordination.json"]["streams"][2]["stream_id"]
    run["readback.json"]["database"]["documents"].append({"kind": "control_start", "key": sid, "created_at": "2026-10-01T02:29:04+00:00", "digest": "0" * 64})


def conflicting_artifact_listed_first(run):
    docs = run["readback.json"]["database"]["documents"]
    i = next(i for i, d in enumerate(docs) if d["kind"] == "artifact" and ".ink." in d["key"])
    other = copy.deepcopy(docs[i])
    other["artifact"]["sha256"] = "0" * 64
    docs.insert(i, other)


def manifest_vanished_at_the_end(run):
    tree = results(run)["values"]["h_final"]
    tree[next(k for k in tree if k.endswith("manifest.jsonl"))] = "vanished"


def checkpoint_label_repeated(run):
    next(s for s in results(run)["steps"] if s.get("as") == "h_b-recovered")["as"] = "h_b-before-pause"


def step_record_replaced_by_its_neighbour(run):
    steps = results(run)["steps"]
    steps[100] = copy.deepcopy(steps[99])


def first_unavailable_pre_start_host_exit_before_appear(run):
    seen = [e for e in run["host-watch.jsonl"] if e["event"] in ("appear", "exit")]
    pid = [e["pid"] for e in seen if e["event"] == "appear"][3]  # the first host tried before a Start with the unavailable configuration
    next(e for e in seen if e["event"] == "exit" and e["pid"] == pid)["at"] = "2026-10-01T02:24:00.000000+00:00"


HEADER, STATES = "copy.header_and_line_follow_the_link_state", "copy.each_state_reads_as_expected"
LOST, LATER, WAITS = "copy.lost_reply_is_unconfirmed_not_failed", "copy.later_answer_restores_storing", "copy.says_storing_while_a_send_waits"
ASK, CARD = "copy.ask_card_conditional_in_every_state", "card.open_card_unchanged_through_fault_and_recovery"
RELAUNCH, KEPT, DONE = "relaunch.same_profile_without_kill", "relaunch.record_and_ink_kept_no_host_before_start", "run.completed"
ORIGINALS, READONLY, RECONCILE = "originals.kept_through_closes_and_fault", "database.readback_read_only", "relaunch.unavailable_hosts_before_a_start_observed"
STORED_HEADER = ("Development mode: captured frames and ink are kept on this device and are stored in a local test capture service on it. "
                 "No AI is connected; nothing is sent to any AI.")
HUNT = [
    ("line_hidden_in_development_mode", "a development-mode read reports the link line as hidden", edit("b_stalled_now", setk("hidden", True)), HEADER),
    ("header_claims_storage_in_other_words", "a not-storing header says frames 'are stored'", edit("g_relaunched", setk("ai", STORED_HEADER)), HEADER),
    ("line_says_a_record_was_not_stored", "the stalled line adds '1 not stored'", edit("b_stalled_now", swap("line", "1 not known whether stored.", "1 not known whether stored; 1 not stored.")), HEADER),
    ("line_says_storing_while_stopped", "a stopped read's line says 'storing.'", edit("e_idle", swap("line", ": stopped.", ": storing.")), HEADER),
    ("unavailable_line_without_the_reason", "the unavailable line no longer shows the reason", edit("e_fail_now", swap("line", " the host ended without READY (unavailable).", "")), STATES),
    ("unavailable_stop_reads_like_a_healthy_stop", "after Stop while unavailable, detail and line say 'stream stopped'", edit("e_stopped_now", healthy_wording_after_unavailable_stop), STATES),
    ("stalled_detail_without_tried_again", "the stalled detail no longer says the record is tried again", edit("b_stalled_now", stalled_detail_without_retry), LOST),
    ("stalled_line_counts_no_unknown", "the stalled line counts 0 unknown while the status has 1", edit("b_stalled_now", swap("line", "1 not known whether stored", "0 not known whether stored")), LOST),
    ("stalled_line_says_failed", "the stalled line adds 'The last send failed.'", edit("b_stalled_now", swap("line", " AI: not connected.", " The last send failed. AI: not connected.")), LOST),
    ("stalled_read_before_the_pause", "the stalled reads are stamped before the host was paused",
     both(edit("b_stalled", setk("at", "2026-10-01T02:25:10.000Z")), edit("b_stalled_now", setk("at", "2026-10-01T02:25:10.000Z"))), LOST),
    ("recovered_line_still_not_storing", "the recovered line still says 'not storing now'", edit("b_recovered_now", swap("line", ": storing.", ": not storing now (the frames are kept on this device).")), LATER),
    ("recovered_line_still_counts_unknown", "the recovered line still counts an unknown record", edit("b_recovered_now", swap("line", "4 record(s) stored.", "4 record(s) stored; 1 not known whether stored.")), LATER),
    ("recovered_read_before_the_resume", "the recovered reads are stamped before the host was resumed",
     both(edit("b_recovered", setk("at", "2026-10-01T02:28:16.100Z")), edit("b_recovered_now", setk("at", "2026-10-01T02:28:16.100Z"))), LATER),
    ("card_whole_text_not_read", "one card's whole text is missing", edit("card_unavail", lambda r: r.pop("card_all_text")), ASK),
    ("card_says_frames_were_stored", "one card's whole text says frames were stored", edit("card_unavail", lambda r: r.__setitem__("card_all_text", r["card_all_text"] + "  The frames were stored in the test service.\n")), ASK),
    ("card_body_replaced_during_the_stall", "the whole card text differs at the stalled read", edit("card_stalled", setk("card_all_text", "\n  x\n  Selection - sent to the AI\n  (the card body was replaced)\n")), CARD),
    ("card_recovered_read_during_the_pause", "the 'recovered' card read is stamped during the pause", edit("card_recovered", setk("at", "2026-10-01T02:25:22.000Z")), CARD),
    ("previous_process_alive_at_relaunch", "the previous process's exit is after the next start", lambda run: results(run)["processes"]["app-main"].__setitem__("exited_at", "2026-10-01T02:28:30.0000000Z"), RELAUNCH),
    ("page_close_recorded_as_another_route", "the after-Stop close is not recorded as the page route", lambda run: results(run)["processes"]["app-main"].__setitem__("close_via", "wm_close"), "quit.after_stop_page_close"),
    ("exit_before_the_close_request", "the process exited before the close was requested", lambda run: results(run)["processes"]["app-final"].__setitem__("exited_at", "2026-10-01T02:29:51.9000000Z"), "quit.final_relaunch_close"),
    ("children_listing_empty", "the children listing before the idle close is empty", lambda run: results(run)["values"]["kids_a"].__setitem__("children", []), "quit.idle_native_close"),
    ("children_listing_of_another_process", "the children listing before the idle close is another process's",
     lambda run: results(run)["values"].__setitem__("kids_a", copy.deepcopy(results(run)["values"]["kids_n"])), "quit.idle_native_close"),
    ("wsl_child_before_the_relaunched_idle_close", "a wsl.exe child is listed before the relaunched idle close",
     lambda run: results(run)["values"]["kids_d"]["children"].append({"name": "wsl.exe", "pid": 2, "created": "2026-10-01T02:28:50.0000000Z"}), "quit.relaunched_idle_page_close"),
    ("capturing_before_the_final_close", "the read before the last close says a capture is running", edit("g_relaunched", setk("session", "Capturing x")), "quit.final_relaunch_close"),
    ("relaunch_reports_unknown_records", "the relaunch after Stop reports 2 unknown records", edit("c_relaunched", setk("unknown", 2, "l")), KEPT),
    ("final_relaunch_lists_no_ink", "the last relaunch lists no saved ink", edit("g_ink", setk("sessions", [])), KEPT),
    ("listed_wsl_child_not_rechecked", "a listed wsl.exe child is missing from the end check", lambda run: results(run)["wsl_seen"].pop(), RELEASE),
    ("watcher_ended_before_the_last_close", "the watcher's end is before the last app exit", lambda run: watch_event("watch_end")(run).__setitem__("at", "2026-10-01T02:29:45.000000+00:00"), RELEASE),
    ("runner_errors_listed", "the runner's errors list names a failed step", lambda run: results(run).__setitem__("errors", ["step 60: timed out waiting for the status"]), DONE),
    ("step_record_replaced_by_its_neighbour", "one step record is missing and its neighbour is there twice", step_record_replaced_by_its_neighbour, DONE),
    ("resume_logged_after_the_recovery_read", "the watcher's resume time is after the app's recovery read", lambda run: watch_event("resumed")(run).__setitem__("at", "2026-10-01T02:28:20.000000+00:00"), FAULT),
    ("watch_start_without_already_there", "the watcher's start does not say what was already in the copy", lambda run: watch_event("watch_start")(run).pop("already_there"), FAULT),
    ("job_range_covers_a_record_twice", "a job's range covers one server record twice and another none", job_range_covers_a_record_twice, COUNTS),
    ("other_kind_of_document_for_unavailable_stream", "the server holds a control_start for an unavailable stream", other_kind_of_document_for_unavailable_stream, COUNTS),
    ("second_stream_reports_not_sent", "the second stream's final status reports 1 not sent", edit("d_relaunched", setk("not_sent", 1, "l")), COUNTS),
    ("mismatch_list_not_reported", "the readback reports no mismatch list for a stream", lambda run: stream(run, 1).__setitem__("mismatches", None), COUNTS),
    ("by_kind_count_differs", "the database's count by kind differs from its document list", lambda run: run["readback.json"]["database"]["by_kind"].__setitem__("capture_record", 9), COUNTS),
    ("unavailable_stream_has_server_records", "the readback says an unavailable stream has a server record", lambda run: stream(run, 2).__setitem__("server_records", 1), COUNTS),
    ("conflicting_artifact_listed_first", "a second artifact document under the same ink name has another hash", conflicting_artifact_listed_first, COUNTS),
    ("checkpoint_without_a_result", "one hash checkpoint has no result", lambda run: results(run)["values"].pop("h_b-write"), ORIGINALS),
    ("manifest_vanished_at_the_end", "a capture manifest is gone at the last checkpoint", manifest_vanished_at_the_end, ORIGINALS),
    ("checkpoint_label_repeated", "one checkpoint step carries the label of another", checkpoint_label_repeated, ORIGINALS),
    ("unchanged_flag_is_a_string", "database_unchanged_by_readback is the text 'false'", lambda run: run["readback.json"].__setitem__("database_unchanged_by_readback", "false"), READONLY),
    ("readback_of_another_actor", "the readback names another actor", lambda run: run["readback.json"].__setitem__("actor", "lc-windows-http-someone-else"), READONLY),
    ("pre_start_host_exit_before_appear", "a host seen before a Start is logged as exiting before it appeared", first_unavailable_pre_start_host_exit_before_appear, RECONCILE),
]
# One mutation must not turn an observation into a pass: with only the flag changed, the app still said 'storing'.
NOT_ESTABLISHED = [("waiting_read_flag_only", "only the status flag of the read 8 s into the pause is set false", edit("b_paused_8s", setk("storing", False, "l")), WAITS)]

# ---- second hunt round: mostly evidence stamped at an impossible time, or wording outside the accepted copy -------------
def host_event(kind, nth, at):
    """Restamps the appear/exit event of the nth host this run's watcher saw (0 = first session, 1 = second, ...)."""
    def apply(run):
        pid = [e["pid"] for e in run["host-watch.jsonl"] if e["event"] == "appear"][nth]
        next(e for e in run["host-watch.jsonl"] if e["event"] == kind and e["pid"] == pid)["at"] = at
    return apply


def ended_line(stream_index, at):
    def apply(run):
        cap = run["capture-host/coordination.json"]["streams"][stream_index]["capture_session"]
        next(l for l in run[f"captures/{cap}/manifest.jsonl"] if l["kind"] == "ended")["at"] = at
    return apply


def value_copy(to, source):
    return lambda run: results(run)["values"].__setitem__(to, copy.deepcopy(results(run)["values"][source]))


def process(key, field, value):
    return lambda run: results(run)["processes"][key].__setitem__(field, value)


def step_where(pred, field, value):
    return lambda run: next(s for s in results(run)["steps"] if pred(s)).__setitem__(field, value)


def documents(run):
    return run["readback.json"]["database"]["documents"]


def record_stream(run, i):
    return run["capture-host/coordination.json"]["streams"][i]


def stalled_line_without_detail(r):
    r["line"] = r["line"].replace(" " + r["l"]["detail"] + ".", "")


def unavailable_card_extra_line(r):
    extra = "\nThe frames are saved in the test service."
    r["text"], r["card_all_text"] = r["text"] + extra, r["card_all_text"].rstrip("\n") + extra + "\n"


def committed_job_on_unavailable_stream(run):
    s = record_stream(run, 2)
    s["jobs"] = [{"key": s["source_id"] + ".b2-2", "from": 2, "through": 2, "records": 1, "status": "committed", "originals": []}]


def server_record_names_no_picture(run):
    rec = [d for d in documents(run) if d["kind"] == "capture_record"][3]["record"]
    rec["artifacts"] = [a for a in rec["artifacts"] if ".png." not in a]


def frame_document_of_another_frame(run):
    doc = [d for d in documents(run) if d["kind"] == "raw_capture_frame"][3]
    doc["key"] = doc["key"].rsplit(".", 1)[0] + ".f999"


def frame_size_differs_at_the_end(run):
    tree = results(run)["values"]["h_final"]
    tree[next(k for k in tree if "/frames/" in k)]["bytes"] += 7


def launch_names_an_earlier_process(run):
    launches = [s for s in results(run)["steps"] if s.get("kind") == "launchApp"]
    launches[1]["previous"] = copy.deepcopy(launches[0]["previous"])


def last_close_step_reports_exit_code_1(run):
    [s for s in results(run)["steps"] if s.get("kind") == "closeApp"][-1]["exit_code"] = 1


CURSOR = "run.cursor_static"
HUNT2 = [
    ("step_kind_differs_from_the_plan", "a planned stroke step is recorded as a sleep", step_where(lambda s: s.get("kind") == "stroke", "kind", "sleep"), DONE),
    ("session_host_logged_before_its_start_click", "the second session's host appears 1.3 s before the Start click", host_event("appear", 1, "2026-10-01T02:28:31.000000+00:00"), KEPT),
    ("session_host_gone_before_the_recovery", "the paused host's exit is logged 0.1 s after the resume, before the recovery read", host_event("exit", 0, "2026-10-01T02:28:16.900000+00:00"), FAULT),
    ("ended_line_after_the_process_exit", "the 'app was closed' line of the second session is stamped after that process exited", ended_line(1, "2026-10-01T02:28:47.000Z"), "quit.while_capturing_bounded_stop"),
    ("unavailable_ended_line_after_the_process_exit", "the 'app was closed' line of the fourth session is stamped after that process exited", ended_line(3, "2026-10-01T02:29:42.000Z"), "quit.unavailable_while_capturing"),
    ("host_exit_before_the_close_request", "the second session's host exit is logged before the close request", host_event("exit", 1, "2026-10-01T02:28:38.000000+00:00"), "quit.while_capturing_bounded_stop"),
    ("host_exit_before_it_appeared", "a host's exit is stamped before it appeared", host_event("exit", 2, "2026-10-01T02:24:35.000000+00:00"), RELEASE),
    ("exit_time_beyond_the_bound", "the last process's exit time is 10 s after the close request", process("app-final", "exited_at", "2026-10-01T02:30:02.2426462Z"), "quit.final_relaunch_close"),
    ("close_step_reports_exit_code_1", "the last close step reports exit code 1", last_close_step_reports_exit_code_1, "quit.final_relaunch_close"),
    ("wsl_child_in_capitals", "a child named WSL.EXE is listed before the relaunched idle close",
     lambda run: results(run)["values"]["kids_d"]["children"].append({"name": "WSL.EXE", "pid": 2, "created": "2026-10-01T02:28:50.0000000Z"}), "quit.relaunched_idle_page_close"),
    ("children_listing_from_before_start", "the listing judged before the after-Stop close is the one taken before Start", value_copy("kids_b_stopped", "kids_b_idle"), "quit.after_stop_page_close"),
    ("capturing_before_the_idle_close", "the read before the idle close says a capture is running", edit("a_idle", setk("session", "Capturing x")), "quit.idle_native_close"),
    ("capturing_before_the_relaunched_idle_close", "the read before the relaunched idle close says a capture is running", edit("d_relaunched", setk("session", "Capturing x")), "quit.relaunched_idle_page_close"),
    ("unavailable_stream_grant_consumed", "the record says the unavailable stream's grant was consumed", lambda run: record_stream(run, 2).__setitem__("grant", "consumed"), "quit.unavailable_after_stop"),
    ("control_app_launched_with_the_link", "the control app is recorded as launched with the link", process("app", "link", "main"), "quit.control_without_link"),
    ("launch_names_an_earlier_process", "a relaunch names a process two back as its previous one", launch_names_an_earlier_process, RELAUNCH),
    ("ink_list_reports_unreadable", "the ink list after a relaunch reports an unreadable file", edit("c_ink", setk("unreadable", 1)), KEPT),
    ("relaunched_read_before_the_relaunch", "the 'relaunched' status read is stamped before that process started", edit("c_relaunched", setk("at", "2026-10-01T02:28:22.000Z")), KEPT),
    ("pause_step_names_two_hosts", "the runner's pause step says the watcher named 2 hosts", step_where(lambda s: s.get("kind") == "hostPause", "hosts", 2), FAULT),
    ("frame_size_differs_at_the_end", "a retained frame has another size at the last checkpoint", frame_size_differs_at_the_end, ORIGINALS),
    ("header_claims_storage_with_the_link_off", "with the link off the header says frames are stored", edit("n_off", setk("ai", STORED_HEADER)), HEADER),
    ("header_adds_a_storage_promise", "a not-storing header adds that every frame from now on is saved in the service",
     edit("a_idle", swap("ai", " No AI is connected;", " Every frame captured from now on is saved in that service. No AI is connected;")), HEADER),
    ("header_says_an_ai_reads_the_frames", "the stalled header says the frames are read by an AI tutor", edit("b_stalled_now", swap("ai", "nothing is sent to any AI.", "the frames above are being read by the AI tutor.")), HEADER),
    ("storing_header_while_sends_stopped", "the status says sends have stopped while the header says storing", edit("b_recovered_now", setk("sends_stopped", True, "l")), HEADER),
    ("line_adds_a_refused_record", "the stalled line adds '1 refused'", edit("b_stalled_now", swap("line", "1 not known whether stored.", "1 not known whether stored; 1 refused.")), HEADER),
    ("status_refused_not_in_the_line", "the stalled status reports 1 refused; the line does not", edit("b_stalled_now", setk("refused", 1, "l")), HEADER),
    ("line_state_word_of_another_state", "a stopped read's line says 'not connected'", edit("e_idle", swap("line", ": stopped.", ": not connected (the frames stay on this device).")), HEADER),
    ("line_without_its_detail", "the stalled line no longer shows the detail", edit("b_stalled_now", stalled_line_without_detail), HEADER),
    ("read_replaced_by_an_earlier_read", "one read is a copy of an earlier read", value_copy("f_fail_now", "e_fail_now"), HEADER),
    ("unavailable_card_is_the_storing_card", "the unavailable card read is a copy of the card read while storing", value_copy("card_unavail", "card_open"), ASK),
    ("card_shows_an_ai_answer", "the card's whole text carries an 'AI answer' element", edit("card_unavail", lambda r: r.__setitem__("card_all_text", r["card_all_text"] + "  AI answer: the selection shows 2 + 2 = 4.\n")), ASK),
    ("card_text_with_a_storage_line", "the unavailable card gets a line saying frames are saved in the service", edit("card_unavail", unavailable_card_extra_line), ASK),
    ("hint_says_sent_to_the_ai", "the hint says the selection was sent to the AI", edit("card_unavail", swap("hint", "No AI is connected.", "No AI is connected to the pen; the selection was sent to the AI.")), ASK),
    ("card_shown_is_text", "the card's shown flag is the text 'false'", edit("card_unavail", setk("shown", "false")), ASK),
    ("waited_stalled_read_right_after_the_pause", "the waited-for stalled read is stamped 0.8 s after the pause", edit("b_stalled", setk("at", "2026-10-01T02:25:14.000Z")), LOST),
    ("record_at_the_stall_says_refused", "the record copied at the stall says the open job was refused",
     lambda run: next(j for j in run["out/copy-coord-stalled/coordination.json"]["streams"][0]["jobs"] if j["status"] != "committed").__setitem__("status", "refused"), LOST),
    ("committed_job_on_unavailable_stream", "the record holds a committed job for an unavailable stream", committed_job_on_unavailable_stream, COUNTS),
    ("job_without_server_receipt", "the readback says a committed job has no receipt on the server", lambda run: stream(run, 0)["jobs"][3].__setitem__("server_receipt", False), COUNTS),
    ("server_record_names_no_picture", "a server record names no picture", server_record_names_no_picture, COUNTS),
    ("stored_picture_differs_from_its_name", "a picture the server stores has another hash than its name",
     lambda run: next(d for d in documents(run) if d["kind"] == "artifact" and ".png." in d["key"])["artifact"].__setitem__("sha256", "0" * 64), COUNTS),
    ("frame_document_of_another_frame", "a server frame document is for a frame no record names", frame_document_of_another_frame, COUNTS),
    ("planned_beyond_the_last_job", "the record planned through a sequence its jobs never reached", lambda run: record_stream(run, 0).__setitem__("planned_through", 9), COUNTS),
    ("readback_before_the_run_ended", "the readback is stamped during the pause", lambda run: run["readback.json"].__setitem__("at", "2026-10-01T02:28:00.000000+00:00"), COUNTS),
    ("document_created_during_the_unavailable_part", "a server document was created while an unavailable stream was capturing",
     lambda run: next(d for d in documents(run) if d["kind"] == "authorization").__setitem__("created_at", "2026-10-01T02:29:10.000000+00:00"), COUNTS),
    ("continued_document_ends_with_undo", "the document saved after writing on ends with an undo", edit("saved_b-continued", lambda r: r["doc"].update(history=["add", "undo"], strokes=1)), CARD),
]
# These must leave their check at 'limit' and never at 'pass'.
NOT_ESTABLISHED_2 = [
    ("waiting_read_is_the_stalled_read", "the read 8 s into the pause is a copy of the stalled read", value_copy("b_paused_8s", "b_stalled_now"), WAITS),
    ("record_at_8s_of_another_stream", "the record copied 8 s into the pause is of another stream",
     lambda run: run["out/copy-coord-paused-8s/coordination.json"]["streams"][0].__setitem__("stream_id", "stream-ffffffffffffffffffffffff"), WAITS),
]
LIMIT_NOT_PASS = [("cursor_readings_missing", "the runner's cursor readings at start and end are missing", lambda run: results(run).pop("cursor"), CURSOR)]

CASES = [
    # (name, what is removed or falsified, mutation, check that must fail)
    ("resumed_names_no_host", "the resumed event names no host (lead finding 1)", no_resumed_host, FAULT),
    ("resumed_other_pid", "the resumed host has another PID than the paused session host", resumed_other_pid, FAULT),
    ("resumed_not_continued", "the resumed host is not marked continued", resumed_not_continued, FAULT),
    ("resumed_still_stopped", "the resumed host is still in state T", resumed_still_stopped, FAULT),
    ("no_resumed_event", "there is no resumed event", no_resumed_event, FAULT),
    ("paused_names_no_host", "the paused event names no host", no_paused_host, FAULT),
    ("paused_other_pid", "the paused host has another PID than the session host", paused_other_pid, FAULT),
    ("paused_and_resumed_other_pid", "both events name the same PID, but not the session host's", paused_and_resumed_other_pid, FAULT),
    ("no_ink_comparisons", "every ink-original comparison is removed from the readback (lead finding 2)", no_ink_comparisons, COUNTS),
    ("no_ink_comparisons_stream2", "the ink comparisons of the second stream only are removed", no_ink_comparisons_stream2, COUNTS),
    ("one_ink_comparison_missing", "one ink comparison is removed", one_ink_comparison_missing, COUNTS),
    ("ink_server_hash_differs", "one ink comparison's server hash differs from the local one", ink_server_hash_differs, COUNTS),
    ("ink_both_hashes_wrong_but_equal", "server and local hash are equal but not the hash in the artifact's name", ink_both_hashes_wrong_but_equal, COUNTS),
    ("ink_comparison_repeated", "one ink comparison is listed twice in its job", ink_comparison_repeated, COUNTS),
    ("ink_comparison_unrelated", "an ink comparison is replaced by a self-consistent one of the other stream", ink_comparison_unrelated, COUNTS),
    ("stored_ink_artifact_differs", "the artifact the server stores under that name has another hash", stored_ink_artifact_differs, COUNTS),
    ("server_record_without_its_ink", "a server record no longer names its ink original (record and server disagree)", server_record_without_its_ink, COUNTS),
    ("readback_job_repeated", "a readback job is listed twice", readback_job_repeated, COUNTS),
    ("readback_job_missing", "a readback job is missing", readback_job_missing, COUNTS),
    ("fewer_pictures_than_frames", "fewer picture comparisons than the server holds frames", fewer_pictures_than_frames, COUNTS),
    ("picture_mismatch", "the readback reports a raw-picture mismatch", picture_mismatch, COUNTS),
    ("unavailable_streams_not_in_record", "the two unavailable streams are missing from the record", unavailable_streams_not_in_record, COUNTS),
    ("record_on_server_for_unavailable_stream", "the server holds a stream document for an unavailable stream", record_on_server_for_unavailable_stream, COUNTS),
    ("no_wsl_child_seen", "no wsl.exe child was ever listed", no_wsl_child_seen, RELEASE),
    ("wsl_child_left", "a wsl.exe child is still running at the end", wsl_child_left, RELEASE),
    ("no_desktop_look_recorded", "the runner's look for other Electron apps is not in the results", no_desktop_look_recorded, QUIET),
    ("foreign_electron_seen", "another Electron app was seen at the end", foreign_electron_seen, QUIET),
]
CASES += HUNT + HUNT2
NOT_ESTABLISHED += NOT_ESTABLISHED_2



def main():
    p = argparse.ArgumentParser()
    p.add_argument("evidence")
    p.add_argument("--analyzer", default=os.path.join(HERE, "analyze_fix.py"))
    p.add_argument("--out")
    p.add_argument("--summary", help="write the analyzer's summary of the unmodified evidence here")
    p.add_argument("--no-assert", action="store_true")
    a = p.parse_args()
    committed = load(os.path.join(a.evidence, "summary.json"))
    base_inputs = rebuild(a.evidence)
    base = analyze(copy.deepcopy(base_inputs), a.analyzer)
    status = lambda summary: {c["id"]: c["status"] for c in summary.get("checks", [])}
    base_status = status(base)
    if a.summary and not base.get("error"):
        with open(a.summary, "w", encoding="utf-8") as f:
            f.write(json.dumps(base, ensure_ascii=False, indent=1) + "\n")
    report = {"analyzer_sha256": hashlib.sha256(open(a.analyzer, "rb").read()).hexdigest(),
              "evidence_summary_counts": committed["counts"], "baseline": {"counts": base.get("counts"), "error": base.get("error"),
              "same_statuses_as_the_committed_summary": base_status == status(committed),
              "checks_whose_observed_values_differ_from_the_committed_summary": sorted(c["id"] for c in base.get("checks", []) for d in committed["checks"] if d["id"] == c["id"] and d["observed"] != c["observed"])},
              "cases": []}
    bad = [] if base_status == status(committed) and not base.get("error") else ["the baseline does not reproduce the committed statuses"]
    for name, what, mutate, must_fail in CASES:
        run = copy.deepcopy(base_inputs)
        mutate(run)
        got = analyze(run, a.analyzer)
        got_status = status(got)
        case = {"case": name, "falsified": what, "check": must_fail, "status": got_status.get(must_fail), "expected": "fail", "counts": got.get("counts"), "error": got.get("error"),
                "other_checks_changed": {k: v for k, v in got_status.items() if k != must_fail and base_status.get(k) != v}}
        report["cases"].append(case)
        if case["status"] != "fail":
            bad.append(f"{name}: {must_fail} is {case['status']}, not fail")
    for name, what, mutate, target in NOT_ESTABLISHED:
        run = copy.deepcopy(base_inputs)
        mutate(run)
        got = analyze(run, a.analyzer)
        found = next((c for c in got.get("checks", []) if c["id"] == target), {})
        case = {"case": name, "falsified": what, "check": target, "status": found.get("status"), "expected": "limit, not established (never pass)", "note": found.get("note"),
                "counts": got.get("counts"), "error": got.get("error"), "other_checks_changed": {k: v for k, v in status(got).items() if k != target and base_status.get(k) != v}}
        report["cases"].append(case)
        if not (case["status"] == "limit" and str(case["note"]).startswith("not established")):
            bad.append(f"{name}: {target} is {case['status']} ({str(case['note'])[:40]})")
    for name, what, mutate, target in LIMIT_NOT_PASS:
        run = copy.deepcopy(base_inputs)
        mutate(run)
        got = analyze(run, a.analyzer)
        case = {"case": name, "falsified": what, "check": target, "status": status(got).get(target), "expected": "limit (never pass)", "counts": got.get("counts"), "error": got.get("error"),
                "other_checks_changed": {k: v for k, v in status(got).items() if k != target and base_status.get(k) != v}}
        report["cases"].append(case)
        if case["status"] != "limit":
            bad.append(f"{name}: {target} is {case['status']}, not limit")
    report["unexpected"] = bad
    text = json.dumps(report, ensure_ascii=False, indent=1) + "\n"
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
    print(json.dumps({"baseline": report["baseline"]["counts"], "same_as_committed": report["baseline"]["same_statuses_as_the_committed_summary"],
                      "cases": {c["case"]: c["status"] for c in report["cases"]}, "unexpected": bad}, indent=1))
    return 0 if a.no_assert or not bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
