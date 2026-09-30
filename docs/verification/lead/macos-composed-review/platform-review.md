# macOS raw/composed capture — bounded platform source review

**AppKit/filter/render integration: approve for the next hosted compile/test step within this source scope. Composed-image fidelity evidence: HOLD for one narrow P2 validator/test correction below.** No production rendering failure has been demonstrated. No Swift code was compiled or executed here, and the 42 declared XCTests remain NOT_RUN in this review. Approval does not cover the separate core recorder/pairing/revision/Stop review or real-device/product acceptance.

Reviewed exact `1539a7cb50935cc9eebc6c778595995baf7157ee`, parent `3355763` normal merge. Export `/tmp/macos-composed-1539a7c`; all **30/30** package files match exact Git bytes. `/tmp/macos-composed-platform-source.json` records hashes and the declared test inventory: 20 capture + 7 ingress + 10 ink + 5 composition = **42**, across four files. Read the exact delivery report `docs/verification/platform/macos-raw-composed-frames.md`; model-review agreement is not used as evidence.

Applied project PONYTAIL LITE and workflow. Refreshed affected original/English R35/R36/R46/R51/R52/R59, §7.1/7.2/7.4, A26/A30/A31/A44 and current decisions; source/English manifest hashes agree at this candidate. Preserved whole-display/real-AI and live-original-screen/ink as separate gates, editable originals, gaps/unknowns, independent sharing controls and source context. This is local composed-image preparation only.

## P2 — validator accepts collapsed stroke width

Paths at this candidate:
- `apps/macos/CompanionDesktop/checks/validate_composed_frames.py:151–179`
- `apps/macos/CompanionDesktop/Tests/DesktopCaptureTests/InkCompositionTests.swift:180–190`

The validator requires ink along each recorded stroke's centreline, then allows either raw or blended pixels everywhere within the width envelope. It never requires any ink away from the centreline. Consequently a complete synthetic session recording **4-point strokes at 2× scale (8-pixel width)** but rendering **1-pixel-wide lines** has no reported inconsistency. All 22 existing negative controls still report errors; they do not exercise width collapse. The Swift fixture's positive pixel assertions also inspect only centreline points, the erased middle and distant background pixels, so they do not close this gap.

This is a demonstrated false-pass of the fixture checker, **not Swift output and not evidence that the current `InkComposer.render` draws thin strokes**. Rendering source actually sets `stroke.width` under the scale transform. The gap matters because the delivery claims overlay/composed width equivalence and meaningful geometry validation.

Minimal owner correction: on the existing constant-width fixture, assert ink at known interior off-centre pixels (comfortably inside the expected width, away from antialiasing/erase boundaries), in Swift and/or the independent validator as appropriate; add a width-collapse negative control whose hashes/lengths remain self-consistent. Preserve existing centreline/flip/scale/background checks. No new renderer, protocol or generalized graphics-validation framework is needed.

Reproducer: `/tmp/macos-width-probe-1539a7c.py`; actual captured output `/tmp/macos-width-probe-1539a7c.log`; model/PNG bytes are made in memory only. Run:

```sh
python3 -B /tmp/macos-width-probe-1539a7c.py
```

Observed: `validator problems: []`, `existing negative controls detected: 22 / 22`, `undetected existing controls: []`. This exercises the exact validator's `problems()` and all mutation controls. **Full directory-load/CLI `main()` was not run**; its non-vacuity conditions were inspected. The synthetic example uses width 4; the actual Swift fixture uses `InkSession.penWidth = 3.0`, hence 6 pixels at 2×. Choose the positive interior sample from that actual width; `(100,22)` lies inside both of these examples. Existing native tests have not been executed to establish such a width assertion.

## Positive source findings

