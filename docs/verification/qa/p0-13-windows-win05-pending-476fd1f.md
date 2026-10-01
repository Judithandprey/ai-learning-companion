# QA-WIN-05: a pending send is said as waiting, at `476fd1f`

- **Assignment:** lead `handoff_4a7462d6ff20c6603a98c39f62a3b66b`. Task card:
  [windows-win05-next-qa.md](../lead/windows-parent-review/correction/qa-win-03-04/copy-retest/independent-qa-audit/windows-win05-next-qa.md).
  One bounded check of the changed path on the real Windows app.
- **Candidate:** exact pushed `476fd1fb832e708b79ad5e5be1c7ef17925febee`.
  - Its `apps/windows` equals the owner delivery `d295a51` (code `44fbd50`).
  - `team/qa` merged it normally as `0678c9a`. `apps/`, `services/` and `packages/` are identical to `476fd1f`.
- **Decision: PASS. QA-WIN-05 is closed for the behavior tested.** The acceptance run (run 2) passes 16 of 16 checks,
  with no failed step.
  - **Waiting is said at once.** With the service not answering, the app said "waiting for the service to confirm"
    0.10 s after the frame it was sending. The earlier build kept saying "storing" for about 182 s.
  - **Confirmed counts stay truthful.** While the send was pending, the stored count stayed at 2 and the pending
    record was counted as "not known whether stored". No text said frames are stored.
  - **A real answer raises the count.** 0.35 s after QA asked for the service to be resumed, the app showed 3 stored
    and nothing unknown. The server's own receipt for that record was created after the resume.
  - **Stop during a pending send ends unconfirmed, with no live claim.** The stream stopped with 3 stored and 1 "not
    known whether stored". On the server there are exactly those 3 records, and no record or receipt of the given-up
    send.
