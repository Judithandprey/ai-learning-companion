# Managed-subscription ASK on Windows: driver, controls and the real Check connection at `3e4b406`

- **Task:** lead `handoff_d548b28a9fa5613b7543be19858a5ca2` (release), within the P0-13 / G4 subscription acceptance
  (`handoff_de323dc5105b08860c398a13b7206dbd`, driver task `handoff_16a192142160536115f6087460e33b77`).
- **Candidate:** pushed `3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e`. Its Windows app tree is the owner's `84fc56a`
  (both `5bda4761…`, compared by QA). Staged from `team/qa` at the normal merge `a9ff602`, Electron 44.5.1.
- **QA harness:** `team/qa` `b583969`. The final runs executed exactly the bytes of the commit named for each in
  [harness.json](p0-13-subscription-ask-windows-3e4b406/harness.json): six runs at `110c733`, the click probe at
  `9cac50b`, and one earlier probe run at `3002218`. The real turn's step list is the same at `110c733` and `9cac50b`.
  `677323a` changes one note text of the analyzer after those runs. `85d79e6` and `b583969` correct the cleanup of the
  start-file check (see "What happened on the way"); the corrected check was not run on the display.
- **Plan:** [p0-13-subscription-ask-plan.md](p0-13-subscription-ask-plan.md), updated to this stage.
- **Date and display:** 2026-10-01, 08:22–09:10 and 10:04–10:14 UTC, the Windows host (2560×1600 at scale 2 =
  1280×800 DIP), WSL2 Ubuntu.

## Decision

