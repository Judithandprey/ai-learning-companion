#!/usr/bin/env bash
set -euo pipefail
LD_LIBRARY_PATH=/tmp/lc-review-0212/libs /tmp/lc-review-0212/tc/usr/bin/swift-frontend -interpret -sdk /tmp/lc-review-0212/sysroot -module-cache-path /tmp/macos-storage-30807-runtime-probes/module-cache -swift-version 5 /tmp/macos-storage-30807-runtime-probes/probe.swift > /tmp/macos-storage-30807-runtime-probes/result.json 2> /tmp/macos-storage-30807-runtime-probes/stderr
cat /tmp/macos-storage-30807-runtime-probes/result.json
