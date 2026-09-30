# Backend Windows internal archive review — original HOLD, corrected

Candidate: `09eb9b558e675abe78f8cbdfd078587caaef6c65`.

Current disposition: correction8084b42 is approved and integrated asdea165f;
[executed correction review](correction.md) closes R1/L1. The original negative
evidence below is preserved and is not the current blocker status.
Parent: `dd1211e03b876b1804c63730386c1469cbc6f017`.
Released assignment baseline: `d3b4b4779e6bceb7aca0ee0df4c544a22132d61e`.
Read-only candidate export: `/tmp/backend-windows-review-k1kd0vh8`.
Independent reproduction file: `/tmp/backend-windows-review-k1kd0vh8/test_review_independent.py`.

Recommendation: HOLD the internal/shared Windows archive slice before integration. Fix R1 in the existing writer, then rerun its focused regressions and unchanged independent reproductions. The pure 0.2.10 envelope is separately released at e98c12d and does not repair cross-request storage consistency. No HTTP handler was assigned or expected here. L1 is an inherited, separately identified presence-check gap suitable for a narrow same-owner correction while this common guard is being repaired.

## R1 — contradictory full image identity accepted across frames

Priority: high correctness/integrity blocker. No privileged storage mutation, invalid contract object, network, provider or DB is needed.

Locations in candidate:
- `services/api/capture.py:518`: each submitted Windows frame is validated independently; frame-ID uniqueness does not compare image identities across descriptors.
- `services/api/capture.py:735`: the existing artifact pin preserves only ArtifactReference, not Windows width/height/pixels_sha256/native_file identity.
- `packages/contracts/windows_frame/__init__.py:131`: per-frame identities/files maps correctly reject internal contradiction but start afresh for each frame.
- `services/api/process_context.py:263` and `:276`: descriptors are independently validated; original-binding cache preserves references, not cross-frame image facts.

Exact reproduction uses the new delivery's `windows_setup`, `additional`, and `ingest` fixtures/helpers:
1. Build valid second record/frame with `additional(c, parents=['process-1'])` (new record/frame IDs, sequence 2).
2. Keep its complete raw ArtifactReference and native_file exactly equal to the first frame. Change ONLY `frame['raw']['pixels_sha256'] = 'f' * 64`.
3. `windows_frame.validate(frame)` passes because the changed raw PNG and its distinct composed PNG do not alias within that individual frame.
4. Either ingest both frames/records in a single batch, OR ingest the first normally then append the second with a new idempotency key.
5. Both alternatives ACK accepted and verified originals. `read_windows(['process-1', 'windows-record-2'])` returns both mutually contradictory descriptors.
6. `resolve_windows(frame, image_role='raw', max_bytes=len(c.data))` returns available and exactly the same PNG bytes for each conflicting descriptor.

Two more independent cases first upload an exact byte alias with a new artifact_id (`review-windows-alias`), put that reference in the second frame and its record, and retain the same SHA/native_file while changing pixels_sha256. Both single-batch and later-append alternatives are also accepted and readable. Thus comparing only artifact IDs is insufficient; byte/native-file aliases also need consistency.

Observed independent outputs:
- `CONTRADICTION_ACCEPTED same-batch reader=available resolver=available`
- `CONTRADICTION_ACCEPTED separate reader=available resolver=available`
- `BYTE_ALIAS_CONTRADICTION_ACCEPTED same-batch`
- `BYTE_ALIAS_CONTRADICTION_ACCEPTED separate`

The released Windows contract already says one artifact identity cannot describe different originals and the same native PNG cannot carry contradictory image facts. This finding is consistency of declarations, not proof that a declared hash matches decoded pixels. Actual pixel decoding/dimension/RGBA attestation remains Learning's separate responsibility. Accepting the contradiction now creates immutable conflicting originals; rejecting a future HTTP envelope alone would still leave internal ingress and separate requests vulnerable.

Smallest required behavior: inside existing owner transaction, compare every proposed raw/composed full image identity against all images in that batch and applicable already retained Windows identity facts before success replay/commit. Same artifact_id requires the complete image identity to agree; same native-file/content-hash alias requires byte_length/dimensions/pixels_sha256 consistency under different IDs. Reject conflict atomically and preserve existing originals. Retained contradictions encountered on replay/read must fail closed rather than return a valid packet. Keep current version dispatch, source ownership, final authorization and lost-original/tombstone checks; no new HTTP route or generic wire narrowing is needed. Regression matrix should include same batch, subsequent append, alias IDs, both image roles, and retained conflict on replay; unchanged aliases should still deduplicate.

