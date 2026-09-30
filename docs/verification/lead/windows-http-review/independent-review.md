# Backend Windows HTTP 0.2.10 review — HOLD

Candidate: `72e928a4bfd9664b2c733c7d32d8d14d2d2fb813`.
Parent normal merge: `e7e5620ee05ca0e0d3aefb0c2e36415e32de2be6` of released baseline `d6a444cb9af00cbc61d047d60806e6c888b0acca`.
Read-only exact candidate export: `/tmp/backend-windows-http-review-144laulg`.
Main later a05b763/a0e2fa8 changes are documentation; candidate code and released contracts reviewed at exact revision. Repository/worktree files were not edited, and the Backend tree remained clean.

**HOLD for one narrow inherited common-engine presence validation bug.** The new Windows route reaches an existing replay branch that treats a present empty receipt as absent. All 190 new author cases independently executed successfully; seven additional independent negatives passed, one failed. Lead has the exact failure and will assign one same-owner correction. No broader audit or implementation was performed.

## H1 — present corrupt receipt is treated as a new request

Candidate `services/api/capture.py:581–592` loads the current actor's capture_replay row and tests `if cached:`. Empty object `{}` is a valid document-store value, but is not a valid replay receipt. Because it is falsey, the key/fingerprint/source-list shape checks are skipped, exact_raw_replay is false, and the normal duplicate-record path constructs a new ACK. The write at `capture.py:747` replaces the corrupt row with a new receipt. The same truthiness branch exists in parent e7e5620; this is inherited shared-engine behavior exposed through the newly added Windows HTTP route, not a regression unique to a Windows decoder.

Minimal reproduction using the new delivery's windows_http fixture and actual in-process HTTP handler:

```python
ack = success(c, submit(c))  # HTTP200, disposition accepted
identity = ('capture_replay', key('POST', WINDOWS_ROUTE, 'windows-http'))
c.store._documents[USER][identity] = {}  # explicit retained-corruption injection
before = documents(c)
response = submit(c)  # exact same actor, key and ordered body
error(response, 503, 'unavailable')      # FAILS: actual HTTP200 duplicate
assert documents(c) == before           # required no-mutation expectation
```

Observed diagnostic: `EMPTY_RECEIPT_RESPONSE 200 duplicate`. Initial request was a valid, authorized, successful commit. On the corrupted-state retry the response remained ProcessBatchAck0.2.0 with verified artifact references but changed the original disposition from accepted to duplicate. The existing corrupt row did not receive the required fail-closed refusal. The no-mutation assertion is present in the original independent regression and is not weakened; execution stops at the preceding wrong-status assertion. Source inspection identifies the receipt rewrite path.

This is a deliberately injected coexisting corrupt retained row, not an ordinary client payload, ordinary source-deletion failure, observed PostgreSQL fault or public exploit. It matters here because released 0.2.10 explicitly requires corrupt/missing committed evidence to be unavailable and forbids reconstructing retained receipts from a submitted retry. Current authentication and intact bytes do not repair lost ordered replay identity.

Smallest correction: distinguish absence (`None`) from presence immediately after the actor-scoped replay lookup; validate every present replay row and reject a malformed/empty one before classifying new versus exact replay, returning an ACK or writing anything. Preserve intentional valid deletion markers, current authorization/lifecycle precedence, exact cached ACKs and ordered-envelope equality. Apply the shared guard without weakening legacy/raw/desktop/internal semantics; no new receipt store, wire, schema, migration or default activation is necessary. Regression should keep the actual negative/no-mutation expectation above and demonstrate normal exact replay still preserves the original ACK. Related-family presence cases can be focused according to the changed common branch; do not rerun unrelated campaigns.

## Reviewed positive behavior and scope

Read the complete production delta (capture, control, ingress app, composed app and trusted local runtime), all four new test modules, owner evidence/API documentation, the complete released windows_capture_ingress0.2.10 contract README and executable validators, and the relevant existing transactional/admission flow. Applicable workflow/ADR/source clauses are unchanged from the prior R1/L1 review and were compared at assigned revisions. Applied project PONYTAIL LITE by reviewing reuse of the existing actor transaction/store, not proposing a parallel implementation.

