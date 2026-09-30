#!/usr/bin/env python3
"""Checks one QA run of the 'ink' scenario (tests/e2e/windows/run.mjs ink <out>) at 8e2094e.

Usage: python3 analyze_ink.py <run out dir> [<evidence dir>]

Frame-bound ink originals across WRITE -> partial erase -> undo -> redo -> ASK finish/cancel -> continue; immutability of
every retained original; a clean exit and relaunch of the saved session with continued editing; one controlled
context-picture corruption recovery in the run's own fresh profile. App reads are the app's own claims and are
cross-checked against its stored files and its retained raw/composed PNGs. Input is DevTools-injected (synthetic).
Statuses: pass / fail / limit (observed, but not established by this check) / blocked (shared display not quiet).
"""

import base64
import glob
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import zlib

import numpy as np

RUN = sys.argv[1]
EVIDENCE = sys.argv[2] if len(sys.argv) > 2 else None
INK_RGB = (110, 63, 209)
checks = []


def check(cid, status, observed, note=None):
    checks.append({"id": cid, "status": status, "observed": observed, **({"note": note} if note else {})})


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def bmp(path):
    raw = open(path, "rb").read()
    offset = int.from_bytes(raw[10:14], "little")
    width = int.from_bytes(raw[18:22], "little", signed=True)
    height = int.from_bytes(raw[22:26], "little", signed=True)
    channels = int.from_bytes(raw[28:30], "little") // 8
    stride = (width * channels + 3) // 4 * 4
    rows = np.frombuffer(raw, dtype=np.uint8, count=stride * abs(height), offset=offset).reshape(abs(height), stride)
    image = rows[:, : width * channels].reshape(abs(height), width, channels)
    if height > 0:
        image = image[::-1]
    return image[:, :, [2, 1, 0]].astype(np.int16)


results = load(os.path.join(RUN, "out", "results.json"))
values, steps = results["values"], results["steps"]
parsed = lambda k: json.loads(values[k]) if isinstance(values.get(k), str) else values.get(k)
display = values["displays"] if isinstance(values["displays"], dict) else values["displays"][0]
SCALE = display["scale_factor"]
as_list = lambda v: [] if v is None else (v if isinstance(v, list) else [v])

# ---------------------------------------------------------------- run integrity
foreign = results.get("foreign", {})
foreign_seen = as_list(foreign.get("start")) + as_list(foreign.get("end")) + [f for s in steps if s.get("kind") == "desktopShot" for f in as_list(s.get("foreign"))]
contaminated = bool(foreign_seen)
check("run.shared_desktop_quiet", "fail" if contaminated else "pass",
      {"foreign_electron_seen": sorted({(f["pid"], f["stage"]) for f in foreign_seen}), "points_checked": 2 + sum(1 for s in steps if s.get("kind") == "desktopShot")},
      "point-in-time, Electron-only: no other Electron app at start, at each desktop screenshot and at the end")
failed = [(s["i"], s.get("kind"), s.get("error")) for s in steps if not s["ok"]]
check("run.completed", "pass" if not results.get("aborted") and not failed else "fail", {"aborted": results.get("aborted"), "failed_steps": failed})


def screen_check(cid, ok, observed, note=None):
    check(cid, "blocked" if contaminated else ("pass" if ok else "fail"), observed, note)


cursor = [tuple(c) for c in [results.get("cursor", {}).get("start"), results.get("cursor", {}).get("end")] + [s.get("cursor") for s in steps if s.get("kind") == "desktopShot"] if c]
check("run.cursor_static", "pass" if cursor and len(set(cursor)) == 1 else "limit", {"positions_px": sorted(set(cursor)), "readings": len(cursor)},
      "read-only GetCursorPos: the user's cursor was never moved and stayed clear of every stroke region")

# ---------------------------------------------------------------- files
captures = sorted(glob.glob(os.path.join(RUN, "captures", "*", "manifest.jsonl")))
lines = []
for m in captures:
    cap = os.path.basename(os.path.dirname(m))
    for n, text in enumerate(open(m, encoding="utf-8")):
        line = json.loads(text)
        lines.append({"cap": cap, "n": n, "line": line})
retained = [x for x in lines if x["line"].get("kind") == "retained"]
header = [x["line"] for x in lines if x["line"].get("kind") == "header"]
marks_all = {}
for key in ("timeline1", "timeline2"):
    t = parsed(key) or {}
    for m in t.get("marks", []):
        marks_all[m["label"]] = m


def original_of(x):
    o = (x["line"].get("composed") or {}).get("ink_original")
    if not o or "file" not in o:
        return None, o
    path = os.path.join(RUN, "captures", x["cap"], o["file"])
    if not os.path.exists(path):
        return None, {"missing": o["file"]}
    data = open(path, "rb").read()
    return {"bytes": data, "doc": json.loads(data), "meta": o}, o


