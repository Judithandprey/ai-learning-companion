// The overlay's movable surfaces and the response read aloud, through the app: the real main.ts and overlay.ts
// under the unit-test fakes. The toolbar and the card each have a handle; a drag moves the surface and nothing
// else; its place is kept per display and restored inside whatever the work area is. With the AI's session running
// a circle asks for a small hint by itself; its response is silent text unless Talk was on when it was asked for;
// what is read aloud is the card's own text, handed to the voice by the main process, and it stops at once when asked.
// SYNTHETIC: the connector is a stand-in, the display is a fake, and the voice is a stand-in connected to the main
// process that plays nothing (the product connects no voice in this build). No display, no audio device, no
// microphone, no Codex, no ChatGPT and no network are involved.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { harness, plain, quitLinks, running, settle as started, type FakeWindow, type Session } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { cornerOf } from '../src/shared/placement.ts';
import { connectorConfig, fakeConnectors, removeConfigs } from './subscription-fakes.ts';

after(quitLinks);
after(removeConfigs);
const POLICY = { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 };
const OVER = { x: 5000, y: 5000 };
/** Everything already queued has run (a piece's end goes through the main process and back to the page). */
const settle = (): Promise<void> => new Promise((done) => setImmediate(done));

/** The AI session's own bounds in these tests. */
const AI = { policy: { max_submissions: 60, max_session_ms: 1_800_000, min_observation_interval_ms: 30_000 } };
/**
 * The app with the subscription checked (signed in), the capture started with the AI's session, and one overlay
 * page; `subscription: false` leaves the subscription off (no AI at all).
 */
async function app(o: { subscription?: boolean; userData?: string; /** a stand-in voice is connected to the main process ('silent': one that only synthesizes) */ voice?: boolean | 'silent' } = {}) {
  const fakes = fakeConnectors();
  const h = harness({ ...(o.subscription === false ? {} : { env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: fakes.spawn, request_ms: 500, ask_ms: 20_000, end_ms: 500 } }), ...(o.userData ? { userData: o.userData } : {}) });
  await started(); // the app starts: its control window is there
  const control = h.control() as unknown as FakeWindow;
  const live = (): { state?: string } => (plain(h.handlers['lc:session-state']!({ sender: control.webContents })) as { live?: { state?: string } }).live ?? {};
  if (o.subscription !== false) {
    h.handlers['lc:sub-check']!({ sender: control.webContents });
    await until('signed in', () => (plain(h.handlers['lc:sub-state']!({ sender: control.webContents })) as { state?: string }).state === 'signed_in', 3000);
  }
  // Start, with the AI's observation when the subscription is on (as the control window's ticked box asks for).
  const s = await running(h, o.subscription === false ? null : AI);
  if (o.subscription !== false) await until('the AI is on', () => live().state === 'on', 3000);
  const page = await overlayPage(h, s, POLICY, { voice: o.voice ?? false });
  page.scene.exactPng = true;
  const file = path.join(h.userData, 'overlay-preferences.json');
  const stored = (): { displays: Record<string, Record<string, { fx: number; fy: number }>>; speech_rate: number } => JSON.parse(fs.readFileSync(file, 'utf8')) as never;
  /** A circle drawn in ASK (nothing is waited for). */
  const circle = (x = 190, width = 210): void => {
    page.press('ASK');
    page.pointer('pointerdown', 2, x, 95);
    for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]] as const) page.pointer('pointermove', 2, px, py);
    page.pointer('pointerup', 2, x + 2, 97);
  };
  /** A circle in ASK. With the AI on, its own request for a small hint goes out by itself: waited for here. */
  const select = async (x = 190, width = 210): Promise<void> => {
    const before = o.subscription === false ? 0 : fakes.last().asks().length;
    circle(x, width);
    await until('the card', () => page.review.card()?.text.includes(`Region ${x - 8},87 `) === true && (o.subscription === false || page.ask().form));
    if (o.subscription !== false && live().state === 'on') await until('the circle\'s own request', () => fakes.last().asks().length === before + 1 && /^Asked at/.test(page.ask().status ?? ''));
  };
  /** A follow-up in the user's words, sent from the card (not answered yet). */
  const followUp = async (words = 'And then?'): Promise<void> => {
    const before = fakes.last().asks().length;
    page.question(words);
    page.click('askSubmit');
    await until('sent', () => fakes.last().asks().length === before + 1);
    await until('acknowledged', () => /^Asked at/.test(page.ask().status ?? ''));
  };
  /**
   * The next response on the card, as `text`: of the request that is out (the circle's own, after a circle), else of
   * a follow-up sent now.
   */
  const ask = async (text: string): Promise<void> => {
    if (fakes.last().heldAsks().length === 0) await followUp();
    fakes.last().answer(text);
    await until('answered', () => page.ask().answer === text);
  };
  const records = (): Array<{ requests: Array<Record<string, unknown>> }> => {
    const dir = path.join(h.userData, 'captures', fs.readdirSync(path.join(h.userData, 'captures'))[0]!, 'asks');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
  };
  return { h, s, fakes, page, control, file, stored, circle, select, ask, followUp, records, live };
}
/** A drag of a surface by its handle: press at (x, y), move through the points, release at the last. */
function dragBy(page: Awaited<ReturnType<typeof app>>['page'], handle: string, from: { x: number; y: number }, ...to: Array<{ x: number; y: number }>): void {
  page.on(handle, 'pointerdown', from);
  for (const p of to) page.on(handle, 'pointermove', p);
  page.on(handle, 'pointerup', to.at(-1) ?? from);
}
const round = (b: { left: number; top: number }): [number, number] => [Math.round(b.left), Math.round(b.top)];
const inside = (b: { left: number; top: number; right: number; bottom: number }, a: { x: number; y: number; width: number; height: number }): boolean => b.left >= a.x && b.top >= a.y && b.right <= a.x + a.width + 1e-6 && b.bottom <= a.y + a.height + 1e-6;

test('the toolbar has a handle: a drag moves the toolbar and nothing else, in every mode; it is kept inside the work area and its place is written for this display', async () => {
  const w = await app({ subscription: false });
  const { page } = w;
  // Where it starts: the top right of the work area (the display less a taskbar of 40), with a margin.
  assert.deepEqual(round(page.box('toolbar')), [970, 10]);
  assert.equal(fs.existsSync(w.file), false, 'nothing is written until the user moves something');
  // A stroke first, so there is ink that a drag could harm.
  page.pointer('pointerdown', 1, 200, 300);
  for (const x of [240, 280]) page.pointer('pointermove', 1, x, 300);
  page.pointer('pointerup', 1, 280, 300);
  await page.review.pending();
  const ink = () => JSON.stringify(page.review.state().doc.ink);
  const before = ink();
  for (const m of ['WRITE', 'ASK', 'NAV'] as const) {
    page.press(m);
    const hint = page.hint();
    const prevented = page.on('toolbarHandle', 'pointerdown', { x: page.box('toolbar').left + 8, y: page.box('toolbar').top + 8 });
    assert.equal(prevented, true);
    page.on('toolbarHandle', 'pointermove', { x: 498, y: 298 });
    assert.deepEqual(round(page.box('toolbar')), [490, 290], `${m}: the corner follows the pointer, less where it took hold`);
    page.on('toolbarHandle', 'pointermove', { x: 308, y: 208 });
    page.on('toolbarHandle', 'pointerup', { x: 308, y: 208 });
    await settle();
    assert.deepEqual(round(page.box('toolbar')), [300, 200]);
    assert.deepEqual([ink(), page.review.state().gesture, page.review.card(), page.hint()], [before, null, null, hint], `${m}: nothing is written, erased or selected, no card, and the mode is as it was`);
    dragBy(page, 'toolbarHandle', { x: 308, y: 208 }, { x: 978, y: 18 }); // back, for the next mode
    await settle();
  }
  // Dragged far outside on each side: held at the edge of the work area, whole.
  const area = { x: 10, y: 10, width: 1260, height: 740 };
  for (const to of [OVER, { x: -5000, y: -5000 }, { x: 5000, y: -5000 }, { x: -5000, y: 5000 }]) {
    dragBy(page, 'toolbarHandle', { x: page.box('toolbar').left + 8, y: page.box('toolbar').top + 8 }, to);
    await settle();
    assert.equal(inside(page.box('toolbar'), area), true, JSON.stringify(to));
  }
  assert.deepEqual(round(page.box('toolbar')), [10, 700], 'the bottom left: above the taskbar, not under it');
  // Its place is kept for this display, as two fractions and nothing else.
  assert.deepEqual(w.stored(), { format: 'lc-windows-overlay-preferences/v1', displays: { 'display:1': { toolbar: { fx: 0, fy: 1 } } }, speech_rate: 1.3 });
  // The controls still work where it is now: the modes, the tools, undo and redo of the original stroke.
  page.press('WRITE');
  page.click('undo');
  assert.equal(page.review.state().doc.ink.visible.length, 0);
  page.click('redo');
  assert.equal(page.review.state().doc.ink.visible.length, 1);
  page.click('eraser');
  page.pointer('pointerdown', 1, 240, 300);
  page.pointer('pointermove', 1, 241, 300);
  page.pointer('pointerup', 1, 241, 300);
  await page.review.pending();
  assert.notEqual(ink(), before, 'the eraser erases, as before');
  // A press that is not a drag (no move) writes nothing: no write is even tried (one would fail here, and be said).
  const kept = fs.readFileSync(w.file, 'utf8');
  w.h.failWrites.only = 'overlay-preferences';
  page.on('toolbarHandle', 'pointerdown', { x: 18, y: 708 });
  page.on('toolbarHandle', 'pointerup', { x: 18, y: 708 });
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  w.h.failWrites.only = null;
  assert.deepEqual([fs.readFileSync(w.file, 'utf8'), /could not be kept/.test(page.hint() ?? '')], [kept, false]);
  // Only the primary button drags.
  page.on('toolbarHandle', 'pointerdown', { x: 18, y: 708, button: 2 });
  page.on('toolbarHandle', 'pointermove', { x: 500, y: 300 });
  assert.deepEqual(round(page.box('toolbar')), [10, 700]);
});

