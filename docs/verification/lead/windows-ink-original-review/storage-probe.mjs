import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { harness, running, withStroke, plain } from '/tmp/lc-windows-ink-original-46dbb90/apps/windows/tests/main-harness.ts';
import { png } from '/tmp/lc-windows-ink-original-46dbb90/apps/windows/tests/png.ts';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const outcomes=[];
for (const mode of ['unchanged control', 'changed bytes at retained address', 'directory at address']) {
  const h=harness(), s=await running(h), doc=withStroke(s.doc);
  const bytes=new TextEncoder().encode(JSON.stringify(doc));
  const dir=path.join(h.userData,'captures',s.doc.id);
  const address=path.join(dir,'ink',`${hash(bytes)}.json`);
  const facts=seq=>({sample_seq:seq, frame_seq:seq, reason:seq===1?'first':'changed', deferred_samples_not_retained:[],
    sampled_at:'2026-09-30T12:00:00.000Z', taken_at:'2026-09-30T12:00:00.000Z', monotonic_ms:1000*seq,
    state:'fresh',gap_ms:null,presented_frames:seq,stream_presented_frames:seq,presentation_ms:null,frame_age_ms:null,
    raw:{width:8,height:5,pixels_sha256:'f'.repeat(64),change_from_previous_sample:null},
    composed:{ink_session:doc.id,ink_revision:doc.ink.revision,visible_strokes:doc.ink.visible.length,
      ink_marks:{verified:0,changed:0,unknown:doc.ink.visible.length,following_content:0},
      transformation:'synthetic probe',pixels_sha256:'e'.repeat(64),uncommitted_gesture:null,evidence_pending:[]}});
  const retain=async seq=>plain(await h.handlers['lc:retain-frame']({sender:s.overlay.webContents},facts(seq),png(8,5,seq*10),png(8,5,seq*10+1),bytes));
  if(mode==='directory at address') fs.mkdirSync(address,{recursive:true});
  else {
    assert.equal((await retain(1)).ok,true);
    assert.deepEqual(fs.readFileSync(address),Buffer.from(bytes));
    if(mode==='changed bytes at retained address') fs.writeFileSync(address,'{"damaged":"original"}');
  }
  const answer=await retain(2);
  const lines=fs.readFileSync(path.join(dir,'manifest.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const last=lines.at(-1), regularFile=fs.statSync(address).isFile();
  const actualHash=regularFile?hash(fs.readFileSync(address)):null;
  const hashMatches=actualHash===last.composed?.ink_original?.sha256;
  outcomes.push({mode,answer,manifest_kind:last.kind,reference:last.composed?.ink_original,regularFile,actualHash,hashMatches,userData:h.userData});
  assert.equal(answer.ok,true);
  if(mode==='unchanged control') assert.equal(hashMatches,true);
  else assert.equal(hashMatches,false,'actual code accepts an original whose retained address has no matching bytes');
}
fs.writeFileSync('/tmp/windows-ink-original-storage-probe.json',JSON.stringify(outcomes,null,2)+'\n');
console.log(JSON.stringify(outcomes,null,2));
console.log('REPRODUCED: two invalid on-disk originals are acknowledged/listed as retained; unchanged dedup control succeeds.');