def snap(label):
    files = glob.glob(os.path.join(RUN, "out", f"snap-{label}", "*.json"))
    return load(files[0]) if len(files) == 1 else None


def ops(doc):
    return [h["op"] for h in doc["ink"]["history"]]


# ---------------------------------------------------------------- originals bound to their frames
bound_problems, refused, per_line = [], [], []
for x in retained:
    c = x["line"].get("composed")
    if c is None:
        continue
    orig, meta = original_of(x)
    if orig is None:
        (refused if meta and "refused" in meta else bound_problems).append({"cap": x["cap"][:8], "seq": x["line"]["sample_seq"], "meta": meta})
        continue
    d, data = orig["doc"], orig["bytes"]
    name = os.path.basename(orig["meta"]["file"])[:-5]
    ok = (sha(data) == name == orig["meta"]["sha256"] and len(data) == orig["meta"]["bytes"] and d["id"] == c["ink_session"]
          and d["ink"]["revision"] == c["ink_revision"] == len(d["ink"]["history"]) and len(d["ink"]["visible"]) == c["visible_strokes"])
    ug = c.get("uncommitted_gesture")
    ok = ok and (ug is None or (ug.get("kind") in ("ink", "erase", "ask") and isinstance(ug.get("points"), int)))
    per_line.append({"cap": x["cap"][:8], "seq": x["line"]["sample_seq"], "rev": c["ink_revision"], "visible": c["visible_strokes"],
                     "original": name[:12], "uncommitted": ug, "evidence_pending": c.get("evidence_pending")})
    if not ok:
        bound_problems.append({"cap": x["cap"][:8], "seq": x["line"]["sample_seq"], "rev": c["ink_revision"]})
check("originals.bound", "pass" if per_line and not bound_problems and not refused else "fail",
      {"retained_composed_lines": len(per_line), "distinct_originals": len({p["original"] for p in per_line}), "revisions": sorted({p["rev"] for p in per_line}),
       "problems": bound_problems, "refused": refused, "captures": len(captures), "header_ink_originals": [h.get("ink_originals") for h in header][:1]},
      "every retained composed frame names its ink original; the file's sha256 is its name and the manifest's, its length the manifest's; "
      "the parsed document is that frame's session, revision (= history length) and visible-stroke count")

# ---------------------------------------------------------------- per-state: the frame's original is the saved ink of that revision
sel = load(os.path.join(RUN, "retained-selection.json")) if os.path.exists(os.path.join(RUN, "retained-selection.json")) else {}


def selected(label):
    s = sel.get(f"app_{label}")
    if not s:
        return None
    x = next((x for x in retained if x["cap"] == s["cap"] and x["line"]["sample_seq"] == s["sample_seq"] and x["line"]["sampled_at"] == s["sampled_at"]), None)
    if not x:
        return None
    orig, _ = original_of(x)
    pics = {k: os.path.join(RUN, "pictures", f"frame-{s[k]}.bmp") for k in ("raw", "composed")}
    return {"x": x, "orig": orig, "raw": bmp(pics["raw"]) if os.path.exists(pics["raw"]) else None,
            "composed": bmp(pics["composed"]) if os.path.exists(pics["composed"]) else None}


STATES = {"write": 3, "erase": 4, "undo": 5, "redo": 6, "ask-done": 6, "continued": 8, "reopened2": 8, "relaunch-edit": 9, "c1": 10, "reopened3": 11}
match_rows, match_bad = {}, []
for label, rev in STATES.items():
    s, f = snap(label), selected(label)
    app = parsed(f"app_{label}") or {}
    row = {"saved_revision": s and s["ink"]["revision"], "expected": rev, "app_revision": (app.get("doc") or {}).get("revision")}
    if f and f["orig"]:
        c = f["x"]["line"]["composed"]
        pending = set(c.get("evidence_pending") or [])
        same_ink = f["orig"]["doc"]["ink"] == s["ink"]
        ev_ok = all(f["orig"]["doc"]["evidence"].get(k) == v for k, v in s["evidence"].items() if k not in pending)
        row.update(frame_revision=c["ink_revision"], same_ink=same_ink, evidence_equal_except_pending=ev_ok, pending=len(pending),
                   byte_identical_to_saved=f["orig"]["bytes"] == open(glob.glob(os.path.join(RUN, "out", f"snap-{label}", "*.json"))[0], "rb").read())
        if not (c["ink_revision"] == rev == s["ink"]["revision"] and same_ink and ev_ok):
            match_bad.append(label)
    else:
        row["frame"] = None
        match_bad.append(label)
    match_rows[label] = row
