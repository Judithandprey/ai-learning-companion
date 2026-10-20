# Owned-pipe cleanup review — 2026-10-20

**HOLD: one introduced shutdown regression, S1.** Reviewed exact Backend
`4c5e071e42b6bf49818c36b07278c228bb3667b8`, parent
`4e840a4b82896ded93d7844966bac60beaa47f22`, its complete diff/report and the
reader, bridge and launch-owner cleanup paths. This is the existing bounded
P0-09 follow-up from `handoff_efced72b704d037870c153100d3c1867`.
Backend retains the correction; Lead retains integration.

## S1 — Timed-out stdin closure prevents the kill/reap fallback

**P1 lifecycle blocker.** In `services/worker/connectors/chatgpt_rpc.py`,
`reap()` directly awaits `process.stdin.wait_closed()` at line 988, inside the
first `wait_for` at line 1004. If stdout reaches EOF but buffered stdin has not
closed, that timeout cancels the protocol's shared stdin-closure future.
The kill fallback at lines 1005–1010 then calls `reap()` again: its second
`wait_closed()` raises `CancelledError` immediately, before `process.wait()`
and the callback barrier at lines 991–994. Later pipe closure can also raise
`InvalidStateError` when resolving the cancelled future.

The installed CPython 3.14.4 source confirms the mechanism:
`asyncio/streams.py:357–358` awaits `_get_close_waiter()` directly;
`asyncio/subprocess.py:113–115` returns the shared `_stdin_closed`;
lines 80–83 resolve it without a cancelled-state guard.
Exact local source paths and hashes are retained in [execution.json](execution.json).
No external documentation/network access or interpreter installation was used.

The [minimal probe](../../../../tests/probes/support/pipe_close_timeout_4c5e071.py)
executes the actual parent and candidate `ChatGPTAppServer.close()` against
separate short-lived Python children. Each child keeps stdin unread and, on
SIGTERM, closes stdout without exiting. The parent buffers 4 MiB of synthetic
bytes, starts the real parser task, then closes with a 50 ms shutdown timeout.
This models a stalled child's shutdown after a pending large write; it is not
an observation of installed Codex. The probe's outer bound is one second.

| Observed result | Parent `4e840a4` | Candidate `4c5e071` |
| --- | --- | --- |
| First `close()` | Returned, 52.5 ms | `CancelledError`, 50.6 ms |
| Return code when first close completes | `-9` | Still unknown (`None`) |
| `process.wait()` calls by that close | 2 | 0 |
| Second close after harness reaping | Returned | `CancelledError` |
| Recorded event-loop callback errors | None | `InvalidStateError` |

Both children were subsequently reaped by the harness; both final transports
were closing, with return code `-9`. The probe records callback errors in JSON,
rather than treating them as passes or suppressing them without evidence.
[Raw result](timeout-probe.stdout.json), [stderr](timeout-probe.stderr.txt).
Exit 0 confirms the asserted defect witness and parent control.

The same unshielded future is exposed to caller cancellation, so a later
serialized close cannot reliably recover once it is cancelled. The concrete
execution above covers deadline cancellation and repeated close; arbitrary
async event-callback reentrancy was not executed or certified.

**Required correction:** prevent timeout/caller cancellation from cancelling
the shared stdin-closure future, retain ownership and joining of any introduced
wait task, and preserve the existing terminate/kill/reap deadlines. Keep parser
termination before stdout discard and the EOF/process-wait callback barrier.
An owned, shielded close waiter is one option; no private-API workaround,
warning filter, unbounded wait or replacement process owner is needed.

## Focused checks and remaining boundaries

The exact candidate passes **12 selected existing cases**, independently run
once under Python 3.14.4 with unraisable warnings treated as errors:
paused oversized stdout, broken/reset stdout, four parser-fairness variants,
terminal notification versus actual reaping, close during ASK, and both default
isolation/EOF-wait synchronization variants. [Actual output](focused.stdout.txt)
is `12 passed in 0.29s`; stderr is empty. This is narrower than the author's
119-case run, whose count is not inherited or added.

Source review confirms normal parser cancellation propagates, production
`on_event` is synchronous, the close lock serializes callers, and discarded
stdout bypasses the protocol parser and publication. The new drain shares the
existing two shutdown windows. These positive observations do not close S1.
The existing operator EOF/process-wait synchronization test is unchanged and
its two variants passed; do not replace it with early termination.

Current Lead policy/decision revisions were read through Git objects without
resetting this worktree; all four source/English manifest pairs matched at
`e393e0d`. The task retains R38 / D-SUBSCRIPTION-FIRST and explicit Stop/R41
boundaries. No production source, shared wire, platform policy or dependency
was edited. No installed Codex, account, provider, network, private state,
Windows/display, microphone/audio/TTS or live lease/retry was used.

Backend should repair S1 and rerun its narrow cleanup regressions plus this
witness; Lead can then integrate and observe the existing hosted Python 3.12
matrix. Python 3.12 was neither installed nor tested here. The original CI
warning's allocating test remains unproven; Candidate08 is not diagnosed or
fixed by this review.
