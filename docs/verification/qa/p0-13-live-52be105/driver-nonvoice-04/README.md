# Nonvoice driver correction 04: Support 5083814 (R1–R5) and the arm-bound exact overlay (F3) — 2026-10-09

**What ran.** Source and offline checks, plus one bounded Windows check that only parses and compiles. No product,
runner or checker script ran. No native window, display, input, account, model, microphone or audio call was made,
and no lease was taken. The real-action ledger stays at **0 of 4**; the AI-disabled diagnostic stays closed at 3 of 3.

This amends correction 03 (`9614947`, [driver-nonvoice-03](../driver-nonvoice-03/)) within the same P0-13 task. It
follows:
- the Lead's decisions `handoff_1698eb17` (overlay passage, D5, `display.id`, band) and `handoff_e893ca27`
  (Support R1–R5, the arm overlay binding, one predicate for every consumer);
- `handoff_0326d79a`: consume Web's exact `48c20c4`, documented in its `docs/verification/web/windows-source-admission.md`.

Candidates 01–03 and their evidence are unchanged. The new candidate is [candidate-nonvoice-04](../candidate-nonvoice-04/).

**Candidate 04 is still interim.** It pins product `52be105`, which never starts the checker. `interlockProduction`
stays `null`, so the wrapper refuses every allocation. The live candidate must be regenerated against the reviewed,
integrated and staged Web build.

## Support 5083814: R1–R5

**R1 — every observed request is classified, or it is an extra.**
- These become extra actions and make the records incomplete; none can vanish:
  - an ask without a known trigger (`focus`/`text_followup`);
  - a request id on a live line that no look or ask holds;
  - a request-bearing line (`look`, `looked`, `not_looked`, `settled`) without a string id;
  - a live line kind outside the production vocabulary.

**R2 — per-launch histories first, then totals.**
- In each connector launch:
  - the total is the largest cumulative `turn_start_count`, never a sum;
  - every definitely published receipt (written/acknowledged) holds its own distinct count of at least one;
  - the total lies between those receipts and those plus the uncertain ones.
- Then the launches add up. The sum must stay within 4, within the counted actions, and within the actions that may
  have been sent. A request proven unsent cannot absorb an unexplained turn.

**R3 — every terminal record.**
- The Stop verdict reads every phase: the ask entry, its outcome, every settled line, and the receipt.
- A missing phase is unknown. Settled lines and the session's end must carry the ask's session id.
- Disagreement or another session gives `unknown`.
- A genuinely unsent request without a receipt still passes when every app record affirms it.

**R4 — the watcher.**
- It must still be running when readiness is decided, and again right before the launch. That check waits 50 ms for
  the event loop, then reads the watcher's own `/proc/<pid>/stat` (present, not a zombie). It sends no signal.
- The lifecycle is judged in order: the start first and the end last. Each process (pid, start ticks, known role)
  appears once and then exits once.

**R5 — receipts.** Every value must match the connector writer's own bounded schema (`chatgpt_receipts.py _metadata`
plus its identity fields) before a receipt is admitted or copied. The public projection keeps only scalars and lists
of strings.

Support's two controls and six negatives, and its boundary cases, are reproduced in the tests. The fixtures now
carry the session ids the product writes and the display choice. Its exact original probes target `9614947` and would
need those two inputs to run against this code.

## F3: the exact overlay (UNVERIFIED natively)

**One predicate.** [`qa_overlay_predicate.ps1`](../../../../../tests/e2e/windows/qa_overlay_predicate.ps1) is inserted
unchanged into the checker and into the runner. Its native type (`QaOverlayNative`) only reads. It never moves, hides,
raises, closes or signals anything.

**Binding at arm (Web 48c20c4).**
- The arm carries `overlay: {pid, hwnd}`: the main process's id and the positive decimal handle that main names. It is
  null in every other phase and echoed exactly.
- The checker binds it only if all of these hold:
  - the pid is the launched product's;
  - the handle is a positive decimal string;
  - the window is owned by that pid;
  - the window has the overlay's class (`Chrome_WidgetWin_1`) and title.
- The launched product's identity is its pid and native creation ticks, frozen by the runner right after
  `Start-Process`.
- The checker also verifies at start that its parent process is that product.
- The binding is frozen for the checker's life. A denied arm binds nothing, and nothing is ever rebound.

**Every decision during the capture.** At each of the 16 points:
- the window under the point must be Edge or the bound overlay;
- the overlay must still be exactly itself: pid and creation unchanged, class, title, exact display bounds, shown,
  topmost, not cloaked, `WDA_EXCLUDEFROMCAPTURE` read successfully;
