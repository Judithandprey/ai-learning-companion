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
| `IngressAuthorization(origin:bearerToken:)` | Supplied explicitly for each pass. It must be a bare, lowercase `https` origin (no path, query, fragment or user), so a response can be matched to it exactly, and an RFC 6750 bearer token. It is held in memory only. Its `description`, `debugDescription` and mirror omit the token. |
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
  `committed` or `refused`), attempts, the last attempt time, the last outcome and the receipt. The
  receipt is stored in canonical form, rebuilt from the binding once a received receipt matches;
  the received bytes are never stored, because a duplicate member or whitespace could carry any
  text.

It holds no token and no second copy of the bytes. Transport errors are recorded only as a fixed
category and number, such as `URL error -1005` or `other error`, never an error domain or
description.
- **Locking:** every change, and every read an operation acts on, goes through an exclusive
  `flock` on `Capture/<session>/original-uploads.lock`, applied to the current file. No copy is kept
  in memory. The lock is held only for that short read or write, never across a request.
  - The one unlocked read is the validity check when an uploader is opened.
  - Files are replaced only by atomic rename, so that check sees a whole file.
- **Before sending:** the attempt is saved first; if that save fails, nothing is sent.
- **On retry, after a lost response, a cancellation or a relaunch:** the request is rebuilt from the
  original. It is sent only if its length and SHA-256 equal the recorded request.
- **Unreadable or vanished state:** this covers a file that is unreadable at open or later, and one
  that has disappeared after it was created.
  - "Created" is recorded durably: the lock file itself is the witness.
    - It stays empty until the state is first created.
    - Just before that first write, the lock file receives a fixed mark. If recording the mark or
      the write fails with an error, the mark is removed, so a new session stays new.
    - If the app is interrupted between the mark and the first completed save (killed, crash,
      power loss), the mark remains without a state. The session is then refused as uncertain,
      with no automatic recovery, and never treated as new.
  - An existing state saved before the witness existed, readable or not, is marked the next time an
    operation of an already open uploader reads it under the lock. A new uploader refuses an
    unreadable state when it is opened, before it can mark it.
  - So every uploader treats a missing state as lost history, never as a new session. This
    includes one opened before the state existed and one opened after the loss, as after a
    relaunch.
  - The session looks new again only in these cases:
    - the lock file is lost as well;
    - a state saved before the witness existed is lost before any operation reads it under the
      lock;
    - such a state is unreadable whenever an uploader is opened.

    Pre-witness states come only from the unreleased `7de89a6`/`cb27688` source; nothing was
    deployed.

  Such a state is never written or recreated. Every operation fails instead:
  - a pass sends nothing and ends `halted`, or `stopped` once `stop` has been called on this
    uploader;
  - enqueue throws;
  - `stop` returns false, while still forbidding this uploader's sends.
- **Stop result:** `stop` returns true only once the stop is saved, or was already saved. When the
  save fails it returns false, and calling it again retries. This uploader still sends nothing.

| Condition or response | Result |
| --- | --- |
| HTTP 200 whose body is exactly the expected receipt (member order and whitespace may differ) | `committed` |
| HTTP 200 with any other body: malformed, partial, extra members, wrong types, or a foreign version, source, artifact, kind or status | Still `pending`. This uploader sends nothing more. |
| No response, a transport error or cancellation | Still `pending`, outcome unknown. The pass ends. |
| 401, 403, 404, 409 `stale_scope` / `unsupported_source` | Still `pending`. This uploader sends nothing more; a new, explicitly supplied authorization is needed. |
| 409 `capture_stopped` | The session stops for good. Pending originals stay pending and are never sent. |
| 409 `record_conflict`, 413 `payload_too_large` | `refused`. The local file is kept. A 413 without that `IngressError`, for example from a proxy, stays `pending` like other statuses. |
| 503, 409 `dependency_missing`, other statuses | Still `pending`. The pass ends; only a later explicit pass retries. |
| Original missing, changed or over 32 MiB before sending | `refused`, not sent. The file is left as it is. |
| `status.json` reports `finished` | The session stops for good, as for `capture_stopped`. |
| Status `paused`, older than 10 s, or unreadable | Not live, so nothing is sent. The session is not stopped. A stop already saved is still reported as stopped. |
| The state could not be read or saved while recording a refusal or receipt | The pass ends. It never reports `finished`. |
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

**Several uploaders on one session**, in this process or another, change the state only through
the lock and always on the current file. Therefore:
- none can erase another's originals, receipts or stop;
- none can bind the session to a second source;
- a committed or refused original is final, so a stale uploader's later "no response" never
  overwrites a receipt.

The attempt record, made under the lock, orders each send against a stop:
- a stop saved before the attempt record prevents the send;
- a stop saved after it lets the request already on its way finish, and records its late response
  without anything more being sent.

On iPadOS, holding a file lock in a shared container while suspended can get the app terminated.
The lock is never held across an `await`; this remains a device check.

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
- 25 receipt variants, 2 accepted and 23 refused. One refused variant replaces "K" with U+212A
  KELVIN SIGN, which Swift's `==` would treat as equal; strings are compared byte for byte.
- a foreign receipt and a partial receipt through the uploader;
- originals lost or changed after enqueue;
- 12 enqueue refusals that leave the originals and the state byte-identical;
- the exact 32 MiB boundary;
- a finished broadcast;
- paused, stale and unreadable status;
- `capture_stopped`, and `forbidden`, each followed by a relaunch or a new authorization;
- an explicit stop with a late receipt;
- two uploaders opened on the same empty session:
  - neither can rebind the session or erase the other's original;
  - the stale one sends nothing again and keeps the receipts;
  - its lost response never overwrites a receipt the other saved;
