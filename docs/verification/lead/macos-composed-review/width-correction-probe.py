import runpy,json,hashlib,copy
v=runpy.run_path('/tmp/macos-validator-a17f6c1.py')
# PYTHON SYNTHETIC NEGATIVE ONLY: this is not Swift-produced output or native evidence.
w,h=200,100
rawrows=[bytes([128,128,128,255])*w for _ in range(h)]
raw=v['encode_png'](rawrows,w,h)
strokes=[{'id':k,'width':4.0,'points':[{'x':a,'y':10.0},{'x':b,'y':10.0}]} for k,a,b in [('s1',10,90),('s2',10,42),('s3',58,90)]]
ops=[{'kind':'mode','revision':0,'host':100.5},
 {'kind':'stroke','revision':1,'host':101.5,'removed':[],'added':['s1']},
 {'kind':'erase','revision':2,'host':102.5,'removed':['s1'],'added':['s2','s3']},
 {'kind':'undo','revision':3,'host':103.5,'removed':['s2','s3'],'added':['s1']},
 {'kind':'redo','revision':4,'host':104.5,'removed':['s1'],'added':['s2','s3']}]
files={'ink/ink.json':json.dumps({'revision':4,'operations':ops,'strokes':strokes}).encode()}
events=[]
for seq,host in enumerate([100.9,102,103,104,105,105.6,106],1):
 name=f'frames/{seq:08d}.png';files[name]=raw
 frame={'sequence':seq,'file':name,'sha256':hashlib.sha256(raw).hexdigest(),'byteLength':len(raw),'width':w,'height':h,'sourceHost':None if seq==6 else host,'callbackHost':host if seq==6 else host+0.1}
 events.append({'event':'kept','frame':frame})
 if seq==7:
  events.append({'event':'not_composed','detail':{'sequence':str(seq),'reason':'refused','detail':'synthetic geometry refusal'}});continue
 revision=[0,1,2,3,4,4][seq-1];ids=[[],['s1'],['s2','s3'],['s1'],['s2','s3'],['s2','s3']][seq-1]
 data=raw;target=name
 if ids:
  # Intentionally WRONG thickness: 1 pixel, despite 4 point width at 2x scale (= 8 pixels).
  rows=list(rawrows);line=bytearray(rows[20])
  for stroke in strokes:
   if stroke['id'] in ids:
    for x in range(int(stroke['points'][0]['x']*2),int(stroke['points'][1]['x']*2)+1):line[x*4:x*4+4]=bytes([255,59,48,255])
  rows[20]=bytes(line);data=v['encode_png'](rows,w,h);target=f'composed/{seq:08d}.png';files[target]=data
 ink={'document':{'file':'synthetic/ink/ink.json'},'revision':revision,'strokes':ids,'limits':['synthetic test only'],'pixelsHost':host,'pixelsTime':'callback_admission' if seq==6 else 'source_time'}
 if revision:ink['revisionHost']={1:101.5,2:102.5,3:103.5,4:104.5}[revision]
 events.append({'event':'composed','composed':{'rawSequence':seq,'rawFile':name,'rawSHA256':frame['sha256'],'rawByteLength':len(raw),'file':target,'sha256':hashlib.sha256(data).hexdigest(),'byteLength':len(data),'width':w,'height':h,'ink':ink}})
events.append({'event':'ended'})
model={'session':'synthetic','files':files,'events':events,'status':{'display':{'frame':{'width':100,'height':50},'scope':v['APP_EXCLUDED_PREFIX']},'composedFrames':6,'notComposed':{'refused':1},'composedBytes':sum(len(b) for k,b in files.items() if k.startswith('composed/'))}}
print('PYTHON SYNTHETIC ONLY: width 4 points at 2x, image width 1 pixel')
print('validator problems:',v['problems'](model))
controls=[(label,bool(v['problems'](mutated))) for label,mutated in v['mutations'](model)]
print('existing negative controls detected:',sum(ok for _,ok in controls),'/',len(controls))
print('undetected existing controls:',[label for label,ok in controls if not ok])
# A transparent red centerline also passes this Python validator, though Swift decoding may reject it.
