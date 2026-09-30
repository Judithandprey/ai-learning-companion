# Read-only artifact audit adapted from macos-ink-hosted; no build/test/app execution.
from pathlib import Path, PurePosixPath
import hashlib, json, tarfile, zipfile, struct, plistlib, subprocess, re
REPO=Path('/home/agentsdock/Projects/learning-companion/repo'); P=Path('/tmp/lc-macos-36737163642'); COMMIT='5f80c0926f96d3afdb8da7a00c295b4f4e8fdd63'
sha=lambda b:hashlib.sha256(b).hexdigest()
out={}; anomalies=[]
def check(condition,message):
 if not condition: anomalies.append(message)
# Complete evidence coverage, not just agreement for listed files.
entries=[]
for line in (P/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split('  ',1); rel=PurePosixPath(name); check(not rel.is_absolute() and '..' not in rel.parts,'unsafe checksum path'); f=P/name;check(f.is_file(),f'missing {name}');check(sha(f.read_bytes())==digest,f'hash mismatch {name}');entries.append(name)
all_files={str(f.relative_to(P)) for f in P.rglob('*') if f.is_file() and f.name!='SHA256SUMS'}
check(set(entries)==all_files,'checksum coverage mismatch');check(len(entries)==len(set(entries)),'duplicate checksum entries')
out['checksums']={'listed':len(entries),'actual_files':len(all_files),'coverage_exact':set(entries)==all_files,'sha256sums_sha256':sha((P/'SHA256SUMS').read_bytes()),'source_archive_sha256':sha((P/'source.tar.gz').read_bytes()),'package_sha256':sha((P/'MacDesktop.zip').read_bytes())}
# Exact full source tree, every blob and executable bit. Read tar in-memory, no extraction.
git={}
for item in subprocess.check_output(['git','ls-tree','-rz',COMMIT],cwd=REPO).split(b'\0'):
 if not item:continue
 meta,name=item.split(b'\t',1);mode,kind,digest=meta.decode().split();git[name.decode()]=(mode,kind,digest)
archive={};mac=0
with tarfile.open(P/'source.tar.gz','r:gz') as tf:
 for m in tf.getmembers():
  if m.isdir():continue
  check(m.name not in archive,'duplicate tar path '+m.name)
  check(not PurePosixPath(m.name).is_absolute() and '..' not in PurePosixPath(m.name).parts,'unsafe archive member')
  check(m.isfile() or m.issym(),'nonfile archive member '+m.name)
  data=tf.extractfile(m).read() if m.isfile() else m.linkname.encode()
  digest=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();mode='120000' if m.issym() else ('100755' if m.mode&0o111 else '100644')
  archive[m.name]=(mode,'blob',digest);check(archive[m.name]==git.get(m.name),'archive/git mismatch '+m.name)
  if m.name.startswith('apps/macos/'):mac+=1
  if m.name=='apps/macos/CompanionDesktop/Packaging/Info.plist':source_plist=data
  if m.name=='apps/macos/CompanionDesktop/Tests/DesktopCaptureTests/DesktopIngressTests.swift':ingress_test_source=data.decode()
  if m.name=='apps/macos/CompanionDesktop/Tests/DesktopCaptureTests/DesktopCaptureTests.swift':capture_test_source=data.decode()
  if m.name=='apps/macos/CompanionDesktop/Tests/DesktopCaptureTests/InkTests.swift':ink_test_source=data.decode()
  if m.name=='apps/macos/CompanionDesktop/Tests/DesktopCaptureTests/InkCompositionTests.swift':composition_test_source=data.decode()
 archive_pax=tf.pax_headers
check(set(archive)==set(git),'source/git file set mismatch')
check(archive_pax.get('comment')==COMMIT,'archive commit metadata mismatch')
out['source']={'pax':archive_pax,'commit':COMMIT,'archive_members':len(archive),'git_blobs':len(git),'macos_files':mac,'all_blob_bytes_modes_and_names_match':archive==git}
# Native Mach-O content and bundle, no application execution.
with zipfile.ZipFile(P/'MacDesktop.zip') as z:
 check(z.testzip() is None,'zip CRC failure'); infos=z.infolist(); plist=z.read('CompanionDesktop.app/Contents/Info.plist');binary=z.read('CompanionDesktop.app/Contents/MacOS/CompanionDesktop');info=next(i for i in infos if i.filename.endswith('/MacOS/CompanionDesktop'))
 check(plist==source_plist,'packaged plist differs from source');check((info.external_attr>>16)&0o111!=0,'binary not executable');check(struct.unpack_from('<I',binary)[0]==0xfeedfacf,'not little endian Mach-O64')
 magic,cpu,subcpu,ftype,ncmds,sizeofcmds,flags,reserved=struct.unpack_from('<8I',binary);check(cpu==0x100000c and ftype==2,'not arm64 executable');offset=32;dylibs=[];rpaths=[];versions=[];signature=False
 for _ in range(ncmds):
  cmd,size=struct.unpack_from('<II',binary,offset);check(size>=8 and offset+size<=len(binary),'invalid load command');block=binary[offset:offset+size]
  if cmd in (0xc,0x80000018,0x8000001f,0x20,0x80000023):
   nameoffset=struct.unpack_from('<I',block,8)[0];dylibs.append(block[nameoffset:].split(b'\0',1)[0].decode())
  if cmd==0x8000001c:
   nameoffset=struct.unpack_from('<I',block,8)[0];rpaths.append(block[nameoffset:].split(b'\0',1)[0].decode())
  if cmd==0x32:
   platform,minos,sdk,ntools=struct.unpack_from('<4I',block,8);fmt=lambda v:f'{v>>16}.{v>>8&255}.{v&255}';versions.append({'platform':platform,'minos':fmt(minos),'sdk':fmt(sdk)})
  if cmd==0x1d:signature=True
  offset+=size
 check(offset==32+sizeofcmds,'Mach-O load-command extent mismatch')
 check(all(x.startswith(('/System/Library/','/usr/lib/','@rpath/libswift')) for x in dylibs),'unexpected third-party dependency')
 out['app']={'entries':[{'path':i.filename,'bytes':i.file_size,'mode':oct(i.external_attr>>16)} for i in infos],'binary_sha256':sha(binary),'binary_bytes':len(binary),'plist':plistlib.loads(plist),'architecture':'arm64','build_versions':versions,'dylibs':dylibs,'rpaths':rpaths,'linker_signature_present':signature,'zip_crc_ok':True,'plist_exact_source':plist==source_plist}
# Actual logged XCTest runs, not the independent SwiftTesting zero-count footer.
log=(P/'tests.log').read_text();passed=re.findall(r"Test Case '-\[([^]]+)\]' passed",log);started=re.findall(r"Test Case '-\[([^]]+)\]' started",log)
check(len(passed)==42 and len(set(passed))==42 and passed==started,'unexpected native XCTest count/order');check('Executed 42 tests, with 0 failures (0 unexpected)' in log,'no clean XCTest suite result')
reader=[p for p in passed if 'ReaderRefuses' in p]
check(len(reader)==3,'reader negatives not executed')
source_tests=re.findall(r'func (test\w+)\(',capture_test_source+ingress_test_source+ink_test_source+composition_test_source);check(set(x.split()[-1] for x in passed)==set(source_tests),'test source/log names differ')
checker=(P/'ingress-fixture.log').read_text().splitlines();out['tests']={'xctests':len(passed),'reader_negative_cases':reader,'all_test_names_match_source':True,'source_declared_tests':len(source_tests),'failures':0,'swift_testing_footer':next(x for x in log.splitlines() if 'Test run with 0 tests' in x),'checker_pass_lines':sum(x.startswith('PASS ') for x in checker),'checker_fail_lines':sum(x.startswith('FAIL ') for x in checker),'checker_summary':checker[-1]};check(checker[-1]=='all desktop ingress fixture checks passed','checker not complete')
# Read actual native retained frame manifests and independently check each PNG byte record.
fixtures=[]
for base in [P/'macos-fixture',P/'macos-ingress-fixture/native']:
 dirs=[x for x in base.iterdir() if x.is_dir()];check(len(dirs)==1,'fixture session count');d=dirs[0];status=json.loads((d/'status.json').read_text());events=[json.loads(l) for l in (d/'events.jsonl').read_text().splitlines()];frames=[]
 for ev in events:
  if ev['event']!='kept':continue
  f=ev['frame'];b=(d/f['file']).read_bytes();check(sha(b)==f['sha256'] and len(b)==f['byteLength'],'frame original mismatch');check(b[:8]==b'\x89PNG\r\n\x1a\n','bad PNG signature');w,h,depth,color=struct.unpack_from('>IIBB',b,16);check(w==f['width'] and h==f['height'],'PNG dimension mismatch');frames.append({'sequence':f['sequence'],'sha256':sha(b),'bytes':len(b),'width':w,'height':h,'bit_depth':depth,'color_type':color,'display_ticks':f['facts'].get('displayTimeTicks')})
 check(status['keptFrames']==len(frames),'status/kept mismatch');check(status['bytesKept']==sum(f['bytes'] for f in frames),'status/bytes mismatch');check(status['ending']['reason']=='user_stop' and not status['pixelsCurrent'] and status['callbacksAfterLiveEnded']==0,'fixture stop status mismatch')
 gaps=[e['run']['kind'] if e['event']=='run' else e['detail']['kind'] for e in events if (e['event']=='run' and e['run']['isGap']) or e['event']=='gap']
 fixtures.append({'path':str(d.relative_to(P)),'events':len(events),'status':status,'frames':frames,'gaps':gaps})
out['fixtures']=fixtures
check([f['sequence'] for f in fixtures[1]['frames']]==[1,3,6],'ingress fixture sequences mismatch')
check(fixtures[1]['gaps']==['blank','complete_without_image','missing','no_callbacks'],'gap set/order mismatch')
check(fixtures[1]['frames'][1]['display_ticks']==2**64-1,'UInt64 fixture lost precision')
m=json.loads((P/'macos-ingress-fixture/manifest.json').read_text());cases=m['cases'];requests=[]
for c in cases:
 if c['type']!='request':continue
 b=json.loads((P/'macos-ingress-fixture'/c['body']).read_text());records=b['batch']['records'];requests.append({'name':c['name'],'frames':len(b['frames']),'records':len(records),'gaps':c['gap_kinds'],'sha256':sha((P/'macos-ingress-fixture'/c['body']).read_bytes())})
 for r in records:
  if r['frame_id'] is None:check(not r['artifacts'] and r['evidence']['coverage'] in ['unobserved','unknown'],'gap has invented pixels')
refusals=[c for c in cases if c['type']=='refusal'];check(len(refusals)==26,'refusal count mismatch');check(all(c['expected'] and c['expected'] in c['reason'] for c in refusals),'invalid Swift refusal')
out['ingress']={'manifest_keys':list(m),'synthetic_label':m['synthetic'],'generator':m['generator'],'requests':requests,'swift_refusals':len(refusals),'logged_mutation_refusals':sum(x.startswith('PASS request') and 'is refused' in x for x in checker)}
result=json.loads((P/'result.json').read_text())
check(result.get('state')=='checks-completed' and result.get('exit_code')==0 and result.get('last_phase')=='complete','hosted result is incomplete')
for flag in ['interactive_runtime_verified','provider_verified','project_signing_performed']:check(result.get(flag) is False,'unexpected '+flag)
check('commit='+COMMIT in (P/'environment.txt').read_text(),'environment source mismatch')
owner_tree=subprocess.check_output(['git','rev-parse','a17f6c1ffe1eb760ee20ec8174578183978399b0:apps/macos/CompanionDesktop'],cwd=REPO,text=True).strip()
actual_tree=subprocess.check_output(['git','rev-parse',COMMIT+':apps/macos/CompanionDesktop'],cwd=REPO,text=True).strip()
check(owner_tree==actual_tree,'native source differs from approved a17f6c1')
out['source']['approved_a17f6c1_tree']=owner_tree
out['source']['hosted_native_tree']=actual_tree
out['hosted']={'result':result,'environment':(P/'environment.txt').read_text(),'toolchain':(P/'toolchain.log').read_text(),'build_log':(P/'build-package.log').read_text(),'fixture_log':(P/'fixture.log').read_text()}
manifest=json.loads((P/'manifest.json').read_text())
products={p['name']:p for p in manifest['products']};targets={t['name']:t for t in manifest['targets']}
check(products['CompanionDesktop']['type']=={'executable':None},'not executable product')
check(targets['DesktopCaptureTests']['target_dependencies']==['DesktopCapture'],'test target coverage differs')
check(set(targets['CompanionDesktop']['sources'])=={'CaptureController.swift','CaptureRun.swift','CompanionDesktopApp.swift','ContentView.swift','InkController.swift','InkViews.swift'},'app sources incomplete')
check('Build of product' in (P/'build-package.log').read_text() and 'complete!' in (P/'build-package.log').read_text(),'native app build not complete')
inputs=['apps/macos/CompanionDesktop','scripts/desktop-checks.sh','.github/workflows/desktop-checks.yml','pyproject.toml','uv.lock']
expected=[subprocess.check_output(['git','rev-parse',COMMIT+':'+p],cwd=REPO,text=True).strip() for p in inputs]
observed=[l for l in (P/'environment.txt').read_text().splitlines() if re.fullmatch(r'[0-9a-f]{40}',l)]
check(expected==observed,'build inputs disagree with commit')
new_scope=[c for c in refusals if c['name']=='ink_overlay_scope'];check(len(new_scope)==1,'new scope refusal missing')
out['hosted']['manifest']=manifest
out['hosted']['input_blobs']=dict(zip(inputs,expected))
out['tests']['new_scope_refusal']=new_scope
out['tests']['ink_tests_run']=[n for n in passed if n.split()[-1] in re.findall(r'func (test\w+)\(',ink_test_source)]
out['checksums']['hashes']={line.split('  ',1)[1]:line.split('  ',1)[0] for line in (P/'SHA256SUMS').read_text().splitlines()}

# Bind the downloaded run and artifact receipts, without querying or rerunning CI.
run_path=Path('/tmp/lc-macos-36737163642-run.json'); artifact_path=Path('/tmp/lc-macos-36737163642-artifacts.json')
run=json.loads(run_path.read_text()); artifacts=json.loads(artifact_path.read_text())
check(run['headSha']==COMMIT and run['status']=='completed' and run['conclusion']=='success','run source/result mismatch')
check(len(run['jobs'])==1 and run['jobs'][0]['name']=='desktop (macos)' and run['jobs'][0]['conclusion']=='success','unexpected Mac job')
for name in ['Check and package exact desktop source','Upload available source, checks and development artifacts']:
 check(any(s['name']==name and s['conclusion']=='success' for s in run['jobs'][0]['steps']),'required step missing '+name)
check(artifacts['total_count']==len(artifacts['artifacts'])==1,'artifact count mismatch')
artifact=artifacts['artifacts'][0]
check(artifact['workflow_run']['id']==36737163642 and artifact['workflow_run']['head_sha']==COMMIT and artifact['workflow_run']['head_branch']=='main','artifact source mismatch')
check(artifact['id']==11108395236 and artifact['name']==f'desktop-macos-{COMMIT}-1' and not artifact['expired'],'artifact identity mismatch')
out['github_receipts']={'run':run,'artifact':artifact,'receipt_sha256':{p.name:sha(p.read_bytes()) for p in [run_path,artifact_path]},'outer_artifact_zip_digest_recomputed':False}
with zipfile.ZipFile(P/'MacDesktop.zip') as z:
 names=z.namelist()
 check(len(names)==len(set(names)) and all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts for n in names),'unsafe/duplicate ZIP members')
 check(out['app']['plist']['CFBundleExecutable']=='CompanionDesktop' and out['app']['plist']['LSMinimumSystemVersion']=='15.0','bundle identity/minimum OS mismatch')
