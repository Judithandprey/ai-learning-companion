# QA-IOS-01: CompanionInk native candidate acceptance (Simulator passed; device not run)

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
| Compiled (iphoneos and iphonesimulator, unsigned) | **Yes**, verified independently in runs 36528092111 and 36532369377 |
| Launched and exercised in the Simulator | **Yes, passed**: iOS 26.5, iPad Pro 13-inch (M5), XCUITest finger touches (run 36532369377, below) |
| Installed and signed on an iPad | Not run: no signing or device route |
| Physical iPad and Apple Pencil | Not run: no device access |

## Simulator acceptance result (run 36532369377)

- **Run:** <https://github.com/Judithandprey/ai-learning-companion/actions/runs/36532369377>
  - Push at main `97fec90bc11a825c74ed2e44d41a83ab5a276883`, which integrates this harness
    (`ca639af` → `7399524`, `259dcf6` → `f1a11fa`) and Support's CI job (`6ab5d22` → `65107f4`).
  - Every job concluded `success`, including `QA-IOS-01 simulator acceptance`, from 06:42 to
    06:56 UTC.
  - Evidence artifact: `qa-ios-01-97fec90…-1`, id 11017578113, sha256 `3c035688…`. QA downloaded
    it and inspected its contents; the pass was not taken from the job badge.
- **Exact app:**
  - Harness tree `2e15ecf8…`, byte-identical to QA's `259dcf6`.
  - App source tree `030259de…`, unchanged from candidate `833a2a6`.
  - The installed app zip's sha256 `f06bff75…` equals the zip inside the same run's
    `companionink-iphonesimulator-97fec90…-1` artifact.
  - The app is ad-hoc/linker-signed, not signed with a team.
- **Environment:** macOS 26.6.2 arm64, Xcode 26.6 (17F113), a fresh simulator: iOS 26.5, iPad
  Pro 13-inch (M5). There was no fallback.
- **Result:** `summary.txt` has **25 PASS, 0 FAIL, 3 NOT_RUN**. The three NOT_RUN rows are
  exactly the device-only cases. There is no `checker-error` file.
  - Every phase log shows `Executed 1 test, with 0 failures`, and the result bundle reports 1
    test run and 1 passed.
  - Phase durations: 1a 52 s, 1b 49 s, 2 21 s, 3 30 s, 4 30 s, 5 13 s, 6 14 s.

| Phase | Result |
| --- | --- |
| 1a Launch, NAV/ASK | **PASS.** Title, NAV, "No saved ink for this page yet." and the bundled-page footer are shown. With finger ink already on, the NAV and ASK drags changed no page pixels and created no `Ink` directory. ASK shows the not-connected text. |
| 1b Write/erase | **PASS.** Three strokes gave "Saved 1/2/3 strokes", and the eraser gave "Saved 2 strokes". The saved file is a version-1 `user_original`/`user` envelope whose page context equals QA's independent expectation, including `contentSHA256` `bcc99615…`. No side files. |
| 2 Relaunch | **PASS.** "Restored 2 strokes …" in NAV. File bytes unchanged (`92318d06…`). The page crop equals phase 1b's final crop (differing fraction 0.000000) and differs from the empty page (0.0033). |
| 3 Continued editing | **PASS.** A new stroke gave "Saved 3 strokes", and erasing restored row 1 gave "Saved 2 strokes". Both saves went to the main file with no side file, and the file was rewritten (`92496e0c…`). |
| 4 Failed save | **PASS.** With `Ink` replaced by a plain file, the app showed "Not saved: … Your ink is still on screen", and both unsaved strokes stayed visible. The placeholder was untouched, and the original is byte-identical after restoring. |
| 5 Unreadable at launch | **PASS.** The invalid bytes were kept unchanged as `…unreadable-1790664909-7EC66860.json`, the main file was moved away, and the page crop equals the empty page. |
| 6 Unreadable at save | **PASS.** The app launched through `simctl` and read the file. The file was then set to mode 000, and XCUITest attached without relaunching; a relaunch would have shown the "unreadable" status instead. The next save went to `…conflict-1790664959-453BF02D.json`, a valid envelope with the same page context. The original's bytes stayed `92496e0c…`. |

**Visual check.** QA looked at the page crops directly:
- the three strokes;
- the restored two strokes at identical positions;
- the erased restored stroke plus the new one;
- the unsaved strokes still visible.

Evidence is in [`qa-ios-01/`](qa-ios-01/): `summary.txt`, `checks.jsonl`, `environment.txt`,
`harness.log`, `ink-directory.txt`, the final saved files in `saved/` and the page crops in
`screens/`. Result bundles and phase logs stay in the run artifact, retained 14 days.

**Observations (info, not defects):**
- The status text says "Saved 1 strokes" (no singular form). This is cosmetic.
- The harness restores the file to mode 600 after phase 6, not to its original mode. That affects
  nothing that was checked.
- xcodebuild warned "Using the first of multiple matching destinations" for `id=<UDID>`, which is
  benign.

**What this does not show:**
- Apple Pencil input, the Pencil-versus-finger policy with Finger ink off, real Airplane Mode, or
  signed installation on an iPad: these are the NOT_RUN rows.
- Behavior on other screen sizes.
- R59/A44 original-screen annotation, AI help, A46 Notability import, audio.
- The Simulator's lack of network use comes from source inspection only.

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

## Acceptance harness

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

- QA-IOS-01 Simulator acceptance is complete for candidate `833a2a6`. No production defect was found.
- The device-only cases stay `not_run` until a signed install or Swift Playgrounds route runs on the
  target iPad with Apple Pencil.
- A new native candidate needs one focused rerun of this harness.
