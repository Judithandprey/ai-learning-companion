# Windows app: development capture link to the released local host

Lead task `handoff_661e0a4c`, with the lead's decisions in `handoff_ab13473`. The released host and contracts were
read at `aebd668`:
- the host: `services/api/desktop_local.py` and its README section;
- the grant logic in `capture_runtime.py`;
- the contracts: process_control 0.2.1, capture_ingress 0.2.4, and Windows ingress 0.2.10 / 0.2.9.

Main has not changed the host since then (`d96718c`, `d49d101`). The correction after the lead's HOLD on `d6ef68a`
(below) was tested against the host and contracts at main `6425a51`, the lead's integration target.

The written paths are `apps/windows/**` and `docs/verification/web/**`. There is no shared, contract, service,
dependency, root or preview change. No provider is involved, and nothing changes in the user's own data.

## What the user gets

**Off by default.** Without `LC_DEV_CAPTURE_HOST` the app is exactly as before: frames and ink stay on the device,
and the texts say nothing is sent.

**Enabled.** Development only, with an explicit configuration file named by `LC_DEV_CAPTURE_HOST`. It holds launch
facts and the path of the test database's DSN file; no secret:

```json
{ "format": "lc-windows-dev-capture-host/v1",
  "launch": { "kind": "wsl", "distribution": "Ubuntu", "user": "agentsdock", "cd": "<Backend root in WSL>", "python": "<its .venv python>" },
  "dsn_file": "\\\\wsl.localhost\\Ubuntu\\<path>\\test-database.dsn" }
```

On POSIX checks the launch is `{ "kind": "fifo", "python": …, "cwd": … }`.

The DSN file must name `lc_p0_test` at one local endpoint: the Backend runner's own rule, with its connection and
statement bounds. The file is read at each host start and passed only in the host's startup record.

**While enabled:**
- **Start**, the user's explicit Start of a display, begins one stream:
  1. it registers the stream;
  2. it creates the display source;
  3. every frame retained from then on, with its raw and composed PNG and its editable-ink original, is stored in
     the test service, in manifest order;
  4. gaps, frames not retained, refusals and unwritten lines are sent as coverage records.
- **The control window** shows the link's state (connecting, storing, offline, stopping, stopped, not connected,
  ended by the service) and counts:
  - records stored;
  - records not known whether stored;
  - records refused;
  - records not sent, which are kept on this device;
  - earlier streams whose end is not known.

  It always ends with "AI: not connected". Its header says frames and ink are also stored in a local test capture
  service and that no AI is connected. The overlay's ASK card says so too. If the link's record cannot be written,
  the header says further sends have stopped; the counts, and a Stop not confirmed, stay shown. Earlier sends are not
  undone, so the header never then says nothing is sent anywhere.
- **Stop**, and any other end of the session, stops the stream. The service stopping or withdrawing the stream ends
  the local capture too, through the app's own end.

## How it works

**`loopback-http.ts`** makes requests with `node:http` on the loopback interface.
- It sends only the given headers, plus the exact `Host` and `Content-Length`. The platform `fetch` always adds
  `sec-fetch-mode`, which the released host refuses with 403.
- No redirect is followed and no connection is reused.
- A refused connection means the request was not sent. The uploader takes this transport injected.

**`capture-plan.ts`** plans the next live batch.
- It reads only the manifest's whole lines, and only those after the last one planned.
- Identities are derived once from manifest facts:
  - record `<source>.r<line>`, with the Process sequence equal to the manifest line number;
  - frame `<source>.f<sample_seq>`;
  - originals `<source>.png.<sha256>` and `<source>.ink.<sha256>`;
  - batch and Idempotency-Key `<source>.b<first>-<last>`.
- A batch holds at most 100 records and 4 MiB; beyond that it is split. A line the mapper cannot map is unsendable
  and stays on the device.
- Nothing is planned live once the manifest shows the end (`ended` or `unfinished`).

**`capture-host.ts`** runs the released `services.api.desktop_local` host as a private child.
- **Launch.** On Windows the command is `wsl.exe --distribution … --user … --cd … --exec <python> -m
  services.api.desktop_local`, the route Support demonstrated. On POSIX it is `sh -c 'exec <python> -m <module> <
  <private FIFO>'`, because Node gives a socket rather than a pipe and the host refuses a socket. The host's argv is
  exactly `python -m services.api.desktop_local`.
