# Managed subscription ASK connector — bounded author evidence

2026-10-01 UTC. Backend task `handoff_ba8e541a6a2a89041ee20b35b1c3173d`.
Assigned baseline `ff163a6ebbb9d974055e23ae97d0359e17cecef4` was normally merged
as `e340dcebf40fa7024349dbeac5edd8da76bd0f80`; existing work was preserved.
The complete ADR 0003 clarification, D-SUBSCRIPTION-FIRST, affected R38/§3.8/G4
source and English clauses were refreshed read-only at
`1b7c90558165c87c83564b1d6c777905923b8528`. The two affected source/translation
pairs match their committed manifest hashes. ASK/disclosure, explicit Stop,
original-image/source/ink preservation and V-EntitlementBudgetQuality remain
applicable; this slice does not close those broader acceptance cases.

Lead authorized the exact Learning dependency
`5b4b549105969274f0b0fbcc96fc35530cffd1b1`; it is locally cherry-picked as
`d05f8b4` without changing its three files. Integrators should take the Backend
delivery leaf after integrating the original Learning leaf, not replay the merge
or duplicate Learning ancestry. No public contract, manifest, migration, root
configuration, platform source or default `disabled.py` change is part of this
Backend delivery.

## Delivered behavior

`python -m services.worker.connectors.chatgpt_local` runs as a foreground private
stdin/stdout pipe child. It emits no startup record; `connection/read` is the
handshake. It follows ADR 0003's closed envelopes, success shapes and error codes.
Incoming lines are limited to 12 MiB, outgoing lines to 256 KiB; duplicate JSON
keys, nonfinite numbers, invalid Unicode and ambiguous framing are refused.
Provider error bodies and stderr are not forwarded. Pending commands and
one-use request/session history are bounded; exhaustion fails closed rather
than evicting stopped-session fences.

The bridge delegates exact PNG validation, English-first assistance scope and
complete provenance to Learning's existing pure functions. The original decoded
PNG is supplied in official image input alongside the prepared text. Only an
authoritative successful completed turn can bind an answer; deltas/commentary,
failed/incomplete/interrupted turns and model changes cannot become a result.
Answers are limited to 32,000 characters without truncating originals. There is
one active ASK. A request ID cannot be reused in this child, even after an
uncertain failure. No automatic submission retry or conversation resume exists.

Cancellation sets the local fence before waiting for a provider. The inner
client rechecks that fence while holding its write lock immediately before
`turn/start`. Later output stays suppressed. A delayed cancellation is pinned
to its original request and cannot interrupt a newer ASK. `session/stop` keeps
its capture-session fence for the entire connector lifetime. Local cancellation
does not imply remote rollback or restored quota; unconfirmed interruption is
reported explicitly. EOF, SIGTERM, failed output pipes and output backpressure
close only this connector's owned child, with bounded terminate/kill/reap.
No background service, timer-based retry or detached provider worker is created.

Managed login uses only official account login/read/cancel methods, matches its
own pending login ID, handles completion-before-start-response, and preserves
authentication for a later launch. Login URLs must be HTTPS on the exact
OpenAI/ChatGPT host family without userinfo; the desktop still opens them only
on explicit user action. There is no logout or external-token endpoint.
Account state, model image capability and quota windows are sanitized; email,
account IDs, tokens, upsell and raw errors are omitted. Missing modality or quota
remains unverified. A model catalog is not entitlement evidence. An explicit
`ordinaryUsageAllowed:false` blocks submission; non-managed/revoked auth fences
an active ASK. Server requests and tool/hook activity are refused, including
startup activity, and matching provider retry errors suppress any later answer.

PONYTAIL LITE: three cohesive standard-library modules separate framing/lifetime,
official RPC and the necessary product-state launch boundary. They reuse Learning
preparation/binding and the existing desktop child pattern; there is no new
credential store, generic provider framework, listener, queue service or dependency.

## Launch prerequisites and isolation limit

