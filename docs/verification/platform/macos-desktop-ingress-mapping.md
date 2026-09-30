# macOS retained session → DesktopFrame 0.2.7 / DesktopFrameBatchRequest 0.2.8 (pure mapper)

Task: the lead's same-card consumer `handoff_eabebbfa7e6ee1a1d7d065e710d93c2e`, with its
clarification `handoff_257fd61e0b1a3d1a4b91197a49a14ebf`. The start notice was
`handoff_af8220ead1a524ce2aa0eead0ca9b678`.

Baseline: main `59ee862be3e7a51e3b51caa31878db8aa36f6d74`, normally merged into `team/ios` as
`e504b70`. The only conflict was the platform index line, which keeps the retained `4cc605a` spec
link. `apps/macos` equals `59ee862`.

Read at that revision:
- the complete `packages/contracts/desktop_frame` and `desktop_capture_ingress` READMEs and
  validators;
- ProcessBatch 0.2.0, OriginalArtifactBinding 0.2.2 and DisplaySourceSnapshot 0.2.3;
- §7.1 and §7.4 (English), D-DESKTOP-FIRST and `desktop-frame-next-scope.md`;
- R03/R07/R27/R35/R36/R46/R51/R52/R58/R59 and A12/A14/A16/A26/A30/A31.

The same baseline's hosted Mac run `36704517145` passed its release build and 20 XCTests.

## Outcome

`Sources/DesktopCapture/DesktopIngress.swift` and `DesktopJSON.swift` add a **pure, uncalled**
mapper. It reads a retained session and prepares bytes. It sends, registers, grants, provisions and
activates nothing, and neither the app nor any route calls it.

| Piece | What it does |
| --- | --- |
| `RetainedSession.read(_:)` | Read-only; nothing is written, moved or deleted.<br>- Reads `status.json` and `events.jsonl` with the recorder's own `CaptureFiles.decoder`, so UInt64 display ticks are parsed as UInt64, never as Double.<br>- Keeps `startedWall` as the exact text.<br>- Kept frames are the `kept` events. Each file must be `frames/NNNNNNNN.png` inside the session, and is re-hashed with the reviewed `FrameStore.digest`. A mismatch or unreadable file becomes `originalProblem`, and that frame is not mapped.<br>- Native gaps come from gap events, gap and `not_retained_*` runs, and a still-open run.<br>- Session notes are kept: each later `display_parameters_changed` event, and known write failures.<br>- An unreadable file or event line refuses the whole session. A torn final line after disk-full, for example, leaves the session unmappable by this mapper; its retained files stay intact. |
| `DesktopIngress.frame(...)` | One kept frame as a desktop frame 0.2.7 value, with the trusted frame ID, incarnation and OriginalArtifactBinding 0.2.2. |
| `DesktopIngress.request(_:session:)` | One unsent DesktopFrameBatchRequest 0.2.8, from a `DesktopIngressPlan`. The plan's trusted identities are batch ID, Idempotency-Key, delivery mode, incarnation, source, native session, start display, and per entry the record ID and **process sequence**. Its entries are kept frames (by callback sequence) and native gaps. The result also returns sentences for what 0.2.8 cannot carry: one per session note, and one per gap entry. |
| `DesktopJSON.encode` | Standard Foundation `JSONEncoder` output with sorted keys and unescaped slashes. A non-finite number is refused. Any integer token beyond ±(2^53 − 1) in the actual output is refused. The bytes are kept as produced for retries, with no custom serializer and no Python text equality. |

### Field mapping

| Wire | Native source | Rule |
| --- | --- | --- |
| `frame_id`, `device_id`/`session_id`/`stream_id`, `source`, `artifact` | Supplied by the trusted host | Contract identifiers are checked. The binding must be a 0.2.2 `screen_image` for the plan's source. Its SHA-256 and length must equal the retained, re-hashed PNG's. |
| `callback_sequence` | `KeptFrame.sequence` | The callback ordinal. Process sequences are never derived from it. |
| `raw_width`, `raw_height` | `KeptFrame.width/height` | The delivered size, positive safe integers. |
| `profile.native_session_id` | `SessionStatus.session` | It must equal the plan's registered native session. |
| `profile.display_at_start` | `SessionStatus.display` | Exact startup facts. The display ID must equal the plan's. The name is at most 1024 **code points** (a combining sequence counts per scalar). The scope must be one of the released descriptions. |
| `profile.pixel_format`, `encoding` | `KeptFrame.pixelFormat`, `.encoding` | The encoding must equal the reviewed `FrameStore.encoding`. |
| `host_clock.session_started_wall_utc` | `status.json` `startedWall` text | Verbatim, at most 3 fractional digits. |
| `host_clock.session_started_seconds`, `callback_seconds` | `startedHost`, `KeptFrame.callbackHost` | Finite, nonnegative Doubles; the callback may not precede the session origin. |
| `display_time_ticks_decimal`, `display_time_seconds` | `facts.displayTimeTicks` (UInt64), `.displayTimeSeconds` | Ticks become a decimal string in Swift, e.g. `18446744073709551615`. Both are present or both null. |
| — | `KeptFrame.sourceHost` | Not emitted. It is the recorder's validated source time: `displayTimeSeconds` when ticks are nonzero and not later than `callbackHost` by more than `settings.sourceTimeLeadTolerance`. That tolerance and the verdict stay in `status.json` and `events.jsonl`; they are not on the wire. |
| `sample.*` | `FrameFacts` | Status `complete` only. The PTS may be negative. Unknown values are null, and known-empty `dirty_rects` stay `[]`. Up to 4096 rectangles; extents nonnegative, scales positive. |
| `captured_at`, `media_position`, `pixel_orientation`, `timing.*` | — | Always null, including both estimate fields. `pixels_transformed` is always false. |
| Records | Plan | `provisional_session` scope, `external_app`, `visual`, no causal parents. `observed_at`, `clock` and `media_position` are null. |
| Framed record | Kept frame | The frame's PNG reference; coverage `observed_samples`, limitations `[sample_only, unsupported_history]`. |
| Frameless record | Native gap | `frame_id` null, no artifacts, no operation, `missing_sequences` `[]`; coverage as below. |

