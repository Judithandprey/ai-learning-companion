# Windows app-parent capture link: Start → storage → Stop → reopen at `c4c84a5`

- **Assignment:** lead `handoff_0dfeecb564bd00a8d0839fce2ff72e69`, task card
  [next-qa-task.md](../lead/windows-parent-review/correction/next-qa-task.md). One bounded P0-07/P0-13 behavior pass
  on the real Windows display.
- **Candidate:** exact pushed `c4c84a57bb7752d2bdbeeff8a0482711cae8fb38`.
  - Its `apps/windows` equals the application source `15501b6` and the owner delivery `5871981`.
  - `team/qa` merged it normally as `dd6c22f`. `apps/`, `services/` and `packages/` are identical to `c4c84a5`.
- **Decision: NOT ACCEPTED as-is. Run 2 passed 13 of 15 checks.** The capture, storage, readback, Stop, recovery and
  failure behavior pass. Two reproducible failures go to Web through the lead:
  - **QA-WIN-03 (High, development link mode only):** with the capture link configured, closing the app window does
    not end the app process. It stays alive with no page and keeps the single-instance lock until killed.
  - **QA-WIN-04 (Low–Medium):** while the test service is unavailable, the ASK card and the header still say that
    frames are "also stored" in the local test capture service. The link line itself is truthful.
