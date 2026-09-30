# Screen Observer raw-frame process batches to `POST /v2/process/raw-frames:batch` (native)

Task: the lead's bounded P0-03/P0-11/P0-07 continuation `handoff_63bc0c142d28c594c19f5d6fafe8d405`.
Baseline `2a5e6bcc6c6ff73ff0148d8b6e88ffd257eac253` is normally merged into `team/ios` as `77a33bb`,
and the tree equals `2a5e6bc`. The previous mapper, `6a33b87` (integrated as `fe5feac`), passed hosted
run 36670348178 (40/40 native, 104/104 fixtures).

Read at that revision:
- the complete `raw_capture_ingress` 0.2.6, `capture_frame` 0.2.5 and `process_v2` 0.2.0 READMEs,
  schemas and validators (including `validate_ack`);
- `raw-frame-backend-next-scope.md` and the service's `received_at` format;
- R29, R30, R35, R36, R51, R52 and R58;
- A12, A14, A16, A30 and A31;
- AUDIO-08, AUDIO-14 and the workflow.

## Outcome

After a kept frame's original bytes were committed through `OriginalUploader`, its metadata can be
sent once as a `RawFrameBatchRequest` 0.2.6 to `POST /v2/process/raw-frames:batch`, with a mandatory
`Idempotency-Key`. It counts as committed only after a complete, verified `ProcessBatchAck` 0.2.0.
The request can be retried after a lost response or a relaunch, using the unchanged envelope and
key.

[`RawFrameIngress.swift`](../../../apps/ios/ScreenObserver/ScreenObserver/RawFrameIngress.swift)
belongs to the app target only; nothing calls it, and neither the UI nor `BroadcastUpload` contains
it. It needs an explicit opt-in: the caller supplies the identity, the record profile, an
authorization and a transport. There is no default endpoint or token and no automatic retry.

Reused as they are:
- the uploader's state file, `flock`, durable witness, fail-closed reads and Stop;
- `IngressTransport`, `IngressAuthorization` and token redaction;
- error categories and the redirect guard;
- the actual `RawCaptureFrame` mapper.

The only separate state is one `frameBatches` list in the same `original-uploads.json`. It exists
only because `bytes_committed` is not a `ProcessBatchAck`, and it is omitted until used, so existing
state files are unchanged.

This is a sampled-pixel metadata commit. It is not semantic understanding, continuous coverage, AI
input or either §7.1 gate.

## Record profile (fixed)

| Field | Value |
| --- | --- |
| Envelope | `{contract_version: "0.2.6", batch: ProcessBatch 0.2.0, frames: [the mapper's RawCaptureFrame 0.2.5, embedded byte for byte]}` |
| Batch | The caller's `batch_id` and `delivery_mode` (`live` or `historical`), and the identity's device, session and stream. One record. |
| Record | The caller's `record_id` and **process** `sequence` (never the buffer sequence), with scope `provisional_session`, surface `external_app` and method `visual`. `causal_parents: []`, `observed_at: null`, `media_position: null`, `frame_id` = the descriptor's. |
| Evidence | Coverage `observed_samples`, with limitations `[sample_only, unsupported_history]`. `from_clock_ms` and `through_clock_ms` are null (unknown bounds) and `missing_sequences` is empty. No gap is fabricated. |
| Clock | Exactly the raw callback clock, or `null` when the clock domain or anchor is unknown. |
| Artifacts | `[the committed original's reference]`, equal to the descriptor's artifact. |

No actor, reason, edit, causality or coverage interval is inferred. The caller's identity and
registration, and the bootstrap that provides them, remain a lead/Backend dependency. Nothing is
minted here.

## Behaviour

**Enqueue** (`enqueueFrameBatch(_:identity:profile:)`):
- It is allowed only for a frame whose original is exactly `committed`, and it uses that
  original's own binding. It is refused after a saved Stop.
- The request is built from the mapper's frame and the profile, and checked:
  - identifiers and the Idempotency-Key syntax;
  - a sequence of 1…2⁵³−1;
  - a delivery mode;
  - at most 4 MiB.
- It is saved with its SHA-256 before anything can be sent.
- The same frame with the same key and envelope returns its record. Another key or envelope for it,
  or a key, batch, record or sequence already used by another frame, is refused. Identities are
  never rewritten.

