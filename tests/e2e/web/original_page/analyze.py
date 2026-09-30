"""Independent analysis of the original-page component pass (run.mjs raw.json, raw-repro.json).

Decodes every PNG the worker's pass-through wrapper recorded and checks the product's report against
those exact bytes: SHA-256, size, the crop box and the crop's colour statistics. It also checks what the
crop actually shows (on the owned page, the magenta block #d81b60 is the marked figure). Nothing here
trusts the product's own numbers without recomputing them.

Statuses: pass, fail, not_exercised (the case did not produce the condition it tests, so it proves
nothing either way). A check whose required value is missing fails.

Usage: python3 analyze.py <raw dir> <evidence dir>
Writes <evidence dir>/summary.json and, for the owned synthetic page only, the exact captured PNG bytes
and re-encoded crops of the cases that decide a result. Public-page pixels are never included in published evidence.
"""

import base64
import hashlib
import json
import re
import struct
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "ios" / "qa_ios_01"))
from check import png_rgba  # noqa: E402  (QA's existing pure-Python PNG decoder)

RAW, EVIDENCE = Path(sys.argv[1]), Path(sys.argv[2])
EVIDENCE.mkdir(parents=True, exist_ok=True)
for old in EVIDENCE.glob("*.png"):
    if not old.name.startswith(("rec-", "ink-")):  # other analyzers' evidence stays
        old.unlink()
PASS_RAW, REPRO = RAW / "raw.json", RAW / "raw-repro.json"
raw = json.loads(PASS_RAW.read_text()) if PASS_RAW.exists() else None  # the component pass (optional)
rr = json.loads(REPRO.read_text()) if REPRO.exists() else None
base = raw or rr
F, P = (raw["fixture"]["values"], raw["public"]["values"]) if raw else ({}, {})
MAGENTA = (216, 27, 96)
GREEN = (27, 158, 75)  # the page-owned shadow component's block (repro N2)
LABEL = ("One snapshot for this mark only: not continuous observation of the screen, and no AI interpretation "
         "(no provider is connected). The image stays in this tab; nothing was sent or stored.")
START_HINT = "Only then is the visible tab captured."
STATIC = "not timing-dependent"
WRAPPER = "pass-through wrapper (records calls, active tab and returned PNG)"
checks, cases = [], {}


def check(cid, description, status, observed, timing, instrument=None):
    checks.append({"id": cid, "description": description, "status": status, "timing": timing, "instrumentation": instrument, "observed": observed})


def verdict(ok):
    return "pass" if ok else "fail"


def entries(values, key):
    return (values.get(key) or {}).get("entries", [])


def ms(stamp):
    return int(stamp[11:13]) * 3600000 + int(stamp[14:16]) * 60000 + round(float(stamp[17:-1]) * 1000)


def timing_of(*logs):
    """Label from the delays each recorded capture actually used."""
    used = [e for log in logs for e in log]
    delayed = sorted({(e.get("before", 0), e.get("after", 0)) for e in used if e.get("before") or e.get("after")})
    if delayed:
        return "timing stand-in: " + ", ".join(f"real capture {b} ms after the request, answer {a} ms after the capture" for b, a in delayed)
    gaps = [ms(e["captureStartedAt"]) - ms(e["calledAt"]) for e in used if e.get("captureStartedAt") and e.get("calledAt")]
    span = f"{min(gaps)}-{max(gaps)} ms" if gaps else "not measured"
    return f"real browser scheduling, no injected delay (the wrapper adds one tabs.query before each capture: {span})"


def png_bytes(data_url):
    return base64.b64decode(data_url.split(",", 1)[1]) if isinstance(data_url, str) and data_url.startswith("data:image/png;base64,") else None


def decode(data):
    path = RAW / "_decode.png"
    path.write_bytes(data)
    try:
        return png_rgba(path)
    finally:
        path.unlink()


def stats(image, box, color=MAGENTA):
    width, height, rows = image
    n = r = g = b = dark = mag = 0
    for y in range(box["y"], box["y"] + box["height"]):
        row = rows[y]
        for x in range(box["x"], box["x"] + box["width"]):
            pr, pg, pb = row[4 * x], row[4 * x + 1], row[4 * x + 2]
            r, g, b, n = r + pr, g + pg, b + pb, n + 1
            dark += (0.2126 * pr + 0.7152 * pg + 0.0722 * pb) < 128
            mag += abs(pr - color[0]) + abs(pg - color[1]) + abs(pb - color[2]) <= 30
    return {"mean": [round(r / n), round(g / n), round(b / n)], "dark_share": round(dark / n, 3), "target_share": round(mag / n, 3)}


def color_rows(image, color=MAGENTA):
    """Rows (first, last) where the target block's colour appears in the image, or None."""
    width, height, rows = image
    hits = [y for y in range(height) if sum(1 for x in range(0, width, 2)
                                            if abs(rows[y][4 * x] - color[0]) + abs(rows[y][4 * x + 1] - color[1]) + abs(rows[y][4 * x + 2] - color[2]) <= 30) >= 20]
    return [hits[0], hits[-1]] if hits else None


def write_png(path, width, height, rows):
    body = b"".join(b"\x00" + bytes(row) for row in rows)
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(body, 9)) + chunk(b"IEND", b""))


def devtools_diff(shot, image, box):
    """Mean absolute channel difference of the crop between the capture and a DevTools screenshot taken just after."""
    if not Path(shot).exists():
        return {"comparable": False, "reason": "no DevTools screenshot"}
    other = png_rgba(shot)
    if (other[0], other[1]) != (image[0], image[1]):
        return {"comparable": False, "sizes": [[other[0], other[1]], [image[0], image[1]]]}
    total = n = 0
    for y in range(box["y"], box["y"] + box["height"]):
        a, b = image[2][y], other[2][y]
        for i in range(4 * box["x"], 4 * (box["x"] + box["width"])):
            if i % 4 != 3:
                total += abs(a[i] - b[i])
                n += 1
    return {"comparable": True, "mean_abs_diff": round(total / n, 2)}


