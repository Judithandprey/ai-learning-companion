# Subscription failure outcomes and request-ledger retirement

2026-10-01. Backend correction for QA-SUB-09/10/11 within existing
P0-04/09 and Windows live transport. Assigned main baseline:
`bf54ab2c079ab21fd279f78ec35c328892f2c6e6`; worker parent:
`35d0defce9c42e77ec0d029082e2a9957a96b7a2`.
The three connector production files and current fake child were identical
between those revisions. Requirements/workflow updates were read at the assigned
revision without replacing worker history or merging unrelated files.

The outcome is recoverable, truthful connector failure: an exhausted request-ID
ledger ends its foreground stream and reaps its owned child; a later explicit
Check can create a fresh owner without replaying a question. Error cause,
submission facts and missing completion remain separate. This supports main
§3.8/7.1, current subscription-first decisions, Stop/revocation controls and the
existing quota restrictions. It does not change authentication, models, budgets,
shared contracts, the managed factory or source archives.

## Current reproduction, not an inherited QA pass

QA's report at `eda32c2db1c211959772eb91934bc863fd34fa4f` describes frozen
`c44e620`; its historical harness is not used under this code. We reused this
revision's production bridges/RPC and its existing synthetic child.

- The initial ledger regression run produced **4 failed, 2 passed, 2 deselected**
  in 3.19 s. Both versions accepted 4096 distinct metadata IDs, retained duplicate
  refusal, then stayed alive after overflow. Legacy Stop/cancel was rejected at
  the cap. These were the initial cases, before additional post-submit cases.
- Six new outcome cases were run with only the three production modules loaded
  from `git show bf54ab2:<path>` into an isolated Python process. Current fixtures
  and fake child were retained; no files were replaced. **6 failed, 14 deselected**
  in 0.61 s: both versions recorded `failed` instead of `uncertain` for disconnect,
  generic start error and a nonterminal usage-limit notification.
- Existing tests also asserted the old timeout/receipt behavior. Their expectations
  were corrected to preserve uncertainty, with new public-stream and receipt
  regressions providing the behavioral checks.

## Result mapping

| Actual evidence | Private receipt outcome | Public behavior |
| --- | --- | --- |
| Local/auth/preflight refusal, no turn write | `not_submitted` | Existing fixed refusal; live `submission:not_submitted`. |
| Valid failed terminal event | `failed`; original terminal status retained | Existing typed cause, e.g. v1 `quota` / live `allowance_exhausted`. A written/ACKed request remains live `submission:submitted`. |
| Successful write/ACK but disconnect, missing completion, or generic RPC error | `uncertain` | V1 ends with EOF. Live preserves the applicable sanitized code and actual `submission:submitted`. |
| Turn write/drain outcome unknown | `uncertain`; no invented ACK | V1 EOF; live `submission:unknown`. |
| Structured usage error notification with `willRetry:true`, no terminal completion | `uncertain`, terminal status absent | V1 EOF; live preserves `allowance_exhausted` and actual submission separately. No retry is initiated. |
| Explicit Stop/cancel | `cancelled` locally | Existing interruption confirmation/uncertainty remains separate; it is not proof of no remote usage. |
| Internal ledger retirement after submission | `uncertain` | No fake user cancellation and no late answer. Stream ends and owned child is reaped. |

`submission` describes transport, not successful inference or confirmed billing.
Private `written`/`acknowledged` facts remain intact even when completion is
unknown. A late `completed` or cleanup `interrupted` event stays in the receipt;
neither retroactively supplies a timely answer nor authorizes displaying it.

The legacy v1 consumer treats ordinary errors as refusals and has no independent
submission/unknown-result field. Per Lead's same-task clarification, a genuinely
unknown outcome retains EOF semantics. V1 cannot also expose the typed cause on
that path. No notification, schema field or human-message encoding was added to
work around this frozen boundary. The Windows live1 consumer remains responsible
for showing its existing code and submission fields independently.

A generic JSON-RPC error reply does not prove no backend work occurred. No
pre-inference rejection classification was invented from `-1`, a `-320xx` code,
HTTP status or provider prose. Such start errors retain actual written evidence
and use existing bounded cleanup/reaping, with uncertainty. A conclusive
no-turn/no-inference class would require separate structured evidence; it is not
claimed by these tests.

## Implementation and lifecycle

The existing bridge now exposes ledger retirement through an `asyncio.Event`
observed by the same foreground `run_stream` loop. IDs are neither cleared nor
rotated. A fresh request beyond the 4096-entry cap receives the existing-version
`unavailable` response (live: `not_submitted`). Scoped Stop/cancel cleanup can still
run at that boundary; active and queued work are fenced before shutdown. The
existing reply grace and bounded owned-child cleanup remain in use. There is no
automatic new connector, session renewal or request replay.

RPC retains a sanitized failure code and independent outcome before waiting for
interrupt/reap. It retains a separate metadata-only error, without a raised
exception traceback that would hold prompt/image stack frames. This also covers natural timeout, whose cleanup previously began
before the unknown outcome was recorded. When cleanup exceeds the reply grace,
live still emits the stored cause/submission and finalizes the receipt correctly.
Retirement is distinguished from user cancellation; current scheduling, focus
reservation, quota facts and Stop semantics stay intact.

## Verification

The final affected suites ran in the foreground using normal exact-command
approval for the existing pipe/thread shutdown tests:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/worker/connectors/tests/test_chatgpt_rpc.py \
  services/worker/connectors/tests/test_chatgpt_local.py \
  services/worker/connectors/tests/test_chatgpt_live.py \
  services/worker/connectors/tests/test_chatgpt_live_stream.py \
  services/worker/connectors/tests/test_chatgpt_request_ledger.py \
  services/worker/connectors/tests/test_chatgpt_failure_outcomes.py --tb=short
```

**419 passed in 21.63 s.** A final metadata-retention correction and traceback
assertion were then verified with both new files: **32 passed in 3.52 s** using
the same Python/pytest command restricted to those two paths.
The two new files contain 12 ledger and 20 outcome
cases. They include exact 4096-ID/replay checks, both versions, submitted and
unsent controls, real pipes to the current fake child, explicit new-owner checks,
quota notification versus terminal failure, unknown writes and cleanup beyond
the reply grace. No historical QA synthetic child was substituted. Independent
read-only review found the natural-timeout/grace gap; its regression is included.
`git diff --check` passes. No shared schema/factory/auth/dependency changes.

Account/provider/model/device calls: **0**. All child processes in these tests are
owned synthetic Python processes. There was no real Codex launch, Windows GUI,
microphone/screen acquisition, reset-credit consumption or paid-provider call.

Next owner: Lead reviews/integrates the exact correction; QA folds the relevant
cases into the one changed-flow pass at the exact release. The Windows owner
retains live1 cause/submission presentation and its own lifecycle fixes. Legacy
v1's typed-cause limitation remains explicit. Audio source investigation is
already complete; this commit adds no ordinary-audio adapter or attempt and
claims no device, provider or full-companion acceptance.
