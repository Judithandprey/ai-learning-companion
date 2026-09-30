# Internal raw-frame archive adoption

Date: 2026-09-30 UTC. Owner: Backend, existing bounded P0-09 continuation.
Assigned release: `3ee3201b845a457556ba111b4a4f7719db7fd1b0`.
Normal worktree merge: `70107ea72e1dd526005961952f9d715b221858a1`.
Delivery is the commit containing this evidence; no worker push or external activation.

## Outcome and scope

An already authorized internal caller can commit released RawCaptureFrame 0.2.5
metadata, read the retained process context, and resolve the exact original PNG
through three explicit methods:

```python
ControlRegistry.ingest_raw_frames(user_id, batch, frames, idempotency_key)
AuthorizedProcessContextReader.read_raw(record_ids, *, max_metadata_bytes=4194304)
AuthorizedImageResolver.resolve_raw(detached_frame, *, max_bytes)
```

The registry needs existing membership/control state, a consumed trusted start,
an owned display source and typed original uploads. Reader/resolver constructors
pin the actor and require a callable current-caller authorization guard. No second
store, identity model, dependency, provider, endpoint or bootstrap was added.
ProcessBatch/ACK 0.2.0, typed originals 0.2.2, display 0.2.3 and ordered HTTP 0.2.4
remain unchanged. The 0.2.4 route still rejects raw descriptors; default factories
do not mount or activate the new internal path.

Affected source/English requirements and decisions were read at the assigned
release: R27–32/R35–36/R51–52/R58, A09–12/A16/A30–31/A38, AUDIO-08/AUDIO-14,
V-SourceTimeRelations, current decisions, workflow and Backend role. All four
translation-manifest source/translation pairs matched at task entry. PONYTAIL
LITE reused the actor transaction, typed artifact store and existing adapters.
This is supporting archive evidence, not acceptance of those complete experiences.

## Behavior and integrity boundaries

- Raw descriptors use the distinct immutable document kind `raw_capture_frame`.
  Legacy/raw writers share one actor/frame ID namespace and `frame_tombstone`.
  Both write orders and replay after erasure fail; unrelated legacy archive
  extraction remains identical.
- Raw ingestion retains the exact descriptor and canonical process record. It
  binds current source/version/owner/device/session/stream, original PNG reference,
  historical generation and provisional-session scope. Stop, withdrawal, identity
  expiry/revocation and historical-upload boundaries are checked in the existing
  actor transaction; authorization is rechecked before completion.
- The raw replay namespace is `internal_raw_capture_frames`. Canonical frame-ID-map
  equality accepts reordered frame arrays; the batch, including record order,
  and every raw timing/orientation field remain part of equality. Requests require
  1–100 exactly named frames and at most 4 MiB of canonical UTF-8 metadata.
- Surviving records, slots, frames, ACKs and descendants are evidence of prior
  commit, never permission to recreate missing originals, bindings or artifact
  pins. New raw and legacy descendants cannot restore missing ancestor inventories.
  Cached source IDs must equal resolved dependencies. Malformed stored envelopes
  and ACKs fail with sanitized unavailability.
- Metadata reads preserve requested order, one incarnation, 1–100 distinct IDs
  and the complete packet ceiling. They return `{batch, sources, frames}`, without
  translating clocks, rotating pixels, decoding blobs or dropping mixed records.
  Mixed legacy/raw selection fails explicitly. The document store loads the whole
  artifact row to inspect binding metadata; this is not a streaming storage claim.
- Raw resolution checks the detached descriptor against retained metadata, current
  access, historical source incarnation, typed byte binding and pins, tombstones,
  canonical base64, digest, size, byte limit and PNG signature. It returns unchanged
  bytes and metadata. Ordinary failures are sanitized; cancellation propagates.
  Decoded geometry and codec validation remain with the consuming pixel adapter.
- Unknown capture UTC/course position remain null. Callback-wall estimates,
  uncertainty, sample PTS, buffer sequence, process sequence and all eight unapplied
  CG orientations, including mirrors, remain distinguishable. A receipt timestamp
  does not become capture time, freshness, course time or live observation.
- Source deletion scans both frame kinds independently of process rows, validates
  foreign links, removes owned originals and raw descriptors, and keeps opaque
  replay/identity fences. It refuses corrupt cross-source erasure. No note, ink or
  legacy record is rewritten into a raw frame.

