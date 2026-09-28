# Requirements v1.1 adoption

Date: 2026-09-28 UTC. Owner: lead, sole main integrator.

Current clarification: R51/R52 cover multiple answer-entry surfaces; R59 explicitly
details the existing R03/R08/R46–R48 original-screen note/archive goal, and A42–A46
extend acceptance without changing A01–A41. See the latest revision section below.
Earlier notification/reading receipts in this record apply only to their exact
earlier commits, not this clarification. The prior run's native Chats denial is
preserved below. In the new authorized synchronization turn, native discovery
and all five sends succeeded; final-SHA reading is tracked separately in the
latest synchronization section.

## Authorization and source

The user explicitly instructed this chat to integrate the approved problem-solving
supplement, commit and push it, notify all five configured roles, and continue P0.
This is an incremental product-specification adoption, not a new account,
procurement, deployment or paid-API authorization. Public repository visibility
remains the user's intentional choice.

Source: `AI学习伙伴-做题陪伴需求审查与补充.md`, read from the user-specified local file.
Actual SHA-256 matched the supplied value:
`f675e6ab00359b91263f21c896a4acd09177a1cae39a4357cc431ab0ceb705c1`.
Integration started from clean main
`9e1163b97972bf1a3ce492d271f269691db67c65`.

## Adopted changes

- [Main requirements](../../requirements.md) are v1.1. R01–R50, A01–A29 and G1–G6
  definitions remain verbatim; R51–R58, A30–A41 and G7 are added. Sections
  1/2/3/6/7/8/9/10/11/12 contain extensions or normative cross-references.
- [Problem-solving companion](../../requirements/problem-solving-companion.md)
  is normative, covering observed process and gaps, independent exploration,
  evidence-based diagnosis, lightweight practice, persistent English-first
  preferences, data relationships and all-channel disclosure controls.
- P1 retains the course-viewing/selection/notes/memory loop and adds one real
  problem's attempt → requested help → review → save → next-day recovery on an
  explicitly supported iPad path. G7 separately measures external visual and
  own-canvas structured paths; neither all external apps nor an inaccessible
  Notability undo stack is required or claimed. Mac/device limits remain explicit.
- [Task board](../../tasks.md), [traceability](../../requirements-traceability.md)
  and [capability matrix](../p0-matrix.md) add P0-08–13 and unimplemented/unaccepted
  R/A/G coverage. Existing work stays assigned and takes priority. Data fields,
  sample counts, numerical targets and phase details remain engineering defaults.
- AGENTS, TEAM, CLAUDE, README and all six role files direct future work to both
  specifications. Input routing remains separate from teaching state. Dirty
  worktrees can read an exact commit with `git show SHA:path`; normal baseline
  merges preserve work, with no reset or blanket fast-forward prerequisite.
- Code contract v0.1.0, dependency locks, runtime models/effort, role ownership,
  migration ownership and ordinary approvals remain unchanged. No new application
  implementation is part of this documentation commit.

## Validation actually performed

- Source hash verified with `sha256sum` and the documentation validation script.
- Unique ordered main definitions: 58 requirements, 41 acceptance cases, 7 gates.
  New R/A clauses match the approved source; original R/A/G definitions and the
  entire original platform-reference section remain unchanged.
- Original 50 traceability rows preserved; all eight new requirements map to
  acceptance, gates, owners, stages and unimplemented/unaccepted status. P0-08–13
  have unique task rows/cards and explicit dependencies and write boundaries.
- Relative Markdown links and explicit anchors checked; all nine agent/team/role
  reading entries include the normative companion. P1/P2/P3 coordination reviewed.
- Two bounded internal reviews independently checked source coverage and document
  consistency; neither review substitutes for future product/semantic acceptance.
- `git diff --check` passed. Diff scope is Markdown only; shared code/contracts,
  dependencies and `docs/team-directory.json` have no changes. Full application
  tests were not repeated for this documentation-only integration.

## Initial v1.1 commit, push and notification evidence

Formal specification commit: `57aee9cfc86dfa0dcde674d118034063163ddb13`.
The lead fetched `origin/main` first; the divergence check was `0 0`, then committed
only the 16 reviewed Markdown files. `git diff --cached --check` passed. The actual
`git push origin main` succeeded, advancing the public remote from `9e1163b` to
`57aee9c`; no force push or visibility change occurred. The post-push worktree was
clean. This exact SHA is the specification baseline supplied to all five roles.

