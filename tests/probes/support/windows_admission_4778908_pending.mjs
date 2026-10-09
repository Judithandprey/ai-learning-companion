// One bounded in-memory lifetime regression across the four actual pending consumers.
// No browser, native code, child, provider, network, real PNG or filesystem writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';

const root = process.argv[2];
assert.ok(root);
function read(path, hash) {
  const b = readFileSync(join(root, path));
  assert.equal(createHash('sha256').update(b).digest('hex'), hash);
  return stripTypeScriptTypes(b.toString());
}
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'exact source anchors');
  return source.slice(a, b);
}
const main = read('apps/windows/src/main/main.ts', '078aa8067ffd5f54a83704158d86ba6de4597d6fd271d3ed090c38fb06ffeb84');
const overlay = read('apps/windows/src/renderer/overlay.ts', '39001b3c5deb3c352173f49814b1fabbca0c91e4e044b389dd0a74da56ffb7cd');
const holding = /lc\.admitFrame\('pre', mySeq, \{ holding: (.*?) \}\)/.exec(overlay)?.[1];
assert.ok(holding, 'the actual sampler holding-list expression');
const consumers = between(overlay, 'const using =', '/** The sample whose grab')
  + between(overlay, 'function wholeFrame(', '/** Cancel, or the card closed')
  + between(overlay, 'async function pngBytes(', '// ---- the AI\'s first look')
  + between(overlay, 'function offerLook(', '/** Adds samples');
const flush = () => new Promise(resolve => setImmediate(resolve));
const rows = [];

async function context() {
  const hash = 'b'.repeat(64), frames = [];
  const session = { ending: false, retention: { id: 'a'.repeat(16) }, display: { bounds: { width: 2, height: 2 }, scale_factor: 1 },
    admission: { checker: { failure: null, decide: async () => ({ ok: true, ms: 0 }) }, violation: null, ticket: null, admitted: new Map() } };
  const m = { current: session, randomBytes, HOLDING_MAX: 16,
    isSeq: x => Number.isSafeInteger(x) && x > 0, isObj: x => x !== null && typeof x === 'object' && !Array.isArray(x),
    isHex: (x, n) => typeof x === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(x),
    recordAdmission: () => true, end: () => { session.ending = true; } };
  vm.runInNewContext(between(main, 'const sameMembers =', '\nfunction retainFrame(') + '\nglobalThis.review={admitFrame,sourceOf};', m);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let blocked = true;
  class Canvas {
    constructor(width=2, height=2) { this.width=width; this.height=height; }
    getContext() { return { drawImage() {} }; }
    async convertToBlob() { if (blocked) await gate; return { arrayBuffer: async () => new ArrayBuffer(1) }; }
  }
  class Reader { readAsDataURL() { this.result='synthetic'; this.onload(); } }
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id,{hidden:true,value:'synthetic follow-up',textContent:''}); return nodes.get(id); };
  const s = {
    admission: true, ended: false, raw: null,
    doc: { id:'synthetic-ink', ink:{revision:0,visible:[],strokes:{}} }, display: {bounds:{width:2,height:2},label:'synthetic'},
    mode: {mode:'ASK',askEpoch:1}, subscription: true, development: false, cardSeq:0,
    asked: {selection:'synthetic-selection',request:null,submitting:false,shown:null,unsaved:null},
    OffscreenCanvas:Canvas, FileReader:Reader, TextEncoder,
    compose: () => new Canvas(), regionOf: () => ({x:0,y:0,width:1,height:1}), toFramePixels: () => ({x:0,y:0,width:1,height:1}),
    inkMarks: () => ({}), dashedNote: () => '', why: e => String(e), sessionNow: () => 'synthetic-live',
    $: node, document: {querySelector:()=>({value:'hint'})},
    resetAsk: () => {s.asked=null;}, setMode: mode => {s.mode=mode;}, reduceMode:()=>({state:{mode:'NAV',askEpoch:1}}),
    askStatus() {}, askForm() {}, showOutcome() {}, interrupt() {}, renderTalk() {}, saved() {}, talkNote:'',
    lastRetained:null,lastConfirmed:null,retentionClosed:null,deferredSeqs:[],retentionPolicy:{},
    retention:Promise.resolve(),retentionQueued:0,MAX_RETENTION_QUEUE:2,retentionPending:new Map(),
    retentionState:{retained:0,refused:0,lastRefusal:''}, decideRetention:()=>({retain:true,reason:'synthetic-material'}),
    addNotRetained() {}, flushNotRetained() {}, pin() {}, unpin() {},
    lookOwed:()=> '2026-10-09T00:00:00.000Z',lookTries:{session:null,failed:0},lookGiven:null,lookOut:false,LOOK_TRIES:3,lookNote:'',
    performance:{now:()=>1},render() {},
  };
  const intake = facts => {
    const seq = facts.frame_seq;
    assert.ok(m.review.sourceOf(session,seq,hash,2,2),'pending frame must still have its own admission at actual intake');
    frames.push(seq);
  };
  s.lc = {
    retainFrame: async facts => {intake(facts);return {ok:true};},
    lookFrame: async facts => {intake(facts);return {ok:true};},
    askSelection: async facts => {intake(facts);return {ok:true,selection_id:'kept',request:{ok:false,reason:'synthetic, no provider'}};},
    askSubmit: async (_selection,_text,_assistance,facts) => {intake(facts);return {ok:false,reason:'synthetic, no provider'};},
    notRetained() {}, askCancel() {},
  };
  vm.runInNewContext(consumers + `\nglobalThis.review={using,finishAsk,submitAsk,offerLook,considerRetention,holding:()=>(${holding})};`,s);
  async function acquire(seq) {
    const pre=await m.review.admitFrame(session,'pre',seq,{holding:s.review.holding()});
    if (!pre.ok) return false;
    assert.equal((await m.review.admitFrame(session,'post',seq,{ticket:pre.ticket,raw_sha256:hash,width:2,height:2})).ok,true);
    s.raw={seq,sha:hash,at:'2026-10-09T00:00:00.000Z',liveSession:'synthetic-live',presented:seq,presentedAt:0,bitmap:{width:2,height:2}};
    return true;
  }
  assert.equal(await acquire(1),true);
  return {s,m,session,frames,acquire,release:()=>{blocked=false;release();}};
}

