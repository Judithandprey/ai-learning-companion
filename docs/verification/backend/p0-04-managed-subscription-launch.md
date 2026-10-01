# Managed subscription launch and private ASK receipts

2026-10-01 UTC. Follow-up to Backend leaf `18fe4788e9cba52d7f336c273047432e00525499`.
Task `handoff_9aa9afa6f12bdfa0279320454611d396`, receipt addition
`handoff_dc6670aef8be6b88e933047b657a4ae9`, policy/login corrections
`handoff_e4b1fdd2e262874de12d827e9c492abf`, and fixed managed alias decision
`handoff_64887507ba152d34e2c14cf1b93a6443` are one bounded continuation.
ADR 0003, D-SUBSCRIPTION-FIRST, R38/§3.8/G4 and related ASK/Stop/disclosure
requirements remain at the assigned `1b7c90558165c87c83564b1d6c777905923b8528`
revision. No public IPC, shared schema, dependency, root, default-disabled
connector or platform file is changed.

## Observable outcome

The production launch passes a real **fresh-state metadata-only** check for the
installed Linux x86_64 musl `codex-cli 0.158.0`, SHA-256
`167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`.
The [sanitized receipt](managed-subscription-config-metadata.json) records the
actual version command, exact executable identity, effective selected provider,
disabled system-skill inventory and cleanup. Its settings-template hash replaces
the temporary product-state path with `/PRODUCT_STATE` for reproducibility.

The manual checker permits only `initialize`, `config/read`,
`configRequirements/read` and `skills/list` RPCs. It sends no account, login,
thread, turn or model request. The real child was reaped; its temporary empty
work directory and fresh state were removed. No existing credentials were read,
copied, altered or committed. Run explicitly, outside the pytest suite:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.worker.connectors.tests.check_subscription_configuration
```

The former permanent-false gate becomes an exact-build/config gate. Unsupported
binary hashes, platforms, inherited layers, nonempty managed requirements or
unexpected skills fail closed. There is no environment or JSON isolation bypass.
The two existing trusted launch paths remain unchanged. Native Windows/macOS
binaries need their own measured compatibility before this gate can admit them.

## Configuration and execution boundary

Read Support's complete report, both receipts and probe at
`a1aa5305c0e9099c89a472844e2eef13220314eb`. The initial transport receipt hash is
`de473f73afd8ecd5f4df3203d63e51f9645b273fd7f22b47cb1d67fd3ea7d549`;
the clean-state/no-retry receipt hash is
`db7b29a675556c183e0ce0a3159d8f4cbc76d6c705e74683bddfefa0b5295cfb`.
Those actual synthetic-provider runs advertised only `request_user_input` and
sent one HTTP request on the measured 503 path with zero retry settings.
They do not establish managed-account inference or every possible retry path.

The launcher applies that complete measured combination, including shell, hooks,
MCP/apps/plugins, browser/computer/image tools, code mode, agents, goals/memory,
skill dependency/discovery controls, no request compression, no login shell,
no analytics, no inherited shell environment and restrictive sandbox/approval
settings. It preserves the existing controlled state/environment and empty cwd.
Global product-home AGENTS and configuration remain refused, never deleted.

An actual attempt to override built-in `model_providers.openai` exited 1 before
initialization: built-in provider IDs are reserved and cannot be overridden.
Both partial and named override candidates failed. Lead therefore authorized
the fixed `lc_managed_chatgpt` configuration alias for the same official route.
The actual effective metadata verifies:

- `requires_openai_auth=true`, forced login method `chatgpt`, wire API `responses`;
- request and stream retry counts exactly integer zero, WebSockets disabled;
- no provider endpoint, environment key, bearer token, auth command, gateway,
  proxy or other credential override; effective default ChatGPT endpoint remains
  `https://chatgpt.com/backend-api/` with null OpenAI API override;
- exactly the selected alias, with no fallback provider. Each thread explicitly
  requests that alias and the chosen model; account/read must report ChatGPT.

