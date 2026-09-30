// The DOM-free parts of the Windows app: desktop ink documents and display samples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStroke, erase, undo, type InkStroke } from '../../safari-extension/src/ink.ts';
import { contextImages, forkDesktopInk, newDesktopInk, NOT_OBSERVED, parseDesktopInk, summarize, type DesktopDisplay, type StrokeContext } from '../src/shared/desktop-ink.ts';
import { alignmentOf, DETAIL_CELLS, detailChange, detailGrid, fingerprintFromBase64, fingerprintToBase64, lumaChange, luminance, SAME_PIXELS, sampleState, spotCells, toFramePixels } from '../src/shared/samples.ts';

const SHA = 'c'.repeat(64);
const DISPLAY: DesktopDisplay = { display_id: '2528732444', label: 'Display 1', bounds: { x: 0, y: 0, width: 1280, height: 800 }, scale_factor: 1.5 };
const stroke = (id: string, y: number): InkStroke => ({
  id,
  input: 'pen',
  display: 'screen',
  points: [[10, y, 0, 0.5], [200, y, 30, 0.6]],
  created_at: '2026-09-30T10:00:00.000Z',
  source: { title: 'Display 1', viewport: { width: 1280, height: 800, dpr: 1.5 }, scroll: { x: 0, y: 0 } },
  anchor: null,
  derived_from: null,
});
const IMG = 'a'.repeat(64);
const context = (reason: StrokeContext['reason'], from_point: number, frame_seq: number): StrokeContext => ({
  reason,
  from_point,
  frame_seq,
  frame_taken_at: '2026-09-30T10:00:00.000Z',
  frame_pixels_sha256: null,
  region: { x: 0, y: 60, width: 250, height: 80 },
  region_px: { x: 0, y: 90, width: 375, height: 120 },
  image: { sha256: IMG, width: 375, height: 120 },
  not_observed: NOT_OBSERVED,
});
const evidence = { frame_seq: 3, frame_sampled_at: '2026-09-30T10:00:00.000Z', region: { x: 2, y: 92, width: 206, height: 16 }, fingerprint: fingerprintToBase64(new Uint8Array(256).fill(200)), contexts: [context('writing_started', 0, 3)], changes_not_kept: 0 };

test('a desktop session document reads back strictly, with its editable history and pixel evidence', () => {
  let doc = newDesktopInk('0123456789abcdef', SHA, '2026-09-30T10:00:00.000Z', DISPLAY);
  const ink = erase(addStroke(doc.ink, stroke('a', 100), 't'), { screen: [[100, 90], [100, 110]] }, 5, 't', ((n) => () => `p${++n}`)(0));
  doc = { ...doc, ink: undo(ink, 't'), evidence: { a: evidence } };
  const read = parseDesktopInk(JSON.parse(JSON.stringify(doc)), SHA);
  assert.ok(read.ok);
  if (read.ok) assert.deepEqual(read.doc, doc);
  assert.deepEqual(summarize(doc), { id: '0123456789abcdef', created_at: '2026-09-30T10:00:00.000Z', forked_from: null, display_label: 'Display 1', strokes: 1, revision: 3 });
});

test('a forked copy keeps the whole ink, history and evidence under its own session id', () => {
  const doc = { ...newDesktopInk('0123456789abcdef', SHA, 't', DISPLAY), evidence: { a: evidence } };
  const withInk = { ...doc, ink: addStroke(doc.ink, stroke('a', 100), 't') };
  const copy = forkDesktopInk(withInk, 'fedcba9876543210', 'e'.repeat(64), 'later');
  const read = parseDesktopInk(JSON.parse(JSON.stringify(copy)), 'e'.repeat(64));
  assert.ok(read.ok);
  if (!read.ok) return;
  assert.equal(read.doc.forked_from, '0123456789abcdef');
  assert.deepEqual(read.doc.ink.history, withInk.ink.history);
  assert.deepEqual(read.doc.evidence, withInk.evidence);
  assert.equal(parseDesktopInk(JSON.parse(JSON.stringify(copy)), SHA).ok, false, 'the copy is not the original session');
  assert.equal(parseDesktopInk({ ...JSON.parse(JSON.stringify(copy)), forked_from: 'fedcba9876543210' }, 'e'.repeat(64)).ok, false, 'not a copy of itself');
});

