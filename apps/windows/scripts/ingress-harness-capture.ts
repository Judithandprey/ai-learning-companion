// A retention record with the events the native sample does not show: known sampling gaps (one with the same
// pixels, one retained), a torn append counted as an unwritten line, and a frame lost when the Stop bound ended the
// overlay. It comes from the real main.ts and overlay.ts under the unit-test fakes (Electron, capture and canvas
// faked; the files are real), for the WindowsFrame ingress fixtures only: it is not a native capture.
//
//   node scripts/ingress-harness-capture.ts <destination folder>
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { deferred, harness, running } from '../tests/main-harness.ts';
import { overlayPage, until } from '../tests/overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/ingress-harness-capture.ts <destination folder>');
const h = harness();
const s = await running(h);
const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
const step = async (shade: number, late = 0): Promise<void> => {
  page.scene.shade = shade;
  await page.review.sample(late);
  await page.review.retention().queue;
};
await step(20); // the first frame, retained
await page.review.sameFrameLate(7000); // late by 7 s with the same pixels: a gap line only
await step(200, 5500); // late by 5.5 s with a change: a gap line and a retained gap frame
h.failWrites.partialAppend = 23; // this frame's manifest line is torn by a full disk: cut back, counted, retried
await step(120);
await step(60); // retained, after the unwritten line
const gate = deferred<void>();
page.encoding.gate = gate.promise;
page.scene.shade = 160;
await page.review.sample(); // being encoded when the Stop comes, and never finished
h.end('stopped by the fixture');
await until('the Stop to reach the overlay', () => page.review.state().ended);
h.fire(10_000); // the overlay completed nothing since: the Stop bound ends it
gate.resolve();
rmSync(out, { recursive: true, force: true });
cpSync(join(h.userData, 'captures', (s as unknown as { doc: { id: string } }).doc.id), out, { recursive: true });
console.log(`retention record written to ${out}`);
