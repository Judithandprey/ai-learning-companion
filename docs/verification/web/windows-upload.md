# Windows retained originals over the released 0.2.10 HTTP boundary (main-process uploader)

Lead assignment `handoff_0197da20c340b37fa6145b21ddff3653`, one bounded P0-07/P0-12 task. The Backend, contracts and
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
- `token` (the ephemeral bearer) and `expires_at`.
- `owner` (`SourceRef`) and `incarnation` (device, session, stream).

**The job:**
- `capture_dir`, the retention record;
- the `plan` with its OriginalArtifactBindings;
- `prepared`, the exact output of `frameRequest`.

**The result.** `originals` always lists the artifact IDs whose receipts were exact, so they are committed. `in_doubt`
names the artifact ID, or `batch`, of a send that got no answer and so may have arrived.
- `committed`, with the ACK and the originals committed.
- `refused`, with the stage (`local`, `original` or `batch`), the reason, the HTTP status and the error. A request is
  known not taken only when it was refused and none of its earlier sends went unanswered.
- `unknown`: not known whether it arrived. Send the same job later, when that is permitted. If a refusal came after
  an unanswered send, its status and error are kept.
- `cancelled`, with `in_doubt` if a send was unanswered or in flight.

A result never contains the token. The uploader persists nothing, and it is not wired to any window, renderer, page or
course content. Capture and saving stay local-only until the lead wires the trusted host.

## What it does

1. **Before anything is sent:**
   - the authority is checked (origin, bearer format, expiry). The origin, bearer and expiry are read once from the
     caller's object; what was checked is what is used;
   - the body must be the prepared request, for this owner (exactly three `SourceRef` members) and this incarnation;
   - the Idempotency-Key must be the plan's;
   - the body must be at most 4 MiB.
   - Every original the plan binds is read from the capture folder: `frames/<sha256>.png`, or `ink/<sha256>.json` for
     editable ink. Each must be a regular file (`lstat`, so no link or directory) whose real path is inside the
     capture folder, with exactly the binding's length and SHA-256. A file that cannot be resolved or read is refused
     the same way.
   - Every artifact of every record must have its original, and every binding must be on its record and of this
     source.
   - Any failure is refused locally and nothing is sent.
2. **The originals**, one by one: `PUT /v2/process/originals/{artifact_id}` with OriginalArtifactUpload 0.2.2
   (canonical base64).
   - Each original is read and checked again just before it is sent, so the bytes sent are the bytes checked.
   - The receipt must be exactly its original, with `bytes_committed`: the closed receipt, source and artifact
     objects, with no member missing, extra or null.
3. **The batch:** `POST /v2/process/windows-frames:batch` with the prepared body's exact bytes and its
   Idempotency-Key.
   - It is `committed` only when the ProcessBatchAck 0.2.0 matches. That is the contract's closed shape (no member
     missing or extra, and a UTC `received_at`) and the Backend's own `validate_ack` correspondence:
     - the same batch, incarnation and owner;
     - every record exactly once, with its sequence, `committed`, and `accepted` or `duplicate`;
     - exactly its artifacts, each once, all `verified`.
4. **Unknown outcomes.** No answer (a dropped connection) or 503 means the same bytes are sent again with the same key.
   The number of tries is bounded (3 by default) with a growing pause.
   - Still unknown: `unknown` (the same job can be sent later).
   - `409 dependency_missing` is also `unknown`.
   - **An unanswered send may have arrived.** The Backend answers a replay after Stop with 409 `capture_stopped`
     even if the batch was committed. So when a send of a request got no answer, anything that ends that request
     afterwards is reported as `unknown` with `in_doubt`. That covers a refusal, a mismatched answer, the bearer's
     expiry, and cancellation (as `cancelled` with `in_doubt`). It is never reported as a clean `refused`, and it is
     still not resumed here.
