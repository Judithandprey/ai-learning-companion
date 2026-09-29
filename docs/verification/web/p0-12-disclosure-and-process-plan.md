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
| Test-only executable model and traces | `apps/safari-extension/tests/p0-12/`: 53 named traces and 3,000 seeded random sequences with a history-based independent oracle. Disclosure mutations: 71 of 74 detected, the 3 survivors shown equivalent. Organize/export mutations: 34 of 34. Media-timeline model (section 9): 30 of 30. All reproducible with `evidence/p0-12-mutations/run_mutations.py` |
| Desktop fixture probe (answer entries + overlay coexistence) | `scripts/entries-check.mjs`, 21/21 on Edge 154 headless with trusted CDP input, including closed-shadow attribution and a write tripwire ([evidence](evidence/p0-12-qafix3-edge-entries.json)). The fcf89b2 observer gives 18/21 and the first repair `7ee1217` 20/21 on the same checks |
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
     acknowledges an intent. The evidence must come from a snapshot **strictly newer than every snapshot already
     applied** for the attempt. That snapshot is then also newer than the version the device had when it made any
     pending intent. At a reconnect, an equal-version snapshot still applies as the same state, but it
     acknowledges nothing (internal review of `7ee1217`). The snapshot must carry one of these:
     - the request id among its accepted requests, or the request as its current request (an echo). Intents
       are sent in order, so this also acknowledges every earlier intent: a causally later accepted request
       resolves a close;
     - `acknowledgedClose`, meaning this snapshot applied a close of this device. The boolean cannot say which
       close. The model reads it as the **first run of consecutive closes after the proven prefix**. Requests
       before that run count as received and not accepted, since intents are sent in order. The run stops at the
       next request: a later "let me try" cannot have been applied before an earlier request. So after an
       unaccepted offline request and a "let me try", the flag resolves that close (re-review of `8d67aaa`,
       liveness).

       **Known limit, not solved by a boolean:** two closes in a row are acknowledged together, although the
       server may have received only the first. The reading is also unsound if a server sets the flag as a
       sticky state bit rather than in the snapshot that applied the latest close it received. Exact
       acknowledgement by intent id (section 6) removes both limits.

     An intent is **not** resolved by any of these:
     - reconnecting;
     - one or more newer server versions without that evidence (a higher version alone is not proof);
     - an equal or older snapshot, which is superseded together with its acknowledgements;
     - a snapshot for another attempt;
     - leaving the attempt and coming back. An acknowledgement received while away, in a policy or a reconnect
       snapshot that is newer than what the device recorded for that attempt, is kept. Help itself never carries
       over.
   - **Rule 7 across sync:** each intent of this device supersedes every request known in the attempt before it.
     Known means from applied snapshots, from snapshots received while away that were newer than what the device
     recorded, and from its own requests. A snapshot that names a superseded request never brings it back:
     - if nothing is pending, it shows nothing;
     - while a close or the user's own answerable request is pending, it is stale and changes nothing;
     - under a dropped request, it closes help, because the server then holds no allowed request.

     After "let me try" is acknowledged, only a new request applies (internal review of `7ee1217`, oracle-02).
   - While an intent is pending, the latest one decides:
     - after a close, nothing is shown;
     - after the user's own request, that request is answered at its level and in its step scope at once. A
       newer snapshot that does not contain it has an unknown order against it. It may close help, or answer a
       strictly lower request **within the request's step scope**; anything else closes help. It never widens
       help (ADR 0002 §6; A32). A snapshot known to be older than the request changes nothing.
   - With nothing pending, the latest applied snapshot decides exactly. *Accepted* means the server applied the
     request, not that it is still current. A snapshot that accepts the request but is closed (for example after
     "let me try" on the iPhone) closes help (QA P012-D2).
   - On reconnect, every offline request still unacknowledged, in every attempt, is no longer answered, even
     when the snapshot is older; the user can ask again. While such a dropped request is the latest intent, the
     server may show only what **every** pending intent allows. An earlier unacknowledged close still allows
     nothing, and a dropped step check still limits the server to that step. A snapshot naming one of this
     device's unacknowledged requests is not evidence for it.
   - After a disconnection, a reconnect snapshot for **another** attempt, or one for this attempt that is **older**
     than the version the device holds, leaves this attempt's server state stale. Other-device help is withdrawn,
     and only this device's own pending request stays answered. A snapshot for this attempt then applies again,
     including one at the version already recorded: when nothing changed during the disconnection, the server's
     snapshot has that version. It acknowledges nothing (re-review of `8d67aaa`).
   - Otherwise a snapshot received while already connected is an ordinary resync: strictly newer versions only.
     Policy versions, pending intents and superseded requests are kept per attempt.
