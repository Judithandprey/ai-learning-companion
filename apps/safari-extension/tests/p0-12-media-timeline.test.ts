// P0-12 test-only checks for AUDIO-08 / AUDIO-14 / AVTEST-07 web timing: a spoken reference
// maps to the media position and frame current at the moment it was spoken, under rate
// changes, seeks, pauses, buffering, same-time evidence, coverage gaps and late-arriving
// evidence. Screen/media evidence only; no audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editsBefore,
  frameAt,
  MAX_EXTRAPOLATION_MS,
  positionAt,
  STALE_FRAME_MS,
  type FrameRef,
  type MediaEvent,
  type MediaObservation,
} from './p0-12/media-timeline.ts';

const ev = (at: number, kind: MediaObservation['kind'], position: number, rate = 1, paused = false, extra: Partial<MediaObservation> = {}): MediaObservation => ({
  at,
  kind,
  position,
  rate,
  paused,
  seeking: kind === 'seeking',
  readyState: 4,
  ...extra,
});
const lost = (at: number, seq?: number): MediaEvent => (seq === undefined ? { at, kind: 'coverage_lost' } : { at, kind: 'coverage_lost', seq });
const reversed = <T,>(xs: T[]): T[] => [...xs].reverse();
const CONFLICT = { known: false, reason: 'conflicting_simultaneous_evidence' } as const;

test('engineering defaults are the documented ones (5 s carry-over, 2 s stale frame)', () => {
  assert.equal(MAX_EXTRAPOLATION_MS, 5_000);
  assert.equal(STALE_FRAME_MS, 2_000);
});

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

test('seek stays unresolved through intervening events until seeked (lead review defect 1)', () => {
  // Reviewer's case: play -> seeking -> ratechange. Even a snapshot that does not report
  // seeking cannot close the seek; only seeked does.
  for (const intervening of [
    ev(10_200, 'ratechange', 50, 2),
    ev(10_200, 'ratechange', 50, 2, false, { seeking: true }),
    ev(10_200, 'play', 50),
    ev(10_200, 'pause', 50, 1, true),
    ev(10_200, 'sample', 50),
  ]) {
    const events = [ev(0, 'play', 0), ev(10_000, 'seeking', 50), intervening];
    assert.deepEqual(positionAt(events, 10_300), { known: false, reason: 'seeking' }, intervening.kind);
    const done = [...events, ev(10_400, 'seeked', 50, 2)];
    assert.deepEqual(positionAt(done, 10_900), { known: true, position: 51, basis: 'interpolated' }, intervening.kind);
  }
  // The same inside one millisecond: seeking then ratechange in recorded order leaves the seek open.
  const sameMs = [ev(0, 'play', 0), ev(1_000, 'seeking', 50, 1, false, { seq: 1 }), ev(1_000, 'ratechange', 50, 2, false, { seq: 2 })];
  assert.deepEqual(positionAt(sameMs, 1_100), { known: false, reason: 'seeking' });
  // The element's own seeking attribute also counts when no seeking event was seen.
  assert.deepEqual(positionAt([ev(0, 'sample', 5, 1, false, { seeking: true })], 100), { known: false, reason: 'seeking' });
});

test('pause: the paused position holds for as long as heartbeats confirm it', () => {
  const events = [ev(0, 'play', 20), ev(10_000, 'pause', 30, 1, true)];
  const confirmed = [...events];
  for (let at = 14_000; at <= 60_000; at += 4_000) confirmed.push(ev(at, 'sample', 30, 1, true));
  assert.deepEqual(positionAt(confirmed, 60_000), { known: true, position: 30, basis: 'paused' });
  // Without heartbeats the recorder may have lost coverage silently: an unknown gap, not a held pause.
  assert.deepEqual(positionAt(events, 10_000 + MAX_EXTRAPOLATION_MS), { known: true, position: 30, basis: 'paused' });
  assert.deepEqual(positionAt(events, 10_000 + MAX_EXTRAPOLATION_MS + 1), { known: false, reason: 'too_old_to_extrapolate' });
});

