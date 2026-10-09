# Nonvoice driver correction 03: Support HOLD 38230e1 (F1, F3–F6, receipt reader) — 2026-10-09

**Source and offline checks only.** No Windows, display, account, model, microphone or audio call was made, no
PowerShell ran, and no lease was taken. The real-action ledger stays at **0 of 4**; the AI-disabled diagnostic stays
closed at 3 of 3.

This amends correction 02 (`e0bd4b3`, [driver-nonvoice-02](../driver-nonvoice-02/)) within the same P0-13 assignment
(Lead `handoff_3b1cdc65`). The F3 parts follow the Lead's later decisions:
- the decisions themselves: `handoff_3c83dc63` and `handoff_bd7d451f`;
- the canonical checker interface: main `4f7d9fa`, "Checker interface decision".

Candidates 01 and 02 and their evidence are unchanged. The new candidate is
[candidate-nonvoice-03](../candidate-nonvoice-03/).

**Candidate 03 is interim and cannot run.** It still pins product `52be105`, and `52be105` never starts the checker.
- The wrapper now refuses every allocation until `interlockProduction` names a reviewed production build that does
  start the checker. Web's interlock in `apps/windows` is not yet delivered.
- The live candidate must be regenerated for that build. These bytes are for review of the QA side.

## What changed, per finding

**F1 — the spend/workspace veto reads only the applicable bucket.** The actual `account_ready` step now selects the
bucket the way `chatgpt_rpc.py` does at `52be105` (lines 806–816):
- the Codex limit whose model is unset or the selected model;
- otherwise, the single unnamed bucket.

It stops before Start only if exactly one bucket applies and that bucket states `spend_control_reached` or one of the
four workspace codes. Another model's or another limit's bucket no longer vetoes the run.

**F4 — collection and receipts are judged for every action.** New mechanical terms:
- `collected`: `collect_errors` must be empty; a missing list fails too.
- `records_complete`: no unreadable live line, no ask record without requests, no request without an id.
- `provider_turns_reconciled`:
  - Each receipt carries its client's *cumulative* `turn_start_count`, so the ledger takes the largest count per
    connector launch and adds the launches. Counts are never summed within a launch.
  - That total must be at most the counted actions and at most 4, and at least the number of written/acknowledged
    receipts.
  - A missing count is not zero.
- Receipt facts: no item beyond userMessage/agentMessage/reasoning, the pinned codex digest, and the explicit binary.
  - `whole_picture_at_provider` applies them for actions 1–3.
  - The new `stop_attempt_facts_ok` applies them to the Stop attempt. If that attempt has no receipt, every record must
    say not submitted.
- `connector_lifecycle_correlated`: if any request was sent, the watch must have seen a Codex descendant.

**F5 — watch readiness and release.**
- `startWatch` starts the read-only watcher and waits up to 5 s for its own `watch_start` record. That record must show
  the private copy present and nothing running in it.
- This all happens before the scratch is taken and before the native launch. If the watcher is not ready, a refusal is
  written, nothing is launched, and the scratch stays unused.
- `watchSummary` says *released* only if all of these hold:
  - a start record exists;
  - the connector itself was seen;
  - every appeared process was seen exiting (matched by pid and start ticks);
  - the end record shows nothing left;
  - the log is readable.
- Anything less is *unknown*, or *left_running*.

**F6 — uncertainty is kept.**
- An `uncertain` receipt is reported as "submission unknown".
- The fence verdict reconciles the ask record, the settled line and the receipt. If they conflict, the verdict is
  `unknown`.
- `fenced_in_flight` now needs all available records to say submitted.

**Receipt reader.** `readOwnReceipts` checks each receipt before a byte of it is copied:
- It reads only launch folders created after the native launch (their names are listed just before it).
- Each must be a real folder, named the way the connector names it, inside the real `receipts/` folder.
- Each file is opened with `O_NOFOLLOW` and must be a regular, single-link file of at most 16 KiB.
- Its key set must equal `chatgpt_receipts.py`'s fields plus the writer's identity fields, and its `request_id` must
  match.
- One request may not appear in two launches.
- Only what this reader admits is copied to the raw-receipt folder outside the repository.

## F3 — QA's source-admission checker (the QA half of the Lead's interlock design)

**Checker.**
- `admission-checker.ps1` is generated from `qa_admission_checker.ps1`, the JSONL protocol loop and the frozen context.
- Into it go the reviewed runner's definitions, cut whole and unchanged:
  - the four C# types (QaWin, QaEdgeSurface, QaDisplayAdmissionNative, QaPlacementNative);
  - the runner's `SetProcessDPIAware()` statement;
  - the 16 functions that `Assert-QaSurfaceAdmission` needs.
