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

This initial record is prepared before the formal specification commit. The exact
commit SHA, verified push and native Chats delivery receipts will be recorded in
a subsequent evidence commit after those operations actually succeed. No send,
read acknowledgement or new feature acceptance is claimed by preparation alone.

| Role | Follow-up card | Current work preserved | Notification | Reading receipt |
| --- | --- | --- | --- | --- |
| Backend | P0-09 | P0-04 delivery review/fixes first | Not sent yet | Not received |
| Learning | P0-10 | P0-05 timestamp correction first | Not sent yet | Not received |
| iOS | P0-11 | P0-03 capability work first | Not sent yet | Not received |
| Web | P0-12 | P0-02 probe first | Not sent yet | Not received |
| QA | P0-13 | P0-06A first | Not sent yet | Not received |

A native accepted receipt will establish delivery only. Each role is asked for
one concise reply naming the read specification SHA, relevant clauses and next
step at a safe boundary. Those actual replies will be appended when received;
there is no repeated acknowledgement loop or requirement to wait for all new
application features before reporting specification integration.

## Existing P0 work observed during adoption

Backend delivery `803916ff5d1663cb970636b22bb897d89d083da0` arrived in actual message
`handoff_4b18adcb7385ceab4af0acb09b0e3033`. Its reported 195 checks and missing
PostgreSQL test DSN are worker evidence, not main integration or real-DB acceptance.
The lead recorded receipt without merging application code into this documentation
change. Learning's requested timestamp correction remains with its owner.