test('in NAV the pointer passes through to the apps except over a surface, and a surface being moved keeps it until it is let go', async () => {
  const w = await app({ subscription: false });
  const { page } = w;
  page.press('NAV');
  const last = (): boolean | undefined => page.interactive.at(-1);
  page.mouseMove(400, 400);
  assert.equal(last(), false, 'over the apps: the clicks go to them');
  page.mouseMove(980, 20);
  assert.equal(last(), true, 'over the toolbar');
  page.on('toolbarHandle', 'pointerdown', { x: 978, y: 18 });
  page.on('toolbarHandle', 'pointermove', { x: 400, y: 400 });
  page.mouseMove(100, 600); // the pointer ran ahead of the toolbar, over the apps
  assert.equal(last(), true, 'still the overlay\'s: the drag is not dropped');
  page.on('toolbarHandle', 'pointermove', { x: 408, y: 408 });
  page.on('toolbarHandle', 'pointerup', { x: 408, y: 408 });
  assert.deepEqual([round(page.box('toolbar')), last(), page.node('toolbarHandle').captured.size], [[400, 400], true, 0], 'let go over the toolbar itself');
  page.mouseMove(100, 100);
  assert.equal(last(), false, 'and the apps have the pointer again');
  // Let go where the toolbar is not (it was held at the edge): the pointer is the apps' at once.
  page.mouseMove(408, 408);
  assert.equal(last(), true, 'over the toolbar again');
  page.on('toolbarHandle', 'pointerdown', { x: 408, y: 408 });
  page.on('toolbarHandle', 'pointermove', { x: 408, y: 5000 });
  page.on('toolbarHandle', 'pointerup', { x: 408, y: 5000 });
  assert.equal(last(), false);
  assert.match(page.hint() ?? '', /Clicks go to your apps\./, 'NAV throughout');
});

test('Stop while a surface is being moved: the surface is let go and the session ends as it does otherwise', async () => {
  const w = await app({ subscription: false });
  const { page } = w;
  page.on('toolbarHandle', 'pointerdown', { x: 978, y: 18 });
  page.on('toolbarHandle', 'pointermove', { x: 500, y: 300 });
  assert.equal(page.node('toolbarHandle').captured.size, 1);
  w.h.end('stopped by the test');
  await until('ended', () => w.h.current() === null, 5000);
  assert.deepEqual([page.node('toolbarHandle').captured.size, page.review.state().ended], [0, true]);
  page.on('toolbarHandle', 'pointermove', { x: 100, y: 100 }); // a late move is nobody's
  assert.deepEqual(round(page.box('toolbar')), [492, 292]);
});

