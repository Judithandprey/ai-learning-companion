# Windows app: the live companion (whole-display AI session, circle as focus, movable surfaces, Talk)

Lead task `handoff_0dde292d` ("USER live Windows implementation priority"), with its later amendments
(`handoff_2bdc81a5`, `handoff_d405375e`, `handoff_bae00358`, `handoff_06a2040a`, `handoff_ac35994a`,
`handoff_e3b27dde`, `handoff_a422b178`, `handoff_852e41b7`, `handoff_b94b00e9`, `handoff_ff88e669`,
`handoff_3fbf3911`, `handoff_d9ffd796`). The design is
`docs/adr/0004-live-desktop-companion.md`; the executable contract is `packages/contracts/live_companion`
(`lc-subscription-live/1`); the transport is `services/worker/connectors/chatgpt_live.py`; Learning's seam is
`services/learning/live_session.py`. All four were read with `git show` at `origin/main` `79f7ab1` and are unchanged
at `bf54ab2` (`git diff --stat 79f7ab1 bf54ab2` over those paths is empty). The transport's later correction
(`b08d484`, verified by the lead at `fca2a25`) was read at `fca2a25`; from there to `07c9ebd` the same paths are
unchanged again. Requirements read at `79f7ab1`: §7.1, §7.2, §7.3 of `docs/requirements.en.md`, and `docs/tasks.md`
"Current runnable delivery" (its Web row is unchanged at `07c9ebd`).

The written paths are `apps/windows/**` and `docs/verification/web/**`. No shared, contract, service, dependency or
root change.

**Status: source, built and tested on Linux against a synthetic connector, the released bridge with a stand-in
provider, a fake display and a stand-in voice. The app was not run on Windows, on a display, with an account, with a
microphone or with any audio output in this work. No real AI response, no real screen and no sound is part of this
evidence.** What that leaves open is listed
under "Not verified" below; none of it is claimed.

## What the user gets

### One AI session per Start, within bounds the user sets

The control window's "Display to share" section has an "AI observation of this display" box (only with the
subscription configured):

- a tick box, **"Start also lets ChatGPT observe this whole display, continuously, within these bounds"**. It is
  ticked by default once the subscription is checked and signed in with a model that takes pictures; else it is off,
  with why. The Start button says what it will do: "Start: capture, and let ChatGPT observe this display" or
  "Start: capture only (no AI)";
- the session's own bounds: **requests** (1 to 100), **minutes** (1 to 60) and the **least seconds between two
  unattended looks** (1 to 60). They start at 60 requests, 30 minutes, 30 seconds: an engineering default the user
  changes, not a spending decision and not the QA preset. A value outside the envelope's limits is refused with why;
  nothing is clamped;
- the text says these are the session's own bounds, not ChatGPT's quota; that the last fifth of the requests is kept
  for the user's own circles and questions; that one session lasts an hour and 100 requests at most in this version
  and is never started again by the app; and that speaking to the AI and the lesson's sound are not connected.

While the capture runs, a line under "Capture" says the session's state: starting; observing (model, requests used
and left, the reserve, minutes left, when ChatGPT last completed a look and of which frame, the newest look that was
not made and why); looking only when the user circles or asks (the reserve is all that is left, or the capture
keeps no further frame on this device); every request used; or stopped, with the reason. The time left is said anew
every second. **Stop the AI (keep capturing)** ends the session alone; **Start the AI** starts a new
session in the same capture (after a failure, after its end, or when its requests are used). Nothing else starts
one. The overlay's toolbar says the same in one sentence.

The "ChatGPT subscription" section shows the account as ChatGPT states it, **bucket by bucket**: each window's used
percent, length and reset time; credits as flags and the exact balance text ("credits as ChatGPT states it (not an
amount of money)"); the reached reason; a spend control; the user's own limit. What is not reported is said as not
reported or not known, never as zero; one bucket's credits are never shown for another; "included usage is NOT
allowed now" is said with "this alone says nothing about credits". This is always labelled as the account's usage,
apart from the session's own bounds, and as what ChatGPT **reported at the time it was read** (that time is shown):
it is not re-read by itself while a session runs.

### What ChatGPT is given

- **Looks.** A whole-display frame the app keeps as a material step (the existing retention: a real change of the
  screen or of the ink, never every frame) is also offered to ChatGPT as an *observation*: the whole picture (the
  composed one when there is ink), no question, no answer asked for. One request is out at a time; the newest frame
  waits and an older one still waiting becomes a gap (`coalesced`); two looks are never closer than the least time
  set; looks never use the last fifth of the requests (they then stop, said as that, and the frames after become
  `budget` gaps). A frame taken before the AI was started is not looked at. When the capture keeps no further frame
  on this device (its retention is full), the looks stop and that is said, also in a session started afterwards:
  only a kept frame is ever given to ChatGPT by itself. What ChatGPT noted is kept for the conversation of later
  requests and in `live.jsonl`. **It is never shown as help and never opens a card.**
