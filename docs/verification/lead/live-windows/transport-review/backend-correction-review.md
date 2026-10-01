# Backend live transport correction review

Decision: **APPROVE** `91e72fe5c3d25b0372df79a51a6683df869d757a` for integration of this bounded offline/local live bridge correction. No remaining concrete blocker in the four-path delta. This is not real account/model, audio, Windows/display, or full-product acceptance.

## Exact source and scope

The commit is the direct child of held `2833e2d15b67777aa85b91f1ad47a3efd0751312`, independently confirmed with `git show -s --format='%H %P'`. Exact candidate snapshot: `/tmp/backend-live-correction-review-srantkok`. Main and Backend worktrees were not modified. Complete diff reviewed for:

- `services/worker/connectors/chatgpt_live.py`
- `services/worker/connectors/tests/test_chatgpt_live.py`
- `services/worker/connectors/tests/test_chatgpt_live_stream.py`
- `docs/verification/backend/p0-04-live-subscription-transport.md`

Prior review of the real RPC/write/receipt/tool flow and current ADR requirements is reused. RPC/legacy source is unchanged; no unrelated rerun. Previous report `/tmp/backend-live-transport-review.md`, prior snapshot `/tmp/backend-live-transport-review-fcg_rmg4`, independent transport probes, and prior failures remain intact.

## Findings

**H1 resolved.** `_begin_session` (line 172) uses all three validated Start policy values without the former 12-call/5-minute/30-second clamp. The existing formal wire limits remain authoritative. Independent unchanged probe observed the requested 60 submissions and 1,800,000 ms. The affected session test independently executed 100 requests after the former five-minute cutoff, rejected request 101, and retained eventual one-hour expiry/no same-session renewal. The 500 ms configured observation interval is exercised.

**H2 resolved without allowing result self-authorization.** `_current_state` (line 298) derives provenance from the independently retained active Turn, with active identity, session, deadline, cancellation and current accepted permission checks. `_guard` (line 304) additionally matches that frozen Turn against the prepared provenance and checks any recorded fencing reason. Ordinary accepted newer observations update monotonic admission state without invalidating an otherwise authorized earlier response. Original frame/source/focus/time labels are retained, including before-turn-write and already-submitted cases. Accepted new explicit intent, increased permission revision, withdrawal, Stop and matching interrupt still fence the prior request. Invalid/rejected input cannot replace authority. Forged result permission provenance remains rejected.

**Reserve is finite scheduling, not quota expansion.** `_Session.observation_limit` (line 66) computes `limit - max(1, (limit + 4) // 5)`. Observation admission checks the shared consumed-submission count against that threshold; focus/follow-ups can consume the remaining configured allowance. Limits 1/2/5/6 validate minimum-one and rounding behavior. A queued observation admitted before the active request reserves a slot rechecks the budget in `_guard` at `_run` entry (line 333), before `begin_request`, receipt creation, thread creation or turn write. Its `budget_reached/not_submitted` refusal does not stop the session or prevent the next explicit request. Submission is still reserved exactly once at the actual guarded turn write; unknown submission is not refunded.

**Authority boundary remains explicit.** Busy/rejected replacement input does not itself become accepted current authority. The documented trusted desktop obligation to interrupt immediately on intent/permission changes (and Stop on source permission loss), then independently gate actual presentation, remains essential. Source/current permission failures and uncertain interruption still suspend rather than auto-retry. No claim is made that a rejected request alone revokes an active one.

The changed wrong-target-interruption test now uses an unrelated queued observation; this is appropriate because an accepted new explicit request intentionally fences the active request under corrected semantics. The separate explicit-supersession and permission/Stop tests still pass. No weakened validation or receipt assertion was found.

## Independently executed checks

Working directory for all tests: `/tmp/backend-live-correction-review-srantkok`.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/worker/connectors/tests/test_chatgpt_live.py --tb=short
```

**54 passed in 2.29 s.** This is the changed scheduler module, including new regressions and relevant existing authority, Stop, failure, receipt and budget controls; not a broad legacy campaign.

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/worker/connectors/tests/test_chatgpt_live_stream.py::test_actual_live_pipe_preserves_configured_policy_and_active_focus_during_new_capture --tb=short
```

**1 passed in 1.04 s.** Run through normal exact-command approval because the previous review's sandboxed foreground-pipe harness timed out. This invokes the production foreground entrypoint with an owned fake Python child, actual Learning code, two turns and child-reaping assertions; no account/model/native capture. The previous environment-sensitive timeouts are not silently replaced or asserted to have been proven EPERM. They remain in the original report. No current test failure occurred.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /home/agentsdock/Projects/learning-companion/repo/docs/verification/lead/live-windows/transport-review/scheduling-probe.py /tmp/backend-live-correction-review-srantkok /tmp/backend-live-correction-scheduling-results.json
sha256sum /home/agentsdock/Projects/learning-companion/repo/docs/verification/lead/live-windows/transport-review/scheduling-probe.py
```

The original probe was run unchanged. SHA-256: `bd393c98ec1518e8dbf40273df455feae53dad31dab7c57ee75f833211836209`. Result artifact: `/tmp/backend-live-correction-scheduling-results.json`.

Observed:

```json
{
  "configured_bounds_honored": true,
  "remaining_submissions": 60,
  "expires_in_ms": 1800000,
  "focus_completed_with_newer_observation": true,
  "focus_reply": {"kind": "generated_assistance", "frame_seq": 3},
  "observation_completed": true,
  "turn_writes": 2,
  "max_running": 1
}
```

These are **55 executed pytest cases plus the unchanged independent scheduling probe**. Backend's reported 71 combined cases, nine failures against the old candidate, and intermediate 53-pass/1-fail test adjustment are owner evidence in the reviewed document, not separately reproduced totals here. This review does not add their counts to ours.

## Integration recommendation and limits

Integrate the direct correction after its required parent, then verify the resulting main tree with lead's focused checks. Parent's updated ADR reserve/client-handling documentation is compatible with this implementation. No contract, dependency, migration or legacy-wire change is included. Continue real-device/account/audio evidence under its existing separate authorization and owners; offline fake-child success proves only the exercised local transport/scheduling behavior.
