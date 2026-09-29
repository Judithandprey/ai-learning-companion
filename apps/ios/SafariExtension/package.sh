#!/usr/bin/env bash
# Package a built WebExtension as an iOS containing app plus Safari web extension, using
# Apple's packager (xcrun safari-web-extension-packager). Then replace five generated files
# with this repository's native files and, optionally, build unsigned.
#
# Runs on macOS with Xcode, for example the hosted macos-26 runner. The Xcode project is
# regenerated on every run; it is never hand-edited or committed.
# See docs/verification/platform/safari-extension-packaging.md.
set -euo pipefail

APP_NAME="LearningCompanion"
# Placeholder. The real bundle ID prefix is user input U6.
BUNDLE_ID="org.example.learningcompanion"
HERE="$(cd "$(dirname "$0")" && pwd)"

usage() {
    cat <<'EOF'
Usage: package.sh --webext DIR --out DIR [--sdk iphonesimulator|iphoneos]...

  --webext DIR  built WebExtension directory with manifest.json at its root
                (alias --resources). Product: apps/safari-extension/webextension, which
                Web commits ready to package (check it with
                `node apps/safari-extension/scripts/build-webextension.mjs --check`).
                Packaging plumbing only: apps/ios/SafariExtension/fixture-webext.
  --out DIR     absent or empty directory for the project, logs, interface.json and
                builds (alias --output).
  --sdk SDK     build unsigned for iphonesimulator or iphoneos; repeatable (alias --build).
                Without --sdk, the project is only generated.

Writes OUT/interface.json with the project path, scheme, targets, bundle IDs and built
products. Callers should read it rather than assume generated names.
EOF
}

fail() {
    echo "package.sh: $*" >&2
    exit 1
}

webext=""
out=""
sdks=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --webext | --resources) webext="${2:-}"; shift 2 ;;
        --out | --output) out="${2:-}"; shift 2 ;;
        --sdk | --build) sdks+=("${2:-}"); shift 2 ;;
        -h | --help) usage; exit 0 ;;
        *) usage >&2; fail "unknown argument: $1" ;;
    esac
done

[[ -n "$webext" && -n "$out" ]] || { usage >&2; fail "--webext and --out are required"; }
[[ -f "$webext/manifest.json" ]] || fail "no manifest.json at the root of $webext"
for sdk in ${sdks[@]+"${sdks[@]}"}; do
    [[ "$sdk" == iphonesimulator || "$sdk" == iphoneos ]] || fail "unsupported --sdk $sdk"
done
if [[ -e "$out" && -n "$(ls -A "$out")" ]]; then
    fail "$out is not empty; choose a new directory (nothing is deleted)"
fi
mkdir -p "$out"
webext="$(cd "$webext" && pwd)"
out="$(cd "$out" && pwd)"

# Exact inputs, for provenance.
(cd "$webext" && find . -type f | LC_ALL=C sort | while IFS= read -r file; do shasum -a 256 "$file"; done) \
    > "$out/webext.sha256"
{ xcodebuild -version; xcrun --sdk iphoneos --show-sdk-version; } > "$out/toolchain.txt"

xcrun safari-web-extension-packager "$webext" \
    --project-location "$out/project" \
    --app-name "$APP_NAME" \
    --bundle-identifier "$BUNDLE_ID" \
    --swift --ios-only --copy-resources --no-open --no-prompt --force \
    2>&1 | tee "$out/packager.log"

only_one() {
    local found
    found="$(find "$1" -name "$2" -not -path '*.xcodeproj/*')"
    [[ -n "$found" && "$(printf '%s\n' "$found" | wc -l | tr -d ' ')" == 1 ]] \
        || fail "expected exactly one $2 under $1, found: ${found:-none}"
    printf '%s\n' "$found"
}

project_file="$(find "$out/project" -maxdepth 3 -name '*.xcodeproj' -type d)"
[[ -n "$project_file" && "$(printf '%s\n' "$project_file" | wc -l | tr -d ' ')" == 1 ]] \
    || fail "expected exactly one .xcodeproj, found: ${project_file:-none}"

# Replace generated files by name. The app's Main.html, Script.js and Style.css are looked
# up only beside the generated ViewController.swift, never among the extension's resources.
view_controller="$(only_one "$out/project" ViewController.swift)"
app_dir="$(dirname "$view_controller")"
handler="$(only_one "$out/project" SafariWebExtensionHandler.swift)"
cp "$HERE/native/ViewController.swift" "$view_controller"
cp "$HERE/native/SafariWebExtensionHandler.swift" "$handler"
for page_file in Main.html Script.js Style.css; do
    cp "$HERE/native/$page_file" "$(only_one "$app_dir" "$page_file")"
done

python3 - "$project_file" "$out/interface.json" "$out/webext.sha256" <<'PY'
import json, subprocess, sys
project, target_path, webext_hashes = sys.argv[1:4]
listing = json.loads(subprocess.check_output(["xcodebuild", "-list", "-json", "-project", project]))["project"]
def bundle_id(target):
    settings = json.loads(subprocess.check_output(
        ["xcodebuild", "-showBuildSettings", "-json", "-project", project, "-target", target]))
    return settings[0]["buildSettings"].get("PRODUCT_BUNDLE_IDENTIFIER")
targets = {target: bundle_id(target) for target in listing["targets"]}
extension_targets = [t for t in targets if t.endswith("Extension")]
app_targets = [t for t in targets if t not in extension_targets]
if len(app_targets) != 1 or len(extension_targets) != 1 or len(listing["schemes"]) < 1:
    sys.exit(f"unexpected generated targets {listing['targets']} or schemes {listing['schemes']}")
scheme = app_targets[0] if app_targets[0] in listing["schemes"] else listing["schemes"][0]
json.dump({
    "xcodeproj": project,
    "scheme": scheme,
    "app_target": app_targets[0],
    "app_bundle_id": targets[app_targets[0]],
    "extension_target": extension_targets[0],
    "extension_bundle_id": targets[extension_targets[0]],
    "webext_sha256_file": webext_hashes,
    "signed": False,
    "builds": [],
}, open(target_path, "w"), indent=2)
open(target_path, "a").write("\n")
PY
echo "package.sh: generated $(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["xcodeproj"])' "$out/interface.json")"

for sdk in ${sdks[@]+"${sdks[@]}"}; do
    if [[ "$sdk" == iphonesimulator ]]; then destination='generic/platform=iOS Simulator'; else destination='generic/platform=iOS'; fi
    scheme="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["scheme"])' "$out/interface.json")"
    xcodebuild -project "$project_file" -scheme "$scheme" -sdk "$sdk" -destination "$destination" \
        -derivedDataPath "$out/DerivedData-$sdk" CODE_SIGNING_ALLOWED=NO build 2>&1 | tee "$out/build-$sdk.log"
    app="$(find "$out/DerivedData-$sdk/Build/Products" -maxdepth 2 -name '*.app' -type d)"
    [[ -n "$app" && "$(printf '%s\n' "$app" | wc -l | tr -d ' ')" == 1 ]] || fail "expected one built .app for $sdk"
    appex="$(find "$app/PlugIns" -maxdepth 1 -name '*.appex' -type d)"
    [[ -n "$appex" ]] || fail "the built app for $sdk embeds no .appex"
    python3 - "$out/interface.json" "$sdk" "$app" "$appex" <<'PY'
import json, sys
path, sdk, app, appex = sys.argv[1:5]
data = json.load(open(path))
data["builds"].append({"sdk": sdk, "app": app, "appex": appex, "signed": False})
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
    echo "package.sh: built $sdk: $app"
done

cat "$out/interface.json"
