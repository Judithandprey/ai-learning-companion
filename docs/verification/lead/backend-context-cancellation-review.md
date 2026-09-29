# Backend context cancellation — defect reproduced

Baseline: exact main `f022165d4b067cc5aff53c707a426a9d9ad39914` (reader code integrated through `7dfb9ea`). Inspected only the reported cancellation boundary in `services/api/process_context.py`, `image_resolver.py`, existing Learning composer and the current P0-05/10 task, which explicitly requires unchanged cancellation propagation. No general re-review. Main/worker files and dirty held iOS workflow were not edited; no DB, listener, provider, device or network action.

**Disposition: correction required in both Backend adapters.** The ordinary operational-error sanitizer is swallowing standard synchronous Future cancellation before Learning can propagate it.

## Actual reproduction

The injected current guard executes the standard library operation:

```python
future = concurrent.futures.Future()
assert future.cancel()
future.result()  # raises concurrent.futures.CancelledError
```

Tests use the actual `AuthorizedProcessContextReader` and `AuthorizedImageResolver` with existing synthetic in-process HTTP registration/original/frame commit fixtures and MemoryStore. Transaction enter/exit fault injection wraps the actual existing transaction. First/final guard injection runs the normal current-token guard before the cancelled future.

| Adapter / injection | Actual result | Required result |
| --- | --- | --- |
| Reader: first guard | `DomainError(503, "unavailable")` | Propagate `concurrent.futures.CancelledError` |
| Reader: final guard | Same 503 | Same cancellation |
| Reader: transaction enter | Same 503 | Same cancellation |
| Reader: transaction exit | Same 503 | Same cancellation |
| Resolver: guard | `{"status": "unavailable"}` | Same cancellation |
| Resolver: transaction enter | Same unavailable result | Same cancellation |
| Resolver: transaction exit | Same unavailable result | Same cancellation |

One composed regression commits a second real synthetic process record through the existing ASGI ingress, reads both with the current metadata adapter, and passes the actual cancelled Backend resolver into unchanged `compose_process_context`. Actual output:

```text
composer/actual_resolver: guard_calls=2, error=NoneType,
images=[{'status': 'unavailable'}, {'status': 'unavailable'}]
```

Expected: abort on the first cancelled resolution, propagate cancellation and never visit the second item. The existing composer already explicitly propagates Future cancellation, but receives only ordinary gap objects from this resolver.

All seven matching ordinary `RuntimeError("PRIVATE diagnostic should not escape")` controls passed: reader still sanitizes to 503/unavailable, resolver still returns unavailable. No diagnostic text escaped. Every case verified unchanged stored documents and a released transaction. This is a cancellation/lifecycle defect, not evidence of authorization or original-byte leakage.

## Cause and smallest correction

- `services/api/process_context.py:79–82`: broad `except Exception` converts the standard Future exception into 503.
- `services/api/image_resolver.py:48–51`: the same broad catch converts it into an ordinary unavailable-image result.
- `concurrent.futures.CancelledError` derives from `Exception`; existing BaseException handling therefore does not protect this synchronous cancellation path.

Explicitly re-raise `concurrent.futures.CancelledError` before each generic Exception sanitizer, as the existing Learning composer does. Preserve unchanged propagation, current asyncio/BaseException behavior, current DomainError mapping, ordinary-error sanitization, auth checks and transaction cleanup. No new framework, callback, schema or transport is needed. Backend owns the correction; no worker was contacted by this review.

## Reusable failing probe and command

Isolated archive: `/tmp/backend-context-cancellation-f3cj1y3g`, made from exact `git archive f022165d4b067cc5aff53c707a426a9d9ad39914`.

Probe: `/tmp/backend-context-cancellation-f3cj1y3g/services/api/tests/test_context_cancellation_review.py`.

Run from that archive:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -s --tb=short \
  services/api/tests/test_context_cancellation_review.py
```

Actual result: **8 failed, 7 passed in 1.06s; exit 1**. Seven direct cancellation cases plus the composed cancellation case fail; seven ordinary-error controls pass. Full retained output: `/tmp/backend-context-cancellation-output.txt`.

A first local probe run accidentally used the injected failing transaction again during its postcondition snapshot read. That harness error was corrected by restoring the original transaction before inspection; only the final counts above are the definitive evidence. No production source was changed, and no broad test campaign was repeated.

After the owner's actual correction, replay this same 15-case probe on the isolated corrected candidate, then relevant existing Backend/Learning cancellation and error-boundary tests. All results here are synthetic local execution, not PostgreSQL/device/provider acceptance.

## Correction 09669d6 — APPROVE

Reviewed only `9e40baa159387f9f544f7debdd18fbb7ce83b96d..09669d654fddb76af4be5a38e5c6052160239dbe`: two explicit standard Future cancellation imports/rethrows, fourteen focused test cases and evidence. Applied only those five changed/added files to the existing isolated `f022165` archive, asserting the four modified files matched the correction's parent first. Main and workers were untouched. The retained 15-case probe was unchanged (SHA-256 `de8211a561d63f056e51b290fc63530284e98c3e0dd9b977106cd97f0b3a58f7`).

Replayed the **same command and same 15 probes** above. Actual result: **15 passed in 0.94s, exit 0**. All seven direct cancellation paths now raise `CancelledError`; all seven ordinary-error sanitization controls retain their prior outcomes. The composed regression now prints:

```text
composer/actual_resolver: guard_calls=1, error=CancelledError, images=None
```

No second item is visited or partial result returned; every storage/transaction postcondition passes. Full corrected output: `/tmp/backend-context-cancellation-correction-output.txt`.

Source review confirms bare re-raise preserves the original exception. Existing DomainError handlers and generic operational-error sanitizers are unchanged. No catch was widened to BaseException: asyncio cancellation and KeyboardInterrupt remain outside these handlers, and the new owner tests explicitly assert exception identity for those cases. Transaction-read cancellation is covered by the same outer exception boundary and new owner tests. Those fourteen tests were read; the owner-reported 149-case run is not represented as an additional independent run here.

Disposition: **APPROVE this correction for lead integration with the separately reviewed Learning consumer**. Original defect evidence above is preserved and closed by the exact replay. No broad suite, DB, native/device or provider campaign was run, and no other HOLD is changed.
