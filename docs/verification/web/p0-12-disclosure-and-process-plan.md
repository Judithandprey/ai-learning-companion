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
| Test-only executable model and traces | `apps/safari-extension/tests/p0-12/`: 33 named traces and 3,000 seeded random sequences with a history-based independent oracle. Disclosure mutations: 50 of 53 detected, the 3 survivors shown equivalent (section 2). Organize/export mutations: 22 of 22. Media-timeline model (section 9): 30 of 30 |
| Desktop fixture probe (answer entries + overlay coexistence) | `scripts/entries-check.mjs`, 20/20 on Edge 154 headless with trusted CDP input, including closed-shadow attribution and a write tripwire ([evidence](evidence/p0-12-qafix-edge-entries.json)). The previous observer gives 17/20 on the same checks |
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
- this device's unacknowledged intents for the attempt (connected or not), the latest applied server snapshot,
  sync state and voice mode;
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
   - Every intent of this device — "let me try", "stop telling me", or its own request, **connected or not** — is
     **pending** until the server acknowledges it. (Until the P0-12 QA follow-up only offline closes were
     pending; QA P012-D1 showed a connected "let me try" or lowered request being revived.) Only causal evidence
     acknowledges an intent: a snapshot that is newer than every snapshot already applied and newer than the
     version the device had when it made the intent, carrying one of these:
     - `acknowledgedClose` (for a close);
     - the request id among its accepted requests;
     - the request as its current request (an echo).

     Intents are sent in order, so acknowledging one also acknowledges every earlier one: a causally later
     accepted request resolves a close. An intent is **not** resolved by any of these:
     - reconnecting;
     - one or more newer server versions without that evidence (a higher version alone is not proof);
     - a snapshot at or below the version the device had when it made the intent, since it cannot contain it;
     - a snapshot that arrives after a newer one, whose acknowledgement is superseded together with its state;
     - a snapshot for another attempt;
     - leaving the attempt and coming back. An acknowledgement received while away is kept, but help itself
       never carries over.
   - While an intent is pending, the latest one decides:
     - after a close, nothing is shown;
     - after the user's own request, that request is answered at its level at once. A newer snapshot that does
       not contain it has an unknown order against it, so it may close help or answer a strictly lower request,
       never widen it (ADR 0002 §6). A snapshot known to be older than the request changes nothing.
   - With nothing pending, the latest applied snapshot decides exactly. *Accepted* means the server applied the
     request, not that it is still current. A snapshot that accepts the request but is closed (for example after
     "let me try" on the iPhone) closes help (QA P012-D2).
   - On reconnect, an offline request that the server did not accept is no longer answered, even when the
     snapshot is older; the user can ask again. It still limits what the server may show to its own level until
     a later intent is acknowledged, so a dropped lower request cannot let an older full solution back in. A
     snapshot naming one of this device's still unacknowledged requests is not evidence for it. A snapshot
     received while already connected is an ordinary resync: strictly newer versions only. Policy versions and
     pending intents are kept per attempt.
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
- A request made on this device while disconnected may be answered, on screen only. At reconnect it stops being
  answered unless the server accepts it, and it keeps restricting at its level until a later intent is
  acknowledged.
