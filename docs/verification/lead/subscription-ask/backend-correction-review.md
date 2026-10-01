# Backend correction review — 7dc5e4f

**Approved within the assigned launch/RPC scope. B-SUB-01 and B-SUB-02 are closed. No new blocking finding.** The gate now supports a bounded first real Windows-via-WSL check on the pinned Linux binary; this approval does not establish working login, subscription entitlement or image inference. Lead's separate receipt/output/account review remains authoritative for those areas.

Exact candidate: `7dc5e4fd093c5baa57c39ff29e401d738914773e`, parent `18fe4788e9cba52d7f336c273047432e00525499`; compared with the supplied integrated baseline/current main (`9d17a60` / `d9c7334`). Used a `git archive` at `/tmp/subscription-backend-7dc5e4-kmyqok7y`. Reviewed the actual launch/RPC/bridge changes, relevant changed tests, launch report, metadata checker source and committed metadata result. Main and repository files were not edited; the new receipt module was left to Lead's assigned review.

## Closure and release boundary

- **B-SUB-01:** `chatgpt_rpc.py` now requires exactly `readOnly` plus boolean `networkAccess:false`, and an ephemeral thread, before `turn/start`. The original independent network-expansion reproduction now refuses with `isolation_unverified` and **zero turn submissions**. True, numeric zero, missing/changed sandbox and missing/false ephemeral cases are covered by focused fake-child tests.
- **B-SUB-02:** the RPC cancellation event now emits the private `login_cancelled` discriminator. The original combined RPC/bridge reproduction now produces `success:false,error:login_cancelled`.
- Launch hashes the selected executable and admits only Linux x86_64 and the reviewed 0.158.0 binary hash. Matching bytes do not admit native Windows, macOS or ARM. This preserves shared-source reuse while correctly withholding unmeasured native launch acceptance.
- The fixed `lc_managed_chatgpt` alias requires managed OpenAI auth, explicit ChatGPT login, Responses, zero request/stream retries and no WebSockets. Effective configuration rejects endpoint/credential overrides, additional providers, inherited nonempty layers and unexpected managed requirements. Threads explicitly request the same alias/model without fallback. No API-key route was introduced.
- Startup and each pre-thread boundary verify configuration, requirements and the exact disabled six-skill inventory. The allowed bundled tree is bounded, rejects symlinks/additional roots and does not consume skill contents. The complete measured disabling flags, shell environment/login restrictions and analytics/compression settings are adopted. Unexpected server input/tool requests remain refused and the owned child is fenced.
- Internal timeout/cleanup now uses the pinned-turn interruption lock without setting caller/user cancellation. Delayed completion remains suppressed and uncertainty stays distinct from a user cancel. Explicit cancel continues to fence before submission.

## Evidence

Focused checks on the archived candidate, using root `.venv/bin/python`:

| Scope | Result |
| --- | --- |
| Changed launch/config/version/skills and relevant state controls | 101 passed, 22 unrelated cases deselected, 0.23 s |
| RPC policy/login/verification/cancellation/timeout controls | 39 passed, 47 unrelated cases deselected, 2.09 s |
| Real bridge class → synthetic RPC child timeout/error classification | 4 passed, 2.57 s |
| Independent in-memory previous reproductions and completion/cancel/auth controls | 5 passed |

No full old suite was repeated. `/tmp/subscription-backend-correction-probe.py` reproduces the independent checks; `/tmp/subscription-backend-correction-review.json` records source hashes and outcomes.

The committed owner's metadata result reports only `initialize`, `config/read`, `configRequirements/read`, `skills/list`, with cleanup. Independently recomputed settings-template SHA-256 matches `1b46d22496a546a83030745743718649f0bf0c221eb30c949c760a741418d9f5`; version/binary hash/alias match the reviewed constants. The real metadata checker was **not replayed**. No real Codex child, account/login/provider call, display or inference was used in this review.

Next: Lead completes its disjoint receipt/output/account review and integrated checks, then releases the exact Windows candidate for the already authorized modest image-only randomized-information QA. Real provider/model behavior, auth/usage limits, actual UI response and Stop remain acceptance evidence to obtain. Native Mac compatibility/build/interactive acceptance, continuous observation, audio, physical pen and Notability remain separate; this correction claims none of them.
