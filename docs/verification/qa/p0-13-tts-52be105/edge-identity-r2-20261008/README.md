# Owned Edge surface identity, correction r2 (Support R1–R3) — 2026-10-08

**Source correction and new candidate only. Nothing was run on Windows; no allocation exists.** This answers lead
`handoff_a05ac9a096200016381d14ded6c42c0c`. It is the same P0-13 Edge identity repair as `b9ce4cc`
([first delivery](../edge-identity-20261008/README.md)). Support held that delivery in `6c7872d`
(`docs/verification/support/edge-identity-review-20261008/`) with three must-fixes. The `b9ce4cc` candidate and its
evidence are unchanged, and so is the record of the consumed attempt.

As before, every change is emitted into this candidate's runner by `qa_tts_output_candidate.mjs`. The shared
`qa-electron-runner.ps1`, the generic callers and the product are unchanged. Reverting the two candidate deltas
(scoped admission, Edge identity) still gives the reviewed placement runner `2558ecee…`, and a test asserts this.

## R1 — every Edge window action checks the bound page first

Support's finding: the window lookup checked process, caption token, count and handle, but never the page. A changed
URL or replaced target kept its window raisable.

The emitted rule now (lines are in [runner.ps1](../candidate-edge-identity-r2-20261008/runner.ps1)):

- **`Assert-QaEdgeSurfacePage`** (L538) is the one page check. It runs these in order:
  1. it refuses at once if the owned Edge has ended;
  2. `Get-QaEdgeSocket` checks that exactly one page target shows the surface URL and that it is the same cached
     target, with an open connection;
  3. a fresh evaluate checks that `location.href` (lower case) is the surface URL, that the truth function exists,
     and that `document.title` still ends with this run's token. Only a boolean `true` passes;
  4. `Get-QaEdgeSocket` runs again, so the target cannot change during the read.

  It never assigns `document.title`. A reloaded or replaced page has lost the token and is refused, not tagged again.
- **`Get-QaEdgeSurfaceWindow`** (L561), i.e. every `Window-Handle 'edge'`, runs the page check before and again after
  the window scan. That covers raise, show, front, keys, clicks, the on-top and placement checks, and the admission.
