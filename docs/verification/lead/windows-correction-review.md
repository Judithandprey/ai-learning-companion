# Windows correction review: further changes required

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
