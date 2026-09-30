"""Portable arithmetic/source witness, not execution of Swift or macOS tests."""
from pathlib import Path
import math
import sys

ROOT = Path(sys.argv[1])
domain = (ROOT / 'Sources/DesktopCapture/Ink.swift').read_text()
view = (ROOT / 'Sources/CompanionDesktop/InkViews.swift').read_text()
controller = (ROOT / 'Sources/CompanionDesktop/InkController.swift').read_text()

# Exact source guards: this witness must not survive a change of the reviewed rule.
assert 'let hit = stroke.points.map { point in Self.distance(from: point, to: path) <= Self.eraserRadius }' in domain
assert 'guard hit.contains(true) else { continue }' in domain
assert 'public static let eraserRadius = 8.0' in domain
assert 'path.line(to: NSPoint(x: point.x, y: point.y))' in view

def distance_to_segment(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    squared = dx * dx + dy * dy
    t = 0 if squared == 0 else max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / squared))
    return math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy))

stroke = [(0, 10), (100, 10)]
erase = [(50, 0), (50, 20)]
sample_distances = [distance_to_segment(p, *erase) for p in stroke]
assert sample_distances == [50.0, 50.0]
assert not any(d <= 8 for d in sample_distances)
assert distance_to_segment((50, 10), *erase) == 0
assert distance_to_segment((50, 10), *stroke) == 0
print('WITNESS erase: drawn segment crosses eraser; sampled endpoint distances 50, 50 > 8; actual source takes no-hit branch')

assert 'appending(path: "ink.conflict-\\(UUID().uuidString.prefix(8)).json")' in domain
assert 'let file = session.appending(path: "ink/ink.json")' in domain
assert 'fileURL = sessionDirectory.appending(path: "ink", directoryHint: .isDirectory).appending(path: "ink.json")' in domain
assert 'let earlier = InkStore(sessionDirectory: found)' in controller
assert 'let document = try earlier.load()' in controller
print('SOURCE TRACE conflict: save forks ink.conflict-*.json; latestDocument and reopened InkStore load only ink/ink.json')
print('No Swift build, XCTest, AppKit input, atomic-write fault injection or real Mac execution was performed.')