- Acknowledgement is modeled with a boolean close flag, accepted request ids and the echo. A real protocol should
  acknowledge by per-device intent sequence and separate "applied" from "current" (section 6).
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
| provisional-request-accepted-on-reconnect | R53, A34 | The server accepted the offline request and still holds it as current, so it stays valid, and only at its own level (QA MB) |
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
| backfilled-transcript-request-is-history-not-live | R53, A32, A34, AUDIO-14, AVTEST-11 | A request heard in a late or backfilled transcript opens, escalates or restores nothing and resolves no pending intent; the user's live request still works (section 9) |
| connected-let-me-try-not-revived-by-same-version-reconnect | R53, A32, A34 | QA P012-D1 S1: a connected "let me try", a brief disconnect, and a reconnect at the pre-close version keep the full solution blocked; an acknowledgement then lets a later request apply |
| connected-let-me-try-not-revived-by-newer-unrelated-snapshots | R53, A32, A34 | QA S1b/S4: newer snapshots still carrying the old request, or a late unordered request from another device, cannot reopen; an acknowledging snapshot with a new request can |
| connected-downgrade-not-replaced-by-older-full-solution | R53, A32, A34 | QA S1c: the user's own lower request stays through a same-version reconnect and a newer snapshot, which cannot raise it (QA MA); after the echo, later server requests apply |
| accepted-then-closed-by-another-device | R53, A33, A34 | QA P012-D2: accepted is not current; a closed snapshot that accepts the offline request withdraws it |
| echo-resolves-close-then-later-request-shown | R53, A32, A34 | QA P012-D5 (a), liveness: the server echoing the user's later request resolves the earlier close, and a causally later iPhone request is shown |
| stale-acknowledgement-does-not-reopen | R53, A34 | QA H2 (a control that also held before): a late older acknowledging snapshot and a foreign one do not resolve the close |
| acknowledgement-while-away-is-kept | R53, A34 | QA P012-D5 (b): an acknowledgement for p1 received while on p2 counts after returning |
| stale-acknowledgement-while-away-ignored | R53, A34 | An older acknowledging p1 snapshot that arrives after a newer one while away is superseded |
| dropped-offline-downgrade-still-restricts | R53, A32, A34 | An unaccepted offline lower request is not answered, but it keeps the old full solution out while a lower server request may show; a later acknowledged request applies |
| connected-request-restricted-by-newer-unacknowledged-snapshot | R53, A34 | Unknown order is restrictive: a newer snapshot without the user's request may lower it, never widen it, until the echo |
| known-older-snapshot-does-not-restrict-later-request | R53, A34 | Liveness: a reconnect at the version the device had when the user asked neither answers nor restricts that request |
| cached-voice-segment-never-served | R09, A34 | A cached voice segment is never reused as an answer (QA MD); a cached card at the same binding is |

Invariants over 3,000 seeded random event sequences (40 events each). The random events include:
- remote policies and reconnect snapshots for the current, a visited or an unknown attempt;
- older, equal and newer versions;
- snapshots carrying requests, echoing this device's request or accepting it;
- stale snapshots with acknowledgements;
- connected and offline closes and requests, and backfilled transcript requests.

The **independent oracle** is history-based. It never reads the model's context. For each attempt it keeps the
raw history: this device's intents with the version the device had applied when it made them, and the snapshots
it received, in order. From that history alone it computes:
- the **cap**: the most that may be shown now. It is set by this device's latest intent, unless a snapshot
  received after it proves the server has that intent or a later one;
- with no cap, the **expected request**: the one in the latest snapshot applied since the attempt was entered.

(QA P012-D4 noted that the previous oracle mirrored the model's state machine and agreed with all 22 D1
violations; the cap is now derived from the intent history, and the assertions compare request identity and
level, not only "open".) Whatever is presented:
- never exceeds the current permission;
- **I16:** never exceeds the history cap, and with no cap only answers the server's current request;
- always belongs to the current problem, version, attempt and revision (only status may lack a revision);
- is never a derivative labeled below its source;
- while disconnected, never uses another device's permission and never plays as high-level voice;
- as a preview, is always generic;
- under a step check, is always about exactly that step;
- in voice form, only plays in voice mode;
- always matches the current language.

The context also satisfies:
- observations (and backfilled transcript requests) never change it;
- the active request always belongs to the current attempt;
- once connected, no provisional request remains;
- **I15**, identity: with no cap, the active request equals the expected request in id, level and scope. This
  is liveness as well as safety;
- **I16** on the context: under a close cap nothing disclosing is active. Under the user's own pending request,
  only that request or a strictly lower server request is active. Under a dropped request, only a server
  request at or below its level is active;
- **I17:** right after the user's request, exactly that request is active;
- every cache hit matches level, scope, problem, version, attempt, revision and language.

The test asserts that each of these paths was actually reached more than 50 times:
- a connected close followed by a snapshot;
- a lowered request followed by a higher snapshot;
- acknowledgement by echo, by acceptance and by the close flag;
- ignored stale acknowledgements;
- an acknowledgement kept while away;
- a dropped request still capping;
- lowering by a newer snapshot;
- the identity check;
- stale reconnects, scoped presentation and cache hits;
- a backfilled request while capped.

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

- QA re-test of exact main 71f1389 (`e26523e`, `docs/verification/qa/p0-12-w1-retest.md`):
  - P012-D1: a connected "let me try" or lowered request was revived by a same-version reconnect or a newer
    snapshot without proof;
  - P012-D2: accepted was treated as current;
  - P012-D3: the oracle checked only "open", so level escalations (MA, MB) survived;
  - P012-D5: an echo of the user's later request, or an acknowledgement received while away, did not resolve
    a close.

