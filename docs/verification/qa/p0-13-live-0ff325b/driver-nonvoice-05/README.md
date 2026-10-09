# Nonvoice driver correction 05: candidate on product 0ff325b, and Support c2ee58ae — 2026-10-09

**What ran.** Source and offline checks, plus read-only checks of the staged files. No PowerShell, runner, checker,
fixture or other Windows process ran. No display, account, model, microphone or audio call was made, and no lease was
taken. The real-action ledger stays at **0 of 4**; the AI-disabled diagnostic stays closed at 3 of 3.

This is the same P0-13 task, under two Lead handoffs:
- `handoff_1345f6e5`: regenerate the candidate for the reviewed, integrated and staged Web interlock build;
- `handoff_fd7cc02d`: correct the boundaries from Support's HOLD `c2ee58ae` of `937788d` first.

Candidates 01–04 and their evidence are unchanged. The earlier OS refusal of the pure fixture check (`a58d583`) stays
as evidence, and that check stays **NOT_RUN**.

## The product: 0ff325b as the Lead staged it

| | |
| --- | --- |
| Product | `0ff325beadb7c689244610307b6aa16d638fd2e6` (Web interlock integrated; Windows tree `0d9618c2…`) |
| Release / evidence baseline | `194986dea3e120a3b8806a9e7bb2c06bfefb5cf7` |
| Stage | `%TEMP%\lc-windows-admission-0ff325b`: 81 files, tree `081a130c1f492c98d78fec8d67463a36c80126ea1ca72eede99d043ca616a46a` |
| Entry point | `dist/apps/windows/src/main/main.js` `8c4aa465…` |
| Native helper, Electron 44.5.1, Edge | unchanged from the accepted diagnostic |

- **Stage check.** [`qa_admission_stage_check.py`](../../../../../tests/e2e/windows/qa_admission_stage_check.py) is a
  new read-only check. The 52be105 check is unchanged. Against the Lead's manifest
  ([copy](../stage-0ff325b.json), byte-identical to `194986d`, SHA-256 `33db2d2e…`), it gives:
  - [stage-identity.json](../stage-identity.json): **81/81 matching**, no missing, unexpected or irregular files;
  - the tree and entry point as pinned;
  - the native helper's local build receipt and its source matching;
  - Electron 44.5.1.

  No file was compiled, loaded or executed.
- **Connector copy.** `services/` and `packages/` are identical at `52be105` and `0ff325b`. The private copy made for
  52be105 compares **equal, file for file, with 0ff325b** (280 files):
  [connector-copy-check.json](connector-copy-check.json). The connector configuration bytes are unchanged.
- **Interlock gate.** `interlockProduction` now names `0ff325b`, as the Lead allowed. The wrapper refuses an
  allocation for a candidate of any other build, or with any other named build. This is not an execution allocation.
- **Driver steps.** These are unchanged in behaviour: the control and overlay pages, control preload, DOM ids and
  `lc` calls the steps use are the same in 0ff325b. The session state only gains `source_admission`.

## Support c2ee58ae, corrected

- **F3-A.** Both z-order walks refuse an owner read that fails or returns 0. A point passes only if the single entry
  drawn above Edge is the bound overlay by handle, owner pid **and** class, not by handle alone.
- **F3-B.** In the runner, every final onTop point applies the one predicate while a binding exists, including when
  the PID at the point is Edge's (NAV). Without a binding, the reviewed PID rule applies exactly. `Assert-QaEdgePoints`
  revalidates the bound overlay after its final Edge re-resolution.
- **F3-C.** Every decision after the arm must carry the arm's capture id, so nothing is joined across captures.
  - Main's `admission.jsonl` is collected per capture folder.
  - Only the folder named by the arm's capture id is reconciled; a record in any other capture's folder fails.
- **F3-D.** Main's verdict fields must be consistent:
  - an allow has `denied:false` and a null reason;
  - a refusal has a boolean `denied` and a string or null reason.

  A contradictory record fails.
- **Coverage (Lead decision).** Main's record and QA's checker log must tell the same complete trace:
  - every decision of every phase (arm, pre, post, send), in the same order and number, with the same recorded facts
    and verdict;
  - no violation.

  Missing, duplicated, reordered or contradictory records fail. Only fields main actually records are compared.
