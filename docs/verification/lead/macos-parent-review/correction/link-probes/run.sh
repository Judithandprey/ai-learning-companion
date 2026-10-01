#!/bin/bash
set -euo pipefail
cd /tmp/mac-parent-fb891-review.probes
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
files=()
for file in src/*.swift; do
  if [[ "$file" != src/main.swift ]]; then files+=("$file"); fi
done
exec /tmp/lc-review-0212/tc/usr/bin/swift-frontend -interpret -sdk /tmp/lc-review-0212/sysroot -module-cache-path /tmp/mac-parent-fb891-review.probes/module-cache -swift-version 5 -module-name LCParentCorrection src/main.swift "${files[@]}"
