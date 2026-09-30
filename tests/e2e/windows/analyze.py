#!/usr/bin/env python3
"""Checks one QA Windows behaviour run (tests/e2e/windows/run.mjs full <out>).

Usage: python3 analyze.py <run out dir> [<evidence dir>]

Reads the runner results, the sample timeline the control page received, the saved ink snapshots, the app's
context pictures and QA's own desktop screenshots (BMP). With <evidence dir> it writes the committed evidence:
summary.json, runner-results.json, samples-timeline.json, steps.json, run.json, ink-final.json and two crops of
QA's own course window, with Windows profile paths redacted (desktop screenshots are never exported).
Statuses: pass / fail / limit (observed, but the behaviour is not established by this check) / blocked.
"""

import glob
import hashlib
import json
import os
import re
import shutil
import sys

import numpy as np

RUN = sys.argv[1]
EVIDENCE = sys.argv[2] if len(sys.argv) > 2 else None
checks = []
INK = (110, 63, 209)  # the app's solid ink colour


def check(cid, status, observed, note=None):
    checks.append({"id": cid, "status": status, "observed": observed, **({"note": note} if note else {})})


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


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
    return image[:, :, [2, 1, 0]].astype(np.int16)  # BGR(A) -> RGB


def ts(stamp):
    """ISO timestamps from the app (ms) and the runner (100 ns) as comparable seconds."""
    from datetime import datetime
    head, _, frac = stamp.rstrip("Z").partition(".")
    return datetime.fromisoformat(head).timestamp() + (float("0." + frac) if frac else 0.0)


def luma(image):
    return 0.2126 * image[:, :, 0] + 0.7152 * image[:, :, 1] + 0.0722 * image[:, :, 2]


def fingerprint(image, region, scale):
    """16x16 block-mean luminance of a DIP region: an approximation of the app's samples.ts fingerprint."""
    x, y, w, h = [int(round(region[k] * scale)) for k in ("x", "y", "width", "height")]
    lum = luma(image[y: y + h, x: x + w])
    ys, xs = np.linspace(0, h, 17).astype(int), np.linspace(0, w, 17).astype(int)
    return np.array([[lum[ys[i]: ys[i + 1], xs[j]: xs[j + 1]].mean() for j in range(16)] for i in range(16)])


def ink_pixels(image):
    return int(((np.abs(image[:, :, 0] - INK[0]) < 30) & (np.abs(image[:, :, 1] - INK[1]) < 30) & (np.abs(image[:, :, 2] - INK[2]) < 30)).sum())


results = load(os.path.join(RUN, "out", "results.json"))
values, steps = results["values"], results["steps"]
parsed = lambda key: json.loads(values[key]) if isinstance(values.get(key), str) else values.get(key)
timeline = parsed("timeline")
samples, marks = timeline["samples"], {m["label"]: m for m in timeline["marks"]}
display = values["displays"] if isinstance(values["displays"], dict) else values["displays"][0]
SCALE = display["scale_factor"]


def snapshot(label):
    files = glob.glob(os.path.join(RUN, "out", f"snap-{label}", "*.json"))
    return load(files[0]) if len(files) == 1 else (None if not files else "multiple")


def window(a, b):
    """Samples received after mark a and up to mark b."""
    return samples[marks[a]["samples"]: marks[b]["samples"]]


# ---------------------------------------------------------------- run integrity and shared desktop
foreign = results.get("foreign", {})
as_list = lambda v: [] if v is None else (v if isinstance(v, list) else [v])  # PowerShell unrolls one element
foreign_seen = as_list(foreign.get("start")) + as_list(foreign.get("end")) + [f for s in steps if s.get("kind") == "desktopShot" for f in as_list(s.get("foreign"))]
shots = [s for s in steps if s.get("kind") == "desktopShot"]
check("run.shared_desktop_quiet", "pass" if not foreign_seen else "fail",
      {"foreign_electron_seen": sorted({(f["pid"], f["stage"]) for f in foreign_seen}), "points_checked": 2 + len(shots)},
      "point-in-time and Electron-only: no other Electron app at start, at each desktop screenshot and at the end")
contaminated = bool(foreign_seen)


