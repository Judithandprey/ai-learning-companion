"""Independent analysis of the integrated capture + editable ink pass (run.mjs QA_SCENARIO=ink).

Checks the product's ink state against the extension's own IndexedDB documents (read natively in the
worker), against DevTools screenshots of the page (pixels decoded here), against the product's card read
with DevTools DOM search, and against the capture wrapper and message spy for "no automatic capture".
Synthetic owned page only; every screenshot is QA's own page.

Usage: python3 analyze_ink.py <raw dir> <evidence dir>   (run after analyze.py, which clears PNGs)
Writes <evidence dir>/summary-ink.json and copies the deciding screenshots and the exact ASK capture.
"""

import base64
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "ios" / "qa_ios_01"))
from check import png_rgba  # noqa: E402

RAW, EVIDENCE = Path(sys.argv[1]), Path(sys.argv[2])
EVIDENCE.mkdir(parents=True, exist_ok=True)
for old in EVIDENCE.glob("ink-*.png"):
    old.unlink()
raw = json.loads((RAW / "raw-ink.json").read_text())
V = raw["ink"]["values"]
SHOTS = RAW / "shots-ink"
INK, SCREEN, DASHED = (28, 28, 30), (110, 63, 209), (141, 141, 142)
Y1, Y2, Y5, XL, XR, XCROSS, XERASE = 300, 380, 460, 960, 1180, 1070, 1000
checks = []
STATE = "worker read of companion state (isolated world)"
DB = "native IndexedDB reads in the worker (read-only helpers)"
SHOT = "DevTools screenshots decoded by QA"
SPY = "runtime.onMessage spy (types only) + captureVisibleTab pass-through wrapper"
CARD = "DevTools DOM search of the product's card (closed shadow root, read-only)"
EDIT = "harness-issued main-world page edits"
POINTER = "page pointer counter (main world)"


def check(cid, description, ok, observed, *instruments):
    checks.append({"id": cid, "description": description, "status": "pass" if ok else "fail",
                   "timing": "real browser scheduling (no injected delay)", "instrumentation": "; ".join(instruments) or STATE, "observed": observed})


def ink(key):
    return ((V.get(key) or {}).get("ink")) or {}


def st(key):
    return V.get(key) or {}


def shown(key):
    return {s["id"]: s for s in ink(key).get("shown", [])}


def unc(key):
    return {s["id"]: s["uncertain"] for s in ink(key).get("shown", [])}


def row_for(db_key, sha):
    for r in V.get(db_key) or []:
        if r["key"].endswith(" " + sha):
            return r
    return None


def json_of(db_key, sha):
    r = row_for(db_key, sha)
    return json.loads(r["json"]) if r else None


def img(name):
    return png_rgba(SHOTS / f"{name}.png")


def near(p, c, tol):
    return abs(p[0] - c[0]) + abs(p[1] - c[1]) + abs(p[2] - c[2]) <= tol


def px(image, x, y):
    return tuple(image[2][y][4 * x:4 * x + 3])


def band(image, y, x0, x1, color, tol, half=3):
    """How many columns in x0..x1 have the colour somewhere within y +- half."""
    return sum(1 for x in range(x0, x1 + 1) if any(near(px(image, x, yy), color, tol) for yy in range(y - half, y + half + 1)))


def rows_with(image, x0, x1, color, tol, need=60, y0=100, y1=700):
    """Rows (within the margin strokes' band, below the toolbar and above the probe's card) holding the colour."""
    return [y for y in range(y0, min(y1, image[1])) if sum(1 for x in range(x0, x1 + 1) if near(px(image, x, y), color, tol)) >= need]


def runs(image, y, x0, x1, color, tol, half=2):
    """Number of separate coloured runs along a row (dashes give many, a solid line gives one)."""
    on = [any(near(px(image, x, yy), color, tol) for yy in range(y - half, y + half + 1)) for x in range(x0, x1 + 1)]
    return sum(1 for i, v in enumerate(on) if v and (i == 0 or not on[i - 1]))


def centers(rows):
    groups, cur = [], []
    for y in rows:
        if cur and y != cur[-1] + 1:
            groups.append(cur)
            cur = []
        cur.append(y)
    if cur:
        groups.append(cur)
    return [round(sum(g) / len(g)) for g in groups]


def entries(key):
    return (V.get(key) or {}).get("entries", [])


def msg_types(key):
    return [e.get("type") for e in entries(key)]


def card(key):
    c = V.get(key) or {}
    html = (c.get("html") or [""])[0] if c.get("count") == 1 else None
    return {"count": c.get("count"), "hidden": html is not None and bool(re.search(r"<section[^>]*\bhidden\b", html)), "text": " ".join(re.sub(r"<[^>]+>", " ", html or "").split())}


def pointer_ok(key, at_least=2):
    p = (V.get(key) or {}).get("pointer") or {}
    return p.get("down", 0) >= at_least and p.get("up", 0) >= at_least


INK_TYPES = {"lc-ink-load/v1", "lc-ink-save/v1", "lc-stopped/v1"}

