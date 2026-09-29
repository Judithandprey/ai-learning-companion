# IOS-INK-01 independent source review

Candidate: `5d5d8cb3a00cee6fc87528185ccb5a5f6eee1036`; reviewed normal merge
`abd5a95c750161c49298d63f12d4c0c013df9bbf`, diff against `01a8adf`, restricted to
`apps/ios` and `docs/verification/platform` (nine files).

Direct user assignment read in full from
`/mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/ipad-delivery/assignment.md`.
Observed SHA-256 exactly matches
`a33b3f0ce4fe6a55b49100324353c5c7a1861357af095c214cb69bad2a761dcd`.
Applied project PONYTAIL LITE and the previously read AGENTS/TEAM/lead/workflow;
refreshed affected original/English R46–R48/R59 and A26–A28, plus the explicit
owned-page task boundary. Existing original-screen/process-history requirements
are retained as separate, unfinished scope.

## Decision

**Proceed with the exact candidate's hosted compile, but request two bounded
persistence fixes from iOS before accepting the save/recovery slice as usable.**
The native owner should keep the existing small design; neither issue calls for a
sync engine, backend contract change or new dependency. Support owns compilation,
lead integration and QA the eventual actual-operation pass.

This is **source review only**. No Apple toolchain, Swift typecheck, simulator,
Pencil interaction, native filesystem execution or device test was run here.
The reproductions below are concrete source-derived test recipes, not claimed
executed native failures. EnvProbe's successful build does not compile this ink
candidate. No main/worker files or the lead's dirty delivery documentation were
edited; only this `/tmp` report was written.

## Findings

### IOS-INK-R1 — Distinguish unreadable existing bytes from a missing file (P2)

Location at reviewed merge: `apps/ios/CompanionInk.swiftpm/InkStore.swift:58–63`.

`try? Data(contentsOf: fileURL)` collapses all read failures to `nil`. When
`lastKnownBytes` is also nil, the comparison says nothing changed and executes
the atomic replacement at the original pathname. Atomic writing prevents partial
bytes; it does not protect an existing unreadable original from replacement.

Concrete reproduction for the simulator/native persistence harness:

1. Initialize `InkStore` with an empty test directory, leaving
   `lastKnownBytes == nil`.
2. Before the first save, place an existing original at the primary JSON path.
   Make that file unreadable to the app while retaining write/rename permission
   on its parent directory (or inject the equivalent read error at this call).
3. Call `save` with a different valid drawing.
4. At line 58, the failed read becomes nil, equals `lastKnownBytes`, and avoids
   conflict handling. The write at line 63 can replace the existing file because
   replacing a file is governed by directory permissions.

Expected: preserve the existing file byte-for-byte and either report not saved
or write a clearly identified separate copy. The current control flow permits
overwriting it, contrary to the code's explicit data-loss rule.

Minimal fix: treat a confirmed no-such-file error as absence; propagate every
other read failure into the existing not-saved path, or deliberately branch to
the existing side-copy path without replacing the primary. Preserve the in-memory
drawing. Add one focused native/harness check for nil lastKnownBytes plus a failed
read of an existing file. Do not replace the problem with another `fileExists`
check that can itself hide a permissions error.

### IOS-INK-R2 — Validate format version and authorship before loading as user ink (P2)

Location: `apps/ios/CompanionInk.swiftpm/InkStore.swift:83–88` and
`UserInkFile` at lines 7–17.

The envelope persists `schemaVersion` and `authorship`, but the loading guard
checks only `layer` and page equality. A decodable file with an unsupported schema
version or `authorship: "assistant"` is therefore presented as the user's current
editable original. The next edit writes a fresh `UserInkFile` with version 1 and
`authorship: "user"`, replacing the unsupported/misattributed file. Unknown
Codable fields are also not preserved by this decode/re-encode path.

Concrete native reproduction:

1. Start with one valid saved envelope/drawing and matching page context.
2. Independently set `schemaVersion` to 2, or `authorship` to `assistant`; keep
   the current `layer` and page unchanged.
3. Reopen. The guard accepts the file; edit any stroke and observe replacement
   as schema 1 / user authorship rather than protected incompatible input.

Expected: reject unsupported versions and non-user authorship before assigning
`drawing`; retain the exact input bytes through the existing set-aside/failure
path and report the reason. Minimal fix: check the supported schema version and
user authorship in the existing guard, with focused negative checks. No new
general-purpose schema framework is needed.

## Behaviors supported by source inspection

- The page is explicitly an owned bundled practice fixture, with stable ID,
  version, title, source kind, content hash and 680 × 860 coordinate space. It does
  not fabricate captured course context. Page and canvas share one fixed frame.
- `PKDrawing.dataRepresentation()` is stored as editable native ink inside the
  envelope. Loading precedes installation of the canvas delegate, so source
  initialization is not deliberately autosaved as a new edit. The canvas is not
  reset to an old drawing on each SwiftUI update.
- Each drawing callback updates the in-memory drawing, writes atomically, then
  reports saved. Failure reports not saved while retaining the current drawing;
  a subsequent edit retries. No provider/network operation or AI supplement is
  mixed into this original-ink file.
- NAV is the initial mode. Only WRITE enables canvas interaction. Pencil-only is
  the default drawing policy; finger ink requires an explicit toggle. ASK gives
  honest unconnected status and has no selection, answer or transmission path.
- Erasing uses the native vector eraser. Restored PKDrawing content remains
  editable in the source call flow; actual device behavior remains untested.

## Actual-operation gaps to preserve

- `.pencilOnly` plus a disabled inner canvas scroll view expresses the intended
  Pencil/finger policy; it does not prove the outer SwiftUI ScrollView's gesture
  behavior. QA must verify finger scrolling, no finger ink by default, erasing,
  mode changes and no unexpected ASK action on a physical Pencil device.
- The essential positive sequence remains launch → write/erase → save → quit →
  airplane mode → reopen → same source/position → edit an old stroke. Run on the
  exact compiled candidate, separately naming simulator and physical evidence.
- Kept-aside/conflict files are deliberately retained but have no reopen/recovery
  picker. This limitation is already disclosed in the candidate. It cannot count
  as a verified recoverable multiwindow/alternate-copy workflow. Do not add a sync
  engine for this one-page milestone; preserve the explicit limit during QA.
- Only current editable PKDrawing state is retained; this does not establish the
  full R51/R52 editing/branch history. Likewise this is not original-live-screen
  R59/A44, AI composed-screen receipt, audio, Notability A46 or full P1 acceptance.
- Fixed font sizes intentionally omit Dynamic Type in this probe. The claim of
  exact alignment across devices/settings still needs actual-operation evidence;
  the source context hash alone is not a rendered-layout measurement.

No broad research, full test suite, Chats action or competing implementation was
started. Next owner: iOS fixes R1/R2 in its owned files; Support builds the exact
candidate/fix commit; lead then supplies the integrated version and artifacts to QA.
