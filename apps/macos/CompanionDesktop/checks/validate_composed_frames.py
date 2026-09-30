#!/usr/bin/env python3
"""Validate the Swift-made composed-image fixture session.

    python apps/macos/CompanionDesktop/checks/validate_composed_frames.py COMPOSED_FIXTURE_DIR

The fixture comes from `swift test` with COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR set to a new
directory: the single session of
InkCompositionTests.testComposedImagesDrawTheInkCommittedWhenThePixelsWereOnScreen. Standard
library only.

Checks, on the session's own files, read with Python's exact integers:
- the session records the app-excluded capture scope;
- every kept raw original matches its record (SHA-256, length, PNG signature, IHDR size) and, once
  decoded, holds no ink-coloured pixel;
- every kept frame has exactly one composition outcome, `composed` or `not_composed`, before the
  `ended` event; outcomes name only kept frames; later requests are only `composition_request_ignored`;
- every composed record names its raw original exactly; without strokes it is that raw original
  itself; with strokes its PNG matches its record, has the raw size and is composed/NNNNNNNN.png;
  composed/ holds exactly those files;
- the ink pairing: time basis against the kept frame's times, document and revision together,
  stroke IDs, limits; in the saved user document (<session>/ink/ink.json) the record's revision is
  the one in force at the pixels' time, and replaying it gives exactly the record's strokes (also
  when there are none) and its commit time where one is given, never later than the pixels;
- decoded pixels: every stroke's centre line, mapped by frame size / display size and sampled at
  most 1 px apart, is ink in the composed image and not in the raw one; every ink-coloured pixel
  lies on a recorded stroke; every pixel away from the strokes equals the raw one (so a flip, a
  wrong scale, a gap in a stroke, another background or a wrong revision is caught); images with
  the same strokes are equal, and with different strokes differ;
- status.json counts and composed bytes match the outcomes.

Negative controls change one fact each in memory and must be reported. All inputs are synthetic
fixtures: no ScreenCaptureKit, display, overlay, pen, network or provider evidence.
"""

import copy
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib
from collections import Counter

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
APP_EXCLUDED_PREFIX = ("whole display, SCContentFilter(display:excludingApplications: [this app], exceptingWindows: []); "
                       "every window of this app (main window, ink overlay, palette, menu bar item, menus and alerts) is excluded")
NOT_COMPOSED_REASONS = {"refused", "raw_unavailable", "render_failed", "write_failed", "composed_cap_reached",
                        "composed_store_stopped", "session_ended_before_composition"}


def png_size(data):
    if data[:8] != PNG_SIGNATURE or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def decode_png(data):
    """RGBA rows of an 8-bit, non-interlaced RGB or RGBA PNG."""
    if data[:8] != PNG_SIGNATURE:
        raise ValueError("not a PNG")
    position, idat, header = 8, b"", None
    while position < len(data):
        length, kind = struct.unpack(">I4s", data[position:position + 8])
        body = data[position + 8:position + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
        position += 12 + length
    width, height, depth, colour, _, _, interlace = header
    if depth != 8 or colour not in (2, 6) or interlace != 0:
        raise ValueError(f"unsupported PNG (depth {depth}, colour type {colour}, interlace {interlace})")
    channels = 4 if colour == 6 else 3
    stride = width * channels
    raw = zlib.decompress(idat)
    rows, previous = [], bytearray(stride)
    for y in range(height):
        kind = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            corner = previous[i - channels] if i >= channels else 0
            if kind == 1:
                line[i] = (line[i] + left) & 0xFF
            elif kind == 2:
                line[i] = (line[i] + up) & 0xFF
            elif kind == 3:
                line[i] = (line[i] + (left + up) // 2) & 0xFF
            elif kind == 4:
                p = left + up - corner
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - corner)
                line[i] = (line[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else corner)) & 0xFF
            elif kind != 0:
                raise ValueError(f"unknown filter {kind}")
        rows.append(bytes(line) if channels == 4 else bytes(b for x in range(width) for b in (*line[x * 3:x * 3 + 3], 255)))
        previous = line
    return width, height, rows


def is_ink(pixel):
    """Opaque ink colour: sRGB (255, 59, 48) drawn over an opaque frame keeps alpha 255."""
    return pixel[0] > 240 and pixel[1] < 80 and pixel[2] < 70 and pixel[3] > 250


def pixels(rows):
    for row in rows:
        for x in range(0, len(row), 4):
            yield row[x:x + 4]


CONTENT_KINDS = {"stroke", "erase", "undo", "redo"}


def replay(document, revision, pixels_host):
    """For a user document: the revision in force at `pixels_host` (counting operations since the
    last reopening before it, as the app does), the visible stroke IDs at `revision`, and that
    revision's commit time in the same scope (None when not in it)."""
    operations = document["operations"]
    shown = set()
    for operation in operations:
        if operation["kind"] in CONTENT_KINDS and operation["revision"] <= revision:
            shown -= set(operation["removed"])
            shown |= set(operation["added"])
    reopened = [i for i, o in enumerate(operations) if o["kind"] == "reopened" and o["host"] <= pixels_host]
    scoped = operations[reopened[-1] if reopened else 0:]
    before = [o for o in scoped if o["host"] <= pixels_host]
    in_force = before[-1]["revision"] if before else 0
    hosts = [o["host"] for o in scoped if o["kind"] in CONTENT_KINDS and o["revision"] == revision]
    return in_force, [s["id"] for s in document["strokes"] if s["id"] in shown], (hosts[-1] if hosts else None)


def segment_distance(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    t = 0 if length == 0 else max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / length))
    return ((px - a[0] - t * dx) ** 2 + (py - a[1] - t * dy) ** 2) ** 0.5


