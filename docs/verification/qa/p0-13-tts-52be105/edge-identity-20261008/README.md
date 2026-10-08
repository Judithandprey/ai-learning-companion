# Owned Edge surface identity for the next diagnostic attempt — 2026-10-08

**Source repair and new candidate only. Nothing was run on Windows; no allocation exists.** This is the existing P0-13
assignment `handoff_fa627da3c2310dd4eca1ccf6676186a6`, with the refinement `handoff_251a58bf1585820923e17cf342546e3d`.
Support's diagnosis is `6c7302b`, `docs/verification/support/edge-window-identity-20261008/`.

## The defect

On 2026-10-08 the one allocated attempt stopped at runner step 2 ([evidence](../execution-admission-20261008/README.md)).
The runner's `Window-Handle 'edge'` took the first visible top-level window, in z-order, of the launched Edge and its
direct children. That window was topmost, so the normal-band guard refused it before any raise. Which Edge window it
was is not known. A popup is only the likeliest reading: no title, screenshot or other windows were recorded.

Support also showed that `Get-Socket 'edge'` took the first DevTools page target, and revalidated a cached one only
by its id. So a successful start never proved that the window and the generated page belonged together.

## What the candidate runner does now (this candidate only)

The shared `qa-electron-runner.ps1`, the generic callers and the product are unchanged. The changes are emitted into
this candidate's runner by `qa_tts_output_candidate.mjs`, beside the scoped admission. Reverting both deltas gives the
reviewed placement runner; a test asserts this.

1. **DevTools target.** `Get-Socket 'edge'` goes to `Get-QaEdgeSocket`. The target is the one page target whose URL is
   the generated surface's URL, compared in lower case. At every use the runner checks again that exactly one such page
   exists and that it is the same target. It refuses when there is another page and no surface page, two surface
   pages, a navigation away, a changed target or a closed connection. It never reconnects to another page.
2. **Identity bind, right after the surface loads** (in the `edgeStart` step, before any window action):
   - Through that target, the runner checks that the page's `location.href` is the surface URL and that its truth
     function exists.
   - It appends a random token of 32 letters g–v to the page title (no digits, so none of the surface's values), and
     reads the viewport and the device pixel ratio.
   - It looks, for up to 5 s, for visible top-level windows of the launched Edge, or of its children created after
     it, whose caption carries the token. It reads captions only for windows of those processes.
   - Exactly one window must match. That window's DPI must equal the page's, and its client area must be able to hold
     the page's viewport (2 px tolerance).
   - Only then is the identity published. A failed bind leaves no half-made identity behind.
   - Whatever the outcome, the step records the title-free metadata of every visible window of the owned processes:
     class, bounds, topmost, minimized, foreground, caption length and whether it carries the token. A refusal can then
     be diagnosed, unlike on 2026-10-08.
3. **Every later lookup** of the owned Edge window (raise, full-screen placement, the 16 points, admission, product
   placement) finds the token window again. It requires the same window handle, the same launched Edge process (PID
   and start time) and that process still running. Zero, two, a changed window, an ended or replaced Edge, or no
   identity refuses.
4. **Nothing acts on an unidentified window.** The identity path itself raises, moves and resizes nothing. The
   unchanged guards still apply to the identified window. In particular a topmost or minimized surface window still
   refuses before the raise. The display, foreground and 16-point checks follow unchanged.

The surface URL must not contain `%`; this run's URL has none.

## Checks (offline)

- [generator-checks.txt](generator-checks.txt): **33 pass**.
  - Decision models of the native rule, covering:
    - an owned popup first in z-order (the surface is still found);
    - the token anywhere in the caption;
    - another window of the same process, a hidden window, and another app's window with the same title;
    - child processes created before, at or after the launch;
    - no match, two matches, an ended or replaced Edge, a missing identity, a changed window;
    - the DevTools target (another page first, an escaped URL, two pages, navigation, a changed target);
    - the bind geometry (the 2026-10-08 window's size, wide-but-short, narrow, wrong DPI, tolerance).
  - An action model: nothing is raised unless the identity holds and the identified window is in the normal band; a
    topmost or minimized surface, a same-size decoy, a stale identity and a changed window leave no action.
  - Bindings of the emitted PowerShell to those models: the refusals in source order, the process filter before any
    caption read, the bind call right after the load wait, the socket redirect, the identity published once and last.
  - Every guard pinned as an exact line with its expected count, and the three emitted blocks pinned by reviewed hash.
- [rule-mutants.txt](rule-mutants.txt): 13 mutants of the emitted rule. Examples: no process filter, first of many,
  no handle check, no page check, first DevTools page, no socket ambiguity, identity published early, no DPI check, no
  bind, no redirect. **All 13 are caught by line or order assertions, not only by the hash pin.**
- [wrapper-checks.txt](wrapper-checks.txt): **54 pass**, child processes denied (the wrapper is unchanged apart from
  its candidate pins).
- [candidate-check.json](candidate-check.json): the offline identity check against the saved static stage receipt.
- **Independent read-only review**, two lenses: emitted PowerShell/C# and the rule. No must-fix. It applied to an
  intermediate version; its notes are taken into this one:
  - the identity is published only after every check;
  - the owned-window receipt;
  - one URL rule (lower case, no escapes) in the runner and the model;
  - the model in the runtime order;
  - the exact-line pins.

## New candidate (unused)

| | |
| --- | --- |
| Candidate | [candidate-edge-identity-20261008/candidate.json](../candidate-edge-identity-20261008/candidate.json) sha256 `d8d87df4c9cc9b32782e634dab963f83ace4960221db19508b4c877c9059f3f8` |
| Emitted runner | `f739487b513cc4f749ac4cc95cfa0a64ba58e23670d9fdc4d14753df4ae3e44f` |
| Steps | `22654c440365cb6ad2fd2aafe47e0d767d705cd07beea8436f2acff4005ac06a` (the 32 reviewed steps; only the new work-folder paths differ) |
| Surface | `69e38e1b…` (unchanged) |
| Wrapper | `tests/e2e/windows/qa_run_tts_candidate.mjs` sha256 `5b537bbe2407fa7413c790d022226cfe1bbb2480a58e386a2fcf8ceed2b90bda` |
| New work folder | `%TEMP%\lc-qa-tts-output-c28000baefb243218ba3e7287182da30`, absent when prepared |

The consumed scratch `…afad9615…` and all earlier candidates and evidence are unchanged.
[artifacts.json](artifacts.json) gives the exact `launch_identity` and `native_invocation` an allocation must bind, the
ten source pins and the five reviewed block hashes.

## Not shown, limits

- **No native execution.** PowerShell and C# were neither executed nor compiled here. The new `QaEdgeSurface` class is
  compiled by `Add-Type` at the runner's start; a compile error would stop the runner before any step. A compile-only
  check of the emitted runner's `Add-Type` blocks on the Windows side, touching no window or process, would close this.
  That is for the lead to decide.
- **Unobserved assumptions,** each failing closed if wrong, at the cost of the attempt:
  - Edge's `--app` window carries the page title in its caption within 5 s;
  - the full-screen surface window is not topmost;
  - it becomes the foreground window through the unchanged raise.
- **Models.** The decision models are tested in Node. Their correspondence to the PowerShell rests on the exact-line,
  order and hash assertions, not on running it.
- **Popup identity.** Which window was found on 2026-10-08 stays unknown.

Real requests remain **0/4**; native attempts in this repair: **0**. Speech, captions, focus, Stop and the real-AI and
desktop gates remain NOT_RUN.
