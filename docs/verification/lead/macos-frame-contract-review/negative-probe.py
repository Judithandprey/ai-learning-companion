"""Pure JSON/schema probes against exact 794fbd9, no native or runtime calls."""
import json
import sys
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, '/tmp/macos-frame-contract-794fbd9')
from jsonschema import Draft202012Validator, ValidationError
from packages.contracts.macos_frame import SCHEMA, REOPENED_LIMIT, UNKNOWN_TIME_LIMIT, validate
base=json.loads(Path('/tmp/macos-frame-contract-794fbd9/packages/contracts/macos_frame/examples/macos-retained.json').read_text())[2]
cases=[]
def add(name, edit):
 f=deepcopy(base);edit(f);cases.append((name,f))
add('unchanged_control',lambda f:None)
add('callback_integral_float_3_0',lambda f:f.update(callback_sequence=json.loads('3.0')))
add('callback_integral_exponent_3e0',lambda f:f.update(callback_sequence=json.loads('3e0')))
add('callback_fraction_3_5',lambda f:f.update(callback_sequence=3.5))
add('callback_boolean',lambda f:f.update(callback_sequence=True))
def reopened(f, revision):
 ink=f['composition']['ink'];ink['revision']=revision;ink['revision_host_seconds']=None;ink['limits'].append(REOPENED_LIMIT.format(2))
add('reopened_integer_control',lambda f:reopened(f,2))
add('reopened_integral_float_2_0',lambda f:reopened(f,json.loads('2.0')))
add('source_clock_mismatch',lambda f:f['profile']['host_clock'].update(source_seconds=None))
def unknown_source(f):
 c=f['profile']['host_clock'];c.update(display_time_ticks_decimal=None,display_time_seconds=None,source_seconds=None)
 ink=f['composition']['ink'];ink.update(pixels_host_seconds=c['callback_seconds'],pixels_time='callback_admission');ink['limits'].append(UNKNOWN_TIME_LIMIT)
add('honest_unknown_source_control',unknown_source)
results=[]
for name,frame in cases:
 before=deepcopy(frame)
 schema_valid=Draft202012Validator(SCHEMA).is_valid(frame)
 try:
  validate(frame);outcome='accepted';error=None
 except ValidationError as e:
  outcome='ValidationError';error=e.message
 except Exception as e:
  outcome=type(e).__name__;error=str(e)
 assert frame==before
 results.append({'case':name,'generated_schema_accepts':schema_valid,'runtime':outcome,'error':error,'input_unchanged':True})
assert results[0]['runtime']=='accepted'
assert results[1]['generated_schema_accepts'] and results[1]['runtime']=='ValueError'
assert results[2]['generated_schema_accepts'] and results[2]['runtime']=='ValueError'
assert results[5]['runtime']=='accepted'
assert results[6]['generated_schema_accepts'] and results[6]['runtime']=='ValidationError'
assert results[-1]['runtime']=='accepted'
Path('/tmp/macos-frame-contract-negative-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
