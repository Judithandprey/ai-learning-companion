#!/bin/sh
# Builds CompanionDesktop.app from this package, unsigned, into a new directory.
#
#   apps/macos/CompanionDesktop/package-app.sh OUTPUT_DIR
#
# Needs macOS 15 or later with Xcode 16 or later (Swift 6 toolchain). OUTPUT_DIR must not exist
# yet; nothing existing is replaced. The bundle is not signed or notarized: on Apple silicon the
# executable carries only the linker's automatic ad-hoc signature. How macOS's screen-recording
# permission treats such a bundle is part of the unverified runtime check.
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 OUTPUT_DIR" >&2
  exit 2
fi
package=$(cd "$(dirname "$0")" && pwd)
output=$1
if [ -e "$output" ]; then
  echo "$output already exists; choose a new directory" >&2
  exit 1
fi

swift build --package-path "$package" -c release --product CompanionDesktop
binary="$(swift build --package-path "$package" -c release --show-bin-path)/CompanionDesktop"

app="$output/CompanionDesktop.app"
mkdir -p "$app/Contents/MacOS"
cp "$binary" "$app/Contents/MacOS/CompanionDesktop"
cp "$package/Packaging/Info.plist" "$app/Contents/Info.plist"
plutil -lint "$app/Contents/Info.plist"
echo "$app"
