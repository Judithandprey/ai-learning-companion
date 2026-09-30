# Windows retained originals over the released 0.2.10 HTTP boundary (main-process uploader)

Lead assignment `handoff_0197da20c340b37fa6145b21ddff3653`, one bounded P0-07/P0-12 task. It was delivered as `6c4ac03`
and corrected after the lead's HOLD `handoff_7a3e561765e2ad69aeb3098c4d36ffca` (items A to E; see
[Correction after the HOLD](#correction-after-the-hold-on-6c4ac03)). The Backend, contracts and
lead reviews were read at `8e2094ee8cd2d99f58a5ed27159c724b07fb103b` with `git show`:
- `packages/contracts/windows_capture_ingress` (0.2.10) and `original_artifact` (0.2.2);
- `services/api/capture_runtime.py`, `capture_app.py` and `original_artifacts.py`;
- the Backend's Windows HTTP tests;
- `docs/verification/lead/windows-http-review`.

The written paths are `apps/windows/**` and `docs/verification/web/**`. There is no root, contract, Backend, service or
dependency change, no display run, no provider and no user preview.

## What is callable

`apps/windows/src/main/uploader.ts`, main process only:

```ts
uploadRetained(authority: UploadAuthority, job: UploadJob, options?: { signal?, attempts?, pause_ms?, now? }): Promise<UploadResult>
```

**The authority** is supplied by the trusted host. The uploader makes nothing up.
- `origin`: the runtime, as `http://127.0.0.1:<port>` or `http://[::1]:<port>` and nothing else. Other hosts,
  `localhost`, https, a missing port, credentials, a path or a query are refused before any request.
- `token` (the ephemeral bearer) and `expires_at`, a released UtcTimestamp.
- `owner` (`SourceRef`) and `incarnation` (device, session, stream).

**The job:**
- `capture_dir`, the retention record, as an absolute path;
- the `plan` with its OriginalArtifactBindings;
- `prepared`, the exact output of `frameRequest`.

**The result.** `originals` always lists the artifact IDs whose receipts were exact, so they are committed. `in_doubt`
names the artifact ID, or `batch`, of a send without a believable answer, which may have arrived.
- `committed`, with the ACK and the originals committed.
- `refused`, with the stage (`local`, `original` or `batch`), the reason, the HTTP status and the error. A request is
  known not taken by this call only when it got a typed refusal of the released contract and none of its earlier
  sends is in doubt. If an earlier call left the same job `unknown` or in doubt, that doubt still stands. For
  example, after Stop the Backend refuses the same job with 403, even though an earlier call's batch was committed.
  Keeping the doubt across calls is the host's (see the gaps).
- `unknown`: not known whether it arrived. Send the same job later, when that is permitted. If a refusal came after a
  send in doubt, its status and error are kept.
- `cancelled`, with `in_doubt` if a send was in doubt or in flight.

A result never contains the token, and no text from the network: only an HTTP status and, as `error`, a code released
by the contract. Every outcome is a result. Even an unexpected local error after a send ends with what was committed
listed, nothing more sent, and a send in doubt kept in doubt. The options are read once. The uploader persists nothing, and it is not wired to any window, renderer, page or
course content. Capture and saving stay local-only until the lead wires the trusted host.

## What it does

1. **Before anything is sent:**
   - Everything the caller supplied is copied once, with `structuredClone`: the origin, bearer, expiry, owner and
     incarnation, the capture folder, the plan with its bindings, the key, the body and the request. From then on only
     the copies are used, whatever the caller's objects do. Data that cannot be copied or read as a prepared job is
     refused locally;
   - the authority is checked (origin, bearer format, expiry);
   - the body must be the prepared request, for this owner (exactly three `SourceRef` members) and this incarnation;
   - the Idempotency-Key must be the plan's;
   - the body must be at most 4 MiB.
   - Every binding must be a retained original:
     - a PNG (`screen_image`, `image/png`) or editable ink (`editable_ink`, `application/json`);
     - a released Identifier as its artifact ID, a 64-hex SHA-256, and at most 32 MiB (the mapper's limit).

     It is retained at `frames/<sha256>.png` or `ink/<sha256>.json`.
   - Every artifact of every record must have its original, and every binding must be on its record and of this
     source.
   - **Every original is read the same way, before anything is sent and again just before its own send:**
     - the path must name a regular file (`lstat`, so no link, pipe or directory) whose real path is inside the
       capture folder as resolved at the start, with the binding's length;
     - the device and file ID must be known (non-zero, as Node's own `fs.cp` requires);
     - it is opened (with no-follow and non-blocking where the platform has them), and the file opened must be the
       file checked: the same device and file ID (`fstat` against `lstat`, as big integers), and the binding's length;
     - it is read through what was opened, so a file put at the path after the open is not what is read;
     - the bytes must have exactly the binding's length and SHA-256.

     A file that is missing, a link, not a regular file, outside the folder, without a file identity, cannot be
     opened or read, or was replaced after its check is refused.

     **Limit.** Node has no `openat`, and the lookups by path (`lstat`, `realpath`, `open`) are separate steps. A
     process that can rewrite the capture folder, and flips one of its folders between a link and a folder between
     two of those steps, is not excluded; the second review showed this. Even then only bytes with exactly the
     binding's length and SHA-256 can be sent.
   - Any failure is refused locally and nothing is sent.
2. **The originals**, one by one: `PUT /v2/process/originals/{artifact_id}` with OriginalArtifactUpload 0.2.2
   (canonical base64).
   - Each original is read and checked again just before it is sent, as above, so the bytes sent are the bytes
     checked.
   - The receipt must be exactly its original, with `bytes_committed`: the closed receipt, source and artifact
     objects, with no member missing, extra or null. The ID counted is the one the owned copy sent.
3. **The batch:** `POST /v2/process/windows-frames:batch` with the prepared body's exact bytes and its
   Idempotency-Key.
   - It is `committed` only when the ProcessBatchAck 0.2.0 matches. That is the contract's closed shape (no member
     missing or extra, and a `received_at` that is a released UtcTimestamp) and the Backend's own `validate_ack`
     correspondence:
     - the same batch, incarnation and owner;
     - every record exactly once, with its sequence, `committed`, and `accepted` or `duplicate`;
     - exactly its artifacts, each once, all `verified`.
4. **Only two kinds of answer are believed.**
   - A 200 whose receipt or ACK corresponds exactly, as above.
   - A typed refusal of the released contract. That is the closed error object `{contract_version, error,
     retryable}` in the route's version (0.2.4 on the originals route, 0.2.10 on the Windows batch). It must have a
     code released for its status (the capture-ingress `ERROR_CODES`, which the Windows route shares) and the
     `retryable` the Backend gives that code.

   Every other answer may have followed a commit, and the send is **in doubt**. That covers:
   - no answer (a dropped connection);
   - 503;
   - a 200 that does not correspond (the Backend may have committed before the answer was damaged);
   - a redirect, which is not followed (`redirect: 'manual'`);
   - a 5xx, and a reply that is not of the released contract.

   A send in doubt is sent again as the same bytes with the same key, a bounded number of times (3 by default; 1 to
   10), with a growing pause.
   - Still not known: `unknown`, with `in_doubt` (the same job can be sent later).
   - `409 dependency_missing` is also `unknown`.
   - **A send in doubt may have arrived.** The Backend answers a replay after Stop with 409 `capture_stopped` even if
     the batch was committed. So once a send of a request is in doubt, anything that ends that request afterwards is
     reported as `unknown` with `in_doubt`. That covers a refusal, the bearer's expiry, and cancellation (as
     `cancelled` with `in_doubt`). It is never reported as a clean `refused`, and it is still not resumed here.
5. **Refusals** (typed: 401, 403 including after Stop or withdrawal, 404, 409 `capture_stopped`, `record_conflict` or
   `idempotency_conflict`, 413, 415, 422, 400) end the upload. They are never retried or resumed here.
   - The bearer's expiry is checked again before every request.
   - No text from the network reaches a result. A failed request is described only by a short cause code (such as
     `ECONNRESET`), never by its message.
6. **Cancellation** (`AbortSignal`) stops at once, including during a retry pause. Originals already committed stay
   committed (listed; nothing is rolled back), nothing is sent after it, and nothing local is changed or removed.

## Tests (`apps/windows/tests/uploader.test.ts`)

**Always run** (a Node HTTP stand-in on 127.0.0.1 where a fault is needed). Every result in every test is checked
not to contain the token.
- **Order and exactness:** every original is sent first with its exact file bytes, then the exact prepared body with
  its key and bearer. The result is committed on a corresponding ACK, and nothing local changes.
- **Lost answers:**
  - a batch answer lost after receipt is sent again as the identical bytes and key, then committed;
  - a 503 on an original sends the same original again;
  - a batch never answered ends `unknown` after 3 identical sends, with the 7 committed originals listed;
  - `409 dependency_missing` is `unknown` and not retried.
  - the number of sends stays between 1 and 10: `Infinity` gives 3, 50 gives 10 and 0 gives 1.
- **Typed refusals:**
  - 401, 403 or 422 on an original ends the upload with no retry and no batch;
  - so do 409 `capture_stopped` and 404 on the batch;
  - the released code is kept as `error`.
- **Answers not believed** (A): each of the following, on the first original, is sent 3 times as the same bytes and
  ends `unknown` with that original in doubt, its status kept, nothing counted and no batch:
  - a 307, which is not followed;
  - a 200 that is not JSON, or not its receipt;
  - a 500;
  - a 403 without the contract version, with a code not released for 403, or in the batch route's version;
  - a 409 that claims to be retryable;
  - a typed 503.

  Then:
  - on the batch, a typed refusal in the originals route's version is sent 3 times and ends in doubt;
  - a first 200 garbled for the first original and for the batch is sent again and committed;
  - a garbled first ACK is resent with the same bytes and key, and committed.
- **ACK correspondence:** 21 deviations from the correct ACK are each not believed. They include:
  - another version, batch, device, session, stream or owner;
  - a record missing, twice or not sent;
  - a shifted sequence, a pending envelope, a rejected disposition, or a `received_at` that is not a time or is 30
    February (E);
  - one artifact listed twice in place of another, an artifact missing, with other bytes, or pending;
  - an extra member at any level.

  **The released UtcTimestamp** (E): 6 valid forms are accepted: fractions, a leap day, a lowercase `t`, and the
  last second of a year. 17 are refused, including:
  - 30 February, 29 February 2023 and 1900, 31 April, and year 0000;
  - month 13 or 0, and day 0;
  - hour 24, minute 60 and second 60;
  - an offset, a lowercase `z`, no seconds, a space, an empty fraction, and a number.

  Outside the suite, the rule was compared with the Backend's own. That rule is the `jsonschema` `date-time`
  checker in the repo's Python, plus the schema's pattern that the text ends in `Z`. Over 20,005 generated strings
  (841 valid) there were no disagreements, once year 0000 (not a date in Python) was refused.

  Over HTTP, an ACK with one artifact listed twice is sent 3 times and ends `unknown` with the batch in doubt.
- **Receipts:** a receipt that is pending, names another artifact, source or kind, has an extra member, has a null
  source or artifact, or is not an object is not believed. The first original is sent 3 times and ends in doubt;
  nothing is counted and no batch is sent.
- **Network text** (B): the bearer never appears in any result, not even as a 12-character piece, in any of these
  cases:
  - a 403 whose error is the bearer;
  - a 401 whose error quotes it;
  - a 200 that is not JSON and quotes it (the parser's message is not used);
  - a 500 that is the bearer;
  - a failure whose message and cause code carry it.
- **Caller's objects** (D): during the first send, the test changes the caller's objects:
  - every binding's artifact ID;
  - the capture folder;
  - the body and key;
  - the bearer and origin;
  - the owner's user.

  Exactly the planned originals are sent, each once, and the originals reported are the ones sent. The batch is the
  original body, and every request carries the original bearer and owner.
- **Swapped after the check** (C): the uploader's `node:fs` imports are rebound for a controlled interleaving (and
  restored). Every case asserts the outcome, not the reason text. Each of these is refused with nothing sent:
  - a link to an outside copy put in place of the file right after its check;
  - the same where opening follows links, as on Windows: the file opened is not the file checked;
  - its folder made a link to an outside copy right after the check;
  - its folder a link to an outside copy only while the file is opened and read: the fd is the outside file;
  - the file grown after its check;
  - a file system that gives no file identity (zero IDs from both `lstat` and `fstat`), with its folder made a link
    outside after the check.

  A file with other bytes renamed over the path once it is opened does not change what is read: the upload is
  committed, with every PUT's bytes matching its SHA-256.
- **A pipe put in place of the file after its check** is opened without blocking and refused. This runs in a child
  process with a 20-second limit, so an open that blocks fails the test instead of stopping the suite.
- **Options and errors:**
  - an `attempts` getter is read once;
  - the caller's clock failing before the third original gives `refused` with the two committed originals listed,
    no more sends and no batch; it is not an exception.
- **In doubt:**
  - a lost batch answer followed by 409 `capture_stopped` is `unknown` with the batch in doubt, the 409 kept and 2
    sends;
  - a lost PUT answer followed by 403 is `unknown` at that original, which is not counted;
  - a 503 followed by a typed 403 is `unknown` with the 403 kept (A);
  - a lost batch answer followed by the bearer's expiry is `unknown`;
  - a cancellation while the batch is in flight is `cancelled` with the batch in doubt;
  - an expiry with nothing unanswered before it is `refused` after 1 original.
- **Cancellation:**
  - during the second original: `cancelled`, with the one original committed, that original in doubt, no batch and
    nothing local changed, returned under 250 ms (the retry pause is 500 ms);
  - once the seventh receipt has come: `cancelled` at the batch, with 7 originals and no batch sent.
- **Changed after the check:** ink originals changed while the first original is being sent are refused at the next
  send. No PUT carries bytes other than its SHA-256, and no batch is sent.
- **Nothing sent** (the stand-in received no request) for:
  - 13 unsupported origins, most on the stand-in's own port, so that only the scheme or host refuses them: https,
    `localhost`, `example.com`, `10.0.0.1`, `127.0.0.2`, `0x7f.0.0.1`, `[::ffff:127.0.0.1]`, no port or port 80,
    credentials, a path, a query, and not a URL;
  - a malformed bearer (too short, or with a line break) or an expired one;
  - an expiry that is not a released UtcTimestamp: 30 February, no zone, a date only, an offset, and RFC 1123;
  - another incarnation or owner;
  - a body that is not the prepared request, over 4 MiB, or with another or malformed key;
  - a record artifact with no original, a binding that is not on its record or belongs to another source, and one
    artifact ID for two originals;
  - a binding of another kind, a kind of `__proto__`, a SHA-256 of `../../outside`, an artifact ID that is not an
    Identifier, or a length over 32 MiB;
  - a malformed plan, a relative capture folder, and a job that cannot be copied;
  - an ink original with other bytes, cut short, missing, unreadable, a link to a true copy, or a directory;
  - an `ink` folder that is a link outside the capture folder.

**Mutation check of the correction.** 25 mutants of `uploader.ts`, one per rule of the correction:
- A: a non-corresponding 200 or a redirect taken as a refusal, 503 not leaving a doubt, a refusal after a doubt
  reported as refused;
- B: any error string taken as a code, `retryable` not checked, any contract version, a failure's message or a code
  of any length in the reason;
- C: no identity comparison, zero IDs accepted, no non-blocking open, no no-follow open, no length check on the
  opened file, reading by path after opening;
- D: no copy and the caller's objects kept, a malformed job thrown, an error after sends thrown, bindings' identifier
  and size not checked, options read twice;
- E: `Date.parse` for timestamps, no day-in-month check, year 0 accepted, the expiry by `Date.parse`;
- the send bound not capped.

Of the 25, 23 fail the suite. Two of those (zero IDs, and reading by path) only failed once their two tests were made
exact. The non-blocking mutant fails in its child process within the time limit.

Two pass, both defence in depth that changes a reason but not an outcome:
- **No no-follow flag.** The identity check alone refuses the swapped link, which is exactly the case on platforms
  without that flag.
- **No length check on the opened file.** A file grown after its check is refused by its SHA-256 anyway. The check
  only avoids reading a file grown before it was opened.

**Earlier mutation check (6c4ac03).** 22 mutants of `uploader.ts` were made, one per check the review found untested. Each one removes or
weakens that check: ACK uniqueness, shape, sequence and time; the re-check before sending; cancellation before a
request; each in-doubt rule; https and `localhost`; the per-request expiry; `dependency_missing`; the receipt check;
the token in a reason; and the key, size, body and binding checks.

21 of the 22 fail the suite. The one that passes removes the cancellation check inside the error handler. It is
equivalent, because the pause returns at once when the upload is cancelled and the next check gives the same result.

**With the real Backend.** These run when `LC_BACKEND_ROOT` names a Backend extracted at `8e2094e` and `LC_PYTHON`
names the repo's Python with uvicorn. `tests/backend-host.py` is a foreground, test-owned host:
- It serves the Backend's own `create_local_capture_runtime` app (control and ingress, Windows route on, profile
  `desktop_pixels`) on 127.0.0.1 with a MemoryStore.
