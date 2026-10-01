# Windows app: managed ChatGPT subscription and the selected-image ASK

Lead task `handoff_df27ff4f` ("先接入官方订阅"), with the pinned shapes of `handoff_8c4fdb6a`. The design is
`docs/adr/0003-managed-subscription-ask.md`, read at main `1b7c905`; the released connector
(`services/worker/connectors/chatgpt_local.py`) and Learning's seam (`services/learning/subscription_ask.py`) were
read at main `871aabd`. The written paths are `apps/windows/**` and `docs/verification/web/**`. No shared, contract,
service, dependency or root change.

**Status: implemented and tested against a synthetic connector only. No real provider call was made, no sign-in was
done, the released connector was not run by this role, and the real app was not run on the display.** This is the
selected-image ASK only: it is not continuous observation, and no real AI answer has been accepted.

The lead's review of `68b4cd9` (`handoff_fdc6d726`, `handoff_76d2d16d`) found five defects, W-SUB-01 to W-SUB-05.
They are corrected in one commit after `4944cc3`; see "Correction after the lead's review" below.

## What the user gets

**Off by default.** Without `LC_SUBSCRIPTION_CONNECTOR` the app is as before: no question form, nothing kept for ASK,
and the texts say no AI is connected.

**Enabled** by a trusted configuration file named by `LC_SUBSCRIPTION_CONNECTOR`, read only by the main process:

```json
{ "format": "lc-windows-subscription-connector/v1",
  "launch": { "kind": "wsl", "distribution": "Ubuntu", "user": "<WSL user>", "cd": "<Backend checkout in WSL>", "python": "<its .venv python>" },
  "state_dir": null, "codex_bin": null }
```

`state_dir` and `codex_bin` are optional and reach the connector as `LC_SUBSCRIPTION_STATE_DIR` and
`LC_SUBSCRIPTION_CODEX_BIN`. `python` is the trusted executable run in WSL (the Backend's own python; a check that
needs a stand-in connector names its own executable there, never a weaker Codex gate). No window can set or see
anything in this file. There is no POSIX launch: the connector takes only private pipes, and a Node child's own stdio
on POSIX is a socket pair.

**The control window** gets a "ChatGPT subscription" section:
- **Check connection** starts the connector and reads the sign-in state, the plan's label, the usage limits and the
  models. Nothing is started before this press, and nothing is sent to ChatGPT by it.
- **Sign in with ChatGPT**, when not signed in, starts the official managed sign-in and opens its page in the user's
  browser. The page is opened only on this press, and only if its address is https on `openai.com` or `chatgpt.com`
  (or a subdomain), with no user, password or port; any other address is refused and that sign-in cancelled.
  Completion, failure and cancel are shown. **Cancel sign-in** cancels only this app's pending sign-in.
- **Model for questions** lists only models the catalog says take pictures. A model with no such fact is not offered.
- The header says "No AI watches the screen: ChatGPT (your subscription) gets only a selection you send with Ask, with
  your question."
- The app never opens, copies or reads a credential, a token or a cookie, and never signs anything out.

**The overlay's ASK card**, for a selection:
- The mode before ASK (NAV or WRITE) returns at once, as before; the card stays.
- The card's first paragraph says the selection is sent to ChatGPT, with the question, only when the user presses Ask,
  that nothing else of the screen is sent to any AI and that no AI watches it. It stays true whatever happens later.
- A question box (at most 4,000 characters, prefilled "Explain what is selected." so a pen alone can ask), the choice
  **A hint** (default) / **Explain it** / **Full solution**, and **Ask ChatGPT**.
- While a question is out: "Asked at time (model): this picture and your question are being sent to ChatGPT. Waiting
  for the answer…" and **Cancel**. The badge reads "Selection · asked: being sent to ChatGPT"; whether ChatGPT took it
  is said only once an answer or a refusal comes.
- The answer appears under "Answer from ChatGPT · generated text, apart from your selection", as plain text, with the
  model and the time it took. The selection's picture and its own text are unchanged.
