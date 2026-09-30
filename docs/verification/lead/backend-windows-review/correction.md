# Backend Windows R1/L1 correction review — APPROVE

Reviewed exact correction `8084b4200215d9cf0f91fc772e007e5b6d5b1772`, parent `09eb9b558e675abe78f8cbdfd078587caaef6c65`. Review is read-only; candidate exported to `/tmp/backend-windows-correction-c2jble0l`. Backend worktree remains clean; no main/worker files were edited. Reviewed the complete nine-file diff and owner report `docs/verification/backend/windows-image-identity-correction.md`. Applicable workflow/contracts/source/ADR requirements are unchanged from the original bounded review; no shared contract, migration, dependency or wire changes were introduced.

**Recommendation: APPROVE the correction together with the held internal Windows archive delivery. R1 and L1 are closed by actual code and focused independent execution.** This approves the bounded internal archive/read/resolver behavior, not a Windows HTTP handler, DB/device/provider gate or complete product acceptance. Lead still validates the resulting integrated commit. Preserve the prior defect report and original probe source.

## R1: retained and proposed image facts agree

`services/api/frame_variants.py:47` adds one small shared transaction helper. It first traverses this actor's retained raw-frame metadata, strictly dispatches known versions and validates complete Windows descriptors, then compares proposed Windows descriptors. Both raw and composed image roles participate.

- An artifact ID is keyed to the complete image descriptor, so reference, dimensions, pixel hash and native filename cannot vary.
- SHA-256 identifies PNG byte aliases independently of artifact ID or role; byte_length, width, height and pixels_sha256 must agree. The released validator already binds native_file to that digest.
- Composition metadata (ink session/revision/transformation and other context) is deliberately outside image identity. Same bytes may retain distinct composition contexts.
- Retained contradictions produce 503 unavailable. New contradictions produce 409 record_conflict. The helper does not mutate records, frames, originals, aliases, sources or derived data.
- Windows ingest invokes the check inside the actor transaction after current admission and before cached success or any committed frame/record/receipt writes. Historical replay does not bypass it.
- `read_windows` checks retained consistency before final caller reauthorization and detached return. The role-specific resolver checks it after the retained frame/source checks and before publishing selected bytes. Single-record selections cannot hide a contradiction in an unselected retained frame or image role. Existing source, tombstone, original and final-authorization checks remain.
- Known older retained descriptors do not become Windows images. Older ingress/read/resolve APIs remain strict and unchanged. No new recursive process-record/ancestor fetch was introduced; the consistency scan adds retained raw-frame metadata only.

Independently ran the original probe source byte-for-byte under an expected-refusal wrapper. Source SHA-256 remains `d5e893ebca0ed105c182d10b204b275e1e6d4d1323bb15aa38e54e2b6d8683a1`. All four original ordinary-input contradiction cases now raise 409 record_conflict: same artifact and distinct artifact byte alias, each same batch and later append. No conflicting second frame commits.

The correction tests also verify dimensions and both roles, cross-role reuse, valid aliases, cached first/second replay and new appends against contradictory retained metadata, single and combined reader selections, and refusal by both image roles. The independent additional positive control retains identical raw/composed pictures with different ink_session, ink_revision and transformation; each source frame/context stays exact on separate and combined reads, both roles resolve exact PNGs, both ACKs replay unchanged, and no stored document changes during reads/replays.

## L1: marker presence precedes record body access

`CaptureArchive.read_record` now performs current authorization, checks `capture_tombstone is not None`, and only then loads the retained record body. Both empty and populated markers deny with 404 not_found. Revoked callers fail authorization first; tests assert neither tombstone nor body is read before permission and that no body is accessed after a marker. Original marker probe now raises the expected 404. This closes the inherited guarded internal read gap without changing old wire formats or discarding stale originals.

## Independent execution

Existing main .venv; PYTHONDONTWRITEBYTECODE=1, PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; no cache plugin, no installs, DB, services, native input, network or providers.

