"""Offline audit of committed sanitized evidence only; never opens recorded private paths."""
import collections, hashlib, json, re, struct, zlib, sys
from pathlib import Path
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'qa/p0-13-windows-behavior-061efe2'
read = lambda n: json.loads((ROOT / (n + '.json')).read_text())
summary, timeline, runner, final = map(read, ['summary', 'samples-timeline', 'runner-results', 'ink-final'])
checks = {c['id']: c for c in summary['checks']}
samples, marks = timeline['samples'], {m['label']:m for m in timeline['marks']}
values, steps = runner['values'], runner['steps']
def parsed(k):
    v=values[k]; return json.loads(v) if isinstance(v,str) else v
aslist=lambda x: [] if x is None else x if isinstance(x,list) else [x]
out={}
def save(k,v):out[k]=v
assert dict(collections.Counter(c['status'] for c in summary['checks'])) == summary['counts'] == {'pass':32,'fail':1,'limit':2}
save('declared_counts_recounted',summary['counts'])
assert len(steps)==len(read('steps'))==126 and all(s['ok'] for s in steps)
assert runner.get('aborted') is None and runner['errors']==[]
foreign=aslist(runner['foreign']['start'])+aslist(runner['foreign']['end'])+sum((aslist(s.get('foreign')) for s in steps if s['kind']=='desktopShot'),[])
assert foreign==[]
save('run_records',{'successful_steps':len(steps),'guard_observations':2+sum(s['kind']=='desktopShot' for s in steps),'foreign_electron_seen':foreign,'exit':runner['processes']['app']})
d=parsed('displays');d=d if isinstance(d,dict) else d[0]
assert len(samples)==60
assert all(s['source']['kind']=='display' and s['source']['source_id']==d['source_id'] and s['source']['bounds']==d['bounds'] and s['source']['scale_factor']==d['scale_factor'] for s in samples)
assert {(s['raw']['width'],s['raw']['height']) for s in samples if s['raw']}=={(2560,1600)}
assert collections.Counter(s['state'] for s in samples)=={'fresh':57,'ended':3}
segments=[]
for s in samples:
    if not segments or s['seq']<=segments[-1][-1]['seq']:segments.append([])
    segments[-1].append(s)
assert len(segments)==3 and all(s[-1]['state']=='ended' for s in segments)
assert all(s['raw']['presented_frames']==s['raw']['stream_presented_frames'] for s in samples if s['raw'])
assert all((s['raw'] is None)==(s['composed'] is None) for s in samples)
assert all((s['composed']['visible_strokes']==0)==(s['raw']['pixels_sha256']==s['composed']['pixels_sha256']) for s in samples if s['raw'])
save('capture_records',{'samples':60,'states':dict(collections.Counter(s['state'] for s in samples)),'segment_lengths':[len(s) for s in segments],'display':d,'equal_held_stream_counts':True,'raw_composed_relationship':True})
def window(a,b):return samples[marks[a]['samples']:marks[b]['samples']]
inkphase=[s for s in window('idle','continued') if s['raw'] and s['composed']]
assert len({s['raw']['pixels_sha256'] for s in inkphase})==1
rev=sorted({s['composed']['ink_revision'] for s in inkphase}); assert rev==checks['capture.overlay_not_in_raw_frames']['observed']['ink_revisions_seen']
save('raw_unchanged_while_ink_changed',{'ink_revisions':rev,'raw_sha256':inkphase[0]['raw']['pixels_sha256']})
getmarks=lambda a,b: next(s['composed']['ink_marks'] for s in reversed(window(a,b)) if s['composed'])
alignment=[getmarks('draft','continued'),getmarks('continued','ink-scrolled'),getmarks('ink-scrolled','ink-back')]
assert alignment[0]==alignment[2] and alignment[1]['verified']==1 and alignment[1]['changed']==3 and alignment[1]['unknown']==1
save('observed_alignment_counts',alignment)
still=window('edge-top','idle')
assert len(still)==5 and all(s['state']=='fresh' and s['raw']['change']==0 for s in still)
save('still_samples_only',{'count':len(still),'change':0,'independent_screenshot_comparison':'not rerun; screenshots intentionally outside committed evidence'})
ov=lambda k: parsed('ov_'+k)
assert ov('write')['mouse']=='false' and ov('mouse_on')['mouse']=='true'
assert ov('mouse_off')['mode']=='WRITE' and 'Mouse writing is off' in ov('mouse_off')['hint']
assert ov('ask')['mode']=='ASK' and ov('ask_finished')['mode']=='WRITE' and ov('ask_finished')['card']
assert ov('ask2')['mode']=='ASK' and ov('ask_cancelled')['mode']=='WRITE' and not ov('ask_cancelled')['card']
save('input_mode_dom_observations','Explicit mouse toggle; mouse-off hint; ASK finish/cancel restore WRITE agree. No hit-testing/hardware assertion.')
h=final['ink']['history'];strokes=final['ink']['strokes'];visible=[];versions={0:[]}
assert [x['seq'] for x in h]==list(range(1,12))
assert [x['op'] for x in h]==['add','add','add','erase','undo','redo','add','add','undo','add','add']
for op in h:
    assert all(s in strokes for s in op['added']+op['removed'])
    visible=[s for s in visible if s not in op['removed']]+op['added']
    assert len(visible)==len(set(visible));versions[op['seq']]=visible[:]
