# Desktop frame metadata 0.2.7

Pure additive metadata/binding contract, starting with the actual
`macos_screencapturekit` producer at
`7efa46ab75fadf4a6a05f4071526ebd7643df6ea`. This is a descriptor for a **retained
PNG**, not a live observation, capture grant, transport or claim about AI receipt.
Windows has no profile in this version. Existing 0.1.0–0.2.6 remain unchanged and
reject this descriptor; no endpoint or capability is automatically widened.

```python
from packages.contracts.desktop_frame import validate, validate_binding

validate(frame)
validate_binding(batch, record_id, frame, display_source, original_binding)
```

`validate_binding` requires one explicitly selected ProcessBatch 0.2.0 record,
DisplaySourceSnapshot 0.2.3 and OriginalArtifactBinding 0.2.2. It binds the exact
owner/source/version, device/session/stream, frame ID and complete PNG reference.
It preserves the whole batch's existing constraints, attempt/session scope,
additional ink references and all inputs. It does not inspect stored bytes, decode
PNG dimensions, fetch files/URLs, authenticate, grant capture, attest completeness
or authorize help presentation. Those remain service/consumer checks.

## Actual Mac source mapping

The wire uses required keys with explicit nulls; native `CaptureFiles` JSON omits
nil keys. A later trusted adapter must retain that distinction, map missing
optional facts to null, and obtain source/artifact/identity bindings separately.
No adapter, file parser or native application changes are part of this package.

| Wire fact | Exact native record and meaning |
| --- | --- |
| `callback_sequence` | `KeptFrame.sequence`: accepted screen-callback ordinal from 1, including idle/blank/status callbacks. Kept frames can skip ordinals. It is not ProcessRecord.sequence, kept-frame count or a hardware buffer sequence. |
| `raw_width`, `raw_height` | Delivered `KeptFrame.width/height` in pixels, kept at their own size without spatial crop/scale/rotation. They need not equal requested output dimensions. |
| `artifact` | Existing full PNG reference uses `KeptFrame.sha256/byteLength/mediaType` of the actual retained file; artifact/source identifiers come from the existing archive. RGBA or in-memory hashes cannot substitute for file-byte digests. |
| `profile.pixel_format` / `encoding` | Delivered FourCC string versus separately encoded PNG. Actual `FrameStore.encoding` is retained verbatim: lossless RGBA8/sRGB PNG, native size, not rotated. Pixel format does not establish orientation. |
| `native_session_id` | `SessionStatus.session`, separate from the shared learning session and capture stream IDs. No new identity authority is created. |
| `host_clock` | `startedWall/startedHost`, `KeptFrame.callbackHost`, `facts.displayTimeTicks/displayTimeSeconds`. Host seconds are the producer's Double values derived from mach_absolute_time, a boot clock that excludes sleep. They are not session elapsed time. |
| `sample.presentation_time_seconds` | Numeric `FrameFacts.presentationTime` (CMTime seconds) or null, distinct from callback and display clocks. Negative values and repeated/out-of-order values are not silently converted into a playhead or reordered. |
| `sample.status` | `complete` only: actual recorder retains a frame only for a complete callback with an image and successful storage. Idle/blank/suspended/missing/status/no-image/failure/cap events do not become fabricated PNG frames. |
| `display_at_start` | Exact startup `DisplayFacts`: display ID (UInt32, not stable across reconnections), optional name, `SCDisplay.frame` in global points, point-pixel scale, requested pixels, reported rotation degrees, main flag and the actual scope string. This is not a claim about later display state. |
| `sample.content_rect/content_scale/scale_factor/dirty_rects` | Optional `SCStreamFrameInfo` attachments copied as reported. Basis is explicit; units/transform to image/global coordinates are not established by the producer and remain null. Known-empty dirty rectangles `[]` differ from unknown `null`. |

Global display/attachment origins may be negative. Rectangle extents are
nonnegative, and known scales are positive. No inferred containment, crop,
normalized-coordinate transform or requested/delivered-size equality is enforced.
Display rotation remains a separate reported fact: `pixel_orientation` is null
and `pixels_transformed` is false (no spatial transformation; PNG encoding still
converts buffer representation to RGBA8/sRGB). The scope enum also preserves the
exact Swift fixture label `synthetic fixture; not a captured display`; it must
never be changed into the production display description. Later display-change notes are not silently
folded into the startup snapshot. Current metadata bounds are 1024 characters for
the display name, 4096 dirty rectangles, safe JSON integers and the existing
32 MiB PNG reference ceiling. An over-limit native frame must be reported as
unrepresentable by a later adapter, never truncated/relabelled as successfully
archived; the native session byte cap is not a per-file guarantee.

## Time and exact native values

`captured_at`, `media_position`, estimate uncertainty and pixel orientation are
always null. Actual pixel-capture UTC/course position are not present in this
producer. Its Double host seconds stay intact; it supplies no Process CaptureClock
domain/elapsed-ms pair, so both `timing.callback_clock` and the selected process
record's `clock` remain null. Do not invent an integer clock by rounding those
native observations. The record's `observed_at/media_position` must also be null.

An optional `observed_at_estimate` must carry
`session_wall_plus_callback_monotonic_delta` and equal recorded start UTC plus
`callback_seconds - session_started_seconds` (Python datetime microsecond
rounding). Validation only verifies this labelled calculation. Native wall
anchors support at most three fractional digits and estimates at most six;
finer supplied instants are rejected rather than silently truncated. Sleep, clock changes and scheduling
still make actual capture UTC, uncertainty and freshness unknown. Do not derive
the estimate from display ticks or sample PTS. Leaving both estimate/basis null
is always valid, including when the delta is outside the UTC representable range.

`display_time_ticks_decimal` is a **canonical decimal string** from `0` through
`18446744073709551615`, including values beyond JavaScript's safe integer range.
Convert UInt64 to this string before any JavaScript JSON parsing; stringifying an
already-rounded JS number loses the original evidence and is invalid provenance.
The existing native JSON emits a UInt64 number, so adapter input must use a
lossless parser or native conversion. Ticks and separately persisted converted
seconds are both present or both null. The native mach timebase numerator and
denominator are not retained; this contract does not invent them or claim to
verify their conversion. No raw callback-tick value is invented either.

## Checks and explicit limits

```sh
python -m packages.contracts.desktop_frame.generate
python -m packages.contracts.desktop_frame.generate --check
python -m pytest -q packages/contracts/tests/test_desktop_frame.py
```

The existing generator produces isolated JSON Schema and structural TypeScript.
Python runtime validation supplies cross-field and binding checks; TypeScript
types alone cannot prove them. Lead owns root generator/typecheck integration.

`examples/macos-synthetic.json` is synthetic metadata with a placeholder digest,
not native-emitted bytes or an actual clock conversion. It deliberately exercises
an exact large tick string, independent requested/delivered geometry and unknowns.
**Hosted Swift-emitted fixture verification: not_run.** Actual ScreenCaptureKit
capture, permissions, OS operation, bytes and screen-to-AI acceptance are unverified
by this package. Both §7.1 gates, editable ink and destinations remain separate.

Lead next reviews/releases this profile and coordinates explicit versioned
transport/archive/resolver/Learning adoption. No old reader accepts it yet.
Frameless shared-display gaps still need their own later transport solution;
never manufacture a frame or reuse stale pixels to satisfy a frame requirement.
