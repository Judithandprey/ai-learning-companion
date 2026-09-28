// P0-12 TEST-ONLY reference model for web screen/media timing (AUDIO-08, AUDIO-14, AVTEST-07).
// Maps the capture time of a spoken reference to the media position and the page
// frame that were current then. It uses only screen/media evidence the web path can
// record (media element events, frames, edits); it involves no audio and is not a
// runtime implementation or contract. Placeholder names; engineering defaults.
//
// Evidence is ordered by capture time and, for equal capture times, only by an order the
// recorder actually recorded (`seq`). Arrival order never matters; conflicting same-time
// evidence without a recorded order gives an explicit unknown, never an invented sequence.
// Capture times come from one monotonic clock per recorder (e.g. performance.timeOrigin +
// performance.now()); a wall-clock step or clocks of different devices are not modeled.

type Order = {
  /**
   * Capture order from the same recorder, when it recorded one (e.g. a per-page counter
   * incremented in event dispatch order). Only this orders evidence with equal capture times.
   */
  readonly seq?: number;
};

/** A media element snapshot taken when the event fired. */
export type MediaObservation = Order & {
  /** Capture time (ms, the recorder's monotonic clock), not arrival time. */
  readonly at: number;
  /** `sample` is a periodic snapshot, also sent as a heartbeat while nothing changes. */
  readonly kind: 'play' | 'playing' | 'waiting' | 'pause' | 'seeking' | 'seeked' | 'ratechange' | 'sample';
  /** Media position (s) reported with the event. */
  readonly position: number;
  readonly rate: number;
  readonly paused: boolean;
  /** The element's `seeking` attribute at capture. */
  readonly seeking: boolean;
  /** The element's `readyState` at capture; below HAVE_FUTURE_DATA (3) an unpaused element is not progressing. */
  readonly readyState: number;
};

/**
 * The recorder stopped observing this element: track unavailable, source stopped,
 * disconnection, page hidden or left, or events known to be lost. The last state is not
 * current again until a newer observation (AUDIO-14).
 */
export type CoverageLost = Order & { readonly at: number; readonly kind: 'coverage_lost' };

export type MediaEvent = MediaObservation | CoverageLost;

/**
 * No state, playing or paused, is carried further than this past the latest observation
 * (engineering default). A recorder that is still observing sends `sample` heartbeats at
 * least this often, so a silent loss of coverage also ends in an unknown gap.
 */
export const MAX_EXTRAPOLATION_MS = 5_000;
/** A frame older than this at the utterance is stale for that utterance (engineering default). */
export const STALE_FRAME_MS = 2_000;
const HAVE_FUTURE_DATA = 3;

export type Position =
  | { readonly known: true; readonly position: number; readonly basis: 'paused' | 'waiting' | 'interpolated' }
  | {
      readonly known: false;
      readonly reason: 'no_media_evidence' | 'seeking' | 'too_old_to_extrapolate' | 'coverage_lost' | 'conflicting_simultaneous_evidence' | 'unsupported_rate';
    };

/** Items grouped by equal capture time, earliest group first. */
function byCaptureTime<T>(items: ReadonlyArray<T>, at: (x: T) => number): T[][] {
  const times = [...new Set(items.map(at))].sort((a, b) => a - b);
  return times.map((time) => items.filter((x) => at(x) === time));
}

const contentKey = (x: object): string => JSON.stringify(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)));

/**
 * The value set by the last item of a same-time group. Identical items (a redelivery) count
 * once. With a distinct finite recorded `seq` on every item that is the highest `seq`.
 * Otherwise any item may have been last, so the value is known only if all of them agree,
 * else 'conflict'; agreeing items give one canonical value whatever the arrival order.
 * Undefined if no item sets the value.
 */
function lastValue<T extends Order, V>(group: ReadonlyArray<T>, value: (x: T) => V | undefined, same: (a: V, b: V) => boolean): V | 'conflict' | undefined {
  const items = [...new Map(group.map((x) => [contentKey(x), x] as const)).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, x]) => x);
  const seqs = items.map((x) => x.seq);
  const ordered = seqs.every((q) => Number.isFinite(q)) && new Set(seqs).size === items.length;
  const values = (ordered ? items.sort((a, b) => a.seq! - b.seq!) : items).map(value).filter((v): v is V => v !== undefined);
  if (values.length === 0) return undefined;
  if (ordered) return values.at(-1);
  return values.every((v) => same(v, values[0]!)) ? values[0] : 'conflict';
}

