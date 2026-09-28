# P0-02 web probe: explicit selection and silent cards

Date: 2026-09-28 UTC. Owner: web (05). Baseline `91019c3fd548e47aca632136012bb961c4af07cb`,
contract `0.1.0` (unchanged). Scope: `apps/safari-extension/**`, `docs/verification/web/**`.
Targets: R01/R03/R06–R10/R46, G1, and A01–A03/A26 as supporting probes only. **Not** full acceptance.

## Status in one table

| Stage | Result |
| --- | --- |
| Source implemented | Yes: modes, input policy, gestures, frozen anchors/frames, silent cards, bridge web end, page layer (`apps/safari-extension/src`) |
| Compiled | TypeScript 7.0.2, `tsc -p tsconfig.json` exit 0; browser build `tsconfig.build.json` exit 0 |
| Automated checks | 44/44 unit tests; desktop self-test 42/42 (synthetic events); desktop trusted-input check 37 pass, 0 fail, 2 not verifiable in this environment |
| Contract conformance | All 11 submitted Selection/Frame/ExplanationRequest/ExplanationCard/BridgeRequest/BridgeResponse objects produced in the browser, plus 20 CapabilityResult rows, validate with `packages/contracts` (negative control rejected 5/5 corrupted objects) |
| Real provider connected | No. No explanation provider exists, and no native bridge exists (every bridge answer is a local `bridge_unavailable`) |
| Real device verified | No. No iPad Safari, no Apple Pencil, no packaged Safari extension |

Capability rows (contract `CapabilityResult` shape): [`capabilities.json`](capabilities.json).

## Commands and results

Toolchain: the lead's pinned Node 24.21.0 and TypeScript 7.0.2 from
`/home/agentsdock/Projects/learning-companion/repo`, used read-only. No dependency, lockfile
or root configuration was changed. The module has no runtime dependencies; tests use `node --test`
with Node type stripping and a small local declaration file instead of `@types/node`.

```text
$ BROWSER="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" apps/safari-extension/scripts/check.sh
node v24.21.0; Version 7.0.2
typecheck: pass
ℹ tests 44  ℹ pass 44  ℹ fail 0
build: pass
checks passed 42/42; failed: none                                  (edge-selftest)
trusted checks passed 37; failed: none; not verifiable here: nav.touch_scroll, nav.pinch_zoom;
  environment: control.touch_scroll=environment_unsupported, control.pinch=environment_unsupported,
  control.raw_touch_drag=environment_supported; runner errors: 0   (edge-trusted)

$ PYTHONPATH=. repo/.venv/bin/python apps/safari-extension/scripts/validate_evidence.py \
    docs/verification/web/capabilities.json docs/verification/web/evidence/edge-selftest.json
docs/verification/web/capabilities.json: 20 capability rows validated, 0 problems
docs/verification/web/evidence/edge-selftest.json: 11 submitted asks validated, 0 problems
```

Environment: Windows 10.0.26200 with Microsoft Edge 154.0.4258.37 (headless, Chromium), driven from
WSL2 (kernel 6.18.33.2, NAT networking); PowerShell 5.1 for the Windows-side CDP runner.

- The fixture is served only from `apps/safari-extension/fixture` and `dist`, bound to
  `127.0.0.1:4173`, and runs in the foreground only.
- Every run uses a fresh temporary browser profile in `%TEMP%`, never the user's profile. The profile
  is removed afterwards (checked: no `lc-*` directory remains).
- WSL interop starts Windows programs elevated. Edge then relaunches itself de-elevated and drops the
  headless arguments, so the harness passes `--do-not-de-elevate`. The elevated headless browser loads
  only the local owned fixture pages, with extensions and sync disabled.

## Evidence

| File | What it is |
| --- | --- |
| [`evidence/edge-selftest.json`](evidence/edge-selftest.json) | In-page self-test report: 42 checks, all produced contract objects, counters, API observations. **Synthetic events**, so it shows what the probe's listeners do, not native browser behavior |
| [`evidence/edge-selftest.png`](evidence/edge-selftest.png) | Real headless screenshot of the final self-test state (desktop, not iPad) |
| [`evidence/edge-trusted.json`](evidence/edge-trusted.json) | Trusted-input run: CDP `Input.*` mouse, touch and pen-type pointer events, native text selection, fullscreen with user activation, a cross-origin frame, a strict-CSP page, and a probe-free control page |
| `evidence/edge-trusted-00…08-*.png` | Real headless screenshots: initial state, finger ASK (provider unavailable), mouse ASK (fixture card), pen ASK (fixture card), container fullscreen with toolbar, ASK in fullscreen, `<video>` fullscreen (no overlay), cross-origin frame ASK with the card rendered by the top page, strict-CSP page |

