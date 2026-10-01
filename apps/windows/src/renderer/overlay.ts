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
import { clampRate, DEFAULT_PLACE, placeAt, RATE_DEFAULT, RATE_STEP, SURFACES, usableArea, type DisplayPlaces, type Place, type Rect, type Surface } from '../shared/placement.ts';
import { speechPieces } from '../shared/voice.ts';
import { alignmentOf, DETAIL_DELTA, detailChange, detailGrid, fingerprintFromBase64, fingerprintToBase64, lumaChange, luminance, sampleState, toFramePixels, type Alignment, type Detail, type DisplaySample, type InkMarks } from '../shared/samples.ts';

type Api = {
  ready(): Promise<{ source_id: string; display: DesktopDisplay; doc: DesktopInk; address_sha256: string; retention_policy?: RetentionPolicy; development?: boolean; subscription?: boolean; work_area?: Rect; places?: DisplayPlaces; speech_rate?: number; voice?: { audible: boolean } | null; live?: Live } | null>;
  place(surface: Surface, place: Place): Promise<Saved>;
  speechRate(rate: number): Promise<Saved>;
  onWorkArea(fn: (area: Rect) => void): void;
  talk(on: boolean, muted: boolean): void;
  say(selectionId: string, requestId: string, at: number): Promise<{ spoken: boolean }>;
  hush(): void;
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
  /** A circle: the WHOLE composed frame, the circle's rectangle among its facts, and the ink drawn into it. Kept; and, with the AI running, a small hint is asked for at once. */
  askSelection(facts: unknown, png: Uint8Array, ink: Uint8Array): Promise<{ ok: true; selection_id: string; request: Submitted } | { ok: false; reason: string }>;
  /** A follow-up in the user's words, with a fresh whole frame. */
  askSubmit(selectionId: string, question: string, assistance: string, facts: unknown, png: Uint8Array, ink: Uint8Array): Promise<Submitted>;
  onLive(fn: (live: Live) => void): void;
  askCancel(selectionId: string): void;
  askClosed(): void;
  askPresented(selectionId: string, requestId: string, shown: boolean): Promise<Saved>;
  askSave(selectionId: string): Promise<Saved>;
  onAskResult(fn: (selectionId: string, requestId: string, outcome: AskOutcome, record: Saved) => void): void;
};
/** Whether a request went to the AI (its id and the session's model), or why not. */
type Submitted = { ok: true; request_id: string; model: string; about: About } | { ok: false; reason: string };
/** What a request is about: when its whole frame was taken, and where the card's circle is in relation to that frame. */
type About = { captured_at: string | null; focus: 'on_this_frame' | 'on_an_earlier_frame' | 'none' };
/**
 * The AI's session as the main process says it: none configured; not started (why); starting; running, with its own
 * bounds (requests and time: the user's, never ChatGPT's quota) and what it last looked at; or ended (why).
 */
type Live =
  | { state: 'none' }
  | { state: 'off'; reason: string | null }
  | { state: 'starting' }
  | { state: 'on' | 'used_up' | 'ended'; model: string; max_submissions: number; used: number; reserve: number; expires_at: string; paused: string | null; missed: string | null; ended: string | null; seen: { at: string; frame_seq: number } | null; frames: number; out: number; unwritten: number };
/** Whether the selection's record (each request and how it ended) is written on this device; if not, why. `speak`: this response may be read aloud. */
type Saved = { saved: boolean; reason: string | null; speak?: boolean };
/** How a request to ChatGPT ended, as the main process says it (a response only for the turn that was sent). */
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
 * The managed ChatGPT subscription is configured. Whether an AI observes this display is its session's state (`live`):
 * started by the user's own Start in the control window, within the bounds chosen there, and said in the toolbar.
 */
