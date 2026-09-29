"""Linux-side checks of the QA-IOS-01 host checker (tests/e2e/ios/qa_ios_01/check.py).

The Simulator phases need macOS and Xcode; these tests only keep the host-side file, image and
simulator-selection logic honest.
"""

import base64
import importlib.util
import json
import struct
import subprocess
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("qa_ios_01_check", HERE / "qa_ios_01/check.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


def envelope(**changes):
    value = {"schemaVersion": 1, "layer": "user_original", "authorship": "user", "page": dict(check.EXPECTED_PAGE),
             "savedAt": "2026-09-29T06:00:00Z", "drawing": base64.b64encode(b"pk-drawing").decode()}
    value.update(changes)
    return value


def test_expected_page_hash_matches_the_swift_source_string():
    # PracticePage.body is an indented Swift multi-line literal; its content lines lose 12 spaces.
    assert check.EXPECTED_PAGE["contentSHA256"] == "bcc99615f5ba8330eeccd5ec760f7e77f1650a443860042cc97befa70938868f"


def test_envelope_accepts_the_user_original_file_and_names_each_problem(tmp_path):
    good = tmp_path / "good.json"
    good.write_text(json.dumps(envelope()))
    assert check.envelope_problems(good) == []
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(envelope(layer="ai_addition", page={**check.EXPECTED_PAGE, "pageVersion": 2}, drawing="")))
    problems = check.envelope_problems(bad)
    assert any("layer" in p for p in problems) and any("pageVersion" in p for p in problems)
    assert any("drawing" in p for p in problems)
    (tmp_path / "broken.json").write_text("{")
    assert check.envelope_problems(tmp_path / "broken.json")[0].startswith("not readable JSON")


