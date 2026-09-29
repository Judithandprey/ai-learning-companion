# QA integrated capture + editable ink pass at `1616cce`

- **Assignment:** lead `handoff_9be075fa70c023d3969e705825a2334f`. This is one browser-component pass
  that follows the [b8ec18e component pass](p0-07-original-page-component.md). It is not a new campaign.
- **Candidate:** main `1616cceb1a1fe21a4444919c07477faf749f71c1`. Web source is `c484a42`, `e1669df`
  and `3ea7c9d`.
- **Decision:** the 35 listed ink assertions pass, and QA-EXT-01/02 are closed for their original steps. The
  capture component is **not accepted** yet, because of one new medium variant, **QA-EXT-03**.
  - Ink: 35 of 35 listed checks pass; this is not full durable-ink acceptance. Lead
    subsequently classified the recorded conflict/reload loss below as an existing R46/A27/§7.2 defect.
  - Capture retest: 42 of 44 checks pass. QA-EXT-01 (scroll away and back) and QA-EXT-02 (insertion
    and style shift) now yield region unknown with no crop, both with the stand-in and in real timing.
  - QA-EXT-03: a shift inside a page-owned open shadow root still shows other content as the marked
    region, with no note.
- **Scope:** browser component only, in desktop headless Edge.
  - It is not Safari, iPad, Apple Pencil or a real finger.
  - It is not a human toolbar click.
  - It is not AI or a provider, continuous whole-display observation, a native overlay, Notability
    import, or either core gate. Both complete core gates remain open.
- **Evidence:** [summary.json](p0-07-original-page/integrated-1616cce/summary.json) holds the capture
  checks and [summary-ink.json](p0-07-original-page/integrated-1616cce/summary-ink.json) the ink
  checks. The PNGs sit in the same folder:
  - all PNGs are from QA's owned page; public-page pixels are not published;
  - `*-capture.png` files are the exact bytes `captureVisibleTab` returned;
  - numbered `ink-01` through `ink-14` PNGs are DevTools screenshots;
    `ink-ask-capture.png` is the exact `captureVisibleTab` output.
- **Harness:** [tests/e2e/web/original_page](../../../tests/e2e/web/original_page/README.md).

## Environment

- Windows Edge 154.0.0.0 (HeadlessChrome UA), driven from WSL2 over CDP.
  - Each run used a fresh temporary profile, removed afterwards.
  - Viewport 1246×903 at devicePixelRatio 1.
- **Candidate copy:** `/tmp/qa-ink-1616cce`, an exact copy of `1616cce`.
  - `provenance.py`: 92 of 92 tracked files match.
  - `tsc -p tsconfig.build.json` passes.
  - `build-webextension.mjs --check`: `content.js`, `ink-format.js` and the three icons are current.
  - The loaded folder is exactly the 7 tracked files.
  - The manifest is unchanged: `activeTab` + `scripting`.
- **Ports:** only `LC_WEB_FIXTURE_PORT=4184`, checked free on the WSL and Windows sides.
- **Not touched:** 4173, 8174, the user preview, its exported identities or tokens,
  `lc_desktop_preview`, Paperclip, databases and providers.
- **Final runs** (2026-09-29 UTC):

  | Run | Time (UTC) | Content |
  | --- | --- | --- |
  | pass | 17:12:30–17:13:52 | owned page and Wikipedia |
  | repro | 17:13:53–17:14:58 | reproduction and variant cases |
  | ink | 17:17:51–17:19:13 | ink behaviour |

  - The committed `run.mjs`, `qa-cdp-runner.ps1`, `analyze.py`, `ink-steps.mjs` and `analyze_ink.py`
    equal the hashes recorded in the summaries.
- **Superseded runs:** the raw data is kept locally only.
  - One set of runs at 16:43–16:46 used the harness before the independent audit fixes. It gave the
    same capture outcome and 29/29 ink checks.
  - The first ink run at 17:15 failed five pixel checks for a harness reason. The CDP touch drag made
    an inertial fling, so the page was still scrolling 80 px while S2 was drawn. The drag was made
    slow, the settled scroll position (0) is now asserted, and the ink run was repeated. The raw data
    is kept as `raw-ink-superseded-fling.json`.

### Instrumentation

Every check labels its own instrumentation in the summaries.

**Product actions:**
- Start and stop use DevTools `Extensions.triggerAction`, which is the extension's own action and
  activeTab grant. It is not a human click, and it acts on the active tab.