def screen_check(cid, ok, observed, note=None):
    """A check that depends on what is on screen: blocked, not judged, when another app shared the desktop."""
    check(cid, "blocked" if contaminated else ("pass" if ok else "fail"), observed, note)


check("run.completed", "pass" if not results.get("aborted") and not [s for s in steps if not s["ok"]] else "fail",
      {"aborted": results.get("aborted"), "failed_steps": [(s["i"], s.get("kind"), s.get("error")) for s in steps if not s["ok"]],
       "app_exit_code": results["processes"]["app"].get("exit_code")})

# ---------------------------------------------------------------- capture
bad_source = [s["seq"] for s in samples if s["source"]["kind"] != "display" or s["source"]["source_id"] != display["source_id"]
              or s["source"]["bounds"] != display["bounds"] or s["source"]["scale_factor"] != SCALE]
check("capture.source_whole_display", "pass" if samples and not bad_source else "fail",
      {"samples": len(samples), "source_id": display["source_id"], "bounds": display["bounds"], "scale": SCALE, "mismatched_seq": bad_source[:10]})
sizes = sorted({(s["raw"]["width"], s["raw"]["height"]) for s in samples if s.get("raw")})
expect = (display["bounds"]["width"] * SCALE, display["bounds"]["height"] * SCALE)
check("capture.frames_are_display_pixels", "pass" if sizes == [expect] else "fail", {"raw_sizes": sizes, "expected": expect})

# Navigation: only frames sampled after each QA step count; returning must reproduce the earlier pixels exactly.
nav_steps = [s for s in steps if (s.get("kind") == "window" and s.get("show") == "front") or (s.get("kind") == "eval" and s.get("target") == "edge")]
console_front = next(s for s in nav_steps if s.get("window") == "console")
edge_back = next(s for s in nav_steps if s.get("window") == "edge" and ts(s["at"]) > ts(console_front["at"]))
scroll_steps = [s for s in nav_steps if s.get("kind") == "eval" and ts(s["at"]) > ts(edge_back["at"])]
scroll_down, scroll_top = scroll_steps[0], scroll_steps[1]
after = lambda step, until: [s for s in samples if s.get("raw") and ts(step["at"]) < ts(s["sampled_at"]) <= ts(until)]
edge_hash = next(s["raw"]["pixels_sha256"] for s in reversed(samples) if s.get("raw") and ts(s["sampled_at"]) < ts(console_front["at"]))
seen_before_console = {s["raw"]["pixels_sha256"] for s in samples if s.get("raw") and ts(s["sampled_at"]) < ts(console_front["at"])}
m_at = lambda label: timeline["marks"][[m["label"] for m in timeline["marks"]].index(label)]["at"]
nav = {
    "console_front": after(console_front, m_at("console-front")),
    "edge_back": after(edge_back, m_at("edge-back")),
    "scrolled": after(scroll_down, m_at("edge-scrolled")),
    "back_to_top": after(scroll_top, m_at("edge-top")),
}
nav_obs = {k: {"samples_after_step": len(v), "max_change": round(max([s["raw"]["change"] or 0 for s in v] or [0]), 4),
               "hashes": sorted({s["raw"]["pixels_sha256"][:8] for s in v})} for k, v in nav.items()}
nav_ok = (any(s["state"] == "fresh" and (s["raw"]["change"] or 0) >= 0.02 and s["raw"]["pixels_sha256"] not in seen_before_console for s in nav["console_front"])
          and any(s["raw"]["pixels_sha256"] in seen_before_console for s in nav["edge_back"])
          and any((s["raw"]["change"] or 0) >= 0.02 and s["raw"]["pixels_sha256"] not in seen_before_console for s in nav["scrolled"])
          and any(s["raw"]["pixels_sha256"] in seen_before_console for s in nav["back_to_top"]))