check("originals.match_saved_state", "pass" if not match_bad else "fail", {"states": match_rows, "bad": match_bad},
      "at every state the retained frame's own ink original is exactly the saved ink of that revision (strokes, visible order, history; "
      "evidence equal except strokes whose pictures were still pending when the frame was taken)")

# ---------------------------------------------------------------- history sequence
H = {k: snap(k) for k in ("write", "erase", "undo", "redo", "ask-done", "continued", "stopped1", "reopened2", "relaunch-edit", "c1", "c2-failed", "retried", "reopened3")}
hist = {k: ops(v) if v else None for k, v in H.items()}
want = {"write": ["add"] * 3}
want["erase"] = want["write"] + ["erase"]
want["undo"] = want["erase"] + ["undo"]
want["redo"] = want["undo"] + ["redo"]
want["ask-done"] = want["redo"]
want["continued"] = want["redo"] + ["add", "add"]
want["stopped1"] = want["reopened2"] = want["continued"]
want["relaunch-edit"] = want["continued"] + ["add"]
want["c1"] = want["relaunch-edit"] + ["add"]
want["c2-failed"] = want["c1"]
want["retried"] = want["reopened3"] = want["c1"] + ["add"]
erase_doc = H["erase"]
new_pieces = [st for sid, st in erase_doc["ink"]["strokes"].items() if sid not in H["write"]["ink"]["strokes"]] if erase_doc else []
origin = {st["derived_from"] for st in new_pieces}
check("history.sequence", "pass" if hist == want and len(new_pieces) == 2 and len(origin) == 1 else "fail",
      {"history": hist, "erase_pieces": len(new_pieces), "pieces_from_one_original": len(origin) == 1},
      "the saved history is exactly the operations performed, in order; the partial erase leaves two pieces derived from one original kept in history")

# ---------------------------------------------------------------- composed pixels are the bound original
def path_samples(points):
    out = []
    pts = [p[:2] for p in points]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        n = max(1, int(np.hypot(x2 - x1, y2 - y1) * SCALE))
        out += [(int(round((x1 + (x2 - x1) * t / n) * SCALE)), int(round((y1 + (y2 - y1) * t / n) * SCALE))) for t in range(n)]
    return out


def style(composed, raw, pts):
    if not pts:
        return None
    c = np.array([composed[y, x] for x, y in pts])
    r = np.array([raw[y, x] for x, y in pts])
    at_ink = float((np.abs(c - INK_RGB).max(axis=1) <= 30).mean())
    differs = float((np.abs(c - r).max(axis=1) > 24).mean())
    return {"style": "solid" if at_ink >= 0.85 else ("dashed" if at_ink <= 0.15 and differs >= 0.3 else ("absent" if differs <= 0.05 else "unclear")),
            "at_ink": round(at_ink, 3), "differs": round(differs, 3), "raw_at_ink": round(float((np.abs(r - INK_RGB).max(axis=1) <= 30).mean()), 3)}


def exclusive(points, others, radius=8 * 2):
    """Path samples of a stroke farther than `radius` px from every other listed stroke's path."""
    mine = path_samples(points)
    near = np.array([p for o in others for p in path_samples(o)]) if others else np.zeros((0, 2))
    if not len(near):
        return mine
    return [p for p in mine if np.min(np.abs(near - p).max(axis=1)) > radius]


pixel_rows, pixel_bad, pixel_stale = {}, [], []
for label in STATES:
    f = selected(label)
    app = parsed(f"app_{label}") or {}
    if not f or f["orig"] is None or f["raw"] is None or f["composed"] is None:
        pixel_stale.append(label)
        continue
    c = f["x"]["line"]["composed"]
    last = (app.get("last") or {}).get("composed") or {}
    if c["ink_revision"] != last.get("ink_revision") or c["ink_marks"] != last.get("ink_marks"):
        pixel_stale.append(label)
        continue
    d = f["orig"]["doc"]
    visible = d["ink"]["visible"]
    strokes = d["ink"]["strokes"]
    hidden = [sid for sid in strokes if sid not in visible]
    vis_pts = {sid: strokes[sid]["points"] for sid in visible}
    row, bad = {}, []
    styles = {}
    xy = lambda sid: [tuple(q[:2]) for q in strokes[sid]["points"]]
    for sid in visible:
        others = [p for o, p in vis_pts.items() if o != sid and xy(o) != xy(sid)]  # an identical duplicate draws the same pixels
        st = style(f["composed"], f["raw"], exclusive(strokes[sid]["points"], others))
        want_style = "solid" if app.get("aligned", {}).get(sid) == "verified" else "dashed"
        styles[sid] = st["style"] if st else None
        if not st or st["style"] != want_style or st["raw_at_ink"] > 0:
            bad.append((sid[:12], st, want_style))
    hidden_rows = {}
    for sid in hidden:
        st = style(f["composed"], f["raw"], exclusive(strokes[sid]["points"], list(vis_pts.values())))
        hidden_rows[sid[:12]] = st
        if st and st["style"] != "absent":
            bad.append((sid[:12], st, "absent"))
    solid = sum(1 for v in styles.values() if v == "solid")
    marks = c["ink_marks"]
    if solid != marks["verified"] or len(styles) - solid != marks["changed"] + marks["unknown"] + marks["following_content"]:
        bad.append(("marks", marks, solid))
    pixel_rows[label] = {"retained_seq": f["x"]["line"]["sample_seq"], "revision": c["ink_revision"], "visible": len(visible), "hidden": len(hidden),
                         "styles": {k[:12]: v for k, v in styles.items()}, "hidden_styles": hidden_rows, "marks": marks}
    if bad:
        pixel_bad.append({"label": label, "bad": bad})
