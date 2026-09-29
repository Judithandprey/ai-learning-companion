# Backend capture-ingress HTTP integration review

**HOLD for two narrow medium corrections.** Candidate `01241958a5810e2ed81512e6650f480c10a87fd7`, parent `c8acd23adc70e182d82d4df546a2fd16dca9fb13`; reviewed only its seven-file delta applied cleanly to exact main `69a719ca89b1dbdf32012a168f633fc8cf34f90a` in `/tmp/ingress-http-review-znysfg0g`. Main and worker files were not changed. Workflow, affected canonical requirements/English and the reviewed released 0.2.4 contract remain unchanged from the preceding contract review. PONYTAIL LITE applied; no protocol expansion recommended.

## 1. Cached HTTP ACK can return pending original receipts

`services/api/capture.py:463–469` validates cached ACK with released `validate_ack`, which deliberately permits `pending` receipts for legacy capture. The new HTTP ingress requires every artifact receipt to be `verified` and documents no pending-blob success.

Reproduction: complete valid source/original/frame POST, then alter only the first cached `capture_replay.response_json` artifact status from `verified` to `pending`. Exact HTTP retry returns **200**, carrying that pending receipt, despite rechecking intact original bytes. No store mutation occurs. This inconsistent retained ACK should return **503 unavailable**, not a successful new-ingress response.

Portable script: `/tmp/ingress-http-review-znysfg0g/review_probe.py`. Run from that directory with `PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python review_probe.py`. This deliberately corrupts only synthetic MemoryStore data, not a production database.

Narrow owner action: enforce all-verified cached receipts for the explicit HTTP envelope branch, preserving legacy/internal pending semantics. Regression: valid exact replay still returns the exact original ACK; one cached pending receipt yields 503 and no writes. Root reproduced and dispatched `handoff_198c8e0ac2c5b7a9ce4d34622703a23f`.

## 2. Unissued lower source versions are misclassified as lost storage

`services/api/display_sources.py:43–45` treats an absent snapshot with `current_version >= requested_version` as evidence of prior commitment. Existing `Archive.import_fixture` supports sparse immutable versions; importing only version 3 is valid. Version 1 was never issued.

Reproduction with retained versions exactly `[3]`: existing `OriginalArtifacts.read(..., check_retained=False)` returns **404 reference_not_found** for version 1, while new ASGI original GET and valid original PUT for version 1 both return **503 unavailable, retryable:true**. Storage stays unchanged. A greater-version head alone cannot establish loss of an earlier snapshot.

Portable script: `/tmp/ingress-http-originals-review-cctz_b8g/sparse_version_probe.py`; run with the same interpreter from its directory. Independently reproduced by the originals subreview, this reviewer, and subsequently root. Narrow owner action: use exact-version retained evidence (or equality with the committed current version), preserving 404 for never-issued lower versions and 503 for genuine retained loss. Root dispatched `handoff_4e5abacfb7b3b7fff37db7149173e287`.

## Passed bounded evidence

- Candidate delta applied cleanly to isolated main; default `app.py`, `auth.py`, existing control app, released contracts, migrations and dependencies are not part of the patch. Opt-in factory has no module-level app, environment credential/DSN lookup, default route mounting, CORS grant, producer start or executor activation.
- Representative ASGI command from the isolated candidate: `PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_ingress_http.py -k 'complete_http or resolves_consumed or complete_envelope or known_stopped or current_access_fences or missing_committed_evidence or stage_or_commit or token_expiry or opt_in_surface or streamed_raw_limits'` — **30 passed, 58 deselected**.
- Independent `/tmp/ingress-http-review-znysfg0g/review_adversarial.py` — **9 actual ASGI probes passed**: producer/independent stop/membership changed under the actor lock; token revoked during request-body reading; cached ACK withheld when transaction exit fails; nested artifact-array replay order; ancestor original tombstone; missing ancestor with only ACK witness; missing ingress capability rejects before body consumption. Refusals leave stored documents unchanged.
- Originals subreview ran **3 focused cases** covering stop/withdrawal historical reads and ACK-only original-loss refusal. Its report is `/tmp/ingress-http-originals-review.md`.

Actual source review confirms current auth and producer resolution share the actor transaction; frame HTTP equality retains ordered full wrappers in the existing replay row; current lifecycle, ancestor, original-byte and deletion checks precede cached success; receipts escape only after transaction exit. Raw request bounds precede decoding and source-scoped original responses validate exact retained bytes. Apart from the two findings above, no additional blocker was found in this bounded review.

Owner-reported **88 new / 477 existing** checks are separate evidence, not this review's execution count. No full suite, DB, socket listener, browser, provider, device or user-preview operation ran. In-process MemoryStore tests do not establish durable deployment/restart or physical capture/AI acceptance. Root separately reported successful actual HTTP-callable-to-Learning composition; that was not rerun here. Next step is only the two corrective deltas and their decisive regression probes.
