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
// - An AI observes the chosen display only when the managed ChatGPT subscription is explicitly configured
//   (LC_SUBSCRIPTION_CONNECTOR, subscription.ts), the user is signed in, and the user's own Start says so (the control
//   window names it, with the session's bounds: requests and time). Then whole pictures of that display, with the
//   user's ink, are given to ChatGPT through the official Codex app server as the screen changes (never every frame,
//   never more than the session's bounds), and a circle in ASK asks for a small hint about that part with the whole
//   display as its context. The session is never renewed by this app; a failure ends it until the user starts it
//   again. What was sent and how it ended is kept under the session's capture folder (asks/, live.jsonl).
// - Whole-display frames showing a material step are retained as files (userData/captures/<session>/:
//   raw and composed PNGs by file SHA-256 under frames/, one manifest.jsonl line per retained, not
//   retained, refused and ended event), within per-session caps; nothing retained is ever deleted.
// - A test's source check (LC_SOURCE_ADMISSION, source-admission.ts; off in the product): when configured, the capture
//   is armed, each frame is taken from the stream, and each request is sent to ChatGPT only after a fresh decision of
//   the test's checker; a frame is used only if its own taking was admitted; anything but "allow" ends the capture.
// - Renderers are sandboxed with context isolation and no Node; they are served only from this app's
//   build over app://, may not navigate or open windows, and their IPC is checked by sender and shape.

import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeImage, net, protocol, screen, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contextImages, forkDesktopInk, isSessionId, newDesktopInk, parseDesktopInk, PICTURE_BYTES_PER_SAVE, PICTURES_PER_SAVE, summarize, type DesktopDisplay, type DesktopInk, type DesktopInkSummary, type StrokeContext } from '../shared/desktop-ink.ts';
import type { DisplaySample } from '../shared/samples.ts';
import { ASSISTANCE, boundedHistory, carryFocus, DEFAULT_POLICY, focusOf, GAPS_MAX, isPolicy, PNG_MAX_BYTES, provenanceOf, reserveOf, suspends, turnProblem, userTextOf, userTextProblem, wholeRegions, type Assistance, type Focus, type Gap, type HistoryEntry, type LiveContext, type Policy, type Provenance, type Trigger, type Turn } from '../shared/live.ts';
import { DEFAULT_RETENTION_POLICY, pngSize, RETENTION_FORMAT, type RetentionPolicy } from '../shared/retention.ts';
import { CaptureLink, readLinkConfig, type LinkStatus } from './capture-link.ts';
import { earlierNotes, readConnectorConfig, Subscription, type ConnectorEnd, type SubscriptionStatus, type TurnOutcome } from './subscription.ts';
import { clampRate, isPlace, isSurface, NO_PREFERENCES, placesOf, readPreferences, storedPreferences, withPlace, type Preferences, type Rect } from '../shared/placement.ts';
import { speechCultures, speechPieces, type Culture } from '../shared/voice.ts';
import { bundledSystemVoice } from './native-speech.ts';
import { readAdmissionConfig, SourceChecker, type AdmissionAsk, type AdmissionConfig } from './source-admission.ts';

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
  /** One capture per session: armed by the overlay just before it asks (after the test's source check, when one is configured), then granted once. */
  capture: 'unused' | 'arming' | 'armed' | 'granting' | 'used';
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
  /** What the user set in the overlay: responses are read aloud (off at every Start), and whether that is muted. */
  talk: { on: boolean; muted: boolean };
  /** The response being read aloud, or null. */
  reading: Reading | null;
  /** The AI session of this capture (started by the user's Start; never renewed by this app), or null. */
  live: Live | null;
  /** A Start of the AI session is out. */
  liveStarting: boolean;
  /** Why this capture has no AI session, as it is said in the windows; null when one is running or was never asked for. */
  liveOff: string | null;
  /** Of live.jsonl (it spans every AI session of the capture): the bytes known to hold whole lines, and the lines that could not be written. */
  liveBytes: number;
  liveUnwritten: number;
  /** The test's source check of this capture (null in the product: none is configured). */
  admission: Admission | null;
};
/**
 * The test's source check of one capture. A frame is used (published in the overlay, kept, looked at, circled, asked
 * about) only if its own taking from the stream was admitted before and after; every request is admitted again just
 * before it is sent. The first violation is latched and ends the whole capture.
 */
type Admission = {
  readonly checker: SourceChecker;
  /** The one-use ticket of the frame being taken now: issued when its taking was admitted, consumed by its second check. */
  ticket: { sample_seq: number; ticket: string } | null;
  /** Frames whose taking was admitted (by the overlay's frame seq; the newest ADMITTED_MAX), with their pixels' hash and size. */
  readonly admitted: Map<number, FrameSource>;
  /** Why the check stopped this capture, or null. */
  violation: string | null;
  /** This capture's overlay window as main told the checker at arm (its process and native handle), or null before. */
  overlay: { readonly pid: number; readonly hwnd: string } | null;
  /** The checker admitted the arming of this capture. */
  armed: boolean;
  /** Lines of admission.jsonl written, and its bytes known to hold whole lines (a torn tail is cut back first). */
  recorded: number;
  recordBytes: number;
};
const ADMITTED_MAX = 64;
/**
 * Where a frame came from, with the test's source check on: its own admitted taking from the stream of this capture.
 * `frame_seq` is the overlay's number of that frame (the sample it was taken in, `sample_seq`), never the number an
 * AI session gives the frames it is sent (LiveContext.frame_seq).
 */
