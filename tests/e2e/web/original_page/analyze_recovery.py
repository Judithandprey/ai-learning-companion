"""Independent analysis of the bounded ink recovery + export retest (run.mjs QA_SCENARIO=recovery).

Checks the product's ink state against the extension's own IndexedDB records (main and copies, read
natively in the worker and parsed with the product's parseInk/parseCopy), the in-tab keep map, and the
actually downloaded Export files (parsed here). Owned synthetic page only.

Usage: python3 analyze_recovery.py <raw dir> <evidence dir>
Writes <evidence dir>/summary-recovery.json and copies the screenshots and downloaded export files.
"""

import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW, EVIDENCE = Path(sys.argv[1]), Path(sys.argv[2])
EVIDENCE.mkdir(parents=True, exist_ok=True)
for old in list(EVIDENCE.glob("rec-*.png")) + list((EVIDENCE / "exports").glob("*")):  # never mix runs
    old.unlink()
raw = json.loads((RAW / "raw-recovery.json").read_text())
run = raw["recovery"]
V = run["values"]
SHOTS = RAW / "shots-recovery"
checks = []
STATE = "worker read of companion state (isolated world)"
DB = "native IndexedDB reads in the worker with the product's parseInk/parseCopy"
KEEP = "worker read of the in-tab keep map (isolated world)"
COPY_KEYS = ["created_at", "doc", "forked_at", "forked_from", "id", "kind", "reason"]


REAL = "real browser scheduling (no injected delay)"
HELD = "held real IndexedDB transaction (harness-controlled delay of the product's save)"
ABORT = "injected transaction abort (put wrapper in the worker)"
STATIC = "static"
TIMING = {"rec.runner_clean": STATIC, "rec.provenance": STATIC, "rec.late_refusal_after_stop": HELD, "rec.late_refusal_after_address": HELD, "rec.away_hint_matches_state": HELD,
          "rec.failed_save_truthful": ABORT, "rec.export_downloaded_complete": ABORT, "rec.export_then_stop": ABORT, "rec.failed_save_recovers": ABORT,
          "rec.export_near_cleanup_deadline": ABORT + "; harness sleep 58.6 s between the two exports", "rec.fallback_copy_commit_failure": ABORT}


def check(cid, description, ok, observed, *instruments):
    checks.append({"id": cid, "description": description, "status": "pass" if ok else "fail",
                   "timing": TIMING.get(cid, REAL), "instrumentation": "; ".join(instruments) or STATE, "observed": observed})


def ink(key):
    return ((V.get(key) or {}).get("ink")) or {}


def st(key):
    return V.get(key) or {}


def copy_id(key):
    return (ink(key).get("copy") or {}).get("id")


def rows(db_key):
    v = V.get(db_key)
    return v if isinstance(v, list) else []


def main_row(db_key, sha):
    return next((r for r in rows(db_key) if r["sha"] == sha and r["copyId"] is None), None)


def copy_rows(db_key, sha):
    return [r for r in rows(db_key) if r["sha"] == sha and r["copyId"] is not None]


def copy_row(db_key, sha, cid):
    return next((r for r in copy_rows(db_key, sha) if r["copyId"] == cid), None)


def doc_of(row):
    if not row:
        return None
    value = json.loads(row["json"])
    return value.get("doc") if row["copyId"] else value


def strokes_kept(earlier, later):
    """Every stroke of `earlier` is present, unchanged, in `later`, and later's history extends earlier's."""
    return bool(earlier and later) and all(later["strokes"].get(k) == v for k, v in earlier["strokes"].items()) and later["history"][:len(earlier["history"])] == earlier["history"]


def whole(doc, visible):
    """The stored document is complete and consistent for what the tab shows."""
    return bool(doc) and doc.get("visible") == visible and doc.get("revision") == len(doc.get("history", [])) and all(i in doc.get("strokes", {}) for i in visible)


sha_of = lambda key: ink(key).get("page", {}).get("address_sha256", "")


def ms(t):
    return int(t[11:13]) * 3600000 + int(t[14:16]) * 60000 + round(float(t[17:-1]) * 1000) if isinstance(t, str) and len(t) >= 20 else None


def only_revision_bumped(before_row, after_row):
    """The stored main after the forged hold equals the pre-hold main except revision+1 (the forgery), i.e. the product never wrote it."""
    if not (before_row and after_row):
        return False
    b, a = json.loads(before_row["json"]), json.loads(after_row["json"])
    return a == {**b, "revision": b["revision"] + 1}

