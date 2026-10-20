# S1 cleanup correction retest — 2026-10-20

**READY for Lead integration review; S1 closes at exact Backend
`63ddf8e3e2a6763c0fae03e554b77e8685a9b3a5`.** The held parent `4c5e071`
and its [original failure evidence](../pipe-cleanup-4c5e071-review-20261020/README.md)
remain unchanged. This is the same bounded P0-09 review, continued through
`handoff_87e46f21723caee57836e60ccb82962e`.

The complete delta, resulting `close()`, author report and raw correction
receipt were read. Current policy/requirement files do not differ between the
previously refreshed Lead `e393e0d` and supplied main `4f82fbd`.

## Independent result

The [small retest driver](../../../../tests/probes/support/retest_pipe_close_63ddf8e.py)
imports the **unchanged original Support scenario**, verifies its hash and the
corrected connector hash, then runs that scenario once against an exact Git export.
The original parent/held-candidate comparison was not rerun or rewritten.

The synthetic child closes stdout on SIGTERM but retains unread stdin. With
4,128,768 bytes buffered and a 50 ms shutdown timeout, corrected `close()`:

- returned in **52.38 ms**, with observed return code `-9`;
- called `process.wait()` twice, completing the kill/reap fallback;
- returned successfully when called again;
- recorded no event-loop callback errors and left a closing transport.

[Raw scenario result](corrected-witness.stdout.json), [empty stderr](corrected-witness.stderr.txt),
and [exact commands/source hashes](execution.json) are retained. The harness
reaped only its synthetic child; no installed Codex or provider was involved.

**Seven selected regression cases passed in 0.38 s**, independently run once:
deadline escalation and caller-cancel/reclose (2), paused oversized stdout (1),
broken/reset stdout (2), and the existing operator/default-isolation EOF/wait
barrier (2). [Actual output](focused.stdout.txt); stderr is empty. Unraisable
warnings were treated as errors. The two new cases also check parser termination
before discard, actual SIGKILL/reaping, successful repeated close, an intact
public stdin-closure waiter, joined tasks and no callback errors.
Author-reported 121 passes are not inherited or added to these counts.

## Why S1 closes

`chatgpt_rpc.py:986–993` no longer awaits stdin's shared `wait_closed()` future.
The two bounded attempts use `process.wait()`, so cancelling one attempt does
not poison a later stdin-close waiter. After observing child exit, a remaining
stdin write buffer is aborted through the public transport API, with no intervening
await and no detached waiter. This does not discard input to a still-running child.

Parser cancellation/join, bounded stdout discard, expected broken/reset-pipe
handling, serialized close calls, the existing terminate/kill deadlines and
the event-loop callback barrier remain. Caller cancellation propagates; the
affected regression verifies that a later close can finish. The existing operator
EOF/process-wait synchronization barrier remains intact. No concrete remaining
regression was found in this changed boundary.

Lead owns integration of the held cleanup base plus this correction and the
existing hosted Python 3.12 observation. Only local Python **3.14.4** synthetic
checks ran here; no interpreter/dependency installation, full campaign, product
source edit, account/provider/network/private-state access, Windows/display,
microphone/audio/TTS operation, live lease or retry occurred.

This closes the reproduced S1 defect, not the original CI warning's unknown
allocating test or its hosted elimination. It does not diagnose or fix
Candidate08, establish target-OS behavior, or pass product acceptance.