screen_check("pixels.composed_is_bound_original", bool(pixel_rows) and not pixel_bad,
             {"states_checked": len(pixel_rows), "per_state": pixel_rows, "bad": pixel_bad, "no_state_frame": pixel_stale},
             "in the app's retained composed PNG of each state, every visible stroke of the bound original is drawn (solid when the app verifies it, "
             "dashed otherwise) and every hidden stroke (the erased original, undone pieces) is not; the retained raw PNG has no ink on any path")

# Uncommitted gesture: a retained line taken while the second 'continue' stroke was held.
held = [x for x in retained if ((x["line"].get("composed") or {}).get("uncommitted_gesture") or {}).get("kind") == "ink"]
held_rows = []
for x in held:
    orig, _ = original_of(x)
    c = x["line"]["composed"]
    held_rows.append({"seq": x["line"]["sample_seq"], "rev": c["ink_revision"], "gesture": c["uncommitted_gesture"],
                      "strokes_in_original": len(orig["doc"]["ink"]["strokes"]) if orig else None,
                      "history_in_original": len(orig["doc"]["ink"]["history"]) if orig else None})
ok_held = bool(held) and all(r["gesture"]["kind"] == "ink" and r["strokes_in_original"] is not None and r["rev"] == r["history_in_original"] for r in held_rows)
check("originals.uncommitted_gesture_not_bound", "pass" if ok_held else "limit", {"lines": held_rows},
      "a frame retained while a stroke was held records it only as uncommitted_gesture; its bound original holds the committed ink only (limit if no such frame fell due)")

# ---------------------------------------------------------------- ASK adds nothing
card = parsed("askCard") or {}
ov = lambda k: parsed(f"ov_{k}") or {}
t1 = parsed("timeline1") or {"samples": [], "marks": []}
m1 = {m["label"]: m for m in t1["marks"]}
ask_revs = sorted({s["composed"]["ink_revision"] for s in t1["samples"][m1["ask-start"]["samples"]: m1["ask-done"]["samples"]] if s.get("composed")}) if "ask-start" in m1 and "ask-done" in m1 else None
ok_ask = (card.get("revision") == 6 and "No AI is connected" in card.get("text", "") and f"ink revision 6" in card.get("text", "")
          and ov("ask").get("mode") == "ASK" and ov("ask_finished").get("mode") == "WRITE" and ov("ask2").get("mode") == "ASK"
          and ov("ask_cancelled").get("mode") == "WRITE" and hist.get("ask-done") == hist.get("redo") and ask_revs == [6])
check("ask.no_new_revision", "pass" if ok_ask else "fail",
      {"card_revision": card.get("revision"), "card_text": (card.get("text") or "")[:220], "modes": [ov(k).get("mode") for k in ("ask", "ask_finished", "ask2", "ask_cancelled")],
       "sample_revisions_during_ask": ask_revs},
      "ASK finish and cancel return to WRITE and add no operation, revision or ink; the card states the revision it composed and that no AI is connected")

# ---------------------------------------------------------------- immutability of every retained original
order = [s["as"] for s in steps if s.get("kind") == "hashTree"]
trees = {k: values[k] for k in order if isinstance(values.get(k), dict)}
planted, moved = parsed("planted") or {}, parsed("movedAside") or {}
planted_rel = planted.get("rel")
first_seen, changed_later, bad_names = {}, [], []
for k in order:
    for rel, meta in trees.get(k, {}).items():
        if meta == "vanished" or rel.endswith(".tmp"):
            continue
        is_original = re.match(r"^captures/[^/]+/(ink/[0-9a-f]{64}\.json|frames/[0-9a-f]{64}\.png)$", rel) or re.match(r"^ink/context/[0-9a-f]{64}\.png$", rel)
        if not is_original:
            continue
        name = rel.rsplit("/", 1)[1].split(".")[0]
        if rel == planted_rel and meta["sha256"] == planted.get("after"):
            continue  # the TEST corruption QA planted (between 'planted' and the move aside)
        if meta["sha256"] != name:
            bad_names.append((k, rel))
        if rel in first_seen and first_seen[rel] != meta["sha256"]:
            changed_later.append((k, rel))
        first_seen.setdefault(rel, meta["sha256"])
