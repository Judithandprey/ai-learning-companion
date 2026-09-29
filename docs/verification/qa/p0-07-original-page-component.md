# QA component pass: original-page WebExtension capture at `b8ec18e`

- **Assignment:** lead `handoff_cf720e444dd9b5b8f7fe476fd347776e`. This is the one component pass in
  [the plan](p0-07-original-page-plan.md), "Desktop browser capture pass". It is not a new campaign.
- **Candidate:** main `b8ec18ec782af4bcc2c035f1da73e84c253047a7`. It contains `fb4450f`, `f934855`,
  `c6e6cfc` and the fixture-port prerequisite.
- **Decision: not accepted as a component pass.** 31 of 38 checks pass. The 7 failures are two
  medium defects in one boundary: a crop that is presented as the marked region after the page moved
  during the capture (QA-EXT-01, QA-EXT-02).
  - Both reproduce with real browser scheduling, without the timing stand-in.
  - Everything else passed, including the reviewer's B1/B3 corrections exercised in a real browser.
- **Scope:** a desktop component check only.
  - It is not Safari, iPad or Pencil evidence, and not AI or continuous whole-display observation.
  - It is not editable ink and does not count toward either core gate. No ink or WRITE trial was run.
- Evidence: [summary.json](p0-07-original-page/component-b8ec18e/summary.json) and PNGs in the same
  folder. Harness: [tests/e2e/web/original_page](../../../tests/e2e/web/original_page/README.md).

## Environment

- Windows Edge 154.0.0.0 (HeadlessChrome UA), driven from WSL2 over CDP.
  - Each run used a fresh temporary profile, removed afterwards.
  - Viewport 1246×903 at devicePixelRatio 1.
- **Candidate copy:** an exact copy of `b8ec18e`.
  - `provenance.py` found 84 tracked files, all matching.
  - `build-webextension.mjs --check` reports `content.js` and all three icons current.
  - The loaded folder is exactly the 6 tracked files, hash-equal to the shipped folder.
- **Manifest:** loaded unchanged, `activeTab` + `scripting` only.
- **Invocation:** DevTools `Extensions.triggerAction` on the page's tab. It runs the extension's own
  `action.onClicked` and the real `activeTab` grant, but it is not a human toolbar click.
- **Pages:** the owned synthetic course page `fixture/course.html`, on `LC_WEB_FIXTURE_PORT=4184`.
  4184 was checked free on both the WSL and the Windows side. For the public page:
  `https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors`.
- **Untouched:** 4173, 8174, the user's preview, `lc_desktop_preview`, Paperclip, databases, accounts
  and providers.
- **Final runs:**
  - pass: 2026-09-29 13:23:18–13:24:40 UTC;
  - repro: 13:24:41–13:25:25 UTC.
  - Harness file hashes are in `summary.json`. The same `run.mjs`, `qa-cdp-runner.ps1` and
    `analyze.py` produced both runs and the analysis.

### Instrumentation and timing labels

- **Pass-through wrapper:** `chrome.tabs.captureVisibleTab` is wrapped inside the worker. The wrapper
  records each call, the active tab at capture and at return, and the exact PNG returned. With no
  delay, it adds one `tabs.query`, measured at 0 ms.
- **Timing stand-in:** in the stand-in cases only, the wrapper waits 700 ms before and 1600 ms after
  the real capture, so an action can land inside the capture window. Each check carries its own
  label.
- **State reading:** state is read through the worker, in the extension's isolated world.
- **Page changes:** changes in lifecycle cases are harness-issued (`window.scrollBy`, DOM or style
  edits, `pushState`), not human gestures.
- **Input:** CDP mouse and pen, not Pencil.
- **Independent verification:** `analyze.py` decodes every returned PNG. It recomputes the hash,
  size, crop statistics and what the crop shows. The marked figure on the owned page is the magenta
  block `#d81b60`.

## Findings (owner: Web; lead integrates)

### QA-EXT-01 (medium): scrolling away and back during the capture shows other content as the marked region

**Steps**
1. Start the companion and press ASK.
2. Pen-mark the magenta block.
3. Scroll the page by 300 px, then back to the original position, before the answer arrives.

**Expected:** the image was taken while the page was scrolled, so the region should be reported
unknown with no crop, as for a one-way scroll. Alternatively, the result is refused.

**Actual**
- The status is `received`, with geometry `{known: true}` and crop `78,246 132×53` shown.
- The shown pixels are the lecture-video banner (mean `[23,42,64]`, 0 % magenta), not the marked
  block.
- The received image has the block at rows 0–12 instead of 233–312.
- The product hash equals the returned bytes, so this is what the extension received.

**Reproduction**

