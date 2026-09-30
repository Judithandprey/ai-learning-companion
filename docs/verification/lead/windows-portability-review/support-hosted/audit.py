from pathlib import Path
import json,hashlib,subprocess,re
p=Path('/tmp/sharelock-36766951888')
payload='\n'.join(x[2:] for x in (p/'probe.tap').read_text().splitlines() if x.startswith('# '))
report,_=json.JSONDecoder().raw_decode(payload)
head='4166529b88e9be402ad98241d609eadccd4247bd'
r=json.loads(Path('/tmp/sharelock-36766951888-run.json').read_text());a=json.loads(Path('/tmp/sharelock-36766951888-artifacts.json').read_text())
assert r['headSha']==head and r['status']=='completed' and r['conclusion']=='failure'
assert r['url']=='https://github.com/Judithandprey/ai-learning-companion/actions/runs/36766951888'
assert (p/'exit-code.txt').read_text().strip()=='1'
assert 'commit='+head in (p/'source.txt').read_text() and 'runs/36766951888' in (p/'source.txt').read_text()
checks={}
for line in (p/'SOURCE_SHA256SUMS').read_text().splitlines():
 m=re.fullmatch(r'([0-9a-f]{64}) [ *](.+)',line);assert m,line
 sha,name=m.groups(); raw=subprocess.check_output(['git','show',head+':'+name])
 exact=hashlib.sha256(raw).hexdigest();crlf=hashlib.sha256(raw.replace(b'\n',b'\r\n')).hexdigest()
 assert sha in {exact,crlf},name
 checks[name]={'executed_sha256':sha,'git_raw_sha256':exact,'representation':'raw Git bytes' if sha==exact else 'Git LF converted to CRLF by Windows checkout'}
assert hashlib.sha256((p/'probe.mjs').read_bytes()).hexdigest()==report['probe_sha256']==checks['tests/probes/support/windows_share_lock.mjs']['executed_sha256']
assert report['observation_complete'] and report['normal_release_passed'] and not report['lock_preconditions_passed']
assert [x['name'] for x in report['results']]==['exact-legacy','traced-readline','traced-raw-stdin']
for x in report['results']:
 assert x['normal_release_passed'] and x['completed'] and not x['lock_precondition_passed']
 for name in ['after_ready','after_150ms']:
  assert not x[name]['open']['denied'] and not x[name]['read']['denied']
for x in report['results'][1:]:
 event={e['event']:e for e in x['events']}
 assert event['dotnet_second_open']['denied'] and event['dotnet_second_open']['hresult']==-2147024864
 assert not event['held']['closed'] and not event['input_returned']['is_null']
 assert event['parent_release']['at_ms'] < event['input_returned']['at_ms'] <= event['disposed']['at_ms']
artifact=a['artifacts'][0];assert a['total_count']==1 and artifact['workflow_run']['id']==36766951888 and artifact['workflow_run']['head_sha']==head and artifact['name']=='windows-share-lock-'+head+'-1'
result={'status':'APPROVE faithful failed diagnostic evidence, NOT a test pass','head':head,'run':36766951888,'source_hashes':checks,'probe':report,'remaining_unknown':'Why Node24.21 can open/read while the traced .NET handle remains held. No Node regression, filesystem or privilege cause inferred yet.','unchanged_production':True}
Path('/tmp/sharelock-36766951888-audit.json').write_text(json.dumps(result,indent=2)+'\n')
Path('/tmp/sharelock-36766951888-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':result['status'],'runtime':report['parent'],'three_arms_completed':True,'normal_release':True,'all_node_open_and_reads_succeeded':True,'two_traced_dotnet_second_opens_denied':True,'source_hashes':checks},indent=2))
