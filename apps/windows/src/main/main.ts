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
//   No AI is connected: nothing is sent anywhere.
// - Whole-display frames showing a material step are retained as files (userData/captures/<session>/:
//   raw and composed PNGs by file SHA-256 under frames/, one manifest.jsonl line per retained, not
//   retained, refused and ended event), within per-session caps; nothing retained is ever deleted.
// - Renderers are sandboxed with context isolation and no Node; they are served only from this app's
//   build over app://, may not navigate or open windows, and their IPC is checked by sender and shape.

import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeImage, net, protocol, screen, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contextImages, forkDesktopInk, isSessionId, newDesktopInk, parseDesktopInk, PICTURE_BYTES_PER_SAVE, PICTURES_PER_SAVE, summarize, type DesktopDisplay, type DesktopInk, type DesktopInkSummary, type StrokeContext } from '../shared/desktop-ink.ts';
import type { DisplaySample } from '../shared/samples.ts';
import { DEFAULT_RETENTION_POLICY, pngSize, RETENTION_FORMAT, type RetentionPolicy } from '../shared/retention.ts';

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
    progress: 0 };
  current = s;
  lastEnd = null;
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
    notifyControl();
    return;
  }
  const s = current;
  if (!s || s.ending) return;
  s.ending = true;
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
  lastEnd ??= reason;
  s.opening?.resolve({ ok: false, reason: 'the session ended' });
  s.opening = null;
  if (!s.overlay.isDestroyed()) s.overlay.destroy();
  if (s.retention.headerWritten || s.retention.unwritten > 0) {
    const endLine = { kind: 'ended', at: new Date().toISOString(), reason: lastEnd ?? reason };
    s.retention.endRecorded = appendRetention(s, endLine, false);
    if (!s.retention.endRecorded) endedUnrecorded.set(s.retention.id, { s, line: endLine }); // kept, shown, and written later if it can be
  }
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
  for (const sha of heldPictures.keys()) if (!wanted.has(sha) || existsSync(contextFile(sha))) heldPictures.delete(sha);
}
/** Kept ink and every picture it refers to that can be read, as one export document. */
function exportPayload(r: Recovery): { payload: unknown; missing: number } {
  const pictures: Record<string, string> = {};
  const missing: string[] = [];
  for (const sha of contextImages(r.doc)) {
    let bytes = heldPictures.get(sha) ?? null;
    try {
      bytes ??= existsSync(contextFile(sha)) ? readFileSync(contextFile(sha)) : null;
    } catch {
      bytes = null; // unreadable on this device: listed as missing
    }
    if (bytes) pictures[sha] = Buffer.from(bytes).toString('base64');
    else missing.push(sha);
  }
  return { payload: { format: 'lc-desktop-ink-export/v1', exported_at: new Date().toISOString(), not_saved_because: r.reason, ink: r.doc, context_pictures_png_base64: pictures, context_pictures_missing: missing }, missing: missing.length };
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
  if (!unresolved()) return void app.quit();
  if (control && !control.isDestroyed()) {
    control.webContents.send('lc:close-held');
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
}
function notifyRetention(s: Session): void {
  const r = s.retention;
  const ended = current !== s;
  if (control && !control.isDestroyed()) {
    control.webContents.send('lc:retention', { frames: r.frames, bytes: r.bytes, not_retained: r.notRetained, refused: r.refused, unwritten: r.unwritten, unfinished: r.unfinished, ended, end_recorded: r.endRecorded, place: retentionPlace(r.id) });
  }
}
type Picture = { sha256: string; bytes: number; width: number; height: number; isNew: boolean; data: Uint8Array };
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
  return { sha256: sha, bytes: data.length, width, height, isNew: !existsSync(frameFile(id, sha)), data };
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
 * The ink document a composition was drawn from, as the exact bytes the overlay took with it: read back with the ink
 * parser and matched to the composition's session, revision and visible strokes. What cannot be retained is said
 * (the frame itself is still retained); a later document is never put in its place.
 */
function readInkOriginal(value: unknown, c: Record<string, unknown>, id: string): { sha256: string; bytes: number; isNew: boolean; data: Uint8Array } | { refused: string } {
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
  return { sha256: sha, bytes: data.length, isNew: !existsSync(inkOriginalFile(id, sha)), data };
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
  const ink = composed === null ? null : readInkOriginal(inkValue, f.composed!, r.id);
  const inkData = ink && 'data' in ink ? ink : null;
  const adding = (raw.isNew ? raw.bytes : 0) + (composed?.isNew && composed.sha256 !== raw.sha256 ? composed.bytes : 0) + (inkData?.isNew ? inkData.bytes : 0);
  if (r.frames + 1 > r.policy.max_frames) return refuse(`the retention limit of ${r.policy.max_frames} frames for this session is reached`, { limit: true });
  if (r.bytes + adding > r.policy.max_bytes) return refuse(`the retention limit of ${r.policy.max_bytes} bytes for this session is reached`, { limit: true });
  try {
    mkdirSync(join(captureDir(r.id), 'frames'), { recursive: true });
    for (const p of [raw, composed]) {
      if (!p || existsSync(frameFile(r.id, p.sha256))) continue;
      writeAtomic(frameFile(r.id, p.sha256), p.data);
      r.bytes += p.bytes; // counted as written, listed or not
    }
    if (inkData && !existsSync(inkOriginalFile(r.id, inkData.sha256))) {
      mkdirSync(join(captureDir(r.id), 'ink'), { recursive: true });
      writeAtomic(inkOriginalFile(r.id, inkData.sha256), inkData.data);
      r.bytes += inkData.bytes;
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
    if (bytes && !existsSync(contextFile(sha))) writeAtomic(contextFile(sha), bytes);
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
    const reason = `writing to this device failed (${message(error)})`;
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
    r.reason = `writing to this device failed again (${message(error)})`;
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
      if (c.image && existsSync(contextFile(c.image.sha256))) {
        try {
          const bytes = readFileSync(contextFile(c.image.sha256));
          if (bytes.length > budget) {
            notShown += 1;
            state = 'not shown (too much at once)';
          } else if (sha256(bytes) === c.image.sha256) {
            budget -= bytes.length;
            picture = `data:image/png;base64,${bytes.toString('base64')}`;
            state = 'shown';
          } else {
            state = 'changed on disk';
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
  return { source_id: current.sourceId, display: current.display, doc: current.doc, address_sha256: sha256(current.doc.id), retention_policy: current.retention.policy };
});
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

app.whenReady().then(async () => {
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
  control.on('session-end', () => writeSpareCopies());
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