assert set(visible)==set(final['ink']['visible'])
assert [strokes[s]['input'] for s in versions[3]]==['mouse','mouse','pen']
assert set(versions[5])==set(versions[3]) and set(versions[6])==set(versions[4])
pieces=h[3]['added'];origin=h[3]['removed'][0]
assert all(strokes[s]['derived_from']==origin for s in pieces)
spans=sorted((min(p[0] for p in strokes[s]['points']),max(p[0] for p in strokes[s]['points'])) for s in pieces)
assert len(spans)==2 and spans[0][1]<300<spans[1][0] and origin in strokes
save('history_replay',{'operations':[x['op'] for x in h],'revision':final['ink']['revision'],'retained_strokes':len(strokes),'visible':len(visible),'partial_erase_piece_spans':spans,'visible_by_revision':{k:len(v) for k,v in versions.items()}})
opened=next(s for s in segments[1] if s['composed'] and s['composed']['ink_revision']>0)
assert opened['composed']['ink_revision']==8 and opened['composed']['visible_strokes']==len(versions[8])==6
assert 'Reopened 6 stroke(s)' in ov('reopened')['hint']
assert final['forked_from'] is None and h[8]['op']=='undo' and h[9]['op']=='add'
save('same_process_reopen',{'revision':8,'visible':6,'same_original_document':final['id'],'restart_tested':False})
race=[]
for op,begin,end,forbidden,key in [(h[7],[30,70],[1180,720],[80,700],'1'),(h[10],[30,80],[1170,730],[90,690],'2')]:
    s=strokes[op['added'][0]]
    assert s['input']=='pen' and len(s['points'])==17 and s['points'][0][:2]==begin and s['points'][-1][:2]==end
    assert final['evidence'][s['id']]['contexts']
    assert not any(abs(p[0]-forbidden[0])<=6 and abs(p[1]-forbidden[1])<=6 for s in strokes.values() for p in s['points'][:2])
    assert parsed('recoveries'+key)==[] and parsed('stopped'+key)['ended']=='stopped by the user'
    race.append({'kept':s['id'],'points':17,'post_stop_stroke_absent':True,'recovery_list_empty':True})
save('stop_persistence_only',{'variants':race,'input_refusal_observed':False,'held_stroke_settled_by_stop_isolated':False,'save_promise_pending_at_stop_observed':False})
for s in [s for s in steps if s['kind']=='raceStop']:
    assert s['overlay_events_sent']==s['overlay_replies'] and s['overlay_errors']==0
