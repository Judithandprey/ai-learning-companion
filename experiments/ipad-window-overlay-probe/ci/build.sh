#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${PROBE_OUT:-$PWD/evidence}"
BUILD="${PROBE_BUILD:-$OUT/derived}"
mkdir -p "$OUT"
{
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  sw_vers
  xcodebuild -version
  xcrun --sdk iphoneos --show-sdk-version
  xcrun --sdk iphonesimulator --show-sdk-version
  printf 'Signing: disabled. Device installation and cross-app behavior are NOT VERIFIED.\n'
} > "$OUT/environment.txt"
python3 make_project.py
plutil -lint Config/*.plist WindowOverlayProbe.xcodeproj/project.pbxproj > "$OUT/project-lint.txt"
for sdk in iphoneos iphonesimulator; do
  destination='generic/platform=iOS'
  [[ "$sdk" == iphonesimulator ]] && destination='generic/platform=iOS Simulator'
  for target in GlassProbe BackdropProbe; do
    xcodebuild -project WindowOverlayProbe.xcodeproj -scheme "$target" \
      -sdk "$sdk" -destination "$destination" -configuration Release \
      -derivedDataPath "$BUILD/$sdk" \
      CODE_SIGNING_ALLOWED=NO build 2>&1 | tee "$OUT/$target-$sdk.log"
    app="$BUILD/$sdk/Build/Products/Release-$sdk/$target.app"
    test -d "$app"
    if [[ "$sdk" == iphoneos ]]; then
      stage="$OUT/stage-$target"
      mkdir -p "$stage/Payload"
      ditto "$app" "$stage/Payload/$target.app"
      ditto -c -k --keepParent "$stage/Payload" "$OUT/$target-unsigned.ipa"
      file "$app/$target" >> "$OUT/device-binaries.txt"
    else
      ditto -c -k --keepParent "$app" "$OUT/$target-simulator.zip"
    fi
  done
done
python3 ci/simulator_smoke.py "$BUILD/iphonesimulator/Build/Products/Release-iphonesimulator" "$OUT"
shasum -a 256 "$OUT"/*.ipa "$OUT"/*-simulator.zip > "$OUT/SHA256SUMS.txt"
