# Prepared r3 candidate: step-6 point list and step-9 client-area name — 2026-10-08

**Prepared only. It has not been reviewed by Support and is not authorized to run.** The bounded continuation is stopped
on two new tool refusals ([stop record](../repair-stopped-20261008/README.md)). The operator has taken the first refusal
to the human (`read-denial-notice-20261008:8d07d2932b644d98817b014af2f27dc9`) and allowed local source analysis and
preparation that does not depend on the refused actions. This is that preparation. Attempts: 1 of 3 consumed, 2 unused;
QA requests or starts none.

This candidate makes two candidate-only changes to the runner that ran as attempt 1 (`301b5053…`). Apart from its new
work folder, the runner differs from attempt 1's in exactly two places: line 826 and lines 1025–1027.

> **Update 2026-10-09.** The two refused actions were later approved by the human and run once without refusal
> ([approved checks](../approved-checks-20261009/README.md)). Fix 1's site is confirmed by the run record; its cause
> and the corrected arithmetic are confirmed by PowerShell itself. Fix 2 is confirmed only by the real parser, not
> executed. Statements below that fix 1 is "not confirmed" describe the state before that update.

## Refused actions: what was and was not done

- **No PowerShell was run** (the isolated check was refused). Nothing on Windows was used, apart from read-only
  existence checks of scratch paths: `ls`, and the `existsSync` calls in the generator and its `check`.
- **Attempt 1's `runner-results.json` contents were never printed, parsed or inspected** after the read was refused.
  The operator's record dates that refusal at 22:53:14Z; the stop record's "about 22:52" was an estimate. Its bytes
  were touched in these ways, none of which looks at what it says:
  - `sha256sum` of the attempt folder (about 22:56Z), to record the hashes in the attempt-1 README;
  - `git add` and `git commit` of that folder (`b586e8a`), saving the evidence as the lead asked;
  - one repository-wide `git grep -l owned_points`. It listed the file as a match, which reveals only that the word
    occurs in it. The on-top steps record that word too, so it says nothing about step 6. Later searches excluded the
    folder;
  - while preparing the superseded first version of this fix, the two mutant scripts copied the whole
    `p0-13-tts-52be105` folder, that file included, into temporary copies. Nothing read them, and they were deleted.
    The r3 mutant scripts skip every `execution-*` folder.
- **The QA-internal reviewers** were told not to open that file or folder, and report that they did not.

## Fix 1, step 6: the admission's point list

The diagnosis comes from source reading and PowerShell's documented precedence. It was not executed, and step 6's
record was not read.

- **The path.** Step 6 `launchApp` calls `Start-App`, whose first act is
  `Assert-QaSurfaceAdmission 'before_product_launch'`, before `Start-Process`. That fits no owned product process
  being seen at cleanup.
- **The one candidate.** Every function on that path was scanned. The only PowerShell multiplication is runner line
  826, from `qa_display_admission.ps1:185` (`e74d5b5`):
  `$points += ,@((40 + $card % 4 * 210 + 95) * 2, (90 + [Math]::Floor($card / 4) * 170 + 75) * 2)`. Line 813 is
  JavaScript, evaluated in the browser.
- **Why it fails.** `about_Operator_Precedence` puts the comma operator above `* / %` and `+ -`, so the list reads
  `(x) * (2, (y)) * 2`. A QA-internal reviewer added that PowerShell looks up `op_Multiply` on the right operand's type
  when the left one is a primitive. With `Int32 * Object[]` that gives exactly the observed message. That is consistent
  with this site, but not executed.
- **Never run before.** The 2026-10-03 pre01 run stopped at step 5, and the 17:21Z run stopped at step 2. A source parse
  cannot see this run-time error.
- **Step 5 avoided it.** Its 16 points are literal numbers in `steps.json`.
- **The fix.** `,@(((40 + $card % 4 * 210 + 95) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2))` puts each
  coordinate in parentheses. The same 16 points are checked in the same way.

## Fix 2, step 9: a local that hides the script WebClient

This defect was found by the QA-internal review of fix 1. It was not observed, because attempt 1 stopped at step 6. QA
introduced it with its own Edge identity delta (`b9ce4cc`); Support approved that delta, and r2 kept it.

