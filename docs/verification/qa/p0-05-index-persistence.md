# QA check: Learning derived-index persistence and source protection at main 7b36cca

- **Candidate:** exact main `7b36ccbaf86879f2a7518f39e419a345e136ade8`, which includes
  Learning `8cdf0c2 → 42359be` (atomic snapshots and recovery) and `5678714 → 0fd95f0`
  (resolved-root guard).
- **Reports read:** `docs/verification/lead/p0-scheduling-followthrough.md`,
  `p0-05-index-durability.md` and `p0-05-index-root-alias-fix.md`.
- **Test copy:** a `git archive` in `/tmp/qa-7b3/repo`. Every probe ran on temporary
  copies; the repository's real fixtures were never used as a target. `team/qa`
  merged the candidate normally (`4e81025`).
- **Environment:** WSL2 Ubuntu 26.04.1 (ext4 and tmpfs, both case-sensitive), Python
  3.14.4.
- **Scope:** local filesystem and process-exit behavior only.
  - Directory fsync, power loss, distributed filesystems and concurrent writers are
    **not claimed** by the owner and **not tested** here.
  - No paid provider, DB, device or full frozen-benchmark rerun beyond the owner's
    own tests.

## Reproduced

| Check | Result |
| --- | --- |
| Owner tests `tests/evals/test_index_persistence.py tests/evals/test_memory.py` (exact copy) | **109 passed** ([log](p0-05-index-persistence/owner-tests.log)) |
| Lead's exact case: `tests/fixtures/memory` is a directory symlink to copied originals; `--restart-probe tests/fixtures/memory/records.json` | exit 1, `Derived output cannot overwrite fixtures`; 187-file inventory unchanged |
| Same via the physical original path, and a new file inside the aliased root | exit 1 each; inventory unchanged |
| `--output tests/fixtures/memory/eval-out` (alias) | exit 1; inventory unchanged |
| Outside control `--restart-probe <tmp>/out/index.json` | exit 0, signature `b5922ddd…`; inventory unchanged ([log](p0-05-index-persistence/exact-repro.log)) |
| `--restart-probe` path that is a **hard link** to an original | exit 0; the original keeps its bytes, because `os.replace` swaps the name instead of writing through |

The reviewers also confirmed these hold:
- 68 malformed, stale or altered snapshots are rejected by strict load, and valid
  equivalent snapshots load.
- SIGKILL at five stages of `save` (before the write, mid-write, after the write,
  after fsync, before the replace) preserves the previous index bytes, and orphan
  temporary files are never loaded.
- `--restart-probe` killed before fsync or before the replace and then rerun
  recovers.
- Storage errors propagate in the library and the CLI: read-only directory, path is
  a directory, missing parent, simulated ENOSPC.
- `evaluate`'s recovery loop runs fresh processes.
- `..` traversal and relative paths are guarded.
- Per-file symlinks for **manifest-covered** fixture files make `FixtureArchive.load`
  fail closed.

## Findings

Every finding was reproduced by a reviewer and re-run by an independent verifier;
QA-L05-01 was also reproduced personally. Full record:
[review-findings.json](p0-05-index-persistence/review-findings.json).

| ID | Severity | Finding | Reproduction → actual | Owner |
| --- | --- | --- | --- | --- |
| **QA-L05-01** (AG-01/SR-01) | **medium (QA) / low (both verifiers, on likelihood)** | `evaluate --output <allowed dir>` writes `preflight.json`, `report.json`, `failures.json` and `summary.json` with `write_bytes`/`write_text`, which follow a pre-existing **symlink** or write through a **hard link** at those names. `derived_path` checks only the directory. The last three files are written **after** the before/after hash check, so the run overwrites originals, **exits 0 and records `file_hashes_unchanged: true`**, which is false evidence. Destroyed originals are not restored. QA rates it medium because of the false preservation record; the verifiers rate it low because it needs a pre-planted link. | symlink `report.json → records.json`: exit 0, `records.json` now starts `{"task": "P0-05", …` ([log](p0-05-index-persistence/file-alias.log)). Hard-link `summary.json`: exit 0, overwritten. A reviewer overwrote `records`, `labels` and `queries` at once, and the run reported preservation true. | learning: write the outputs atomically (temp + `os.replace`) or refuse existing links; run the preservation check after every write |
| AG-02 | low | If a **non-manifest** fixture file (for example `labels.json`, `queries.json`, `manifest.json`, `README.md`) is itself a symlink out of the root, its literal in-tree path passes the guard, and `--restart-probe` replaces the physical original (exit 0). Manifest-covered files fail closed. | reviewer script; the physical `labels.json` became index JSON | learning: also compare file identity with fixture files, or check the unresolved parent |
| AG-04 / SR-02 | low (gap) | The guard compares resolved path strings. A **bind-mount** alias of the fixture root passes, and `--restart-probe` replaced `records.json`. A case-variant path (`tests/fixtures/MEMORY/…`) is accepted by the guard; on case-insensitive **APFS (macOS)** this would probably alias the originals. That case was **not tested** here (ext4 is case-sensitive). | bind-mount reproduction; case-variant accepted at the guard level | learning: `(st_dev, st_ino)` identity check; verify on macOS |
| AG-03 / SR-04 | low / observation | Only `tests/fixtures/memory` is protected. `--restart-probe <any existing non-index file>` replaces it with index JSON (for example `services/learning/retrieval.py` or a committed evidence JSON; mode becomes 0600). `--output docs/verification/learning/p0-05-time-fix` overwrites the committed baseline that the reports compare against. The owner documents a "dedicated cache path", so this is not a broken claim. | reviewer script; files are git-restorable, but uncommitted work at such a path would be lost | learning / lead: decide whether a guard is wanted |
| SR-03 | low | A failed `evaluate` rerun leaves a mixed output set: a new `preflight.json` next to the previous run's successful report and summary. | reproduced | learning |
| SR-05, SR-06, AG-05 | info | Abrupt kills accumulate 0600 orphan temporary files (documented); a FIFO at the index path blocks forever; a TOCTOU window exists between the guard and the write (concurrency is unclaimed). | — | — |

## QA regressions

`tests/e2e/test_p0_05_index_persistence_qa.py`: **5 passed, 2 strict xfail**.
- It builds temporary copies and runs the real CLI.
- It covers the three rejected alias targets, the outside control, the hard-link
  restart probe, and QA-L05-01 for both symlinks and hard links.

## Decision

- **Holds for the claimed scope:** the lead's exact root-alias reproduction rejects,
  outside controls succeed, interrupted or malformed snapshots preserve the previous
  bytes and rebuild only the derived index, and storage errors propagate.
- **Not closed:** QA-L05-01 lets a derived `--output` destroy originals while
  reporting success and "hashes unchanged". It should be fixed before the report
  file's preservation fields are cited as evidence.
- The other items are low gaps or observations.
- No directory-fsync, power-loss, distributed-filesystem or concurrent-writer
  guarantee is established.
- The ranking figures (50/50 exact, 25/30 fuzzy) were not re-measured here.