## L1 — inherited single-record read ignores record tombstone

Candidate location: `services/api/capture.py:746–764`; parent `dd1211e` has the same omission. The candidate changes original-artifact marker truthiness here but does not add a capture-record marker check.

Exact reproduction:
1. Normal successful `ingest(c)` using the Windows fixtures.
2. Insert an empty marker in the test MemoryStore: `c.store._documents[USER][('capture_tombstone', 'process-1')] = {}`; retain the existing record.
3. Call `c.registry.capture.read_record(USER, 'process-1')`.
4. Actual: returns the complete retained record, source/artifact references and received_at. Expected presence fence: 404 before record disclosure.

Call path is an existing guarded internal historical API, CaptureArchive.read_record, also used by in-process/API and PostgreSQL restart verification. Repository call-site search found tests/runners, no production HTTP handler directly exposing this method. This is NOT evidence that ordinary atomic delete_source leaves a record behind, or that a public exploit was reproduced. Normal source deletion removes records and revokes the source; these paths pass the new tests. It is evidence that a coexisting authoritative tombstone (for example a stale retained/restore state) is ignored by this internal read boundary. New `AuthorizedProcessContextReader.read_windows` correctly checks `capture_tombstone is not None` and denies this state. New ingestion checks also correctly reject it.

Narrow correction: after current caller authorization and before retrieving the record body, reject any present capture_tombstone with 404 (empty and nonempty). Add focused existing read_record coverage; no new wire or migration required. Do not rewrite/drop originals to repair inconsistent state.

## Positive scope assessment

Read the complete 11-file delivery diff, all three new test modules and evidence, released Windows 0.2.9 package/README, affected current workflow/task/ADR clauses (including ADR 0002 §§3–5) and applicable current source-preservation/desktop decisions. Applied project PONYTAIL LITE: review existing transaction and source store rather than proposing another archive or dependency.

The delivery has appropriate explicit Windows entrypoints; old internal/HTTP versions remain strict. It requires trusted desktop_pixels producer admission, exact stored display/source/stream/incarnation bindings and typed originals for both PNGs. Both original references participate in replay/loss/deletion handling. Raw/composed selection is literal and explicit; absent composed returns unobservable without raw fallback. Metadata reads are bounded, detached and point-read based. Image resolution validates both declared bindings then decodes only the requested original. Final token guards and cancellation handling are retained. Unknown Windows clocks remain unknown. Internal map-order replay is explicitly distinguished from future ordered HTTP semantics. No service, schema, table, migration or HTTP activation was added.

New common `is not None` artifact/record tombstone guards correctly cover the tested current/ancestor ingest and cached-success paths. New reader/resolver empty-marker checks deny either PNG and complete frame. Source deletion includes both Windows image references, preserves unrelated originals and refuses inconsistent cross-source claims atomically. No further concrete production blocker was found in the bounded review.

## Independently executed evidence

In exact candidate temp export, existing main .venv, PYTHONDONTWRITEBYTECODE=1, PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 and `-p no:cacheprovider`:

1. `services/api/tests/test_windows_frame_ingress.py services/api/tests/test_windows_frame_readers.py services/api/tests/test_windows_frame_lifecycle.py`: **189 passed in 6.65s**.
2. First independent probe run: **3 passed in 0.67s**, deliberately asserting observed two contradiction acceptances and inherited tombstone read bypass (these passing probes confirm defects, not desired behavior).
3. Alias follow-up only: **2 passed, 3 deselected in 0.69s**, deliberately asserting both byte-alias contradiction acceptances.
4. `git diff --check dd1211e 09eb9b558e675abe78f8cbdfd078587caaef6c65`: clean. Backend worktree stayed clean. Main/worker files untouched.

Owner overlapping suite counts in the evidence document were read, not independently rerun or summed. All executed checks used MemoryStore and existing in-process test fixtures, never a DB connection/service/native/provider. No PostgreSQL acceptance, real Windows composition, native capture/permissions, model delivery, audio, Notability or §7.1 device gate is claimed. The evidence document accurately separates encoded-byte integrity from PNG decoder attestation and remains useful after the blocker is fixed.
