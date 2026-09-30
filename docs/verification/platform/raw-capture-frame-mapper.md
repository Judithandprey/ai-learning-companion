# Screen Observer keyframe to `RawCaptureFrame` 0.2.5 (native mapper)

Task: the lead's bounded P0-03/P0-11 continuation `handoff_0eacc947a0d86439b93891041abd0219`, with
review points `handoff_ec351b8832dbe3c7c7d903a8445b376f`.

Baseline `3ee3201b845a457556ba111b4a4f7719db7fd1b0` is normally merged into `team/ios` as `355e009`.
There was one add/add conflict, in `capture-ingress-originals.md`; it was resolved to main's version,
and the tree equals `3ee3201`. The baseline releases `capture_frame` 0.2.5 as pure metadata and
binding. The 0.2.4 HTTP transport is not expanded.

Read at that revision:
- the `capture_frame` README, generated schema and validators, and their tests;
- the lead's [native frame mapping boundary](../lead/native-frame-mapping-boundary.md);
- §3.1 and §7.1–7.2;
- R35, R36, R51, R52, R58 and R59;
- A16, A30, A31 and A41;
- AUDIO-08 and AUDIO-14;
- V-SourceTimeRelations.

## Outcome

[`RawCaptureFrame.swift`](../../../apps/ios/ScreenObserver/ScreenObserver/RawCaptureFrame.swift)
provides one pure function, `RawCaptureFrame.json(record:localSession:status:identity:binding:)`. It
maps an actual saved `KeyframeRecord`, and optionally the session's saved `CaptureStatus`, to the
exact canonical JSON of one `RawCaptureFrame` 0.2.5 (sorted keys, no whitespace).

- It belongs to the app target only. Nothing calls it, and it reads, writes, moves or deletes no
  file. A refusal is a thrown `MappingError`, so an original PNG and its sidecars can never be
  consumed.
- It reuses `OriginalSourceRef`, `OriginalArtifactBinding` and the identifier and hash checks from
  `OriginalUpload.swift`.
- The binding is the complete original binding 0.2.2, for example from the uploader's record.

This is a dependency component. It passes neither §7.1 gate:
- whole-visible-display observation reaching the real AI;
- original-screen cross-app ink reaching that same context.

It proves no freshness, coverage, orientation rendering, AI input, cross-device alignment or
producer permission.

## Inputs and caller obligations

| Input | Where it comes from | What the mapper does with it |
| --- | --- | --- |
| `record: KeyframeRecord` | The session's saved keyframe record (in `events.jsonl`, or `status.lastKeyframe`) | Checks it and maps it. |
| `localSession` | The ScreenObserver capture session directory that `record` and `status` were read from | `status.session` must equal it byte for byte, otherwise the call is refused. A `KeyframeRecord` has no session field, so **the caller is responsible for reading the record from that same session**. The mapper cannot prove it. |
| `status: CaptureStatus?` | The same session's saved `status.json`, or nil | Supplies the anchor (`startedWallTime`, `startedHostTime`). Nil means the clock is unknown. |
| `identity: RawFrameIdentity` | The caller's trusted, current registration: `frame_id`, `SourceRef`, `device_id`, `session_id`, `stream_id`, and optionally the callback clock domain of this producer incarnation | All are validated as contract identifiers and copied. Nothing is minted or inferred. A restarted producer needs a new clock domain. |
| `binding: OriginalArtifactBinding` | The frame's complete 0.2.2 original binding | It must be `screen_image` `image/png` 0.2.2, for the identity's exact source and version, with the record's exact SHA-256 and byte length. |

Full production bootstrap is **not** part of this mapper and remains a lead/Backend dependency:
who supplies the registered source, device, session and stream, and the clock domain, and when.

## What the descriptor says