- the windows drawn above Edge at the point must be exactly that overlay.

That last rule is a whole z-order walk from the top down to Edge, counting visible, non-minimized, non-cloaked windows
that hold the point. It applies in NAV too: hit-testing skips click-through windows, but the capture does not.

The foreground may be the bound overlay only if Edge is the top of the normal band. At the end of every decision the
bound overlay is revalidated.

**Before arm** there is no binding. The point and foreground rules then reduce exactly to the reviewed hit-test rule: the window under each point is Edge, and the foreground is Edge.

**The admission.** The checker's admission is the reviewed `Assert-QaSurfaceAdmission` with exactly four
substitutions. A test reverts them and compares the result byte for byte. The normal band (not topmost, not
minimized) is read on the frozen Edge window before and after, with the Edge process, creation and window owner
revalidated.

**The runner applies the same predicate.**
- It is used in `Read-QaPlacementPoints` (`Assert-QaEdgePoints`) and in onTop's PID-at-point check.
- Its binding comes from main's read-only session state `source_admission {capture_id, overlay, active}`. That must
  equal the arm that QA's checker admitted (from the checker's own log) and name the launched product. Nothing is
  found by title.
- Without an active binding (before a capture, or with `52be105`), the reviewed checks are unchanged.

**The display.** A new step records the product's own display list before Start (`lc.listDisplays()`, without the
thumbnail). The ledger requires the checker's arm display to be that display:
- the decimal-string id, or the same value as a lossless safe integer;
- the same bounds and the same scale.

The checker echoes the id's original JSON type.

**Main's record.** Main's own `captures/<capture>/admission.jsonl` (Web) is collected and must agree with QA's
checker log:
- every decision main records as allowed is an allow in QA's log, with the same facts;
- every allowed send in QA's log is in main's record;
- main records no violation.

**Fixtures.** Negative fixtures of the four pure functions are in
[`qa_overlay_fixtures.json`](../../../../../tests/e2e/windows/qa_overlay_fixtures.json) (binding, overlay facts,
stack, normal-band top). The runner [`overlay-fixture-check.ps1`](overlay-fixture-check.ps1) is **prepared and not
executed**: the Lead allowed no native test yet. It was parsed (below). Offline tests prove each refusal reason has a
negative fixture, but they do not run PowerShell.

Lead decisions as applied:
- D5 (4 actions / 60 s / 60 s) and the fixed 600 s bound are unchanged. The worst case is 589 s, after one more
  1-second step.
- The decision timing is still inferred, not measured.

## Independent reviews before delivery

Two more internal reviews ran, each finding checked by a skeptical verifier:
- `wf_1792a674-4a3` covered the first overlay version: 14 findings, 13 confirmed, 1 refuted;
- `wf_7f052652-f40` covered this version: 13 findings, 10 confirmed, 3 refuted.

That is 23 confirmed (several are the same issue seen by two lenses; about 17 distinct), all fixed, and 4 refuted.

**Confirmed and fixed:**
- The overlay was identified by title within one decision only. It is now bound at arm and frozen for the capture,
  as the Lead also decided.
- An overlay as foreground did not require Edge at the top of the normal band.
- A failed z-order step read as "nothing beneath".
- The context was written before the app was recorded. A failed write could then have left the app unrecorded.
- The prepared fixture check exited 0 even when cases failed.
- The tests checked only call sites.
- Stale test names and comments.
- A request-bearing live line without an id vanished.
- The launch-time watch check read stale state.
- While the overlay was click-through (NAV), its exclusion and the windows beneath it were never examined.
- Missing test coverage of lineage, composition and the R2/R3 sub-rules.

**Refuted:**
- that the overlay handle was held only for one decision (in the first version that was a design limit, now replaced by the arm binding);
- that the onTop passage used another read;
- that Support's probes reproduce only as adapted copies;
- that the fixture uses an Edge value the caller never passes.

## Results

**Windows parse and compile check** ([parse-compile](parse-compile/)).
- Environment: Windows PowerShell 5.1.26100.9444, CLR 4.0.30319.42000.
- The exact candidate-04 files were staged by [stage.py](parse-compile/stage.py) in a fresh `%TEMP%` folder:
  - `runner.ps1` `3adea467…` and `admission-checker.ps1` `9b4b3537…`;
  - the composed fixture check;
  - the six distinct literal C# blocks.
