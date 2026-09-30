# macOS original-screen ink: first screen-fixed local loop

Task: the lead's same-card continuation `handoff_39ad28c9fe5443869bc722dfb9c72a7b` (P0-03/11 →
P1-02/P2-03), with its scope clarification `handoff_10e19e782507a60efb52a320c34dab77`. The start
notice was `handoff_34afd5716f9c353879198db1ab79f9a3`.

Baseline: main `061efe287fd965b5a8fcfeced36f1309c2540e2f`, normally merged into `team/ios` as
`12eae15`. The only conflict was the ingress mapping record, where main's corrected text was kept.
`apps/macos` equals main at that point.

Read:
- §7.1, §7.2, §7.4 and §7.8 (English);
- R08, R46, R51, R52 and R59;
- A26, A27, A30, A31 and A44;
- the independent display/purpose/destination dimensions and INTENT-INK-MODES;
- the retained iOS `InkStore`/`InkFile` rules, which were reused.

This is a **bounded local component milestone**, not A44 or a §7.1 gate pass. Content-anchored
display, physical pen input, real composite capture, AI receipt, audio and Notability are open.

## Outcome

While capture runs, a transparent, non-activating overlay panel lies exactly over the explicitly
selected display, and a small floating palette offers the controls.

| Step | Behaviour |
| --- | --- |
| NAV (default) | The overlay ignores the pointer, so the original app stays operable. Nothing is drawn or selected. |
| WRITE | **Pointer input over the display's page area goes to the ink layer.** The menu bar, the Dock and the palette stay usable. The palette and main window show this persistently while in WRITE or ASK, and NAV restores ordinary navigation of the app underneath.<br>- **Pen input writes.** Tablet points keep `NSEvent` timestamp, pressure and tilt.<br>- **The pen end** is looked up by `NSEvent.deviceID` from app-level (local and global) tablet-proximity monitors. The entry is reset when the pen leaves proximity; when no proximity event was seen, the device is recorded as `tablet_other`. This is **untested on hardware**.<br>- **Mouse input writes only with the explicit mouse-writing toggle.** Otherwise it draws nothing, and the refusal is shown. |
| Partial erase | The eraser tool, or a pen's eraser end, removes the sampled points within 8 pt of its path. An affected stroke is replaced by its remaining runs as new pieces with `parent`. The original stays in the file.<br>Limit: only sampled points are tested. A segment whose two samples are both farther than 8 pt from the eraser is not cut, even where the drawn line passes under it. |
| Undo / redo | Undo reverses the last stroke or erase; redo repeats it. A new stroke or erase clears redo. |
| ASK | Drag a region, then Finish or Cancel. Either restores the mode active before ASK: WRITE → ASK → WRITE, or NAV → ASK → NAV. |
| ASK Finish | Records:<br>- the region in display points;<br>- the latest retained frame (sequence, file, SHA-256, length, size, callback and source time);<br>- the region mapped to the frame's pixels;<br>- the freshness verdict judged at that moment. When newer pixels were not kept, it states that the verdict does not apply to that older frame;<br>- the ink revision at confirmation, and the committed revision at the frame's admission (see below).<br>It writes an **actual crop** (see below). Nothing is sent or explained. |
| Continue writing | After Finish or Cancel, WRITE continues in the same document. |
| Save | Automatic after every stroke and operation (§7.2 "save locally at the end of every stroke"): the whole document, written atomically. |
| Reopen | The palette's reopen button opens the most recently saved earlier `ink.json` with strokes for the same display, and continues editing it.<br>- It skips the current capture session and the document already open.<br>- Conflict copies are not reopened.<br>- The open document is saved first; if that fails, nothing is reopened.<br>- The file stays where it is (an earlier session's `ink/`), and a `reopened` operation continues its history. |
| Stop / error / sleep / quit | Input closes in the same main-thread call that ends live claims. A stream error closes it on the next main-thread turn, after the gate closed on the delegate thread.<br>- A stroke in progress is kept as `interrupted`; an unfinished erase or selection changes nothing and is recorded.<br>- The document is saved, then the overlay and palette are removed. If that save fails, the closed document is kept in memory and saved again at the next capture start, capture end or quit; the message says so.<br>- Input after closing is refused. |
| Display change | When the selected display stays online but its parameters change, the overlay is refitted to the new screen frame and a `display_changed` operation is recorded. Strokes keep their recorded coordinates. |

Modes are input routing only, separate from any teaching state. Writing never requests an
explanation, and ASK only records a region.

## The document (`<capture session>/ink/ink.json`)

`InkDocument`, written with the recorder's `CaptureFiles` JSON (sorted keys, millisecond UTC).

