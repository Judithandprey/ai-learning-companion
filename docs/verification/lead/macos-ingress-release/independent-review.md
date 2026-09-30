# Independent review — unreleased macOS ingress 0.2.12

**APPROVE `cc580c88dcddb631018a8107c9b26a076988aeab` for Lead's root registration/release review.** No demonstrated blocker was found within the assigned pure-contract scope. This does not release or activate the route; Lead still owns that next step.

## Exact source and scope

- Assigned baseline: `c2ac1c7f7f8337424812fb5e53cc078d9715548d`.
- Reviewed exact delivery: `cc580c88dcddb631018a8107c9b26a076988aeab`.
- Complete isolated `git archive` export: `/tmp/macos-ingress-cc580-review-bnvmnxo9`; `review-candidate.json` records the exact commit and parent.
- The delivery changes only `packages/contracts/macos_capture_ingress/**`, `packages/contracts/tests/test_macos_capture_ingress.py`, and `docs/verification/backend/macos-ingress-contract.md`. Its parent already contains the assigned baseline plus unrelated Backend review evidence; that evidence was not treated as this delivery's implementation.
- Reviewed the complete new README, runtime validator/strict decoder, generator, example/provenance and focused test module; refreshed the released Mac0.2.11 validator/binding/README, inherited Process/JSON/ACK checks and sibling ingress conventions. Applied project PONYTAIL LITE, read current workflow/role guidance, and refreshed affected full source/English R27/R29/R30/R51/R52/R59 and relevant acceptance/decisions. All eight current source/translation manifest hashes match. Requirements/playbooks relevant to the previous review remained unchanged except workflow, whose current content was refreshed.
- No main/worker edit, root registration, service/HTTP execution, database, native process/display, provider, install, network or team message. Review files alone were written under `/tmp`. Native mapper and Learning implementation were not duplicated.

## Findings

1. **Exact frame and record binding is present.** Process0.2.0 semantics run over the complete batch, followed by full Mac0.2.11 validation. Unique frame IDs exactly exhaust the non-null record frame IDs; each framed record retains the exact owner/source/version, device/session/stream and every complete distinct raw/composed PNG reference. Process observation/media/clock fields stay null. `validate_frame_batch` checks the trusted supplied owner even for gap-only input. The subsequent stored-source/original binding obligations are explicit and are not simulated as authentication by the pure helper.
2. **Image identities are separate and consistent.** Archive ID, SHA-256 PNG facts and `(native_session_id, native_file)` each have their own consistency map. Independent probes confirmed rejection of individually valid frames with contradictory shared hash/dimensions or native-session/path bytes; same bytes at distinct files/archive IDs and different native sessions reusing a relative filename remain accepted. No global conflation of local paths with archive identities was introduced.
3. **Unknown/refused/raw outcomes and retained ink facts remain intact.** The exact seven released descriptors survive the envelope roundtrip. Full0.2.11 validation remains active, including native timing, composition relation, alias constraints, ordered stroke/limitation metadata and unknowns. PNG/document/revision metadata is explicitly not an editable-original save receipt or trusted operation source. A valid generic framed structured Process claim remains representable; this is intentional compatibility, not authenticated acquisition. The future service must enforce the adopted pixel-producer policy separately.
4. **Frameless records cannot masquerade as images or operations.** Only partial/unobserved/unknown coverage, empty artifacts and null observation/media/clock are accepted. Gap-only input has no implicit source registration, producer admission or consent.
5. **Strict decoding and full ordered equality are retained.** Immutable bytes only; raw and canonical 4 MiB bounds; duplicate members including escaped duplicate names, invalid UTF-8, nonfinite/unsafe integer fields, excessive depth and unpaired surrogate inputs reject with `ValidationError`. Canonical equality includes frame/record/reference/stroke order and null versus empty dirty rectangles. Object-member order is ignored under the existing serialization convention; the contract does not claim lossless original JSON whitespace/numeric lexemes.
6. **ACK/auth/error declarations remain bounded and compatible.** Successful ACKs use unchanged ProcessBatchAck0.2.0, exact owner/record/sequence/reference correspondence and verified-only artifact receipts. A fabricated ACK without verification tuples is rejected; tuples themselves remain declared test inputs, not durable byte verification. The new OpenAPI declares Bearer auth, `process:capture`, distinct macOS and Process capabilities, default-off operation and 4 MiB bound. README/OpenAPI state complete media/header/version/error precedence and transaction/current-authority duties; this pure package does not implement them. Closed errors preserve the established retry restriction.
7. **Older families are unchanged and closed.** No0.1.0–0.2.11 source/schema/example was modified. Pure negative probes confirm the legacy/raw/desktop/Windows ingress validators reject a Mac descriptor even when given their own outer version. The candidate remains isolated from root registration and current service behavior.

## Executed checks

All commands ran in `/tmp/macos-ingress-cc580-review-bnvmnxo9` using existing pinned tools.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
  /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  -m pytest -p no:cacheprovider -q packages/contracts/tests/test_macos_capture_ingress.py
# 124 passed in 1.29s

PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  -m packages.contracts.macos_capture_ingress.generate --check
# exit 0; all three generated outputs match

/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc \
  --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 \
  packages/contracts/macos_capture_ingress/generated/contracts.ts
# exit 0

PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python review-probes.py
# 44 independent checks, including 27 expected ValidationErrors; all assertions passed
```

Independent executable: `/tmp/macos-ingress-cc580-review-bnvmnxo9/review-probes.py`.
Machine evidence: `review-probes-results.json`, `review-source-sha256.json`, `review-requirement-hashes.json`, and `review-checks.json` in the same directory.

The independent probes use shipped exact descriptors plus clearly synthetic counterexamples. Contradictory hash/path cases first pass individual Mac validation and, where applicable, generic Process validation, so they reach the new cross-frame checks. The Process-clock probe first validates the generic batch with a legitimate clock object, then confirms the Mac envelope's stricter null-clock rejection; an initial shape-only test construction was strengthened before final execution. No production validator or test assertion was weakened. All original inputs remain unchanged.

Owner-reported 605 adjacent-family tests were not rerun and are not claimed as independent evidence. No HTTP precedence, PostgreSQL, actual PNG decoding, native capture, provider receipt or full-product campaign was run.

## Next owner and acceptance boundary

Lead can register/release this exact pure candidate and verify integrated generated/root outputs. Backend's later explicitly assigned runtime work must verify stored DisplaySourceSnapshot0.2.3 and every exact typed OriginalArtifactBinding0.2.2/byte set, keep separate editable originals, check cross-batch consistency, enforce trusted producer admission and current authority/Stop/revoke/delete/cancel fences, and atomically commit the complete envelope equality, descriptors, records/references and receipt before any success or exact replay. Malformed stored variants remain unavailable and cannot be repaired from a request.

Native whole-session counters/gaps/ending/input/ASK/editable history remain original records outside this frame envelope; absence from0.2.12 is not permission to discard them. Actual macOS permission/live original-screen ink, AI receipt, audio, Notability import and both §7.1 gates remain open. Pure-contract approval does not establish those outcomes.
