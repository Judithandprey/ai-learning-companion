// Bounded cap reproduction through actual overlay.ts and main.ts; fake Electron/canvas/capture.
// Context PNG encoder is a test stand-in. This checks saved metadata, not native image bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { harness, running } from '/tmp/lc-windows-cap-f277362/apps/windows/tests/main-harness.ts';
import { overlayPage, until } from '/tmp/lc-windows-cap-f277362/apps/windows/tests/overlay-page.ts';
import { parseDesktopInk } from '/tmp/lc-windows-cap-f277362/apps/windows/src/shared/desktop-ink.ts';
function pixels(value, ordinal) {
  const a=new Uint8Array(1280*800).fill(245);
  for(let y=100;y<120;y++)for(let x=100;x<308;x++)a[y*1280+x]=(x%8<4)?45:245;
  for(let y=104;y<114;y++)for(let x=150;x<162;x++)a[y*1280+x]=value;
  a[700*1280+900]=ordinal; // Actual whole-frame change outside the stroke on every new frame.
  return a;
}
for(const [name,last,expected,actualTransitions] of [['repeat',160,1,1],['return',140,2,2]]) {
  const h=harness(), session=await running(h), page=await overlayPage(h,session);
  page.scene.luma=pixels(0,0); await page.review.sample();
  page.pointer('pointerdown',1,100,110); page.pointer('pointermove',1,300,110);
  let n=0; const trace=[];
  for(const value of [20,40,60,80,100,120,140,160,last]) {
    page.scene.luma=pixels(value,++n); await page.review.sample();
    page.pointer('pointermove',1,280+n%2,110); // Continue writing after each observation.
    const g=page.review.state().gesture;
    trace.push({value,contexts:g.contexts.length,changes_not_kept:g.changesNotKept});
  }
  // Stop settles and saves the still-open stroke, then acknowledges; no manual counter adjustment.
  h.end('cap probe Stop');
  await until('Stop acknowledged after saving',()=>page.acks.length>0);
  assert.deepEqual(page.acks,[null]);
  const doc=page.review.state().doc;
  const file=path.join(h.userData,'ink',doc.id+'.json');
  const read=parseDesktopInk(JSON.parse(fs.readFileSync(file,'utf8')),doc.ink.page.address_sha256);
  assert.equal(read.ok,true);
  const id=read.doc.ink.visible[0], evidence=read.doc.evidence[id];
  assert.equal(evidence.contexts.length,8);
  assert.equal(evidence.changes_not_kept,expected);
  assert.equal(page.review.retention().pinned,0);
  assert.equal(read.doc.ink.history.length,1);
  assert.equal(read.doc.ink.strokes[id].points.length,11);
  const saved='/tmp/windows-cap-corrected-saved-'+name+'.json';
  fs.copyFileSync(file,saved);
  console.log(JSON.stringify({name,expected_actual_local_transitions_after_cap:actualTransitions,saved_changes_not_kept:evidence.changes_not_kept,contexts:evidence.contexts.length,trace,saved,stop_ack:page.acks}));
}
console.log('PASS: corrected count is 1 for one transition and 2 for two; all points/history/eight contexts survive Stop and all pins release. Platform/PNG fakes only.');
