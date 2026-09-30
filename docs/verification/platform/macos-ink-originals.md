# macOS composed frames → immutable editable-ink originals

Task: the lead's native continuation `handoff_f53e81f85dcf24189e6aedfa3546d351` (start confirmed as
`handoff_38b518ab637fa7683b62ee73758e5a31`). Baseline: exact pushed `ef487cf`, normally merged into
`team/ios` as `a84289e`. The requirement files and `docs/workflow.md` are unchanged since my last
refresh at `ebae7af`, through current main `8ea8fdf`.

**Gap closed.** Until now, a composed frame named its ink only as a document path plus a revision.
That is the mutable `ink.json`, which can change, or fail to save, after the pixels. It was recorded
as "not an immutable editable original". Each composed frame now keeps, or explicitly does not keep,
an exact snapshot of the whole editable document.

**Scope.** Only `apps/macos/**` and this record. No released 0.2.11 field or meaning changes. No
package, service, root, dependency, CI, network, provider or mobile change.

## What happens

| Step | Behaviour |
| --- | --- |
| Freeze at pairing | `InkController.compositionRequest` runs on the main thread when a kept frame is reported, before any later edit. `InkComposer.request` now also puts the paired span's `InkDocument` **value** into the request, with `frozenHost` (host seconds). Queued work sees only that value, so a stroke committed after enqueueing is not in it. Two flags are set only in the still-open span: `pendingGesture` (a gesture in progress) and `pendingAskRegion` (an ASK region drawn and awaiting Finish or Cancel). |
| Consistency | Before anything is written, the frozen document must reproduce the frame. That means the same created-in session and display as the paired reference, and `paired revision ≤ document revision`. Replaying its operation history to the paired revision (`visibleStrokes(atRevision:)`) must give exactly the frame's stroke IDs. Otherwise the original is `unavailable`, and no folder is created. |
| Bytes | `CaptureFiles.encoder` (sorted keys) gives deterministic bytes. They are refused over the 32 MiB original ceiling, and SHA-256 is computed. |
| Address | `ink-originals/<SHA-256>.json` inside the session, written once. `ink-originals` must be a real directory, checked with lstat just before writing. A concurrent writer that swaps it for a symbolic link after that check is not defended against: the recorder is the session's only writer. |
| Existing entry | Reused only when the policy read (regular file, containment, `O_NOFOLLOW`, length, SHA-256) returns exactly these bytes. Other bytes, a symbolic link or a directory are left **unchanged**, and the original is `unavailable` with the reason. |
| Cap | Ink originals have their own byte cap, equal to the raw frames' cap, as composed images do. A reused file costs nothing. A new file over the cap is not written, and the original is `unavailable` with the kept and needed bytes. |
| New entry | Written to `.staging-<UUID>.json` with `withoutOverwriting`, then placed with `link(2)`, and the staging name is unlinked. `link` refuses any existing entry (file, link or directory) atomically, so an entry that appeared meanwhile is left unchanged and reported. Once placed, the file counts toward `inkOriginalFiles`/`inkOriginalBytes` and the cap, even if it then fails to read back under the same policy. In that case the frame is `unavailable`. A failure says whether the staging file was removed. |
| Record | `ComposedFrame.inkOriginal` (`InkOriginalRecord`) holds these fields:<br>- `status`: `retained`, `unavailable` (with `problem`) or `no_document`;<br>- `file`, `sha256`, `byteLength`, `mediaType` (`application/json`) and `reused`;<br>- `documentFile`, `createdInSession`, `documentRevision`, `frozenHost` and `pairedRevision`;<br>- `pendingGesture` and `pendingAskRegion`;<br>- `limits`.<br>The paired revision and the snapshot's own revision are **both** kept; they differ for delayed pixels. |
| Limits (retained) | These are always present, in this order:<br>- the snapshot limit ("an exact snapshot of the whole editable document … frozen when this frame was paired; the mutable ink file may have changed, or failed to save, since");<br>- when the snapshot is newer: "the snapshot is at revision N and the frame shows revision M: later operations … are not drawn in this frame";<br>- a gesture in progress at freezing, whose points are not in the snapshot;<br>- an ASK region awaiting Finish or Cancel at freezing, which is not in the snapshot;<br>- after a reopening: "operations before the document's last reopening keep their own session's host clock". |
| Unavailable | `limits` is only `originalUnavailableLimit`: nothing immutable is kept, and the path and revision name only the mutable file. Every reason is kept, including a request that came without a frozen document from an older caller. That case is `unavailable`, never `no_document`. |
| No document | `no_document` with the existing no-document limitation. |
| Old sessions | A composed record without `inkOriginal` decodes as nil. It is reported as **not recorded (unknown, from before ink originals)**, never as successful empty ink. |
| What is never touched | The raw and composed PNGs are written and kept before and regardless of the original. The mutable `ink/ink.json` is never written here. No retention, disk or write failure claims an editable original or discards current ink. |
| Status and app | `status.json` gains `inkOriginalFiles`, `inkOriginalBytes` and `inkOriginalsUnavailable`. The capture window's composition line shows the kept count and any unavailable count. |