test('the place is restored at the next Start, per display, and fitted to the work area as it is then: another size, another scale, a taskbar elsewhere', async () => {
  const w = await app({ subscription: false });
  dragBy(w.page, 'toolbarHandle', { x: 978, y: 18 }, { x: 498, y: 363 }); // the middle: fx 0.5, fy 0.5 with a 300x50 toolbar
  await settle();
  assert.deepEqual([round(w.page.box('toolbar')), w.stored().displays['display:1']], [[490, 355], { toolbar: { fx: 0.5, fy: 0.5 } }]);
  w.h.end('stopped by the test');
  await until('ended', () => w.h.current() === null, 5000);
  const next = async (): Promise<Awaited<ReturnType<typeof overlayPage>>> => overlayPage(w.h, (await running(w.h)) as Session, POLICY);
  const stop = async (): Promise<void> => {
    w.h.end('stopped by the test');
    await until('ended', () => w.h.current() === null, 5000);
  };
  // The same display, the same geometry: the same place.
  let page = await next();
  assert.deepEqual(round(page.box('toolbar')), [490, 355]);
  await stop();
  // The same display at a larger scale (fewer DIP) with the taskbar on the left: inside that work area, at the same fractions.
  Object.assign(w.h.display, { bounds: { x: 0, y: 0, width: 1024, height: 640 }, workArea: { x: 60, y: 0, width: 964, height: 640 }, scaleFactor: 2.5 });
  page = await next();
  const area = { x: 70, y: 10, width: 944, height: 620 };
  assert.equal(inside(page.box('toolbar'), area), true);
  assert.deepEqual(round(page.box('toolbar')), [70 + 0.5 * (944 - 300), 10 + 0.5 * (620 - 50)]);
  await stop();
  // A work area smaller than the toolbar is wide: held at its corner, never off it.
  Object.assign(w.h.display, { bounds: { x: 0, y: 0, width: 280, height: 200 }, workArea: { x: 0, y: 0, width: 280, height: 160 }, scaleFactor: 1 });
  page = await next();
  assert.deepEqual(round(page.box('toolbar')), [10, 55]);
  await stop();
  // Another display has its own place: none kept yet, so where the toolbar starts; then its own, beside the first one's.
  Object.assign(w.h.display, { id: 2, bounds: { x: 1280, y: 0, width: 1920, height: 1080 }, workArea: { x: 1280, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 });
  w.h.source.display_id = '2';
  page = await next();
  assert.deepEqual(round(page.box('toolbar')), [10 + (1900 - 300), 10], 'relative to that display\'s own corner');
  dragBy(page, 'toolbarHandle', { x: 1618, y: 18 }, { x: 18, y: 18 });
  await settle();
  assert.deepEqual(w.stored().displays, { 'display:1': { toolbar: { fx: 0.5, fy: 0.5 } }, 'display:2': { toolbar: { fx: 0, fy: 0 } } });
  await stop();
  // Back on the first display: its own place again.
  Object.assign(w.h.display, { id: 1, bounds: { x: 0, y: 0, width: 1280, height: 800 }, workArea: { x: 0, y: 0, width: 1280, height: 760 }, scaleFactor: 1 });
  w.h.source.display_id = '1';
  page = await next();
  assert.deepEqual(round(page.box('toolbar')), [490, 355]);
});

test('the work area changing while the capture runs keeps the surfaces inside the new one; the keys move a surface too; a place that cannot be written holds for the session and is said', async () => {
  const w = await app({ subscription: false });
  const { page } = w;
  dragBy(page, 'toolbarHandle', { x: 978, y: 18 }, OVER); // the bottom right
  await settle();
  assert.deepEqual(round(page.box('toolbar')), [970, 700]);
  // The taskbar grows to 200: the session goes on, and the toolbar is above it.
  w.h.display.workArea = { x: 0, y: 0, width: 1280, height: 600 };
  w.h.screen.emit('display-metrics-changed', {}, w.h.display, ['workArea']);
  await settle();
  assert.deepEqual([round(page.box('toolbar')), w.h.current() !== null], [[970, 540], true]);
  // Arrow keys on the handle move it by 16; Home puts it back where it starts.
  for (const [key, at] of [['ArrowLeft', [954, 540]], ['ArrowUp', [954, 524]], ['ArrowRight', [970, 524]], ['ArrowDown', [970, 540]], ['ArrowDown', [970, 540]]] as const) {
    assert.equal(page.on('toolbarHandle', 'keydown', { key }), true);
    assert.deepEqual(round(page.box('toolbar')), at, key);
  }
  assert.equal(page.on('toolbarHandle', 'keydown', { key: 'a' }), false, 'other keys are left alone');
  page.on('toolbarHandle', 'keydown', { key: 'Home' });
  await settle();
  assert.deepEqual([round(page.box('toolbar')), w.stored().displays['display:1']], [[970, 10], { toolbar: { fx: 1, fy: 0 } }]);
  // The place cannot be written: it stays where the user put it, for this session, and the toolbar says so.
  w.h.failWrites.only = 'overlay-preferences';
  dragBy(page, 'toolbarHandle', { x: 978, y: 18 }, { x: 18, y: 18 });
  await until('said', () => /could not be kept/.test(page.hint() ?? ''));
  assert.match(page.hint() ?? '', /^The place of the toolbar could not be kept on this device \(Error: EIO: i\/o error \(injected\)\): it stays here for this session\./);
  assert.deepEqual([round(page.box('toolbar')), w.stored().displays['display:1']], [[10, 10], { toolbar: { fx: 1, fy: 0 } }]);
  // What is taken is checked by the main process: only the overlay's, only a surface, only fractions.
  w.h.failWrites.only = null;
  const overlay = { sender: w.s.overlay.webContents };
  const kept = fs.readFileSync(w.file, 'utf8');
  for (const [from, surface, place] of [[{ sender: w.control.webContents }, 'toolbar', { fx: 0, fy: 0 }], [{ sender: {} }, 'toolbar', { fx: 0, fy: 0 }], [overlay, 'window', { fx: 0, fy: 0 }], [overlay, 'toolbar', { fx: 2, fy: 0 }], [overlay, 'toolbar', { fx: 0.5 }], [overlay, 'toolbar', { fx: 0.5, fy: 0.5, x: 9 }], [overlay, 'toolbar', { fx: Number.NaN, fy: 0 }], [overlay, 'toolbar', null]] as const) {
    assert.deepEqual(plain(await w.h.handlers['lc:place']!(from, surface, place)), { saved: false, reason: 'refused' });
  }
  for (const rate of [9, 1.25, '1.3', Number.NaN]) assert.deepEqual(plain(await w.h.handlers['lc:speech-rate']!(overlay, rate)), { saved: false, reason: 'refused' });
  assert.deepEqual(plain(await w.h.handlers['lc:speech-rate']!({ sender: w.control.webContents }, 1.5)), { saved: false, reason: 'refused' });
  assert.equal(fs.readFileSync(w.file, 'utf8'), kept);
  // A file that is not this format is left as it is; the places then hold for the run only.
  const odd = await app({ subscription: false });
  fs.writeFileSync(odd.file, '{"format":"another/v1"}');
  odd.h.end('stopped by the test');
  await until('ended', () => odd.h.current() === null, 5000);
  const again = harness({ userData: odd.h.userData });
  const p2 = await overlayPage(again, (await running(again)) as Session, POLICY);
  dragBy(p2, 'toolbarHandle', { x: 978, y: 18 }, { x: 18, y: 18 });
  await until('said', () => /could not be kept/.test(p2.hint() ?? ''));
  assert.match(p2.hint() ?? '', /\(the overlay preferences on this device are not readable, so they are left untouched\)/);
  assert.equal(fs.readFileSync(odd.file, 'utf8'), '{"format":"another/v1"}');
});

test('[synthetic connector] the card has a handle too: it moves with its selection, form and response, asks nothing by being moved, and its place is kept beside the toolbar\'s', async () => {
  const w = await app();
  const { page } = w;
  await w.select();
  assert.deepEqual(round(page.box('card')), [910, 550], 'where it starts: the bottom right, above the taskbar');
  const sent = w.fakes.last().calls.length;
  dragBy(page, 'cardHandle', { x: 918, y: 558 }, { x: 108, y: 108 });
  await settle();
  assert.deepEqual([round(page.box('card')), page.ask().form, page.review.card() !== null, w.fakes.last().calls.length, w.records()[0]!.requests.length], [[100, 100], true, true, sent, 1], 'moved; the card is as it was, and nothing more was sent or asked than the circle\'s own request');
  assert.deepEqual(w.stored().displays['display:1'], { caption: { fx: (100 - 10) / (1260 - 360), fy: (100 - 10) / (740 - 200) } });
  // The card's own controls work where it is: the response, a follow-up, another card in the same place.
  await w.ask('A response on the moved card.');
  assert.deepEqual(round(page.box('card')), [100, 100]);
  await w.ask('And a follow-up\'s response there.');
  await w.select(600, 120);
  assert.deepEqual(round(page.box('card')), [100, 100], 'the next card opens where the user keeps the card');
  // Moved while a request is out: it is not interrupted and its response is shown.
  assert.equal(w.fakes.last().heldAsks().length, 1);
  dragBy(page, 'cardHandle', { x: 108, y: 108 }, { x: 508, y: 308 });
  await settle();
  assert.equal(w.fakes.last().count('companion/interrupt'), 0);
  w.fakes.last().answer('Answered while the card was elsewhere.');
  await until('answered', () => page.ask().answer === 'Answered while the card was elsewhere.');
  assert.deepEqual(round(page.box('card')), [500, 300]);
});

test('[synthetic connector] no voice is connected in this build: a response is silent text, Talk says so, and nothing is read or recorded as read', async () => {
  const w = await app(); // as the product is: no voice
  const { page } = w;
  await w.select();
  assert.deepEqual(page.talkState(), { controls: true, talk: false, muted: false, mute: false, interrupt: false, rate: null, status: null });
  await w.ask('Silent by default. It is only shown.');
  page.click('talk');
  assert.deepEqual(page.talkState(), { controls: true, talk: true, muted: false, mute: false, interrupt: false, rate: null, status: 'Talk is on, but no voice is connected in this build, so responses are not read aloud; they are shown as text. Speaking to the AI is not connected either: type your question.' });
  await w.ask('Shown as text, with Talk on.');
  assert.deepEqual([page.voice.spoken.length, page.ask().answer, page.talkState().interrupt, w.records()[0]!.requests.map((r) => 'spoken' in r)], [0, 'Shown as text, with Talk on.', false, [false, false]]);
  assert.deepEqual([w.fakes.last().asks()[1]!.params['presentation'], w.records()[0]!.requests[1]!['asked_as']], ['silent', 'silent'], 'no voice: asked for as silent text though Talk is on');
  // Without the subscription there is nothing to read, and no talk controls.
  const off = await app({ subscription: false });
  await off.select();
  assert.deepEqual([off.page.talkState().controls, off.page.talkState().status], [false, null]);
});

test('[synthetic connector, stand-in voice] a response is silent text unless Talk was on when it was asked for; then it is read from the card\'s own text, a piece at a time, at 1.3×, and what the voice reported is recorded apart from shown', async () => {
  const w = await app({ voice: true });
  const { page } = w;
  // The default: nothing is on, and a response is not read. (Talk is in the toolbar: in reach before any card.)
  assert.deepEqual(page.talkState(), { controls: true, talk: false, muted: false, mute: false, interrupt: false, rate: null, status: null });
  await w.select();
  await w.ask('Silent by default. It is only shown.');
  assert.deepEqual([w.fakes.last().asks()[0]!.params['presentation'], page.voice.spoken.length, page.talkState().interrupt, 'spoken' in w.records()[0]!.requests[0]!, w.records()[0]!.requests[0]!['asked_as']], ['silent', 0, false, false, 'silent']);
  // Talk on: said, with what it does and what is not connected.
  page.click('talk');
  assert.deepEqual(page.talkState(), { controls: true, talk: true, muted: false, mute: true, interrupt: false, rate: '1.3×', status: 'Talk is on: the response to your next request is read aloud at 1.3× and shown as text. Speaking to the AI is not connected in this build: type your question.' });
  assert.match(page.hint() ?? '', /Talk is on: the responses you ask for from now are read aloud\./, 'said in the toolbar too');
  assert.equal(page.voice.spoken.length, 0, 'the response already shown is not read: only one asked for from now');
  const text = 'The slope is 2. So the line rises! Does it cross zero?';
  await w.ask(text);
  assert.deepEqual([w.fakes.last().asks()[1]!.params['presentation'], w.records()[0]!.requests[1]!['asked_as']], ['spoken', 'spoken'], 'asked for as spoken: Talk was on then');
  // One piece at a time; the rest is not handed to the voice until the piece before has ended.
  assert.deepEqual(page.voice.spoken.map((u) => [u.text, u.rate]), [['The slope is 2.', 1.3]]);
  assert.deepEqual([page.ask().answer, page.review.card() !== null], [text, true], 'the text that is read is on the card');
  assert.deepEqual([page.node('answerBox').revealed.at(-1), page.node('answerBox').revealed.length], ['start', 2], 'each response is brought into view on the card when it comes');
  assert.deepEqual([page.talkState().interrupt, page.talkState().status], [true, 'Reading the response aloud at 1.3× (part 1 of 3). The text below is what is read.']);
  // Handed to the voice, nothing reported yet: attempted, not played help.
  assert.deepEqual([w.records()[0]!.requests[1]!['spoken'], w.records()[0]!.requests[1]!['spoken_pieces']], ['attempted', { said: 0, of: 3 }]);
  page.voice.spoken[0]!.end();
  await settle();
  assert.deepEqual([page.voice.spoken.length, page.voice.spoken[1]!.text, page.talkState().status], [2, 'So the line rises!', 'Reading the response aloud at 1.3× (part 2 of 3). The text below is what is read.']);
  page.voice.spoken[1]!.end();
  await settle();
  page.voice.spoken[2]!.end();
  await settle();
  assert.deepEqual([page.voice.spoken.map((u) => u.text).join(' '), page.talkState().interrupt, w.records()[0]!.requests[1]!['spoken'], w.records()[0]!.requests[1]!['spoken_pieces'], page.voice.cancels], [text, false, 'finished', { said: 3, of: 3 }, 0]);
  assert.deepEqual(w.records()[0]!.requests.map((r) => [r['shown'], r['spoken'] ?? null]), [[true, null], [true, 'finished']], 'what the voice reported is recorded apart from shown');
  // A refusal is brought into view too (its status), not the answer box. (A request simply not taken: the session goes on.)
  await w.followUp();
  w.fakes.last().fail(w.fakes.last().asks()[2]!.id, 'busy');
  await until('refused', () => /^No answer/.test(page.ask().status ?? ''));
  assert.deepEqual([page.node('askStatus').revealed.at(-1), page.node('answerBox').revealed.length, w.live().state], ['nearest', 2, 'on']);
  // The voice fails at its first piece: handed over, nothing reported said. Attempted, never played help; the text stays.
  await w.ask('First piece. Second piece.');
  page.voice.spoken.at(-1)!.end(false);
  await settle();
  assert.deepEqual([page.voice.spoken.length, page.voice.cancels, page.talkState().interrupt, w.records()[0]!.requests[3]!['spoken'], w.records()[0]!.requests[3]!['spoken_pieces'], page.ask().answer], [4, 1, false, 'attempted', { said: 0, of: 2 }, 'First piece. Second piece.'], 'the voice was told to stop too');
  assert.match(page.talkState().status ?? '', /^The voice stopped before the end; the response is shown as text\./);
  // It fails after a piece was reported said: interrupted, with how many.
  await w.ask('Said to its end. Not this one.');
  page.voice.spoken.at(-1)!.end();
  await settle();
  page.voice.spoken.at(-1)!.end(false);
  await settle();
  assert.deepEqual([page.voice.spoken.length, w.records()[0]!.requests[4]!['spoken'], w.records()[0]!.requests[4]!['spoken_pieces']], [6, 'interrupted', { said: 1, of: 2 }]);
});

test('[synthetic connector, stand-in voice] the voice stops at once, with everything not yet spoken: Stop reading, Mute, Talk off, closing the card, a new selection, a new question, Cancel and Stop', async () => {
  const text = 'One. Two. Three. Four.';
  const reading = async () => {
    const w = await app({ voice: true });
    w.page.click('talk');
    await w.select();
    await w.ask(text);
    assert.deepEqual([w.page.voice.spoken.length, w.page.talkState().interrupt], [1, true]);
    return w;
  };
  // (Stopped while its first piece was being said: nothing was reported said, so the record stays "attempted".)
  const stopped = async (w: Awaited<ReturnType<typeof reading>>, what: string, spoken = 'attempted'): Promise<void> => {
    await settle();
    // The page's own state, before the voice's late end of the cut piece: stopped, and nothing said of a failure.
    assert.deepEqual([w.page.voice.cancels, w.page.talkState().interrupt, /^Reading/.test(w.page.talkState().status ?? '')], [1, false, false], `${what}: stopped at once`);
    w.page.voice.spoken[0]!.end(); // the voice's own late end of the cut piece
    await settle();
    assert.deepEqual([w.page.voice.spoken.length, w.page.voice.cancels, w.page.talkState().interrupt, /voice stopped/.test(w.page.talkState().status ?? '')], [1, 1, false, false], `${what}: told to stop once, and nothing more is handed to it`);
    if (spoken) assert.deepEqual([w.records()[0]!.requests[0]!['spoken'], w.records()[0]!.requests[0]!['spoken_pieces']], [spoken, { said: 0, of: 4 }], what);
  };
  // Stop reading: Talk stays on, the text stays.
  let w = await reading();
  w.page.click('interrupt');
  await stopped(w, 'Stop reading');
  assert.deepEqual([w.page.talkState().talk, w.page.ask().answer], [true, text]);
  // The cut piece ending late as a failure is nobody's: nothing is said of it.
  w = await reading();
  w.page.click('interrupt');
  await settle();
  w.page.voice.spoken[0]!.end(false);
  await settle();
  assert.deepEqual([w.page.voice.spoken.length, /voice stopped/.test(w.page.talkState().status ?? '')], [1, false]);
  // Mute: no reading, the text stays; the next answer is not read either; unmuted, the one after is.
  w = await reading();
  w.page.click('mute');
  await stopped(w, 'Mute');
  assert.deepEqual([w.page.talkState().muted, w.page.talkState().status, w.page.ask().answer], [true, 'Talk is on, muted: responses are shown as text and not read aloud.', text]);
  const muted = (w.records()[0] as unknown as { selection_id: string }).selection_id;
  assert.deepEqual([plain(await w.h.handlers['lc:say']!({ sender: w.s.overlay.webContents }, muted, `${muted}.1`, 0)), w.page.voice.spoken.length], [{ spoken: false }, 1], 'the main process was told of the mute: it says nothing, whoever asks');
  await w.ask('Muted answer.');
  assert.equal(w.page.voice.spoken.length, 1);
  assert.deepEqual([w.fakes.last().asks()[1]!.params['presentation'], w.records()[0]!.requests[1]!['asked_as']], ['silent', 'silent'], 'asked for while muted: as silent text');
  w.page.click('mute');
  await w.ask('Read again.');
  assert.deepEqual([w.page.voice.spoken.length, w.page.voice.spoken[1]!.text], [2, 'Read again.']);
  // Talk off.
  w = await reading();
  w.page.click('talk');
  await stopped(w, 'Talk off');
  assert.deepEqual(w.page.talkState(), { controls: true, talk: false, muted: false, mute: false, interrupt: false, rate: null, status: null });
  const off = (w.records()[0] as unknown as { selection_id: string }).selection_id;
  const asked = w.h.handlers['lc:say']!({ sender: w.s.overlay.webContents }, off, `${off}.1`, 0) as Promise<unknown>;
  await settle();
  assert.equal(w.page.voice.spoken.length, 1, 'the main process was told Talk is off: it says nothing, whoever asks');
  assert.deepEqual(plain(await asked), { spoken: false });
  // Closing the card: no response is read without its text on the screen.
  w = await reading();
  w.page.click('close');
  await stopped(w, 'the card closed');
  assert.equal(w.page.review.card(), null);
  // A new selection replaces the card.
  w = await reading();
  await w.select(600, 120);
  await stopped(w, 'a new selection', '');
  // A follow-up on the same card, and its Cancel.
  w = await reading();
  w.page.question('And then?');
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  await stopped(w, 'a follow-up');
  w.page.click('askCancel');
  await settle();
  assert.equal(w.page.voice.spoken.length, 1);
  // Stop, and the capture ending: nothing is read after the end, and Talk cannot be turned on then.
  w = await reading();
  w.h.end('stopped by the test');
  await until('ended', () => w.h.current() === null, 5000);
  await stopped(w, 'Stop', '');
  assert.equal(w.page.talkState().talk, true);
  w.page.click('talk'); // after the end the control does nothing
  assert.deepEqual([w.page.talkState().talk, w.page.voice.spoken.length], [true, 1]);
});

test('[synthetic connector, stand-in voice] the rate is the user\'s, inside its bounds, kept for the next Start; a piece is handed to the voice only by the main process, for the shown current response, in order, with Talk on', async () => {
  const w = await app({ voice: true });
  const { page } = w;
  dragBy(page, 'toolbarHandle', { x: 978, y: 18 }, { x: 18, y: 18 }); // a place is kept first: the rate must not drop it
  await settle();
  // A fresh Start: Talk is off in the main process too, whatever asks.
  await w.select();
  await w.ask('Shown before Talk.');
  const first = (w.records()[0] as unknown as { selection_id: string }).selection_id;
  assert.deepEqual([plain(await w.h.handlers['lc:say']!({ sender: w.s.overlay.webContents }, first, `${first}.1`, 0)), page.voice.spoken.length], [{ spoken: false }, 0]);
  page.click('talk');
  for (let i = 0; i < 3; i += 1) page.click('faster');
  await settle();
  assert.deepEqual([page.talkState().rate, w.stored().speech_rate, w.stored().displays], ['1.6×', 1.6, { 'display:1': { toolbar: { fx: 0, fy: 0 } } }]);
  await w.ask('Faster now. Second piece.');
  assert.equal(page.voice.spoken[0]!.rate, 1.6);
  page.click('slower'); // while reading: from the next piece on
  page.voice.spoken[0]!.end();
  await settle();
  assert.deepEqual([page.voice.spoken[1]!.rate, page.talkState().status], [1.5, 'Reading the response aloud at 1.5× (part 2 of 2). The text below is what is read.']);
  page.voice.spoken[1]!.end();
  await settle();
  for (let i = 0; i < 20; i += 1) page.click('faster');
  assert.equal(page.talkState().rate, '2.0×');
  for (let i = 0; i < 20; i += 1) page.click('slower');
  await settle();
  assert.deepEqual([page.talkState().rate, w.stored().speech_rate], ['0.7×', 0.7]);
  // A piece is handed to the voice only by the main process, cut from its own copy of the current response: asked
  // for by the overlay alone, for the current selection's last answer, shown, the next piece in order, with Talk on
  // and not muted as the main process holds it. Whatever else comes with the call is not looked at.
  const id = (w.records()[0] as unknown as { selection_id: string }).selection_id;
  const overlay = { sender: w.s.overlay.webContents };
  const say = async (sender: unknown, ...a: unknown[]): Promise<unknown> => plain(await w.h.handlers['lc:say']!(sender, ...a));
  const NO = { spoken: false };
  await w.ask('Being read now. Second piece. Third piece.');
  assert.deepEqual([page.voice.spoken.length, page.voice.spoken[2]!.text, w.records()[0]!.requests[2]!['spoken']], [3, 'Being read now.', 'attempted']);
  const before = JSON.stringify(w.records());
  for (const refused of [
    say({ sender: w.control.webContents }, id, `${id}.3`, 1), // not the overlay
    say({ sender: {} }, id, `${id}.3`, 1),
    say(overlay, 'ask-0000000000000000', `${id}.3`, 1), // not the current selection
    say(overlay, id, `${id}.9`, 1), // not a question of it
    say(overlay, id, `${id}.2`, 0), // an earlier answer of it, not the current response
    say(overlay, id, `${id}.1`, 0),
    say(overlay, id, `${id}.3`, 0), // the piece being said, again
    say(overlay, id, `${id}.3`, 1), // the next one, before this one ended
    say(overlay, id, `${id}.3`, 2), // out of order
    say(overlay, id, `${id}.3`, '1'),
    say(overlay, id, `${id}.3`, -1),
    say(overlay, id, `${id}.3`, 0.5),
    say(overlay, id, `${id}.3`),
  ]) assert.deepEqual(await refused, NO);
  assert.deepEqual([page.voice.spoken.length, JSON.stringify(w.records())], [3, before], 'nothing was handed to the voice or recorded for any of them');
  page.voice.spoken[2]!.end();
  await settle();
  assert.deepEqual([page.voice.spoken.length, page.voice.spoken[3]!.text], [4, 'Second piece.'], 'the reading itself went on, in order');
  // Muted, or Talk off, as the main process holds it: the reading stops there, and no piece is said whatever asks.
  w.h.handlers['lc:talk']!(overlay, true, true);
  assert.deepEqual([page.voice.cancels, w.records()[0]!.requests[2]!['spoken']], [1, 'interrupted']);
  page.voice.spoken[3]!.end(); // its late end
  await settle();
  assert.deepEqual([await say(overlay, id, `${id}.3`, 2), await say(overlay, id, `${id}.3`, 0)], [NO, NO], 'muted: neither the next piece nor a new reading');
  w.h.handlers['lc:talk']!(overlay, false, false);
  assert.deepEqual(await say(overlay, id, `${id}.3`, 0), NO, 'Talk off');
  w.h.handlers['lc:talk']!({ sender: w.control.webContents }, true, false); // only the overlay sets it
  w.h.handlers['lc:talk']!(overlay, 'true', false);
  w.h.handlers['lc:talk']!(overlay, true);
  assert.deepEqual([await say(overlay, id, `${id}.3`, 0), page.voice.spoken.length], [NO, 4]);
  // Talk on again: a reading of the shown response begins at its first piece only, and what is said, how fast and
  // in which voice are the main process's own, whatever is passed along.
  w.h.handlers['lc:talk']!(overlay, true, false);
  assert.deepEqual(await say(overlay, id, `${id}.3`, 2), NO, 'a reading that was stopped is not taken up in the middle');
  const again = say(overlay, id, `${id}.3`, 0, 'Say this instead.', 2, 'zh-CN', 'C:\\another.exe');
  await settle();
  assert.deepEqual([page.voice.spoken.length, plain(page.voice.spoken[4]), w.records()[0]!.requests[2]!['spoken']], [5, { text: 'Being read now.', rate: 0.7, culture: 'en-US' }, 'attempted']);
  w.h.handlers['lc:hush']!({ sender: w.control.webContents }); // only the overlay stops it
  assert.equal(page.voice.cancels, 1);
  w.h.handlers['lc:hush']!(overlay);
  assert.deepEqual([page.voice.cancels, w.records()[0]!.requests[2]!['spoken'], w.records()[0]!.requests[2]!['spoken_pieces']], [2, 'attempted', { said: 0, of: 3 }], 'stopped before a piece of this reading was reported said');
  page.voice.spoken[4]!.end();
  assert.deepEqual(await again, NO, 'a piece that ends after it was stopped was not said to its end, and starts nothing');
  // An answer the overlay has not reported as shown is not read.
  const release = page.holdSubmitAck();
  page.question('And a third?');
  page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 4);
  w.fakes.last().answer('Not shown yet.');
  await until('recorded', () => w.records()[0]!.requests[3]!['outcome'] !== null);
  assert.deepEqual([await say(overlay, id, `${id}.4`, 0), w.records()[0]!.requests[3]!['shown'], 'spoken' in w.records()[0]!.requests[3]!, page.voice.spoken.length], [NO, false, false, 5]);
  release();
  await until('shown, then read', () => w.records()[0]!.requests[3]!['spoken'] === 'attempted');
  assert.equal(page.voice.spoken[5]!.text, 'Not shown yet.');
  page.click('interrupt');
  await settle();
  // The next Start has the rate; Talk is off again (silent by default).
  w.h.end('stopped by the test');
  await until('ended', () => w.h.current() === null, 5000);
  const next = await overlayPage(w.h, (await running(w.h)) as Session, POLICY, { voice: true });
  assert.deepEqual([next.talkState().talk, next.talkState().status], [false, null]);
  next.click('talk');
  assert.equal(next.talkState().rate, '0.7×');
});