- **What passed, on the real app, display and service** (details in [Results](#results-run-2-1315)):
  - **Off by default:** nothing is sent until the development link is enabled.
  - **Enabled, before Start:** no host, no grant and no documents.
  - **After Start:** frames are stored automatically for every change. The server raw PNG, composed PNG and ink JSON
    bytes equal the local ones.
  - **Ink loop:** WRITE → partial erase → undo/redo → ASK → continue works, with the exact history kept.
  - **Stop:** the status latches synchronously, the host exits and the server stream is stopped.
  - **Same-profile reopen:** there is no replay and no fresh grant, and editing continues in the same document.
  - **Service unavailable:** the local frames and ink are kept and nothing is sent.
- **Input:** every stroke was a DevTools-injected pen event (synthetic). No physical pen was used.
- **Display and release:**
  - Run 2's runner took 23:29:02 to 23:32:48 UTC (`run.json`). No foreign Electron was seen at start, at any
    screenshot or at the end.
  - Every app process of this pass has ended:
    - the no-link control app exited by itself (code 0);
    - QA ended the three linked processes by their owned PIDs (QA-WIN-03). The last one ended at 23:32:42.
  - No `wsl.exe` child and no host remained; the host watch ended at 23:33:03 with none remaining. **The display has
    been free since then.**

## Environment and method

- **Host:** Windows 11 10.0.26200, one display of 1280×800 DIP at scale 2, and the pinned Windows Electron 44.5.1 (unchanged
  from earlier passes). The WSL2 Ubuntu host runs PostgreSQL 18.6.
- **Build:**
  - The app was staged fresh into `%TEMP%\lc-qa-windows-parent`.
  - The staged `package.json` + `dist/**` (56 files) has tree hash `b9aaf734…`. A clean rebuild from
    `git archive c4c84a5` (`tsc` + `copy-static`) gives the same hash. See [build.json](p0-13-windows-parent-c4c84a5/build.json).
- **Backend:**
  - A private `git archive c4c84a5` copy of `services/` + `packages/` in a WSL temporary folder was the host's working
    directory. It equals the candidate, except for the `__pycache__` folders the host wrote while running (see
    [Observations](#other-observations)).
  - The app launched the host itself through the released private-stdin path:
    `wsl.exe --distribution Ubuntu --user agentsdock --cd <copy> --exec <venv python> -m services.api.desktop_local`.
  - The DSN reached the host only on the host's stdin.
- **Database:** only the existing migrated `lc_p0_test` was used.
  - Checked by `dedicated_test_dsn`, `verify_test_database`, `verify_migrations` (0001–0003) and
    `verify_pristine_actor(windows=True)`.
  - The actor was fresh: `lc-windows-http-2d2be3c7…`, device `windows-qa1b1a5f…`.
  - The DSN file was read privately by the app and by QA's helper. It never appeared in argv, logs or evidence.
  - Nothing touched `lc_desktop_preview`, ports 4173/8174, user sessions, Paperclip or any existing service. No
    service was restarted.
- **Isolation:** each run used a fresh `LC_USER_DATA`, app `TMP`/`TEMP`, stage work folder and Edge profile.
  - The link configuration was set in `LC_DEV_CAPTURE_HOST` for each app process only.
  - The configurations (main, and unavailable for the failure) were written under the run folder.
- **Harness** ([tests/e2e/windows/](../../../tests/e2e/windows/)). Executed hashes are in `run.json`; the runner,
  `run.mjs`, `scenarios.mjs` and `qa_parent_db.py` are committed unchanged. `analyze_parent.py` was corrected after the
  run, and the committed version produced `summary.json`. The two corrections:
  - the host-before-Start windows no longer count the host that Start itself launches;
  - frames never planned after the Stop latch are counted from retained lines only, not the manifest's `ended` line.
  - A new `parent` scenario of 248 steps. `parentquit` is the diagnostic scenario for QA-WIN-03.
  - `qa_parent_db.py`, a WSL helper that reuses the released Backend guards and readers:
    - `preflight` runs the guards and mints a pristine actor;
    - `watch` logs `/proc` host appear/exit events for processes whose cwd is in the private copy;
    - `readback` refuses while any host lives. It compares server and local bytes through
      `AuthorizedProcessContextReader.read_windows` → `AuthorizedImageResolver.resolve_windows`, and proves that
      reading changed nothing;
    - `cleanup` acts only on this run's proven actor, after no host remains.
  - New runner steps:
    - `seedLinkRecord`: the actor's coordination record;
    - `children`: the app's Win32 child processes;
    - `endHungApp`: ends only a still-running owned PID after `closeApp`, and records its pages and children first.
  - `analyze_parent.py`, an independent analyzer. It cross-checks the app's own status reads against its stored
    files, the coordination record, the host watch and the database.

## Results (run 2: 13/15)

| Area | Check | Actual |
| --- | --- | --- |
| Shared display | `run.shared_desktop_quiet`, `run.completed`, `run.cursor_static` | No foreign Electron at start, at any screenshot or at the end. All 248 steps ran, with no failed step. The cursor stayed static at (1586, 949) px |
| Off by default | `link.default_off_local_only` | Without `LC_DEV_CAPTURE_HOST`, status is `{mode: off}` before and during capture, and the link line is hidden. The header says "No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere." There is no `capture-host` folder, no `wsl.exe` child and no host. The session kept 2 local frames |
| Enabled, before Start | `link.enabled_nothing_before_start` | Status is `idle`, 0 stored. The QA-seeded coordination record was untouched (same sha256). No `wsl.exe` child and no host before the Start click. The actor had **0 documents** before Start (it was pristine at preflight) |
| Start stores automatically | `storage.start_automatic_frames_and_server_originals` | Start on the visible QA course (no document imported). The first host appeared 0.32 s after the click. Registration was `initial` and the grant was `consumed`. There were 4 visible changes: QA panel, second native surface (the QA console window), scroll, back. With no region selection, the session retained 12 frames: 1 at Start (`first`), 5 on the changes (`changed`) and 6 after ink strokes (`ink`). Every change window has at least 2 retained frames; the analyzer's ±2 s windows overlap, so its per-window counts 2/2/3/2 are not a partition. Start through the last change gave 6 distinct raw frames. The manifest shows 0 gaps, 0 frames not retained, 0 refused and 0 unfinished. All 12 jobs are `committed`, with 1 record each, and the status said `stored 12`. Readback of 12 server records compared 24 frames (raw + composed) and 12 ink originals: **0 mismatches**. The server bytes equal the local files. Sample (`sampled_at`) to server `capture_record` creation: n 12, min 0.17 s, median 0.24 s, max 0.57 s. This spans the Windows and WSL clocks, so it is indicative only |
| Ink loop on the linked session | `ink.loop_on_linked_session` | The saved history is exactly add×3 → erase → undo → redo → (ASK: nothing) → add. ASK finish and cancel return to WRITE. Plain strokes open no card. The ASK card says "No AI is connected: this selection was not sent to any AI" and names the region, frame and time. The link line read "storing. 12 record(s) stored. AI: not connected." |
| Originals immutable | `originals.immutable_locally` | Across 18 hash checkpoints, 30 local originals (frame PNGs and ink originals) keep their bytes, through Stop, the killed close, relaunch and failure |
| Stop | `stop.latch_host_end_and_server_state` | A read about 0.12 s after the click already gives `state: stopping`, `stored 12`. By source, the latch is set synchronously and nothing new is planned after it (`capture-link.ts:813-817`). Later reads give `stopped` / "stream stopped" (`stored 12, unknown 0, not_sent 0`). One `stop` was sent (`expected_revision 1`, outcome `stopped`). The server stream is `stopped`, revision 2, `pre_stop_sequence: null`. That null boundary stays **unknown**: no precise last frame is claimed. The host exited 23:30:19.5 and the `wsl.exe` child ended. All 12 retained frames were planned and stored; after them the local manifest has only its `ended` line ("stopped by the user"), which is not sent |
| Relaunch the same profile | `relaunch.recovery_reopen_continue` | After the close (see QA-WIN-03, the process had to be ended by PID), the relaunched app read `stopped, stored 12` from the record. No host, no fresh grant and **no server document** were created between close and the next Start. The next Start registered a new stream with continuity `restart`, the previous stream id and gap `unknown`, and its grant was `consumed`; the host appeared 0.49 s after the click. Open restored the saved document exactly. Editing continued in the same document: history add×3, erase, undo, redo, add, add. Stream 2 readback: 3 records, 6 frames, **0 mismatches** |
| Controlled failure: service unavailable | `failure.service_unavailable_local_kept_nothing_sent` | The link configuration named a DSN file for a non-existent socket: `lc_p0_test` on a missing host path, with no password. The host started and ended **without READY** after about 0.40 s. The status read `not connected`, "the host ended without READY (unavailable)", `stored 0`. The grant is `requested_unknown` and the stream is not registered. After Stop: "the stream was never confirmed registered; whether it or a grant exists is not known" (`earlier_unknown 1`). 2 local frames and the ink were kept. **0 server documents** were created after that launch. Healthy control: streams 1 and 2 above, same app, same run |
| Failure UI | `failure.ui_does_not_claim_storage` | **FAIL, QA-WIN-04** (below) |
| Linked app exit | `quit.linked_app_exits_after_close` | **FAIL, QA-WIN-03** (below) |
| Release | `release.owned_processes_ended` | All 4 app PIDs of the pass ended: the no-link app itself (code 0), the 3 linked ones by QA (owned PIDs only). Both `wsl.exe` children seen were gone by the end; the failure host lived 0.4 s, between two child polls. Hosts seen: 3; remaining at watch end: none |
| Read-only readback | `database.readback_read_only` | Before and after readback: the actor row, 15 `capture_record`, 23 `artifact`, 2 `control_stream`, and every document digest were unchanged |

## Finding QA-WIN-03 (High for the development link mode; owner Web)

- **Steps:**
  1. Launch the staged app with `LC_DEV_CAPTURE_HOST` set to a valid configuration.
  2. Optionally Start and Stop.
  3. Close the control window (`window.close()` through the control page, the same path as a user's close).
- **Actual:**
  - The main process stays alive with **no page** and two Electron children.
  - After 30 s it has still not exited, so it had to be ended by its PID.
  - QA's harness never launches over a live app: its guard ("the previous app process has not exited") refused the
    next launch in run 1 and in the diagnostic. In run 2, each relaunch followed QA ending the hung PID.
  - **Inferred, not run:** the hung process still holds `requestSingleInstanceLock` (`main.ts:46`), so a user's
    relaunch of the same profile would quit at once.
- **Reproduced 5 of 5:**
  - run 2: three times (after Stop, after the relaunched session, after the failure session);
  - run 1, where the harness guard then refused the next launch and the run aborted at step 155;
  - diagnostic `parentquit` variant A, where the link was idle and **never started**.
- **Control:** in every run, the same app without the link configuration exits by itself (code 0) within 0.2 s of
  the close.
- **Expected:** the app quits by itself after the bounded link stop (≤ 20 s), as the comment at `main.ts:1040-1041`
  says.
- **Likely mechanism (inferred, not verified with a patched build):**
  - `main.ts:1044-1054` calls `preventDefault()` in `will-quit` and re-issues `app.quit()` once `link.quit()` settles.
  - With no active stream, `link.quit()` resolves at once (`capture-link.ts:997-999`). This is the idle case and
    probably the after-Stop case too.
  - So the re-issued `app.quit()` likely runs in the microtask checkpoint while Electron is still dispatching
    `will-quit`, and is ignored. Electron then cancels the quit because of `preventDefault`, and nothing retries.
- **Fix to verify (owner's choice):** defer the re-quit to a later task (for example `setImmediate`), or call
  `app.exit(0)` once the link has settled.
- **Impact:** the development configuration cannot close cleanly. A hidden process stays behind, and by the lock above
  the next start would appear to do nothing. The default (link off) mode is unaffected.

## Finding QA-WIN-04 (Low–Medium; owner Web)

- **Steps:**
  1. Launch with a link configuration whose service is unavailable.
  2. Start, write, and ASK a region.
- **Actual:**
  - The status is `not connected`, `stored 0`, "the host ended without READY (unavailable)". The link line correctly
    says "not connected (the frames stay on this device). 0 record(s) stored".
  - However, the ASK card says "(Development mode: the whole-display frames kept on this device are **also stored in a
    local test capture service**.)".
  - The header says "…while capturing, also stored in a local test capture service on it".
- **Cause:**
  - `stored` for the overlay is fixed when the overlay starts, from `mode === 'development' && !sends_stopped`
    (`main.ts:970`, used at `overlay.ts:716-718`).
  - The header uses the same condition (`control.ts:293-295`).
  - Neither changes when the link turns out to be unavailable.
- **Expected:** these texts follow the actual link state. When nothing is being stored, they do not say that frames
  are stored. Saying "if the local test service is connected", or matching the link line, would do.

## Supporting runs (same candidate)

See [supporting-runs.json](p0-13-windows-parent-c4c84a5/supporting-runs.json).

- **Run 1** (23:20:41–23:23:46 UTC):
  - It aborted at step 155: the linked app had not exited 30 s after its close (QA-WIN-03), so the harness guard
    refused the next launch. QA ended the hung app by PID in `finally`.
  - Up to there it matched run 2. The stream was stopped, and readback of 21 records compared 26 frames and 13 ink
    originals with 0 mismatches. The readback was read-only.
  - One host appeared and exited, and none remained.
  - Cleanup removed that actor: 140 documents → 0, and the row was removed.
- **Diagnostic `parentquit` A** (23:25:47–23:27:38 UTC):
  - The link was configured and idle, never started. It had 1 page and 3 children before the close, and 0 pages and 2
    children 30 s after it. The process was ended by PID.
  - The no-link control exited with code 0.
  - No host ran. A later read-only query (23:50 UTC) found no actor row and no documents for that actor.

## Evidence

[p0-13-windows-parent-c4c84a5/](p0-13-windows-parent-c4c84a5/). The files are sanitized: the Windows profile is
`<home>`, and there are no DSN, token, frame or ink bytes.

- `summary.json`: the 15 checks with their observed values.
- `steps.json`, `runner-results.json`: the 248 steps and the app's status/overlay/saved reads.
- `coordination-final.json`: the app's coordination record.
- `host-watch.json`: host appear/exit.
- `hash-checkpoints.json`.
- `database-readback.json`: per-job server receipt, raw/composed/ink sha comparisons and document digests.
- `preflight.json`: guards and the actor.
- `cleanup.json`: 125 documents → 0, and the actor row removed.
- `build.json`: the stage and backend identity, runtime versions and the owner unit-test count.
- `supporting-runs.json`.

Raw whole-display frames, ink documents and screenshots stay in QA's private run folder. They are not committed.

## Separation and limits

- **Native capture:** the real Windows desktop capture of one display, with QA-owned content (course page in Edge, QA
  console window). **Input:** synthetic (DevTools-injected pen); no physical pen or mouse-mode drawing.
- **Real local service and DB:** `services.api.desktop_local` on `lc_p0_test` through the app's own WSL launch. It is
  a development test service, not a product backend or AI provider. **No AI is connected**, and none was exercised.
- **Recovery:** the relaunch was verified only after QA ended the hung process (QA-WIN-03). A clean own-app exit with
  the link was **not** observed.
- **Controlled failure:** only the unavailable-service fault was run. The coordination-write refusal was not run.
- **Not run:** physical pen, provider/AI, Mac, audio, Notability, Sidecar, and both §7.1 gates. Nothing here is device
  verification of R59/A44 live-screen ink beyond this synthetic Windows pass.

## Other observations

- The host wrote `__pycache__` into the private Backend copy (19 folders). The app's `PYTHONDONTWRITEBYTECODE` does not
  reach the WSL process, because WSLENV does not carry it. This is harmless for a private copy. If the copy is ever
  shared, `-B` in the launch or a WSLENV entry would avoid it.
- Owner control on this tree: the `apps/windows` unit tests pass 221, skip 5 and fail 0.

## Reproduce

```sh
# WSL, from the repo. Node 24.21.0 on PATH; the app staged as %TEMP%\lc-qa-windows-parent (windows-stage buildAndStage)
git archive c4c84a5 services packages | tar -x -C <private copy>
QA_STAGE_NAME=lc-qa-windows-parent QA_BACKEND=<private copy> node tests/e2e/windows/run.mjs parent <empty out dir>
python3 tests/e2e/windows/analyze_parent.py <out dir> <evidence dir>
# after every host has exited:
repo/.venv/bin/python tests/e2e/windows/qa_parent_db.py cleanup --backend <private copy> --actor <preflight actor> --run <out dir> --out <out dir>/cleanup.json
# QA-WIN-03 alone: node tests/e2e/windows/run.mjs parentquit <empty out dir>
```
