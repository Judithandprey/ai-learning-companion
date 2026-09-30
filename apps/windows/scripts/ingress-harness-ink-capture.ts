// A retention record whose composed frames carry the exact editable ink they were drawn from. It comes from the
// real main.ts and overlay.ts under the unit-test fakes (Electron, capture and canvas faked; the files, including
// each ink original, are real), for the WindowsFrame ingress fixtures only: it is not a native capture.
//
// 1. the first frame, before any ink; 2. a stroke, then a frame drawn with it; 3. a frame whose encoding is held back
// while a second stroke, a partial erase, an undo and a redo follow (its ink original stays the one it was drawn
// from); 4. a frame taken while a stroke is still being written (in neither the composition nor its ink original);
// 5. Stop, which writes what was queued and ends the record.
//
//   node scripts/ingress-harness-ink-capture.ts <destination folder>
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { deferred, harness, running } from '../tests/main-harness.ts';
import { overlayPage, until } from '../tests/overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/ingress-harness-ink-capture.ts <destination folder>');
const h = harness();
const s = await running(h);
const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
const step = async (shade: number): Promise<void> => {
  page.scene.shade = shade;
  await page.review.sample();
  await page.review.retention().queue;
};
const stroke = (id: number, y: number): void => {
  page.pointer('pointerdown', id, 100, y);
  for (const x of [140, 180, 220]) page.pointer('pointermove', id, x, y);
  page.pointer('pointerup', id, 220, y);
};
await step(20); // 1
stroke(1, 200);
await page.review.pending();
await step(60); // 2
const gate = deferred<void>();
page.encoding.gate = gate.promise;
page.scene.shade = 100;
await page.review.sample(); // 3: composed with the first stroke only; its encoding waits
stroke(2, 260);
page.click('eraser');
page.pointer('pointerdown', 3, 160, 190);
page.pointer('pointermove', 3, 160, 210);
page.pointer('pointerup', 3, 160, 210);
page.click('pen');
page.click('undo');
page.click('redo');
gate.resolve();
page.encoding.gate = null;
await page.review.retention().queue;
await page.review.pending();
page.pointer('pointerdown', 4, 100, 320); // 4: a stroke still being written
page.pointer('pointermove', 4, 150, 320);
await step(140);
page.pointer('pointerup', 4, 150, 320);
await page.review.pending();
h.end('stopped by the fixture'); // 5
await until('the Stop confirmed', () => page.acks.length > 0, 5000);
rmSync(out, { recursive: true, force: true });
cpSync(join(h.userData, 'captures', (s as unknown as { doc: { id: string } }).doc.id), out, { recursive: true });
console.log(`retention record with ink originals written to ${out}`);