- **Header.** Schema 1, `layer: user_original`, `authorship: user`, `displayMode: screen_fixed`,
  plus explicit statements of what is not implemented and of the overlay's capture uncertainty.
- **Coordinates.** Display-local points: origin at the display's top-left, y down.
- **`strokes`.** Every stroke ever made, erased and undone ones included. Each stroke has an ID and
  number, device, width and points, and a `parent` for erase pieces. Its `interrupted` flag marks a
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
- **Also:** `undoStack`, `redoStack`, `selections` and `revision`.

**Saving.** The iOS ink store's rules are reused. Every save writes the whole file atomically. A
file that changed on disk since this store last read or wrote it, or that exists but cannot be
read, is never replaced; the document is saved beside it as `ink.conflict-<id>.json`. Nothing is
deleted, and a document of another schema or layer is refused on load.

**Other layers.** AI additions never go in `ink.json`; none are produced. Purpose (note, draft or
final answer) is not required per stroke and is not inferred here. Destinations and Notability are
not touched.

## ASK pixels and composition (actual crop, no composite)

`SelectionCropper` produces the crop:
1. It re-reads the exact retained original under the same policy as the desktop-ingress reader
   (`RetainedOriginal`): a `frames/NNNNNNNN.png` path, no symbolic links, containment inside the
   session, `O_NOFOLLOW` plus an `fstat` regular-file check. The SHA-256 and length must still
   match.
2. It decodes the PNG, checks its size against the record, rounds the region outward to whole
   pixels, clamps it to the frame, and crops without scaling or rotation.
3. It writes the crop losslessly as a new, uniquely named `ink/selections/<id>-<random>.png`.
4. The selection records the crop's file, SHA-256, length and integral pixel rectangle, and how it
   was made. A failure is recorded as `cropProblem`. The original is only read.

**Pixel mapping.** Points are scaled by frame size over display size in points. `contentRect` and
`scaleFactor` are not applied; this is unverified on a Mac.

**Composition.**
- The capture filter is unchanged. But the overlay and palette set `sharingType = .none`, so the
  released scope text every session records ("this app's windows are captured when visible") is
  **unverified for these two windows** until a Mac run shows whether ScreenCaptureKit captures them.
  A corrected scope description is a lead/contract item; it is not changed here.
- The overlay and palette panels set `NSWindow.sharingType = .none`. That ScreenCaptureKit honours
  this is **not assumed**. A kept frame, and so its crop, may or may not contain this ink or the
  controls. Each selection states this, and records the committed ink revision at the frame's
  admission time, or that it is unknown.
- **No ink composite is rendered.** Rendering the strokes over pixels that may already contain them
  could duplicate ink, so a composite is explicitly unavailable. The ink is kept as strokes at the
  recorded revision.
- The crop is a frozen region of its frame, not a live observation or provider input.
- Producing a verified ink-free background, or a composite the AI actually receives, needs a
  runtime check on a Mac. It may also need a capture-filter or wire change (a new scope description
  or composite artifact kind in the released contracts), which is not made here.

## Checks

```sh
swift build --package-path apps/macos/CompanionDesktop
COMPANION_DESKTOP_FIXTURE_DIR=... COMPANION_DESKTOP_INGRESS_FIXTURE_DIR=... \
  swift test --package-path apps/macos/CompanionDesktop                 # 33 tests
```

Six new XCTests in `Tests/DesktopCaptureTests/InkTests.swift`, on synthetic points plus a real
recorder frame:

| Test | What it checks |
| --- | --- |
| Write, erase, undo, redo | NAV refuses input. A stroke is written, then erased through its middle into two pieces, with the original kept. Undo and redo run in both directions and stop at the ends. A new stroke clears redo. Operation sequences are contiguous. |
| Mouse gating and pen facts | Mouse input is refused until the toggle is on. Pen points keep event time, pressure and tilt, and the pen's eraser end erases. |
| ASK | WRITE → ASK → Finish → WRITE, WRITE → ASK → Cancel → WRITE, and NAV → ASK → Cancel → NAV. A click without area is refused. The region maps to pixels. The revision at confirmation (2) differs from the committed revision at the frame's admission (1). Writing continues after ASK. |
| Actual crop | A real FrameStore PNG is cropped:<br>- the region is rounded outward, and the crop's SHA-256 and length equal the file;<br>- its pixels equal the original's columns (±1);<br>- the original's bytes are unchanged;<br>- a changed original, or a region outside the frame, gives no crop;<br>- a selection without a crop records why. |
| Closing input | A stroke in progress is kept as `interrupted`, and later input, mode changes and undo are refused. An unfinished erase changes nothing. ASK is cancelled, with the reason in its detail. |
| Save, reopen, edit | A save to `ink/ink.json` and an exact reload. The atomic write option itself is not exercised. Reopening in a later session appends `reopened` and continues the revision, and times before the reopening give an unknown revision. A store that never read the file, and a file changed on disk, are both saved beside, with the changed file untouched. The reopen search skips an empty session, another display and a non-user layer. It picks the most recently saved document and honours `excluding`. A non-user layer is refused on load. |

