#!/usr/bin/env python3
"""Validate the Swift-made Mac retained-frame 0.2.11 fixtures with the released contract.

    python apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py MAC_FRAME_FIXTURE_DIR

The fixtures come from `swift test` with COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR set to a new
directory: the MacRetainedFramesTests.testMapsEveryRetainedOutcomeToMacFrameMetadata session, the
mapper's descriptors and refusals, and manifest.json. Run in the repository's pinned environment.

For every described frame:
- the released 0.2.11 `validate` and `validate_binding`, with the manifest's DisplaySourceSnapshot,
  the Swift-supplied 0.2.2 bindings, and a ProcessBatch record that this checker synthesizes from
  the descriptor (the mapper emits no Process record, so the record-side equalities hold by
  construction; the source snapshot and bindings are independent inputs);
- against the native files, read with Python's exact integers: the raw PNG's bytes (SHA-256,
  length, signature, IHDR size) and record; the composition kind against the recorded outcome
  (composed, not_composed, or none = unknown), every composed and pairing field against the
  native record, and the composed image's own bytes; the whole profile (display at start, wall
  and host clock, UInt64 display ticks as exact decimal text, sample facts) against status.json
  and the kept frame;
- the case describing every kept frame covers each exactly once; its unrepresented facts name
  exactly the outcome-less callbacks, the ending (or its absence), the recorded capture filter
  and the ink documents.

Negative controls change one fact of an accepted frame, or one binding, and must be refused by the
released contract for their stated rule (a message fragment). Refusal cases are Swift's own
outcomes: nonempty reasons containing their expected fragment. All inputs are synthetic fixtures:
no display capture, provider, network or device.
"""

import copy
import hashlib
import json
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from packages.contracts.macos_frame import (  # noqa: E402
    REOPENED_LIMIT, validate, validate_binding,
)
from packages.contracts.display_source import validate as validate_display  # noqa: E402
from packages.contracts.original_artifact import validate as validate_original  # noqa: E402
from jsonschema import ValidationError  # noqa: E402

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def refused(check, fragment):
    """True only for a contract refusal whose message holds `fragment`; any other exception is a
    failure of the check itself."""
    try:
        check()
    except ValidationError as error:
        return fragment in error.message
    return False


def native_session(directory):
    """status.json, kept frames and composition outcomes by callback sequence."""
    status = json.loads((directory / "status.json").read_bytes())
    kept, outcomes, filters = {}, {}, []
    for line in (directory / "events.jsonl").read_bytes().split(b"\n"):
        if not line.strip():
            continue
        event = json.loads(line)
        if event["event"] == "kept":
            kept[event["frame"]["sequence"]] = event["frame"]
        elif event["event"] == "composed":
            outcomes.setdefault(event["composed"]["rawSequence"], []).append(("composed", event))
        elif event["event"] == "not_composed":
            outcomes.setdefault(int(event["detail"]["sequence"]), []).append(("not_composed", event))
        elif event["event"] == "capture_filter":
            filters.append(event)
    return status, kept, outcomes, filters


def png_problem(data, artifact, width, height):
    if hashlib.sha256(data).hexdigest() != artifact["sha256"] or len(data) != artifact["byte_length"]:
        return "the file's bytes differ from the artifact reference"
    if not data.startswith(PNG_SIGNATURE) or data[12:16] != b"IHDR":
        return "the file is not a PNG"
    if list(struct.unpack(">II", data[16:24])) != [width, height]:
        return "the PNG's IHDR size differs from the declared size"
    return None


def batch_for(frame):
    """A ProcessBatch whose one record names the frame and its distinct image artifacts."""
    pictures = [frame["raw"]]
    if frame["composition"]["kind"] == "composed":
        pictures.append(frame["composition"]["image"])
    artifacts = list({p["artifact"]["artifact_id"]: p["artifact"] for p in pictures}.values())
    record = {
        "record_id": "record-" + frame["frame_id"], "sequence": frame["callback_sequence"],
        "source": copy.deepcopy(frame["source"]), "scope": {"kind": "provisional_session"},
        "observed_at": None, "clock": None, "media_position": None, "surface": "external_app",
        "method": "visual", "causal_parents": [], "artifacts": copy.deepcopy(artifacts),
        "evidence": {"kind": "coverage", "coverage": "observed_samples", "from_clock_ms": None,
                     "through_clock_ms": None, "missing_sequences": [],
                     "limitations": ["sample_only", "unsupported_history"]},
        "frame_id": frame["frame_id"],
    }
    batch = {"contract_version": "0.2.0", "batch_id": "synthetic-batch-" + frame["frame_id"],
             "device_id": frame["device_id"], "session_id": frame["session_id"], "stream_id": frame["stream_id"],
             "delivery_mode": "historical", "records": [record]}
    return batch, record["record_id"]


