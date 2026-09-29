# Atomic originals and shared-display provenance

2026-09-29, existing P0-07/08/09/05 continuation. R02/R03/R07/R29/R30/R35/R36/
R46/R51/R52/R58/R59 and A12/A14/A16/A30/A31/A44/G7 retain the complete original-screen
requirements. This is internal executable dependency work, not usable whole-screen
AI, original-screen pen, physical-device or Notability acceptance. No source/English
product requirement changed. PONYTAIL LITE reuses existing identities, storage and
validators; no dependency or new archive is introduced.

## Backend integration

Owner `edc562b9e6858b61b4dbde9ab8834bdadea9abf5` and corrective
`d325e9afe9e4bce43d2d2405c8cb9284978df63d` integrate as `dadd023` and `503871d`.
The explicit `ControlRegistry.ingest_frames` entry validates authorized existing
source/control, exact Frames and typed originals, then writes frames, process
records and ACKs in one existing actor transaction. Default ingress stays gated.

Independent [review](atomic-frame-ingress-review.md) first held the delivery:
a new request key could reconstruct a missing committed record. The owner fixed
reverse committed-slot, ACK and causal-parent witnesses. Both independent original
reproductions now return 503 with exact unchanged storage; 17 focused correction
checks pass. The original HOLD remains recorded, rather than relabeled as passed.

On integrated main `503871d`, this command passed **288 tests in 2.16 seconds**:

```sh
.venv/bin/python -m pytest -q services/api/tests/test_capture_frames.py services/api/tests/test_capture.py services/api/tests/test_control.py services/api/tests/test_source_deletion.py packages/contracts/tests/test_original_artifact.py
```

These are portable/synthetic transaction and metadata checks. This turn ran no
real DB, process-restart, provider or device acceptance. Complete loss of all
originals and every surviving witness cannot be detected from this store alone.

## Additive display source 0.2.3

[The released family](../../../packages/contracts/display_source/README.md)
defines `DisplaySourceSnapshot` and `validate_display_record`. It binds existing
source identity/version to a device/session/stream incarnation without invented
foreground-app identity, URL, original text, hash or coverage. It composes existing
record/Frame validation and never supplies authorization or freshness itself.
Backend adoption is a subsequent explicit internal implementation, not activation
by schema. Historical retrieval, current transmission and deletion remain separate.

Root TypeScript now includes both original-artifact and display-source generated
types. Earlier v0.1.0/0.2.0/0.2.1/0.2.2 schema/type families are byte unchanged.

```sh
.venv/bin/python -m pytest -q packages/contracts/tests/test_display_source.py
# 33 passed in 0.11 seconds
.venv/bin/python -m packages.contracts.display_source.generate --check
# exit 0
.tools/node-v24.21.0-linux-x64/bin/node node_modules/typescript/bin/tsc --noEmit
# exit 0, including both additive type families
git diff --exit-code 89d4ccb -- packages/contracts/schema.json packages/contracts/generated packages/contracts/process_v2 packages/contracts/process_control packages/contracts/original_artifact
# exit 0
git diff --check
# exit 0
```

Independent [review](display-source-review.md) approved the seam, with three focused
tests, eight additional controlled probes, generator/type validation and unchanged
source/English manifest pairs. No new services, account, provider, migration,
physical capture or external capability are claimed.

## Capture QA and next owners

Independent QA delivery `fcc41b8ee2bedb2d5738dedfbbad6a5057a52926` tested exact Web
candidate `b8ec18ec782af4bcc2c035f1da73e84c253047a7`: **31/38 passed; NOT ACCEPTED**.
QA-EXT-01 scroll away/back and QA-EXT-02 same-address layout movement can display
the wrong marked crop as known. Both reproduce with real browser timing. This is
component evidence, not either full product gate. Web received one next correction
at its current ink task's safe checkpoint: accepted message
`handoff_78bd43e7383ed5db767cc417df83ad10`, initially unread/execution_started=false.
QA waits for the exact corrected integrated candidate for one affected-path pass.

After this reviewed baseline is published, Backend adopts 0.2.3 within the existing
source store and authority boundary. Learning can independently compose bounded
process/Frame evidence from explicit validated inputs, keeping actual atomic export
and current authorization as named Backend dependencies. No legacy Observation or
OCR may be invented. iOS still needs actual producer transport and the existing
signing/install route; arbitrary cross-app input overlay is not unlocked by signing.
The product provider remains disabled. User preview/data and Paperclip were untouched.

Publication and actual native dispatch/start receipts are recorded after execution;
an accepted send alone is not owner activity or implementation.