| Field | Value |
| --- | --- |
| `captured_at` | Always `null`: the pixel-capture UTC is unknown. |
| `media_position` | Always `null`: the ReplayKit sample PTS is not a course playhead. |
| `buffer_sequence` | `record.sequence`, the native video-buffer count (1…2⁵³−1). It is not a process sequence. |
| `raw_width`, `raw_height` | The delivered buffer's size, unrotated and unswapped. |
| `artifact`, `source` | The binding's complete reference and the identity's `SourceRef`, which must be equal. |
| `orientation` | `CGImagePropertyOrientation`, the recorded value 1–8 (mirrored ones included) or `null` when none was reported, with `applied_to_pixels: false`. Unknown never becomes 1. |
| `timing.sample_pts_seconds` | `record.presentationTime`, a finite JSON number, which may be negative. It is not UTC, callback time or course time. |
| `timing.callback_clock` | `{domain_id, elapsed_ms, uncertainty_ms: null}`, present only with a supplied domain and the saved anchor. `elapsed_ms = ⌊(record.hostTime − status.startedHostTime) s × 1000⌋`. |
| `timing.observed_at_estimate`, `timing.estimate_basis` | Present only alongside the callback clock. The estimate is `⌊startedWallTime × 1000⌋ ms + elapsed_ms`, formatted as UTC `yyyy-MM-ddTHH:mm:ss.SSSZ`, with the basis `session_wall_plus_callback_monotonic_delta`. It is a **callback-observation estimate**, never a measured capture UTC. |
| `timing.uncertainty_ms` | Always `null`: error, drift and callback delay are not measured. |

**Number text.** The PTS is written as Swift's shortest round-trip decimal. This matches Python's
`json.dumps` except for magnitudes between 2⁵³ s and 10¹⁶ s, which are unreachable for a host-clock
PTS. Both forms are valid JSON numbers of the same value.

**Units.** Host times and Date offsets are in seconds; `elapsed_ms` and the estimate are whole
milliseconds, rounded down. The check uses a non-integral anchor (…20.250 s) whose expected results
(`…23.456Z`) were computed independently, so confusing seconds with milliseconds cannot pass.

