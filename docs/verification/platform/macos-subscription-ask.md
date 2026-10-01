# macOS: ask ChatGPT about a selection through the user's subscription

Task: the lead's `handoff_d98adf0e2c88ebeb0bde9d50c30bd5cb` and its seam clarification
`handoff_b36e6a62cfb6b2e59a3ab3cd50f78a26` (existing P0-03/11). Baseline `1b7c905`, merged
normally into `team/ios` as `d4c2a8c`; `apps/macos` there equals the approved `30807f2`. The
released connector was read at main `871aabd`, `c9be907` and `cd9b0ef` (dependency mail
`handoff_578d3bb3…`, `handoff_48ecf142f05aa34aa7e3a57fb885adb6`,
`handoff_f95d4c08f5ea52ecd99ec5c50bba349f`, `handoff_8dd23989ac838e053ca7a1b610251ab1`). The Windows QA findings of `9abf587` (QA-SUB-02, 05, 06
and 07, mail `handoff_3e51ed9e8e80df874f924515e5098d62`) were checked against this consumer and
are covered below. The change is one commit on `d4c2a8c` (`a2fe30c`); main `cd9b0ef` is merged
normally right after it (`7ae84cd`).

**Correction MAC-SUB-LIB-01** (the lead's review of `a2fe30c`, mail
`handoff_bf09e0c95b1b43bd3b31fa2718625abd`): Stop or Cancel could not take back a request that was
still waiting in this app's own pipe writer, so the whole image line could reach the connector
after the local Stop. It is one more commit, on `27af57e` (main `8eac9fc` merged as `73d4f68`,
then the connector baseline `fca2a25` of mail `handoff_d462ea44d3c91e9e92015ba300f79393` merged as
`27af57e`); see "A request not yet with the connector" below. The later mails on the live
interface (`lc-subscription-live/1`, main `f35fae9`) are not consumed here.

**Lifetime correction** (the lead's review of `704894f`, mails
`handoff_722a9311da5df8092756438d3fc39b68` and `handoff_d7b3814c138daebc3868fae3248acce0`, review at
main `2693c44`): when a connector was lost, the link let go of it before it had ended, so Quit
could return, and a new Connect could start the next connector, while the lost one was still
being ended. It is one more commit on `704894f`; see "A connector that is still ending" below.

The user's decision “先接入官方订阅” (ADR 0003, R38, §3.8, G4) selects the existing ChatGPT
subscription through the official managed Codex App Server. This task is the Mac side of the
shared private connector interface of [ADR 0003](../../adr/0003-managed-subscription-ask.md).

**Scope.** Writes only `apps/macos/CompanionDesktop/**`, this record, its evidence folder and
its index entry. There is no dependency, contract, CI, shared-file or mobile change. This app has
no OAuth or provider code of its own: the connector and Codex own the login, the tokens and the
model call.

**Not done here, on purpose:** no sign-in, model call, paid API or account was used, and no
Codex was started. The connector module `services.worker.connectors.chatgpt_local` is the Backend
owner's. The tests run against an in-process stand-in or a stub script. Three Linux probes used the
released code of `fca2a25` (see Checks): one launched the real connector with a `codex_bin` its
launch gate does not admit, to see the unavailable state end to end; one ran the released
request validator and answer binder over the requests Swift makes; one ran the connector's real
stream code with a stand-in client while a request was cut off in the pipe.

## The one flow