The run-bound native Chats helper listed the existing granted routes. One
`async_route_v1` message was sent to each role after that successful push, carrying
the exact SHA, required reading paths, relevant R/A/G scope, current-task priority,
new bounded task/dependencies and request for a single reading report. All five
returned actual `accepted=true` receipts, `state=unread`, `execution_started=false`.
These initial receipts prove delivery acceptance only. Subsequent actual reading
reports from Backend, Learning and iOS are recorded below; Web and QA remain unconfirmed.

| Role | Follow-up card | Current work preserved | Accepted notification message ID | Reading receipt |
| --- | --- | --- | --- | --- |
| Backend | P0-09 | P0-04 delivery review/fixes first | `handoff_998426c58164478e5b860f435f18b241` | `handoff_066cd98956ebf237782a074bc10ccfbe`: read `57aee9cfc86dfa0dcde674d118034063163ddb13` |
| Learning | P0-10 | P0-05 timestamp correction first | `handoff_df0e64b91bf448b557d26322ce79f803` | `handoff_21e84c09a73d8f4a1fdacf2869a610be`: read `57aee9cfc86dfa0dcde674d118034063163ddb13` |
| iOS | P0-11 | P0-03 capability work first | `handoff_fdcb3185a480fafa66c13c8fc635aab2` | `handoff_1c1955cc1ad3cbe7707a27996dfc4a91`: read `57aee9cfc86dfa0dcde674d118034063163ddb13` |
| Web | P0-12 | P0-02 probe first | `handoff_821085eecb323fa26b464f83a5bfb8ce` | Not received |
| QA | P0-13 | P0-06A first | `handoff_2365ba172611861cda657343d683bc7f` | Not received |

A native accepted receipt establishes delivery only. Each role was asked for
one concise reply naming the read specification SHA, relevant clauses and next
step at a safe boundary. Those actual replies will be appended when received;
there is no repeated acknowledgement loop or requirement to wait for all new
application features before reporting specification integration.

## Existing P0 work observed during adoption

Backend delivery `803916ff5d1663cb970636b22bb897d89d083da0` arrived in actual message
`handoff_4b18adcb7385ceab4af0acb09b0e3033`. Its reported 195 checks and missing
PostgreSQL test DSN are worker evidence, not main integration or real-DB acceptance.
The lead recorded receipt without merging application code into this documentation
change. Learning's timestamp correction was subsequently delivered as
`ccfcb2c0ad429ab6568727db7addf5f5a0ab14ee` in actual message
`handoff_adad54ebf942d2e847d92994b2027653`. Its 99-check result is worker-reported;
the new commit still awaits lead review and integrated verification.

## Actual reading reports and bounded task-card correction

Backend's actual reading report confirms the exact specification SHA, required
paths, R51/52/53/57/58, A30/31/34/38/40 and G7. It retains P0-04 review priority
and the missing real-PostgreSQL DSN, and reports moving to P0-09 documents and
synthetic transaction vectors without new endpoints, migrations or v0.1.0 changes.

Learning's actual reading report confirms the same SHA, its required paths,
R51–58/A30–40/G7, and the delivered P0-05 correction. Its next step is independent
P0-10 process cases, fixed labels, policy and offline rule checks; mathematical
and semantic acceptance remains with independent QA, and G6 remains incomplete.
Neither report certifies implementation or acceptance of the new capabilities.

iOS subsequently confirmed the same exact SHA through read-only `git show`, its
required entry paths and R51/52/53/56/57/58, A30–34/A36/A40–41 and G7. It is still
preparing the original P0-03 capability delivery; P0-11 follows at that boundary.
The reported research and old-baseline contract tests are not native compilation
or device acceptance. The lead did not acknowledge this acknowledgement or resend
its existing assignment.