def stroke_problems(sequence, rows, raw_rows, strokes, sx, sy):
    """Recorded strokes against decoded pixels, in pixel coordinates (top row first)."""
    found = []
    height, width = len(rows), len(rows[0]) // 4
    mapped = [([(p["x"] * sx, p["y"] * sy) for p in stroke["points"]], stroke["width"] * max(sx, sy) / 2) for stroke in strokes]
    segments = [(pts[i], pts[min(i + 1, len(pts) - 1)], half) for pts, half in mapped for i in range(len(pts))]

    def pixel(source, column, row):
        return source[row][column * 4:column * 4 + 4]

    # The centre line, sampled at most 1 px apart, is ink here and not in the raw image.
    for a, b, _ in segments:
        steps = max(1, int(((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5))
        for step in range(steps + 1):
            x, y = a[0] + (b[0] - a[0]) * step / steps, a[1] + (b[1] - a[1]) * step / steps
            column, row = min(max(int(x), 0), width - 1), min(max(int(y), 0), height - 1)
            if not is_ink(pixel(rows, column, row)) or is_ink(pixel(raw_rows, column, row)):
                found.append(f"composed {sequence}: the stroke's centre line at pixel ({column}, {row}) is not drawn")
                return found
    # The stroke's width: every pixel whose centre is within half-width - 1 px of a stroke lies
    # wholly inside the drawn line (its farthest point is 0.71 px from its centre), so it is ink.
    # This catches a line drawn narrower than its recorded width.
    for a, b, half in segments:
        inner = half - 1
        if inner <= 0:
            continue
        for row in range(max(0, int(min(a[1], b[1]) - inner)), min(height, int(max(a[1], b[1]) + inner) + 1)):
            for column in range(max(0, int(min(a[0], b[0]) - inner)), min(width, int(max(a[0], b[0]) + inner) + 1)):
                if segment_distance(column + 0.5, row + 0.5, a, b) <= inner and not is_ink(pixel(rows, column, row)):
                    found.append(f"composed {sequence}: pixel ({column}, {row}), inside the stroke's recorded width, is not ink")
                    return found
    # Pixels near a stroke may be ink or blended; every other pixel is ink-free and equals the raw one.
    near = set()
    for a, b, half in segments:
        reach = half + 1.5
        for row in range(max(0, int(min(a[1], b[1]) - reach)), min(height, int(max(a[1], b[1]) + reach) + 1)):
            for column in range(max(0, int(min(a[0], b[0]) - reach)), min(width, int(max(a[0], b[0]) + reach) + 1)):
                if segment_distance(column + 0.5, row + 0.5, a, b) <= reach:
                    near.add((column, row))
    for row in range(height):
        if rows[row] == raw_rows[row]:
            continue
        for column in range(width):
            if (column, row) in near:
                continue
            if is_ink(pixel(rows, column, row)):
                found.append(f"composed {sequence}: ink at pixel ({column}, {row}) lies on no recorded stroke")
                return found
            if any(abs(c - r) > 2 for c, r in zip(pixel(rows, column, row), pixel(raw_rows, column, row))):
                found.append(f"composed {sequence}: pixel ({column}, {row}), away from the strokes, is not the raw pixel")
                return found
    return found


def problems(model):
    """Every inconsistency in a session model: status, events and files (path -> bytes)."""
    found = []
    status, events, files = model["status"], model["events"], model["files"]
    display = status["display"]["frame"]
    if not status["display"]["scope"].startswith(APP_EXCLUDED_PREFIX):
        found.append("the session does not record the app-excluded scope")
    kept = {e["frame"]["sequence"]: e["frame"] for e in events if e["event"] == "kept"}
    decoded = {}
    for sequence, frame in kept.items():
        data = files.get(frame["file"])
        if data is None or hashlib.sha256(data).hexdigest() != frame["sha256"] or len(data) != frame["byteLength"]:
            found.append(f"raw {sequence}: file missing or not its recorded SHA-256 and length")
            continue
        if png_size(data) != (frame["width"], frame["height"]):
            found.append(f"raw {sequence}: not a PNG of the recorded size")
            continue
        decoded[frame["file"]] = decode_png(data)
        if any(is_ink(p) for p in pixels(decoded[frame["file"]][2])):
            found.append(f"raw {sequence}: holds ink-coloured pixels")

    ended = [i for i, e in enumerate(events) if e["event"] == "ended"]
    if len(ended) != 1:
        found.append("the session has not exactly one ended event")
        ended = [len(events)]
    outcomes = {}
    for index, event in enumerate(events):
        if event["event"] == "composed":
            sequence = event["composed"]["rawSequence"]
        elif event["event"] == "not_composed":
            sequence = int(event["detail"]["sequence"])
            if event["detail"]["reason"] not in NOT_COMPOSED_REASONS or not event["detail"]["detail"].strip():
                found.append(f"frame {sequence}: unknown not_composed reason or empty detail")
        elif event["event"] == "composition_request_ignored":
            if int(event["detail"]["sequence"]) not in outcomes:
                found.append(f"frame {event['detail']['sequence']}: a request was ignored before any outcome")
            continue
        else:
            continue
        if sequence not in kept:
            found.append(f"frame {sequence}: an outcome for a frame that was not kept")
        if sequence in outcomes:
            found.append(f"frame {sequence}: more than one composition outcome")
        if index > ended[0]:
            found.append(f"frame {sequence}: an outcome after the ending")
        outcomes[sequence] = event
    for sequence in kept:
        if sequence not in outcomes:
            found.append(f"frame {sequence}: no composition outcome")

    composed = [e["composed"] for e in outcomes.values() if e["event"] == "composed"]
    images = {}
    for record in composed:
        sequence, ink = record["rawSequence"], record["ink"]
        frame = kept.get(sequence)
        if frame is None:
            continue
        if [record["rawFile"], record["rawSHA256"], record["rawByteLength"]] != [frame["file"], frame["sha256"], frame["byteLength"]]:
            found.append(f"composed {sequence}: does not name its raw original exactly")
        if not ink["strokes"]:
            if [record["file"], record["sha256"], record["byteLength"]] != [frame["file"], frame["sha256"], frame["byteLength"]]:
                found.append(f"composed {sequence}: no strokes, yet not the raw original itself")
        data = files.get(record["file"])
        expected_name = frame["file"] if not ink["strokes"] else f"composed/{sequence:08d}.png"
        if (record["file"] != expected_name or data is None
                or hashlib.sha256(data).hexdigest() != record["sha256"] or len(data) != record["byteLength"]):
            found.append(f"composed {sequence}: file missing, misnamed or not its recorded SHA-256 and length")
            continue
        if png_size(data) != (record["width"], record["height"]) or (record["width"], record["height"]) != (frame["width"], frame["height"]):
            found.append(f"composed {sequence}: not a PNG of the raw original's size")
            continue
        if ink["pixelsTime"] == "source_time":
            if frame.get("sourceHost") is None or ink["pixelsHost"] != frame["sourceHost"]:
                found.append(f"composed {sequence}: source-time pairing without that source time")
        elif ink["pixelsTime"] == "callback_admission":
            if frame.get("sourceHost") is not None or ink["pixelsHost"] != frame["callbackHost"]:
                found.append(f"composed {sequence}: callback pairing although a source time exists, or at another time")
        else:
            found.append(f"composed {sequence}: unknown pairing time basis")
        has_document = ink.get("document") is not None
        revision = ink.get("revision")
        if has_document != (isinstance(revision, int) and not isinstance(revision, bool) and revision >= 0):
            found.append(f"composed {sequence}: document and revision do not go together")
        if not has_document and ink["strokes"]:
            found.append(f"composed {sequence}: strokes without a document")
        if not all(isinstance(s, str) and s for s in ink["strokes"]) or len(set(ink["strokes"])) != len(ink["strokes"]):
            found.append(f"composed {sequence}: stroke IDs are not unique strings")
        if not ink["limits"] or not all(isinstance(s, str) and s.strip() for s in ink["limits"]):
            found.append(f"composed {sequence}: no stated limits")
        if ink.get("document"):
            # The user document the record names: the revision in force at the pixels' time,
            # replayed, must be exactly the record's, strokes included (also none).
            prefix = model["session"] + "/"
            document_bytes = files.get(ink["document"]["file"][len(prefix):]) if ink["document"]["file"].startswith(prefix) else None
            if document_bytes is None:
                found.append(f"composed {sequence}: its ink document {ink['document']['file']} is not in the session")
                continue
            document = json.loads(document_bytes)
            if not isinstance(revision, int) or not 0 <= revision <= document["revision"]:
                found.append(f"composed {sequence}: revision {revision} is not one the document had")
                continue
            in_force, visible, committed = replay(document, revision, ink["pixelsHost"])
            if revision != in_force:
                found.append(f"composed {sequence}: revision {revision}, but {in_force} was in force at the pixels' time")
            if visible != ink["strokes"]:
                found.append(f"composed {sequence}: revision {revision} of the document shows {visible}, not {ink['strokes']}")
                continue
            if ink.get("revisionHost") is not None and (ink["revisionHost"] != committed or ink["revisionHost"] > ink["pixelsHost"]):
                found.append(f"composed {sequence}: the revision's commit time is not the document's, or is after the pixels")
        if not ink["strokes"] or frame["file"] not in decoded or not ink.get("document"):
            continue
        width, height, rows = decode_png(data)
        strokes = [s for s in document["strokes"] if s["id"] in ink["strokes"]]
        found += stroke_problems(sequence, rows, decoded[frame["file"]][2], strokes,
                                 width / display["width"], height / display["height"])
        images[sequence] = (tuple(ink["strokes"]), ink["document"]["file"], rows)
    for first in images:
        for second in images:
            if first < second:
                same_ink = images[first][:2] == images[second][:2]
                differs = any(abs(a - b) > 2 for r1, r2 in zip(images[first][2], images[second][2]) for a, b in zip(r1, r2))
                if same_ink == differs:
                    found.append(f"composed {first} and {second}: " + ("same strokes, different pixels" if same_ink
                                                                         else "different strokes, same pixels"))
    listed = {name for name in files if name.startswith("composed/")}
    written = [record for record in composed if record["ink"]["strokes"]]
    if listed != {record["file"] for record in written}:
        found.append("composed/ does not hold exactly the recorded composed files")

    refused = Counter(e["detail"]["reason"] for e in outcomes.values() if e["event"] == "not_composed")
    if (status.get("composedFrames") != (len(composed) or None) or status.get("notComposed") != (dict(refused) or None)
            or status.get("composedBytes") != (sum(r["byteLength"] for r in written) or None)):
        found.append("status.json counts do not match the composition outcomes")
    return found


def load(session):
    lines = (session / "events.jsonl").read_bytes().split(b"\n")
    events = [json.loads(line.decode("utf-8")) for line in lines if line.strip()]
    files = {p.relative_to(session).as_posix(): p.read_bytes() for p in session.rglob("*") if p.is_file()}
    return {"session": session.name, "status": json.loads((session / "status.json").read_bytes().decode("utf-8")),
            "events": events, "files": files}


def encode_png(rows, width, height):
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (PNG_SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(b"\x00" + row for row in rows))) + chunk(b"IEND", b""))