10. **Cache:** a cached result may answer a new request only at the **same** level, step scope, problem,
    version, attempt, revision and language. A cached full solution can never answer a hint request (A34). A
    derivative labeled below its source (a title cut from a solution) is never a cache answer (QA P012-D8/H6).
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
    - Remote requests carry no causal basis here, so the model treats server order as causal after an
      acknowledgement. A request from another device that was made before seeing a retraction, but that the
      server places after an acknowledged close, is shown (QA P012-D6). Guarding against it needs a causal basis
      on remote intents, which is a P0-08 item.
    - It does **not** record partial/unknown presentation outcomes or the single-presenter claim. Those are
      contract items (§6).

Engineering defaults chosen here, and open for P0-08 (lead) and P0-10 (learning):
- Level names and order: `none < clarify_goal < key_concept < step_check < local_next_step < full_solution`.
- A request made on this device while disconnected may be answered, on screen only. At reconnect it stops being
  answered unless the server accepts it, and it keeps restricting at its level until a later intent is
  acknowledged.
- Acknowledgement is modeled with a boolean close flag, accepted request ids and the echo. A real protocol should
  acknowledge exact intents by id and separate "applied" from "current" (section 6). The flag's known limits are
  stated in rule 9.
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
| connected-let-me-try-not-revived-by-same-version-reconnect | R53, A32, A34 | QA P012-D1 S1: a connected "let me try", a brief disconnect, and a reconnect at the pre-close version keep the full solution blocked. After an acknowledgement a later request applies, while the request the close cancelled never returns, also when a later snapshot names it again (rule 7) |
| connected-let-me-try-not-revived-by-newer-unrelated-snapshots | R53, A32, A34 | QA P012-D1 S1b and P012-D6 S4: newer snapshots still carrying the old request, or a late request from another device, cannot reopen **until the close is acknowledged**; an acknowledging snapshot with a new request can (the P012-D6 boundary is in rule 11) |
| connected-downgrade-not-replaced-by-older-full-solution | R53, A32, A34 | QA S1c: the user's own lower request stays through a same-version reconnect and a newer snapshot, which cannot raise it (QA MA): a card above its level stays blocked while it stays answered; after the echo, later server requests apply |
| accepted-then-closed-by-another-device | R53, A33, A34 | QA P012-D2: accepted is not current; a closed snapshot that accepts the offline request withdraws it |
| echo-resolves-close-then-later-request-shown | R53, A32, A34 | QA P012-D5 (a), liveness: the server echoing the user's later request resolves the earlier close, and a causally later iPhone request is shown |
| stale-acknowledgement-does-not-reopen | R53, A34 | QA H2: a late older acknowledging snapshot and a foreign one do not resolve the close, so a new other-device request that follows stays blocked |
| acknowledgement-while-away-is-kept | R53, A34 | QA P012-D5 (b): an acknowledgement for p1 received in a policy while on p2 counts after returning |
| acknowledgement-while-away-in-reconnect-after-disconnect / -in-resync | R53, A34 | The same acknowledgement delivered in a reconnect snapshot, after a disconnection or while connected (review mutants A10/A11) |
| stale-acknowledgement-while-away-ignored / equal-version-acknowledgement-while-away-ignored | R53, A34 | While away, an older or an equal-version acknowledging p1 snapshot is superseded; a new request after returning stays blocked (review mutant A18) |
| dropped-offline-downgrade-still-restricts | R53, A32, A34 | An unaccepted offline lower request is not answered, but it keeps the old full solution out while a lower server request may show; a later acknowledged request applies |
| dropped-request-allows-server-at-its-level | R53, A34 | Liveness at the boundary: after an offline key-concept request is dropped, a new server request at that level shows at once; the request it superseded does not (review mutants A01/A03) |
| dropped-request-does-not-lift-earlier-close | R53, A32, A34 | A connected "let me try" never acknowledged, then an offline request the server does not accept: even a new request from another device stays out (review safety-04) |
| dropped-step-check-caps-scope | R53, A32, A34 | A dropped offline step check keeps an unscoped goal hint out (review safety-03) |
| step-check-not-widened-by-unordered-snapshot | R53, A32 | Under a pending "check step s1", a newer snapshot with an unscoped lower hint closes help rather than widening. After "let me try" and a step check, a snapshot still carrying the closed hint changes nothing (review safety-03) |
| offline-request-dropped-on-left-attempt | R53, A34 | Liveness: an offline request on p1 is dropped at a reconnect made on p2, so later p1 help at or below its level shows on return (review safety-05) |
| reconnect-for-another-attempt-leaves-remote-permission-stale | R53, A34 | After a disconnection, a reconnect naming p2 keeps p1's other-device permission withdrawn until a p1 snapshot arrives; one at the version already recorded restores it (review safety-06; re-review of `8d67aaa`) |
| older-reconnect-leaves-remote-permission-stale | R53, A34 | A reconnect for p1 at an older version than the device holds also withdraws other-device help, until a snapshot at the recorded version (re-review of `8d67aaa`) |
| own-request-survives-reconnect-for-another-attempt | R53, A34 | The user's own pending request stays answered through a reconnect for another attempt and a higher unordered snapshot (re-review of `8d67aaa`) |
| close-flag-reaches-close-after-unaccepted-offline-request | R53, A32, A34 | Liveness: an offline request, "let me try", and a reconnect that acknowledges a close and accepts nothing; the close is resolved and a later other-device request is shown (re-review of `8d67aaa`) |
| superseded-request-stays-retired-after-leaving / older-snapshot-while-away-is-not-known | R53, A32, A34 | Superseded requests are kept per attempt; a snapshot received while away counts as known only if newer than what the device recorded |
| equal-version-reconnect-acknowledges-nothing / equal-version-reconnect-does-not-accept-downgrade | R53, A32, A34 | A reconnect at the version already applied acknowledges nothing, by flag or by acceptance, so a new other-device request after it stays blocked; the same acknowledgement in a newer snapshot does resolve it (review safety-01) |
| close-flag-does-not-cover-a-later-close | R53, A32, A34 | "Let me try", a request, "let me try": a close flag without accepting the request covers only the first close, so a new other-device request stays blocked until the last close is acknowledged; the echoed request stays blocked for good (rule 7) (review safety-02) |
| server-close-withdraws-lowered-remote-request | R53, A34 | Under the user's pending request, a lowered other-device request is withdrawn when a newer snapshot closes help (review mutant A43) |
| connected-request-restricted-by-newer-unacknowledged-snapshot | R53, A34 | Unknown order is restrictive: a newer snapshot without the user's request may lower it, never widen it, until the echo |
| known-older-snapshot-does-not-restrict-later-request / known-older-closed-snapshot-does-not-close-later-request | R53, A34 | Liveness: a reconnect at the version the device had when the user asked neither answers, restricts nor closes that request |
| cached-voice-segment-never-served | R09, A34 | A cached voice segment is never reused as an answer (QA MD); a cached card at the same binding is |
| cache-never-serves-a-derivative-of-higher-content | A33, A34 | A title cut from a full solution but labeled as a hint is never a cache answer for a hint request (QA P012-D8/H6) |

