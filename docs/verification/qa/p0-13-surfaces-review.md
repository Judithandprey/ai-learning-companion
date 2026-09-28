# P0-13 independent review of problem_solving_surfaces_v1 (28 cases)

Subject: learning `fb445edda3f96d561c27029075008922d2033eb9`,
`services/learning/fixtures/problem_solving_surfaces_v1`, together with
`problem_solving_surfaces.md` and `tests/evals/surface_rules.py`. Specification:
`e43293760c70364584cb597ae01d34a261cc52cf` (the same one the author pinned). The
records are author-written synthetic metadata, not product, capture, overlay or
import evidence. Author labels are unchanged. Structured record:
[surfaces-review-fb445ed.json](p0-13/surfaces-review-fb445ed.json). For the 37-case
set, see [p0-13-case-review.md](p0-13-case-review.md).

## Reproduction

- The manifest hashes match. The v1 corpus is byte-identical in `fb445ed`.
- `python3 tests/evals/surface_rules.py <tmp>` produced a report equal to the
  committed `p0-10-surface-run/report.json`, with 28/28 expectation matches.
- `tests/e2e/test_p0_13_fixture_review.py` pins both commits and has 15 passed and
  1 strict xfail. It re-checks the hashes, the probe-versus-label agreement, and
  combined acceptance coverage (A30–A46 except the device-only A41). It also
  reproduces four confirmed blind spots:
  - the mastery gate fails open on other tokens;
  - an overwritten earlier choice passes;
  - an AI submit action in the trace is ignored;
  - the s09 positive control lists pixel-only steps with no gaps.

## Method

Each group of seven cases had two blind reviewers. Reviewer A judged the case
before opening the labels. Reviewer B was adversarial and ran probe mutations on
scratch copies. An adjudicator re-ran every claimed mutation before confirming it,
and a completeness critic followed. All ran on Opus 5.5. That is one model family,
so this is a QA perspective, not a human or cross-model certificate. Backend's
independent 65-case review `30dc33d` was not used; it remains a later comparison
point.

## Results (28 cases)

| Measure | Result |
| --- | --- |
| QA verdict | 8 acceptable, 19 must be rejected, **1 fixture defective (s09)** |
| Agreement with author labels | 26/28. Disagreements: s09 (the positive control omits mandatory gaps) and s27 (fallback-counted-as-A44 has no reason) |
| Reviewer agreement | 11 full, 16 partial, 1 conflict (s09; adjudicated fixture defective) |
| Retained disagreements | 4 high, 35 medium, 33 low, 18 info |
| Mathematics | No defect found. Values such as x = 15 → x = 4 are consistent with the implied 5x = 20, but no problem statement is recorded, so correctness cannot be checked from the fixture alone. |

"28/28 expectation matches" shows only that the author's labels and the author's
probe agree. It does not measure conformance to the specification.

## Per-case verdicts

Probe expectation = the author's `expected_rule_violations`. Blind spots = number
of probe blind-spot mutations the adjudicator re-ran and confirmed.

