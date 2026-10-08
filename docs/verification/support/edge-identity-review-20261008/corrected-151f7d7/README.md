# Corrected Edge identity review — 2026-10-08

**APPROVE the R1–R3 source delta at `151f7d741e2b88912a94f0b24473594e236d0076`.**
The specific [prior HOLD](../README.md) is closed. This is the same bounded incident,
Lead card `handoff_9365c461dadc1fbb62d9bb4595be03ba`; no display allocation or retry
is implied. Read the full QA README, artifacts and internal-review record at this
commit, compared actual source with parent `b9ce4cc`, and preserved the original
[counterexamples](../counterexamples.json) and probe unchanged.

## Closure on the actual source paths

Line references are in `candidate-edge-identity-r2-20261008/runner.ps1`.

- **R1:** `Assert-QaEdgeSurfacePage` at 538 checks the cached target/URL/connection,
  evaluates the current URL, generated marker and retained token, then rechecks
  the target. It does not re-tag the page. HWND lookup at 561 calls this before and
  after scanning. The assigned raise path at 943/1152 therefore reaches the page
  check before mutation. Each fullscreen write at 967–971 also revalidates page,
  HWND and the target's CDP window ID. Binding rechecks the page at 627 before
  publishing identity. `windowId` is not used as a native HWND.
- **R2:** `Caption` at 465 distinguishes readable empty captions from length/read
  failure, over-limit and inconsistent reads. `Find` at 477 retains unknown owned
  captions separately. Lookup 565 and bind 619 reject unknowns before accepting
  matches; one readable token plus one unreadable candidate no longer proves
  uniqueness. Two matching windows still refuse. Successful empty-caption chrome
  remains a nonmatch rather than an unconditional startup failure.
- **R3:** Receipt 575 fixes the authorized IDs before enumeration and calls
  `Caption(h, ids, token)` before metadata. A current owner outside that set
  returns `-2` before caption reads; receipt records `owner_changed` and stops
  inspecting that row. Later metadata is discarded if ownership changed. No
  observed owner is converted into a new whitelist.

An independent read-only reviewer confirmed R2/R3 and the retained lifetime,
uniqueness and geometry checks. Parent reviewed the per-action page path and the
cleanup exception. This agreement is not runtime evidence; the checks below are.

## Adapted original regressions and prerequisite

The [new probe](../../../../../tests/probes/support/review_edge_identity_r2.mjs)
pins exact candidate, runner and generator bytes. It changes the old fixture
interfaces, not their failure expectations:

- R1 now supplies nested `{target, page}` with a valid generated-page control.
  The control raises A; the original changed-URL fixture refuses with no action.
  Replaced target, lost token and true-topmost target also refuse.
- R2 extracts **this class's** actual `IsOwned`, `Caption` and `Find` bodies into
  a mechanical JS replay with literal native-API results. It adapts the new
  `Matches/Unknown` result and caption codes. The original failed-read and
  over-limit second window both yield match A **plus unknown B**, hence refusal.
  Empty-caption and two-token controls behave correctly; failed length and
  changing-length cases also remain unknown.
- R3 invokes that same adapted `Caption` against fixed owned IDs: unchanged owner
  is a positive control; the original already-changed foreign owner returns `-2`
  with zero caption reads. The receipt's source path short-circuits this result.

[Regression results](regression-results.json): **13 boundary fixtures passed**,
plus one deliberate residual-race illustration described below. These are source
tracing, actual exported-model calls and scaffolding-adapted C# predicates, not
PowerShell/C# runtime method execution. The original pins-only probe failure is
not used as proof. [Fixture run history](fixture-run-history.json) records an
initial Support extraction error: a whole-file regex selected unrelated
`QaWin.Find`. Scoping extraction to `QaEdgeSurface` fixed the harness; the candidate
and expected boundary did not change. The corrected run exited 0.

```sh
node --permission --allow-fs-read="$PWD/tests/probes/support" --allow-fs-read="$REVIEW_EXPORT" \
  tests/probes/support/review_edge_identity_r2.mjs "$REVIEW_EXPORT"
```

`REVIEW_EXPORT` was `/tmp/support-edge-r2-151f7d7-my6x9fgj`, an immutable exact export.
Node v24.21.0 had read grants only and no child-process permission.

