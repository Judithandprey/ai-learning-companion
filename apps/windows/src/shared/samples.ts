// What the capture of the display produced, sample by sample, as honest local producer facts. DOM-free.
//
// - The system hands over frames as the display changes (Windows may deliver none while nothing
//   changes, so "no new frame" cannot tell a still display from a stalled one and is reported as such).
// - A sample is taken on a fixed period. A period that ran far late (the app was suspended or
//   throttled) is an explicit gap: nothing is known about the display in between.
// - When the stream ends (Stop, permission withdrawn, display removed), live claims end.

/** The display source a sample comes from. */
export type SampleSource = {
  readonly kind: 'display';
  readonly display_id: string;
  readonly source_id: string;
  readonly label: string;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly scale_factor: number;
};

export type SampleState = 'fresh' | 'no_new_frame' | 'gap' | 'ended';

/** Visible strokes by alignment: verified (drawn solid), changed and unknown (dashed), following content (dashed: not established). */
export type InkMarks = { readonly verified: number; readonly changed: number; readonly unknown: number; readonly following_content: number };

/**
 * One sample. `raw` is the captured frame exactly as received (the overlay is excluded from capture);
 * `composed` is that frame with this app's editable ink rendered over it, pinned to the ink revision.
 * Both are null when there is no frame (gap before the first frame, or ended).
 */
export type DisplaySample = {
  readonly seq: number;
  readonly sampled_at: string;
  readonly monotonic_ms: number;
  readonly state: SampleState;
  /** Late periods covered by this sample (gap), or null. */
  readonly gap_ms: number | null;
  readonly source: SampleSource;
  readonly raw: {
    readonly width: number;
    readonly height: number;
    /**
     * Frames the stream had presented when this app took the held image; the image is the newest of them, or one
     * presented just after it. Kept with the image: frames arriving later do not change it.
     */
    readonly presented_frames: number;
    /**
     * Milliseconds from the presentation of that newest frame to this sample (the held image's age since the
     * browser presented it; the screen was captured earlier, by the capture latency, which is not included).
     */
    readonly frame_age_ms: number;
    /** Frames the stream had presented by this sample (its latest progress; may be newer than the held image). */
    readonly stream_presented_frames: number;
    /** When this app took this frame from the stream (the same frame is kept while no new one arrives). */
    readonly taken_at: string;
    /** SHA-256 of the frame's RGBA pixels (width × height × 4, rows top to bottom) as this app read them back. */
    readonly pixels_sha256: string;
    /** Mean absolute luminance change against the previous sample's frame (0..1), null for the first. */
    readonly change: number | null;
  } | null;
  readonly composed: {
    readonly ink_session: string;
    readonly ink_revision: number;
    readonly visible_strokes: number;
    /** The visible strokes by alignment; all but `verified` are drawn dashed, as on screen. */
    readonly ink_marks: InkMarks;
    /** How the composition was made. */
    readonly transformation: string;
    /** SHA-256 of the composed RGBA pixels, same layout as the raw frame's. Equal to it when no ink is visible. */
    readonly pixels_sha256: string;
  } | null;
};

/** The state of a sample, from whether a frame arrived, how late the period ran and whether the stream ended. */
export function sampleState(input: { ended: boolean; newFrame: boolean; lateMs: number; periodMs: number }): { state: SampleState; gap_ms: number | null } {
  if (input.ended) return { state: 'ended', gap_ms: null };
  if (input.lateMs > input.periodMs) return { state: 'gap', gap_ms: Math.round(input.lateMs) };
  return { state: input.newFrame ? 'fresh' : 'no_new_frame', gap_ms: null };
}

