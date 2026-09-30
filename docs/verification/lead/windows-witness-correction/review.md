# Independent review: QA-WIN0210-01 correction

APPROVE the bounded correction at `7d19e09aafe2ff7716b585bab809ba89aff25f9e`, parent `73f3c42bbbbd22dbb0ea60d8db6197702cb70eeb`. No blocking compatibility, mutation or unexpected-exception issue found in this scope. Preserve the Low, double retained-corruption classification of the original finding. This does not establish general retained-data integrity or device/provider acceptance.

Reviewed the complete three-file delta, active receipt writer, deletion writer and affected lookup/scanning call paths. The relevant AGENTS/TEAM/workflow and original/English requirements/decisions are unchanged from the preceding QA review. Applied PONYTAIL LITE by reusing the existing checks and demonstrated failure cases, without new framework or corruption campaign.

## Source and fixture identity

Exact archive export: `/tmp/windows-witness-7d19e09`. All 223 exported `services/` and `packages/` files match their candidate Git blob IDs. The only production change is `services/api/capture.py`; contracts, storage implementation, migrations and application factories are unchanged.

Original QA test: `ee0faee:tests/e2e/test_p0_13_windows_ingress_qa.py`. Compared its complete bytes with the executed copy: only `FRAMES_DIR` was relocated to `tests/e2e/fixtures/windows-ingress-originals`. Assertions, fault injection and strict xfail markers are intact. Executed test SHA-256: `550f5619cfa75afc8f07318684597c775f7621c6dc194b4caf15e587356fa072`. All five copied frozen PNGs were rechecked against their exact `7b71d7b` source bytes, hashes and provenance lengths.

## Behavior and compatibility

- `capture.py:53–77` moves the prior H1 full active receipt shape validation into `_decode_ack`. It requires explicit boolean `False`, the unchanged five active fields, a hexadecimal fingerprint, string ACK JSON and nonempty sorted unique valid source IDs. JSON/schema/shape/type failures become deliberate `DomainError(503, "unavailable")`.
- Only exact `{key, deleted: true}` with a nonempty string key returns no ACK. Direct lookup at `:605–612` additionally validates the expected key and preserves intentional-erasure 404 and changed-request 409.
- `_admit_evidence` at `:162–166` now decodes before route filtering. Empty receipts and the two malformed full-row deletion flags cannot silently hide the Windows gap witness. The unchanged QA six cases all refuse without writes; the HTTP exception spy does not find an unexpected error masquerading as 503.
- `_active_acks` consistently supplies the stream-binding, missing-parent, missing-artifact-pin and absent-record scans. Every active writer already produces this exact shape; the deletion writer already produces the exact tombstone. No migration or new stored format is required. Genuine unmarked legacy clients and valid erasure remain accepted where they were accepted before; direct erased replay remains 404.
- Current source/authorization/Stop checks still precede replay success. Classification does not mutate original rows, reconstruct missing receipts, or return success early. Existing short-circuit witness branches continue to refuse rather than bypass validation into acceptance.

## Independently executed checks

Interpreter: `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`; working directory `/tmp/windows-witness-7d19e09`. Each command used `PYTHONDONTWRITEBYTECODE=1`, `-m pytest -p no:cacheprovider -v`.

| Selection | Independent result | Log |
| --- | --- | --- |
| `services/api/tests/test_capture_replay_witness.py` | 36 passed in 3.45 s | `/tmp/windows-witness-new36.log` |
| Original QA file with `--runxfail -k malformed_gap` | 6 passed, 48 deselected in 1.39 s | `/tmp/windows-witness-qa6.log` |
| The exact focused compatibility selection below | 74 passed in 3.66 s | `/tmp/windows-witness-compat74.log` |

The 36 new cases exercise 20 malformed-witness HTTP refusals plus explicit domain refusals, four intact-witness controls, four exact-erasure controls, two genuinely unmarked legacy controls and six sibling-scan controls. The original QA selection contains all five former actual-200 failures and the fresh-empty passing control. The original strict xfail markers should be removed when the correction is integrated and independently retested; normal execution otherwise intentionally reports strict XPASS failures.

Compatibility selection:

```text
services/api/tests/test_capture_replay_presence.py
services/api/tests/test_windows_ingress_http.py::test_http_gap_receipt_prevents_profile_loss_fallback_on_older_entries
services/api/tests/test_windows_ingress_http.py::test_current_fences_precede_new_and_cached_http_success
services/api/tests/test_capture.py::test_source_deletion_scrubs_capture_content_and_replays_preserving_other_originals
services/api/tests/test_raw_ingress_http.py::test_http_replay_never_reconstructs_lost_committed_witnesses
services/api/tests/test_desktop_ingress_http.py::test_http_exact_replay_refuses_lost_or_corrupt_committed_facts
```

## Non-blocking wording and limits

Narrow `docs/verification/backend/windows-replay-witness-correction.md`'s “invalid key” claim to **empty/non-string keys**. The classifier checks that boundary; it does not validate serialized `key()` grammar or authenticate the stored key's semantics. By source inspection, arbitrary substitution of a nonempty string such as `not-a-key` can still remove the route-prefix witness after profile loss. That is a distinct semantic-corruption limitation beyond the five original cases and the QA-proposed non-string-key check. No additional corruption campaign was run, and this approval must not be described as detection of all conceivable forged/corrupted witnesses.

All execution was in-process ASGI/MemoryStore with labelled synthetic retained-state faults. No database, socket/listener, provider, native display, installation or repository/worker edit occurred. The previous 49-pass/5-xfail evidence remains a correct record of the old production version; this review proves the narrow six-case transition against exact corrected code. Lead owns integration and the next independent role-QA retest.

Machine provenance and hashes: `/tmp/windows-witness-correction-review.json`. All three exact changed files and test logs are retained in `/tmp`.
