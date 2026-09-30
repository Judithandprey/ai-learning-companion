"""Isolated candidate 1c5eea2. Synthetic MemoryStore only."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from contextlib import contextmanager
from copy import deepcopy
import json

from services.api.errors import DomainError
from services.api.storage import _MemoryTransaction
from services.api.tests.test_desktop_frame_ingress import (
    setup, registered, uploaded, raw_setup, desktop_setup, desktop_ingest, additional,
)
from services.api.tests.test_raw_frame_ingress import ingest as raw_ingest
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.api.tests.test_control import documents, USER, apply, command, stop_fact

results = []

def fixture():
    return desktop_setup.__wrapped__(raw_setup.__wrapped__(uploaded.__wrapped__(
        registered.__wrapped__(setup.__wrapped__()))))

def refused(c, fn, statuses):
    before = deepcopy(c.store._documents)
    try:
        fn()
    except DomainError as error:
        assert error.status in statuses, (error.status, error.code)
    else:
        raise AssertionError("operation unexpectedly succeeded")
    assert c.store._documents == before

# Grandparent traversal across both family boundaries, independent reader output.
c = fixture()
desktop_ingest(c)
middle, middle_frame = additional(c, record_id="middle", sequence=2, frame_id="middle-frame",
                                  family="raw", parents=["process-1"])
raw_ingest(c, {**c.batch, "records": [middle]}, [middle_frame], "middle")
child, child_frame = additional(c, record_id="child", sequence=3, frame_id="child-frame",
                                parents=["middle"])
child_batch = {**c.batch, "records": [child]}
ack = desktop_ingest(c, child_batch, [child_frame], "child")
assert desktop_ingest(c, child_batch, [child_frame], "child") == ack
assert reader(c).read_desktop(["child"])["frames"] == [child_frame]
assert resolver(c).resolve_desktop(child_frame, max_bytes=len(c.data))["data"] == c.data
refused(c, lambda: reader(c).read_desktop(["process-1", "middle", "child"]), {503})
results.append("three_generation_desktop_raw_desktop_ancestry_and_selection_boundary")

# Grandparent loss refuses exact and different-key child replay without restoration.
del c.store._documents[USER][("capture_record", "process-1")]
for replay_key in ("child", "child-new-key"):
    refused(c, lambda: desktop_ingest(c, child_batch, [child_frame], replay_key), {503})
assert ("capture_record", "process-1") not in documents(c)
results.append("transitive_lost_record_witness_fences_same_and_new_key_replay")

# Independent producer stop fact fences previously cached live uploads before command ACK.
c = fixture()
desktop_ingest(c)
stop_fact(c, 1)
refused(c, lambda: desktop_ingest(c), {409})
stopped = apply(c, command(c, boundary=1))
historical = {**c.batch, "delivery_mode": "historical"}
ack = desktop_ingest(c, historical, request_key="historical-after-native-stop")
assert ack["acknowledged"][0]["disposition"] == "duplicate"
assert c.registry.read(USER, c.batch["stream_id"]) == stopped
results.append("producer_stop_precedes_server_ACK_then_bounded_historical_duplicate")

# Valid deletion fences dominate matching replay, without inspecting stale blobs.
for kind, field in (("frame_tombstone", "frame_id"), ("capture_tombstone", "record_id")):
    c = fixture()
    desktop_ingest(c)
    identifier = c.desktop_frame["frame_id"] if field == "frame_id" else "process-1"
    with c.store.transaction(USER) as tx:
        tx.put(kind, identifier, {field: identifier})
    refused(c, lambda: desktop_ingest(c), {404})
    refused(c, lambda: reader(c).read_desktop(["process-1"]), {404})
results.append("canonical_frame_and_record_tombstones_dominate_exact_replay")

# Cross-owner descriptor/source data must fail without any partial archive write.
c = fixture()
foreign_frame = deepcopy(c.desktop_frame)
foreign_frame["source"]["user_id"] = "other-user"
refused(c, lambda: desktop_ingest(c, frames=[foreign_frame]), {422})
foreign_batch = deepcopy(c.batch)
foreign_batch["records"][0]["source"]["user_id"] = "other-user"
refused(c, lambda: desktop_ingest(c, foreign_batch, [foreign_frame]), {404})
results.append("foreign_owner_and_source_bindings_are_atomic_refusals")

# Async cancellation at the final ingress authorization check rolls back staged rows.
c = fixture()
seen = []
original_put = _MemoryTransaction.put
def watched_put(tx, kind, identifier, value):
    original_put(tx, kind, identifier, value)
    if kind == "capture_replay":
        seen.append(kind)
def guard(state):
    if seen:
        raise asyncio.CancelledError("synthetic cancellation at final guard")
c.registry.capture.archive.authorization_guard = guard
before = deepcopy(c.store._documents)
_MemoryTransaction.put = watched_put
try:
    try:
        desktop_ingest(c)
    except asyncio.CancelledError:
        pass
    else:
        raise AssertionError("cancellation was swallowed")
finally:
    _MemoryTransaction.put = original_put
assert seen == ["capture_replay"] and c.store._documents == before
results.append("async_cancellation_at_final_ingress_guard_preserves_atomicity")

# Diagnostic only: malformed empty tombstones are not emitted by deletion paths.
diagnostic = []
for family in ("raw", "desktop"):
    c = fixture()
    ingest = raw_ingest if family == "raw" else desktop_ingest
    ingest(c)
    with c.store.transaction(USER) as tx:
        tx.put("frame_tombstone", c.desktop_frame["frame_id"], {})
    result = ingest(c)
    image = (resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) if family == "raw"
             else resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data)))
    diagnostic.append({"family": family, "replay_returned_ack": bool(result.get("acknowledged")),
                       "image_status": image["status"]})

print(json.dumps({"candidate": "1c5eea2f9a8b7801a8391d2689ff7cdf964691e3",
                  "passed_groups": results,
                  "inherited_corrupt_storage_diagnostic": diagnostic}, indent=2))
