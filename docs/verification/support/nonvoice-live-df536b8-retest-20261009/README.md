# Candidate 05 changed-boundary retest — HOLD for one lifecycle evidence gap

2026-10-09, 07 Support. Assignment: `handoff_aadbc5026bd6f0ad59ea27d32cb6ea18`.

**The five findings from `c2ee58a` are corrected within this review's scope.**
Keep lifecycle evidence acceptance on HOLD: a trace containing an earlier EOF,
subsequent decisions and a second EOF still passes all mechanical terms. The
actual checker exits immediately after its first EOF, so that trace cannot be
treated as one observed clean lifecycle. This is a reproducible QA evidence
validation gap, not evidence of a native/product failure.

| Object | Identity |
| --- | --- |
| QA correction | `df536b84eada2782b30ccca9c6781d12ea48e050` |
| QA parent | `a58d583` |
| Lead coverage decision | `5517a7a`, `docs/verification/lead/live-windows/nonvoice-driver-review/README.md:640` |
| Product / interlock pin | `0ff325beadb7c689244610307b6aa16d638fd2e6` |
| Support start | `c2ee58ae7f48d65decfecd94f13c979678d6bd3a`, clean `team/support` |
| Ledger SHA256 | `057f788b157bf84c6b8912cd5c46ea6a4e5ebe5ecc3a48ff16884ea8fbbacf90` |
| Wrapper SHA256 | `58a0a9923f55631fcdd36426f567ed81469ded230146af04c933f412fc4e79f4` |
| Candidate JSON SHA256 | `5e7fdcd513c355d0f63a4c36e778d0fdc457e550ca781da29c6f8b7901d2aebb` |

Read the complete exact `driver-nonvoice-05/README.md`, affected deltas, Lead's
complete new coverage decision, role and workflow. The AGENTS/TEAM, role,
workflow and requirements revision check from `937788d` to `df536b8` is empty.
Current intent and actual Ponytail core were refreshed; project LITE and ultra
are unchanged. No merge, production edit or other owner's worktree edit.

## Closed findings and directly changed paths

Source references below are at `df536b8` under `tests/e2e/windows` unless stated.

| Boundary | Evidence and limit |
| --- | --- |
| F3-A | `qa_overlay_predicate.ps1:125,145` rejects failed/zero owner reads. `223–225` compares handle/owner/class with the binding. Source closure; no native adapter execution. |
| F3-B | Emitted candidate-05 `runner.ps1:1549` applies the bound predicate even when NAV reports Edge. `1279` rechecks the overlay after final Edge re-resolution. Source closure. |
| F3 composition | The complete predicate source occurs byte-for-byte exactly once in both generated runner and checker. Checker end-of-decision revalidation remains at emitted `admission-checker.ps1:1016–1018`. |
| F3-C | Ledger `178–179,209–217` requires the arm capture throughout decisions and reconciles the actual capture folder. The exact collector body at wrapper `460–466` is exercised with memory files; foreign/sole wrong folders and a foreign post-acquire capture fail mechanics. |
| F3-D | The earlier contradictory main allow/denied/reason witness fails. Verdict checks and complete decision-array comparison at ledger `212–217` use fields actually written by product `0ff325b:apps/windows/src/main/main.ts:764`. |
| Complete decision trace | Main sends-only, missing acquisition, duplicate acquisition and reordered phases fail. Ordered array comparison preserves multiplicity and both directions. No production protocol field was invented. |
| R3-A | Missing fourth ask session now gives an unknown fence and failed mechanics. The positive same-session/unknown-provider-submission case still passes with its required source-send evidence. |
| Observed checker termination | Missing/duplicate main end, unseen exit, nonzero exit, signal, killed child, missing QA EOF and wrong EOF count all fail. The earlier-EOF gap below remains. |

## Remaining P2: an earlier terminal EOF is ignored

`qa_live_ledger.mjs:221–223` checks only the last QA event and its request count:
the one clean main end plus a final EOF with the expected count produces
`checker_released:true`. No condition rejects an earlier EOF.

Starting from the valid positive control, insert only this event after ready and
arm, leaving later decisions, final EOF and main records unchanged:

```js
checkerLines.splice(2, 0, { event: 'eof', requests: 1 });
```

The independently executed exact collector, ledger and mechanical judge return:

```json
{"mechanical_pass":true,"source_bound":true,"main_agrees":true,"checker_released":true}
```

This is not ambiguous main-process bookkeeping. The actual checker at
`qa_admission_checker.ps1:193` writes EOF and immediately `exit 0`; it cannot then
write more decisions or another EOF. Lead's complete-trace decision requires
duplicated/contradictory evidence to remain incomplete or unknown.

**Narrow next action, QA owner:** require exactly one EOF at the end while
retaining the count check. Retest the ordinary terminal-EOF control and this
single counterexample. There is no reason to replay the corrected campaigns.
This report does not add a main `checker_end` position constraint: main records
its close asynchronously, and this retest did not establish a scheduling defect.

## Independent execution and limits

`tests/probes/support/nonvoice_live_df536b8_retest.mjs` uses the prior independent
Support fixture with only the newly required capture grouping and EOF evidence.
It calls the exact exported pure functions and the unchanged non-exported
collector body, extracted by fixed function boundaries into a VM. Collector file
I/O and receipt input are synthetic memory objects; no real capture folder,
receipt, process, private state or scratch is read. The collector excerpt's hash
is recorded in `source-identity.json`.

Final execution: **25 scenarios, exit 0, empty stderr**:

- 20 trace/collection/Stop scenarios: 2 positive controls, 4 corrected previous
  negatives, 13 directly changed-path negative checks and 1 remaining
  counterexample.
- 5 pure allocation-validator scenarios: an in-memory active-shaped control,
  and rejection of the saved inactive template, mismatched product, mismatched
  allocation source and expired allocation.

The active-shaped object exists only inside the probe and is not an allocation,
approval or lease. `runLiveCandidate` is never called. Candidate-05's legitimate
`0ff325b` source pin is no longer null; naming it does not permit execution.

The first invocation exited 1 at its positive gate fixture: it inherited the
template's old `connector.commit = 52be105`, while exported `CONNECTOR.commit`
is `0ff325b`. That refusal was correct. The probe then used the actual exported
connector object for this synthetic positive control and ran once successfully.
`first-gate-fixture.*` retains the failure and original probe hash; the first run
is not counted as a successful result. Production/QA source stayed unchanged.
For Lead's separate allocation review, the saved template's connector pin also
needs reconciliation when preparing any future real allocation. It remains
inactive, and no allocation was prepared here.

Node v24.21.0 ran with `--permission`, read grants only for the probe and exact
Git-object export, and no child-process or file-write grants. Shell redirection
saved the synthetic stdout/stderr. `source-identity.json` contains the exact
command, probe/source hashes and all 83 exported paths under
`/tmp/support-live-df536b8-e51m6rig`; recreate an export with `git show df536b8:<path>`.
`retest.json` records every observed case. A counterexample assertion succeeding
is not a product acceptance result.

No PowerShell, native APIs, app, fixture, display, account, model, microphone,
audio, process inspection, stage check or copy check ran. The prior OS-policy
fixture refusal remains **NOT_RUN**. Parse/compile-only validation and full
candidate/command/pin review remain Lead-owned; the author's 34/34 and stage/copy
results are not inherited as Support execution. No R1/R2/R4/R5 or mutation
campaign was repeated. Real actions remain **0/4**, old diagnostic **3/3 closed**,
with no lease or release claim.
