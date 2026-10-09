# R3 coordinate/scope source review — 2026-10-09 UTC

**Current verdict: APPROVE the bounded source candidate.** The original independent-check HOLD was closed after Lead made the required subprocess read configuration explicit; [completion evidence](completed/README.md) records 48 generator and 54 wrapper passes, exact commands and verified pins. This does not release a native/display run.

**Initial review history, retained:** source inspection found no must-fix, but independent verification was HOLD. The first offline Node suite refused during module loading, before its 48 cases ran (NOT_RUN). Support stopped that attempt without widening read access or substituting an execution route. The initial invocation, refusal output and source findings below remain unchanged evidence of that attempt.

## Assignment and exact scope

- Lead assignment: `handoff_28588f71f1df7ab0e8f0975af9fc3723`; lead baseline `ffbc06c`.
- Reviewed QA source: `a3f12b30cd954099398018a742d3348cc7e62332`, including the complete `docs/verification/qa/p0-13-tts-52be105/r3-step6-step9-20261008/README.md`.
- Prior approved source: `151f7d741e2b88912a94f0b24473594e236d0076`; Support approval `3b718d85eaea3a606c6c6da6f97efb925c24ac9e` remains bounded to its saved bytes and checks.
- Support branch `team/support` was clean at entry. Only this Support evidence directory changes. Production remains `52be105a148a28e677f83cc4b7077665f2ff372c`.
- Refreshed current role/workflow and affected source/English requirements at the assigned lead baseline through read-only Git access. Windows P0-07/P0-13 and requirements §7.1/7.2 remain separate from this AI-disabled generated-surface harness.

The human approval named by Lead (`human-approve-read-arithmetic:1341e2b5d73b432eaefa988058e79172`) applies to the original QA's result read and isolated arithmetic/parse check. Support did not open the original execution result, duplicate those commands, invoke PowerShell, query Windows processes/windows, or use a display/account/model/microphone/audio/TTS resource. Lead subsequently supplied the QA receipt described below; Support read it without repeating its commands.

## Source findings

1. **Admission coordinates, emitted runner line 826.** Each x/y expression is now grouped before the list comma. The formulas still specify twelve card centres: x = 270, 690, 1110, 1530 across each row; y = 330, 670, 1010 across the three rows. Four literal corners remain `(20,20)`, `(2540,20)`, `(20,1580)`, `(2540,1580)`. The list still precedes the unchanged root-window ownership checks at lines 827–838. `Start-App` still calls admission before `Start-Process` at line 340. These are source calculations, not PowerShell arithmetic execution or display observations by Support.
2. **Placement variable, lines 1025–1027.** All eight references in the three-line client-rectangle block become `$clientArea`. Geometry, DPI, bounds and point calculations otherwise remain unchanged. The later `Assert-QaNormalEdge` at line 1033 reaches `Window-Handle 'edge'`, then the Edge lookup/page check and `Get-QaEdgeSocket`; its line 515 `$client.DownloadString(...)` needs the script WebClient created at line 154. Removing the intervening rectangle local resolves the identified scope collision without changing the socket function. Step 9 execution remains unverified here.
3. **Preservation.** A separate read-only reviewer compared exact r3 with r2 and found only those four source lines and the isolated profile path changed in the emitted runner. Edge identity checks, normal-band/topmost refusal, controlled-surface guards and cleanup remain unchanged. The wrapper diff only replaces the candidate folder and candidate/runner/steps pins. No production fix or shared helper change is included.
4. **Revert checks.** The new apply/revert functions require unique exact source blocks and reject already-applied, missing or changed blocks. `assertReviewedPlacement` now reverses placement-client, points, Edge identity and scoped-admission deltas, then normalizes the profile and compares against prior runner hash `2558ecee93191506b890472a80b5306f055bf22abe64ce24615d03e35b86fe84`; the normalized 32-step pin is retained. This describes the inspected check, not a successful execution of it in this review.

The unchanged shared `qa_display_admission.ps1` still contains the original coordinate hazard. A future candidate using it needs the owner's scoped repair; that is not authority for Support to edit it. Existing caption/ownership timing races and unmeasured page-check latency remain. Source heuristics are not a PowerShell parser or proof that steps 7–32 are free of other runtime errors.

## Attempted focused verification and refusal

