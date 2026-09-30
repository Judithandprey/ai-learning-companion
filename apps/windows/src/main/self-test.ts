// Author self-test (LC_SELFTEST=<report.json>): runs the real app on Windows through its own flow.
//
// It captures the primary display for a short while (frames stay in memory; the report keeps only
// non-content facts: sizes, states, hashes, counts), shows this app's windows without activating them,
// and drives the overlay with window-scoped DevTools input (the user's real cursor never moves). A small
// green checkered probe window with a changing counter gives the display something known that changes. The OS
// click-through of NAV is checked as the window's ignore-mouse state, not with real clicks into other
// apps. Screenshots are of this app's own windows only.

import { BrowserWindow, app, screen } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { release } from 'node:os';
import type { DisplayChoice } from './main.ts';
import type { DesktopInkSummary } from '../shared/desktop-ink.ts';

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
  reportPath: string;
};
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
  samples: Array<{ seq: number; state: string; gap_ms: number | null; raw: { width: number; height: number; change: number | null; pixels_sha256: string } | null; composed: { ink_revision: number; visible_strokes: number; pixels_sha256: string } | null }>;
  card: { text: string; image: boolean } | null;
  saveText: string;
  hint: string;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runSelfTest(h: Harness): Promise<void> {
  const report: Record<string, unknown> = { kind: 'lc-windows-selftest/v1', started_at: new Date().toISOString(), electron: process.versions.electron, chrome: process.versions.chrome, os: `Windows ${release()}` };
  const checks: Array<{ id: string; description: string; pass: boolean; observed: unknown }> = [];
  const check = (id: string, description: string, pass: boolean, observed: unknown): void => void checks.push({ id, description, pass: Boolean(pass), observed });
  const dir = dirname(h.reportPath);
  mkdirSync(dir, { recursive: true });
  const shot = async (win: BrowserWindow, name: string): Promise<void> => writeFileSync(join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  let probe: BrowserWindow | null = null;
  try {
    const displays = await h.listDisplays();
    const primary = displays.find((d) => d.primary) ?? displays[0];
    report['displays'] = displays.map(({ thumbnail: _t, ...d }) => d);
    if (!primary) throw new Error('no display can be captured');
    const b = primary.bounds;

    // The probe: known green, changing, above ordinary windows (below the overlay).
    probe = new BrowserWindow({ x: b.x + 40, y: b.y + 300, width: 360, height: 220, frame: false, show: false, skipTaskbar: true, focusable: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
    probe.setAlwaysOnTop(true, 'floating');
    await probe.loadURL('app://bundle/apps/windows/src/renderer/probe.html');
    probe.showInactive();
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
        if (Date.now() > stop) throw new Error(`timed out waiting for ${what}`);
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
    const green = (p: number[] | null): boolean => p !== null && p[1]! > 150 && p[1]! - p[0]! > 60 && p[1]! - p[2]! > 60;
    const purple = (p: number[] | null): boolean => p !== null && Math.abs(p[0]! - 110) < 45 && Math.abs(p[1]! - 63) < 45 && Math.abs(p[2]! - 209) < 45;
    check('capture.overlay_excluded_ink_once', 'the raw frame under the pen stroke shows the probe (the overlay is excluded from capture), the composed frame shows the ink there once, and away from ink both agree',
      green(rawAt) && purple(composedAt) && green(rawBeside) && JSON.stringify(rawBeside) === JSON.stringify(composedBeside), { rawAt, composedAt, rawBeside, composedBeside });
    const all = (await state()).samples;
    const composedSample = all.at(-1)!;
    report['sample_example'] = composedSample; // an actual emitted sample: facts and hashes, no pixels
    const noInk = all.filter((x) => x.raw && x.composed && x.composed.visible_strokes === 0);
    check('capture.composed_pinned', 'each sample keeps the raw frame and a composed frame pinned to the ink revision: with ink they differ, with no visible ink the composed pixels equal the raw pixels',
      composedSample.raw !== null && composedSample.composed?.ink_revision === st.doc.revision && composedSample.composed.pixels_sha256 !== composedSample.raw.pixels_sha256 && noInk.length > 0 && noInk.every((x) => x.composed!.pixels_sha256 === x.raw!.pixels_sha256),
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
    // The chooser's display thumbnails show the user's screen: remove them and let a frame paint before
    // this app's own screenshot.
    await h.control.webContents.executeJavaScript(`for (const i of document.querySelectorAll('#displays img')) i.remove(); Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 500))])`);
    await sleep(200);
    await shot(h.control, 'windows-selftest-control');
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
    await sleep(Math.max(1500, stoppedAt + 5600 - Date.now())); // past the earlier Stop's bound
    check('stop.restart_at_once', 'Start right after Stop gives a session that the earlier Stop does not end', h.session() === s2 && !s2.overlay.isDestroyed(), { restarted_after_ms: 'immediately after the overlay closed', waited_ms: Date.now() - stoppedAt, alive: h.session() === s2 });
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
        if (Date.now() > stop) throw new Error(`timed out waiting for ${what}`);
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
    probe.destroy();
    probe = null;
    await sleep(2600);
    r = await state2();
    check('alignment.pixels_changed', 'after the probe under the ink is gone, the ink over it is shown as changed (dashed); nothing is moved', Object.values(r.aligned).includes('changed') && !Object.values(r.aligned).includes('verified') && r.doc.visible.length === 5, { aligned: r.aligned });
    // A change, then the overlay window is closed at once (as with Alt+F4): the session ends the normal way.
    await click2('#undo');
    const lastId = (await state2()).doc.id;
    dbg2.detach();
    s2.overlay.close();
    const closedAt = Date.now();
    while (h.session() !== null && Date.now() - closedAt < 7000) await sleep(50);
    const kept = JSON.parse(readFileSync(join(app.getPath('userData'), 'ink', `${lastId}.json`), 'utf8')) as { ink: { history: Array<{ op: string }> } };
    check('stop.overlay_close_saves', 'closing the overlay window ends capture the normal way, and the change made just before is saved', h.session() === null && s2.overlay.isDestroyed() && kept.ink.history.at(-1)?.op === 'undo' && /overlay window was closed/.test(h.lastEnd() ?? ''),
      { session: h.session() !== null, ended: h.lastEnd(), saved_last_op: kept.ink.history.at(-1)?.op, ms: Date.now() - closedAt });
  } catch (error) {
    report['error'] = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  } finally {
    probe?.destroy();
    if (h.session()) h.end('self-test finished');
    report['display_count'] = screen.getAllDisplays().length;
    report['checks'] = checks;
    report['summary'] = { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).map((c) => c.id) };
    report['finished_at'] = new Date().toISOString();
    writeFileSync(h.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
}