Invariants over 3,000 seeded random event sequences (40 events each). The random events include:
- remote policies and reconnect snapshots for the current attempt, a visited attempt (at versions relative to
  what the device recorded for it) or an unknown one;
- older, equal and newer versions;
- snapshots carrying requests, echoing this device's request, accepting it, or naming an id already known;
- stale snapshots with acknowledgements;
- connected and offline closes, requests and step checks, and backfilled transcript requests.

The **independent oracle** is history-based. It never reads the model's context. For each attempt it keeps the raw
history, in order:
- this device's intents, each with the version it had applied and the request ids known when it was made;
- the snapshots that count.

From that history alone it computes:
- **acknowledgement**, by the rule 9 conditions, restated over the history;
- the **cap**:
  - an unacknowledged "let me try" allows nothing;
  - the user's own pending request allows its level and step;
  - a dropped offline request allows only what every unacknowledged intent allows;
- with no cap, the **expected request**: the unsuperseded request of the latest snapshot applied since the
  attempt was entered, or since a reconnect for another attempt made it stale.

QA P012-D4 noted that the previous oracle mirrored the model's state machine and agreed with all 22 D1
violations. The internal review of `7ee1217` then found that the first history-based oracle still copied the
equal-version acknowledgement rule. The oracle now requires a strictly newer snapshot and checks scopes, the
dropped-request intersection, superseded requests and stale foreign reconnects. Whatever is presented:
- never exceeds the current permission;
- **I16:** never exceeds or leaves the step of the history cap, and with no cap only answers the server's current
  request;
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
- **I16** on the context:
  - under a close cap nothing disclosing is active;
  - under the user's own pending request, only that request is active, or a strictly lower, unsuperseded,
    in-scope request from a snapshot applied after it;
  - under a dropped request, only the latest snapshot's request is active, and only if every pending intent
    allows it;
