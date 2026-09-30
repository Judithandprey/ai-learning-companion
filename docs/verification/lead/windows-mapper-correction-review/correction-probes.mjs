// Bounded independent correction regression. Metadata only; no service or image-byte acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root=process.argv[2]??'/tmp/lc-windows-mapper-49305e3';
const out='/tmp/windows-mapper-correction-cases'; fs.mkdirSync(out,{recursive:true});
const {frameRequest,MappingRefusal,readManifest}=await import(pathToFileURL(path.join(root,'apps/windows/src/shared/frame-ingress.ts')));
const evidence=path.join(root,'docs/verification/web/evidence');
const fixture=name=>{
 const meta=JSON.parse(fs.readFileSync(path.join(evidence,'windows-frame-ingress',name+'.json'),'utf8'));
 return {meta,text:fs.readFileSync(path.join(evidence,meta.manifest),'utf8').replaceAll('\r\n','\n')};
};
const native=fixture('native'),harness=fixture('harness');
const parse=text=>text.trimEnd().split('\n').map(JSON.parse);
const emit=lines=>lines.map(JSON.stringify).join('\n')+'\n';
const selected=native.meta.plan.entries.find(e=>e.kind==='frame'&&e.sample_seq===10);
assert.notEqual(selected.raw.artifact.sha256,selected.composed.artifact.sha256);
const one={...structuredClone(native.meta.plan),entries:[structuredClone(selected)]};
const nativeLines=parse(native.text),index=nativeLines.findIndex(l=>l.kind==='retained'&&l.sample_seq===10);
let refusals=0,valid=0;
function refuse(name,fn,re){assert.throws(fn,e=>e instanceof MappingRefusal&&re.test(e.message),name);refusals++;}
function save(name,result){fs.writeFileSync(path.join(out,name+'.json'),result.body);valid++;return result;}
// Complete old declared bodies are unchanged except the explicitly required surface correction.
for(const [name,f] of [['native',native],['harness',harness]]){
 const before=JSON.stringify(f.meta.plan),result=save(name,frameRequest(f.text,f.meta.plan));
 const old=JSON.parse(fs.readFileSync('/tmp/lc-windows-mapper-80da708/docs/verification/web/evidence/windows-frame-ingress/'+name+'.body.json','utf8'));
 for(const record of old.batch.records)record.surface='external_app';
 assert.deepEqual(result.request,old,name+' metadata preserved except surface');
 assert.equal(result.body,frameRequest(f.text,f.meta.plan).body);assert.equal(JSON.stringify(f.meta.plan),before);
 for(const record of result.request.batch.records){
  assert.deepEqual(Object.keys(record.source).sort(),['source_id','source_version','user_id']);
  assert.deepEqual([record.surface,record.method,record.evidence.kind],['external_app','visual','coverage']);
  assert.deepEqual([record.observed_at,record.clock,record.media_position],[null,null,null]);
 }
 console.log(JSON.stringify({name,records:result.request.batch.records.length,frames:result.request.frames.length,exact_old_metadata_preserved:true}));
}
for(const bad of [undefined,[],false,0,'','damaged']){
 const lines=structuredClone(nativeLines); if(bad===undefined)delete lines[index].composed;else lines[index].composed=bad;
 refuse('manifest composed '+String(bad),()=>frameRequest(emit(lines),one),/retained composition is neither/);
}
for(const field of ['composed','ink'])for(const bad of [undefined,false,0,'',[]]){
 const plan=structuredClone(one); if(bad===undefined)delete plan.entries[0][field];else plan.entries[0][field]=bad;
 refuse('plan '+field+' '+String(bad),()=>frameRequest(native.text,plan),/binding is neither/);
}
const rawOnlyLines=structuredClone(nativeLines),rawOnlyPlan=structuredClone(one);
rawOnlyLines[index].composed=null;rawOnlyPlan.entries[0].composed=null;
assert.equal(save('raw-only',frameRequest(emit(rawOnlyLines),rawOnlyPlan)).request.frames[0].composed,null);
refuse('null manifest with binding',()=>frameRequest(emit(rawOnlyLines),one),/none can be bound/);
const noInkPlan=structuredClone(one);noInkPlan.entries[0].ink=null;
const noInk=save('explicit-no-ink',frameRequest(native.text,noInkPlan));
assert.equal(noInk.request.batch.records[0].artifacts.length,2);
assert(noInk.unrepresented.some(n=>/not the editable ink; no editable-ink original/.test(n)));
const extra=structuredClone(one);extra.source.source_timezone='UTC';
refuse('extra SourceRef member',()=>frameRequest(native.text,extra),/members beyond SourceRef/);
function coverage(f,kind,changes){
 const lines=parse(f.text),i=lines.findIndex(l=>l.kind===kind);assert(i>0);
 lines[i]={...lines[i],...changes};
 const plan={...f.meta.plan,entries:[{kind:'coverage',line:i+1,record_id:'coverage-'+kind,sequence:1}]};
 return ()=>frameRequest(emit(lines),plan);
}
for(const changes of [{from_seq:99,to_seq:1,samples:100},{from_seq:8,to_seq:8,samples:2},{reason:7}])
 refuse('not_retained corrupt',coverage(native,'not_retained',changes),/impossible for the producer/);
