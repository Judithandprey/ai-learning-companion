# P0 delivered reviews, Web repair integration and next boundary

2026-09-28 UTC. Started on clean main `d26f85c1f4be52f8de9815e8a7239eb9e2d8fdbf`.
PONYTAIL LITE applied with full requirements, original records and necessary tests.
No model/effort, permission, dependency, contract version or worker worktree change.

## Actual mailbox results

Native inbox/list/read succeeded; each relevant ordered snapshot ended with
`has_more=false` and `unavailable_count=0`. The six useful messages and their
actual IDs, reply bindings and bodies are retained in
[native read results](p0-review-integration/native-read-results.json).
No completion receipt was acknowledged and no existing assignment was duplicated.

| Owner delivery | What was actually read / disposition |
| --- | --- |
| Support `7cb905723d40525ff5269ffa3bb0a38b6a579229` | Full six-risk report; integrated as `6b9be9a`. One concrete DT-G3-10 wording conflict and one known p37 rule blind spot; six integration experiments all unexecuted. SUP-01 delivered, Support idle. |
| QA `ebc42e059798b8327fa67da2f2cc6e2e2f9e3081` | Full reconciliation report and delivery; original 65 cases unchanged, 32 legacy expectations reproduced by QA, 19 final-value disclosures found by its bounded oracle in 25 decidable rows. These are constructed counterexamples, not product error rates. Report/test integration remains separate. |
| iOS `3f131670b93af208e04838004854bba477d14928` | Actual diff/plan/checklist and bounded read-only second review: the three prior design issues are addressed. Two narrow corrections below remain; no device result or integration claimed. |
| Learning `0b2a25a0f2facb9261fe3691dcc53ef1895a7d10` | Full ADR consumer review: no design blocker in five relationships/J1–J4. All actual help/uncertainty, causal refusal and receipt distinctions must survive the formal contract. Source report remains on the worker branch. |
| QA `b82def6cf802cd02a9d6c7be549724d4118e1a4b` | Full three-trace ADR review, integrated as `f10e1c7`. T1–T3 corrected below; zero protocol, concurrency, provider or device executions. |
| Backend `9e60468dac27ca2b77dc9202324b51d0230026fc` | Full four-area ADR review, integrated as `7832b1b`; no design blocker, with replay/association and tombstone lifecycle constraints preserved below. |

QA ebc42e0's semantic reading was not blind. Both proposed minimal hints originate
in earlier QA wording, so its agreement is not independent confirmation. p29
request/control conflict, s09 coverage labeling and p37 minimal-hint level remain
open rubric/evaluation items. Preserve all earlier judgments; no new product
interview or model majority vote is needed to keep them unaccepted. INTENT, V,
phase backlog, actual models/devices/imports all retain their unexecuted status.

## P0-08 design disposition

[ADR 0002](../../adr/0002-process-evidence-and-presentation.md) now incorporates:

- **QA T1:** export/share is a final disclosure boundary too. Every included AI
  layer is rechecked against current permission and the exact manifest. Answer
  organization cannot hide a solution in preview and export it anyway. Actual or
  possible external exposure affects later same-question evidence; unknown reading
  is neither proven reading nor proof of unaided work. Existing classroom-note
  archival permission retains its scope without per-stroke confirmation.
- **QA T2:** linked legacy AI writes and reads cannot bypass the new boundary.
  Preserve original bytes/CAS/history; restricted reads need an explicit guarded
  path, never silent mutation of the saved note. Check associations before replay
  shortcuts, with both edit/association commit orders and unassociated v1 controls.
- **QA T3:** record server-known intent and synchronization knowledge. Unordered
  offline retraction versus presentation remains unknown, counted separately and
  invalidating affected judgments. A connected presenter does not prove all other
  intent sources are synchronized; no promise of database/pixel atomicity.
- Explicitly prohibit AI website answering/submission and retain unknown
  refusal/reopening as restrictive. Add the separate INTENT-INK-MODES trace.
