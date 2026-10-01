# macOS app parent → local capture host: explicit Start…Stop storage link

Task: the lead's `handoff_8c960a9dda2facc356f60a5408088843` (existing P0-03/11 → P0-07). The
baseline is the verified transport `923217b`, normally merged into `team/ios` as `497e05c`. The
lead's Windows parent review `ddcae90` (`handoff_3b8ff4be3c8321c7aa7493e59672155a`) was applied
as lifecycle guidance within the same task.

The first delivery was `f625b48`. The lead's review `b408f4f` held it for three defects
(`handoff_2bedf7ee1ad4bca823a2de9f24046f36`). They are corrected in the commit that carries this
text; see [Correction after the lead's review](#correction-after-the-leads-review-b408f4f). The
flow table below describes the corrected behaviour. "Checks and results" and "Review" record the
first delivery, whose logs are kept unchanged; the correction section has the counts of `fb891d6`.

`fb891d6` was approved and integrated by the lead (`295d778`), and the hosted macOS run
36803694899 built the app and passed all 78 XCTests (the lead's record is
`docs/verification/lead/macos-parent-review/correction/`). A follow-up within the same task
(`handoff_e315d6df5277bb8e006e4d94af5dcfa5`, baseline `bde0cb1`) then made the shown storage
status truthful; see [Truthful storage status](#truthful-storage-status). That change has not
been built or run on macOS.

Read for this task:
- `services/api/desktop_local.py` and its README section;
- the released control 0.2.1, display source 0.2.4 and macOS ingress 0.2.12 routes, including the
  runtime's lineage rule;
- the Windows parent decisions and the lead's six Windows findings;
- the current decisions and `docs/workflow.md`.

**Scope.** Writes only `apps/macos/CompanionDesktop/**`, this record, its evidence folder
[`macos-app-parent-link/`](macos-app-parent-link/) and its index entry in `README.md`. There is no
dependency, contract, CI, shared-file or mobile change. There is no account enrollment, installer,
provider, AI or auto-start. **AI stays not connected**, and the UI says so.

## The one flow

The link connects the app's explicit Start/Stop, its retained raw/composed/immutable-ink
pipeline, and a visible confirmed-stored/awaiting/not-known/refused/not-sent status through the reviewed trusted
foreground host. Local capture, ink, save and reopen never wait for the link or depend on it.

| Step | Behaviour |
| --- | --- |
| Configuration | `~/Library/Application Support/CompanionDesktop/capture-host.json` is one JSON object with exactly `format` (`lc-macos-dev-capture-host/v1`), `python`, `repository`, `dsn_file`, `user_id`, `device_id`, `session_id` and `producer_id`. It holds no secret and is read once, at app launch. If it is missing, the UI says "Not set up on this Mac" and frames stay local; there is no fixture or fake server. A malformed file gives "Unavailable" with a fixed reason. |
| Connection string | Read at each launch through one descriptor (`O_NOFOLLOW`, `fstat`, bounded read). It must be a regular file owned by this user, mode `600`, one line of at most 8192 characters. It is never copied, logged, shown or journaled. |
| Host child | `<python> -m services.api.desktop_local` with no other argv and cwd = the repository. The environment drops `LC_*`, `PYTHON*` and `PG*` and adds `PYTHONDONTWRITEBYTECODE=1`. The startup record goes only on a private stdin pipe. The pipe stays open for the child's life, so EOF means stop. Ending waits for the child's own exit whatever the caller's cancellation: EOF, then 8 s, then SIGTERM and 2 s, then SIGKILL of that pid only. |
| Startup record | Exactly the host's 18 keys: port 0, the DSN, and the stream's recorded user/producer and registration identities. It carries `StreamRegistration` 0.2.1 (pins 1/1; `initial`, or `restart` with the predecessor and gap `unknown`), a new random 256-bit hex bearer per child with a 12 h expiry, the 4 scopes and 4 capabilities, `fresh_consent`, `desktop_pixels`, and only `enable_macos_ingress` true. |
| Writing it | Non-blocking and bounded by the READY timeout. EPIPE is an error, not a signal (`F_SETNOSIGPIPE`). A failed spawn and an incomplete write are **known not delivered**. Once the whole record was written, a failure is **possibly delivered**. |
| READY | Believed only in its exact 4-key form with numeric loopback origin (not preview ports 4173/8174), within 15 s. A cancelled caller gets a prompt answer and the child is still ended. Anything else ends the child. Only the host's fixed error codes are recognized; stderr is otherwise never shown. |
| Lineage | The server keeps one lineage head per user, device, session and producer, and a new stream must name that closed head. Each stream records its user and producer. The predecessor is the last **registered** stream of the same lineage in the journal. At each Start, the lineage's unsettled streams are first settled, as at launch, by one settlement at a time; a Stop meanwhile waits for it and then shows the settled state. If one still cannot be settled, the Start is **not linked** ("an earlier stream of this capture could not be settled"), and nothing is journaled or registered. |
| Start | The user's explicit Start is the only `fresh_consent=true`. The link then:<br>1. journals a new stream and source ID before launching;<br>2. on `pending` READY, POSTs the registration under `<stream>.register`. `registrationSent` is journaled first. The capture gate is checked before **every** attempt, so no attempt goes out after Stop. A stop before the first attempt resets `registrationSent`;<br>3. GETs the stream, which must be exactly this identity, live, at revision 1. Another believed live revision is "not connected", not a service end;<br>4. PUTs the display source, which must answer exactly its descriptor. The gate is checked before every attempt here too;<br>5. only then sends. |
| Sending | Kept frames are ready when their composition outcome is recorded, or as soon as they are kept if the session does not compose ink. They go in batches of up to 20. `MacIngressBatch` builds each batch with content-addressed IDs within the source. Each batch's exact bytes are written to their own file and its key journaled before the first send. `MacIngressUpload` then PUTs the originals and POSTs the batch. The link resends a batch in doubt at most twice (at most 3 upload calls), with the same bytes and key, only while live. Each upload call makes up to 3 HTTP attempts per request, so the same batch can reach the service up to 9 times. A batch refused only for an expired bearer or a 401 counts as **not sent**; it goes again with the same bytes after a new bearer. A later refusal never makes a doubt known. A frame that cannot be described is kept locally and counted as refused. While nothing is ready, planning runs at most once a second. |
| Stop | The capture gate closes first, so nothing new is sent. The connection or reconnection and an in-flight batch each get 5 s, then are cancelled and stay **not known**. The unknown-boundary Stop is journaled before dispatch and sent with the same key and bytes on retry. A Stop already recorded for exactly this stream and read revision is the same command: its key and exact bytes are sent again, also after a restart, and only if its stored bytes equal this stream's Stop at that revision. A new command is made only when there is none for the read revision. A believed `stopped` answer settles the stream; the state is read back either way. A stale revision gets one new Stop at the read revision. A refusal that follows an attempt in doubt leaves the Stop **not known**; a 401 then still gets a new child and bearer for the same key and bytes. Then the child gets EOF. After Stop the host refuses uploads, so unsent frames stay on this Mac, counted "not sent". |
| Stop before a registration | If no child ever got the record, or the registration was never POSTed, the stream is `abandoned`. It was never registered, and it is never registered after Stop. No later launch starts a child for it. |
| Server end | A believed `stopped` or `withdrawn` state after a 409 `capture_stopped`, 403 or 404 ends this capture through the app's normal Stop path (`server_stopped`/`server_withdrawn`). So does a believed non-live state in a registration replay's answer, and a 403/404 on the state, the source or a replay of a registration already known committed (`server_permission_lost`). The app acts on it only while that same capture's gate is open, never on a later capture. No Stop is sent for a withdrawn stream. |
| Child loss / renewal | A **tracked** reconnection, which Stop waits for, starts a new child with `fresh_consent=false`. It happens at most 2 times per Start and only while the capture is current and open. The registration is replayed under its own key, followed by the same GET and source checks, before sending resumes. A child that exits before its stream went live is replaced the same way. While a child is being replaced the link shows "Connecting.", not linked. It never registers anew or revives a stopped stream. A reconnection never leaves two children, and one that finds Stop begun hands its child to the Stop. Child EOF or exit is not treated as a server or physical Stop. |
| Restart | Each launch reconciles every unsettled stream once, with `fresh_consent=false` and the stream's own recorded identities. A `consumed` stream is read and, if still live, Stopped (journaled first) and read again. A `pending` or never-POSTed stream is `abandoned` and never registered. No batch or registration is resent; a Stop already recorded for the read revision is sent again under its own key and bytes. No source is created, and no capture starts. A new stream needs a new explicit Start. |
| Link record | `CaptureLink/journal.json` (directory `700`, file `600`) holds identities, keys, each batch body's relative path and SHA-256, Stop bodies and outcomes, but no bearer, DSN or pixels. The exact batch bytes are in one file per batch, `CaptureLink/<stream-id>/<batch-key>.json` (`600`). Every file is written completely and flushed (`F_FULLFSYNC` on Darwin) before an atomic rename, and the directory is flushed after it. A failed, short or stalled write keeps the old file. A write failure is sticky: no child is started and nothing more is requested or sent in this run, this stream's own child is ended, no Stop goes out unwritten, and the counts so far stay shown. Local capture is not ended by it; a believed server stop or withdrawal still is. A batch that was never written shows as not sent. A record that does not decode, or whose consumed fields do not have the form this link writes, is left byte for byte; no host, grant or Stop uses it. |
| Quit | Capture and ink end first, and the link's Stop starts at once, even if Quit is then held for unsaved ink. Quit waits once, bounded to 10 s, for that Stop. A second Quit meanwhile is refused and does not skip the first. Whatever does not finish is reconciled at the next launch. |
| UI | A "Capture storage (development)" section and menu line show the state (not set up, unavailable, connecting, linked, not connected, stopping, stopped, ended by the service). The linked state reads "Linked to the capture service." and never says frames are being stored. A counts line shows frames confirmed stored (a verified ACK only), awaiting an answer, not known, refused and not sent, plus earlier streams not settled; it is shown whenever the link is up. There is also a fixed-word detail, plus: "a stored frame is not seen by any AI. AI: not connected." The ASK selection message now says "it is not sent to any AI" instead of "nothing is sent". |

**Windows findings (`ddcae90`) applied in Swift:**

| Finding | In this implementation |
| --- | --- |
| WIN-HOST-01: EPIPE | The write is non-blocking and bounded, and EPIPE is an error (`F_SETNOSIGPIPE`). The child is ended and reaped: EOF, SIGTERM, then SIGKILL of that pid only. Tested with a child that closes its stdin and a 300 KB record. |
| WIN-HOST-02: failed spawn labelled delivered | `Process.run` failure gives `delivered: false`. The stream is then abandoned, and no later launch asks a child about it. Tested at both launcher and link level. |
| C1: durable-record validation | The record is strictly decoded, then every consumed field is validated, including user and producer. Invalid bytes are preserved, and no host, grant or Stop is used. A legitimate unsettled record with no `final` is still reconciled. Tested with 8 damages (7 at `f625b48`, plus a Stop key of another stream) and the legitimate control. |
| C2: short write before rename | A complete write loop, then fsync and close, then rename. A short or zero-progress write removes the temporary file and keeps the old one. Tested with an injected 23-byte short write and a read-only directory: no Stop is dispatched unwritten. |
| APP-Q1: repeated Quit | One pending Quit; a repeated Quit is refused until it settles (source only). |
| APP-U1: fault hides outcomes | A fault publishes "not connected" with the counts kept. The fault reason is followed by "the server Stop is not confirmed", and the UI keeps "AI: not connected". Tested. |

**Engineering defaults** (not user choices):
- the configuration file location and format;
- READY in 15 s; EOF grace 8 s, then 2 s after SIGTERM;
- bearer lifetime 12 h, renewed 60 s before expiry;
- 20 frames per batch, 5 batches per run, at most 3 upload calls per batch (each with up to 3 HTTP attempts per request), 3 attempts per control call;
- at most one planning pass per second while nothing is ready;
- 2 reconnects per Start;
- a 5 s wait each for the connection and an in-flight batch at Stop;
- at most one further Stop after a stale revision;
- a 10 s Quit bound;
- pins fixed at 1/1;
- native gaps are not sent (they stay in the retained session).

`Info.plist` adds `NSAllowsLocalNetworking` for plain HTTP to numeric loopback.

## Setup and start (development only; honest prerequisites)

Nothing here was run on a Mac. Every step needs an interactive Mac with macOS 15+ and Xcode 16+.
1. **Backend environment.** A checkout of this repository with the existing backend environment,
   for example `uv sync --extra backend`. The installed interpreter is at `<repo>/.venv/bin/python`.
   There is no new dependency.
2. **Database.** A local PostgreSQL database for development only (never production data),
   migrated as in [`services/api/README.md`](../../../services/api/README.md). The host performs
   no migration; without a usable database it reports `unavailable`, and the app shows
   "Not connected: frames stay on this Mac".
3. **DSN file.** Put the DSN in a file of its own, one line, then `chmod 600 <file>`. Keep it out
   of the repository.
4. **Configuration file.** Write `~/Library/Application Support/CompanionDesktop/capture-host.json`:
   ```json
   {"format":"lc-macos-dev-capture-host/v1","python":"/ABS/repo/.venv/bin/python",
    "repository":"/ABS/repo","dsn_file":"/ABS/private/lc-dsn",
    "user_id":"dev-user","device_id":"dev-mac","session_id":"dev-session","producer_id":"dev-mac-capture"}
   ```
   The identities are contract Identifiers chosen for this development setup; there is no
   enrollment.
5. **Run.** Build and open the app as in the [package README](../../../apps/macos/CompanionDesktop/README.md).
   Grant Screen Recording, choose a display, and press **Start**. "Capture storage (development)"
   shows the link. **Stop** or **Quit** ends it.
6. **Disable.** Quit the app, remove `capture-host.json`, then reopen it. The file is read only at
   launch.
7. **Recovery.** If the link record is reported as damaged, inspect `CaptureLink/journal.json` and
   the batch files beside it, then move the whole `CaptureLink` folder away. This also loses the
   stream lineage. The server still holds its last stream for this user, device, session and
   producer, so later Starts would declare no predecessor and be refused. Use a **new
   `producer_id`** (or session) in `capture-host.json` from then on. The same applies after
   resetting the development database while keeping the record: use a new producer, or move the
   record away.

## Checks and results

| Level | State |
| --- | --- |
| Source | Changed:<br>- new: `CaptureHost.swift`, `CaptureControl.swift`, `CaptureLink.swift`;<br>- `DesktopIngress.swift`: `read(_:verifying:)`, so planning does not re-hash every PNG;<br>- `MacIngressUpload.swift`: the token is module-internal;<br>- the app: `CaptureController`, `CompanionDesktopApp`, `ContentView`, one `InkController` string, `Info.plist`.<br>**Uncompiled on macOS**: there is no Mac here. |
| New tests | `Tests/DesktopCaptureTests/CaptureLinkTests.swift` has **15** XCTests, bringing the total to **70** declared tests in 8 files. They use:<br>- a stub host script, which checks argv and the FIFO, logs the environment, record and pid, and awaits EOF itself;<br>- a real POSIX loopback HTTP server at file scope with a stand-in for the released routes. |
| What the new tests cover | 1. Configuration, DSN file and startup-record secret boundaries.<br>2. Host child: private pipe, READY, failures, failed spawn, EPIPE, EOF, SIGTERM→SIGKILL.<br>3. Start → register → GET → source → 7 stored → Stop. This includes the journal-before-send witness, on-socket headers, no token or DSN in the journal, and mode 600.<br>4. Stop before READY; a lost registration reply settled at Stop; an in-flight batch cancelled stays not known.<br>5. Restart is exactly GET, Stop, GET with `fresh_consent=false`; a never-POSTed stream gets no child, and a pending one is abandoned.<br>6. Service withdrawal ends local capture; no Stop is sent.<br>7. Damaged records (7 kinds) are kept and never used.<br>8. Complete writes, including an injected short write.<br>9. An unwritable record sends no Stop and keeps its counts.<br>10. Lineage: an unsettled predecessor blocks a new registration, and after restart the next stream names the settled predecessor.<br>10a. A Stop during a Start's settlement of an earlier stream waits for it, shows the settled state (idle, nothing unsettled) and registers nothing. This test fails without the fix.<br>11. Child loss: reconnection without consent, registration replayed under its key, source rechecked, then exactly one Stop.<br>12. A 503 on the registration while Stop is pressed: no second attempt, and the stream is abandoned.<br>13. A failed spawn is abandoned and never reconciled.<br>14. URLSession on a real socket: headers, 307 not followed, reply bounds. |
| Swift tests on macOS | **NOT_RUN.** The lead runs the hosted macOS build/test. |
| Linux type-check (reviewers' swift.org Swift 6.3.3 with Darwin stub modules; not a macOS compile) | The DesktopCapture module (with Darwin stubs) and the test target: 0 errors, 0 warnings in new files, no expression over 100 ms ([log](macos-app-parent-link/linux-typecheck.txt)). The app target (SwiftUI/AppKit) is not type-checked; it was traced by reading. |
| Linux interpreter run (functional Apple stubs; corelibs Foundation) | **Link tests: 14/15 pass**, identically in two consecutive runs ([log](macos-app-parent-link/linux-link-tests.txt)). The failing test is the 307 assertion: corelibs never calls the async redirect delegate method, so libcurl follows the redirect. With a Linux-only completion-handler witness the same test passes, so its logic holds. Darwin bridges the async method, as the hosted `URLProtocol` test showed. Real-socket redirect refusal on Darwin is still **unverified until the hosted run**. **Upload tests: 8/8** ([log](macos-app-parent-link/linux-upload-tests.txt)). **Whole suite: 66/70** ([log](macos-app-parent-link/linux-all-tests.txt)); the other 3 failures are the known stub artefacts in unchanged tests (FrameStore path, a JSON round trip, ink pixels). |
| Actual `services.api.desktop_local` child, no database | Launched by the Swift `ProcessHostLauncher` with the Swift startup record (initial, and restart continuity). The host's real parser accepted it; with a DSN pointing at a nonexistent socket, startup ended `unavailable`. The same record missing one key was refused `invalid_startup`. [Probe](macos-app-parent-link/probe-real-host.swift), [log](macos-app-parent-link/linux-host-probes.txt). |
| Actual host `main()` and released handlers over MemoryStore (the backend tests' substitution) | Swift `CaptureLink` on Linux URLSession completed the whole flow:<br>- READY `pending`;<br>- registration, then GET live at revision 1;<br>- the display source;<br>- 7 frames committed in one batch;<br>- Stop answered `stopped` at revision 2;<br>- the journal ends `final: stopped`.<br>[Probe](macos-app-parent-link/probe-memory-host.swift), [wrapper](macos-app-parent-link/probe-memory-host-python.sh). **Not PostgreSQL, not a Mac.** |
| Real PostgreSQL, hosted macOS, real Mac permission/UI, ATS, Quit/sleep, provider/AI, Notability | **None.** No real database campaign was run (not coordinated). |

The harness is the reviewers' `/tmp` toolchain. Its assembly script, main file, shim additions,
probes and logs are retained byte for byte in [`macos-app-parent-link/`](macos-app-parent-link/)
with [`SHA256SUMS`](macos-app-parent-link/SHA256SUMS). They refer to local `/tmp` paths and are
reproduction records, not portable entry points.

## Review

Workflow `wf_ee9e9929-db4` ran 5 dimensions (lifecycle, host and secrets, released protocol,
tests, app and docs), each with an adversarial verifier. It raised 32 findings; all were kept (31
confirmed, 1 plausible) and all are fixed:
- **Lineage.** Reconcile did not advance the predecessor, so the next Start named a stale head and
  every later Start was refused. The predecessor is now derived per lineage from registered
  streams. Unsettled heads are settled at Start or block it. Streams record their own identities.
  Recovery after moving the record is documented.
- **After Stop.** Registration and source attempts could retry after Stop. A reconnect was
  untracked, so it could race the Stop, orphan a child or end a later capture. Quit held for ink
  never stopped the link. Now the gate is checked per attempt, reconnects are tracked and
  current-checked, the host handover is single, `endCapture` is bound to its gate, and Quit
  starts the link Stop at once.
- **Waits.** Exit and READY waits spun or hung when the caller was cancelled. The waits are now
  non-cancellable and bounded, and a cancelled launch returns promptly.
- **Settling.** A stream never POSTed stayed unsettled forever; it is now abandoned. A believed
  Stop answer now settles the stream.
- **States and counts.** An unexpected live revision wrote an invalid `final`. A batch whose
  journal write failed counted as not known. Expiry and 401 refusals were permanent. A
  non-composing session never sent.
- **DSN.** The file was checked and then read through a path, not one descriptor.
- **Darwin compile.** An unqualified `bind` inside a nested class of the XCTestCase would resolve
  to NSObject's `bind(_:to:withKeyPath:options:)`; the server is now at file scope.
- **Tests and docs.** A damage case that did not reach its check; link-level failed-spawn
  coverage; test-file count, resend and Stop counts, batch-file layout, a missing `SHA256SUMS`,
  and the disable step.

**Recheck.** Workflow `wf_aa8c560e-79b` confirmed 31 of the 32 fixes; the missing `SHA256SUMS`
is now added. It found 11 more low findings, all verified and all fixed:
- **Start-time settlement.** It was untracked and could run twice for the same stream, and a
  Stop during it left "Checking earlier streams" shown. It now runs one at a time, a Stop waits
  for the pending Start, the settled state is published, streams are re-checked, and the Stop
  entry's index is fixed before any await. It has a regression test.
- **Early child exit.** A child that exited before its stream went live was never replaced.
- **Durability.** Writes now use `F_FULLFSYNC` on Darwin, and the directory is flushed after the
  rename.
- **Wording.** HTTP attempts per upload are now stated.
- **Evidence.** The retained evidence is refreshed from the final sources.

## Correction after the lead's review (`b408f4f`)

The lead held `f625b48` for three defects (`docs/verification/lead/macos-parent-review/` at
`b408f4f`). All three are corrected in `CaptureLink.swift` and `CaptureControl.swift`, with no
wire, dependency, shared-file or app-target change.

| Finding | Correction |
| --- | --- |
| **MAC-PARENT-C1.** After a registration answered 200, a journal-write failure showed "nothing more is sent", but the GET and the display-source PUT still followed. | Every step of the connection is journaled before the next request, and a failed write ends the connection there:<br>- no child is launched and no request is made after the fault, including on reconnect and in the Stop's read back;<br>- this stream's own child gets EOF;<br>- local capture, its originals and the earlier outcomes are untouched, and the fault alone never ends capture;<br>- a believed server stop or withdrawal still ends the capture, also when it arrives in the answer whose write failed, and without waiting for a further read;<br>- the record on disk still says the registration was sent, so the next launch reads and Stops the stream. |
| **MAC-PARENT-C2.** Reopening a recorded unknown `.stop.1` at live revision 1 sent the same body as `.stop.2`. | The recorded Stop is reused only when its stored bytes are exactly this stream's Stop at the read revision; its key and bytes are then sent again. A new command (next key) is made only when there is none for that revision: none yet, a changed revision, or stored bytes that are not this stream's command, which are never sent and stay as they are. A reused entry counts `replays`, and its earlier outcome and answer go to the stream's notes. A recorded known refusal is marked in flight (`written`) before it is sent again. Journal validation now requires each Stop key to be `<stream>.stop.<n>`. |
| **MAC-CONTROL-01.** A lost, 503 or malformed reply followed by a 401/403 on the retry was returned as known refused. | For the three writes (registration, display source, Stop), once an attempt may have taken effect, a later typed refusal returns **unknown** and carries that refusal. Only an exactly corresponding 200 settles it in the call. A first-attempt refusal is still refused, and a stop before the first send is still not sent. A read (GET) changes nothing, so its refusal stays its answer. In the link:<br>- the registration shows "whether the stream was registered is not known";<br>- the display source shows "whether the display source was registered is not known"; a carried 403/404 still ends the capture as lost permission;<br>- a replay of a registration already known committed is never described as "not registered": a 403/404, also a carried one, ends the capture as lost permission;<br>- the Stop is journaled `unknown`, also when a recorded Stop is sent again after a restart; a carried 401 still renews the bearer and resends the same key and bytes. |

**Tests.** `CaptureLinkTests.swift` now has **23** XCTests (8 new), for **78** declared tests in
8 files. The new ones:
1. `testRecordFaultFencesEveryLaterRequest`: the record becomes unwritable as the registration, or
   the state read, is answered. Nothing follows, the child gets EOF, the gate stays open, no Stop
   goes out unwritten, and the next launch settles the stream.
2. `testReopenedStopReusesItsRecordedCommand`:
   - the same revision reuses key and bytes;
   - controls: a changed revision, foreign stored bytes, and a `written` entry;
   - a recorded refusal that is then taken;
   - a recorded command refused at once after `unknown`, `written` and `refused`;
   - a recorded refusal sent again whose answer is never recorded.
3. `testLaterRefusalKeepsAnEarlierControlDoubt`: for registration, Stop and source, each of lost
   then 401, 503 then 403, malformed 200 then 403 and another URL then 403 is unknown, with
   identical retry bytes and headers. Controls: first-attempt 403, lost then exact success, all
   lost, stopped before sending, and a read.
4. `testLostAnswerThenRefusalStaysUnknownInTheLink`: a committed Stop and a committed registration
   whose answers are lost and whose retries are refused.
5. `testStopAfterDoubtRenewsTheBearerAndKeepsTheDoubt`: lost then 401 renews, with the same key
   and bytes through a second child; a refusal of that resend stays unknown.
6. `testSourceInDoubtThenRefusedEndsTheCaptureWithoutClaimingItWasNotRegistered`. The doubt is a
   taken PUT answered with a 200 that does not correspond, or a 503; only the "all lost" variant
   drops connections.
7. `testServerEndInARegistrationReplayEndsTheCaptureDespiteARecordFault`.
8. `testReconnectReplayActsOnABelievedServerEndOrLostPermission`: after the child is lost, a
   replay answered withdrawn ends the capture with no further request, and a replay answered 403
   ends it as lost permission.

The tests in this file no longer index arrays directly after a count assertion, so a short array
is a failed assertion and not a trap that would end the whole run.

The damaged-record test has one more case (a Stop key of another stream). The test stand-in's
Stop now follows the released `command`: a committed key with the same bytes answers the current
state, and another revision is 409 `stale_revision`.

**Results (Linux reviewers' harness; none is macOS).** Logs are in
[`macos-app-parent-link/correction/`](macos-app-parent-link/correction/) with `SHA256SUMS`.

| Check | Result |
| --- | --- |
| Type-check, module with Darwin stubs and the test target | 0 errors, no warning in the changed files, no expression over 100 ms ([log](macos-app-parent-link/correction/linux-typecheck.txt)). |
| Link tests | **22/23 pass** ([log](macos-app-parent-link/correction/linux-link-tests.txt)). The one failure is still the corelibs redirect limitation. |
| Upload tests / whole suite | 8/8 and **74/78** ([log](macos-app-parent-link/correction/linux-all-tests.txt)); the other 3 failures are the known stub artefacts. |
| The 8 new tests and the damaged-record test on the `f625b48` sources | All 9 fail ([log](macos-app-parent-link/correction/baseline-f625b48-new-tests.txt)). |
| Mutations of the corrected source | 13 mutations, each listed with its file, line and before/after ([log](macos-app-parent-link/correction/mutations.txt)). 11 are caught. The two not caught alone are the two fences after a record fault: the fault check in the shared `usable` predicate, and the save guard after the registration. Each leaves the other in place. Removing both restores the `f625b48` behaviour and is caught (M13). |
| The lead's control probe (`prepare.py`, with only its paths and its `candidate` label substituted) on the corrected source | 6/6 pass: the three reproductions are now `unknown`, and the three controls are unchanged ([output](macos-app-parent-link/correction/lead-control-probe.json), [diff](macos-app-parent-link/correction/lead-control-probe-prepare.diff)). |
| The lead's link probe scenarios (fake launcher, in-memory transport), with corrected expectations | 3/3: the positive control is unchanged; after the fault only the registration POST is sent and the gate stays open; the reopened Stop goes under `probe-stream.stop.1` with the same body ([output](macos-app-parent-link/correction/lead-link-probe-results.json), [probe](macos-app-parent-link/correction/lead-link-probe-main.swift), [diff](macos-app-parent-link/correction/lead-link-probe-main.diff)). |
| Actual `desktop_local` probes | Rerun and unchanged: `unavailable` without a database, `invalid_startup` for the control, and Start → 7 stored → Stop over MemoryStore ([log](macos-app-parent-link/correction/linux-host-probes.txt)). |
| macOS build/test, real PostgreSQL, real Mac | **NOT_RUN / none.** |

**Review.** Workflow `wf_ec955dc8-510` reviewed the correction in three dimensions with
adversarial verification. It raised 8 findings, all confirmed and all fixed:
- a server end carried in a registration replay whose write failed did not end the capture;
- a recorded refusal sent again stayed "known not taken" while in flight;
- a reused entry kept the earlier answer's status and code;
- a 401 after a doubt no longer renewed the bearer for the Stop;
- a 403/404 after a doubt on the display source no longer ended the capture, and was worded as
  "not registered";
- two test gaps: the cross-restart doubt, and the other-URL doubt.

Recheck `wf_28312dc3-753` confirmed all 8 fixes and raised 7 more low or medium findings, all
fixed:
- a believed non-live registration replay ended the capture only when its write failed;
- a 403/404 for a replay of a committed registration was shown as "not registered";
- a test depended on a dropped PUT connection, which URLSession may replay on Darwin;
- tests indexed arrays after non-fatal count assertions;
- two stale statements in this record, an overstated index sentence, and mutations that were
  not described.

## Truthful storage status

The lead's source finding (the macOS analogue of Windows QA-WIN-05,
`handoff_e315d6df5277bb8e006e4d94af5dcfa5`; not a reproduced Mac GUI fault): the linked state
read "Storing while capturing." from the moment the display source answered, before any frame
was acknowledged. A batch being sent was not shown until its answer came, and frames not yet
answered were counted as "not known".

| Before | Now |
| --- | --- |
| Linked state: "Storing while capturing." | "Linked to the capture service." The state only means the stream is registered, read live and its source answered. |
| No counts line until something was counted. | The counts line is shown whenever the link is up: "N frame(s) confirmed stored, N awaiting an answer, N not known, N refused, N not sent yet." |
| `stored` | Unchanged: only frames in a batch with a verified ACK. |
| Frames of a batch being sent were counted "not known", and only after the answer. | They are `awaiting an answer`, published as soon as the send is recorded and before the batch's first request. An unanswered batch is never called "not stored". |
| A batch not taken for an expired bearer or a 401 stayed "not sent" while it was sent again. | Its new send is recorded first (`sending`), so it shows as awaiting an answer. If that record cannot be written, or the capture stopped, it stays "not sent" and nothing is sent. |
| Not known | Unchanged meaning: no believed answer, or cut off. It stays not known until an exact ACK for the same bytes and key. |
| A record fault while a send was being recorded was published before the counts were corrected. | The fault and the corrected counts are published once: a batch that was never sent is never shown as awaiting. |
| The linked state stayed shown while a lost child was being replaced, and until Stop's own status after the gate closed. | Replacing a child shows "Connecting.". Once the capture gate has closed, a count update shows "Stopping: nothing new is sent.". |
| "Not sent" was silent about originals already uploaded for a batch that was then not sent. | "Not sent" still counts frames whose batch the service did not accept. The originals accepted for such a batch are counted in the record (`acceptedOriginals`), and the final status says "N original file(s) of frames not sent were already accepted by the capture service". |

The wording and counts moved from the app target into `CaptureLinkStatus` in the library
(`summaryLine`, `countsLine`, `menuLine`), so the hosted XCTests cover the exact text. Retry,
idempotency, the record-fault fence, Stop, restart and the three corrected findings are unchanged.
`CaptureLink` takes the batch size as a parameter (default and maximum 20), used by the tests.

No status after Stop or a record fault shows the linked state. A batch in flight at Stop stays
"awaiting an answer" only until it is answered or cut off, then it is not known; the final status
has none awaiting. A batch that was not sent because of Stop or a record fault is never shown as
awaiting.

**Tests** (5 new in `CaptureLinkTests.swift`: 28 there, **83** declared in 8 files):
1. `testPendingFramesAreShownAtOnceAndStoredOnlyAfterTheirACK`: with two batches whose answers are
   held back, it checks:
   - nothing is confirmed while the first ACK is delayed;
   - the batch's frames are shown as awaiting before its first request;
   - a later batch awaits its own ACK after the earlier ones are confirmed;
   - the exact lines, and that no published status says "storing".
2. `testBatchWithoutABelievedAnswerStaysNotKnownUntilItsExactACK`: three attempts answered 503 (no
   believed answer) leave 7 not known and 0 stored; the held resend carries the same bytes and
   key; its exact ACK then counts 7. A batch that gets no answer at all is covered only by the
   Stop cut-off in the next test.
3. `testStopOrARecordFaultNeverShowsTheLinkAsUpAndEndsWithNothingAwaiting`:
   - a Stop while a batch awaits its answer publishes exactly stopping (7 awaiting), stopping
     (7 not known), stopped (7 not known);
   - a record fault at the first ACK keeps its 4 confirmed, sends nothing more, and publishes no
     later linked or awaiting status;
   - a record fault just before the next batch's send is recorded never shows that batch as
     awaiting.
4. `testResendIntentIsRecordedShownAndFenced`:
   - a batch refused 401 and sent again shows 7 awaiting, with the record at `sending`;
   - the same with the record unwritable after the new child is linked: no second batch request
     and no awaiting status;
   - a Stop between planning and sending: nothing is sent, nothing is shown as awaiting, and no
     later status shows the link as up.
5. `testOriginalsOfAnUnsentBatchAreReportedAsAlreadyAccepted`.

`testChildLossReconnectsWithoutConsentAndStopsOnce` also checks that the link shows "Connecting."
while the child is replaced.

**Results (Linux reviewers' harness; none is macOS).** Logs are in
[`macos-app-parent-link/status/`](macos-app-parent-link/status/) with `SHA256SUMS`.

| Check | Result |
| --- | --- |
| Type-check, module with Darwin stubs and the test target | 0 errors, no warning in the changed files ([log](macos-app-parent-link/status/linux-typecheck.txt)). |
| Link tests / whole suite | **27/28** and **79/83** ([link log](macos-app-parent-link/status/linux-link-tests.txt), [suite log](macos-app-parent-link/status/linux-all-tests.txt)). The failures are the same four as before: the corelibs redirect limitation and three stub artefacts. |
| Mutations | 14, each with file, line and before/after; all are caught ([log](macos-app-parent-link/status/mutations.txt)). They include the old wording, counting a sending batch as not known or as stored, no pending publication, and each fence around the resend. |
| Actual `desktop_local` probes | Rerun and unchanged ([log](macos-app-parent-link/status/linux-host-probes.txt)). |
| App target (`ContentView.swift`, `CompanionDesktopApp.swift`) | Source only: the text extension was removed from the app, and `CompanionDesktopApp.swift` now imports `DesktopCapture`. **Not type-checked anywhere.** |
| macOS build/test, real Mac UI | **NOT_RUN / none.** |

**Review.** Workflow `wf_161190f4-550` (code, and tests with the record, with adversarial
verification) raised 9 findings, all confirmed and all fixed: a fault published with frames still
"awaiting"; the linked state shown while a child was replaced; originals of an unsent batch;
untested resend-intent branches; and five record or evidence statements.

## Retained gaps and next action

- **Lead:** review the storage-status leaf and run proportional native checks. The app target
  changed in two files and is not type-checked here.
- **Not verified on a Mac:** screen permission, live UI, Start/Stop/Quit timing, ATS, the real
  PostgreSQL host and its lineage refusals, and sleep/logout. The app target was built by the
  hosted run at `fb891d6`; the storage-status change's app delta (two files) is not compiled or
  type-checked anywhere.
- **After a record fault** the server stream stays live until the record is writable again and
  the app is relaunched: no Stop is sent without a written witness.
- **Unverified on Darwin:** URLSession may itself replay a GET or PUT whose connection dropped
  before any response. That would hide the first attempt of the display-source PUT or an original
  PUT from this code, so a refusal of the replay would look like a first-attempt refusal. Linux
  corelibs does not do this; the hosted run cannot show it either without a dropped connection.
- **Revocation before a reconnect** usually surfaces as the host's `unavailable` at startup: the
  link then shows "not connected" and capture is not ended. Only a believed answer ends it.
- **Unchanged limits:** there is no AI and no enrollment. Native gaps are not sent. Server-side
  pins are fixed at 1/1. A stream whose registration may exist but whose state cannot be read is
  shown as an earlier unsettled stream. It is retried at each launch and at each Start of its
  lineage, and it blocks new registrations in that lineage until it is settled.
- The §7.1 macOS gate, real AI, the combined visible-display context, full acceptance and
  Notability import are all still open. This link stores frames only.
