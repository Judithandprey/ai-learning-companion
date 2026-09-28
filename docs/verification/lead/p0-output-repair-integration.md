# P0-05 output source-protection repair integration

2026-09-28 UTC. Starting main `66f21b9193819f56775527bf54f860aa6c6bf062`.
Actual native delivery `handoff_757110736dcfe9978ffb7c260ead9390`, replying to the
existing repair `handoff_ee50c8b9efb97596254985166eccb697`, supplies Learning
`150450928ae14f2e29079d952f6d995f8e9edfb0`. Integrated normally as
**`07c684bcdacc7396c0f1abfc8b9473141f5e728c`**. No reset, dependency or shared-wire
change; original failure evidence in [the previous review](p0-index-output-review.md)
and the QA report is retained.

## Reviewed behavior

The lead read the complete changed call flow, owner report and new tests.
Two bounded read-only reviews checked path safety/publication and existing
consumer compatibility independently. Both found no integration blocker.
[Owner evidence](../learning/p0-05-output-source-protection.md) distinguishes
stubbed publication checks from actual CLI/process checks.

- All four output files use same-directory temporary writes, flush/fsync and
  replacement. Static symlink/nonregular leaves reject before touching previous
  output; outside hard-link names are replaced without changing original inodes.
- Literal/resolved paths, directory identities and the external targets of all
  fixture metadata are protected. Library FIFO/nonregular snapshot checks fail
  before opening them. Valid dedicated outside cache/output locations remain.
- Starting a publication removes the prior summary marker; handled failure removes
  the current marker. Run IDs and artifact hashes distinguish partial/old outputs.
  A process interrupted after summary publication may retain an unverified summary.
- Saved report/summary final preservation stays null; summary status is
  `published_unverified`. Only **after all owned writes**, the final source hash
  check permits a `complete` stdout receipt with matching run ID and artifact/
  summary hashes. Consumers need that receipt **and successful exit**; saved files
  alone do not attest completion. Existing callers parse stdout and remain
  compatible; historical saved evaluation evidence was not rewritten.

Static guards are not concurrent-writer/path-race guarantees. Owner directory
identity tests simulate bind/case aliases; no actual mount or macOS/APFS validation
was performed here. Directory-fsync, power-loss and distributed guarantees remain
unverified. Dedicated arbitrary non-fixture paths remain the caller's responsibility.

## Actual checks

| Check | Result and limit |
| --- | --- |
| All four Learning test modules on integrated main | **215 passed in 56.79s**: publication, index persistence, memory and context. [Log](p0-output-repair-integration/learning-check.txt). |
| Original QA regression before promotion | **5 passed, 2 strict XPASS** (exit 1): both old defect expectations now succeed. [Original output](p0-output-repair-integration/qa-before-promotion.txt). |
| Promoted QA regression on main | **7 passed in 6.95s**. Only the repaired shared xfail marker was removed; added actual refusal/empty-stdout checks and successful hard-link receipt/artifact hash binding. [Log](p0-output-repair-integration/qa-promoted.txt). This lead rerun is not independent role-QA acceptance. |
| Separate guard review | All four filenames × symlink/hard-link, seven non-manifest files through literal/physical/parent aliases, chained/dangling links and usable outside directory alias. 187 copied originals preserved. [Probe results](p0-output-repair-integration/guard-probe-results.json). |
| Separate publication review | 15 targeted existing lifecycle cases passed; no full frozen-quality evaluation. |
| Source and ranking preservation | Main's 187 originals match retained preflight; canonical inventory SHA-256 `b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`. Search/run_candidate AST unchanged. [Actual check](p0-output-repair-integration/preservation-check.json). |
| Source/English policy consistency | All four source/translation hash pairs match the committed manifest; no requirement text changed. |

Publication-only tests reuse retained rankings and stub scoring/restart computation,
while real copied-layout CLI/process regressions exercise publication and rejection.
Existing regression execution is not a new ranking benchmark or quality claim.
The retained 50/50 exact, 25/30 fuzzy and five named failures remain historical
results. No full unrelated application suite, DB or provider run was repeated.

## Status and next action

The demonstrated QA-L05-01 paths and related bounded output/metadata guards are
implemented and locally verified. Independent role-QA retest remains pending;
request it once at a safe boundary after the ongoing capture/QA-14/context review,
not by interrupting or restarting that review. Keep all original reports and
unverified platform limits. Learning's context and the shared formal contract
dependencies remain unchanged. No G6/G7, device/provider or P1 acceptance follows.

Ordinary push and actual native follow-up receipts are recorded after publication.
