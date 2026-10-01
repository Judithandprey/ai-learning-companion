from pathlib import Path
import json,hashlib,re,subprocess,collections,datetime
repo=Path('/home/agentsdock/Projects/learning-companion/repo');root=Path('/tmp/windows-qa-retest-6a3611e');ev=root/'docs/verification/qa/p0-13-windows-quit-copy-retest-86d2405';built=Path('/tmp/lc-win-qa86-build/apps/windows')
qa='6a3611e2567cf97e858ff146a55c8d0fda7d832c';candidate='86d240550803022e02dbbb5ae2323793fbfdebfa';base='b64669f8525f8ac5e52c7f9484a5acf0dddbd147'
def load(n):return json.loads((ev/n).read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*a):return subprocess.check_output(['git','-C',str(repo),*a])
def tree(c,p):return git('rev-parse',c+':'+p).decode().strip()
def stamp(v):return datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
def parsed(v):return json.loads(v) if isinstance(v,str) else v
issues=[]
def check(ok,s):
 if not ok:issues.append(s)
run,build,r,summary,db,h,ends,watch,cleanup,pre,coord=[load(n) for n in ['run.json','build.json','runner-results.json','summary.json','database-readback.json','hash-checkpoints.json','manifest-ends.json','host-watch.json','cleanup.json','preflight.json','coordination-final.json']]
files=git('diff','--name-only',base,qa).decode().splitlines()
raw={p:sha((root/p).read_bytes()) for p in files};check(all((root/p).read_bytes()==git('show',qa+':'+p) for p in files),'export differs from Git')
harness={p:{'reported':s,'actual':sha((root/'tests/e2e/windows'/p).read_bytes())} for p,s in run['harness_sha256'].items()}
check(all(v['reported']==v['actual'] for v in harness.values()),'executed harness hash mismatch')
closures={p:{c:tree(c,p) for c in [candidate,base,qa]} for p in ['apps','services','packages']}
check(all(len(set(v.values()))==1 for v in closures.values()),'QA production tree changed')
owner_equal=tree(candidate,'apps/windows')==tree('41fd2cb','apps/windows');check(owner_equal,'candidate differs from final owner')
old_services={p:tree(candidate,p)==tree('c4c84a5',p) for p in ['services','packages']};check(all(old_services.values()),'claimed old backend compatibility differs')
stage={'package.json':sha((built/'package.json').read_bytes())};stage.update({p.relative_to(built).as_posix():sha(p.read_bytes()) for p in (built/'dist').rglob('*') if p.is_file()})
stage_hash=sha(''.join(f'{stage[p]}  {p}\n' for p in sorted(stage)).encode());check(len(stage)==build['stage']['files']==57 and stage_hash==build['stage']['tree_sha256']==build['stage']['clean_rebuild_from_86d2405_tree_sha256'],'fresh stage hash differs')
planned=load('steps.json');counts=dict(collections.Counter(x['status'] for x in summary['checks']));check(counts==summary['counts']=={'pass':24,'limit':2} and len(summary['checks'])==26,'summary count mismatch')
check(len(r['steps'])==len(planned)==run['steps']==223 and all(x['ok'] for x in r['steps']) and not r['errors'] and not r.get('aborted'),'run incomplete')
apps={k:v for k,v in r['processes'].items() if k=='app' or k.startswith('app-')}
self_exits={k:all([v['exited'] is True,v['exit_code']==0,not v.get('killed'),not v.get('closed_in_finally'),not v.get('hung_after_close')]) for k,v in apps.items()};check(len(apps)==8 and all(self_exits.values()),'self exit mismatch')
launches=[x for x in r['steps'] if x['kind']=='launchApp'];closes=[x for x in r['steps'] if x['kind']=='closeApp'];check(len(launches)==7 and len(closes)==8 and not any(x['kind']=='endHungApp' for x in r['steps']),'launch/close or kill count')
for step in launches:
 prev=step['previous'];check(apps[prev['key']]['exited'] is True and prev['exit_code']==0 and prev['killed'] is False,'prior app did not self exit before relaunch')
