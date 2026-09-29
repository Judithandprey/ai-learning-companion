# Authorized stored process context

Backend P0-09/04, 2026-09-29 UTC. Assigned baseline
`da22f8bdd755450de788826862987fb2e2068625`, merged into clean `team/backend`
at `eecb580867ead27d322224bf4d9c5128a47900c1`. The current P0-09 card,
unchanged affected source/English requirements, decisions and released contracts
were read. PONYTAIL LITE applies: reuse the actor store, released validators,
historical source loader, image resolver and Learning composer.

## Observable result

The in-process HTTP path now has a production internal read boundary:
display registration → exact PNG/editable-original uploads → atomic frame/process
commit → **AuthorizedProcessContextReader** → existing
**compose_process_context** with **AuthorizedImageResolver**.
The synthetic test returns the same operation record, exact display/version/Frame
and 124 PNG bytes; the separate 52-byte editable-ink artifact remains a reference.
No new archive, identity model, schema, HTTP route, migration, dependency, default
activation or Learning edit was needed.

The callable lives in `services/api/process_context.py`:

```python
reader = AuthorizedProcessContextReader(store, authenticated_user_id, current_guard)
metadata = reader(record_ids, max_metadata_bytes=4 * 1024 * 1024)
packet = compose_process_context(
    **metadata,
    resolver=AuthorizedImageResolver(store, authenticated_user_id, current_guard),
    user_id=authenticated_user_id,
)
```

`current_guard` is a required trusted current-caller check, including the caller's
read permission, token expiry/revocation and authorization generation. Merely
knowing an owner or record ID grants no permission. The reader calls the guard
after entering the actor transaction and again before returning, and independently
checks the stored account enabled/generation shape. The result is not future-use
authority: the consumer must recheck **all sources** at final use, including metadata
and frameless records, even after successful byte resolution.

## Read semantics

- Accept exactly a nonempty list of 1–100 unique record IDs. One existing
  provisional device/session/stream incarnation is supported; multiple streams
  and unreleased attempt scopes fail explicitly. No supplied record body is trusted.
- Use one existing actor transaction and point reads only. Validate immutable
  stored canonical envelopes and their requested IDs, receive timestamps, binding
  and sequence-slot pins, artifact-reference pins/tombstones, exact source versions,
  historical display incarnation, source hashes and Frame relationships. A selected
  record witnesses its referenced metadata; no reverse archive scan is needed.
- Return only detached `batch`, `sources` and `frames` after the transaction exits.
  Records retain all original evidence, quoted language, revision/clock/media fields
  and causal parents in requested order. Sources and Frames are deduplicated in
  first-appearance order. External parents are never fetched or invented.
- The released ProcessBatch 0.2.0 wrapper is explicitly `historical`.
  `context-<hash>` identifies the ordered owner/ID selection, not the original
  transport batch, a receipt or live authority. Canonical record storage deliberately
  excludes original transport batch IDs/delivery modes. Server `received_at` stays
  validated archive bookkeeping; no new serialized field is invented to expose it.
- Bound the complete compact, sorted UTF-8 JSON result at an inclusive 4 MiB maximum
  (or a smaller caller limit). Accumulation is bounded; oversized metadata is refused,
  never truncated. The existing store still loads each individual point-read row as
  a whole. No blob row, base64 decoding, whole-archive scan, mutation or provider work
  is performed. Image bytes are checked separately by the existing resolver.
- Missing/corrupt/foreign/inconsistent selected metadata fails the whole call.
  Stop/withdraw permits current-authorized historical reads, without checking live
  transmission permission. Current account/source revocation and deletion withhold
  the metadata. Transaction-exit failure also withholds the result.

Internal errors: invalid input/limits → 422 `invalid_request`; missing/foreign or
tombstoned record → 404 `not_found`; denied current access → 401 `unauthenticated`
or 403 `forbidden`; unsupported incarnation/scope → 409 `dependency_missing`;
oversize result → 413 `payload_too_large`; lost/corrupt referenced metadata or
storage/guard failure → 503 `unavailable`. No failed snapshot or exception contents
are returned. A legal historical coverage record selected with later backfill that
contradicts its declared gap can fail released ProcessBatch validation; the reader
does not rewrite that original evidence to force a combined batch.

## Actual checks

Completed before 2026-09-29 17:26:57 UTC using the existing shared Python environment:

```sh
python -m pytest -q services/api/tests/test_process_context_reader.py \
  tests/evals/test_process_context.py services/api/tests/test_image_resolver.py
```

**207 passed in 15.81s.** The new module has **55 tests**, independently authored
and first passed in 15.27s. Compilation and `git diff --check` passed.

The tests actually invoke the existing ASGI HTTP handlers and MemoryStore, then
the new reader and unchanged Learning composer. The exact PNG hash is
`a042b4d9e741c392455ccd962af84be20215ba6d4922cdaf903b7cc77de490f4`;
the separate editable-original JSON hash is
`9891f1ae31dfa8cadc5ac812936e9ede3d0b735dfa015e03e2d511a10bcbddc0`.
The composer retains `not_attested` for authorization/commit/live/provider,
`not_granted` for presentation, `unknown` completeness, and supplied-array ordering.
Its separate existing image/metadata admission budgets remain unchanged.

Focused cases include 100 HTTP-committed records in reversed requested order;
101-ID/duplicate/input rejection; detached nested values; no scans/writes/blob reads;
outside-selected parents remaining unknown; mixed streams and foreign records;
malformed/lost canonical records, sources, Frames, binding/slot/artifact pins and
tombstones; Stop/withdraw history; current source/account revoke/delete; token
expiry after acquiring the actor transaction and revocation during reads; transaction
exit failure; and source revocation after the metadata snapshot withholding image
bytes. A separately imported valid legacy source with multibyte text proves that
the **complete result at exactly 4 MiB passes and one byte over fails** unchanged.

The first new-file run retained one failure (48 passed / 1 failed): a corrupted
stored display version surfaced dependency code `source_unavailable` instead of the
reader's declared `unavailable`. The reader now normalizes retained-dependency errors;
the test assertion was preserved and the complete suite passed afterward.

Independent read-only review additionally executed bounded MemoryStore corruption,
historical-display and 4 MiB probes. Eight canonical/source/frame/pin corruption
variants, four historical display-incarnation corruptions, final-guard refusal and
transaction-exit failure were refused without partial output or repair. Its scan,
write and blob-read tripwires passed. It did not run PostgreSQL or a listener.

## Limits and next owner

This is tested in-process HTTP and MemoryStore integration, **not new PostgreSQL,
device, provider or network-service acceptance**. The earlier real API restart
campaign was not repeated. It is a read-only dependency for R07/R29/R30/R35/R36/R46/
R51/R52/R58/R59 and A12/A14/A16/A30/A31/A44, not completion of those full scenarios.
No inference about unobserved reasoning, independent mastery, capture completeness,
actual AI receipt or answer-disclosure permission is introduced. Byte references
are not an editable UI or a Notability import receipt. Both core §7.1 gates remain
open. User-preview services/tokens/databases and Paperclip were untouched.

Lead next reviews/integrates/releases the callable; Learning can then receive a
bounded final-use consumer assignment. The metadata snapshot alone must never
authorize presentation or provider dispatch.