5. **Refusals** (401, 403 including after Stop or withdrawal, 404, 409 `capture_stopped`, `record_conflict` or
   `idempotency_conflict`, 413, 415, 422, 400) end the upload. They are never retried or resumed here.
   - A redirect (3xx) is refused and not followed (`redirect: 'manual'`).
   - The bearer's expiry is checked again before every request.
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
- **Refusals:**
  - 401 or 403 on an original ends the upload with no retry and no batch; so does 409 `capture_stopped` on the batch;
  - a 307 is refused and not followed.
- **ACK correspondence:** 20 deviations from the correct ACK are each refused. They include:
  - another version, batch, device, session, stream or owner;
  - a record missing, twice or not sent;
  - a shifted sequence, a pending envelope, a rejected disposition, or a `received_at` that is not a time;
  - one artifact listed twice in place of another, an artifact missing, with other bytes, or pending;
  - an extra member at any level.

  Over HTTP, the ACK with one artifact listed twice is refused at the batch and sent once.
- **Receipts:** a receipt that is pending, names another artifact, source or kind, has an extra member, has a null
  source or artifact, or is not an object is refused at the first original. Nothing is counted and no batch is sent.
- **In doubt:**
  - a lost batch answer followed by 409 `capture_stopped` is `unknown` with the batch in doubt, the 409 kept and 2
    sends;
  - a lost PUT answer followed by 403 is `unknown` at that original, which is not counted;
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
  - another incarnation or owner;
  - a body that is not the prepared request, over 4 MiB, or with another or malformed key;
  - a record artifact with no original, a binding that is not on its record or belongs to another source, and one
    artifact ID for two originals;
  - an ink original with other bytes, cut short, missing, unreadable, a link to a true copy, or a directory;
  - an `ink` folder that is a link outside the capture folder.

**Mutation check.** 22 mutants of `uploader.ts` were made, one per check the review found untested. Each one removes or
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

**Run** (Node 24 and the repo's Python):

```sh
git archive 8e2094ee8cd2d99f58a5ed27159c724b07fb103b services packages | tar -x -C /tmp/lc-be8
cd apps/windows
LC_BACKEND_ROOT=/tmp/lc-be8 LC_PYTHON=<repo>/.venv/bin/python LC_UPLOAD_EVIDENCE_DIR=../../docs/verification/web/evidence/windows-upload \
  node --test tests/uploader.test.ts
```

**Result:**
- 12/12 passed, including the three real-Backend tests.
- The evidence is in `evidence/windows-upload/`, without the token or any local path:
  - `committed.json`: the body SHA-256, the key, the result with the ACK, and the capture digest;
  - `recovery.json`: the relay's requests (7 PUTs, then 2 batch POSTs), the committed replay, the refused changed
    bytes (0 requests), and the 403 after Stop;
  - `in-doubt.json`: the relay's requests, the Stop's 200, and the `unknown` result with the batch in doubt.
- No host process was left.
- Without the Backend environment the three real-Backend tests are skipped. The full Windows suite has 118 tests: 115
  pass and 3 are skipped. `tsc` is clean.

## Gaps and next owner (lead: host composition)

The uploader is callable and tested, but no host calls it yet. The lead's host wiring must supply the authority in the
main process from real Start and consent, and must not grant a renderer any network or configuration API. The host
must provide:
- the runtime origin;
- the bearer and its delivery, rotation and revocation;
- owner and incarnation from registration;
- real archive artifact IDs (the fixture's are synthetic);
- when to upload;
- what to do with `unknown` and `in_doubt`: keep the job, and send the same job (never re-mapped under new IDs) when
  Start and permission allow it.

Nothing in `apps/windows/src/main/main.ts` changes for this, and no shared or root patch was needed.

**Not covered:**
- a PostgreSQL store, restart persistence, token rotation mid-upload (a 401 is a refusal; the host sends the same job
  with a new token) and multi-batch splitting;
- a native capture: the harness fixture comes from the real app code under fakes;
- the 32 MiB server limit for originals: larger ones are refused by the mapper before this;
- 409 `dependency_missing` is reported as `unknown`, but the uploader does not itself upload a missing original.
- Acceptance of an `[::1]` origin is allowed by the code but not exercised; the tests use 127.0.0.1.
- Both §7.1 gates, real AI receipt and R46/R59 archive remain open.
