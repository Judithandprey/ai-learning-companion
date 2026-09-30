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
    /** Frames the system delivered so far on this stream. */
    readonly presented_frames: number;
    /** Milliseconds since the newest delivered frame arrived. */
    readonly frame_age_ms: number;
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

export type Alignment = 'verified' | 'changed' | 'unknown';

/**
 * Whether the pixels under a stroke still look as they did when it was written: `unknown` when there is no
 * evidence, no current frame, or the region is too plain for a comparison to mean anything.
 */
export function alignmentOf(then: Uint8Array | null, now: Uint8Array | null): Alignment {
  if (!then || !now) return 'unknown';
  const mean = then.reduce((a, v) => a + v, 0) / then.length;
  const spread = Math.sqrt(then.reduce((a, v) => a + (v - mean) ** 2, 0) / then.length);
  if (spread < PLAIN_PIXELS) return 'unknown';
  return lumaChange(then, now) <= SAME_PIXELS ? 'verified' : 'changed';
}