final_tree = trees.get("h_final", {})
missing_final = [rel for rel in first_seen if rel not in final_tree and rel != planted_rel]
# Manifests only grow: every earlier size is a prefix of the final bytes with the earlier hash.
manifest_bad = []
for k in order:
    for rel, meta in trees.get(k, {}).items():
        if rel.endswith("manifest.jsonl") and meta != "vanished":
            local = os.path.join(RUN, "captures", rel.split("/")[1], "manifest.jsonl")
            data = open(local, "rb").read() if os.path.exists(local) else b""
            if sha(data[: meta["bytes"]]) != meta["sha256"]:
                manifest_bad.append((k, rel))
check("originals.immutable", "pass" if first_seen and not changed_later and not bad_names and not missing_final and not manifest_bad else "fail",
      {"checkpoints": len(order), "originals_tracked": len(first_seen), "changed_later": changed_later[:10], "name_not_hash": bad_names[:10],
       "missing_at_final": missing_final[:10], "manifest_not_append_only": manifest_bad},
      "every retained frame PNG, frame-bound ink original and context picture keeps its bytes (= its name) from first sight to the end, through later "
      "edits, ASK, exit, relaunch, reopen, continued editing and the recovery (only QA's planted TEST entry differs, and it was moved aside); "
      "every manifest only grew")

# ---------------------------------------------------------------- clean exit and relaunch
procs = results["processes"]
a1, a2 = procs.get("app", {}), procs.get("app2", {})
stopped1, reopened2, redit = H["stopped1"], H["reopened2"], H["relaunch-edit"]
same_files = trees.get("h_before-close") == trees.get("h_after-exit") == trees.get("h_relaunched")
ink2 = parsed("ink2") or {"sessions": []}
ctx2 = parsed("contexts_reopened2") or {}
caps_after = sorted({x["cap"] for x in retained if x["line"]["sampled_at"] > (a2.get("started_at") or "9")})
post = [x for x in retained if x["cap"] in caps_after and (x["line"].get("composed") or {}).get("ink_session") == (stopped1 or {}).get("id")]
post.sort(key=lambda x: x["line"]["sampled_at"])
first_post, _ = original_of(post[0]) if post else (None, None)
kept_rel = parsed("kept_relaunched") or {}
ok_relaunch = (a1.get("exited") and a1.get("exit_code") == 0 and not a1.get("killed") and a2.get("pid") and a2.get("pid") != a1.get("pid")
               and same_files and len(ink2["sessions"]) == 1 and ink2["sessions"][0]["id"] == stopped1["id"]
               and ink2["sessions"][0]["strokes"] == len(stopped1["ink"]["visible"]) and kept_rel.get("hidden") is True
               and f"Reopened {len(stopped1['ink']['visible'])} stroke(s)" in ov("reopened2").get("hint", "")
               and reopened2 and reopened2["ink"] == stopped1["ink"] and reopened2["evidence"] == stopped1["evidence"]
               and redit and redit["id"] == stopped1["id"] and redit["forked_from"] is None and ops(redit)[: len(ops(stopped1))] == ops(stopped1)
               and all(redit["ink"]["strokes"].get(k) == v for k, v in stopped1["ink"]["strokes"].items())
               and ctx2.get("ok") and ctx2["items"] and all(i["picture_state"] == "shown" and i.get("picture_sha256") == i["image"]["sha256"] for i in ctx2["items"])
               and first_post and first_post["doc"]["ink"] == stopped1["ink"])
