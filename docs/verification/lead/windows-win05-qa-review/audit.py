#!/usr/bin/env python3
"""Read-only audit of committed sanitized QA metadata; no product/analyzer execution."""
from pathlib import Path
import subprocess,json,hashlib,collections,datetime
REPO=Path('/home/agentsdock/Projects/learning-companion/repo')
ROOT=Path('/tmp/windows-win05-26ac-export')
BASE='docs/verification/qa/p0-13-windows-win05-pending-476fd1f'
QA='26ac6269ad728266aade944005431008ad1d1675'
CAND='476fd1fb832e708b79ad5e5be1c7ef17925febee'
def git(*a):return subprocess.check_output(['git','-C',str(REPO),*a])
def sha(b):return hashlib.sha256(b).hexdigest()
def load(n):return json.loads((ROOT/BASE/n).read_text())
def stamp(s):return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
def equality(a,b,*paths):return not git('diff','--name-only',a,b,'--',*paths)
out={'review':'APPROVE bounded historical QA evidence','qa_commit':QA,'candidate':CAND}
changed=git('diff-tree','--no-commit-id','--name-only','-r',QA).decode().splitlines()
out['changed_files']={p:{'sha256':sha(git('show',QA+':'+p)),'export_exact':(ROOT/p).read_bytes()==git('show',QA+':'+p)} for p in changed}
assert len(changed)==21 and all(x['export_exact'] for x in out['changed_files'].values())
out['tree_equalities']={'candidate_windows_equals_d295a51':equality(CAND,'d295a51','apps/windows'),'candidate_apps_services_packages_equals_qa_merge':equality(CAND,'0678c9a','apps','services','packages'),'candidate_apps_services_packages_equals_qa_delivery':equality(CAND,QA,'apps','services','packages'),'backend_equals_86d2405':equality(CAND,'86d2405','services','packages')}
assert all(out['tree_equalities'].values())
build=load('build.json'); lines=Path('/tmp/windows-win05-476fd1f-build-SHA256SUMS').read_bytes()
out['stage']={'recorded':build['stage'],'independent_exact_candidate_portable_build_files':len(lines.splitlines()),'independent_exact_candidate_portable_build_tree_sha256':sha(lines),'reproduced':sha(lines)==build['stage']['tree_sha256'],'actual_windows_stage_bytes_independently_read':False}
assert out['stage']['reproduced'] and len(lines.splitlines())==57
run=load('run.json'); matches={}
for p,h in run['harness_sha256'].items():
 actual=sha((ROOT/'tests/e2e/windows'/p).read_bytes());matches[p]={'executed_sha256':h,'committed_sha256':actual,'equal':h==actual}
out['harness']=matches
assert sum(x['equal'] for x in matches.values())==12 and not matches['analyze_win05.py']['equal']
out['analyzer_correction']={'disclosed':True,'previous_bytes_available_in_delivery':False,'note_only_delta':'author-attributed; current corrected note inspected; no pre-correction byte comparison claimed'}
frozen=['analyze_fix.py','replay_analyze_fix.py','qa-electron-runner.ps1','qa_parent_db.py']
out['frozen_files_equal_parent']={p:equality(QA+'^',QA,'tests/e2e/windows/'+p) for p in frozen}
def parentfix(b):return b.split(b'  parentfix: (p) => [',1)[1].split(b'\n  ],',1)[0]
f1=parentfix(git('show',QA+'^:tests/e2e/windows/scenarios.mjs'));f2=parentfix(git('show',QA+':tests/e2e/windows/scenarios.mjs'))
out['parentfix_body_equal']=f1==f2
assert all(out['frozen_files_equal_parent'].values()) and out['parentfix_body_equal']
s=load('summary.json');r=load('runner-results.json');plan=load('steps.json');sup=load('supporting-run-1.json')
out['run2_counts']=dict(collections.Counter(c['status'] for c in s['checks']));out['run1_counts']=dict(collections.Counter(sup['statuses_by_the_committed_analyzer'].values()))
assert out['run2_counts']==s['counts']=={'pass':16};assert out['run1_counts']==sup['counts']=={'pass':13,'fail':1,'limit':2}
steps=r['steps'];assert len(plan)==len(steps)==run['steps']==76 and r['errors']==[]
assert [x['i'] for x in steps]==list(range(1,77)) and all(x['ok'] and x['kind'] in p for x,p in zip(steps,plan))
out['steps']={'planned':76,'actual':76,'ok':76,'errors':r['errors']}
v={k:json.loads(x) if isinstance(x,str) else x for k,x in r['values'].items()};events=v['w_events'];manifest=load('manifest-lines.json')
first=next(e for e in events if e['state']=='sending' and e['awaiting'] and e['stored']==2)
acked=next(e for e in events if e['state']=='sending' and not e['awaiting'] and e['stored']==3)
stopidx=next(x['i'] for x in steps if x.get('as')=='p_stop_latched')-1
stopclick=next(x for x in steps if x['i']==stopidx)
giveup=next(e for e in events if e['state']=='stopping' and not e['awaiting'])
frame=next(f for f in manifest if f.get('frame_seq')==13)
out['timings_seconds']={'frame_sample_to_waiting_status':stamp(first['qa_at'])-stamp(frame['sampled_at']),'waiting_status_to_later_read':stamp(v['w_awaiting_10s']['at'])-stamp(first['qa_at']),'resume_request_to_ack_status':stamp(acked['qa_at'])-stamp(next(x['at'] for x in steps if x['kind']=='hostResume')),'stop_click_to_giveup_status':stamp(giveup['qa_at'])-stamp(stopclick['at'])}
assert first['storing'] is False and first['unknown']==1 and acked['unknown']==0
assert all(e['stored']==2 and e['unknown']==1 and e['awaiting'] and not e['storing'] for e in events if stamp(first['qa_at'])<=stamp(e['qa_at'])<=stamp(v['w_awaiting_10s']['at']))
assert all(e['state']!='sending' and not e['storing'] and e['stored']==3 for e in events if stamp(e['qa_at'])>=stamp(stopclick['at']))
reads=['n_off','w_idle','w_confirmed_now','w_awaiting_now','w_awaiting_10s','w_acked_now','w_before_pause2','p_awaiting_now','p_stop_latched','p_stop_given_up_now','p_stopped_now']
assert all('No AI is connected' in v[x]['ai'] for x in reads)
assert all('AI: not connected.' in v[x]['line'] for x in reads if x!='n_off')
assert all('waiting for the service to confirm' in v[x]['line'] and '1 not known whether stored' in v[x]['line'] for x in ['w_awaiting_now','w_awaiting_10s','p_awaiting_now','p_stop_latched'])
out['reads_and_events']={'reads':len(reads),'events':len(events),'pending_counts_fenced':True,'post_stop_no_live_claim':True}
coords={n:load('coordination-'+n+'.json') for n in ['confirmed','awaiting','acked','stop-given-up','final']}
out['coordination_states']={n:[(j['key'],j['status']) for j in c['streams'][0]['jobs']] for n,c in coords.items()}
body_checks=[]
for n,c in coords.items():
 for j in c['streams'][0]['jobs']:
  if 'body' in j:body_checks.append({'snapshot':n,'key':j['key'],'sha256_match':sha(j['body'].encode())==j['body_sha256']})