for name,target in targets.items():
 prefix='apps/macos/CompanionDesktop/'+target['path']+'/'
 sources={p[len(prefix):] for p in archive if p.startswith(prefix) and p.endswith('.swift')}
 check(sources==set(target['sources']), 'manifest source closure differs for '+name)
check(manifest['dependencies']==[] and manifest['platforms']==[{'name':'macos','version':'15.0'}],'unexpected package/platform dependency')
check(out['tests']['checker_pass_lines']==83 and out['tests']['checker_fail_lines']==0,'ingress checker count/result mismatch')
app_scope=[c for c in refusals if c['name']=='app_excluded_scope']
check(len(app_scope)==1 and 'no released 0.2.7 scope value' in app_scope[0]['reason'],'app-excluded scope refusal missing')
out['tests']['app_excluded_scope_refusal']=app_scope
out['tests']['composition_tests_run']=[n for n in passed if n.split()[-1] in re.findall(r'func (test\w+)\(',composition_test_source)]

# Small independent PNG byte decode: the actual fixture uses non-interlaced RGBA8.
# This reads saved files only; it does not invoke Swift, the owner validator or mutation tests.
import zlib

def png_rgba(data):
 check(data[:8]==b'\x89PNG\r\n\x1a\n','PNG signature mismatch')
 offset=8; compressed=bytearray(); header=None; ended=False
 while offset<len(data):
  length=struct.unpack_from('>I',data,offset)[0];kind=data[offset+4:offset+8]
  payload=data[offset+8:offset+8+length];crc=struct.unpack_from('>I',data,offset+8+length)[0]
  check(zlib.crc32(kind+payload)&0xffffffff==crc,'PNG chunk CRC mismatch')
  if kind==b'IHDR':header=struct.unpack('>IIBBBBB',payload)
  if kind==b'IDAT':compressed.extend(payload)
  offset+=length+12
  if kind==b'IEND':ended=True;break
 assert header is not None and header[2:]==(8,6,0,0,0),header
 check(ended and offset==len(data),'PNG end/trailing bytes mismatch')
 w,h=header[:2]; stride=w*4; decoded=zlib.decompress(compressed)
 check(len(decoded)==h*(stride+1),'PNG decoded length mismatch')
 prior=bytearray(stride); pixels=bytearray()
 for y in range(h):
  base=y*(stride+1);kind=decoded[base]; row=bytearray(decoded[base+1:base+1+stride])
  for i in range(stride):
   left=row[i-4] if i>=4 else 0;above=prior[i];upperleft=prior[i-4] if i>=4 else 0
   if kind==0:predict=0
   elif kind==1:predict=left
   elif kind==2:predict=above
   elif kind==3:predict=(left+above)//2
   elif kind==4:
    p=left+above-upperleft;pa,pb,pc=abs(p-left),abs(p-above),abs(p-upperleft)
    predict=left if pa<=pb and pa<=pc else above if pb<=pc else upperleft
   else:raise AssertionError('unsupported PNG filter '+str(kind))
   row[i]=(row[i]+predict)&255
  pixels.extend(row);prior=row
 return w,h,bytes(pixels)

