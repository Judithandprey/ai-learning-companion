# Exact Edge identity review — 2026-10-08

**HOLD on `b9ce4cc56c375909befea38d410bc9e233ebc953`: three must-fixes remain.**
The token approach addresses first-window selection, but its action path does not
revalidate the page, unreadable captions can create false uniqueness, and a stale
receipt HWND can widen caption reads to a foreign process. These are source/fixture
findings, not failures observed in another GUI attempt.

Lead card: `handoff_3a0d7aff9252c76ee96bbefa667d52bc`. Compared with `03ecfa2`,
using exact Git objects and immutable export `/tmp/support-edge-review-b9ce4cc-72kjupld`.
No role/requirements/workflow delta from the prior incident baseline. QA remains
the sole repair author; only Support evidence/probes changed.

## Must-fixes

**R1 — Window actions bypass fresh page validation.** Emitted runner lines
527–534 (`Get-QaEdgeSurfaceWindow`) check only process lifetime, caption token,
match count and HWND. Its callees `Find-QaEdgeSurface` and `Get-QaOwnedEdgeIds`
do not check CDP either. `Window-Handle 'edge'` enters this path directly.
The `window edge raise` step then calls `Raise-QaEdgeNormal`; its repeated HWND
check still does not call `Get-QaEdgeSocket`, inspect the current URL/target or
revalidate the generated-page marker. `Get-QaEdgeSocket` at 488–515 is only on
the separate socket/Eval route.

Concrete counterexample: after a successful bind, retain the HWND, owner,
normal-band state and token caption, but change the page URL or target. A direct
raise lookup still returns that HWND. The exact exported target model refuses
the changed URL while the exact exported action model returns `raise A` for
the same fixture. Source call tracing establishes the missing check; the models
are corroboration, not proof that real PowerShell was executed.

**Required correction:** centralize fresh generated-page/target/token validation
on the path used before every Edge window mutation. Bind it to the same current
page and HWND; do not re-tag an unknown page as a recovery. Audit fullscreen CDP
mutations too, including use of cached sockets after intervening checks. Add an
integration-style injected action test where navigation/target replacement occurs
after binding but before a window action: refusal, no raise/resize/front action.
Checking the socket and HWND helpers independently misses this gap.

**R2 — Unknown captions are silently treated as nonmatches.** In emitted
`QaEdgeSurface.Find`, lines 457–460 skip `n <= 0`, `n > 4096`, and failed
`GetWindowText`. A readable matching window A plus an owned visible window B with
an unreadable or over-limit caption produces `[A]`, which lines 529–533 accept as
unique. The current imports also provide no error distinction between a valid
empty caption and a failed length read. This contradicts the claimed refusal
when owned candidate metadata is unknown.

**Required correction:** preserve successful empty captions as nonmatches, but
distinguish failed/indeterminate/truncated reads and carry uncertainty out of the
enumeration. Refuse to publish/use uniqueness when an eligible owned candidate
could not be classified. Keep errors outside unmanaged callbacks as appropriate.
Test a readable match **plus** an unreadable second owned candidate; testing only
a single unreadable window does not expose false uniqueness. No mutation is
allowed when that mixed set remains unresolved.

**R3 — Receipt generation can expand access after HWND reuse.** In
`Get-QaEdgeWindowReceipt`, line 538 enumerates HWNDs against owned PIDs. Later
`ReadWindow($h)` supplies a fresh owner at 541, `TitleLength($h)` reads the caption
length at 543, and line 544 passes **that observed owner** as a new whitelist to
`Find([uint32[]]@($g.Owner), token)`. If an enumerated HWND is destroyed/reused and
now belongs to foreign PID B, the receipt path can inspect captions of B's windows.
An observed owner is not authorization to extend the owned-process set.

**Required correction:** retain/revalidate the authorized process identities and
reject owner changes before caption APIs. Record a fixed ownership-changed/unknown
row and stop inspecting it; never create a caption-reading whitelist from the
newly observed row owner. Add an injected sequence `Owned -> H owned A`, then
`ReadWindow(H) -> B foreign`; assert **zero caption reads for B**. This must hold
even in diagnostics for a bind that will otherwise refuse.

A separate read-only reviewer independently confirmed these three gaps. Neither
reviewer queried actual windows or inspected live captions.