All are fixed and each is covered by a named trace or an invariant. Against the 4c32e49 model, five of the six
new negative traces fail (the accepted-request positive control passes on both), and the new oracle fails at
seed 111. For the QA follow-up:
- QA's own probe (`p012-disclosure/probes/adversarial.mjs` at `e26523e`) reports 7 FAIL lines on the fcf89b2
  model (S1, S1b, S1c, both S2 lines, S3, S4). All its lines hold on the repaired model, including the H1–H5
  controls.
- Of the new named traces, 9 of 10 fail on the fcf89b2 model at their intended step. The stale-acknowledgement
  control passes on both.

**Mutation check (P0-12 QA follow-up).** 53 single-point mutants were run, with a passing unmutated control;
50 are detected. They comprise the gate and cache rules below, QA's MA–MF, MJ and MK, 27 intent/acknowledgement
rules and the 5 backfill mutants. The sync mutants cover:
- a connected close or request not pending;
- no version causality;
- stale acknowledgements counting;
- the close flag acknowledging requests;
- no echo, acceptance or prefix acknowledgement;
- no restriction, replacement, widening or raising by an unacknowledged snapshot (QA MA);
- escalating an acknowledged own request (QA MB);
- accepted kept as current (D2);
- restriction by a known-older snapshot;
- no drop, or dropped still answered, at reconnect;
- the cap ignored for a dropped request, or showing this device's own unacknowledged id;
- no or unordered acknowledgements while away;
- pending intents or version lost on switching;
- equal-version reconnect or resync rules;
- remote policy applied while disconnected.

The 3 survivors are equivalent in this model:
- QA ME (only the permission check) and QA MF (only the request-level check): permission is only ever set
  together with the active request, to its level;
- QA MK (no other-attempt check): an active request is always bound to the current attempt and switching
  closes help. I10 asserts this.

The earlier (4c32e49/e251447) mutation round deleted or weakened 23 rules one at a time, and each deletion was
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
[Report](evidence/p0-12-edge-entries.json) and screenshots `evidence/p0-12-edge-entries-0*.png`. The P0-12 QA
follow-up run is [p0-12-qafix-edge-entries.json](evidence/p0-12-qafix-edge-entries.json) (20/20). The same
checks on the previous observer are in [p0-12-qafix-eo-before-old-observer.json](evidence/p0-12-qafix-eo-before-old-observer.json)
(17/20).

The observer only listens and reads. Two checks guard this, and neither is a proof about arbitrary code:
- **Lint guard** (`tests/p0-12-observer-safety.test.ts`): the observer source uses none of a list of known write,
  focus, click, dispatch, submit, tree, attribute, canvas-context, network, storage and dynamic-code APIs. QA
  EO-2 showed the earlier list missed 11 of 12 inserted writes, including `requestSubmit()`,
  `prototype.click.call`, `Object.assign` and `+=`. The new list flags all 12. It cannot see aliases, computed
  names or eval.