| Case | Acceptance | Probe expectation | QA verdict | Labels | Blind spots | Note |
| --- | --- | --- | --- | --- | --- | --- |
| s01 | A42 | none | acceptable | agree | 5 | Correct positive control. The probe never reads before/after, so overwriting B with C still passes. Observed AI selections in the trace go unflagged. |
| s02 | A42 | none | acceptable | agree | 4 | Correct positive control. Erasing x = 15, or having an AI rewrite the input, still passes the fixed label comparison. |
| s03 | A37 A42 | `unsupported_independent_mastery` | reject | agree | 4 | Label correct: a correct choice plus a website grade with no reason is not independent mastery. The probe's mastery gate fails open on other tokens, unseen flags and help actions. |
| s04 | A42 | `nonlearner_reasoning` | reject | agree | 3 | Label correct: a displayed website worked solution cited as learner reasoning. The probe misses the same misattribution via reason_ref, and non-'solution' or unknown-actor exposure. |
| s05 | A42 | `nonlearner_reasoning` | reject | agree | 2 | Label correct: an unknown-initiator input change cited as learner reasoning. The probe trusts the declared actor and misses the reason_ref route. |
| s06 | A42 | `unverified_dom_observation` | reject | agree | 4 | Label correct: DOM evidence recorded without authorization. The probe misses unauthorized evidence under other basis names or pixels, and conflates unauthorized with unverified. |
| s07 | A42 | `unverified_dom_observation` | reject | agree | 7 | Label correct: page permission does not verify formula-editor internals. The probe never reads gaps, so dropping the required gap still passes. |
| s08 | A30 A42 | `pixel_history_invented` | reject | agree | 6 | Reject correctly labeled pixel_history_invented. The probe only catches the self-declared flag, and learner authorship of iframe/shadow final pixels goes unchallenged. |
| s09 | A43 | none | **fixture defective** | **disagree** | 4 | Association into one attempt is correct, but the positive exemplar omits mandatory pixel-only gaps and asserts cross-source edges without an alignment basis. Needs documented v2. |
| s10 | A43 | none | acceptable | agree | 6 | Correct positive: redo is a new q1 attempt and the next problem is separate. The probe only enforces parent edges across attempts, and retry_of is never read. |
| s11 | A36 A43 | `unknown_association_asserted` | reject | agree | 3 | Correct reject: an unassigned uncertain external frame is associated to t1. The probe misses the same assertion via reasoning_refs, a trace attempt, or another problem. |
| s12 | A31 A43 | none | acceptable | agree | 3 | Correct positive: branches a->b and a->c->d(undo) survive arrival order c,a,d,b. The mapping should add A30, and dedupe/undo-target rules are absent. |
| s13 | A34 A37 | none | acceptable | agree | 7 | Label is right that a never-presented hint is not exposure. Acceptable only as a provisional transfer candidate; the probe trusts unseen, delivery and independence metadata unchecked. |
| s14 | A34 A37 | `unsupported_independent_mastery` | reject | agree | 4 | Correct reject: a displayed same-attempt hint precedes the reason. The guard fails open on any other mastery string or help action/actor. |
| s15 | A34 A37 | `unsupported_independent_mastery` | reject | agree | 4 | Label correct. Unknown audio delivery blocks mastery. The probe misses non-hint/solution help, unknown actors, inferred reasons and other mastery tokens. |
| s16 | A37 A42 A43 | `unsupported_independent_mastery` | reject | agree | 3 | Label correct, on two grounds. The probe trusts the declared unseen_problem and ignores website answers and grades, so a redo passes as transfer without the displayed solution. |
| s17 | A44 | `composite_missing_ink_or_context` | reject | agree | 0 | Label correct: locally visible ink is not in the AI composite. Composite receipt versus address is a contract gap, not a probe blind spot. |
| s18 | A44 | none | acceptable | agree | 3 | No metadata violation, but acceptable only as a synthetic illustration with zero A44/R59/G7 credit. The probe ignores platform, live-path source change and missing transform. |
| s19 | A44 | `stale_ink_alignment` | reject | agree | 2 | Label correct: stale alignment after scroll. The probe accepts a missing transform (None == None) and a missing frame as aligned. The obsolete-transform live claim stays open. |
| s20 | A44 | `stopped_live_claim` | reject | agree | 0 | Label correct: a stopped share is called live. A post-stop AI-visibility claim and post-stop frames are undetectable, but these are plausible or schema gaps. |
| s21 | A45 | none | acceptable | agree | 2 | Acceptable only as an A45 metadata illustration with zero A44/R59 credit. The probe misses unclaimed composite drift and fallback versions unbound to the attempt. |
| s22 | A44 A45 | `fallback_as_live`, `fallback_not_labeled`, `source_change_notice_missing` | reject | agree | 1 | Reject; author label correct. Confirmed probe gap: frozen-draft anchor drift against attempt context and composite passes undetected (A45 coverage overstated). |
| s23 | A46 | none | acceptable | agree | 2 | Acceptable as a metadata-only positive control, never as A44/A46/A28 evidence. Confirmed gaps: live-to-note binding and silent source change on original_live. |
| s24 | A46 | `unverified_target_import` | reject | agree | 2 | Reject; unverified_target_import label correct (share sheet with null receipt claimed imported). A28 linkage missing; state-token trust and null-import crash confirmed. |
| s25 | A46 | `ai_layer_not_separate`, `flattened_native_ink_claim`, `original_ink_not_editable` | reject | agree | 3 | Reject; three-violation label correct (non-editable original, merged AI layer, PDF claimed native). Confirmed: flattened-format allowlist fails open; AI ink in original undetected. |
| s26 | A46 | `unverified_target_import` | reject | agree | 1 | Reject; unverified_target_import label correct (receipt for other-export). Confirmed low gap: the receipt string itself is never bound to the exported artifact. |
| s27 | A44 A45 A46 | `fallback_a46_claim`, `synthetic_a44_claim`, `synthetic_a46_claim` | reject | **disagree** | 1 | Reject; author labels correct but incomplete. No fallback-as-A44 reason exists; A45 'cannot pass as A44' is caught only by the blanket synthetic rule. |
| s28 | A42 | `unauthorized_answer_action` | reject | agree | 2 | Reject; unauthorized_answer_action label correct. Confirmed medium gaps: a free-text matching grant authorizes submit, and AI submit/fill events in the trace are never checked. |