test('a desktop session document is refused when it is not what this version writes', () => {
  const doc = { ...newDesktopInk('0123456789abcdef', SHA, 't', DISPLAY), ink: addStroke(newDesktopInk('0123456789abcdef', SHA, 't', DISPLAY).ink, stroke('a', 100), 't'), evidence: { a: evidence } };
  const json = JSON.parse(JSON.stringify(doc));
  assert.equal(parseDesktopInk(json, 'd'.repeat(64)).ok, false, 'another session');
  assert.equal(parseDesktopInk({ ...json, format: 'x' }, SHA).ok, false);
  assert.equal(parseDesktopInk({ ...json, id: 'ABC' }, SHA).ok, false);
  assert.equal(parseDesktopInk({ ...json, evidence: { ghost: evidence } }, SHA).ok, false, 'evidence for an unknown stroke');
  assert.equal(parseDesktopInk({ ...json, evidence: { a: { ...evidence, fingerprint: 'short' } } }, SHA).ok, false);
  const detail = { cols: 3, rows: 2, luma: fingerprintToBase64(Uint8Array.of(1, 2, 3, 4, 5, 6)) };
  assert.equal(parseDesktopInk({ ...json, evidence: { a: { ...evidence, detail } } }, SHA).ok, true, 'with its detail');
  for (const bad of [{ ...detail, rows: 3 }, { ...detail, cols: 0 }, { ...detail, luma: 'AQID*AUG' }, { ...detail, cols: 64, rows: 65, luma: fingerprintToBase64(new Uint8Array(64 * 65)) }, { cols: 3, rows: 2 }]) {
    assert.equal(parseDesktopInk({ ...json, evidence: { a: { ...evidence, detail: bad } } }, SHA).ok, false, JSON.stringify(bad).slice(0, 60));
  }
  const anchored = JSON.parse(JSON.stringify(json));
  anchored.ink.strokes.a.anchor = { text_hash: 'x', rect: { x: 0, y: 0, width: 1, height: 1 }, media_time: null, opaque: false };
  assert.equal(parseDesktopInk(anchored, SHA).ok, false, 'no web anchor is pretended on the desktop');
  const hiddenAnchored = JSON.parse(JSON.stringify({ ...doc, ink: undo(doc.ink, 't') }));
  hiddenAnchored.ink.strokes.a.anchor = anchored.ink.strokes.a.anchor;
  assert.equal(parseDesktopInk(hiddenAnchored, SHA).ok, false, 'nor on a hidden stroke that redo would show again');
});

test('sample states: fresh frame, no new frame (still or stalled), a late period is a gap, the end ends', () => {
  assert.deepEqual(sampleState({ ended: false, newFrame: true, lateMs: 20, periodMs: 1000 }), { state: 'fresh', gap_ms: null });
  assert.deepEqual(sampleState({ ended: false, newFrame: false, lateMs: 20, periodMs: 1000 }), { state: 'no_new_frame', gap_ms: null });
  assert.deepEqual(sampleState({ ended: false, newFrame: true, lateMs: 2400, periodMs: 1000 }), { state: 'gap', gap_ms: 2400 });
  assert.deepEqual(sampleState({ ended: true, newFrame: true, lateMs: 0, periodMs: 1000 }), { state: 'ended', gap_ms: null });
});

test('a DIP region maps onto the frame at its scale, clipped', () => {
  assert.deepEqual(toFramePixels({ x: 10, y: 20, width: 100, height: 50 }, { width: 1280, height: 800 }, { width: 1920, height: 1200 }), { x: 15, y: 30, width: 150, height: 75 });
  assert.deepEqual(toFramePixels({ x: 1270, y: 790, width: 50, height: 50 }, { width: 1280, height: 800 }, { width: 1280, height: 800 }), { x: 1270, y: 790, width: 10, height: 10 });
  assert.equal(toFramePixels({ x: 1300, y: 0, width: 10, height: 10 }, { width: 1280, height: 800 }, { width: 1280, height: 800 }), null);
});