desk_static, desk_console = bmp(os.path.join(RUN, "out", "desk-edge-static.bmp")), bmp(os.path.join(RUN, "out", "desk-console-front.bmp"))
nav_obs["edge_hashes_before_console"] = sorted(h[:8] for h in seen_before_console)
nav_obs["returned_to_earlier_edge_hash"] = {k: sorted({s["raw"]["pixels_sha256"][:8] for s in nav[k] if s["raw"]["pixels_sha256"] in seen_before_console}) for k in ("edge_back", "back_to_top")}
nav_obs["qa_screenshots_edge_vs_console_changed_px"] = int((np.abs(desk_static - desk_console).max(axis=2) > 24).sum())
screen_check("capture.navigation_changes_pixels", nav_ok and nav_obs["qa_screenshots_edge_vs_console_changed_px"] > 1_000_000, nav_obs,
             "console to front and scrolling give fresh frames with new pixels; Edge back and back to the top reproduce the earlier Edge pixels exactly")

still = window("edge-top", "idle")
states = lambda group: {st: sum(1 for s in group if s["state"] == st) for st in sorted({s["state"] for s in group})}
moving = [s["seq"] for s in still if s.get("raw") and (s["raw"]["change"] or 0) > 0.02]
idle_a, idle_b = bmp(os.path.join(RUN, "out", "desk-idle-a.bmp")), bmp(os.path.join(RUN, "out", "desk-idle-b.bmp"))
screen_still = float(np.abs(idle_a[: 752 * SCALE] - idle_b[: 752 * SCALE]).mean())  # above the taskbar (clock)
screen_check("capture.still_display_states", bool(still) and not moving and screen_still < 0.5,
             {"samples": len(still), "states": states(still), "max_change": round(max([(s["raw"]["change"] or 0) for s in still if s.get("raw")] or [0]), 5),
              "qa_screenshots_mean_diff_above_taskbar": round(screen_still, 3)},
             "while nothing moved (QA's own two screenshots identical), frames report change 0; no change is invented")

segments, current = [], []
for s in samples:
    if current and s["seq"] <= current[-1]["seq"]:
        segments.append(current)
        current = []
    current.append(s)
segments.append(current)
check("capture.states_stated", "pass" if set(states(samples)) <= {"fresh", "no_new_frame", "gap", "ended"} and all(seg[-1]["state"] == "ended" for seg in segments) else "fail",
      {"states": states(samples), "sessions": [{"samples": len(seg), "last": seg[-1]["state"]} for seg in segments]},
      "each session's last sample says the capture ended (the third, Start-race session produced only its ended sample)")
held = [s["seq"] for s in samples if s.get("raw") and s["raw"]["presented_frames"] > s["raw"]["stream_presented_frames"]]
check("capture.held_frame_facts", "pass" if not held else "fail", {"violations": held,
      "equal_in_all": all(s["raw"]["presented_frames"] == s["raw"]["stream_presented_frames"] for s in samples if s.get("raw"))},
      "a consistency check only (the arrival-during-hashing case is unit-tested by the owner)")
comp_bad = []
for s in samples:
    if (s.get("raw") is None) != (s.get("composed") is None):
        comp_bad.append((s["seq"], "raw/composed presence"))
    elif s.get("composed") and (s["composed"]["visible_strokes"] == 0) != (s["composed"]["pixels_sha256"] == s["raw"]["pixels_sha256"]):
        comp_bad.append((s["seq"], "hash vs visible strokes"))
check("capture.composed_frames", "pass" if not comp_bad else "fail", {"violations": comp_bad[:10]},
      "composed = raw when no ink is visible, differs when ink is visible; never composed without a raw frame")

# The overlay is left out of the raw frame: raw pixels stay identical while only the ink changes.
ink_phase = window("idle", "continued")  # page static; ink changes only (the scroll comes after "continued")
by_rev = {}
for s in ink_phase:
    if s.get("raw") and s.get("composed"):
        by_rev.setdefault(s["composed"]["ink_revision"], set()).add(s["raw"]["pixels_sha256"])
raw_hashes = set().union(*by_rev.values()) if by_rev else set()
screen_check("capture.overlay_not_in_raw_frames", len(by_rev) >= 3 and len(raw_hashes) == 1,
             {"ink_revisions_seen": sorted(by_rev), "distinct_raw_hashes": len(raw_hashes)},
             "while ink went through several revisions on screen over the unchanged page, the raw frame hash never changed")

# ---------------------------------------------------------------- alignment under real movement
def last_marks(a, b):
    return next((s["composed"]["ink_marks"] for s in reversed(window(a, b)) if s.get("composed")), None)


