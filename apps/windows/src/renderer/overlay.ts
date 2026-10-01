// The overlay on the captured display: ongoing capture of the whole display, and NAV / ASK / WRITE
// input over it, with editable ink saved at every change. No AI is connected. Nothing is sent, except that in the
// explicit development mode the main process also stores retained frames and ink originals in a local test service.
//
// Capture: the desktop source the user chose is sampled every second. A sample records what actually
// arrived (the raw frame, as the system delivered it; this window is excluded from capture) and a
// composed frame: that raw frame with this app's editable ink drawn over it at the display geometry,
// pinned to the ink revision. Nothing is composed without a raw frame: a missing frame is a gap.
//
// Input: NAV passes clicks through to the user's apps (only the toolbar takes the pointer). WRITE and
// ASK take pointer input: a pen writes (its eraser end erases); a mouse writes only when mouse writing
// is on (this window cannot hand a mouse click to the app below while a pen writes: switch to NAV for
// that). ASK circles a region and shows its composed pixels; finishing or cancelling returns to the
// previous mode.
//
// Context: a stroke keeps pictures of what it was written over, cropped from the actual raw frames: the
// frame held when the stroke began (kept open until the stroke ends), and another whenever the pixels
// under the stroke changed materially while writing. They are saved with the ink.
//
// Ink placement: screen-fixed ink stays where it was written. Following content is NOT established on
// the desktop: such ink also stays where it was written, is always drawn as not verified and says so. A
// screen-fixed stroke is drawn solid only while the pixels under it verifiably still look as they did
// when it was written; changed, too plain to tell, or not captured is drawn dashed.
//
// Saving: every change is saved; a failed save is reported and retried with the next change and at
// Stop. Stored ink that cannot be continued is left untouched and this ink is saved as a separate copy.

import { addStroke, erase, redo, stacks, undo, type InkDisplay, type InkDocument, type InkPoint, type InkStroke } from '../../../safari-extension/src/ink.ts';
import { INITIAL_MODE_STATE, reduceMode, type Mode, type ModeState } from '../../../safari-extension/src/mode.ts';
import { contextImages, forkDesktopInk, MAX_CONTEXTS, NOT_OBSERVED, PICTURE_BYTES_PER_SAVE, PICTURES_PER_SAVE, type DesktopDisplay, type DesktopInk, type PixelEvidence, type StrokeContext } from '../shared/desktop-ink.ts';
import { decideRetention, DEFAULT_RETENTION_POLICY, type Retained, type RetentionPolicy } from '../shared/retention.ts';
import { alignmentOf, DETAIL_DELTA, detailChange, detailGrid, fingerprintFromBase64, fingerprintToBase64, lumaChange, luminance, sampleState, toFramePixels, type Alignment, type Detail, type DisplaySample, type InkMarks } from '../shared/samples.ts';

type Api = {
  ready(): Promise<{ source_id: string; display: DesktopDisplay; doc: DesktopInk; address_sha256: string; retention_policy?: RetentionPolicy; development?: boolean; subscription?: boolean } | null>;
  retainFrame(facts: unknown, raw: Uint8Array, composed: Uint8Array | null, ink: Uint8Array | null): Promise<{ ok: true } | { ok: false; reason: string; limit?: true; retry?: true }>;
  notRetained(run: { from_seq: number; to_seq: number; samples: number; reason: string }): void;
  observationGap(gap: { sample_seq: number; gap_ms: number; sampled_at: string; monotonic_ms: number }): void;
  stopping(pendingFrames: Array<{ sample_seq: number; deferred_samples_not_retained: number[] }>): void;
  armCapture(): Promise<boolean>;
  sample(s: DisplaySample): void;
  interactive(on: boolean): void;
  saveInk(doc: DesktopInk, images: Array<{ sha256: string; bytes: Uint8Array }>): Promise<({ ok: true } | { ok: false; reason: string; conflict?: true }) & { pictures_received: string[]; pictures_invalid: string[] }>;
  loadResult(id: string, ok: boolean, reason: string): void;
  ended(reason: string): void;
  stopped(unsaved: string | null): void;
  onLoadDoc(fn: (doc: DesktopInk) => void): void;
  onStop(fn: (reason: string) => void): void;
  askSelection(facts: unknown, png: Uint8Array, ink: Uint8Array): Promise<{ ok: true; selection_id: string } | { ok: false; reason: string }>;
  askSubmit(selectionId: string, question: string, assistance: string): Promise<{ ok: true; request_id: string; model: string | null } | { ok: false; reason: string }>;
  askCancel(selectionId: string): void;
  askClosed(): void;
  askPresented(selectionId: string, requestId: string, shown: boolean): Promise<Saved>;
  askSave(selectionId: string): Promise<Saved>;
  onAskResult(fn: (selectionId: string, requestId: string, outcome: AskOutcome, record: Saved) => void): void;
};
/** Whether the selection's record (the question and how it ended) is written on this device; if not, why. */
type Saved = { saved: boolean; reason: string | null };
/** How a question to ChatGPT ended, as the main process says it (an answer only for the request that was sent). */
type AskOutcome =
  | { status: 'answered'; answer: { text: string; model: string; latency_ms: number } }
  | { status: 'refused'; reason: string }
  | { status: 'cancelled'; uncertain: boolean }
  | { status: 'uncertain'; reason: string };