The harness also writes `.log` files. They are git-ignored and not committed, because they contain local
temporary paths; their launch arguments are summarized above.

The frozen frames in these runs are `dom_snapshot` records: hashed page structure and state with no pixels.
The screenshots above are separate headless captures of the desktop page. They are not frames in the
contract sense, and no frozen frame was made from them.

## What the checks establish (desktop only)

- **NAV/WRITE never trigger explanations.**
  - 100 scripted ordinary gestures in unit tests produced 0 requests.
  - In the browser, request counts equal the deliberate ASK marks exactly (10 in the self-test, 5 in the trusted run).
- **Ordinary input is untouched in NAV:** trusted mouse clicks, finger taps, wheel scroll, raw finger-drag
  scroll, native mouse text selection, progress-slider drag and pen click all reached the page. In WRITE,
  mouse, finger taps and finger scrolling keep working, and only a pen draws ink.
- **Pen vs finger (§7.2):**
  - Before any pen is seen, a finger may mark in ASK.
  - After a pen has been seen, fingers navigate in ASK. This includes finger scrolling, and inside frames once the top page has seen a pen.
  - A second finger aborts a finger mark.
  - Page-script (untrusted) pen events are neither claimed nor counted as a pen.
- **Anchors are frozen:**
  - `media_position` is taken at the mark, and stays fixed while playback continues.
  - For the adjustable box, the position of the mark is kept even when the user confirms 1.5 s later.
  - Version 1 selections stay unchanged after the page publishes version 2.
  - Geometry is normalized to the frozen frame.
  - The on-page highlight re-measures after reflow, but the frozen data never changes.
- **Silent and honest cards:**
  - `audio: false` and `mode: silent`.
  - Only the exact fixture (source, version, text) shows a labeled fixture card; any other text shows "Provider unavailable".
  - Selected markup-like text is quoted as literal text, and the card contains only its six fixed elements.
- **Privacy:**
  - Hidden and `display:none` text inside a selection is excluded.
  - Snapshots drop the URL query and credentials and never read form values.
  - The bridge request carries exactly the contract fields.
- **Frames:**
  - The top page cannot read a cross-origin frame.
  - A probe running inside a same-origin or cross-origin frame follows the mode, selects in its own document with its own source, and reports completion.
  - The top page renders the card from its own fixture table; frames relay only identifiers and enums.
  - Messages that do not come from a child frame are rejected (checked by posting from the page itself).
- **Fullscreen:** in fullscreen of a container element, the toolbar, card and ASK work. In fullscreen of a
  `<video>` element (or iframe/replaced element) nothing can render, so the probe ends ASK, forces NAV
  and claims nothing.
- **Captions:**
  - Same-origin track cue text is recorded with the frame at freeze time.
  - Words in DOM-rendered captions (custom-player style) can be tapped and carry a media position.
  - A cross-origin track without CORS fails to load (readyState 3), so no cues are available.
- **Strict CSP** (`default-src 'self'; style-src 'self'; script-src 'self'`): the probe renders at its
  styled size with no violation reports, the page button still works, and an ASK on this unregistered page
  ends as "source not registered".

## Not verifiable here, and failures kept

- `nav.touch_scroll` and `nav.pinch_zoom`: CDP's synthesized touch scroll gesture and pinch did not scroll
  or zoom even on the probe-free control page, so they cannot be judged in this environment. They are
  recorded as `not_verifiable_in_environment` with `pass: null`. Raw `touchStart/Move/End` drags do scroll
  and were used instead.
- Findings from the first runs, with their fixes and regression checks:
  - Region text included page text hidden behind a fullscreen element; now hit-tested.
  - The highlight was misaligned after reflow.
  - The iframe card was clipped.
  - An inline host `style` attribute is blocked under a strict CSP.
  - A finger click was swallowed after pen ink.
  - The toolbar covers page text at the top right. This one is recorded, not fixed: the toolbar position needs a design decision.
