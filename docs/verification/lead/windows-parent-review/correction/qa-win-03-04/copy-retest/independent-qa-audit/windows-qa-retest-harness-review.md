# Windows QA retest harness — HOLD for reuse

Reviewed leaf `6a3611e2567cf97e858ff146a55c8d0fda7d832c` against its parent, limited to the five changed Windows QA scripts and their report. No repository/worker edits, GUI, DB, process signals, network or campaign rerun.

**The retained historical result remains 24 pass / 2 limit.** Its actual resume event names PID 1086763, `continued:true`, state `R`, matching the paused PID; all 8 retained ink comparison rows contain equal nonempty local/server hashes. Pure replay of the committed sanitized metadata reproduces that result. The HOLD concerns two missing-evidence false positives when reusing the new analyzer; it does not invalidate the retained successful observations or reopen native product findings.

## P2 QA-HARNESS-01 — an empty recovery witness passes

`tests/e2e/windows/analyze_fix.py:348–350` checks `all(h.get("continued") for h in resumed[0]["hosts"])`, without requiring those hosts to be present or match the paused/session host.

Reproduction: copy the retained JSON, replace the sole `resumed` event's `hosts` with `[]`, and run the unchanged analyzer. `fault.only_this_runs_host_paused_and_resumed` still passes; total remains **24 pass / 2 limit**. The evidence now contains no claim that the paused process was continued.

Minimum required behavior: require a nonempty, complete recovery witness for the paused owned process identity before asserting that the same host was resumed. Missing/mismatched identity or missing continuation evidence must not pass. Preserve the actual clock/polling limitations.

## P2 QA-HARNESS-02 — omitted ink comparisons pass byte equality

`tests/e2e/windows/analyze_fix.py:392–405`, especially line 395, accepts an empty `ink_originals` collection through another vacuous `all(...)`, while its check claims raw, composed **and ink** byte equality.

Reproduction: replace every readback job's `ink_originals` with `[]`, retaining the coordination jobs and stored capture references that name the expected ink originals. The unchanged analyzer still passes `counts.final_counts_equal_the_server_once_each`; total remains **24 pass / 2 limit** despite removing all 8 ink comparison rows.

Minimum required behavior: bind the comparison rows to the ink originals actually expected from this run's retained/stored records and require complete, nonempty hash evidence for each expected item. An observation with no expected ink may be explicitly distinguished; this run has expected ink and cannot pass after its evidence is omitted. Merely requiring one row would still allow a missing subset.

## Bounded checks and other source findings

Pure Python replay, exact analyzer source:

```sh
python3 /tmp/lc-windows-qa-6a3611e/analyzer_probes.py
```

Five groups completed: unchanged baseline; the two false-positive mutations above; marking `app-main` killed correctly causes 3 failures; deleting `b_storing_now` correctly causes 2 failures. Inputs are reconstructed only from the committed sanitized metadata; this is not new actual-operation evidence. Probe/output: `/tmp/lc-windows-qa-6a3611e/{analyzer_probes.py,analyzer-results.json,analyzer-probes.log}`. Individual reconstructed directories/logs preserve each mutation.

Pure Node scenario compatibility:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/lc-windows-qa-6a3611e/scenario-check.mjs
```

All five existing scenario lists are structurally unchanged: full 300, ink 188, parent 248, parentquit 41, smoke 20 steps. New parentfix has 223 steps, 8 close requests, 7 relaunches and zero `endHungApp` steps. No steps were executed.

No additional concrete blocker established in the changed runner/watcher paths. Read source confirms:

- Close requests target the current owned control-window PID or its own page; the close step never kills. Timing and exit code are recorded. Cleanup kills/late closes remain distinguishable and excluded from self-exit acceptance; the killed-process negative control confirms this.
- Pause ownership is bounded to newly observed processes in the configured private Backend copy, excluding watcher-start incumbents. Resumption checks the tracked start ticks and current copy membership. It also runs after request removal, timeout, normal watcher shutdown and catchable termination. Actual signal/recovery behavior was not executed here; the documented SIGKILL limit remains.
- The run uses isolated app/profile/temp paths. Preflight checks the dedicated migrated test DB and fresh actor. Cleanup retains its existing equality check across requested actor, preflight, app record and seed, refuses while copy-owned processes remain, and deletes that actor only. No DB action was performed.
- A cut-short runner keeps its work directory and identifies owned app PID/start facts rather than silently treating cleanup as success.

Small next action: the same QA owner corrects the two analyzer checks and runs these JSON controls plus the unchanged metadata replay. No GUI/DB rerun is required to repair these harness defects. Prior Mac/native reports remain unchanged.