test('[synthetic connector] the card\'s handle too moves the card and nothing else, in every mode, and its keys work; a second pointer, a cancelled pointer and a pointer taken away end or leave the drag as they should', async () => {
  const w = await app();
  const { page } = w;
  page.pointer('pointerdown', 1, 200, 300);
  for (const x of [240, 280]) page.pointer('pointermove', 1, x, 300);
  page.pointer('pointerup', 1, 280, 300);
  await page.review.pending();
  await w.select();
  const ink = () => JSON.stringify(page.review.state().doc.ink);
  const before = ink();
  const calls = w.fakes.last().calls.length;
  for (const m of ['WRITE', 'ASK', 'NAV'] as const) {
    page.press(m);
    const [hint, card] = [page.hint(), JSON.stringify(page.review.card())];
    dragBy(page, 'cardHandle', { x: page.box('card').left + 8, y: page.box('card').top + 8 }, { x: 308, y: 208 });
    await settle();
    assert.deepEqual(round(page.box('card')), [300, 200], m);
    assert.deepEqual([ink(), page.review.state().gesture, JSON.stringify(page.review.card()), page.hint(), page.ask().form, w.fakes.last().calls.length, w.records()[0]!.requests.length], [before, null, card, hint, true, calls, 1], `${m}: no ink, no selection, the same card and mode, nothing sent or asked beyond the circle's own request`);
    dragBy(page, 'cardHandle', { x: 308, y: 208 }, { x: 918, y: 558 });
    await settle();
  }
  // The keys on the card's handle.
  page.on('cardHandle', 'keydown', { key: 'ArrowLeft' });
  page.on('cardHandle', 'keydown', { key: 'ArrowUp' });
  assert.deepEqual(round(page.box('card')), [894, 534]);
  page.on('cardHandle', 'keydown', { key: 'Home' });
  await settle();
  assert.deepEqual([round(page.box('card')), w.stored().displays['display:1']!['caption']], [[910, 550], { fx: 1, fy: 1 }]);
  // A pointer that is not the primary one takes no hold.
  page.on('toolbarHandle', 'pointerdown', { x: 978, y: 18, primary: false });
  page.on('toolbarHandle', 'pointermove', { x: 500, y: 300 });
  assert.deepEqual([round(page.box('toolbar')), page.node('toolbarHandle').captured.size], [[970, 10], 0]);
  // While one pointer drags, another neither takes over nor moves the surface, and its release does not end the drag.
  page.on('toolbarHandle', 'pointerdown', { x: 978, y: 18, pointerId: 7 });
  page.on('toolbarHandle', 'pointerdown', { x: 100, y: 100, pointerId: 8 });
  page.on('toolbarHandle', 'pointermove', { x: 100, y: 100, pointerId: 8 });
  page.on('cardHandle', 'pointerdown', { x: 918, y: 558, pointerId: 8 }); // nor does another surface start moving
  page.on('cardHandle', 'pointermove', { x: 300, y: 300, pointerId: 8 });
  page.on('toolbarHandle', 'pointerup', { x: 100, y: 100, pointerId: 8 });
  assert.deepEqual([round(page.box('toolbar')), round(page.box('card'))], [[970, 10], [910, 550]]);
  page.on('toolbarHandle', 'pointermove', { x: 508, y: 308, pointerId: 7 });
  assert.deepEqual(round(page.box('toolbar')), [500, 300], 'the first pointer still has it');
  // The system cancels the pointer: the drag is over, the place is kept, a later move does nothing.
  page.on('toolbarHandle', 'pointercancel', { x: 508, y: 308, pointerId: 7 });
  await settle();
  page.on('toolbarHandle', 'pointermove', { x: 100, y: 100, pointerId: 7 });
  assert.deepEqual([round(page.box('toolbar')), round(cornerOf(w.stored().displays['display:1']!['toolbar']!, { width: 300, height: 50 }, { x: 10, y: 10, width: 1260, height: 740 }))], [[500, 300], [500, 300]]);
  // The pointer is taken away with no up at all (another window took it): the drag is over too, and in NAV the
  // apps have the pointer again.
  page.press('NAV');
  page.mouseMove(508, 308);
  page.on('toolbarHandle', 'pointerdown', { x: 508, y: 308 });
  page.on('toolbarHandle', 'pointermove', { x: 608, y: 408 });
  page.on('toolbarHandle', 'lostpointercapture', { x: 0, y: 0 });
  await settle();
  page.on('toolbarHandle', 'pointermove', { x: 100, y: 100 });
  page.mouseMove(50, 50);
  assert.deepEqual([round(page.box('toolbar')), page.interactive.at(-1)], [[600, 400], false]);
});