- **A circle (ASK).** Completing a circle keeps the whole composed frame, the circle as a rectangle of that frame
  (DIP and pixels, by the frame's actual size over the display's), and the exact ink document. With the session
  running, **one request goes out at once**: trigger `focus`, a **hint** and nothing more, no words of the user's,
  the whole frame as the picture, the circle as its focus, the recent conversation and the gaps. No second press and
  no typed question. The other radios (Explain, Full solution) apply to a follow-up only: a circle alone never asks
  for more than a hint.
- **A follow-up.** The card's form is optional: the user's own words, the chosen amount of help, Send. A fresh whole
  frame goes with it. If that frame is the same picture and ink as the circle's and nothing newer was sent since, it
  **is** that frame and the circle is still its focus. Otherwise it is a later frame: the focus is null, and one
  entry of the conversation names the earlier focus (its frame, picture hash and rectangle) and says that its pixels
  are not attached and that nothing shows the provider kept them. Old coordinates are never put on a newer frame.
  (A card whose circle never went out in the running session, for example made before the AI was started, sends
  its circle with the follow-up when the picture is unchanged, worked out anew for that frame.) The picture of a
  follow-up is kept on disk only once the request can be sent.
- Nothing else. No audio route is asked for (`microphone: false`, `system_audio: false`), and a voice follow-up
  cannot be made in this version (said on the card and in the control window).

### What comes back, and when it is shown

