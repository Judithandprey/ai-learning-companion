# Local source retrieval probe

P0-05 implements an offline lexical + explicit metadata baseline. It does not
implement a production memory service, an archive database, a model adapter, or
generated explanations. `FixtureArchive` is a read-only synthetic test transport
for shared contract v0.1.0 records. Backend remains the owner of original storage,
identity, authorization, deletion and transactions.

Run from the worktree root with the locked environment:

```sh
uv sync --frozen
uv run python -m pytest tests/evals/test_memory.py -q
uv run python -m services.learning.evaluate --output /tmp/p005-reproduction
```

No new dependency is required. Root pytest configuration
currently discovers contract tests only: integration must explicitly include
`tests/evals` or have the lead update test discovery.

The CLI exit code means the evaluation executed and preservation checks passed;
it does **not** mean every quality target or G6 passed. Inspect `summary.json`,
`failures.json` and the full per-query `report.json`.

## Retrieval boundary

`RetrievalIndex.search(query, user_id=...)` accepts explicit `project_id`, `actor`,
`before` (exclusive UTC), `after` (inclusive UTC), `source_version`, and `mode`.
These values must come from a trusted caller. It does not parse relative dates,
translate Chinese, infer courses, or authenticate users. All statistics and
results are scoped to the explicit user. Unknown query keys are rejected.
Time bounds and correction order compare actual UTC instants, including arbitrary
fractional precision; equivalent `Z`, `.0Z` and `.000Z` forms compare equal.
The original timestamp spelling is preserved in returned evidence.

The frozen algorithm uses BM25 (k1=1.2, b=0.75) on observation text plus the related
source text. It tokenizes English alphanumerics and literal Han characters,
removes a small fixed stop list, and uses explicit metadata as hard filters.
There is no vector/semantic component. Scores tie-break by original event key;
there is no query-ID lookup, relevance-label access, recency boost, or tuned
synonym dictionary. The lexical-only comparator uses identical inputs and skips
the optional metadata filters while retaining ownership/current-state semantics.

`history` preserves old events and source versions. `current` excludes superseded
events and older source versions. It means current at the supplied archive
snapshot, not historical as-of reasoning. Version/correction links remain in
results; absence of results means `not_found`, not that a user never said it.
An exact score tie is marked `ambiguous`; other matches are evidence candidates,
not verified answers or calibrated confidence.

Returned text is copied verbatim from its original Observation. The evidence
includes actor, event/source/version/frame IDs, source hash, provenance, media
position and gap flags. Missing frames remain null. Results never splice one
event's quote with another event's frame. No mastery state is produced from
exposure, scheduling or self-report.

## Derived index lifecycle

The persisted JSON index holds term counts, event keys, format version and an
archive fingerprint. Original quotes/media are rehydrated from validated records.
It is a disposable local cache, not an archive or identity source. Callers must
discard the snapshot and reload originals after updates, deletion or revocation;
loading an index with a changed/deleted archive rejects it as stale.

`save(path)` validates the candidate, writes a unique temporary file beside the
destination, flushes and fsyncs it, then uses `os.replace` to publish it atomically.
Failures before replacement preserve the prior snapshot. Abrupt process exit may
leave an orphan temporary file; readers never load or promote it. This is a local
filesystem/process-interruption guarantee, not a tested power-loss or distributed
filesystem durability guarantee; directory fsync and concurrent-writer coordination
are not implemented.

`load(archive, path)` rejects malformed JSON (including duplicate members), wrong
shapes/types, duplicate/missing events and invalid counts/lengths with
`InvalidIndexError`. It also re-derives terms from the validated archive to catch
plausible altered counts under an unchanged fingerprint; loading therefore costs
tokenization and does not promise faster startup. `load_or_rebuild` recovers only
missing/invalid snapshots and atomically saves the rebuilt cache. Other I/O errors
propagate. Pass a dedicated cache path, never an original-record location. The
evaluation/restart CLI rejects paths inside the fixture archive, including resolved
symlink aliases. Its fresh-process probes now check missing/truncated/malformed
snapshot recovery and retain the original ranking/failure evidence.

Run persistence regressions with:

```sh
python -m pytest tests/evals/test_index_persistence.py tests/evals/test_memory.py -q
```

The adapter checks the fixture manifest, original UTF-8 hashes, artifact hashes,
shared contract shapes, user/source/version relations, observation/frame anchors,
unique device sequences and correction ownership/time order. The index is validated
local derived data; production transactional freshness, tamper-proof cache
storage, authorization and concurrent stale-job rejection are not implemented.
