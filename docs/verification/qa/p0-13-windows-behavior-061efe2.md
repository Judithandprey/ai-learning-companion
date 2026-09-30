# QA Windows original-screen behaviour pass at `061efe2` (P0-13)

- **Assignment:** lead `handoff_cc3ee3ca9c8c605925369118ab863ff5`, the one existing conditional Windows
  behaviour pass.
  - The quiet display window was granted in `handoff_232d939e414ee1c0519fb8d1b2676a90`, after Web released the display.
  - QA returned the display at 12:44:19 UTC (`handoff_eee09df967b0d1f2f6e270e16fb52360`).
- **Candidate:** published main `061efe287fd965b5a8fcfeced36f1309c2540e2f`.
  - Windows chain: `6584ab1`→`db60c88`, `57dab97`→`483c11b`, `b89bf29`→`ece5454`, `ffc9eb4`→`d6c0551`.
  - QA merge: `team/qa` merged it normally as `8b5941e`. `apps/windows` is byte-identical to `061efe2`.
- **Lead evidence qualification:** [bounded integration audit](../lead/windows-qa-review/README.md) retains the counts below as partial component observations. Pending-save overlap at Stop and application-level input refusal were not observed; cleanup beyond the recorded application exit is QA operator evidence. Original report/data remain at `cba66c8`.
- **Decision: narrow PASS for the implemented capture and editable-input slice, with one finding and two limits.**
  - The counted quiet run gave **32 pass, 1 fail, 2 limit**.
  - **Finding QA-WIN-01 (Medium, next owner Web via the lead).** A stroke over ordinary body text stays
    **verified** (solid) after the text under it has scrolled away. This is the owner's stated limitation, but it
    occurs in the most ordinary case. See [below](#finding-qa-win-01).
  - **Two limits.**
    - Settling a held stroke on Stop (W-I5) is not isolated from an ordinary pen-up in this run.
    - The run cannot observe W-I8 input closure: its outcome looks the same as the pre-fix defect. The owner's
      deterministic test remains the only evidence that input closes.
  - Capture-only: no AI is connected. Both §7.1 gates stay **OPEN**. Physical pen hardware and human navigation were
    **not tested**.
- **Evidence:** [p0-13-windows-behavior-061efe2/](p0-13-windows-behavior-061efe2/), all exported by `analyze.py`
  with Windows profile paths redacted:
  - `summary.json`: every check and its observations.
  - `samples-timeline.json`: 60 samples plus the QA action marks.
  - `ink-final.json`: the saved `lc-desktop-ink/v1` document.
  - `runner-results.json` and `steps.json`.
  - `env.json`: the host facts, recorded after the run.
  - Two crops of QA's own course window: `context-first-stroke.png` (the app's saved raw-frame context) and
    `ask-crop.png` (the ASK card's composed crop).
  - Desktop screenshots are **not** committed. They show the user's taskbar and stay in a private local folder.
- **Harness:** [tests/e2e/windows/](../../../tests/e2e/windows/).
  - `env.json` records the SHA-256 of the files as executed: `run.mjs`, `scenarios.mjs`, `qa-electron-runner.ps1`,
    `qa-png-to-bmp.ps1`, `course.html`, `notes.txt`.
  - `analyze.py` post-processes the retained run data and was revised after an independent review; its current
    version produced every committed file.

## Environment

- **Host:** Windows 11 10.0.26200, one display of 1280×800 DIP at scale 2, so frames are 2560×1600.
  - The OS reports an integrated pen and touch digitizer (`SM_DIGITIZER` 0xc5, 10 touch points), recorded in
    `env.json`. QA did not operate it.
- **App build and stage:**
  - Built with the owner's `buildAndStage` from this worktree: pinned Node 24.21.0, offline `npm ci --ignore-scripts`
    with the committed lock.
  - Staged in QA's own `%TEMP%\lc-qa-windows-p013`; seven built files are byte-equal to the worktree build
    (`env.json`).
  - Runtime: the official Electron 44.5.1 win32-x64, cached by `@electron/get` (`electron.exe` SHA-256 in
    `env.json`).
- **Isolation:** each run used a fresh `LC_USER_DATA`, content folder and Edge profile. All were removed after the
  run. QA reported after-run observation of no remaining own Edge/console processes; the committed harness records termination attempts but has no final descendant inventory.
- **Not touched:** `lc_desktop_preview`, preview ports and identities, Paperclip, user services, and all user and
  other-app processes.
- **Real screens** with QA-written content:
  - `course.html` (a lecture page on simple harmonic motion) in a real Edge `--app` window, fresh profile, translate
    off;
  - `notes.txt` in a real `conhost` console window.
- **Quiet window:** the counted run took place 12:43:09–12:44:17 UTC, while Web held its launches.
  - The guard found no foreign Electron process at start, at any of the 7 desktop screenshots, or at the end.
  - The guard is point-in-time and Electron-only. As executed, it would also miss a process whose command line
    cannot be read.
  - A dark, toast-sized element that QA did not script (content unknown) appeared at the bottom right early in the
    run and was gone before `idle`. The navigation analysis allows for it.

### How each input was produced

None of these inputs are physical hardware or a human.

| What | How |
| --- | --- |
| Overlay strokes (WRITE, eraser, ASK circle) | DevTools `Input.dispatchMouseEvent` into the overlay page, `pointerType` `mouse` or `pen`. Mouse strokes were drawn only after Mouse was turned on, except the one mouse-off refusal check |
| Toolbar and Start/Stop/Open buttons | DOM `click()` in the app's own pages, with no hit-testing |
| Start-race regressions | the control page's own IPC calls (`lc.start` / `lc.stop`), which the buttons invoke |
| Switching native windows | Win32 `ShowWindow` / `SetForegroundWindow` (with `AttachThreadInput`); the user's cursor never moved |
| Scrolling the course page | Edge DevTools `scrollBy` / `scrollTo` in QA's own Edge window, not through the overlay |
| Observation | read-only DOM state; the control page's `lc.onSample` / `listInk` / `recoveries`; QA's own physical-pixel GDI screenshots. These leave out this app's content-protected windows, so the on-screen ink and toolbar are not seen by QA |

## Results (quiet run)

| Area | Check | Status | Actual |
| --- | --- | --- | --- |
| Start, no import | `capture.source_whole_display` | pass | The display was chosen and Start pressed on the already visible course page; nothing was imported. All 60 samples name `screen:0:0`, 1280×800, scale 2 |
| Whole display | `capture.frames_are_display_pixels` | pass | Every raw frame is 2560×1600 |
| Navigation | `capture.navigation_changes_pixels` | pass | Only frames sampled after each QA step count. Console to front: new hashes, change up to 0.79; QA's own screenshots differ in 3.5 M px. Edge back and back to top reproduce the earlier Edge frame hash `aebfcb37` exactly. Page scrolled: a new hash, change 0.05 |
| Still display | `capture.still_display_states` | pass | Five samples while nothing moved (QA's two screenshots identical): `fresh`, change 0 |
| States | `capture.states_stated` | pass | 57 `fresh` and 3 `ended`; each session's last sample says ended. The third (Start-race) session produced only its ended sample |
| Frame facts / composed | `capture.held_frame_facts`, `capture.composed_frames` | pass | Held and stream frame counts are equal in all samples (a consistency check). Composed = raw with no visible ink, differs with ink, and never exists without raw |
| Overlay not in raw frames | `capture.overlay_not_in_raw_frames`, `pixels.raw_context_over_existing_ink` | pass | Across ink revisions 0–7 over the unchanged page, the raw frame hash stayed the same. The long stroke's saved context (2456×1492 px, over four solid strokes then on screen) contains no ink and matches QA's screenshot (99 % of pixels within 24 levels) |
| Alignment: move, then restore | `alignment.content_moved_then_restored` | pass | Before the scroll: 4 verified + 1 unknown. After scrolling the page 300 DIP under the ink: 3 changed (dashed; nothing moved) + 1 verified + 1 unknown. Back at the top: as before |
| Alignment: moved text | `alignment.moved_text_not_verified` | **fail (QA-WIN-01)** | The one stroke that stayed verified after the scroll is `stk_277300dc…`, over a line of body text that scrolled away. See below |
| Mouse off | `write.mouse_off_refused` | pass | A mouse drag in WRITE with Mouse off saved nothing; the hint says "Mouse writing is off" |
| Draft | `write.mouse_enabled_explicitly`, `write.short_draft_saved` | pass | Mouse was turned on explicitly, then three strokes (mouse, mouse, pen) were saved: `add×3` |
| Partial erase | `write.partial_erase` | pass | Crossing stroke 1 at x = 300 DIP: history `erase`, two pieces spanning x 50–288 and 313–560 (a gap at the eraser). The original stays in the history, and the pieces share its evidence through `derived_from` |
| Undo / redo | `write.undo_redo` | pass | Undo restores the 3 original strokes; redo erases again |
| ASK finish | `ask.finish_returns_write` | pass | The card: "No AI is connected: this selection was not sent anywhere. Region 7,504 316×106 DIP … frame 37 … ink revision 6 … 1 of your strokes are drawn dashed". Mode returns to WRITE |
| ASK cancel | `ask.cancel_returns_write` | pass | ASK, then Cancel: back to WRITE, no card |
| Continue | `ask.adds_no_ink_and_continue_writing` | pass | ASK and Cancel add nothing to the history; a further stroke is `add` |
| ASK crop placement | `pixels.ask_crop_is_selected_region` | pass | The 632×212 px crop matches QA's screenshot best at offset (0,0) of the stated box, 7,504 DIP → 14,1008 px (98.5 % within 24 levels, against at most 95.4 % 8 px or more away), apart from the drawn ink |
| Context pictures | `pixels.context_matches_independent_screenshot` | pass | Each draft stroke's saved raw crop equals QA's GDI screenshot at `region_px` (mean difference 1.5–2.2). `region_px` = region × 2 and contains the stroke. The check-mark crop is plain and not informative |
| Held stroke at Stop | `stop.in_progress_stroke_kept` | **limit** | A held 17-point pen stroke is saved whole. Its release was sent about 1 ms after the Stop click, so "settled by Stop" (W-I5) is not separated from an ordinary pen-up |
| Stroke saving at Stop | `stop.after_lift_stroke_kept` | pass | A lifted 17-point stroke remains saved with its context after the immediately following Stop; overlapping pending save was not observed |
| Post-Stop input | `stop.*_post_stop_stroke_not_persisted` | pass | In both variants a new pen stroke sent right behind the Stop click was delivered (15 and 14 events, all answered by the overlay page) and **not saved**. `recoveries` stayed empty and the session ended "stopped by the user" |
| W-I8 input closure | `stop.input_closed_during_save_observed` | **limit** | Not observed. The pre-fix defect (new ink accepted, then destroyed with no recovery) would produce the same data, since no overlay state was read between Stop and close |
| Reopen | `reopen.same_ink` | pass | After Open in a new capture session, the overlay's own composed frames carry the saved revision 8 and 6 visible strokes; the hint says "Reopened 6 stroke(s)". The app was not relaunched |
| Continue editing | `reopen.continue_editing_same_file` | pass | Undo and a new stroke continue the same file (`undo, add`, same id, not a copy) |
| Receipts | `receipt.every_referenced_picture_stored` | pass | All 7 contexts have a picture, stored with the named SHA-256; source app, link, page and media position are stated as not observed. Normal saves only |
| Start regressions | `start.one_at_a_time`, `start.stop_cancels_pending` | pass | Two simultaneous Starts give `[{ok:true},{ok:false,"a session is starting"}]` with one overlay. Stop during a Start gives "stopped before the capture started", with no session and no overlay |
| Exit / no AI | `app.closes_cleanly`, `no_ai.stated` | pass | Closing the control window exits with code 0 (not killed). The overlay and card state that no AI is connected; network traffic was not observed |

## Finding QA-WIN-01

**Alignment reads "verified" over text that has moved.** Medium severity; next owner Web, via the lead.

**Observed.**
- The page was scrolled 300 DIP under fixed ink. The app's composed samples then counted 3 changed, 1 verified and
  1 unknown, with the hint "3 stroke(s) dashed".
- The verified stroke is the "continue writing" stroke `stk_277300dc…`: 45,487 → 230,487 DIP, fingerprint region
  37,479 201×16. It was drawn over the line "The general solution is", and a different line of the page moved under
  it.

**Reconstruction** (`summary.json` → `alignment.moved_text_not_verified`):
- The scroll-300 view was rebuilt from QA's own screenshots at scroll 0 and scroll 420. The 840 px shift model
  matches with a mean difference of 0.35.
- An approximation of the app's 16×16 mean-luminance fingerprint gives exactly the app's counts. For this stroke:
  - fingerprint spread 31.7 (textured, so not plain);
  - fingerprint change 0.049, below `SAME_PIXELS` 0.06, hence verified;
  - yet 6.2 % of its pixels changed by more than 64 levels: the text moved.
- The two larger draft strokes changed by 0.11–0.12 and were correctly marked changed.
- Very large strokes are even less sensitive: the two long strokes drawn later would change only 0.02–0.03 under the
  same scroll.

**Why it matters.**
- Solid ink tells the user, and later the AI context, that the stroke still sits over what it was written on.
- On ordinary course text a 16×16 block average of one line looks like another line.
- The owner documents that "a textured region that happens to look the same after moving could read as verified"
  (`docs/verification/web/windows-original-display.md`). This run shows it happens in the most ordinary case, which
  touches A44 ("original ink and source anchors do not drift") and R59 ("clear anchors").

**Nothing is lost.** The ink is not moved or damaged, and the context pictures keep the original pixels.

**Direction** (for the owner): a finer or edge-based fingerprint, or treating low-coverage text bands as
`unknown`, rather than `verified`.

## Earlier runs (harness development, not counted)

- Three exploratory runs found harness issues, all fixed before the counted run:
  - page-URL matching;
  - the Windows foreground lock;
  - copying onto the Windows drive mount;
  - a Stop-race confound: a second press while the pen was still held.
- The third run overlapped Web's repeated author self-tests (12:15–12:38 UTC per Web). A full-screen probe window
  replaced the course page in the app's frames and in QA's screenshots, and it was discarded.
- The foreign-Electron guard was added as a result. Screen-dependent checks report `blocked` when another app shares
  the desktop.
- No results from the earlier runs are retained or counted.
- An independent two-lens review of the counted run's harness and report led to the current predicates:
  - frames counted only after each step, with return steps reproducing an earlier hash;
  - a stricter ASK placement check;
  - null-picture receipts treated as failures;
  - the partial-erase gap;
  - overlay-side reopen evidence;
  - the two Stop limits;
  - QA-WIN-01.
- **Author tests, rerun separately (not independent evidence):** `node --test tests/*.test.ts` in `apps/windows`
  gives **31/31** under WSL with Node 24.21.0.
  - Per the lead, hosted run 36712629071 on exact `061efe2` failed 29/31 because of a test-harness CRLF issue.
  - Hosted run 36713802500 at `e819bfe`, including the test-only repair `99ae568`→`8ad77c5`, passes 31/31.

## Requirement status (Windows, this pass only)

"Partial" means some behaviour was exercised with injected input on QA content. It is not acceptance of the
requirement.

| ID | Status here |
| --- | --- |
| R02 / R03 | Partial: the capture runs continuously over the real visible display and native-window changes are delivered as frames, but nothing reaches any AI |
| R08 | Partial: the explicit modes, Mouse off by default, and writing that shows no card work through DOM clicks. NAV pass-through, visible toolbar, hit-testing and pen hardware were not tested |
| R35 / R36 | Partial: one display, with explicit Start and Stop. Cross-desktop and multi-device were not tested |
| R46 / R59 | Partial: editable ink is saved and reopened with context pictures. Course/project/video/discussion links are `not_observed`; QA-WIN-01 affects the anchors; the AI does not see the ink |
| R51 / R52 | Not tested: web choices/inputs, canvases, external notes and mixed paths. Only overlay ink on a native window was used |
| A12 / A14 | Partial: capture states and Stop were exercised. Force-quit, permission loss and disconnect were not tested |
| A26 / A27 | Partial: save/reopen/continue in the same app process. An app relaunch and physical Pencil were not tested |
| A30 / A31 | Partial: the ink history (add, erase, undo, redo) and ASK/Cancel leaving it unchanged. Assistance and diagnosis layers were not tested |
| A44 | Partial with finding: ink over a live native window, alignment states under real scrolling, and QA-WIN-01. "AI sees the ink" is open |
| §7.1 gate 1 / gate 2 | **Open**: no real AI. The ASK crop is composed locally and sent nowhere |

## Not tested, blocked, and limits

- **Human and hardware input:**
  - physical pen digitizer, pressure, eraser button and real touch;
  - human navigation of real course sites or apps.
  - All inputs were injected or scripted.
- **Overlay interaction:**
  - NAV click and scroll pass-through through the overlay: neither OS-level nor physical input was used.
  - Toolbar visibility and hit-testing: DOM clicks only.
  - Overlay bounds and taskbar coverage were not observed by QA.
  - Where ink is drawn on screen was not observed by QA, because GDI leaves out the overlay. The ink was seen only
    in the app's own composed ASK crop.
- **Other screens:** QA-authored local content only; no live course site, video or captions.
- **States not observed:** `no_new_frame`, `gap` and `stale` did not occur. Windows kept delivering frames with
  zero change.
- **Session endings and failures not exercised:**
  - real permission withdrawal, display removal or geometry change, overlay crash, Windows sign-out/shutdown;
  - save failure with Retry/Export/Discard;
  - the 64-picture / 48 MB batching (W-I7).
- **Stated limitations that stay open:**
  - Content-following ink is not established; placement ▣ was not exercised.
  - Pen-only capture with finger pass-through is not established.
- **Also out of scope:** one display only; no audio, provider or real AI; A46 Notability import; macOS.
- **Colour:** the capture path shifts colour slightly, hence the 24-level tolerance.

## Reproduce

These commands need a quiet Windows display, coordinated with the lead.

```sh
export PATH=<repo>/.tools/node-v24.21.0-linux-x64/bin:$PATH
(cd apps/windows && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts --offline)
node --input-type=module -e "import('./apps/windows/scripts/windows-stage.mjs').then(m => m.buildAndStage('lc-qa-windows-p013'))"
node tests/e2e/windows/run.mjs full /tmp/qa-win-evidence   # about 70 s; keep the out dir private (it holds desktop screenshots)
python3 tests/e2e/windows/analyze.py /tmp/qa-win-evidence docs/verification/qa/p0-13-windows-behavior-061efe2
```
