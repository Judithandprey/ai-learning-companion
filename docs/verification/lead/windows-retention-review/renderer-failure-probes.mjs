// Independent, simulated browser/encoder probes over exact candidate source.
// No Electron, screen capture, AI, main-process storage or real-device claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const root = process.argv[2] ?? '/tmp/lc-windows-retention-04caef61';
const app = `${root}/apps/windows`;
const rules = await import(pathToFileURL(`${app}/src/shared/retention.ts`));
const samples = await import(pathToFileURL(`${app}/src/shared/samples.ts`));
const { png } = await import(pathToFileURL(`${app}/tests/png.ts`));
const source = stripTypeScriptTypes(fs.readFileSync(`${app}/src/renderer/overlay.ts`, 'utf8').replace(/\r\n/g, '\n'));
const slice = (from, to) => {
  const a = source.indexOf(from), b = source.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `${from} ... ${to}`);
  return source.slice(a, b);
};
const defer = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const sha = (c) => createHash('sha256').update(Buffer.alloc(c.width * c.height * 4, c.shade)).digest('hex');
const pngShade = (bytes) => {
  const b = Buffer.from(bytes), size = b.readUInt32BE(33);
  assert.equal(b.subarray(37, 41).toString(), 'IDAT');
  return inflateSync(b.subarray(41, 41 + size))[1];
};

function page(policy = {}) {
  let clock = 1000, shade = 10, callbacks = 0, stop;
  let encodeGate = null, hashGate = null, failEncode = false;
  const sent = [], gaps = [], live = [], acks = [], bitmaps = [];
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; this.shade = 0; }
    getContext() {
      return { drawImage: (bitmap) => { assert.ok(!bitmap.closed); this.shade = bitmap.shade; } };
    }
    async convertToBlob() {
      if (encodeGate) await encodeGate;
      if (failEncode) { failEncode = false; throw new Error('synthetic encode failure'); }
      const bytes = png(this.width, this.height, this.shade);
      return { arrayBuffer: async () => bytes.buffer };
    }
  }
  const ctx = {
    ...rules, ...samples, console, Map, Promise, Uint8Array,
    info: { retention_policy: { ...rules.DEFAULT_RETENTION_POLICY, ...policy } },
    performance: { now: () => clock }, now: () => new Date(clock).toISOString(),
    PERIOD_MS: 1000, video: { videoWidth: 8 }, display: { bounds: { width: 8, height: 5 } },
    source: { kind: 'display', source_id: 'synthetic:chosen-display', display_id: 'review-display' },
    OffscreenCanvas: Canvas,
    createImageBitmap: async () => {
      const b = { width: 8, height: 5, shade, closed: false, close() { this.closed = true; } };
      bitmaps.push(b); return b;
    },
    grid: (b) => new Uint8Array(2560).fill(b.shade),
    compose: (b, ink) => { const c = new Canvas(8, 5); c.shade = b.shade + ink.revision * 10; return c; },
    inkMarks: (ink) => ({ verified: ink.revision, changed: 0, unknown: 0, following_content: 0 }),
    pixelsSha: async (c) => { const result = sha(c); if (hashGate) await hashGate; return result; },
    recheckAlignment() {}, noteContextChange() {}, render() {}, setTimeout() {},
    settleGesture() {}, setInteractive() {}, saveIfChanged: async () => {},
    lc: {
      sample: (s) => live.push(s),
      retainFrame: async (facts, raw, composed) => { sent.push({ facts, raw, composed }); return { ok: true }; },
      notRetained: (g) => gaps.push(g), ended() {},
      onStop: (f) => { stop = f; }, stopped: (r) => acks.push(r),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`
    let stream=null, ended=false, endReason='', presented=0, presentedSeen=0, presentedAt=0;
    let raw=null, composed=null, startsWaiting=0, prevGrid=null, seq=0;
    let doc={id:'synthetic-ink',ink:{revision:0,visible:[]}}, lastSaved=doc, unsaved=null;
    const samples=[], frameShas=new Map(), pins=new Map();
    ${slice('const release =', '/** Strokes waiting')}
    ${slice('function endCapture(', '/** A grid of')}
    ${slice('async function takeSample(', '// ---- pixel evidence')}
    ${slice('let retention', '// Opening saved ink:')}
    ${slice('lc.onStop(', '// Test support')}
    globalThis.test = {
      sample: (late=0) => sampling=sampling.then(() => takeSample(late)),
      callback: (n, at) => { presented=n; presentedAt=at; },
      ink: (revision) => { doc={id:'synthetic-ink',ink:{revision,visible:Array(revision).fill('stroke')}}; lastSaved=doc; },
      drain: () => retention,
      state: () => ({retentionQueued,deferred:deferredSeqs.slice(),pins:pins.size,ended}),
    };
  `, ctx);
  return {
    ...ctx.test, sent, gaps, live, acks, bitmaps,
    frame(value, at, known = true) { clock = at; shade = value; if (known) ctx.test.callback(++callbacks, at - 20); },
    clock(value) { clock = value; },
    encode(p) { encodeGate = p; }, hash(p) { hashGate = p; },
    failEncode() { failEncode = true; }, stop() { stop('synthetic permission withdrawal'); },
  };
}

