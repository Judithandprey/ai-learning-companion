from pathlib import Path
import subprocess,json,hashlib
c='5871981524140e3be986268a941d34e99af25bb9';base='d6ef68a03bc3e18569d1b4a85dc20f09b7717dff';root=Path('/tmp/lc-windows-parent-5871981');r={'candidate':c,'parent':base,'backend':'6425a51834a09fe1f1f5ec367b1bc26043e1da52','delta_files':[],'owner_runs':[]}
assert subprocess.check_output(['git','show','-s','--format=%P',c],text=True).strip()==base
for p in subprocess.check_output(['git','diff','--name-only',base,c],text=True).splitlines():
 assert p.startswith(('apps/windows/','docs/verification/web/')),p
 b=subprocess.check_output(['git','show',f'{c}:{p}']);assert b==(root/p).read_bytes(),p
 r['delta_files'].append({'path':p,'sha256':hashlib.sha256(b).hexdigest()})
prefix='docs/verification/web/evidence/windows-capture-link/correction/'
for run in ('linux-focused','windows-focused'):
 data=json.loads((root/(prefix+run+'.json')).read_text());log=(root/(prefix+run+'.txt')).read_bytes()
 assert hashlib.sha256(log).hexdigest()==data['result_sha256'],run
 for p,h in data['executed_files_sha256'].items():
  b=subprocess.check_output(['git','show',f'{c}:{p}']);assert hashlib.sha256(b).hexdigest()==h,(run,p)
 r['owner_runs'].append({'run':run,'counts':data['counts'],'runtime':data['runtime'],'source_hashes_verified':len(data['executed_files_sha256']),'result_sha256':data['result_sha256'],'attribution':'Author execution receipt, independently matched to source/log bytes; not root native execution.'})
# Shared dependencies used by the exact export must match the actual integration target.
for p in ['apps/windows/package.json','apps/windows/package-lock.json','apps/windows/tsconfig.json']:
 assert subprocess.check_output(['git','show',f'{c}:{p}'])==Path(p).read_bytes(),p
r['result']='PASS: scoped exact delta and both owner receipt sets match committed source and logs.'
Path('/tmp/windows-parent-correction-source-audit.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({'result':r['result'],'delta_files':len(r['delta_files']),'owner_runs':r['owner_runs']},indent=2))
