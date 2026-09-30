"""Actual in-process Backend/Learning composition; synthetic authority and PNGs.

Run from repository root after the exact reviewed Backend desktop adapter merge.
No listener, database, native capture or provider is started.
"""
from concurrent.futures import CancelledError
from copy import deepcopy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from services.api.errors import DomainError
from services.api.tests.test_control import USER, apply, command, documents
from services.api.tests.test_desktop_frame_ingress import (
    setup, registered, uploaded, raw_setup, desktop_setup, desktop_ingest, additional,
)
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.learning.process_context import prepare_observation_window


def fixture():
    c = desktop_setup.__wrapped__(raw_setup.__wrapped__(uploaded.__wrapped__(
        registered.__wrapped__(setup.__wrapped__()))))
    desktop_ingest(c)
    second, frame = additional(c, parents=["process-1"])
    desktop_ingest(c, {**c.batch, "records": [second]}, [frame], "second")
    c.selected = ["process-1", second["record_id"]]
    c.expected_records = [deepcopy(c.batch["records"][0]), deepcopy(second)]
    c.expected_frames = [deepcopy(c.desktop_frame), deepcopy(frame)]
    return c


def prepare(c, **kwargs):
    return prepare_observation_window(c.selected, reader(c).read_desktop,
        kwargs.pop("resolve", resolver(c).resolve_desktop), user_id=USER, **kwargs)


def refused(action, error):
    try:
        action()
    except error:
        return
    raise AssertionError("Whole result was not withheld")


c = fixture()
before = documents(c)
packet = prepare(c)
assert [item["record"] for item in packet["items"]] == c.expected_records
assert [item["frame"] for item in packet["items"]] == c.expected_frames
assert all(item["image"]["data"] == c.data for item in packet["items"])
assert all(item["record"]["artifacts"] == [c.ref, c.ink_ref] for item in packet["items"])
assert packet["presentation_permission"] == "not_granted"
assert packet["provider_receipt"] == packet["live_status"] == "not_attested"
window = packet["observation_window"]
assert window["comparisons"][0]["retained_image_bytes"] == "identical"
assert window["comparisons"][0]["clock_readings"] == {"status": "unknown", "reason": "no_process_capture_clock"}
assert window["capture_chronology"] == "unknown" and window["user_reasoning"] == "not_inferred"
assert documents(c) == before

# Stop preserves historical context but grants no renewed observation/help.
apply(c, command(c, "stop"))
assert prepare(c) == packet

# Every byte budget gap remains explicit, with all selected metadata/ink retained.
limited = prepare(c, max_image_bytes=len(c.data) - 1)
assert [item["record"] for item in limited["items"]] == c.expected_records
assert all(item["image"]["status"] == "byte_limit" for item in limited["items"])
assert limited["observation_window"]["comparisons"][0]["retained_image_bytes"] == "unknown"

# Existing original-byte corruption is not repaired, hidden or turned into an image.
c.store._documents[USER][("artifact", c.ref["artifact_id"])]["data_base64"] = "invalid!"
corrupt = prepare(c)
assert all(item["image"]["status"] == "unavailable" for item in corrupt["items"])
assert len(corrupt["items"]) == 2

# Revocation occurring after actual materialization still withholds the whole packet.
c = fixture()
real_resolve = resolver(c).resolve_desktop

def revoked_during_resolve(frame, **kwargs):
    result = real_resolve(frame, **kwargs)
    c.archive.revoke_source(USER, c.source["source_id"])
    return result

refused(lambda: prepare(c, resolve=revoked_during_resolve), DomainError)

# Deleted source and normal Future cancellation also withhold, without recovery writes.
c = fixture()
c.archive.delete_source(USER, c.source["source_id"])
before = documents(c)
refused(lambda: prepare(c), DomainError)
assert documents(c) == before
c = fixture()
before = documents(c)

def cancelled(*args, **kwargs):
    raise CancelledError()

refused(lambda: prepare(c, resolve=cancelled), CancelledError)
assert documents(c) == before
print(json.dumps({"status": "PASS", "integration_groups": 7,
                  "inputs": "synthetic authority + stored project-authored PNG/ink",
                  "path": "typed upload / internal desktop ingest / authorized reads / Learning window",
                  "database_native_provider": "not_run"}))
