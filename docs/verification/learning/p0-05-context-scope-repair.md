# P0-05 bounded context scope repair

Implements lead `handoff_ca8db1656947f400557333cfcaeb57e2` after the separate
snapshot compatibility correction `fbeaf65be185b42c1573f19668b64d2345626922`.
Reviewed QA `bd79ca4` capture/context report, findings and executable checks
against main `fc079e9a704acd0e5fe25e095f56e57a13d31f48`, current decisions and
R27–32/R52/R58/A09–12/A38 plus V-ArchiveCompanionContinuity source/English intent.
This changes only Learning context assembly, its documentation and eval tests.

## Runtime changes

- CONTEXT-ACCESS-03: recheck ranked hits before closure/budget accounting; count
  only eligible hits. Excluded hits are not budget omissions. Internal retrieval
  status `scope_filtered` reports that the original result was filtered, including
  an empty eligible result, without asserting a fresh exhaustive no-match search.
  Surviving original ranks/scores and whole-item budget order remain unchanged.
  Malformed result structures, duplicate identities and nonfinite scores fail
  with `ValueError`. An observed revoke/restore that produces an eligible relation
  outside the assembled set also fails closed. Rejected IDs/text are not echoed.
- CONTEXT-ACCESS-01: two accessible corrections' own links to the same excluded
  original establish `competing_branches_unresolved`. The excluded original and
  hidden siblings are not rehydrated; a single accessible link stays unknown.
  Original `correction_of` pointers remain verbatim. No correction winner,
  confirmation or audio semantics are inferred.
- Ancestor traversal detects cycles, including a cycle with a fork, and raises
  `ValueError`. Query shape/types and UTF-8 JSON encodability are checked before
  retrieval/evidence access. Bool/float source-version aliases are rejected;
  valid Unicode, escaped controls, nullable filters and exact UTC bounds remain.
- Documents/tests the existing latest-version rule: a newer source snapshot with
  zero observations, incomplete processing or unavailable access can leave current
  results empty. Older records require explicit history; they are not revived as
  current. No ingestion-completeness claim is introduced.

## Completed verification

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_context_repair.py tests/evals/test_context.py tests/evals/test_archive_snapshot_runtime.py -q
# 142 passed in 2.68s: 75 new bounded regressions, 51 existing context tests,
# 16 runtime snapshot compatibility cases.
```

The new cases include malformed queries/results, all/mixed scope rejection at two
budgets, visible forks across time/project/version/access filtering with a hidden
sibling, observable scope restoration, forged cycles with a bounded test guard,
and all nine source access states for a newer empty version. Evidence-access
sentinels check rejection before rehydration where applicable.

Copied QA's original test from `bd79ca4` into the temporary composed main tree
`/tmp/learning-runtime-export-c54ft_tl`, overlaying the current `context.py`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest /tmp/learning-runtime-export-c54ft_tl/tests/e2e/test_p0_09_capture_context_qa.py -q --runxfail -k context_omission_counts
# 1 passed, 14 deselected in 0.40s.
```

`--runxfail` executes the original expected-failure check as an ordinary test;
no QA repository file or marker was edited. No full QA fuzz/budget run is claimed.

The four committed context examples reproduce byte-for-byte using the existing
recipe in `p0-05-context.md`; canonical example SHA-256 remains
`40d7f90cbaf85321236fab2c99551e0ddae168fd8c5c0a529475c52d3e4783fe`.
All 187 frozen corpus files retain inventory SHA-256
`b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.
No retrieval scoring, fixtures, labels or original failure evidence changed.
Quality was not re-measured: the recorded metadata baseline remains 50/50 exact
and 25/30 fuzzy, with failures fuzzy-03/22/24/26/29 (four cross-language zero-overlap
queries and one paraphrase). No semantic multilingual/G6/product acceptance claim.

## Remaining boundaries

Long-chain traversal/serialization cost and greedy whole-item packet grouping
remain separate work. Resolution follows direct children and accessible ancestors;
it does not aggregate every deeper descendant's state onto every ancestor.
Full revalidation of mutated in-memory index terms/times is not added. The guards
do not establish concurrent transactional authorization, revoke already-returned
packets or grant presentation permission; snapshot acquisition/use fences remain
backend-owned. No provider, paid API, live device or service was exercised.