**Mac retained-frame mapper (additive).** `MacRetainedEntry.inkOriginal` is an optional
existing-0.2.2 `editable_ink` binding (`application/json`) that the trusted host supplies.
`MacRetainedDescriptor.inkOriginalBindings` returns it separately from the 0.2.11 descriptor and its
image bindings. The 0.2.11 frame JSON is unchanged. A binding is emitted only in this case:
- the frame has a `retained` original;
- the binding's kind, media type, SHA-256 and length are those of that original;
- the file re-reads under the retained-file policy at exactly `ink-originals/<its SHA-256>.json`;
- the record and the decoded `InkDocument` are the frame's paired document: same file,
  created-in session and display;
- the document's revision is the recorded one, and its history, replayed to the paired revision,
  gives the frame's strokes.

Otherwise that entry is refused with its reason. Plan-level artifact-ID and source consistency
include these bindings. Unrepresented facts always gain a summary line. It gives:
- the retained count and the files;
- the unavailable, no-document and not-recorded counts;
- any unrecognized status and the distinct unavailable reasons.

There is also one line per kept original, giving:
- its file;
- the document and paired revisions;
- `frozenHost`;
- whether it was written or reused;
- every limitation.

So a pending gesture and the frozen time are reported, not dropped.

## Checks

```sh
COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR=<new directory> swift test --package-path apps/macos/CompanionDesktop   # 47 tests
python3 apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py <that directory>
```

**New `Tests/DesktopCaptureTests/InkOriginalTests.swift`** has 3 XCTests on the real recorder and
composer, with encoded synthetic pixels:
1. **Exact bytes and history.** The sequence is: write (r1) → frame A → partial erase (r2) → undo
   (r3) → redo (r4) → ASK Finish → ASK Cancel → continue writing (r5) → frame B.
   - Both requests are frozen, then the live document is changed to r6 before composing.
   - Both frames share one file, written then reused. Its bytes equal `CaptureFiles.encoder` of the
     frozen value.
   - The paired and snapshot revisions are recorded: A [1, 5], B [5, 5], with A's later-revision
     limitation.
   - The decoded operations are exactly `mode, stroke, erase, undo, redo, mode, ask_finished, mode,
     ask_cancelled, stroke`. Strokes, undo/redo stacks and the ASK selection are equal to the frozen
     value. The replay at 1 and 5 equals each frame's strokes, and the r6 edit is absent.
   - The status counts are right, and `ink/ink.json` is not written.