type FrameSource = { readonly capture_id: string; readonly sample_seq: number; readonly frame_seq: number; readonly raw_sha256: string; readonly width: number; readonly height: number };
type Retention = {
  /** Why no further whole-display frame of this capture is kept (its cap is reached), or null. */
  closed: string | null;
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
/** The close of the control window is waiting for the connector to end; and an unwritten end note was said at a close. */
let endingConnector: Promise<void> | null = null;
let endNoteSaid = false;
let subscriptionStatus: SubscriptionStatus = { mode: 'off' };
/** The test's source check (LC_SOURCE_ADMISSION): off (null), its configuration, or why it cannot be used (then no Start). */
let admissionSetting: AdmissionConfig | { error: string } | null = null;
/** Checkers not yet ended (the app waits for their end when it quits). */
const openCheckers = new Set<SourceChecker>();

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

/** `ai`: the user's Start also starts the AI's observation of that display, within these bounds (null: capture only). */
export async function start(sourceId: string, ai: { policy: Policy } | null = null): Promise<{ ok: true } | { ok: false; reason: string }> {
  writeUnrecordedEnds();
  if (current || starting) return { ok: false, reason: current ? 'a session is running; stop it first' : 'a session is starting' };
  // A test's source check that is configured and cannot be used refuses the capture: there is no capture without it.
  if (admissionSetting && 'error' in admissionSetting) return { ok: false, reason: `${admissionSetting.error}, so nothing is captured` };
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
    retention: { closed: null, id, startedAt: new Date().toISOString(), policy: retentionPolicy, frames: 0, bytes: 0, notRetained: 0, refused: 0, unwritten: 0, headerWritten: false, validBytes: 0, pending: new Map(), answered: new Set(), unfinished: null, endRecorded: false },
    progress: 0, ask: null, talk: { on: false, muted: false }, reading: null, live: null, liveStarting: false, liveOff: null, liveBytes: 0, liveUnwritten: 0,
    admission: admissionSetting && !('error' in admissionSetting) ? { checker: tracked(new SourceChecker({ config: admissionSetting })), ticket: null, admitted: new Map(), violation: null, overlay: null, armed: false, recorded: 0, recordBytes: 0 } : null };
  current = s;
  lastEnd = null;
  lastEnded = null;
  if (s.admission) s.admission.checker.onFailure = (why) => violate(s, why); // (its own end, or an answer out of turn, ends the capture at once)
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
  if (ai) void startLive(s, ai.policy); // said in the windows as it starts, runs and ends
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
  stopAsking(s, 'the capture was stopped'); // and nothing of this session is sent or answered from here
  hush(s); // nor is anything more of a response read aloud
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
  lastEnded = s;
  link?.stopSending(s.retention.id); // however the session ended
  stopAsking(s, 'the capture ended');
  hush(s);
  if (!s.live) releaseVoice(); // no AI session owned a child to release on its own end
  lastEnd ??= reason;
  // Records of questions that could not be written are written now; what still cannot be is said, not dropped silently.
  if (s.ask) retireSelection(s, s.ask);
  writeUnrecordedAsks();
  s.opening?.resolve({ ok: false, reason: 'the session ended' });
  s.opening = null;
  // The checker ends with its capture: how its end went is recorded (an end that was not seen is said as that).
  // (a capture stopped before it was armed has no checker, and no record is made for it)
  if (s.admission) void s.admission.checker.close().then((x) => (x.spawned || s.admission!.recorded > 0 ? recordAdmission(s, { kind: 'checker_end', spawned: x.spawned, exit_seen: x.exit_seen, code: x.code, signal: x.signal, killed: x.killed }) : undefined));
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
    ? { running: true, starting: !current.shown, ending: current.ending, display: current.display, session_id: String(current.overlay.id), live: liveInfo(current), ...sourceAdmissionInfo(current) }
    : { running: false, starting: starting !== null, ended: lastEnd, live_unwritten: lastEnded?.liveUnwritten ?? 0 };
/**
 * With a test's source check configured only: which capture it binds and its overlay window (as told to the checker
 * at arm), and whether that capture is checked now (armed, not ending, no violation). Read-only facts for the
 * test's runner; nothing here can be set from a window.
 */
function sourceAdmissionInfo(s: Session): { source_admission?: unknown } {
  const a = s.admission;
  if (!a) return {};
  return { source_admission: { capture_id: s.retention.id, overlay: a.overlay, active: current === s && !s.ending && a.armed && a.violation === null } };
}
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

// ---- the test's source check (off in the product) -----------------------------------------------------------------
/** A window's native handle as a positive decimal number (an HWND on Windows), or '' when it has none. */
function windowHandle(w: BrowserWindow): string {
  if (w.isDestroyed()) return '';
  const b = w.getNativeWindowHandle();
  const n = b.length >= 8 ? b.readBigUInt64LE(0) : b.length >= 4 ? BigInt(b.readUInt32LE(0)) : 0n;
  return n > 0n ? n.toString() : '';
}
/** A checker counted among those the app waits for when it quits, until its own end. */
function tracked(c: SourceChecker): SourceChecker {
  openCheckers.add(c);
  const close = c.close.bind(c);
  c.close = () => close().finally(() => openCheckers.delete(c));
  return c;
}
const admissionFile = (id: string): string => join(captureDir(id), 'admission.jsonl');
/** One line of what the test's checker was asked and decided, or of a violation (no pixels). False when it could not be written. */
function recordAdmission(s: Session, line: Record<string, unknown>): boolean {
  const a = s.admission!;
  const file = admissionFile(s.retention.id);
  try {
    mkdirSync(captureDir(s.retention.id), { recursive: true });
    const size = existsSync(file) ? statSync(file).size : 0;
    if (size > a.recordBytes) truncateSync(file, a.recordBytes); // a torn line: only whole lines are kept
    const text = `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`;
    appendFileSync(file, text);
    a.recordBytes = Math.min(size, a.recordBytes) + Buffer.byteLength(text);
    a.recorded += 1;
    return true;
  } catch {
    return false;
  }
}
const askOf = (phase: AdmissionAsk['phase'], o: Partial<Omit<AdmissionAsk, 'phase' | 'capture_id'>>): Omit<AdmissionAsk, 'capture_id'> =>
  ({ phase, display: null, overlay: null, sample_seq: null, frame_seq: null, raw_sha256: null, raw_size: null, request_id: null, image_sha256: null, ...o });
/**
 * Asks the test's checker about this capture. Never while the capture is ending (refused here: `local`, not a
 * violation), and never after a violation. The decision is recorded; one that cannot be recorded is not allowed.
 */
async function admit(s: Session, ask: Omit<AdmissionAsk, 'capture_id'>, still: () => boolean = () => true, more: Record<string, unknown> = {}): Promise<{ ok: true } | { ok: false; reason: string; local: boolean }> {
  const a = s.admission!;
  const holds = (): boolean => current === s && !s.ending && a.violation === null && still();
  if (!holds()) return { ok: false, reason: a.violation ?? 'what it was for no longer holds', local: true };
  // (asked only if this still holds when its turn comes; `more`: what main records with it, never sent)
  const d = await a.checker.decide({ ...ask, capture_id: s.retention.id }, holds);
  if (!d.ok && d.withdrawn) return { ok: false, reason: d.reason, local: true };
  // (refused here without being asked, after a failure of the check: that failure is what is recorded, not a decision)
  if (!d.ok && !d.written) return { ok: false, reason: d.reason, local: false };
  const written = recordAdmission(s, { kind: 'decision', phase: ask.phase, sample_seq: ask.sample_seq, frame_seq: ask.frame_seq, raw_sha256: ask.raw_sha256, raw_size: ask.raw_size, request_id: ask.request_id, image_sha256: ask.image_sha256, ...more, allowed: d.ok, denied: !d.ok && d.denied, reason: d.ok ? null : d.reason, ms: d.ms });
  if (!d.ok) return { ok: false, reason: d.reason, local: false };
  return written ? { ok: true } : { ok: false, reason: 'a decision of the source check could not be recorded on this device', local: false };
}
/** The test's source check refused or could not decide: latched and recorded, and the whole capture is ended (what it kept stays). */
function violate(s: Session, reason: string): void {
  const a = s.admission;
  if (!a) return;
  if (a.violation === null) {
    a.violation = reason;
    a.ticket = null;
    recordAdmission(s, { kind: 'violation', reason });
  }
  if (current === s && !s.ending) end(`the test's source check ended the capture: ${a.violation}`);
}
/**
 * With the test's source check on, the overlay takes a frame from the stream only between two admissions: 'pre' just
 * before (a one-use ticket for that sample), 'post' just after, with that ticket and the frame's own pixel hash and
 * size. Only then is the frame the overlay's to show, keep or send. After each wait the capture is checked again: a
 * Stop meanwhile admits nothing.
 */
async function admitFrame(s: Session, phase: unknown, sampleSeq: unknown, factsValue: unknown): Promise<{ ok: true; ticket?: string } | { ok: false }> {
  const a = s.admission;
  if (!a || s.ending || a.violation !== null) return { ok: false };
  if ((phase !== 'pre' && phase !== 'post') || !isSeq(sampleSeq)) {
    violate(s, 'the overlay asked for an admission that is malformed');
    return { ok: false };
  }
  if (phase === 'pre') {
    a.ticket = null; // (an earlier ticket is void)
    const d = await admit(s, askOf('pre_acquire', { sample_seq: sampleSeq }));
    if (current !== s || s.ending) return { ok: false };
    if (!d.ok) {
      if (!d.local) violate(s, d.reason);
      return { ok: false };
    }
    const ticket = randomBytes(16).toString('hex');
    a.ticket = { sample_seq: sampleSeq, ticket };
    return { ok: true, ticket };
  }
  const t = a.ticket;
  a.ticket = null; // one use, whatever comes of it
  const f = factsValue;
  const most = (dip: number): number => Math.ceil(dip * s.display.scale_factor) + 16;
  if (!t || t.sample_seq !== sampleSeq || !isObj(f) || f['ticket'] !== t.ticket || !isHex(f['raw_sha256'], 64) || !isSeq(f['width']) || !isSeq(f['height']) || f['width'] > most(s.display.bounds.width) || f['height'] > most(s.display.bounds.height)) {
    violate(s, 'a frame was presented as taken without the ticket of its own admission, or with facts that are not its own');
    return { ok: false };
  }
  // (the frame's own number in the overlay is the sample it was taken in)
  const taken: FrameSource = { capture_id: s.retention.id, sample_seq: sampleSeq, frame_seq: sampleSeq, raw_sha256: f['raw_sha256'], width: f['width'], height: f['height'] };
  const d = await admit(s, askOf('post_acquire', { sample_seq: sampleSeq, frame_seq: sampleSeq, raw_sha256: taken.raw_sha256, raw_size: { width: taken.width, height: taken.height } }));
  if (current !== s || s.ending) return { ok: false };
  if (!d.ok) {
    if (!d.local) violate(s, d.reason);
    return { ok: false };
  }
  a.admitted.set(sampleSeq, taken);
  for (const k of a.admitted.keys()) if (a.admitted.size > ADMITTED_MAX) a.admitted.delete(k);
  return { ok: true };
}
/**
 * With the test's source check on: the admitted taking a frame was made from (its frame seq, its pixels' hash and its
 * size as the overlay presents them), or a violation (null). With none configured, no source is needed ('none').
 */
function sourceOf(s: Session, frameSeq: unknown, rawSha: unknown, width: unknown, height: unknown): FrameSource | 'none' | null {
  const a = s.admission;
  if (!a) return 'none';
  const got = isSeq(frameSeq) ? a.admitted.get(frameSeq) : undefined;
  if (got && got.raw_sha256 === rawSha && got.width === width && got.height === height) return got;
  violate(s, `frame ${isSeq(frameSeq) ? frameSeq : '(none)'} was to be used without an admitted taking of its own, or its pixels are not the admitted ones`);
  return null;
}
/**
 * With the test's source check on, just before a request is sent: its frame must come from an admitted taking of this
 * capture, and the source is admitted again now. After that wait the capture, the AI session and the request are
 * checked again: a Stop, an end or a cancel meanwhile sends nothing. Null: send it; else how it ended, not sent.
 */
async function sendAdmitted(s: Session, live: Live, t: Turn, frame: Frame, wanted: () => boolean): Promise<TurnOutcome | null> {
  const refused = (reason: string): TurnOutcome => ({ status: 'refused', code: 'source_not_admitted', reason, submission: 'not_submitted' });
  const src = frame.source;
  if (!src || src.capture_id !== s.retention.id) {
    violate(s, `request ${t.request_id} carried a frame without an admitted taking of this capture`);
    return refused('its picture was not admitted by the test\'s source check, so it was not sent');
  }
  const going = (): boolean => s.live === live && live.ended === null && wanted();
  // (main also records the AI session's own number of the frame, and its ink, to relate the two; neither is sent)
  const d = await admit(s, askOf('send', { sample_seq: src.sample_seq, frame_seq: src.frame_seq, raw_sha256: src.raw_sha256, raw_size: { width: src.width, height: src.height }, request_id: t.request_id, image_sha256: t.image.sha256 }), going,
    { live_session_id: live.id, ai_frame_seq: t.context.frame_seq, trigger: t.trigger, ink_revision: t.context.ink_revision, ink_sha256: t.context.ink_sha256 });
  // (a failure of the check is latched even when the request was withdrawn meanwhile: it is never just dropped)
  if (!d.ok && !d.local && current === s && !s.ending) violate(s, d.reason);
  if (current !== s || s.ending || !going()) return { status: 'cancelled', uncertain: false, unsettled: false, submission: 'not_submitted' };
  if (!d.ok) return refused(`the test's source check did not admit it (${d.reason}), so it was not sent`);
  return null;
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
  // (with the test's source check on, only a frame whose own taking was admitted is kept: else nothing is written)
  const source = sourceOf(s, f.frame_seq, f.raw['pixels_sha256'], width, height);
  if (source === null) return refuse('its taking from the stream was not admitted by the test\'s source check, so it is not kept');
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
  const full = r.frames + 1 > r.policy.max_frames ? `the retention limit of ${r.policy.max_frames} frames for this session is reached` : r.bytes + adding > r.policy.max_bytes ? `the retention limit of ${r.policy.max_bytes} bytes for this session is reached` : null;
  if (full !== null) {
    // No further frame of this capture is kept, and only a kept frame is given to the AI: its unattended looks stop
    // here, and that is said (the session is still the user's, for circles and questions, while a frame can be kept).
    r.closed = full;
    looksClosed(s);
    return refuse(full, { limit: true });
  }
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
  // A frame kept as a material step is also what the AI is given to look at, when a session runs (as it is on this
  // device: the composed picture when there is ink, else the raw one).
  // Kept even if its encoding crossed a Stop/Start; it is observed only in the session that acquired its pixels.
  if (f['live_session_id'] === s.live?.id) lookAt(s, composed ?? raw, new Date(f['taken_at'] as string).toISOString(), source === 'none' ? null : source, composed && f.composed ? { revision: f.composed['ink_revision'] as number, sha256: inkData?.sha256 ?? null } : { revision: null, sha256: null });
  return { ok: true };
}
/**
 * The first picture the overlay took after the AI was started, for a session that has no frame of its own yet: a
 * session's looks are the frames kept as material steps, and a screen that does not change after the Start gives it
 * none. The picture is taken as it is, whatever it shows, but never one from before the Start; it is kept at its
 * content address like every frame the AI is given by itself (the very picture already kept is that file), and from
 * there it is a look like any other: one at a time, within the session's bounds, a gap when it is not sent. A frame
 * of the user's own circle or follow-up does not stand in for it: the look is owed until one was taken by itself.
 * `retry`: the overlay offers the next sample's picture; without it this session is offered no first picture again.
 */
function lookFrame(s: Session, factsValue: unknown, pngValue: unknown, inkValue: unknown): { ok: boolean; retry?: true } {
  const live = s.live;
  if (!subscription || !live || live.ended !== null || s.ending) return { ok: false };
  if (live.looked || live.paused !== null) return { ok: true }; // a frame was taken for it since its Start, or it looks at none by itself
  const f = factsValue;
  const missed = (reason: string): { ok: false } => {
    live.missed = reason;
    notifyLive(s);
    return { ok: false };
  };
  // How the picture relates to the stream is said with it: a still screen presents no new frame, and the picture is
  // then the stream's newest frame read again at this time (its age is recorded; it is never said to be newer).
  if (!isObj(f) || typeof f['stream_new_frame'] !== 'boolean' || !(f['stream_frame_age_ms'] === null || isMs(f['stream_frame_age_ms']))) return missed('the first picture\'s facts are malformed');
  const read = readFrame(s, f, pngValue, inkValue, live.frames + 1);
  if (typeof read === 'string') return missed(read);
  const source = sourceOf(s, f['frame_seq'], f['raw_sha256'], f['frame_width'], f['frame_height']);
  if (source === null) return { ok: false }; // (the capture ends)
  const at = new Date(f['frame_captured_at'] as string).toISOString(); // (a time: readFrame checked it)
  if (f['live_session_id'] !== live.id || Date.parse(at) < live.since) return { ok: false, retry: true }; // from before the Start: never taken as its first look
  const { image, context } = read.frame;
  const file = `frames/${image.sha256}.png`;
  // Kept before it is given, and named in the session's own record whatever becomes of the look (no retention line
  // names it: it is not a step of the display). Not kept (the capture's limit, other bytes at its address, a write
  // that failed): said as the look that was not made, and not tried again for this session.
  const unstored = storeOriginals(s, [{ name: file, file: frameFile(s.retention.id, image.sha256), sha: image.sha256, data: image.data }, ...read.originals.slice(1)]);
  if (unstored !== null) return missed(`its first picture could not be kept on this device (${unstored}), and only a kept picture is given to ChatGPT by itself`);
  notifyRetention(s); // (what is kept of this capture grew, or not: said as it is now)
  appendLive(s, live, { kind: 'first_picture', session_id: live.id, frame_seq: live.frames + 1, frame_captured_at: at, image: { file, sha256: image.sha256 }, ink_revision: context.ink_revision, ink_sha256: context.ink_sha256, stream_new_frame: f['stream_new_frame'], stream_frame_age_ms: f['stream_frame_age_ms'] });
  lookAt(s, image, at, source === 'none' ? null : source, { revision: context.ink_revision, sha256: context.ink_sha256 });
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
// ---- the AI's session: looks at the whole display, within the user's own bounds ------------------------------------
// Only with the subscription configured, signed in, and the user's own Start saying so. The session's bounds (how
// many requests, how long, the least time between two unattended looks) are the user's, shown before Start; they are
// never the provider's quota, and the session is never renewed or started again by this app. One line of what it did
// is kept per event under the capture's folder (live.jsonl); the pictures it was given are the capture's own files.
/** A whole frame of the display as it is given to the AI: where and when it was taken, and its picture. */
/** `source`: with the test's source check on, the admitted taking this picture was made from; null when no check is configured. */
type Frame = { readonly context: LiveContext; readonly image: Picture; readonly source: FrameSource | null };
type Live = {
  readonly id: string;
  readonly model: string;
  readonly policy: Policy;
  /** When it ends by its own time bound (this device's clock, from what the connector answered the Start). */
  readonly expiresAt: number;
  /** The user's press that started it (this device's clock): a frame taken before it is not this session's to look at. */
  readonly since: number;
  /** Requests that reached ChatGPT, or may have: each uses one of the session's requests, and none is given back. */
  used: number;
  /** This session's own count of whole frames taken for the AI, sent or not (one not sent is a gap). */
  frames: number;
  /** The frame the newest turn was sent with: a later turn is about this frame or a newer one, never an older. */
  latest: Frame | null;
  /** What was said and seen, for the turns to come (whole entries; what does not fit a turn is said there as left out). */
  history: HistoryEntry[];
  gaps: Gap[];
  /** The newest frame waiting to be looked at (an older one waiting is a gap). */
  waiting: Frame | null;
  /** A frame taken after the Start was taken for the AI to look at by itself (until then its first look is owed: a circle's or a follow-up's own frame is not that). */
  looked: boolean;
  /** A look was sent less than the least time between two looks ago: the next one waits. */
  cooling: boolean;
  /** The last look the AI completed. */
  seen: { at: string; frame_seq: number } | null;
  /** Why unattended looks are no longer sent while the session goes on for the user's own requests, or null. */
  paused: string | null;
  /** Why the newest look was not sent or not taken, or null. */
  missed: string | null;
  /** Why the session ended, or null while it runs. Nothing is sent, shown or read aloud for it after that. */
  ended: string | null;
  /** Turns that are out. */
  out: number;
};
const liveFile = (id: string): string => join(captureDir(id), 'live.jsonl');
/**
 * One line of what the AI session did. A line that cannot be written is counted and said (also after the capture's
 * end, where the end is said); nothing is sent again for it. What a failed append left behind (part of a line) is cut
 * back first, so a later line is never glued to it.
 */
function appendLive(s: Session, _live: Live | null, line: Record<string, unknown>): void {
  const file = liveFile(s.retention.id);
  try {
    mkdirSync(captureDir(s.retention.id), { recursive: true });
    const size = existsSync(file) ? statSync(file).size : 0;
    if (size > s.liveBytes) truncateSync(file, s.liveBytes); // a torn line: only whole lines are kept
    const text = `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`;
    appendFileSync(file, text);
    s.liveBytes = Math.min(size, s.liveBytes) + Buffer.byteLength(text);
  } catch {
    s.liveUnwritten += 1;
    if (current !== s) notifyControl(); // after the capture's end: said where its end is said
  }
}
/** The capture that ended last: how many lines of its AI session's record could not be written is said with its end. */
let lastEnded: Session | null = null;
/** The AI session as the windows are told: its state, its own bounds and what is left of them, and what it last saw. */
function liveInfo(s: Session): unknown {
  if (!subscription) return { state: 'none' };
  if (s.liveStarting) return { state: 'starting' };
  const l = s.live;
  if (!l) return { state: 'off', reason: s.liveOff, unwritten: s.liveUnwritten };
  const max = l.policy.max_submissions;
  // used_up: every request of the session is used. It sends nothing more, but it has not ended: its last response is
  // still shown (and read) until its time is over, the user stops it, or the user starts the AI again.
  return { state: l.ended !== null ? 'ended' : l.used >= max ? 'used_up' : 'on', id: l.id, since: new Date(l.since).toISOString(), model: l.model, max_submissions: max, used: l.used, reserve: reserveOf(max), expires_at: new Date(l.expiresAt).toISOString(), min_observation_interval_ms: l.policy.min_observation_interval_ms, paused: l.paused, missed: l.missed, ended: l.ended, seen: l.seen, frames: l.frames, out: l.out, unwritten: s.liveUnwritten };
}
function notifyLive(s: Session): void {
  if (current !== s) return;
  notifyControl();
  if (!s.overlay.isDestroyed()) s.overlay.webContents.send('lc:live', liveInfo(s));
}
/**
 * The user's Start (or Start the AI again): one AI session for this capture, with the bounds the user chose. Not
 * started is said as that, with why; nothing starts it again but the user.
 */
async function startLive(s: Session, policy: Policy): Promise<void> {
  if (!subscription || s.liveStarting || (s.live && s.live.ended === null && s.live.used < s.live.policy.max_submissions) || s.ending || current !== s) return;
  if (s.live && s.live.ended === null) endLive(s, s.live, 'all of its requests were used, and you started the AI again'); // one session at a time (said as what is true whatever the new Start comes to)
  const since = Date.now();
  s.liveStarting = true;
  s.liveOff = null;
  notifyLive(s);
  const id = `live-${randomBytes(8).toString('hex')}`;
  const r = await subscription.startSession({ session_id: id, capture_session_id: s.retention.id, policy });
  s.liveStarting = false;
  if (current !== s || s.ending) {
    // The capture ended meanwhile: a session that did start is stopped, and never used.
    if (r.ok) subscription.stopSession(id);
    return;
  }
  if (!r.ok) {
    // Not started: said with why. (An earlier session of this capture has ended; its end is in live.jsonl.)
    s.live = null;
    s.liveOff = r.reason;
    appendLive(s, null, { kind: 'not_started', session_id: id, code: r.code, reason: r.reason });
    return notifyLive(s);
  }
  const live: Live = { id, model: r.start.model, policy, expiresAt: Date.now() + r.expires_in_ms, since, used: policy.max_submissions - r.remaining_submissions, frames: 0, latest: null, history: [], gaps: [], waiting: null, looked: false, cooling: false, seen: null, paused: null, missed: null, ended: null, out: 0 };
  s.live = live;
  setTimeout(() => endLive(s, live, 'this session\'s time is over'), r.expires_in_ms);
  appendLive(s, live, { kind: 'started', session_id: id, model: live.model, policy, remaining_submissions: r.remaining_submissions, expires_in_ms: r.expires_in_ms });
  looksClosed(s); // (a capture that keeps no further frame gives this session none to look at by itself: said from the start)
  notifyLive(s);
}
/** No further frame of the capture is kept: the running session's unattended looks stop, with why. */
function looksClosed(s: Session): void {
  const live = s.live;
  if (!live || live.ended !== null || s.retention.closed === null || live.paused !== null) return;
  live.paused = `no further frame of this capture is kept on this device (${s.retention.closed}), and only a kept frame is given to ChatGPT by itself`;
  if (live.waiting) gap(s, live, live.waiting.context.frame_seq, 'budget');
  live.waiting = null;
  appendLive(s, live, { kind: 'looks_stopped', session_id: live.id, reason: live.paused });
  notifyLive(s);
}
/** The session ends (Stop, its own bounds, a failure, the connector lost): nothing more is sent, shown or read aloud for it. */
function endLive(s: Session, live: Live, reason: string): void {
  if (live.ended !== null) return;
  live.ended = reason;
  if (live.waiting) gap(s, live, live.waiting.context.frame_seq, 'not_observed');
  live.waiting = null;
  live.latest = null;
  subscription?.stopSession(live.id); // told to the connector that has it; its turns that are out are interrupted
  if (s.live === live) {
    hush(s);
    releaseVoice(); // an AI Stop ends its native child too; a later explicit Start uses a fresh child
  }
  appendLive(s, live, { kind: 'ended', session_id: live.id, reason, used: live.used, out: live.out, frames: live.frames }); // (`used` is not final while requests are out: each says how it settled, below)
  notifyLive(s);
}
/** A frame taken for the AI that it was not given (or did not take): said in the turns to come, and kept as a line. */
function gap(s: Session, live: Live, seq: number, reason: Gap['reason']): void {
  const last = live.gaps.at(-1);
  if (last && last.reason === reason && last.to_frame_seq === seq - 1) last.to_frame_seq = seq;
  else live.gaps.push({ from_frame_seq: seq, to_frame_seq: seq, reason });
  appendLive(s, live, { kind: 'gap', session_id: live.id, frame_seq: seq, reason });
}
/** A turn about `frame`, with the recent conversation and the gaps as they are now (copies: a turn that was sent never changes). */
function turnOf(live: Live, frame: Frame, o: Pick<Turn, 'request_id' | 'trigger' | 'allowed_assistance' | 'presentation' | 'user_text' | 'focus'>, passed: Gap | null = null): Turn {
  const seq = frame.context.frame_seq;
  const { history, omitted } = boundedHistory(live.history, seq, 1); // (room is kept for the one entry that names an earlier focus)
  // The newest gaps (every gap is in live.jsonl), the frame this very request passes by, and the frames whose part
  // of the conversation was left out (the newest runs of them; never over the bound).
  const left = omitted.slice(-(GAPS_MAX >> 1));
  // (only the frames before this request's own: never a later one, and never its own frame, which it carries)
  const earlier = live.gaps.flatMap((g) => (g.from_frame_seq >= seq ? [] : [{ ...g, to_frame_seq: Math.min(g.to_frame_seq, seq - 1) }]));
  const gaps = [...earlier.slice(-(GAPS_MAX - 1 - left.length)), ...(passed ? [passed] : []), ...left];
  return { ...o, session_id: live.id, epoch: 1, permission_revision: 1, audio_source: null, image: { png_base64: Buffer.from(frame.image.data).toString('base64'), sha256: frame.image.sha256, width: frame.image.width, height: frame.image.height }, context: frame.context, history: history.map((h) => ({ ...h })), gaps: gaps.map((g) => ({ ...g })) };
}
/**
 * Sends one turn of the session, once, and counts it against the session's own bounds. A failure that is not simply
 * "not taken" (a sign-in, an allowance, a rate limit, the connector, an answer that did not come or was not bound)
 * ends the session: nothing more is sent by itself, and only the user starts the AI again.
 */
async function sendTurn(s: Session, live: Live, t: Turn, frame: Frame, wanted: () => boolean = () => true, gated: () => void = () => undefined): Promise<TurnOutcome> {
  live.latest = frame;
  live.out += 1;
  notifyLive(s);
  // (with the test's source check on, it is sent only after the source is admitted again now; else as it is.
  // `gated`: the moment it goes on to be sent, or not)
  const held = s.admission ? await sendAdmitted(s, live, t, frame, wanted) : null;
  gated();
  const out = held ?? (await subscription!.turn(t));
  live.out -= 1;
  if (out.submission !== 'not_submitted') live.used += 1;
  if (live.ended !== null) appendLive(s, live, { kind: 'settled', session_id: live.id, request_id: t.request_id, status: out.status, submission: out.submission, used: live.used, out: live.out });
  else {
    // (an interruption the connector did not confirm, or a turn whose fate is not known, ends the session too: the
    // connector has stopped it)
    const failed = out.status === 'uncertain' ? out.reason
      : out.status === 'refused' && suspends({ code: out.code, submission: out.submission }) ? out.reason
      : out.status === 'cancelled' && out.unsettled ? 'a request was interrupted, and whether ChatGPT stopped working on it is not confirmed' : null;
    if (failed !== null) endLive(s, live, `${failed}; nothing more is sent by itself`);
  }
  notifyLive(s);
  return out;
}
/**
 * A frame kept as a material step of the display is what the AI looks at next: the newest one waits (an older one
 * still waiting becomes a gap), and it is sent when nothing else is out and the least time between two looks has
 * passed. Never for every frame, and never into the requests kept for the user's own focus and follow-ups.
 */
function lookAt(s: Session, picture: Picture, capturedAt: string, source: FrameSource | null, ink: { revision: number | null; sha256: string | null }): void {
  const live = s.live;
  if (!subscription || !live || live.ended !== null || s.ending || current !== s) return;
  if (Date.parse(capturedAt) < live.since) return; // taken before the user started this session: not its to look at, and not a frame of it
  live.looked = true;
  const seq = (live.frames += 1);
  if (live.paused !== null) return void gap(s, live, seq, 'budget');
  if (live.waiting) gap(s, live, live.waiting.context.frame_seq, 'coalesced');
  live.waiting = { context: liveContext(s, seq, picture, capturedAt, ink), image: picture, source };
  flushLook(s, live);
}
function flushLook(s: Session, live: Live): void {
  const w = live.waiting;
  if (!w || live.ended !== null || live.paused !== null || live.out > 0 || live.cooling) return; // one request at a time from here, and not before its time: the newest frame waits
  live.waiting = null;
  if (live.used >= live.policy.max_submissions - reserveOf(live.policy.max_submissions)) {
    live.paused = 'the requests left in this session are kept for your own focus and follow-ups';
    gap(s, live, w.context.frame_seq, 'budget');
    return notifyLive(s);
  }
  void look(s, live, w);
}
/** One unattended look: an observation only. What comes back is kept for the conversation, never shown as help. */
async function look(s: Session, live: Live, frame: Frame): Promise<void> {
  const seq = frame.context.frame_seq;
  const t = turnOf(live, frame, { request_id: `${live.id}.look.${seq}`, trigger: 'observation', allowed_assistance: 'none', presentation: 'none', user_text: null, focus: null });
  const problem = turnProblem(t, frame.image.data.length);
  if (problem) {
    live.missed = problem;
    gap(s, live, seq, 'not_observed');
    return notifyLive(s);
  }
  // The least time between two unattended looks starts when one is sent (after its source check, when there is one).
  live.cooling = true;
  const cool = (): void =>
    void setTimeout(() => {
      live.cooling = false;
      flushLook(s, live);
    }, live.policy.min_observation_interval_ms);
  appendLive(s, live, { kind: 'look', session_id: live.id, request_id: t.request_id, frame_seq: seq, frame_captured_at: frame.context.frame_captured_at, image: { file: `frames/${frame.image.sha256}.png`, sha256: frame.image.sha256 }, ink_revision: frame.context.ink_revision, ink_sha256: frame.context.ink_sha256 });
  const out = await sendTurn(s, live, t, frame, () => true, cool);
  if (out.status === 'answered') {
    live.seen = { at: new Date().toISOString(), frame_seq: seq };
    live.missed = null;
    live.history.push({ kind: 'observation', text: out.answer.text, at: frame.context.frame_captured_at, frame_seq: seq, request_id: t.request_id, audio_source: null, presentation: 'not_presented' });
    appendLive(s, live, { kind: 'looked', session_id: live.id, request_id: t.request_id, frame_seq: seq, model: out.answer.model, latency_ms: out.answer.latency_ms, text: out.answer.text });
  } else {
    // Not looked at: a gap in what the AI saw. (Its own bound reached for unattended looks pauses them; a request
    // of the user's own that replaced it, or a busy connector, is just this one frame.)
    const reserved = out.status === 'refused' && out.code === 'budget_reached' && out.submission === 'not_submitted';
    if (reserved && live.ended === null && live.paused === null) live.paused = 'the requests left in this session are kept for your own focus and follow-ups';
    live.missed = out.status === 'refused' ? out.reason : out.status === 'cancelled' ? 'it was interrupted' : out.reason;
    gap(s, live, seq, reserved ? 'budget' : out.status === 'refused' && (out.code === 'busy' || out.code === 'stale_context') ? 'backpressure' : 'not_observed');
    appendLive(s, live, { kind: 'not_looked', session_id: live.id, request_id: t.request_id, frame_seq: seq, status: out.status, code: out.status === 'refused' ? out.code : null, submission: out.submission });
    // Unattended looks have stopped: a frame that was waiting is not sent after that either.
    if (live.paused !== null && live.waiting) {
      gap(s, live, live.waiting.context.frame_seq, 'budget');
      live.waiting = null;
    }
  }
  notifyLive(s);
  flushLook(s, live);
}
/** Where and when a whole frame was taken, as a turn's context: always the whole display, with its ink's identity. */
function liveContext(s: Session, seq: number, picture: { width: number; height: number }, capturedAt: string, ink: { revision: number | null; sha256: string | null }): LiveContext {
  const b = s.display.bounds;
  const bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
  return { capture_session_id: s.retention.id, frame_seq: seq, frame_captured_at: capturedAt, frame_width: picture.width, frame_height: picture.height, display: { id: s.display.display_id, bounds, scale_factor: s.display.scale_factor }, ...wholeRegions(picture, bounds), ink_revision: ink.revision, ink_sha256: ink.revision === null ? null : ink.sha256, source_url: null, source_version: null, media_position: null };
}

// ---- ASK: a circle is a focus inside the whole display, and asks for a small hint at once ---------------------------
// Only with the subscription configured. Completing a circle keeps the WHOLE composed frame (the display with the
// user's ink) as the overlay took it, the circle as a rectangle of that frame, and the exact ink document, under the
// session's capture folder: asks/<sha256>.png, ink/<sha256>.json, and asks/<selection>.json (the selection, each
// request about it and how it ended; a response's text is there, apart from the originals). With the AI's session
// running, a small hint about the circled part is asked for at once, with the whole frame as its context: no second
// press and no typed question. A follow-up in the user's own words is sent only on the user's press, with a fresh
// whole frame: on the same unchanged frame the circle is still its focus; on a later one the circle stays bound to
// its own frame and is only named as an earlier focus, its pixels not attached.
/** How a request ended, as the overlay and the record are told. Only `answered` carries text. */
type AskOutcome =
  | { status: 'answered'; answer: { request_id: string; text: string; model: string; latency_ms: number } }
  | { status: 'refused'; code: string; reason: string; submission: TurnOutcome['submission'] }
  | { status: 'cancelled'; uncertain: boolean }
  | { status: 'uncertain'; reason: string };
/**
 * One request about a selection: the circle's own automatic hint (`focus`, no question), or a follow-up in the user's
 * words. `frame`: the whole frame it was about, and where the selection's circle is in relation to it. `asked_as`:
 * whether it was asked for with Talk on (only then may its response be read aloud). `shown` is true only once the
 * overlay reported that it showed the response.
 * `presentation` is written for a response: 'unconfirmed' from the moment it is sent to the overlay, 'shown' once the
 * overlay reported it. A response left 'unconfirmed' (the overlay was lost, or the session ended, before it reported)
 * may or may not have been seen: it keeps its text, and it is not displayed help as far as this record knows.
 * `spoken` is written by the main process only, for a response that was shown and handed to a voice that plays on
 * an audio device (Talk on), from what that voice itself reported: 'attempted' (handed to the voice; no piece was
 * reported said to its end, so whether anything was played is NOT known: this is not played help), 'interrupted'
 * (some pieces were reported said to their end, then it stopped) or 'finished' (every piece was). `spoken_pieces`
 * counts the completed prefix; 'partial' retains it while further pieces are pending. A response never handed to a voice has no `spoken`. None of this shows that
 * anything was heard.
 */
type AskEntry = {
  request_id: string;
  trigger: 'focus' | 'text_followup';
  question: string | null;
  assistance: Assistance;
  asked_as: 'silent' | 'spoken';
  model: string | null;
  live_session_id: string;
  frame: { frame_seq: number; sample_seq: number; captured_at: string | null; image: { file: string; sha256: string; bytes: number; width: number; height: number }; ink_original: unknown; focus: 'on_this_frame' | 'on_an_earlier_frame' | 'none' };
  submitted_at: string;
  ended_at: string | null;
  outcome: AskOutcome | null;
  submission?: TurnOutcome['submission'];
  shown: boolean;
  presentation?: 'shown' | 'unconfirmed';
  spoken?: 'attempted' | 'partial' | 'interrupted' | 'finished';
  spoken_pieces?: { said: number; of: number };
};
type Selection = {
  readonly id: string;
  /** The whole frame the circle was drawn on. */
  readonly frame: Frame;
  readonly kept: Kept;
  readonly focus: Focus;
  /**
   * The turn that carried the circle as its focus in a running AI session (the circle's own, or a follow-up on the
   * unchanged picture that worked the circle out anew), with the frame it went with: a follow-up carries the focus
   * from it. Null when the circle was never sent.
   */
  origin: Provenance | null;
  sent: { frame: Frame; kept: Kept } | null;
  readonly record: { format: 'lc-windows-live-focus/v1'; selection_id: string; selected_at: string; sample_seq: number; image: unknown; context: LiveContext; focus: Focus; ink_original: unknown; requests: AskEntry[] };
  /** The request that is out, or the last one. */
  request: { id: string; state: 'asking' | 'cancelled' | 'done' } | null;
  /** Why the record on this device is behind what is held here (its last write failed), or null. */
  unsaved: string | null;
};
const askFile = (id: string, name: string): string => join(captureDir(id), 'asks', name);
const isRectValue = (v: unknown): v is { x: number; y: number; width: number; height: number } => isObj(v) && ['x', 'y', 'width', 'height'].every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]));
/** A request that went out: its id, the session's model, and what it is about (when its frame was taken, and where the circle is in relation to that frame). */
type Submitted = { ok: true; request_id: string; model: string; about: { captured_at: string | null; focus: AskEntry['frame']['focus'] } } | { ok: false; reason: string };
type AskAnswer = { ok: true; selection_id: string; request: Submitted } | { ok: false; reason: string };
/** A whole frame as it is kept on this device: the capture's own number of it, its picture's file and its ink's. */
type Kept = { sample_seq: number; image: AskEntry['frame']['image']; ink_original: unknown };
type Original = { name: string; file: string; sha: string; data: Uint8Array };

