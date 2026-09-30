# Windows correction review and platform-check evidence

**Current state:** the production corrections through `d6c0551` are integrated
and source-approved; independent actual Windows behavior QA is running on
`061efe2`. The hosted Windows harness failures below are corrected: exact
`e819bfe` run36713802500 passes31 tests/build/package. Earlier HOLD
sections retain the original observations and are historical, not reopened tasks.

Exact corrective delivery **`57dab9721f3cc76830fc386edd754a54cc054ecb`**, parent
`6584ab1`, remains unintegrated. It arrived via
`handoff_cf2ae24c901ae1567bdb8032b224d808` at 2026-09-30 11:07:26Z.
Read `lead-windows-correction-delivery-20260930-1109` and the complete affected
source/English §7.1/7.2/7.4 plus R08/R35/R46/R51/R59 and
A14/A26/A27/A30/A31/A44. This continues the same owner correction, not a new feature.

Two independent source/VM reviews confirm the original W-C1/2/3 repairs and
completed-stroke EIO recovery. Twelve independent lifecycle probes, three sampling
probes and the completed-stroke recovery/context checks pass. Lead repeated these
and all remaining reproductions below on read-only exports. The reviewers also
ran 11 capture and nine ink-focused existing named tests. These execute actual
source handlers with mocked Electron/browser boundaries; no native app, permission
prompt, real screen capture, provider, user preview or DB was used. Author native
35/35 checks remain separately attributed, not independent QA.

## Remaining findings

| Finding | Exact observation and correction scope |
| --- | --- |
| W-C4: close during initial Start | `main.ts:685–694` checks `current` but not reserved `starting`. With prior unresolved ink, close is correctly prevented and no quit is requested, yet late display enumeration completes Start and shows an overlay. Cancel pending startup while preserving the kept-ink choice. The no-kept-ink variant records a quit request in the VM; actual native process-exit ordering for that variant is untested. |
| W-I5, P1: in-progress stroke on Stop | `overlay.ts:734–737` calls only `saveIfChanged()`. Two already-observed pen points are still in the live gesture: `doc === lastSaved`, zero save calls, `stopped(null)`, destroyed overlay and zero recoveries. Preserve/finalize already-observed writing and its context before success acknowledgement, while stopping capture immediately. Do not convert an unfinished ASK selection into a request. |
| W-I6, P2: ASK uncertainty snapshot | `overlay.ts:565–576` draws dashed unknown ink, then awaits encoding. A newer sample verifies alignment during that await; the card recomputes current marks and omits the uncertainty belonging to its image. Pin image, revision and uncertainty metadata together before awaiting. Ordinary composed samples already preserve their marks. |
| W-I7, P2: false picture receipt | `main.ts:373–403` accepts at most 256 pictures but acknowledges all as received. A valid 257-picture document stores 256 actual distinct PNGs, returns `{ok:true,received:true}`, and the renderer clears all 257 pending originals. Use bounded complete transfer or an accurate receipt; retain unreceived originals. A later missing-picture label cannot recover discarded obtainable bytes. |

Sampling provenance also needs an explicit interpretation before producer mapping:
a newer video callback during hashing updates `raw.presented_frames` and age while
the bitmap is still the preceding frame. The probe observes reported count 2 for
a bitmap taken at count 1. Existing comments describe the latest callback, so this
is not a demonstrated wire-contract failure. Retain held-image callback facts
separately from latest stream progress, or explicitly preserve unknown image age;
never use newer callback age to attest that older image's freshness.

## Preserved checks

- [Lifecycle probes](windows-capture-correction-probes.cjs), using the original
  retained [VM adapter](windows-capture-review.cjs).
- [Sampling probes](windows-sampling-correction-probes.cjs).
- [Ink probes](windows-ink-correction-probes.mjs),
  [candidate-derived fake adapter](windows-ink-correction-harness.ts) and
  [actual results](windows-ink-correction-results.json).

Set `LC_WINDOWS_REVIEW_ROOT` to a read-only extraction of exact `57dab97` and run
with pinned Node 24.21.0. Paths/imports were made relocatable; assertions are
unchanged. Ink probes contain expected-bug assertions: exit zero means the stated
defects reproduced, **not** candidate approval. Do not rewrite these observations
to claim the fixed version passed; preserve them and add focused success checks.

Completed-stroke EIO through Stop/overlay-close/app-close preserves exact ink and
PNG, supports exact export/retry, and reports unavailable pictures separately.
Starting-frame and changed-frame crop dataflow is retained; composed uncertainty
draws dashed. Those fixes stay accepted while this bounded follow-up is repaired.
Windows owner keeps `apps/windows/**` and its own evidence; QA retains one
conditional behavior-based pass after Lead review/integration. Content-following,
physical pen/navigation, actual AI, audio and both full §7.1 gates remain open.