# Recompute immutable-name/hash stability using only the saved digest receipts. Never substitute for private bytes.
first={};bad=[];sizes={};hash_steps=[x for x in planned if 'hashTree' in x]
for st in hash_steps:
 label=st['as'];snapshot=h[label]
 for p,f in snapshot.items():
  if re.fullmatch(r'(?:captures/[^/]+/(?:frames/[0-9a-f]{64}\.png|ink/[0-9a-f]{64}\.json)|ink/context/[0-9a-f]{64}\.png)',p):
   if f=='vanished':bad.append([label,p,'vanished']);continue
   if Path(p).stem!=f['sha256']:bad.append([label,p,'misnamed'])
   if p in first and first[p]['sha256']!=f['sha256']:bad.append([label,p,'changed'])
   first.setdefault(p,f)
  if p.endswith('/manifest.jsonl') and f!='vanished':
   if f['bytes']<sizes.get(p,0):bad.append([label,p,'manifest_shrank'])
   sizes[p]=f['bytes']
 for p in first:
  if (st.get('frames',True) or '/frames/' not in p) and p not in snapshot:bad.append([label,p,'missing'])
kinds=dict(collections.Counter('context_png' if p.startswith('ink/context/') else 'capture_png' if '/frames/' in p else 'immutable_ink_json' for p in first))
check(len(hash_steps)==len(h)==19 and len(first)==25 and not bad,'original hash checkpoint mismatch')
check(sum(st.get('frames',True) for st in hash_steps)==13,'full frame checkpoint count differs')
# Cross-reference the saved database original digests/lengths with local checkpoints.
docs=db['database']['documents'];art=[d['artifact'] for d in docs if d['kind']=='artifact'];records=[d['record'] for d in docs if d['kind']=='capture_record'];local_by_sha={f['sha256']:f['bytes'] for f in first.values()}
for a in art:check(a['sha256'] in local_by_sha and local_by_sha[a['sha256']]==a['bytes'],'DB original digest/length absent in local hash receipts')
ink=[x for s in db['streams'] for j in s['jobs'] for x in j['ink_originals']]
check(all(x['server_sha256']==x['local_sha256']==x['artifact_id'].rsplit('.ink.',1)[1] for x in ink),'ink readback hash mismatch')
check(len(records)==len({x['record_id'] for x in records})==8 and len(art)==15,'DB counts differ')
check(sum(s['server_records'] for s in db['streams'])==sum(s['records_read'] for s in db['streams'])==8 and sum(s['frames_compared'] for s in db['streams'])==16 and all(not s['mismatches'] for s in db['streams']),'readback counts/mismatches')
check(db['database_unchanged_by_readback'] is True and db['database']['actor_row'] is True,'readback mutated state')
actor=pre['actor']['user_id'];check(actor==db['actor']==coord['actor']['user_id']==r['values']['seed']['user_id'],'actor mismatch')
check(sum(db['database']['by_kind'].values())==len(docs)==cleanup['before']['documents']==81 and cleanup['after']=={'actor_row':False,'documents':0},'cleanup counters differ')
appeared={x['pid'] for x in watch if x['event']=='appear'};exited={x['pid'] for x in watch if x['event']=='exit'};last=next(x for x in watch if x['event']=='watch_end')
check(len(appeared)==8 and appeared==exited and last['remaining']==[],'host release mismatch');check(stamp(cleanup['at'])>stamp(last['at']),'cleanup before watcher ended')
check(all(not x['running_at_end'] for x in r['wsl_seen']) and len(r['wsl_seen'])==2,'WSL child release mismatch')
# Raw read values match summary rows; expected defects remain limits.
checks={x['id']:x for x in summary['checks']};rows=checks['copy.header_and_line_follow_the_link_state']['observed']['reads'];badreads=[]
for row in rows:
 val=parsed(r['values'][row['read']]);link=val['l'];claim=bool(re.search('are also being stored|also stored|are being stored|is storing them',val['ai'],re.I))
 if row['header']!=val['ai'] or row['line']!=val.get('line') or claim!=row['header_says_storing'] or ('No AI is connected' not in val['ai']):badreads.append(row['read'])
 if link['mode']=='development' and claim!=(link['storing'] is True):badreads.append(row['read'])
