# Screen Observer originals to `PUT /v2/process/originals/{artifact_id}` (native consumer)

Task: the lead's bounded P0-03/P0-11/P0-07 continuation `handoff_1fe2aea7429ea6838ad2a0d00395f772`.
Baseline `1616cceb1a1fe21a4444919c07477faf749f71c1` is merged normally into `team/ios` as `146ccaf`.
That baseline has these released contracts:
- `capture_ingress` 0.2.4 (`4604242`);
- `original_artifact` 0.2.2;
- `display_source` 0.2.3;
- `control` 0.2.1.

Read at that revision:
- the package READMEs and generated shapes;
- §7.1 and §3.9;
- R07, R29, R30, R35, R36, R46, R51, R52 and R59;
- A12, A14, A16, A30, A31 and A44;
- AUDIO-14.

## Outcome

A PNG that Screen Observer has already kept can be:
1. encoded as an exact `OriginalArtifactUpload` 0.2.2;
2. sent through an injected transport to `PUT /v2/process/originals/{artifact_id}`;
3. counted as stored only after the complete matching `OriginalArtifactReceipt`.

The code is in [`OriginalUpload.swift`](../../../apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift).
It belongs to the app target only; the broadcast extension does not contain it, and nothing calls it
yet. The capture-only, no-send screen is unchanged until activation is reviewed.

This is a dependency component. It passes neither §7.1 gate:
- Gate 1 needs continuous whole-visible-display observation reaching the real AI.
- Gate 2 needs an original-screen cross-app selector or pen.

`bytes_committed` means only that the server stored the bytes. It is not a frame or process ACK,
not AI input, and not a live view.

## Interface

| Part | Meaning |
| --- | --- |
| `OriginalSourceRef(userID:sourceID:sourceVersion:)` | The exact `SourceRef` of an already registered shared-display source version, supplied by the caller. Nothing here registers, infers or invents a source, producer, start grant or app URL. One capture session is bound to one source. |
| `IngressAuthorization(origin:bearerToken:)` | Supplied explicitly for each pass. It must be a bare `https` origin (no path, query, fragment or user) and an RFC 6750 bearer token. It is held in memory only. Its `description`, `debugDescription` and mirror omit the token. |
| `IngressTransport` | `send(URLRequest) async throws -> (Data, URLResponse)`, injected by the caller. `URLSession` conforms, but nothing creates one. There is no default endpoint or credential. |
| `OriginalUploader(session:transport:)` | An actor for one `Capture/<session>/` directory. `enqueue(KeyframeRecord, source:)` records an original; `sendPending(_:)` runs one explicit pass; `stop(_:)` stops the session. There is no automatic retry, timer or ReplayKit call. |

**Request.**
- `PUT` to the route, with `Content-Type: application/json`, `Accept: application/json` and
  `Authorization: Bearer …`. There is no `Idempotency-Key`, which neither original PUT requires.
- The body is canonical JSON with sorted keys and no whitespace. It is built only from checked ASCII
  fields, so it equals Python `canonical_request` for the same payload.
- The file is read once, at most 32 MiB + 1 byte. Those same in-memory bytes are:
  1. checked against the kept record's length and SHA-256, then for the PNG signature;
  2. base64-encoded into the body.

  There is no second read between the check and the encoding.
- The artifact ID is `so.<session>.<frame file stem>`. It is an opaque local name. It is not a
  process sequence, and no PTS, host time or server time is mapped to frame or course time.
- The PNG stays exactly as FrameStore wrote it (unrotated), and its sidecars are untouched.

**Durable state.** One file holds it: `Capture/<session>/original-uploads.json`. It contains:
- the source;
- per original: its binding, route path, request length and SHA-256, state (`pending`,
  `committed` or `refused`), attempts, the last attempt time, the last outcome and the validated
  receipt body.

