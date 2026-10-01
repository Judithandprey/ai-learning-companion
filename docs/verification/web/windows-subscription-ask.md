# Windows app: managed ChatGPT subscription and the selected-image ASK

Lead task `handoff_df27ff4f` ("先接入官方订阅"), with the pinned shapes of `handoff_8c4fdb6a`. The design is
`docs/adr/0003-managed-subscription-ask.md`, read at main `1b7c905`; the released connector
(`services/worker/connectors/chatgpt_local.py`) and Learning's seam (`services/learning/subscription_ask.py`) were
read at main `871aabd`. The written paths are `apps/windows/**` and `docs/verification/web/**`. No shared, contract,
service, dependency or root change.

**Status: implemented and tested against a synthetic connector only. No real provider call was made, no sign-in was
done, the released connector was not run by this role, and the real app was not run on the display.** This is the
selected-image ASK only: it is not continuous observation, and no real AI answer has been accepted.

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
  is the cancel's own answer (`uncertain`), or the Stop's (`interrupt_unconfirmed`). The app waits for that answer
  (bounded) and says "confirmed" only then; an error, no answer or a lost connector is "not confirmed".
- **A stopped capture session** is remembered for the app's life: its question out is cancelled, the connector is
  told (`session/stop`) by the Stop itself, and no question of it is ever sent again, whatever child runs.
- **A lost connector** is never replaced by the app itself, not even to cancel what it had: only the user's Check or
  Sign in starts one. A line that is not the envelope's fences the child at once (nothing more of it is read).
- **A sign-in's completion** that the connector writes together with its start's answer is taken as that sign-in's.
- **End**: the end of its input, a bounded wait, then this child alone is killed. The app's quit waits for it.

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
- **A new selection, or the card closing** (`lc:ask-closed`), cancels the question out for the selection before and
  makes it no longer askable, whether or not the new one is retained. **Stop** (and every other end of the session)
  fences the session at once. **Quit** waits for the connector to end.
- The control window's presses (`lc:sub-check`, `lc:sub-login`, `lc:sub-login-cancel`, `lc:sub-model`) are taken
  only from the control window.

## Checks

All with a **synthetic** connector: a stand-in that speaks the envelope in-process (`tests/subscription-fakes.ts`,
behaving as the released connector does for cancel and Stop) and a small real child process for the pipes
(`tests/fake-connector.mjs`). No Codex, no ChatGPT, no sign-in, no network. Every "answer" is text a test wrote.

- `tests/subscription.test.ts` (18): the question, rectangle, account, sign-in address and provenance rules (every
  member of the provenance changed in turn; a `__proto__` stand-in; an answer of 32,000 astral characters); the
  configuration; nothing started before a check; the exact launch, its `stdio` and environment; the sign-in (opened
  only on the press, only at an official address; completion, failure, cancelled elsewhere, another product's
  completion, cancel, a completion in the same chunk as the start's answer); one question sent once, a second
  meanwhile not sent; an unbound answer not returned; errors as fixed texts (an error code named like a built-in);
  cancel (confirmed, unconfirmed, an answer arriving anyway, a cancel never answered); a stopped session; no answer in
  time and a lost connector (no new child by the app itself); a connector that cannot start, has no pipes, answers in
  another form or writes an over-long line; lines split inside a character and several in a chunk; a real child over
  real pipes ended by the end of its input.
- `tests/app-ask.test.ts` (20), the real `main.ts` and `overlay.ts` under the unit-test fakes: off by default; a bad
  configuration; capturing, writing, erasing, undo, redo, retained frames and selecting send nothing, unchecked and
  signed in; the selection retained as exact bytes, facts and ink, with the mode before (WRITE and NAV) back at
  once; the ink taken before the picture is encoded; the pixels worked out by the main process; Ask sends what the
  main process retained and shows the answer as text on its card; Cancel; Cancel crossing an answer; a new selection;
  closing the card and an empty selection; Stop (the connector told by the Stop itself); the app's own fence when the
  layer below forgets to cancel; refusals and no answer never resent; what cannot be written is not asked; a page's
  claims checked by the main process; every new request taken only from its own window; the control window's presses
  and texts; quit waits for the connector.
- Each rule's check was run against the code with that rule removed and fails there (the review's mutants included).
- The whole `apps/windows` suite on Linux against the released host at main `a46a00d`: 279 tests, 274 pass, 5 skipped
  (the owned flows); without a Backend 234 pass, 45 skipped. `tsc` and the build pass.
- On Windows (Electron 44.5.1 run as Node, no window): the two new files and the affected ones, 78 tests, 71 pass,
  0 fail, 7 skipped (the Backend and POSIX-only cases); `evidence/windows-subscription-ask/windows-focused.txt`.
- On Linux the two new files and the affected overlay and lifecycle files: 65 tests, 65 pass
  (`linux-focused.txt`). Both receipts (`*.json`) carry the SHA-256 of the 63 source and test files run, which are
  the code commit `68b4cd9`'s.

**Review.** An independent four-lens review (the connector module, the main process, the two windows and their
texts, the tests), each finding verified by a second reviewer, found 16 defects and gaps; 19 more were reported
unverified. All are fixed or covered: the cancel's uncertainty was read from the wrong answer; a lost connector was
silently replaced to send a cancel; a replaced or closed card left its question live; the card said "sent" before
that was known; a sign-in's completion in the same chunk was dropped; an over-long line did not fence the child; the
provenance comparison could be fooled through `__proto__`; the POSIX launch could not run the real connector (it is
removed); and the tests did not pin the ink snapshot, the main process's own pixel mapping, write-before-send, the
quit wait or the sender checks.

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
   text), `#crop` (the picture). The overlay's `__lcOverlay.state().card` gives the card's text; the control window's
   state is `lc:sub-state`.

**What is kept**, under `<LC_USER_DATA>\captures\<session>\`:
- `asks\<sha256>.png`: the exact picture sent.
- `ink\<sha256>.json`: the exact ink document drawn into it.
- `asks\<selection>.json` (`lc-windows-ask/v1`): `image`, `context`, `ink_original`, and `requests[]`, each with
  `request_id`, `question`, `assistance`, `model`, `submitted_at`, `ended_at`, `outcome` (for an answer: its text,
  model, latency and the official thread and turn ids) and `shown`.

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
