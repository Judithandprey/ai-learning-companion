import subprocess, shutil, os, tempfile, re
from concurrent.futures import ThreadPoolExecutor
WT=os.environ.get('LC_QA_WT', os.getcwd())
NODE=os.environ.get('LC_QA_NODE', 'node')
G='tests/e2e/windows/qa_tts_output_candidate.mjs'
ABS_W="[Math]::Abs(($clientArea[2] - $clientArea[0]) - $box.viewport[0] * $box.dpr) -ge $box.dpr"
ABS_H="[Math]::Abs(($clientArea[3] - $clientArea[1]) - $box.viewport[1] * $box.dpr) -ge $box.dpr"
M=[
 ('height term dropped', ABS_H+" -or ", ""),
 ('width term dropped', ABS_W+" -or ", ""),
 ('tolerance one CSS px too wide (-gt)', ABS_H, ABS_H.replace('-ge $box.dpr','-gt $box.dpr')),
 ('tolerance fixed at 4 px', ABS_W, ABS_W.replace('-ge $box.dpr','-ge 4')),
 ('dpi term dropped', "if ($clientArea[4] -ne 192 -or [Math]::Abs((", "if ([Math]::Abs(("),
 ('centre-x term dropped', ABS_H+" -or $box.x -le 0 -or $box.x -ge $box.viewport[0]", ABS_H+" -or $box.x -le 0"),
 ('box record dropped', "  $entry.control_box = [ordered]@{ viewport = @($box.viewport); dpr = $box.dpr; x = $box.x; y = $box.y; width = $box.width; height = $box.height; shown = $box.shown }\n", ""),
 ('box record after the check', None, None),
 ('delta not applied', "  built.runner = applyPlacementGeometry(applyPlacementClient(", "  built.runner = (applyPlacementClient("),
]
def run(m):
    name,a,b=m
    d=tempfile.mkdtemp(prefix='qa-mutgeo-')
    for sub in ['tests/e2e/windows','docs/verification/qa/p0-13-tts-52be105','docs/verification/qa/p0-13-live-1755153']:
        shutil.copytree(os.path.join(WT,sub),os.path.join(d,sub),ignore=shutil.ignore_patterns('execution-*'))   # attempt evidence is never copied
    p=os.path.join(d,G); s=open(p).read()
    if a is None:   # move the record line after the check
        i=s.index("const placementGeometryFixed = String.raw`"); j=s.index("`;", i)
        body=s[i+len("const placementGeometryFixed = String.raw`"):j]; rec,chk=body.split('\n')
        s=s[:i]+"const placementGeometryFixed = String.raw`"+chk+'\n'+rec+s[j:]
    else:
        if s.count(a)!=1: shutil.rmtree(d); return (name,'BAD MUTANT %d'%s.count(a),[])
        s=s.replace(a,b)
    open(p,'w').write(s)
    g=subprocess.run([NODE,'--test','tests/e2e/windows/test_qa_tts_output_candidate.mjs'],capture_output=True,text=True,cwd=d,env=dict(os.environ,LC_QA_TTS_STATIC_RECEIPT=os.path.join(d,'docs/verification/qa/p0-13-tts-52be105/stage-identity.json')))
    fails=sorted({re.sub(r' \([\d.]+ms\)$','',l[2:]) for l in g.stdout.splitlines() if l.startswith('✖') and 'failing tests' not in l})
    beyond=[f for f in fails if not ('pinned by their reviewed hashes' in f or 'differs from the runner that ran as attempt 1' in f)]
    shutil.rmtree(d)
    return (name, 'CAUGHT' if beyond else ('PIN ONLY' if fails else 'SURVIVED'), beyond)
with ThreadPoolExecutor(5) as ex: res=list(ex.map(run,M))
for name,v,b in res:
    print(f"{name}: {v}")
    for f in b[:3]: print('    -', f[:150])
print(f"\n{sum(v=='CAUGHT' for _,v,_ in res)}/{len(res)} caught beyond the hash pins and the whole-runner comparison")