- **I17:** right after the user's request, exactly that request is active;
- every cache hit matches level, scope, problem, version, attempt, revision and language, and is never a
  derivative of higher content.

The test asserts that each of these paths was actually reached more than 50 times. After the re-review of `8d67aaa`,
the snapshot counters count only snapshots the model processes (not ones discarded as old or while disconnected),
and the lowering and step-check counters count the event, not the state that follows. A generator case aimed at
the unknown-order paths was added so that the processed paths are reached:
- a connected close followed by a snapshot: 3,766 (a state count);
- a processed higher snapshot after a request that lowered earlier help: 206;
- acknowledgement that resolves the cap, by echo 371, by acceptance 399, by the close flag 385;
- older snapshots whose evidence would have resolved the latest intent, ignored: 3,657;
- the same at an equal-version reconnect, ignored: 249;
- an acknowledgement while away that actually removed a saved pending intent: 67;
- a dropped request still capping: 1,924 (a state count);
- a processed snapshot that lowered the user's request: 319;
- a processed snapshot that closed an open step check: 163;
- a processed snapshot naming a superseded request: 153;
- a reconnect for another attempt after a disconnection: 708;
- identity checks, stale reconnects, scoped presentation, cache hits and a backfilled request while capped
  (all in the thousands).

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
    a close;
  - P012-D8 (H6): a cache hit could be a derivative labeled below its source.
- Internal adversarial review of the first repair (`7ee1217`; 4 lenses, each with an independent verifier):
  - an equal-version reconnect acknowledged intents (blocker);
  - the close flag cleared a later close the server never received (blocker);
  - unknown-order restriction and the dropped-request cap widened a step check;
  - a dropped offline request lifted an earlier connected close;
  - offline requests on a left attempt were never dropped;
  - a reconnect for another attempt re-authorized stale remote help;
  - a snapshot naming the request that "let me try" cancelled brought it back after the acknowledgement. A
    trace had required this;
  - several mutants survived for lack of traces (A01, A03, A10, A11, A18, A43).
- Focused re-review of the second repair (`8d67aaa`; 3 lenses with verifiers; 18 findings, 17 confirmed):
  - a close made after an unaccepted offline request could never be acknowledged by the flag, so all later
    server help stayed suppressed (liveness);
  - after a reconnect for another attempt, help never returned at the recorded version;
  - an older same-attempt reconnect still gave pre-disconnect other-device help back as current;
  - the own-request rule on a foreign reconnect and the away-id rule were not pinned;
  - named traces did not discriminate five mutants that only the random oracle killed;
  - the flag's residual ambiguity (two consecutive closes) was not recorded. It is now stated in rule 9 as a
    known limit, not fixed: a boolean flag cannot be made sound.

All are fixed and each is covered by a named trace or an invariant. Against the 4c32e49 model, five of the six
new negative traces fail (the accepted-request positive control passes on both), and the new oracle fails at
seed 111. For the QA follow-up and its review:
- QA's own probe (`p012-disclosure/probes/adversarial.mjs` at `e26523e`) reports 7 FAIL lines on the fcf89b2
  model (S1, S1b, S1c, both S2 lines, S3, S4) and a NOTE for H6. On the repaired model, every S and H line holds,
  including H6.
- 32 named traces were added after `ec18580` (53 in total):
  - 23 fail on the fcf89b2 model;
  - 12 fail on the first repair `7ee1217`;
  - 4 fail on the second repair `8d67aaa`;
  - the others are liveness or mutant-pinning traces that the respective older model already satisfied.
- 63 of the 74 disclosure mutants now fail a named trace, not only the random oracle.

**Mutation check (P0-12 QA follow-up, reproducible).** The driver
[`evidence/p0-12-mutations/run_mutations.py`](evidence/p0-12-mutations/run_mutations.py) lists every mutant with its
exact replacement and writes per-mutant results ([disclosure.json](evidence/p0-12-mutations/disclosure.json)). Of
74 single-point disclosure mutants, 71 are detected, with a passing unmutated control:
- 21 gate and cache rules, including QA MC, MD, ME, MF, MJ, MK and the derivative cache rule;
- 48 intent, acknowledgement, restriction, cap, drop, stale-reconnect, supersession and switching rules. These
  include QA MA and MB, review mutants A01, A03, A10, A11, A18 and A43, and the re-review rules (flag past an
  unaccepted request, own request on a foreign reconnect, older reconnect, equal-version restore, ids from away
  snapshots);
- the 5 backfill mutants.

