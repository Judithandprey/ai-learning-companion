# Learning image materialization — bounded delta review

Decision: **APPROVE** delivery
`afd59a8d2697999ce7cb1dd4d8014ca35957102f` as its four-file commit delta only.
Do not merge its older branch history. Reviewed against current main
`ae1f20b7bf90cc52d2243942f5713e074ab3a5b3`, including original_artifact 0.2.2.
No consequential source-binding, pixel-boundary or mutation blocker found.

Read the complete images.py, added tests, README delta and owner evidence, with
the existing context fingerprint/evidence/archive flow. Applied current workflow/
PONYTAIL LITE and §7.1's separate core evidence gates; no broader audit repeated.

## Findings

- Every supplied item is checked against exact original archive evidence and
  owner/event identity before the first resolver call. Source version/hash,
  frame, time, provenance and historical status are preserved. Resolver output
  must supply the complete identical Frame, immutable bytes, matching digest,
  media type and dimensions. Foreign/substituted frame results never attach.
- The resolver is an explicit trusted, currently authorized bounded-read seam.
  Denials retain gaps with no fallback to archive bytes; unexpected exceptions
  abort without a partial return or retry. No URL/path access or new storage.
- Current mode requires the exact session/device to be active; absent, stopped,
  disconnected, stale states and stale-frame gaps suppress resolution. Explicit
  authorized history remains labeled history and can survive capture stop.
  Historical correction neighbors in a current packet retain their historical
  labels. Nothing attests live capture, AI receipt, completeness or presentation
  permission.
- PNG checks enforce signature, framing/CRC, first/unique IHDR, dimensions,
  static RGB/RGBA 8-bit noninterlaced subset, consecutive IDAT, terminal IEND,
  bounded exact scanline decompression, filter bytes and no trailing zlib data.
  Pixel, per-image and accumulated attachment limits are explicit. Oversize or
  unsupported originals remain unmodified and produce gaps.
- Ancillary data remains deliberately opaque; this is not a general decoder or
  sanitizer. JPEG accepted by original_artifact 0.2.2 is explicitly unsupported
  here; the future adapter must preserve that gap rather than claiming all stored
  image formats can be materialized.
- Context/restrictions/resolver inputs and output references are detached; returned
  image bytes are immutable. Persistent archive metadata mutation during resolver
  execution invalidates the result. Snapshot fingerprinting is not authorization
  or a lock: the documented trusted freshly assembled context, backend transaction,
  revocation/state-change and final-use fences remain necessary. This helper cannot
  authenticate arbitrary edited packets or revoke bytes already returned; it does
  not claim either capability.

## Independent focused evidence

Candidate `/tmp/image-materialization-review-mekyil4i` was created from
`git archive ae1f20b7bf90cc52d2243942f5713e074ab3a5b3 packages/contracts services/learning tests/evals tests/fixtures/memory pyproject.toml`,
then overlaid only the exact new images.py and test_image_evidence.py from afd59a8.
No old parent implementation was copied over main.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider tests/evals/test_image_evidence.py -k 'actual_bytes_and_all_original_references_survive or distinct_observed_images_keep_time_device_and_history_without_fabricating_steps or archive_mutation_during_resolve_fails_without_returning_partial_images'
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/image-materialization-png-probe.py /tmp/image-materialization-review-mekyil4i
```

Results: **4 passed, 62 deselected in 0.14s**. Independent tiny PNG probe:
consecutive split IDAT accepted; nonconsecutive IDAT and a second appended zlib
stream rejected as invalid_image. Probe is preserved at the command's path.
Owner's 117/older 187 campaigns were not replayed or represented as reviewer runs.

No main/worker edits, DB, provider, device, browser or external calls. Approval is
for bounded internal byte materialization, not continuous capture, source ingress,
real AI delivery/understanding, either §7.1 gate or native/Notability acceptance.