| Run | Timing | Result |
| --- | --- | --- |
| `owned.scroll_away_and_back` | stand-in | failed |
| `repro.scroll_away_and_back` | stand-in, new profile | failed |
| `repro.real_timing_scroll_away_and_back` | no injected delay | 15 attempts, away/back 0–40 ms apart: in 5 the image was taken while scrolled; 3 of those showed the wrong region; 10 did not exercise the case |

- The request-to-receipt window is 52–72 ms.
- Evidence: `f6-scroll-away-back-*`, `r1-*` and `r4-real-timing-scroll-1-*`.

**Cause**
- `viewGeometry` (`capture-evidence.ts:75–88`) compares only the view at the request with the view
  at the answer, and later at the final fence.
- Its own docstring and the owner test title promise that "any scroll, zoom or resize in between"
  gives an unknown region.
- Nothing listens for scroll or resize during the window. Only `visibilitychange` and a
  MutationObserver are attached.
- This is the same endpoint-only pattern that B3 rejected for tabs.

**Minimal direction:** follow the existing `hiddenDuring` guard. Mark the view changed on any
`scroll`/`resize` event during the window, through the final presentation fence:
- a capture-phase `scroll` listener on `window`, which also catches inner scroll containers;
- `resize` on `window`;
- `scroll`/`resize` on `visualViewport`.

When the view changed, keep the image and report the region unknown with no crop.

**Regression:** the stand-in and real-timing cases above, plus the stable positive control
`owned.region_real_pixels`.

**Not tested**
- iPad Safari rubber-band bounce and inertial reverse flicks.
- Safari capture latency.
- Inner-container scrolling. By code inspection, even a one-way scroll of an inner container is
  probably not detected, because `ViewState` records only window scroll.

### QA-EXT-02 (medium): a same-address layout change during the capture shows other content as the marked region

**Steps**
1. Pen-mark the magenta block.
2. Inside the capture window, make one of these changes:
   - insert a 300 px element at the top of the page; or
   - set `paddingTop: 300px` on the paragraph above the block, a style change only.

**Expected:** the marked content moved in the image, so the region should be unknown with no crop,
or the result refused.

**Actual**
- The status is `received`, geometry known, and the crop is shown.
- The shown pixels are 100 % white; the block is at rows 533–612 or 550–629 in the image.
- For the inserted element, the only disclosure is the generic note "The page updated its content
  while the image was taken (1 change observed); the image may show them." It does not say the crop
  may not be the marked content.
- The style-only change has no note at all. `pageUpdates` is 0, because the observer watches
  `childList`/`characterData`, not attributes.
- Layout moves with no DOM mutation (image or font loading, CSS transitions) are uncovered by
  inference from the code; they were not run.

**Reproduction**

| Run | Timing | Result |
| --- | --- | --- |
| `owned.content_shift_same_address` | stand-in | failed |
| `repro.content_shift_same_address` | stand-in | failed |
| `repro.style_shift_same_address` | stand-in | failed |
| `repro.real_timing_style_shift` | no injected delay | style change 0–30 ms after the mark: 4 wrong; in 1 attempt the change landed after the capture |

- Evidence: `f7-content-shift-*`, `r2-*`, `r3-*` and `r5-real-timing-style-shift-0-*`.

**Minimal direction** (no new architecture; Safari has no Layout Instability API):
- Record the rect of the page element(s) under the mark at the request, reusing the `frameUnder`
  sampling.
- Re-measure them at receipt and at the final fence. If they moved, the region is unknown and no
  crop is shown.
- Watch attributes too, or at least word the note so it says the crop may not show the marked
  content.
- Apply the same in-window approach as QA-EXT-01, so a change that reverts inside the window is also
  caught.

## Passed (31)

- **Integrity** (`runner_clean`, `provenance`, `permissions`):
  - both runs had exit 0 and no failed step;
  - the copy is exact, the generated files are current, and the loaded folder is exactly the tracked
    files;
  - the manifest has only `activeTab` + `scripting`, with no content scripts, host permissions,
    web-accessible resources or external messaging.
