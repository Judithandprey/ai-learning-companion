# The four-action nonvoice live driver for 52be105 — prepared, 2026-10-09

**Source and offline checks only.** No Windows, display, account, model, microphone or audio call was made, and no
resource was leased. The only local actions were preparing and checking a private source copy (below). This is the lead's
assignment `handoff_59edc35ceda51f82acabeb24e3edffb0`, on top of main `86e429c` (merged into `team/qa` as `f089243`).

The real-action ledger is unchanged at **0 of 4**. Executing the driver needs a separate exclusive allocation and the
decisions listed below. The consumed diagnostic budget (3 of 3) is not used.

## What it is

A prepared candidate plus an allocated single-run wrapper. They reuse the accepted diagnostic's runner, admission,
geometry and cleanup, and replace only the AI-disabled parts:

| Part | File |
| --- | --- |
| Candidate generator, the 62 steps, the connector configuration | `tests/e2e/windows/qa_live_candidate.mjs` |
| Live surface: `surface.html` plus an in-place card change, no reload | `tests/e2e/windows/surface_live.html` |
| All-action ledger and the pre-fixed evidence rules | `tests/e2e/windows/qa_live_ledger.mjs` |
| The allocated single-run wrapper | `tests/e2e/windows/qa_run_live_candidate.mjs` |
| The connector copy's live-path import check | `tests/e2e/windows/qa_live_copy_check.py` |
| Focused offline checks (20) | `tests/e2e/windows/test_qa_live_candidate.mjs` |
| The frozen candidate | [candidate-nonvoice-01/](../candidate-nonvoice-01/) |

- **Runner.** Byte for byte the reviewed r4 runner (Support `184f712`; attempt 3/3 passed 32/32). Only the one
  work-folder name differs, and a test asserts this. No new runner code.
- **Package.** Product `52be105`, the 77-file stage tree `531943a8…`, Electron 44.5.1, Edge: the same pins as the
  accepted diagnostic, compared by a test.
- **Connector.** The real connector is named for this one app process (`launchApp` with `sub: 'live'`, `-LinkDir`):
  - the private exact-source `52be105` Backend copy (`~/.local/share/lc-qa/subscription-source-52be105a148a`, 280 files,
    file for file equal);
  - the repository's Python;
  - the pinned codex 0.158.0 binary (`167c0148…`). The default launcher is 0.160, which the released gate refuses;
  - `state_dir` null, the product's own managed state.

  No fake bridge, fake media, fake geometry or development link is used anywhere.

## The run, step by step (62 steps)

1. **Surface and product.** The generated surface is owned, identified, full screen, and checked at 16 points, as in the
   accepted run. The product launches with the real connector.
