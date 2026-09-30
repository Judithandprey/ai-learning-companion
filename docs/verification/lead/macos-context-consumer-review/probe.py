"""Bounded synthetic seam checks; no native/API/provider or archive implementation."""
import importlib.util,json,subprocess,sys
from pathlib import Path
from copy import deepcopy
ROOT=Path('/tmp/learning-macos-4633-export')
sys.path[:0]=[str(ROOT),str(ROOT/'tests/evals')]
import test_macos_process_context as mac
import test_windows_process_context as win
from services.learning.archive import canonical
from services.learning import process_context as current
from packages.contracts.macos_frame import REOPENED_LIMIT
results=[]
def record(name,**values):results.append({'name':name,'passed':True,**values})
# Compare valid Windows behavior against the exact pre-change module, not a rewritten model.
prior=Path('/tmp/learning-macos-4633-parent-process-context.py')
prior.write_bytes(subprocess.check_output(['git','show','4633bd74cf56e487f95acd0a109b1924432818b6^:services/learning/process_context.py'],cwd='/home/agentsdock/Projects/learning-companion/repo'))
spec=importlib.util.spec_from_file_location('services.learning._review_parent_process_context',prior)
parent=importlib.util.module_from_spec(spec);spec.loader.exec_module(parent)
for name,options,limits in [('normal',{},{}),('alias',{'alias':'same_id'},{}),('raw_only',{'composed':False},{}),('total_budget',{}, {'max_total_bytes':100})]:
    values=win.windows_supplied(**options)
    args=dict(user_id=values[1][0]['user_id'],windows_resolver=win.resolver_for(values),**limits)
    old=parent.compose_process_context(*values[:3],win.forbidden,**args)
    new=current.compose_process_context(*values[:3],win.forbidden,**args)
    assert old==new
    record('windows_parent_equivalence_'+name,attached_bytes=new['attached_bytes'],image_status=new['items'][0]['image']['status'],composed_status=new['items'][0]['composed_image']['status'])
# Output canonical equality catches Python == accepting 4.0 == 4.
values=mac.macos_supplied((5,));frame=values[2][0];ink=frame['composition']['ink']
frame['callback_sequence']=json.loads('6.0');ink.update(revision=json.loads('4e0'),revision_host_seconds=None)
ink['document']['created_in_session']='earlier-boot';ink['limits'].append(REOPENED_LIMIT.format(4))
before=canonical(values[:3]);packet=mac.stored(values)
assert canonical(packet['items'][0]['frame'])==canonical(frame)
assert type(packet['items'][0]['frame']['callback_sequence']) is float
assert type(packet['items'][0]['frame']['composition']['ink']['revision']) is float
assert canonical(values[:3])==before
record('mac_integral_number_representation_preserved',callback=packet['items'][0]['frame']['callback_sequence'],revision=packet['items'][0]['frame']['composition']['ink']['revision'])
# Max admitted Unicode refusal detail must remain whole and count by UTF-8 bytes.
values=mac.macos_supplied((6,));values[2][0]['composition']['detail']='🧪'*16384
calls=[];large=mac.supplied(values,resolve=mac.resolver_for(values,calls),max_metadata_bytes=128*1024)
assert large['items'][0]['frame']==values[2][0]
assert large['items'][0]['composed_image']=={'status':'not_composed','reason':'refused','image_role':'composed'}
assert [c[1] for c in calls]==['raw']
assert win.metadata_size(large)<=128*1024
small=mac.supplied(values,resolve=mac.forbidden,max_metadata_bytes=60*1024)
assert small['counts']['omitted']==1 and not small['items']
record('mac_full_unicode_refusal_budget',detail_chars=16384,detail_utf8_bytes=65536,large_metadata_bytes=win.metadata_size(large),small_omitted=small['counts']['omitted'])
# A numerically equal but byte-distinct final metadata representation is still a changed snapshot.
values=mac.macos_supplied();reads=[];returned=[]
def reader(ids,**kwargs):
    reads.append(ids.copy());result=mac.snapshot(values)
    if len(reads)==2:result['frames'][0]['callback_sequence']=float(result['frames'][0]['callback_sequence'])
    return result
try:returned.append(mac.stored(values,read=reader))
except ValueError as e:
    assert 'metadata changed' in str(e);error=str(e)
else:raise AssertionError('changed final snapshot was returned')
assert len(reads)==2 and not returned
record('mac_final_numeric_snapshot_change_withheld',reads=len(reads),error=error)
Path('/tmp/learning-macos-4633-probe-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
