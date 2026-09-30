# macOS ink domain and persistence review

**Judgment: HOLD for two concrete corrections.** Candidate
`3aaff3a3abcae29636537732e654b670ae14e34b`, parent `12eae15` (adopts main
`061efe2`), exact export `/tmp/lc-macos-ink-3aaff3a`.

Scope: complete `Sources/DesktopCapture/Ink.swift` and `InkTests.swift`, plus the
specific renderer/controller call sites necessary to establish user consequences.
Read current main's affected original/English §7.2/§7.4, R46/R51/R52/R59,
A26/A27/A30/A31, effective decisions and workflow. Applied PONYTAIL LITE: existing
model/storage, no new abstraction or implementation. No main/worker edits,
cross-chat/native-role messages, desktop/provider launches or installs. Previous
Windows review files are preserved.

## MI-D1 — P2: erasing the rendered middle of a stroke can do nothing

Primary location: `Ink.swift:493–511`; renderer witness:
`Sources/CompanionDesktop/InkViews.swift:69–82`.

Minimal exact call path:

1. Create `InkSession`, select `.write`.
2. Begin a pen stroke at `(0,10)`, extend to `(100,10)`, end it. The renderer draws
   the continuous line segment joining those two points.
3. Set `tool = .eraser`; begin at `(50,0)`, extend to `(50,20)`, end.
4. `applyErase` tests only the two **stored points** against the eraser path.
   Both are 50 points away, greater than radius 8, so `hit` is `[false,false]`.
   The method returns `.refused("nothing under the eraser")`; the visibly selected
   middle of the original line remains wholly unchanged.

This follows the actual model and drawing code without relying on a particular
Mac's input timing. A sparse pair of events is supported by the model and renderer.
The existing erase test uses points every 10 units and crosses an exact point, so
it cannot catch this case. Its successful reasoning does not establish erasure of
the drawn line between samples.

The author documents and calls this an accepted limit, but the user did not waive
partial erasure of the visible chosen portion (§7.2). A local hit/cut correction
must operate on what is drawn while retaining the exact original stroke, derived
piece provenance and undo/redo behavior. No general geometry rewrite is requested.

## MI-D2 — P2: conflict-protected newer originals cannot be reopened

Primary locations: `Ink.swift:573–574`, `:591–601`, `:604–619`; actual UI path:
`Sources/CompanionDesktop/InkController.swift:180–208`.

Minimal exact call path:

1. Save one stroke in session A to `A/ink/ink.json` (revision 1).
2. Change that file's bytes externally without damaging its JSON, for example add
   one trailing newline. Continue writing a second stroke in the open document.
3. `InkStore.save` correctly preserves the changed file and saves revision 2 as
   `A/ink/ink.conflict-<id>.json`; subsequent saves continue in this fork.
4. Quit/restart, begin a later capture, and use the sole **Reopen earlier ink**
   control. `latestDocument` considers only `session/ink/ink.json`, explicitly
   excluding conflict files. The caller then initializes `InkStore` with the
   session directory, whose initializer again hard-codes `ink/ink.json`.
5. The user receives revision 1. The newer editable work survives on disk, but no
   product open/import control can reach that file. If the original was corrupted
   instead of whitespace-changed, the entire session can be skipped while its
   valid newer conflict original remains undiscoverable.

This violates the original-editability/restart requirement (R46, §7.4, A27), even
though bytes are preserved. Existing tests assert that a conflict file is written
and that the original is untouched, but never reopen that newer fork. Recovery must
open the actual preserved document and retain both versions; only adding a filename
to a scan is insufficient while `InkStore` still loads the fixed original path.

## Positive source checks and remaining limits

- NAV refuses gestures; WRITE gates mouse writing; tablet facts stay in points.
  ASK completion/cancellation restores the prior NAV or WRITE mode without sending
  anything or changing teaching/disclosure permission.
- Ordinary sampled-point erasure keeps original strokes and gives pieces their
  parent and original anchor. Undo/redo target content operations, retain original
  histories, increment revision and clear redo on a new content change.
- `closeInput` keeps a pending pen stroke as interrupted, drops unfinished erase
  and selection, records closure, restores NAV and refuses later writing/undo.
- Anchors retain native-session/frame identity and host time; erase pieces copy
  them. Reopening records the new native session without rewriting old anchors.
  `revision(at:)` scopes to the last reopening and returns unknown for earlier
  frame times rather than comparing a previous boot's clock.
- `InkStore` uses `Data.write(..., .atomic)` and remembers exact bytes after load
  or successful save. Ordinary external changes/unreadable originals cause a fork,
  rather than overwriting the original. A JSON decoding error or unsupported
  schema/layer/authorship throws before `lastKnown` is accepted or a file is written.
  This is source inspection, not fault-injection evidence or a claim that all
  semantically corrupt-but-decodable histories are validated.
- Normal reopen saves the current document before replacement and refuses the
  switch if that save fails. Closed unsaved sessions are held in controller memory
  and retried. Persistent EIO at app quit is owned by the separate lifecycle
  reviewer; this review does not claim memory survives termination.

The bounded component does not meet full §7.4 or R59: the model records one
pen-down anchor, not new context segments for screen changes during a continuing
stroke; content-following, verified composites, provider receipt, physical pen,
ordinary navigation while writing and external import remain open. These are not
silently accepted by the two corrections above. Crop/shared-retained-original,
scope contract and app lifecycle/geometry remain with the other assigned reviews.

## Evidence and reproduction artifacts

**No Swift build or XCTest was executed.** The six author tests were read; the
claimed 33 total tests remain uncompiled/not-run in this review. The candidate's
source-reading agents do not establish compile or behavior acceptance.

Executed portable witness:

```sh
python3 /tmp/macos-ink-domain-witness.py
```

Result: two source/arithmetic witnesses confirmed. The script checks exact source
anchors, calculates the two endpoint distances and the segment intersection, and
checks the conflict-save/discovery/load path. It explicitly does **not** execute
Swift, AppKit or atomic disk writes.

Prepared actual model/store XCTest regressions:
`/tmp/macos-ink-domain-regressions.swift` (**not compiled or run**). They exercise
the real public `InkSession` and `InkStore` APIs in the existing test target, rather
than porting the product model. They state required behavior and should fail the
current candidate if compiled: mid-segment erasure and editable conflict recovery.
The recovery API may change during the fix, so adapt that one caller faithfully.

Next: Native owner fixes these cases alongside the other reviewers' findings;
Lead reviews the exact correction and runs the existing hosted macOS compile/test
workflow. Real-Mac and real-provider acceptance remains separate and open.
