# Exact AI-disabled candidate: separately gated executable wrapper

2026-10-03. Same P0-07/P0-13 acceptance task; bounded instruction
`handoff_73f0ff743a103f851d4cac39926a70c5`, clean QA baseline `d783764` and
Lead review baseline `c6d7eda`. Requirements and Windows source are unchanged
from52be105; current task/workflow and the actual entry/cleanup call flow were
refreshed. Only one new wrapper, its focused boundary test and this evidence leaf
were written. All ten saved source pins, candidate/payload bytes, original
preparation evidence and historical wrappers/approvals remain unchanged.

The missing executable entry is now implemented in
[qa_run_tts_candidate.mjs](../../../../../tests/e2e/windows/qa_run_tts_candidate.mjs).
**It has not been run.** Import/default CLI does not start Windows. An explicit
`--execute` additionally requires the exact candidate and a separate independently
pinned, currently active Lead-reviewed display allocation. No record is allocated
now, and the inert [template](allocation.template.json) fails the gate.

Wrapper SHA256:
`d7f47e688962ea069b1a82b6073abf2ffd05b955bdf48468bcb5a2a8548dc48b`.
Saved candidate SHA256:
`f5a55d6edabe33c0b4fa5cc3e299e4f79d6c0304f1e36fd76dc3cc1547f3e2bd`.
Runner4a9b9b9c, stepsc3e51410 and surface69e38e1b retain their full hashes in
the [receipt](check-receipt.json) and template. Existing77-file package/tree,
production entry and local compiled-helper identity are unchanged.

## One reviewable command

After Lead issues the separately reviewed record at the shown path and supplies
its SHA256 through the granted route, the foreground command is:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/wt-review/tests/e2e/windows/qa_run_tts_candidate.mjs --execute /home/agentsdock/Projects/learning-companion/wt-review/docs/verification/qa/p0-13-tts-52be105/execution-result /tmp/lc-qa-tts-52be105-display-allocation.json '<LEAD-PROVIDED-ALLOCATION-SHA256>'
```

The final field is deliberately absent authority, not a generated approval or a
command to run now. The output folder must be new. Lead resolves the updated
exact-command scope using this concrete wrapper/native argument list, then issues
the allocation; the old human approval cannot authorize it. Normal runtime and
exact-command sandbox approval still apply. No permission setting is weakened.

The template records every required field. Active allocation must provide
`schema`, `state:active`, `lead_reviewed:true`, a nonempty allocation identifier,
`updated_command_approval_ref` distinct from the old fixed approval, current
`valid_from_utc`/`valid_until_utc`, and `exclusive_display:true`. It binds exact
`wrapper_sha256`, `candidate_sha256`, all three `payload_sha256` entries,
`native_invocation` executable/complete arguments, and the complete
`launch_identity` source/stage/tree/work/runtime/Edge/ports. Scope remains
`AI_DISABLED_GENERATED_SURFACE_ONLY`, account/audio/microphone access false,
provider attempts0, max native attempt1, retry false, and only exact-owned cleanup
permitted after expiry. At launch at least140 seconds must remain for the existing
140-second launcher bound. These checks do not authenticate an arbitrary record
as user authorization; its independently reviewed hash must come from Lead.
An unreviewed file or self-set boolean is not permission.

## Actual offline verification and execution order

[Final checks](focused-checks.log): **23 passed, zero failure/skip/cancel**.
Node24.21.0 ran directly with `--permission`, filesystem read permission only,
and no child-process permission. A named assertion verifies actual
`ERR_ACCESS_DENIED` on a child spawn. All Windows commands, fresh Python audit
responses, native runner output and filesystem writes are injected; no actual
Windows/child/helper/app process or native scratch was created. Both JavaScript
syntax checks pass. Prior20-check output is retained separately, never summed.

The checks exercise these boundaries and ordering:

1. Missing explicit execute/hash, altered candidate/payload/allocation,
   released/expired lease, old approval, wrong wrapper/work/ports/runner,
   scope expansion, Bypass or alternate engine rejects before any Windows call.
2. Reuse `checkTtsCandidate` with the saved receipt, validate independently pinned
   allocation, run fresh `qa_tts_stage_check.py`, and recheck all ten source pins
   and payload/package identity before any Windows preflight or scratch creation.
   Fresh audit failure performs no cleanup queries.
3. Check allocation before each metadata preflight, reject other Electron launches
   or occupied ports, then exclusively create the unused scratch and rehash all
   three copies. Its existence consumes the candidate; retries are refused.
4. Parse the exact copied runner, then launch at most once using only
   `-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File` and the pinned
   arguments. Parser/copy/expiry failure launches nothing and signals no process.
5. On any launcher attempt, including throw or timeout, always reuse complete
   `windowsCalls`/`releaseOwned` for both exact launch identities. Held-process
   creation/executable/argv revalidation remains; folders are preserved with
   `ownsFolder:false`. No name/PID-only termination, Bypass, unblock, alternate
   engine or retry path exists.
6. Success requires all32 successful native steps, both actual moved handles with
   pointer capture and unchanged ink/selection/source, no abort and both confirmed
   owned-launch cleanups. This is diagnostic success, not physical/device/product
   acceptance. The wrapper does not automatically close the runtime display lease;
   QA must report actual resource release explicitly to Lead.

Independent source review found a lease-expiry gap between the three preflight
queries. Each is now guarded; a first-query clock-advance negative proves no later
query, parser, launch or directory creation follows. Final source review found no
remaining concrete blocker. The reviewer ran no tests or native commands.

**Current state:** executable path prepared for review, no allocation/approval
record issued, no native run, no account/audio/microphone/model action, real0/4
unchanged and voice-input slot unassigned. All actual geometry, running Stop,
speech/caption/cancellation and desktop gates remain NOT_RUN. Lead owns updated
scope review and fresh display-only allocation; later audible/real-AI acceptance
still requires its own substantive release, without extra requests or a new campaign.