| Part | Result |
| --- | --- |
| Real image turn (the acceptance itself) | **not_run, held.** The product is **not signed in**, and the lead holds the turn until the corrected source is released (below). No question was asked. **0 of the 1 allocated attempt used.** |
| Real app, real connector: Check connection | **pass.** State `signed_out`; the official "Sign in with ChatGPT" button is offered |
| The user's sign-in entry | **ready**, checked up to the Check connection press. The sign-in itself is the user's and was not started |
| Card, question box and keyboard | **pass** with synthetic OS input (OS clicks, OS keys) |
| Deterministic controls (QA's stand-in, no model) | **pass, 18 of 18 checks**, labelled synthetic |
| Driver for the one real turn | **ready, after a correction** (see "What happened on the way"): steps, gates and reads rehearsed with the stand-in; the connector copy can prepare a question. Not rehearsable: the connector's `thread/start` and `turn/start` against the real binary |
| Product findings | **QA-SUB-01** (display): a valid selection is sometimes refused. **QA-SUB-02 to 08** (source review): two medium, five low. **QA-SUB-03 is a risk to the one attempt**; the lead has it fixed first |

**"The image path works" is not claimed.** Account, model list and login state are checked as preconditions; they are
never a pass of the image acceptance. Official image input, a model reading the pixels and the ink, and the answer in
the card are still not shown.

## What the real turn waits for

Two things, by the lead's decision of 2026-10-01 (`handoff_1d22cacea8942c35870ca6cd44e0cc7c`):

- **The corrected source.** QA-SUB-03 is fixed first. Backend has QA-SUB-02 and 03; Web has QA-SUB-01, 04, 05 and 06
  and a bounded assessment of 07 and 08. The lead has since released Backend's correction of 02 and 03 as `cd9b0ef`
  (source and synthetic tests; QA has not run it). Web's corrections are still open. The turn is held until the lead
  releases the exact combined commit. QA then
  stages that commit and makes its connector copy from it. The next behaviour retest covers only the corrected paths
  and the conditional image turn; the 18 controls and the sign-in checks are not run again.
- **The user's sign-in**, which the lead has passed on to the user. The sign-in entry and the product's sign-in state
  are kept as they are. QA does not use the Windows display and does not poll the sign-in while the user may use it.

### The user's sign-in

1. On Windows, open `%TEMP%\lc-subscription-signin-3e4b40654460\` and start
   `Start-Learning-Companion-Subscription.cmd`. It starts the released app with the trusted connector configuration and
   its own fresh profile.
2. Press **Check connection**. It says "Not signed in."
3. Press **Sign in with ChatGPT** and finish in the browser. The app never sees the password. Nothing is asked of
   ChatGPT by signing in.
4. Press **Check connection** again. It should say "Signed in with ChatGPT (…)".
5. Close the window, and tell the lead. No token, address or screenshot of the sign-in page is needed in chat.

- QA checked that start file up to step 2 ([launcher-check.json](p0-13-subscription-ask-windows-3e4b406/launcher-check.json)):
  the app opens, Check says `signed_out`, the Sign in button is shown and enabled, and the app closes. QA did not press
  Sign in. That check was made before the user had the entry, with the earlier version of the check; it is not repeated.
- Not checked by anyone yet: whether the browser's return to the sign-in listener inside WSL arrives (the owner's open
  point). If it does not, the app keeps saying "Waiting for you to finish signing in, in your browser." with a Cancel
  button. It says "The sign-in did not complete." only if the official Codex reports a failed sign-in or the connector
  ends. Which of these happens is not known.
- The start file needs the staged app and the Electron runtime in `%TEMP%`. If Windows cleans its temp folder, QA
  stages again and runs `signin_launcher.mjs prepare`.
- The connector copy it uses is `~/.local/share/lc-qa/subscription-source-3e4b40654460` in WSL: the released commit's
  `services/` and `packages/` (`git archive`), 268 files, each compared with the commit.

## The real turn, once released and signed in

One command, one press, no retry. The command is shown for this candidate; the corrected release changes the commit,
the staged app and the copy:

```
QA_STAGE_NAME=lc-qa-windows-sub-3e4b406 QA_SUB_ALLOW_REAL_CONNECTOR=1 \
QA_SUB_ALLOW_REAL_TURN=handoff_d548b28a9fa5613b7543be19858a5ca2 QA_SUB_SOURCE=3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e \
QA_SUB_BACKEND=~/.local/share/lc-qa/subscription-source-3e4b40654460 QA_SUB_CODEX_BIN=~/.local/bin/codex \
node tests/e2e/windows/run.mjs subask <new out dir>
```

- **The allocation** (lead): the id is the release message's, `handoff_d548b28a9fa5613b7543be19858a5ca2`. Still one
  attempt, none spent. Every real Ask press uses it, also one that provably submitted nothing; "unknown" counts as
  spent; no automatic retry. Receipt and billing facts are reported separately.
- **The harness enforces that.** A ledger file outside the run folders records each run under that id and whether Ask
  was pressed. Another run starts only if every earlier one provably stopped before the press.
- **Before the app starts**, the harness refuses unless the Backend copy is the commit's `services/` and `packages/`
  file for file, nothing else runs in it, and the connector's own preparation of a question works in it (run offline
  with the project's Python; nothing is sent).
- **Gates before the press** (each stops the run with nothing asked): QA's Edge window is on top under 16 points of the
  grid; the page is the whole display; the pointer is outside the region; both strokes are solid; the form is ready;
  the picture to be sent shows twelve cards and the pen's ring on exactly the two circled cards; the app still says
  signed in with a picture model, no question out, no usage window used up; the card holds QA's question and level.
- **After the press** nothing can stop the run. It waits the app's own bound (300 s, plus 30 s for its cancel), then
  reads the card, the record, the receipt and the page's truth.
- **Assistance level: `full_solution`** (the earlier plan said `explain`; the plan now says `full_solution`). The released prompt for `explain` ends "Do not reveal
  a full solution or the problem's final answer", and for `hint` "Do not reveal the final answer or a full solution". A
  model that obeys could withhold the two cards, and the single attempt would then be unjudgeable for a reason that is
  not picture input. `full_solution` has no such clause.
  - The other side: QA-SUB-03 below makes a long answer risky. One reader of the source review advises keeping the
    first real turn at "A hint"; another advises a question that needs a short answer. QA's question asks for two
    lines only.
  - **Lead decision:** `full_solution` is approved only for this generated, non-sensitive two-card recognition test
    with its two-line answer. It is not a product default and no permission for a learner's homework. QA-SUB-03 is
    fixed before the turn. (`QA_SUB_ASSISTANCE` can still switch the level; the analyzer follows the level the run used.)
- **What a failed first turn would mean.** A mismatch at `thread/start` sends no turn (receipt `not_submitted`, turn
  count 0): no prompt and no picture leave the connector, so QA expects no ChatGPT allowance to be used (not
  measured). The press still uses the one attempt (the lead's rule above). One at `turn/start` or later is a
  submission. The receipt shows which.

## Final runs

| Run | What | Result | Evidence |
| --- | --- | --- | --- |
| `surfacecheck` | QA's surface, pen circles, ASK selection; no link, no connection | 4 of 4 checks | [surfacecheck/](p0-13-subscription-ask-windows-3e4b406/surfacecheck/summary.json) |
| `smoke` | the ordinary runner start (its Edge start had changed) | 20 of 20 steps | [smoke.json](p0-13-subscription-ask-windows-3e4b406/smoke.json) |
| `subcontrols` | 18 Ask presses: 16 reached QA's stand-in bridge, 2 were not sent (before Check; after `unauthenticated`) | 18 of 18 checks | [subcontrols/](p0-13-subscription-ask-windows-3e4b406/subcontrols/summary.json) |
| `subselect` | 16 plain selections, nothing asked | 16 ready in this run; **1 of 16 refused** in the run at `3002218` | [subselect/](p0-13-subscription-ask-windows-3e4b406/subselect/summary.json), [at 3002218](p0-13-subscription-ask-windows-3e4b406/subselect-at-3002218/summary.json) |
| `subtype` | six OS clicks on the question box, two digit keys each; nothing asked | 7 of 7 checks | [subtype/](p0-13-subscription-ask-windows-3e4b406/subtype/summary.json) |
| `subrehearsal` | the real turn's 81 steps with the stand-in | all steps ran; 6 pass, 10 `limit` (stand-in: no model, no receipt) | [subrehearsal/](p0-13-subscription-ask-windows-3e4b406/subrehearsal/summary.json) |
| `subcheck` | **real connector**: Check connection, card, typing | 10 of 10 checks | [subcheck/](p0-13-subscription-ask-windows-3e4b406/subcheck/summary.json) |
| sign-in start file | started through the `.cmd`, Check only | as expected | [launcher-check.json](p0-13-subscription-ask-windows-3e4b406/launcher-check.json) |

### Real connector: Check connection (`subcheck`)

- Before the press the app has no `wsl.exe` child and the watch sees no process. After it there is exactly one, and in
  WSL the connector (`python`) with the official `codex` as its child.
- The app then says: **"Not signed in. Sign in with ChatGPT opens the official sign-in page in your browser."** The
  Sign in button is shown.
- The connector's read, as the app's status holds it: no plan, no usage limits, and seven models that all take
  pictures: `gpt-6-astra` (default), `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
  `gpt-5.5`. While not signed in, the control window shows no usage line and no model selector.
- The connector is the released one: the project's Python; the private copy (268 files equal the commit's); the
  connector's own product state (`state_dir` null); `codex_bin` named explicitly, as the lead's release message and
  the owner's note give it.
