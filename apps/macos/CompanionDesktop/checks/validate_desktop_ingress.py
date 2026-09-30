#!/usr/bin/env python3
"""Validate the Swift-made desktop ingress fixtures with the released 0.2.7/0.2.8 contracts.

    python apps/macos/CompanionDesktop/checks/validate_desktop_ingress.py INGRESS_FIXTURE_DIR

The fixtures come from `swift test` with COMPANION_DESKTOP_INGRESS_FIXTURE_DIR set to a new
directory: the DesktopCaptureTests.testPreparesRequestsAndWritesFixtures session, requests and
manifest. Run in the repository's pinned environment (jsonschema[format] with rfc3339-validator).

For each request:
- the strict 0.2.8 reader, validate_frame_batch with the trusted owner, and a semantic
  decode -> canonical -> decode round trip (byte equality with Python text is not required);
- for every frame, desktop_frame.validate_binding with its first naming record, the manifest's
  display source and the frame's original binding;
- the retained PNG's bytes against the artifact (SHA-256, length, signature, IHDR size);
- field by field against the native status.json/events.jsonl, read with Python's exact integers,
  so display ticks must equal the UInt64 text;
- every frameless record's gap kind is one the native events.jsonl/status.json actually retain,
  and the record carries the documented coverage for it;
- every record, framed or frameless, and the batch are bound to the manifest's plan: batch ID,
  delivery mode, record IDs, process sequences and frame IDs in order, the trusted display
  source's owner/source/version and device/session/stream;
- every frame keeps the mapper's promised nulls: capture UTC, media position, pixel orientation
  and all four timing fields, with pixels_transformed false.

Negative controls mutate one accepted request each and must be refused by the released contract.
Refusal cases are Swift's own outcomes: each must be a nonempty refusal reason containing its
expected fragment.

All inputs are synthetic fixtures: no network, service, provider or device evidence.
"""

import copy
import hashlib
import json
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from packages.contracts import desktop_capture_ingress as ingress  # noqa: E402
from packages.contracts import desktop_frame  # noqa: E402
from packages.contracts.display_source import validate as validate_display  # noqa: E402
from packages.contracts.original_artifact import validate as validate_original  # noqa: E402
from jsonschema import ValidationError  # noqa: E402

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
GAP_COVERAGE = {
    "no_callbacks": ("unknown", ["unknown"]), "missing": ("unknown", ["unknown"]),
    "blank": ("unobserved", ["unknown"]), "suspended": ("unobserved", ["unknown"]),
    "complete_without_image": ("unobserved", ["unknown"]),
    "retention_cap_reached": ("partial", ["sample_only"]), "keep_failed": ("partial", ["sample_only"]),
}
FRAMED_EVIDENCE = {"kind": "coverage", "coverage": "observed_samples", "from_clock_ms": None,
                   "through_clock_ms": None, "missing_sequences": [], "limitations": ["sample_only", "unsupported_history"]}


def gap_coverage(kind):
    if kind in GAP_COVERAGE:
        return GAP_COVERAGE[kind]
    if kind.startswith("not_retained_"):
        return ("partial", ["sample_only"])
    if kind.startswith("unknown_"):
        return ("unknown", ["unknown"])
    return None


