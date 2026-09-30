# Opt-in macOS HTTP, archive and Learning integration

Lead assignment `handoff_dbc804f3772e4871e16cebf47b92fa6f`, existing P0-09/P0-08.
Released baseline `8e2094ee8cd2d99f58a5ed27159c724b07fb103b` was merged normally
into `team/backend` as `ee34bf721188e4233567e27a3633e05ff0762678`.
Candidate/release label conflicts in five contract files were resolved to the
exact assigned Lead revision; this delivery changes only Backend-owned paths.
The affected requirements/decisions remain unchanged from the preceding refresh
recorded in [the contract evidence](macos-ingress-contract.md): R03/R35/R36/R46/
R51/R52/R59, A12/A14/A30/A31/A44 and source/time/archive fidelity. The released
contract and actual storage/HTTP/reader/Learning call paths were read again.

## Observable result and design

Explicit `enable_macos_ingress=True` on the existing ingress/composed/runtime
factories makes `POST /v2/process/macos-frames:batch` callable under trusted
current authentication, scopes, capability and pixel-producer admission.
Defaults remain off. The 0.2.12 HTTP envelope carries unchanged 0.2.0 Process
records and exact 0.2.11 Mac retained descriptors; ACKs remain 0.2.0.

Actual retained Swift-generated **synthetic PNG bytes** go through the existing
original upload path, authenticated ASGI HTTP, archive transaction,
`read_macos`, `resolve_macos(..., image_role=...)`, and released Learning context
composition from `0599a97`. Tests compare bytes and full stored metadata, not a
fabricated ACK. The seven native descriptor fixtures contain six composed
outcomes and one refusal. Synthetic unknown/gap cases are labeled as such;
separate editable-ink bytes are a synthetic test original, not a verified native
document save. The existing audited fixture is read without copying its PNGs.

The existing actor transaction checks source/incarnation, every exact typed
original (including separate ink), ancestors, slots and lost witnesses before
committing records, descriptors, pins, the whole ordered HTTP fingerprint and
ACK together. Internal replay retains its independent namespace. Cross-batch
Mac archive IDs, hash facts and native-session/file facts cannot contradict
retained metadata. Current fences and original integrity precede cached success;
late authorization, cancellation and transaction failure cannot publish a
partial ACK. Stop permits only already sealed historical boundaries and cannot
restart capture. Deletion preserves existing exact erasure/tombstone semantics.
Mac frames and valid first-gap receipts witness pixel-producer use after marker
loss, including retries through older routes.

Mac and Windows share an immutable document kind but dispatch by exact released
version. Metadata readers preserve full frames, source context, ink references,
gaps and unknown chronology. Resolvers recheck the complete original bindings
before returning either role, and return selected bytes with the full descriptor
and explicit role. Refused/unknown composition never falls back to raw as though
composition succeeded. Learning validates PNG decoding/dimensions, applies its
existing image budgets and re-reads the authorized selection before publication.
No model, provider, disclosure grant or presentation is invoked.

PONYTAIL LITE: reuse the existing transaction, identity, archive and factory
paths. No new persistence model, cache, index, migration, dependency or shared
contract change. The necessary cross-batch consistency check scans this actor's
retained frame metadata per reader/resolver call; this cost is separate from
returned metadata limits. No performance benchmark or quota saving is claimed.

## Verification

