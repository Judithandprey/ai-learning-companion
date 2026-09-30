from pathlib import Path
import base64, collections, hashlib, json, struct, zlib
E=Path('/tmp/windows-qa-55478f0-890aa3a/docs/verification/qa/p0-13-windows-qa-win01-55478f0')
G=Path('/tmp/qa-win01-ev1'); R=Path('/tmp/qa-win01-retest-run1')
def load(p): return json.loads(p.read_text())
def sha(data): return hashlib.sha256(data).hexdigest()
def png(p):
 b=p.read_bytes(); assert b[:8]==b'\x89PNG\r\n\x1a\n'; assert b[12:16]==b'IHDR'
 w,h,depth,color=struct.unpack('>IIBB',b[16:26]);return {'sha256':sha(b),'bytes':len(b),'width':w,'height':h,'depth':depth,'color':color}
def bmp_crop(p,x,y,w,h):
 with p.open('rb') as f:
  head=f.read(54); assert head[:2]==b'BM'
  offset=struct.unpack_from('<I',head,10)[0];bw,bh=struct.unpack_from('<ii',head,18);bits=struct.unpack_from('<H',head,28)[0];compression=struct.unpack_from('<I',head,30)[0]
  assert bits in (24,32) and compression in (0,3) and x+w<=bw and y+h<=abs(bh),(bits,compression,bw,bh)
  bpp=bits//8;stride=((bw*bpp+3)//4)*4;out=[]
  for yy in range(y,y+h):
   row=yy if bh<0 else bh-1-yy;f.seek(offset+row*stride+x*bpp);b=f.read(w*bpp)
   out.append(bytes(c for i in range(w) for c in (b[i*bpp+2],b[i*bpp+1],b[i*bpp])))
  return b''.join(out)
def generated_rgb(p):
 b=p.read_bytes();meta=png(p);assert (meta['depth'],meta['color'])==(8,2)
 off=8;parts=[]
 while off<len(b):
  n=struct.unpack_from('>I',b,off)[0];kind=b[off+4:off+8];data=b[off+8:off+8+n]
  assert zlib.crc32(kind+data)&0xffffffff==struct.unpack_from('>I',b,off+8+n)[0]
  if kind==b'IDAT':parts.append(data)
  off+=12+n
 data=zlib.decompress(b''.join(parts));stride=meta['width']*3;assert len(data)==meta['height']*(stride+1)
 rows=[]
 for y in range(meta['height']):
  row=data[y*(stride+1):(y+1)*(stride+1)];assert row[0]==0;rows.append(row[1:])
 return b''.join(rows)
report={'commit':'890aa3a21af6938f35c798ec82aa1bb104b74092','tested_windows':'55478f04cab0da3785718469ed69ac8f4e413d1f','checks':{},'anomalies':[],'limits':['Saved artifact audit only; no scenario, app, native, analyzer or provider execution.','Private whole-display images were not viewed or published; hashes and only QA panel crop bytes were read.','Summary pass predicates are saved author results, not independently rerun.']}
common=[];different=[];missing=[]
for p in sorted(E.iterdir()):
 if p.is_file():
  q=G/p.name
  if q.exists():
   (common if p.read_bytes()==q.read_bytes() else different).append(p.name)
  else:missing.append(p.name)