The desktop-ingress reader now shares `RetainedOriginal`. Its behaviour and messages are unchanged,
and the earlier 27 tests still cover it.

## Access steps for an interactive Mac (QA)

These have not been run.
1. Build `package-app.sh`, open the app, grant screen recording, choose a display, and press Start.
   The Ink palette appears at the display's top-right.
2. **NAV:** the original app responds normally.
3. **WRITE:**
   - With a pen, write, erase part of a stroke, undo and redo.
   - With a mouse, confirm it writes only after the mouse toggle is on.
   - Confirm the app underneath does not respond, then choose NAV and confirm it does.
4. **ASK:** from WRITE, drag a region, press Finish, and confirm WRITE resumes. Inspect
   `ink/ink.json` and `ink/selections/*.png`.
5. **Stop mid-stroke.** Before the stroke, make CompanionDesktop the active app, for example with
   ⌘-Tab (the ink panels never activate it). Then press ⌥⌘. while the pen or mouse is still down. The
   stroke is kept as interrupted, and the overlay disappears. The menu bar's Stop works only when no
   stroke is in progress.
6. **Restart capture and reopen.** The earlier ink returns and can be edited.
7. **Record:**
   - whether kept frames contain the overlay (`sharingType`);
   - palette clickability without activating the app;
   - pen proximity and pressure;
   - Spaces and full-screen behaviour;
   - multiple displays.

## Evidence levels

| Level | State |
| --- | --- |
| Source written | Library model, store, cropper, app overlay/palette/controller and tests. **Uncompiled** on this Linux host. |
| Hosted build and the 33 tests | **not_run.** Root's hosted workflow compiles and runs them. |
| Overlay, palette, pointer routing, pen hardware, Spaces, multiple displays | **not_run:** source only, needs an interactive Mac. |
| Whether frames contain the overlay, composite, AI receipt | **Not implemented or not run**, as described above. |
| Content-anchored display, both display modes (INTENT-INK-MODES), purpose, Notability | **Not implemented.** |

## Review outcome

`wf_d4e44c1e-ffa` (7 agents: compile, behaviour and requirements, test trace and doc lenses, each
verified adversarially) and the targeted re-check `wf_384efe38-120` (2 agents) both found no compile
error, and all 33 tests trace as passing. Both were reading only; nothing was compiled.

Confirmed findings, all fixed:
- **Save failures.** A failed save at capture end, or when reopening, dropped in-memory ink. The
  document is now kept and retried at the next capture start or end, and at quit even without a run.
  Reopen now requires a successful save first.
- **Reopen search.** It could fork the open document into an unreachable conflict copy, and picked
  sessions by name regardless of display. It is now a display-matched, most-recently-saved search
  that excludes the open document.
- **Revision after reopen.** The revision at a frame could name a revision from an earlier session.
  It is now scoped after the last reopening, and unknown before it.
- **ASK freshness.** It paired a live verdict with an older retained frame. It now states when the
  verdict does not apply.
- **Interception notice.** It was not persistent. It now stays in the palette and main window.
- **Composition text.** It claimed a crop that had failed. It now states that no crop exists.
- **Size check.** The original's size is now checked before its bytes are read.
- **Refusal text.** A `MappingRefusal` reason is now shown as its localized description.
- **Tests.** The WRITE→ASK→Cancel→WRITE test was missing, and doc wording needed corrections (test
  rows, access step 5, interception wording, open-gate lists, and the scope-text caveat).

Plausible findings, addressed but runtime-dependent:
- **Pen end tracking.** It now uses app-level proximity monitors keyed by `deviceID`; this is
  unverified on hardware.
- **Display geometry changes.** The overlay is now refitted and a `display_changed` operation is
  recorded.

Accepted as a documented limit: partial erase tests only sampled points.

Refuted: that a stream error needs an extra gate check in pointer handling. The one main-turn
latency is disclosed, and host times order the strokes against `liveEndedHost`.

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

The structured operation history here is a contribution toward these, not a partial pass.
- **Next:** the lead reviews and host-builds this commit. Real-Mac QA follows when an authorized
  interactive session exists. The native owner fixes actual compile or test failures first.