/** A region in display DIP coordinates, mapped to frame pixels (the frame may be at device scale). */
export function toFramePixels(
  region: { x: number; y: number; width: number; height: number },
  display: { width: number; height: number },
  frame: { width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const sx = frame.width / display.width;
  const sy = frame.height / display.height;
  const x0 = Math.max(0, Math.floor(region.x * sx));
  const y0 = Math.max(0, Math.floor(region.y * sy));
  const x1 = Math.min(frame.width, Math.ceil((region.x + region.width) * sx));
  const y1 = Math.min(frame.height, Math.ceil((region.y + region.height) * sy));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/** Luminance (0..255) of RGBA pixels. */
export function luminance(rgba: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.floor(rgba.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = Math.round(0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!);
  return out;
}

/** Mean absolute difference of two equal-length luminance arrays, 0..1. */
export function lumaChange(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length / 255;
}

/** A 16×16 luminance fingerprint as base64 (344 characters). */
export const fingerprintToBase64 = (luma: Uint8Array): string => btoa(String.fromCharCode(...luma));
export const fingerprintFromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Pixels under a stroke still look like they did when it was written (mean change under 6%). */
export const SAME_PIXELS = 0.06;

/** Below this spread (standard deviation of luminance, 0..255) a region is too plain to tell whether it moved. */
export const PLAIN_PIXELS = 4;

const spread = (values: ArrayLike<number>): number => {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]!;
  const mean = sum / values.length;
  let sq = 0;
  for (let i = 0; i < values.length; i++) sq += (values[i]! - mean) ** 2;
  return Math.sqrt(sq / values.length);
};

// A stroke's detail: its region as a grid of square cells, fine enough that one line of text does not look like
// another (the 16×16 fingerprint averages a line into cells as wide as several words).
/** At most this many cells in a detail grid; cells are at least 2 frame pixels across. */
export const DETAIL_CELLS = 4096;
/** A detail cell whose luminance moved by more than this (0..255) changed. */
export const DETAIL_DELTA = 16;
/** A change confined to at most two spots this size (DIP) or smaller, such as the mouse pointer where it was and where it is, does not move what is under a stroke. */
export const SPOT_DIP = 40;

export type Detail = { readonly cols: number; readonly rows: number; readonly luma: Uint8Array };

/** The detail grid of a region of this many frame pixels. */
export function detailGrid(widthPx: number, heightPx: number): { cols: number; rows: number } {
  const cell = Math.max(2, Math.ceil(Math.sqrt((widthPx * heightPx) / DETAIL_CELLS)));
  return { cols: Math.max(1, Math.floor(widthPx / cell)), rows: Math.max(1, Math.floor(heightPx / cell)) };
}
/** SPOT_DIP in cells of a detail grid `cols` wide over a region `widthDip` wide. */
export const spotCells = (widthDip: number, cols: number): number => Math.max(1, Math.ceil((SPOT_DIP * cols) / widthDip));

/**
 * How a region's detail compares with the detail taken when its stroke began:
 * - 'same': no cell moved by more than DETAIL_DELTA;
 * - 'spots': the moved cells (at most a quarter) fit in two squares of `spot` cells, and the unchanged cells still
 *   show texture: a pointer passed (where it was when the stroke began, where it is now); what is under it stayed;
 * - 'unclear': such spots, but the rest is too plain to show whether what is under the stroke stayed;
 * - 'changed': anything else, such as a line of text replaced by another.
 */
export function detailChange(then: Detail, now: Detail, spot: number): 'same' | 'spots' | 'unclear' | 'changed' {
  const n = then.cols * then.rows;
  if (now.cols !== then.cols || now.rows !== then.rows || then.luma.length !== n || now.luma.length !== n) return 'changed';
  const moved: number[] = [];
  let [x0, x1, y0, y1] = [then.cols, -1, then.rows, -1];
  for (let i = 0; i < n; i++) {
    if (Math.abs(then.luma[i]! - now.luma[i]!) <= DETAIL_DELTA) continue;
    moved.push(i);
    const x = i % then.cols;
    const y = (i - x) / then.cols;
    [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  }
  if (moved.length === 0) return 'same';
  if (moved.length * 4 > n) return 'changed';
  // Two squares cover the moved cells if they do when placed at opposite corners of their bounding box.
  const within = (ax: number, ay: number, bx: number, by: number): boolean =>
    moved.every((i) => {
      const x = i % then.cols;
      const y = (i - x) / then.cols;
      return (x >= ax && x < ax + spot && y >= ay && y < ay + spot) || (x >= bx && x < bx + spot && y >= by && y < by + spot);
    });
  if (!within(x0, y0, x1 - spot + 1, y1 - spot + 1) && !within(x1 - spot + 1, y0, x0, y1 - spot + 1)) return 'changed';
  const kept = new Set(moved);
  return spread(then.luma.filter((_, i) => !kept.has(i))) >= PLAIN_PIXELS ? 'spots' : 'unclear';
}

export type Alignment = 'verified' | 'changed' | 'unknown';

/**
 * Whether the pixels under a stroke still look as they did when it was written.
 * - With the stroke's detail: 'unknown' without a current frame, when the region is too plain for a comparison to
 *   mean anything, or when pointer-sized spots changed and the rest is plain; 'changed' when the detail changed
 *   beyond two pointer-sized spots; otherwise 'verified'.
 * - With only the 16×16 fingerprint (ink saved before details were kept): 'changed' when it moved by more than
 *   SAME_PIXELS, otherwise 'unknown', never 'verified': at that size one line of text looks like another.
 */
export function alignmentOf(then: Uint8Array | null, now: Uint8Array | null, detail: { then: Detail; now: Detail | null; spot: number } | null = null): Alignment {
  if (detail) {
    if (!detail.now || spread(detail.then.luma) < PLAIN_PIXELS) return 'unknown';
    const d = detailChange(detail.then, detail.now, detail.spot);
    return d === 'changed' ? 'changed' : d === 'unclear' ? 'unknown' : 'verified';
  }
  if (!then || !now || spread(then) < PLAIN_PIXELS) return 'unknown';
  return lumaChange(then, now) > SAME_PIXELS ? 'changed' : 'unknown';
}
