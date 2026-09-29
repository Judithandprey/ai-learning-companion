// Editable WRITE ink for one page: strokes, partial erase, undo and redo, and a JSON document that
// keeps the originals (lc-web-ink/v1, a web-local format, not a shared contract). DOM-free.
//
// - An erase never deletes a stroke: the stroke leaves the visible set and the pieces that survive
//   the eraser are added as new strokes `derived_from` it. The history links both, so undo, redo and a
//   later export can return to every original.
// - Undo and redo stacks are not stored; they are rebuilt by replaying the history, so a reopened
//   document edits exactly as before. A new edit after an undo starts a branch: the history keeps the
//   undone operations, only the redo stack is cleared.

export type InkPoint = readonly [x: number, y: number, t: number, pressure: number];
export type InkInput = 'pen' | 'mouse' | 'touch';
/** content: page coordinates, follows the page when it scrolls; screen: viewport coordinates, stays put. */
export type InkDisplay = 'content' | 'screen';

/**
 * Evidence of what a content stroke was written over: the element under its first point, as a
 * fingerprint of its tag, source address (images, media) and text, and its rectangle in page
 * coordinates. Used only to say whether the page still shows the same content there; never to move
 * ink. `media_time`: the playback position when the element is a video or audio element (a paused
 * frame changes without the DOM changing). `opaque`: canvas, iframe, embed or object, whose content
 * the DOM does not show, so sameness can never be confirmed after the fact.
 */
export type InkAnchor = {
  readonly text_hash: string;
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly media_time: number | null;
  readonly opaque: boolean;
};

export type InkStroke = {
  readonly id: string;
  readonly input: InkInput;
  readonly display: InkDisplay;
  readonly points: ReadonlyArray<InkPoint>;
  readonly created_at: string;
  /** The page as it was when the stroke was written. */
  readonly source: { readonly title: string; readonly viewport: { readonly width: number; readonly height: number; readonly dpr: number }; readonly scroll: { readonly x: number; readonly y: number } };
  /**
   * What the stroke was written over, taken when it began (null when nothing could be read there).
   * Content strokes are checked against it; for screen-fixed strokes it is provenance only.
   */
  readonly anchor: InkAnchor | null;
  /** Set on a piece left by a partial erase: the stroke it came from. */
  readonly derived_from: string | null;
};

export type InkOp = {
  readonly seq: number;
  readonly at: string;
  readonly op: 'add' | 'erase' | 'undo' | 'redo';
  /** Stroke ids made visible and hidden by this operation. */
  readonly added: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  /** For undo/redo: the add/erase operation undone or redone. */
  readonly target_seq?: number;
};

/**
 * Which page the ink belongs to. The identity is `address_sha256`: SHA-256 of the exact address
 * (origin, path, query and fragment; never credentials), because different query or fragment states
 * can be different problems. No part of the address beyond the origin is kept in the clear (paths and
 * queries can carry tokens).
 */
export type InkPage = { readonly origin: string; readonly address_sha256: string };

export type InkDocument = {
  readonly format: 'lc-web-ink/v1';
  readonly page: InkPage;
  readonly revision: number;
  readonly strokes: Readonly<Record<string, InkStroke>>;
  readonly visible: ReadonlyArray<string>;
  readonly history: ReadonlyArray<InkOp>;
};

export const INK_FORMAT = 'lc-web-ink/v1';

export const emptyInk = (page: InkPage): InkDocument => ({ format: INK_FORMAT, page, revision: 0, strokes: {}, visible: [], history: [] });

/** The undo and redo stacks (sequence numbers of add/erase operations), rebuilt from the history. */
export function stacks(doc: InkDocument): { undo: number[]; redo: number[] } {
  const undo: number[] = [];
  let redo: number[] = [];
  for (const op of doc.history) {
    if (op.op === 'add' || op.op === 'erase') {
      undo.push(op.seq);
      redo = [];
    } else if (op.op === 'undo') {
      const target = undo.pop();
      if (target !== undefined) redo.push(target);
    } else {
      const target = redo.pop();
      if (target !== undefined) undo.push(target);
    }
  }
  return { undo, redo };
}

const apply = (doc: InkDocument, op: Omit<InkOp, 'seq'>, strokes: Readonly<Record<string, InkStroke>> = doc.strokes): InkDocument => {
  const hidden = new Set(op.removed);
  const visible = [...doc.visible.filter((id) => !hidden.has(id)), ...op.added.filter((id) => !doc.visible.includes(id))];
  const seq = doc.history.length === 0 ? 1 : doc.history[doc.history.length - 1]!.seq + 1;
  return { ...doc, revision: doc.revision + 1, strokes, visible, history: [...doc.history, { ...op, seq }] };
};

