from pathlib import Path, PurePosixPath
import hashlib,json,tarfile,zipfile,subprocess,struct,re,posixpath
REPO=Path('/home/agentsdock/Projects/learning-companion/repo'); P=Path('/tmp/lc-windows-36723370841'); COMMIT='f46ff8737a8e6cc09fe8577d2a2ef7cd2dfcf7dd'; anomalies=[];notes=[];out={}
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def check(ok,msg):
 if not ok:anomalies.append(msg)
entries=[];hashes={}
for l in (P/'SHA256SUMS').read_text().splitlines():
 d,n=l.split('  ',1);check(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts,'unsafe evidence path');b=(P/n).read_bytes();check(sha(b)==d,'checksum mismatch '+n);entries.append(n);hashes[n]=d
actual={f.relative_to(P).as_posix() for f in P.rglob('*') if f.is_file() and f.name!='SHA256SUMS'};check(len(set(entries))==len(entries),'duplicate checksum');check(set(entries)==actual,'checksum coverage mismatch')
out['checksums']={'listed':len(entries),'actual':len(actual),'coverage_exact':set(entries)==actual,'hashes':hashes}
git={}
for x in subprocess.check_output(['git','ls-tree','-rz',COMMIT],cwd=REPO).split(b'\0'):
 if not x:continue
 meta,name=x.split(b'\t',1);mode,kind,d=meta.decode().split();git[name.decode()]=(mode,kind,d)
archive=set();rawmatch=[];crlfmatch=[];content={};windows=[]
with tarfile.open(P/'source.tar.gz') as t:
 for m in t.getmembers():
  if m.isdir():continue
  check(m.name not in archive,'duplicate archive member '+m.name);archive.add(m.name);check(not PurePosixPath(m.name).is_absolute() and '..' not in PurePosixPath(m.name).parts,'unsafe source path');check(m.isfile() or m.issym(),'unsupported source member '+m.name)
  b=t.extractfile(m).read() if m.isfile() else m.linkname.encode();mode='120000' if m.issym() else ('100755' if m.mode&0o111 else '100644');g=git.get(m.name);check(g is not None,'untracked archive member '+m.name)
  if g:
   check(mode==g[0] and g[1]=='blob','source mode/type mismatch '+m.name)
   if blob(b)==g[2]:rawmatch.append(m.name)
   elif b'\r\n' in b and blob(b.replace(b'\r\n',b'\n'))==g[2]:crlfmatch.append(m.name)
   else:check(False,'source differs beyond CRLF '+m.name)
  if m.name.startswith('apps/windows/') or m.name in ['apps/safari-extension/src/ink.ts','apps/safari-extension/src/mode.ts']:
   content[m.name]=b
  if m.name.startswith('apps/windows/'):windows.append(m.name)
