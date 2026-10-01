# QA-WIN-03 / QA-WIN-04 retest: Windows app quit and storage copy at `86d2405`

- **Assignment:** lead `handoff_329704328c01862a3ca3d25032c0f620`, activating the conditional retest of
  `handoff_47984d838c7d001ba869d5b2f3fac80a`. Boundary:
  [qa-release.md](../lead/windows-parent-review/correction/qa-win-03-04/copy-retest/qa-release.md). This is the narrow
  retest only, not a new campaign.
- **Candidate:** exact pushed `86d240550803022e02dbbb5ae2323793fbfdebfa`.
  - Its `apps/windows` equals the final owner source `41fd2cb`.
  - `team/qa` merged it normally as `b64669f`. `apps/`, `services/` and `packages/` are identical to `86d2405`.
- **Decision: PASS for both defects as reported. QA-WIN-03 is closed. QA-WIN-04 is closed for the reported case, with
  one residual window left to the lead (QA-WIN-05, Low).** One run gives **24 checks passing and 2 with status
  `limit`** (one is raised below as QA-WIN-05, the other is an observation), with no failed check and no failed step.
  - **QA-WIN-03:** all 8 app processes ended by themselves with code 0, in 91–661 ms after the close request. QA
    ended none of them. All 7 relaunches of the same profile came up without killing anything.
  - **QA-WIN-04:** with the service unavailable (the reported case), the header, the link line and the ASK card no
    longer claim storage. In all 20 status reads the header says frames are being stored exactly when the app's link
    reports storing. The ASK card never says frames are stored.
  - **QA-WIN-05 (new, Low; residual of QA-WIN-04):** while one send to a hung service is unanswered, the header and
    line keep saying frames are being stored, for about 182 s here.
- **The earlier `c4c84a5` result stays as it was** (13/15, with its passing capture, ink, storage and readback
  evidence): [p0-13-windows-parent-c4c84a5.md](p0-13-windows-parent-c4c84a5.md). That campaign was not rerun.
