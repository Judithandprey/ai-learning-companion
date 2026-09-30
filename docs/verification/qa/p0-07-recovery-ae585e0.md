# QA changed-path retest: QA-EXT-03, ink recovery and Export at `ae585e0`

- **Assignment:** lead `handoff_82a7f93ad2e5bde5171c584c5ed47116`, which releases the conditional retest in
  `handoff_feff23b156b608c532b216636a48307f`. It is one bounded browser pass, not a campaign.
- **Candidate:** main `ae585e084b4a4292f0ec2d6baaeaac1eabc3f040`. Web `32b7768` and correction
  `78f3ba8` are integrated as `3596124` and `72ecee4`.
- **Decision:**
  - **Closed:** QA-EXT-03 for open shadow roots, and closed roots where `chrome.dom` is available.
  - **Passes:** the ink recovery and Export paths, 20 of 20 behaviour checks.
  - **Two new closed-root findings:**
    - **QA-EXT-05 (medium, conditional):** a closed root on a plain element, with `chrome.dom`
      unavailable, moves silently.
    - **QA-EXT-04 (low):** a false "closed component" note on light-DOM custom elements.
  - **One accepted limit, disclosed:** a closed custom element without `chrome.dom`.
- **Scope:** browser component only, in desktop headless Edge.
  - It is not Safari (including whether it provides `chrome.dom`), iPad, Pencil, AI or provider,
    whole-display observation, overlay or Notability.
  - Both core gates remain open.
- **Evidence:** [recovery-ae585e0/](p0-07-original-page/recovery-ae585e0/)
  - `summary.json` holds the capture retest.
  - `summary-recovery.json` holds ink recovery and Export.
  - PNGs: `*-capture.png` files are the exact bytes `captureVisibleTab` returned; `rec-*.png` files are
    DevTools screenshots.
  - `exports/` holds the 4 actually downloaded Export files. Their hashes are in the summary.
- **Harness:** [tests/e2e/web/original_page](../../../tests/e2e/web/original_page/README.md).

## Environment

- **Browser:** Windows Edge 154.0.0.0 (HeadlessChrome UA) from WSL2. Each run used a fresh temporary
  profile, removed afterwards.
- **Candidate copy:** `/tmp/qa-rec-ae585e0`, an exact copy of `ae585e0`.
  - `provenance.py`: 93 of 93 tracked files match.
  - `tsc` build passes.
  - `build-webextension.mjs --check`: `content.js`, `ink-format.js` and 3 icons are current.
  - The loaded folder is exactly the 7 tracked files.
  - The manifest is unchanged: `activeTab` + `scripting`.
- **Ports:** only port 4184, checked free on the WSL and Windows sides.
- **Not touched:** 4173, 8174, the user preview, identities, tokens, exported source,
  `lc_desktop_preview`, Paperclip, databases and providers.
- **Final runs** (2026-09-30 UTC):
  - repro: 04:34:34–04:35:58;
  - recovery: 04:35:59–04:38:46.
  - The committed `run.mjs`, `qa-cdp-runner.ps1`, `analyze.py`, `recovery-steps.mjs` and
    `analyze_recovery.py` equal the hashes recorded in the summaries.
- **Superseded runs:** kept locally only and disclosed here.
  - `/tmp/qa-rec-final` at 04:10: the no-`chrome.dom` shift was not exercised, because the product's
    growing evidence panel covered the mark. The closed marks were then moved higher on the page.
  - `/tmp/qa-rec-final2` at 04:14: the harness before the independent audit fixes. It produced the
    same outcomes for the cases it contained.
- **Previous evidence:** the earlier 35 ink and 42 capture assertions were not rerun.
  - Four of the old ink assertions describe behaviour that this correction deliberately replaced:
    `ink.unreadable_preserved`, `ink.corrupted_after_load_preserved`, `ink.conflict_two_tabs` and
    `ink.conflict_reload_behavior`.
  - The `rec.*` checks below supersede them.

