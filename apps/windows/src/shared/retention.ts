// Which whole-display frames are retained as files, and how retained, not-retained and refused frames are
// recorded (lc-desktop-capture-retention/v1). DOM-free.
//
// Every sample's frame is observed; a frame is *retained* (its raw PNG and composed PNG written to disk)
// when it shows a material step: the first frame, a change of the ink or of how it is drawn, or a pixel
// change of at least `material_cells` cells of the 64×40 luminance grid against the last retained frame.
// Retention is rate-limited: a material step inside `min_interval_ms` is deferred to the next allowed
// sample, which records the deferred samples it stands for. A smaller pixel change is recorded as a gap
// (and retained anyway once `heartbeat_ms` has passed). Beyond the caps nothing more is written and the
// refusals are recorded; nothing retained is ever deleted.

export const RETENTION_FORMAT = 'lc-desktop-capture-retention/v1';

export type RetentionPolicy = {
  readonly min_interval_ms: number;
  /** Grid cells (of 64×40) whose mean luminance moved by at least `cell_delta` (0..255). */
  readonly material_cells: number;
  readonly cell_delta: number;
  readonly heartbeat_ms: number;
  readonly max_frames: number;
  readonly max_bytes: number;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  min_interval_ms: 2000,
  material_cells: 2,
  cell_delta: 4,
  heartbeat_ms: 60_000,
  max_frames: 1000,
  max_bytes: 1024 * 1024 * 1024,
};

/** Cells of two equal luminance grids that differ by at least `delta`. */
export function changedCells(a: ArrayLike<number>, b: ArrayLike<number>, delta: number): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) >= delta) n += 1;
  return n;
}

/** What the last retained frame showed. */
export type Retained = { readonly pixels_sha256: string; readonly grid: ArrayLike<number>; readonly ink_key: string; readonly at_ms: number };

export type RetentionDecision =
  | { readonly retain: true; readonly reason: 'first' | 'ink' | 'changed' | 'heartbeat' | 'deferred' }
  | { readonly retain: false; readonly reason: 'unchanged' | 'below_threshold' | 'deferred' };

/**
 * Whether the frame of a sample is retained. `pending` is true while a material step waits for the interval
 * to pass; the first sample allowed then retains it (reason 'deferred' when nothing new is material).
 */
export function decideRetention(
  last: Retained | null,
  now: { pixels_sha256: string; grid: ArrayLike<number>; ink_key: string; at_ms: number },
  pending: boolean,
  policy: RetentionPolicy,
): RetentionDecision {
  if (!last) return { retain: true, reason: 'first' };
  const inkChanged = now.ink_key !== last.ink_key;
  const cells = changedCells(now.grid, last.grid, policy.cell_delta);
  const material = inkChanged || cells >= policy.material_cells;
  const pixelsChanged = now.pixels_sha256 !== last.pixels_sha256;
  const due = now.at_ms - last.at_ms >= policy.min_interval_ms;
  if (material || pending) {
    if (!due) return { retain: false, reason: 'deferred' };
    return { retain: true, reason: cells >= policy.material_cells ? 'changed' : inkChanged ? 'ink' : 'deferred' };
  }
  if (!pixelsChanged) return { retain: false, reason: 'unchanged' };
  return now.at_ms - last.at_ms >= policy.heartbeat_ms ? { retain: true, reason: 'heartbeat' } : { retain: false, reason: 'below_threshold' };
}

/** Width and height from a PNG's IHDR, or null when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== 'IHDR') return null;
  const u32 = (o: number): number => ((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0;
  return { width: u32(16), height: u32(20) };
}
