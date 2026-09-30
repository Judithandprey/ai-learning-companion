# Windows 0.2.9 internal archive and authorized reads

Existing P0-04/09 assignment `handoff_389c63debe3a51c58246d6d8d798fe60` on
released baseline `d3b4b4779e6bceb7aca0ee0df4c544a22132d61e`. The normal merge
is `dd1211e03b876b1804c63730386c1469cbc6f017`; its sole contract README conflict
was resolved byte-for-byte to the lead's released baseline. This delivery changes
only backend service/tests and this evidence, with no shared contract changes.

This supports source/original retention, honest capture gaps and lifecycle in
R02/R27–30/R35–36/R46/R51–52/R59 and A10–12/A17–18/A27/A44–46. It does not
complete those product acceptance cases. Applicable current decisions, workflow,
source/English clauses, release review and complete package README were refreshed.
PONYTAIL LITE: extend the existing transaction, store and readers, with two shared
helpers for released frame selection/reference enumeration and binding dispatch.
No new archive, identity, dependency, table, migration or transport.

## Callable outcome

- `ControlRegistry.ingest_windows_frames(user_id, batch, frames, idempotency_key)`
  accepts exact WindowsFrame 0.2.9 and ProcessBatch 0.2.0. The existing trusted
  `desktop_pixels` producer binding is required. A native filename/profile label
  is not a grant. Restricted frameless display coverage records are allowed;
  unknown observations remain unknown and no frame is invented.
- Both distinct image artifacts must exist as typed source/version-bound originals
  with their complete encoded bytes, lengths and SHA-256 verified before any ACK,
  including duplicate and cached success. Shared artifact IDs and byte aliases
  preserve the raw/composed roles. Editable ink remains a separate original.
- All records, immutable frame metadata, slots, reference pins and receipt commit
  in one actor transaction. Internal replay namespace is
  `internal_windows_capture_frames`; complete metadata and batch/record order are
  bound, while supplied frame-list order follows the existing internal map rule.
  This is not an HTTP envelope or transport-order guarantee.
- Current authorization, stream/source controls, cancellation, deletion and
  retained-loss witnesses run before success. Sealed historical upload does not
  restart capture. Historical reading after Stop/withdraw does not restart it;
  source/account revocation and deletion still withhold reads.
- `AuthorizedProcessContextReader.read_windows(record_ids, *, max_metadata_bytes=...)`
  returns the existing exact `{batch, sources, frames}` detached historical packet.
  It uses bounded point reads and checks metadata/bindings without decoding blobs.
- `AuthorizedImageResolver.resolve_windows(frame, *, image_role, max_bytes)` takes
  literal `raw` or `composed`, independently reauthorizes the complete descriptor,
  validates both declared image bindings and decodes only the selected original's
  base64 bytes. Success is exactly `{status: "available", frame, image_role,
  media_type: "image/png", data: bytes}`. Absent composition is `unobservable`;
  raw is never relabeled as composed. Existing missing/revoked/unavailable/byte-limit
  outcomes and cancellation propagation remain in place.

All older writer/reader entrypoints retain their strict versions; known older
retained ancestors remain usable. Unknown variants and cross-namespace frame-ID
conflicts are refused. Migration 0003 already protects `raw_capture_frame` payloads,
the shared legacy/raw frame-ID namespace and deletion tombstones by document kind;
Windows descriptors require no SQL change.

## Independent finding and correction

An independent backend review reproduced an inherited defect: a present empty
`original_artifact_tombstone` or `capture_artifact_tombstone` was treated as absent,
allowing a cached successful receipt. Common ingest/original guards now check
presence (`is not None`), including capture-record markers and related original
read/note/upload checks. New tests cover both images, each artifact marker,
fresh/cached attempts, and current/ancestor record markers without partial writes.

The review also caught a weak test: retrying only the Windows entry did not prove
the gap-only receipt witness. The corrected cases retain a Windows gap, remove both
producer-profile markers and try generic, legacy and raw entrypoints, including
previously successful cached calls. Each is refused before writes/ACK.

## Executed checks

Use `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q`.
These are focused portable tests using MemoryStore and existing in-process HTTP
fixtures. Counts below overlap; they are not a sum of unique tests.

- Final combined Windows ingress/readers/lifecycle run after all changes:
  **189 passed in 6.45s**. The ingress-only author run was **113 passed in 3.71s**.
- Windows readers plus existing desktop/raw/context/image reader regressions:
  **297 passed in 23.11s**.
- Raw/desktop ingress, producer admission and desktop gaps:
  **265 passed in 27.97s**.
- Windows lifecycle, raw storage, typed originals and desktop/raw ingress:
  **291 passed in 26.46s**. After the presence fix, the Windows lifecycle subset
  passed again: **18 passed in 0.67s**.
- After the presence fix: `test_original_artifacts.py`,
  `test_original_artifact_capture.py`, `test_source_deletion.py`,
  `test_frame_tombstone_presence.py`, `test_raw_ingress_http.py`,
  `test_desktop_ingress_http.py`, `test_capture.py`:
  **301 passed in 7.36s**.

Relevant new tests are `services/api/tests/test_windows_frame_{ingress,readers,lifecycle}.py`.
They exercise distinct PNG bytes/ink, shared aliases, exact replay, corrupt/missing/
substituted originals, identity/source conflicts, transaction failure/cancellation,
Stop/revoke/delete, gap-only admission, ancestor integrity and strict old entrypoints.
`git diff --check` also passed.

## Evidence boundaries and next action

No PostgreSQL campaign was rerun: storage primitives and migration are unchanged;
this slice's transaction/failure evidence is explicitly portable, not new real-DB
acceptance. No preview database, identity, listener or desktop process was used.

Encoded byte verification and PNG signature checks do not attest PNG decoding,
declared dimensions, renderer RGBA hashes or actual native composition. Diagnostic
probes confirmed that a rehashed PNG with invalid compressed pixels, or a valid PNG
with inconsistent declared dimensions, remains archivable under the existing byte
contract. Pixel decoding/dimension/RGBA validation belongs to the parallel Learning
consumer; archive `verified` receipts must not be presented as that acceptance.
Similarly, direct privileged mutation of valid MemoryStore internals bypasses the
normal immutable store/SQL fences; no new tamper-evident metadata chain is claimed.

The 32 MiB original-artifact ceiling remains unchanged; over-limit native files
are not resized or truncated. No actual Windows producer, continuous desktop gate,
real provider, native ink, audio or Notability import is accepted by these checks.

Next owner: Lead reviews/integrates this commit, composes the agreed readers with
Learning and schedules focused QA. Lead owns any later explicit HTTP envelope and
activation. The held producer corrections and device/provider acceptance remain
separate work.