/**
 * A whole composed frame as the overlay took it (for a circle, or for a follow-up): its facts and picture checked
 * here, never taken on trust. `seq`: this AI session's number for it. Nothing is written by this. A problem is text.
 */
function readFrame(s: Session, f: Record<string, unknown>, pngValue: unknown, inkValue: unknown, seq: number): { frame: Frame; kept: Kept; originals: Original[] } | string {
  if (!isSeq(f['frame_seq']) || !isTime(f['frame_captured_at']) || !isSeq(f['frame_width']) || !isSeq(f['frame_height']) || !isHex(f['ink_session'], 16) || !isCount(f['ink_revision']) || !isCount(f['visible_strokes'])) return 'the frame facts are malformed';
  const most = (dip: number): number => Math.ceil(dip * s.display.scale_factor) + 16;
  if (f['frame_width'] > most(s.display.bounds.width) || f['frame_height'] > most(s.display.bounds.height)) return 'the frame is larger than the chosen display';
  if (Object.prototype.toString.call(pngValue) === '[object Uint8Array]' && (pngValue as Uint8Array).length > PNG_MAX_BYTES) return `the display's picture is over ${PNG_MAX_BYTES} bytes as a PNG`;
  const image = readPicture(pngValue, f['frame_width'], f['frame_height'], s.retention.id);
  if (typeof image === 'string') return `the display's picture is ${image}`;
  const ink = readInkOriginal(inkValue, { ink_session: f['ink_session'], ink_revision: f['ink_revision'], visible_strokes: f['visible_strokes'] });
  // (ink_sha256 null: the exact ink document could not be retained; the record says why)
  const context = liveContext(s, seq, image, new Date(f['frame_captured_at']).toISOString(), { revision: f['ink_revision'], sha256: 'data' in ink ? ink.sha256 : null });
  const originals: Original[] = [
    { name: `asks/${image.sha256}.png`, file: askFile(s.retention.id, `${image.sha256}.png`), sha: image.sha256, data: image.data },
    ...('data' in ink ? [{ name: `ink/${ink.sha256}.json`, file: inkOriginalFile(s.retention.id, ink.sha256), sha: ink.sha256, data: ink.data }] : []),
  ];
  const kept: Kept = { sample_seq: f['frame_seq'], image: { file: originals[0]!.name, sha256: image.sha256, bytes: image.bytes, width: image.width, height: image.height }, ink_original: 'data' in ink ? { file: `ink/${ink.sha256}.json`, sha256: ink.sha256, bytes: ink.bytes } : { refused: ink.refused } };
  return { frame: { context, image, source: null }, kept, originals }; // (its source is its caller's to bind)
}
/** Writes a frame's originals at their content addresses (and `more`, after them). Null, or why not (nothing is replaced). */
function storeOriginals(s: Session, originals: Original[], more: () => void = () => undefined): string | null {
  try {
    // What is already at an address is reused only if it is exactly these bytes; anything else is left untouched.
    const toWrite = originals.filter((o) => {
      const stored = storedOriginal(o.file, o.sha, o.data.length);
      if (stored.state !== 'absent' && stored.state !== 'same') throw new NotItsBytes(`the original already stored as ${o.name} is not these bytes (${stored.reason}); it is left untouched`);
      return stored.state === 'absent';
    });
    const adding = toWrite.reduce((a, o) => a + o.data.length, 0);
    if (s.retention.bytes + adding > s.retention.policy.max_bytes) return `the retention limit of ${s.retention.policy.max_bytes} bytes for this session is reached`;
    for (const o of toWrite) {
      mkdirSync(dirname(o.file), { recursive: true });
      writeAtomic(o.file, o.data);
      s.retention.bytes += o.data.length;
    }
    more();
    return null;
  } catch (error) {
    return error instanceof NotItsBytes ? error.message : `it could not be written to this device (${message(error)})`;
  }
}

