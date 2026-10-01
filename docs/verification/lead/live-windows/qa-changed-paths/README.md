# Existing changed-path QA: integration and current-owner triage

Actual delivery `handoff_ec31e85d736c7661fbb4022aa0d2cb52` contains QA commits
`ad33e778a6b27d4724af9dbbe88d8bcf6e416b0a`, `a5c7a23` and
`eda32c2db1c211959772eb91934bc863fd34fa4f`. The intervening `5ae0901` is a normal
main merge, not a separate change to replay. QA's worktree was clean on inspection.
Lead review starts at `bf54ab2`; current Web/Native WIP remains untouched.

QA reports 86 offline tests of frozen **c44e620**, with before/first-release
controls. These are separate from current main, the new live consumer and Windows
GUI/device/provider acceptance. LIVE-00–13 remain NOT_RUN. Do not adapt every old
assertion or replay the old full campaign before the next product handoff.

## Decisions and current work

| Observation | Disposition / existing next owner |
| --- | --- |
| QA-SUB-09 receipt versus returned failure/uncertainty | Backend reproduces on current v1/live1 and repairs any remaining mismatch. Outcome, transport submission and cancellation confirmation are different facts; do not merely force equal strings. Missing completion cannot become a definite no-submission refusal. |
| QA-SUB-10 quota cause lost on fatal shutdown | Backend checks current typed live errors and preserves an authoritative reason with separate submission uncertainty. Old candidate evidence is not proof the current rich-quota correction failed. |
| QA-SUB-11 bounded request-ID ledger exhaustion | Current local code sets `exhausted` without a corresponding stream-loop exit; live also refuses at the cap. Backend fixes/reproduces lifecycle recovery without clearing IDs and weakening replay protection, automatic restart or request replay. Scoped Stop/cancel remains safe. |
| QA-SUB-12 stdout EOF while process lives | Current committed Windows class only listens to stdout data. Web folds transport-loss fencing, truthful pending outcomes and bounded own-child cleanup into its current live consumer; explicit later Check can recover. |
| QA-SUB-13/14/15 sign-in outcome wording | Web preserves refused URL and connector-loss facts in the existing changed path. The adjacent low-severity wording cases do not justify a separate campaign. |
| QA-SUB-16 explicit Check after uncertain prior child end | Retain Check through the real managed factory's exclusive state lock. `create_client` holds the lock across the owned lifetime; the stand-in does not exercise it. No bypass, automatic retry or claim that an old child was reaped. Actual Windows lingering-shim behavior remains unverified. |
| QA-SUB-17 automatic account-read ceiling | Retain bounded refresh, visibly unknown status and explicit Check. A later change invalidates the old account snapshot; do not invent current allowance or turn this into quota exhaustion. Widening this engineering default needs actual normal-traffic evidence. |
| QA-SUB-18 image encoding failure | Web makes current auto-focus capture/encoding failure visible with zero provider send, preserved original ink and restored interaction state. No silent unhandled rejection. |

Actual substantive handoffs (accepted, initially unread/execution_started=false):

- Backend `handoff_5a78e55d86951e7f1a32f25199b9d8ce`: one current-version
  receipt/error/exhaustion correction, existing connector/test paths only.
- Web `handoff_ff88e6690c5143da8897b2c24e59a822`: fold remaining consumer findings
  into current live/TTS work, preserving the prior two TTS corrections.
- Native `handoff_b9045f47ca6ef0c6bed5f7c5911cdd00`: inspect only its own reported
  lingering test children at the current test-cleanup boundary. Lead's sandbox
  process namespace could not establish current host PIDs; the QA report is not
  a confirmed live inventory. No broad kill, directory purge or unrelated work.
- QA reply `handoff_fd794043a20068a1b52853cbb6ff884e`: retain the historical results
  and wait for the exact integrated candidate/lease, without a second campaign.

## One changed-flow reservation, no current execution lease

The old selected-image one-call allocation is retired unused (QA reports 0/1).
The existing [request ledger](../../subscription-ask/request-budget.json) reserves
at most **five** potentially submitted ordinary image/text test actions: one
unattended whole-screen observation, automatic focus, typed follow-up, supported
spoken follow-up, and Stop/fence. This is a later phase engineering ceiling under
the user's bounded subscription-test authorization, not a user spending budget,
quota statement or additive unused legacy allocation.

Exact candidate and exclusive account/display release are still required. No
raw-audio provider test is included. If voice remains unsupported, its case stays
NOT_RUN and its slot is not reassigned. Count unknown/not-submitted test attempts,
no automatic retry, stop on quota/auth/capability/tool failure. Only generated
nonsensitive content; preserve the old app/profile and all private source records.
Source corrections and offline tests do not close the complete live journey.

## Integration and reproduction

Authored QA commits are integrated as `886ffd9`, `2a1b405`, `a1faa15`; the normal
main merge was not replayed. Independent bounded review checked source isolation,
recorded harness/tree hashes and invocation boundaries. Initial sandbox attempts
failed in `spawnSync git` during source export, before behavior; one normally
approved retry with unchanged tests then passed **21 app + 37 bridge + 28 backend**
checks. All three generated JSON artifacts are byte-identical to the committed
QA evidence. [Exact integration checks](checks.json) pin their hashes and all
unchanged integrated test/report files. No Windows, account, provider or audio
operation occurred. These 86 checks target c44e620, not newer main consumers.

Lead reconciled the plan's current paragraphs with the released shared transport,
the five-slot held allocation and configured-policy semantics. One real typed
direction-changing follow-up fits that allocation; extra history/cancellation
variants use stand-ins. No applicable behavior or unsupported voice gate was
converted to PASS.

Backend actual start `handoff_f3c10f90d356d469419280f1baa086ec` confirms current
source reproduction and correction work. It identifies the frozen v1 consumer's
inability to carry cause plus submission certainty. Lead response
`handoff_5a0f2ad9b4cf6be0d4f33ebe7fcce1c4` keeps v1 unchanged and retains EOF for
genuinely unknown completion; current live1 carries typed cause plus submission.
Generic JSON-RPC error alone must not become a known no-inference refusal. No
parallel legacy schema or message-text workaround is authorized.

Final bounded review found no integration blocker. LIVE-00 was also corrected to
require preserved old package/profile/authentication and a rollback path, not an
old app that is still open after the user explicitly exited it. Preserve the
harness limit: its internal bridge-helper self-checks include diagnostics beyond
the 19 gating helper assertions; the 86 test-file results do not establish every
internal diagnostic or every receipt branch. Historical commit-swap evidence was
inspected, not rerun. Actual Windows process/lock and device boundaries stay open.