base=P/'macos-composed-fixture';dirs=[p for p in base.iterdir() if p.is_dir()]
check(len(dirs)==1,'composed session count mismatch');session=dirs[0]
status=json.loads((session/'status.json').read_text());events=[json.loads(l) for l in (session/'events.jsonl').read_text().splitlines()]
kept=[e['frame'] for e in events if e['event']=='kept'];composed=[e['composed'] for e in events if e['event']=='composed'];refused=[e for e in events if e['event']=='not_composed']
check([f['sequence'] for f in kept]==list(range(1,8)),'composed fixture raw sequences mismatch')
check([f['rawSequence'] for f in composed]==list(range(1,7)) and len(refused)==1 and refused[0]['detail']['sequence']=='7' and refused[0]['detail']['reason']=='refused','composition outcomes mismatch')
check(events[-1]['event']=='ended' and sum(e['event']=='ended' for e in events)==1,'outcome/ending order mismatch')
check('50×100 pt at 90°' in refused[0]['detail']['detail'],'geometry refusal detail missing')
check([c['ink']['revision'] for c in composed]==[0,1,2,3,4,4],'composed revision order mismatch')
check(status['keptFrames']==7 and status['composedFrames']==6 and status['notComposed']=={'refused':1},'composed status count mismatch')
check(status['ending']['reason']=='user_stop' and status['ending']['liveEndedHost']==107.5 and not status['pixelsCurrent'] and status['callbacksAfterLiveEnded']==0,'composed Stop state mismatch')
check(status['eventWriteFailures']==status['statusWriteFailures']==0,'fixture write failure recorded')
check(status['sourceTimeUnknown']=={'missing':1},'unknown source time count mismatch')
check('excludingApplications: [this app]' in status['display']['scope'] and 'unverified on a Mac' in status['display']['scope'],'scope overclaim or missing exclusion')

