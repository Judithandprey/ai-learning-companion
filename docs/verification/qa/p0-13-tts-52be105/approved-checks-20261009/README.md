# The two human-approved checks after attempt 1 — 2026-10-09

The human approved the two actions that this session's permission classifier had refused
(`human-approve-read-arithmetic:1341e2b5d73b432eaefa988058e79172`, recorded 2026-10-09T05:25:28Z with the reply "批准").
Both were run once, under normal tool review with that authorization cited, and **neither was refused this time**. No
permission was changed. Neither check started the product, Edge, a GUI, a window or process action, the microphone,
audio, an account or a model. They do not count as a native display attempt: 1 of 3 attempts consumed, 2 unused.

## 1. Read-only parse of attempt 1's results

Previously refused as seq25524, `[Remote Shell Writes]`. Output: [attempt1-read-summary.json](attempt1-read-summary.json).

- **Step 6's own record** holds only its time (22:51:33.60Z), `kind` `launchApp`, `ok` false and the error. `errors` has
  that one line, and `processes` has only the owned Edge 41212, so no product process was recorded.
- **The admission entries:**
  - Entries 001–006 (initialize; before browser launch; before the Edge raise; before and after full screen; after
    the Edge points) were accepted.
  - Entry 007, `before_product_launch`, was not accepted. It holds `native_before`, `browser`, `window` and `error`,
    and no `owned_points`.
- **Where it stopped.** In `Assert-QaSurfaceAdmission`, `$entry.window` is set just before line 825, and
  `$entry.owned_points = 0` comes just after line 827. So the error came from lines 825–827:
  - 825 is `$points = @()`;
  - 826 is the 12-card loop;
  - 827 adds literal corners.

  **The failure site, line 826, is confirmed by the run record.**

## 2. Isolated PowerShell arithmetic and parse-only check

Previously refused as seq25576, `[Auto-Mode Bypass]`. It ran on Windows PowerShell 5.1.26100.9444 (Desktop, zh-CN UI
culture), fed as plain text on stdin, exit 0, no stderr.
- Script: [arith-parse-check.ps1](arith-parse-check.ps1). Its two line-826 versions and line 827 are embedded byte for
  byte from the runners.
- Output: [arith-parse-check.out.json](arith-parse-check.out.json).

Results:
- **The old line** fails at card 0 with `RuntimeException`. Its message, in the zh-CN culture, is byte-identical to
  attempt 1's step-6 error. In en-US it reads: "Method invocation failed because [System.Object[]] does not contain a
  method named 'op_Multiply'".
- **The old line as parsed:** the top node is `Multiply` with right operand `2`. Its left operand is the text
  `(x) * 2, (y)`, a multiplication whose right operand is the array literal `2, (y)`. That is `((x) * (2, (y))) * 2`,
  as diagnosed.
- **The new line as parsed:** an `ArrayLiteralAst` of two `ParenExpressionAst`. It runs without error and appends 16
  two-element pairs: x is an `Int32`, y a `Decimal`, and `RootAt` receives `[int]` casts. The 16 points are exactly the
  on-top points of steps 5, 12 and 28.
- **`Parser.ParseFile` of both runners:**

  | | attempt 1 runner `301b5053…` | r3 runner `01f35325…` |
  | --- | --- | --- |
  | Parse errors | 0 | 0 |
  | Arithmetic expressions with an array-literal operand | one: line 826, `Multiply` | none |
  | Variables `Assert-QaProductPlacement` assigns | include `client` | include `clientArea`, not `client` |
  | Functions that use a variable named `client` | `Get-Socket`, `Get-QaEdgeSocket`, `Assert-QaProductPlacement` | only `Get-Socket` and `Get-QaEdgeSocket`, the readers of the script WebClient |

## What this does and does not show

- **Fix 1** (parenthesized coordinates) is now confirmed: the site comes from the run record, the cause and the
  corrected arithmetic from PowerShell itself.
- **Fix 2** (`$client` renamed `$clientArea`) is confirmed only statically, by the real parser. That PowerShell resolves
  the variable through the caller's scope at run time comes from its documented scoping rules (`about_Scopes`); it was
  not executed, because the approval covered only numeric evaluation and static parsing.
- **Steps 7–32** have still never run with this candidate.
- **Not covered:** Support's independent review, the integration and pins, and a fresh allocation. All three are needed
  before attempt 2.

The r3 preparation (`a3f12b3`, candidate `320ba2c1…`, runner `01f35325…`, wrapper `8f7d7132…`) is unchanged by these
checks. Real requests remain 0/4.