- Product buttons are pressed with trusted CDP mouse clicks.
- Strokes use CDP mouse and CDP pen. The product names a pen mark `pencil_ask`; that is not Pencil
  evidence.
- One CDP touch-emulation drag stands in for a finger.

**Reads and spies:**
- a worker `captureVisibleTab` pass-through wrapper (with delays only in stand-in cases);
- a worker `runtime.onMessage` spy that records message types only;
- native IndexedDB reads in the worker, with read-only helpers and the product's own `parseInk`;
- DevTools DOM search of the product's card inside its closed shadow root, read-only;
- a page pointer counter.

**Page and tab controls (harness-issued):**
- main-world page edits: text, `pushState`/`replaceState`, `scrollTo`, and pausing the page video;
- CDP reload and navigate;
- tab creation and switching from the worker;
- a temporary title on tab B to target the action invocation.

**Test doubles:** two **forged** IndexedDB records.

## Finding (owner: Web; lead integrates)

### QA-EXT-03 (medium): a shift inside an open shadow root still shows other content as the marked region

This is a remaining variant of QA-EXT-02. Its reach is narrower, but one occurrence has the same
impact.

**Steps**
1. The page owns an open shadow component: a fixed-size host with a green block inside it.
2. Mark the green block with the pen.
3. Inside the capture window, the component moves its content down 100 px internally. The host keeps
   its box.

**Expected:** region unknown with no crop, as for the same move in light DOM (`repro.style_shift_same_address`).

**Actual**
- The status is `received`, geometry is known, and crop `78,205 132×53` is shown.
- The recomputed crop is 100 % white, 0 % green. In the received image the block is at rows 292–371
  instead of 192–271.
- `pageUpdates` is 0 and there is **no note**.

**Reproduction**

| Run | Timing | Result |
| --- | --- | --- |
| `repro.shadow_internal_shift` | stand-in | failed |
| `repro.real_timing_shadow_shift` | no injected delay (shift 0–30 ms after the mark) | 5 attempts: 3 wrong, 2 not exercised (the shift landed after the capture) |

- Positive control `repro.shadow_still_control`: the same component, not moving, keeps a known crop
  that is 100 % green.
- Evidence: `n2-shadow-shift-*`, `n2-real-timing-shadow-shift-wrong-0-*` and
  `n2-shadow-still-control-*`.

**Cause**
- `pageTopAt` (`extension-content.ts:307`) uses `document.elementsFromPoint`, which returns the shadow
  host. So `watchRegion` compares the fixed-size host with itself.
- Both MutationObservers watch only `document.documentElement` (lines 357 and 448), and mutations
  inside a shadow root never reach them.
- The module already looks into open roots for ink: `ink-layer.ts:243` `stackAt`.

**Minimal direction** (no new architecture):
- Reuse the open-root lookup of `stackAt` in `pageTopAt`.
- Also observe the open roots found on the sample stacks at the mark.
- Closed roots cannot be inspected. For those, a disclosed per-capture note plus a documented limit is
  acceptable.
- Until this is fixed, the lead's `web-ink-integration.md` statement that capture movement during
  acquisition is "conservatively unknown ... without labeling a mismatched crop known" needs a
  qualification.

**Regression:** N2 (stand-in), N2b (real timing), and the positive control N2c.

## Capture retest (passed: 42)

- **Closed findings:**
  - QA-EXT-01: scroll away and back gives "the page scrolled while the image was taken", with no crop.
    This holds in the stand-in (`owned.scroll_away_and_back`, `repro.scroll_away_and_back`) and in
    real timing (15 attempts: 6 exercised, all kept unknown, 0 wrong).
  - QA-EXT-02: content insertion and a style-only shift give "other content took the place of the
    marked content", with no crop and a clearer note. Real-timing style shift: 4 exercised, all kept
    unknown.
- **Changed-path negatives:**
  - Stop and an immediate restart while the old watched capture is in flight: the new companion
    shows the **new** capture. Its SHA equals the second call and not the first, and it was received
    after that call returned. The crop is known and 100 % magenta.
  - An in-place change of the marked element (same box): the change is in the image, the region stays
    at the mark, and the crop carries the note "the image, and any crop, may show those changes rather
    than what was marked". This is disclosed, and the mapping is correct.
