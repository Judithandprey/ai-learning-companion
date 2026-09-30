// The editable ink of one desktop session, as saved on this device (lc-desktop-ink/v1). DOM-free.
//
// The strokes, partial erase, undo/redo and strict reading are the reviewed web ink model
// (apps/safari-extension/src/ink.ts), reused unchanged. A desktop session is not a web page: its
// document identity is the session id (page.origin 'desktop', page.address_sha256 = SHA-256 of that id)
// and no stroke carries a DOM anchor (anchor null). What a stroke was written over is kept as pixel
// evidence of the captured display region instead, next to the ink document.

import { emptyInk, parseInk, type InkDocument, type InkPage } from '../../../safari-extension/src/ink.ts';

export const DESKTOP_INK_FORMAT = 'lc-desktop-ink/v1';

/** The display the session captured and wrote over (DIP geometry as Electron reports it). */
export type DesktopDisplay = {
  readonly display_id: string;
  readonly label: string;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly scale_factor: number;
};

/**
 * What the display showed under a stroke when it was written: a 16×16 luminance fingerprint (base64) of
 * the stroke's region in the raw captured frame (the overlay is not in that frame), with the frame it
 * came from. Null evidence on a stroke: no frame was available.
 */
export type PixelEvidence = {
  readonly frame_seq: number;
  readonly frame_sampled_at: string;
  /** The region in display DIP coordinates. */
  readonly region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly fingerprint: string;
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
    if (!isObject(e) || !Number.isSafeInteger(e['frame_seq']) || typeof e['frame_sampled_at'] !== 'string' || !isRect(e['region']) || typeof e['fingerprint'] !== 'string' || !/^[A-Za-z0-9+/]{342}==$/.test(e['fingerprint'])) {
      return { ok: false, reason: `the evidence of stroke ${id} is malformed` };
    }
  }
  // Hidden strokes too: undo or redo can show any of them again.
  for (const stroke of Object.values(ink.doc.strokes)) if (stroke.anchor !== null) return { ok: false, reason: 'a desktop stroke carries a web anchor' };
  return { ok: true, doc: value as unknown as DesktopInk };
}

/** What the session list shows. */
export type DesktopInkSummary = { readonly id: string; readonly created_at: string; readonly forked_from: string | null; readonly display_label: string; readonly strokes: number; readonly revision: number };
export const summarize = (d: DesktopInk): DesktopInkSummary => ({ id: d.id, created_at: d.created_at, forked_from: d.forked_from, display_label: d.display.label, strokes: d.ink.visible.length, revision: d.ink.revision });