def examine(values, state_key, log_key, save=None, owned=False, shot=None, color=MAGENTA, expected=None):
    """The product's record for one mark versus the exact bytes captureVisibleTab returned."""
    state, log = values.get(state_key) or {}, entries(values, log_key)
    last = state.get("last") or {}
    out = {"wrapper_calls": len(log), "status": last.get("status"), "reason": last.get("reason") or None,
           "crop_shown": state.get("cropShown"), "geometry": last.get("geometry"), "crop": last.get("crop"), "product_crop_mean": last.get("cropMean"),
           "product_dark_share": last.get("cropDarkShare"), "notes": last.get("notes"), "page_updates": last.get("pageUpdates"), "view": last.get("view"),
           "rect_now": last.get("rectNow"), "media": last.get("media"), "times": {k: last.get(k) for k in ("markedAt", "requestedAt", "capturedAt", "receivedAt")},
           "wrapper": [{k: v for k, v in e.items() if k != "dataUrl"} for e in log]}
    # The capture this record shows: the only one, or (several calls) the one whose bytes the product hashed.
    product_sha = (last.get("image") or {}).get("sha256")
    candidates = [png_bytes(e.get("dataUrl")) for e in log if e.get("ok")]
    candidates = [c for c in candidates if c is not None]
    matching = [c for c in candidates if hashlib.sha256(c).hexdigest() == product_sha]
    data = candidates[0] if len(log) == 1 and candidates else (matching[0] if matching else None)
    if data is None:
        return out, None
    image = decode(data)
    out["bytes"] = {"sha256": hashlib.sha256(data).hexdigest(), "length": len(data), "width": image[0], "height": image[1], "png_signature": data[:8] == b"\x89PNG\r\n\x1a\n"}
    product_image = last.get("image") or {}
    out["hash_matches_product"] = product_image.get("sha256") == out["bytes"]["sha256"]
    out["size_matches_product"] = (product_image.get("width"), product_image.get("height")) == (image[0], image[1])
    if last.get("crop"):
        out["recomputed"] = stats(image, last["crop"], color)
        if shot:
            out["devtools_screenshot"] = devtools_diff(shot, image, last["crop"])
    if owned:
        out["target_rows_in_image"] = color_rows(image, color)
        out["target_rows_unmoved"] = expected if expected is not None else EXPECTED_ROWS
        if save:
            (EVIDENCE / f"{save}-capture.png").write_bytes(data)  # the exact returned bytes (hash = product's hash)
            if last.get("crop"):
                c = last["crop"]
                write_png(EVIDENCE / f"{save}-crop.png", c["width"], c["height"], [image[2][y][4 * c["x"]:4 * (c["x"] + c["width"])] for y in range(c["y"], c["y"] + c["height"])])
    return out, image


def close(a, b, tolerance=1):
    return a is not None and b is not None and all(abs(x - y) <= tolerance for x, y in zip(a, b))


def ordered(*times):
    return all(isinstance(t, str) for t in times) and list(times) == sorted(times)


def inside(box, rect, slack=1):
    return bool(box and rect) and (box["x"] >= rect["x"] - slack and box["y"] >= rect["y"] - slack
                                   and box["x"] + box["width"] <= rect["x"] + rect["width"] + slack
                                   and box["y"] + box["height"] <= rect["y"] + rect["height"] + slack)


def good_mark(rec):
    """A received mark whose shown crop is the exact captured pixels (hash, size, recomputed statistics)."""
    return bool(rec["wrapper_calls"] == 1 and rec["status"] == "received" and rec.get("hash_matches_product") and rec.get("size_matches_product")
                and rec["crop_shown"] is True and rec.get("recomputed") is not None and close(rec["recomputed"]["mean"], rec["product_crop_mean"])
                and (rec["product_dark_share"] is None or abs(rec["recomputed"]["dark_share"] - rec["product_dark_share"]) <= 0.01))


EXPECTED_ROWS = [0, 0]  # magenta rows of the unscrolled, unshifted owned page (set from the marked block's rect)


def displaced(rec):
    rows, unmoved = rec.get("target_rows_in_image"), rec.get("target_rows_unmoved")
    return rows is None or abs(rows[0] - unmoved[0]) > 1 or abs(rows[1] - unmoved[1]) > 1


def guard_outcome(rec):
    """For a case where the marked content was displaced in the image: shown as marked (wrong), or kept unknown/refused."""
    if not (rec["wrapper_calls"] == 1 and rec.get("hash_matches_product") and rec.get("bytes") and displaced(rec)):
        return "not_exercised"
    if rec["status"] == "received" and rec["crop"] is not None:
        return "wrong region shown as marked"
    if (rec["status"] == "received" and (rec["geometry"] or {}).get("known") is False and rec["crop"] is None) or rec["status"] == "failed":
        return "kept unknown or refused"
    return "unexpected"


def guard_check(cid, description, rec, timing, extra=None):
    outcome = guard_outcome(rec)
    status = {"not_exercised": "not_exercised", "kept unknown or refused": "pass"}.get(outcome, "fail")
    check(cid, description, status, {"outcome": outcome, "status": rec["status"], "reason": rec["reason"], "geometry": rec["geometry"], "crop": rec["crop"],
                                    "crop_shown": rec["crop_shown"], "notes": rec["notes"], "page_updates_seen": rec["page_updates"],
                                    "recomputed_crop": rec.get("recomputed"), "target_rows_in_image": rec.get("target_rows_in_image"),
                                    "target_rows_unmoved": rec.get("target_rows_unmoved"), "hash_matches_product": rec.get("hash_matches_product"), **(extra or {})},
          timing, WRAPPER)


def series_check(cid, description, values, prefix, log_prefix, save_prefix, extra_keys, color=MAGENTA, expected_of=None):
    attempts, saved_outcomes = [], set()
    for i in range(1000):
        if f"{prefix}{i}" not in values:
            break
        expected = expected_of(i) if expected_of else None
        rec, _ = examine(values, f"{prefix}{i}", f"{log_prefix}{i}", owned=True, color=color, expected=expected)
        outcome = guard_outcome(rec)
        if outcome in ("wrong region shown as marked", "kept unknown or refused") and outcome not in saved_outcomes:
            examine(values, f"{prefix}{i}", f"{log_prefix}{i}", owned=True, save=f"{save_prefix}-{'wrong' if outcome.startswith('wrong') else 'kept-unknown'}-{i}", color=color, expected=expected)
            saved_outcomes.add(outcome)
        first = rec["wrapper"][0] if rec["wrapper"] else {}
        attempts.append({"attempt": i, "outcome": outcome, "geometry_known": (rec["geometry"] or {}).get("known"), "geometry_reason": (rec["geometry"] or {}).get("reason"),
                         "crop_target_share": (rec.get("recomputed") or {}).get("target_share"), "notes": rec["notes"],
                         "target_rows_in_image": rec.get("target_rows_in_image"), "hash_matches_product": rec.get("hash_matches_product"),
                         "requested_at": rec["times"]["requestedAt"], "capture_started_at": first.get("captureStartedAt"),
                         "received_at": rec["times"]["receivedAt"], **{k: values.get(f"{k}{i}") for k in extra_keys}})
    counts = {o: sum(a["outcome"] == o for a in attempts) for o in ("wrong region shown as marked", "kept unknown or refused", "not_exercised", "unexpected")}
    exercised = len(attempts) - counts["not_exercised"]
    status = "not_exercised" if exercised == 0 else ("fail" if counts["wrong region shown as marked"] or counts["unexpected"] else "pass")
    check(cid, description, status, {"counts": counts, "attempts": attempts},
          timing_of(*[entries(values, f"{log_prefix}{a['attempt']}") for a in attempts]), WRAPPER)


