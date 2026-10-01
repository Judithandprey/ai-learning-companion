# Minimal storage-status milestone adaptation

Disposition: **APPROVE this proposed audit-only patch**, subject to Root applying it. No repository files were changed. Patch: `/tmp/macos-storage-audit.patch`; target remains the existing `docs/verification/lead/macos-parent-review/correction/audit.py`. The temporary expanded script is development material, not a second repository audit.

The optional `--milestone parent-link|storage-status` defaults to `parent-link`. Default requirements stay at 23 CaptureLink tests / 78 total / the same eight source files and all existing required regression names. Storage status requires 28 CaptureLink tests / 83 total, all old regressions, plus exactly the five newly declared names from `30807f23a911739c089126d86b2b34d51976ea18`:

- `testPendingFramesAreShownAtOnceAndStoredOnlyAfterTheirACK`
- `testBatchWithoutABelievedAnswerStaysNotKnownUntilItsExactACK`
- `testStopOrARecordFaultNeverShowsTheLinkAsUpAndEndsWithNothingAwaiting`
- `testResendIntentIsRecordedShownAndFenced`
- `testOriginalsOfAnUnsentBatchAreReportedAsAlreadyAccepted`

The existing exhaustive source-declaration/log comparison still requires these names to execute successfully. Mode selection is recorded in the receipt. All raw Git blob/mode/path, reviewed native-tree, source archive, recursive SHA256, package/build, fixture, upload checker, run/job/artifact metadata and no-false-runtime-claim checks remain unchanged. This is a test expectation selection, not approval of the new production source or its uncompiled tests.

Executed bounded preparation checks:

1. Python AST syntax check passed. `git apply --check /tmp/macos-storage-audit.patch` passed without applying it.
2. One complete saved-evidence audit ran with the default mode against actual historical macOS run 36803694899, hosted commit `1a5dc062f0e781aec4bc0b79e91a2769fe1dd42c`, approved native commit `fb891d699cc33cde10c2a1fa25928f3c87346b3f`: exit 0, 78 XCTest passes, no anomalies. Its entire receipt equals the previous audit receipt after removing the new explicit `milestone` field.
3. Replayed only the exact XCTest gate of the proposed script in `storage-status` mode on the same old archived native source and actual log: HOLD for the 83-test requirement and missing new regressions, as required. No additional full artifact pass or synthetic execution log was made.
4. Compared source declarations at `30807f2^` and `30807f2`: 23 to 28, no removed tests, and the five added names exactly equal the new required set.

Commands and evidence:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /tmp/macos-storage-audit.py \
  --artifact-dir /tmp/lc-macos-parent-36803694899 \
  --commit 1a5dc062f0e781aec4bc0b79e91a2769fe1dd42c \
  --approved fb891d699cc33cde10c2a1fa25928f3c87346b3f \
  --run 36803694899 --output /tmp/macos-storage-audit-parent-control.json \
  > /tmp/macos-storage-audit-parent-control.log
PYTHONDONTWRITEBYTECODE=1 python3 /tmp/macos-storage-audit-gate-control.py \
  > /tmp/macos-storage-audit-gate-control.log
git apply --check /tmp/macos-storage-audit.patch
```

The full audit requires a new output path on repetition. Machine results are in `/tmp/macos-storage-audit-controls.json`; the focused gate script and logs are preserved beside it. For the eventual new successful output Root must supply its exact hosted and approved SHAs and add `--milestone storage-status` to the existing command. No new artifact or 83-test execution exists in this review; no build, GUI, network, DB, process signal or native test run occurred.

Patch SHA-256: `3eb3f73d2efcf72ac620c7636d79e752edfee847c524f8c6c4003d0e7be6b340`.
