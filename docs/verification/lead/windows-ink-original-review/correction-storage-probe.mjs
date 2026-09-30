// Synthetic Linux filesystem probe of exact candidate main.ts via its existing Electron harness.
// Corrected expectations are separate from the preserved 46dbb90 failure probe.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { harness, running, withStroke, plain } from '/tmp/lc-windows-ink-original-e7bdbde/apps/windows/tests/main-harness.ts';
import { png } from '/tmp/lc-windows-ink-original-e7bdbde/apps/windows/tests/png.ts';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const outcomes = [];
async function setup(alias = false) {
  const h = harness(), s = await running(h), doc = withStroke(s.doc);
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  const dir = path.join(h.userData, 'captures', s.doc.id);
  const raw = png(8, 5, 10), composed = alias ? raw : png(8, 5, 11);
  const inkPath = path.join(dir, 'ink', `${hash(bytes)}.json`);
  const rawPath = path.join(dir, 'frames', `${hash(raw)}.png`);
  const composedPath = path.join(dir, 'frames', `${hash(composed)}.png`);
  const facts = seq => ({sample_seq:seq, frame_seq:seq, reason:seq===1?'first':'changed', deferred_samples_not_retained:[],
    sampled_at:'2026-09-30T12:00:00.000Z', taken_at:'2026-09-30T12:00:00.000Z', monotonic_ms:1000*seq,
    state:'fresh', gap_ms:null, presented_frames:seq, stream_presented_frames:seq, presentation_ms:null, frame_age_ms:null,
    raw:{width:8,height:5,pixels_sha256:'f'.repeat(64),change_from_previous_sample:null},
    composed:{ink_session:doc.id,ink_revision:doc.ink.revision,visible_strokes:doc.ink.visible.length,
      ink_marks:{verified:0,changed:0,unknown:doc.ink.visible.length,following_content:0},
      transformation:'synthetic probe',pixels_sha256:(alias?'f':'e').repeat(64),uncommitted_gesture:null,evidence_pending:[]}});
  const retain = async seq => plain(await h.handlers['lc:retain-frame']({sender:s.overlay.webContents},facts(seq),raw,composed,bytes));
  const manifest = () => fs.readFileSync(path.join(dir,'manifest.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  return {h,s,bytes,dir,raw,composed,inkPath,rawPath,composedPath,retain,manifest};
}
const signature = p => { const st = fs.lstatSync(p); return [st.ino,st.mtimeMs,st.size,st.mode]; };
for (const mode of ['unchanged control','same length changed ink','shortened ink','directory at ink address','changed composed PNG']) {
  const x = await setup();
  if (mode === 'directory at ink address') fs.mkdirSync(x.inkPath,{recursive:true});
  else assert.equal((await x.retain(1)).ok,true);
  let target = mode === 'changed composed PNG' ? x.composedPath : x.inkPath;
  if (mode === 'same length changed ink' || mode === 'changed composed PNG') {
    const altered = fs.readFileSync(target); altered[5] ^= 1; fs.writeFileSync(target,altered);
  } else if (mode === 'shortened ink') fs.writeFileSync(target,'{"damaged":"original"}');
  const before = signature(target), beforeBytes = x.s.retention.bytes;
  const damaged = fs.lstatSync(target).isFile() ? fs.readFileSync(target) : null;
  const answer = await x.retain(2), last = x.manifest().at(-1);
  assert.deepEqual(signature(target),before);
  if (damaged) assert.deepEqual(fs.readFileSync(target),damaged);
  assert.equal(x.s.retention.bytes,beforeBytes);
  if (mode === 'unchanged control') {
    assert.equal(answer.ok,true); assert.equal(last.kind,'retained');
    assert.equal(hash(fs.readFileSync(x.inkPath)),last.composed.ink_original.sha256);
  } else {
    assert.equal(answer.ok,false); assert.equal(answer.retry,undefined);
    assert.match(answer.reason,/is not these bytes.*left untouched/); assert.equal(last.kind,'refused');
    if (mode === 'directory at ink address') {
      assert.equal(fs.existsSync(x.rawPath),false); assert.equal(fs.existsSync(x.composedPath),false);
    }
  }
  outcomes.push({mode,answer,manifest_kind:last.kind,bytes:beforeBytes,userData:x.h.userData});
}
{
  const x = await setup(); assert.equal((await x.retain(1)).ok,true);
  const beforeBytes = x.s.retention.bytes; fs.chmodSync(x.inkPath,0);
  let answer;
  try { answer = await x.retain(2); }
  finally { fs.chmodSync(x.inkPath,0o600); }
  assert.equal(answer.ok,false); assert.equal(answer.retry,true);
  assert.match(answer.reason,/stored originals could not be checked.*EACCES/);
  assert.equal(x.manifest().at(-1).kind,'refused'); assert.equal(x.s.retention.bytes,beforeBytes);
  assert.equal((await x.retain(3)).ok,true); assert.equal(x.s.retention.bytes,beforeBytes);
  outcomes.push({mode:'actual read EACCES is retryable; recovery reuses bytes',answer,bytes:beforeBytes,userData:x.h.userData});
}
{
  const x = await setup(true), inkDir = path.dirname(x.inkPath);
  fs.mkdirSync(x.dir,{recursive:true});
  fs.writeFileSync(inkDir,'blocked folder');
  x.s.retention.policy.max_bytes = x.raw.length + x.bytes.length;
  const answer = await x.retain(1);
  assert.equal(answer.ok,false); assert.equal(answer.retry,true);
  assert.match(answer.reason,/writing to this device failed/);
  assert.equal(fs.readFileSync(inkDir,'utf8'),'blocked folder');
  assert.equal(x.manifest().at(-1).kind,'refused');
  assert.equal(x.s.retention.frames,0); assert.equal(x.s.retention.bytes,x.raw.length);
  assert.deepEqual(fs.readFileSync(x.rawPath),Buffer.from(x.raw));
  fs.unlinkSync(inkDir);
  assert.equal((await x.retain(2)).ok,true);
  assert.equal(x.s.retention.bytes,x.raw.length+x.bytes.length);
  assert.equal(x.s.retention.frames,1);
  const originals = [signature(x.rawPath),signature(x.inkPath)];
  assert.equal((await x.retain(3)).ok,true);
  assert.equal(x.s.retention.bytes,x.raw.length+x.bytes.length);
  assert.deepEqual([signature(x.rawPath),signature(x.inkPath)],originals);
  assert.deepEqual(x.manifest().map(x=>x.kind),['header','refused','retained','retained']);
  outcomes.push({mode:'ENOTDIR -> partial write -> recovery at exact cap with raw/composed alias',answer,bytes:x.s.retention.bytes,frames:x.s.retention.frames,userData:x.h.userData});
}
fs.writeFileSync('/tmp/windows-ink-original-correction-storage-results.json',JSON.stringify(outcomes,null,2)+'\n');
console.log(JSON.stringify(outcomes,null,2));
console.log(`PASS: ${outcomes.length} bounded storage cases; actual candidate main.ts and real Linux filesystem, fake Electron.`);