at_before, at_scrolled, at_back = last_marks("draft", "continued"), last_marks("continued", "ink-scrolled"), last_marks("ink-scrolled", "ink-back")
screen_check("alignment.content_moved_then_restored",
             bool(at_before and at_scrolled and at_back and at_scrolled["changed"] >= 1 and at_back == at_before),
             {"before_scroll": at_before, "scrolled_300_dip": at_scrolled, "back": at_back},
             "scrolling the page under fixed ink marks strokes changed (dashed, nothing moved); scrolling back restores the earlier state")

# Which visible stroke stayed verified after the scroll? Reconstruct the scrolled view from QA's own screenshots
# (scroll 0 and scroll 420 DIP): at scroll 300 row y shows scroll-420 row y - 120 DIP.
continued = snapshot("continued")
desk_420 = bmp(os.path.join(RUN, "out", "desk-edge-scrolled.bmp"))
shift_check = float(np.abs(desk_420[100:600] - idle_a[100 + 420 * SCALE: 600 + 420 * SCALE]).mean())
view_300 = idle_a.copy()
view_300[120 * SCALE:] = desk_420[: -120 * SCALE]
rows = []
for sid in continued["ink"]["visible"]:
    root = sid
    while continued["evidence"].get(root) is None and continued["ink"]["strokes"][root]["derived_from"]:
        root = continued["ink"]["strokes"][root]["derived_from"]
    e = continued["evidence"].get(root)
    if not e:
        continue
    f0, f3 = fingerprint(idle_a, e["region"], SCALE), fingerprint(view_300, e["region"], SCALE)
    x, y, w, h = [int(round(e["region"][k] * SCALE)) for k in ("x", "y", "width", "height")]
    pixel_changed = float((np.abs(luma(idle_a[y: y + h, x: x + w]) - luma(view_300[y: y + h, x: x + w])) > 64).mean())
    spread, change = float(f0.std()), float(np.abs(f0 - f3).mean() / 255)
    expected = "unknown" if spread < 4 else ("verified" if change <= 0.06 else "changed")
    rows.append({"stroke": sid[:16], "input": continued["ink"]["strokes"][sid]["input"], "region": e["region"],
                 "fingerprint_spread": round(spread, 1), "fingerprint_change": round(change, 4), "pixels_changed_fraction": round(pixel_changed, 3),
                 "model_status": expected})
false_verified = [r for r in rows if r["model_status"] == "verified" and r["pixels_changed_fraction"] > 0.02]
model_counts = {st: sum(1 for r in rows if r["model_status"] == st) for st in ("verified", "changed", "unknown")}
screen_check("alignment.moved_text_not_verified", not false_verified,
             {"reconstruction_shift_check_mean_diff": round(shift_check, 3), "model_counts": model_counts, "app_counts": at_scrolled,
              "false_verified": false_verified, "strokes": rows},
             "QA-WIN-01: a stroke over ordinary body text stays verified (solid) after the text under it scrolled away")

# ---------------------------------------------------------------- ink loop
ov = lambda k: parsed(f"ov_{k}")
mouse_off = snapshot("mouse-off")
check("write.mouse_off_refused", "pass" if mouse_off is None and ov("mouse_off")["mode"] == "WRITE" and "Mouse writing is off" in ov("mouse_off")["hint"] else "fail",
      {"saved_file": mouse_off is not None, "hint": ov("mouse_off")["hint"][:110]})
check("write.mouse_enabled_explicitly", "pass" if ov("mouse_on")["mouse"] == "true" and ov("write")["mouse"] == "false" else "fail",
      {"before": ov("write")["mouse"], "after": ov("mouse_on")["mouse"]})
docs = {k: snapshot(k) for k in ["draft", "erase", "undo", "redo", "continued", "stopped", "reopened", "reopen-edit", "stopped2"]}
hist = {k: [h["op"] for h in d["ink"]["history"]] for k, d in docs.items() if isinstance(d, dict)}
draft, erase = docs["draft"], docs["erase"]
inputs = [draft["ink"]["strokes"][v]["input"] for v in draft["ink"]["visible"]]
check("write.short_draft_saved", "pass" if hist.get("draft") == ["add"] * 3 and inputs == ["mouse", "mouse", "pen"] else "fail",
      {"history": hist.get("draft"), "inputs": inputs})
