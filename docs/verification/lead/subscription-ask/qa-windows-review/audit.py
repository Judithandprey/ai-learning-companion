#!/usr/bin/env python3
"""Saved-data/source audit only; never imports or runs the Windows harness."""
import json,subprocess,hashlib,collections
from pathlib import Path
repo=Path('/home/agentsdock/Projects/learning-companion/repo'); root=Path('/tmp/qa-subscription-9abf587'); base=root/'docs/verification/qa/p0-13-subscription-ask-windows-3e4b406'
qa='9abf58797c7c779266651eca333424846c7a04dd'; cand='3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e'
def git(*args):return subprocess.check_output(['git','-C',str(repo),*args])
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):return json.loads((base/p).read_text())
def parse(v):return json.loads(v) if isinstance(v,str) else v
out={'verdict':'APPROVE historical evidence; launcher-check failure cleanup is a separate bounded source caveat','candidate':cand,'qa_commit':qa,'baseline_main':'250f8290cc0a16f8a203b698aa8f2d349b8f0187'}
leaves=['d6ecc98','f972176','3002218','110c733','4167ab5','9cac50b','677323a','9abf587']
out['integration_leaves']=[git('rev-parse',x).decode().strip() for x in leaves]
out['exclude_merges_and_other_ancestry']=['27b942c','a9ff602','older already integrated QA/production history']
out['source']={'candidate_windows_tree':git('rev-parse',cand+':apps/windows').decode().strip(),'owner_windows_tree':git('rev-parse','84fc56a:apps/windows').decode().strip(),'candidate_vs_qa_production_equal':not git('diff','--name-only',cand,qa,'--','apps','services','packages'),'candidate_backend_tree_file_count':len(git('ls-tree','-r','--name-only',cand,'--','services','packages').decode().splitlines())}
assert out['source']['candidate_windows_tree']==out['source']['owner_windows_tree'];assert out['source']['candidate_vs_qa_production_equal'];assert out['source']['candidate_backend_tree_file_count']==268
changed=git('diff-tree','--no-commit-id','--name-only','-r',qa).decode().splitlines()
out['evidence_files']={p:{'sha256':sha((root/p).read_bytes()),'raw_git_exact':(root/p).read_bytes()==git('show',qa+':'+p)} for p in changed}
assert len(changed)==70 and all(x['raw_git_exact'] for x in out['evidence_files'].values())
harness=read('harness.json')['runs']; runs={};total=0
for name,claim in harness.items():
 run=read('smoke.json') if name=='smoke' else read(name+'/run.json')
 matches={p:sha(git('show',claim['commit']+':tests/e2e/windows/'+p))==h for p,h in run['harness_sha256'].items()}
 assert len(matches)==claim['files'] and all(matches.values());total+=len(matches)
 r={'executed_commit':claim['commit'],'hashes_checked':len(matches),'all_match':True,'run_start_end_match':run['started']==claim['started'] and run['ended']==claim['ended']}
 assert r['run_start_end_match']
 if name=='smoke':
  assert len(run['steps'])==20 and not run['errors'] and all(x['ok'] for x in run['steps']);r['steps']=20
 else:
  summary=read(name+'/summary.json');counts=dict(collections.Counter(x['status'] for x in summary['checks']));assert counts==summary['counts'];r['summary_counts']=counts
  results=read(name+'/runner-results.json');plan=read(name+'/steps.json');r['planned_steps']=len(plan);r['actual_steps']=len(results['steps']);r['failed_steps']=[x['i'] for x in results['steps'] if not x['ok']];r['errors']=results['errors']
  assert len(plan)==len(results['steps'])==run['steps'] and [x['i'] for x in results['steps']]==list(range(1,len(plan)+1))
  if name!='subselect-at-3002218':assert not r['failed_steps'] and not r['errors']
  apps={k:v for k,v in results['processes'].items() if k.startswith('app')};r['app_exits']={k:{kk:v.get(kk) for kk in ['exited','exit_code','killed','closed_in_finally','exit_ms']} for k,v in apps.items()}
  assert all(v['exited'] and v['exit_code']==0 and not v.get('killed') for v in apps.values())
  watch=read(name+'/connector-watch.json');appeared={e['pid'] for e in watch if e['event']=='appear'};exited={e['pid'] for e in watch if e['event']=='exit'}
  assert appeared==exited;assert all(e['remaining']==[] for e in watch if e['event']=='watch_end');r['watched_processes_reaped']=len(appeared)
  r['cursor_restored']=results['cursor']['start']==results['cursor']['end'];assert r['cursor_restored'];assert all(not x.get('running_at_end') for x in results['wsl_seen'])
 runs[name]=r
