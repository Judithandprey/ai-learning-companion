# QA-WIN0210-01: classify retained replay witnesses before filtering

Existing P0-04/09 correction assigned by Lead in
`handoff_bca7700c4dddc352b5c559b8a1e1e088`. Baseline
`5f80c0926f96d3afdb8da7a00c295b4f4e8fdd63` was normally merged into clean
`team/backend` as `73f3c42bbbbd22dbb0ea60d8db6197702cb70eeb`. Read the complete
QA report and relevant executable cases from `ee0faee` before merging; applicable
AGENTS/TEAM, role, workflow and source/English requirement files were unchanged.

## Reproduced failure

QA's Low-severity finding needs two deliberate retained-state faults: both
`producer_profile` fields are removed and a surviving Windows gap receipt is
replaced with `{}` or has `deleted` changed to integer `1` / boolean `true` while
all active fields remain. No normal route or writer produces these faults.

Before correction, the unchanged QA cases run with `--runxfail` produced
**5 failed, 1 passed, 48 deselected in 1.14s**. Both full-row deletion variants
accepted and committed fresh structured raw input; those variants and the empty
row also returned an older-family cached ACK. The empty-row fresh request already
refused through the absent-record scan. Original assertions were not weakened.

## Bounded correction

PONYTAIL LITE: reuse H1's existing receipt-shape validation in `_decode_ack`, rather
than introduce a new witness or archive. Validate the retained row before testing
its route prefix or interpreting its deletion flag. Only the exact nonempty-key
`{key, deleted: true}` erasure shape is skipped; any malformed active row, empty
object, invalid key, nonboolean deletion flag, full active row marked deleted, or
invalid ACK produces deliberate **503/unavailable** without a write or ACK.

The lookup path reuses that same classifier with its expected key, preserving H1
and its 404 erased-receipt result. Existing capture-engine stream-binding,
missing-parent, missing-artifact-reference and absent-record scans share the same
active-ACK iterator, removing the same truthiness filter from those sibling
callers. Their existing checks and short-circuit refusal order remain; no extra
record-based witness, new field or acquisition permission was added.

Intact Windows gap evidence still refuses lost-profile downgrade with 403.
Current authorization/Stop remain before replay success; genuine unmarked legacy
capture, exact ACK identity and intentional erasure semantics remain covered.
R07/R35/R36/R52 and A12/A14/A31 retain their full product acceptance outside this
data-preservation correction.

## Exact independent cases

QA owns `ee0faee:tests/e2e/test_p0_13_windows_ingress_qa.py`; its unchanged SHA-256
is `f5546cc4be4f0ac6214e0a8e9d41e0c7dcd6b1b6478a1364040f0390237c3f8c`.
The current baseline relocated producer PNG fixtures, so the exact QA test and
its original PNG/example files were extracted with `git show ee0faee:<path>` into
`/tmp/backend-qa-win0210-01-_9e303ye`, preserving their relative paths. The test's
imports execute this Backend worktree's actual production code via `PYTHONPATH=.`.
No QA-owned test, assertion, xfail marker or fixture was edited.

The same command before and after the production correction:

```sh
PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider --runxfail --tb=short -k malformed_gap /tmp/backend-qa-win0210-01-_9e303ye/tests/e2e/test_p0_13_windows_ingress_qa.py
```

After correction: **6 passed, 48 deselected in 1.15s**. This includes all five
former strict xfails and their fresh-empty control. Each unchanged case checks
the exact closed error and all retained documents unchanged. QA's crash spy
rejects a 503 caused by unexpected boundary exceptions. The new owned cases also
require the specific 503/unavailable outcome for malformed witnesses.

## Focused owned checks

New `services/api/tests/test_capture_replay_witness.py`: **36 passed in 3.18s**,
using the same interpreter with
`PYTHONDONTWRITEBYTECODE=1 -m pytest -q -p no:cacheprovider`.

- Twenty actual legacy/raw HTTP cases require malformed gap receipts to return
  exactly 503/unavailable for fresh structured requests and cached honest retries,
  with all documents unchanged. They also invoke the domain entry to distinguish
  intentional refusal from an unexpected exception masked by HTTP middleware.
- Four intact-witness cases retain 403; four exact-erasure controls preserve the
  existing skip semantics and ACK identity without inventing a new witness.
- Two genuinely unmarked old-client controls still accept valid structured capture
  and replay exactly; these do not obtain their permission by damaging a profile.
- Six bounded sibling checks cover malformed versus erased receipts in the stream,
  missing-parent and missing-artifact-reference fallbacks. Additional witness loss
  is explicitly injected only to isolate those existing scan branches.

The new test helper initially expected `dependency_missing` to be non-retryable;
its expectation was corrected to the existing released error contract. No
production assertion or QA-owned case was relaxed to obtain a pass.

Existing related checks: **74 passed in 3.26s** using the same interpreter with
`PYTHONDONTWRITEBYTECODE=1 -m pytest -q -p no:cacheprovider` and these targets:

```text
services/api/tests/test_capture_replay_presence.py
services/api/tests/test_windows_ingress_http.py::test_http_gap_receipt_prevents_profile_loss_fallback_on_older_entries
services/api/tests/test_windows_ingress_http.py::test_current_fences_precede_new_and_cached_http_success
services/api/tests/test_capture.py::test_source_deletion_scrubs_capture_content_and_replays_preserving_other_originals
services/api/tests/test_raw_ingress_http.py::test_http_replay_never_reconstructs_lost_committed_witnesses
services/api/tests/test_desktop_ingress_http.py::test_http_exact_replay_refuses_lost_or_corrupt_committed_facts
```

These preserve H1 across nine entry families, old-route downgrade refusal,
new/cached current fences, actual source erasure and missing/corrupt committed
facts. Unrelated transport, Learning, database and native campaigns were not rerun.
Independent read-only review found no blocker in classification, sibling callers,
valid legacy/erasure behavior or current-authority precedence. `git diff --check`
passed.

## Limits and next owner

Evidence is in-process ASGI/MemoryStore with explicit synthetic corruption. No
database, migration, listener, preview service, native display, provider or account
operation occurred. Default route/capability gates and v0.1–0.2.10 wire shapes are
unchanged. This is one demonstrated witness-classification repair, not a general
corruption audit or any new device/provider acceptance.

Next: Lead review/integration, then its single independent QA changed-path retest
after QA's currently assigned Windows display work. Backend did not dispatch QA
or restart completed PostgreSQL verification.
