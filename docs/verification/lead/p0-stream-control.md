# P0-08 stream control and outage recovery

2026-09-29 UTC. Lead implementation over main
`fc079e9a704acd0e5fe25e095f56e57a13d31f48`; release SHA and actual native handoff
are recorded in the post-release section once observed. This is a bounded executable
contract release, not production HTTP/auth/DB/device acceptance.

## Implemented slice

[Process control 0.2.1](../../../packages/contracts/process_control/README.md)
adds closed registration/current-state/stop/seal/withdraw schemas, pure helpers,
generated TypeScript/OpenAPI and compatibility fixtures. It requires explicit
`process.control.v0.2.1` capability and `process:control` scope. Capture batches/
ACKs stay 0.2.0 and default v0.1 files are unchanged, including the frozen README.
The new package and ADR/task board supply the discovery links.

A stream ID is already its incarnation. Registration needs a fresh trusted start
bound to the exact ID and request-era authorization/membership revisions. Stale
starts cannot borrow a subsequent grant. Stop is monotonic; an unknown boundary
blocks transmission until independently resolved and sealed. Known boundaries
cannot contradict committed same-stream evidence; zero is not a drained queue.
Withdrawal blocks live and historical transmission; originals/deletion remain
separate. Pure state mapping reuses capture 0.2.0 without changing its validator.

The specified HTTP routes require bearer auth, exact current membership and
version checks, CAS and idempotency. Service replay must return **current** state,
never cached live state after a stop; these transactional replay/authorization
obligations are documented, not implemented by this package. No typed upload,
public grant issuance, provider or presenter/diagnosis/export capability is added.

## Review and focused verification

The bounded read-only code reviewer first reproduced a missing request-era
registration fence; lead added required revisions and exact trusted start ID.
On review advice, committed sequence floor became a required argument. Reviewer
then reported no remaining code blocker, **33 tests passed**, generation and
standalone TypeScript passed, and **eight independent rejection probes** passed.
The [saved complete review](p0-stream-control/independent-review.md) preserves
its finding, corrections, checked hashes and service/device limits. The final
README-only correction clarifies boundary zero; no reviewed code changed after it.
This is an independent code-review subagent, distinct from role 06's pending QA.

Lead executed:

```text
.venv/bin/python -m pytest -q packages/contracts/tests services/api/tests/test_capture.py tests/e2e/test_p0_08_process_v2_capture.py
395 passed, 2 xfailed

.venv/bin/python -m packages.contracts.generate_types --check
.venv/bin/python -m packages.contracts.generate_openapi --check
.venv/bin/python -m packages.contracts.process_v2.generate --check
.venv/bin/python -m packages.contracts.process_control.generate --check
.tools/node-v24.21.0-linux-x64/bin/node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
All exit 0.
```

[Final focused output](p0-stream-control/focused-check.txt). Both existing low
capture invariant strict xfails remain open; no skip or new expected failure was
added. The initial integrated run was **394 passed, 1 failed, 2 xfailed** because
a new link changed the byte-frozen v1 README. Lead removed only that new link,
kept the original bytes and reran this focused suite successfully. The old pins
were not relaxed. Independent capture pins are read from committed fc079e9, not
computed from the current candidate. Root generation checks include the new slice.
No full app suite was rerun solely for this isolated additive contract.

Final precommit checks passed: all four source/English hash pairs (eight files),
local link targets in changed documents, all four generation checks, TypeScript
and `git diff --check` (exit 0). No new DB/device/provider test was run here.

## Recovered work and actual coordination

Recovery inspection found clean main fc079e9 and retained worker heads: Backend
17a7dc8, Learning 1504509, iOS 7ba5a15, Web 8d67aaa, QA 324a1c4 and Support
7cb9057. Saved lead review/test output was read before continuing; old subagent
identifiers were not treated as proof they remained alive. Finished work was not
replayed. A bounded missing review of this new control candidate was run and its
output saved above.

The configuration operator reports WSL/desktop/server/keepalive/quota timer and
the existing dedicated PostgreSQL restored. An abandoned empty Claude OAuth
refresh lock was narrowly quarantined; later QA Bash/ToolSearch establishes model
access. These runtime statements are operator evidence. Lead did not reconfigure,
purchase, poll quota or launch duplicate Web/QA recovery turns. Neither startup
success nor working Chats proves the interrupted product review has finished.
Native Chats list and inbox succeeded; all six worker routes remained granted.

The following existing-task continuations were actually sent before the next
interruption, then each owner returned an actual resumption message. Baseline
for both is fc079e9. No new task ID or second archive/identity/protocol is created.

| Owner/card | Actual assignment ID | Actual resumption reply / meaning |
| --- | --- | --- |
| Learning P0-05/P0-07 | handoff_42b04ddaf5650d23b1608eb87970719b | handoff_97e53df22f2b5cbc0570285dd8e8666d: prior turn only inspected; clean team/learning 1504509, resuming the same ArchiveSnapshot implementation. |
| Backend P0-04/P0-07 | handoff_583048f488fb4c7ba570d4b957130322 | handoff_a000a9400f4e090c823a394c65aeecdd: prior turn only inspected; clean team/backend 17a7dc8, resuming the same atomic export implementation. |

