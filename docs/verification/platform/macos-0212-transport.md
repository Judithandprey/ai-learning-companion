# macOS retained originals → released Backend 0.2.12 HTTP path (native transport)

Task: the lead's continuation `handoff_bd40c1175a77a0d24244711d89c296ca` (P0-03/07/11 → desktop
P1-02), started as `handoff_fbe03247d9a519c02476c193036e3522`. Baseline: exact published `d49d101`,
normally merged into `team/ios` as `64e2302`, with no conflicts; `apps/macos` is identical to
`d49d101`.

Read at that baseline:
- the source and English text of §3.9, §7.1 and §7.2;
- R02, R03, R08, R35, R36, R46, R51, R52 and R59;
- A12, A14, A16, A26, A30, A31 and A44;
- the current decisions and `docs/workflow.md`;
- the released contracts `macos_frame` 0.2.11, `macos_capture_ingress` 0.2.12, `original_artifact`
  0.2.2, `capture_ingress` 0.2.4, `process_control` 0.2.1, `process_v2` and `display_source`;
- `services/api` (`ingress_app.py`, `capture.py`, `original_artifacts.py`, `desktop_local.py`,
  `capture_runtime.py` and the macOS tests), and the API README's foreground host;
- as behavioural reference only, the Windows uploader, the iOS senders and every lead/QA review of
  them.

The requirement files match the English manifest.

**Scope.** Writes only `apps/macos/CompanionDesktop/**`, this record, and its index entry in
`docs/verification/platform/README.md`. This is a callable seam. It
adds no account enrollment, DSN configuration, host supervisor, stream or source registration, Start
or Stop control call, automatic or restart upload wiring, dependency, contract change, provider call,
or mobile work. The app does not call it yet; the next app-parent segment is the lead's.

## What it does