test('luminance fingerprints: round trip and change', () => {
  const l = luminance([255, 255, 255, 255, 0, 0, 0, 255]);
  assert.deepEqual([...l], [255, 0]);
  const a = new Uint8Array(256).fill(10);
  assert.deepEqual(fingerprintFromBase64(fingerprintToBase64(a)), a);
  assert.equal(fingerprintToBase64(a).length, 344);
  assert.equal(lumaChange(a, a), 0);
  assert.equal(lumaChange(a, new Uint8Array(256).fill(10 + 51)), 0.2);
});

/** A page of text-like lines (dark glyphs of random widths on light paper), luminance, `w` px wide; seeded. */
function textPage(w: number, h: number, seed: number): Uint8Array {
  let x = seed;
  const rand = (): number => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const img = new Uint8Array(w * h).fill(245);
  for (let top = 8; top + 22 < h; top += 40) {
    for (let cx = 10; cx < w - 24; cx += 8) {
      const letters = 4 + Math.floor(rand() * 5);
      for (let k = 0; k < letters && cx < w - 24; k++) {
        const width = 8 + Math.floor(rand() * 3);
        const bars = [0, 4 + Math.floor(rand() * 8), 13 + Math.floor(rand() * 7)];
        for (let y = top; y < top + 22; y++) {
          for (let dx = 0; dx < width - 2; dx++) if (dx < 2 || dx >= width - 4 || bars.some((b) => y - top >= b && y - top < b + 2)) img[y * w + cx + dx] = 45;
        }
        cx += width;
      }
    }
  }
  return img;
}
/** The w×h px region at (x, y) of a page `pw` wide, averaged into cols×rows cells. */
function cells(page: Uint8Array, pw: number, x: number, y: number, w: number, h: number, cols: number, rows: number): Uint8Array {
  const sum = new Float64Array(cols * rows);
  const n = new Float64Array(cols * rows);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const c = Math.floor((yy * rows) / h) * cols + Math.floor((xx * cols) / w);
      sum[c] = sum[c]! + page[(y + yy) * pw + x + xx]!;
      n[c] = n[c]! + 1;
    }
  }
  return Uint8Array.from(sum, (v, i) => Math.round(v / n[i]!));
}
/** The mouse pointer (an arrow, 24×38 px as at 200 %) drawn into a copy of the page at (px, py). */
function withPointer(page: Uint8Array, pw: number, px: number, py: number): Uint8Array {
  const out = Uint8Array.from(page);
  for (let dy = 0; dy < 38; dy++) for (let dx = 0; dx <= Math.min(dy * 0.63, 23); dx++) out[(py + dy) * pw + px + dx] = dx === 0 || dx >= Math.min(dy * 0.63, 23) - 1 || dy === 37 ? 0 : 255;
  return out;
}
const PW = 1400;
const PAGE = textPage(PW, 3200, 7);
/** What the app keeps and compares for a region (px, at 2 px per DIP): its fingerprint and its detail. */
const seen = (page: Uint8Array, x: number, y: number, w: number, h: number) => {
  const g = detailGrid(w, h);
  return { coarse: cells(page, PW, x, y, w, h, 16, 16), detail: { ...g, luma: cells(page, PW, x, y, w, h, g.cols, g.rows) }, widthDip: w / 2 };
};
const aligned = (then: ReturnType<typeof seen>, now: ReturnType<typeof seen>): string => alignmentOf(then.coarse, now.coarse, { then: then.detail, now: now.detail, spot: spotCells(then.widthDip, then.detail.cols) });

