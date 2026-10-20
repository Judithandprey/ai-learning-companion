# Nonvoice wrapper time-sufficiency correction — 2026-10-20

**What ran.** Source and offline checks only, under Node `--permission` with read grants and no child-process or write
grant. No PowerShell, runner, checker, app, Edge or other Windows process ran. No display, account, model, microphone
or audio call was made, and no lease was taken. The real-action ledger stays at **0 of 4** (last confirmed). The
AI-disabled diagnostic stays closed at 3 of 3.

This is the same P0-13 correction. The Lead assigned it in `handoff_f4a4b4aa`; QA resumed once after a Windows Update
restart, under `handoff_bc87bc62` (`human-resume-after-restart-20261020:4bc3bf4f…`). Product `0ff325b`, candidate 06
and its six payloads are unchanged. All earlier candidates, refusal records and retired allocations are unchanged too.

## The defect

QA found it while stopping the 2026-10-14 manual phase (`handoff_22c51753`). The wrapper consumed candidate 06's
single-use scratch (`mkdirSync(candidate.work)`) **before** it checked that the allocation still held the 600 s native
bound. A start too late to launch could therefore burn the scratch with no native run.

## The change: `tests/e2e/windows/qa_run_live_candidate.mjs`

- **New export `PRELAUNCH_MARGIN_MS = 60000`.** This is an explicit, modest margin for the preparation before the
  launch: the stage and connector checks, the read-only looks, the watch, the payload copy and the parse. It is not a
  lease and never extends one.
- **New check `enoughTimeToPrepare()`.** It refuses when `now + PRELAUNCH_MARGIN_MS + native_bound_ms > the
  allocation's end`. The message is "allocation has too little time for the bounded native attempt and its pre-launch
  margin; nothing launched, scratch unused; no retry". It runs at four points:
  1. on entry, right after the allocation is validated, before the Linux stage check;
  2. after the two read-only looks, before a preflight-conflict record can be written. QA's internal review found this
     gap after the first edit batch;
  3. before the output folder and the watch, in place of `stillActive()`;
  4. before the scratch is consumed, in place of `stillActive()`, inside the existing `try`, whose `catch` stops the
     watch.
- **Unchanged:**
  - the final check right before the launch: `now + native_bound_ms > end` refuses with "allocation has too little
    time for the bounded native attempt";
  - `validateLiveAllocation`, its 600 s bound and its expiry rule;
  - every other `stillActive()`;
  - all capture, port, window, foreground, 16-point, source-admission and exact-owned cleanup protections.
- **A test-only seam: `injected.connectorAdmission`.** It is used only by the offline test so the run can reach the time
  checks. The command line never passes it. The real path, including the codex sha256 check, is unchanged. The other
  connector test still runs the real `connectorAdmission`.

### Boundaries

| Check | Passes when | Equality |
| --- | --- | --- |
| Allocation validity | `valid_from <= now < valid_until` | `now = valid_until` is expired |
| The four preparation checks | `now + 60000 + 600000 <= end` | exactly enough passes; 1 ms less refuses |
| Final, before launch (unchanged) | `now + 600000 <= end` | exactly enough passes; 1 ms less refuses |

## Focused tests: `tests/e2e/windows/test_qa_live_candidate.mjs`

`timedRun(clock)` drives the real `runLiveCandidate` end to end on an injected clock. Every process, Windows call and
folder is mocked; the existing allocation, candidate and stage-identity fixtures are reused. Each test records which
effects (`mkdir`, `write`, `spawn`, `native`) happen before each refusal:

1. **Late entry, or an expired allocation.** Entry 1 ms too late refuses with **no recorded call at all**: no stage
   check, no look, no folder, no watch, no scratch, no native. An expired allocation also refuses with no call.
2. **Exactly enough, constant clock.** Every check passes at equality. The effects begin output folder → watch →
   scratch, and the run launches once.
3. **Time lost in the prechecks.** The run refuses right after the last precheck, before the watch and the output
   folder. There are no effects.
