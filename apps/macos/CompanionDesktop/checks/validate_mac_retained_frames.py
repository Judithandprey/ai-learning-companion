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
- the case describing every kept frame covers each exactly once; its unrepresented facts are
  recomputed from the retained files and compared line for line, per category: the ending(s) in
  status.json and events.jsonl with any disagreement, stream notes, the capture filter, the ink
  documents (named by outcomes or saved in ink/), the ink originals and the outcome-less callbacks.
  Controls that remove, change or invent these lines must fail;
- each composed frame's retained ink original (ink-originals/<SHA-256>.json): a regular file of
  exactly the recorded SHA-256 and length, decoded as the whole editable document of the frame's
  paired reference (session, display, file), whose own revision is recorded and whose operation
  history, replayed to the frame's paired revision, gives exactly the paired strokes; its
  limitations recomputed from the snapshot and the recorded pending-gesture and ASK-region flags;
  and the frame's 0.2.2 editable_ink binding (released `validate_original`) naming exactly those
  bytes. A frame without a retained original (no document, unavailable with its reason, or not
  recorded: unknown) has no editable_ink binding. The "ink originals:" facts (the summary and one
  line per kept original) are recomputed. Controls that change the bytes, the record, the flags,
  the history or the binding must fail. Each distinct original's history is printed as evidence,
  and the fixture must exercise every status and a history with write, erase, undo, redo, ASK
  finish and cancel, a stroke interrupted at Stop, and a reopening.

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
    kept, outcomes, filters, ended, streams = {}, {}, [], [], []
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
        elif event["event"] == "ended":
            ended.append(event)
        elif event["event"] in ("stream_error_after_live_ended", "stream_stopped_after_start_returned",
                                "stream_stopped_after_quit_request"):
            streams.append(event)
    return status, kept, outcomes, filters, ended, streams


def swift_double(value):
    """A Double as Swift's description writes it (shortest round trip, with .0 when integral)."""
    return repr(float(value))


def pairs(detail):
    return "; ".join(f"{key}={value}" for key, value in sorted((detail or {}).items()))


INK_CONTENT_KINDS = {"stroke", "erase", "undo", "redo"}
ORIGINAL_BASE_LIMIT = ("an exact snapshot of the whole editable document (every stroke, operation, undo/redo stack and ASK "
                       "selection), frozen when this frame was paired; the mutable ink file may have changed, or failed to save, since")
ORIGINAL_LATER_LIMIT = ("the snapshot is at revision {} and the frame shows revision {}: later operations were committed after "
                        "the pixels and are not drawn in this frame")
ORIGINAL_GESTURE_LIMIT = "a gesture was in progress when the document was frozen; its points are not in the snapshot"
ORIGINAL_ASK_LIMIT = ("an ASK region was drawn and was awaiting Finish or Cancel when the document was frozen; it is not in "
                      "the snapshot")
ORIGINAL_REOPENED_LIMIT = "operations before the document's last reopening keep their own session's host clock"
ORIGINAL_UNAVAILABLE_LIMIT = ("no immutable editable original is kept for this frame (see problem); the document path and "
                              "revision name only the mutable ink file, which may have changed, or failed to save, since")
NO_DOCUMENT_LIMIT = "no ink document was open at that time, so nothing is drawn"


def single_composed(outcomes, kept):
    """The composed records of kept frames with exactly one outcome, by callback sequence, as the mapper reads them."""
    return {sequence: recorded[0][1]["composed"] for sequence, recorded in outcomes.items()
            if sequence in kept and len(recorded) == 1 and recorded[0][0] == "composed"}


def visible_strokes(document, target):
    """The stroke IDs visible at a committed revision, replayed from the operation history (the
    Swift InkDocument.visibleStrokes rule); None for a revision the document never had."""
    if not isinstance(target, int) or not 0 <= target <= document["revision"]:
        return None
    shown = set()
    for operation in document["operations"]:
        if operation["kind"] in INK_CONTENT_KINDS and operation["revision"] <= target:
            shown -= set(operation["removed"])
            shown |= set(operation["added"])
    return [stroke["id"] for stroke in document["strokes"] if stroke["id"] in shown]


