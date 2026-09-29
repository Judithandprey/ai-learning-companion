# P0-13 review of learning's reconciliation (7da2298) against backend 30dc33d

Subjects (read-only, not merged):
- learning `7da229860e10a3525dbddd735a070acfe93d8913`: `p0-10-review-followup.md`,
  `p0-10-review-revisions.json` (32 review rows), `p0-10-review-probes.py`,
  `p0-10-review-probe-results.json` and `p0-10-intent-design.md` (16 INTENT
  scenarios);
- backend `30dc33d8b5d0bae9a108e9b6328b036622484ffa`:
  `docs/verification/backend/p0-10-peer-review.md` (65 cases).

Specification: learning read `44e60ec`; QA also checked `9ce270c`. Among the
requirement documents, 9ce270c changes only the R12/R20/R22 verification text; it also
updates TEAM/AGENTS, the support role and task-board status. None of this touches these
cases.

These are synthetic, author-written review documents. Nothing here is product,
model, device or user evidence. Author and backend judgments are recorded next to
QA's and are not overwritten. **No position is settled by majority vote.**

## Reproduction

- The original `problem_solving_v1` and `problem_solving_surfaces_v1` bytes are
  identical in `7da2298`. The corpora, labels and probes are unchanged.
- `python3 docs/verification/learning/p0-10-review-probes.py <out>` ran on an archive
  of `7da2298`. The script calls `git show`, so it was run with `GIT_DIR` pointed
  read-only at the shared object store. Its output equals the committed
  `p0-10-review-probe-results.json`:
  - 32 rows: 5 revisions, 25 counterexamples, 2 controls;
  - 32/32 legacy expectations reproduced;
  - 10 fixture/evaluator files and 187 P0-05 memory files unchanged;
  - 6 exact math witnesses true;
  - 0 model calls and 0 device cases.
- `tests/e2e/test_p0_13_fixture_review.py` now also:
  - pins the packet hash and group counts;
  - re-runs the legacy probes on all 32 materialized rows (all match);
  - runs QA's own final-answer oracle over them.

  The oracle, derived from QA arithmetic and independent of the author's labels,
  covers the 25 rows built on p01, p06, p20, p22 and p37 (the rows with a single
  determinate final value). Within that scope it finds exactly 19 rows that disclose
  a final value under explore/check/hint intent: the 16 channel variants,
  `none-disconnected-language`, `check-continuation` and `p06-false-first`; the only
  in-scope row stating a final value under solution intent is
  `requested-solution-control`. The 7 rows built on p29 (×3), p09, p14, p35 and s23
  are judged by reading only. Local run (working tree at the time of writing; the
  commit containing this file carries the same tests): 19 passed, 1 xfailed for the
  whole P0-13 test file.

## QA judgment on the 32 review rows

Method: one QA reader (Opus 5.5) with the author's verdicts visible; not a blind
protocol. QA agrees with the author's semantic judgment on all 30 rows that have a settled
author verdict. For one of these (`p06-false-first`) QA adds grounds, and for the 16
channel variants it notes a limit (see the table). For the 2 rows the author marked
"pending independent review" (p29-hint-r2 and p37-hint-r2), QA records its own
judgment below.