check("rec.runner_clean", "the browser run exited normally with no failed step", run.get("runner_exit") == 0 and not run.get("errors"),
      {"exit": run.get("runner_exit"), "errors": run.get("errors"), "steps_sha256": run.get("steps_sha256")}, "runner")
check("rec.provenance", "exact candidate copy, generated files current, loaded folder = tracked files",
      not raw["provenance"]["mismatches"] and len(raw["generated_check"].splitlines()) >= 5 and all(l.endswith("is current") for l in raw["generated_check"].splitlines()),
      {"baseline": raw["baseline"], "files_checked": raw["provenance"]["files_checked"], "generated": raw["generated_check"].splitlines(), "shipped": raw["shipped_files"]}, "static")

# ---- C: ordinary two-tab conflict -------------------------------------------------------------------------
c_sha = sha_of("cA1")
A1 = (ink("cA1").get("visible") or [None])[0]
B1 = (ink("cB1").get("visible") or [None, None])[-1]
A2 = (ink("cA2").get("visible") or [None, None])[-1]
A3 = (ink("cA3").get("visible") or [None])[-1]
cid = copy_id("cA2")
main1, copy1 = main_row("dbConf1", c_sha), copy_row("dbConf1", c_sha, cid)
check("rec.conflict_kept_as_copy", "two real tabs on one address: B reopens A's stroke and saves its own to the main record; A's next stroke is refused as a conflict and the "
      "whole of A's document is saved as a separate copy (reason conflict, forked from main after the shared stroke); A keeps writing to that copy; the main record keeps B's version",
      ink("cB0").get("visible") == [A1] and ink("cB1").get("status") == "saved" and ink("cA2").get("status") == "saved" and (ink("cA2").get("copy") or {}).get("reason") == "conflict"
      and (ink("cA2").get("copy") or {}).get("forked_from") is None and (ink("cA2").get("copy") or {}).get("forked_at") == 1 and copy_id("cA3") == cid and ink("cA3").get("visible") == [A1, A2, A3]
      and bool(main1) and main1["parse"]["ok"] and doc_of(main1)["visible"] == [A1, B1] and bool(copy1) and copy1["parse"]["ok"] and copy1["keys"] == COPY_KEYS
      and whole(doc_of(copy1), [A1, A2, A3]) and json.loads(copy1["json"])["kind"] == "lc-web-ink-copy/v1",
      {"B_reopened": ink("cB0").get("reason"), "copy": ink("cA2").get("copy"), "main_visible": doc_of(main1) and doc_of(main1)["visible"],
       "copy_visible": doc_of(copy1) and doc_of(copy1)["visible"], "copy_keys": copy1 and copy1["keys"]},
      STATE, DB, "tab B created/switched from the worker; tab B title set temporarily for the action invocation")
ro, sc = ink("cReopen"), ink("cShowCopy")
check("rec.conflict_reload_reopen", "after reloading tab A: the main record (B's version) is shown and the conflict copy is listed; the copy button shows the retained refused "
      "work (A1, A2, A3) as it was",
      ro.get("visible") == [A1, B1] and ro.get("copy") is None and [((o.get("copy") or {}).get("id"), o.get("visible"), o.get("history")) for o in ro.get("others", [])] == [(cid, 3, 3)]
      and sc.get("copy", {}).get("id") == cid and sc.get("visible") == [A1, A2, A3] and (sc.get("reason") or "").startswith("showing"),
      {"reopened": {k: ro.get(k) for k in ("visible", "reason")}, "others": ro.get("others"), "shown_copy": {k: sc.get(k) for k in ("visible", "reason")}}, STATE)
ce = ink("cEdited")
pieces = [s["id"] for s in ce.get("shown", []) if s.get("derived_from") == A2]
main2, copy2 = main_row("dbConf2", c_sha), copy_row("dbConf2", c_sha, cid)
check("rec.conflict_edit_retained", "the retained refused work is editable: a partial erase of A2 and a new stroke are saved to the same copy; the stored copy keeps every original "
      "(including A2) and its whole history; the main record is byte-unchanged",
      ce.get("status") == "saved" and copy_id("cEdited") == cid and A2 not in ce.get("visible", []) and len(pieces) == 2 and ce.get("visible", [])[0] == A1 and A3 in ce.get("visible", [])
      and bool(main1 and main2) and main2["json"] == main1["json"] and bool(copy2) and copy2["parse"]["ok"] and strokes_kept(doc_of(copy1), doc_of(copy2))
      and whole(doc_of(copy2), ce.get("visible")) and [h["op"] for h in doc_of(copy2)["history"]][-2:] == ["erase", "add"],
      {"visible": ce.get("visible"), "pieces_of_A2": pieces, "main_unchanged": bool(main1 and main2 and main2["json"] == main1["json"]),
       "copy_history_ops": doc_of(copy2) and [h["op"] for h in doc_of(copy2)["history"]]}, STATE, DB)