test('buffering: an unpaused element below HAVE_FUTURE_DATA does not advance until playing', () => {
  const events = [ev(0, 'play', 10, 1, false, { readyState: 2 }), ev(1_000, 'waiting', 10, 1, false, { readyState: 2 })];
  assert.deepEqual(positionAt(events, 500), { known: true, position: 10, basis: 'waiting' });
  assert.deepEqual(positionAt(events, 3_999), { known: true, position: 10, basis: 'waiting' });
  const resumed = [...events, ev(4_000, 'playing', 10)];
  assert.deepEqual(positionAt(resumed, 4_500), { known: true, position: 10.5, basis: 'interpolated' });
  // A same-time waiting and progressing snapshot at one position still conflict: progress afterwards differs.
  assert.deepEqual(positionAt([ev(0, 'playing', 10), ev(0, 'waiting', 10, 1, false, { readyState: 2 })], 500), CONFLICT);
});

test('reverse or invalid rates give no known position', () => {
  assert.deepEqual(positionAt([ev(0, 'play', 1, -1)], 3_000), { known: false, reason: 'unsupported_rate' });
  assert.deepEqual(positionAt([ev(0, 'play', 1, Number.NaN)], 1_000), { known: false, reason: 'unsupported_rate' });
  assert.deepEqual(positionAt([ev(0, 'pause', 1, -1, true)], 3_000), { known: true, position: 1, basis: 'paused' }, 'a paused position does not depend on the rate');
  assert.deepEqual(positionAt([ev(0, 'play', 7, 0)], 3_000), { known: true, position: 7, basis: 'interpolated' });
});

test('late-arriving (backfilled) events: order by capture time, not arrival', () => {
  const inOrder = [ev(0, 'play', 10), ev(5_000, 'ratechange', 15, 2), ev(9_000, 'pause', 23, 2, true)];
  const arrivedLate = [inOrder[2]!, inOrder[0]!, inOrder[1]!];
  for (const t of [2_000, 7_000, 12_000]) assert.deepEqual(positionAt(arrivedLate, t), positionAt(inOrder, t), `t=${t}`);
});

test('evidence captured after the utterance is never used for it, even 1 ms later', () => {
  assert.deepEqual(positionAt([ev(20_000, 'play', 50)], 10_000), { known: false, reason: 'no_media_evidence' });
  const events = [ev(0, 'play', 10), ev(1_001, 'seeking', 90), lost(1_001)];
  assert.deepEqual(positionAt(events, 1_000), { known: true, position: 11, basis: 'interpolated' });
  const frames: FrameRef[] = [{ id: 'f0', capturedAt: 0, version: 1 }, { id: 'f1', capturedAt: 1_001, version: 2 }];
  assert.deepEqual(frameAt(frames, 1_000), { known: true, frame: frames[0], stale: false });
  assert.deepEqual(editsBefore([{ at: 1_000, id: 'e1' }, { at: 1_001, id: 'e2' }], 1_000).map((e) => e.id), ['e1']);
});

test('evidence captured exactly at the utterance counts as current (inclusive boundary)', () => {
  assert.deepEqual(positionAt([ev(0, 'play', 10), ev(1_000, 'seeking', 90)], 1_000), { known: false, reason: 'seeking' });
  assert.deepEqual(positionAt([ev(0, 'play', 10), lost(1_000)], 1_000), { known: false, reason: 'coverage_lost' });
  assert.deepEqual(positionAt([ev(1_000, 'play', 10)], 1_000), { known: true, position: 10, basis: 'interpolated' });
  const f: FrameRef = { id: 'f1', capturedAt: 1_000, version: 1 };
  assert.deepEqual(frameAt([f], 1_000), { known: true, frame: f, stale: false });
  assert.deepEqual(frameAt([f], 1_500, [1_500]), { known: true, frame: f, stale: true }, 'a loss exactly at the utterance counts');
});

