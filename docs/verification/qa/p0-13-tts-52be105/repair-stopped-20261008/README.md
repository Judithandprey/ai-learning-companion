# Repair after attempt 1 stopped on new tool refusals — 2026-10-08

The lead assigned the repair of attempt 1's step-6 failure in `handoff_c880e9e3b0cc794cbccd89b0609f6a60`
([attempt 1](../execution-bounded-20261008-01/README.md)). It **stopped before any source change** because this
session's automatic permission classifier refused two actions. The human's bounded approval
(`human-bounded-retest-20261008:d41dbbfae11448f7847e26cb54afcd44`) and the lead's card both say to stop on a new
security or tool refusal. Neither action was retried, reworded, or routed through another tool, host, encoding or
agent. The lead withholds any further allocation (`handoff_8c9efa10693deb9a4826619d4efb6643`).

## The two refusals

| About (UTC) | Action | Classifier reason |
| --- | --- | --- |
| 22:52 | A read-only local `python3` print of attempt 1's `runner-results.json`: step 6's full record, the `errors` list and the `processes` summary | `[Remote Shell Writes]` |
| 22:57 | The isolated check the lead asked for: `powershell.exe -NoProfile -NonInteractive` with an encoded command, run from `/mnt/c` | `[Auto-Mode Bypass]` |

The refused check would have done four things, and made no GUI, process-enumeration or native calls:
1. evaluate the runner's line-826 expression for card 0;
2. parse that expression and report its top operator and operand types;
3. build the corrected 16-point list;
4. parse the saved r2 runner and list arithmetic binary expressions that have a bare array-literal operand.

The lead was told in `handoff_90fca77dc824e62948b0cf8ff8159143`. That message dated the second refusal "~23:0xZ"; the
time above, about 22:57Z, is the correct one.

## State

- **No change** was made to the generator, tests, wrapper, candidate or pins. The last source is `151f7d7`; the
  attempt-1 record is `b586e8a`.
- **Attempts:** 1 of 3 consumed and 2 unused. QA requests or starts none.
- **Cause, from source reading only (not confirmed).** Line 826 (`qa_display_admission.ps1:185`, `e74d5b5`) is inside
  `Assert-QaSurfaceAdmission 'before_product_launch'`, which `Start-App` calls before `Start-Process`. In PowerShell the
  comma operator binds more tightly than `*`, so `(A) * 2, (B) * 2` is `(A) * (2, (B)) * 2`, a number times an array.
- **Proposed fix (not applied).** A candidate-only emitted delta would parenthesize each coordinate:
  `,@(((40 + $card % 4 * 210 + 95) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2))`. It would keep the 16 points
  and the fail-closed semantics, and leave `qa_display_admission.ps1` unchanged. It would come with:
  - an exact-line pin and a block hash;
  - a JS arithmetic regression over the points;
  - a new candidate and pins, and a fresh unused scratch.

Continuing needs a normal decision by the user or the lead after these refusals.
