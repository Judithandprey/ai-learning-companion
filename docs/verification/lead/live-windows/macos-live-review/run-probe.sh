#!/bin/bash
set -euo pipefail
cd /tmp/lc-lead-live-lifecycle-3147291
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
files=()
for file in src/*.swift; do [[ "$file" == src/main.swift ]] || files+=("$file"); done
exec /tmp/lc-review-0212/tc/usr/bin/swift-frontend -interpret -sdk /tmp/lc-review-0212/sysroot -swift-version 5 -module-name LCLeadProbe -lXCTest src/main.swift "${files[@]}"