The user's subsequent read-only review identified a concrete task-card omission:
traceability already assigned R54/R55/A37 backend evidence to P0-09, but its Goal
and persistence paragraph did not explicitly name that coverage. This ordinary
follow-up corrects P0-09 to include those IDs and durable facts about actually
displayed/played AssistanceEvents, the request scope, permitted disclosure and
actual assistance extent. It adds design vectors distinguishing self-correction,
hint-assisted work, following a solution, and generated/withheld/unknown help.
No new protocol or migration is implemented. Diff review and `git diff --check`
passed; no application tests were repeated for this documentation correction.

Correction commit `e8b02c5be9c343c35698dc7d67bb58cfbb5cb3e6` was committed normally
and successfully pushed to `origin/main` after fetch/divergence check `0 0`.
The lead notified only Backend through its granted native async route, replying
to the actual reading report. Accepted correction receipt:
`handoff_3fe74a41ce04f4545a1c1de7ec88eece` (`accepted=true`, `state=unread`,
`execution_started=false`). The message supplies that exact task-card SHA,
explicit R54/R55/A37 and persistence facts, unchanged P0-08/v0.1.0 boundaries,
and asks for coverage in the next normal design delivery rather than another
pure acknowledgement. Correction delivery acceptance is not yet evidence of
reading or implementation. The other four assignments were not redispatched.

## Consolidated original-screen and multi-entry clarification

The user clarified the existing intent during this same integration task. This
revision starts from clean main `be3f7c4f7724cb84ef38a40501aa81ca24ce36e7` and uses
an ordinary additive commit; no amend, reset or force push is used.

R59 is **not a newly invented wish**: R03/R08/R46–R48 already describe staying on
the original learning page, handwriting, preserving originals and external notes.
The clarified complete flow is original classroom screen → this product's live
pen → editable original ink plus source/frame/video context → separate necessary
AI additions → official Notability sharing/import with actual outcome evidence.
The user is not asking to move into a standalone canvas to satisfy the original
screen requirement. R46–R48 remain verbatim and receive explicit cross-references.

This revision also preserves the clarified range of problem inputs: option
selection/deselection/reselection, text/formula edits, website handwriting,
external notes, product annotation, owned canvases, captured-frame drafts and
mixed entries within a problem. Website answers/grading, user input and AI help
have distinct provenance. Correct choices with unknown reasons are not proof of
independent mastery, and observing answers does not authorize AI filling/submission.

The normative entry/evidence/limitation/fallback matrix distinguishes authorized,
site-tested DOM observations from canvas/editor/iframe/shadow DOM limits. Live
product overlays are separately evaluated on supported webpages, Windows desktop
(P3), and native iPad/iPhone apps. Screen sharing does not prove global interactive
overlay capability or that AI receives the visible annotation. Own/frozen/side
canvases remain explicit fallbacks; they cannot pass R59/A44. The specification
retains unverified/unsupported targets while permitting other supported work.

Acceptance additions, all unimplemented/unaccepted:

| Case | Required distinction |
| --- | --- |
| A42 | Website choices and typed/formula changes; attribution, missing evidence, no invented reasons or independent mastery |
| A43 | Same-problem mixed-entry timeline, retries versus new problems, branches and gaps |
| A44 | Live original-page operability, product ink actually visible to AI, scroll/zoom/anchors and sharing stop; each platform separately |
| A45 | Honest frozen/owned/side draft fallback, stale-source indication and one-step return; never proof of A44 |
| A46 | Existing original classroom-note-to-Notability chain, linked A26–A28, editable originals/context/AI layers and actual import state |

Notability still follows the original official sharing/import boundary. Opening a
share sheet is not completed import; PDF/PNG is not native editable Notability
ink; the app retains editable original strokes. An export success cannot certify
an unimplemented original-screen annotation path.

Main sections, normative companion, G7, traceability, README, agent/role reading
entries and existing P0-08–13 cards are updated together. No duplicate task IDs are
created. The P0-09 R54/R55/A37 assistance-evidence correction remains intact. Current
P0 work, owners, models/effort, API budget, approvals and v0.1.0 code remain intact.
Contract evolution remains a future lead-owned task; implementation and real-device
acceptance are not claimed by this document change.

### Prior-run final clarification transport status (historical)

The run-bound provider was called with `helper=chats`, `arguments=[list]` and
`arguments=[inbox]`. Both returned `isError=true` with the exact error:

```text
agentsdock-chats: server rejected request (403): provider action was not authorized
```