test('QA-WIN-01: a line of text replaced by another under a narrow stroke is changed, though its 16×16 fingerprint barely moved', () => {
  // As in QA's run: a stroke 201×16 DIP over a line of body text; the page scrolls 300 DIP (600 px) under it,
  // and the line that arrives averages, at 16×16, like the one that left.
  const then = seen(PAGE, 90, 1603, 402, 32);
  const now = seen(PAGE, 90, 2203, 402, 32);
  assert.ok(lumaChange(then.coarse, now.coarse) < SAME_PIXELS, `the fingerprint alone would read it as unchanged (${lumaChange(then.coarse, now.coarse).toFixed(3)})`);
  assert.equal(aligned(then, now), 'changed');
  assert.equal(alignmentOf(then.coarse, now.coarse), 'unknown', 'ink with only the fingerprint is not verified');
  for (const shift of [40, 80, 200, 1000]) assert.equal(aligned(then, seen(PAGE, 90, 1603 + shift, 402, 32)), 'changed', `scrolled ${shift} px`);
});

test('the same content verifies, also with the mouse pointer where it was when the stroke began and where it is now', () => {
  const then = seen(withPointer(PAGE, PW, 100, 1000), 90, 1003, 402, 32);
  assert.equal(aligned(then, seen(withPointer(PAGE, PW, 100, 1000), 90, 1003, 402, 32)), 'verified');
  assert.equal(aligned(then, seen(PAGE, 90, 1003, 402, 32)), 'verified', 'the pointer went away');
  assert.equal(aligned(then, seen(withPointer(PAGE, PW, 460, 1010), 90, 1003, 402, 32)), 'verified', 'the pointer is at the end of the stroke now');
  const large = seen(PAGE, 100, 1000, 800, 400);
  assert.equal(aligned(large, seen(withPointer(withPointer(PAGE, PW, 300, 1200), PW, 700, 1100), 100, 1000, 800, 400)), 'verified', 'two pointers over a large region');  let x = 3;
  const noisy = PAGE.map((v) => Math.max(0, Math.min(255, v + ((x = (x * 69069 + 1) % 4294967296) % 13) - 6))); // ±6 levels everywhere
  assert.equal(aligned(then, seen(noisy, 90, 1003, 402, 32)), 'verified', 'slight rendering noise');
});

test('pointer images close together (a closed circle) or over a blank area do not count as a change', () => {
  const then = seen(withPointer(PAGE, PW, 100, 1000), 90, 1003, 402, 32);
  // Offsets where the two pointer images overlap and their difference breaks into several pieces, and farther ones.
  for (const [dx, dy] of [[2, 2], [2, 4], [-4, -6], [6, 10], [-8, -12], [18, 12], [30, 0], [0, 16]] as const) {
    assert.equal(aligned(then, seen(withPointer(PAGE, PW, 100 + dx, 1000 + dy), 90, 1003, 402, 32)), 'verified', `ended ${dx},${dy} px from where it began`);
  }
  const blank = new Uint8Array(PW * 3200).fill(245);
  const onBlank = seen(withPointer(blank, PW, 100, 1000), 90, 1003, 402, 32);
  const moved = seen(withPointer(blank, PW, 400, 1004), 90, 1003, 402, 32);
  assert.equal(detailChange(onBlank.detail, moved.detail, spotCells(onBlank.widthDip, onBlank.detail.cols)), 'unclear', 'not a material change while writing');
  assert.equal(aligned(onBlank, moved), 'unknown', 'only the pointer was there to compare: not known, not changed');
});

test('large regions: text scrolled under a large stroke is changed, though the fingerprint change is diluted; unchanged text verifies', () => {
  for (const [w, h] of [[800, 400], [1200, 1000]] as const) {
    const then = seen(PAGE, 100, 1000, w, h);
    assert.equal(aligned(then, seen(PAGE, 100, 1000, w, h)), 'verified', `${w}×${h} unchanged`);
    for (const shift of [40, 600]) {
      const now = seen(PAGE, 100, 1000 + shift, w, h);
      assert.equal(aligned(then, now), 'changed', `${w}×${h} scrolled ${shift} px (fingerprint change ${lumaChange(then.coarse, now.coarse).toFixed(3)})`);
    }
  }
});

