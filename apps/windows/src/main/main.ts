// Learning Companion for Windows: main process.
//
// - The user picks a display in the control window and presses Start. Only then may this app's own
//   overlay window on that display capture it, once per session (getDisplayMedia answered with the
//   chosen display); every other permission is refused. Stop, the display being removed or changing
//   geometry, the capture ending or the overlay failing ends the session.
// - The overlay is transparent, always on top and excluded from capture (content protection), so the
//   captured frames show the user's apps, not this app. It passes clicks through in NAV and takes
//   pointer input in WRITE and ASK.
// - Editable ink is saved on this device at every change (userData/ink/<session>.json, written
//   atomically, validated first), with the pictures of what each stroke was written over
//   (userData/ink/context/<sha256>.png). Stored ink that cannot be continued is never overwritten: the
//   overlay saves its ink as a separate copy instead. Ink that cannot be written is kept here, in the
//   main process, until the user retries, exports or discards it; closing the app does not drop it.
//   No AI is connected. Nothing is sent anywhere, except in an explicitly enabled development mode
//   (LC_DEV_CAPTURE_HOST, capture-link.ts): there each retained frame and ink original of a Start is also stored in a
//   local test capture service through the released local host, and the control window says so.
// - No AI watches the screen. Only when the managed ChatGPT subscription is explicitly configured
//   (LC_SUBSCRIPTION_CONNECTOR, subscription.ts), and only when the user presses Ask on a selection, that one picture
//   and the user's question are sent to ChatGPT through the official Codex app server; the selection, the request
//   and its outcome are kept under the session's capture folder (asks/).
// - Whole-display frames showing a material step are retained as files (userData/captures/<session>/:
//   raw and composed PNGs by file SHA-256 under frames/, one manifest.jsonl line per retained, not
//   retained, refused and ended event), within per-session caps; nothing retained is ever deleted.
// - Renderers are sandboxed with context isolation and no Node; they are served only from this app's
//   build over app://, may not navigate or open windows, and their IPC is checked by sender and shape.

import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeImage, net, protocol, screen, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contextImages, forkDesktopInk, isSessionId, newDesktopInk, parseDesktopInk, PICTURE_BYTES_PER_SAVE, PICTURES_PER_SAVE, summarize, type DesktopDisplay, type DesktopInk, type DesktopInkSummary, type StrokeContext } from '../shared/desktop-ink.ts';
import { toFramePixels, type DisplaySample } from '../shared/samples.ts';
import { ASSISTANCE, contextProblem, PNG_MAX_BYTES, questionOf, questionProblem, type AskContext, type AskRequest, type Assistance } from '../shared/subscription-ask.ts';
import { DEFAULT_RETENTION_POLICY, pngSize, RETENTION_FORMAT, type RetentionPolicy } from '../shared/retention.ts';
import { CaptureLink, readLinkConfig, type LinkStatus } from './capture-link.ts';
import { readConnectorConfig, Subscription, type AskOutcome, type SubscriptionStatus } from './subscription.ts';

const HERE = dirname(fileURLToPath(import.meta.url)); // dist/apps/windows/src/main
const DIST = normalize(join(HERE, '..', '..', '..', '..')); // dist/
const pageUrl = (name: string): string => `app://bundle/apps/windows/src/renderer/${name}.html`;
const preload = (name: string): string => join(HERE, '..', 'preload', `${name}.cjs`);
const sha256 = (s: string | Uint8Array): string => createHash('sha256').update(s).digest('hex');
/** An error's message, with this app's data folder (which names the Windows user) shown as <app data>. */
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split(app.getPath('userData')).join('<app data>');
const newSessionId = (): string => randomBytes(8).toString('hex');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
if (process.env['LC_USER_DATA']) app.setPath('userData', process.env['LC_USER_DATA']);
if (!app.requestSingleInstanceLock()) app.quit(); // one writer of the ink store

/** A display that can be captured, as the chooser shows it. */
export type DisplayChoice = { source_id: string; display_id: string; label: string; bounds: Electron.Rectangle; scale_factor: number; primary: boolean; thumbnail: string };

type OpenResult = { ok: true } | { ok: false; reason: string };
type Session = {
  readonly sourceId: string;
  readonly display: DesktopDisplay;
  readonly overlay: BrowserWindow;
  /** The document the overlay edits and saves (changes only when the overlay confirms an Open). */
  doc: DesktopInk;
  /** The overlay passes clicks through (NAV, pointer not over its toolbar). */
  ignoring: boolean;
  samples: DisplaySample[];
  ending: boolean;
  /** One capture per session: armed by the overlay just before it asks, then granted once. */
  capture: 'unused' | 'armed' | 'granting' | 'used';
  /** A saved document offered to the overlay, waiting for it to confirm. */
  opening: { doc: DesktopInk; resolve: (r: OpenResult) => void } | null;
  /** The newest document the overlay sent (saved or not). */
  offered: DesktopInk | null;
  /** The overlay is loaded and shown (until then the session is starting). */
  shown: boolean;
  /** Whole-display frames retained as files for this session. */
  retention: Retention;
  /** Work the overlay has finished (ink saves, answered retained frames); a Stop waits while it grows. */
  progress: number;
  /** The newest ASK selection retained for a question (only with the subscription configured). */
  ask: Selection | null;
};
type Retention = {
  readonly id: string;
  readonly startedAt: string;
  readonly policy: RetentionPolicy;
  frames: number;
  bytes: number;
  notRetained: number;
  refused: number;
  /** Manifest lines that could not be written (their events are counted, and said once writing works again). */
  unwritten: number;
  headerWritten: boolean;
  /** Bytes of manifest.jsonl known to hold whole lines; anything after them is a torn write, cut before appending. */
  validBytes: number;
  /** Retained frames the overlay reported, at Stop, as still being encoded or written: sample seq → the deferred samples it stands for. */
  pending: Map<number, number[]>;
  /** Retained frames already answered (sample seqs): a report at Stop that crossed its answer does not make one lost. */
  answered: Set<number>;
  /** Frames lost when the overlay was ended before writing them (sample seqs), or null. */
  unfinished: number[] | null;
  /** Whether the manifest's `ended` line is written. */
  endRecorded: boolean;
};
/** The retention caps and thresholds for new sessions (the self-test lowers them to exercise refusals). */
let retentionPolicy: RetentionPolicy = DEFAULT_RETENTION_POLICY;
export const setRetentionPolicy = (p: RetentionPolicy): void => void (retentionPolicy = p);

let control: BrowserWindow | null = null;
let current: Session | null = null;
/** A Start in progress before its session exists; ending it cancels the Start. */
let starting: { cancelled: string | null } | null = null;
/** The app quits once the running session has ended (its newest ink saved or reported). */
let quitting = false;
/** How the last session ended, for the control window. */
let lastEnd: string | null = null;
/** The development capture link (off unless explicitly configured), and what it says. */
let link: CaptureLink | null = null;
let linkStatus: LinkStatus = { mode: 'off' };
/** The managed ChatGPT subscription (off unless explicitly configured), and what it says. */
let subscription: Subscription | null = null;
let subscriptionStatus: SubscriptionStatus = { mode: 'off' };

const secure = (extra: Electron.WebPreferences = {}): Electron.WebPreferences => ({ contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: false, ...extra });

// ---- displays and sessions -------------------------------------------------------------------------
export async function listDisplays(): Promise<DisplayChoice[]> {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 200 } });
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay().id;
  return sources.flatMap((s) => {
    const d = displays.find((x) => String(x.id) === s.display_id);
    return d ? [{ source_id: s.id, display_id: s.display_id, label: s.name, bounds: d.bounds, scale_factor: d.scaleFactor, primary: d.id === primary, thumbnail: s.thumbnail.toDataURL() }] : [];
  });
}

/** Before Windows 10 2004 (build 19041) content protection shows the window black in captures instead of leaving it out. */
const exclusionUnsupported = (): boolean => process.platform === 'win32' && Number(release().split('.')[2] ?? 0) < 19041;

export async function start(sourceId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  writeUnrecordedEnds();
  if (current || starting) return { ok: false, reason: current ? 'a session is running; stop it first' : 'a session is starting' };
  if (exclusionUnsupported()) return { ok: false, reason: `this Windows version (${release()}) cannot leave the overlay out of the capture; Windows 10 version 2004 or later is needed` };
  const pending: { cancelled: string | null } = { cancelled: null };
  starting = pending; // reserved before anything is awaited: one Start at a time, and Stop can cancel it
  notifyControl();
  let choice: DisplayChoice | undefined;
  try {
    choice = (await listDisplays()).find((d) => d.source_id === sourceId);
  } catch (error) {
    return { ok: false, reason: `the displays could not be listed (${message(error)})` };
  } finally {
    if (starting === pending) starting = null; // a cancel has released it already
    notifyControl();
  }
  if (pending.cancelled !== null) return { ok: false, reason: `stopped before the capture started (${pending.cancelled})` };
  if (!choice) return { ok: false, reason: 'that display is no longer available' };
  const display: DesktopDisplay = { display_id: choice.display_id, label: choice.label, bounds: choice.bounds, scale_factor: choice.scale_factor };
  const id = newSessionId();
  const overlay = new BrowserWindow({
    ...choice.bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'Learning Companion overlay',
    webPreferences: secure({ preload: preload('overlay'), backgroundThrottling: false }),
  });
  overlay.removeMenu();
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setContentProtection(true); // not in any capture, including ours: frames show the user's apps
  overlay.setIgnoreMouseEvents(true, { forward: true });
  const s: Session = { sourceId, display, overlay, doc: newDesktopInk(id, sha256(id), new Date().toISOString(), display), ignoring: true, samples: [], ending: false, capture: 'unused', opening: null, offered: null, shown: false,
    retention: { id, startedAt: new Date().toISOString(), policy: retentionPolicy, frames: 0, bytes: 0, notRetained: 0, refused: 0, unwritten: 0, headerWritten: false, validBytes: 0, pending: new Map(), answered: new Set(), unfinished: null, endRecorded: false },
    progress: 0, ask: null };
  current = s;
  lastEnd = null;
  link?.begin(id, captureDir(id)); // the explicit user Start is the only one that asks for a stream
  notifyControl(); // Stop works while the overlay loads
  // Closing the overlay ends the session the normal way, so its newest ink is saved or kept.
  overlay.on('close', (e) => {
    if (current !== s) return;
    e.preventDefault();
    end('the overlay window was closed');
  });
  overlay.on('closed', () => finish(s, 'the overlay window was closed'));
  overlay.webContents.on('render-process-gone', (_e, d) => {
    if (current !== s) return;
    const kept = keptNewest(s) ? ' (the newest ink it tried to save is kept below)' : '';
    const frames = recordUnfinished(s);
    lastEnd = `${lastEnd ?? `the overlay stopped working (${d.reason})`}. The overlay stopped working (${d.reason}) before confirming that its newest ink was saved${kept}${frames ? `, or that its whole-display frames were written (${frames})` : ''}`;
    finish(s, lastEnd);
  });
  overlay.webContents.on('unresponsive', () => end('the overlay stopped responding'));
  try {
    await overlay.loadURL(pageUrl('overlay'));
  } catch (error) {
    finish(s, `the overlay could not be loaded (${message(error)})`);
    return { ok: false, reason: `the overlay could not be loaded (${message(error)})` };
  }
  if (current !== s) return { ok: false, reason: `the session ended while starting (${lastEnd ?? 'no reason recorded'})` };
  if (s.ending) {
    // Stopped while loading: nothing was captured or written yet, and nothing is shown.
    finish(s, lastEnd ?? 'stopped');
    return { ok: false, reason: `stopped before the capture started (${lastEnd ?? 'stopped'})` };
  }
  overlay.showInactive();
  overlay.setBounds(choice.bounds); // Windows fits a new window to the work area; cover the taskbar too
  s.shown = true;
  notifyControl();
  return { ok: true };
}

