# macOS ink correction app review — APPROVE for hosted compilation

Candidate **`d258856abbf621613fa3ed8a049cb34101924112`**, parent **`3aaff3a3abcae29636537732e654b670ae14e34b`**. Exact read-only export: `/tmp/macos-ink-d258856`. Review date: 2026-09-30.

**No concrete remaining app/controller blocker found in the assigned correction paths.** The previous normal-Quit data-loss path, delayed-ASK retargeting and known-geometry mapping seam are corrected in source. This is approval to integrate this source scope and attempt the existing hosted macOS build/tests, subject to the separate pure-domain review. It is not compile, test, AppKit runtime or full product acceptance.

Applied project PONYTAIL LITE and current workflow. Revisited the complete held README/app/domain findings and current correction report. The already-read affected original/English requirements and decisions (§7.1/7.2/7.4; R08/R46/R51/R52/R59; A26/A27/A30/A31/A44), AGENTS/TEAM/role/workflow remain unchanged from the earlier `f73df5a6` context refresh through the main revision checked here, `feafefceac7d9314a291974b57b7e79ac80e71a6`. No requirements were narrowed to the current screen-fixed component.

## App-side correction findings

### N1: normal Quit with persistently failing ink saves

The new actual call path is:

`NSApp.terminate` → `AppDelegate.applicationShouldTerminate` (`CompanionDesktopApp.swift:99`) → `CaptureController.quitRequested` (`CaptureController.swift:358`) → `endForQuit` → `InkController.mayQuit` (`InkController.swift:117`). A pending document therefore participates in the termination decision before `.terminateNow` can be returned.

- `endForQuit` closes a pre-session Start gate and shows an ended phase. Late display enumeration cannot open a session: unchanged `CaptureStart.run` checks the closed gate after `find`. If a stream start is already awaiting, the closed gate causes its completed start to be stopped by `stopStarted` instead of becoming a new live capture.
- For an active run, the gate closes before ending/recording; `ink.captureEnding` is called **regardless of whether this invocation closed the gate**. Thus the reviewed stream-error race is covered: if the ScreenCaptureKit delegate already closed the gate but its main-thread report has not arrived, Quit still closes input and transfers failed saves into `UnsavedInk` before deciding termination.
- `captureEnding` closes the active gesture, saves or keeps the session/store, removes overlay/palette, and clears open state. Existing Stop/sleep/error calls still use this closure; ordinary post-Stop Quit calls `mayQuit` even with no active run.
- In `mayQuit`, Save Again retries; Export opens a directory picker and releases only successful read-back exports; canceling the picker changes nothing and returns to the decision; Don't Quit returns false; only the explicitly destructive fourth button calls `discard`. An export/save failure leaves the loop and held originals intact. `.terminateCancel` keeps the process for unresolved work. No retry-only fall-through to normal termination remains.
- `openSaveProblem`/`unsavedWarning` are separate from ordinary mode/start hints and observed by the palette, main status and menu item. The normal setMode/capture-start/end refresh paths preserve unresolved warnings.
- `stopStream` still guards one request per run. On a held Quit, a started stream is asked to stop asynchronously; a still-starting stream is stopped when start returns. The live admission gate and ink input close synchronously, while completion of the native stop remains asynchronous.

Source trace expectations, **not executed Mac tests**: persistent disk failure + active stroke + Quit holds the interrupted original; failure after earlier Stop also holds; cancel Export or Don't Quit preserves held data; successful save/export or explicit discard allows Quit; Quit after an off-thread stream error still closes the open document. These exact UI/termination cases remain required interactive checks.

### N2: ASK context established at drag end

`InkController.pointerUp` (`:315`) passes `selectionContext()` to `InkSession.end`; it pins native session, capture directory, display facts, retained frame, contemporaneous freshness and geometry problem. `PendingSelection` additionally retains established host time and both ink revisions. `InkController.finishAsk` (`:207`) no longer reads current capture status; the library consumes the pinned context and crops that frame's retained original.