These are official configuration fields, not a new transport. The
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
documents reserved IDs and retry/provider settings; the
[authentication documentation](https://learn.chatgpt.com/docs/auth#alternative-model-providers)
describes managed OpenAI authentication for a provider requiring it. Metadata
acceptance proves configuration, not account entitlement or a completed request.

Real initialization exposed another missing boundary: this exact binary creates
six bundled system skills even with host skill discovery skipped. Overriding
their directories did **not** disable them. Overriding their exact `SKILL.md`
paths did, as confirmed through official `skills/list`. The state check now
permits only the known auto-created `.system` tree, its six directory roots and
marker, with bounded entries and no symlinks or extra roots. It does not open
skill content. All six must independently be reported disabled, system-scoped,
with expected paths and no errors or plugin source. This is consistent with the
[per-skill configuration](https://learn.chatgpt.com/docs/build-skills); it is not
a claim that host-discovery suppression prevents bundled installation.

All three official metadata planes are checked at startup and again before each
thread, after account/model/quota reads. Only the exact command-line settings and
empty user/system layers pass. Any effective requirement except the expected
ChatGPT login restriction must be null. The actual thread must independently
report empty instruction sources, the empty cwd, exact model/provider,
approval `never`, ephemeral true and exactly read-only sandbox with
`networkAccess:false`; boolean false is not interchangeable with integer zero.
Unexpected server requests, including the remaining `request_user_input`, receive
a refusal and the child is fenced/reaped. No answer survives a tool request.

## Private per-ASK evidence

Accepted, unique ASK requests get a product-local receipt at
`<product-state>/receipts/<launch-uuid>/<sha256(request_id)>.json`.
Malformed/busy/stopped/duplicate requests rejected before reservation do not
replace the active request's receipt. Each launch directory is private (0700),
each file is 0600, at most 16 KiB, with at most 4096 request files per launch.
Existing receipts are not loaded or adopted. Writes use file fsync and atomic
replace of only the file created by this writer; this is not a power-loss
durability guarantee or a replacement source archive.

The receipt includes request/thread/turn binding, actual model, executable path,
version/hash and whether a trusted binary override was supplied. Input metadata
contains text UTF-8 byte count/hash and exact decoded image byte count/hash,
plus input types; it never stores prompt text, image content, URLs, credentials
or raw errors. Counts are cumulative thread/start and turn/start stdin writes
since this owned child. Produced item types and remote terminal status come
from matching actual protocol events, separately from the local outcome.

`submission=not_submitted` remains until the send boundary. Conservative
`uncertain` intent is recorded before turn bytes are written; `written` follows
successful pipe drain, and `acknowledged` follows the matching official turn/start
response. Prewrite intent never proves a submission. Pipe writes do not prove
remote acceptance or quota use. Input hashes may be prepared before submission;
interpret them together with submission state and counters. A crash may leave
pending/uncertain evidence. No automatic retry follows.

Completion evidence must persist before the bridge publishes an answer. Receipt
failure fences further submission/publication. Cancellation, malformed prepared
input, auth/isolation refusal and EOF before the ASK coroutine begins retain
truthful local and transport states. Remote `completed` after a local timeout
can coexist with local `uncertain`; it does not become an answer.

The login-cancel event now uses the exact private `login_cancelled` discriminator.
Review found that internal timeout/error cleanup also set the caller's cancel
event, misclassifying failures as user cancellation. Internal interruption now
shares the pinned-turn lock without changing user intent; only explicit cancel
sets that signal. Timeout/late completion remains suppressed and uncertain.

## Verification and retained failures

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest services/worker/connectors/tests tests/evals/test_subscription_ask.py -q --tb=short
```

**427 passed in 7.24s** after all production changes: 63 bridge/cross-seam,
86 fake-RPC, 123 launch/config/filesystem, 41 receipt and 114 Learning checks.
Fake children are synthetic local pipe processes. The real metadata checker
above is separate and does not contribute inference acceptance. Exact-command
approval was used because workspace sandboxing blocks asyncio self-pipe IPC;
permission settings and runtimes were not changed. `git diff --check` passed.

Retained failure evidence and corrections:

- Built-in provider overrides failed before initialization as described above;
  no official request was attempted with them.
- The first production metadata check refused the auto-created bundled skills;
  directory-based disable attempts left them enabled. Exact file paths plus
  explicit official inventory checks resolved that actual compatibility gap.
- A following metadata check still refused: official origins are individual
  `skills.config.<index>.path/enabled` keys, not one aggregate `skills.config`.
  All 12 origins are now verified. Missing/changed single origins remain refused.
- Independent launch tests found an expected skill directory replaced by a file
  was accepted (120 passed, one failed). Root-type checks fixed it; the final
  expanded suite passes without weakening the failing assertion.
- Early receipt integration rejected the real full version label and nullable
  not-yet-prepared input counts. The writer and factory seam were corrected;
  invalid lengths, hashes, fields and unsafe paths remain refused.
- Review's timeout/cancel classification defect is covered both in the inner RPC
  and through the real bridge-to-fake-child seam, including confirmed/unconfirmed
  interruption, sent-request error and late remote completion. No retry occurs.

PONYTAIL LITE: reuse the existing bridge/RPC/state lock and Learning seam; one
small standard-library writer is justified by QA's missing actual-submission
evidence. No new listener, queue, credentials store, provider framework or package.

## Next owner and limits

Lead reviews/integrates this leaf and updates the shared alias decision. QA then
uses the separately released integrated Windows candidate for the modest official
image-only randomized-information test and correlates these receipts with the
native selection/card evidence. This author pass performs no managed login,
account read, official inference or real subscription consumption. Actual model
access, quota, image understanding and provider-specific retry/auth behavior remain
unverified. Support's synthetic model/tool observations do not certify every model.
Native Windows/macOS process isolation, interactive Mac, whole-display ongoing
understanding, pen, audio/video, Notability and full-product acceptance remain open.