/** Ends the session: the overlay stops its capture, saves, then closes. Live claims end at once. */
export function end(reason: string): void {
  if (starting && !current) {
    starting.cancelled = reason;
    starting = null; // a new Start need not wait for the cancelled one's display listing
    lastEnd = reason;
    sayUnrecordedAsks(); // a record still held is said again here: no session's end will say it
    notifyControl();
    return;
  }
  const s = current;
  if (!s || s.ending) return;
  s.ending = true;
  link?.stopSending(s.retention.id); // latched now: nothing new is sent after the Stop begins
  stopAsking(s); // and no question of this session is sent or answered from here
  lastEnd = reason;
  notifyControl();
  if (s.overlay.isDestroyed()) return finish(s, reason);
  s.overlay.webContents.send('lc:stop', reason);
  // The overlay confirms once its newest ink is saved (or kept) and its retained frames are written. While its
  // work keeps completing, the Stop waits (up to a hard bound); once nothing completes for a while, or at the
  // bound, the session is ended and whatever was not confirmed is recorded and shown as such.
  const stopBegan = Date.now();
  let seen = s.progress;
  const check = (): void => {
    if (current !== s) return; // the overlay answered, or the display went away
    const moving = s.progress !== seen;
    seen = s.progress;
    if (moving && Date.now() - stopBegan < STOP_HARD_MS) return void setTimeout(check, STOP_QUIET_MS);
    const kept = keptNewest(s) ? ' (the newest ink it sent is kept below)' : '';
    const frames = recordUnfinished(s);
    lastEnd = `${reason}. The overlay did not confirm that its newest ink was saved${kept}${frames ? `, nor that its whole-display frames were written (${frames})` : ''}`;
    const wasQuitting = quitting;
    quitting = false; // an unconfirmed save is not closed away silently: the window stays, saying so
    finish(s, reason);
    if (wasQuitting && control && !control.isDestroyed()) control.show();
  };
  setTimeout(check, STOP_QUIET_MS);
}
/** A Stop waits this long without any completed work before it ends the overlay; never longer than STOP_HARD_MS. */
const STOP_QUIET_MS = 10_000;
const STOP_HARD_MS = 60_000;
/**
 * At a forced end (the Stop bound, or the overlay's process gone): records the retained frames the overlay reported
 * as still being written (their pixels are lost), or, when it reported none, that later frames may be missing.
 * Returns how that is said, or null when no whole-display frame could have been taken.
 */
function recordUnfinished(s: Session): string | null {
  const r = s.retention;
  if (!(s.capture === 'used' || r.headerWritten || r.unwritten > 0 || r.pending.size > 0)) return null;
  const lost = [...r.pending.keys()].sort((a, b) => a - b);
  r.unfinished = lost;
  appendRetention(s, {
    kind: 'unfinished',
    samples: lost,
    deferred_samples_not_retained: [...r.pending.values()].flat().sort((a, b) => a - b),
    reason:
      lost.length > 0
        ? 'the overlay was ended before these retained frames were written; their pixels are lost'
        : 'the overlay was ended before confirming that its retained frames were written; frames after the last listed one may be missing',
  });
  return lost.length > 0 ? `${lost.length} frame(s) lost` : 'some may be missing';
}
/** Closes session `s` if it is still the current one (a later session is never touched). */
function finish(s: Session, reason: string): void {
  if (current !== s) return;
  current = null;
  link?.stopSending(s.retention.id); // however the session ended
  stopAsking(s);
  lastEnd ??= reason;
  // Records of questions that could not be written are written now; what still cannot be is said, not dropped silently.
  if (s.ask) retireSelection(s, s.ask);
  writeUnrecordedAsks();
  s.opening?.resolve({ ok: false, reason: 'the session ended' });
  s.opening = null;
  if (!s.overlay.isDestroyed()) s.overlay.destroy();
  if (s.retention.headerWritten || s.retention.unwritten > 0) {
    const endLine = { kind: 'ended', at: new Date().toISOString(), reason: lastEnd ?? reason };
    s.retention.endRecorded = appendRetention(s, endLine, false);
    if (!s.retention.endRecorded) endedUnrecorded.set(s.retention.id, { s, line: endLine }); // kept, shown, and written later if it can be
  }
  sayUnrecordedAsks(); // every one still held, an earlier session's included (said in the window, not in this session's manifest)
  notifyRetention(s);
  notifyControl();
  if (unresolved()) writeSpareCopies();
  if (quitting) quitIfNothingUnsaved();
}

const sessionInfo = (): unknown =>
  current
    ? { running: true, starting: !current.shown, ending: current.ending, display: current.display, session_id: String(current.overlay.id) }
    : { running: false, starting: starting !== null, ended: lastEnd };
function notifyControl(): void {
  if (!control || control.isDestroyed()) return;
  control.webContents.send('lc:session', sessionInfo());
}

// ---- ink that could not be written ------------------------------------------------------------------------
/**
 * The newest ink of a session that could not be written, kept until the user retries, exports or discards it.
 * Its pictures are in `heldPictures` (or already on disk). A spare copy is written to the temporary folder
 * when a session ends with kept ink and when Windows ends the user's session.
 */
type Recovery = { key: string; doc: DesktopInk; reason: string; exported_to: string | null; spare: boolean };
const recoveries = new Map<string, Recovery>();
/** Context pictures received from the overlay that are not on this device's disk yet. */
const heldPictures = new Map<string, Uint8Array>();
/** Kept ink that is neither saved nor exported: closing the app waits for the user's choice. */
const unresolved = (): boolean => [...recoveries.values()].some((r) => r.exported_to === null);
const recoveryInfo = (): unknown[] =>
  [...recoveries.values()].map((r) => ({ id: r.key, created_at: r.doc.created_at, display_label: r.doc.display.label, strokes: r.doc.ink.visible.length, revision: r.doc.ink.revision, reason: r.reason, exported_to: r.exported_to, spare_copy: r.spare }));
function notifyRecoveries(): void {
  if (control && !control.isDestroyed()) control.webContents.send('lc:recoveries', recoveryInfo());
}
/** Whether the newest ink the session's overlay sent is exactly what is kept. */
const keptNewest = (s: Session): boolean => [...recoveries.values()].some((r) => r.doc.id === s.offered?.id && r.doc.ink.revision === s.offered.ink.revision);
/** Whether `a`'s history starts with all of `b`'s. */
const extendsInk = (a: DesktopInk, b: DesktopInk): boolean => b.ink.history.every((op, i) => JSON.stringify(op) === JSON.stringify(a.ink.history[i]));
/** Keeps `doc`; kept ink it does not continue stays kept under its own key, so nothing kept is replaced. */
function keep(doc: DesktopInk, reason: string): void {
  const old = recoveries.get(doc.id);
  if (old && !extendsInk(doc, old.doc)) {
    const key = `${doc.id}~${old.doc.ink.revision}`;
    recoveries.set(key, { ...old, key });
  }
  recoveries.set(doc.id, { key: doc.id, doc, reason, exported_to: null, spare: old?.spare ?? false });
  notifyRecoveries();
}
/** After `doc` was written: kept ink it continues is resolved. */
function resolveKept(doc: DesktopInk): void {
  const old = recoveries.get(doc.id);
  if (!old || !extendsInk(doc, old.doc)) return;
  recoveries.delete(doc.id);
  removeSpare(doc.id);
  notifyRecoveries();
}
/** Drops held pictures that are on disk now or that no kept or offered ink refers to. */
function pruneHeld(): void {
  const wanted = new Set([...recoveries.values()].flatMap((r) => contextImages(r.doc)));
  for (const d of [current?.doc, current?.offered]) if (d) for (const sha of contextImages(d)) wanted.add(sha);
  for (const [sha, bytes] of heldPictures) {
    let onDisk = false;
    try {
      onDisk = storedOriginal(contextFile(sha), sha, bytes.length).state === 'same'; // the good bytes are dropped only when the file is exactly them
    } catch {
      onDisk = false;
    }
    if (!wanted.has(sha) || onDisk) heldPictures.delete(sha);
  }
}
/** Kept ink and every picture it refers to that can be read, as one export document. */
function exportPayload(r: Recovery): { payload: unknown; missing: number } {
  const pictures: Record<string, string> = {};
  const missing: string[] = [];
  const notMatching: Array<{ sha256: string; reason: string }> = [];
  for (const sha of contextImages(r.doc)) {
    let bytes = heldPictures.get(sha) ?? null;
    if (!bytes) {
      try {
        const stored = storedOriginal(contextFile(sha), sha);
        if (stored.state === 'same') bytes = stored.data;
        else if (stored.state !== 'absent') notMatching.push({ sha256: sha, reason: stored.reason }); // never exported as that picture
      } catch {
        bytes = null; // unreadable on this device: listed as missing
      }
    }
    if (bytes) pictures[sha] = Buffer.from(bytes).toString('base64');
    else missing.push(sha);
  }
  return {
    payload: { format: 'lc-desktop-ink-export/v1', exported_at: new Date().toISOString(), not_saved_because: r.reason, ink: r.doc, context_pictures_png_base64: pictures, context_pictures_missing: missing, context_pictures_not_matching: notMatching },
    missing: missing.length,
  };
}
const spareDir = (): string => join(app.getPath('temp'), 'Learning Companion unsaved ink');
const spareFile = (key: string): string => join(spareDir(), `${key}.json`);
/** Best effort: a spare export of each unresolved kept ink in the temporary folder, for when the app is ended by force. */
function writeSpareCopies(): void {
  for (const r of recoveries.values()) {
    if (r.exported_to !== null) continue;
    try {
      mkdirSync(spareDir(), { recursive: true });
      writeFileSync(spareFile(r.key), JSON.stringify(exportPayload(r).payload));
      r.spare = true;
    } catch {
      r.spare = false; // that disk fails too; the ink stays kept in the app
    }
  }
  notifyRecoveries();
}
function removeSpare(key: string): void {
  try {
    rmSync(spareFile(key), { force: true });
    if (existsSync(spareDir()) && readdirSync(spareDir()).length === 0) rmdirSync(spareDir());
  } catch {
    // a leftover spare copy is harmless
  }
}
/** Quits after a session ended on close, unless kept ink awaits the user's choice (then the control window says so). */
function quitIfNothingUnsaved(): void {
  quitting = false;
  // How a question ended that is still unwritten is said by the session's end: the window stays once, saying so (the
  // next close is not held; writing it is tried a last time as the app quits).
  if (!unresolved() && asksUnrecorded.size === 0) return void app.quit();
  if (control && !control.isDestroyed()) {
    if (unresolved()) control.webContents.send('lc:close-held');
    control.show();
  }
}