- **Backend:** new sequence namespace stays separate; unresolved evidence remains
  unresolved in ACKs. Dependency closure includes shared artifacts. Inseparable
  legacy mixed-source deletion stays 409 without partial effects. Minimal tombstone
  retirement requires fenced old replay/restore paths, not TTL alone.

The owner review round is complete. The lead can now commit the separate formal
schema/auth/HTTP/ACK/error/compatibility baseline; current implementation remains
0.1.0. These corrections are design dispositions, not executed proofs or a released
0.2.0 protocol. No second confirmation round is required before ordinary schema work.

## Platform follow-up in the existing cards

iOS 3f13167 addresses retention versus stop, real provider-input evidence and
behavior-based A44 in prose. Two remaining issues will be sent together once:

1. Opening a share sheet must keep the file prepared, with a separate panel-open
   fact; it cannot record a successful share. Actual completion, cancel, failure,
   unknown and target import remain distinct. Preserve attempt history on cancel.
2. P0-03 DT-G3-10 must distinguish another source initially off (stay off) from
   another enabled source (continue). R02's no-send assertion is scoped to the
   stopped path, not every device; A16 still applies.

Web P0-12's two ambiguous plan statements also need one scoped alignment: stop
ends that path's live sending, while independently authorized pre-stop history
sync follows P0-08; normal video progress should not erase screen-fixed scratch
every tick. ADR §7 proposes retaining visible original video context within the
same known problem, with separate changed-question/uncertain-placement handling.
This is an engineering rendering choice, not a new user preference or permission.
Both modes still need real touch, save/reopen and actual AI-composite evidence.

No build/cloud purchase or provider call is enabled here. The iOS report's 48
matrix rows, 23 mutation rejections, 42 tests and 43 unrun device cases remain
owner-reported. Independent report/code review is not real iPad, A44 or A46 acceptance.

## Web P0-02 implementation milestone

Reviewed `cdc354c15c6382db4410045b54cdb36073c8e62b` and its Astra review
`903b3230993cd104966f3408ce57a03a0d64a8fe`; integrated as `638f32f` / `fc67bae`.
F1–F6 cover cancellation, frame ASK binding, immutable mark-time selection,
late-result suppression, snapshot time before hashing and eigenvector fixture math.
All top/frame bundles must be built together. Existing history was preserved.
Allowed child-frame messages are still not production authentication; pixels,
packaged extension, native bridge and iPad/Pencil remain unverified.

Lead executed these checks with integrated code at `7832b1b` (only ADR prose was
dirty; application/schema/dependency files match that commit):

| Command / artifact | Actual result |
| --- | --- |
| `bash scripts/check.sh` | **433 passed / 13 strict xfailed**, generated type/OpenAPI checks, root TypeScript and module build pass. Existing QA-03–11 remain open. [Log](p0-review-integration/main-check.log). |
| Pinned Node `--test --test-isolation=none apps/safari-extension/tests/*.test.ts` | **48 named tests passed**; root module runner reports seven test files instead. [Log](p0-review-integration/web-unit.log). |
| Pinned Node reads `p0-02-r2-peer-probes.mjs` | **15/15** independent DOM/event-double cases pass; not a browser/device run. [Result](p0-review-integration/lead-r2-peer-results.json). |
| `browser-check.mjs`, Edge, owned fixture only | **46/46** synthetic browser checks. Initial WSL localhost forwarding returned `ERR_CONNECTION_REFUSED`; the harness's single visible retry succeeded. [Result](p0-review-integration/lead-r2-selftest.json). |
| `trusted-check.mjs`, Edge CDP | **37 pass**, zero failures; touch scroll and pinch are **unverifiable** because their baseline controls are unsupported. No iPad/Pencil claim. [Result and screenshot names](p0-review-integration/lead-r2-trusted.json). |
| `validate_evidence.py` on new browser output and capabilities | **14 submitted bundles / 20 capability rows**, zero validation problems. Shape validity is not capability verification. |

Both browser harnesses completed in foreground and cleaned up their temporary
servers/profiles. This is lead reproduction plus the separately recorded Astra
review; the exact-main QA follow-up is separate. No full application tests were
repeated merely for the ADR changes. Formal commit/push and handoff receipts are
appended after they actually occur.
