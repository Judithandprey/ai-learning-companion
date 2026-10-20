"""Independent offline probe of Backend 4e840a4's receipt metadata validation and first-cause recording.

Run against a git-archive export of the exact commit: python probe_backend_metadata.py <export root> <legacy.json> <extended.json>.
Pure functions and one in-memory server object without a child process; no Codex, account, network or file write.
"""
import copy
import json
import sys

sys.path.insert(0, sys.argv[1])
from services.worker.connectors import chatgpt_receipts as rc  # noqa: E402
from services.worker.connectors import chatgpt_rpc as rpc  # noqa: E402

IDENTITY = ("format", "codex_executable", "codex_version", "codex_sha256", "explicit_bin_override")
legacy = {k: v for k, v in json.load(open(sys.argv[2])).items() if k not in IDENTITY}
extended = {k: v for k, v in json.load(open(sys.argv[3])).items() if k not in IDENTITY}
DROP = object()


def accepted(value):
    try:
        rc._metadata(value)
        return True
    except rc.ReceiptError:
        return False


def variant(base, **over):
    value = copy.deepcopy(base)
    for key, item in over.items():
        if item is DROP:
            value.pop(key)
        else:
            value[key] = item
    return accepted(value)


MAX = rpc.MAX_TURN_EVENTS ** 2
expect_accept = {
    "legacy fixture": accepted(legacy),
    "extended fixture": accepted(extended),
    "all nullable diagnostics null": variant(extended, failure_code=None, terminal_items_view=None, terminal_error_present=None, answer_selection=None, answer_text_state=None),
    "count at the bound": variant(extended, completed_message_count=MAX, completed_final_answer_count=MAX, completed_commentary_count=0),
}
expect_refuse = {
    "partial extended (no answer_text_state)": variant(extended, answer_text_state=DROP),
    "legacy plus one diagnostic": variant(legacy, failure_code="incomplete_turn"),
    "extended plus an extra key": variant(extended, provider_text="x"),
    "unknown failure code": variant(extended, failure_code="made_up"),
    "failure code as a long string": variant(extended, failure_code="SECRET-MARKER-" + "x" * 5000),
    "items view in another case": variant(extended, terminal_items_view="FULL"),
    "error presence as a string": variant(extended, terminal_error_present="false"),
    "error presence as 0": variant(extended, terminal_error_present=0),
    "bool count": variant(extended, completed_commentary_count=True, completed_message_count=1),
    "fraction count": variant(extended, completed_commentary_count=0.5),
    "negative count": variant(extended, completed_final_answer_count=-1, completed_commentary_count=2),
    "count over the bound": variant(extended, completed_message_count=MAX + 1, completed_final_answer_count=MAX + 1, completed_commentary_count=0),
    "null count": variant(extended, completed_unphased_count=None),
    "string count": variant(extended, completed_commentary_count="1"),
    "phase sum mismatch": variant(extended, completed_message_count=2),
    "selection outside its enum": variant(extended, answer_selection="commentary"),
    "text state outside its enum": variant(extended, answer_text_state="blank"),
}
# Not refused by the writer (cross-field consistency is not part of its contract): recorded as observations.
observed = {
    "selection final_answer with zero final-answer messages": variant(extended, answer_selection="final_answer"),
    "text state nonempty with selection none": variant(extended, answer_text_state="nonempty"),
}

server = object.__new__(rpc.ChatGPTAppServer)
server._receipt = copy.deepcopy(extended) | {"failure_code": None}
server.on_receipt, server._thread_start_count, server._turn_start_count = None, 1, 1
server.finish_request("failed", failure_code="incomplete_turn")
server.finish_request("failed", failure_code="timeout")
first = server._receipt["failure_code"]
server._receipt["failure_code"] = None
server.finish_request("failed", failure_code="not-a-code")
unknown = server._receipt["failure_code"]

result = {
    "source": "4e840a4b82896ded93d7844966bac60beaa47f22",
    "accepted_as_expected": expect_accept,
    "refused_as_expected": {k: not v for k, v in expect_refuse.items()},
    "writer_accepts_cross_field_inconsistency": observed,
    "first_cause_kept": first == "incomplete_turn",
    "unknown_code_recorded_as": unknown,
    "failure_codes": sorted(rpc.FAILURE_CODES),
    "max_completed_count": MAX,
}
result["passed"] = all(expect_accept.values()) and all(result["refused_as_expected"].values()) and result["first_cause_kept"] and unknown == "unavailable"
print(json.dumps(result, indent=2, sort_keys=True))
sys.exit(0 if result["passed"] else 1)
