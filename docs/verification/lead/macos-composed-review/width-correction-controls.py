# Synthetic geometry checks only; the actual Swift fixture is still NOT_RUN.
import copy, hashlib, math, runpy
n=runpy.run_path('/tmp/macos-width-correction-probe.py')
v=n['v'];m=copy.deepcopy(n['model']);w=200;h=100
original=v['problems'](m)
assert original and all('recorded width' in p for p in original)
# Recreate the actual fixture's nominal 3pt x 2 = 6px width with opaque round caps.
ink=__import__('json').loads(m['files']['ink/ink.json'])
for s in ink['strokes']:s['width']=3.0
m['files']['ink/ink.json']=__import__('json').dumps(ink).encode()
for e in m['events']:
 if e['event']!='composed' or not e['composed']['ink']['strokes']:continue
 c=e['composed'];selected=[s for s in ink['strokes'] if s['id'] in c['ink']['strokes']]
 rows=[]
 for y in range(h):
  row=bytearray()
  for x in range(w):
   on=False
   for s in selected:
    a=s['points'][0]['x']*2;b=s['points'][1]['x']*2
    near=min(b,max(a,x+0.5))
    on=on or math.hypot(x+0.5-near,y+0.5-20)<=3
   row.extend([255,59,48,255] if on else [128,128,128,255])
  rows.append(bytes(row))
 data=v['encode_png'](rows,w,h);m['files'][c['file']]=data
 c['sha256']=hashlib.sha256(data).hexdigest();c['byteLength']=len(data)
m['status']['composedBytes']=sum(len(b) for k,b in m['files'].items() if k.startswith('composed/'))
assert v['problems'](m)==[],v['problems'](m)
print('PASS: synthetic 3pt at 2x width-positive model')
for label,bad in v['mutations'](m):
 errors=v['problems'](bad)
 assert errors,label
 print('REJECTED:',label,':',errors[0])
print('PASS: corrected positive, original false-pass rejected, all 24 mutated positive controls rejected')
