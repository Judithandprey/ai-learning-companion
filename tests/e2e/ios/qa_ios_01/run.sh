#!/usr/bin/env bash
# QA-IOS-01: Simulator acceptance of the CompanionInk native ink slice. It needs macOS with Xcode.
#
#   OUT=<evidence dir> APP_ZIP=<CompanionInk.app.iphonesimulator.unsigned.zip> \
#     bash tests/e2e/ios/qa_ios_01/run.sh
#
# APP_ZIP is the simulator app zip from the same CI run. Without it, the app is built here from
# apps/ios/CompanionInk.swiftpm with the CI's simulator build command. The harness creates and later
# deletes its own simulator, installs the app, and runs the XCUITest phases in order. Between phases
# it checks and prepares the app's saved files. Every phase runs and is recorded even after a failure;
# summary.txt decides the exit code. This is Simulator evidence only: no Apple Pencil, physical iPad,
# signing or real Airplane Mode.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
OUT=${OUT:-"$PWD/qa-ios-01-evidence"}
APP_ZIP=${APP_ZIP:-}
RUNTIME_VERSION=${RUNTIME_VERSION:-26.5}
DEVICE_NAMES=${DEVICE_NAMES:-"iPad Pro 13-inch (M5)|iPad Pro 13-inch (M4)"}
BUNDLE_ID=org.example.learningcompanion.ink
PROJECT="$HERE/CompanionInkAcceptance.xcodeproj"
SCHEME=CompanionInkAcceptance
TESTS=CompanionInkAcceptanceUITests/QAIOS01UITests

mkdir -p "$OUT/work" "$OUT/attachments"
LOG="$OUT/checks.jsonl"
: > "$LOG"
rm -f "$OUT/checker-error"
# check(), say() and finish(): unexpected checker failures always make the final exit nonzero.
source "$HERE/lib.sh"

# ---- environment and exact candidate ------------------------------------------------------------
{
  printf 'candidate_commit=%s\n' "$(git -C "$REPO" rev-parse HEAD)"
  printf 'app_source_tree=%s\n' "$(git -C "$REPO" rev-parse HEAD:apps/ios/CompanionInk.swiftpm)"
  printf 'harness_tree=%s\n' "$(git -C "$REPO" rev-parse HEAD:tests/e2e/ios/qa_ios_01)"
  printf 'run=%s/%s/actions/runs/%s\n' "${GITHUB_SERVER_URL:-}" "${GITHUB_REPOSITORY:-}" "${GITHUB_RUN_ID:-local}"
  printf 'runner_image=%s %s\n' "${ImageOS:-}" "${ImageVersion:-}"
  sw_vers; uname -m; xcodebuild -version
} > "$OUT/environment.txt" 2>&1
# One type per listing: a second word would be a search term, not another type.
xcrun simctl list -j runtimes > "$OUT/simctl-list.json"
xcrun simctl list -j devicetypes > "$OUT/simctl-devicetypes.json"

# ---- app under test -----------------------------------------------------------------------------
APP="$OUT/work/app/CompanionInk.app"
if [[ -n "$APP_ZIP" ]]; then
  ditto -x -k "$APP_ZIP" "$OUT/work/app"
  echo "app_source=artifact $(basename "$APP_ZIP") sha256 $(shasum -a 256 "$APP_ZIP" | cut -d' ' -f1)" >> "$OUT/environment.txt"
