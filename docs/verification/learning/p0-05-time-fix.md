# P0-05 UTC comparison correction

Parent delivery: `699504c8dea0a9a4c7089781f15e2931baa0f926`, branch
`team/learning`. Shared contract remains v0.1.0; no dependency or contract changes.
This is an incremental fix for the lead's P2 review, not a new retrieval candidate.

## Defect and resulting behavior

The original implementation compared UTC strings. Although contract timestamps
end in `Z`, their optional fractional seconds make lexical order unreliable:
`2025-01-03T00:00:00.500Z` is later than `2025-01-03T00:00:00Z`.
The old correction validator rejected this valid sequence, and an exclusive
`before` bound at the fractional instant wrongly excluded the earlier event.
Equivalent spellings also need to compare equal.

`services/learning/timestamps.py` now derives a comparison key from validated
calendar seconds and normalized fractional digits. Trailing zeroes are removed
from the comparison key only, so `Z`, `.0Z` and `.000Z` identify the same instant.
Fractional digits are never converted through float, datetime microseconds or a
bounded decimal context. This preserves ordering beyond six or 28 digits, and
avoids Python's decimal-to-integer conversion length limit. Lowercase `t`, which
the contract accepts, is supported. Original timestamps are not rewritten.

Archive correction validation and retrieval's inclusive `after` / exclusive
`before` filters use that key. The index caches parsed observation instants and
parses query bounds once per search. Persisted term counts and index format stay
unchanged. BM25 constants, tokenization, fixtures and labels were not modified.

## Regression evidence

39 new regression cases were added to `tests/evals/test_memory.py`. Against the
unfixed parent implementation, the expanded learning suite produced **17 failed,
40 passed in 0.78 s**. After the fix, the complete contract + learning run produced
**99 passed in 0.86 s** (42 contract + 57 learning).

Coverage includes the lead's original fixture query, legal fractional-second
corrections, reversed/equal correction instants, all nine pairs of `Z`/`.0Z`/
`.000Z` representations for both filter boundaries, seven- and 21-digit ordering,
equivalent high-precision fractions, 5,001-digit fractions, midnight rollover,
lowercase `t`, and preservation of original timestamp spelling.

Executed with the existing shared environment, without installing dependencies:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest packages/contracts/tests tests/evals -q
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.learning.evaluate --output docs/verification/learning/p0-05-time-fix
```

Portable reproduction from a checkout with the locked environment:

```sh
uv sync --frozen
uv run python -m pytest packages/contracts/tests tests/evals -q
uv run python -m services.learning.evaluate --output /tmp/p005-time-fix-reproduction
```

## Frozen benchmark rerun

[Summary](p0-05-time-fix/summary.json), [full report](p0-05-time-fix/report.json),
[retained failures](p0-05-time-fix/failures.json),
[comparison with the parent report](p0-05-time-fix/comparison.json).
The prior `p0-05-run` and `p0-05-final` reports remain untouched.

| Candidate | Exact complete / n | Fuzzy complete / n | Exact P95 ms | Fuzzy P95 ms |
| --- | --- | --- | --- | --- |
| Lexical only | 50/50 | 17/30 | 1.869 | 2.516 |
| Lexical + metadata | 50/50 | 25/30 | 1.696 | 1.345 |

Every ranked hit, score, expected anchor and failure matches the parent report;
only measured latency and implementation metadata differ. All fixture hashes
(including labels) match the previous preflight. Fresh-process restart, index
rebuild and unchanged original-file checks pass. The exact same five fuzzy
metadata failures remain. Source fingerprint and ranking signature are unchanged:

```text
archive: d901387a7b8ab24c33b627ad88f20e8ae1a8ddbb9e2b09dee98cd8fdb6f3220f
ranking: b5922ddd8314665e09498c795fc11763f727c126e0a791be3d01d432be157a46
```

These are synthetic in-process measurements, not real-course or device results.
Provider calls, paid calls, provider tokens and application API cost remain zero.
G6 remains incomplete: Graphiti was not run, no models were downloaded, and no
new dependencies were installed. All previous production integration and
real-data limitations remain in effect.