2. **Failures and recovery.** Each case says why:
   - corrupt bytes at the address are left unchanged, with only the unavailable limitation; a fresh
     request for a later frame retains the original once they are gone;
   - a symbolic link leaves its target unchanged;
   - a directory at the address;
   - a file where `ink-originals/` belongs;
   - a frozen document that does not reproduce the frame, with no folder created;
   - a document of 20,000 points over a 256 KiB originals cap: nothing is written;
   - a request without a frozen document is `unavailable`, never `no_document`.
   The composed PNG is kept in every case.
3. **Stop, reopen and old sessions.**
   - Stop with a stroke in progress: the snapshot keeps the interrupted stroke and `input_closed`
     ([1, 2]).
   - A reopened span with a pending gesture: another file, with the reopen-clock and gesture
     limitations, and the carried revision's commit time stays unknown.
   - An ASK region drawn but awaiting Finish: `pendingAskRegion`, its own limitation, and no
     selection in the snapshot.
   - The finished session reads back with the same record.
   - A record without `inkOriginal` decodes as nil and is reported as 1 not recorded (unknown).

**`MacRetainedFramesTests` (still 2 tests).** The emitted 8-frame session keeps its frames, pixels
and paired revisions 0, 1, 2 and 2 for frames 2–5. After frame 5's admission, the first document now
goes on until Stop: undo (r3), redo (r4), ASK Finish, ASK Cancel, a continued stroke (r5), and a
stroke interrupted at Stop (r6, `input_closed`). Frame 6 is therefore paired at the carried
revision 6, and the reopened-limit refusal cases use 6. Every request is frozen at 106.7. At that
point a stroke is in progress in the reopened document, and it is committed after the requests are
made; the saved `ink.json` is revision 7. The ink originals are:
- frame 1: `no_document`;
- frames 2 and 3: one snapshot at revision 6 (paired r0 and r1; written, then reused). Its decoded
  history is exactly `mode, stroke, erase, undo, redo, mode, ask_finished, mode, ask_cancelled,
  stroke, stroke, input_closed`, with 1 selection and the interrupted stroke;
- frame 4: its outcome line is rewritten without `inkOriginal`, as a recorder from before ink
  originals wrote it. Only that line changes, and it is not recorded (unknown);
- frame 5: its request comes without a frozen document, so it is `unavailable` with that reason;
- frame 6: the reopened snapshot (r6 = paired r6), with the pending-gesture and reopen-clock
  limitations. It ends `input_closed, reopened, mode`, without the later stroke;
- frames 7 and 8: none.

The test checks each snapshot's SHA-256, its length, and that re-encoding the decoded document gives
the stored bytes. It checks the summary and per-frame `ink originals:` lines and the status counts
(2 files, 1 unavailable). The plan binds each retained original as `synthetic-mac-ink-<SHA prefix>`,
so binding counts are `[0,1,1,0,0,1,0,0]`. The fixture manifest adds `ink_original_bindings`.

Nine new stated-reason refusals bring the total to 51 cases:
- a binding for a frame without an original;
- for an unavailable original (edited, and the real frame 5);
- for the not-recorded frame 4;
- a `screen_image` kind;
- a wrong length;
- changed file bytes;
- a record that no longer reproduces the frame;
- a record naming another document file (`is not the frozen document of this frame's paired ink`).

**Owner checker `validate_mac_retained_frames.py`.** For every described frame, it now checks:
- the ink-original record against the retained file (a real directory and regular file, exact
  SHA-256 and length, JSON);
- the snapshot's revision, session, display and file against the paired reference;
- the history replayed to the paired revision, against the frame's strokes;
- the limitations, recomputed from the snapshot and the recorded `pendingGesture` and
  `pendingAskRegion` flags;
- each `editable_ink` binding, with the released `validate_original` and exactly those bytes.

A frame without a retained original must have no binding: no document, unavailable with its reason,
or not recorded. Each retained frame has 10–11 controls, and every one must be reported:
- one changed byte;
- the binding's SHA-256;
- `screen_image`;
- the binding dropped or given twice;
- the paired or document revision;
- a dropped limitation;
- either flag flipped;
- a readdressed rewrite of the shown history, where the last operation no longer adds a visible
  stroke.

