// Read-only source review. Synthetic grayscale frames; no Electron, browser, native capture or AI.
// Run with the project's pinned Node 24.21.0 and the exact candidate export as argv[2].
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2] ?? '/tmp/lc-windows-alignment-e03fefc');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replaceAll('\r\n', '\n');
const load = p => import(pathToFileURL(path.join(root, p)).href);
const samples = await load('apps/windows/src/shared/samples.ts');
const desktop = await load('apps/windows/src/shared/desktop-ink.ts');
const ink = await load('apps/safari-extension/src/ink.ts');
const source = read('apps/windows/src/renderer/overlay.ts');
function slice(start, end) {
  assert.equal(source.split(start).length, 2, `unique start: ${start}`);
  assert.equal(source.split(end).length, 2, `unique end: ${end}`);
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(b > a);
  return source.slice(a, b);
}
// Execute the unmodified actual comparison, context collection, evidence creation,
// recheck and ink-marks functions. Only canvas resampling/platform globals are substitutes.
const functions = slice('const regionOf =', '// ---- ink ---') +
  slice('function inkMarks(', '\n/**\n * One sample.');

// Portable area-average grayscale canvas. The detail grid in this test maps each
// 2x2 constant source block to one cell, so high-quality filtering cannot blur it away.
class Canvas {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    return {
      drawImage: (bitmap, x, y, width, height) => { this.draw = { bitmap, x, y, width, height }; },
      getImageData: () => {
        const { bitmap, x, y, width, height } = this.draw;
        const data = new Uint8ClampedArray(this.width * this.height * 4);
        for (let j = 0; j < this.height; j++) for (let i = 0; i < this.width; i++) {
          const ax = x + i * width / this.width, bx = x + (i + 1) * width / this.width;
          const ay = y + j * height / this.height, by = y + (j + 1) * height / this.height;
          let total = 0;
          for (let py = Math.floor(ay); py < Math.ceil(by); py++)
            for (let px = Math.floor(ax); px < Math.ceil(bx); px++)
              total += bitmap.luma[py * bitmap.width + px] *
                (Math.min(bx, px + 1) - Math.max(ax, px)) * (Math.min(by, py + 1) - Math.max(ay, py));
          const at = (j * this.width + i) * 4, value = Math.round(total / ((bx - ax) * (by - ay)));
          data.set([value, value, value, 255], at);
        }
        return { data };
      }
    };
  }
}
const glyphs = {
  x: ['00000','10001','01010','00100','01010','10001','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '+': ['00100','00100','00100','11111','00100','00100','00100'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '=': ['00000','00000','11111','00000','11111','00000','00000'],
  '2': ['01110','10001','00001','00010','00100','01000','11111']
};
function frame(formulas = ['x-1=2','x-1=2','x-1=2','x-1=2','x-1=2']) {
  const out = { width: 400, height: 32, luma: new Uint8Array(400 * 32).fill(245) };
  formulas.forEach((text, k) => [...text].forEach((letter, c) => {
    glyphs[letter].forEach((row, y) => [...row].forEach((bit, x) => {
      if (bit === '1') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
        out.luma[(8 + y * 2 + dy) * out.width + (6 + k * 38 + c * 6 + x) * 2 + dx] = 45;
    }));
  }));
  return out;
}
function withPointer(original, left) {
  const copy = { ...original, luma: original.luma.slice() };
  for (let y = 0; y < 14; y++) for (let x = 0; x <= Math.floor(y / 2); x++)
    copy.luma[y * copy.width + left + x] = 10;
  return copy;
}
const display = { display_id: 'synthetic', label: 'Synthetic formula strip', bounds: { x: 0, y: 0, width: 200, height: 16 }, scale_factor: 2 };
const sha = 'c'.repeat(64);
function run(before, after, { legacy = false } = {}) {
  const first = { seq: 1, at: '2026-09-30T00:00:00.000Z', bitmap: before };
  const second = { seq: 2, at: '2026-09-30T00:00:01.000Z', bitmap: after };
  const g = { kind: 'ink', open: true, points: [[8,8,0,0.5],[192,8,10,0.5]], contexts: [{ frame: first, from_point: 0, reason: 'writing_started' }], changesNotKept: 0 };
  const sandbox = {
    ...samples, MAX_CONTEXTS: desktop.MAX_CONTEXTS, NOT_OBSERVED: desktop.NOT_OBSERVED,
    MAX_CROP_PIXELS: 4_000_000, OffscreenCanvas: Canvas, display, gesture: g, raw: second,
    frameShas: new Map(), ended: false, pin() {}, unpin() {},
    doc: desktop.newDesktopInk('0123456789abcdef', sha, first.at, display),
  };
  vm.createContext(sandbox);
  vm.runInContext(stripTypeScriptTypes(functions) + '\nthis.probe = { regionOf, detailOf, contentChanged, noteContextChange, strokeEvidence, recheckAlignment, inkMarks, unsure, aligned, releaseGesture };', sandbox);
  const p = sandbox.probe, region = p.regionOf(g.points);
  const a = p.detailOf(region, before), b = p.detailOf(region, after, a);
  const comparison = samples.detailChange(a, b);
  const material = p.contentChanged(region, before, after);
  p.noteContextChange();
  g.points.push([150,8,20,0.5]); // Continue writing on the changed frame before ending.
  const result = p.strokeEvidence(g);
  assert(result);
  if (legacy) delete result.evidence.detail;
  const stroke = { id: 'stroke', input: 'pen', display: 'screen', points: g.points,
    created_at: first.at, source: { title: display.label, viewport: { width: 200, height: 16, dpr: 2 }, scroll: { x: 0, y: 0 } }, anchor: null, derived_from: null };
  sandbox.doc.ink = ink.addStroke(sandbox.doc.ink, stroke, first.at);
  sandbox.doc.evidence = { stroke: result.evidence };
  const serialized = JSON.parse(JSON.stringify(sandbox.doc));
  const readback = desktop.parseDesktopInk(serialized, sha);
  assert.equal(readback.ok, true);
  assert.deepEqual(readback.doc, serialized);
  p.recheckAlignment();
  return {
    changed_cells: [...a.luma].filter((v, i) => Math.abs(v - b.luma[i]) > samples.DETAIL_DELTA).length,
    grid: [a.cols, a.rows], comparison, material, contexts: result.evidence.contexts.length,
    context_frames: result.evidence.contexts.map(c => c.frame_seq),
    changes_not_kept: result.evidence.changes_not_kept,
    alignment: p.aligned.get('stroke'), dashed: p.unsure(stroke),
    marks: p.inkMarks(sandbox.doc.ink), legacy_readback: legacy,
  };
}
const original = frame();
const cases = [
  ['unchanged', original, original, {}, 'same', 'verified'],
  ['noise_plus_minus_6', original, { ...original, luma: original.luma.map((v, i) => v + (i % 2 ? 6 : -6)) }, {}, 'same', 'verified'],
  ['formula_minus_to_plus_no_cursor', original, frame(['x+1=2','x-1=2','x-1=2','x-1=2','x-1=2']), {}, 'changed', 'changed'],
  ['formula_sign_and_separate_digit_no_cursor', original, frame(['x+1=2','x-1=2','x-1=2','x-7=2','x-1=2']), {}, 'changed', 'changed'],
  ['actual_synthetic_pointer_moves', withPointer(original, 30), withPointer(original, 340), {}, 'changed', 'changed'],
  ['large_content_change', original, { ...original, luma: original.luma.map(v => 255 - v) }, {}, 'changed', 'changed'],
  ['legacy_unchanged', original, original, { legacy: true }, 'same', 'unknown'],
  ['legacy_large_content_change', original, { ...original, luma: original.luma.map(v => 255 - v) }, { legacy: true }, 'changed', 'changed'],
  ['blank_pointer_moves', withPointer({ ...original, luma: new Uint8Array(12800).fill(245) }, 30), withPointer({ ...original, luma: new Uint8Array(12800).fill(245) }, 340), {}, 'changed', 'changed'],
];
for (const [name, before, after, options, comparison, alignment] of cases) {
  const result = run(before, after, options);
  assert.equal(result.comparison, comparison, name);
  assert.equal(result.alignment, alignment, name);
  if (name.includes('no_cursor')) {
    assert(result.changed_cells > 0);
    assert.equal(result.material, true);
    assert.equal(result.contexts, 2);
    assert.equal(result.changes_not_kept, 0);
    assert.equal(result.dashed, true);
    assert.equal(result.marks.verified, 0);
  }
  if (name === 'large_content_change') {
    assert.equal(result.material, true);
    assert.equal(result.contexts, 2);
  }
  console.log(JSON.stringify({ name, ...result }));
}
console.log('PASS: 9 deterministic source-path regressions; local signs/digits and moving pointers are changed, kept as contexts and dashed. Synthetic canvas only.');

// Cap boundary: production noteContextChange compares to the last retained context.
// Each sampled frame here is distinct; identical local pixels are permitted across samples.
function cappedSequence() {
  const before=frame();
  const g={kind:'ink', open:true, points:[[8,8,0,.5],[192,8,10,.5]], contexts:[{frame:{seq:1,at:'t',bitmap:before},from_point:0,reason:'writing_started'}],changesNotKept:0};
  const pins=new Map([[before,1]]);
  const box={...samples,MAX_CONTEXTS:desktop.MAX_CONTEXTS,NOT_OBSERVED:desktop.NOT_OBSERVED,MAX_CROP_PIXELS:4_000_000,OffscreenCanvas:Canvas,display,gesture:g,raw:g.contexts[0].frame,frameShas:new Map(),ended:false,doc:desktop.newDesktopInk('0123456789abcdef',sha,'t',display),pin(b){pins.set(b,(pins.get(b)||0)+1)},unpin(b){assert(pins.get(b)>0);if(pins.get(b)===1)pins.delete(b);else pins.set(b,pins.get(b)-1)}};
  vm.createContext(box);
  vm.runInContext(stripTypeScriptTypes(functions)+'\nthis.probe={noteContextChange,strokeEvidence,recheckAlignment,aligned,releaseGesture};',box);
  const values=[];
  function step(value) {
    const bitmap=frame();
    for(let y=0;y<4;y++) for(let x=380;x<388;x++) bitmap.luma[y*400+x]=value;
    box.raw={seq:values.length+2,at:'t',bitmap};
    box.probe.noteContextChange();
    g.points.push([150,8,g.points.length*10,.5]);
    values.push({value,contexts:g.contexts.length,count:g.changesNotKept});
  }
  for(const value of [20,40,60,80,100,120,140])step(value);
  assert.equal(g.contexts.length,8);assert.equal(g.changesNotKept,0);
  step(160); // one unretained change
  const afterFirst=g.changesNotKept;
  step(160); // distinct new frame, no local change
  const afterSame=g.changesNotKept;
  step(140); // a real change back to the last retained image
  const afterReturn=g.changesNotKept;
  const result=box.probe.strokeEvidence(g);
  assert.equal(result.evidence.contexts.length,8);
  assert.equal(afterFirst,1);assert.equal(afterSame,2);assert.equal(afterReturn,2);
  // Keep originals and release their exact pins; no additional context beyond the cap.
  assert.equal(pins.size,8);
  box.probe.releaseGesture(g);assert.equal(pins.size,0);
  console.log(JSON.stringify({name:'cap_counter_boundary',afterFirst,afterSame,afterReturn,contexts:result.evidence.contexts.length,values}));
  console.log('DIAGNOSTIC: the cap stays at 8 and releases pins, but an unchanged later frame increments the omitted-change count; returning to the last retained pixels does not increment it.');
}
cappedSequence();