# ---- run integrity and static checks ------------------------------------------------------------------
runs = {"fixture": raw["fixture"], "public": raw["public"]} if raw else {}
if rr:
    runs["repro"] = rr["repro"]
harness = {"pass_run": raw and raw.get("harness"), "repro_run": rr and rr.get("harness"), "analyze_now": hashlib.sha256((HERE / "analyze.py").read_bytes()).hexdigest()}
check("runner_clean", "every browser run exited normally with no failed step", verdict(all(r.get("runner_exit") == 0 and not r.get("errors") for r in runs.values())),
      {name: {"exit": r.get("runner_exit"), "errors": r.get("errors"), "steps_sha256": r.get("steps_sha256")} for name, r in runs.items()}, STATIC)
check("provenance", "the exact candidate copy equals the commit, its generated extension files are current, and the loaded folder is exactly the tracked files",
      verdict(not base["provenance"]["mismatches"] and len(base["generated_check"].splitlines()) >= 4 and all(l.endswith("is current") for l in base["generated_check"].splitlines())
              and (not (raw and rr) or rr["baseline"] == raw["baseline"])),
      {"baseline": base["baseline"], "files_checked": base["provenance"]["files_checked"], "generated_check": base["generated_check"].splitlines(),
       "shipped_files_sha256": base["shipped_files"]}, STATIC)
manifest = base.get("shipped_manifest") or {}
other_keys = sorted(set(manifest) - {"manifest_version", "name", "version", "description", "icons", "action", "background", "permissions"})
check("permissions", "the shipped manifest (hash-equal to the loaded copy) asks only activeTab + scripting; no content scripts, host permissions, web-accessible resources or external messaging",
      verdict(manifest.get("permissions") == ["activeTab", "scripting"] and not other_keys), {"permissions": manifest.get("permissions"), "other_keys": other_keys}, STATIC)
