// The whole overlay.ts with the real main.ts (fakes for Electron, capture and canvas): a stroke's saved evidence
// carries its detail, and its alignment follows what is under it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, running } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DETAIL_CELLS } from '../src/shared/samples.ts';
import { parseDesktopInk, type DesktopInk } from '../src/shared/desktop-ink.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

test('a saved stroke carries the detail of what it was written over; unchanged it is verified, changed under it it is not', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  page.pointer('pointerdown', 1, 100, 100);
  page.pointer('pointermove', 1, 300, 100);
  page.pointer('pointerup', 1, 300, 100);
  await until('the stroke saved with its evidence', () => Object.values(page.saves.at(-1)?.evidence ?? {}).some((e) => e !== null));
  const saved = page.saves.at(-1) as DesktopInk;
  const id = saved.ink.visible[0]!;
  const detail = saved.evidence[id]?.detail;
  assert.ok(detail && detail.cols * detail.rows <= DETAIL_CELLS && Buffer.from(detail.luma, 'base64').length === detail.cols * detail.rows, 'saved and accepted by the main process');
  assert.equal(page.review.aligned()[id], 'verified');
  page.scene.shade = 120; // what is under the stroke changes
  await page.review.sample();
  assert.equal(page.review.aligned()[id], 'changed');
  page.scene.shade = 20;
  await page.review.sample();
  assert.equal(page.review.aligned()[id], 'verified', 'back as it was');
});

/** A 1280×800 grayscale screen with a strip of formulas (5×7 glyphs at 2 px per glyph pixel) from (200, 103) px. */
const GLYPHS: Record<string, string[]> = {
  x: ['00000', '10001', '01010', '00100', '01010', '10001', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00100', '00100', '00100', '11111', '00100', '00100', '00100'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
};
function screen(texts: string[]): Uint8Array {
  const out = new Uint8Array(1280 * 800).fill(245);
  texts.forEach((text, k) =>
    [...text].forEach((letter, c) =>
      GLYPHS[letter]!.forEach((row, y) =>
        [...row].forEach((bit, gx) => {
          if (bit === '1') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) out[(103 + y * 2 + dy) * 1280 + 200 + (k * 38 + c * 6 + gx) * 2 + dx] = 45;
        }),
      ),
    ),
  );
  return out;
}
const SAME = ['x-1=2', 'x-1=2', 'x-1=2', 'x-1=2', 'x-1=2'];

/** Writes one stroke over the formulas; while it is written the screen becomes `during`; then ASK over it. */
async function writeOver(during: string[]) {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  page.scene.luma = screen(SAME);
  await page.review.sample(); // a frame with the formulas
  page.pointer('pointerdown', 1, 205, 110);
  for (const x of [240, 280]) page.pointer('pointermove', 1, x, 110);
  page.scene.luma = screen(during); // the page changes in place while the stroke is written
  await page.review.sample();
  for (const x of [320, 380]) page.pointer('pointermove', 1, x, 110);
  page.pointer('pointerup', 1, 380, 110);
  await until('the stroke saved with its evidence and pictures', () => Object.values(page.saves.at(-1)?.evidence ?? {}).some((e) => e !== null) && page.review.retention().pinned === 0);
  await page.review.pending();
  const saved = page.saves.at(-1) as DesktopInk;
  const id = saved.ink.visible[0]!;
  await page.review.sample(); // the next sample composes with the stroke as drawn
  const marks = page.review.samples().at(-1)!.composed!.ink_marks;
  page.review.mode('ASK');
  page.pointer('pointerdown', 2, 190, 95);
  for (const [x, y] of [[400, 95], [400, 125], [190, 125]] as const) page.pointer('pointermove', 2, x, y);
  page.pointer('pointerup', 2, 192, 97);
  await until('the ASK card', () => page.review.card() !== null);
  const readBack = parseDesktopInk(JSON.parse(fs.readFileSync(path.join(h.userData, 'ink', `${saved.id}.json`), 'utf8')), saved.ink.page.address_sha256);
  assert.ok(readBack.ok, 'saved and read back strictly');
  return { evidence: readBack.ok ? readBack.doc.evidence[id]! : null, aligned: page.review.aligned()[id], marks, card: page.review.card()!.text };
}

test('QA-WIN-01 review: a formula changed in place while writing (x−1=2 → x+1=2, a separate 1 → 7, an answer 2 → 7; no pointer) is kept as a writing context, and the stroke is not verified on screen, in composed marks or in ASK', { timeout: 15000 }, async () => {
  for (const during of [['x+1=2', 'x-1=2', 'x-1=2', 'x-1=2', 'x-1=2'], ['x+1=2', 'x-7=2', 'x-1=2', 'x-1=2', 'x-1=2'], ['x-1=7', 'x-1=2', 'x-1=2', 'x-1=2', 'x-1=2']]) {
    const r = await writeOver(during);
    assert.equal(r.evidence!.contexts.length, 2, `${during.join(' ')}: the changed frame is a context`);
    assert.equal(r.evidence!.contexts[1]!.reason, 'changed_while_writing');
    assert.ok(r.evidence!.contexts[1]!.from_point > 0 && r.evidence!.contexts[1]!.frame_seq > r.evidence!.contexts[0]!.frame_seq);
    assert.equal(r.evidence!.changes_not_kept, 0);
    assert.notEqual(r.aligned, 'verified');
    assert.equal(r.marks.verified, 0, 'composed marks');
    assert.match(r.card, /1 of your strokes are drawn dashed/, 'ASK');
  }
});