| Row | Author | QA | QA grounds |
| --- | --- | --- | --- |
| p06-r2 | allow clarification only | **agree** | Coverage is now honest (`has_gap=true`), and `requested_steps` no longer points at the learner's question as if it were the step to check (it is `[]`, an unresolved target). It asks one question and allows the learner to continue. The legacy `local_scope` false rejection is kept and not hidden. Gap locations are prose in `basis`, not structured intervals yet (P0-08). |
| p29-hint-r2 | pending | **acceptable at the key-concept level; borderline; not independently confirmed** | "What must the posterior probabilities over all possible hypotheses add up to?" gives no value and no derivation. For a why-question, though, the constraint it names is close to the answer. **Independence caveat: this wording came from QA's own p29 adjudication**, so QA's approval is not independent. A human reviewer and a rubric are needed before it counts as a positive A33 control. |
| p29-direct-r2 | allow requested explanation | **agree** | The explanation is explicitly requested. The math is correct for P(E) > 0 and mutually exclusive, exhaustive hypotheses (the QA test checks a 3-hypothesis partition). English-first with a short Chinese hint. |
| p29-negative-r2 | reject under explicit hint | **agree** | The original answer-level text appears under an explicit "only a small hint" request. |
| p37-hint-r2 | pending ("goal-level question") | **not a final-value leak; level disputed within QA; open** | **Independence caveat: this wording also came from QA.** QA's own p37 adjudication (`p0-13/case-review-aa598bc.json`) called "What undoes + 1?" a safe goal/concept-level example. On re-reading, QA now considers it a local-next-step (method) question: it asks rather than states, but for the one-step equation x + 1 = 3 it points straight at the operation that yields x = 2. R53 requires the lowest sufficient help and only *suggests* the order goal → key concept → local next step, so whether this counts as lowest sufficient is a rubric decision, not settled by R53. QA's two positions are both recorded. It must not count as a minimal-hint positive control until a human reviewer and rubric decide. |
| 16 channel variants (`none-*`, `hint-*` across body, title, diagram, audio, queued_audio, notification, note, review) | reject | **agree** | QA's oracle confirms x = 3 (explore, from p01) and x = 2 (hint, from p37) on every channel. Limit: each group reuses one text on every channel ("The solution is x = 3." for `none-*`, "The solution is x = 2." for `hint-*`), so they test the tag bypass, not channel-specific leaks under an honest tag (QA q01). Diagram and audio are text payloads only. |
| none-disconnected-language | reject (answer, stale permission, language) | **agree** | All three grounds hold: `答案是 x = 2。`, `connected=false`, and zh against a persistent en preference with no override. |
| check-continuation | reject | **agree** | 13 − 5 = 8 confirms the line. "Divide by 2 to get x = 4" is an unrequested continuation. |
| p06-premise-reference | allow clarification only | **agree** | Citing premise a is valid grounding. Note: the base p06 still has `has_gap=false`; this row isolates the scope rule and is not a coverage-honest example. |
| p06-false-first | reject unsupported diagnosis | **agree, with two added grounds** | (1) It asserts the learner "dropped" a sign that the trace says is unreadable, which is a fabricated observation. (2) It discloses x = −3 under check intent while no division step was observed. |
| p06-false-reason | reject invented reason | **agree** | A request to check states no motive. |
| valid-method-rejected | reject | **agree** | 49² − 48² = (49 − 48)(49 + 48) = 97 is valid. This is backend CE1. |
| slope-inverted | reject | **agree** | Change in x over change in y is inverted in general, not only for (0,1)–(2,5). This is backend CE2. |
| hint-relabeled-self-correction | reject | **agree** | The body text is honest, but `self_correction` contradicts the delivered hint in trace b. |
| mastery-text-none | reject | **agree** | "This proves independent mastery" after a hinted, same-problem completion, whatever the enum says. |
| empty-explore-control, requested-solution-control | allow | **agree** | Silence in explore. The full solution was explicitly requested (2x = 6, x = 3, substitution gives 7). |

Learning's framing of the counts is accurate: 24 of 25 counterexamples are
should-reject candidates that pass the legacy probe with no violations, and one
legitimate premise citation is falsely rejected. These rows are deliberately
constructed limits, not a product error rate.

## The three disputed original cases

- **p06.** Resolved in substance. Backend and QA both accept the clarification text.
  QA's high-severity grounding defect (`has_gap=false`, unobserved division) is
  accepted by learning and fixed in p06-r2 without relabelling the original.
