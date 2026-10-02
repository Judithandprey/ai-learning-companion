#!/bin/bash
# Replays ONE bounded Linux stand-in check. See README.md for prerequisites/limits.
# It never installs a toolchain, obtains approval, launches Codex or uses a model/account.
set -euo pipefail
E=$(cd "$(dirname "$0")" && pwd)
W=/home/agentsdock/Projects/learning-companion/wt-platform
H=/tmp/lc-link-run
B=/tmp/lc-parent-harness
A=/tmp/lc-app-check
T=$W/apps/macos/CompanionDesktop
PY=/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python
SW=/tmp/lc-review-0212/tc/usr/bin/swiftc
S=/tmp/lc-review-0212/sysroot
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
# Logs/fixtures from a replay belong in a new temporary directory, not these retained logs.
RESULTS=${LC_RECHECK_RESULTS:-$(mktemp -d /tmp/lc-live-recheck.XXXXXX)}
mkdir -p "$RESULTS"
case "${1:-}" in
prepare)
    mkdir -p "$H/src" "$H/livecheck" "$B/src" "$B/fshim" "$B/mods" "$A"
    cp "$E/harness-sync.sh" "$H/sync.sh"
    cp "$E/harness-run.sh" "$H/run.sh"
    cp "$E/harness-genmain.py" "$H/genmain.py"
    cp "$E/linux-apple-stand-ins.swift" "$H/src/AppleShim.swift"
    cp "$E/probe-real-live-connector.swift" "$H/src/ZRealLiveConnectorProbe.swift"
    cp "$E/probe-real-live-stand-in.py" "$H/livecheck/real_live_stand_in.py"
    cp "$E/harness-module-build.sh" "$B/build.sh"
    cp "$E/linux-module-apple-stand-ins.swift" "$B/fshim/AppleShim.swift"
    cp "$E"/harness-modules/*.swift "$B/mods/"
    cp "$E/linux-ui-stand-ins.swift" "$A/UIStub.swift"
    bash "$H/sync.sh"
    python3 "$H/genmain.py"
    ;;
typecheck)
    "$SW" -typecheck -sdk "$S" -swift-version 5 -module-name LCRun "$H"/src/*.swift
    ;;
module)
    cp "$T"/Sources/DesktopCapture/*.swift "$B/src/"
    python3 - "$B/src" <<'PY'
from pathlib import Path
import re,sys
for p in Path(sys.argv[1]).glob('*.swift'):
    s=p.read_text()
    if ('URLSession' in s or 'URLRequest' in s) and 'import CFNetwork' not in s:
        s='import CFNetwork\n'+s
    if p.name=='MacIngressUpload.swift':
        s=re.sub(r'^(\s*)configuration.waitsForConnectivity = false',r'\1// LINUX-ONLY-PATCH configuration.waitsForConnectivity = false',s,flags=re.M)
    p.write_text(s)
PY
    bash "$B/build.sh"
    ;;
app)
    python3 - "$T" "$A" <<'PY'
from pathlib import Path
import sys
source=Path(sys.argv[1],'Sources/CompanionDesktop/LiveController.swift').read_text()
marker="/// The connection to the user's ChatGPT subscription and the AI's session, in the main window."
source=source[:source.index(marker)].replace('import AppKit\n','import UIStub\n').replace('import SwiftUI\n','')
Path(sys.argv[2],'LiveControllerClass.swift').write_text(source+'\nstruct LiveCardView: View {}\n')
PY
    "$SW" -sdk "$S" -swift-version 5 -parse-as-library -emit-module -module-name UIStub -emit-module-path "$B/out/UIStub.swiftmodule" "$A/UIStub.swift"
    "$SW" -sdk "$S" -swift-version 5 -parse-as-library -I "$B/out" -typecheck -module-name CompanionDesktop "$A/LiveControllerClass.swift"
    for file in "$T"/Sources/CompanionDesktop/*.swift; do "$SW" -parse "$file"; done
    ;;
live|all)
    LC_TESTS="$1" bash "$H/run.sh"
    ;;
fixture)
    COMPANION_DESKTOP_LIVE_FIXTURE_DIR="$RESULTS/fixture" LC_TESTS=live LC_ONLY=testLiveSessionLinesForTheReleasedValidator bash "$H/run.sh"
    cd "$W"
    "$PY" -B apps/macos/CompanionDesktop/checks/validate_live_session.py "$RESULTS/fixture" "$RESULTS/fixture/results.jsonl"
    ;;
connector)
    LC_TESTS=rlconn bash "$H/run.sh"
    ;;
mutations)
    cp "$E/linux-correction-mutants.py" "$RESULTS/mutants.py"
    python3 "$RESULTS/mutants.py"
    ;;
*)
    echo 'usage: linux-checks.sh prepare|typecheck|module|app|live|all|fixture|connector|mutations' >&2
    exit 2
    ;;
esac
