#!/usr/bin/env bash
# Checks package.sh's own file handling with stubbed xcrun/xcodebuild: an output directory
# that overlaps the input (the same directory, nested either way, or reached through a
# symlink) is rejected before anything is written, and a separate output succeeds with a
# hash list covering exactly the input. This says nothing about Apple's real packager output.
# Runs on Linux or macOS: bash apps/ios/SafariExtension/tests/package_guard_test.sh
set -uo pipefail

script="$(cd "$(dirname "$0")/.." && pwd)/package.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

check() {
    if [[ "$1" == 0 ]]; then echo "PASS $2"; else echo "FAIL $2"; failures=$((failures + 1)); fi
}

# Stub Apple tools: the packager writes a minimal generated layout, the builder a built app.
mkdir -p "$work/bin"
cat > "$work/bin/xcrun" <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == safari-web-extension-packager ]]; then
    shift
    while [[ $# -gt 0 ]]; do
        case "$1" in --project-location) location="$2"; shift 2 ;; --app-name) name="$2"; shift 2 ;; *) shift ;; esac
    done
    root="$location/$name"
    mkdir -p "$root/$name.xcodeproj" "$root/Shared (App)/Resources" "$root/Shared (Extension)"
    touch "$root/$name.xcodeproj/project.pbxproj" "$root/Shared (App)/ViewController.swift" \
        "$root/Shared (App)/Resources/Main.html" "$root/Shared (App)/Resources/Script.js" \
        "$root/Shared (App)/Resources/Style.css" "$root/Shared (Extension)/SafariWebExtensionHandler.swift"
    exit 0
fi
[[ "$*" == *--show-sdk-version* ]] && echo 26.5
STUB
cat > "$work/bin/xcodebuild" <<'STUB'
#!/usr/bin/env bash
case "$*" in
    -version) echo "Xcode (stub)" ;;
    *"-list -json"*) echo '{"project":{"schemes":["LearningCompanion"],"targets":["LearningCompanion","LearningCompanion Extension"]}}' ;;
    *"-showBuildSettings"*) echo '[{"buildSettings":{"PRODUCT_BUNDLE_IDENTIFIER":"org.example.stub"}}]' ;;
esac
STUB
chmod +x "$work/bin/"*
export PATH="$work/bin:$PATH"

webext="$work/webext"
mkdir -p "$webext/icons"
echo '{"manifest_version": 3, "name": "guard test", "version": "1"}' > "$webext/manifest.json"
echo 'console.log("x");' > "$webext/background.js"
echo 'icon' > "$webext/icons/icon-96.png"
inventory() { (cd "$webext" && find . -print | LC_ALL=C sort && find . -type f -exec cat {} +); }
before="$(inventory)"

rejected() { # name, then package.sh arguments
    local name="$1"
    shift
    bash "$script" "$@" > "$work/last.log" 2>&1
    local status=$?
    [[ "$status" != 0 && "$(inventory)" == "$before" ]]
    check $? "$name is rejected and the input is unchanged"
}

rejected "output equal to the input" --webext "$webext" --out "$webext"
rejected "output nested in the input" --webext "$webext" --out "$webext/generated"
rejected "output nested deeper in the input" --webext "$webext" --out "$webext/icons/generated"
ln -s "$webext" "$work/alias"
rejected "output reached through a symlink to the input" --webext "$webext" --out "$work/alias/generated"
rejected "output given with .. back into the input" --webext "$webext" --out "$work/other/../webext/generated"
rejected "input nested in the output" --webext "$webext" --out "$work"
rejected "input reached through a symlink inside the output" --webext "$work/alias" --out "$work/new-parent/.."

bash "$script" --webext "$webext" --out "$work/separate" > "$work/success.log" 2>&1
check $? "a separate output succeeds"
[[ "$(inventory)" == "$before" ]]
check $? "a separate output leaves the input unchanged"
[[ -f "$work/separate/interface.json" ]]
check $? "a separate output writes interface.json"
listed="$(awk '{print $2}' "$work/separate/webext.sha256" | LC_ALL=C sort)"
expected="$(cd "$webext" && find . -type f | LC_ALL=C sort)"
[[ "$listed" == "$expected" ]]
check $? "the hash list covers exactly the input files"

if [[ "$failures" -gt 0 ]]; then
    echo "$failures package guard check(s) failed"
    exit 1
fi
echo "all package guard checks passed"
