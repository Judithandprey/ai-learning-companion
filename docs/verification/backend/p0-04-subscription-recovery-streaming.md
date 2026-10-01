# Subscription recovery and streaming bounds — QA-SUB-02/03

2026-10-01 UTC. Bounded continuation
`handoff_ed1e57220ac00498f6bb1423c5c64217`, assigned main
`250f8290cc0a16f8a203b698aa8f2d349b8f0187` and released candidate
`3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e`. Read QA delivery
`9abf58797c7c779266651eca333424846c7a04dd`:
`docs/verification/qa/p0-13-subscription-ask-windows-3e4b406.md` and its
`source-review.json`, including both complete failure findings.

The four local connector modules matched the released candidate before editing;
the worker branch and unrelated work were preserved without a baseline reset.
Current AGENTS/TEAM/role/workflow and the relevant R38/§3.8/G4, decision and
source/English acceptance clauses are unchanged from the last refresh. Current
ADR 0003 includes the previously delivered exact Mac pin; its closed v1 IPC,
explicit ASK, no retry, Stop and uncertain-outcome rules still apply.

## Reproduced before correction

QA-SUB-02: the real `run_stream` and `SubscriptionBridge` over the RPC tests'
synthetic child returned `quota` after its `retry_error` notification, but the
outer stream stayed blocked reading while the inner client was fatal and its
child gone. The new bounded stream-completion assertion failed: **1 failed in
1.21s**. Test cleanup reaped the synthetic child. This reproduces the permanent
stale-error state without a real account, model or product state.

QA-SUB-03: three new synthetic-child cases each failed with `protocol_error`
before correction: 9000 agent-message deltas followed by a 27000-character
completed answer; 9000 reasoning-text deltas; and 9000 reasoning-summary deltas.
The old 4096 counter charged every on-thread notification, including discarded
deltas and the final completion. No actual provider frequency is inferred.

## Recovery boundary

An irrevocably unusable inner client must end the outer private stream after
bounded error/receipt completion and owned-child cleanup. It does not replace
itself or replay a question. Existing request and Stop fences are not cleared
inside a live bridge. Terminal pipe/exit observation lets the desktop mark the
connection unavailable; a later explicit user Check creates a fresh child.

Fatal ASK output is suppressed, including its ordinary error envelope: the
Windows client interprets a normal error as a known refusal, whereas loss of the
pending transport explicitly preserves uncertainty. The private receipt still
records its transport facts and local failure. Connection/login errors and
healthy nonfatal ASK errors retain their compatible v1 shapes. No new public
status or automatic inference retry is introduced.

The inner terminal event means unusable, not already reaped. It wakes the outer
stream even without another parent line. The actual event is checked before
admitting input and before binding/publishing an answer, including after receipt
completion. Admitted work gets at most one second to settle before the existing
eight-second owned shutdown bound; pipe flushing keeps its existing 0.2-second
limit. Terminal cleanup does not set a user-cancel flag. A grace-expired pending
request remains uncertain, while a reserved coroutine that never ran remains
not submitted; explicit cancel/Stop retains its own fence.

Read-only review of the exact released Windows `subscription.ts` confirms child
exit clears its live child and pending requests; `check()` can then create a new
one. Its existing recovery test covers no autonomous restart/ASK retry followed
by an explicit Check creating child #2. The desktop's stopped-session set stays
on the same application instance across replacement. No Windows production
change is required for this correction. This source review is not a new display
test or evidence for a macOS subscription client.

Backend also executed that one exact released client test from seven unchanged
Git-exported TypeScript files in a fresh temporary directory, using the installed
Node 24.21.0 runtime:

```sh
node --test --test-isolation=none --test-name-pattern='no answer in time, or the connector lost' tests/subscription.test.ts
```

**1 passed**, 579 ms overall. This uses the client's in-process synthetic child;
it starts no Windows application, WSL connector, real account or provider.
The temporary export was removed. This is fresh targeted compatibility evidence,
not a repeated full client suite.

## Streaming boundary

Discarded text/reasoning deltas must not consume the state-changing event budget.
They remain subject to received-wire-byte and time limits, including unrelated
thread, empty, unknown and response frames. The final answer still comes only
from authoritative completed items, with the existing 32000-character bound.
Tool requests/forbidden activity remain refused even on unrelated threads.

The independent limits are 12 MiB per input line, 32 MiB total received wire
bytes during an ASK (including its metadata preflight), 4096 turn/item lifecycle
notifications and 4096 items in a completed turn, plus the existing final-text,
RPC/turn and cleanup deadlines. The 32 MiB receive allowance is an engineering
bound: roughly 24 MiB accommodates 32000 one-character deltas at about 768 bytes
of framing each, with 8 MiB remaining for reasoning/metadata. It is not a claim
about every provider's fragmentation. Discarded deltas are not reconstructed or
stored. The reader yields after 64 lines or 256 KiB, including when idle, so
buffered floods cannot starve cancellation or deadline tasks.

Focused RPC verification after correction: **109 passed in 6.20s**. Cases include
the three reproduced failures, 32000 single-character deltas, 9000 empty deltas,
foreign-thread/unknown/repeated-reply byte exhaustion, lifecycle/per-line caps,
forbidden tools/requests, missing final completion, flood timeout/cancellation,
and deterministic buffered-reader scheduling. Test byte caps are lowered where
appropriate to avoid generating large fixtures; real byte accounting executes.

## Final verification and review

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/worker/connectors/tests/test_chatgpt_rpc.py services/worker/connectors/tests/test_chatgpt_local.py --tb=short
```

**189 passed in 11.64s**: 109 RPC and 80 bridge/lifetime checks. Only the two
affected suites were run together; no inherited full-suite count is claimed.
The new real foreground pipe test holds the parent stdin open, observes outer
EOF/exit after the fake inner fatal, and verifies the owned fake child was
reaped with one turn recorded. The explicit fresh Check fixture sends zero new
thread/turn requests. Startup timeout/protocol failure, idle EOF, healthy
nonfatal reuse, Stop/late output, simultaneous terminal/input readiness,
terminal-during-finish, grace expiry and reserved-but-not-run receipts are covered.

An initial default-sandbox bridge run reported **78 passed, two pipe tests
blocked**. This environment's asyncio cross-thread wake/self-pipe restriction
was already measured in the first connector delivery. The exact same bridge
command under normal `require_escalated` approval passed **80 in 4.70s**, without
changing implementation, assertions, timing or permission settings. The final
combined run above used that same normal approval mechanism. The failed default
run is not counted as a pass.

Independent read-only review cleared the production streaming, terminal and
receipt changes after the races were corrected, and confirmed compatibility
with the exact released Windows lifetime/selection/Stop fences. It found no
blocking issue within QA-SUB-02/03. This was code review, not independent device
or provider acceptance. `git diff --check` passed.

PONYTAIL LITE: reuse the existing private process lifetime and protocol reader;
no new retry, transport, queue, credential store or recovery framework. All tests
use synthetic child processes and temporary fixtures. No real Codex execution,
account/login/model calls, live product-state change, provider quota spending,
desktop input or hosted campaign is part of this pass.

Lead integrates the tested leaf and releases a corrected candidate. QA then
rechecks terminal loss → explicit Check and the retained Stop/uncertainty controls
on that candidate before its separately allocated first image attempt. Source
and synthetic tests do not establish login, image understanding or full G4.