A response is shown only on the card of the selection and request it belongs to, and only while the session it was
asked in is still this capture's running one, the capture is not ending, and the request is still the card's live
one. Before that, the transport reads it as bound to the whole turn that was sent (session, epoch, frame, picture
hash, focus, user words, conversation, gaps, the help and presentation asked for, the session's model). Anything
else is said as not shown. The card says which picture a response is about (its time), and, for a follow-up on a
later frame, that the circle was named without its pixels.

A failure that is not simply "not taken" (not signed in, the allowance, a rate limit, an overload, the connector, an
unconfirmed interruption, an answer that was not bound, a request whose fate is not known) **ends the session with
its own reason**; nothing is sent again by itself, on any later frame, and only the user starts the AI again. A
request merely not taken (busy, replaced by a newer one, over the session's own bound for looks) does not. A refusal
says whether the request had reached ChatGPT, had not, or that this is not known. A session whose requests are all
used is said as that and keeps its last response on the card; it is ended when the user starts the next one.

### Movable toolbar and response card; Talk

- The toolbar and the card each have a visible handle. A drag (or the arrow keys; Home puts it back) moves the
  surface and nothing else, in NAV, WRITE and ASK; a place is kept per display and restored inside whatever the work
  area is then. (Delivered as `28f0504`, integrated as `073c96d`.)
- **Talk is in the toolbar**, in reach before any card: Talk, Mute, slower / rate / faster, Stop reading. Silent is
  the default at every Start. A response is read aloud only if Talk was on (and not muted) **when it was asked for**;
  its text is always shown, and the card's status says what is being read. This moved from the card to the toolbar
  in this work, so the toolbar is wider than the one the lead's hidden-Chromium run measured at `28f0504`.
- **No voice is connected in this build.** With Talk on the toolbar and the card say so, and nothing is played. See
  "The voice" below.

## How it works

| Part | File | What it does |
| --- | --- | --- |
| Envelope, pure | `src/shared/live.ts` | Turn, focus mapping, follow-up carrying, bounded conversation, quota and result reading, error codes |
| Transport | `src/main/subscription.ts` | The connector child in `lc-subscription-live/1`: account, sign-in, `startSession`, `turn`, `interrupt`, `stopSession` |
| Session | `src/main/main.ts` ("the AI's session") | Start, bounds, looks, gaps, conversation, end reasons, `live.jsonl` |
| Circle and follow-up | `src/main/main.ts` ("ASK") | Whole frame kept, focus worked out here, record, the request, the output check |
| Voice ownership | `src/main/main.ts` ("a response read aloud"), `src/shared/voice.ts` | Per-piece checks, pieces, the voice of each piece |
| Overlay | `src/renderer/overlay.*`, `src/preload/overlay.cjs` | Card, toolbar state, Talk |
| Control window | `src/renderer/control.*`, `src/preload/control.cjs` | Bounds, session line, quota |

The old selected-image envelope (`lc-subscription-ask/1`) is no longer spoken by this app: a connector speaks one
version from its first line, and this app speaks only `lc-subscription-live/1`. `src/shared/subscription-ask.ts` is
removed. The earlier released package is another directory and is not touched by this source.

**On disk**, under `<userData>/captures/<capture session>/`:

- `asks/<sha256>.png`: each whole frame a circle or a later-frame follow-up was about; `ink/<sha256>.json`: the exact
  ink document;
- `asks/<selection>.json`, format `lc-windows-live-focus/v1`: the selection (`sample_seq`, `image`, `context` = the
  whole display, `focus`, `ink_original`) and each request: `trigger`, `question` (null for the circle's own),
  `assistance`, `asked_as`, `model`, `live_session_id`, `frame` (`frame_seq`, `sample_seq`, `captured_at`, `image`,
  `ink_original`, `focus`: `on_this_frame` / `on_an_earlier_frame` / `none`), `submitted_at`, `ended_at`, `outcome`,
  `submission`, `shown`, `presentation`, `spoken`, `spoken_pieces`. Written before a request is sent; a write that
  fails is said, held, and written again at Save, when the card goes and when the session ends (unchanged);
- `live.jsonl`: one line per event of the AI's session: `started` / `not_started`, `look`, `looked` (with the text
  ChatGPT noted) / `not_looked`, `gap`, `looks_stopped`, `ended` (with the requests that were still out), `settled`
  (how each of those came to an end). A line that cannot be written is counted per capture and said, with the
  capture's end too; a line torn by a failed write is cut back before the next one is added.

### The voice

The main process owns the voice and everything it is handed. The overlay asks only for "piece N of the current
response" (`lc:say`), sets Talk and Mute (`lc:talk`) and stops (`lc:hush`): never text, a rate, a language or an
output. Before every piece the main process checks again that the asker is the current session's overlay, the
capture is not ending, the AI session the response was asked in is still running, the answer is the current
selection's last one, was asked for as spoken, was reported shown, and Talk is on and not muted. Pieces go in order
only; one that ends after its reading was stopped starts nothing; a piece that is not said to its end stops the
voice. The main process cuts its own copy of the answer (`speechPieces`) and chooses the language's voice of each
piece (`speechCultures`). The app ends the voice before it quits, within 5 s, whatever the voice's end comes to, and
still waits for the connector's own end.

What is recorded as read aloud (`spoken`) is what the voice itself reported, never a call that was only attempted:
`attempted` (handed to the voice; no piece reported said, so whether anything was played is not known),
`interrupted` (some pieces reported said), `finished` (all), with `spoken_pieces`. A voice that only synthesizes
records nothing.

**No voice is connected** (`connectVoice` has no product caller). The reviewed System.Speech helper
(`NativeSpeech.cs` / `NativeSpeech.exe` / `native-voice.mjs`, operator's candidate) is **not in this source**: this
role's permission layer declined to copy code and a compiled executable from outside the repository into it, and
that was not worked around. What the adoption needs is listed under "Next" below.

## Corrections folded in

| Source | Item | What was done |
| --- | --- | --- |
| Operator's hidden-Chromium run-03 | Response outside the visible card; 72×671 toolbar | Fixed in `28f0504` (verified by the lead's run-05, 15/15) |
| Lead `handoff_a422b178` (P3) | A second torn preferences file overwrote the first one set aside | Each is set aside under the next free name (`.unreadable`, `-2` … `-8`); with none free the torn file is left untouched and said. A name is free only if nothing at all has it (`lstat`) |
| Lead `handoff_b94b00e9` (1) | `spoken: started` before the voice was asked; a throwing voice left `interrupted` | `attempted` until the voice reports a piece said; see "The voice" |
| Lead `handoff_b94b00e9` (2) | `will-quit` let one rejection quit before the others had ended | `Promise.allSettled`; the voice's end bounded and guarded against a synchronous throw |
| Lead `handoff_06a2040a` | `null` from the helper threw in the adapter | Belongs to the adapter, which is not adopted here; kept as a requirement of that adoption |
| QA-SUB-12 | Only the connector's output closes | See "Transport corrections" |
| QA-SUB-13, 14, 15 | Sign-in start and refused-address wording and order | See "Transport corrections" |
| QA-SUB-18 | A picture that cannot be encoded failed silently | Said on the card (and as "Not sent" for a follow-up); nothing kept, nothing sent, ink and mode as they were; no unhandled rejection |
| Lead: a distinct versioned build path for QA | A stage could be written over an earlier one | `scripts/stage.mjs`: a named stage that exists is refused; `dist` is built anew; each staged file's SHA-256 and a tree hash go to `stage-manifest.json`. **Not run** (it needs Windows) |
| Backend `b08d484` / lead `fca2a25` | An exhausted connector answers `unavailable` and retires; an outcome that is not known stays not known | Read as they are: `unavailable` ends the session with its reason; `submission: unknown` is said as "whether it reached ChatGPT is not known" and recorded as that, never as not sent |
| Review workflow `wf_426a18a6-0d9` (21 findings, 18 confirmed) | See "Review" | All 18 fixed |
| Review workflow `wf_92d6c609-fc3` (39 findings, 38 confirmed) | See "Review" | All 38 fixed (`a336485`) |

### Transport corrections

- **QA-SUB-12.** The connector's output ending or closing while the process still runs: after 500 ms without its
  exit, the child is ended here like any connector that left the envelope. What was out gets no answer and is said
  as not known, never replayed, and no request waits out its whole bound. A connector that is simply ending is
  said as its own end.
- **QA-SUB-13.** A connector that ends while a sign-in is being started is said as ended, not as "did not answer".
- **QA-SUB-14, 15.** A sign-in address that is not an official ChatGPT address is not opened; the state is
  `refused_address` ("The sign-in was not started") from before the cancel is sent, and it stays that whatever
  becomes of the connector. If the connector ends before it confirms the cancel, both facts are said; a refusal is
  never said as a sign-in that failed "because the connector was ended here".
- **Live envelope, a note for its owner.** In `lc-subscription-live/1` the connector answers a sign-in cancel that
  names no sign-in it holds with `unavailable` (the earlier envelope had `login_not_found`). This app therefore
  cannot tell "nothing to cancel" from "the connector cannot do it" in live, and says the more careful of the two.
  Not a defect of this slice; reported to the lead as caller feedback.

## Review

Two review workflows, each finding verified by a second agent before it counted:

| Workflow | Subject | Findings | Confirmed | Fixed |
| --- | --- | --- | --- | --- |
| `wf_426a18a6-0d9` | The voice boundary (`d0e5f80`): piece cutter, per-piece checks, the voice's end | 21 | 18 | 18, in `3766e62` |
| `wf_92d6c609-fc3` | The live join (`3766e62`): session, looks, gaps, ASK, record, control window | 39 | 38 (1 refuted) | 38, in `a336485`, each with its test |

A third workflow (`wf_719202c6-de1`) ported `tests/subscription.test.ts` and `tests/app-ask.test.ts` to the live
envelope without touching the source; it found one real defect (a request that passed a waiting frame did not name
that frame as a gap), fixed in `3766e62`.

## Executed

On Linux (WSL2), Node v24.21.0, TypeScript 7.0.2, from `apps/windows`, on the tree of this commit. Backend checkout
at `07c9ebd` for the tests that run the released Python (`LC_BACKEND_ROOT`, `LC_PYTHON`).

| Check | Command | Result |
| --- | --- | --- |
| Types | `tsc -p tsconfig.json --noEmit` | clean |
| Build | `npm run build` | passes |
| Whole suite | `node --test tests/*.test.ts` | **381 tests: 376 pass, 0 fail, 5 skipped** |
| Mutation | `evidence/windows-live-surfaces/mutants.py` in a scratch copy | **105 mutants: 100 killed, 5 left** (below) |

The five skipped tests are the development capture link's owned-host run (`tests/owned-host-flow.test.ts`, run only
by `tests/owned-host-run.py` with the `lc_p0_test` database, which was not given to this run); they do not touch
this slice.

Receipt: [`evidence/windows-live-surfaces/linux-full.json`](evidence/windows-live-surfaces/linux-full.json) (the
counts, the Backend revision and the SHA-256 of every source and test file that ran) with the run's whole output
[`linux-full.txt`](evidence/windows-live-surfaces/linux-full.txt).

**What the tests run.** The real main process, overlay and control scripts in a `vm` with a fake Electron, a fake
display and a synthetic connector process (`tests/fake-connector.mjs`, a real child process over real pipes). In
addition:

- every line a whole test session writes to the connector is given to the **released contract validator** and to
  **Learning's own preparation** in Python and is accepted (`tests/live.test.ts`, `tests/app-live.test.ts`);
- `tests/live-bridge.test.ts` runs the app against the **released bridge itself**
  (`services.worker.connectors.chatgpt_local.run_stream`, which pins the version and runs `LiveSubscriptionBridge`)
  as its connector child, with only the provider client replaced (`tests/live-bridge-child.py`: no Codex, no
  ChatGPT, no account, no network; a "response" is text the test wrote). Two tests: a whole session (Start, looks
  one at a time, a circle's hint, a follow-up on the same frame and on a later one, each bound by Learning and read
  back as bound here), and the bridge's own scheduling against the app's (a circle while a look is out, the reserve
  kept for the user's requests, a confirmed interruption, and one that is not confirmed).

**Mutation.** 105 single changes to `main.ts`, `overlay.ts`, `control.ts` and `live.ts`, each run against the five
test files of this slice ([`mutation.txt`](evidence/windows-live-surfaces/mutation.txt)). The five that no test
notices change nothing a user or a record could see:

| Mutant | Why nothing notices |
| --- | --- |
| `look-while-ending` | A capture that is ending has already ended its AI session, which the same line checks |
| `flush-after-end` | Ending a session clears the waiting frame, which the same line checks first |
| `start-twice` | The only caller (`lc:live-start`) checks the same condition before it calls |
| `fix-flush-ignores-paused` | Every pause clears the waiting frame, and no frame waits while paused |
| `quit-first-rejection` | None of the three ends waited for at quit rejects (the voice's is guarded and bounded, and tested as throwing, rejecting and never coming); `allSettled` stays as the lead asked |

One real gap was found this way and closed: a response to an earlier circle that reaches the overlay after the next
circle was drawn was not covered by a test (the code was right); `tests/overlay-surfaces.test.ts` now has it.

## Next

1. **The voice (blocked on a decision, not on code).** The operator's reviewed System.Speech helper and its adapter
   are outside the repository; this role's permission layer declined to bring them in, and that was not worked
   around (not retyped, not ported). Adopting it needs, from whoever is allowed to:
   - the reviewed `NativeSpeech.cs` and the **exact reviewed executable** bundled (a `csc` build is not
     reproducible byte for byte, so the reviewed binary is the one to ship, with its hash), plus the adapter with
     the `null`-JSON correction (`handoff_06a2040a`);
   - one call in `main.ts`: `connectVoice(...)` with `audible: true`. Everything else (per-piece checks, order,
     stop, the record, the end at quit) is already there and tested with a stand-in;
   - and these known limits of the helper handled or said: a character that XML does not allow makes it exit 2;
     its 30 s deadline against the longest piece at 0.7×; one language per helper process (two voices need two);
     its 60 s idle exit racing a piece that arrives then; only the default output device.
2. **A real renderer check of the toolbar with Talk in it** (hidden Chromium, as run-05 was for `28f0504`): bounds
   at 1000×700 and at a narrow work area, with Talk off and on (all six controls), and the card's response in view.
   The toolbar keeps `width: max-content; max-width: min(760px, area)` and wraps; that is reasoning, not a run.
3. **A stage for QA**: `node scripts/stage.mjs <name>` on Windows from the integrated commit, by the lead (a name
   that exists is refused). Not run here.
4. **Real acceptance, coordinated by the lead**: a signed-in account, a real display, a real response, real sound.
   Nothing here stands in for it.
5. **Speaking to the AI** stays said as not connected until a real input engine is integrated.

## Not verified

- **Nothing was run on Windows.** No Electron window, no real capture, no real pen or mouse, no DPI or multi-monitor
  behaviour, no real PNG sizes of a real display (a picture over 8 MiB or 16,000,000 pixels is refused with why, and
  whether a real display stays under that is not measured).
- **No real connector process with a real provider, no account, no model.** Every response is text a test wrote.
  The released contract, Learning's own preparation and the released bridge itself take what the app writes (see
  "Executed"), with the provider client replaced by a stand-in. Latency, quota behaviour, the real `connection/read` shape
  and real refusals are not observed.
- **No sound.** No voice is connected; the Talk controls, the per-piece checks and the record are exercised with a
  stand-in that plays nothing. Audible output, its device, its cancel latency and its quality are not verified, and
  speaking to the AI does not exist here.
- **The toolbar with the Talk controls in it** was not seen in a real renderer by this role (the lead's
  hidden-Chromium check ran on `28f0504`, before they moved).
- A same-frame follow-up needs the fresh frame to be byte-for-byte the circle's picture; on a real display a moving
  cursor or a video makes it a later frame (which is then said as that). How often that happens is not measured.
- Whether the time a voice gives one piece suffices for a 220-letter (or 73-character Chinese) piece at 0.7× is an
  estimate, not a measurement.
- Requirements this slice does not implement, and does not claim: the "directions for deeper exploration" of a
  response card (§7.3), proactive teaching, voice follow-up and live listening, content-anchored ink, and everything
  outside the Windows app.
