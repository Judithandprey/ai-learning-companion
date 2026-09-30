# Windows retained-frame metadata 0.2.9

Pure additive metadata for the `windows_electron` producer. This package has no
transport, endpoint, file reader, capture grant or service/consumer adoption.
Versions 0.1.0–0.2.8 remain unchanged and closed to this descriptor. Lead has reviewed this additive version and registered generation/type checks in
the root workflow. See the [release evidence](../../../docs/verification/lead/windows-contract-review/README.md).

Source candidate: `04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68`, specifically
`apps/windows/src/shared/{samples,retention}.ts`, `renderer/overlay.ts` and
`main/main.ts`. That original producer was **held for retention-integrity corrections**;
its committed sample supplies provenance, not producer acceptance. The later
correction `e586b82` is now reviewed/integrated through `0a3d879`; see
[correction evidence](../../../docs/verification/lead/windows-retention-correction-review/README.md).
This frozen example remains the historical04caef61 sample; current producer
mapping is the next explicit owner task. Do not
normalize missing facts or infer complete history from those files.

```python
from packages.contracts.windows_frame import validate, validate_binding

validate(frame)
validate_binding(batch, record_id, frame, display_source, original_bindings)
```

`WindowsFrame` describes one retained sample, containing its original `raw` PNG
and nullable `composed` image plus composition metadata. It deliberately keeps
the images separate, even when their actual file bytes are identical. The latter
image is a rendered derivative, not editable original strokes. The current
renderer always supplies both images; main's retained-file path also permits a
raw-only record, represented by `composed: null`.

`validate_binding` takes an explicitly selected ProcessBatch 0.2.0 record,
DisplaySourceSnapshot 0.2.3, and one OriginalArtifactBinding 0.2.2 per **distinct
artifact ID** across the two images. An identical shared artifact needs one
binding; different artifact IDs each need their own binding, even with identical
PNG files. Each binding is `screen_image`; every full reference must occur on the
selected record with the exact owner/source/version. Frame, device, session and
stream also match. Bindings may be reordered; duplicates, omissions, unrelated
bindings and `editable_ink` masquerading as an image are rejected. Separate ink
references and other Process records remain unchanged. Native capture/ink session
labels, OS source IDs and relative filenames never become shared identity grants.

The validator preserves inputs and generic Process vocabulary. It does not
authorize structured capture from a pixel producer or widen that producer's
current admission. Actual access, stored bytes, current lifecycle, disclosure and
independent input-acquisition authority remain later service obligations.

## Mapping actual producer facts

All wire keys are required; unavailable observations are explicit nulls. A later
trusted adapter must obtain archive IDs and original bindings independently.
There is no adapter implementation in this package.

| Wire location | Producer value and meaning |
| --- | --- |
| `profile.kind` | Closed discriminator `windows_electron`; metadata alone does not grant that producer authority. |
| `profile.retention_format/capture_session/started_at` | Manifest header format, local retention session and main-process wall observation. `capture_session` is separate from shared learning/session/stream IDs. |
| `profile.source_at_start` | Exact header `source`: Electron source/display IDs, label, DIP `bounds` and `scale_factor` chosen at Start. Signed origins are retained; later display state is not inferred. |
| `profile.sample.sample_seq` | Overlay sampling ordinal. It is not ProcessRecord.sequence or a count of retained files. |
| `profile.sample.frame_seq` | Ordinal when the held bitmap was taken. It can precede the sample using it, including later ink composition over the same held bitmap. |
| `profile.sample.sampled_at/taken_at` | Local app wall observations when sampling and taking the held image. Millisecond UTC-formatted strings do not establish pixel-capture UTC. Wall jumps are permitted without rewriting or sorting them. |
| `profile.sample.monotonic_ms` | Rounded overlay `performance.now()` at the sample. No Process clock domain, Mac mach clock/ticks or cross-session alignment is invented. |
| `presented_frames/stream_presented_frames` | Held-image callback count versus later observed stream progress. The latter can be newer. Callback metadata can precede the exact bitmap captured just afterward. |
| `presentation_ms/frame_age_ms` | Rounded browser presentation observation and later separately rounded age. Both are null when held `presented_frames` is zero. They exclude pre-presentation capture latency. Exact subtraction is **not** enforced or reconstructed: the reads and rounding differ. |
| `state` | `fresh`, `no_new_frame`, or `gap` from sampling logic. A retained gap/no-new-frame sample can contain real held pixels; “fresh” only reports callback progress, not capture freshness or complete coverage. |
| `gap_ms` | Explicit source-observed positive gap duration when actually available; otherwise null. Candidate 04caef6 omits it from retention, so all its derived examples use null. Never infer it from wall times, sequence differences or coalesced IDs. The integrated correction retains actual known gap_ms; its subsequent mapper
  must preserve that value and still use null when absent. |
