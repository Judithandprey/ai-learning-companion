"""Host-side checks for the QA-IOS-01 harness (Python standard library only).

Each check appends one JSON line {phase, check, status, detail} to --log. Status is PASS,
FAIL or NOT_RUN. `summary` turns the log into summary.json/summary.txt and exits 1 if any
check failed or none ran.
"""

import argparse
import base64
import hashlib
import json
import re
import struct
import sys
import zlib
from pathlib import Path

PAGE_ID = "fixture.practice.linear-equation"
MAIN_FILE = PAGE_ID + ".user_original.json"
PAGE_BODY = "Solve for x and show every step:\n\n    3x + 5 = 20\n\nThen check your answer by putting it back into the equation."
PAGE_TITLE = "Practice: solve a linear equation"
# Independent expectation of PracticePage.context, derived from the source string rules.
EXPECTED_PAGE = {
    "pageID": PAGE_ID,
    "pageVersion": 1,
    "title": PAGE_TITLE,
    "sourceKind": "owned_bundled_fixture",
    "contentSHA256": hashlib.sha256(f"{PAGE_ID}\n1\n{PAGE_TITLE}\n{PAGE_BODY}".encode()).hexdigest(),
    "pageWidth": 680,
    "pageHeight": 860,
}


def record(log, phase, check, status, detail=""):
    with open(log, "a", encoding="utf-8") as stream:
        stream.write(json.dumps({"phase": phase, "check": check, "status": status, "detail": detail}, ensure_ascii=False) + "\n")
    print(f"[{status}] {phase} {check}: {detail}")
    return status == "PASS"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def envelope_problems(path):
    """Reasons the file is not a version-1 user-original envelope for the practice page."""
    try:
        data = json.loads(Path(path).read_bytes())
    except (OSError, ValueError) as error:
        return [f"not readable JSON: {error}"]
    if not isinstance(data, dict):
        return [f"top-level JSON is {type(data).__name__}, not an object"]
    problems = []
    for key, expected in (("schemaVersion", 1), ("layer", "user_original"), ("authorship", "user")):
        if data.get(key) != expected:
            problems.append(f"{key}={data.get(key)!r}, expected {expected!r}")
    page = data.get("page")
    if not isinstance(page, dict):
        problems.append("page context missing")
    else:
        for key, expected in EXPECTED_PAGE.items():
            if page.get(key) != expected:
                problems.append(f"page.{key}={page.get(key)!r}, expected {expected!r}")
        extra = set(page) - set(EXPECTED_PAGE)
        if extra:
            problems.append(f"unexpected page fields {sorted(extra)}")
    try:
        if not base64.b64decode(data.get("drawing", ""), validate=True):
            problems.append("drawing data is empty")
    except (TypeError, ValueError):
        problems.append("drawing is not base64 data")
    if not isinstance(data.get("savedAt"), str):
        problems.append("savedAt missing")
    return problems


def side_files(directory, label):
    return sorted(Path(directory).glob(f"{PAGE_ID}.user_original.{label}-*.json"))