- With `codex_bin` null the connector looks for `codex` on the PATH of a process started by `wsl.exe --exec`, which is
  no login shell. `codex` is only in `~/.local/bin` here, so QA expects Check to say "Not available". This is read
  from the source and the machine, not run. QA's harness refuses to start without `codex_bin`.
- A selection of the surface with the two circles shows the question form; the picture on the card is, byte for byte,
  the PNG the app kept. No request was recorded and no receipt was looked up.
- App and connector ended by themselves; nothing was left running.
- The real connector was started **six** times in the two windows (three `subcheck` runs, three checks of the start
  file), each for one Check connection: account, model and limit reads only. **No question, no sign-in press, no browser.**

### Card, question box and keyboard

- **In NAV** (the selection was made from NAV, and the mode returns to it; `subtype`): each of six OS mouse clicks
  focused the question box, which had been blurred before it (6 of 6). The first click also made the overlay the
  foreground window; for the other five it already was. The box saw one press each time, with click count 1. The caret
  stood at the end of the text, and two digit keys were added to it.
- The overlay lets the mouse through in NAV until the pointer moves over its card. So the harness lets the pointer
  arrive moving. Without that movement, in a first probe run whose folder was not kept, the window under the point was
  not the app's and no click was made (QA's observation; see the commit message of `9cac50b`).