new = [s for sid, s in erase["ink"]["strokes"].items() if sid not in draft["ink"]["strokes"]]
origin = next(iter({s["derived_from"] for s in new})) if len({s["derived_from"] for s in new}) == 1 else None
# The eraser crossed at x = 300 DIP: one piece ends before it and one starts after it (points are resampled),
# and both stay within the original's extent.
orig = draft["ink"]["strokes"].get(origin, {"points": []})["points"]
xs = [p[0] for p in orig]
spans = sorted((min(p[0] for p in s["points"]), max(p[0] for p in s["points"])) for s in new)
pieces_inside = (bool(orig) and len(spans) == 2 and spans[0][1] < 300 < spans[1][0]
                 and min(xs) - 2 <= spans[0][0] and spans[1][1] <= max(xs) + 2)
check("write.partial_erase", "pass" if hist.get("erase") == ["add"] * 3 + ["erase"] and len(new) == 2 and origin in erase["ink"]["strokes"]
      and origin not in erase["ink"]["visible"] and len(erase["ink"]["visible"]) == 4 and pieces_inside else "fail",
      {"history": hist.get("erase"), "pieces": len(new), "original_kept_in_history": origin in erase["ink"]["strokes"],
       "pieces_x_spans": [[round(a, 1), round(b, 1)] for a, b in spans], "gap_at_eraser_x_300": pieces_inside, "visible": len(erase["ink"]["visible"])},
      "the pieces keep the original's evidence through derived_from; they have no evidence entry of their own")
check("write.undo_redo", "pass" if sorted(docs["undo"]["ink"]["visible"]) == sorted(draft["ink"]["visible"]) and sorted(docs["redo"]["ink"]["visible"]) == sorted(erase["ink"]["visible"]) else "fail",
      {"undo_visible": len(docs["undo"]["ink"]["visible"]), "redo_visible": len(docs["redo"]["ink"]["visible"]), "history": hist.get("redo")})
card = parsed("askCard")
check("ask.finish_returns_write", "pass" if ov("ask")["mode"] == "ASK" and ov("ask_finished")["card"] and ov("ask_finished")["mode"] == "WRITE"
      and "No AI is connected" in card["text"] and card["src"].startswith("data:image/png;base64,") else "fail",
      {"card_text": card["text"][:230], "mode_after": ov("ask_finished")["mode"]})
check("ask.cancel_returns_write", "pass" if ov("ask2")["mode"] == "ASK" and ov("ask_cancelled")["mode"] == "WRITE" and not ov("ask_cancelled")["card"] else "fail",
      {"mode_after_cancel": ov("ask_cancelled")["mode"], "card": ov("ask_cancelled")["card"]})
check("ask.adds_no_ink_and_continue_writing", "pass" if hist.get("continued") == hist.get("redo") + ["add"] else "fail",
      {"history": hist.get("continued")}, "ASK and Cancel add nothing to the ink history; writing continues")

# ---------------------------------------------------------------- Stop during writing / input during the Stop's save
races = [s for s in steps if s.get("kind") == "raceStop"]
near = lambda p, xy, tol=3: abs(p[0] - xy[0]) <= tol and abs(p[1] - xy[1]) <= tol


