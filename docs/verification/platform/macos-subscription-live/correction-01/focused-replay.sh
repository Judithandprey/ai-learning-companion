#!/bin/bash
# Foreground source-only Linux replay; never launches a provider, device or paid operation.
set -euo pipefail
HARNESS=/tmp/lc-live-correction-focused
SWIFT_FRONTEND=/tmp/lc-review-0212/tc/usr/bin/swift-frontend
SYSROOT=/tmp/lc-review-0212/sysroot
export LD_LIBRARY_PATH=/tmp/lc-review-0212/libs
cd "$HARNESS"
case "${1:-}" in
typecheck)
    exec "$SWIFT_FRONTEND" -typecheck -sdk "$SYSROOT" -swift-version 5 -module-name LCRun src/*.swift
    ;;
run|realchild)
    sources=(src/*.swift)
    libraries=()
    for source in "${sources[@]}"; do
        if [[ "$source" != src/main.swift ]]; then libraries+=("$source"); fi
    done
    entrypoint=src/main.swift
    if [[ "$1" == realchild ]]; then entrypoint=realchild/main.swift; fi
    exec "$SWIFT_FRONTEND" -interpret -sdk "$SYSROOT" -swift-version 5 -module-name LCRun -lXCTest "$entrypoint" "${libraries[@]}"
    ;;
*)
    echo 'usage: focused-replay.sh typecheck|run|realchild' >&2
    exit 2
    ;;
esac