def verified_document(session_dir, original):
    """The retained original's decoded document when its file has exactly the recorded bytes, else None."""
    data, problem = read_ink_original(session_dir, original.get("file"), original.get("sha256") or "")
    if problem or hashlib.sha256(data).hexdigest() != original.get("sha256") or len(data) != original.get("byteLength"):
        return None, None
    try:
        return data, json.loads(data)
    except ValueError:
        return None, None


def read_ink_original(session_dir, name, sha256):
    """The bytes at ink-originals/<sha256>.json, or a problem: the folder and file must be real
    (never a symbolic link) and inside the session."""
    if (name != f"ink-originals/{sha256}.json" or len(sha256) != 64
            or any(c not in "0123456789abcdef" for c in sha256)):
        return None, f"{name} is not the ink-originals/<SHA-256>.json path of its bytes"
    folder, path = session_dir / "ink-originals", session_dir / name
    if folder.is_symlink() or not folder.is_dir() or path.is_symlink() or not path.is_file():
        return None, f"{name} is not a regular file in a real ink-originals directory"
    return path.read_bytes(), None


def ink_original_problems(item, composed, session_dir, read=read_ink_original):
    """Differences between a described frame's ink original record, its retained file and its
    editable_ink bindings. `composed` is the frame's single composed record, or None."""
    bindings = item.get("ink_original_bindings")
    if not isinstance(bindings, list):
        return ["the item has no ink_original_bindings list"]
    original = None if composed is None else composed.get("inkOriginal")
    if original is None or original.get("status") != "retained":
        problems = [] if not bindings else ["an editable_ink binding is given without a retained ink original"]
        if original is None:
            return problems
        paired = composed["ink"]
        if original["status"] == "no_document":
            if paired.get("document") is not None or original["limits"] != [NO_DOCUMENT_LIMIT] or any(
                    original.get(key) is not None for key in ("file", "sha256", "byteLength", "documentRevision")):
                problems.append("a no_document ink original differs from its frame's ink")
        elif original["status"] == "unavailable":
            if (paired.get("document") is None or not original.get("problem") or original.get("file") is not None
                    or original["limits"] != [ORIGINAL_UNAVAILABLE_LIMIT] or original.get("pairedRevision") != paired.get("revision")):
                problems.append("an unavailable ink original claims a file, lacks its reason or differs from its frame's ink")
        else:
            problems.append(f"ink original status {original['status']!r} is not recorded by this recorder")
        return problems
    problems = []
    paired, name, sha256, length = composed["ink"], original.get("file"), original.get("sha256"), original.get("byteLength")
    if original.get("mediaType") != "application/json" or not isinstance(length, int) or not 1 <= length <= 33_554_432:
        return ["the retained ink original is not an application/json original within the released size range"]
    data, problem = read(session_dir, name, sha256)
    if problem:
        return [problem]
    if hashlib.sha256(data).hexdigest() != sha256 or len(data) != length:
        return [f"{name} is not the recorded SHA-256 and length"]
    document = json.loads(data)
    reference, revision = paired.get("document") or {}, original.get("pairedRevision")
    if ([document["revision"], document["createdInSession"], document["displayID"], revision, original.get("documentFile"),
         original.get("createdInSession")]
            != [original.get("documentRevision"), reference.get("createdInSession"), reference.get("displayID"),
                paired.get("revision"), reference.get("file"), reference.get("createdInSession")]):
        problems.append(f"{name} is not the frozen document of this frame's paired ink")
    if visible_strokes(document, revision) != paired["strokes"]:
        problems.append(f"{name}, replayed to revision {revision}, does not give the frame's strokes")
    later = document["revision"] > (revision if isinstance(revision, int) else document["revision"])
    reopened = any(operation["kind"] == "reopened" for operation in document["operations"])
    pending = [original.get("pendingGesture"), original.get("pendingAskRegion")]
    if not all(isinstance(flag, bool) for flag in pending):
        problems.append("the ink original does not record its pending gesture and ASK region flags")
    expected = ([ORIGINAL_BASE_LIMIT] + ([ORIGINAL_LATER_LIMIT.format(document["revision"], revision)] if later else [])
                + ([ORIGINAL_GESTURE_LIMIT] if pending[0] is True else []) + ([ORIGINAL_ASK_LIMIT] if pending[1] is True else [])
                + ([ORIGINAL_REOPENED_LIMIT] if reopened else []))
    if original["limits"] != expected:
        problems.append(f"the ink original's limitations are not those of {name} and its recorded flags")
    if len(bindings) != 1:
        problems.append(f"{len(bindings)} editable_ink bindings are given for one retained ink original")
    for binding in bindings:
        try:
            validate_original("OriginalArtifactBinding", binding)
        except ValidationError as error:
            problems.append(f"the editable_ink binding is refused by the released contract: {error.message}")
            continue
        artifact = binding["artifact"]
        if ([binding["kind"], binding["source"], artifact["sha256"], artifact["byte_length"], artifact["media_type"]]
                != ["editable_ink", item["frame"]["source"], sha256, length, "application/json"]):
            problems.append("the editable_ink binding does not name exactly the retained ink original")
    return problems


