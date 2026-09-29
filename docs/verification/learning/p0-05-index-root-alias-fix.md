# P0-05 follow-up: protect a relocated fixture root

Parent: `8cdf0c20fc8d948e93a44ed96531a58eb46b85ff`. Lead review request:
`handoff_6cf997e4bd702673be3ef4c5bbd38ee6`. This normal follow-up retains the
original delivery and its evidence; no reset, amendment or contract change.

The lead found that `derived_path` resolved the destination but compared it with
an unresolved `FIXTURES`. When `tests/fixtures/memory` itself was a directory
symlink, `--restart-probe` could replace relocated `records.json` with index JSON.
This invalidates the initial delivery's source-protection claim for that layout.
The ordinary `--output` entry used the same defective guard.

The guard now resolves both paths before checking equality/containment. The new
regression copies runtime modules/contracts and all 187 fixture files into temporary
directories, links the temporary fixture root to the temporary originals, and invokes
the real `python -m services.learning.evaluate` CLI. The real corpus is never moved.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_index_persistence.py tests/evals/test_memory.py -q
```

Before the fix, the first new CLI regression failed because the restart command
returned 0 on an original-record destination, independently reproducing the review.
After the fix: **109 passed in 12.46s**. Eight new CLI cases cover both entry points:
symlink alias, physical original path, a new location inside the archive, and an
allowed sibling with the same name prefix. Six original-archive destinations reject
with the specific source-protection error; both outside destinations succeed. Each
case verifies that every original file's bytes remain unchanged, in both the
relocated copy and actual frozen corpus.

The successful outside evaluation also matches all 160 untimed result rows in
`p0-05-time-fix/report.json`, including scores, citations and failure details.
Lexical+metadata remains exact **50/50**, fuzzy **25/30**, with the same five failures
(`fuzzy-03/22/24/26/29`). All 187 original hashes match; inventory SHA-256 remains
`b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.

No ranking, corpus, labels, source archive, shared schema or dependencies changed.
No provider calls. This closes the static directory-symlink path regression tested
here; the original delivery's other limitations and incomplete G6 remain unchanged.