| Part | Behaviour |
| --- | --- |
| `MacIngressBatch.prepare(plan, session)` | Builds one exact `MacOSFrameBatchRequest` 0.2.12 from a retained session and identities the trusted caller supplies: batch ID and `Idempotency-Key`, `live`/`historical` as stated, capture incarnation, registered display source, native session and display, and each entry's record ID and Process sequence. It never invents a sequence or UTC from callback ordinals. |
| Descriptors | The Mac retained-frame mapper's 0.2.11 descriptors, unchanged. Every raw, composed and ink original is re-read under the retained-file policy while mapping. Any refused entry refuses the whole batch, and each refusal's reason is named. |
| Records | One framed record per kept frame, with the scope `provisional_session`. `observed_at`, `clock` and `media_position` are null. The rest of the record is `surface: external_app`, `method: visual`, no causal parents, and coverage `observed_samples` with `sample_only`/`unsupported_history`. Its `artifacts` are, in order:<br>- the raw PNG reference;<br>- the composed PNG reference when it has its own artifact ID;<br>- the frame's **immutable editable-ink original** (`ink-originals/<SHA-256>.json`, `application/json`) when the caller binds it and the native outcome retains it.<br>The mutable `ink/ink.json` is never referenced. A frame whose ink is unavailable, not recorded or without a document has no ink reference. Native gaps become frameless coverage records (reusing the 0.2.8 gap rules) and their native facts stay reported as unrepresented. |
| Bytes | Encoded once with `DesktopJSON`: sorted keys, no escaped slashes, safe integers. The batch must be at most 4 MiB, or it is refused with advice to split it at record boundaries. `PreparedMacBatch` keeps the bytes, the key, the records with their exact references, the distinct originals (binding plus retained file) and the unrepresented facts. Re-preparing from the unchanged session and plan gives identical bytes (tested). |
| `MacIngressUpload.upload(prepared, authority, transport, options, shouldStop)` | Validates everything locally, then reads every original under the retained-file policy before anything is sent. It then PUTs each distinct original, one by one, re-reading it just before. Only then does it POST the batch with its exact bytes and key. It never throws; see the results below. |
| Original PUT | `PUT /v2/process/originals/{id}` (`:` percent-encoded) with `OriginalArtifactUpload` 0.2.2: canonical padded base64 of exactly the retained bytes; kind `screen_image`/`image/png` or `editable_ink`/`application/json`. It is believed only with a closed `OriginalArtifactReceipt` echoing exactly the binding sent, with `bytes_committed`. The error family is `IngressError` 0.2.4. |
| Batch POST | `POST /v2/process/macos-frames:batch` with the prepared bytes and exactly one `Idempotency-Key`. It is believed only with a closed `ProcessBatchAck` 0.2.0 where:<br>- batch, owner, device, session and stream are equal;<br>- every record appears exactly once with its sequence;<br>- `envelope: committed`, `accepted` or `duplicate`, and a strict calendar UtcTimestamp;<br>- exactly the record's artifacts, each `verified`.<br>The error family is `MacOSIngressError` 0.2.12. |
| Believed replies | Every believed body is one JSON object starting with `{` with no NUL byte, which refuses UTF-16 and UTF-32. |
| Believed errors | A closed `{contract_version, error, retryable}` in the route's own version, at most 4096 bytes, with a code released for its status and `retryable == (code ∈ {unavailable, dependency_missing})`. `unavailable` is never believed as a refusal. |
| Doubt | These leave the send in doubt, and it may have committed:<br>- no answer or a timeout;<br>- a redirect;<br>- 503;<br>- a reply from another URL;<br>- an oversized reply;<br>- a malformed or non-corresponding 200;<br>- any other reply.<br>The same request (same bytes, headers and key) is resent up to `attempts` times. These are engineering defaults: 3 attempts, clamped 1…10, and a linear pause of 0.5 s, clamped 0…60 s. Both are clamped when the options are made and are immutable afterwards. A later refusal, expiry, Stop or cancellation then yields `unknown`/`cancelled` with the send still in doubt, never `refused`. `dependency_missing` is `unknown` and is not resent in the call. |
| Results | - `committed(ack, originals)`: says nothing about AI receipt, presentation or archive import.<br>- `refused(stage, reason, status, code, originals)`: known not taken.<br>- `unknown(stage, reason, status, code, inDoubt, originals)`: resend the same prepared batch with current authority; never re-map it. `code` is a released code only when a typed reply was believed (for example `unavailable` or `dependency_missing`).<br>- `cancelled(stage, stopped \| taskCancelled, inDoubt, originals)`.<br>Stages are `local`, `original` and `batch`. `originals` lists only IDs with an exact receipt in this call. Reasons are fixed words plus host-supplied artifact IDs, HTTP statuses and released codes: never the token or network text (URL errors only as `URLError <code>`). |
| Stop, cancel, expiry | The caller's `shouldStop` and task cancellation are checked before every send, including retries and before the first. After Stop nothing new is sent. A request already on its way is let finish, and a believed answer is recorded. Cancellation abandons it and leaves it in doubt. Expiry is checked before every send. Nothing retained is changed or deleted on any outcome. |
| `MacIngressAuthority` | Exactly `http://127.0.0.1:<port>` (an explicit port, not 80): the host binds numeric IPv4 loopback only. A bearer of 32–4096 `[A-Za-z0-9._~+/-]+=*`. Owner and incarnation must equal the prepared batch's. It is a value snapshot; `description`, `debugDescription` and `Mirror` hide the token. |
| `LoopbackHTTPTransport` | An ephemeral `URLSession` with:<br>- no cookies, cache, credential storage or proxy;<br>- a delegate that refuses every redirect, so a 3xx is delivered as the answer and never followed;<br>- request timeout 60 s and resource timeout 300 s (engineering defaults);<br>- bounded reads: a 200 receipt to 64 KiB, a 200 ACK to 4 MiB, and any other reply to 4097 bytes. A typed error is believed only within 4096 bytes.<br>`Authorization`, `Content-Type: application/json; charset=utf-8`, `Accept: application/json` and, on the POST only, `Idempotency-Key` are set with `setValue`. No `Origin` or `Sec-Fetch-*` header is set. `MacIngressTransport` is the injectable seam. |
| Retained-file policy (shared; hardened) | The session directory is opened once. The folder (`frames`, `composed`, `ink-originals`) is opened with `openat`, `O_DIRECTORY` and `O_NOFOLLOW`. The file is opened relative to that with `O_NOFOLLOW`, `O_NONBLOCK` and `O_CLOEXEC`, so the checked file is the read file: a FIFO or device is refused without blocking. The descriptor must be a regular file of the recorded length, at most length + 1 bytes are read, and the SHA-256 must match. The mapper and recorder use the same reader. Messages:<br>- unchanged: missing or symbolic-link files and folders, including a missing session directory;<br>- changed: a directory, FIFO or device at the path now reads "<name> is not a regular file", and a read error reads "cannot be read" without system text;<br>- new: another open failure (permission or a descriptor limit) now reads "<name> cannot be opened (errno N)", "<folder> cannot be opened (errno N)" or "the session directory cannot be opened (errno N)"; a name that is not directly inside its folder (never produced by the recorder) reads "<name> is not a file directly inside <folder>/";<br>- removed: "resolves outside the session" and "cannot be opened without following a link";<br>- no existing assertion depends on a changed text. |

