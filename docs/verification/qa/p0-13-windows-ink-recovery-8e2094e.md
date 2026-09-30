# Windows frame-bound ink originals, relaunch and context-picture recovery at `8e2094e`

- **Assignment:** lead `handoff_7f469fd2a57a0a04795637cde58cdad7`. This is one bounded, isolated run on the real
  Windows display.
- **Candidate:** exact pushed main `8e2094ee8cd2d99f58a5ed27159c724b07fb103b`, `apps/windows` tree `e9a2c81`. It
  contains:
  - the frame-bound immutable ink originals `46dbb90` / `e7bdbde` (main `4ef4d44` / `bdab30d`);
  - the context-picture recovery `bb67611` (main `96dae0d`).
- **QA branch:** `team/qa` merged the candidate normally as `2549667`. `apps/`, `services/` and `packages/` are
  identical to `8e2094e`.
- **Decision: PASS.** One run gives **22/22 checks passing**:
  - frame-bound originals across the whole editing loop;
  - immutability of every retained original;
  - a clean app exit and relaunch, then continued editing;
  - the controlled corruption recovery.
- **One new Low finding (QA-WIN-02, cosmetic, owner Web):** the control window's end-of-session line cuts the
  recovery instruction mid-sentence.
- **Input:** every stroke was a DevTools-injected pen event (synthetic). No physical pen was used. The Export native
  Save dialog was not driven.
- **Display:**
  - The run took 17:28:20 to 17:29:41 UTC. No foreign Electron was seen at start, at the screenshot or at the end.
  - The cursor stayed static at (545, 762) px.
  - **The display has been free since 17:29:41 UTC.** Both app processes exited with code 0 and nothing was left
    running.

## Environment and method

- **Host:** Windows 11 10.0.26200, one display of 1280×800 DIP at scale 2, Electron 44.5.1.
- **App:** built fresh (`npm ci --offline`, `windows-stage buildAndStage`). The staged `dist` equals the build byte
  for byte; see `env.json`.
