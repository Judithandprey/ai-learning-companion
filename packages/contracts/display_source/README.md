# Shared-display source — explicit additive 0.2.3

Existing R02/R03/R07/R29/R30/R35/R36/R51/R52/R58/R59 require original-screen
observations even when the public platform cannot identify the foreground app or
document. v1 registration requires an HTTP(S) URL. Inventing such a URL or using
synthetic fixture import would misstate the source. This small independent
descriptor reuses the existing source identity/version instead; no second archive,
provider, capture service, source text or app identity is invented.

## Meaning and compatibility

`DisplaySourceSnapshot` (explicit `contract_version: 0.2.3`, `type: shared_display`)
names an immutable source version belonging to one exact owned device, session
and registered stream incarnation. It has an optional project, source timezone
and service creation time. It intentionally has **no URL, foreground-app name,
document identity, OCR text, content hash, coverage claim or current/live flag**.
Those facts cannot be inferred from a stream ID. A source descriptor is metadata;
the immutable images and obtainable ink remain in existing typed original storage.
Creation time is not frame time, last observation or a freshness attestation.

This is separate from v1 `SourceRecord`/`SourceSnapshot`. v1 readers must reject
it explicitly as unsupported, never coerce it to a web source or insert empty
"original text". 0.1.0 schemas/types/examples and source APIs are unchanged by
this package, as are capture 0.2.0, control 0.2.1 and original bytes 0.2.2.
Existing `SourceRef`, `Frame`, process and original-artifact shapes still carry
the exact identity/version. No new HTTP endpoint/capability is activated here.

`validate_display_record(snapshot, batch, record_id, frame)` preserves the released
record/frame checks and additionally matches the descriptor's source, device,
session and stream. It requires `screen_capture` but cannot prove that label.
It accepts declared historical records in their original incarnation without
turning them live; timestamps are preserved, not sorted or compared to infer
coverage. A restart uses a new registered stream and a distinct source identity;
previous originals remain bound to their old source/stream and retain unknown gaps.
Foreground switches within one broadcast do not automatically establish a new
document or problem. Per-frame observed attribution can be added separately only
with actual evidence; the descriptor never asserts that every frame depicts one app.

## Backend consumer obligations — not implemented by this package

- Register this source only through an explicit internal opt-in path after
  resolving current caller, project ownership where present, registered stream,
  device/session membership and authorized producer in one existing actor
  transaction. A supplied descriptor or known stream ID is not a start grant.
  Server supplies creation time. A stopped/withdrawn stream cannot be restarted
  by source creation or replay; source creation after a stop needs independently
  evidenced pre-stop authorization, not a default success path.
- Reuse the current source/snapshot store with an explicit 0.2.3 discriminator;
  do not create another source identity system, migrate legacy payloads in place,
  or route this type into web fetch/extraction. IDs/version metadata are immutable
  and cannot collide with a legacy source. Replays recheck current authority.
- Validate this descriptor instead of v1 text/hash fields only in explicitly
  released consumers. Reject unknown versions/types. Current account/source
  access, deletion/revocation and registered-stream fences remain separate mutable
  service facts; retaining source history never grants transmission permission.
- Associate every Frame/process record through `validate_display_record` plus
  the released typed-original/frame binding and byte checks. Exact stored PNG
  bytes, geometry, time and observable gaps remain evidence; descriptor validity
  never proves whole-display coverage, meaningful-step completeness or AI input.
- Keep ordinary historical retrieval after a scoped stop distinct from a new
  capture/transmission grant. Source deletion must remove its owned originals,
  references and derived dependencies under existing fences, including pending
  uploads; it must not delete another independently shared device's source.
- Legacy export/context consumers must return an explicit unsupported-source
  result until they can consume this variant. Do not invent an Observation, OCR,
  utterance or user reasoning to make existing text retrieval accept an image.

Lead coordinates explicit backend/learning/native adoption after review/release.
The schema alone leaves every production consumer unchanged. Physical-device,
provider, full-display coverage, original-screen pen and Notability gates remain
unverified; it is not a browser fallback or a reduced product requirement.

Checks: `python -m packages.contracts.display_source.generate --check` and
`pytest packages/contracts/tests/test_display_source.py`.
