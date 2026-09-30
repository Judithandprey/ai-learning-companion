# Mac immutable ink storage review — 89edd5c + 35c75a4

**Verdict: APPROVE for the assigned source/storage review.** No blocking overwrite, snapshot aliasing, lifecycle, or original-loss defect was demonstrated in the exact production delta. This is **not** a Swift compilation/test pass or interactive Mac acceptance. The hosted Swift build and actual emitted-fixture checks remain required and separately owned.

## Exact candidate and scope

- Code: `89edd5c499a80ffe7454a0924881eec63e79f195`.
- Parent: `a84289eb8497a97006e43fcfc953d9229abf51f0`.
- Documentation follow-up/tip: `35c75a45b1a29c3e069e061e077b45f820cfee1e`, direct child of the code commit; its `apps/macos` tree is identical.
- Read-only export: `/tmp/macos-ink-89-storage-review-xd371yy7`.
- All 13 exported changed files were compared byte-for-byte with the tip's Git objects. The complete production diff comprises seven files: `ContentView.swift`, `InkController.swift`, `CaptureRecorder.swift`, `CaptureRecords.swift`, `DesktopIngress.swift`, `InkComposition.swift`, and `MacRetainedFrames.swift`, under `apps/macos/CompanionDesktop/Sources`.
- Read the real caller path through `CaptureController`, `CaptureRun`, `InkSession`, `InkStore`, and `UnsavedInk`; read the new `InkOriginalTests.swift` assertions without executing them. Mapper/checker acceptance remains the other reviewer's scope.
- Applied project PONYTAIL LITE: reused existing value-document, serial recorder, and retained-file policy; no new framework or storage redesign proposed. Refreshed affected R07/R08/R29/R30/R46/R51/R52/R59, §7.1/7.2/7.4/7.5, relevant A27/A30/A31/A44/A46 and current decisions. All eight current source/English manifest hashes match the exported files.

## Findings

1. **Freezing and identity are coherent in the actual app path.** `InkController.swift:132–144` updates the current span and freezes on the main actor. `InkComposition.swift:239–263` chooses the span at the pixel/callback time, copies its value document and derived stroke array, and sets pending flags only for an open span. `InkDocument` and its nested retained records are value types (`Ink.swift:163–199`); `CaptureRun.swift:81–86` captures the request for the recorder's serial queue. Subsequent live mutations therefore do not reach that request. `CaptureRecorder.swift:353–365` checks created-in session, display, paired revision/stroke IDs and encodability before creating an originals folder. This is an internal producer path, not a promise to validate arbitrary forged public `CompositionRequest` values.

2. **History and timing are retained without falsely identifying the whole snapshot with the earlier pixels.** Whole-document encoding preserves strokes (including erased/undone originals), operations, undo/redo stacks, selections, anchors and original session identity. The record separately names paired and snapshot revisions and freeze time (`CaptureRecorder.swift:339–346`). `InkComposition.swift:182–198` explicitly labels later committed operations, pending stroke/ASK input absent from the snapshot, and prior reopening clocks. The actual render still uses the paired revision's strokes. Unknown frame time, changed geometry and unavailable revision continue through existing limitations/refusals.

3. **Writes do not intentionally overwrite retained originals.** `CaptureRecorder.swift:366–397` addresses exact encoded bytes by SHA-256 and only reuses a regular, contained, no-follow policy read with exact bytes. A corrupt file, symlink, directory or blocked folder remains untouched. `CaptureRecorder.swift:398–428` checks the independent cap, writes an exclusive staging file, places it with non-replacing `link(2)`, and verifies the final bytes before returning `retained`. Linked bytes count against the cap even when readback fails. The recorder never writes the mutable source `ink.json` from this path.

4. **Failure does not discard the image or current editable document.** Both the raw alias and rendered-image paths call retention after the image is available (`CaptureRecorder.swift:264–274, 299–308`). Missing frozen data is `unavailable`, not `no_document`; encoding, size, cap, directory, existing-entry, link or readback failures carry a reason. A later frame can retry; original-cap refusal is not a permanent latch. A verified reused file is checked before the new-byte cap. The existing mutable save/unsaved-document recovery remains separate. Event/status write failure accounting remains in force; successful bytes alone are not evidence that an event was durably journaled.

5. **Stop, late composition, and reopen preserve the intended boundary.** `CaptureController.swift:299–310, 425–431` closes the live gate/input before awaited stopping. `InkController.swift:102–126` closes and saves input, freezes the final closed span, then clears its live session. `InkSession.closeInput` (`Ink.swift:505–525`) retains an interrupted stroke and records closure. The final span remains available to already-admitted frames. `CaptureRun.swift:91–109` orders ordinary finishing behind previously reported composition requests; the recorder's awaiting set gives one outcome and rejects late work (`CaptureRecorder.swift:241–254`). Quit can record uncomposed outcomes instead of draining main-actor pairing; that existing behavior is explicit, while unsaved editable documents still hold Quit. Reopen uses a new live session over the saved value and records its boundary; it does not rewrite old `ink-originals` files. Old outcomes with no `inkOriginal` remain unknown, and added status members are optional (`CaptureRecords.swift:188–196`).

## Nonblocking observation

`CaptureRecorder.swift:415–428`: if `link` succeeds, staging `unlink` fails, and final readback succeeds, `stagingNote` is dropped by the successful `retained(reused: false)` return. The remaining staging name is another link to the retained inode; the original is still present and verified. This is a source-proven cleanup-diagnostic omission, **not** an executed macOS failure or a demonstrated original-loss blocker. The owner may expose that cleanup warning in a future bounded follow-up; no correction campaign is required for this review.

The documented single-writer limit also remains: swapping the `ink-originals` parent directory after its type check is not defended by descriptor-relative writes. This delivery openly states that limit and does not establish hostile concurrent filesystem-writer isolation. This review does not claim crash/fsync durability, complete recovery from external file tampering, or automatic editor recovery from immutable copies.

## Independent bounded checks

Ran the accompanying stdlib Python audit against the exact export:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/macos-ink-89-storage-review-probes.py /tmp/macos-ink-89-storage-review-xd371yy7 --output /tmp/macos-ink-89-storage-review-probes.json
```

Result: **13/13 exported changed files equal Git objects; 8/8 current source/English manifest entries match; 4/4 isolated Linux POSIX primitive cases pass.** The four cases cover successful link/readback/cleanup and a regular file, symlink, or directory appearing at the final address after staging. The three conflicting entries survive unchanged and `link` returns `EEXIST`. These exercise `os.link/os.unlink` in disposable `/tmp` directories; they do **not** execute or simulate Swift/Foundation, prove Swift value semantics at runtime, or replace macOS tests.

Machine evidence: `/tmp/macos-ink-89-storage-review-probes.json`; runnable source: `/tmp/macos-ink-89-storage-review-probes.py`. The file includes hashes for all 13 changed files. No repository/worktree edits, test suite, DB, service/listener, device, display, provider or native process was run.

The author's 47 declared Swift tests, Python checker model counts and other review-agent reports are not credited as independent executed evidence. Source assertions for history, cap, Stop/reopen and old records were inspected; their actual Swift execution is **NOT_RUN** in this review. Real pen/overlay operation, two §7.1 AI gates, both placement modes, live source anchoring, actual Notability import and full R59/A46 acceptance remain open. Lead owns the next hosted build/integration gate; Native owns any resulting source corrections.
