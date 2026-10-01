// Portable parent-only probe. Never spawns or addresses a native/helper process.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {writeFileSync} from 'node:fs';
import {createNativeVoice} from '/mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/windows-live-experience-20261001/native-tts-candidate/native-voice.mjs';
function fake(){const c=new EventEmitter();Object.assign(c,{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kills:0});c.kill=()=>{c.kills++;queueMicrotask(()=>c.emit('close',null,'SIGTERM'));return true};return c;}
const results=[];
for(const line of ['not-json\n','null\n']) {
 const c=fake(),diagnostics=[];const v=createNativeVoice({helperPath:'/synthetic-not-executed/NativeSpeech.exe',sink:'memory',spawnProcess:()=>c,onDiagnostic:d=>diagnostics.push(d)});
 let settled=false;const pending=v.say('Synthetic text only.',1.3).then(x=>{settled=true;return x});
 let escaped=null;try{c.stdout.emit('data',line);}catch(e){escaped={name:e.name,message:e.message};}
 await Promise.resolve();const observed={line:line.trim(),escaped,kills:c.kills,settled,diagnostics:[...diagnostics]};
 if(line.startsWith('null')) {assert.equal(escaped?.name,'TypeError');assert.equal(c.kills,0);assert.equal(settled,false);c.emit('close',0,null);}
 else{assert.equal(escaped,null);assert.equal(c.kills,1);assert.equal(settled,true);}
 assert.equal(await pending,false);await v.dispose();results.push(observed);
}
writeFileSync('/tmp/native-tts-review-probe.json',JSON.stringify({scope:'exact parent adapter with fake child; no native execution',results},null,2)+'\n');console.log(JSON.stringify(results));