- **Startup.** One startup record goes on its input: the token, the DSN and `fresh_consent` are there and nowhere
  else. The child's environment drops `LC_*`, `WSLENV`, `PYTHON*` and every `PG*` variable; `PGHOSTADDR` or
  `PGSERVICE` could otherwise send the host to a database other than the checked DSN names. The supervisor reports
  whether the whole record may have reached a started host; only then can a grant exist.
  - No process at all (Node reports a missing program only after `spawn` returns, as an `error` without a `spawn`
    event): not started, and known not delivered.
  - The child's and its input's errors are always handled. An input the child closed (`EPIPE`) makes a bounded
    failure with a fixed reason, and the child is ended and reaped like any other. The host takes only a whole
    record ending in its newline, and a failed write means part of it was not taken, so no whole record passed:
    not delivered.
  - Written whole, or a write still pending at the READY bound (it may yet complete), or a started child ending
    without READY: delivered, so whether a grant exists stays not known.
- **READY.** It is checked against the released format; the origin must be loopback and not port 4173 or 8174. Then
  a side-effect-free `GET /openapi.json` is repeated until the port answers 404. On Windows the WSL port answers a
  little after READY. A refused connection sent nothing, and the startup record is never resent.
- **End.** Every path uses one end: the end of its input, a bounded wait, then this child alone is killed.
  - A killed host is never reported as having ended by itself. For WSL, killing `wsl.exe` is not taken as proof
    that the Linux host ended, and the note says so.
  - The input is closed on every failure, including a host that ends right after READY.
  - Stdout is read up to the READY line, bounded, and nothing after it is kept; more output ends the host.
  - Only the fixed error codes are read from stderr, bounded to 4 KiB; nothing the child writes is logged.

**`capture-link.ts`** coordinates everything and keeps the coordination record,
`userData/capture-host/coordination.json`.
- **The record** is written atomically: every byte of it to a temporary file, however many writes that takes (a
  write that makes no progress is a failure), then fsync, then rename. On any failure the record before stays as it
  was and the temporary file is removed. It holds:
  - the actor, generated once: `lc-windows-http-<32 hex>` with its device, session and producer;
  - per stream: the exact registration and its key, the grant state, the last state read, the source, the line
    planned through, the jobs and every Stop;
  - per job: its key, lines and status, and, while unsettled, its exact plan and body.

  It never holds the token, the DSN or pixels.
  - A record that cannot be read, or that was lost (its folder is there, the file is not), is left untouched, and
    the link stays off: no new actor and no grant is asked for without it.
  - Read back, a record is used only if every field that status, recovery and the Stop use is well formed and bound:
    the actor's four identities; each stream's identities, its registration (the actor's device and session, its
    own stream, its continuity), its registration key, grant, state, source (the actor's, its own source), its
    required end (`final`, never taken as absent), the line planned through and its notes; each job's key (its
    lines' key), lines, count, status, and, while unsettled, its exact plan (bound to this stream, source and capture
    session) and body (matching its SHA-256); each Stop's key (this stream's, in order) and exact body. Stream and
    source identities are unique. Anything else is an unreadable record, as above.
  - A record that cannot be written never throws into the app. The app's Start and local capture go on, nothing more
    is sent (what must be written first is not done), the Stop is not sent unwritten, and the host is still ended.
    The control window says why.
- **Start**:
  1. The stream before it is settled first: any stream of this run not known to be ended is ended by a host without
     consent. Only then is the new stream's registration made, so its continuity names the right predecessor.
  2. The registration and a grant state of `requested_unknown` are written before the host is asked for anything.
  3. The host is launched with fresh consent. That happens only here, only at the user's Start.
  4. On READY `pending`, the registration is written as sent, then it is sent under its own key. Then the display
     source is created.
- **Sending**:
  - After each successful manifest append, one job at a time: the oldest unsettled job first, then the next lines.
  - A job is written before its first send.
  - While the Start is live, a job whose outcome is unknown is sent again with the same key and body. A later
    refusal never makes it known; it is kept as a note.
  - A refusal by the service leads to a state read.
    - If the stream was stopped or withdrawn, the local capture is ended too, through `end()` in `main.ts`.
    - A 403 is the service taking this capture's authority away (withdrawn, revoked, the source's permission lost).
      It ends the local capture too.
    - A 401 renews the authority (a host without consent).
    - Otherwise sending stops and the capture continues locally.
  - A local refusal (an original changed or missing on this device) settles only that job.
  - A job in doubt that cannot be sent again as recorded is set aside, said once, and stays not known. Later lines
    still go.