def png_rgba(path):
    """Decode an 8-bit, non-interlaced RGB or RGBA PNG into (width, height, rows of RGBA bytes)."""
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    offset, idat, header = 8, b"", None
    while offset < len(data):
        length, kind = struct.unpack(">I4s", data[offset:offset + 8])
        chunk = data[offset + 8:offset + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"IDAT":
            idat += chunk
        offset += 12 + length
    width, height, depth, color, _, _, interlace = header
    if depth != 8 or color not in (2, 6) or interlace:
        raise ValueError(f"unsupported PNG (depth {depth}, color type {color}, interlace {interlace})")
    channels = 4 if color == 6 else 3
    raw, stride, rows, previous = zlib.decompress(idat), width * channels, [], bytearray(width * channels)
    position = 0
    for _ in range(height):
        kind, line = raw[position], bytearray(raw[position + 1:position + 1 + stride])
        position += 1 + stride
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            corner = previous[i - channels] if i >= channels else 0
            if kind == 1:
                line[i] = (line[i] + left) & 255
            elif kind == 2:
                line[i] = (line[i] + up) & 255
            elif kind == 3:
                line[i] = (line[i] + (left + up) // 2) & 255
            elif kind == 4:
                p = left + up - corner
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - corner)
                line[i] = (line[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else corner)) & 255
        rows.append(bytes(line) if channels == 4 else bytes(b for j in range(0, stride, 3) for b in (*line[j:j + 3], 255)))
        previous = line
    return width, height, rows


def differing_fraction(a, b):
    wa, ha, ra = png_rgba(a)
    wb, hb, rb = png_rgba(b)
    if (wa, ha) != (wb, hb):
        return None, f"sizes differ: {wa}x{ha} vs {wb}x{hb}"
    differing = 0
    for row_a, row_b in zip(ra, rb):
        for i in range(0, len(row_a), 4):
            if abs(row_a[i] - row_b[i]) + abs(row_a[i + 1] - row_b[i + 1]) + abs(row_a[i + 2] - row_b[i + 2]) > 24:
                differing += 1
    return differing / (wa * ha), f"{wa}x{ha}"


def attachment(directory, name):
    """Find an exported attachment by name via xcresulttool's manifest.json."""
    directory = Path(directory)
    manifest = directory / "manifest.json"
    if not manifest.exists():
        return None
    # Exported names look like "<name>_<index>_<UUID>.png"; "p2-restored-probe" is not "p2-restored".
    pattern = re.compile(re.escape(name) + r"(_|\.|$)")
    for test in json.loads(manifest.read_text()):
        for item in test.get("attachments", []):
            if pattern.match(item.get("suggestedHumanReadableName", "")):
                return directory / item["exportedFileName"]
    return None


def pick_sim(listing, want_version, names):
    """Choose the iOS runtime and device type; report every deviation from the target."""
    data = json.loads(Path(listing).read_text())
    runtimes = [r for r in data.get("runtimes", []) if r.get("platform") == "iOS" and r.get("isAvailable")]
    if not runtimes:
        raise SystemExit("no available iOS simulator runtime")
    key = lambda r: tuple(int(p) for p in r["version"].split("."))
    exact = [r for r in runtimes if r["version"] == want_version]
    runtime = exact[0] if exact else max(runtimes, key=key)
    notes = [] if exact else [f"iOS {want_version} runtime not installed; using iOS {runtime['version']}"]
    supported = runtime.get("supportedDeviceTypes", [])
    device = next((d for name in names for d in supported if d.get("name") == name), None)
    if device is None:
        device = next(d for d in supported if d.get("productFamily") == "iPad")
        notes.append(f"none of {names} available; using {device['name']}")
    elif device["name"] != names[0]:
        notes.append(f"{names[0]} not available; using {device['name']}")
    return runtime, device, notes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--log", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, args in {
        "note": ["phase", "check", "status", "detail"],
        "sha": ["path"],
        "absent": ["phase", "path"],
        "envelope": ["phase", "path"],
        "same-sha": ["phase", "path", "expected"],
        "changed-sha": ["phase", "path", "previous"],
        "regular-file": ["phase", "path", "expected"],
        "side-file": ["phase", "directory", "label"],
        "no-side-files": ["phase", "directory"],
        "compare": ["phase", "check", "dir_a", "name_a", "dir_b", "name_b"],
        "pick-sim": ["listing", "want_version", "names"],
        "summary": ["out", "level"],
    }.items():
        command = sub.add_parser(name)
        for arg in args:
            command.add_argument(arg)
        if name == "compare":
            limit = command.add_mutually_exclusive_group(required=True)
            limit.add_argument("max", nargs="?", type=float, help="at most this differing fraction")
            limit.add_argument("--min", type=float, help="at least this differing fraction")
        if name == "side-file":
            command.add_argument("--expect-sha")
            command.add_argument("--envelope", action="store_true")
    a = parser.parse_args()
    try:
        run(a, a.log)
    except SystemExit:
        raise
    except Exception as error:  # a crash must become a visible FAIL row and a nonzero exit
        try:
            record(a.log, "harness", f"checker command {a.command}", "FAIL", f"{type(error).__name__}: {error}")
        finally:
            sys.exit(2)