const lc = (globalThis as unknown as { lc: Api }).lc;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const PERIOD_MS = 1000;
/** Context pictures larger than this are scaled down. */
const MAX_CROP_PIXELS = 4_000_000;
const ERASER_RADIUS = 10;
const now = (): string => new Date().toISOString();
const newId = (): string => `stk_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
const hex = (buf: ArrayBuffer): string => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

const info = await lc.ready();
if (!info) throw new Error('no session');
const display = info.display;
/**
 * The development capture link is on (the main process may also store retained frames in a local test capture
 * service). Whether it is storing now changes while a card is shown, so a card never says; the control window does.
 */
const development = info.development === true;
/**
 * The managed ChatGPT subscription is configured: an ASK selection can be sent, with the user's question, when the
 * user presses Ask on its card. Nothing else is ever sent to an AI, and no AI watches the screen.
 */
const subscription = info.subscription === true;
/** The card's selection, as the main process retained it for a question (only with the subscription configured). */
let asked: {
  card: number;
  selection: string | null;
  request: string | null;
  submitting: boolean;
  cancelling: boolean;
  /** How the question ended, said by the main process before its submit was acknowledged here. */
  early: { request: string; outcome: AskOutcome; record: Saved } | null;
  /** Why how a question of this card ended is not written on this device yet (the main process said so), or null. */
  unsaved: string | null;
  /** The status last said with that, and what it is about: said again with the answer to Save. */
  said: { text: string; what: string } | null;
} | null = null;
let cardSeq = 0;
let doc: DesktopInk = info.doc;
let mode: ModeState = INITIAL_MODE_STATE;
let tool: 'pen' | 'eraser' = 'pen';
let placement: InkDisplay = 'screen';
let mouseWrites = false;
let saveText = 'Ink is saved on this device at every change.';
let saveChain: Promise<void> = Promise.resolve();
/** Why the newest ink is not saved, or null when it is. */
let unsaved: string | null = null;
/** The document as last saved (a new, empty session has nothing to save). */
let lastSaved: DesktopInk | null = doc;
/** Saves what changed since the last save, after any save in progress. */
const saveIfChanged = (): Promise<void> => (doc === lastSaved ? saveChain : save());
let transientHint = '';

// ---- capture ---------------------------------------------------------------------------------------
const video = document.createElement('video');
video.muted = true;
let stream: MediaStream | null = null;
let presented = 0;
let presentedAt = 0;
let presentedSeen = 0;
/**
 * The frame held: taken in sample `seq`, when `presented` frames had been presented, the newest of them at
 * `presentedAt` (performance time of its callback). The image is that frame, or one presented just after it.
 */
type HeldFrame = { bitmap: ImageBitmap; seq: number; at: string; presented: number; presentedAt: number };
let raw: HeldFrame | null = null;
/** The latest composed frame with what it was made from. */
/**
 * The latest composition, with what it was drawn from, taken together before anything is awaited: the exact ink
 * document (its JSON bytes, the editable original retained with the frame), a gesture still in progress (drawn on
 * screen, in neither the composition nor that document) and strokes whose evidence was still being made.
 */
let composed: {
  canvas: OffscreenCanvas;
  frameSeq: number;
  inkId: string;
  revision: number;
  visible: number;
  marks: InkMarks;
  ink: Uint8Array;
  uncommitted: { kind: Gesture['kind']; points: number } | null;
  evidencePending: string[];
} | null = null;
/** Strokes whose evidence (and context pictures) is still being made. */
const evidencePending = new Set<string>();
/** Frames kept open for strokes written over them, with how many strokes hold each. */
const pins = new Map<ImageBitmap, number>();
/** Closes a frame nothing uses any more. */
const release = (bitmap: ImageBitmap): void => {
  if (!pins.has(bitmap) && raw?.bitmap !== bitmap) bitmap.close();
};
const pin = (bitmap: ImageBitmap): void => void pins.set(bitmap, (pins.get(bitmap) ?? 0) + 1);
const unpin = (bitmap: ImageBitmap): void => {
  const n = (pins.get(bitmap) ?? 1) - 1;
  if (n > 0) return void pins.set(bitmap, n);
  pins.delete(bitmap);
  release(bitmap);
};
/** Strokes waiting for the sample taken at their pen-down. */
let startsWaiting = 0;
/** SHA-256 of whole frames' pixels by frame seq, as their samples reported them (the last few). */
const frameShas = new Map<number, string>();
let prevGrid: Uint8Array | null = null;
let seq = 0;
let ended = false;
let endReason = '';
const samples: DisplaySample[] = [];
const source = { kind: 'display' as const, display_id: display.display_id, source_id: info.source_id, label: display.label, bounds: display.bounds, scale_factor: display.scale_factor };

const onFrame = (_at: number, meta: VideoFrameCallbackMetadata): void => {
  presented = meta.presentedFrames;
  presentedAt = meta.presentationTime; // when the frame was handed over for display (not when it was captured)
  video.requestVideoFrameCallback(onFrame);
};

async function startCapture(): Promise<void> {
  let got: MediaStream;
  try {
    // One capture per session; the main process answers with the display the user chose.
    if (!(await lc.armCapture())) return endCapture('the capture of this session was already used or refused');
    if (ended) return;
    got = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { frameRate: { max: 10 } } });
  } catch (error) {
    endCapture(`the display could not be captured (${error instanceof Error ? error.message : String(error)})`);
    return;
  }
  const track = got.getVideoTracks()[0];
  if (ended || !track || got.getAudioTracks().length > 0 || track.getSettings().displaySurface !== 'monitor') {
    for (const t of got.getTracks()) t.stop(); // arrived after the end, or not the whole display: never shown
    if (!ended) endCapture('the capture was not the whole chosen display, so it was stopped');
    return;
  }
  stream = got;
  track.addEventListener('ended', () => endCapture('Windows stopped delivering this display (permission withdrawn, display removed or capture ended)'));
  video.srcObject = stream;
  video.requestVideoFrameCallback(onFrame);
  try {
    await video.play();
  } catch (error) {
    endCapture(`the captured display could not be shown (${error instanceof Error ? error.message : String(error)})`);
  }
}
/**
 * Ends the capture, and with it this overlay's input: from here on no new writing, erasing, undo/redo, mode
 * change or ASK is accepted. A stroke already being written when this happens is kept by the Stop that follows
 * (every end of the capture leads to one), which also lets the pointer through to the apps below.
 */
function endCapture(reason: string): void {
  if (ended) return;
  ended = true;
  endReason = reason;
  for (const t of stream?.getTracks() ?? []) t.stop();
  sampling = sampling.then(() => takeSample(0)); // after a sample in progress, which is then dropped
  lc.ended(reason);
  // No question is asked after the end. One that is out is cancelled by the main process; an answer already shown stays.
  if (asked) {
    askForm('hidden');
    if (asked.request || asked.submitting) {
      asked.cancelling = true;
      askStatus('The capture ended: the question that was out is cancelled, and no answer to it is shown.');
    } else if ($('answerBox').hidden && asked.unsaved === null) askStatus('The capture ended: nothing more is asked.'); // what is not saved stays said
  }
  render();
}

/** A grid of the frame's luminance (64×40) for change between samples. */
function grid(bitmap: ImageBitmap): Uint8Array {
  const c = new OffscreenCanvas(64, 40);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high'; // area-like averaging: a small local change moves its cell
  g.drawImage(bitmap, 0, 0, 64, 40);
  return luminance(g.getImageData(0, 0, 64, 40).data);
}
/** SHA-256 of an image's RGBA pixels at its own size. */
async function pixelsSha(img: ImageBitmap | OffscreenCanvas): Promise<string> {
  const c = img instanceof OffscreenCanvas ? img : new OffscreenCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  if (c !== img) g.drawImage(img, 0, 0);
  return hex(await crypto.subtle.digest('SHA-256', g.getImageData(0, 0, c.width, c.height).data));
}

/** The raw frame with the given ink drawn over it at the display geometry. */
/** Ink whose alignment is not verified is drawn dashed, exactly as on screen. */
function compose(bitmap: ImageBitmap, ink: InkDocument): OffscreenCanvas {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = c.getContext('2d')!;
  g.drawImage(bitmap, 0, 0);
  g.scale(bitmap.width / display.bounds.width, bitmap.height / display.bounds.height);
  drawInk(g as unknown as CanvasRenderingContext2D, ink, true);
  return c;
}
/** The visible strokes by how they are drawn: verified solid; changed, unknown and following content dashed. */
function inkMarks(ink: InkDocument): InkMarks {
  const m = { verified: 0, changed: 0, unknown: 0, following_content: 0 };
  for (const id of ink.visible) {
    const a = aligned.get(id);
    if (ink.strokes[id]!.display === 'content') m.following_content += 1;
    else if (a === 'verified') m.verified += 1;
    else if (a === 'changed') m.changed += 1;
    else m.unknown += 1;
  }
  return m;
}

/**
 * One sample. Samples run one at a time (`sampling`); one still in progress when the capture ends is
 * dropped, so nothing live is reported after the end. What is composed is pinned: the frame and the ink
 * document are taken once, before anything is awaited.
 */
async function takeSample(lateMs: number): Promise<void> {
  const newFrame = presented > presentedSeen;
  const presentedNow = presented; // the stream's progress when the image is taken, kept with the image
  const presentedAtNow = presentedAt;
  presentedSeen = presented;
  const { state, gap_ms } = sampleState({ ended, newFrame, lateMs, periodMs: PERIOD_MS });
  const mySeq = ++seq;
  if (!ended && video.videoWidth > 0 && (newFrame || !raw)) {
    const bitmap = await createImageBitmap(video);
    if (ended) {
      if (startsWaiting === 0) return bitmap.close();
      // Taken before the end for a stroke that began just before it: held for that stroke's starting context.
      const previous = raw;
      raw = { bitmap, seq: mySeq, at: now(), presented: presentedNow, presentedAt: presentedAtNow };
      if (previous) release(previous.bitmap);
      return;
    }
    const previous = raw;
    raw = { bitmap, seq: mySeq, at: now(), presented: presentedNow, presentedAt: presentedAtNow };
    if (previous) release(previous.bitmap); // unless a stroke in progress was written over it
    recheckAlignment();
    noteContextChange();
  }
  const held = ended ? null : raw;
  const inkDoc = doc;
  let change: number | null = null;
  composed = null;
  let heldGrid: Uint8Array | null = null;
  if (held) {
    const g = grid(held.bitmap);
    heldGrid = g;
    change = prevGrid ? lumaChange(prevGrid, g) : null;
    prevGrid = g;
    composed = {
      canvas: compose(held.bitmap, inkDoc.ink),
      frameSeq: held.seq,
      inkId: inkDoc.id,
      revision: inkDoc.ink.revision,
      visible: inkDoc.ink.visible.length,
      marks: inkMarks(inkDoc.ink),
      ink: new TextEncoder().encode(JSON.stringify(inkDoc)),
      uncommitted: gesture ? { kind: gesture.kind, points: gesture.points.length } : null,
      evidencePending: [...evidencePending].filter((id) => Object.hasOwn(inkDoc.ink.strokes, id)).sort(),
    };
  }
  const made = composed;
  const rawSha = held ? await pixelsSha(held.bitmap) : null;
  if (held && rawSha) {
    frameShas.set(held.seq, rawSha);
    for (const k of frameShas.keys()) if (frameShas.size > 30) frameShas.delete(k);
  }
  const composedSha = made ? await pixelsSha(made.canvas) : null;
  if (ended && state !== 'ended') return;
  const sample: DisplaySample = {
    seq: mySeq,
    sampled_at: now(),
    monotonic_ms: Math.round(performance.now()),
    state,
    gap_ms,
    source,
    raw:
      held && rawSha
        ? {
            width: held.bitmap.width,
            height: held.bitmap.height,
            // The held image's own facts; newer frames that arrived meanwhile only count as stream progress.
            presented_frames: held.presented,
            frame_age_ms: Math.round(performance.now() - held.presentedAt),
            stream_presented_frames: presented,
            taken_at: held.at,
            pixels_sha256: rawSha,
            change,
          }
        : null,
    composed:
      held && made && composedSha
        ? {
            ink_session: made.inkId,
            ink_revision: made.revision,
            visible_strokes: made.visible,
            ink_marks: made.marks,
            transformation: `raw frame ${held.bitmap.width}×${held.bitmap.height} px with this app's editable ink (revision ${made.revision}, ${made.visible} visible stroke(s)) drawn over it at ${(held.bitmap.width / display.bounds.width).toFixed(3)} px per DIP, strokes whose alignment is not verified (changed, unknown or following content) dashed as on screen; the overlay itself is excluded from capture, so the ink is added once`,
            pixels_sha256: composedSha,
          }
        : null,
  };
  // A known gap is kept in the retention record as measured, whatever the pixels or the ink did.
  if (sample.state === 'gap' && sample.gap_ms !== null) lc.observationGap({ sample_seq: sample.seq, gap_ms: sample.gap_ms, sampled_at: sample.sampled_at, monotonic_ms: sample.monotonic_ms });
  if (held && heldGrid && made && rawSha && sample.raw && sample.composed) considerRetention(sample, held, heldGrid, made, rawSha);
  samples.push(sample);
  if (samples.length > 60) samples.shift();
  lc.sample(sample);
  render();
}
let sampling: Promise<void> = Promise.resolve();
let dueAt = performance.now() + PERIOD_MS;
function tick(): void {
  if (ended) return;
  const late = performance.now() - dueAt;
  dueAt = performance.now() + PERIOD_MS;
  sampling = sampling.then(() => takeSample(late)).catch(() => undefined);
  void sampling.finally(() => setTimeout(tick, PERIOD_MS));
}