test('a small stroke whose word was replaced, or whose text left, is not verified; plain or missing pixels are unknown', () => {
  const word = seen(PAGE, 14, 1003, 80, 40);
  assert.equal(aligned(word, seen(PAGE, 14, 1403, 80, 40)), 'changed', 'another word');
  const blank = new Uint8Array(PW * 3200).fill(245);
  assert.equal(aligned(word, seen(blank, 14, 1003, 80, 40)), 'changed', 'the text left');
  assert.equal(aligned(seen(blank, 14, 1003, 80, 40), seen(blank, 14, 1003, 80, 40)), 'unknown', 'a blank margin cannot show that content stayed');
  assert.equal(alignmentOf(null, null, { then: word.detail, now: null, spot: 1 }), 'unknown', 'no current frame');
});

test('ink with only the 16×16 fingerprint (saved before details were kept) is never verified; a large change still shows', () => {
  const textured = Uint8Array.from({ length: 256 }, (_, i) => ((i >> 2) % 2 ? 180 : 100));
  const moved = Uint8Array.from({ length: 256 }, (_, i) => ((i >> 2) % 2 ? 100 : 180));
  assert.equal(alignmentOf(textured, textured), 'unknown');
  assert.equal(alignmentOf(textured, moved), 'changed');
  assert.equal(alignmentOf(new Uint8Array(256).fill(250), new Uint8Array(256).fill(250)), 'unknown');
  assert.equal(alignmentOf(textured, null), 'unknown');
  assert.equal(alignmentOf(null, textured), 'unknown');
});

test('detail grids: square cells of at least 2 px, never more than DETAIL_CELLS; the change of grids of different sizes is a change', () => {
  for (const [w, h] of [[402, 32], [800, 400], [2560, 1600], [4, 3], [5000, 16]] as const) {
    const g = detailGrid(w, h);
    assert.ok(g.cols >= 1 && g.rows >= 1 && g.cols * g.rows <= DETAIL_CELLS, `${w}×${h} → ${g.cols}×${g.rows}`);
    if (w >= 4 && h >= 4) assert.ok(w / g.cols >= 2 && h / g.rows >= 2);
  }
  const a = { cols: 2, rows: 2, luma: Uint8Array.of(1, 2, 3, 4) };
  assert.equal(detailChange(a, { cols: 4, rows: 1, luma: Uint8Array.of(1, 2, 3, 4) }, 1), 'changed');
});

test('stroke contexts: the starting picture first, then changes while writing, in order, with what was not observed', () => {
  const base = newDesktopInk('0123456789abcdef', SHA, 't', DISPLAY);
  const doc = { ...base, ink: addStroke(base.ink, stroke('a', 100), 't') };
  const withContexts = (contexts: unknown[], extra: Record<string, unknown> = {}) => JSON.parse(JSON.stringify({ ...doc, evidence: { a: { ...evidence, contexts, ...extra } } }));
  const changed = context('changed_while_writing', 1, 4);
  const ok = parseDesktopInk(withContexts([context('writing_started', 0, 3), { ...changed, image: { sha256: 'b'.repeat(64), width: 10, height: 10 } }]), SHA);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(contextImages(ok.doc).sort(), ['a'.repeat(64), 'b'.repeat(64)]);
  assert.ok(parseDesktopInk(withContexts([{ ...context('writing_started', 0, 3), image: null }]), SHA).ok, 'a picture that could not be made is null');
  assert.equal(parseDesktopInk(withContexts([]), SHA).ok, false, 'evidence always has its starting context');
  assert.equal(parseDesktopInk(withContexts([changed]), SHA).ok, false, 'the first context is where writing started');
  assert.equal(parseDesktopInk(withContexts([context('writing_started', 0, 2)]), SHA).ok, false, 'the evidence is the starting context');
  assert.equal(parseDesktopInk(withContexts([context('writing_started', 0, 3), context('changed_while_writing', 0, 4)]), SHA).ok, false, 'a change starts after the first point');
  assert.equal(parseDesktopInk(withContexts([context('writing_started', 0, 3), context('changed_while_writing', 2, 4)]), SHA).ok, false, 'within the stroke');
  assert.equal(parseDesktopInk(withContexts([{ ...context('writing_started', 0, 3), not_observed: [] }]), SHA).ok, false, 'unknown source facts are stated');
  assert.equal(parseDesktopInk(withContexts([context('writing_started', 0, 3)], { changes_not_kept: -1 }), SHA).ok, false);
});
