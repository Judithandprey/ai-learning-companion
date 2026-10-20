# Candidate 08 nonvoice live run — executed once, 2026-10-20

**Outcome.** The run executed once. It stopped after action 1, because the product's own AI session ended: "the request
failed; nothing more is sent by itself". **1 of 4 real actions was consumed**, and the one native attempt is consumed.
Mechanics did not pass. Acceptance was **not reached**: no answer was ever shown, so none could be judged. Cleanup is
confirmed and `release_blockers` is empty, so DISPLAY and ACCOUNT were released.

## The run

- **Assignment.** Lead `handoff_57b4cf20`, at baseline `a6406b4`.
- **Approvals.** The human authorizations `human-live-nonvoice-resume-20261014:ee8c9bd2…`, `human-manual-qa-20261014:d8d9d05f…`
  and `human-resume-after-restart-20261020:4bc3bf4f…`. The single command was approved on the human's normal Bash card.
- **Allocation.** `manual-live-20261020-0dd413a4dcf64478b9a4360c633e959a`, SHA-256 `886712ef…`, valid
  12:24:29Z–14:24:29Z. It was checked first: active, Lead-reviewed, pins identical at `a6406b4`, output and scratch
  unused.
- **Pins.** Candidate `0847eeb6…`, wrapper `efa634ca…`, runner `4655ec11…`, watcher `d5ccfa48…`. Product `0ff325b`,
  81/81 staged files, Electron 44.5.1.
- **Command.** It ran once in the foreground, with a 600 000 ms tool timeout and no retry:
  `node tests/e2e/windows/qa_run_live_candidate.mjs --execute docs/verification/qa/p0-13-live-0ff325b/execution-manual-20261020-candidate08-01 /tmp/lc-live-allocation-0dd413a4dcf64478b9a4360c633e959a.json 886712ef…`
- **Time.** Preparation took 0–8.1 s, native 8.1–47.2 s, cleanup 47.2–54.4 s; the report was written at 54.4 s.
  - The runner's own clock: 1.1 s of startup, and its finally at 38.3 s. The 320 s work deadline was not reached.
  - The native launcher exited 0 with no signal and no timeout, and its output was complete.

## The actions ([ledger.json](ledger.json), [captures/…/live.jsonl](captures/ff218cbde80a84cf/live.jsonl), [receipts-sanitized.json](receipts-sanitized.json))

| Slot | What happened |
| --- | --- |
| 1, unattended look | The look was sent at 12:27:52.666Z. The connector receipt: submission acknowledged, **terminal_status completed**, produced `userMessage`, `reasoning` and `agentMessage`, `gpt-6-astra`, the image hash matching the app's record, the codex digest pinned. **Outcome `failed`.** At 12:27:58.688Z the app wrote `ended` ("the request failed; nothing more is sent by itself") and `not_looked` (refused, code `failed`). The guard after action 1 stopped the run there. |
| 2–4 | NOT_RUN; no trigger ran. |

- **Counts.** `attempts_used` 1, `possibly_sent` 1, one provider turn (consistent), no extra request, no retry, no
  restart.
- **Source admission.** Every possibly sent request is bound: 8 decisions, main's record agrees, one capture, the
  display matches, and the checker ended cleanly with code 0.
- **Fence.** NOT_RUN; Stop was never reached.

## Cleanup and release ([run.json](run.json), [run-status.json](run-status.json))

- **The Windows runner.** Its exact `powershell.exe` invocation was absent at the first look. Its end is confirmed;
  there were no signals and no errors.
- **The app.** It exited by itself (confirmed).
- **The owned Edge.** It got a graceful close and was then confirmed gone.
- **The connector watch.** Released: 3 processes appeared and every one was seen exiting. The watcher ended at its stop
  file and was joined.
- **Blockers.** `release_blockers` is `[]`, and `owned_launch_cleanup_confirmed` is true.

## Finding for the owner: a completed turn classified as failed

The provider turn **completed** with an `agentMessage`, but the live path classified it as **`failed`** and ended the
session on the first unattended look.

This is how product `0ff325b` reaches that state, read-only:
- `services/worker/connectors/chatgpt_rpc.py` builds the answer from the `final_answer` agent messages, else from those
  with no phase. If that text is empty, it raises **`incomplete_turn`**.
- `services/worker/connectors/chatgpt_live.py` maps `incomplete_turn` and `request_failed` to wire code `failed`, and
  stops the session for that failure.

These match the record:
- an `agentMessage` produced only with phase `commentary`;
- or agent messages not delivered in the `full` items view.

That is an inference. The bounded receipt and the app's records hold no reason code (`live.jsonl` has only `failed`),
so which branch applied is **unknown**. Recording the connector's own bounded reason code would make the next such
result diagnosable.

## Not run or not judged

- Actions 2–4 and the Stop/fence did not run.
- No answer text was shown, so no pixel matcher or human reading was possible.

This is not a product, voice, Mac or full-gate acceptance.

## Evidence

The committed files are exactly the [publish allowlist](publish-allowlist.json) plus this README. The empty stop file
was removed. The raw receipt stays outside Git, under `~/.local/state/lc-qa-live/…`. The scratch folder is kept in
place.