if raw:  # the component pass ran in this raw dir
    bb = F.get("blankBadge") or {}
    check("non_web_page", "on a non-web page (about:blank) the action does not start and the button says it cannot run",
          verdict(bb.get("badge") == "!" and "cannot run" in bb.get("title", "")),
          {**bb, "refusal_path": "the browser refused scripting (the product's own http(s) check did not decide: tab.url was not exposed)"
           if "Cannot access contents" in bb.get("title", "") else "the product's http(s) check"}, STATIC)

    for label, values, before, capture_before, after in (("owned", F, "beforeStart", "captureBeforeAction", "afterStart"), ("public", P, "pubBefore", "pubCaptureBefore", "pubAfterStart")):
        b, a = values.get(before) or {}, values.get(after) or {}
        check(f"{label}.no_access_before_action", "before the action the page has no companion and the extension cannot capture (activeTab not granted)",
              verdict(before in values and b.get("probe") is False and b.get("panel") is False and str(values.get(capture_before, "")).startswith("refused")),
              {"hosts": b, "capture_attempt": values.get(capture_before)}, STATIC)
        check(f"{label}.started_in_place", "the action starts the companion on the same page and address (no import, no other page)",
              verdict(a.get("probe") is True and a.get("panel") is True and bool(b.get("href")) and a.get("href") == b.get("href")), {"before": b.get("href"), "after": a.get("href")}, STATIC)

    received_states = [F.get("region"), P.get("pubFormula"), P.get("pubFigure"), P.get("pubAfterRestart")]
    check("labels.dependency_not_live", "the panel says it captures only on a mark, one snapshot per mark, not continuous, no AI/provider, and (as a UI statement) nothing sent or stored; "
          "every received image is labelled not live",
          verdict(all(LABEL in (s or {}).get("panelText", "") and START_HINT in (s or {}).get("panelText", "") for s in (F.get("s0"), P.get("pubS0")))
                  and all(LABEL in (s or {}).get("panelText", "") and "(not live)" in (s or {}).get("status", "") for s in received_states)),
          {"label": LABEL, "start_hint": START_HINT, "received_statuses": [(s or {}).get("status") for s in received_states],
           "note": "'nothing sent or stored' is the product's own statement; no network or storage observation was made"}, STATIC)

    check("owned.navigation", "in NAV the page's own link and wheel scrolling work and nothing is captured",
          verdict("logNav" in F and (F.get("afterLink") or {}).get("href", "").endswith("#part-2") and (F.get("afterWheel") or 0) > 0 and F["logNav"].get("total") == 0),
          {"after_link": F.get("afterLink"), "wheel_scrollY": F.get("afterWheel"), "captures": (F.get("logNav") or {}).get("total")}, STATIC, WRAPPER)
    pl = P.get("pubLink") or {}
    check("public.navigation", "on the public page in NAV, wheel scrolling and an in-page link work and nothing is captured",
          verdict("pubLogNav" in P and (P.get("pubAfterWheel") or 0) > 0 and bool(pl.get("href")) and (P.get("pubAfterLink") or {}).get("hash") == pl.get("href") and P["pubLogNav"].get("total") == 0),
          {"wheel_scrollY": P.get("pubAfterWheel"), "link": pl.get("href"), "after_link": P.get("pubAfterLink"), "captures": (P.get("pubLogNav") or {}).get("total")}, STATIC, WRAPPER)

    # ---- owned page: a real mark, its source and times ----------------------------------------------------
    rect = (F.get("geoRegion") or {}).get("rect")
    if rect:
        EXPECTED_ROWS = [round(rect["y"]), round(rect["y"] + rect["height"]) - 1]
    region, _ = examine(F, "region", "logRegion", save="f3-region", owned=True, shot=RAW / "shots-fixture" / "qa-f3-region.png")
    cases["f3_region"] = region
    dt = region.get("devtools_screenshot") or {}
    check("owned.region_real_pixels", "a pen mark on the figure: one capture; the product's hash and size are those of the exact bytes captureVisibleTab returned; the crop lies inside "
          "the marked figure, its recomputed pixels are the figure colour, and they equal a DevTools screenshot of the same rectangle",
          verdict(good_mark(region) and inside(region["crop"], rect) and close(region["recomputed"]["mean"], MAGENTA, 3) and dt.get("comparable") and dt.get("mean_abs_diff", 99) <= 2),
          region, timing_of(entries(F, "logRegion")), WRAPPER)
    last = (F.get("region") or {}).get("last") or {}
    page = last.get("page") or {}
    check("owned.source", "the product records the page it was marked on: origin + path and title equal the actual page",
          verdict(f"{page.get('origin')}{page.get('path')}" == (F.get("afterStart") or {}).get("href") and last.get("title") == "Linear Algebra · Lecture 7: Eigenvalues (synthetic course page)"),
          {"recorded": f"{page.get('origin')}{page.get('path')}", "title": last.get("title"), "actual_href": (F.get("afterStart") or {}).get("href")}, STATIC)
    w = region["wrapper"][0] if region["wrapper"] else {}
    t = region["times"]
    check("owned.times", "mark, request, capture (wrapper) and receipt times are in order, and the image is from after the mark",
          verdict(ordered(t["markedAt"], t["requestedAt"], w.get("calledAt"), w.get("capturedAt"), t["receivedAt"]) and isinstance(t["capturedAt"], str) and t["capturedAt"] >= w.get("capturedAt", "~")),
          {"product": t, "wrapper": {k: w.get(k) for k in ("calledAt", "captureStartedAt", "capturedAt", "returnedAt")}}, timing_of(entries(F, "logRegion")), WRAPPER)
    spa = F.get("afterSpa") or {}
    spa_last = spa.get("last") or {}
    check("owned.same_document_after_snapshot", "after a received snapshot, a same-document address change keeps it labelled old (not live) with the page it was marked on",
          verdict("?qa=spa" in (F.get("spaHref") or "") and spa_last.get("status") == "received" and "(not live)" in spa.get("status", "") and bool(page) and spa_last.get("page") == page),
          {"address_now": F.get("spaHref"), "status": spa.get("status"), "recorded_page": spa_last.get("page")}, STATIC)

    video, _ = examine(F, "video", "logVideo", owned=True)
    cases["f4_video"] = video
    vp = (F.get("video") or {}).get("panelText", "")
    media = video.get("media") or {}
    check("owned.video_labels", "a mark over the playing video: mark-time media is labelled as such and the position in the image is labelled unknown",
          verdict(good_mark(video) and media.get("paused") is False and (media.get("current_time") or 0) > 0 and "mark-time metadata" in vp and "Video in the image: position unknown" in vp),
          {"status": video["status"], "media_at_mark": media, "labels": [s for s in ("mark-time metadata", "Video in the image: position unknown") if s in vp]},
          timing_of(entries(F, "logVideo")), WRAPPER)

    # ---- owned page: lifecycle boundaries -----------------------------------------------------------------
    real, _ = examine(F, "realScroll", "logRealScroll", save="f5-real-scroll", owned=True)
    cases["f5_real_scroll"] = real
    rs = real.get("recomputed") or {}
    real_ok = real["wrapper_calls"] == 1 and real.get("hash_matches_product") and real["status"] == "received" and (
        ((real["geometry"] or {}).get("known") is False and real["crop"] is None and real["crop_shown"] is False) or (real["crop"] is not None and rs.get("target_share", 0) >= 0.9))
    check("owned.scroll_after_mark", "a scroll right after the mark: either the region is unknown with no crop, or a shown crop is the marked content",
          verdict(real_ok), {"geometry": real["geometry"], "crop": real["crop"], "recomputed_crop": rs or None, "target_rows_in_image": real.get("target_rows_in_image"),
                             "scrolled_to": F.get("realScrollY")}, timing_of(entries(F, "logRealScroll")), WRAPPER)
    aba, _ = examine(F, "scrollAba", "logScrollAba", save="f6-scroll-away-back", owned=True)
    cases["f6_scroll_away_and_back"] = aba
    guard_check("owned.scroll_away_and_back", "scroll away and back inside the capture window: the image shows the page scrolled, so the region must not be shown as the marked one",
                aba, timing_of(entries(F, "logScrollAba")), {"scrolled_to": F.get("abaScrolledTo"), "scrolled_back_to": F.get("abaScrolledBack")})
    shift, _ = examine(F, "contentShift", "logShift", save="f7-content-shift", owned=True)
    cases["f7_content_shift"] = shift
    guard_check("owned.content_shift_same_address", "content inserted above the mark (same address) inside the capture window moves the marked content in the image, "
                "so the region must not be shown as the marked one", shift, timing_of(entries(F, "logShift")), {"block_top_after_insert": (F.get("shifted") or {}).get("blockTop")})
    resized, _ = examine(F, "resized", "logResize", owned=True)
    cases["f8_resize"] = resized
    check("owned.resize_during_capture", "the viewport is resized inside the capture window: region unknown, no crop",
          verdict(resized["status"] == "received" and bool(resized.get("bytes")) and (resized["geometry"] or {}).get("known") is False and resized["crop"] is None and resized["crop_shown"] is False),
          {"geometry": resized["geometry"], "image": resized.get("bytes"), "resized_to": F.get("resizedTo")}, timing_of(entries(F, "logResize")),
          WRAPPER + "; DevTools Emulation.setDeviceMetricsOverride (not a window resize)")

    stable, aba_log, nav_log = F.get("bgStable") or {}, entries(F, "logBgAba"), entries(F, "logBgNav")
    be = aba_log[0] if len(aba_log) == 1 else {}
    check("owned.background_tab_a_b_a", "harness-issued capture request from tab A's top frame; A -> B -> A inside the capture window with B also granted: the browser captured tab B, "
          "A was visible again when the capture returned, and the real background refused (activation fence)",
          verdict(stable.get("ok") is True and (F.get("bgAba") or {}).get("ok") is False and "visible tab changed" in (F.get("bgAba") or {}).get("reason", "")
                  and be.get("ok") is True and be.get("activeAtCapture") == F.get("tabB") and be.get("activeAtReturn") == F.get("tabA")),
          {"stable_control": stable, "stable_control_timing": timing_of(entries(F, "logBgStable")), "a_b_a": F.get("bgAba"),
           "wrapper": {k: be.get(k) for k in ("activeAtCapture", "activeUrlAtCapture", "activeAtReturn", "captureStartedAt", "returnedAt")},
           "switched": {"started": F.get("bgAbaStarted"), "to_b": F.get("bgToB"), "back_to_a": F.get("bgBackToA")}, "tab_a": F.get("tabA"), "tab_b": F.get("tabB")},
          timing_of(aba_log), "harness-issued product capture message; " + WRAPPER)
    ne = nav_log[0] if len(nav_log) == 1 else {}
    check("owned.background_same_document_navigation", "harness-issued capture request; a same-document address change (pushState) inside the capture window: the real background refuses (update fence)",
          verdict((F.get("bgNav") or {}).get("ok") is False and "navigated or changed" in (F.get("bgNav") or {}).get("reason", "")),
          {"answer": F.get("bgNav"), "pushed": F.get("bgNavPushed"), "wrapper": {k: ne.get(k) for k in ("ok", "activeUrlAtCapture", "captureStartedAt", "returnedAt")}},
          timing_of(nav_log), "harness-issued product capture message; " + WRAPPER)
    tab, _ = examine(F, "tabAba", "logTabAba", owned=True)
    cases["f9_tab_a_b_a"] = tab
    tw = tab["wrapper"][0] if tab["wrapper"] else {}
    check("owned.product_tab_a_b_a", "a mark on tab A, then A -> B -> A inside the capture window (B granted): nothing is shown; the browser's image of tab B is discarded",
          verdict(tab["status"] == "failed" and tab["crop"] is None and tab["crop_shown"] is False and str(tw.get("activeUrlAtCapture", "")).endswith("qa=tab-b")),
          {"status": tab["status"], "guard": tab["reason"], "captured_tab": tw.get("activeUrlAtCapture"), "active_at_return": tw.get("activeAtReturn")},
          timing_of(entries(F, "logTabAba")), WRAPPER)
    an = F.get("afterNav") or {}
    check("owned.navigation_removes_companion", "the tab navigates to another address while a capture is in flight: the new page has no companion, no panel and no badge "
          "(the background's answer to the old request is not observable here)",
          verdict(an.get("probe") is False and an.get("panel") is False and "stateAfterNav" in F and F["stateAfterNav"] is None and F.get("badgeAfterNav") == ""),
          {"after": an, "state": F.get("stateAfterNav"), "badge": F.get("badgeAfterNav"), "wrapper": [{k: e.get(k) for k in ("ok", "activeUrlAtCapture", "captureStartedAt")} for e in entries(F, "logNav2")]},
          timing_of(entries(F, "logNav2")), WRAPPER)
    so = F.get("afterStopInFlight") or {}
    sw = (entries(F, "logStopInFlight") or [{}])[0]
    check("owned.stop_after_request", "Stop (the action again) after the capture request was sent: toolbar and panel removed, badge cleared, nothing shown",
          verdict(F.get("stopInFlight") == "ok" and so.get("panel") is False and so.get("probe") is False and "stateAfterStop" in F and F["stateAfterStop"] is None and F.get("badgeAfterStop") == ""),
          {"hosts": so, "state": F.get("stateAfterStop"), "badge": F.get("badgeAfterStop"), "request_sent_at": sw.get("calledAt"), "stop_pressed_at": F.get("stopPressedAt"),
           "real_capture_started_at": sw.get("captureStartedAt"),
           "note": "the request reached the background before Stop; with the stand-in, the real grab ran after Stop and its result was discarded (not shown). "
                   "Stop or timeout during the paint wait (B2/C1) is reviewer evidence, not run here."},
          timing_of(entries(F, "logStopInFlight")), WRAPPER)
    restart, _ = examine(F, "afterRestart", "logRestart", save="f11-restart", owned=True)
    cases["f11_restart"] = restart
    s4 = F.get("s4") or {}
    check("owned.restart_one_action", "after Stop, one action starts a fresh companion (no old record, nothing retired) and the next mark captures the real figure pixels",
          verdict(F.get("restarted") == "ok" and s4.get("running") is True and s4.get("captures") == 0 and s4.get("retired") == 0 and "last" in s4 and s4["last"] is None
                  and good_mark(restart) and close(restart["recomputed"]["mean"], MAGENTA, 3)),
          {"fresh": {k: s4.get(k) for k in ("running", "captures", "retired", "last")}, "status": restart["status"], "recomputed": restart.get("recomputed")},
          timing_of(entries(F, "logRestart")), WRAPPER)
    ps, s5 = F.get("afterPanelStop") or {}, F.get("s5") or {}
    check("owned.panel_stop", "the panel's Stop with a trusted mouse click stops it, clears the badge, and the next action starts afresh",
          verdict(ps.get("panel") is False and ps.get("probe") is False and "stateAfterPanelStop" in F and F["stateAfterPanelStop"] is None and F.get("badgeAfterPanelStop") == ""
                  and s5.get("running") is True and s5.get("captures") == 0),
          {"hosts": ps, "badge": F.get("badgeAfterPanelStop"), "restarted": s5.get("running")}, STATIC)
    pa = F.get("pageAfterStop") or {}
    check("owned.nothing_after_stop", "after the final Stop, pen input reaches the page (its own pointer listeners count it) and nothing is captured",
          verdict("logAfterStop" in F and F["logAfterStop"].get("entries") == [] and pa.get("hosts") is False and (pa.get("pointer") or {}).get("down", 0) >= 1 and (pa.get("pointer") or {}).get("up", 0) >= 1),
          {"new_captures": len(entries(F, "logAfterStop")), "page": pa}, STATIC, WRAPPER)

    # ---- public page -----------------------------------------------------------------------------------------
    for key, state_key, log_key, loop_key, shot, kind in (("formula", "pubFormula", "pubLogFormula", "pubFormulaLoop", "qa-p-formula.png", "formula"),
                                                           ("figure", "pubFigure", "pubLogFigure", "pubFigureLoop", "qa-p-figure.png", "figure"),
                                                           ("restart_formula", "pubAfterRestart", "pubLogRestart", "pubFormulaLoop2", "qa-p-restart.png", "formula")):
        rec, _ = examine(P, state_key, log_key, shot=RAW / "shots-public" / shot)
        el = (P.get(loop_key) or {}).get("el")
        cases[f"public_{key}"] = rec
        dt = rec.get("devtools_screenshot") or {}
        element_box = el and {"x": round(el["x"]), "y": round(el["y"]), "width": int(el["width"]), "height": int(el["height"])}
        tt, ww = rec["times"], (rec["wrapper"][0] if rec["wrapper"] else {})
        check(f"public.{key}", f"public page, a pen mark around a rendered {kind}: the product's hash and size are those of the exact captured bytes; the crop contains the {kind}'s box, "
              "its recomputed pixels match the product's statistics, are not blank, and equal a DevTools screenshot of the same rectangle; times are in order",
              verdict(good_mark(rec) and inside(element_box, rec["crop"], 2) and rec["recomputed"]["dark_share"] > 0.01 and dt.get("comparable") and dt.get("mean_abs_diff", 99) <= 2
                      and ordered(tt["markedAt"], tt["requestedAt"], ww.get("calledAt"), ww.get("capturedAt"), tt["receivedAt"])),
              {"element": el, **{k: rec.get(k) for k in ("status", "bytes", "hash_matches_product", "crop", "product_crop_mean", "product_dark_share", "recomputed", "devtools_screenshot", "times")}},
              timing_of(entries(P, log_key)), WRAPPER)
    plast = (P.get("pubFormula") or {}).get("last") or {}
    ppage = plast.get("page") or {}
    check("public.source", "public page: the product records origin + path and title equal to the actual page",
          verdict(f"{ppage.get('origin')}{ppage.get('path')}" == (P.get("pubPage") or {}).get("href") and plast.get("title") == (P.get("pubPage") or {}).get("title")),
          {"recorded": f"{ppage.get('origin')}{ppage.get('path')}", "title": plast.get("title"), "actual": P.get("pubPage")}, STATIC)
    pas, s1 = P.get("pubAfterStop") or {}, P.get("pubS1") or {}
    check("public.stop_restart", "public page: Stop removes toolbar and panel and clears the badge, the page still scrolls, and one action starts a fresh companion",
          verdict(pas.get("panel") is False and pas.get("probe") is False and P.get("pubBadgeAfterStop") == "" and (P.get("pubWheelAfterStop") or 0) > (pas.get("scrollY") or 0)
                  and s1.get("running") is True and s1.get("captures") == 0 and s1.get("retired") == 0 and "last" in s1 and s1["last"] is None),
          {"after_stop": pas, "badge": P.get("pubBadgeAfterStop"), "wheel_after_stop": P.get("pubWheelAfterStop"), "fresh": {k: s1.get(k) for k in ("running", "captures", "retired", "last")}}, STATIC)