- **Behavioral tripwire** (`entries.observer_no_write_calls`): the fixture wraps page-changing, submitting,
  network, storage and canvas-context APIs before the observer starts. Each call records whether the observer's
  module is on the call stack. In the run, none of 98 calls came from the observer. The site's own writes were
  seen (click, dispatch, value, checked, tree and attribute changes), so the tripwire was live. On the previous
  observer it caught the observer's `canvas.getContext('2d')` pixel probe (QA EO-9): that call could create or
  lock the site's drawing context, and it is removed. This covers the exercised paths only.

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
| Site's own canvas | pointer activity only: sample count and extent | user | **Visual/pointer-only.** No strokes, erase/undo (the site has its own undo) or semantics. Pixel readability is not probed, since `getContext()` could create or lock the site's context (QA EO-9) | untested | visual observation; product WRITE layer |
| Open shadow DOM | value readable via `composedPath` | user | Per component | untested | — |
| Closed shadow DOM | only "something changed in host"; **no value, no control**. The origin comes from a click or key on the host seen in the same task. A trusted one means user. A scripted `click()` inside the closed root arrives retargeted to the host as an untrusted click, so it is site, or unknown during a live gesture | user / site / unknown | Opaque. **Without a click or key on the host the origin is unknown, never user.** QA EO-1: the previous observer credited a page script's `click()` inside the closed root to the learner (reproduced in the owned browser, 17/20). Now: no gesture gives site; inside a site button's handler gives unknown; a trusted click on the box gives user; text via `insertText` (like an IME commit, no key event) gives unknown. Detection of a closed root is a tag-name heuristic (QA EO-6) | untested | visual |
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
| Purpose (INTENT-NOTE-CLASSIFICATION) | Purpose is independent of display mode and can be corrected. Correction keeps the AI's earlier decision in the history, and ink is never deleted. The user's correction stands until the user changes it; a later AI classification is only a suggestion, asked about when it is confident and different (QA ORG-9). Notes → Notability flow, drafts → process archive only, final answer → answer prompt, unsure → one minimal clarification | Real classification quality (learning); no per-stroke manual tagging |
| INTENT-ANSWER-PROMPT | Ask promptly once when the on-screen answer is finished. Pausing, leaving the screen, a correct answer, continued editing or switching problems are not "finished". When unsure, one combined question (done? organize?).<br>A refusal names the prompt actually shown and binds to **that question** (ADR 0002 §8, QA ORG-1). It survives visiting other questions. A delayed refusal stays evidence for its own question and never suppresses another. A refusal of a prompt never shown is ignored. Only a causally later explicit reopening, one that names the refusal it saw, supersedes it; with an unknown order the refusal is kept. Reopening is the user organizing, not a repeated prompt | Completion detection and timing measured on real use; no invented thresholds |
| INTENT-HOMEWORK-CHOICE | Offer only destinations that exist at that moment: Notability homework (when sharing works), the matched assignment document from an authorized source (e.g. bCourses; confirm when ambiguous), preview, not now. **Submission is never an option**; a source is not a submission target | Real bCourses material matching and versioning (backend); native share path (iOS) |
| INTENT-FAITHFUL-EXPORT | Export is tracked **per attempt**. `prepared` starts the initial attempt, and opening the panel again after an attempt ended starts a new one. Each attempt ends as one of: cancelled, failed before dispatch, dispatching, shared (awaiting import), dispatch unknown, imported, or effect unverified.<br>Local events can be missing or reordered. **Evidence of an external effect is never discarded** (QA ORG-3). A delivery report, an unknown outcome or a dispatch start raises the attempt even without a local dispatch start, or after a local cancel or failure. An import report not chained to a dispatch of this attempt is `effect_unverified`: a possible effect, never an import. An unknown outcome is never reported as shared (QA ORG-11), and is resolved only by later evidence (QA ORG-12). Events still carry no attempt or manifest identity (QA ORG-4, a P0-08 item).<br>Opening the share panel is **only a local fact**: it is neither "shared" nor dispatch. "Shared" needs the share system to report delivery to a target. "Imported" needs target evidence after a dispatch. A generic timeout with no evidence that dispatch started creates no external effect.<br>Cancellation, failure or reopening never erases what an earlier attempt did. The latest attempt is reported separately from "ever shared / ever imported". A46 actual import stays separate.<br>Organizing keeps the user's layers and layout; AI suggestions are separate and previewed; nothing is submitted.<br>Following ADR 0002 §8 (proposed), external dispatch requires a confirmation bound to the **exact manifest**. Every exported AI layer must have been in the confirmed preview and must pass the **current** disclosure check at dispatch. Layout-only consent never covers a change to the learner's answer. Regenerated content needs a new manifest and a new confirmation.<br>Following ADR 0002 §7, help-bearing content is **possible external exposure** when any attempt has effect evidence: dispatch started, shared, outcome unknown, imported, or effect unverified. A missing local dispatch event is not proof of none. Opening, confirmed pre-dispatch cancellation, pre-dispatch failure or a bare timeout is not exposure. Reading stays unknown. Every AI layer kind (layout, addition, correction) needs the current disclosure check and the confirmed preview (QA ORG-10) | Real Notability import evidence; no duplicate external documents on retry; real reconciliation of unknown outcomes |
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
- Every request, and every server policy or snapshot, bound to the problem attempt it belongs to. Every intent
  of a device — "let me try", "stop telling me", a request, connected or not — is carried as a pending ordered
  intent with the policy version the device had applied when making it, until the server acknowledges it.
  Snapshots should acknowledge the **exact intents** they applied (by intent id), in the style of the 0.2.0 exact
  ACK, not a highest-sequence ACK. They should keep *applied* (accepted) separate from *current*, so that
  "accepted, then closed elsewhere" can be expressed (QA P012-D2). The test model approximates this with a close
  flag, accepted ids, the echo and a prefix rule that relies on in-order sending.
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

**0.2.0 capture contract, read at `e63b28f187eaf9577273c5131b65e7b9cc33646e`** (`packages/contracts/process_v2/README.md`,
`generated/contracts.ts`). It is capture only: operation and coverage records, and exact per-record ACK. It is
not the presentation, permission or export family, and nothing here transplants the test models into it. How
the web evidence would map, for a later adapter:
- The observer's `site_script` maps to `observed_actor: website`. `scripted_activation` evidence maps to
  `actor_basis: script_observation`. A closed-root opaque change maps to a `visible_change` with unknown
  before/after. The contract states that a trusted-input label alone does not establish the actor, including for
  scripted and shadow-DOM events, which matches the EO-1 repair.