test('[synthetic connector, stand-in voice] an answer that Cancel crossed is not read; a cut piece ending late does not disturb the reading after it; a voice that rejects or throws is said as stopped, and a Stop still completes', async () => {
  const w = await app({ voice: true });
  const { page } = w;
  page.click('talk');
  // The circle's own response had left the main process when Cancel was pressed (before the card knew its request):
  // not shown, so not read.
  const release = page.holdSubmitAck();
  w.circle();
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.fakes.last().answer('Never shown, so never read.');
  await until('recorded', () => w.records()[0]!.requests[0]!['outcome'] !== null);
  page.click('askCancel');
  release();
  await until('said as cancelled', () => /^Cancelled/.test(page.ask().status ?? ''));
  assert.deepEqual([page.ask().answer, page.voice.spoken.length, page.talkState().interrupt, 'spoken' in w.records()[0]!.requests[0]!, w.records()[0]!.requests[0]!['shown']], [null, 0, false, false, false]);
  // A first reading is cut by a second request; the cut piece's late failure is nobody's.
  await w.ask('One. Two.');
  await w.ask('Alpha. Beta.');
  assert.deepEqual(page.voice.spoken.map((u) => u.text), ['One.', 'Alpha.']);
  page.voice.spoken[0]!.end(false);
  await settle();
  // (the first was stopped before any piece of it was reported said: attempted, not played help)
  assert.deepEqual([page.talkState().interrupt, page.talkState().status, w.records()[0]!.requests.slice(1).map((r) => r['spoken'])], [true, 'Reading the response aloud at 1.3× (part 1 of 2). The text below is what is read.', ['attempted', 'attempted']]);
  page.voice.spoken[1]!.end();
  await settle();
  page.voice.spoken[2]!.end();
  await settle();
  assert.deepEqual(w.records()[0]!.requests.slice(1).map((r) => [r['spoken'], r['spoken_pieces']]), [['attempted', { said: 0, of: 2 }], ['finished', { said: 2, of: 2 }]]);
  // The rate shown for the piece being read is the one it is read at; a change holds from the next piece.
  await w.ask('Paced one. Paced two.');
  page.click('faster');
  assert.deepEqual([page.talkState().rate, page.talkState().status], ['1.4×', 'Reading the response aloud at 1.3× (part 1 of 2). The text below is what is read.']);
  page.voice.spoken.at(-1)!.end();
  await settle();
  assert.deepEqual([page.voice.spoken.at(-1)!.rate, page.talkState().status], [1.4, 'Reading the response aloud at 1.4× (part 2 of 2). The text below is what is read.']);
  // The voice's promise is rejected at the second piece: said as stopped, the voice told to stop, recorded as
  // interrupted after the one piece it reported said, not left "Reading…".
  const stops = page.voice.cancels;
  page.voice.spoken.at(-1)!.end(Promise.reject(new Error('device lost')) as never);
  await settle();
  await settle();
  assert.deepEqual([page.talkState().interrupt, w.records()[0]!.requests.at(-1)!['spoken'], w.records()[0]!.requests.at(-1)!['spoken_pieces'], page.voice.cancels], [false, 'interrupted', { said: 1, of: 2 }, stops + 1]);
  assert.match(page.talkState().status ?? '', /^The voice stopped before the end; the response is shown as text\./);
  // What was said of that reading goes with its response: a new request, and a new card, do not carry it.
  page.question('And more?');
  page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 5);
  assert.equal(/voice stopped/.test(page.talkState().status ?? ''), false);
  w.fakes.last().answer('Next.');
  await until('answered', () => page.ask().answer === 'Next.');
  page.voice.spoken.at(-1)!.end(false);
  await settle();
  assert.match(page.talkState().status ?? '', /voice stopped/);
  await w.select(600, 120);
  assert.equal(/voice stopped/.test(page.talkState().status ?? ''), false);
  // A voice that throws when told to stop does not stop a Stop: the capture ends as it does otherwise.
  const t = await app({ voice: true });
  t.page.click('talk');
  await t.select();
  await t.ask('Being read when Stop comes.');
  t.page.breakVoice();
  t.h.end('stopped by the test');
  await until('ended', () => t.h.current() === null, 5000);
  assert.deepEqual([t.page.review.state().ended, t.page.talkState().interrupt], [true, false]);
  // A voice that throws when asked to say a piece: said as stopped, nothing left reading; a call that was only
  // attempted is recorded as that, never as played help.
  const y = await app({ voice: true });
  y.page.click('talk');
  await y.select();
  y.page.breakVoice();
  await y.ask('Cannot be said.');
  await settle();
  assert.deepEqual([y.page.talkState().interrupt, y.records()[0]!.requests[0]!['spoken'], y.records()[0]!.requests[0]!['spoken_pieces'], y.page.ask().answer], [false, 'attempted', { said: 0, of: 1 }, 'Cannot be said.']);
  assert.match(y.page.talkState().status ?? '', /^The voice stopped before the end/);
  // The page's own handling of a call that fails (the bridge itself): said as stopped, nothing left reading.
  const z = await app({ voice: true });
  z.page.click('talk');
  await z.select();
  z.h.handlers['lc:say'] = () => Promise.reject(new Error('the bridge failed'));
  await z.ask('The call fails.');
  await settle();
  assert.deepEqual([z.page.talkState().interrupt, z.page.voice.spoken.length], [false, 0]);
  assert.match(z.page.talkState().status ?? '', /^The voice stopped before the end/);
});

