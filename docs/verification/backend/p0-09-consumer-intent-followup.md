# P0-09 consumer and confirmed-intent follow-up

Status: **design only; every transaction and INTENT scenario remains unexecuted**.
This extends [the existing design](p0-09-process-design.md), not contract 0.1.0.
No endpoint, schema field, migration, live overlay or external write is added.

The [current ADR continuation](#current-adr-continuation-at-80b99cc) below appends
four schedule families. Earlier schedules and historical check results are retained;
the continuation clarifies possible external exposure and the now-decided deletion
fences without treating the original packet as current permission to disclose.

## Reading, scope and traceability

Read the exact committed `44e60ec289717e155fb0f4374784c791bf23689c` versions of
AGENTS, TEAM, backend role, team directory, the P0-09 card and audit continuation,
requirements, the detailed problem-solving supplement, confirmed intent/decisions,
original-goal verification and relevant traceability rows. Relevant original
clauses are R27/R29/R30/R46–50 and R51–59, main specification §7.4–7.8/9.4/10.1/12,
and the five INTENT definitions. The original classroom source → live ink →
editable original/context → separate AI additions → actual Notability archive
flow is retained. The 19 original-goal V-* cases and P1–P4 backlog are unaccepted;
this P0 work neither executes nor newly dispatches them.

Read both learning consumer-review files at
`fd5162b9d1d3c10420e26f51b7d4b680a9d0769f`: 25 vectors reviewed, four requested
assertion groups across eight vectors, zero transactions executed. The original
[vector file](p0-09-transaction-vectors.json) and [historical evidence](p0-09-evidence.md)
remain byte-identical to `014d1807afcaa7b8a34ac4b6cf1c7639fc275d55`. The new
[declarative addenda](p0-09-consumer-intent-vectors.json) reference those schedules;
they are not a duplicate corpus, runtime protocol or independent acceptance IDs.
Their ordinals describe injected test interleavings, not cross-device chronology.

The working branch is `team/backend`. This continuation started clean after the
separately requested HTTP fix `d4a503ecaf33f21b23d57a29901347ea2141258f` (parent
`30dc33d8b5d0bae9a108e9b6328b036622484ffa`). Specification/review reads used
`git show`; no merge, reset or application change was needed for this document
delivery. P0-04's later review fixes and learning's deliveries supersede the old
design's pending-delivery wording. No prior implementation test count is claimed
as evidence for this design. PONYTAIL LITE reuses the existing archive, CAS,
dependency invalidation and export evidence; it changes no effort or permissions.

## C1–C4: evidence changes must reach consumers

Extend the existing transaction table with the following requirements. All are
proposed semantics for P0-08 to represent in one shared contract. Learning owns
semantic assessment; backend preserves exact evidence and fences dependent work.

| Review group / original vectors | Required change and adversarial boundary |
| --- | --- |
| C1 / V06, V12, V16, V17 | Version the evidence used by learning projections, including actual presentation, coverage/causal uncertainty and the reviewed assistance extent. A new or corrected fact invalidates already-current dependent diagnosis/classification and fences in-flight old work in the same transaction. Test both serial winners. |
| C2 / V17, V20 | Query evidenced same-question help across linked attempts. A retry with no local receipts is not a clean exposure history. A genuinely unseen, separately identified Q2 can support independent transfer with observed reasoning; same concept alone does not contaminate it. |
| C3 / V13 composed with V17/V20 | Deleting A1 also removes or invalidates A2's derived claims dependent on A1, even while A2's independent originals survive. Missing deleted evidence cannot become proof of no help. Fence old projection jobs and rebuilds without retaining erased content secretly. |
| C4 / V22, V25 | Keep AI input evidence, learner display/playback evidence and target import evidence separate. Neither AI input nor import creates a learner-help receipt. Removed AI layer L2 cannot be inferred delivered by X5; genuine earlier L2 exposure remains historical. |

A learning job must bind the exact retained evidence set/revisions it read, its
causal/coverage assumptions, semantic assessment revision and lifecycle fences.
Adding a previously absent receipt or prior-attempt relation changes the evidence
set too; checking only IDs already present misses this race. An updated evidence
set and invalidation of dependent current projections commit together. Reads cannot
continue serving the old classification as current while recomputation is pending.
The new revision may be unknown; it need not manufacture an alternative label.
If the old job commits first, the later fact invalidates it. If the fact commits
first, the old job fails its current-evidence check. Identical receipt replay does
not append a second fact or repeatedly schedule a new classification.

For late H2 or a later confirmed H3 audio range, retain exactly what the device
reported and what remains unconfirmed. A causal reference can establish that
solution exposure preceded a correction; disagreeing wall clocks alone cannot.
Cross-device order unknown means that causal interpretation stays unknown. A
reported display/playback is evidence of presentation, not attention, understanding
or learning benefit. Generation, cancellation and empty receipt lists still cannot
prove unaided work.

For the p37-style mislabeled hint, keep the requested hint, historical permission,
content bytes/hash, channel and actual presentation fact unchanged. Append the
reviewed assessment that those bytes exposed a solution, with basis/uncertainty
and supersession links; invalidate dependent learning labels and future eligibility
of that content in a hint cache, including notifications and audio. This correction
records a disclosure violation; it never retroactively grants solution permission
or rewrites the original label as if no violation occurred. Future display still
passes current attempt/intent checks. V12's user correction and this assessment
correction share dependency fencing, but a reason correction is not automatically
a correction of the observed display fact.

Same-question relationships use owned, evidenced identity/version links, not URL,
title or concept similarity. Link correction/discovery also invalidates affected
projections. Website answers/grading retain website provenance and actual visible
interval uncertainty; they can affect assistance-aware evidence without becoming
application AI events. Repeating Q1 cannot make previously displayed solution
evidence disappear. Novel Q2 remains a separate candidate, not automatic mastery;
unobserved steps or unknown reasons still prevent unsupported conclusions.

Deletion traverses dependent classifications across attempts and concepts, rather
than only deleting rows bearing A1's attempt ID. Preserve unrelated A2 raw work,
but remove/invalidate affected current or historical derivative content as required
by the deletion scope. Do not preserve deleted help content in a reason string,
hash index, cached label or backup merely to simplify future classification.
Whether a minimal non-content invalidation/tombstone fact may remain, and its scope
and horizon, is a lead/P0-08 policy decision before implementation. Without a
permitted sufficient record, derived confidence is withdrawn/unknown, not rebuilt
from erased bytes. Remote/backup deletion retains its actual pending status.

Receipt families must retain distinct producers, subjects, versions and limits:

| Evidence | Can support | Cannot establish |
| --- | --- | --- |
| Actual adapter manifest/transport/provider evidence for C1 | Exact composite/base/ink/layers supplied on that request, to the extent evidenced | Learner saw a supplement, recognized it, or independently mastered anything; provider per-artifact receipt if none exists |
| Authenticated client report for a card, notification or played audio range | Actual reported help content/extent and presentation uncertainty | AI received the original ink, learner understood, or target import completed |
| Supported target observation or explicitly labeled human confirmation for X5 | Import of that pinned artifact/revision under the stated verification method | Target-native editable strokes, learner read every layer, L2 omitted from X5 was displayed, or an unverified live overlay passed |

For X5 without L2, earlier genuine L2 display remains part of learning history.
For an export that includes L2 but has no observed target display, learner exposure
remains unknown. A removal/export selection is neither privacy deletion of prior
presentation evidence nor proof that earlier assistance never occurred.

## Confirmed intent: independent relationships and transactional choices

Q-INK-DISPLAY, Q-NOTE-EXPORT-SCOPE and Q-HOMEWORK-DESTINATION are answered;
D-FINAL-ANSWER is confirmed. No repeated product questions are required. The
following relationships are design obligations, not user-selected database fields.

| Independent evidence | Preserve and recheck |
| --- | --- |
| Display | Both content-attached and screen-fixed modes, current rendering relationship and immutable original source/question/frame/video/coordinate context. Mode changes append display history without changing content purpose or destination. |
| Purpose | Context-backed AI assessment, uncertainty, segment/revision scope, user corrections and their basis. One writing session can contain notes, scratch and a developing final answer. No per-stroke labeling requirement. |
| Completion and prompt | Evidence-supported completion versus candidate/unknown, exact answer/attempt scope, prompt creation versus actual display, response/refusal, replay and cross-device history. Correctness, elapsed pause and leaving the screen do not establish completion. |
| Choice | Actual offered paths and capability/authorization evidence at that moment; chosen preview, defer or destination; exact course/assignment/question/source and original-answer versions. bCourses is a source, never implicit submission authority. |
| Organized output | Pinned original answer, real derivation and layout; separate derived arrangement, identifiable AI changes and confirmation of content changes. Immutable export/layer selection and actual outcome stay linked to that approved version. |

Both display modes retain source context. Screen-fixed ink stays fixed on the
declared screen coordinates, not attached to newly scrolling content. Content-
attached ink follows verified content transforms only. On a changed question,
reflow or unverified mapping, keep the original anchor and mark placement
unresolved; fixed positioning must not silently mean the ink belongs to Q2.
New writing after material changes gets a new context segment. Mode switches and
late offline updates use current-head checks; neither rewrites raw coordinates.
Test scroll, zoom, page/reflow/video changes and restart for each mode separately,
including normal finger navigation and actual composed input. No arbitrary video
object tracking or universal native-app overlay is implied.

Classify purpose from actual context at segment/revision granularity. Explicit
user correction supersedes a previous inference, without changing original bytes
or deleting scratch. A late classifier based on old context cannot overwrite that
correction. Notes enter the preferred Notability archive workflow; scratch remains
complete internally and is not automatically sent. Uncertainty permits minimal
clarification, not forced labeling before every stroke. AI automatic learning notes
can remain in-app under R17. Display mode does not decide which rule applies.

Purpose correction and export eligibility changes must invalidate queued stale
work atomically. Preparation and final external dispatch each recheck current
purpose, pinned original/version, user choice where required, authorization and
deletion/cancel fences. If the external action won the race, retain its real
shared/imported/unknown status; a later correction cannot claim to undo an external
copy or silently create a replacement. Reconcile an unknown result before retry.
Do not withhold original-note preservation until a classification or export ends.

When screen work becomes a final answer, offer timely, concise organization choices
on that screen. If completion is unknown, one short question can combine completion
and organization intent; e.g. “Finished with this answer? Would you like to organize
it?” This is an English-first example, not a mandatory string or disclosure of a
correct answer. Continuing edits/question switches invalidate pending old prompts
and positive choices authorizing obsolete answer versions. An authenticated explicit
refusal on an already displayed Q1 prompt remains Q1 refusal evidence even if O2
was written before the refusal arrived; rejecting stale positive choices must not
discard that refusal and re-prompt Q1. It does not suppress Q2. A causally later
explicit user request to reopen organization can supersede that refusal; a late old
refusal cannot overwrite such a request merely because it arrived last. Unknown
cross-device order remains restrictive/unknown until resolved, not wall-clock LWW.
Record actual display time separately
from scheduling; future device tests measure timeliness and failures, with any new
threshold explicitly an engineering choice rather than a user requirement.

Persist question-scoped refusal and prompt history across restart, device changes,
display/purpose changes and same-question retries; none automatically resets the
refusal or issues the same unknown-completion question repeatedly. Concurrent
schedulers claim one logical current prompt; clients recheck freshness before
display. Missing display acknowledgement means unknown, not permission to resend
on every device. Disconnected stale clients must suppress uncertain prompts. The
database cannot atomically control remote pixels; the future client receipt and
deduplication protocol must be tested before a no-repeat claim. A user's later
explicit request may reopen organization; unrelated new questions have their own
history. Refusal of organization is not a global refusal of teaching, reminders or
autonomous preparation, nor new permission to disclose a solution.

Choices reflect saved/authorized sources and paths actually available at use time:
Notability archive when supported, the corresponding assignment PDF/document,
preview and not-now. Preserve course/assignment/question/version mapping and reuse
already obtained bCourses material. Only a real ambiguity merits a short question;
opening a Notability document previously does not prove an editable target API.
Stale capability/permission/answer changes cannot be approved by an old menu click.
Preview or defer causes no external write. Explicit current organization choice
does not authorize filling/submitting the assignment, changing accounts or buying
access. A source update preserves the chosen historical source; it cannot silently
substitute the latest question or document.

Organization retains the learner's actual answer, intermediate reasoning, mistakes
and original layout. AI suggestions/layout/content changes are distinct and
previewable; content changes require confirmation. An old preview confirmation
cannot approve different bytes after the learner edits or the worker regenerates.
Organization/preview consent is not permission for more help. Before any AI
suggestion appears in preview, title, diagram or audio, reuse the current
attempt/request/help-policy and revocation checks. A request for layout only or
withdrawn help must not reveal an AI solution as a proposed edit; confirmation
after showing it is too late. Authorized faithful organization of the user's
original work can continue within its own scope.
Original language stays unchanged by English-first teaching preferences. Preserve
the organized artifact separately, its source-original relationship and earlier
help history. Becoming a final answer, stripping AI layers or exporting cannot
turn assisted work into independent mastery. File preparation/share/import/failure/
unknown remain separate; PDF/PNG never replaces editable originals. No external
receipt is fabricated, and neither successful export nor import repairs an A44
live-path gap.

## Coverage delta and future execution

| Addendum | Existing schedule reused | Added design coverage |
| --- | --- | --- |
| C1-V06 | V06 | Delayed exact/partial help invalidates committed and in-flight projections; opposite serial winners and unknown causality |
| C1-V12 | V12 | Revised semantic extent for a mislabeled hint; unchanged request, permission, content and raw presentation |
| C3-V13 | V13 + V17/V20 | Cross-attempt derivative deletion, A2 originals retained, absent erased history never proves unaided work |
| C1-V16 | V16 | Late historical receipt changes dependent evidence once without replay permission |
| C1-C2-V17 | V17 + V20 | Assistance assessment corrections, same-question retry exposure and novel-Q2 negative control |
| C2-V20 | V20 + V17/V18 | Mixed-entry retry consults website/AI exposure; corrected identity invalidates old projection |
| C4-V22 | V22 | AI-input receipt cannot populate learner exposure |
| C4-V25 | V25 + V17/V22 | Removed L2, earlier true exposure and import-without-observed-display stay distinct |
| I01 / INTENT-INK-MODES | V21/V22/V24 | Two display modes, mode-change races, fixed-note and attached-scratch counterexamples, source recovery |
| I02 / INTENT-NOTE-CLASSIFICATION | V12/V21/V25 | Mixed/contextual purpose, correction versus queued export, uncertainty and preserved scratch |
| I03 / INTENT-ANSWER-PROMPT | V03/V15/V16/V20 | Completion/unknown, actual display, refusal across retries/devices, stale prompt/response and timeliness evidence |
| I04 / INTENT-HOMEWORK-CHOICE | V20/V25 | Actual available choices, bCourses assignment/version reuse and ambiguity, expired menu, preview/defer |
| I05 / INTENT-FAITHFUL-EXPORT | V13/V17/V25 | Pinned original derivation/layout, visible AI changes and confirmation races, truthful import and duplicate-safe reconciliation |

No new named acceptance definition is invented: I01–I05 are local design references
to the five existing INTENT cases. Eight extensions leave the original 25 vectors
unchanged; five additional schedules prepare the newly confirmed decisions. C1–C4
are addressed at design level, not passed as running consumer transactions. Existing
learning p13–p16/p33/p37 and s16/s23–s27 remain semantic references, not duplicated
fixtures or claims that their runtime behavior changed.

After P0-08, use deterministic barriers and independent PostgreSQL connections to
exercise both commit orders for evidence versus projection, cross-attempt deletion,
purpose correction versus export dispatch, prompt claim/refusal and preview versus
original update. Restart/replay must preserve the same fences. Separately test
client actual display/played ranges, source capture and each real supported
Notability import path. Independent learning/QA semantic review checks assessment
corrections and faithful output; hashes/labels alone cannot prove them.

## Checks actually run

Only static documentation checks are appropriate to this delivery: parse the JSON,
validate reference IDs/ordinal order, require `not_executed` status, compare both
historical artifacts byte-for-byte to `014d1807`, check the eight original-vector
targets/four review groups/five exact INTENT IDs, and inspect staged paths/whitespace.
These checks do not execute any proposed schedule or prove product behavior.

```sh
python3 - <<'PY'
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('docs/verification/backend')
prior = '014d1807afcaa7b8a34ac4b6cf1c7639fc275d55'
for name in ('p0-09-transaction-vectors.json', 'p0-09-evidence.md'):
    p = root / name
    assert p.read_bytes() == subprocess.check_output(['git', 'show', f'{prior}:{p}'])
base_path = root / 'p0-09-transaction-vectors.json'
base = json.loads(base_path.read_text())['vectors']
base_ids = {v['id'] for v in base}
assert len(base) == len(base_ids) == 25
x = json.loads((root / 'p0-09-consumer-intent-vectors.json').read_text())
assert x['artifact_kind'] == 'declarative_design_addenda_not_wire'
assert x['implementation_status'] == 'design_only_pending_P0-08'
assert x['specification_sha'] == x['task_card_sha'] == '44e60ec289717e155fb0f4374784c791bf23689c'
assert x['consumer_review_sha'] == 'fd5162b9d1d3c10420e26f51b7d4b680a9d0769f'
assert x['provenance']['contains_real_user_history'] is False
assert 'contract_version' not in x
assert x['base_vectors']['commit'] == prior
assert x['base_vectors']['count'] == 25
assert x['base_vectors']['sha256'] == hashlib.sha256(base_path.read_bytes()).hexdigest()
ext, intent = x['consumer_extensions'], x['intent_vectors']
assert len(ext) == 8 and len(intent) == 5
assert {v['base_vectors'][0] for v in ext} == {'V06','V12','V13','V16','V17','V20','V22','V25'}
assert {g for v in ext for g in v['review_groups']} == {'C1','C2','C3','C4'}
assert {v['intent_case'] for v in intent} == {
    'INTENT-INK-MODES', 'INTENT-NOTE-CLASSIFICATION', 'INTENT-ANSWER-PROMPT',
    'INTENT-HOMEWORK-CHOICE', 'INTENT-FAITHFUL-EXPORT',
}
assert len({v['id'] for v in ext + intent}) == 13
for v in base + ext + intent:
    assert v['execution_status'] == 'not_executed'
    assert v['preconditions'] and v['expected'] and v['required_execution_layer']
    assert [s['ordinal'] for s in v['schedule']] == list(range(1, len(v['schedule']) + 1))
    assert all(s['actor'] and s['action'] for s in v['schedule'])
for v in ext + intent:
    assert set(v['base_vectors']) <= base_ids
    assert v['requirements'] and v['acceptance']
print('PASS: original 25 unchanged; 8 consumer extensions; 5 INTENT schedules; 0 executed')
PY
git diff --check
git diff --cached --check
```

Observed result on 2026-09-28: exit 0,
`PASS: original 25 unchanged; 8 consumer extensions; 5 INTENT schedules; 0 executed`.
Both original artifact byte comparisons passed. Whitespace inspection passed;
only this report, the addendum JSON and the seven-line link in the original design
are part of this documentation delivery. No application tests were rerun to claim
coverage for these unimplemented behaviors.

An independent local agent reviewed the new prose and all 13 addenda read-only.
Its two findings are incorporated: preserve a delayed explicit refusal across an
original-answer edit while respecting a causally newer reopening request, and
gate AI suggestions before preview display rather than after content confirmation.
This is a design review, not independent device/transaction acceptance.

## Remaining dependencies

P0-08 must settle shared versioned evidence-set invalidation, assessment authority,
cross-attempt identity/corrections, permissible deletion metadata, independent
display/purpose/destination relations, prompt/response freshness and deduplication,
preview/export bindings and backwards compatibility. These are engineering contract
dependencies, not unresolved user intent. Backend authors migrations only after
that reviewed baseline and assignment. Dedicated real PostgreSQL conditions and
client/device/provider evidence remain necessary; no new DB test ran here.

P1-06 applies completion/available-choice behavior when its screen-answer path is
enabled; P2-03/04 develops the complete ink/archive chain, and P3-02 covers Windows
separately. Backend's original P2-04 OneNote connector responsibility is retained
but undispatched here: actual authorized page creation/readback, ID/link and
unknown-result reconciliation will require separate evidence. It is not an automatic
replacement for the preferred Notability flow.

G5/G7, A26–A28/A30–A46 and all five INTENT cases remain unaccepted. No product model/API call,
real DB transaction, platform interaction, external import, account write or paid
API call occurred in this documentation work. Ordinary course proactive teaching,
authorized supervision and autonomous preparation remain in scope elsewhere;
“let me try” and organization refusal constrain their own scope and cannot become
global off switches or answer-disclosure bypasses.

## Current ADR continuation at 80b99cc

Actual read baseline: `80b99cc45d1f394f771dc0dc8f7d1c86c0e18e3d`, using `git show`
from clean `team/backend` at `c2f3f41d567c2f830a02ac03b39adf85608caa8e`.
Read the current P0-09 card, ADR 0002 §§2/5–8, the lead's
`docs/verification/lead/qa-continuation-2026-09-28.md`, and QA's
`docs/verification/qa/p0-12-w1-retest.md`. The applicable original requirements,
confirmed intent and English working sources are unchanged from the previous
actual `7fadd151` reading; a Git comparison found only task-board changes in that
source set. The original sources govern, not this summary or the English derivative.
ADR 0002 remains proposed design; no formal extension schema is delivered here.

The lead reports integrated Web MODEL defects, not device results: ORG-3 discarded
valid external effects when dispatch evidence was absent or reordered; ORG-10
missed answer-bearing layers labeled correction/layout; ORG-11 could retain a false
definite-share flag after an unknown result. P012-D1 restored withdrawn assistance
after a connected-device reconnect, including a newer unrelated snapshot; D3's
request-ID/boolean assertions missed excessive content. Those findings select
adversarial inputs. Expected results come from the current ADR and full applicable
requirements, never from reproducing the defective model or its own oracle. No
reported QA/model test is rerun or presented as a backend product pass here.

The existing JSON gains only `adr_continuation`: four linked families with sixteen
variants, all `not_executed`. Parameter choices and race orders start from fresh,
independent fixtures, so an earlier cancellation/deletion cannot make a later
variant unreachable. Schedule order is an injected barrier, not causal knowledge.
The original 25 vectors, eight C1–C4 extensions, five INTENT schedules, and audio
ten-plus-two packet remain preserved. No duplicate corpus or acceptance IDs are added.

| Family | Parents | Current ADR | Explicit added boundary |
| --- | --- | --- | --- |
| AD1 / three variants | C1-V06/V16, C1-C2-V17, C4-V22/V25, I05 | §§5/7/8 | Valid external effect without/reordered against dispatch, cancellation or failure; unknown versus definitely shared; reconciliation, omitted layers and same-question retry |
| AD2 / four variants | C1-V12, C3-V13, C4-V25, I02/I04/I05 | §§6–8 | Every included AI layer at external dispatch; changed policy with unchanged bytes; hidden preview content; new-manifest confirmation; effect/cancel orders and permitted archival controls |
| AD3 / five variants | C1-V06/V16, I03 | §§5/6/8 | Connected presenter A, unsynced intent-capable B, pending connected-origin restrictions, stale/equal/newer unrelated snapshots, unknown physical order and genuine causal reopening |
| AD4 / four variants | C1-V12, C3-V13, C1-V16, C4-V25, I05 | §§2/5–8 | Legacy AI writes and GET/PUT response disclosure; cached/history shortcuts; association/edit orders; original-edit/export orders including claim-before-edit-before-effect |

### Effect evidence is not reading or permission

AD1 requires an authenticated, appropriately authorized factual producer and exact
owner/problem/attempt/manifest/layer/target binding. Missing dispatch logs or local
cancel/failure labels cannot invalidate independently valid external evidence.
Accepting a fact does not invent a dispatch event or retroactively authorize it.
Conflicting state/order is retained for reconciliation. Invalid evidence grants
nothing; rejecting it does not erase another independently uncertain dispatch.

The old C4-V25 wording about import without learner exposure means **no proven
presentation or reading**. Current §7 additionally requires possible external
exposure when help was shared/imported or dispatch may have taken effect. That
fact invalidates no-help assumptions even for a same-question retry with no in-app
receipts. Import does not prove reading. An unknown handoff does not prove definite
sharing/import, and resolved no-effect evidence supersedes only that attempt's
uncertainty. X1 cannot deliver its omitted L2; genuine earlier L2 display remains.
Preparation/share-panel opening alone and sufficiently evidenced cancellation
before any external effect remain negative controls. A local cancellation state
without that evidence is not the same control.

The earlier open tombstone paragraph is historical. Current ADR §5 allows minimal
non-content fences and requires proof that all accepted stale replay/restore paths
are fenced before removing them; TTL alone is insufficient. It forbids keeping
deleted text, revealing reasons, answer hashes or embeddings to reconstruct erased
content. Late receipt handling cannot resurrect deleted payload. Remaining evidence
may support only unknown, and actual remote/backup cleanup stays pending until
verified. Wire representation and enforcement remain P0-08 dependencies; the policy
is no longer an unresolved user decision.

### Dispatch and legacy note responses are disclosure boundaries

AD2 checks every included AI layer against current semantic assessment, assistance
permission and bounded target at external dispatch, even after a valid preview.
An innocuous label does not exempt answer-bearing corrections, layout changes,
titles, formulas, images or included speech. For answer organization, an AI layer
absent from the permitted preview cannot remain in the export; filtering/regeneration
creates a new manifest and requires its applicable confirmation. Existing classroom archival grants keep
their scope without mandatory per-stroke confirmation. They cannot override a
restricted problem's help policy or rewrite editable originals.

The actual baseline call flow reinforces AD4: `services/api/app.py:102–109`
rechecks authentication under the transaction; `services/api/domain.py:321–386`
returns note content on fresh PUT and both cache/history shortcuts; GET at
`:388–398` returns the selected revision. These paths lack the proposed v2
association/disclosure adapter. PUT therefore needs content-disclosure checks too;
guarding only GET or `actor == assistant` misses user-role requests carrying AI
blocks and original edits whose response contains restricted AI. The existing actor
transaction boundary in `services/api/storage.py:183–205` can be reused; no network
call belongs inside that database transaction.

Until a guarded adapter exists, linked legacy AI writes fail explicitly. Legitimate
original edits preserve CAS/history/ink and invalidate affected v2 work atomically,
or fail without partial mutation. Restricted reads require explicit use-v2 behavior
plus appropriately authorized safe original access. Never truncate stored revisions
to manufacture redaction. Current associations and permissions precede cache and
historical replay, which cannot move the head or reopen permission. Unassociated
v1 behavior remains a separate positive control.

AD4 distinguishes the external effect from its database claim. Edit-first invalidates
the old preview/confirmation and fences stale dispatch. Effect-first retains the
exact historical manifest/outcome and possible exposure. Claim-first then edit then
physical effect is a separate race: fence what can still be prevented, record any
actual/partial/unknown effect honestly, and reconcile before duplicate-risk retry.
An old confirmation never authorizes changed bytes; a newly chosen historical
version still requires current authority and applicable confirmation.

### Intent order and unresolved engineering assumptions

AD3 does not assume that a connected presenter knows an offline device's new intent.
It retains the server-known revision and same-problem synchronization knowledge;
known unsynced intent-capable devices block proactive disclosure escalation. Pending
restrictions recorded while connected survive stale, equal and newer unrelated
snapshots. An acknowledgement synchronizes that restriction; it does not reopen
help. Unknown retraction-to-output order remains unknown and outside compliant
zero-disclosure counts, even when a harness happened to invoke the retraction first.
Actual partial output remains evidence, with remaining output stopped when possible.

Positive controls require genuine causal acceptance: once D is known, a later
explicit accepted request U may permit exactly its bounded content, with no unresolved
conflicting intent. Old D replay cannot permanently suppress U. Conversely, delayed U
cannot reopen after a causally later D2. Concept-only and explicitly requested full
solution controls independently assert content extent; booleans/request IDs alone
are inadequate. These rules do not make organization refusal a global teaching ban.

P0-08 still needs concrete mechanisms for intent-capable device membership, durable
pending intent, synchronization completeness and authenticated causal acceptance;
claim invalidation at the client/dispatcher boundary; trusted AI-layer/association
identification; and safe legacy response shapes when an allowed original edit would
otherwise return restricted AI. It must also define fresh historical-version export
confirmation and restart/reconciliation across the database-to-external-effect gap.
These are engineering assumptions, not new user product questions or new v0.1.0
fields. Real PostgreSQL, two-client and supported target/provider evidence remains
necessary after the formal contract and implementation exist.

### Static preservation and reference checks

Only the following documentation checks apply to this continuation. The earlier
check block/result remains the historical consumer delivery, not a new runtime run.

```sh
python3 - <<'PY'
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('docs/verification/backend')
prior = 'c2f3f41d567c2f830a02ac03b39adf85608caa8e'
read_sha = '80b99cc45d1f394f771dc0dc8f7d1c86c0e18e3d'
packet_path = root / 'p0-09-consumer-intent-vectors.json'
old_bytes = subprocess.check_output(['git', 'show', f'{prior}:{packet_path}'])
packet = json.loads(packet_path.read_bytes())
addition = packet.pop('adr_continuation')
assert packet == json.loads(old_bytes)
assert addition['read_sha'] == read_sha
assert addition['preserved_packet_sha'] == prior
assert addition['execution_status'] == 'not_executed'
for name in ('p0-09-transaction-vectors.json', 'p0-09-evidence.md'):
    p = root / name
    assert p.read_bytes() == subprocess.check_output([
        'git', 'show', f'014d1807afcaa7b8a34ac4b6cf1c7639fc275d55:{p}'])
for name in ('p0-09-audio-screen-design.md', 'p0-09-audio-screen-vectors.json'):
    p = root / name
    assert p.read_bytes() == subprocess.check_output(['git', 'show', f'{prior}:{p}'])
base_bytes = (root / 'p0-09-transaction-vectors.json').read_bytes()
assert hashlib.sha256(base_bytes).hexdigest() == packet['base_vectors']['sha256']
base = json.loads(base_bytes)['vectors']
parents = packet['consumer_extensions'] + packet['intent_vectors']
assert (len(base), len(packet['consumer_extensions']), len(packet['intent_vectors'])) == (25, 8, 5)
assert all(v['execution_status'] == 'not_executed' for v in base + parents)
base_ids, parent_ids = {v['id'] for v in base}, {v['id'] for v in parents}
adr = subprocess.check_output(['git', 'show', f"{read_sha}:{addition['adr_path']}"]).decode()
sources = [subprocess.check_output(['git', 'show', f'{read_sha}:{p}']).decode()
           for p in addition['source_paths']]
families = addition['schedule_families']
assert {f['id'] for f in families} == {'AD1', 'AD2', 'AD3', 'AD4'}
variants = [v for f in families for v in f['variants']]
assert len(variants) == len({v['id'] for v in variants}) == 16
for f in families:
    assert f['execution_status'] == 'not_executed'
    assert set(f['base_vectors']) <= base_ids and set(f['parent_addenda']) <= parent_ids
    assert f['preconditions'] and f['expected'] and f['required_execution_layer']
    assert all(f'## {s}.' in adr for s in f['adr_sections'])
    assert all(any(q in source for source in sources) for q in f['qa_findings'])
    for v in f['variants']:
        assert v['id'].startswith(f['id'] + '-') and v['execution_status'] == 'not_executed'
        assert v['expected'] and v['schedule']
        assert [s['ordinal'] for s in v['schedule']] == list(range(1, len(v['schedule']) + 1))
        assert all(s['actor'] and s['action'] for s in v['schedule'])
print('PASS: preserved 25 + 8 + 5 and audio 10 + 2; 4 families / 16 variants; references valid; 0 executed')
PY
git diff --check
git diff --cached --check
```

Two read-only local reviews informed the T3 and linked-v1/export boundaries. They
executed no proposed schedule, DB test, provider action or device interaction.
This delivery changes only this existing report and its existing JSON addendum.
Final review clarified exact historical replay versus a stale-CAS mutation, made
the U/output/late-D interleaving explicit, kept B-origin restriction checks separate
from A's presenter authority, and limited mandatory preview matching to answer
organization while retaining every export's current disclosure checks.

Observed on 2026-09-28: the static Python block exited 0 with
`PASS: preserved 25 + 8 + 5 and audio 10 + 2; 4 families / 16 variants; references valid; 0 executed`.
The prior consumer packet compared equal after removing the single added root key;
both original artifacts and both audio files compared byte-for-byte equal to their
recorded baselines. `git diff --check` passed. No application/runtime, PostgreSQL,
provider, import or device validation ran; all new schedules remain `not_executed`.
