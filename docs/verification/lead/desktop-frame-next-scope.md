# Next executable desktop metadata slice — existing P0-08 / P0-09

Lead delegates ONE bounded shared-file implementation to Backend. Source basis:
main `afafe82684de966cae74e2cd410f925362ed427b`, actual Mac producer
`7efa46ab75fadf4a6a05f4071526ebd7643df6ea` and Windows `6584ab1`.
The platform candidates remain on review hold; reading their formats does not
approve their runtime or start another platform task.

## Concrete compatibility obstacle

Legacy Frame requires capture UTC. Raw frame 0.2.5 fixes its orientation namespace
to CGImagePropertyOrientation and its timing to native callbacks. Desktop ingress
must not invent capture UTC, convert display rotation into that orientation enum,
or call Windows sample/readback counters native-buffer callbacks. Existing raw
HTTP 0.2.6 embeds exactly 0.2.5; keep it unchanged.

Mac currently retains actual lossless PNG bytes/hash/length, dimensions, callback
sequence/host time, session wall/host anchors and distinct ScreenCaptureKit sample
PTS, displayTime/status/content geometry/scale/dirty rectangles. Windows currently
has RGBA hashes and volatile frames; the separately assigned original-context
repair is not yet delivered. An RGBA digest cannot become a PNG file-byte digest.

## One bounded implementation

Implement pure additive **desktop frame metadata 0.2.7**, starting with the
concrete `macos_screencapturekit` profile. Write only
`packages/contracts/desktop_frame/**`,
`packages/contracts/tests/test_desktop_frame.py`, and owned Backend verification.
Lead retains root generator/typecheck integration, final compatibility and release.
No existing family, service, migration, app or dependency changes in this patch.

- Reuse SourceRef, device/session/stream, frame identity, complete PNG artifact
  reference and delivered dimensions. Keep kind `raw_capture_frame` for planned
  reuse of the existing raw archive; the new version remains explicitly rejected
  by old readers until assigned adoption. No second archive/identity.
- Preserve actual Mac producer facts in a closed profile, including available
  sample/display/callback clocks and geometry with explicit units/bases. Required
  unknowns are null. Retain sequence semantics, original as-delivered pixels and
  unknown pixel orientation; reported display rotation is a separate fact.
  Do not claim upright pixels or invent Windows metadata while its producer changes.
- Capture UTC and course playhead remain unknown. Distinguish a labelled callback
  wall estimate from capture time and source-clock readings. Do not claim known
  uncertainty/freshness from an estimate. Keep exact native values where rounding
  would lose evidence; UInt64 host ticks need a lossless representation, not an
  unsafe JSON/JavaScript integer. No file/path/network reads in pure validation.
- Bind the exact selected ProcessBatch 0.2.0 record, retained DisplaySourceSnapshot
  0.2.3 and OriginalArtifactBinding 0.2.2, including owner/source/version, capture
  incarnation and complete PNG reference. Preserve scope/artifacts/limits, forbid
  capture-time or course-time substitution, and never attest stored bytes/authority.
- Use the established schema/generator pattern and current standard dependencies.
  Include meaningful positive/unknown/cross-binding/time/geometry/safe-number and
  mutation-safety tests, generated consistency, and old-reader rejection. Synthetic
  fixtures are labelled synthetic; the actual Swift-emitted fixture check follows
  the reviewed hosted build, not a claimed pre-existing native pass.

R07/R27/R29/R30/R35/R36/R46/R51/R52/R58/R59, A12/A14/A16/A26/A30/A31/A44
and complete §7.1/7.4 source/English remain applicable. This is a metadata slice,
not core screen-to-AI, editable-ink, permission or device acceptance.

## Exact next owners and retained gaps

Backend returns one commit; Lead reviews/tests/releases that smallest profile,
then coordinates the separate versioned transport and explicit consumer adoption.
Backend reuse must cover ingress/atomic replay/readers/resolver and deletion;
Learning reuses current materialization/observation windows. No old endpoint is
silently widened. Frameless shared-display records are currently rejected by
Backend; the later transport must represent gaps honestly rather than manufacture
a stale frame. Windows obtains its own profile from corrected actual producer
facts, without waiting for physical Mac acceptance. No paid provider or public
runtime activation follows from this contract work.