The 3 survivors are equivalent in this model (recorded in the JSON):
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
[Report](evidence/p0-12-edge-entries.json) and screenshots `evidence/p0-12-edge-entries-0*.png`. The current run,
after the P0-12 QA follow-up and both internal reviews, is
[p0-12-qafix3-edge-entries.json](evidence/p0-12-qafix3-edge-entries.json) (21/21). The same run on `8d67aaa` is
[p0-12-qafix2-edge-entries.json](evidence/p0-12-qafix2-edge-entries.json) (21/21). The same checks were run with the fcf89b2 observer
([18/21](evidence/p0-12-qafix2-eo-before-fcf89b2.json)) and with the first repair `7ee1217`
([20/21](evidence/p0-12-qafix2-eo-before-7ee1217.json)). The first repair's run
([p0-12-qafix-edge-entries.json](evidence/p0-12-qafix-edge-entries.json), 20/20) predates the synthetic-event check.

The observer only listens and reads. Two checks guard this, and neither is a proof about arbitrary code:
- **Lint guard** (`tests/p0-12-observer-safety.test.ts`): the observer source uses none of the listed write,
  focus, click, dispatch, submit, tree, attribute, canvas-context, navigation, network, storage and dynamic-code
  APIs and properties. It checks them as member references (including optional calls, `.call` and literal
  computed names such as `el['click']`), as writes with every assignment operator (also after a TS `!` or by
  literal computed name), as `++`/`--`, and as destructuring targets. QA EO-2 inserted 12 writes and the earlier
  guard flagged **none** of them.
  - The first repair (`7ee1217`) flagged 10 of QA's 12. It missed `['value'] = ` and `.blur?.()`, and its test used
    a substituted list.
  - The guard now flags all 12, inserted verbatim at QA's anchors
    ([lint.json](evidence/p0-12-mutations/lint.json)). It also flags 22 further spellings from the review of
    `7ee1217` and 14 from the re-review of `8d67aaa`. The latter restore the bracket-click and bracket-submit
    coverage that `8d67aaa` had dropped, and add updates and destructuring.
  - It cannot see aliases (a variable key, or a destructured method such as `const { click } = proto`), APIs not
    on the list, or code outside the file.
- **Behavioral tripwire** (`entries.observer_no_write_calls`): the fixture wraps page-changing, submitting,
  network, storage and canvas-context APIs before the observer starts. Each call records whether the observer's
  module is on the call stack.
  - In the runs, none of the calls came from the observer.
  - The site's own writes were seen (click, dispatch, value, checked, tree and attribute changes), so the
    tripwire was live.
  - With the fcf89b2 observer it caught that observer's `canvas.getContext('2d')` pixel probe (QA EO-9). That
    call could create or lock the site's drawing context, and it is removed.

  This covers the exercised paths only.

Password, hidden and file inputs, and fields with password, one-time-code or card autocomplete, are never read.
A field stays excluded after the page changes its type. This is tested with a "show password" toggle on a field
without an autocomplete hint: reverting that protection leaks the password into records, and the check catches it.

