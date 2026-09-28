# P0-05 delivery review — integration held for correction

Date: 2026-09-28 UTC. Main baseline:
`4524693f3cd21274c142405e000491496805cef0`.
Worker delivery: `699504c8dea0a9a4c7089781f15e2931baa0f926`, based on
`91019c3fd548e47aca632136012bb961c4af07cb`, contract 0.1.0.
Actual delivery message: `handoff_e44a3e30032e7798899af123ce5b5a6b`.

The lead verified the delivery stays within learning, fixture, evaluation and
learning-verification paths, then performed a conflict-free provisional merge
without committing. A separate read-only review independently inspected code,
label separation, source anchors, fixture/implementation hashes and rankings.

## Executed on the provisional integration

```sh
.venv/bin/python -m pytest packages/contracts/tests tests/evals -q
.venv/bin/python -m services.learning.evaluate --output /tmp/p005-lead-20260928
```

The combined tests passed: **87 passed in 0.82 s**, comprising 69 current contract
tests and 18 learning checks. This result describes the provisional integration,
not the committed main tree after withdrawing that merge.

The 90 sources, 89 frames, 875 observations and 80 queries reproduced the worker's
rankings. Lexical-only complete queries: exact 50/50, fuzzy 17/30. With explicit
metadata: exact 50/50, fuzzy 25/30; mean fuzzy evidence Recall@5 83.33%. All five
metadata failures remain: fuzzy-03, fuzzy-22, fuzzy-24, fuzzy-26, fuzzy-29.

The full summary from this run is retained in `p0-learning-review-summary.json`.
The source-file hashes, deterministic index bytes, fresh-process restart rankings
and rebuild rankings were unchanged. Ranking signature:
`b5922ddd8314665e09498c795fc11763f727c126e0a791be3d01d432be157a46`.
No provider or paid API calls occurred. These are synthetic, in-process results;
they do not verify real courses, model switching, context compaction or Graphiti.

## P2 finding requiring an owner fix

In delivery `699504c`, `services/learning/archive.py:82` and
`services/learning/retrieval.py:81–84` compare UTC timestamp strings directly.
The shared contract permits fractional seconds; lexical ordering differs from
chronological ordering across precision representations.

- Set `e-02-c.captured_at` to `2025-01-03T00:00:00.500Z`. The prior event
  `e-02-u` is at `2025-01-03T00:00:00Z`. Both timestamps are valid and the correction
  is later, but the adapter raises `Invalid correction ownership/order`.
- On the unchanged fixture, query
  `{"text":"basis","actor":"user","project_id":"algebra","before":"2025-01-03T00:00:00.500Z"}`
  returns no hits, excluding `e-02-u` even though it precedes the boundary.

The independent reviewer reproduced both cases. The lead separately reproduced
the invalid correction rejection using valid `.100Z` versus whole-second `Z`
timestamps. No other integration blocker was identified in this bounded review.

The lead withdrew only the uncommitted provisional merge, returning main to its
previous clean state before recording this evidence. The original worker branch
and commit remain intact. Revision request `handoff_240eae2ed298a3e060db94f55b59bc90`
was accepted through the learning route, replying to the actual delivery message.
Receipt acceptance is not proof that the fix has run or completed.

The requested correction preserves fixture bytes and labels, compares actual
time points without silently truncating legal fractional precision, and tests
inclusive `after`, exclusive `before`, equal instants with different precision,
and correction ordering. Root test discovery will be expanded only when the
corrected delivery is integrated. G6 remains incomplete; the separate proposed
Graphiti dependency/model experiment has not been installed or executed.

## Concurrent backend progress receipt

Actual backend message `handoff_f975e3005dee4ef0c4ed93dca21a08e5` reports successful
synchronization to HTTP baseline `f02618f907a6e2335bf88a01ddba84b0354a1fd4` and
163 initial shared/domain/ASGI tests, with deletion, revocation and job retry fixes
still underway. These are worker-reported results, not a delivered or integrated
backend milestone. The real PostgreSQL command returned exit 2 / BLOCKED because
`LC_TEST_DATABASE_URL` is absent; no database pass is claimed. Backend retains
ownership of migrations. No reply to this progress receipt was needed.