/**
 * A circle was completed: the whole frame it is on is kept as the overlay composed it, with the circle as its focus;
 * and, with the AI's session running, a small hint about it is asked for at once. A request out for the selection
 * before is interrupted.
 */
function retainSelection(s: Session, factsValue: unknown, pngValue: unknown, inkValue: unknown, during: unknown): AskAnswer {
  if (!subscription) return { ok: false, reason: 'no AI is connected' };
  // A new selection replaces the card: the one before can no longer be asked about, and a request still out about
  // it is interrupted, whether or not this one is retained.
  dropSelection(s);
  if (s.ending) return { ok: false, reason: 'the capture is ending' };
  const f = factsValue;
  if (!isObj(f) || !isRectValue(f['region_dip'])) return { ok: false, reason: 'the selection facts are malformed' };
  const live = s.live && s.live.ended === null ? s.live : null;
  const read = readFrame(s, f, pngValue, inkValue, live ? live.frames + 1 : 0);
  if (typeof read === 'string') return { ok: false, reason: read };
  const source = sourceOf(s, f['frame_seq'], f['raw_sha256'], f['frame_width'], f['frame_height']);
  if (source === null) return { ok: false, reason: 'its frame was not admitted by the test\'s source check, so it was not kept' };
  const frame: Frame = { ...read.frame, source: source === 'none' ? null : source };
  const { kept } = read;
  // The pixels of the circle are worked out here, from the display and the frame, not taken from the overlay.
  const focus = focusOf({ x: f['region_dip'].x, y: f['region_dip'].y, width: f['region_dip'].width, height: f['region_dip'].height }, { width: frame.image.width, height: frame.image.height, seq: frame.context.frame_seq }, s.display.bounds);
  if (!focus) return { ok: false, reason: 'the selected region is not inside the display' };
  const id = `ask-${randomBytes(8).toString('hex')}`;
  const record: Selection['record'] = { format: 'lc-windows-live-focus/v1', selection_id: id, selected_at: new Date().toISOString(), sample_seq: kept.sample_seq, image: kept.image, context: frame.context, focus, ink_original: kept.ink_original, requests: [] };
  const problem = storeOriginals(s, read.originals, () => writeAtomic(askFile(s.retention.id, `${id}.json`), `${JSON.stringify(record)}\n`));
  if (problem) return { ok: false, reason: problem.replace(/^it could not/, 'the selection could not') };
  if (live) live.frames += 1; // (a frame of the session: counted once it is kept)
  const sel: Selection = { id, frame, kept, focus, origin: null, sent: null, record, request: null, unsaved: null };
  s.ask = sel;
  s.progress += 1;
  notifyRetention(s);
  // (kept whatever the AI's session is now; asked only in the session the circle was made in)
  const request: Submitted = notSendable(s) === null && otherSession(s, during) ? { ok: false, reason: 'the AI was started or started again while this circle was being kept, so it was not asked by itself; send a follow-up to ask in the session that runs now' } : submitTurn(s, sel, 'focus', null, 'hint', frame, kept);
  if (!request.ok && live && live.ended === null) gap(s, live, frame.context.frame_seq, 'not_observed'); // a frame of the session the AI was not given
  return { ok: true, selection_id: id, request };
}