else:  # repro-only: the owned layout reference comes from the repro run itself
    rect = ((rr or {}).get("repro", {}).get("values", {}).get("geoScrollAba") or {}).get("rect")
    if not rect:
        raise SystemExit("repro-only analysis needs the repro run's reference rect (geoScrollAba); refusing to guess")
    EXPECTED_ROWS = [round(rect["y"]), round(rect["y"] + rect["height"]) - 1]

# ---- repro run ---------------------------------------------------------------------------------------------
repro_meta = None
if rr:
    R = rr["repro"]["values"]
    repro_meta = {"baseline": rr["baseline"], "started_at": rr["started_at"], "finished_at": rr["finished_at"]}
    for cid, state_key, log_key, save, description in (
            ("repro.scroll_away_and_back", "scrollAba", "logScrollAba", "r1-scroll-away-back", "repeat of scroll away and back in a new fresh profile"),
            ("repro.content_shift_same_address", "contentShift", "logShift", "r2-content-shift", "repeat of inserted content in a new fresh profile"),
            ("repro.style_shift_same_address", "styleShift", "logStyle", "r3-style-shift", "a style change above the mark (no node or text change) moves the marked content inside the capture window")):
        rec, _ = examine(R, state_key, log_key, save=save, owned=True)
        cases[cid] = rec
        guard_check(cid, description + ": the region must not be shown as the marked one", rec, timing_of(entries(R, log_key)))
    series_check("repro.real_timing_scroll_away_and_back", "no injected delay: scroll away and back 0-40 ms after the mark; whenever the image shows the page scrolled, "
                 "the region must not be shown as the marked one", R, "rt", "rtLog", "r4-real-timing-scroll", ("rtAway", "rtBack"))
    n1, _ = examine(R, "n1", "logN1", save="n1-restart-during-flight", owned=True)
    cases["repro.stop_restart_in_flight"] = n1
    n1s = R.get("n1") or {}
    n1_log = entries(R, "logN1")
    n1_sha = [hashlib.sha256(png_bytes(e.get("dataUrl")) or b"").hexdigest() if e.get("ok") else None for e in n1_log]
    n1_shown = ((n1s.get("last") or {}).get("image") or {}).get("sha256")
    n1_new_shown = len(n1_log) == 2 and n1_shown == n1_sha[1] and n1_shown != n1_sha[0] and (n1s.get("last") or {}).get("receivedAt", "") >= n1_log[1].get("returnedAt", "~")
    check("repro.stop_restart_in_flight", "Stop and an immediate restart while the old watched capture is in flight (stand-in): the new companion shows the new capture (its "
          "exact bytes, received after that capture returned), never the old one, and its mark on a still page keeps the known region with the marked pixels",
          verdict(R.get("n1Stopped") == "ok" and R.get("n1Restarted") == "ok" and n1_new_shown and n1s.get("captures") == 1 and n1s.get("retired") == 0
                  and (n1["geometry"] or {}).get("known") is True and n1["crop"] is not None and (n1.get("recomputed") or {}).get("target_share", 0) >= 0.9 and n1["crop_shown"] is True),
          {"stop_at": R.get("n1StopAt"), "restarted_at": R.get("n1RestartedAt"), "calls": [{k: e.get(k) for k in ("calledAt", "captureStartedAt", "returnedAt")} for e in n1_log],
           "call_sha256": n1_sha, "shown_sha256": n1_shown, "shown_is_new_capture": n1_new_shown,
           "new_companion": {k: n1s.get(k) for k in ("captures", "retired")}, "geometry": n1["geometry"], "recomputed_crop": n1.get("recomputed")},
          timing_of(entries(R, "logN1")), WRAPPER)
    green = (R.get("loopShadow") or {}).get("green")
    green_rows = [round(green["y"]), round(green["y"] + green["height"]) - 1] if green else [0, 0]
    shadow, _ = examine(R, "shadowShift", "logShadow", save="n2-shadow-shift", owned=True, color=GREEN, expected=green_rows)
    cases["repro.shadow_internal_shift"] = shadow
    guard_check("repro.shadow_internal_shift", "a page-owned open shadow root shifts its content inside a host that keeps its box, inside the capture window: the region "
                "must not be shown as the marked one (a light-DOM move gives region unknown, no crop)", shadow, timing_of(entries(R, "logShadow")), {"host": R.get("shadowHost"), "green_at_mark": green})
    still_green = (R.get("loopShadowStill") or {}).get("green")
    still_rows = [round(still_green["y"]), round(still_green["y"] + still_green["height"]) - 1] if still_green else [0, 0]
    still, _ = examine(R, "shadowStill", "logShadowStill", save="n2-shadow-still-control", owned=True, color=GREEN, expected=still_rows)
    cases["repro.shadow_still_control"] = still
    check("repro.shadow_still_control", "positive control: a mark inside the same shadow component with nothing moving keeps the known region and a crop of the marked "
          "(green) pixels, so a fix cannot pass by making every shadow mark unknown",
          verdict(still["wrapper_calls"] == 1 and still.get("hash_matches_product") and (still["geometry"] or {}).get("known") is True and still["crop"] is not None
                  and (still.get("recomputed") or {}).get("target_share", 0) >= 0.9 and not displaced(still)),
          {"geometry": still["geometry"], "crop": still["crop"], "recomputed_crop": still.get("recomputed"), "target_rows_in_image": still.get("target_rows_in_image")},
          timing_of(entries(R, "logShadowStill")), WRAPPER)
    swap, _ = examine(R, "inPlaceSwap", "logSwap", save="n3-in-place-swap", owned=True)
    cases["repro.in_place_swap"] = swap
    swap_note = any("rather than what was marked" in n for n in (swap["notes"] or []))
    swap_ran = close((swap.get("recomputed") or {}).get("mean"), GREEN, 6)
    check("repro.in_place_swap", "the marked element changes in place (same element and box) inside the capture window and the change is in the image: the region stays "
          "where it was marked, and the shown crop carries the note that it may show the change rather than what was marked",
          verdict(swap["status"] == "received" and swap.get("hash_matches_product") and swap["crop"] is not None and swap_ran and inside(swap["crop"], rect) and swap_note),
          {"geometry": swap["geometry"], "crop": swap["crop"], "notes": swap["notes"], "recomputed_crop": swap.get("recomputed"), "change_in_image": swap_ran,
           "target_rows_in_image": swap.get("target_rows_in_image")}, timing_of(entries(R, "logSwap")), WRAPPER)
    series_check("repro.real_timing_shadow_shift", "no injected delay: the shadow-internal shift 0-30 ms after the mark; whenever the image shows the block moved, "
                 "the region must not be shown as the marked one", R, "ns", "nsLog", "n2-real-timing-shadow-shift", ("nsShift",),
                 color=GREEN, expected_of=lambda i: [round((R.get(f"nsLoop{i}") or {}).get("green", {}).get("y", 0)),
                                                      round((R.get(f"nsLoop{i}") or {}).get("green", {}).get("y", 0) + (R.get(f"nsLoop{i}") or {}).get("green", {}).get("height", 0)) - 1])
    ORANGE = (239, 108, 0)  # the fixture's closed component block
    def closed_rows(key):
        blk = (R.get(key) or {}).get("block")
        return [round(blk["y"]), round(blk["y"] + blk["height"]) - 1] if blk else [0, 0]
    closed_note = lambda rec: any("closed shadow root" in n for n in (rec["notes"] or []))
    cshift, _ = examine(R, "closedShift", "logClosedShift", save="n4-closed-shift", owned=True, color=ORANGE, expected=closed_rows("loopClosedShift"))
    cases["repro.closed_internal_shift"] = cshift
    guard_check("repro.closed_internal_shift", "the fixture's closed component moves its block inside the capture window (Edge, chrome.dom available): the region must not be "
                "shown as the marked one", cshift, timing_of(entries(R, "logClosedShift")))
    cstill, _ = examine(R, "closedStill", "logClosedStill", save="n4-closed-still", owned=True, color=ORANGE, expected=closed_rows("loopClosedStill"))
    cases["repro.closed_still_control"] = cstill
    check("repro.closed_still_control", "positive control: a still mark inside the closed component (chrome.dom available) keeps a known region with the orange block's pixels",
          verdict(cstill["wrapper_calls"] == 1 and cstill.get("hash_matches_product") and (cstill["geometry"] or {}).get("known") is True and cstill["crop"] is not None
                  and (cstill.get("recomputed") or {}).get("target_share", 0) >= 0.9 and not closed_note(cstill)),
          {"geometry": cstill["geometry"], "recomputed_crop": cstill.get("recomputed"), "notes": cstill["notes"]}, timing_of(entries(R, "logClosedStill")), WRAPPER)
    nstill, _ = examine(R, "noDomStill", "logNoDomStill", save="n5-nodom-still", owned=True, color=ORANGE, expected=closed_rows("loopNoDomStill"))
    cases["repro.nodom_closed_disclosed"] = nstill
    check("repro.nodom_closed_disclosed", "with chrome.dom removed in the extension's isolated world (harness control; whether Safari provides chrome.dom is unverified): a still mark on the closed component discloses it "
          "('closed shadow root ... cannot be watched') and its crop is the marked block",
          verdict(R.get("noDom") == "undefined" and nstill["wrapper_calls"] == 1 and nstill.get("hash_matches_product") and closed_note(nstill)
                  and (nstill.get("recomputed") or {}).get("target_share", 0) >= 0.9),
          {"no_dom": R.get("noDom"), "notes": nstill["notes"], "recomputed_crop": nstill.get("recomputed")}, timing_of(entries(R, "logNoDomStill")),
          WRAPPER + "; chrome.dom removed in the isolated world (harness control)")
    nshift, _ = examine(R, "noDomShift", "logNoDomShift", save="n5-nodom-shift", owned=True, color=ORANGE, expected=closed_rows("loopNoDomShift"))
    cases["repro.nodom_closed_shift"] = nshift
    n_out = guard_outcome(nshift)
    def limit_status(out, rec):
        if out == "not_exercised":
            return "not_exercised"
        if out == "kept unknown or refused":
            return "pass"
        return "limit_disclosed" if out == "wrong region shown as marked" and closed_note(rec) else "fail"
    n_status = limit_status(n_out, nshift)
    check("repro.nodom_closed_shift", "with chrome.dom removed (harness control): a move inside the fixture's closed component (stand-in). pass = kept unknown; limit_disclosed = "
          "the move was NOT detected and a mismatched crop is shown as known, disclosed only by the static closed-component note (the accepted limit); fail = shown silently", n_status,
          {"outcome": n_out, "status": nshift["status"], "geometry": nshift["geometry"], "crop": nshift["crop"], "notes": nshift["notes"],
           "recomputed_crop": nshift.get("recomputed"), "target_rows_in_image": nshift.get("target_rows_in_image"), "adjust_box": R.get("noDomAdjust"),
           "mode_after_mark": (R.get("noDomShift") or {}).get("mode")},
          timing_of(entries(R, "logNoDomShift")), WRAPPER + "; chrome.dom removed in the isolated world (harness control)")
    BLUE, PURPLE = (21, 101, 192), (123, 31, 162)
    check("repro.chrome_dom_probe", "records what the browser provides in the extension's isolated world before the closed-root cases (informational)",
          verdict(isinstance(R.get("chromeDomProbe"), dict)), {"probe": R.get("chromeDomProbe")}, STATIC, "worker executeScript in the isolated world")
    light, _ = examine(R, "lightCard", "logLightCard", save="n6-light-dom-custom-element", owned=True, color=BLUE, expected=closed_rows("loopLight"))
    cases["repro.light_dom_custom_element"] = light
    check("repro.light_dom_custom_element", "a defined light-DOM custom element with readable text (no shadow root) under a still mark: the crop is its pixels and it is NOT "
          "described as a closed component",
          verdict(R.get("lightCardHost") is True and light["wrapper_calls"] == 1 and light.get("hash_matches_product") and (light.get("recomputed") or {}).get("target_share", 0) >= 0.9
                  and not closed_note(light)),
          {"notes": light["notes"], "recomputed_crop": light.get("recomputed"), "selected_text": ((R.get("lightCard") or {}).get("last") or {}).get("selectedText")},
          timing_of(entries(R, "logLightCard")), WRAPPER)
    div_a, _ = examine(R, "closedDivShift", "logClosedDivShift", save="n7a-closed-div-shift", owned=True, color=PURPLE, expected=closed_rows("loopClosedDiv"))
    cases["repro.closed_div_shift"] = div_a
    guard_check("repro.closed_div_shift", "a page-owned closed shadow root on a plain div moves its block inside the capture window (chrome.dom as the browser provides it): the "
                "region must not be shown as the marked one", div_a, timing_of(entries(R, "logClosedDivShift")))
    div_b, _ = examine(R, "noDomDivShift", "logNoDomDivShift", save="n7b-nodom-closed-div-shift", owned=True, color=PURPLE, expected=closed_rows("loopNoDomDiv"))
    cases["repro.nodom_closed_div_shift"] = div_b
    check("repro.nodom_closed_div_shift", "with chrome.dom removed (harness control): the plain-div closed root moves its block (stand-in). pass = kept unknown; limit_disclosed = "
          "undetected but disclosed by the closed-component note; fail = a mismatched crop shown as known with no disclosure at all", limit_status(guard_outcome(div_b), div_b),
          {"outcome": guard_outcome(div_b), "geometry": div_b["geometry"], "crop": div_b["crop"], "notes": div_b["notes"], "recomputed_crop": div_b.get("recomputed"),
           "target_rows_in_image": div_b.get("target_rows_in_image"), "target_rows_unmoved": div_b.get("target_rows_unmoved"), "page_updates_seen": div_b["page_updates"]},
          timing_of(entries(R, "logNoDomDivShift")), WRAPPER + "; chrome.dom removed in the isolated world (harness control)")
    series_check("repro.real_timing_style_shift", "no injected delay: a style change above the mark 0-30 ms after it; whenever the image shows the content moved, "
                 "the region must not be shown as the marked one", R, "rs", "rsLog", "r5-real-timing-style-shift", ("rsShift",))