| `reason/deferred_samples_not_retained` | Actual retention decision and increasing earlier deferred sample IDs. Coalescing does not retain those samples' images or establish a lossless history. |
| `change_from_previous_sample` | `raw.change_from_previous_sample`, a 0–1 luminance change against the previous sampled image. `reason: changed` uses the different last-retained baseline; no equality or threshold is inferred. |
| `raw` / `composed.image` | Exact image dimensions, full PNG artifact reference, `pixels_sha256`, and `native_file`. Native file digest and bytes map to `artifact.sha256/byte_length`; `pixels_sha256` describes renderer-read RGBA and cannot substitute for the file digest. |
| `composed.ink_session/ink_revision` | Actual document ID and revision pinned for this composition. Open/fork can change the ink session within one capture session; no equality or globally increasing revision is required. |
| `composed.visible_strokes/ink_marks/transformation` | Exact count, partition into verified/changed/unknown/following-content marks and emitted transformation text. “Verified” is a local alignment heuristic, not content identity or authenticated input history. |

Raw/composed dimensions match each other, independently of startup DIP size times
scale. Rendering actually scales X and Y separately; the descriptive transform
string reports a horizontal scale and is retained verbatim, not parsed into a
universal coordinate transform. Same native files must have consistent declared
image facts even under distinct archive artifact IDs. Same artifact IDs cannot
carry contradictory originals. The validator performs these consistency checks
without decoding pixels or proving the claimed composition.

`captured_at`, `media_position` and `capture_latency_ms` remain null. The selected
Process record's `observed_at`, `media_position` and `clock` must also be null.
Local wall/presentation observations do not justify filling any of them.

## Limits and preservation

Existing PNG references retain their **32 MiB per-file ceiling**, while the native
candidate permits files up to 96 MiB. Over-limit metadata is unrepresentable in
this contract; a later adapter must report it, never silently resize, trim or
claim successful archival. Both original images must remain intact. Numeric
values must be finite, integers safely representable in JavaScript, dimensions
positive, scales positive and coordinates within safe numeric bounds. Native
labels are capped at 1024 characters and transformation text at 4096; these are
explicit engineering metadata bounds, not inferred producer guarantees.

A gap before the first image, `not_retained`, refusal, unwritten/coalesced history,
or Stop is **not** a PNG frame. Their later transport adoption must retain actual
unknowns and failures; this schema does not turn them into stale fake images.
The preserved manifest has five retained samples, one write refusal, one
threshold omission and one cap refusal. Its samples do not establish complete
operations or capture intervals. Historical candidate defects reported by lead included
lost same-pixel gaps, omitted known duration, partial JSONL retry integrity and
Stop/final-write visibility. Those are producer corrections, not waived goals.

Historical04caef61 main verifies PNG signature/IHDR size and hashes encoded bytes; it does
not independently attest renderer pixel hashes or revalidate pre-existing files.
Composed pixels do not retain editable strokes; ink-document/session labels do
not prove original saving. Both §7.1 gates, R35/R36/R46/R51/R52/R59, actual AI
receipt, disclosure, full ink lifecycle and Notability import remain separate.

## Examples and checks

`examples/producer-manifest.jsonl` is the byte-identical committed manifest at
the exact producer candidate. SHA-256:
`bd866444e33ed7581244c2b2ff89a32c626521035b13283d60f6082587891382`.
`examples/windows-retained.json` preserves all five retained samples' emitted
metadata. Only archive identities/references use explicitly synthetic example
bindings; capture and ink labels, timestamps, PNG/RGBA digests, sizes, counts and
transformations retain actual values. Missing gap duration and capture timing
remain null. No PNG binary is duplicated by this package.

```sh
python -m packages.contracts.windows_frame.generate
python -m packages.contracts.windows_frame.generate --check
python -m pytest -q packages/contracts/tests/test_windows_frame.py
```

Generated JSON Schema describes closed structural/value shapes. Python adds
cross-field and binding checks; structural TypeScript alone cannot establish
them. Root generation and structural TypeScript checks include this package. These local metadata checks neither
launch the desktop nor accept the producer, service or provider flow.
