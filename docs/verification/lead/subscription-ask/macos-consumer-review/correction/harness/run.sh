#!/bin/bash
set -e
cd /tmp/mac-ask-704894f-review/harness
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
files=(src/*.swift)
args=()
for f in "${files[@]}"; do
  if [[ "$f" != src/main.swift ]]; then args+=("$f"); fi
done
exec /tmp/lc-review-0212/tc/usr/bin/swift-frontend -interpret -sdk /tmp/lc-review-0212/sysroot -swift-version 5 -module-name LCRun -lXCTest src/main.swift "${args[@]}"
