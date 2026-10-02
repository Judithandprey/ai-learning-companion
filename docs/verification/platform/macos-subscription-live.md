# macOS: a bounded live AI session on the captured display, through the user's subscription

**Current delivery status:** the lead confirmed bounded MAC-LIVE-01/02 corrections in
`3147291` + `4f6c327`, then held that pair for reproduced MAC-LIVE-03 at
`8467e0a55113455f62067d97a8774dca889c3d88`. The latest bounded follow-up is
[correction-02](macos-subscription-live/correction-02/README.md); the preceding correction's
evidence remains in [correction-01](macos-subscription-live/correction-01/README.md).
Original checks/failures below remain historical and do not certify later source.

Task: the lead's `handoff_0f6c7eb731ba62d9ea3ed600c84b10ca` (existing P0-03/11 → P1-02; the
released continuation of the approved subscription ASK). Baseline: main `fe0156c`, merged normally
into `team/ios` as `5d8d121`; the hosted macOS run `36902046846` on `fe0156c` passed before this
work started (mail `handoff_3cc0dc00e8d03bddf4f1332204950ed9`). The interface is
[ADR 0004](../../adr/0004-live-desktop-companion.md), private version `lc-subscription-live/1`.
Read for this task: the ADR, `packages/contracts/live_companion` (schema, `validate`,
`carry_focus_into_followup`), `services/worker/connectors/chatgpt_live.py` and `chatgpt_local.py`,
`services/learning/live_session.py`, the Windows consumer on `team/web` as a reference, and the
current decisions with §3.8, 7.1–7.3 and 7.7.

**Scope.** Writes only `apps/macos/CompanionDesktop/**`, this record, its evidence folder
[`macos-subscription-live/`](macos-subscription-live/) and its index entry. No dependency,
contract, CI, shared-file or mobile change. The app has no OAuth or provider code of its own: the
connector and Codex own the login, the tokens, the session's enforcement and the model call.

**Execution boundary.** No sign-in, model call, account, paid API or device was used, and
no Codex was started. Nothing was built or run on macOS: the library and its tests were
type-checked and run on a Linux harness with stand-ins for the Apple frameworks, and the app
target (SwiftUI/AppKit) was only parsed, except for the controller class, which was type-checked
against the library's public interface with small stand-ins. The hosted macOS build is the lead's.

**Interrupted and resumed.** The retained work stopped after the old role exhausted its weekly
quota. On 2026-10-02 the user migrated this same role to Codex GPT-6.1 Sol Ultra and authorized
completion of the existing assignment. HEAD `5d8d121` and every supplied dirty-file fingerprint
were preserved at recovery. The current canonical identity map and granted lead route were used;
the migration/actual-work checkpoint was accepted by the lead route before delivery.

The persistent harness cache survived, but its `/tmp` toolchain did not. The official Swift
6.3.3 Ubuntu toolchain and development headers were restored through exact-command approval;
Apple stand-ins, scripts and archived reviews were recovered read-only. The saved review
`wf_b5a53f7b-76f` confirmed three app findings. The resumed `wf_3bef1058-219` has an empty
result after its four reviewers exhausted quota: that is **not review approval**. Current
independent source reviews and new executed logs are retained below. Reviews identify their
own snapshots; [the source manifest](macos-subscription-live/source-sha256.json) identifies the
final source, and [the results record](macos-subscription-live/verification-results.json) states
which checks used it. The later lead documentation baseline read at this safe boundary is
`93491798a000a61328a63f7588916bf6f43ddc42`; it changes no app or released live contract.

## The one flow