// ---- pixel evidence and alignment ---------------------------------------------------------------------
/** A stroke's region (DIP), padded. */
const regionOf = (points: ReadonlyArray<InkPoint>): { x: number; y: number; width: number; height: number } => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs) - 8;
  const y = Math.min(...ys) - 8;
  return { x, y, width: Math.max(...xs) + 8 - x, height: Math.max(...ys) + 8 - y };
};
function fingerprintOf(region: { x: number; y: number; width: number; height: number }, bitmap: ImageBitmap | null = raw?.bitmap ?? null): Uint8Array | null {
  if (!bitmap) return null;
  const r = toFramePixels(region, display.bounds, bitmap);
  if (!r) return null;
  const c = new OffscreenCanvas(16, 16);
  const g = c.getContext('2d')!;
  g.drawImage(bitmap, r.x, r.y, r.width, r.height, 0, 0, 16, 16);
  return luminance(g.getImageData(0, 0, 16, 16).data);
}
/** The region in finer detail (averaged into the grid `like`, or into one sized for the region in this frame). */
function detailOf(region: { x: number; y: number; width: number; height: number }, bitmap: ImageBitmap | null, like?: { cols: number; rows: number }): Detail | null {
  if (!bitmap) return null;
  const r = toFramePixels(region, display.bounds, bitmap);
  if (!r) return null;
  const { cols, rows } = like ?? detailGrid(r.width, r.height);
  const c = new OffscreenCanvas(cols, rows);
  const g = c.getContext('2d')!; // drawn where the frame is (GPU), reading back only the grid
  g.imageSmoothingQuality = 'high'; // area-like averaging, as for the retention grid
  g.drawImage(bitmap, r.x, r.y, r.width, r.height, 0, 0, cols, rows);
  return { cols, rows, luma: luminance(g.getImageData(0, 0, cols, rows).data) };
}
/** Whether what is under `region` differs between two frames beyond rendering noise (any change, however small). */
function contentChanged(region: { x: number; y: number; width: number; height: number }, before: ImageBitmap, after: ImageBitmap): boolean {
  const a = detailOf(region, before);
  const b = a && detailOf(region, after, a);
  return !!a && !!b && detailChange(a, b) === 'changed';
}
/** The pictured area around a stroke: its region widened for context, within the display (DIP). */
function contextArea(region: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, region.x - 40);
  const y = Math.max(0, region.y - 40);
  return { x, y, width: Math.min(display.bounds.width, region.x + region.width + 40) - x, height: Math.min(display.bounds.height, region.y + region.height + 40) - y };
}
/** While a stroke is written, a new frame whose pixels under it changed materially adds a context. */
function noteContextChange(): void {
  const g = gesture;
  const last = g?.contexts.at(-1);
  // Compared with what was last seen under the stroke: the last picture, or beyond the cap the last change counted.
  const base = g?.seen ?? last?.frame;
  if (!g || g.kind !== 'ink' || !last || !base || !raw || base.bitmap === raw.bitmap) return;
  if (!contentChanged(regionOf(g.points), base.bitmap, raw.bitmap)) return;
  if (!g.seen && last.reason === 'changed_while_writing' && g.points.length <= last.from_point) {
    // Nothing was written since the last change: that context is replaced by the newer frame.
    const old = last.frame.bitmap;
    last.frame = raw;
    pin(raw.bitmap);
    unpin(old);
    return;
  }
  if (g.contexts.length >= MAX_CONTEXTS) {
    // Beyond the cap each change is counted once, returns included; the next is compared with this frame.
    g.changesNotKept += 1;
    pin(raw.bitmap);
    if (g.seen) unpin(g.seen.bitmap);
    g.seen = raw;
    return;
  }
  g.contexts.push({ frame: raw, from_point: g.points.length, reason: 'changed_while_writing' });
  pin(raw.bitmap);
}
/** Lets go of the frames a gesture kept open. */
function releaseGesture(g: Gesture | null): void {
  if (!g?.open) return;
  g.open = false;
  for (const c of g.contexts) unpin(c.frame.bitmap);
  if (g.seen) unpin(g.seen.bitmap);
  g.seen = null;
}
/**
 * The evidence of a finished stroke from the frames held while it was written: the fingerprint of the
 * starting frame (for alignment) and one crop per context, drawn now; the pictures are encoded after.
 */
function strokeEvidence(g: Gesture): { evidence: PixelEvidence; crops: Array<OffscreenCanvas | null> } | null {
  // A change after the last point is not under this stroke; from_point strictly increases.
  const contexts = g.contexts.filter((c, i) => c.from_point < g.points.length && (i === 0 || c.from_point > g.contexts[i - 1]!.from_point));
  const start = contexts[0];
  const region = regionOf(g.points);
  const print = start ? fingerprintOf(region, start.frame.bitmap) : null;
  const detail = start ? detailOf(region, start.frame.bitmap) : null;
  const area = contextArea(region);
  const areaPx = start ? toFramePixels(area, display.bounds, start.frame.bitmap) : null;
  if (!start || !print || !detail || !areaPx || area.width <= 0 || area.height <= 0) return null;
  const crops = contexts.map((c) => {
    const r = toFramePixels(area, display.bounds, c.frame.bitmap);
    if (!r) return null;
    // At most 4 megapixels: a larger crop is scaled down (its image size then differs from region_px).
    const scale = Math.min(1, Math.sqrt(MAX_CROP_PIXELS / (r.width * r.height)));
    const out = new OffscreenCanvas(Math.max(1, Math.round(r.width * scale)), Math.max(1, Math.round(r.height * scale)));
    out.getContext('2d')!.drawImage(c.frame.bitmap, r.x, r.y, r.width, r.height, 0, 0, out.width, out.height);
    return out;
  });
  const records: StrokeContext[] = contexts.map((c) => ({
    reason: c.reason,
    from_point: c.from_point,
    frame_seq: c.frame.seq,
    frame_taken_at: c.frame.at,
    frame_pixels_sha256: frameShas.get(c.frame.seq) ?? null,
    region: area,
    region_px: toFramePixels(area, display.bounds, c.frame.bitmap) ?? areaPx,
    image: null,
    not_observed: NOT_OBSERVED,
  }));
  const evidence: PixelEvidence = {
    frame_seq: start.frame.seq,
    frame_sampled_at: start.frame.at,
    region,
    fingerprint: fingerprintToBase64(print),
    detail: { cols: detail.cols, rows: detail.rows, luma: fingerprintToBase64(detail.luma) },
    contexts: records,
    changes_not_kept: g.changesNotKept,
  };
  return { evidence, crops };
}
const aligned = new Map<string, Alignment>();
const evidenceOf = (s: InkStroke): PixelEvidence | null => doc.evidence[s.id] ?? (s.derived_from ? (doc.evidence[s.derived_from] ?? null) : null);
/** How a stroke's evidence compares with the current frame (the detail when the evidence has it, else the fingerprint). */
function alignmentNow(e: PixelEvidence | null): Alignment {
  const current = e && !ended ? (raw?.bitmap ?? null) : null;
  if (e?.detail) {
    const then: Detail = { cols: e.detail.cols, rows: e.detail.rows, luma: fingerprintFromBase64(e.detail.luma) };
    return alignmentOf(null, null, { then, now: detailOf(e.region, current, then) });
  }
  return alignmentOf(e ? fingerprintFromBase64(e.fingerprint) : null, e && current ? fingerprintOf(e.region, current) : null);
}
function recheckAlignment(): void {
  aligned.clear();
  for (const id of doc.ink.visible) {
    const e = evidenceOf(doc.ink.strokes[id]!);
    const a = alignmentNow(e);
    // A stroke written across a material change is only checked against where it began: never verified.
    aligned.set(id, a === 'verified' && e && (e.contexts.length > 1 || e.changes_not_kept > 0) ? 'unknown' : a);
  }
}
/** Drawn as not verified: content-following (not established) or pixels not verifiably unchanged. */
const unsure = (s: InkStroke): boolean => s.display === 'content' || aligned.get(s.id) !== 'verified';