### Harness controls

Every check labels its own timing and instrumentation.

**Product actions:**
- Start and stop use DevTools `Extensions.triggerAction` on the active tab. It is not a human click.
- Product buttons are pressed with trusted CDP mouse clicks.
- Strokes use the mouse. ASK marks use the CDP pen.

**Reads and spies:**
- worker reads of state and of the keep map (isolated world);
- native IndexedDB reads parsed with the product's own `parseInk`/`parseCopy`, with read-only
  helpers;
- a `captureVisibleTab` pass-through wrapper (with delays in the stand-in cases);
- a `runtime.onMessage` type spy;
- a read-only DevTools DOM search of the rendered hint.

**Deliberate interventions:**
- **FORGED** unreadable records, both before and after load;
- a **HELD** real readwrite transaction from the worker, with the forgery inside it;
- an **INJECTED** transaction abort through a put wrapper;
- `chrome.dom` removed from the isolated world (whether Safari lacks it is unverified);
- page-owned test components created by page script;
- `Browser.setDownloadBehavior allow` into the run folder;
- tab creation and switching from the worker, and a temporary tab-B title;
- pushState/replaceState and CDP reload and navigate.

## Findings (owner: Web; lead integrates)

### QA-EXT-05 (medium, conditional on `chrome.dom`): a move inside a closed shadow root on a plain element is shown silently

**Steps**
1. The page owns a `div` with a **closed** shadow root holding a purple block (`#7b1fa2`).
2. `chrome.dom` is removed from the extension's isolated world.
3. Pen-mark the block.
4. Inside the capture window, the page moves the block 100 px down.

**Expected:** region unknown, or at least the disclosed closed-component note.

**Actual**
- The status is `received`, geometry is known, and crop `78,153 132×53` is shown.
- The recomputed crop is 100 % white, 0 % purple. In the image the block is at rows 240–299 instead
  of 140–219.
- `pageUpdates` is 0, and there are **no notes at all**.

**Control:** with `chrome.dom` present (Edge), the same move gives region unknown
(`repro.closed_div_shift`).

**Evidence:** `n7b-nodom-closed-div-shift-*` and `repro.nodom_closed_div_shift`.

**Cause** (inferred from code):
- Without `chrome.dom`, `pageTopAt` returns the host.
- `closedUnder` notes only defined hyphenated custom elements, so a plain `div` gets no note.
- The observers cannot see inside the closed root.

**Severity:** medium if Safari lacks `chrome.dom.openOrClosedShadowRoot`, which is unverified. With
`chrome.dom`, this does not occur.

**Minimal direction:** when a sample element is a host whose shadow root is not visible, add the note
for non-custom elements too, or treat the region as unverifiable. Record the limit.

### QA-EXT-04 (low): light-DOM custom elements are described as closed components

**Steps:** a page-owned **defined** custom element (`<qa-light-card>`) with readable light-DOM text and
no shadow root, under a still mark (Edge, `chrome.dom` present).

**Actual**
- The crop is correct: 94 % of the element's blue.
- The note says "The mark covers a page component (<qa-light-card>) that shows nothing the companion
  can read: its inside may be in a closed shadow root…".
- That is untrue: the text is readable, and the product selected part of it.

**Evidence:** `n6-light-dom-custom-element-*` and `repro.light_dom_custom_element`.

**Direction:** as in `ink-layer`'s `closedComponent`, require no children or text. Alternatively,
confirm a closed root through `chrome.dom` before claiming one.

### Accepted limit, disclosed: a closed custom element without `chrome.dom`

`repro.nodom_closed_shift` has the status `limit_disclosed`, not pass.
- The fixture's `<lc-demo-card data-closed>` moved, and the move was **not detected**. A 100 % white
  crop was shown as known.
- The only disclosure is the closed-component note. The same note appears on the still mark
  (`repro.nodom_closed_disclosed`).
