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
// Ink placement: screen-fixed ink stays where it was written. Following content is NOT established on
// the desktop: such ink also stays where it was written, is always drawn as not verified and says so. A
// screen-fixed stroke is drawn solid only while the pixels under it verifiably still look as they did
// when it was written; changed, too plain to tell, or not captured is drawn dashed.
//
// Saving: every change is saved; a failed save is reported and retried with the next change and at
// Stop. Stored ink that cannot be continued is left untouched and this ink is saved as a separate copy.

import { addStroke, erase, redo, stacks, undo, type InkDisplay, type InkDocument, type InkPoint, type InkStroke } from '../../../safari-extension/src/ink.ts';
import { INITIAL_MODE_STATE, reduceMode, type Mode, type ModeState } from '../../../safari-extension/src/mode.ts';
import { forkDesktopInk, type DesktopDisplay, type DesktopInk, type PixelEvidence } from '../shared/desktop-ink.ts';
import { alignmentOf, fingerprintFromBase64, fingerprintToBase64, lumaChange, luminance, sampleState, toFramePixels, type Alignment, type DisplaySample } from '../shared/samples.ts';

type Api = {
  ready(): Promise<{ source_id: string; display: DesktopDisplay; doc: DesktopInk; address_sha256: string } | null>;
  armCapture(): Promise<boolean>;
  sample(s: DisplaySample): void;
  interactive(on: boolean): void;
  saveInk(doc: DesktopInk): Promise<{ ok: true } | { ok: false; reason: string; conflict?: true }>;
  loadResult(id: string, ok: boolean, reason: string): void;
  ended(reason: string): void;
  stopped(unsaved: string | null): void;
  onLoadDoc(fn: (doc: DesktopInk) => void): void;
  onStop(fn: (reason: string) => void): void;
};
const lc = (globalThis as unknown as { lc: Api }).lc;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const PERIOD_MS = 1000;
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
let lastSaved: DesktopInk = doc;
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
let raw: { bitmap: ImageBitmap; seq: number; at: string } | null = null;
/** The latest composed frame with what it was made from. */
let composed: { canvas: OffscreenCanvas; frameSeq: number; inkId: string; revision: number; visible: number } | null = null;
let prevGrid: Uint8Array | null = null;
let seq = 0;
let ended = false;
let endReason = '';
const samples: DisplaySample[] = [];
const source = { kind: 'display' as const, display_id: display.display_id, source_id: info.source_id, label: display.label, bounds: display.bounds, scale_factor: display.scale_factor };

const onFrame = (at: number, meta: VideoFrameCallbackMetadata): void => {
  presented = meta.presentedFrames;
  presentedAt = at;
  video.requestVideoFrameCallback(onFrame);
};

async function startCapture(): Promise<void> {
  try {
    // One capture per session; the main process answers with the display the user chose.
    if (!(await lc.armCapture())) return endCapture('the capture of this session was already used or refused');
    stream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { frameRate: { max: 10 } } });
  } catch (error) {
    endCapture(`the display could not be captured (${error instanceof Error ? error.message : String(error)})`);
    return;
  }
  const track = stream.getVideoTracks()[0];
  if (!track || stream.getAudioTracks().length > 0 || track.getSettings().displaySurface !== 'monitor') {
    return endCapture('the capture was not the whole chosen display, so it was stopped');
  }
  track.addEventListener('ended', () => endCapture('Windows stopped delivering this display (permission withdrawn, display removed or capture ended)'));
  video.srcObject = stream;
  video.requestVideoFrameCallback(onFrame);
  await video.play();
}
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
function compose(bitmap: ImageBitmap, ink: InkDocument): OffscreenCanvas {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = c.getContext('2d')!;
  g.drawImage(bitmap, 0, 0);
  g.scale(bitmap.width / display.bounds.width, bitmap.height / display.bounds.height);
  drawInk(g as unknown as CanvasRenderingContext2D, ink, false);
  return c;
}

/**
 * One sample. Samples run one at a time (`sampling`); one still in progress when the capture ends is
 * dropped, so nothing live is reported after the end. What is composed is pinned: the frame and the ink
 * document are taken once, before anything is awaited.
 */