**Gap coverage.** These are engineering defaults, which the lead accepted as reasonable:

| Native gap | Coverage | Limitations |
| --- | --- | --- |
| `no_callbacks`, `missing`, `unknown_<n>` | `unknown` | `unknown` |
| `blank`, `suspended`, `complete_without_image` | `unobserved` | `unknown` |
| `retention_cap_reached`, `keep_failed`, `not_retained_*` | `partial` (pixels delivered but not kept) | `sample_only` |

`idle` is not a gap and is refused as one. A native Stop or ending is not mapped as a gap.

**Unrepresented.** 0.2.8 has no field for:
- a gap's callback range, host interval or open state;
- a later display-parameter change;
- known-incomplete session files.

Each such fact in the plan's session returns one explicit sentence. The facts stay in `events.jsonl`
and `status.json`. Other native details are not reported either, such as a gap's `note`, a
`keep_failed` reason, or which callback followed a silence (`before_sequence`). They also stay in
those files.

**Refusals.** Each is a `MappingRefusal` with its reason. The retained original is never truncated,
relabelled or changed:
- binding hash or length mismatch;
- a PNG outside 1…32 MiB;
- a re-hashed original that no longer matches;
- more than 4096 dirty rectangles;
- a name over 1024 code points;
- an unknown scope or encoding;
- a status other than complete;
- a callback before the session origin;
- a non-finite value, negative extent or non-positive scale;
- a bad identifier;
- a native session or display that is not the registered one;
- a foreign-source binding;
- a callback with no kept frame;
- a frame ID naming two different frames;
- an artifact ID naming two different PNGs, which ProcessBatch 0.2.0 rejects;
- duplicate record IDs or sequences;
- a gap that is not retained, or not a coverage gap;
- more than 100 records, or a body over 4 MiB;
- an unsafe integer in the encoded output.

## Checks

```sh
swift build --package-path apps/macos/CompanionDesktop
COMPANION_DESKTOP_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-fixture" \
COMPANION_DESKTOP_INGRESS_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-ingress-fixture" \
  swift test --package-path apps/macos/CompanionDesktop                 # 25 tests
.venv/bin/python apps/macos/CompanionDesktop/checks/validate_desktop_ingress.py \
  "$RUNNER_TEMP/companion-desktop-ingress-fixture"
```

The ingress directory must be new and must stay separate from `COMPANION_DESKTOP_FIXTURE_DIR`. The
lead's `scripts/desktop-checks.sh` requires that root to hold exactly one sample session. Adding the
second variable and the validator step to that script is the lead's change.

**New XCTests** (`Tests/DesktopCaptureTests/DesktopIngressTests.swift`, 5 of 25). A real recorder
writes a synthetic session with asymmetric FrameStore PNGs: three kept frames (callbacks 1, 3 and 6)
and four gaps (blank, complete without image, missing status, and a 15 s silence).
- **Mapping.** Covers:
  - the largest UInt64 as `"18446744073709551615"`;
  - null versus `[]` dirty rectangles and a negative PTS;
  - negative display origin, rotation and a non-ASCII name;
  - verbatim wall text;
  - all null time fields.
- **Requests and fixtures.** Framed, frameless-only and mixed requests, including a second record
  of the same frame. Process sequences come from the plan. There is one unrepresented sentence per
  gap. The retained session is byte-identical before and after. With
  `COMPANION_DESKTOP_INGRESS_FIXTURE_DIR` set to a new directory, it writes there. The test stops
  before writing if the directory exists:
  - `native/<session>/` with the Swift-made status, events and PNGs;
  - `requests/*.json` with the exact bodies;
  - `manifest.json` with the synthetic trusted display source, bindings, gap kinds, unrepresented
    facts and each refusal's actual reason.
- **Refusals.** 24 named cases, each with its expected reason; no retained file changes.
- **Reader.** An altered PNG, a `../` path and an unreadable event line.
- **Standard JSON.** Sorting, unescaped slashes and UTF-8, NaN refusal, and unsafe-integer detection.

