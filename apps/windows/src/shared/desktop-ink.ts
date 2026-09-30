// The editable ink of one desktop session, as saved on this device (lc-desktop-ink/v1). DOM-free.
//
// The strokes, partial erase, undo/redo and strict reading are the reviewed web ink model
// (apps/safari-extension/src/ink.ts), reused unchanged. A desktop session is not a web page: its
// document identity is the session id (page.origin 'desktop', page.address_sha256 = SHA-256 of that id)
// and no stroke carries a DOM anchor (anchor null). What a stroke was written over is kept as pixel
// evidence of the captured display region instead: a fingerprint for alignment and the contemporaneous
// context, pictures cropped from the actual captured frames (stored next to the ink as <sha256>.png),
// taken when the stroke began and again whenever the pixels under it changed materially while writing.
// What the display cannot tell (the app, link, page or media position shown) is recorded as not observed.

import { emptyInk, parseInk, type InkDocument, type InkPage } from '../../../safari-extension/src/ink.ts';

export const DESKTOP_INK_FORMAT = 'lc-desktop-ink/v1';

/** The display the session captured and wrote over (DIP geometry as Electron reports it). */
export type DesktopDisplay = {
  readonly display_id: string;
  readonly label: string;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly scale_factor: number;
};

type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** What a picture of the display cannot tell about its source. */
export const NOT_OBSERVED = ['source_app', 'source_link', 'page', 'media_position'] as const;
/** At most this many contexts are kept per stroke; later material changes are only counted. */
export const MAX_CONTEXTS = 8;

/** A picture of what the display showed under a stroke while it was being written. */
export type StrokeContext = {
  /** writing_started: the frame held when the stroke began; changed_while_writing: the pixels under it changed materially. */
  readonly reason: 'writing_started' | 'changed_while_writing';
  /** Index of the first stroke point written over this context. */
  readonly from_point: number;
  readonly frame_seq: number;
  readonly frame_taken_at: string;
  /** SHA-256 of the whole raw frame's RGBA pixels as in that frame's sample, or null when that sample did not report it. */
  readonly frame_pixels_sha256: string | null;
  /** The pictured region, in display DIP and in frame pixels. */
  readonly region: Rect;
  readonly region_px: Rect;
  /** The crop of the raw frame (PNG, stored as <sha256>.png next to the ink), or null when it could not be made. */
  readonly image: { readonly sha256: string; readonly width: number; readonly height: number } | null;
  readonly not_observed: typeof NOT_OBSERVED;
};

/**
 * What the display showed under a stroke: a 16×16 luminance fingerprint (base64) of the stroke's region in
 * the raw frame held when the stroke began (the overlay is not in that frame), for alignment, and the
 * contemporaneous contexts. Null evidence on a stroke: no frame was available when it began.
 */
export type PixelEvidence = {
  readonly frame_seq: number;
  readonly frame_sampled_at: string;
  /** The region in display DIP coordinates. */
  readonly region: Rect;
  readonly fingerprint: string;
  readonly contexts: ReadonlyArray<StrokeContext>;
  /** Material changes while writing beyond MAX_CONTEXTS, counted but not pictured. */
  readonly changes_not_kept: number;
};

export type DesktopInk = {
  readonly format: typeof DESKTOP_INK_FORMAT;
  readonly id: string;
  readonly created_at: string;
  /** The session this copy was forked from, when the stored ink of that session could not be continued. */
  readonly forked_from: string | null;
  readonly display: DesktopDisplay;
  readonly ink: InkDocument;
  readonly evidence: Readonly<Record<string, PixelEvidence | null>>;
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isRect = (v: unknown): boolean => isObject(v) && ['x', 'y', 'width', 'height'].every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]));
const isSha256 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** Checks the contexts of one stroke with `points` points, in order; returns what is wrong, or null. */
function contextsProblem(contexts: unknown, points: number): string | null {
  if (!Array.isArray(contexts) || contexts.length === 0 || contexts.length > MAX_CONTEXTS) return 'contexts';
  let from = -1;
  for (const [i, c] of contexts.entries()) {
    if (!isObject(c) || c['reason'] !== (i === 0 ? 'writing_started' : 'changed_while_writing')) return 'context reason';
    if (!isCount(c['from_point']) || (i === 0 ? c['from_point'] !== 0 : c['from_point'] <= from) || c['from_point'] >= Math.max(points, 1)) return 'context order';
    from = c['from_point'];
    if (!isCount(c['frame_seq']) || typeof c['frame_taken_at'] !== 'string' || (c['frame_pixels_sha256'] !== null && !isSha256(c['frame_pixels_sha256']))) return 'context frame';
    if (!isRect(c['region']) || !isRect(c['region_px'])) return 'context region';
    const img = c['image'];
    if (img !== null && (!isObject(img) || !isSha256(img['sha256']) || !Number.isSafeInteger(img['width']) || !Number.isSafeInteger(img['height']) || !((img['width'] as number) > 0) || !((img['height'] as number) > 0))) return 'context image';
    const no = c['not_observed'];
    if (!Array.isArray(no) || no.length !== NOT_OBSERVED.length || no.some((x, k) => x !== NOT_OBSERVED[k])) return 'context unknowns';
  }
  return null;
}

