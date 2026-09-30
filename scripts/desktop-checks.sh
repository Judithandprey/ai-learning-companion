#!/usr/bin/env bash
# Build/package only. GUI permission, live capture/input/audio and real AI need
# separate per-OS acceptance. Build an isolated committed snapshot, never a user preview.
set -euo pipefail

if [[ $# -ne 2 || ( "$1" != windows && "$1" != macos ) ]]; then
    echo 'Usage: bash scripts/desktop-checks.sh windows|macos EMPTY_OUTPUT_DIR' >&2
    exit 2
fi
platform="$1"
out="$2"
root="$(cd "$(dirname "$0")/.." && pwd -P)"
python_bin="${PYTHON:-python3}"
if [[ "$platform" == macos ]]; then python_bin="$root/.venv/bin/python"; fi
command -v "$python_bin" >/dev/null
if [[ -e "$out" && ( ! -d "$out" || -n "$(ls -A "$out")" ) ]]; then
    echo 'Output must be absent or empty; existing evidence is preserved.' >&2
    exit 2
fi
mkdir -p "$out"
out="$(cd "$out" && pwd -P)"
cd "$root"
commit="$(git rev-parse HEAD)"
phase=source
state=failed
source_dir=apps/windows
if [[ "$platform" == macos ]]; then source_dir=apps/macos/CompanionDesktop; fi

finish() {
    result=$?
    trap - EXIT
    "$python_bin" - "$out" "$platform" "$phase" "$state" "$result" <<'PY'
import hashlib
import json
from pathlib import Path
import sys

out, platform, phase, state, result = sys.argv[1:]
out = Path(out)
(out / "result.json").write_text(json.dumps({
    "platform": platform, "state": state, "last_phase": phase,
    "exit_code": int(result), "interactive_runtime_verified": False,
    "provider_verified": False, "project_signing_performed": False,
}, indent=2) + "\n", encoding="utf-8")
with (out / "SHA256SUMS").open("w", encoding="utf-8") as hashes:
    # Hash retained raw fixtures too, without traversing excluded build work.
    evidence = (list(out.iterdir()) + list((out / "macos-fixture").rglob("*"))
                + list((out / "macos-ingress-fixture").rglob("*"))
                + list((out / "macos-composed-fixture").rglob("*"))
                + list((out / "macos-retained-frame-fixture").rglob("*")))
    for path in sorted(evidence):
        if path.is_file() and path.name != "SHA256SUMS":
            digest = hashlib.sha256()
            with path.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            hashes.write(f"{digest.hexdigest()}  {path.relative_to(out).as_posix()}\n")
PY
    exit "$result"
}
trap finish EXIT

fail() {
    printf '%s\n' "$*" | tee "$out/error.txt" >&2
    exit 1
}

run_logged() {
    phase="$1"
    shift
    printf 'Running %s\n' "$phase"
    "$@" 2>&1 | tee "$out/$phase.log"
}

{
    printf 'commit=%s\nplatform=%s\nsource=%s\n' "$commit" "$platform" "$source_dir"
    printf 'runner_image=%s\nrunner_image_version=%s\n' "${ImageOS:-unrecorded}" "${ImageVersion:-unrecorded}"
    printf 'run=%s/%s/actions/runs/%s\nattempt=%s\n' \
        "${GITHUB_SERVER_URL:-local}" "${GITHUB_REPOSITORY:-local}" \
        "${GITHUB_RUN_ID:-local}" "${GITHUB_RUN_ATTEMPT:-local}"
    uname -sm
} > "$out/environment.txt"
if [[ ! -d "$source_dir" ]]; then
    state=source-not-ready
    fail "Missing committed $source_dir; integrate the owner's reviewed source before dispatch."
fi
inputs=("$source_dir" scripts/desktop-checks.sh .github/workflows/desktop-checks.yml)
if [[ "$platform" == windows ]]; then
    inputs+=(apps/safari-extension/src/ink.ts apps/safari-extension/src/mode.ts)
else
    inputs+=(pyproject.toml uv.lock)
fi
for input in "${inputs[@]}"; do
    if ! git rev-parse "$commit:$input" >> "$out/environment.txt"; then
        state=source-not-ready
        fail "Missing committed build input: $input"
    fi
done
if ! git diff --quiet "$commit" -- "${inputs[@]}" || \
    [[ -n "$(git ls-files --others --exclude-standard -- "${inputs[@]}")" ]]; then
    state=source-not-ready
    fail 'Build inputs differ from the committed candidate; preserve them and use an isolated reviewed checkout.'
fi
# Full committed closure includes sibling imports and build configuration. Ignored
# local files and prior outputs never enter this archive or the build directory.
git archive --format=tar.gz --output="$out/source.tar.gz" "$commit"
snapshot="$out/work/source"
run_logged snapshot "$python_bin" - "$out/source.tar.gz" "$snapshot" <<'PY'
import sys
import tarfile

with tarfile.open(sys.argv[1], "r:gz") as archive:
    # Preserve executable modes and safe internal links; reject links escaping
    # this new snapshot. Python 3.12 is installed by the workflow.
    archive.extractall(sys.argv[2], filter="data")
PY

if [[ "$platform" == windows ]]; then
    case "$(uname -s)" in MINGW*|MSYS*) ;; *) fail 'Windows checks require a Windows runner with Git Bash.' ;; esac
    cd "$snapshot/$source_dir"
    [[ -f package.json && -f package-lock.json ]] || { state=source-not-ready; fail 'Windows package.json/lock are not ready.'; }
    [[ ! -e dist && ! -L dist ]] || { state=source-not-ready; fail 'Committed dist output is unsupported; packaging requires a fresh owner build.'; }
    run_logged manifest node --input-type=module - <<'JS'
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = {...manifest.dependencies, ...manifest.devDependencies};
if (deps.electron !== '44.5.1' || (deps.typescript && deps.typescript !== '7.0.2')) {
  throw new Error('Unexpected desktop dependency versions');
}
for (const name of ['build', 'test']) {
  if (!manifest.scripts?.[name]) throw new Error(`Owner script ${name} is not ready`);
}
if (typeof manifest.main !== 'string' || !manifest.main) throw new Error('Owner executable entry is not ready');
const runtimeDeps = Object.keys(manifest.dependencies ?? {}).filter(name => name !== 'electron');
if (runtimeDeps.length) throw new Error(`Runtime dependencies need an owner packaging contract: ${runtimeDeps.join(', ')}`);
console.log(JSON.stringify({node: process.version, platform: process.platform, arch: process.arch,
  main: manifest.main, scripts: manifest.scripts, dependencies: deps}, null, 2));
