#!/usr/bin/env python3
"""Checks one QA Windows behaviour run (tests/e2e/windows/run.mjs full <out>).

Usage: python3 analyze.py <run out dir> [<evidence dir>]

Reads the runner results, the sample timeline the control page received, the saved ink snapshots, the app's
context pictures and QA's own desktop screenshots (BMP). With <evidence dir> it writes the committed evidence:
summary.json, runner-results.json, samples-timeline.json, steps.json, run.json, ink-final.json and two crops of
QA's own course window, with Windows profile paths redacted (desktop screenshots are never exported).
Statuses: pass / fail / limit (observed, but the behaviour is not established by this check) / blocked.
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
model_counts = {st: sum(1 for r in rows if r["model_status"] == st) for st in ("verified", "changed", "unknown")}
# At 55478f0 the verdict is the app's own per-stroke status after the scroll (app_ink-scrolled), checked against
# QA's direct GDI screenshot of the scrolled view; "model_status" above is QA's model of the OLD 16x16 rule and only
# shows whether the hard QA-WIN-01 condition (old-rule verified although the pixels under the stroke changed) recurred.
app_scrolled = parsed("app_ink-scrolled")
desk_scrolled = bmp(os.path.join(RUN, "out", "desk-ink-scrolled.bmp"))
for r in rows:
    sid = next(v for v in continued["ink"]["visible"] if v.startswith(r["stroke"]))
    root = sid
    while continued["evidence"].get(root) is None and continued["ink"]["strokes"][root]["derived_from"]:
        root = continued["ink"]["strokes"][root]["derived_from"]
    e = continued["evidence"][root]
    x, y, w, h = [int(round(e["region"][k] * SCALE)) for k in ("x", "y", "width", "height")]
    r["direct_pixels_changed_fraction"] = round(float((np.abs(luma(idle_a[y: y + h, x: x + w]) - luma(desk_scrolled[y: y + h, x: x + w])) > 64).mean()), 3)
    r["direct_fingerprint_change"] = round(float(np.abs(fingerprint(idle_a, e["region"], SCALE) - fingerprint(desk_scrolled, e["region"], SCALE)).mean() / 255), 4)
    r["app_status"] = app_scrolled["aligned"].get(sid)
    a = next((a for a in app_scrolled["alignment"] if a["id"] == sid), None)
    r["app_fingerprint_change"] = None if not a or a["fingerprint_change"] is None else round(a["fingerprint_change"], 4)
    r["app_detail"] = None if not a or not a["detail"] else {k: a["detail"][k] for k in ("cols", "rows", "result", "moved_cells")}
hard = [r for r in rows if r["fingerprint_spread"] >= 4 and r["direct_pixels_changed_fraction"] > 0.02 and r["direct_fingerprint_change"] <= 0.06]
false_verified = [r for r in rows if r["app_status"] == "verified" and r["direct_pixels_changed_fraction"] > 0.02]
wrong_hard = [r for r in hard if r["app_status"] != "changed"]
status = "fail" if false_verified or wrong_hard else ("pass" if hard else "limit")
check("alignment.moved_text_not_verified", "blocked" if contaminated else status,
      {"hard_condition_recurred": [r["stroke"] for r in hard], "false_verified": false_verified, "app_counts": at_scrolled,
       "model_counts_old_rule": model_counts, "reconstruction_shift_check_mean_diff": round(shift_check, 3), "strokes": rows},
      "QA-WIN-01 retest: after the page scrolled 300 DIP under fixed ink, no stroke whose pixels changed (QA's own screenshot) is verified; "
      "the hard case (old 16x16 rule would verify: coarse change <= 0.06 although > 2 % of the pixels changed) must read 'changed'. "
      "limit if the hard case did not recur")

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
          "the injected pen stroke sent right behind the Stop click (DevTools answered every event) was not persisted and the recovery list was empty; application-level input refusal was not observed")


race_result(docs["continued"], docs["stopped"], [30, 70], [1180, 720], [80, 700], races[0], "in_progress", "recoveries1", "stopped1", "limit",
            "kept whole, but the release of this held stroke was sent about 1 ms after the Stop click, so settling on Stop (W-I5) is not isolated from an ordinary pen-up")
race_result(docs["reopen-edit"], docs["stopped2"], [30, 80], [1170, 730], [90, 690], races[1], "after_lift", "recoveries2", "stopped2", "pass",
            "a lifted 17-point stroke remains saved after the immediately following Stop; overlapping pending save was not observed")
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

# ---------------------------------------------------------------- QA-WIN-01 retest at 55478f0 (sessions 4 and 5)
# App reads (app_*) are the app's own claims through its test hook; each is cross-checked against QA's own GDI
# screenshots and the app's retained composed frames. All strokes are DevTools-injected pen events (synthetic).
retained_sel = load(os.path.join(RUN, "retained-selection.json")) if os.path.exists(os.path.join(RUN, "retained-selection.json")) else {}
doc4_id = values.get("opened4Id")


def snap_doc(label, doc_id):
    f = os.path.join(RUN, "out", f"snap-{label}", f"{doc_id}.json")
    return load(f) if doc_id and os.path.exists(f) else None


def app(label):
    return parsed(f"app_{label}")


def desk(label):
    return bmp(os.path.join(RUN, "out", f"desk-{label}.bmp"))


def box(points, pad=8):
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad


def region_diff(a, b, points, pad=8):
    x0, y0, x1, y1 = [int(round(v * SCALE)) for v in box(points, pad)]
    d = np.abs(luma(a[y0:y1, x0:x1]) - luma(b[y0:y1, x0:x1]))
    return {"changed_px": int((d > 64).sum()), "fraction": round(float((d > 64).mean()), 4)}


def path_samples(points):
    out = []
    for (x1, y1), (x2, y2) in zip([p[:2] for p in points], [p[:2] for p in points][1:]):
        n = max(1, int(np.hypot(x2 - x1, y2 - y1) * SCALE))
        out += [(int(round((x1 + (x2 - x1) * t / n) * SCALE)), int(round((y1 + (y2 - y1) * t / n) * SCALE))) for t in range(n)]
    return out


def ink_style(composed, raw, points):
    """Solid ink is the ink colour on the path; dashed ink (alpha 0.55, dash 7/5) is never the ink colour and
    differs from the raw frame on roughly the dash fraction of the path."""
    pts = path_samples(points)
    c = np.array([composed[y, x] for x, y in pts])
    r = np.array([raw[y, x] for x, y in pts])
    at_ink = float((np.abs(c - INK).max(axis=1) <= 30).mean())
    differs = float((np.abs(c - r).max(axis=1) > 24).mean())
    raw_ink = float((np.abs(r - INK).max(axis=1) <= 30).mean())
    style = "solid" if at_ink >= 0.85 else ("dashed" if at_ink <= 0.15 and differs >= 0.3 else "unclear")
    return {"style": style, "at_ink": round(at_ink, 3), "differs_from_raw": round(differs, 3), "raw_at_ink": round(raw_ink, 3)}


def frame_of(label):
    sel = retained_sel.get(f"app_{label}")
    if not sel:
        return None
    paths = [os.path.join(RUN, "pictures", f"frame-{sel[k]}.bmp") for k in ("raw", "composed")]
    if not all(os.path.exists(p) for p in paths):
        return None
    line = None
    for text in open(os.path.join(RUN, "captures", sel["cap"], "manifest.jsonl"), encoding="utf-8"):
        cand = json.loads(text)
        if cand.get("kind") == "retained" and cand.get("sample_seq") == sel["sample_seq"] and cand.get("sampled_at") == sel["sampled_at"]:
            line = cand
    ok_files = all(hashlib.sha256(open(os.path.join(RUN, "pictures", f"frame-{sel[k]}.png"), "rb").read()).hexdigest() == sel[k] for k in ("raw", "composed"))
    return {"sel": sel, "line": line, "raw": bmp(paths[0]), "composed": bmp(paths[1]), "files_match_names": ok_files}


doc4 = snap_doc("stopped4", doc4_id)
retest_ran = bool(doc4 and app("s4-before"))
if not retest_ran:
    check("retest.ran", "fail", {"doc4": bool(doc4), "app_s4_before": bool(app("s4-before"))}, "the session-4/5 retest segment did not complete")
else:
    START = {"still": (570, 163), "sign": (139, 103), "digit": (159, 163), "cross": (100, 223), "cap": (155, 270)}
    ids4 = {}
    for name, (sx, sy) in START.items():
        found = [sid for sid, st in doc4["ink"]["strokes"].items() if st["derived_from"] is None and near(st["points"][0], (sx, sy), 2)]
        ids4[name] = found[0] if len(found) == 1 else None
    pts4 = {n: doc4["ink"]["strokes"][i]["points"] for n, i in ids4.items() if i}
    ev4 = {n: doc4["evidence"].get(i) for n, i in ids4.items() if i}
    if not all(ids4.values()):
        check("retest.strokes_identified", "fail", {n: bool(i) for n, i in ids4.items()}, "a retest stroke was not found in the saved session-4 ink")
        retest_ran = False
if retest_ran:

    # Panel geometry: the harness's glyph coordinates versus the page's own layout and QA's screenshot.
    geom = parsed("panelGeom")
    panel_shot = desk("panel")
    border = (np.abs(panel_shot - np.array([18, 53, 91])).max(axis=2) <= 12)
    rows_b = np.where(border[:, 60 * SCALE: 700 * SCALE].mean(axis=1) > 0.5)[0]
    cols_b = np.where(border[70 * SCALE: 350 * SCALE].mean(axis=0) > 0.5)[0]
    measured = {"top_dip": round(rows_b.min() / SCALE, 1) if len(rows_b) else None, "left_dip": round(cols_b.min() / SCALE, 1) if len(cols_b) else None}
    expected = {"top_dip": geom["rects"]["qa-live"][1] + 23, "left_dip": geom["rects"]["qa-live"][0]}
    geom_ok = all(measured[k] is not None and abs(measured[k] - expected[k]) <= 1.5 for k in measured)
    screen_check("retest.panel_geometry", geom_ok and all(ids4.values()),
                 {"page_rects_css": geom["rects"], "window": geom["view"], "panel_border_measured": measured, "expected_from_origin_0_23": expected,
                  "strokes_identified": {n: bool(i) for n, i in ids4.items()}},
                 "QA's glyph coordinates rely on the viewport origin (0, 23) DIP: the panel border in QA's screenshot sits where the page's layout says")

    # Cursor: never moved by QA; a cursor inside a stroke's region would be part of the frames under it.
    cursors = [results.get("cursor", {}).get("start"), results.get("cursor", {}).get("end")] + [s.get("cursor") for s in steps if s.get("kind") == "desktopShot"]
    cursors = [tuple(c) for c in cursors if c]
    regions = {n: box(p) for n, p in pts4.items()}
    regions["qa_win_01"] = tuple(v for v in box([p for sid in continued["ink"]["visible"] for p in continued["ink"]["strokes"][sid]["points"]], 8))
    inside = sorted({n for c in cursors for n, (x0, y0, x1, y1) in regions.items() if x0 * SCALE <= c[0] <= x1 * SCALE and y0 * SCALE <= c[1] <= y1 * SCALE and n != "qa_win_01"})
    check("run.cursor_clear_of_strokes", "pass" if cursors and len(set(cursors)) == 1 and not inside else "limit",
          {"positions_px": sorted(set(cursors)), "readings": len(cursors), "inside_retest_stroke_regions": inside},
          "read-only GetCursorPos at start, at every screenshot and at the end: the cursor did not move and was not under a retest stroke")

    def status_series(name, labels):
        return {l: (app(l) or {}).get("aligned", {}).get(ids4[name]) for l in labels}

    def glyph_case(cid, name, before, after, reverted, note):
        series = status_series(name, [before, after, reverted])
        d_after, d_back = region_diff(desk(before), desk(after), pts4[name]), region_diff(desk(before), desk(reverted), pts4[name])
        styles = {}
        for l in (before, after, reverted):
            f = frame_of(l)
            styles[l] = None if f is None else {**ink_style(f["composed"], f["raw"], pts4[name]), "retained_seq": f["sel"]["sample_seq"],
                                                "state_frame": bool(f["line"]) and f["line"]["composed"]["ink_marks"] == (app(l)["last"]["composed"] or {}).get("ink_marks")
                                                and f["line"]["raw"]["pixels_sha256"] == app(l)["last"]["raw"]["pixels_sha256"]}
        want = {before: ("verified", "solid"), after: ("changed", "dashed"), reverted: ("verified", "solid")}
        ok_app = all(series[l] == want[l][0] for l in want)
        ok_px = d_after["changed_px"] > 0 and d_back["changed_px"] == 0
        style_ok = all(styles[l] and styles[l]["style"] == want[l][1] and styles[l]["raw_at_ink"] == 0 for l in want if styles[l] and styles[l]["state_frame"])
        state_frames = [l for l in want if styles[l] and styles[l]["state_frame"]]
        st = "fail" if not ok_app or not style_ok else ("pass" if ok_px and after in state_frames else "limit")
        check(cid, "blocked" if contaminated else st,
              {"app_status": series, "qa_screenshot_region_change": {"after": d_after, "reverted": d_back}, "composed_frames": styles,
               "region_dip": box(pts4[name]), "detail": {l: next((a["detail"] for a in (app(l) or {}).get("alignment", []) if a["id"] == ids4[name]), None) for l in want}},
              note)

    glyph_case("alignment.sign_change_under_ink", "sign", "s4-before", "s4-sign-after", "s4-sign-reverted",
               "a one-glyph sign change (x − 1 -> x + 1) under a small finished stroke: verified (solid) -> changed (dashed, in the app's retained composed frame) -> verified when restored")
    glyph_case("alignment.digit_change_under_ink", "digit", "s4-sign-reverted", "s4-digit-after", "s4-digit-reverted",
               "a digit change (3 -> 8) under a small finished stroke, then restored")
    still_labels = ["s4-before", "s4-sign-after", "s4-sign-reverted", "s4-digit-after", "s4-digit-reverted", "s4-cross-released", "s4-cross-reverted", "s4-cap-released"]
    still_series = status_series("still", still_labels)
    still_px = {l: region_diff(desk("s4-before"), desk(l), pts4["still"])["changed_px"] for l in still_labels}
    still_styles = {l: (lambda f: None if f is None else ink_style(f["composed"], f["raw"], pts4["still"])["style"])(frame_of(l)) for l in still_labels}
    screen_check("alignment.unchanged_text_stays_verified",
                 all(v == "verified" for v in still_series.values()) and not any(still_px.values()) and all(v in (None, "solid") for v in still_styles.values()),
                 {"app_status": still_series, "qa_screenshot_changed_px": still_px, "composed_style": still_styles},
                 "control: a stroke over text that never changed stays verified and solid while the other glyphs change")

    # Writing across a changed frame.
    cross_ev = ev4.get("cross") or {}
    ctxs = cross_ev.get("contexts", [])
    cross_series = status_series("cross", ["s4-cross-released", "s4-cross-reverted"])
    ctx_dir4 = os.path.join(RUN, "ink", "context")

    def ctx_vs_shot(c, label):
        f = os.path.join(RUN, "pictures", c["image"]["sha256"] + ".bmp") if c.get("image") else None
        if not f or not os.path.exists(f):
            return {"error": "no picture"}
        img, shot, r = bmp(f), desk(label), c["region_px"]
        crop = shot[r["y"]: r["y"] + r["height"], r["x"]: r["x"] + r["width"]]
        if img.shape[:2] != crop.shape[:2]:
            return {"error": f"size {img.shape[:2]} vs {crop.shape[:2]}"}
        return {"within_24": round(float((np.abs(img - crop).max(axis=2) <= 24).mean()), 4), "ink_in_raw": ink_pixels(img), "screenshot": label}

    pic_cmp = [ctx_vs_shot(ctxs[0], "s4-digit-reverted"), ctx_vs_shot(ctxs[1], "s4-cross-changed")] if len(ctxs) == 2 else []
    cross_styles = {l: (lambda f: None if f is None else ink_style(f["composed"], f["raw"], pts4["cross"])["style"])(frame_of(l)) for l in cross_series}
    ok_cross = (len(ctxs) == 2 and ctxs[0]["reason"] == "writing_started" and ctxs[0]["from_point"] == 0 and ctxs[1]["reason"] == "changed_while_writing"
                and 0 < ctxs[1]["from_point"] < len(pts4["cross"]) and ctxs[1]["frame_seq"] > ctxs[0]["frame_seq"] and cross_ev.get("changes_not_kept") == 0
                and all(c.get("image") for c in ctxs) and cross_series == {"s4-cross-released": "changed", "s4-cross-reverted": "unknown"}
                and all(v in (None, "dashed") for v in cross_styles.values()))
    pics_ok = len(pic_cmp) == 2 and all("error" not in p and p["within_24"] > 0.97 and p["ink_in_raw"] == 0 for p in pic_cmp)
    screen_check("context.write_across_changed_frame", ok_cross and pics_ok,
                 {"contexts": [{k: c[k] for k in ("reason", "from_point", "frame_seq")} | {"image": bool(c.get("image"))} for c in ctxs],
                  "points": len(pts4["cross"]), "changes_not_kept": cross_ev.get("changes_not_kept"), "app_status": cross_series,
                  "composed_style": cross_styles, "pictures_vs_qa_screenshots": pic_cmp},
                 "pen down over '2', the page changed to '7' while the pen was held, writing continued: two contexts (start, change), picture 2 shows the changed page; "
                 "the stroke is changed at release and unknown (never verified) after the page is restored")

    # The context cap.
    cap_ev = ev4.get("cap") or {}
    cctx = cap_ev.get("contexts", [])
    cap_values = ["1", "2", "3", "4", "5", "6", "7", "8", "8", "9", "9", "8", "0"]
    step_marks = [f"s4-cap-{i + 1}-{v}" for i, v in enumerate(cap_values)]
    bounds = ["s4-cap-start"] + step_marks
    sampled, prev_hashes = [], set(s["raw"]["pixels_sha256"] for s in window("s4-cross-reverted", "s4-cap-start") if s.get("raw"))
    for a, b in zip(bounds, bounds[1:]):
        fresh = [s for s in window(a, b) if s.get("raw") and s["state"] == "fresh" and s["raw"]["pixels_sha256"] not in prev_hashes]
        sampled.append(bool(fresh))
        prev_hashes = set(s["raw"]["pixels_sha256"] for s in window(a, b) if s.get("raw"))
    expected_omitted, base = 0, "7"
    for v, seen in zip(cap_values[7:], sampled[7:]):
        if seen and v != base:
            expected_omitted, base = expected_omitted + 1, v
    gest = [len(((app(f"s4-cap-{i + 1}") or {}).get("gesture") or {}).get("contexts", [])) for i in range(13)]
    pinned = {"before": app("s4-before")["pinned"], "after_release": app("s4-cap-released")["pinned"], "gesture_after_release": app("s4-cap-released")["gesture"]}
    ok_cap = (len(cctx) == 8 and cctx[0]["reason"] == "writing_started" and all(c["reason"] == "changed_while_writing" for c in cctx[1:])
              and all(b["from_point"] > a["from_point"] for a, b in zip(cctx, cctx[1:])) and len(pts4["cap"]) == 32
              and cap_ev.get("changes_not_kept") == expected_omitted and all(c.get("image") for c in cctx) and pinned["gesture_after_release"] is None and pinned["after_release"] <= pinned["before"] + 2)
    check("context.cap_counted_once", "blocked" if contaminated else ("pass" if ok_cap and all(sampled) else ("fail" if not ok_cap else "limit")),
          {"contexts": len(cctx), "reasons": [c["reason"] for c in cctx], "from_points": [c["from_point"] for c in cctx], "frame_seqs": [c["frame_seq"] for c in cctx],
           "changes_not_kept": cap_ev.get("changes_not_kept"), "expected_from_sampled_values": expected_omitted, "every_state_sampled": sampled,
           "live_gesture_contexts_per_step": gest, "points_saved": len(pts4["cap"]), "points_sent": 32, "pinned": pinned},
          "one held stroke over a value that changed 13 times (1..7 fill the 8 contexts; then 8, 8, 9, 9, 8, 0): 8 contexts, repeats not counted, "
          "the return 9->8 counted: 4 omitted changes recorded only as a count (no frames, times or pictures for them)")

    # ASK while a stroke is changed.
    card4 = parsed("askCard4")
    n_dashed = sum(1 for v in card4["aligned"].values() if v != "verified")
    mnote = re.search(r"(\d+) of your strokes are drawn dashed", card4["text"])
    crop4 = os.path.join(RUN, "pictures", "ask-crop-4.bmp")
    reg = re.search(r"Region (-?\d+),(-?\d+) (\d+)×(\d+) DIP", card4["text"])
    crop_style = None
    if os.path.exists(crop4) and reg:
        cimg = bmp(crop4)
        ox, oy = int(reg.group(1)), int(reg.group(2))
        shot = desk("s4-sign-after")[oy * SCALE: oy * SCALE + cimg.shape[0], ox * SCALE: ox * SCALE + cimg.shape[1]]
        local = [[p[0] - ox, p[1] - oy] for p in pts4["sign"]]
        if shot.shape[:2] == cimg.shape[:2]:
            crop_style = {"sign": ink_style(cimg, shot, local), "still_not_in_crop": True}
    ask_ok = (card4["aligned"].get(ids4["sign"]) == "changed" and mnote and int(mnote.group(1)) == n_dashed and "No AI is connected" in card4["text"]
              and card4["mode"] == "WRITE" and crop_style and crop_style["sign"]["style"] == "dashed")
    screen_check("ask.dashed_count_matches_marks", bool(ask_ok),
                 {"card_note": mnote.group(0) if mnote else None, "not_verified_strokes_at_card": n_dashed, "sign_status": card4["aligned"].get(ids4["sign"]),
                  "crop_region": reg.group(0) if reg else None, "crop_sign_style": crop_style, "text": card4["text"][:300]},
                 "the local ASK card states how many strokes are dashed (all visible strokes, as on screen), and its crop draws the changed stroke dashed")

    # Composed pixels at every observed state: dashed exactly for the strokes the app does not verify; raw frames carry no ink.
    per_label, mismatched, stale = {}, [], []
    for key in sorted(k for k in values if k.startswith("app_s4-") or k.startswith("app_s5-")):
        label = key[4:]
        view = app(label)
        f = frame_of(label)
        if not f or not view.get("last") or not view["last"].get("composed"):
            continue
        state_frame = bool(f["line"]) and f["line"]["composed"]["ink_marks"] == view["last"]["composed"]["ink_marks"] and f["line"]["raw"]["pixels_sha256"] == view["last"]["raw"]["pixels_sha256"]
        if not state_frame:
            stale.append(label)
            continue
        styles = {n: ink_style(f["composed"], f["raw"], pts4[n]) for n, sid in ids4.items() if sid in view["aligned"]}
        want = {n: ("solid" if view["aligned"][ids4[n]] == "verified" else "dashed") for n in styles}
        bad = {n: (styles[n]["style"], want[n]) for n in styles if styles[n]["style"] != want[n] or styles[n]["raw_at_ink"] > 0}
        marks = f["line"]["composed"]["ink_marks"]
        counts_ok = marks["verified"] == sum(1 for w in want.values() if w == "solid") and marks["changed"] + marks["unknown"] + marks["following_content"] == sum(1 for w in want.values() if w == "dashed")
        per_label[label] = {"retained_seq": f["sel"]["sample_seq"], "marks": marks, "styles": {n: styles[n]["style"] for n in styles}, "files_match_names": f["files_match_names"]}
        if bad or not counts_ok or not f["files_match_names"]:
            mismatched.append({"label": label, "bad": bad, "counts_ok": counts_ok})
    screen_check("pixels.composed_marks_match_status", bool(per_label) and not mismatched,
                 {"states_checked": len(per_label), "per_state": per_label, "mismatched": mismatched, "no_state_frame_retained": stale},
                 "in the app's own retained composed PNG for each observed state, every stroke the app verifies is solid and every other stroke dashed; "
                 "the manifest's ink marks count them; the retained raw PNG has no ink on any stroke path")

    # Stop -> save -> reopen of the session-4 ink in session 5.
    stopped4, reopened4 = parsed("stopped4"), snap_doc("reopened4", doc4_id)
    details_ok = all(e and e.get("detail") and e["detail"]["cols"] * e["detail"]["rows"] <= 4096
                     and len(base64.b64decode(e["detail"]["luma"])) == e["detail"]["cols"] * e["detail"]["rows"] for e in ev4.values())
    missing4 = []
    for n, e in ev4.items():
        for c in (e or {}).get("contexts", []):
            f = os.path.join(ctx_dir4, (c.get("image") or {}).get("sha256", "none") + ".png")
            if not c.get("image") or not os.path.exists(f) or hashlib.sha256(open(f, "rb").read()).hexdigest() != c["image"]["sha256"] or c["not_observed"] != ["source_app", "source_link", "page", "media_position"]:
                missing4.append((n, c.get("from_point")))
    check("stop.stopped4_saved", "pass" if stopped4["ended"] == "stopped by the user" and parsed("recoveries4") == [] and len(doc4["ink"]["visible"]) == 5
          and [h["op"] for h in doc4["ink"]["history"]] == ["add"] * 5 and details_ok and not missing4 else "fail",
          {"ended": stopped4["ended"], "recoveries": parsed("recoveries4"), "visible": len(doc4["ink"]["visible"]), "history": [h["op"] for h in doc4["ink"]["history"]],
           "detail_valid": details_ok, "context_pictures_missing_or_wrong": missing4,
           "contexts_per_stroke": {n: len((e or {}).get("contexts", [])) for n, e in ev4.items()}},
          "after the lifted strokes settled, Stop saved all five strokes with their detail grids and every context picture (hash-checked); no recovery entry")
    items = (parsed("contexts4") or {}).get("items", []) if isinstance(parsed("contexts4"), dict) else []
    reopened_status = {n: (app("s5-reopened") or {}).get("aligned", {}).get(i) for n, i in ids4.items()}
    want_reopen = {"still": "verified", "sign": "verified", "digit": "verified", "cross": "unknown", "cap": "unknown"}
    digit_after = {l: (app(l) or {}).get("aligned", {}).get(ids4["digit"]) for l in ("s5-digit-after", "s5-digit-reverted")}
    shown = (app("s5-reopened") or {}).get("doc") or {}
    same_doc = (bool(reopened4) and all(reopened4[k] == doc4[k] for k in ("id", "ink", "evidence")) and shown.get("id") == doc4["id"]
                and sorted(shown.get("visible", [])) == sorted(doc4["ink"]["visible"]) and shown.get("revision") == doc4["ink"]["revision"])
    reopen_ok = (same_doc and values.get("opened4Id") == doc4["id"] and reopened_status == want_reopen
                 and "Reopened 5 stroke(s)" in parsed("ov_reopened4")["hint"] and digit_after == {"s5-digit-after": "changed", "s5-digit-reverted": "verified"}
                 and len(items) == 13 and all(i["picture_state"] == "shown" for i in items)
                 and sorted(sum(1 for i in items if i["stroke"] == k) for k in {i["stroke"] for i in items}) == [1, 1, 1, 2, 8]
                 and parsed("stopped5")["ended"] == "stopped by the user" and parsed("recoveries5") == [])
    screen_check("reopen.detail_and_counter_round_trip", bool(reopen_ok),
                 {"same_document_after_open": same_doc, "app_status_after_open": reopened_status, "expected": want_reopen,
                  "hint": parsed("ov_reopened4")["hint"][:120], "digit_change_after_reopen": digit_after,
                  "pictures": {"items": len(items), "states": sorted({i["picture_state"] for i in items}), "per_stroke": sorted(sum(1 for i in items if i["stroke"] == k) for k in {i["stroke"] for i in items})},
                  "stopped5": parsed("stopped5")["ended"], "recoveries5": parsed("recoveries5")},
                 "Open in a new session restores the same file (detail grids, 8 cap contexts and the omitted-change count); alignment is recomputed against the new "
                 "session's frames: unchanged glyphs verified, multi-context strokes unknown, and a digit change after reopening reads changed then verified; "
                 "all 13 context pictures open again")

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
    exported = dict(results, values={k: v for k, v in values.items() if k not in ("timeline", "askCard", "askCard4")})
    exported["values"]["askCard"] = {"text": card["text"], "src": f"<PNG data URL of {len(card['src'])} characters, exported as ask-crop.png>"}
    if values.get("askCard4"):
        c4 = parsed("askCard4")
        exported["values"]["askCard4"] = {**c4, "src": f"<PNG data URL of {len(c4['src'])} characters, exported as ask-crop-4.png>"}
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
    if retest_ran:
        write("ink-retest.json", doc4)
        write("retained-selection.json", retained_sel)
        if os.path.exists(os.path.join(RUN, "pictures", "ask-crop-4.png")):
            shutil.copyfile(os.path.join(RUN, "pictures", "ask-crop-4.png"), os.path.join(EVIDENCE, "ask-crop-4.png"))
        for n in ("cross", "cap"):
            for k, c in enumerate((ev4.get(n) or {}).get("contexts", [])):
                if c.get("image"):
                    shutil.copyfile(os.path.join(RUN, "ink", "context", c["image"]["sha256"] + ".png"), os.path.join(EVIDENCE, f"context-{n}-{k + 1}.png"))

        def write_png(path, rgb):
            h, w = rgb.shape[:2]
            data = b"".join(b"\x00" + rgb[y].astype(np.uint8).tobytes() for y in range(h))
            chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
            with open(path, "wb") as f:
                f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(data, 9)) + chunk(b"IEND", b""))

        # Only QA's own panel (viewport 40..760 x 40..340 CSS px) from the app's retained composed frames.
        for label in ("s4-before", "s4-sign-after", "s4-digit-after", "s4-cross-released", "s4-cap-released", "s5-reopened"):
            f = frame_of(label)
            if f:
                write_png(os.path.join(EVIDENCE, f"composed-panel-{label}.png"), f["composed"][63 * SCALE: 363 * SCALE, 40 * SCALE: 760 * SCALE].clip(0, 255))