- **The cause.** PowerShell resolves an unqualified variable through the caller's scopes. In step 9,
  `Assert-QaProductPlacement` stores the control window's client rectangle, an `int[5]`, in a local `$client` (runner
  line 1025).
- **What would happen.** It then calls `Assert-QaNormalEdge`, which goes through `Window-Handle 'edge'` to
  `Get-QaEdgeSocket`. That function's `$client.DownloadString(...)` (line 515) means the script's WebClient (line 154),
  but would get the `int[5]`. The read would fail and the error would be swallowed. After 20 s the required step would
  refuse with a misleading "no DevTools target" message. Attempt 2 would be spent after the product had launched.
- **Why it is new.** Before the identity delta, `Window-Handle 'edge'` did not read `$client`. Every other `$client`
  reader in that function ran before line 1025.
- **The fix.** A fourth candidate-only delta renames the local to `$clientArea` in its three lines. Its values and
  checks are unchanged, and the reviewed Edge identity blocks are untouched.

The shared `qa_display_admission.ps1` and `qa_edge_placement.ps1` are unchanged. Reverting the four deltas still gives
the reviewed placement runner `2558ecee…`.

## Checks (offline)

- [generator-checks.txt](generator-checks.txt): **48 pass, 0 fail**: the earlier 41, plus seven new tests.
  - **Comma-precedence lint**, with unit cases. On attempt 1's whole runner it finds exactly one hazard, line 826; on
    the new runner it finds none. The shared helper still holds the original line.
  - **Scope-shadow scan**, with unit cases. It reports a function whose local, assigned or a parameter, hides a script
    variable from a function it reaches. The reached function must read the variable before its own first write, or in
    a parameter default value.
    - On attempt 1's runner it finds exactly `Assert-QaProductPlacement $client`, reaching `Get-QaEdgeSocket` and
      `Get-Socket`. Only the `Get-QaEdgeSocket` read is live; the `Get-Socket` entry appears because the scan ignores
      order, and that function's own `$client` reads all run before the local is set.
    - On the new runner it finds nothing. The concrete path is also asserted: the local is set before
    the last `Assert-QaNormalEdge`, which reaches `Window-Handle 'edge'` and so `$client.DownloadString`. No unqualified
    `$client` is left in the function.
  - **Only the two changes.** The new runner equals attempt 1's runner with only the point line, the three client-area
    lines and the work folder changed. In the admission, the point list still comes before the unchanged root-window
    check.
  - **Arithmetic.** The emitted point line is split at its top-level comma into one x and one y, each one parenthesized
    expression. Evaluated for the 12 cards and joined with the 4 corners, they give exactly the 16 points of all three
    on-top steps. Step 5's copy of those points passed on the display in attempt 1.
  - **Pins.** Both changes are pinned by exact text and hash: point line `d37acc4b…`, client-area lines `d30e56a2…`.
- [r3-mutants.txt](r3-mutants.txt): **12 of 12 mutants caught**. They cover nine point-list cases (as before) and three
  client-area cases: only the first line renamed, a different name, and the delta not applied. Nine fail a behaviour or
  source-assertion test; three stop the suite at load, because the reviewed-placement check refuses them.
- [rule-mutants-r1-r3.txt](rule-mutants-r1-r3.txt): the 28 Edge-identity mutants, rerun: **28 of 28 still caught**.
- [wrapper-checks.txt](wrapper-checks.txt): **54 pass, 0 fail**, with child processes withheld. Only the candidate folder
  and pins changed.
- [candidate-check.json](candidate-check.json): the offline identity check against the saved static stage receipt.

## QA-internal read-only review (`wf_89c87d8c-562`, of the superseded first version)

This was a perspective from another instance of the same model, not acceptance; Support's review is still required. It
covered the first version, which had only fix 1. It confirmed:
- the parse of the old and new lines;
- that line 826 is the only array-versus-scalar operation on step 6's path;
- that no other comma hazard exists;
- the hashes, the one-line delta and the mutants.

| Finding | Disposition |
| --- | --- |
| must-fix: step 9 `$client` scope collision | fix 2 above |
| must-fix: comments stated the unconfirmed site as fact | the generator and test comments now say it is inferred; `artifacts.json` uses `targets_runner_of_attempt_1` |
| must-fix: "not read by any tool" was too absolute | replaced by the exact list above; the mutant scripts now exclude `execution-*` |
| should-fix: the lint's limits were understated | stated in the test comment and below |
| note: the shared helper still has the comma hazard | recorded below for the lead |