def encode_png(width, height, pixel, filters=(0, 1, 2, 3, 4)):
    """RGBA PNG whose rows use each filter type in turn, to exercise the decoder."""
    raw, previous = b"", bytearray(width * 4)
    for y in range(height):
        line = bytearray(b for x in range(width) for b in pixel(x, y))
        kind, out = filters[y % len(filters)], bytearray(len(line))
        for i, value in enumerate(line):
            left = line[i - 4] if i >= 4 else 0
            up, corner = previous[i], previous[i - 4] if i >= 4 else 0
            p = left + up - corner
            paeth = left if abs(p - left) <= abs(p - up) and abs(p - left) <= abs(p - corner) else up if abs(p - up) <= abs(p - corner) else corner
            out[i] = (value - (0, left, up, (left + up) // 2, paeth)[kind]) & 255
        raw += bytes([kind]) + bytes(out)
        previous = line

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def test_png_decoder_and_difference_fraction(tmp_path):
    base = lambda x, y: (x * 7 % 256, y * 13 % 256, (x + y) % 256, 255)
    stroke = lambda x, y: (0, 0, 0, 255) if y == 5 and 2 <= x < 12 else base(x, y)
    (tmp_path / "a.png").write_bytes(encode_png(20, 10, base))
    (tmp_path / "b.png").write_bytes(encode_png(20, 10, stroke))
    width, height, rows = check.png_rgba(tmp_path / "a.png")
    assert (width, height) == (20, 10) and rows[3][4 * 5:4 * 5 + 4] == bytes(base(5, 3))
    assert check.differing_fraction(tmp_path / "a.png", tmp_path / "a.png")[0] == 0
    assert check.differing_fraction(tmp_path / "a.png", tmp_path / "b.png")[0] == 10 / 200


def test_pick_sim_prefers_the_target_and_reports_deviations(tmp_path):
    def runtime(version, names):
        return {"platform": "iOS", "isAvailable": True, "version": version, "identifier": f"rt-{version}",
                "supportedDeviceTypes": [{"name": n, "identifier": f"dt-{n}", "productFamily": "iPad" if "iPad" in n else "iPhone"} for n in names]}

    listing = tmp_path / "list.json"
    listing.write_text(json.dumps({"runtimes": [runtime("26.4", ["iPad Pro 13-inch (M5)"]),
                                                runtime("26.5", ["iPhone 17", "iPad Pro 13-inch (M5)"])]}))
    rt, dt, notes = check.pick_sim(listing, "26.5", ["iPad Pro 13-inch (M5)", "iPad Pro 13-inch (M4)"])
    assert (rt["version"], dt["name"], notes) == ("26.5", "iPad Pro 13-inch (M5)", [])
    listing.write_text(json.dumps({"runtimes": [runtime("26.6", ["iPhone 17", "iPad Air 11-inch (M3)"])]}))
    rt, dt, notes = check.pick_sim(listing, "26.5", ["iPad Pro 13-inch (M5)", "iPad Pro 13-inch (M4)"])
    assert rt["version"] == "26.6" and dt["name"] == "iPad Air 11-inch (M3)" and len(notes) == 2


def test_side_files_and_summary_exit_codes(tmp_path):
    log = tmp_path / "checks.jsonl"
    ink = tmp_path / "Ink"
    ink.mkdir()
    kept = ink / f"{check.PAGE_ID}.user_original.unreadable-1759123200-ab12cd34.json"
    kept.write_bytes(b"not ink {\n")
    run = lambda *args: subprocess.run([sys.executable, str(HERE / "qa_ios_01/check.py"), "--log", str(log), *args],
                                       capture_output=True, text=True)
    assert run("side-file", "5", str(ink), "unreadable", "--expect-sha", check.sha(kept)).returncode == 0
    assert run("summary", str(tmp_path), "test").returncode == 0
    run("side-file", "6", str(ink), "conflict")
    assert run("summary", str(tmp_path), "test").returncode == 1
    statuses = [json.loads(line)["status"] for line in log.read_text().splitlines()]
    assert statuses == ["PASS", "FAIL"]


def test_compare_limits_and_missing_screenshots_fail(tmp_path):
    base = lambda x, y: (255, 255, 255, 255)
    stroke = lambda x, y: (0, 0, 0, 255) if y == 5 else base(x, y)
    for phase, name, pixel in (("a", "empty", base), ("b", "drawn", stroke)):
        folder = tmp_path / phase
        folder.mkdir()
        (folder / "shot.png").write_bytes(encode_png(20, 10, pixel))
        (folder / "probe.png").write_bytes(encode_png(20, 10, lambda x, y: (9, 9, 9, 255)))
        (folder / "manifest.json").write_text(json.dumps([{"attachments": [
            {"suggestedHumanReadableName": f"{name}-probe_0_ABC.png", "exportedFileName": "probe.png"},
            {"suggestedHumanReadableName": f"{name}_1_DEF.png", "exportedFileName": "shot.png"}]}]))
    log = tmp_path / "checks.jsonl"
    run = lambda *args: subprocess.run([sys.executable, str(HERE / "qa_ios_01/check.py"), "--log", str(log), "compare", *args],
                                       capture_output=True, text=True)
    run("2", "same", str(tmp_path / "a"), "empty", str(tmp_path / "a"), "empty", "0.0002")
    run("2", "shows strokes", str(tmp_path / "a"), "empty", str(tmp_path / "b"), "drawn", "--min", "0.04")
    run("2", "blank is not drawn", str(tmp_path / "a"), "empty", str(tmp_path / "a"), "empty", "--min", "0.04")
    run("2", "missing", str(tmp_path / "a"), "empty", str(tmp_path / "b"), "absent", "0.0002")
    assert [json.loads(line)["status"] for line in log.read_text().splitlines()] == ["PASS", "PASS", "FAIL", "FAIL"]


def harness(tmp_path, script, log=None):
    """Run bash with the real lib.sh helpers; returns (exit code, recorded statuses)."""
    out = tmp_path / "out"
    out.mkdir(exist_ok=True)
    log = log or out / "checks.jsonl"
    env = {"HERE": str(HERE / "qa_ios_01"), "OUT": str(out), "LOG": str(log), "PATH": "/usr/bin:/bin"}
    prelude = f'PATH="{Path(sys.executable).parent}:$PATH"; set -uo pipefail; source "$HERE/lib.sh"\n'
    result = subprocess.run(["bash", "-c", prelude + script], env=env, capture_output=True, text=True)
    statuses = [json.loads(line)["status"] for line in log.read_text().splitlines()] if log.is_file() else None
    return result.returncode, statuses


def test_a_malformed_envelope_after_an_earlier_pass_makes_the_run_fail(tmp_path):
    # Lead's reproduction: valid JSON null used to crash the envelope check without a row.
    (tmp_path / "null.json").write_text("null")
    code, statuses = harness(tmp_path, f'check note setup install PASS ok\ncheck envelope 1b "{tmp_path}/null.json"\nfinish test')
    assert code == 1 and statuses == ["PASS", "FAIL"]


def test_a_checker_crash_inside_a_command_substitution_still_fails_the_run(tmp_path):
    (tmp_path / "a-directory").mkdir()
    code, statuses = harness(tmp_path, f'check note setup install PASS ok\nX=$(check same-sha 2 "{tmp_path}/a-directory" abc)\nfinish test')
    assert code == 1 and statuses == ["PASS", "FAIL", "FAIL"]  # the crash row plus the wrapper's row
    assert (tmp_path / "out/checker-error").exists()


def test_the_run_fails_even_when_recording_the_failure_fails(tmp_path):
    unwritable_log = tmp_path / "log-is-a-directory"
    unwritable_log.mkdir()
    code, _ = harness(tmp_path, 'CHECKER_ERROR_FILE=/nonexistent/checker-error\ncheck note setup install PASS ok\nfinish test', log=unwritable_log)
    assert code == 1


def test_a_clean_run_still_passes(tmp_path):
    (tmp_path / "saved.json").write_text(json.dumps(envelope()))
    code, statuses = harness(tmp_path, f'check note setup install PASS ok\ncheck envelope 1b "{tmp_path}/saved.json"\n'
                                       f'S=$(check sha "{tmp_path}/missing.json") || CHECKER_FAILED=1\n[[ $S == missing ]] || exit 9\nfinish test')
    assert code == 0 and statuses == ["PASS", "PASS"]
