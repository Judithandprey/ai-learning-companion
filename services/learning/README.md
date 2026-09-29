# Local source retrieval probe

P0-05 implements an offline lexical + explicit metadata baseline. It does not
implement a production memory service, an archive database, a model adapter, or
generated explanations. `FixtureArchive` is a read-only synthetic test transport
for shared contract v0.1.0 records. Backend remains the owner of original storage,
identity, authorization, deletion and transactions.

## Supplied archive snapshots

`ArchiveSnapshot` is the read-only in-memory seam for already acquired v0.1
records. It shares validation and evidence logic with the fixture adapter:

```python
from services.learning.archive import ArchiveSnapshot
from services.learning.context import assemble_context
from services.learning.retrieval import RetrievalIndex

archive = ArchiveSnapshot(sources, frames, observations, artifacts, user_id=trusted_user_id)
index = RetrievalIndex(archive)
packet = assemble_context(archive, index, {"text": "change of basis"}, user_id=trusted_user_id)
```

Backend must obtain all four values atomically within its current authorization
and deletion boundary, then recheck authorization before use/presentation. Sources,
frames and observations must all belong to the explicit user. Existing contract
provenance/consent values are preserved; accepting their schema does not verify
consent, license, capture authenticity or permission. No loader, fetcher, provider,
disk write, identity or second persistent archive is added. `FixtureArchive` and
its file loader remain strictly `synthetic` / `test_only`, with mixed-owner test
fixtures still supported.

`artifacts` maps existing artifact IDs to immutable `bytes`; required frame bytes
must be present and match their hashes. The snapshot retains a read-only copy of
that mapping. Source text remains exact UTF-8; original records and evidence
returns are copied. Record maps follow the existing snapshot convention: treat
them as immutable after construction. Context assembly checks record identities
and fingerprint, but these Python objects are not a security boundary against
code mutating their internals. Missing referenced records/bytes, mixed owners,
invalid identities, sequences or correction dependencies fail explicitly.
Runtime v0.1 records may have a null frame with an empty gap list, and a correction's
capture clock may equal or precede its parent's. Preserve those values: a null
frame is still reported as unknown by context, without inventing a gap flag, and
correction links are checked for cycles rather than ordered by capture time.
`FixtureArchive` alone retains the authored `missing_frame` and strictly increasing
correction-clock conventions. Neither a later timestamp nor a correction link
establishes a confirmed winner or cross-device chronology.

After changes, deletion or revocation, acquire a new authorized snapshot, rebuild
its derived index and reassemble context. Old returned packets remain historical
Python values and cannot prove current authority; do not reuse them as current.
This seam does not implement backend transactions, v0.2 process semantics, real
model continuity or a full memory-service acceptance. Run the focused checks with
`python -m pytest tests/evals/test_archive_snapshot.py -q`.

## Supplied process and image evidence

`compose_process_context` accepts an actual, complete `ProcessBatch` 0.2.0,
exact legacy `SourceSnapshot` / `DisplaySourceSnapshot` 0.2.3 values and Frames:

```python
from services.learning.process_context import compose_process_context

packet = compose_process_context(
    actual_batch, exact_sources, exact_frames, authorized_image_resolver,
    user_id=trusted_user_id, max_metadata_bytes=65536,
)
```

This local dictionary retains complete operation/coverage records, before/after
states, actor/basis, verbatim reasons, source versions, artifact references, clocks
and explicit causal parents. Only `provisional_session` is supported; attempt
scopes require the separate current relation and assistance boundary. Sources must
exactly cover the batch; duplicate/foreign/unreferenced metadata fails before any
byte callback. Missing named frames remain gaps. Display descriptors are never
filled with invented text, URLs or application identity. Original array order is
retained; it is not wall-clock chronology. Parents absent from the returned context,
including budget omissions, remain unknown. Non-frame ink references are opaque;
they do not prove delivered, rendered or editable ink. No OCR, Observation, problem
boundary, unspoken reasoning or new identity is generated.

