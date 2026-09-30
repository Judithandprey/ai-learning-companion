from copy import deepcopy
import importlib.util
from pathlib import Path
import pytest
from services.api.errors import DomainError
from services.api.tests.test_control import documents
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.api.tests.test_windows_frame_ingress import setup, registered, uploaded, raw_setup, windows_setup, ingest, additional

spec=importlib.util.spec_from_file_location('unchanged_defect_probes',Path(__file__).with_name('original_defect_probes.py'))
original=importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)

@pytest.mark.parametrize('name,separate',[
    ('test_cross_frame_contradictory_artifact_identity',False),
    ('test_cross_frame_contradictory_artifact_identity',True),
    ('test_cross_frame_byte_alias_contradiction',False),
    ('test_cross_frame_byte_alias_contradiction',True),
])
def test_original_ingress_defect_refused(windows_setup,name,separate):
    with pytest.raises(DomainError) as error:
        getattr(original,name)(separate,windows_setup)
    assert (error.value.status,error.value.code)==(409,'record_conflict')
    assert ('raw_capture_frame','windows-frame-2') not in documents(windows_setup)

def test_original_marker_defect_refused(windows_setup):
    with pytest.raises(DomainError) as error:
        original.test_empty_capture_marker_legacy_record_read(windows_setup)
    assert (error.value.status,error.value.code)==(404,'not_found')

def test_identical_images_keep_distinct_composition_contexts(windows_setup):
    c=windows_setup
    first_ack=ingest(c)
    item,frame=additional(c,parents=['process-1'])
    frame['composed']['ink_session']='review-different-ink-session'
    frame['composed']['ink_revision']+=1
    frame['composed']['transformation']='Distinct retained composition context with identical declared PNGs.'
    second_ack=ingest(c,{**c.batch,'records':[item]},[frame],'new-context')
    before=documents(c)
    assert reader(c).read_windows([item['record_id']])['frames']==[frame]
    assert reader(c).read_windows(['process-1'])['frames']==[c.windows_frame]
    assert reader(c).read_windows(['process-1',item['record_id']])['frames']==[c.windows_frame,frame]
    for f in (c.windows_frame,frame):
        for role,data in (('raw',c.data),('composed',c.composed_data)):
            result=resolver(c).resolve_windows(f,image_role=role,max_bytes=len(data))
            assert result=={'status':'available','frame':f,'image_role':role,'media_type':'image/png','data':data}
    assert ingest(c)==first_ack
    assert ingest(c,{**c.batch,'records':[item]},[frame],'new-context')==second_ack
    assert documents(c)==before