It holds no token, no transport error description and no second copy of the bytes.
- **Before sending:** the attempt is saved first; if that save fails, nothing is sent.
- **On retry, after a lost response, a cancellation or a relaunch:** the request is rebuilt from the
  original. It is sent only if its length and SHA-256 equal the recorded request.
- **Unreadable state:** it is refused and never overwritten.

| Condition or response | Result |
| --- | --- |
| HTTP 200 whose body is exactly the expected receipt (member order and whitespace may differ) | `committed` |
| HTTP 200 with any other body: malformed, partial, extra members, wrong types, or a foreign version, source, artifact, kind or status | Still `pending`. This uploader sends nothing more. |
| No response, a transport error or cancellation | Still `pending`, outcome unknown. The pass ends. |
| 401, 403, 404, 409 `stale_scope` / `unsupported_source` | Still `pending`. This uploader sends nothing more; a new, explicitly supplied authorization is needed. |
| 409 `capture_stopped` | The session stops for good. Pending originals stay pending and are never sent. |
| 409 `record_conflict`, 413 | `refused`. The local file is kept. |
| 503, 409 `dependency_missing`, other statuses | Still `pending`. The pass ends; only a later explicit pass retries. |
| Original missing, changed or over 32 MiB before sending | `refused`, not sent. The file is left as it is. |
| `status.json` reports `finished` | The session stops for good, as for `capture_stopped`. |
| Status `paused`, older than 10 s, or unreadable | Not live, so nothing is sent. The session is not stopped. |
| `stop(_:)` while a request is in flight | A valid late receipt is recorded as `bytes_committed (after the stop; nothing more is sent)`. No other original is sent, and the stop survives a relaunch. |
| A response whose URL is not the request URL (a followed redirect) | Still `pending`, outcome unknown. This uploader sends nothing more. The production transport must not follow redirects. |
| Cancellation before the request is sent | Nothing is sent and no attempt is recorded; still `pending`. |

**Backend at main `ddcae31`** (`services/api/ingress_app.py`, integration `6321d0c`, read with
`git show`, not merged). The wire shapes are unchanged from `1616cce`. The following were checked
against this consumer:
- the route;
- the `application/json` content-type rule;
- the 200 receipt;
- `redirect_slashes=False`;
- the fixed error mapping.

The lead's composition probe shows that after a Stop a new original PUT returns **403 `forbidden`**,
not 409 `capture_stopped`. This consumer treats 403 as lost authorization: that uploader sends
nothing more, and the originals stay pending. The stop becomes durable through the local
`finished` status or an explicit `stop`. A new uploader with a newly supplied authorization would
be refused again by the server. The backend's socket, PostgreSQL and process-restart run is its own
evidence, not native capture.

One uploader per session is intended. A second uploader of the same session can never erase a
stop or send after it: every save and every pass first adopts a stop already saved in the file.
Other fields are last-writer-wins. At worst, an attempt count is lost, and a later pass sends the
same request again.

A stop keeps the queue. capture_ingress 0.2.4 refuses shared-display original PUTs after a stop,
including exact replays, so a stopped queue is never drained or relabelled live. Stopped originals
remain local, pending evidence.

## Checks

The exact command for the existing hosted `macos-26` job:

```sh
xcrun swiftc -target arm64-apple-macos14 \
  apps/ios/ScreenObserver/Shared/CaptureStore.swift \
  apps/ios/ScreenObserver/BroadcastUpload/FrameStore.swift \
  apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift \
  apps/ios/checks/CaptureIngressCheck/main.swift \
  -o "$RUNNER_TEMP/capture-ingress-check"
"$RUNNER_TEMP/capture-ingress-check" "$RUNNER_TEMP/capture-ingress-fixtures"
python3 -m venv "$RUNNER_TEMP/contracts-venv"
"$RUNNER_TEMP/contracts-venv/bin/pip" install 'jsonschema[format]==4.26.0'
"$RUNNER_TEMP/contracts-venv/bin/python" apps/ios/checks/CaptureIngressCheck/validate_fixtures.py \
  "$RUNNER_TEMP/capture-ingress-fixtures"
```