| Step | Behaviour |
| --- | --- |
| Configuration | `~/Library/Application Support/CompanionDesktop/ask-connector.json`: `format` (`lc-macos-dev-ask-connector/v1`), `python`, `repository`, and optionally `state_dir` and `codex_bin`. No secret. It is read once, at app launch. Without it the UI says "Not set up on this Mac", a confirmed selection gets no card, and no `asks/` file is written; there is no stand-in. |
| Connector child | `<python> -m services.worker.connectors.chatgpt_local`, no other argv, cwd = the repository. No startup record and no READY line: the first `connection/read` is the handshake. Requests are JSON lines on a private stdin pipe held open for the child's life; answers and events are JSON lines on stdout. stderr is read and dropped, never shown or logged. |
| Environment | Minimal by allowlist: `PATH`, `HOME`, `USER`, `LOGNAME`, `TMPDIR`, `LANG`, `SHELL`, plus `PYTHONDONTWRITEBYTECODE=1` and, when configured, `LC_SUBSCRIPTION_STATE_DIR` and `LC_SUBSCRIPTION_CODEX_BIN`. No API key, provider, database or development-runtime variable is inherited. |
| When it starts | Only on the user's Connect (or Check Again). Nothing runs at app launch, and neither Sign In nor Submit starts a connector: after a connector was lost, a new one comes only from the user's own Connect. Quit ends the child with EOF (bounded, then SIGTERM, then SIGKILL of that pid only). Nothing is ever signed out. |
| Connection status | `connection/read` in its exact pinned shape: managed auth state and mode, plan, quota windows (or not known), and the model catalog with `image_input` and `default`. A model without its `image_input` field makes the answer "not understood"; it is never assumed to take images. Signed in with another mode is shown as not the subscription. "Signed in" is what Codex reports, not proof of an answer. A `connection/changed` event re-reads the connection, at most once a second however many events come (an engineering default). One read runs at a time: a change during a read makes it read once more, and the earlier answer is not believed. An automatic read never starts, ends or replaces a connector. |
| Connector unavailable | The connector answers `unavailable` when its launch gate does not admit the local Codex (it admits only the measured Codex 0.158.0 binaries: Linux x86_64 and macOS arm64) or it cannot start it. The section then says "The connector reports the ChatGPT connection as unavailable: nothing can be asked." and stays so after the connector ends. There is no bypass and no other sign-in path. |
| Check Again | Reads the connection again. When the last read gave no connection (the connector refused, was not understood or did not answer), Check Again first ends that connector, if it still runs, and starts a new one. A connector that keeps a failure while it runs (the one of `c9be907` did after its Codex client failed; `cd9b0ef` ends itself instead) would answer every call with it, so asking the same one again could never show a new state. Such a kept failure is shown as "the connector could not report the connection; Check Again starts it again". A connector is never replaced while a question is on its way, and a question is never sent again by this. A sign-in pending on the replaced connector ends with it (it could not complete there) and can be started again. Each launch has its own number, so the exit of the replaced connector is never taken as the exit of the new one. |
| Sign-in | "Sign In with ChatGPT…" needs a running connector (it starts none), calls `connection/login/start` and opens `auth_url` in the browser: only after that click, and only if it is https, has no user information, and its host is exactly `openai.com` or `chatgpt.com` or a subdomain. The URL is never in a status, a log or a file. Only one sign-in is started: a second click gets the pending page again. `connection/login/completed` for that login re-reads the connection, or shows one of two fixed lines ("the sign-in was cancelled", "the sign-in did not complete"); the connector's own error text is never shown. A completion for another login, or not in the pinned shape, is ignored. A completion the connector writes right behind its answer to the start is not lost, and a connector that ends right then leaves nothing pending and gets no page opened. "Cancel Sign-In" cancels only this product's pending login; if the connector does not answer the cancel with `{}`, the section says the cancel was not confirmed and reads the connection again. A sign-in start the connector refuses is said in its own fixed words ("the sign-in could not be started", with "the connector is busy…" for `busy`), never with a question's words, and the connection is read again. A pending sign-in is never forgotten without the connector's word: only its completion, the user's Cancel or the end of that connector ends it. A question is not sent while a sign-in is pending. |
| Selection | Unchanged ASK: drag a region, Finish. The previous mode (WRITE or NAV) is back at once. At Finish the editable ink document is frozen as exact bytes on the main thread, and the selection's card opens. Nothing is sent. |
| Image and context | Fixed at Finish and written once under `<capture session>/asks/`:<br>- `asks/<card>.png`: the region of the retained frame the selection was pinned to, cropped without scaling. When this capture excludes this app's windows, the strokes visible at the selection's ink revision are drawn over it (erased or undone ink is not); otherwise nothing is drawn, because the pixels may already hold it.<br>- `asks/<card>.ink.json`: the frozen editable ink, always kept.<br>`ink_revision` is the selection's revision. `ink_sha256` is that file's SHA-256 when the frame is ink-free (ink drawn, or none visible). When the capture did not exclude this app it is null: a known revision with no hash, which under ADR 0003 records that the editable original is not bound to those pixels. The card says the same in words: "with the ink of revision N drawn over it", "with no ink visible then", or "whether these pixels hold the ink is not known".<br>The raw frame is re-checked against its recorded SHA-256 and only read. |
| Request | Exactly the ADR's `request`: `request_id`, `question`, `assistance`, `image {png_base64, sha256, width, height}` and `context`. `display.id` is the display's number as text (the connector admits only a text identifier). `region_dip` is display-local points clamped to the display, and `display.bounds` the global bounds (the origin may be negative). `region_px` follows the ADR's rule on exactly those numbers (the frame's size over the display's size; the start rounded down, the end rounded up, within the frame), the same arithmetic the connector repeats; the image is cropped to it, so the PNG has exactly its size. `source_url`, `source_version`, `media_position` and `frame_captured_at` are explicit nulls. Limits: question 4,000 code points (counted like the connector counts them), PNG 8 MiB, 16 million pixels, request line under 12 MiB, identifiers at most 128 code points. |
| Submit | The only way a request leaves. The card needs the user's own question and the help level they chose (a hint by default; an explanation; the full solution). The model is the catalog default listed as taking images, or the listed one the user picked; a model that was asked for is never replaced. The request (without the image bytes) is written to `asks/<request>.request.json` before it is sent. One question at a time. Without a running, signed-in connector a Submit sends nothing and starts nothing. A question refused before it is sent ("not sent: …") leaves an answer already on the card in place. |
| Answer | Put on the card it was asked from, only while that card still waits for exactly that request, and only if `kind` is `generated_assistance`, `auth_mode` is `chatgpt`, the text is at most 32,000 code points, and the answer's `provenance` equals the kept request in full (every field, including nulls). The card shows the question and help level that answer was asked with, the answer as plain text (never run or rendered as markup), and a line that it is generated and can be wrong. The outcome is written to `asks/<request>.response.json`, apart from the originals. That record says the answer was put on the card; whether a window displayed it is not recorded. If the outcome cannot be written, the card says so. |
| A request not yet with the connector | A request line counts as delivered only when its last byte, the newline, has been written; the connector refuses a line without it (`parse_line`), also at EOF. Cancel, Close, a new selection, Stop and Quit take the line back in the same step as the fence, and taking it back and writing its last byte exclude each other:<br>- still waiting to be written: it is dropped, the pipe is untouched, and the same connector goes on;<br>- written in part: it is never completed, nothing may follow it into the pipe, and that connector is ended (EOF, bounded), because its pipe can carry nothing more. No connector is started in its place; the section says why and that Connect starts one.<br>Either way no `ask/cancel` is sent (there is nothing to interrupt), the card says "it had not reached the connector, so nothing was sent to the service", and the record has `delivered_to_connector: false` and `interruption_uncertain: false`. A request the connector does not take in time, with no Cancel, is said as "not sent" (known), not as an unknown outcome. Ending the child never waits for a write that cannot finish. |
| Cancel | For a request already delivered whole: fences the card at once, in the same step, then sends `ask/cancel`. A late answer is never shown or kept as an answer, also when another question was submitted from the same card meanwhile. The interruption is recorded as certain only when the connector answers exactly `{cancelled: true, uncertain: false}`. For any other answer, or none, the card says the service may still have answered and used quota, and the record keeps `connector_cancelled` (the connector's word, or null) and `interruption_uncertain: true`. |
| New selection | A question on its way from the earlier card is fenced and the new card is installed in the same step, before the connector is asked anything. A Submit made right then carries the new selection. The old answer never reaches the new card. |
| Close | Closing a card with a question on its way fences it the same way. Cancel on a card with nothing on its way closes it. |
| Capture stop | Stop, stream errors, sleep and Quit tell the link the capture session stopped: a question on its way is fenced, `session/stop` is sent once, and nothing more can be submitted from that capture. An answer already shown stays readable. If the connector does not answer `session/stop` with `{}`, the section says the stop was not confirmed by it; this app's own fence does not depend on that. |
| A connector that is still ending | A connector that is lost (it ended, wrote something that is not its protocol, or refused a cut-off part) or replaced by Check Again is ended with EOF, a bounded wait, then SIGTERM and SIGKILL. The link keeps hold of every such connector until it has ended. Quit returns only when all of them have ended, so the app never exits with its own kill still to come. A new Connect starts the next connector only after they have ended: two connectors never run side by side. Nothing is started or asked again by this. |
| Quit | A question on its way is fenced and its record written before the connector child is ended. A fence still waiting for the connector ends with the child, and its record is written before Quit continues. A connector that Check Again is replacing at that moment is ended before Quit continues, and no connector is started once the app is closing. |
| Connector loss or no answer | The card says whether the question was answered is not known. Nothing is retried or asked again by itself. The connector of `cd9b0ef` ends itself when its Codex client fails for good, without a last answer to the question on its way: that is this case. A line that is not the connector's protocol ends the child. After a line over 256 KiB the child is reported gone at once, nothing more it writes is passed on, and it is ended. |
| Errors | The connector's closed codes map to fixed words. Its own messages are never shown. A question refused as `unauthenticated`, `quota`, `failed` or `unavailable` re-reads the connection, and so does an interruption the connector could not confirm, so the section does not go on saying "signed in" when that is no longer known. |

Engineering defaults (not user choices): 30 s per connection call, 180 s for an answer, 30 s to
hand a request to the child, 8 s for the child to end after EOF.

## What changed in the app

- New library files: `AskWire.swift`, `AskSelection.swift`, `AskChild.swift`, `AskLink.swift`.
- `InkComposition.swift`: `render` can draw over a region of a frame (the whole-frame call is
  unchanged in behaviour).
- New app file `AskController.swift`: the connection section in the main window and the floating
  card panel.
- `InkController.finishAsk` freezes the ink and opens the card. `CaptureController` tells the link
  when a capture stops. Quit ends the connector child.
- The capture-storage caption no longer says "AI: not connected."; the new section shows the
  actual connection.

## Setup and launch path (development only)

Nothing here was run on a Mac.
1. A checkout of this repository at main `fca2a25` or later (it holds
   `services/worker/connectors/chatgpt_local`) with its pinned environment: `uv sync`, then
   `<repo>/.venv/bin/python` (Python 3.12 or later with `jsonschema`). A plain `python3` can
   connect and sign in, but every question is then refused as unavailable, because the
   connector's request check needs that environment.
2. The official Codex CLI 0.158.0 for macOS arm64, exactly the binary the connector's launch gate
   admits (SHA-256 pinned in `services/worker/connectors/chatgpt_launch.py`). Any other binary,
   and an Intel Mac, get the unavailable state.
3. Write `~/Library/Application Support/CompanionDesktop/ask-connector.json`:
   ```json
   {"format":"lc-macos-dev-ask-connector/v1","python":"/ABS/repo/.venv/bin/python","repository":"/ABS/repo","codex_bin":"/ABS/codex"}
   ```
   `codex_bin` is needed in practice: without it the connector looks for `codex` on the `PATH`
   the app passes on, and an app opened from Finder has only the system `PATH`. `state_dir`
   (absolute) is optional; the connector's default is its own product state directory, never
   another Codex client's.
4. Open the app. In "Ask ChatGPT about a selection", press **Connect**, then **Sign In with
   ChatGPT…** if needed, and complete the sign-in on the official page.
5. Start capture, choose ASK, drag a region, press Finish. Type a question on the card, choose the
   help level, and press **Submit**.
6. To disable: quit the app, remove `ask-connector.json`, reopen. No card opens and nothing is
   written under `asks/` then.

## Checks and results

| Level | State |
| --- | --- |
| New tests | `Tests/DesktopCaptureTests/AskLinkTests.swift`: **17** XCTests; **100** declared in 9 files. |
| What they cover | 1. The envelope: exact request keys and nulls, the display named by text, strict answers (14 refusals, `kind` and code-point length among them), line forms, closed error codes each with its own fixed words, identifiers, sign-in URL rules with lookalike hosts and the length bound, and the request limits at their edges (4,000 code points, 8 MiB, 16 million pixels, the 12 MiB line).<br>2. Four requests exactly as sent, with their PNG header (8-bit, RGB or RGBA, not interlaced); kept as a fixture for the checker below.<br>3. The selection: frozen ink bytes and hash, the exact region, a fractional region clamped at the display's edge, the pixel rule on its own, write-once files, no made-up frame time, the three compositions and what each binds, erased ink left out, refusals.<br>4. Pixels: the ink is drawn at its place in the region, down and across.<br>5. Connection and sign-in status: another mode, an unknown quota, a model without its image field, a lookalike sign-in host, the URL in no status, fixed words for a failed or cancelled sign-in, a completion for another login, one sign-in for two clicks, a completion right behind the start, a connector ending right behind the start, and no card without a configuration.<br>6. `connection/changed`, the connector's `unavailable` (also after it ends by itself), a kept failure and its replacement by Check Again (never with a question on its way), a sign-in pending on a replaced connector, Quit during a replacement, a refused question re-reading the connection, a refused sign-in start and an unconfirmed cancel in their own words, a storm of change events, a silent connector, and one re-read for several changes.<br>7. Submit: nothing is sent before it, the request is on disk when the connector receives it, the default model with two image models listed, the answer on the same card, a refused resubmit leaving the answer, answers that do not belong, an outcome that cannot be kept, `unauthenticated`, Submit starting no connector (also after one was lost with a question on its way), and the three ink wordings.<br>8. Local refusals send nothing, also while a sign-in is pending.<br>9. Cancel, a new selection and capture stop suppress later answers; an unconfirmed `session/stop`.<br>10. A late answer after a resubmit, Close and Quit with a question on its way, `ask/cancel` answers that are not a confirmed interruption, a new selection while the connector is silent, and Quit while a stop is still settling.<br>11. Connector loss, timeout and a non-protocol line.<br>12. The real child process with a stub script: argv, FIFO, minimal environment, a 3 MiB request, EOF, an over-long line followed by a late line, a child that ignores EOF and SIGTERM, and six replacements of a real child by Check Again.<br>13. The configuration file.<br>14. A request held in the writer (in-process stand-in with one serial writer): Cancel, Stop, a new selection, Close and Quit take it back; the connector never gets it or a cancel for it after the writer runs again; the same connector answers the next question; a request written in part ends that connector (which, like the real one, refuses the part in a line of its own before it ends), the section says why, nothing is started until Connect, the next question is answered after it, and that new connector's own later end is said as its own; a request not taken in time is "not sent"; a Submit while the app is closing sends nothing; a take-back that comes while the last byte is being written waits and learns the line was delivered.<br>15. The same with real processes and pipes: a child that does not read (and one that reads slowly) while a 2 MiB line, then a selected image of about 1 MiB, is in the pipe part way; taken back, the child gets a part with no newline and nothing behind it; a line taken back before its first byte leaves the large line in front and a later line intact; ending a child does not wait for a blocked write; Stop and Cancel through the whole link; Connect recovers; the clean path delivers the large request whole, once, and a Cancel after that delivery cannot take it back: `ask/cancel` follows and the outcome is kept as not known.<br>16. A connector that is still ending (the stand-in's child takes a second to end): Quit right after a loss, and right after a cancelled request that was written in part, returns only once that connector has ended; a Connect right after a loss starts the next connector only then, also for two Connects at once; Quit while that Connect waits starts nothing.<br>17. The same with a real process that refuses the cut-off part, ignores SIGTERM and lingers: at Quit's return the process is gone, within the bound; a Connect made while it is still alive starts the next process only after it is gone. |
| Swift tests on macOS | **NOT_RUN.** The lead runs the hosted macOS build/test. |
| Linux type-check (Swift 6.3.3, Darwin stub modules; not a macOS compile) | The DesktopCapture module builds against the stubs and the test target type-checks: 0 errors, no warning in the new files, no expression over 100 ms ([type-check](macos-subscription-ask/linux-typecheck.txt), [module](macos-subscription-ask/linux-module-build.txt)). |
| App target (`AskController.swift` and four edited files) | **Not type-checked anywhere.** A syntax-only parse on Linux found no error, and a reviewer read it against the library's API. |
| Linux interpreter run (functional Apple stubs) | **ASK tests: 16/17** ([log](macos-subscription-ask/linux-ask-tests.txt)). The one failure is the pixel test: the stub does not rasterize, as for the existing ink composition test. **Whole suite: 95/100** ([log](macos-subscription-ask/linux-all-tests.txt)); the other 4 failures are the known Linux-only ones. |
| Mutations (Linux harness copies, never the worktree) | **77 of 77 caught**, each by the one test meant for it ([results](macos-subscription-ask/linux-mutations.txt), [runner](macos-subscription-ask/linux-mutations.py)). They include every gap the reviews found. For the lifetime correction the whole list was not run again, as agreed: the four new mutants and the five whose code changed (M46, M50, M53, M54, M56) were run at this commit; the other 68 results are those measured at `704894f`, and all 77 patterns were checked to still apply to the final sources. |
| Released request validator and answer binder (Linux) | New owner checker [`checks/validate_ask_request.py`](../../../apps/macos/CompanionDesktop/checks/validate_ask_request.py): it runs `prepare_subscription_ask` and `bind_subscription_response` of `fca2a25` over each `ask/start` line Swift made, with 10 negative controls a line. On Linux: **4 requests, 72 checks, PASS**, and the app's own answer check accepted what the released binder returned for each of them ([log](macos-subscription-ask/linux-released-validator-probe.txt)). The PNG of each request had to be replaced by a real PNG first ([helper](macos-subscription-ask/linux_real_png_fixture.py)): the Linux stubs do not write real PNG files. So ImageIO's own PNG has **not** met the validator yet. |
| Real connector process (Linux, no Codex) | The production `ProcessAskLauncher` and `AskLink` launched `python -m services.worker.connectors.chatgpt_local` from main `fca2a25` with a stub `codex_bin`. The connector answered the first `connection/read` with `unavailable` and ended. The status was "unavailable" both times it was tried, the sign-in gave no page, a Submit sent nothing, and the connector created no state directory ([log](macos-subscription-ask/linux-real-connector-probe.txt), [probe source](macos-subscription-ask/probe-real-connector.swift)). This is the refusal path only. |
| A cut-off request and the real connector stream (Linux, no Codex) | The production launcher and link against this branch's real connector stream code (`fca2a25`: `main`, `_Pipes`, `run_stream`, `parse_line`, the bridge) with only its Codex client replaced by a stand-in. The connector was stopped while a selection of about 1 MiB was submitted, then Cancel (and, in a second round, Stop), then it ran again. Both times it was given a 65,536-byte part without a newline, refused it in a line of its own, handled no `ask/start`, `ask/cancel` or `session/stop`, and ended; the card and record say not delivered, and the section says why. A control without the stop shows a delivered request being handled ([log](macos-subscription-ask/linux-cutoff-real-connector-probe.txt), [helper](macos-subscription-ask/probe-real-bridge-fake-client.py)). |
| The lead's two Quit probes (Linux) | `ZQuitReview.swift` and `ZRealQuitReview.swift` from the lead's review of `704894f`, unmodified, against the corrected sources: both pass. In process, Quit returned after 1.5 s with the connector ended (before: 0.00005 s, not ended). With the real process, Quit returned after 2.16 s with the process gone (before: 0.00005 s, alive) ([log](macos-subscription-ask/linux-lead-quit-probes.txt)). |
| Reviews | Three internal review rounds, each finding verified before it was kept: 29, 15 and 6 confirmed findings (the last round on the fixes only; 4 distinct), all fixed in this change. The second found that `display.id` was sent as a number, which the released connector refuses for every question; the checker above exists so that this kind of mismatch is caught by a check, not by reading. The third found that a replaced connector's exit could be taken as the new one's. The third round's fixes, and three more made after reading the Windows QA findings, were not reviewed again; they are covered by tests and mutations. The lead's own review of `a2fe30c` then found MAC-SUB-LIB-01, which those rounds had missed: the stand-in's `send` delivered at once, so no test held a request in the writer. The correction had one more internal round (5 confirmed findings: two wordings of the status after a cut-off, three test gaps), all fixed; a reviewer also raced 360 take-backs against the real writer on Linux with no violation. The lead's review of `704894f` then found that Quit and Connect did not wait for a connector that was still being ended, which the internal round had not looked at; that fix had no further internal review round and rests on its tests, mutants and the lead's own probes. |
| Codex, sign-in, model answer, quota | **None.** |
| Real Mac: panel focus and typing, browser hand-off, capture, ink | **None.** |