const subscription = info.subscription === true;
let live: Live = info.live ?? { state: 'none' };
/** The card's selection, as the main process retained it (only with the subscription configured). */
let asked: {
  card: number;
  selection: string | null;
  request: string | null;
  submitting: boolean;
  cancelling: boolean;
  /** How a request ended, said by the main process before its selection or its submit was acknowledged here. */
  early: { selection: string; request: string; outcome: AskOutcome; record: Saved } | null;
  /** What the request that is out is about (said with its response). */
  about: About | null;
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

// ---- the movable surfaces: the toolbar, and the card that shows a selection and its response -------------------
// Each has a visible handle. A drag of the handle moves the surface and nothing else: it never reaches the ink
// canvas, so it writes nothing, erases nothing, selects nothing and asks nothing, and the mode stays as it is. The
// place is kept per display by the main process and restored at the next Start, inside whatever the work area is
// then (the style sheet keeps the whole surface inside it).
let area: Rect = usableArea(info.work_area ?? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
const surfaces: Record<Surface, { el: HTMLElement; handle: HTMLElement; place: Place; label: string }> = {
  toolbar: { el: $('toolbar'), handle: $('toolbarHandle'), place: info.places?.toolbar ?? DEFAULT_PLACE.toolbar, label: 'toolbar' },
  caption: { el: $('card'), handle: $('cardHandle'), place: info.places?.caption ?? DEFAULT_PLACE.caption, label: 'card' },
};
/** The surface being moved by a pointer, and where on the surface the pointer took hold. */
let drag: { surface: Surface; pointerId: number; dx: number; dy: number; moved: boolean } | null = null;
function applyArea(): void {
  const root = document.documentElement.style;
  root.setProperty('--ax', `${area.x}px`);
  root.setProperty('--ay', `${area.y}px`);
  root.setProperty('--aw', `${area.width}px`);
  root.setProperty('--ah', `${area.height}px`);
}
function applyPlace(name: Surface): void {
  const s = surfaces[name];
  s.el.style.setProperty('--fx', String(s.place.fx));
  s.el.style.setProperty('--fy', String(s.place.fy));
}
/** The place is kept by the main process; when it cannot be written it holds for this session, and that is said. */
async function keepPlace(name: Surface): Promise<void> {
  let r: Saved;
  try {
    r = await lc.place(name, surfaces[name].place);
  } catch {
    r = { saved: false, reason: 'the app did not answer' };
  }
  if (r.saved) return;
  transientHint = `The place of the ${surfaces[name].label} could not be kept on this device (${r.reason ?? 'unknown'}): it stays here for this session.`;
  render();
}
function moveTo(name: Surface, left: number, top: number): void {
  const s = surfaces[name];
  const box = s.el.getBoundingClientRect();
  s.place = placeAt(left, top, { width: box.width, height: box.height }, area);
  applyPlace(name);
}
function endDrag(): { surface: Surface; moved: boolean } | null {
  const d = drag;
  if (!d) return null;
  drag = null;
  const handle = surfaces[d.surface].handle;
  if (handle.hasPointerCapture(d.pointerId)) handle.releasePointerCapture(d.pointerId);
  return d;
}
applyArea();
for (const name of SURFACES) {
  const s = surfaces[name];
  applyPlace(name);
  s.handle.addEventListener('pointerdown', (e) => {
    if (drag || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const box = s.el.getBoundingClientRect();
    drag = { surface: name, pointerId: e.pointerId, dx: e.clientX - box.left, dy: e.clientY - box.top, moved: false };
    s.handle.setPointerCapture(e.pointerId); // the moves come here even when the pointer leaves the handle
    e.preventDefault();
  });
  s.handle.addEventListener('pointermove', (e) => {
    if (!drag || drag.surface !== name || drag.pointerId !== e.pointerId) return;
    drag.moved = true;
    moveTo(name, e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const release = (e: PointerEvent): void => {
    if (!drag || drag.surface !== name || drag.pointerId !== e.pointerId) return;
    const d = endDrag();
    if (d?.moved) void keepPlace(name);
    if (mode.mode === 'NAV') setInteractive(overUi(e.clientX, e.clientY)); // the pointer goes back to the apps unless it is still over a surface
  };
  s.handle.addEventListener('pointerup', release);
  s.handle.addEventListener('pointercancel', release);
  s.handle.addEventListener('lostpointercapture', release); // the pointer was taken elsewhere without an up: the drag is over
  // Without a pointer: the arrow keys move the surface, Home puts it back where it starts.
  s.handle.addEventListener('keydown', (e) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    const by = step[e.key];
    if (!by && e.key !== 'Home') return;
    e.preventDefault();
    if (by) {
      const box = s.el.getBoundingClientRect();
      moveTo(name, box.left + by[0], box.top + by[1]);
    } else {
      s.place = DEFAULT_PLACE[name];
      applyPlace(name);
    }
    void keepPlace(name);
  });
}
// The work area changed while the capture runs (the taskbar moved): the surfaces are kept inside the new one.
lc.onWorkArea((next) => {
  area = usableArea(next);
  applyArea();
});

// ---- talk: a response read aloud ------------------------------------------------------------------------------
// Silent unless the user turns Talk on: a response is shown as text on its card, and is read aloud only while Talk
// is on and not muted. What is read is exactly the text the card shows, and only while the card shows it: closing
// the card, a new selection, a new question, Cancel, Stop reading, Mute, turning Talk off and the capture's end
// each stop the voice at once, with everything not yet spoken.
// The voice is not part of this page: the main process owns it, and what it is handed. This page asks only for the
// next piece of the current response by its place (lc.say), and says when to stop (lc.hush); the main process cuts
// its own copy of the answer and checks again, before every piece, that it is still the one shown here with Talk on.
// None is connected in this build, so Talk says that and nothing is played. Speaking TO the AI is not connected
// either: questions are typed.
/** The build's voice as the main process reports it (`audible`: it plays on an audio device), or none. */
const voice = info.voice ?? null;
const NO_VOICE = 'no voice is connected in this build, so responses are not read aloud; they are shown as text';
let talk = false;
let muted = false;
let rate = clampRate(info.speech_rate ?? RATE_DEFAULT);
/** What is being read aloud: the card's response, the pieces of its text, and the piece being spoken now. */
let speaking: { selection: string; request: string; pieces: string[]; at: number; rate: number } | null = null;
let talkNote = '';
/** Stops the voice at once, with everything not yet spoken. */
function interrupt(): void {
  const was = speaking;
  speaking = null;
  if (!was) return;
  lc.hush();
  renderTalk();
}
/** Reads this card's response aloud, piece by piece (only with Talk on, not muted, and a connected voice). */
function speak(selection: string, request: string, text: string): void {
  interrupt();
  if (!talk || muted || ended || !voice) return;
  const pieces = speechPieces(text);
  if (pieces.length === 0) return;
  const mine = { selection, request, pieces, at: 0, rate };
  speaking = mine;
  talkNote = '';
  // One piece at a time: what was not yet handed to the voice is simply never said after an interruption.
  const next = (): void => {
    if (speaking !== mine) return;
    if (mine.at >= pieces.length) {
      speaking = null;
      return renderTalk();
    }
    mine.rate = rate; // the rate this piece is said at (a change of the rate holds from the next piece)
    renderTalk();
    // Asked for by its place only. Not said to its end (or refused, or the call failed): the reading stops.
    void lc.say(selection, request, mine.at).then((r) => r?.spoken === true, () => false).then((spoken) => {
      if (speaking !== mine) return; // interrupted meanwhile: its late end is nobody's
      if (!spoken) {
        speaking = null;
        talkNote = 'The voice stopped before the end; the response is shown as text.';
        return renderTalk();
      }
      mine.at += 1;
      next();
    });
  };
  next();
}
function renderTalk(): void {
  $('talkControls').hidden = !subscription;
  // A voice that only synthesizes (a test's) plays nothing: said wherever reading aloud is said.
  const test = voice?.audible === false ? 'TEST VOICE, nothing is played: ' : '';
  $('talk').setAttribute('aria-pressed', String(talk));
  $('talk').setAttribute('aria-label',
    !voice ? (talk ? `Talk is on, but ${NO_VOICE}. Press to turn it off.` : `Talk is off: responses are shown as text only. Turning it on reads nothing aloud: ${NO_VOICE}.`)
    : !talk ? `${test}Talk is off: responses are shown as text only. Press to have them read aloud.`
    : muted ? `${test}Talk is on, muted: responses are shown as text and not read aloud. Press to turn Talk off.`
    : `${test}Talk is on: responses are read aloud. Press to turn it off.`);
  $('mute').setAttribute('aria-pressed', String(muted));
  $('mute').setAttribute('aria-label', muted ? 'Muted: responses are not read aloud. Press to unmute.' : 'Mute: stop reading aloud, keep the text.');
  for (const id of ['mute', 'slower', 'rate', 'faster']) $(id).hidden = !talk || !voice; // (nothing to mute or pace without a voice)
  $('rate').textContent = `${rate.toFixed(1)}×`;
  $('interrupt').hidden = speaking === null;
  const status = speaking
    ? `${test}Reading the response aloud at ${speaking.rate.toFixed(1)}× (part ${speaking.at + 1} of ${speaking.pieces.length}). The text below is what is read.`
    : !talk ? ''
    : !voice ? `Talk is on, but ${NO_VOICE}. Speaking to the AI is not connected either: type your question.`
    : muted ? 'Talk is on, muted: responses are shown as text and not read aloud.'
    : `${test}Talk is on: the response to your next request is read aloud at ${rate.toFixed(1)}× and shown as text. Speaking to the AI is not connected in this build: type your question.`;
  const said = [talkNote, status].filter((t) => t !== '').join(' ');
  // The start of a reading, its end and what is said of Talk are announced; the parts in between are not (a screen
  // reader would speak over the voice at every part).
  $('talkStatus').setAttribute('aria-live', speaking && speaking.at > 0 ? 'off' : 'polite');
  $('talkStatus').textContent = said;
  $('talkStatus').hidden = !subscription || said === '';
}
$('talk').addEventListener('click', () => {
  if (ended) return;
  talk = !talk;
  talkNote = '';
  if (!talk) {
    muted = false;
    interrupt();
  }
  lc.talk(talk, muted);
  renderTalk();
  renderToolbar();
});
$('mute').addEventListener('click', () => {
  muted = !muted;
  if (muted) interrupt();
  lc.talk(talk, muted);
  renderTalk();
  renderToolbar();
});
$('interrupt').addEventListener('click', () => interrupt());
for (const [id, by] of [['slower', -RATE_STEP], ['faster', RATE_STEP]] as const) {
  $(id).addEventListener('click', () => {
    const next = clampRate(rate + by);
    if (next === rate) return;
    rate = next; // from the next part on
    void lc.speechRate(rate).catch(() => undefined);
    renderTalk();
  });
}
renderTalk();
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
  interrupt(); // nothing is read aloud after the end
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
function askStatus(text: string | null): void {
  $('askStatus').hidden = text === null;
  $('askStatus').textContent = text ?? '';
}
/** The card's follow-up form: shown for a retained selection; Send is off while a request is out. */
function askForm(state: 'hidden' | 'ready' | 'asking'): void {
  $('askForm').hidden = state === 'hidden';
  $<HTMLButtonElement>('askSubmit').disabled = state !== 'ready';
  $<HTMLTextAreaElement>('question').disabled = state !== 'ready';
  for (const el of document.querySelectorAll<HTMLInputElement>('input[name="assistance"]')) el.disabled = state !== 'ready';
  $('askCancel').hidden = state !== 'asking';
}
/** The card is closed or replaced: its selection is no longer asked about, and a question out about it is cancelled. */
function resetAsk(): void {
  interrupt(); // a response is read aloud only while its card shows it
  talkNote = ''; // (what was said of that response's reading goes with it)
  renderTalk();
  if (asked) lc.askClosed(); // the main process interrupts what is out for it; its response is never shown
  asked = null;
  for (const el of document.querySelectorAll<HTMLInputElement>('input[name="assistance"]')) el.checked = el.value === 'hint'; // the help is chosen per selection
  askForm('hidden');
  askStatus(null);
  $('askSave').hidden = true;
  $('answerBox').hidden = true;
  $('answer').textContent = '';
  $('badge').textContent = subscription ? 'Your focus on the screen' : 'Selection · no AI connected';
  $<HTMLTextAreaElement>('question').value = '';
}
/** What an error says of itself (its message, when it has one). */
const why = (error: unknown): string => (typeof (error as { message?: unknown } | null)?.message === 'string' ? (error as { message: string }).message : String(error));
/** The whole frame held now, composed with the ink as it is, with the facts of exactly those: what the AI is given. */
function wholeFrame(): { canvas: OffscreenCanvas; facts: { frame_seq: number; frame_captured_at: string; frame_width: number; frame_height: number; ink_session: string; ink_revision: number; visible_strokes: number }; ink: Uint8Array } | null {
  const held = ended ? null : raw;
  if (!held) return null;
  const inkDoc = doc;
  // Composed and labelled now, before anything is awaited: the sampler may replace this frame meanwhile and close its
  // bitmap, and a later save may put another ink document in the place of this one.
  return {
    canvas: compose(held.bitmap, inkDoc.ink),
    facts: { frame_seq: held.seq, frame_captured_at: held.at, frame_width: held.bitmap.width, frame_height: held.bitmap.height, ink_session: inkDoc.id, ink_revision: inkDoc.ink.revision, visible_strokes: inkDoc.ink.visible.length },
    ink: new TextEncoder().encode(JSON.stringify(inkDoc)),
  };
}
async function finishAsk(points: ReadonlyArray<InkPoint>): Promise<void> {
  const epoch = mode.askEpoch;
  const region = regionOf(points);
  // The whole frame is composed now from the frame held and the ink as it is, and labelled with exactly those.
  const held = ended ? null : raw;
  const inkDoc = doc;
  const r = held ? toFramePixels(region, display.bounds, held.bitmap) : null;
  const whole = held && r ? wholeFrame() : null;
  let image: string | null = null;
  let png: Uint8Array | null = null;
  let failed: string | null = null;
  const x0 = Math.max(0, region.x);
  const y0 = Math.max(0, region.y);
  const facts = whole && { ...whole.facts, region_dip: { x: x0, y: y0, width: Math.min(display.bounds.width, region.x + region.width) - x0, height: Math.min(display.bounds.height, region.y + region.height) - y0 } };
  let message: string;
  if (!held || !r || !whole) {
    message = held ? 'The circled region is outside the captured display, so nothing was selected.' : 'No frame of the display is available (a gap in the capture), so nothing was selected.';
  } else {
    // The picture and how its strokes are drawn are fixed together, before anything is awaited.
    const marks = inkMarks(inkDoc.ink);
    // The card's own small picture is the circled part; what is kept, and what the AI is given, is the WHOLE frame.
    const out = new OffscreenCanvas(r.width, r.height);
    out.getContext('2d')!.drawImage(whole.canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    try {
      const blob = await out.convertToBlob({ type: 'image/png' });
      if (subscription) png = await pngBytes(whole.canvas);
      image = await new Promise<string>((ok, failed) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.onerror = () => failed(new Error('the picture could not be read back'));
        fr.readAsDataURL(blob);
      });
    } catch (error) {
      // The picture could not be made: said on the card, with nothing kept and nothing sent. The ink and the mode
      // before are as they were.
      png = null;
      image = null;
      failed = `The picture of the display could not be made (${why(error)}), so this selection was not kept and nothing was sent to any AI.\n`;
    }
    const service = development ? ' (Development mode: a local test capture service on this device may also store the whole-display frames kept here, only while it is connected and answering; the control window shows whether it is storing now.)' : '';
    message =
      (failed !== null ? failed
        : subscription
        ? `Your focus: this part of the screen. With the AI running, ChatGPT is given the whole display as it was then, with this part marked, and asked for a small hint; nothing more than a hint is asked for by a circle alone.${service}\n`
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
  if (!subscription || !facts || !png || !whole) return;
  // Kept by the main process as the exact whole picture, the facts of its frame, the circle and the ink drawn into
  // it; with the AI's session running, a small hint about the circled part is asked for at once.
  const a: NonNullable<typeof asked> = { card, selection: null, request: null, submitting: true, cancelling: false, early: null, about: null, unsaved: null, said: null };
  asked = a;
  askStatus('Keeping this on this device…');
  let kept: Awaited<ReturnType<Api['askSelection']>>;
  try {
    kept = await lc.askSelection(facts, png, whole.ink);
  } catch {
    kept = { ok: false, reason: 'the app did not answer' };
  }
  a.submitting = false;
  if (asked !== a) return; // closed, or another selection since
  if (!kept.ok) return askStatus(`This selection could not be kept, so nothing was asked: ${kept.reason}. It was not sent to any AI.`);
  a.selection = kept.selection_id;
  if (!kept.request.ok) {
    // Kept, not asked: said with why. A follow-up can still be sent from this card once the AI runs.
    askStatus(ended ? 'The capture ended: nothing is asked.' : `Kept on this device. The AI was not asked: ${kept.request.reason}.`);
    return askForm(ended ? 'hidden' : 'ready');
  }
  a.request = kept.request.request_id;
  a.about = kept.request.about;
  askForm('asking');
  $('badge').textContent = 'Your focus · a hint is being asked for';
  // How it ended may have been said before this acknowledgement came: it is this request's only if it names it.
  const early = takeEarly(a);
  if (early && early.selection === a.selection && early.request === a.request) return showOutcome(a, early.outcome, early.record);
  if (a.cancelling) return void lc.askCancel(a.selection); // cancelled before its selection was known here: said to the main process now
  askStatus(`Asked at ${new Date().toLocaleTimeString()} (${kept.request.model}): the whole display with this part as your focus, for a small hint. Waiting for the response…`);
}
/** The outcome said before the submit's acknowledgement, if any (it is taken once). */
function takeEarly(a: NonNullable<typeof asked>): NonNullable<typeof asked>['early'] {
  const early = a.early;
  a.early = null;
  return early;
}
/** The user pressed Send: the follow-up's words go to ChatGPT, once, with the whole display as it is now. */
async function submitAsk(): Promise<void> {
  const a = asked;
  if (ended || !a || !a.selection || a.request || a.submitting) return;
  interrupt(); // a new request: the response before is no longer read
  talkNote = '';
  renderTalk();
  a.submitting = true;
  a.cancelling = false;
  a.early = null;
  const answerShown = !$('answerBox').hidden;
  $('askSave').hidden = true;
  const question = $<HTMLTextAreaElement>('question').value;
  const assistance = document.querySelector<HTMLInputElement>('input[name="assistance"]:checked')?.value ?? 'hint';
  askForm('asking');
  $('answerBox').hidden = true;
  askStatus('Sending the whole display as it is now and your question to ChatGPT…');
  // Nothing was sent: the card is as it was, the response before and what is still not saved of it included.
  const notSent = (reason: string): void => {
    a.submitting = false;
    if (asked !== a) return;
    askForm(ended ? 'hidden' : 'ready');
    $('answerBox').hidden = !answerShown;
    saved(a, `Not sent: ${reason}.`, { saved: a.unsaved === null, reason: a.unsaved }, 'How the request before ended');
  };
  const whole = wholeFrame();
  if (!whole) return notSent('no frame of the display is available (a gap in the capture)');
  let png: Uint8Array;
  try {
    png = await pngBytes(whole.canvas);
  } catch (error) {
    return notSent(`the picture of the display could not be made (${why(error)})`);
  }
  let sent: Submitted;
  try {
    sent = await lc.askSubmit(a.selection, question, assistance, whole.facts, png, whole.ink);
  } catch {
    sent = { ok: false, reason: 'the app did not answer' };
  }
  if (!sent.ok) return notSent(sent.reason);
  a.submitting = false;
  if (asked !== a) return;
  a.request = sent.request_id;
  a.about = sent.about;
  $<HTMLTextAreaElement>('question').value = '';
  // Handed to the connector: whether ChatGPT took it is known only when a response, or a refusal, comes.
  $('badge').textContent = 'Your focus · asked: being sent to ChatGPT';
  // How it ended may have been said before this acknowledgement came: it is this request's only if it names it.
  const early = takeEarly(a);
  if (early && early.request === sent.request_id) return showOutcome(a, early.outcome, early.record);
  if (a.cancelling) return; // cancelled while it was being sent: the status already says so
  askStatus(`Asked at ${new Date().toLocaleTimeString()} (${sent.model}): the whole display and your question are being sent to ChatGPT. Waiting for the response…`);
}
/** Cancel, or the card closed, while a request is out: its response is not shown. */
function cancelAsk(): void {
  const a = asked;
  if (!a || (!a.request && !a.submitting)) return;
  interrupt();
  a.cancelling = true;
  if (a.selection) lc.askCancel(a.selection); // by selection: the main process interrupts the request that is out for it
  $('askCancel').hidden = true;
  askStatus('Cancelling: a response that still arrives is not shown.');
}
lc.onLive((next) => {
  live = next;
  render();
});
lc.onAskResult((selectionId, requestId, outcome, record) => {
  const a = asked;
  if (!a) return;
  // Said before the selection or the submit was acknowledged here (the main process answers both): kept until the
  // acknowledgement names its selection and request. Nothing is shown for a request this card did not make.
  if (a.submitting && a.request === null && (a.selection === null || a.selection === selectionId)) return void (a.early = { selection: selectionId, request: requestId, outcome, record });
  if (a.selection !== selectionId || a.request !== requestId) return; // not this card's request: never shown
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
    $('badge').textContent = 'Your focus · ChatGPT\'s response is below';
    // A response is about the picture it was asked with, never about the newest screen: its time is said, and where
    // the circle is in relation to that picture.
    const when = a.about?.captured_at ? ` at ${new Date(a.about.captured_at).toLocaleTimeString()}` : ' when this was asked';
    const circle = a.about?.focus === 'on_an_earlier_frame' ? ' The screen had changed since your circle: ChatGPT was told where the circle was, without its pixels.' : a.about?.focus === 'none' ? ' Your circle was not part of this request.' : '';
    text = `From ChatGPT (${out.answer.model}) in ${(out.answer.latency_ms / 1000).toFixed(1)} s, about the whole display as it was${when}.${circle}`;
  } else {
    $('badge').textContent = 'Your focus · asked: no response shown';
    text = out.status === 'cancelled'
      ? `Cancelled: no answer is shown.${out.uncertain ? ' Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage.' : ''}`
      : out.status === 'refused' ? `No answer: ${out.reason}. It was not sent again.` : `No answer: ${out.reason}. It is not sent again automatically.`;
  }
  saved(a, text, record);
  // What came is brought into view: the card may be scrolled to its form, with the response below what is visible.
  (out.status === 'answered' ? $('answerBox') : $('askStatus')).scrollIntoView({ block: out.status === 'answered' ? 'start' : 'nearest' });
  // The main process is told what was done with an answer (shown, or not after all); its record follows that.
  if (outcome.status === 'answered' && a.selection) void lc.askPresented(a.selection, request, !suppressed).then((r) => saved(a, text, r), () => undefined);
  // Read aloud only when this response was asked for with Talk on (the main process says so), and only what is shown
  // here (asked of the main process after "shown", in that order; it checks again before every piece).
  if (out.status === 'answered' && a.selection && record.speak === true) speak(a.selection, request, out.answer.text);
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
  if (mode.mode === 'NAV') setInteractive(drag !== null || overUi(e.clientX, e.clientY)); // a surface being moved keeps the pointer
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

/** The AI's session, as it is said in the toolbar: whether ChatGPT observes this display, within which of the user's own bounds, and what it last saw. */
function liveText(): string {
  if (live.state === 'none') return 'No AI is connected.';
  if (live.state === 'starting') return 'Starting the AI…';
  if (live.state === 'off') return `No AI observes this display${live.reason ? `: ${live.reason}` : ' (the AI was not started with this capture)'}.`;
  if (live.state === 'ended') return `ChatGPT no longer observes this display: ${live.ended}. Start the AI again in the control window.`;
  if (live.state === 'used_up') return `ChatGPT no longer looks or answers: all ${live.max_submissions} requests of this session are used (its own bound, not ChatGPT's quota). Start the AI again in the control window.`;
  const left = Math.max(0, live.max_submissions - live.used);
  const minutes = Math.max(0, Math.ceil((Date.parse(live.expires_at) - Date.now()) / 60_000));
  const seen = live.seen ? `it last looked at ${new Date(live.seen.at).toLocaleTimeString()}` : 'it has not looked yet';
  return (live.paused !== null ? `ChatGPT now looks only when you circle or ask (${live.paused})` : 'ChatGPT observes this whole display as it changes') +
    `: ${left} of ${live.max_submissions} requests and about ${minutes} min left in this session (its own bounds, not ChatGPT's quota); ${seen}${live.missed ? `; the newest look was not made (${live.missed})` : ''}.`;
}
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
  // (what Talk does is said here too: its controls are in the toolbar, and the card that shows a reading's status may be closed)
  const talkText = !talk || !subscription ? '' : !voice ? `Talk is on, but ${NO_VOICE}.` : muted ? 'Talk is on, muted.' : 'Talk is on: the responses you ask for from now are read aloud.';
  $('hint').textContent = [transientHint || modeText, captureText(), liveText(), talkText, saveText, ...marks].filter(Boolean).join(' ');
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
  endDrag(); // a surface being moved is let go: nothing takes input after the end
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