- Command: `powershell.exe -NoProfile -NonInteractive -Command -`, with [check.ps1](parse-compile/check.ps1) on stdin.
  - `Parser::ParseFile` gave **0 errors in each of the three scripts**.
  - `Add-Type -OutputAssembly` (compile to a DLL file; nothing executed) gave **6 of 6 blocks compiled**.
  - stderr was empty. The DLL hashes are in [dlls.sha256](parse-compile/dlls.sha256), and the folder was then removed.
- The first invocation had a path my substitution had mangled. PowerShell reported a read error for all three files
  and compiled nothing. It is not counted; the second invocation is the result.

**Offline checks.**
- [failures-before-9614947.txt](failures-before-9614947.txt): the corrected tests against `git archive 9614947`.
  **26 of 33 pass, 7 fail.**
- [passes-after.txt](passes-after.txt): **33 of 33**, with `--permission` (no child process, no write).
- [driver-mutants.txt](driver-mutants.txt): **123 of 123 caught** by a test other than the pinned-candidate refusal.
  - That includes R1–R5, predicate, runner, main-record and display mutants.
  - Three equivalent mutants are left out, with the reason stated in the script.
- [candidate-check.json](candidate-check.json): candidate 04 reproduces from the sources, and its scratch is unused.

## Changed pins

| | candidate-nonvoice-03 | candidate-nonvoice-04 (interim) |
| --- | --- | --- |
| `candidate.json` | `db83ff5c…` | `4cb6032ef8eccea7306cdd624cf2e7846e04c07ca801145dba5490eb232c7410` |
| Runner | `4f3fe4d3…` | `3adea4670487f84215608865be9eb569b80ad7070feec5a8fb7a166ab7abfc99` |
| Steps | `a513585e…` | `4049577415ad805c11b23e3cf1009b4e071956cfe24669e807574aeb354e423c` (63: + display choice) |
| Checker | `920255cf…` | `9b4b3537ec84d2beb54347c5132860c8a9755c6f28b69ab07dccc160f2d6e6e1` |
| Checker configuration | `51b05f5a…` | `a28429bc0be901d878c5240181f94e351d74f6abbf1619a1c73b49d9b1fa818e` |
| Surface, connector configuration | unchanged | unchanged |
| Wrapper | `ddbd65f8…` | `3a537fa1df6b1b74311e3146ba7f3ec021d7b64291313d6b2d3504564a68487b` |
| Scratch | `…bc552279…` | `%TEMP%\lc-qa-live-nonvoice-e44fd6aaff6b452a91244c9ec5a1bcca`, absent |

[allocation.template.json](allocation.template.json) stays inactive and gated. [artifacts.json](artifacts.json) lists
every hash.

## For the Lead, Web and Support

1. **The in-capture stack rule is stricter than the reviewed pre-capture hit-test.** During a capture, any other
   visible, uncloaked window drawn above Edge at a required point refuses, even a click-through one, because such a
   window can draw into the capture. A machine with, for example, a vendor's always-on overlay would refuse at the
   first decision; that is a false refusal, not a pass. The refusal names the intervening window's class and owner
   pid (metadata only).
2. **The consumer follows Web's unreviewed `48c20c4`.** That covers:
   - `overlay {pid, hwnd}` on arm and null otherwise;
   - session state `source_admission {capture_id, overlay, active}`, absent after the end;
   - `admission.jsonl` with kinds `decision` / `violation` / `checker_end` and the `allowed` field.

   Any change there needs this consumer and its pins updated together.
3. **Latency.** Inferred from the accepted diagnostic, about 3 s per decision: the reviewed admission's two identity
   resolutions are most of it. The added work is small: 16 z-order walks, overlay reads and one parent-process query
   at start. It is not measured.
4. **What is still not verified natively.** The predicate's runtime behaviour, cross-process
   `GetWindowDisplayAffinity`, the overlay's actual affinity value under Electron, `ReadLineAsync` on stdin, and JSON
   echo equality in Windows PowerShell all remain unverified. So does the fixture check, which is prepared and not
   run. The OS race between native observations remains.

## Remaining prerequisites

1. Lead and Support review of these changed boundaries.
2. Web's build reviewed, integrated and staged. Then the candidate is regenerated against it with `interlockProduction`
   set, and the pins are reviewed.
3. The fixture check and any further native verification, only when the Lead allows them.
4. Command and script review, then an allocation.

`test_qa_run_tts_candidate.mjs` stays at 26/54 because the r4 scratch was consumed. That is pre-existing and was not
recreated.
