# Managed-subscription ASK on Windows: QA acceptance plan

- **Status (2026-10-01): driver ready after one correction (the connector copy); controls and the real Check connection
  run; the real image turn NOT run and HELD.** 0 of the 1 allocated attempt is used. Results at the first candidate:
  [p0-13-subscription-ask-windows-3e4b406.md](p0-13-subscription-ask-windows-3e4b406.md).
- **Changed paths (later the same day):** the corrected source `c44e620` was retested offline, 86 tests, with the first
  candidate as the negative control:
  [p0-13-subscription-changed-paths-c44e620.md](p0-13-subscription-changed-paths-c44e620.md). Their display checks and
  every real request are NOT RUN. They wait for the exact integrated candidate of the live flow (section 7) and for a
  display, audio route and account window coordinated by the lead.
- **Assignment:** lead `handoff_de323dc5105b08860c398a13b7206dbd` (P0-13 / G4); driver task
  `handoff_16a192142160536115f6087460e33b77`; release `handoff_d548b28a9fa5613b7543be19858a5ca2`.
- **Released candidate:** `3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e` (Windows app tree of the owner's `84fc56a`).
- **Read:** [ADR 0003](../../adr/0003-managed-subscription-ask.md) (interface version 1), the user's decision
  [D-SUBSCRIPTION-FIRST](../../requirements/intent-and-decisions.md#subscription-first) ("先接入官方订阅") with R38, §3.8
  and G4, R04/R42/R52/R57, and the lead's
  [release note](../lead/subscription-ask/windows-release/README.md).
- **Budget:** exactly one real image submission, reserved by the lead for QA, conditional on the managed sign-in, a
  picture model, the generated surface and valid source and ink evidence. No automatic retry.
- **What exists** (in [tests/e2e/windows/](../../../tests/e2e/windows/), harness `0e210ed`):
  - `surface.html`, `judge_surface_answer.py` (rule fixed before any call; 31 self-test cases);
  - `qa_fake_bridge.py`: QA's stand-in connector for the deterministic controls; `qa_sub_watch.py`: a read-only
    process watch;
  - scenarios `surfacecheck`, `subcontrols`, `subselect` and `subtype` (probes), `subrehearsal`, `subcheck` and `subask`;
  - `analyze_sub.py` for all of them; `signin_launcher.mjs` for the user's own sign-in entry (its check runs in a
    folder of its own and lets go only of an exact launch identity it started, reading the complete process look:
    `signin_cleanup.mjs`, 42 offline tests with `signin_launcher.test.mjs`, which runs the launcher's own check with
    Windows played; and `signin_signal_check.mjs` for the two Windows commands);
  - `sub_copy.mjs` and `qa_sub_copy_check.py`: the private Backend copy is the commit's `services/` and `packages/`
    file for file, and the connector's own preparation of a question is run in it, offline, before any real run;
  - `sub_changed_app.test.mjs`, `sub_changed_bridge.test.mjs` and `sub_changed_backend.test.mjs` with `sub_tree.mjs`
    and `qa_connector_relay.py` (harness `ad33e77`): the offline retest of the changed paths on the released source
    itself, taken from `git archive` of the exact commits. `qa_fake_bridge.py` can now also play failed reads,
    sign-in start, cancel and completion, repeated "changed", its own exit and a connector that does not end;
  - `run.mjs` interlocks: the real connector needs `QA_SUB_ALLOW_REAL_CONNECTOR=1`; a real question needs
    `QA_SUB_ALLOW_REAL_TURN=<allocation id>`, which is single-use (a ledger outside the run folders).

## 1. The one real image turn

**Goal** (ADR 0003, "Acceptance and limits"): on the real Windows app, an explicit ASK sends the actual captured
selection with the user's ink through the official image input, and a successfully completed answer that correctly
identifies visual-only content appears in the same ASK card.

### The surface

- A QA-authored page shown full screen, so the whole visible display is generated, non-sensitive content. The run
  stops before Start unless the page reports that its viewport is the whole 1280×800 display.
- Twelve cards in a 4×3 grid. Each has a 4-digit number and a shape in a color. All are chosen at random when the page
  loads (`crypto.getRandomValues`) and drawn on a canvas.
  - Shapes: square, triangle, star, heart, diamond. Colors: red, blue, green, orange.
  - There is deliberately no circle and no purple: the test ink is a purple pen circle, and an answer that mentions
    the ink must not be mistaken for a card's shape or color.
- **The random content exists only as pixels.** Which number, shape and color a card has is in no file name, title,
  URL, DOM text or attribute, and in no fixture. The page's file holds only the vocabulary it draws from.
- The page hands its truth to the harness through DevTools. The harness keeps it in its private run folder for
  judging. It is never given to the app. The truth is read before Start, before the selection and at the press, and
  must be the same.
- **The page's own "full screen" is not proof of what is on the screen.** In the first dry check another app's window
  stayed above QA's Edge window and was what the app captured. So, before any capture, the top window under 16 points
  of the grid must be QA's Edge window. And before anything can be asked, the selected picture itself is read from its
  pixels in the page: twelve cards with a grey ground, a coloured shape and dark digits, white between them, and the
  pen's ring around exactly the two circled cards. Nothing of the truth is given to the page for this.
- The cards sit at fixed screen positions, so the strokes are planned before the page exists.
- **The mouse pointer.** The user's pointer may be in a captured frame (the app's capture call sets no cursor option;
  not measured). The run stops unless the pointer is outside the ASK region, checked before Start, before the
  selection and at the press. QA moves the pointer only in `subcheck` and `subtype` (OS clicks on the question box) and
  puts it back; never in the real turn.