- This is the limit the lead accepted for closed roots that cannot be inspected.

## Capture retest (`summary.json`, 22 checks)

The 22 checks are 17 behaviour checks plus 5 integrity or informational checks:
- 14 behaviour checks pass;
- 1 is `limit_disclosed`;
- 2 fail (QA-EXT-04/05).

**QA-EXT-03, open shadow root:**
- `repro.shadow_internal_shift` (stand-in) gives "other content took the place of the marked content
  while the image was taken…", with no crop.
- Real timing, `repro.real_timing_shadow_shift`: 5 of 5 exercised attempts kept unknown, 0 wrong.
- Positive control `repro.shadow_still_control`: the crop is known and 100 % green.

**Closed roots with `chrome.dom`** (the probe records `object`/`function`):
- `repro.closed_internal_shift` and `repro.closed_div_shift` give unknown.
- `repro.closed_still_control` gives a known, 100 % orange crop, with no note.

**Adjacent controls, unchanged and passing:**
- scroll away and back: stand-in, and real timing (4 exercised, 0 wrong);
- inserted content and style shift: stand-in, and real timing (3 exercised, 0 wrong);
- in-place change: disclosed by a note;
- Stop plus immediate restart in flight: the new capture is shown, 100 % magenta.

**Integrity:** the permission manifest is unchanged, and the wrapper logs are intact.

## Ink recovery and Export (`summary-recovery.json`, 22 checks)

The 22 checks are 20 behaviour checks plus 2 integrity checks, and all pass.

**Ordinary conflict, two real tabs:**
- B saves its version to the main record.
- A's refused stroke saves A's whole document as a copy: reason conflict, forked at 1, exactly the 7
  envelope keys, kind `lc-web-ink-copy/v1`.