def run(a, log):
    if a.command == "note":
        record(log, a.phase, a.check, a.status, a.detail)
    elif a.command == "sha":
        print(sha(a.path) if Path(a.path).exists() else "missing")
    elif a.command == "absent":
        record(log, a.phase, f"absent {Path(a.path).name}", "PASS" if not Path(a.path).exists() else "FAIL",
               "absent" if not Path(a.path).exists() else "exists")
    elif a.command == "envelope":
        problems = envelope_problems(a.path) if Path(a.path).exists() else ["file missing"]
        record(log, a.phase, "saved file is a version-1 user-original envelope for the practice page",
               "FAIL" if problems else "PASS", "; ".join(problems) or f"sha256 {sha(a.path)}")
    elif a.command == "same-sha":
        actual = sha(a.path) if Path(a.path).exists() else "missing"
        record(log, a.phase, f"{Path(a.path).name} bytes unchanged", "PASS" if actual == a.expected else "FAIL",
               f"expected {a.expected}, actual {actual}")
    elif a.command == "changed-sha":
        actual = sha(a.path) if Path(a.path).exists() else "missing"
        record(log, a.phase, f"{Path(a.path).name} rewritten by the new edits",
               "PASS" if actual not in (a.previous, "missing") else "FAIL", f"previous {a.previous}, now {actual}")
    elif a.command == "regular-file":
        path = Path(a.path)
        ok = path.is_file() and sha(path) == a.expected
        record(log, a.phase, f"{path.name} placeholder untouched", "PASS" if ok else "FAIL",
               f"is_file={path.is_file()}, sha256 {sha(path) if path.is_file() else '-'}")
    elif a.command == "side-file":
        found = side_files(a.directory, a.label)
        problems = [] if len(found) == 1 else [f"expected one {a.label} file, found {[f.name for f in found]}"]
        if len(found) == 1 and a.expect_sha and sha(found[0]) != a.expect_sha:
            problems.append(f"{found[0].name} sha256 {sha(found[0])}, expected {a.expect_sha}")
        if len(found) == 1 and a.envelope:
            problems += envelope_problems(found[0])
        record(log, a.phase, f"{a.label} side file kept", "FAIL" if problems else "PASS",
               "; ".join(problems) or found[0].name)
    elif a.command == "no-side-files":
        found = [f.name for f in Path(a.directory).glob(f"{PAGE_ID}.user_original.*-*.json")]
        record(log, a.phase, "no side files", "FAIL" if found else "PASS", ", ".join(found) or "none")
    elif a.command == "compare":
        # Missing or undecodable screenshots fail: this is the only visual evidence for the check.
        first, second = attachment(a.dir_a, a.name_a), attachment(a.dir_b, a.name_b)
        if first is None or second is None:
            record(log, a.phase, a.check, "FAIL", f"screenshot missing: {a.name_a}={first}, {a.name_b}={second}")
            return
        try:
            fraction, detail = differing_fraction(first, second)
        except (ValueError, OSError, zlib.error) as error:
            record(log, a.phase, a.check, "FAIL", f"screenshot not decodable: {error}")
            return
        if fraction is None:
            record(log, a.phase, a.check, "FAIL", detail)
            return
        ok = fraction >= a.min if a.min is not None else fraction <= a.max
        limit = f">= {a.min}" if a.min is not None else f"<= {a.max}"
        record(log, a.phase, a.check, "PASS" if ok else "FAIL", f"{detail}; differing fraction {fraction:.6f}; required {limit}")
    elif a.command == "pick-sim":
        runtime, device, notes = pick_sim(a.listing, a.want_version, a.names.split("|"))
        for note in notes:
            record(log, "setup", "simulator target", "NOT_RUN", note)
        print(f"{runtime['identifier']}\t{device['identifier']}\tiOS {runtime['version']} / {device['name']}")
    elif a.command == "summary":
        entries = [json.loads(line) for line in Path(log).read_text(encoding="utf-8").splitlines() if line.strip()]
        counts = {s: sum(e["status"] == s for e in entries) for s in ("PASS", "FAIL", "NOT_RUN")}
        out = Path(a.out)
        (out / "summary.json").write_text(json.dumps({"evidence_level": a.level, "counts": counts, "checks": entries},
                                                     ensure_ascii=False, indent=1) + "\n")
        lines = [f"QA-IOS-01 evidence level: {a.level}", f"PASS {counts['PASS']}  FAIL {counts['FAIL']}  NOT_RUN {counts['NOT_RUN']}", ""]
        lines += [f"{e['status']:7} {e['phase']:6} {e['check']} | {e['detail']}" for e in entries]
        (out / "summary.txt").write_text("\n".join(lines) + "\n")
        print("\n".join(lines))
        sys.exit(1 if counts["FAIL"] or not counts["PASS"] else 0)


if __name__ == "__main__":
    main()