# ---- integrity -------------------------------------------------------------------------------------------
run = raw["ink"]
check("ink.runner_clean", "the browser run exited normally with no failed step", run.get("runner_exit") == 0 and not run.get("errors"),
      {"exit": run.get("runner_exit"), "errors": run.get("errors"), "steps_sha256": run.get("steps_sha256")}, "runner")
check("ink.provenance", "exact candidate copy, generated files current, loaded folder = tracked files",
      not raw["provenance"]["mismatches"] and all(l.endswith("is current") for l in raw["generated_check"].splitlines()),
      {"baseline": raw["baseline"], "files_checked": raw["provenance"]["files_checked"], "generated": raw["generated_check"].splitlines(), "shipped": raw["shipped_files"]}, "static")
cap_keys = ["logWriting", "logAsk", "logCancel", "logBeforeReload", "logReopen", "logSource", "logConflict"]
spy_keys = ["msgWriting", "msgAsk", "msgCancel", "msgBeforeReload", "msgReopen", "msgSource", "msgConflict"]


def chained(keys):
    total, ok = 0, True
    for k in keys:
        v = V.get(k) or {"lost": True}
        ok = ok and not v.get("lost") and v.get("total") == total + len(v.get("entries", []))
        total = v.get("total", total)
    return ok


check("ink.logs_intact", "every wrapper and spy read is present and the reads chain (nothing lost between reads), so 'no capture' results are not vacuous",
      chained(cap_keys) and chained(spy_keys), {"wrapper_totals": [(V.get(k) or {}).get("total") for k in cap_keys], "spy_totals": [(V.get(k) or {}).get("total") for k in spy_keys]}, SPY)

# ---- I: NAV, explicit mouse WRITE, draft -------------------------------------------------------------------
i0, inav, ioff = ink("i0"), ink("iNav"), ink("iMouseOff")
check("ink.defaults_and_nav", "the companion starts in NAV with mouse writing off, pen tool, content placement and a ready store; pen and mouse drags in NAV reach the "
      "page's own pointer listeners and draw nothing",
      st("i0").get("mode") == "NAV" and i0.get("mouseWrites") is False and i0.get("tool") == "pen" and i0.get("display") == "content" and i0.get("status") == "ready"
      and inav.get("revision") == 0 and st("iNav").get("mode") == "NAV" and pointer_ok("navPointer"),
      {"i0": {k: i0.get(k) for k in ("status", "reason", "tool", "display", "mouseWrites")}, "after_nav_drags": inav.get("revision"), "page_pointer": (V.get("navPointer") or {}).get("pointer")},
      STATE, POINTER)
check("ink.write_mouse_off", "explicit WRITE from the toolbar; with mouse writing off a mouse drag draws nothing",
      st("iWrite").get("mode") == "WRITE" and ioff.get("revision") == 0 and ioff.get("mouseWrites") is False, {"mode": st("iWrite").get("mode"), "revision": ioff.get("revision")})
s1 = ink("iS1")
check("ink.pen_writes", "in WRITE the pen writes (CDP pen input, not Apple Pencil): one pen stroke, saved", s1.get("revision") == 1 and [s["input"] for s in s1.get("shown", [])] == ["pen"]
      and s1.get("status") == "saved", {"shown": s1.get("shown"), "status": s1.get("status")}, STATE, "CDP pen")
fs = V.get("fingerScroll") or {}
check("ink.finger_in_write_draws_nothing", "a one-finger vertical drag in WRITE (CDP touch emulation, not a real finger) draws nothing and scrolls the page",
      ink("iFinger").get("revision") == 1 and ink("iFinger").get("visible") == s1.get("visible") and (fs.get("scrollY") or 0) > 0 and st("iFinger").get("mode") == "WRITE"
      and V.get("fingerSettled") == 0,
      {"revision": ink("iFinger").get("revision"), "page_after": fs, "scroll_after_return": V.get("fingerSettled")}, STATE, "CDP touch emulation")
draft = ink("iDraft")
ids = draft.get("visible", [])
d_shown = shown("iDraft")
check("ink.mouse_enabled_draft", "the Mouse button explicitly enables mouse writing; a short draft: pen stroke, mouse stroke, screen-fixed mouse stroke; all saved, anchored and solid",
      ink("iMouseOn").get("mouseWrites") is True and len(ids) == 3 and [d_shown[i]["input"] for i in ids] == ["pen", "mouse", "mouse"]
      and [d_shown[i]["display"] for i in ids] == ["content", "content", "screen"] and all(d_shown[i]["anchored"] and not d_shown[i]["uncertain"] for i in ids)
      and draft.get("history") == ["add"] * 3 and draft.get("status") == "saved", {"visible": ids, "shown": draft.get("shown"), "history": draft.get("history")})
S1, S2, S3 = (ids + [None] * 3)[:3]