A binding offered to a frame without an original is also a control. The `ink originals:` lines are
recomputed exactly: the summary and one per kept original. Each has remove, change and invent
controls. Each distinct original prints an `INFO` line with its bytes, SHA-256, revision, strokes,
stacks, selections, full operation history, and the frames it serves. A file that is not its
recorded bytes is reported, never parsed.

The non-vacuity check now also requires these ink originals:
- retained, reused, later-revision, reopened, pending-gesture, `frozenHost`-bearing, unavailable,
  not-recorded and no-document originals;
- retained histories containing write, erase, undo, redo, ASK finish and cancel, `input_closed`
  with an interrupted stroke, a selection, and a reopening;
- at least 20 ink controls.

## Results

| Level | State |
| --- | --- |
| Source | Written in `InkComposition.swift`, `CaptureRecorder.swift`, `DesktopIngress.swift` (policy split with an ink-original reader), `CaptureRecords.swift`, `MacRetainedFrames.swift`, `InkController.swift` and `ContentView.swift`. **Uncompiled**: there is no Mac or Swift toolchain here. |
| Swift tests and Swift-emitted fixture | Hosted [run 36762827375](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36762827375), at the lead's published `687a58b` (the same `apps/macos` tree as `35c75a4`), **failed** while compiling the tests. The library and app release build and package completed. `InkOriginalTests.swift:239` could not be type-checked in reasonable time: the 20,000-point `stroke(long, (0..<20_000).map { (10 + Double($0 % 80), 10 + Double($0 % 7)) }, …)`. The correction builds the same 20,000 points in an explicitly typed loop (`let x: Double`, `let y: Double`), asserts the count, and keeps the cap-size assertion. The other closure and literal expressions in the new tests were inspected. None has that pattern (untyped literal arithmetic inferred through a generic `map`); they have explicit types or small literals. 47 declared XCTests and the fixture are still **NOT_RUN** until the lead's rerun. |
| Checker, Python simulation (not Swift) | See below. |
| Actual Mac, pen, permissions, Notability | None. |

The simulation ran in the pinned `.venv` and is a Python simulation, not Swift output. It added
Python-made ink originals, shaped like the new Swift session, to the lead's actual Swift-emitted
fixture from hosted run 36752548728 (`main:docs/verification/lead/macos-retained-hosted/macos-retained-frame-fixture.zip`):
- frames 2–3: the first document extended with undo, redo, ASK Finish/Cancel, a continued stroke,
  an interrupted stroke, `input_closed` and a selection;
- frame 4: not recorded;
- frame 5: unavailable;
- frame 6: the saved reopened document, with the pending-gesture limitation;
- frame 1: `no_document`.

It gave **353 PASS, 0 FAIL**, with 100 ink-original checks and controls. The `INFO` lines showed:
- a 3,024-byte revision-6 snapshot with its full 12-operation history, serving frames 2 (paired r0,
  written) and 3 (paired r1, reused);
- a 1,862-byte snapshot ending `reopened@r2`, serving frame 6.

The same session **without** originals is the old format. Every per-frame check passed, and the
line reads `0 … keep one [], 0 unavailable, 0 without a document, 6 not recorded (unknown, from
before ink originals)`. Only the non-vacuity check failed, as intended.

Nine tampered variants each failed:
- changed bytes;
- a removed original;
- `ink-originals` as a symbolic link;
- a binding on the no-document frame;
- a wrong binding length;
- a record removed while its binding stays;
- the gesture flag dropped;
- a stale per-frame line;
- a snapshot revision claimed equal to the paired one.

In the simulation the expected lines come from the checker itself. Byte-for-byte equality with the
Swift mapper's lines is **not run**; the hosted run checks it.

## Review

