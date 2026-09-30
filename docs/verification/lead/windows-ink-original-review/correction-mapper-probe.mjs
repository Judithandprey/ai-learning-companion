// Corrected expectations; the original 46dbb90 negative probe remains unchanged.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root='/tmp/lc-windows-ink-original-e7bdbde';
const {frameRequest,MappingRefusal}=await import(pathToFileURL(`${root}/apps/windows/src/shared/frame-ingress.ts`));
const metadata=JSON.parse(readFileSync(`${root}/docs/verification/web/evidence/windows-frame-ingress/harness-ink.json`,'utf8'));
const text=readFileSync(`${root}/docs/verification/web/evidence/${metadata.manifest}`,'utf8');
const rows=text.trimEnd().split('\n').map(JSON.parse);
const entry=metadata.plan.entries[0], rowIndex=rows.findIndex(r=>r.kind==='retained'&&r.sample_seq===entry.sample_seq);
const original=rows[rowIndex].composed.ink_original;
const cases=[
 ['valid',original,true],
 ['explicit refusal',{refused:'synthetic failed original retention'},false],
 ['contradictory retained and refused',{...original,refused:'synthetic failed original retention'},false],
 ['extra retained field',{...original,note:'unrecognized'},false],
 ['wrong hash path',{...original,file:'ink/wrong.json'},false],
 ['null',null,false],
 ['empty refusal',{refused:''},false],
];
const results=[];
for(const bind of [true,false]) for(const [label,ink,valid] of cases) {
 const changed=structuredClone(rows); changed[rowIndex].composed.ink_original=ink;
 const one={...metadata.plan,entries:[{...structuredClone(entry),...(bind?{}:{ink:null})}]};
 const before=JSON.stringify(one); let result;
 try {
  const out=frameRequest(changed.map(JSON.stringify).join('\n')+'\n',one);
  result={label,bind,outcome:'accepted',unrepresented:out.unrepresented};
  if(!bind&&label==='explicit refusal') assert(out.unrepresented.some(x=>x.includes('synthetic failed original retention')));
  if(bind&&valid) assert(out.request.batch.records[0].artifacts.some(a=>a.media_type==='application/json'));
 } catch(e) { assert(e instanceof MappingRefusal); result={label,bind,outcome:'refused',reason:e.message}; }
 assert.equal(JSON.stringify(one),before);
 assert.equal(result.outcome,valid||(!bind&&label==='explicit refusal')?'accepted':'refused');
 results.push(result);
}
{
 const changed=structuredClone(rows); delete changed[rowIndex].composed.ink_original;
 const one={...metadata.plan,entries:[structuredClone(entry)]};
 const out=frameRequest(changed.map(JSON.stringify).join('\n')+'\n',one);
 assert(out.unrepresented.some(x=>x.includes('manifest predates retained ink originals')));
 results.push({label:'legacy absent field, existing caller binding remains explicitly unchecked',outcome:'accepted',unrepresented:out.unrepresented});
}
writeFileSync('/tmp/windows-ink-original-correction-mapper-results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
console.log(`PASS: ${results.length} mapper boundary cases; unchanged exact candidate fixture, pure mapper only.`);