- **No access before the action; start in place** (owned and public):
  - there is no companion before the action, and `captureVisibleTab` is refused ("activeTab
    permission is required");
  - after the action, the companion runs on the same address, with no import and no other page.
- **Labels** (`labels.dependency_not_live`):
  - the panel says it captures only on a mark: one snapshot per mark, not continuous, no AI or
    provider, and "nothing was sent or stored". That last sentence is the product's statement;
    network and storage were not observed;
  - every received image says "(not live)".
- **Navigation in NAV** (owned and public):
  - page links and wheel scrolling work, with zero captures;
  - on Wikipedia, an in-page citation link moved to its target.
- **Real pixels:**
  - owned figure: the hash and size equal the returned bytes. The crop lies inside the block and is
    exactly `#d81b60`, identical to a DevTools screenshot (mean abs diff 0.0);
  - public: a rendered formula, a figure, and the formula again after restart. In each case the crop
    contains the element's box, the recomputed statistics equal the product's, the crop is not blank,
    and it matches DevTools (0.0).
- **Source and times** (`owned.source`, `public.source`, `owned.times`):
  - the recorded origin, path and title equal the actual page;
  - mark ≤ request ≤ capture ≤ receipt;
  - request-to-receipt is 43 ms on the owned page.
- **Same-document address change after a snapshot:** the snapshot stays "(not live)" with its own
  page.
- **Video labels:** a mark over the playing video labels mark-time media as such, and the "Video in
  the image: position unknown" line is shown (the C2 correction).
- **Scroll after the mark, real timing:** the region is unknown with no crop.
- **Resize during the capture** (stand-in; DevTools metrics override, not a window resize): the
  region is unknown with no crop.
- **Tab A→B→A with B also granted** (stand-in), which exercises B3 in a real browser:
  - with a harness-issued product capture message, the browser captured tab B, and A was active
    again when the capture returned;
  - the real background refused: "the visible tab changed while capturing". The stable control was
    accepted;
  - in the product flow, the mark was refused ("the tab was hidden during the capture"), and B's
    image was not shown.
- **Background update fence:** a `pushState` during a harness-issued request is refused ("the tab
  navigated or changed while capturing").
- **Navigation during a capture:** the new page has no companion, panel or badge. The background's
  answer to the old request is not observable there.
- **Stop:**
  - Stop after the request was sent removes the toolbar and panel, clears the badge, and shows
    nothing. With the stand-in, the real grab ran at 13:24:00.949, after Stop at 13:24:00.532, and
    its result was discarded;
  - one action then starts a fresh companion (0 captures, 0 retired, no record), and the next mark
    captures the real block pixels;
  - the panel's Stop with a trusted mouse click works, clears the badge, and a restart works;
  - after the final Stop, pen input reaches the page's own pointer listeners (1 down, 1 up) and
    nothing is captured;
  - on the public page: Stop removes everything and clears the badge, the page still scrolls, and a
    restart is fresh.
- **Non-web page:** on `about:blank` the action does not start and the button shows "!" with a "cannot
  run" title. The refusal came from the browser's scripting error, not the product's own `http(s)`
  check, because `tab.url` was not exposed.

## Not tested or out of scope

- **Reviewer evidence only:** Stop or timeout during the paint wait (B2/C1) and decode-time address
  change (B1 control). These deterministic probes were not replayed.
- **Non-top-frame refusal:** no iframe page and no `frameId ≠ 0` request. The top-frame-only
  injection and the sender check were inspected in code only.
- **Other lifecycle cases:** reload, back/forward (bfcache), tab close, browser zoom, devicePixelRatio
  other than 1, and inner scroll containers.
- **Platforms and interaction:** Safari, iPad, Pencil, human toolbar click, AI or provider, and ink.
- **Earlier runs:** runs before the harness was hardened were superseded and their raw data was not
  kept. They were:
  - one pass run at 12:56;
  - repro runs at about 13:01 and 13:03.

  Their outcomes were consistent. The same two classes failed and everything else passed. Real-timing
  counts were 4 of 15 and 3 of 15 wrong, and 3 of 5 wrong for the style shift, counted over all
  attempts, not only the exercised ones. The final evidence is from the 13:23 runs only.

## Reproduce

```sh
git archive b8ec18ec782af4bcc2c035f1da73e84c253047a7 | tar -x -C /tmp/qa-origpage-b8ec18e
# build the fixture dist in the copy: node <lead repo>/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
QA_SOURCE=/tmp/qa-origpage-b8ec18e QA_BASELINE=b8ec18ec782af4bcc2c035f1da73e84c253047a7 LC_WEB_FIXTURE_PORT=4184 \
  node tests/e2e/web/original_page/run.mjs /tmp/qa-origpage-run-N
QA_SCENARIO=repro QA_SOURCE=... QA_BASELINE=... LC_WEB_FIXTURE_PORT=4184 node tests/e2e/web/original_page/run.mjs /tmp/qa-origpage-run-N
python3 tests/e2e/web/original_page/analyze.py /tmp/qa-origpage-run-N docs/verification/qa/p0-07-original-page/component-b8ec18e
```

**Next:** Web fixes QA-EXT-01/02, and lead integrates. QA reruns this pass on the exact corrected
candidate. The two failing classes must then show `kept unknown or refused` on exercised attempts.