// ---- ink --------------------------------------------------------------------------------------------------
const canvas = $<HTMLCanvasElement>('ink');
const ctx = canvas.getContext('2d')!;
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}
window.addEventListener('resize', resize);

function line(g: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number, ...unknown[]]>): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  if (pts.length === 1) g.lineTo(pts[0]![0] + 0.1, pts[0]![1]);
  g.stroke();
}
/** Draws the visible strokes; `marks` shows unverified alignment dashed (the on-screen view only). */
function drawInk(g: CanvasRenderingContext2D, ink: InkDocument, marks: boolean): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 3;
  for (const id of ink.visible) {
    const s = ink.strokes[id]!;
    const dashed = marks && unsure(s);
    g.strokeStyle = s.display === 'screen' ? '#6e3fd1' : '#1c1c1e';
    g.globalAlpha = dashed ? 0.55 : 1;
    g.setLineDash(dashed ? [7, 5] : []);
    line(g, s.points);
  }
  g.globalAlpha = 1;
  g.setLineDash([]);
}

type Gesture = {
  pointerId: number;
  pointerType: string;
  kind: 'ink' | 'erase' | 'ask';
  points: InkPoint[];
  t0: number;
  /** Frames written over (ink only): the one held when the stroke began, then material changes. */
  contexts: Array<{ frame: HeldFrame; from_point: number; reason: StrokeContext['reason'] }>;
  /** Changes seen while writing beyond MAX_CONTEXTS: counted, not pictured. */
  changesNotKept: number;
  /** Beyond the cap, the frame of the last change counted (pinned), so each later change is counted once against it. */
  seen: HeldFrame | null;
  /** Settles once the starting frame is pinned (at once, or after a sample taken for this stroke). */
  ready: Promise<void>;
  /** Until its frames are let go; a gesture let go pins nothing more. */
  open: boolean;
};
let gesture: Gesture | null = null;
function render(): void {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const live = gesture;
  const shown = live?.kind === 'erase' && live.points.length > 0 ? eraseWith(live.points) : doc.ink;
  drawInk(ctx, shown, true);
  if (live && live.points.length > 0) {
    if (live.kind === 'ask') {
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 2;
      line(ctx, live.points);
    } else if (live.kind === 'erase') {
      ctx.strokeStyle = 'rgba(255, 69, 58, 0.3)';
      ctx.lineWidth = ERASER_RADIUS * 2;
      line(ctx, live.points);
    } else {
      ctx.strokeStyle = placement === 'screen' ? '#6e3fd1' : '#1c1c1e';
      ctx.lineWidth = 3;
      line(ctx, live.points);
    }
  }
  renderToolbar();
}
const eraseWith = (points: ReadonlyArray<InkPoint>): InkDocument =>
  erase(doc.ink, { screen: points.map((p) => [p[0], p[1]] as const), content: points.map((p) => [p[0], p[1]] as const) }, ERASER_RADIUS, now(), newId);

function commit(next: InkDocument, added: { stroke: InkStroke; gesture: Gesture } | null): void {
  if (next === doc.ink) {
    if (added) releaseGesture(added.gesture);
    return;
  }
  doc = { ...doc, ink: next };
  if (added) attachContext(added.stroke.id, added.gesture);
  recheckAlignment();
  void save();
  render();
}
const hex16 = (): string => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (data: string | Uint8Array<ArrayBuffer>): Promise<string> => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));

/** Context pictures made and not yet received by the main process (sha256 → PNG). */
const pendingImages = new Map<string, Uint8Array<ArrayBuffer>>();
/** Stroke contexts being made (evidence, then pictures); a save waits for them, so saved evidence is complete. */
let encoding: Promise<void> = Promise.resolve();
/**
 * Makes a finished stroke's evidence from the frames its gesture kept open (once its starting frame is
 * there), lets them go, then encodes the pictures. Until then the stroke is drawn as not verified.
 */
function attachContext(strokeId: string, g: Gesture): void {
  evidencePending.add(strokeId);
  encoding = encoding.then(async () => {
    try {
      await g.ready;
      const made = strokeEvidence(g);
      releaseGesture(g);
      if (!doc.ink.strokes[strokeId]) return; // another document is shown now
      doc = { ...doc, evidence: { ...doc.evidence, [strokeId]: made?.evidence ?? null } };
      recheckAlignment();
      render();
      if (!made) return;
      const images: Array<StrokeContext['image']> = [];
      for (const crop of made.crops) {
        try {
          if (!crop) throw new Error('no crop');
          const bytes = new Uint8Array(await (await crop.convertToBlob({ type: 'image/png' })).arrayBuffer());
          const sha = await sha256Hex(bytes);
          pendingImages.set(sha, bytes);
          images.push({ sha256: sha, width: crop.width, height: crop.height });
        } catch {
          images.push(null); // could not be made: the context says so
        }
      }
      const e = doc.evidence[strokeId];
      if (!e) return;
      doc = { ...doc, evidence: { ...doc.evidence, [strokeId]: { ...e, contexts: e.contexts.map((c, i) => ({ ...c, image: images[i] ?? null })) } } };
    } catch {
      releaseGesture(g); // the stroke stays; its evidence could not be made
    } finally {
      evidencePending.delete(strokeId);
    }
  });
}
/** Resolves once no stroke context is being made (contexts started meanwhile are waited for too). */
async function contextsSettled(): Promise<void> {
  for (let e = encoding; ; e = encoding) {
    await e;
    if (e === encoding) return;
  }
}

/**
 * Saves the current document after any save in progress; the chain never stays failed. Stored ink that
 * cannot be continued (a conflict) is left untouched and this ink, whole, becomes a separate copy.
 */
function save(): Promise<void> {
  saveText = 'Saving…';
  saveChain = saveChain.then(async () => {
    await contextsSettled();
    let saved = doc;
    let copied = false;
    let r: Awaited<ReturnType<Api['saveInk']>>;
    // The pictures go in bounded batches, each with the document. A picture is let go only when the main
    // process names it as received (it holds pictures of ink it could not write) or as invalid; any other
    // stays here and is sent again. The batches go on while each one makes progress.
    const send = async (d: DesktopInk): Promise<Awaited<ReturnType<Api['saveInk']>>> => {
      for (;;) {
        const batch: Array<{ sha256: string; bytes: Uint8Array }> = [];
        let bytes = 0;
        for (const sha of contextImages(d)) {
          const b = pendingImages.get(sha);
          if (!b) continue;
          if (batch.length >= PICTURES_PER_SAVE || (batch.length > 0 && bytes + b.length > PICTURE_BYTES_PER_SAVE)) break;
          batch.push({ sha256: sha, bytes: b });
          bytes += b.length;
        }
        const answer = await lc.saveInk(d, batch);
        for (const sha of [...answer.pictures_received, ...answer.pictures_invalid]) pendingImages.delete(sha);
        const progress = answer.pictures_received.length + answer.pictures_invalid.length;
        if (progress === 0 || !contextImages(d).some((sha) => pendingImages.has(sha))) return answer;
      }
    };
    try {
      r = await send(saved);
      if (!r.ok && r.conflict && doc.id === saved.id) {
        const first = r.reason;
        const id = hex16();
        const address = await sha256Hex(id);
        doc = forkDesktopInk(doc, id, address, now()); // includes any change made meanwhile
        saved = doc;
        r = await send(saved);
        copied = r.ok;
        if (!r.ok) r = { ...r, ok: false, reason: `${first}; saving it as a separate copy failed too (${r.reason})` };
      }
    } catch (error) {
      r = { ok: false, reason: `saving failed (${error instanceof Error ? error.message : String(error)})`, pictures_received: [], pictures_invalid: [] };
    }
    if (!r.ok) {
      unsaved = r.reason;
      saveText = `Not saved: ${r.reason}. The ink stays in this window; the next change and Stop try again.`;
    } else {
      lastSaved = saved;
    }
    if (r.ok && doc === saved) {
      unsaved = null;
      const at = new Date().toLocaleTimeString();
      saveText = copied ? `Saved as a separate copy on this device at ${at}: the ink stored for this session could not be continued and was left untouched.` : `Saved on this device at ${at}.`;
    }
    const waiting = contextImages(saved).filter((sha) => pendingImages.has(sha)).length;
    if (r.ok && waiting > 0) {
      // Saved, but some pictures are still only here: they are kept and sent with the next save (and at Stop).
      unsaved = `${waiting} context picture(s) are not saved yet`;
      saveText = `Saved on this device, except ${waiting} context picture(s), kept here and sent again with the next save.`;
      lastSaved = null;
    }
    render();
  });
  return saveChain;
}