def ink_original_controls(item, composed, session_dir):
    """One changed byte, record field, history or binding each; every one must be reported."""
    original = composed["inkOriginal"]
    data, _ = read_ink_original(session_dir, original["file"], original["sha256"])
    controls = []

    def control(label, change_item=None, change_original=None, content=None):
        """`content` replaces the file's bytes; with `readdress` its record and binding follow them."""
        changed_item, changed = copy.deepcopy(item), copy.deepcopy(composed)
        if change_item:
            change_item(changed_item)
        if change_original:
            change_original(changed["inkOriginal"])
        read = read_ink_original
        if content is not None:
            new, readdress = content
            if readdress:
                sha256 = hashlib.sha256(new).hexdigest()
                changed["inkOriginal"].update(sha256=sha256, byteLength=len(new), file=f"ink-originals/{sha256}.json")
                for binding in changed_item["ink_original_bindings"]:
                    binding["artifact"].update(sha256=sha256, byte_length=len(new))
            read = lambda _directory, _name, _sha256: (new, None)  # noqa: E731
        controls.append((label, changed_item, changed, read))

    flipped = bytearray(data)
    flipped[-1] ^= 1
    control("one byte of the file changed", content=(bytes(flipped), False))
    control("the binding's SHA-256 changed", change_item=lambda i: i["ink_original_bindings"][0]["artifact"].update(sha256="0" * 64))
    control("the binding given as a screen image", change_item=lambda i: i["ink_original_bindings"][0].update(kind="screen_image"))
    control("the binding dropped", change_item=lambda i: i["ink_original_bindings"].clear())
    control("the binding given twice",
            change_item=lambda i: i["ink_original_bindings"].append(copy.deepcopy(i["ink_original_bindings"][0])))
    control("the paired revision changed", change_original=lambda o: o.update(pairedRevision=o["pairedRevision"] + 1))
    control("the document revision changed", change_original=lambda o: o.update(documentRevision=o["documentRevision"] + 1))
    control("a limitation dropped", change_original=lambda o: o.update(limits=o["limits"][:-1]))
    control("the pending-gesture flag flipped", change_original=lambda o: o.update(pendingGesture=not o["pendingGesture"]))
    control("the pending ASK region flag flipped", change_original=lambda o: o.update(pendingAskRegion=not o["pendingAskRegion"]))
    # A history change the frame shows: the last operation up to the paired revision that adds a
    # visible stroke no longer adds it.
    rewritten = json.loads(data)
    visible = set(visible_strokes(rewritten, original["pairedRevision"]) or [])
    adding = [operation for operation in rewritten["operations"] if operation["kind"] in INK_CONTENT_KINDS
              and operation["revision"] <= original["pairedRevision"] and visible & set(operation["added"])]
    if adding:
        gone = sorted(visible & set(adding[-1]["added"]))[0]
        adding[-1]["added"] = [stroke for stroke in adding[-1]["added"] if stroke != gone]
        control(f"operation {adding[-1]['sequence']} no longer adds {gone} (same revisions), with its record and binding readdressed",
                content=(json.dumps(rewritten, sort_keys=True, separators=(",", ":")).encode(), True))
    return controls