The exact QA Windows source and only the required saved candidate/static-identity files were exported from the Git object to `/tmp/support-r3-a3f12b3-3ich5ffk`. No `execution-*` directory was exported. The Linux Node command was:

```sh
LC_QA_TTS_STATIC_RECEIPT=/tmp/support-r3-a3f12b3-3ich5ffk/docs/verification/qa/p0-13-tts-52be105/stage-identity.json \
  /home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  --permission --allow-fs-read=/tmp/support-r3-a3f12b3-3ich5ffk \
  --test-isolation=none --test --test-reporter=tap \
  tests/e2e/windows/test_qa_tts_output_candidate.mjs
```

Working directory was the export root. Node had no filesystem-write or child-process grant. Module loading called `prepareTtsCandidate()`, whose `existsSync(work)` attempted to inspect a Windows scratch path outside the explicit read grant. Node returned `ERR_ACCESS_DENIED` / `FileSystemRead` at generator line 651. The full output is [generator-startup-refusal.tap](generator-startup-refusal.tap).

Actual result: exit **1**, **0 passed**, one file-load failure; the **48 individual cases did not run**. This was Node's deliberately restricted permission model, **not an AgentsDock automatic approval-review rejection**, provider quota error, or evidence of a product failure. No broader permission was granted and no substitute suite/native path was used. The independent subreview was static only and ran no tests.

The author's reported 48 generator checks, 54 wrapper checks, 12 r3 mutants and 28 identity mutants are not Support executions. No new source/candidate hash calculation or successful candidate-check receipt is claimed after the refusal.

## Original QA receipt subsequently reviewed

Lead delivered `handoff_88dd9cb69b3e14e843d5a924998e5d03`, identifying QA `e1ce596` (parent `a3f12b3`). Support read the complete `approved-checks-20261009/README.md`, exact `arith-parse-check.ps1`, `arith-parse-check.out.json` and `attempt1-read-summary.json` at that commit. These are QA executions, independently inspected by Support, not Support native executions.

- The saved summary places the old failure inside `before_product_launch`: `window` was recorded, `owned_points` was not, and step 6 carries the `op_Multiply` error. Only the owned Edge process was recorded. Combined with the runner source, this localizes the failure to construction of the admission points.
- The isolated script embeds the old/new expressions and four corners, performs numeric evaluation and static parsing, and does not invoke runner functions. QA reports Windows PowerShell `5.1.26100.9444`, exit 0 and empty stderr. Its output reproduces the original message on old card 0, reports the old multiplication/array grouping, and produces all 16 expected two-element coordinate pairs for the fix. The reported x/y types are `Int32`/`Decimal`; the unchanged root check casts both to `[int]`.
- Both whole-runner parser results have zero errors. The old runner has the array-arithmetic node at line 826; r3 has none. The placement assignment changes from `client` to `clientArea`, and only `Get-Socket`/`Get-QaEdgeSocket` retain function references to `client` in r3.
- This materially confirms the coordinate diagnosis and corrected arithmetic. It does not execute the dynamic caller-scope path or steps 7–32, retest the display, or replace the unexecuted Support Node suite. The candidate source/pins are unchanged according to QA's committed receipt.

## Candidate supplied for review and next owner

These are the exact pins in the assignment and inspected descriptor/wrapper; they are not newly recomputed Support receipts:

| Item | SHA-256 |
| --- | --- |
| Candidate | `320ba2c1dee4b6eb769beec6fafd2b61b085684eeddc14b335fd28a6f41bbcbc` |
| Runner | `01f35325d8c10cfe0b66cdbfc2cf17486e8deb215d5bec033499df9aa4d42d15` |
| Wrapper | `8f7d7132ffe8d3edb1477d7716345fb52ba619f6ebc6edec59102e14389ec6bc` |
| Steps | `b7c5cc0b7c04867c1ac95a9399d24e06809043eb2c84a9300ffe5cce4769edf5` |

At the initial handoff, Lead received the source finding, reviewed QA receipt and independent-verification stop. The subsequent [completion](completed/README.md) resolves the missing Node check; Lead retains integration and any fresh allocation. Support has no display allocation and consumed no diagnostic attempt; the last supplied shared budget remains 1 of 3 consumed, 2 remaining. No live request, product acceptance, queue completion or main-integration claim is made.