def mutations(model):
    """One changed fact each; every one must be reported."""
    composed = [e for e in model["events"] if e["event"] == "composed"]
    empty = next(e for e in composed if not e["composed"]["ink"]["strokes"])
    inked = [e for e in composed if e["composed"]["ink"]["strokes"]]
    first = inked[0]
    other = next(e for e in inked if e["composed"]["ink"]["strokes"] != first["composed"]["ink"]["strokes"])
    ended = next(i for i, e in enumerate(model["events"]) if e["event"] == "ended")

    def changed(label, change):
        copied = copy.deepcopy(model)
        change(copied)
        return label, copied

    def find(copied, event):
        return next(e for e in copied["events"] if e == event)

    def rewrite(copied, name, transform):
        """Re-encodes a PNG with changed rows, keeping its records' hashes consistent."""
        width, height, rows = decode_png(copied["files"][name])
        data = encode_png(transform(rows, width), width, height)
        copied["files"][name] = data
        for event in copied["events"]:
            for record in [event.get("frame"), event.get("composed")]:
                if record and record.get("file") == name:
                    record["sha256"], record["byteLength"] = hashlib.sha256(data).hexdigest(), len(data)
                if record and record.get("rawFile") == name:
                    record["rawSHA256"], record["rawByteLength"] = hashlib.sha256(data).hexdigest(), len(data)
        if name.startswith("composed/"):
            copied["status"]["composedBytes"] = sum(len(v) for k, v in copied["files"].items() if k.startswith("composed/"))

    def m_raw_rows(copied):
        return decode_png(copied["files"][first["composed"]["rawFile"]])[2]

    def as_empty(copied):
        # A consistent empty-ink record pointing at the raw original, with the composed file gone.
        record = find(copied, first)["composed"]
        copied["files"].pop(record["file"])
        record["ink"]["strokes"] = []
        record.update(file=record["rawFile"], sha256=record["rawSHA256"], byteLength=record["rawByteLength"])
        copied["status"]["composedBytes"] = sum(len(v) for k, v in copied["files"].items() if k.startswith("composed/")) or None

    def collapse(copied):
        # Every inked image keeps only its ink on the stroke's centre row: a self-consistent 1 px line
        # where the recorded 3 pt at 2x needs 6 px.
        raw_rows = m_raw_rows(copied)
        for event in inked:
            def thin(rows, width):
                keep = {20}
                return [row if index in keep else raw_rows[index] for index, row in enumerate(rows)]
            rewrite(copied, event["composed"]["file"], thin)

    def transparent(rows, width):
        return [bytes(v if i % 4 != 3 or not is_ink(bytes([row[i - 3], row[i - 2], row[i - 1], 255])) else 0
                      for i, v in enumerate(row)) for row in rows]

    def ink_row(rows, width):
        rows = list(rows)
        rows[len(rows) // 2] = bytes([255, 59, 48, 255]) * width
        return rows

    return [
        changed("a composed record's SHA-256", lambda m: find(m, first)["composed"].update(sha256="0" * 64)),
        changed("a raw original's bytes", lambda m: m["files"].update({first["composed"]["rawFile"]: b"\x89PNG broken"})),
        changed("a missing outcome", lambda m: m["events"].remove(find(m, empty))),
        changed("a duplicated outcome", lambda m: m["events"].insert(ended, copy.deepcopy(first))),
        changed("an outcome after the ending", lambda m: m["events"].append(m["events"].pop(m["events"].index(find(m, empty))))),
        changed("a wrong raw reference", lambda m: find(m, first)["composed"].update(rawSHA256="f" * 64)),
        changed("a wrong time basis", lambda m: find(m, first)["composed"]["ink"].update(pixelsTime="callback_admission")),
        changed("a revision without a document", lambda m: find(m, first)["composed"]["ink"].update(document=None)),
        changed("strokes dropped from an inked image", lambda m: find(m, first)["composed"]["ink"].update(strokes=[])),
        changed("another revision's strokes", lambda m: find(m, first)["composed"]["ink"].update(
            strokes=list(other["composed"]["ink"]["strokes"]))),
        changed("an unrecorded file in composed/", lambda m: m["files"].update({"composed/stray.png": PNG_SIGNATURE})),
        changed("a wrong status count", lambda m: m["status"].update(composedFrames=(m["status"].get("composedFrames") or 0) + 1)),
        changed("wrong composed bytes", lambda m: m["status"].update(composedBytes=(m["status"].get("composedBytes") or 0) + 1)),
        changed("another scope", lambda m: m["status"]["display"].update(scope="whole display")),
        changed("an empty-ink image that is not the raw original",
                lambda m: find(m, empty)["composed"].update(file=first["composed"]["file"], sha256=first["composed"]["sha256"],
                                                            byteLength=first["composed"]["byteLength"])),
        changed("an inked image flipped upside down", lambda m: rewrite(m, first["composed"]["file"], lambda rows, width: rows[::-1])),
        changed("extra ink off the strokes", lambda m: rewrite(m, first["composed"]["file"], ink_row)),
        changed("ink in a raw original", lambda m: rewrite(m, first["composed"]["rawFile"], ink_row)),
        changed("a later revision with the same strokes", lambda m: find(m, first)["composed"]["ink"].update(
            revision=first["composed"]["ink"]["revision"] + 2, revisionHost=None)),
        changed("an inked frame recorded as empty ink", as_empty),
        changed("another background", lambda m: rewrite(m, first["composed"]["file"], lambda rows, width: [
            bytes(v if is_ink(row[i - i % 4:i - i % 4 + 4]) or i % 4 == 3 else min(255, v + 20) for i, v in enumerate(row))
            for row in rows])),
        changed("a gap in a stroke", lambda m: rewrite(m, first["composed"]["file"], lambda rows, width: [
            row[:90 * 4] + m_raw_rows(m)[index][90 * 4:110 * 4] + row[110 * 4:] for index, row in enumerate(rows)])),
        changed("strokes collapsed to 1 px wide in every inked image", collapse),
        changed("transparent ink", lambda m: rewrite(m, first["composed"]["file"], transparent)),
    ]


def main(directory):
    failures = []

    def check(condition, label):
        print(("PASS " if condition else "FAIL ") + label)
        if not condition:
            failures.append(label)

    sessions = [p for p in directory.iterdir()] if directory.is_dir() else []
    check(len(sessions) == 1 and sessions[0].is_dir(), "the fixture holds exactly one session directory")
    if failures:
        return 1
    try:
        model = load(sessions[0])
        found = problems(model)
        check(not found, "the Swift-made session is consistent" + ("" if not found else ": " + "; ".join(found)))
        composed = [e["composed"] for e in model["events"] if e["event"] == "composed"]
        refused = [e for e in model["events"] if e["event"] == "not_composed"]
        inked = {tuple(r["ink"]["strokes"]) for r in composed if r["ink"]["strokes"]}
        check(len(composed) >= 5 and any(not r["ink"]["strokes"] for r in composed) and len(inked) >= 2
              and len({r["ink"].get("revision") for r in composed}) >= 4
              and any(r["ink"]["pixelsTime"] == "callback_admission" for r in composed) and len(refused) >= 1,
              "the fixture is not vacuous (empty and two different inked images, several revisions, both time bases, a refusal)")
        for label, mutated in mutations(model):
            check(bool(problems(mutated)), f"negative control reported: {label}")
    except Exception as error:  # Reported, never a silent pass.
        check(False, f"the fixture could be checked: {type(error).__name__}: {error}")
    if failures:
        print(f"{len(failures)} composed fixture check(s) failed")
        return 1
    print("all composed fixture checks passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