check("rec.conflict_second_reload", "a second fresh reload shows the main version again and the copy with its full edited history; showing the copy restores exactly the edited strokes",
      ink("cReopen2").get("visible") == [A1, B1] and [((o.get("copy") or {}).get("id"), o.get("history")) for o in ink("cReopen2").get("others", [])] == [(cid, 5)]
      and ink("cShowCopy2").get("visible") == ce.get("visible"),
      {"others": ink("cReopen2").get("others"), "shown_again": ink("cShowCopy2").get("visible")}, STATE)

# ---- U: unreadable at load ----------------------------------------------------------------------------------
b_sha = sha_of("bDrawn")
bad0, bad1, bad2 = main_row("dbBad0", b_sha), main_row("dbBad1", b_sha), main_row("dbBad2", b_sha)
b_cid = copy_id("bDrawn")
bc1, bc2 = copy_row("dbBad1", b_sha, b_cid), copy_row("dbBad2", b_sha, b_cid)
check("rec.unreadable_at_load", "FORGED unreadable main before load: the tab says new ink will be saved as a separate copy; the first stroke is saved as a readable copy "
      "(reason unreadable); the raw record is byte-unchanged; after a fresh reload the copy reopens and further editing is saved to it",
      bool(bad0) and not bad0["parse"]["ok"] and ink("bLoaded").get("reason") == "new ink will be saved as a separate copy" and ink("bLoaded").get("mainWritable") is False
      and ink("bDrawn").get("status") == "saved" and (ink("bDrawn").get("copy") or {}).get("reason") == "unreadable" and bool(bc1) and bc1["parse"]["ok"]
      and bad1["json"] == bad0["json"] and bad2["json"] == bad0["json"] and copy_id("bReopen") == b_cid and ink("bReopen").get("visible") == ink("bDrawn").get("visible")
      and ink("bEdited").get("status") == "saved" and copy_id("bEdited") == b_cid and strokes_kept(doc_of(bc1), doc_of(bc2)) and whole(doc_of(bc2), ink("bEdited").get("visible")),
      {"loaded": {k: ink("bLoaded").get(k) for k in ("reason", "mainWritable")}, "copy": ink("bDrawn").get("copy"), "raw_unchanged": bool(bad0 and bad2 and bad2["json"] == bad0["json"]),
       "reopened": ink("bReopen").get("reason")}, STATE, DB, "forged IndexedDB record (worker)")

# ---- L: unreadable AFTER load, main then copy ---------------------------------------------------------------------
l_sha = sha_of("lSaved")
L1 = (ink("lSaved").get("visible") or [None])[0]
late0, late1, late5 = main_row("dbLate0", l_sha), main_row("dbLate1", l_sha), main_row("dbLate5", l_sha)
X = copy_id("lAfterMain")
x1 = copy_row("dbLate1", l_sha, X)
check("rec.main_unreadable_after_load", "FORGED: the main record becomes unreadable after the page loaded it; the next stroke is refused as unreadable and the whole current document "
      "(including the stroke already saved) is saved as a new copy (reason unreadable, forked from main); the raw main record is byte-unchanged",
      bool(late0) and not late0["parse"]["ok"] and ink("lAfterMain").get("status") == "saved" and (ink("lAfterMain").get("copy") or {}).get("reason") == "unreadable"
      and (ink("lAfterMain").get("copy") or {}).get("forked_from") is None and ink("lAfterMain").get("mainWritable") is False and bool(x1) and x1["parse"]["ok"]
      and whole(doc_of(x1), ink("lAfterMain").get("visible")) and doc_of(x1)["strokes"].get(L1) == json.loads(late0["json"])["strokes"].get(L1) and late1["json"] == late0["json"],
      {"copy": ink("lAfterMain").get("copy"), "copy_visible": doc_of(x1) and doc_of(x1)["visible"], "raw_unchanged": bool(late0 and late1 and late1["json"] == late0["json"]),
       "forged_main_parse": late0 and late0["parse"]}, STATE, DB, "forged IndexedDB corruption after load (worker)")