### The ink and the selection

- The harness picks **two** of the twelve cards at random for each run (every pair equally likely) and circles each
  with one pen ellipse in WRITE. The input is DevTools-injected pen events (synthetic); the choice exists only as
  stroke coordinates.
- The digits end about 10 DIP inside the ellipse, so the ink does not touch them.
- ASK is pressed only after the app draws both strokes solid. The app draws a stroke dashed while it cannot verify
  what is under it.
- ASK then selects the whole grid. Naming exactly the two circled cards therefore needs both the pixels (the numbers
  are nowhere else) and the ink (the grid shows twelve cards; only the ink says which two).

### The question

Set in the ASK card's question box as the user's question, with no value of the surface in it (the driver assigns the
text and the level through DevTools; typing into the box was checked separately in `subcheck` and `subtype`):

> I circled two cards with my pen. Name only those two cards. For each one, write one line: the number written in
> the card, then the color and the shape next to the number.

**Assistance level: `full_solution`.** QA read the released prompt for each level
(`services/learning/subscription_ask.py`). `explain` ends "Do not reveal a full solution or the problem's final
answer" and `hint` "Do not reveal the final answer or a full solution"; a model that obeys could withhold the two
cards, and the one attempt would be unjudgeable for a reason that is not picture input. `full_solution` has no such
clause. Against it stands QA-SUB-03 (a turn with more than 4096 notifications is killed), which makes a long answer
risky; the question asks for two lines only. **Lead decision:** `full_solution` is approved only for this generated,
non-sensitive two-card recognition test with its two-line answer, not as a product default or for a learner's
homework; QA-SUB-03 is fixed before the turn. The analyzer follows the level the run used. The exact text sent is
recomputed from the app's retained request and compared with the connector's receipt.

### Judging rule (fixed now, before any call)

`judge_surface_answer.py` applies the rule (31 self-test cases); nobody reads the answer first and then chooses a rule.
Only the surface's own shape and colour words are judged; a word outside them ("purple", "circle") counts as not
stated, and the person reading the answer checks it.

**A matcher pass is necessary, never sufficient.** The right numbers merely occurring in the text do not show that the
answer asserts them. So:

- an answer with a negation, refusal or uncertainty marker ("are NOT 4271 or 8830", "I cannot see the image. Perhaps
  …", "maybe", "I guess", a question mark) is `held`: not a pass;
- every matcher pass still needs QA and the lead to read the full answer and confirm that it plainly states the
  identification. The full answer is kept verbatim in the evidence for that reading;
- a contradicted or guessed answer never passes.

The hold is a deliberately broad tripwire, not language understanding. A false hold costs one human reading.

| Outcome | Rule | Counts as |
| --- | --- | --- |
| `identified` | Names both circled cards' numbers and no other card's number; for each, its shape and no other shape, with its color as the color said nearest to the shape | **matcher pass**, then the semantic reading |
| `numbers_identified` | Both circled numbers and no other; a shape or a color is not stated, and none is stated wrong | **matcher pass on the image-only criterion**, reported as "shape or colour not confirmed", then the semantic reading |
| `held` | The numbers match, but the answer holds a negation, refusal or uncertainty marker | **not a pass**; the full answer goes to semantic review |
| `contradicted` | Both circled numbers and no other, but a stated shape or color of a circled card is wrong | not a pass |
| `several_cards` | Both circled numbers are named together with other cards' numbers | not a pass; reported in full |
| `wrong_cards` | Numbers of the surface are named, but not both circled ones | fail |
| `not_identified` | No number of the surface is named (a misread digit counts here) | fail |
| `no_answer` | Empty text | fail |

- **Chance.** A reader that sees the pixels but not the ink names the right pair with probability 1 in 66. The numbers
  themselves cannot be guessed. This is one call, so 1 in 66 is stated as the residual chance; it is not zero.
- The two circled numbers alone already need the image and the ink, which is why `numbers_identified` counts on the
  ADR's criterion. Shape and color cannot be read by OCR, so `identified` is the stronger result.
- **A completed turn is required.** An incomplete, errored or cancelled turn is never judged as an answer; it is
  reported as what it was.
- Account, login, quota or model-catalog success is recorded and checked as a precondition; it is never a pass of the
  image acceptance.
- A number written out in words ("four two seven one") is not recognized, neither as an answer nor as a leak.

### What must also hold for a pass

1. **The image really was the input.** The app's retained request holds one PNG whose sha256 equals the request's
   `image.sha256` and the selection the card shows. Its width and height equal the integer `region_px` width and
   height, and `region_px` follows the ADR's rule from `region_dip` (floor the scaled left and top, ceil the right and
   bottom, using the actual frame size).
2. **No leak of the truth.** `leaks()` looks for every card number, also written with separators, in these texts: the
   question, the card's text (without the app's own sentence of region, frame, capture time and ink revision, which
   is cut out before the search) and status before the press, the page's title and DOM text, the picture's and the
   record's file names, the prompt text (recomputed by QA with the released `prepare_subscription_ask` on the retained
   request, and a pass only if the connector's receipt hashes that same text), the request's context and the receipt.
   - A hit in free text voids the pass: the answer could then be echoed text.
   - A hit in the context or the receipt (sizes, counts, sequences) is listed and does not void it; so is a number of
     the prompt that equals one of the request's own sizes.
   - Hashes, UUIDs and timestamps are masked first; base64 is never searched. The page's URL is only required to have
     no query or fragment; no log and no response text is searched.
3. **The ink was in the image.** `ink_revision` and `ink_sha256` in the request are those of the retained ink
   document, which holds exactly two visible strokes. A required runner step waits until every stroke the app holds is
   drawn as verified (the run stops otherwise). The selected picture's ringed cards, read from its pixels before the
   press, are the ones the step asked for, which are the two circled cards.
4. **Exact provenance in the same card.** The app shows an answer only if its whole provenance equals the retained
   request and its mode is `chatgpt`: this is the app's own check, read in the source and shown with the stand-in's
   answer for another picture. QA cannot see the real response's provenance; it compares the retained request with the
   connector's receipt instead. The analyzer checks that the card names the selection's region, frame number and ink
   revision, and the model; the captured time and the time-taken figure on the card are not compared with the request.
   The session id and the hashes are in the kept record, not on the card. Latency and the official thread and turn
   identifiers are recorded.
5. **The answer is rendered as text.** The analyzer checks that the answer box holds no child elements and exactly the
   recorded text. That an answer cannot act in the app rests on the source review; it is not tested unless the real
   answer happens to hold markup.
6. **Exactly one turn, with the image, and no tool.** This needs evidence from the connector, not only the app's
   request (see section 5): one `thread/start` and one `turn/start` since launch; that turn's input is one text item
   and one image item whose bytes hash to `image.sha256`; the turn completed; it produced only the user message,
   reasoning and an assistant message. The record is the connector's receipt of that request. Without it QA reports
   "official image input: not shown" and does not pass this point on the app's request alone.
7. **Product language.** The answer is in simple English (R57). This is recorded; it does not decide the pass.

### Budget and stop rules

- The lead owns the ledger and has reserved **one** submission attempt for QA
  ([request-budget.json](../lead/subscription-ask/request-budget.json)). The allocation id is the release message's,
  `handoff_d548b28a9fa5613b7543be19858a5ca2`. Every real Ask press uses the attempt, also one that provably submitted
  nothing; "unknown" counts as spent. QA's harness enforces it: a second run under the same id starts only if the
  first provably stopped before the press.