- **A lost host**, while the Start is live and not stopping: the host is started again without consent, at most
  twice. The registration is replayed under its key, and sending continues only if the stream is still live.
- **Stop**, from `end()` or `finish()` in `main.ts`, or at quit:
  1. It latches synchronously, so nothing new is planned.
  2. A connection being made finishes, and registers or sends nothing after the latch.
  3. The job in flight may finish within a bound (5 s by default); then it is cancelled and stays in doubt.
  4. The Stop gets a usable authority. If the host is gone or its bearer expires within a minute, a host is started
     without consent.
  5. A registration sent without an answer is first settled by a read of the stream. If live, it is registered and
     stopped; if absent, it is abandoned; it is never abandoned while it may be live. A stream never registered is
     abandoned, and its pending grant is not used.
  6. One Stop key and body are written, then sent. An unknown outcome, or a 401 through a renewed host, is replayed
     with the same key and body. A stale revision is read back, and a new Stop is written under its own key.
  7. The state is read back and the host is always ended, whatever failed before.
- **After the app restarts**, each stream not known to be ended is reconciled by a host started without consent:
  - Only reads and control: a state read, and a Stop if the stream is live. A Stop already written for the stream's
    current revision (its outcome not known) is sent again under its key; a new one is made only for a new
    revision.
  - Nothing is sent again, not even an unknown job.
  - A grant still `pending` is abandoned and never registered.
  - No READY means the stream stays "not known": it is never re-granted.

**`main.ts`**:
- `whenReady` reconciles earlier streams;
- `start` calls `begin`;
- a successful `appendRetention` calls `appended`, with whole lines only;
- `end` latches the Stop, and `finish` stops however the session ended;
- `will-quit` waits up to 20 s for the Stop: one Stop at a time, every quit while it is pending waits too, and the
  app quits once it has settled or reached its bound;
- the control window gets the `lc:link` status and `lc:link-state`;
- the overlay's ready answer carries `stored`.

## The released host's limits (reported, not worked around)

- **Only one kind of Stop.** There is no stop-fact resolver. The only Stop is `{kind: stop, pre_stop_sequence:
  null}`, whose boundary is unknown. Frames retained after the Stop stay on the device, not sent.
- **No settling after Stop.** A batch whose outcome is unknown cannot be settled after Stop: the Stop check comes
  before the replay cache, and there is no record or ACK read route. In the owned run the database showed such a
  batch had committed, while the app correctly still says "not known". Unknown originals could still be read with
  GET original.
- **A missing READY hides everything.** No grant, a DB outage and a conflict all look the same. So the grant is
  written `requested_unknown` before a fresh-consent launch, and nothing clears it without evidence.
- **One launch per Start.** Each Start is one fresh-consent launch. The token is fixed per launch and is renewed by
  relaunching without consent (on expiry, or a 401).
- **One request at a time.** The host serves one request at a time, so a Stop waits behind a request in flight; a
  request the client abandoned may still commit.

## Checks and evidence

**Focused tests** in `apps/windows/tests`. The memory-host tests run when `LC_BACKEND_ROOT` names a Backend at the
release and `LC_PYTHON` names the repo's Python. They use the released host's own code over a kept in-memory store,
from a private copy of the Backend, with no database. That store also records each startup's consent and stream,
never the token.
- `capture-plan.test.ts` (6):
  - identities and sequences come from manifest facts;
  - batches are split, and a line that cannot be mapped is unsendable;
  - a torn tail is never read;
  - nothing is planned live after the end;
  - a planned batch is accepted by the uploader.
- `capture-host.test.ts` (11):
  - no process at all (a missing program): not started, known not delivered;
  - a real child that closed its input before the record (Linux): the `EPIPE` is a bounded failure inside the start,
    never an uncaught error; the child ends and is reaped; not delivered;
  - a real child that takes the record and ends without READY (POSIX): delivered, so not known;
  - a record write still pending at the READY bound, the child never reading (POSIX): delivered; the child is
    killed;
  - the record goes only to the child's input, checked through `/proc`;
  - READY, registration, the source, and the host's own `Origin` guard;
  - no READY in the malformed and no-grant cases;
  - the port is waited for without resending;
  - a host that does not end is killed, this child alone;
  - no `PG*` variable reaches the host;
  - a host that ends right after READY leaves no input descriptor open;
  - a host that writes on after READY is ended and never said to have ended by itself.
