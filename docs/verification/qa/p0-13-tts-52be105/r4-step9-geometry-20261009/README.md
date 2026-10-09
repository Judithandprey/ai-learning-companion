# r4: step-9 control geometry after attempt 2 — 2026-10-09

**Source independently approved by Support `184f712`; native execution still requires a fresh Lead allocation.** This answers the lead's `handoff_4dd40db9…` and
`handoff_fbb48f42…`, after [attempt 2](../execution-bounded-20261008-02/README.md). Attempts: 2 of 3 consumed, 1
remaining; there is no allocation and no native run was made here. It builds on `a3f12b3` (Support-approved in
`55582e0`), which this candidate keeps.

## Step 9 in attempt 2: what was saved

**Product lifecycle.** The product was successfully launched and later closed by the runner, which is why the wrapper's
cleanup found no owned product process.
- Step 6 started at 05:39:55.05Z. `Start-Process` returned PID 130764, `started_at` 05:39:59.92Z.
- Steps 7 (`waitEval`, the display option present) and 8 (AI and connectors off) passed against it.
- After the step-9 failure, the runner's `finally` closed it: `closed_in_finally`, exit code 0.

**Control window** 199756, owned by 130764:
- bounds `[820, 32, 1740, 1472]` (920 × 1440 px);
- foreground, above Edge, not topmost, raised;
- client area `[833, 90, 1727, 1459]` at 192 dpi: **894 × 1369 px**.

**The page side (`$box`: viewport, DPR, option box) was not saved.** The runner kept it only in a local. What follows
from the source:
- the check just before it (`$box.shown` and `$box.dpr -eq 2`) passed, so the DPR was 2 and the option was visible at
  its centre. This does not establish the strict positive-centre predicates below;
- `innerWidth`/`innerHeight` are integers, so `innerHeight × 2` is even.

**The product's window** (`apps/windows/src/main/main.ts:2236`) is 460 × 720 DIP, measured with the frame, which at 200 %
is 920 × 1440 px. The frame takes 58 px at the top and 13 px at the sides and bottom. That leaves 894 × 1369 px, i.e.
447 × 684.5 DIP. The saved dimensions support correcting the harness comparison; the precise
framing/rounding cause and any other product behavior have not been independently established.

## The cause

Established from the saved evidence and the source:
- **The exact-height predicate cannot succeed.** Given the recorded 1369-pixel native client height and DPR 2
  established by the preceding guard, no integer `innerHeight` satisfies the old equality. This is sufficient for
  the combined guard to refuse regardless of the other terms. The page viewport and option coordinates were not
  saved, so whether width or strict-centre predicates also failed, and which short-circuited predicate ran first,
  remain unknown. The r4 candidate records these values before the size/centre guard. This wording corrects
  Support D1; the original report and actual observations remain in Git history.
- **The width term** would pass if `innerWidth` was 447. Chromium derives the viewport from the same client area, and
  894 = 447 × 2. This is not recorded.
- **Confirmed in PowerShell** (the same arithmetic/parse-only check the human approved, embedding the runner lines byte
  for byte): the old line refuses attempt 2's client area for `innerHeight` 684 and for 685 alike.

## The correction (fifth candidate-only delta)

Each client side may now differ from `viewport × dpr` by less than one CSS pixel: fewer than `dpr` physical pixels,
which at DPR 2 means 0 or 1.

**Kept unchanged:**
- dpi 192 and DPR 2, both exact;
- the option centre inside the viewport;
- the option point computed from the client origin;
- the root window at that point must be the control window;
- the client rectangle must not change during the checks;
- the Edge normal-band, foreground, ownership, display and 16-point gates;
- the cleanup.

**Also new:** the page's viewport, DPR and option box are recorded in the step (`control_box`) before the check, so a
refusal now shows both sides.

The shared `qa_edge_placement.ps1` is unchanged. Reverting the five deltas still gives the reviewed placement runner
`2558ecee…`. The new runner differs from attempt 2's (`01f35325…`) only at line 1026, which becomes lines 1026–1027,
apart from its work folder; the steps differ only in the work folder.

## The Edge window was 1 px shorter at step 9

This is a separate observation, raised by the lead. **It is not handled by the correction, and the gate is not
weakened.**

- **Observed.** The same Edge window (handle 10688924) read `[0, 0, 2560, 1600]` at:
  - step 1 (bind);
  - steps 2–3 (raise, full screen);
  - step 5 (all 16 points);
  - the step-6 admission at about 05:39:58Z.

  At step 9 (about 05:40:01Z) it read `[0, 0, 2560, 1599]`. That was after the product had launched and its control
  window held the foreground, and before QA raised the control.
- **Not a reader difference.** Every one of these values comes from the same reader,
  `QaDisplayAdmissionNative.ReadWindow`, which uses `GetWindowRect` in the same DPI context. So this is a real change
  of the window rectangle, not a coordinate or reader artefact.
