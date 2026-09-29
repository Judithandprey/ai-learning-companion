# QA-IOS-01 Simulator acceptance harness

QA's independent executable check of the CompanionInk owned-page ink slice
(`apps/ios/CompanionInk.swiftpm`). It never edits the app. A separate UI-testing bundle drives
the installed app by bundle ID, and `run.sh` checks and prepares the app's saved files between
phases.

**Evidence level:** iOS Simulator only, using XCUITest finger touches with the app's
"Finger ink" switch on. It is not physical iPad, Apple Pencil, signed install or Airplane Mode
evidence. Those cases are recorded as `NOT_RUN`.

## Invocation (for Support's existing CI wiring)

Run it on the hosted `macos-26` runner (Xcode 26.6) from the repository root, as a separate job.
The existing `companionink` job's 20-minute timeout is too short for it. The new job should:

- set `needs: companionink`. That waits for the whole matrix job; a single lane cannot be named.
- download the same run's `companionink-iphonesimulator-${{ github.sha }}-${{ github.run_attempt }}`
  artifact;
- set `timeout-minutes: 45`.

That way it tests the exact simulator app zip from the same run. The harness records the zip's
SHA-256, but it cannot authenticate where an arbitrary zip came from, so keep that same-run link:

```sh
OUT="$RUNNER_TEMP/qa-ios-01" \
APP_ZIP="<downloaded artifact>/CompanionInk.app.iphonesimulator.unsigned.zip" \
  bash tests/e2e/ios/qa_ios_01/run.sh
```

- **Upload** `$RUNNER_TEMP/qa-ios-01/**` with `if: always()`, excluding `work/test-dd/**`,
  `work/app-dd/**` and `work/app/**`. That covers `summary.txt`, `summary.json`,
  `checks.jsonl`, `environment.txt`, both `simctl-*.json` files, the per-phase `*.log` and
  `*.xcresult.zip`, `attachments/` (PNG crops of the page and their `manifest.json`),
  `ink-directory.txt`, the saved JSON files copied into `work/*.json`, and `crash/`.
- **Exit code:** non-zero if any check failed or none ran. Let the step fail visibly; do not
  mask it with `continue-on-error` as a pass.
- **Environment:** no secrets, signing, network services or extra tools are used, only Xcode,
  `simctl`, `xcresulttool`, `ditto` and the system `python3`.
- **Options:**
  - Without `APP_ZIP`, the app is built from source with the CI's simulator command.
  - `RUNTIME_VERSION` (default `26.5`) and `DEVICE_NAMES` (default
    `iPad Pro 13-inch (M5)|iPad Pro 13-inch (M4)`) choose the simulator. Any fallback is
    recorded as `NOT_RUN` in the summary.

## Phases

| Phase | What it checks |
| --- | --- |
| 1a | **Fresh launch.** The title, NAV mode, "No saved ink for this page yet." and the bundled-page footer are shown. Finger ink is turned on in WRITE first, so only the mode gate can stop drawing. Drags in NAV and in ASK then change no page pixels, and no `Ink` directory is created. ASK shows the not-connected text, and no tools are offered outside WRITE. |
| 1b | **Writing and erasing.** In WRITE with finger ink, three strokes give "Saved 1/2/3 strokes". The vector eraser removes one ("Saved 2 strokes"). No answer text appears. `run.sh` then checks the saved file: a version-1 `user_original`/`user` envelope with the exact page context, including an independently computed page SHA-256. |
| 2 | **Relaunch.** The app reopens in NAV with "Restored 2 strokes saved …". The file bytes are unchanged, because loading is not an edit. A stable crop of the fixed 680 × 860 pt page matches phase 1b's final crop, so the strokes are redrawn at the same page positions. The crop also differs from the empty page, so the strokes are actually visible. |
| 3 | **Continued editing.** A new stroke gives "Saved 3 strokes". Erasing a restored stroke gives "Saved 2 strokes". Both saves go to the main file, with no side file, and the file is rewritten as a valid envelope. |
| 4 | **Failed save.** `run.sh` replaces the `Ink` directory with a plain file. Drawing then shows "Not saved: … Your ink is still on screen …", and the stroke stays visible. The placeholder is untouched, and the original file is byte-identical after the directory is restored. |
| 5 | **Unreadable file at launch.** `run.sh` writes invalid bytes into the saved file. The app keeps them aside unchanged as `…unreadable-….json`, and the page crop matches the empty page. |
| 6 | **Unreadable file at save time.** `run.sh` launches the app, which reads the file, then sets the file to mode 000. XCUITest attaches without relaunching and draws a stroke. The save goes to `…conflict-….json`, and the original's bytes are unchanged. |

The app contains no network code (checked at `833a2a6`: no URLSession, Network or HTTP use). A
Simulator relaunch is therefore offline in the sense that the app sends nothing, but real
Airplane Mode is device-only.

A phase passes only when exactly its one XCUITest ran and passed, according to the result
bundle. A checker command that exits unexpectedly is recorded as FAIL. It also leaves
`checker-error`, which forces a nonzero final exit even if recording the FAIL itself failed. A missing or undecodable screenshot fails its comparison rather than being skipped. A
retry after a failed save cannot be observed from the status text, which has no timestamp. Only
the continued drawing and the unchanged failure status are checked.
