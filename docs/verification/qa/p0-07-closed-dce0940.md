# QA closed-root retest at `dce0940` (N4–N7, plus N6b/N8/N9 controls)

- **Assignment:** lead `handoff_409ca620a5447313c05b5e4a15f7ed86`. This is the one conditional retest
  of N4, N5, N6, N7a and N7b only. It is not a campaign.
- **Candidate:** main `dce0940e04ec620be637310d7b786cc5e4ee99a4`. Web `d99a3c6` is integrated as `46565ca`.
- **Decision:**
  - **QA-EXT-04 is closed.** No false note appears on readable light-DOM content, with or without
    `chrome.dom`.
  - **QA-EXT-05 is corrected to a disclosed limit.** Without `chrome.dom`, a move inside a closed
    root is still not detected and a mismatched crop is shown. It is now disclosed by the unseen-root
    note, where before it was silent.
  - The two such cases carry the status `limit_disclosed`, which is distinct from pass.
  - With `chrome.dom`, movement stays unknown with no crop, and the still controls show correct
    pixels.
- **Scope:** desktop headless Edge browser component only.
  - Whether Safari provides `chrome.dom` is unverified.
  - Not covered: iPad, Pencil, AI, whole display, Notability, and both core gates (these remain
    open).
- **Evidence:** [closed-dce0940/summary.json](p0-07-original-page/closed-dce0940/summary.json), 17 checks:
  - 13 pass: 9 behaviour checks and 4 integrity checks;
  - 2 `limit_disclosed`;
  - 2 `informational`: the `chrome.dom` probe, and N9.

  The folder also holds the exact-byte capture PNGs and their crops.
- **Harness:** [tests/e2e/web/original_page](../../../tests/e2e/web/original_page/README.md), with
  `QA_SCENARIO=closed`.

## Environment

- **Browser:** Windows Edge 154 (HeadlessChrome UA), with a fresh temporary profile, driven from WSL.
- **Candidate copy:** `/tmp/qa-n-dce0940`, an exact copy.
  - `provenance.py`: 93 of 93 files match.
  - `tsc` build passes.
  - `build --check`: `content.js`, `ink-format.js` and 3 icons are current.
  - The loaded folder is exactly the 7 tracked files.
  - The manifest is unchanged: `activeTab` + `scripting`.
- **Ports:** only port 4184, checked free on both sides.
- **Not touched:** 4173, 8174, the user preview, identities, tokens, `lc_desktop_preview`, Paperclip,
  databases and providers.
- **Final run:** 2026-09-30 05:14:17–05:14:53 UTC. The committed `run.mjs`, `qa-cdp-runner.ps1` and
  `analyze.py` equal the hashes recorded in the summary.
- **Superseded runs** (05:02 and 05:13, raw kept locally only): same product outcomes. They were
  repeated only after the independent audit tightened the analysis:
  - the colour search is limited to the marked element's own box (the fixture's own purple block sits
    directly below the page-owned one);
  - disclosure is required both in the notes and in the rendered panel, and `crop_shown` is checked;
  - the no-`chrome.dom` and `chrome.dom`-present preconditions are required per check;
  - statuses `informational`, `closed.` ids, and a user-agent fallback were added.
- **Earlier evidence:** the 20/20 recovery and Export checks, and the 35 ink and 42 capture
  assertions, were not rerun.

### Harness controls

- **Invocation:** Extensions.triggerAction on the active tab. It is not a human click.
- **Input:** CDP pen for ASK marks.
- **Reads:** a `captureVisibleTab` pass-through wrapper (stand-in for moves: 700 ms before the real
  capture and 1600 ms after it), and worker state reads.
- **Page components:** created by page script:
  - `qa-light-card`: readable text, no shadow root;
  - `qa-closed-div`: a closed root on a `div`;
  - `qa-plain-text`: a readable plain `div`;
  - `qa-plain-empty`: an empty background `div`.
