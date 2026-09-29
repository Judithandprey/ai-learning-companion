# QA-IOS-01: CompanionInk native candidate acceptance (in progress)

- **Assignment:** QA-IOS-01 from the user-approved iPad delivery split (`assignment.md` sha256
  `a33b3f0c…`), released to QA by the lead in `handoff_2b6f3269c627f232c5430512e44ee61b`.
- **Candidate:** exact native candidate `833a2a63a8bf8442b411ec71133081a9fbe1e43c`, app source
  tree `030259dea2fa26c0fdbd1552b26f645c2864ff3d` (`apps/ios/CompanionInk.swiftpm`).
- **Target:** iPad Pro 13-inch (M5), iPadOS 26.5.
- **QA environment:** WSL2 Linux, which has no macOS, Xcode, Simulator or iPad. All execution uses
  the hosted route.

## Evidence levels

| Level | State |
| --- | --- |
| Compiled (iphoneos and iphonesimulator, unsigned) | **Yes, verified independently from the hosted run** (below) |
| Launched in the Simulator | **Not run.** The harness is ready; it waits for the first hosted run. |
| Installed and signed on an iPad | Not run: no signing or device route |
| Physical iPad and Apple Pencil | Not run: no device access |

## Independently verified hosted build (run 36528092111)

Checked by QA with `gh` read-only access, not taken from the owner or lead reports.

- **The run:** push event at `833a2a6`, conclusion `success`.
  - The jobs `envprobe`, `CompanionInk (iphoneos)` and `CompanionInk (iphonesimulator)` all succeeded.
  - The filesystem-check step ran on the device lane only; it was skipped on the simulator lane, as
    designed.
- **Artifacts:** both were downloaded, and their SHA-256 matches the lead's values and the API digest.
  - Simulator: `11015635836`, `bd33c97d…4e817f2`.
  - Device: `11015203228`, `fa915728…6e01cba`.
- **Environment:** `environment.txt` records runner image `macos26` 20260907.0351.1, macOS 26.6.2
  (arm64), Xcode 26.6 (17F113) and the iphonesimulator 26.5 SDK. The packaged source tree
  `030259de…` equals `git rev-parse 833a2a6:apps/ios/CompanionInk.swiftpm`.
- **Build logs:** both lanes show `** BUILD SUCCEEDED **`. Each has one warning, the AppIntents
  metadata extraction skipped (benign).
- **Simulator app:** a universal x86_64 and arm64 executable.
  - `Info.plist`: bundle ID `org.example.learningcompanion.ink`, `MinimumOSVersion` 17.0, device
    families 1 and 2, `DTSDKName` iphonesimulator26.5, `UIApplicationSupportsMultipleScenes` true.
  - The Debug build also contains `CompanionInk.debug.dylib` and `__preview.dylib`.
- **Device-lane `ink-file-check.log`:** 13 PASS and 0 SKIP, then "all ink file checks passed". The
  mode-000 unreadable-file cases passed rather than being skipped. This is a Foundation-only check of
  `InkFile.swift`; it is not app execution.
- **No network use:** the app source has no URLSession, URLRequest, Network framework or HTTP use,
  and declares no capabilities or entitlements.

## Acceptance harness (ready, not yet run)

`tests/e2e/ios/qa_ios_01/`: a standalone UI-testing bundle that drives the installed app by bundle
ID, a phase runner and a host checker. The [README](../../../tests/e2e/ios/qa_ios_01/README.md) has
the phases and the exact CI invocation.

- **Coverage:** launch, NAV/ASK no-draw with finger ink already on, WRITE writing and erasing, the
  saved envelope with its page context, relaunch without saving, continued editing, failed save,
  an unreadable file at launch and an unreadable file at save time.
- **Static review, because it cannot be compiled here:** two reviewers plus two adversarial verifiers.
  - They found two first-run blockers, now fixed: `simctl list -j runtimes devicetypes` filtered the
    runtime list to empty, and simulator-picker notes broke the `read` of its result.
  - They found five weak checks, also fixed:
    - NAV/ASK drags could not fail while finger ink was off;
    - scroll-view screenshots changed size with status-text wrapping;
    - a missing screenshot comparison was only NOT_RUN;
    - a phase that ran zero tests counted as a pass;
    - window-origin double counting.
- **Lead's integration review of `ca639af`** (`handoff_d8dcc48eaf58a6f185ad796217451cd8`) found one
  concrete false-green path.
  - Valid JSON `null` crashed the envelope check without recording a row. `run.sh` continued, and the
    summary still exited 0 (PASS 1, FAIL 0).
  - Correction:
    - `check.py` rejects non-object JSON as a FAIL.
    - Any unexpected checker exception is recorded as FAIL and exits 2.
    - The `check()` wrapper in `lib.sh` records a FAIL for any nonzero checker exit.
    - The wrapper sets `CHECKER_FAILED` for direct calls and writes `checker-error`, which also works
      from command substitutions and process substitution.
    - `finish()` exits nonzero if either trace exists, even if recording the FAIL row failed.
    - `check sha` prints `missing` for an absent file instead of crashing.
- **Linux checks:** `tests/e2e/ios/test_qa_ios_01_check.py` covers:
  - the page-hash expectation, the envelope checks, the PNG decoding and comparison limits, simulator
    selection and the summary exit codes;
  - the real `lib.sh` in bash: the malformed envelope after an earlier PASS, a checker crash inside a
    command substitution, a failure while recording the failure, and a clean-run control.

  Result: 10 passed. With the old checker and wrapper restored, the malformed-envelope and
  substitution-crash regressions fail, so they discriminate. This is not Xcode evidence.

## Next step

Support wires the invocation into the existing hosted workflow as a separate job with a 45-minute
timeout, through the lead. QA then inspects the actual uploaded `summary.txt`, the logs, the
result bundles and the screenshots, and records the Simulator results here. Physical iPad and
Pencil cases, signed install and real Airplane Mode stay `not_run` until real device access exists.