**Send** (`sendFrameBatches(_:)`): one explicit pass.
- Before each batch it checks:
  - local and saved Stop;
  - a disabled uploader;
  - cancellation;
  - capture liveness;
  - that the original is still committed and the recorded request is intact.
- The attempt is recorded under the lock before sending. That orders it against a Stop, and
  cancellation is checked again just before dispatch.
- The request is exactly `POST /v2/process/raw-frames:batch` with `Content-Type`/`Accept`
  `application/json`, the bearer token and `Idempotency-Key`. The original PUT is unchanged.

| Response | Result |
| --- | --- |
| 200 with exactly the verified ACK for this batch | `committed`. Only the canonical ACK is stored, rebuilt from the request's own identities plus the checked `disposition` and `received_at`, never the received bytes. |
| 200 with anything else: pending/partial/extra/foreign/mismatched, a `received_at` that is not a real UTC date-time, or an error body | Still `pending`. This uploader sends nothing more. |
| No response or cancellation | Still `pending`, outcome unknown. A later pass sends the same envelope and key. |
| 409 `idempotency_conflict` or `record_conflict`, 413 `payload_too_large` (with a valid `RawIngressError`) | `refused` for good. No new key or envelope is made. |
| 409 `capture_stopped` | Durable Stop; nothing more is sent. |
| 401, 403, 404, 409 `stale_scope` / `unsupported_source` | Still `pending`; this uploader is disabled. |
| 409 `dependency_missing`, 503, anything else (including a proxy 413) | Still `pending`; the pass ends. |
| Response from another URL | Still `pending`; this uploader is disabled. |
| Stop saved before the attempt | Nothing is sent. Batches stay pending locally, and their already committed originals are kept, for a later, separately authorized recovery. |
| Stop during the request | A valid late ACK is recorded as `committed (after the stop; nothing more is sent)`. No other batch is sent. |

Token handling is as for originals. The token is held in memory only. Only fixed error categories
are recorded, and the stored ACK is canonical, so a duplicate member carrying the token cannot reach
the state.

## Checks

Exact command for the existing hosted `macos-26` workflow (the lead wires it into CI):

```sh
xcrun swiftc -target arm64-apple-macos14 \
  apps/ios/ScreenObserver/Shared/CaptureStore.swift \
  apps/ios/ScreenObserver/BroadcastUpload/FrameStore.swift \
  apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift \
  apps/ios/ScreenObserver/ScreenObserver/RawCaptureFrame.swift \
  apps/ios/ScreenObserver/ScreenObserver/RawFrameIngress.swift \
  apps/ios/checks/RawFrameIngressCheck/main.swift \
  -o "$RUNNER_TEMP/raw-frame-ingress-check"
"$RUNNER_TEMP/raw-frame-ingress-check" "$RUNNER_TEMP/raw-frame-ingress-fixtures"
# then, in the existing pinned uv environment:
python apps/ios/checks/RawFrameIngressCheck/validate_raw_ingress.py "$RUNNER_TEMP/raw-frame-ingress-fixtures"
```

Several other commands must be rerun because `OriginalUpload.swift` changed:
- The existing CaptureIngressCheck and RawCaptureFrameCheck commands still compile unchanged:
  `OriginalUpload.swift` stays self-contained, and the new state field is optional.
- They should be rerun, together with the unsigned SDK builds, which now also compile
  `RawFrameIngress.swift`.

**Swift check** ([`main.swift`](../../../apps/ios/checks/RawFrameIngressCheck/main.swift)). A passing
run prints 27 `PASS` lines and 0 `FAIL`. It is split into per-scenario functions. It uses:
- real FrameStore PNGs, with originals committed by the real uploader, whose PUT still has no
  Idempotency-Key;
- an in-process fake service.

It covers:
- the exact envelope, record profile and embedded frame bytes;
- commit, and the request's method, route, key, headers and body;
- the canonical stored ACK, and reopening;
- eligibility: an original that is not committed is refused;
- identity reuse and refusals of an invalid key, sequence or mode, which change no file;
- 29 ACK variants (4 accepted), all built for the very request that `request-live.json` holds;
- a pending-artifact ACK followed by the disabled uploader;
- a lost response, relaunch and a `duplicate` ACK, with the same body and key on every attempt;
- idempotency and record conflicts, `dependency_missing`, a proxy 413, and `capture_stopped` as a
  durable Stop;
