# Candidate06 manual approval phase — 2026-10-14

**Current delivery:** QA `58338a2` is independently approved by Support `7723f82`
and integrated as `05fbc0c` / `574df91`. Resulting-main checks pass **41/41**, plus
**11 independent wrapper scenarios and 2 validator cases**, with Node child-process
and write permissions withheld. These checks use injected time/process/file effects,
not Windows or account access. [Exact review and outputs](time-correction-review.json).

**Execution remains held for a concrete cleanup-budget defect:** the current native
timeout alone can consume the whole 600-second foreground cap. Support's mocked
1-second preparation + 600-second native case reaches cleanup at 601 seconds and
reporting at 603 seconds. No real timeout or resource leak was observed in this
probe. The same original QA correction is actually dispatched as
`handoff_b9b8ebe1097c10d063957708ce103660`: bound preparation, attached native work,
cleanup and evidence within one foreground budget, preserve guards and exact-owned
cleanup, and report unfinished steps/uncertain exits honestly. Support reviews that
exact delta next. Dispatch acceptance is not execution proof.

No fresh allocation or real action occurred: **0/4**; QA remains `default`, and the
manual phase is incomplete. Existing product `0ff325b` and Candidate06 payloads are
unchanged by the integrated ordering fix. Historical restart/refusal facts follow.

**2026-10-20 continuation:** the human explicitly resumed the same correction
after Windows Update interrupted QA. Both dirty source/test files are preserved at
QA `8aadd902`; the historical36/36 local result predates an unfinished review
correction. Lead sent one original-QA continuation, accepted as
`handoff_bc87bc62c67cf9e75e06c841d0735446`, without replaying an old command.
[Recovery boundaries and actual receipt](restart-continuation-20261020.json).
There is no fresh allocation or native run. QA remains in human-owned `default`
approval mode; Support reviews the eventual exact delivery before Lead integration.
Historical QA recovery `handoff_02025a10f728b7b4e9af5ea2e600f7f0` confirmed the first
batch by Read-tool inspection. The interrupted second edit is absent: add the
time check before preflight-conflict output and its separate conflict/control
tests. At that recovery checkpoint, focused validation, inactive template pin and commit
were pending; the delivered/integrated correction above supersedes that state.

**Preserved 2026-10-14 result: allocation retired without invocation.** Actual QA
`handoff_22c51753a5f634046671830260b451c9` reports zero wrapper calls, zero native
attempts and real **0/4**, with explicit DISPLAY and ACCOUNT RELEASE. No account,
display, Windows process or provider was used. [Actual result](actual-result.json).
Human-approved setup calls waited about35 and8 minutes; by07:13:31Z there was
insufficient reliable margin before the latest native start07:16:29Z. This is
neither a new tool refusal nor a product failure.

QA identified a source ordering defect: the wrapper consumes the one-use scratch
before checking whether600s remain. Same-task correction
`handoff_f4a4b4aa5414452aa1bdc8f002713e04` is accepted: check time with a modest
preparation margin before output/watch/scratch, recheck before scratch and launch,
preserve cleanup, and prove late-entry behavior with injected-clock checks.
Support reviews the exact delivery next; Lead then supplies a fresh allocation
with enough time for the observed human approval latency. No new native run is
dispatched. The manual phase remains incomplete and QA stays `default`.

Human decision `human-manual-qa-20261014:d8d9d05f4cc84e66abd1e1b6cc4de9ff` retains the reviewed600s native /60s session /4-action
nonvoice scope and explicitly changes only original QA to interactive `default`
permission mode. The operator's supported session PATCH/GET and runtime readback
are recorded in [decision evidence](human-mode-decision.json); Lead did not alter
settings. Human alone handles approval cards. No broad allow rule, alternate
executor or automatic approval is authorized. Previous refusal evidence stays
historical and its allocation is retired.

Historical 2026-10-14 read-only drift checks passed: reviewed Candidate06/wrapper/six payloads,
81-file stage, cached runtime,280-file connector/imports/digest. At06:25:05Z no
relevant process/port conflict was found. Other-owner Edge processes were untouched.
No product/account/display/audio action ran in those checks. QA still performs
current admission before its approved command, including unused scratch/profile.

## Retired allocation — do not execute

- ID `manual-live-20261014-c959a4bfcdfd4699baa8283a9ccc5934`
- Valid from `2026-10-14T06:26:29.497403Z` until `2026-10-14T07:26:29.497403Z`
- SHA256 `f1bff70a1cb51dedea8477e7fbe612cd0ed6071552f1c6c4cc5a04cb12763fbb`
- QA `sess_06a4c3cc6e214e96`; existing Candidate06, product0ff325b.
- One invocation only; four actions maximum; no retry, mic, sound, TTS, private
  screen, new billing, account/model change or global policy change.
- New output `docs/verification/qa/p0-13-live-0ff325b/execution-manual-20261014-01`.
- The60-minute reservation was intended to permit human approval latency; it did not lengthen
  the600-second native bound or60-second learning session. Waiting is not execution.
- Use normal Bash approval; no agent/operator may click accept. If the window
  becomes insufficient before launch, stop. A future fresh allocation requires
  proof the previous call did not execute; never replay an uncertain result.

## Restoration condition

[Structured phase state](manual-phase.json) remains incomplete. Restore only this
QA session to `auto` after actual result/accounting and owned cleanup/release
are received, Lead confirms no remaining manual step, and supported session state
shows no pending approval, active execution, queued phase task or active lease.
Silence, elapsed time, a single approval or temporary idle is insufficient.
Lead currently has no exposed supported session-configuration tool and will
provide structured completion for operator GET/PATCH/GET verification, not edit
runtime files or choose another interface. ai/Paperclip stay paused.