screen_check("relaunch.clean_exit_reopen_continue", bool(ok_relaunch),
             {"app1": {k: a1.get(k) for k in ("pid", "exited", "exit_code", "killed", "started_at", "exited_at")},
              "app2": {k: a2.get(k) for k in ("pid", "started_at")}, "new_devtools_port": a2.get("devtools") != a1.get("devtools"),
              "files_equal_before_close_after_exit_relaunched": same_files, "saved_list_after_relaunch": ink2["sessions"],
              "hint": ov("reopened2").get("hint", "")[:120], "reopened_equals_saved": bool(reopened2 and reopened2["ink"] == stopped1["ink"]),
              "continued_same_file": bool(redit and redit["id"] == stopped1["id"] and redit["forked_from"] is None),
              "history_after_edit": ops(redit) if redit else None, "pictures_after_relaunch": {"items": len(ctx2.get("items", [])), "states": sorted({i["picture_state"] for i in ctx2.get("items", [])})},
              "new_capture_folders": len(caps_after), "first_post_relaunch_original_equals_saved_ink": bool(first_post and first_post["doc"]["ink"] == stopped1["ink"]),
              "first_post_relaunch_original_byte_identical": bool(first_post) and first_post["bytes"] == open(glob.glob(os.path.join(RUN, "out", "snap-stopped1", "*.json"))[0], "rb").read()},
             "the app closes itself cleanly (exit 0), a new process on the same profile lists the session, Open restores it exactly, editing continues in the "
             "same file (history extended, no fork), all pictures open, and the new capture binds originals that start from the saved ink; every file "
             "is unchanged across exit and relaunch")
for key in ("app", "app2"):
    p = procs.get(key, {})
    check(f"app.closes_cleanly.{key}", "pass" if p.get("exited") and p.get("exit_code") == 0 and not p.get("killed") else "fail",
          {k: p.get(k) for k in ("exited", "exit_code", "killed")})

# ---------------------------------------------------------------- context-picture corruption recovery
pc = values.get("pc_sha")
spare_files = glob.glob(os.path.join(RUN, "out", "copy-spare", "*.json"))
spare = load(spare_files[0]) if len(spare_files) == 1 else None
retried, c1doc = H["retried"], H["c1"]
newest = None
if spare:
    roots = sorted((st for st in spare["ink"]["ink"]["strokes"].values() if st["derived_from"] is None), key=lambda st: st["created_at"])
    newest = roots[-1]["id"] if roots else None
c2_ctx = (spare["ink"]["evidence"].get(newest) or {}).get("contexts", []) if spare and newest else []
reproduced = bool(pc) and len(c2_ctx) == 1 and (c2_ctx[0].get("image") or {}).get("sha256") == pc
check("corruption.reproduced", "pass" if reproduced else "limit",
      {"planted_address_sha": pc, "second_stroke_context": [(c.get("reason"), (c.get("image") or {}).get("sha256")) for c in c2_ctx]},
      "the second, identical stroke over unchanged content produced exactly the picture whose address QA had occupied (else the case was not reproduced)")

ovf, rec_f, kept_f = parsed("ov_failed") or {}, parsed("recoveries_failed") or [], parsed("kept_failed") or {}
reason = (ovf.get("unsaved") or "")
ctx_rel = f"ink/context/{pc}.png" if pc else None
t = lambda k: (lambda m: m if isinstance(m, dict) else None)((trees.get(k) or {}).get(ctx_rel))
doc_rel = f"ink/{(c1doc or {}).get('id')}.json"
ok_fail = (reproduced and "is not its bytes" in reason and "it is left untouched. Move it away, then Retry; or export this ink" in reason
           and (ovf.get("saveText") or "").startswith("Not saved") and "Not saved" in (ovf.get("hint") or "") and "No AI is connected" in (ovf.get("hint") or "")
           and len(rec_f) == 1 and rec_f[0]["id"] == c1doc["id"] and rec_f[0]["revision"] == c1doc["ink"]["revision"] + 1
           and kept_f.get("hidden") is False and set(["Retry saving", "Export…", "Discard…"]) <= set(kept_f.get("buttons", []))
           and H["c2-failed"] == c1doc and (trees.get("h_c2-failed") or {}).get(doc_rel) == (trees.get("h_c1") or {}).get(doc_rel))
check("corruption.save_reported_failure", "pass" if ok_fail else ("limit" if not reproduced else "fail"),
      {"overlay_unsaved": reason[:400], "hint_start": (ovf.get("hint") or "")[:120], "recoveries": [{k: r.get(k) for k in ("id", "revision", "strokes", "exported_to")} for r in rec_f],
       "save_text": (ovf.get("saveText") or "")[:160], "kept_list": {"hidden": kept_f.get("hidden"), "buttons": kept_f.get("buttons"), "text": (kept_f.get("text") or "")[:300]},
       "saved_file_not_advanced": H["c2-failed"] == c1doc},
      "the save is refused and says so (overlay and control), naming the untouched entry; the ink is kept with Retry saving, Export… and Discard…; "
      "the saved file stays at the last good revision")

bad_meta = [t(k) for k in ("h_planted", "h_c2-failed", "h_retry-occupied", "h_stopped2")]
aside_rel = moved.get("to")
aside = [(lambda m: m if isinstance(m, dict) else None)((trees.get(k) or {}).get(aside_rel)) for k in ("h_retried", "h_final")]
tmp_left = [rel for k in order for rel in (trees.get(k) or {}) if rel.startswith("ink/") and rel.endswith(".tmp")]
ok_bad = (planted and all(m and m["sha256"] == planted["after"] and m["bytes"] == planted["after_bytes"] and m["mtime_utc"] == planted["after_mtime_utc"] for m in bad_meta)
          and moved.get("before") == planted["after"] and moved.get("after") == planted["after"] and moved.get("source_absent")
          and all(a and a["sha256"] == planted["after"] for a in aside) and not tmp_left)
