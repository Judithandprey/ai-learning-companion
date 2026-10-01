// The overlay's movable surfaces and the response read aloud, through the app: the real main.ts and overlay.ts
// under the unit-test fakes. The toolbar and the card each have a handle; a drag moves the surface and nothing
// else; its place is kept per display and restored inside whatever the work area is. A response is silent text
// unless Talk is on; what is read aloud is the card's own text, and it stops at once when asked.
// SYNTHETIC: the connector is a stand-in, the display is a fake, and the voice is a stand-in that plays nothing (the
// product connects no voice in this build). No display, no audio device, no microphone, no Codex, no ChatGPT and
// no network are involved.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { harness, plain, quitLinks, running, settle, type FakeWindow, type Session } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { cornerOf } from '../src/shared/placement.ts';
import { connectorConfig, fakeConnectors, removeConfigs } from './subscription-fakes.ts';

after(quitLinks);
after(removeConfigs);
const POLICY = { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 };
const OVER = { x: 5000, y: 5000 };

/** The app with the subscription checked (signed in) and one overlay page; `subscription: false` leaves it off. */
async function app(o: { subscription?: boolean; userData?: string; /** a stand-in voice is connected */ voice?: boolean } = {}) {
  const fakes = fakeConnectors();
  const h = harness({ ...(o.subscription === false ? {} : { env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: fakes.spawn, request_ms: 500, ask_ms: 20_000, end_ms: 500 } }), ...(o.userData ? { userData: o.userData } : {}) });
  const s = await running(h);
  const control = h.control() as unknown as FakeWindow;
  if (o.subscription !== false) {
    h.handlers['lc:sub-check']!({ sender: control.webContents });
    await until('signed in', () => (plain(h.handlers['lc:sub-state']!({ sender: control.webContents })) as { state?: string }).state === 'signed_in', 3000);
  }
  const page = await overlayPage(h, s, POLICY, { voice: o.voice === true });
  page.scene.exactPng = true;
  const file = path.join(h.userData, 'overlay-preferences.json');
  const stored = (): { displays: Record<string, Record<string, { fx: number; fy: number }>>; speech_rate: number } => JSON.parse(fs.readFileSync(file, 'utf8')) as never;
  const select = async (x = 190, width = 210): Promise<void> => {
    page.press('ASK');
    page.pointer('pointerdown', 2, x, 95);
    for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]] as const) page.pointer('pointermove', 2, px, py);
    page.pointer('pointerup', 2, x + 2, 97);
    await until('the card', () => page.review.card()?.text.includes(`Region ${x - 8},87 `) === true && (o.subscription === false || page.ask().form));
  };
  const ask = async (text: string): Promise<void> => {
    const before = fakes.last().asks().length;
    page.click('askSubmit');
    await until('sent', () => fakes.last().asks().length === before + 1);
    await until('acknowledged', () => /^Asked at/.test(page.ask().status ?? ''));
    fakes.last().answer(text);
    await until('answered', () => page.ask().answer === text);
  };
  const records = (): Array<{ requests: Array<Record<string, unknown>> }> => {
    const dir = path.join(h.userData, 'captures', fs.readdirSync(path.join(h.userData, 'captures'))[0]!, 'asks');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
  };
  return { h, s, fakes, page, control, file, stored, select, ask, records };
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
  assert.deepEqual([round(page.box('card')), page.ask().form, page.review.card() !== null, w.fakes.last().calls.length, w.records()[0]!.requests.length], [[100, 100], true, true, sent, 0], 'moved; the card is as it was, and nothing was sent or asked');
  assert.deepEqual(w.stored().displays['display:1'], { caption: { fx: (100 - 10) / (1260 - 360), fy: (100 - 10) / (740 - 200) } });
  // The card's own controls work where it is: a question, its answer, another card in the same place.
  await w.ask('An answer on the moved card.');
  assert.deepEqual(round(page.box('card')), [100, 100]);
  await w.select(600, 120);
  assert.deepEqual(round(page.box('card')), [100, 100], 'the next card opens where the user keeps the card');
  // Moved while a question is out: the question is not cancelled and its answer is shown.
  page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  dragBy(page, 'cardHandle', { x: 108, y: 108 }, { x: 508, y: 308 });
  await settle();
  assert.equal(w.fakes.last().count('ask/cancel'), 0);
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
  // Without the subscription there is nothing to read, and no talk controls.
  const off = await app({ subscription: false });
  await off.select();
  assert.deepEqual([off.page.talkState().controls, off.page.talkState().status], [false, null]);
});

