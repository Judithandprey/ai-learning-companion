#!/usr/bin/env python3
"""Bounded arithmetic/source witnesses only. Does NOT compile or execute Swift."""
from math import hypot, sqrt, isclose
from pathlib import Path
import sys

root = Path(sys.argv[1])
base = root / 'apps/macos/CompanionDesktop'
ink = (base / 'Sources/DesktopCapture/Ink.swift').read_text()
controller = (base / 'Sources/CompanionDesktop/InkController.swift').read_text()
records = (base / 'Sources/DesktopCapture/CaptureRecords.swift').read_text()
ingress = (base / 'Sources/DesktopCapture/DesktopIngress.swift').read_text()
tests = (base / 'Tests/DesktopCaptureTests/InkTests.swift').read_text()

# Source anchors bind this bounded arithmetic port to the exact reviewed formulas.
for source in (
    'let discriminant = half * half - lengthSquared * (wx * wx + wy * wy - radius * radius)',
    'let parts = [disc(c), disc(d), band(c, d)].compactMap { $0 }',
    '(high - low) * length > negligible',
    'parent: stroke.id', 'anchor: stroke.anchor', 'interpolated: true',
    'document.strokes.append(contentsOf: pieces)',
):
    assert source in ink


def intervals(a, b, path):
    """Candidate's capsule interval formula, independently stated in Python."""
    u = (b[0] - a[0], b[1] - a[1])
    ll = u[0] ** 2 + u[1] ** 2
    assert ll > 0  # This witness targets sparse nonzero segments.
    def solve(p, q, low, high):
        if q == 0:
            return (0, 1) if low <= p <= high else None
        roots = sorted(((low - p) / q, (high - p) / q))
        lo, hi = max(roots[0], 0), min(roots[1], 1)
        return (lo, hi) if lo <= hi else None
    def disc(c):
        w = (a[0] - c[0], a[1] - c[1])
        half = u[0] * w[0] + u[1] * w[1]
        d = half * half - ll * (w[0] ** 2 + w[1] ** 2 - 64)
        if d < 0:
            return None
        lo, hi = max((-half - sqrt(d)) / ll, 0), min((-half + sqrt(d)) / ll, 1)
        return (lo, hi) if lo <= hi else None
    def band(c, d):
        v = (d[0] - c[0], d[1] - c[1]); vv = v[0] ** 2 + v[1] ** 2
        if vv == 0:
            return None
        w = (a[0] - c[0], a[1] - c[1])
        along = solve((w[0] * v[0] + w[1] * v[1]) / vv, (u[0] * v[0] + u[1] * v[1]) / vv, 0, 1)
        across = solve((v[0] * w[1] - v[1] * w[0]) / sqrt(vv), (v[0] * u[1] - v[1] * u[0]) / sqrt(vv), -8, 8)
        if along is None or across is None:
            return None
        lo, hi = max(along[0], across[0]), min(along[1], across[1])
        return (lo, hi) if lo <= hi else None
    pieces = []
    for c, d in (zip(path, path[1:]) if len(path) > 1 else [(path[0], path[0])]):
        parts = [i for i in (disc(c), disc(d), band(c, d)) if i is not None]
        if parts:
            lo, hi = min(i[0] for i in parts), max(i[1] for i in parts)
            if (hi - lo) * sqrt(ll) > 1e-9:
                pieces.append((lo, hi))
    merged = []
    for lo, hi in sorted(pieces):
        if merged and lo <= merged[-1][1]:
            merged[-1] = merged[-1][0], max(hi, merged[-1][1])
        else:
            merged.append((lo, hi))
    return merged

cases = [
    ((0, 10), (100, 10), [(50, 0), (50, 20)], [(0.42, 0.58)]),
    ((10, 0), (10, 100), [(0, 50), (20, 50)], [(0.42, 0.58)]),
    ((0, 58), (100, 58), [(50, 50)], []),
    ((0, 54), (100, 54), [(50, 50)], [((50 - sqrt(48)) / 100, (50 + sqrt(48)) / 100)]),
    ((0, 0), (100, 0), [(20, 0), (20, 100), (80, 100), (80, 0)], [(0.12, 0.28), (0.72, 0.88)]),
]
for a, b, path, expected in cases:
    actual = intervals(a, b, path)
    assert len(actual) == len(expected), (actual, expected)
    assert all(isclose(x, y, abs_tol=1e-12) for pair, want in zip(actual, expected) for x, y in zip(pair, want))
assert isclose(2 + (3 - 2) * 0.42, 2.42)
assert isclose(0.2 + (0.6 - 0.2) * 0.42, 0.368)
print('PASS five bounded capsule arithmetic cases and interpolated sample facts (Python, not Swift)')

assert 'public var interpolated: Bool?' in ink and 'public var establishedHost: Double?' in ink
assert 'public static let currentSchemaVersion = 1' in ink
assert 'let context = pending.context' in ink and 'establishedHost: pending.host' in ink
assert 'let context = selection ?? .unrecorded' in ink
assert 'if let problem = context.geometryProblem ?? geometryProblem.map' in ink
assert 'let earlier = InkStore(documentFile: found)' in controller
assert 'let skipped = Set(excluded.map(key))' in ink
assert '$0.hasPrefix("ink.conflict-")' in ink and 'InkStore(documentFile: file).load()' in ink
assert 'try bytes.write(to: fileURL, options: .atomic)' in ink
assert 'try bytes.write(to: file, options: .withoutOverwriting)' in ink
assert 'guard try Data(contentsOf: file) == bytes' in ink
assert 'documents.append((session, store))' in ink
assert 'display.scope.hasPrefix(DisplayFacts.inkOverlayScopePrefix)' in ingress
assert 'guard scopes.contains(display.scope)' in ingress
assert 'public var scope: String' in records
assert 'public static func inkOverlayScope(showsCursor: Bool)' in records
assert 'CGRect(x: 0, y: 1, width: 1, height: 1)' in tests
assert 'CGRect(x: 20, y: 60, width: 200, height: 150)' in tests
assert 'XCTAssertNotEqual(pixel(a, 0, 0), pixel(a, 0, 1))' in tests
print('PASS correction source witnesses for optional migration, pinning, conflict reopen, unsaved retention, scope refusal and crop controls')
print('No Swift/Foundation/AppKit/PNG runtime or filesystem persistence behavior was executed')
