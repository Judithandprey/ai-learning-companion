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
//   atomically, validated first). Stored ink that cannot be continued is never overwritten: the overlay
//   saves its ink as a separate copy instead. No AI is connected: nothing is sent anywhere.
// - Renderers are sandboxed with context isolation and no Node; they are served only from this app's
//   build over app://, may not navigate or open windows, and their IPC is checked by sender and shape.

import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, net, protocol, screen, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isSessionId, newDesktopInk, parseDesktopInk, summarize, type DesktopDisplay, type DesktopInk, type DesktopInkSummary } from '../shared/desktop-ink.ts';
import type { DisplaySample } from '../shared/samples.ts';

const HERE = dirname(fileURLToPath(import.meta.url)); // dist/apps/windows/src/main
const DIST = normalize(join(HERE, '..', '..', '..', '..')); // dist/
const pageUrl = (name: string): string => `app://bundle/apps/windows/src/renderer/${name}.html`;
const preload = (name: string): string => join(HERE, '..', 'preload', `${name}.cjs`);
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
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
};

let control: BrowserWindow | null = null;
let current: Session | null = null;
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
  if (current) return { ok: false, reason: 'a session is running; stop it first' };
  if (exclusionUnsupported()) return { ok: false, reason: `this Windows version (${release()}) cannot leave the overlay out of the capture; Windows 10 version 2004 or later is needed` };
  const choice = (await listDisplays()).find((d) => d.source_id === sourceId);
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
  const s: Session = { sourceId, display, overlay, doc: newDesktopInk(id, sha256(id), new Date().toISOString(), display), ignoring: true, samples: [], ending: false, capture: 'unused', opening: null };
  current = s;
  lastEnd = null;
  // Closing the overlay ends the session the normal way, so its newest ink is saved or reported.
  overlay.on('close', (e) => {
    if (current !== s) return;
    e.preventDefault();
    end('the overlay window was closed');
  });
  overlay.on('closed', () => finish(s, 'the overlay window was closed'));
  overlay.webContents.on('render-process-gone', (_e, d) => {
    if (current !== s) return;
    lastEnd = `${lastEnd ?? `the overlay stopped working (${d.reason})`}. The overlay stopped working (${d.reason}) before confirming that its newest ink was saved`;
    finish(s, lastEnd);
  });
  overlay.webContents.on('unresponsive', () => end('the overlay stopped responding'));
  await overlay.loadURL(pageUrl('overlay'));
  overlay.showInactive();
  overlay.setBounds(choice.bounds); // Windows fits a new window to the work area; cover the taskbar too
  notifyControl();
  return { ok: true };
}

/** Ends the session: the overlay stops its capture, saves, then closes. Live claims end at once. */
export function end(reason: string): void {
  const s = current;
  if (!s || s.ending) return;
  s.ending = true;
  lastEnd = reason;
  notifyControl();
  if (s.overlay.isDestroyed()) return finish(s, reason);
  s.overlay.webContents.send('lc:stop', reason);
  setTimeout(() => {
    if (current !== s) return; // the overlay answered, or the display went away
    lastEnd = `${reason}. The overlay did not confirm that its newest ink was saved`;
    finish(s, reason);
  }, 5000); // the bound; the overlay answers sooner
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
  if (quitting) app.quit();
}

const sessionInfo = (): unknown => (current ? { running: true, ending: current.ending, display: current.display, session_id: String(current.overlay.id) } : { running: false, ended: lastEnd });
function notifyControl(): void {
  if (!control || control.isDestroyed()) return;
  control.webContents.send('lc:session', sessionInfo());
}

// ---- ink storage ------------------------------------------------------------------------------------
const inkDir = (): string => join(app.getPath('userData'), 'ink');
const inkFile = (id: string): string => join(inkDir(), `${id}.json`);

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

type SaveResult = { ok: true } | { ok: false; reason: string; conflict?: true };

/**
 * Saves the session's document, or a copy forked from it (a new session id, forked_from the current one,
 * never over an existing file). Anything unreadable is refused. Stored ink that cannot be read, or whose
 * history is not the start of this one, is left untouched and answered as a conflict, so the overlay
 * saves its ink as a copy.
 */
