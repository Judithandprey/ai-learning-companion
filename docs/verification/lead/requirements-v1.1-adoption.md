# Requirements v1.1 adoption

Date: 2026-09-28 UTC. Owner: lead, sole main integrator.

Current clarification: R51/R52 cover multiple answer-entry surfaces; R59 explicitly
details the existing R03/R08/R46–R48 original-screen note/archive goal, and A42–A46
extend acceptance without changing A01–A41. See the latest revision section below.
Earlier notification/reading receipts in this record apply only to their exact
earlier commits, not this clarification. This round's native Chats discovery was
denied; no final-clarification notice or reading receipt is claimed.

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

### Final clarification transport status

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

All five final-clarification notifications and reading reports remain outstanding
because of the provider denial recorded above. Earlier `57aee9c` reads are
historical evidence only; neither they nor server mailbox notifications establish
reading of this revision. The prepared follow-ups must use an actually granted
native route in a later run, reference the final committed baseline, preserve
existing work and extend the current cards without duplicate assignments.
