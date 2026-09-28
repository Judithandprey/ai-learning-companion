# P0-12 web: disclosure controls, answer-entry evidence and original-screen overlay plan

Date: 2026-09-28 UTC. Owner: web (05). Scope: bounded design, test-only traces and a fixture probe
under `apps/safari-extension/**` and `docs/verification/web/**`.

- **Specification:** `e43293760c70364584cb597ae01d34a261cc52cf` (content `a2567fa`), plus the audit baseline
  `44e60ec289717e155fb0f4374784c791bf23689c` for the confirmed intent decisions (two ink display modes, note/draft
  purpose, answer prompt, destination choice). Both read with `git show` and not merged.
- **Alignment (2026-09-28, later same day):** read `693069ac9e83ad955f808ca934b7fbec643f40f3`
  (`docs/adr/0002-process-evidence-and-presentation.md` §4 and §6–8, proposed and not yet an implemented
  protocol; `docs/verification/lead/p0-review-integration.md`) together with `9ce270c`. As a result:
  - share stop is scoped to new live capture on that path (§5 row 4, INTENT table);
  - screen-fixed ink persists through ordinary playback of the same known problem (INTENT-INK-MODES);
  - ADR §6–8 boundaries are recorded as contract dependencies (§1 rule 11, §6).
- **Contract:** `0.1.0`, unchanged. No shared field, dependency or root file was changed.
- **Placeholders:** every name below (levels, event kinds, record fields) is a local placeholder until the lead's P0-08
  contract exists. Nothing in `src/` uses the P0-12 model or observer.
- **Targets:**
  - R51/R52/R53/R56/R57/R58/R59, and R03/R08/R46–R48.
  - A30–A34 and A39–A46, linked to A26–A28.
  - G7, within G1/G3/G5 boundaries.

| Stage | Result |
| --- | --- |
| Design/plan | This document |
| Test-only executable model and traces | `apps/safari-extension/tests/p0-12/` — 13 named traces, 3,000 seeded random sequences with an independent oracle, and 19 rule-deletion mutations, all detected |
| Desktop fixture probe (answer entries + overlay coexistence) | `scripts/entries-check.mjs`, 16/16 on Edge 154 headless with trusted CDP input ([evidence](evidence/p0-12-edge-entries.json)) |
| Internal adversarial review | 3 reviewers + 3 verifiers. Confirmed defects in the model (6), the observer (6) and this document (4, plus 2 refuted), all fixed in this delivery; see section 7 |
| Runtime implementation | **None**; waits for P0-08 |
| Device / Pencil / real course site / provider | **Not tested** |

## 1. Disclosure gate (R53, R57; A32–A34, A40)

One rule set is applied at the moment of **final presentation**. That is when an item is displayed or played,
not when it is generated, cached or queued. It covers every channel: card, title, diagram, AI supplement,
review summary, notification preview and voice segment. After every context event, whatever is on screen or
queued is re-checked. Failing items are withdrawn or flushed. Caches may keep them, but they are never shown
late.

Binding carried by each presentable item (placeholders):
- problem id and version
- attempt id
- attempt revision it was generated from (null only for non-disclosing status; any help is revision-bound)
- the request it answers (null = unrequested)
- disclosure level and step scope
- preference/language key
- levels of the content it was derived from

Context:
- current problem/version/attempt/revision, teaching state, permitted level and scope;
- the active request, with origin, provisional flag and the problem attempt it was made for;
- the server-ordered policy version of **this problem attempt**, which restarts at every new problem or attempt;
- a pending offline close, sync state and voice mode;
- the R57 preference with any problem-scoped override.

Rules. Any failing rule blocks the item.

1. The item's problem, version and attempt must match, and so must those of the request it answers. Help must
   also match the current revision, so a correction invalidates it (A34). Only non-disclosing status may be
   revision-independent.
2. A derivative is never labeled below its sources. A title or preview cut from a full solution *is*
   full-solution content.
3. The item's preference/language key must match the current one. A temporary language override is scoped to
   its problem and never becomes the default (A40).
4. **Unrequested content discloses nothing.** Quiet following means status only. Pausing, erasing, a wrong step
   or elapsed time never raise permission (A32).
5. **Voice:** nothing is spoken outside an explicit voice discussion, including status (R09).
6. **Notification previews are always generic** (level none, e.g. "Your hint is ready"). They can appear on lock
   screens and other devices and cannot be reliably recalled after the OS shows them, so a display-time gate
   alone cannot protect them. The server must apply the same check at send time (section 6).
7. The item must answer the *active* request. A newer request, "let me try" or "stop telling me" cancels
   it (A32/A33).