def race_result(before, after, kept_from, kept_to, race_from, race_step, label, recoveries_key, stopped_key, kept_status, kept_note):
    added = [s for sid, s in after["ink"]["strokes"].items() if sid not in before["ink"]["strokes"]]
    kept = [s for s in added if near(s["points"][0], kept_from)]
    raced = [s for s in added if any(near(p, race_from, 6) for p in s["points"][:2])]
    ev = after["evidence"].get(kept[0]["id"]) if kept else None
    ok_kept = len(added) == 1 and len(kept) == 1 and kept[0]["input"] == "pen" and len(kept[0]["points"]) == 17 and near(kept[0]["points"][-1], kept_to) and ev and ev["contexts"]
    check(f"stop.{label}_stroke_kept", kept_status if ok_kept else "fail",
          {"strokes_added": len(added), "kept_points": len(kept[0]["points"]) if kept else None, "points_sent": 17,
           "context": bool(ev and ev["contexts"]), "history_tail": [h["op"] for h in after["ink"]["history"]][-3:]}, kept_note)
    delivered = race_step.get("overlay_events_sent", 0) > 0 and race_step.get("overlay_replies") == race_step.get("overlay_events_sent") and race_step.get("overlay_errors") == 0
    ended = json.loads(values[stopped_key])["ended"]
    check(f"stop.{label}_post_stop_stroke_not_persisted", "pass" if delivered and not raced and parsed(recoveries_key) == [] and ended == "stopped by the user" else "fail",
          {"race_stroke_saved": bool(raced), "stop_click_sent": race_step.get("stop_sent_at"), "race_input_sent": race_step.get("input_sent_at"),
           "overlay_events_sent": race_step.get("overlay_events_sent"), "overlay_replies": race_step.get("overlay_replies"),
           "overlay_errors": race_step.get("overlay_errors"), "recoveries": parsed(recoveries_key), "ended": ended},
          "the injected pen stroke sent right behind the Stop click (delivered: the overlay page answered every event) was not saved, and nothing was left unsaved")


race_result(docs["continued"], docs["stopped"], [30, 70], [1180, 720], [80, 700], races[0], "in_progress", "recoveries1", "stopped1", "limit",
            "kept whole, but the release of this held stroke was sent about 1 ms after the Stop click, so settling on Stop (W-I5) is not isolated from an ordinary pen-up")
race_result(docs["reopen-edit"], docs["stopped2"], [30, 80], [1170, 730], [90, 690], races[1], "after_lift", "recoveries2", "stopped2", "pass",
            "a lifted 17-point stroke whose save was still draining when Stop was clicked is saved whole")
check("stop.input_closed_during_save_observed", "limit",
      {"observed": "post-Stop stroke not persisted, no recovery, normal end (both variants)",
       "not_observed": "refusal itself: no overlay state, hint or toolbar was read between the Stop click and the overlay closing"},
      "the pre-fix W-I8 defect (new ink accepted, then destroyed with no recovery) would look the same in this data; the owner's deterministic test remains the evidence that input closes")

stopped, reopened, edit = docs["stopped"], docs["reopened"], docs["reopen-edit"]
session2 = segments[1] if len(segments) > 1 else []
opened = next((s for s in session2 if s.get("composed") and s["composed"]["ink_revision"] > 0), None)
check("reopen.same_ink", "pass" if opened and opened["composed"]["ink_revision"] == len(stopped["ink"]["history"]) and opened["composed"]["visible_strokes"] == len(stopped["ink"]["visible"])
      and f"Reopened {len(stopped['ink']['visible'])} stroke(s)" in ov("reopened")["hint"] else "fail",
      {"overlay_composed_after_open": {"ink_revision": opened["composed"]["ink_revision"], "visible": opened["composed"]["visible_strokes"]} if opened else None,
       "saved": {"revision": len(stopped["ink"]["history"]), "visible": len(stopped["ink"]["visible"])}, "hint": ov("reopened")["hint"][:120]},
      "the overlay's own composed frames after Open carry the saved revision and stroke count (read from disk; the app was not relaunched)")
check("reopen.continue_editing_same_file", "pass" if edit and edit["id"] == stopped["id"] and edit["forked_from"] is None
      and hist.get("reopen-edit") == hist.get("stopped") + ["undo", "add"] else "fail",
      {"same_id": edit["id"] == stopped["id"] if edit else None, "history_tail": hist.get("reopen-edit", [])[-3:]})

final = docs["stopped2"]
missing, mismatched, null_images, observed_issues = [], [], [], []
ctx_dir = os.path.join(RUN, "ink", "context")
for sid, e in final["evidence"].items():
    for c in (e or {}).get("contexts", []):
        if c["not_observed"] != ["source_app", "source_link", "page", "media_position"]:
            observed_issues.append(sid)
        if c["image"] is None:
            null_images.append(sid)
            continue
        f = os.path.join(ctx_dir, c["image"]["sha256"] + ".png")
        if not os.path.exists(f):
            missing.append(c["image"]["sha256"])
        elif hashlib.sha256(open(f, "rb").read()).hexdigest() != c["image"]["sha256"]:
            mismatched.append(c["image"]["sha256"])