// ---- ASK ----------------------------------------------------------------------------------------------------
const dashedNote = (m: InkMarks): string => {
  const n = m.changed + m.unknown + m.following_content;
  return n > 0 ? `\n${n} of your strokes are drawn dashed, as on screen: their alignment with what is under them is not verified.` : '';
};
const DEFAULT_QUESTION = 'Explain what is selected.';
function askStatus(text: string | null): void {
  $('askStatus').hidden = text === null;
  $('askStatus').textContent = text ?? '';
}
/** The card's question form: shown for a retained selection; Ask is off while a question is out. */
function askForm(state: 'hidden' | 'ready' | 'asking'): void {
  $('askForm').hidden = state === 'hidden';
  $<HTMLButtonElement>('askSubmit').disabled = state !== 'ready';
  $<HTMLTextAreaElement>('question').disabled = state !== 'ready';
  for (const el of document.querySelectorAll<HTMLInputElement>('input[name="assistance"]')) el.disabled = state !== 'ready';
  $('askCancel').hidden = state !== 'asking';
}
/** The card is closed or replaced: its selection is no longer asked about, and a question out about it is cancelled. */
function resetAsk(): void {
  if (asked) lc.askClosed(); // the main process cancels what is out for it; its answer is never shown
  asked = null;
  for (const el of document.querySelectorAll<HTMLInputElement>('input[name="assistance"]')) el.checked = el.value === 'hint'; // the help is chosen per selection
  askForm('hidden');
  askStatus(null);
  $('askSave').hidden = true;
  $('answerBox').hidden = true;
  $('answer').textContent = '';
  $('badge').textContent = subscription ? 'Selection · not sent to any AI' : 'Selection · no AI connected';
}
async function finishAsk(points: ReadonlyArray<InkPoint>): Promise<void> {
  const epoch = mode.askEpoch;
  const region = regionOf(points);
  // The selection is composed now from the frame held and the ink as it is, and labelled with exactly those.
  const held = ended ? null : raw;
  const inkDoc = doc;
  const r = held ? toFramePixels(region, display.bounds, held.bitmap) : null;
  let image: string | null = null;
  let png: Uint8Array | null = null;
  // The exact ink document drawn into the selection, taken now, before anything is awaited (a later save may put
  // another document in its place without changing what is visible).
  const inkBytes = subscription && held && r ? new TextEncoder().encode(JSON.stringify(inkDoc)) : null;
  let message: string;
  if (!held || !r) {
    message = held ? 'The circled region is outside the captured display, so nothing was selected.' : 'No frame of the display is available (a gap in the capture), so nothing was selected.';
  } else {
    // The picture and how its strokes are drawn are fixed together, before anything is awaited.
    const marks = inkMarks(inkDoc.ink);
    const out = new OffscreenCanvas(r.width, r.height);
    out.getContext('2d')!.drawImage(compose(held.bitmap, inkDoc.ink), r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    const blob = await out.convertToBlob({ type: 'image/png' });
    if (subscription) png = new Uint8Array(await blob.arrayBuffer());
    image = await new Promise<string>((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.readAsDataURL(blob);
    });
    const service = development ? ' (Development mode: a local test capture service on this device may also store the whole-display frames kept here, only while it is connected and answering; the control window shows whether it is storing now.)' : '';
    message =
      (subscription
        ? `This selection is sent to ChatGPT, with your question, only when you press Ask below; nothing else of the screen is sent to any AI, and no AI watches it.${service}\n`
        : development
          ? `No AI is connected: this selection was not sent to any AI.${service}\n`
          : `No AI is connected: this selection was not sent anywhere.\n`) +
      `Region ${Math.round(region.x)},${Math.round(region.y)} ${Math.round(region.width)}×${Math.round(region.height)} DIP on ${display.label} = ${r.width}×${r.height} px of frame ${held.seq} (captured ${new Date(held.at).toLocaleTimeString()}), with your ink revision ${inkDoc.ink.revision} drawn over it.` +
      dashedNote(marks);
  }
  if (mode.mode !== 'ASK' || mode.askEpoch !== epoch) return; // cancelled meanwhile: no card, and no older card replaces a newer one
  const img = $<HTMLImageElement>('crop');
  img.hidden = image === null;
  if (image !== null) img.src = image;
  $('cardText').textContent = message;
  resetAsk();
  const card = ++cardSeq;
  $('card').hidden = false;
  setMode(reduceMode(mode, { type: 'ask_finished', askEpoch: epoch }).state); // the mode before returns at once; the card stays
  if (!subscription || !held || !r || !png || !inkBytes) return;
  // Retained by the main process as the exact picture, the facts of its frame and the ink drawn into it. Nothing is
  // sent to any AI by this; only the Ask button below does that.
  asked = { card, selection: null, request: null, submitting: false, cancelling: false, early: null, unsaved: null, said: null };
  askStatus('Keeping this selection on this device…');
  const x0 = Math.max(0, region.x);
  const y0 = Math.max(0, region.y);
  const facts = {
    region_dip: { x: x0, y: y0, width: Math.min(display.bounds.width, region.x + region.width) - x0, height: Math.min(display.bounds.height, region.y + region.height) - y0 },
    frame_seq: held.seq,
    frame_captured_at: held.at,
    frame_width: held.bitmap.width,
    frame_height: held.bitmap.height,
    ink_session: inkDoc.id,
    ink_revision: inkDoc.ink.revision,
    visible_strokes: inkDoc.ink.visible.length,
  };
  let kept: Awaited<ReturnType<Api['askSelection']>>;
  try {
    kept = await lc.askSelection(facts, png, inkBytes);
  } catch {
    kept = { ok: false, reason: 'the app did not answer' };
  }
  if (asked?.card !== card) return; // closed, or another selection since
  if (!kept.ok) return askStatus(`This selection cannot be asked about: ${kept.reason}. It was not sent to any AI.`);
  asked.selection = kept.selection_id;
  $<HTMLTextAreaElement>('question').value = DEFAULT_QUESTION;
  askStatus(ended ? 'The capture ended: nothing is asked.' : null);
  askForm(ended ? 'hidden' : 'ready');
}
/** The outcome said before the submit's acknowledgement, if any (it is taken once). */
function takeEarly(a: NonNullable<typeof asked>): NonNullable<typeof asked>['early'] {
  const early = a.early;
  a.early = null;
  return early;
}
/** The user pressed Ask: this selection's picture and the question go to ChatGPT, once. */
async function submitAsk(): Promise<void> {
  const a = asked;
  if (ended || !a || !a.selection || a.request || a.submitting) return;
  a.submitting = true;
  a.cancelling = false;
  a.early = null;
  const answerShown = !$('answerBox').hidden;
  $('askSave').hidden = true;
  const question = $<HTMLTextAreaElement>('question').value;
  const assistance = document.querySelector<HTMLInputElement>('input[name="assistance"]:checked')?.value ?? 'hint';
  askForm('asking');
  $('answerBox').hidden = true;
  askStatus('Sending this picture and your question to ChatGPT…');
  let sent: Awaited<ReturnType<Api['askSubmit']>>;
  try {
    sent = await lc.askSubmit(a.selection, question, assistance);
  } catch {
    sent = { ok: false, reason: 'the app did not answer' };
  }
  a.submitting = false;
  if (asked !== a) return;
  if (!sent.ok) {
    // Nothing was asked: the card is as it was, the answer before and what is still not saved of it included.
    askForm(ended ? 'hidden' : 'ready');
    $('answerBox').hidden = !answerShown;
    return saved(a, `Not sent: ${sent.reason}.`, { saved: a.unsaved === null, reason: a.unsaved }, 'How the question before ended');
  }
  a.request = sent.request_id;
  // Handed to the connector: whether ChatGPT took it is known only when an answer, or a refusal, comes.
  $('badge').textContent = 'Selection · asked: being sent to ChatGPT';
  // How it ended may have been said before this acknowledgement came: it is this request's only if it names it.
  const early = takeEarly(a);
  if (early && early.request === sent.request_id) return showOutcome(a, early.outcome, early.record);
  if (a.cancelling) return; // cancelled while it was being sent: the status already says so
  askStatus(`Asked at ${new Date().toLocaleTimeString()}${sent.model ? ` (${sent.model})` : ''}: this picture and your question are being sent to ChatGPT. Waiting for the answer…`);
}
/** Cancel, or the card closed, while a question is out: its answer is not shown. */
function cancelAsk(): void {
  const a = asked;
  if (!a?.selection || (!a.request && !a.submitting)) return;
  a.cancelling = true;
  lc.askCancel(a.selection); // by selection: the main process cancels the question that is out for it
  $('askCancel').hidden = true;
  askStatus('Cancelling: an answer that still arrives is not shown.');
}
lc.onAskResult((selectionId, requestId, outcome, record) => {
  const a = asked;
  if (!a || a.selection !== selectionId) return; // not this card's selection: never shown
  // Said before the submit was acknowledged here (the main process answers both): kept until the acknowledgement
  // names its request. Nothing is shown for a request this card did not make.
  if (a.submitting && a.request === null) return void (a.early = { request: requestId, outcome, record });
  if (a.request !== requestId) return;
  showOutcome(a, outcome, record);
});
/** How this card's question ended. An answer is shown as text; what was not written on this device is said. */
function showOutcome(a: NonNullable<typeof asked>, outcome: AskOutcome, record: Saved): void {
  const request = a.request!;
  a.request = null;
  // Cancelled here after the answer had already left the main process: it is still not shown.
  const suppressed = (a.cancelling || ended) && outcome.status === 'answered';
  const out: AskOutcome = suppressed ? { status: 'cancelled', uncertain: true } : outcome;
  a.cancelling = false;
  askForm(ended ? 'hidden' : 'ready');
  let text: string;
  if (out.status === 'answered') {
    // Text only, apart from the selection above; never markup.
    $('answer').textContent = out.answer.text;
    $('answerBox').hidden = false;
    $('badge').textContent = 'Selection · answered by ChatGPT below';
    text = `Answered by ChatGPT (${out.answer.model}) in ${(out.answer.latency_ms / 1000).toFixed(1)} s, about the picture above and your question only.`;
  } else {
    $('badge').textContent = 'Selection · asked: no answer shown';
    text = out.status === 'cancelled'
      ? `Cancelled: no answer is shown.${out.uncertain ? ' Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage.' : ''}`
      : out.status === 'refused' ? `No answer: ${out.reason}. It was not sent again.` : `No answer: ${out.reason}. It is not sent again automatically.`;
  }
  saved(a, text, record);
  // The main process is told what was done with an answer (shown, or not after all); its record follows that.
  if (outcome.status === 'answered' && a.selection) void lc.askPresented(a.selection, request, !suppressed).then((r) => saved(a, text, r), () => undefined);
}
/** Says when how a question ended is not written on this device, and offers to write it again. */
function saved(a: NonNullable<typeof asked>, text: string, record: Saved, what = 'This'): void {
  if (asked !== a) return;
  a.unsaved = record.saved ? null : (record.reason ?? 'unknown');
  if (a.submitting || a.request) return; // a question is out again since: the card says that one's state
  a.said = { text, what };
  $('askSave').hidden = record.saved;
  askStatus(a.unsaved === null ? text : `${text} ${what} is NOT saved on this device yet: it could not be written (${a.unsaved}). It is kept in the app and tried again when this card closes; press Save to try now.`);
}
/** The user's press on Save: the main process tries to write the record again (nothing is asked again). */
async function saveOutcome(): Promise<void> {
  const a = asked;
  const said = a?.said;
  if (!a?.selection || !said) return;
  let r: Saved;
  try {
    r = await lc.askSave(a.selection);
  } catch {
    r = { saved: false, reason: 'the app did not answer' };
  }
  saved(a, said.text, r, said.what);
}

// ---- modes, input and toolbar ----------------------------------------------------------------------------------
let interactive = false;
function setInteractive(on: boolean): void {
  if (on === interactive) return;
  interactive = on;
  lc.interactive(on);
}
function setMode(next: ModeState): void {
  settleGesture();
  mode = next;
  setInteractive(mode.mode !== 'NAV');
  render();
}
const overUi = (x: number, y: number): boolean => {
  const el = document.elementFromPoint(x, y);
  return Boolean(el && (el.closest('#toolbar') || el.closest('#card:not([hidden])')));
};
// In NAV the window passes clicks through; forwarded moves tell when the pointer is over the toolbar.
document.addEventListener('mousemove', (e) => {
  if (mode.mode === 'NAV') setInteractive(overUi(e.clientX, e.clientY));
});

const sampleOf = (e: PointerEvent, t0: number): InkPoint => [Math.round(e.clientX * 100) / 100, Math.round(e.clientY * 100) / 100, Math.round(e.timeStamp - t0), Math.round((e.pressure || 0) * 100) / 100];
canvas.addEventListener('pointerdown', (e) => {
  if (ended || gesture || !e.isPrimary || mode.mode === 'NAV') return; // after the end, nothing new is written
  const pen = e.pointerType === 'pen';
  if (mode.mode === 'WRITE' && !pen && !(e.pointerType === 'mouse' && mouseWrites)) {
    transientHint = e.pointerType === 'mouse' ? 'Mouse writing is off: the mouse does not draw. Press ✋ to use your apps, or turn on Mouse writing.' : 'Touch does not draw. Press ✋ to use your apps with touch.';
    return render();
  }
  transientHint = '';
  canvas.setPointerCapture(e.pointerId);
  const penEraser = pen && (e.button === 5 || (e.buttons & 32) !== 0); // the pen's eraser end
  const kind = mode.mode === 'ASK' ? 'ask' : tool === 'eraser' || penEraser ? 'erase' : 'ink';
  const g: Gesture = { pointerId: e.pointerId, pointerType: e.pointerType, kind, points: [], t0: e.timeStamp, contexts: [], changesNotKept: 0, seen: null, ready: Promise.resolve(), open: true };
  gesture = g;
  g.points.push(sampleOf(e, g.t0));
  // The context is pinned as the stroke begins: the frame of this moment stays open until the stroke ends. If
  // the system delivered newer frames since the last sample, one is sampled now, so the picture is not of
  // what the screen showed before (say) a scroll.
  if (kind === 'ink' && !ended) {
    const sampledAfter = seq; // a frame from a later sample was taken at or after this pen-down (or just before it)
    const pinStart = (fresh: boolean): void => {
      if (g.open && raw && g.contexts.length === 0 && (fresh ? raw.seq > sampledAfter : !ended)) {
        g.contexts.push({ frame: raw, from_point: 0, reason: 'writing_started' });
        pin(raw.bitmap);
      }
    };
    if (raw && presented <= raw.presented) pinStart(false); // no newer frame than the one held (a sample in progress counts as older)
    else {
      startsWaiting += 1;
      g.ready = sampling = sampling
        .then(() => takeSample(0))
        .catch(() => undefined)
        .then(() => {
          startsWaiting -= 1;
          pinStart(true); // even after a Stop meanwhile: that frame was taken before the end
        });
    }
  }
  render();
});
canvas.addEventListener('pointermove', (e) => {
  if (!gesture || e.pointerId !== gesture.pointerId) return;
  const g = gesture;
  for (const ev of e.getCoalescedEvents?.() ?? [e]) g.points.push(sampleOf(ev, g.t0));
  render();
});
function endGesture(e: PointerEvent, cancelled: boolean): void {
  if (!gesture || e.pointerId !== gesture.pointerId) return;
  if (cancelled) return settleGesture(); // the system took the pointer: writing already seen is kept
  const g = gesture;
  gesture = null;
  if (g.points.length === 0) return releaseGesture(g), render();
  if (g.kind === 'ask') return void finishAsk(g.points);
  if (g.kind === 'erase') return commit(eraseWith(g.points), null);
  finishStroke(g);
}
/**
 * Ends a gesture that did not finish normally (Stop, a mode change, Open, the system taking the pointer): a
 * stroke keeps the points already written, with its context; an unfinished erase or ASK selection is dropped
 * (nothing is erased, nothing is asked).
 */
function settleGesture(): void {
  const g = gesture;
  gesture = null;
  if (!g) return;
  if (g.kind === 'ink' && g.points.length > 0) finishStroke(g);
  else {
    releaseGesture(g);
    render();
  }
}
/** Commits a stroke from the points its gesture observed; its context comes from the frames it kept open. */
function finishStroke(g: Gesture): void {
  const stroke: InkStroke = {
    id: newId(),
    input: g.pointerType === 'pen' ? 'pen' : g.pointerType === 'touch' ? 'touch' : 'mouse',
    display: placement,
    points: g.points,
    created_at: now(),
    source: { title: display.label, viewport: { width: display.bounds.width, height: display.bounds.height, dpr: display.scale_factor }, scroll: { x: 0, y: 0 } },
    anchor: null,
    derived_from: null,
  };
  commit(addStroke(doc.ink, stroke, stroke.created_at), { stroke, gesture: g });
}
canvas.addEventListener('pointerup', (e) => endGesture(e, false));
canvas.addEventListener('pointercancel', (e) => endGesture(e, true));
window.addEventListener('keydown', (e) => {
  if (!ended && e.key === 'Escape' && mode.mode === 'ASK') setMode(reduceMode(mode, { type: 'ask_cancelled' }).state);
});

const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-mode]'));
/** A toolbar control that does nothing once the capture has ended. */
const control = (id: HTMLElement, act: () => void): void => id.addEventListener('click', () => (ended ? undefined : act()));
for (const b of modeButtons) control(b, () => setMode(reduceMode(mode, { type: 'press', mode: b.dataset['mode'] as Mode }).state));
control($('pen'), () => ((tool = 'pen'), render()));
control($('eraser'), () => ((tool = 'eraser'), render()));
control($('mouse'), () => ((mouseWrites = !mouseWrites), (transientHint = ''), render()));
control($('undo'), () => commit(undo(doc.ink, now()), null));
control($('redo'), () => commit(redo(doc.ink, now()), null));
control($('placement'), () => ((placement = placement === 'screen' ? 'content' : 'screen'), render()));
control($('cancel'), () => setMode(reduceMode(mode, { type: 'ask_cancelled' }).state));
control($('askSubmit'), () => void submitAsk());
$('askSave').addEventListener('click', () => void saveOutcome());
$('askCancel').addEventListener('click', cancelAsk);
$('close').addEventListener('click', () => {
  resetAsk(); // a question still out is cancelled with its card
  $('card').hidden = true;
  if (mode.mode === 'NAV') setInteractive(false);
});

