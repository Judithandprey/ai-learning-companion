# Stored-context preparation: bounded independent review

**APPROVE Learning `cd2533bc09b329db870411dcce7271497ee1ec25` together with the separately reviewed Backend cancellation correction `09669d654fddb76af4be5a38e5c6052160239dbe`. No additional blocking defect found.** The earlier expected cancellation failure was reproduced normally, retained, then passed with the actual Backend correction; it was never skipped, xfailed or masked.

Scope: only Learning parent `ae4ebd5` → `cd2533b` (48-line function addition, README, new evaluation file, delivery evidence), on exact main `fc1644395590634e2d732a304548c898efc545cc`. Affected source is unchanged from the assigned `7dfb9ea` baseline. Read the full function, existing composer/image/canonical helpers, actual authorized reader/resolver, new tests and delivery report; refreshed current task, decisions and affected original/English R07/R29/R30/R46/R51/R52/R58 and acceptance clauses under current workflow/PONYTAIL LITE. This is a bounded reuse of existing callables, with no new storage, protocol or provider boundary.

## Actual independent checks

Isolated candidate: `/tmp/stored-context-preparation-review-_139awg1`, extracted from `fc16443`; only the exact `ae4ebd5..cd2533b` patch applied initially. Main and worker trees were not changed. Existing dirty iOS workflow was preserved.

1. New stored-context test file on Learning-only candidate: **40 passed, 1 failed in 2.03 s**. The sole failure was `test_actual_adapter_resolver_cancellation_with_valid_reader_withholds_packet` at line 317: `DID NOT RAISE concurrent.futures.CancelledError`. This is the already-assigned Backend adapter dependency, not a new Learning defect.
2. Six additional independent probes in scratch `test_review_stored_context.py`: **6 passed in 0.69 s**. Different/extra selected records and foreign/missing/extra sources all fail before any image callback. A 1024-byte output budget omits the entire selected record, attaches zero bytes and still performs the same complete final read; a changed omitted reason withholds the result.
3. At lead direction, applied only `9e40baa..09669d6` to the same isolated candidate. Reran the same new test file: **41 passed in 1.92 s**, including the actual adapter cancellation case. Backend correction itself is independently assigned to control_review; no duplicate adapter campaign was run here.
4. `git diff --check ae4ebd5 cd2533b` passes. A second bounded source review of final-read/canonical/exception boundaries found no additional defect (`/tmp/stored-context-boundary-review.md`); that reviewer did not execute tests.

Exact test commands, from the scratch candidate:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider tests/evals/test_stored_process_context.py
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider test_review_stored_context.py
# Apply the exact Backend correction; rerun the first command once.
```

Patches are retained as `learning.patch` and `backend-cancellation.patch` in that scratch directory. Tests use in-process ASGI/MemoryStore and project-authored synthetic data. No listener, PostgreSQL, browser, provider, preview or device execution.

## Behavior assessed

- IDs are validated as 1–100 unique explicit identifiers, frozen in order, and passed as separate list copies. Caller/reader argument changes cannot retarget the second read. Initial returned metadata is deeply detached before composing; result values are independently detached.
- Reader output must have exactly `{batch, sources, frames}`, a valid historical ProcessBatch and exactly the selected ordered records. Existing composition validates every record/source/frame relationship before byte resolution, including records later omitted. Foreign/extra/missing sources, extra records, attempt scope and invalid bindings cannot gain access through the wrapper.
- The first full canonical snapshot is compared against the **same complete final selection**, independently of output metadata and image budgets. Frameless text/reasons, included images and omitted records remain within final-read authorization scope. Denied/missing/corrupt/different final metadata withholds everything; no partial result, retry or dispatch callback exists. Mapping-key order alone does not change canonical metadata; record-array order remains significant.
- Reader errors propagate. Exposed asyncio and Future cancellation stops immediately without subsequent resolution/re-read/retry. The actual Backend correction now exposes the previously swallowed Future cancellation and the normal integration regression passes. Ordinary missing image bytes still remain an explicit gap if complete metadata stays authorized.
- Exact original record/source/frame values, PNG bytes, parent references, missing reasoning and ordering are retained. Historical context IDs are not upload IDs/ACKs; stopped or withdrawn capture can yield presently authorized history without restarting capture. Existing `not_attested`, `not_granted` and `unknown` flags remain unchanged.
- Complete reads each retain the 4 MiB bound independently of returned metadata/image limits. The new function adds no production API route, callback, transport authorization or dependency. Existing composer/v1 implementation is unchanged.

## Integration and truthful limits

Integrate the two scoped owner deltas without bringing their branch ancestry. The delivery report's before-fix failure remains valid historical evidence; append the combined passing result rather than rewriting it as an originally green delivery. Main's combined checks remain lead-owned.

The injected reader is trusted to perform fresh coherent authorization; substituting a cache would violate that callable contract. Successful preparation establishes its **last check**, not an atomic provider send, permission lease or durable future-use authority. Queued/cached/later send/display still needs current source and assistance permission at that actual boundary. These tests establish no provider receipt, live device observation, editable-ink delivery, Notability import or core-gate acceptance.