- **Isolation:**
  - a fresh `LC_USER_DATA`;
  - a test-owned `TMP`/`TEMP` for the app process only, so its spare copies of unsaved ink stay in the run folder
    (none reached the user's real `%TEMP%`, checked afterwards);
  - QA's own course page in a separate Edge profile.
- **Harness** ([tests/e2e/windows/](../../../tests/e2e/windows/)), with the executed hashes recorded by `run.mjs`:
  - a new `ink` scenario (188 steps, not the earlier 300-step campaign);
  - a new analyzer, `analyze_ink.py`;
  - new runner steps, each limited to this run's user data:
    - `launchApp`: the same staged app and the same profile, after the first process has exited;
    - `hashTree`: read-only hashing that shares read, write and delete access;
    - `plantFile` and `moveAside`: act only on the one TEST entry, checked by hash;
    - `copyTree`.
- **Evidence sources:** the app's own reads are labelled as its claims. They are cross-checked against its stored
  files (manifests, ink originals, ink documents, context pictures) and its retained raw and composed PNGs.

## Results (22/22)

| Area | Check | Actual |
| --- | --- | --- |
| Originals bound to frames | `originals.bound` | 15 retained composed frames across 3 capture folders bind 13 distinct originals (revisions 0–11). Each file's sha256 equals its name and the manifest's; its length equals the manifest's. The parsed document has the frame's session, revision (= history length) and visible-stroke count. None was refused |
| Original = the saved ink of that revision | `originals.match_saved_state` | At all 10 states (write 3, erase 4, undo 5, redo 6, ASK-done 6, continued 8, reopened after relaunch 8, relaunch-edit 9, c1 10, reopened after recovery 11), the state's retained frame binds an original that is **byte-identical** to the saved session file at that moment |
| History | `history.sequence` | The saved history is exactly add×3 → erase → undo → redo → (ASK: nothing) → add×2 → (relaunch) add → add → (recovery) add. The partial erase leaves 2 pieces from 1 kept original |
| Composed pixels = the bound original | `pixels.composed_is_bound_original` | In 10 of 10 state frames, every visible stroke of the bound original is drawn: solid if the app verifies it, dashed otherwise, and the counts equal `ink_marks`. The erased span is **absent** after erase, redo and later states. Undo draws the original whole. Raw frames have no ink on any path. Undo and write share a composed picture, while their bound originals and revisions differ |
| Uncommitted gesture | `originals.uncommitted_gesture_not_bound` | A frame retained while the second stroke was held records `uncommitted_gesture {ink}`. Its original holds only the committed ink (revision 7, 6 strokes) |
| ASK adds nothing | `ask.no_new_revision` | ASK finish and cancel return to WRITE. Samples during ASK stay at revision 6. The card composes "ink revision 6" and says no AI is connected |
| Immutability | `originals.immutable` | Across 20 hash checkpoints, 35 originals (frame PNGs, ink originals, context pictures) keep their bytes (= their names) from first sight to the end. This holds through edits, ASK, exit, relaunch, reopen, further editing and the recovery; only QA's planted TEST entry differs. Every manifest only grew (each earlier state is a byte prefix) |
| Clean exit and relaunch, then continue | `relaunch.clean_exit_reopen_continue`, `app.closes_cleanly.*` | The first process closed itself (code 0). All files are identical before close, after exit and after relaunch. The new process (new DevTools port, same profile) lists the one saved session (6 strokes, revision 8). Open restores it exactly ("Reopened 6 stroke(s)"). Editing continues in the **same file** (history extended, no fork). All pictures open. The new capture's first original of the reopened session is byte-identical to the saved file. **This fills the earlier same-process-only reopen limit** |
| Corruption reproduced | `corruption.reproduced` | The second stroke, with points identical to the first over unchanged content, produced exactly the picture whose address QA had occupied (sha256 `37702e3c…`) |
| Save reports the failure | `corruption.save_reported_failure` | The overlay shows "Not saved: the context picture already stored as `<home>\…\ink\context\37702e3c….png` is not its bytes (the file there has other bytes of the same length); it is left untouched. Move it away, then Retry; or export this ink; the ink is kept in this app". The hint still says no AI is connected. One kept item (same session, revision 11) offers **Retry saving / Export… / Discard…**. The saved file stays at revision 10 |
| Bad entry untouched | `corruption.bad_entry_untouched` | The TEST entry keeps the same sha256, size and mtime through the refused save, the refused Retry and Stop, until QA moves it aside. The moved file still holds the planted bytes at the end. No temporary file was left behind |
| Retry while occupied | `corruption.retry_while_occupied_refused` | Refused again. The ink stays kept; the entry and the saved file are unchanged |
| Export payload keeps the good picture | `corruption.export_payload_keeps_good_picture` | The app's spare copy, written by Stop into the test-owned temp folder with the same payload as Export, is `lc-desktop-ink-export/v1`. It holds the kept document and the good 38,095-byte picture (sha256 = its address), with nothing missing or mismatched. The Export… button is offered; its native Save dialog was **not** driven (it would write outside the test profile and show user folders) |
| Retry after moving the TEST entry aside | `corruption.retry_after_move_restores` | The kept list empties. The address now holds the good picture (written by the app). The same session file (no fork) holds exactly the kept history (11 operations) |
| Reopen after recovery | `corruption.reopen_after_recovery` | Open restores the exact history and evidence. All 8 pictures open with their own bytes, including both uses of the recovered address. Stop ends "stopped by the user" with no kept ink |
| Stop with kept ink | `corruption.stop_with_kept_ink_reported` | The session ends and the ink stays listed for Retry/Export (see QA-WIN-02 for the end text) |
| No AI | `no_ai.stated` | All 12 overlay and card reads say that no AI is connected |

## Finding QA-WIN-02 (Low, cosmetic; owner Web)

- **Where:** `apps/windows/src/main/main.ts:1017` cuts the overlay's unsaved reason to 300 characters for the
  session-end text.
- **Steps:** keep ink after an occupied-address refusal (the flow above), then press Stop.
- **Actual:** the control window's `#session` reads "Not capturing: stopped by the user. The newest ink could not be
  saved: the context picture already stored as `<home>\…\37702e3c….png` is not its bytes (…); it is left
  untouched. **Move it .** It is kept in this app: retry, export or discard it below."
  - The reason here is 336 characters; a typical `%APPDATA%` path is shorter but still over 300.
  - The instruction "Move it away, then Retry; or export this ink" is cut mid-sentence.
- **Expected:** the text is truncated at a sentence boundary, or the path is omitted there. The kept-ink list and the
  overlay show the full instruction, so no information is lost from the app.
- **Severity:** Low. This is text clarity only, and it was already predicted by the source mapping.

## Evidence

[p0-13-windows-ink-recovery-8e2094e/](p0-13-windows-ink-recovery-8e2094e/):
- `summary.json`: all checks with their observed values.
- `hash-checkpoints.json`: 20 checkpoints of every file under `ink/`, `captures/` and `qa-aside/`.
- `retained-originals.json`, `ink-final.json`, `spare-copy-summary.json` (picture bytes replaced by their sha256).
- `runner-results.json`, `samples-timeline.json`, `steps.json`, `run.json`, `env.json`.
- `composed-*.png`: crops of QA's course page from the app's retained composed frames.
- `context-recovered-picture.png`: the recovered good picture.
- Kept private in `/tmp` and not committed: whole-display frames, desktop screenshots, manifests and the full spare
  copy. Paths are redacted to `<home>`.

## Separation and limits

- **Input:** synthetic injected pen only. Physical pen, pen-vs-finger and palm cases were **not run**.
- **Owner portable tests:** 106/106. These are author evidence, reported separately.
- **Export:** payload verified through the app's spare copy (the same export function). Its native Save dialog was not
  driven. Discard was not exercised.
- **Not covered:** crash, kill or sign-out durability; the `query-session-end` path; a concurrent external writer; the
  delayed-encoding race (portable-only).
- **Earlier limits unchanged:** W-I5 and W-I8 remain limits; there was no Stop race in this run.
- **Earlier results:** the 44-case alignment campaign and the API witness campaign stay as evidence for their own
  candidates. They were not repeated.
- **Out of scope:** real AI or provider, both per-OS §7.1 gates, Mac, Notability, content-following placement
  (A26/A44 anchoring).

## Reproduce

Needs a lead-granted quiet window on the shared Windows display.

```sh
export PATH=<repo>/.tools/node-v24.21.0-linux-x64/bin:$PATH
(cd apps/windows && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts --offline)
node --input-type=module -e "import('./apps/windows/scripts/windows-stage.mjs').then(m => m.buildAndStage('lc-qa-windows-p013'))"
node tests/e2e/windows/run.mjs ink /tmp/qa-ink-run     # about 80 s; keep the out dir private
PYTHONDONTWRITEBYTECODE=1 python3 tests/e2e/windows/analyze_ink.py /tmp/qa-ink-run docs/verification/qa/p0-13-windows-ink-recovery-8e2094e
```