test('same-time conflicting evidence: recorded order or explicit unknown, never arrival order (lead review defect 2)', () => {
  // Reviewer's case: play and pause with the same capture time gave 10 or 11 by arrival order.
  const play = ev(1_000, 'play', 10);
  const pause = ev(1_000, 'pause', 10.5, 1, true);
  const before = ev(0, 'play', 9);
  for (const order of [[before, play, pause], [before, pause, play]]) assert.deepEqual(positionAt(order, 2_000), CONFLICT);
  // A recorded capture order resolves the tie the same way whatever the arrival order.
  const seqPlay = { ...play, seq: 7 };
  const seqPause = { ...pause, seq: 8 };
  for (const order of [[before, seqPlay, seqPause], [before, seqPause, seqPlay]]) {
    assert.deepEqual(positionAt(order, 2_000), { known: true, position: 10.5, basis: 'paused' });
  }
  // A redelivered duplicate (same seq, same content) does not cancel the recorded order.
  for (const order of [[before, seqPlay, seqPause, { ...seqPause }], [before, { ...seqPlay }, seqPause, seqPlay]]) {
    assert.deepEqual(positionAt(order, 2_000), { known: true, position: 10.5, basis: 'paused' });
  }
  // A partial, shared or non-finite seq is not an order.
  assert.deepEqual(positionAt([before, seqPlay, pause], 2_000), CONFLICT);
  for (const order of [[before, { ...play, seq: 7 }, { ...pause, seq: 7 }], [before, { ...pause, seq: 7 }, { ...play, seq: 7 }]]) assert.deepEqual(positionAt(order, 2_000), CONFLICT);
  for (const order of [[before, { ...play, seq: Number.NaN }, { ...pause, seq: 1 }], [before, { ...pause, seq: 1 }, { ...play, seq: Number.NaN }]]) assert.deepEqual(positionAt(order, 2_000), CONFLICT);
  // Same-time evidence that agrees (e.g. a duplicate delivered twice) is not a conflict.
  assert.deepEqual(positionAt([pause, ev(1_000, 'sample', 10.5, 1, true)], 2_000), { known: true, position: 10.5, basis: 'paused' });
  // Paused snapshots that differ only in rate agree: the rate does not move a paused position.
  for (const order of [[ev(1_000, 'pause', 20, 1, true), ev(1_000, 'ratechange', 20, 2, true)], [ev(1_000, 'ratechange', 20, 2, true), ev(1_000, 'pause', 20, 1, true)]]) {
    assert.deepEqual(positionAt(order, 1_500), { known: true, position: 20, basis: 'paused' });
  }
  // Snapshots that differ only in the seeking attribute conflict.
  const a = ev(1_000, 'sample', 40);
  const b = ev(1_000, 'sample', 40, 1, false, { seeking: true });
  for (const order of [[a, b], [b, a]]) assert.deepEqual(positionAt(order, 1_500), CONFLICT);
  // Seeking and seeked at the same time: whether the seek is still open is unknown without an order.
  const seekTie = [ev(0, 'play', 0), ev(1_000, 'seeking', 40), ev(1_000, 'seeked', 40)];
  assert.deepEqual(positionAt(seekTie, 1_500), CONFLICT);
  const seekOrdered = [ev(0, 'play', 0), ev(1_000, 'seeked', 40, 1, false, { seq: 2 }), ev(1_000, 'seeking', 40, 1, false, { seq: 1, seeking: true })];
  assert.deepEqual(positionAt(seekOrdered, 1_500), { known: true, position: 40.5, basis: 'interpolated' });
  // A neutral same-time event beside seeked is no conflict.
  assert.deepEqual(positionAt([ev(0, 'play', 0), ev(900, 'seeking', 40), ev(1_000, 'seeked', 40), ev(1_000, 'sample', 40)], 1_500), { known: true, position: 40.5, basis: 'interpolated' });
  // A later observation ends a state conflict; only seeked, seeking or a gap ends a seek conflict.
  assert.deepEqual(positionAt([before, play, pause, ev(1_500, 'sample', 11, 1, false)], 2_000), { known: true, position: 11.5, basis: 'interpolated' });
  assert.deepEqual(positionAt([...seekTie, ev(1_200, 'sample', 40.2)], 1_500), CONFLICT);
  assert.deepEqual(positionAt([...seekTie, ev(1_200, 'seeked', 40.2)], 1_500), { known: true, position: 40.5, basis: 'interpolated' });
  assert.deepEqual(positionAt([...seekTie, ev(1_200, 'seeking', 40.2)], 1_500), { known: false, reason: 'seeking' });
  assert.deepEqual(positionAt([...seekTie, lost(1_200), ev(1_300, 'sample', 40.3)], 1_500), { known: true, position: 40.5, basis: 'interpolated' });
});