function captureText(): string {
  if (ended) return `Capture ended: ${endReason}. Nothing is being observed now, and this overlay takes no new input.`;
  const s = samples.at(-1);
  if (!s) return 'Starting the capture of this display…';
  if (s.state === 'gap') return `Capture gap: ${((s.gap_ms ?? 0) / 1000).toFixed(1)} s not observed.`;
  if (!s.raw) return 'Capture started; no frame yet.';
  return s.state === 'fresh' ? `Capturing this display · frame ${s.seq}.` : `Capturing · no new frame from Windows for ${(s.raw.frame_age_ms / 1000).toFixed(0)} s (the display is still, or the capture stalled).`;
}
function renderToolbar(): void {
  for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset['mode'] === mode.mode));
  $('tools').hidden = mode.mode !== 'WRITE';
  $('cancel').hidden = mode.mode !== 'ASK';
  $('pen').setAttribute('aria-pressed', String(tool === 'pen'));
  $('eraser').setAttribute('aria-pressed', String(tool === 'eraser'));
  $('mouse').setAttribute('aria-pressed', String(mouseWrites));
  $('mouse').setAttribute('aria-label', mouseWrites ? 'Mouse writing is on: the mouse writes and erases' : 'Mouse writing is off: the mouse does not draw');
  const st = stacks(doc.ink);
  $<HTMLButtonElement>('undo').disabled = ended || st.undo.length === 0;
  $<HTMLButtonElement>('redo').disabled = ended || st.redo.length === 0;
  for (const b of [...modeButtons, $<HTMLButtonElement>('pen'), $<HTMLButtonElement>('eraser'), $<HTMLButtonElement>('mouse'), $<HTMLButtonElement>('placement'), $<HTMLButtonElement>('cancel')]) b.disabled = ended;
  $('placement').textContent = placement === 'screen' ? '▣' : '⇅';
  $('placement').setAttribute('aria-label', placement === 'screen' ? 'New ink stays fixed on the screen (press: follow content — not supported on the desktop yet)' : 'Follow content is NOT established on the desktop: new ink stays where written (press: fixed on the screen)');
  const shown = doc.ink.visible.map((id) => doc.ink.strokes[id]!);
  const following = shown.filter((x) => x.display === 'content').length;
  const changed = shown.filter((x) => x.display === 'screen' && aligned.get(x.id) === 'changed').length;
  const unknown = shown.filter((x) => x.display === 'screen' && aligned.get(x.id) !== 'changed' && aligned.get(x.id) !== 'verified').length;
  const marks = [
    changed > 0 ? `${changed} stroke(s) dashed: the pixels under them changed.` : '',
    unknown > 0 ? `${unknown} stroke(s) dashed: whether the pixels under them stayed cannot be told (not captured, or too plain).` : '',
    following > 0 ? `${following} stroke(s) set to follow content, dashed: following content is not established, they stay where written.` : '',
  ];
  const modeText = mode.mode === 'NAV' ? 'Clicks go to your apps.' : mode.mode === 'ASK' ? 'Circle a region. Esc or Cancel returns.' : `${mouseWrites ? 'Pen and mouse write' : 'Pen writes; mouse writing off'}; ${placement === 'screen' ? 'new ink fixed on the screen' : 'following content is not established here: ink stays where written'}.`;
  $('hint').textContent = [transientHint || modeText, captureText(), subscription ? 'No AI watches this screen: ChatGPT gets only a selection you send with Ask.' : 'No AI is connected.', saveText, ...marks].filter(Boolean).join(' ');
}

