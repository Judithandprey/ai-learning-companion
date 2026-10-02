#!/usr/bin/env python3
"""Validate the Swift-made live companion requests with the released contract and request check.

    python apps/macos/CompanionDesktop/checks/validate_live_session.py LIVE_FIXTURE_DIR [RESULTS_FILE]

The fixture comes from `swift test` with COMPANION_DESKTOP_LIVE_FIXTURE_DIR set to a new directory:
LiveLinkTests.testLiveSessionLinesForTheReleasedValidator writes `live-session.jsonl`, every line of
one synthetic session exactly as the app wrote it to the connector (ADR 0004, private envelope
lc-subscription-live/1). Run in the repository's pinned environment.

Checked:
- every line: `packages.contracts.live_companion.validate_request`, the released contract;
- the Start: the screen only, no microphone and no system audio;
- every turn: `services.learning.live_session.prepare_live_session_context`, the check the connector
  runs before anything is sent (the whole-frame PNG, its hash and size, the focus rectangle); the
  provenance is the turn without the image bytes; `bind_live_session_response` accepts a synthetic
  completed answer for it, and an unattended look gets no presentation permission;
- the session's order, as the connector enforces it: one session and capture, request names never
  reused, picture numbers never going back, and the same number always with the identical image
  and context;
- the focus: a follow-up on the unchanged picture carries exactly the focus of the request that
  made it, and one on a later picture carries none and names the earlier focus as the released
  `carry_focus_into_followup` would;
- an unattended look never asks for help, and a selection alone never asks for more than a hint.
Negative controls change one fact each and must be refused.

With RESULTS_FILE, the bound synthetic results are written there, one JSON line per turn, so the
app's own answer check can be run against what the released code returns.

No connector, Codex, sign-in, model, network or device is involved; every answer text is synthetic.
"""

import base64
import copy
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from packages.contracts.live_companion import validate, validate_request  # noqa: E402
from packages.contracts.live_companion.focus import carry_focus_into_followup  # noqa: E402
from services.learning.live_session import (  # noqa: E402
    authorize_live_presentation, bind_live_session_response, prepare_live_session_context)

VERSION = "lc-subscription-live/1"


def _pairs(pairs):
    keys = [key for key, _ in pairs]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate key")
    return dict(pairs)


def refused(call, *args, **kwargs):
    """True only when the released code refuses."""
    try:
        call(*args, **kwargs)
    except Exception as error:  # ValidationError or ValueError, by the released code's own choice
        return bool(str(error)) or True
    return False


def changed(value, change):
    value = copy.deepcopy(value)
    change(value)
    return value


def without_image(turn):
    return changed(turn, lambda value: value["image"].pop("png_base64"))


