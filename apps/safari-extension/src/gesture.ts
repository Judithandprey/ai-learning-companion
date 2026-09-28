// Classifies one captured ASK stroke (§7.2): tap a word, short sweep across a
// sentence, or a closed loop around a region. Anything else is ambiguous and
// must be confirmed with an adjustable box instead of guessing.

import type { PixelPoint, PixelRect } from './anchor.ts';

export type Gesture =
  | { readonly kind: 'tap'; readonly point: PixelPoint }
  | { readonly kind: 'sweep'; readonly rect: PixelRect }
  | { readonly kind: 'lasso'; readonly points: ReadonlyArray<PixelPoint>; readonly rect: PixelRect }
  | { readonly kind: 'ambiguous'; readonly rect: PixelRect; readonly reason: 'open_loop' | 'not_horizontal' };

export const GESTURE_TUNING = Object.freeze({
  /** Max travel (CSS px) still treated as a tap. */
  tapTravel: 8,
  /** Max start/end gap (CSS px) for a closed loop, or this fraction of the path. */
  closeGap: 28,
  closeGapFraction: 0.18,
  /** A sweep may rise/fall at most this fraction of its width. */
  sweepSlope: 0.35,
  /** Minimum loop extent (CSS px) in both directions. */
  loopExtent: 12,
});

function dist(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function boundsOf(points: ReadonlyArray<PixelPoint>): PixelRect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function classifyStroke(points: ReadonlyArray<PixelPoint>, tuning = GESTURE_TUNING): Gesture | null {
  const finite = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (finite.length === 0) return null;
  const first = finite[0]!;
  const last = finite[finite.length - 1]!;
  let travel = 0;
  let maxFromStart = 0;
  for (let i = 1; i < finite.length; i++) {
    travel += dist(finite[i - 1]!, finite[i]!);
    maxFromStart = Math.max(maxFromStart, dist(first, finite[i]!));
  }
  if (maxFromStart <= tuning.tapTravel) return { kind: 'tap', point: first };

  const rect = boundsOf(finite);
  const gap = dist(first, last);
  const closed = gap <= Math.max(tuning.closeGap, travel * tuning.closeGapFraction) && gap < maxFromStart * 0.5;
  if (closed) {
    if (rect.width >= tuning.loopExtent && rect.height >= tuning.loopExtent) return { kind: 'lasso', points: finite, rect };
    return { kind: 'ambiguous', rect, reason: 'open_loop' };
  }
  if (rect.width > 0 && rect.height <= rect.width * tuning.sweepSlope) return { kind: 'sweep', rect };
  // An unclosed curve or diagonal/vertical line does not say what was meant.
  return { kind: 'ambiguous', rect, reason: rect.height > rect.width * tuning.sweepSlope ? 'not_horizontal' : 'open_loop' };
}