The desktop supplies only trusted launch settings `LC_SUBSCRIPTION_STATE_DIR`
and `LC_SUBSCRIPTION_CODEX_BIN` when needed. JSON cannot set paths, commands,
credentials or an isolation override. Defaults use the installed Codex executable
and a product-specific local-data directory. A fresh product state requires its
own managed login; this code never copies or opens development-agent auth files.
An unmarked nonempty directory is refused. Configuration/AGENTS/hooks/skills
overrides and symlinks in the product state are refused; an advisory lock prevents
concurrent ownership. Managed credentials are retained across normal closes.
The empty temporary work directory is removed after the owned child closes.
The child's environment preserves real home semantics while dropping inherited
API/provider/AgentsDock/Python/Node configuration and narrowing PATH.

**Production inference remains hard-disabled (`isolation_verified=False`).**
There is deliberately no environment/IPC switch to bypass this gate. Support's
installed-0.158.0 launch flags are defense in depth pending its assigned actual
tool-advertisement and internal-retry verification. Read-only sandbox and approval
`never` alone do not establish a tool-free responder. Empty `dynamicTools` removes
no built-in tools, and config acceptance is not enforcement evidence. Backend
requested verification of zero internal request/stream retries as well. An error
notification guard cannot retroactively prevent an App Server retry or tool side
effect. Exact model/provider/cwd, explicit empty instruction sources and effective
policy are additionally checked before a turn, once that launch gate is released
through reviewed code.

Backend independently inspected installed `codex-cli 0.158.0`, its App Server
help and generated experimental JSON schemas under
`/tmp/backend-subscription-schema-0158`. The CLI's read-only PATH-alias warning
did not prevent schema generation; it is not provider or isolation evidence.
No actual App Server, login, account or model operation was performed by Backend
during this author pass. Fake children are explicitly synthetic local processes.

## Verification

Final focused command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest services/worker/connectors/tests tests/evals/test_subscription_ask.py -q --tb=short
```

**241 passed in 2.83s**: 57 bridge/lifecycle checks, 45 official-RPC fake-child
checks, 25 launch/state controls and 114 exact Learning seam tests. This exact
command used normal on-request approval because the workspace sandbox rejects
asyncio's internal socketpair wake. Permission settings were not changed.
The tests cover strict IPC, exact PNG/provenance through actual Learning,
managed-auth/status/login refusal, image capability, completed-turn binding,
pre-send/in-flight cancellation, permanent Stop, delayed cancellation targeting,
uncertain outcomes without resubmission, launch/state isolation, bounded malformed
RPC and foreground private-pipe EOF cleanup. Actual provider capability remains
outside these tests.

Initial evidence is retained: the first combined bridge run reported 46 passed
and 3 failed. Two failures assumed initialization must run even when malformed
input already ended the stream; assertions were corrected to require bounded
closure and no provider submission. The third was an actual private-pipe EOF
timeout and was investigated rather than counted as passed. Direct
`asyncio` self-pipe send failed with `PermissionError`, errno 1, in the sandbox.
A read-only audit of the two synthetic processes' descriptors found no inherited
outer-pipe writer; the reader had already observed EOF. Normal exact-command
approval allowed the same foreground main/pipe/owned-child test to pass with no
timeout extension or polling workaround. Diagnostic timers and stack logging
were not retained. The later delayed-cancellation fixture was corrected to
expect conservative remote uncertainty when no interruption was confirmed,
while still requiring that the next request was untouched. Other reviewed
production fixes pinned cancellation before lock/scheduler waits, required
private pipes and refused tool/hook notifications even while idle. The final
combined run above passed after all production changes.

## Remaining evidence / next owner

Lead integrates the owned connector and exact Learning seam with Web's retained
selection/card flow, after Support's exact binary/config isolation evidence is
reviewed. QA then owns the separately released modest official image-only
randomized-information pass and user-visible completed answer, with cancellation
controls separately labeled. Fresh login/consent, real plan/model eligibility,
provider quota/latency and actual image understanding have not been measured here.
Linux fake-child checks do not certify native Windows/macOS process behavior.
Interactive Mac, ongoing whole-screen understanding, physical pen, audio/video,
Notability import and full product acceptance remain unverified.

Protocol references: [official App Server](https://learn.chatgpt.com/docs/app-server)
and [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference),
cross-checked with the installed generated schema rather than assumed equivalent
to newer documentation. The separate app-owned SIWC route is not implemented or
mixed with Codex-managed authentication.
