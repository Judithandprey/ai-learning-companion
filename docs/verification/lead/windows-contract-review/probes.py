"""Bounded review of metadata only; no files decoded, services or native capture."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from jsonschema import ValidationError
from packages.contracts.windows_frame import validate, validate_binding
from packages.contracts.capture_frame import validate as validate_raw
from packages.contracts.desktop_frame import validate as validate_mac
from packages.contracts.desktop_capture_ingress import validate as validate_mac_ingress

SOURCE = '04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68'
native = subprocess.check_output([
    'git', '-C', str(ROOT), 'show',
    SOURCE + ':docs/verification/web/evidence/windows-retention-sample/manifest.jsonl'])
examples = ROOT / 'packages/contracts/windows_frame/examples'
assert (examples / 'producer-manifest.jsonl').read_bytes() == native
lines = [json.loads(line) for line in native.splitlines()]
retained = [line for line in lines if line['kind'] == 'retained']
frames = json.loads((examples / 'windows-retained.json').read_text())
assert len(frames) == len(retained) == 5
for frame, old in zip(frames, retained, strict=True):
    validate(frame)
    assert frame['profile']['source_at_start'] == lines[0]['source']
    assert frame['profile']['capture_session'] == lines[0]['capture_session']
    for field in ('sample_seq','frame_seq','reason','deferred_samples_not_retained',
                  'sampled_at','taken_at','monotonic_ms','state','presented_frames',
                  'stream_presented_frames','presentation_ms','frame_age_ms'):
        assert frame['profile']['sample'][field] == old[field]
    assert frame['profile']['sample']['gap_ms'] is None and 'gap_ms' not in old
    for image, prior in ((frame['raw'], old['raw']), (frame['composed']['image'], old['composed'])):
        assert (image['width'],image['height'],image['native_file'],image['pixels_sha256']) == (
            prior['width'],prior['height'],prior['file'],prior['pixels_sha256'])
        assert (image['artifact']['sha256'],image['artifact']['byte_length']) == (prior['sha256'],prior['bytes'])
    for field in ('ink_session','ink_revision','visible_strokes','ink_marks','transformation'):
        assert frame['composed'][field] == old['composed'][field]
print('PASS exact Git manifest and all five retained native fact mappings:',hashlib.sha256(native).hexdigest())

def bound(frame):
    frame = deepcopy(frame)
    batch = json.loads((ROOT / 'packages/contracts/process_v2/examples/capture.json').read_text())['ProcessBatch']
    batch.update({key: frame[key] for key in ('device_id','session_id','stream_id')})
    images = [frame['raw']] + ([frame['composed']['image']] if frame['composed'] else [])
    refs = {image['artifact']['artifact_id']:deepcopy(image['artifact']) for image in images}
    selected = batch['records'][0]
    selected.update(source=deepcopy(frame['source']),frame_id=frame['frame_id'],
                    observed_at=None,media_position=None,clock=None,artifacts=list(refs.values()))
    source = {'contract_version':'0.2.3',**frame['source'], 'type':'shared_display',
              **{key:frame[key] for key in ('device_id','session_id','stream_id')},
              'project_id':None,'created_at':'2026-09-30T12:00:00Z','source_timezone':'UTC'}
    originals = [{'contract_version':'0.2.2','source':deepcopy(frame['source']),
                  'kind':'screen_image','artifact':ref} for ref in deepcopy(list(refs.values()))]
    return batch,selected['record_id'],frame,source,originals

def accepted(values):
    before=deepcopy(values)
    validate_binding(*values)
    assert values == before

def rejected(values):
    before=deepcopy(values)
    try: validate_binding(*values)
    except ValidationError: pass
    else: raise AssertionError('unexpected acceptance')
    assert values == before

# The explicitly selected record need not be first. An unrelated record and
# editable original must survive; this generic check is not pixel authority.
values = bound(frames[3])
batch,record_id,frame,source,bindings = values
selected=batch['records'][0]
selected['artifacts'].append({'artifact_id':'review-editable-ink','sha256':'b'*64,
                              'byte_length':17,'media_type':'application/json'})
other=deepcopy(selected)
other.update(record_id='review-unrelated',sequence=2,frame_id=None)
other['source']['source_id']='review-other-source'
batch['records'].insert(0,other)
bindings.reverse()
accepted(values)
print('PASS explicit non-first selected record, reordered bindings and untouched separate ink/history')

for mutate in (
    lambda v: v[4][0]['source'].update(source_version=99),
    lambda v: v[3].update(user_id='review-other-owner'),
    lambda v: v[2].update(stream_id='review-other-incarnation'),
    lambda v: v[0]['records'][1]['artifacts'].pop(0),
):
    changed=deepcopy(values); mutate(changed); rejected(changed)
print('PASS composed/original source, owner, incarnation and selected-record image substitutions refused')

# Keep actual independent rounded values, a wall jump, old absent-gap null,
# a held image from an earlier sample and a different reopened ink document.
values=bound(frames[3])
frame=values[2]
frame['profile']['started_at']='2030-01-01T00:00:00Z'
sample=frame['profile']['sample']
sample.update(sample_seq=100,frame_seq=3,taken_at='2026-09-30T12:00:00Z',
              sampled_at='2025-01-01T00:00:00Z',monotonic_ms=1000,presentation_ms=981,
              frame_age_ms=20,state='gap',gap_ms=None,deferred_samples_not_retained=[9,10,99])
frame['composed']['ink_session']='review-reopened-ink'
accepted(values)
sample.update(presented_frames=0,presentation_ms=None,frame_age_ms=None)
accepted(values)
sample.update(gap_ms=7000)
accepted(values)
print('PASS held/reopened identity distinctions, backward wall time, unequal rounded age and explicit known/unknown gap')

for mutate in (
    lambda v: v[2].update(captured_at='2026-09-30T12:00:00Z'),
    lambda v: v[0]['records'][0].update(observed_at='2026-09-30T12:00:00Z'),
    lambda v: v[2]['profile']['sample'].update(presentation_ms=0),
):
    changed=deepcopy(values); mutate(changed); rejected(changed)
print('PASS no promotion to capture UTC or invented pre-callback presentation')

# Raw and composed may legitimately share bytes under one or two archive IDs;
# they may not contradict the same file or collapse two different originals.
same=deepcopy(frames[0]); accepted(bound(same))
same['composed']['image']['artifact']['artifact_id']='review-second-alias'
accepted(bound(same))
different=deepcopy(same)
different['composed']['image']['pixels_sha256']='e'*64
rejected(bound(different))
different=deepcopy(frames[3])
different['composed']['image']['artifact']['artifact_id']=different['raw']['artifact']['artifact_id']
rejected(bound(different))
print('PASS identical-file aliases allowed; same-file and same-artifact contradictions refused')

for old in (validate_raw,validate_mac):
    try: old(frames[0])
    except ValidationError: pass
    else: raise AssertionError('older descriptor accepted 0.2.9')
try: validate_mac_ingress('DesktopFrameBatchRequest',{'contract_version':'0.2.8','batch':bound(frames[0])[0],'frames':[frames[0]]})
except ValidationError: pass
else: raise AssertionError('older ingress accepted 0.2.9')
print('PASS raw/Mac descriptors and Mac HTTP metadata reader remain closed to Windows')
print('Scope: pure declarations only; no decoded PNG/RGBA, capture authority, provider or producer acceptance.')
