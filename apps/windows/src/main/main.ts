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
// - Renderers are sandboxed with context isolation and no Node; they are served only from this app's
//   build over app://, may not navigate or open windows, and their IPC is checked by sender and shape.

import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, net, protocol, screen, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contextImages, forkDesktopInk, isSessionId, newDesktopInk, parseDesktopInk, summarize, type DesktopDisplay, type DesktopInk, type DesktopInkSummary, type StrokeContext } from '../shared/desktop-ink.ts';
import type { DisplaySample } from '../shared/samples.ts';

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
};

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
  const s: Session = { sourceId, display, overlay, doc: newDesktopInk(id, sha256(id), new Date().toISOString(), display), ignoring: true, samples: [], ending: false, capture: 'unused', opening: null, offered: null, shown: false };
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
    lastEnd = `${lastEnd ?? `the overlay stopped working (${d.reason})`}. The overlay stopped working (${d.reason}) before confirming that its newest ink was saved${kept}`;
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
  setTimeout(() => {
    if (current !== s) return; // the overlay answered, or the display went away
    const kept = keptNewest(s) ? ' (the newest ink it sent is kept below)' : '';
    lastEnd = `${reason}. The overlay did not confirm that its newest ink was saved${kept}`;
    const wasQuitting = quitting;
    quitting = false; // an unconfirmed save is not closed away silently: the window stays, saying so
    finish(s, reason);
    if (wasQuitting && control && !control.isDestroyed()) control.show();
  }, 10000); // the bound; the overlay answers sooner
}
/** Closes session `s` if it is still the current one (a later session is never touched). */
function finish(s: Session, reason: string): void {
  if (current !== s) return;
  current = null;
  lastEnd ??= reason;
  s.opening?.resolve({ ok: false, reason: 'the session ended' });
  s.opening = null;
  if (!s.overlay.isDestroyed()) s.overlay.destroy();
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
/** Context pictures sent with a save: each kept only if it is a PNG with the right SHA-256 that the document refers to. */
function readImages(value: unknown, doc: DesktopInk): { accepted: Map<string, Uint8Array>; refused: number } {
  const wanted = new Set(contextImages(doc));
  const accepted = new Map<string, Uint8Array>();
  let refused = 0;
  for (const item of (Array.isArray(value) ? value : []) as Array<{ sha256?: unknown; bytes?: unknown }>) {
    const bytes = item?.bytes as Uint8Array;
    const ok = Object.prototype.toString.call(bytes) === '[object Uint8Array]' && typeof item.sha256 === 'string' && wanted.has(item.sha256) && bytes.length <= 32 * 1024 * 1024 && PNG.every((b, i) => bytes[i] === b) && sha256(bytes) === item.sha256;
    if (ok && accepted.size < 256) accepted.set(item.sha256 as string, bytes);
    else refused += 1;
  }
  return { accepted, refused };
}

type SaveResult = { ok: true; received: true } | { ok: false; reason: string; conflict?: true; received: boolean };

/**
 * Saves the session's document, or a copy forked from it (a new session id, forked_from the current one).
 * The pictures sent with it are received (held until written) before anything else, so the overlay sends
 * each picture once. Anything unreadable is refused. Stored ink that cannot be read, or whose history is not
 * the start of this one, is left untouched and answered as a conflict, so the overlay saves its ink as a
 * copy. Ink that cannot be written is kept for the user.
 */
function saveInk(value: unknown, imagesValue: unknown): SaveResult {
  const s = current;
  if (!s) return { ok: false, reason: 'no session is running', received: false };
  const id = (value as { id?: unknown } | null)?.id;
  const fork = id !== s.doc.id;
  if (!isSessionId(id) || (fork && (value as { forked_from?: unknown }).forked_from !== s.doc.id)) return { ok: false, reason: 'not the ink of this session', received: false };
  const read = parseDesktopInk(value, sha256(id));
  if (!read.ok) return { ok: false, reason: `not saved: ${read.reason}`, received: false };
  const { accepted } = readImages(imagesValue, read.doc);
  for (const [sha, bytes] of accepted) heldPictures.set(sha, bytes);
  s.offered = read.doc;
  const allowed = continues(read.doc);
  if (!allowed.ok) {
    // A copy continues only its own stored history; the session's own ink becomes a copy on conflict.
    return fork ? { ok: false, reason: 'a different copy with that id exists already; nothing was overwritten', received: true } : { ok: false, conflict: true, reason: allowed.reason, received: true };
  }
  try {
    writeInk(read.doc);
  } catch (error) {
    const reason = `writing to this device failed (${message(error)})`;
    keep(read.doc, reason);
    return { ok: false, reason: `${reason}; the ink is kept in this app`, received: true };
  }
  s.doc = read.doc;
  resolveKept(read.doc);
  pruneHeld();
  if (control && !control.isDestroyed()) control.webContents.send('lc:ink-saved');
  return { ok: true, received: true };
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
  return { source_id: current.sourceId, display: current.display, doc: current.doc, address_sha256: sha256(current.doc.id) };
});
ipcMain.handle('lc:arm-capture', (e) => {
  const s = current;
  if (!fromOverlay(e) || !s || s.ending || s.capture !== 'unused') return false;
  s.capture = 'armed';
  return true;
});
ipcMain.handle('lc:save-ink', (e, doc: unknown, images: unknown) => (fromOverlay(e) ? saveInk(doc, images) : { ok: false, reason: 'refused' }));
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
    await runSelfTest({ control, listDisplays, start, end, session: () => current, listInk, openInk, lastEnd: () => lastEnd, recoveries: recoveryInfo, retryRecovery, exportRecovery, inkContexts, reportPath: process.env['LC_SELFTEST'] });
    app.exit(0); // the report is written; test ink lives in a temporary folder

  } else {
    control.show();
  }
});
