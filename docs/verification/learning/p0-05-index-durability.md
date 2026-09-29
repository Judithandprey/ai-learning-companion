# P0-05: atomic derived-index persistence and recovery

2026-09-28. Direct operator continuation under the learning write scope. Read current
AGENTS/TEAM, P0-05, R27–32/R58, §3.2, A09–12, current decisions and the relevant
original-goal cases at coordination baseline `7fdebd87e93b0e863beeef932565b5a3af2dc446`;
all four English/source manifest pairs matched. Parent worktree was clean at
`2b2859e63563808889b900a16e7f77dbf15ab7d5`. Retrieval, evaluation, archive and existing
memory tests match those on that coordination baseline; no merge or reset was needed.

Confirmed before fixing: negative term counts/lengths loaded successfully under a
valid archive fingerprint. Saving used direct `write_bytes`, exposing the target
to partial replacement. The runtime now validates the complete derived payload,
including counts re-derived from original text; rejects malformed/duplicate JSON
members, wrong types/identities/counts/lengths; writes and fsyncs a same-directory
temporary file; then atomically replaces the target. Failed pre-replacement updates
preserve its previous bytes. Strict load is read-only. Explicit `load_or_rebuild`
recovers missing/rejected snapshots; storage errors remain errors. Orphan temporary
files are never promoted. The restart CLI guards originals, including symlink aliases.

## Reproduction and evidence

From the learning worktree (existing locked main venv, read-only execution):

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_index_persistence.py tests/evals/test_memory.py -q
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.learning.evaluate --output /tmp/p005-durability-after
```

**101 passed in 8.14s.** Checks include 30 malformed/inconsistent snapshots, valid
roundtrip, missing rebuild, create/partial-write/flush/fsync/replace errors,
KeyboardInterrupt, actual child-process exit immediately before/after replacement,
ignored orphan files, stale/deleted archives, failed recovery writes and protection
of originals. An initial test stub missed `read_text`'s encoding keyword; that stub
was corrected before the complete passing targeted run.

[Machine evidence](p0-05-index-durability.json) records timings, hashes, counts and
all comparison results. Fresh-process recovery of missing, truncated and malformed
snapshots produced identical index bytes and rankings. All **187 fixture file hashes**
match both the pre-change run and the original time-fix evidence. Across both
candidates, all **160 complete ranked result rows**, including scores, source
citations and failure details, match those runs after excluding latency alone.
Original reports, labels, frozen queries and corpus remain untouched.

Lexical+metadata remains **50/50 exact, 25/30 fuzzy**; failures remain `fuzzy-03`,
`fuzzy-22`, `fuzzy-24`, `fuzzy-26`, `fuzzy-29` (four cross-language zero-overlap and
one paraphrase). Exact/fuzzy p95 search latency in this run: **1.587/1.525 ms**.
Lexical-only remains 50/50 exact, 17/30 fuzzy. No tuning, translation or query-specific
rules were added. Actual provider calls/tokens/paid API cost: **0**.

## Limits

Local filesystem/process-interruption evidence only: directory fsync, power-loss
durability, distributed filesystems and concurrent-writer freshness are not claimed.
Validation re-tokenizes originals, so loading does not promise faster startup.
The library expects a dedicated cache path and validated immutable archive; this is
not a production backend adapter or transactional deletion system. G6 stays
incomplete: Graphiti, semantic multilingual retrieval, live product/device acceptance,
real context compaction and model switching remain unverified. No P0-08 wire fields,
dependencies or source-store changes. Delivery awaits lead integration.