/** The context pictures a document refers to (sha256 of each PNG). */
export const contextImages = (doc: DesktopInk): string[] => [...new Set(Object.values(doc.evidence).flatMap((e) => (e ? e.contexts.flatMap((c) => (c.image ? [c.image.sha256] : [])) : [])))];

/** A session id: 16 lowercase hex digits. */
export const isSessionId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);

/** The ink page of a desktop session (the identity parseInk checks). */
export const desktopPage = (addressSha256: string): InkPage => ({ origin: 'desktop', address_sha256: addressSha256 });

export function newDesktopInk(id: string, addressSha256: string, createdAt: string, display: DesktopDisplay): DesktopInk {
  return { format: DESKTOP_INK_FORMAT, id, created_at: createdAt, forked_from: null, display, ink: emptyInk(desktopPage(addressSha256)), evidence: {} };
}

/** The same ink, history and evidence as a separate copy with its own session id; nothing is dropped. */
export function forkDesktopInk(doc: DesktopInk, id: string, addressSha256: string, createdAt: string): DesktopInk {
  return { ...doc, id, created_at: createdAt, forked_from: doc.id, ink: { ...doc.ink, page: desktopPage(addressSha256) } };
}

/** Reads a stored desktop ink document strictly; anything unreadable is reported, never repaired. */
export function parseDesktopInk(value: unknown, addressSha256: string): { ok: true; doc: DesktopInk } | { ok: false; reason: string } {
  if (!isObject(value) || value['format'] !== DESKTOP_INK_FORMAT) return { ok: false, reason: 'not an lc-desktop-ink/v1 document' };
  if (!isSessionId(value['id']) || typeof value['created_at'] !== 'string') return { ok: false, reason: 'the session description is malformed' };
  if (value['forked_from'] !== null && (!isSessionId(value['forked_from']) || value['forked_from'] === value['id'])) return { ok: false, reason: 'the copy description is malformed' };
  const d = value['display'];
  if (!isObject(d) || typeof d['display_id'] !== 'string' || typeof d['label'] !== 'string' || !isRect(d['bounds']) || typeof d['scale_factor'] !== 'number' || !(d['scale_factor'] > 0)) {
    return { ok: false, reason: 'the display description is malformed' };
  }
  const ink = parseInk(value['ink'], desktopPage(addressSha256));
  if (!ink.ok) return { ok: false, reason: ink.reason };
  const evidence = value['evidence'];
  if (!isObject(evidence)) return { ok: false, reason: 'the pixel evidence is malformed' };
  for (const [id, e] of Object.entries(evidence)) {
    if (!Object.hasOwn(ink.doc.strokes, id)) return { ok: false, reason: `evidence for an unknown stroke ${id}` };
    if (e === null) continue;
    if (!isObject(e) || !Number.isSafeInteger(e['frame_seq']) || typeof e['frame_sampled_at'] !== 'string' || !isRect(e['region']) || typeof e['fingerprint'] !== 'string' || !/^[A-Za-z0-9+/]{342}==$/.test(e['fingerprint']) || !isCount(e['changes_not_kept'])) {
      return { ok: false, reason: `the evidence of stroke ${id} is malformed` };
    }
    const problem = contextsProblem(e['contexts'], ink.doc.strokes[id]!.points.length);
    if (problem) return { ok: false, reason: `the ${problem} of stroke ${id} is malformed` };
    if ((e['contexts'] as Array<{ frame_seq: number }>)[0]!.frame_seq !== e['frame_seq']) return { ok: false, reason: `the evidence of stroke ${id} is not its starting context` };
  }
  // Hidden strokes too: undo or redo can show any of them again.
  for (const stroke of Object.values(ink.doc.strokes)) if (stroke.anchor !== null) return { ok: false, reason: 'a desktop stroke carries a web anchor' };
  return { ok: true, doc: value as unknown as DesktopInk };
}

/** What the session list shows. */
export type DesktopInkSummary = { readonly id: string; readonly created_at: string; readonly forked_from: string | null; readonly display_label: string; readonly strokes: number; readonly revision: number };
export const summarize = (d: DesktopInk): DesktopInkSummary => ({ id: d.id, created_at: d.created_at, forked_from: d.forked_from, display_label: d.display.label, strokes: d.ink.visible.length, revision: d.ink.revision });