- **In WRITE, after the two pen circles** (`subcheck`, three runs): the click focused the box and the digits were
  typed each time. In two of the three runs the first digit replaced the last character of the prefilled text (the
  full stop). In the one of them that read the selection (at `110c733`) the click had left that character selected;
  the first run did not read the selection. Those clicks were made without the movement. Whether a physical click
  does the same is not shown; it is not judged.
- In the two `subcheck` runs that logged the box's input the digits arrived as input-method compositions (listed in
  the evidence). In `subtype` they arrived as plain inserted text with no composition event. Why the two differ is not
  determined. QA saw Microsoft Pinyin as the only input method installed; that is not recorded in the evidence.
- All of this is synthetic OS input, not a physical mouse or keyboard. The pointer was moved for those clicks and put
  back (2357,1267 px before and after).

### Deterministic controls (`subcontrols`): QA's stand-in, no Codex, no ChatGPT, no allowance

The stand-in is named as `launch.python` in the trusted configuration, so the app starts it exactly as it starts the
connector. Every answer is text QA wrote, marked SYNTHETIC. Shown on the real app:

- **Off by default.** Without the configuration there is no subscription section. With it, a capture, ink, a
  selection and an Ask before the user's Check start nothing; Ask says "Not sent" and records no question.
- **Check** shows the stand-in's account; only the model that takes pictures is offered.
- **Selecting without asking sends nothing**: before the first Ask the bridge received only the account read.
- **An answer is shown** for the exact picture and question: the bridge received the PNG the app kept and the card
  shows, with QA's question and level. The card shows exactly the stand-in's text and the record marks it shown. That
  text holds no markup, so text-only rendering is not tested here; it rests on the source review.
- **An answer bound to another picture is not shown** and not kept. Another picture hash is the only unbound case run.
- **Six closed error codes** (`quota`, `busy`, `unsupported_model`, `invalid_request`, `failed`, `unavailable`) and
  `unauthenticated` each show the app's own fixed sentence, are recorded as refused, and nothing is sent again.
- **Cancel:** confirmed, unconfirmed ("not confirmed; it may still have counted against your usage") and a late
  answer after the cancel, which appears nowhere.
- **Stop with a question out:** the bridge is told to stop that session; its late answer is not kept; a later Start
  is another session and can ask.
- **A 300 KiB line** while the app's re-read is out: the app ends that child, says "Not available", has no `wsl.exe`
  child 6 s later, and starts none for 12 s. Only the user's Check starts one.
- **`unauthenticated`:** the control window says not signed in and offers Sign in; the next Ask is not sent.
- No sign-in request ever reached the bridge. App and bridge ended by themselves.
- The two clocks (Windows, WSL) differed by 4 ms in this run, measured from the 16 questions.

## QA-SUB-01: a valid ASK selection is refused as "the selection facts are malformed"

- **Severity:** medium. The core ASK path fails now and then on this display. Nothing is sent and nothing is lost; the
  user must select again. The message blames the selection.
- **Owner:** Web (`apps/windows`). QA changed no production code.
- **Seen:** 3 of 48 plain selections in the three probe runs were refused with this status (2, 1 and 0 of 16). In the
  early control runs 1 of 19 plain selections also never got a ready form; its card was not read, so it is attributed
  to this defect, not shown. Observed with the status: 3 of 67, about 1 in 22. With the attributed one: 4 of 67.
- **What the user sees:** the card opens with the picture, without a question form, and says "This selection cannot be
  asked about: the selection facts are malformed. It was not sent to any AI."
