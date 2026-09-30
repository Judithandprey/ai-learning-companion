# Windows app: development capture link to the released local host

Lead task `handoff_661e0a4c`, with the lead's decisions in `handoff_ab13473`. The released host and contracts were
read at `aebd668`:
- the host: `services/api/desktop_local.py` and its README section;
- the grant logic in `capture_runtime.py`;
- the contracts: process_control 0.2.1, capture_ingress 0.2.4, and Windows ingress 0.2.10 / 0.2.9.

Main has not changed the host since then (`d96718c`, `d49d101`).

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
  service and that no AI is connected. The overlay's ASK card says so too.
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
  whether the record was ever handed to a started host; only then can a grant exist.
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
- **The record** is written atomically (a temporary file, fsync, then rename). It holds:
  - the actor, generated once: `lc-windows-http-<32 hex>` with its device, session and producer;
  - per stream: the exact registration and its key, the grant state, the last state read, the source, the line
    planned through, the jobs and every Stop;
  - per job: its key, lines and status, and, while unsettled, its exact plan and body.

  It never holds the token, the DSN or pixels.
  - A record that cannot be read, or that was lost (its folder is there, the file is not), is left untouched, and
    the link stays off: no new actor and no grant is asked for without it.
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
  - Only reads and control: a state read, and a Stop if the stream is live.
  - Nothing is sent again, not even an unknown job.
  - A grant still `pending` is abandoned and never registered.
  - No READY means the stream stays "not known": it is never re-granted.

**`main.ts`**:
- `whenReady` reconciles earlier streams;
- `start` calls `begin`;
- a successful `appendRetention` calls `appended`, with whole lines only;
- `end` latches the Stop, and `finish` stops however the session ended;
- `will-quit` waits up to 20 s for the Stop;
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
- `capture-host.test.ts` (7):
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
- `capture-link-rules.test.ts` (12), one per rule the review found unproven:
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
  - a Start whose host was never started is known to have no grant.
- `app-link.test.ts` (6): the real `main.ts` and overlay under the fakes.
  - Off: nothing changes.
  - On: exact bytes for an explicit Start.
  - The app's Stop latch: a frame retained while the Stop waits is never sent.
  - The overlay gone (`finish` without `end`) still stops the stream.
  - A service Stop ends the app's own session, with its `ended` line naming the service.
  - A link that cannot write its record leaves the Start and local capture working, and the control window says
    why.
- `control-link.test.ts` (3): the control line and header in the off, unavailable and development modes. Only
  development mode changes the header.
- `uploader.test.ts`: the transport change adds header-exactness and not-sent cases. Its Windows lock helper is
  main's, released at `4038e41`.

**Owned run** (`tests/owned-host-run.py` with `owned-host-flow.test.ts`) on the dedicated `lc_p0_test` database, with
the released host and its real PostgreSQL store:
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

**The full `apps/windows` suite:**
- with `LC_BACKEND_ROOT` (the release): 190 tests including subtests, 185 pass, 5 skipped (the owned flows, run only
  by their wrapper);
- without it: 151 pass, 39 skipped;
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

## Gaps and next owners

- **No GUI run yet.** The real app on the Windows display, with real display capture and pen ink sent through the
  link, has not been run. It needs the display to be explicitly claimed and released. The owned runs use the real
  main-process and overlay code under the unit-test fakes, not native capture.
- **Development only.** WSL-assisted development is not native packaging or real product-host acceptance. Killing
  `wsl.exe` is not relied on; a host that does not end is reported as such.
- **The released host's limits** above.
- **Recovery.** Reconciliation can leave an earlier stream "not known" (no READY), and it is tried again at each
  launch. No user action is offered for it yet.
- **Other gaps:**
  - Provider and AI are not connected.
  - Native pen and macOS gates are separate.
  - The uploader's unreadable-original test precondition on the hosted stock Node runner is with Support.
- **Next owner:** the lead reviews and integrates; independent QA then receives the candidate.