report['checks']['generated_evidence_bytes']={'identical':common,'different':different,'not_in_generated_dir':missing}
assert not different
report['pngs']={p.name:png(p) for p in sorted(E.glob('*.png'))}
summary=load(E/'summary.json');counts=collections.Counter(c['status'] for c in summary['checks']);assert dict(counts)==summary['counts'];assert len({c['id'] for c in summary['checks']})==len(summary['checks'])
report['checks']['summary_counts']=dict(counts);byid={c['id']:c for c in summary['checks']}
timeline=load(E/'samples-timeline.json');assert len(timeline['samples'])==summary['samples']['total'];assert dict(collections.Counter(s['state'] for s in timeline['samples']))==summary['samples']['states']
report['checks']['samples']={'total':len(timeline['samples']),'states':summary['samples']['states']}
contexts=[];documents={}
for name in ['ink-final.json','ink-retest.json']:
 d=load(E/name);ink=d['ink'];shown=set()
 for h in ink['history']:shown.difference_update(h['removed']);shown.update(h['added'])
 assert shown==set(ink['visible']);assert set(d['evidence'])<=set(ink['strokes']);assert len(ink['history'])==ink['revision']
 for sid in set(ink['strokes'])-set(d['evidence']): assert ink['strokes'][sid]['derived_from'] in d['evidence']
 for sid,ev in d['evidence'].items():
  detail=ev['detail'];assert len(base64.b64decode(detail['luma'],validate=True))==detail['cols']*detail['rows']
  for c in ev['contexts']:
   assert c['from_point']<len(ink['strokes'][sid]['points'])
   assert c['not_observed']==['source_app','source_link','page','media_position']
 documents[name]={'id':d['id'],'revision':ink['revision'],'strokes':len(ink['strokes']),'visible':len(ink['visible']),'history':[h['op'] for h in ink['history']]}
 if name=='ink-retest.json':
  for sid,ev in d['evidence'].items():
   point=ink['strokes'][sid]['points'][0][:2]
   role={(570,163):'still',(139,103):'sign',(159,163):'digit',(100,223):'cross',(155,270):'cap'}[tuple(point)]
   documents[name].setdefault('context_counts',{})[role]=len(ev['contexts'])
   for i,c in enumerate(ev['contexts']):
    im=c['image'];p=R/'ink/context'/(im['sha256']+'.png');meta=png(p)
    assert meta['sha256']==im['sha256'] and (meta['width'],meta['height'])==(im['width'],im['height'])
    assert (c['region_px']['width'],c['region_px']['height'])==(im['width'],im['height'])
    committed=f'context-{role}-{i+1}.png' if role in ('cross','cap') else None
    if committed:assert (E/committed).read_bytes()==p.read_bytes()
    matches=[s for s in timeline['samples'] if s['seq']==c['frame_seq'] and s.get('raw',{}).get('taken_at')==c['frame_taken_at']]
    assert len(matches)==1
    if c['frame_pixels_sha256'] is not None:assert matches[0]['raw']['pixels_sha256']==c['frame_pixels_sha256']
    contexts.append({'stroke':role,'index':i+1,'frame_seq':c['frame_seq'],'from_point':c['from_point'],'sha256':meta['sha256'],'width':meta['width'],'height':meta['height'],'committed_copy':committed,'source_pixels_hash_unknown':c['frame_pixels_sha256'] is None})
   if role=='cap':
    assert ev['changes_not_kept']==4 and len(ink['strokes'][sid]['points'])==32
    assert [c['from_point'] for c in ev['contexts']]==[0,4,6,8,10,12,14,16]
  snaps=[R/'out'/('snap-'+label)/(d['id']+'.json') for label in ('stopped4','reopened4','stopped5')]
  assert all(load(p)==d for p in snaps);assert len({sha(p.read_bytes()) for p in snaps})==1
  report['checks']['reopen_saved_snapshots']={'semantic_equal_committed':True,'all_three_raw_snapshots_byte_identical':True,'sha256':sha(snaps[0].read_bytes())}
 else:
  first=next(iter(d['evidence'].values()))['contexts'][0]['image'];assert report['pngs']['context-first-stroke.png']['sha256']==first['sha256']
report['documents']=documents;report['contexts']=contexts
selections=load(E/'retained-selection.json'); selected=[]
for label,s in selections.items():
 lines=[json.loads(t) for t in (R/'captures'/s['cap']/'manifest.jsonl').read_text().splitlines()]
 matches=[m for m in lines if m.get('kind')=='retained' and m.get('sample_seq')==s['sample_seq'] and m.get('sampled_at')==s['sampled_at']];assert len(matches)==1;m=matches[0]
 for role in ('raw','composed'):
  f=m[role];assert f['sha256']==s[role];meta=png(R/'pictures'/('frame-'+s[role]+'.png'));assert (meta['sha256'],meta['bytes'],meta['width'],meta['height'])==(f['sha256'],f['bytes'],f['width'],f['height'])
  assert meta['width']==2560 and meta['height']==1600
 samples=[v for v in timeline['samples'] if v['seq']==s['sample_seq'] and v['sampled_at']==s['sampled_at']];assert len(samples)==1
 for role in ('raw','composed'):assert samples[0][role]['pixels_sha256']==m[role]['pixels_sha256']
 state=label.removeprefix('app_');claim=byid['pixels.composed_marks_match_status']['observed']['per_state'].get(state)
 if claim:assert claim['retained_seq']==s['sample_seq'] and claim['marks']==m['composed']['ink_marks']
 panel=E/('composed-panel-'+state+'.png');cropped=None
 if panel.exists():
  cropped=generated_rgb(panel)==bmp_crop(R/'pictures'/('frame-'+s['composed']+'.bmp'),80,126,1440,600);assert cropped
 selected.append({'state':state,'sample_seq':s['sample_seq'],'sampled_at':s['sampled_at'],'raw_file_sha256':s['raw'],'composed_file_sha256':s['composed'],'panel_pixels_equal_retained_bmp_crop':cropped})
report['selections']=selected
assert sum(s['panel_pixels_equal_retained_bmp_crop'] is True for s in selected)==6
for name in ('ask-crop.png','ask-crop-4.png'):assert (E/name).read_bytes()==(R/'pictures'/name).read_bytes()
assert (report['pngs']['ask-crop-4.png']['width'],report['pngs']['ask-crop-4.png']['height'])==(272,252)
report['checks']['ask_crops_match_saved_pngs']=True
out=Path('/tmp/windows-qa-55478f0-artifact-audit.json');out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'report':str(out),'identical_generated_files':len(common),'not_in_generated_dir':missing,'pngs':len(report['pngs']),'contexts':len(contexts),'selections':len(selected),'panel_crops':6,'counts':dict(counts),'documents':documents,'anomalies':report['anomalies']},indent=2))