decoded={}; facts={}
for f in kept+composed:
 path=f['file'];p=session/path;data=p.read_bytes()
 check(not PurePosixPath(path).is_absolute() and '..' not in PurePosixPath(path).parts,'unsafe fixture path')
 check(sha(data)==f['sha256'] and len(data)==f['byteLength'],'composed/raw retained bytes differ '+path)
 if path not in decoded:
  w,h,pixels=png_rgba(data);decoded[path]=pixels
  check((w,h)==(f['width'],f['height'])==(200,100),'composed fixture dimensions mismatch')
  facts[path]={'sha256':sha(data),'bytes':len(data),'width':w,'height':h,'decoded_rgba_sha256':sha(pixels)}
raw_pixels=decoded[kept[0]['file']]
check(all(decoded[f['file']]==raw_pixels for f in kept),'synthetic raw pixels unexpectedly differ')
check(all(all(abs(c-128)<=2 for c in raw_pixels[i:i+3]) and raw_pixels[i+3]==255 for i in range(0,len(raw_pixels),4)),'raw originals are not opaque uniform gray')
check(status['bytesKept']==sum(f['byteLength'] for f in kept)==4970,'raw byte count mismatch')
composed_files={c['file'] for c in composed if c['file'].startswith('composed/')}
check(composed_files=={p.relative_to(session).as_posix() for p in (session/'composed').iterdir() if p.is_file()} and len(composed_files)==5,'composed files not exhausted')
check(status['composedBytes']==sum(facts[p]['bytes'] for p in composed_files)==5034,'composed byte count mismatch')

