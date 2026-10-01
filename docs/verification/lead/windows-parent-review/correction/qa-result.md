# Independent Windows parent result and next correction

Candidate: `c4c84a57bb7752d2bdbeeff8a0482711cae8fb38`. QA delivered
`7b1b24edb17e38c0ea8d80fe7ceef8b2a76207da` in native message
`handoff_9b3da39a99a880434cea8512052342bc` at 2026-09-30 23:52:09 UTC.
It integrates as `3895b7d`. **NOT ACCEPTED as-is: 13 pass, 2 fail.**
The author's commit title says “Accept”, but the actual report and findings
explicitly withhold acceptance; the title does not override the evidence.

[Full QA report](../../../qa/p0-13-windows-parent-c4c84a5.md) and retained
sanitized evidence distinguish real Windows display/local test-service execution
from DevTools-injected pen input and the disconnected product AI.

Lead's read-only audit verified:

- QA merge `dd6c22f` has exactly the candidate's Windows, services and contracts.
- Nine executed harness files match their recorded SHA-256; `analyze_parent.py`
  differs exactly as disclosed by QA's post-run analysis correction. This is not
  claimed to be the originally executed analyzer.
- All 248 recorded runner steps completed, with no failed step or aborted run.
  The independent result retains both failures.
- Readback records 12 + 3 frames, 24 + 6 raw/composed image comparisons and zero
  mismatches. Immutable ink and read-only database evidence are retained.
- The watcher ended at 23:33:02.703097 UTC with no owned host remaining. QA
  explicitly released the display and owned processes. Cleanup records only the
  proven test actor, 125 documents to zero. Lead did not rerun the DB or GUI pass.
- Changed Python files parse; changed JavaScript files pass `node --check`.
  Retained JSON parses and contains no embedded images, bearer or DSN strings.

Two same-owner repairs remain:

1. **QA-WIN-03:** link-enabled app remains alive after all windows close,
   reproduced five times; default-off control exits. Inspect the real Electron
   `will-quit`/asynchronous re-quit flow. Preserve the bounded Stop, repeated-quit
   fence and originals, then prove actual clean exit and same-profile relaunch
   without killing the old process. Existing relaunch evidence required QA to
   end the hung process and does not establish clean exit.
2. **QA-WIN-04:** disconnected/stored-zero status is truthful, but ASK/header
   still assert storage. All user-facing storage claims must follow actual
   outcomes or clearly describe a conditional capability.

One substantive repair was accepted by the Web route as
`handoff_9ceac232576c4ed6db9eb82c817b40fb`, replying to its original delivery.
The receipt initially says unread/`execution_started:false`; it is dispatch,
not proof of execution. Scope is `apps/windows` and owned Web evidence. Next:
Web delivers the focused repair and display release; Lead reviews/integrates;
QA retests only quit, clean relaunch and failure UI on the new exact SHA.

No repeated full campaign, provider activation, user-preview database operation
or service restart is authorized by this correction. Real AI, physical input,
macOS interaction, audio, Notability and both complete §7.1 gates remain open.

Conditional QA retest was accepted as `handoff_47984d838c7d001ba869d5b2f3fac80a`; it waits for the corrected exact release and Web display release. A subsequent read-only owner worktree inspection finds Windows source/test modifications on5871981, retained untouched; this is observed work in progress, not a delivered or verified repair.