## Actual checks and evidence

| Check | Independent result | Evidence |
| --- | --- | --- |
| Focused candidate generator suite | 33 pass, 0 fail | [log](generator-checks.txt), [command](offline-command.json) |
| Exact runner text parsing | Zero parse errors | [native receipt](native-prerequisite.json) |
| Isolated C# definitions | All 5 blocks compiled | [native receipt](native-prerequisite.json) |
| Boundary fixtures | 6 scenarios: 2 controls and 4 counterexamples across R1–R3 | [output](counterexamples.json) |

The [counterexample probe](../../../../tests/probes/support/review_edge_identity_counterexamples.mjs)
pins candidate, runner and generator source. R1 combines a source call trace with
actual exported-model calls. R2/R3 preserve the emitted C# `Find` predicates in a
JS replay with mechanical scaffolding/API-return adaptation and literal inputs.
Exit 0 confirms reproduction of the current behavior, **not repair acceptance**.
It is not a native C# execution or evidence that a real navigation, API failure or
HWND reuse occurred. Both Node runs used v24.21.0 with read grants only and no
child-process permission. Reproduction against the exact export:

```sh
node --permission --allow-fs-read="$PWD/tests/probes/support" --allow-fs-read="$REVIEW_EXPORT" \
  tests/probes/support/review_edge_identity_counterexamples.mjs "$REVIEW_EXPORT"
```

The [prerequisite harness](../../../../tests/probes/support/review_edge_identity_native_prerequisite.py)
ran once under normal exact-command approval, `17:56:10.067560Z`–`17:56:11.129945Z`.
It passed the runner text to `Parser.ParseInput` and compiled only its five
isolated `Add-Type` blocks: `QaWin`, `QaArgv`, `QaEdgeSurface`, display admission
types and placement types. **No emitted methods were invoked.** Exit 0, stderr
0 bytes. The receipt records exact block and harness hashes. The complete runner
was not evaluated or dot-sourced; compilation does not validate these runtime
identity paths. No new approval refusal occurred.

QA's 54 wrapper checks and 13 line/order mutants remain author evidence; Support
did not rerun unchanged wrapper/admission/cleanup suites or count those as its own.
The independently run 33 generator checks include author decision models and
line/hash assertions, which pass despite the semantic counterexamples above.

## Pins and preserved boundaries

[Static identity](static-identity.json) independently verifies:

| Object | SHA256 |
| --- | --- |
| Candidate | `d8d87df4c9cc9b32782e634dab963f83ace4960221db19508b4c877c9059f3f8` |
| Runner | `f739487b513cc4f749ac4cc95cfa0a64ba58e23670d9fdc4d14753df4ae3e44f` |
| Wrapper | `5b537bbe2407fa7413c790d022226cfe1bbb2480a58e386a2fcf8ceed2b90bda` |
| Steps | `22654c440365cb6ad2fd2aafe47e0d767d705cd07beea8436f2acff4005ac06a` |
| Surface | `69e38e1bdacf8f4764a9227ebf58177f9959e83f3a03aa428c1b3e8b998be2d2` |

All ten source pins match. The wrapper diff changes only candidate directory and
pins; complete exact-owned cleanup is unchanged. The 32 steps are unchanged after
normalizing initial work-folder paths. Source inversion tests retain the previous
placement runner after removing only the intended emitted deltas. Normal-band,
foreground, display, 16-point checks and bind-time DPI/client-size checks remain;
an identified true-topmost target still refuses. These preserved checks do not
close R1–R3.

Declared production `52be105`, stage identity and surface are unchanged. New
scratch `%TEMP%\lc-qa-tts-output-c28000baefb243218ba3e7287182da30` was absent by
Linux file inspection; stage contents were not freshly re-inspected. Old consumed
scratch/candidate/evidence remain untouched. Edge caption propagation, live API
behavior and actual page/HWND binding remain unverified on a running browser.

Actual GUI/display attempts, live Win32/CIM/process/port/window queries, product
or Edge launches, capture, signals, account/mic/audio/TTS/provider use: **zero**.
One PowerShell invocation performed only the authorized parse/compile prerequisite.
No product/device/real-AI acceptance is claimed. Next owner: QA fixes R1–R3 and
returns regenerated candidate/pins through Lead for the same bounded delta review.
