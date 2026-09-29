# P0-13 independent review of problem_solving_v1 (37 cases)

Subject: learning delivery `aa598bc20e5b4f4d726ca537b2b0a9a3449b1fef`. The fixture
directory `services/learning/fixtures/problem_solving_v1`,
`problem_solving_policy.md` and `tests/evals/process_rules.py` are byte-identical in
`fb445edda3f96d561c27029075008922d2033eb9`. The 28 `problem_solving_surfaces_v1`
cases added in `fb445ed` are **not reviewed here**. Specification baseline:
`e43293760c70364584cb597ae01d34a261cc52cf` (the fixtures were authored against
`57aee9c`).

This is a review of author-written synthetic candidate texts and labels. It is not
a test of a product, model output, capture path or device. Author labels were not
changed. Structured records:
[case-review-aa598bc.json](p0-13/case-review-aa598bc.json) (first-pass fields
from both reviewers plus the adjudicated verdicts),
[coverage-gaps-and-proposed-cases.json](p0-13/coverage-gaps-and-proposed-cases.json)
and [acceptance-matrix.json](p0-13/acceptance-matrix.json).

## Reproduction

- The manifest SHA-256 values match all three fixture files.
- `python3 tests/evals/process_rules.py <tmp>` (run on an archive of `aa598bc`)
  produces a report equal to the committed `p0-10-rule-run/report.json`: 37/37 rule
  classifications match, and 14 declared violations fall in 12 cases.
- `tests/e2e/test_p0_13_fixture_review.py` reads the pinned commit with `git show`
  and checks: the hashes; 37 unique synthetic test-only cases; that the probe
  reproduces its labels; and a QA final-answer string oracle. Result: 7 passed and
  1 strict xfail (QA-P13-01: A41–A46 have no case in v1).
- QA arithmetic for every determinate problem was done independently, including
  the answer oracle table in the test.

## Method

- Two blind reviewers per group of about six cases. Reviewer A formed a judgement
  before opening the labels. Reviewer B took an adversarial stance toward the
  labels and the probe.
- An adjudicator then re-derived each disputed field from the source and kept
  open disagreements visible.
- All three roles ran on Opus 5.5 (the same model family), so their blind spots are
  correlated. This is a QA perspective, not a human, cross-model or real-user
  certification.
- Review titles and `review_focus` text were visible and may anchor the reviewers.
  A title-blind pass with human raters is recommended before any threshold claim.

## Results

Denominators: 37 cases; 25 cases allowed by the author probe, of which 19 carry
non-empty text.