Metadata limits apply to canonical UTF-8 JSON of the entire result with only each
`item.image.data` removed. Complete items are admitted in supplied order, skipping
those that cannot fit; counts report omissions. A conservative reservation for
image/parent result metadata may leave spare space. Source text and record fields
are never clipped. Default metadata limit is 64 KiB, maximum 4 MiB. Images use the
existing resolver shape and PNG validator below: default 4 MiB per image, 8 MiB
total, 16 million pixels; hard ceilings are 16 MiB / 64 MiB / 16 million pixels.
Missing, revoked, malformed, unsupported, corrupt or oversized image results remain
explicit gaps with exact references. Callback exceptions become `resolver_failed`
(FileNotFoundError → `missing`, PermissionError → `revoked`); cancellation propagates.
The existing v1 image materializer retains its exception behavior.

This is supplied evidence, even if the unchanged batch declares `delivery_mode:
live`. Authorization, commit, live capture and provider receipt are all
`not_attested`; presentation remains `not_granted`. A byte callback does **not**
authorize source text, reasons or other metadata. The caller must obtain one
coherent authorized metadata snapshot transactionally and recheck final use.
Inputs are detached and mutation during byte resolution rejects the composition;
this does not replace a service authorization fence. Do not reconstruct batch IDs
or delivery mode from stored record envelopes. Backend's display-source adoption
and coherent process export remain separate dependencies; this function can also
consume an actual supplied batch at ingress. No persistence, fetch, provider or
released wire contract is added. Focused checks: `tests/evals/test_process_context.py`.

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
is not an as-of reconstruction. The latest version is the highest version among
all supplied source snapshots, including registered/fetched/parsed/indexed or
unavailable snapshots and versions with no observations. Such a newer version can
leave current-mode retrieval empty; it never silently revives the predecessor.
Explicit history can still retrieve older accessible observations. This describes
the existing fail-closed behavior, not a claim that ingestion or observation is
complete. Superseded/older-version originals can appear as
labeled correction context. All neighbor expansion checks user, metadata and source
access before rehydrating evidence. Blocked expansion adds no neighbor quotes or new
IDs; original `correction_of` references remain verbatim. Competing corrections remain unresolved, including descendants;
correction links are neither audio repairs nor confirmed diagnoses. Capture and
receive timestamps, original observation confidence and unknown gaps remain distinct.

Two accessible corrections that name the same excluded original still establish an
unresolved fork through their own links. This does not rehydrate the excluded
original or disclose hidden siblings. If only one such link is accessible, the
filtered relation remains unknown. Resolution inspects an item's direct children
and its accessible ancestor path; it does not aggregate every deeper descendant's
state onto all ancestors. A cycle encountered along that path raises `ValueError`.

The assembler rejects malformed query shapes/types and unencodable UTF-8 JSON
values with `ValueError` before invoking retrieval/evidence. Text must be a string;
metadata strings and time bounds may be null (no filter); `source_version` must be
null or a positive integer, excluding bool/float aliases. Valid modes remain
`current` and `history`; time bounds use the existing exact UTC parser. This is a
guard for the existing internal query vocabulary, not a new wire/query engine.

Ranked hits are rechecked for scope before budget accounting. Rejected hits do not
count as omissions; `returned_hit_count` counts eligible ranked hits. If the recheck
filters anything, internal retrieval status is `scope_filtered`, preserving the
surviving original ranks without claiming the original ambiguity/result status is
still valid. This status can have zero eligible hits and is not evidence of an
exhaustive no-match search. Malformed result shapes, duplicate keys and nonfinite
scores raise `ValueError`; no rejected IDs/text are echoed. An observed scope change
that would expose a newly eligible relation outside the assembled set also fails
closed. This does not replace the backend transaction/revocation fence.

Ranked hits come first, then eligible correction neighbors sorted by identity. That
order is not chronology. Without scope rejection, the packet preserves retrieval
`candidates`, `ambiguous` or `not_found`; it cannot supply the retriever's unknown total candidate count or
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