8. The level must not exceed the request level or the permitted level. **"Check this step"** answers that step
   only: while it is active, anything disclosing must be about exactly that step. That excludes unscoped goal or
   concept hints about the whole problem (A32).
9. **Stale or disconnected state never authorizes disclosure** (A34):
   - A request that arrived from another device cannot be answered while disconnected.
   - This device's own request can be answered on screen only. There is no voice at local-next-step level or
     above.
   - Remote policy applies only to the **problem attempt it names**, and only by server version, never by wall
     clock. A late older update is ignored, and so is a policy for another problem (e.g. a p1 solution request
     arriving after the user moved to p2).
   - An offline "let me try" or "stop telling me" is an **unsynced close** of that problem attempt. Only two
     things resolve it: the server acknowledging it, or the server accepting a later request from this device
     (intents are sent in order). It is **not** resolved by any of these:
     - reconnecting;
     - one or more newer server versions (a higher version alone is not proof the server has the close);
     - snapshots that are older or for another attempt;
     - leaving the attempt and coming back.

     Until the close is resolved, snapshots may close help further but never reopen it. The user's own later
     explicit request still applies locally at its level, and a stale snapshot cannot replace that request with
     an older one. An offline lower-level request that the server did not accept is dropped at reconnect; it
     does not let an older full-solution snapshot back in. Policy versions are also kept per attempt.
   - On reconnect, an unaccepted provisional local request is dropped, even when the server snapshot is older.
     The user can ask again. A snapshot received while already connected is an ordinary resync: strictly newer
     versions only.
10. **Cache:** a cached result may answer a new request only at the **same** level, step scope, problem,
    version, attempt, revision and language. A cached full solution can never answer a hint request (A34).
11. **Unknown cross-device order** (ADR 0002 §6, proposed). Presentation is a physical act. A revocation can race
    with a display that has already started, and a retraction can arrive with no known order relative to an
    earlier presentation. In those cases:
    - record the relation as **unknown**, apply the retraction to all remaining output, and never mark the
      earlier output compliant after the fact;
    - make no proactive disclosure escalation while a same-problem device is known to be unsynced;
    - evaluate a fresh explicit request on the presenting device only within the known restrictive intent,
      never overriding an unordered conflicting refusal.

    Model coverage:
    - The model covers the restrictive side: an unsynced close stands until acknowledged (rule 9), and
      unrequested content never discloses.
    - It does **not** record partial/unknown presentation outcomes or the single-presenter claim. Those are
      contract items (§6).

Engineering defaults chosen here, and open for P0-08 (lead) and P0-10 (learning):
- Level names and order: `none < clarify_goal < key_concept < step_check < local_next_step < full_solution`.
- A request made on this device while disconnected may be answered, on screen only. It is dropped at reconnect
  unless the server accepts it.
- Previews are generic by default. Whether any richer preview is ever allowed is left to P0-08.

## 2. Deterministic checks (test-only)

`node --test tests/p0-12-disclosure.test.ts` uses the files below.
- `tests/p0-12/disclosure-model.ts`: the executable form of section 1.
- `tests/p0-12/disclosure-traces.json`: the named traces.

