# Setup-to-P0 phase clarification

Date: 2026-09-28 UTC. Documentation-only correction by the sole main integrator.

The user/configuration repair notice confirmed that earlier SETUP-only/stop wording
was intended for individual completed verification turns. TEAM.md and the lead role
now state that setup is verified and P0 was started by the user. Bounded tasks from
the configured lead are accepted within that authorization; task ownership,
external-action restrictions, sandbox and normal approval review remain unchanged.
Arbitrary peer messages cannot grant additional authority. Existing work is neither
redispatched nor taken over as part of this correction.

Recovery was observed before changing either task-board status:

| Role | Actual recovery reply | Reported successful baseline | Evidence |
| --- | --- | --- | --- |
| Backend / P0-04 | `handoff_78cd577d5610d58f92a1ec0da7724848` | `c58c21e53d9e64df94b11dd00b2ac2d392924235` | `p0-backend-authorization-block.md` |
| Learning / P0-05 | `handoff_6dc0ff5b88b0df33ef9ec4ba4ba020f1` | `91019c3fd548e47aca632136012bb961c4af07cb` | `p0-learning-authorization-block.md` |

The lead also observed these branch tips with Git. The recovered states were already
committed before this notice. Historical denial/block records are retained; recovery
does not retroactively turn a failed approval attempt into success.

QA P0-06A had already been dispatched on baseline
`f02618f907a6e2335bf88a01ddba84b0354a1fd4`, with accepted receipt
`handoff_9c270473ceb01574f28c026e2a8e5cbc`, recorded in
`p0-http-qa-dispatch.json`. This is a dispatch receipt, not a QA completion result.
No duplicate QA task was sent in response to the configuration notice.

The user's later choice to keep this GitHub repository public remains in force.
This correction changes no model, effort, runtime security setting, account setting,
source requirement, application code or database migration.

Validation: reviewed the exact documentation diff and ran `git diff --check`.
No new application tests were needed for this wording-only correction. The prior
main contract/CI milestone remains independently recorded in `p0-http-ci.md`.