check(len(rows)==20 and not badreads,'status-read summary mismatch')
cards=[parsed(r['values'][n]) for n in ['card_open','card_paused','card_stalled','card_recovered','card_unavail']]
check(all(c['shown'] and 'may also store' in c['text'] and 'only while it is connected and answering' in c['text'] for c in cards),'card conditional text mismatch')
check(len({(c['text'],c['crop_sha256'],c['crop_chars'],c['revision'],c['mode'],c['shown']) for c in cards[:4]})==1,'held card identity changed')
for path in ev.glob('*.json'):
 text=path.read_text();check(not re.search(r'data:image/[^,\s]+,[A-Za-z0-9+/=]{64}|data_base64|dbname=|password|database_dsn|"token"|C:[\\/]+Users[\\/]+',text),'private byte/credential-like field: '+path.name)
result={'qa_commit':qa,'candidate':candidate,'export':'/tmp/windows-qa-retest-6a3611e','verdict':'APPROVE integration as scoped QA evidence' if not issues else 'HOLD','anomalies':issues,'changed_file_sha256':raw,'harness_receipts':harness,'production_tree_closure':closures,'candidate_matches_final_owner':owner_equal,'services_packages_equal_previous_qa':old_services,'independent_exact_stage_rebuild':{'files':len(stage),'tree_sha256':stage_hash,'matches_report':stage_hash==build['stage']['tree_sha256'],'file_sha256':stage,'command':'pinned Node 24.21.0, existing TypeScript 7.0.2 tsc -p exact exported tsconfig; copy-static.mjs; no install/native run'},'checks':counts,'steps':{'planned':len(planned),'executed':len(r['steps']),'failed':sum(not x['ok'] for x in r['steps']),'errors':r['errors']},'app_exits':{k:{f:v.get(f) for f in ['pid','close_via','exit_ms','exit_code','exited','killed','closed_in_finally']} for k,v in apps.items()},'relaunches':len(launches),'immutable_checkpoint_receipts':{'checkpoints':len(h),'frame_hash_checkpoints':sum(st.get('frames',True) for st in hash_steps),'distinct_original_paths':len(first),'kinds':kinds,'problems':bad,'byte_revalidation':'not performed; private originals intentionally not inspected'},'readback_receipts':{'records':len(records),'distinct_originals':len(art),'raw_composed_comparisons':sum(s['frames_compared'] for s in db['streams']),'ink_comparisons':len(ink),'digest_and_length_linkage_to_local_checkpoints':not any(a['sha256'] not in local_by_sha or local_by_sha[a['sha256']]!=a['bytes'] for a in art),'database_unchanged':db['database_unchanged_by_readback'],'by_kind':db['database']['by_kind']},'cleanup':cleanup,'release':{'hosts_appeared':len(appeared),'hosts_exited':len(exited),'watch_end':last,'wsl_children':r['wsl_seen'],'external_process_list_checks':'QA-reported times in build.json only; external raw listings not retained'},'status_reads':{'count':len(rows),'storing_true':sum(x['storing'] is True for x in rows),'bad':badreads},'limits':[x for x in summary['checks'] if x['status']=='limit'],'review_limits':['No GUI/DB/provider/service or scenario rerun.','No private raw screenshots, PNG or ink inspected; original byte comparisons remain recorded QA operations with independently checked hash linkage.','QA-WIN-05 remains a residual fault, not a pass or product acceptance.','WM_CLOSE is synthetic native window-message delivery, not a physical close click; pen events are DevTools injected.','No second quit during pending link Stop, hung Stop bound, held-unsaved ink, repeated record batch, native Mac, provider, audio, Notability or full desktop gates.']}
Path('/tmp/windows-qa-retest-evidence-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['verdict','anomalies','checks','steps','immutable_checkpoint_receipts','readback_receipts','status_reads']},indent=2));print('stage',len(stage),stage_hash);print('harness',len(harness),all(v['reported']==v['actual'] for v in harness.values()))