| Trace | Covers | What it pins down |
| --- | --- | --- |
| A32-explore-then-check-one-step | R53, A32 | Wrong step, pause, erase and time raise nothing. Unrequested concept hint blocked; status allowed. A step check shows only the pointed step: next-step and full content, and unscoped goal/concept cards and titles, are blocked. A cached check answers only a new check of the same step |
| A33-graduated-hints-then-explicit-solution | R53, R56, A33 | Levels step up only by request. A title derived from the solution but labeled as a goal hint is blocked. Diagram above the request level blocked. A preview with hint text is blocked while a generic preview is allowed. The explicit solution request shows the solution and its diagram |
| A34-cached-solution-correction-and-topic-change | R53, A34 | After "let me try" the cached full solution is withdrawn and never reused for a hint. Help without a revision binding is blocked. A correction invalidates the card, flushes queued voice and makes the earlier cached hint unusable. Same-level reuse works only on the same revision and language. A topic change invalidates everything |
| cross-device-intent-and-disconnection | R53, R58, A34 | Remote "let me try" withdraws. A late older policy is ignored. A remote hint is withdrawn on disconnect. A local offline request shows its card, but not voice or a detailed preview. Reconnect without acceptance withdraws it |
| provisional-request-accepted-on-reconnect | R53, A34 | The server-accepted provisional request stays valid |
| voice-queue-checked-at-playback | R09, R53, A33 | Silent mode blocks voice. "Stop telling me" flushes queued segments |
| A40-language-preference-and-scoped-override | R57, A40 | An override invalidates other-language content. It does not carry to the next problem. A preference version bump invalidates |
| review-summaries-and-supplements-follow-the-same-boundary | R54, R58, A33 | A review summary derived from a solution but labeled low is blocked. Supplements are gated like cards |
| redo-same-problem-is-a-new-attempt | R51; A43 (disclosure side only) | The old attempt's solution is withdrawn and not reused, and a new problem version invalidates it. Entry-switch linkage for A43 is not modeled here (section 4) |
| remote-policy-for-another-problem-is-ignored | R53, A34 | A delayed p1 full-solution request arriving after the user moved to p2 opens nothing on p2. A p2 policy still applies |
| offline-let-me-try-survives-reconnect | R53, A32, A34 | "Let me try" said offline withdraws the solution. A reconnect snapshot that still carries the old request does not reopen it |
| stale-reconnect-drops-unaccepted-provisional | R53, A34 | An offline full-solution request that the server did not accept is dropped at reconnect even when the snapshot is older, and its card is withdrawn |
| statement-changed-within-the-same-attempt | R51, R53, A34 | A new problem version within the same attempt invalidates shown help and blocks cache reuse |
| unsynced-close-survives-repeated-resyncs | R53, A32, A34 | The lead-reported sequence from the 4c32e49 review, extended: an unacknowledged offline close stays through a reconnect, newer snapshots (v2, v3) that still carry the old full-solution request, a snapshot for another attempt, an older acknowledging snapshot, and a further reconnect. Only an acknowledging newer snapshot resolves it, and a causally later server request then applies |
| later-explicit-request-after-unsynced-close | R53, A32, A33 | Positive control: the user's own later explicit request is answered at its level (a full solution under it stays blocked). A stale snapshot carrying the old request does not replace it; a snapshot that closes help does |
| offline-lower-request-after-close-not-escalated | R53, A32, A34 | Offline close, then an offline key-concept request that the server did not accept. After reconnect neither the old full solution nor the dropped request is shown |
| accepted-later-request-resolves-unsynced-close | R53, A34 | The server accepting the later offline request resolves the close; later server requests apply again |
| unsynced-close-survives-leaving-and-returning | R51, R53, A34 | Offline close on p1, move to p2 and back while offline: the close still blocks the old request at reconnect |
| policy-version-kept-per-attempt | R53, A34 | Returning to an attempt does not accept an older snapshot for it |
| ack-via-resync-while-connected | R53, A34 | Liveness: an acknowledgement arriving in a resync while already connected resolves the close |

Invariants over 3,000 seeded random event sequences (40 events each). The random events include remote policies
and reconnect snapshots for other problems, older and equal versions, snapshots carrying requests, and offline
closes, and acknowledgements. "Closed" is decided by an **independent oracle** in the test. It is written from
rules 7 and 9 with its own per-attempt server versions, unsynced closes and provisional request, and never reads
the model's state. (The earlier oracle read the model's version and cleared its own close marker at reconnect,
so it could not see the lead-reported bug.) Whatever is presented:
- never exceeds the current permission;
- always belongs to the current problem, version, attempt and revision (only status may lack a revision);
- discloses nothing after "let me try", "stop telling me", or a new problem or attempt, until a new explicit
  request that applies (per the oracle);
- is never a derivative labeled below its source;
- while disconnected, never uses another device's permission and never plays as high-level voice;
- as a preview, is always generic;
- under a step check, is always about exactly that step;
- in voice form, only plays in voice mode;
- always matches the current language.

The context also satisfies:
- observations never change it;
- the active request always belongs to the current attempt;
- once connected, no provisional request remains;
- the model has an active request exactly when the oracle says help is open (liveness as well as safety);
- while a close is unsynced, the only request that can be active is this device's own later request;
- every cache hit matches level, scope, problem, version, attempt, revision and language.

The test asserts that each of these paths was actually reached more than 50 times.

Bugs found in the model:
- First run: unrequested voice status could play in silent mode.
- Internal review:
  - a remote request for p1 opened disclosure on p2;
  - an offline "let me try" was undone at reconnect;
  - an unaccepted provisional request survived an older snapshot as if fresh;
  - "check this step" admitted whole-problem hints;
  - revision-less help survived corrections;
  - cache reuse fields were untested.
- The new oracle then found that a snapshot received while already connected reopened help at the same version.
- Lead integration review of 4c32e49:
  - an unsynced close was cleared at reconnect, so the next newer snapshot reopened the old full solution;
  - while fixing it: a later offline request cleared the close, so an unaccepted reconnect could restore the
    old full-solution request;
  - leaving an attempt and returning lost its close and its policy version.

