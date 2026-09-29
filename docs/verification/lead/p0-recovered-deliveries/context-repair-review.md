# Learning context scope repair review

**Approve the bounded production change in
`b21c8e3e655c81f5acf8d4bc85ac4059f437e5eb`.** No introduced correctness or
scope-leakage defect found. Before the normal suite can pass, lead integration
must promote the existing repaired QA strict-xfail case to an ordinary regression
test, preserving its assertions. That expected-failure marker is the only
observed integration gate in this review.

## Exact candidate and authorization

- Baseline: main `885287656d859a246e4edb96de942c51d636e86a`, including the reviewed
  snapshot constructor and correction picks `792081f` / `8852876`.
- Candidate: `/tmp/p0-context-repair-review-hh3l_t3y`, created from `git archive`
  of that exact main, overlaying only these four exact delivery files:
  `services/learning/context.py`, `tests/evals/test_context_repair.py`,
  `services/learning/README.md`, and
  `docs/verification/learning/p0-05-context-scope-repair.md`.
- Metadata: `/tmp/p0-context-repair-review-metadata.json`.
- Delivery parent and main have identical `archive.py`, `retrieval.py`, and
  pre-repair `context.py`; no hidden call-path baseline divergence was found.
- Used committed policy `4a2be79525e87542b3ca77ac6fd04ecf28b04b6d:docs/workflow.md`,
  refreshed AGENTS/TEAM/assigned role/task and affected source/English
  R27–32/R52/R58, A09–12/A38, current decisions and archive-continuity clauses.
  The four source/English manifest pairs remain hash-current. PONYTAIL LITE
  favors this local correction; no new service, contract, dependency or archive.
- Read-only main/worker review. All probe/candidate writes are under `/tmp`.
  No delegation, production edits, commits, DB, network, providers or devices.

## Findings and disposition

**CONTEXT-ACCESS-03 repaired.** The assembler validates hit shape/score/identity,
rechecks access before ranked-hit accounting, then removes any ranked hit lost
during closure. Only eligible hits enter omission arithmetic. Rejected hits are
not reported as budget omissions; original surviving ranks and scores remain.
`scope_filtered` correctly distinguishes a filtered result from a fresh exhaustive
`not_found` result, including an empty result after filtering. This is an internal
context status; no shared wire or scoring contract is changed.

**CONTEXT-ACCESS-01 repaired in the assigned cases.** Accessible correction links
that name the same excluded original support an unresolved-fork label. A single
accessible correction, even with a hidden sibling present, stays
`unknown_filtered_relation`. The excluded original is not rehydrated, and hidden
siblings are not added to context. Descendants retain the fork through accessible
ancestor paths. Original `correction_of` links stay verbatim; no timestamp winner,
reason, confirmation or causal clock order is invented.

**Input/cycle hardening holds in the reviewed scope.** Query vocabulary, scalar
types and UTF-8 JSON encodability are checked before retrieval/evidence access.
Bool/float source-version aliases fail rather than matching integers. Malformed
result shapes, duplicate identities, nonfinite/unrepresentable scores fail with
`ValueError`. Accessible ancestor traversal records visited nodes and rejects a
cycle even when a fork is encountered; it no longer returns a competing label
early enough to evade the cycle check. The cycle test included a three-node cycle
with an additional branch and a timeout guard.

**Observed restore path fails closed.** A relation becoming eligible outside the
assembled eligible set raises rather than exposing an unassembled reference.
This remains a local consistency check, not transactional revocation protection.

**Unknowns and source boundaries remain explicit.** Independent probes planted
unique markers in an inaccessible original's source text/URL, original words,
frame ID, and hidden sibling ID/words. No marker appeared in output; accessor
sentinels allowed only the accessible source version. Unknown reasons, capture
completeness and cross-device order remained unknown; presentation permission
remained `not_granted`. Archive records stayed byte/structure-equivalent to their
pre-call copies.

The latest-source-version rule is unchanged and now documented: a newer empty or
unavailable version can suppress current hits; explicit history still retrieves
accessible older records. This review does not change that product decision.

## Actual verification and runnable evidence

Environment: existing Python 3.14.4 `.venv`, synthetic inputs. From the candidate:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_context_repair.py tests/evals/test_context.py review_context_independent.py -q
```

**145 passed in 6.20s**, exit 0: 75 new owner regressions, 51 existing context
tests, 19 independent probes. Log: `/tmp/p0-context-repair-focused.txt`.
Independent runnable source:
`/tmp/p0-context-repair-review-hh3l_t3y/review_context_independent.py`.

The independent probes cover hidden originals/source metadata/siblings and
accessible descendants at three budgets; all-versus-partly filtered results
across 39 budgets each; extra malformed query shapes; infinite/huge scores; and
bounded three-node-cycle failure. They check exact whole-item byte bounds,
nonnegative and conserved omission counts, retained ranks/scores, no secret echo,
and preserved unknown states. Snapshot constructor suites and the full QA fuzz or
quality benchmark were not replayed.

The first independent-probe collection attempt failed because pytest tried to
stringify the deliberately huge integer into an automatic test ID. Explicit test
IDs fixed the probe only; production code was unchanged. The original collection
error remains at `/tmp/p0-context-repair-probe-collection-error.txt`.

The original QA regression, with its body and marker unchanged:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/e2e/test_p0_09_capture_context_qa.py -q --runxfail -k context_omission_counts
```

**1 passed, 14 deselected in 0.48s**, exit 0.
Log: `/tmp/p0-context-repair-original-qa.txt`.

Running that same selected test with normal markers proves the integration
action: **1 failed, 14 deselected in 0.38s**, exit 1, solely
`XPASS(strict)` for CONTEXT-ACCESS-03. Log:
`/tmp/p0-context-repair-strict-xpass.txt`.
Promote the decorator at
`tests/e2e/test_p0_09_capture_context_qa.py:177`; keep the original assertions.
No QA-owned file was edited by this review or the delivery.

## Preservation

- All **187** frozen originals remain unchanged; inventory SHA-256:
  `b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.
  Evidence: `/tmp/p0-context-repair-preservation.json`.
- `services/learning/retrieval.py` is byte-identical to exact main `8852876`;
  the delivery touches no corpus, query, label or ranking path. No tuning or new
  quality result is claimed.
- Exact `git diff b21c8e3^ b21c8e3 --check` passed.

## Remaining limits

Do not close all QA context findings: long-chain traversal/serialization costs,
greedy item grouping, aggregation of deeper descendant state onto every ancestor,
and full in-memory index-term/time tamper validation remain separate. A cycle
hidden behind excluded evidence is not traversed or globally certified by this
guard. Source/auth acquisition, use-time transaction boundaries, old returned
packet revocation and final presentation permission remain Backend/caller work.

This approval does not clear Backend's independent snapshot-export integrity
work, run provider/model/device continuity, or accept G6/G7/P1 or full
V-ArchiveCompanionContinuity. Lead should integrate the reviewed four files,
promote the repaired QA marker, and run the normal integrated checks.