Exact command from the candidate export:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_windows_image_identity.py services/api/tests/test_windows_identity_readers.py services/api/tests/test_windows_frame_readers.py::test_metadata_checks_identity_once_and_never_decodes_originals test_review_correction.py
```

**75 passed in 5.54s.** These are 44 image-identity cases, 24 reader/marker cases, the changed one-scan metadata case, five unchanged defect probes in expected-refusal wrappers, and one independent composition-context positive control. This run does not repeat the prior 189-test campaign or sum overlapping owner sets.

Runnable independent files:

- `/tmp/backend-windows-correction-c2jble0l/original_defect_probes.py` — original defect source unchanged.
- `/tmp/backend-windows-correction-c2jble0l/test_review_correction.py` — expected-refusal wrapper and new positive control.

`git diff --check 09eb9b5 8084b4200215d9cf0f91fc772e007e5b6d5b1772` passed. Backend git status is clean.

## Stored Backend + Learning composition

After the above exact-candidate checks finished, overlaid only committed `services/learning` and `tests/evals` from main `feafefceac7d9314a291974b57b7e79ac80e71a6` (includes integrated Learning98edf14) into the temp export. Backend and its contracts remain correction8084b420. Copied the existing committed Lead script without changes to `/tmp/backend-windows-correction-stored-composition.py` and ran:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/backend-windows-correction-stored-composition.py /tmp/backend-windows-correction-c2jble0l
```

**Four stored composition groups passed:**

1. Actual MemoryStore archive and typed uploads feed actual Backend reader/resolver and Learning composer: distinct/identical-alias/raw-only/frameless packets retain exact records, byte roles, original ink references and unknown clocks.
2. Old readers reject Windows; actual stored raw 0.2.5 remains consumable; Stop leaves authorized history available without restarting capture.
3. Missing composed original, source deletion/revocation and current token failure withhold complete output.
4. Real final metadata guard rejects revocation after both actual image resolutions. No fabricated partial success or substitute data/resolver result.

Authority, source/device facts and PNGs in that script are explicitly synthetic local fixtures. This is actual component composition using MemoryStore, not a running HTTP handler, PostgreSQL, target Windows device, capture/ink permissions, provider input, audio, Notability or either desktop §7.1 gate.

## Remaining boundary (not a new blocker)

The chosen correction reuses retained metadata rather than adding a mutable identity index. It scans all actor-retained raw descriptors once per Windows ingest/read/resolver call. The returned metadata packet remains bounded, but scan work/memory scales with retained history; separate raw and composed resolutions each scan. An unrelated retained contradiction conservatively withholds Windows output for that actor. The updated evidence explicitly records this changed cost instead of claiming all metadata work remains point reads. This is acceptable for the bounded internal correction; it is not evidence of production-scale latency or bounded historical scan work. Learning validates actual PNG bytes, supported structure and dimensions. Renderer RGBA hashes remain producer declarations; these checks do not establish their decoded-pixel truth. Declaration consistency is a separate invariant.

Next action: Lead integrates held09eb9b5 plus correction8084b420 in order, verifies the integrated hash and records this bounded approval. Any 0.2.10 HTTP adapter remains a later explicitly assigned slice.

## Main integration

Base09eb9b5 and correction8084b42 integrate as `f223d72` / `dea165f`. All
`services/api` files match the corrected owner source exactly. Lead ran the two
identity correction modules, existing independent pixel-admission QA, and Windows
Learning consumer: **152 passed in 6.42s**. The existing stored-composition script
then ran unchanged on main: **4 groups passed** using actual MemoryStore archive,
reader/resolver and Learning. No HTTP/DB/native/provider was activated or tested
by this integration. The original negative report remains history; its R1/L1 HOLD
is closed. Next bounded Backend action is opt-in HTTP0.2.10 with exact ordered
envelope replay and all current fences, at the subsequently pushed baseline.