## Checks

```sh
COMPANION_DESKTOP_MAC_UPLOAD_FIXTURE_DIR=<new directory> swift test --package-path apps/macos/CompanionDesktop   # 55 tests
python3 apps/macos/CompanionDesktop/checks/validate_mac_upload.py <that directory>
```

**New `Tests/DesktopCaptureTests/MacIngressUploadTests.swift`** has 8 XCTests on the existing
synthetic 8-frame Mac session:
1. **Prepare.**
   - The exact envelope: sequences 101…108 from the plan, frame IDs, nulls, `external_app`/`visual`/`provisional_session`.
   - Per-record artifacts, including the ink references: frames 2, 3 and 6 have one; frame 4 (not recorded) and frame 5 (unavailable) have none.
   - The descriptors equal the mapper's. There are 14 distinct originals, the ink only from `ink-originals/`.
   - Deterministic bytes, and the ink-originals unrepresented line.
   - Refusals: a bad key, a bad mode, a duplicate sequence, and an ink binding on the not-recorded frame.
   - A frameless gap record, and a gap the session does not hold.
   - A gap-only batch still reports the session's unrepresented facts. The `:` path encoding is also checked.
2. **Upload through the stand-in host.**
   - 14 PUTs in order, then one POST, with exact paths and headers (no `Idempotency-Key` or `Origin` on the PUTs).
   - Each upload decodes to exactly the retained file. The ink upload is never `ink/ink.json`.
   - The POST body is byte-identical to the prepared bytes, with the key, and the result is committed.
   - With the fixture variable set, it writes the session, the request, every exchanged byte and a 40,320-string UtcTimestamp corpus with Swift verdicts.
3. **Doubt.**
   - A wrong receipt, then the exact one: committed, with the same bytes resent.
   - A lost batch answer, then an ACK: committed, with the same bytes and key.
   - Six non-corresponding ACKs, each `unknown` after 3 identical sends: a missing record, an impossible date, a pending artifact, another owner, an extra member, a record twice.
   - Seven unbelieved replies: a redirect, an oversized reply, 503, the wrong version, a wrong `retryable`, a code not released for its status, non-JSON. Each once commits on the resend, and always yields `unknown`.
   - An exact receipt from another URL, and an exact receipt in UTF-16: both `unknown`.
   - Doubt then 403: `unknown`.
4. **Typed refusals.**
   - Forbidden on the first PUT stops there.
   - 401 after two receipts.
   - 409 `idempotency_conflict`, `capture_stopped`, `record_conflict` and `stale_scope` on the batch.
   - `dependency_missing` is not resent.
   - The same code in the other route's version is not believed.
5. **Stop, cancel, expiry.**
   - Stop before sending and Stop after two receipts: nothing more is sent.
   - Stop while a send is in doubt.
   - Task cancellation while the third upload waits: in doubt, and nothing after it.
   - Expiry after three receipts, and expiry while in doubt.
6. **Local refusals.**
   - 15 refused origins, bad tokens, and a hidden token.
   - An expired bearer, another owner, another incarnation, and a changed, missing, symlinked or
     FIFO original: nothing is sent.
   - A file changed between the check and its upload: the earlier original is committed, and the
     changed file is never sent under its ID. The result is `refused` at the original stage.
7. **URLSession transport** through a `URLProtocol` stand-in.
   - The Authorization, Content-Type and Idempotency-Key headers reach the loading system, with no `Origin` or `Cookie`, and the exact batch body.
   - A 3xx from the stand-in is classified as an unbelieved answer, and no second request reaches
     it. The stand-in does not signal a URLSession redirect, so this shows classification, not
     refusal.
   - An oversized reply is not read past its limit.
   - The transport's session delegate is `RedirectRefusal`, and calling its redirect method returns
     nil.
   - This is the loading system, not a socket. Whether URLSession consults the delegate for a real
     redirect on a socket is unverified here.