x2 = copy_row("dbLate2", l_sha, X)
check("rec.main_unreadable_reload_edit", "after a fresh reload the copy (not the unreadable main) reopens with both strokes; a partial erase and a new stroke are saved to it with "
      "all originals and history kept",
      copy_id("lReopen") == X and ink("lReopen").get("visible") == ink("lAfterMain").get("visible") and (ink("lReopen").get("reason") or "").startswith("reopened 2 stroke(s) of")
      and ink("lEdited").get("status") == "saved" and copy_id("lEdited") == X and L1 not in ink("lEdited").get("visible", []) and strokes_kept(doc_of(x1), doc_of(x2))
      and whole(doc_of(x2), ink("lEdited").get("visible")),
      {"reopened": ink("lReopen").get("reason"), "edited_visible": ink("lEdited").get("visible")}, STATE, DB)
x3, x4 = copy_row("dbLate3", l_sha, X), copy_row("dbLate4", l_sha, X)
Y = copy_id("lAfterCopy")
y4 = copy_row("dbLate4", l_sha, Y)
check("rec.copy_unreadable_after_load", "FORGED: the copy the tab writes to becomes unreadable after load; the next stroke is saved as a new copy forked from that copy, holding "
      "the whole document and history; the unreadable copy and the raw main are byte-unchanged",
      bool(x3) and not x3["parse"]["ok"] and ink("lAfterCopy").get("status") == "saved" and Y not in (None, X) and (ink("lAfterCopy").get("copy") or {}).get("forked_from") == X
      and (ink("lAfterCopy").get("copy") or {}).get("reason") == "unreadable" and bool(x4) and x4["json"] == x3["json"] and bool(y4) and y4["parse"]["ok"]
      and strokes_kept(doc_of(x2), doc_of(y4)) and whole(doc_of(y4), ink("lAfterCopy").get("visible")) and ink("lAfterCopy").get("unreadableCopies") == 1
      and main_row("dbLate4", l_sha)["json"] == late0["json"],
      {"new_copy": ink("lAfterCopy").get("copy"), "unreadable_copy_unchanged": bool(x3 and x4 and x4["json"] == x3["json"]), "forged_copy_parse": x3 and x3["parse"]},
      STATE, DB, "forged IndexedDB corruption after load (worker)")
y5 = copy_row("dbLate5", l_sha, Y)
check("rec.copy_unreadable_reload_edit", "after a fresh reload the newest readable copy reopens with the complete document (one unreadable copy reported); editing continues into "
      "it; main and the unreadable copy stay unchanged",
      copy_id("lReopen2") == Y and ink("lReopen2").get("visible") == ink("lAfterCopy").get("visible") and ink("lReopen2").get("unreadableCopies") == 1
      and ink("lEdited2").get("status") == "saved" and copy_id("lEdited2") == Y and strokes_kept(doc_of(y4), doc_of(y5)) and whole(doc_of(y5), ink("lEdited2").get("visible"))
      and bool(late5) and late5["json"] == late0["json"] and copy_row("dbLate5", l_sha, X)["json"] == x3["json"],
      {"reopened": ink("lReopen2").get("reason"), "unreadable_copies": ink("lReopen2").get("unreadableCopies")}, STATE, DB)

# ---- S / A: late refusal after Stop / after an address change ---------------------------------------------------
def late_case(prefix, db_key, reopen_key, keep_pending, keep_after, release_key):
    sha = sha_of(f"{prefix}Saved")
    main = main_row(db_key, sha)
    copies = copy_rows(db_key, sha)
    doc = doc_of(copies[0]) if len(copies) == 1 else None
    rel = V.get(release_key) or {}
    return sha, main, copies, doc, rel