test('coverage gaps: the last state is not current after the source becomes unavailable (AUDIO-14)', () => {
  const events = [ev(0, 'play', 10), lost(2_000)];
  assert.deepEqual(positionAt(events, 1_000), { known: true, position: 11, basis: 'interpolated' }, 'history before the gap stays usable');
  assert.deepEqual(positionAt(events, 2_500), { known: false, reason: 'coverage_lost' });
  // A paused state is not held across a gap either.
  assert.deepEqual(positionAt([ev(0, 'pause', 10, 1, true), lost(1_000)], 1_500), { known: false, reason: 'coverage_lost' });
  // A new observation after the gap is current again.
  assert.deepEqual(positionAt([...events, ev(9_000, 'sample', 80)], 9_500), { known: true, position: 80.5, basis: 'interpolated' });
  // A seek open before the gap: after it only the element's own seeking attribute tells.
  const seekThenGap = [ev(0, 'play', 0), ev(1_000, 'seeking', 50), lost(2_000)];
  assert.deepEqual(positionAt([...seekThenGap, ev(3_000, 'sample', 50, 1, false, { seeking: true })], 3_100), { known: false, reason: 'seeking' });
  assert.deepEqual(positionAt([...seekThenGap, ev(3_000, 'sample', 52)], 3_500), { known: true, position: 52.5, basis: 'interpolated' });
  // A loss and an observation at the same capture time without an order: unknown which came last.
  assert.deepEqual(positionAt([ev(0, 'play', 10), ev(2_000, 'sample', 12), lost(2_000)], 2_500), CONFLICT);
  assert.deepEqual(positionAt([ev(0, 'play', 10), ev(2_000, 'sample', 12, 1, false, { seq: 2 }), lost(2_000, 1)], 2_500), { known: true, position: 12.5, basis: 'interpolated' });
});

test('no far extrapolation: a playing position with no recent event is unknown', () => {
  const events = [ev(0, 'play', 10)];
  assert.equal(positionAt(events, MAX_EXTRAPOLATION_MS).known, true);
  assert.deepEqual(positionAt(events, MAX_EXTRAPOLATION_MS + 1), { known: false, reason: 'too_old_to_extrapolate' });
});

test('frames: the frame current at the utterance, never a later one; old frames are marked stale', () => {
  const frames: FrameRef[] = [
    { id: 'f0', capturedAt: 0, version: 1 },
    { id: 'f1', capturedAt: 10_000, version: 1 },
    { id: 'f2', capturedAt: 20_000, version: 2 },
  ];
  assert.deepEqual(frameAt(frames, 15_000), { known: true, frame: frames[1], stale: true });
  assert.deepEqual(frameAt(frames, 10_000 + STALE_FRAME_MS), { known: true, frame: frames[1], stale: false });
  assert.deepEqual(frameAt(frames, 10_000 + STALE_FRAME_MS + 1), { known: true, frame: frames[1], stale: true });
  const r = frameAt(frames, 19_999);
  assert.equal(r.known && r.frame.version, 1, 'a later version-2 frame is not evidence for an earlier utterance');
  assert.deepEqual(frameAt(frames, -1), { known: false, reason: 'no_frame' });
});

test('frames: same-time frames need a recorded order; coverage loss makes the last frame stale', () => {
  const a: FrameRef = { id: 'fa', capturedAt: 1_000, version: 1 };
  const b: FrameRef = { id: 'fb', capturedAt: 1_000, version: 2 };
  const conflict = { known: false, reason: 'conflicting_simultaneous_frames' };
  for (const order of [[a, b], [b, a]]) assert.deepEqual(frameAt(order, 1_500), conflict);
  // The same frame id with another version is a different frame.
  const a2: FrameRef = { ...a, version: 2 };
  for (const order of [[a, a2], [a2, a]]) assert.deepEqual(frameAt(order, 1_500), conflict);
  for (const order of [[{ ...a, seq: 2 }, { ...b, seq: 1 }], [{ ...b, seq: 1 }, { ...a, seq: 2 }], [{ ...a, seq: 2 }, { ...b, seq: 1 }, { ...a, seq: 2 }]]) {
    assert.deepEqual(frameAt(order, 1_500), { known: true, frame: { ...a, seq: 2 }, stale: false });
  }
  for (const order of [[{ ...a, seq: 1 }, { ...b, seq: 1 }], [{ ...b, seq: 1 }, { ...a, seq: 1 }]]) assert.deepEqual(frameAt(order, 1_500), conflict, 'a shared seq is not an order');
  assert.deepEqual(frameAt([a, { ...a }], 1_500), { known: true, frame: a, stale: false }, 'a duplicate is not a conflict');
  // Agreeing duplicates give one canonical result whatever the arrival order.
  assert.deepEqual(frameAt([a, { ...a, seq: 5 }], 1_500), frameAt([{ ...a, seq: 5 }, a], 1_500));
  // AUDIO-14: after the source became unavailable its last frame is not the live screen.
  assert.deepEqual(frameAt([a], 1_500, [1_200]), { known: true, frame: a, stale: true });
  assert.deepEqual(frameAt([a], 1_500, [1_000]), { known: true, frame: a, stale: true }, 'a loss at the frame time counts as after it');
  assert.deepEqual(frameAt([a], 1_500, [900, 1_600]), { known: true, frame: a, stale: false }, 'a loss before the frame or after the utterance does not');
  // Several losses: any one between the frame and the utterance counts, in any order.
  for (const losses of [[500, 1_200, 1_700], [1_700, 1_200, 500], [1_200, 500, 1_700]]) assert.deepEqual(frameAt([a], 1_500, losses), { known: true, frame: a, stale: true });
  assert.deepEqual(frameAt([a, { id: 'fc', capturedAt: 1_300, version: 3 }], 1_500, [1_200, 500]), { known: true, frame: { id: 'fc', capturedAt: 1_300, version: 3 }, stale: false }, 'a frame after the loss is live again');
});

