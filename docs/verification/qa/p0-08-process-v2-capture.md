# QA check: process capture contract 0.2.0 at main e63b28f

- **Candidate:** exact main `e63b28f187eaf9577273c5131b65e7b9cc33646e`, with
  `packages/contracts/process_v2`, P0-08 and ADR 0002 §§2–5.
- **Test copy:** a `git archive` in `/tmp/qa-e63/repo` with lockfile installs.
- **Merge:** `team/qa` merged main normally (`0189417`) so the QA regressions run
  against the same package.
- **Environment:** WSL2 Ubuntu 26.04.1, Python 3.14.4 (jsonschema 4.26.0),
  Node 24.21.0, TypeScript 7.0.2.
- **Scope:** the capture slice only. These are schema and local-helper checks. They
  do **not** cover token authentication, DB durability, stored parents, deletion,
  locking, a live endpoint, providers, devices or G7.

## Reproduced

| Check | Result |
| --- | --- |
| `bash scripts/check.sh` (exact copy) | exit 0: **591 passed / 14 xfailed**; web 80 node tests, typecheck and build pass ([log](p0-08-process-v2/exact-main-check.log)) |
| `python -m packages.contracts.process_v2.generate --check` | exit 0 |
| `pytest packages/contracts/tests` / `test_process_v2.py` | 221 passed / 121 passed |
| 0.1.0 frozen bytes | `schema.json`, `validation.py`, `generated/*`, `examples/*`, `__init__.py`, `HTTP.md`, `README.md`, `generate_types.py` and `generate_openapi.py` are byte-identical to `7fadd15` |

## QA regressions

`tests/e2e/test_p0_08_process_v2_capture.py` gives **62 passed, 5 strict xfail**.
The passing checks cover:
- the 11 frozen v1 files, compared with `git show 7fadd15`;
- default `validate` does not know the process definitions;
- v1 and v2 payloads are rejected by the other version;
- unknown versions, kinds, fields and delivery modes are rejected;
- generated artifacts are current;
- importing v2 does not mutate the v1 schema;
- authority mismatch or withdrawal in 8 variants;
- stopped live delivery, and the pre-stop historical boundary (≤, >, `None`);
- withdrawn transmission also denies historical replay;
- stale attempt relation revisions;
- frame binding: accepted, plus 9 single-field mismatches;
- exact ACK partition: dropped, duplicate and extra records;
- `verified` only with an independent identity of matching size and type;
- immutable artifact references and ACK owner/stream;
- canonical bytes ignore transport fields and key order, but change with owner,
  stream or content, and keep NFC and NFD text distinct;
- NaN, ∞, 2^53 and lone surrogates are rejected;
- 20,000-level nesting is rejected cleanly by both v1 and v2.

## Findings

A background review covered the five scope areas. Five Opus 5.5 reviewers wrote
Python probes on byte-identical copies, and an adversarial verifier re-ran each
claim. I reproduced QA-14 personally and extended it to the v1 HTTP endpoints.
Full record: [review-findings.json](p0-08-process-v2/review-findings.json).