test('the same formulas unchanged while writing: one context, verified, solid in composed marks and ASK', { timeout: 15000 }, async () => {
  const r = await writeOver(SAME);
  assert.equal(r.evidence!.contexts.length, 1);
  assert.equal(r.aligned, 'verified');
  assert.deepEqual(JSON.parse(JSON.stringify(r.marks)), { verified: 1, changed: 0, unknown: 0, following_content: 0 });
  assert.doesNotMatch(r.card, /drawn dashed/);
});

/** A 1280×800 screen with a patch of `under` under the stroke and a changing block far from it (every frame changes). */
function patched(under: number, tick: number): Uint8Array {
  const out = new Uint8Array(1280 * 800).fill(245);
  for (let y = 100; y < 122; y++) for (let x = 190; x < 420; x++) out[y * 1280 + x] = under;
  for (let y = 700; y < 720; y++) for (let x = 1000; x < 1020; x++) out[y * 1280 + x] = (tick * 37) % 200;
  return out;
}

/** Writes one stroke while the patch under it takes `values` (the first is the starting frame), then Stops; returns what main saved. */
async function capRun(values: number[]) {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  let tick = 0;
  page.scene.luma = patched(values[0]!, tick++);
  await page.review.sample();
  page.pointer('pointerdown', 1, 200, 110);
  let x = 200;
  for (const v of values.slice(1)) {
    page.pointer('pointermove', 1, (x += 15), 110); // writing continues after each observation
    page.scene.luma = patched(v, tick++);
    await page.review.sample();
  }
  page.pointer('pointermove', 1, (x += 15), 110);
  h.end('stopped by the test'); // Stop settles the stroke still being written, saves it, then confirms
  await until('the Stop confirmed', () => page.acks.length > 0, 5000);
  const doc = JSON.parse(fs.readFileSync(path.join(h.userData, 'ink', `${(s as unknown as { doc: { id: string } }).doc.id}.json`), 'utf8'));
  const read = parseDesktopInk(doc, doc.ink.page.address_sha256);
  assert.ok(read.ok, 'saved and read back strictly');
  const d = read.ok ? read.doc : null;
  const id = d!.ink.visible[0]!;
  return { acks: JSON.parse(JSON.stringify(page.acks)), evidence: d!.evidence[id]!, points: d!.ink.strokes[id]!.points.length, history: d!.ink.history.length, pinned: page.review.retention().pinned };
}

test('beyond the 8-context cap, each change under the stroke is counted once against what was seen before it: a repeat is not a change, a return is', { timeout: 20000 }, async () => {
  const fill = [0, 20, 40, 60, 80, 100, 120, 140]; // the starting frame and 7 changes (each beyond 16/255): 8 contexts, the last at 140
  const repeat = await capRun([...fill, 160, 160]);
  assert.equal(repeat.evidence.contexts.length, 8);
  assert.equal(repeat.evidence.changes_not_kept, 1, '140 → 160 → 160 is one change');
  const back = await capRun([...fill, 160, 140]);
  assert.equal(back.evidence.contexts.length, 8);
  assert.equal(back.evidence.changes_not_kept, 2, '140 → 160 → 140 is two changes');
  const many = await capRun([...fill, 160, 180, 180, 160, 160]);
  assert.equal(many.evidence.changes_not_kept, 3, '160, 180, back to 160');
  const onward = await capRun([...fill, 160, 180, 180]);
  assert.equal(onward.evidence.changes_not_kept, 2, 'each change is compared with the one before it, not with the first one counted');
  for (const [r, points] of [[repeat, 11], [back, 11], [many, 14], [onward, 12]] as const) {
    assert.equal(r.points, points, 'every written point kept');
    assert.deepEqual(r.acks, [null], 'the Stop confirmed with nothing unsaved');
    assert.deepEqual(r.evidence.contexts.map((c) => c.reason), ['writing_started', ...Array(7).fill('changed_while_writing')]);
    const from = r.evidence.contexts.map((c) => c.from_point);
    assert.ok(from.every((p, i) => i === 0 || p > from[i - 1]!), 'in order');
    assert.equal(r.history, 1, 'one stroke in the history');
    assert.equal(r.pinned, 0, 'every pinned frame released');
  }
});

test('below the cap nothing is counted: an unchanged frame adds no context, a change adds one', { timeout: 20000 }, async () => {
  const r = await capRun([20, 20, 40, 40, 20]);
  assert.deepEqual([r.evidence.contexts.length, r.evidence.changes_not_kept], [3, 0]);
});