export function addStroke(doc: InkDocument, stroke: InkStroke, at: string): InkDocument {
  if (doc.strokes[stroke.id]) throw new Error(`stroke ${stroke.id} already exists`);
  return apply(doc, { at, op: 'add', added: [stroke.id], removed: [] }, { ...doc.strokes, [stroke.id]: stroke });
}

/** Points no farther apart than `step`, interpolating time and pressure (so a thin eraser cannot slip between points). */
function densify(points: ReadonlyArray<InkPoint>, step: number): InkPoint[] {
  const out: InkPoint[] = [];
  points.forEach((p, i) => {
    if (i > 0) {
      const q = points[i - 1]!;
      const n = Math.floor(Math.hypot(p[0] - q[0], p[1] - q[1]) / step);
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 1);
        out.push([q[0] + (p[0] - q[0]) * f, q[1] + (p[1] - q[1]) * f, q[2] + (p[2] - q[2]) * f, q[3] + (p[3] - q[3]) * f]);
      }
    }
    out.push(p);
  });
  return out;
}

const segmentDistance = (p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

export type EraserPath = ReadonlyArray<readonly [number, number]>;

/**
 * Erases only what the eraser passes over: every visible stroke whose points come within `radius` of
 * the eraser path given for its display (page coordinates for content strokes, viewport coordinates
 * for screen strokes) is replaced by its surviving pieces. One gesture is one operation, whatever
 * displays it touched. Returns the document unchanged when nothing was touched.
 */
export function erase(doc: InkDocument, paths: Partial<Record<InkDisplay, EraserPath>>, radius: number, at: string, newId: () => string): InkDocument {
  const nearFor = (path: EraserPath | undefined): ((p: InkPoint) => boolean) | null =>
    !path || path.length === 0
      ? null
      : (p) => (path.length === 1 ? Math.hypot(p[0] - path[0]![0], p[1] - path[0]![1]) <= radius : path.some((a, i) => i > 0 && segmentDistance([p[0], p[1]], path[i - 1]!, a) <= radius));
  const nearBy: Record<InkDisplay, ((p: InkPoint) => boolean) | null> = { content: nearFor(paths.content), screen: nearFor(paths.screen) };
  const boxOf = (pts: ReadonlyArray<readonly [number, number, ...unknown[]]>, pad: number) => ({
    x0: Math.min(...pts.map((p) => p[0])) - pad,
    y0: Math.min(...pts.map((p) => p[1])) - pad,
    x1: Math.max(...pts.map((p) => p[0])) + pad,
    y1: Math.max(...pts.map((p) => p[1])) + pad,
  });
  const reach = { content: paths.content?.length ? boxOf(paths.content, radius) : null, screen: paths.screen?.length ? boxOf(paths.screen, radius) : null };
  const strokes: Record<string, InkStroke> = { ...doc.strokes };
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of doc.visible) {
    const stroke = doc.strokes[id]!;
    const near = nearBy[stroke.display];
    const r = reach[stroke.display];
    if (!near || !r) continue;
    const b = boxOf(stroke.points, 0);
    if (b.x1 < r.x0 || b.x0 > r.x1 || b.y1 < r.y0 || b.y0 > r.y1) continue; // far from the eraser
    const points = densify(stroke.points, Math.max(0.5, radius / 2));
    if (!points.some(near)) continue;
    removed.push(id);
    let run: InkPoint[] = [];
    const keep = (): void => {
      if (run.length >= 2) {
        const piece: InkStroke = { ...stroke, id: newId(), points: run, derived_from: stroke.derived_from ?? stroke.id };
        strokes[piece.id] = piece;
        added.push(piece.id);
      }
      run = [];
    };
    for (const p of points) {
      if (near(p)) keep();
      else run.push(p);
    }
    keep();
  }
  if (removed.length === 0) return doc;
  return apply(doc, { at, op: 'erase', added, removed }, strokes);
}

export function undo(doc: InkDocument, at: string): InkDocument {
  const target = stacks(doc).undo.pop();
  if (target === undefined) return doc;
  const t = doc.history.find((op) => op.seq === target)!;
  return apply(doc, { at, op: 'undo', target_seq: target, added: [...t.removed], removed: [...t.added] });
}

