# macOS original-screen ink: first screen-fixed local loop

Task: the lead's same-card continuation `handoff_39ad28c9fe5443869bc722dfb9c72a7b` (P0-03/11 →
P1-02/P2-03), with its scope clarification `handoff_10e19e782507a60efb52a320c34dab77`. The start
notice was `handoff_34afd5716f9c353879198db1ab79f9a3`. First delivery: `3aaff3a`
(`handoff_6666d73aed7ed922e7e3f40c6ff9c3d6`).

**Correction.** The lead held `3aaff3a` (`handoff_bd8f797e339b7a853f2fae010f760b55`; findings
committed at `b407478`, `docs/verification/lead/macos-ink-review/`). This record now describes the
corrected loop; see [Correction of the held delivery](#correction-of-the-held-delivery).

Baseline: main `061efe287fd965b5a8fcfeced36f1309c2540e2f`, normally merged into `team/ios` as
`12eae15`. The only conflict was the ingress mapping record, where main's corrected text was kept.
`apps/macos` equals main at that point, and later main commits up to `d3b4b47` do not touch it.

Read:
- §7.1, §7.2, §7.4 and §7.8 (English);
- R08, R46, R51, R52 and R59;
- A26, A27, A30, A31 and A44;
- the independent display/purpose/destination dimensions and INTENT-INK-MODES;
- the retained iOS `InkStore`/`InkFile` rules, which were reused;
- for the correction, the lead's `README.md`, `app.md` and `domain.md` at `b407478`.

This is a **bounded local component milestone**, not A44 or a §7.1 gate pass. Content-anchored
display, physical pen input, real composite capture, AI receipt, audio and Notability are open.

## Outcome

While capture runs, a transparent, non-activating overlay panel lies exactly over the explicitly
selected display, and a small floating palette offers the controls.

| Step | Behaviour |
| --- | --- |
| NAV (default) | The overlay ignores the pointer, so the original app stays operable. Nothing is drawn or selected. |
| WRITE | **Pointer input over the display's page area goes to the ink layer.** The menu bar, the Dock and the palette stay usable. The palette and main window show this persistently while in WRITE or ASK, and NAV restores ordinary navigation of the app underneath.<br>- **Pen input writes.** Tablet points keep `NSEvent` timestamp, pressure and tilt.<br>- **The pen end** is looked up by `NSEvent.deviceID` from app-level (local and global) tablet-proximity monitors. The entry is reset when the pen leaves proximity; when no proximity event was seen, the device is recorded as `tablet_other`. This is **untested on hardware**.<br>- **Mouse input writes only with the explicit mouse-writing toggle.** Otherwise it draws nothing, and the refusal is shown. |
| Partial erase | The eraser tool, or a pen's eraser end, removes what the overlay draws within 8 pt of the eraser's path: the **drawn line segments**, not only the recorded samples. An affected stroke is replaced by its remaining portions as new pieces with `parent`. A piece ends where the eraser's edge crosses the line, at a point marked `interpolated` (time, pressure and tilt interpolated between the two samples). Recorded samples stay exact, and the original stroke stays in the file. |
| Undo / redo | Undo reverses the last stroke or erase; redo repeats it. A new stroke or erase clears redo. |
| ASK | Drag a region, then Finish or Cancel. Either restores the mode active before ASK: WRITE → ASK → WRITE, or NAV → ASK → NAV. |
| ASK region drawn | When the drag ends, the region is **pinned** to what is on record then: the latest retained frame, the capture session directory and native session, the display facts, the freshness verdict (with a note when newer pixels were not kept), whether the display geometry still maps, and the ink revisions. |
| ASK Finish | Records the region with the **pinned** evidence; a frame kept after the region was drawn never replaces it. It writes an **actual crop** of the pinned frame's retained original (see below), unless the mapping is unverified. Nothing is sent or explained. |
| Continue writing | After Finish or Cancel, WRITE continues in the same document. |
| Save | Automatic after every stroke and operation (§7.2 "save locally at the end of every stroke"): the whole document, written atomically. A failed save shows a **persistent warning** in the palette, the main window and the menu bar; mode and start hints never replace it. |
| Reopen | The palette's reopen button opens the most recently saved ink with strokes for the same display, **a conflict copy included**, and continues editing that exact file.<br>- It skips the document already open and documents held unsaved.<br>- The open document is saved first; if that fails, nothing is reopened.<br>- The file stays where it is, and a `reopened` operation continues its history. |
| Stop / error / sleep | Input closes in the same main-thread call that ends live claims. A stream error closes it on the next main-thread turn, after the gate closed on the delegate thread.<br>- A stroke in progress is kept as `interrupted`; an unfinished erase or selection changes nothing and is recorded.<br>- The document is saved, then the overlay and palette are removed. If that save fails, the closed document is **held in memory** and saved again at the next capture start or end.<br>- Input after closing is refused. |
| Quit | Every normal Quit (menu bar, ⌘Q, logout) goes through `applicationShouldTerminate`. Capture and ink input end **at once** and the capture ending is written. If any ink is still only in memory, Quit is **held**: an alert offers Save Again, Export… (a new JSON file per document in a chosen folder, read back before release), Don't Quit, or an explicitly destructive Discard and Quit. This applies both to a capture active at Quit and to ink held since an earlier Stop. |
| Display change | When the selected display stays online but its parameters change, the overlay is refitted to the new screen frame and a `display_changed` operation (size and rotation) is recorded. Strokes keep their recorded coordinates. After a **known size or rotation change**, ASK regions of that capture get **no pixels**, pending ones included, until capture restarts. |

Modes are input routing only, separate from any teaching state. Writing never requests an
explanation, and ASK only records a region.

## The document (`<capture session>/ink/ink.json`)

`InkDocument`, written with the recorder's `CaptureFiles` JSON (sorted keys, millisecond UTC).

- **Header.** Schema 1, `layer: user_original`, `authorship: user`, `displayMode: screen_fixed`,
  plus explicit statements of what is not implemented and that whether kept frames contain the
  overlay is unknown.
- **Coordinates.** Display-local points: origin at the display's top-left, y down.
- **`strokes`.** Every stroke ever made, erased and undone ones included. Each stroke has an ID and
  number, device, width and points, and a `parent` for erase pieces. A point computed by an erase
  carries `interpolated: true`; recorded samples have no such key. Its `interrupted` flag marks a
  stroke cut short when input closed. Its `anchor` holds the native session, the latest retained
  frame and the host time when it began; this is the original anchor, kept although screen-fixed
  ink does not move.
- **`visible`.** The strokes currently shown.
- **`operations`.** Ordered sequence, kind, host time, content revision, added and removed IDs,
  undo/redo target, and detail. Kinds: `stroke`, `erase`, `undo`, `redo`, `mode`, `ask_finished`,
  `ask_cancelled`, `erase_interrupted`, `input_closed`, `reopened`, `display_changed`.
- **Revision at a frame.** `revision(at:)` gives the committed revision at a time, from operation
  host times. Only operations since the last `reopened` count, because earlier ones belong to
  another session or possibly another boot's clock; an earlier time is unknown (nil). It excludes a
  gesture in progress, and does not say what any pixels show.
- **`selections`.** Each has the Finish time `host` and, new, `establishedHost`: when the region was
  drawn and pinned (absent in documents saved before the correction).
- **Also:** `undoStack`, `redoStack` and `revision`.

**Saving.** The iOS ink store's rules are reused. Every save writes the whole file atomically. A
file that changed on disk since this store last read or wrote it, or that exists but cannot be
read, is never replaced; the document is saved beside it as `ink.conflict-<id>.json`. Nothing is
deleted, and a document of another schema or layer is refused on load. Reopen considers
`ink.json` and every conflict copy, and opens the chosen file itself (`InkStore(documentFile:)`),
so newer work saved beside a changed or corrupted `ink.json` is reachable; both files stay.

**Unsaved ink.** `UnsavedInk` holds each closed document whose save failed, with its store, until
a save succeeds, an export is written and read back, or the user explicitly discards it. An export
is a complete document JSON; its selection crops, if any were written, stay in the ink directory,
and the app has no import control for exported files yet.

**Other layers.** AI additions never go in `ink.json`; none are produced. Purpose (note, draft or
final answer) is not required per stroke and is not inferred here. Destinations and Notability are
not touched.

## ASK pixels and composition (actual crop, no composite)

`SelectionCropper` produces the crop from the **pinned** frame and capture session directory:
1. It re-reads the exact retained original under the same policy as the desktop-ingress reader
   (`RetainedOriginal`): a `frames/NNNNNNNN.png` path, no symbolic links, containment inside the
   session, `O_NOFOLLOW` plus an `fstat` regular-file check. The SHA-256 and length must still
   match.
2. It decodes the PNG, checks its size against the record, rounds the region outward to whole
   pixels, clamps it to the frame, and crops without scaling or rotation.
3. It writes the crop losslessly as a new, uniquely named `ink/selections/<id>-<random>.png`.
4. The selection records the crop's file, SHA-256, length and integral pixel rectangle, and how it
   was made. A failure is recorded as `cropProblem`. The original is only read.

**Pixel mapping.** Points are scaled by frame size over the pinned display size in points.
`contentRect` and `scaleFactor` are not applied; this is unverified on a Mac.

**Geometry validity (`DisplayGeometry`).** The mapping counts as established only while the
display keeps the size in points and the rotation recorded when capture started. The check runs
when the overlay is created (the screen under it must match the capture's display) and on every
screen-parameter change, from `CGDisplayBounds` and `CGDisplayRotation`. After a known change it stays unverified for the rest of that capture,
even if the display changes back, because how the stream transformed frames meanwhile is unknown.
A region drawn after the change is pinned with the problem; a region pinned earlier but finished
after the change is refused too ("before Finish, …"). Either way the selection keeps its pinned
frame reference, records the problem as `pixelMapping` and `cropProblem`, and gets no crop.
Restarting capture records fresh display facts and maps again.

**Composition.**
- **Capture scope.** The filter is `SCContentFilter(display:excludingWindows: [])`, with no window
  excluded. The overlay and palette request `NSWindow.SharingType.none`, which Apple's current
  documentation calls legacy and says not to rely on to omit captured content (lead scope decision,
  `b407478`). New sessions record exactly that, with the panels' inclusion in kept frames
  **unknown** (`DisplayFacts.inkOverlayScope`); neither exclusion nor inclusion is claimed. The
  released 0.2.7 scope values cannot describe this, so the mapper refuses such sessions' frames
  with an explicit reason and the originals stay unchanged
  ([mapping record](macos-desktop-ingress-mapping.md#scope-of-sessions-with-the-ink-overlay)). The
  additive shared mapping is the lead's.
- **Raw originals.** Kept frames stay as delivered. A kept frame, and so its crop, may or may not
  contain this ink or the controls. Each selection states this, and records the committed ink
  revision at the frame's admission time, or that it is unknown.
- **No ink composite is rendered.** Rendering the strokes over pixels that may already contain them
  could duplicate ink, so a composite is explicitly unavailable. The ink is kept as strokes at the
  recorded revision.
- The crop is a frozen region of its frame, not a live observation or provider input.
- Producing a verified ink-free background, or a composite the AI actually receives, needs a
  runtime check on a Mac and a lead-owned capture-filter or wire decision.

## Checks

```sh
swift build --package-path apps/macos/CompanionDesktop
COMPANION_DESKTOP_FIXTURE_DIR=... COMPANION_DESKTOP_INGRESS_FIXTURE_DIR=... \
  swift test --package-path apps/macos/CompanionDesktop                 # 37 tests
```

Ten XCTests in `Tests/DesktopCaptureTests/InkTests.swift`, on synthetic points plus real recorder
frames. They exercise the library model, store, cropper, geometry check and unsaved-ink holder;
the app controller, alert and termination paths are not in the test target.

| Test | What it checks |
| --- | --- |
| Write, erase, undo, redo | NAV refuses input. A stroke is written, then erased through its middle into two pieces ending at the eraser's edge (x = 42 and 58), with interpolated end points marked and the original kept. Undo and redo run in both directions and stop at the ends. A new stroke clears redo. Operation sequences are contiguous. |
| Sparse-segment erase (new) | The lead's case: stroke (0,10)→(100,10), eraser (50,0)→(50,20), with neither sample within 8 pt. The drawn line is cut to (0,10)–(42,10) and (58,10)–(100,10); recorded samples stay exact; parent, anchor, interpolated time, pressure and tilt; undo/redo. A line exactly 8 pt from a single eraser point is not cut; one 4 pt from it loses the chord (43.072…56.928). A vertex inside the eraser cuts both adjacent segments. |
| Mouse gating and pen facts | Mouse input is refused until the toggle is on. Pen points keep event time, pressure and tilt, and the pen's eraser end erases. |
| ASK | WRITE → ASK → Finish → WRITE, WRITE → ASK → Cancel → WRITE, and NAV → ASK → Cancel → NAV. A click without area is refused. The pinned context is kept; the region maps to pixels, with x and y scaled separately (a 2 × 3 control); the revision when drawn (2) differs from the committed revision at the frame's admission (1); `establishedHost` and `host` differ. Without a capture directory no crop is made, and the reason is recorded. |
| Actual crop | A real FrameStore PNG is cropped:<br>- the region is rounded outward, and the crop's SHA-256 and length equal the file;<br>- its pixels equal the original's columns (±1);<br>- the original's bytes are unchanged;<br>- a changed original, or a region outside the frame, gives no crop. |
| Pinned frame A→B (new) | A region is drawn while frame A is the latest; frame B is kept before Finish. The selection and its crop are frame A's. The crop is the **bottom-left pixel only** (an asymmetric crop, offset vertically): it matches A's pixel there (±1), differs from B's, and A's top row differs. A display rotation during the drag, and one after the region was drawn but before Finish, each leave the pinned frame referenced with no pixels and the problem recorded; changing back does not re-establish the mapping. Only the mapped selection wrote a crop. A region ended without context has no frame. |
| Closing input | A stroke in progress is kept as `interrupted`, and later input, mode changes and undo are refused. An unfinished erase changes nothing. ASK is cancelled, with the reason in its detail. |
| Save, reopen, edit | A save to `ink/ink.json` and an exact reload. The atomic write option itself is not exercised. Reopening in a later session appends `reopened` and continues the revision, and times before the reopening give an unknown revision. A store that never read the file, and a file changed on disk, are both saved beside, with the changed file untouched. With explicit save times, the reopen search skips an empty session, another display and a non-user layer, returns the newest file, conflict copies included, and honours `excluding`. A non-user layer is refused on load. |
| Conflict reopen (new) | The lead's case: `ink.json` changed externally, newer work saved as a conflict copy; the search returns that copy, and it loads the newer revision; excluding it returns the older original, unchanged. A corrupted `ink.json` with a valid newer conflict copy: the copy is found and opens, editing it saves to the same copy, and the corrupted file is untouched. |
| Unsaved ink (new) | Saves fail persistently (a file where `ink/` belongs). A document closed at an earlier Stop and one with a stroke in progress closed at Quit (kept as interrupted, reason `app_quit`) are both held, and a retry keeps both. When one location recovers, a retry saves it once as `ink.json`, with nothing beside it, and releases it. Export into a missing folder writes nothing; into a real folder it writes a new file that loads with the same strokes and operations, and releases it. Discard drops what is held. |

The desktop-ingress tests gain one refusal case, `ink_overlay_scope`, inside an existing test; the
reader shares `RetainedOriginal`, unchanged.

**Portable witness (executed, not Swift).** A line-by-line Python port of `remainder`,
`erasedIntervals` and `interpolate` (local `/tmp/lc-desktop-sim/erase_port.py`, not committed)
reproduces every erase value asserted above, including the lead's sparse case. It also passed
3,000 randomized trials: no kept piece comes within 8 pt of the eraser (sampled), and every
original sample farther than 8 pt lies on a kept piece. It does not execute Swift, AppKit or the
tests.

## Access steps for an interactive Mac (QA)

These have not been run.
1. Build `package-app.sh`, open the app, grant screen recording, choose a display, and press Start.
   The Ink palette appears at the display's top-right.
2. **NAV:** the original app responds normally.
3. **WRITE:**
   - With a pen, write, erase part of a stroke (also a fast, sparse stroke erased between its
     samples), undo and redo.
   - With a mouse, confirm it writes only after the mouse toggle is on.
   - Confirm the app underneath does not respond, then choose NAV and confirm it does.
4. **ASK:** from WRITE, drag a region over moving content, wait for a newer frame, press Finish,
   and confirm WRITE resumes. Inspect `ink/ink.json` and `ink/selections/*.png`: the crop is the
   frame on record when the drag ended.
5. **Stop mid-stroke.** Before the stroke, make CompanionDesktop the active app, for example with
   ⌘-Tab (the ink panels never activate it). Then press ⌥⌘. while the pen or mouse is still down. The
   stroke is kept as interrupted, and the overlay disappears. The menu bar's Stop works only when no
   stroke is in progress.
6. **Restart capture and reopen.** The earlier ink returns and can be edited. Change its
   `ink.json` externally, write more, restart and reopen: the newer conflict copy opens.
7. **Unsaved ink and Quit.** Make the session's `ink/` unwritable, write, then Quit both during
   capture and after Stop: capture ends, the warning shows, and Quit is held until Save Again (after
   restoring access), Export… or Discard.
8. **Display change.** Rotate or resize the display during capture: the overlay refits, and ASK
   regions get no pixels until capture restarts.
9. **Record:**
   - whether kept frames contain the overlay and palette;
   - palette clickability without activating the app, and its position after a display change;
   - pen proximity and pressure;
   - Spaces and full-screen behaviour;
   - multiple displays.

## Evidence levels

| Level | State |
| --- | --- |
| Source written | Library model, store, cropper, geometry check, unsaved-ink holder, app overlay/palette/controller, termination hold and tests. **Uncompiled** on this Linux host. |
| Hosted build and the 37 tests | **not_run.** Root's hosted workflow compiles and runs them. |
| Erase geometry | A Python port executed (above); not Swift execution. |
| Overlay, palette, pointer routing, Quit alert, pen hardware, Spaces, multiple displays | **not_run:** source only, needs an interactive Mac. |
| Whether frames contain the overlay, composite, AI receipt | **Unknown, not implemented or not run**, as described above. |
| Content-anchored display, both display modes (INTENT-INK-MODES), purpose, Notability | **Not implemented.** |

## Review outcome (first delivery, `3aaff3a`)

`wf_d4e44c1e-ffa` (7 agents: compile, behaviour and requirements, test trace and doc lenses, each
verified adversarially) and the targeted re-check `wf_384efe38-120` (2 agents) both found no compile
error, and all 33 tests traced as passing. Both were reading only; nothing was compiled.

Confirmed findings, all fixed in `3aaff3a`:
- **Save failures.** A failed save at capture end, or when reopening, dropped in-memory ink. The
  document was then kept and retried at the next capture start or end, and at quit. Reopen required
  a successful save first. (The lead found this still insufficient at Quit; see below.)
- **Reopen search.** It could fork the open document into an unreachable conflict copy, and picked
  sessions by name regardless of display. It became a display-matched, most-recently-saved search
  that excluded the open document.
- **Revision after reopen.** The revision at a frame could name a revision from an earlier session.
  It is now scoped after the last reopening, and unknown before it.
- **ASK freshness.** It paired a live verdict with an older retained frame. It now states when the
  verdict does not apply.
- **Interception notice.** It was not persistent. It now stays in the palette and main window.
- **Composition text.** It claimed a crop that had failed. It now states that no crop exists.
- **Size check.** The original's size is now checked before its bytes are read.
- **Refusal text.** A `MappingRefusal` reason is now shown as its localized description.
- **Tests.** The WRITE→ASK→Cancel→WRITE test was missing, and doc wording needed corrections.

Refuted: that a stream error needs an extra gate check in pointer handling. The one main-turn
latency is disclosed, and host times order the strokes against `liveEndedHost`.

## Correction of the held delivery

The lead's review (`b407478`) held `3aaff3a` for five same-owner corrections and a scope decision.
Each is corrected in existing files; no new dependency, target or framework.

| Lead finding | Correction | Where |
| --- | --- | --- |
| P1: Quit with a persistently failing save exited with originals only in memory; mode and start hints replaced the failure message. | `applicationShouldTerminate` now ends capture and input at once, writes the ending, and holds Quit while `UnsavedInk` is non-empty (Save Again / Export… / Don't Quit / Discard and Quit). A Quit held while starting shows the Start as stopped. The warning is a separate published value shown in the palette, main window and menu bar. | `CompanionDesktopApp.swift` (`AppDelegate`), `CaptureController.quitRequested/endForQuit`, `InkController.mayQuit/exportUnsaved/unsavedWarning`, `Ink.swift` `UnsavedInk` |
| P2: ASK Finish used the frame current at Finish (A→B). | The region is pinned to `SelectionContext` (frame, capture session directory, native session, display, freshness, geometry validity) and ink revisions when the drag ends; Finish crops the pinned frame. | `Ink.swift` `PendingSelection`, `end(host:selection:)`, `finishAsk(geometryProblem:inkDirectory:host:)`; `InkController.selectionContext/pointerUp/finishAsk` |
| P2: erasing the visible middle of a sparse segment did nothing. | Erase cuts the drawn segments: each eraser segment's reach is a convex capsule, met in one parameter interval; pieces end at interpolated, marked points. | `Ink.swift` `applyErase`, `remainder`, `erasedIntervals`, `interpolate`; `InkPoint.interpolated` |
| P2: newer conflict copies could not be reopened. | The search includes conflict copies, returns the file, and `InkStore(documentFile:)` opens that exact file; exclusion is by file (open document, held unsaved). | `Ink.swift` `InkStore`; `InkController.reopenLatest` |
| P2: refitted overlay points were mapped with startup display size. | `DisplayGeometry` marks the mapping unverified after a known size or rotation change, until capture restarts; pending and later selections get no pixels. | `Ink.swift` `DisplayGeometry`; `InkController.captureStarted/displayChanged` |
| Lead: add an asymmetric vertical crop control. | The pinned A→B test crops the bottom-left pixel only. | `InkTests.swift` |
| Lead scope decision: do not rely on `.none`. | Sessions record the actual filter and unknown panel inclusion; the mapper refuses them explicitly; released values unchanged. | `CaptureRecords.swift` `inkOverlayScope`, `DesktopIngress.swift`, `CaptureController.openSession` |

The lead's prepared regressions (`proposed-regressions.swift`) were adapted into the sparse-erase
and conflict-reopen tests; they are counted only as the tests above, which are **not run**.

**Correction review.** `wf_3c2dc0b1-3a6` was read-only, with 5 agents: compile/API, behaviour
against the lead's findings, and test trace, each lens followed by a skeptic.
- **Compile/API and test trace:** no compile error, and no failing assertion across the 10 ink
  tests and the new refusal case.
- **Fixed, confirmed:** a Quit handled after a stream error had closed the gate (off the main
  thread), but before its main-thread report, skipped closing and saving the open document. Quit
  now closes ink input whenever a run exists.
- **Hardened, refuted as speculative:** the geometry check now reads `CGDisplayBounds`, so it runs
  even when AppKit lists no screen for the display. The ASK test also gains a non-uniform scale
  (2 × 3) control.
- **Refuted:** the reopen control only reaches the newest other document (that is its design); and
  the 8 pt reach is measured from the stroke centreline (a documented tolerance).

This review was reading only; nothing was compiled.

## Remaining gates and next owners

- **A44 and the §7.1 second gate:**
  - an original-screen selector or pen reaching the same AI context;
  - composite pixels the AI receives;
  - no anchor drift under scroll or zoom;
  - no intercepted navigation.

  These need content-anchored ink, a verified composite path, the real provider and interactive
  tests.
- **A26:** needs real pen hardware. It also needs pen writing while the page stays navigable with
  the mouse, trackpad or scroll wheel (WRITE currently intercepts them), and non-drifting,
  content-anchored context.
- **A27:** needs offline and restart on a Mac, synchronization without duplicates or overwrites, and
  an AI-additions layer, which does not exist yet.
- **A30:** needs branches and return to key originals linked to a problem.
- **A31:** needs rapid page-change handling, human-reference comparison and reported gaps.
- **Shared mapping** for the new scope value: the lead.

The structured operation history here is a contribution toward these, not a partial pass.
- **Next:** the lead reviews this correction and runs the existing hosted macOS build and tests.
  The native owner fixes actual compile or test failures first. Real-Mac QA follows when an
  authorized interactive session exists.