- Stop saved before sending, Stop during the request with a late ACK, and early cancellation;
- corrupted and lost state;
- a token in an error domain and in a duplicate ACK member;
- a redirect, and paused capture;
- an unknown-clock `historical` request;
- a final scan that no token appears in any file.

**Python check**
([`validate_raw_ingress.py`](../../../apps/ios/checks/RawFrameIngressCheck/validate_raw_ingress.py)).
It covers:
- for each request:
  - `raw_capture_ingress.decode_request` (the strict reader), `validate_frame_batch` with the
    trusted owner, and `canonical_request` equality;
  - the fixed record profile;
  - `capture_frame.validate_binding` with the committed original binding;
  - the route, method and Idempotency-Key syntax;
- for each ACK, `raw_capture_ingress.validate_ack` (verified-only) reaching the Swift verdict;
- `RawIngressError` bodies.

## Evidence levels

| Level | State |
| --- | --- |
| Source written | Batch builder, ACK validator, uploader extension, Swift check and Python validator. The Swift is **uncompiled**, because there is no Mac here. |
| Python validator | Executed on Linux in the repository's pinned environment (`.venv`: jsonschema 4.26.0, rfc3339-validator 0.1.4). It ran against fixtures from a Python simulation of the Swift builder and verdicts, not Swift output: 41 `PASS`, 0 `FAIL`. All 29 ACK verdicts agreed with `validate_ack`. Three negative controls failed as expected: a surface change, a non-canonical space and a flipped verdict. The validator now refuses to run unless RFC 3339 date-time checking is active. A plain interpreter without `rfc3339-validator` would otherwise accept impossible dates. |
| Independent review workflow (`wf_ded04a3f-eb1`) | Four reviewers (compile, contract, state/safety, check trace), each finding verified adversarially: 7 findings, 4 confirmed, 3 refuted. There was no compile error and no production contract defect; the Python simulation of the request passes every released validator. Fixed:<br>• (medium, found twice) the ACK matrix was built from another session's request while its fixtures named `request-live.json`, so 4 verdicts would have failed in CI. It now uses that exact request.<br>• (low) the Stop-before-send label claimed the originals stay pending; they are committed and kept, which the check now asserts.<br>• (low) `received_at` accepted impossible dates such as 2026-02-30, which `validate_ack` refuses. There is now a calendar check and an extra ACK variant.<br>Reading is not compiling. |
| Final review of the fixes (`wf_edbb6847-d15`) | One reviewer plus adversarial verification. It confirmed one compile error introduced by the fix: a plain `try` left in the now non-throwing `checkAckMatrix`. That is fixed with `try!`, and no other unhandled `try` remains in that function. It traced 27 Swift expects and 29 ACK verdicts (4 accepted), and ran the Python check in the pinned environment: 41 `PASS`. Reading is not compiling. |
| Backend counterpart, main `8e4f52d` (implementation `61401a1`), read with `git show` and not merged | Consistent with this sender; no mismatch found. Specifically:<br>• the route is opt-in (`enable_raw_ingress=True`) at exactly `POST /v2/process/raw-frames:batch`;<br>• exactly one valid `Idempotency-Key`, no query, at most identity `Content-Encoding`, `application/json`, and a 4 MiB bound;<br>• exact replay returns the original verified 0.2.0 ACK, and a changed envelope at the same key gives `409 idempotency_conflict`;<br>• errors are the 0.2.6 `RawIngressError`.<br>Actually composing real Swift fixtures with that handler is the lead's next step. |
| Swift check and fixtures on macOS | **Not run.** Waiting for the lead's review and the existing hosted workflow. |
| App compile | **Not run.** Waiting for the same hosted run. |
| Backend 0.2.6 adapter, network, device, provider | None. Only an injected test transport, until the adapter's exact release. |

## Remaining dependencies

- **Trusted bootstrap** (lead/Backend):
  - the registered source;
  - the device, session and stream;
  - the clock domain;
  - the record ID, process sequence, batch ID, key and delivery-mode assignment.
- **Backend's 0.2.6 adapter** (a parallel task). The lead then validates the actual path from
  native fixtures to Backend.
- **Separately authorized recovery** of batches and originals kept pending after a Stop.
- **Real device and ReplayKit values**, and **activation UI review**.