test('[synthetic connector, stand-in voice] a response is silent text unless Talk is on; with Talk on it is read from the card\'s own text, a piece at a time, at 1.3×, and recorded as read apart from shown', async () => {
  const w = await app({ voice: true });
  const { page } = w;
  await w.select();
  // The default: nothing is on, and an answer is not read.
  assert.deepEqual(page.talkState(), { controls: true, talk: false, muted: false, mute: false, interrupt: false, rate: null, status: null });
  await w.ask('Silent by default. It is only shown.');
  assert.deepEqual([page.voice.spoken.length, page.talkState().interrupt, 'spoken' in w.records()[0]!.requests[0]!], [0, false, false]);
  // Talk on: said, with what it does and what is not connected.
  page.click('talk');
  assert.deepEqual(page.talkState(), { controls: true, talk: true, muted: false, mute: true, interrupt: false, rate: '1.3×', status: 'Talk is on: the response to your next question is read aloud at 1.3× and shown as text. Speaking to the AI is not connected in this build: type your question.' });
  assert.equal(page.voice.spoken.length, 0, 'the answer already shown is not read: only a response to a question asked from now');
  const text = 'The slope is 2. So the line rises! Does it cross zero?';
  await w.ask(text);
  // One piece at a time; the rest is not handed to the voice until the piece before has ended.
  assert.deepEqual(page.voice.spoken.map((u) => [u.text, u.rate]), [['The slope is 2.', 1.3]]);
  assert.deepEqual([page.ask().answer, page.review.card() !== null], [text, true], 'the text that is read is on the card');
  assert.deepEqual([page.node('answerBox').revealed.at(-1), page.node('answerBox').revealed.length], ['start', 2], 'each response is brought into view on the card when it comes');
  assert.deepEqual([page.talkState().interrupt, page.talkState().status], [true, 'Reading the response aloud at 1.3× (part 1 of 3). The text below is what is read.']);
  assert.equal(w.records()[0]!.requests[1]!['spoken'], 'started');
  page.voice.spoken[0]!.end();
  await settle();
  assert.deepEqual([page.voice.spoken.length, page.voice.spoken[1]!.text, page.talkState().status], [2, 'So the line rises!', 'Reading the response aloud at 1.3× (part 2 of 3). The text below is what is read.']);
  page.voice.spoken[1]!.end();
  await settle();
  page.voice.spoken[2]!.end();
  await settle();
  assert.deepEqual([page.voice.spoken.map((u) => u.text).join(' '), page.talkState().interrupt, w.records()[0]!.requests[1]!['spoken'], page.voice.cancels], [text, false, 'finished', 0]);
  assert.deepEqual(w.records()[0]!.requests.map((r) => [r['shown'], r['spoken'] ?? null]), [[true, null], [true, 'finished']], 'read aloud is recorded apart from shown');
  // A refusal is brought into view too (its status), not the answer box.
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 3);
  w.fakes.last().fail(w.fakes.last().asks()[2]!.id, 'quota');
  await until('refused', () => /^No answer/.test(page.ask().status ?? ''));
  assert.deepEqual([page.node('askStatus').revealed.at(-1), page.node('answerBox').revealed.length], ['nearest', 2]);
  // The voice fails in the middle: said, recorded as interrupted, and the text stays.
  await w.ask('First piece. Second piece.');
  page.voice.spoken.at(-1)!.end(false);
  await settle();
  assert.deepEqual([page.voice.spoken.length, page.talkState().interrupt, w.records()[0]!.requests[3]!['spoken'], page.ask().answer], [4, false, 'interrupted', 'First piece. Second piece.']);
  assert.match(page.talkState().status ?? '', /^The voice stopped before the end; the response is shown as text\./);
});

