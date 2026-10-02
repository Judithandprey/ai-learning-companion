#!/bin/bash
set -e
H=/tmp/lc-link-run; T=/home/agentsdock/Projects/learning-companion/wt-platform/apps/macos/CompanionDesktop
for f in $T/Sources/DesktopCapture/*.swift $T/Tests/DesktopCaptureTests/*.swift; do
  n=$(basename $f)
  { printf 'import Foundation\nimport FoundationNetworking\nimport Glibc\n'; grep -v -E '^(import (CoreGraphics|CoreImage|CoreMedia|CoreVideo|CryptoKit|ImageIO|ScreenCaptureKit|CFNetwork|Darwin)|@testable import DesktopCapture)$' $f; } > $H/src/$n
done
sed -i 's/^\(\s*\)configuration.waitsForConnectivity = false/\1\/\/ LINUX-ONLY-PATCH configuration.waitsForConnectivity = false/' $H/src/MacIngressUpload.swift