test('[synthetic connector] the Talk control never says it reads aloud when no voice is connected; a preferences file cut short is set aside so places can be kept again, and one of another format is left as it is', async () => {
  const none = await app();
  await none.select();
  assert.equal(none.page.talkLabel(), 'Talk is off: responses are shown as text only. Turning it on reads nothing aloud: no voice is connected in this build, so responses are not read aloud; they are shown as text.');
  none.page.click('talk');
  assert.equal(none.page.talkLabel(), 'Talk is on, but no voice is connected in this build, so responses are not read aloud; they are shown as text. Press to turn it off.');
  const some = await app({ voice: true });
  await some.select();
  assert.equal(some.page.talkLabel(), 'Talk is off: responses are shown as text only. Press to have them read aloud.');
  some.page.click('talk');
  assert.equal(some.page.talkLabel(), 'Talk is on: responses are read aloud. Press to turn it off.');
  some.page.click('mute');
  assert.equal(some.page.talkLabel(), 'Talk is on, muted: responses are shown as text and not read aloud. Press to turn Talk off.');
  // A place kept, then the rate changed, then another place: each keeps the other.
  dragBy(some.page, 'toolbarHandle', { x: 978, y: 18 }, { x: 18, y: 18 });
  await settle();
  some.page.click('faster');
  await settle();
  dragBy(some.page, 'cardHandle', { x: 918, y: 558 }, { x: 18, y: 18 });
  await settle();
  assert.deepEqual(some.stored(), { format: 'lc-windows-overlay-preferences/v1', displays: { 'display:1': { toolbar: { fx: 0, fy: 0 }, caption: { fx: 0, fy: 0 } } }, speech_rate: 1.4 });
  // Cut short (not JSON at all): set aside under another name, never deleted, and places are kept again.
  for (const torn of ['', '{"format":"lc-windows-overlay-pref']) {
    const seed = await app({ subscription: false });
    seed.h.end('stopped by the test');
    await until('ended', () => seed.h.current() === null, 5000);
    fs.writeFileSync(seed.file, torn);
    const h = harness({ userData: seed.h.userData });
    const page = await overlayPage(h, (await running(h)) as Session, POLICY);
    assert.deepEqual([fs.existsSync(seed.file), fs.readFileSync(`${seed.file}.unreadable`, 'utf8'), round(page.box('toolbar'))], [false, torn, [970, 10]]);
    dragBy(page, 'toolbarHandle', { x: 978, y: 18 }, { x: 18, y: 18 });
    await settle();
    assert.deepEqual([JSON.parse(fs.readFileSync(seed.file, 'utf8')).displays, /could not be kept/.test(page.hint() ?? '')], [{ 'display:1': { toolbar: { fx: 0, fy: 0 } } }, false]);
  }
  // Cut short a second time, and again: each is set aside under its own name; the ones before are never written over.
  const twice = await app({ subscription: false });
  twice.h.end('stopped by the test');
  await until('ended', () => twice.h.current() === null, 5000);
  const kept: string[] = [];
  for (let n = 1; n <= 9; n += 1) {
    const torn = `{"torn": ${n}`;
    fs.writeFileSync(twice.file, torn);
    const h = harness({ userData: twice.h.userData });
    const page = await overlayPage(h, (await running(h)) as Session, POLICY);
    if (n <= 8) kept.push(torn);
    const aside = ['', '-2', '-3', '-4', '-5', '-6', '-7', '-8'].map((x) => `${twice.file}.unreadable${x}`).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8'));
    assert.deepEqual(aside, kept, `corruption ${n}: every file set aside before is still what it was`);
    dragBy(page, 'toolbarHandle', { x: 978, y: 18 }, { x: 18, y: 18 });
    await settle();
    // While a name is free the place is kept again; with none free the torn file is left where it is, untouched, and that is said.
    assert.deepEqual([n <= 8 ? JSON.parse(fs.readFileSync(twice.file, 'utf8')).displays : fs.readFileSync(twice.file, 'utf8'), /could not be kept/.test(page.hint() ?? '')], n <= 8 ? [{ 'display:1': { toolbar: { fx: 0, fy: 0 } } }, false] : [torn, true]);
    h.end('stopped by the test');
    await until('ended', () => h.current() === null, 5000);
  }
});

