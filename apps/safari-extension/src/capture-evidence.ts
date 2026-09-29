// Checks a screen image the extension received (a PNG data URL from tabs.captureVisibleTab) and
// relates it to the page geometry the probe froze at the mark. DOM-free, so it can be unit tested.
// Nothing here guesses: an empty or non-PNG answer is reported as such, and a geometry that does not
// match the page is "unknown" (no crop), never scaled into place.

import type { PixelRect } from './anchor.ts';

export type PngImage = { readonly bytes: Uint8Array<ArrayBuffer>; readonly width: number; readonly height: number };
export type PngCheck = { readonly ok: true; readonly image: PngImage } | { readonly ok: false; readonly reason: string };

const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Reads a PNG data URL: the signature and the IHDR size must be present; an empty answer is not an image. */
export function readPngDataUrl(dataUrl: unknown): PngCheck {
  // captureVisibleTab can answer with an empty data URL instead of an error (SURF-02).
  if (typeof dataUrl !== 'string' || dataUrl.length === 0 || dataUrl === 'data:,') return { ok: false, reason: 'no image came back (an empty answer)' };
  if (!dataUrl.startsWith(PNG_PREFIX)) return { ok: false, reason: 'the answer is not a PNG image' };
  const encoded = dataUrl.slice(PNG_PREFIX.length);
  if (encoded.length === 0) return { ok: false, reason: 'no image came back (an empty PNG)' };
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    return { ok: false, reason: 'the PNG data is not valid base64' };
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return { ok: false, reason: 'the data is not a PNG image' };
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== 'IHDR') return { ok: false, reason: 'the PNG has no image header' };
  const u32 = (at: number): number => ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
  const width = u32(16);
  const height = u32(20);
  if (width === 0 || height === 0) return { ok: false, reason: 'the PNG has no pixels' };
  return { ok: true, image: { bytes, width, height } };
}

export type Viewport = { readonly width: number; readonly height: number; readonly device_pixel_ratio: number };
export type Geometry = { readonly known: true; readonly scale: number } | { readonly known: false; readonly reason: string };

/** Space a scrollbar may add to the captured image beyond the page's client area (CSS px). */
const SCROLLBAR_ALLOWANCE = 40;

/**
 * Relates the image to the viewport the probe measured (client area, without scrollbars). The capture
 * is the visible tab at device pixels, so each axis must span the client area at devicePixelRatio,
 * plus at most a scrollbar. Anything else (padding, cropping, zoom that the page cannot see) is unknown.
 */
export function imageGeometry(image: Pick<PngImage, 'width' | 'height'>, viewport: Viewport): Geometry {
  const dpr = viewport.device_pixel_ratio;
  if (!(dpr > 0) || !(viewport.width > 0) || !(viewport.height > 0)) return { known: false, reason: 'the page viewport is unknown' };
  const fits = (pixels: number, css: number): boolean => pixels >= Math.floor(css * dpr) - 1 && pixels <= Math.ceil((css + SCROLLBAR_ALLOWANCE) * dpr) + 1;
  if (!fits(image.width, viewport.width) || !fits(image.height, viewport.height)) {
    return {
      known: false,
      reason: `the image (${image.width}×${image.height}) does not match the page viewport (${viewport.width}×${viewport.height} at ${dpr}×), so where the selection lies in it is unknown`,
    };
  }
  return { known: true, scale: dpr };
}

/** What the page shows when a capture is requested and when its answer arrives. */
export type ViewState = {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly scrollX: number;
  readonly scrollY: number;
  /** The visual viewport (pinch zoom); null where the browser does not expose it. */
  readonly zoom: { readonly scale: number; readonly offsetLeft: number; readonly offsetTop: number } | null;
};

const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;

/** Whether two views show the page at the same scroll, size, device pixel ratio and zoom. */
export function sameView(a: ViewState, b: ViewState): boolean {
  const zoom = (z: ViewState['zoom'], w: ViewState['zoom']): boolean =>
    z === null || w === null ? z === w : same(z.scale * 1000, w.scale * 1000) && same(z.offsetLeft, w.offsetLeft) && same(z.offsetTop, w.offsetTop);
  return same(a.scrollX, b.scrollX) && same(a.scrollY, b.scrollY) && same(a.width, b.width) && same(a.height, b.height) && a.dpr === b.dpr && zoom(a.zoom, b.zoom);
}