test('arrival order never changes a result (seeded shuffles with same-time evidence)', () => {
  let s = 12345;
  const rnd = (): number => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const shuffle = <T,>(xs: T[]): T[] => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  const seqOf = (i: number): { seq?: number } => (rnd() < 0.4 ? {} : { seq: rnd() < 0.2 ? 0 : i });
  const outcomes = { conflict: 0, orderedTie: 0, known: 0 };
  for (let n = 0; n < 500; n++) {
    const events: MediaEvent[] = [];
    const frames: FrameRef[] = [];
    for (let i = 0; i < 8; i++) {
      const at = pick([0, 1_000, 2_000, 3_000]);
      if (rnd() < 0.15) events.push(lost(at, seqOf(i).seq));
      else {
        const kind = pick(['play', 'playing', 'waiting', 'pause', 'seeking', 'seeked', 'ratechange', 'sample'] as const);
        events.push(ev(at, kind, pick([10, 20]), pick([1, 2]), kind === 'pause', { seeking: kind === 'seeking' || rnd() < 0.1, readyState: kind === 'waiting' ? 2 : 4, ...seqOf(i) }));
      }
      frames.push({ id: `f${pick([1, 2])}`, capturedAt: at, version: pick([1, 2]), ...seqOf(i) });
      if (rnd() < 0.2) events.push({ ...events.at(-1)! }); // redelivery
    }
    const losses = [pick([500, 1_500]), pick([1_000, 2_500])];
    for (const t of [500, 1_500, 2_500, 3_500]) {
      const expected = { position: positionAt(events, t), frame: frameAt(frames, t, losses) };
      if (expected.position.known) outcomes.known++;
      else if (expected.position.reason === 'conflicting_simultaneous_evidence') outcomes.conflict++;
      const group = events.filter((e) => e.at === Math.max(...events.filter((x) => x.at <= t).map((x) => x.at)));
      if (group.length > 1 && group.every((e) => Number.isFinite(e.seq))) outcomes.orderedTie++;
      for (let k = 0; k < 4; k++) {
        assert.deepEqual({ position: positionAt(shuffle(events), t), frame: frameAt(shuffle(frames), t, shuffle(losses)) }, expected, `case ${n} t=${t}`);
      }
      assert.deepEqual({ position: positionAt(reversed(events), t), frame: frameAt(reversed(frames), t, reversed(losses)) }, expected);
    }
  }
  // The sampled cases must reach conflicts, recorded-order ties and known results alike.
  assert.ok(outcomes.conflict > 100 && outcomes.orderedTie > 50 && outcomes.known > 100, JSON.stringify(outcomes));
});

test('edits: only edits observed before the utterance can resolve "this line"', () => {
  const edits = [{ at: 5_000, id: 'e1' }, { at: 15_000, id: 'e2' }, { at: 16_000, id: 'e3' }];
  assert.deepEqual(editsBefore(edits, 15_000).map((e) => e.id), ['e1', 'e2']);
  assert.deepEqual(editsBefore(edits, 1_000), []);
});