- `capture-link.test.ts` (10):
  - the configuration and the DSN rule;
  - an unreadable record is left untouched;
  - a Start in order with exact bytes, then Stop and no more requests;
  - a lost answer is resent as the same key and body;
  - a service Stop ends the capture;
  - a restart does a read, one Stop and a read, and resends nothing;
  - a lost host is reconnected;
  - a Stop before any host was asked makes no stream and no request;
  - a pending grant is abandoned at restart.
- `capture-link-rules.test.ts` (15), one per rule the reviews found unproven:
  - consent is fresh only at the Start; the lost host's startups are recorded as without consent;
  - a registration without an answer is settled by a read, stopped and never abandoned, and the next Start names it
    as its predecessor;
  - a Stop landing before READY registers nothing after it;
  - the Stop is written before each dispatch, resent with the same key and body, and a batch in flight past the
    bound is cancelled and stays in doubt;
  - an expiring bearer, or a host lost three times (offline after two reconnects), still gets the Stop delivered
    through hosts without consent;
  - a later refusal never erases an unknown outcome;
  - the service's 403 ends the local capture;
  - only acknowledged whole lines are read;
  - a job in doubt whose original is gone is set aside once;
  - a record that cannot be written sends nothing unwritten and still ends its host;
  - a lost record keeps the link off;
  - a Start whose host was never started is known to have no grant;
  - one Stop per revision: a Stop that never reached the service is sent again at the next Start under the same key;
  - READY `pending` with the port never reached is known pending, abandoned at the Stop, and the next Start registers;
  - a manifest not yet written when the link is ready does not leave a lasting fault in the status.
- `capture-link-record.test.ts` (26), without the Backend (a fake host child and fake answers):
  - a record as this app writes it is used: its live stream is reconciled with a read and one Stop, and its unknown
    job stays unknown;
  - 19 damaged records (a null job, a stream without `final`, unknown ends, statuses or grants, a missing count,
    revision or device, an unsettled job without its body or with other bytes, keys, plans, registrations, sources
    and Stops bound to something else, a job past what was planned, a duplicate stream): each is left byte for
    byte, the status says the record cannot be read, and nothing is asked for at the restart or at a new Start;
  - short writes (23 bytes at a time) are continued until the whole record is written, and the Stop is sent only
    with its exact key and body on disk;
  - a write that makes no progress, or fails after a partial write: the record before stays byte for byte, no
    temporary file is left, the Stop is not sent, the counts stay shown with further sends stopped, and a new
    Start asks for nothing;
  - a fault before anything was recorded: the link says it is off with the reason, and its folder is not left
    behind to look like a lost record at the next start;
  - after a fault no host is started again and nothing is registered again;
  - a state answer the record could not read back (revision 0) is not written: the registration stays not known,
    and the record stays readable.
- `app-link.test.ts` (8): the real `main.ts` and overlay under the fakes.
  - Off: nothing changes.
  - On: exact bytes for an explicit Start.
  - The app's Stop latch: a frame retained while the Stop waits is never sent.
  - The overlay gone (`finish` without `end`) still stops the stream.
  - A service Stop ends the app's own session, with its `ended` line naming the service.
  - A link that cannot write its record leaves the Start and local capture working, and the control window says
    why.
  - Quitting while the link is still stopping: both quits wait for the one Stop, and the app quits once, after it
    settled; the quit after that goes through.
  - After a record-write fault, a new Start's overlay is not told its frames are stored; after the Stop the control
    window shows the last recorded outcome, with further sends stopped (POSIX: it makes a folder read-only).
- `control-link.test.ts` (4): the control line and header in the off, unavailable and development modes. Only
  development mode changes the header. After a record-write fault the counts and the unconfirmed Stop stay, and
  the header says further sends have stopped, never that nothing is sent anywhere.
- `uploader.test.ts`: the transport change adds header-exactness and not-sent cases. Its Windows lock helper is
  main's, released at `4038e41`.

**Owned run** (`tests/owned-host-run.py` with `owned-host-flow.test.ts`) on the dedicated `lc_p0_test` database, with
the released host and its real PostgreSQL store. These results are of `d6ef68a`, the author's own runs; they carry no
separate receipt of the executed source, and they were not rerun for the correction below (no database campaign was
asked for):
- The wrapper uses the Backend's own guards: `dedicated_test_dsn`, `verify_test_database`, `verify_migrations`, and
  `verify_pristine_actor` for each new actor.