// ---- whole-display retention ------------------------------------------------------------------------------
/** Retention in progress (PNG encoding and writing), apart from sampling; Stop waits for it. */
let retention: Promise<void> = Promise.resolve();
/** What the last frame queued for retention showed, and the last the main process confirmed. */
let lastRetained: Retained | null = null;
let lastConfirmed: Retained | null = null;
/** Set once the session's retention limit is reached: later material steps are recorded as not retained. */
let retentionClosed: string | null = null;
/** Samples whose material step waits for the retention interval. */
let deferredSeqs: number[] = [];
/** The current run of samples observed but not retained, reported when it ends. */
let notRetainedRun: { from_seq: number; to_seq: number; samples: number; reason: string } | null = null;
const retentionPolicy: RetentionPolicy = info.retention_policy ?? DEFAULT_RETENTION_POLICY;
/** At most this many frames are being encoded and written at once; a material step meanwhile waits (deferred). */
const MAX_RETENTION_QUEUE = 2;
let retentionQueued = 0;
/** Samples whose frames are being encoded or written now, with the deferred samples each stands for (reported at Stop, so a forced end can say which were lost). */
const retentionPending = new Map<number, number[]>();
/** The outcome of retention so far, for the hint and the self-test. */
const retentionState = { retained: 0, refused: 0, lastRefusal: '' };

