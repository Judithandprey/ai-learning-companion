# P0-05/10 stored context preparation

Lead task `handoff_adb3251867602a8520c131e1df784f26`, exact assigned baseline
`7dfb9eaaf6ec7cf6e8c44ebb6fe31d59849cc8d1`, preserving merge
`ae4ebd5e5a229644f03716520ab43d8a02b43c3f`. Read the complete current task
subsection, reader integration evidence, actual reader/composer/resolver flow,
affected original/English R07/R29/R30/R46/R51/R52/R58 and A12/A14/A16/A30/A31,
current decisions and workflow. All four original/English pairs match their
manifest hashes. PONYTAIL LITE: one function reuses the existing two callables
and composer; no new reader, store, class, framework, identity or dependency.

## Observable result

`services.learning.process_context.prepare_stored_process_context` freezes an
explicit list of stored IDs, obtains detached complete metadata from the injected
current-authorized reader, composes existing process/image evidence, and re-reads
the **same complete ordered selection** immediately before returning. Missing,
denied, corrupt or canonically changed final metadata withholds the whole packet.
The comparison covers frameless and budget-omitted records/sources as well as
included images. It never retries, returns a partial packet, or sends to a provider.
Selection order, original text/reasons/clocks/parents/versions, PNG bytes and all
existing permission/evidence flags are preserved. Complete reads are independently
bounded at 4 MiB; the existing composition limits control returned metadata/images.

## Actual focused checks

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_stored_process_context.py -q
# Before adding the separately requested adapter integration regression:
# 40 passed in 1.84s, exit 0.
git diff --check
```

The first 34-case run passed in 1.74s. Six additional cases cover aliased metadata
mutation, actual missing image bytes and malformed initial reader responses.
The 40-case run above passed. The additional concrete-adapter regression below
currently fails on the released Backend baseline; this is not an all-green
integration delivery. No frozen retrieval or old archive/207-test campaign was rerun.

Tests use existing actual in-process ASGI registration/upload/frame-ingestion
fixtures and MemoryStore. The new callable returns the exact stored synthetic
124-byte PNG, complete process record, display descriptor and Frame; the separate
52-byte editable-ink reference stays a reference. A single-image preparation makes
two complete metadata reads around image resolution. Reads/composition leave stored
documents unchanged and returned nested values do not alias stored/reader values.

Negative checks cover source revoke/delete, account authorization revoke, token
expiry/revoke and corrupt stored records **after** an authorized image read;
frameless-source revoke with no image callback; a revoked source omitted by the
metadata budget; changed final reason/clock/source/frame, missing reply, extra
claims and nonfinite metadata; cancellation at first read, image resolution and
final read; mutation of caller IDs, reader arguments and aliased reader replies;
invalid selections and incomplete/live initial envelopes. Account-data removal is
simulated only by clearing the isolated MemoryStore actor: there is no account-delete
API in this path, and none is claimed. Ordinary missing blob content remains an
explicit gap when complete metadata is still authorized. Stop/withdraw preserves
authorized historical evidence without granting live capture or presentation.

## Independent Backend cancellation dependency

Actual minimal probe on this baseline: create an authorized synthetic MemoryStore
actor, cancel a `concurrent.futures.Future`, and inject an authorization guard that
calls `future.result()`. `AuthorizedProcessContextReader` returns
`DomainError(503, unavailable)`; `AuthorizedImageResolver` returns
`{status: unavailable}`. Their generic `except Exception` clauses swallow standard
Future cancellation raised **inside** guard/transaction handling. Asyncio cancellation
does not inherit Exception. This pre-existing behavior is distinct from the new
wrapper, which propagates cancellation exposed by each injected callable.

Reported via `handoff_bdf94299ea830e3713e903e15ad6fb24` to the lead for a narrow
Backend-owned correction and guard/transaction checks. No Backend files changed.
A resolver-specific swallowed cancellation can otherwise become a gap and allow
normal return when the reader guard remains valid. Do not claim that cancellation
inside those concrete adapters is fixed by this delivery.

Lead confirmed the dependency in `handoff_14c5c3ca3f6bab623dce8a94d2c55b5f` and
assigned Backend the correction. At the lead's request, retained a normal failing
regression (no skip/xfail) using the actual AuthorizedImageResolver with a cancelled
guard and a separate valid AuthorizedProcessContextReader:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_stored_process_context.py -q -k actual_adapter
# 1 failed, 40 deselected in 0.32s, exit 1: CancelledError did not propagate.
```

This check requires cancellation to propagate, no packet to escape, and no final
reader call after resolver cancellation. The lead will combine both owned changes
and retest against an exact corrected baseline; none has yet been supplied here.

## Limits and next owner

Lead reviews/integrates this scoped function and coordinates the named Backend
cancellation correction. This is last-check internal preparation, **not** atomic
dispatch, a lease, a receipt or future-use permission. The caller must recheck
current source/help permission at actual delayed send/display; no external callback
or network action is enabled. Authorization/commit/live/provider remain
`not_attested`, presentation `not_granted`, completeness unknown. The reader's
historical context envelope is not reconstructed original transport history.

No frozen original/query/label/failure, retrieval, shared schema, root/dependency,
Backend, preview or Paperclip change. Prior retrieval remains 50/50 exact and 25/30
fuzzy, not newly measured or tuned. Product calls/cost are zero; no listener, DB
campaign, provider activation or device capture. Real continuous AI screen/ink
understanding, original-screen annotation, editable ink delivery, Notability,
G6/G7 and live product acceptance remain unverified.
