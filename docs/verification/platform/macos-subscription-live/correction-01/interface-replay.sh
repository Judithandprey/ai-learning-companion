#!/bin/bash
# Bounded foreground check against existing Linux Apple/UI stand-ins, no native/model claim.
set -euo pipefail
E=$(cd "$(dirname "$0")" && pwd)
W=/home/agentsdock/Projects/learning-companion/wt-platform
T=$W/apps/macos/CompanionDesktop
B=/tmp/lc-parent-harness
A=/tmp/lc-app-check
SW=/tmp/lc-review-0212/tc/usr/bin/swiftc
S=/tmp/lc-review-0212/sysroot
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
case "${1:-}" in
prepare)
    exec python3 "$E/interface-prepare.py"
    ;;
module)
    "$SW" -version
    exec bash "$B/build.sh"
    ;;
app)
    "$SW" -sdk "$S" -swift-version 5 -parse-as-library -emit-module -module-name UIStub -emit-module-path "$B/out/UIStub.swiftmodule" "$A/UIStub.swift"
    "$SW" -sdk "$S" -swift-version 5 -parse-as-library -I "$B/out" -typecheck -module-name CompanionDesktop "$A/LiveControllerClass.swift"
    echo 'PASS: LiveController class typechecks against separate DesktopCapture public module (no @testable import).'
    for name in CaptureController CaptureRun InkController LiveController; do
        "$SW" -swift-version 5 -parse "$T/Sources/CompanionDesktop/$name.swift"
        echo "PASS: syntax parse $name.swift"
    done
    ;;
*)
    echo 'usage: interface-replay.sh prepare|module|app' >&2
    exit 2
    ;;
esac
