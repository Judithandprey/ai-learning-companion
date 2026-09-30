# Windows HTTP H1 correction review — APPROVE

Exact correction: `7b46bec8efaca109f622541cfa551cfdf794589d`.
Direct parent/held HTTP delivery: `72e928a4bfd9664b2c733c7d32d8d14d2d2fb813`.
Exact candidate export: `/tmp/backend-windows-http-correction-1otusxk3`.

**APPROVE this bounded correction with the held HTTP delivery. H1 is closed.** Independent execution confirms the unchanged original failure now returns 503 and leaves the retained store unchanged. The valid old-family/current-fence controls pass. Lead owns integration and tests at the resulting main commit.

Read the complete four-file diff, complete `windows-http-replay-correction.md` evidence and new203-line regression module. The only production change is in the existing common CaptureArchive engine; no contract, schema, wire, migration, dependency, runtime gate or unrelated module changes. Applicable released0.2.10/workflow/source/ADR requirements are unchanged from the prior review. PONYTAIL LITE: the change reuses the current transaction and ACK decoder without another store/index/abstraction.

## Correctness review

At `services/api/capture.py:581`, only `None` means absent. A present row must be an object and contain the exact stored key. The exact existing intentional erasure shape `{key, deleted: true}` returns404 after current authorization/source/Stop checks. The actual deletion writer at `capture.py:99` emits exactly this shape, so the exception preserves valid erasure rather than normalizing a corrupt active ACK.

An active row must contain exactly key/fingerprint/response_json/source_ids/deleted, with literal false deletion state, lowercase64-hex fingerprint, serialized ACK text and sorted unique nonempty valid source identifiers. The existing writer produces those facts for all nine tested generic/internal/HTTP families. Invalid rows produce503 before replay classification, success or writes. Nonboolean flags and malformed erasure shapes cannot masquerade as intentional deletion. Intact changed-request bodies continue to yield409 idempotency_conflict; a corrupt ACK is503 before fingerprint mismatch.

`_decode_ack` validates the existing ProcessBatchAck shape early and supplies the same parsed response to the unchanged later batch/owner/reference/current-byte/received-time validation. There is no reserialization, normalization, changed accepted disposition, rebuilt ACK or modified immutable original. Current raw-family source inventory equality and typed verified-only checks remain. New successful requests retain their existing writer and receipt shape.

All subsequent affected cached branches use presence rather than truthiness, including exact raw replay classification, source inventory comparisons, missing record/frame witnesses and final cached return. Current authority/lifecycle checks precede receipt lookup; producer admission, R1 image consistency and final current authorization still precede successful cached return. The correction does not weaken old generic pending-byte semantics or source deletion.

No new concrete blocker found within this focused review. It is not a broad audit of every replay store or arbitrary valid-looking privileged metadata rewrites.

## Independent exact execution

Original independent source was copied without modification from the prior retained export into:
`/tmp/backend-windows-http-correction-1otusxk3/test_review_http_independent.py`.
SHA-256 remains `4d5fded3dda977278c0aab3a9feec660f3d30ee31b265fa6aade5f274e8047d7`.
The original503/no-mutation expectations were unchanged. Only its H1 case needed rerunning; the already passing seven independent negatives and prior190-case suite were not repeated.

Working directory: `/tmp/backend-windows-http-correction-1otusxk3`.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -s -p no:cacheprovider services/api/tests/test_capture_replay_presence.py test_review_http_independent.py::test_present_empty_http_receipt_cannot_recreate_ack services/api/tests/test_capture.py::test_pending_blob_becomes_verified_without_rewriting_prior_ack services/api/tests/test_capture.py::test_source_deletion_scrubs_capture_content_and_replays_preserving_other_originals
```

**Actual result: 41 passed in2.08s.** H1 diagnostic: `EMPTY_RECEIPT_RESPONSE 503 None`.

The41 comprise:

-38 new correction cases: nine existing engine families each establish real absence, normal commit, exact accepted-ACK replay with unchanged documents, and refusal of a present empty row; additional malformed row shapes, source inventory, ACK shape, intentional erasure, current auth/Stop precedence and changed-request behavior.
-1 unchanged original independent H1 regression, including its now-reached full store no-mutation assertion.
-2 existing focused controls: generic pending original can later become verified without rewriting its prior ACK; actual source deletion scrubs scoped originals/replay content while preserving unrelated originals.

The owner's additional56 existing tests were read in evidence but not counted as independently rerun. Prior190-pass/7-pass/1-failure evidence remains historical and was not relabeled or combined into the41.

`git diff --check 72e928a4 7b46bec8efaca109f622541cfa551cfdf794589d` passed. Backend git status remains clean. Main/worker content was never edited. Prior report `/tmp/backend-windows-http-review.md`, results `/tmp/backend-windows-http-results.txt` and original failed source remain intact.

## Scope and next action

Executed tests use the existing .venv, synthetic identities/originals and actual MemoryStore/in-process HTTP paths. The corruption is explicitly injected retained state; no ordinary client exploit, real database fault, PostgreSQL durability, listener/service, native capture, provider, audio, Notability or desktop gate is claimed. No DB, services, native/device/provider/network/Chats/install operations occurred. Existing opt-in/default-off and scan-cost limits remain unchanged.

Lead may integrate held72e928a plus correction7b46bec in order, verify the resulting commit, and proceed with the already assigned focused QA/Windows transport adoption.