- **Stable positive controls:**
  - owned figure: exact bytes, crop exactly `#d81b60`, identical to a DevTools screenshot;
  - Wikipedia formula, figure, and formula after restart: exact bytes, element inside the crop, not
    blank, identical to DevTools;
  - source, times and "(not live)" labels.
- All other b8ec18e component checks still pass: permissions, no access before the action, in-place
  start, NAV, tab A→B→A, background update fence, navigation, Stop and restart.
- `wrapper_logs_intact`: every wrapper read is present and the reads chain (15 fixture reads, 32
  repro reads).

## Ink behaviour (passed: 35 of 35)

- **NAV and default state** (`defaults_and_nav`, `nav_button`):
  - The companion starts in NAV with mouse writing off, the pen tool, content placement and a ready
    store.
  - In NAV, pen and mouse drags reach the page's own pointer listeners and draw nothing. That also
    holds after pressing the **NAV button** from WRITE.
  - WRITE comes back with the mouse setting, tool and placement kept.
- **Explicit mouse WRITE** (`write_mouse_off`, `pen_writes`, `finger_in_write_draws_nothing`,
  `mouse_enabled_draft`):
  - With Mouse off, a mouse drag draws nothing.
  - The CDP pen writes.
  - A slow one-finger CDP touch drag in WRITE draws nothing and scrolls the page.
  - The Mouse button enables mouse writing. A draft of pen, mouse and screen-fixed mouse strokes is
    saved, anchored and solid.
- **Partial erase and undo/redo** (`partial_erase`, `undo_redo_order`, `pixels_erase_undo_redo`):
  - The eraser replaces only the crossed stroke, with two `derived_from` pieces at its own place in
    the drawing order.
  - The original stays stored unchanged.
  - Undo restores the whole original at its place, and redo restores exactly the erased state.
  - Pixels: a 9-column gap only where the eraser passed, filled by undo and reopened by redo. The later
    stroke stays on top at the crossing in every state.
- **No automatic capture or help** (`writing_never_captures_or_explains`, `logs_intact`):
  - Drawing, erasing, undo and redo send only ink load/save messages, one save per change.
  - No capture request and no screenshot occur.
  - The card stays hidden.
- **ASK** (`ask_finish_restores_write`, `ask_cancel_restores_write`, `continue_writing`):
  - ASK from WRITE, with the eraser and screen placement active, then a finished pen mark.
  - Exactly one capture results. Its exact image contains the user's ink. The card reads "Source not
    registered … nothing was stored or explained".
  - The mode returns to WRITE with tool, mouse setting, placement and strokes unchanged.
  - Cancel works both through Cancel and by pressing ASK again (the ASK state is observed in between),
    with no capture.
  - Writing continues, and does not change the card.
- **Placements** (`placements`): after a 150 px scroll, content rows move from 300/380/460 to
  150/230/310, while the screen-fixed stroke stays at rows 339–420. A plain scroll never makes a
  stroke unverified.
- **Save, reload, reopen, edit** (`reopen`, `edit_reopened_originals`, `stored_documents_valid`):
  - After a CDP reload and a new start, the result is "reopened 5 stroke(s)": the same order, the same
    undo/redo depth, all solid, at the same pixels.
  - Mouse writing is off again, and there is no card.
  - A reopened stroke can be partly erased and the erase undone, and a new stroke added.
  - Every stored stroke stays unchanged, and the history only grows. All six stored snapshots parse
    with the product's reader.
- **Address and Stop** (`same_document_address`, `stop_in_write`):
  - A `pushState` address shows its own ink (none yet) and saves a stroke under that address.
    `replaceState` back shows the original ink again. Old ink is never shown on another address.
  - Stop in WRITE removes the toolbar, the panel and the ink drawing, and input then reaches the page.
    A restart reopens the saved ink in NAV.
- **Source uncertainty:**
  - `source_visible_change` and `source_dashed_pixels`:
    - A visible same-address text change makes content ink over that text dashed, and so is
      blank-margin ink, which is anchored to the page body.
    - Screen ink over an unchanged heading stays solid.
    - Reverting the text makes the ink solid again.
    - Pixels: one solid run before, 20 dashed runs after.
  - `source_held_stroke`:
    - The caption is changed while a stroke over it is held (no other stroke uses the caption, and the
      video is paused).
    - That stroke is unverified 120 ms after release, while a control stroke drawn over the changed
      caption is solid.
    - Reverting the caption flips both.
  - `source_offscreen_change`: at scrollY 500, heading ink becomes unverified when the heading
    changes off screen, and intro ink when the intro changes off screen. Both stay unverified after
    scrolling back.
  - `source_originals_kept`: the stored document is byte-identical through a visible change.
  - `reopen_verification`: this includes the negative control.
    - Reopening the unchanged page gives four solid strokes, and the control is dashed because its
      text is gone.
    - Reopening after the intro was edited before the start gives dashed intro and margin ink, while
      heading and caption ink stay solid.