| ID | Severity / kind | Finding | Reproduction → actual | Owner |
| --- | --- | --- | --- | --- |
| **QA-14** | **medium / crash path** (a gap in the QA-12 fix; affects frozen v1 and v2) | A ~100 KB JSON body that `json.loads` accepts, with an array nested ~48,000–57,000 levels inside a text field, makes `validate()` raise a **bare `RecursionError`**. jsonschema's error construction overflows while building the instance repr (`_keywords.py:287`). The finite-JSON guard does not fire, because the 3.14 `json.dumps` handles that depth. Through the in-process backend, an authenticated `POST /v1/events:batch` or `POST /v1/sources` propagates `RecursionError` (a 500) instead of 422. At depth 20,000 it is 422. From depth ~400, `str(e)` and logging the `ValidationError` also raise `RecursionError`. | Events at depths 48,000, 52,000 and 57,000 → `RecursionError propagated`; 20,000 → 422. v1 `validate("EventBatch", …52000…)` and v2 `validate("ProcessBatch", …52000…)` → bare `RecursionError`. | lead (shared `validate`: bound depth before jsonschema, or map `RecursionError` to `ValidationError`); backend (`body()` maps residual failures to 422) |
| QA-P08-01 | low / missing local invariant | One `ProcessBatch` may bind the same legacy `frame_id` from two records with contradictory source version, media position and artifact hash. Only a later `validate_record_frame` catches it, one record at a time. The batch already rejects conflicting artifact references. | strict xfail | lead |
| QA-P08-02 | low / missing local invariant | Standalone `validate("ProcessBatchAck")` accepts one `artifact_id` with conflicting immutable references (sha, size, type) across receipts. `validate_ack(batch, …)` does catch it. | strict xfail | lead |
| EQ-NUM-01 / AUTH-06 / FRAME-02 | low / doc gap | `canonical_record` bytes differ for `1` versus `1.0` (including integer fields that the schema accepts as `N.0`) and for `0` versus `-0.0`. The helpers compare these numerically. It fails closed, as a spurious non-retryable 409 `record_conflict` on replay from a producer that re-serializes numbers. Decide whether to normalize integral numbers or reject `N.0` in integer fields, and document it. | reproduced | lead |
| EQ-NUM-04 | low / doc gap | Arrays used as sets (`causal_parents`, `limitations`, `artifacts`) are order-sensitive in canonical bytes, and the README does not say that the order is part of identity. A producer that iterates a hash set can get a false 409. | reproduced | lead |
| AUTH-01 | low / hardening | `CaptureAuthority` fields are not type-checked. A space-delimited scope **string** such as `"process:capture.read notes:write"` passes the membership test as a substring, and a string `"false"` flag is truthy. This is a backend wiring hazard: the snapshot is trusted input by design. | reproduced | lead / backend |
| ISO-3 | low / spec gap | There is no size status or code. Schema-valid batches can reach ~84 MB, and the README says to split, but a size rejection could only be a non-retryable 422 `invalid_request`. | reproduced | lead |
| ISO-1, ISO-5 | low / info | The shared tests pin 6 v1 files and do not pin the examples, `__init__.py`, `HTTP.md` or `README.md`; the QA test now pins 11. pytest alone does not compare `generated/schema.json` (`generate --check` in `check.sh` does). | — | lead |
| ISO-2 | low / observation | The published JSON Schema, OpenAPI and TypeScript accept payloads that the runtime validator rejects: retryable conflicts, site feedback attributed to the user, self-causal records. TypeScript also drops `minItems`. This is as documented ("structural only"). Encoding them with `if`/`then` would help Web and Swift consumers. | — | lead |

Informational or service obligations (untested, not defects):
- **AUTH-02:** the stop fence is sequence-based, so a post-stop record in a free slot
  at or below the boundary passes locally; stored-parent and slot checks belong to
  the backend.
- **AUTH-04:** the boundary is ignored while live capture is allowed, as documented.
- **AUTH-05:** an offline original pinned to a stale relation revision can only be
  resubmitted by changing its canonical bytes; this needs a rule.
- **AUTH-07/FRAME-06:** `frame_id` is resolved only by the service.
- **ACK-01:** the same artifact can be `pending` on one receipt and `verified` on
  another.
- **ACK-05/06:** cross-batch duplicate-versus-conflict checks and owner-scoped blob
  verification.
- **EQ-SVC-05:** U+0000 and `-0.0` pass validation; the round trip through
  PostgreSQL `jsonb` has not been tested by backend.
- **FRAME-03/04/05/07, EQ-NUM-02, ACK-03/04.**

## Decision

- The capture slice's version isolation, trusted-authority comparisons, stop and
  historical boundary, frame binding, exact ACK partition and replay equality hold
  **at the schema and helper level**, with the low gaps above.
- **QA-14 is a medium crash path in current main.** It affects the frozen v1 HTTP
  endpoints as well as v2 `validate`, and should be fixed with regressions at the
  ~52,000 depth.
- Nothing here is authentication, persistence, provider, device or G7 acceptance.
  There is no live v2 endpoint, and no process-aware teaching is enabled.