export function redo(doc: InkDocument, at: string): InkDocument {
  const target = stacks(doc).redo.pop();
  if (target === undefined) return doc;
  const t = doc.history.find((op) => op.seq === target)!;
  return apply(doc, { at, op: 'redo', target_seq: target, added: [...t.added], removed: [...t.removed] });
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Reads a stored document strictly; anything unreadable is reported, never repaired or guessed. */
export function parseInk(value: unknown, page: InkPage): { ok: true; doc: InkDocument } | { ok: false; reason: string } {
  if (!isObject(value) || value['format'] !== INK_FORMAT) return { ok: false, reason: 'the stored ink is not an lc-web-ink/v1 document' };
  const p = value['page'];
  if (!isObject(p) || p['address_sha256'] !== page.address_sha256 || p['origin'] !== page.origin) return { ok: false, reason: 'the stored ink belongs to another page' };
  const strokes = value['strokes'];
  const visible = value['visible'];
  const history = value['history'];
  if (!isObject(strokes) || !Array.isArray(visible) || !Array.isArray(history) || value['revision'] !== history.length) return { ok: false, reason: 'the stored ink is incomplete' };
  for (const [id, s] of Object.entries(strokes)) {
    if (!isObject(s) || s['id'] !== id || !['pen', 'mouse', 'touch'].includes(s['input'] as string) || !['content', 'screen'].includes(s['display'] as string)) return { ok: false, reason: `stroke ${id} is malformed` };
    const pts = s['points'];
    if (!Array.isArray(pts) || pts.length === 0 || !pts.every((q) => Array.isArray(q) && q.length === 4 && q.every((n) => typeof n === 'number' && Number.isFinite(n)))) return { ok: false, reason: `stroke ${id} has malformed points` };
    const a = s['anchor'];
    const rect = isObject(a) ? a['rect'] : null;
    const anchorOk =
      a === null ||
      (isObject(a) && typeof a['text_hash'] === 'string' && isObject(rect) && ['x', 'y', 'width', 'height'].every((k) => typeof rect[k] === 'number' && Number.isFinite(rect[k])) && (a['media_time'] === null || (typeof a['media_time'] === 'number' && Number.isFinite(a['media_time']))) && typeof a['opaque'] === 'boolean');
    if (!anchorOk) return { ok: false, reason: `stroke ${id} has a malformed anchor` };
    if (s['derived_from'] !== null && !(typeof s['derived_from'] === 'string' && Object.hasOwn(strokes, s['derived_from']))) return { ok: false, reason: `stroke ${id} is malformed` };
  }
  if (!visible.every((id) => typeof id === 'string' && Object.hasOwn(strokes, id))) return { ok: false, reason: 'the visible strokes are not all stored' };
  const doc = value as unknown as InkDocument;
  // Every operation must be what this module would have recorded, and the visible set must be what
  // the history produces.
  const known = (ids: unknown): boolean => Array.isArray(ids) && ids.every((id) => typeof id === 'string' && Object.hasOwn(strokes, id));
  const same = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean => a.length === b.length && a.every((id, i) => id === b[i]);
  let replay: InkDocument = { ...emptyInk(page), strokes: doc.strokes };
  for (const [i, op] of doc.history.entries()) {
    if (!isObject(op) || op.seq !== i + 1 || typeof op.at !== 'string' || !known(op.added) || !known(op.removed)) return { ok: false, reason: 'the stored history is malformed' };
    if (op.op === 'undo' || op.op === 'redo') {
      const s = stacks(replay);
      const targetSeq = op.op === 'undo' ? s.undo.at(-1) : s.redo.at(-1);
      const t = replay.history.find((h) => h.seq === targetSeq);
      const [added, removed] = t ? (op.op === 'undo' ? [t.removed, t.added] : [t.added, t.removed]) : [[], []];
      if (!t || op.target_seq !== targetSeq || !same(op.added, added) || !same(op.removed, removed)) return { ok: false, reason: 'the stored history is malformed' };
    } else if (op.op === 'add') {
      // One new stroke, hiding nothing.
      if (op.added.length !== 1 || op.removed.length !== 0 || replay.history.some((h) => h.added.includes(op.added[0]!))) return { ok: false, reason: 'the stored history is malformed' };
    } else if (op.op === 'erase') {
      // Visible strokes replaced by new pieces derived from them.
      const ok = op.removed.length > 0 && op.removed.every((id) => replay.visible.includes(id)) && op.added.every((id) => doc.strokes[id]!.derived_from !== null && !replay.history.some((h) => h.added.includes(id)));
      if (!ok) return { ok: false, reason: 'the stored history is malformed' };
    } else {
      return { ok: false, reason: 'the stored history is malformed' };
    }
    replay = apply(replay, op, doc.strokes);
  }
  const sameVisible = replay.visible.length === doc.visible.length && replay.visible.every((id) => doc.visible.includes(id));
  if (!sameVisible) return { ok: false, reason: 'the stored visible strokes do not match their history' };
  return { ok: true, doc };
}