s_sha, s_main, s_copies, s_doc, s_rel = late_case("s", "dbStop1", "sReopen", "sKeepPending", "sKeepAfter", "stopReleased")
sp = V.get("sKeepPending") or []
s_pre = main_row("dbStop0", s_sha)
s_copy_created = json.loads(s_copies[0]["json"])["created_at"] if len(s_copies) == 1 else None
s_order = ms(V.get("sStopAt")) is not None and ms(s_rel.get("done")) is not None and ms(V.get("sStopAt")) < ms(s_rel.get("done")) <= (ms(s_copy_created) or -1)
check("rec.late_refusal_after_stop", "HELD real transaction: a stroke's save waits behind a held readwrite transaction (which also makes main unreadable); Stop is pressed while "
      "it is pending (held in the tab as 'saving'); after release the late unreadable answer is settled by saving the whole held document as one readable copy; the held "
      "entry clears; a restart reopens that copy with both strokes",
      ink("sPending").get("status") == "saving" and V.get("sStopped") == "ok" and "sAfterStop" in V and V["sAfterStop"] is None and len(sp) == 1 and sp[0].get("status") == "saving"
      and sp[0].get("visible") == 2 and s_order and V.get("sKeepAfter") == [] and bool(s_main) and not s_main["parse"]["ok"] and only_revision_bumped(s_pre, s_main)
      and s_doc is not None and s_doc["strokes"].get(ink("sSaved").get("visible", [None])[0]) == json.loads(s_pre["json"])["strokes"].get(ink("sSaved").get("visible", [None])[0])
      and len(s_copies) == 1 and s_copies[0]["parse"]["ok"] and json.loads(s_copies[0]["json"])["reason"] == "unreadable" and whole(s_doc, ink("sPending").get("visible"))
      and copy_id("sReopen") == s_copies[0]["copyId"] and ink("sReopen").get("visible") == ink("sPending").get("visible"),
      {"pending": ink("sPending").get("status"), "state_after_stop": V.get("sAfterStop"), "keep_pending": sp, "keep_after": V.get("sKeepAfter"), "hold": s_rel,
       "stop_at": V.get("sStopAt"), "copy_created_at": s_copy_created, "order_stop_then_refusal_then_copy": s_order, "raw_main_only_forged": only_revision_bumped(s_pre, s_main),
       "copies": len(s_copies), "reopened": ink("sReopen").get("reason")}, STATE, KEEP, DB, "held real IndexedDB transaction with forged corruption inside it (worker)")
a_sha, a_main, a_copies, a_doc, a_rel = late_case("a", "dbAddr1", "aBack", "aKeepPending", "aKeepAfter", "addrReleased")
ap = V.get("aKeepPending") or []
a_pre = main_row("dbAddr0", a_sha)
a_copy_created = json.loads(a_copies[0]["json"])["created_at"] if len(a_copies) == 1 else None
a_order = ms(V.get("aPushAt")) is not None and ms(a_rel.get("done")) is not None and ms(V.get("aPushAt")) < ms(a_rel.get("done")) <= (ms(a_copy_created) or -1)
check("rec.late_refusal_after_address", "HELD real transaction: the save is pending when the address changes (pushState; the other address stays loading, with no ink, while "
      "the hold lasts, then reports nothing saved; the pending document is held); after release the late unreadable answer saves the whole held document as one readable copy; "
      "the held entry clears; the raw main keeps only the forgery; returning shows that copy",
      ink("aPending").get("status") == "saving" and ink("aAway").get("visible") == [] and ink("aAway").get("held") == 1 and len(ap) == 1 and ap[0].get("status") == "saving"
      and V.get("aKeepAfter") == [] and ink("aAwayAfter").get("held") == 0 and ink("aAwayAfter").get("reason") == "nothing saved for this page yet" and a_order
      and bool(a_main) and not a_main["parse"]["ok"] and only_revision_bumped(a_pre, a_main) and len(a_copies) == 1 and a_copies[0]["parse"]["ok"]
      and whole(a_doc, ink("aPending").get("visible")) and copy_id("aBack") == a_copies[0]["copyId"] and ink("aBack").get("visible") == ink("aPending").get("visible"),
      {"away": {k: ink("aAway").get(k) for k in ("status", "visible", "held")}, "away_after": {k: ink("aAwayAfter").get(k) for k in ("status", "reason", "held")},
       "keep_pending": ap, "keep_after": V.get("aKeepAfter"), "push_at": V.get("aPushAt"), "copy_created_at": a_copy_created, "order_push_then_refusal_then_copy": a_order,
       "raw_main_only_forged": only_revision_bumped(a_pre, a_main), "copies": len(a_copies), "back": ink("aBack").get("reason")}, STATE, KEEP, DB, "held real IndexedDB transaction with forged corruption inside it (worker)", "pushState/replaceState")