ink=json.loads((session/'ink/ink.json').read_text());stroke_ids=[s['id'] for s in ink['strokes']]
check(ink['layer']=='user_original' and ink['authorship']=='user' and ink['revision']==4 and stroke_ids==['s1','s2','s3'],'editable ink identity/history mismatch')
check([s.get('parent') for s in ink['strokes']]==[None,'s1','s1'] and ink['visible']==['s2','s3'],'original/derived pieces not preserved')
check([op['kind'] for op in ink['operations']]==['mode','stroke','erase','undo','redo'],'ink operation history mismatch')
for c in composed:
 raw=kept[c['rawSequence']-1]; pairing=c['ink'];time=raw.get('sourceHost',raw['callbackHost'])
 check((c['rawFile'],c['rawSHA256'],c['rawByteLength'])==(raw['file'],raw['sha256'],raw['byteLength']),'composed raw binding mismatch')
 check(pairing['pixelsHost']==time and pairing['pixelsTime']==('source_time' if 'sourceHost' in raw else 'callback_admission'),'pixel time/basis mismatch')
 check(c['composedHost']==107 and c['composedHost']>time,'composition time substituted for pixels')
 check(pairing['document']=={'createdInSession':ink['createdInSession'],'displayID':ink['displayID'],'file':session.name+'/ink/ink.json'},'editable original binding mismatch')
 ops=[o for o in ink['operations'] if o['host']<=time];revision=ops[-1]['revision'] if ops else 0
 visible=set()
 for op in ops:
  if op['kind'] in {'stroke','erase','undo','redo'}:visible.difference_update(op['removed']);visible.update(op['added'])
 check(pairing['revision']==revision and pairing['strokes']==[x for x in stroke_ids if x in visible],'revision replay mismatch')
 commit=next((o['host'] for o in ink['operations'] if o['revision']==revision and o['kind'] in {'stroke','erase','undo','redo'}),None)
 check(pairing.get('revisionHost')==commit,'commit host mismatch')
 check(any('unverified on a Mac' in s for s in pairing['limits']) and any('not committed' in s for s in pairing['limits']),'pairing limitations missing')