def ink_original_coverage(composed_records, session_dir):
    """What the fixture's originals exercise: statuses, flags, and the operation kinds, selections
    and interrupted strokes in the retained histories."""
    coverage = {"unavailable": 0, "not_recorded": 0, "gesture": 0, "frozen_host": 0, "kinds": set(), "selections": 0,
                "interrupted": 0}
    for composed in composed_records.values():
        original = composed.get("inkOriginal")
        if original is None:
            coverage["not_recorded"] += 1
        elif original["status"] == "unavailable" and original.get("problem"):
            coverage["unavailable"] += 1
        elif original["status"] == "retained":
            coverage["gesture"] += original.get("pendingGesture") is True
            coverage["frozen_host"] += original.get("frozenHost") is not None
            _, document = verified_document(session_dir, original)
            if document is not None:
                coverage["kinds"] |= {operation["kind"] for operation in document["operations"]}
                coverage["selections"] += len(document["selections"])
                coverage["interrupted"] += sum(1 for stroke in document["strokes"] if stroke.get("interrupted") is True)
    return coverage


def ink_original_evidence(composed_records, session_dir):
    """One line per distinct retained original: its bytes, its whole history, and the frames it serves."""
    lines, by_file = [], {}
    for sequence, composed in sorted(composed_records.items()):
        original = composed.get("inkOriginal") or {}
        if original.get("status") == "retained":
            by_file.setdefault(original["file"], []).append((sequence, original["pairedRevision"], original.get("reused")))
    for name, frames in sorted(by_file.items()):
        sha256 = name.removeprefix("ink-originals/").removesuffix(".json")
        data, document = verified_document(session_dir, {"file": name, "sha256": sha256,
                                                         "byteLength": (session_dir / name).stat().st_size
                                                         if (session_dir / name).is_file() else -1})
        if document is None:
            lines.append(f"INFO {name}: not readable as its recorded bytes; no history is shown")
            continue
        history = ", ".join(f"{o['sequence']}:{o['kind']}@r{o['revision']}"
                            + (f"+{o['added']}" if o["added"] else "") + (f"-{o['removed']}" if o["removed"] else "")
                            for o in document["operations"])
        lines.append(f"INFO {name}: {len(data)} bytes, SHA-256 {hashlib.sha256(data).hexdigest()}, document revision "
                     f"{document['revision']}, {len(document['strokes'])} strokes, undo {document['undoStack']}, redo "
                     f"{document['redoStack']}, {len(document['selections'])} ASK selections; history [{history}]; frames "
                     + ", ".join(f"{s} (paired r{r}, {'reused' if reused else 'written'})" for s, r, reused in frames))
    return lines


