# Shared-display provenance in the existing archive

2026-09-29, Backend P0-04/P0-09. Assigned released baseline:
`91a8085bbef1354222b62b87602a7edbb55efb60`, normally merged into `team/backend`
at `59f7193781c0ffeb257f2afbc1a2dad0d387db68` before this implementation.
Lead's subsequent CI-only `e50e95d2665aa8502e0f3d09460d9ad5b8a86b6d` notice was
read: display-source/API code, affected requirements and guidance are identical;
no compatibility pins were changed here. Native assignment:
`handoff_2617deabb08a2a32ee557d34be985e6b`.

Read the complete [0.2.3 package](../../../packages/contracts/display_source/README.md),
[release obligations](../lead/display-source-release.md), current decisions,
task/role guidance and affected original/English R02/R03/R07/R29/R30/R35/R36/
R51/R52/R58/R59 clauses, with the unchanged source manifests checked. A12/A14/
A16/A30/A31/A44 and requirements §7.1 still require separate real-device,
whole-display delivery and original-screen interaction evidence.

## Observable internal path

An authorized registered display stream can now create an honest source descriptor,
store exact original PNG and editable-ink bytes, atomically ingest Frames/process
records, and read current-authorized PNG bytes. No HTTP URL, foreground-app name,
text, OCR, source-content hash, Observation, coverage or freshness is invented.

```python
descriptor = registry.register_display_source(
    user_id, source_id, stream_id, producer_id=authorized_producer_id,
    project_id=owned_project_id, source_timezone="America/Los_Angeles",
)
source = {k: descriptor[k] for k in ("user_id", "source_id", "source_version")}
originals = OriginalArtifacts(
    store, current_authorization_guard,
    display_authority_resolver=registry.resolve_capture,
)
originals.put(user_id, source, "screen_image", png_reference, original_png)
ack = registry.ingest_frames(user_id, batch, [frame], idempotency_key)
historical_descriptor = registry.read_display_source(user_id, source_id)
image = AuthorizedImageResolver(store, user_id, current_authorization_guard)(
    frame, max_bytes=png_reference["byte_length"],
)
```

The caller must use an actual trusted registry/resolver and authenticated guard;
these internal methods do not authenticate a device transport or grant capture
consent themselves. Existing control registration still requires independently
authorized producer start and membership. Default capture gates remain unchanged.

## Identity and lifecycle

Registration checks control and capture scopes/capabilities, current account
generation, owned device/session, active membership/revision, owned project when
supplied, registered stream, producer and independent stop facts inside one actor
transaction. Device/session come from that stream; creation time comes from the
server clock. The source ID is the exact registration replay identity, so no
second idempotency store is needed. Identical live replay returns the original
creation time. Changed stream/project/timezone or collision with a legacy source
fails. The first immutable version is 1; no in-place revision API was introduced.
A restarted stream requires a different source ID and retains the old descriptor.

The existing `source` row contains the released descriptor plus mutable lifecycle
facts and the original producer/generation/membership pins. The existing immutable
`snapshot` row is exactly `DisplaySourceSnapshot` 0.2.3. Reads validate both rows
against the retained registered stream and consumed producer grant. Missing
snapshots are not regenerated on replay. Retained snapshots, frames, original
bytes, process records, receipts, notes, derived records or jobs fence a missing
source head against reuse. Total loss of every identity witness requires external
integrity/backup recovery; this entry does not invent a recovery protocol.

Stopped/withdrawn streams cannot register a new descriptor or replay creation.
Display original uploads, including exact byte retries, require an explicit live
current capture resolver. Without independently evidenced historical-upload bounds,
this implementation rejects new byte uploads after stop rather than guessing
pre-stop authorization. Already stored bytes can support the existing finite sealed
historical process backfill. It does not restart sharing.

Authorized historical source/original/image reads remain available after scoped
stop/withdrawal or a new stream incarnation; they still check account/source access,
ownership, original incarnation and exact bytes. Source revocation/deletion or
account denial blocks them. Every display process record must carry a Frame and
pass `validate_display_record` plus typed-original/frame composition, including
stored ancestors. Mixed batches cannot bypass stream binding with an unframed
display record. The default ingest path remains unsupported for this variant.

Source deletion removes its snapshots, frames, process references and committed
or pending typed originals using existing deletion fences. Another display's
originals remain accessible. Deletion does not insert URL/text fields into the
display lifecycle row. No new storage kind, migration, dependency or shared schema
is needed. PONYTAIL LITE uses one small variant helper across the existing readers
and writers; it does not create a second archive or producer subsystem.

## Legacy behavior and actual validation

Legacy source/snapshot APIs, selected Learning exports and document-preview
imports/saves explicitly reject display or unknown versioned variants with
`409 unsupported_source`. They do not coerce images into text sources. A valid
unselected display snapshot, even when revoked, does not prevent export of an
unrelated legacy source; structural/ownership/exact-key checks still reject
malformed unselected data. No process export was added to Learning's legacy path.

The executable acceptance in `test_display_sources.py` uses explicitly synthetic
control facts, a generated PNG and editable-ink JSON, all in MemoryStore. It calls
real production registration; no display rows are manually seeded for success.
The path stores both originals, verifies ACK and exact process/frame readback,
reads identical image bytes via `AuthorizedImageResolver`, and retrieves the
preserved ink. A fresh registry over the same test store returns the same descriptor
and original creation time. This is object reconstruction, not process/DB restart.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_display_sources.py \
  packages/contracts/tests/test_display_source.py
# 94 passed in 0.71s (61 service tests, 33 shared-contract tests)

/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_capture_frames.py \
  services/api/tests/test_original_artifacts.py \
  services/api/tests/test_image_resolver.py
# 258 passed in 1.66s

git diff --check
# exit 0
```

The legacy-edit author also ran 186 archive/export/preview/deletion regressions;
after tightening `read_source`'s version inventory, its archive/HTTP checks passed
51 tests. These overlap existing checks and are not a cumulative test total.
Registration transaction counting and write/commit fault injection show no partial
source/snapshot on failure. Rejection tests compare the complete actor documents.

Independent review found malformed resolver `source_versions` could be a mapping
or contain Boolean `True`, which compared equal to version 1. The upload boundary
now requires exact frozenset/tuple/string/integer types, matching capture authority
discipline. Four regressions reject these cases and non-string scope/capability
elements without writes. Eight post-fix independent MemoryStore probes passed,
covering this boundary, legacy coexistence, explicit unsupported results,
cross-incarnation history, isolated deletion and retained identity fences.

## Remaining boundaries and next owner

Lead reviews/releases the internal entry before native producer transport or
consumer activation. No DB, service, preview/Paperclip runtime, browser, provider,
account or device operation occurred. No new PostgreSQL/restart, actual pixels
from a platform, provider input, full-display coverage, original-screen pen,
editable device reopening or Notability import acceptance is claimed.

Generic `services/worker/core/jobs.py` still accepts versioned source references
without source-family discrimination, including `source_sync`; it has no active
connector executor. This task's write scope is `services/api/**`, so generic worker
job adoption was not changed or exercised as a display consumer. Lead must bound
that adoption/unsupported-source guard before enabling a fetch/extraction executor.
The internal registration here neither queues a job nor calls a connector.

Process export remains a separate Backend/lead coordination dependency; Learning
may compose explicitly supplied records independently. The historical-upload and
unframed-display restrictions above are this bounded implementation's limits,
not removal of the full offline/process or original-screen product requirements.