async function takeSample(lateMs: number): Promise<void> {
  const newFrame = presented > presentedSeen;
  presentedSeen = presented;
  const { state, gap_ms } = sampleState({ ended, newFrame, lateMs, periodMs: PERIOD_MS });
  const mySeq = ++seq;
  if (!ended && video.videoWidth > 0 && (newFrame || !raw)) {
    const bitmap = await createImageBitmap(video);
    if (ended) return bitmap.close();
    raw?.bitmap.close();
    raw = { bitmap, seq: mySeq, at: now() };
    recheckAlignment();
  }
  const held = ended ? null : raw;
  const inkDoc = doc;
  let change: number | null = null;
  composed = null;
  if (held) {
    const g = grid(held.bitmap);
    change = prevGrid ? lumaChange(prevGrid, g) : null;
    prevGrid = g;
    composed = { canvas: compose(held.bitmap, inkDoc.ink), frameSeq: held.seq, inkId: inkDoc.id, revision: inkDoc.ink.revision, visible: inkDoc.ink.visible.length };
  }
  const pin = composed;
  const rawSha = held ? await pixelsSha(held.bitmap) : null;
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
        ? { width: held.bitmap.width, height: held.bitmap.height, presented_frames: presented, frame_age_ms: Math.round(performance.now() - presentedAt), taken_at: held.at, pixels_sha256: rawSha, change }
        : null,
    composed:
      held && pin && composedSha
        ? {
            ink_session: pin.inkId,
            ink_revision: pin.revision,
            visible_strokes: pin.visible,
            transformation: `raw frame ${held.bitmap.width}×${held.bitmap.height} px with this app's editable ink (revision ${pin.revision}, ${pin.visible} visible stroke(s)) drawn over it at ${(held.bitmap.width / display.bounds.width).toFixed(3)} px per DIP; the overlay itself is excluded from capture, so the ink is added once`,
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
  sampling = takeSample(late).catch(() => undefined);
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
function fingerprintOf(region: { x: number; y: number; width: number; height: number }): Uint8Array | null {
  if (!raw) return null;
  const r = toFramePixels(region, display.bounds, raw.bitmap);
  if (!r) return null;
  const c = new OffscreenCanvas(16, 16);
  const g = c.getContext('2d')!;
  g.drawImage(raw.bitmap, r.x, r.y, r.width, r.height, 0, 0, 16, 16);
  return luminance(g.getImageData(0, 0, 16, 16).data);
}
const aligned = new Map<string, Alignment>();
const evidenceOf = (s: InkStroke): PixelEvidence | null => doc.evidence[s.id] ?? (s.derived_from ? (doc.evidence[s.derived_from] ?? null) : null);
function recheckAlignment(): void {
  aligned.clear();
  for (const id of doc.ink.visible) {
    const e = evidenceOf(doc.ink.strokes[id]!);
    aligned.set(id, alignmentOf(e ? fingerprintFromBase64(e.fingerprint) : null, e && !ended ? fingerprintOf(e.region) : null));
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

type Gesture = { pointerId: number; pointerType: string; kind: 'ink' | 'erase' | 'ask'; points: InkPoint[]; t0: number };
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

function commit(next: InkDocument, added: InkStroke | null): void {
  if (next === doc.ink) return;
  const evidence = added ? { ...doc.evidence, [added.id]: evidenceFor(added) } : doc.evidence;
  doc = { ...doc, ink: next, evidence };
  recheckAlignment();
  void save();
  render();
}
const hex16 = (): string => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (text: string): Promise<string> => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/**
 * Saves the current document after any save in progress; the chain never stays failed. Stored ink that
 * cannot be continued (a conflict) is left untouched and this ink, whole, becomes a separate copy.
 */
function save(): Promise<void> {
  saveText = 'Saving…';
  saveChain = saveChain.then(async () => {
    let saved = doc;
    let copied = false;
    let r: Awaited<ReturnType<Api['saveInk']>>;
    try {
      r = await lc.saveInk(saved);
      if (!r.ok && r.conflict && doc.id === saved.id) {
        const first = r.reason;
        const id = hex16();
        const address = await sha256Hex(id);
        doc = forkDesktopInk(doc, id, address, now()); // includes any change made meanwhile
        saved = doc;
        r = await lc.saveInk(saved);
        copied = r.ok;
        if (!r.ok) r = { ok: false, reason: `${first}; saving it as a separate copy failed too (${r.reason})` };
      }
    } catch (error) {
      r = { ok: false, reason: `saving failed (${error instanceof Error ? error.message : String(error)})` };
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
    render();
  });
  return saveChain;
}
function evidenceFor(s: InkStroke): PixelEvidence | null {
  if (!raw) return null;
  const region = regionOf(s.points);
  const print = fingerprintOf(region);
  return print ? { frame_seq: raw.seq, frame_sampled_at: raw.at, region, fingerprint: fingerprintToBase64(print) } : null;
}

// ---- ASK ----------------------------------------------------------------------------------------------------
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
      `Region ${Math.round(region.x)},${Math.round(region.y)} ${Math.round(region.width)}×${Math.round(region.height)} DIP on ${display.label} = ${r.width}×${r.height} px of frame ${held.seq} (captured ${new Date(held.at).toLocaleTimeString()}), with your ink revision ${inkDoc.ink.revision} drawn over it.`;
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
  mode = next;
  gesture = null;
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
  if (gesture || !e.isPrimary || mode.mode === 'NAV') return;
  const pen = e.pointerType === 'pen';
  if (mode.mode === 'WRITE' && !pen && !(e.pointerType === 'mouse' && mouseWrites)) {
    transientHint = e.pointerType === 'mouse' ? 'Mouse writing is off: the mouse does not draw. Press ✋ to use your apps, or turn on Mouse writing.' : 'Touch does not draw. Press ✋ to use your apps with touch.';
    return render();
  }
  transientHint = '';
  canvas.setPointerCapture(e.pointerId);
  const penEraser = pen && (e.button === 5 || (e.buttons & 32) !== 0); // the pen's eraser end
  const kind = mode.mode === 'ASK' ? 'ask' : tool === 'eraser' || penEraser ? 'erase' : 'ink';
  gesture = { pointerId: e.pointerId, pointerType: e.pointerType, kind, points: [], t0: e.timeStamp };
  gesture.points.push(sampleOf(e, gesture.t0));
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
  const g = gesture;
  gesture = null;
  if (cancelled || g.points.length === 0) return render();
  if (g.kind === 'ask') return void finishAsk(g.points);
  if (g.kind === 'erase') return commit(eraseWith(g.points), null);
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
  commit(addStroke(doc.ink, stroke, stroke.created_at), stroke);
}
canvas.addEventListener('pointerup', (e) => endGesture(e, false));
canvas.addEventListener('pointercancel', (e) => endGesture(e, true));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mode.mode === 'ASK') setMode(reduceMode(mode, { type: 'ask_cancelled' }).state);
});

const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-mode]'));
for (const b of modeButtons) b.addEventListener('click', () => setMode(reduceMode(mode, { type: 'press', mode: b.dataset['mode'] as Mode }).state));
$('pen').addEventListener('click', () => ((tool = 'pen'), render()));
$('eraser').addEventListener('click', () => ((tool = 'eraser'), render()));
$('mouse').addEventListener('click', () => ((mouseWrites = !mouseWrites), (transientHint = ''), render()));
$('undo').addEventListener('click', () => commit(undo(doc.ink, now()), null));
$('redo').addEventListener('click', () => commit(redo(doc.ink, now()), null));
$('placement').addEventListener('click', () => ((placement = placement === 'screen' ? 'content' : 'screen'), render()));
$('cancel').addEventListener('click', () => setMode(reduceMode(mode, { type: 'ask_cancelled' }).state));
$('close').addEventListener('click', () => {
  $('card').hidden = true;
  if (mode.mode === 'NAV') setInteractive(false);
});

function captureText(): string {
  if (ended) return `Capture ended: ${endReason}. Nothing is being observed now.`;
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
  $<HTMLButtonElement>('undo').disabled = st.undo.length === 0;
  $<HTMLButtonElement>('redo').disabled = st.redo.length === 0;
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
  void saveIfChanged().then(() => {
    if (doc !== lastSaved) return lc.loadResult(loaded.id, false, `the ink in the overlay is not saved (${unsaved ?? 'a change is still being saved'}), so it was kept open`);
    doc = loaded;
    lastSaved = loaded;
    gesture = null;
    recheckAlignment();
    saveText = `Reopened ${doc.ink.visible.length} stroke(s) saved on this device.`;
    lc.loadResult(loaded.id, true, '');
    render();
  });
});
// Stop: the capture ends at once; the newest ink is saved once more, and whether it could be is reported.
lc.onStop((reason) => {
  endCapture(reason);
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
