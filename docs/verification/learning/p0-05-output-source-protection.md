# P0-05: source-safe evaluation output publication

Follow-up to QA-L05-01, AG-02, AG-04/SR-02 and SR-03, assigned against
`6e50f749fc8ef7e3bb31451b67a328db507b099b`. Read the complete QA report and test
at `18ec8133216a0554b420ded9dd1a6d65c62b2009`; neither QA file was changed.
The assigned baseline's `evaluate.py` and `retrieval.py` matched this worktree's
starting `a29947705d5c3f8caab0ba2167f829b8c76cb406` exactly. Existing context
commits and branch history were preserved; no reset or forced merge.

## Runtime repair

- All four outputs (`preflight.json`, `report.json`, `failures.json`, `summary.json`)
  use same-directory temporary files, flush/fsync, then `os.replace`. Static
  symlink/nonregular destinations are rejected; outside hard-link names can be
  replaced without changing the original inode. All leaves are checked before
  an existing run is changed.
- The CLI protects literal and resolved archive paths, actual directory
  `(st_dev, st_ino)` identities, and physical targets of **all** fixture entries,
  including non-manifest metadata symlinks. Matching file **and parent directory**
  identities protect externally linked metadata through directory aliases without
  rejecting safe hard links in a distinct outside output directory.
- Library snapshot load/save reject nonregular targets before opening them. FIFO
  and directory errors propagate rather than triggering recovery or blocking.
- A new run removes the old summary marker before writing its preflight; handled
  failure removes the new marker too. Each run gets a distinct ID. Summary binds
  the other three output files by SHA-256. Partial files remain diagnostic only.

**Completion evidence is now explicitly post-write.** Saved report/summary have
`preservation.file_hashes_unchanged: null`; the earlier result is named
`file_hashes_unchanged_before_publication`. Saved summary has
`status: published_unverified`. After the final owned write, the CLI checks the
original inventory and emits a stdout receipt with `status: complete`,
`file_hashes_unchanged: true`, run ID, artifact hashes and saved-summary SHA-256.
It writes no files after that check. Retain successful exit status and this receipt
with matching artifacts. Saved files alone cannot prove the final check ran, even
if a process died immediately after publishing summary. No persisted artifact
misrepresents a pre-write observation as final success.

This changes local evaluation evidence semantics, not shared wire contracts.
Consumers that previously cited `summary.json` alone must use the stdout receipt.
Existing frozen reports are historical evidence and were not rewritten.

## Checks

Environment: Python 3.14.4, Linux 6.18.33.2-microsoft-standard-WSL2, local
case-sensitive filesystem. No dependency installation, provider call, mount or
sudo operation. From the learning worktree:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_evaluation_publication.py -q
# 55 passed
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_index_persistence.py -q -k 'not roundtrip_missing and not cli_protects'
# 43 passed, 9 deselected
git diff --check
```

The new 55 cases cover all four filenames × symlink/hard link; atomic partial
write/fsync/replace failures; failure before/after each publication; unchanged
previous artifacts on initial rejection; a deliberately modified **copied**
original after the final write; matching receipt/artifact hashes; all four metadata
symlinks via literal/physical/parent-alias paths; directory identity aliases;
safe outside hard-link cache replacement; library FIFO/directory rejection;
real CLI exits for four output symlinks and five FIFO paths; and real `os._exit(73)`
before/after new preflight publication with no old completion marker left behind.
Every destructive probe targets temporary copies. Inventories include all 187
fixture files and follow copied metadata symlinks to check external target bytes.

Publication-only tests reuse retained candidate results and stub scoring and the
restart subprocess computation; actual source validation/index construction,
index recovery and file publication still run. These tests are **not** fresh
quality measurements or new fresh-process recovery evidence. CLI rejection and
abrupt-exit cases execute the real runtime in copied layouts. Existing QA
root-alias/restart recovery evidence is reused; the full frozen quality benchmark
was not rerun. The 43 existing persistence checks revalidate malformed/stale
snapshots, source guards and failed/interrupted replacement after the library's
new regular-file check. QA's strict-xfail file was left for QA to revise/re-run.

## Preserved evidence and limits

- Frozen corpus: 187 files; canonical path-to-SHA inventory SHA-256 remains
  `b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.
  Original labels, queries, manifest and failure reports are unchanged.
- AST comparison with the assigned baseline confirms `RetrievalIndex.search` and
  `run_candidate` are unchanged. Retained lexical+metadata results remain
  **50/50 exact, 25/30 fuzzy**, with `fuzzy-03/22/24/26/29` retained. No score tuning,
  new semantic/cross-language retrieval claim, Graphiti comparison or G6 pass.
- Linux symlinks, hard links, FIFO rejection, regular-file atomic replacement and
  process exits were exercised. Bind/case directory identity matching was tested
  with **synthetic identity substitutions**, not real mounts or macOS/APFS. Those
  platform paths remain unverified; the earlier QA bind-mount reproduction is not
  a new owner platform pass.
- Static path checks are not race-proof. No concurrent-writer, directory-fsync,
  power-loss or distributed-filesystem guarantee; abrupt exit can leave temporary
  files that are never promoted. Original inventory checks do not prevent a
  separate concurrent actor from changing originals.
- AG-03's dedicated-path caller contract is unchanged: arbitrary non-fixture cache
  or output locations are accepted, not general project-file overwrite protection.
  There is no new source store, identity, DB/schema, dependency or paid provider.