check("corruption.bad_entry_untouched", "pass" if ok_bad else ("limit" if not reproduced else "fail"),
      {"planted": {k: planted.get(k) for k in ("rel", "bytes", "after")} if planted else None, "at_checkpoints": bad_meta, "moved_aside": moved,
       "aside_at_retried_and_final": aside, "tmp_files_left": tmp_left},
      "QA's TEST entry keeps its exact bytes, size and time through the refused save, the refused Retry and Stop, until QA moves it aside; the app never renames, "
      "overwrites or deletes it")

rec_ro = parsed("recoveries_retry_occupied") or []
check("corruption.retry_while_occupied_refused", "pass" if len(rec_ro) == 1 and t("h_retry-occupied") == t("h_c2-failed") and (trees.get("h_retry-occupied") or {}).get(doc_rel) == (trees.get("h_c1") or {}).get(doc_rel)
      else ("limit" if not reproduced else "fail"),
      {"recoveries_after_retry": [{k: r.get(k) for k in ("id", "revision")} for r in rec_ro], "entry_unchanged": t("h_retry-occupied") == t("h_c2-failed")},
      "Retry saving while the address is still occupied is refused again: the ink stays kept, the entry and the saved file are unchanged")

pic_b64 = (spare or {}).get("context_pictures_png_base64", {})
good = base64.b64decode(pic_b64[pc]) if pc in pic_b64 else b""
not_matching = [x.get("sha256") if isinstance(x, dict) else x for x in ((spare or {}).get("context_pictures_not_matching") or [])]
ok_export = (spare and spare.get("format") == "lc-desktop-ink-export/v1" and sha(good) == pc and pc not in (spare.get("context_pictures_missing") or [])
             and pc not in not_matching and retried and spare["ink"]["ink"] == retried["ink"]
             and spare["ink"]["evidence"] == retried["evidence"] and "is not its bytes" in (spare.get("not_saved_because") or ""))
check("corruption.export_payload_keeps_good_picture", "pass" if ok_export else ("limit" if not reproduced else "fail"),
      {"spare_copy": bool(spare), "format": (spare or {}).get("format"), "good_picture_bytes": len(good), "good_picture_sha_matches_address": sha(good) == pc if good else False,
       "missing": (spare or {}).get("context_pictures_missing"), "not_matching": (spare or {}).get("context_pictures_not_matching"),
       "spare_ink_equals_saved_after_retry": bool(spare and retried and spare["ink"]["ink"] == retried["ink"]), "export_button_offered": "Export…" in kept_f.get("buttons", [])},
      "the app's export payload of the kept ink (its spare copy written at Stop into the test-owned temp folder) holds the kept document and the good picture bytes "
      "for the occupied address; the Export… button is offered (its native Save dialog was not driven)")

rec_r, kept_r = parsed("recoveries_retried"), parsed("kept_retried") or {}
ink_r = parsed("ink_retried") or {"sessions": []}
ok_retry = (moved.get("source_absent") and rec_r == [] and kept_r.get("hidden") is True and ((lambda m: m if isinstance(m, dict) else {})((trees.get("h_retried") or {}).get(ctx_rel))).get("sha256") == pc
            and retried and hist.get("retried") == want["retried"] and retried["id"] == c1doc["id"] and retried["forked_from"] is None
            and len(ink_r["sessions"]) == 1 and ink_r["sessions"][0]["id"] == c1doc["id"])
check("corruption.retry_after_move_restores", "pass" if ok_retry else ("limit" if not reproduced else "fail"),
      {"recoveries": rec_r, "kept_hidden": kept_r.get("hidden"), "address_now_holds_good_picture": ((lambda m: m if isinstance(m, dict) else {})((trees.get("h_retried") or {}).get(ctx_rel))).get("sha256") == pc,
       "history": hist.get("retried"), "same_session_no_fork": bool(retried and retried["id"] == c1doc["id"] and retried["forked_from"] is None)},
      "after QA moved its TEST entry aside, Retry saving writes the good picture to its address and the kept document to the same session file (no fork)")