test('[synthetic connector, stand-in voice] the voice stops at once, with everything not yet spoken: Stop reading, Mute, Talk off, closing the card, a new selection, a new question, Cancel and Stop', async () => {
  const text = 'One. Two. Three. Four.';
  const reading = async () => {
    const w = await app({ voice: true });
    await w.select();
    w.page.click('talk');
    await w.ask(text);
    assert.deepEqual([w.page.voice.spoken.length, w.page.talkState().interrupt], [1, true]);
    return w;
  };
  const stopped = async (w: Awaited<ReturnType<typeof reading>>, what: string, spoken = 'interrupted'): Promise<void> => {
    await settle();
    w.page.voice.spoken[0]!.end(); // the voice's own late end of the cut piece
    await settle();
    assert.deepEqual([w.page.voice.spoken.length, w.page.voice.cancels, w.page.talkState().interrupt], [1, 1, false], `${what}: told to stop once, and nothing more is handed to it`);
    if (spoken) assert.equal(w.records()[0]!.requests[0]!['spoken'], spoken, what);
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
  await w.ask('Muted answer.');
  assert.equal(w.page.voice.spoken.length, 1);
  w.page.click('mute');
  await w.ask('Read again.');
  assert.deepEqual([w.page.voice.spoken.length, w.page.voice.spoken[1]!.text], [2, 'Read again.']);
  // Talk off.
  w = await reading();
  w.page.click('talk');
  await stopped(w, 'Talk off');
  assert.deepEqual(w.page.talkState(), { controls: true, talk: false, muted: false, mute: false, interrupt: false, rate: null, status: null });
  // Closing the card: no response is read without its text on the screen.
  w = await reading();
  w.page.click('close');
  await stopped(w, 'the card closed');
  assert.equal(w.page.review.card(), null);
  // A new selection replaces the card.
  w = await reading();
  await w.select(600, 120);
  await stopped(w, 'a new selection', '');
  // A new question on the same card, and its Cancel.
  w = await reading();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  await stopped(w, 'a new question');
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

test('[synthetic connector, stand-in voice] the rate is the user\'s, inside its bounds, kept for the next Start; what the overlay says of reading is taken only for a shown answer of the current selection', async () => {
  const w = await app({ voice: true });
  const { page } = w;
  dragBy(page, 'toolbarHandle', { x: 978, y: 18 }, { x: 18, y: 18 }); // a place is kept first: the rate must not drop it
  await settle();
  await w.select();
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
  // What the overlay says of reading aloud is taken only from the overlay, for a shown answer of the current
  // selection, in the three words there are. (Tried while a reading is under way, so a taken word would change it.)
  const id = (w.records()[0] as unknown as { selection_id: string }).selection_id;
  const overlay = { sender: w.s.overlay.webContents };
  await w.ask('Being read now. Second piece.');
  assert.equal(w.records()[0]!.requests[1]!['spoken'], 'started');
  const before = JSON.stringify(w.records());
  w.h.handlers['lc:ask-spoken']!({ sender: w.control.webContents }, id, `${id}.2`, 'finished');
  w.h.handlers['lc:ask-spoken']!({ sender: {} }, id, `${id}.2`, 'interrupted');
  w.h.handlers['lc:ask-spoken']!(overlay, 'ask-0000000000000000', `${id}.2`, 'finished');
  w.h.handlers['lc:ask-spoken']!(overlay, id, `${id}.9`, 'finished');
  w.h.handlers['lc:ask-spoken']!(overlay, id, `${id}.2`, 'played');
  w.h.handlers['lc:ask-spoken']!(overlay, id, `${id}.1`, 'interrupted'); // one that was finished stays finished
  assert.equal(JSON.stringify(w.records()), before);
  page.click('interrupt');
  await settle();
  // An answer the overlay has not reported as shown cannot be recorded as read.
  const release = page.holdSubmitAck();
  page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 3);
  w.fakes.last().answer('Not shown yet.');
  await until('recorded', () => w.records()[0]!.requests[2]!['outcome'] !== null);
  w.h.handlers['lc:ask-spoken']!(overlay, id, `${id}.3`, 'started');
  assert.deepEqual([w.records()[0]!.requests[2]!['shown'], 'spoken' in w.records()[0]!.requests[2]!], [false, false]);
  release();
  await until('shown, then read', () => w.records()[0]!.requests[2]!['spoken'] === 'started');
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
    assert.deepEqual([ink(), page.review.state().gesture, JSON.stringify(page.review.card()), page.hint(), page.ask().form, w.fakes.last().calls.length, w.records()[0]!.requests.length], [before, null, card, hint, true, calls, 0], `${m}: no ink, no selection, the same card and mode, nothing sent or asked`);
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
  await w.select();
  page.click('talk');
  // The answer had left the main process when Cancel was pressed: not shown, so not read.
  const release = page.holdSubmitAck();
  page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.fakes.last().answer('Never shown, so never read.');
  await until('recorded', () => w.records()[0]!.requests[0]!['outcome'] !== null);
  page.click('askCancel');
  release();
  await until('said as cancelled', () => /^Cancelled/.test(page.ask().status ?? ''));
  assert.deepEqual([page.ask().answer, page.voice.spoken.length, page.talkState().interrupt, 'spoken' in w.records()[0]!.requests[0]!], [null, 0, false, false]);
  // A first reading is cut by a second question; the cut piece's late failure is nobody's.
  await w.ask('One. Two.');
  await w.ask('Alpha. Beta.');
  assert.deepEqual(page.voice.spoken.map((u) => u.text), ['One.', 'Alpha.']);
  page.voice.spoken[0]!.end(false);
  await settle();
  assert.deepEqual([page.talkState().interrupt, page.talkState().status, w.records()[0]!.requests.slice(1).map((r) => r['spoken'])], [true, 'Reading the response aloud at 1.3× (part 1 of 2). The text below is what is read.', ['interrupted', 'started']]);
  page.voice.spoken[1]!.end();
  await settle();
  page.voice.spoken[2]!.end();
  await settle();
  assert.deepEqual(w.records()[0]!.requests.slice(1).map((r) => r['spoken']), ['interrupted', 'finished']);
  // The rate shown for the piece being read is the one it is read at; a change holds from the next piece.
  await w.ask('Paced one. Paced two.');
  page.click('faster');
  assert.deepEqual([page.talkState().rate, page.talkState().status], ['1.4×', 'Reading the response aloud at 1.3× (part 1 of 2). The text below is what is read.']);
  page.voice.spoken.at(-1)!.end();
  await settle();
  assert.deepEqual([page.voice.spoken.at(-1)!.rate, page.talkState().status], [1.4, 'Reading the response aloud at 1.4× (part 2 of 2). The text below is what is read.']);
  // The voice's promise is rejected: said as stopped, recorded as interrupted, not left "Reading…".
  page.voice.spoken.at(-1)!.end(Promise.reject(new Error('device lost')) as never);
  await settle();
  await settle();
  assert.deepEqual([page.talkState().interrupt, w.records()[0]!.requests.at(-1)!['spoken']], [false, 'interrupted']);
  assert.match(page.talkState().status ?? '', /^The voice stopped before the end; the response is shown as text\./);
  // What was said of that reading goes with its response: a new question, and a new card, do not carry it.
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
  await t.select();
  t.page.click('talk');
  await t.ask('Being read when Stop comes.');
  t.page.breakVoice();
  t.h.end('stopped by the test');
  await until('ended', () => t.h.current() === null, 5000);
  assert.deepEqual([t.page.review.state().ended, t.page.talkState().interrupt], [true, false]);
  // A voice that throws when asked to say a piece: said as stopped, nothing left reading.
  const y = await app({ voice: true });
  await y.select();
  y.page.click('talk');
  y.page.breakVoice();
  await y.ask('Cannot be said.');
  await settle();
  assert.deepEqual([y.page.talkState().interrupt, y.records()[0]!.requests[0]!['spoken'], y.page.ask().answer], [false, 'interrupted', 'Cannot be said.']);
  assert.match(y.page.talkState().status ?? '', /^The voice stopped before the end/);
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
});
