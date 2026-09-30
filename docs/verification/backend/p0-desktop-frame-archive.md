# P0-09 internal desktop frame archive

Assigned baseline: `9853901754aff94ccc15bb2cff6fd3938a93a77e`, normally merged
into `team/backend` at `41bf53c`. This implements the Backend continuation in
`docs/verification/lead/desktop-frame-integration.md`; shared contracts, HTTP,
dependency manifests and native apps are unchanged.

## Observable internal outcome

A currently authorized caller can retain a released DesktopFrame 0.2.7 and its
ProcessBatch 0.2.0 against an existing registered display stream, then read the
same metadata and original PNG bytes. The explicit entrypoints are:

```python
registry.ingest_desktop_frames(user_id, batch, frames, idempotency_key)
reader.read_desktop(record_ids, max_metadata_bytes=4 * 1024 * 1024)
resolver.resolve_desktop(frame, max_bytes=32 * 1024 * 1024)
```

The registry is the existing `ControlRegistry`; readers are the existing
`AuthorizedProcessContextReader` and `AuthorizedImageResolver`, constructed with
the store, actor and current caller authorization guard. Caller authentication
and trusted stream registration remain the embedding service's responsibility.
Metadata reads are historical selections, not claims about a currently live view.
Consumers must recheck current access at final use. `read_desktop` selects only
desktop records; a selection containing other frame families fails as a whole,
without dropping records. Stored causal ancestors may belong to another released
family and are validated without rewriting their original descriptor.

The shared raw descriptor/original store, actor transaction, immutable IDs,
source/version references and typed PNG/ink bindings are reused. No table,
migration, parallel archive or identity model is needed: existing raw documents
already store immutable JSON. A small known-version selector is used only for
retained ancestor and deletion checks. Unknown retained variants fail closed;
entrypoints select their own strict contract.

The existing `ingest_raw_frames`, raw 0.2.6 request route, `read_raw` and
`resolve_raw` remain strict 0.2.5 consumers. Legacy frame APIs also remain closed
to desktop descriptors. Desktop retry keys use a separate internal namespace;
the full batch and frame map are fingerprinted. Exact retries return the same
verified receipt only after rechecking current access and retained originals.
Changed keys cannot replace immutable records, frames, references or source
incarnations. Lost records/frames/bindings/pins/bytes retain their existing witness
and tombstone fences. Stop permits only the independently attested historical
boundary and never restarts capture. Revocation and source deletion still apply.

No frame facts are normalized into capture UTC, course position, orientation or
a Process CaptureClock. Native callback ordinals, host/sample facts, exact UInt64
tick strings, geometry and synthetic provenance are preserved. PNG reads validate
the actual stored bytes and full binding; this layer does not decode pixels or
attest that native dimensions match the image. Learning owns pixel decoding.

## Verification

Fixtures use
project-authored PNG and editable-ink bytes uploaded through the existing in-process
ASGI original APIs, synthetic desktop metadata, ControlRegistry and MemoryStore.
They establish actual stored-byte readback in this bounded test path, not native
capture or PostgreSQL acceptance. No listener is started.

Using the existing locked `repo/.venv/bin/python -m pytest -q`:

- `services/api/tests/test_desktop_frame_ingress.py`,
  `services/api/tests/test_desktop_frame_readers.py`:
  **107 passed in 11.51s** in the final joint run (62 ingress, 45 reader cases).
- `services/api/tests/test_raw_frame_ingress.py`, `test_raw_frame_storage.py`,
  `test_raw_ingress_http.py`: **221 passed in 15.32s**.
- `services/api/tests/test_source_deletion.py`, `test_storage.py`, `test_capture.py`,
  `test_control.py`, `test_display_sources.py`, `test_original_artifacts.py`,
  `test_capture_frames.py`, `test_original_artifact_capture.py`:
  **416 passed in 3.06s**.
- `services/api/tests/test_raw_frame_readers.py`, `test_image_resolver.py`,
  `test_process_context_reader.py`, `test_raw_replay_integrity.py`:
  **231 passed in 19.38s**.

The new cases check exact stored PNG/ink and desktop facts, verified-only ACKs,
same/new-key replay, immutable cross-family IDs, old HTTP/internal rejection,
100-frame/4 MiB metadata limits, final-guard/cancellation/commit rollback,
Stop/sealed historical bounds, revocation, tombstones and missing-original
witnesses. Both mixed ancestry directions pass. Deleting a parent source retains
the other source's child descriptor, original PNG/ink and process record, while
both cached and new-key retries through the erased ancestor fail. Reader tests
also cover bounded metadata/bytes, corrupted bindings, whole-selection refusal,
historical access with a current grant and exact lossless tick strings.

Together with 868 existing regression cases, **975 distinct cases passed**.
`git diff --check` passed. A bounded independent static review of
the complete production diff found no blocking regression. It verified strict
input selection versus retained-only dispatch, mixed ancestors/deletion, current
authorization, originals, cancellation and final access checks. Source/English
manifest checks matched all eight recorded file hashes. No shared specification
was changed.

## Remaining integration and acceptance

Lead owns the distinct desktop transport contract/route and actual
Backend-to-Learning composition. Frameless shared-display gaps await that separate
transport decision; no frame is fabricated or reused to conceal a gap. Learning
adopts the new explicit reader/resolver seams separately.

No PostgreSQL campaign was repeated because storage constraints did not change.
No native compiler/capture, physical permissions, real provider, account action,
preview environment or destination import ran. Actual Mac/Windows capture,
continuous whole-visible-display AI receipt, original-screen ink, live freshness,
Notability import and both full-product §7.1 gates remain unverified by this work.
Relevant R07/R27/R29/R30/R35/R36/R46/R51/R52/R58/R59 and
A12/A14/A16/A26/A30/A31/A44 retain their full source/English goals; this component
does not close those end-to-end acceptance cases.