# ---- partial erase, undo, redo, original stacking ------------------------------------------------------------
er, un, rd = ink("iErased"), ink("iUndo"), ink("iRedo")
er_shown = shown("iErased")
pieces = [i for i in er.get("visible", []) if er_shown.get(i, {}).get("derived_from") == S2]
sha = draft.get("page", {}).get("address_sha256", "")
before, after = json_of("dbDraft", sha), json_of("dbErased", sha)
check("ink.partial_erase", "erasing across one stroke removes only the part it passes over: the stroke is replaced by two pieces derived from it at its own place in the drawing "
      "order; the other strokes are untouched; the original stays stored unchanged",
      S2 not in er.get("visible", []) and len(pieces) == 2 and er.get("visible") == [S1, *pieces, S3] and er.get("history") == ["add", "add", "add", "erase"]
      and bool(before) and bool(after) and all(after["strokes"].get(k) == before["strokes"].get(k) for k in (S1, S2, S3)) and er.get("strokes") == 5,
      {"visible": er.get("visible"), "pieces": {p: er_shown[p] for p in pieces}, "stored_original_unchanged": bool(before and after and after["strokes"].get(S2) == before["strokes"].get(S2))},
      STATE, DB)
check("ink.undo_redo_order", "undo restores the whole original stroke at its original place in the drawing order; redo restores exactly the erased state",
      un.get("visible") == ids and rd.get("visible") == er.get("visible") and un.get("history")[-1:] == ["undo"] and rd.get("history")[-1:] == ["redo"] and un.get("redo") == 1 and rd.get("redo") == 0,
      {"undo_visible": un.get("visible"), "redo_visible": rd.get("visible")})
pix = {}
for name in ("ink-01-draft", "ink-02-erased", "ink-03-undo", "ink-04-redo"):
    im = img(name)
    pix[name] = {"S1_row": band(im, Y1, XL + 5, XR - 5, INK, 60), "S2_left": band(im, Y2, XL + 5, XERASE - 15, INK, 60), "S2_gap": band(im, Y2, XERASE - 4, XERASE + 4, INK, 60),
                 "S2_right": band(im, Y2, XERASE + 15, XCROSS - 8, INK, 60), "S3_column": sum(1 for y in range(Y2 - 38, Y2 + 39) if near(px(im, XCROSS, y), SCREEN, 60)),
                 "crossing": list(px(im, XCROSS, Y2)), "crossing_is_screen_ink": near(px(im, XCROSS, Y2), SCREEN, 60)}
p1, p2, p3, p4 = (pix[n] for n in ("ink-01-draft", "ink-02-erased", "ink-03-undo", "ink-04-redo"))
check("ink.pixels_erase_undo_redo", "DevTools screenshots: the erase leaves a gap only where the eraser passed (both sides remain); undo fills it; redo reopens it; the later "
      "stroke stays on top at the crossing in every state (with the model's drawing order, this shows the original stacking)",
      p1["S2_gap"] == 9 and p2["S2_gap"] == 0 and p3["S2_gap"] == 9 and p4["S2_gap"] == 0 and min(p2["S2_left"], p2["S2_right"], p4["S2_left"], p4["S2_right"]) > 20
      and all(p["crossing_is_screen_ink"] and p["S3_column"] >= 70 and p["S1_row"] >= 200 for p in (p1, p2, p3, p4)), pix, SHOT)

# ---- no capture / help from writing --------------------------------------------------------------------------
cw = card("cardWriting")
check("ink.writing_never_captures_or_explains", "drawing, erasing, undo and redo send only ink load/save messages (no capture request, no screenshot, one save per change) "
      "and show no card or explanation",
      len(entries("logWriting")) == 0 and set(msg_types("msgWriting")) <= INK_TYPES and msg_types("msgWriting").count("lc-ink-save/v1") == 6
      and st("iRedo").get("captures") == 0 and st("iRedo").get("last") is None and cw["count"] == 1 and cw["hidden"],
      {"screenshots": len(entries("logWriting")), "messages": msg_types("msgWriting"), "product_last_capture": st("iRedo").get("last"), "card": cw}, SPY, CARD, STATE)

# ---- ASK finish / cancel restore WRITE ----------------------------------------------------------------------
af = ink("iAskFinished")
ask_log = entries("logAsk")
ask_last = st("iAskFinished").get("last") or {}
ask_ink = None
if len(ask_log) == 1 and ask_log[0].get("ok"):
    data = base64.b64decode(ask_log[0]["dataUrl"].split(",", 1)[1])
    (EVIDENCE / "ink-ask-capture.png").write_bytes(data)
    cap = png_rgba(EVIDENCE / "ink-ask-capture.png")
    ask_ink = {"sha256": hashlib.sha256(data).hexdigest(), "matches_product": hashlib.sha256(data).hexdigest() == (ask_last.get("image") or {}).get("sha256"),
               "S1_ink_columns_in_image": band(cap, Y1, XL + 5, XR - 5, INK, 60), "crop": ask_last.get("crop"), "crop_dark_share": ask_last.get("cropDarkShare")}
