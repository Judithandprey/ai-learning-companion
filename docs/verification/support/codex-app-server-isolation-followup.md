# G4 / P0-08: actual isolated App Server transport

2026-10-01 UTC. Continuation `handoff_a18e73172e84d36e9ae952c877a8c90b`;
controlled no-retry addition `handoff_6d5855d5b444207b8fb50deb94d41a44`.
ADR/decision baseline: `1b7c90558165c87c83564b1d6c777905923b8528`.

**The actual outbound tool list contains only `request_user_input`.** No shell,
execution, file, MCP/app, browser/computer-use or image-view tool was advertised
in the two measured requests. Thus `features.unified_exec` continuing to print
true is not evidence that the execution tool remains exposed under this complete
configuration. This result is specific to installed Codex 0.158.0, the synthetic
model and provider described below; it is not managed ChatGPT access evidence.

The other concrete findings are that global Codex-home AGENTS survives
`project_doc_max_bytes=0`, and a controlled HTTP 503 caused exactly one request
with the selected provider's request/stream retry counts set to zero.

## Actual execution and boundary

Used the same installed Linux x86_64 musl binary from the prior report; SHA-256
`167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`.
The [stdlib probe](../../../tests/probes/support/codex_app_server_isolation.py)
runs foreground App Server over private stdio and a test-owned HTTP server.
Every inference-shaped request terminates at that server; its reply is synthetic.
No account/read, login, official inference, token, quota or provider access occurs.

The **whole probe**, including HTTP server and Codex, ran inside `bwrap` with
private user, network and PID namespaces and `--die-with-parent`. The only network
interface was private loopback. Read-only mounts contained `/usr`, `/bin`, `/lib`,
`/lib64`, the exact Codex executable and probe. Writable `/case` was a fresh owned
temporary directory; `/tmp`, `/dev`, `/proc`, `/etc` and the empty home view were
namespace-local. No host user home, agent config/auth, `/run` or Windows mount was
present. The child environment contained only PATH, HOME, CODEX_HOME, LANG and
SHELL; HOME retained its normal path but the host's files were not mounted there.

Default sandbox execution could not create the namespace's NETLINK_ROUTE socket.
The normal exact-command escalation approved the same restrictive namespace;
its loopback bind check succeeded. No machine setting, installed software,
credential or AgentsDock runtime was changed to make it work.

Both invocations had an outer 55-second foreground timeout. Terminating the PID
namespace owner closes its remaining processes; this supplements internal bounds,
not an assumed interrupt-after-tool-start guarantee. Neither timeout nor forced
termination was needed. The second receipt explicitly records that outer bound;
the first bound is recorded in the command execution log, not its JSON metadata.

| Actual case | HTTP and terminal result | Instruction/tool observation | Cleanup |
| --- | --- | --- | --- |
| Initial transport | One POST; synthetic SSE message; completed; 453 ms | Only request_user_input; state-home AGENTS marker present, parent marker absent | Codex exit 0; all threads closed; no hook/MCP marker; owned staging removed |
| Clean state + transient failure | One POST; HTTP 503; failed; error.willRetry=false; 452 ms | Only request_user_input; instructionSources=[]; neither marker present | Same normal cleanup; no second HTTP request |

[Initial receipt](codex-app-server-isolated-transport.json) SHA-256:
`de473f73afd8ecd5f4df3203d63e51f9645b273fd7f22b47cb1d67fd3ea7d549`.
[Clean-state/no-retry receipt](codex-app-server-isolated-no-retry.json) SHA-256:
`db7b29a675556c183e0ce0a3159d8f4cbc76d6c705e74683bddfefa0b5295cfb`.
The current probe matches the second receipt's source hash
`90ead4614125b8f62d0ba0e27f9ac6c3cc411247527d3193c0038ba7fc5c5983`.
The first receipt identifies the earlier draft hash; it is not claimed to execute
the final probe. Review led to bounded body/line reads, recursive namespace-tool
inventory, safer cleanup and stronger completion checks before the second run.

Only tool names/types, hashes, marker presence and selected protocol status were
recorded, not headers or raw model prompts. The initial draft had no stderr
diagnostics; the final probe hashes diagnostic lines rather than retaining them.
The synthetic response's token counts are fixed fixture values, not real usage.

## Supported child configuration and smallest correction

