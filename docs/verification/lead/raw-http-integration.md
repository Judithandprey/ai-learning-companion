# Raw HTTP to retained Learning context integration

Backend delivery `f04b1e37e07b185935e2a9796ecdde4f57cf217e` arrived through
`handoff_e7bf51850590d8ef3a0d1de741dab66f` and integrates as `61401a1`.
It preserves the assigned baseline through owner merge `0946204`. The existing
trusted factory can now explicitly mount the raw 0.2.6 route; its default remains
off. No default app, listener, source grant, producer, provider or user preview
was activated. Existing 0.1.0–0.2.5 contracts and migration files are unchanged.

## Reviewed implementation

The full ordered HTTP wrapper, raw descriptors, process records and verified-only
ACK join one existing actor transaction. Object order/whitespace may replay;
changed array order cannot. The internal frame-map replay uses a separate key.
Current authorization, Stop/history boundaries, retained originals and lost-identity
witnesses precede cached success. The 4 MiB HTTP envelope is measured independently
of the differently serialized internal frame map. No pixels, time unknowns or raw
orientation are rewritten. Raw-only error aliases/cancellation behavior preserve
the legacy route's closed responses.

Two independent exact-source reviews approve the bounded delta. Transport review
executes 17 independently authored probes plus 30 selected owner cases; atomic
review executes nine independent probes plus 28 selected cases. They cover auth/
capability/header precedence before body consumption, strict JSON, exact byte and
canonical ceilings, separate replay namespaces, current fences, transaction exit
and cancellation. These overlapping review counts are not added to main's total.
Reports are retained locally as `/tmp/backend-raw-http-transport-review.md` and
`/tmp/backend-raw-http-atomic-review.md`; permanent regressions are in the delivered
[Backend checks/evidence](../backend/p0-raw-ingress-http.md).

## Verification on integrated main

At `61401a1`, the following focused command passed **472 checks in 22.55s**:

```sh
.venv/bin/python -m pytest -q \
  services/api/tests/test_raw_ingress_http.py \
  services/api/tests/test_raw_ingress_http_limits.py \
  services/api/tests/test_ingress_http.py \
  services/api/tests/test_raw_frame_ingress.py \
  services/api/tests/test_control_http.py \
  services/api/tests/test_capture_frames.py
```

The three unchanged independent probe files copied to
`/tmp/lead-main-raw-http-checks` passed **34 checks in 1.75s** against main, using
explicit file paths, `--import-mode=importlib` and main's pytest configuration.
Production HTTP/capture/Learning module paths were asserted to resolve inside main.
One initial directory invocation collected no tests because the probe filenames
start with `review_`; the explicit-file retry above is the executed evidence.
The preload causes one benign pytest assertion-rewrite warning, not a failed check.

Eight of those checks exercise the complete actual in-process ASGI POST →
authorized stored metadata/bytes → `prepare_stored_process_context` path. Synthetic
owned sources and PNG/ink fixtures remain explicitly synthetic. Unknown timing and
mirrored orientation 7 survive byte-exactly; reopened replay and detached-client
mutations preserve originals. Permission loss or a missing original after byte
resolution withholds the whole packet on its final current read; async/Future
cancellation propagates. Stop refuses live POST replay while permitting separately
authorized historical reading. No detached fallback or live/presentation claim
follows from retained data. The old route still rejects the raw wrapper.

These are MemoryStore/ASGI checks, not another PostgreSQL, native network or device
campaign. Existing Backend migration 0003 and its earlier dedicated `lc_p0_test`
evidence remain separate. No database operation, runtime restart, user-preview
change or Paperclip action occurred.

## Next dependency and acceptance boundary

iOS's existing task `handoff_63bc0c142d28c594c19f5d6fafe8d405` remains the single
native request/retry/ACK implementation. Its actual start is already recorded;
do not duplicate it. Lead next reviews its delivery, executes the existing native
check/build workflow on that exact source, and composes its actual emitted request
fixtures with this HTTP handler and the stored Learning path. Pure mapper fixtures
alone do not establish native request-producer compatibility.

Trusted runtime bootstrap and device transport remain separate from these synthetic
test identities. No product provider is selected/activated. Signing/device access,
real AI receipt/freshness, original-screen cross-app ink and actual Notability import
retain their explicit gates. Both core §7.1 gates and the full editable-ink loop
remain unaccepted; this component does not replace the original-screen product.