All are fixed and each is covered by a named trace or an invariant. Against the 4c32e49 model, five of the six
new negative traces fail (the accepted-request positive control passes on both), and the new oracle fails at
seed 111.

**Mutation check.** 23 rules of the revised model were deleted or weakened one at a time, and each deletion is
caught by the tests:
- permission, revision, remote permission, unrequested disclosure, derivative labels;
- the four cache fields and exact cache level;
- step scope, remote problem binding, provisional drop, revision-less help;
- generic previews, silent voice;
- unsynced close:
  - a snapshot may not reopen it;
  - reconnect does not clear it;
  - a local request does not clear it;
  - it is kept when leaving an attempt;
  - the version is kept when leaving an attempt;
  - acceptance resolves it;
  - a resync while connected passes the acknowledgement on.

The resync-acknowledgement mutation errs restrictive, so at first it was not caught. It was caught once the
liveness invariant and the `ack-via-resync-while-connected` trace were added.

The cache problem-version check was initially uncaught because every test gave a new version a new attempt id.
A same-attempt statement-change trace and generator case were added.

What this does **not** establish: a correct level label does not prove the text, image or audio avoids leaking
the answer (section 3). No model, cache service, native speech or cross-device sync exists yet.

## 3. Semantic-leakage review checklist

For independent review (learning P0-10, QA P0-13). The producing model is never its own sole judge. Each
item is checked on the **actual rendered content** of every channel, at the level the request allowed.

- [ ] The **card body** stays within its level. A "key concept" does not state the equation or value that
  *is* the answer (e.g. "det(A) is the product of the eigenvalues" when the question asks for det(A) with
  given eigenvalues).
- [ ] The **title/heading** does not name the decisive method or result ("Use λ₁λ₂ = 6").
- [ ] **Diagrams/figures/animations** do not show the solved configuration, final point or final vector
  unless solution level was requested. Check axis labels, captions, alt text and ARIA labels too.
- [ ] **AI supplements** on user notes (figures, formulas, short notes) follow the same level. They are separate
  layers and never rewrite the user's ink.
- [ ] **Step checks** judge only the indicated step. Saying "correct" for a step that *is* the final answer is
  a verdict on the answer and needs that permission. No "and the rest follows as…".
- [ ] **Multiple choice:** eliminating options, ordering them, or hinting "not (b)" counts as disclosure at
  the corresponding level.
- [ ] **Worked examples** in a hint do not use the problem's own numbers or an isomorphic problem whose
  answer transfers directly.
- [ ] **Review summaries** before the user has seen or requested the solution do not contain it.
  "Earliest deviation" statements cite evidence and do not reveal the fix.
- [ ] **Notification previews** (lock screen, other devices) are generic by default ("Your hint is ready").
  They never contain the hint or solution text.
- [ ] **Queued voice** is re-checked per segment at playback. After "let me try", a correction, a new problem
  or withdrawn permission, nothing from the old queue plays.
- [ ] **Language variants** (R57 override) carry the same disclosure. A Chinese hint is not more explicit than
  the English one.
- [ ] **Site-provided answers** (a "Show answer" panel, grading) are the website's feedback. The AI does not
  re-quote them into a hint the user did not ask for. The user's later success is not independent (A42).
- [ ] **Caches** never serve higher-disclosure content for a lower request, including when prefetched
  (R12/R13).
- [ ] **Titles, filenames and export names** of notes and archives (A46) do not reveal a solution the user has
  not seen.

## 4. Web answer-entry evidence matrix (R51/R52; A42/A43; G7)

**Desktop probe:** `scripts/entries-check.mjs` runs trusted CDP input on the owned quiz fixture
(`fixture/entries.html`, `fixture/src/entry-observer.ts`), on Edge 154.0.4258.37 headless, Windows 10.0.26200 via WSL2.
[Report](evidence/p0-12-edge-entries.json) and screenshots `evidence/p0-12-edge-entries-0*.png`.

The observer only listens and reads. A static test forbids writes, focus, clicks, dispatch, submit, network
and storage.

Password, hidden and file inputs, and fields with password, one-time-code or card autocomplete, are never read.
A field stays excluded after the page changes its type. This is tested with a "show password" toggle on a field
without an autocomplete hint: reverting that protection leaks the password into records, and the check catches it.