function flushNotRetained(): void {
  const run = notRetainedRun;
  notRetainedRun = null;
  if (run) lc.notRetained(run);
}
async function pngBytes(canvas: OffscreenCanvas): Promise<Uint8Array> {
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
/**
 * Decides whether this sample's whole-display frame is retained. If it is, the held image and this sample's
 * composed canvas are kept (with the facts pinned here) and encoded as PNGs after the sample, in order.
 */
function considerRetention(sample: DisplaySample, held: HeldFrame, heldGrid: Uint8Array, made: NonNullable<typeof composed>, rawSha: string): void {
  const c = sample.composed!;
  const now: Retained = { pixels_sha256: rawSha, grid: heldGrid, ink_key: `${c.ink_session}:${c.ink_revision}:${JSON.stringify(c.ink_marks)}`, at_ms: sample.monotonic_ms };
  const decided = decideRetention(lastRetained, now, deferredSeqs.length > 0, retentionPolicy);
  const material = decided.retain || decided.reason === 'deferred';
  if (material && retentionClosed) {
    // Past the session's limit: this step (with any deferred samples) is recorded as not retained, once.
    const seqs = [...deferredSeqs, sample.seq];
    deferredSeqs = [];
    lastRetained = now;
    addNotRetained(seqs, `a material step, not retained: ${retentionClosed}`);
    return;
  }
  if (decided.retain && retentionQueued >= MAX_RETENTION_QUEUE) {
    deferredSeqs.push(sample.seq); // earlier frames are still being encoded and written: this step waits
    return;
  }
  if (!decided.retain) {
    if (decided.reason === 'deferred') deferredSeqs.push(sample.seq);
    if (decided.reason === 'below_threshold') addNotRetained([sample.seq], 'pixels changed less than the material threshold since the last retained frame');
    return;
  }
  flushNotRetained();
  const coalesced = deferredSeqs;
  deferredSeqs = [];
  lastRetained = now;
  const known = held.presented > 0; // before the first frame callback the presentation time is unknown
  const facts = {
    sample_seq: sample.seq,
    frame_seq: held.seq,
    reason: decided.reason,
    deferred_samples_not_retained: coalesced,
    sampled_at: sample.sampled_at,
    taken_at: held.at,
    monotonic_ms: sample.monotonic_ms,
    state: sample.state,
    gap_ms: sample.gap_ms,
    presented_frames: held.presented,
    stream_presented_frames: sample.raw!.stream_presented_frames,
    presentation_ms: known ? Math.round(held.presentedAt) : null,
    frame_age_ms: known ? sample.raw!.frame_age_ms : null,
    raw: { width: held.bitmap.width, height: held.bitmap.height, pixels_sha256: rawSha, change_from_previous_sample: sample.raw!.change },
    composed: { ...c, uncommitted_gesture: made.uncommitted, evidence_pending: made.evidencePending },
  };
  /** A transient failure: the step is tried again, no sooner than the interval allows. */
  const tryAgain = (): void => {
    if (lastRetained !== now) return;
    lastRetained = { ...(lastConfirmed ?? { pixels_sha256: '', grid: new Uint8Array(0), ink_key: '' }), at_ms: now.at_ms };
  };
  pin(held.bitmap);
  let pinned = true;
  const letGo = (): void => {
    if (pinned) unpin(held.bitmap);
    pinned = false;
  };
  retentionQueued += 1;
  retentionPending.set(sample.seq, coalesced);
  retention = retention.then(async () => {
    try {
      const rawCanvas = new OffscreenCanvas(held.bitmap.width, held.bitmap.height);
      rawCanvas.getContext('2d')!.drawImage(held.bitmap, 0, 0);
      letGo();
      const answer = await lc.retainFrame(facts, await pngBytes(rawCanvas), await pngBytes(made.canvas), made.ink);
      if (answer.ok) {
        retentionState.retained += 1;
        lastConfirmed = now;
      } else {
        retentionState.refused += 1;
        retentionState.lastRefusal = answer.reason;
        if (answer.limit) retentionClosed = answer.reason;
        if (answer.retry) tryAgain();
      }
    } catch (error) {
      letGo();
      retentionState.refused += 1;
      retentionState.lastRefusal = error instanceof Error ? error.message : String(error);
      lc.notRetained({ from_seq: coalesced[0] ?? sample.seq, to_seq: sample.seq, samples: coalesced.length + 1, reason: `the frame could not be encoded or sent (${retentionState.lastRefusal})` });
      tryAgain();
    } finally {
      retentionQueued -= 1;
      retentionPending.delete(sample.seq);
    }
  });
}
/** Adds samples to the current run of not-retained samples with this reason (reported when the run ends). */
function addNotRetained(seqs: number[], reason: string): void {
  if (notRetainedRun && notRetainedRun.reason === reason) {
    notRetainedRun = { ...notRetainedRun, from_seq: Math.min(notRetainedRun.from_seq, ...seqs), to_seq: Math.max(notRetainedRun.to_seq, ...seqs), samples: notRetainedRun.samples + seqs.length };
    return;
  }
  flushNotRetained();
  notRetainedRun = { from_seq: Math.min(...seqs), to_seq: Math.max(...seqs), samples: seqs.length, reason };
}

// Opening saved ink: this window's own ink is saved first; if it cannot be, it stays and Open is refused.
lc.onLoadDoc((loaded) => {
  settleGesture();
  void saveIfChanged().then(() => {
    settleGesture(); // a stroke begun while saving belongs to this ink: it keeps Open waiting for its save
    if (doc !== lastSaved) return lc.loadResult(loaded.id, false, `the ink in the overlay is not saved (${unsaved ?? 'a change is still being saved'}), so it was kept open`);
    doc = loaded;
    lastSaved = loaded;
    recheckAlignment();
    saveText = `Reopened ${doc.ink.visible.length} stroke(s) saved on this device.`;
    lc.loadResult(loaded.id, true, '');
    render();
  });
});
// Stop: the capture ends at once; a stroke still being written keeps what was written (and its context);
// the newest ink is saved once more (or kept by the main process), and only then is the Stop confirmed.
lc.onStop((reason) => {
  endCapture(reason);
  // No sample considers retention after the end, so the steps not yet recorded are recorded now, before anything slow.
  if (deferredSeqs.length > 0) lc.notRetained({ from_seq: deferredSeqs[0]!, to_seq: deferredSeqs.at(-1)!, samples: deferredSeqs.length, reason: 'a material step waited for the retention interval when the capture ended' });
  deferredSeqs = [];
  flushNotRetained();
  lc.stopping([...retentionPending].map(([seq, deferred]) => ({ sample_seq: seq, deferred_samples_not_retained: deferred })));
  settleGesture();
  setInteractive(false); // no new input: the pointer goes to the apps below
  // Frames retained before the end are still written; then the Stop is confirmed.
  void Promise.all([sampling, saveIfChanged(), retention]).then(() => lc.stopped(doc === lastSaved ? null : (unsaved ?? 'a change was still being saved')));
});

// Test support (the self-test drives the real window): state and pixels of the latest raw and composed frames.
(globalThis as unknown as { __lcOverlay: unknown }).__lcOverlay = {
  state: () => ({
    mode: mode.mode,
    tool,
    placement,
    mouseWrites,
    interactive,
    ended,
    endReason,
    doc: { id: doc.id, revision: doc.ink.revision, visible: [...doc.ink.visible], history: doc.ink.history.map((o) => o.op), strokes: Object.keys(doc.ink.strokes).length },
    aligned: Object.fromEntries(doc.ink.visible.map((id) => [id, aligned.get(id) ?? 'unknown'])),
    unsaved,
    pinned: pins.size,
    retention: { ...retentionState, deferred: deferredSeqs.length },
    pendingImages: pendingImages.size,
    gesture: gesture ? { kind: gesture.kind, points: gesture.points.length, contexts: gesture.contexts.map((c) => ({ seq: c.frame.seq, reason: c.reason, from_point: c.from_point })) } : null,
    frame: raw ? raw.seq : null,
    samples,
    card: $('card').hidden ? null : { text: $('cardText').textContent, image: !$('crop').hidden },
    saveText,
    hint: $('hint').textContent,
  }),
  debug: () => {
    const g = gesture;
    const last = g?.contexts.at(-1);
    if (!g || !last || !raw) return null;
    const region = regionOf(g.points);
    const before = fingerprintOf(region, last.frame.bitmap);
    const after = fingerprintOf(region, raw.bitmap);
    return { same_bitmap: last.frame.bitmap === raw.bitmap, before: before && Array.from(before.slice(0, 8)), after: after && Array.from(after.slice(0, 8)), change: before && after ? lumaChange(before, after) : null, region };
  },
  /** Per visible stroke: how its evidence compares with the current frame, by the 16×16 fingerprint and by its detail. */
  alignment: () =>
    doc.ink.visible.map((id) => {
      const e = evidenceOf(doc.ink.strokes[id]!);
      const current = raw?.bitmap ?? null;
      const then: Detail | null = e?.detail ? { cols: e.detail.cols, rows: e.detail.rows, luma: fingerprintFromBase64(e.detail.luma) } : null;
      const now = e && then ? detailOf(e.region, current, then) : null;
      const coarse = e && current ? fingerprintOf(e.region, current) : null;
      return {
        id,
        region: e?.region ?? null,
        aligned: aligned.get(id) ?? 'unknown',
        fingerprint_change: e && coarse ? lumaChange(fingerprintFromBase64(e.fingerprint), coarse) : null,
        detail:
          e && then && now
            ? {
                cols: then.cols,
                rows: then.rows,
                result: detailChange(then, now),
                moved_cells: then.luma.reduce((a, v, i) => a + (Math.abs(v - now.luma[i]!) > DETAIL_DELTA ? 1 : 0), 0),
                moved_at: Array.from(then.luma).flatMap((v, i) => (Math.abs(v - now.luma[i]!) > DETAIL_DELTA ? [[i % then.cols, Math.floor(i / then.cols)]] : [])).slice(0, 12),
              }
            : null,
      };
    }),
  pixel: (which: 'raw' | 'composed', x: number, y: number): number[] | null => {
    const src = which === 'raw' ? raw?.bitmap : composed?.canvas;
    if (!src) return null;
    const r = toFramePixels({ x, y, width: 1, height: 1 }, display.bounds, src);
    if (!r) return null;
    const c = new OffscreenCanvas(1, 1);
    const g = c.getContext('2d')!;
    g.drawImage(src, r.x, r.y, 1, 1, 0, 0, 1, 1);
    return Array.from(g.getImageData(0, 0, 1, 1).data);
  },
};

resize();
await startCapture();
tick();