The source A→B trace now uses A at Finish even after B is published. Missing context stays explicitly unrecorded, and a missing or altered pinned file yields a refusal/crop problem instead of a replacement frame. Finish and Cancel retain the previous-mode restoration, with no provider request or teaching permission inferred. The separate domain reviewer owns detailed crop/ink math and test assertions.

### Geometry and conflict-file integration

`captureStarted` initializes geometry from the selected run's recorded facts and compares the actual overlay screen bounds/rotation. `displayChanged` (`:262`) reads CoreGraphics bounds and rotation even if AppKit temporarily has no matching screen, then refits only when one exists. `DisplayGeometry.problem` is sticky for this capture; both a problem at selection establishment and one detected before Finish suppress pixel mapping/cropping. Returning to startup dimensions does not clear it; restarting capture creates fresh geometry. Original stroke coordinates/history and pinned frame references remain retained.

`reopenLatest` (`:226`) now excludes exact open/held file URLs, receives a selected document file and opens `InkStore(documentFile: found)` at `:239`. It no longer converts a selected conflict path back into the older fixed `ink.json`. It saves the open document first, keeps it open on failure, and retains any failed close in `UnsavedInk`. Pure file discovery, conflict preservation, erasure and export/storage behavior are the other reviewer's scope.

### Capture scope and released mapping

`CaptureController.openSession` still configures `SCContentFilter(display:excludingWindows: [])`; the recorder now uses `DisplayFacts.inkOverlayScope`. It states the actual empty filter and unknown overlay/palette inclusion despite `sharingType = .none`. No exclusion proof or composed PNG is fabricated.

`DesktopIngress.displayJSON` (`DesktopIngress.swift:627`) explicitly refuses the new local scope prefix before checking the unchanged released scope set. New local originals remain intact and cannot be mislabeled as the old 0.2.7 scope. Existing old-scope records/fixtures retain their mapping path. No shared contract file is changed by this delivery. Additive mapping remains lead-owned.

## Executed checks and limits

- All **13 changed export files** match their exact raw Git blobs. Inventory: `/tmp/macos-ink-correction-app-review-source.json`.
- `git diff d258856^ d258856 --check`: passed.
- Static declaration count: **37 XCTest methods** (20 capture + 7 ingress + 10 ink). **All 37 NOT_RUN here.** The test target depends only on `DesktopCapture`, so it does not execute AppDelegate, InkController, CaptureController, NSAlert or NSOpenPanel.
- Package, plist, packaging script and ContentView are unchanged. The package remains Swift tools 6.0 / language mode 5 / macOS 15; executable and plist entry are `CompanionDesktop`; `package-app.sh` remains executable mode 100755. Plist parsing passed. No concrete new compile blocker was identified by source inspection, but **source is UNCOMPILED**.
- No Swift port, fake AppKit execution or model-agreement “pass” substitutes for compilation. Author source-trace claims and the prior Python erasure witness were not treated as native results.

Normal-quit retention protection does not establish recovery from force-kill, crash, power loss or termination that bypasses `applicationShouldTerminate`; the fallback `willTerminateNotification` only retries. Export currently saves document JSON; crop files remain at their existing paths and there is no import UI, as documented. This is not a self-contained archive/Notability flow.

Actual modal alert/button behavior, cancellation, native stream-stop completion while Quit is held, panel/mouse/pen routing, screen-parameter notifications, Spaces/full-screen behavior and true capture inclusion still need an authorized interactive Mac. The hosted workflow can compile and run the declared library tests, but cannot establish these behaviors. The one-main-thread-turn stream-error input-closure limit remains documented. Content anchoring, simultaneous underlying-app navigation while WRITE intercepts, real AI receipt, audio and both full desktop gates remain open.

No main/worker files or Git state were modified; no app/native launch, dependency install, DB, provider, service, network research or Chats occurred. Only `/tmp` review files were written. Existing Windows findings/artifacts are preserved.