ca = card("cardAsk")
check("ink.ask_finish_restores_write", "ASK from WRITE (eraser tool, screen-fixed placement), then a finished pen mark: exactly one capture, whose exact image contains the "
      "user's ink; the card says the source is not registered and nothing was explained; back to WRITE with the same tool, mouse setting, placement and strokes",
      ink("iBeforeAsk").get("display") == "screen" and st("iAsk").get("mode") == "ASK" and st("iAskFinished").get("mode") == "WRITE" and af.get("tool") == "eraser"
      and af.get("mouseWrites") is True and af.get("display") == "screen" and af.get("visible") == rd.get("visible") and af.get("revision") == rd.get("revision")
      and st("iAskFinished").get("captures") == 1 and msg_types("msgAsk") == ["lc-capture/v1"] and ask_last.get("status") == "received" and bool(ask_ink)
      and ask_ink["matches_product"] and ask_ink["S1_ink_columns_in_image"] >= 200 and (ask_ink["crop_dark_share"] or 0) > 0
      and ca["count"] == 1 and not ca["hidden"] and "REGISTERED" in ca["text"].upper() and "explained" in ca["text"],
      {"modes": [st("iAsk").get("mode"), st("iAskFinished").get("mode")], "tool": af.get("tool"), "mouseWrites": af.get("mouseWrites"), "display": af.get("display"),
       "ask_capture": ask_ink, "capture_messages": msg_types("msgAsk"), "card_text": ca["text"],
       "note": "the product records this CDP pen mark as inputMode 'pencil_ask'; that is its name for pen-type input, not Apple Pencil evidence"},
      STATE, SPY, CARD, "exact ASK capture PNG decoded by QA")
check("ink.ask_cancel_restores_write", "ASK cancelled with Cancel, and ASK entered then cancelled by pressing ASK again: both return to WRITE; no capture; strokes unchanged",
      st("iAsk2").get("mode") == "ASK" and st("iCancelled").get("mode") == "WRITE" and st("iAsk3").get("mode") == "ASK" and st("iCancelled2").get("mode") == "WRITE"
      and len(entries("logCancel")) == 0 and "lc-capture/v1" not in msg_types("msgCancel") and st("iCancelled2").get("captures") == 1
      and ink("iCancelled2").get("visible") == rd.get("visible"),
      {"modes": [st(k).get("mode") for k in ("iAsk2", "iCancelled", "iAsk3", "iCancelled2")], "captures": len(entries("logCancel"))}, STATE, SPY)
s5 = ink("iS5")
s5_last = (s5.get("shown") or [{}])[-1]
check("ink.continue_writing", "writing continues in the restored WRITE: a new content-placed mouse stroke is added on top and saved; writing does not change the card",
      s5.get("revision") == rd.get("revision") + 1 and s5.get("visible")[:-1] == rd.get("visible") and s5.get("status") == "saved" and s5.get("tool") == "pen"
      and s5_last.get("input") == "mouse" and s5_last.get("display") == "content" and card("cardAfterWriting") == ca,
      {"visible": s5.get("visible"), "last": s5_last, "card_unchanged": card("cardAfterWriting") == ca}, STATE, CARD)
check("ink.nav_button", "the NAV button: pen and mouse drags reach the page and draw nothing; pressing WRITE again restores writing with the mouse setting, tool and placement kept",
      st("iNavButton").get("mode") == "NAV" and ink("iNavDrawn").get("revision") == s5.get("revision") and pointer_ok("navButtonPointer")
      and st("iWriteAgain").get("mode") == "WRITE" and ink("iWriteAgain").get("mouseWrites") is True and ink("iWriteAgain").get("tool") == "pen" and ink("iWriteAgain").get("display") == "content",
      {"nav": st("iNavButton").get("mode"), "revision_after_nav_drags": ink("iNavDrawn").get("revision"), "page_pointer": (V.get("navButtonPointer") or {}).get("pointer"),
       "write_again": {k: ink("iWriteAgain").get(k) for k in ("mouseWrites", "tool", "display")}}, STATE, POINTER)

# ---- placements ------------------------------------------------------------------------------------------------
b6, b7 = img("ink-06-before-scroll"), img("ink-07-scrolled")
dark6, dark7 = centers(rows_with(b6, 940, 1195, INK, 60)), centers(rows_with(b7, 940, 1195, INK, 60))
purple6, purple7 = rows_with(b6, XCROSS - 3, XCROSS + 3, SCREEN, 60, 1), rows_with(b7, XCROSS - 3, XCROSS + 3, SCREEN, 60, 1)
check("ink.placements", "after a 150 px page scroll (programmatic), content-following strokes move up 150 px with the page while the screen-fixed stroke stays at the same "
      "screen position; no stroke becomes unverified by a plain scroll",
      V.get("scrolled") == 150 and dark6 == [Y1, Y2, Y5] and dark7 == [Y1 - 150, Y2 - 150, Y5 - 150] and bool(purple6) and purple6 == purple7
      and all(not s["uncertain"] for s in ink("iScrolled").get("shown", [])),
      {"content_rows_before": dark6, "content_rows_after": dark7, "screen_rows_before": [purple6[0], purple6[-1]] if purple6 else None,
       "screen_rows_after": [purple7[0], purple7[-1]] if purple7 else None}, SHOT, STATE, "programmatic scroll")