Both runs passed the actual installed `app-server --strict-config --listen stdio://`
startup with the complete `config.toml` recorded in each receipt. Effective thread
policy was `never`, `readOnly`, `networkAccess:false`, ephemeral, and the empty cwd.
The selected model was exactly **lc-support-synthetic**, selected provider
**lc_probe**, and URL was the receipt's private `http://127.0.0.1:PORT/v1`.
No credentials or auth headers were configured. The fake provider used:

```toml
[model_providers.lc_probe]
name = "Synthetic loopback only"
base_url = "http://127.0.0.1:PORT/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
stream_idle_timeout_ms = 5000
```

These provider settings are the **test transport**, not an API-key fallback or a
replacement for the selected managed OAuth provider. For production, apply retry
limits to the actually selected managed provider using verified supported fields;
the synthetic test does not verify an override of the built-in `openai` entry.
One 503 with `willRetry=false` proves this failure path, not no retries after every
authentication, quota, SSE disconnect, tool continuation or network condition.

Recommended responder configuration is the combination actually measured:

```toml
cli_auth_credentials_store = "file"
approval_policy = "never"
sandbox_mode = "read-only"
web_search = "disabled"
project_doc_max_bytes = 0
allow_login_shell = false
[analytics]
enabled = false
[shell_environment_policy]
inherit = "none"
[features]
hooks = false
shell_tool = false
shell_snapshot = false
code_mode = false
code_mode_host = false
code_mode_prewarm = false
apps = false
plugins = false
remote_plugin = false
browser_use = false
computer_use = false
image_generation = false
view_image = false
multi_agent = false
multi_agent_v2 = false
goals = false
memories = false
skill_mcp_dependency_install = false
skill_search = false
tool_suggest = false
workspace_dependencies = false
daemon_auto_start = false
enable_request_compression = false
skip_host_skill_discovery = true
```

Use the existing shared Python bridge and its trusted product-state/bin settings.
There is no need to fight the printed `unified_exec` value or introduce a new
connector framework. No global all-tools-off switch was established. The remaining
`request_user_input` requires the adapter to reject unexpected server tool/user-input
requests and approvals, retain its submission/presentation fences, and bound the
turn/child lifetime. No actual tool invocation was emitted in these fixtures, so
the adapter's rejection behavior still needs its focused implementation test.

The **necessary state correction** is a dedicated product-owned home containing
no global AGENTS/AGENTS.override customization, plus the empty controlled workdir.
Do not copy development-agent state. Reject unexpected instruction sources before
turn submission rather than clearing a user's files. In the contaminated fixture,
`thread/start.instructionSources` named `/case/state/AGENTS.md` and its marker was
in the HTTP body despite the zero project-doc limit. The clean fixture removed
that source by construction and measured an empty source list/body markers.
Parent-marker absence alone does not prove ancestor suppression: no Git/project
root marker existed in this test. Built-in instructions are still present.

The hook fixture and explicitly disabled MCP fixture did not create their owned
marker files. This is observed non-execution, not a positive-control proof of each
feature gate or permission to inherit managed hooks/MCP configuration. Current
[configuration documentation](https://learn.chatgpt.com/docs/config-file/config-reference)
describes project-doc limits as project instructions and reserves `instructions`
for future use; do not invent `instructions=""` as a global discovery disable.
[Hook documentation](https://learn.chatgpt.com/docs/hooks) describes merged sources
and separate trust, so an empty table or an untrusted canary alone is insufficient.

## Limits and handoff

This measures the aggregate tool list under the complete combination, not which
individual switch removes each tool. The chosen synthetic model is not a verified
production model/catalog or entitlement; no conclusion is made about every model
or provider. The private network namespace proves no official traffic from this
probe, while its fake provider behavior proves no real managed-auth capability.

The enclosing namespace is a **test safety boundary**. It is not a proposed new
service, required cross-platform framework, or proof that the product's ordinary
WSL/macOS child has the same host boundary. Read-only Codex sandbox alone still
allows reads in its supported scope; its schema lacks the newer restricted-read
field. Product owners must preserve controlled state/environment/config sources
and reject unexpected capability expansion. This test does not inspect or change
existing host managed policy. It proves neither arbitrary-host hook isolation
nor native Windows/macOS execution.

Independent review confirmed these narrow conclusions and cleanup. Lead can
forward the measured child settings, global-instruction guard and retry finding
to Backend. The existing adapter/owned-client work proceeds under ADR 0003;
actual managed login, selected image-model access, genuine image response,
Stop/cancel acceptance and provider-specific limits remain separately verified.
Support ends this bounded continuation here; no poll, real inference or API
activation follows from the synthetic passes.