The single same-owner correction was sent against published `01240dff25819efe543f61e54d925a95462d555c`, replying to the actual delivery. Accepted native receipt: `handoff_41163a27b822e631477c3f9ef1e81e16`, initially unread and `execution_started:false`. This is delivery confirmation, not repair or a start acknowledgement.

## Follow-up b89bf29: one Stop input race remains

Actual delivery `b89bf29f7313bb1a13f58d8ff2e82558dc4b38b2` arrived as
`handoff_47ce8ef0769c9c62058c99332b989e7c` at 11:46:19Z; ordered read
`lead-web-correction-delivery-20260930-1150`. It remains unintegrated.

Independent actual-source VM checks close W-C4 and the original W-I5 scenario:
16 groups pass for pending Start cancellation, preserving a gesture at Stop,
pointercancel/mode/Open, EIO export/retry, and Stop waiting for its previously
sampled frame. Lead reproduced these and the remaining race below. W-I6/W-I7
also pass eight independently executed source groups: both ASK uncertainty
directions, 257 exact PNGs across batches, IPC failure/retry, all-batch EIO and
recovery Retry, the exact 48 MiB boundary, zero receipts and held-frame facts.
The 29 unit/37 actual Windows checks remain separately attributed owner evidence.

**W-I8, P1 — new writing accepted during Stop save:** hold the first stroke's PNG
encoding, request Stop, then send a second pen-down/move while the visible overlay
is still in WRITE. It accepts and renders two points. Releasing the first encode
produces `stopped(null)` and destroys the overlay with one saved stroke, two
uncommitted gesture points and no recovery. Capture already stopped; the loss is
in the still-enabled editing path. Close new input when stopping begins, while
retaining the pre-stop gesture already being settled. Unfinished ASK/erase must
not become requests/edits. Do not reopen unrelated accepted behavior.

Reproducer: `/tmp/windows-ink-review-reKG0C/lifecycle-review.mjs`, with
`LC_WINDOWS_REVIEW_ROOT` pointing to that exact export and pinned Node 24.21.0.
It executes actual candidate renderer and main handlers with fake Electron/browser
boundaries. Its final expected-bug group reports `blocker:true`; exit zero is a
reproduction, not acceptance. Image probes/results are in
`/tmp/windows-image-correction-review-flam4114`. No native app/provider or user
preview was launched by these reviews.

One same-owner correction was accepted as
`handoff_e3afc6f4e2ea23ba8f8672fff1c1045f`, replying to the actual delivery against
published shared baseline `775436f7870abc786b6b50e0dfb54bf7bff84af0`. Initial
receipt: unread, `execution_started:false`. Lead then integrates a passing delta;
QA keeps its existing conditional Windows behavioral pass, after its active
desktop runtime check.

An inherited first-frame limitation is explicitly retained for producer mapping:
when no presentation callback has been observed, `presented_frames:0` and an age
derived from initialized zero do not establish actual image freshness. The sample
reports `no_new_frame`; that age must remain unknown in any later wire mapping.
This is not an additional repair campaign or a positive freshness claim.

## Final correction approved and integrated

Actual `ffc9eb427838a748ac046112e18e20fc3aab3338` arrived as
`handoff_42b66a665edd764029456a73144a3004` at 11:58:23Z, ordered read
`lead-windows-stop-input-fix-20260930-1159`. The delta closes new pointer and
toolbar/keyboard input after capture ends, visibly disables the tools, preserves
the gesture already being settled and releases pointer routing before waiting
for Stop-save completion. No protocol/dependency/provider change.

Lead reviewed the source/test delta and approved the existing chain:
`6584ab1` → `db60c88`, `57dab97` → `483c11b`, `b89bf29` → `ece5454`,
`ffc9eb4` → **`d6c0551`**. Main compilation/static-file build and all **31 named
Windows tests** pass. Offline install used the committed lock and cached packages
with lifecycle scripts disabled; no Electron process or user preview was started.

Lead also replayed the independent source probes on integrated main: **17 lifecycle
groups** pass with the last race now requiring no second gesture, and **eight
image/receipt/ASK groups** pass. The inherited zero-anchor age remains separately
characterized as unknown. The first temporary probe copy lacked its relative
adapter; after supplying the unchanged adapter it reached an old expected-bug
assertion on the now-absent gesture. Updating that assertion to require absence
made the full sequence pass. No production behavior was altered to pass a probe.

