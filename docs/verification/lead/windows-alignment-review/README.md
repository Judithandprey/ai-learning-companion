# Windows QA-WIN-01 correction review — HOLD

Actual owner delivery **85de89e0bf08fc6919801c0465d220d0ed4aa3a7**, parent e586b82,
arrived as **handoff_818bfe2b45f802049f2550ccef477dcf**. It is not integrated.
The finer retained grid improves ordinary scrolling detection and makes legacy
coarse-only ink conservative, but its unproven pointer exception still creates
false alignment and drops a writing context. Author 61 portable /45 native passes
remain author evidence; independent QA-WIN-01 acceptance has not been repeated.

See the [complete independent review](independent-review.md) for exact source locations, controls and the stale author-document clauses to correct.

## Executed negative evidence

[Original probe](original-defect-probes.mjs) executes unmodified candidate
`contentChanged`, `noteContextChange`, `strokeEvidence`, `recheckAlignment`,
`inkMarks` and persistence parsing, using synthetic grayscale frames and a portable
area-averaging canvas. It is a source-path reproduction, not Electron or actual
Windows capture. [Actual output](original-defect-results.txt) contains nine
controls/negative cases. The PASS footer confirms the recorded outcomes, including
the two **defects**, rather than declaring corrected product behavior.

- A no-cursor formula change from `x−1=2` to `x+1=2` changes 6/3,200 retained
  detail cells. The candidate classifies it `spots`, returns `contentChanged=false`,
  retains only frame1/start context with `changes_not_kept=0`, and emits VERIFIED,
  solid ink and `verified:1` in the composed-image marks.
- Adding a separate `1→7` replacement changes 21 cells and has the same result.
  Both changes fit its two 40-DIP boxes, but no cursor exists in either input.
- Unchanged/textured and ±6 luminance controls remain verified; a large content
  change records a second context and marks changed; old coarse-only evidence and
  a pointer over a blank region remain unknown. These controls prevent solving the
  defect by making every input changed or silently discarding old originals.

R08/R46/R51/R52/R59, A26/A30/A31/A44 and §7.1/7.4 require faithful context and
unknowns. Pixel shape/size alone is not cursor provenance. The omission affects
saved source associations as well as the UI badge. Disclosing the heuristic does
not make unobserved pointer attribution or known changed formula pixels verified.

## Same-owner correction, after the current mapper checkpoint

Preserve the finer detail, source images, editable strokes and existing bounds.
Without independent pointer evidence, ambiguous small differences must not produce
VERIFIED. Continued writing across them must preserve the observed context change
or an explicit bounded uncertainty/gap, rather than report only the starting
context and zero omitted changes. Keep missing/plain pixels conservative, current
Stop/freshness checks and legacy readback. Add sign/digit/answer-change negatives
through both comparison and actual overlay context/persistence paths. An actual
pointer case may remain unknown; a universal verified pointer guarantee is not a
requirement. Do not weaken unrelated tests or introduce a tracking framework.

The owner has already started the released Windows mapper after this delivery.
Its active work is preserved. This is one next correction at its safe checkpoint,
not a duplicate mapper or a restart. Lead reviews the repaired exact commit;
then QA gets one focused Windows changed-path pass after explicit display release.
The current user preview, user database and services remain unchanged.

To reproduce the historical defect against the exact candidate:

```sh
# Export 85de89e to an isolated temporary directory first (ordinary git archive).
.tools/node-v24.21.0-linux-x64/bin/node \
  docs/verification/lead/windows-alignment-review/original-defect-probes.mjs \
  /path/to/exported-85de89e
```

The probe asserts the historical bug; later fix checks must require conservative
alignment and retained context instead. Keep this evidence unchanged.

The correction after the active mapper checkpoint was accepted as
**handoff_d2f9be1b33c1024ac5bdb74b26b40619** at pushed
**a0e2fa854084d7bab06e0c5430b2d719930d0079**. No repair or independent Windows
retest is claimed from that delivery receipt.
