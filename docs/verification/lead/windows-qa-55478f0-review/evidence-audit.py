"""Read saved QA evidence only. Does not import/run harness, app, analyzer or tests."""
from pathlib import Path
import collections,hashlib,json,re,subprocess
REPO=Path('/home/agentsdock/Projects/learning-companion/repo')
ROOT=Path('/tmp/windows-qa-55478f0-890aa3a')
EV=ROOT/'docs/verification/qa/p0-13-windows-qa-win01-55478f0'
RAW=Path('/tmp/qa-win01-retest-run1')
DELIVERY='890aa3a21af6938f35c798ec82aa1bb104b74092'
CANDIDATE='55478f04cab0da3785718469ed69ac8f4e413d1f'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
def git(*args): return subprocess.check_output(['git',*args],cwd=REPO)
def redact(value):
    text=json.dumps(value,ensure_ascii=False,indent=1)
    for pattern in (r'C:\\\\Users\\\\[^\\\\\"]+',r'C:\\Users\\[^\\\"]+',r'C:/Users/[^/\"]+',r'/mnt/c/Users/[^/\"]+'):
        text=re.sub(pattern,'<home>',text)
    return (text+'\n').encode()
s=load(EV/'summary.json');run=load(EV/'run.json');env=load(EV/'env.json');rr=load(EV/'runner-results.json');rawrr=load(RAW/'out/results.json')
files=[]
for path in sorted(ROOT.rglob('*')):
    if path.is_file():
        b=path.read_bytes();rel=path.relative_to(ROOT).as_posix();g=git('show',DELIVERY+':'+rel)
        files.append({'path':rel,'sha256':sha(b),'bytes':len(b),'git_blob_bytes_equal':b==g})
counts=dict(collections.Counter(x['status'] for x in s['checks']))
raw_values=rawrr['values']
exported=dict(rawrr,values={k:v for k,v in raw_values.items() if k not in ('timeline','askCard','askCard4')})
card=json.loads(raw_values['askCard']);exported['values']['askCard']={'text':card['text'],'src':f"<PNG data URL of {len(card['src'])} characters, exported as ask-crop.png>"}
c4=json.loads(raw_values['askCard4']);exported['values']['askCard4']={**c4,'src':f"<PNG data URL of {len(c4['src'])} characters, exported as ask-crop-4.png>"}
expected={
    'run.json':load(RAW/'run.json'),
    'steps.json':load(RAW/'steps.json'),
    'retained-selection.json':load(RAW/'retained-selection.json'),
    'runner-results.json':exported,
    'samples-timeline.json':json.loads(raw_values['timeline']),
}
raw_links={name: {'redacted_raw_equals_committed':redact(value)==(EV/name).read_bytes()} for name,value in expected.items()}
snap_inks={p.name:load(p) for p in (RAW/'ink').glob('*.json')}
for name in ['ink-final.json','ink-retest.json']:
    actual=load(EV/name);raw_links[name]={'raw_document_id_match':actual['id']+'.json' in snap_inks,'redacted_raw_equals_committed':redact(snap_inks.get(actual['id']+'.json'))==(EV/name).read_bytes()}
timeline=load(EV/'samples-timeline.json')
work=load(RAW/'run.json')['work'];stage=Path('/mnt/'+work[0].lower()+work[2:].replace('\\','/')).parent
stage_hashes={n:{'expected':h,'actual':sha((stage/'dist/apps/windows/src'/n).read_bytes())} for n,h in env['staged_sha256'].items()}
electron=stage.parent/'lc-electron-44.5.1-win32-x64'/'electron.exe'
checks={c['id']:c for c in s['checks']}
res={
 'delivery':DELIVERY,'tested_candidate':CANDIDATE,'main_guidance_revision':'dc3a7d8',
 'action_boundary':'Saved data/hash comparison only; no harness/analyzer/test/native launch and no network',
 'guidance_changes_since_prior_read':git('diff','--name-only','6036026','dc3a7d8','--','AGENTS.md','TEAM.md','docs/workflow.md','docs/requirements').decode().splitlines(),
 'git_files':files,
 'apps_windows_trees':{ref:git('rev-parse',ref+':apps/windows').decode().strip() for ref in [CANDIDATE,'f277362',DELIVERY]},
 'harness':{n:{'run_sha256':h,'commit_sha256':sha((ROOT/'tests/e2e/windows'/n).read_bytes()),'env_sha256':env['harness_sha256_as_executed'][n]} for n,h in run['harness_sha256'].items()},
 'raw_source_linkage':raw_links,
 'sanitized_saved_analysis_byte_matches':{p.name:p.read_bytes()==(Path('/tmp/qa-win01-ev1')/p.name).read_bytes() for p in EV.iterdir() if p.name!='env.json'},
 'counts':{'recomputed':counts,'stated':s['counts'],'fail':counts.get('fail',0),'check_count':len(s['checks']),'unique_ids':len(checks),'run_matches_summary':run==s['run']},
 'runner':{'steps':len(rr['steps']),'all_step_ok':all(x['ok'] for x in rr['steps']),'consecutive_steps':[x['i'] for x in rr['steps']]==list(range(1,301)),'errors':rr['errors'],'app_exit':rr['processes']['app']['exit_code'],'exited':rr['processes']['app']['exited'],'foreign_start_end':rr['foreign'],'stdio':(RAW/'runner-stdio.txt').read_text().strip()},
 'timeline':{'samples':len(timeline['samples']),'states':dict(collections.Counter(x['state'] for x in timeline['samples'])),'summary':s['samples'],'session_ended_samples':sum(x['state']=='ended' for x in timeline['samples'])},
 'stage_current_hashes':stage_hashes,'electron':{'expected':env['electron_runtime']['electron_exe_sha256'],'actual':sha(electron.read_bytes()),'version_stated':env['electron_runtime']['version']},
 'qa_win01':checks['alignment.moved_text_not_verified'],
 'composed_state_count':checks['pixels.composed_marks_match_status']['observed']['states_checked'],
 'limits':[c for c in s['checks'] if c['status']=='limit'],
 'production_build_boundary':'Exact production Git tree and eight retained staged-file hashes verified; no fresh compilation. Fresh-build equivalence is QA-recorded env evidence, not independently recreated.',
 'acceptance_boundary':'QA-WIN-01 reproduced case only; synthetic DevTools input on native Windows. No physical pen, app process restart, forced Stop, real provider, per-OS full gates or Notability acceptance.'
}
Path('/tmp/windows-qa-55478f0-evidence-review.json').write_text(json.dumps(res,indent=2)+'\n')
print(json.dumps({'git_files':len(files),'git_all_equal':all(f['git_blob_bytes_equal'] for f in files),'harness_equal':all(x['run_sha256']==x['commit_sha256']==x['env_sha256'] for x in res['harness'].values()),'raw_links':raw_links,'saved_analysis_all_equal':all(res['sanitized_saved_analysis_byte_matches'].values()),'counts':res['counts'],'stage_all_equal':all(x['expected']==x['actual'] for x in stage_hashes.values()),'runtime_hash_equal':res['electron']['expected']==res['electron']['actual']},indent=2))