- The timeline's `coverage_lost`, heartbeats and gaps map to `coverage` records (`unobserved`/`partial`,
  `disconnected`, `missing_events`). There is no complete flag, and a late recovery is a new assessment.
  `CaptureClock.domain_id` matches the one-clock-per-recorder assumption, and `media_position: null` matches an
  unknown position.
- **Difference to note:** in 0.2.0, same-stream `sequence` is the primary order and clock values are attributes.
  The test timeline orders by capture time and uses `seq` only for ties, so an adapter should order by stream
  sequence and treat a clock/sequence contradiction as unresolved timing (review finding ordering-01).
- Scoped stop and `historical` delivery match the organize model's live-versus-history transmission rule.

## 7. Commands and results

```text
$ apps/safari-extension/scripts/check.sh                               # module checks incl. P0-12 tests
typecheck: pass; node --test: 86 pass, 0 fail; build: pass
$ node --test --test-isolation=none apps/safari-extension/tests/p0-12-*.test.ts
38 pass (disclosure 3: 33 traces, 3,000 random sequences with a history-based oracle; organize 16;
observer lint 2; media timeline 17)
$ node apps/safari-extension/scripts/entries-check.mjs --browser "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --run p0-12-qafix-edge-entries
entries checks passed 20/20; failed: none; runner errors: 0
$ node apps/safari-extension/scripts/browser-check.mjs --browser "<same>" --run w2-edge-selftest
checks passed 54/54; failed: none
```

**P0-12 QA follow-up** (QA re-test `e26523e`, lead handoff `handoff_bb3179fd65457fcab0cef5f07db7226b`):
- Disclosure (P012-D1/D2/D3/D5):
  - QA's `adversarial.mjs` on the fcf89b2 model gives 7 FAIL lines; on the repaired model every line holds.
  - Of the 10 new named traces, 9 fail on the fcf89b2 model; the stale-acknowledgement control passes on both.
  - 53 mutants: 50 detected, 3 equivalent (section 2).
- Organize (ORG-1/3/10/11, plus ORG-9 and ORG-12/13):
  - QA's P4 races report exposure `none` on fcf89b2 and `possible` on the repaired model; local-only facts
    stay `none`.
  - 22 of 22 mutants detected (QA N3/N5/N6/N7 and the new rules), with a passing control. One survivor
    ("a delayed refusal hits the current question") was caught after adding a case where Q2's prompt had already
    been shown.
  - ORG-9: a later AI classification no longer replaces the user's explicit purpose. It is kept as a suggestion,
    and a confident different one is asked about.