referenced = sum(len((e or {}).get("contexts", [])) for e in final["evidence"].values())
check("receipt.every_referenced_picture_stored", "pass" if referenced and not (missing or mismatched or null_images or observed_issues) else "fail",
      {"contexts": referenced, "null_images": null_images, "missing": missing, "hash_mismatch": mismatched, "not_observed_issues": observed_issues,
       "pictures_on_disk": len(glob.glob(os.path.join(ctx_dir, "*.png")))},
      "normal saves only; the 64-picture / 48 MB batching path was not exercised")

# ---------------------------------------------------------------- independent pixel comparison
desk = bmp(os.path.join(RUN, "out", "desk-draft.bmp"))


def compare_context(doc, sid, c):
    pic = os.path.join(RUN, "pictures", c["image"]["sha256"] + ".bmp")
    img = bmp(pic)
    r = c["region_px"]
    crop = desk[r["y"]: r["y"] + r["height"], r["x"]: r["x"] + r["width"]]
    pts = [p[:2] for p in doc["ink"]["strokes"][sid]["points"]]
    reg = c["region"]
    geometry = (all(reg["x"] <= p[0] <= reg["x"] + reg["width"] and reg["y"] <= p[1] <= reg["y"] + reg["height"] for p in pts)
                and all(abs(r[k] - reg[k] * SCALE) <= 1 for k in ("x", "y", "width", "height")))
    if img.shape[:2] != crop.shape[:2]:
        return {"stroke": sid[:16], "error": f"size {img.shape[:2]} vs {crop.shape[:2]}", "geometry_ok": geometry}
    diff = np.abs(img - crop)
    return {"stroke": sid[:16], "region_px": r, "geometry_ok": geometry, "plain": bool(luma(img).std() < 4),
            "mean_abs_diff": round(float(diff.mean()), 2), "within_24": round(float((diff.max(axis=2) <= 24).mean()), 4),
            "ink_coloured_pixels_in_raw": ink_pixels(img)}


pixel = [compare_context(draft, sid, draft["evidence"][sid]["contexts"][0]) for sid in draft["ink"]["visible"]]
textured = [p for p in pixel if "error" not in p and not p["plain"]]
ok = (len(textured) >= 2 and all("error" not in p and p["geometry_ok"] for p in pixel)
      and all(p["mean_abs_diff"] < 8 and p["within_24"] > 0.97 and p["ink_coloured_pixels_in_raw"] == 0 for p in pixel if "error" not in p))
screen_check("pixels.context_matches_independent_screenshot", ok, pixel,
             "each draft stroke's saved raw-frame crop equals QA's GDI screenshot at region_px; region_px = region × scale and contains the stroke; plain regions are not informative")
race_stroke = next(s for sid, s in stopped["ink"]["strokes"].items() if sid not in continued["ink"]["strokes"])
race_ctx = compare_context(stopped, race_stroke["id"], stopped["evidence"][race_stroke["id"]]["contexts"][0])
screen_check("pixels.raw_context_over_existing_ink", "error" not in race_ctx and race_ctx["within_24"] > 0.97 and race_ctx["ink_coloured_pixels_in_raw"] == 0, race_ctx,
             "the long stroke's context covers four solid strokes then on screen; its raw crop has no ink and matches QA's screenshot")

ask_bmp = os.path.join(RUN, "pictures", "ask-crop.bmp")
img = bmp(ask_bmp)
h, w = img.shape[:2]
circle = [[165 + 150 * np.cos(2 * np.pi * i / 36), 557 + 45 * np.sin(2 * np.pi * i / 36)] for i in range(37)]
x0 = int(round((min(round(p[0]) for p in circle) - 8) * SCALE))  # the card's selection box: stroke bounds + 8 DIP
y0 = int(round((min(round(p[1]) for p in circle) - 8) * SCALE))
scores = {}
for dy in range(-16, 17, 2):
    for dx in range(-16, 17, 2):
        c2 = desk[y0 + dy: y0 + dy + h, x0 + dx: x0 + dx + w]
        if c2.shape[:2] == (h, w):
            scores[(dx, dy)] = float((np.abs(img - c2).max(axis=2) <= 24).mean())
