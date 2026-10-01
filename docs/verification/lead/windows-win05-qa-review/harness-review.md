# QA-WIN-05 harness review — 26ac626

**APPROVE the bounded harness/evidence delivery** `26ac6269ad728266aade944005431008ad1d1675`, for actual product source `476fd1fb832e708b79ad5e5be1c7ef17925febee`. No concrete blocker found in the reviewed changed path. This is independent source and saved-evidence replay review, not a new GUI/DB test. Root accepts the already approved confirmation-rule header plus the dynamic waiting line for the bounded R52/A12 requirement; full-product acceptance remains separate.

Applied project PONYTAIL LITE: inspected the new analyzer and scenario, reused actual sanitized evidence, and ran four selected negative controls without a mutation framework or further campaign. No repository/worker files were edited.

## What the new checks establish

The 76-step `parentwin05` scenario hooks real link notifications before Start, records current status/header/line, snapshots the coordinator, pauses and resumes the same run-owned host twice, and performs Stop while the second send is awaiting. It changes only QA's page panel and clicks Start/Stop through DOM. It has no pen injection, force-kill step or request to another actor. The existing watcher, child-process ownership, database helper and actual process runner are unchanged; `run.mjs` changes only usage text.

The analyzer links the first pending job to its retained manifest frame and the emitted awaiting transition, requires confirmed counts unchanged and the current read within the paused interval, checks the later read before the 60-second request timeout, and ties the acknowledged job to the server replay receipt after the host resumes (`analyze_win05.py:260`–`317`). Stop requires the actual pending read, the immediately latched awaiting state, the later give-up event with unknown outcome, no return to live/storing states, the final coordinator witness, and the server's corresponding final records (`:318`–`403`). Host controls require exactly one matching PID in each paused/resumed event; missing evidence does not produce a full pass. Dependent behavior not exercised is explicitly limited.

The restored run 2 evidence reproduces the 0.10-second frame-to-awaiting observation, unchanged confirmed count of 2, later count of 3 after the real answer, and final Stop state of 3 confirmed / 1 unknown. These remain measurements from one saved native run, not a general latency guarantee. The saved raw/composed/ink hash evidence and server receipts support the recorded readback claim; this reviewer did not decode private captures or query the database.

The corrected upload-arrival explanation is truthful: the original in doubt shares the content address of an earlier stored image, so absence of an extra unreferenced artifact cannot prove that the given-up upload never arrived. The analyzer now leaves that arrival unknown while separately proving no record/replay receipt for that unconfirmed job.

## Focused executed verification

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /tmp/lc-windows-win05-26ac626/focused_replay.py \
  > /tmp/lc-windows-win05-26ac626/focused-replay.log
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  /tmp/lc-windows-win05-26ac626/scenario-check.mjs \
  > /tmp/lc-windows-win05-26ac626/scenario-results.json
```

Both commands exited 0. Six replay groups matched their expected outcomes:

| Saved evidence / single control | Result |
| --- | --- |
| Run 2 baseline, exact committed sanitized evidence | 16 pass; all statuses reproduced |
| Run 1 baseline, retained `/tmp/qa-win05-ev1` sanitized evidence | 13 pass / 1 fail / 2 limit; all statuses match its committed supporting receipt |
| Remove emitted awaiting events | Prompt pending claim fails |
| Remove the acknowledged pending job's server replay receipt | Real-answer/confirmed-count claim fails |
| Remove the pending read before Stop | Stop is limited as unexercised; complete-copy evidence also fails |
| Remove the Stop give-up event | Pending-Stop outcome/timing claim fails |

Run 1's failed optional pending wait stays failed, and its unexercised Stop/server checks stay limited. No missing evidence was invented to complete that run. The four controls modify scratch copies only; source evidence hashes before/after are identical.

The six previous generated scenarios are structurally identical: full 300, ink 188, parent 248, parentquit 41, parentfix 223 and smoke 20 steps. The new scenario has 76 steps, two pauses/two resumes, zero stroke and zero force-kill steps. Frozen 86d2405 evidence has the same Git tree `e0ab4d01ccae8cd9de354bfae5b8da56e5e930d2`; the historical analyzer/replay and execution helpers have no leaf delta. No old 121-case replay was run.

## Provenance and limits

All run-2 listed harness hashes match the exact delivery except the disclosed analyzer change:

- Recorded executed analyzer: `de85964e22a585e5c38331d01d2b5afc3422709c5ffe7a5ac4adc575be415063`.
- Delivered/replayed analyzer: `f7e66ef176c169b28707696efb2bef894f98b65d263dd4ce3470fd664c6a7e59`.

The retained before/after run-2 summaries differ only in the server upload-arrival note and its additional explanatory observed field; every status is unchanged. The exact old executed analyzer source was not observed, so the report's statement that no predicate changed remains **QA-attributed**, not a source-byte comparison claimed by this reviewer. The fresh replay of all actual saved inputs by the delivered analyzer is independently established. Run 1 is a later reading of its retained output, as its report explicitly states.

The neutral live header remains the same before/while awaiting; the line explicitly says waiting and the count remains unknown. This review verifies that exact text and state evidence. Root has resolved that the approved confirmation-rule header plus the dynamic waiting line meets the bounded truthfulness requirement; they need not duplicate the word waiting. No conclusion about stalled-timeout, refused-send, failed-journal, physical pen, provider, macOS, audio, Notability or either full §7.1 gate follows.

Artifacts: `/tmp/lc-windows-win05-26ac626/focused_replay.py`, `focused-results.json`, `focused-replay.log`, all six scratch replay outputs, `scenario-check.mjs`, `scenario-results.json`, and `provenance.json`. The report and machine receipt are `/tmp/windows-win05-26ac-harness-review.md` and `.json`. No GUI, DB, signals, network, original-byte rewrite or native test execution was performed.

## Root single integrated run-2 replay

After integration, the existing reconstructed run-2 directory contains only the exact sanitized saved inputs. Execute the integrated analyzer once (no mutation controls or old replay):

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tests/e2e/windows/analyze_win05.py \
  /tmp/lc-windows-win05-26ac626/focused/run2 /tmp/windows-win05-integrated-run2 \
  > /tmp/windows-win05-integrated-run2.log
.venv/bin/python -c 'import json; p="/tmp/windows-win05-integrated-run2/summary.json"; s=json.load(open(p)); assert s["counts"] == {"pass":16}; print(s["counts"])'
```

Use a new output directory if the named integrated receipt already exists. Input reconstruction is readable in `focused_replay.py:16` (`rebuild`); no hidden fixture generator or invented result is involved.
