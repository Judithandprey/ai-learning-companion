#!/usr/bin/env python3
"""Validate the Swift-made subscription ASK requests with the released request validator.

    python apps/macos/CompanionDesktop/checks/validate_ask_request.py ASK_FIXTURE_DIR [RESULTS_FILE]

The fixture comes from `swift test` with COMPANION_DESKTOP_ASK_FIXTURE_DIR set to a new directory:
AskLinkTests.testAskRequestsForTheReleasedValidator writes `ask-start.jsonl`, one `ask/start` line
per synthetic selection exactly as the app would send it to the connector (ADR 0003, private
envelope lc-subscription-ask/1). Run in the repository's pinned environment.

Checked for every line:
- the envelope: exactly version, id, method and params, and params exactly request and model;
- `services.learning.subscription_ask.prepare_subscription_ask`, the validator the connector runs
  before anything is sent: identifiers, the question, the PNG (8-bit RGB/RGBA, its hash and size),
  the display, and the region's pixels recomputed from its points;
- the returned provenance is the request without the image bytes, and the image bytes are the PNG;
- `bind_subscription_response` accepts a synthetic completed answer for it.
Negative controls change one fact each and must be refused.

With RESULTS_FILE, the bound synthetic results are written there, one JSON line per request, so
the app's own answer check can be run against what the released code returns.

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

from services.learning.subscription_ask import bind_subscription_response, prepare_subscription_ask  # noqa: E402

VERSION = "lc-subscription-ask/1"


def _pairs(pairs):
    keys = [key for key, _ in pairs]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate key")
    return dict(pairs)


def refused(request):
    """True only when the released validator refuses the request."""
    try:
        prepare_subscription_ask(request)
    except ValueError as error:
        return bool(str(error))
    return False


def changed(request, change):
    value = copy.deepcopy(request)
    change(value)
    return value


def main(argv):
    if len(argv) not in (2, 3):
        print(__doc__)
        return 2
    lines = (Path(argv[1]) / "ask-start.jsonl").read_bytes().split(b"\n")
    if lines[-1] != b"" or len(lines) < 2:
        print("FAIL: ask-start.jsonl is not newline-terminated lines")
        return 1
    problems, checks, results = [], 0, []
    for number, line in enumerate(lines[:-1], 1):
        def check(condition, text):
            nonlocal checks
            checks += 1
            if not condition:
                problems.append(f"line {number}: {text}")

        envelope = json.loads(line.decode("utf-8"), object_pairs_hook=_pairs)
        check(set(envelope) == {"version", "id", "method", "params"}, "the envelope is not exactly version, id, method, params")
        check(envelope.get("version") == VERSION and envelope.get("method") == "ask/start", "not an ask/start of " + VERSION)
        params = envelope.get("params")
        check(type(params) is dict and set(params) == {"request", "model"}, "params is not exactly request and model")
        request = params["request"]
        try:
            prepared = prepare_subscription_ask(request)
        except ValueError as error:
            check(False, f"refused by the released validator: {error}")
            continue
        check(True, "accepted")
        expected = changed(request, lambda value: value["image"].pop("png_base64"))
        check(prepared["provenance"] == expected, "the provenance is not the request without the image bytes")
        png = base64.b64decode(request["image"]["png_base64"], validate=True)
        check(prepared["image_bytes"] == png and hashlib.sha256(png).hexdigest() == request["image"]["sha256"],
              "the image bytes are not the PNG named by its hash")
        check(type(request["context"]["display"]["id"]) is str, "the display is not named by a text identifier")
        result = bind_subscription_response(prepared, "Synthetic answer.", model=params["model"], auth_mode="chatgpt",
                                            latency_ms=1234, thread_id="synthetic-thread", turn_id="synthetic-turn")
        check(result["provenance"] == expected and result["request_id"] == request["request_id"], "the bound result is another request's")
        results.append(result)

        controls = {
            "a numeric display id": lambda v: v["context"]["display"].__setitem__("id", 7),
            "a region one pixel to the right": lambda v: v["context"]["region_px"].__setitem__("x", v["context"]["region_px"]["x"] + 1),
            "a region one pixel wider": lambda v: v["context"]["region_px"].__setitem__("width", v["context"]["region_px"]["width"] + 1),
            "another image hash": lambda v: v["image"].__setitem__("sha256", "0" * 64),
            "another image width": lambda v: v["image"].__setitem__("width", v["image"]["width"] + 1),
            "an empty question": lambda v: v.__setitem__("question", "  "),
            "an unknown help level": lambda v: v.__setitem__("assistance", "answer"),
            "a missing null": lambda v: v["context"].pop("media_position"),
            "an ink hash without its revision": lambda v: v["context"].update(ink_revision=None, ink_sha256="1" * 64),
            "a region past the display": lambda v: v["context"]["region_dip"].__setitem__(
                "width", v["context"]["display"]["bounds"]["width"] + 1),
        }
        for name, change in controls.items():
            check(refused(changed(request, change)), f"control not refused: {name}")

    if len(argv) == 3:
        Path(argv[2]).write_text("".join(json.dumps(result, sort_keys=True) + "\n" for result in results), encoding="utf-8")
    if problems:
        print("FAIL")
        for problem in problems:
            print(" -", problem)
        return 1
    print(f"PASS: {len(lines) - 1} ask/start requests, {checks} checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
