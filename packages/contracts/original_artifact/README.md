# Source-bound original bytes — additive 0.2.2

This small executable boundary serves existing R07/R30/R46/R51/R52/R58/R59.
It does not change v1 0.1.0, capture 0.2.0 or control 0.2.1. No HTTP route or
capability is activated. Backend owns the authenticated transactional implementation;
the lead releases an HTTP surface only after the source/producer binding exists.

An `OriginalArtifactBinding` contains the existing exact `SourceRef` and
`ArtifactReference`, this contract version, and a kind: `screen_image` (PNG/JPEG)
or `editable_ink` (JSON original bytes). Upload adds canonical `data_base64`;
receipt adds `status: bytes_committed`. `validate_bytes` supports internal callers
without base64 conversion. The 32 MiB transport ceiling is an engineering bound;
oversize content must be reported unavailable, never silently truncated. It is
not an overall archive quota, lecture recording rule or measured device limit.

These validators establish shape and exact byte integrity, **not a valid image
decoder, an editable stroke codec, authentication, storage or AI receipt**.
JSON here is a declared representation, not permission to rename PencilKit binary
or a flattened PNG. Web/native codec compatibility and actual reopening/editing
remain required. Preserve unsupported originals instead of converting silently.

Service obligations for this first bounded slice:

- Authenticate the caller and resolve the exact accessible source/version inside
  the same existing actor transaction for put, read and replay. A known artifact
  ID alone grants no read. A registered URL alone is not an ingested source.
- New typed artifacts belong to one exact source/version. ID, source binding,
  kind, media type, hash, length and bytes are immutable. Identical replay succeeds;
  changed reuse conflicts. Do not implicitly attach legacy or other-source bytes.
- Keep immutable prior original versions for erase/undo/redo/corrections. Store no
  second identity or archive. The original-byte layer does not invent stroke edits.
- Source deletion also removes pending/unreferenced uploads owned by that source,
  retaining only non-content reuse fences. Revocation blocks current access;
  replay cannot restore deleted data. Do not change independently owned legacy
  artifact lifecycle by merely referencing its ID.
- Return `bytes_committed` only after successful durable transaction completion.
  Reads verify stored binding and exact bytes, failing closed on corrupt/missing
  storage. Do not translate it to process envelope ACK, provider ACK or live vision.
- Keep the current control-backed artifact-reference gate disabled until every
  reference enforces these ownership/deletion rules. This module does not switch it.

Real source/frame ingress and stream/producer authorization are distinct missing
bindings. Fixture import is still synthetic-only; the document importer is still
an owned-document path. Neither is used to fabricate current-screen evidence.
Continuous automatic observation remains independent of optional ASK selections.

## Exact frame binding for the next internal ingress

`validate_capture_frame(batch, record_id, frame, binding)` composes the existing
capture 0.2.0 frame check with a complete typed original 0.2.2 binding. It requires
`screen_capture`, kind `screen_image`, and equality of the exact source/version,
artifact ID, hash, media type and byte length; existing frame/session/device/media
checks are retained. It returns no receipt and mutates nothing. There are no new
wire fields, schema versions or endpoints, and no inference of freshness from
capture/observation timestamps. A supplied metadata label is not proof of pixels.

Backend's bounded next implementation is atomic frame plus process-record ingress
in the existing actor store, using current registered-stream authorization and
already stored, verified typed originals. The transaction must recheck every
referenced source and original, preserve frame IDs immutably, and retain existing
stop/withdrawal/deletion/replay fences. A failed batch cannot leave new frames or
receipts. Activation is explicit for this internal entry; do not relax the default
capture gate, admit legacy blobs as typed originals, or add an HTTP/auth route.
Frame metadata alone grants no right to start a producer or send history as live.

This next entry may only bind a real, already ingested source/version. Current
source registration requires a known HTTP(S) source. An unknown foreground app
in a whole-display broadcast must not be given a fabricated web URL or routed
through fixture import: its honest source representation is still a separate
lead-owned additive contract dependency. This restriction does not narrow either
original-screen product gate or claim that a web-only path completes it.

Generate/check: `python -m packages.contracts.original_artifact.generate [--check]`.
Focused checks: `pytest packages/contracts/tests/test_original_artifact.py packages/contracts/tests/test_capture_frame_binding.py`.