def expected_unrepresented(session_dir, status, kept, outcomes, filters, ended, streams):
    """The unrepresented lines the mapper must report, by category, from the retained files."""
    ending, event = status.get("ending"), (ended[-1]["detail"] if ended else None)
    endings = []
    if ending is not None:
        detail = ending.get("detail")
        endings.append(f"the session ended ({ending['reason']}{': ' + detail if detail is not None else ''}; live claims "
                       f"ended at host {swift_double(ending['liveEndedHost'])} s); no descriptor carries the ending")
    if event is not None:
        endings.append("events.jsonl records an ending (" + pairs(event) + ")"
                       + (" that status.json does not" if ending is None else "") + "; no descriptor carries the ending")
    if ending is None and event is None:
        endings.append("no ending is recorded: the session may still be running or have ended abruptly; no descriptor states either")
    elif event is None:
        endings.append("status.json records an ending that events.jsonl does not; events.jsonl may be incomplete")
    elif ending is not None:
        differing = [name for name, same in (("reason", event.get("reason") == ending["reason"]),
                                             ("detail", event.get("detail") == ending.get("detail")),
                                             ("live_ended_host", event.get("live_ended_host") == swift_double(ending["liveEndedHost"])))
                     if not same]
        if differing:
            endings.append(f"the endings recorded in status.json and events.jsonl disagree on {', '.join(differing)}; "
                           "both are kept above and neither is chosen")
    stream_lines = [f"{e['event']} at host {swift_double(e['host'])} s: {pairs(e.get('detail'))}; not carried by any descriptor"
                    for e in streams]
    filter_lines = ([f"capture_filter: {pairs(filters[-1].get('detail'))}; only the scope text is carried, and it is configured, not verified"]
                    if filters else ["no capture_filter event is recorded (a session from before app exclusion, or incomplete files)"])
    # As the mapper: only single outcomes of kept frames name documents.
    named = {e["composed"]["ink"]["document"]["file"] for sequence, recorded in outcomes.items()
             if sequence in kept and len(recorded) == 1
             for kind, e in recorded if kind == "composed" and e["composed"]["ink"].get("document")}
    folder = session_dir / "ink"
    saved = {f"{status['session']}/ink/{p.name}" for p in folder.iterdir() if p.name.endswith(".json")} if folder.is_dir() else set()
    documents = sorted(named | saved)
    ink_lines = [("no ink document is named or saved in this session" if not documents else "ink documents " + ", ".join(documents))
                 + "; editable strokes, operations, anchors and ASK selections live in ink documents, possibly also in other sessions' "
                 "folders, and a failed save is known only to the app; a descriptor carries at most a document path and a revision, "
                 "which is not an immutable editable original"]
    originals = [composed.get("inkOriginal") for composed in single_composed(outcomes, kept).values()]
    recorded = [original for original in originals if original is not None]

    def count(state):
        return sum(1 for original in recorded if original["status"] == state)
    kept_files = sorted({o["file"] for o in recorded if o["status"] == "retained" and o.get("file") is not None})
    reasons = sorted({o["problem"] for o in recorded if o["status"] == "unavailable" and o.get("problem") is not None})
    other = len(recorded) - count("retained") - count("unavailable") - count("no_document")
    original_lines = [f"ink originals: {count('retained')} composed frames keep one [{', '.join(kept_files)}], "
                      f"{count('unavailable')} unavailable, {count('no_document')} without a document, "
                      f"{len(originals) - len(recorded)} not recorded (unknown, from before ink originals)"
                      + (f", {other} with an unrecognized status" if other > 0 else "")
                      + ("; unavailable because: " + " | ".join(reasons) if reasons else "")
                      + "; a kept original is an exact snapshot of the whole editable document frozen at pairing, possibly newer "
                      "than the frame's paired revision, and it is bound only when the plan supplies an editable_ink binding"]
    composed_by_frame = single_composed(outcomes, kept)
    for sequence in sorted(kept):
        original = (composed_by_frame.get(sequence) or {}).get("inkOriginal")
        if original is None or original["status"] != "retained":
            continue
        frozen = (f"frozen at host {swift_double(original['frozenHost'])} s" if original.get("frozenHost") is not None
                  else "frozen at an unrecorded host time")
        revision, paired = original.get("documentRevision"), original.get("pairedRevision")
        original_lines.append(
            f"ink originals: callback {sequence} keeps {original.get('file') or 'no file'} (document revision "
            f"{'unknown' if revision is None else revision}, paired revision {'unknown' if paired is None else paired}, "
            f"{frozen}, {'reused' if original.get('reused') is True else 'written'}); limits: " + " | ".join(original["limits"]))
    unknown = [s for s in sorted(kept) if s not in outcomes]
    unknown_lines = ([f"callbacks {', '.join(map(str, unknown))} have no recorded composition outcome: unknown, never empty ink"]
                     if unknown else [])
    return {"ending": endings, "stream": stream_lines, "filter": filter_lines, "ink": ink_lines,
            "ink_original": original_lines, "unknown": unknown_lines}