- **Explicit filter and fallback** — `CaptureController.swift:178–180,231–268` enumerates shareable content including off-screen windows, identifies only the current process, and configures `SCContentFilter(display:excludingApplications:[ownApp],exceptingWindows:[])`. It records the actual chosen method and own-app identity. If no own app is listed, it selects the unchanged whole-display filter, uses the unknown-overlay-inclusion scope, and disables composition in both recorder and run. It does not rely on `sharingType = .none` to prevent double ink.
- **Scope and user claims remain bounded** — `CaptureRecords.swift:71–80`, `ContentView.swift:34,145–155`, and the ASK wording in `Ink.swift:447–456` qualify application exclusion as configured/unverified, preserve the fallback, and point to either a composed outcome or a refusal. `DesktopIngress.swift` explicitly refuses the new app-excluded scope under released 0.2.7/0.2.8. Actual inclusion of later panels, menus, alerts and under-window pixels needs an interactive Mac; these sources do not claim it is measured.
- **Main-thread snapshot → queue** — `CaptureController.receive` (`:326–337`) handles value status snapshots on the main actor, requests each newly kept sequence once, and obtains `InkController.compositionRequest` (`:132–147`) while ink is owned by that actor. `CompositionRequest`, `PairedInk`, `InkSpan` and the ink document/strokes are value types; `CaptureRun.compose` (`:81–86`) queues the snapshot onto the same serial recorder queue. This avoids reaching into mutable AppKit/session state from the background renderer. Detailed temporal pairing and Stop/draining correctness are owned by the other reviewer.
- **Geometry and rendering** — `InkComposer.request` (`InkComposition.swift:111–159`) maps display-local top-left points using actual frame dimensions / display point dimensions; known geometry change at/before the pixel time refuses composition, with notification lag explicitly disclosed. `render` (`:165–195`) draws the raw image at its original dimensions, then applies top-left/downward point mapping. Both overlay and composition use fixed sRGB (255,59,48), each stroke's width/order, round caps/joins and the same single-point dot convention (`InkViews.swift:19,52–65,75–91`). Source review does not prove actual AppKit/CoreGraphics output, Retina/rotation alignment, antialiasing equivalence or all contentRect/scaleFactor cases.
- **Raw remains independent** — the integration reads the retained raw PNG under existing path/hash/size checks, decodes at declared geometry when rendering, and publishes a distinct composed PNG through the existing FrameStore. Empty visible ink aliases the verified raw file instead of re-encoding. Raw and composed byte accounting remain separate. Failure handling/storage internals are covered by the separate recorder review.

## Hosted-run wiring and trustworthy evidence

The existing `Package.swift` uses Swift tools 6.0, Swift language mode 5 and a macOS 15 floor. The executable target imports AppKit/ScreenCaptureKit; XCTest depends on **DesktopCapture only**, so 42 library tests would not be interactive application validation.

Set `COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR` to a **new, nonexistent path** for the release `swift test` invocation, alongside the existing fixture variables. `InkCompositionTests.swift:80–88` intentionally fails if that leaf already exists. The test creates one child session directory and saves the actual generated PNGs/events/status/editable document there. After tests, run:

```sh
python3 apps/macos/CompanionDesktop/checks/validate_composed_frames.py "$COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR"
```

The validator expects exactly one child session directory. It checks actual byte hashes/lengths and decoded geometry, record/revision replay, time basis, raw/composed relationships, per-frame outcomes, file closure, status/byte accounting and existing negative controls. After the narrow width correction, preserve its complete output/exit status alongside the **actual Swift** fixture. Save the fixture and validator log in failure artifacts/hashes too. Keep `SYNTHETIC` labeling in evidence: the seven kept frames are encoded grey test buffers, not ScreenCaptureKit captures. Expected successful fixture: six composed outcomes (revision 0/1/2/3/4/4), five distinct composed files, one geometry refusal; one empty-ink outcome aliases raw. Existing ingress fixture adds `app_excluded_scope` for 26 refusal cases. Confirm these from actual hosted output rather than predeclaring them passed.

No Swift/native execution, UI/display/capture operation, networking, DB, provider, installs or worker/repository edits occurred in this review. Only read-only Git/source work and separately labelled Python synthetic-validator probing were permitted. Real permission/exclusion, capture-to-overlay alignment, pen input, app lifecycle/UI operation, composed provider delivery, both §7.1 gates and Notability outcomes remain open. Existing documented timing/notification, content-anchor, crash-journal and unreleased-wire limits are not erased by source approval.
