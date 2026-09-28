# English working-language adoption

2026-09-28 UTC. Integration began on clean main
`1e8af25ee48ade5ee7baf8f3af732821f2dfa4ed`, after the preceding P0 milestone.
This is the user's requested documentation/working-language change. Existing P0
assignments, application code, contract 0.1.0, models/effort, permissions, budgets,
and all original product goals remain in force.

## Provenance and source drift

The lead fully read `integration-request.md`, `READY.json`, the complete policy,
and the supplied structural/semantic review records under the user-provided local
`work/english-requirements` directory. Only the six named deliverables were copied:
four full English translations, the single policy, and its manifest. No assembly
`*.tail.md` file, historical log translation or replacement backlog was imported.

The packet's source revision is **`d26f85c1f4be52f8de9815e8a7239eb9e2d8fdbf`**.
All four original source files at current main are byte-identical to that revision
and match both READY and the manifest's SHA-256 values. There is **no source drift**,
no source rollback, and no need to relabel a newer overall repository commit as a
new source revision. All Chinese originals and actual user quotations remain intact.

The complete paths and current source/translation hashes are in
[the manifest](../../requirements/english-translation-manifest.json).
[The policy](../../requirements/english-working-policy.md) links all four originals
and English copies and governs future synchronized maintenance. AGENTS, CLAUDE and
TEAM each gain a short policy link; README gains one visible English entry.
Role files are not filled with duplicated bilingual specifications.

## Fidelity review and one precise correction

The packet's completed semantic review was used as evidence, not as a product
acceptance result. Two bounded read-only integration reviews covered the complete
source/translation pairs: main specification plus all 19 original-goal cases;
problem-solving companion plus intent/decisions. Lead additionally read the full
policy and English decision record and checked measurement/phase and provenance
boundaries. Reviews preserve R/A/G/P/V/INTENT/Q/D identifiers, mandatory versus
optional behavior, negative cases, unknown states, numerical targets, phases,
original-screen versus fallback, source retention, the two ink modes, independent
purpose/destination and actual Notability import.

One concrete translation correction was made before integration:

- Companion §7, P1: Chinese source line 204 says **可提供**. Delivered English
  line 206 said “and offer”, making the fallback compulsory. It now says
  “an explicitly identified response canvas / frozen / side-by-side alternative
  **may be offered**.” The original source did not change. The manifest records
  both the delivered hash and the corrected integrated hash with this reason.

No other substantive translation gap was identified. This is a bounded fidelity
review, not proof of translation infallibility, faster models, token savings,
implemented features or successful device/provider acceptance. Future contradictions
must be resolved against the applicable source and later explicit user decisions.

## Actual checks

[Detailed check results](english-working-adoption/checks.json) were produced from
the integrated working tree, independently of the packet's prior checks:

- READY names all four complete translations; source hashes match the recorded
  Git objects and current originals; each final translation matches the manifest.
- Source/English identifier multisets and numeric tokens match after excluding
  the added provenance header. Numbered heading sequences, table row/cell structure
  and explicit anchors match. Counts alone are not semantic coverage.
- Relative link targets and fragments resolve; English copies intentionally retain
  links to the original documents, as their provenance headers state.
- The complete source budget/measurement values and initial-target qualification
  remain. Product R57 and user-facing engineering language remain separate from
  the development team's English working preference.
- `git diff --check` passes. Application, services, contracts, tests, dependency
  manifests/locks and scripts match integration base 1e8af25; no application tests
  were rerun for these documentation changes.

The first local numeric/link comparison included the companion's differently
worded provenance header and reported its commit digits/source link as extras.
Inspection confirmed these were added metadata, not altered limits. The checker
now excludes that labeled metadata consistently across all four copies; the full
document's links remain checked. The optionality correction above is independent
of that check normalization.

## P0 continuity and communication boundary

Existing roles keep their current task and worktree. Workers receive one concise
English native-route notice with the exact committed baseline and reading paths,
for the next safe task/handoff. Dirty worktrees may use `git show SHA:path` without
reset or a clean-tree/fast-forward prerequisite. Adoption belongs in their next
substantive report; no acknowledgement-only response or wait loop is requested.

During integration, an actual Web reply `handoff_ea8994a7fa609209dc3c16df63761ba3`
delivered P0-12 follow-up `4c32e49935bdcbdc01597ea1a684ac8a5fc6dc14` and was read
through its ordered mailbox snapshot. That existing-task result is preserved for
the next review boundary; this documentation task does not mark it integrated or
tested on main. It also confirms Web's actual 9ce270c source reading. The English
notification will not restart the completed alignment or interrupt current QA/iOS.

Formal commit/push and six actual notice receipts will be recorded below once
available. Sending acceptance is not evidence that a worker read or adopted it.
