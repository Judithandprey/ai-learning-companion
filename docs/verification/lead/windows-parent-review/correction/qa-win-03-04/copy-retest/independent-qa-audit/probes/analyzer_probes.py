from pathlib import Path
import contextlib,copy,hashlib,io,json,runpy,subprocess,sys
ROOT=Path('/tmp/lc-windows-qa-6a3611e')
REPO=Path('/home/agentsdock/Projects/learning-companion/repo')
COMMIT='6a3611e2567cf97e858ff146a55c8d0fda7d832c'
PREFIX='docs/verification/qa/p0-13-windows-quit-copy-retest-86d2405/'
def artifact(n):return json.loads(subprocess.check_output(['git','show',COMMIT+':'+PREFIX+n],cwd=REPO))
# Replay only committed, sanitized metadata. It is not a new GUI/database run.
original={'results':artifact('runner-results.json'),'hashes':artifact('hash-checkpoints.json'),'steps':artifact('steps.json'),'preflight':artifact('preflight.json'),'readback':artifact('database-readback.json'),'coord':artifact('coordination-final.json'),'paused':artifact('coordination-paused-8s.json'),'stalled':artifact('coordination-stalled.json'),'watch':artifact('host-watch.json'),'ends':artifact('manifest-ends.json')}
def write(p,obj):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj)+'\n')
def run(name,change=lambda x:None):
 d=copy.deepcopy(original);change(d);out=ROOT/name
 d['results']['values'].update(d['hashes'])
 for path,key in [('out/results.json','results'),('steps.json','steps'),('preflight.json','preflight'),('readback.json','readback'),('capture-host/coordination.json','coord'),('out/copy-coord-paused-8s/coordination.json','paused'),('out/copy-coord-stalled/coordination.json','stalled')]:write(out/path,d[key])
 (out/'host-watch.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in d['watch']))
 for cap,lines in d['ends'].items():
  p=out/'captures'/cap/'manifest.jsonl';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(''.join(json.dumps(r)+'\n' for r in lines))
 saved=sys.argv;sys.argv=[str(ROOT/'analyze_fix.py'),str(out)]
 try:
  with contextlib.redirect_stdout(io.StringIO()) as log:g=runpy.run_path(str(ROOT/'analyze_fix.py'),run_name='__main__')
 finally:sys.argv=saved
 (ROOT/(name+'.log')).write_text(log.getvalue())
 checks={c['id']:c for c in g['checks']}
 return {'case':name,'counts':g['counts'],'checks':checks}
rows=[]
rows.append(run('baseline'))
def missing_resume(d):
 for e in d['watch']:
  if e['event']=='resumed':e['hosts']=[]
rows.append(run('missing-resume-hosts',missing_resume))
def missing_ink(d):
 for s in d['readback']['streams']:
  for j in s['jobs']:j['ink_originals']=[]
rows.append(run('missing-ink-comparisons',missing_ink))
def killed(d):d['results']['processes']['app-main']['killed']=True
rows.append(run('forced-kill-control',killed))
def missing_status(d):d['results']['values'].pop('b_storing_now',None)
rows.append(run('missing-status-control',missing_status))
out={'candidate':COMMIT,'execution':'Pure Python replay of committed sanitized metadata with explicitly named mutations. No GUI/DB/signals/network.','runs':rows}
(ROOT/'analyzer-results.json').write_text(json.dumps(out,indent=2)+'\n')
for r in rows:
 print(r['case'],r['counts'])
 for cid in ['fault.only_this_runs_host_paused_and_resumed','counts.final_counts_equal_the_server_once_each','quit.after_stop_page_close','copy.header_and_line_follow_the_link_state']:
  print(' ',cid,r['checks'][cid]['status'])
