# Candidate 03: bounded F4/F6 ledger review

2026-10-09. QA commit `9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b`, correction baseline `e0bd4b3`; Lead `4f7d9fa8f79c05d31cbd8e04b5b1e6707477c085`; unchanged product `52be105a148a28e677f83cc4b7077665f2ff372c`.

Scope: changed ledger/receipt reconciliation, uncertain and conflicting phases, malformed/mixed records, and their mechanical verdict. The full candidate-03 README was read. Requirements/role/workflow files relevant to this review had no diff between the previously read `df8859c` baseline and the supplied Lead baseline; current decisions were refreshed. Parent owns the wrapper/reader/watch review, and another reviewer owns checker protocol. No broad product review or previous campaign replay was performed.

**Recommendation: keep F4/F6 on HOLD for the three residual issues below.** These are offline evidence-classifier defects, not observations of native or provider failures. Candidate 03's `interlockProduction === null` remains intact; the probe asserted it without calling execution or allocation paths.

## Executed witness

Script: `tests/probes/support/nonvoice_live_9614947_ledger_witness.mjs`.

Exact command, run from `/home/agentsdock/Projects/learning-companion/wt-support`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --permission --allow-fs-read=/tmp/support-live-9614947-vdt2ebrh --allow-fs-read=/home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/nonvoice_live_9614947_ledger_witness.mjs tests/probes/support/nonvoice_live_9614947_ledger_witness.mjs /tmp/support-live-9614947-vdt2ebrh
```

Exit **0**; one execution; **two positive controls and six new negative inputs**. Both controls passed. Five negative inputs incorrectly received `passed:true`; the sixth was correctly blocked by a separate mechanical term. Nine stdout lines (eight cases plus a count/interlock summary) are preserved verbatim in `ledger-witness.stdout.jsonl`. This is not a claim that eight acceptance tests passed. QA's author-suite 30/30 and mutant counts were neither rerun nor inherited.

Before execution, the imported `qa_live_ledger.mjs`, `qa_run_live_candidate.mjs` and `qa_live_candidate.mjs` files were byte-compared with the exact QA commit and matched. The script imports the actual exported functions; it neither extracts nor rewrites their implementation. It constructs synthetic app records, receipts and checker decisions in memory. It calls the actual `buildLedger`, `fenceVerdict`, `sourceAdmission` and `judgeMechanics`. Checker decisions and successful launcher/step/cleanup facts are fixtures; they do not establish actual source admission, cleanup or native acceptance. Node had read permission only for the source export and this probe, with no child-process or filesystem-write permission.

No native/display/capture/input/account/provider/microphone/audio/TTS calls, product/copy mutations, existing suite executions or `execution-*` reads occurred. The only new files are this focused probe and its review evidence. This sub-review made no commit; its evidence is included in the consolidated Support delivery.

## Findings

### L1 — P1: an extra request with an unclassified trigger disappears from the action budget

Cause: `9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b:tests/e2e/windows/qa_live_ledger.mjs:84`–89 partitions requests solely into `focus` and `text_followup`; an object with another or absent trigger enters neither slots nor extras. The new completeness check at lines 120–122 only requires an object and string request ID. It therefore classifies the incomplete request as complete evidence.

Smallest witness: append `{request_id:'extra-without-trigger', submission:'unknown', outcome:{status:'uncertain'}}` to otherwise valid asks. Actual result: `records_complete:true`, `attempts:4`, `extras:[]`, `source_bound:true`, `passed:true`. This fifth observable request must remain counted/unknown or make evidence incomplete; it must not vanish. The positive control without that extra record passes.

QA next action: validate each request's discriminator and retain every unclassifiable request as an incomplete extra action; prevent a green count or binding verdict when a request cannot be assigned. This uses existing evidence only and has no external dependency. No claim is made that the unchanged product normally emits such a malformed record; the candidate's new malformed-record boundary is what fails.

### L2 — P1: provider counts satisfy global bounds without accounting for the actions that could have been sent

Cause: `9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b:tests/e2e/windows/qa_live_ledger.mjs:113`–119 correctly computes each launch's maximum and adds launches, but compares the total to all assigned actions and only the global number of sent receipts. A proven-unsent action can hide an unexplained provider turn, and one launch can compensate for another launch's impossible count. These booleans drive `ceiling_ok`/`turns_consistent` at lines 129–130 and the mechanical terms at `tests/e2e/windows/qa_run_live_candidate.mjs:285`.

Witness A: preserve exactly three sent actions and a Stop attempt whose ask, settled record and receipt all say not_submitted; change the final cumulative counts to four. Actual result: `provider_turns:4`, `sent_receipts:3`, `attempts:4`, `fenced_before_submission`, `passed:true`. The fourth provider turn cannot be attributed to the fourth action proven unsent. It is an unexplained extra, so the complete four-action ledger cannot be green.

Witness B: launch A contains three acknowledged receipts but maximum count two; launch B's only receipt is the unsent fourth action with count one. Actual result: summed provider count three, three sent receipts, two launches, `passed:true`. Launch A's local contradiction is concealed by launch B. The positive controls demonstrate that valid cumulative counts `1,2,3,3` are counted as three, and two valid launch maxima `1+2` are counted as three; no sum-within-launch behavior is requested.

Product definition checked after execution: `52be105a148a28e677f83cc4b7077665f2ff372c:services/worker/connectors/chatgpt_rpc.py:303` calls `stdin.write(encoded)` and lines 306–307 then increment `turn_start_count`, before drain at line 308. `_record` at line 262 copies the current cumulative count; `begin_request` at lines 237–243 starts a not_submitted receipt with the existing count. Cancellation/write failures during sending retain uncertain at lines 313–323; not_submitted denotes the before-send branch. Thus the counter concerns published turn/start attempts, not proven provider processing or billing. An uncertain published attempt must stay counted, but Witness A's fourth action is consistently proven unsent and cannot explain the extra attempt. If records are contradictory instead, they still cannot justify a reconciled verdict.

QA next action: reconcile each launch against its sent receipts and reconcile provider turns against actions that are submitted or genuinely unknown, preserving the separate conservative assigned-action budget. Unexplained turns must remain extras/incomplete evidence rather than occupying a proven-unsent slot. No external dependency is needed. This is not evidence of an actual fifth request or provider overrun.

### L3 — P2: phase proof ignores additional conflicting settlements and missing evidence

Cause: `9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b:tests/e2e/windows/qa_live_ledger.mjs:197` selects only the first matching settled line, and lines 198–200 discard missing phases before deciding agreement. The absent-receipt branch at `tests/e2e/windows/qa_run_live_candidate.mjs:288`–290 trusts the resulting phase even though its stated condition is that every record says not submitted.

Witness A: append a second settled line for the same fourth request, changing only its submission to submitted while the earlier line remains not_submitted. Actual result: the later contradiction is absent from `phases_seen`; `fenced_before_submission` and `passed:true` remain.

Witness B: remove the fourth receipt and remove the settled line's submission field. Actual result: `phases_seen:["not_submitted"]` from the ask alone, `fenced_before_submission`, `passed:true`. Missing evidence is treated as unanimous proof. The positive control contains all three agreeing phases.

QA next action: reconcile every matching settlement and require the phase facts needed for the claimed before/in-flight verdict. Preserve missing/conflicting evidence as unknown; an honestly absent receipt for a proven-unsent request remains permitted when the required app evidence is complete. This is a classification issue, not a demonstrated late-answer presentation failure. No external dependency is needed.

## Additional coupling checked and bounded

Parent requested one cross-check of `sourceAdmission`'s app-submission shortcut. Changing the first focus ask to not_submitted while retaining its acknowledged receipt and removing its checker send decision produces `source_bound:true`, because `qa_live_ledger.mjs:168` trusts the ask field. However the complete report returns `passed:false` with `failed_terms:["ceiling_ok"]`: the app's used count detects this particular contradiction. This witness therefore does **not** demonstrate a full mechanical-pass bypass and is not counted as a fourth defect. No compound mutations were added to defeat the independent check.

Uncertain receipt wording and the newly added all-slot receipt facts are present in the reviewed source. Their previous single-record cases were not replayed here. Native checks, actual live requests, execution allocation and final acceptance remain with Lead and the original owners; this review authorizes none of them.