**Known limit of the saved anchor.** `status.json` stores `startedWallTime` as ISO 8601 with whole
seconds (the capture store's `.iso8601` strategy). An estimate from the saved status therefore
inherits a truncation of up to 1 s: 14:13:23.206Z instead of the in-memory anchor's 14:13:23.456Z.
Uncertainty stays `null`. Changing the saved format is a separate decision, because it would change
how existing status files are read.

**Refused, with a visible error and no file touched:**
- any identifier that is not a contract `Identifier`, or an invalid `SourceRef`;
- no named local session;
- a binding for another owner, source or version; not `screen_image` PNG 0.2.2; or with another
  hash or length;
- a record whose sequence, size, media type, hash or length is out of contract;
- an orientation outside 1–8;
- a non-finite PTS or callback host time;
- a status of another local session;
- a non-finite or negative anchor host time;
- a callback before the anchor, treated as a different incarnation;
- a wall anchor before 1970;
- an elapsed time or estimate beyond the safe-integer or year-9999 range.

## Checks

Exact command for the existing hosted `macos-26` workflow (the lead wires it into CI):

```sh
xcrun swiftc -target arm64-apple-macos14 \
  apps/ios/ScreenObserver/Shared/CaptureStore.swift \
  apps/ios/ScreenObserver/BroadcastUpload/FrameStore.swift \
  apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift \
  apps/ios/ScreenObserver/ScreenObserver/RawCaptureFrame.swift \
  apps/ios/checks/RawCaptureFrameCheck/main.swift \
  -o "$RUNNER_TEMP/raw-capture-frame-check"
"$RUNNER_TEMP/raw-capture-frame-check" "$RUNNER_TEMP/raw-capture-frame-fixtures"
# then, in the existing pinned uv environment:
python apps/ios/checks/RawCaptureFrameCheck/validate_raw_frames.py "$RUNNER_TEMP/raw-capture-frame-fixtures"
```

The existing unsigned `xcodebuild` of `ScreenObserver` for both SDKs also compiles the new file into
the app target.

**Swift check** ([`main.swift`](../../../apps/ios/checks/RawCaptureFrameCheck/main.swift)). A passing
run prints 40 `PASS` lines and 0 `FAIL`. It is small and synchronous, apart from one detached
enqueue, and separate from the large upload check. It uses:
- a real PNG kept by ScreenObserver's `FrameStore`;
- the record and status saved and read back in their actual JSON formats;
- the binding from `OriginalUploader.enqueue`, with a transport that sends nothing.

It checks:
- the fixed fields and the record's sequence, size, orientation and PTS;
- the literal estimates `2026-09-21T14:13:23.206Z` (saved anchor) and `…23.456Z` (fractional
  anchor), with `elapsed_ms` 3206;
- the binding's artifact and source;
- byte-identical output from repeated mapping;
- unknown clock without a domain or without a status;
- zero elapsed with a negative PTS;
- all nine orientation values;
- 30 refusal cases by error kind;
- that across all of these mappings and refusals, the session directory is byte-identical: the PNG,
  record, status and upload state. The snapshot is taken right after the binding is created and
  compared after the last fixture.

**Python check**
([`validate_raw_frames.py`](../../../apps/ios/checks/RawCaptureFrameCheck/validate_raw_frames.py)).
It covers 15 Swift fixtures: both anchors, no domain, no status, zero elapsed with a negative PTS,
the largest buffer sequence, and all nine orientations. For each it runs:
- a strict JSON read;
- `capture_frame.validate`;
- canonical bytes;
- field-by-field equality with an independent recomputation from the recorded inputs;
- the anchor's session;
- the binding's hash and length;
- `capture_frame.validate_binding` against a composed ProcessBatch 0.2.0 and DisplaySourceSnapshot
  0.2.3, with the actual binding;
- where a callback clock exists, refusal of a process clock that differs by 1 ms.

## Evidence levels

| Level | State |
| --- | --- |
| Source written | Mapper, Swift check and Python validator. The Swift is **uncompiled**, because there is no Mac here. |
| Python validator | Executed on Linux against 15 fixtures produced by a Python simulation of the Swift builder, not Swift output: 104 `PASS`, 0 `FAIL`. Four negative controls each failed as expected: a 1 ms estimate change, a non-canonical space, a duplicate member, and `applied_to_pixels: true`. |
| Independent review workflow (`wf_b9fd79e2-5e7`) | Compile, contract/requirements and check-trace reviewers, each finding verified adversarially. There was no compile error. The contract and requirements review found no defect, and the check trace found all 40 checks passing. One low finding was confirmed by all three: the "no file touched" snapshot covered only the refusals. It is fixed, and the snapshot now spans every mapping. A PTS number-format finding was refuted; its residual, unreachable range is noted above. Reading is not compiling. |
| Swift check and fixtures on macOS | **Not run.** Waiting for the lead's review and the existing hosted workflow. |
| App compile with this file | **Not run.** Waiting for the same hosted run. |
| Device, ReplayKit, server, Backend/Learning adoption, AI input | None. |

## Remaining dependencies

- **Trusted bootstrap** (lead/Backend): who supplies the registered source and device, session,
  stream and clock-domain identity for each producer incarnation, and when.
- **Adoption:**
  - Backend: new-version ingress with the same authorized atomic transaction;
  - Learning: read and context adoption, with the raw orientation labeled;
  - display and model orientation handling.
- **An ingress wrapper for 0.2.5:** 0.2.4 is not expanded.
- **Device verification of real ReplayKit values:** PTS, host time and orientation attachments.

Observation for the owner, with no change made: `CaptureSession` records
`CMSampleBufferGetPresentationTimeStamp(...).seconds`. For an invalid CMTime, that would be NaN,
which `JSONEncoder` cannot encode, so the keyframe event and status writes would fail. Whether
ReplayKit ever delivers an invalid PTS is unverified. Any handling, for example recording the PTS as
unknown, would be a separate bounded change.
