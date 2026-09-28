import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freezeSelection, normalizePolygon, normalizeRect, selectionProblems, unionRects } from '../src/anchor.ts';
import { freezeDomSnapshot } from '../src/frame.ts';
import { SYNTHETIC_IDENTITY } from '../src/fixture-data.ts';
import type { Frame, Selection } from '../src/contracts.ts';
import { counterIds, fixedClock, snapshot } from './helpers.ts';

const VIEWPORT = { width: 1000, height: 800 };
const SOURCE = { source_id: 'web-probe-fixture', source_version: 1, source_timezone: 'America/Los_Angeles' };

async function frame(media: number | null = null): Promise<Frame> {
  const snap = snapshot(media === null ? {} : { media: { current_time: media, paused: false, active_cues: [], cue_access: 'none' } });
  return (await freezeDomSnapshot(snap, SYNTHETIC_IDENTITY, SOURCE, counterIds(), fixedClock())).frame;
}

test('normalizeRect clips to the frame and rejects empty or non-finite input', () => {
  assert.deepEqual(normalizeRect({ x: 100, y: 200, width: 300, height: 40 }, VIEWPORT), { x: 0.1, y: 0.25, width: 0.3, height: 0.05 });
  const clipped = normalizeRect({ x: -100, y: 700, width: 300, height: 200 }, VIEWPORT)!;
  assert.equal(clipped.x, 0);
  assert.equal(clipped.width, 0.2);
  assert.equal(clipped.y + clipped.height, 1);
  assert.equal(normalizeRect({ x: 1200, y: 0, width: 10, height: 10 }, VIEWPORT), null);
  assert.equal(normalizeRect({ x: 0, y: 0, width: 0, height: 10 }, VIEWPORT), null);
  assert.equal(normalizeRect({ x: NaN, y: 0, width: 5, height: 10 }, VIEWPORT), null);
  assert.equal(normalizeRect({ x: 0, y: 0, width: 5, height: 10 }, { width: 0, height: 10 }), null);
});

test('unionRects merges multi-line selections', () => {
  assert.deepEqual(unionRects([{ x: 10, y: 10, width: 100, height: 20 }, { x: 0, y: 30, width: 50, height: 20 }, { x: 5, y: 5, width: 0, height: 0 }]), { x: 0, y: 10, width: 110, height: 40 });
  assert.equal(unionRects([]), null);
});

test('normalizePolygon returns a bbox that contains the polygon', () => {
  const r = normalizePolygon([{ x: 100, y: 100 }, { x: 300, y: 120 }, { x: 200, y: 400 }], VIEWPORT)!;
  assert.deepEqual(r.bbox, { x: 0.1, y: 0.125, width: 0.2, height: 0.375 });
  assert.equal(r.polygon.length, 3);
  assert.equal(normalizePolygon([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }], VIEWPORT), null);
  assert.equal(normalizePolygon([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], VIEWPORT), null);
});

test('frozen selection copies identity, version and media position from the frame', async () => {
  const f = await frame(12.5);
  const sel = freezeSelection(f, { id: 'sel-1', bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, selectedText: 'change of basis', inputMode: 'pencil_ask', createdAt: '2026-09-28T12:00:00.000Z' });
  assert.equal(sel.frame_id, f.frame_id);
  assert.equal(sel.source_version, 1);
  assert.equal(sel.media_position, 12.5);
  assert.equal(sel.user_id, SYNTHETIC_IDENTITY.user_id);
  assert.deepEqual(sel.concept_candidates, []);
  assert.deepEqual(selectionProblems(sel, f), []);
});

test('anchors are immutable: later scrolling, playback or edits cannot rewrite them', async () => {
  const f = await frame(3);
  const bbox = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 };
  const sel = freezeSelection(f, { id: 'sel-2', bbox, selectedText: 'eigenvector', inputMode: 'explicit_touch_ask', createdAt: '2026-09-28T12:00:00.000Z' });
  const before = JSON.stringify(sel);
  bbox.y = 0.9; // caller's object changes after freezing (e.g. page scrolled)
  assert.throws(() => {
    (sel as { media_position: number | null }).media_position = 99;
  }, TypeError);
  assert.throws(() => {
    (sel.bbox as { y: number }).y = 0.5;
  }, TypeError);
  assert.equal(JSON.stringify(sel), before);
  assert.ok(Object.isFrozen(f));
});

test('a new source version produces a new anchor while the old one stays intact', async () => {
  const ids = counterIds();
  const clock = fixedClock();
  const f1 = (await freezeDomSnapshot(snapshot({ version: '1' }), SYNTHETIC_IDENTITY, SOURCE, ids, clock)).frame;
  const f2 = (await freezeDomSnapshot(snapshot({ version: '2', text: 'change of basis (v2 wording)' }), SYNTHETIC_IDENTITY, { ...SOURCE, source_version: 2 }, ids, clock)).frame;
  const draft = { bbox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, selectedText: 'change of basis', inputMode: 'pencil_ask' as const, createdAt: '2026-09-28T12:00:00.000Z' };
  const s1 = freezeSelection(f1, { ...draft, id: 'sel-a' });
  const s2 = freezeSelection(f2, { ...draft, id: 'sel-b' });
  assert.equal(s1.source_version, 1);
  assert.equal(s2.source_version, 2);
  assert.notEqual(s1.frame_id, s2.frame_id);
  assert.notEqual(f1.content_hash, f2.content_hash);
});

test('invalid anchors are refused rather than repaired', async () => {
  const f = await frame();
  const base = { id: 'sel-3', selectedText: 'x', inputMode: 'pencil_ask' as const, createdAt: '2026-09-28T12:00:00.000Z' };
  assert.throws(() => freezeSelection(f, { ...base, bbox: { x: 0.9, y: 0.1, width: 0.2, height: 0.1 } }), /outside the frame/);
  assert.throws(() => freezeSelection(f, { ...base, bbox: { x: 0.1, y: 0.1, width: 0, height: 0.1 } }), /positive size/);
  assert.throws(() => freezeSelection(f, { ...base, bbox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, polygon: [{ x: 0.5, y: 0.5 }, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }), /outside bbox/);
  assert.throws(() => freezeSelection(f, { ...base, id: 'bad id', bbox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } }), /Identifier/);
  assert.throws(() => freezeSelection(f, { ...base, createdAt: '2026-09-28T12:00:00+02:00', bbox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } }), /UTC/);
});

test('rebinding to a different frame, session or version is detected', async () => {
  const f = await frame();
  const sel = freezeSelection(f, { id: 'sel-4', bbox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, selectedText: 'x', inputMode: 'pencil_ask', createdAt: '2026-09-28T12:00:00.000Z' });
  const other: Frame = { ...f, frame_id: 'frm_other', source_version: 2, session_id: 'other-session' };
  const problems = selectionProblems(sel as Selection, other);
  assert.ok(problems.some((p) => p.startsWith('frame_id')));
  assert.ok(problems.some((p) => p.startsWith('source_version')));
  assert.ok(problems.some((p) => p.startsWith('session_id')));
});