This is a provider authorization denial, not an empty inbox, accepted notification,
auto-review Git denial or proof that previous grants apply to this run. No `send`
was attempted using old route IDs, and no alternate helper/CLI or channel was used
to bypass it. Final-clarification notifications and current-SHA reading reports
remain outstanding for all five roles. The user need not restate the requirement;
the remaining dependency is a run in which the native Chats action is granted.

Prepared follow-ups (not sent) extend existing assignments at a safe boundary,
require reading the final committed SHA via `git show SHA:path` if needed, preserve
uncommitted work and normal merges, and ask for at most one useful scope/read report:

| Role / existing task | Final clarification to convey | Current revision notice / read |
| --- | --- | --- |
| Backend / P0-09 | R51/R52/R54/R55/R58/R59, A37/A42–46: input/website-feedback/AI-help provenance, shared attempt/entry identity, ink/source/AI layers and actual import states; retain actual AssistanceEvent evidence | Not sent / unconfirmed |
| Learning / P0-10 | R51–59, A30–46: mixed-input cases, correct-option/unknown-reason distinction, actual help versus mastery, original-screen evidence and independent AI layer; no fallback-as-R59 claims | Not sent / unconfirmed |
| iOS / P0-11 | R03/R08/R46–48/R59, A41–46 plus A26–28: original live screen is the requirement, iPad/iPhone overlay capability must be proved, AI must see ink, A45 fallback never A44, A46 real Notability flow | Not sent / unconfirmed |
| Web / P0-12 | R51/R52/R59, A42–46: site-tested DOM and complex-editor limits, supported webpage live product pen and composed capture, normal touch/anchors, P3 Windows layer separately, preserve note/archive chain | Not sent / unconfirmed |
| QA / P0-13 | R51–59, A30–46 with A26–28: retain prior cases, independently check surfaces/attribution, original versus fallback, composed AI input, actual Notability import and platform-specific gaps | Not sent / unconfirmed |

### Clarification validation

The lead's targeted comparison against `be3f7c4` passed: 59 unique, ordered
requirements, 46 acceptance cases and seven gates; R01–R50/R53–R58 and A01–A41
remain verbatim, while R51/R52 retain their original text and add the clarified
entries. G1–G6 and the original platform section remain unchanged. The original
50 traceability rows and P0-01–07 states are preserved; P0-08–13 are extended
without duplicate cards, including the P0-09 assistance-evidence correction.

All nine team/agent/role reading entries reference the normative companion and
the updated acceptance scope. Checks of 32 relative links and explicit anchors
passed. Two local reviewers checked the final scope independently; their minor
stale-range/task-wording findings were corrected and the final review reported
no substantive integration gap. `git diff --check` passed. The diff contains
only 16 Markdown files: protocol code, application code, dependencies and the
team directory (including models/effort) are unchanged. Application tests were
not repeated for this documentation-only revision. These checks establish
document consistency, not platform feasibility or product acceptance.

### Final clarification commit and push

Formal specification baseline:
`a2567fa63cdc9c73e9902af57eabf5032a15e5a7`.

The pre-commit fetch reported divergence `0 0`. The normal commit contains the
16 reviewed Markdown files; the staged whitespace check also passed. Actual
`git push origin main` succeeded with `be3f7c4..a2567fa main -> main`, and
`git ls-remote origin refs/heads/main` returned the exact SHA above. There was
no force push or visibility change. This following evidence update records that
observed push and pins task/traceability references to the committed baseline.

At that prior-run snapshot, all five final-clarification notifications and reading
reports remained outstanding because of the provider denial above. Earlier `57aee9c` reads are
historical evidence only; neither they nor server mailbox notifications establish
reading of this revision. The prepared follow-ups must use an actually granted
native route in a later run, reference the final committed baseline, preserve
existing work and extend the current cards without duplicate assignments.

## Authorized synchronization after the denied run

Observed on 2026-09-28 UTC, after the user's new synchronization request. The
configuration operator attributes the earlier denial to a queued-prompt update
that omitted chat references and cleared that turn's route snapshot. This is the
operator's reported cause, not a server mutation or independent server audit by
the lead. The exact earlier 403 remains above; it was never treated as a success.

### Actual restored entry and committed baseline

