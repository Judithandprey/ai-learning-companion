# QA-WIN-01 changed-behaviour retest on the real Windows display at `55478f0`

- **Assignment:** lead `handoff_23719545ab01bd2596f9d480049f7a88`, one bounded retest after the 0.2.10 API
  delivery. Start report: `handoff_5162a0a57b88d94982ea96299ec5411f`.
- **Candidate:** exact pushed main `55478f04cab0da3785718469ed69ac8f4e413d1f`. Its `apps/windows` tree is `9620eb8`,
  equal to Web `f277362`, and contains alignment `12fcf4f` / `7b18726` and the counter `c753c23`.
- **QA branch:** `team/qa` merged the candidate normally as `8537096`.
- **Decision: QA-WIN-01 is closed for the reproduced case, and the changed behaviour passes.**
  - One counted run gives **44 pass, 2 limit, 0 fail**.
  - The 2 limits are the same two Stop limits recorded at 061efe2 (W-I5, W-I8).
  - QA found no owner correction for the tested scope.
- **Input:** every stroke was a DevTools-injected pen or mouse event (synthetic). No physical pen, touch or human
  input was used, so none of this is device-verified pen evidence.
- **Display:**
  - The run took 16:14:49 to 16:17:48 UTC on the quiet shared display.
  - No foreign Electron was seen at start, at any of 23 screenshots, or at the end.
  - **The display has been released since 16:17:53 UTC.** The app exited 0 and no process was left.

## Environment and method

- **Host and app:**
  - Windows 11 10.0.26200, one display of 1280×800 DIP at scale 2.
  - Electron 44.5.1 (`electron.exe` sha256 `49b61a03…c7fa`).
  - The app was built fresh (`npm ci --offline`, `windows-stage buildAndStage`). The staged `dist` equals the build
    byte for byte; see `env.json`.
- **Isolation:** a fresh `LC_USER_DATA` and QA's own course page in a separate Edge profile. The user's own Edge was
  not touched. The cursor was never moved; it stayed at (545, 762) px, clear of every stroke.
- **Harness:** [tests/e2e/windows/](../../../tests/e2e/windows/). `run.mjs` now records the executed file hashes
  itself (`run.json`), and the committed files equal them.
- **Harness extension** (the 061efe2 flow is kept unchanged as the regression control):
  - a hidden fixed panel with exact glyph boxes in `course.html`;
  - a read-only cursor reading in the runner;
  - the app's per-stroke report and a direct GDI screenshot at the original QA-WIN-01 scroll;
  - a new session 4/5 segment.
  - For each observed state, the retained raw and composed PNGs are checked (file hash equals name), then
    classified along each saved stroke path: solid means the ink colour; dashed means never the ink colour and
    different from raw.
- **Label on app evidence:** the `__lcOverlay` reads are the app's own claims. Each is cross-checked against QA's
  GDI screenshots and the app's retained composed frames.

## Results against the assignment

| Assignment item | Check(s) | Actual at 55478f0 |
| --- | --- | --- |
| Body-text scroll, formerly coarse 0.049, must not verify ink | `alignment.moved_text_not_verified` **pass** (was the 061efe2 fail) | The hard case recurred exactly. The continued stroke over "The general solution is" has QA's old-rule coarse change 0.049 in both the reconstruction and a direct screenshot; 6.2 % of its pixels changed; the app's own coarse change is 0.0584, still ≤ 0.06. The app now reads it **changed** (detail 201×16, 281 moved cells). Counts after the scroll: verified 0 / changed 4 / unknown 1 (061efe2: 1/3/1). Scrolling back restores 4/0/1 (`alignment.content_moved_then_restored` pass). The plain check-mark stroke stays `unknown` |
| A small visible sign/digit change under ink | `alignment.sign_change_under_ink`, `alignment.digit_change_under_ink` **pass** | **Sign `x − 1` → `x + 1`:** only 98 physical px (0.85 %) changed in the stroke region (QA screenshot). The app goes verified → **changed** (60×48 grid, 26 moved cells) → verified when restored. The retained composed frame shows solid → dashed → solid. **Digit 3 → 8:** 700 px changed, 237 cells, the same sequence. Restored regions are pixel-identical |
| Unchanged content stays verified (control) | `alignment.unchanged_text_stays_verified` **pass** | The stroke over `E = ½ k A²` stays verified and solid at all 8 states; its region has 0 changed px |
| Writing across a changed frame | `context.write_across_changed_frame` **pass** | Pen down over "2", the page changes to "7" while held, writing continues. Saved: `writing_started` (point 0, frame 31) and `changed_while_writing` (point 6 of 10, frame 35), `changes_not_kept` 0. Both context pictures equal QA's screenshots of "2" and "7" (within 24 levels 1.000, no ink in raw). The stroke is **changed** at release and **unknown** (never verified) after the page is restored; dashed both times |
| Uncertainty, composed marks, ASK, source context | `pixels.composed_marks_match_status`, `ask.dashed_count_matches_marks` **pass** | **Composed frames:** in 11 of 11 state frames, every verified stroke is solid, every other stroke dashed, and the manifest's `ink_marks` counts agree; the raw frames have no ink on any path. **ASK card:** "1 of your strokes are drawn dashed" while exactly the changed sign stroke is unverified; "No AI is connected"; its crop draws the sign stroke dashed. **Source context:** every context keeps `not_observed [source_app, source_link, page, media_position]` (in `stop.stopped4_saved`) |
| Cap flow: repeats not counted, return counted, 8 contexts plus explicit omissions | `context.cap_counted_once` **pass** | One held pen stroke over a value set to 1…7, then 8, 8, 9, 9, 8, 0. Every state was sampled. Result: exactly 8 contexts (`writing_started` + 7 changes, points 0, 4, 6, …, 16); `changes_not_kept` **4**, equal to QA's count from the sampled values (8 counted, repeat not, 9 counted, repeat not, return 8 counted, 0 counted). The live gesture showed 2→8 contexts and then stayed at 8. All 32 points were kept, one `add`, and no pins remained after release. The omitted changes are only a count: no frames, times or pictures |
| Stop → save → reopen original ink | `stop.stopped4_saved`, `reopen.detail_and_counter_round_trip` **pass** | **Stop:** ended "stopped by the user", no recoveries, 5 strokes, valid detail grids, all 13 context pictures stored with hash checks. **Open in a new session:** the overlay shows the same document (same id, visible strokes and revision; file unchanged); the hint reads "Reopened 5 stroke(s)". Alignment is recomputed: the three unchanged glyphs are verified and the multi-context cross and cap are unknown (dashed). A digit change after reopening reads changed, then verified. Pictures reopen all 13 (1/1/1/2/8) |
| Focused regression control | the unchanged 061efe2 flow | NAV hint; WRITE with mouse off refused, then enabled; short draft; partial erase (two pieces, original kept); undo/redo; ASK finish/cancel back to WRITE, adding no ink; continue writing; Stop races; reopen and continue in the same file; start regressions; clean exit. **All pass as at 061efe2.** The two Stop limits remain limits (W-I5 not isolated; W-I8 input refusal not observable). Capture, pixel and receipt checks were re-run automatically with this flow and pass |