2. **Check connection, once.** Then a stop before Start if any of these holds:
   - not signed in (signing in is the user's own step);
   - a pending sign-in or request;
   - the selected model takes no pictures;
   - the server states a usage limit as reached (an unknown quota does not stop).
3. **Start.** Control placement, Edge raised, the surface and its 16 points checked again. Then the **Start**: the
   policy fields are set to 4 requests / 1 minute / 60 s, the AI box is ticked, and the product's own Start handler runs.
   The policy the app actually took is checked (4 / 60000 ms / 60000 ms) and recorded. Talk is checked off.
4. **Action 1, the unattended whole-screen look.** It happens by itself. The wait also ends on a missed or refused look.
   The guard then requires the session on, `used` = 1, nothing out, a completed look, and no card up.
5. **Action 2, the circle.** The scene is checked at 16 points right before the circle's frame. Then ASK mode and one pen
   circle around card 0: the app asks for a hint by itself, with no Ask press and no text. The driver waits for the
   request to start, end and settle on the card, reads the card, and requires a new answer shown and `used` = 2.
6. **Action 3, the typed follow-up after a controlled screen change.**
   - The overlay's newest frame is recorded.
   - The surface draws 12 new cards in place. Their values were never shown before and are not numbers the request
     metadata holds.
   - The overlay must hold a new frame (another pixel hash and frame number) within 6 s.
   - The 16-point scene check runs.
   - A fixed question is sent, with no card value in it, at the product's default help level.
   - Start, end and settle are awaited, then a new answer must be shown and `used` must be 3.
7. **Action 4, the Stop/fence attempt.** The scene is checked, one more typed request goes out, and **Stop the AI**
   (`#liveStop`) is clicked as soon as it is out. The driver waits for the session to end and for the interrupted request
   to settle (up to 20 s, above the connector's 8 s bound). After a 5 s late-answer window it checks: session not on,
   nothing out, at most 4 counted. The card is read again.
8. **Wind-down.** The surface and its 16 points are checked once more; these are recorded but do not block the capture's
   end. The capture is ended, the app and Edge closed. Electron and Edge are cleaned up by exact identity; the connector
   and every descendant are observed until they are gone (never signalled).

Every guard is a required step. When the session has ended, an outcome is not a plain shown answer, or a count is not
exactly one more, the runner stops there. Every later action stays NOT_RUN. Nothing is retried, restarted or sent again,
and the steps hold no second Start, no `#liveStart` and no sign-in.

## Counting and evidence (fixed before any run; `qa_live_ledger.mjs`)

**Counting.**
- Each of the four slots counts from the moment it is assigned: the session started (the look), the stroke ran, or a
  typed Send ran.
- It counts whatever came of it: submitted, unknown and not_submitted alike. A trigger that failed before acting is
  named, and still counted (conservative).
- Ask presses are never what is counted.
- A second look, an extra request or a second Start (refused ones included) is counted and flagged.
- The total is cross-checked against the app's own count and its unwritten-line counter. A mismatch fails the ceiling.

**Transport.** "The whole picture at the provider boundary" requires all of these:
- the connector receipt for that request names a text and an image input;
- its image hash equals the app's own record of the whole frame;
- it was really submitted (`written` or `acknowledged`).

A receipt for a request that was never submitted reads "inputs prepared; not submitted". Any produced item other than
user message, reasoning or agent message (a tool, a command…) is flagged. The codex digest in the receipt is compared
with the pin.

**Pixels.** The card values exist only as canvas pixels, and the prompt carries earlier AI text as history. So:
- values named in the first look's text count (it has no history);
- for action 3, only values that are new after the change and absent from every earlier AI text count;
- a value from the old screen is reported apart;
- formatted values (`4,821`, full-width digits) are read;
- hedging is flagged;
- whether action 3's frame was taken after the change is checked.

The typed questions are checked for card values (a leak).

**Fence.** `fenced_*` requires all of these:
- Stop by the user (`ended` reason "stopped by you");
- the request out when Stop was clicked;
- a `settled` line for it after `ended`;
- no shown answer, in the record and on the actual card;
- no later request or look.

Otherwise the verdict is `unknown` or `not_fenced`. Because Stop follows as soon as the request is out, the likely
verdict is `fenced_before_submission`. A turn already at the provider would need another trigger (D4).

**Result.** The wrapper reports `mechanics_passed`, built from these terms:
- launcher, steps, collection;
- exact cleanup, and the connector and its children gone;
- ceiling with no retry or restart, all requests silent, four counted;
- the whole picture at the provider for actions 1–3, with no tools;
- fenced, and no value in the questions.

`acceptance` stays **NOT_JUDGED**. Every verbatim text is read by QA and the Lead; a matcher hit is necessary, never
sufficient.

## Checks (offline)

- [driver-checks.txt](driver-checks.txt): **20 pass, 0 fail**, with child processes withheld. They cover:
  - the candidate reproducing from the sources (its scratch reported apart);
  - the runner identical to r4 apart from the folder;
  - the package pins;
  - the connector configuration;
  - the steps: four actions only, one Start, one Check, no restart, sign-in, fake, link or OS input; every action
    guarded; scene checks right before each frame QA causes; the freshness wait; settle waits; Talk; quota;
  - the live surface, run in a VM: 50 changes, never a repeated or reserved value, same geometry;
  - the ledger: counting, unknown and not_submitted, failed triggers, not started, expiry leaving NOT_RUN, extra
    requests, restarts, the app-count cross-check, silence;
  - the fence cases, the transport cases and the pixel rules;
  - the wrapper: no run without `--execute`, an allowed output folder and a supplied hash; the allocation checks; the
    connector checks; the mechanics terms; the watch summary; and, with an exact allocation, a refusal at the connector
    checks before any Windows call, folder or process.
- [driver-mutants.txt](driver-mutants.txt): **27 of 27** targeted mutants of the ledger and wrapper logic caught. They
  include every survivor the review found.
- [candidate-check.json](candidate-check.json): the frozen candidate reproduces; its scratch is unused.
- [connector-copy-check.json](connector-copy-check.json): the private copy equals `52be105` (280 files, none missing,
  differing or extra). The connector's question path and live path (`chatgpt_live`, `live_session`) load entirely from
  the copy. This is offline: nothing is started or sent.
- [regression-checks.txt](regression-checks.txt): the accepted diagnostic's generator test passes 50/50.
  - Its wrapper test shows 26/28. This is **pre-existing**: since attempt 3 used the r4 scratch, that historical
    candidate's check refuses ("new uncreated TTS scratch required").
  - It is unchanged here and reported for the Lead. The new candidate's check reports a used scratch apart instead of
    refusing.

## QA-internal read-only review (before freezing, `wf_0b4db3a6-3ba`)

Three lenses reviewed the code, all instances of the same model; this is a perspective, not acceptance. They found:
- **Product behaviour against `52be105`:** all ids and handlers exist; the first look happens on a static surface; no
  step causes an extra request; the counts are right.
- **Ledger and wrapper logic.**
- **Rules and safety.**

35 findings in total; every must-fix and should-fix is applied:
- the scene check right before the circle's and the fence's frames;
- transport requiring a real submission;
- the fence requiring the out count at Stop, settling after it and a clean actual card;
- the frame-freshness wait before the follow-up;
- the look wait ending on a missed look, and the settle wait after Stop;
- the quota and selected-model stop before Start;
- the Talk-off check;
- the ledger's app-count cross-check, failed-trigger naming and not-started handling;
- connector release from the watch (descendants included);
- a guarded collection;
- mechanics separated from acceptance;
- the bound derived from the steps' worst case;
- the script-permission binding (AI-disabled approvals refused);
- the imported files pinned;
- the honest wording of the input method and of the receipt access;
- the surface avoiding metadata numbers;
- the formatted-number reading;
- the missing tests.

The remaining notes are the decisions below.

## Decisions for the Lead (engineering defaults, not approvals)

| | Default in this candidate | Why it needs a decision |
| --- | --- | --- |
| D1 | Typed follow-ups at the product's default help level **hint** | Hint may withhold the very values action 3 needs. `explain` or a generated-test `full_solution` would change the pins |
| D2 | Start through DevTools: the policy fields' value + input event, then the product's own Start handler (DOM click) | Whether this is the "actual UI Start", or OS typing is required (the runner's guarded `keys`) |
| D3 | Stop = **Stop the AI** (`#liveStop`, capture keeps running) | The alternative is capture Stop (`#stop`) |
| D4 | Stop as soon as the 4th request is out | Likely `fenced_before_submission`; a fence of a turn at the provider needs another trigger |
| D5 | Three 16-point scene checks inside the 60 s session, about 5 s each, no raise | Safety against session time: three real image turns must also fit; if the minute runs out, the rest stays NOT_RUN |
| D6 | Native bound at least the steps' worst case, **519 s** (the wrapper accepts 519–900 s) | The runner must not be cut off before its own cleanup |
| D7 | Connector processes are observed, never signalled; any left over means `connector_released: false` | Whether QA may end exactly its own descendants |
| D8 | Raw receipts kept under `out/private/` (they hold provider thread and turn ids); the ledger keeps the needed fields | Whether raw receipts may be committed |
| D9 | The circle on card 0, the follow-up asks for the top row; its wording says the cards changed | Focus versus off-focus values; cueing |
| D10 | codex_bin = pinned 0.158.0, state_dir null | As in the Lead prerequisites README, to be confirmed |

## Remaining admission prerequisites before a real run

1. Lead and Support review of the exact source (commit below) and of the candidate and wrapper pins; the decisions D1–D10.
2. A human/Lead **script permission** for this real-subscription runner (process-only RemoteSigned) and the command
   approval. The AI-disabled approvals are refused by the wrapper.
3. A fresh exclusive display and account allocation, following
   [allocation.template.json](allocation.template.json) (`qa-live-nonvoice-allocation/1`, inactive as written):
   - bound to the wrapper, candidate, payload, connector, native invocation and launch identity;
   - `native_bound_ms` from 519000 to 900000;
   - `real_actions_already_used` 0 and a valid window.
4. The user's managed sign-in present, and nothing else holding the managed-state lock (for example the user's own app
   with a connector). Otherwise Check connection shows it, and the run stops before Start.
5. At run time the wrapper rechecks: the stage files (77/77), the private copy (equal, nothing running in it, both paths
   load), the codex digest, the display, process and port preflight, and the scratch unused.
6. The Lead refreshes the stale 1755153 fields in `request-budget.json`.
7. After the run, QA reports the actual release of the display and account; the Lead updates the real-action ledger.

**Ready command, only after that allocation:**

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/e2e/windows/qa_run_live_candidate.mjs --execute docs/verification/qa/p0-13-live-52be105/execution-nonvoice-01 <allocation.json> <Lead-provided allocation sha256>
```

## Pins

| | sha256 |
| --- | --- |
| Candidate `candidate.json` | `694a1acccc6b572fecb9c1516dd8bfd1b5fc744232a9a5a4cb98bab1e456af3b` |
| Runner | `f372426256ab31d243dbea1a0bf8fa05a9af20d0bc4ae3e367f622af93a807be` |
| Steps (62) | `535bb56e32512177db30361925f797642e0c64b9902c8b7e73818d06d1ec154c` |
| Live surface | `be82967ae45d36bece4ac4858d6f45d0e90e58d088203b71323b74e6ae5e1067` |
| Connector configuration | `4729ca1a25ec09a64349c68c5ccb0eb41b4e9f83e161fb9c4a29b0ce26b948d4` |
| Wrapper `qa_run_live_candidate.mjs` | `aaa85a7b139acaa113ebd734bff28ab11b64d63d44d8bbc179801e3b2bff8206` |
| Scratch | `%TEMP%\lc-qa-live-nonvoice-c7fc94ca00bd47afaab06da3cef17913`, absent |

The candidate's `source_files` pin the 16 files the run depends on, including `qa_run_tts_candidate.mjs` (the
preflight) and `qa_sub_watch.py`.

## Limits

- **Never executed.** The product, connector, model and display behaviour were read from source and simulated in tests
  only. Latency is unmeasured, and whether three image turns fit in 60 s is unknown.
- **No physical input.** Only CDP and DOM input inside the product windows.
- **Scope.** One display configuration. Not covered: speech, captions, audio, voice slot, the second typed variant, other
  monitors, Mac, and the §7.1 gates.
- **A known risk.** The in-session scene check runs while the card is up. It passed with the overlay in NAV mode in the
  diagnostic, but never with a card shown; if the card were hit at a point, the run would stop there.