- Every request gets a fresh, full `Assert-QaSurfaceAdmission`. No guard is changed:
  - geometry, foreground, the 16 owned points, identity resolved twice;
  - the normal-band predicate read on the admitted window just before and just after.
- Lineage rules:
  - arm comes first, once, and must be the admitted display;
  - post_acquire needs an admitted pre_acquire;
  - a send needs an admitted acquisition and a request id that was not seen before;
  - replay and out-of-order sequences are denied.
- One deny latches all later requests.
- Each decision is logged (metadata only) before it is answered.
- A malformed line ends the checker without a reply. EOF exits normally.
- The checker runs no command, reads no pixels and moves no window. A test checks the native calls it can make.

**Runner delta.** This is the only change against the reviewed r4 bytes. It is reverted and compared byte for byte by
`assertReviewedRunner`.
- It writes the frozen context: Edge pid and start, surface token, window, port, display signature.
- The write happens right after `before_product_launch` and creates a new file.
- It sets `LC_SOURCE_ADMISSION` only for that `Start-Process`: cleared at start, set inside the launch, removed in
  `finally`.

**Configuration.** `admission-live.json` holds exactly the interface fields:
- Windows PowerShell with `-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File` and the frozen script;
- ready 10000 ms and decision 5000 ms.

**Binding check.** `sourceAdmission` checks the QA checker log against the ledger:
- Every request that may have reached the provider needs an allowed send for its exact PNG.
- That send must name an acquisition that was admitted after acquisition and before it.
- Every decision must use a fresh, accepted admission, in order.
- A deny followed by any allow fails.
- An allowed send that the app's records do not hold fails.

`source_admission_bound` is a mechanical term.

**Not done.** The withdrawn first draft (an in-session coverage step without the foreground predicate) was dropped
because the Lead forbade weakening the foreground guard. No production file was edited.

## Independent review before delivery

A four-lens review ran, each lens followed by a skeptical verifier: protocol, PowerShell 5.1, ledger/wrapper, and
integrity. QA did one further check of its own. Confirmed and fixed:
- **Parse error (P1).** A condition continued on a line that began with `-or`, which Windows PowerShell rejects. The
  checker would never have started. A test now rejects leading-operator lines.
- **Display id (P1).**
  - The product keeps `display_id` as a decimal string (`52be105`). The checker accepted only a number, so every arm
    would have been denied.
  - It now accepts the string or the number and echoes it unchanged.