/** What lies under one sample point of the marked region: the topmost page element and its box. */
export type RegionSample = { readonly element: object | null; readonly rect: PixelRect | null };

/**
 * Why the marked region no longer shows what was marked, comparing the samples taken at the mark with
 * samples taken now: another element is on top at a sample point, or the element there moved or
 * changed size. Null when every sample point still shows the same element at the same place.
 */
export function regionChange(atMark: ReadonlyArray<RegionSample>, now: ReadonlyArray<RegionSample>): string | null {
  for (let i = 0; i < atMark.length; i++) {
    const a = atMark[i]!;
    const b = now[i];
    if (!b || a.element !== b.element) return 'other content took the place of the marked content';
    const r = a.rect;
    const q = b.rect;
    if (r && q && !(same(r.x, q.x) && same(r.y, q.y) && same(r.width, q.width) && same(r.height, q.height))) return 'the marked content moved';
  }
  return null;
}

/**
 * Geometry for a capture requested at `before` and answered at `after`. The image shows what was on
 * screen at some moment in between, so any scroll, zoom or resize in between makes the region unknown;
 * so does pinch zoom, because marks are in layout-viewport coordinates while the image shows the
 * zoomed visual viewport.
 */
export function viewGeometry(image: Pick<PngImage, 'width' | 'height'>, before: ViewState, after: ViewState): Geometry {
  const zoomed = (v: ViewState): boolean => v.zoom !== null && (Math.abs(v.zoom.scale - 1) > 0.001 || !same(v.zoom.offsetLeft, 0) || !same(v.zoom.offsetTop, 0));
  if (zoomed(before) || zoomed(after)) return { known: false, reason: 'the page is pinch-zoomed, so where the mark lies in the image is unknown' };
  const moved =
    !same(before.scrollX, after.scrollX) || !same(before.scrollY, after.scrollY) || !same(before.width, after.width) || !same(before.height, after.height) || before.dpr !== after.dpr;
  if (moved) return { known: false, reason: 'the page scrolled, zoomed or resized while the image was taken, so where the mark lies in it is unknown' };
  return imageGeometry(image, { width: before.width, height: before.height, device_pixel_ratio: before.dpr });
}

/** The marked rectangle in image pixels, rounded outward and clipped to the image; null when nothing is left. */
export function cropBox(rect: PixelRect, geometry: Geometry, image: Pick<PngImage, 'width' | 'height'>): PixelRect | null {
  if (!geometry.known) return null;
  const s = geometry.scale;
  const x0 = Math.max(0, Math.floor(rect.x * s));
  const y0 = Math.max(0, Math.floor(rect.y * s));
  const x1 = Math.min(image.width, Math.ceil((rect.x + rect.width) * s));
  const y1 = Math.min(image.height, Math.ceil((rect.y + rect.height) * s));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/**
 * Waits (e.g. for the page to paint without our chrome), then sends only if the request is still live;
 * returns null without sending when it is not (Stop, a newer mark, the page left). This fences the
 * request itself, not only its answer.
 */
export async function dispatchWhenLive<T>(wait: () => Promise<void>, live: () => boolean, send: () => Promise<T>): Promise<T | null> {
  await wait();
  return live() ? send() : null;
}

/**
 * Only the answer to the latest request counts; answers to older requests, and every answer after
 * stop(), are retired (counted, never shown).
 */
export class LatestOnly {
  #issued = 0;
  #stopped = false;
  #retired = 0;
  issue(): number {
    return ++this.#issued;
  }
  /** Whether an answer to `ticket` may be shown now; if not, it is counted as retired. */
  accept(ticket: number): boolean {
    const ok = !this.#stopped && ticket === this.#issued;
    if (!ok) this.#retired += 1;
    return ok;
  }
  /** Counts an answer that arrived after its request had already given up (timed out). */
  discard(): void {
    this.#retired += 1;
  }
  stop(): void {
    this.#stopped = true;
  }
  /** Whether `ticket` is still the latest request and nothing was stopped (does not count). */
  isCurrent(ticket: number): boolean {
    return !this.#stopped && ticket === this.#issued;
  }
  get stopped(): boolean {
    return this.#stopped;
  }
  get retired(): number {
    return this.#retired;
  }
}
