# P0-08 consumer assertions — design inputs, not an approved protocol

Status: input review recorded, 2026-09-28 UTC. Contract 0.1.0 is unchanged.
The proposed consolidation is [ADR 0002](0002-process-evidence-and-presentation.md);
it remains subject to bounded owner review, not protocol implementation.
This document records required behaviors for the existing P0-08 design. It does
not complete that task's full ADR, migration plan, shared schemas or acceptance.
Normative baseline: `9ce270cc747676889797199b7e8455ccfef07a5f`.

## Actual source and verification

Backend delivery `45b60858a7400cdb1650aca3cc578688ffe761c3` was read through native
message `handoff_84475408a4b2bf6796cd6d32bafc64bc`. The lead read both committed
review files and Learning's intent-design document with git show. Inputs remain
owned by their authors; this does not silently merge their branches.

Pinned inputs:

- Backend `14d5a7c24b4b6ea83941284f33d44b77722e2d57`: consumer C1–C4 extensions
  and five INTENT schedules, under `docs/verification/backend`.
- Learning `7da229860e10a3525dbddd735a070acfe93d8913`: versioned review packet,
  32 legacy-rule probes and 16 unexecuted INTENT scenarios, under
  `docs/verification/learning`.
- Backend `45b6085`: `p0-10-increment-consumer-review.md` and
  `p0-10-increment-review-results.json` in its verification directory.

Lead static checks passed: 32 unique rows and their recorded outputs agree with
Learning's committed results; groups are 5 revisions / 25 counterexamples / 2
controls; 24 counterexamples have no legacy violation. Ten pinned source hashes
match the original fb445ed bytes; both process fixture trees and the memory tree
are unchanged. This lead check executed **no evaluator or product test**. Backend
separately reports actual delta reproduction, not full-65 re-execution. Neither
matching legacy output nor absence of a rule violation establishes semantic safety.

## Required composed traces

The identifiers below belong to the cited documents, not shared protocol IDs.
Keep originals and causal relations; wall-clock last-write-wins cannot substitute
for user intent when messages are delayed or devices disconnected.

| Existing sources | Required positive/negative trace for future consumer tests | Ownership and evidence |
| --- | --- | --- |
| L:I08/I09; B:I03 | Q1/O1 prompt shown → O2 edit → explicit O1 refusal arrives late: suppress unsolicited Q1 prompts; it must not suppress Q2. A causally later explicit reopen can supersede refusal; last arrival alone cannot. Unknown ordering stays restrictive/unknown. Lost display ACK cannot justify repeated prompts. | Lead relationships; Backend persistence; Learning scope; iOS/Web actual presentation; QA races. Preserve original prompt/refusal/reopen and display outcome. |
| L:I12/I15; B:I05 | A layout-only request or help withdrawal races with an AI-answer-bearing preview. Check current permission before title, preview, image and audio presentation. Asking for content-change approval after showing the answer is too late. Faithful permitted organization of original work remains available. | Final presentation owner checks current authority; Backend retains exact version and actual partial playback. Candidate/generated/suppressed content is not exposure. |
| L:I13/I16; C1-V16, C1-C2-V17, C2-V20, C3-V13 | Q1/A1 exposure precedes Q1/A2: an empty A2 receipt list must not imply unaided work. A delayed receipt or semantic correction invalidates dependent committed/in-flight mastery claims without replaying help. Explicit deletion invalidates dependent claims but preserves independent A2 originals; never retain deleted content secretly. Unseen Q2 is a separate negative control. | Learning evidence and Backend derived-state invalidation; Lead dependency links. Unknown/deleted evidence is not proof of no help. Display, AI-input and import receipts remain separate. |
| L:I05/I09/I14; B:I02/I04/I05 | Purpose/revision correction, organization cancellation or target revocation wins before dispatch: block stale external work. External action wins first: preserve its actual or unknown historical result. A late receipt binds that export/version, not the current draft. Reconcile before any duplicate-risk retry. | Backend lifecycle and native/web destination adapter; QA both causal orders. Do not claim remote undo, successful import, new exposure or reading from a generic callback. |

These are required composed assertions from existing designs, not four newly
observed runtime defects or newly unresolved product decisions. They support
R53–R55/R58, the confirmed final-answer/export decisions, A34/A37/A38/A46 and
related INTENT cases. None has been executed by this review.

P0-08 must next reconcile these with platform/Web proof and stop boundaries,
define the full evidence/authority relationships and compatibility plan, then
supply an exact versioned implementation baseline. The current input mapping
does not authorize workers to invent new 0.1.0 fields or duplicate the source corpus.

## Locator correction and actual follow-up

Learning intent-design line 5 cites §7.9, which does not exist at its cited 44e60ec
baseline. The lead confirmed this against both Git objects. The body already
preserves the intended behaviors; the locator should reference §§7.7/7.8.

An incremental message was accepted on Learning's currently granted native route:
`handoff_e38dd2d2803469d72a76d3791efdf6b7`, accepted true, duplicate false,
unread and execution_started false. It supplies this review as input to the
already-running follow-up and requests the locator correction in that delivery;
no new task, full-suite rerun or acknowledgement was requested. Backend's
completion message was not acknowledged. No new user decision is needed here.


Learning then delivered `53300c86a9d642c661270574b139a3076d812f9c` and
`45ce5677198a428b66db6c3a3cb8b6f38372682a` through actual messages
`handoff_68513b95ab7ff15a32af4a6a8e982363` and
`handoff_8fa295c1ce677a0000f69d50c62cfcfa`. The lead read the full consumer review
and the follow-up diff. Thirteen design entries were reviewed by Learning, zero
transactions executed; its five minimal relationship groups and J1–J4 counterexamples
feed ADR 0002. Four schedule cross-references were added without copying the corpus.
The erroneous §7.9 reference is confirmed fixed to §7.8 in the actual 53300c8 diff.
These completed follow-ups were not acknowledged or assigned again.