ctxf = parsed("contexts_final") or {}
stopped3 = parsed("stopped3") or {}
pc_items = [i for i in ctxf.get("items", []) if (i.get("image") or {}).get("sha256") == pc]
ok_reopen = (H["reopened3"] and H["reopened3"]["ink"] == retried["ink"] and H["reopened3"]["evidence"] == retried["evidence"]
             and (parsed("app_reopened3") or {}).get("doc", {}).get("revision") == retried["ink"]["revision"]
             and ctxf.get("ok") and all(i["picture_state"] == "shown" and i.get("picture_sha256") == i["image"]["sha256"] for i in ctxf["items"])
             and len(pc_items) == 2 and stopped3.get("ended") == "stopped by the user" and parsed("recoveries3") == [])
check("corruption.reopen_after_recovery", "pass" if ok_reopen else ("limit" if not reproduced else "fail"),
      {"reopened_equals_saved": bool(H["reopened3"] and retried and H["reopened3"]["ink"] == retried["ink"]), "pictures": len(ctxf.get("items", [])),
       "picture_states": sorted({i["picture_state"] for i in ctxf.get("items", [])}), "items_at_recovered_address": len(pc_items), "stopped3": stopped3.get("ended")},
      "Open after the recovery restores the exact history and evidence; every picture, including both uses of the recovered address, opens with its own bytes")
check("corruption.stop_with_kept_ink_reported", "pass" if "stopped by the user" in (parsed("stopped2") or {}).get("ended", "") and len(parsed("recoveries_stopped2") or []) == 1 else "fail",
      {"ended": ((parsed("stopped2") or {}).get("ended") or "")[:400], "recoveries": len(parsed("recoveries_stopped2") or []), "kept_list_visible": (parsed("kept_stopped2") or {}).get("hidden") is False},
      "Stop with ink still kept ends the session and keeps the ink listed for Retry/Export (the end text is recorded as observed)")

# ---------------------------------------------------------------- no AI connected
hints = [ov(k).get("hint", "") for k in ("write", "erase", "undo", "redo", "ask-done", "continued", "reopened2", "relaunch-edit", "c1", "reopened3")] + [card.get("text", ""), ovf.get("hint", "")]
check("no_ai.stated", "pass" if all("No AI is connected" in h for h in hints) else "fail", {"statements": len(hints), "missing": [i for i, h in enumerate(hints) if "No AI is connected" not in h]},
      "every overlay state read and the ASK card say that no AI is connected; network traffic was not observed")

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
        if re.search(r"Users(\\+|/)(?!<)", text.replace("<home>", "")):
            raise SystemExit("a Windows profile path survived redaction")
        return text + "\n"

    def write(name, value):
        with open(os.path.join(EVIDENCE, name), "w", encoding="utf-8") as f:
            f.write(redact(value))

    def write_png(path, rgb):
        h, w = rgb.shape[:2]
        data = b"".join(b"\x00" + rgb[y].astype(np.uint8).tobytes() for y in range(h))
        chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
        with open(path, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(data, 9)) + chunk(b"IEND", b""))

    run_info = load(os.path.join(RUN, "run.json"))
    big = ("timeline1", "timeline2", "askCard") + tuple(k for k in values if k.startswith("h_"))
    exported = dict(results, values={k: v for k, v in values.items() if k not in big})
    exported["values"]["askCard"] = {**card, "src": f"<PNG data URL of {len(card.get('src', ''))} characters>"}
    write("summary.json", {"run": run_info, "counts": counts, "checks": checks})
    write("runner-results.json", exported)
    write("hash-checkpoints.json", {k: trees[k] for k in order if k in trees})
    write("samples-timeline.json", {"process1": parsed("timeline1"), "process2": parsed("timeline2")})
    write("retained-originals.json", per_line)
    write("steps.json", load(os.path.join(RUN, "steps.json")))
    write("run.json", run_info)
    if retried:
        write("ink-final.json", H["reopened3"] or retried)
    if spare:
        write("spare-copy-summary.json", {**{k: v for k, v in spare.items() if k != "context_pictures_png_base64"},
                                          "context_pictures_png_base64": {k: f"<{len(v)} base64 characters; sha256 of bytes {sha(base64.b64decode(v))}>" for k, v in pic_b64.items()}})
    if pc and os.path.exists(os.path.join(RUN, "ink", "context", f"{pc}.png")):
        shutil.copyfile(os.path.join(RUN, "ink", "context", f"{pc}.png"), os.path.join(EVIDENCE, "context-recovered-picture.png"))
    # Crops of QA's own course page region from the app's retained composed frames (never the taskbar or other windows).
    for label in ("write", "erase", "undo", "redo", "continued", "reopened2", "c1", "reopened3"):
        f = selected(label)
        if f and f["composed"] is not None:
            write_png(os.path.join(EVIDENCE, f"composed-{label}.png"), f["composed"][270 * SCALE: 730 * SCALE, 20 * SCALE: 640 * SCALE].clip(0, 255))