`retest.panel_geometry` (pass) shows that QA's glyph coordinates are right: the panel border sits in QA's screenshot
exactly where the page layout plus the (0, 23) DIP viewport origin says. `run.cursor_clear_of_strokes` (pass): the
cursor did not move across 23 readings.

## Evidence

[p0-13-windows-qa-win01-55478f0/](p0-13-windows-qa-win01-55478f0/):
- `summary.json`: every check with its observed values.
- Run records: `runner-results.json`, `samples-timeline.json`, `steps.json`, `run.json` (executed harness hashes),
  `env.json`, `retained-selection.json`.
- Ink: `ink-retest.json` (the session-4/5 ink with evidence, contexts and `changes_not_kept`) and `ink-final.json`
  (the regression ink).
- Pictures:
  - `composed-panel-*.png`: crops of QA's panel only, from the app's retained composed frames;
  - `context-cross-1..2.png` and `context-cap-1..8.png`: the app's saved context pictures;
  - `ask-crop-4.png`, `ask-crop.png`, `context-first-stroke.png`.
- Kept private in `/tmp` and not committed: whole-display screenshots, retained whole-display frames and manifests.
  Windows profile paths are redacted.

## Evidence separation and limits

- **Input:** synthetic injected pen and mouse only. Physical pen, pen-vs-finger and palm cases were **not run**.
  The cap flow and cross-frame writing were exercised natively through the real overlay, sampler and saves, but only
  with injected input.
- **Owner portable tests:** `apps/windows` 85/85 (`node --test`). These are author evidence, reported separately and
  not counted above.
- **Not tested:**
  - a one-glyph change under a *large* stroke (coarser detail cells, a source-analysis residual);
  - identical pixels after an exact-period scroll (a documented false-verified limit);
  - an app relaunch before reopening (Open happened within one process);
  - "Follow content" placement and true content anchoring (both remain honestly unestablished);
  - a forced Stop / `unfinished` line.
- **Counter meaning:** `changes_not_kept` counts observed local pixel changes while a stroke is held. It is not user
  operations, reasoning or edit history.
- **Out of scope:** real AI or provider, both per-OS §7.1 gates, macOS/Sidecar and Notability. Old 061efe2 checks are
  evidence for 061efe2 only; this report covers 55478f0.

## Reproduce

Needs a lead-granted quiet window on the shared Windows display.

```sh
export PATH=<repo>/.tools/node-v24.21.0-linux-x64/bin:$PATH
(cd apps/windows && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts --offline)
node --input-type=module -e "import('./apps/windows/scripts/windows-stage.mjs').then(m => m.buildAndStage('lc-qa-windows-p013'))"
node tests/e2e/windows/run.mjs full /tmp/qa-win01-retest   # about 3 minutes; keep the out dir private
python3 tests/e2e/windows/analyze.py /tmp/qa-win01-retest docs/verification/qa/p0-13-windows-qa-win01-55478f0
```