8. **UtcTimestamp.** Explicit valid and invalid cases.

**Owner checker `checks/validate_mac_upload.py`** (new) checks the fixture:
- `request.json` is strictly decoded and passes `validate_frame_batch` within 4 MiB.
- The key is a released `IdempotencyKey`.
- The records equal the plan's identities, with nulls and the pixel-producer vocabulary.
- Every descriptor passes the retained-frame checker's `native_problems`.
- For this synthetic plan, no framed record's Process sequence is its frame's callback ordinal.
- Each record's artifacts are raw, then its own composed image, then exactly its retained ink original (the immutable file, not `ink.json`).
- The exchanges are one PUT per distinct artifact in record order, then one POST. Paths are exact, and the headers are exactly Authorization (a marker), Content-Type and Accept, plus the key on the POST.
- Each upload passes the released `decode_request` and `validate_upload`, and decodes to exactly the retained file under its record's reference and source.
- The POST is byte-identical to `request.json`, with the key.
- Believed receipts pass `validate_receipt`. The believed ACK passes `validate_ack`, verified only against the committed originals.
- Swift's UtcTimestamp verdicts equal the released validator's on every corpus string.
- 16 negative controls must be refused, and a non-vacuity check applies. The controls include:
  callback ordinals used as sequences even when the manifest echoes them; a POST without the
  bearer; an extra header. The manifest's identities and key come from the plan input, not from the
  builder's output.

## Results

| Level | State |
| --- | --- |
| Source | `MacIngressBatch.swift` and `MacIngressUpload.swift` are new. `DesktopIngress.swift` has the reader hardening, and `recordJSON`/`describe` are made internal. `MacRetainedFramesTests.swift` has four helpers made internal. **Uncompiled**: there is no Mac or Swift toolchain here. |
| Swift tests, Swift-emitted fixture, URLSession on a Mac | **NOT_RUN.** 55 declared XCTests (a seventh test file), the new fixture and checker. |
| Composition with the real handlers (a Python simulation of the Swift rules, not Swift) | **Passed.** See below. |
| Checker on the simulated fixture | **All 22 checks passed**, including 16 controls. **12 tampered variants** each failed. |
| Real host process, socket, Mac, permissions, real Start/Stop, provider, Notability | **None.** |

The composition probe is `/tmp/lc-0212-sim/compose_upload_sim.py`, adapted from the lead's
`composition.py`.
- **Inputs.** The lead's newest actual Swift-emitted retained session, from hosted run 36764195464.
  The request and upload bytes were built by a Python port of the Swift builder and uploader rules:
  identities 100 + callback, artifacts raw/own-composed/retained-ink, sorted compact JSON.
- **Server.** The real in-process ASGI handlers of `create_local_capture_runtime`, with synthetic
  `desktop_pixels` consent and authority on a MemoryStore.
- **Uploads.** All 14 original PUTs, including 2 editable-ink JSON originals, returned 200 with
  receipts that pass both the ported Swift check and `validate_receipt`.
- **Batch.** The POST returned 200 with an ACK that passes the ported Swift check. All 8 records
  were `accepted`.
- **Replay and conflict.** An exact replay returned the original ACK. A changed body under the
  same key returned 409 `idempotency_conflict`.
- **After Stop.** An exact re-PUT returned 403 `forbidden` in 0.2.4, and the batch replay returned
  409 `capture_stopped` in 0.2.12. The ported Swift rules classify all three as believed typed
  errors.
- **UtcTimestamp.** The Python port of the Swift rule agreed with the released validator on all
  40,320 corpus strings.

This proves the wire shape and the classification rules against the real handlers. It does not
prove the Swift encoding.

## Review

**First review.** `wf_0807fb67-d36` used 8 agents: compile, behaviour/safety, test trace and
checker/evidence, each with an adversarial verifier. It confirmed or judged plausible these items,
all now fixed:
- the retry/pause options could be changed after init and then trap: they are now immutable;
- UTF-16/32 replies passed the `{` gate: NUL bytes are now refused;
- an unbelieved 503 was labelled `unavailable`: the code is now only a believed one;
- gap-only batches dropped the session's unrepresented facts;
- open failures were misreported as "missing or a symbolic link": errno-specific messages;
- the checker's identity check was circular: identities now come from the plan, and callback
  ordinals are detected independently;
