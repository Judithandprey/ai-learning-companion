"""Independent pure-metadata probes; synthetic inputs, no native/device proof."""
from copy import deepcopy
from datetime import datetime, timedelta
import json, random, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from jsonschema import Draft202012Validator, ValidationError
from packages.contracts.desktop_frame import validate, validate_binding, SCHEMA, ESTIMATE_BASIS
from packages.contracts.tests.test_display_source import display, observation
from packages.contracts.tests.test_capture_frame import proposal
from packages.contracts.tests.test_desktop_frame import desktop
s=display.__wrapped__(); o=observation.__wrapped__(s); base=desktop.__wrapped__(proposal.__wrapped__(s,o))
count=0

def check(fn, good=True):
 global count
 try: fn()
 except ValidationError:
  assert not good, 'Unexpected rejection'
 else: assert good, 'Unexpected acceptance'
 count+=1

def changed(path,value):
 x=deepcopy(base); v=x[2]
 for k in path[:-1]: v=v[k]
 v[path[-1]]=value
 return x

# Independent hostile leaves: Unicode, JSON values and shape confusion.
for path,value in [
 (('profile','display_at_start','name'),'\ud800'),
 (('profile','native_session_id'),'native\n'),
 (('profile','native_session_id'),False),
 (('profile','pixel_format'),'BGRA\n'),
 (('profile','sample','dirty_rects'),[{'x':False,'y':0,'width':1,'height':1}]),
 (('profile','host_clock','callback_seconds'),None),
 (('profile','host_clock','callback_seconds'),True),
 (('profile','host_clock','display_time_seconds'),-1),
 (('profile','sample','presentation_time_seconds'),{'number':4}),
 (('artifact','sha256'),'a'*64+'\n'),
 (('artifact','byte_length'),False),
 (('profile','sample','geometry_unit'),'unknown'),
 (('captured_at',),'2026-09-30T12:00:00Z'),
 (('profile','display_at_start','rotation_degrees'),float('nan')),
]:
 x=changed(path,value); before=deepcopy(x)
 check(lambda x=x:validate_binding(*x),False)
 # NaN itself is non-reflexive; inspect all non-NaN cases exactly.
 if not (isinstance(value,float) and value!=value): assert x==before
# Deep/cyclic inputs must fail boundedly, not recurse into jsonschema rendering.
x=deepcopy(base[2]); x['cycle']=x; check(lambda:validate(x),False)
x=deepcopy(base[2]); z=[]; x['deep']=z
for _ in range(100): child=[]; z.append(child); z=child
check(lambda:validate(x),False)
# Local estimate rounding, actual Double facts preserved, one-microsecond changes refused.
for start, callback in [(0.0,0.0000004),(0.0,0.0000005),(0.0,0.0000015),(1e8,1e8+0.000001),(1000.125,1000.125),(4.25,123456.987654321)]:
 x=deepcopy(base); f=x[2]; c=f['profile']['host_clock']; c.update(session_started_seconds=start,callback_seconds=callback,session_started_wall_utc='2026-09-30T23:59:59.999Z')
 dt=datetime.fromisoformat('2026-09-30T23:59:59.999+00:00')+timedelta(seconds=callback-start)
 f['timing'].update(observed_at_estimate=dt.isoformat(timespec='microseconds').replace('+00:00','Z'),estimate_basis=ESTIMATE_BASIS)
 before=deepcopy(x);check(lambda:validate_binding(*x));assert x==before
 f['timing']['observed_at_estimate']=(dt+timedelta(microseconds=1)).isoformat(timespec='microseconds').replace('+00:00','Z')
 check(lambda:validate_binding(*x),False)
# Overflow: labelled estimate rejected; original finite host facts without estimate retained.
x=deepcopy(base);x[2]['profile']['host_clock'].update(session_started_seconds=0.0,callback_seconds=1e30)
check(lambda:validate_binding(*x));x[2]['timing'].update(observed_at_estimate='9999-12-31T23:59:59Z',estimate_basis=ESTIMATE_BASIS);check(lambda:validate_binding(*x),False)
# Cross-binding after all other identities were changed consistently: a single stale record cannot pass.
for location in [0,3,4]:
 x=deepcopy(base)
 if location==0:x[0]['records'][0]['source']['source_version']=2
 elif location==3:x[3]['source_version']=2
 else:x[4]['source']['source_version']=2
 check(lambda x=x:validate_binding(*x),False)
# Native facts with weird but legal origins, rotation, FourCC and empty attachments are preserved.
x=deepcopy(base);f=x[2];f['profile']['display_at_start'].update(rotation_degrees=-90,name='',frame_points={'x':-32768.25,'y':-8192.5,'width':0,'height':0});f['profile']['pixel_format']='\x00\xff\x80A';f['profile']['sample'].update(dirty_rects=[],presentation_time_seconds=-0.0)
before=deepcopy(x);check(lambda:validate_binding(*x));assert x==before
# Exhaustive edges around every decimal prefix, plus deterministic random UInt64 bounds.
pattern=SCHEMA['$defs']['UInt64Decimal']['pattern'];r=re.compile(pattern);limit=2**64-1
nums={0,1,limit-1,limit,limit+1,2**53-1,2**53,2**53+1}
for n in range(1,21):
 for d in [-2,-1,0,1,2]:nums.add(10**n+d)
rng=random.Random(2718)
for _ in range(1200):nums.add(rng.randrange(0,10**21))
for n in nums:assert bool(r.search(str(n)))==(0<=n<=limit)
for bad in ['0\n','０','٠','01','+0',' 0','0 ','1e2','18446744073709551615\u2028']:assert not r.search(bad)
print(json.dumps({'independent_boundary_checks':count,'uint64_python_cases':len(nums)+9,'status':'PASS'}))
Path('/tmp/desktop-frame-uint64-cases.json').write_text(json.dumps({'pattern':pattern,'cases':[[str(n),0<=n<=limit] for n in nums]+[[t,False] for t in ['0\n','０','٠','01','+0',' 0','0 ','1e2','18446744073709551615\u2028']]}))