test('[synthetic connector, stand-in voice] each piece is said in its language\'s voice; the overlay lost, or the app closing, stops and ends the voice; a voice that only synthesizes is said as a test voice and recorded as nothing read', async () => {
  const w = await app({ voice: true });
  const { page } = w;
  page.click('talk');
  await w.select();
  await w.ask('The slope is 2. 斜率是二。它过零点吗？ Yes.');
  for (let i = 0; i < 3; i += 1) {
    page.voice.spoken[i]!.end();
    await settle();
  }
  assert.deepEqual(page.voice.spoken.map((u) => [u.text, u.culture]), [['The slope is 2.', 'en-US'], ['斜率是二。', 'zh-CN'], ['它过零点吗？', 'zh-CN'], ['Yes.', 'en-US']]);
  assert.equal(page.talkState().status, 'Reading the response aloud at 1.3× (part 4 of 4). The text below is what is read.');
  // The overlay window is lost while a piece is being said: the voice is stopped by the main process itself.
  w.s.overlay.destroy();
  assert.deepEqual([w.h.current(), page.voice.cancels, w.records()[0]!.requests[0]!['spoken'], w.records()[0]!.requests[0]!['spoken_pieces']], [null, 1, 'interrupted', { said: 3, of: 4 }]);
  page.voice.spoken[3]!.end();
  await settle();
  assert.deepEqual([page.voice.spoken.length, w.records()[0]!.requests[0]!['spoken']], [4, 'interrupted'], 'its late end changes nothing');
  // With the session gone nothing is said, whoever asks.
  const id = (w.records()[0] as unknown as { selection_id: string }).selection_id;
  assert.deepEqual(plain(await w.h.handlers['lc:say']!({ sender: w.s.overlay.webContents }, id, `${id}.1`, 0)), { spoken: false });
  // The app closing ends the voice, and waits for that before it goes.
  assert.deepEqual([page.voice.disposed, w.h.quits.n], [0, 0]);
  w.h.app.quit();
  await until('the app quit', () => w.h.quits.n === 1, 5000);
  assert.equal(page.voice.disposed, 1);

  // A voice that only synthesizes (a test's): said as that on the card while it reads, and nothing is recorded as read aloud.
  const t = await app({ voice: 'silent' });
  assert.equal(t.page.talkLabel(), 'TEST VOICE, nothing is played: Talk is off: responses are shown as text only. Press to have them read aloud.');
  t.page.click('talk');
  assert.deepEqual([t.page.talkLabel(), t.page.talkState().status], ['TEST VOICE, nothing is played: Talk is on: responses are read aloud. Press to turn it off.', 'TEST VOICE, nothing is played: Talk is on: the response to your next request is read aloud at 1.3× and shown as text. Speaking to the AI is not connected in this build: type your question.']);
  await t.select();
  await t.ask('Synthesized only. Not played.');
  assert.deepEqual([t.page.voice.spoken.length, t.page.talkState().status, 'spoken' in t.records()[0]!.requests[0]!], [1, 'TEST VOICE, nothing is played: Reading the response aloud at 1.3× (part 1 of 2). The text below is what is read.', false]);
  t.page.voice.spoken[0]!.end();
  await settle();
  t.page.click('interrupt');
  t.page.voice.spoken[1]!.end();
  await settle();
  assert.deepEqual([t.page.voice.spoken.length, t.page.voice.cancels, 'spoken' in t.records()[0]!.requests[0]!], [2, 1, false]);
  await t.ask('Read to its end.');
  t.page.voice.spoken[2]!.end();
  await settle();
  assert.deepEqual([t.page.talkState().interrupt, t.records()[0]!.requests.map((r) => 'spoken' in r)], [false, [false, false]]);
  // No voice: the app closing waits for nothing of one.
  const none = await app({ subscription: false });
  none.h.app.quit();
  assert.equal(none.h.quits.n, 1);
  // A voice and nothing else to stop: the app still ends it before it goes.
  const only = await app({ subscription: false, voice: true });
  only.h.app.quit();
  assert.equal(only.h.quits.n, 0, 'it waits for the voice');
  await until('the app quit', () => only.h.quits.n === 1, 5000);
  assert.equal(only.page.voice.disposed, 1);
  // A voice whose end never comes, or throws, does not hold the app: it is waited for within its bound, and the
  // connector's own end is still waited for whatever the voice's comes to.
  for (const bad of ['never', 'throws', 'rejects'] as const) {
    const q = await app({ voice: true });
    const ends = { connector: false };
    q.h.connectVoice({ audible: true, say: async () => false, stop() {}, dispose: () => (bad === 'never' ? new Promise(() => undefined) : bad === 'throws' ? (() => { throw new Error('dispose failed (stand-in)'); })() : Promise.reject(new Error('dispose rejected (stand-in)'))) });
    q.fakes.last().endDelayMs = 60;
    q.fakes.last().once('exit', () => (ends.connector = true));
    q.h.app.quit();
    await settle();
    assert.deepEqual([q.h.quits.n, ends.connector], [0, false], `${bad}: the app has not gone while its connector is still ending`);
    if (bad === 'never') q.h.fire(5000); // the voice's own bound
    await until('the app quit', () => q.h.quits.n === 1, 5000);
    assert.equal(ends.connector, true, `${bad}: the connector's end was waited for`);
  }
});