Learning implements a validated owner-scoped in-memory ArchiveSnapshot that can
consume legal v0.1 provenance through existing retrieval/context, while keeping
the strict fixture adapter, 187 originals, queries/labels/ranking/failure evidence.
Backend atomically exports detached sources/frames/observations/artifact bytes
under existing actor authorization/transaction and ownership/deletion checks.
Each can implement its own part independently. Actual composition and review
follow their deliveries; these resumption replies are not completion evidence.

At the commit boundary, actual recovered deliveries arrived and were read with
stable native read keys (no acknowledgment replies):

- Web `handoff_21e6149382342162f199f5e5e32545f4`: `7ee1217` → `8d67aaa` →
  `db7400f`, existing P0-12 repair. Lead bounded review started; not integrated yet.
- QA `handoff_a96917cd5bf3c5ccfffcc102a79aad89`: `bd79ca4`, capture/QA-14/context
  report and tests. Confirms reported QA-14 paths in process, raises additional low
  findings; lead reviewing. Separate output-repair retest continues under its old
  assignment, without duplicate dispatch.
- Learning `handoff_bcf3a33e814d4ac76684dbc382c75961`: `1eff66e`, ArchiveSnapshot
  implementation, owner reports 159 focused tests. Lead bounded review started;
  not integrated yet. Existing 187 originals preserved in owner evidence.

These substantive Web/QA results establish actual resumed role execution. They
do not certify device/provider capability. Reviews use saved results and changed
scope; completed worker batches are not replayed.
The prior iOS and Support deliveries remain completed within their stated limits.
Support stays on demand; an unavailable Mac/provider is not a blocker to this
lead contract or the two owner snapshot implementations.

## Next owner and evidence boundary

After its current export segment, Backend P0-09 implements the new **internal**
persisted registry and resolver using this release: atomic exact-ID start grants,
current membership/generations, registration/idempotency/current-state replay,
stop facts and committed floor, immutable closed incarnations, mapping to existing
capture ingestion, and both race orders against deletion/revocation. Backend owns
any additive migration; no public start-grant API/typed upload/provider activation.
Use the existing dedicated DB for necessary new transaction checks, without
recreating it or repeating the completed 17a7dc8 contention batch. The exact commit
and bounded handoff are recorded below when accepted.

Lead still owns subsequent typed artifact and attempt/presentation contracts.
QA remains independent; no self-check substitutes for that role's result.
R36/R51/R52/R58 and AUDIO-14 receive a local foundation only; real stop, complete
capture, R59/A44/A46, audio/AI receipt, G6/G7 and full P1 remain unverified.

## First release and authority hardening

First milestone `3636dd6db1e337671892d65b8f5d7919d452986a` was ordinarily pushed;
`git ls-remote origin refs/heads/main` returned that exact SHA. No force/history
rewrite or runtime setting change was used.

The arriving QA report exposed scalar/dict authority collections in the **older**
capture helper. Lead checked the analogous new control path and corrected it
before handing the formal baseline to Backend: trusted scope/capability values
must be actual frozen sets of strings, rejecting substring/key membership.
Six new cases exercise registration, commands and capture mapping. The same
focused integration command now passes **401 tests, 2 existing strict xfails**
([log](p0-stream-control/focused-authority-check.txt)). The bounded independent
follow-up passed eight focused tests and all 18 direct malformed-authority probes
([review](p0-stream-control/authority-review.md)). v1/capture 0.2 bytes remain
unchanged; their historical authority-type xfail is not silently marked fixed.

Backend's actual snapshot delivery arrived as
`handoff_fe9e41edd32836e37d09483c0adc58a1`, commit
`1596db66803ff1e93026998b12efefd83dee7db1`. Owner reports 125 portable tests and
four real PostgreSQL groups, with observed lock wait and cleaned synthetic actors.
Lead is reviewing code and the Learning composition; no integration/device/G6
claim follows merely from receipt. Learning's subsequent bounded context repair
was actually accepted as `handoff_ca8db1656947f400557333cfcaeb57e2`: truthful
eligible omission counts, observable fork labels with inaccessible originals kept
private, cycle/input guards and documentation of unchanged fail-closed current
semantics. Its acceptance is not proof of implementation. The full QA fuzz/budget
batch is not reassigned. Existing owner paths, originals and protocol stay intact.


Final formal control baseline **9a861d05141bfbf9bdf6465d96392ee047edc408** was
ordinarily pushed, then `git ls-remote origin refs/heads/main` returned the same
SHA. The substantive existing P0-09 Backend implementation handoff was accepted
as `handoff_b89501b25fff47ce5f8452665468a033`, explicitly after/preserving its
snapshot export. It supplies the exact baseline, trust/transaction tests, new QA
findings and no HTTP/provider activation. Accepted/unread/execution_started=false
is delivery evidence only. [Exact body/receipts](p0-recovered-deliveries/dispatches.json).
Subsequent recovered delivery review/integration continues in
[the integration record](p0-recovered-deliveries.md); no acknowledgment loop.