Fixture and implementation inventories must be nonempty. Ignored `__pycache__`
components are relative to the inventoried root, so a checkout beneath a directory
with that name is still checked. A fixture-root symlink remains supported, but
directory symlinks below an inventory root are rejected before publication/cache
recovery or hash attestation: the non-following walk cannot inventory their hidden
descendants. Ordinary file symlinks retain the protections described below.

## Original image evidence

`materialize_image_evidence` attaches original image bytes to references from an
already scoped context. It does not capture a screen, read a URL/path, call a model,
or authorize teaching. Use a fresh authorized archive and backend-owned resolver:

```python
from services.learning.images import materialize_image_evidence

packet = assemble_context(archive, index, {"text": "basis", "mode": "current"},
                          user_id=trusted_user_id)
images = materialize_image_evidence(
    archive, packet, authorized_resolver, user_id=trusted_user_id,
    capture_states={(session_id, device_id): "active"},
    max_image_bytes=4 * 1024 * 1024, max_total_bytes=8 * 1024 * 1024,
)
```

`authorized_resolver(detached_frame, *, max_bytes)` must perform a bounded read
under current artifact authorization and return one of these internal shapes:

```python
{"status": "available", "frame": exact_original_frame,
 "media_type": "image/png", "data": original_immutable_bytes}
{"status": "revoked"}  # or missing, unavailable, unobservable, byte_limit
```

The complete returned Frame must exactly match the requested record, including
owner, source/version, device/session/time, artifact ID and hash. Data must match
the original SHA-256, dimensions, type and limits. Unexpected resolver exceptions
abort without a result or retry. There is no fallback to snapshot bytes after a
resolver denies access. The resolver must enforce its own allocation/read limit;
this helper can reject an oversized return but cannot undo the resolver's allocation.

Supported pixels are static, non-interlaced 8-bit RGB/RGBA PNG, with bounded zlib
scanline validation and chunk CRCs. Ancillary metadata remains opaque and unchanged;
it is not used as pixel evidence. This is not a general PNG decoder or sanitizer.
Unsupported PNG variants, animation, JPEG/SVG and DOM/OCR/text remain explicit
gaps; nothing is converted, truncated, rendered or substituted. Defaults above
are engineering limits, with hard ceilings of 16 MiB/image, 64 MiB/result and
16 million pixels/image. Whole images exceeding the remaining budget are omitted
with `byte_limit`; byte counts include repeated frame attachments to distinct
context items. These are transport bounds, not source archive limits.

Output `items` correspond to context items and carry original event/frame/source,
device, capture/receive-time and provenance references, snapshot status and gap
flags. `status: attached` includes exact `data`, `media_type`, `byte_length` and
`evidence_kind`; synthetic provenance/representation remains `synthetic_image`.
Other statuses carry no image bytes. The original context and archive are unchanged.
No discarded context item is expanded back into the packet by this helper.

`capture_states` is keyed by **both session and device**; values are `active`,
`stopped`, `disconnected`, `stale` or `unknown`, with absent entries unknown.
Current-mode resolution is suppressed unless that device is explicitly active;
`stale_frame` also suppresses it. Explicit `history` may resolve authorized stored
images after capture stops, preserving historical/source-status labels and gaps.
It never restarts capture or changes a historical frame into a current view.
An active restriction input is not freshness proof: every result keeps
`live_status`/`provider_receipt: not_attested`, `capture_completeness: unknown` and
`presentation_permission: not_granted`. Writing/erasing does not raise assistance.
Source/packet bindings are checked before resolution and archive mutation after it;
the backend still owns transaction, revocation, final-use and capture-state fences.
This function cannot retract bytes already returned or observe an unreported stop.

Run `python -m pytest tests/evals/test_image_evidence.py -q` for labeled synthetic
pixel tests. Actual source/frame ingress, device capture, provider receipt and
original-screen/Notability acceptance remain separate integration dependencies.

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
