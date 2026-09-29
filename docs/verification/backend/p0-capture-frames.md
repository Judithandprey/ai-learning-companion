# Atomic internal frame and process ingestion

2026-09-29 — Backend, existing P0-04/P0-09. Lead assignment
`handoff_c6c8720c6fd4a87d1d5ce92dc95562d4`; released baseline
`0ef6c97931c15b3f4d03ca1ccf4efc414d97df65`, merged normally into
`team/backend` at `97353023da265f2fd7d026b7b5cd7f88eb810496` before this delta.

Relevant requirements remain R07/R29/R30/R35/R36/R51/R52/R58/R59,
A12/A14/A16/A30/A31/A44 and the two independent original-screen gates in
requirements §7.1. Current decisions, affected original/English requirements,
source manifests, task/role guidance and the released
[binding obligations](../lead/capture-frame-binding.md) were checked.
PONYTAIL LITE reuses the existing capture transaction, control resolver, typed
original validator and actor document store. No new archive, dependency, shared
schema, endpoint or migration was introduced.

## Entry and behavior

The explicit internal call is:

```python
ack = registry.ingest_frames(user_id, batch, frames, idempotency_key)
```

`registry` is an authenticated `ControlRegistry` with current scopes,
capabilities and registered-stream membership. `batch` is the released process
batch; `frames` is a nonempty list/tuple of complete v1 Frames whose unique IDs
exactly cover its non-null frame references. Screen images and any additional
editable-ink originals must already have been committed by `OriginalArtifacts`.
Every source/version must already be accessible, ingested and ready with intact
original text/hash. Synthetic sources, synthetic provenance, test-only consent,
missing sources and registered-but-uningested sources are rejected. This entry
does not register a source or authorize a producer.

One actor transaction rechecks current identity, generation, membership, stream
control, source/version, causal ancestors and every typed original's exact bytes
and binding; validates the released `validate_capture_frame` composition; and
immutably writes all frames, process originals, stream slots and replay receipts.
The ACK escapes only after the transaction exits successfully. The default
control-backed artifact gate remains disabled and fixture import remains
synthetic-only. Existing unassociated v1 paths remain in place.

Replay binds the whole batch and the complete frame map; only frame-list order is
irrelevant. A changed body/frame conflicts. Replays recheck current authority and
originals, including stored causal ancestors; missing/corrupt originals cannot be
recreated from a retry. A new request ID/record/sequence cannot restore a missing
frame still referenced by an earlier committed record. The same immutable frame
may legitimately be referenced by multiple records; neither timestamps nor labels
prove fresh capture.

Capture, observation and receipt times retain their separate fields. Finite
historical backfill after a sealed stop remains historical and does not turn on
live capture. Withdrawal, expired authority, membership/generation changes and
source revocation/deletion deny both new writes and previously successful replay.

Source deletion records ID-only frame tombstones for process references and typed
screen originals. It also fences a referenced frame whose row is already missing;
legacy import cannot reuse that deleted ID. The generic document store supports
this state without a schema migration. This small state addition is necessary:
without it, deletion removes the only row that prevents ID reuse. It retains no
pixels, ink, source text or frame metadata. Rollback must preserve these deletion
fences; disabling the new entry does not justify removing them.

## Actual operation and checks

The new test fixture explicitly models an already-ingested authorized web source
using test-only transaction setup, with `SYNTHETIC TEST DATA` attribution and a
fixture URL. It does not call or relax production fixture import to admit a real
screen. Its pixels, source, producer facts and editable-ink JSON are synthetic.

The acceptance path commits generated PNG bytes and separate editable-ink bytes
through `OriginalArtifacts.put`, calls the new entry, reads the exact canonical
process record and stored frame, reads identical PNG bytes through
`AuthorizedImageResolver`, and reads the preserved ink bytes. Recreating the
registry over the same MemoryStore returns the same ACK. Source-version history
remains bound after a newer source head is added. No Observation/event is invented
to make Learning's legacy exporter accept a process record.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_capture_frames.py \
  services/api/tests/test_capture.py \
  services/api/tests/test_control.py \
  services/api/tests/test_source_deletion.py \
  packages/contracts/tests/test_capture_frame_binding.py
# 268 passed in 1.86s
git diff --check
# exit 0
```

The new file contributes 103 checks: complete frame/source/artifact bindings,
exact replay and conflicts, all-original validation, current control fences,
bounded historical backfill, deletion and missing-frame non-resurrection,
ancestor validation, unchanged default gates, and rollback after frame/record/
replay writes or commit failure. Transaction counting confirms one actor
transaction. All archive documents are compared before/after negative cases.

Independent read-only review found and reproduced synthetic-source admission,
missing-frame resurrection under a new record/key, and deletion of an already
missing frame without an ID fence. All three were fixed and regression-tested.
Its final 11 independent MemoryStore probes passed, including valid shared-frame
and separately authorized stream reuse, ancestor corruption, stopped historical
backfill and commit failure during new writes/replay. No blocking finding remained.

## Limits and next owner

This is portable internal storage acceptance using MemoryStore, not a fresh
PostgreSQL, process-restart, browser, Simulator, device or provider campaign.
No service, preview/Paperclip runtime, external account or paid model was used.
The existing actor store transaction implementation is reused; this report does
not claim an additional real-database pass for the new entry.

Unknown foreground native-app provenance still awaits the lead-owned additive
source contract. No fabricated HTTP source is used to cover it. Typed metadata and
byte integrity are not image/ink codec verification, real producer authorization,
freshness or AI receipt. Learning's current legacy Observation exporter still
does not export process records; coordinated consumption remains separate.

Lead next reviews/releases this internal entry before any producer/consumer
activation. Continuous whole-display delivery to AI, original-live-screen pen
interaction and AI-visible ink, editable reopening, target devices and actual
Notability import remain independent unpassed product gates.