4. **Time lost during the looks, with a conflict present.** The run refuses before any preflight record, with no
   effects. Control: with enough time, the conflict alone is recorded as before (output folder and
   `preflight-refusal.json`).
5. **Time lost while the watch starts.** The only effects are, exactly, the output folder, the watch, and the watch's
   stop file. The watch is stopped, the scratch is unused and nothing launches.
6. **Time lost after the scratch.** The unchanged final check refuses at `end − bound + 1 ms`, in its own wording, with
   `native_attempts` 0. At equality it launches once.

## Results

- [passes-after.txt](passes-after.txt): **41 of 41**, with the 6 time tests.
- [failures-fix-reverted.txt](failures-fix-reverted.txt): the same tests on a `/tmp` copy with the fix reverted. The
  four call sites are put back as at `8aadd90` (entry and pre-preflight removed; the two others back to
  `stillActive()`), and only the test seam is kept. Result: **37 of 41**. The 4 failures are exactly tests 1, 3, 4
  and 5 (the new boundaries); tests 2 and 6 (unchanged behaviour) pass. The `8aadd90` wrapper itself cannot be driven
  past its real connector check by these tests (it has no seam), so the revert is the meaningful "before".
- [template-check.json](template-check.json), from the wrapper's own `validateLiveAllocation`, run purely and in memory:
  - [allocation.template.json](allocation.template.json), as saved: refused;
  - the same template with only the seven Lead-owned fields filled in memory: accepted;
  - driver-06's template filled the same way: refused, because its wrapper hash is the old one.

  The template stays inactive. Nothing was allocated, and `runLiveCandidate` was not called.

The historical 36 of 36 from 2026-10-14 belonged to the first edit batch only and is not this result. The follow-up card
of 2026-10-14 did not take effect (session ended); its edits were re-applied here, once.

## Pins

| | |
| --- | --- |
| Wrapper `qa_run_live_candidate.mjs` | `ed58fe5d9fe3f1a4cd786303ab105a1f58bf42162c6f6d1ac145aaaf936c775b` (was `3ca43f76…`) |
| Allocation template (inactive) | `dc017d0f8bcd94aa5a17e5b3ab60374d4d713777008080515194fe2dd35f6d7f`; differs from driver-06's only in `wrapper_sha256` |
| Test file | `4695a0b64fb73fa88e59d42f73463ac1b1f9dd3b9bbcf10bb78bfa6520ab880d` |
| Candidate 06 `candidate.json` | `288191f78a39ea242a59b867d0831808a3e22c762eff013c65669eed9d05c172`: unchanged (it does not pin the wrapper) |
| Six payloads, scratch | unchanged; scratch `lc-qa-live-nonvoice-e72ea0f9…` never created |

## Limitations and residuals

- **Margin.** The 60 s margin is an engineering default. The real preparation time has not been measured: no wrapper of
  this kind has reached its launch. The later checks still hold if preparation takes longer. Too much elapsed time
  refuses with the scratch unused; it does not launch late.
- **Time refusal before the scratch.** It leaves no durable refusal record of its own: the output folder keeps only the
  watch log and the stop file, and the reason is in the thrown message. This was optional and is unchanged.
- **Claude Bash limits.** From the tool metadata, the foreground timeout defaults to 120000 ms with a maximum of 600000
  ms; `run_in_background` detaches. The runtime rules forbid detaching required work and say a background Bash does not
  guarantee a completion wake-up. The metadata does not say what happens to a command's processes when the timeout is
  reached. The wrapper's wall time is preparation + native (at most 600 s) + cleanup, so in the worst case it can
  exceed the 600 s foreground cap. This residual does not authorize a longer native bound or any indirect workaround.
- **Still natively unverified** (unchanged):
  - the overlay predicate;
  - cross-process affinity reads;
  - the checker's stdin and echo;
  - decision latency;
  - the 16-entry holding ceiling;
  - the OS race.

Next steps:
1. Support reviews this exact delta.
2. The Lead integrates it and issues a fresh allocation, with enough time, for the one nonvoice native attempt.
