# R4 control geometry independent review — 2026-10-09 UTC

**APPROVE the bounded candidate implementation at `30c12c6aa7c51f167974471e7701ea27a0ab8b8b`.** Support ran **50 generator + 54 wrapper checks**, all passing with zero failures, skips or stderr. No code must-fix was found. **D1 below requires an evidence wording correction** in QA's report; it does not require changing candidate bytes or repeating native execution. This review does not allocate a display or authorize an attempt.

## Scope and evidence

Assignment `handoff_64ce00761ccd35cd3d93349558ef8393`, QA parent `b80c023983408dea31aef28e8f4ff264d09f5717`, Lead baseline `dcf27e5f97a28c9530aef6386bb65ac0de97a9be`. Support started on clean `team/support` at `55582e0`; only this Support evidence directory changes. Applicable AGENTS/TEAM/role/workflow and requirements have no revision between previously read `ffbc06c` and the supplied Lead baseline. Existing §7.1/7.2 and Windows P0-07/P0-13 acceptance remain separate from this AI-disabled harness.

Read in full at exact QA SHA: `r4-step9-geometry-20261009/README.md`, its exact arithmetic/parse script and output, the changed generator/wrapper/tests, emitted placement and admission paths, and steps 9–13. The reported attempt-2 result is attributed to Lead/QA: steps 1–8 passed, step 9 refused, the product closed in `finally`, cleanup completed and the display was released. Support did not reread `execution-*` files or observe that run live.

The exact-source Linux export contains 69 files, all compared with Git bytes. [checks.json](checks.json) records exact argv, environment, cwd, times, exit statuses and artifact/output hashes. The Node read grants cover only that export and the previously clarified task scratch prefix for `existsSync`; no Node writes or child-process permission is granted. Wrapper process/window/cleanup scenarios use injected functions, and its actual child-process-denial assertion passes. No tool review refused these commands.

## Change and guard preservation

The [normalized runner diff](runner-delta.diff) proves the only new emitted change, aside from the isolated work folder: old line 1026 becomes a `control_box` record at 1026 and the adjusted check at 1027. Each axis rejects `abs(clientPhysicalSize - viewportCSSSize * dpr) >= dpr`. With exact DPR 2 and integer physical sizes, discrepancies of 0 or 1 physical pixel pass; 2 or more fail, in either direction. This is strictly less than one CSS pixel, not a two-pixel allowance.

The preceding `shown`/DPR-2 guard remains exact. DPI 192, strict centre bounds `0 < x < viewportWidth` / `0 < y < viewportHeight`, client-origin point calculation, control root-window ownership, unchanged control handle/client rectangle and final Edge/display checks remain intact. `control_box` is saved before the adjusted size/centre guard; an earlier failure of the unchanged shown/DPR guard still precedes that record.

Candidate-only substitution/reversion requires one exact block and refuses missing, changed or duplicate blocks. The generator suite verifies reversal to reviewed placement runner hash `2558ecee93191506b890472a80b5306f055bf22abe64ce24615d03e35b86fe84` and the existing normalized 32-step pin. Steps differ from r3 only by work-folder substitution. All nine supporting source files, including display/placement helpers and cleanup, are byte-identical to the approved r3 baseline. Wrapper changes only its candidate path and candidate/runner/steps pins.

## D1 — Required correction to the QA evidence wording

At `r4-step9-geometry-20261009/README.md:35–36`, the claim that other terms cannot explain the refusal, including `x,y > 0`, is too strong. No page box was saved. The preceding successful `shown` test does not establish strict positive centre coordinates: a centre at coordinate zero can still hit an element but fails the strict geometry guard. Width and strict-centre terms remain unknown.

Suggested replacement for that claim:

> Given the recorded 1369-pixel native client height and DPR 2 established by the preceding guard, the old exact-height predicate cannot succeed for any integer `innerHeight`. This is sufficient for the combined guard to refuse regardless of the other terms. The page viewport and option coordinates were not saved, so whether the width or strict-centre predicates also failed is unknown. The r4 candidate records those values before the size/centre guard.

This also avoids claiming which short-circuited predicate was actually evaluated first. The odd-height finding supports the narrow correction without assigning an unrecorded page height/width or proving the precise framing/rounding cause. Lead/QA should correct the report while retaining the original evidence; no production fix is requested.

## Checks and their limits

- [Generator](generator.txt): **50 passed**. New positive/negative cases cover old failure for every tested integer height 600–799, new acceptance at 684/685 and exact size, unchanged point calculation for those fixtures, and refusal for a whole CSS pixel or more, wrong DPI/DPR, hidden option and boundary/outside centres. The emitted record/check ordering, all non-size terms, guard sequence, exact delta and block hash are asserted. Existing comma/scope checks pass.
- [Wrapper](wrapper.txt): **54 passed**, with actual child processes withheld. No separate unchanged full mutant campaign was repeated.
- QA's supplied `geometry-arith-parse-check.ps1` / `.out.json` were inspected, not executed by Support. The output shows old refusal at synthetic heights 684/685, new passes there, refusals at 683/686, width 446 and x at the right edge, and `control_box` on both pass/refusal. The r4 parser reports zero errors and zero array-arithmetic hits. The script embeds numeric fixtures and parses the runner; it does not execute the placement/Edge paths. QA's README preserves an initial no-output invocation followed by the corrected script invocation; Support does not count either as its own execution.
- A separate read-only Support reviewer independently confirmed the narrow source delta and six artifact hashes, and identified the same D1. No native operation, live input or execution-result read was delegated.

The real PowerShell caller-scope behavior after the former failure point remains unexecuted. Synthetic page boxes in arithmetic tests are not the missing attempt-2 page measurements. The 9/12/28 author mutant counts are not new Support runs.

## Exact candidate and remaining risk

| Artifact | Verified SHA-256 |
| --- | --- |
| Candidate | `f2104545cdc393522de46ab108fa928bfe475e1cab400cf9af3fbfb6ce8c1503` |
| Runner | `d6640e6c8f24b51dc87feb12f8ce83832c7a6c28c380de8f0b02d1eb644b28c2` |
| Wrapper | `153db051aa92a39a5f59859c1d85b107867a6fc6fa1c30eb033692f83ebdbda3` |
| Steps | `9af8002cbadc799bab4dbf7882b35043b0ac50e3ca620c95f0e76c81684a145b` |
| Generator | `02fd39d06c29eb89d60ed113bb13e97726cc503a2e9678da713a3422b3f6cf83` |
| Surface | `69e38e1bdacf8f4764a9227ebf58177f9959e83f3a03aa428c1b3e8b998be2d2` |

All ten candidate source pins and three payload pins match. The geometry-block pin is covered by the generator check: `b231e245241d45309af3f304b6024971134a6be5a94241f1ec7c9f9691226f48`.

The reported Edge rectangle changing to `2560×1599` is an **unresolved runtime risk**. R4 neither explains it nor proves recovery. Step 10 still raises the owned Edge; step 11 checks the generated surface truth, and step 13's admission requires exact native `[0,0,2560,1600]` both before and after the 16 point checks, foreground/owner identity, exact browser geometry and unchanged display state before capture. Persistent 1599 must refuse. There is no tolerance on source coverage and no new settle delay. Existing ownership/caption races and page-check latency limits remain.

Production stays `52be105a148a28e677f83cc4b7077665f2ff372c`. Support used no Windows/native/device/account/provider/microphone/audio/TTS resource or live attempt. Last supplied shared budget is **2 of 3 consumed, 1 remaining**, with **no active allocation**. Lead owns the D1 report correction, integration and any final fresh allocation. Steps 10–32 and full product acceptance remain unverified by this review.
