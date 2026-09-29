# P0-05 inventory guard repair: QA-L05-02/03

Outcome: the evaluation cannot attest unchanged originals using an empty inventory
caused by a `__pycache__` ancestor, or silently accept originals hidden behind
internal directory symlinks. No new layer, dependency, source store or identity.

Read canonical workflow, current P0-05 card, affected original/English R27–32,
A09–12, archive-continuity clauses and decisions at
`4a2be79525e87542b3ca77ac6fd04ecf28b04b6d`; the four translation/source hash pairs
match their manifest. Read QA report and tests at
`eaef4980600f0af28210e1b8412de0a5d9e8078a`. Work starts from Learning
`b21c8e3e655c81f5acf8d4bc85ac4059f437e5eb`, preserving its preceding deliveries.
This implements lead `handoff_6f8fd876fefb4cf90d1a7432f7a3f251` under existing
v0.1 compatibility and Learning ownership; no other worktree or QA file changed.

## Changes and actual checks

`hashes()` now filters ignored components relative to its root. Every required
fixture/implementation inventory in evaluation is explicitly nonempty, including
the final post-write check. A small shared entry-list helper rejects directory
symlinks below the inventory root before either hashing or output guarding can
use an incomplete walk. The root itself may remain a symlink. Nested directory
links are an explicit unsupported layout, not recursively followed; source bytes
and existing outputs remain untouched on this early rejection. File-symlink and
outside-hard-link handling, atomic replacement and stdout receipt semantics stay.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_evaluation_publication.py tests/evals/test_index_persistence.py -q
# 119 passed in 42.72s (107 existing, 12 new).
```

New cases cover root-relative cache filtering with/without a root alias; missing,
empty and cache-only required inventories; empty fixture/implementation inputs;
an empty final inventory after moving only copied originals; nested/cyclic
directory links; and real restart/output CLI rejection of second-level reachable
metadata while preserving old outputs. Existing regressions cover root aliases,
file links, failed/interrupted replacements, restart recovery and receipt hashes.

Copied current runtime/contracts/fixtures plus the exact QA test to temporary
`/tmp/learning-output-retest-1oy8_6wb` and executed:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest /tmp/learning-output-retest-1oy8_6wb/tests/e2e/test_p0_05_index_persistence_qa.py -q --runxfail -k 'copied_original_changed_after_publication or metadata_reached_through_a_symlinked_fixture_directory'
# 3 passed, 7 deselected in 7.51s.
```

The original normal-path and `__pycache__`-ancestor mutation probes both fail
publication with empty stdout and no summary; the nested-link probe leaves its
external metadata intact. `--runxfail` executes the original marked cases normally;
no QA markers were edited. All mutation probes use temporary copies. The real
evaluation runs in those checks are guard regressions, not a new quality claim.

Frozen inventory remains 187 files, SHA-256
`b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.
Queries, labels, original failure evidence and retrieval scoring are unchanged;
the recorded 50/50 exact and 25/30 fuzzy baseline retains failures
`fuzzy-03/22/24/26/29`. G6, semantic retrieval and live product acceptance stay open.

## Limits and next owner

This narrows the earlier output-protection note's "all fixture entries" claim to
supported layouts; internal directory aliases are explicitly rejected. Static
checks still do not prevent concurrent path swaps/writes. Real bind mounts,
case-insensitive/APFS filesystems, directory fsync and power-loss durability remain
unverified. Caller-owned stdout redirection and dedicated output-path selection
remain the caller's responsibility. No providers, services or device operations.
Lead next reviews/integrates the exact commit; QA owns independent integrated
acceptance and any promotion of its expected-failure markers.
