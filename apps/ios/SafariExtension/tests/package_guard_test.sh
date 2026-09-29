#!/usr/bin/env bash
# Checks package.sh's own handling with stubbed xcrun/xcodebuild:
# - an output directory that overlaps the input (the same directory, nested either way, or
#   reached through a symlink) is rejected before anything is written;
# - a separate output succeeds with a hash list covering exactly the input;
# - the generated app and extension bundle IDs must be the expected pair, with the extension
#   prefixed by the app ID, before anything is built (run 36570494322);
# - a missing generated file stops the script instead of being skipped;
# - the native files replace the generated Main.html and Style.css, and no Script.js is needed.
# The stub packager mirrors the layout and bundle-ID derivation seen in the real run: app ID =
# identifier prefix + "." + app name, extension ID = given identifier + ".Extension". This says
# nothing else about Apple's real packager output.
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
        case "$1" in
            --project-location) location="$2"; shift 2 ;;
            --app-name) name="$2"; shift 2 ;;
            --bundle-identifier) given="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
    root="$location/$name"
    mkdir -p "$root/$name.xcodeproj" "$root/$name/Resources/Base.lproj" "$root/$name Extension/Resources"
    touch "$root/$name.xcodeproj/project.pbxproj" "$root/$name/ViewController.swift" \
        "$root/$name/Resources/Base.lproj/Main.html" "$root/$name/Resources/Style.css" \
        "$root/$name Extension/SafariWebExtensionHandler.swift"
    [[ -n "${STUB_OMIT:-}" ]] && find "$root" -name "$STUB_OMIT" -delete
    printf '%s\n%s\n' "${given%.*}.$name" "${STUB_EXTENSION_ID:-$given.Extension}" > "$root/$name.xcodeproj/stub-ids"
    exit 0
fi
[[ "$*" == *--show-sdk-version* ]] && echo 26.5
STUB
cat > "$work/bin/xcodebuild" <<'STUB'
#!/usr/bin/env bash
all="$*"
project=""
derived=""
while [[ $# -gt 0 ]]; do
    case "$1" in -project) project="$2" ;; -derivedDataPath) derived="$2" ;; esac
    shift
done
case "$all" in
    -version) echo "Xcode (stub)" ;;
    *"-list -json"*) echo '{"project":{"schemes":["LearningCompanion"],"targets":["LearningCompanion","LearningCompanion Extension"]}}' ;;
    *"-showBuildSettings"*)
        line=1
        [[ "$all" == *"-target LearningCompanion Extension"* ]] && line=2
        echo "[{\"buildSettings\":{\"PRODUCT_BUNDLE_IDENTIFIER\":\"$(sed -n "${line}p" "$project/stub-ids")\"}}]" ;;
    *" build")
        mkdir -p "$derived/Build/Products/Debug-stub/LearningCompanion.app/PlugIns/LearningCompanion Extension.appex"
        echo "** BUILD SUCCEEDED **" ;;
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

native="$(cd "$(dirname "$script")/native" && pwd)"
generated="$work/separate/project/LearningCompanion"
cmp -s "$native/Main.html" "$generated/LearningCompanion/Resources/Base.lproj/Main.html" \
    && cmp -s "$native/Style.css" "$generated/LearningCompanion/Resources/Style.css" \
    && cmp -s "$native/ViewController.swift" "$generated/LearningCompanion/ViewController.swift" \
    && cmp -s "$native/SafariWebExtensionHandler.swift" "$generated/LearningCompanion Extension/SafariWebExtensionHandler.swift" \
    && [[ ! -e "$native/Script.js" ]]
check $? "the native files replace the generated ones, including Base.lproj/Main.html, with no Script.js"
ids="$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d["app_bundle_id"], d["extension_bundle_id"])' "$work/separate/interface.json" 2>/dev/null)"
[[ "$ids" == "org.example.LearningCompanion org.example.LearningCompanion.Extension" ]]
check $? "default IDs: the extension is prefixed by the app ID (the run 36570494322 failure)"

bash "$script" --webext "$webext" --out "$work/prefixed" --bundle-prefix com.example.person --sdk iphonesimulator > "$work/prefixed.log" 2>&1
status=$?
ids="$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d["app_bundle_id"], d["extension_bundle_id"], len(d["builds"]))' "$work/prefixed/interface.json" 2>/dev/null)"
[[ "$status" == 0 && "$ids" == "com.example.person.LearningCompanion com.example.person.LearningCompanion.Extension 1" ]]
check $? "a configured prefix gives matching app and extension IDs, and the build proceeds"

STUB_EXTENSION_ID="org.example.learningcompanion.Extension" \
    bash "$script" --webext "$webext" --out "$work/mismatch" --sdk iphonesimulator > "$work/mismatch.log" 2>&1
status=$?
[[ "$status" != 0 && ! -e "$work/mismatch/DerivedData-iphonesimulator" && ! -e "$work/mismatch/interface.json" ]] \
    && grep -q "must be prefixed by the app ID" "$work/mismatch.log"
check $? "a generated extension ID not prefixed by the app ID stops the script before any build"

STUB_OMIT="Style.css" bash "$script" --webext "$webext" --out "$work/omitted" > "$work/omitted.log" 2>&1
status=$?
[[ "$status" != 0 && ! -e "$work/omitted/interface.json" ]] && grep -q "expected exactly one Style.css" "$work/omitted.log"
check $? "a missing generated file stops the script instead of being skipped"

bash "$script" --webext "$webext" --out "$work/badprefix" --bundle-prefix 'bad prefix!' > "$work/badprefix.log" 2>&1
[[ $? != 0 && ! -e "$work/badprefix" ]]
check $? "an invalid --bundle-prefix is rejected before anything is written"

if [[ "$failures" -gt 0 ]]; then
    echo "$failures package guard check(s) failed"
    exit 1
fi
echo "all package guard checks passed"
