// Author self-test (LC_SELFTEST=<report.json>): runs the real app on Windows through its own flow.
//
// It captures the primary display for a short while (frames stay in memory; the report keeps only
// non-content facts: sizes, states, hashes, counts), shows this app's windows without activating them,
// and drives the overlay with window-scoped DevTools input (the user's real cursor never moves). A small
// green checkered probe window with a changing counter gives the display something known that changes. The OS
// click-through of NAV is checked as the window's ignore-mouse state, not with real clicks into other
// apps. Screenshots are of this app's own windows only.

import { BrowserWindow, app, nativeImage, screen } from 'electron';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { homedir, release } from 'node:os';
import type { DisplayChoice } from './main.ts';
import { contextImages, type DesktopInk, type DesktopInkSummary } from '../shared/desktop-ink.ts';
import { DEFAULT_RETENTION_POLICY, type RetentionPolicy } from '../shared/retention.ts';
import { showCourse } from './self-test-course.ts';

type Harness = {
  control: BrowserWindow;
  listDisplays(): Promise<DisplayChoice[]>;
  start(sourceId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  end(reason: string): void;
  session(): { overlay: BrowserWindow; ignoring: boolean; doc: { id: string } } | null;
  listInk(): { sessions: DesktopInkSummary[]; unreadable: number };
  openInk(id: string): { ok: true } | { ok: false; reason: string } | Promise<{ ok: true } | { ok: false; reason: string }>;
  /** How the last session ended. */
  lastEnd(): string | null;
  recoveries(): unknown[];
  retryRecovery(id: string): { ok: true; saved_as: string } | { ok: false; reason: string };
  exportRecovery(id: string, file: string): { ok: true } | { ok: false; reason: string };
  inkContexts(id: string): { ok: true; items: unknown[]; not_shown: number } | { ok: false; reason: string };
  setRetentionPolicy(p: RetentionPolicy): void;
  reportPath: string;
};
type Kept = { id: string; revision: number; strokes: number; reason: string; exported_to: string | null };
type ContextItem = { stroke: number; reason: string; frame_seq: number; picture: string | null; picture_state: string };
type OverlayState = {
  mode: string;
  tool: string;
  placement: string;
  mouseWrites: boolean;
  interactive: boolean;
  ended: boolean;
  endReason: string;
  doc: { id: string; revision: number; visible: string[]; history: string[]; strokes: number };
  aligned: Record<string, 'verified' | 'changed' | 'unknown'>;
  unsaved: string | null;
  samples: Array<{ seq: number; state: string; gap_ms: number | null; raw: { width: number; height: number; change: number | null; pixels_sha256: string; presented_frames: number; stream_presented_frames: number; frame_age_ms: number } | null; composed: { ink_revision: number; visible_strokes: number; ink_marks: { verified: number; changed: number; unknown: number; following_content: number }; transformation: string; pixels_sha256: string } | null }>;
  pinned: number;
  pendingImages: number;
  retention: { retained: number; refused: number; lastRefusal: string; deferred: number };
  gesture: { kind: string; points: number; contexts: Array<{ seq: number; reason: string; from_point: number }> } | null;
  frame: number | null;
  card: { text: string; image: boolean } | null;
  saveText: string;
  hint: string;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const overlays = (): BrowserWindow[] => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && /overlay/.test(w.getTitle()));
/** The RGBA pixel at the centre of a stored PNG. */
function centrePixel(file: string): number[] | null {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const bgra = img.toBitmap();
  const i = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  return [bgra[i + 2]!, bgra[i + 1]!, bgra[i]!, bgra[i + 3]!];
}

export async function runSelfTest(h: Harness): Promise<void> {
  const report: Record<string, unknown> = { kind: 'lc-windows-selftest/v1', started_at: new Date().toISOString(), electron: process.versions.electron, chrome: process.versions.chrome, os: `Windows ${release()}` };
  const checks: Array<{ id: string; description: string; pass: boolean; observed: unknown }> = [];
  const check = (id: string, description: string, pass: boolean, observed: unknown): void => void checks.push({ id, description, pass: Boolean(pass), observed });
  const dir = dirname(h.reportPath);
  mkdirSync(dir, { recursive: true });
  const shot = async (win: BrowserWindow, name: string): Promise<void> => writeFileSync(join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  // The chooser's display thumbnails show the user's screen: remove them and let a frame paint before this
  // app's own screenshot of the control window.
  const shotControl = async (name: string): Promise<void> => {
    await h.control.webContents.executeJavaScript(`for (const i of document.querySelectorAll('#displays img')) i.remove(); Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 500))])`);
    await sleep(200);
    await shot(h.control, name);
  };
  let probe: BrowserWindow | null = null;
  try {
    const displays = await h.listDisplays();
    const primary = displays.find((d) => d.primary) ?? displays[0];
    report['displays'] = displays.map(({ thumbnail: _t, ...d }) => d);
    if (!primary) throw new Error('no display can be captured');
    const b = primary.bounds;

    // The probe: known green, changing, above other windows (the overlay is left out of the capture anyway).
    // It keeps painting while the overlay covers it (without this, Windows can pause a covered window's rendering).
    probe = new BrowserWindow({ x: b.x + 40, y: b.y + 300, width: 360, height: 220, frame: false, show: false, skipTaskbar: true, focusable: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    probe.setAlwaysOnTop(true, 'screen-saver'); // above other always-on-top windows the desktop may have
    await probe.loadURL('app://bundle/apps/windows/src/renderer/probe.html');
    probe.showInactive();
    probe.moveTop();
    await sleep(500);

    const started = await h.start(primary.source_id);
    check('session.start', 'Start on the chosen display opens the overlay on it and begins the capture', started.ok, started);
    const s = h.session();
    if (!s) throw new Error('no session');
    const overlay = s.overlay;
    const state = async (): Promise<OverlayState> => {
      if (overlay.isDestroyed()) throw new Error(`the session ended: ${h.lastEnd() ?? 'no reason recorded'}`);
      return overlay.webContents.executeJavaScript('__lcOverlay.state()') as Promise<OverlayState>;
    };
    const pixel = async (which: 'raw' | 'composed', x: number, y: number): Promise<number[] | null> => overlay.webContents.executeJavaScript(`__lcOverlay.pixel(${JSON.stringify(which)}, ${x}, ${y})`) as Promise<number[] | null>;
    const until = async (what: string, ok: (st: OverlayState) => boolean, ms = 8000): Promise<OverlayState> => {
      const stop = Date.now() + ms;
      for (;;) {
        const st = await state();
        if (ok(st)) return st;
        if (Date.now() > stop) throw new Error(`timed out waiting for ${what}: ${JSON.stringify({ visible: st.doc.visible.length, saveText: st.saveText, unsaved: st.unsaved, pinned: st.pinned, pendingImages: st.pendingImages, hint: st.hint })}`);
        await sleep(150);
      }
    };
    const first = await until('three raw frames', (st) => st.samples.filter((x) => x.raw).length >= 3);
    const ob = overlay.getBounds();
    check('overlay.covers_display', 'the overlay covers the whole chosen display, taskbar included', ob.x === b.x && ob.y === b.y && ob.width === b.width && ob.height === b.height, { overlay: ob, display: b });
    const withRaw = first.samples.filter((x) => x.raw);
    const f = withRaw.at(-1)!.raw!;
    check('capture.frames', 'actual whole-display frames arrive at the display size times its scale', Math.abs(f.width - b.width * primary.scale_factor) <= 2 && Math.abs(f.height - b.height * primary.scale_factor) <= 2, { frame: [f.width, f.height], display: [b.width, b.height], scale: primary.scale_factor });
    await sleep(2200);
    const later = await state();
    const changing = later.samples.filter((x) => (x.raw?.change ?? 0) > 0);
    const distinct = new Set(later.samples.flatMap((x) => (x.raw ? [x.raw.pixels_sha256] : []))).size;
    check('capture.changing', 'the captured display changes between samples (the probe counter): fresh frames with different pixels, without any further selection', changing.length > 0 && distinct > 1 && later.samples.some((x) => x.state === 'fresh'),
      { distinct_raw_pixels: distinct, samples: later.samples.map((x) => ({ seq: x.seq, state: x.state, change: x.raw?.change ?? null })) });
    check('capture.held_frame_facts', "each sample reports the held image's own frame count and age apart from the stream's progress (a consistency check; the unit test covers frames arriving during hashing)", later.samples.every((x) => !x.raw || (x.raw.presented_frames <= x.raw.stream_presented_frames && x.raw.frame_age_ms >= 0)) && later.samples.some((x) => x.raw),
      { samples: later.samples.map((x) => x.raw && { seq: x.seq, held: x.raw.presented_frames, stream: x.raw.stream_presented_frames, age_ms: x.raw.frame_age_ms }) });
    check('nav.click_through', 'NAV (default) passes clicks through: the overlay window ignores mouse input and is not interactive', later.mode === 'NAV' && h.session()?.ignoring === true && later.interactive === false, { mode: later.mode, ignoring: h.session()?.ignoring, interactive: later.interactive });

    // Window-scoped input (DevTools): never the user's cursor.
    const dbg = overlay.webContents.debugger;
    dbg.attach('1.3');
    const mouse = (type: string, x: number, y: number, pointerType = 'mouse', buttons = 1): Promise<unknown> =>
      dbg.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && buttons === 0 ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: 1, pointerType, ...(pointerType === 'pen' ? { force: 0.5 } : {}) });
    const click = async (selector: string): Promise<void> => {
      const r = (await overlay.webContents.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number };
      await mouse('mouseMoved', r.x, r.y, 'mouse', 0);
      await mouse('mousePressed', r.x, r.y);
      await mouse('mouseReleased', r.x, r.y);
      await sleep(150);
    };
    const drag = async (pts: Array<[number, number]>, pointerType = 'mouse'): Promise<void> => {
      await mouse('mouseMoved', pts[0]![0], pts[0]![1], pointerType, 0);
      await mouse('mousePressed', pts[0]![0], pts[0]![1], pointerType);
      for (const [x, y] of pts.slice(1)) await mouse('mouseMoved', x, y, pointerType);
      await mouse('mouseReleased', pts.at(-1)![0], pts.at(-1)![1], pointerType);
      await sleep(250);
    };
    const across = (y: number, x0 = 80, x1 = 320, n = 8): Array<[number, number]> => Array.from({ length: n + 1 }, (_, k) => [x0 + ((x1 - x0) * k) / n, y]);
    // Overlay coordinates are display DIP; the probe occupies x 40..400, y 300..520.

    await click('[data-mode="WRITE"]');
    let st = await state();
    check('write.mode', 'WRITE makes the overlay take pointer input', st.mode === 'WRITE' && h.session()?.ignoring === false, { mode: st.mode, ignoring: h.session()?.ignoring });
    await drag(across(340));
    st = await state();
    check('write.mouse_off_by_default', 'with mouse writing off, a mouse drag in WRITE draws nothing and says why', st.doc.visible.length === 0 && /Mouse writing is off/.test(st.hint), { visible: st.doc.visible.length, hint: st.hint });
    await click('#mouse');
    await drag(across(360));
    await drag(across(420), 'pen');
    st = await until('two strokes saved', (x) => x.doc.visible.length === 2 && /Saved on this device/.test(x.saveText));
    check('write.mouse_and_pen', 'after turning mouse writing on, a mouse stroke and a pen stroke are ink, saved on this device', st.doc.history.join(',') === 'add,add', { history: st.doc.history, saveText: st.saveText });
    await sleep(1300); // the next sample composes the new ink
    const rawAt = await pixel('raw', 200, 420);
    const composedAt = await pixel('composed', 200, 420);
    const rawBeside = await pixel('raw', 200, 480);
    const composedBeside = await pixel('composed', 200, 480);
    // The probe is #00c853; the captured video path shifts colour a little (observed about 90,197,97).
    const green = (p: number[] | null): boolean => p !== null && p[1]! > 130 && p[1]! - p[0]! > 60 && p[1]! - p[2]! > 60;
    const purple = (p: number[] | null): boolean => p !== null && Math.abs(p[0]! - 110) < 45 && Math.abs(p[1]! - 63) < 45 && Math.abs(p[2]! - 209) < 45;
    check('capture.overlay_excluded_ink_once', 'the raw frame under the pen stroke shows the probe (the overlay is excluded from capture), the composed frame shows the ink there once, and away from ink both agree',
      green(rawAt) && purple(composedAt) && green(rawBeside) && JSON.stringify(rawBeside) === JSON.stringify(composedBeside), { rawAt, composedAt, rawBeside, composedBeside });
    const all = (await state()).samples;
    const composedSample = all.at(-1)!;
    report['sample_example'] = composedSample; // an actual emitted sample: facts and hashes, no pixels
    const noInk = all.filter((x) => x.raw && x.composed && x.composed.visible_strokes === 0);
    const marks = composedSample.composed?.ink_marks;
    check('capture.composed_pinned', 'each sample keeps the raw frame and a composed frame pinned to the ink revision (with how each stroke is drawn): with ink they differ, with no visible ink the composed pixels equal the raw pixels',
      composedSample.raw !== null && composedSample.composed?.ink_revision === st.doc.revision && composedSample.composed.pixels_sha256 !== composedSample.raw.pixels_sha256 && noInk.length > 0 && noInk.every((x) => x.composed!.pixels_sha256 === x.raw!.pixels_sha256) &&
        marks !== undefined && marks.verified + marks.changed + marks.unknown + marks.following_content === composedSample.composed.visible_strokes,
      { last: { raw: composedSample.raw?.pixels_sha256.slice(0, 12), composed: composedSample.composed && { ...composedSample.composed, pixels_sha256: composedSample.composed.pixels_sha256.slice(0, 12) } }, no_ink_samples: noInk.map((x) => ({ seq: x.seq, equal: x.composed!.pixels_sha256 === x.raw!.pixels_sha256 })) });

    await click('#eraser');
    await drag([[200, 330], [200, 350], [200, 370], [200, 390]]);
    st = await state();
    check('write.partial_erase', 'the eraser across the mouse stroke leaves two pieces and keeps the original (history erase)', st.doc.history.at(-1) === 'erase' && st.doc.visible.length === 3 && st.doc.strokes === 4, { history: st.doc.history, visible: st.doc.visible.length, strokes: st.doc.strokes });
    await click('#undo');
    const undone = await state();
    await click('#redo');
    const redone = await state();
    check('write.undo_redo', 'undo restores the whole stroke; redo erases it again', undone.doc.visible.length === 2 && redone.doc.visible.length === 3, { undone: undone.doc.visible.length, redone: redone.doc.visible.length });
    await click('#pen');
    await click('#placement');
    await drag(across(460), 'pen');
    st = await state();
    check('write.content_placement_labelled', 'the content-following placement is stated as not established on the desktop, its ink is kept where written and is drawn as not verified', st.placement === 'content' && /following content is not established/.test(st.hint) && /set to follow content, dashed/.test(st.hint), { placement: st.placement, hint: st.hint });
    await click('#placement');

    await click('[data-mode="ASK"]');
    await drag([[60, 310], [380, 310], [380, 510], [60, 510], [62, 312]]);
    st = await until('the selection card', (x) => x.card !== null);
    check('ask.finish_returns_write', 'an ASK circle shows the selected composed pixels with "No AI is connected", and WRITE returns', st.card?.image === true && /No AI is connected/.test(st.card.text) && st.mode === 'WRITE', { card: st.card, mode: st.mode });
    await click('#close');
    await click('[data-mode="ASK"]');
    const asking = await state();
    await click('#cancel');
    st = await state();
    check('ask.cancel_returns_write', 'Cancel in ASK returns to WRITE', asking.mode === 'ASK' && st.mode === 'WRITE', { asking: asking.mode, after: st.mode });
    await drag(across(500), 'pen');
    st = await until('the fifth visible stroke saved', (x) => x.doc.visible.length === 5 && /Saved on this device/.test(x.saveText));
    check('write.continue_after_ask', 'writing continues after ASK and every change is saved', st.doc.visible.length === 5, { history: st.doc.history });
    const before = { id: st.doc.id, history: st.doc.history, visible: st.doc.visible };
    await shot(overlay, 'windows-selftest-overlay');
    await shotControl('windows-selftest-control');
    const listed = h.listInk().sessions.find((x) => x.id === before.id);
    const file = JSON.parse(readFileSync(join(app.getPath('userData'), 'ink', `${before.id}.json`), 'utf8')) as { ink: { history: Array<{ op: string }> } };
    check('save.on_disk', 'the saved file holds the same history', file.ink.history.map((o) => o.op).join(',') === before.history.join(',') && listed?.strokes === 5, { listed, file: file.ink.history.map((o) => o.op) });

    // Stop, start again at once, reopen the saved ink and keep editing.
    dbg.detach();
    h.end('stopped by the self-test');
    const stoppedAt = Date.now();
    while (h.session() !== null && Date.now() - stoppedAt < 6000) await sleep(50);
    check('stop.ends', 'Stop ends the session: the overlay is gone and nothing is captured', h.session() === null && overlay.isDestroyed(), { session: h.session() !== null, destroyed: overlay.isDestroyed(), ms: Date.now() - stoppedAt });
    const again = await h.start(primary.source_id);
    const s2 = h.session();
    if (!again.ok || !s2) throw new Error('restart failed');
    const state2 = async (): Promise<OverlayState> => {
      if (s2.overlay.isDestroyed()) throw new Error(`the second session ended: ${h.lastEnd() ?? 'no reason recorded'}`);
      return s2.overlay.webContents.executeJavaScript('__lcOverlay.state()') as Promise<OverlayState>;
    };
    await sleep(Math.max(1500, stoppedAt + 10400 - Date.now())); // past the earlier Stop's 10 s bound
    check('stop.restart_at_once', 'Start right after Stop gives a session that the earlier Stop (whose 10 s bound has passed) does not end', h.session() === s2 && !s2.overlay.isDestroyed() && Date.now() - stoppedAt > 10000, { restarted_after_ms: 'immediately after the overlay closed', waited_ms: Date.now() - stoppedAt, alive: h.session() === s2 });
    const opened = await h.openInk(before.id);
    await sleep(1500);
    let r = await state2();
    check('reopen.same_ink', 'the saved ink reopens over the new session with the same strokes and history, verified where the pixels under it are unchanged', opened.ok && r.doc.id === before.id && r.doc.visible.join() === before.visible.join() && Object.values(r.aligned).includes('verified'),
      { opened, visible: r.doc.visible.length, history: r.doc.history, aligned: r.aligned });
    const dbg2 = s2.overlay.webContents.debugger;
    dbg2.attach('1.3');
    const click2 = async (selector: string): Promise<void> => {
      const p = (await s2.overlay.webContents.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number };
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await dbg2.sendCommand('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
      await sleep(150);
    };
    const until2 = async (what: string, ok: (st: OverlayState) => boolean, ms = 8000): Promise<OverlayState> => {
      const stop = Date.now() + ms;
      for (;;) {
        const st2 = await state2();
        if (ok(st2)) return st2;
        if (Date.now() > stop) throw new Error(`timed out waiting for ${what}: ${JSON.stringify({ visible: st2.doc.visible.length, saveText: st2.saveText, unsaved: st2.unsaved, pinned: st2.pinned, pendingImages: st2.pendingImages, gesture: st2.gesture, frame: st2.frame, last_samples: st2.samples.slice(-4).map((x) => ({ seq: x.seq, state: x.state, gap: x.gap_ms })), retention: st2.retention, raw_at_150_440: await s2.overlay.webContents.executeJavaScript('__lcOverlay.pixel("raw", 150, 440)'), debug: await s2.overlay.webContents.executeJavaScript('__lcOverlay.debug?.()') })}`);
        await sleep(150);
      }
    };
    await click2('[data-mode="WRITE"]');
    await click2('#undo');
    await sleep(600);
    r = await state2();
    check('reopen.continue_editing', 'undo continues the reopened history and is saved to the same file', r.doc.history.at(-1) === 'undo' && r.doc.visible.length === 4 && h.listInk().sessions.find((x) => x.id === before.id)?.strokes === 4, { history: r.doc.history, visible: r.doc.visible.length });

    // The stored file becomes unreadable (another program damaged it): the next change leaves it untouched
    // and saves the whole ink as a separate copy.
    const storedPath = join(app.getPath('userData'), 'ink', `${before.id}.json`);
    writeFileSync(storedPath, 'damaged by the self-test');
    await click2('#redo');
    r = await until2('the copy saved', (x) => x.doc.id !== before.id && /separate copy/.test(x.saveText));
    const copyPath = join(app.getPath('userData'), 'ink', `${r.doc.id}.json`);
    const copy = existsSync(copyPath) ? (JSON.parse(readFileSync(copyPath, 'utf8')) as { forked_from: string; ink: { history: Array<{ op: string }> } }) : null;
    const inkList = h.listInk();
    check('save.unreadable_kept_copy', 'an unreadable stored file is left untouched and the whole ink, with its history, is saved as a separate copy (the unchanged second session saved nothing of its own)', readFileSync(storedPath, 'utf8') === 'damaged by the self-test' && copy?.forked_from === before.id && copy.ink.history.map((o) => o.op).join(',') === r.doc.history.join(',') && r.unsaved === null && inkList.unreadable === 1 && inkList.sessions.length === 1 && inkList.sessions[0]?.id === r.doc.id,
      { copy: copy && { forked_from: copy.forked_from, history: copy.ink.history.map((o) => o.op) }, saveText: r.saveText, listed: inkList.sessions.map((x) => x.id === r.doc.id ? 'copy' : x.id === before.id ? 'original' : 'other'), unreadable: inkList.unreadable });

    // A stroke begun right after the display changed, continued after what is under it changed, and held
    // still while it changed again: its context is the frame of the moment it began (not an older sample, not
    // the frame at its end), the change is one separate context (replaced, not duplicated, while nothing was
    // written), and both pictures are the actual pixels, saved with the ink.
    const look = (a: string, b: string): Promise<unknown> =>
      probe!.webContents.executeJavaScript(`for (const el of [document.documentElement, document.body]) el.style.background = 'repeating-conic-gradient(${a} 0% 25%, ${b} 0% 50%) 0 0 / 20px 20px'; 0`);
    const orange = (p: number[] | null): boolean => p !== null && p[0]! > 170 && p[1]! > 50 && p[1]! < 175 && p[2]! < 100;
    const blue = (p: number[] | null): boolean => p !== null && p[2]! > 150 && p[0]! < 110;
    const pen2 = (type: string, x: number, y: number): Promise<unknown> =>
      dbg2.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
    // Right after a regular sample, the display changes; the pen goes down before the next regular sample is
    // due, so only the sample taken at pen-down can hold the new content (tried again if a regular one came).
    let seqBefore = -1;
    let seqAtPenDown = -2;
    for (let attempt = 0; attempt < 4 && seqAtPenDown !== seqBefore; attempt++) {
      const s0 = (await state2()).samples.at(-1)?.seq ?? 0;
      seqBefore = (await until2('a fresh sample', (x) => (x.samples.at(-1)?.seq ?? 0) > s0, 3000)).samples.at(-1)!.seq;
      await look(attempt % 2 ? '#ffa726' : '#ff9100', attempt % 2 ? '#ef6c00' : '#e65100');
      await sleep(650); // capture latency: the change reaches the delivered frames
      seqAtPenDown = (await state2()).samples.at(-1)!.seq;
    }
    await pen2('mousePressed', 80, 440);
    const began = await until2('the starting context pinned', (x) => (x.gesture?.contexts.length ?? 0) >= 1, 4000);
    const startFrame = began.gesture?.contexts[0]?.seq ?? null;
    for (let x = 95; x <= 200; x += 15) await pen2('mouseMoved', x, 440);
    await look('#d50000', '#b71c1c');
    const during = await until2('a context for the change while writing', (x) => (x.gesture?.contexts.length ?? 0) >= 2, 6000);
    await look('#2962ff', '#0039cb');
    const still = await until2('the held-still change replacing it', (x) => (x.gesture?.contexts[1]?.seq ?? 0) > (during.gesture?.contexts[1]?.seq ?? 0), 6000);
    for (let x = 215; x <= 320; x += 15) await pen2('mouseMoved', x, 440);
    const endFrame = (await state2()).frame;
    await pen2('mouseReleased', 320, 440);
    r = await until2('the stroke and its pictures saved', (x) => x.gesture === null && x.pendingImages === 0 && x.pinned === 0 && /Saved/.test(x.saveText));
    const strokeId = r.doc.visible.at(-1)!;
    const saved = JSON.parse(readFileSync(join(app.getPath('userData'), 'ink', `${r.doc.id}.json`), 'utf8')) as DesktopInk;
    const ev = saved.evidence[strokeId];
    const pictureFile = (sha: string): string => join(app.getPath('userData'), 'ink', 'context', `${sha}.png`);
    const firstPixel = ev?.contexts[0]?.image ? centrePixel(pictureFile(ev.contexts[0].image.sha256)) : null;
    const secondPixel = ev?.contexts[1]?.image ? centrePixel(pictureFile(ev.contexts[1].image.sha256)) : null;
    check('context.pinned_at_start', 'a stroke keeps the frame of the moment it began (sampled then, as the display had just changed; not the frame when it ended); a change while writing is one separate context, replaced while the pen was held still; both pictures are the actual pixels, saved with the ink',
      seqAtPenDown === seqBefore && startFrame !== null && startFrame > seqBefore && ev?.frame_seq === startFrame && ev.contexts[0]?.frame_seq === startFrame && startFrame !== endFrame && ev.contexts.length === 2 && ev.contexts[1]!.reason === 'changed_while_writing' && ev.contexts[1]!.frame_seq === still.gesture?.contexts[1]?.seq && ev.contexts[1]!.from_point > 0 &&
        orange(firstPixel) && blue(secondPixel) && r.pinned === 0 && r.unsaved === null,
      { last_sample_before_pen_down: seqBefore, regular_sample_between: seqAtPenDown !== seqBefore, start_frame: startFrame, end_frame: endFrame, during: during.gesture?.contexts, held_still: still.gesture?.contexts, saved: ev && { frame_seq: ev.frame_seq, contexts: ev.contexts.map((c) => ({ reason: c.reason, from_point: c.from_point, frame_seq: c.frame_seq, image: c.image && { ...c.image, sha256: c.image.sha256.slice(0, 12) }, not_observed: c.not_observed })) }, first_centre: firstPixel, second_centre: secondPixel });
    const reopened = h.inkContexts(r.doc.id);
    const items = (reopened.ok ? reopened.items : []) as ContextItem[];
    const ofStroke = items.filter((x) => x.stroke === Math.max(...items.map((y) => y.stroke)));
    check('context.pictures_reopen', 'the saved pictures reopen from this device, checked against their SHA-256', reopened.ok && ofStroke.length >= 2 && ofStroke.every((x) => x.picture?.startsWith('data:image/png;base64,')) && items.every((x) => x.picture_state === 'shown'),
      { items: items.map((x) => ({ stroke: x.stroke, reason: x.reason, frame_seq: x.frame_seq, state: x.picture_state })) });
    await probe.webContents.executeJavaScript(`for (const el of [document.documentElement, document.body]) el.style.background = ''; 0`);

    probe.destroy();
    probe = null;
    await sleep(2600);
    r = await state2();
    check('alignment.pixels_changed', 'after the probe under the ink is gone, the ink over it is shown as changed (dashed); nothing is moved', Object.values(r.aligned).includes('changed') && !Object.values(r.aligned).includes('verified') && r.doc.visible.length === 6, { aligned: r.aligned });
    const uncertain = r.samples.at(-1)?.composed;
    check('capture.composed_keeps_uncertainty', 'the composed frame draws not-verified ink dashed as on screen and says so; its marks count every visible stroke as not verified',
      uncertain !== null && uncertain !== undefined && uncertain.ink_marks.verified === 0 && uncertain.ink_marks.changed + uncertain.ink_marks.unknown + uncertain.ink_marks.following_content === r.doc.visible.length && /dashed as on screen/.test(uncertain.transformation),
      { ink_marks: uncertain?.ink_marks, visible: r.doc.visible.length });
    await click2('[data-mode="ASK"]');
    for (const [i, [x, y]] of ([[60, 310], [380, 310], [380, 510], [60, 510], [62, 312]] as Array<[number, number]>).entries()) {
      await dbg2.sendCommand('Input.dispatchMouseEvent', { type: i === 0 ? 'mousePressed' : 'mouseMoved', x, y, button: 'left', buttons: 1, clickCount: 1 });
    }
    await dbg2.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 62, y: 312, button: 'left', buttons: 0, clickCount: 1 });
    r = await until2('the selection card', (x) => x.card !== null);
    check('ask.keeps_uncertainty', 'the ASK selection shows the dashed ink as on screen and says its alignment is not verified', r.card?.image === true && /drawn dashed, as on screen/.test(r.card.text) && r.mode === 'WRITE', { card: r.card?.text });
    await click2('#close');
    // A change, then a stroke is still being written (pen down, not lifted) when the overlay window is closed
    // at once (as with Alt+F4): the session ends the normal way, and what was written is kept and saved.
    await click2('#undo');
    const beforeClose = await state2();
    const lastId = beforeClose.doc.id;
    await pen2('mousePressed', 80, 470);
    for (const x of [120, 160, 200]) await pen2('mouseMoved', x, 470);
    const midStroke = await state2();
    dbg2.detach();
    s2.overlay.close();
    const closedAt = Date.now();
    while (h.session() !== null && Date.now() - closedAt < 12000) await sleep(50);
    const kept = JSON.parse(readFileSync(join(app.getPath('userData'), 'ink', `${lastId}.json`), 'utf8')) as DesktopInk;
    const lastStroke = kept.ink.strokes[kept.ink.visible.at(-1) ?? ''];
    check('stop.overlay_close_saves', 'closing the overlay window ends capture the normal way; the change made just before is saved, and a stroke still being written keeps its written points and context',
      h.session() === null && s2.overlay.isDestroyed() && /overlay window was closed/.test(h.lastEnd() ?? '') && !/did not confirm/.test(h.lastEnd() ?? '') && kept.ink.history.map((o) => o.op).slice(-2).join() === 'undo,add' && midStroke.gesture !== null && (lastStroke?.points.length ?? 0) >= midStroke.gesture.points && (kept.evidence[lastStroke?.id ?? '']?.contexts.length ?? 0) >= 1,
      { session: h.session() !== null, ended: h.lastEnd(), saved_last_ops: kept.ink.history.map((o) => o.op).slice(-2), points_seen: midStroke.gesture?.points, points_saved: lastStroke?.points.length, contexts: kept.evidence[lastStroke?.id ?? '']?.contexts.length ?? null, ms: Date.now() - closedAt });

    // Writing to this device keeps failing (the ink folder is replaced by a file): the newest ink is kept in
    // the app through Stop and close, can be exported, and is written by Retry once the folder is back.
    const again3 = await h.start(primary.source_id);
    const s3 = h.session();
    if (!again3.ok || !s3) throw new Error('third start failed');
    const state3 = async (): Promise<OverlayState> => {
      if (s3.overlay.isDestroyed()) throw new Error(`the third session ended: ${h.lastEnd() ?? 'no reason recorded'}`);
      return s3.overlay.webContents.executeJavaScript('__lcOverlay.state()') as Promise<OverlayState>;
    };
    await sleep(1500);
    await h.openInk(lastId);
    const dbg3 = s3.overlay.webContents.debugger;
    dbg3.attach('1.3');
    const input3 = (type: string, x: number, y: number, pointerType = 'mouse'): Promise<unknown> =>
      dbg3.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType, ...(pointerType === 'pen' ? { force: 0.5 } : {}) });
    const write3 = (await s3.overlay.webContents.executeJavaScript(`(() => { const r = document.querySelector('[data-mode="WRITE"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number };
    await input3('mousePressed', write3.x, write3.y);
    await input3('mouseReleased', write3.x, write3.y);
    await sleep(200);
    const inkPath = join(app.getPath('userData'), 'ink');
    renameSync(inkPath, `${inkPath}.held`);
    writeFileSync(inkPath, 'the ink folder is blocked by the self-test');
    await input3('mousePressed', 80, 380, 'pen');
    for (const x of [120, 160, 200, 240]) await input3('mouseMoved', x, 380, 'pen');
    await input3('mouseReleased', 240, 380, 'pen');
    let r3: OverlayState | null = null;
    for (let i = 0; i < 60 && !(r3 && r3.unsaved !== null); i++) {
      await sleep(150);
      r3 = await state3();
    }
    const keptNow = (h.recoveries() as Kept[]).find((k) => k.id === r3?.doc.id);
    check('save.failure_reported_and_kept', 'when writing fails, the overlay says Not saved and the newest ink (with its pictures) is kept in the app, not only in the overlay', r3 !== null && r3.unsaved !== null && /Not saved/.test(r3.saveText) && keptNow?.revision === r3.doc.revision,
      { unsaved: r3?.unsaved, kept: keptNow && { revision: keptNow.revision, strokes: keptNow.strokes }, overlay_revision: r3?.doc.revision });
    // Another stroke is still being written when the overlay is closed, while writing keeps failing.
    await input3('mousePressed', 80, 400, 'pen');
    for (const x of [120, 160, 200]) await input3('mouseMoved', x, 400, 'pen');
    dbg3.detach();
    s3.overlay.close();
    const closed3 = Date.now();
    while (h.session() !== null && Date.now() - closed3 < 12000) await sleep(50);
    const keptAfter = (h.recoveries() as Kept[]).find((k) => k.id === r3?.doc.id);
    check('save.failure_survives_close', 'closing the overlay ends capture at once; the unsaved ink, including the stroke still being written, stays kept and the control window says so',
      h.session() === null && s3.overlay.isDestroyed() && keptAfter?.revision === (r3?.doc.revision ?? 0) + 1 && keptAfter.strokes === (r3?.doc.visible.length ?? 0) + 1 && /kept in this app/.test(h.lastEnd() ?? ''),
      { session: h.session() !== null, ended: h.lastEnd(), kept_revision: keptAfter?.revision, revision_before_stroke: r3?.doc.revision, kept_strokes: keptAfter?.strokes });
    h.control.close();
    await sleep(400);
    check('app.close_held_while_unsaved', 'closing the app while unsaved, unexported ink is kept does not drop it: the app stays open for the user\'s choice', !h.control.isDestroyed() && (h.recoveries() as Kept[]).length === 1, { control_open: !h.control.isDestroyed() });
    await shotControl('windows-selftest-control-kept');
    const startDuringClose = h.start(primary.source_id);
    h.control.close();
    const startResult = await startDuringClose;
    await sleep(300);
    check('start.cancelled_by_app_close', 'closing the app while a Start lists displays cancels it (no overlay), and kept ink still holds the app open', !startResult.ok && h.session() === null && overlays().length === 0 && !h.control.isDestroyed() && (h.recoveries() as Kept[]).length === 1,
      { result: startResult, overlays: overlays().length, control_open: !h.control.isDestroyed() });
    const exportPath = join(app.getPath('userData'), 'exported-ink.json');
    const exported = h.exportRecovery(r3!.doc.id, exportPath);
    const payload = existsSync(exportPath) ? (JSON.parse(readFileSync(exportPath, 'utf8')) as { format: string; ink: DesktopInk; context_pictures_png_base64: Record<string, string>; context_pictures_missing: string[] }) : null;
    const pictures = payload ? Object.values(payload.context_pictures_png_base64) : [];
    // The pictures of the unsaved stroke are kept with the ink; earlier ones are read from the store, which
    // is blocked here, so the export lists them as missing instead of pretending.
    const keptShas = payload ? contextImages(payload.ink).filter((sha) => !payload.context_pictures_missing.includes(sha)) : [];
    check('save.export_kept_ink', 'Export writes the kept ink and every picture it can read into one chosen file (the unsaved stroke\'s pictures included); pictures it cannot read are listed as missing',
      exported.ok && payload?.format === 'lc-desktop-ink-export/v1' && payload.ink.ink.revision === r3!.doc.revision + 1 && pictures.length + payload.context_pictures_missing.length === contextImages(payload.ink).length && keptShas.length >= 1 && pictures.every((b64) => Buffer.from(b64, 'base64').subarray(0, 4).toString('hex') === '89504e47'),
      { exported, revision: payload?.ink.ink.revision, pictures: pictures.length, missing_while_store_blocked: payload?.context_pictures_missing.length });
    rmSync(inkPath, { force: true });
    renameSync(`${inkPath}.held`, inkPath);
    const retried = h.retryRecovery(r3!.doc.id);
    const written = retried.ok ? (JSON.parse(readFileSync(join(inkPath, `${retried.saved_as}.json`), 'utf8')) as DesktopInk) : null;
    check('save.retry_after_failure', 'once the folder is back, Retry writes the kept ink and its pictures; nothing stays kept', retried.ok && written?.ink.revision === r3!.doc.revision + 1 && contextImages(written).every((sha) => existsSync(join(inkPath, 'context', `${sha}.png`))) && (h.recoveries() as Kept[]).length === 0,
      { retried, revision: written?.ink.revision, kept: (h.recoveries() as Kept[]).length });

    // Start is one at a time, and Stop during a Start cancels it without leaving an overlay behind.
    const both = await Promise.all([h.start(primary.source_id), h.start(primary.source_id)]);
    const liveAfterBoth = overlays().length;
    check('start.one_at_a_time', 'two Starts at once give one session and one overlay; the other is refused', both.filter((x) => x.ok).length === 1 && liveAfterBoth === 1 && h.session() !== null, { results: both, overlays: liveAfterBoth });
    h.end('stopped by the self-test');
    const stop4 = Date.now();
    while (h.session() !== null && Date.now() - stop4 < 7000) await sleep(50);
    const pendingStart = h.start(primary.source_id);
    h.end('stopped by the self-test while starting');
    const cancelled = await pendingStart;
    await sleep(300);
    check('start.stop_cancels', 'Stop while a Start is still listing displays cancels it: no session, no overlay', !cancelled.ok && h.session() === null && overlays().length === 0, { result: cancelled, overlays: overlays().length });

    // Whole-display retention, on test content only: a probe covers the whole display. Several visible
    // changes and ink are retained; a blocked frames folder and a small frame cap give refusals; then Stop.
    const full = new BrowserWindow({ ...b, frame: false, show: false, skipTaskbar: true, focusable: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    full.setAlwaysOnTop(true, 'screen-saver');
    await full.loadURL('app://bundle/apps/windows/src/renderer/probe.html');
    full.showInactive();
    full.setBounds(b);
    full.moveTop();
    const fullLook = (a: string, c: string): Promise<unknown> =>
      full.webContents.executeJavaScript(`for (const el of [document.documentElement, document.body]) el.style.background = 'repeating-conic-gradient(${a} 0% 25%, ${c} 0% 50%) 0 0 / 20px 20px'; 0`);
    await sleep(600);
    h.setRetentionPolicy({ ...DEFAULT_RETENTION_POLICY, max_frames: 5 });
    const started5 = await h.start(primary.source_id);
    const s5 = h.session();
    h.setRetentionPolicy(DEFAULT_RETENTION_POLICY);
    if (!started5.ok || !s5) throw new Error('the retention session did not start');
    const state5 = async (): Promise<OverlayState> => s5.overlay.webContents.executeJavaScript('__lcOverlay.state()') as Promise<OverlayState>;
    const until5 = async (what: string, ok: (x: OverlayState) => boolean, ms = 10000): Promise<OverlayState> => {
      const stop = Date.now() + ms;
      for (;;) {
        const x = await state5();
        if (ok(x)) return x;
        if (Date.now() > stop) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(x.retention)}`);
        await sleep(150);
      }
    };
    const retentionDir = join(app.getPath('userData'), 'captures', s5.doc.id);
    await until5('the first frame retained', (x) => x.retention.retained >= 1);
    await fullLook('#ff9100', '#e65100');
    await until5('the orange screen retained', (x) => x.retention.retained >= 2);
    const framesDir = join(retentionDir, 'frames');
    renameSync(framesDir, `${framesDir}.held`);
    writeFileSync(framesDir, 'the frames folder is blocked by the self-test');
    await fullLook('#2962ff', '#0039cb');
    const blocked = await until5('the blue screen refused (frames folder blocked)', (x) => x.retention.refused >= 1);
    rmSync(framesDir, { force: true });
    renameSync(`${framesDir}.held`, framesDir);
    await until5('the blue screen retained on the retry, once the folder is back', (x) => x.retention.retained >= 3);
    const dbg5 = s5.overlay.webContents.debugger;
    dbg5.attach('1.3');
    const input5 = (type: string, x: number, y: number, pointerType = 'mouse'): Promise<unknown> =>
      dbg5.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType, ...(pointerType === 'pen' ? { force: 0.5 } : {}) });
    const write5 = (await s5.overlay.webContents.executeJavaScript(`(() => { const r = document.querySelector('[data-mode="WRITE"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number };
    await input5('mousePressed', write5.x, write5.y);
    await input5('mouseReleased', write5.x, write5.y);
    await input5('mousePressed', 300, 500, 'pen');
    for (const x of [400, 500, 600, 700]) await input5('mouseMoved', x, 500, 'pen');
    await input5('mouseReleased', 700, 500, 'pen');
    await until5('the ink retained', (x) => x.retention.retained >= 4);
    await fullLook('#d50000', '#b71c1c');
    await until5('the red screen retained', (x) => x.retention.retained >= 5);
    await fullLook('#aa00ff', '#6200ea');
    const capped = await until5('the violet screen refused (cap of 5 frames)', (x) => x.retention.refused >= 2);
    dbg5.detach();
    h.end('stopped by the self-test');
    const stop5 = Date.now();
    while (h.session() !== null && Date.now() - stop5 < 12000) await sleep(50);
    full.destroy();
    // What was retained, read back from this device.
    const manifest = readFileSync(join(retentionDir, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    type FileFacts = { file: string; sha256: string; bytes: number; width: number; height: number; pixels_sha256: string };
    const retainedLines = manifest.filter((l) => l['kind'] === 'retained') as Array<Record<string, unknown> & { raw: FileFacts; composed: FileFacts & { ink_revision: number; visible_strokes: number; ink_marks: Record<string, number> } }>;
    const readBack = (f: FileFacts): { sha: boolean; bytes: boolean; size: boolean; rgba: boolean; decoded: string } => {
      const bytes = readFileSync(join(retentionDir, f.file));
      const img = nativeImage.createFromBuffer(bytes);
      const { width, height } = img.getSize();
      const bgra = img.toBitmap();
      const rgba = Buffer.alloc(bgra.length);
      for (let i = 0; i < bgra.length; i += 4) {
        rgba[i] = bgra[i + 2]!;
        rgba[i + 1] = bgra[i + 1]!;
        rgba[i + 2] = bgra[i]!;
        rgba[i + 3] = bgra[i + 3]!;
      }
      const decoded = createHash('sha256').update(rgba).digest('hex');
      return { sha: createHash('sha256').update(bytes).digest('hex') === f.sha256, bytes: bytes.length === f.bytes, size: width === f.width && height === f.height, rgba: decoded === f.pixels_sha256, decoded };
    };
    const checksOf = retainedLines.map((l) => ({ seq: l['sample_seq'], reason: l['reason'], raw: readBack(l.raw), composed: readBack(l.composed), ink: l.composed.visible_strokes }));
    const pixelAt = (f: FileFacts, x: number, y: number): number[] => {
      const img = nativeImage.createFromBuffer(readFileSync(join(retentionDir, f.file)));
      const { width } = img.getSize();
      const bgra = img.toBitmap();
      const i = (y * width + x) * 4;
      return [bgra[i + 2]!, bgra[i + 1]!, bgra[i]!];
    };
    const inkLine = retainedLines.find((l) => l['reason'] === 'ink');
    const scale = primary.scale_factor;
    const underInkRaw = inkLine ? pixelAt(inkLine.raw, Math.round(500 * scale), Math.round(500 * scale)) : null;
    const underInkComposed = inkLine ? pixelAt(inkLine.composed, Math.round(500 * scale), Math.round(500 * scale)) : null;
    const kinds = manifest.map((l) => l['kind']);
    check('retention.whole_display_frames', 'whole-display raw and composed PNGs of the material steps are retained with exact file hash, length and size; each decodes to exactly the pixels the sample hashed',
      retainedLines.map((l) => l['reason']).join() === 'first,changed,changed,ink,changed' && checksOf.every((c) => c.raw.sha && c.raw.bytes && c.raw.size && c.raw.rgba && c.composed.sha && c.composed.bytes && c.composed.size && c.composed.rgba) && retainedLines.every((l) => l.raw.width === b.width * scale && l.raw.height === b.height * scale),
      { retained: checksOf.map((c) => ({ seq: c.seq, reason: c.reason, ink: c.ink, raw: { sha: c.raw.sha, bytes: c.raw.bytes, size: c.raw.size, rgba: c.raw.rgba }, composed: { sha: c.composed.sha, bytes: c.composed.bytes, size: c.composed.size, rgba: c.composed.rgba } })) });
    check('retention.ink_composed_raw_apart', 'in the retained ink frame, the raw PNG under the stroke shows the screen (the overlay is not in it) and the composed PNG shows the ink, with its revision and marks',
      // The ink is written over the blue screen: raw is blue there; composed is the purple ink.
      inkLine !== undefined && underInkRaw !== null && underInkComposed !== null && underInkRaw[2]! > 150 && underInkRaw[0]! < 100 && Math.abs(underInkComposed[0]! - 110) < 45 && Math.abs(underInkComposed[1]! - 63) < 45 && Math.abs(underInkComposed[2]! - 209) < 45 && inkLine.composed.ink_revision >= 1 && inkLine.composed.visible_strokes >= 1,
      { raw_under_ink: underInkRaw, composed_under_ink: underInkComposed, revision: inkLine?.composed.ink_revision, marks: inkLine?.composed.ink_marks });
    check('retention.refusals_and_end', 'a blocked frames folder and the frame cap are refused and recorded (nothing retained is deleted), and the Stop is recorded as the end',
      blocked.retention.refused >= 1 && capped.retention.refused >= 2 && kinds[0] === 'header' && kinds.filter((k) => k === 'refused').length >= 2 && kinds.at(-1) === 'ended' && readdirSync(join(retentionDir, 'frames')).length >= 5 && h.session() === null,
      { kinds, refusals: manifest.filter((l) => l['kind'] === 'refused').map((l) => l['reason']), frames_on_disk: readdirSync(join(retentionDir, 'frames')).length });
    // The sample, for the evidence folder (test content only: the probe covered the display).
    cpSync(retentionDir, join(dir, 'windows-retention-sample'), { recursive: true });

    // Alignment over real text (QA-WIN-01): a probe covers the display with a page of body text. A narrow stroke
    // over one line and a large one over a paragraph are verified while the page is still; scrolled 300 DIP under
    // them, both are changed (whatever their 16×16 fingerprint says). Then other lines are scrolled exactly under
    // the narrow stroke, as in QA's run: each is changed, and how many the old 16×16 rule would have verified is
    // reported. Scrolled back, both are verified again.
    const text = new BrowserWindow({ ...b, frame: false, show: false, skipTaskbar: true, focusable: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    text.setAlwaysOnTop(true, 'screen-saver');
    await text.loadURL('app://bundle/apps/windows/src/renderer/probe.html');
    const sentences = [
      'The general solution is the sum of the complementary function and one particular integral of the equation.',
      'To find the complementary function, solve the auxiliary equation and write one exponential term for each root.',
      'When the roots are repeated, multiply the second term by x so that the two solutions stay independent.',
      'A particular integral is guessed from the form of the right-hand side and its unknown constants are then fixed.',
      'Finally, the initial conditions give the two arbitrary constants, and the answer can be checked by substitution.',
      'Complex roots give sines and cosines: the real part sets the growth, and the imaginary part sets the frequency.',
    ];
    await text.webContents.executeJavaScript(`(() => {
      const html = document.documentElement.style, body = document.body.style;
      Object.assign(html, { background: '#ffffff', height: 'auto', overflow: 'hidden' });
      Object.assign(body, { background: '#ffffff', height: 'auto', margin: '0', padding: '24px 40px', color: '#1a1a1a', font: '16px/24px "Segoe UI", sans-serif' });
      const sentences = ${JSON.stringify(sentences)};
      document.body.replaceChildren(...Array.from({ length: 90 }, (_, i) => {
        const d = document.createElement('div');
        d.style.margin = '0 0 12px';
        d.style.maxWidth = '900px';
        d.textContent = (i + 1) + '. ' + [0, 1, 2].map((k) => sentences[(i * 5 + k * 7) % sentences.length]).join(' ');
        return d;
      }));
      return 0;
    })()`);
    text.showInactive();
    text.setBounds(b);
    text.moveTop();
    await sleep(800);
    const started6 = await h.start(primary.source_id);
    const s6 = h.session();
    if (!started6.ok || !s6) throw new Error('the text alignment session did not start');
    type AlignmentFacts = Array<{ id: string; region: unknown; aligned: string; fingerprint_change: number | null; detail: { cols: number; rows: number; result: string; moved_cells: number; moved_at: number[][] } | null }>;
    const facts6 = async (): Promise<AlignmentFacts> => s6.overlay.webContents.executeJavaScript('__lcOverlay.alignment()') as Promise<AlignmentFacts>;
    const state6 = async (): Promise<OverlayState> => s6.overlay.webContents.executeJavaScript('__lcOverlay.state()') as Promise<OverlayState>;
    /** The overlay's state once `ok` holds, or its last state after `ms` (a check then reports what it saw). */
    const settle6 = async (ok: (x: OverlayState) => boolean, ms = 10000): Promise<OverlayState> => {
      const stop = Date.now() + ms;
      for (;;) {
        const x = await state6();
        if (ok(x) || Date.now() > stop) return x;
        await sleep(150);
      }
    };
    await settle6((x) => x.samples.filter((y) => y.raw).length >= 2);
    const dbg6 = s6.overlay.webContents.debugger;
    dbg6.attach('1.3');
    const pen6 = (type: string, x: number, y: number): Promise<unknown> =>
      dbg6.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
    const write6 = (await s6.overlay.webContents.executeJavaScript(`(() => { const r = document.querySelector('[data-mode="WRITE"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)) as { x: number; y: number };
    await dbg6.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: write6.x, y: write6.y, button: 'left', buttons: 1, clickCount: 1 });
    await dbg6.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: write6.x, y: write6.y, button: 'left', buttons: 0, clickCount: 1 });
    // A line of body text well below the toolbar, and a paragraph under it (display DIP; the probe fills the display).
    // The first line box of a paragraph (display DIP at scroll 0).
    const firstLine = (k: number): Promise<{ x: number; y: number; height: number }> =>
      text.webContents.executeJavaScript(`(() => { const range = document.createRange(); range.selectNodeContents(document.body.children[${k}]); const r = range.getClientRects()[0]; return { x: r.left, y: r.top + document.scrollingElement.scrollTop, height: r.height }; })()`) as Promise<{ x: number; y: number; height: number }>;
    const line = await firstLine(3);
    const ly = Math.round(line.y + line.height / 2);
    await pen6('mousePressed', line.x + 5, ly);
    for (let x = line.x + 25; x <= line.x + 190; x += 20) await pen6('mouseMoved', x, ly);
    await pen6('mouseReleased', line.x + 190, ly);
    const zig: Array<[number, number]> = [[line.x + 20, ly + 60], [line.x + 180, ly + 160], [line.x + 340, ly + 70], [line.x + 500, ly + 190]];
    await pen6('mousePressed', ...zig[0]!);
    for (const [x, y] of zig.slice(1)) await pen6('mouseMoved', x, y);
    await pen6('mouseReleased', ...zig.at(-1)!);
    const bothAre = (x: OverlayState, want: string): boolean => x.doc.visible.length === 2 && x.doc.visible.every((id) => x.aligned[id] === want);
    const textStill = await settle6((x) => bothAre(x, 'verified') && x.pendingImages === 0 && /Saved/.test(x.saveText));
    const stillFacts = await facts6();
    check('alignment.text_still_verified', 'ink over real body text (a narrow stroke over one line, a large one over a paragraph) is verified while the page is still, from its saved detail',
      bothAre(textStill, 'verified') && stillFacts.length === 2 && stillFacts.every((f) => f.detail !== null && f.detail.result !== 'changed'), { aligned: textStill.aligned, facts: stillFacts });
    const seqBeforeScroll = (await state6()).samples.at(-1)?.seq ?? 0;
    await text.webContents.executeJavaScript('document.scrollingElement.scrollTop = 300; 0');
    const scrolled = await settle6((x) => (x.samples.at(-1)?.seq ?? 0) > seqBeforeScroll + 1 && bothAre(x, 'changed'));
    const scrolledFacts = await facts6();
    const narrow = scrolledFacts[0];
    check('alignment.text_scrolled_changed', 'scrolled 300 DIP under the ink, both strokes are changed (dashed), whatever the 16×16 fingerprint change (reported; the old rule verified below 0.06)',
      bothAre(scrolled, 'changed') && scrolledFacts.every((f) => f.detail?.result === 'changed'),
      { aligned: scrolled.aligned, facts: scrolledFacts, narrow_fingerprint_change: narrow?.fingerprint_change ?? null, old_rule_would_verify_narrow: narrow?.fingerprint_change !== null && narrow?.fingerprint_change !== undefined && narrow.fingerprint_change <= 0.06 });
    // Other paragraphs' first lines, each scrolled exactly under the narrow stroke's line.
    const replaced: Array<{ paragraph: number; scroll: number; aligned: string | undefined; fingerprint_change: number | null; detail: string | null }> = [];
    for (let k = 5; k <= 12; k++) {
      const scroll = (await firstLine(k)).y - line.y;
      const seq0 = (await state6()).samples.at(-1)?.seq ?? 0;
      await text.webContents.executeJavaScript(`document.scrollingElement.scrollTop = ${scroll}; 0`);
      await settle6((x) => (x.samples.at(-1)?.seq ?? 0) > seq0 + 1 && x.aligned[x.doc.visible[0] ?? ''] === 'changed', 6000);
      const f = (await facts6())[0];
      replaced.push({ paragraph: k, scroll, aligned: f?.aligned, fingerprint_change: f?.fingerprint_change ?? null, detail: f?.detail?.result ?? null });
    }
    const oldRuleVerified = replaced.filter((x) => x.fingerprint_change !== null && x.fingerprint_change <= 0.06).length;
    check('alignment.text_lines_replaced_changed', 'another line of text scrolled exactly under the narrow stroke is changed each time (how many of them the old 16×16 rule would have verified is reported)',
      replaced.length === 8 && replaced.every((x) => x.aligned === 'changed' && x.detail === 'changed'), { replaced, old_rule_would_verify: oldRuleVerified });
    const seqBeforeBack = (await state6()).samples.at(-1)?.seq ?? 0;
    await text.webContents.executeJavaScript('document.scrollingElement.scrollTop = 0; 0');
    const back = await settle6((x) => (x.samples.at(-1)?.seq ?? 0) > seqBeforeBack + 1 && bothAre(x, 'verified'));
    check('alignment.text_restored_verified', 'scrolled back, the text under both strokes is where it was: verified again', bothAre(back, 'verified'), { aligned: back.aligned, facts: await facts6() });
    // QA-WIN-01 as QA ran it, on QA's course page: a stroke over the line "The general solution is", then the
    // page scrolled 300 DIP under it.
    await text.webContents.executeJavaScript(showCourse);
    const target = (await text.webContents.executeJavaScript(`(() => { const p = [...document.querySelectorAll('p')].find((x) => x.textContent.trim() === 'The general solution is'); const range = document.createRange(); range.selectNodeContents(p); const r = range.getClientRects()[0]; return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`)) as { x: number; y: number; width: number; height: number };
    const seqCourse = (await state6()).samples.at(-1)?.seq ?? 0;
    await settle6((x) => (x.samples.at(-1)?.seq ?? 0) > seqCourse + 1, 5000);
    const ty = Math.round(target.y + target.height / 2);
    await pen6('mousePressed', target.x + 5, ty);
    for (let x = target.x + 25; x <= target.x + 190; x += 20) await pen6('mouseMoved', x, ty);
    await pen6('mouseReleased', target.x + 190, ty);
    const newest = (x: OverlayState): string => x.aligned[x.doc.visible.at(-1) ?? ''] ?? 'none';
    const onCourse = await settle6((x) => x.doc.visible.length === 3 && newest(x) === 'verified' && x.pendingImages === 0);
    const courseBefore = (await facts6()).at(-1);
    const seqCourse2 = (await state6()).samples.at(-1)?.seq ?? 0;
    await text.webContents.executeJavaScript('document.scrollingElement.scrollTop = 300; 0');
    const courseScrolled = await settle6((x) => (x.samples.at(-1)?.seq ?? 0) > seqCourse2 + 1 && newest(x) === 'changed');
    const courseAfter = (await facts6()).at(-1);
    check('alignment.qa_course_line_changed', "on QA's course page, a stroke over \"The general solution is\" is verified, and changed once the page is scrolled 300 DIP under it (QA-WIN-01; its 16×16 fingerprint change is reported)",
      newest(onCourse) === 'verified' && newest(courseScrolled) === 'changed' && courseAfter?.detail?.result === 'changed',
      { line: target, before: courseBefore, after: courseAfter, old_rule_would_verify: courseAfter?.fingerprint_change !== null && courseAfter?.fingerprint_change !== undefined && courseAfter.fingerprint_change <= 0.06 });
    dbg6.detach();
    h.end('stopped by the self-test');
    const stop6 = Date.now();
    while (h.session() !== null && Date.now() - stop6 < 12000) await sleep(50);
    text.destroy();
  } catch (error) {
    report['error'] = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  } finally {
    probe?.destroy();
    if (h.session()) h.end('self-test finished');
    report['display_count'] = screen.getAllDisplays().length;
    report['checks'] = checks;
    report['summary'] = { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).map((c) => c.id) };
    report['finished_at'] = new Date().toISOString();
    // No local paths (they name the Windows user) in the report.
    let text = `${JSON.stringify(report, null, 2)}\n`;
    for (const [p, name] of [[app.getPath('userData'), '<userData>'], [homedir(), '<home>']] as const) text = text.split(JSON.stringify(p).slice(1, -1)).join(name);
    writeFileSync(h.reportPath, text);
  }
}
