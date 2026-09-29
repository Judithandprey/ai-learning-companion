import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createApiStore } from './apps/safari-extension/preview/src/api-store.ts';
import { resolveProbeCard } from './apps/safari-extension/src/explain.ts';
const examples=JSON.parse(fs.readFileSync(new URL('./packages/contracts/document_preview/examples.json',import.meta.url)));
const p=examples.SavedPreview;
const clock=()=> '2026-09-29T12:00:00.000Z';
let next=0; const ids={next:prefix=>`${prefix}_${++next}`};
const session={contract_version:p.contract_version,user_id:p.source.user_id,device_id:p.frame.device_id,session_id:p.frame.session_id,authorization_generation:1,membership_revision:1,project_id:null};
const response = x => new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
const item={item_id:p.note.note_id,source:{user_id:p.source.user_id,source_id:p.source.source_id,source_version:p.source.source_version},frame:p.frame,frame_artifact:Buffer.from(p.frame_bytes_base64,'base64').toString('utf8'),bridge_request:p.bridge_request,request:p.request,card:resolveProbeCard(p.request,p.bridge_request.selection,[]),title:p.note.title,request_text:p.request_text,user_note:p.user_note};
const out={};
// Headers arrive immediately, then the JSON body stalls; a real fetch signal abort would error the stream.
let bodySignal, streamController;
const hanging=createApiStore({ids,clock,storage:null,timeoutMs:15,fetch:async (_url,init)=>{
  if(init.method==='GET')return response(session);
  bodySignal=init.signal;
  return new Response(new ReadableStream({start(c){streamController=c; bodySignal.addEventListener('abort',()=>c.error(new Error('aborted')),{once:true});}}),{status:200});
}});
await hanging.connect('synthetic-review-token');
let settled=false,kind=null;
const saving=hanging.save(item).then(()=>{settled=true;kind='success'},e=>{settled=true;kind=e.kind});
await new Promise(r=>setTimeout(r,80));
out.body_timeout={configured_ms:15,observed_after_ms:80,settled,signal_aborted:bodySignal.aborted};
streamController.error(new Error('review cleanup'));
await saving;
out.body_timeout.cleanup_kind=kind;
// A malformed successful pending-id lookup must not become saved.
const pending=createApiStore({ids,clock,storage:null,fetch:async(url,init)=>{
  if(String(url).endsWith('/session'))return response(session);
  if(init.method==='POST')throw new TypeError('simulated lost answer');
  return response(null);
}});
await pending.connect('synthetic-review-token');
await assert.rejects(pending.save(item));
out.pending_null_response=(await pending.list()).map(x=>({item_id:x.item_id,pending:x.pending,saved_at:x.saved_at}));
// Hashes can match while semantic source/frame/note bindings are wrong.
const bad=structuredClone(p); bad.frame.source_id='source_other'; bad.note.user_id='user_other'; bad.observation.actor='assistant';
const badStore=createApiStore({ids,clock,storage:null,fetch:async url=>response(String(url).endsWith('/session')?session:bad)});
await badStore.connect('synthetic-review-token');
try{const got=await badStore.get(p.note.note_id);out.bad_binding={accepted:true,verified:got.verified,source_id:got.item.source.source_id,frame_source_id:got.item.frame.source_id,note_user:got.note.user_id,observation_actor:got.observation.actor};}catch(e){out.bad_binding={accepted:false,error:String(e)}}
fs.writeFileSync(new URL('./review-bad-saved-preview.json',import.meta.url),JSON.stringify(bad,null,2)+'\n');
fs.writeFileSync(new URL('./review-adapter-probes.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