| Step | Behaviour |
| --- | --- |
| Configuration and child | Unchanged from the subscription ASK: `ask-connector.json` names the interpreter and repository; the connector is this app's own foreground child (`<python> -m services.worker.connectors.chatgpt_local`), with the minimal environment and private pipes. The first line this app writes is of `lc-subscription-live/1`, which pins that child to this version; the app never writes an `lc-subscription-ask/1` line to it. A line from the child may be up to 1 MiB (the bound of this version); a longer one is not a connector line and ends the child. |
| Connection and usage | Connect / Check Again reads `connection/read`: the managed sign-in, the plan, the models, and the account's usage (`quota`) in its exact shape. The usage is shown as reported, with the time it was read: unavailable is "not known; this is not zero"; a missing allowance flag is "not reported"; a balance is the server's own text and "not an amount of money"; nothing is computed or estimated, and no reported usage fact refuses or allows anything by itself. It is read only by such a read (the user's, a `connection/changed` event, or after a refusal that says the account is not signed in), never per frame. A read that the connector answers `busy` during a session leaves the connection and the session as they are. Sign-in is the official page in the browser, on the user's click, as before. |
| Start AI | Only by the user's **Start AI on This Display**, for the capture that is running, with the bounds the user set beside it: requests per session (1–100), minutes (1–60) and seconds between unattended looks (1–60). The fields start at 60 / 30 / 30, an engineering preset that is the same as the Windows client's, not a product decision. Out-of-range bounds are refused, never clamped. `companion/start` carries exactly those bounds, `screen: true`, `microphone: false`, `system_audio: false`, and the default model that takes pictures (or the listed one the user chose). The session is used only when the connector's answer is for exactly that session and grants no more than was asked. A Start that is not confirmed, or was stopped while on its way, is stopped at the connector and never used. |
| What Start says | The section says in plain words what Start does: pictures of the whole captured display with the user's ink go to ChatGPT through the user's own subscription, when the screen or ink changes (at most as often as set), when a selection is finished and when words are sent; it ends by itself and is never renewed; nothing ChatGPT sees by itself is shown as help; no sound is sent. |
| Session line | One line, apart from the usage lines: the model, that the whole display is observed and how often at most, requests used / left and how many are kept for the user's own, minutes left, and the last look ChatGPT completed. It says these are this session's own bounds, counted on this Mac, not ChatGPT's quota. |
| The picture | Always the **whole** kept frame, never a crop: the retained original, re-checked against its recorded SHA-256, only read. When this capture excludes the app's windows and strokes are visible, they are drawn over the frame and that picture is kept once under `live/pictures/<sha256>.png`; otherwise the retained frame's own bytes are sent and no file is made. The editable ink is frozen as exact bytes and kept under `live/ink/<sha256>.json`. `ink_sha256` is bound only when the frame is ink-free (drawn, or none visible); when the capture did not exclude the app, or the display's size changed, nothing is drawn and the hash is null. `frame_captured_at`, `source_url`, `source_version` and `media_position` are explicit nulls. A frame over 16 million pixels or 8 MiB as PNG is refused with the reason (there is no downscale path). |
| Unattended looks | While the AI observes, each new kept frame and each committed change of the visible ink (pen-up, undo, redo, reopened ink) is offered. One look goes at a time, only when nothing else is out, not before the interval since the last look was written has passed, and only while more requests are left than the ones kept for the user (one fifth, at least one: the connector's rule). Only the newest offered frame waits; passed-over frames are stated to the model as gaps (`coalesced`), as are frames not given because of the kept requests (`budget`), the connector's refusal (`backpressure`) or a failure (`not_observed`). A picture the model has already looked at is not sent again. A look asks for no help (`allowed_assistance: none`, `presentation: none`); its text is kept as context for later requests and is **never** put on a card or in any status. |
| No current picture | When new pixels were not kept (retention cap reached, store stopped, a failed keep), the last kept frame is older than the screen. It is never given as the current picture: waiting looks are dropped with a stated gap, earlier renders are invalidated and undelivered observations are revoked. A fully delivered earlier observation remains useful historical context, but its late answer cannot clear the newer missing-picture reason. A follow-up is refused with "there is no current picture of this display on record". Picture and unavailable events use the same ordered app stream. |
| Selection → focus | Unchanged ASK gesture: drag a region, Finish; the previous mode (WRITE or NAV) is back at once. While the AI observes, Finish sends at once one `focus` request: the whole frame the selection was pinned to (with the ink visible when it was drawn) and the selection as `focus` inside it, in display points and in the frame's pixels by the interface's own rule. It asks for a small hint (`hint`, `silent`), with no question and no second press. Without a running session the card opens, the selection is kept, and nothing is sent; starting the AI later does not send it by itself. |
| A selection that cannot be located | When the display's size or rotation changed during the capture, or the frame pinned to the region was older than what was on screen, the region's pixels cannot be found in that frame. Such a selection is kept and **never** sent as a focus; the card and the palette say why. Words about it go with the current picture alone, and the card says the selection was not part of that request. |
| Follow-up | Typed words on the card, with the help the user chose (a hint, an explanation, the full solution), are a `text_followup` with the current picture. On the unchanged picture it keeps the same picture number, the identical image and context, and the same focus. After the screen changed it carries the new picture, no rectangle, and names the earlier focus as one context entry (`historical_focus_reference`: the earlier request, image hash, context and rectangle, with "pixels not attached" and "provider retention unverified"), as the released `carry_focus_into_followup` does. A selection the model was not given yet (the AI was started later, or its focus request got no answer) goes with its own picture and focus. |
| Context sent | The newest whole entries are selected in their original order: at most 23 entries and 24,000 characters (the interface allows 24 and 32,000; one entry is kept free for an earlier focus). Entire earlier frames omitted from dialogue are stated as `budget` gaps. Partial/same/current-frame dialogue omissions and dropped older gap ranges are stated in one explicitly labeled, frame-less omission-metadata entry, never invented screen evidence. Whole oldest projected entries make room for that notice when necessary; explicitly supplied historical focus remains intact. Nothing is cut or deleted from the original history. An answer is marked `shown` only after the card reported it as displayed, otherwise `unconfirmed`; a look is `not_presented`. |
| Answer | Put on the card only while that card still waits for exactly that request, the session still runs, and the result is exactly the interface's shape with `auth_mode: chatgpt`, the session's own model, the kind the request asked for, and a provenance equal in full to the request as sent. Model text is plain text. The card says what was asked: which kept frame, whether the ink is in it, where the focus was, the help, the time and the user's words. |
| Displayed | The answer and "displayed" are recorded apart: `<request>.shown.json` is written when the app has put the answer on its card panel while the panel is on screen. That the user read it is not recorded. |
| Cancel, new selection, Close | The request is fenced at once and the card says so. A request that has not reached the connector whole is taken back (the same revocable writer as the ASK) and nothing is sent; a delivered one is interrupted with `companion/interrupt`. The connector's answer to the interruption is kept in `<request>.interrupt.json`. An answer that comes after all is never shown and its text is not kept. An interruption the connector does not confirm ends the session. |
| Explicit request priority | A focus or typed follow-up supersedes pending/preparing unattended looks, interrupts prior turns and joins their local reservations before reserving its own render/send. The scheduler pauses while that card is asking. A stalled older render cannot follow the new focus or Stop. Cancellation, replacement, render failure and ended-session paths release the reservation; a submitted interrupted request still consumes its allowance. |
| Stop AI, capture stop, time, Quit | Each ends the session once: requests on their way are fenced (and taken back if undelivered), `companion/stop` is sent once, the end is recorded with the requests used, and nothing more is sent. The capture goes on after Stop AI. A session is never renewed or started again by this app; the user's own Start is a new session with a new name. Quit ends the session and the connector child (EOF, bounded, as before); nothing is signed out. |
| Refusals | The connector's closed codes map to fixed words; no connector or service text is ever shown. Whether the request had reached the service (`submission`) is said apart from why it was refused. A request that may have reached the service uses one of the session's requests and is never sent again. As the connector does, this app ends the session after an unknown outcome and after every refusal other than `busy`, `cancelled`, `stale_context`, `invalid_request` and this session's own request bound before sending; a look refused for the kept requests only stops looks. `budget_reached` is the connector's one code for this session's own bound and the service's own budget: it is said as the session's bound when nothing was sent, and as "the connector does not tell the two apart" when it was. |
| Loss | A connector that ends, or writes something that is not its protocol, ends the session; nothing is started again by itself. Connect is the user's and starts a connector, never a session. |
| Records | Under `<capture session>/live/`, each written once and never replaced: `<session>.session.json` (the Start and its outcome), `<request>.request.json` (the request without the image bytes, naming the retained picture and ink files) **before** it is sent, `<request>.response.json`, `<request>.interrupt.json`, `<request>.shown.json`, `<session>.end.json`. The retained frames, the ink document and the selections are untouched. |

## What changed in the app

- `LiveController` replaces `AskController`: the same connection section, plus the session's
  bounds, Start AI / Stop AI, the session line, the usage lines and the selection's card.
- The app now speaks only `lc-subscription-live/1` to the connector (one child speaks one
  version, and two children cannot share the state directory). The single-question library
  (`AskLink`, `AskSelection`, its tests and checker) is unchanged and stays as the ADR 0003
  milestone; whether its Submit card is kept anywhere on the Mac is the lead's decision.
- NAV / WRITE / ASK, partial erase, undo / redo, prior-mode return and the editable ink originals
  are unchanged.
- The three retained app corrections reject stale kept frames as current pictures, keep
  unlocatable selections without sending a false focus, and offer the newly reopened editable
  ink to the live session. The final review corrections add stale-render/loss ordering, explicit
  request serialization, delayed-child ownership, strict latency bounds and truthful context
  omission notices. `makePicture` is an injected function with the existing renderer as its
  default, solely to test a real render stall deterministically; it adds no dependency or store.

## Checks

Everything below ran on **Linux**. Final checks use the delivered library/tests; earlier failed
runs and review snapshots are identified separately. None of this is a macOS build. The
restrained sandbox denied local socket listening; exact-command approved reruns distinguish
those execution restrictions from remaining platform/harness failures. No permission policy
or rejected native-voice import was changed.

| Check | Result |
| --- | --- |
| Final library/tests type-check (Swift 6.3.3, Swift 5 mode, Apple stand-ins) | Exit 0; [`linux-final-typecheck.txt`](macos-subscription-live/linux-final-typecheck.txt) |
| Separate final library module; controller class against public interface; app syntax | Final module exit 0; prior same app snapshot's controller type-check and every parse exit 0; [`linux-final-module.txt`](macos-subscription-live/linux-final-module.txt), [`linux-module-build.txt`](macos-subscription-live/linux-module-build.txt) |
| Live tests | **23/24 pass**; only whole-frame rasterization fails under the stand-in. [`linux-live-tests.txt`](macos-subscription-live/linux-live-tests.txt); exact final tests also ran in the broad approved run |
| Whole final-source suite, exact-command approved | **118/124 pass**, six failed methods / 14 XCTest assertions (one unexpected); **not a suite pass**. [`linux-all-tests-approved.txt`](macos-subscription-live/linux-all-tests-approved.txt) |
| Earlier restricted run | **91/124 pass**, 33 failed methods; retained in [`linux-all-tests.txt`](macos-subscription-live/linux-all-tests.txt). The separate owned-child check passed 1/1 after approval; [`linux-owned-child-approved.txt`](macos-subscription-live/linux-owned-child-approved.txt) |
| Released contract and request check over emitted lines | **211 checks pass**, 10 lines / 6 turns, same-frame focus and historical focus each exercised; synthetic stand-in PNG. [`linux-released-validator.txt`](macos-subscription-live/linux-released-validator.txt) |
| Production `LiveLink` / `ProcessAskLauncher` → real connector stream/bridge/validation → local stand-in client | **1/1 pass** after exact-command approval, 18 synthetic client calls, two interrupts, clean child close, no unintended filesystem touches. **Zero model/account calls**. [`linux-real-connector-probe-approved.txt`](macos-subscription-live/linux-real-connector-probe-approved.txt); failed restricted run retained separately |
| Eight bounded correction mutants | **8/8 caught** in private harness copies; [`linux-mutations.txt`](macos-subscription-live/linux-mutations.txt). The first C02 removed only a redundant waiting guard and survived because the watermark still protected delivery; that raw result remains. Recreating the original missing-picture defect was then caught by unchanged assertions. No result is claimed for the interrupted prepared 51-mutant campaign |

The six broad-run failures are three ImageIO raster tests (ASK, composed frame and live frame),
the corelibs URLSession redirect test (307 is followed), the reviewed-copy test's source path
outside its temporary harness layout, and a retained floating-point mapper comparison. The
prior five failures are reproduced alongside the added live raster case; they remain failures
of this run and require the hosted Apple-framework check. New wire, loss, render-priority,
retirement and context regressions pass. The Process/CFSocket warning alone does not establish
failure causation; its separate process observation is retained in the evidence folder.

Independent findings and their disposition are in [wire/session review](macos-subscription-live/review-wire.md)
and [lifecycle review](macos-subscription-live/review-lifecycle.md). The latter's final wording
finding was corrected to request-priority/coalescing, and its requested direct stalled-render
focus/Stop test subsequently passed in the final broad run. [Harness files and checksums](macos-subscription-live/README.md)
make the stand-in and source boundaries inspectable.

## Limits and honest boundaries

- **Uncompiled on macOS.** The SwiftUI views and the changes in `CaptureController`,
  `InkController`, `ContentView` and `CompanionDesktopApp` were never type-checked. The hosted
  build may find errors there first.
- **No real connector launch on a Mac, no sign-in, no model call.** The probe used the connector's
  real stream, bridge, request check and contract code with a stand-in for its inner Codex client.
  The connector's launch gate, Codex and the account were not exercised.
- **No speech and no sound.** Answers are silent text on a floating card. Voice follow-up, spoken
  answers with captions, the lesson's audio and Talk / mute controls are not connected on the Mac;
  Start says so, and the request never claims an audio source. This slice does not meet the
  spoken-answer and caption part of the live experience.
- **The card and palette are ordinary floating panels.** They can be moved; positions are not
  kept across launches or clamped by this app.
- **Not content-anchored.** A focus is a rectangle in one frame's pixels. After the screen changes
  it is only named, without its pixels.
- **"Let me try" and exploration scope** are not modelled in the Mac UI: the help level is the
  user's choice per follow-up, and a selection alone asks for a hint.
- **Frames too large for the connector** (over 16 million pixels or 8 MiB as PNG) are refused, not
  downscaled. A 6016×3384 frame is over the pixel bound; whether a smaller frame stays under 8 MiB
  depends on its content.
- **Displayed is a panel fact**, not proof that the user read the answer.
- **No interactive Mac, no real-AI acceptance.** Everything about ScreenCaptureKit timing, the
  panel on a real screen and the real service remains to be checked on a Mac.
- **No full classroom/archive acceptance.** Screen-fixed source ink, synthetic composed PNGs
  and local reopen checks do not establish content anchoring, continuous real-AI receipt, or
  official completed Notability import. R59/A44/A46 and both per-OS §7.1 gates stay open.

Next: Lead integrates/reviews the delivery and runs the existing macOS build/package/XCTest
entry points on its exact revision, including `validate_live_session.py` on the native-produced
fixture. The separately authorized interactive Mac session then verifies screen/ink receipt,
selection, freshness, Stop and save/reopen. Voice/audio work remains assigned separately; the
pending untrusted native-voice import decision is unchanged.