- **Cause (read in the released source):**
  - `apps/windows/src/renderer/overlay.ts`, `finishAsk`: the frame is taken (`held = raw`, line 769) and then three
    awaits follow (the PNG, its bytes, the data URL: 785–791). Only then are `held.bitmap.width` and `.height` read into
    the facts (822–823).
  - If the one-second sampler takes a new frame in between, `takeSample` replaces `raw` and closes the old bitmap
    (292–294, 154–156). A closed bitmap has width and height 0.
  - `apps/windows/src/main/main.ts` 776–777 refuses a zero width: "the selection facts are malformed".
- **Measured:** the three refused selections had a frame sampled 67, 94 and 109 ms after the pen-up. Of the 45 accepted
  ones, 44 had their next frame 144 ms or more after the pen-up, and one had 93 ms. For two of the 44 the frame the
  selection used was itself sampled 13 and 28 ms before the measured pen-up (listed as negative values); the next one
  came about 1 s later. The pen-up time is the start of the runner's next step, good to a few tens of ms
  ([qa-sub-01-timing.json](p0-13-subscription-ask-windows-3e4b406/qa-sub-01-timing.json)).
- **Smallest fix (for the owner):** read the frame's width and height before the first await, or pin the frame for the
  length of `finishAsk`.
- **Effect on the real turn:** none on its validity. The driver lifts the pen just after a frame, and a form that is
  not ready stops the run before the press. The probe keeps the plain gesture.

## Source review of the released code (what the display cannot show)

Three readers, a skeptic each, offline only: no Windows process, no codex, no connector run against Codex or the
product state, no product state or credential read. (One reader's unit-test run starts the connector program twice;
it refuses that launch and exits at once.) "Confirmed" means the skeptic could not refute it from the lines or an offline run with the project's
own test fakes. Details, lines and the properties found to hold, in the reviewers' own words:
[source-review.json](p0-13-subscription-ask-windows-3e4b406/source-review.json).

**Lead decision: QA-SUB-03 is fixed before the one attempt is spent.**