- **One observation for the lead** (details [below](#finding-and-observation)): with an earlier never-confirmed
  stream, each relaunch tries a host before any Start. Here it ended without READY each time.
- **Input:** every stroke was a DevTools-injected pen event (synthetic). No physical pen. No AI is connected.
- **Display and release:**
  - Checked free at 02:23:03 UTC on 2026-10-01 (no `electron.exe`), then claimed in the start report.
  - The runner ran 02:24:31 to 02:29:56 UTC. No foreign Electron was seen at start, at the screenshots or at the end.
    The cursor stayed at (1586, 949) px.
  - All 8 app processes exited by themselves. Both `wsl.exe` children that the runner saw had ended, and all 8 hosts
    had exited (watcher end 02:30:11 UTC, none remaining). No `electron.exe` was running at 02:30:23 UTC. **The display
    has been free since then.**
  - QA's own Edge course window and console window were ended by the runner by their PIDs (they do not end by
    themselves). Both were confirmed gone, with no Edge process of the run's profile left (checked 02:43:52 UTC).

## Environment and method

- **Host:** Windows 11 10.0.26200, one display of 1280×800 DIP at scale 2, Electron 44.5.1. WSL2 Ubuntu with
  PostgreSQL 18.6.
- **Build:** staged fresh as `%TEMP%\lc-qa-windows-retest`. The staged `package.json` + `dist/**` (57 files) has tree
  hash `ce192045…`; a clean rebuild from `git archive 86d2405` gives the same hash. See
  [build.json](p0-13-windows-quit-copy-retest-86d2405/build.json).
- **Backend:** a private `git archive 86d2405` copy of `services/` + `packages/`, identical to the candidate before the
  run. The app launched its host itself through the released WSL private-stdin path.
- **Database:** only the existing migrated `lc_p0_test`, through `dedicated_test_dsn`, `verify_test_database`,
  `verify_migrations` (0001–0003) and `verify_pristine_actor`. One fresh actor, `lc-windows-http-b6015a41…`.
  - The DSN was read privately by the app and by QA's helper. It never appeared in argv, logs or evidence.
  - Nothing touched `lc_desktop_preview`, ports 4173/8174, Paperclip, user sessions or any existing service.
- **Isolation:** a fresh `LC_USER_DATA`, app `TMP`/`TEMP`, work folder and Edge profile. The link configuration was
  set for each app process only.
- **Harness** ([tests/e2e/windows/](../../../tests/e2e/windows/)): the executed hashes are in `run.json`, and the
  files are committed unchanged.
  - New scenario `parentfix` (223 steps).
  - `closeApp` now only requests a close and waits. It records the route, the time to exit and the exit code, and it
    never ends a process. Two routes:
    - `wm_close` posts `WM_CLOSE` to the control window, the message a click on its title-bar X results in, so the
      app's own close handler runs;
    - `page` is the page's own `window.close()`, the route of the original QA-WIN-03 report.
  - `hostPause` / `hostResume`: the WSL watcher pauses (SIGSTOP) and resumes (SIGCONT) this run's own test-service
    host only.
    - It signals only a process that appeared under this watcher and whose working folder is the private Backend
      copy. It resumes only while the start ticks are unchanged.
    - It also resumes at a time limit, when the watcher ends, and on SIGTERM/SIGHUP.
  - New analyzer `analyze_fix.py`. A value that was never read fails its check; nothing passes on missing data.
- **Pre-run review:** four independent reviewers (safety and ownership, scenario against the app source, analyzer
  truthfulness, PowerShell 5.1) reviewed the harness before the run. Their findings were fixed first. The main ones:
  - Reviewer finding from Electron's documentation and the source, not observed in this run: a page `window.close()` in
    this sandboxed app does not go through the app's close handler. So the closes while capturing use `WM_CLOSE`.
  - The pause must never touch a process that was already in the copy.
  - Several checks could have passed without data.
- **Control, not native QA:** the owner's module tests on this tree pass 229, skip 5 and fail 0 (in-memory store).

## QA-WIN-03: the app ends by itself, and the same profile starts again

Every close was one request followed by a wait. "Exit" is the time from just before the request until the process
was gone (an upper bound).

| Check | State at the close | Route | Exit | Result |
| --- | --- | --- | --- | --- |
| `quit.control_without_link` | No development link (control) | page | 118 ms, code 0 | pass |
| `quit.idle_native_close` | Link configured, never started. Status `idle`; no `wsl.exe` child; no host while it ran | `WM_CLOSE` | 154 ms, code 0 | pass |
| `quit.after_stop_page_close` | After Start, storing, the paused-host fault and Stop. Status `stopped`, 5 stored | page | 140 ms, code 0 | pass |
| `quit.while_capturing_bounded_stop` | **Capturing and storing, no Stop pressed** (state `sending`, `storing: true`, 3 stored). A second `WM_CLOSE` was posted to the same window 71 ms after the first | `WM_CLOSE` ×2 | 661 ms, code 0 | pass |
| `quit.relaunched_idle_page_close` | Relaunched after that close, not started again. Status `stopped`, 3 stored | page | 91 ms, code 0 | pass |
| `quit.unavailable_after_stop` | Test service unavailable; Start, write, ASK, Stop. Status `stopped`, registration "not known" | `WM_CLOSE` | 119 ms, code 0 | pass |
| `quit.unavailable_while_capturing` | Test service unavailable, **capturing, no Stop pressed**. Status `not connected` | `WM_CLOSE` | 260 ms, code 0 | pass |
| `quit.final_relaunch_close` | Last relaunch (unavailable configuration), no Start | page | 105 ms, code 0 | pass |

- **Close while capturing and storing** (the bounded Stop at quit):
  - The app ended the session itself: the capture manifest ends with one line, reason "the app was closed". By source
    only the control window's own close handler writes that reason (`main.ts:1150-1154`).
  - The second `WM_CLOSE` was queued for the still-valid window (the post returned true). How the app handled it was not
    observed; there is one `ended` line and exit code 0. It arrived while the session was ending, not during the
    link's stop at quit.
  - The link sent one stop (outcome `stopped`). The record's stream is `final: stopped`, with all 3 jobs committed.
  - The server stream is `stopped`, revision 2, with `pre_stop_sequence: null` (kept as unknown, as before).
  - The server holds 3 records for it, with 0 byte mismatches.
  - The app recorded "the host ended" for that stream before it exited. The watcher (0.2 s poll) logged the host's exit
    within 0.05 s of the app's exit time.
  - The ink written just before the close is saved: the same two sessions and revisions are listed before the close
    and after the relaunch.
  - The whole close took 661 ms, far inside the app's 20 s bound.
- **Close while capturing, service unavailable:** the manifest again ends with "the app was closed". The stream stays
  `registered: false`, `final: null`. Nothing was claimed stored.
- **`relaunch.same_profile_without_kill` — pass.** Seven relaunches of the same user-data folder, each about 1.6 s after
  the previous process exited by itself with code 0. Each new control page came up and listed the displays. No
  `endHungApp` step exists in the scenario, and the runner's last-resort close in `finally` was not used.
- **`relaunch.record_and_ink_kept_no_host_before_start` — pass.**
  - After Stop and relaunch: `stopped`, 5 stored, the same saved ink listed.
  - After the close while capturing and relaunch: `stopped`, 3 stored, 0 unknown.
  - With every earlier stream closed, no host appeared between a relaunch and the next Start, at the watcher's 0.2 s
    poll (a host living less than that could be missed). Three windows, all covered by the watcher; the third is the
    whole life of the relaunched process that was never started. The child-process reads in those windows show no
    `wsl.exe`.
- **`originals.kept_through_closes_and_fault` — pass.** 19 hash checkpoints and 25 originals (13 retained frames, 8 ink
  originals, 4 context pictures). Each keeps its bytes, equal to its name, at every checkpoint that hashed it (frames
  are hashed at 13 of the 19). Manifests only grow.
- **`release.owned_processes_ended_by_themselves` — pass.** See the display section above.

## QA-WIN-04: the copy follows the link state the app reports

- **`copy.header_and_line_follow_the_link_state` — pass.** 20 reads: 19 with the link configured and 1 without.
  - With the link (19 reads):
    - the header says "are also being stored" exactly when the status has `storing: true` (6 reads), and that only
      in state `sending`;
    - the line's "N record(s) stored" equals the status count;
    - nothing asserts that a send was not stored.
  - Without the link (1 read): no link line and no storage claim are shown.
  - Every header says no AI is connected.
- **`copy.each_state_reads_as_expected` — pass.** The actual link lines:

| State | Header | Link line (after "Capture storage (development): ") |
| --- | --- | --- |
| Idle, before any Start | not storing them now | "not connected yet (a connection is tried when you press Start). 0 record(s) stored. AI: not connected." |
| Storing | are also being stored | "storing. 3 record(s) stored. AI: not connected." |
| Lost reply | not storing them now | "not storing now (the frames are kept on this device). 3 record(s) stored; 1 not known whether stored. storage of the last send is not confirmed (no answer, or the service said to send it again later); the same record(s) are tried again. AI: not connected." |
| Recovered | are also being stored | "storing. 4 record(s) stored. AI: not connected." |
| Stopped | not storing them now | "stopped. 5 record(s) stored. stream stopped. AI: not connected." |
| Relaunched after Stop | not storing them now | "stopped. 5 record(s) stored. the host ended. AI: not connected." |
| Service unavailable | not storing them now | "not connected (the frames stay on this device). 0 record(s) stored. the host ended without READY (unavailable). AI: not connected." |
| Unavailable, after Stop | not storing them now | "stopped. 0 record(s) stored; 1 earlier stream(s) whose end is not known. the stream was never confirmed registered; whether it or a grant exists is not known. AI: not connected." |

- **The isolated fault: one send with no answer, then recovery** (`fault.only_this_runs_host_paused_and_resumed` —
  pass).
  - Exactly the session's one host was stopped (state `T`) for 183.3 s and continued. It stayed the same process and
    no other host started, so the recovery is a later answer from the same service, not a reconnect.
  - One visible page change was retained during the pause. The first request of its job `b5-5`, the upload of the
    frame's raw picture, got no answer (by source it is sent three times, `capture-link.ts:721`).
- **`copy.lost_reply_is_unconfirmed_not_failed` — pass.** 182.7 s after the pause was requested (182.5 s after the
  watcher's SIGSTOP) the app said `stalled`: "not storing now", `storing: false`, stored still 3, and **1 "not known
  whether stored"**. The detail says storage "is not
  confirmed" and that the same record is tried again. Nothing says the record was not stored.
- **`copy.later_answer_restores_storing` — pass.** 0.4 s after the host was continued: state `sending` with
  `storing: true` again, stored 4, unknown 0.
- **`counts.final_counts_equal_the_server_once_each` — pass.**
  - Stream 1: status 5 stored = 5 committed jobs = 5 server records. Stream 2: 3 = 3 = 3.
  - The server holds 8 capture records, all distinct, and 15 distinct originals. The unanswered upload left that
    picture on the server once (created right after the resume). The record batch of that job was sent once, after
    the resume. **A repeated record batch was not exercised.**
  - Raw, composed and ink bytes: 16 pictures (the raw and the composed picture of each of the 8 stored frames) and all
    ink originals compared, 0 mismatches.
  - The two unavailable streams left nothing on the server.
- **`copy.ask_card_conditional_in_every_state` — pass.** Five card reads: storing, a send waiting, not storing,
  storing again, and service unavailable. Each time the first line is the same:
  "No AI is connected: this selection was not sent to any AI. (Development mode: a local test capture service on this
  device **may** also store the whole-display frames kept here, **only while it is connected and answering**; the
  control window shows whether it is storing now.)" The card never says frames are stored, and the hint says no AI is
  connected.
- **`card.open_card_unchanged_through_fault_and_recovery` — pass.** One card was left open from before the pause until
  after the recovery (about 3 min).
  - All four reads have the same text, the same image source (sha256 of the card image's data-URL text, read in the
    page) and the same ink revision 1. No pixel comparison of the card was made.
  - Closing it returns to WRITE with no card. The next stroke is revision 2.
  - The saved ink and its context pictures are byte-identical before the pause and after the recovery.
- **`database.readback_read_only` — pass.** Every document digest is unchanged by the readback.

## Finding and observation

### QA-WIN-05 (Low; development link mode only; owner Web through the lead)

A residual of QA-WIN-04: the wording after a lost reply is now right, but it comes late.

- **Steps:** with the link storing, the test service stops answering without closing the connection (here: QA paused
  this run's own host). A frame is then retained.
- **Actual** (`copy.says_storing_while_a_send_waits`, `limit`):
  - 8 s into the pause the record held one request still out (job `b5-5`, status `sending`).
  - The header, read once at that moment, said "…are also being stored in a local test capture service on it; the counts
    are below…". The line said "storing. 3 record(s) stored."
  - No status event arrived until the app said "not storing now", 182.7 s after the pause was requested. So the last
    shown status stayed "storing" for that whole time. The stored count stayed right (3).
- **Expected** (QA-WIN-04's own wording): "When nothing is being stored, they do not say that frames are stored."
- **Cause, by source:** one upload is three sends (`capture-link.ts:721`, `uploader.ts:426-431`) of 60 s each
  (`loopback-http.ts:36`), and the status is notified only when the upload returns (`capture-link.ts:773-775`). This
  matches the reviewed definition of `storing`: no send has gone unanswered since the last answered one.
- **My reading:** Low. It needs a service that hangs while keeping its connection open; an unavailable service was
  reported within about 1 s of Start (`e_events` in `runner-results.json`), and the counts are never wrong. The lead
  can accept it as designed for this development mode, or route a shorter wait or an "in progress" wording to Web. It
  does not reopen the reported QA-WIN-04 case.

### Observation: a host is tried at relaunch while an earlier stream is unconfirmed

`relaunch.unavailable_hosts_before_a_start_observed`, `limit`. Not judged.

- The watcher saw none at the first unavailable launch (no unconfirmed stream yet), 1 at the next relaunch and 2 at
  the last. Each ended without READY within about 0.4 s.
- The line then reads "…N earlier stream(s) whose end is not known. not reconciled: the host ended without READY
  (unavailable)".
- Each attempt adds one "not reconciled" note to that stream in the record. The first unavailable stream has 3 by the
  end: from two relaunches and from the next Start, which also tried it again (two hosts appeared at that Start).
- By source this is the app's read/control-only reconcile (`capture-link.ts:986-1016`). The run shows that no document
  was created for those streams. With every earlier stream closed, no host starts before a Start (passed above).

## Evidence

[p0-13-windows-quit-copy-retest-86d2405/](p0-13-windows-quit-copy-retest-86d2405/). The files are sanitized: the
Windows profile is `<home>`, and there are no DSN, token, frame, ink or picture bytes.

- `summary.json`: the 26 checks with their observed values and all 20 status reads. The note of
  `copy.says_storing_while_a_send_waits` calls it an observation; this report raises it as QA-WIN-05.
- `runner-results.json`, `steps.json`: the 223 steps, with every close and relaunch entry, the app's status reads and
  the card reads.
- `coordination-paused-8s.json`, `coordination-stalled.json`, `coordination-final.json`: the app's record during the
  fault and at the end.
- `manifest-ends.json`: each capture's header and `ended` line.
- `host-watch.json`: host appear/exit and the pause/resume events.
- `hash-checkpoints.json`, `database-readback.json`, `preflight.json`.
- `cleanup.json`: this run's actor only, 81 documents → 0 and the row removed, after every host had exited.
- `build.json`, `run.json`.

Raw whole-display frames, ink documents and screenshots stay in QA's private run folder. They are not committed.

## Separation and limits

- **Native:** the real Windows app, its real windows, the real desktop capture and the real close paths (`WM_CLOSE`,
  page close). A physical click on the title-bar X was not made; `WM_CLOSE` is the message that click sends.
- **Synthetic:** pen strokes (DevTools-injected) and toolbar/Start/Stop clicks (DOM clicks).
- **Real local service and DB:** `services.api.desktop_local` on `lc_p0_test`. It is a development test service; no
  AI or provider is connected or was exercised.
- **Not run:**
  - a second quit arriving while the link's stop at quit is still pending, and a quit whose stop gets no answer (the
    20 s bound was never reached; the longest close took 661 ms);
  - a repeated record batch after a lost reply (the lost reply here was an original's upload);
  - a close while the link is still connecting, or during a startup reconcile;
  - a quit with unsaved ink held;
  - Windows sign-out;
  - the coordination-write refusal fault;
  - physical pen, provider/AI, Mac, audio, Notability, Sidecar and both §7.1 gates.
- This is not device verification of R59/A44 live-screen ink, and it is not full product acceptance.

## Reproduce

```sh
# WSL, from the repo. Node 24.21.0 on PATH; the app staged as %TEMP%\lc-qa-windows-retest (windows-stage buildAndStage)
git archive 86d2405 services packages | tar -x -C <private copy>
QA_STAGE_NAME=lc-qa-windows-retest QA_BACKEND=<private copy> node tests/e2e/windows/run.mjs parentfix <empty out dir>
# after every host has exited:
repo/.venv/bin/python tests/e2e/windows/qa_parent_db.py readback --backend <private copy> --actor <preflight actor> --run <out dir> --out <out dir>/readback.json
python3 tests/e2e/windows/analyze_fix.py <out dir> <evidence dir>
repo/.venv/bin/python tests/e2e/windows/qa_parent_db.py cleanup --backend <private copy> --actor <preflight actor> --run <out dir> --out <out dir>/cleanup.json
```
