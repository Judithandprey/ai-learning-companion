// The overlay on the captured display: ongoing capture of the whole display, and NAV / ASK / WRITE
// input over it, with editable ink saved at every change. No AI is connected; nothing is sent.
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
import { alignmentOf, fingerprintFromBase64, fingerprintToBase64, lumaChange, luminance, SAME_PIXELS, sampleState, toFramePixels, type Alignment, type DisplaySample, type InkMarks } from '../shared/samples.ts';

type Api = {
  ready(): Promise<{ source_id: string; display: DesktopDisplay; doc: DesktopInk; address_sha256: string } | null>;
  armCapture(): Promise<boolean>;
  sample(s: DisplaySample): void;
  interactive(on: boolean): void;
  saveInk(doc: DesktopInk, images: Array<{ sha256: string; bytes: Uint8Array }>): Promise<({ ok: true } | { ok: false; reason: string; conflict?: true }) & { pictures_received: string[]; pictures_invalid: string[] }>;
  loadResult(id: string, ok: boolean, reason: string): void;
  ended(reason: string): void;
  stopped(unsaved: string | null): void;
  onLoadDoc(fn: (doc: DesktopInk) => void): void;
  onStop(fn: (reason: string) => void): void;
};
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
let composed: { canvas: OffscreenCanvas; frameSeq: number; inkId: string; revision: number; visible: number; marks: InkMarks } | null = null;
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
  render();
}