## Executed verification

Python used the existing locked lead environment read-only; no installation.
Counts below are separate overlapping runs, not a sum of unique tests.

| Check | Actual result |
| --- | --- |
| Final raw ingress/readers plus existing HTTP ingress, capture and original artifact regressions | **385 passed in 16.89s** |
| Independent retained-witness/corruption review regressions, both raw/legacy descendants and positive continuation | **25 passed, 91 deselected in 0.98s** |
| Raw reader/resolver plus unchanged legacy reader/resolver suites | **194 passed in 18.21s** (45 new, 149 legacy) |
| Raw storage/deletion final focused suite | **24 passed** |
| Existing dedicated-DB target/runner guard suites | **50 passed in 0.42s** |
| Real PostgreSQL bounded raw-frame runner | **exit 0**, PostgreSQL 18.6; initial apply plus corrected-path recheck below |
| Whitespace and ownership check | `git diff --check` passed; shared contracts, requirements, root manifests and old migrations unchanged |

Final affected regression command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_raw_frame_ingress.py \
  services/api/tests/test_raw_frame_readers.py \
  services/api/tests/test_ingress_http.py \
  services/api/tests/test_capture.py \
  services/api/tests/test_original_artifacts.py \
  services/api/tests/test_original_artifact_capture.py
```

The reader/resolver regression command used `test_raw_frame_readers.py`,
`test_process_context_reader.py` and `test_image_resolver.py`. Runner guards used
`test_postgres_check.py`, `test_postgres_capture_check.py` and
`test_postgres_ingress_http_check.py`. Raw storage used `test_raw_frame_storage.py`.
Memory/ASGI fixtures are synthetic, not PostgreSQL or device evidence.

### Actual dedicated PostgreSQL operation

The operator's existing ready handoff identified local `lc_p0_test`. Its private
connection file was read directly into `LC_TEST_DATABASE_URL` inside the Python
process, without printing or recording credentials. The existing runner's
`dedicated_test_dsn` and actual-database verification ran before mutations.

Equivalent invocation after secure environment injection:

```sh
python -m services.api.tests.postgres_check --raw-frames-only
```

Initial run applied `0003_raw_capture_frame`, replayed migration as a no-op, and
passed exact metadata/PNG/ACK readback through fresh PostgresStore connections,
immutable-update and both-order frame-ID collision SQL refusal, late transaction
rollback, deletion/tombstone refusal and unchanged unrelated legacy export.

Independent review then found the missing-ancestor-pin defect below. After the
production correction, one bounded recheck added that actual refusal case using
the same runner and one fresh unique actor. Output, exit 0:

```text
PASS: migration apply/replay: already applied
PASS: fresh PostgreSQL connections retain exact raw metadata, PNG, ACK and unrelated legacy export
PASS: SQL immutable update and both-order legacy/raw global-ID collisions refused
PASS: late process-row failure rolls back raw frame, record, slot and replay atomically
PASS: new child refuses a missing committed ancestor pin without restoring or partially writing data
PASS: source deletion and shared SQL tombstone prevent both frame kinds from reviving; legacy export unchanged
PostgreSQL version: 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
PASS: bounded real PostgreSQL raw-frame suite and unique actor cleanup
```

Each run cleaned up only its own actor. No preview database, existing actor,
listener, API process, database restart, native capture or provider was touched.
The old HTTP/restart campaign was not repeated.

### Failure evidence retained

Independent review initially reproduced **11 failing cases**: descendants through
either writer could recreate missing committed bindings/artifact pins, missing
ancestor slots were unchecked, replay source inventories could disagree, and
malformed ACK traversal escaped as a parser/key exception. Further isolated raw
frame/ACK probes showed that checking only surviving process records was
insufficient. Shared ingress guards now reject these repairs while valid retained
raw-parent continuation through either writer still succeeds. The independent
final 25-case recheck passes without changing the expected refusal assertions.

An intermediate correction incorrectly looked for authorization generation on the
display snapshot instead of its validated source head; seven cases caught it.
The combined run also exposed a legacy test's intentionally abbreviated stored
envelope under stricter stored-record validation. That fixture now uses a complete
canonical ProcessBatch record and preserves its original 409 dangling-reference
expectation. The subsequent 326-case and final 385-case runs passed.

Earlier fixture-only failures included a 100-frame fixture colliding with a
preexisting legacy ID and two reader fixture expectations. These were corrected
without weakening identity, cancellation or byte-validation requirements. A
malformed stored raw descriptor is validated before equality so corruption is
unavailable, not treated as a legitimate changed-record retry.

## Migration, recovery and next owner

Migration `0003_raw_capture_frame` is additive and installed on the dedicated test
database. It adds immutable raw documents, a cross-kind unique frame-ID index and
shared tombstone SQL checks. `0001`/`0002` were not edited. Consumers/runners of this
database need a revision aware of 0003; older migration manifests reject unknown
applied versions. Normal migration apply/replay and commands are documented in
[the API README](../../../services/api/README.md#internal-raw-png-metadata-adoption).

Stop raw writers before feature rollback and retain all originals/fences. The
provided down migration takes an exclusive table lock and refuses while any raw
frame **or any common frame tombstone** remains. It deletes neither originals nor
tombstones; their old kind cannot be recovered from a shared tombstone. Empty-state
downgrade was not executed on the dedicated database. Restore missing committed
data only through a separately reviewed recovery operation, not upload retries.

Lead owns final integration and cross-owner composition with Learning/native
consumers, plus any future explicit transport/bootstrap release. Learning must
choose these raw-aware methods and preserve unknown clocks/orientation through
its separately tested pixel path. Detached results are not durable authorization:
recheck current permission before later use and final presentation.

Not verified here: real native producer transport, signing/install, physical iPad,
cross-app overlay or editable-ink interaction, actual AI/provider input, freshness,
audio alignment, full classroom/Notability flow, crash recovery, load/scalability
or P1 acceptance. Both core gates remain open. Actor locks and whole-document
loads retain existing throughput/memory limits; the request ceiling is not a
product memory-retention cap.

## Review correction after 6e41895

Lead review of `6e41895f0c9ca4cba6768e5acbe6cacc56487b07` found two omitted
entry boundaries. Its nine portable probes reported two failures and seven passing
controls. This additive correction keeps the same owned paths and contract baseline.

1. Default `registry.capture.ingest` could accept an authorized frameless,
   artifact-free legacy record after a raw commit lost its `capture_binding`, then
   recreate that binding. The existing committed-stream check now runs for every
   ingress family, because every family writes the binding. First ingestion and
   retained-stream continuation/replay remain accepted.
2. The synthetic fixture importer could reuse a lost raw frame ID while a retained
   process record still named it. The common `Archive._immutable` frame boundary
   now rejects either absent frame kind if a surviving committed process record
   references that ID. Existing frames still permit exact replay; fresh fixture,
   raw and legacy frames remain valid. This neither activates the importer as a
   production route nor changes the storage schema.
3. One bounded check of the same default-entry gap found that a lost raw process
   record could likewise be rewritten as a new frameless legacy record at a new
   sequence/key despite its old slot and ACK. The existing record-ID witness checks
   now apply to all writers. Separate regression cases isolate slot, ACK and
   surviving-descendant witnesses; all require 503 and unchanged state.

The original lead probes passed **9/9 in 0.60s** against the corrected Backend
modules. Their file lives inside a complete older review checkout: direct pytest
collection initially imported that older checkout and repeated its original
two failures. The corrected verification preloaded `services.api.capture` and
`services.api.domain`, asserted both paths belong to the current Backend worktree,
and used `--import-mode=importlib` with this worktree's pytest config. No probe
assertion or original review file was changed.

Final related suite: **496 passed in 16.10s**, exit 0:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_raw_frame_ingress.py \
  services/api/tests/test_raw_frame_storage.py \
  services/api/tests/test_capture.py \
  services/api/tests/test_control.py \
  services/api/tests/test_archive.py \
  services/api/tests/test_preview.py \
  services/api/tests/test_capture_frames.py
```

`git diff --check` passed. No SQL, migration, database, service or dependency change
was needed; the earlier PostgreSQL operation above was not repeated. These are
portable Python/MemoryStore checks, not new real-device or real-DB acceptance.

The next 0.2.6 raw HTTP adapter contract and generated OpenAPI were read without
merging at `0c3e227413bd8cba3312a52445dfdbdde75ca390`. That task remains conditional
on Lead's review/integration of this correction and its supplied integrated
baseline. No HTTP adapter work or activation was started here.