def native_problems(frame, status, kept, outcomes, session_dir):
    """Differences between a descriptor and the native records and files it was mapped from."""
    problems = []
    sequence = frame["callback_sequence"]
    record = kept.get(sequence)
    if record is None:
        return [f"callback {sequence} has no kept frame"]
    raw, profile = frame["raw"], frame["profile"]
    if [raw["native_file"], raw["artifact"]["sha256"], raw["artifact"]["byte_length"], raw["width"], raw["height"],
            raw["encoding"]] != [record["file"], record["sha256"], record["byteLength"], record["width"], record["height"],
                                 record["encoding"]]:
        problems.append("raw facts differ from the kept frame")
    problem = png_problem((session_dir / record["file"]).read_bytes(), raw["artifact"], raw["width"], raw["height"])
    if problem:
        problems.append("raw: " + problem)
    facts, clock, display = record["facts"], profile["host_clock"], status["display"]
    ticks = facts.get("displayTimeTicks")
    expected_clock = {
        "basis": "mach_absolute_time_seconds", "session_started_wall_utc": status["startedWall"],
        "session_started_seconds": status["startedHost"], "callback_seconds": record["callbackHost"],
        "display_time_ticks_decimal": None if ticks is None else str(ticks),
        "display_time_seconds": facts.get("displayTimeSeconds"), "source_seconds": record.get("sourceHost"),
        "source_time_lead_tolerance_seconds": status["settings"]["sourceTimeLeadTolerance"],
    }
    if clock != expected_clock:
        problems.append("host clock differs from status.json and the kept frame")
    expected_start = {
        "display_id": display["displayID"], "name": display.get("name"), "frame_points": display["frame"],
        "point_pixel_scale": display["pointPixelScale"], "requested_width_pixels": display["requestedWidth"],
        "requested_height_pixels": display["requestedHeight"], "rotation_degrees": display["rotationDegrees"],
        "is_main": display["isMain"], "scope": display["scope"],
    }
    if ([profile["kind"], profile["native_session_id"], profile["pixel_format"], profile["display_at_start"]]
            != ["macos_screencapturekit", status["session"], record["pixelFormat"], expected_start]):
        problems.append("profile or display at start differs from status.json")
    expected_sample = {
        "status": facts["status"], "presentation_time_seconds": facts.get("presentationTime"),
        "geometry_basis": "SCStreamFrameInfo_as_reported", "geometry_unit": None,
        "content_rect": facts.get("contentRect"), "content_scale": facts.get("contentScale"),
        "scale_factor": facts.get("scaleFactor"), "dirty_rects": facts.get("dirtyRects"),
    }
    if profile["sample"] != expected_sample:
        problems.append("sample facts differ from the kept frame")
    recorded = outcomes.get(sequence, [])
    result = frame["composition"]
    if len(recorded) > 1:
        problems.append("the native session records more than one outcome, yet a descriptor exists")
    elif not recorded:
        if result != {"kind": "unknown", "reason": "no_retained_outcome"}:
            problems.append("no recorded outcome, yet the composition is not unknown")
    else:
        kind, event = recorded[0]
        if kind != result["kind"]:
            problems.append(f"the recorded outcome is {kind}, not {result['kind']}")
        elif kind == "not_composed":
            if [result["host_seconds"], result["reason"], result["detail"]] != [
                    event["host"], event["detail"]["reason"], event["detail"]["detail"]]:
                problems.append("not_composed differs from the recorded outcome")
        else:
            native, ink = event["composed"], result["ink"]
            image = result["image"]
            expected = [native["rawSequence"], native["rawFile"], native["rawSHA256"], native["rawByteLength"],
                        native["file"], native["sha256"], native["byteLength"], native["width"], native["height"],
                        native["composedHost"]]
            actual = [result["raw_sequence"], result["raw_file"], result["raw_sha256"], result["raw_byte_length"],
                      image["native_file"], image["artifact"]["sha256"], image["artifact"]["byte_length"], image["width"],
                      image["height"], result["composed_host_seconds"]]
            if expected != actual:
                problems.append("composed facts differ from the recorded outcome")
            paired = native["ink"]
            document = paired.get("document")
            expected_ink = {
                "pixels_host_seconds": paired["pixelsHost"], "pixels_time": paired["pixelsTime"],
                "document": None if document is None else {"created_in_session": document["createdInSession"],
                                                           "file": document["file"], "display_id": document["displayID"]},
                "revision": paired.get("revision"), "revision_host_seconds": paired.get("revisionHost"),
                "strokes": paired["strokes"], "mapping": paired["mapping"], "rendering": paired["rendering"],
                "limits": paired["limits"],
            }
            if ink != expected_ink:
                problems.append("paired ink differs from the recorded outcome")
            problem = png_problem((session_dir / image["native_file"]).read_bytes(), image["artifact"], image["width"],
                                  image["height"])
            if problem:
                problems.append("composed: " + problem)
    return problems


