# G4 / P0-08: installed managed Codex compatibility

**Follow-up:** the authorized [isolated fake-transport probe](codex-app-server-isolation-followup.md)
now measures the advertised tool set and one no-retry failure. It resolves the
`unified_exec` flag ambiguity for that tested configuration, while retaining
provider/model and host-boundary limits. The original schema findings below
remain the record of what was known before any server was started.

2026-10-01 UTC. Lead card `handoff_fbe401de52ae85b625c76f3b0e9314fc`;
assigned main `e9ccccad6ac425a3d19a654e74340c565e3564c4`.
Refreshed the complete affected source/English decision and ADR 0003 at
`1b7c90558165c87c83564b1d6c777905923b8528` after same-task follow-up
`handoff_afa89f99fc9f4fea58c7863844647f8d`.
Support writes only its evidence/probe paths. Ponytail LITE; model effort unchanged.

**Protocol compatibility is established from the installed schemas; a tool-free
inference configuration is not yet verified.** The installed CLI supports the
requested managed login, text/image turns, cancellation and status surfaces.
It also has material isolation differences from current documentation. Do not
start a text/image turn on the premise that `tools=[]`, `never`, or `read-only`
alone removes access to the host. No server, account RPC, login or inference was
started in this investigation, and no existing auth/config file was explicitly
opened or modified. No API key or paid fallback is required by this proposal.

## Exact evidence

Installed executable: `/home/agentsdock/.local/bin/codex`, resolving to the
standalone `0.158.0-x86_64-unknown-linux-musl` release; actual output
`codex-cli 0.158.0`. Binary SHA-256:
`167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`.

The installed `app-server generate-json-schema --out DIR` command succeeded
for both the default stable surface and `--experimental`, using a new temporary
Codex home, an empty temporary cwd and a small child environment. Generated data
is under `/tmp/lc-support-codex-schema-uk50qj_h`; no generated schemas were placed
in application or shared-contract directories.

| Bundle | JSON files | SHA-256 of sorted relative-name/NUL/file-hash/newline manifest |
| --- | ---: | --- |
| stable | 314 | `cd9238d61238dca0566621d17416638307501c5fbf0a90ed2bb882f2f00aa958` |
| experimental | 440 | `20836679ba7d25073e4d2b837fd4d1cc116857dd442174b72fe912c2879415c9` |

[Schema audit](codex-app-server-0.158.0-schema-audit.json) records 28 relevant file
hashes per bundle, method checks, input shapes, limits and feature values.
[CLI receipt](codex-app-server-0.158.0-cli-receipt.json) records generation commands,
warnings and the focused feature checks. The CLI refused to create PATH helper
aliases under `/tmp`; schema generation still exited 0. Initial version/help
commands similarly reported a read-only PATH-alias warning. These were not auth
or provider failures. No failed operation was treated as successful isolation.

The [offline audit](../../../tests/probes/support/codex_app_server_schema_check.py)
passed against those generated files:

```sh
python3 tests/probes/support/codex_app_server_schema_check.py /tmp/lc-support-codex-schema-uk50qj_h
```

This command reads the supplied schemas and feature receipts only. It does not
launch Codex or contact a provider. Its version-specific assertions deliberately
require review when schemas change. An independent read-only review corroborated
the isolation/schema gaps; there was no second runtime campaign.

## Installed RPC contract for implementers

The following is derived from the installed stable JSON schemas, not an account
query. Requests carry `id`, `method`, and the indicated `params`; notifications
have no request ID. Foreground stdio uses one JSON message per line.

