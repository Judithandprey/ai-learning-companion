"""Six pure saved-evidence replays: two actual baselines and four bounded negative controls."""
from pathlib import Path
import copy,hashlib,json,subprocess,sys
ROOT=Path('/tmp/lc-windows-win05-26ac626')
ANALYZER=ROOT/'tests/e2e/windows/analyze_win05.py'
E2=ROOT/'docs/verification/qa/p0-13-windows-win05-pending-476fd1f'
E1=Path('/tmp/qa-win05-ev1')
OUT=ROOT/'focused';OUT.mkdir(exist_ok=True)
def load(p):return json.loads(p.read_text())
def hashes(p):return {f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.iterdir()) if f.is_file()}
before={str(p):hashes(p) for p in (E1,E2)}
def rebuild(e):
 result=load(e/'runner-results.json');result['values'].update(load(e/'hash-checkpoints.json'))
 coord=load(e/'coordination-final.json');capture=coord['streams'][0]['capture_session']
 data={'out/results.json':result,'steps.json':load(e/'steps.json'),'preflight.json':load(e/'preflight.json'),
       'readback.json':load(e/'database-readback.json'),'run.json':load(e/'run.json'),'capture-host/coordination.json':coord,
       'host-watch.jsonl':load(e/'host-watch.json'),f'captures/{capture}/manifest.jsonl':load(e/'manifest-lines.json')}
 for label in ['confirmed','awaiting','acked','stop-given-up']:
  data[f'out/copy-coord-{label}/coordination.json']=load(e/f'coordination-{label}.json')
 return data
def run(name, data):
 d=OUT/name;d.mkdir(exist_ok=True)
 for n,x in data.items():
  p=d/n;p.parent.mkdir(parents=True,exist_ok=True)
  p.write_text(''.join(json.dumps(v)+'\n' for v in x) if n.endswith('.jsonl') else json.dumps(x))
 e=OUT/(name+'-result');r=subprocess.run([sys.executable,str(ANALYZER),str(d),str(e)],text=True,capture_output=True)
 (OUT/(name+'.log')).write_text(r.stdout+r.stderr)
 assert r.returncode==0,(name,r.stderr)
 s=load(e/'summary.json');return s
statuses=lambda s:{c['id']:c['status'] for c in s['checks']}
checks=[]
for name,e in [('run1',E1),('run2',E2)]:
 got=run(name,rebuild(e));want=load(e/'summary.json')
 assert statuses(got)==statuses(want)
 checks.append({'case':name,'counts':got['counts'],'same_all_16_statuses':True})
# Case 1: no emitted awaiting witness: status reads alone must not prove a prompt transition.
d=rebuild(E2);v=d['out/results.json']['values'];events=json.loads(v['w_events'])
v['w_events']=json.dumps([e for e in events if not e.get('awaiting')])
s=run('missing-awaiting-events',d);target='pending.said_as_waiting_at_once_counts_kept';assert statuses(s)[target]=='fail'
checks.append({'case':'missing-awaiting-events','target':target,'actual':'fail','counts':s['counts']})
# Case 2: the pending-to-ACK job must have the actual server replay receipt.
d=rebuild(E2);coord=d['out/copy-coord-awaiting/coordination.json'];pending=next(j for j in coord['streams'][0]['jobs'] if j['status']!='committed')['key']
db=d['readback.json']['database'];docs=db['documents'];db['documents']=[x for x in docs if not(x.get('kind')=='capture_replay' and json.loads(x['key'])[-1]==pending)]
s=run('missing-ack-server-receipt',d);target='ack.real_answer_raises_the_confirmed_count';assert statuses(s)[target]=='fail'
checks.append({'case':'missing-ack-server-receipt','target':target,'actual':'fail','counts':s['counts']})
# Case 3: Stop without its pending read must be limited, never claim exercised.
d=rebuild(E2);d['out/results.json']['values'].pop('p_awaiting_now')
s=run('missing-pending-stop-read',d);target='stop.during_a_pending_send_ends_unconfirmed_not_live';assert statuses(s)[target]=='limit'
assert statuses(s)['copy.every_read_is_the_accepted_text_without_a_storage_claim']=='fail'
checks.append({'case':'missing-pending-stop-read','target':target,'actual':'limit','counts':s['counts']})
# Case 4: losing the actual Stop give-up transition must fail its timing/unknown claim.
d=rebuild(E2);v=d['out/results.json']['values'];events=json.loads(v['w_events'])
v['w_events']=json.dumps([e for e in events if not(e.get('state')=='stopping' and e.get('awaiting') is False)])
s=run('missing-stop-give-up-event',d);target='stop.during_a_pending_send_ends_unconfirmed_not_live';assert statuses(s)[target]=='fail'
checks.append({'case':'missing-stop-give-up-event','target':target,'actual':'fail','counts':s['counts']})
assert before=={str(p):hashes(p) for p in (E1,E2)},'Read-only source evidence changed'
receipt={'candidate':'26ac6269ad728266aade944005431008ad1d1675','analyzer_sha256':hashlib.sha256(ANALYZER.read_bytes()).hexdigest(),
 'checks':checks,'inputs_unchanged':True,'input_sha256':before,
 'scope':'Only pure saved-evidence replays; no GUI/DB/signal/network execution'}
(ROOT/'focused-results.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'checks':checks,'inputs_unchanged':True},indent=2))