// ---- whole-display retention ----------------------------------------------------------------------------
const captureDir = (id: string): string => join(app.getPath('userData'), 'captures', id);
const frameFile = (id: string, sha: string): string => join(captureDir(id), 'frames', `${sha}.png`);
const inkOriginalFile = (id: string, sha: string): string => join(captureDir(id), 'ink', `${sha}.json`);
/** An ink document retained as an original is at most this long (the released original limit, 32 MiB). */
const MAX_INK_ORIGINAL_BYTES = 33_554_432;
/** Where retained frames are, as shown to the user (the app data folder names the Windows user). */
export const retentionPlace = (id: string): string => `<app data>\\captures\\${id}`;

function retentionHeader(s: Session): unknown {
  return {
    kind: 'header',
    format: RETENTION_FORMAT,
    capture_session: s.retention.id,
    started_at: s.retention.startedAt,
    source: { kind: 'display', source_id: s.sourceId, ...s.display },
    policy: s.retention.policy,
    files: 'frames/<sha256>.png: the PNG file; sha256 and bytes below are of that file. pixels_sha256 is the SHA-256 of the RGBA pixels this app read back (a different hash).',
    ink_originals:
      "ink/<sha256>.json: the exact editable ink document (lc-desktop-ink/v1 JSON) a composed frame was drawn from, taken with the composition. composed.ink_original names its file, sha256 and bytes, or says why none was retained (refused). A gesture still in progress then (composed.uncommitted_gesture) is in neither the composition nor that document; for strokes whose evidence was still being made (composed.evidence_pending), that document has no evidence entry yet or evidence whose context pictures are null: pending, not failed. Lines written before this have no ink_original: their ink is unknown.",
    time_basis: {
      sampled_at: 'wall-clock ISO time of the sample (this app)',
      taken_at: 'wall-clock ISO time this app took the held image',
      monotonic_ms: 'the overlay performance.now() at the sample',
      presentation_ms: "the overlay performance time at which the held image's newest frame was presented; null before the first frame callback",
      frame_age_ms: "measured at the sample as performance.now() minus the held image's newest frame's presentation time, then rounded. monotonic_ms and presentation_ms are rounded separately and read at slightly different moments, so frame_age_ms can differ from their difference by a millisecond or more. null when presentation_ms is null. The capture latency before presentation is not measured.",
      gap_ms: "how late the sampler ran for a sample in state 'gap', as measured then; nothing is known about the display during it",
    },
  };
}
/**
 * Appends one manifest line. What a failed append left (a torn line) is cut back at once to the whole lines known to
 * be there, or before the next append if that failed too, so every line stays valid JSON. A line that cannot be
 * written is counted (unless `counted` is false: the `ended` line, kept and tried again instead), and said with the
 * next line that can be; nothing is acknowledged unless the append (and any repair) succeeded.
 */
function appendRetention(s: Session, line: Record<string, unknown>, counted = true): boolean {
  const r = s.retention;
  const file = join(captureDir(r.id), 'manifest.jsonl');
  try {
    mkdirSync(captureDir(r.id), { recursive: true });
    const size = existsSync(file) ? statSync(file).size : 0;
    if (size !== r.validBytes) {
      // What a failed append left (a torn line, or whole lines that were counted as unwritten) is cut back to the
      // lines known to be whole; a manifest shortened by something else keeps its whole lines.
      const keep = size > r.validBytes ? r.validBytes : size === 0 ? 0 : readFileSync(file).lastIndexOf(0x0a) + 1;
      if (keep !== size) truncateSync(file, keep);
      r.validBytes = keep;
      if (keep === 0) r.headerWritten = false; // it starts again with its header
    }
    const lines: unknown[] = [];
    if (!r.headerWritten) lines.push(retentionHeader(s));
    if (r.unwritten > 0) lines.push({ kind: 'unwritten', count: r.unwritten, reason: 'earlier manifest lines could not be written to this device; their events are not listed' });
    lines.push(line);
    const text = lines.map((l) => `${JSON.stringify(l)}\n`).join('');
    appendFileSync(file, text);
    r.validBytes += Buffer.byteLength(text);
    r.headerWritten = true;
    r.unwritten = 0;
    link?.appended(r.id, r.validBytes); // only whole lines are ever read by it
    return true;
  } catch {
    if (counted) r.unwritten += 1;
    try {
      if (existsSync(file) && statSync(file).size > r.validBytes) truncateSync(file, r.validBytes);
    } catch {
      // cut before the next append
    }
    return false;
  }
}
/** Sessions whose `ended` line could not be written: kept after teardown, shown, and written when possible. */
const endedUnrecorded = new Map<string, { s: Session; line: Record<string, unknown> }>();
function writeUnrecordedEnds(): void {
  for (const [id, { s, line }] of endedUnrecorded) {
    if (!appendRetention(s, { ...line, recorded_at: new Date().toISOString(), note: 'recorded late: the first attempt to write this line failed' }, false)) continue;
    s.retention.endRecorded = true;
    endedUnrecorded.delete(id);
    if (!current) notifyRetention(s); // a running session's own record stays shown
  }
  writeUnrecordedAsks();
}
function notifyRetention(s: Session): void {
  const r = s.retention;
  const ended = current !== s;
  if (control && !control.isDestroyed()) {
    control.webContents.send('lc:retention', { frames: r.frames, bytes: r.bytes, not_retained: r.notRetained, refused: r.refused, unwritten: r.unwritten, unfinished: r.unfinished, ended, end_recorded: r.endRecorded, place: retentionPlace(r.id) });
  }
}
type Picture = { sha256: string; bytes: number; width: number; height: number; data: Uint8Array };
/**
 * A PNG as sent by the overlay: its file SHA-256 and length, and its size as decoded, checked against the frame the
 * facts describe. Only a picture that decodes completely (Electron's native decoder) counts.
 */