| Operation | Installed fields and handling |
| --- | --- |
| `initialize`, then `initialized` | `clientInfo.name` and `version` required; `title` optional. Omit experimental capability or set it false. Wait for initialize response before other methods. |
| `account/read` | `{refreshToken:false}` avoids requesting proactive refresh. Result has required `requiresOpenaiAuth`, nullable `account`; ChatGPT account has nullable `email` and `planType`. Missing account means needs-auth, not an API-key requirement. |
| `account/login/start` | Managed `{type:"chatgpt"}` returns `loginId`/`authUrl`; `{type:"chatgptDeviceCode"}` returns `loginId`, `userCode`, `verificationUrl`. These are supported alternatives, not logins executed here. |
| `account/login/cancel` | Requires `loginId`; returns `status:"canceled"` or `"notFound"`. Match the pending attempt; do not interpret a stale cancellation as success. |
| `account/login/completed`, `account/updated` | Completion has `success`, nullable `loginId`/`error`; updated has nullable `authMode`/`planType`. A login URL or start response is not successful authentication. |
| `account/rateLimits/read` | Params may be omitted/null. Result requires `rateLimits`; may contain `rateLimitsByLimitId`, `ordinaryUsageAllowed`, `accountId`, credit/reset metadata. Windows expose `usedPercent`, nullable `resetsAt`/`windowDurationMins`. Unknown is not zero/unlimited. Do not opt into `supportsLunaReserve` or consume/reset credits. |
| `model/list` | `cursor`, `limit`, `includeHidden`; follow `nextCursor`. Model records have `model`, `id`, supported/default reasoning effort, and optional `inputModalities` with a schema default of text/image. Absence or a default is not measured image support or entitlement. |
| `thread/start` | Optional `model`, `cwd`, `approvalPolicy`, `sandbox`, `baseInstructions`, `developerInstructions`, generic `config`, `ephemeral`. Response includes actual model/provider, policy, cwd, `thread.id`, and optional reasoning effort/instruction sources. Check effective values. |
| `turn/start` | Required `threadId` and `input[]`. Text: `{type:"text",text:...}`. Image: `{type:"image",url:...}` or `fileId`; local: `{type:"localImage",path:...}`. Optional image `detail`: auto/low/high/original. `effort` is a nonempty advertised string, not a fixed enum; do not silently substitute model or effort. |
| `item/agentMessage/delta` | `threadId`, `turnId`, `itemId`, `delta`; associate output with the exact active request and current disclosure fence. |
| `turn/interrupt` | Requires `threadId` and `turnId`; empty response acknowledges the request. Wait for terminal state or explicitly report an unknown outcome. |
| `turn/completed`, `error` | Turn status is `completed`, `interrupted`, `failed`, or `inProgress`. Only completed is success. Error notification includes `willRetry`; terminal turn error has message and optional structured cause/HTTP status. Preserve unauthorized, usage/rate limit, session-budget, sandbox and stream failures distinctly. |

The installed external-token login variant is marked unstable/internal. It is
outside the chosen managed flow. The application must not read Codex's token
storage, pass extracted credentials, or implement a private token proxy.

Keep the product's original text/images, source hashes, frame/time/provenance,
attempt/version and disclosure state in its own existing archive. Codex history
or an ephemeral thread is not that archive. A schema's audio variant does not
establish live classroom/audio capability. R38, §3.8, G4, R39–42 and
V-EntitlementBudgetQuality remain open until actual authorized checks; affected
problem-solving §3–6 still fence requests, caches and final presentation.

## Tool/config isolation: measured limits

1. Stable and experimental `ThreadStartParams` have no `tools` or `toolConfig`.
   Experimental `dynamicTools` adds client tools; an empty array is not a global
   built-in deny-list. Public `Config.ToolsV2` only describes `web_search`.
2. Installed `SandboxPolicy.readOnly` has only `type` and `networkAccess`.
   It lacks the current documentation's restricted-read `access` field. Do not
   send an unknown field and assume it takes effect. Write protection and denied
   escalations do not establish denied file reads.
3. `ThreadStartResponse.disabledPluginIds` explicitly says the saved list does
   not yet filter plugin capabilities. It is not an isolation boundary.
4. Offline `features list` accepted the requested disables and reported false for
   hooks, shell_tool, shell_snapshot, code_mode/host/prewarm, apps, plugins,
   remote_plugin, browser/computer use, image generation/view_image, multi-agent,
   goals, memories, skill dependency installation/search, tool suggestions,
   workspace dependencies and daemon auto-start. However **unified_exec remained
   true**. Both an isolated `--disable unified_exec` and
   `-c features.unified_exec=false` again exited 0 while reporting true. Cause and
   actual tool exposure were not established; do not call these flags a verified
   all-tools-off policy.
5. `skip_host_skill_discovery` reported true when enabled, but is under development.
   That observation alone does not prove suppression of bundled/admin skills or
   all instruction sources. `project_doc_max_bytes=0` is a documented-setting
   candidate, not measured proof of no AGENTS content. Empty MCP/hook tables do
   not prove inherited layers were cleared.

## Recommended foreground launch boundary

Recommend one private stdio child, with a dedicated **product-owned** Codex home
and empty working directory, not the development agent's home or repository.
This matches ADR 0003's shared foreground Python bridge and trusted optional
`LC_SUBSCRIPTION_STATE_DIR` / `LC_SUBSCRIPTION_CODEX_BIN`; these are not model or
renderer inputs. Keep that existing bridge, without a second launcher service.
Pass argv directly (`shell:false`); stderr stays diagnostic and stdout is framed
RPC. Supply only required platform environment variables, not inherited API keys,
provider overrides, arbitrary tool paths or agent credentials. Preserve real HOME
semantics; set the child's supported `CODEX_HOME` to the product-owned state path.
Do not copy auth state there. Later, an explicit managed login owns its credentials
and refresh lifecycle in that state. No model/effort override is needed at launch.

