// The DOM-free parts of the Windows app: desktop ink documents and display samples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStroke, erase, undo, type InkStroke } from '../../safari-extension/src/ink.ts';
import { forkDesktopInk, newDesktopInk, parseDesktopInk, summarize, type DesktopDisplay } from '../src/shared/desktop-ink.ts';
import { alignmentOf, fingerprintFromBase64, fingerprintToBase64, lumaChange, luminance, sampleState, toFramePixels } from '../src/shared/samples.ts';

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
const evidence = { frame_seq: 3, frame_sampled_at: '2026-09-30T10:00:00.000Z', region: { x: 2, y: 92, width: 206, height: 16 }, fingerprint: fingerprintToBase64(new Uint8Array(256).fill(200)) };

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

test('alignment: the same textured pixels verify, changed pixels do not, plain or missing pixels are unknown', () => {
  const textured = Uint8Array.from({ length: 256 }, (_, i) => ((i >> 2) % 2 ? 180 : 100));
  const moved = Uint8Array.from({ length: 256 }, (_, i) => ((i >> 2) % 2 ? 100 : 180));
  assert.equal(alignmentOf(textured, textured), 'verified');
  assert.equal(alignmentOf(textured, moved), 'changed');
  assert.equal(alignmentOf(new Uint8Array(256).fill(250), new Uint8Array(256).fill(250)), 'unknown', 'a blank margin cannot show that content stayed');
  assert.equal(alignmentOf(textured, null), 'unknown');
  assert.equal(alignmentOf(null, textured), 'unknown');
});
