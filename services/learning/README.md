# Local source retrieval probe

P0-05 implements an offline lexical + explicit metadata baseline. It does not
implement a production memory service, an archive database, a model adapter, or
generated explanations. `FixtureArchive` is a read-only synthetic test transport
for shared contract v0.1.0 records. Backend remains the owner of original storage,
identity, authorization, deletion and transactions.

## Internal evidence context

`services.learning.context.assemble_context` is a callable local evidence layer
over the same archive and frozen retrieval baseline:

```python
from services.learning.context import assemble_context

packet = assemble_context(
    archive, index,
    {"text": "basis physical arrow", "project_id": "algebra", "actor": "user"},
    user_id="synthetic-learner", top_k=5, max_bytes=32768,
)
```

Supply a trusted user scope, a current validated immutable archive and its matching
index on every call. This is an internal dictionary, not a released wire contract,
generated answer or provider request. It grants no presentation permission. No
backend adapter, real model switch, preference migration or mastery evaluation is
implemented here. Source snapshots/frames/observations retain the existing v0.1 IDs.

The assembler defaults to `current`; pass `mode: history` explicitly for historical
retrieval. Current means the supplied snapshot, even with capture-time filters; it
is not an as-of reconstruction. Superseded/older-version originals can appear as
labeled correction context. All neighbor expansion checks user, metadata and source
access before rehydrating evidence. Blocked expansion adds no neighbor quotes or new
IDs; original `correction_of` references remain verbatim. Competing corrections remain unresolved, including descendants;
correction links are neither audio repairs nor confirmed diagnoses. Capture and
receive timestamps, original observation confidence and unknown gaps remain distinct.

Ranked hits come first, then eligible correction neighbors sorted by identity. That
order is not chronology. The packet preserves retrieval `candidates`, `ambiguous`
or `not_found`; it cannot supply the retriever's unknown total candidate count or
prove a statement was never made. Relation references may point to whole items
omitted by the budget; omission counts distinguish ranked hits and neighbors.

The byte budget covers `archive.canonical(packet)` (compact sorted UTF-8 JSON), not
provider tokens or pretty-printed JSON. Whole items are included greedily in that
order; quotes are never cut. A limit too small for the envelope raises `ValueError`.
This is a configurable transport bound, never an archive capacity limit. Returned
packets are independent copies. Reassemble after corrections/deletion; cached packets
must not be reused as fresh authority. Fingerprints are checked before/after assembly,
including in-place changes. Source/frame/event lookup keys must match their records'
intrinsic identities in both the supplied archive and the index's archive before
fingerprint acceptance. Production transaction/authorization fences remain
the backend adapter's responsibility.

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

The four output files are replaced atomically. A new run removes the previous
`summary.json` publication marker before writing its preflight; failed runs remove
that marker again. Report/preflight/summary carry a new `run_id`, and summary binds
the other three artifacts by SHA-256. Partial artifacts can remain for diagnosis;
they do not attest a completed run. An abrupt exit can leave an orphan temporary
file, which is never read or promoted.

Saved summary has `status: published_unverified`; saved report/summary leave
`preservation.file_hashes_unchanged` null and distinguish the earlier check as
`file_hashes_unchanged_before_publication`. After **all** owned file writes, the CLI
checks the originals again, then emits its JSON completion receipt on stdout with
`status: complete`, `file_hashes_unchanged: true`, the same run ID and the saved
summary's SHA-256. No file is written after that final check. Retain this stdout
receipt and successful exit status alongside the matching artifacts when citing
preservation; saved artifacts alone cannot prove that the final check ran. A failed
write, final check or output operation does not emit a successful receipt.

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
evaluation/restart CLI rejects paths inside the fixture archive, including literal
and resolved symlink paths, directory filesystem identities, and outside targets
of fixture metadata symlinks (including non-manifest files). File destinations
must be regular or absent; symlinks and special files are rejected. An outside
hard-link cache/output name remains safe because replacement changes that name,
not the original inode. Library snapshot load/save also reject nonregular targets
before opening them, so FIFO paths fail instead of blocking.

These are static local filesystem checks, not race-proof path authorization or
concurrent-writer coordination. Real bind mounts and macOS/APFS aliases require
platform verification; owner regressions simulate matching directory identities
without mounting anything. Arbitrary non-fixture paths must still be dedicated
cache/output locations supplied by the caller; this is not a general repository
overwrite guard. Its fresh-process probes check missing/truncated/malformed
snapshot recovery and retain the original ranking/failure evidence.

Run persistence regressions with:

```sh
python -m pytest tests/evals/test_index_persistence.py tests/evals/test_memory.py -q
python -m pytest tests/evals/test_evaluation_publication.py -q
```

The adapter checks the fixture manifest, original UTF-8 hashes, artifact hashes,
shared contract shapes, user/source/version relations, observation/frame anchors,
unique device sequences and correction ownership/time order. The index is validated
local derived data; production transactional freshness, tamper-proof cache
storage, authorization and concurrent stale-job rejection are not implemented.