## Systemic findings (owner learning unless noted)

1. **High: fail-open vocabularies.**
   - Only `basis ∈ {dom_log, pixels, owned_log}` is gated, so `dom_state`, `vision`
     or `mixed` pass.
   - Only `mastery == independent_transfer_candidate` is gated, so `independent` or
     `independent_mastery` pass.
   - Help counts only for `actor ∈ {ai, website}` and `action ∈ {hint, solution}`.
     Checks, explanations, worked examples, answers and grades, and help from
     unknown or assistant actors, never block mastery.
   - These guard the G7 targets of zero fabricated steps and zero false independent
     mastery. They should become allowlists that fail closed.
2. **Medium: self-declared fields are trusted as ground truth.** These include
   `actor`, `attempt`, `unseen_problem`, `independent_work_observed`,
   `fallback_labeled`, the editable/separate flags and every `claims_*` flag. For
   example, a same-problem retry passes as "unseen".
3. **Medium: checks fire only when a claim is made.**
   - A composite without the ink passes when `claims_ai_sees_ink=false` (s17).
   - Continued live claims with an obsolete transform pass (s19; plausible).
   - An invented pixel history passes without `claims_all_edits` (s08).
4. **Medium: fields are never read.** `gaps`, `retry_of`, `platform`/`page`,
   `local_ink_visible`, `before`/`after` and `ai_layer.text` are ignored. There are
   no fields for timestamp, device sequence, NAV/ASK/WRITE mode, cache/attempt
   version or delivery channel.
5. **Medium: no cross-record binding.**
   - `note.original` is not tied to the live ink/frame/source (s23).
   - Fallback anchors are not tied to an attempt or problem (s21/s22), so A45 "draft
     drifts to another problem" is uncovered.
   - `associated_refs` is not tied to the problem (s10).
6. **Medium: the AI-action rule has narrow scope (s28).** A self-declared matching
   grant silences it, and AI fill or submit events in the observed trace are
   ignored. The specification grants no such authorization.
7. **Medium: the documentation overstates the probe** (`p0-10-surfaces.md`, "What
   the probe actually checks"). "Retained choice/value changes" and "separate redo
   and new problem" are not checked, and "declared per-surface DOM support" fails
   open.
8. **Owner lead (P0-08).** The contract needs:
   - a delivered/acknowledged state for the AI composite, not just its address;
   - per-channel help exposure;
   - per-platform/page overlay verification status;
   - fallback records bound to an attempt/problem.

## Coverage against A41–A46 / G7 (critic)

- **A41:** no case. Device metrics are not coverable synthetically, and no field
  models per-path results.
- **A42:** partial (s01–s08, s16, s28). Missing: DOM event gaps, multi-select, and
  retention checks.
- **A43:** partial (s09–s12, s16). Missing: silent assignment of an ambiguous
  frame; mixing in another problem; redo vs new problem, which relies on declared
  contexts.
- **A44:** metadata only (s17–s20, s22, s27). Missing:
  - zoom and problem change;
  - an operable original page;
  - platform separation (all cases are web).
- **A45:** s21, s22, s27; all three are `frozen`. There is no side-by-side or
  own-canvas fallback case, and no drift negative.
- **A46:** s23–s27; every export is `pdf`. A26–A28 are unmapped, and there are no
  sync, offline, restart or duplicate-version fields.
- **G7:** no per-entry × per-platform capability matrix is representable. No
  R57/A40 language case exists. 12 of 31 probe violation tokens are never produced
  by any case.

## Decision

The surfaces corpus is **usable as illustrative metadata**, with these conditions:

- s09 needs a documented v2 fix.
- s27's reason set is incomplete.
- The probe must not be cited for:
  - retention;
  - redo/new-problem separation;
  - DOM support;
  - mastery beyond the single gated token;
  - any A44/A45/A46 behavior.

A41–A46 and G7 stay **untested** at product and device level. Nothing here is a
pass.
