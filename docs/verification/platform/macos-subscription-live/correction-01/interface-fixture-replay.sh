#!/bin/bash
# Execute one synthetic fixture method and the unchanged released local validator, no provider.
set -euo pipefail
E=$(cd "$(dirname "$0")" && pwd)
H=${LC_INTERFACE_RESULTS:-$(mktemp -d /tmp/lc-interface-fixture.XXXXXX)}
SW=/tmp/lc-review-0212/tc/usr/bin/swift-frontend
S=/tmp/lc-review-0212/sysroot
PY=/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
python3 "$E/interface-fixture-prepare.py" "$H"
cd "$H"
libraries=()
for source in src/*.swift; do
    if [[ "$source" != src/main.swift ]]; then libraries+=("$source"); fi
done
COMPANION_DESKTOP_LIVE_FIXTURE_DIR="$H/fixture" "$SW" -interpret -sdk "$S" -swift-version 5 -module-name LCInterfaceFixture -lXCTest src/main.swift "${libraries[@]}"
"$PY" -B "$E/interface-fixture-validate.py" "$H/fixture"
echo "RESULTS=$H"