- **Checker lifecycle.** The new mechanical term `checker_lifecycle_released` requires all of these:
  - exactly one `checker_end` from main for the capture: spawned, exit seen, code 0, no signal, not killed;
  - QA's own log ending with its end of input after every decision.

  A missing or unclean end is not released.
- **R3-A.** A successful fence needs the known same-session linkage: the ask's session id on the settled lines and on
  the end. Missing linkage gives `unknown`, not a fence. An unknown provider submission with complete linkage stays
  `fenced_submission_unknown`, as Support allowed.

Support's exact controls and counterexamples are tests:
- a missing Stop-session link;
- a post-acquire of another capture;
- an allow with a denial and a reason;
- a sends-only main record.

Further cases cover:
- a main record in another capture's folder;
- a missing, duplicated or reordered record;
- an unseen, killed, non-zero or signalled checker end;
- a QA log without its end.

## Results

- [failures-before-937788d.txt](failures-before-937788d.txt): the corrected tests against `git archive 937788d`.
  **22 of 34 pass, 12 fail.**
- [passes-after.txt](passes-after.txt): **34 of 34**, with `--permission` (no child process, no write).
- [candidate-check.json](candidate-check.json): candidate 05 reproduces from the sources against the new stage
  receipt, and its scratch is unused.
- **The inactive allocation template.** [allocation.template.json](allocation.template.json) is refused by
  `validateLiveAllocation` as it stands ("separate exact Lead-reviewed live allocation required"). The tests also
  refuse a mismatched build and an inactive allocation.
- **Not run:**
  - no mutation campaign (as the Lead said);
  - no PowerShell parse or compile of the candidate-05 bytes. The runner and checker changed from candidate 04
    (F3-A, F3-B), so `937788d`'s parse/compile result does not cover them.

## Pins (candidate-nonvoice-05)

| | |
| --- | --- |
| `candidate.json` | `5e7fdcd513c355d0f63a4c36e778d0fdc457e550ca781da29c6f8b7901d2aebb` |
| Runner | `2fbb5eb3c5e734719f6b26fc8066b55626078d3ffdb075d5dc65936326ca2cdb` |
| Steps | `70e89d51c0489a8c9472bf25a8438b08ff493f5be2c59148bc92baf10778874f` (63) |
| Checker | `9637db613373ef5ba63bc10753033aedaab90bf749aeaa982fed9b65c91eccf1` |
| Checker configuration | `6e86df7d74f52ce54b879d1c14d6d71b7548c69127d0f787a0a1be2fb46d7cc3` |
| Surface, connector configuration | `be82967a…`, `4729ca1a…` (unchanged) |
| Wrapper | `58a0a9923f55631fcdd36426f567ed81469ded230146af04c933f412fc4e79f4` |
| Scratch | `%TEMP%\lc-qa-live-nonvoice-e72ea0f932d148c0a48d4c101c69d328`, absent |
| Worst case / bound | 589 s / 600 s |

[artifacts.json](artifacts.json) lists every hash.

## Remaining command and native dependencies

1. Support's retest of these changed boundaries, then Lead review.
2. If the Lead wants it, a Windows parse/compile-only check of the candidate-05 runner, checker and C# literals. This
   is the same bounded form as `937788d`'s: nothing executed.
3. Lead review of the exact command and the script permission: the runner, and the checker that product 0ff325b
   starts per capture. Both carry the process-only `-ExecutionPolicy RemoteSigned`. Without it, this machine refused
   a `-File` script (`a58d583`). Then a fresh exclusive display and account allocation following the template.
4. The user's managed sign-in present and no other lock holder.
5. Run-time rechecks by the wrapper:
   - the stage, read-only (`qa_admission_stage_check.py`);
   - the private copy against 0ff325b;
   - the codex digest;
   - the preflight;
   - the scratch unused;
   - the connector watch running at the launch.
6. Still unverified natively:
   - the overlay predicate;
   - cross-process `WDA_EXCLUDEFROMCAPTURE` reads;
   - the checker's stdin handling and JSON echo;
   - decision latency (about 3 s inferred);
   - the 16-entry holding ceiling (C3-B, Lead decision);
   - the OS race between native observations.

`test_qa_run_tts_candidate.mjs` stays at 26/54 because the r4 scratch was consumed. That is pre-existing and was not
recreated.