out['runs']=runs;out['executed_harness_hashes_checked']=total
assert total==166
run=read('subcheck/run.json'); out['connector_hashes']={p:sha(git('show',cand+':'+p))==h for p,h in run['subscription']['connector_files_sha256'].items()};assert all(out['connector_hashes'].values())
check=read('subcheck/runner-results.json'); vals={k:parse(v) for k,v in check['values'].items()}; summary=read('subcheck/summary.json'); connection=next(x for x in summary['checks'] if x['id']=='check.connection_read_on_the_users_press')['observed'];assert connection['after']['state']=='signed_out' and connection['after']['login']=='none';assert run['subscription']['real_turn_allowed'] is False
sels=read('subcheck/selection-records.json');assert all(x['record']['requests']==[] for x in sels);assert read('subcheck/receipts.json')=={'found':{'request_ids':[],'found':[]},'receipts':[]}
out['real_check']={'state':'signed_out','login':'none','selected_model':connection['after']['model'],'catalog_image_models':len(connection['models']),'requests':0,'receipts':0,'real_turn_allowed':False,'sign_in_started':False,'runtime_calls':'Only saved real Check run independently audited; six total historical Check starts are QA report attribution'}
control=read('subcontrols/bridge-log.json');asks=[x for x in control if x['event']=='ask'];records=read('subcontrols/selection-records.json');reqs={q['request_id']:(s['record'],q) for s in records for q in s['record']['requests']}
assert len(asks)==len(reqs)==16 and len({x['request_id'] for x in asks})==16
for a in asks:
 s,q=reqs[a['request_id']];assert a['question_sha256']==sha(q['question'].encode());assert a['image']['sha256']==s['image']['sha256'];assert a['image']['png_bytes']==s['image']['bytes'];assert a['image']['bytes_hash_to_sha256'] and a['image']['is_png']
cs=read('subcontrols/summary.json');a=next(x for x in cs['checks'] if x['id']=='control.questions_align')['observed'];assert a['ask_presses']==18
out['synthetic_controls']={'checks':18,'ask_presses':18,'bridge_asks':16,'recorded_requests':16,'request_hash_and_image_metadata_linkage':True,'real_codex_or_model':False}
r=read('subtype/runner-results.json'); clicks=[x for x in r['steps'] if x['kind']=='osClick'];assert len(clicks)==6 and all(x['clicked'] and x['foreground_after'] and x['window_at_point_is_ours'] for x in clicks)
for n in range(6):
 c=parse(r['values']['t_click_'+str(n)]);t=parse(r['values']['t_typed_'+str(n)]);assert c['active'] and c['has_focus'] and c['selection']==[25,25];assert t['value']==c['value']+'42';assert [x['data'] for x in t['inputs']]==['4','2']
out['keyboard']={'os_clicks':6,'two_digit_input_cases':6,'text_preserved':6,'physical_input':False,'synthetic_windows_OS_input':True}
linkage=[]
for name in ['subcheck','subcontrols','subtype','subrehearsal']:
 points=read(name+'/hash-checkpoints.json');paths={p:v for x in points.values() for p,v in x.items()}
 for s in read(name+'/selection-records.json'):
  record=s['record'];assert s['png_is_its_hash']
  for kind in ['image','ink_original']:
   value=record[kind];path='captures/'+s['capture']+'/'+value['file'];h=paths.get(path);assert h and h['sha256']==value['sha256'] and h['bytes']==value['bytes'];linkage.append([name,s['file'],kind,value['sha256']])
out['selection_original_metadata_links']=linkage;out['private_original_bytes_read_or_rehashed']=False
launcher=read('launcher-check.json');assert launcher['check']['after']['state']=='signed_out' and launcher['sign_in_pressed'] is False and launcher['app_closed_itself'] is True
out['launcher_saved_result']={'check_signed_out':True,'sign_in_pressed':False,'closed_reported':True,'copy_files':launcher['copy']['files_equal_to_the_commit'],'copy_prepare_pass':launcher['copy']['ask_path']['ok'],'raw_launcher_hash_recomputed':False}
out['note_only_commit']='677323a changes only the answer-judge note expression; status predicate unchanged. Actual old/new Git bytes inspected.'
out['finding']={'id':'QA-LAUNCHER-CLEANUP','severity':'P2 reusable check helper, not historical evidence failure','path':'tests/e2e/windows/signin_launcher.mjs','lines':[87,90,93,96,118,122,125,128],'trigger':'After app spawn, DevTools connection rejects or evaluate hangs until outer 150s timeout','result':'Detached app has no finally-owned close/reap; profile is removed before checking child status/closure. Helper may print error JSON or app_closed_itself:false and return shell success.','source_reproduction_only':True,'minimal_fix':'Track owned app exit, use finally bounded owned cleanup, preserve profile unless exit confirmed, nonzero check exit for error/timeout/not closed; keep prepared user launcher unchanged.'}
out['limits']=['No GUI/connector/login/inference/tests rerun','Historical evidence approved, not all reused driver failure paths certified','Stage app/runtime identity and execution attribution QA-reported; no committed per-file stage manifest or rebuild in this review','Original screenshots/PNGs withheld: verified hash/size linkage, not raw private pixels','One observed final real Check plus launcher receipt does not independently reproduce all six historical starts','No actual image turn, physical keyboard/pen, login callback or interactive Mac acceptance']
Path('/tmp/qa-subscription-evidence-review.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'hash_checks':total,'counts':{k:v.get('summary_counts') for k,v in runs.items()},'source':out['source'],'metadata_links':len(linkage),'verdict':out['verdict']},indent=2))
