# Raw captured frame — released metadata contract 0.2.5

This isolated, additive family describes the existing native producer's **raw PNG**
without inventing a pixel-capture UTC, course playhead or upright image. It is a
released pure metadata/binding contract, not an HTTP transport or an activated
consumer. Contracts 0.1.0–0.2.4 and their readers remain unchanged and reject this
shape. Do not pass it through the legacy `Frame` validator or silently downgrade it.

```python
from packages.contracts.capture_frame import validate, validate_binding

validate(raw_frame)
validate_binding(batch, record_id, raw_frame, display_source, original_binding)
```

Both functions return `None` and never modify their inputs. The caller retains the
complete original descriptor, process record, scope, evidence, limitations and
other artifact references. Validation neither normalizes data nor produces a new
archive, Observation, legacy Frame, token, permission or receipt.

## Closed descriptor

`RawCaptureFrame` is explicitly versioned `0.2.5` with kind `raw_capture_frame`.
It contains `frame_id`, the existing `SourceRef`, device/session/stream identifiers,
the complete PNG artifact reference, raw dimensions and independent native buffer
sequence. All properties and nested fields are required; unknown values are
explicit `null`, not missing fields or fabricated defaults.

| Field | Meaning and constraint |
| --- | --- |
| `captured_at` | Always `null` in this native profile: pixel-capture UTC is unknown. |
| `media_position` | Always `null`: ReplayKit sample PTS is not a course playhead. |
| `buffer_sequence` | Positive JavaScript-safe integer counting native video buffers, starting at 1. No equality/order inference against process sequence. |
| `raw_width`, `raw_height` | Positive JavaScript-safe integers describing delivered PNG pixel dimensions before any orientation transform. No dimension swapping. |
| `artifact` | Exact immutable `artifact_id`, lowercase SHA-256, positive byte length (existing 32 MiB original-upload ceiling), and `image/png` type. Metadata does not establish stored bytes, PNG validity or decoded dimensions. |
| `timing.observed_at_estimate` | Nullable UTC **callback wall-time estimate**, separate from capture time. A value requires the fixed `session_wall_plus_callback_monotonic_delta` basis and a callback clock. |
| `timing.estimate_basis` | That fixed basis only when an estimate exists; otherwise `null`. It labels the producer's declared calculation, not a measured wall-time observation. |
| `timing.uncertainty_ms` | Always `null`: error, drift and callback delay are not measured. Never zero by default. |
| `timing.callback_clock` | Nullable existing CaptureClock shape (`domain_id`, integer nonnegative `elapsed_ms`, `uncertainty_ms:null`). The domain refers to callback observation, not pixel capture or sample PTS. May remain available when the estimate is unknown. |
| `timing.sample_pts_seconds` | Separate finite JSON number or `null`; negative finite values remain representable. It is not UTC, elapsed callback time or course time. Existing JSON-safe integer/depth guards apply. |
| `orientation` | System `CGImagePropertyOrientation`, exact integer value 1–8 or `null`, and `applied_to_pixels:false`. Mirrored values remain distinct. Unknown does not become upright (1). |

A native mapper may derive the labeled estimate from its saved session wall/host
anchor and callback host time. This contract does not calculate it, verify those
local observations, round time values or read filenames/sidecars. A non-null
estimate without its callback domain is refused. A producer restart needs a new
clock domain/incarnation; mere schema validation cannot prove uniqueness or clock
accuracy. The native original PNG and sidecar files stay untouched.

## Exact pure binding

The helper validates the full supplied ProcessBatch 0.2.0, DisplaySourceSnapshot
0.2.3 and OriginalArtifactBinding 0.2.2 using their existing validators. It then:

- Requires the requested record to exist and explicitly name the raw frame ID.
- Matches owner/source/version across descriptor, selected record, display source
  and original binding; device/session/stream across descriptor, batch and display.
- Requires a `screen_image` original with the exact complete PNG reference also
  present in the selected record. Separate ink/other references remain unchanged.
- Requires selected `observed_at` and course `media_position` to stay `null` in this
  profile. A labeled callback estimate cannot enter the unqualified observation
  field. If a process `clock` is supplied, it must exactly equal the callback clock
  (domain, elapsed value and unknown uncertainty). A null process clock may omit
  this duplication while the descriptor still retains its callback clock.

Explicit existing provisional/attempt scope and all process limitations remain
intact; this helper grants no attempt relation or producer authority. Other records
get existing batch structural/causality checks, but this selected-record helper
does not bind their sources/artifacts. Current authenticated access, stop/revoke/
delete fences, immutable persistence/replay, exact stored bytes, PNG decoding,
raw-orientation display/model handling and final-use checks remain future consumer
obligations under an explicitly released baseline. A clock is not freshness or
cross-device alignment; a metadata binding is not actual AI input or presentation
permission. Both full-screen/AI and original-ink core gates remain open.

## Generation and checks

```sh
python -m packages.contracts.capture_frame.generate
python -m packages.contracts.capture_frame.generate --check
python -m pytest -q packages/contracts/tests/test_capture_frame.py
```

The standalone schema roots at `RawCaptureFrame`; TypeScript is generated using
the existing shared generator. Types are structural: finite numbers, safe integer
ranges, timestamp formats and cross-object equality still need runtime checks.
No OpenAPI document, route or dependency is introduced. Lead has integrated the
generator check into `scripts/check.sh` and structural types into the root TypeScript
check. Consumer adoption requires the explicit owner task and exact release commit;
this metadata release does not expand the 0.2.4 transport.
