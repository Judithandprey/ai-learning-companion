// P0-12 TEST-ONLY reference model for web screen/media timing (AUDIO-08, AVTEST-07).
// Maps the capture time of a spoken reference to the media position and the page
// frame that were current then. It uses only screen/media evidence the web path can
// record (media element events, frames, edits); it involves no audio and is not a
// runtime implementation or contract. Placeholder names; engineering defaults.

export type MediaEvent = {
  /** Capture time (ms, wall clock of the capturing device), not arrival time. */
  readonly at: number;
  readonly kind: 'play' | 'pause' | 'seeking' | 'seeked' | 'ratechange' | 'sample';
  /** Media position (s) reported with the event. */
  readonly position: number;
  readonly rate: number;
  readonly paused: boolean;
};

/** Do not extrapolate a playing position further than this without a newer event (engineering default). */
export const MAX_EXTRAPOLATION_MS = 5_000;
/** A frame older than this at the utterance is stale for that utterance (engineering default). */
export const STALE_FRAME_MS = 2_000;

export type Position =
  | { readonly known: true; readonly position: number; readonly basis: 'paused' | 'interpolated' }
  | { readonly known: false; readonly reason: 'no_media_evidence' | 'seeking' | 'too_old_to_extrapolate' };

/** Media position at capture time t. Events are ordered by capture time, so late arrival changes nothing. */
export function positionAt(events: ReadonlyArray<MediaEvent>, t: number): Position {
  const before = [...events].filter((e) => e.at <= t).sort((a, b) => a.at - b.at);
  const last = before.at(-1);
  if (!last) return { known: false, reason: 'no_media_evidence' };
  if (last.kind === 'seeking') return { known: false, reason: 'seeking' };
  if (last.paused) return { known: true, position: last.position, basis: 'paused' };
  if (t - last.at > MAX_EXTRAPOLATION_MS) return { known: false, reason: 'too_old_to_extrapolate' };
  return { known: true, position: last.position + ((t - last.at) / 1000) * last.rate, basis: 'interpolated' };
}

export type FrameRef = { readonly id: string; readonly capturedAt: number; readonly version: number };

/**
 * The frame that was current at capture time t: the latest frame captured at or before t.
 * A frame captured after t is never evidence for the earlier utterance. An old frame is
 * returned but marked stale.
 */
export function frameAt(frames: ReadonlyArray<FrameRef>, t: number): { frame: FrameRef; stale: boolean } | null {
  const before = frames.filter((f) => f.capturedAt <= t).sort((a, b) => a.capturedAt - b.capturedAt);
  const f = before.at(-1);
  return f ? { frame: f, stale: t - f.capturedAt > STALE_FRAME_MS } : null;
}

/** Observed edits usable to resolve "this line" in an utterance at t: only those that happened before t. */
export function editsBefore<T extends { readonly at: number }>(edits: ReadonlyArray<T>, t: number): T[] {
  return edits.filter((e) => e.at <= t);
}