- Afterwards it confirms no host process of the run remains, and only then deletes the run's actors.
- Evidence is in `evidence/windows-capture-link/owned/`, with no bearer, DSN, socket path or user name.

**Linux/WSL run**, `owned-run.json`, rerun after the review fixes: PostgreSQL 18.6, migrations 0001–0003. PASS 5/5:
1. **The app** (real `main.ts` and overlay under the fakes):
   - two changing frames and two ink originals, read back through a reads-only host as exact bytes;
   - one Stop, `stopped`;
   - the `ended` line after the Stop was never planned.
2. **A lost batch answer**: the same key twice, committed once. The host's argv and environment held no token or
   DSN.
3. **A host killed while live**: relaunched without consent, the registration replayed first under its key, the
   source not recreated, and both jobs committed.
4. **A restart** with a job in doubt: the second run made exactly a state read, the control Stop, and a state read,
   and the job stays unknown. The database facts show its two records had committed, which is the released host's
   limit (no settling after Stop).
5. **A service Stop**: the local capture was asked to end, and nothing was sent after it.

**Windows run**, `owned-run-windows.json` and `windows/app-windows.json`, rerun after the review fixes, with Electron
44.5.1 run as Node (Node 24.21.0, win32, no window):
- the app flow launched the released host through `wsl.exe`;
- two changing frames and two ink originals were stored and read back as exact bytes;
- one Stop was confirmed.

The four `/proc` cases are Linux-only; they are skipped there, with that reason. No host process was left, and the
run's actors were removed.

**The full `apps/windows` suite** (at `d6ef68a`; for the correction see below):
- with `LC_BACKEND_ROOT` (the release): 194 tests including subtests, 189 pass, 5 skipped (the owned flows, run only
  by their wrapper);
- without it: 152 pass, 42 skipped;
- `tsc` is clean.

On Windows Node (Electron 44.5.1) the suite passed apart from two older context-picture and ink-original cases whose
setup makes a file symbolic link, which this Windows account may not. The hosted runner may, and ran them.

**Review.** An independent three-lens review, each finding verified, confirmed 19 findings on `d252e48`. All are
fixed, each with the test named above:
- a live stream wrongly abandoned when its registration answer was lost;
- a record that could not be written breaking the Start or wedging the Stop;
- a Stop not delivered with an expired bearer or a lost host;
- a 403 withdrawal not ending the capture;
- the continuity fixed too early;
- a retry loop for a job in doubt;
- a false "a grant may exist";
- a lost record minting a new grant;
- `PG*` variables reaching the host;
- three supervisor leaks;
- the header claiming storage when unavailable;
- seven rules without a test.

**Second review.** A focused adversarial re-review of `6b74148` confirmed four more findings, all fixed with tests:
- a Stop whose outcome was not known was later sent under a new key at the same revision; now one Stop per revision;
- READY `pending` with the port never reached was recorded as "a grant may exist" and never settled. Now it is known
  pending and abandoned, and the settling at the next Start covers every stream not known to be ended;
- an early "the retention manifest could not be read" stayed in the status; it is now cleared;
- after a record-write fault the header still claimed storage, and the state stayed "storing". Now the header is
  reset, the state says "not connected", and the status is sent once more when the stream is cleared.

The owned runs were rerun after this: Linux 5/5, Windows 1/1.

## Lead review of `d6ef68a` (HOLD) and its correction

The lead's review (`docs/verification/lead/windows-parent-review/` at `ddcae90`) reproduced six findings. Each is
corrected in `apps/windows`, with at least one regression that fails on `d6ef68a` and passes now (a control that
passes on both is named as such):

