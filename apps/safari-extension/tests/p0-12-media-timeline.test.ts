// P0-12 test-only checks for AUDIO-08 / AVTEST-07 web timing: a spoken reference maps to
// the media position and frame current at the moment it was spoken, under rate changes,
// seeks, pauses and late-arriving evidence. Screen/media evidence only; no audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editsBefore, frameAt, MAX_EXTRAPOLATION_MS, positionAt, STALE_FRAME_MS, type MediaEvent } from './p0-12/media-timeline.ts';

const ev = (at: number, kind: MediaEvent['kind'], position: number, rate = 1, paused = false): MediaEvent => ({ at, kind, position, rate, paused });

test('rate change: position interpolates at the rate in force at the utterance', () => {
  const events = [ev(0, 'play', 10), ev(5_000, 'ratechange', 15, 2)];
  assert.deepEqual(positionAt(events, 3_000), { known: true, position: 13, basis: 'interpolated' });
  assert.deepEqual(positionAt(events, 8_000), { known: true, position: 21, basis: 'interpolated' });
});

test('seek: unknown while seeking; after seeked, from the new position', () => {
  const events = [ev(0, 'play', 0), ev(10_000, 'seeking', 10), ev(10_500, 'seeked', 100)];
  assert.deepEqual(positionAt(events, 10_200), { known: false, reason: 'seeking' });
  assert.deepEqual(positionAt(events, 11_000), { known: true, position: 100.5, basis: 'interpolated' });
});

test('pause: the paused position holds, however long the pause', () => {
  const events = [ev(0, 'play', 20), ev(10_000, 'pause', 30, 1, true)];
  assert.deepEqual(positionAt(events, 60_000), { known: true, position: 30, basis: 'paused' });
});

test('late-arriving (backfilled) events: order by capture time, not arrival', () => {
  const inOrder = [ev(0, 'play', 10), ev(5_000, 'ratechange', 15, 2), ev(9_000, 'pause', 23, 2, true)];
  const arrivedLate = [inOrder[2]!, inOrder[0]!, inOrder[1]!];
  for (const t of [2_000, 7_000, 12_000]) assert.deepEqual(positionAt(arrivedLate, t), positionAt(inOrder, t), `t=${t}`);
  // Evidence captured after the utterance is never used for it.
  assert.deepEqual(positionAt([ev(20_000, 'play', 50)], 10_000), { known: false, reason: 'no_media_evidence' });
});

test('no far extrapolation: a playing position with no recent event is unknown', () => {
  const events = [ev(0, 'play', 10)];
  assert.equal(positionAt(events, MAX_EXTRAPOLATION_MS).known, true);
  assert.deepEqual(positionAt(events, MAX_EXTRAPOLATION_MS + 1), { known: false, reason: 'too_old_to_extrapolate' });
});

test('frames: the frame current at the utterance, never a later one; old frames are marked stale', () => {
  const frames = [
    { id: 'f0', capturedAt: 0, version: 1 },
    { id: 'f1', capturedAt: 10_000, version: 1 },
    { id: 'f2', capturedAt: 20_000, version: 2 },
  ];
  assert.deepEqual(frameAt(frames, 15_000)?.frame.id, 'f1');
  assert.equal(frameAt(frames, 15_000)?.stale, true);
  assert.equal(frameAt(frames, 10_000 + STALE_FRAME_MS)?.stale, false);
  assert.equal(frameAt(frames, 19_999)?.frame.version, 1, 'a later version-2 frame is not evidence for an earlier utterance');
  assert.equal(frameAt(frames, -1), null);
});

test('edits: only edits observed before the utterance can resolve "this line"', () => {
  const edits = [{ at: 5_000, id: 'e1' }, { at: 15_000, id: 'e2' }, { at: 16_000, id: 'e3' }];
  assert.deepEqual(editsBefore(edits, 15_000).map((e) => e.id), ['e1', 'e2']);
  assert.deepEqual(editsBefore(edits, 1_000), []);
});
