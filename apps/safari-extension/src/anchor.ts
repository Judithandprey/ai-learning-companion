// Fixed selection anchors. Geometry is normalized against the frozen frame
// (origin top-left, x right, y down, each in [0,1]); the resulting Selection is
// deep-frozen so later scrolling, playback or page edits cannot rewrite it.

import type { BoundingBox, Frame, Identifier, Point, Selection } from './contracts.ts';

export type PixelRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export type PixelPoint = { readonly x: number; readonly y: number };
export type Viewport = { readonly width: number; readonly height: number };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

export function isIdentifier(value: unknown): value is Identifier {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128 && IDENTIFIER.test(value);
}

export function isUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string' && UTC.test(value) && Number.isFinite(Date.parse(value));
}

function isUnit(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

// Quantized to 1e-9 (far below a pixel) so equal inputs give equal anchors and
// x + width stays within the server's 1e-12 tolerance.
function clampUnit(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 1e9) / 1e9;
}

const TOLERANCE = 1e-12;

/** Shoelace area of a normalized polygon (absolute value). */
export function polygonArea(points: ReadonlyArray<Point>): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function validViewport(v: Viewport): boolean {
  return Number.isFinite(v.width) && Number.isFinite(v.height) && v.width > 0 && v.height > 0;
}

/** Normalizes a viewport-pixel rectangle; the part outside the frame is clipped. Null when nothing remains. */
export function normalizeRect(rect: PixelRect, viewport: Viewport): BoundingBox | null {
  if (!validViewport(viewport)) return null;
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (!values.every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  const x0 = clampUnit(rect.x / viewport.width);
  const y0 = clampUnit(rect.y / viewport.height);
  const x1 = clampUnit((rect.x + rect.width) / viewport.width);
  const y1 = clampUnit((rect.y + rect.height) / viewport.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return Object.freeze({ x: x0, y: y0, width: clampUnit(x1 - x0), height: clampUnit(y1 - y0) });
}

/** Union of rectangles (e.g. Range.getClientRects of a multi-line selection). */
export function unionRects(rects: ReadonlyArray<PixelRect>): PixelRect | null {
  const usable = rects.filter((r) => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0);
  if (usable.length === 0) return null;
  const x0 = Math.min(...usable.map((r) => r.x));
  const y0 = Math.min(...usable.map((r) => r.y));
  const x1 = Math.max(...usable.map((r) => r.x + r.width));
  const y1 = Math.max(...usable.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Normalizes a closed lasso. Returns the clamped polygon and its bounding box,
 * so the box always contains the polygon. Null for fewer than 3 distinct points
 * or zero area.
 */
export function normalizePolygon(points: ReadonlyArray<PixelPoint>, viewport: Viewport): { bbox: BoundingBox; polygon: ReadonlyArray<Point> } | null {
  if (!validViewport(viewport)) return null;
  if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const polygon = points.map((p) => Object.freeze({ x: clampUnit(p.x / viewport.width), y: clampUnit(p.y / viewport.height) }));
  const distinct = new Set(polygon.map((p) => `${p.x},${p.y}`));
  if (distinct.size < 3 || polygonArea(polygon) < 1e-15) return null;
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const width = clampUnit(Math.max(...xs) - x0);
  const height = clampUnit(Math.max(...ys) - y0);
  if (width <= 0 || height <= 0) return null;
  return { bbox: Object.freeze({ x: x0, y: y0, width, height }), polygon: Object.freeze(polygon) };
}

export type SelectionDraft = {
  readonly id: Identifier;
  readonly bbox: BoundingBox;
  readonly polygon?: ReadonlyArray<Point>;
  readonly selectedText: string;
  readonly inputMode: Selection['input_mode'];
  readonly createdAt: string;
};

export class AnchorError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AnchorError';
    this.code = code;
  }
}

/**
 * Binds a draft to its frozen frame. Identity, source version and media
 * position are copied from the frame only; callers cannot supply them.
 */
export function freezeSelection(frame: Frame, draft: SelectionDraft): Selection {
  const selection: Selection = {
    user_id: frame.user_id,
    source_id: frame.source_id,
    source_version: frame.source_version,
    id: draft.id,
    session_id: frame.session_id,
    device_id: frame.device_id,
    frame_id: frame.frame_id,
    media_position: frame.media_position,
    bbox: Object.freeze({ ...draft.bbox }),
    ...(draft.polygon ? { polygon: Object.freeze(draft.polygon.map((p) => Object.freeze({ x: p.x, y: p.y }))) } : {}),
    selected_text: draft.selectedText,
    concept_candidates: Object.freeze([]),
    input_mode: draft.inputMode,
    created_at: draft.createdAt,
  };
  const problems = selectionProblems(selection, frame);
  if (problems.length > 0) throw new AnchorError('invalid_selection', problems.join('; '));
  return Object.freeze(selection);
}

/** Local mirror of the contract invariants the web end can check before the bridge. */
export function selectionProblems(selection: Selection, frame: Frame): string[] {
  const problems: string[] = [];
  for (const key of ['user_id', 'source_id', 'id', 'session_id', 'device_id', 'frame_id'] as const) {
    if (!isIdentifier(selection[key])) problems.push(`${key} is not an Identifier`);
  }
  for (const key of ['user_id', 'source_id', 'source_version', 'session_id', 'device_id', 'frame_id', 'media_position'] as const) {
    if (selection[key] !== frame[key]) problems.push(`${key} does not match the frozen frame`);
  }
  if (!Number.isSafeInteger(selection.source_version) || selection.source_version < 1) problems.push('source_version must be a positive safe integer');
  if (selection.media_position !== null && !(Number.isFinite(selection.media_position) && selection.media_position >= 0)) {
    problems.push('media_position must be a finite non-negative number or null');
  }
  const b = selection.bbox;
  if (!(isUnit(b.x) && isUnit(b.y) && isUnit(b.width) && isUnit(b.height)) || b.width <= 0 || b.height <= 0) {
    problems.push('bbox must be normalized with positive size');
  } else if (b.x + b.width > 1 + TOLERANCE || b.y + b.height > 1 + TOLERANCE) {
    problems.push('bbox extends outside the frame');
  }
  if (selection.polygon !== undefined) {
    if (selection.polygon.length < 3) problems.push('polygon needs at least 3 points');
    else if (polygonArea(selection.polygon) < 1e-15) problems.push('polygon must enclose a nonzero area');
    for (const p of selection.polygon) {
      if (!isUnit(p.x) || !isUnit(p.y)) problems.push('polygon point outside the frame');
      else if (p.x < b.x - TOLERANCE || p.x > b.x + b.width + TOLERANCE || p.y < b.y - TOLERANCE || p.y > b.y + b.height + TOLERANCE) {
        problems.push('polygon point outside bbox');
      }
    }
  }
  if (!isUtcTimestamp(selection.created_at)) problems.push('created_at must be a UTC timestamp ending in Z');
  return problems;
}
