# Windows admission repair: review preparation

Historical status (2026-10-07): **PREPARATION ONLY — exact QA repair SHA not yet supplied; no verdict.**
Update (2026-10-08): the exact repair arrived; see the
[78d6de0 review and concrete HOLD finding](admission-review-20261008/README.md).
The preparation below is retained as the earlier baseline record.
Lead card: `handoff_0756b30e9706966dc1377b8b3d5be746`.
Read-only baseline: `2d4fee9cdfc6bea6662b226b6b60cbbc9076b3de`.
This is one continuation of SUP-01 / P0-07 / P0-13, not another discovery or test
campaign. No native process query, product launch, display/device/account/audio
access, test execution, cleanup or signal is part of this preparation.

Lead relays new user-supplied local evidence identifying the previously observed
process as another AgentsDock development client. That is later supplied evidence,
not a result of Support's earlier probe. The earlier unknown classification and
discarded first-refusal snapshot remain unchanged. Personal launch paths are not
copied here. Existing Astra settings and PONYTAIL LITE remain unchanged.

All file/line references below describe the exact baseline and must be relocated
against the eventual repair. AGENTS, workflow, support role and affected
requirements are unchanged from the previously read `4388217`; TEAM's operator
restoration update was read. Existing R03/R35/R36/R59/A44 and privacy/ownership
boundaries remain in force.

## Relevant call graph

1. `tests/e2e/windows/qa_tts_output_candidate.mjs`: `prepareTtsCandidate` assembles
   the isolated manifest/payload through `buildVisibleCandidate`;
   `checkTtsCandidate` checks source, payload, stage and static file identity.
   `qa_tts_stage_check.py` performs file inspection only. A static receipt is not
   a display lease or application pass.
2. `qa_run_tts_candidate.mjs:55` validates an exact active allocation. Lines
   74–106 check fresh output, candidate/payload/source pins and stage identity,
   then reject consumed scratch. Lines 108–124 obtain two separate metadata
   snapshots and reject occupied ports or **any non-child Electron launch**;
   `summarizeTtsPreflight` at lines 28–52 uses the same broad rule for redacted
   refusal evidence. Both actual predicate and saved explanation need review.
3. Lines 127–156 bind cleanup expectations, consume fresh scratch, copy pinned
   payload, parse the emitted runner, recheck allocation and permit one bounded
   invocation. The generated runner comes from `qa_visible_candidate.mjs`, not
   the generic PowerShell source alone.
4. A **second broad guard remains in the native runner**:
   `qa-electron-runner.ps1:195,235–240` uses `Foreign-Electron` and `AllowForeign`.
   Repairing only the outer wrapper leaves this gate. Review emitted bytes and
   actual call order; broad `AllowForeign` is not a substitute for scoped admission.
   `Start-App:216–224` supplies profile through `LC_USER_DATA`, while launch
   arguments carry stage/debug-port/address. A profile is not necessarily visible
   as a command-line argument; absence of such an argument is not proof of safety.
5. `qa_visible_candidate.mjs:23–36` removes generic force cleanup and inserts
   display/surface guards before browser/product launch and capture Start.
   `qa_display_admission.ps1` preserves topology/DPI, exact owned window,
   foreground, generated content and all 16 card/corner checks.
   `qa_edge_placement.ps1:73,101,111,141,153` preserves normal-band Edge placement,
   owned roots, control/overlay ownership and covered-point refusal. Relaxed
   process admission must not relax these controlled-surface checks.
6. Wrapper lines 164–170 call `releaseOwned` only after a native attempt, with
   complete observations, exact expected launch arguments and per-snapshot
   creation lower bounds. `signin_cleanup.mjs:82–91` distinguishes owned,
   unresolved and foreign; lines 106–172 track identity and bounded cleanup;
   lines 228–239 revalidate PID, exact CIM creation ticks, executable and full
   command while holding the process before any signal. Admission relevance must
   never become cleanup ownership. The wrapper retains scratch and requires an
   explicit later display-release report.

The generic runner's `endHungApp` PID-force branch at lines 580–590 is absent from
the fixed generated steps; preserve that exclusion. Complete cleanup snapshots
must retain a previously owned identity even if it later appears as a child or
becomes unreadable. Foreign rows may be reported, but never promoted into owned
or signalling lists. A separate read-only reviewer corroborated this call graph;
no tests or native actions were performed by either reviewer.

## Changed-path review when Lead supplies the exact repair

- Evaluate genuine stage/launch/profile/port conflicts, including an occupied
  port whose owner is outside the Electron rows. Shared runtime or process name
  alone must not make a readable unrelated client an owned process. Do not add
  a special exemption keyed to the observed foreign PID.
- Preserve uncertainty for unreadable, stale or reused identities and failed
  observations; test exact parsed tokens rather than path/port substrings.
  Check both wrapper and native admission, plus sanitized refusal consistency.
- Exercise unrelated readable Electron alongside the candidate through the
  injected lifecycle. It must never become a cleanup target. Preserve remembered
  identities that cease to revalidate, held-process checks and unknown cleanup.
- Check fresh isolated profile/scratch, new candidate/payload/source pins and
  exact allocation binding; no consumed allocation reuse. Preserve the 140-second,
  32-step, AI-disabled scope, no retries, no account/audio/mic/TTS expansion.
- Review actual generated runner guards and placement/drag cleanup, including
  failure before launch and refusal evidence creation. Do not infer safe display
  content from unrelated-process classification.
- Run only relevant offline checks after the exact delta arrives. Existing
  `test_qa_run_tts_candidate.mjs` uses injected Windows/runner/filesystem calls
  and explicitly withholds Node child-process permission. Extend only for actual
  gaps; no repeat native observation or broad application suite.

Next dependency at preparation time: Lead supplies QA's exact committed candidate. QA retains fixes;
Support will return one evidence-backed approve/blocker on that delta. No branch
polling, read acknowledgement or interim approval is required.