- the checker did not pin the headers or check the POST bearer;
- the redirect test proved only classification: the session delegate is now asserted, and the doc
  is reworded;
- the other-URL branch was untested;
- doc claims (Accept header, read bound, messages, scope, test 6).

The claim that `:` path encoding was untested was refuted as a defect; a unit assertion was added
anyway.

**Recheck.** `wf_15c293ab-aa0` used 3 agents and confirmed one item: a missing session directory
had a new message. The old message is now kept, and the list is complete.

**Linux harness evidence** (the reviewers', not a Mac):
- **Type-check.** The swift.org Swift 6.3.3 toolchain (the hosted runner's version) with Darwin,
  CryptoKit, ImageIO and ScreenCaptureKit stub modules type-checked the DesktopCapture module and
  the whole test target: 0 errors. The only warning is one Swift-6-mode Sendable warning, and no
  expression was slow.
- **Run.** Under the interpreter with functional stubs (real SHA-256; PNG containers, not
  decodable images; no rasterization), all 8 new tests pass. Of 55 tests, 52 pass; the 3 failures
  are stub artefacts in unchanged tests (FrameStore path, a JSON round trip, ink pixels).
- **Mutations.** Removing the NUL guard or the gap-only branch makes the tests fail.
- **Checkers.** Both owner checkers pass on the Linux-emitted fixtures: 22 checks, and 51 refusals.
- **Limits.** This is **not** a macOS compile or run. URLSession's real AsyncBytes, redirects and
  ATS were not exercised.

## Limits and honest boundaries

- **Stop.** After Stop, the local host refuses every original PUT, even an exact retry (403), and
  every batch replay (409 `capture_stopped`), even when the batch was committed. A batch in doubt at
  Stop stays `unknown`. It is kept locally, and settling it needs a separately authorized historical
  path (seal plus a new key) that this host cannot provide. In-doubt originals can be settled by the
  existing original GET, which is not called here.
- **Transport assumptions (unverified).** Setting `Authorization` on a `URLRequest` is documented by
  Apple as reserved. The URLProtocol test observes the header in the loading system, not on a
  socket. Whether ATS permits plain `http://127.0.0.1` in the packaged app is unverified; no
  Info.plist change is made here. CFNetwork may itself retransmit, which is harmless because PUT
  replay and keyed POST are idempotent. Attempt counts are therefore lower bounds.
- **JSONSerialization.** It collapses duplicate members. The uploader requires a `{` start, no NUL
  byte and closed key sets, but a duplicate-member reply is not detected.
- **File access.** The file-read hardening assumes the session directory itself is app-owned. A
  concurrent writer replacing the session directory path between calls is not defended against.
- **Scope of success.** `committed` is the service's commit only. It is not AI receipt, a live-vision
  claim, a §7.1 gate or R59/A44, and there is no Notability or archive import.

## Pinned CI counts and wiring (lead-owned, not edited here)

- 55 tests and seven test files.
- Two new library files: `MacIngressBatch.swift` and `MacIngressUpload.swift`.
- The new fixture variable `COMPANION_DESKTOP_MAC_UPLOAD_FIXTURE_DIR` and the checker step
  `validate_mac_upload.py`, which imports the retained-frame checker's helpers.
- No existing fixture changes: the retained-frame fixture keeps its 51 refusals and its content.
- FrameStore.swift is still byte-identical to the iOS copy.

## Integration call boundary (for the app-parent segment)

1. The trusted parent obtains the host's `origin`, `token` and `expires_at`, and registers the stream
   and display source (0.2.1/0.2.4). It supplies owner, incarnation, record identities, bindings,
   batch ID and key.
2. `let prepared = try MacIngressBatch.prepare(plan, session: RetainedSession.read(dir))`. Keep
   `prepared` (body and key) for every resend.
3. `let result = await MacIngressUpload.upload(prepared, authority: MacIngressAuthority(...),
   transport: LoopbackHTTPTransport(), shouldStop: { !gate.isLive })`.
4. The parent keeps `unknown` or `cancelled`-in-doubt across calls and resends the **same**
   `prepared`. It never re-maps under new IDs, and never resends after Stop through this host.

## Next owners

- **Lead:** source review; the hosted build, tests and checker on the new fixture; pinned counts;
  composition of the actual Swift bytes with the real API; then the macOS parent wiring.
- **Native:** actual compile or test failures first.
- **QA:** an actual Mac only when access exists.