- An independent multi-agent adversarial review (4 reviewers + 4 verifiers) confirmed further defects, now fixed:
  - Pen presence was not shared across frames.
  - Unrenderable fullscreen kept claiming input.
  - A pinch became a selection.
  - Click suppression lingered.
  - Page scripts could forge cards, ask completion and synthetic input.
  - Hidden text leaked into selections.
  - The adjust box froze media at confirm time.
  - Unknown media was recorded as 0 s.
  - Evidence names were not refreshed after a failed run, some rows were vacuous, and `pass: true` appeared on rows that were not verified.

  Two findings were refuted: the bridge frame record (a contract limit, not a probe defect) and quirks-mode viewport size (not reachable here).
- Still open, by design of this probe: mode and card coordination between frames uses `window.postMessage`.
  Scripts of a peer origin can post a mode message to a frame, and the frame then shows a visible
  "Ask mode" indicator with Cancel. The packaged extension must use extension messaging (background
  with `frameId`) instead.

## Documentation claims (read 2026-09-28; not executed)

Separated from the tests above. Sources are official Apple, WebKit, MDN browser-compat-data and
WHATWG/W3C pages.

- **Packaging:** a Safari web extension ships inside an iOS/macOS app.
  - App Store Connect documents a web-based Safari Web Extension Packager that works "without requiring
    a Mac or access to Xcode". It runs via the Xcode Cloud tab and uses Xcode Cloud hours
    ([packaging with App Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)).
  - It needs Apple Developer Program membership, which is a paid account decision for the user. **Not used; no action taken.**
  - Adding native messaging code is described with Xcode, so the need for Xcode is inferred.
- **Native messaging on iOS:**
  - Content scripts cannot send native messages; only the background script or extension pages can.
  - Messages reach the app extension's `beginRequest(with:)`.
  - The iOS app cannot push messages to extension JavaScript
    ([messaging](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)).
  - So bridge v0.1 needs a content script → background → native path, and results must be pulled.
- **Frames and permissions:**
  - `content_scripts.all_frames` is supported on Safari iOS 15+ (MDN BCD).
  - Per-site Ask/Allow/Deny permission is set by the user
    ([permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions)).
  - Safari-specific cross-origin frame injection rules: not found.
- **Fullscreen:**
  - Element fullscreen is on iPad (not iPhone) since Safari 16.4, with a system exit button that cannot be hidden
    ([WebKit 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/), MDN BCD).
  - Overlays over native iOS video fullscreen: only a legacy (2012) statement that full-screen video shows its default controls.
- **Pencil:**
  - Pointer Events cover stylus input; `Touch.touchType === "stylus"` is supported on Safari iOS 10+ (MDN BCD).
  - Safari 18.2 added Pencil altitude/azimuth and coalesced events.
  - That Pencil reports `pointerType "pen"` is implied, not stated.
  - Scribble works in editable web content, and no documented way to suppress it from web content was found.
- **Styles and CSP:**
  - Constructable stylesheets are supported in Safari 16.4+.
  - Whether page CSP applies to Safari content-script styles: not found (MDN says it varies by browser).
- **WebVTT:** without `crossorigin`, a cross-origin track fails to load (HTML fetch rules), matching the desktop observation.

## Real-device gaps and exact next checks (iPad Safari)

These need a packaged extension (Xcode on macOS, or the App Store Connect route after a user decision
on membership), a real iPad with Apple Pencil, and an authorized course page:

1. The toolbar appears. NAV/WRITE leave finger scroll, pinch zoom, links and player controls working
   (A03, and the §11 100-gesture script repeated by hand).
2. Pencil in WRITE writes without scrolling (`touchType "stylus"` handling). Fingers still scroll.
   Scribble does not intercept. A26 (ink anchoring stays P2/iOS scope).
3. Pencil ASK: tap, sweep and loop over text, captions and board. Finger ASK works only before any Pencil use.
4. A video platform iframe inside the course (e.g. Kaltura): injection with a permission for the frame's origin,
   captions (DOM or native), media position at the moment of the mark (A01).
5. Element fullscreen of the player versus native video fullscreen (expected unsupported), and the
   fallback return flow.
6. Content script → background → native `beginRequest` delivery of `selection.submit`, with the app
   returning an ACK. Pulling results, since the app cannot push.

## Dependencies and requests for the lead

- None blocking this delivery. No new packages are needed.
- For P0-08/P1 contract planning: the bridge path must go through the extension background (see above).
  A mouse region mark on desktop has no `Selection.input_mode` value, so the probe supports only
  `explicit_text_ask` for the mouse.
- Real selections need backend source registration before binding. The probe's source registry
  covers only its own fixture pages.