check(any("pixels' own time is unknown" in s for s in composed[-1]['ink']['limits']),'unknown timing limitation missing')
check(composed[0]['file']==kept[0]['file'] and composed[0]['sha256']==kept[0]['sha256'] and composed[0]['byteLength']==kept[0]['byteLength'],'empty-ink raw alias mismatch')

def pixel(c,x,y):
 b=decoded[c['file']];i=(y*200+x)*4;return list(b[i:i+4])
def is_red(p):return all(abs(a-b)<=2 for a,b in zip(p,[255,59,48,255]))
def is_raw(p):return all(abs(a-b)<=2 for a,b in zip(p,[128,128,128,255]))
spot_checks={}
for c in composed[1:]:
 seq=c['rawSequence'];rows={f'{x},{y}':pixel(c,x,y) for x,y in [(40,18),(40,21),(160,18),(160,21),(100,20),(100,80),(100,14),(100,25)]}
 check(all(is_red(rows[f'{x},{y}']) for x,y in [(40,18),(40,21),(160,18),(160,21)]),'ink width/core/opacity mismatch')
 check((is_red if seq in [2,4] else is_raw)(rows['100,20']),'erase/undo/redo middle mismatch')
 check(all(is_raw(rows[key]) for key in ['100,80','100,14','100,25']),'vertical orientation/width/background mismatch')
 check(all(decoded[c['file']][i]==255 for i in range(3,len(decoded[c['file']]),4)),'transparent output pixels')
 spot_checks[str(seq)]=rows
