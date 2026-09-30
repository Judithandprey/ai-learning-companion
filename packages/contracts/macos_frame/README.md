# Mac retained frames — 0.2.11

Prepared under Lead's explicit isolated shared-file delegation at
`5f80c0926f96d3afdb8da7a00c295b4f4e8fdd63`, reviewed and registered by Lead
after the integral-JSON correction. This release is a **pure metadata contract**;
consume the exact Lead-published revision and its generated artifacts together.
Existing 0.1–0.2.10 readers stay closed; there is no ingestion request or adapter here.

`validate(frame)` checks declared retained Mac raw/composed image facts.
`validate_binding(batch, record_id, frame, source, bindings)` also requires the
exact existing Process record, DisplaySourceSnapshot owner/source/version and
device/session/stream, and one 0.2.2 `screen_image` OriginalArtifactBinding for
each distinct image artifact ID. Binding order is immaterial. All inputs and
unrelated records, scope, parents and separate editable-ink references are preserved.

This is metadata validation: no bytes/files are opened, originals written,
identities created, producer admitted, permissions granted or provider activated.
Existing source authorization, byte verification and final disclosure controls
remain required at their respective runtime boundaries. An independently valid
structured Process record is not upgraded to trustworthy structured capture by
attaching this descriptor.

## Native facts and deliberate unknowns

The producer is `CaptureRecords.swift`, `FrameFacts.swift`, `InkComposition.swift`
and `CaptureRecorder.swift` at the assigned baseline. Field names follow existing
snake-case contracts; missing native optionals map to required explicit nulls.

| Candidate field | Actual native fact / limit |
| --- | --- |
| `raw` | KeptFrame file, filed-byte SHA-256/length/media type, dimensions and encoding. `native_file` is session-relative; artifact identity is supplied independently by the existing archive. |
| `callback_sequence` / `profile.pixel_format` | KeptFrame sequence and delivered buffer four-character pixel format. Sequence is not a Process sequence. |
| `profile.native_session_id` / `display_at_start` | Native session label and startup DisplayFacts, including exact scope/filter wording and its unverified qualifier. Native labels do not rebind archive identities. Startup geometry is not a later geometry measurement. |
| `profile.sample` | Complete callback's PTS and nullable contentRect/contentScale/scaleFactor/dirtyRects. Unknown dirty rectangles remain null; known empty remains `[]`. Other native attachments are not read by this producer. |
| `profile.host_clock` | Session wall/host anchor, callback admission, decimal UInt64 display ticks and converted seconds, KeptFrame sourceHost, and recorded source-time lead tolerance. PTS is independent. Source time is null for missing/zero/too-late displayTime. No tick-to-seconds timebase is invented. |
| `composition.kind = composed` | ComposedFrame's exact raw relation, independent PNG or empty-stroke raw-file alias, PairedInk and composedHost. This host timestamp is processing time only. |
| `composition.kind = not_composed` | Exact native callback sequence, outcome host, reason and detail. Every currently emitted reason is supported, including session ended before composition. |
| `composition.kind = unknown` | No retained outcome, including a crash between raw retention and composition or capture without composition. No reason, successful empty ink, stop state or missing file is inferred. |
| `composition.ink` | Paired pixelsHost/time basis, optional document reference, revision/commit host, stroke IDs in supplied creation order, exact rendering text, mapping and ordered limitations. No operation history is reconstructed from these fields. |

`captured_at`, `media_position`, `pixel_orientation` and `capture_latency_ms`
remain null. The selected Process record's observed_at/media_position/clock must
also be null. A startup wall anchor, callback age, PTS, display rotation or
composition timestamp cannot become capture UTC, course playhead, verified pixel
orientation, processing latency, chronology across sessions or live authority.
No estimated UTC field is introduced by this candidate.

Runtime checks tie the native filename to the callback ordinal, sourceHost to
the recorded validation rule, composition to its raw digest/length/dimensions,
ink pairing to source time or callback admission, and the mapping's numeric
ratios to frame size / startup display points. The producer's fixed unverified
mapping/rendering and limitations remain intact; this does not verify that the
display geometry or exclusion actually held for the pixels.

Empty strokes use the raw file and identical PNG facts, with one or two archive
references. Nonempty strokes use `composed/<callback>.png`; the file may still
contain identical bytes (for example offscreen strokes). Identical archive IDs,
native files or hashes cannot contradict PNG facts. Native-file identity and
archive identity are checked separately rather than conflated.

Revision zero has no strokes/commit time. A document committed before its last
reopening retains null revisionHost and its explicit unknown-clock limitation;
created-in-session and file labels do not establish clock comparability. A known
commit time must precede the paired time. The validator cannot establish that a
supplied revision/stroke list matches an editable original without that original.
Document path + revision is **not an immutable byte reference**, and even a
successful PNG composition does not prove ink was saved. Save-failure limitations
are preserved. Separate immutable editable-ink archive references may stay in
the Process record; this validator does not certify them or infer them from PNGs.

## Examples, limits and generation

`examples/producer-{status.json,events.jsonl}` are exact metadata bytes read with
`git show` from the audited hosted synthetic fixture at
`484e06ae7b8fb33ac8e67a11d9a25e959311a608`; `provenance.json` records paths and
hashes. `macos-retained.json` maps all seven kept images and seven outcomes
(six composed, one refused). All archive identities/bindings are explicitly
synthetic. These are real Swift-generated synthetic buffers, **not display
capture or real AI receipt**. Original fixture PNGs and ink history remain at
the lead's fixture path; this family does not duplicate an original archive.

Session counters, gaps, ending, capture_filter event process/bundle/name details,
geometry-change events, input/ASK events, editable strokes/operations/anchors,
save state and unrelated events remain in their native records. The descriptor
retains exact configured scope, not independent proof of excluded windows. It
is not a whole-session export. Native ingestion must later report unrepresented
facts rather than silently discard them; missing outcome does not resolve them.

Existing Identifier/safe-integer/UTC/rectangle/sample/32 MiB PNG-reference rules
are reused. The new 16,384-character detail/limit text, 1,024-character mapping and 512-character ink
path ceilings are engineering admission bounds: refuse oversized facts, never
truncate originals. Metadata uses the existing higher-level request limits;
this family introduces no transport envelope. Arrays are not silently truncated.

```sh
python -m packages.contracts.macos_frame.generate
python -m packages.contracts.macos_frame.generate --check
python -m pytest packages/contracts/tests/test_macos_frame.py -q
```

Generated JSON Schema and readonly TypeScript express structural constraints;
cross-field/binding rules require the Python runtime validator. The generator
reuses the existing schema-to-TypeScript tool, with no new dependency/framework.
