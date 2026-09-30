// The whole overlay.ts with the real main.ts (fakes for Electron, capture and canvas): a stroke's saved evidence
// carries its detail, and its alignment follows what is under it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, running } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DETAIL_CELLS } from '../src/shared/samples.ts';
import type { DesktopInk } from '../src/shared/desktop-ink.ts';

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