best = max(scores, key=scores.get)
far = max(v for k, v in scores.items() if max(abs(k[0]), abs(k[1])) >= 8)
runner_up = max(v for k, v in scores.items() if k != best)
screen_check("pixels.ask_crop_is_selected_region", best == (0, 0) and scores[best] > 0.95 and scores[best] - far >= 0.02,
             {"crop_px": [w, h], "expected_origin_px": [x0, y0], "best_offset_px": list(best), "best_within_24": round(scores[best], 4),
              "runner_up_within_24": round(runner_up, 4), "best_at_8px_or_more_off": round(far, 4)},
             "the ASK card's composed crop matches QA's screenshot exactly at the box the card states, apart from the ink drawn into it")

# ---------------------------------------------------------------- start regressions and exit
double = parsed("doubleStart")
overlays = lambda targets: sum(t["url"].endswith("/renderer/overlay.html") for t in targets)
check("start.one_at_a_time", "pass" if double[0] == {"ok": True} and double[1] == {"ok": False, "reason": "a session is starting"} and overlays(values["targetsDouble"]) == 1 else "fail",
      {"results": double, "overlays": overlays(values["targetsDouble"])})
sds = parsed("stopDuringStart")
check("start.stop_cancels_pending", "pass" if not sds["r"]["ok"] and sds["r"]["reason"].startswith("stopped before the capture started")
      and not sds["state"]["running"] and overlays(values["targetsAfterCancel"]) == 0 else "fail",
      {"result": sds["r"], "state": sds["state"], "overlays_after": overlays(values["targetsAfterCancel"])})
app = results["processes"]["app"]
check("app.closes_cleanly", "pass" if app.get("exited") and app.get("exit_code") == 0 and not app.get("killed") else "fail",
      {"exited": app.get("exited"), "exit_code": app.get("exit_code"), "killed": app.get("killed", False)})
texts = [ov(k)["hint"] for k in ["nav", "write", "mouse_on"]] + [card["text"]]
check("no_ai.stated", "pass" if all("No AI is connected" in t for t in texts) else "fail", {"statements": len(texts)},
      "the overlay and the ASK card state that no AI is connected; network traffic was not observed")

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
        for pattern in (r"C:\\\\Users\\\\[^\\\\\"]+", r"C:\\Users\\[^\\\"]+", r"C:/Users/[^/\"]+", r"/mnt/c/Users/[^/\"]+"):
            text = re.sub(pattern, "<home>", text)
        if re.search(r"Users[\\/]{1,2}(?!<)", text.replace("<home>", "")):
            raise SystemExit("a Windows profile path survived redaction")
        return text + "\n"

    def write(name, value):
        with open(os.path.join(EVIDENCE, name), "w", encoding="utf-8") as f:
            f.write(redact(value))

    run_info = load(os.path.join(RUN, "run.json"))
    exported = dict(results, values={k: v for k, v in values.items() if k not in ("timeline", "askCard")})
    exported["values"]["askCard"] = {"text": card["text"], "src": f"<PNG data URL of {len(card['src'])} characters, exported as ask-crop.png>"}
    write("summary.json", {"run": run_info, "counts": counts, "checks": checks,
                           "samples": {"total": len(samples), "states": states(samples), "sessions": len(segments)},
                           "ink": {"final_id": final["id"], "history": [h["op"] for h in final["ink"]["history"]],
                                   "strokes": len(final["ink"]["strokes"]), "visible": len(final["ink"]["visible"])}})
    write("runner-results.json", exported)
    write("samples-timeline.json", timeline)
    write("steps.json", load(os.path.join(RUN, "steps.json")))
    write("run.json", run_info)
    write("ink-final.json", final)
    # Only pictures of QA's own course window: the first draft stroke's context and the ASK crop.
    first_ctx = draft["evidence"][draft["ink"]["visible"][0]]["contexts"][0]["image"]["sha256"]
    shutil.copyfile(os.path.join(RUN, "ink", "context", first_ctx + ".png"), os.path.join(EVIDENCE, "context-first-stroke.png"))
    shutil.copyfile(os.path.join(RUN, "pictures", "ask-crop.png"), os.path.join(EVIDENCE, "ask-crop.png"))
