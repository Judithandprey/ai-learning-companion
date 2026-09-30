"""Checker review only. Released audited descriptors, synthetic bindings/mutations; NOT Swift mapper execution."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
from contextlib import redirect_stdout
import io

ROOT=Path('/tmp/lc-macos-native-df581')
sys.path.insert(0,str(ROOT))
from jsonschema import ValidationError
from packages.contracts.macos_frame import validate,validate_binding
path=ROOT/'apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py'
spec=importlib.util.spec_from_file_location('review_checker',path)
checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)
example=ROOT/'packages/contracts/macos_frame/examples'
frames=json.loads((example/'macos-retained.json').read_text())
provenance=json.loads((example/'provenance.json').read_text())
native=ROOT/provenance['fixture_path']
status,kept,outcomes,filters=checker.native_session(native)
source={'contract_version':'0.2.3',**frames[0]['source'],'type':'shared_display',
        **{key:frames[0][key] for key in ('device_id','session_id','stream_id')},
        'project_id':None,'created_at':'2026-09-21T14:13:00Z','source_timezone':'America/Los_Angeles'}
checker.validate_display(source)
def bindings(frame):
    pictures=[frame['raw']]+([frame['composition']['image']] if frame['composition']['kind']=='composed' else [])
    unique={p['artifact']['artifact_id']:p for p in pictures}
    return [{'contract_version':'0.2.2','source':copy.deepcopy(frame['source']),'kind':'screen_image','artifact':copy.deepcopy(p['artifact'])} for p in unique.values()]
mutations=[]
described=[]
for frame in frames:
    b=bindings(frame);batch,record_id=checker.batch_for(frame)
    validate_binding(batch,record_id,frame,source,b)
    assert checker.native_problems(frame,status,kept,outcomes,native)==[],frame['callback_sequence']
    for name,fragment,changed,changed_bindings in checker.mutations(frame,b):
        assert checker.refused(lambda:validate_binding(batch,record_id,changed,source,changed_bindings),fragment),(frame['callback_sequence'],name,fragment)
        mutations.append({'callback':frame['callback_sequence'],'name':name,'required_fragment':fragment})
    described.append({'callback_sequence':frame['callback_sequence'],'frame_id':frame['frame_id'],'frame':copy.deepcopy(frame),'bindings':b})
assert len(frames)==7
results=[{'case':'unchanged audited seven descriptors, native metadata and original PNG signature/IHDR/hash/length','pass':True,'frames':7},
         {'case':'checker negative controls actually fail for their stated fragments on these seven examples','pass':True,'controls':len(mutations)}]
# Valid contract metadata changes must still fail the independent native comparison.
for label,edit in [
    ('display name',lambda f:f['profile']['display_at_start'].update(name='synthetically changed name')),
    ('PTS',lambda f:f['profile']['sample'].update(presentation_time_seconds=-123.125)),
    ('nullable dirty rects',lambda f:f['profile']['sample'].update(dirty_rects=[] if f['profile']['sample']['dirty_rects'] is None else None)),
    ('exact UInt64 text',lambda f:f['profile']['host_clock'].update(display_time_ticks_decimal='18446744073709551615')),
]:
    changed=copy.deepcopy(frames[0]);edit(changed);validate(changed)
    problems=checker.native_problems(changed,status,kept,outcomes,native)
    assert problems,label
    results.append({'case':label+' synthetic mismatch','pass':True,'detected':problems})
# Complete original bindings are independently supplied inputs, not generated silently inside checker.
frame=frames[2];batch,record_id=checker.batch_for(frame)
for label,edit in [
    ('foreign source',lambda b:b[0]['source'].update(source_id='synthetic-foreign')),
    ('different original length',lambda b:b[0]['artifact'].update(byte_length=b[0]['artifact']['byte_length']+1)),
    ('missing composed original',lambda b:b.pop()),
]:
    b=bindings(frame);edit(b)
    try: validate_binding(batch,record_id,frame,source,b)
    except ValidationError as error: results.append({'case':label,'pass':True,'refusal':error.message})
    else: raise AssertionError(label)
# Alter only a scratch copy of actual original bytes, retaining reference/native metadata unchanged.
scratch=Path(tempfile.mkdtemp(prefix='df581-checker-corrupt-'))
copydir=scratch/'session';shutil.copytree(native,copydir)
file=copydir/frames[2]['raw']['native_file'];data=bytearray(file.read_bytes());data[-1]^=1;file.write_bytes(data)
problems=checker.native_problems(frames[2],status,kept,outcomes,copydir)
assert any('raw: the file\'s bytes differ' in p for p in problems),problems
results.append({'case':'changed PNG byte on copied original','pass':True,'detected':problems})
# The original seven-frame fixture intentionally lacks no-document/reopen/unknown cases. Even a
# synthetically wrapped manifest with many refusal receipts must fail the checker coverage gate.
wrapped=Path(tempfile.mkdtemp(prefix='df581-checker-wrapper-'));shutil.copytree(native,wrapped/'native')
facts=['ink documents synthetic wrapper; not an immutable editable original']
if filters: facts.append('capture_filter: synthetic wrapper; NOT mapper output')
if 'ending' not in status: facts.append('no ending is recorded: synthetic wrapper')
mapping={'described':described,'refused':[],'unrepresented':facts}
manifest={'synthetic':'Independent wrapper around released examples; NOT new Swift mapper output',
          'native_session':'native','display_source':source,
          'cases':[{'type':'mapping','name':'every_kept_frame','mapping':mapping},
                   {'type':'mapping','name':'repeat_audited_examples','mapping':copy.deepcopy(mapping)}]
                  +[{'type':'refusal','name':f'synthetic-counter-only-{i}','reason':'synthetic expected refusal',
                     'expected':'expected refusal'}for i in range(20)]}
(wrapped/'manifest.json').write_text(json.dumps(manifest))
out=io.StringIO()
with redirect_stdout(out):code=checker.main(wrapped)
lines=out.getvalue().splitlines();failures=[line for line in lines if line.startswith('FAIL ')]
assert code==1 and len(failures)==1 and 'not vacuous' in failures[0],failures
results.append({'case':'insufficient seven-frame wrapped fixture cannot pass non-vacuity','pass':True,'checker_exit':code,'failures':failures})
Path('/tmp/macos-native-df581-checker-wrapped.log').write_text(out.getvalue())
receipt={'origin':'Released audited Swift-generated synthetic buffers; new wrapper/mutations synthetic Python, never new Swift execution',
         'candidate':'df581e8a1d49725c966fdacd0d8e45bcbb9aeb4d','results':results,
         'mutations':mutations,'synthetic_wrapper':str(wrapped),'corrupt_copy':str(copydir)}
Path('/tmp/macos-native-df581-checker-results.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items()if k!='mutations'},indent=2))