- A keeps writing to the copy.
- After a reload, the main record (B's version) is shown and the copy is listed. ⧉ shows the retained
  work.
- A partial erase of A2 and a new stroke are saved to the copy with all originals and history. The
  main record is byte-unchanged.
- A second reload shows the copy with history 5.

**Unreadable at load (FORGED):**
- The load reports "new ink will be saved as a separate copy".
- The first stroke goes to a readable copy (reason unreadable). The raw record is byte-unchanged.
- The copy reopens after a reload, and further editing is saved to it.

**Unreadable AFTER load, main (FORGED, "incomplete"):**
- The whole document is saved as a new copy (reason unreadable, forked from main). Its first stroke is
  byte-equal to the stroke in the raw main. The raw main is unchanged.
- It reopens after a reload, and a partial erase and a new stroke are saved to it.

**Unreadable AFTER load, copy (FORGED, `forked_at -1`):**
- A new copy is forked from the unreadable copy, with the whole document and history. The unreadable
  copy and the main are byte-unchanged.
- After a reload the newest readable copy reopens (1 unreadable copy reported), and editing continues.

**Late refusal after Stop (HELD transaction):**
- The save waits as "saving" (`sPending`).
- Stop: the state reads null, and the keep map holds `saving`.
- Timeline: Stop at 04:36:53.582, then the hold commit and refusal at 04:36:54.310, then the copy with
  `created_at` 04:36:54.310.
- Exactly one readable copy holds both strokes. The raw main is only the forgery (revision+1), and the
  keep entry clears.
- A restart reopens the copy.

**Late refusal after an address change (HELD):**
- The other address stays loading while held, then reports "nothing saved for this page yet".
- Timeline: push at 04:37:02.997, then the copy at 04:37:04.417.
- There is one readable copy, the raw main is only the forgery, and returning shows the copy.
- The rendered hint equals the state hint and no longer claims unsaved ink.

**Injected transaction abort:**
- The status is `failed`, "the browser did not store it (aborted)". Export is offered.
- The stored record is byte-unchanged, so there is no false saved result, and no copy is made.
- After the injection is removed, the next stroke saves all three strokes.

**Fallback copy commit failure (FORGED plus INJECTED):**
- The result is failed and exportable, with no copy record while failing, and the forged main is
  byte-unchanged.
- The retry uses the **same copy id** and saves all three strokes. A reload reopens it.

**Export, with real downloads.** Four complete JSON files were downloaded, each 1,907 bytes:
- Each is `lc-web-ink-export/v1` with `not_saved` "failed: the browser did not store it (aborted)" and
  `copy` null.
- The doc holds both strokes, `add,add` history and the page. Its points match the tab's strokes, and
  the first stroke is byte-equal to the stored one.
- The tab did not navigate, and the companion kept running.
- **Export, then Stop with no pause:** the product's `exported_at` 04:37:16.370 was followed by Stop,
  which returned by 04:37:16.405 (at most 35 ms later). The file still completed. State reads null,
  and the document is held as failed.
- **Two Exports 58.798 s apart** (from the files' `exported_at`), that is 1.2 s before the first
  export's shared 60 s cleanup: both files completed.
- The revocation itself is not observed.

**IR2 probe (real sender from the isolated world):**
- A copy description with extra keys (`kind: 'lc-web-ink/v1'`, `doc`, `extra`) is stored with
  exactly the 7 keys, kind `lc-web-ink-copy/v1`, readable, and listed on reopen.
- An upper-case id is refused with "not a copy this version writes". The store is identical before
  and after (snapshot compare).

**No automatic capture:** across all recovery, conflict, failure and export paths, there are 0
`captureVisibleTab` calls, and the only message types are ink load/save and stopped.

## Observations (low; not blocking)

1. With one unreadable copy, the hint reads "1 stored copy cannot be read by this version and are left
   untouched" (grammar).
2. After the failed document is later saved, the hint still says "Export started at …". `exportedAt`
   is cleared only when an address loads.
3. The export filename uses UTC digits without a zone, while the UI shows local time.
4. Showing a copy repeats the long provenance sentence twice in the hint.
5. While a save for the previous address is pending, a new address stays "Loading saved ink…". Here the
   held transaction blocks the read too, so the product's own contribution cannot be separated out.

## Not tested

- **Failure kinds:** real quota, commit, IndexedDB-open or transport failures (only an injected abort
  was run), and persistence across a browser or service-worker restart (page reloads only).
- **Stop timing:** teardown of the capture watch after Stop during a shadow capture (from code, it
  lives until the answer arrives or the 5 s timeout).
- **Safari:** whether it provides `chrome.dom`, native `importScripts`, and its download or blob
  behaviour.
- **Platforms and scope:** iPad, Pencil, provider or AI, whole display, overlay, Notability, and both
  core gates.

## Reproduce

```sh
git archive ae585e084b4a4292f0ec2d6baaeaac1eabc3f040 | tar -x -C /tmp/qa-rec-ae585e0
# in the copy: node <lead repo>/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
export QA_SOURCE=/tmp/qa-rec-ae585e0 QA_BASELINE=ae585e084b4a4292f0ec2d6baaeaac1eabc3f040 LC_WEB_FIXTURE_PORT=4184
QA_SCENARIO=repro node tests/e2e/web/original_page/run.mjs /tmp/qa-rec-run-N
QA_SCENARIO=recovery node tests/e2e/web/original_page/run.mjs /tmp/qa-rec-run-N
python3 tests/e2e/web/original_page/analyze.py /tmp/qa-rec-run-N docs/verification/qa/p0-07-original-page/recovery-ae585e0
python3 tests/e2e/web/original_page/analyze_recovery.py /tmp/qa-rec-run-N docs/verification/qa/p0-07-original-page/recovery-ae585e0
```

**Next:** Web addresses QA-EXT-05, and QA-EXT-04 at low priority, and lead integrates. QA reruns N6,
N7a and N7b plus N4 and N5 on the corrected candidate. Whether Safari provides `chrome.dom` is to be
settled by a device or Safari check.