`wf_a12e2786-6f5` was read-only, with 8 agents. Four reviewers covered compile, behaviour/safety,
test trace and checker parity, and each dimension had an adversarial verifier. No compile error or
failing assertion was found. Confirmed and fixed:
- **Mapper (found 3 times).** The mapper did not tie the snapshot to the frame's paired document
  (file, session, display), although the checker did. It now refuses with a new case.
- **Fixture coverage (found twice).** The emitted fixture lacked undo/redo, ASK, Stop, pending
  gesture, unavailable and not-recorded originals. They are now in the session, and non-vacuity
  requires them.
- **Pending-gesture limitation.** It could not be recomputed. It is now recorded as a flag, with
  controls.
- **Pending ASK region.** It was not flagged; this one was plausible. It now has its own flag and
  limitation.
- **Per-frame facts.** `frozenHost` and pending-input limitations were dropped from the mapping.
  There are now per-frame unrepresented lines.
- **Negative revision.** A snapshot revision below zero could trap `visibleStrokes`. It is now a
  bounds check.
- **Read-back accounting.** A read-back failure after placement left the file uncounted. It is now
  counted when placed.
- **Non-atomic placement.** Check-then-move was not atomic; this one was plausible. Placement now
  uses `link(2)`, and the directory race is documented.

Refuted: the claim that the reused flag and status counts were never verified. They are asserted
by XCTests and structurally by the shared file.

**Recheck of the fixes.** `wf_60bbdfe1-290` used 4 agents: compile/test trace and Swift/checker
parity, each with an adversarial verifier. It confirmed one failing assertion. The lifecycle test
still expected 1 kept original after its pending-ASK frame was added; the summary gives 2. That is
fixed, and the test now also pins the per-frame lines.

The parity reviewer traced the emitted fixture and ran the checker on a Python model of it. It
gave 0 FAIL:
- the summary and per-frame lines matched character for character, including `106.7`;
- every control was reported;
- every non-vacuity threshold was reachable.

Nothing else was found. Reading is not compiling.

## Shared-contract seam (for the lead)

No released field ties a `MacRetainedFrame` 0.2.11 to its editable original. What exists:
- the native association (`ComposedFrame.inkOriginal`, with its paired and snapshot revisions);
- a separate existing-0.2.2 `editable_ink` binding that the mapper can emit when the trusted host
  supplies its artifact ID.

The host must place that artifact reference in the same unchanged Process record as the frame's
image artifacts. The paired revision, the snapshot revision, `frozenHost` and the limitations stay
native, reported and unrepresented, until a lead-owned versioned contract carries them. The
editable document's own schema (`InkDocument` JSON) is native, not a released contract.

**Pinned CI counts** (lead-owned, not edited here):
- 47 tests;
- six test files (`InkOriginalTests.swift` added);
- the retained-frame fixture now includes `native/<session>/ink-originals/*.json` and
  `ink_original_bindings`;
- its session has a longer ink history, the frame-6 revision 6, and one rewritten legacy outcome
  line;
- 51 refusal cases;
- no new library or app source file.

The previous checker ignores the new items. The new checker refuses fixtures without
`ink_original_bindings`, so earlier fixtures must be regenerated rather than re-checked.
FrameStore.swift remains byte-identical to the iOS copy.

## Limits

- An ink original is the document as the app held it when the frame was paired. Whether it matches
  what was physically drawn on the screen, and pen hardware, remain unverified on a Mac.
- Reuse is by exact bytes. Two frames of the same document state share a file. Each edit followed by
  a kept frame gives a new whole-document file, so long writing sessions reach the originals' cap
  sooner than the frames' cap. Beyond it, frames say `unavailable`. No delta storage is attempted.
- Original-live-screen annotation (R59/A44), Notability import and any AI or provider use are
  untouched by this change.

## Next owners

- **Lead:** source review, the hosted build/tests and checker on the new fixture, and pinned counts.
  Also whether and how the Process record or a later contract carries the paired and snapshot
  revisions.
- **Native (me):** actual compile or test failures first.
- **QA:** an actual Mac only when access exists.