- **Fixture component:** the fixture's own `lc-demo-card data-closed`.
- **`chrome.dom` removal:** `chrome.dom` is set to undefined in the extension's isolated world. This is
  a harness control; it does not show what Safari provides.
- **`chrome.dom` probe:** before removal, the isolated world reported `chrome.dom` as an object, with
  `openOrClosedShadowRoot` as a function.

## Results

| Case | Check | Status | Actual |
| --- | --- | --- | --- |
| N4, fixture closed card moves, `chrome.dom` | `closed.closed_internal_shift` | pass | region unknown ("other content took the place…"), no crop; in the image the block is at rows 240–299 instead of 140–219 |
| N4 still control | `closed.closed_still_control` | pass | known crop, 100 % orange, no note |
| N6, readable light-DOM custom element, `chrome.dom` | `closed.light_dom_custom_element` | pass | **no note**; the crop is 94 % the element's blue |
| N7a, closed root on a `div` moves, `chrome.dom` | `closed.closed_div_shift` | pass | region unknown, no crop |
| N7a still control | `closed.closed_div_still_control` | pass | known crop, 100 % purple, no note |
| N5, no `chrome.dom`, closed card still | `closed.nodom_closed_disclosed` | pass | unseen-root note shown; the crop is the orange block |
| N5, no `chrome.dom`, closed card moves | `closed.nodom_closed_shift` | **limit_disclosed** | move not detected; the crop shown as known is white; the unseen-root note is present |
| N7b still, no `chrome.dom`, closed `div` | `closed.nodom_closed_div_disclosed` | pass | note shown (`<div>`); the crop is the purple block |
| N7b, no `chrome.dom`, closed `div` moves | `closed.nodom_closed_div_shift` | **limit_disclosed** | the move is still not detected and a white crop is shown as known, but the note is now present. This was silent in QA-EXT-05 at `ae585e0` |
| N6b, no `chrome.dom`, readable custom element | `closed.nodom_light_dom_custom_element` | pass | no note; crop correct |
| N8, no `chrome.dom`, readable plain `div` | `closed.nodom_plain_readable_div` | pass | no note; the crop is 96 % teal |
| N9, no `chrome.dom`, empty background `div` | `closed.nodom_plain_empty_div` | informational | conservatively warned, as the lead allowed; crop correct. It also shows the `chrome.dom` removal still held at the end |

The disclosure is recorded in the notes and rendered in the panel. It is plain panel text, not
visually emphasized, and the wrong crop is still displayed beneath it. The new note reads: "The mark covers an element (<div>) that shows no page content of its own: what it
shows may come from a closed shadow root, which this browser does not let the companion look into, so
movement inside it cannot be watched and the crop may not show what was marked if it moved (unknown)."

## Limits (unchanged, stated by the lead or the code)

- Without `chrome.dom`, no closed root's motion is detected. The note is a disclosure, not alignment
  proof.
- The heuristic cannot detect closed roots whose host also lays out its own or slotted light content,
  so a move there would still be silent without `chrome.dom`. This was stated by the lead and the
  independent audit and was not constructed here.
- A plain empty background `div` may be warned conservatively (N9).
- The WRITE anchor limitations for closed roots on plain `div`s are unchanged and were not retested.
- Safari's `chrome.dom` availability is unverified. Also out of scope: iPad, Pencil, AI, whole display,
  Notability, and both core gates.

## Reproduce

```sh
git archive dce0940e04ec620be637310d7b786cc5e4ee99a4 | tar -x -C /tmp/qa-n-dce0940
# in the copy: node <lead repo>/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
QA_SCENARIO=closed QA_SOURCE=/tmp/qa-n-dce0940 QA_BASELINE=dce0940e04ec620be637310d7b786cc5e4ee99a4 LC_WEB_FIXTURE_PORT=4184 \
  node tests/e2e/web/original_page/run.mjs /tmp/qa-n-run-N
python3 tests/e2e/web/original_page/analyze.py /tmp/qa-n-run-N docs/verification/qa/p0-07-original-page/closed-dce0940
```