for (const kind of ['retention','first-look','circle','follow-up']) {
  const c=await context(), {s,session}=c;
  let pending;
  if (kind==='retention') {
    const composed={ink_session:s.doc.id,ink_revision:0,ink_marks:{}};
    assert.equal(s.review.considerRetention({seq:1,monotonic_ms:0,sampled_at:s.raw.at,state:'fresh',gap_ms:null,raw:{stream_presented_frames:1,frame_age_ms:0,change:null},composed},s.raw,[],{canvas:new s.OffscreenCanvas(),ink:new Uint8Array(),uncommitted:null,evidencePending:[]},s.raw.sha),true);
    pending=s.retention;
  } else if (kind==='first-look') s.review.offerLook(s.raw,false,true);
  else if (kind==='circle') pending=s.review.finishAsk([]);
  else pending=s.review.submitAsk();
  assert.equal(s.review.using.get(1),1);
  for (let seq=2;seq<=71;seq++) assert.equal(await c.acquire(seq),true);
  assert.ok(session.admission.admitted.has(1));
  assert.equal(c.frames.length,0,'encoding is still pending');
  c.release();
  if (pending) await pending;
  await flush();
  assert.deepEqual(c.frames,[1]);
  assert.equal(s.review.using.size,0,'consumer reference released after intake');
  assert.equal(session.ending,false);
  assert.equal(await c.acquire(72),true);
  assert.equal(session.admission.admitted.has(1),false,'completed original can now retire');
  rows.push({consumer:kind,admitted_frames_while_pending:71,intake_frame:1,reference_released:true,capture_ending:false});
}

// A concrete producer-bound condition: repeated circles can remain pending together.
// We call the real finishAsk entry used by endGesture; no UI/native timing is simulated.
{
  const c=await context(), {s,session}=c, pending=[];
  for (let seq=1;seq<=17;seq++) {
    if (seq>1) assert.equal(await c.acquire(seq),true);
    pending.push(s.review.finishAsk([]));
  }
  assert.equal(s.review.using.size,17);
  const allowed=await c.acquire(18);
  assert.equal(allowed,false);
  assert.equal(session.ending,true);
  assert.match(session.admission.violation,/malformed/);
  rows.push({consumer:'17 concurrent circle encodings',kind:'conditional_counterexample',holding_count:17,
    next_acquisition_allowed:false,capture_ending:true,reason:session.admission.violation,
    limitation:'Actual consumer functions and reference count, synthetic delayed encodings; no real UI latency or native run.'});
  // Model ordinary Stop cancellation so held work is released without new intakes.
  s.ended=true;s.mode={mode:'NAV',askEpoch:2};c.release();
  await Promise.all(pending);
  assert.equal(s.review.using.size,0);
  assert.equal(c.frames.length,0);
}
assert.equal(rows.length,5);
console.log(JSON.stringify({source:'477890829c4afe880a151f3ce151b98b97405414',pending_consumer_regressions:4,conditional_counterexamples:1,rows},null,2));