function saveInk(value: unknown): SaveResult {
  const s = current;
  if (!s) return { ok: false, reason: 'no session is running' };
  const id = (value as { id?: unknown } | null)?.id;
  const fork = id !== s.doc.id;
  if (!isSessionId(id) || (fork && (value as { forked_from?: unknown }).forked_from !== s.doc.id)) return { ok: false, reason: 'not the ink of this session' };
  const read = parseDesktopInk(value, sha256(id));
  if (!read.ok) return { ok: false, reason: `not saved: ${read.reason}` };
  const file = inkFile(id);
  if (fork && existsSync(file)) return { ok: false, reason: 'a copy with that id exists already; nothing was overwritten' };
  if (!fork && existsSync(file)) {
    let stored: ReturnType<typeof parseDesktopInk> | null = null;
    try {
      stored = parseDesktopInk(JSON.parse(readFileSync(file, 'utf8')), sha256(id));
    } catch {
      stored = null;
    }
    if (!stored?.ok) return { ok: false, conflict: true, reason: 'the ink stored for this session cannot be read by this version, so it was left untouched' };
    const kept = stored.doc.ink.history.every((op, i) => JSON.stringify(op) === JSON.stringify(read.doc.ink.history[i]));
    if (!kept) return { ok: false, conflict: true, reason: 'the stored history is not the start of this one, so it was left untouched' };
  }
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(inkDir(), { recursive: true });
    writeFileSync(tmp, JSON.stringify(read.doc));
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    return { ok: false, reason: `writing to this device failed (${error instanceof Error ? error.message : String(error)})` };
  }
  s.doc = read.doc;
  if (control && !control.isDestroyed()) control.webContents.send('lc:ink-saved');
  return { ok: true };
}

/** Offers saved ink to the overlay; it answers after its own ink is saved (or refuses, keeping it). */
function openInk(id: unknown): OpenResult | Promise<OpenResult> {
  const s = current;
  if (!s || s.ending) return { ok: false, reason: 'start a session first: saved ink is shown over the display being captured' };
  if (s.opening) return { ok: false, reason: 'another saved ink is being opened' };
  if (!isSessionId(id) || !existsSync(inkFile(id))) return { ok: false, reason: 'no such saved ink' };
  if (id === s.doc.id) return { ok: true };
  let read: ReturnType<typeof parseDesktopInk>;
  try {
    read = parseDesktopInk(JSON.parse(readFileSync(inkFile(id), 'utf8')), sha256(id));
  } catch (error) {
    return { ok: false, reason: `it cannot be read (${error instanceof Error ? error.message : String(error)})` };
  }
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
ipcMain.handle('lc:save-ink', (e, doc: unknown) => (fromOverlay(e) ? saveInk(doc) : { ok: false, reason: 'refused' }));
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
  lastEnd = typeof unsaved === 'string' ? `${why}. The newest ink could not be saved: ${unsaved.slice(0, 300)}` : why;
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
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const s = current;
    const asked = s !== null && s.capture === 'granting' && !s.ending && !s.overlay.isDestroyed() && request.frame === s.overlay.webContents.mainFrame && request.videoRequested && !request.audioRequested;
    if (s?.capture === 'granting') s.capture = 'used';
    const chosen = asked ? (await desktopCapturer.getSources({ types: ['screen'] })).find((x) => x.id === s.sourceId) : undefined;
    try {
      callback(chosen && current === s ? { video: chosen } : {}); // {} refuses
    } catch {
      // the overlay was closed meanwhile; nothing to grant
    }
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
    if (!current) return;
    e.preventDefault();
    quitting = true;
    end('the app was closed');
  });
  control.on('closed', () => {
    control = null;
    app.quit();
  });
  await control.loadURL(pageUrl('control'));
  if (process.env['LC_SELFTEST']) {
    control.showInactive();
    const { runSelfTest } = await import('./self-test.ts');
    await runSelfTest({ control, listDisplays, start, end, session: () => current, listInk, openInk, lastEnd: () => lastEnd, reportPath: process.env['LC_SELFTEST'] });
    app.quit();
  } else {
    control.show();
  }
});