assert all(x['sha256_match'] for x in body_checks);out['retained_body_hash_checks']=body_checks
f=coords['final']['streams'][0];db=load('database-readback.json');docs=db['database']['documents'];records=[x['record'] for x in docs if x['kind']=='capture_record'];artifacts=[x['artifact'] for x in docs if x['kind']=='artifact'];receipts=[json.loads(x['key'])[-1] for x in docs if x['kind']=='capture_replay']
assert db['actor']==load('preflight.json')['actor']['user_id'] and load('preflight.json')['actor']==coords['final']['actor'] and db['database_unchanged_by_readback'] is True
assert len(records)==3 and len({x['record_id'] for x in records})==3 and f['final']=='stopped'
assert [j['key'] for j in f['jobs'] if j['status']=='committed']==receipts
assert f['jobs'][-1]['status']=='unknown' and f['jobs'][-1]['key'] not in receipts
assert f['jobs'][-1]['in_doubt'] in {a for x in records for a in x['artifacts']}
h=load('hash-checkpoints.json');assert h['h_stopped']==h['h_final'];local={x['sha256']:x['bytes'] for p,x in h['h_final'].items() if p.endswith(('.png','.json'))}
assert all(local[a['sha256']]==a['bytes'] and a['id'].endswith(a['sha256']) for a in artifacts)
rb=db['streams'][0];assert rb['frames_compared']==6 and rb['mismatches']==[]
ink=[x for j in rb['jobs'] for x in j['ink_originals']];assert len(ink)==3 and all(x['local_sha256']==x['server_sha256']==x['artifact_id'].rsplit('.',1)[-1] for x in ink)
out['originals_and_server']={'documents':len(docs),'server_records':len(records),'server_receipts':len(receipts),'unique_artifacts':len(artifacts),'unique_png':3,'unique_ink_json':1,'saved_png_comparisons':6,'saved_ink_comparisons':3,'metadata_hash_size_linkage':True,'stopped_vs_final_hash_checkpoints_equal':True,'raw_private_bytes_rehashed':False,'in_doubt_original_equals_prior_committed_original':True,'given_up_original_arrival':'unknown','stream_final':f['final']}
watch=load('host-watch.json');apps=[x for k,x in r['processes'].items() if k in ['app','app-win05']];cleanup=load('cleanup.json')
assert all(x['exited'] and x['exit_code']==0 and not x.get('killed') for x in apps)
assert [x for x in watch if x['event']=='watch_end'][0]['remaining']==[] and len([x for x in watch if x['event']=='appear'])==len([x for x in watch if x['event']=='exit'])==1
assert cleanup['before']['documents']==len(docs)==32 and cleanup['after']=={'actor_row':False,'documents':0}
assert stamp(cleanup['at'])>max(stamp(x['exited_at']) for x in apps) and stamp(cleanup['at'])>stamp(next(x['at'] for x in watch if x['event']=='exit'))
out['release']={'app_self_exit_count':2,'app_exit_code':0,'one_owned_host_exited':True,'wsl_seen':r['wsl_seen'],'actor_cleanup':cleanup,'external_display_release_listing':'QA-attested timestamp only; not a retained raw process listing'}
out['limits']=['Source inspection and sanitized evidence audit; no independent GUI/DB/process/native tests','Clean Linux TypeScript/static build reproduces candidate aggregate, not direct measurement of actual executed Windows stage','Pre-correction analyzer bytes absent; note-only change attributed','Raw private PNG/ink/manifest bytes withheld; stored hashes and comparison receipts checked only','No pen input: raw/composed roles may alias same PNG; six role comparisons are not six unique images','No timeout/stalled/refusal/disk fault/relaunch/provider/Mac/audio/Notability or full product/device acceptance']
Path('/tmp/windows-win05-26ac-evidence-review.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:out[k] for k in ['review','tree_equalities','run2_counts','run1_counts','steps','timings_seconds','originals_and_server']},indent=2))