The existing app compile, `xcodebuild … -target ScreenObserver -sdk iphoneos|iphonesimulator
CODE_SIGNING_ALLOWED=NO build`, now also compiles `OriginalUpload.swift`.

**Swift check.** [`main.swift`](../../../apps/ios/checks/CaptureIngressCheck/main.swift) uses:
- real PNG originals written by ScreenObserver's own `FrameStore` in temporary session directories;
- an in-process actor that plays the server.

It covers:
- the exact binding, route, headers and body. The body is compared with an independent
  `JSONSerialization` encoding and the recorded request hash.
- a lost response, then a relaunch: a new uploader sends the byte-identical request with a new
  token.
- 24 receipt variants, 2 accepted and 22 refused;
- a foreign receipt and a partial receipt through the uploader;
- originals lost or changed after enqueue;
- 12 enqueue refusals that leave the originals and the state byte-identical;
- the exact 32 MiB boundary;
- a finished broadcast;
- paused, stale and unreadable status;
- `capture_stopped`, and `forbidden`, each followed by a relaunch or a new authorization;
- an explicit stop with a late receipt;
- a stop saved by a second uploader of the same session while the first has a request in flight;
- a response from another URL, and a stop on a disabled uploader, which reports stopped;
- cancellation before sending, cancellation in flight, and a concurrent pass;
- an unreadable state file;
- authorization validation, and descriptions that do not show the token;
- a final scan that no token appears in any state, capture or fixture file.

**Python check.** [`validate_fixtures.py`](../../../apps/ios/checks/CaptureIngressCheck/validate_fixtures.py)
reads the fixtures the Swift check writes and uses the released Python contract code:
- Each request body passes `capture_ingress.decode_request` (the strict raw reader) and
  `validate_upload`, decodes to exactly the original PNG, and equals `canonical_request`, within
  the raw limit. This includes the 32 MiB maximum.
- The lost-response retry is byte-identical.
- For each receipt, `original_artifact.validate_receipt` reaches the same verdict as Swift.
- The error bodies are valid `IngressError`s for their statuses.

## Evidence levels

| Level | State |
| --- | --- |
| Source written | Yes: uploader, Swift check, Python validator. The Swift is **uncompiled**, because there is no Mac here. |
| Independent code reading | Before commit, a review agent read the Swift for compile and behaviour defects. It found no compile error, and its trace of the checks found every one would pass. It reported five behaviour issues, all fixed with checks added:<br>• B1: a second uploader could erase a stop and then send.<br>• B2: a stopped and disabled uploader reported `halted`.<br>• B3: cancellation was not rechecked after encoding.<br>• B4: a request-build failure refused the original.<br>• B5: a followed redirect was accepted.<br>Reading is not compiling. |
| Python validator | Executed on Linux against fixtures that a Python simulation of the Swift encoder generated, not Swift output: all checks passed. Negative controls failed as expected: a non-canonical body, a mismatched verdict and a changed retry. |
| Swift check and fixtures on macOS | **Not run.** Waiting for the lead's hosted job. |
| App compile with this file | **Not run.** Waiting for the same hosted job. |
| Real network, TLS, server or backend receipt | None. Only the injected in-process transport was used. |
| Simulator or device | None. Nothing in the app invokes the uploader. |

## Named dependencies for the next slice

These remain for the next slice:
- the production start grant and bootstrap: who supplies the registered source and authorization,
  and when;
- display-source registration by a trusted adapter;
- per-frame capture-clock mapping and the orientation representation;
- the `FrameBatchRequest` frame/process envelope, which is the next dependent segment and is not
  built here;
- the HTTP runtime: an ephemeral session, background behaviour and memory use for 32 MiB originals
  on the device;
- review of an activation UI;
- signing and install.

There is no provider or paid activation, no user preview or Paperclip operation, and no claim of a
universal overlay.