**Proposed command, not executed or approved as tool-free inference:**

```sh
/home/agentsdock/.local/bin/codex app-server --listen stdio:// --strict-config \
  -c 'forced_login_method="chatgpt"' \
  -c 'cli_auth_credentials_store="file"' \
  -c 'approval_policy="never"' -c 'sandbox_mode="read-only"' \
  -c 'web_search="disabled"' -c 'project_doc_max_bytes=0' \
  --disable hooks --disable shell_tool --disable shell_snapshot \
  --disable code_mode --disable code_mode_host --disable code_mode_prewarm \
  --disable apps --disable plugins --disable remote_plugin \
  --disable browser_use --disable computer_use --disable image_generation \
  --disable view_image --disable multi_agent --disable multi_agent_v2 \
  --disable goals --disable memories --disable skill_mcp_dependency_install \
  --disable skill_search --disable tool_suggest --disable workspace_dependencies \
  --disable daemon_auto_start --enable skip_host_skill_discovery
```

`--strict-config` is installed help evidence, not a strict validation already run.
The credential-store and project-doc settings above come from current official
configuration documentation; exact-build behavior still needs isolated launch
validation. Do not weaken managed policy or fall back to existing agent config if
validation fails. `unified_exec` is deliberately not presented as disabled.

The first later permitted launch should remain metadata-only: initialize and
inspect narrowly selected effective settings/status without logging auth data;
propose `account/read` with refresh false only after isolation is understood.
Keep thread creation/turns, login/logout, configuration writes, direct tools,
MCP calls and credit operations outside that check. Unexpected server requests
must not receive blanket approval. No account RPC was run this round.

Before enabling inference, Backend/Lead must establish the exact model-facing
tool set and a tested host-file boundary for this binary, including AGENTS,
skills, MCP/hooks and environment exposure. Do not infer that interrupting after
a tool-start event prevents its side effect. The concrete unresolved question is
whether this installed version can enforce the required tool-free connector, or
needs a separately reviewed process boundary/version-specific control. This is
a bounded compatibility dependency, not a request to switch to API billing or
cancel the text/image requirement. Other owners can implement the protocol and
disclosure/cancellation fences while that dependency is resolved.

## Windows/WSL and macOS reuse

The evidence is for **Linux Codex in WSL**, not a native Windows Codex build.
The Windows parent should spawn the selected distro's Linux executable through
foreground `wsl.exe --distribution <configured-distro> --exec ...`, with owned
stdio pipes and a tested child lifecycle. A `localImage.path` must name a file
readable in the child's Linux namespace; a raw `C:\...` string is not such proof.
Reuse the existing authorized artifact handoff; bind path/bytes/hash and lifetime
to the current source/version. Neither an arbitrary URL nor `fileId` is evidence
that the product uploaded or supplied the intended image. Prefer a declared,
tested attachment path; do not silently substitute screenshot descriptions.

macOS can reuse the protocol adapter and state machine, but needs its own installed
binary/version/schema and permission/lifecycle check, with macOS-native image
paths. No Mac execution, native Windows binary check, real image inference,
account plan/quota verification or provider response was performed here.

## Official sources checked 2026-10-01

- [App Server](https://learn.chatgpt.com/docs/app-server): documents managed
  ChatGPT OAuth, the RPC lifecycle and newer read-access controls. It continues
  to describe personal/local open-source App Server authentication while
  recommending Sign in with ChatGPT; commercial/hosted use has a separate path.
- [Sign in with ChatGPT overview](https://developers.openai.com/siwc/token-sharing-open-source):
  describes optional ChatGPT-plan authorization for eligible requests. It does
  not grant chat history or prove this account's access. Its external OAuth-host
  lifecycle is distinct from the selected Codex-managed flow; no token-sharing
  implementation was substituted here.
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference):
  documents the proposed feature, credential-store and project-doc settings.
  Configuration names or parse success alone do not prove runtime tool removal.
- [Environment variables](https://learn.chatgpt.com/docs/config-file/environment-variables),
  [skills](https://learn.chatgpt.com/docs/build-skills), and
  [hooks](https://learn.chatgpt.com/docs/hooks): describe additional discovery and
  configuration surfaces; a separate Codex home is not full process isolation.

Stop at this evidence delivery. Lead owns the shared connector release and any
next bounded isolation/metadata check; Backend/Learning/Web retain their owned
implementation. Actual modest inference budget and first provider test remain
Lead-coordinated, not executed or claimed by Support.
