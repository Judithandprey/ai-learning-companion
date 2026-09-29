# QA retest: QA-L05-01 output source-protection repair at main 27f553e

- **Candidate:** exact main `27f553ee0c5e63364e7e0624ccdaa4509f460709`. It integrates
  Learning `1504509 → 07c684b` and the lead's promotion of the two repaired strict
  xfails. Code and tests are identical in `fc079e9`, which is merged into `team/qa`
  as `b231646`.
- **Reports read:**
  - `docs/verification/lead/p0-output-repair-integration.md`;
  - `docs/verification/learning/p0-05-output-source-protection.md`;
  - the lead's index-output review.
- **Historical evidence:** the QA report and evidence at `18ec813` stay unchanged.
- **Environment:** WSL2 ext4/tmpfs (case-sensitive), Python 3.14.4.
- **Method:** every probe ran on temporary **copies**. No mount, unshare, sudo, real
  originals, DB or provider. The default `/tmp/p005-evaluation` output was not used.
- **Ranking:** `evaluate` runs the frozen benchmark as a side effect. No ranking
  quality is re-measured or claimed.

## Original cases, reproduced independently

Script and output: [exact-retest.log](p0-05-output-repair/exact-retest.log). The layout
matches the original check: `tests/fixtures/memory` is a directory symlink to 187
copied originals.

| Case | 18ec813 / 7b36cca | 27f553e |
| --- | --- | --- |
| `--output` dir with `report.json` **symlink** → `records.json`, beside previous-run files | exit 0; `records.json` overwritten; `file_hashes_unchanged: true` | **exit 1**, `Derived output cannot overwrite fixtures`, **empty stdout**. The inventory is unchanged, the three previous files are untouched, and the link is left in place. |
| `--output` dir with `summary.json` **hard link** → `records.json` (nlink 2) | exit 0; `records.json` overwritten | **exit 0**. The inventory is unchanged and `records.json` is back to nlink 1; `summary.json` is a new inode. The receipt is `complete` with final `true`. `run_id` matches the saved summary and report. `summary_sha256` and the three `artifact_hashes` match the bytes on disk. The saved summary is `published_unverified` with final preservation `null`, and the saved report's final value is `null`. |
| `--restart-probe` alias, physical and new-inside targets / outside hard link | reject / reject / reject / preserved | unchanged: exit 1 ×3 / exit 0 with the inventory unchanged |

## Receipt and failure edges (QA runner that wraps `write_output`)

| Injected edge | Result |
| --- | --- |
| A copied original (`README.md`) is changed right after `summary.json` is published | exit 1 with `AssertionError: Original files changed during output publication`. Stdout is empty and `summary.json` is **removed**. Only preflight, report and failures remain, with report final `null`. No saved file claims final `true`. |
| `os._exit(73)` right after the summary is published | exit 73, empty stdout. The saved summary stays `published_unverified` / `null` (documented: files alone are not completion evidence). |
| Failure after `report.json`, over the output of that killed run | exit 1, empty stdout, no `summary.json`. The new preflight and report share the new run ID. |
| Clean rerun over the same directory | exit 0, `complete` receipt; every artifact hash matches; summary and report share one run ID |

**Observation (info):** in the failed-rerun case, `failures.json` was stale. It came
from the earlier killed run, because the new run failed before writing it.

- It is a JSON list, so it carries no `run_id` and cannot be told apart from the new
  preflight and report by itself.
- Only the missing summary and receipt show that the set is incomplete, which is the
  documented rule.
- Wrapping failures in an object with a `run_id` would make partial sets
  self-describing.

## Regression runs

| Check | Result |
| --- | --- |
| Promoted QA module `tests/e2e/test_p0_05_index_persistence_qa.py` (merged tree) | The lead's 7 tests pass. With the QA additions below: **8 passed, 2 strict xfail** ([log](p0-05-output-repair/qa-module.log)) |
| Owner `test_evaluation_publication.py` + `test_index_persistence.py` (exact copy) | **107 passed**; copied inventory `ecef183e…` unchanged ([log](p0-05-output-repair/owner-tests.log)) |

## Bounded adversarial review

A single reviewer ran five probe sets plus a 62-test suite on copies. A further
infrastructure interruption stopped the process before it returned structured output
and before the verifier stage ran. Its tool log is kept verbatim in
[review-partial.log](p0-05-output-repair/review-partial.log). In place of the missing
verifier, I personally re-ran its two candidate findings on fresh copies
([candidate-verification.log](p0-05-output-repair/candidate-verification.log)).

