# Bounded inventory guard review: QA-L05-02/03

**Approve `13298e6543d402298a25336794d1bdaf6fd75c1a` for integration.** No new
source-protection defect found in the assigned scope. Both reported cases pass
their original QA regressions; supported root aliases and safe outside hard links
remain compatible. Lead must promote the two stale QA expected-failure markers
listed below, preserving test bodies and assertions.

## Exact candidate and scope

- Baseline: main `882431acbd9ac3940628cb031932c48139a19649`.
- Reviewed delivery parent: `b21c8e3e655c81f5acf8d4bc85ac4059f437e5eb`.
- Isolated candidate: `/tmp/p0-inventory-guard-review-oift01i6`, built with
  `git archive` of the exact main baseline and these exact four delivery files:
  `services/learning/evaluate.py`, `tests/evals/test_evaluation_publication.py`,
  `services/learning/README.md`, and
  `docs/verification/learning/p0-05-inventory-guard-repair.md`.
- Metadata: `/tmp/p0-inventory-guard-metadata.json`.
- Main and delivery parent have identical pre-change evaluation/retrieval modules
  and publication tests. No snapshot/context changes were replayed or overlaid.
- Applied committed workflow policy `4a2be79` and PONYTAIL LITE; refreshed affected
  task, R27–32 and original-source/continuity clauses in source and English.
  All four source/English manifest pairs remain current. Previously read unchanged
  global decisions and role boundaries continue to apply.
- No main/worker edits, commits, DB, network, providers or devices. Every mutation
  probe used copied fixtures under temporary directories.

## Review findings

**QA-L05-02 repaired.** Cache exclusion now examines components relative to the
inventory root. A checkout/root beneath an ancestor named `__pycache__` therefore
retains actual originals, while a cache directory inside that root stays ignored.
Fixture inventories before evaluation, before publication and after all owned
writes use `required=True`; the implementation preflight inventory is also
required. A missing, empty or cache-only required inventory raises instead of
attesting vacuous equality. A copied original changed after publication produces
no completion stdout receipt and removes the summary publication marker.

**QA-L05-03 repaired.** The same direct `_inventory_entries` helper feeds hashing
and output-path guarding. It rejects directory symlinks below the root before
consumers can rely on a non-following traversal that omits their descendants.
Nested links and links back to the root reject. Existing output files and reachable
external metadata remain unchanged on this early layout rejection. The root itself
may still be a symlink; this is a supported alias rather than a nested alias.

The change reuses existing path checks and atomic replacement; it adds no separate
inventory service or generalized filesystem framework. Ordinary file-link policy,
output receipts and outside-hard-link semantics are unchanged. The actual alias
and hard-link compatibility controls below passed.

## Actual bounded checks

Existing Python 3.14.4 environment. All commands run from
`/tmp/p0-inventory-guard-review-oift01i6` using
`/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`.

Exactly the 12 new delivery cases:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_evaluation_publication.py -q -k 'inventory_ignores_only_root_relative_cache_parts or required_inventory_cannot_pass_vacuously or empty_required_inventory_prevents_publication or empty_final_inventory_cannot_issue_receipt or inventory_and_guard_reject_internal_directory_links or cli_rejects_originals_behind_nested_directory_links'
```

**12 passed, 55 deselected in 3.48s**, exit 0.
Log: `/tmp/p0-inventory-guard-new-tests.txt`.

Exactly the three original QA cases (normal mutation, `__pycache__`-ancestor
mutation, hidden metadata through a directory alias), with original bodies intact:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/e2e/test_p0_05_index_persistence_qa.py -q --runxfail -k 'copied_original_changed_after_publication or metadata_reached_through_a_symlinked_fixture_directory'
```

**3 passed, 7 deselected in 7.94s**, exit 0.
Log: `/tmp/p0-inventory-guard-original-qa.txt`.

Three targeted compatibility/negative controls:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/e2e/test_p0_05_index_persistence_qa.py::test_restart_probe_outside_control_succeeds tests/e2e/test_p0_05_index_persistence_qa.py::test_restart_probe_hard_link_to_an_original_is_replaced_not_written_through 'tests/e2e/test_p0_05_index_persistence_qa.py::test_restart_probe_into_the_symlinked_fixture_root_is_rejected[alias]' -q
```

**3 passed in 1.47s**, exit 0. These use a symlinked fixture root: a dedicated
outside cache works, an outside hard link is replaced without modifying the source
inode, and writing through the root alias is rejected with originals unchanged.
Log: `/tmp/p0-inventory-guard-compatibility.txt`.

Total: **18 selected passes**. No full 119-case owner run, full prior QA campaign,
or new retrieval-quality benchmark was repeated. The real evaluation invocations
inside the three original QA regressions test publication guards, not a new
quality claim. No review test failed and no code repair was made here.

## Exact marker promotions required

In `tests/e2e/test_p0_05_index_persistence_qa.py` at this baseline:

1. Lines 132–134: remove the `pytest.mark.xfail(strict=True, reason="QA-L05-02: ...")`
   attached only to the `"__pycache__"` parameter of
   `test_a_copied_original_changed_after_publication_never_yields_a_complete_receipt`.
   Keep both `plain` and `__pycache__` cases and all assertions.
2. Lines 143–144: remove the QA-L05-03 strict-xfail decorator from
   `test_restart_probe_cannot_replace_metadata_reached_through_a_symlinked_fixture_directory`.
   Keep its body and source-preservation assertion.

Both now pass under `--runxfail`; leaving the strict markers would make normal
pytest treat those passes as failures. This review did not edit the QA file or
rerun the same cases solely to demonstrate that predictable marker behavior.

## Preservation and limits

The candidate's 187-file source inventory remains
`b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.
Evidence: `/tmp/p0-inventory-guard-preservation.json`.
`retrieval.py` is byte-identical to the main baseline; delivery changes no frozen
fixtures, queries, labels, rankings or original failure reports. Exact
`git diff 13298e6^ 13298e6 --check` passed.

The guard is static. Concurrent path swaps/writers, real bind mounts, APFS and
case-insensitive aliases, directory fsync/power-loss guarantees and caller-owned
stdout redirection remain outside this review. Internal directory symlinks are
explicitly unsupported, not recursively inventoried. No G6/P1 or real source,
provider or device acceptance follows. Lead next integrates the four files,
promotes the two repaired QA markers, and performs the normal integrated checks.