- It uses the synthetic identities of the `harness-ink` fixture, explicit synthetic consent and a stream and display
  source registered in process.
- The bearer is chosen by the test and passed by environment; it is never printed.
- This is test authority only: not real consent, a user, a database or AI.

The real-Backend tests:
1. The `harness-ink` job is committed, and every artifact is `verified`. The job has 7 originals (4 PNG and 3
   editable-ink) and 4 records, each referencing an ink original; records 2 and 3 share one. The same job sent again gets the same ACK, and nothing local changes.
2. **Lost answer.** Through a relay that drops the first batch answer after the Backend committed it, the uploader
   sends the same bytes and key again. The Backend's replay (all `accepted`) is committed.
3. **Changed bytes.** A PNG changed in a copy of the capture folder is refused locally, and the relay saw no request.
4. **Stop.** After a Stop through the control route, the same job is refused at its first original (403 `forbidden`)
   and not resumed.
5. **In doubt.** The Backend commits the batch, and the relay sends a Stop (200) and drops the answer. The uploader
   sends the same bytes and key again and gets 409 `capture_stopped`. The result is `unknown` with the batch in doubt
   and the 409 kept, not `refused`. There were 2 batch sends and it is not resumed.
6. **A changed 200** (A), the lead's case. A relay changes the Backend's 200 after the Backend committed:
   - Every first answer changed: every original and the batch are sent again as the same bytes and committed (14 PUTs
     and 2 batch POSTs). The ACK believed is exactly the replay of what the first send committed.
   - On a fresh Backend, every batch answer changed: `unknown` with the batch in doubt after 3 sends, never
     `refused`. The same job sent later is answered with exactly the first send's ACK (the same `received_at`), so
     the Backend had committed it.

   Each part stops its host and waits for it to end.