What held in the reviewer's runs:

- **Probe 1:** in both layouts (directory-symlinked and normal), all four names were
  tried as a symlink and as a hard link, via literal and physical paths, and with
  several links at once.
  - Symlinks were rejected before any previous output changed.
  - Hard links were replaced by name; the original inode is unchanged.
  - Every receipt, run-ID and hash binding matched.
- **Probe 2:** a 199-case guard matrix gave 170 expected rejections and 29 expected
  acceptances, with no original changed. It covered:
  - relative `..`, `/proc/self/cwd` and `/proc/self/root` paths;
  - chained and dangling links;
  - output directories that are symlinks into or out of the root;
  - the parent of the root;
  - all 7 non-manifest files through literal, physical and parent-alias paths;
  - hard links in other directories;
  - FIFO, directory and socket leaves.
- **Probe 3:** failure injection before and after every write, plus
  `KeyboardInterrupt`.
  - Each gave a nonzero exit, no receipt, `summary.json` removed, and no saved final
    `true`.
  - The success receipt matched the saved fields apart from status and final
    preservation.
- **Other checks:** `TMPDIR` inside the fixture root fails safely: the child restart
  probe is refused and the artifacts listing is unchanged. A symlinked repository-root
  alias is rejected.

| ID | Severity | Finding (reproduced by the reviewer and re-run by QA) | Owner |
| --- | --- | --- | --- |
| **QA-L05-02** | **low (contrived path) / false evidence** | `hashes()` drops every file whose **absolute** path has a `__pycache__` component (`"__pycache__" not in p.parts`; pre-existing since `699504c`). When the repository is checked out under such a directory, preflight records **0 fixture files and 0 implementation files**, and the final post-write check compares `{}` with `{}`. If a copied `README.md` is changed right after `summary.json` is published, the run exits 0 with a **`complete` receipt and `file_hashes_unchanged: true`**. The same injection in a normal path exits 1 as intended. A physical-only `__pycache__` behind the directory symlink is fine (187 files). Fix direction: filter on the path relative to the root, and fail when the inventory is empty. | learning |
| **QA-L05-03** | low gap | Entries reachable only through a **directory symlink inside the fixture root** are neither guarded nor inventoried, because `rglob` does not descend into symlinked directories. The layout was `extra → ext1/`, with `ext1/notes.json` a symlink to `ext3/notes.json`: the literal path and the first-level target are rejected, but `--restart-probe ext3/notes.json` replaces the metadata (exit 0). A second-level directory link (`ext1/inner → ext2/`) accepts `--output ext2`, which writes four files that appear under `extra/inner/` with a `complete` receipt. The shipped fixture has no directory symlinks; the owner claims coverage of "all fixture entries". Fix direction: reject directory symlinks in the root, or walk them with cycle protection. | learning |
| OUT-info-1 | info | The receipt is written to stdout after the final check. A caller redirection into an original (`>> tests/fixtures/memory/labels.json`) appends a receipt that claims `complete`/unchanged, and the next run fails to parse `labels.json`. This is a caller-owned write, not an owned write. | — |
| OUT-info-2 | info | With stdout closed, the run exits **0 with no receipt**; a broken pipe or `/dev/full` exits 120. Consumers that follow the documented rule (successful exit **and** a complete receipt) are not misled. | — |
| OUT-info-3 | info | After a failed rerun, a stale `failures.json` from an older run can remain. It is a list with no `run_id`; see the observation above. | learning (optional) |

## Disposition

- **QA-L05-01 is fixed** for its demonstrated paths. Both original copied-fixture
  cases now protect the originals:
  - the symlink case is refused before touching previous output, with empty stdout;
  - the hard-link case is replaced by name, with a correctly bound `complete`
    receipt.
- Saved files no longer claim final preservation.
- Failure edges behave as documented: every handled failure leaves no summary and no
  receipt.
- **Not closed in general:** two new low items remain in the same guard/evidence
  area.
  - **QA-L05-02:** a false `complete` receipt when the checkout path contains
    `__pycache__`.
  - **QA-L05-03:** entries behind directory symlinks inside the root.
  - Both are strict xfail in the QA module.
- **Still unverified:** APFS or case-insensitive filesystems, actual bind mounts,
  concurrent writers and path races, directory fsync and power loss.
- Arbitrary non-fixture output paths remain the caller's responsibility (AG-03).
