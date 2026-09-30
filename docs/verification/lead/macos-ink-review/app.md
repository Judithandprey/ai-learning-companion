# macOS ink app/controller review — HOLD

Exact candidate: `3aaff3a3abcae29636537732e654b670ae14e34b`, parent `12eae15` (normal merge of main `061efe2`). Exact export: `/tmp/macos-ink-3aaff3a`.

Reviewed the complete app call paths in `InkController.swift`, `InkViews.swift`, `CaptureController.swift`, `ContentView.swift`, with necessary callers in `CompanionDesktopApp.swift`, relevant InkSession methods, package configuration and author report. Library storage/model is assigned to the other reviewer; cropper/ingress and shared capture-scope policy belong to lead. No source edit, Git mutation, native compilation/run, UI input, installation, service/provider or team message was performed.

Applied project PONYTAIL LITE and current workflow. Refreshed the affected original/English §7.1/7.2/7.4, R08/R46/R51/R52/R59 and A26/A30/A31/A44, current decisions and language policy at committed main `f73df5a6d3696fc5a13236d485fa716e6f3e85dc`. All four original/English document pairs match the translation manifest's content hashes. The bounded screen-fixed component cannot pass both full desktop gates or erase content-anchored/AI/pen/Notability requirements.

## N1 — P1: Quit discards originals when the final save retries still fail

Primary locations: `InkController.swift:78–97`, `231–235`; `CaptureController.swift:356–365`. Relevant unchanged caller: `CompanionDesktopApp.swift:48`, `63–74`.

Source call path:

1. A stroke or interrupted stroke is in memory; the ink directory becomes unwritable or storage remains full.
2. Stop calls `captureEnding`, closes input, attempts save, and retains the failed session/store only in the private in-memory `unsaved` array. The visible message promises retries at next start/end/quit.
3. Quit calls `NSApp.terminate(nil)`. The app observes `willTerminateNotification`; `CaptureController.terminate()` retries `saveUnsaved()` and returns immediately if capture already ended. For an active run it closes/saves ink, retries again, and then returns after finishing capture.
4. `saveUnsaved()` returns no result and simply keeps failures in the array. There is no durable backup/export of these originals and no termination veto/delay. AppDelegate only answers the separate last-window-close question. Thus a persistent save failure leaves the only newest original/history in process memory when normal Quit exits.

