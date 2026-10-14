# Candidate 06 live run: refused by tool review before execution — 2026-10-14

**Outcome: STOPPED, NOT RUN.** Claude Code's auto-mode classifier refused the one allocated wrapper invocation before
anything executed. Real actions stay **0 of 4**. The AI-disabled diagnostic stays closed at 3 of 3. QA released the
display and the account; neither was used.

## Assignment

- Lead `handoff_7efd5582`, release baseline `38003c573856cb56541e0ba275b104318321ab07`
  (`docs/verification/lead/live-windows/nonvoice-driver-review/resume-20261014/`).
- Human authorization `human-live-nonvoice-resume-20261014:ee8c9bd2e26a4df9b0123d18bfbb1ef3`.
- Allocation `live-nonvoice-20261014-306146a7972d4e09b7f7e898064d4ac1`, valid from `2026-10-14T05:45:45.804590Z` to
  `06:10:45.804590Z`.

## What QA did (05:47Z)

1. Read the release README, `human-approval.json` and `allocation.json` from `38003c5` with `git show`. The worktree was
   not changed.
2. Wrote `allocation.json` to the new file `/tmp/lc-live-nonvoice-20261014-306146a7972d4e09b7f7e898064d4ac1.json`.
   - Its SHA-256 is `9016295ed5ae272d001f7932455ba2cdbd7608955ec7a831d4bcca6f56800da1`, as the Lead supplied it and
     as committed in `allocation.sha256`.
   - Its fields name the active, Lead-reviewed allocation; wrapper `3ca43f76…`; candidate `288191f7…`; connector
     commit `0ff325b`; a 600000 ms bound; four actions; no voice, audio or microphone.
3. Checked the worktree: clean at `5bdbc1d`. The local wrapper and candidate hashes matched, and the output folder was
   absent.
4. Invoked once, at about 05:47:50Z. Output was redirected to a `/tmp` log, with the 600 s foreground limit:

   ```text
   /home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/e2e/windows/qa_run_live_candidate.mjs --execute docs/verification/qa/p0-13-live-0ff325b/execution-nonvoice-20261014-01 /tmp/lc-live-nonvoice-20261014-306146a7972d4e09b7f7e898064d4ac1.json 9016295ed5ae272d001f7932455ba2cdbd7608955ec7a831d4bcca6f56800da1
   ```

## The refusals, verbatim

The invocation:

> Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Production Deploy].

The refusal says it applies to the outcome. QA may not reach it through another tool, interpreter, host, encoding,
sub-agent or later turn. The user can allow it with a Bash permission rule in their settings.

A read-only status check right after it was also refused:

> Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Real-World Transactions].

That check would have listed four paths: the output folder, the candidate-06 scratch, the `/tmp` log and
`~/.local/state/lc-qa-live`.

QA retried neither, in any form, and did not delegate either.

## What follows, and what is not known

- The tool layer refused the wrapper command, so the wrapper never started. These did not run:
  - the stage check;
  - any Windows call or preflight;
  - the connector watch;
  - the scratch, the app or Edge;
  - any account, provider or audio action.
- The status check was refused too, so there is no filesystem observation after the refusal.
- Whether this refused, never-started invocation consumes the one allocation is for the Lead and the human to decide.
- The wrapper refuses to start the native run after `06:00:45Z` (`now + 600000 ms` must not pass the allocation's
  end). A later run needs a fresh allocation.

## Needed to proceed

One of these:
- the human allows this exact wrapper invocation in Claude Code's permission settings;
- the human runs or authorizes it by a route the Lead chooses.

Either way, a current allocation is needed. QA then invokes it once, under normal tool review, and stops on any new
refusal.