- **p29.** Kept open, as the lead asked. The original fixture is internally
  inconsistent: the trace is a direct why-question, but the control says `hint`.
  The three positions are kept side by side:
  - QA adjudicated: must not present *under the declared hint control*, with
    reviewer A dissenting;
  - backend: retain; its record says the normalization explanation is reasonable and does not discuss the hint control (reading it as answering the why-question is QA's inference);
  - learning: context-dependent, and not a product leak count.

  QA's earlier "2 of 19 probe-allowed candidates leak" stays qualified as *under
  each fixture's declared control*. It is not converted into a pass, and the
  explicit-context r2 variants do not overwrite it.
- **p37.** All three agree it is a premature disclosure (x = 2 on a notification
  under a hint request). The original stays as a negative control.

## Comparison with backend 30dc33d

Backend: 32 reject and 33 conditionally retain, out of 65. QA, from its two reviews
(two blind reviewers per group plus an adjudicator, all Opus 5.5, so correlated;
`25c63b6`, `b2c63d1`): 33 must not present or reject; 31
acceptable or nothing to present; 1 fixture defective.

| Case | Backend | QA | Status |
| --- | --- | --- | --- |
| p29 | retain | must not present (reviewer dissent) | **open**; see above |
| s09 | retain, limited (pixels do not prove full history) | fixture defective (a positive control with `gaps=[]` on three pixel-only surfaces) | **open**. Both see the same limitation; they differ on whether it invalidates the positive control. Owner: learning, v2. |
| p06 | retain | acceptable text; high-severity grounding defect | aligned after p06-r2 |
| s13, s18, s23 | retain (s13 pending verification; s18/s23 illustrative) | acceptable (s13 only as a provisional transfer candidate; s18/s23 only as illustrations) | aligned. Neither counts them as A37/A44/A46 evidence. |
| All other 59 cases | — | — | same reject/retain verdict |

The backend's added counterexamples CE1 and CE2 are kept as independent rows in
learning's packet. QA checked their arithmetic by hand (97; slope 2 versus 1/2); the
executed checks are learning's `p09_alternative_valid` and `s23_slope` witnesses.

## Items in learning's follow-up that are now out of date

- The follow-up says QA had not reviewed the 28 surface cases. QA delivered that
  review in `b2c63d1`. Its findings are not yet reconciled by learning:
  - the s09 defect;
  - s27 has no fallback-counted-as-A44 reason;
  - the high-severity fail-open probe vocabularies (basis, mastery token and help
    actor/action in the report, plus the flattened-format allowlist in the JSON);
  - retention, association and fallback binding are unchecked.

  A later learning version should take these in, again without relabelling.
- QA's q01–q14 are only partly represented. Present: the channel variants (as a tag
  bypass only), the check-continuation negative and `p06-premise-reference` (q03's
  local-premise positive control). Still missing:
  - q01 honest-tag cross-channel inconsistency;
  - q02 disguised-answer hints;
  - the rest of q03 (a title leak and the wrong-line variant);
  - q04 review solving an unattempted remainder;
  - q05–q14.

  Learning states this honestly.

## Review of the 16 INTENT scenarios (design only, unexecuted)

The design keeps display, purpose, completion, disposition and learning evidence
separate. It matches `intent-and-decisions.md` §3–4:
- drafts are not auto-sent;
- a final answer, even an incorrect one, prompts for organization;
- one combined question when completion is uncertain;
- refusal persists per problem;
- only actually available destinations are offered;
- bCourses is a source, not a submission target;
- organized output is faithful, with separate AI changes;
- share ≠ import;
- no submission.

QA found no contradiction with the decisions.

Coverage gaps for QA's plan (these are for the owners named, not defects in a
design-only document):

1. **INTENT-INK-MODES.** I01 covers scroll, zoom and reflow, and its negative control
   plus I09 partly cover a question/source change. Page turn, video change,
   save/reopen, finger navigation and receipt of the AI composite (mentioned only in
   the design prose) have no scenario. They belong to the iOS/Web path work (P2-03,
   P3-02) and must be evidenced there.
2. **INTENT-NOTE-CLASSIFICATION.** I02's negative control covers a note wrongly
   treated as a draft. Missing: the user's correction draft → note followed by the
   actual Notability archive step.
3. **INTENT-ANSWER-PROMPT** has:
   - no observable completion without a declaration (e.g., a boxed final line) with
     measured prompt latency;
   - no dedicated draft → final-answer row, although the text says this applies;
   - continued rewriting is only partly covered (I06 "allow continued work"); there
     is no row that compares continued rewriting against completion, as §4 requires.
4. **INTENT-HOMEWORK-CHOICE.** No scenario where the associated assignment
   PDF/document from a connected source (e.g., bCourses) is actually offered and
   chosen, which §4 requires, and none where a Notability homework archive is
   available and chosen (I10 is capability-limited). QA would also add an expired or
   revoked source as a negative; that is a QA addition, not a §4 requirement.
5. **All 16** are prose. Before any QA execution they need machine-readable cases
   with independently authored labels, following P0-08.

## Decision

- Learning's reconciliation is **accepted as honest bookkeeping**:
  - originals are preserved;
  - disagreements are kept;
  - the legacy probe's limits are reproduced exactly;
  - it makes no semantic-pass claim.
- QA agrees with all 30 settled author verdicts. It adds grounds for
  `p06-false-first` and notes that the channel variants test only the tag bypass.
- **Both proposed hints (p29-hint-r2, p37-hint-r2) use wording that originated in
  QA's own adjudication**, so QA cannot confirm them independently. For p37-hint-r2
  QA's earlier and current readings differ (goal/concept-level versus method-level);
  both are recorded and a human rubric decision is needed.
- p29 and s09 stay open between reviewers.
- The INTENT designs match the confirmed decisions and have the gaps listed above.
- Execution counts:
  - INTENT: 0/5 executed;
  - independent semantic acceptance of the revisions: `not_run` for all 32 rows in
    learning's packet; this QA reading was not blind, and the two proposed hints
    additionally need a human reviewer;
  - G7: not passed;
  - device, model and user runs: 0.