This is a source-established data-loss path, not a performed Mac test. Apple documents `applicationShouldTerminate(_:)` as the decision point for cancelling/delaying Quit, while `willTerminateNotification` arrives after termination has been allowed. The implementation uses only the latter. [Apple termination decision](https://developer.apple.com/documentation/appkit/nsapplicationdelegate/applicationshouldterminate(_:)), [Apple termination notification](https://developer.apple.com/documentation/appkit/nsapplication/willterminatenotification).

Minimal correction: make pending unsaved ink observable and part of normal termination approval. Close capture/input immediately, but retain the process and originals until a durable save/export succeeds or the user explicitly chooses discard. Reuse the existing InkStore/session state; no separate archive framework is needed. Cover both quit with an active capture and quit after an earlier Stop with persistent write failure.

Associated visibility defect: `InkController.setMode` calls `save()` at line 112, then unconditionally replaces its failure message with ordinary NAV/WRITE/ASK text at lines 113–120. `captureStarted` likewise replaces any older pending-unsaved state with the normal NAV message after a silent `saveUnsaved` retry. A failure must remain visible independently of the mode hint until resolved. This is especially relevant when changing modes settles an in-progress stroke whose first durable save fails.

Suggested Mac or app-controller seam regression: inject a store that keeps throwing, write a stroke, Stop, then invoke normal Quit; expect capture to be stopped, the original still recoverable, and Quit held with a retry/export/discard decision. Repeat while capture is active. A later successful save must allow Quit without duplicating or overwriting originals.

## N2 — P2: ASK binds the selected rectangle to a later frame at Finish

Primary locations: `InkController.swift:143–166`, `260–274`; `InkViews.swift:33–43`. Necessary model call path: `Ink.swift:294–310`, `333–350`, `380–408`.

Reproduction by source trace:

1. While retained frame A is current, enter ASK and drag a rectangle. `pointerDown` creates an anchor but `InkSession.begin` stores only `.select(points:)` for ASK.
2. Mouse-up calls `session.end`, which stores only `pendingSelection` rectangle. UI says `Region selected: Finish keeps it, Cancel drops it.` No frame/session/display/freshness snapshot is pinned with it.
3. A video advances or page content changes and capture publishes retained frame B.
4. Click Finish. `finishAsk()` now fetches `capture.status.lastKept` and current display/freshness, passes frame B to `SelectionCropper`, and stores frame B in the selection. The chosen region's content silently changes from A to B even though the user has not drawn another region.

This contradicts §7.2's fixed source/frame selection when content continues moving. It is independent of whether the cropper correctly crops its supplied frame. The existing ASK unit test supplies one SelectionContext directly and does not exercise delayed Finish through the app controller.

Minimal correction: pin frame identity, capture-session directory, display geometry and contemporaneous evidence state when the selected region is established (and use explicit unknown when no suitable frame exists). Finish/Cancel should consume that pinned selection; new capture callbacks must not retarget it. Add a focused A→B-before-Finish regression at the controller boundary. This is source analysis; no Swift emulation or native assertion was run.

## Geometry/source seams handed to lead

`InkController.displayChanged()` (217–227) refits the overlay to the current `NSScreen.frame` and records new dimensions. `finishAsk()` still passes `status.display`, which was constructed once in `CaptureController.openSession`; the frame output also keeps its initially configured size. The model's `pixelRect` divides by that original display size. Therefore a resize/rotation can combine new display-local points with old geometry. For example, a 1280×800→800×1280 change retains the old denominators even though the overlay now uses the new point bounds. The exact new stream image transform is intentionally unverified; it must remain unknown/revalidated instead of being treated as established alignment. Lead owns this mapping policy and the separate released scope text versus new `sharingType = .none` issue; this report does not duplicate those patches.

Palette placement is calculated only at start; its accessibility after screen geometry changes remains a native runtime check. No claim is made that AppKit does or does not automatically reposition it.

## Positive source findings and limits

- The implementation uses a real AppKit `NSPanel`/`NSView`, not an owned frozen canvas presented as an overlay. NAV sets `ignoresMouseEvents = true`; WRITE/ASK take pointer input, with a persistent interception note. Mouse drawing is explicitly gated by `mouseWritingEnabled`. Pen provenance uses tablet subtype/proximity, retaining event timestamp, pressure and tilt where present.
- WRITE/ASK pointer interception is a documented component limitation. It does not demonstrate ordinary mouse/trackpad navigation while pen writing, A26, real pen hardware, full-screen/Spaces coverage, or A44. Actual panel focus, hit-testing, transparent redraw, pen-end recognition and mixed-device events need a Mac.
- Stop/sleep/disconnect close the capture live gate before awaiting stream shutdown. Leaving `.capturing` invokes `captureEnding` synchronously on the main actor. `closeInput` preserves an active stroke as interrupted, clears pending selection/erase, changes to NAV, and closes input before panels disappear. A stream error reaches this app-side closure on the next main-thread turn as documented. This review does not re-open the previously reviewed capture gate implementation.
- ASK finish/cancel restores the previous input mode in the model; it sends no provider request and does not grant answer disclosure. Original stroke anchors retain native session/frame/time; the stale-retained-frame caveat is explicit at Finish. N2 concerns binding at the wrong time, not fabricated pixels or a cropper hash failure.
- Opening earlier ink first attempts a save; a failed pre-open save leaves the current document open. Interrupted originals whose later closure-save fails are retained in memory. N1 is the missing final quit protection, not absence of all in-session recovery.
- Accessibility labels, mode-selected traits and disabled undo/redo state are present in source. No accessibility runtime pass is claimed.

## Build/API evidence

The package declares Swift tools 6.0, Swift language mode 5, macOS 15, executable product/target `CompanionDesktop`, and the local `DesktopCapture` dependency. `package-app.sh` remains mode 100755 and builds/copies that executable into the matching Info.plist bundle. Portable plist parsing confirms `CFBundleExecutable=CompanionDesktop`, `LSMinimumSystemVersion=15.0`; `git diff --check` for the package delta passed.

A bounded second API inspection found no concrete signature/deployment blocker in InkController/InkViews/Package by inspection. Relevant Apple declarations match `.tabletPoint`, integer `deviceID`, NSPoint `tilt`, pen/eraser proximity cases, panel style masks and floating levels. Main-actor callbacks extract event values before dispatch and mutate actor state inside `MainActor.assumeIsolated`. [Tablet subtype](https://developer.apple.com/documentation/appkit/nsevent/eventsubtype/tabletpoint), [device ID](https://developer.apple.com/documentation/appkit/nsevent/deviceid), [tilt](https://developer.apple.com/documentation/appkit/nsevent/tilt), [pointing device type](https://developer.apple.com/documentation/appkit/nsevent/pointingdevicetype-swift.enum), [NSView](https://developer.apple.com/documentation/appkit/nsview), [SwiftUI View](https://developer.apple.com/documentation/swiftui/view).

**UNCOMPILED; all 33 declared XCTests NOT_RUN here.** The test target depends only on `DesktopCapture`; its six new tests do not execute the AppKit controller/termination/UI call paths above. Source review, API documentation and another reviewer's agreement do not establish build or test success. Hosted compilation/tests are still needed after corrections; they will not establish interactive Mac acceptance.

No duplicate implementation or changes were made in main, owner worktree, or exported production source. Existing Windows review evidence is preserved. Return N1/N2 plus lead's mapping/scope corrections to the same native owner; perform only the focused changed-boundary regressions before the hosted build and later authorized Mac QA.
