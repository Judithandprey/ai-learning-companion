"""Read-only checker probes over the author's explicitly Python-simulated fixture, not Swift output."""
import ast,copy,hashlib,importlib.util,json,sys
from pathlib import Path
sys.dont_write_bytecode=True
root=Path('/tmp/macos-upload-bcfda2c-export'); source=root/'apps/macos/CompanionDesktop/checks/validate_mac_upload.py'
spec=importlib.util.spec_from_file_location('mac_upload_check',source);check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)
fixture=Path('/tmp/lc-0212-sim/mac-upload-fixture');manifest=json.loads((fixture/'manifest.json').read_bytes());body=(fixture/manifest['request_file']).read_bytes();request=check.wire.decode_request('MacOSFrameBatchRequest',body);session=fixture/manifest['native_session'];results=[]
check.wire.validate_frame_batch(request,user_id=manifest['user_id'])
problems,verified=check.exchange_problems(manifest,fixture,body,request,session);assert problems==[],problems
results.append({'name':'baseline simulated exchanges pass exact-candidate checker','problems':problems,'verified_distinct':len(verified)})
for method in ['PUT','POST']:
 changed=copy.deepcopy(manifest);entry=next(e for e in changed['exchanges'] if e['method']==method);entry['status']=403
 problems,_=check.exchange_problems(changed,fixture,body,request,session)
 assert any('reply status was 403, not 200' in p for p in problems),problems
 results.append({'name':method+' receipt marked HTTP403 with unchanged success body is refused','problems':problems,'finding':'original status gap closed','mutated_path':entry['path']})
changed=copy.deepcopy(manifest);next(e for e in changed['exchanges'] if e['method']=='POST')['headers']['Authorization']='<other>'
problems,_=check.exchange_problems(changed,fixture,body,request,session);assert problems
results.append({'name':'positive sensitivity control: changed POST bearer is refused','problems':problems})
ast.parse(source.read_text())
Path('/tmp/macos-upload-status-fix-probes.json').write_text(json.dumps({'candidate':'bcfda2c7b5362516135790242767cdb5683a2555','checker_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'fixture':str(fixture),'fixture_manifest_sha256':hashlib.sha256((fixture/'manifest.json').read_bytes()).hexdigest(),'fixture_kind':'Author Python-generated request/exchange simulation using prior native files; NOT new Swift output. Original files read-only, mutations in memory only.','results':results},indent=2)+'\n')
print(json.dumps(results,indent=2))