# ---- reload / reopen / edit / address / Stop ----------------------------------------------------------------------
ro, before_reload = ink("iReopened"), json_of("dbBeforeReload", sha)
b8 = img("ink-08-reopened")
check("ink.reopen", "after a page reload (CDP) and a new start, the saved ink reopens: same visible strokes in the same order, same undo/redo depth, all solid, drawn at "
      "the same places; mouse writing is off again until enabled; no card",
      ro.get("status") == "ready" and ro.get("reason") == f"reopened {len(s5.get('visible', []))} stroke(s)" and ro.get("visible") == s5.get("visible") and ro.get("undo") == s5.get("undo")
      and ro.get("redo") == s5.get("redo") and all(not s["uncertain"] for s in ro.get("shown", [])) and ro.get("mouseWrites") is False
      and centers(rows_with(b8, 940, 1195, INK, 60)) == dark6 and rows_with(b8, XCROSS - 3, XCROSS + 3, SCREEN, 60, 1) == purple6
      and bool(before_reload) and before_reload["revision"] == s5.get("revision") and card("cardReopened")["hidden"],
      {"status": ro.get("status"), "reason": ro.get("reason"), "visible": ro.get("visible"), "undo": ro.get("undo"), "mouseWrites": ro.get("mouseWrites")}, STATE, SHOT, CARD)
S5 = s5.get("visible", [None])[-1]
re_e, re_u, re_a = ink("iReopenErased"), ink("iReopenUndo"), ink("iReopenAdded")
re_pieces = [s["id"] for s in re_e.get("shown", []) if s["derived_from"] == S5]
final = json_of("dbAfterEdit", sha)
immutable = bool(before_reload and final) and all(json.dumps(final["strokes"].get(k), sort_keys=True) == json.dumps(v, sort_keys=True) for k, v in before_reload["strokes"].items())
prefix = bool(before_reload and final) and final["history"][:len(before_reload["history"])] == before_reload["history"]
check("ink.edit_reopened_originals", "the reopened original strokes stay editable: a partial erase of a reopened stroke, its undo, and a new stroke; every stored stroke from "
      "before the reload is unchanged afterwards and the stored history only grows",
      len(re_pieces) == 2 and S5 not in re_e.get("visible", []) and re_u.get("visible") == ro.get("visible") and len(re_a.get("visible", [])) == len(ro.get("visible", [])) + 1
      and re_a.get("status") == "saved" and immutable and prefix and final["revision"] == len(final["history"]),
      {"pieces_of_reopened": re_pieces, "undo_visible_equals_reopened": re_u.get("visible") == ro.get("visible"), "originals_unchanged": immutable, "history_prefix_kept": prefix,
       "stored_revision": final and final["revision"]}, STATE, DB)
s2i, s2d, s1b = ink("iStep2"), ink("iStep2Drawn"), ink("iStep1Back")
step2_sha = s2d.get("page", {}).get("address_sha256", "-")
step_rows = [r for r in V.get("dbSteps") or [] if r["key"].endswith(" " + sha) or r["key"].endswith(" " + step2_sha)]
check("ink.same_document_address", "a same-document address change (pushState) shows that address's own ink (none yet), a stroke there is saved under that address, and "
      "returning (replaceState) shows the original page's ink again: old ink is never shown on another address",
      "ink-step-2" in (V.get("step2Href") or "") and s2i.get("visible") == [] and s2i.get("page", {}).get("address_sha256") not in ("", sha)
      and len(s2d.get("visible", [])) == 1 and s2d.get("status") == "saved" and s1b.get("visible") == re_a.get("visible") and s1b.get("page", {}).get("address_sha256") == sha
      and len(step_rows) == 2 and all(r["parse"]["ok"] for r in step_rows),
      {"step2_visible": s2i.get("visible"), "step2_drawn": s2d.get("visible"), "back_visible_equals_before": s1b.get("visible") == re_a.get("visible"), "stored_docs": len(step_rows)},
      STATE, DB, EDIT + " (pushState/replaceState)")
b10 = img("ink-10-stopped-in-write")
check("ink.stop_in_write", "Stop (the action again) while in WRITE removes toolbar, panel and ink layer (the ink is no longer drawn); pen and mouse then reach the page and "
      "draw nothing; one action restarts in NAV with the saved ink reopened and mouse writing off",
      V.get("stoppedInWrite") == "ok" and V.get("hostsAfterWriteStop") == {"probe": False, "panel": False} and V.get("handleAfterWriteStop") == "absent"
      and pointer_ok("stoppedPointer") and not rows_with(b10, 940, 1195, INK, 60) and not rows_with(b10, XCROSS - 3, XCROSS + 3, SCREEN, 60, 1)
      and st("iRestarted").get("mode") == "NAV" and ink("iRestarted").get("visible") == s1b.get("visible") and ink("iRestarted").get("mouseWrites") is False
      and (ink("iRestarted").get("reason") or "").startswith("reopened"),
      {"hosts": V.get("hostsAfterWriteStop"), "handle": V.get("handleAfterWriteStop"), "page_pointer": (V.get("stoppedPointer") or {}).get("pointer"),
       "ink_rows_after_stop": len(rows_with(b10, 940, 1195, INK, 60)), "restarted": {k: ink("iRestarted").get(k) for k in ("reason", "mouseWrites")}}, STATE, SHOT, POINTER)