seen = V.get("aAwayHintSeen") or {}
seen_text = " ".join(re.sub(r"<[^>]+>", " ", (seen.get("html") or [""])[0]).split()) if seen.get("count") == 1 else None
check("rec.away_hint_matches_state", "after the late copy is saved, the hint the user sees on the other address no longer claims unsaved ink of another address (the state "
      "says held 0)", seen_text is not None and "Unsaved ink of" not in seen_text and ink("aAwayAfter").get("held") == 0 and "Unsaved ink of" not in (ink("aAwayAfter").get("hint") or ""),
      {"rendered_hint": seen_text, "state_hint": ink("aAwayAfter").get("hint"), "state_held": ink("aAwayAfter").get("held")},
      "DevTools DOM search of the rendered hint (closed shadow root, read-only)", STATE)

# ---- F: injected transaction failure and real Export downloads ------------------------------------------------------
f_sha = sha_of("fSaved")
f0, f1, f2 = main_row("dbFail0", f_sha), main_row("dbFail1", f_sha), main_row("dbFail2", f_sha)
ff = ink("fFailed")
check("rec.failed_save_truthful", "INJECTED abort of the real transaction: the stroke is not reported saved (status failed, 'the browser did not store it (aborted)'); Export "
      "is offered; the stored record is byte-unchanged (no false saved result); no copy is made",
      ff.get("status") == "failed" and ff.get("reason") == "the browser did not store it (aborted)" and ff.get("exportable") is True and ff.get("copy") is None
      and bool(f0 and f1) and f1["json"] == f0["json"] and not copy_rows("dbFail1", f_sha),
      {"status": ff.get("status"), "reason": ff.get("reason"), "exportable": ff.get("exportable"), "record_unchanged": bool(f0 and f1 and f1["json"] == f0["json"])},
      STATE, DB, "injected transaction abort through a put wrapper in the worker")
downloads = run.get("downloads") or []
dl_dir = SHOTS / "downloads"
exports = {}
for d in downloads:
    path = dl_dir / d["name"]
    try:
        exports[d["name"]] = json.loads(path.read_text()) if path.exists() else None
    except ValueError:
        exports[d["name"]] = None
name_ok = lambda n: bool(re.fullmatch(r"learning-companion-ink-[0-9a-f]{12}-\d{14}\.json", n)) and n[23:35] == f_sha[:12]
F_VIS = ff.get("visible")


def export_ok(doc_json):
    if not isinstance(doc_json, dict):
        return False
    d = doc_json.get("doc") or {}
    return (doc_json.get("format") == "lc-web-ink-export/v1" and str(doc_json.get("not_saved", "")).startswith("failed: the browser did not store it (aborted)")
            and doc_json.get("copy") is None and d.get("page") == ff.get("page") and whole(d, F_VIS) and [h["op"] for h in d.get("history", [])] == ["add", "add"]
            and d["strokes"].get(F_VIS[0]) == json.loads(f0["json"])["strokes"].get(F_VIS[0])
            and all(len(d["strokes"][s["id"]]["points"]) == s["points"] and d["strokes"][s["id"]]["points"][0] == s["first"] for s in ff.get("shown", [])))


names = [d["name"] for d in downloads]
l0, ls, ld = (V.get("dlAfterExport0") or {}).get("files", []), (V.get("dlAfterStopExport") or {}).get("files", []), (V.get("dlAfterDeadline") or {}).get("files", [])
check("rec.export_downloaded_complete", "the first Export is an actual download: one complete JSON file (lc-web-ink-export/v1) holding the whole unsaved document (both "
      "strokes, history, page, 'failed: ...' reason); the tab stays on the page with the companion running",
      len((V.get("dlAfterExport0") or {}).get("files", [])) == 1 and all(name_ok(n) for n in names) and len(names) == 4 and all(export_ok(exports.get(n)) for n in names)
      and (V.get("fAfterExport0") or {}).get("href", "").endswith("rec-commit-failure") and (V.get("fAfterExport0") or {}).get("probe") is True and bool(ink("fExported").get("exportedAt")),
      {"files": downloads, "first_after_export": (V.get("dlAfterExport0") or {}).get("files"), "tab": V.get("fAfterExport0"),
       "content_checks": {n: export_ok(exports.get(n)) for n in names}}, "Browser.setDownloadBehavior allow into the run folder; files parsed by QA", STATE)
