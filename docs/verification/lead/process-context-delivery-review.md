# Supplied process-context delivery review

Lead follow-through: the finding below describes the original candidate. Owner
correction `6602500` is reviewed/integrated as `4a30b9d`; 140 main checks and the
original cancellation probe pass. See [integration evidence](display-source-adoption.md#supplied-context-repair-integrated).

**HOLD for one narrow cancellation correction.** Reviewed Learning commit 6ebbeae4a6b07de0dd25a0907883796d3173758a against its parent, applied alone to isolated main 2ccf5b9109476b7214620ec0b8e66d10ee0df9d6. No production files changed. Actual Backend composition remains the lead's separate check.

## Blocking finding: synchronous Future cancellation is swallowed

`services/learning/process_context.py:152–153` catches every Exception from image resolution. A synchronous resolver that calls `concurrent.futures.Future.result()` on a cancelled future raises the standard-library `concurrent.futures.CancelledError`, which inherits Exception. Composition converts it to `resolver_failed`, invokes the next item's resolver, and returns a normal packet. This contradicts this callable's declared cancellation propagation (`process_context.py` docstring and `services/learning/README.md`). It is new-caller behavior; the shared helper and existing v1 path still propagate that exception.

Exact reproduction: `/tmp/process-context-review-y3f46ip9/adversarial_probe.py` creates two valid supplied records and one cancelled standard Future; its resolver calls future.result(). Observed: `CANCELLATION_SWALLOWED {'calls': 2, 'images': [{'status': 'resolver_failed'}, {'status': 'resolver_failed'}]}`. Expected: propagate CancelledError on the first callback, without visiting the second item. No real provider or live authorization is implicated in this local reproduction.

Narrow owner correction: explicitly propagate standard Future cancellation before the ordinary Exception-to-gap handler, retain current BaseException/asyncio cancellation behavior, and add the two-item regression. No new contract, framework or transport is needed. Ordinary PermissionError/FileNotFoundError/operational failures should retain their documented gaps.

## Remaining assessment

- All supplied batch/source/frame metadata, including omitted records, is validated before byte callbacks. Exact owner/source/version/frame/artifact/device/session and display incarnation checks compose released validators. Extra/duplicate/foreign metadata is refused; absent named frames stay explicit gaps. Display descriptors do not acquire invented URLs, app names or OCR. Typed frame bindings remain proposed metadata, not evidence of committed originals.
- Whole records and complete source versions are copied; reasons, operation before/after states, actor attribution, coverage gaps, causal parents, clock domains, original array order and original bytes remain intact. Outside-context/budget-omitted parents stay unknown. Opaque non-frame ink remains references only; no editable-ink or diagnosis claim is added.
- The metadata reservation is conservative, and includes the whole returned dictionary except image.data. Actual status metadata and included-parent labels fit the reservation. Image bytes have separate per-item/total/pixel bounds, with exact returned-frame/hash/type/dimension validation. Repeated images are counted per attachment. Budget omissions skip resolution and never truncate originals.
- Detached input/output copies and the final original-input fingerprint retain the existing no-mutation/coherent-input boundary. These checks do not establish authorization: README correctly requires coherent currently authorized metadata and a final permission check. Packet flags remain authorization/commit/live/provider `not_attested`, presentation `not_granted`, completeness `unknown`, even when batch delivery_mode says live.
- Bounded `images.py` subreview found no v1 regression: extracted limit/PNG/result checks preserve validation order, exception propagation, frame equality, byte accounting and archive mutation checks. Details: `/tmp/process-context-images-review.md`. Current requirements, unknown provenance, immutable originals, source/time relations and no premature-help semantics remain intact. No shared schema or provider route is added.

## Independent checks

Isolated candidate: `/tmp/process-context-review-y3f46ip9`; `git archive 2ccf5b9` plus only `git diff --binary 6ebbeae^ 6ebbeae`; apply-check passed.

```sh
PYTHONDONTWRITEBYTECODE=1 <repo>/.venv/bin/python -m pytest -q -p no:cacheprovider tests/evals/test_process_context.py -k 'whole_operation or all_records_validated or budget_omits or wrong_returned_frame or source_versions_stay or cancellation_is_not or display_incarnation'
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.:tests/evals <repo>/.venv/bin/python adversarial_probe.py
```

Run from the isolated candidate. Selected process checks: **13 passed, 58 deselected**. Probe additionally passes five metadata/byte/count boundary checks and rejects a late mismatched frame before any callback even under an omitting budget; it exposes the cancellation defect above. The child review independently passed **21 selected existing image tests**, without rerunning all 66. `git diff --check 6ebbeae^ 6ebbeae` passed. Owner-reported 71+66 tests are not represented as independent runs.

Applied PONYTAIL LITE: existing identities, validators and shared PNG code reused; no new service/state abstraction. No browser, service, provider, database, network or peer action performed, no frozen retrieval campaign rerun. Full capture-to-real-AI, editable ink, cross-app/device and Notability acceptance remain unverified. Lead handles the bounded Learning correction and subsequent integration.