- **Stored-data protection** (`unreadable_preserved`, `corrupted_after_load_preserved`,
  `conflict_two_tabs`):
  - **Forged double:** an unreadable record is reported ("could not be used … left untouched"), is
    never overwritten, and new ink stays in the tab.
  - **Forged double:** a record corrupted after load causes refused saves and refused retries. The
    record is unchanged, and the unsaved ink survives Stop and restart.
  - **Two real tabs** on one address, each started by the extension's own action with input on its
    own page:
    - B reopens A's stroke and saves its own.
    - A's next save is refused as a conflict, and the stored document keeps B's version.

## Recorded observations and subsequent lead disposition

1. **Conflict loses the refused stroke on reload.** A's refused stroke A2 is kept only in that tab,
   and after a reload A shows A1 and B1 without A2 (`conflict_reload_behavior`).
   - The product states this in its conflict text ("A reload shows the saved ink without it").
   - There is no merge or export, and no live notice before A writes.
   - The original QA handoff requested lead judgement. Lead subsequently checked R46/R51,
     A27 and §7.2: the observed loss violates existing local-save/reopen requirements; there is
     no pending user choice to allow it. Web now owns recovery alongside QA-EXT-03.
     The retained `pass` value describes the observed loss, not acceptance of that loss.
2. **Wording after corruption.** The hint says "the next change tries again". Every retry is refused
   while the stored record is unreadable. The main message ("cannot be read by this version … left
   untouched") is clear.
3. **Margin ink over-marks.** Margin ink is anchored to the page body, so any text change on the page
   marks it unverified. This is conservative over-marking, never under-marking.
4. **Browser swipe gesture.** A horizontal touch swipe in desktop Edge touch emulation is the
   browser's own back gesture: it navigated the tab away during a trial. That is browser behaviour,
   not the product's. iPad Safari edge swipes may behave similarly; this is untested.

## Not tested or out of scope

- **Device and platform:**
  - Safari and native Safari `importScripts`, iPad, Apple Pencil (pressure, tilt, hover, barrel or
    eraser end), and real finger routing on page controls;
  - a human toolbar click.
- **Capture variants:**
  - closed shadow roots, and scroll containers or iframes inside shadow roots (inferred from code);
  - layout moves with no DOM mutation (CSS transitions, late image or font loads);
  - browser zoom, DPR≠1, bfcache, and tab close.
- **Stop timing:** Stop mid-stroke or with a save pending, and Stop or timeout during the paint wait
  (reviewer evidence).
- **Out of scope:** AI or provider receipt, continuous whole-display observation, cross-app overlay,
  Notability import, and both core gates.

## Reproduce

```sh
git archive 1616cceb1a1fe21a4444919c07477faf749f71c1 | tar -x -C /tmp/qa-ink-1616cce
# in the copy: node <lead repo>/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
export QA_SOURCE=/tmp/qa-ink-1616cce QA_BASELINE=1616cceb1a1fe21a4444919c07477faf749f71c1 LC_WEB_FIXTURE_PORT=4184
node tests/e2e/web/original_page/run.mjs /tmp/qa-ink-run-N
QA_SCENARIO=repro node tests/e2e/web/original_page/run.mjs /tmp/qa-ink-run-N
QA_SCENARIO=ink node tests/e2e/web/original_page/run.mjs /tmp/qa-ink-run-N
python3 tests/e2e/web/original_page/analyze.py /tmp/qa-ink-run-N docs/verification/qa/p0-07-original-page/integrated-1616cce
python3 tests/e2e/web/original_page/analyze_ink.py /tmp/qa-ink-run-N docs/verification/qa/p0-07-original-page/integrated-1616cce
```

**Next:** Web fixes QA-EXT-03 and lead integrates. QA reruns N2, N2b and N2c, the conflict/corrupt-record recovery path and relevant
changed-path controls on the exact corrected candidate. Do not replay unrelated passing
cases without a changed path or concrete new risk.