else
  (cd "$REPO/apps/ios/CompanionInk.swiftpm" && xcodebuild -scheme CompanionInk -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' -configuration Debug -derivedDataPath "$OUT/work/app-dd" \
    CODE_SIGNING_ALLOWED=NO build) > "$OUT/app-build.log" 2>&1
  mkdir -p "$OUT/work/app"
  cp -R "$OUT/work/app-dd/Build/Products/Debug-iphonesimulator/CompanionInk.app" "$OUT/work/app/" 2>/dev/null
  echo "app_source=built here from apps/ios/CompanionInk.swiftpm (see app-build.log)" >> "$OUT/environment.txt"
fi
if [[ ! -d "$APP" ]]; then
  check note setup "app under test available" FAIL "no CompanionInk.app (see environment.txt / app-build.log)"
  finish "not run: app unavailable"
fi
codesign -dv "$APP" >> "$OUT/environment.txt" 2>&1 || echo "codesign: app bundle is not signed" >> "$OUT/environment.txt"

# ---- simulator ----------------------------------------------------------------------------------
IFS=$'\t' read -r RUNTIME DEVICE_TYPE TARGET < <(check pick-sim "$OUT/simctl-list.json" "$RUNTIME_VERSION" "$DEVICE_NAMES" | tail -n 1)
if [[ -z "${DEVICE_TYPE:-}" ]] || ! UDID=$(xcrun simctl create "QA-IOS-01" "$DEVICE_TYPE" "$RUNTIME"); then
  check note setup "create an iPad simulator" FAIL "no usable iOS runtime/iPad device type (simctl-list.json)"
  finish "not run: no simulator"
fi
cleanup() { xcrun simctl shutdown "$UDID" >/dev/null 2>&1; xcrun simctl delete "$UDID" >/dev/null 2>&1; }
trap cleanup EXIT
echo "simulator=$TARGET udid=$UDID" >> "$OUT/environment.txt"
xcrun simctl boot "$UDID" && xcrun simctl bootstatus "$UDID" -b > "$OUT/work/bootstatus.log" 2>&1
if ! xcrun simctl install "$UDID" "$APP" > "$OUT/install.log" 2>&1; then
  check note setup "install the unsigned simulator app" FAIL "simctl install failed (install.log)"
  finish "not run: install failed"
fi
check note setup "install the unsigned simulator app" PASS "$TARGET"
DATA=$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" data)
if [[ -z "$DATA" || ! -d "$DATA" ]]; then
  check note setup "locate the app data container" FAIL "get_app_container returned '$DATA'"
  finish "not run: no data container"
fi
INK="$DATA/Library/Application Support/Ink"
FILE="$INK/fixture.practice.linear-equation.user_original.json"

if ! xcodebuild -project "$PROJECT" -scheme "$SCHEME" -destination "id=$UDID" -derivedDataPath "$OUT/work/test-dd" \
    build-for-testing > "$OUT/test-build.log" 2>&1; then
  check note setup "build the acceptance UI tests" FAIL "see test-build.log"
  finish "not run: harness build failed"
fi

stop_app() { xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true; }

phase() {  # phase <id> <test method>
  local id=$1 name=$2 rc
  say "phase $id: $name"
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -destination "id=$UDID" -derivedDataPath "$OUT/work/test-dd" \
    -only-testing:"$TESTS/$name" -resultBundlePath "$OUT/$id.xcresult" test-without-building > "$OUT/$id.log" 2>&1
  rc=$?
  # A phase passes only if exactly this one test ran and passed (a mistyped -only-testing runs 0).
  counts=$(xcrun xcresulttool get test-results summary --path "$OUT/$id.xcresult" 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("totalTestCount"), d.get("passedTests"))' 2>/dev/null)
  if [[ -z "$counts" ]] && grep -q "Executed 1 test, with 0 failures" "$OUT/$id.log"; then counts="1 1"; fi
  check note "$id" "UI phase $name" "$([[ $rc -eq 0 && "$counts" == "1 1" ]] && echo PASS || echo FAIL)" \
    "xcodebuild exit $rc; tests run/passed: ${counts:-unknown} ($id.log, $id.xcresult)"
  mkdir -p "$OUT/attachments/$id"
  xcrun xcresulttool export attachments --path "$OUT/$id.xcresult" --output-path "$OUT/attachments/$id" \
    > /dev/null 2>&1 || check note "$id" "export screenshots" NOT_RUN "xcresulttool export attachments failed"
  stop_app
}

# ---- phases -------------------------------------------------------------------------------------
check absent 0 "$INK"                              # fresh install: nothing saved yet

phase 1a test_1a_launch_nav_and_ask_do_not_draw
check absent 1a "$INK"                             # NAV/ASK drags saved nothing

phase 1b test_1b_write_three_strokes_and_erase_one
check envelope 1b "$FILE"
check no-side-files 1b "$INK"
SAVED=$(check sha "$FILE") || CHECKER_FAILED=1

phase 2 test_2_relaunch_restores_without_saving
check same-sha 2 "$FILE" "$SAVED"                  # loading is not an edit
check compare 2 "restored strokes redraw at the same page positions" \
  "$OUT/attachments/1b" p1-final "$OUT/attachments/2" p2-restored 0.0002
check compare 2 "restored page shows strokes (differs from the empty page)" \
  "$OUT/attachments/1a" 1a-before "$OUT/attachments/2" p2-restored --min 0.0004

phase 3 test_3_continue_editing_restored_ink
check envelope 3 "$FILE"
check no-side-files 3 "$INK"
check changed-sha 3 "$FILE" "$SAVED"
SAVED=$(check sha "$FILE") || CHECKER_FAILED=1

# Failed save: the Ink directory becomes a plain file, so the app cannot create its directory.
mv "$INK" "$OUT/work/ink-before-4"
printf 'QA-IOS-01 placeholder: not a directory\n' > "$INK"
PLACEHOLDER=$(check sha "$INK") || CHECKER_FAILED=1
phase 4 test_4_failed_save_keeps_ink_on_screen
check regular-file 4 "$INK" "$PLACEHOLDER"
rm -f "$INK" && mv "$OUT/work/ink-before-4" "$INK"
check same-sha 4 "$FILE" "$SAVED"                  # the saved original survived the failed saves

# Unreadable at launch: invalid bytes must be kept aside unchanged.
cp -p "$FILE" "$OUT/work/saved-after-3.json"
printf 'QA-IOS-01: these bytes are not a saved ink file {\n' > "$FILE"
INVALID=$(check sha "$FILE") || CHECKER_FAILED=1
phase 5 test_5_unreadable_file_is_kept_aside
check side-file 5 "$INK" unreadable --expect-sha "$INVALID"
check absent 5 "$FILE"
check compare 5 "the page starts empty after the unreadable file is kept aside" \
  "$OUT/attachments/1a" 1a-before "$OUT/attachments/5" p5-empty 0.0002

# Unreadable at save time: the app reads the file, then the file becomes mode 000 while it runs.
cp -p "$OUT/work/saved-after-3.json" "$FILE"
xcrun simctl launch "$UDID" "$BUNDLE_ID" > "$OUT/work/launch-6.log" 2>&1
sleep 5
chmod 000 "$FILE"
if head -c 1 "$FILE" > /dev/null 2>&1; then
  check note 6 "mode 000 makes the file unreadable" NOT_RUN "this process can still read a mode-000 file"
fi
phase 6 test_6_unreadable_at_save_writes_beside
chmod 600 "$FILE"
check same-sha 6 "$FILE" "$SAVED"
check side-file 6 "$INK" conflict --envelope

# ---- evidence -----------------------------------------------------------------------------------
ls -la "$INK" > "$OUT/ink-directory.txt" 2>&1
cp -p "$INK"/*.json "$OUT/work/" 2>/dev/null
mkdir -p "$OUT/crash"
cp ~/Library/Logs/DiagnosticReports/CompanionInk* "$OUT/crash/" 2>/dev/null
for bundle in "$OUT"/*.xcresult; do
  [[ -d "$bundle" ]] && ditto -c -k --keepParent "$bundle" "$bundle.zip"
done
check note device "Apple Pencil writes; a finger scrolls while Finger ink is off" NOT_RUN "physical iPad and Pencil required"
check note device "relaunch in Airplane Mode" NOT_RUN "physical device required; the Simulator shares the host network"
check note device "signed install on the target iPad" NOT_RUN "no signing or device route in this job"
finish "Simulator ($TARGET), XCUITest finger touches with Finger ink on; not a physical iPad or Apple Pencil"