def mutations(frame, bindings):
    """One changed fact each, with the released rule's message fragment it must be refused for."""
    changed = []

    def variant(label, fragment, change, change_bindings=None):
        copied, copied_bindings = copy.deepcopy(frame), copy.deepcopy(bindings)
        change(copied)
        if change_bindings:
            change_bindings(copied_bindings)
        changed.append((label, fragment, copied, copied_bindings))

    result = frame["composition"]
    variant("capture UTC invented", "is not of type 'null'", lambda f: f.update(captured_at="2026-09-21T14:13:21Z"))
    variant("media position invented", "is not of type 'null'", lambda f: f.update(media_position={"kind": "video", "seconds": 1}))
    variant("another native file for the raw", "Raw native file must name this callback sequence",
            lambda f: f["raw"].update(native_file="frames/99999999.png"))
    variant("source time beside the recorder's rule", "sourceHost must be the producer's validated display time",
            lambda f: f["profile"]["host_clock"].update(source_seconds=(f["profile"]["host_clock"]["callback_seconds"] + 5)))
    variant("unknown scope", "is not one of", lambda f: f["profile"]["display_at_start"].update(scope="whole display"))
    if result["kind"] == "composed":
        ink = result["ink"]
        variant("raw relation to another digest", "Composed raw relation", lambda f: f["composition"].update(raw_sha256="0" * 64))
        variant("time basis flipped", "Paired ink must retain", lambda f: f["composition"]["ink"].update(
            pixels_time="callback_admission" if ink["pixels_time"] == "source_time" else "source_time"))
        variant("base limitations reordered", "ordered composition limitations", lambda f: f["composition"]["ink"].update(
            limits=[ink["limits"][1], ink["limits"][0]] + ink["limits"][2:]))
        if ink["document"] is not None and ink["revision_host_seconds"] is not None:
            variant("commit after the pixels", "committed after the pairing time", lambda f: f["composition"]["ink"].update(
                revision_host_seconds=ink["pixels_host_seconds"] + 1))
        variant("composition without app exclusion", "app exclusion scope", lambda f: f["profile"]["display_at_start"].update(
            scope="synthetic fixture; not a captured display"))
        if ink["strokes"]:
            variant("strokes drawn onto the raw file", "Empty ink aliases raw",
                    lambda f: f["composition"]["image"].update(native_file=f["raw"]["native_file"]))
            variant("the composed image's binding dropped", "exactly one original binding", lambda f: None,
                    lambda b: b.pop())
        else:
            variant("empty ink as its own file", "Empty ink aliases raw", lambda f: f["composition"]["image"].update(
                native_file="composed/" + f["raw"]["native_file"].split("/")[1]))
            if len(bindings) == 1:
                variant("a raw alias given a duplicate second binding", "exactly one original binding", lambda f: None,
                        lambda b: b.append(copy.deepcopy(b[0])))
            else:
                variant("an alias binding with another length", "retain each complete PNG reference", lambda f: None,
                        lambda b: b[1]["artifact"].update(byte_length=b[1]["artifact"]["byte_length"] + 1))
        if any(limit.startswith("revision ") and "last reopened" in limit for limit in ink["limits"]):
            variant("reopened unknown-clock limitation dropped", "prior-reopen revision", lambda f: f["composition"]["ink"].update(
                limits=[l for l in f["composition"]["ink"]["limits"] if "last reopened" not in l]))
    elif result["kind"] == "not_composed":
        variant("an undocumented refusal reason", "is not valid under any of the given schemas",
                lambda f: f["composition"].update(reason="vanished"))
        variant("an outcome before admission", "already-admitted raw frame", lambda f: f["composition"].update(host_seconds=0))
    else:
        variant("an unknown outcome with a reason", "is not valid under any of the given schemas",
                lambda f: f["composition"].update(reason="session_ended_before_composition"))
    return changed


