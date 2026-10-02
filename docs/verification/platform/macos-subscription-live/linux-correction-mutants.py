#!/usr/bin/env python3
"""Bounded Linux stand-in mutation probes; private copies only, no model/account/device.

Requires the recovered /tmp/lc-link-run and /tmp/lc-review-0212 harness. Each selected
test must pass on the unmodified snapshot first. A failed assertion catches a mutant;
the latency mutant may also reproduce the integer-overflow trap it deliberately removes.
"""
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

HARNESS = Path('/tmp/lc-link-run')
OUTPUT = Path(__file__).resolve().parent / 'mutations'
CASES = [
    ('C01', 'LiveWire.swift', 'latency.doubleValue >= 0, latency.doubleValue <= 9_007_199_254_740_991,',
     'latency.doubleValue >= 0,', 'testLiveMalformedLatencyIsRefusedWithoutIntegerOverflow'),
    ('C02', 'LiveLink.swift', 'current.pictureUnavailable(reason)', 'current.missed = reason',
     'testLiveMissingCurrentPictureDropsWaitingLooksAndSurvivesLateResults'),
    ('C03', 'LiveSession.swift', 'if canObserve(turn.frameSeq) { missed = nil }', 'missed = nil',
     'testLiveMissingCurrentPictureDropsWaitingLooksAndSurvivesLateResults'),
    ('C04', 'LiveLink.swift',
     'guard session.canObserve(next.seq) else {\n            return missed(session.missed ?? "an explicit request took priority over this look", .notObserved)\n        }',
     '', 'testLiveFocusAndStopCannotBeOvertakenByAnOlderRenderingLook'),
    ('C05', 'LiveLink.swift',
     'fence(requestID, reason: "a new explicit request took priority")\n            await interrupt(requestID)',
     'fence(requestID, reason: "a new explicit request took priority")',
     'testLiveExplicitFocusJoinsAnInterruptedObservationBeforeSending'),
    ('C06', 'LiveLink.swift', 'reserved.out += 1', 'reserved.out += 0',
     'testLiveExplicitFocusJoinsAnInterruptedObservationBeforeSending'),
    ('C07', 'LiveLink.swift',
     'if let ending, let current = child, current === ending { child = nil }\n        await retired()\n        resolveWaiting()',
     'if let ending, let current = child, current === ending { child = nil }\n        resolveWaiting()',
     'testLiveQuitAndConnectJoinTheRetiringChild'),
    ('C08', 'LiveSession.swift', 'if !unrepresented.isEmpty || !omittedGaps.isEmpty {', 'if false {',
     'testLiveContextIsWholeEntriesWithinBoundsAndStatedGaps'),
]


def run(case):
    name, filename, old, new, test = case
    root = Path('/tmp/lc-live-correction-mutants')
    root.mkdir(exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix=name + '-', dir=root))
    shutil.copytree(HARNESS / 'src', directory / 'src')
    file = directory / 'src' / filename
    source = file.read_text()
    if source.count(old) != 1:
        return f'{name}: NOT APPLIED (pattern count {source.count(old)})'
    file.write_text(source.replace(old, new))
    command = ['/tmp/lc-review-0212/tc/usr/bin/swift-frontend', '-interpret', '-sdk',
               '/tmp/lc-review-0212/sysroot', '-swift-version', '5', '-module-name',
               'LCRun', '-lXCTest', 'src/main.swift']
    command += sorted('src/' + p.name for p in (directory / 'src').glob('*.swift') if p.name != 'main.swift')
    env = dict(os.environ, LD_LIBRARY_PATH='/tmp/lc-review-0212/libs', LC_TESTS='live', LC_ONLY=test)
    try:
        result = subprocess.run(command, cwd=directory, env=env, capture_output=True, text=True, timeout=200)
        log = result.stdout + result.stderr
        (OUTPUT / (name + '.txt')).write_text(log)
        totals = re.findall(r'Executed (\d+) tests?, with (\d+) failures?', log)
        assertion = bool(totals and int(totals[-1][0]) == 1 and int(totals[-1][1]) > 0)
        overflow = name == 'C01' and result.returncode != 0 and 'cannot be converted to Int' in log
        return f'{name}: {"CAUGHT" if assertion or overflow else "NOT CAUGHT"}; test={test}; exit={result.returncode}; ' + (
            'integer-overflow trap' if overflow else str(totals[-1] if totals else 'no XCTest completion'))
    except subprocess.TimeoutExpired:
        return f'{name}: NOT COMPLETED (200-second bound)'


if __name__ == '__main__':
    OUTPUT.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        rows = list(pool.map(run, [case for case in CASES if not sys.argv[1:] or case[0] in sys.argv[1:]]))
    print('\n'.join(rows))
    raise SystemExit(0 if all(': CAUGHT;' in row for row in rows) else 1)