Not covered by a test, stated so: the ink file's write failing after the PNG was written (the PNG
is then removed), the write to a pipe racing its close, the selection's own 16-million-pixel
refusal (the request's same limit is tested and refuses before anything is sent), and the guard
that keeps a region's end inside the display against a rounding step (no input was found that
needs it).

The logs in the evidence folder are the raw output with trailing whitespace removed;
`SHA256SUMS` covers them as committed.

**For the lead's hosted macOS run** (one line each, like the other fixture checkers): set
`COMPANION_DESKTOP_ASK_FIXTURE_DIR="$ask_fixture"` (a new directory) for `swift test`, then run
`.venv/bin/python apps/macos/CompanionDesktop/checks/validate_ask_request.py "$ask_fixture"`. That
is the first time the real ImageIO PNG meets the released validator.

## Limits and next action

- **Lead:** integrate and run the existing macOS check workflow on the exact candidate. The app
  target has new SwiftUI/AppKit code that only that build can compile.
- **What cannot be taken back.** A request whose last byte is written is with the connector, also
  while it still sits unread in the pipe: this app cannot remove bytes from a pipe. For those,
  `ask/cancel` follows in the same pipe and the connector's own rule decides; the outcome is said
  as the connector reports it, or as not known. That a line without its newline is never acted on
  is the connector's rule (`parse_line`, unchanged at `fca2a25`), not something this app can
  enforce.