check("ink.reopen_never_captures", "reloading, reopening, editing, switching address and Stop/restart send no capture request",
      len(entries("logBeforeReload")) == 0 and len(entries("logReopen")) == 0 and set(msg_types("msgBeforeReload") + msg_types("msgReopen")) <= INK_TYPES,
      {"messages": msg_types("msgReopen")}, SPY)
snaps = [(k, json_of(k, sha)) for k in ("dbDraft", "dbErased", "dbRedo", "dbBeforeReload", "dbAfterEdit", "dbAfterStop")]
parsed = [r["parse"]["ok"] for k, _ in snaps for r in [row_for(k, sha)] if r]
check("ink.stored_documents_valid", "every stored snapshot parses with the product's own reader, and no stored stroke ever changes once written",
      len(parsed) == len(snaps) and all(parsed) and all(all(later["strokes"].get(k) == v for k, v in earlier["strokes"].items()) for (_, earlier), (_, later) in zip(snaps, snaps[1:])),
      {"snapshots": len(parsed), "strokes_per_snapshot": [len(d["strokes"]) for _, d in snaps if d]}, DB)

# ---- S: source changes -------------------------------------------------------------------------------------------
sd = ink("sDrawn")
U1, U2, U3 = (sd.get("visible") or [None] * 3)[:3]
src_sha = sd.get("page", {}).get("address_sha256", "")
drawn_doc_raw, changed_doc_raw = row_for("dbSrcDrawn", src_sha), row_for("dbSrcChanged", src_sha)
drawn_doc, end_doc = json_of("dbSrcDrawn", src_sha), json_of("dbSrcEnd", src_sha)
held_vis = ink("sHeld").get("visible") or []
U4 = held_vis[-1] if len(held_vis) == 4 else None
ctl_vis = ink("sHeldControl").get("visible") or []
CTL = ctl_vis[-1] if len(ctl_vis) == 5 else None
check("ink.source_visible_change", "a visible same-address change of the text under content ink makes it dashed; blank-margin ink (anchored to the page body) also becomes "
      "dashed; screen-fixed ink over an unchanged heading stays solid; a plain scroll changes nothing; reverting the text makes the ink solid again",
      unc("sDrawn") == {U1: False, U2: False, U3: False} and unc("sScrollControl") == unc("sDrawn") and unc("sChanged") == {U1: True, U2: False, U3: True}
      and "2 stroke(s) dashed" in ink("sChanged").get("hint", "") and unc("sReverted") == unc("sDrawn"),
      {k: unc(k) for k in ("sDrawn", "sScrollControl", "sChanged", "sReverted")}, STATE, EDIT, "programmatic scroll")
b11, b12, b14 = img("ink-11-source-drawn"), img("ink-12-source-changed"), img("ink-14-source-back")
dash = {"drawn": {"solid_cols": band(b11, 250, XL + 5, XR - 5, INK, 60), "runs": runs(b11, 250, XL + 5, XR - 5, INK, 60)},
        "changed": {"dashed_cols": band(b12, 250, XL + 5, XR - 5, DASHED, 40), "solid_cols": band(b12, 250, XL + 5, XR - 5, INK, 60), "runs": runs(b12, 250, XL + 5, XR - 5, DASHED, 40)},
        "back": {"dashed_cols": band(b14, 250, XL + 5, XR - 5, DASHED, 40), "runs": runs(b14, 250, XL + 5, XR - 5, DASHED, 40)}}
check("ink.source_dashed_pixels", "DevTools screenshots: the blank-margin stroke is drawn solid before the change and as a dashed half-transparent line after it",
      dash["drawn"]["solid_cols"] >= 200 and dash["drawn"]["runs"] == 1 and dash["changed"]["solid_cols"] == 0 and dash["changed"]["runs"] >= 10 and dash["back"]["runs"] >= 10, dash, SHOT)
check("ink.source_held_stroke", "a change of the caption while a stroke over it is being drawn (no other stroke uses the caption; the page's video paused) makes that stroke "
      "unverified at release (read 120 ms after); a control stroke drawn over the changed caption is solid; reverting the caption flips both",
      V.get("videoPaused") is True and U4 is not None and unc("sHeld").get(U4) is True and CTL is not None and unc("sHeldControl").get(CTL) is False
      and unc("sHeldControl").get(U4) is True and unc("sHeldReverted").get(U4) is False and unc("sHeldReverted").get(CTL) is True,
      {"held": unc("sHeld"), "control": unc("sHeldControl"), "reverted": unc("sHeldReverted")}, STATE, EDIT + " (caption text, video pause)")
