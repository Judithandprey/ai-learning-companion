import hashlib,json,pathlib,subprocess
R=pathlib.Path('/home/agentsdock/Projects/learning-companion/repo')
E=pathlib.Path('/tmp/lc-win-qafix-70cb7e8')
COMMIT='70cb7e872e1cc7826d5b108ccc006b758d3cfb70'
CODE='5cd0bec87db7a1f0989ab8e7f0ed702261dbccf2'
PARENT='5871981524140e3be986268a941d34e99af25bb9'
def git(*args): return subprocess.check_output(['git','-C',str(R),*args])
def sha(b): return hashlib.sha256(b).hexdigest()
paths=git('diff','--name-only',PARENT,COMMIT).decode().splitlines()
source=[{'path':p,'sha256':sha((E/p).read_bytes()),'matches_git':(E/p).read_bytes()==git('show',f'{COMMIT}:{p}')} for p in paths]
reports=[]
for name,app in [('before-5871981',pathlib.Path('/tmp/lc-windows-parent-5871981/apps/windows')),('after-5cd0bec',E/'apps/windows')]:
 p=E/f'docs/verification/web/evidence/windows-capture-link/qa-win-03-04/{name}.json'
 raw=p.read_bytes();data=json.loads(raw)
 files={'package.json':sha((app/'package.json').read_bytes())}
 files.update({str(f.relative_to(app)):sha(f.read_bytes()) for f in (app/'dist').rglob('*') if f.is_file()})
 tree=sha(''.join(f'{files[k]}  {k}\n' for k in sorted(files)).encode())
 reports.append({'name':name,'report_sha256':sha(raw),'checks':len(data['checks']),'pass':sum(c['pass'] for c in data['checks']),'fail':sum(not c['pass'] for c in data['checks']),'reported_stage_files':data['staged_files'],'local_stage_files':len(files),'reported_stage_sha256':data['staged_tree_sha256'],'local_stage_sha256':tree,'stage_match':tree==data['staged_tree_sha256'] and len(files)==data['staged_files'],'source':data['source'],'runtime':data['runtime'],'driver_exit':data['driver_exit'],'error':data['error'],'electron_left_running':data['electron_left_running'],'files':files})
qa=json.loads((R/'docs/verification/qa/p0-13-windows-parent-c4c84a5/build.json').read_text())
result={'code_commit':CODE,'evidence_commit':COMMIT,'parent_commit':PARENT,'changed_source_checks':source,'all_changed_files_match_git':all(x['matches_git'] for x in source),'reports':reports,'old_stage_matches_independent_qa_build':reports[0]['reported_stage_sha256']==qa['stage']['tree_sha256'],'probe':json.loads(pathlib.Path('/tmp/windows-qa03-quit-probes.json').read_text()),'verdict':'APPROVE_QA_WIN_03_BOUNDED_SOURCE_AND_EVIDENCE; QA_WIN_04_HELD_SEPARATELY','limits':['No Windows GUI, native pen, DB, service, provider or whole-suite rerun by reviewer.','Local staged bytes are freshly built by lead; author execution provenance is a committed author receipt, not independent runtime acceptance.','Six Linux callback/model and byte-preservation checks; old failed behavior is a negative control, not a passing product behavior.']}
pathlib.Path('/tmp/windows-qa03-quit-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'all_changed_files_match_git':result['all_changed_files_match_git'],'changed_files':len(source),'stages':[{k:v for k,v in x.items() if k in ['name','checks','pass','fail','stage_match','local_stage_files','local_stage_sha256']} for x in reports],'old_stage_matches_qa':result['old_stage_matches_independent_qa_build']},indent=2))
