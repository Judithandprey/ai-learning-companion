# Raw ingress 0.2.6 contract review — APPROVE

Reviewed the final seven-file uncommitted release snapshot, including the delegate's frozen tests and lead's final release-wording cleanup. Isolated copy: `/tmp/raw-ingress-contract-review-Vn2F41iI`. No repository/worker edits, native messages, handler execution, DB, browser, CI, device, network or provider work.

**No blocking defect found. Approve the pure additive contract only.** The new operation is separate from 0.2.4 and remains disabled/unimplemented at runtime.

## Actual checks

From the isolated snapshot, with `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python` and `PYTHONDONTWRITEBYTECODE=1`:

```sh
python -m pytest -q -p no:cacheprovider packages/contracts/tests/test_raw_capture_ingress.py review_raw_ingress_probes.py
# 183 passed in 0.73s, exit 0: 131 delegate cases + 52 independent review cases.
python -m packages.contracts.raw_capture_ingress.generate --check
# exit 0, including after final wording/regeneration.
python -m pytest -q -p no:cacheprovider review_raw_ingress_probes.py -k generated
# Final changed generated-description audit: 1 passed, 51 deselected, exit 0.
```

The initial independent 52-case run also passed before adding the final test file. Source/schema/types/test semantics did not change afterward. Final lead edits were README wording, Python docstrings and the matching OpenAPI description; their complete diff was inspected and copied into the isolated snapshot before the last generation/reference check. No extra 52/131-case execution is implied by that final one-case check.

Independent reusable probe: `/tmp/raw-ingress-contract-review-Vn2F41iI/review_raw_ingress_probes.py`. It covers all eight/unknown raw orientations and released full-binding agreement; invalid second-record source/clock/UTC/media/reference/stream membership; complete-batch causality/artifact conflicts; duplicate/missing/extra frames; outer/nested version isolation; a foreign frameless record versus trusted owner; full ordered envelope equality including raw fields; malformed, duplicate-key, nonfinite, invalid UTF-8/surrogate, over-depth and mutable-byte input; inclusive raw 4 MiB limit and canonical excess; exact-owner/record/reference/version/verification ACK failures; closed retry rules; old-reader rejection; copied released-definition equality; and every generated OpenAPI reference/auth/capability requirement.

## Findings and boundaries

- The complete ProcessBatch is checked once before per-record comparisons, preserving whole-batch semantics without repeated full-batch validation. Every non-null frame ID is resolved exactly once in the supplied frame set; same-frame reuse is valid. Local source/incarnation/full PNG-reference/clock comparisons agree with the released 0.2.5 helper, without fabricating a display descriptor or stored-original fact.
- Canonical equality includes the outer version, full batch, every raw descriptor and all array order. It does not substitute the internal frame-ID-map fingerprint. Object key order alone is irrelevant. Inputs are not normalized or mutated.
- Existing ProcessBatchAck 0.2.0 shape/correspondence is retained; the new success helper additionally refuses pending receipts and requires independently supplied verified identities. Structural generated ACK types can still express the old pending alternative by design; the route description and runtime helper impose verified-only semantics, without rewriting the released ACK.
- Generated references resolve; request and error objects are closed. Bearer authentication, `process:capture`, `process.raw-ingress.v0.2.6` plus `process.capture.v0.2`, mandatory Idempotency-Key and finite body bound are explicit. Final README precedence is unambiguous: auth/capabilities, query/key syntax, body transport/strict JSON, explicit versions, then generic body shape. These are future adapter obligations, not behavior implemented by pure helpers.
- Frameless and attempt records remain representable as existing metadata; the documented service still rejects unsupported shared-display frameless entries/unresolved attempt authority. Stored source/producer/original facts, all artifact checks, ancestors, current fences, deletion/loss witnesses and same-transaction HTTP replay remain mandatory before success or cached success. Historical stopped reads/ingress do not authorize new stopped original uploads.
- Compatibility tests pin generated 0.1.0–0.2.5 bytes. Old Frame/0.2.4 validators continue to reject raw input. This review grants no actual byte persistence, PNG geometry, orientation application, freshness, provider delivery, teaching permission or core-gate acceptance.

## Final reviewed SHA-256

Paths are relative to the repository. Only these seven delivery files are covered; root hooks and dirty project docs are lead-owned separately.

| File | SHA-256 |
| --- | --- |
| `packages/contracts/raw_capture_ingress/__init__.py` | `b0b7dbd3da903b29ca17eeb0cde1da0e70a27105ae744f956adb32639b961488` |
| `packages/contracts/raw_capture_ingress/generate.py` | `597acc105d5a46f5134775cfac699ab93a19277376441f427e4da1d63f47664c` |
| `packages/contracts/raw_capture_ingress/README.md` | `de16a991afc6636da453821ca2b5e17f103c8f8ca60f4196b16f2a90656ba756` |
| `packages/contracts/raw_capture_ingress/generated/schema.json` | `fb871be7e99e3acf7599c8513f57ac34f507bce9a568d917eb071ccbda235365` |
| `packages/contracts/raw_capture_ingress/generated/openapi.json` | `24153026572da2aaae0d2ecd629dc94cabbbb4cbeeb1d35fddc60ecaeed66ee7` |
| `packages/contracts/raw_capture_ingress/generated/contracts.ts` | `60d350e2a4fe6d7f50b0d82f54ecc287aeab0ef79cc2dd864b54368867396967` |
| `packages/contracts/tests/test_raw_capture_ingress.py` | `6b67a7d00fd7678d75a2f1d58998e50a25b9636a9d36fe4e8a988308d19bb18e` |
