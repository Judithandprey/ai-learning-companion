# QA launcher identity correction — independent review

**HOLD reusable cleanup harness only.** Code `b5839698c6199c3d8ac6d190fc5bae9032adc414`, report `87c15998a73d9e1d69ea0fd0200304c904d1fc45`, base `4d5c81f`. The three earlier defects are corrected, but one caller/helper boundary still bypasses the remembered-identity rule. This does not hold the separate product Web release, and does not release the display or inference allocation.

## Prior corrections verified

- **PID reuse:** cleanup now supplies PID + creation time + executable + full command line to the signal callback. The generated PowerShell command opens/holds the process before the CIM reread, compares creation/executable/command line using ordinal equality, and signals via that Process object only after all checks. No generic taskkill remains. A pure replacement-PID probe receives the old full identity, returns stale, and signals no replacement.
- **Unreadable identity:** an ordinary same PID/creation with unreadable command line remains not_revalidated; a never-seen young unreadable process remains unresolved. Both independent probes return unknown, perform zero signals and retain the directory.
- **Exact boundaries:** a different executable/script carrying port 430009 is foreign for expected 43000. A different launch carrying the exact marker stays unresolved, rather than being owned. Whole argv and executable checks replace substring ownership.

The source of `signin_signal_check.mjs` and report artifact at `87c1599` are consistent with the reported headless checks: 30 CommandLineToArgvW fixtures and an owned windowless sleeper, with stale/wrong text identities refused and exact identity signalled. These are owner evidence; this review did not run Windows or reproduce those runtime operations. No new runtime claim is made from source agreement.

## Remaining blocker: QA-LAUNCHER-IDENTITY-04 (P2)

`tests/e2e/windows/signin_launcher.mjs:98` filters out every process whose current argv includes `--type=` **before** handing the snapshot to `releaseOwned`. The helper is designed to preserve a remembered identity whose launch metadata later differs, but it cannot do so if the caller removes that identity from the list.

Pure exact-source reproduction:

1. First snapshot contains the expected app, PID 741 / creation 2000.
2. The same simulated process remains alive with the same PID, creation time and executable, but its command line now has an additional `--type=renderer` argument. No listener remains.
3. The exact extracted caller filter drops the row. Actual helper result: **exit confirmed, directory removal called**, no not_revalidated entry.
4. Passing the full snapshot to the same helper instead gives **exit unknown, directory kept, not_revalidated [741:2000]**, as required.

This reproduces a source-level changed-metadata transition; it is not evidence that Windows mutated an actual process this way, that data was deleted, or that a foreign process was signalled. It directly contradicts the correction's promised treatment of a remembered process whose launch identity differs. No wider supervision mechanism is needed.

Minimal existing-QA-owner fix: provide the complete image-name process snapshot to cleanup and let `releaseOwned`/`ownedKind` classify it. If desired, keep child filtering only in the preflight no-other-app policy. Add the caller-level regression above; preserve exact identity signal checks and the no-delete rule.

## Executed evidence and limits

- Exact export: `/tmp/qa-launcher-b583969-29vnve7i`; only the four assigned source/test files were exported.
- Pure owner suite: **35 passed, 0 failed**, Node 24.21.0 with `--test-isolation=none` (28.71 ms reported). No Windows/process APIs are used by this suite.
- Independent pure probe: `/tmp/qa-launcher-identity-correction-probe.mjs`; results `/tmp/qa-launcher-identity-correction-probe.json`. Five prior/control observations pass; one caller-filter regression is reproduced.
- Scoped `git diff --check`: pass. Owner's 18 mutation checks were not rerun or counted as independent evidence.

No repo files edited; no Windows/runtime launch, process inspection, process signal, actual directory deletion, GUI, login, credential, provider or model operation. Next owner: QA makes the narrow snapshot/filter correction; Lead reviews/adopts it separately from product and display release.