function readPicture(value: unknown, width: number, height: number, id: string): Picture | string {
  if (Object.prototype.toString.call(value) !== '[object Uint8Array]') return 'not a picture';
  const data = value as Uint8Array;
  if (data.length > 96 * 1024 * 1024) return 'too large';
  const header = pngSize(data);
  if (!header) return 'not a PNG';
  if (header.width !== width || header.height !== height) return `a ${header.width}×${header.height} PNG for a ${width}×${height} frame`;
  const decoded = nativeImage.createFromBuffer(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  const size = decoded.isEmpty() ? null : decoded.getSize();
  if (!size || size.width !== width || size.height !== height) return 'a PNG that does not decode completely';
  const sha = sha256(data);
  return { sha256: sha, bytes: data.length, width, height, data };
}
const isSeq = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isHex = (v: unknown, n: number): v is string => typeof v === 'string' && v.length === n && /^[0-9a-f]+$/.test(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** What is wrong with a retained frame's facts (the shape the overlay sends), or null. */
function factsProblem(f: unknown, composedSent: boolean): string | null {
  if (!isObj(f)) return 'the facts are missing';
  if (!isSeq(f['sample_seq']) || !isSeq(f['frame_seq']) || f['frame_seq'] > f['sample_seq']) return 'the sample or frame sequence is malformed';
  if (!['first', 'changed', 'ink', 'heartbeat', 'deferred'].includes(f['reason'] as string)) return 'the reason is malformed';
  const deferred = f['deferred_samples_not_retained'];
  if (!Array.isArray(deferred) || !deferred.every((x) => isSeq(x) && x < (f['sample_seq'] as number))) return 'the deferred samples are malformed';
  if (!isTime(f['sampled_at']) || !isTime(f['taken_at']) || !isMs(f['monotonic_ms'])) return 'the times are malformed';
  if (!['fresh', 'no_new_frame', 'gap'].includes(f['state'] as string)) return 'the state is malformed';
  if (f['state'] === 'gap' ? !isMs(f['gap_ms']) : f['gap_ms'] !== null) return 'the gap is malformed';
  if (!isCount(f['presented_frames']) || !isCount(f['stream_presented_frames']) || f['presented_frames'] > f['stream_presented_frames']) return 'the frame counts are malformed';
  if (f['presentation_ms'] === null ? f['frame_age_ms'] !== null : !isMs(f['presentation_ms']) || !isMs(f['frame_age_ms'])) return 'the presentation facts are malformed';
  const raw = f['raw'];
  if (!isObj(raw) || !isSeq(raw['width']) || !isSeq(raw['height']) || !isHex(raw['pixels_sha256'], 64) || !(raw['change_from_previous_sample'] === null || (isMs(raw['change_from_previous_sample']) && raw['change_from_previous_sample'] <= 1))) return 'the raw frame facts are malformed';
  const c = f['composed'];
  if (!composedSent) return c === null ? null : 'composed facts without a composed picture';
  if (!isObj(c) || !isHex(c['ink_session'], 16) || !isCount(c['ink_revision']) || !isCount(c['visible_strokes']) || typeof c['transformation'] !== 'string' || !isHex(c['pixels_sha256'], 64)) return 'the composed frame facts are malformed';
  const m = c['ink_marks'];
  if (!isObj(m) || !['verified', 'changed', 'unknown', 'following_content'].every((k) => isCount(m[k])) || (m['verified'] as number) + (m['changed'] as number) + (m['unknown'] as number) + (m['following_content'] as number) !== c['visible_strokes']) return 'the ink marks are malformed';
  const g = c['uncommitted_gesture'];
  if (!(g === null || (isObj(g) && ['ink', 'erase', 'ask'].includes(g['kind'] as string) && isCount(g['points'])))) return 'the gesture in progress is malformed';
  const pending = c['evidence_pending'];
  if (!Array.isArray(pending) || pending.length > 10_000 || !pending.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)) return 'the strokes with evidence pending are malformed';
  return null;
}
type RetainAnswer = { ok: true } | { ok: false; reason: string; limit?: true; retry?: true };
/**
 * Retains one sample's whole-display frame: its raw PNG and composed PNG, with the facts the overlay pinned
 * with them. Refused (and recorded, with the deferred samples it stood for) beyond the caps (`limit`), when the
 * files or the manifest line cannot be written (`retry`: a transient failure), or when the pictures are not the
 * frame the facts describe (neither: sending it again cannot help).
 */
/**
 * What is stored at an original's content address: nothing, exactly its bytes in a regular file, something other than
 * a file, or a file with other bytes (`bytes`, when given, is the expected length). Errors other than absence are thrown.
 */
type Stored = { state: 'absent' } | { state: 'same'; data: Buffer } | { state: 'not_a_file' | 'other_bytes'; reason: string };
function storedOriginal(file: string, sha: string, bytes?: number): Stored {
  let st;
  try {
    st = lstatSync(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { state: 'absent' }; // nothing is stored there (writing will say why it cannot be)
    throw error;
  }
  if (!st.isFile()) return { state: 'not_a_file', reason: 'something other than a file is at its address' };
  if (bytes !== undefined && st.size !== bytes) return { state: 'other_bytes', reason: `the file there has ${st.size} bytes, not ${bytes}` };
  const data = readFileSync(file);
  if (sha256(data) !== sha) return { state: 'other_bytes', reason: bytes !== undefined ? 'the file there has other bytes of the same length' : 'the file there has other bytes' };
  return { state: 'same', data }; // exactly the bytes that were checked

}
/** A context picture that cannot be kept at its address: what is there is not its bytes (and is left untouched). */
class NotItsBytes extends Error {}
/**
 * The ink document a composition was drawn from, as the exact bytes the overlay took with it: read back with the ink
 * parser and matched to the composition's session, revision and visible strokes. What cannot be retained is said
 * (the frame itself is still retained); a later document is never put in its place.
 */
function readInkOriginal(value: unknown, c: Record<string, unknown>): { sha256: string; bytes: number; data: Uint8Array } | { refused: string } {
  if (value === null || value === undefined) return { refused: 'the overlay sent no ink document with this composition' };
  if (Object.prototype.toString.call(value) !== '[object Uint8Array]') return { refused: 'the ink document is not bytes' };
  const data = value as Uint8Array;
  if (data.length > MAX_INK_ORIGINAL_BYTES) return { refused: `the ink document is ${data.length} bytes, over the ${MAX_INK_ORIGINAL_BYTES}-byte original limit` };
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch {
    return { refused: 'the ink document is not UTF-8 JSON' };
  }
  const docId = isObj(doc) ? doc['id'] : null;
  if (!isSessionId(docId)) return { refused: 'the ink document has no session id' };
  const read = parseDesktopInk(doc, sha256(docId));
  if (!read.ok) return { refused: `the ink document does not read back (${read.reason})` };
  if (read.doc.id !== c['ink_session'] || read.doc.ink.revision !== c['ink_revision'] || read.doc.ink.visible.length !== c['visible_strokes']) {
    return { refused: 'the ink document is not the one composed (its session, revision or visible strokes differ)' };
  }
  const sha = sha256(data);
  return { sha256: sha, bytes: data.length, data };
}

function retainFrame(s: Session, factsValue: unknown, rawValue: unknown, composedValue: unknown, inkValue: unknown = null): RetainAnswer {
  const r = s.retention;
  const problem = factsProblem(factsValue, composedValue !== null);
  if (problem) return { ok: false, reason: `the frame facts are malformed: ${problem}` }; // nothing is written from them
  if (composedValue === null && inkValue !== null && inkValue !== undefined) return { ok: false, reason: 'the frame facts are malformed: an ink document came without a composed picture' };
  s.progress += 1;
  const f = factsValue as Record<string, unknown> & { sample_seq: number; frame_seq: number; deferred_samples_not_retained: number[]; raw: Record<string, unknown> & { width: number; height: number }; composed: Record<string, unknown> | null };
  const seq = f.sample_seq;
  const width = f.raw.width;
  const height = f.raw.height;
  const deferred = f.deferred_samples_not_retained;
  r.pending.delete(seq); // answered, whatever the answer
  r.answered.add(seq);
  // Decoding is bounded by the chosen display (a change of its size ends the session).
  const most = (dip: number): number => Math.ceil(dip * s.display.scale_factor) + 16;
  const refuse = (reason: string, kind: { limit?: true; retry?: true } = {}): RetainAnswer => {
    r.refused += 1;
    appendRetention(s, { kind: 'refused', sample_seq: seq, frame_seq: f.frame_seq, deferred_samples_not_retained: deferred, reason });
    notifyRetention(s);
    return { ok: false, reason, ...kind };
  };
  if (width > most(s.display.bounds.width) || height > most(s.display.bounds.height)) return refuse(`a ${width}×${height} frame is larger than the chosen display`);
  const raw = readPicture(rawValue, width, height, r.id);
  if (typeof raw === 'string') return refuse(`the raw picture is ${raw}`);
  const composed = composedValue === null ? null : readPicture(composedValue, width, height, r.id);
  if (typeof composed === 'string') return refuse(`the composed picture is ${composed}`);
  const ink = composed === null ? null : readInkOriginal(inkValue, f.composed!);
  const inkData = ink && 'data' in ink ? ink : null;
  // The originals at their content addresses (the raw and composed PNGs may be one file).
  const originals = [
    { name: `frames/${raw.sha256}.png`, file: frameFile(r.id, raw.sha256), sha: raw.sha256, data: raw.data },
    ...(composed ? [{ name: `frames/${composed.sha256}.png`, file: frameFile(r.id, composed.sha256), sha: composed.sha256, data: composed.data }] : []),
    ...(inkData ? [{ name: `ink/${inkData.sha256}.json`, file: inkOriginalFile(r.id, inkData.sha256), sha: inkData.sha256, data: inkData.data }] : []),
  ].filter((o, i, all) => all.findIndex((x) => x.file === o.file) === i);
  // What is already stored at an address is reused only if it is exactly these bytes; anything else is left
  // untouched and the frame refused (not retried: it would not change).
  const toWrite: typeof originals = [];
  try {
    for (const o of originals) {
      const stored = storedOriginal(o.file, o.sha, o.data.length);
      if (stored.state === 'absent') toWrite.push(o);
      else if (stored.state !== 'same') return refuse(`the original already stored as ${o.name} is not these bytes (${stored.reason}); it is left untouched`);
    }
  } catch (error) {
    return refuse(`the stored originals could not be checked (${message(error)})`, { retry: true });
  }
  const adding = toWrite.reduce((a, o) => a + o.data.length, 0);
  if (r.frames + 1 > r.policy.max_frames) return refuse(`the retention limit of ${r.policy.max_frames} frames for this session is reached`, { limit: true });
  if (r.bytes + adding > r.policy.max_bytes) return refuse(`the retention limit of ${r.policy.max_bytes} bytes for this session is reached`, { limit: true });
  try {
    for (const o of toWrite) {
      mkdirSync(dirname(o.file), { recursive: true });
      writeAtomic(o.file, o.data);
      r.bytes += o.data.length; // counted as written, listed or not
    }
  } catch (error) {
    return refuse(`writing to this device failed (${message(error)})`, { retry: true });
  }
  const file = (p: Picture): unknown => ({ file: `frames/${p.sha256}.png`, sha256: p.sha256, bytes: p.bytes, width: p.width, height: p.height });
  const inkOriginal = ink === null ? null : 'data' in ink ? { file: `ink/${ink.sha256}.json`, sha256: ink.sha256, bytes: ink.bytes } : { refused: ink.refused };
  const line = { ...f, kind: 'retained', raw: { ...f.raw, ...(file(raw) as object) }, composed: composed && f.composed ? { ...f.composed, ...(file(composed) as object), ink_original: inkOriginal } : null };
  if (!appendRetention(s, line)) return { ok: false, reason: 'the files were written, but the manifest line could not be', retry: true };
  r.frames += 1;
  notifyRetention(s);
  return { ok: true };
}
/** Samples observed but not retained (a run of them, with the reason), as the overlay reports them. */
function notRetained(s: Session, value: unknown): void {
  const g = value as { from_seq?: unknown; to_seq?: unknown; samples?: unknown; reason?: unknown } | null;
  if (!isSeq(g?.from_seq) || !isSeq(g.to_seq) || g.to_seq < g.from_seq || !isSeq(g.samples) || g.samples > g.to_seq - g.from_seq + 1 || typeof g.reason !== 'string') return;
  s.retention.notRetained += g.samples;
  appendRetention(s, { kind: 'not_retained', from_seq: g.from_seq, to_seq: g.to_seq, samples: g.samples, reason: g.reason.slice(0, 300) });
  notifyRetention(s);
}

/** A sample in state 'gap': the sampler ran late, so nothing is known about the display for gap_ms before it. */
function observationGap(s: Session, value: unknown): void {
  const g = value as { sample_seq?: unknown; gap_ms?: unknown; sampled_at?: unknown; monotonic_ms?: unknown } | null;
  if (!isSeq(g?.sample_seq) || !isMs(g.gap_ms) || g.gap_ms <= 0 || !isTime(g.sampled_at) || !isMs(g.monotonic_ms)) return;
  appendRetention(s, { kind: 'gap', sample_seq: g.sample_seq, gap_ms: g.gap_ms, sampled_at: g.sampled_at, monotonic_ms: g.monotonic_ms, reason: 'the sampler ran late: nothing is known about the display for gap_ms before this sample' });
}

// ---- ink storage ------------------------------------------------------------------------------------
const inkDir = (): string => join(app.getPath('userData'), 'ink');
const inkFile = (id: string): string => join(inkDir(), `${id}.json`);
const contextFile = (sha: string): string => join(inkDir(), 'context', `${sha}.png`);
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function listInk(): { sessions: DesktopInkSummary[]; unreadable: number } {
  if (!existsSync(inkDir())) return { sessions: [], unreadable: 0 };
  let unreadable = 0;
  const sessions = readdirSync(inkDir())
    .filter((f) => /^[0-9a-f]{16}\.json$/.test(f))
    .flatMap((f) => {
      const id = f.slice(0, 16);
      try {
        const read = parseDesktopInk(JSON.parse(readFileSync(inkFile(id), 'utf8')), sha256(id));
        if (read.ok && read.doc.id === id) return [summarize(read.doc)];
      } catch {
        // counted below
      }
      unreadable += 1;
      return [];
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { sessions, unreadable };
}

function readStored(id: string): ReturnType<typeof parseDesktopInk> {
  try {
    return parseDesktopInk(JSON.parse(readFileSync(inkFile(id), 'utf8')), sha256(id));
  } catch (error) {
    return { ok: false, reason: `it cannot be read (${message(error)})` };
  }
}
/** Whether `doc` may be written over the stored file of its session: absent, or readable and a start of it. */
function continues(doc: DesktopInk): { ok: true } | { ok: false; reason: string } {
  if (!existsSync(inkFile(doc.id))) return { ok: true };
  const stored = readStored(doc.id);
  if (!stored.ok) return { ok: false, reason: 'the ink stored for this session cannot be read by this version, so it was left untouched' };
  const kept = stored.doc.ink.history.every((op, i) => JSON.stringify(op) === JSON.stringify(doc.ink.history[i]));
  return kept ? { ok: true } : { ok: false, reason: 'the stored history is not the start of this one, so it was left untouched' };
}
// ---- ASK: a selection, and a question about it to the managed ChatGPT subscription ----------------------------------
// Only with the subscription configured. A selection is the exact composed PNG the overlay showed, the facts of where
// and when it was captured, and the exact ink document drawn into it, kept under the session's capture folder:
// asks/<sha256>.png, ink/<sha256>.json, and asks/<selection>.json (the selection, each question about it and how it
// ended; an answer's text is there, apart from the originals). Nothing is sent until the user presses Ask.
/**
 * One question about a selection. `shown` is true only once the overlay reported that it showed the answer.
 * `presentation` is written for an answer: 'unconfirmed' from the moment it is sent to the overlay, 'shown' once the
 * overlay reported it. An answer left 'unconfirmed' (the overlay was lost, or the session ended, before it reported)
 * may or may not have been seen: it keeps its text, and it is not displayed help as far as this record knows.
 */
type AskEntry = { request_id: string; question: string; assistance: Assistance; model: string | null; submitted_at: string; ended_at: string | null; outcome: unknown; shown: boolean; presentation?: 'shown' | 'unconfirmed' };
type Selection = {
  readonly id: string;
  readonly image: Picture;
  readonly context: AskContext;
  readonly record: { format: 'lc-windows-ask/v1'; selection_id: string; selected_at: string; image: unknown; context: AskContext; ink_original: unknown; requests: AskEntry[] };
  /** The question that is out, or the last one. */
  request: { id: string; state: 'asking' | 'cancelled' | 'done' } | null;
  /** Why the record on this device is behind what is held here (its last write failed), or null. */
  unsaved: string | null;
};
const askFile = (id: string, name: string): string => join(captureDir(id), 'asks', name);
const isRectValue = (v: unknown): v is { x: number; y: number; width: number; height: number } => isObj(v) && ['x', 'y', 'width', 'height'].every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]));
type AskAnswer = { ok: true; selection_id: string } | { ok: false; reason: string };

/** Retains an ASK selection as the overlay composed it. Nothing is sent; a question in flight before it is cancelled. */
function retainSelection(s: Session, factsValue: unknown, pngValue: unknown, inkValue: unknown): AskAnswer {
  if (!subscription) return { ok: false, reason: 'no AI is connected' };
  // A new selection replaces the card: the one before can no longer be asked about, and a question still out about
  // it is cancelled, whether or not this one is retained.
  dropSelection(s);
  if (s.ending) return { ok: false, reason: 'the capture is ending' };
  const f = factsValue;
  if (!isObj(f) || !isRectValue(f['region_dip']) || !isSeq(f['frame_seq']) || !isTime(f['frame_captured_at']) || !isSeq(f['frame_width']) || !isSeq(f['frame_height']) || !isHex(f['ink_session'], 16) || !isCount(f['ink_revision']) || !isCount(f['visible_strokes'])) {
    return { ok: false, reason: 'the selection facts are malformed' };
  }
  const most = (dip: number): number => Math.ceil(dip * s.display.scale_factor) + 16;
  if (f['frame_width'] > most(s.display.bounds.width) || f['frame_height'] > most(s.display.bounds.height)) return { ok: false, reason: 'the frame is larger than the chosen display' };
  // The pixels of the selection are worked out here, from the display and the frame, not taken from the overlay.
  const region_dip = { x: f['region_dip'].x, y: f['region_dip'].y, width: f['region_dip'].width, height: f['region_dip'].height };
  const region_px = toFramePixels(region_dip, s.display.bounds, { width: f['frame_width'], height: f['frame_height'] });
  if (!region_px) return { ok: false, reason: 'the selected region is not inside the display' };
  if (Object.prototype.toString.call(pngValue) === '[object Uint8Array]' && (pngValue as Uint8Array).length > PNG_MAX_BYTES) return { ok: false, reason: `the selection's picture is over ${PNG_MAX_BYTES} bytes` };
  const image = readPicture(pngValue, region_px.width, region_px.height, s.retention.id);
  if (typeof image === 'string') return { ok: false, reason: `the selection's picture is ${image}` };
  const ink = readInkOriginal(inkValue, { ink_session: f['ink_session'], ink_revision: f['ink_revision'], visible_strokes: f['visible_strokes'] });
  const context: AskContext = {
    capture_session_id: s.retention.id,
    frame_seq: f['frame_seq'],
    frame_captured_at: new Date(f['frame_captured_at']).toISOString(),
    frame_width: f['frame_width'],
    frame_height: f['frame_height'],
    display: { id: s.display.display_id, bounds: { x: s.display.bounds.x, y: s.display.bounds.y, width: s.display.bounds.width, height: s.display.bounds.height }, scale_factor: s.display.scale_factor },
    region_dip,
    region_px,
    ink_revision: f['ink_revision'],
    ink_sha256: 'data' in ink ? ink.sha256 : null, // null: the exact ink document could not be retained (the record says why)
    source_url: null,
    source_version: null,
    media_position: null,
  };
  const problem = contextProblem(context, image);
  if (problem) return { ok: false, reason: problem };
  const id = `ask-${randomBytes(8).toString('hex')}`;
  const originals = [
    { name: `asks/${image.sha256}.png`, file: askFile(s.retention.id, `${image.sha256}.png`), sha: image.sha256, data: image.data },
    ...('data' in ink ? [{ name: `ink/${ink.sha256}.json`, file: inkOriginalFile(s.retention.id, ink.sha256), sha: ink.sha256, data: ink.data }] : []),
  ];
  const record: Selection['record'] = {
    format: 'lc-windows-ask/v1',
    selection_id: id,
    selected_at: new Date().toISOString(),
    image: { file: originals[0]!.name, sha256: image.sha256, bytes: image.bytes, width: image.width, height: image.height },
    context,
    ink_original: 'data' in ink ? { file: `ink/${ink.sha256}.json`, sha256: ink.sha256, bytes: ink.bytes } : { refused: ink.refused },
    requests: [],
  };
  try {
    // What is already at an address is reused only if it is exactly these bytes; anything else is left untouched.
    const toWrite = originals.filter((o) => {
      const stored = storedOriginal(o.file, o.sha, o.data.length);
      if (stored.state !== 'absent' && stored.state !== 'same') throw new NotItsBytes(`the original already stored as ${o.name} is not these bytes (${stored.reason}); it is left untouched`);
      return stored.state === 'absent';
    });
    const adding = toWrite.reduce((a, o) => a + o.data.length, 0);
    if (s.retention.bytes + adding > s.retention.policy.max_bytes) return { ok: false, reason: `the retention limit of ${s.retention.policy.max_bytes} bytes for this session is reached` };
    for (const o of toWrite) {
      mkdirSync(dirname(o.file), { recursive: true });
      writeAtomic(o.file, o.data);
      s.retention.bytes += o.data.length;
    }
    writeAtomic(askFile(s.retention.id, `${id}.json`), `${JSON.stringify(record)}\n`);
  } catch (error) {
    return { ok: false, reason: error instanceof NotItsBytes ? error.message : `the selection could not be written to this device (${message(error)})` };
  }
  s.ask = { id, image, context, record, request: null, unsaved: null };
  s.progress += 1;
  notifyRetention(s);
  return { ok: true, selection_id: id };
}

/** The user pressed Ask: one question about the current selection is written, then sent, once. */
function submitAsk(s: Session, selectionId: unknown, questionValue: unknown, assistanceValue: unknown): { ok: true; request_id: string; model: string | null } | { ok: false; reason: string } {
  const sel = s.ask;
  if (!subscription) return { ok: false, reason: 'no AI is connected' };
  if (!sel || sel.id !== selectionId) return { ok: false, reason: 'this is no longer the current selection' };
  if (s.ending) return { ok: false, reason: 'the capture is ending' };
  if (sel.request && sel.request.state !== 'done') return { ok: false, reason: sel.request.state === 'asking' ? 'this selection\'s question is still being answered' : 'the question before is still being cancelled' };
  const question = questionOf(questionValue);
  if (question === null) return { ok: false, reason: questionProblem(questionValue) };
  if (!ASSISTANCE.includes(assistanceValue as Assistance)) return { ok: false, reason: 'the kind of help is not chosen' };
  const no = subscription.notAskable(s.retention.id);
  if (no) return { ok: false, reason: no };
  const model = subscriptionStatus.mode === 'managed' ? subscriptionStatus.model : null;
  const request: AskRequest = {
    request_id: `${sel.id}.${sel.record.requests.length + 1}`,
    question,
    assistance: assistanceValue as Assistance,
    image: { png_base64: Buffer.from(sel.image.data).toString('base64'), sha256: sel.image.sha256, width: sel.image.width, height: sel.image.height },
    context: sel.context,
  };
  const entry: AskEntry = { request_id: request.request_id, question, assistance: request.assistance, model, submitted_at: new Date().toISOString(), ended_at: null, outcome: null, shown: false };
  sel.record.requests.push(entry);
  const before = sel.unsaved;
  const unwritten = saveAsk(s, sel); // written before it is sent
  if (unwritten) {
    sel.record.requests.pop();
    sel.unsaved = before; // nothing was asked: the record is as it was, written or not
    return { ok: false, reason: `the question could not be written to this device (${unwritten}), so it was not sent` };
  }
  const mine = { id: request.request_id, state: 'asking' as 'asking' | 'cancelled' | 'done' };
  sel.request = mine;
  void subscription.ask(request).then((outcome) => askEnded(s, sel, mine, entry, outcome));
  return { ok: true, request_id: request.request_id, model };
}

/** Writes the selection's record. Null, or why it could not be written (it is then held here, and tried again). */
function saveAsk(s: Session, sel: Selection): string | null {
  try {
    writeAtomic(askFile(s.retention.id, `${sel.id}.json`), `${JSON.stringify(sel.record)}\n`);
    sel.unsaved = null;
    asksUnrecorded.delete(sel);
  } catch (error) {
    sel.unsaved = message(error);
  }
  return sel.unsaved;
}
/**
 * Selections that left their card with a record this device could not write (how a question ended, an answer that
 * was shown included): held in the app, said where the session's end is said, and written again when the session
 * ends, at the next Start and when the app closes. The question itself is never asked again for this.
 */
const asksUnrecorded = new Map<Selection, Session>();
function holdUnrecorded(s: Session, sel: Selection): void {
  asksUnrecorded.set(sel, s);
  sel.image.data = new Uint8Array(0); // only its record is held: it is never asked about again, and its picture is on this device
}
function writeUnrecordedAsks(): void {
  for (const [sel, s] of [...asksUnrecorded]) saveAsk(s, sel);
}
/** Says, where the session's end is said, how many records are still held unwritten (once, with the count as it is now). */
function sayUnrecordedAsks(): void {
  const held = [...asksUnrecorded.keys()];
  if (lastEnd === null || held.length === 0) return;
  const notice = askNotice(held.length, held.at(-1)!.unsaved);
  lastEnd = /How \d+ question\(s\) to ChatGPT ended /.test(lastEnd) ? lastEnd.replace(/How \d+ question\(s\) to ChatGPT ended .*$/, notice) : `${lastEnd.replace(/\.$/, '')}. ${notice}`;
}
const askNotice = (count: number, reason: string | null): string =>
  `How ${count} question(s) to ChatGPT ended (an answer included, if one was shown or may have been) could not be written to this device (${reason ?? 'unknown'}); the selections and their pictures are kept, without that outcome, and writing it is tried again at the next Start and when the app closes`;
/**
 * How a question ended: recorded, and said to the overlay only if it is still the current selection's live question.
 * An outcome that could not be written is held here and said as not saved (it is written again at the user's press,
 * when its card goes, and when the session ends); a question is never asked again to repair the record.
 */
function askEnded(s: Session, sel: Selection, mine: NonNullable<Selection['request']>, entry: AskEntry, outcome: AskOutcome): void {
  // Checked again here, whatever the connector checked: the session, the selection and the request are still these.
  const live = current === s && !s.ending && s.ask === sel && sel.request === mine && mine.state === 'asking';
  const view: AskOutcome = outcome.status === 'answered' && !live ? { status: 'cancelled', uncertain: true } : outcome;
  mine.state = 'done';
  entry.ended_at = new Date().toISOString();
  entry.outcome = view; // an answer's text is kept only when it is this selection's live answer; apart from the originals
  entry.shown = false; // until the overlay says it showed it
  if (view.status === 'answered') entry.presentation = 'unconfirmed';
  const unwritten = saveAsk(s, sel);
  // Said to the overlay only while this is still the selection on its card.
  if (current === s && s.ask === sel && sel.request === mine && !s.overlay.isDestroyed()) return void s.overlay.webContents.send('lc:ask-result', sel.id, mine.id, view, { saved: unwritten === null, reason: unwritten });
  if (unwritten === null || (current === s && s.ask === sel)) return;
  // Its card is gone: no window is left to say it on but the control window's, where the session's end is said.
  holdUnrecorded(s, sel);
  if (current !== null) return; // said when that session ends
  sayUnrecordedAsks();
  notifyControl();
}
/** The overlay says what it did with an answer: showed it, or (cancelled or ended meanwhile) did not. */
function askPresented(s: Session, selectionId: unknown, requestId: unknown, shown: unknown): { saved: boolean; reason: string | null } {
  const sel = s.ask;
  const entry = sel && sel.id === selectionId ? sel.record.requests.find((r) => r.request_id === requestId) : undefined;
  if (!sel || !entry || entry.shown || (entry.outcome as AskOutcome | null)?.status !== 'answered') return { saved: sel ? sel.unsaved === null : true, reason: sel?.unsaved ?? null };
  if (shown === true) Object.assign(entry, { shown: true, presentation: 'shown' });
  else notShown(entry);
  const unwritten = saveAsk(s, sel);
  return { saved: unwritten === null, reason: unwritten };
}
/** An answer the overlay itself says it did not show (or never took, its card being gone): its text is not kept. */
function notShown(entry: AskEntry): void {
  entry.outcome = { status: 'cancelled', uncertain: true };
  delete entry.presentation;
}
/** The user's press on Save: the selection's record, held here since a write failed, is written again. */
function saveAskAgain(s: Session, selectionId: unknown): { saved: boolean; reason: string | null } {
  const sel = s.ask;
  if (!sel || sel.id !== selectionId) return { saved: false, reason: 'this is no longer the current selection' };
  const unwritten = sel.unsaved === null ? null : saveAsk(s, sel);
  return { saved: unwritten === null, reason: unwritten };
}
/** A selection that leaves the card with its record still unwritten: written once more, else kept for the session's end. */
function retireSelection(s: Session, sel: Selection): void {
  if (sel.unsaved !== null && saveAsk(s, sel) !== null) holdUnrecorded(s, sel);
}

/** The card of the current selection is gone (closed, or replaced): its question out is cancelled, and it is no longer asked about. */
function dropSelection(s: Session): void {
  const sel = s.ask;
  if (!sel) return;
  cancelAsk(s, sel.id);
  // An answer the overlay never said it showed (its messages come in order) was not shown on this card: not kept.
  const unshown = sel.record.requests.filter((r) => !r.shown && (r.outcome as AskOutcome | null)?.status === 'answered');
  for (const r of unshown) notShown(r);
  if (unshown.length > 0) saveAsk(s, sel);
  retireSelection(s, sel);
  s.ask = null;
}
/** Cancels the question that is out for this selection: from now its answer is never shown. */
function cancelAsk(s: Session, selectionId: unknown): void {
  const sel = s.ask;
  if (!sel || sel.id !== selectionId || sel.request?.state !== 'asking') return;
  sel.request.state = 'cancelled';
  subscription?.cancel(sel.request.id);
}
/** The session is ending: no question of it is sent or answered from here. */
function stopAsking(s: Session): void {
  if (s.ask?.request?.state === 'asking') s.ask.request.state = 'cancelled';
  subscription?.stopSession(s.retention.id);
}

function writeAtomic(file: string, data: string | Uint8Array): void {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}
/**
 * Writes the document and the pictures it refers to that are held but not yet on disk; throws when anything
 * could not be written. A picture that is neither on disk nor held stays a gap (shown as missing), so it never
 * blocks the ink itself.
 */
function writeInk(doc: DesktopInk): void {
  mkdirSync(join(inkDir(), 'context'), { recursive: true });
  for (const sha of contextImages(doc)) {
    const bytes = heldPictures.get(sha);
    if (!bytes) continue; // on disk already, or a gap
    // An address already taken is kept only if it is exactly this picture; otherwise it is left untouched and the
    // ink is not written (it stays kept, with this picture held, for Retry or Export).
    const stored = storedOriginal(contextFile(sha), sha, bytes.length);
    if (stored.state === 'absent') writeAtomic(contextFile(sha), bytes);
    else if (stored.state !== 'same') {
      throw new NotItsBytes(`the context picture already stored as ${contextFile(sha)} is not its bytes (${stored.reason}); it is left untouched. Move it away, then Retry; or export this ink`);
    }
  }
  writeAtomic(inkFile(doc.id), JSON.stringify(doc));
}
/**
 * Context pictures sent with a save. A picture is received only if it is a PNG with the right SHA-256 that the
 * document refers to, within this save's bounds; the answer names exactly the pictures received, and those
 * refused as invalid. A valid picture beyond the bounds is neither: the overlay keeps it and sends it again.
 */
function readImages(value: unknown, doc: DesktopInk): { accepted: Map<string, Uint8Array>; invalid: string[] } {
  const wanted = new Set(contextImages(doc));
  const accepted = new Map<string, Uint8Array>();
  const invalid: string[] = [];
  let bytesTaken = 0;
  for (const item of (Array.isArray(value) ? value : []) as Array<{ sha256?: unknown; bytes?: unknown }>) {
    const bytes = item?.bytes as Uint8Array;
    const sha = typeof item?.sha256 === 'string' ? item.sha256 : '';
    const valid = Object.prototype.toString.call(bytes) === '[object Uint8Array]' && wanted.has(sha) && bytes.length <= 32 * 1024 * 1024 && PNG.every((b, i) => bytes[i] === b) && sha256(bytes) === sha;
    if (!valid) {
      if (sha) invalid.push(sha);
      continue;
    }
    if (accepted.size >= PICTURES_PER_SAVE || bytesTaken + bytes.length > PICTURE_BYTES_PER_SAVE) continue; // not received: sent again
    accepted.set(sha, bytes);
    bytesTaken += bytes.length;
  }
  return { accepted, invalid };
}

/** `pictures_received`: exactly the pictures now held or written; `pictures_invalid`: refused, never to be sent again. */
type SaveResult = ({ ok: true } | { ok: false; reason: string; conflict?: true }) & { pictures_received: string[]; pictures_invalid: string[] };

/**
 * Saves the session's document, or a copy forked from it (a new session id, forked_from the current one).
 * The pictures sent with it are received (held until written) before anything else, so the overlay sends
 * each picture once. Anything unreadable is refused. Stored ink that cannot be read, or whose history is not
 * the start of this one, is left untouched and answered as a conflict, so the overlay saves its ink as a
 * copy. Ink that cannot be written is kept for the user.
 */
function saveInk(value: unknown, imagesValue: unknown): SaveResult {
  const s = current;
  const none = { pictures_received: [], pictures_invalid: [] };
  if (!s) return { ok: false, reason: 'no session is running', ...none };
  const id = (value as { id?: unknown } | null)?.id;
  const fork = id !== s.doc.id;
  if (!isSessionId(id) || (fork && (value as { forked_from?: unknown }).forked_from !== s.doc.id)) return { ok: false, reason: 'not the ink of this session', ...none };
  const read = parseDesktopInk(value, sha256(id));
  if (!read.ok) return { ok: false, reason: `not saved: ${read.reason}`, ...none };
  s.progress += 1;
  const { accepted, invalid } = readImages(imagesValue, read.doc);
  for (const [sha, bytes] of accepted) heldPictures.set(sha, bytes);
  const receipt = { pictures_received: [...accepted.keys()], pictures_invalid: invalid };
  s.offered = read.doc;
  const allowed = continues(read.doc);
  if (!allowed.ok) {
    // A copy continues only its own stored history; the session's own ink becomes a copy on conflict.
    return fork ? { ok: false, reason: 'a different copy with that id exists already; nothing was overwritten', ...receipt } : { ok: false, conflict: true, reason: allowed.reason, ...receipt };
  }
  try {
    writeInk(read.doc);
  } catch (error) {
    const reason = error instanceof NotItsBytes ? error.message : `writing to this device failed (${message(error)})`;
    keep(read.doc, reason);
    return { ok: false, reason: `${reason}; the ink is kept in this app`, ...receipt };
  }
  s.doc = read.doc;
  resolveKept(read.doc);
  pruneHeld();
  if (control && !control.isDestroyed()) control.webContents.send('lc:ink-saved');
  return { ok: true, ...receipt };
}

/** Writes kept ink again (as a separate copy when its stored ink cannot be continued). */
export function retryRecovery(key: unknown): { ok: true; saved_as: string } | { ok: false; reason: string } {
  const r = typeof key === 'string' ? recoveries.get(key) : undefined;
  if (!r) return { ok: false, reason: 'no such kept ink' };
  let doc = r.doc;
  if (!continues(doc).ok) {
    const copyId = newSessionId();
    doc = forkDesktopInk(doc, copyId, sha256(copyId), new Date().toISOString());
  }
  try {
    writeInk(doc);
  } catch (error) {
    r.reason = error instanceof NotItsBytes ? error.message : `writing to this device failed again (${message(error)})`;
    notifyRecoveries();
    return { ok: false, reason: r.reason };
  }
  recoveries.delete(r.key);
  removeSpare(r.key);
  // The running session goes on saving what was just written only if that is what its overlay edits.
  const s = current;
  if (s && s.offered?.id === doc.id) s.doc = doc;
  pruneHeld();
  notifyRecoveries();
  if (control && !control.isDestroyed()) control.webContents.send('lc:ink-saved');
  return { ok: true, saved_as: doc.id };
}

/** Writes kept ink, with every picture it refers to that can be read, into one file the user chose. */
export function exportRecovery(key: unknown, file: string): { ok: true; missing: number } | { ok: false; reason: string } {
  const r = typeof key === 'string' ? recoveries.get(key) : undefined;
  if (!r) return { ok: false, reason: 'no such kept ink' };
  const { payload, missing } = exportPayload(r);
  try {
    writeFileSync(file, JSON.stringify(payload));
  } catch (error) {
    return { ok: false, reason: `the file could not be written (${message(error)})` };
  }
  r.exported_to = file;
  removeSpare(r.key); // the user's own export replaces the spare copy
  r.spare = false;
  notifyRecoveries();
  return { ok: true, missing };
}

/** The contexts of saved ink with their pictures (within a size budget), to look at them again. */
export function inkContexts(id: unknown): { ok: true; items: unknown[]; not_shown: number } | { ok: false; reason: string } {
  if (!isSessionId(id) || !existsSync(inkFile(id))) return { ok: false, reason: 'no such saved ink' };
  const read = readStored(id);
  if (!read.ok) return { ok: false, reason: read.reason };
  const doc = read.doc;
  const shown = new Set(doc.ink.visible);
  const roots = Object.values(doc.ink.strokes).filter((x) => x.derived_from === null).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const items: unknown[] = [];
  let budget = 32 * 1024 * 1024;
  let notShown = 0;
  roots.forEach((stroke, n) => {
    const visible = shown.has(stroke.id) ? 'visible' : doc.ink.visible.some((v) => doc.ink.strokes[v]?.derived_from === stroke.id) ? 'partly erased' : 'erased or undone';
    for (const c of doc.evidence[stroke.id]?.contexts ?? ([] as StrokeContext[])) {
      let picture: string | null = null;
      let state = c.image ? 'missing' : 'not made';
      if (c.image) {
        try {
          const stored = storedOriginal(contextFile(c.image.sha256), c.image.sha256);
          if (stored.state === 'not_a_file') state = 'not a file';
          else if (stored.state === 'other_bytes') state = 'changed on disk';
          else if (stored.state === 'same') {
            const bytes = stored.data;
            if (bytes.length > budget) {
              notShown += 1;
              state = 'not shown (too much at once)';
            } else {
              budget -= bytes.length;
              picture = `data:image/png;base64,${bytes.toString('base64')}`;
              state = 'shown';
            }
          }
        } catch {
          state = 'unreadable';
        }
      }
      items.push({ stroke: n + 1, written_at: stroke.created_at, visible, ...c, picture, picture_state: state });
    }
  });
  return { ok: true, items, not_shown: notShown };
}

/** Offers saved ink to the overlay; it answers after its own ink is saved (or refuses, keeping it). */
function openInk(id: unknown): OpenResult | Promise<OpenResult> {
  const s = current;
  if (!s || s.ending) return { ok: false, reason: 'start a session first: saved ink is shown over the display being captured' };
  if (s.opening) return { ok: false, reason: 'another saved ink is being opened' };
  if (!isSessionId(id) || !existsSync(inkFile(id))) return { ok: false, reason: 'no such saved ink' };
  if ([...recoveries.values()].some((r) => r.doc.id === id)) return { ok: false, reason: 'newer changes of this ink could not be saved; retry, export or discard them first' };
  if (id === s.doc.id) return { ok: true };
  const read = readStored(id);
  if (!read.ok) return { ok: false, reason: `it cannot be read by this version (${read.reason}); it is left untouched` };
  const doc = read.doc;
  return new Promise((resolve) => {
    s.opening = { doc, resolve };
    s.overlay.webContents.send('lc:load-doc', doc);
  });
}

// ---- IPC: only from this app's own windows -------------------------------------------------------------
const fromControl = (e: IpcMainEvent | IpcMainInvokeEvent): boolean => control !== null && !control.isDestroyed() && e.sender === control.webContents;
const fromOverlay = (e: IpcMainEvent | IpcMainInvokeEvent): boolean => current !== null && !current.overlay.isDestroyed() && e.sender === current.overlay.webContents;

ipcMain.handle('lc:list-displays', async (e) => (fromControl(e) ? listDisplays() : []));
ipcMain.handle('lc:session-state', (e) => (fromControl(e) ? sessionInfo() : null));
ipcMain.handle('lc:link-state', (e) => (fromControl(e) ? linkStatus : null));
// The managed ChatGPT subscription: its state, and the user's own presses (check, sign in, cancel, choose a model).
ipcMain.handle('lc:sub-state', (e) => (fromControl(e) ? subscriptionStatus : null));
ipcMain.on('lc:sub-check', (e) => void (fromControl(e) ? subscription?.check() : undefined));
ipcMain.on('lc:sub-login', (e) => void (fromControl(e) ? subscription?.login() : undefined));
ipcMain.on('lc:sub-login-cancel', (e) => void (fromControl(e) ? subscription?.cancelLogin() : undefined));
ipcMain.on('lc:sub-model', (e, id: unknown) => void (fromControl(e) ? subscription?.chooseModel(id) : undefined));
ipcMain.handle('lc:start', async (e, sourceId: unknown) => (fromControl(e) && typeof sourceId === 'string' ? start(sourceId) : { ok: false, reason: 'refused' }));
ipcMain.handle('lc:stop', (e) => {
  if (fromControl(e)) end('stopped by the user');
});
ipcMain.handle('lc:list-ink', (e) => (fromControl(e) ? listInk() : { sessions: [], unreadable: 0 }));
ipcMain.handle('lc:open-ink', (e, id: unknown) => (fromControl(e) ? openInk(id) : { ok: false, reason: 'refused' }));
ipcMain.handle('lc:ink-contexts', (e, id: unknown) => (fromControl(e) ? inkContexts(id) : { ok: false, reason: 'refused' }));
ipcMain.handle('lc:recoveries', (e) => (fromControl(e) ? recoveryInfo() : []));
ipcMain.handle('lc:retry-recovery', (e, id: unknown) => (fromControl(e) ? retryRecovery(id) : { ok: false, reason: 'refused' }));
ipcMain.handle('lc:export-recovery', async (e, id: unknown) => {
  const r = typeof id === 'string' ? recoveries.get(id) : undefined;
  if (!fromControl(e) || !control || !r) return { ok: false, reason: 'refused' };
  const chosen = await dialog.showSaveDialog(control, { title: 'Export the ink that could not be saved', defaultPath: `learning-companion-ink-${r.key}.json`, filters: [{ name: 'Learning Companion ink', extensions: ['json'] }] });
  return chosen.canceled || !chosen.filePath ? { ok: false, reason: 'not exported' } : exportRecovery(id, chosen.filePath);
});
ipcMain.handle('lc:discard-recovery', async (e, id: unknown) => {
  const r = typeof id === 'string' ? recoveries.get(id) : undefined;
  if (!fromControl(e) || !control || !r) return { ok: false, reason: 'refused' };
  const answer = await dialog.showMessageBox(control, {
    type: 'warning',
    buttons: ['Keep it', 'Discard'],
    defaultId: 0,
    cancelId: 0,
    message: 'Discard this ink?',
    detail: `${r.doc.ink.visible.length} stroke(s) from ${new Date(r.doc.created_at).toLocaleString()} could not be saved${r.exported_to ? ` (exported to ${r.exported_to})` : ' and were not exported'}. Discarded ink cannot be recovered.`,
  });
  if (answer.response !== 1 || recoveries.get(r.key) !== r) return { ok: false, reason: 'kept' };
  recoveries.delete(r.key);
  removeSpare(r.key);
  pruneHeld();
  notifyRecoveries();
  return { ok: true };
});
ipcMain.handle('lc:overlay-ready', (e) => {
  if (!fromOverlay(e) || !current) return null;
  return { source_id: current.sourceId, display: current.display, doc: current.doc, address_sha256: sha256(current.doc.id), retention_policy: current.retention.policy, development: linkStatus.mode === 'development', subscription: subscriptionStatus.mode === 'managed' };
});
// ASK: a selection is retained; a question about it is sent only by lc:ask-submit, the user's own press.
ipcMain.handle('lc:ask-selection', (e, facts: unknown, png: unknown, ink: unknown) => (fromOverlay(e) && current ? retainSelection(current, facts, png, ink ?? null) : { ok: false, reason: 'refused' }));
ipcMain.handle('lc:ask-submit', (e, selectionId: unknown, question: unknown, assistance: unknown) => (fromOverlay(e) && current ? submitAsk(current, selectionId, question, assistance) : { ok: false, reason: 'refused' }));
ipcMain.on('lc:ask-cancel', (e, selectionId: unknown) => void (fromOverlay(e) && current ? cancelAsk(current, selectionId) : undefined));
ipcMain.handle('lc:ask-presented', (e, selectionId: unknown, requestId: unknown, shown: unknown) => (fromOverlay(e) && current ? askPresented(current, selectionId, requestId, shown) : { saved: false, reason: 'refused' }));
ipcMain.handle('lc:ask-save', (e, selectionId: unknown) => (fromOverlay(e) && current ? saveAskAgain(current, selectionId) : { saved: false, reason: 'refused' }));
ipcMain.on('lc:ask-closed', (e) => void (fromOverlay(e) && current ? dropSelection(current) : undefined)); // the card was closed or replaced
// Retained frames keep arriving while a Stop waits for the overlay: they were observed before the end.
ipcMain.handle('lc:retain-frame', (e, facts: unknown, raw: unknown, composed: unknown, ink: unknown): RetainAnswer => (fromOverlay(e) && current ? retainFrame(current, facts, raw, composed, ink ?? null) : { ok: false, reason: 'refused' }));
ipcMain.on('lc:not-retained', (e, run: unknown) => {
  if (fromOverlay(e) && current) notRetained(current, run);
});
ipcMain.on('lc:observation-gap', (e, gap: unknown) => {
  if (fromOverlay(e) && current) observationGap(current, gap);
});
// At Stop: the retained frames still being encoded or written (with the deferred samples each stands for), so a
// forced end can say which are lost.
ipcMain.on('lc:stopping', (e, pending: unknown) => {
  if (!fromOverlay(e) || !current || !Array.isArray(pending)) return;
  const r = current.retention;
  for (const p of pending) {
    const seq = isObj(p) ? p['sample_seq'] : null;
    const deferred = isObj(p) ? p['deferred_samples_not_retained'] : null;
    if (!isSeq(seq) || r.answered.has(seq) || !Array.isArray(deferred) || !deferred.every((d) => isSeq(d) && d < seq)) continue;
    r.pending.set(seq, deferred as number[]);
  }
});
ipcMain.handle('lc:arm-capture', (e) => {
  const s = current;
  if (!fromOverlay(e) || !s || s.ending || s.capture !== 'unused') return false;
  s.capture = 'armed';
  return true;
});
ipcMain.handle('lc:save-ink', (e, doc: unknown, images: unknown) => (fromOverlay(e) ? saveInk(doc, images) : { ok: false, reason: 'refused', pictures_received: [], pictures_invalid: [] }));
ipcMain.on('lc:load-result', (e, r: unknown) => {
  const s = current;
  const res = r as { id?: unknown; ok?: unknown; reason?: unknown } | null;
  if (!fromOverlay(e) || !s?.opening || res?.id !== s.opening.doc.id) return;
  const { doc, resolve } = s.opening;
  s.opening = null;
  if (res.ok === true) s.doc = doc;
  resolve(res.ok === true ? { ok: true } : { ok: false, reason: typeof res.reason === 'string' ? res.reason.slice(0, 300) : 'the overlay kept its ink' });
});
ipcMain.on('lc:sample', (e, sample: unknown) => {
  if (!fromOverlay(e) || !current || typeof sample !== 'object' || sample === null || typeof (sample as DisplaySample).seq !== 'number') return;
  if (current.ending && (sample as DisplaySample).state !== 'ended') return; // nothing live after the end
  current.samples.push(sample as DisplaySample);
  if (current.samples.length > 300) current.samples.shift();
  if (control && !control.isDestroyed()) control.webContents.send('lc:sample', sample);
});
ipcMain.on('lc:interactive', (e, on: unknown) => {
  if (!fromOverlay(e) || !current || typeof on !== 'boolean') return;
  current.ignoring = !on;
  current.overlay.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('lc:capture-ended', (e, reason: unknown) => {
  if (fromOverlay(e)) end(typeof reason === 'string' ? reason.slice(0, 200) : 'the capture ended');
});
ipcMain.on('lc:stopped', (e, unsaved: unknown) => {
  const s = current;
  if (!fromOverlay(e) || !s) return;
  const why = lastEnd ?? 'stopped';
  const kept = keptNewest(s) ? ' It is kept in this app: retry, export or discard it below' : '';
  const reason = typeof unsaved === 'string' ? unsaved.slice(0, 300).replace(/; the ink is kept in this app$/, '') : null;
  lastEnd = reason !== null ? `${why}. The newest ink could not be saved: ${reason}.${kept}` : why;
  finish(s, why);
});

// ---- app ---------------------------------------------------------------------------------------------
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', (ev) => ev.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => writeUnrecordedEnds());
// The development capture link is stopped before the app quits (bounded; its host ended by the end of its input). One
// stop: every quit while it is pending waits too, and the app quits once it has settled or reached its bound.
let linkQuitting: Promise<void> | null = null;
let linkQuitDone = false;
app.on('will-quit', (e) => {
  if ((!link && !subscription) || linkQuitDone) return;
  e.preventDefault();
  linkQuitting ??= Promise.all([link?.quit(20_000), subscription?.quit()])
    .catch(() => undefined)
    .then(() => {
      linkQuitDone = true;
      // In a later task, never from here: with nothing to stop this runs while Electron is still delivering this
      // will-quit, when a quit is ignored (and the prevented one is then dropped, leaving the app without a window).
      setImmediate(() => app.quit());
    });
});
function notifyLink(): void {
  if (control && !control.isDestroyed()) control.webContents.send('lc:link', linkStatus);
}
function notifySubscription(): void {
  if (control && !control.isDestroyed()) control.webContents.send('lc:sub', subscriptionStatus);
}

app.whenReady().then(async () => {
  // Development only: explicitly configured, the test database only; earlier streams are reconciled (reads and
  // control only) before any Start can ask for a new one.
  const linkConfig = readLinkConfig(process.env);
  if (linkConfig && 'error' in linkConfig) linkStatus = { mode: 'unavailable', reason: linkConfig.error };
  else if (linkConfig) {
    link = new CaptureLink({
      userData: app.getPath('userData'),
      config: linkConfig,
      notify: (st) => {
        linkStatus = st;
        notifyLink();
      },
      endCapture: (id, why) => {
        if (current && current.retention.id === id) end(why);
      },
    });
    linkStatus = link.status();
    void link.reconcile();
  }
  // The managed ChatGPT subscription: explicitly configured; nothing is started or asked until the user presses.
  const connector = readConnectorConfig(process.env);
  if (connector && 'error' in connector) subscriptionStatus = { mode: 'unavailable', reason: connector.error };
  else if (connector) {
    subscription = new Subscription({
      config: connector,
      notify: (st) => {
        subscriptionStatus = st;
        notifySubscription();
      },
      openExternal: (url) => shell.openExternal(url),
    });
    subscriptionStatus = subscription.status();
  }
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const file = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (url.host !== 'bundle' || !file.startsWith(DIST + sep)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Only this app's overlay may capture, once per session, only video, only the display chosen for it.
  // Electron first asks for 'media' (with no camera or microphone types for a display capture), then
  // the display-media handler picks the source. Every other permission is refused.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const s = current;
    const media = details as Electron.MediaAccessPermissionRequest;
    const grant = permission === 'media' && s !== null && !s.ending && s.capture === 'armed' && wc === s.overlay.webContents && media.isMainFrame && (media.mediaTypes ?? []).length === 0;
    if (grant) {
      s.capture = 'granting';
      // The display-media handler moves this on at once; a grant used any other way ends the session.
      setTimeout(() => {
        if (current === s && s.capture === 'granting') end('the capture was not made through the chosen display');
      }, 3000);
    }
    callback(grant);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  // Answered exactly once. The session is checked again after the display list arrives: a Stop meanwhile
  // refuses the grant, and a failure refuses it and ends the session with the reason.
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const s = current;
    const asked = s !== null && s.capture === 'granting' && !s.ending && !s.overlay.isDestroyed() && request.frame === s.overlay.webContents.mainFrame && request.videoRequested && !request.audioRequested;
    if (s?.capture === 'granting') s.capture = 'used';
    let chosen: Electron.DesktopCapturerSource | undefined;
    let failure = 'the request was refused';
    if (asked) {
      try {
        const listing = desktopCapturer.getSources({ types: ['screen'] });
        const timeout = new Promise<never>((_ok, fail) => setTimeout(() => fail(new Error('Windows did not list the displays within 5 s')), 5000));
        chosen = (await Promise.race([listing, timeout])).find((x) => x.id === s.sourceId);
        if (!chosen) failure = 'the chosen display is no longer available';
      } catch (error) {
        failure = `the displays could not be listed (${message(error)})`;
      }
    }
    const grant = asked && chosen !== undefined && current === s && !s.ending;
    try {
      callback(grant ? { video: chosen! } : {}); // {} refuses
    } catch {
      // the overlay was closed meanwhile; nothing to grant
    }
    if (asked && !grant && current === s) end(`the display could not be captured: ${failure}`);
  });
  screen.on('display-removed', (_e, d) => {
    if (current && String(d.id) === current.display.display_id) end('the display was removed');
  });
  // Frames, overlay and ink are laid out for the geometry at Start; a changed geometry ends the session.
  screen.on('display-metrics-changed', (_e, d, changed) => {
    if (current && String(d.id) === current.display.display_id && changed.some((k) => k === 'bounds' || k === 'rotation' || k === 'scaleFactor')) end(`the display's ${changed.join(', ')} changed; start again to capture it as it is now`);
  });
  Menu.setApplicationMenu(null); // no reload, zoom, close or DevTools shortcuts in this app's windows

  control = new BrowserWindow({
    width: 460,
    height: 720,
    title: 'Learning Companion',
    show: false,
    webPreferences: secure({ preload: preload('control') }),
  });
  control.setContentProtection(true); // this app's own window stays out of the captured frames
  control.removeMenu();
  // Closing the app first ends a running session the normal way (its newest ink saved or reported).
  control.on('close', (e) => {
    if (starting && !current) end('the app was closed'); // a Start in progress is cancelled either way
    if (current) {
      e.preventDefault();
      quitting = true;
      return end('the app was closed');
    }
    if (unresolved()) {
      e.preventDefault(); // kept ink is not dropped by closing: the user retries, exports or discards it
      control?.webContents.send('lc:close-held');
    }
  });
  // Windows signing out or shutting down: keep a running session's ink and any kept ink. The end is delayed
  // while there is something to save or decide; spare copies are written in case it is forced.
  control.on('query-session-end', (e) => {
    writeUnrecordedEnds(); // what is held unwritten is tried now: Windows may end the app without its quit
    if (starting && !current) end('Windows is signing out or shutting down');
    if (!current && !unresolved()) return;
    e.preventDefault();
    if (current) {
      quitting = true; // once its ink is saved the app quits; kept ink still waits for the user
      end('Windows is signing out or shutting down');
    }
    writeSpareCopies();
    control?.show();
    control?.webContents.send('lc:close-held');
  });
  control.on('session-end', () => {
    writeUnrecordedEnds();
    writeSpareCopies();
  });
  control.on('closed', () => {
    control = null;
    app.quit();
  });
  await control.loadURL(pageUrl('control'));
  if (process.env['LC_SELFTEST']) {
    control.showInactive();
    const { runSelfTest } = await import('./self-test.ts');
    await runSelfTest({ control, listDisplays, start, end, session: () => current, listInk, openInk, lastEnd: () => lastEnd, recoveries: recoveryInfo, retryRecovery, exportRecovery, inkContexts, setRetentionPolicy, reportPath: process.env['LC_SELFTEST'] });
    app.exit(0); // the report is written; test ink lives in a temporary folder

  } else {
    control.show();
  }
});