- **Test stand-ins left running.** Six `python-flood` stand-in shells from mutation runs of the
  first delivery (the mutant that removes the kill of a child ignoring EOF and SIGTERM) had
  stayed alive for hours. They were ended by their exact PIDs after their command lines were
  checked. The stand-in scripts now end by themselves (40 s and 60 s bounds), so a run that is
  cut short, or that mutant, leaves nothing behind; after rerunning that mutant no stand-in was
  left. Nothing of the product is involved: the app's own child is ended by EOF, SIGTERM and
  SIGKILL as before.
- **Interface:** built against ADR 0003 and the connector as released at `fca2a25`. Against the
  real connector process only the refusal path ran (Linux, no Codex). The request and answer
  shapes ran against the released validator and binder with a substituted PNG. A successful
  `connection/read`, the sign-in, a question and an answer never ran through the real connector
  from this app.
- **The PNG that ImageIO writes** is expected to be 8-bit RGB or RGBA, not interlaced (a test
  asserts its header on macOS), but it has not been checked by the released validator; the
  hosted run with the checker above is that check.
- **Display on screen is not recorded.** The response record says the answer was put on the card.
  Nothing records that a window showed it or that the learner read it.
- **`frame_captured_at` is always null on the Mac.** The retained records keep host-clock times and
  one wall anchor; a wall time for a frame would be an estimate.
- **The image is a frozen region of the last kept frame**, not a live observation. When the page
  changed after that frame and no new frame was kept yet, the image shows the earlier pixels.
- **Assistance** is the user's explicit choice per question. Disclosure limits for a "let me try"
  scope (§7.7, R53) are not enforced here; this slice has no teaching state.
- **Not acceptance:** this is selected-image ASK only. Continuous screen understanding, audio,
  physical pen, Notability, real inference and an interactive Mac all stay open.
