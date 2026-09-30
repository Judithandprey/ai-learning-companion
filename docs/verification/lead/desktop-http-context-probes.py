"""Actual opt-in ASGI desktop HTTP to stored Learning context, synthetic inputs.

No service/listener, database, desktop producer or model is started.
"""
from copy import deepcopy
import json
from pathlib import Path
import sys

sys.path.insert(0, sys.argv[1] if len(sys.argv) == 2 else str(Path(__file__).resolve().parents[3]))
from services.api.errors import DomainError
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_desktop_frame_ingress import desktop_setup, raw_setup
from services.api.tests.test_desktop_ingress_http import (
    app, desktop_gap_http, gap, setup, registered, uploaded, submit, success,
)
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.learning.process_context import prepare_observation_window


def context(c, ids, resolve=None):
    return prepare_observation_window(ids, reader(c).read_desktop,
        resolver(c).resolve_desktop if resolve is None else resolve, user_id=USER)


def no_pixels(*args, **kwargs):
    raise AssertionError("A frameless gap attempted image resolution")


# Before any original upload, actual HTTP coverage survives exact stored reads.
for coverage in ("unknown", "partial", "unobserved"):
    c = desktop_gap_http.__wrapped__(registered.__wrapped__(setup.__wrapped__()))
    original_gap = c.desktop_envelope["batch"]["records"][0]
    original_gap["evidence"]["coverage"] = coverage
    originals = {k: v for k, v in documents(c).items() if k[0] in {"artifact", "raw_capture_frame"}}
    ack = success(c, submit(c))
    assert ack["acknowledged"][0]["artifacts"] == []
    before = documents(c)
    packet = context(c, [original_gap["record_id"]], no_pixels)
    assert len(packet["items"]) == 1
    item = packet["items"][0]
    assert item["record"] == original_gap and item["source"] == c.descriptor
    assert item["frame"] is None and item["image"] == {"status": "missing_frame"}
    assert packet["attached_bytes"] == 0 and packet["provider_receipt"] == "not_attested"
    assert packet["presentation_permission"] == "not_granted" and documents(c) == before
    assert {k: v for k, v in before.items() if k[0] in {"artifact", "raw_capture_frame"}} == originals
    assert ("artifact", c.ref["artifact_id"]) not in before
    assert ("artifact", c.ink_ref["artifact_id"]) not in before
    assert success(c, submit(c)) == ack

# The same archive can later retain actual PNG+ink without filling its earlier gap.
c = desktop_setup.__wrapped__(raw_setup.__wrapped__(uploaded.__wrapped__(c)))
first_gap = deepcopy(original_gap)
record = c.batch["records"][0]
record.update(sequence=2, causal_parents=[first_gap["record_id"]])
last_gap = gap(c, record_id="later-gap", sequence=3, coverage="unobserved", parents=[record["record_id"]])
mixed = {"contract_version": "0.2.8", "batch": {**c.batch, "records": [record, last_gap]},
         "frames": [c.desktop_frame]}
c.desktop_app = app(c)
success(c, submit(c, envelope=mixed, request_key="pixels-and-gap"), mixed)
ids = [first_gap["record_id"], record["record_id"], last_gap["record_id"]]
packet = context(c, ids)
assert [i["record"] for i in packet["items"]] == [first_gap, record, last_gap]
assert [i["image"]["status"] for i in packet["items"]] == ["missing_frame", "attached", "missing_frame"]
assert packet["items"][1]["image"]["data"] == c.data
assert packet["items"][1]["record"]["artifacts"] == [c.ref, c.ink_ref]
assert all(x["retained_image_bytes"] == "unknown" for x in packet["observation_window"]["comparisons"])
assert packet["observation_window"]["capture_chronology"] == "unknown"

# Stop preserves exactly that historical window, while new live submission fails.
apply(c, command(c, "stop"))
assert context(c, ids) == packet
before = documents(c)
assert submit(c, envelope=mixed, request_key="after-stop").status_code == 409
assert documents(c) == before

# Revoking the source withholds the complete selection, including its gap records.
c.archive.revoke_source(USER, c.source["source_id"])
try:
    context(c, ids)
except DomainError as error:
    assert error.status == 403
else:
    raise AssertionError("Revoked window escaped the final reader")
print(json.dumps({"status": "PASS", "groups": 6,
                  "path": "opt-in desktop HTTP / typed PNG+ink upload / retained gaps / Learning",
                  "inputs": "synthetic authority + actual stored project-authored bytes",
                  "native_database_provider": "not_run"}))
