# Present replay receipt correction

Existing P0-04/09 correction under Lead's P0-08 runtime delegation,
`handoff_4bcecb9d8991b05b8aafb952cb755e26`. Base delivery is
`72e928a4bfd9664b2c733c7d32d8d14d2d2fb813`. Read the complete review, original
probe and original results from exact Lead revision
`181fb6a03dfe09add3af6e4045537bffdd9f161c` using `git show`, preserving the clean
Backend branch and base delivery. Relevant AGENTS/TEAM, role, workflow and
source/English requirement files have no differences between those revisions.

## Failure and bounded change

The unchanged independent H1 probe first successfully commits Windows HTTP
capture, then deliberately replaces its existing `capture_replay` row with `{}`.
On base `72e928a`, exact retry returned **200 / duplicate**, failing the expected
503/no-mutation assertion: **1 failed in 0.48s**. This is injected retained
corruption, not an ordinary request, observed database failure or claimed exploit.

PONYTAIL LITE: fix the existing actor transaction's presence branch. `None` alone
means absent. Every present receipt must have the stored key and a valid existing
active shape (false deletion flag, lowercase SHA-256 fingerprint, serialized ACK,
and sorted unique nonempty source identifiers). Parse the retained ACK with the
existing decoder before replay classification and reuse it for the later unchanged
batch/original/received-time checks. Invalid retained rows yield 503/unavailable
without replacement, normalization, writes or ACK. Exact existing erasure markers
`{key, deleted: true}` retain 404. Current authorization, source and Stop checks
still precede receipt lookup. Valid changed requests still conflict; valid exact
replay retains the original ACK, including its accepted disposition.

No new persistent shape, archive, protocol, migration, dependency or runtime gate.
The correction applies to the shared capture engine only; it is not a repository
wide corruption audit or a change to other replay stores.

## Actual verification

Interpreter: `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`.
All cases use explicit synthetic identities/PNGs and in-process ASGI/MemoryStore.

The independent source remains unchanged at
`181fb6a03dfe09add3af6e4045537bffdd9f161c:docs/verification/lead/windows-http-review/original-defect-probes.py`.
Its SHA-256 is `4d5fded3dda977278c0aab3a9feec660f3d30ee31b265fa6aade5f274e8047d7`.
It was copied read-only to `/tmp/backend_windows_http_original_probe.py` and run:

```sh
PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -s -p no:cacheprovider /tmp/backend_windows_http_original_probe.py::test_present_empty_http_receipt_cannot_recreate_ack
```

After correction: **1 passed in 0.65s**, diagnostic
`EMPTY_RECEIPT_RESPONSE 503 None`, with the unchanged retained-state assertion
executed. The already-passing seven unrelated independent cases were not repeated.

Focused author run:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests/test_capture_replay_presence.py
```

**38 passed in 1.79s**. Nine shared-engine families (generic events, and
legacy/raw/desktop/Windows internal and HTTP entries) each prove genuine absence
commits, intact exact replay preserves the original accepted ACK with no changes,
and replacing that receipt with `{}` produces 503 without mutation. Focused
malformed shape cases, exact deletion markers, current authorization/Stop priority
and valid changed-body conflicts cover the modified branch without a broad
corruption-by-family matrix.

Existing shared-engine regressions: **56 passed in 3.69s**. Selected cases cover
generic record/slot conflicts, Stop and actual source erasure; legacy HTTP pending
ACK/current access; raw/desktop ordered replay and corrupt/missing witnesses;
Windows ordered replay, final token checks and late transaction failure/cancellation.
Unchanged transport/OpenAPI/runtime/DB/native suites were not repeated. Exact
selected nodes, passed to the same `python -m pytest -q`:

```text
services/api/tests/test_capture.py::test_record_and_slot_conflicts_roll_back_mixed_batch_and_replay
services/api/tests/test_capture.py::test_unknown_or_exceeded_stop_boundary_rejects_historical_replay
services/api/tests/test_capture.py::test_source_deletion_scrubs_capture_content_and_replays_preserving_other_originals
services/api/tests/test_ingress_http.py::test_http_replay_rejects_cached_pending_receipt_without_repairing_it
services/api/tests/test_ingress_http.py::test_current_access_fences_previously_successful_http_replay
services/api/tests/test_raw_ingress_http.py::test_http_replay_binds_complete_ordered_wrapper
services/api/tests/test_raw_ingress_http.py::test_http_replay_never_reconstructs_lost_committed_witnesses
services/api/tests/test_raw_ingress_http.py::test_corrupt_retained_raw_evidence_is_sanitized_not_repaired
services/api/tests/test_desktop_ingress_http.py::test_http_key_binds_complete_ordered_envelope
services/api/tests/test_desktop_ingress_http.py::test_http_exact_replay_refuses_lost_or_corrupt_committed_facts
services/api/tests/test_windows_ingress_http.py::test_http_replay_binds_whole_envelope_and_all_array_order
services/api/tests/test_windows_ingress_http.py::test_final_token_recheck_withholds_staged_or_cached_http_success
services/api/tests/test_windows_ingress_http.py::test_late_failure_or_cancellation_rolls_back_ack_and_all_writes
```

Independent read-only review found no blocking issue in receipt presence, writer
compatibility, erasure handling, ACK reuse or authorization/Stop precedence.
`git diff --check` passed. Earlier 190-case delivery evidence remains historical;
it is not added to these corrective-run counts or claimed to cover H1.

## Limits and next owner

No real database, listener, user-preview service/database, native capture, provider,
account or Paperclip operations. No PostgreSQL/device/provider/desktop-core
acceptance is claimed. Existing image scan costs and producer-declared RGBA
boundaries remain unchanged. Retain the original failed evidence and prior passes;
this corrective commit awaits Lead review/integration, then existing QA and
Windows transport adoption at the reviewed baseline.