check("ink.source_offscreen_change", "with the sources scrolled off screen (scrollY 500): ink stays verified while its source is unchanged; screen-fixed ink over the heading "
      "becomes unverified when the heading changes off screen; content ink over the intro becomes unverified when the intro changes off screen; both stay unverified after scrolling back",
      V.get("srcAway") == 500 and unc("sAwayUnchanged").get(U1) is False and unc("sAwayUnchanged").get(U2) is False and unc("sAwayChanged").get(U2) is True
      and unc("sAwayChanged").get(U1) is False and unc("sAwayChanged2").get(U1) is True and unc("sBack").get(U1) is True and unc("sBack").get(U2) is True,
      {"away_unchanged": unc("sAwayUnchanged"), "heading_changed": unc("sAwayChanged"), "intro_changed": unc("sAwayChanged2"), "back": unc("sBack")}, STATE, EDIT, "programmatic scroll")
check("ink.source_originals_kept", "unverified state lives only in the view: the stored document is identical before and after a visible change, and every stroke stored "
      "before the changes is unchanged at the end",
      bool(drawn_doc_raw and changed_doc_raw) and drawn_doc_raw["json"] == changed_doc_raw["json"] and bool(end_doc) and bool(drawn_doc)
      and all(end_doc["strokes"].get(k) == v for k, v in drawn_doc["strokes"].items()),
      {"identical_through_change": bool(drawn_doc_raw and changed_doc_raw and drawn_doc_raw["json"] == changed_doc_raw["json"]), "strokes_at_end": len(end_doc["strokes"]) if end_doc else None}, DB)
check("ink.reopen_verification", "reopening verifies against what the page shows: on the unchanged page the four strokes over unchanged content are solid and the control "
      "(drawn over changed text that no longer exists) is dashed; after editing the intro before the start, intro and margin ink reopen dashed while heading and caption ink stay solid",
      None not in (U1, U2, U3, U4, CTL) and unc("sReopened") == {U1: False, U2: False, U3: False, U4: False, CTL: True}
      and unc("sReopenedChanged") == {U1: True, U2: False, U3: True, U4: False, CTL: True},
      {"reopened": unc("sReopened"), "reopened_over_changed_intro": unc("sReopenedChanged")}, STATE, EDIT + " (edit before start)", "CDP reload")
check("ink.source_never_captures", "source changes, reloads and rechecks send no capture request", len(entries("logSource")) == 0 and set(msg_types("msgSource")) <= INK_TYPES,
      {"messages": msg_types("msgSource")}, SPY)

# ---- U: unreadable -----------------------------------------------------------------------------------------------
forged_key = V.get("forgedKey")
forged = next((r for r in V.get("dbForged") or [] if r["key"] == forged_key), None)
forged_after = next((r for r in V.get("dbBadAfter") or [] if r["key"] == forged_key), None)
bl, bd = ink("bLoaded"), ink("bDrawn")
check("ink.unreadable_preserved", "FORGED TEST DOUBLE: an unreadable record stored before the page opens is reported ('could not be used ... left untouched'), is never "
      "overwritten, and new ink stays in the tab",
      bool(forged) and not forged["parse"]["ok"] and bl.get("status") == "off" and "could not be used" in (bl.get("reason") or "") and bd.get("revision") == 1
      and bd.get("status") == "off" and bool(forged_after) and forged_after["json"] == forged["json"],
      {"loaded": {k: bl.get(k) for k in ("status", "reason")}, "after_drawing": {k: bd.get(k) for k in ("status", "revision")},
       "record_unchanged": bool(forged_after and forged and forged_after["json"] == forged["json"])}, STATE, DB, "forged IndexedDB record (worker)")
late_key = V.get("corruptedKey")
corrupted = next((r for r in V.get("dbCorrupted") or [] if r["key"] == late_key), None)
late_after = next((r for r in V.get("dbLateAfter") or [] if r["key"] == late_key), None)
lk = ink("lKept")
check("ink.corrupted_after_load_preserved", "FORGED TEST DOUBLE: a record corrupted after the page loaded it: the next saves are refused ('cannot be read by this version, so "
      "it was left untouched'), retries are refused too, the record is not overwritten; the unsaved ink stays in the tab and survives Stop and restart",
      ink("lSaved").get("status") == "saved" and bool(corrupted) and not corrupted["parse"]["ok"] and ink("lAfterCorrupt").get("status") == "failed"
      and "cannot be read" in (ink("lAfterCorrupt").get("reason") or "") and ink("lRetry").get("status") == "failed" and ink("lRetry").get("revision") == 3
      and lk.get("visible") == ink("lRetry").get("visible") and lk.get("status") == "failed" and bool(late_after) and late_after["json"] == corrupted["json"],
      {"after_corrupt": {k: ink("lAfterCorrupt").get(k) for k in ("status", "reason")}, "retry": {k: ink("lRetry").get(k) for k in ("status", "revision")},
       "after_stop_restart": {k: lk.get(k) for k in ("status", "revision", "held")}, "hint": ink("lRetry").get("hint"),
       "record_unchanged": bool(late_after and corrupted and late_after["json"] == corrupted["json"])}, STATE, DB, "forged IndexedDB corruption (worker)")