**Run** (Node 24 and the repo's Python):

```sh
git archive 8e2094ee8cd2d99f58a5ed27159c724b07fb103b services packages | tar -x -C /tmp/lc-be8
cd apps/windows
LC_BACKEND_ROOT=/tmp/lc-be8 LC_PYTHON=<repo>/.venv/bin/python LC_UPLOAD_EVIDENCE_DIR=../../docs/verification/web/evidence/windows-upload \
  node --test tests/uploader.test.ts
```

**Result:**
- 19/19 passed, including the four real-Backend tests.
- The evidence is in `evidence/windows-upload/`, without the token or any local path:
  - `committed.json`: the body SHA-256, the key, the result with the ACK, and the capture digest;
  - `recovery.json`: the relay's requests (7 PUTs, then 2 batch POSTs), the committed replay, the refused changed
    bytes (0 requests), and the 403 after Stop;
  - `in-doubt.json`: the relay's requests, the Stop's 200, and the `unknown` result with the batch in doubt;
  - `first-200.json`: both changed-200 parts and the same job later.
- Every test waits for its host to end, and no host process was left. The tests remove their capture copies.
- Without the Backend environment the four real-Backend tests are skipped. The full Windows suite has 125 tests: 121
  pass and 4 are skipped. `tsc` is clean.
- **The lead's own probes** were run unchanged against a copy of the correction, with their output paths moved so
  that the lead's files are untouched:
  - `windows-upload-6c4-probe.test.mjs`: the 3 controls pass, and the 5 reproductions (reflected bearer, first-200
    ACK, first-200 receipt, 503 history, 30 February) no longer reproduce;
  - `windows-upload-6c4-files-review-probes.mjs`: the valid job, both static links and the changed-bytes control pass
    as before, and both binding mutations no longer change what is sent.
    - Its two race probes swap the file on the 8th `realpath` of the capture folder. The corrected code resolves the
      folder once, so their swap never happens. They end `committed` with nothing outside read.
    - That is no evidence either way. The same interleavings (a link to an outside copy at the file or its folder,
      right after the check or around the open) are this suite's race cases.

## Gaps and next owner (lead: host composition)

The uploader is callable and tested, but no host calls it yet. The lead's host wiring must supply the authority in the
main process from real Start and consent, and must not grant a renderer any network or configuration API. The host
must provide:
- the runtime origin;
- the bearer and its delivery, rotation and revocation;
- owner and incarnation from registration;
- real archive artifact IDs (the fixture's are synthetic);
- when to upload;
- what to do with `unknown` and `in_doubt`: keep the job and its doubt, and send the same job (never re-mapped under
  new IDs) when Start and permission allow it. A later call's refusal (for example 403 after Stop) does not clear an
  earlier call's doubt.

Nothing in `apps/windows/src/main/main.ts` changes for this, and no shared or root patch was needed.

## Correction after the HOLD on 6c4ac03

| Item | What was wrong | What it is now | Tests |
| --- | --- | --- | --- |
| A | A first 200 that did not correspond was `refused` (known not taken), though the Backend may have committed; a 503 left no doubt | Such a 200, a redirect, a 503 and any reply not of the released contract put the send in doubt: it is sent again as the same bytes, then `unknown` with `in_doubt`. A later refusal keeps it `unknown` | answers not believed; receipts; ACK over HTTP; 503 then 403; real Backend 6 |
| B | An HTTP error string (and a fetch message) could carry the bearer into `reason` and `error` | Only a status and a code released for it come from the network; a failure gives only a short code | network text |
| C | `lstat`, `realpath` and `readFileSync` each resolved the path again, so a link swapped in after the check was read | The bytes are read through the file opened, which must be the file checked (known device and file ID, and its length); no-follow and non-blocking where available. A folder flipped between two path lookups is a stated limit | swapped after the check (7 cases), pipe |
| D | Bindings and the capture folder were the caller's objects, read again after sends | Everything is copied once at the start; the IDs sent and counted come from the copy; options are read once | caller's objects; malformed job; options |
| E | `Date.parse` accepted 30 February | The released UtcTimestamp rule: no disagreement with the Backend's own checker over 20,005 strings | ACK deviations; 23 timestamps |

The send bound is also capped (1 to 10), since `attempts: Infinity` was not bounded.

**Second review of the correction** (3 lenses, each finding verified adversarially):
- **Confirmed and fixed:**
  - a zero file ID is refused;
  - the read-after check was removed, since the read is bound to the opened file;
  - the identity tests now assert outcomes;
  - the pipe case runs in a bounded child;
  - the folder-flip race is stated as a limit instead of being claimed closed.
- **Also tightened, though judged outside A to E:**
  - the bearer's expiry must be a UtcTimestamp;
  - a typed refusal must be in its route's version;
  - options are read once;
  - bindings' identifier and size are checked;
  - an error after a send ends in a result.
- **Left to the host:** a doubt across separate calls (see the `refused` note).

**Not covered:**
- a PostgreSQL store, restart persistence, token rotation mid-upload (a 401 is a refusal; the host sends the same job
  with a new token) and multi-batch splitting;
- a native capture: the harness fixture comes from the real app code under fakes;
- the 32 MiB server limit for originals: larger ones are refused by the mapper before this;
- 409 `dependency_missing` is reported as `unknown`, but the uploader does not itself upload a missing original.
- Acceptance of an `[::1]` origin is allowed by the code but not exercised; the tests use 127.0.0.1.
- The file-identity rule was exercised on Linux only; no Windows race is claimed. The folder-flip limit above applies
  on every platform.
  - On Windows, Node reports the volume serial number as the device and the file index as the file ID, and has
    neither no-follow nor non-blocking.
  - A file system without stable file IDs (such as FAT) would weaken the identity check there.
  - Path checks cannot be made atomic without `openat`, which Node lacks. An adversary who can rewrite the capture
    folder and alternate its links between each step is outside what this narrows, and even then only bytes with
    exactly the expected SHA-256 are sent.
- Both §7.1 gates, real AI receipt and R46/R59 archive remain open.
