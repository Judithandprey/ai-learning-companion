# Nonvoice driver correction 06: one terminal EOF, and the template's connector commit — 2026-10-09

**What ran.** Source and offline checks only, under Node `--permission` with read grants and no child-process or write
grant. No PowerShell, runner, checker, fixture or other Windows process ran. No display, account, model, microphone or
audio call was made, and no lease was taken. The real-action ledger stays at **0 of 4**; the AI-disabled diagnostic
stays closed at 3 of 3.

This is the same P0-13 task, under Lead `handoff_830791fa`. It follows Support's retest `b93fc60` of `df536b8`, which
closes all five `c2ee58a` findings and leaves two narrow items:
- the ledger accepted an earlier EOF, more decisions, then a final EOF;
- the inactive allocation template still named `connector.commit` `52be105`.

Candidates 01–05 and their evidence are unchanged. That includes candidate 05's
[template](../driver-nonvoice-05/allocation.template.json), which keeps its stale connector commit as history. The pure
fixture check stays **NOT_RUN** (OS refusal `a58d583`).

## 1. Exactly one EOF, at the end

The checker writes its end of input and exits at once (`qa_admission_checker.ps1`: `eof`, then `exit 0`). A log with an
earlier or second EOF therefore cannot be one observed lifecycle.

[`qa_live_ledger.mjs`](../../../../../tests/e2e/windows/qa_live_ledger.mjs) `sourceAdmission` now sets
`checker_released` only if all of these hold:
- QA's log holds **exactly one** `eof` event;
- that event is the log's **last** line;
- its `requests` equals the number of decisions, as before.

Main's `checker_end` conditions are unchanged. No ordering between main's `checker_end` and its decisions is assumed:
main records the close asynchronously.

The new test uses Support's fixture with main's record of the unchanged decisions. It checks the ledger term, the
mechanical term `checker_lifecycle_released` and the overall mechanical pass:

| QA log | Before (`565bc3d`) | After |
| --- | --- | --- |
| Ordinary terminal EOF | released, passes | released, passes |
| Support's counterexample: an EOF inserted after ready and arm | released, passes | **not released, fails** |
| A second EOF at the end, same count | released, passes (by inspection; the run stops at the first failed assertion) | **not released, fails** |

No corrected campaign was replayed.

## 2. The template's connector commit

The exported `CONNECTOR.commit` is `0ff325beadb7c689244610307b6aa16d638fd2e6`. Only the byte-equivalent copy folder's
**label** stays `subscription-source-52be105a148a`. [allocation.template.json](allocation.template.json) differs from
candidate 05's template in exactly three values:
- `connector.commit`: `0ff325b`;
- `wrapper_sha256`;
- `candidate_sha256`.

It stays inactive and unreviewed.

[template-check.mjs](template-check.mjs) runs the wrapper's own `validateLiveAllocation`, purely and in memory. Its result
is in [template-check.json](template-check.json):

| Object | Result |
| --- | --- |
| The saved template | refused: "separate exact Lead-reviewed live allocation required" |
| The template with only the seven Lead-owned fields filled in memory (state, review flag, allocation id, the two approval refs, validity window) | **accepted** |
| Candidate 05's template, filled the same way and given the 06 hashes | refused: the connector commit alone |

So every non-Lead field now matches exactly. The filled object is not an allocation, approval or lease, and
`runLiveCandidate` was not called.

## The minimal next candidate: candidate-nonvoice-06

The ledger is a pinned candidate source, so a new `candidate.json` was needed:
- It differs from candidate 05's **only** in `source_files.qa_live_ledger.mjs`.
- It reuses candidate 05's still-unused scratch name. All six payloads are therefore **byte-identical** to candidate 05's:
  runner, steps, surface, connector configuration, checker and checker configuration.
- The wrapper now pins candidate 06 and accepts only it. The payload pins, the interlock gate (`0ff325b`) and every
  source-admission safeguard are unchanged.

The runner (`2fbb5eb3…`) and checker (`9637db61…`) are the exact bytes that `565bc3d` parsed and compiled. That evidence
applies to them unchanged, and it was not repeated.

[candidate-check.json](candidate-check.json): candidate 06 reproduces from the current sources against the saved stage
receipt, and its scratch is unused. The stage and the connector copy were not re-read. The wrapper rechecks both at run
time.

## Results

- [passes-after.txt](passes-after.txt): **35 of 35**.
- [failures-before-565bc3d.txt](failures-before-565bc3d.txt): the corrected tests against `git archive 565bc3d`, with
  the candidate-06 folder. **34 of 35 pass**; the one failure is the new EOF test, at Support's counterexample.

## Pins

| | |
| --- | --- |
| `candidate.json` (06) | `288191f78a39ea242a59b867d0831808a3e22c762eff013c65669eed9d05c172` (05: `5e7fdcd5…`) |
| Wrapper | `3ca43f76a73abc7669f64452bf6ab3dee39caeccbb736a2f9642fdd3e65b2b25` (05: `58a0a992…`) |
| Ledger | `846cd70c72660f2c72a8585a14b48c6bd4cbd1f4c5f7a98e4bd065fd00b57170` (05: `057f788b…`) |
| Allocation template (inactive) | `ec122ff0580e96e920066323bdbdb626b0720f7b6a7dcbe7fc76fc26b66b1719` |
| Runner, steps, checker, checker configuration | `2fbb5eb3…`, `70e89d51…` (63), `9637db61…`, `6e86df7d…`: unchanged |
| Surface, connector configuration | `be82967a…`, `4729ca1a…`: unchanged |
| Scratch | `%TEMP%\lc-qa-live-nonvoice-e72ea0f932d148c0a48d4c101c69d328`, absent (shared with 05, which the wrapper no longer accepts) |
| Worst case / bound | 589 s / 600 s |

[artifacts.json](artifacts.json) lists every hash.

## Remaining dependencies

These are unchanged from [correction 05](../driver-nonvoice-05/README.md#remaining-command-and-native-dependencies),
less the parse/compile check, which `565bc3d` covers for these bytes:
1. Lead review of these two changes. Then Lead review of the exact command and the process-only `RemoteSigned` script
   permission, for the runner and for the checker the product starts.
2. A fresh exclusive display and account allocation following this template.
3. The user's managed sign-in present, and no other lock holder.
4. The wrapper's run-time rechecks, all unchanged:
   - the stage, read-only (`qa_admission_stage_check.py`);
   - the private copy against 0ff325b;
   - the codex digest;
   - the preflight;
   - the scratch unused;
   - the connector watch running at the launch.
5. Natively, still unverified:
   - the overlay predicate;
   - cross-process affinity reads;
   - the checker's stdin handling and echo;
   - decision latency;
   - the 16-entry holding ceiling (C3-B);
   - the OS race.