- **Latency (P1).**
  - My first version resolved the Edge window five times per decision. In the accepted diagnostic's
    `runner-results.json`, the same code shows:
    - one resolution: about 1.5 s (step 10's lookup before its raise);
    - one full admission: about 3.1 s (`before_product_launch` and `before_capture_start` to the next step).

    Five resolutions would mean about 7.6 s per decision, against 5000 ms.
  - The decision is now the reviewed admission alone (two resolutions, about 3 s by inference) plus two cheap band
    reads.
  - The step waits that depend on decisions were raised:
    - overlay frame 15 → 30 s;
    - session start 20 → 30 s;
    - request out 10 → 20 s (×3);
    - new frame after the change 6 → 20 s.
  - The worst case is 588 s, within the fixed 600 s.
- **DPI awareness (P1, found by QA's own check).** The runner makes its process DPI-aware right after the QaWin type.
  Without the same statement, the checker would test the 16 physical points in virtualized coordinates.
- **Pins and gate (P3).**
  - The wrapper now pins all six payloads, and a test checks that the pins equal `names`.
  - The wrapper refuses the interim candidate mechanically.

Refuted by the verifiers:
- a submitted Stop attempt without a receipt being a false fence (it already fails `stop_attempt_facts_ok`);
- the duplicate pin finding;
- one of the two ASK-mode findings (the other was confirmed; see Open question 1).

## Results

- [failures-before-e0bd4b3.txt](failures-before-e0bd4b3.txt): the corrected test file against `git archive e0bd4b3`.
  **13 of 30 pass, 17 fail.**
- [passes-after.txt](passes-after.txt): **30 of 30**, run with `--permission` (no child process, no write).
- [driver-mutants.txt](driver-mutants.txt) from [driver-mutants.py](driver-mutants.py): **77 of 77 caught** by a test
  other than the pinned-candidate refusal.
  - That is the carried-over mutants with updated anchors, plus new F1, F3, F4, F5, F6 and reader mutants.
  - New ones include: the leading-operator parse error, the numeric-only display id, an extra window resolution, the
    gate removed, the checker not pinned.
- [candidate-check.json](candidate-check.json): candidate 03 reproduces from the sources, and its scratch is unused.
- Not re-run: the connector copy check. The connector configuration is unchanged (`4729ca1a…`); see correction 02.

## Changed pins

| | candidate-nonvoice-02 | candidate-nonvoice-03 (interim) |
| --- | --- | --- |
| `candidate.json` | `74ebc394…` | `db83ff5c52bbbdef4d4fb361522c4a2d2b8168fab7face4805efb4ba30bd3df6` |
| Runner | `0f5c23f0…` | `4f3fe4d3a09d4b1dd1f530d659a2974b4e0142686ca027612756fff6c9f0473f` (r4 + folder + the admission delta) |
| Steps | `560461ad…` | `a513585ed4e1e63b588c0770b08661bd211f065735f63392c2a6916a377e8d6c` |
| Checker (new) | — | `920255cf6b610abbbe43a5f90cc5c637f5548cfff36c3ccf302746fd05e5d447` |
| Checker configuration (new) | — | `51b05f5afb5aa96f0294fc4ca0c39ae9a8c9a282d61fe5cdd0a2c26653f97d11` |
| Surface, connector configuration | unchanged | unchanged |
| Wrapper | `9db4b2d3…` | `ddbd65f80720f5cb109906e4d01aa3f3dd93c40f2beac8519fa7fd645c83d2cd` |
| Scratch | `…29b2ae8a…` | `%TEMP%\lc-qa-live-nonvoice-bc5522790be647da96a1aa15e0a04755`, absent |

[allocation.template.json](allocation.template.json) is inactive, uses the 600000 ms bound, and notes the gate.
[artifacts.json](artifacts.json) lists every hash.

## Open questions for the Lead (not decided here)

1. **The product's interactive overlay versus the 16 points (P2, source evidence).**
   - In ASK mode (and any mode other than NAV), main calls `setIgnoreMouseEvents(false)` on the full-screen, topmost
     overlay (`main.ts:2023–2027`, `overlay.ts` `setMode`).
   - `RootAt` then returns the overlay instead of Edge, so a decision taken during action 2's circle would deny. That
     deny latches and ends the whole capture.
   - An earlier QA run on this machine (report `p0-13-windows-behavior-061efe2`, an older product build) found that
     Windows kept delivering frames with zero change: no `no_new_frame` state occurred. So acquisitions, and their
     checks, can happen even on a still screen.
   - The diagnostic's only in-session 16-point pass was in NAV with the card closed.
   - I kept the guard strict. The options are:
     - (a) disclose the risk as accepted;
     - (b) a reviewed rule that looks through only the exact product overlay (launched app pid, its title, topmost,
       excluded from capture) and still requires Edge directly beneath.
2. **Latency and the 60 s session (D5).**
   - At about 3 s per decision, an acquisition costs about 6 s (pre + post), and a send can wait behind one.
   - The four actions may not fit in the 60 s session. Unfinished actions would be NOT_RUN, not passed.
   - Decision time has not been measured with the checker itself. A revised `decision_ms` needs that measurement.
3. **The display id type.** I accept a decimal string or a number. Please confirm this in the interface.
4. **The normal band.** It is read as the reviewed predicate (not topmost, not minimized) on the admitted window,
   rather than through `Assert-QaNormalEdge`, which would add a third resolution (+1.5 s). The runner's in-session
   onTop steps keep the full point and band checks.

## Remaining prerequisites

1. Web's interlock build is reviewed. Then the candidate is regenerated against that build and its stage, with
   `interlockProduction` set to it, and its pins are reviewed.
2. A Windows parse/compile-only check of the exact runner and checker, which nothing here could do:
   - `Parser::ParseFile` with zero errors;
   - `Add-Type` of the C# types.

   It needs the normal approval.
3. Support review of these changed boundaries, then Lead integration.
4. The exact-command and script review, now covering the checker started by the product. Then a fresh exclusive
   allocation.

Not verified here:
- No PowerShell parsed or ran.
- These Windows PowerShell 5.1 behaviours are untested: `ReadLineAsync` with a timeout on stdin, `Console.SetOut`, and
  `ConvertFrom-Json`/`ConvertTo-Json` echo equality.
- No checker latency was measured.
- No interaction with Web's app was tested.
- The residual OS race between native observations remains.

`test_qa_run_tts_candidate.mjs` stays at 26/54 because the r4 scratch was consumed. That is pre-existing and was not
recreated.