# ---- C: two real tabs on one address ---------------------------------------------------------------------------------
ca1, cb0, cb1, ca2, car = ink("cA1"), ink("cB0"), ink("cB1"), ink("cA2"), ink("cAReopened")
conf_sha = ca1.get("page", {}).get("address_sha256", "")
stored_b, stored_after_a = row_for("dbConfB", conf_sha), row_for("dbConfAfterA", conf_sha)
A1 = (ca1.get("visible") or [None])[0]
B1 = (cb1.get("visible") or [None, None])[-1]
A2 = (ca2.get("visible") or [None, None])[-1]
check("ink.conflict_two_tabs", "two tabs on the same address, each companion started by the extension's own action and written with input on its own page: tab B reopens "
      "A's stroke and saves its own; A's next save is refused as a conflict and the stored document keeps B's version, not overwritten",
      ca1.get("status") == "saved" and cb0.get("reason") == "reopened 1 stroke(s)" and cb0.get("visible") == [A1] and cb1.get("status") == "saved" and cb1.get("visible") == [A1, B1]
      and ca2.get("status") == "conflict" and "another tab or window" in (ca2.get("reason") or "") and bool(stored_b and stored_after_a) and stored_b["json"] == stored_after_a["json"]
      and json.loads(stored_after_a["json"])["visible"] == [A1, B1],
      {"A1": ca1.get("status"), "B_reopened": cb0.get("reason"), "B1": cb1.get("status"), "A2": {k: ca2.get(k) for k in ("status", "reason")},
       "stored_unchanged_by_A": bool(stored_b and stored_after_a and stored_b["json"] == stored_after_a["json"])},
      STATE, DB, "tab B created and tabs switched from the worker (chrome.tabs.create/update); tab B's title set temporarily to target the DevTools action invocation")
check("ink.conflict_reload_behavior", "OBSERVED BEHAVIOUR (as the product's conflict text states): after reloading tab A, it shows the stored ink (A1, B1); A's refused "
      "stroke A2 is gone because it was kept only in that tab",
      car.get("visible") == [A1, B1] and A2 not in car.get("visible", []) and "A reload shows the saved ink without it" in (ca2.get("hint") or ""),
      {"reopened_visible": car.get("visible"), "refused_stroke": A2, "conflict_hint": ca2.get("hint")}, STATE, "CDP reload")
check("ink.conflict_never_captures", "the unreadable and conflict flows send no capture request", len(entries("logConflict")) == 0 and set(msg_types("msgConflict")) <= INK_TYPES,
      {"messages": msg_types("msgConflict")}, SPY)

for name in ("ink-01-draft", "ink-02-erased", "ink-03-undo", "ink-04-redo", "ink-05-ask-finished", "ink-06-before-scroll", "ink-07-scrolled", "ink-08-reopened",
             "ink-09-reopen-edited", "ink-10-stopped-in-write", "ink-11-source-drawn", "ink-12-source-changed", "ink-13-offscreen-changed", "ink-14-source-back"):
    shutil.copyfile(SHOTS / f"{name}.png", EVIDENCE / f"{name}.png")
failed = [c["id"] for c in checks if c["status"] != "pass"]
summary = {
    "kind": "qa-original-page-ink-summary/v2", "baseline": raw["baseline"], "browser": V.get("userAgent"), "run": {"started_at": raw["started_at"], "finished_at": raw["finished_at"]},
    "harness_sha256": {**raw.get("harness", {}), "analyze_ink_now": hashlib.sha256((HERE / "analyze_ink.py").read_bytes()).hexdigest()},
    "scope": ("Browser component only: the shipped WebExtension, unchanged, in fresh-profile headless Edge on Windows (WSL-driven), on QA's owned synthetic course page. "
              "Start/stop by DevTools Extensions.triggerAction (not a human toolbar click); product buttons pressed with trusted CDP mouse clicks; strokes with CDP mouse and CDP "
              "pen (not Apple Pencil); one CDP touch-emulation drag (not a real finger). Harness controls: worker state reads, native IndexedDB reads, a message-type spy, "
              "a captureVisibleTab pass-through wrapper, DevTools DOM search of the card, main-world page edits (text, pushState/replaceState, scrollTo, video pause), "
              "CDP reload/navigate, tab creation/switching from the worker, a temporary tab-B title, and two forged IndexedDB records. No provider, AI, continuous "
              "whole-display observation, native overlay, Safari, iPad or Notability."),
    "summary": {"total": len(checks), "passed": len(checks) - len(failed), "failed": failed},
    "checks": checks,
}
text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
if re.search(r"[A-Za-z]:\\\\Users\\\\|/mnt/c/Users/|AppData|data:image", text):
    raise SystemExit("refusing to write summary-ink.json: it contains a local profile path or image data")
(EVIDENCE / "summary-ink.json").write_text(text)
print(json.dumps(summary["summary"], indent=1))