def chain_ok(values):
    """Every wrapper read is present and the reads chain (nothing lost between reads)."""
    total, ok, reads = 0, True, 0
    for key, v in values.items():
        if isinstance(v, dict) and ("entries" in v or v.get("lost")) and ("total" in v or v.get("lost")):
            reads += 1
            ok = ok and not v.get("lost") and v.get("total") == total + len(v.get("entries", []))
            total = v.get("total", total)
    return ok and reads > 0, reads


chains = {**({"fixture": chain_ok(F), "public": chain_ok(P)} if raw else {}), **({"repro": chain_ok(rr["repro"]["values"])} if rr else {})}
check("wrapper_logs_intact", "every capture-wrapper read in every run is present and the reads chain, so zero-capture results are not vacuous",
      verdict(all(ok for ok, _ in chains.values())), {name: {"intact": ok, "reads": n} for name, (ok, n) in chains.items()}, STATIC, WRAPPER)

failed = [c["id"] for c in checks if c["status"] == "fail"]
not_exercised = [c["id"] for c in checks if c["status"] == "not_exercised"]
limit_disclosed = [c["id"] for c in checks if c["status"] == "limit_disclosed"]
summary = {
    "kind": "qa-original-page-component-summary/v3", "baseline": base["baseline"], "browser": (F or (rr or {}).get("repro", {}).get("values", {})).get("userAgent"), "port": base["port"],
    "public_page": raw and {"url": raw["public_url"], "title": (P.get("pubPage") or {}).get("title")}, "pass_run": raw and {"started_at": raw["started_at"], "finished_at": raw["finished_at"]},
    "repro_run": repro_meta, "harness_sha256": harness,
    "scope": ("Component check only: the shipped WebExtension folder, unchanged, in fresh-profile headless Edge on Windows (driven from WSL). Invocation by DevTools "
              "Extensions.triggerAction on the page's tab (the extension's own action and activeTab grant; not a human click). CDP mouse/pen input, not Pencil. "
              "Page changes in lifecycle cases are harness-issued (window.scrollBy, DOM/style edits, pushState), not human gestures. "
              "Not Safari, iPad, AI, continuous whole-display observation, editable ink, or either core gate."),
    "instrumentation": ("chrome.tabs.captureVisibleTab wrapped in the worker: pass-through that records the call, the active tab at capture and at return, and the returned "
                        "PNG; stand-in cases also wait before and after the real capture. Companion state read through the worker (isolated world). Evidence *-capture.png "
                        "files are the exact returned bytes; *-crop.png files are re-encoded crops of those pixels."),
    "summary": {"total": len(checks), "passed": len(checks) - len(failed) - len(not_exercised) - len(limit_disclosed), "failed": failed, "not_exercised": not_exercised,
                "limit_disclosed": limit_disclosed},
    "checks": checks, "cases": cases,
}
text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
if re.search(r"[A-Za-z]:\\\\Users\\\\|/mnt/c/Users/|AppData|data:image", text):
    raise SystemExit("refusing to write summary.json: it contains a local profile path or image data")
(EVIDENCE / "summary.json").write_text(text)
print(json.dumps(summary["summary"], indent=1))