The lead called only the run-bound native provider with `helper=chats`:

- `list`: `isError=false`; exactly the configured backend, learning, ios, web and
  qa routes were available, all advertising `async_route_v1`.
- `inbox`: `isError=false`; three pending senders and four messages were reported.
  Their ordered batches were read with a new stable request key per sender;
  each returned `has_more=false`, with no unavailable messages.
- No provider token, queued turn, runtime settings or other messaging channel was
  changed. Only the five granted existing routes were used for subsequent sends.

`git fetch origin main` succeeded. Local HEAD and `origin/main` both resolved to
`e43293760c70364584cb597ae01d34a261cc52cf`, with divergence `0 0`; that exact SHA
was reused as the final reading baseline. It contains normative specification
commit `a2567fa63cdc9c73e9902af57eabf5032a15e5a7` plus the committed integration
record. Nothing was amended, reset or reimplemented to repeat the prior push.
A local independent read-only review confirmed R59's original-goal meaning,
A42–A46/G7/role/task consistency and unique R01–59/A01–46 numbering.

### Five actual final-clarification notices

Every notice supplies the exact `e43293760c70364584cb597ae01d34a261cc52cf`
reading baseline and paths, explains R59 as R03/R08/R46–48's explicit refinement,
and retains the full original-screen → editable ink/source → separate AI layer
→ actual Notability import chain. It covers website choices/inputs and mixed
entries, separates A44 original-screen annotation from A45 fallback, and preserves
platform-specific uncertainty. The notices extend existing cards at safe handoffs,
preserve worktrees, ownership/model/effort/approvals and v0.1.0, allow read-only
`git show`, and ask for one useful SHA/clauses/next-step reply through the actual
returned reply route. They do not restart tasks or request acknowledgement loops.

Each send returned `accepted=true`, `duplicate=false`, `state=unread`,
`execution_started=false` and `mode=async_route_v1`. Those fields establish
mailbox acceptance only, not reading, execution, completion or product acceptance.

| Role / existing task | Actual message ID | Relevant incremental follow-up | Final-SHA read |
| --- | --- | --- | --- |
| Backend / P0-09 | `handoff_df8028a9138d788169ad2af6784ba023` | R51/R52/R54/R55/R58/R59, A37/A42–46; retain actual help/request/permission facts, multi-entry provenance, ink/source/AI layers and actual import evidence; P0-04 review first | Read `e432937` reported in `handoff_cafe35d65a3128bdc20ae0f1cfa06baf` |
| Learning / P0-10 | `handoff_b515b843850d75b768efc4966cf8b0b5` | R51–59/A30–46; extend existing cases without replacing originals, distinguish website feedback/unknown reasons/help/mastery and original versus fallback; P0-05 review first | Read `e432937` reported in `handoff_e2186b27c43fd1f0d49004f82d257d9c` |
| iOS / P0-11 | `handoff_9f59dd826052c516b27a5c3d0db869d3` | R03/R08/R46–48/R59, A40–46/A26–28; measured native/web overlays, composed AI input, anchors/stop and actual import, explicit device/build gaps; P0-03 first | Read `e432937` reported in `handoff_15286c8b27c113e73cc0a50023199948` |
| Web / P0-12 | `handoff_eeedc2ed162e2368a0738b7b83717453` | R51/R52/R53/R56/R57/R58/R59, A30–34/A39–46; site-tested input/overlay/composed-capture plan, no DOM-as-pixels claim, Windows P3 separately; P0-02 review first | Read `e432937` reported in `handoff_71ca5fb11ad0f741e0015e04aff46151` |
| QA / P0-13 | `handoff_bb481c38974692cd6f05d28859b2153e` | R51–59/A30–46/A26–28/G7; independent matrix and review of existing 37 P0-10 cases, including p37's intentional semantic leak, preserving author labels/disagreements; P0-06A first | Read `e432937` reported in `handoff_2bd6f19a89e2684543240f65bb05d4fb` |

Backend, Learning and Web notices use `--reply-to` for their actual latest delivery
messages listed below. iOS and QA notices use the freshly granted route directly.
No send was made to another recipient. No final-SHA reading had been confirmed
when these sends were first recorded; the table above now includes subsequent
actual reports. Historical reads and accepted delivery receipts are not
substitutes. Later actual reading reports may be appended without another notice.