def main(argv):
    if len(argv) not in (2, 3):
        print(__doc__)
        return 2
    lines = (Path(argv[1]) / "live-session.jsonl").read_bytes().split(b"\n")
    if lines[-1] != b"" or len(lines) < 2:
        print("FAIL: live-session.jsonl is not newline-terminated lines")
        return 1
    problems, checks, results = [], 0, []
    number = 0

    def check(condition, text):
        nonlocal checks
        checks += 1
        if not condition:
            problems.append(f"line {number}: {text}")

    start, turns, ids, origin = None, [], set(), {}
    kept = named_earlier = 0
    for number, line in enumerate(lines[:-1], 1):
        envelope = json.loads(line.decode("utf-8"), object_pairs_hook=_pairs)
        check(len(line) < 12 * 1024 * 1024, "the line is longer than the interface takes")
        try:
            validate_request(envelope)
        except Exception as error:
            check(False, f"refused by the released contract: {error}")
            continue
        check(envelope["version"] == VERSION, "not a line of " + VERSION)
        check(envelope["id"] not in ids, "an envelope id was used twice")
        ids.add(envelope["id"])
        method, params = envelope["method"], envelope["params"]
        if method == "companion/start":
            check(start is None, "a second Start in one fixture session")
            start = params
            check(params["permissions"] == {"screen": True, "microphone": False, "system_audio": False},
                  "the Start asks for more than the screen")
            check(refused(validate, "Start", changed(params, lambda v: v["policy"].__setitem__("max_submissions", 101))),
                  "control not refused: 101 requests")
            continue
        if method in ("companion/interrupt", "companion/stop"):
            check(start is not None and params["session_id"] == start["session_id"] and params["epoch"] == start["epoch"],
                  "a control of another session")
            continue
        if method != "companion/turn":
            continue
        turn = params
        check(start is not None, "a turn before Start")
        if start is None:
            continue
        check(turn["session_id"] == start["session_id"] and turn["epoch"] == start["epoch"]
              and turn["context"]["capture_session_id"] == start["capture_session_id"], "a turn of another session or capture")
        check(turn["request_id"] not in {earlier["request_id"] for earlier in turns}, "a request name was used twice")
        try:
            prepared = prepare_live_session_context(turn)
        except Exception as error:
            check(False, f"refused by the released request check: {error}")
            continue
        check(True, "accepted")
        provenance = without_image(turn)
        check(prepared["provenance"] == provenance, "the provenance is not the turn without the image bytes")
        png = base64.b64decode(turn["image"]["png_base64"], validate=True)
        check(prepared["image_bytes"] == png and hashlib.sha256(png).hexdigest() == turn["image"]["sha256"],
              "the image bytes are not the PNG named by its hash")
        check(type(turn["context"]["display"]["id"]) is str, "the display is not named by a text identifier")
        check(turn["audio_source"] is None and turn["presentation"] in ("none", "silent"), "audio or speech is claimed")
        observation = turn["trigger"] == "observation"
        check(prepared["response_allowed"] is (not observation), "the permission to respond is not the trigger's")
        if observation:
            check(turn["allowed_assistance"] == "none" and turn["presentation"] == "none" and turn["user_text"] is None
                  and turn["focus"] is None, "an unattended look asks for something")
        if turn["trigger"] == "focus":
            check(turn["user_text"] is None and turn["allowed_assistance"] == "hint" and turn["presentation"] == "silent",
                  "a selection alone asks for more than a small silent hint")

        # The session's order, as the connector enforces it against the last accepted turn.
        if turns:
            last = turns[-1]
            check(turn["context"]["frame_seq"] >= last["context"]["frame_seq"], "the picture number went back")
            check(turn["permission_revision"] >= last["permission_revision"], "the permission revision went back")
        for earlier in turns:
            if earlier["context"]["frame_seq"] == turn["context"]["frame_seq"]:
                check(earlier["context"] == turn["context"] and earlier["image"] == turn["image"],
                      "one picture number with two images or contexts")
        for row in turn["history"]:
            check(row["request_id"] is None or row["request_id"] in {earlier["request_id"] for earlier in turns},
                  "the context names a request that was not sent")

        # The focus across follow-ups, by the released rule.
        card = turn["request_id"].rsplit(".", 1)[0]
        if turn["focus"] is not None and card not in origin:
            origin[card] = provenance
        elif turn["trigger"] == "text_followup" and card in origin:
            earlier = origin[card]
            named = [row for row in turn["history"] if '"historical_focus_reference"' in row["text"]]
            stripped = changed(turn, lambda v: v.__setitem__("history", [row for row in v["history"] if row not in named]))
            if turn["context"]["frame_seq"] == earlier["context"]["frame_seq"]:
                carried = carry_focus_into_followup(changed(stripped, lambda v: v.__setitem__("focus", None)), earlier)
                check(not named and carried == turn, "a follow-up on the unchanged picture does not carry the earlier focus")
                kept += 1
            else:
                carried = carry_focus_into_followup(stripped, earlier)
                check(turn["focus"] is None and len(named) == 1, "a follow-up on a later picture carries a rectangle or no reference")
                if len(named) == 1:
                    named_earlier += 1
                    released = carried["history"][-1]
                    check({k: v for k, v in named[0].items() if k != "text"} == {k: v for k, v in released.items() if k != "text"}
                          and json.loads(named[0]["text"]) == json.loads(released["text"]),
                          "the earlier focus is not named as the released rule names it")
                    check(carried["history"][:-1] == stripped["history"], "the rest of the context differs")

        state = {"active": True, "cancelled": False, "provenance": provenance}
        result = bind_live_session_response(prepared, "Synthetic answer.", current_state=state, model=start["model"],
                                            auth_mode="chatgpt", latency_ms=1234, thread_id="synthetic-thread",
                                            turn_id="synthetic-turn")
        check(result["provenance"] == provenance and result["request_id"] == turn["request_id"], "the bound result is another request's")
        check(refused(authorize_live_presentation, result, current_state=state) is observation,
              "an unattended look may be presented, or a requested answer may not")
        check(refused(bind_live_session_response, prepared, "Synthetic answer.", current_state=changed(
            state, lambda v: v.__setitem__("cancelled", True)), model=start["model"], auth_mode="chatgpt", latency_ms=1,
            thread_id="t", turn_id="t"), "control not refused: a cancelled request's answer")
        results.append(result)

        controls = {
            "a numeric display id": lambda v: v["context"]["display"].__setitem__("id", 7),
            "another image hash": lambda v: v["image"].__setitem__("sha256", "0" * 64),
            "another image width": lambda v: v["image"].__setitem__("width", v["image"]["width"] + 1),
            "a cropped region": lambda v: v["context"]["region_px"].__setitem__("width", v["context"]["region_px"]["width"] - 1),
            "a missing null": lambda v: v["context"].pop("media_position"),
            "an ink hash without its revision": lambda v: v["context"].update(ink_revision=None, ink_sha256="1" * 64),
            "a gap after the picture": lambda v: v["gaps"].append(
                {"from_frame_seq": v["context"]["frame_seq"] + 1, "to_frame_seq": v["context"]["frame_seq"] + 1, "reason": "budget"}),
            "speech without permission": lambda v: v.__setitem__("presentation", "spoken") if v["allowed_assistance"] == "none"
            else v.__setitem__("audio_source", "microphone"),
        }
        if turn["focus"] is not None:
            controls["a focus one pixel to the right"] = lambda v: v["focus"]["region_px"].__setitem__(
                "x", v["focus"]["region_px"]["x"] + 1)
            controls["a focus of another picture"] = lambda v: v["focus"].__setitem__("frame_seq", v["focus"]["frame_seq"] + 1)
            controls["a focus past the display"] = lambda v: v["focus"]["region_dip"].__setitem__(
                "width", v["context"]["display"]["bounds"]["width"] + 1)
        if observation:
            controls["a look that asks for a hint"] = lambda v: v.__setitem__("allowed_assistance", "hint")
        if turn["trigger"] == "focus":
            controls["a selection alone asking for the solution"] = lambda v: v.__setitem__("allowed_assistance", "full_solution")
        if turn["trigger"] == "text_followup":
            controls["a follow-up without words"] = lambda v: v.__setitem__("user_text", "  ")
        for name, change in controls.items():
            check(refused(prepare_live_session_context, changed(turn, change)), f"control not refused: {name}")
        turns.append(turn)

    number = len(lines) - 1
    triggers = [turn["trigger"] for turn in turns]
    check(start is not None and {"observation", "focus", "text_followup"} <= set(triggers) and kept and named_earlier,
          "the fixture does not hold a Start, a look, a focus, a follow-up on the unchanged picture and one on a later picture")
    if len(argv) == 3:
        Path(argv[2]).write_text("".join(json.dumps(result, sort_keys=True) + "\n" for result in results), encoding="utf-8")
    if problems:
        print("FAIL")
        for problem in problems:
            print(" -", problem)
        return 1
    print(f"PASS: {len(lines) - 1} lines, {len(turns)} companion/turn requests ({', '.join(triggers)}); the focus was kept on "
          f"{kept} follow-up(s) and named as an earlier one on {named_earlier}; {checks} checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