// Delayed hashing must preserve the pictured ink revision and held-frame facts.
{
  const p = page(), gate = defer();
  p.frame(30, 1000); p.ink(1); p.hash(gate.promise);
  const sampled = p.sample(); await flush();
  p.frame(80, 1400); p.ink(2); gate.resolve();
  await sampled; await p.drain();
  const r = p.sent[0];
  assert.equal(pngShade(r.raw), 30); assert.equal(pngShade(r.composed), 40);
  assert.equal(r.facts.composed.ink_revision, 1); assert.equal(r.facts.composed.ink_marks.verified, 1);
  assert.equal(r.facts.raw.pixels_sha256, sha({ width: 8, height: 5, shade: 30 }));
  assert.equal(r.facts.composed.pixels_sha256, sha({ width: 8, height: 5, shade: 40 }));
  assert.equal(r.facts.presented_frames, 1); assert.equal(r.facts.stream_presented_frames, 2);
  assert.equal(r.facts.presentation_ms, 980); assert.equal(r.facts.frame_age_ms, 420);
  assert.equal(r.facts.taken_at, new Date(1000).toISOString());
  assert.equal(r.facts.sampled_at, new Date(1400).toISOString());
  assert.equal(p.live[0].source.source_id, 'synthetic:chosen-display');
  console.log('PASS pinned sample pixels / ink revision / callback clocks / source');
}
{
  const p = page(); p.frame(20, 1000, false); await p.sample(); await p.drain();
  const f = p.sent[0].facts;
  assert.equal(f.presented_frames, 0); assert.equal(f.presentation_ms, null); assert.equal(f.frame_age_ms, null);
  assert.equal(f.state, 'no_new_frame');
  console.log('PASS first callback unknown stays null, not fresh');
}
{
  const p = page({ min_interval_ms: 0 }), gate = defer(); p.encode(gate.promise);
  p.frame(10, 1000); await p.sample();
  p.frame(80, 2000); p.ink(1); await p.sample();
  p.frame(140, 3000); p.ink(2); await p.sample();
  assert.equal(p.state().retentionQueued, 2); assert.deepEqual([...p.state().deferred], [3]);
  assert.equal(p.bitmaps[0].closed, true, 'first bitmap can close after it was copied');
  assert.equal(p.bitmaps[1].closed, false, 'queued second bitmap must stay pinned');
  gate.resolve(); await p.drain();
  assert.deepEqual(p.sent.map((r) => [pngShade(r.raw), pngShade(r.composed)]), [[10,10],[80,90]]);
  assert.equal(p.bitmaps[1].closed, true); assert.equal(p.state().pins, 0);
  p.frame(190, 4000); await p.sample(); await p.drain();
  assert.deepEqual([...p.sent[2].facts.deferred_samples_not_retained], [3]);
  assert.equal(pngShade(p.sent[2].raw), 190, 'sample 3 is an explicit omission, never claimed to be this picture');
  console.log('PASS two-image queue, async pixel pinning and explicit overflow sample omission');
}
{
  const p = page();
  p.frame(10, 1000); await p.sample(); await p.drain();
  p.frame(80, 2000); await p.sample();
  p.frame(10, 3000); await p.sample(); await p.drain();
  assert.equal(p.sent.length, 2); assert.equal(p.sent[1].facts.reason, 'deferred');
  assert.deepEqual([...p.sent[1].facts.deferred_samples_not_retained], [2]);
  assert.equal(pngShade(p.sent[1].raw), 10);
  console.log('PASS A/B/A coalescing explicitly records omitted B instead of fabricating its PNG');
}
{
  const p = page(); p.failEncode(); p.frame(10,1000); await p.sample(); await p.drain();
  assert.equal(p.sent.length,0); assert.match(p.gaps[0].reason,/synthetic encode failure/);
  assert.equal(p.gaps[0].from_seq,1); assert.equal(p.state().pins,0);
  p.frame(10,3000); await p.sample(); await p.drain();
  assert.equal(p.sent.length,1); assert.equal(pngShade(p.sent[0].raw),10);
  console.log('PASS encode rejection creates a gap, frees pins and allows later current-frame retry');
}
{
  const p=page(), gate=defer(); p.encode(gate.promise);
  p.frame(10,1000); await p.sample();
  p.frame(80,2000); await p.sample();
  p.stop(); await flush();
  assert.equal(p.state().ended,true); assert.equal(p.acks.length,0);
  assert.equal(p.gaps[0].from_seq,2); assert.match(p.gaps[0].reason,/capture ended/);
  assert.equal(p.live.at(-1).state,'ended'); assert.equal(p.live.at(-1).raw,null);
  gate.resolve(); await p.drain(); await flush();
  assert.deepEqual(p.acks,[null]); assert.equal(p.sent.length,1);
  console.log('PASS renderer stop drains admitted encoding and records pending interval omission');
}
// Reproduce the two source/time metadata discrepancies; assertions describe the
// current defect and must be revised after the owner fixes the source.
{
  const p=page(); p.frame(10,1000.4); p.callback(1,980.6);
  await p.sample(5500); await p.drain();
  const f=p.sent[0].facts;
  assert.equal(p.live[0].gap_ms,5500); assert.equal(f.state,'gap');
  assert.equal(Object.hasOwn(f,'gap_ms'),false);
  assert.equal(f.monotonic_ms,1000); assert.equal(f.presentation_ms,981); assert.equal(f.frame_age_ms,20);
  assert.notEqual(f.frame_age_ms,f.monotonic_ms-f.presentation_ms);
  console.log('REPRO metadata: sample gap_ms=5500 omitted; measured rounded age=20 while header subtraction=19');
}
{
  const p=page(); p.frame(10,1000); await p.sample(); await p.drain();
  p.frame(10,9000); await p.sample(7000); await p.drain();
  assert.equal(p.live.at(-1).state,'gap'); assert.equal(p.live.at(-1).gap_ms,7000);
  p.stop(); await flush(); await p.drain(); await flush();
  assert.equal(p.sent.length,1); assert.equal(p.sent[0].facts.state,'fresh');
  assert.equal(p.gaps.length,0); assert.deepEqual(p.acks,[null]);
  console.log('REPRO known 7000 ms capture gap vanishes from retention when resumed pixels are unchanged');
}