### Existing P0 mail received during synchronization

These messages are actual peer reports, not independent verification of their code.
They continue original assignments and are not counted as final-clarification reads.

| Sender / message | Observed report | Lead state |
| --- | --- | --- |
| Web / `handoff_e40b9caa03a5050bfecc6d97d3b376cf` | Read `57aee9cfc86dfa0dcde674d118034063163ddb13` using `git show`, preserving dirty worktree | Historical read recorded; no final-SHA read inferred |
| Web / `handoff_f4603f3bbe4166dd9cad7592c7fcfb81` | P0-02 commit `127bd4cb4cb505edf791c5f386bda905dcf1369b`; reported 44 unit, 42 synthetic browser and 37 trusted-input checks passed; two touch checks unverified | Delivery received, not integrated/retested on main; no iPad/Pencil acceptance |
| Backend / `handoff_9caaea34e861c8be7ba9a852ed0cedf0` | P0-09 commit `43a0e811f38b1309494c85be4a15936fa9188d24`; read old `57aee9c` plus `e8b02c5`, 17 explicitly unexecuted transaction vectors, AssistanceEvent facts covered | Prior-scope design received, review and final-entry update outstanding; real PostgreSQL still lacks DSN |
| Learning / `handoff_27588441003c63db6a1defc1b295c180` | P0-10 commit `aa598bc20e5b4f4d726ca537b2b0a9a3449b1fef`; 37 synthetic cases, reported 37/37 structural consistency and 121 branch tests; semantic review not run | Prior-scope delivery received, not integrated; original P0-05 fixtures preserved, QA review requested within existing P0-13 |

The lead did not resend the original tasks, take over delegated implementation,
or mark any application gate passed. The next integration work remains review of
the delivered P0 modules and incremental design, with real device/database gaps
kept separate from this completed notification transport step.

### Synchronization validation and remaining reads

A single subsequent inbox check before recording returned `senders=[]` and
`has_more=false` without error. No final-SHA reading reply was available at that
point. The lead did not wait or repeatedly poll and did not send acknowledgements
of its own delivery receipts. Actual replies can be read on arrival and appended.

Targeted checks passed: the five recorded notice IDs match the five actual
accepted receipts, all 13 P0 task IDs remain unique, existing task-card bodies are
unchanged, and the requirement/acceptance traceability rows remain intact.
The main specification, normative companion, role guidance, code, dependencies
and team directory are unchanged from the dispatched baseline. This turn changes
only the task board, traceability dispatch evidence and this adoption record.
`git diff --check` passed; no application test suite was repeated for this
evidence-only change. The preserved prior 403 and new successful operations are
distinct observations, and no product acceptance is inferred from recovery.

## Actual final-baseline reading: Backend

Native inbox/read on 2026-09-28 UTC returned one Backend message with
`has_more=false` and no unavailable messages. Actual received message:
`handoff_cafe35d65a3128bdc20ae0f1cfa06baf`, created at `08:04:14Z`, replying to
the final notice `handoff_df8028a9138d788169ad2af6784ba023`.

Backend explicitly reports reading
`e43293760c70364584cb597ae01d34a261cc52cf` (normative content
`a2567fa63cdc9c73e9902af57eabf5032a15e5a7`), including AGENTS/TEAM, its role,
P0-09 and the relevant requirements. Its same-task follow-up commit is
`014d1807afcaa7b8a34ac4b6cf1c7639fc275d55`, parent `43a0e81`, reported clean
worktree and only the same three Backend design documents changed.

The report covers R51/R52/R54/R55/R58/R59 and R46–48, A37/A42–46 with A26–28:
website selections/edits/ink and mixed entries, provenance, live-ink anchors and
actual AI-input evidence, share-stop generations, independent AI layers and real
Notability import states. It explicitly separates A45 fallback from A44 and
sharing from import. The worker reports 25 declarative vectors (17 preserved plus
eight additions) and successful static JSON/coverage/whitespace checks, not 25
executed transaction tests. No runtime code, contract or migration was changed.