| Finding | Correction | Regression |
| --- | --- | --- |
| WIN-HOST-01: a child that closed its input made an unhandled `EPIPE` | The child's and its input's errors are always handled; the write's completion is awaited within the READY bound; a failed write is a bounded failure with a fixed reason, and the child is ended and reaped. A failed write did not pass a whole record, which the host requires to end in its newline: not delivered. A write still pending at the bound may yet complete: delivered. | `capture-host.test.ts`: the closed-input child (real `EPIPE`); the pending write pins the uncertain case (passes on both) |
| WIN-HOST-02: no process at all was marked delivered | The start waits for Node's `spawn` or `error` event; without a process it is not started and not delivered. A started child that ends without READY stays delivered (not known). | `capture-host.test.ts`: the missing program; the started child without READY as the control |
| W-PARENT-C1: `jobs:[null]` crashed the status; a stream without `final` skipped recovery and was then overwritten | Every field the status, recovery and the Stop use is checked, with its bindings; anything else is an unreadable record, left as it is, and nothing is asked for. A state answer the record could not read back is not written. Records this code writes still read back (the whole suite reloads them). | `capture-link-record.test.ts`: 19 damaged records, a valid record as the control, the state answer |
| W-PARENT-C2: a short write was renamed over the record, and the Stop sent without its witness | Every byte is written (a write without progress fails), then fsync, then rename; on any failure the record before stays and the temporary file is removed; nothing waiting on the write is sent. | `capture-link-record.test.ts`: short writes continued, no progress, failure after a partial write |
| APP-Q1: a second quit skipped the pending Stop | One pending Stop; every quit while it is pending is prevented; the app quits once it has settled or reached its bound. | `app-link.test.ts`: two quits, then the one after |
| APP-U1: after a fault the counts and the unconfirmed Stop were hidden, and the header said nothing is sent anywhere | After anything was recorded, a fault keeps the counts and the Stop's state, and says further sends have stopped; "No AI is connected" stays. A fault before anything was recorded keeps the off wording. | `control-link.test.ts`, `capture-link-record.test.ts` |

**Review of the correction.** Two independent adversarial reviews of the change, with probes on real child processes
and fake answers, confirmed the corrections above and found seven more issues, all fixed. The first four have a
regression that fails without the fix; the last three are fixed without a separate test:
- after a fault a new Start's overlay was still told its frames are stored (from this correction's status change);
- after a fault an expiring or refused bearer still started a new host and registered again;
- a state answer the record cannot read back (a revision 0) was written, so the record then could not be read;
- a first record write that failed left its empty folder behind, taken at the next start for a lost record;
- the fault's text was shown twice in the status;
- a spawn that throws at once left the private FIFO folder behind;
- a failed kill was reported for WSL as "the wsl.exe shim was ended".

**Results of the correction** (`evidence/windows-capture-link/correction/`, each with a receipt naming the runtime,
the Backend revision, the counts, and the SHA-256 of every source and test file it ran; both runs ran the same
bytes):
- The lead's focused set plus `capture-link-record.test.ts`, on Linux against the released host at main `6425a51`
  over a kept in-memory store: 115 tests, 115 pass (`linux-focused.txt`).
- The same files on Windows, Electron 44.5.1 run as Node, no window, no Backend: 115 tests, 70 pass, 0 fail, 45
  skipped (the host cases without a Backend, the POSIX-only cases, and the three file-link cases this account may
  not make) (`windows-focused.txt`).
- The whole `apps/windows` suite on Linux: with the Backend 226 tests, 221 pass, 5 skipped (the owned flows); without
  it 184 pass, 42 skipped. `tsc` is clean.
- Not rerun: the owned `lc_p0_test` runs (above, of `d6ef68a`), and no GUI, display, provider or product gate.

Not changed, reported: there is no folder fsync after the rename (Windows has none either); a reused Stop that was
refused as `stale_revision` and then succeeds keeps that earlier refusal's status next to `stopped`.

## Gaps and next owners

- **No GUI run yet.** The real app on the Windows display, with real display capture and pen ink sent through the
  link, has not been run. It needs the display to be explicitly claimed and released. The owned runs use the real
  main-process and overlay code under the unit-test fakes, not native capture; they and every test above are
  synthetic or database evidence, not interactive GUI evidence.
- **Development only.** WSL-assisted development is not native packaging or real product-host acceptance. Killing
  `wsl.exe` is not relied on; a host that does not end is reported as such.
- **The released host's limits** above.
- **Recovery.** Reconciliation can leave an earlier stream "not known" (no READY), and it is tried again at each
  launch. No user action is offered for it yet.
- **Other gaps:**
  - Provider and AI are not connected.
  - Native pen and macOS gates are separate.
  - The Windows portability item (the uploader's unreadable-original precondition on the hosted stock Node runner)
    is closed: main `4038e41`, hosted run `36773932867`.
- **Next owner:** the lead reviews the correction and integrates the owned commits; independent QA then receives
  the runnable candidate for one Windows interaction, storage and Stop pass.