def same(a, b):
    """Equal JSON values, without letting booleans pass for numbers."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return a == b


def refused(check):
    """True only for a contract refusal; any other exception is a failure of the check itself."""
    try:
        check()
    except ValidationError:
        return True
    return False


def native_session(directory):
    """status.json, kept frames by callback sequence, and the kinds of retained native gaps."""
    status = json.loads((directory / "status.json").read_bytes())
    kept, gap_kinds = {}, set()
    for line in (directory / "events.jsonl").read_bytes().splitlines():
        event = json.loads(line)
        if event["event"] == "kept":
            kept[event["frame"]["sequence"]] = event["frame"]
        elif event["event"] == "gap":
            gap_kinds.add(event["detail"]["kind"])
        elif event["event"] == "run" and (event["run"]["isGap"] or event["run"]["kind"].startswith("not_retained_")):
            gap_kinds.add(event["run"]["kind"])
    open_run = status.get("openRun")
    if open_run and (open_run["isGap"] or open_run["kind"].startswith("not_retained_")):
        gap_kinds.add(open_run["kind"])
    return status, kept, gap_kinds


def native_problems(frame, status, kept):
    """Differences between a desktop frame and the native records it was mapped from."""
    profile, facts, display = frame["profile"], kept["facts"], status["display"]
    clock, sample, start = profile["host_clock"], profile["sample"], profile["display_at_start"]
    ticks = facts.get("displayTimeTicks")
    pairs = {
        "callback_sequence": (frame["callback_sequence"], kept["sequence"]),
        "raw size": ([frame["raw_width"], frame["raw_height"]], [kept["width"], kept["height"]]),
        "artifact digest": ([frame["artifact"]["sha256"], frame["artifact"]["byte_length"]], [kept["sha256"], kept["byteLength"]]),
        "native session": (profile["native_session_id"], status["session"]),
        "pixel format": (profile["pixel_format"], kept["pixelFormat"]),
        "encoding": (profile["encoding"], kept["encoding"]),
        "wall anchor text": (clock["session_started_wall_utc"], status["startedWall"]),
        "session start": (clock["session_started_seconds"], status["startedHost"]),
        "callback time": (clock["callback_seconds"], kept["callbackHost"]),
        "display ticks": (clock["display_time_ticks_decimal"], None if ticks is None else str(ticks)),
        "display seconds": (clock["display_time_seconds"], facts.get("displayTimeSeconds")),
        "status": (sample["status"], facts["status"]),
        "PTS": (sample["presentation_time_seconds"], facts.get("presentationTime")),
        "content rect": (sample["content_rect"], facts.get("contentRect")),
        "content scale": (sample["content_scale"], facts.get("contentScale")),
        "scale factor": (sample["scale_factor"], facts.get("scaleFactor")),
        "dirty rects": (sample["dirty_rects"], facts.get("dirtyRects")),
        "display": ([start["display_id"], start["name"], start["frame_points"], start["point_pixel_scale"],
                     start["requested_width_pixels"], start["requested_height_pixels"], start["rotation_degrees"],
                     start["is_main"], start["scope"]],
                    [display["displayID"], display.get("name"), display["frame"], display["pointPixelScale"],
                     display["requestedWidth"], display["requestedHeight"], display["rotationDegrees"],
                     display["isMain"], display["scope"]]),
    }
    return [name for name, (mapped, native) in pairs.items() if not same(mapped, native)]


def png_problem(data, frame):
    if hashlib.sha256(data).hexdigest() != frame["artifact"]["sha256"] or len(data) != frame["artifact"]["byte_length"]:
        return "the retained PNG's bytes differ from the artifact reference"
    if not data.startswith(PNG_SIGNATURE) or data[12:16] != b"IHDR":
        return "the retained file is not a PNG"
    if list(struct.unpack(">II", data[16:24])) != [frame["raw_width"], frame["raw_height"]]:
        return "the PNG's IHDR size differs from raw_width/raw_height"
    return None


def date_time_format_checked():
    """True only when the impossible date is refused as a ValidationError; other errors propagate."""
    try:
        ingress.validate("UtcTimestamp", "2026-02-30T05:00:00Z")
    except ValidationError:
        return True
    return False


NULL_FRAME_FIELDS = ("captured_at", "media_position", "pixel_orientation")


def plan_problems(payload, case, source):
    """How the request differs from the plan the manifest records and the trusted display source."""
    batch, problems = payload["batch"], []
    expected_source = {name: source[name] for name in ("user_id", "source_id", "source_version")}
    if batch["batch_id"] != case["batch_id"] or batch["delivery_mode"] != case["delivery_mode"]:
        problems.append("batch ID or delivery mode")
    if any(batch[name] != source[name] for name in ("device_id", "session_id", "stream_id")):
        problems.append("batch incarnation")
    planned = [(r["record_id"], r["sequence"], r["frame_id"]) for r in case["records"]]
    if [(r["record_id"], r["sequence"], r["frame_id"]) for r in batch["records"]] != planned:
        problems.append("record IDs, process sequences or frame IDs")
    if any(not same(r["source"], expected_source) for r in batch["records"]):
        problems.append("a record's source")
    for frame in payload["frames"]:
        if not same(frame["source"], expected_source) or any(
                frame[name] != source[name] for name in ("device_id", "session_id", "stream_id")):
            problems.append(f"frame {frame['frame_id']} source or incarnation")
        if any(frame[name] is not None for name in NULL_FRAME_FIELDS) or frame["pixels_transformed"] is not False \
                or any(value is not None for value in frame["timing"].values()) or len(frame["timing"]) != 4:
            problems.append(f"frame {frame['frame_id']} promised nulls")
    return problems


def mutations(payload):
    """(name, mutated payload) pairs that the released contract must refuse."""
    records = payload["batch"]["records"]
    framed = next((i for i, r in enumerate(records) if r["frame_id"] is not None), None)
    frameless = next((i for i, r in enumerate(records) if r["frame_id"] is None), None)

    def change(edit):
        mutated = copy.deepcopy(payload)
        edit(mutated)
        return mutated

    cases = []
    if payload["frames"]:
        first = payload["frames"][0]
        ticks = first["profile"]["host_clock"]["display_time_ticks_decimal"]
        cases += [
            # A safe integer, so the refusal comes from the decimal-string rule, not the safe-integer guard.
            ("display ticks as a JSON number", change(lambda p: p["frames"][0]["profile"]["host_clock"].__setitem__(
                "display_time_ticks_decimal", int(ticks) if ticks is not None and int(ticks) < 2**53 else 1))),
            ("an invented capture UTC", change(lambda p: p["frames"][0].__setitem__("captured_at", "2026-09-21T14:13:21Z"))),
            ("an estimate without its basis", change(lambda p: p["frames"][0]["timing"].__setitem__(
                "observed_at_estimate", "2026-09-21T14:13:21Z"))),
            ("a pixel orientation", change(lambda p: p["frames"][0].__setitem__("pixel_orientation", 1))),
            ("a duplicated frame", change(lambda p: p["frames"].append(copy.deepcopy(first)))),
            ("a substituted artifact digest", change(lambda p: p["frames"][0]["artifact"].__setitem__("sha256", "0" * 64))),
        ]
    if framed is not None:
        cases.append(("an invented Process clock", change(lambda p: p["batch"]["records"][framed].__setitem__(
            "clock", {"domain_id": "invented", "elapsed_ms": 1, "uncertainty_ms": None}))))
    if frameless is not None:
        artifact = {"artifact_id": "invented", "sha256": "0" * 64, "byte_length": 1, "media_type": "image/png"}
        cases += [
            ("a frameless record claiming observed samples", change(lambda p: p["batch"]["records"][frameless]["evidence"].update(
                coverage="observed_samples", limitations=["sample_only"]))),
            ("a frameless record with an artifact", change(lambda p: p["batch"]["records"][frameless].__setitem__(
                "artifacts", [artifact]))),
            ("a frameless record with an invented Process clock", change(lambda p: p["batch"]["records"][frameless].__setitem__(
                "clock", {"domain_id": "invented", "elapsed_ms": 1, "uncertainty_ms": None}))),
        ]
    return cases


def main(directory):
    failures = []

    def check(condition, name):
        print(("PASS " if condition else "FAIL ") + name)
        if not condition:
            failures.append(name)

    if not date_time_format_checked():
        print("FAIL date-time format checking is not active; run in the repository's pinned environment")
        return 1
    manifest = json.loads((directory / "manifest.json").read_bytes())
    session_dir = directory / manifest["native_session"]
    status, kept, native_gaps = native_session(session_dir)
    user_id, source = manifest["user_id"], manifest["display_source"]
    validate_display(source)
    for binding in manifest["bindings"].values():
        validate_original("OriginalArtifactBinding", binding)
    counts = {"request": 0, "frameless_only": 0, "frames": set(), "refusal": 0, "mutations": 0}

    for case in manifest["cases"]:
        kind, name = case["type"], case["name"]
        try:
            if kind == "request":
                counts["request"] += 1
                body = (directory / case["body"]).read_bytes()
                payload = ingress.decode_request("DesktopFrameBatchRequest", body)
                ingress.validate_frame_batch(payload, user_id=user_id)
                canonical = ingress.canonical_request("DesktopFrameBatchRequest", payload)
                check(same(ingress.decode_request("DesktopFrameBatchRequest", canonical), payload),
                      f"request {name}: strict 0.2.8 reader and trusted owner accept it; decode -> canonical -> decode is equal")
                problems = plan_problems(payload, case, source)
                check(not problems, f"request {name}: every record and frame is bound to the plan, the trusted source and "
                                    f"incarnation, with the promised nulls{'' if not problems else ': ' + ', '.join(problems)}")
                records = payload["batch"]["records"]
                if not payload["frames"]:
                    counts["frameless_only"] += 1
                for frame in payload["frames"]:
                    counts["frames"].add(frame["frame_id"])
                    record = next(r for r in records if r["frame_id"] == frame["frame_id"])
                    binding = manifest["bindings"][frame["artifact"]["artifact_id"]]
                    desktop_frame.validate_binding(payload["batch"], record["record_id"], frame, source, binding)
                    native = kept[frame["callback_sequence"]]
                    problems = native_problems(frame, status, native)
                    check(not problems, f"request {name}, frame {frame['frame_id']}: validate_binding accepts it, and every "
                                        f"field equals the native records{'' if not problems else ': ' + ', '.join(problems)}")
                    problem = png_problem((session_dir / native["file"]).read_bytes(), frame)
                    check(problem is None, f"request {name}, frame {frame['frame_id']}: the retained PNG matches "
                                           f"(SHA-256, length, signature, IHDR){'' if problem is None else ': ' + problem}")
                for record in records:
                    if record["frame_id"] is None:
                        gap_kind = case["gap_kinds"][record["record_id"]]
                        coverage, limitations = gap_coverage(gap_kind)
                        evidence = record["evidence"]
                        check(gap_kind in native_gaps and evidence["coverage"] == coverage
                              and evidence["limitations"] == limitations and record["artifacts"] == [],
                              f"request {name}, gap record {record['record_id']} ({gap_kind}): a retained native gap, "
                              f"with coverage {coverage}, limitations {limitations} and no artifact")
                    else:
                        check(record["evidence"] == FRAMED_EVIDENCE,
                              f"request {name}, framed record {record['record_id']}: sampled-pixel coverage evidence")
                check(len(case["unrepresented"]) >= sum(r["frame_id"] is None for r in records),
                      f"request {name}: each gap reports its unrepresented native facts")
                for label, mutated in mutations(payload):
                    counts["mutations"] += 1
                    check(refused(lambda: ingress.validate_frame_batch(mutated, user_id=user_id)),
                          f"request {name}: {label} is refused")
            elif kind == "refusal":
                counts["refusal"] += 1
                reason, expected = case["reason"], case["expected"]
                check(isinstance(reason, str) and isinstance(expected, str) and expected.strip() != ""
                      and reason.strip() != "" and reason != "NOT REFUSED" and not reason.startswith("unexpected")
                      and expected in reason,
                      f"refusal {name}: Swift refused it with the expected reason ({reason!r}, expected {expected!r})")
            else:
                check(False, f"known case type {kind!r}")
        except Exception as error:  # Report and continue with the other cases.
            check(False, f"{kind} {name}: {type(error).__name__}: {error}")

    check(counts["request"] >= 3 and counts["frameless_only"] >= 1 and len(counts["frames"]) >= 3
          and counts["refusal"] >= 20 and counts["mutations"] >= 20,
          "the fixture set is not vacuous (framed, frameless-only and mixed requests, frames, refusals, mutations)")
    if failures:
        print(f"{len(failures)} desktop ingress fixture check(s) failed")
        return 1
    print("all desktop ingress fixture checks passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