- Observer (EO-1/EO-2, EO-9):
  - New checks: closed-root text origin unknown, scripted not user, trusted click user, and no write calls.
    All 4 pass on the repaired observer. On the previous observer the first three fail and so does the
    tripwire (it catches that observer's `getContext`): 17/20.
  - The lint guard flags all 12 QA insertions; the earlier guard flagged 1 of 12.
- W-2 (QA W1c/W1e/W1f): three new self-test checks (54/54). Re-running QA's three mutations of `src/page.ts`
  ([summary](evidence/w2-mutations/summary.json)) makes exactly the targeted check fail each time (53/54).
- Not addressed in this follow-up (QA lower-severity, left open):
  - ORG-4: no attempt or manifest identity on export events (P0-08);
  - ORG-5: no reconciliation gate before a retry;
  - ORG-7: layout-only consent covers a separate `addition` layer (an addition is not a change to the answer; kept);
  - EO-3 to EO-8, EO-10 and EO-11: fixture-only adapter limits (section 4);
  - W1-QA-04 to W1-QA-07: cosmetic and pre-existing probe items.

- **Rule-deletion mutations** (section 2): 23 of 23 detected on the revised model; rerun with the 5 backfill
  mutations of section 9 on the changed generator: 28 of 28.
- **Media-timeline mutations** (section 9): 30 of 30 detected on the repaired model, with a passing control.
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

## 9. Audio/screen increment: web contribution plan (AUDIO / AVTEST, all not_run)

**Sources read:**
- `docs/requirements/audio-screen-interpretation.md` (complete, original English), with its four exact user quotes.
- `docs/tasks.md#audio-screen-coordination`.

Read SHA: `89602e742aea9c6ef6b6ec6a76c371e20bff2edf` (content adopted in `7f43b59`). The files read are
byte-identical at that commit and at `main` `fcf89b2` (`git diff 89602e7 fcf89b2 -- docs/requirements docs/requirements.md
docs/tasks.md` is empty; `89602e7` is an ancestor of `fcf89b2`). Also read: `docs/requirements.md` R60 and A47–A49,
and D-AUDIO-SCREEN in `docs/requirements/intent-and-decisions.md`. Clauses used here: AUDIO-08 (alignment through
speed changes, seeking, pauses, clock differences, disconnection and backfill; a stale frame is not the screen
visible when the person spoke; no later correction as evidence of an earlier utterance) and AUDIO-14 (late
transcripts/backfill keep historical timestamps and cannot create a new live request or restore stale assistance
permission).

Follow-up read (lead review of `cb0f89b`): current-decision normalization at
`7fadd151c83118c22a4846bdb8b2622d47bb0df3` (content `9edbc1c65ccc06c3daaaea34a7b05dfaa849e29d`), read with
`git show 7fadd15:<path>`. Files read: `docs/requirements/intent-and-decisions.en.md#current-decisions` (with D-AUDIO-SCREEN and
Q-AUDIO-RETENTION in section 3), the complete current `audio-screen-interpretation.md`,
`history/audio-screen-discussion-2026-09-28.md`, `docs/tasks.md#audio-screen-coordination`, and `docs/roles/web.md`. Clauses
relevant to web:
- AUDIO-08 (unchanged since `89602e7`) names capture and received time, media position, device/source IDs, frame versions,
  relevant crops or selections, observed edits and versioned ink;
- AUDIO-14 keeps actual capture gaps, and a track's last audio or frame is not live after it becomes unavailable;
- the P0-12 card preserves independent source/role/context evidence and actual playback gaps, and a camera preview
  or caption is not audio;
- live listening has no saved-recording prerequisite; the reported M5/iPadOS 26.5 target, dualRoute candidates and
  AVTEST-09 pairs are outside the web path;
- all AVTEST cases stay `not_run`.

Nothing in this update changes a web requirement beyond these clauses.

The Web card covers **AUDIO-03/06/08–09/13–15** and **AVTEST-01/02/04/06/07/08/11**:
- preserve caption/screen/media evidence without promoting it to acoustic evidence or user reasoning;
- keep late audio historical;
- respect every output gate.

This is a plan plus two test-only models (checks 1 and 2 below). No runtime capture is implemented, no AVTEST case
was run, and no browser probe can certify iPad system playback or any app's audio.

**What the web path can and cannot contribute**

| Evidence | Web path (content script on a supported page) | Never claimed from it |
| --- | --- | --- |
| Caption text | Active cues of readable `textTracks` and DOM-rendered caption lines, with media position and capture time. Cross-origin tracks without CORS are unreadable (P0-02 evidence) | Not playback audio; not proof the audio was heard; not the professor's exact words (captions may be edited or auto-generated); not user speech |
| Media state | Element position, paused/playing, `playbackRate`, seek/pause events, muted/volume attributes | Not proof of audible or captured playback audio. DOM textTracks, a preview or a level meter are **not** playback-audio evidence (lead note on 89602e7) |
| Screen/page state | `dom_snapshot` frames (hashed, no pixels), frame versions, selections, the product's ink strokes with anchors | Not a pixel capture; not the AI composite (R59/A44 stays separate) |
| Audio | None: the web path captures no microphone or playback audio | Any AUDIO-06 capture result; that is the native path (P0-11/G3) |

**Plan per item**
- **AUDIO-03 / AVTEST-01:** supply page context for later reversible correction:
  - caption cue text, visible page text near a selection, and page terminology, each labeled as **site-provided**
    text with its source (track or DOM) and capture time;
  - original-language spans stay as observed;
  - the web records no correction. Corrections are separate proposed/confirmed/rejected records (P0-08/P0-09).
- **AUDIO-06 / AVTEST-04:** record for each web session that course audio was **not captured by the web path**.
  Record media state only as screen evidence. The test report for AVTEST-04 must list which inputs actually
  reached the AI from web (at most screen state and caption text), and must not report audio coverage.
- **AUDIO-08 / AVTEST-07:** a media timeline per video element, holding for each change:
  - capture time from one monotonic clock per recorder (e.g. `performance.timeOrigin + performance.now()`), not
    a wall clock that can step;
  - media position;
  - `playbackRate`;
  - play/playing/waiting/pause/seeking/seeked/ratechange events;
  - frame version.

  Each snapshot also holds the element's `paused`, `seeking` and `readyState` attributes. Where the recorder knows
  it, a snapshot holds a capture sequence number (`seq`, dispatch order within one recorder). The recorder adds:
  - `sample` heartbeats while nothing changes;
  - a `coverage_lost` entry when it stops observing the element or the screen (track unavailable, source
    stopped, disconnection, page hidden or left, or events known to be lost).

  A spoken reference at time *t* maps to the media position and the frame that were current at *t*. Seeking,
  rate changes, pauses, buffering, backfill and coverage gaps are handled by the recorded evidence, not by
  extrapolating from the latest frame. Clock differences between devices need a shared time base, which is not
  modeled yet (check 1 below). A frame more than 2 s older than the utterance, or one followed by a coverage loss,
  is marked stale. A later frame or edit is never used as evidence for an earlier utterance.
- **AUDIO-09 / AVTEST-06:**
  - Caption changes, media events and page text never start a conversation or an explanation. Only explicit ASK
    (and, later, the established talk control) does.
  - Keeping lecture captions is separate from deciding to respond. A quiet assistant still records cues.
- **AUDIO-13/14/15 / AVTEST-11:**
  - The web path stores no recording and adds none.
  - Stopping the share or session ends web observation of that source without auto-restart.
  - Late transcripts or backfill keep their historical timestamps. They **cannot become a live request, restore a
    withdrawn permission or reopen help**; they pass through the same disclosure gate (§1) as everything else.
  - A displayed camera view on a webpage is screen evidence only; its audio is not captured by web.
- **AVTEST-02/08:**
  - Observed edits and entry records (§4), the product's ink and selections stay separate from spoken
    interpretation and diagnosis.
  - "Let me try" is enforced across every channel by the existing gate.

**Test-only checks (written in this increment; models, not runtime code)**
1. **Media timeline** (`tests/p0-12/media-timeline.ts`, `tests/p0-12-media-timeline.test.ts`), for AUDIO-08 /
   AUDIO-14 / AVTEST-07:
   - an utterance time maps to the media position under a rate change, a seek and a pause;
   - a seek opened by `seeking` stays unresolved through any other event (`ratechange`, `play`, `pause`,
     `sample`) until `seeked`, also within one millisecond in recorded order. A snapshot whose `seeking` attribute
     is true is also unresolved;
   - evidence is ordered by capture time. Evidence with the same capture time is ordered only by a finite recorded
     `seq` that is distinct on every item; a partial, shared or non-finite `seq` is no order. Identical redelivered
     items count once. Without an order, conflicting same-time evidence gives the explicit unknown
     `conflicting_simultaneous_evidence`, never an order taken from arrival. Evidence that agrees (same position,
     `paused`, `seeking` and progress, and the same rate unless not progressing) is not a conflict, and gives one
     canonical result. A later observation ends a state conflict; only `seeked`, `seeking` or a gap ends a seek
     conflict;
   - an unpaused element below `HAVE_FUTURE_DATA` (buffering, after `waiting`) holds its position (basis
     `waiting`) until a `playing` or other snapshot; a reverse or invalid rate gives `unsupported_rate`, never a
     negative position;
   - after `coverage_lost` the position is `unknown` (`coverage_lost`) until a newer observation. After the gap,
     only that observation's own `seeking` attribute tells whether a seek is still open;
   - no state, playing **or paused**, is carried more than 5 s (engineering default, unchanged) past the latest
     observation. A long pause stays known only while `sample` heartbeats confirm it, so a silent loss of
     coverage also becomes an unknown gap;
   - evidence captured after the utterance is never used for it;
   - the frame for an utterance is the latest one captured at or before it, never a later one;
   - a frame is returned but marked stale when it is more than 2 s (engineering default) older than the utterance,
     or when screen coverage was lost after it and at or before the utterance (any of several losses). A loss at the
     frame's own capture time counts as after it;
   - different frames with the same capture time (including the same id with another version) and no recorded
     order give `conflicting_simultaneous_frames`;
   - evidence captured exactly at the utterance time counts (inclusive); evidence 1 ms later does not;
   - a seeded check builds 500 event/frame/loss sets with same-time evidence, redeliveries, shared and missing
     `seq`, seeking-attribute and version differences. It requires identical position and frame results for 4 random
     shuffles and a reversal per utterance time, and requires that conflicts, recorded-order ties and known results
     are all reached;
   - only edits observed at or before the utterance are candidates for "this line";
   - both engineering defaults (5 s, 2 s) are pinned by a test.

   **Lead review repair.** The `cb0f89b` model had three defects:
   - `play → seeking → ratechange` returned a known position (50.2) before `seeked`;
   - same-time `play`/`pause` gave 11 or 10.5 by arrival order, and same-time frames likewise;
   - a pause with no further evidence stayed known after 60 s, and there was no gap event.

   All three are reproduced on the old file and fixed here.

   **Internal adversarial review of the repair** (4 reviewers, one independent verifier each): 38 confirmed
   findings, 1 rejected. Fixed in the model:
   - an identical redelivery with the same `seq` cancelled a recorded order;
   - a `NaN` `seq` counted as an order;
   - agreeing duplicates returned a frame object that depended on arrival order;
   - paused snapshots that differed only in rate were reported as a conflict;
   - buffering (`waiting`, low `readyState`) advanced the position;
   - a negative rate gave negative positions.

   Tests were added for every untested rule. Among them are the distinct-`seq` rule, seeking-attribute and
   frame-version ties, a seek inside one millisecond, several losses, inclusive and 1 ms boundaries, the pinned
   defaults, and a gap ending a seek conflict. The tautological tie count was replaced. Wording fixes cover the
   stale-frame rule, the history of AUDIO-08, the extent of the shuffle check, and the deferrals below. Rejected:
   "a seek never closed by `seeked` stays unknown despite heartbeats". This is by design; a recorder that knows
   events were lost reports `coverage_lost`, which resets the sequence.

   Mutation check on the repaired model: 30 of 30 detected, with a passing unmutated control. The mutants
   include every reviewer survivor (shared or non-finite `seq`, partial order, no dedup, first/last tie pick,
   version or seeking ignored in ties, loss at *t* or at the frame time, exclusive boundaries, changed
   defaults, buffering, reverse rate).

   Not modeled (deferred, not claimed):
   - **clock differences** between the audio device and the page. The model assumes one monotonic time base per
     recorder; mapping native audio time to page capture time needs the P0-08 fields and the native path (P0-11).
     A wall-clock step is not modeled, and a recorded `seq` that contradicts capture-time order is not detected
     (it would need a recorder session id);
   - **received time** and **source/device IDs** (AUDIO-08). Neither the model nor this plan records them yet;
     they are P0-08 fields. This model covers one element and one screen per recorder;
   - **relevant crops or selections and versioned ink** (AUDIO-08) are not tied to utterance time here. The rule
     will be the same as for frames and edits (the version current at or before *t*, never a later correction),
     and it needs P0-08 selection and ink-version fields. `editsBefore` covers only generic timed edits;
   - **a partial `seq`.** A group in which only some items carry `seq` is treated as unordered (conservative),
     even when the unordered items agree with the highest-`seq` item;
   - **coverage signals themselves.** The model trusts the recorder to report detectable losses and to send
     heartbeats. Loss detection on real pages (visibility, navigation, frame teardown, throttled timers) needs the
     fixture probe (check 3) and devices;
   - **edits during a gap** were not observed. Their absence from `editsBefore` is unknown, not proof that nothing
     was written;
   - **utterance timing uncertainty.** An utterance is a point in time, and evidence captured at exactly that time
     counts as current (inclusive). A word-timing window from speech recognition is not modeled.
2. **Backfilled transcript request** (AUDIO-14 / AVTEST-11). The disclosure model gains a `backfilled_request`
   event: a request found in a late or backfilled transcript, carrying its historical `spokenAt` time. It changes
   nothing in the gate: it never activates a request, escalates open help, restores closed help or resolves an
   unsynced close. The user can ask again live. The transcript record that keeps it with its historical time is
   P0-09's and is not modeled here.
   - The random generator emits it; the independent oracle ignores it; invariant I4 now includes it.
   - Named trace `backfilled-transcript-request-is-history-not-live` (21 traces now).
   - Mutation check: 5 of 5 detected, both by the trace and by the random oracle, and also with the I4 equality
     check removed (live request, resolving the unsynced close, restoring closed help, escalating open help,
     live only when offline). The 23 earlier rule mutations were rerun on the changed generator: 28 of 28 detected,
     with a passing unmutated control copy.
3. **Still planned** (needs `src/`/fixture changes, not in this increment): a fixture probe that records
   `ratechange`/`seeking`/`seeked`/`pause` events and caption cues with capture times, labeling them as
   site-provided screen evidence.

**Still required, outside web:**
- actual iPad playback-audio capture with headphones and microphone (P0-11/G3);
- speaker attribution and route comparison (P0-10/learning);
- persistence of transcript/correction history (P0-09);
- versioned fields (P0-08);
- all AVTEST execution. Every AVTEST case stays `not_run`.