/** A grid of the frame's luminance (64×40) for change between samples. */
function grid(bitmap: ImageBitmap): Uint8Array {
  const c = new OffscreenCanvas(64, 40);
  const g = c.getContext('2d')!;
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
  if (held) {
    const g = grid(held.bitmap);
    change = prevGrid ? lumaChange(prevGrid, g) : null;
    prevGrid = g;
    composed = { canvas: compose(held.bitmap, inkDoc.ink), frameSeq: held.seq, inkId: inkDoc.id, revision: inkDoc.ink.revision, visible: inkDoc.ink.visible.length, marks: inkMarks(inkDoc.ink) };
  }
  const pin = composed;
  const rawSha = held ? await pixelsSha(held.bitmap) : null;
  if (held && rawSha) {
    frameShas.set(held.seq, rawSha);
    for (const k of frameShas.keys()) if (frameShas.size > 30) frameShas.delete(k);
  }
  const composedSha = pin ? await pixelsSha(pin.canvas) : null;
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
      held && pin && composedSha
        ? {
            ink_session: pin.inkId,
            ink_revision: pin.revision,
            visible_strokes: pin.visible,
            ink_marks: pin.marks,
            transformation: `raw frame ${held.bitmap.width}×${held.bitmap.height} px with this app's editable ink (revision ${pin.revision}, ${pin.visible} visible stroke(s)) drawn over it at ${(held.bitmap.width / display.bounds.width).toFixed(3)} px per DIP, strokes whose alignment is not verified (changed, unknown or following content) dashed as on screen; the overlay itself is excluded from capture, so the ink is added once`,
            pixels_sha256: composedSha,
          }
        : null,
  };
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
  if (!g || g.kind !== 'ink' || !last || !raw || last.frame.bitmap === raw.bitmap) return;
  const region = regionOf(g.points);
  const before = fingerprintOf(region, last.frame.bitmap);
  const after = fingerprintOf(region, raw.bitmap);
  if (!before || !after || lumaChange(before, after) <= SAME_PIXELS) return;
  if (last.reason === 'changed_while_writing' && g.points.length <= last.from_point) {
    // Nothing was written since the last change: that context is replaced by the newer frame.
    const old = last.frame.bitmap;
    last.frame = raw;
    pin(raw.bitmap);
    unpin(old);
    return;
  }
  if (g.contexts.length >= MAX_CONTEXTS) return void (g.changesNotKept += 1);
  g.contexts.push({ frame: raw, from_point: g.points.length, reason: 'changed_while_writing' });
  pin(raw.bitmap);
}
/** Lets go of the frames a gesture kept open. */
function releaseGesture(g: Gesture | null): void {
  if (!g?.open) return;
  g.open = false;
  for (const c of g.contexts) unpin(c.frame.bitmap);
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
  const area = contextArea(region);
  const areaPx = start ? toFramePixels(area, display.bounds, start.frame.bitmap) : null;
  if (!start || !print || !areaPx || area.width <= 0 || area.height <= 0) return null;
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
  return { evidence: { frame_seq: start.frame.seq, frame_sampled_at: start.frame.at, region, fingerprint: fingerprintToBase64(print), contexts: records, changes_not_kept: g.changesNotKept }, crops };
}
const aligned = new Map<string, Alignment>();
const evidenceOf = (s: InkStroke): PixelEvidence | null => doc.evidence[s.id] ?? (s.derived_from ? (doc.evidence[s.derived_from] ?? null) : null);
function recheckAlignment(): void {
  aligned.clear();
  for (const id of doc.ink.visible) {
    const e = evidenceOf(doc.ink.strokes[id]!);
    const a = alignmentOf(e ? fingerprintFromBase64(e.fingerprint) : null, e && !ended ? fingerprintOf(e.region) : null);
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
  changesNotKept: number;
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
async function finishAsk(points: ReadonlyArray<InkPoint>): Promise<void> {
  const epoch = mode.askEpoch;
  const region = regionOf(points);
  // The selection is composed now from the frame held and the ink as it is, and labelled with exactly those.
  const held = ended ? null : raw;
  const inkDoc = doc;
  const r = held ? toFramePixels(region, display.bounds, held.bitmap) : null;
  let image: string | null = null;
  let message: string;
  if (!held || !r) {
    message = held ? 'The circled region is outside the captured display, so nothing was selected.' : 'No frame of the display is available (a gap in the capture), so nothing was selected.';
  } else {
    // The picture and how its strokes are drawn are fixed together, before anything is awaited.
    const marks = inkMarks(inkDoc.ink);
    const out = new OffscreenCanvas(r.width, r.height);
    out.getContext('2d')!.drawImage(compose(held.bitmap, inkDoc.ink), r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    const blob = await out.convertToBlob({ type: 'image/png' });
    image = await new Promise<string>((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.readAsDataURL(blob);
    });
    message =
      `No AI is connected: this selection was not sent anywhere.\n` +
      `Region ${Math.round(region.x)},${Math.round(region.y)} ${Math.round(region.width)}×${Math.round(region.height)} DIP on ${display.label} = ${r.width}×${r.height} px of frame ${held.seq} (captured ${new Date(held.at).toLocaleTimeString()}), with your ink revision ${inkDoc.ink.revision} drawn over it.` +
      dashedNote(marks);
  }
  if (mode.mode !== 'ASK' || mode.askEpoch !== epoch) return; // cancelled meanwhile: no card, and no older card replaces a newer one
  const img = $<HTMLImageElement>('crop');
  img.hidden = image === null;
  if (image !== null) img.src = image;
  $('cardText').textContent = message;
  $('card').hidden = false;
  setMode(reduceMode(mode, { type: 'ask_finished', askEpoch: epoch }).state);
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
  const g: Gesture = { pointerId: e.pointerId, pointerType: e.pointerType, kind, points: [], t0: e.timeStamp, contexts: [], changesNotKept: 0, ready: Promise.resolve(), open: true };
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
$('close').addEventListener('click', () => {
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
  $('hint').textContent = [transientHint || modeText, captureText(), 'No AI is connected.', saveText, ...marks].filter(Boolean).join(' ');
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
  settleGesture();
  setInteractive(false); // no new input: the pointer goes to the apps below
  void Promise.all([sampling, saveIfChanged()]).then(() => lc.stopped(doc === lastSaved ? null : (unsaved ?? 'a change was still being saved')));
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
    pendingImages: pendingImages.size,
    gesture: gesture ? { kind: gesture.kind, points: gesture.points.length, contexts: gesture.contexts.map((c) => ({ seq: c.frame.seq, reason: c.reason, from_point: c.from_point })) } : null,
    frame: raw ? raw.seq : null,
    samples,
    card: $('card').hidden ? null : { text: $('cardText').textContent, image: !$('crop').hidden },
    saveText,
    hint: $('hint').textContent,
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