| Id | Owner | Severity | Finding (confirmed) |
| --- | --- | --- | --- |
| QA-SUB-02 | Backend, Web | medium | **After a fatal inner failure the connector stays alive and answers later requests with the old code; the app never replaces it.** Triggers: an `error` notification on the turn's thread, an inner RPC over 15 s, an unconfirmed interrupt, a refused tool request, the event cap below, a failed start of the Codex child. Until the app is restarted every Check repeats that code, and so does every Ask while the app still says signed in; nothing is sent. `chatgpt_rpc.py` 277–290, 449–451; `chatgpt_local.py` 391–405; `subscription.ts` 148. Found by all three readers |
| QA-SUB-03 | Backend | medium | **A turn with more than 4096 notifications on its thread is killed, streamed deltas included**, although answers up to 32,000 characters are allowed: 4,095 deltas pass, 4,096 fail as `unavailable` (reproduced with the project's fake child). `chatgpt_rpc.py` 25, 378–385. How many notifications the real binary sends per answer is measured nowhere. A short answer is unlikely to reach it; a long `full_solution` answer or long streamed reasoning could. **This is a risk to the single real attempt** |
| QA-SUB-04 | Web | low | A question holding a lone UTF-16 surrogate is accepted, written to the connector, and ends it; the record says "uncertain" for a question that was never sent. `subscription-ask.ts` 55–59 |
| QA-SUB-05 | Web | low | A failed Check or sign-in start is described with a question's text ("ChatGPT did not complete an answer", "another question is still being answered") although no question was sent. `subscription.ts` 304, 344 |
| QA-SUB-06 | Web | low | A read that says signed in clears a pending sign-in without cancelling it in the connector, which then refuses every Ask as busy; and Cancel's own answer is never read. Needs unusual timing. `subscription.ts` 314–317, 373–377 |
| QA-SUB-07 | Web | low | The four-read bound holds only inside one check: a `connection/changed` sent just after each reply keeps the app reading without end (25,581 reads in 400 ms against the project's fake connector). Not shown reachable through the released connector. `subscription.ts` 226, 277, 288 |
| QA-SUB-08 | Web | low | An answer delivered to an overlay that is lost before it acknowledges stays in the record with its text (`shown: false`) when the session ends, against the app's own "not kept" rule. `main.ts` 284–292, 953–966 |

Notes for the real turn, confirmed from the lines:

- **The first real turn is the first time the connector's own `thread/start` and `turn/start` meet the real binary.**
  The repository's real-binary evidence stops at configuration reads and Support's simpler probe. Any mismatch fails
  closed (`unavailable` or `failed`).
- **A failed turn says little about why.** A refused tool request, a model mismatch and a plain failed turn all show
  `failed` on the card, and the receipt has no reason field. The receipt still separates a model mismatch
  (`actual_model`), a tool item (`produced_item_types`) and a plain failed turn (`terminal_status`). A refused server
  request cannot be told from other mid-turn failures without an item.
- **The effective bound on an answer is the connector's 120 s**, not the app's 300 s; a turn cut there is recorded as
  refused with `failed`.
- The connector's own sign-in address check accepts one address form (a backslash in the host) that a browser reads as
  another host, and three more that a browser rejects as invalid. The Windows app's check refuses all four. In the
  project's code only the app opens the browser; whether the official Codex opens one itself is not established.
- The selection's frame number, time, picture pixels and ink document come from the overlay and are checked for shape
  and size only (the picture: a PNG of the region's size that decodes). Only the region's place in the frame is worked
  out in the main process.

Plausible, not confirmed:

- The prompt says "ask a small clarification if needed" while the one tool still advertised (measured for a synthetic
  model only) is the clarification tool. If the binary passes such a call to the connector, the turn is killed;
  whether it does, or answers the call itself, is not shown.
- Tool closure by configuration was measured only for a synthetic model.

**Found to hold** (lines and tests in the evidence): a sign-in starts only on the user's press; the app opens only
official HTTPS addresses and cancels a refused one; no address, login id, e-mail or token reaches the renderer, logs,
files or receipts (the spot check notes two small imprecisions that are not leaks); Codex state is the product's own
private folder; isolation is read back before any account work and before each thread; a server request is never
approved; a turn with any non-message item returns no text; one thread and one turn per ask, no retry; the whole
provenance is compared before an answer is shown; answers are rendered as text only.

## What happened on the way (kept for honesty)

- **A foreign window was captured in the first dry check.** The page reported "full screen", but another app's window
  stayed above QA's Edge window, so the frames and the ASK selection of that run showed that window. QA saw it in the
  retained selection picture. Nothing was sent anywhere (that run had no link and no connection). QA deleted the run
  folder at once ([record](p0-13-subscription-ask-windows-3e4b406/surfacecheck-covered-incident.json)). Since then the
  harness raises Edge above other windows, checks the top window under 16 points before any capture, and checks every
  selected picture from its own pixels before anything can be asked.
- **The connector copy could not have answered a question.** The first version of this report called the driver ready.
  Its fact-check found that QA's copy held only `services/`. The connector's question path also loads
  `packages/contracts`, so Check connection worked, but the one real Ask would have been answered `unavailable` before
  anything was sent, and QA's ledger would have counted the press. The rehearsal's own evidence already showed
  `No module named 'packages'` when recomputing the prompt, and QA had read it as a designed limit. Fixed in `110c733`:
  the copy holds both trees and is compared file for file; the connector's own preparation of a question is run in it
  before any real run; the prompt recomputation is its own visible check. The connector's two unit-test files pass
  inside the copy (149 tests, offline).
- **Runs before the final sets** (earlier harness states): a dry check stopped by QA's own new picture gate (its colour
  match was too strict for this display's colour profile); control run 1 stopped by a harness mistake (ring count in a
  new session); control run 2 stopped at a selection whose form never became ready (see QA-SUB-01); control runs 3–6,
  a probe, a rehearsal, a Check run and a start-file check; then a full set at `3002218`, repeated at `110c733` after
  the copy correction. A first click probe made no click at all (the pointer was only placed, not moved). Its run
  folder was not kept, so this rests on QA's observation and the commit message of `9cac50b`, which corrected it; the
  probe was then run again.
- **The start-file check let go of too much, and of too little.** The lead's review found that the check had no
  cleanup of its own after a DevTools failure or at its 150 s limit, and that it removed the entry's profile folder
  unconditionally. A first correction (`85d79e6`) was held by the lead for one ownership boundary: it remembered bare
  PIDs, took a process it could no longer read for a foreign one, and matched its port as text. Corrected in `b583969`,
  without a display run:
  - The check runs byte-identical copies of the start file and its configuration in a new folder of its own. The
    user's entry folder and its profile are never touched. It refuses to start beside an open Electron app or a
    connector running from the copy.
  - **Owned is an exact launch identity**: the staged runtime's exact path, exactly the arguments the check launched
    (whole arguments, so port 43000 is not found inside 430009), created after the check began. It is remembered by
    PID and creation time. A PID alone is never trusted.
  - **The signal is bound to that identity.** One command takes hold of the process, so the PID cannot be given to
    another process meanwhile; it reads the creation time, executable and command line again, compares them character
    for character, and only then asks the window to close or ends the process. First it waits, then asks, then ends.
  - **When it cannot tell, it does nothing.** A remembered process that no longer shows that launch, a new process it
    cannot read, its own port argument in another launch, or a failed look: nothing is signalled, nothing is removed,
    and the check says "not released" (exit 3).
  - Its folder is removed only when it made it and everything it started is confirmed gone.
  - Verified without a window: 35 offline tests of the rule, with regressions for the lead's three observations; the
    argument splitting equals Windows' own for 30 command lines; the two Windows commands were run on a windowless
    process the script started itself ([result](p0-13-subscription-ask-windows-3e4b406/signin-signal-headless-check.json)):
    a wrong creation time, command line or executable is not signalled, the exact identity is.
  - Not shown: the corrected check itself on the display, and that Windows reports the app's launch in exactly the
    expected form. If it does not, the check reports "not released" and signals nothing. The three saved checks were
    made before these corrections, ended by themselves, and stay valid.
- **QA's own pre-run review** (five reviewers, a skeptic each) gave 40 findings on the harness, 38 confirmed: among
  them the single-use allocation, the gates at the press, the 300 s wait, the step-dispatch fault that would have
  skipped the click and keys, and the evidence writer's refusal. All are fixed in the frozen harness
  ([list](p0-13-subscription-ask-windows-3e4b406/prerun-review.json)).

## Not tested, limits

- **The real image turn**: not run (not signed in). Official image input, the receipt, the answer and its judging are
  all open.
- **The sign-in flow**: the user's; not run by QA.
- From the plan's list of controls (section 3, "Not run on the display"): a refused sign-in address, a tool or
  approval request from the official child, a malformed or oversize picture, a stopped session answered by the real
  connector, and screen text that reads like an instruction.
  - The stand-in sits at the app's boundary and cannot produce a tool or approval request from the official child. A
    refused sign-in address was not run because QA never presses Sign in and the stand-in gives no address.
  - They were read in the source review above and rest on the owners' unit tests; they are not display evidence.
    Whether a model obeys text in the picture is not shown by any test or review.
- **Input** was DevTools pointer events and DOM clicks, plus OS clicks and OS keys. No physical pen, mouse or keyboard.
- One display, one Windows host, colour profile as found. macOS, audio, video, Notability and either §7.1 gate: not covered.
- A selection picture or a frame is never in the evidence: only hashes, sizes and the page's own truth of the
  generated cards.

## Display release

- Released at 10:14 UTC. No QA Electron, Edge, connector or stand-in process is left. The pointer is where it was.
- The window that had the focus before the runs is no longer the focused window; it was not closed, moved or resized.
- Left on purpose in `%TEMP%`: the staged app `lc-qa-windows-sub-3e4b406`, the Electron runtime, and the sign-in
  start folder. In WSL: the connector copy named above.
- QA did not open, reset or edit the connector's product state. The harness only looks for the launch folders' names
  under its `receipts` folder. The connector itself ran six times on that state under QA's Check presses; what it
  wrote there, if anything, was not looked at. It holds no sign-in.
- Seen and not touched: a process `python-flood` from another role's `DesktopCaptureTests` folder in `/tmp` has been
  running for hours.