check(decoded[composed[1]['file']]==decoded[composed[3]['file']] and decoded[composed[2]['file']]==decoded[composed[4]['file']]==decoded[composed[5]['file']],'undo/redo image recurrence mismatch')
checker_lines=(P/'composed-fixture.log').read_text().splitlines();positives=[s for s in checker_lines if s.startswith('PASS ') and not s.startswith('PASS negative control')];negatives=[s for s in checker_lines if s.startswith('PASS negative control')]
check(len(positives)==3 and len(negatives)==24 and checker_lines[-1]=='all composed fixture checks passed' and not any(s.startswith('FAIL') for s in checker_lines),'composed checker log mismatch')
check(any('collapsed to 1 px' in s for s in negatives) and any('transparent ink' in s for s in negatives),'width/opacity negative controls missing')
out['composed_fixture']={'path':str(session.relative_to(P)),'event_count':len(events),'kept':len(kept),'compositions':len(composed),'refusals':refused,'revision_sequence':[c['ink']['revision'] for c in composed],'status':status,'pngs':facts,'document_sha256':sha((session/'ink/ink.json').read_bytes()),'original_and_derived_ids':stroke_ids,'raw_alias_sequence':1,'raw_bytes':4970,'composed_bytes':5034,'independent_decode':'stdlib PNG chunk CRC, zlib and filter reconstruction; 12 actual saved RGBA8 PNGs','decoded_spot_checks':spot_checks,'validator_positive_lines':positives,'validator_negative_lines':negatives,'validator_failures':0}

out['anomalies']=anomalies
Path('/tmp/macos-composed-hosted-audit.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'checksums':len(entries),'source_files':len(archive),'source_exact':archive==git,'macos_files':mac,'binary_bytes':len(binary),'xctests':len(passed),'ingress_pass':out['tests']['checker_pass_lines'],'ingress_refusals':out['ingress']['swift_refusals'],'composed_validator_positive':len(positives),'composed_validator_negative':len(negatives),'fixture_kept':len(kept),'composed':len(composed),'refused':len(refused),'revisions':[c['ink']['revision'] for c in composed],'anomalies':anomalies},indent=2))
assert not anomalies,anomalies
