# P0-13 historical checks: portability to fresh clones

`tests/e2e/test_p0_13_fixture_review.py` reviews learning deliveries that are not
ancestors of main: `aa598bc`, `fb445ed` and `7da2298`. Previously it read them with
`git show` and **skipped** 18 checks when the objects were missing, which is the
case in a fresh CI clone of main.

## Change (QA scope only; no production, fixture or label change)

- **Archive.** `tests/e2e/sources/p0_13/` is an exact-source archive:
  - 21 pinned `(commit, path)` entries stored as 13 content-addressed blobs (the v1
    fixture files are byte-identical across the three commits);
  - `manifest.json` records the original commit, path, SHA-256 and size of each
    entry;
  - `build_archive.py --write` rebuilds the archive from the Git objects;
    `build_archive.py` alone verifies it.
- **Reads.** Every read verifies the blob hash. When the clone has the original Git
  object, the read also compares it byte for byte. A missing entry or a hash
  mismatch **fails**; nothing skips.
- **Drift check.** A new test requires any frozen fixture or review-packet file that
  is later integrated at its original path to be byte-identical to the pinned
  version.
- **Fresh-clone simulation.** `QA_P013_ARCHIVE_ONLY=1` forces the fresh-clone path.

## Evidence

| Run | Result |
| --- | --- |
| Local worktree, Git objects present | 21 passed, 1 xfailed (intended strict xfail QA-P13-01), 0 skipped. Archive: 21/21 entries cross-checked against the original Git objects, no problems. |
| Same, with `QA_P013_ARCHIVE_ONLY=1` | 21 passed, 1 xfailed, 0 skipped |
| **Fresh clone.** `git clone --no-local --single-branch --branch team/qa` at `24eb97a`; `git cat-file -e` confirms all three learning objects are absent | 21 passed, 1 xfailed, 0 skipped; `build_archive.py`: 0 cross-checked, no problems ([fresh-clone.log](p0-13-portability/fresh-clone.log)) |
| Tamper control in the fresh clone: one byte of the v1 `cases.json` blob flipped | 4 failed, 8 errors, all naming `archive blob drift` for the three commits' `cases.json`; `build_archive.py` exits 1 ([tamper-control.log](p0-13-portability/tamper-control.log)). The blob was restored afterwards and verified clean. |

The original source SHAs are retained in the manifest and in the test constants.
If the learning deliveries are later integrated into main at their original paths,
the drift test enforces that they stay byte-identical. The archive and the
cross-check then become redundant but harmless.
