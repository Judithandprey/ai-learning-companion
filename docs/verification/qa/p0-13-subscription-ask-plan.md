# Managed-subscription ASK on Windows: QA acceptance plan (preparation)

- **Status: preparation only. Nothing here has been run.** No display was claimed, no provider, login or account call
  was made, and there is no executable candidate yet.
- **Assignment:** lead `handoff_de323dc5105b08860c398a13b7206dbd` (P0-13 / G4), conditional on the lead's exact
  integrated release, the shared display and an activation budget.
- **Baseline read:** pushed `1b7c90558165c87c83564b1d6c777905923b8528`, merged normally into `team/qa` as `0c161b3`:
  - [ADR 0003](../../adr/0003-managed-subscription-ask.md): interface version 1 with its exact connection, result and
    provenance shapes, ownership and limits;
  - the user's decision [D-SUBSCRIPTION-FIRST](../../requirements/intent-and-decisions.md#subscription-first)
    ("先接入官方订阅"), with R38, §3.8 and G4 as updated by it;
  - R04/R42/R52/R57 and the other current decisions.
- **Budget now: zero real calls.** The lead releases the executable and the exact remaining budget after the source
  and isolation review.
- **What exists now** (in [tests/e2e/windows/](../../../tests/e2e/windows/)):
  - `surface.html`: the generated test surface.
  - `judge_surface_answer.py`: the judging rule, fixed before any call, with its self-test.
  - scenario `surfacecheck`: a dry check of the surface, the ink and the ASK selection with no link and no provider.
  - Runner steps for it: a full-screen Edge start, a full-screen request through DevTools, a pointer check and a
    raise without maximizing. They are untested until the display is given.
  - Two reviewers checked this preparation (false-pass paths and the judge; the surface and scenario code). Their
    findings are in this version.
  - The real-turn scenario and analyzer are written once the released code shows the ASK card's controls and where
    the app keeps its request and response evidence.

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
  judging. It is never given to the app. The truth is read before Start and again before ASK and must be the same.
- The cards sit at fixed screen positions, so the strokes are planned before the page exists.
- **The mouse pointer.** The user's pointer is in every captured frame and QA never moves it. The run stops unless
  the pointer is outside the ASK region, checked before Start and again before ASK. The display owner is asked to
  park it at the right edge.

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

Typed into the ASK card as the user's question, with no value of the surface in it:

> I circled two cards with my pen. Name only those two cards. For each one, write one line: the number written in
> the card, then the color and the shape next to the number.

The assistance level is the one that allows a direct factual answer (`explain`, unless the released UI names it
differently). Before the call QA reads the released prompt for each assistance level, to confirm that the chosen
level does not forbid stating what is visible. The exact text sent is recorded from the app's retained request.

### Judging rule (fixed now, before any call)

`judge_surface_answer.py` decides (21 self-test cases); nobody reads the answer first and then chooses a rule.

| Outcome | Rule | Counts as |
| --- | --- | --- |
| `identified` | Names both circled cards' numbers and no other card's number; for each, its shape and no other shape, with its color as the color said nearest to the shape | **pass** |
| `numbers_identified` | Both circled numbers and no other; a shape or a color is not stated, and none is stated wrong | **pass on the image-only criterion**, reported as "shape/color not confirmed" |
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
- Account, login, quota or model-catalog success is recorded but is never a pass.
- A number written out in words ("four two seven one") is not recognized, neither as an answer nor as a leak.

### What must also hold for a pass

1. **The image really was the input.** The app's retained request holds one PNG whose sha256 equals the request's
   `image.sha256` and the selection the card shows. Its width and height equal the integer `region_px` width and
   height, and `region_px` follows the ADR's rule from `region_dip` (floor the scaled left and top, ceil the right and
   bottom, using the actual frame size).
2. **No leak of the truth.** `leaks()` looks for every card number, also written with separators, in each text QA can
   read: the question, the retained request and response, the prompt text (recomputed by QA with the released
   `prepare_subscription_ask` on the retained request), file names, the page's title, URL and DOM text, and logs.
   - A hit in free text voids the pass: the answer could then be echoed text.
   - A hit in a named numeric field (a size, a count, a sequence) is listed with its field and does not void it.
   - Hashes, UUIDs and timestamps are masked first; base64 is never searched.
3. **The ink was in the image.** `ink_revision` and `ink_sha256` in the request are those of the retained ink
   document with the two circles. The app reports both strokes as verified before ASK, and the selection PNG shows the
   solid stroke color at planned points of both ellipses.
4. **Exact provenance in the same card.** The response's provenance has exactly the ADR's shape
   (`request_id`, `question`, `assistance`, `image {sha256, width, height}`, `context`) and equals the retained request
   field by field, nulls included, with no base64 and no credential in it. The card shows the answer text together
   with those source facts: capture session, frame, captured time, region, ink revision and hashes. It also shows the
   actual model and `auth_mode: "chatgpt"`. Latency and the official thread and turn identifiers are recorded.
5. **The answer is rendered as text.** No HTML or command in it is executed.
6. **Exactly one turn, with the image, and no tool.** This needs evidence from the connector, not only the app's
   request (see section 5): one `thread/start` and one `turn/start` since launch; that turn's input is one text item
   and one image item whose bytes hash to `image.sha256`; the turn completed; it produced an assistant message and no
   command, tool, approval or web item. Without that record QA reports "official image input: not shown" and does
   not pass this point on the app's request alone.
