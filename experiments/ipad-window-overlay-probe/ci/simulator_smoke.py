"""Launch both independent apps. Never count this as physical overlay acceptance."""
import json
from pathlib import Path
import subprocess
import sys
import time

products, out = map(Path, sys.argv[1:])

def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)

report = {'scope': 'simulator launch smoke only', 'physicalDevice': 'NOT_TESTED',
          'transparencyOverOtherApp': 'NOT_TESTED', 'crossAppFingerRouting': 'NOT_TESTED',
          'physicalPencil': 'NOT_TESTED', 'persistentTopmost': 'NOT_TESTED', 'launches': []}
device = None
try:
    runtimes = json.loads(run('xcrun', 'simctl', 'list', 'runtimes', '-j'))['runtimes']
    candidates = [r for r in runtimes if r.get('isAvailable') and 'iOS' in r['identifier']]
    candidates.sort(key=lambda r: (r.get('version') == '26.5', tuple(int(x) for x in r.get('version', '0').split('.'))), reverse=True)
    if not candidates:
        raise RuntimeError('No available iOS Simulator runtime; compile is not launch proof.')
    runtime = candidates[0]
    types = json.loads(run('xcrun', 'simctl', 'list', 'devicetypes', '-j'))['devicetypes']
    ipad = next((t for t in types if 'iPad Pro 13-inch' in t['name'] and 'M5' in t['name']), None)
    ipad = ipad or next(t for t in reversed(types) if 'iPad' in t['name'])
    device = run('xcrun', 'simctl', 'create', 'WindowOverlayProbe', ipad['identifier'], runtime['identifier']).strip()
    report.update(runtime=runtime, simulatedDevice=ipad, simulatorUDID=device)
    run('xcrun', 'simctl', 'boot', device)
    run('xcrun', 'simctl', 'bootstatus', device, '-b')
    for target in ['BackdropProbe', 'GlassProbe']:
        run('xcrun', 'simctl', 'install', device, str(products / f'{target}.app'))
        bundle = 'org.learningcompanion.experiment.' + target.lower()
        result = run('xcrun', 'simctl', 'launch', device, bundle)
        time.sleep(3)
        pid = int(result.strip().rsplit(':', 1)[-1].strip())
        processes = run('xcrun', 'simctl', 'spawn', device, 'launchctl', 'list')
        alive = any(parts and parts[0] == str(pid) for parts in
                    (line.split() for line in processes.splitlines()))
        if not alive:
            raise RuntimeError(f'{target} returned PID {pid} but was not alive after 3 seconds.')
        run('xcrun', 'simctl', 'io', device, 'screenshot', str(out / f'{target}-launch.png'))
        report['launches'].append({'app': target, 'result': result.strip(),
                                  'aliveAfter3Seconds': True, 'screenshot': f'{target}-launch.png'})
    report['simulatorLaunch'] = 'PASS'
except Exception as exc:
    report['simulatorLaunch'] = 'FAIL'
    report['error'] = str(exc)
    raise
finally:
    (out / 'simulator-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if device:
        subprocess.run(['xcrun', 'simctl', 'shutdown', device], capture_output=True)
