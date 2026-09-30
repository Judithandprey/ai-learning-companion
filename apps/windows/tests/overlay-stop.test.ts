// The whole overlay.ts, run against the real main.ts (both with Electron, the browser's capture and canvas
// replaced by fakes): once a Stop begins, the overlay takes no new input, the stroke being written before it is
// kept, and the Stop is confirmed only after that is saved. Nothing written on screen disappears.
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import * as desktopInk from '../src/shared/desktop-ink.ts';
import * as retention from '../src/shared/retention.ts';
import { deferred, harness, plain, running } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';

test('after Stop begins, no new writing is accepted; the stroke written before it is kept and saved before the Stop is confirmed', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  const gate = deferred<void>();
  page.encoding.gate = gate.promise;
  page.pointer('pointerdown', 1, 10, 10);
  page.pointer('pointermove', 1, 40, 40);
  h.end('stopped by the user');
  await until('the Stop to reach the overlay', () => page.review.state().ended);
  await until('the stroke to be committed', () => page.review.state().doc.ink.revision === 1);
  assert.deepEqual(page.acks, [], 'the Stop waits for the stroke written before it (its picture is still being encoded)');
  page.pointer('pointerdown', 2, 70, 70); // a new pen-down while that stroke is being saved
  page.pointer('pointermove', 2, 100, 100);
  assert.equal(page.review.state().gesture, null, 'not accepted: nothing new appears on screen');
  const revision = page.review.state().doc.ink.revision;
  page.click('undo');
  assert.equal(page.review.state().doc.ink.revision, revision, 'undo is not accepted either');
  assert.equal(page.undoDisabled(), true);
  assert.match(page.hint(), /takes no new input/);
  gate.resolve();
  await until('the Stop to be confirmed', () => page.acks.length > 0);
  assert.deepEqual(page.acks, [null], 'confirmed, with nothing unsaved');
  assert.equal(s.overlay.destroyed, true);
  const saved = page.saves.at(-1)!;
  assert.equal(saved.ink.visible.length, 1, 'the stroke written before the Stop');
  assert.deepEqual(plain(saved.ink.strokes[saved.ink.visible[0]!]!.points), [[10, 10, 0, 0.5], [40, 40, 10, 0.5]]);
  assert.equal(saved.evidence[saved.ink.visible[0]!]?.contexts[0]?.image !== null, true, 'with its context picture');
  assert.equal((plain(h.recoveryInfo()) as unknown[]).length, 0);
});

test('when the capture ends by itself, new writing is refused at once, before the Stop arrives', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  page.review.endCapture('Windows stopped delivering this display');
  page.pointer('pointerdown', 1, 10, 10);
  page.pointer('pointermove', 1, 40, 40);
  assert.equal(page.review.state().gesture, null);
  assert.equal(page.review.state().doc.ink.revision, 0);
});

test('a whole-display frame queued for retention when Stop comes is still written, before the Stop is confirmed and the end is recorded', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s);
  const gate = deferred<void>();
  page.encoding.gate = gate.promise;
  await page.review.sample(); // the first frame: retained, its PNGs still being encoded
  h.end('stopped by the user');
  await until('the Stop to reach the overlay', () => page.review.state().ended);
  assert.deepEqual(page.acks, [], 'the Stop waits for the frame observed before it');
  gate.resolve();
  await until('the Stop to be confirmed', () => page.acks.length > 0);
  const manifest = fs.readFileSync(path.join(page.userData, 'captures', page.captureId, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string; raw?: { file: string; width: number } });
  assert.deepEqual(manifest.map((l) => l.kind), ['header', 'retained', 'ended']);
  const retained = manifest[1]!;
  assert.equal(retained.raw!.width, 1280);
  assert.ok(fs.existsSync(path.join(page.userData, 'captures', page.captureId, retained.raw!.file)));
});

const manifestOf = (page: { userData: string; captureId: string }): Array<Record<string, unknown>> =>
  fs.readFileSync(path.join(page.userData, 'captures', page.captureId, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

test('retention on the real overlay: material steps are retained; past the limit each later step is recorded once; nothing stays pinned', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0, max_frames: 2 });
  for (const shade of [20, 120, 60]) {
    page.scene.shade = shade;
    await page.review.sample();
    await page.review.retention().queue;
  }
  page.scene.shade = 180; // a material step past the limit
  await page.review.sample();
  await page.review.sample(); // unchanged since: nothing more
  page.scene.shade = 240; // another step past the limit
  await page.review.sample();
  h.end('stopped by the user');
  await until('the Stop to be confirmed', () => page.acks.length > 0);
  const kinds = manifestOf(page).map((l) => `${l['kind']}${l['kind'] === 'not_retained' ? `:${l['samples']}` : ''}`);
  assert.deepEqual(kinds, ['header', 'retained', 'retained', 'refused', 'not_retained:2', 'ended'], 'the two later steps, once each; no endless deferral');
  assert.match(String(manifestOf(page).find((l) => l['kind'] === 'not_retained')!['reason']), /retention limit of 2 frames/);
  assert.equal(page.review.retention().pinned, 0);
});

test('retention on the real overlay: a frame refused because writing failed is retried once writing works, carrying what it stood for', { timeout: 5000 }, async () => {
  const h = harness();
  const s = await running(h);
  const page = await overlayPage(h, s, { ...retention.DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  page.scene.shade = 20;
  await page.review.sample();
  await page.review.retention().queue;
  h.failWrites.on = true;
  page.scene.shade = 120;
  await page.review.sample();
  await page.review.retention().queue;
  assert.equal(page.review.retention().refused, 1);
  h.failWrites.on = false;
  await page.review.sample(); // the same screen: tried again
  await page.review.retention().queue;
  const retained = manifestOf(page).filter((l) => l['kind'] === 'retained');
  assert.equal(retained.length, 2, 'the step is retained on the retry');
  assert.equal(page.review.retention().pinned, 0);
});
