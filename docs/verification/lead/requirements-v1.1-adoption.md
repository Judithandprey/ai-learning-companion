# Requirements v1.1 adoption

Date: 2026-09-28 UTC. Owner: lead, sole main integrator.

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

## Commit, push and notification evidence

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
