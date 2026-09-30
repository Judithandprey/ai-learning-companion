# macOS immutable ink — bounded mapper/checker review

**APPROVE for source integration within this review's scope.** No concrete mapper/checker blocker found. Swift compilation, the declared 47 XCTest executions, and newly emitted fixture parity remain **NOT_RUN** here. The owner's 353 Python simulation checks are not independent Swift execution or device evidence. Storage implementation has a separate reviewer.

Reviewed production `89edd5c499a80ffe7454a0924881eec63e79f195` plus documentation-only `35c75a45b1a29c3e069e061e077b45f820cfee1e`, parent `a84289eb8497a97006e43fcfc953d9229abf51f0`. Exact archive: `/tmp/lc-macos-ink-89`. Applied PONYTAIL LITE and current workflow/requirement refresh for original ink/history/source preservation, unknown observation facts, Stop and independent authority. Shared schemas are unchanged.

## Reviewed behavior

- `MacRetainedEntry.inkOriginal` is optional trusted-host input. `MacRetainedDescriptor.inkOriginalBindings` is separate from image bindings and the unchanged MacRetainedFrame 0.2.11 JSON. The binding uses existing OriginalArtifactBinding 0.2.2, `editable_ink`, `application/json`; no new shared field or acquisition/provider authority is invented.
- Plan-level source and artifact-ID consistency includes the ink binding. A supplied binding requires a retained original, exact media/hash/length, valid archive ID, retained-file-policy read, matching paired document file/created-in session/display, the recorded document revision, and history replay that yields the paired revision's stroke IDs. Unknown/unavailable/no-document outcomes cannot acquire a binding merely from a mutable document path.
- Pairing snapshots are Swift value documents. Paired revision and snapshot revision stay distinct. Operation history replay retains creation order after stroke/erase/undo/redo changes; reopening leaves earlier commit clocks unknown. Pending gesture/ASK state, later snapshot operations, freeze time and unavailable reasons stay native and reported, without becoming capture UTC, a Process clock or structured external-app history.
- The new checker reads exact immutable bytes and existing binding contracts, checks source/paired-document/revision/history and flags/limitations, and recomputes the summary plus per-frame unrepresented facts. Its new non-vacuity conditions require retained/reused/later/reopened/pending-gesture/unavailable/legacy/no-document cases, selections/interrupted strokes, and relevant operation kinds. The nine new Swift refusal cases assert reason fragments. This is fixture validation; it is not general authentication or native input acceptance.
- Source tracing of the emitted fixture supports expected binding counts `[0,1,1,0,0,1,0,0]`, paired revisions `[null,0,1,2,2,6]`, first snapshot r6 versus paired r0/r1, reopened snapshot r6 with pending gesture, and the later saved mutable r7. Frame 4 is explicitly rewritten as a legacy outcome; frame 5 intentionally lacks its frozen document; neither is disguised as a retained original. These expected values must still be confirmed by actual Swift execution.

## Executed checks

```sh
cd /home/agentsdock/Projects/learning-companion/repo
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python /tmp/macos-ink-89-mapper-probes.py
```

**Five focused groups passed, exit 0.** The probe imports the exact candidate's checker. It uses immutable document bytes from audited hosted run 36752548728, but creates its new association/binding in Python under `/tmp`. It explicitly does **not** masquerade as the new Swift fixture.

1. Positive existing-wire seam: exact bytes and paired history accepted; existing 0.2.2 binding validates; unchanged 0.2.11 binding validation accepts its additional editable-original reference in the same Process record.
2. All **11 applicable candidate ink negative controls** reject with independently checked reason fragments, including readdressed history tampering. This is stronger than merely checking any exception.
3. Independent foreign source, other document path/session and negative paired revision fail; a byte changed in the actual temporary file fails the recorded hash/length check.
4. Legacy-unknown, unavailable and no-document states accept no binding, and each refuses an offered editable binding (six state checks).
5. Recomputed summary/per-frame facts accept their baseline, then reject five remove/change/invent variants. Old audited coverage reports six not-recorded originals and zero new gesture/freeze/selection/interrupted evidence; the new global non-vacuity requirements cannot pass from that old fixture alone.

Actual output: `/tmp/macos-ink-89-mapper-probes.log`; detailed controls and input hashes: `/tmp/macos-ink-89-mapper-probes.json`. No full checker/simulation campaign was repeated. Static enumeration confirms **47 declared Swift test methods**, not 47 executed passes.

## Remaining integration dependencies

- Root must compile/run the exact integrated Swift source and run its checker on newly generated output; string parity, especially `frozenHost` formatting, remains conditional until that run. Expected native refusal receipts rise from 42 to 51; six test files include `InkOriginalTests.swift`. The old fixture must not substitute for this new output.
- Existing `scripts/desktop-checks.sh` already exports `COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR`, invokes the owner checker, and recursively hashes the complete retained fixture tree, including new `ink-originals` files. Root owns count/evidence pin updates.
- Existing `docs/verification/lead/macos-retained-hosted/composition.py:118–142` consumes image `bindings` only and explicitly reports editable-original ingress `not_attested` at line 245. A future bounded adaptation must include `ink_original_bindings` and their verified native files in the same selected Process records and original uploads before claiming new ink HTTP/storage/Learning composition. No mapper/schema change is needed for that preparation.
- Revision/freeze/limit associations remain native/unrepresented rather than a released frame-to-ink relation. The host must preserve them and must not infer shared-schema certification from a generic JSON original binding. Real Mac rendering/pen, provider input, source authority, native editable reopen and full R59/A44/A46 acceptance remain separate evidence gates.

No repository/worker edits, shared-schema changes, Swift/native execution, listener, database, provider or device use. Old evidence is preserved; no new task was dispatched.
