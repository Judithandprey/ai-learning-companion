#!/usr/bin/env python3
"""Validate RawCaptureFrameCheck's Swift-emitted 0.2.5 descriptors with the released Python contract.

    python3 apps/ios/checks/RawCaptureFrameCheck/validate_raw_frames.py FIXTURE_DIR

Needs the repository's Python dependency (jsonschema[format], see pyproject.toml). For every
descriptor this checks:
- strict JSON (duplicate members and non-finite numbers refused);
- `capture_frame.validate`;
- canonical bytes;
- every field recomputed independently from the saved inputs the Swift check recorded, including
  the millisecond arithmetic of the callback estimate;
- `capture_frame.validate_binding` against a composed ProcessBatch 0.2.0, DisplaySourceSnapshot
  0.2.3 and the actual OriginalArtifactBinding 0.2.2.

The composition is synthetic contract input, not device, server or AI evidence.
"""

import copy
import datetime
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from packages.contracts import capture_frame  # noqa: E402
from packages.contracts.original_artifact import validate as validate_original  # noqa: E402

BASIS = "session_wall_plus_callback_monotonic_delta"
EXAMPLE_BATCH = ROOT / "packages/contracts/process_v2/examples/capture.json"


def strict_json(data):
    def members(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate member {key!r}")
            result[key] = value
        return result

    def nonfinite(constant):
        raise ValueError(f"non-finite number {constant}")

    return json.loads(data.decode("utf-8"), object_pairs_hook=members, parse_constant=nonfinite)


def utc_milliseconds(milliseconds):
    seconds = datetime.datetime.fromtimestamp(milliseconds // 1000, datetime.timezone.utc)
    return seconds.strftime("%Y-%m-%dT%H:%M:%S") + ".%03dZ" % (milliseconds % 1000)


def expected_frame(case):
    record, identity, anchor, binding = case["record"], case["identity"], case["anchor"], case["binding"]
    timing = {"observed_at_estimate": None, "estimate_basis": None, "uncertainty_ms": None,
              "callback_clock": None, "sample_pts_seconds": record["presentation_time"]}
    domain = identity["callback_clock_domain"]
    if domain is not None and anchor is not None:
        elapsed_ms = math.floor((record["host_time"] - anchor["host_seconds"]) * 1000)
        wall_ms = math.floor(anchor["wall_seconds_since_1970"] * 1000)
        timing.update(observed_at_estimate=utc_milliseconds(wall_ms + elapsed_ms), estimate_basis=BASIS,
                      callback_clock={"domain_id": domain, "elapsed_ms": elapsed_ms, "uncertainty_ms": None})
    return {
        "contract_version": "0.2.5", "kind": "raw_capture_frame", "frame_id": identity["frame_id"],
        "source": binding["source"], "device_id": identity["device_id"],
        "session_id": identity["session_id"], "stream_id": identity["stream_id"],
        "artifact": binding["artifact"], "raw_width": record["width"], "raw_height": record["height"],
        "buffer_sequence": record["sequence"], "captured_at": None, "media_position": None,
        "timing": timing,
        "orientation": {"system": "CGImagePropertyOrientation", "value": record["orientation"],
                        "applied_to_pixels": False},
    }


def composed(frame):
    """ProcessBatch and DisplaySourceSnapshot naming this frame, as in the contract's own tests."""
    batch = json.loads(EXAMPLE_BATCH.read_text(encoding="utf-8"))["ProcessBatch"]
    batch.update({name: frame[name] for name in ("device_id", "session_id", "stream_id")})
    record = batch["records"][0]
    record.update(source=copy.deepcopy(frame["source"]), frame_id=frame["frame_id"], observed_at=None,
                  media_position=None, clock=copy.deepcopy(frame["timing"]["callback_clock"]),
                  artifacts=[copy.deepcopy(frame["artifact"])])
    display = {"contract_version": "0.2.3", **copy.deepcopy(frame["source"]), "type": "shared_display",
               **{name: frame[name] for name in ("device_id", "session_id", "stream_id")},
               "project_id": None, "created_at": "2026-09-30T04:15:00Z",
               "source_timezone": "America/Los_Angeles"}
    return batch, record["record_id"], display


def main(directory):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    failures = []

    def check(condition, name):
        print(("PASS " if condition else "FAIL ") + name)
        if not condition:
            failures.append(name)

    for case in manifest["cases"]:
        name = case["name"]
        try:
            data = (directory / case["frame"]).read_bytes()
            frame = strict_json(data)
            capture_frame.validate(frame)
            check(True, f"{name}: strict JSON that capture_frame.validate accepts")
            canonical = json.dumps(frame, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            check(canonical == data, f"{name}: the Swift bytes are canonical JSON")
            check(frame == expected_frame(case),
                  f"{name}: every field equals an independent recomputation from the saved inputs")
            anchor = case["anchor"]
            check(anchor is None or anchor["session"] == manifest["local_session"],
                  f"{name}: the anchor belongs to the named local capture session")
            binding = case["binding"]
            validate_original("OriginalArtifactBinding", binding)
            check(binding["artifact"]["sha256"] == case["record"]["sha256"]
                  and binding["artifact"]["byte_length"] == case["record"]["byte_length"],
                  f"{name}: the original binding has the kept file's hash and length")
            batch, record_id, display = composed(frame)
            capture_frame.validate_binding(batch, record_id, frame, display, binding)
            check(True, f"{name}: validate_binding accepts it with the actual original binding")
            clock = frame["timing"]["callback_clock"]
            if clock is not None:
                batch["records"][0]["clock"] = {**clock, "elapsed_ms": clock["elapsed_ms"] + 1}
                try:
                    capture_frame.validate_binding(batch, record_id, frame, display, binding)
                    check(False, f"{name}: a process clock differing from the callback clock is refused")
                except Exception:  # Any validation failure is the expected refusal.
                    check(True, f"{name}: a process clock differing from the callback clock is refused")
        except Exception as error:  # Report and continue with the other fixtures.
            check(False, f"{name}: {type(error).__name__}: {error}")

    names = {case["name"] for case in manifest["cases"]}
    required = {"saved-anchor", "fractional-anchor", "no-clock-domain", "no-status",
                "zero-elapsed-negative-pts", "largest-buffer-sequence",
                *(f"orientation-{value}" for value in ["null", *range(1, 9)])}
    check(required <= names, "the fixture set covers both anchors, unknown clocks, all orientations and the limits")
    if failures:
        print(f"{len(failures)} raw frame fixture check(s) failed")
        return 1
    print("all raw frame fixture checks passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