def main(directory):
    failures = []

    def check(condition, name):
        print(("PASS " if condition else "FAIL ") + name)
        if not condition:
            failures.append(name)

    try:
        manifest = json.loads((directory / "manifest.json").read_bytes())
        session_dir = directory / manifest["native_session"]
        status, kept, outcomes, filters = native_session(session_dir)
        source = manifest["display_source"]
        validate_display(source)
    except Exception as error:  # Reported, never a silent pass.
        check(False, f"the fixture could be read: {type(error).__name__}: {error}")
        return 1
    seen = {"kinds": set(), "empty": 0, "inked": 0, "no_document": 0, "callback_basis": 0, "reopened": 0,
            "two_references": 0, "refusal": 0, "mutations": 0, "mappings": 0}
    for case in manifest["cases"]:
        kind, name = case["type"], case["name"]
        try:
            if kind == "mapping":
                seen["mappings"] += 1
                mapping = case["mapping"]
                check(mapping["refused"] == [], f"mapping {name}: no entry was refused")
                for item in mapping["described"]:
                    label = f"mapping {name}, frame {item.get('frame_id')}"
                    try:  # Each frame reports its own failures.
                        frame, bindings = item["frame"], item["bindings"]
                        for binding in bindings:
                            validate_original("OriginalArtifactBinding", binding)
                        batch, record_id = batch_for(frame)
                        validate_binding(batch, record_id, frame, source, bindings)
                        check(item["callback_sequence"] == frame["callback_sequence"] and item["frame_id"] == frame["frame_id"],
                              f"{label}: validate and validate_binding accept it, and the item names its frame")
                        problems = native_problems(frame, status, kept, outcomes, session_dir)
                        check(not problems, f"{label}: every fact equals the native records and files"
                                            + ("" if not problems else ": " + "; ".join(problems)))
                        result = frame["composition"]
                        seen["kinds"].add(result["kind"])
                        if result["kind"] == "composed":
                            ink = result["ink"]
                            seen["empty" if not ink["strokes"] else "inked"] += 1
                            seen["no_document"] += ink["document"] is None
                            seen["callback_basis"] += ink["pixels_time"] == "callback_admission"
                            seen["reopened"] += any(l == REOPENED_LIMIT.format(ink["revision"]) for l in ink["limits"])
                            seen["two_references"] += (not ink["strokes"] and result["image"]["artifact"]["artifact_id"]
                                                       != frame["raw"]["artifact"]["artifact_id"])
                        for mutation_label, fragment, mutated, mutated_bindings in mutations(frame, bindings):
                            seen["mutations"] += 1
                            check(refused(lambda: validate_binding(batch, record_id, mutated, source, mutated_bindings), fragment),
                                  f"{label}: {mutation_label} is refused ({fragment})")
                    except Exception as error:
                        check(False, f"{label}: {type(error).__name__}: {error}")
                if name == "every_kept_frame":
                    sequences = [item["callback_sequence"] for item in mapping["described"]]
                    check(sorted(sequences) == sorted(kept) and len(set(sequences)) == len(sequences),
                          f"mapping {name}: every kept frame is described exactly once")
                    facts = mapping["unrepresented"]
                    unknown = [s for s in sorted(kept) if s not in outcomes]
                    unknown_line = ("callbacks " + ", ".join(map(str, unknown))
                                    + " have no recorded composition outcome: unknown, never empty ink")
                    check((unknown_line in facts) == bool(unknown)
                          and not any("have no recorded composition outcome" in f and f != unknown_line for f in facts)
                          and any(f.startswith("no ending is recorded") for f in facts) == ("ending" not in status)
                          and any(f.startswith("capture_filter: ") for f in facts) == bool(filters)
                          and any("not an immutable editable original" in f and f.startswith(("ink documents", "no ink document"))
                                  for f in facts),
                          f"mapping {name}: unrepresented facts name exactly the outcome-less callbacks, the ending, "
                          "the capture filter and the ink documents")
            elif kind == "refusal":
                seen["refusal"] += 1
                reason, expected = case["reason"], case["expected"]
                check(isinstance(reason, str) and isinstance(expected, str) and expected.strip() != ""
                      and reason.strip() != "" and reason != "NOT REFUSED" and not reason.startswith("unexpected")
                      and expected in reason,
                      f"refusal {name}: Swift refused it with the expected reason ({reason!r}, expected {expected!r})")
            else:
                check(False, f"known case type {kind!r}")
        except Exception as error:  # Report and continue with the other cases.
            check(False, f"{kind} {name}: {type(error).__name__}: {error}")

    check(seen["mappings"] >= 2 and seen["kinds"] == {"composed", "not_composed", "unknown"} and seen["empty"] >= 2
          and seen["inked"] >= 2 and seen["no_document"] >= 1 and seen["callback_basis"] >= 1 and seen["reopened"] >= 1
          and seen["two_references"] >= 1 and seen["refusal"] >= 20 and seen["mutations"] >= 40,
          "the fixture set is not vacuous (every outcome kind, aliases with one and two references, no document, "
          "callback pairing, a reopened revision, refusals, mutations)")
    if failures:
        print(f"{len(failures)} Mac retained-frame fixture check(s) failed")
        return 1
    print("all Mac retained-frame fixture checks passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