- A completed or an incomplete submission each use one attempt.
- QA stops and reports, without another attempt, on any of:
  - a quota or rate-limit answer;
  - an unsupported image model;
  - a missing managed login. That is an official login step for the user to take, never something to work around;
  - any sign that a tool, shell, web or approval request was made or accepted.
- No retry on quota, no API-key fallback, no purchase and no account or model change.
- QA never opens, copies or prints auth files, cookies or tokens, never records the account's email and never logs
  the login URL.
- The product keeps its own Codex state folder, apart from the development agents' state. QA does not point it at
  any existing agent state, and infers nothing about the product's login or model from the development agents'
  accounts. If the product state has no managed login, the login is the user's own browser step.

## 2. Dry check and rehearsal before the real call

- `surfacecheck` (no link, no connection): **done**, 4 of 4. The page fills the display, the pen circles the two
  chosen cards, ASK selects the grid, the selected picture shows the cards and the rings. QA looked at the picture
  privately: twelve readable cards, two clear circles that touch no digit.
- `smoke`: **done**, 20 of 20 steps (the runner's Edge start had changed).
- `subrehearsal`: **done**. The real turn's steps with the stand-in bridge: every gate, the one press, the wait, the
  reads after it and the analysis ran, and the prompt is recomputed from the kept request with the Backend copy. (In
  the rehearsal at `3002218` that recomputation failed: the copy lacked `packages/`; in the first rehearsal it was not
  attempted. Corrected in `110c733`.) Its "answer"
  is SYNTHETIC text; every would-be pass about the turn is reported as `limit`.

None of this is acceptance evidence for the real turn.

## 3. Deterministic controls (separate evidence, labelled)

- **The seam** (as the lead corrected it): QA's stand-in is an outer bridge named as `launch.python` in the trusted
  connector configuration, so the app starts it exactly as it starts the connector. `LC_SUBSCRIPTION_CODEX_BIN` is not
  used for it: the official binary's admission stays pinned. The stand-in never gives a sign-in address and spends no
  allowance.
- **Run on the real app (`subcontrols`, 18 of 18):**

| Control | Shown |
| --- | --- |
| Off by default; nothing before the user's Check | no section without the configuration; with it, a capture, ink, a selection and an Ask start no child |
| Selecting without asking | the bridge received only the account read |
| An answer for the exact picture and question | the card shows exactly the stand-in's text (no markup in it, so text-only rendering is not tested here); recorded as shown |
| An answer bound to another picture (the only unbound case run) | not shown, not kept |
| `quota`, `busy`, `unsupported_model`, `invalid_request`, `failed`, `unavailable`, `unauthenticated` | each the app's fixed sentence; refused; never sent again |
| Cancel: confirmed, unconfirmed, and a late answer | said as such; the late answer appears nowhere |
| Stop with a question out | the session is stopped; the late answer is not kept; a later Start can ask |
| An over-long line while the app's re-read is out | the child is ended; none is started without the user's Check |
| App close | the app and the bridge end by themselves |

- **Not run on the display:** a sign-in address that is not an official HTTPS address; a tool or approval request from
  the official child; a malformed or oversize picture and a stopped session as the real connector answers them; screen
  text that reads like an instruction.
  - The stand-in sits at the app's boundary and cannot produce a tool or approval request from the official child. A
    refused sign-in address was not run because QA never presses Sign in and the stand-in gives no address.
  - These rest on the owners' tests and on the source review of section 4, except screen text that reads like an
    instruction: only the prompt's wording and quoting are covered; whether a model obeys such text is not shown.

## 4. Independent source review on the released commit

- QA's pre-run review of its own harness read the released app and connector closely and found QA-SUB-01 (a valid
  selection refused when a frame is sampled during the selection's encoding).
- A focused QA source review of what the display cannot show (sign-in and secrecy; isolation and tools; input,
  provenance and the lifecycle fences) is recorded in the result document: QA-SUB-02 to QA-SUB-08 and what was found
  to hold. QA-SUB-03 (a turn with more than 4096 notifications is killed) is a risk to the one attempt.
- Findings go to the lead with file and line. QA makes no production fix.

## 5. What the real turn still needs

- **The corrected source**: combined `8eac9fc` was actually adopted by QA as `75fa327` for offline changed-path preparation. Backend02/03 and Web01/04–08 have source/synthetic corrections; independent changed-path display acceptance is still pending. Further reviewed Windows lifecycle source integrates as `ba30b46`, with quit-report persistence still assigned to Web. Use the Lead’s next exact released candidate, preserving completed preparation rather than repeating the18 controls. QA stages that exact commit and makes its Backend copy from it. The harness checks
  the copy before any real run (file-for-file comparison, and the connector's own preparation of a question run
  offline).
- **The user's sign-in**, through the start file QA prepared and checked up to the Check connection press. QA does not
  sign in, sees no address and no token, and does not use the display or poll the sign-in while the user may use it.
  The sign-in entry and the product's sign-in state are kept.
- Then a retest of the corrected paths only, and one `subask` run. It is judged by `analyze_sub.py` with the receipt of
  that one request (`receipts/<launch>/<sha256(request_id)>.json`, the only thing QA reads in the product state) and by
  a person reading the full answer. The 18 controls and the sign-in checks are not run again.

## 6. What will not be claimed

- One completed image turn is not continuous screen understanding, and it is not either complete §7.1 gate.
- The pen is injected (synthetic); no physical pen is used.
- Nothing is claimed for macOS, audio, video, Notability, or for any model or plan other than the one actually used.
- The deterministic controls and the rehearsal are not real-model evidence. A signed-in account, a model list or a
  usage figure is not a pass.

## 7. Changed flow: the live desktop companion (prepared cases, all NOT_RUN)

Amended in place by the lead's `handoff_a6d4a4baf7e368565b8de52e935a3d91`, `handoff_795e97b1731ce5bc73182d8a90f07082`
(baseline `9b33a7675fe98ab30e5c79952668906ff7ef232a`) and `handoff_b2436c62d2d68f07d104e3f0bbd917f2` (main
`c3afc6dc8b45e2979c0a74a01b03b8972c903e04`, merged into `team/qa`). This is the same acceptance task, not a second
campaign. The runtime pass waits for the exact integrated release; a Backend candidate still in review is not it.

- **Read for these cases:** [ADR 0004](../../adr/0004-live-desktop-companion.md) (`lc-subscription-live/1`), main
  specification §3.8, §7.1 and §7.3 with their English text, the
  [current live-workflow directive](../../requirements/intent-and-decisions.md#current-decisions), the original-goal
  cases changed in the same commit, and the lead's [checkpoint](../lead/live-windows/README.md).
- **State of the product:** the interface and its schema checks exist (`packages/contracts/live_companion`); the
  connector, Learning and Windows consumers are unfinished. There is no runnable candidate, so nothing below has been
  run and nothing is prepared in code that would guess at an unfinished consumer.
- **The user is using the old `3e4b406` package now.** QA does not use the display, the microphone, the speakers, the
  account or its files, and does not close, restart or overwrite that app, its stage folder, its profile or its
  connector copy. The new candidate gets its own stage folder and its own connector copy.
- **Real requests:** the one unused selected-image attempt (`handoff_d548b28a9fa5613b7543be19858a5ca2`) is not renewed and
  does not cover this flow. The product's own bound (12 submissions in 5 minutes by default) is not QA's allowance.
  **Open for the lead:** how many real turns the one changed-flow pass may spend. The smallest set that shows the flow
  is four: one automatic focus answer, one text follow-up, one voice follow-up with its spoken reply, and one request
  that Stop must fence. Every press that may reach the provider counts, also when its outcome is not known.
- **When it runs:** only on the exact released candidate, on a generated non-sensitive screen, with the display and
  the audio route coordinated by the lead. Each real case is judged by a person reading the whole answer, as in
  section 1.

| Case | What is done | Passes only if | Not a pass |
| --- | --- | --- | --- |
| LIVE-00 exact running build | Start the new package from its own folder; read the version the app shows and the files it runs | the running version and files are the released candidate's; the old package, its profile and its sign-in still open as before | a build or a source commit named in a document; the old package replaced or stopped |
| LIVE-01 Start says and does it | Press Start on the generated screen; make no selection and ask nothing | the app names the one display it observes, shows the remaining requests and time, and shows when it last observed and what the model last received; no answer card appears by itself; no other display and no microphone is turned on | local screenshots only; "online" shown without a receipt; a help card from an observation |
| LIVE-02 the whole screen reaches the model | The screen holds random values far from any circle; they change between two questions | an answer names values that are only in the pixels outside the focus, and the later answer names the changed values; the kept turn names the whole display's picture (hash, size) | an answer that could come from a crop, from the prompt, from page text or from a fixture |
| LIVE-03 circle gives a hint by itself | Draw one valid circle; press nothing else and type nothing | one contextual hint appears for that focus; the turn carries the whole picture plus the focus rectangle of the same frame; the help stays within the current help level (a hint is not a full solution). What is counted is the requests the connector really received, not presses of the old Ask button | a second Ask press or typed text needed; only a crop sent; a full solution because a region was chosen; an old Ask click counted as the new flow |
| LIVE-04 ink is in the same context | Write with the pen, then circle | the ink is in the picture the model received and in the kept context, with its revision | ink only on screen, or only in a separate file |
| LIVE-05 typed follow-up | Type one follow-up after LIVE-03, then one that changes the direction | each is answered in the same context (same session, focus kept only if its anchor is still valid); the later answer follows the new direction; what was left out of the bounded history is said, not hidden | a new context that has lost the screen or the earlier exchange |
| LIVE-06 spoken follow-up | Press Talk and speak one question; a teacher's voice plays meanwhile | only the user's explicit Talk becomes a question; the other voice does not; if this machine cannot hear or recognise English speech, that is shown and the case is recorded as blocked | a saved recording uploaded; a transcript taken as proof of who spoke |
| LIVE-07 spoken reply and its caption | With Talk on, get one spoken reply; then mute during a reply | every spoken reply has a floating caption with the same words, in step with the speech, and the caption is readable where it floats (not clipped, not hidden inside the card); the words shown and spoken come only from the response that is current in the app's own trusted state; nothing is spoken for a silent explanation; mute stops the speech and its queue at once, and unplayed words are not shown as spoken; shown and played are recorded apart from generated | speech without caption; caption ahead of the speech; words of an older response; speech synthesised in memory with nothing audible |
| LIVE-08 Stop and interruption | Stop before a request is sent, while one is queued or being written, and while one is in flight; ask something new while an older answer is still on its way; then reconnect | nothing queued is sent afterwards; a late answer, and an older completion that arrives after a newer one, is not shown, spoken or captioned; old speech stops; an observation that has nothing to do with it does not cancel a focus answer in flight; nothing resumes after a reconnect or a quota reset; only a new Start with a new session continues | Stop that only hides the card; a retry by itself |
| LIVE-09 the session's bounds | With the stand-in connector only: use up the shown requests and the time | the count and the time are shown and enforced as a hard limit (12 requests, 5 minutes unless the release says otherwise); an uncertain request still uses its slot; nothing is renewed by itself; observations keep their minimum distance and leave visible gaps; what the app shows as left is what the connector really allows | bounds checked by spending real requests |
| LIVE-10 truthful usage refusals | With the stand-in connector only: each refusal category in turn | each of allowance exhausted, rate limited, ordinary usage not allowed, allowance unknown, workspace limit, not signed in, unsupported model, context limit and overloaded has its own fixed wording and its own "sent / not sent / not known"; a balance that is not known is not shown as zero or as available; a full local window alone does not block; no reset credit is consumed, nothing is bought and nothing is retried. A real refusal is recorded only if it happens; none is provoked | one "usage limit" text for all; a provider message shown raw |
| LIVE-11 movable toolbar and captions | Drag each by its handle; reopen; change scaling; move to another monitor and remove it | dragging sends no request, draws no ink and changes no selection or source anchor; the position is kept after reopening; both stay inside a usable work area. Other scaling and a second monitor are run only if such a display is released for the test; else those parts are blocked | a control lost off screen; a drag taken as a circle |
| LIVE-12 save and reopen the ink | Save a note with ink, close, reopen | the original strokes come back editable with their source, and AI additions stay separate | a flattened picture; ink lost after a restart |
| LIVE-13 one interface per connector | With the stand-in connector only: mix the two interface versions in one launch | mixed versions are refused; the selected-image interface still behaves as in the retained controls | old fields reinterpreted |

What the record of the pass will hold: the candidate and the version actually launched; the whole picture with the
focus, ink and context that were sent; the model, the sign-in kind and the latency; the automatic focus answer; the
typed and the spoken follow-up; the spoken reply with its caption; the drag, scaling and navigation checks; Stop; and
any usage refusal as it really happened. Build, offline, real Windows, real subscription, real audio and Mac are
reported apart. A schema or fixture pass closes none of the real gates.

Not claimed by this section: both §7.1 gates, continuous understanding beyond the changes actually shown, any Mac
result, real audio from offline synthesis, or anything about the user's own account balance.
