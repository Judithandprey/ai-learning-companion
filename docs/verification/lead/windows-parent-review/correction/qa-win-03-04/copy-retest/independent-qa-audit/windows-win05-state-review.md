# QA-WIN-05 state review — HOLD for one notification correction

Code `d6f4e202c25cbd1297dc20afd7e8b4536c591177`, evidence `10cbae629b6d7330e0da61b5668c43e338d00a97`, based on `41fd2cb`; exact export `/tmp/lc-win-win05-10cbae6`. Its Windows tree matches the code commit; 66 inspected source/test/fixture/report files were checked byte-for-byte. UI/evidence review is independently owned.

**WIN05-STATE-01 — failed retry witness leaves the UI with temporary counts.** At `apps/windows/src/main/capture-link.ts:731–736`, retrying a known `not_sent` job sets it to `sending` and calls `save()`. If saving fails, the fault path publishes status while that temporary value is present. The job is then correctly restored to `not_sent`, but the method returns without a corrected notification.

Independent reproduction: three original PUT attempts throw `ECONNREFUSED`, leaving 2 records known not sent. An injected `ENOSPC` on the next retry witness yields:

| Observation | unknown | not_sent | awaiting | further sends stopped |
| --- | ---: | ---: | --- | --- |
| Last pushed status | 2 | 0 | false | true |
| Direct status after rollback | 0 | 2 | false | true |

The old journal stays byte-identical and there is no fourth upload. No premature committed count or data loss is shown. The remaining issue is the pushed state consumed by the UI. **Small correction:** notify after rollback, retaining the existing sticky fault and blocked dispatch; add one assertion that notified and direct counts agree.

Two other bounded groups pass: a held batch is announced pending before its dispatch, exact ACK changes only confirmed counts, and Stop during the next held batch leaves stored2/unknown2 with awaiting cleared; a typed refusal is announced with awaiting false before the following state read waits. Exact persisted job key/body matched the dispatched batch. Source review confirms the existing unknown/stuck, retry identity and Stop/cancellation boundaries remain intact.

Reproduce all three groups (exit0 establishes the recorded observations, not overall approval):

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-win05-state-probes.mjs
```

Probe/output: `/tmp/windows-win05-state-probes.mjs`, `.json`, `.log`. Machine review, exact source SHA-256 values and artifact hashes: `/tmp/windows-win05-state-review.json`.

The initial custom delay fake omitted AbortSignal handling and timed out on Stop; its source/log are preserved as `windows-win05-state-probes-initial-harness.mjs` and `windows-win05-state-probes-initial-harness-error.log`. The fake was corrected to match the real/existing fake transport cancellation contract, then the observations above completed. This was a harness error, not a production defect.

Pinned Node v24.21.0, actual coordinator/uploader, existing fake child and copied fixtures; no GUI, Windows execution, real child, socket, Backend, database, provider or broad tests. Owner test totals and the prior QA182-second stall are not counted as this review's execution. No repository files changed. Complete source/English §7.1/7.2 refreshed; PONYTAIL LITE applied without altering input/ink or provider acceptance boundaries.