Exact owner Windows runtime evidence remains 37/37 author self-checks. Lead
source/build checks do not replace the ONE existing independent QA original-screen
Windows behavior pass. That is next at the published integrated candidate. No
real provider/audio/content-following or physical pen acceptance is implied.

## Actual hosted Windows failure on 061efe2

[Run 36712629071](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36712629071)
executed on exact `061efe287fd965b5a8fcfeced36f1309c2540e2f` and finished
2026-09-30 12:07:23Z with **failure**. Installation, TypeScript/static-file build,
Electron44.5.1 runtime acquisition and development ZIP packaging succeeded;
the test command passed **29/31**, so the packaged candidate is not an accepted
Windows build milestone. This does not replace the earlier Linux31/31 result.

- `overlay-frames.test.ts:127`: the source-slice anchor containing literal LF
  `/**\n * One sample.` was absent in the Windows-transformed source. The harness
  must handle line endings while preserving the same actual function/assertions.
- `overlay-stop.test.ts:167`: after fixed `flush()` turns and a snapshot of pending
  promises, the expected stopped acknowledgement `[null]` was still `[]`. The
  source-text startup replacement and asynchronous completion ordering need a
  deterministic diagnosis; no production Stop failure is inferred from this
  synthetic result alone, and no assertion may be removed to make it pass.

Same-owner repair was accepted as `handoff_a2ad839970f687a0ddb74fdafc62acf3`,
replying to the actual retained-frame start. Preserve that owner's current work;
repair the bounded harness first, then continue the already assigned retention
segment. Lead reviews the delta before another exact-source hosted run. QA's
existing real Windows behavior pass continues without restart; useful failure
context was delivered as `handoff_6f4bf87a7fcd3e28423288b3062b2919`.

Normal P0 CI [36712476689](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36712476689)
passed on the same `061efe2`; it is not a substitute for this Windows failure.

Independent deterministic reproduction identifies a shared CRLF root cause for
both failures. On a read-only exact `061efe2` export, the Stop harness's LF input
removes startup and ends with ACK `[null]`, one retained stroke and two saves.
Converting only that in-memory source to CRLF makes startup removal silently miss:
the fake page calls `startCapture`, fails on its absent mocked `navigator`, and
sends Stop before the IPC bridge is installed. It starts already ended, never
accepts the test stroke and produces no ACK even after additional microtasks.
This is an invalid test setup, not evidence that increasing waits repairs Stop.
Reproducer/report: `/tmp/windows-ci-review-061efe2/apps/windows/tests/ci-eol-probe.ts`
and `/tmp/windows-ci-36712629071.log`. The exact diagnosis was sent to the same
owner as `handoff_fa40dad88cb1a7a8688647a8486e8982`.

Actual test-only correction **`99ae568e201592d7c724da22380dfc094ed548df`**
arrived at12:14:35Z as `handoff_307ec0b93dd737c1c3ebf65151db5a72`, ordered read
`lead-windows-harness-delivery-20260930-1220`. Five test files only: normalize
source line endings before TypeScript stripping; refuse a missing startup-removal
anchor; await bounded observable Stop/commit/ACK states instead of fixed loop
turns. Original retention/ACK assertions remain; no application source changes.
The author reports31/31 on both LF/CRLF copies,20 repeat focused runs and failure
against pre-fix production source. Those are author evidence pending the focused
independent and actual hosted rerun below. Retention work is preserved and resumed.

Independent exact-source review **approves `99ae568`**: all31 named tests pass
with LF and with a CRLF copy; both Stop tests still fail against pre-fix production
source as expected. Report: `/tmp/windows-ci-review-061efe2/review.md`. This is
bounded source/harness evidence, not a Windows runtime result.

Lead integrates the approved five-file delta as **`8ad77c5`**. Integrated main
passes all31 named tests (`node24.21.0 --test --test-isolation=none`) and the
owner TypeScript/static-file build. The production source remains byte-identical
to QA's `061efe2` candidate. A new Windows-only hosted run follows publication;
the old run's failure remains retained and is never relabeled as passed.

Actual [Windows hosted rerun36713802500](windows-hosted/README.md) now succeeds
on published `e819bfe4c6650c01c72610109725f30bccb82b47`:31 named tests,
TypeScript/static build and the x64 Electron development package. The owner was
given the exact integration/result and its existing retention next action via
`handoff_153ecf3a0dd99fda5019cc7f31b5f797`; no acknowledgment was requested.
The test-harness HOLD is closed. Actual Windows independent QA and the full
screen-to-AI/ink goals remain separate and open.