test('[synthetic connector, stand-in voice] the main process itself keeps the order and stops the voice, whatever the page does: pieces in order only, and a Stop, a closed card and a follow-up each stop it there', async () => {
  // The page's own Talk stays off (it asks for nothing and stops nothing): only the main process is driven here.
  // (Talk is on in the main process when the circle is made, so its response is asked for as spoken.)
  const driven = async (text = 'One. Two. Three.') => {
    const w = await app({ voice: true });
    const overlay = { sender: w.s.overlay.webContents };
    w.h.handlers['lc:talk']!(overlay, true, false);
    await w.select();
    await w.ask(text);
    const id = (w.records()[0] as unknown as { selection_id: string }).selection_id;
    const say = async (...a: unknown[]): Promise<unknown> => plain(await w.h.handlers['lc:say']!(overlay, ...a));
    return { ...w, id, overlay, say };
  };
  const NO = { spoken: false };
  let w = await driven();
  assert.equal(w.page.voice.spoken.length, 0, 'the page asked for nothing');
  // In order only: a later piece first, a piece again, a piece skipped, a piece past the end.
  assert.deepEqual([await w.say(w.id, `${w.id}.1`, 1), await w.say(w.id, `${w.id}.9`, 0), await w.say(w.id, w.id, 0), w.page.voice.spoken.length], [NO, NO, NO, 0], 'not its first piece, or not its question');
  assert.deepEqual([plain(await w.h.handlers['lc:say']!({ sender: w.control.webContents }, w.id, `${w.id}.1`, 0)), plain(await w.h.handlers['lc:say']!({ sender: {} }, w.id, `${w.id}.1`, 0)), w.page.voice.spoken.length], [NO, NO, 0], 'only the overlay asks');
  const first = w.say(w.id, `${w.id}.1`, 0);
  await settle();
  w.page.voice.spoken[0]!.end();
  assert.deepEqual([await first, w.page.voice.spoken.map((u) => u.text)], [{ spoken: true }, ['One.']]);
  assert.deepEqual([await w.say(w.id, `${w.id}.1`, 0), await w.say(w.id, `${w.id}.1`, 2), await w.say(w.id, `${w.id}.1`, 3), w.page.voice.spoken.length], [NO, NO, NO, 1]);
  // Not the current selection, though the request is its last one.
  assert.deepEqual([await w.say('ask-0000000000000000', `${w.id}.1`, 1), w.page.voice.spoken.length], [NO, 1]);
  const second = w.say(w.id, `${w.id}.1`, 1);
  await settle();
  assert.deepEqual(w.page.voice.spoken.map((u) => u.text), ['One.', 'Two.']);
  // A Stop: the voice is stopped at once by the main process, before the overlay has answered anything, and no piece is said while the session ends.
  w.h.end('stopped by the test');
  assert.deepEqual([w.h.current() !== null, w.page.voice.cancels, w.records()[0]!.requests[0]!['spoken'], w.records()[0]!.requests[0]!['spoken_pieces']], [true, 1, 'interrupted', { said: 1, of: 3 }]);
  assert.deepEqual([await w.say(w.id, `${w.id}.1`, 0), w.page.voice.spoken.length], [NO, 2]);
  w.page.voice.spoken[1]!.end();
  assert.deepEqual(await second, NO);
  await until('ended', () => w.h.current() === null, 5000);
  // Talk turned off, as the main process is told: stopped there.
  w = await driven();
  void w.say(w.id, `${w.id}.1`, 0);
  await settle();
  w.h.handlers['lc:talk']!(w.overlay, false, false);
  assert.deepEqual([w.page.voice.cancels, w.records()[0]!.requests[0]!['spoken']], [1, 'attempted']);
  // Only a voice that reports exactly true said its piece to the end; a reading that failed is not taken up in the
  // middle, and a new one starts only from its first piece.
  w = await driven();
  const one = w.say(w.id, `${w.id}.1`, 0);
  await settle();
  w.page.voice.spoken[0]!.end();
  assert.deepEqual(await one, { spoken: true });
  const vague = w.say(w.id, `${w.id}.1`, 1);
  await settle();
  w.page.voice.spoken[1]!.end('yes' as never);
  assert.deepEqual([await vague, w.records()[0]!.requests[0]!['spoken'], w.records()[0]!.requests[0]!['spoken_pieces'], w.page.voice.cancels, await w.say(w.id, `${w.id}.1`, 1), await w.say(w.id, `${w.id}.1`, 2), w.page.voice.spoken.length], [NO, 'interrupted', { said: 1, of: 3 }, 1, NO, NO, 2]);
  void w.say(w.id, `${w.id}.1`, 0);
  await settle();
  assert.deepEqual(w.page.voice.spoken.map((u) => u.text), ['One.', 'Two.', 'One.']);
  // An answer once read to its end stays recorded as that, whatever a later reading of it comes to.
  w = await driven('Only one.');
  const whole = w.say(w.id, `${w.id}.1`, 0);
  await settle();
  w.page.voice.spoken[0]!.end();
  assert.deepEqual([await whole, w.records()[0]!.requests[0]!['spoken']], [{ spoken: true }, 'finished']);
  void w.say(w.id, `${w.id}.1`, 0);
  await settle();
  w.h.handlers['lc:hush']!(w.overlay);
  assert.deepEqual([w.page.voice.spoken.length, w.page.voice.cancels, w.records()[0]!.requests[0]!['spoken'], w.records()[0]!.requests[0]!['spoken_pieces']], [2, 1, 'finished', { said: 1, of: 1 }]);
  // The card closed (or replaced).
  w = await driven();
  void w.say(w.id, `${w.id}.1`, 0);
  await settle();
  w.h.handlers['lc:ask-closed']!(w.overlay);
  assert.deepEqual([w.page.voice.cancels, w.records()[0]!.requests[0]!['spoken']], [1, 'attempted']);
  // A follow-up about the same selection.
  w = await driven();
  void w.say(w.id, `${w.id}.1`, 0);
  await settle();
  await w.followUp();
  assert.deepEqual([w.page.voice.cancels, w.records()[0]!.requests[0]!['spoken']], [1, 'attempted']);
  // While that request is out, and after it was cancelled, nothing of the response before is read.
  assert.deepEqual([await w.say(w.id, `${w.id}.1`, 0), await w.say(w.id, `${w.id}.2`, 0)], [NO, NO]);
  w.h.handlers['lc:ask-cancel']!(w.overlay, w.id);
  await until('cancelled', () => w.records()[0]!.requests[1]!['outcome'] !== null);
  assert.deepEqual([await w.say(w.id, `${w.id}.1`, 0), await w.say(w.id, `${w.id}.2`, 0), w.page.voice.spoken.length], [NO, NO, 1]);
});

test('[synthetic connector, stand-in voice] a response is read only if it was asked for with Talk on: Talk turned on while a silent request is out, or after it, reads nothing and says nothing of a failure; the AI session ending stops a reading and nothing of it is read after', async () => {
  const w = await app({ voice: true });
  const { page } = w;
  const overlay = { sender: w.s.overlay.webContents };
  await w.select(); // asked for with Talk off: silent
  page.click('talk'); // turned on while that request is out
  await w.ask('Asked for as silent text.');
  await settle();
  assert.deepEqual([page.voice.spoken.length, page.talkState().interrupt, page.talkState().status, w.records()[0]!.requests[0]!['asked_as'], 'spoken' in w.records()[0]!.requests[0]!], [0, false, 'Talk is on: the response to your next request is read aloud at 1.3× and shown as text. Speaking to the AI is not connected in this build: type your question.', 'silent', false], 'not read, and not said as a voice that stopped');
  // The main process itself refuses to read it, whoever asks, though Talk is on there now.
  const id = (w.records()[0] as unknown as { selection_id: string }).selection_id;
  assert.deepEqual([plain(await w.h.handlers['lc:say']!(overlay, id, `${id}.1`, 0)), page.voice.spoken.length], [{ spoken: false }, 0]);
  // The next request is asked for as spoken, and read. The user stops the AI while it is being read: the voice is
  // stopped by the main process, and no piece of that response is said afterwards.
  await w.ask('Read aloud. Until the AI is stopped.');
  assert.deepEqual([page.voice.spoken.length, w.records()[0]!.requests[1]!['asked_as']], [1, 'spoken']);
  w.h.handlers['lc:live-stop']!({ sender: w.control.webContents });
  assert.deepEqual([page.voice.cancels, w.live().state], [1, 'ended']);
  page.voice.spoken[0]!.end();
  await settle();
  assert.deepEqual([plain(await w.h.handlers['lc:say']!(overlay, id, `${id}.2`, 0)), plain(await w.h.handlers['lc:say']!(overlay, id, `${id}.2`, 1)), page.voice.spoken.length, page.ask().answer], [{ spoken: false }, { spoken: false }, 1, 'Read aloud. Until the AI is stopped.'], 'the text stays on the card; nothing more of it is read');
  // Cancel pressed before the card knows its request (its acknowledgement is still on the way): the request is
  // interrupted as soon as it is known, and its response is never shown.
  const c = await app();
  const release = c.page.holdSubmitAck();
  c.circle();
  await until('sent', () => c.fakes.last().asks().length === 1);
  c.page.click('askCancel');
  release();
  await until('interrupted', () => c.fakes.last().count('companion/interrupt') === 1);
  await until('said as cancelled', () => /^Cancelled/.test(c.page.ask().status ?? ''));
  assert.deepEqual([c.page.ask().answer, c.records()[0]!.requests[0]!['shown']], [null, false]);
});
