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

let committed=false;
const store=createApiStore({ids,clock,storage:null,fetch:async(url,init)=>{
 if(String(url).endsWith('/session'))return response(session);
 if(init.method==='POST')throw new TypeError('response lost while server may still be working');
 return committed?response(p):new Response(JSON.stringify({contract_version:p.contract_version,code:'not_found'}),{status:404});
}});
await store.connect('synthetic-review-token');
await assert.rejects(store.save(item));
const before=await store.list();
committed=true;
const after=await store.list();
const direct=await store.get(item.item_id);
const out={before_commit_list:before,after_commit_list:after,direct_read_still_exists:direct.item.item_id};
fs.writeFileSync(new URL('./review-pending-index.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
