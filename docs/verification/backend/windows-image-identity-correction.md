# Windows archive R1/L1 correction

Same P0-04/09 assignment, lead message
`handoff_acd2cfa19f40647ec8abbf344fbafe59`, correcting held delivery
`09eb9b558e675abe78f8cbdfd078587caaef6c65`. Read the complete lead review and
original probes at `f46ff8737a8e6cc09fe8577d2a2ef7cd2dfcf7dd` with `git show`;
source requirements, role and workflow were unchanged relative to the held
delivery. Preserved the existing backend branch without merging unrelated work.
No 0.2.10 activation or schema/root/dependency/migration changes.

## Correction and actual boundary

R1 was a normal-input archive invariant failure: individually valid Windows
descriptors could assign different pixel hashes/dimensions to the same original
across frames, including different artifact IDs for the same PNG bytes. This did
not require privileged storage mutation. The new regression failed before the
fix because ingestion did not raise; changing only the HTTP envelope would not
have repaired separate internal requests.

`check_windows_image_consistency` now compares all proposed raw/composed image
descriptors with retained Windows image facts inside the existing actor lock:

- Same artifact ID preserves the complete image descriptor.
- Same PNG SHA-256 preserves byte length, dimensions and declared RGBA hash,
  including distinct artifact IDs and cross-role reuse. The released validator
  already binds the native filename exactly to this PNG hash.
- Existing retained contradictions fail with 503 `unavailable`; new conflicting
  proposals fail with 409 `record_conflict` before any writes or cached ACK.
- Windows metadata and selected-image reads inspect retained facts too, including
  unselected frames and the other image role. They withhold conflicting history.
  Valid aliases remain available; composition context is not image identity.

This checks consistency of declarations, not the truth of the first declared pixel
hash. PNG decoding/dimensions/RGBA attestation still belongs to Learning. It adds
no new persistent index, decoder, archive or version narrowing. Existing byte,
source, identity, lifecycle, final authorization and cancellation checks remain.

L1 was separately inherited: `CaptureArchive.read_record` could disclose a stale
coexisting record despite a capture tombstone. It now checks marker presence
after current authorization and before retrieving the record body. Empty and
nonempty markers produce 404 without changing originals. This was an internal
guarded API finding, not an ordinary deletion failure or reproduced HTTP exploit.

PONYTAIL LITE: reuse retained frame metadata and the current transaction instead
of adding another mutable image-fact store. The cost is one metadata scan of all
actor-retained raw descriptors per Windows ingest/read/resolver call; the helper
validates known Windows descriptors and rejects unknown variants. Selected record
and artifact-binding reads remain point reads; no blob scan or pixel decoding is
added. Scan work/memory grows with this actor's retained metadata and is separate
from the bounded returned packet size. Resolving raw and composed independently
performs two scans. Existing older reader families keep their prior scan behavior.

## Focused execution

All commands use the existing main `.venv/bin/python`, portable MemoryStore and
in-process fixtures. No DB/native/provider campaign or listener was started.

- `pytest -q services/api/tests/test_windows_image_identity.py`:
  **44 passed in 2.66s**. Normal same-batch/append conflicts, both image roles,
  aliases and cross-role reuse; legal aliases; retained-corruption replay/append.
  Before the fix, the first targeted normal-input case failed with
  `DID NOT RAISE` (**1 failed, 20 deselected**, stopping at the first failure).
- `pytest -q services/api/tests/test_windows_identity_readers.py
  services/api/tests/test_windows_frame_readers.py`:
  **82 passed in 4.07s**. Single/combined selections and both image roles refuse
  retained contradictions; valid aliases stay exact; L1 checks authorization and
  denies before body access. New test module after helper reuse:
  **24 passed in 2.02s** (overlapping, not an additional unique-test count).
- `pytest -q services/api/tests/test_windows_frame_ingress.py`:
  **113 passed in 3.70s**, preserving the existing focused Windows ingress cases.
- Existing `test_capture.py` cases `test_exact_ack_readback_and_fresh_service_instance`,
  `test_cross_owner_artifact_and_record_read_do_not_leak`, and
  `test_other_actor_cannot_read_an_existing_owned_original`:
  **3 passed in 0.09s**.
- Unchanged lead probe source was loaded from the exact review commit and called
  through a temporary pytest wrapper expecting the corrected refusal. All four
  original contradictory-ingest probes raised 409 `record_conflict`; the original
  empty-marker read raised 404 `not_found`: **5 passed in 0.43s**.
  Original source SHA-256:
  `d5e893ebca0ed105c182d10b204b275e1e6d4d1323bb15aa38e54e2b6d8683a1`.
  The source assertions deliberately confirmed the old defects; the wrapper
  checks refusal at their original operation without rewriting those probes.
- Independent read-only review of the production diff found no blocking issue;
  it confirmed status/transaction/auth placement and documented the scan cost.
  `git diff --check` passed.

No repeated old broad suite or new PostgreSQL/device/provider acceptance is
claimed. Next owner: Lead reviews the correction, integrates with the held
internal delivery and reruns stored Backend-to-Learning composition before
assigning the opt-in HTTP adapter at its resulting exact baseline.