- **Full-screen placement** (L953): directly before each `Browser.setWindowBounds` (L971, the runner's only one), the
  runner checks, in order:
  1. the page;
  2. the window lookup again, which must return the same handle;
  3. the target's CDP window id, read again, which must be the same.
- **Bind** (L596): the page check runs once more after the window, DPI and client checks, just before the identity is
  published.
- **`edgeClose`** (L1166, optional cleanup) keeps only the target check. It closes the owned browser on its own profile
  and port, and gating it on the token would only make cleanup refuse. This is QA's choice. QA's internal reviewer called
  it acceptable owned-instance cleanup; Support has not reviewed it. The wrapper's exact-owned cleanup remains the
  backstop.

## R2 — an unreadable caption is unknown, not a nonmatch

`QaEdgeSurface.Caption` (L465) returns one of these codes:

| Code | Meaning |
| --- | --- |
| 1 | carries the token |
| 2 | readable, no token |
| 0 | a successful empty caption (length 0 with last error 0) |
| -1 | unknown: a failed length read, over 4096, a failed read, or a length that changed during the read |
| -2 | not a window of the owned processes before the read, or no longer one after a failed length read or after the text read |

A window that disappears in the last instant, between the ownership check after the text read and the final length
check, returns -1 rather than -2. Either code refuses.

`Find` (L477) collects code 1 as matches and code -1 as `Unknown`, and throws only after `EnumWindows` returns. Both the
lookup and the bind refuse while `Unknown` is non-empty, before the matches are used. The bind's 5-second poll stops
early only with a match and no unknown window. A readable match plus an unreadable second owned window therefore refuses,
and nothing is moved.

## R3 — the receipt never widens the authorized processes

`Get-QaEdgeWindowReceipt` (L575) fixes the owned process ids before its walk. `OwnedWindows` lists only visible windows
of those processes. Then, for each window:

1. `Caption` runs first and checks ownership before any read. A -2 is recorded as `owner_changed` with nothing else
   read.
2. Otherwise the window's metadata is read, and ownership is checked again. If the owner changed, the row is
   `owner_changed` and the metadata is dropped.

No observed owner is used as a whitelist; the old `Find([uint32[]]@($g.Owner), …)` is gone. In Support's sequence
(enumerated as owned, then found to belong to another process) caption reads for the foreign process are zero.

A Win32 race remains. A handle reused in the instant between an ownership check and the next call could get one length
or text read. That result is then discarded as unknown or `owner_changed`, but the read itself is not recorded.

## Before/after against Support's counterexamples

Support's probe `6c7872d:tests/probes/support/review_edge_identity_counterexamples.mjs` was used byte for byte.

- **Before.** Against a full `git archive b9ce4cc` it exits 0 and reproduces all three:
  - R1: a raise of `A` after the target changed;
  - R2: a read failure and an over-limit second window both accepted as unique;
  - R3: a caption read for foreign PID 23092.

  See [support-probe-before.txt](support-probe-before.txt).
- **After: the unchanged probe cannot judge r2, and its failure is not evidence of the fix.** Only its folder,
  candidate hash and runner hash were changed to this candidate (a three-line diff, shown in the log). It exits 1 at its
  own line 35, where the R1 action model returns no action instead of `raise A`
  ([support-probe-after.txt](support-probe-after.txt)). But that refusal is
  `generated surface DevTools target is not known`, an input mismatch:
  - The probe passes the target's fields flat (`{...state, ...target}`). The corrected model takes `{target, page}`.
  - It refuses an unchanged, valid target the same way, so the refusal does not depend on the navigation.
  - The probe's R1 source check (its line 23, `hwnd_lookup_revalidates_page`) still passes on r2. Its pattern does not
    include `Assert-QaEdgeSurfacePage`, the function through which the new lookup reaches the page.
  - Its R2 and R3 parts are not reached. They also could not run unchanged, because they parse the old
    `IntPtr[] Find(uint[] pids, string token)` signature, which no longer exists.
- **The real after-evidence is in the focused suite.** It uses the same fixtures, with the old runner as the "before"
  side. These adapt the probe's inputs, not only pins:
    - **R1 with Support's own fixture, in the model's `{target, page}` input.** Window A, PID 14104, token caption,
      normal band, target `page-A`. With the bound page, the control raises `A`. With the target and page at Support's
      `synthetic-other-page.html`, the raise is refused (`navigated or ended`) and nothing is done.
    - **R2 before/after (replayed C#).** `b9ce4cc`'s `Find`, translated mechanically, returns `[A]` for A plus B, with
      B's caption failing, over the limit, or failing its length read. The new `Find` returns matches `[A]` and
      unknown `[B]`, and the lookup and bind refuse that set.
    - **R3 before/after (replayed C#).** The old receipt fed `$g.Owner` back as a whitelist, and the old `Find` reads
      23092's captions. The new `Caption` on a window enumerated as 14104's but now owned by 23092 returns -2 with zero
      caption reads. `OwnedWindows` excludes a foreign and a hidden window.
    - **R1 before/after (source path).** One pattern (page check, socket, evaluate or CDP call) is false for the old
      lookup and its callees, and true for the new ones, so the test tells the two rules apart.
      In the new runner, the page check is required before and after the scan, before each full-screen write, and before
      publishing.
    - **R1 action model.** Each case happens after binding and before the action. For each of raise, fullscreen and
      front, every case below is refused and nothing is done:
      - a navigation, or a changed or replaced target;
      - a reload (token lost), or another page at the same URL (truth function missing);
      - an unknown target;
      - a replaced Edge;
      - an unknown caption;
      - zero, two or a changed window;
      - a topmost or minimized surface.

## Checks (offline)

- [generator-checks.txt](generator-checks.txt): **41 pass, 0 fail**.
  - The rewrite of the identity section is not pin-only. It replaces `b9ce4cc`'s identity models with the R1–R3 ones.
  - These earlier independent assertions were restored, updated for the new lines:
    - the throw order of `Get-QaEdgeSocket` and of the bind;
    - the replaced-Edge action case;
    - the single over-long caption, now unknown and refused;
    - the exact line for a missing identity.
- [wrapper-checks.txt](wrapper-checks.txt): **54 pass, 0 fail**, with child processes withheld (`--permission`). The
  wrapper changed only in its candidate pins.
- [candidate-check.json](candidate-check.json): the offline identity check against the saved static stage receipt.
- [rule-mutants.txt](rule-mutants.txt): **28 targeted mutants** of the R1–R3 rule. Each was applied to the generator in a
  copy of the worktree, and the suite was rerun. **All 28 are caught by behaviour, line or order assertions, not only by
  the block hash pin.**
  - The first round left two caught only by the hash pin: the receipt's `owner_changed` short-circuit and the
    `OwnedWindows` filter. A behaviour replay of `OwnedWindows`, an order assertion and two exact-line pins were added.
- **QA-internal read-only reviews.** These are other model instances' perspectives, not acceptance; Support's review
  is still required. They are recorded with what each covered in [internal-reviews.md](internal-reviews.md).
  - The first covered an intermediate r2 runner (`2c27df9b…`). Its notes are applied in this package.
  - The second covered this runner (`301b5053…`) and generator (`3070bad0…`). For the emitted code it found no must-fix
    or should-fix. For the evidence it found two must-fixes, both fixed here:
    - this file's link to a then-unwritten `artifacts.json`;
    - an overstated reading of the probe's after-run.
  - Its should-fix and note items are applied too. After that second review only the tests and these files changed;
    the generator, candidate and wrapper did not.

## New candidate (unused)

| | |
| --- | --- |
| Candidate | [candidate-edge-identity-r2-20261008/candidate.json](../candidate-edge-identity-r2-20261008/candidate.json) sha256 `03344f776afb4ff2110e7450b8c48d86fd0b9d7b394e5473e3ccd7959770cde9` |
| Emitted runner | `301b5053e758938df97059fa52a60715d6ed7d9423a7e44de5e30df681c59dfa` |
| Steps | `e4059d8a69efe5038c61924ccef58a224b52aa658c11b1724faa8ec6ef53dd9f` (the 32 reviewed steps; only the work-folder paths differ from `b9ce4cc`'s) |
| Surface | `69e38e1b…` (unchanged) |
| Generator | `qa_tts_output_candidate.mjs` sha256 `3070bad0a46c3987eb36fce6ab657852c19a429b746c60b2dd516098c5a6a059` (pinned in the candidate) |
| Wrapper | `tests/e2e/windows/qa_run_tts_candidate.mjs` sha256 `aad5e81b76e8b329b3c95c6b7ee31359443f6a47ede55312af2ff751fa416816` (only its candidate folder and pins changed) |
| New work folder | `%TEMP%\lc-qa-tts-output-77fadf1af4554e9dbd361e200b896aaa`, absent when prepared and when checked |

[artifacts.json](artifacts.json) gives the exact `launch_identity` and `native_invocation` an allocation must bind, the
ten source pins, the six reviewed block hashes and the wrapper and test hashes. The `b9ce4cc` candidate (`d8d87df4…`),
its scratch `…c28000ba…` (never created) and all earlier evidence are unchanged.

## Not shown, limits

- **No native execution.** PowerShell and C# were neither executed nor compiled here. The changed `QaEdgeSurface` class
  is compiled by `Add-Type` at the runner's start; a compile error would stop the runner before any step. Support's
  earlier Windows-side parse and compile-only check covered `b9ce4cc`'s blocks, not these. Repeating it, touching no
  window or process, would close this gap; that is for the lead and Support to decide.
- **R1 rests on the source path and a model.** The emitted PowerShell action path was not executed. That every window
  action is preceded by the page check is shown by:
  - the call graph (every Edge window use goes through `Window-Handle 'edge'`, plus the single full-screen write);
  - exact-line, order and hash assertions;
  - the JS action model.
- **Races.** The page check, the window scan and the action are separate calls, so sub-second gaps remain. A reload in
  the gap after the second page check could still meet one raise; the checks after the raise or write then refuse. They
  fail closed, not open. For the caption race inside `Caption`, see R3 above.
- **Cost not measured.** Each Edge lookup now runs two page checks, and each full-screen write one more lookup. Over the
  run that is about 69 page checks: about 207 loopback DevTools list requests and 69 evaluates. The likely extra time
  is a few seconds; no step has its own timeout; the wrapper's 140 s bound applies. No run of this step list has timing
  data.
- **Unobserved assumptions,** each failing closed if wrong, at the cost of the attempt:
  - Edge's `--app` window shows the page title in its caption within 5 s;
  - no owned window's caption is unreadable at bind time, nor at any of the about 33 later Edge lookups, which do not
    wait for captions to settle;
  - the full-screen surface window is not topmost;
  - it becomes the foreground window through the unchanged raise.
- **The 2026-10-08 window.** Which owned window was found that day stays unknown.

Real requests remain **0/4**; native attempts in this correction: **0**; Windows, GUI and process queries: **0**.
Speech, captions, focus, Stop and the real-AI and desktop gates remain NOT_RUN.