- a stop saved by a second uploader of the same session, both before an attempt and while a request
  is in flight;
- a state corrupted under an open uploader: pass, enqueue and stop leave it byte-identical and
  nothing is sent;
- a state deleted under an open uploader: it is not recreated and nothing is sent;
- a stop that cannot be saved (read-only file and directory):
  - it returns false, also when repeated, and sends are still refused;
  - it returns true once saved, and the stop survives a relaunch;
- a refusal that cannot be saved: the pass is halted, not finished; nothing is sent and the state
  is unchanged;
- a receipt that cannot be saved: the original stays pending, and the next pass sends the same
  request and commits it;
- a cancelled pass on a session another uploader has stopped: it reports stopped;
- a transport error whose domain and description are the bearer token: only `other error` is
  recorded;
- a receipt whose duplicate member carries the token: only the canonical receipt is saved, and
  the token never reaches the state;
- an uploader that saw the state only while it was unreadable: after the file disappears, it
  neither recreates nor rebinds it;
- after only the state is lost (PNGs, status and lock remain): an uploader opened before the state
  existed, and a new one opened afterwards, both refuse. Neither gets an empty queue, rebinds the
  source, recreates the state or sends;
- controls:
  - a new session starts empty, is witnessed only when its state is first created, and reopens
    and sends normally;
  - a failed first save leaves neither state nor witness, and the session can then be
    initialized;
  - a state without a witness, readable or not, is witnessed when an open uploader reads it, so its
    later loss is refused. The removal of a mark whose own write fails is traced only: an fsync failure cannot be
    induced in the check.
- a 413 from a proxy stays pending; 413 `payload_too_large` refuses that original only;
- a response from another URL;
- a stop saved by another uploader while this one is disabled, and after a relaunch with stale
  status: both report stopped;
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
| Multi-lens review workflow of the correction (`wf_bc6667c9-5a4`) | Four independent reviewers (compile, state and concurrency, check trace, contract and token), with one adversarial verifier per finding: 16 findings, 10 confirmed, 6 rejected. All confirmed ones are fixed, each behaviour fix with a check (the locking wording was a doc fix):<br>• the received receipt bytes were stored, so a duplicate member could carry the token (three reviewers);<br>• a refusal whose save failed still ended in `finished`;<br>• a saved stop was reported `halted` when the uploader was disabled or the status was not live;<br>• the "seen" latch was set only after a successful decode;<br>• string comparison used canonical equivalence;<br>• the locking wording omitted the unlocked check at open;<br>• any 413 refused an original for good;<br>• a non-lowercase origin could never match its response URL.<br>Rejected findings, including races the server itself enforces and a URLSession redirect dependency already listed, are in the workflow journal. Reading is not compiling. |
| Final review of the witness fixes (`wf_6f834ead-439`) | One reviewer, with adversarial verification. It confirmed two findings, both fixed:<br>• s31 opened its reader after corrupting the state, so the check program would have aborted; the reader is now opened first;<br>• the doc overstated which pre-witness states get marked; the wording is narrowed.<br>No compile error was found. Reading is not compiling. |
| Lead source review of `cb27688` (NI1/NI2) | Traced from source, not run: an uploader that never saw the state treated a lost state as a new session, whether it was opened before the state existed or after the loss. It then got an empty queue, could rebind the source and could send under a live status. Fixed with the durable witness in the lock file, plus six checks: both variants and four controls.<br>A review workflow of the witness (`wf_978aa70a-db3`, compile, state and trace lenses, adversarial verification) found no compile error or failing check. It confirmed four low findings (two of them the same issue), all fixed:<br>• a failed mark write was not withdrawn;<br>• an unreadable pre-witness state was not marked;<br>• the doc did not state that an interrupted first save leaves the session refused as uncertain. |
| Third review round (`wf_5a791b50-faf`) | Compile and check-trace reviewers, with adversarial verification. Neither found a compile error or a failing check. The one confirmed finding, a doc sentence on the result of a pass over an unreadable state, is fixed. Reading is not compiling. |
| Second review round (`wf_cc142509-ad3`) | Three reviewers (compile, check trace, state and contract), each finding verified adversarially: 5 findings, 4 confirmed, all low, and all fixed:<br>• the refusal and receipt save-failure fixes had no check; checks added;<br>• cancellation and read or build exits reported `halted` although a stop was saved; they now report stopped.<br>No compile error was found. Reading is not compiling. |
| Lead source review of `7de89a6` (HOLD) | Four source-traced issues, all fixed in the follow-up commit with the checks above:<br>• an open uploader overwrote a state that had become unreadable, and could then send;<br>• stale whole-state copies in separate uploaders could erase items, receipts, the source binding or a stop;<br>• a failed stop save was reported as saved on the next call;<br>• an injected transport's error domain, which could be the token, was saved.<br>The lead's issues were traced from source, not reproduced by running Swift. |
| Independent code reading of `7de89a6` | Before commit, a review agent read the Swift for compile and behaviour defects. It found no compile error, and its trace of the checks found every one would pass. It reported five behaviour issues, all fixed with checks added:<br>• B1: a second uploader could erase a stop and then send.<br>• B2: a stopped and disabled uploader reported `halted`.<br>• B3: cancellation was not rechecked after encoding.<br>• B4: a request-build failure refused the original.<br>• B5: a followed redirect was accepted.<br>Reading is not compiling. |
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