/**
 * The AI session a request was made in, as the overlay knew it when the user acted (its unique session id;
 * null: none ran then), is not the one that runs now: the AI was stopped, started, or started again while the
 * request's picture was being made. What was asked for then is not sent in a session it was not asked in.
 */
const otherSession = (s: Session, during: unknown): boolean => (typeof during === 'string' ? during : null) !== (s.live && s.live.ended === null ? s.live.id : null);
/** Why nothing can be sent to the AI now, or null. */
function notSendable(s: Session): string | null {
  if (s.liveStarting) return 'the AI is being started';
  if (!s.live) return `the AI is not started${s.liveOff ? ` (${s.liveOff})` : ''}; start it in the control window`;
  if (s.live.ended !== null) return `the AI session has ended (${s.live.ended}); start it again in the control window`;
  if (s.live.used >= s.live.policy.max_submissions) return 'all of this AI session\'s requests are used; start the AI again in the control window';
  return null;
}
/**
 * The user pressed Send on a follow-up: the user's own words about the current selection, with a fresh whole frame.
 * The same picture and ink as the selection's own frame, with nothing newer sent since, IS that frame: the circle is
 * still its focus. Anything else is a later frame: the circle stays on its own frame and is only named.
 */
function submitAsk(s: Session, selectionId: unknown, questionValue: unknown, assistanceValue: unknown, factsValue: unknown, pngValue: unknown, inkValue: unknown, during: unknown): Submitted {
  const sel = s.ask;
  if (!subscription) return { ok: false, reason: 'no AI is connected' };
  if (!sel || sel.id !== selectionId) return { ok: false, reason: 'this is no longer the current selection' };
  if (s.ending) return { ok: false, reason: 'the capture is ending' };
  if (sel.request && sel.request.state !== 'done') return { ok: false, reason: sel.request.state === 'asking' ? 'this selection\'s request is still being answered' : 'the request before is still being interrupted' };
  const question = userTextOf(questionValue);
  if (question === null) return { ok: false, reason: userTextProblem(questionValue) };
  if (!ASSISTANCE.includes(assistanceValue as Assistance)) return { ok: false, reason: 'the kind of help is not chosen' };
  const off = notSendable(s);
  if (off) return { ok: false, reason: off };
  if (otherSession(s, during)) return { ok: false, reason: 'the AI was started or started again after you pressed Send, so this was not sent in a session you did not ask it in; press Send again to ask in the session that runs now' };
  const live = s.live!;
  if (!isObj(factsValue)) return { ok: false, reason: 'the frame facts are malformed' };
  const read = readFrame(s, factsValue, pngValue, inkValue, live.frames + 1);
  if (typeof read === 'string') return { ok: false, reason: read };
  const source = sourceOf(s, factsValue['frame_seq'], factsValue['raw_sha256'], factsValue['frame_width'], factsValue['frame_height']);
  if (source === null) return { ok: false, reason: 'its frame was not admitted by the test\'s source check, so it was not sent' };
  const frame: Frame = { ...read.frame, source: source === 'none' ? null : source };
  // The picture and the ink are the circle's own, as it was made.
  const unchanged = frame.image.sha256 === sel.frame.image.sha256 && frame.context.ink_revision === sel.frame.context.ink_revision && frame.context.ink_sha256 === sel.frame.context.ink_sha256;
  // The frame the circle went out with in this AI session, with nothing newer sent since, and the same picture and ink: it IS that frame.
  const usable = sel.origin !== null && sel.origin.session_id === live.id && sel.sent !== null;
  if (usable && unchanged && live.latest === sel.sent!.frame) return submitTurn(s, sel, 'text_followup', question, assistanceValue as Assistance, sel.sent!.frame, sel.sent!.kept);
  // A later frame. When its picture and ink are still the circle's own but the circle never went out in this AI
  // session (the AI was not running then, or this is another session), the circle is worked out anew on this frame
  // and is this request's focus: the user circled exactly these pixels.
  const anew = unchanged && !usable ? focusOf(sel.focus.region_dip, { width: frame.image.width, height: frame.image.height, seq: frame.context.frame_seq }, s.display.bounds) : null;
  // Its picture is kept only once the request is known to be one that can be sent (nothing is kept that no record names).
  let keptNow = false;
  const sent = submitTurn(s, sel, 'text_followup', question, assistanceValue as Assistance, frame, read.kept, anew, () => {
    const problem = storeOriginals(s, read.originals);
    if (problem) return problem.replace(/^it could not/, 'the display\'s picture could not');
    live.frames += 1;
    keptNow = true;
    return null;
  });
  if (!sent.ok && keptNow && live.ended === null) gap(s, live, frame.context.frame_seq, 'not_observed'); // kept, and not given to the AI
  return sent;
}
/** One request about the current selection is written, then sent, once: the circle's own hint, or a follow-up. */
function submitTurn(s: Session, sel: Selection, trigger: 'focus' | 'text_followup', question: string | null, assistance: Assistance, frame: Frame, kept: Kept, anew: Focus | null = null, keep: (() => string | null) | null = null): Submitted {
  const off = notSendable(s);
  if (off) return { ok: false, reason: off };
  const live = s.live!;
  const request_id = `${sel.id}.${sel.record.requests.length + 1}`;
  // Asked for as spoken only with a voice connected and Talk on, not muted, now; else as silent text.
  const asked_as = voice !== null && s.talk.on && !s.talk.muted ? 'spoken' : 'silent';
  // An older frame still waiting for a look is passed by the user's own request: a gap, said in this very request.
  const passed = live.waiting && live.waiting.context.frame_seq < frame.context.frame_seq ? live.waiting.context.frame_seq : null;
  let t = turnOf(live, frame, { request_id, trigger, allowed_assistance: assistance, presentation: asked_as, user_text: question, focus: trigger === 'focus' ? sel.focus : anew }, passed === null ? null : { from_frame_seq: passed, to_frame_seq: passed, reason: 'coalesced' });
  let focus: AskEntry['frame']['focus'] = trigger === 'focus' || anew !== null ? 'on_this_frame' : 'none';
  if (trigger === 'text_followup' && sel.origin && anew === null) {
    // The circle's focus goes with its follow-up: kept on the same unchanged frame, only named on a later one. (A
    // circle of another AI session is not carried: the follow-up is then about the current frame alone.)
    const carried = carryFocus(t, sel.origin);
    if (typeof carried !== 'string') {
      t = carried;
      focus = carried.focus ? 'on_this_frame' : 'on_an_earlier_frame';
    }
  }
  const problem = turnProblem(t, frame.image.data.length);
  if (problem) return { ok: false, reason: problem };
  const unkept = keep?.() ?? null;
  if (unkept !== null) return { ok: false, reason: unkept };
  const entry: AskEntry = { request_id, trigger, question, assistance, asked_as, model: live.model, live_session_id: live.id, frame: { frame_seq: frame.context.frame_seq, sample_seq: kept.sample_seq, captured_at: frame.context.frame_captured_at, image: kept.image, ink_original: kept.ink_original, focus }, submitted_at: new Date().toISOString(), ended_at: null, outcome: null, shown: false };
  sel.record.requests.push(entry);
  const before = sel.unsaved;
  const unwritten = saveAsk(s, sel); // written before it is sent
  if (unwritten) {
    sel.record.requests.pop();
    sel.unsaved = before; // nothing was asked: the record is as it was, written or not
    return { ok: false, reason: `the request could not be written to this device (${unwritten}), so it was not sent` };
  }
  // (kept as a gap, and no longer waiting, only now that the request is written and goes out)
  if (passed !== null) {
    gap(s, live, passed, 'coalesced');
    live.waiting = null;
  }
  const mine = { id: request_id, state: 'asking' as 'asking' | 'cancelled' | 'done' };
  sel.request = mine;
  hush(s); // a new request: the response before is no longer read
  if (t.focus !== null && (trigger === 'focus' || anew !== null)) {
    sel.origin = provenanceOf(t);
    sel.sent = { frame, kept };
  }
  void sendTurn(s, live, t, frame, () => mine.state === 'asking').then((out) => {
    askEnded(s, live, sel, mine, entry, t, out);
    // A request that was sent and not answered: the AI was not given its frame, unless it saw that frame with
    // another request (a follow-up on the circle's own frame). Said as a gap in the requests to come. Answered: no gap.
    const seq = frame.context.frame_seq;
    const covers = (g: Gap): boolean => g.from_frame_seq <= seq && seq <= g.to_frame_seq;
    if (out.status === 'answered') live.gaps = live.gaps.flatMap((g) => (!covers(g) ? [g] : [...(g.from_frame_seq < seq ? [{ ...g, to_frame_seq: seq - 1 }] : []), ...(seq < g.to_frame_seq ? [{ ...g, from_frame_seq: seq + 1 }] : [])]));
    else if (live.ended === null && !live.gaps.some(covers) && !live.history.some((h) => h.frame_seq === seq && h.kind !== 'user')) gap(s, live, seq, out.status === 'refused' && (out.code === 'busy' || out.code === 'stale_context') ? 'backpressure' : 'not_observed');
    flushLook(s, live);
  });
  return { ok: true, request_id, model: live.model, about: { captured_at: frame.context.frame_captured_at, focus } };
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
  sel.frame.image.data = new Uint8Array(0); // only its record is held: it is never asked about again, and its picture is on this device
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
 * How a request about a selection ended: recorded, and said to the overlay only if it is still the current
 * selection's live request. This is the check before any text of a response leaves this process: the session it was
 * sent in is still this capture's running one, the capture is not ending, the selection is still the card's and the
 * request still its live one, and what came back was read as bound to the whole turn that was sent (subscription.ts).
 * An outcome that could not be written is held here and said as not saved (it is written again at the user's press,
 * when its card goes, and when the session ends); nothing is sent again to repair the record.
 */
function askEnded(s: Session, live: Live, sel: Selection, mine: NonNullable<Selection['request']>, entry: AskEntry, t: Turn, outcome: TurnOutcome): void {
  const current_ = current === s && !s.ending && s.live === live && live.ended === null && s.ask === sel && sel.request === mine && mine.state === 'asking';
  const view: AskOutcome = outcome.status === 'answered'
    ? current_ ? { status: 'answered', answer: { request_id: outcome.answer.request_id, text: outcome.answer.text, model: outcome.answer.model, latency_ms: outcome.answer.latency_ms } } : { status: 'cancelled', uncertain: true }
    : outcome.status === 'refused' ? { status: 'refused', code: outcome.code, reason: outcome.reason, submission: outcome.submission }
    : outcome.status === 'cancelled' ? { status: 'cancelled', uncertain: outcome.uncertain } : { status: 'uncertain', reason: outcome.reason };
  mine.state = 'done';
  entry.ended_at = new Date().toISOString();
  entry.outcome = view; // an answer's text is kept only when it is this selection's live answer; apart from the originals
  entry.submission = outcome.submission;
  entry.shown = false; // until the overlay says it showed it
  if (view.status === 'answered') {
    entry.presentation = 'unconfirmed';
    // What was asked and what was answered join the conversation the next turns carry (whole, or left out and said).
    if (t.user_text !== null) live.history.push({ kind: 'user', text: t.user_text, at: entry.submitted_at, frame_seq: t.context.frame_seq, request_id: t.request_id, audio_source: null, presentation: null });
    const said: HistoryEntry = { kind: 'assistant', text: view.answer.text, at: entry.ended_at, frame_seq: t.context.frame_seq, request_id: t.request_id, audio_source: null, presentation: 'unconfirmed' };
    live.history.push(said);
    presented.set(entry, said);
  }
  const unwritten = saveAsk(s, sel);
  // Said to the overlay only while this is still the selection on its card. `speak`: this response may be read aloud
  // (it was asked for as spoken, with Talk on then); whether it is, is checked again before every piece.
  if (current === s && s.ask === sel && sel.request === mine && !s.overlay.isDestroyed()) return void s.overlay.webContents.send('lc:ask-result', sel.id, mine.id, view, { saved: unwritten === null, reason: unwritten, speak: view.status === 'answered' && t.presentation === 'spoken' });
  if (unwritten === null || (current === s && s.ask === sel)) return;
  // Its card is gone: no window is left to say it on but the control window's, where the session's end is said.
  holdUnrecorded(s, sel);
  if (current !== null) return; // said when that session ends
  sayUnrecordedAsks();
  notifyControl();
}
/** The conversation's own entry for an answer, by its record's entry: how it was presented is said there too. */
const presented = new WeakMap<AskEntry, HistoryEntry>();
/**
 * The overlay asks, just before it puts an answer on the card, whether it is still this card's to show. Checked at
 * that moment, whatever was true when the answer left this process (it may have waited in the overlay since): the
 * capture is not ending, the AI session it was asked in is still this capture's running one (not stopped, not ended,
 * not started again), and it is still the newest request of the selection on the card. Refused, its text is not kept
 * and is never shown or read. (An answer already shown stays what it is: this is asked before showing only.)
 */
function askPresentable(s: Session, selectionId: unknown, requestId: unknown): { ok: true } | { ok: false; reason: string; saved?: boolean; unsaved?: string | null } {
  const sel = s.ask;
  const entry = sel && sel.id === selectionId ? sel.record.requests.find((r) => r.request_id === requestId) : undefined;
  if (!sel || !entry || entry.outcome?.status !== 'answered') return { ok: false, reason: 'it is no longer this card\'s response' };
  const reason = s.ending ? 'the capture was ending before it was shown'
    : !s.live || s.live.id !== entry.live_session_id || s.live.ended !== null ? 'the AI was stopped before it was shown'
    : sel.request?.id !== requestId ? 'a newer request was made from this card before it was shown' : null;
  if (reason === null) return { ok: true };
  if (entry.shown) return { ok: false, reason }; // (already shown: it stays what it is)
  notShown(entry);
  // Whether the record now says so on this device is said with the refusal (a write that failed is held, and offered on the card).
  const unwritten = saveAsk(s, sel);
  return { ok: false, reason, saved: unwritten === null, unsaved: unwritten };
}
/** The overlay says what it did with an answer: showed it, or (cancelled or ended meanwhile) did not. */
function askPresented(s: Session, selectionId: unknown, requestId: unknown, shown: unknown): { saved: boolean; reason: string | null } {
  const sel = s.ask;
  const entry = sel && sel.id === selectionId ? sel.record.requests.find((r) => r.request_id === requestId) : undefined;
  if (!sel || !entry || entry.shown || entry.outcome?.status !== 'answered') return { saved: sel ? sel.unsaved === null : true, reason: sel?.unsaved ?? null };
  if (shown === true) {
    Object.assign(entry, { shown: true, presentation: 'shown' });
    const said = presented.get(entry);
    if (said) said.presentation = 'shown';
  } else notShown(entry);
  const unwritten = saveAsk(s, sel);
  return { saved: unwritten === null, reason: unwritten };
}
// ---- a response read aloud -------------------------------------------------------------------------------------------
// Silent unless the user turned Talk on in the overlay. The main process owns the voice and everything it is handed:
// the overlay asks only for a piece of the current response by its place in it, never with text, a language, a rate
// or an output of its own. Before every piece it is checked again, here, that the asker is the current session's
// overlay, that the session is not ending, that this is the current selection's last question, answered, and
// reported shown on its card, and that Talk is on and not muted. A piece that ends after its reading was stopped
// starts nothing.
/**
 * A voice: says one piece in a language's voice (true only when it was said to its end), stops at once, and is ended
 * on session end and with the app (its `dispose` is waited for no longer than VOICE_END_MS). A later authorized
 * session can reuse the provider after its old child was reaped. `audible`: it is configured for an audio device; a
 * voice that only synthesizes (a test's) is false, and nothing it says is recorded as read aloud.
 */
export type Voice = { readonly audible: boolean; say(text: string, rate: number, culture: Culture): Promise<boolean>; stop(): void; dispose(): Promise<void> };
/** The replaceable main-owned provider. Source-only/non-Windows builds have none. */
let voice: Voice | null = null;
/** Connects the build's voice (before a Start). Only main-process code can: no window can name a voice, a program or an output. */
export const connectVoice = (v: Voice | null): void => {
  if (voice === v) return;
  if (current) hush(current);
  releaseVoice();
  voice = v;
};
/** Release the session's child without blocking ink retention or claiming that a failed exit was observed. */
function releaseVoice(): void {
  try { void voice?.dispose().catch(() => console.warn('Speech child exit was not observed; this provider will not start another child.')); }
  catch { console.warn('Speech child disposal failed.'); }
}
type Reading = { readonly sel: Selection; readonly entry: AskEntry; readonly pieces: string[]; /** The voice of each piece. */ readonly cultures: Culture[]; /** The piece that is next, or being said. */ at: number; saying: boolean; /** What the voice reports of this reading is written to the record (a voice that plays on a device; not for an answer once read to its end). */ recorded: boolean };
/**
 * The current session's current selection's last request, if it was answered in the AI session that is still
 * running, was asked for as spoken, its answer reported shown, and reading aloud is allowed now. (A request still
 * out, cancelled or refused has no answer here: only the live answer of the turn that was sent is ever kept as one.)
 */
function readable(s: Session, selectionId: unknown, requestId: unknown): { sel: Selection; entry: AskEntry; text: string } | null {
  const sel = s.ask;
  if (linkQuitting !== null || s.ending || !s.live || s.live.ended !== null || !s.talk.on || s.talk.muted || !sel || sel.id !== selectionId) return null;
  const entry = sel.record.requests.at(-1);
  const out = entry?.outcome;
  if (!entry || entry.request_id !== requestId || entry.live_session_id !== s.live.id || sel.request?.id !== requestId || sel.request.state !== 'done' || out?.status !== 'answered' || !entry.shown || entry.presentation !== 'shown' || entry.asked_as !== 'spoken') return null;
  // askEnded received this text only after the connector checked the complete response provenance. Recheck that
  // same main-owned response and its current disclosure scope; a shown record alone is not playback permission.
  const verified = presented.get(entry);
  if (!verified || verified.request_id !== requestId || verified.text !== out.answer.text || (verified.presentation !== 'shown' && verified.presentation !== 'spoken') || out.answer.request_id !== requestId || out.answer.model !== entry.model || !['hint', 'explain', 'solution'].includes(entry.assistance) || (entry.trigger === 'focus' && entry.assistance !== 'hint')) return null;
  return { sel, entry, text: out.answer.text };
}
/**
 * What the voice reported of a reading, written to the record apart from shown: handed to it ('attempted'), then by
 * the pieces it reported said to their end. A reading that ends with no piece reported stays 'attempted': a call that
 * was only attempted is never counted as played help.
 */
function recordSpoken(s: Session, r: Reading, over: boolean): void {
  if (!r.recorded) return;
  // The completed prefix from an earlier interrupted reading remains evidence during a replay, even if that replay fails.
  const said = Math.max(r.at, r.entry.spoken_pieces?.said ?? 0);
  r.entry.spoken = said === r.pieces.length ? 'finished' : said > 0 ? over ? 'interrupted' : 'partial' : 'attempted';
  r.entry.spoken_pieces = { said, of: r.pieces.length };
  if (r.entry.spoken === 'finished') {
    const entry = presented.get(r.entry);
    if (entry) entry.presentation = 'spoken';
  }
  saveAsk(s, r.sel);
}
/** Nothing more of a response is read: the voice is told to stop at once, with everything not yet said. */
function hush(s: Session): void {
  const r = s.reading;
  s.reading = null;
  if (!r) return;
  try {
    voice?.stop();
  } catch {
    // a voice that fails to stop is handed nothing more; what follows (a Stop, a new card) goes on
  }
  recordSpoken(s, r, true);
}
/**
 * The overlay asks for piece `at` of the current response: 0 begins a reading, each later one must be the next in
 * order. The text is this process's own copy of the answer it sent to the card, cut here. False when it was not said
 * to its end, or not said at all.
 */
async function sayPiece(s: Session, selectionId: unknown, requestId: unknown, at: unknown): Promise<{ spoken: boolean }> {
  const NO = { spoken: false };
  const now = voice;
  const ok = readable(s, selectionId, requestId);
  if (!now || !ok) return NO;
  if (at === 0 && s.reading?.entry !== ok.entry) {
    hush(s);
    const pieces = speechPieces(ok.text);
    // (an answer once read to its end stays recorded as that, whatever a later reading of it comes to)
    s.reading = { sel: ok.sel, entry: ok.entry, pieces, cultures: speechCultures(pieces), at: 0, saying: false, recorded: now.audible && ok.entry.spoken !== 'finished' };
  }
  const r = s.reading;
  if (!r || r.entry !== ok.entry || r.saying || at !== r.at || r.at >= r.pieces.length) return NO;
  if (r.at === 0) recordSpoken(s, r, false); // handed to the voice: 'attempted' until it reports a piece said
  r.saying = true;
  const piece = r.pieces[r.at]!;
  let said = false;
  try {
    said = (await now.say(piece, preferences.speech_rate, r.cultures[r.at]!)) === true;
  } catch {
    // a voice that throws, or whose promise is rejected, did not say the piece to its end
  }
  if (s.reading !== r) return NO; // stopped meanwhile: this late end starts nothing, and it was recorded where it was stopped
  if (current !== s || voice !== now || readable(s, selectionId, requestId)?.entry !== r.entry) {
    hush(s);
    return NO;
  }
  r.saying = false;
  if (!said) {
    hush(s); // not said to its end: the voice is told to stop too, whatever it still holds, and the reading is over
    return NO;
  }
  r.at += 1;
  if (r.at === r.pieces.length) {
    s.reading = null;
    recordSpoken(s, r, true); // every piece was reported said to its end
  } else recordSpoken(s, r, false); // retain each confirmed completed prefix before asking for another piece
  return { spoken: true };
}
/** An answer the overlay itself says it did not show (or never took, its card being gone): its text is not kept. */
function notShown(entry: AskEntry): void {
  entry.outcome = { status: 'cancelled', uncertain: true };
  delete entry.presentation;
  const said = presented.get(entry);
  if (said) said.presentation = 'not_presented'; // (the conversation keeps what was generated, and that it was not shown)
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
  hush(s); // a response is read aloud only while its card shows it
  cancelAsk(s, sel.id);
  // An answer the overlay never said it showed (its messages come in order) was not shown on this card: not kept.
  const unshown = sel.record.requests.filter((r) => !r.shown && r.outcome?.status === 'answered');
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
  subscription?.interrupt(sel.request.id); // told to the connector at once: its answer is never returned
}
/** The capture is ending: nothing of it is sent or answered from here, and its AI session ends with it. */
function stopAsking(s: Session, why: string): void {
  if (s.ask?.request?.state === 'asking') s.ask.request.state = 'cancelled';
  if (s.live && s.live.ended === null) endLive(s, s.live, why);
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
// (Not while the window's close is waiting for the connector to end: nothing is started that the close would end.)
ipcMain.on('lc:sub-check', (e) => void (fromControl(e) && !endingConnector ? subscription?.check() : undefined));
ipcMain.on('lc:sub-login', (e) => void (fromControl(e) && !endingConnector ? subscription?.login() : undefined));
ipcMain.on('lc:sub-login-cancel', (e) => void (fromControl(e) ? subscription?.cancelLogin() : undefined));
ipcMain.on('lc:sub-model', (e, id: unknown) => void (fromControl(e) ? subscription?.chooseModel(id) : undefined));
// Start: the capture of the chosen display; with `ai` (the user's own choice beside the button, and the bounds shown
// there), the AI's observation of that display too. Bounds that are not the envelope's are refused, never clamped.
ipcMain.handle('lc:start', async (e, sourceId: unknown, ai: unknown = null) => {
  if (!fromControl(e) || typeof sourceId !== 'string' || !(ai === null || (isObj(ai) && Object.keys(ai).join() === 'policy' && isPolicy(ai['policy'])))) return { ok: false, reason: 'refused' };
  return endingConnector ? { ok: false, reason: 'the app is closing' } : start(sourceId, ai === null ? null : { policy: ai['policy'] as Policy });
});
// The AI's observation, started (again) or stopped by the user while the capture runs. Never by anything else.
ipcMain.handle('lc:live-start', async (e, policy: unknown) => {
  if (!fromControl(e) || !isPolicy(policy)) return { ok: false, reason: 'refused' };
  const s = current;
  if (!s || s.ending || !s.shown) return { ok: false, reason: 'no capture is running' };
  if (endingConnector) return { ok: false, reason: 'the app is closing' };
  if (s.liveStarting || (s.live && s.live.ended === null && s.live.used < s.live.policy.max_submissions)) return { ok: false, reason: 'the AI is already started' };
  const before = s.live;
  await startLive(s, policy);
  return s.live && s.live !== before && s.live.ended === null ? { ok: true } : { ok: false, reason: s.liveOff ?? s.live?.ended ?? 'the AI did not start' };
});
ipcMain.on('lc:live-stop', (e) => void (fromControl(e) && current?.live && current.live.ended === null ? endLive(current, current.live, 'stopped by you') : undefined));
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
// ---- where the overlay's movable surfaces are, and the speech rate: kept on this device, per display ------------------
const preferencesFile = (): string => join(app.getPath('userData'), 'overlay-preferences.json');
/** What this run keeps; `unreadable`: the file found is not of this format, and is left untouched (nothing is saved). */
let preferences: Preferences = NO_PREFERENCES;
let preferencesUnreadable = false;
/** At most this many unreadable preferences files are set aside (each under its own name). */
const UNREADABLE_KEPT = 8;
function loadPreferences(): void {
  preferences = NO_PREFERENCES;
  preferencesUnreadable = false;
  if (!existsSync(preferencesFile())) return;
  let text: string;
  try {
    text = readFileSync(preferencesFile(), 'utf8');
  } catch {
    return void (preferencesUnreadable = true);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Not JSON at all (empty or cut short, as a write that was interrupted leaves it): set aside under another
    // name, never deleted, so that the next change can be kept again. A file set aside before is never written
    // over: this one takes the next free name, and when none is free it is left where it is, untouched.
    try {
      // (free: nothing has that name, whatever it is; a name that cannot be looked at leaves the torn file where it is)
      const aside = ['', ...Array.from({ length: UNREADABLE_KEPT - 1 }, (_, i) => `-${i + 2}`)].map((n) => `${preferencesFile()}.unreadable${n}`).find((f) => lstatSync(f, { throwIfNoEntry: false }) === undefined);
      if (aside === undefined) throw new Error('no free name');
      renameSync(preferencesFile(), aside);
    } catch {
      preferencesUnreadable = true;
    }
    return;
  }
  // JSON of another shape (another format, say a later version's): left as it is, and nothing is written over it.
  const read = readPreferences(value);
  if (read) preferences = read;
  else preferencesUnreadable = true;
}
/** Keeps a changed preference for this run and writes it. Null, or why it is not written (it then holds for this run only). */
function savePreferences(next: Preferences): string | null {
  preferences = next;
  if (preferencesUnreadable) return 'the overlay preferences on this device are not readable, so they are left untouched';
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeAtomic(preferencesFile(), storedPreferences(next));
    return null;
  } catch (error) {
    return message(error);
  }
}
/** The work area of the session's display, relative to the display's own corner (the overlay covers the whole display). */
function workAreaOf(s: Session): Rect {
  const d = screen.getAllDisplays().find((x) => String(x.id) === s.display.display_id);
  const b = s.display.bounds;
  const w = d?.workArea ?? b;
  return { x: w.x - b.x, y: w.y - b.y, width: w.width, height: w.height };
}
// A surface was moved (the user's drag): its place is kept for this display. Only numbers in [0, 1] are taken.
ipcMain.handle('lc:place', (e, surface: unknown, place: unknown) => {
  if (!fromOverlay(e) || !current || !isSurface(surface) || !isPlace(place)) return { saved: false, reason: 'refused' };
  const reason = savePreferences(withPlace(preferences, current.display.display_id, surface, place));
  return { saved: reason === null, reason };
});
ipcMain.handle('lc:speech-rate', (e, rate: unknown) => {
  if (!fromOverlay(e) || !current || typeof rate !== 'number' || clampRate(rate) !== rate) return { saved: false, reason: 'refused' };
  const reason = savePreferences({ displays: preferences.displays, speech_rate: rate });
  return { saved: reason === null, reason };
});

ipcMain.handle('lc:overlay-ready', (e) => {
  if (!fromOverlay(e) || !current) return null;
  return {
    work_area: workAreaOf(current), places: placesOf(preferences, current.display.display_id), speech_rate: preferences.speech_rate, voice: voice ? { audible: voice.audible } : null, live: liveInfo(current), admission: current.admission !== null, source_id: current.sourceId, display: current.display, doc: current.doc, address_sha256: sha256(current.doc.id), retention_policy: current.retention.policy, development: linkStatus.mode === 'development', subscription: subscriptionStatus.mode === 'managed' };
});
// ASK: a circle is retained with the whole display it is on, and (with the AI's session running) a small hint about
// it is asked for at once; a follow-up is sent only by lc:ask-submit, the user's own press.
ipcMain.handle('lc:ask-selection', (e, facts: unknown, png: unknown, ink: unknown, during: unknown) => (fromOverlay(e) && current ? retainSelection(current, facts, png, ink ?? null, during) : { ok: false, reason: 'refused' }));
ipcMain.handle('lc:ask-submit', (e, selectionId: unknown, question: unknown, assistance: unknown, facts: unknown, png: unknown, ink: unknown, during: unknown) => (fromOverlay(e) && current ? submitAsk(current, selectionId, question, assistance, facts, png, ink ?? null, during) : { ok: false, reason: 'refused' }));
ipcMain.on('lc:ask-cancel', (e, selectionId: unknown) => void (fromOverlay(e) && current ? cancelAsk(current, selectionId) : undefined));
ipcMain.handle('lc:ask-present', (e, selectionId: unknown, requestId: unknown) => (fromOverlay(e) && current ? askPresentable(current, selectionId, requestId) : { ok: false, reason: 'refused' }));
ipcMain.handle('lc:ask-presented', (e, selectionId: unknown, requestId: unknown, shown: unknown) => (fromOverlay(e) && current ? askPresented(current, selectionId, requestId, shown) : { saved: false, reason: 'refused' }));
// Talk: the user's own setting in the overlay, kept here so that it is checked before every piece.
ipcMain.on('lc:talk', (e, on: unknown, muted: unknown) => {
  if (!fromOverlay(e) || !current || typeof on !== 'boolean' || typeof muted !== 'boolean') return;
  current.talk = { on, muted: on && muted };
  if (!on || muted) hush(current);
});
ipcMain.handle('lc:say', (e, selectionId: unknown, requestId: unknown, at: unknown) => (fromOverlay(e) && current ? sayPiece(current, selectionId, requestId, at) : { spoken: false }));
ipcMain.on('lc:hush', (e) => void (fromOverlay(e) && current ? hush(current) : undefined));
ipcMain.handle('lc:ask-save', (e, selectionId: unknown) => (fromOverlay(e) && current ? saveAskAgain(current, selectionId) : { saved: false, reason: 'refused' }));
ipcMain.on('lc:ask-closed', (e) => void (fromOverlay(e) && current ? dropSelection(current) : undefined)); // the card was closed or replaced
// Retained frames keep arriving while a Stop waits for the overlay: they were observed before the end.
ipcMain.handle('lc:look-frame', (e, facts: unknown, png: unknown, ink: unknown) => (fromOverlay(e) && current ? lookFrame(current, facts, png, ink ?? null) : { ok: false }));
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
ipcMain.handle('lc:arm-capture', async (e) => {
  const s = current;
  if (!fromOverlay(e) || !s || s.ending || s.capture !== 'unused') return false;
  const a = s.admission;
  if (a) {
    // With the test's source check on, the stream is asked for only once its checker is ready and admits the source.
    s.capture = 'arming';
    // This capture's overlay window, as main knows it (never from a window): the checker binds it for its lifetime.
    a.overlay = { pid: process.pid, hwnd: windowHandle(s.overlay) };
    const problem = a.overlay.hwnd === '' ? 'the overlay window has no native handle' : await a.checker.open();
    const b = s.display.bounds;
    const d = problem === null ? await admit(s, askOf('arm', { display: { id: s.display.display_id, bounds: { x: b.x, y: b.y, width: b.width, height: b.height }, scale_factor: s.display.scale_factor }, overlay: a.overlay })) : { ok: false as const, reason: problem, local: false };
    if (current !== s || s.ending) return false;
    if (!d.ok) {
      violate(s, d.reason);
      return false;
    }
    a.armed = true;
  }
  s.capture = 'armed';
  return true;
});
// With the test's source check on: the overlay's two admissions of each frame it takes from the stream.
ipcMain.handle('lc:admit-frame', (e, phase: unknown, sampleSeq: unknown, facts: unknown) => (fromOverlay(e) && current ? admitFrame(current, phase, sampleSeq, facts) : { ok: false }));
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
/** The voice is ended with the app, but never holds it: an end that throws, is rejected or does not come is waited for no longer than this. */
const VOICE_END_MS = 5_000;
const endVoice = (): Promise<void> =>
  new Promise<void>((done) => {
    const v = voice;
    if (!v) return done();
    setTimeout(done, VOICE_END_MS);
    new Promise<void>((ended) => ended(v.dispose())).then(done, done); // (a throw is a rejection here)
  });
let linkQuitDone = false;
app.on('will-quit', (e) => {
  if ((!link && !subscription && !voice && openCheckers.size === 0) || linkQuitDone) return;
  e.preventDefault();
  // (the voice's own child is ended with the app: asked to, then ended, and its end waited for within its bound; so is
  // a test's source checker)
  linkQuitting ??= Promise.allSettled([link?.quit(20_000), subscription?.quit(), endVoice(), ...[...openCheckers].map((c) => c.close())]) // each is waited for, whatever the others come to
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

// ---- connector ends that were not seen: a small note on this device ------------------------------------------------
// When a subscription connector is ended and its own end is not seen (its wsl.exe shim is ended instead), that fact
// and its time are written here, so the next launch can say it as a past record. Only a time and one of two words
// are ever written: nothing of an account, an address, a question, a picture, the environment or a path. Nothing
// here shows that anything is still running, or that it has ended since; a later connector does not remove a line.
const CONNECTOR_ENDS_FORMAT = 'lc-windows-connector-ends/v1';
/** The newest ones are listed; older ones are only counted. */
const CONNECTOR_ENDS_MAX = 50;
const connectorEndsFile = (): string => join(app.getPath('userData'), 'connector-ends.json');
type ConnectorEnds = { ends: ConnectorEnd[]; older: number };
const isConnectorEnd = (v: unknown): v is ConnectorEnd =>
  isObj(v) && Object.keys(v).sort().join() === 'at,shim' && typeof v['at'] === 'string' && !Number.isNaN(Date.parse(v['at'])) && new Date(v['at']).toISOString() === v['at'] && (v['shim'] === 'ended' || v['shim'] === 'not_ended');
/** The note as it is on this device: none; its lines; or not readable as this format (it is then left untouched). */
function readConnectorEnds(): ConnectorEnds | 'unreadable' | null {
  if (!existsSync(connectorEndsFile())) return null;
  try {
    const v: unknown = JSON.parse(readFileSync(connectorEndsFile(), 'utf8'));
    if (!isObj(v) || Object.keys(v).sort().join() !== 'ends,format,older' || v['format'] !== CONNECTOR_ENDS_FORMAT) return 'unreadable';
    const { ends, older } = v;
    if (!Array.isArray(ends) || ends.length > CONNECTOR_ENDS_MAX || !ends.every(isConnectorEnd) || !isCount(older)) return 'unreadable';
    return { ends: ends.map((e) => ({ at: e.at, shim: e.shim })), older };
  } catch {
    return 'unreadable';
  }
}
/** What this run writes on (the lines found at launch, plus its own); null when what is there cannot be read. */
let connectorEnds: ConnectorEnds | null = { ends: [], older: 0 };
/**
 * Writes one end, or the same one again (`again`: by its time). Null, or why it was not written. An end written
 * before that is no longer among the listed ones is already counted with the older ones: it is not counted twice.
 */
function recordConnectorEnd(end: ConnectorEnd, again = false): string | null {
  if (!connectorEnds) return 'the record of connector ends on this device is not readable, so it is left untouched';
  if (again && !connectorEnds.ends.some((e) => e.at === end.at)) return null;
  // The lines stay in the order of their times: the same end again (its shim's exit seen since) keeps its place, and
  // one written late (its first write failed) goes where its time is.
  const ends = [...connectorEnds.ends.filter((e) => e.at !== end.at), { at: end.at, shim: end.shim }].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const next = { ends: ends.slice(-CONNECTOR_ENDS_MAX), older: connectorEnds.older + Math.max(0, ends.length - CONNECTOR_ENDS_MAX) };
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeAtomic(connectorEndsFile(), `${JSON.stringify({ format: CONNECTOR_ENDS_FORMAT, ...next })}\n`);
  } catch (error) {
    return message(error);
  }
  connectorEnds = next;
  return null;
}
function notifySubscription(): void {
  if (control && !control.isDestroyed()) control.webContents.send('lc:sub', subscriptionStatus);
}

app.whenReady().then(async () => {
  admissionSetting = readAdmissionConfig(process.env); // a test's source check: off unless configured for this launch
  connectVoice(bundledSystemVoice()); // fixed hash-checked local bundle; lazy and silent until an authorized Talk response
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
  loadPreferences();
  const connector = readConnectorConfig(process.env);
  // What earlier runs recorded of connector ends that were not seen is read once, and said as past records (also
  // when the configuration named now cannot be used).
  const found = connector ? readConnectorEnds() : null;
  connectorEnds = found === 'unreadable' ? null : (found ?? { ends: [], older: 0 });
  const earlier = { ends: found && found !== 'unreadable' ? found.ends : [], older: found && found !== 'unreadable' ? found.older : 0, unreadable: found === 'unreadable' };
  if (connector && 'error' in connector) subscriptionStatus = { mode: 'unavailable', reason: [connector.error, ...earlierNotes(earlier)].join('; ') };
  else if (connector) {
    subscription = new Subscription({
      config: connector,
      notify: (st) => {
        subscriptionStatus = st;
        notifySubscription();
        // The connector that has the AI's session was lost or ended: the session is over (nothing starts it again but the user).
        const s = current;
        if (s?.live && s.live.ended === null && !subscription?.sessionLive(s.live.id)) endLive(s, s.live, 'the connection to ChatGPT was lost');
      },
      openExternal: (url) => shell.openExternal(url),
      recordEnd: recordConnectorEnd,
      earlier,
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
  // The work area alone changed (the taskbar moved or resized): the overlay keeps its surfaces inside the new one.
  screen.on('display-metrics-changed', (_e, d, changed) => {
    if (current && String(d.id) === current.display.display_id && changed.length > 0 && changed.every((k) => k === 'workArea') && !current.overlay.isDestroyed()) current.overlay.webContents.send('lc:work-area', workAreaOf(current));
  });
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
      return void control?.webContents.send('lc:close-held');
    }
    // The subscription connector is ended while this window is still open, so that an end that was not seen is
    // written before the app goes, and a note of it that could not be written is said here (once) instead of being
    // taken as saved. The window then closes by itself.
    const sub = subscription;
    if (!sub || (endingConnector === null && !sub.running() && !sub.ending() && (sub.endsUnsaved() === null || endNoteSaid))) return;
    e.preventDefault();
    endingConnector ??= sub.quit().then(() => {
      endingConnector = null;
      if (!control || control.isDestroyed()) return;
      if (sub.endsUnsaved() !== null && !endNoteSaid) {
        endNoteSaid = true; // said in the subscription's status; the next close is not held for it
        return void control.show();
      }
      control.close();
    });
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