second = exports.get(ls[-1]["name"]) if len(ls) == 2 else None
click_to_stop_ms = (ms(V.get("stopExportAt")) - ms(second.get("exported_at"))) if second and ms(V.get("stopExportAt")) is not None else None
check("rec.export_then_stop", "Export followed by Stop with no pause between the click and the action (Stop revokes pending export URLs): the second file still downloads "
      "completely; the companion is stopped; the unsaved document is held in the tab as failed. The revocation itself is not observed",
      len(ls) == 2 and all(f["bytes"] > 0 for f in ls) and export_ok(second) and V.get("fStoppedAfterExport") == "ok" and "fAfterStop" in V and V["fAfterStop"] is None
      and click_to_stop_ms is not None and click_to_stop_ms < 400 and [(k.get("status"), k.get("visible")) for k in (V.get("fKeepAfterStop") or [])] == [("failed", 2)],
      {"files_after_stop": ls, "export_exported_at": second and second.get("exported_at"), "stop_returned_at": V.get("stopExportAt"),
       "export_to_stop_upper_bound_ms": click_to_stop_ms, "state_after_stop": V.get("fAfterStop"), "keep": V.get("fKeepAfterStop")},
      "Browser.setDownloadBehavior allow; files parsed by QA", KEEP, STATE)
late_pair = [exports.get(f["name"]) for f in ld[2:]] if len(ld) == 4 else [None, None]
e1, e2 = [(x or {}).get("exported_at") for x in late_pair]
gap = (ms(e2) - ms(e1)) if ms(e1) is not None and ms(e2) is not None else None
check("rec.export_near_cleanup_deadline", "after a restart (the held failed document is restored and still refused), an Export and a second Export about 59 s later, just before "
      "the shared 60 s URL cleanup: both files download completely",
      ink("fRestored").get("status") == "failed" and ink("fRestored").get("visible") == F_VIS and gap is not None and 58000 <= gap < 60000 and len(ld) == 4
      and all(export_ok(exports.get(f["name"])) for f in ld[2:]) and (V.get("fAfterDeadline") or {}).get("probe") is True,
      {"restored": {k: ink("fRestored").get(k) for k in ("status", "reason")}, "export1_exported_at": e1, "export2_exported_at": e2, "gap_ms": gap,
       "margin_before_first_deadline_ms": (60000 - gap) if gap is not None else None, "note": "the revocation itself is not observed", "files": ld},
      "Browser.setDownloadBehavior allow; files parsed by QA", STATE)
check("rec.failed_save_recovers", "after the injection is removed, the next stroke saves the whole document (all three strokes) to the main record",
      ink("fRecovered").get("status") == "saved" and len(ink("fRecovered").get("visible", [])) == 3 and bool(f2) and f2["parse"]["ok"] and whole(json.loads(f2["json"]), ink("fRecovered").get("visible"))
      and strokes_kept(json.loads(f0["json"]), json.loads(f2["json"])),
      {"status": ink("fRecovered").get("status"), "stored_visible": f2 and json.loads(f2["json"])["visible"]}, STATE, DB)

# ---- FC: fallback copy commit failure -------------------------------------------------------------------------------
g_sha = sha_of("gSaved")
g_cid = copy_id("gFailed")
gc2 = copy_row("dbFc2", g_sha, g_cid)
check("rec.fallback_copy_commit_failure", "FORGED unreadable main plus INJECTED abort: the refused stroke's fallback copy cannot be committed, so it stays failed and exportable with "
      "no durable copy claimed; after the injection is removed the retry uses the same copy id and saves all three strokes; a fresh reload reopens that copy",
      ink("gFailed").get("status") == "failed" and g_cid is not None and ink("gFailed").get("exportable") is True and not copy_rows("dbFc1", g_sha)
      and bool(main_row("dbFc0", g_sha)) and main_row("dbFc1", g_sha)["json"] == main_row("dbFc0", g_sha)["json"] == main_row("dbFc2", g_sha)["json"]
      and ink("gRecovered").get("status") == "saved" and copy_id("gRecovered") == g_cid and bool(gc2) and gc2["parse"]["ok"] and whole(doc_of(gc2), ink("gRecovered").get("visible"))
      and len(ink("gRecovered").get("visible", [])) == 3 and copy_id("gReopen") == g_cid and ink("gReopen").get("visible") == ink("gRecovered").get("visible"),
      {"failed": {k: ink("gFailed").get(k) for k in ("status", "reason", "exportable")}, "copy_id": g_cid, "copies_while_failed": len(copy_rows("dbFc1", g_sha)),
       "recovered": ink("gRecovered").get("status"), "reopened": ink("gReopen").get("reason")}, STATE, DB, "forged corruption + injected transaction abort (worker)")