7. **Product language.** The answer is in simple English (R57). This is recorded; it does not decide the pass.

### Budget and stop rules

- The lead owns the ledger. QA makes no real call before the lead names the exact number of submission attempts
  assigned to QA. The plan needs **one**.
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

## 2. Dry check before any real call (`surfacecheck`)

Run once on the released build, when the lead gives the display, with **no link and no provider**:

- the page fills the screen and reports that every card is at its planned place; QA's own screenshot is checked for
  the cards at the planned pixels;
- the pen circles the two chosen cards and ASK selects the grid;
- the pointer is outside the region and both strokes are drawn solid;
- the local card shows the composed selection, which QA inspects privately for legibility: twelve readable cards and
  two clear circles that touch no digit.

No model call is spent on a surface or a stroke that does not work. It is not acceptance evidence for the real turn.

The same display window also runs the existing `smoke` scenario once. The runner's Edge start was changed for the
full-screen option, and `smoke` confirms that the ordinary start still works.

## 3. Deterministic controls (separate evidence, clearly labelled)

These use a fake child in place of the official one, as the lead allows. They are labelled "deterministic control, no
real model" and are never mixed with the real turn's evidence. The ADR names the trusted launch settings
`LC_SUBSCRIPTION_CODEX_BIN` and `LC_SUBSCRIPTION_STATE_DIR`; if the release supports them for this purpose, the fake
child is a QA-owned program given through the first, with a QA-owned empty state folder. Their exact form waits for
the released code; the cases come from ADR interface version 1.

| Control | Expected |
| --- | --- |
| Cancel before submission | No `turn/start` is sent later; the card shows no answer; no late text appears |
| Stop while a turn is in flight | The request is cancelled and its late result is suppressed. No further ask is accepted for that capture session; only a later explicit Start with a different session may ask again |
| Late result after cancel | The text never reaches the card or the retained answers; uncertainty about the interruption is said, and no quota rollback is promised |
| A tool or approval request from the child | Rejected; no action is taken |
| Unauthenticated, busy, an unsupported image model, a malformed or oversize image, a stopped session | Each refused before submission with its closed error code (`unauthenticated`, `busy`, `unsupported_model`, `invalid_request`, `session_stopped`), shown as the app's fixed text, never a raw error message |
| `ask/cancel` answers | `cancelled: true` fences local submission and presentation; `uncertain: true` is shown as an unconfirmed interruption |
| A login URL that is not HTTPS, has userinfo, or is not `openai.com` / `chatgpt.com` or a subdomain | Not opened; nothing of it is logged |
| A quota answer | Shown as `quota`; no retry and no fallback |
| EOF or app close | The connector and its child end within the bounded interval; nothing is left running |
| Start, writing and capture with the connection enabled, but no ASK | The fake child receives no `turn/start` at all |
| Screen content that reads like an instruction | It is learning material only: no action is taken and no tool is used. If the lead assigns a real attempt for it, the surface gets one visible instruction line; otherwise only the control runs |

## 4. Independent source review on the released SHA

Before the run, QA reads the changed code for:

- **Auth:** only the official managed calls; no auth file is opened or copied; no token, cookie or email reaches logs
  or evidence; API-key and other auth modes are not accepted as this mode.
- **Isolation:** a dedicated empty work folder and no project instructions. Shell, hooks, MCP/apps, web and
  computer-use are disabled by actual configuration, and the isolation is verified before any inference.
- **Input:** the request's limits and rectangle checks; one image; source facts supplied by the trusted main process;
  unknown URL, version and media position stay null.
- **Cancellation:** the fences before `turn/start`, after submission and after Stop; no retry of an uncertain turn.
- **Lifecycle:** a private child of a private child, with no listener and no daemon; bounded cleanup.
- **Presentation:** model text is rendered as text and kept apart from the originals.

Findings go to the lead with file and line. QA makes no production fix.

## 5. What QA needs from the release

- The exact released SHA, the display and the number of attempts assigned to QA.
- How QA enables the connection for one app process, and whether the fake child may be given through
  `LC_SUBSCRIPTION_CODEX_BIN` for the controls.
- Whether the product state already holds a managed login made by the user. QA does not log in.
- **A sanitized record of the turn from the connector**, or the lead's permission to read only that turn's own record
  in the product state folder (never an auth file). It should hold:
  - the input item types of the one `turn/start`, with the text's length and sha256 and the image's byte length and
    sha256;
  - the terminal turn status and the item types the turn produced;
  - the counts of `thread/start` and `turn/start` since launch;
  - the model the server reported, the Codex path and version, and whether `LC_SUBSCRIPTION_CODEX_BIN` was set.
- That the display owner parks the mouse pointer at the right edge of the screen before the run.
- Where the app retains the request and the response, and the ASK card's element ids for the question, the
  assistance level and the answer.

## 6. What will not be claimed

- One completed image turn is not continuous screen understanding, and it is not either complete §7.1 gate.
- The pen is injected (synthetic); no physical pen is used.
- Nothing is claimed for macOS, audio, video, Notability, or for any model or plan other than the one actually used.
- The deterministic controls are not real-model evidence.