No other concrete blocker found in this bounded pass:

- All three factories default enable_windows_ingress to false and require an actual boolean. The route separately requires Windows0.2.10 capability, process.capture.v0.2 and process:capture. Capability membership does not imply original PUT/GET or control authority. Trusted runtime requires desktop_pixels profile before provisioning and preserves explicit fresh-consent behavior.
- ControlRegistry forwards the full released envelope into the existing actor transaction. The canonical digest includes every array order, versions and complete metadata; replay namespace uses actor plus POST/full Windows route/key, separate from the internal frame-map namespace. Object-member order alone remains irrelevant.
- Current token/account/source/membership/producer/Stop/withdrawal/generation/deletion checks remain before success; raw/composed PNGs and separate ink are verified. R1's retained/proposed image consistency remains before cached success. New and cached loss cases withhold output; history after Stop does not restart capture.
- The new Windows HTTP gap-only receipt prefix is recognized by the common producer-admission witness. Author cases actually exercise generic/internal plus legacy/raw/desktop HTTP routes, fresh and formerly cached successes, after both producer-profile markers are removed. Those eight cases passed independently as part of the 190.
- Strict auth/query/key/media/length/encoding/raw-size/JSON/version precedence and mounted closed error versions pass. Old routes remain closed to Windows; all gates can vary independently. Cancellation/body-task and staged-write failure cases preserve no-ACK/no-partial-write behavior. The evidence accurately distinguishes actual task cancellation from injected asyncio cancellation inside the synchronous transaction.
- Actual in-process composed HTTP ingestion reaches the production stored metadata reader, role-specific resolver and Learning consumer. Exact PNG/ink/source/record facts, gaps, unknown clocks, final revocation and ungranted presentation remain distinct. No synthetic provider/desktop receipt is invented.
- No contract, dependency, migration or default-app/preview activation is included. Updated docs honestly retain the actor-metadata scan cost and byte-vs-pixel-attestation boundary.

## Independently executed checks and runnable evidence

Exact existing interpreter: `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`.
Working directory for both commands: `/tmp/backend-windows-http-review-144laulg`.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_windows_ingress_http.py services/api/tests/test_windows_ingress_transport.py services/api/tests/test_windows_capture_runtime.py services/api/tests/test_windows_http_learning.py
```

Actual result: **190 passed in 8.07s**. These were independently run, not copied from the owner's 190-case report. The separate owner93 compatibility and3 existing-local checks were read but not rerun or added to this total.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -s -p no:cacheprovider test_review_http_independent.py
```

Actual result: **1 failed, 7 passed in 1.02s**.

The runnable independent source is `/tmp/backend-windows-http-review-144laulg/test_review_http_independent.py`; SHA-256 `4d5fded3dda977278c0aab3a9feec660f3d30ee31b265fa6aade5f274e8047d7`.
Its passing controls:

1. Cached Windows HTTP ACK fails closed on a conflicting unselected retained composed image, for same artifact ID and a distinct byte alias (2 cases).
2. Empty original_artifact_tombstone or capture_artifact_tombstone denies cached HTTP ACK for raw and composed roles (4 cases).
3. Principal scope reduction after receipt lookup under the actor lock is caught by the final current guard; no successful cached result or storage mutation (1 case).

The remaining case is H1, preserving 503/no-mutation expectations. Fixture identities, tokens and PNGs are explicitly synthetic. Retained-corruption probes are separated from normal-input and current-auth tests.

`git diff --check e7e5620 72e928a4bfd9664b2c733c7d32d8d14d2d2fb813` passed; Backend git status clean. No main/worktree edits, DB connection, listener/service, provider/native access, install, network or Chats occurred. Results are MemoryStore/in-process ASGI/component evidence, not PostgreSQL durability, Windows device permissions/capture, real AI, audio, Notability or full desktop acceptance.

Next action: Backend narrowly fixes present-receipt validation; independent retest reuses the unchanged failing case and affected good replay controls. Lead owns final integration/hash verification and QA release.