save('valid-not-retained',coverage(native,'not_retained',{from_seq:3,to_seq:8,samples:2,reason:''})());
for(const changes of [{gap_ms:0},{gap_ms:-1},{sampled_at:'not a time'},{monotonic_ms:-1},{reason:undefined}])
 refuse('gap corrupt',coverage(harness,'gap',changes),/gap does not hold/);
const fractional=save('fractional-gap',coverage(harness,'gap',{gap_ms:7000.5,monotonic_ms:100.25,sampled_at:'2026-09-30T10:00:00+02:00'})());
assert(fractional.unrepresented.some(n=>n.includes('7000.5 ms')&&n.includes('100.25 ms')&&n.includes('+02:00')));
assert.deepEqual(fractional.request.batch.records[0].artifacts,[]);
for(const changes of [{sample_seq:5,frame_seq:6},{sample_seq:5,deferred_samples_not_retained:[5]},{reason:null}])
 refuse('refused corrupt',coverage(native,'refused',changes),/refusal does not hold/);
// main factsProblem allows order/repetition here; the mapper must preserve rather than sort these facts.
const repeated=save('refused-deferred-preserved',coverage(native,'refused',{sample_seq:5,frame_seq:4,deferred_samples_not_retained:[2,1,2],reason:'kept verbatim'})());
assert(repeated.unrepresented.some(n=>n.includes('[2,1,2]')));
for(const changes of [{samples:[],deferred_samples_not_retained:[1]},{samples:[7,5],deferred_samples_not_retained:[]},{samples:[7],deferred_samples_not_retained:[7]},{samples:[7],deferred_samples_not_retained:[2,1]},{reason:undefined}])
 refuse('unfinished corrupt',coverage(harness,'unfinished',changes),/unfinished record does not hold/);
// recordUnfinished sorts unique pending keys and non-unique flattened deferred values.
const unfinished=save('valid-unfinished',coverage(harness,'unfinished',{samples:[5,7],deferred_samples_not_retained:[1,1,6]})());
assert(unfinished.unrepresented.some(n=>n.includes('[1,1,6]')));
const empty=save('empty-unfinished',coverage(harness,'unfinished',{samples:[],deferred_samples_not_retained:[]})());
assert.equal(empty.request.batch.records[0].evidence.coverage,'unknown');
refuse('unwritten nonpositive',coverage(harness,'unwritten',{count:0}),/unwritten count does not hold/);
refuse('unwritten missing reason',coverage(harness,'unwritten',{reason:undefined}),/unwritten count does not hold/);
// Only parser-detected incomplete JSON tail becomes unknown missing_events.
const torn=native.text+'{"kind":"retai';
const line=readManifest(torn).at(-1).line;
const tornPlan={...native.meta.plan,entries:[{kind:'coverage',line,record_id:'tail',sequence:1}]};
const tail=save('torn-tail',frameRequest(torn,tornPlan));
assert.deepEqual(tail.request.batch.records[0].evidence.limitations,['missing_events']);
assert.equal(tail.request.batch.records[0].frame_id,null);
refuse('newline-terminated damaged JSON',()=>frameRequest(torn+'\n',tornPlan),/damaged line/);
refuse('whole fake torn line',()=>frameRequest(native.text+'{"kind":"torn","torn":true}\n',tornPlan),/has no coverage meaning/);
refuse('ended live',()=>frameRequest(native.text,{...one,delivery_mode:'live'}),/only be sent as historical/);
const foreign=structuredClone(one);foreign.entries[0].composed.source.source_version++;
refuse('foreign composed source',()=>frameRequest(native.text,foreign),/another source/);
const f3=native.meta.plan.entries.find(e=>e.kind==='frame'&&e.sample_seq===3),alias=structuredClone(nativeLines);
alias.find(l=>l.kind==='retained'&&l.sample_seq===3).composed.pixels_sha256='f'.repeat(64);
refuse('same file conflicting pixel facts',()=>frameRequest(emit(alias),{...native.meta.plan,entries:[f3]}),/different facts/);
console.log(JSON.stringify({result:'PASS',refusal_cases:refusals,valid_metadata_cases_saved:valid,scope:'pure mapper and producer invariants; no PNG/service/provider attestation'}));
