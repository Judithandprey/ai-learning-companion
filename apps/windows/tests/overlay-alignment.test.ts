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