**Python validator** (`checks/validate_desktop_ingress.py`), run in the pinned venv:
- **Per request:**
  - strict `decode_request`;
  - `validate_frame_batch` with the trusted owner;
  - a semantic decode → canonical → decode round trip.
- **Per frame:**
  - `desktop_frame.validate_binding` with its first naming record, the display source and the
    binding;
  - retained PNG bytes (SHA-256, length, signature, IHDR size);
  - every field against the native files read with Python's exact integers, so ticks must equal
    the UInt64 text.
- **Per gap:** the gap kind is one that the native `events.jsonl`/`status.json` actually retain,
  read independently in Python, and the record carries the documented coverage.
- **Negative controls:** ten per mixed request, twenty in total. Only a jsonschema
  `ValidationError` counts as a refusal. Examples are ticks as a JSON number (a safe integer, so the
  decimal-string rule refuses it), an invented capture UTC or Process clock, an estimate without its basis, a pixel orientation, a
  duplicated frame, a substituted digest, and frameless records claiming samples, artifacts or a
  clock. The released contract must refuse each.
- **Swift refusals:** each must be an actual refusal.
- **Non-vacuity:** at least 3 requests, 1 frameless-only request, 3 frames, 20 refusals and 20
  mutations.

## Evidence levels

| Level | State |
| --- | --- |
| Source written | Mapper, JSON wrapper, 5 XCTests and the validator. **Uncompiled.** This Linux host has no Swift toolchain. |
| Validator executed on Linux | Pinned venv (jsonschema 4.26.0 plus rfc3339-validator) against a **Python simulation** of the test's fixtures (not Swift output): 77 PASS, 0 FAIL. Ten negative controls each failed as expected: native ticks, PNG bytes, wall text, empty-vs-null dirty rectangles, gap coverage, a gap kind absent from the native files, a non-refusal, ticks as a number, missing unrepresented facts and a vacuous set. |
| Actual Swift native records | The hosted run `36704517145` native fixture (`20260921T141320Z-5B5D1B52`), mapped by a **Python port** of the mapping. Its 2 kept frames and a frameless record for its blank run, parsed from the native `run` event, were accepted by `desktop_frame` 0.2.7, `desktop_capture_ingress` 0.2.8 and `validate_binding`, with PNG hashes re-checked. This proves that real native records are representable, not that the Swift mapper is correct. |
| Independent review `wf_be615f16-3ea` | Reading only: compile, contract mapping, test trace and doc/validator lenses, each with adversarial verification (7 agents). No compile error was found. See [review outcome](#review-outcome). |
| Swift mapper build and 25 tests; Swift-made ingress fixtures | **not_run.** Waiting for the lead's hosted run. |
| Transmission, route, token, Backend storage/ACK, Learning, provider or AI | **None.** The mapper is uncalled; there is no route or HTTP activation. |
| Interactive Mac capture, permission, real `displayTime` domain, Intel | **not_run.** |

## Review outcome

`wf_be615f16-3ea` found no compile error. Confirmed findings, all fixed:

| Finding | Resolution |
| --- | --- |
| High: the ingress fixtures shared the `COMPANION_DESKTOP_FIXTURE_DIR` root, which the lead's hosted fixture step requires to hold exactly one session, so that step would fail | They moved to their own variable, `COMPANION_DESKTOP_INGRESS_FIXTURE_DIR`. The script change is requested from the lead. |
| Medium: one artifact ID bound to two different PNGs was not refused, and ProcessBatch 0.2.0 would reject the body | Refused, with a new refusal case. |
| Low: the fixture-directory guard did not stop the test | It returns before writing anything. |
| Low: the retained-path check required exactly 8 digits, although `%08ld` is a minimum width | It accepts 8 or more digits, which must equal the callback sequence. |
| Low: the validator took gap kinds only from the Swift manifest | It also reads native gaps in Python and requires a match. The ticks-as-number control now reaches the decimal-string rule, and only `ValidationError` counts as a refusal. |
| Low: doc wording | Corrected: the `sourceHost` derivation, the unrepresented scope (session notes added in code), and the provenance of the actual-fixture gap record. |

Refuted findings:
- A torn event line refusing the whole session is the documented conservative choice; it is noted
  above.
- `before_sequence` is not a callback range; it is listed as not reported.
- `refused()` breadth has no false pass; it was hardened anyway.

## Limits and next owners

- **Identities.** All of them — owner, source, display source, device/session/stream, frame,
  artifact, record, sequence, batch, key — are synthetic in the fixtures. In production they must
  come from the reviewed trusted host (5af680f obligations), which is not implemented in Swift here.
- **Native gap facts.** Callback ranges and host intervals are not on the wire; that is a contract
  limitation, reported per gap.
- **Coverage.** Both §7.1 gates, editable ink, audio and destinations remain open.
- **Next:**
  - Lead: add `COMPANION_DESKTOP_INGRESS_FIXTURE_DIR` and the validator step to
    `scripts/desktop-checks.sh`, run the hosted `swift test`, then Backend and Learning seam
    composition and runtime ingress integration.
  - Native: fix any actual compile or test failure first.