### Re-review of the r3 delta (`wf_f4b5887a-eca`)

This review found no must-fix. It confirmed:
- the rename is complete: all eight uses became `$clientArea`, and the WebClient and its readers are byte-identical;
- an independent, order- and parameter-aware scope analysis finds no collision in the new runner. The variables that
  any function reads through its callers are never a local or parameter of another function;
- the hashes, both suites, the offline check and both mutant sets reproduce.

| Finding | Disposition |
| --- | --- |
| should-fix: the scope scan missed caller parameters, reads before the reader's own write, and parameter defaults | the scan now handles all three, plus `++`, piped calls and double-quoted strings, each with a unit case. On five runners it gives the same results as before |
| note: the `Get-Socket` hit is not live | stated above and in the test |
| note: 22:52 versus 22:53Z | corrected above |
| note: the existence checks of scratch paths were left out | stated above |
| note: a generator comment implied all three on-top steps passed | reworded: only step 5 ran. The candidate was re-pinned with the same never-created scratch; the payload is unchanged |

After this re-review only the test file's scan, that generator comment, the candidate and wrapper pins, and these files
changed. They have not been reviewed again.

## New candidate (unused, not reviewed)

| | |
| --- | --- |
| Candidate | [candidate-r3-20261008/candidate.json](../candidate-r3-20261008/candidate.json) sha256 `320ba2c1dee4b6eb769beec6fafd2b61b085684eeddc14b335fd28a6f41bbcbc` |
| Emitted runner | `01f35325d8c10cfe0b66cdbfc2cf17486e8deb215d5bec033499df9aa4d42d15` |
| Steps | `b7c5cc0b7c04867c1ac95a9399d24e06809043eb2c84a9300ffe5cce4769edf5` (identical to attempt 1's apart from the work folder) |
| Surface | `69e38e1b…` (unchanged) |
| Generator | `qa_tts_output_candidate.mjs` sha256 `cb2f69fb90e25ff8c3ca32d7d4dc35845b6c6ba9c9cefe84fd722702d7bebb12` (pinned in the candidate) |
| Wrapper | `qa_run_tts_candidate.mjs` sha256 `8f7d7132ffe8d3edb1477d7716345fb52ba619f6ebc6edec59102e14389ec6bc` |
| New work folder | `%TEMP%\lc-qa-tts-output-6bd71cac570a42a18cedd16b28cf6d68`, absent when prepared and when checked |

The reviewed block hashes for the admission listing, the guard and the four Edge identity blocks are unchanged.
[artifacts.json](artifacts.json) gives the exact `launch_identity` and `native_invocation` an allocation would have to
bind. Attempt 1's candidate, scratch and evidence are unchanged.

## Not shown, limits

- **Neither cause is confirmed by execution.** An arithmetic-only PowerShell run of the corrected line would confirm
  fix 1; it was refused and has not been repeated. Fix 2 is a static finding.
- **Both scans are text heuristics, not PowerShell parsers.**
  - The comma lint sees only operators with a space on each side. It does not check a comma and an operator on
    different lines, `"$(...)"` subexpressions, or lines with backtick-escaped quotes. It skips text that looks like a
    method call.
  - The scope scan ignores the caller's statement order, which is conservative for the caller. It masks single-quoted
    text and keeps double-quoted text. It does not model scriptblocks, dot-sourcing, `Set-Variable`,
    `-ErrorVariable`/`-OutVariable`, or `$script:` writes inside functions, and it finds calls by function name only.
  - Finding nothing else is not proof that the runner has no other run-time error.
- **Steps 7–32 have never run with this candidate.** Other first-run errors there cannot be excluded offline.
- **The shared helper is unchanged.** `qa_display_admission.ps1:185` still has the comma hazard for its other users
  (`qa_visible_candidate.mjs` inlines it). A future candidate from it would fail the same way. Fixing the shared helper
  is for the lead to assign.
- **Earlier limits still hold:** caption timing, foreground, sub-second races, and the unmeasured cost of the page
  checks.

Real requests remain **0/4**; native attempts in this preparation: **0**.
