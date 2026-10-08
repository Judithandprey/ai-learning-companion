# Corrected admission delta — 2026-10-08

**APPROVE the source correction at `1aea6b24aac6517a09b014408cc9db6bc3bb1625`.**
The [prior HOLD](../README.md) is closed: both implementations require the first
argument after the executable to establish an absolute, non-switch app path.
This is the same bounded review, released by Lead in
`handoff_7c17ca98554a82178eec015e464a5694`. It does not allocate or execute a display
diagnostic, accept the product, or change main.

`qa_run_tts_candidate.mjs:87` and the emitted `runner.ps1:235` now refuse a
switch-first candidate-runtime main process as `candidate_runtime_app_unresolved`.
Missing and relative app arguments remain relevant. An unrelated absolute app
first remains allowed, including when followed by options. A separate read-only
review independently found the delta consistent in JS and emitted native source.

## Actual verification

| Check on the corrected exact export | Result | Evidence |
| --- | --- | --- |
| Wrapper, injected Windows calls | 54 pass, 0 fail | [log](wrapper-checks.txt) |
| Candidate generator | 23 pass, 0 fail | [log](generator-checks.txt) |
| Independent original counterexamples | All 5 satisfy the boundary: 2 controls and 3 repaired cases | [JSON](argument-regressions.json) |
| Exact emitted PowerShell text parsing | Zero parse errors | [native receipt](native-prerequisite.json) |
| Only isolated `QaArgv` C# compilation | Succeeded | [native receipt](native-prerequisite.json) |
| Native argv splitting, synthetic literals only | 8/8 pass | [native receipt](native-prerequisite.json) |

The 77 affected offline tests ran once with Node v24.21.0, no child-process or
filesystem-write grant. [Commands](offline-checks.json) record the immutable export
and static receipt. The independent probe used the same permission mode and
exited 0. Unchanged cleanup tests were not repeated; their 39 passes and complete
ownership review remain in the prior report rather than being counted again.

The normal exact-command approval succeeded for one prerequisite harness:

```sh
python3 -B tests/probes/support/review_admission_native_prerequisite.py \
  --output docs/verification/support/admission-review-20261008/corrected-1aea6b2/native-prerequisite.json
```

Between `17:09:39.692429Z` and `17:09:40.381742Z`, that harness invoked Windows
PowerShell once, passed the pinned runner as data to `Parser.ParseInput`, extracted
and compiled only its isolated `QaArgv` class, and supplied eight literal strings
to that class. Exit 0, stderr 0 bytes. Runner/class/harness hashes and results are
in the receipt. The full runner was never evaluated or dot-sourced; no admission
function or live process/port/window query ran. No product/browser, display,
account, microphone, audio, provider or process-signal action occurred.

## Exact identity and limits

[Recomputed identity](static-identity.json) verifies all ten source pins and all
payload pins. Candidate SHA256 is
`c083ad0eb5540632e9a2d5acf57bd5a09e5b5f82869fe05345c325ef263e34e6`,
runner `6728ec6cf8a5a2030059f8b31bddaa2b7d059f757730698ef38d5a2fad6c1c28`,
wrapper `84009e821d3495c153a1ff04e042f8027070c9dac0b8ac5e91cd239051dfd941`.

Relative to `78d6de0`, cleanup/helpers, 32 steps, surface, placement/display guards,
launch arguments, ports, profile, scratch and declared production/stage identity
are unchanged. The scratch path was absent by Linux file inspection. The stage
itself was not freshly inspected; the wrapper must still perform its required
execution-time identity checks. No consumed allocation was reused.

The runner's report-only own-root classification still uses PID plus a **less than
1 ms** creation/start-time tolerance at line 258, despite its “exact” wording.
It is not cleanup authority; exact CIM identity cleanup remains unchanged.
Previously documented alias and live-observation limitations remain. Parsing and
isolated compilation do not validate live PowerShell admission semantics or prove
controlled display content; this check deliberately did not execute those paths.

Next owner: Lead integrates the approved exact source/evidence and coordinates
any separately authorized, freshly bound diagnostic allocation with QA. Support's
bounded delta review is complete; no further polling, client probe or native
attempt is part of this result.