At the time of this Backend report, only its final-baseline read was confirmed
and the design delivery was unintegrated. The later section below records the
other four actual reads and subsequent integration; and G5/G7/A44/A46 remain unaccepted. Next dependencies are
P0-08's versioned contract and platform/web evidence; the missing dedicated
`LC_TEST_DATABASE_URL` still blocks real PostgreSQL verification. No repeated
assignment, acknowledgement or waiting was needed to process this message.

A bounded independent read-only check confirmed the exact parent and three-file
scope, 25 unique vectors, V01–V17 object-for-object unchanged from the parent,
and `not_executed` on every vector. V18–V25 cover A42–A46's attribution,
multi-entry, live anchors, actual AI input, share stop, fallback separation,
independent AI layers and actual import. No serious omission was found within
this delta review; it is not a review or integration of all P0-04 code. The
delivery diff and this evidence update passed whitespace checks. No application
test suite was repeated and no capability status was promoted.

## Subsequent final-baseline reads and P0 continuation

Native inbox/read in the P0 resumption turn returned these actual reports, each
read in an ordered sender batch with a stable request key; every batch ended with
`has_more=false` and no unavailable messages. These are observed peer statements
about reading, not inferences from accepted delivery receipts.

| Role / actual received message | Exact reading baseline and relevant scope | Reported next step / delivery |
| --- | --- | --- |
| Learning / `handoff_e2186b27c43fd1f0d49004f82d257d9c` | `e43293760c70364584cb597ae01d34a261cc52cf`, normative content `a2567fa`; R51–59/A30–46, multi-entry evidence, website feedback versus user reasoning, live-screen versus fallback and actual import | P0-10 `fb445edda3f96d561c27029075008922d2033eb9`: 28 added cases plus 37 preserved; rule checks are not independent semantic/device acceptance |
| iOS / `handoff_15286c8b27c113e73cc0a50023199948` | Same `e432937` SHA; R03/R08/R46–48/R59, A42–46 and native/website path separation | Preserved dirty P0-03 research work; commit and native/device verification remain outstanding, then existing P0-11 |
| Web / `handoff_71ca5fb11ad0f741e0015e04aff46151` | Same `e432937` SHA; R51/R52/R59/A42–46, original course screen, editable original/source, separate AI and actual import | Original P0-02 first; P0-12 plan retains DOM/pixel distinction and P0-08/P0-11 dependencies |
| QA / `handoff_2bd6f19a89e2684543240f65bb05d4fb` | Same `e432937` SHA; R51–59/A30–46/G7, A44 versus A45 and A46 import evidence | Delivered original P0-06A separately; existing P0-13 independent matrix/semantic review remains pending |

Together with Backend's `handoff_cafe35d65a3128bdc20ae0f1cfa06baf`, all five
final-baseline reading reports are now actually received. Earlier `57aee9c` reads
have not been substituted. No repeat specification dispatch or acknowledgement
loop was needed. Original requirements and the normative supplement are unchanged
in this continuation; the earlier 403 record remains intact.

The configuration operator reported a prior monthly-spend/session-limit failure
for the three Claude roles. Subsequent reads and QA's actual commit establish
those particular deliveries, not guaranteed continuous provider recovery or a
promised 03:50 reset. Native route availability and model-provider availability
are separate. No runtime token, model/effort, approval, account or visibility was
changed. P0 local reviews and integration continued with the configured Astra roles.

Backend P0-09's 25 declarative vectors are now integrated with the reviewed P0-04
branch; they remain `not_executed`. Learning's expanded P0-10 cases are received,
not yet integrated/independently accepted. P0 implementation/review results,
remaining defects, integrated commits, local checks and push evidence are tracked
in [P0 continuation evidence](p0-resume-integration.md). No R59/A44/A46 or G7
acceptance is implied by documentation adoption or these reading receipts.

## Later semantic audit (2026-09-28 UTC)

The original adoption/403/route-restoration and reading receipts above remain
historical evidence for their exact commits. The subsequent user-authorized
[semantic audit](requirements-semantic-audit.md) rewrites the original requirement
mappings, adds direct original-goal verification and confirmed intent decisions,
and preserves explicit P1–P4 backlog. Its commit/push and actual native notices
are tracked there; earlier e432937 reads do not certify reading that new revision.
No application acceptance follows from either documentation adoption.