- **Cause: unresolved.** At step 2 Edge was also not in the foreground and still read 1600, so "inactive means 1 px
  shorter" does not hold in general. Possibilities, none checked:
  - Edge or Chromium behaviour when another app's window takes activation;
  - an effect of the product's windows (the overlay) on how the shell treats Edge's full-screen window.

  No earlier saved run shows this; the earlier matches for "1599" were hash coincidences.
- **Consequence for attempt 3.** If Edge does not return to 1600 after the step-10 raise, a later gate refuses, and does
  not pass. Step 11 requires `innerHeight === screen.height`, and step 13's admission requires exactly
  `[0, 0, 2560, 1600]` with Edge in the foreground.
  - The run already records Edge's bounds after the step-10 raise (`after_window`) and at step 12, so attempt 3 would
    show which case occurred.
  - Whether Edge returns to 1600 is not known.
  - An optional bounded settle after the step-10 raise is for the lead to decide. It would wait up to a few seconds for
    the exact full bounds and refuse otherwise, with no weakening. It is not implemented here.

## Checks

- [generator-checks.txt](generator-checks.txt): **50 pass, 0 fail**: the 48 from `a3f12b3` plus two new tests.
  - **Before/after model.** Attempt 2's saved client area fails the exact rule for every `innerHeight` from 600 to 799,
    and passes the new rule for 684 and 685, with the same click point. It is still refused for a whole CSS pixel or
    more off, dpi 144, DPR 1.5, the centre outside, or a hidden option.
  - **The emitted check is bound to the model.** The record comes first; every non-size term of the old line is kept
    verbatim; the order is unchanged up to the point check and the client-rectangle check. The comma lint and the scope
    scan are clean, and the line pair is pinned (`b231e245…`).
- [geometry-arith-parse-check.out.json](geometry-arith-parse-check.out.json): Windows PowerShell 5.1, arithmetic and
  `Parser.ParseFile` only. Script: [geometry-arith-parse-check.ps1](geometry-arith-parse-check.ps1).
  - The old line refuses `innerHeight` 684 and 685. The new line passes both and refuses 683, 686, width 446 and the
    centre outside. `control_box` is filled before the check, including on refusal.
  - The r4 runner has 0 parse errors and no array-literal arithmetic, and its product placement assigns `clientArea`.
  - The first run of this script printed nothing: `-Command -` reads line by line, and multi-line function bodies did
    not run. It was rewritten with one statement per line and rerun.
- [geometry-mutants.txt](geometry-mutants.txt): **9 of 9 caught**. Mutants:
  - the height or width term dropped;
  - the tolerance one CSS pixel too wide, or fixed at 4 px;
  - the dpi term dropped;
  - the centre-x term dropped;
  - the record dropped, or placed after the check;
  - the delta not applied.
- [r3-mutants.txt](r3-mutants.txt) and [rule-mutants-r1-r3.txt](rule-mutants-r1-r3.txt): 12 of 12 and 28 of 28
  still caught.
- [wrapper-checks.txt](wrapper-checks.txt): **54 pass, 0 fail**, with child processes withheld. Only the candidate
  folder and pins changed.
- [candidate-check.json](candidate-check.json): the offline identity check against the saved static stage receipt.

## New candidate (unused; source reviewed in Support `184f712`)

| | |
| --- | --- |
| Candidate | [candidate-r4-20261009/candidate.json](../candidate-r4-20261009/candidate.json) sha256 `f2104545cdc393522de46ab108fa928bfe475e1cab400cf9af3fbfb6ce8c1503` |
| Emitted runner | `d6640e6c8f24b51dc87feb12f8ce83832c7a6c28c380de8f0b02d1eb644b28c2` |
| Steps | `9af8002cbadc799bab4dbf7882b35043b0ac50e3ca620c95f0e76c81684a145b` (attempt 2's apart from the work folder) |
| Surface | `69e38e1b…` (unchanged) |
| Generator | `qa_tts_output_candidate.mjs` sha256 `02fd39d06c29eb89d60ed113bb13e97726cc503a2e9678da713a3422b3f6cf83` |
| Wrapper | `qa_run_tts_candidate.mjs` sha256 `153db051aa92a39a5f59859c1d85b107867a6fc6fa1c30eb033692f83ebdbda3` |
| Geometry line pair | sha256 `b231e245241d45309af3f304b6024971134a6be5a94241f1ec7c9f9691226f48` |
| New work folder | `%TEMP%\lc-qa-tts-output-27f0531f6f574cf2b67b1f650525e89d`, absent when prepared and when checked |

[artifacts.json](artifacts.json) gives the exact `launch_identity` and `native_invocation` an allocation would bind.

## Not shown, limits

- **Inferred, not recorded:** the page values at step 9. The width term passing is likewise inferred.
- **Not executed:** fix 2 (`$clientArea`) has still not run; it acts after this check. Steps 10–32 have never run.
- **Edge's 1599** stays unresolved. Attempt 3 may stop at steps 11–13 if it persists.
- **Not acceptance:** none of this is product acceptance.

Real requests remain **0/4**; native attempts in this preparation: **0**.