- Refused, cancelled and unanswered questions say so in fixed words. A cancel says whether ChatGPT is confirmed to
  have stopped working on it. Nothing is sent again unless the user presses Ask again.
- If how a question ended (an answer included) cannot be written to this device, the card says so after the outcome:
  "This is NOT saved on this device yet: it could not be written (reason). It is kept in the app and tried again when
  this card closes; press Save to try now." **Save this outcome on this device** (`#askSave`) tries the write again;
  nothing is asked again for it. An Ask that is refused meanwhile leaves the answer, that statement and Save on the
  card.
- What is still unwritten when the session ends is said where the session's end is said, in the control window: "How
  N question(s) to ChatGPT ended (an answer included, if one was shown) could not be written to this device (reason);
  the selections and their pictures are kept, without that outcome, and writing it is tried again at the next Start
  and when the app closes". It is said again at every later session's end while the record is still held. Closing
  the app with such a record held keeps the control window open once, saying so.
- Closing the card, or circling again (even a circle that selects nothing), cancels the question that is out; the
  help chosen starts at "A hint" on every new card.

## How it works

**`src/shared/subscription-ask.ts`** (pure): the envelope's version and limits, the request an ASK sends, the checks
of a selection's rectangles, and how the connector's answers are read: `readAccount` (only the pinned fields; another
auth mode than managed ChatGPT is not signed in), `officialLoginUrl`, and `readAnswer` (an answer is read only if its
whole provenance, `{request_id, question, assistance, image:{sha256,width,height}, context}`, equals the request that
was sent).

**`src/main/subscription.ts`**: the connector as a private foreground child, and the state the windows are told.
- **Launch**: `wsl.exe --distribution … --user … --cd … --exec <python> -m services.worker.connectors.chatgpt_local`.
  No startup record; `connection/read` is the handshake. The child's environment is the capture host's (no `LC_*`,
  `WSLENV`, `PYTHON*` or `PG*`), plus the two trusted settings when configured (carried into WSL with `WSLENV`). Its
  error output is not read. Through `wsl.exe` the child's input and output are both pipes, as the connector requires
  (checked on this machine with a plain python child from a Windows process: `fifo fifo`).
- **Lines**: one JSON object per line each way, `{version:"lc-subscription-ask/1", id, method, params}` out, a reply
  or an event in. A line from the connector over 256 KiB, or one to it over 12 MiB, is not taken; an over-long line
  ends the child. Only the envelope's own fields are read; the connector's error message is never shown (its closed
  code is mapped to a fixed text).
- **One question at a time**, sent once. No answer within the bound (5 minutes) is said as "not known", the turn is
  interrupted (`ask/cancel`), and nothing is sent again.