| Measure | Result |
| --- | --- |
| QA verdict | 17 acceptable to present, 14 must not present, 6 nothing to present |
| Semantic premature disclosure | 9 cases: p18, p19, p23, p25, p26, p28, p29, p36, p37. The probe rejects 7 of them through their tag or metadata. **2 of the 19 probe-allowed non-empty candidates leak: p37 (the author's intended control) and p29 (a new QA finding, with one reviewer dissenting).** |
| Fabricated step or reason | 1: p07 (the probe also rejects it). 0 of 19 probe-allowed. |
| False independent mastery | 1: p35 (the probe rejects it). 0 of 19 probe-allowed. |
| Mathematics | No error in any candidate. Every intentional trace error was confirmed. Beyond the author's labels, p12's visible line `2^2 + 3^2 = 25` is false arithmetic (it equals 13) whose result only coincides with the correct 25. |
| Agreement with the author's labels | 32/37. Disagreements: p07, p12, p29, p32, p37. |
| Reviewer agreement | 19 full, 17 partial, 1 conflict (p29) |
| Retained disagreements | 1 high, 32 medium, 57 low, 30 info |

The fixed-set targets are: zero premature disclosures, zero fabricated steps and
zero false independent mastery.

- If the probe-allowed candidates were product output, the **zero-leak target would
  fail** because of p29 and p37.
- These are author texts, so this is a finding about the corpus and the probe. It
  says nothing about how a generator behaves.
- At product level no case was executed, so product behaviour is **untested**.

## Per-case verdicts

Leak "yes" means the content exceeds the current intent, regardless of its tag.
Probe = the author's structural violations.

| Case | Author acceptance mapping | QA verdict | Leak | Probe | Labels | Main QA note |
| --- | --- | --- | --- | --- | --- | --- |
| p01 | A30 A31 | nothing | no | pass | agree | Empty text passes, but the probe never reads text. `x = 3` tagged `none` also passes, so explore silence is unenforced. |
| p02 | A31 A36 | nothing | no | pass | agree | The gap is not located: `c.parent=a` across the missing b. A fabricated narration of b also passes the probe. |
| p03 | A30 | nothing | no | pass | agree | Undo/redo targets exist only in the text. |
| p04 | A30 | nothing | no | pass | agree | Sibling-branch order is not checked. No visual multi-method case exists for A30's "do not fake three methods from the last frame". |
| p05 | A31 | nothing | no | pass | agree | "Offline" appears only in the title. The resend, no-duplicate and no-restart clauses of A31 are not exercised. |
| p06 | A36 | acceptable (clarification) | no | pass | agree, but **high** | `has_gap=false` despite a blurred sign, and the division step asked about is absent. The local-scope rule forbids citing premise a. |
| p07 | A36 | must not | no | 2 violations | **disagree** | Unlabeled third defect: an `absolute_first` claim on visual-only evidence with a fabricated support id. |
| p08 | A36 | acceptable | no | pass | agree | The reason rule checks only the event kind, so a refusal can be the "source" of a reason. |
| p09 | A35 | acceptable | no | pass | agree | 49²−48² = 97. The valid alternative is correctly not judged wrong. |
| p10 | A35 | acceptable | no | pass | agree | Roots −1 and −5. Completing the square is valid. |
| p11 | A35 | acceptable | no | pass | agree | Digit cancellation that coincides with 1/4 is correctly called invalid. |
| p12 | A36 | must not | no | 1 violation | **disagree** (mapping) | `2^2+3^2=25` is false and the candidate understates it. The `absolute_first` across the gap is the intended violation. A30 and A31 also apply. |
| p13 | A37 | acceptable | no | pass | agree | Mastery labels are not cross-checked against help records. |
| p14 | A37 | acceptable | no | pass | agree | Relabelling to `self_correction` still passes the probe. |
| p15 | A37 | acceptable | no | pass | agree | A relabel between followed-solution, hint-assisted and self-correction passes the probe. |
| p16 | A37 | acceptable | no | pass | agree | The transfer rule reads only author flags. It does not check the trace or the correctness of the work. |
| p17 | A39 | nothing | no | pass | agree | Recording a skip as failure (`mastery_claim='unable'`) passes the probe. |
| p18 | A32 | must not | **yes** (`x = 5`) | 1 | agree | Caught only through the tag. The same text tagged `none` passes. |
| p19 | A32 | must not | **yes** (corrects the method) | 1 | agree | Same tag dependence as p18. |
| p20 | A32 | acceptable (checks only) | no | pass | agree | There is no negative control for continuation, and the A32 sequence is never in one trace. |
| p21 | A33 | acceptable (concept hint) | no | pass | agree | 2x·cos(x²) is not revealed. |
| p22 | A33 | acceptable (full solution requested) | allowed | pass | agree | Explicit request, so a direct full solution is correct. |
| p23 | A33 A34 | must not | **yes** (`x = 8`) | 1 | agree | Cache provenance is not modeled. The same text tagged `hint` passes. |
| p24 | A34 | must not (stale) | no | 1 | agree | The reference process lacks the old and corrected lines. |
| p25 | A34 | must not | **yes** (diagram) | 1 | agree | A `hint` intent carried over a topic switch contradicts the policy that intent is scoped to an attempt. |
| p26 | A34 | must not | **yes** ("three") | 2 | agree | Shows the `none`-tag bypass. |
| p27 | A34 A40 | must not (stale) | no | 1 | agree | Placeholder payload that cannot be reviewed. |
| p28 | A34 | must not (disconnected) | yes\* | 1 | agree | Placeholder payload. \*The definition of a leak under disconnected authority is kept open (owner qa). |
| p29 | A40 | **must not** | **yes**, with dissent | pass | **disagree** | Under hint intent, "The evidence normalizes the posterior across the possible hypotheses." answers the explain-why prompt. Reviewer A judged it a borderline acceptable concept hint. Add A33. |
| p30 | A40 | acceptable (Chinese override) | no | pass | agree | The checked line is absent from the trace. |
| p31 | A40 | acceptable | no | pass | agree | The override lifetime is undefined. |
| p32 | A38 A40 | acceptable (meta) | no | pass | **disagree** | A38 is not exercised: no rebuttal, diagnosis or recovery. |
| p33 | A38 | acceptable | no | pass | agree | The reference process lacks the erased step. |
| p34 | A39 | acceptable | no\* | pass | agree | \*One drafting pass rated disclosure uncertain. Kept open for a human reviewer. |
| p35 | A37 | must not (false mastery) | no | 1 | agree | The probe never reads mastery text. |
| p36 | A32 | must not | **yes** ("Try factoring") | 1 | agree | ASK routing alone is correctly treated as not a teaching request. |
| p37 | A33 A39 | must not | **yes** (`x = 2`, notification) | pass | **disagree** (the A39 mapping is weak) | Confirms the intended blind spot. |

## Systemic findings (owner learning unless noted)

1. **Medium.** The probe never reads candidate text.
   - A `none` tag bypasses `disclosure_level`, `disconnected_authority` and
     `language_scope`. The README documents only p37's hint-tag case.
   - Add "`none` implies empty text or capture status only", and add negative
     controls for every channel.
2. **Medium.** Mastery and assistance labels are not cross-checked against the help
   records (p13–p17, p35). The zero false-mastery target cannot rest on the probe.
3. **Medium.** Reason and diagnosis rules check only event kinds (p06, p08).
   `absolute_first` is rejected only when `has_gap=true` (p07).
4. **High.** Coverage modeling is incomplete (p06): an ambiguous symbol is recorded
   with `has_gap=false`. Gaps are not located (p02). Coverage markers are counted as
   reference steps (p12). Therefore the "71/73 observable entries" figure is an
   annotation, not a retention measure, and is inflated by markers.
5. **Medium.** The corpus overstates its acceptance coverage:
   - No A32 composite in one trace, no visual A30 case and no A31 resend case.
   - A38 appears only in p33.
   - No NAV case (1 ASK) and a single device.
   - Diagram, audio and note payloads are placeholders.
6. **Specification drift.** The corpus is pinned to `57aee9c` and has zero cases for
   A41–A46 (QA-P13-01). `problem_solving_surfaces_v1` must be reviewed separately.
7. **Hygiene.** All 37 cases use the default `requested_steps: ['b']`. In 15 of
   them no step `b` exists.

Coverage gaps and 14 QA-drafted supplemental case specs (q01–q14) are in
`p0-13/coverage-gaps-and-proposed-cases.json`. They are drafts: they are not
adjudicated, not reviewed by learning or a human, and not added to v1.

## Decision

As a structural-probe corpus, v1 is **usable with the limits above**. The fixed-set
semantic acceptance target is **not met**: p37 and p29 are probe-allowed premature
disclosures. G7 and A30–A46 remain unpassed. Product, device and user behavior are
untested. Protocol execution waits for the P0-08 versioned contract and a fixed
runnable integration candidate.