CATEGORIES = {
    "ending": ("the session ended (", "events.jsonl records an ending", "no ending is recorded",
               "status.json records an ending", "the endings recorded in"),
    "stream": ("stream_",),
    "filter": ("capture_filter: ", "no capture_filter event"),
    "ink": ("ink documents ", "no ink document "),
    "ink_original": ("ink originals: ",),
}


def unrepresented_problems(facts, expected):
    """Each category's lines must be exactly the expected ones."""
    problems = []
    for category, lines in expected.items():
        if category == "unknown":
            actual = [f for f in facts if "have no recorded composition outcome" in f]
        else:
            actual = [f for f in facts if f.startswith(CATEGORIES[category])]
        if sorted(actual) != sorted(lines):
            problems.append(f"{category} facts {actual!r} are not {lines!r}")
    return problems


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
        status, kept, outcomes, filters, ended, streams = native_session(session_dir)
        expected_facts = expected_unrepresented(session_dir, status, kept, outcomes, filters, ended, streams)
        composed_records = single_composed(outcomes, kept)
        source = manifest["display_source"]
        validate_display(source)
    except Exception as error:  # Reported, never a silent pass.
        check(False, f"the fixture could be read: {type(error).__name__}: {error}")
        return 1
    seen = {"kinds": set(), "empty": 0, "inked": 0, "no_document": 0, "callback_basis": 0, "reopened": 0,
            "two_references": 0, "refusal": 0, "mutations": 0, "mappings": 0, "fact_controls": 0,
            "ink_retained": 0, "ink_reused": 0, "ink_later": 0, "ink_reopened": 0, "ink_no_document": 0, "ink_controls": 0}
    coverage = ink_original_coverage(composed_records, session_dir)
    for case in manifest["cases"]:
        kind, name = case["type"], case["name"]
        try:
            if kind == "mapping":
                seen["mappings"] += 1
                mapping = case["mapping"]
                check(mapping["refused"] == [], f"mapping {name}: no entry was refused")
                # A retained original's binding, offered to frames without one as a control.
                offered = next((copy.deepcopy(item["ink_original_bindings"]) for item in mapping["described"]
                                if item.get("ink_original_bindings")), None)
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
                        composed = composed_records.get(item["callback_sequence"])
                        problems = ink_original_problems(item, composed, session_dir)
                        check(not problems, f"{label}: its ink original record, retained file, replayed history and "
                                            "editable_ink bindings agree" + ("" if not problems else ": " + "; ".join(problems)))
                        original = (composed or {}).get("inkOriginal") or {}
                        seen["ink_no_document"] += original.get("status") == "no_document"
                        if original.get("status") == "retained":
                            seen["ink_retained"] += 1
                            seen["ink_reused"] += original.get("reused") is True
                            seen["ink_later"] += original["documentRevision"] > original["pairedRevision"]
                            seen["ink_reopened"] += ORIGINAL_REOPENED_LIMIT in original["limits"]
                            for control_label, changed_item, changed, read in ink_original_controls(item, composed, session_dir):
                                seen["ink_controls"] += 1
                                check(bool(ink_original_problems(changed_item, changed, session_dir, read)),
                                      f"{label}: ink original control '{control_label}' is reported")
                        elif offered:
                            seen["ink_controls"] += 1
                            check(bool(ink_original_problems(dict(item, ink_original_bindings=offered), composed, session_dir)),
                                  f"{label}: an editable_ink binding offered without a retained original is reported")
                        for mutation_label, fragment, mutated, mutated_bindings in mutations(frame, bindings):
                            seen["mutations"] += 1
                            check(refused(lambda: validate_binding(batch, record_id, mutated, source, mutated_bindings), fragment),
                                  f"{label}: {mutation_label} is refused ({fragment})")
                    except Exception as error:
                        check(False, f"{label}: {type(error).__name__}: {error}")
                if name == "every_kept_frame":
                    for line in ink_original_evidence(composed_records, session_dir):
                        print(line)
                    sequences = [item["callback_sequence"] for item in mapping["described"]]
                    check(sorted(sequences) == sorted(kept) and len(set(sequences)) == len(sequences),
                          f"mapping {name}: every kept frame is described exactly once")
                    facts = mapping["unrepresented"]
                    problems = unrepresented_problems(facts, expected_facts)
                    check(not problems, f"mapping {name}: unrepresented facts equal those recomputed from the retained files "
                                        "(endings, stream notes, capture filter, ink documents, ink originals, outcome-less callbacks)"
                                        + ("" if not problems else ": " + "; ".join(problems)))
                    # Controls: removing, changing or inventing a recomputed fact must be reported.
                    for category, lines in expected_facts.items():
                        for line in lines:
                            seen["fact_controls"] += 2
                            check(bool(unrepresented_problems([f for f in facts if f != line], expected_facts)),
                                  f"mapping {name}: removing the {category} fact {line[:60]!r}... is reported")
                            check(bool(unrepresented_problems([f + " (changed)" if f == line else f for f in facts], expected_facts)),
                                  f"mapping {name}: changing the {category} fact {line[:60]!r}... is reported")
                    seen["fact_controls"] += 1
                    check(bool(unrepresented_problems(facts + ["ink documents invented/ink/ink.json; not an immutable editable original"],
                                                      expected_facts)),
                          f"mapping {name}: an invented ink-document fact is reported")
                    seen["fact_controls"] += 1
                    check(bool(unrepresented_problems(facts + ["ink originals: 0 composed frames keep one []"], expected_facts)),
                          f"mapping {name}: an invented ink-original fact is reported")
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
          and seen["two_references"] >= 1 and seen["refusal"] >= 20 and seen["mutations"] >= 40 and seen["fact_controls"] >= 12
          and seen["ink_retained"] >= 2 and seen["ink_reused"] >= 1 and seen["ink_later"] >= 1 and seen["ink_reopened"] >= 1
          and seen["ink_no_document"] >= 1 and seen["ink_controls"] >= 20
          and coverage["unavailable"] >= 1 and coverage["not_recorded"] >= 1 and coverage["gesture"] >= 1
          and coverage["frozen_host"] >= 1 and coverage["selections"] >= 1 and coverage["interrupted"] >= 1
          and {"stroke", "erase", "undo", "redo", "ask_finished", "ask_cancelled", "input_closed", "reopened"} <= coverage["kinds"],
          "the fixture set is not vacuous (every outcome kind, aliases with one and two references, no document, "
          "callback pairing, a reopened revision; retained, reused, later-revision, reopened, pending-gesture, unavailable, "
          "not-recorded and no-document ink originals; retained histories with write, erase, undo, redo, ASK finish and "
          "cancel, an interrupted stroke at Stop and a reopening; refusals, mutations, controls) "
          + json.dumps({k: v for k, v in seen.items() if k != "kinds"})
          + " " + json.dumps({k: (sorted(v) if isinstance(v, set) else v) for k, v in coverage.items()}))
    if failures:
        print(f"{len(failures)} Mac retained-frame fixture check(s) failed")
        return 1
    print("all Mac retained-frame fixture checks passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