| Entry | Observed on desktop (fixture) | Attribution | Limits / not established | iPad Safari | Fallback |
| --- | --- | --- | --- | --- | --- |
| Single choice | select → change (the previous radio's deselection **derived from group state**; that radio fires no event) → reselect | user (trusted event) | Order is document-local. The reason for a change is unknown. The final choice is not the process | untested | visual observation + gaps |
| Multiple choice | check / uncheck per box, with correct before/after | user | same | untested | same |
| Choices inside an open shadow root | select, the derived deselection, check. Recorded from the **composed** `input` event, because `change` does not cross shadow boundaries | user | A synthetic `change` inside a shadow root is invisible from outside | untested | visual |
| Text input / textarea | every edit with before/after and `inputType` (14 → 1 → 13) | user | Keystroke-level only for real text input; IME composition and paste untested. **Trusted input from `execCommand`, browser autofill or another extension is currently labeled user**; it cannot be told apart here | untested | visual + gaps |
| Site reformats the field in its own handler | the user's edits keep their own before/after (`→c`, `C→Cm`); the site rewrites (`c→C`, `Cm→CM`) are separate **unknown-actor** records, taken on the next `beforeinput` or poll | user / unknown | Poll-detected changes have a detection window, not an exact moment | untested | — |
| Formula (`contenteditable`) | edits with final text | user | Real formula editors (MathQuill-, Desmos- or canvas-based) often use hidden textareas or canvases. **Not probed**; per-site verification needed | untested | visual + gaps |
| Site's own canvas | pointer activity only: sample count and extent | user | **Visual/pointer-only.** No strokes, erase/undo (the site has its own undo) or semantics. Pixels were readable here, but the probe does not read them | untested | visual observation; product WRITE layer |
| Open shadow DOM | value readable via `composedPath` | user | Per component | untested | — |
| Closed shadow DOM | only "something changed in host"; **no value, no control** | user (event) | Opaque | untested | visual |
| Same-/cross-origin frame | recorded by the observer running **inside** each frame. This probe does not read frame documents from the top | user | Needs injection into every frame (`all_frames`, documented for Safari iOS 15+) and a host permission for the frame's origin. Frame records carry **no problem binding** because the fixture frame has no problem adapter; linking them to the outer question would be an inference | untested | visual |
| Site restores a draft (script sets value) | recorded as `change_without_event`, actor **unknown** | unknown | Site, browser autofill and other extensions cannot be told apart | untested | — |
| Site dispatches a synthetic event | actor **site** (untrusted event). A synthetic `change` that changes nothing is `no_value_change`, not a check | site | — | untested | — |
| Site calls `el.click()` | the resulting `input`/`change` reported **`isTrusted=true`** in Edge. Recorded as `scripted_activation`, because the click that caused it was untrusted. Inside the handler of a real user click (a live gesture) the actor is **unknown**, never user | site / unknown | **`isTrusted` alone does not prove a user action** (matches the HTML spec reading). The mark lives only for the task of that click. Other script paths (e.g. `form.reset`, framework state) need their own checks | untested | unknown when in doubt |
| Site grading / "Show answer" | recorded as site feedback, separate from user input | site | Only through a **per-site adapter** (here `[data-site-feedback]`). A generic page gives no semantic feedback signal; it stays unknown | untested | visual + unknown |
| Next question | problem change recorded; later answers bind to the new problem; script-cleared answers are actor unknown | site / unknown | Problem identity comes from a **per-site adapter** (here `data-problem-id`). Real sites need an adapter, URL, or visual cues, or else an ask-once confirmation. Redo vs new problem is ambiguous without it | untested | short confirmation (R51) |
| Product WRITE layer on top of the form | pen ink over the question, while a finger tap still answers the question; 0 explanation requests | user | Desktop CDP pen only. This is **not** A44: no AI composite, no pinch/zoom anchor, no share stop | untested | — |
| Same problem across entries (choice → typed → site canvas → product ink → external notes), redo, "try again" | **not probed**: each entry is recorded on its own, and the only link is the adapter's problem id | — | A43 needs a stable attempt id, a redo relation (new attempt) and entry-switch links across web records, product ink strokes and external visual observations. These are P0-08 fields | untested | ask once when the link is unclear |
| AI help shown in the same problem | **not probed** in entry traces | — | Assistance events belong to the disclosure/assistance record (sections 1–2) and must be linked to the entry trace in P0-08. A correct answer after help is not independent (A37/A42) | untested | — |

Never authorized: filling, selecting, clicking or submitting answers for the user.

## 5. Original-screen live overlay on supported webpages (R59/A44) — probe plan

**Current state.**
- WRITE draws page-coordinate ink over the live page. Pen strokes are claimed; fingers and mouse keep
  working (P0-02 trusted checks, and `entries.write_overlay_keeps_answering`).
- The overlay moves into a fullscreen container. For fullscreen `<video>`/iframe elements it cannot render
  and the probe forces NAV.

This is an input layer only. **A44 is not passed by anything here.**

| # | Required for A44 on a supported page | Plan / pass criterion | Dependency | Status |
| --- | --- | --- | --- | --- |
| 1 | Original page visible and operable | Scripted 100-gesture set (R08/§11) repeated by hand on iPad with Pencil and fingers: links, buttons, scroll, pinch, video scrubbing. Every interaction works; 0 explanation requests in NAV/WRITE | packaged extension, iPad | desktop partial only |
| 2 | Ink anchored across scroll, zoom, reflow and problem change | Store strokes relative to a **page anchor**: the problem container element plus element-relative coordinates, the source version and the frame/video position at the stroke. On reflow, re-project. On a problem or version change, freeze the old strokes, hide them from the new problem, and show a notice (never silently move them). Pinch-zoom: WebKit lays out fixed elements against the layout viewport. Verify ink alignment with `visualViewport` on device | P0-08 stroke/anchor fields | page-scroll only (desktop) |
| 3 | **AI actually receives the composite** | Candidate paths. (a) Extension `tabs.captureVisibleTab`, documented for Safari iOS 15+. Whether the capture includes the content-script overlay is **not documented**, and forum reports mention cropping and reduced resolution. (b) Native capture of the screen by the app: ScreenCaptureKit on iPadOS 27+, or a ReplayKit broadcast. FairPlay-protected video is documented as blacked out. Pass requires the exact image sent to the model, stored with its hash, visibly containing the ink, plus the ink vectors sent alongside. A DOM snapshot plus ink vectors **is not** a composite and must never be labeled as one | P0-11 (iOS) capture evidence; P0-08 | **unverified** |
| 4 | Share stop | After an explicit stop, capture and **live** sending of **new** frames and ink on that path end, and the overlay shows "not live". Originals captured before the stop, and the final pre-stop queue boundary, stay saved locally. They may sync later only if that is separately authorized and they are verified and labeled as history; this never restarts the share and is never presented as current. Explicit deletion is a separate action. Test by stopping mid-stroke and checking what the receiver got after the stop time, and in what form | native capture path; P0-08 history-sync scope | not started |
| 5 | Frames | Pen strokes over a cross-origin frame land in that frame's document. Only the probe injected there sees them, in frame coordinates. Plan per-frame ink layers with frame-relative anchors, and label strokes that cross frame borders | frame permissions | desktop input only |
| 6 | Fullscreen | Container fullscreen: overlay OK (desktop). Native video fullscreen: unsupported, so fall back (A45) | — | desktop partial |
| 7 | Notability flow (A46) | The web end supplies editable ink, anchors (source/frame/video position) and the separate AI layer to the native app. The native side owns export/share/import states (prepared → shared → imported/unknown/failed). A share sheet is not an import; PDF/PNG is not native ink. Bridge v0.1 has only `selection.submit`, so ink handoff needs a new bridge action | P0-08, iOS P0-11 | not started |

**Confirmed intent decisions on the web path** (`docs/requirements/intent-and-decisions.md` at `44e60ec`).
Test-only spec: `tests/p0-12/organize-model.ts`, cases in `tests/p0-12-organize.test.ts`. They pin the planned
behavior only; the real UI, classification quality and imports are later phase work (P1-06, P2-03, P2-04, P3-02).

| Case | Planned web-side behavior (pinned by the test cases) | Still required |
| --- | --- | --- |
| INTENT-INK-MODES | Two display modes, both keeping their original source, problem, version and written-at video/frame anchors. Rendering follows the proposed ADR 0002 §7 behavior, an engineering choice rather than a new user preference.<br>**Screen-fixed** ink stays at its screen position while the same known problem and source continue, **including ordinary video playback**, and it visibly keeps its written-at context. Normal clock progress does not make it disappear, and it does not become ink on each later frame; the AI composite carries its original context separately.<br>**Content-attached** ink is drawn only where a valid content transform exists: its page element, or the video frame it was written on. There is no video-object tracking. Elsewhere its placement is unresolved and it is hidden with a notice, never re-attached.<br>A different problem, a changed problem or material version, or an undeterminable problem hides **both** modes with a notice, keeps their original anchors, and never silently shows them on the new question. The test cases contrast continuous playback against an actual question change during the same video. One mode working does not replace the other | Real page scroll, pinch, reflow and continuous video on iPad; an actual question change; save/reopen; AI receives each mode in the composite |
| Purpose (INTENT-NOTE-CLASSIFICATION) | Purpose is independent of display mode and can be corrected. Correction keeps the AI's earlier decision in the history, and ink is never deleted. Notes → Notability flow, drafts → process archive only, final answer → answer prompt, unsure → one minimal clarification | Real classification quality (learning); no per-stroke manual tagging |
| INTENT-ANSWER-PROMPT | Ask promptly once when the on-screen answer is finished. Pausing, leaving the screen, a correct answer, continued editing or switching problems are not "finished". When unsure, one combined question (done? organize?). A refusal is not repeated for the same problem | Completion detection and timing measured on real use; no invented thresholds |
| INTENT-HOMEWORK-CHOICE | Offer only destinations that exist at that moment: Notability homework (when sharing works), the matched assignment document from an authorized source (e.g. bCourses; confirm when ambiguous), preview, not now. **Submission is never an option**; a source is not a submission target | Real bCourses material matching and versioning (backend); native share path (iOS) |
| INTENT-FAITHFUL-EXPORT | Export is tracked **per attempt**. `prepared` starts the initial attempt, and opening the panel again after an attempt ended starts a new one. Each attempt ends as one of: cancelled, failed before dispatch, dispatching, shared (awaiting import), dispatch unknown, or imported.<br>Opening the share panel is **only a local fact**: it is neither "shared" nor dispatch. "Shared" needs the share system to report delivery to a target. "Imported" needs target evidence after a dispatch. A generic timeout with no evidence that dispatch started creates no external effect.<br>Cancellation, failure or reopening never erases what an earlier attempt did. The latest attempt is reported separately from "ever shared / ever imported". A46 actual import stays separate.<br>Organizing keeps the user's layers and layout; AI suggestions are separate and previewed; nothing is submitted.<br>Following ADR 0002 §8 (proposed), external dispatch requires a confirmation bound to the **exact manifest**. Every exported AI layer must have been in the confirmed preview and must pass the **current** disclosure check at dispatch. Layout-only consent never covers a change to the learner's answer. Regenerated content needs a new manifest and a new confirmation.<br>Following ADR 0002 §7, help-bearing content is **possible external exposure** only when some attempt reached dispatch: started, shared, outcome unknown, or imported. Opening, confirmed pre-dispatch cancellation, pre-dispatch failure or a bare timeout is not exposure. Reading stays unknown | Real Notability import evidence; no duplicate external documents on retry; real reconciliation of unknown outcomes |
| Share stop | Stop ends new live frames and ink on that path. Pre-stop originals stay local and may sync only as separately authorized, verified and labeled history. Deciding this never restarts the share, and the user still sees and keeps their ink | Real capture path (P0-11), receiver-side check after the stop time, P0-08 history-sync scope |

**Fallback (A45).** A frozen captured frame, an owned canvas or a side-by-side draft is always labeled as a
fallback:
- The frozen state and source version are visible.
- A one-step return to the live page keeps the position.
- A change on the original page shows a notice.
- Drafts never drift to another problem.

A45 results are recorded separately and never count toward A44 or R59.

**Windows original-desktop annotation layer** is P3 scope and **unverified**. Specific risks: click-through
transparent overlay windows, pen/finger routing to the underlying app, DPI and multi-monitor scaling, whether
screen capture (for example Electron `desktopCapturer`) includes or excludes the overlay, and protected
content. A webpage overlay result says nothing about it.

## 6. Requests for the P0-08 contract (lead)

- A disclosure envelope on every presentable item, and a presentation-time context (section 1). This includes
  a server-ordered policy version, a request origin/provisional flag, and a channel enum. That enum needs
  title, diagram, notification, review summary, supplement and voice.
- Answer-entry records (section 4) with:
  - an `actor` of user / site / assistant / unknown, plus the evidence kind (trusted event, untrusted event,
    value diff, group state, mutation, pointer-only);
  - access (readable, closed shadow, visual only);
  - a frame and document-local sequence;
  - problem identity with its source (adapter, URL, visual, confirmed), or unknown;
  - site feedback kept separate from user input.
- Ink strokes with:
  - page/element/frame anchors, source and problem version, video position;
  - display mode (content-anchored / screen-fixed);
  - purpose with its correction history;
  - a live/frozen/fallback surface flag.

  Plus a bridge action for handing ink to the native app (v0.1 has only `selection.submit`).
- Every request, and every server policy or snapshot, bound to the problem attempt it belongs to. An offline
  "let me try" is carried as a pending ordered intent until the server acknowledges it.
- A server **send-time** disclosure check for notifications. Previews are generic, and an OS preview cannot be
  recalled once shown.
- For A43: a stable attempt id, a previous-attempt/redo relation, entry-switch links across web records, product
  ink strokes and external observations, and a reference to assistance events.
- Answer-prompt and export records: the prompt shown/declined per problem attempt, destination options actually
  offered, and export states (prepared, shared, pending import, imported with evidence, failed, unknown).
- From ADR 0002 §4 and §6–8 (proposed), the web end depends on these and implements none of them now:
  - scoped share-stop and history-sync permission, with the final pre-stop queue boundary;
  - server-authorized presentation claims for one active presenter per problem;
  - actual, partial or unknown presentation outcomes, and "unknown" relations between retractions and earlier
    presentations;
  - per-layer disclosure checks, and a confirmation bound to the exact export manifest and its preview;
  - possible-external-exposure facts, kept separate from actual learner reading;
  - a question-scoped refusal that only a causally later reopening supersedes.
- `CapabilityResult.gate` currently allows G1–G6 only, so G7 rows cannot be expressed in 0.1.0. This
  document keeps the G7 web matrix as prose until then.

## 7. Commands and results

```text
$ apps/safari-extension/scripts/check.sh                               # module checks incl. P0-12 tests
typecheck: pass; node --test: 63 pass, 0 fail; build: pass
$ node --test apps/safari-extension/tests/p0-12-*.test.ts
15 pass (20 traces; 3,000 random sequences with an independent oracle; observer no-write scan; 11 intent/ADR cases)
$ node apps/safari-extension/scripts/entries-check.mjs --browser "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --run p0-12-edge-entries
entries checks passed 16/16; failed: none; runner errors: 0
```

- **Rule-deletion mutations** (section 2): 23 of 23 detected on the revised model.
- **Export-model mutations:** 6 of 6 detected:
  - an open panel counts as dispatch;
  - a timeout manufactures dispatch;
  - a reopen overwrites the earlier attempt;
  - a late cancel erases a dispatch;
  - an import is accepted without a dispatch;
  - exposure is computed from the latest attempt only.

  On the 4c32e49 functions, an opened panel reported "shared" and possible exposure, and a bare timeout
  reported possible exposure.
- **Alignment mutations** (organize model): 7 of 7 detected. The model cases were checked by restoring the old
  "video moment only" rule for screen-fixed ink, removing the uncertain-problem notice, allowing unauthorized or
  live-looking history sync, dropping the preview check, letting layout consent cover corrections, and ignoring an
  unknown dispatch outcome. The last one was caught only after adding a case for an unknown outcome without a
  share sheet.
- **Observer revert-the-fix runs** (temporary copies):
  - Without the sensitive-field memory, the password leaks and `entries.password_never_recorded` fails.
  - With choices handled only on `change`, `entries.open_shadow_choices` fails.
- **Earlier probe runs:**
  - 7/13: harness targeting (controls outside the viewport, a shadow-control naming mismatch).
  - 14/16: harness targeting (open-shadow input address, caret position in the password field).
  - All were fixed before the recorded run.
- **Internal adversarial review** (3 reviewers + 3 verifiers) confirmed:
  - **Model (6):** cross-problem remote permission, offline close undone at reconnect, stale provisional
    request, step-scope leak, untested cache fields, revision-less help.
  - **Observer (6):** password after a type toggle, site rewrites merged into user edits, choices in open shadow
    roots, stale scripted-click marks, wrong checkbox before-values, frame wording.
  - **Document (4):** preview contradiction, provisional-rule mismatch, missing A43 attempt/entry/assistance
    items, evidence errors.

  All are fixed above. Two further claims findings were refuted.
- **Harness safety fix:** after a run, the harness no longer kills a recorded browser PID unconditionally, since
  a recycled PID could belong to another program. It acts only if the runner did not finish, and only on
  `msedge.exe` with that PID. The same change was made in `trusted-check.mjs`.

## 8. Still required (not claimed)

- iPad Safari, Apple Pencil, a packaged extension and a real course site, for every row of sections 4 and 5.
- Real formula editors and real quiz platforms, each verified per site.
- AI composite capture (5.3), share stop (5.4) and the Notability import states (5.7).
- Both ink display modes, purpose classification, the answer prompt and destination choices on real pages and
  devices (INTENT-*).
- A43 attempt and entry linkage, and assistance attribution in entry traces (P0-08 fields).
- Semantic leakage review of real content by independent reviewers and user trials.
- Cross-device sync and native speech.
- Windows desktop layer (P3).
