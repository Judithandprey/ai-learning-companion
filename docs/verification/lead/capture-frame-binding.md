# Exact frame and current-original composition

2026-09-29, existing P0-08/P0-09 continuation. Original-screen requirements remain
R07/R29/R30/R35/R36/R46/R51/R52/R58/R59, A12/A14/A16/A30/A31/A44 and G7;
the full two-gate loop remains in requirements §7.1. Source/English requirements
and current decisions are unchanged. PONYTAIL LITE reuses the existing validators
and actor store; there is no new archive, dependency, schema or protocol family.

## Integrated current-byte resolver

Native delivery `handoff_722aa787d3ca009b9c31c3be71b706e1`, owner commit
`f9f34d9885ef655d909639d9873807c85eb68f6c`, is integrated as `efc362a`.
The [independent review](authorized-image-resolver-review.md) approved the complete
delta after 16 decisive portable cases and five additional boundary assertions.
On main, `.venv/bin/python -m pytest -q services/api/tests/test_image_resolver.py`
passed **78 tests**. Owner's separate 66 Learning tests were not rerun wholesale.

`AuthorizedImageResolver` now supplies Learning with exact current-authorized
immutable PNG bytes from the existing store. Auth/revocation, deletion, ownership,
source/version, full Frame equality, byte bounds and corruption fail closed.
Stored originals, synthetic fixtures and historical images remain correctly
labeled. There is still no real capture-to-provider connection.

## Lead-owned executable binding

`original_artifact.validate_capture_frame` composes unchanged 0.2.0 frame binding
with the complete typed 0.2.2 original binding, including source/version, artifact
identity, MIME, hash and length. It requires a screen-image/screen-capture pair.
No input is mutated, no bytes are fetched, and no permission/receipt is granted.
The service must still prove actual bytes and current authority at commit time.

Main checks:

```sh
.venv/bin/python -m pytest -q packages/contracts/tests/test_capture_frame_binding.py packages/contracts/tests/test_original_artifact.py
# 35 passed (16 new composition cases, 19 existing original-artifact cases)
.venv/bin/python -m packages.contracts.original_artifact.generate --check
# exit 0; generated schemas/types unchanged
git diff --check
# exit 0
```

The same independent reviewer approved this small follow-up with four additional
boundary probes: coherent JPEG metadata accepted; Boolean version, extra Frame
field and media-position mismatch rejected. PNG decoding restrictions remain in
Learning; valid JPEG metadata does not make JPEG a supported Learning image.

## Next owned implementation

Backend receives one continuation on existing P0-04/P0-09: atomic frame plus
process-record ingestion using the existing current control authority and typed
originals, with no HTTP route or default-gate relaxation. Validate and write under
one actor transaction, not two separately committing methods. Every referenced
original must be source-bound and verified; changed IDs/replay, stop, withdraw,
deletion and failed commits cannot leak partial new frames or false ACKs.

Only existing real ingested sources qualify. Unknown foreground-app provenance
in whole-display capture still needs an explicit lead-owned additive source
baseline; do not fabricate an HTTP URL or use synthetic import. No product gate
is reduced to the known-web-source intermediate path. After backend delivery,
lead reviews the integrated ingress and Learning consumes actual frame context;
the current legacy context exporter does not yet export process records, and
those must not be relabeled as legacy Observations or given invented text.

No DB, service, user-preview replacement, provider, device, account or Paperclip
operation occurred in these checks. Ordinary publication and actual native
handoff evidence are recorded below after execution.