| Entry | Observed on desktop (fixture) | Attribution | Limits / not established | iPad Safari | Fallback |
| --- | --- | --- | --- | --- | --- |
| Single choice | select → change (the previous radio's deselection **derived from group state**; that radio fires no event) → reselect | user (trusted event) | Order is document-local. The reason for a change is unknown. The final choice is not the process | untested | visual observation + gaps |
| Multiple choice | check / uncheck per box, with correct before/after | user | same. **Poll window (QA EO-7, open):** a silent site change to a choice (no event) is detected by the 200 ms poll; if the learner clicks in the same group before that poll, the site's change is merged into the learner's record, and the site's change can even be credited to the learner. The same applies to single choice | untested | same |
| Choices inside an open shadow root | select, the derived deselection, check. Recorded from the **composed** `input` event, because `change` does not cross shadow boundaries | user | A synthetic `change` inside a shadow root is invisible from outside | untested | visual |
| Text input / textarea | every edit with before/after and `inputType` (14 → 1 → 13) | user | Keystroke-level only for real text input; IME composition and paste untested. **Trusted input from `execCommand`, browser autofill or another extension is currently labeled user**; it cannot be told apart here | untested | visual + gaps |
| Site reformats the field in its own handler | the user's edits keep their own before/after (`→c`, `C→Cm`); the site rewrites (`c→C`, `Cm→CM`) are separate **unknown-actor** records, taken on the next `beforeinput` or poll | user / unknown | Poll-detected changes have a detection window, not an exact moment | untested | — |
| Formula (`contenteditable`) | edits with final text | user | Real formula editors (MathQuill-, Desmos- or canvas-based) often use hidden textareas or canvases. **Not probed**; per-site verification needed | untested | visual + gaps |
| Site's own canvas | pointer activity only: sample count and extent | user | **Visual/pointer-only.** No strokes, erase/undo (the site has its own undo) or semantics. Pixel readability is not probed, since `getContext()` could create or lock the site's context (QA EO-9) | untested | visual observation; product WRITE layer |
| Open shadow DOM | value readable via `composedPath` | user | Per component | untested | — |
| Closed shadow DOM | only "something changed in host"; **no value, no control**. The origin comes from a click or key on the host. A trusted one means user, and the first trusted change it explains consumes it. A scripted `click()` inside the closed root arrives retargeted to the host as an untrusted click, so it means site, or unknown during a live gesture. **An untrusted (synthetic) event is never user**, whatever click came before it | user / site / unknown | Opaque. **Without a mark the origin is unknown, never user.** QA EO-1: the fcf89b2 observer credited a page script's `click()` inside the closed root to the learner. The review of `7ee1217` found that the first repair credited the component's own synthetic event after a user click to the learner. Both were reproduced in the owned browser (18/21 and 20/21). Now: a script tick with no gesture gives site; inside a site button's handler it gives unknown; a trusted click on the box gives user; the component's synthetic event after the click gives unknown; text via `insertText` (like an IME commit, no key event) gives unknown. **Window:** a mark expires at the next 0 ms timer, so a site timer queued before it can still see it. Trusted text the site inserts with `execCommand` right after a host click is labeled user, as for open fields. Detecting a closed root is a tag-name heuristic (QA EO-6) | untested | visual |
| Same-/cross-origin frame | recorded by the observer running **inside** each frame. This probe does not read frame documents from the top | user | Needs injection into every frame (`all_frames`, documented for Safari iOS 15+) and a host permission for the frame's origin. Frame records carry **no problem binding** because the fixture frame has no problem adapter; linking them to the outer question would be an inference | untested | visual |
| Site restores a draft (script sets value) | recorded as `change_without_event`, actor **unknown** | unknown | Site, browser autofill and other extensions cannot be told apart | untested | — |
| Site dispatches a synthetic event | actor **site** (untrusted event). A synthetic `change` that changes nothing is `no_value_change`, not a check | site | — | untested | — |
| Site calls `el.click()` | the resulting `input`/`change` reported **`isTrusted=true`** in Edge. Recorded as `scripted_activation`, because the click that caused it was untrusted. Inside the handler of a real user click (a live gesture) the actor is **unknown**, never user | site / unknown | **`isTrusted` alone does not prove a user action** (matches the HTML spec reading). The mark expires at the next 0 ms timer, so a site timer queued before the click can still see it; it only relabels site events, and a trusted click clears it. Other script paths (e.g. `form.reset`, framework state) need their own checks | untested | unknown when in doubt |
| Site grading / "Show answer" | recorded as site feedback, separate from user input | site | Only through a **per-site adapter** (here `[data-site-feedback]`). A generic page gives no semantic feedback signal; it stays unknown | untested | visual + unknown |
| Next question | problem change recorded; later answers bind to the new problem; script-cleared answers are actor unknown **when the poll sees them first**. If the learner answers before the next poll, a script clear of the previous answer is recorded as the learner's deselection on the new problem (QA EO-7, open; see Multiple choice) | site / unknown | Problem identity comes from a **per-site adapter** (here `data-problem-id`). Real sites need an adapter, URL, or visual cues, or else an ask-once confirmation. Redo vs new problem is ambiguous without it | untested | short confirmation (R51) |
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
| Purpose (INTENT-NOTE-CLASSIFICATION) | Purpose is independent of display mode and can be corrected. Correction keeps the AI's earlier decision in the history, and ink is never deleted. The user's correction stands until the user changes it; a later AI classification is only a suggestion, asked about once when it is confident and different (QA ORG-9), not again for the same suggestion, also after the user answered by keeping their purpose. An unsure classification asks one minimal clarification, not one per pass. Notes → Notability flow, drafts → process archive only, final answer → answer prompt, unsure → one minimal clarification | Real classification quality (learning); no per-stroke manual tagging |
| INTENT-ANSWER-PROMPT | Ask promptly once when the on-screen answer is finished. Pausing, leaving the screen, a correct answer, continued editing or switching problems are not "finished". When unsure, one combined question (done? organize?).<br>A refusal names the prompt actually shown and binds to **that question** (ADR 0002 §8, QA ORG-1). It survives visiting other questions. A delayed refusal stays evidence for its own question and never suppresses another. A refusal of a prompt never shown is ignored. Each refusal carries its own id (e.g. device and sequence), so two refusals of the same prompt stay distinct. Only a causally later explicit reopening that names every refusal in force supersedes them. A refusal it did not see has an unknown order and is kept, whatever the arrival order. A replay of a superseded refusal is ignored (internal review of `7ee1217`). Every refusal the reopening names is superseded, also one delivered after it, so a named refusal that arrives late does not come back (re-review of `8d67aaa`). Reopening is the user organizing, not a repeated prompt | Completion detection and timing measured on real use; no invented thresholds |
| INTENT-HOMEWORK-CHOICE | Offer only destinations that exist at that moment: Notability homework (when sharing works), the matched assignment document from an authorized source (e.g. bCourses; confirm when ambiguous), preview, not now. **Submission is never an option**; a source is not a submission target | Real bCourses material matching and versioning (backend); native share path (iOS) |
| INTENT-FAITHFUL-EXPORT | Export is tracked **per attempt**. `prepared` starts the initial attempt, and opening the panel again after an attempt ended starts a new one. Each attempt ends as one of: cancelled, failed before dispatch, dispatching, shared (awaiting import), dispatch unknown, imported, or effect unverified.<br>Local events can be missing or reordered. **Evidence of an external effect is never discarded** (QA ORG-3). A delivery report, an unknown outcome or a dispatch start raises the attempt even without a local dispatch start, or after a local cancel or failure. An import report not chained to a dispatch of this attempt is `effect_unverified`: a possible effect, never an import. A later cancel or failure never erases it, and later dispatch evidence makes a new import report chainable. Late or reordered events never lower a stronger outcome of the same attempt (internal review of `7ee1217`). An unknown outcome is never reported as shared (QA ORG-11), and is resolved only by later evidence (QA ORG-12). Events still carry no attempt or manifest identity (QA ORG-4, a P0-08 item).<br>Opening the share panel is **only a local fact**: it is neither "shared" nor dispatch. "Shared" needs the share system to report delivery to a target. "Imported" needs target evidence after a dispatch. A generic timeout with no evidence that dispatch started creates no external effect.<br>Cancellation, failure or reopening never erases what an earlier attempt did. The latest attempt is reported separately from "ever shared / ever imported". A46 actual import stays separate.<br>Organizing keeps the user's layers and layout; AI suggestions are separate and previewed; nothing is submitted.<br>Following ADR 0002 §8 (proposed), external dispatch requires a confirmation bound to the **exact manifest**. Every exported AI layer must have been in the confirmed preview and must pass the **current** disclosure check at dispatch. Layout-only consent never covers a change to the learner's answer. Regenerated content needs a new manifest and a new confirmation.<br>Following ADR 0002 §7, help-bearing content is **possible external exposure** when any attempt has effect evidence: dispatch started, shared, outcome unknown, imported, or effect unverified. A missing local dispatch event is not proof of none. Opening, confirmed pre-dispatch cancellation, pre-dispatch failure or a bare timeout is not exposure. Reading stays unknown. Every AI layer kind (layout, addition, correction) needs the current disclosure check and the confirmed preview (QA ORG-10) | Real Notability import evidence; no duplicate external documents on retry; real reconciliation of unknown outcomes |
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
  flag, accepted ids, the echo and a prefix rule that relies on in-order sending; the boolean flag has known
  limits (two consecutive closes, a sticky flag) stated in rule 9 that only exact intent ids remove.
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
typecheck: pass; node --test: 87 pass, 0 fail; build: pass
$ node --test --test-isolation=none apps/safari-extension/tests/p0-12-*.test.ts
39 pass (disclosure 3: 53 traces, 3,000 random sequences with a history-based oracle; organize 17;
observer lint 2; media timeline 17)
$ node apps/safari-extension/scripts/entries-check.mjs --browser "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --run p0-12-qafix3-edge-entries
entries checks passed 21/21; failed: none; runner errors: 0
$ node apps/safari-extension/scripts/browser-check.mjs --browser "<same>" --run w2-qafix2-edge-selftest
checks passed 54/54; failed: none
$ python3 docs/verification/web/evidence/p0-12-mutations/run_mutations.py
disclosure 71/74 (3 equivalent), organize 34/34, timeline 30/30, lint 12/12; every control passes
```

**P0-12 QA follow-up** (QA re-test `e26523e`, lead handoff `handoff_bb3179fd65457fcab0cef5f07db7226b`). The first
repair `7ee1217` went through an internal adversarial review before delivery: 4 lenses, each with an independent
verifier, 31 confirmed findings (4 blockers) and 2 rejected. The second repair `8d67aaa` then went through a
focused re-review (3 lenses with verifiers): 18 findings, 17 confirmed, 1 rejected. It had 1 blocker: a named
refusal that arrives after the reopening came back. This state repairs all of them, except the flag limit it
records in rule 9. Mutation results are
reproducible with [`evidence/p0-12-mutations/run_mutations.py`](evidence/p0-12-mutations/run_mutations.py) (per-mutant
JSON next to it).
- Disclosure (P012-D1/D2/D3/D5/D8, and the review's safety-01 to safety-08 and oracle-02 to oracle-07):
  - QA's `adversarial.mjs` on the fcf89b2 model gives 7 FAIL lines and the H6 NOTE. On the repaired model every
    line holds, including H6.
  - 32 named traces were added after `ec18580`. 23 fail on the fcf89b2 model, 12 on `7ee1217` and 4 on `8d67aaa`;
    the rest are liveness or mutant-pinning traces (section 2).
  - Mutants: 71 of 74 detected, 3 shown equivalent; 63 fail a named trace
    ([disclosure.json](evidence/p0-12-mutations/disclosure.json)).
  - Known limit kept open: a boolean close flag cannot tell two consecutive closes apart (rule 9). Exact
    intent-id acknowledgement belongs to P0-08.
- Organize (QA ORG-1/3/9/10/11/12/13, and the review's -3 to -6, -8 and -9):
  - QA's P4 races report exposure `none` on fcf89b2 and `possible` on the repaired model; local-only facts
    stay `none`.
  - Refusals carry ids, and a reopening supersedes every refusal it names, also one that arrives later, so
    arrival order does not decide.
  - Evidence after an unverified report is chained; late events never lower an outcome; the same AI suggestion
    is asked about once, also after the user answered; an unsure pass asks once.
  - Mutants: 34 of 34 detected ([organize.json](evidence/p0-12-mutations/organize.json)).
  - ORG-2 (refusal guard mutants) is covered by these.
- Observer (QA EO-1/EO-2/EO-9, the review's organize-observer-1, -2 and -7, and the re-review's lint and
  mark-lifetime findings):
  - Entries checks: 21/21 with the current observer
    ([p0-12-qafix3-edge-entries.json](evidence/p0-12-qafix3-edge-entries.json)). The detail of a trusted change
    after the host's mark was used now says so, instead of claiming there was no click. The fcf89b2 observer gives 18/21: text origin, scripted
    not user, and the tripwire fail; the trusted-click positive control passes. The `7ee1217` observer gives
    20/21: only the component's synthetic event after a click fails.
  - Lint guard: QA's 12 insertions verbatim at QA's anchors, 12 of 12 flagged
    ([lint.json](evidence/p0-12-mutations/lint.json)). The earlier guard flagged 0 of 12 and `7ee1217` flagged 10 of
    12. The test also flags 36 further spellings from both reviews, including literal computed names, `++` and
    destructuring.
- W-2 (QA W1c/W1e/W1f): three new self-test checks. 54/54 on the first repair, and again 54/54
  ([w2-qafix2-edge-selftest.json](evidence/w2-qafix2-edge-selftest.json)) after a comment-only `src/page.ts`
  change. Re-running QA's three mutations of `src/page.ts` ([summary](evidence/w2-mutations/summary.json)) makes
  exactly the targeted check fail each time (53/54).
- W1-QA-07: the W-1 document and the `page.ts` comment said frames render no cards. Frames do render their own
  status cards for `source_unregistered` and `empty_geometry`; both texts are corrected.
- Not addressed in this follow-up (left open):
  - QA ORG-4: no attempt or manifest identity on export events (P0-08);
  - QA ORG-5: no reconciliation gate before a retry;
  - QA ORG-6 and ORG-8: confirmation bound only to a manifest id, and no purpose recheck at dispatch. These are
    P0-08 observations;
  - QA ORG-7: layout-only consent covers a separate `addition` layer. An addition is not a change to the
    answer, so this is kept;
  - QA P012-D6: a remote request has no causal basis (rule 11, a P0-08 item);
  - QA EO-7: the choice poll window (stated in section 4). QA EO-3 to EO-6, EO-8, EO-10 and EO-11 are
    fixture-only adapter limits recorded in QA's report (`docs/verification/qa/p0-12-w1-retest.md` at `e26523e`),
    not repeated here;
  - QA W1-QA-04 to W1-QA-06: cosmetic and pre-existing probe items.
- Review finding rejected by its verifier (kept as documented design): under a pending own request, a lowered
  server request stays until the echo even if a later snapshot names a higher one (restriction is monotone).

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
   - Named trace `backfilled-transcript-request-is-history-not-live` (the 21st trace at that point).
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