- **Cancel** marks the question at once (its answer is never returned to the app's windows) and sends `ask/cancel`.
  As the released connector answers, the question itself ends as `cancelled`; whether the interruption was confirmed
  is the cancel's own answer, or the Stop's. The app waits for that answer (bounded) and says "confirmed" only for
  the exact receipt of its method: `{cancelled: true, uncertain: false}` for `ask/cancel`, `{}` for `session/stop`.
  Anything else (`{}` or `null` for a cancel, `cancelled: false`, a member of another type, an extra member, an error,
  no answer, a lost connector) is "not confirmed". When both were sent, each must confirm.
- **The account is read again** when the connector says it changed, or when this app's sign-in completes. If that
  comes while a read is out, one more read follows it, so an older answer never stands over a newer state. Only
  reads are sent by this: no sign-in and no question. At most four reads in a row; if the account changed again
  during the fourth, the state is said as not known ("the account changed again while it was being read; check
  again") and nothing is asked until the user checks.
- **A stopped capture session** is remembered for the app's life: its question out is cancelled, the connector is
  told (`session/stop`) by the Stop itself, and no question of it is ever sent again, whatever child runs.
- **A lost connector** is never replaced by the app itself, not even to cancel what it had: only the user's Check or
  Sign in starts one. A line that is not the envelope's fences the child at once (nothing more of it is read), and
  so does the app's quit.
- **What a connector answered belongs to that connector.** An account read, a re-read after a change, a sign-in's
  start and a question remember the connector they went to. If it answered and was then fenced, lost or ended
  (even in the same chunk of its output), nothing it said is published as the state now: the account is said as not
  available ("the connector was lost while the account was being read"), no sign-in page is opened, no re-read is
  sent, and no other connector is started.
- **A sign-in's completion** that the connector writes together with its start's answer is taken as that sign-in's.
- **End**: the end of its input, a bounded wait, then this child alone is killed. The app's quit waits for it,
  and for a child that was fenced here and is still ending. A fenced child's own end is seen as its end: it is not
  killed after it has ended.

**`src/main/main.ts`**:
- `lc:ask-selection` (from the overlay only): the selection is retained under the session's capture folder before
  anything can be asked.
  - `asks/<sha256>.png`: the exact composed PNG the card shows. Its size must be the selected region's pixels, which
    the main process works out itself from the display and the frame (floor left/top, ceil right/bottom, clamped);
    at most 8 MiB and 16 million pixels.
  - `ink/<sha256>.json`: the exact ink document drawn into it, taken by the overlay before anything is awaited, read
    back with the ink parser and matched to its session, revision and visible strokes. If it cannot be retained the
    request carries `ink_sha256: null` and the record says why.
  - `asks/<selection>.json` (`lc-windows-ask/v1`): the picture's file and hash, the context (capture session, frame
    sequence, time and size, display, region in DIP and pixels, ink revision and hash; URL, version and media position
    are null: unknown on the desktop, never read from pixels), and every question about it with how it ended.
  - What is already stored at an address is reused only if it is exactly those bytes. The session's byte cap applies.
  - Nothing of this goes into `manifest.jsonl`, so the capture link and its planner are untouched.
- `lc:ask-submit` (the user's press): the question is trimmed and bounded, the assistance is one of the three, the
  selection must be the current one, the session not ending, the subscription signed in with a model chosen, and no
  question out. The request is built from the retained selection, written into the record, then sent.
- **Shown only if still live**: when the outcome comes, the session, the selection and the request are checked
  again; an answer for a replaced selection, a cancelled request or an ending session is not shown and its text not
  kept.
- **An outcome said before the acknowledgement.** The main process answers the overlay's submit and may say how the
  question ended before that answer reaches the overlay (an immediate refusal, for one). The overlay keeps such a
  result until the acknowledgement names its request, and shows it only if it is that request's. A result for
  another request is never shown.
- **`shown` means shown.** An answer is recorded with `shown: false` when it comes. The overlay then says what it did
  with it (`lc:ask-presented`, from the overlay only, for the current selection and that request): shown, and the
  record says `shown: true`; or not shown after all (Cancel or the capture's end crossed it), and the record becomes
  `cancelled` without the text. An answer the overlay never reported as shown when its card closes or is replaced is
  recorded the same way. An answer still unreported when the session ends stays `answered` with `shown: false`.
- **An outcome that cannot be written** is held by the main process and said to the overlay with the result
  (`{saved, reason}`). Writing it is tried again on Save (`lc:ask-save`, from the overlay only, for the current
  selection), when its card goes, when the session ends, at the next Start, when the app quits and when Windows
  ends the user's session. A record still held after its card is gone is one entry of `asksUnrecorded`, without
  its picture's bytes (the picture is already on this device). The notice is said in the control window, not in a
  session's `manifest.jsonl`. The question is never asked again for this, and the stored picture and ink are not
  touched. If the app is ended while the device still cannot be written, that outcome is lost with it; the record
  on the device then shows the question with `outcome: null`.
- **A new selection, or the card closing** (`lc:ask-closed`), cancels the question out for the selection before and
  makes it no longer askable, whether or not the new one is retained. **Stop** (and every other end of the session)
  fences the session at once. **Quit** waits for the connector to end.
- The control window's presses (`lc:sub-check`, `lc:sub-login`, `lc:sub-login-cancel`, `lc:sub-model`) are taken
  only from the control window.

## Checks

All with a **synthetic** connector: a stand-in that speaks the envelope in-process (`tests/subscription-fakes.ts`,
behaving as the released connector does for cancel and Stop) and a small real child process for the pipes
(`tests/fake-connector.mjs`). No Codex, no ChatGPT, no sign-in, no network. Every "answer" is text a test wrote.

- `tests/subscription.test.ts` (18 at `68b4cd9`, 21 at `c977df5`, 24 now): the question, rectangle, account, sign-in address and provenance rules (every
  member of the provenance changed in turn; a `__proto__` stand-in; an answer of 32,000 astral characters); the
  configuration; nothing started before a check; the exact launch, its `stdio` and environment; the sign-in (opened
  only on the press, only at an official address; completion, failure, cancelled elsewhere, another product's
  completion, cancel, a completion in the same chunk as the start's answer); one question sent once, a second
  meanwhile not sent; an unbound answer not returned; errors as fixed texts (an error code named like a built-in);
  cancel (confirmed, unconfirmed, an answer arriving anyway, a cancel never answered); a stopped session; no answer in
  time and a lost connector (no new child by the app itself); a connector that cannot start, has no pipes, answers in
  another form or writes an over-long line; lines split inside a character and several in a chunk; a real child over
  real pipes ended by the end of its input.
- `tests/app-ask.test.ts` (20 at `68b4cd9`, 31 now), the real `main.ts` and `overlay.ts` under the unit-test fakes: off by default; a bad
  configuration; capturing, writing, erasing, undo, redo, retained frames and selecting send nothing, unchecked and
  signed in; the selection retained as exact bytes, facts and ink, with the mode before (WRITE and NAV) back at
  once; the ink taken before the picture is encoded; the pixels worked out by the main process; Ask sends what the
  main process retained and shows the answer as text on its card; Cancel; Cancel crossing an answer; a new selection;
  closing the card and an empty selection; Stop (the connector told by the Stop itself); the app's own fence when the
  layer below forgets to cancel; refusals and no answer never resent; what cannot be written is not asked; a page's
  claims checked by the main process; every new request taken only from its own window; the control window's presses
  and texts; quit waits for the connector.
- Each rule's check was run against the code with that rule removed and fails there (the review's mutants included).
- At `68b4cd9`: the whole `apps/windows` suite on Linux against the released host at main `a46a00d`, 279 tests,
  274 pass, 5 skipped (the owned flows); without a Backend 234 pass, 45 skipped. On Windows (Electron 44.5.1 run as
  Node, no window) the two new files and the affected ones, 78 tests, 71 pass, 0 fail, 7 skipped (the Backend and
  POSIX-only cases); `evidence/windows-subscription-ask/windows-focused.txt`. On Linux the same focused set, 65
  tests, 65 pass (`linux-focused.txt`). Those receipts (`*.json`) carry the SHA-256 of the 63 source and test files
  run, which are `68b4cd9`'s.
- With the correction (the numbers that hold now): see the next section.

**Review of the first delivery (`68b4cd9`).** An independent four-lens review (the connector module, the main process, the two windows and their
texts, the tests), each finding verified by a second reviewer, found 16 defects and gaps; 19 more were reported
unverified. All are fixed or covered: the cancel's uncertainty was read from the wrong answer; a lost connector was
silently replaced to send a cancel; a replaced or closed card left its question live; the card said "sent" before
that was known; a sign-in's completion in the same chunk was dropped; an over-long line did not fence the child; the
provenance comparison could be fooled through `__proto__`; the POSIX launch could not run the real connector (it is
removed); and the tests did not pin the ink snapshot, the main process's own pixel mapping, write-before-send, the
quit wait or the sender checks.

## Correction after the lead's review (W-SUB-01 to W-SUB-05)

One commit after `4944cc3`, in `apps/windows/**` and this folder only. Synthetic connector only: no provider call,
no sign-in, no display run.

| Finding | What was wrong at `68b4cd9` | What it does now |
|---|---|---|
| W-SUB-01 | The overlay dropped an outcome that reached it before its submit's acknowledgement (an immediate refusal), and stayed at "Waiting for the answer…". | The overlay keeps that result until the acknowledgement names its request, then shows it. A result for another request is not shown. |
| W-SUB-02 | A failed write of how a question ended was swallowed; the card said "Answered" while the device had `outcome: null`. `shown` was set when the main process sent the result. | The card says it is NOT saved and offers Save; the outcome is held and tried again (Save, the card's end, the session's end, the next Start, the app's quit, Windows ending the session); what is still held is said at the session's end. `shown` is set only when the overlay reports it showed the answer. Nothing is asked again; the stored picture and ink are untouched. |
| W-SUB-03 | A `connection/changed` or a completed sign-in during a pending read was dropped, so an older state could stand. | One more read follows the pending one (coalesced, at most four in a row, reads only). |
| W-SUB-04 | `{}`, `null` and `{uncertain: 'unknown'}` counted as a confirmed cancel. | Only `{cancelled: true, uncertain: false}` (cancel) and `{}` (Stop) confirm; anything else is not confirmed. |
| W-SUB-05 | A fenced child's exit never settled its exit promise, so it was "killed" after it had ended. | Its real exit is seen; nothing is killed after it ended; the quit waits for a fenced child that is still ending. |

**The lead's reproducers**, run against the corrected tree:
- `lead-review.test.ts` (copied in for the run, not committed): both cases pass. The storage-fault case shows the
  answer with the NOT saved statement and Save; the immediate refusal shows "No answer: ChatGPT is not signed in
  (sign in from the control window). It was not sent again."
- `windows-subscription-independent-probe.ts`, with its assertions of the defects taken out: two reads and
  `signed_in` after the sign-in completes during a read; `{}`, `null`, `{cancelled: true, uncertain: 'unknown'}` and
  `{cancelled: false, uncertain: false}` each give `{status: 'cancelled', uncertain: true}`; the over-long line gives
  no kill after the child's own exit.

**Regressions** (each fails with its rule removed: 50 mutants, all killed):
- `tests/app-ask.test.ts`, 11 new cases and 1 extended:
  - a refusal, an answer and a cancel that arrive before the acknowledgement; a result for another request;
  - `shown` only after the overlay's report; a Cancel that crosses an answer; a card closed before the answer
    reached it (not shown, text not kept);
  - an unwritten answer and an unwritten refusal said as NOT saved, with Save;
  - an Ask refused while an outcome is unwritten (the statement, Save and the answer stay; the record stays held);
  - a late Save answer that does not replace a newer question's status;
  - the capture ending while an outcome is unwritten;
  - the two new channels taken only from the overlay, for the current selection and request, once;
  - an outcome written at its card's end, at the session's end, at the next Start, at the app's quit and when
    Windows ends the session;
  - the session-end notice: for a card that is gone, for an outcome that comes after the Stop, with the count of
    two held records, after a cancelled Start, at a later session's end and not in that session's manifest;
  - the app's close held once.
- `tests/subscription.test.ts`, 3 new cases: a change and a completed sign-in during a read; two
  changes during one read; a failed read not repeated; the bound of four reads and the state then said as not known;
  twelve malformed cancel receipts and five malformed Stop receipts; Cancel and Stop together; a fenced child that
  ends by itself, one that does not, and two fenced one after the other.

**Runs** (all synthetic):
- The whole `apps/windows` suite on Linux against the released host (Backend checkout at `1f7ec5b`): 293 tests,
  288 pass, 0 fail, 5 skipped (the owned flows); without a Backend 248 pass, 45 skipped. `tsc` and the build pass.
- The affected set (the two subscription files, `app-link`, `main-lifecycle`, the four overlay files,
  `control-link`): on Windows, Electron 44.5.1 run as Node, no window, 102 tests, 95 pass, 0 fail, 7 skipped
  (`evidence/windows-subscription-ask/windows-correction.txt`); on Linux without a Backend, 102 tests, 96 pass, 0
  fail, 6 skipped (`linux-correction.txt`). The receipts (`windows-correction.json`, `linux-correction.json`) carry
  the SHA-256 of every source and test file run, which are the correction commit's.

**Review.** Two independent review passes over the correction, each finding verified by a second reviewer who tried
to refute it: 30 findings, 21 confirmed, 9 refuted. The 21 are fixed or covered by a test. The ones that changed
behaviour:
- an Ask refused while an outcome was unwritten hid the NOT saved statement and Save, and marked nothing;
- a refused Ask whose own write failed was later announced as a question whose outcome was lost;
- an unwritten outcome of an earlier session was not said once another session ran, and a cancelled Start dropped
  the notice;
- closing the app quit at once with an unwritten outcome held, and Windows ending the session did not try it;
- the notice was written into a later session's manifest;
- a second fenced child replaced the wait for the first;
- at the bound of four reads a further change was dropped with the older state shown as current;
- an answer whose card closed before it arrived kept its text on the device.

**Not covered by a test:** that a held record lets its picture's bytes go (read in the code only). **Not verified
on a real system:** the retry when Windows signs out or shuts down (the handlers are exercised under the test
fakes only), and the Save button being pressable after a Stop in WRITE or ASK mode, where the overlay stops taking
input (the overlay is destroyed within the Stop's bound; the control window then says what is unwritten).

## Follow-up after the lead's review of `c977df5` (the fence and the coalesced read)

One commit after `c977df5`, in `apps/windows/src/main/subscription.ts`, its test file and this folder only.
Synthetic connector only.

**The lead's finding.** In one chunk of the connector's output: `connection/changed`, a valid `connection/read`
answer, then an over-long line. The over-long line fenced the connector before the read's continuation ran; the
continuation then saw "answered" and "changed", sent the re-read, and so started a **second connector by itself** and
published `signed_in`. Reproducer `/tmp/windows-subscription-correction-fence-probe.ts`: `spawn_count` 2.

**What it does now.**
- `check()` remembers the connector its first read went to. A re-read goes only to that connector, while it is
  still this app's (`request(..., running)`, which never starts one).
- If a read was answered and that connector is no longer this app's, the state is `unavailable` with "the connector
  was lost while the account was being read". Nothing of the answer (state, plan, limits, models) is published.
- The app's quit fences the connector at once, as a line that is not the envelope's does (`fence()`), instead of
  reading it until its exit. The quit still waits for its end, bounded.
- The same rule for the other continuations in that file, found by the check of this follow-up (same class, each
  with a regression): a sign-in whose start was answered by a connector then fenced opens no page and is said as
  failed; a question refused as `unauthenticated` by a connector then fenced is not said as "signed out"; a browser
  that cannot be opened is not said as "the sign-in is still waiting" once that sign-in is over.

**The lead's reproducer on the corrected tree** (its two assertions of the defect taken out): `spawn_count` 1, one
`connection/read`, the original child exited, state `unavailable`.

**Regressions** in `tests/subscription.test.ts` (21 to 24 cases):
- the exact chunk above: one connector, one read, `unavailable`, no `signed_in`/`signed_out`/`unknown` said at any
  moment, a question refused without starting one, and only the user's Check starting another;
- a valid answer followed by the fence without any change; the fence during the re-read; the connector exiting as
  its answer is read; the quit with the first read out and with the re-read out, where the connector answers
  before it ends;
- **positive control**: the same chunk without the fence is one more read to the same connector, then published;
- the sign-in (fence, quit, and the control), the browser text (lost, cancelled, and the control), and the question
  (fence, and the control).
- Each fails on `c977df5`'s code; 9 mutants of the follow-up, all killed. Three more were equivalent: `live()`'s two
  conditions hold together in every state the code reaches, and a re-read is sent only after `live()` held.

**Runs.** The affected files (`subscription.test.ts`, `app-ask.test.ts`): 55 tests, 55 pass, on Linux
(`evidence/windows-subscription-ask/linux-fence.txt`) and on Windows, Electron 44.5.1 run as Node, no window
(`windows-fence.txt`); receipts `*-fence.json` carry the hashes of the files run, which are this commit's. The
whole suite on Linux against the Backend checkout at `1f7ec5b`: 296 tests, 291 pass, 0 fail, 5 skipped. `tsc` and
the build pass.

**Check of this follow-up.** A two-lens check with a second reviewer per finding: 6 findings, all confirmed, all
fixed above (four were the quit not being a fence, one the question's "signed out", one the browser text).

## Launch steps, element ids and evidence paths (for the first real check, on the released candidate)

**Configuration**, ready to use on this machine (a file anywhere on Windows, for example
`%TEMP%\lc-subscription-connector.json`; the paths are WSL paths):

```json
{ "format": "lc-windows-subscription-connector/v1",
  "launch": { "kind": "wsl", "distribution": "Ubuntu", "user": "agentsdock",
              "cd": "<Backend checkout at the released commit>", "python": "<that checkout>/.venv/bin/python" },
  "state_dir": null,
  "codex_bin": "/home/agentsdock/.local/bin/codex" }
```

`state_dir: null` uses the connector's own default product state (`~/.local/share/LearningCompanion/managed-chatgpt`
in WSL), apart from the development agents' state.

**Start** (PowerShell, a fresh profile, apart from the user's preview):

```powershell
$env:LC_SUBSCRIPTION_CONNECTOR = "$env:TEMP\lc-subscription-connector.json"
$env:LC_USER_DATA = "$env:TEMP\lc-subscription-profile"
& "<electron.exe 44.5.1>" "<staged app folder>"
```

(`node scripts/windows-stage.mjs`'s `buildAndStage` stages the app, as `scripts/launch.mjs` does.)

1. Press **Check connection** (`#subCheck`). `#subState` says the sign-in state; `#subQuota` the usage limits.
2. If not signed in: **Sign in with ChatGPT** (`#subLogin`), finish in the browser; `#subLoginCancel` cancels it.
3. Choose the model in `#subModel` (only models that take pictures are listed).
4. **Start** a capture; in the overlay press `[data-mode="ASK"]` and circle a region.
5. On the card (`#card`): `#question` (the question), `input[name="assistance"]` (hint / explain / full_solution),
   **Ask ChatGPT** (`#askSubmit`), **Cancel** (`#askCancel`), close (`#close`).
6. Read: `#badge`, `#cardText` (the selection's own text), `#askStatus`, `#answerBox` and `#answer` (the answer's
   text), `#askSave` (shown only while how a question ended is not written on this device), `#crop` (the picture). The overlay's `__lcOverlay.state().card` gives the card's text; the control window's
   state is `lc:sub-state`.

**What is kept**, under `<LC_USER_DATA>\captures\<session>\`:
- `asks\<sha256>.png`: the exact picture sent.
- `ink\<sha256>.json`: the exact ink document drawn into it.
- `asks\<selection>.json` (`lc-windows-ask/v1`): `image`, `context`, `ink_original`, and `requests[]`, each with
  `request_id`, `question`, `assistance`, `model`, `submitted_at`, `ended_at`, `outcome` (for an answer: its text,
  model, latency and the official thread and turn ids) and `shown` (true only once the overlay reported that it
  showed the answer).

## Gaps and next dependencies

- **Not run for real.** No real connector, sign-in, model call or display run. The first real image answer is the
  lead's and QA's bounded acceptance on the integrated source.
- **The released connector** was read, not run, by this role. This side follows the ADR's pinned shapes and the
  connector's own behaviour for cancel, Stop and sign-in events; a difference would show first at **Check
  connection**.
- **Typing in the overlay** needs the overlay window to take keyboard focus when its question box is clicked. That is
  not verified without a display run; the prefilled question lets Ask work without the keyboard.
- **The sign-in redirect** goes to the Codex app server's local port inside WSL; whether the Windows browser reaches
  it is the connector's and Support's to confirm.
- **While a sign-in is pending the connector answers a question as busy**, and a sign-in started while a question is
  out likewise; the app says so in the connector's fixed words.
- **The model choice** is kept for the app's run only, not stored.
- **macOS** reuses the connector, not this code.
- Continuous observation, audio, a physical pen and the full §7.1 gates are separate and remain open.