const progressing = (o: MediaObservation): boolean => !o.paused && o.readyState >= HAVE_FUTURE_DATA;

type State = MediaObservation | 'lost';
/** Same-time snapshots agree if they give the same position now and the same progress afterwards. */
const sameState = (a: State, b: State): boolean =>
  a === 'lost' || b === 'lost'
    ? a === b
    : Object.is(a.position, b.position) && a.paused === b.paused && a.seeking === b.seeking && progressing(a) === progressing(b) && (Object.is(a.rate, b.rate) || !progressing(a));

/** A seek opened by `seeking` stays open through any other event until `seeked`; a coverage loss ends what the sequence can tell. */
const seekEffect = (e: MediaEvent): boolean | undefined =>
  e.kind === 'seeking' ? true : e.kind === 'seeked' || e.kind === 'coverage_lost' ? false : undefined;

/** Media position at capture time t, from the evidence captured at or before t. */
export function positionAt(events: ReadonlyArray<MediaEvent>, t: number): Position {
  let state: State | 'conflict' | undefined;
  let seekOpen: boolean | 'conflict' = false;
  for (const group of byCaptureTime(events.filter((e) => e.at <= t), (e) => e.at)) {
    state = lastValue<MediaEvent, State>(group, (e) => (e.kind === 'coverage_lost' ? 'lost' : e), sameState) ?? state;
    seekOpen = lastValue(group, seekEffect, (a, b) => a === b) ?? seekOpen;
  }
  if (state === undefined) return { known: false, reason: 'no_media_evidence' };
  if (state === 'conflict' || seekOpen === 'conflict') return { known: false, reason: 'conflicting_simultaneous_evidence' };
  if (state === 'lost') return { known: false, reason: 'coverage_lost' };
  // After a gap the sequence is reset and the element's own `seeking` attribute tells.
  if (seekOpen || state.seeking) return { known: false, reason: 'seeking' };
  if (t - state.at > MAX_EXTRAPOLATION_MS) return { known: false, reason: 'too_old_to_extrapolate' };
  if (state.paused) return { known: true, position: state.position, basis: 'paused' };
  // Buffering: the element is not paused but cannot progress until a `playing` event.
  if (!progressing(state)) return { known: true, position: state.position, basis: 'waiting' };
  // Reverse or invalid rates are outside the model (the earliest position is not recorded).
  if (!Number.isFinite(state.rate) || state.rate < 0) return { known: false, reason: 'unsupported_rate' };
  return { known: true, position: state.position + ((t - state.at) / 1000) * state.rate, basis: 'interpolated' };
}

export type FrameRef = Order & { readonly id: string; readonly capturedAt: number; readonly version: number };

export type FrameAtResult =
  | { readonly known: true; readonly frame: FrameRef; readonly stale: boolean }
  | { readonly known: false; readonly reason: 'no_frame' | 'conflicting_simultaneous_frames' };

/**
 * The frame that was current at capture time t: the latest frame captured at or before t.
 * A frame captured after t is never evidence for the earlier utterance. The frame is
 * returned but marked stale when it is more than STALE_FRAME_MS older than t, or when
 * screen coverage was lost after it and at or before t (a loss at the frame's own capture
 * time counts as after it). Different frames with the same capture time and no recorded
 * order are unknown.
 */
export function frameAt(frames: ReadonlyArray<FrameRef>, t: number, coverageLostAt: ReadonlyArray<number> = []): FrameAtResult {
  const latest = byCaptureTime(frames.filter((f) => f.capturedAt <= t), (f) => f.capturedAt).at(-1);
  const frame = latest && lastValue(latest, (f) => f, (a, b) => a.id === b.id && a.version === b.version);
  if (!frame) return { known: false, reason: 'no_frame' };
  if (frame === 'conflict') return { known: false, reason: 'conflicting_simultaneous_frames' };
  const lostSince = coverageLostAt.some((g) => g >= frame.capturedAt && g <= t);
  return { known: true, frame, stale: lostSince || t - frame.capturedAt > STALE_FRAME_MS };
}

/**
 * Observed edits usable to resolve "this line" in an utterance at t: only those that
 * happened at or before t. Edits during a coverage gap were not observed; their absence
 * here is unknown, not proof that nothing was written.
 */
export function editsBefore<T extends { readonly at: number }>(edits: ReadonlyArray<T>, t: number): T[] {
  return edits.filter((e) => e.at <= t);
}