- **Two runs were needed, and both are reported.** In run 1 the first three points behaved the same way, but the Stop
  case was not exercised because of a mistake in QA's scenario, not in the app (see
  [Run 1](#run-1-stop-case-not-exercised)). Run 2 is the acceptance run.
- **One point of wording for the lead: the pass rests on my reading of it.** The task card asks that "header and line
  state waiting/unconfirmed promptly". While a send is pending and the stream is live, the line says waiting, but the
  header keeps the same text as when nothing is pending: frames "are also sent … A record counts as stored only once
  that service confirms it". This is the design the lead's copy review describes. See
  [What the app showed](#what-the-app-showed-run-2).
- **Input:** no pen input. Start and Stop were DOM clicks; the page changes were QA's own, made through Edge's
  DevTools. No AI is connected, and none was exercised.
- **Display and release:**
  - Checked free at 04:14:47 UTC on 2026-10-01 (no `electron.exe`), then claimed in the start report.
  - Run 1: 04:15:08 to 04:16:33 UTC. Checked free again at 04:18:14. Run 2: 04:18:23 to 04:19:33 UTC (the runner
    itself ended 04:19:17; the host watcher ended 04:19:32 with nothing remaining).
  - No foreign Electron was seen at start, at the screenshots or at the end of either run. The cursor did not move
    during either run.
  - Every app process exited by itself with code 0. Each run's one host exited, and no `wsl.exe` child was left.
  - QA's Edge and console windows were ended by the runner by PID.
  - At 04:20:01 UTC there was no `electron.exe` and no Edge process of the run's profile. **The display has been free
    since then.**

## Environment and method

- **Host:** Windows 11 10.0.26200, one display of 1280×800 DIP at scale 2, Electron 44.5.1. WSL2 Ubuntu with
  PostgreSQL 18.6.
- **Build:** staged fresh as `%TEMP%\lc-qa-windows-win05`. The staged `package.json` + `dist/**` (57 files) has tree
  hash `4e65f654…`; a clean rebuild from `git archive 476fd1f` gives the same hash. See
  [build.json](p0-13-windows-win05-pending-476fd1f/build.json).
- **Backend:** a private `git archive 476fd1f` copy of `services/` + `packages/`, identical to the candidate. The app
  launched its host itself through the released WSL private-stdin path.
- **Database:** only the existing migrated `lc_p0_test`, through the existing DSN, database-name, migration and
  pristine-actor guards. Each run used one fresh actor.
  - The DSN never appeared in argv, logs or evidence.
  - Nothing touched `lc_desktop_preview`, ports 4173/8174, Paperclip, user sessions or any existing service.
- **The fault:** the same isolated one as in the previous retest. The WSL watcher pauses only this run's own host
  (SIGSTOP, by exact PID), so the request stays open with no answer, and continues it later (SIGCONT).
  - Here the host was continued after about 11 s, well inside the app's own 60 s wait for one try. The old 182 s
    timeout was not replayed.
- **Harness** ([tests/e2e/windows/](../../../tests/e2e/windows/)):
  - New scenario `parentwin05` (76 steps) and new analyzer `analyze_win05.py`, both for this candidate only.
  - The frozen `86d2405` material is untouched: the `parentfix` step list is byte-identical before and after this
    change, and `analyze_fix.py`, `replay_analyze_fix.py`, `qa-electron-runner.ps1` and `qa_parent_db.py` have no diff.
    `run.mjs` changes only its usage text.
  - `run.json` holds the hashes run 2 executed. Those files are committed unchanged, except `analyze_win05.py`: one
    note of it was corrected after the run (`de85964e…` → `f7e66ef1…`). No condition and no status changed; see
    [Results](#results-run-2-1616).
- **Pre-run review:** two independent reviewers checked the scenario against the app source and the analyzer for
  checks that could pass without evidence. Their findings were fixed before run 1.
- **Control, not native QA:** the owner's module tests on this tree pass 236, skip 5 and fail 0 (in-memory store).

## What the app showed (run 2)

These are the app's own status, header and line at each moment. "Stored" is the app's confirmed count. The times
are those of the app's status events; each header and line was read by QA within 0.1 s after its event.

| Moment | Status | Header says | Link line (after "Capture storage (development): ") |
| --- | --- | --- | --- |
| Before the pause | `sending`, no send out, 2 stored | frames "are also sent … A record counts as stored only once that service confirms it" | "connected: frames are sent as they are kept. 2 record(s) stored. AI: not connected." |
| Host paused, one page change: 0.10 s after that frame | `sending`, **awaiting**, 2 stored, 1 unknown | the same text | "**sending: waiting for the service to confirm.** 2 record(s) stored; **1 not known whether stored.** AI: not connected." |
| 10.8 s later, still paused | the same | the same text | the same line |
| 0.35 s after the resume request | `sending`, no send out, **3 stored**, 0 unknown | the same text | "connected: frames are sent as they are kept. 3 record(s) stored. AI: not connected." |
| Host paused again, one change, then **Stop**: 0.11 s after the click | `stopping`, **awaiting**, 3 stored, 1 unknown | "Whether a local test capture service on it is storing them now **is not confirmed**" | "stopping: nothing new is sent; **the last send is waiting for the service to confirm.** 3 record(s) stored; 1 not known whether stored. AI: not connected." |
| 5.02 s after the click (the app's own wait is over) | `stopping`, no send out, 3 stored, 1 unknown | "…is not storing them now" | "stopping: nothing new is sent. 3 record(s) stored; 1 not known whether stored. AI: not connected." |
| After the resume | `stopped`, 3 stored, 1 unknown | "…is not storing them now" | "stopped. 3 record(s) stored; **1 not known whether stored.** stream stopped. AI: not connected." |

- Each of these headers also says "No AI is connected; nothing is sent to any AI." Without the link the header reads
  "No AI is connected: … nothing is sent anywhere." The overlay's hint says "No AI is connected."
- **The header while a send is pending in the live state** is the same sentence as when nothing is pending. It does
  not say "waiting", and it does not say frames are stored; it says a record counts as stored only once the service
  confirms it. The line directly below says the send is waiting and counts the record as not known.
  - The lead's source review of this copy describes the same design
    ([windows-win05-copy-review.md](../lead/windows-parent-review/correction/qa-win-03-04/copy-retest/independent-qa-audit/windows-win05-copy-review.md)):
    the header gives the rule, the line gives the waiting.
  - My reading: this meets the task. The waiting is said promptly, in the line, and nothing claims current storage.
    Read strictly, the header itself does not "state waiting"; whether it should is a wording decision for the lead,
    not a defect found here.

## Results (run 2: 16/16)

| Check | Actual |
| --- | --- |
| `confirmed.records_before_the_pause` | Connected, no send out, 2 records confirmed, nothing unknown. The app's record holds exactly those 2 jobs as committed |
| `pending.said_as_waiting_at_once_counts_kept` | The host was paused, then one page change. The frame was sampled 04:18:52.698; the first status with `awaiting: true` came **0.10 s later** (0.34 s after the pause). At that status and at the read: `storing: false`, stored still 2, unknown 1. The record held that one job as `sending`. No status up to the read said anything else |
| `pending.still_waiting_10s_later_inside_the_apps_wait` | 10.8 s later, still paused: the same status, counts and texts, and no status event in between. The resume was requested 10.8 s after the waiting status, far inside the app's 60 s wait |
| `ack.real_answer_raises_the_confirmed_count` | 0.35 s after the resume request: stored 3, unknown 0, no send out. The record holds the job as committed with its acknowledgement. The server's receipt for it was created 0.1 s after the watcher's resume. No "not confirmed" (`stalled`) status appeared: the answer came inside the first try's wait, 11.1 s after the waiting status |
| `stop.during_a_pending_send_ends_unconfirmed_not_live` | A second pause and one change gave a pending send (stored 3, unknown 1). Stop was clicked. 0.11 s later: `stopping`, still awaiting, under the "is not confirmed" header. 5.02 s after the click the app gave the send up: `stopping`, no send out, 1 unknown; the record holds the job as `unknown`. After the resume: `stopped`, 3 stored, 1 not known, "stream stopped". From the click on, no status said `sending`, storing or a higher stored count |
| `server.holds_exactly_what_the_app_called_stored` | Read back after the host exited. The server holds 3 capture records, each once, each with a receipt and with raw, composed and ink bytes equal to the local files. The stream is `stopped` on the server (revision 2). Of the send given up at the Stop there is no record and no receipt on the server, and the app never counted it as stored. **Whether its upload reached the server cannot be told from this run**: the frame it carried has the same bytes as an earlier frame (QA showed the same panel again), and that original is already stored under an earlier record |
| `copy.every_read_is_the_accepted_text_without_a_storage_claim` | All 11 reads: the header and the line are this candidate's texts for the status shown; the line's counts are the status counts; no text says frames are (being) stored |
| `no_ai.said_everywhere` | Every header and every link line, and the overlay hint, say no AI is connected |
| `fault.only_this_runs_host_paused_twice_and_resumed` | The run had exactly one host. It alone was stopped (state `T`) and continued, twice (11.3 s and 6.4 s), at the runner's own steps. It stayed the same process. Nothing was in the private copy when the watcher started |
| `before.link_off_then_idle_no_host` | Without the link: no link line. With it, before Start: "not connected yet", nothing stored, no host and no `wsl.exe` child |
| `run.every_job_is_one_retained_frame` | Four jobs, one retained frame each |
| `release.app_exited_by_itself_nothing_left` | The no-link app and the linked app exited by themselves with code 0, 114 ms and 120 ms after their close requests. The one host exited. The `wsl.exe` child that was listed was gone |
| `run.shared_desktop_quiet`, `run.completed`, `run.cursor_static` | No foreign Electron; all 76 planned steps ran in order with no failed step; the cursor stayed at (2454, 422) px |
| `database.readback_read_only_of_this_actor` | Every document digest is unchanged by the readback, and it is this run's actor |

## Run 1: Stop case not exercised

Run 1 used the same candidate and stage. It is kept as a supporting run:
[supporting-run-1.json](p0-13-windows-win05-pending-476fd1f/supporting-run-1.json).

- **What happened.** For the second pending send, QA's scenario changed one digit on QA's page. That change was below
  the app's retention threshold, so the app correctly kept no frame (its manifest says "pixels changed less than the
  material threshold") and sent nothing. Stop was therefore pressed with nothing pending.
  - The optional wait for a pending send timed out, which is the one failed step of that run.
  - This is a mistake in QA's scenario, not an app defect.
- **What run 1 still shows** (read by the committed analyzer; 13 pass, 1 fail, 2 limit):
  - The same first three results as run 2: waiting said 0.10 s after the frame, the count kept at 2 with 1 unknown,
    and 3 stored 0.18 s after the resume request.
  - A Stop with nothing pending: `stopping`, then `stopped` with 3 stored and nothing unknown.
  - The app exited by itself, the host exited, and the actor was cleaned up (32 documents → 0).
  - The `fail` is `run.completed` (the timed-out wait). The 2 `limit` are the Stop case and the server check that
    builds on it: not exercised, not judged.
- **What changed between the runs.**
  - The scenario now hides or shows QA's whole panel during each pause, a change far above the threshold.
  - The analyzer's frame precondition now looks only at the lines that jobs carry, and the confirmed-count rule
    compares with the record.
  - Run 1's `run.json` records the earlier versions of those two files; the statuses above are a later reading of
    its retained output.

## Evidence

[p0-13-windows-win05-pending-476fd1f/](p0-13-windows-win05-pending-476fd1f/). The files are sanitized: the Windows
profile is `<home>`, and there are no DSN, token, frame or ink bytes.

- `summary.json`: the 16 checks of run 2 with their observed values and all 11 reads, as written by the committed
  analyzer (with the corrected note).
- `runner-results.json`, `steps.json`: the 76 steps, the reads and every status event (`w_events`).
- `coordination-confirmed.json`, `-awaiting.json`, `-acked.json`, `-stop-given-up.json`, `-final.json`: the app's
  record at each moment.
- `manifest-lines.json`, `host-watch.json`, `database-readback.json`, `preflight.json`, `hash-checkpoints.json`.
- `cleanup.json`: run 2's actor only, 32 documents → 0 and the row removed, after the host had exited.
- `supporting-run-1.json`, `build.json`, `run.json`.

Raw whole-display frames and screenshots stay in QA's private run folders. They are not committed.

## Separation and limits

- **Native:** the real Windows app, its real desktop capture, its own WSL host and the real `lc_p0_test` service.
  The pending state was produced by pausing the real host, not by setting any UI state.
- **Synthetic:** Start and Stop are DOM clicks; the page changes are QA's own. No pen input was used.
- **Tested once each:** one pending send that is then answered, and one Stop during a pending send.
- **Not run:**
  - the 60 s and 182 s timeouts, and the "not confirmed" (`stalled`) state they lead to;
  - a refused send, a failed record write (the retry-journal notification fix) and disk-fault reproduction;
  - whether a given-up upload reaches the server (undetermined here, see the server check), and a given-up send
    that is known to have arrived;
  - a quit or a relaunch after the unconfirmed Stop, and the earlier quit, ink and storage campaigns;
  - physical pen, provider/AI, Mac, audio, Notability and both §7.1 gates.
- This is not device verification and not full product acceptance.

## Reproduce

```sh
# WSL, from the repo. Node 24.21.0 on PATH; the app staged as %TEMP%\lc-qa-windows-win05 (windows-stage buildAndStage)
git archive 476fd1f services packages | tar -x -C <private copy>
QA_STAGE_NAME=lc-qa-windows-win05 QA_BACKEND=<private copy> node tests/e2e/windows/run.mjs parentwin05 <empty out dir>
# after the host has exited:
repo/.venv/bin/python tests/e2e/windows/qa_parent_db.py readback --backend <private copy> --actor <preflight actor> --run <out dir> --out <out dir>/readback.json
python3 tests/e2e/windows/analyze_win05.py <out dir> <evidence dir>
repo/.venv/bin/python tests/e2e/windows/qa_parent_db.py cleanup --backend <private copy> --actor <preflight actor> --run <out dir> --out <out dir>/cleanup.json
```