JS
    run_logged install npm ci --ignore-scripts --no-audit --no-fund
    run_logged build npm run build
    # Electron's own installed CLI obtains its pinned runtime; never add a packager.
    run_logged electron-version npm exec --offline --no -- electron --version
    phase=electron-path
    node -p "require('electron')" > "$out/electron-path.txt" 2> "$out/electron-path-error.log"
    run_logged package "$python_bin" - "$PWD" "$out" <<'PY'
import json
from pathlib import Path
import shutil
import sys
import zipfile

app, out = map(Path, sys.argv[1:])
manifest = json.loads((app / "package.json").read_text(encoding="utf-8"))
main = (app / manifest["main"]).resolve()
dist = app / "dist"
if not main.is_relative_to(dist.resolve()) or not main.is_file():
    raise SystemExit("Built Windows entry missing or outside the reviewed dist runtime scope")
runtime = Path((out / "electron-path.txt").read_text(encoding="utf-8").strip())
if not runtime.is_file() or runtime.name.lower() != "electron.exe":
    raise SystemExit("Installed Windows Electron executable missing")
stage = out / "work" / "WindowsDesktop"
shutil.copytree(runtime.parent, stage)
packaged_app = stage / "resources" / "app"
packaged_app.mkdir()
# The owner's build copies HTML/CSS/preloads into dist beside emitted modules,
# including the reused Safari ink/mode output. Never copy arbitrary app files.
shutil.copy2(app / "package.json", packaged_app / "package.json")
shutil.copytree(dist, packaged_app / "dist")
with zipfile.ZipFile(out / "WindowsDesktop.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(stage.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(stage.parent))
PY
    run_logged tests npm test
else
    [[ "$(uname -s)" == Darwin ]] || fail 'macOS checks require a macOS runner.'
    cd "$snapshot/$source_dir"
    [[ -f Package.swift && -x package-app.sh && -f Packaging/Info.plist ]] || {
        state=source-not-ready
        fail 'Native Package.swift, executable package-app.sh and owner Info.plist are required.'
    }
    run_logged toolchain bash -e -o pipefail -c 'sw_vers; xcodebuild -version; swift --version'
    phase=manifest
    swift package describe --type json > "$out/manifest.json" 2> "$out/manifest-error.log"
    run_logged targets "$python_bin" - "$out/manifest.json" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
targets = {target["name"] for target in manifest["targets"]}
products = {product["name"] for product in manifest["products"]}
if not {"DesktopCapture", "CompanionDesktop", "DesktopCaptureTests"} <= targets or "CompanionDesktop" not in products:
    raise SystemExit("Owner executable/library/XCTest target is missing")
PY
    # The exact owner's script performs the release build, bundle assembly and
    # plist lint. Its output directory must not exist before that call.
    run_logged build-package ./package-app.sh "$out/work/macos-package"
    app="$out/work/macos-package/CompanionDesktop.app"
    [[ -x "$app/Contents/MacOS/CompanionDesktop" && -f "$app/Contents/Info.plist" ]] || fail 'Owner packaging produced no complete executable app bundle.'
    run_logged bundle "$python_bin" - "$app/Contents/Info.plist" <<'PY'
import plistlib
import sys

with open(sys.argv[1], "rb") as source:
    info = plistlib.load(source)
if info.get("CFBundleExecutable") != "CompanionDesktop":
    raise SystemExit("Owner bundle executable identity does not match its packaged binary")
print(info)
PY
    file "$app/Contents/MacOS/CompanionDesktop" > "$out/product.txt"
    run_logged package ditto -c -k --sequesterRsrc --keepParent "$app" "$out/MacDesktop.zip"
    # Reuse the release configuration; retain real Swift-emitted synthetic
    # records outside work even when another XCTest fails afterwards.
    fixture="$out/macos-fixture"
    ingress_fixture="$out/macos-ingress-fixture"
    composed_fixture="$out/macos-composed-fixture"
    mac_frame_fixture="$out/macos-retained-frame-fixture"
    run_logged tests env COMPANION_DESKTOP_FIXTURE_DIR="$fixture" \
        COMPANION_DESKTOP_INGRESS_FIXTURE_DIR="$ingress_fixture" \
        COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR="$composed_fixture" \
        COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR="$mac_frame_fixture" swift test --configuration release
    run_logged fixture "$python_bin" - "$fixture" <<'PY'
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
sessions = list(root.iterdir()) if root.is_dir() else []
if len(sessions) != 1 or not sessions[0].is_dir():
    raise SystemExit("Expected one Swift-emitted synthetic fixture session")
session = sessions[0]
status = json.loads((session / "status.json").read_text(encoding="utf-8"))
events = [json.loads(line) for line in (session / "events.jsonl").read_text(encoding="utf-8").splitlines()]
frames = sorted((session / "frames").glob("*.png"))
if not events or status.get("keptFrames") != 2 or [p.name for p in frames] != ["00000001.png", "00000004.png"]:
    raise SystemExit("Swift fixture status/events/two-frame output is missing or incomplete")
for frame in frames:
    if not frame.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
        raise SystemExit(f"Swift fixture is not PNG: {frame.name}")
print(f"Retained synthetic XCTest fixture at {session.name}; not captured display evidence.")
PY
    run_logged ingress-fixture "$python_bin" checks/validate_desktop_ingress.py "$ingress_fixture"
    run_logged composed-fixture "$python_bin" checks/validate_composed_frames.py "$composed_fixture"
    run_logged mac-frame-fixture "$python_bin" checks/validate_mac_retained_frames.py "$mac_frame_fixture"
fi
phase=complete
state=checks-completed
echo 'Build, development packaging and owner tests completed; interactive/runtime acceptance remains unverified.'