# ---- IR2: malformed copy description ----------------------------------------------------------------------------------
i_sha = sha_of("iSaved")
probe_row = copy_row("dbIr2", i_sha, "00112233445566aa")
mid, after_upper = {r["key"]: r["json"] for r in rows("dbIr2Mid")}, {r["key"]: r["json"] for r in rows("dbIr2")}
upper = [r["key"] for r in rows("dbIr2") if r["sha"] is None or "ABCDEF0123456789" in r["key"]] + ([] if mid == after_upper else ["store changed by the upper-case probe"])
check("rec.ir2_extra_keys", "a save message whose copy description carries extra keys (kind 'lc-web-ink/v1', doc, extra), sent from the tab's isolated world (real sender), is "
      "stored as a supported copy: exactly the seven envelope keys, kind lc-web-ink-copy/v1, readable by the product's reader and listed on reopen; an upper-case id is refused "
      "without writing",
      (V.get("ir2Extra") or {}).get("answer") == {"ok": True} and bool(probe_row) and probe_row["parse"]["ok"] and probe_row["keys"] == COPY_KEYS
      and json.loads(probe_row["json"])["kind"] == "lc-web-ink-copy/v1" and "extra" not in json.loads(probe_row["json"])
      and (V.get("ir2Upper") or {}).get("answer") == {"ok": False, "reason": "not a copy this version writes"} and not upper
      and "00112233445566aa" in [(o.get("copy") or {}).get("id") for o in ink("iReopen").get("others", [])] and ink("iReopen").get("unreadableCopies") == 0,
      {"extra_answer": (V.get("ir2Extra") or {}).get("answer"), "stored_keys": probe_row and probe_row["keys"], "upper_answer": (V.get("ir2Upper") or {}).get("answer"),
       "reopen_others": [(o.get("copy") or {}).get("id") for o in ink("iReopen").get("others", [])]}, "focused message probe from the isolated world (real sender)", DB, STATE)

cap_all, msg_all = V.get("capturesAll") or {}, V.get("messagesAll") or {}
check("rec.recovery_never_captures", "none of the recovery, conflict, failure or export paths requested a capture: no captureVisibleTab call and only ink/stop message types",
      not cap_all.get("lost") and cap_all.get("total") == 0 and not msg_all.get("lost") and set(msg_all.get("types", [])) <= {"lc-ink-load/v1", "lc-ink-save/v1", "lc-stopped/v1"},
      {"captures": cap_all.get("total"), "message_types": msg_all.get("types")}, "runtime.onMessage spy (types only) + captureVisibleTab pass-through wrapper")

for f in SHOTS.glob("rec-*.png"):
    shutil.copyfile(f, EVIDENCE / f.name)
if dl_dir.exists():
    (EVIDENCE / "exports").mkdir(exist_ok=True)
    for f in dl_dir.iterdir():
        shutil.copyfile(f, EVIDENCE / "exports" / f.name)
failed = [c["id"] for c in checks if c["status"] != "pass"]
summary = {
    "kind": "qa-original-page-recovery-summary/v1", "baseline": raw["baseline"], "browser": V.get("userAgent"), "run": {"started_at": raw["started_at"], "finished_at": raw["finished_at"]},
    "harness_sha256": {**raw.get("harness", {}), "analyze_recovery_now": hashlib.sha256((HERE / "analyze_recovery.py").read_bytes()).hexdigest()},
    "scope": ("Browser component only: the shipped WebExtension, unchanged, in fresh-profile headless Edge on Windows (WSL-driven), on QA's owned synthetic course page. "
              "Start/stop by DevTools Extensions.triggerAction; product buttons pressed with trusted CDP mouse clicks; mouse strokes. Harness controls: worker state and keep-map "
              "reads, native IndexedDB reads parsed with the product's reader, FORGED unreadable records (before and after load), a HELD real readwrite transaction, an INJECTED "
              "transaction abort (put wrapper), a focused IR2 message probe, real Export downloads into the run folder, tab creation/switching from the worker with a temporary "
              "title, pushState/replaceState and CDP reload/navigate. No provider, AI, Safari, iPad or Notability."),
    "downloads": downloads,
    "summary": {"total": len(checks), "passed": len(checks) - len(failed), "failed": failed},
    "checks": checks,
}
text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
if re.search(r"[A-Za-z]:\\\\Users\\\\|/mnt/c/Users/|AppData|data:image", text):
    raise SystemExit("refusing to write summary-recovery.json: it contains a local profile path or image data")
(EVIDENCE / "summary-recovery.json").write_text(text)
print(json.dumps(summary["summary"], indent=1))