check(archive==set(git),'archive/Git path closure differs')
out['source']={'commit':COMMIT,'git_blobs':len(git),'archive_files':len(archive),'raw_blob_matches':len(rawmatch),'only_crlf_conversion':len(crlfmatch),'crlf_paths':crlfmatch,'windows_files':len(windows),'all_paths_modes_and_normalized_bytes_match':not any('source ' in x or 'archive' in x for x in anomalies),'reused_ink_blob':git['apps/safari-extension/src/ink.ts'][2],'reused_mode_blob':git['apps/safari-extension/src/mode.ts'][2]}
# Package metadata, actual Windows PE, complete app closure and links.
base='WindowsDesktop/resources/app/';dist=base+'dist/'; runtime_required=['electron.exe','version','resources.pak','icudtl.dat','chrome_100_percent.pak','chrome_200_percent.pak','snapshot_blob.bin','v8_context_snapshot.bin','ffmpeg.dll','d3dcompiler_47.dll','dxcompiler.dll','dxil.dll','vk_swiftshader.dll','vk_swiftshader_icd.json','vulkan-1.dll','locales/en-US.pak']
with zipfile.ZipFile(P/'WindowsDesktop.zip') as z:
 names=z.namelist();name_set=set(names);check(z.testzip() is None,'ZIP CRC failure');check(len(names)==len(name_set),'duplicate ZIP member');check(all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts for n in names),'unsafe ZIP path')
 missing_runtime=[n for n in runtime_required if 'WindowsDesktop/'+n not in name_set]
 for n in missing_runtime:check(False,'missing runtime file '+n)
 version=z.read('WindowsDesktop/version').decode().strip();check(version=='44.5.1','runtime version mismatch');b=z.read('WindowsDesktop/electron.exe');check(b[:2]==b'MZ','no DOS header');off=struct.unpack_from('<I',b,0x3c)[0];check(b[off:off+4]==b'PE\0\0','no PE signature');machine,section_count=struct.unpack_from('<HH',b,off+4);magic=struct.unpack_from('<H',b,off+24)[0];check(machine==0x8664 and magic==0x20b,'not x64 PE32+ executable')
 sig=bytes.fromhex('bd04effe00000100');positions=[m.start() for m in re.finditer(re.escape(sig),b)];fixed=[]
 for o in positions:
  vals=struct.unpack_from('<13I',b,o);ver=lambda a,c:f'{a>>16}.{a&65535}.{c>>16}.{c&65535}';fixed.append({'file':ver(vals[2],vals[3]),'product':ver(vals[4],vals[5]),'offset':o})
 check(any(v['file'].startswith('44.5.1.') and v['product'].startswith('44.5.1.') for v in fixed),'Electron executable fixed version disagrees')
 executable={'bytes':len(b),'sha256':sha(b),'machine':hex(machine),'format':'PE32+ x64','fixed_version_candidates':fixed};del b
 manifest_bytes=z.read(base+'package.json');manifest=json.loads(manifest_bytes);check(manifest_bytes==content['apps/windows/package.json'],'packaged package.json differs from snapshot');check(manifest['type']=='module','main is not ESM');check(manifest['devDependencies']['electron']=='44.5.1' and manifest['devDependencies']['typescript']=='7.0.2','dependency versions mismatch');check(not manifest.get('dependencies'),'unexpected runtime dependencies');entry=base+manifest['main'];check(entry in name_set,'main missing')
 static=[]
 for p,b in content.items():
  if p.startswith('apps/windows/src/') and Path(p).suffix in ['.cjs','.css','.html']:
   n=dist+p;check(n in name_set,'missing copied static '+n)
   if n in name_set:check(z.read(n)==b,'static bytes differ '+n);static.append(n)
 appnames=sorted(n for n in names if n.startswith(base));production_js=[n for n in appnames if n.endswith(('.js','.cjs')) and '/tests/' not in n];edges=[];external=set();missing=[]
 pattern=re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s*)['"]([^'"]+)['"]''',re.M)
 for n in production_js:
  text=z.read(n).decode()
  for spec in pattern.findall(text):
   if spec.startswith('.'):
    resolved=posixpath.normpath(posixpath.join(posixpath.dirname(n),spec));edges.append({'from':n,'specifier':spec,'to':resolved});check(resolved in name_set,'unresolved runtime import '+resolved)
    if resolved not in name_set:missing.append(resolved)
   else:external.add(spec);check(spec=='electron' or spec.startswith('node:'),'unbundled package import '+spec)
 for n in static:
  if not n.endswith('.html'):continue
  html=z.read(n).decode()
  for spec in re.findall(r'''(?:src|href)=["']([^"']+)["']''',html):
   if spec.startswith(('data:','http:','https:','#')):continue
   resolved=posixpath.normpath(posixpath.join(posixpath.dirname(n),spec));check(resolved in name_set,'HTML referenced asset missing '+resolved);edges.append({'from':n,'specifier':spec,'to':resolved})
 for w in ['control','overlay']:
  check(dist+'apps/windows/src/preload/'+w+'.cjs' in name_set,'required preload absent');check(dist+'apps/windows/src/renderer/'+w+'.html' in name_set,'required page absent')
 for m in ['ink','mode']:check(dist+'apps/safari-extension/src/'+m+'.js' in name_set,'reused sibling module missing '+m)
 main=z.read(entry).decode();check("'app://bundle/" in main or '`app://bundle/' in main,'app protocol helper absent');check("'preload'" in main and '`${name}.cjs`' in main,'preload path calculation differs');check("join(HERE, '..', '..', '..', '..')" in main,'runtime dist root differs')
 out['package']={'zip_files':len(names),'app_files':len(appnames),'runtime_files':len(names)-len(appnames),'locales':sum('/locales/' in n for n in names),'runtime_version':version,'executable':executable,'manifest':manifest,'main':entry,'static_files_exact_snapshot':static,'production_js_modules':production_js,'runtime_edges':edges,'external_imports':sorted(external),'missing_runtime':missing_runtime,'missing_imports':missing,'crc_ok':True}
# Observed hosted result, without executing tests or app.
log=(P/'tests.log').read_text();test_lines=[l for l in log.splitlines() if l.startswith('✔ ')];check(len(test_lines)==54,'not 54 actual tests');check('ℹ pass 54' in log and 'ℹ fail 0' in log,'test summary failed');check(not any(l.startswith('✖ ') for l in log.splitlines()),'failing tests in log')
result=json.loads((P/'result.json').read_text());check(result['exit_code']==0 and result['state']=='checks-completed','nonzero build result');check(COMMIT in (P/'environment.txt').read_text(),'environment commit mismatch')
out['hosted']={'result':result,'test_count':len(test_lines),'test_passes':54,'test_failures':0,'test_lines':test_lines,'manifest':json.loads((P/'manifest.log').read_text()),'environment':(P/'environment.txt').read_text(),'electron_version_log':(P/'electron-version.log').read_text()}
out['anomalies']=anomalies
Path('/tmp/windows-retention-hosted-audit.json').write_text(json.dumps(out,indent=2)+'\n')

# Confirm the PE version from RT_VERSION (not incidental signature bytes in executable code).
with zipfile.ZipFile(P/'WindowsDesktop.zip') as z:
 def pe(b):
  o=struct.unpack_from('<I',b,0x3c)[0]; n=struct.unpack_from('<H',b,o+6)[0]; opts=struct.unpack_from('<H',b,o+20)[0]; opt=o+24; dirs=opt+(112 if struct.unpack_from('<H',b,opt)[0]==0x20b else 96); sections=[]
  for i in range(n):
   size,rva,raw,ptr=struct.unpack_from('<4I',b,opt+opts+40*i+8);sections.append((rva,max(size,raw),ptr))
  def at(r):
   for start,size,ptr in sections:
    if start<=r<start+size:return ptr+r-start
   raise ValueError(r)
  ir=struct.unpack_from('<I',b,dirs+8)[0]; imports=[]
  if ir:
   q=at(ir)
   while any(struct.unpack_from('<5I',b,q)):
    a=at(struct.unpack_from('<I',b,q+12)[0]);imports.append(b[a:b.index(bytes([0]),a)].decode());q+=20
  return imports,(dirs,at)
 imports={n:pe(z.read(n))[0] for n in z.namelist() if n.endswith(('.exe','.dll'))}
 b=z.read('WindowsDesktop/electron.exe');_,(dirs,at)=pe(b);base=at(struct.unpack_from('<I',b,dirs+16)[0]);versions=[]
 def resource_entries(rel):
  named,ids=struct.unpack_from('<HH',b,base+rel+12);return [struct.unpack_from('<II',b,base+rel+16+8*i) for i in range(named+ids)]
 def visit(v):
  if v&0x80000000:
   for k,x in resource_entries(v&0x7fffffff):visit(x)
  else:
   r,size=struct.unpack_from('<II',b,base+v);data=b[at(r):at(r)+size];o=data.index(bytes.fromhex('bd04effe00000100'));vv=struct.unpack_from('<13I',data,o);fmt=lambda a,c:f'{a>>16}.{a&65535}.{c>>16}.{c&65535}';versions.append({'file':fmt(vv[2],vv[3]),'product':fmt(vv[4],vv[5]),'resource_bytes':size})
 visit(next(v for k,v in resource_entries(0) if k==16));check(versions==[{'file':'44.5.1.0','product':'44.5.1.0','resource_bytes':816}],'RT_VERSION disagrees')
 supplied={PurePosixPath(n).name.lower() for n in z.namelist()};system=sorted({d for im in imports.values() for d in im if d.lower() not in supplied})
 out['package']['executable'].pop('fixed_version_candidates');out['package']['executable']['version_resources']=versions;out['package']['pe_imports']=imports;out['package']['system_imports']=system
# The independent Git archive was produced read-only with core.autocrlf=true; compare actual member bytes.
def tar_view(f):
 with tarfile.open(f) as t:return t.pax_headers,{m.name:(m.mode,m.type.decode(),m.linkname,sha(t.extractfile(m).read()) if m.isfile() else None) for m in t.getmembers() if not m.isdir()}
subprocess.run(['git','-c','core.autocrlf=true','archive','--format=tar',COMMIT,'--output=/tmp/lc-windows-36723370841-autocrlf.tar'],cwd=REPO,check=True)
a,files=tar_view(P/'source.tar.gz');b,local=tar_view('/tmp/lc-windows-36723370841-autocrlf.tar');check(files==local,'core.autocrlf=true reproduction differs')
out['source']['git_archive_pax_metadata']=a
out['source']['autocrlf_true_archive_reproduction']={'command':'git -c core.autocrlf=true archive --format=tar f46ff8737a8e6cc09fe8577d2a2ef7cd2dfcf7dd','all_member_bytes_modes_types_names_identical':files==local,'runner_core_autocrlf_setting_directly_logged':False,'differences_beyond_line_endings':0}

# Current correction/source identity and changed runtime presence, without launching or rebuilding.
base="WindowsDesktop/resources/app/"
expected_inputs=['apps/windows','scripts/desktop-checks.sh','.github/workflows/desktop-checks.yml','apps/safari-extension/src/ink.ts','apps/safari-extension/src/mode.ts']
env=(P/'environment.txt').read_text().splitlines()
actual_inputs=[line for line in env if re.fullmatch(r'[0-9a-f]{40}',line)]
expected_oids=[subprocess.check_output(['git','rev-parse',COMMIT+':'+path],cwd=REPO,text=True).strip() for path in expected_inputs]
check(actual_inputs==expected_oids,'environment build input hashes disagree')
check(a.get('comment')==COMMIT,'archive PAX source identity disagrees')
owner='e586b822f81867ecab29ddaeccf5537a40b9f653'
owner_tree=subprocess.check_output(['git','rev-parse',owner+':apps/windows'],cwd=REPO,text=True).strip()
check(owner_tree==expected_oids[0],'hosted Windows source differs from reviewed retention correction')
out['source']['build_input_hashes']={path:oid for path,oid in zip(expected_inputs,expected_oids)}
out['source']['windows_tree_identical_to_reviewed_correction']=owner
markers={
 'src/main/main.js':['function appendRetention','validBytes','truncateSync','STOP_HARD_MS = 60_000','function recordUnfinished','function writeUnrecordedEnds','endedUnrecorded','nativeImage.createFromBuffer','function factsProblem','lc:observation-gap','lc:stopping'],
 'src/renderer/overlay.js':['const retentionPending = new Map','lc.observationGap','gap_ms: sample.gap_ms','lc.stopping','Promise.all([sampling, saveIfChanged(), retention])'],
 'src/renderer/control.js':['r.unfinished','r.ended && !r.end_recorded'],
 'src/preload/overlay.cjs':['lc:observation-gap','lc:stopping'],
 'src/shared/retention.js':['max_frames: 1000','max_bytes: 1024 * 1024 * 1024','function decideRetention','function pngSize'],
}
with zipfile.ZipFile(P/'WindowsDesktop.zip') as z:
 checks={}
 for name,needles in markers.items():
  path=dist+'apps/windows/'+name
  data=z.read(path); txt=data.decode()
  present={needle:needle in txt for needle in needles}
  check(all(present.values()),'retention correction runtime markers missing '+path)
  checks[path]={'sha256':sha(data),'bytes':len(data),'markers':present}
 out['package']['retention_correction_runtime']=checks
 prior=Path('/tmp/lc-windows-36713802500/WindowsDesktop.zip')
 if prior.exists():
  with zipfile.ZipFile(prior) as old:
   runtime={n:sha(z.read(n)) for n in z.namelist() if not n.startswith(base)}
   original={n:sha(old.read(n)) for n in old.namelist() if not n.startswith(base)}
   check(runtime==original,'Electron runtime differs from prior reviewed complete package')
   out['package']['runtime_exact_previous_package']={'previous_run':36713802500,'same_names_and_sha256':runtime==original,'files':len(runtime)}
 check('error' not in (P/'electron-path-error.log').read_text().lower(),'electron path resolution error logged')
 check(z.read(base+'package.json')==content['apps/windows/package.json'],'package identity mismatch')
 check('tsc -p tsconfig.json && node scripts/copy-static.mjs' in (P/'build.log').read_text(),'expected build command missing')
 for flag in ['interactive_runtime_verified','provider_verified','project_signing_performed']:
  check(result.get(flag) is False,'unexpected verification flag '+flag)
out['hosted']['run_id']=36723370841
out['hosted']['artifact_id']=11101606896
out['hosted']['build_log']=(P/'build.log').read_text()
out['hosted']['install_log']=(P/'install.log').read_text()
out['hosted']['package_log']=(P/'package.log').read_text()

out['anomalies']=anomalies
Path('/tmp/windows-retention-hosted-audit.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'checksums':len(entries),'git_blobs':len(git),'raw_matches':len(rawmatch),'CRLF_only':len(crlfmatch),'archive_reproduction':files==local,'version':versions,'tests':len(test_lines),'anomalies':anomalies},indent=2))
assert not anomalies,anomalies