All checks use the existing repository virtual environment without installation.
The final focused Mac suite passes **382 tests in 18.05 s** after all worker
changes, using:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_macos*.py
```

It covers exact source/bindings and PNG bytes, all seven audited native
descriptors, aliases/refusal/unknown/gaps, ordered replay and cross-batch image
facts, source/ancestor/slot/receipt loss, pixel-profile loss across old entrypoints,
Stop/history/deletion/revocation, current and final authorization, cancellation
and transaction rollback, strict transport/error precedence, runtime authority,
metadata/image budgets, and actual HTTP-to-Learning final re-read behavior.

The changed shared engine, old route dispatch, readers, runtime defaults and
deletion compatibility pass **1,821 tests in 93.64 s** with this exact command:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_capture.py services/api/tests/test_capture_frames.py services/api/tests/test_capture_replay_presence.py services/api/tests/test_capture_replay_witness.py services/api/tests/test_frame_tombstone_presence.py services/api/tests/test_producer_admission.py services/api/tests/test_raw_frame_ingress.py services/api/tests/test_raw_frame_storage.py services/api/tests/test_raw_replay_integrity.py services/api/tests/test_raw_frame_readers.py services/api/tests/test_raw_ingress_http.py services/api/tests/test_raw_ingress_http_limits.py services/api/tests/test_desktop_frame_ingress.py services/api/tests/test_desktop_frame_readers.py services/api/tests/test_desktop_gaps.py services/api/tests/test_desktop_ingress_http.py services/api/tests/test_desktop_capture_runtime.py services/api/tests/test_windows_frame_ingress.py services/api/tests/test_windows_frame_lifecycle.py services/api/tests/test_windows_frame_readers.py services/api/tests/test_windows_identity_readers.py services/api/tests/test_windows_image_identity.py services/api/tests/test_windows_ingress_http.py services/api/tests/test_windows_ingress_transport.py services/api/tests/test_windows_capture_runtime.py services/api/tests/test_windows_http_learning.py services/api/tests/test_capture_app.py services/api/tests/test_capture_app_dispatch.py services/api/tests/test_capture_runtime.py services/api/tests/test_ingress_mounts.py services/api/tests/test_ingress_http.py services/api/tests/test_image_resolver.py services/api/tests/test_process_context_reader.py services/api/tests/test_source_deletion.py services/api/tests/test_original_artifact_capture.py services/api/tests/test_preview_local.py
```

Parallel worker subset results overlap these final runs and are not added to
their totals. A separate read-only transaction/identity review found no blocker.
Root reviewed the HTTP, reader/resolver and shared-engine production changes.
`git diff --check` passes; all 17 changed Python files parse successfully without
writing bytecode. The two final suites contain 2,203 passing checks in total.

An actual implementation issue found during review was combined OpenAPI name
collision: older desktop 0.2.7 and retained Mac 0.2.11 use `MacDisplayAtStart` and
`MacHostClock` with different shapes. Only the composed OpenAPI names/references
for new Mac definitions are renamed to `MacRetainedDisplayAtStart` and
`MacRetainedHostClock`; old definitions and both wire contracts stay unchanged.
A focused assertion checks every released Mac definition in the combined schema,
and all sixteen combinations of the four independent flags are exercised.
One initial synthetic unknown-outcome fixture lacked its required reason and
was rejected; it was corrected to `no_retained_outcome` without weakening schema
or production assertions. Failed initial invocations are not counted as passed.

## Limits and next owner

These are foreground in-process HTTP/MemoryStore checks, not TCP/native upload
or new PostgreSQL acceptance. The existing storage implementation and migration
remain unchanged, so the previously completed dedicated PostgreSQL campaign was
not repeated. No user preview, Paperclip, listener, account, provider or paid
operation was used. Current trust is supplied by test/embedding authentication;
native login/permission bootstrap is not established here.

Lead next integrates this commit with the native owner's separate mapper and
assigns independent focused acceptance. Native session events, filter/geometry,
input/ASK and complete editable history still require their original records and
mapping evidence. Interactive Mac permissions, live full-display capture,
actual AI receipt, native editable save/reopen, audio and Notability import remain
unverified. Neither desktop §7.1 gate nor P1/full-product acceptance is claimed.

Rollback is the explicit feature flag off, preserving archive originals, receipt
identities and tombstones. See [API operation notes](../../../services/api/README.md)
for the trusted integration seams and unchanged authorization boundaries.
