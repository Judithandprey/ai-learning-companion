"""Exact archive/gap review probes; MemoryStore only, no listeners/providers."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from copy import deepcopy
import json

from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts
from services.api.storage import _MemoryTransaction
from services.api.tests.test_desktop_frame_ingress import (
    setup, registered, uploaded, raw_setup, desktop_setup, desktop_ingest, additional,
)
from services.api.tests.test_desktop_ingress_http import gap
from services.api.tests.test_raw_frame_ingress import ingest as raw_ingest
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.api.tests.test_control import (
    USER, documents, registration, start, apply, command, stop_fact,
)

results = []

def fixture(*, originals=True):
    c = registered.__wrapped__(setup.__wrapped__())
    if originals:
        return desktop_setup.__wrapped__(raw_setup.__wrapped__(uploaded.__wrapped__(c)))
    # A first gap has no pixel upload to pass through desktop_setup. Its host
    # still binds the exact registered producer explicitly, before any request.
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    return c

def envelope(c, records, frames=(), *, historical=False):
    return {"contract_version": "0.2.8", "batch": {**c.batch, "records": records,
            "delivery_mode": "historical" if historical else "live"}, "frames": list(frames)}

def submit(c, payload, request_key="independent-gap"):
    return c.registry.ingest_desktop_frame_request(USER, payload, request_key)

def refused(c, fn, status):
    before = deepcopy(c.store._documents)
    try:
        fn()
    except DomainError as error:
        assert error.status == status, (error.status, error.code)
    else:
        raise AssertionError("operation unexpectedly succeeded")
    assert c.store._documents == before

# Exact prior reproducer: cached ACK must now be withheld for an empty frame marker.
for family in ("raw", "desktop"):
    c = fixture()
    ingest = raw_ingest if family == "raw" else desktop_ingest
    ingest(c)
    with c.store.transaction(USER) as tx:
        tx.put("frame_tombstone", c.desktop_frame["frame_id"], {})
    refused(c, lambda: ingest(c), 404)
    refused(c, lambda: ingest(c, request_key="fresh-key"), 404)
    image = (resolver(c).resolve_raw(c.raw_frame, max_bytes=len(c.data)) if family == "raw"
             else resolver(c).resolve_desktop(c.desktop_frame, max_bytes=len(c.data)))
    assert image == {"status": "missing"}
results.append("prior_empty_frame_marker_raw_and_desktop_cached_ACK_now_404")

# First unobserved gap commits without originals and reads as historical metadata.
c = fixture(originals=False)
missing = gap(c, coverage="unobserved")
payload = envelope(c, [missing])
before = documents(c)
ack = submit(c, payload)
assert ack["acknowledged"][0]["artifacts"] == []
packet = reader(c).read_desktop([missing["record_id"]])
assert packet["frames"] == [] and packet["batch"]["records"] == [missing]
assert packet["batch"]["delivery_mode"] == "historical"
after = documents(c)
for kind in ("artifact", "raw_capture_frame", "frame"):
    assert {k:v for k,v in before.items() if k[0] == kind} == {k:v for k,v in after.items() if k[0] == kind}
assert submit(c, payload) == ack and documents(c) == after
results.append("first_gap_atomic_metadata_only_and_exact_readback")

# Whole ordered envelope matters independently of the internal unordered frame map.
c = fixture()
child, frame = additional(c)
payload = envelope(c, [c.batch["records"][0], child], [c.desktop_frame, frame])
ack = submit(c, payload, "ordered")
reordered = {**deepcopy(payload), "frames": list(reversed(payload["frames"]))}
refused(c, lambda: submit(c, reordered, "ordered"), 409)
assert submit(c, dict(reversed(list(payload.items()))), "ordered") == ack
assert desktop_ingest(c, payload["batch"], list(reversed(payload["frames"])), "ordered")["acknowledged"]
results.append("ordered_desktop_envelope_distinct_from_internal_frame_map")

# A permitted but wrong-stream source cannot be borrowed by a gap, even after a valid row.
c = fixture(originals=False)
other = registration(c, "other-screen-stream")
start(c, other, producer="other-screen", request_key="other-screen-start")
other_source = c.registry.register_display_source(USER, "other-display-source", other["stream_id"])
valid, wrong = gap(c), gap(c, record_id="wrong-stream-gap", sequence=2)
wrong["source"] = {name: other_source[name] for name in ("user_id", "source_id", "source_version")}
refused(c, lambda: submit(c, envelope(c, [valid, wrong])), 422)
assert ("capture_record", valid["record_id"]) not in documents(c)
results.append("mixed_valid_and_foreign_incarnation_gap_batch_has_no_partial_write")

# Deleting a gap's source preserves the other source's desktop child originals.
c = fixture()
parent = gap(c)
parent_payload = envelope(c, [parent])
submit(c, parent_payload, "gap-parent")
descriptor = c.registry.register_display_source(USER, "child-display", c.batch["stream_id"])
child_source = {name: descriptor[name] for name in ("user_id", "source_id", "source_version")}
originals = OriginalArtifacts(c.store, lambda state: None, display_authority_resolver=c.registry.resolve_capture)
refs = []
for kind, ref, data in (("screen_image", c.ref, c.data), ("editable_ink", c.ink_ref, c.ink_data)):
    new_ref = {**ref, "artifact_id": "child-" + ref["artifact_id"]}
    originals.put(USER, child_source, kind, new_ref, data)
    refs.append(new_ref)
child, frame = additional(c, parents=[parent["record_id"]])
child.update(source=deepcopy(child_source), artifacts=deepcopy(refs))
frame.update(source=deepcopy(child_source), artifact=deepcopy(refs[0]))
child_payload = envelope(c, [child], [frame])
submit(c, child_payload, "cross-source-child")
before = documents(c)
c.archive.delete_source(USER, c.source["source_id"])
after = documents(c)
for identity in [("raw_capture_frame", frame["frame_id"]), ("capture_record", child["record_id"]),
                 *(("artifact", ref["artifact_id"]) for ref in refs)]:
    assert after[identity] == before[identity]
assert reader(c).read_desktop([child["record_id"]])["frames"] == [frame]
assert resolver(c).resolve_desktop(frame, max_bytes=len(c.data))["data"] == c.data
for request_key in ("cross-source-child", "new-child-key"):
    refused(c, lambda: submit(c, child_payload, request_key), 404)
refused(c, lambda: submit(c, parent_payload, "gap-parent"), 404)
results.append("cross_source_gap_parent_deletion_preserves_child_originals_but_fences_replay")

# A Stop boundary including a pre-stop gap allows only historical recovery.
c = fixture(originals=False)
stop_fact(c, 2)
stopped = apply(c, command(c, boundary=2))
payload = envelope(c, [gap(c, sequence=2)], historical=True)
assert submit(c, payload)["acknowledged"][0]["artifacts"] == []
refused(c, lambda: submit(c, envelope(c, [gap(c, sequence=2)]), "live"), 409)
refused(c, lambda: submit(c, envelope(c, [gap(c, record_id="late", sequence=3)], historical=True), "late"), 409)
assert c.registry.read(USER, c.batch["stream_id"]) == stopped
results.append("gap_historical_ceiling_keeps_source_stopped")

# Cancellation at final authorization after the gap replay row is staged rolls back.
c = fixture(originals=False)
payload = envelope(c, [gap(c)])
seen = []
original_put = _MemoryTransaction.put
def watched_put(tx, kind, identifier, value):
    original_put(tx, kind, identifier, value)
    if kind == "capture_replay":
        seen.append(kind)
def guard(state):
    if seen:
        raise asyncio.CancelledError("synthetic final gap guard cancellation")
c.registry.capture.archive.authorization_guard = guard
before = deepcopy(c.store._documents)
_MemoryTransaction.put = watched_put
try:
    try:
        submit(c, payload)
    except asyncio.CancelledError:
        pass
    else:
        raise AssertionError("cancellation swallowed")
finally:
    _MemoryTransaction.put = original_put
assert seen == ["capture_replay"] and c.store._documents == before
results.append("frameless_final_guard_async_cancellation_rolls_back_all_rows")

print(json.dumps({"original_review_candidate": "0e71721cd3a2ba9a4fcc76cbd8dde99be198292c", "passed_groups": results}, indent=2))