| Independent check on changed source | Result | Evidence |
| --- | --- | --- |
| Focused generator suite | 41 pass, 0 fail | [log](generator-checks.txt), [command](offline-command.json) |
| Exact runner parsing | Zero errors | [receipt](native-prerequisite.json) |
| Isolated C# compilation | All 5 blocks succeeded | [receipt](native-prerequisite.json) |

The existing prerequisite harness changed only revision, runner path and runner
hash. It ran **once** through normal exact-command approval at
`18:51:59.405337Z`–`18:52:00.486718Z`; exit 0, stderr 0 bytes. It parsed runner text
as data and compiled the five isolated `Add-Type` definitions, including the new
`QaEdgeScan`/`QaEdgeSurface` block `bccf532e…`. No emitted methods were invoked;
the full runner was not evaluated or dot-sourced. No new approval refusal occurred.

QA's 54 wrapper checks, 28 mutants and internal reviews remain author evidence.
Support did not repeat unchanged admission/wrapper/cleanup campaigns or count them
as new independent passes.

## Cleanup exception and remaining limits

**`edgeClose` is an acceptable scoped cleanup exception.** Line 1166 obtains the
same cached Edge socket through the unique URL/target/open-connection gate and
sends `Browser.close`, without requiring the title token. On this fixed step path
the successful bind established that connection earlier; the Edge cache is not
removed or reconnected to a replacement target. This permits closing the owned
browser if the token/marker is lost while the URL and cached target still match.
It does not authorize a new page
binding or arbitrary HWND mutation. Exact-owned wrapper cleanup remains the
backstop if the optional close refuses or fails. Do not generalize this exception
to raise, placement, capture or input actions.

**Checks and effects are not atomic.** A page may change after the last successful
check but before a raise/write. A HWND may change owner between ownership check
and caption call. Our explicit race fixture changes ownership after the length
read: `Caption` returns `-2`, but one synthetic foreign text read has already
occurred. Post-check rejection cannot undo that read or an earlier window action.
Thus zero reads/no action is established for the injected changes observable
before their gate, not for every possible OS race. Existing comments about no
foreign reads and QA's “fail closed” wording must be interpreted with this limit.

**Timing is unmeasured.** QA estimates roughly 69 page checks, about 207 loopback
list requests and 69 evaluates. The helper indeed performs three list checks and
one evaluate per successful page validation. Support did not benchmark a live
runner or verify the total dynamically. There is no basis to promise only a few
seconds of added time. The existing 140-second wrapper bound, one-attempt rule and
exact-owned cleanup remain; added latency can consume the attempt and time out.

Caption propagation within 5 seconds, readable owned captions at later lookups,
normal-band fullscreen behavior, foreground success and end-to-end timing remain
browser/device assumptions. The source fix and isolated compile do not establish
a usable desktop flow, product acceptance or the cause of the original popup.

## Exact package and next owner

[Static identity](static-identity.json) verifies all ten source pins, payloads,
unchanged shared helpers and the same 32 steps after initial path normalization.
Wrapper changes are only directory/pins. Lifetime, normal-band, foreground,
16-point, display/DPI and complete exact-owned cleanup protections remain.

| Object | SHA256 |
| --- | --- |
| Candidate | `03344f776afb4ff2110e7450b8c48d86fd0b9d7b394e5473e3ccd7959770cde9` |
| Runner | `301b5053e758938df97059fa52a60715d6ed7d9423a7e44de5e30df681c59dfa` |
| Wrapper | `aad5e81b76e8b329b3c95c6b7ee31359443f6a47ede55312af2ff751fa416816` |

Declared production/stage remains `52be105` and the same 77-file tree. New scratch
`…77fadf1af4554e9dbd361e200b896aaa` was absent by Linux file inspection; the stage
was not freshly re-inspected. Historical candidates/attempts remain untouched.

Actual GUI attempts, live Win32/CIM/process/port/window queries, browser/product
launches, capture, signals and account/mic/audio/TTS/provider use: **zero**.
One authorized PowerShell parse/compile invocation occurred. Lead retains normal
integration and any separately authorized fresh QA allocation; this Support
review is complete and does not authorize another display attempt.