save('stop_devtools_receipts',[{k:s[k] for k in ['stop_sent_at','input_sent_at','overlay_events_sent','overlay_replies','overlay_errors']} for s in steps if s['kind']=='raceStop'])
assert parsed('doubleStart')==[{'ok':True},{'ok':False,'reason':'a session is starting'}]
assert sum(t['url'].endswith('/renderer/overlay.html') for t in values['targetsDouble'])==1
cancel=parsed('stopDuringStart')
assert not cancel['r']['ok'] and cancel['r']['reason'].startswith('stopped before the capture started') and not cancel['state']['running']
assert sum(t['url'].endswith('/renderer/overlay.html') for t in values['targetsAfterCancel'])==0
save('start_race_records','Simultaneous Starts and Stop-during-Start recorded outputs agree')
contexts=[c for e in final['evidence'].values() if e for c in e['contexts']]
assert len(contexts)==7 and all(c['image'] and c['not_observed']==['source_app','source_link','page','media_position'] for c in contexts)
assert all(all(abs(c['region_px'][k]-c['region'][k]*2)<=1 for k in ['x','y','width','height']) for c in contexts)
def png(data):
    assert data[:8]==b'\x89PNG\r\n\x1a\n';o=8;ids=[];head=None;end=False
    while o<len(data):
        n=struct.unpack('>I',data[o:o+4])[0];t=data[o+4:o+8];b=data[o+8:o+8+n]
        assert o+n+12<=len(data) and zlib.crc32(t+b)==struct.unpack('>I',data[o+8+n:o+12+n])[0]
        if t==b'IHDR':head=struct.unpack('>IIBBBBB',b)
        if t==b'IDAT':ids.append(b)
        if t==b'IEND':end=True
        o+=n+12
        if end:break
    assert o==len(data) and end and head
    w,h,depth,color,compression,filtering,interlace=head;assert head[2:]==(8,6,0,0,0)
    packed=zlib.decompress(b''.join(ids));stride=w*4;assert len(packed)==h*(stride+1)
    decoded=bytearray(h*stride)
    for y in range(h):
        f=packed[y*(stride+1)];assert f in range(5)
        for x in range(stride):
            i=y*stride+x;a=decoded[i-4] if x>=4 else 0;b=decoded[i-stride] if y else 0;c=decoded[i-stride-4] if y and x>=4 else 0
            p=a+b-c;pa,pb,pc=abs(p-a),abs(p-b),abs(p-c)
            pred=[0,a,b,(a+b)//2,a if pa<=pb and pa<=pc else b if pb<=pc else c][f]
            decoded[i]=(packed[y*(stride+1)+1+x]+pred)&255
    return {'width':w,'height':h,'rgba_sha256':hashlib.sha256(decoded).hexdigest()}
images={}
for name in ['context-first-stroke.png','ask-crop.png']:
    data=(ROOT/name).read_bytes();images[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),**png(data)}
ctx=images['context-first-stroke.png'];matched=[c for c in contexts if c['image']['sha256']==ctx['sha256']]
assert len(matched)==1 and all(ctx[k]==matched[0]['image'][k] for k in ['width','height'])
assert [images['ask-crop.png'][k] for k in ['width','height']]==checks['pixels.ask_crop_is_selected_region']['observed']['crop_px']
save('committed_png_decode',images)
save('context_receipt_coverage',{'references_in_final':7,'non_null':7,'committed_hash_verified_contexts':1,'not_independently_rehashed_here':6,'private_sources_not_read':True})
save('not_recomputed',['Private GDI screenshot comparisons and translation reconstruction for QA-WIN-01','Six uncommitted context PNG receipts','Intermediate snapshot existence: mouse-off no-file assertion (final history/DOM agrees, snapshots uncommitted)','Physical pen/input routing, actual Stop refusal, pending save at Stop, app restart, real AI'])
print(json.dumps(out,indent=2))
