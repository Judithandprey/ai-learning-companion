# Candidate09 delta review — 2026-10-20

**READY for Lead's offline source/pin review. Not ready or authorized to execute.**
Reviewed QA `76606babfacabf3558ee3ee3aa0cb7d1ceedec63`, parent `21668dd`,
against consumed Candidate08 and released connector
`260884e670c25da7ab8d0360cc8355f90c3697b6`.
No concrete defect was found in the assigned delta.

This is the bounded P0-13 continuation from
`handoff_c8970b75ded7832da300e51c843029ab`,
idempotency `lead-candidate09-review-76606ba-20261020`.
Current policy/requirement files are unchanged between previously refreshed
Lead `4f82fbd` and `260884e`. Existing R35/R36/R38/R59/R60,
§7.1/§7.3 and G4/G5 boundaries remain.

## Exact identity and guard preservation

The [independent read-only audit](../../../../tests/probes/support/candidate09_delta_audit.py)
verified all **six payload hashes and 21 source pins**. After replacing only
the new scratch basename and connector-copy path with Candidate08's values,
every payload is byte-identical to Candidate08:

| Payload | Candidate09 change |
| --- | --- |
| `runner.ps1`, `steps.json`, `admission-live.json` | Scratch path only |
| `sub-live.json` | Connector copy path only |
| `surface.html`, `admission-checker.ps1` | None |

The manifest has only the documented derived path/payload hashes, connector
commit/copy and generator hash changes. The entire wrapper outside lines 24–27
is byte-identical to parent `21668dd` and released `260884e`, preserving its
diagnostics reader and all source/display/identity/time/cleanup/accounting guards.
The command, inactive template, wrapper, manifest and payload pins agree.
[Full audit result](delta-audit.stdout.json).

- Candidate SHA-256: `9dad7058fa43becf5c76f76f816e85646a014af8a6398e377d33f62c2e73c5cf`.
- Wrapper SHA-256: `7023257e0739787744a3a60a36cf5cc038e1f10ebdeb91b0e9dedda9c9ef3594`.
- Inactive template SHA-256: `d7f51a719c43889a7e5ccffcfc8e8b30b9e039a4b526ae7efd62a07d2b17a7c4`.
- Product remains `0ff325beadb7c689244610307b6aa16d638fd2e6`, 81 files,
  tree `081a130c1f492c98d78fec8d67463a36c80126ea1ca72eede99d043ca616a46a`.
- Codex remains the pinned official `0.158.0` executable/digest; Python,
  `state_dir: null`, Ubuntu and user identity are unchanged.

The new scratch `lc-qa-live-nonvoice-a4a1c3351f934979ac83776c01e9decc` and
copy `/home/agentsdock/.local/share/lc-qa/subscription-source-260884e670c2-nonvoice-09`
were absent under existence-only checks, including dangling-symlink detection.
No old payload or runtime directory was overwritten.

## Connector compatibility

Read-only source comparison confirms unchanged `packages/` tree
`4a0edf80e6d029e344b6775b0dd196062ea746bd`; changes within copied `services/`
are confined to `services/worker/connectors`. The request-preparation and launch
configuration paths remain compatible. The released receipt writer equals the
reviewed `4e840a4` version. Writer and unchanged reader agree on all nine diagnostic
fields, complete field sets, nullable enums/boolean, 28 failure codes,
`4096²` count bounds and phase-sum invariant. The already-reviewed corrected
close introduces no additional child process; its review was not repeated.
This establishes source compatibility, not import success in an uncreated copy.

## Executed checks and limitations

- Exact saved candidate regenerates from its sources, including all 63 steps.
  [Result](regeneration.stdout.json) uses the historical committed static-stage
  receipt; it does not freshly verify the installed stage.
- **Two selected portable tests passed**, covering Candidate08→09 delta and
  connector/product identity separation. [Output](selected.stdout.txt).
- **Three pure template cases matched expectations:** saved inactive template
  refused; only seven Lead-owned fields filled in memory accepted; old driver-08
  template refused. [Result](template.stdout.json). No allocation was written.
- Node 24.21.0 ran with read grants only, no child-process or filesystem-write
  permission. All final check exits were 0, with empty stderr.

The first three Node invocations failed during module loading because this
review's narrow Git export omitted one historical candidate JSON dependency.
No selected test/validator ran. Adding that exact `76606ba` Git object, without
changing source, allowed the affected invocations to pass. Initial raw outputs
are retained alongside [commands, source identities and hashes](execution.json).
All **188 exported source files** were subsequently compared byte-for-byte with
their Git objects. No previous 632/109/etc. suites or cleanup tests were repeated.

## Unmet preparation and next owner

Lead must separately decide connector preparation: create the still-absent
candidate-specific copy, compare exact `services/` and `packages/`, and perform
its offline ask-path/live-import checks. Those operations were **not run** here.
Before any execution, the existing runtime/stage checks, native prerequisites,
exact command/script permission and new exclusive allocation remain necessary.
PowerShell parsing and all Windows/native operations were excluded from this task.

Candidate08 stays **native 1/1 consumed, real actions 1/4 consumed and retired**;
its unused slots grant no retry. Candidate09's inactive template changes no
ledger or authorization. No prepare-connector, runtime copying/staging, installed
Codex, account/provider/network/private-state, display, microphone/audio/TTS,
new attempt or lease occurred. No production/QA source or role setting changed.
Lead retains integration and any future execution decision; READY here is neither
Candidate08 root-cause attribution nor live product acceptance.
