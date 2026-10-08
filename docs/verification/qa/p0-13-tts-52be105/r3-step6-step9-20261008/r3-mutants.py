import subprocess, shutil, os, tempfile, re
from concurrent.futures import ThreadPoolExecutor
WT=os.environ.get('LC_QA_WT', os.getcwd())
NODE=os.environ.get('LC_QA_NODE', 'node')
G='tests/e2e/windows/qa_tts_output_candidate.mjs'
FIX="const admissionPointsFixed = String.raw`    for ($card = 0; $card -lt 12; $card++) { $points += ,@(((40 + $card % 4 * 210 + 95) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2)) }`;"
def line(body): return "const admissionPointsFixed = String.raw`    for ($card = 0; $card -lt 12; $card++) { $points += ,@(" + body + ") }`;"
M=[
 ('only x parenthesized (y still beside the comma)', FIX, line("((40 + $card % 4 * 210 + 95) * 2), (90 + [Math]::Floor($card / 4) * 170 + 75) * 2")),
 ('only y parenthesized', FIX, line("(40 + $card % 4 * 210 + 95) * 2, ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2)")),
 ('scale dropped on y', FIX, line("((40 + $card % 4 * 210 + 95) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75))")),
 ('column count 3 instead of 4', FIX, line("((40 + $card % 3 * 210 + 95) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2)")),
 ('x and y swapped', FIX, line("((90 + [Math]::Floor($card / 4) * 170 + 75) * 2), ((40 + $card % 4 * 210 + 95) * 2)")),
 ('card centre offset 95 -> 90', FIX, line("((40 + $card % 4 * 210 + 90) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2)")),
 ('one array of three values', FIX, line("((40 + $card % 4 * 210 + 95) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2), 0")),
 ('a corner dropped', "$points += ,@(20, 20); $points += ,@(2540, 20); $points += ,@(20, 1580); $points += ,@(2540, 1580)", "$points += ,@(20, 20); $points += ,@(2540, 20); $points += ,@(20, 1580)"),
 ('client area: only its first line renamed', "const placementClientFixed = placementClientHead.replaceAll('$client', () => '$clientArea');", "const placementClientFixed = placementClientHead.replace('$client', () => '$clientArea');"),
 ('client area: renamed to a different name', "const placementClientFixed = placementClientHead.replaceAll('$client', () => '$clientArea');", "const placementClientFixed = placementClientHead.replaceAll('$client', () => '$clientBox');"),
 ('client area: delta not applied', "  built.runner = applyPlacementClient(applyAdmissionPoints(applyEdgeIdentity(applyScopedAdmission(built.runner, ctx))));", "  built.runner = applyAdmissionPoints(applyEdgeIdentity(applyScopedAdmission(built.runner, ctx)));"),
 ('delta not applied (old line emitted)', "  built.runner = applyPlacementClient(applyAdmissionPoints(applyEdgeIdentity(applyScopedAdmission(built.runner, ctx))));", "  built.runner = applyPlacementClient(applyEdgeIdentity(applyScopedAdmission(built.runner, ctx)));"),
]
def run(m):
    name,a,b=m
    d=tempfile.mkdtemp(prefix='qa-mutpts-')
    for sub in ['tests/e2e/windows','docs/verification/qa/p0-13-tts-52be105','docs/verification/qa/p0-13-live-1755153']:
        shutil.copytree(os.path.join(WT,sub),os.path.join(d,sub),ignore=shutil.ignore_patterns('execution-*'))   # attempt evidence is never copied
    target = G
    p=os.path.join(d,target); s=open(p).read()
    if s.count(a)!=1:
        # the corner line lives in the shared helper, emitted unchanged
        target='tests/e2e/windows/qa_display_admission.ps1'; p=os.path.join(d,target); s=open(p).read()
        if s.count(a)!=1: shutil.rmtree(d); return (name,'BAD MUTANT',[])
    open(p,'w').write(s.replace(a,b))
    g=subprocess.run([NODE,'--test','tests/e2e/windows/test_qa_tts_output_candidate.mjs'],capture_output=True,text=True,cwd=d,env=dict(os.environ,LC_QA_TTS_STATIC_RECEIPT=os.path.join(d,'docs/verification/qa/p0-13-tts-52be105/stage-identity.json')))
    fails=sorted({re.sub(r' \([\d.]+ms\)$','',l[2:]) for l in g.stdout.splitlines() if l.startswith('✖') and 'failing tests' not in l})
    pins=('pinned by their reviewed hashes','differs from the runner that ran as attempt 1')
    beyond=[f for f in fails if not any(x in f for x in pins)]
    shutil.rmtree(d)
    return (name+(' [in '+target.split('/')[-1]+']' if target!=G else ''), 'CAUGHT' if beyond else ('PIN ONLY' if fails else 'SURVIVED'), beyond)
with ThreadPoolExecutor(5) as ex: res=list(ex.map(run,M))
for name,v,b in res:
    print(f"{name}: {v}")
    for f in b[:3]: print('    -', f[:150])
print(f"\n{sum(v=='CAUGHT' for _,v,_ in res)}/{len(res)} caught beyond the hash pins and the whole-runner comparison")
