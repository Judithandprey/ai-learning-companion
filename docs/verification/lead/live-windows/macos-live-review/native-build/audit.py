"""Inspect one downloaded build; no application/model/fixture execution."""
import collections, hashlib, json, pathlib, plistlib, re, subprocess, sys, tarfile, zipfile
p=pathlib.Path(sys.argv[1]); commit=sys.argv[2]; approved=sys.argv[3]; run_id=int(sys.argv[4]); out=pathlib.Path(sys.argv[5])
assert not out.exists()
def sha(data): return hashlib.sha256(data).hexdigest()
def git(*args): return subprocess.check_output(['git',*args])
def safe(name):
 path=pathlib.PurePosixPath(name)
 assert not path.is_absolute() and '..' not in path.parts and '\\' not in name,name
 return path
checks={}
for line in (p/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split('  ',1);safe(name)
 assert name not in checks and re.fullmatch('[0-9a-f]{64}',digest),name
 assert (p/name).is_file() and not (p/name).is_symlink(),name
 assert sha((p/name).read_bytes())==digest,name
 checks[name]=digest
assert set(checks)=={f.relative_to(p).as_posix() for f in p.rglob('*') if f.is_file() and f.name!='SHA256SUMS'}
expected={}
for row in git('ls-tree','-rz',commit).split(b'\0'):
 if row:
  meta,name=row.split(b'\t',1);expected[name.decode()]=tuple(meta.decode().split())
observed={};native={};root='apps/macos/CompanionDesktop/'
with tarfile.open(p/'source.tar.gz','r:gz') as arc:
 assert arc.pax_headers['comment']==commit
 for f in arc:
  safe(f.name)
  if f.isdir():continue
  assert f.isfile() or f.issym(),f.name
  data=arc.extractfile(f).read() if f.isfile() else f.linkname.encode()
  mode='120000' if f.issym() else ('100755' if f.mode&0o111 else '100644')
  assert f.name not in observed
  observed[f.name]=(mode,'blob',hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest())
  if f.name.startswith(root):native[f.name]=data
assert observed==expected
assert git('rev-parse',commit+':'+root[:-1])==git('rev-parse',approved+':'+root[:-1])
logs=(p/'tests.log').read_text()
started=re.findall(r"Test Case '-\[([^]]+)\]' started",logs)
passed=re.findall(r"Test Case '-\[([^]]+)\]' passed",logs)
failed=re.findall(r"Test Case '-\[([^]]+)\]' failed",logs)
declared=[name for path,data in native.items() if '/Tests/' in path and path.endswith('.swift') for name in re.findall(r'func (test\w+)\(',data.decode())]
assert started==passed and not failed and len(passed)==len(set(passed))
assert collections.Counter(x.split()[-1] for x in passed)==collections.Counter(declared)
assert len(passed)==156
assert 'PASS: 4 ask/start requests, 72 checks' in (p/'mac-ask-fixture.log').read_text()
lines=(p/'macos-ask-fixture/ask-start.jsonl').read_bytes().splitlines();assert len(lines)==4
ask=[json.loads(line) for line in lines]
assert all(x['version']=='lc-subscription-ask/1' and x['method']=='ask/start' for x in ask)
live_log=(p/'mac-live-fixture.log').read_text()
match=re.search(r'PASS: (\d+) lines, (\d+) companion/turn requests .*; (\d+) checks',live_log)
assert match, live_log
live_lines=[json.loads(line) for line in (p/'macos-live-fixture/live-session.jsonl').read_bytes().splitlines()]
assert all(x['version']=='lc-subscription-live/1' for x in live_lines)
assert len(live_lines)==int(match[1])
live_turns=[x for x in live_lines if x['method']=='companion/turn']
assert len(live_turns)==int(match[2]) and int(match[3])==211

with zipfile.ZipFile(p/'MacDesktop.zip') as z:
 for name in z.namelist():safe(name)
 assert z.testzip() is None
 prefix='CompanionDesktop.app/Contents/'
 assert z.read(prefix+'Info.plist')==native[root+'Packaging/Info.plist']
 app=z.read(prefix+'MacOS/CompanionDesktop');assert app[:4]==bytes.fromhex('cffaedfe')
 assert z.getinfo(prefix+'MacOS/CompanionDesktop').external_attr>>16&0o111
 assert plistlib.loads(z.read(prefix+'Info.plist'))['CFBundleExecutable']=='CompanionDesktop'
result=json.loads((p/'result.json').read_text())
assert result['exit_code']==0 and result['state']=='checks-completed' and result['last_phase']=='complete'
assert all(result[k] is False for k in ['interactive_runtime_verified','provider_verified','project_signing_performed'])
env=(p/'environment.txt').read_text();assert 'commit='+commit in env and '/actions/runs/'+str(run_id) in env
report={'source':commit,'approved_native':approved,'run_id':run_id,'scope':'Hosted macOS compile/package/XCTest + Swift ASK/live fixtures to real local validators; no interactive Mac or provider', 'artifact_hashes':len(checks),'source_blobs':len(observed),'native_tree_equal':True,'xctests_pass':len(passed),'xctests_fail':len(failed),'ask_requests':len(ask),'ask_checks':72,'live_lines':len(live_lines),'live_turns':len(live_turns),'live_checks':int(match[3]),'app_sha256':sha(app),'hosted_result':result,'raw_checksums_sha256':sha((p/'SHA256SUMS').read_bytes()),'verdict':'pass'}
out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
